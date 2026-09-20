"""
Representative route basket selection.

Selects which routes go into the price index and how much weight each one
carries, based on: importance_score (a proxy for traffic/frequency set at
seed time), how many valid observations exist for the route, and how many
airlines cover it (airline coverage). This mirrors the "selection_score"
concept from the spec (section 16): a transparent, explainable score rather
than a black box.
"""
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.models import Route, FareObservation, RoutesBasket


def compute_route_scores(db: Session, period: str) -> list[dict]:
    """
    Returns one dict per active route with its component scores and the
    combined selection_score, sorted descending.
    """
    routes = db.query(Route).filter(Route.is_active == True).all()  # noqa: E712

    obs_counts = dict(
        db.query(FareObservation.route_id, func.count(FareObservation.id))
        .group_by(FareObservation.route_id)
        .all()
    )
    airline_counts = dict(
        db.query(FareObservation.route_id, func.count(func.distinct(FareObservation.airline_id)))
        .group_by(FareObservation.route_id)
        .all()
    )

    max_obs = max(obs_counts.values(), default=1) or 1
    max_airlines = max(airline_counts.values(), default=1) or 1

    scored = []
    for route in routes:
        obs_n = obs_counts.get(route.id, 0)
        airline_n = airline_counts.get(route.id, 0)

        traffic_component = route.importance_score or 0.5
        coverage_component = obs_n / max_obs
        airline_component = airline_n / max_airlines

        # Weighted blend: traffic/importance matters most, then how well
        # observed the route is, then airline diversity.
        selection_score = (
            0.5 * traffic_component +
            0.3 * coverage_component +
            0.2 * airline_component
        )

        reasons = []
        if traffic_component >= 0.7:
            reasons.append("High route importance/traffic")
        if coverage_component >= 0.5:
            reasons.append("Good historical observation coverage")
        if airline_n >= 3:
            reasons.append("Multiple airlines covering this route")
        if not reasons:
            reasons.append("Included to maintain geographic/basket diversity")

        scored.append({
            "route_id": route.id,
            "origin": route.origin_airport.iata_code if route.origin_airport else None,
            "destination": route.destination_airport.iata_code if route.destination_airport else None,
            "traffic_component": round(traffic_component, 4),
            "coverage_component": round(coverage_component, 4),
            "airline_component": round(airline_component, 4),
            "selection_score": round(selection_score, 4),
            "observation_count": obs_n,
            "airline_count": airline_n,
            "reasons": reasons,
        })

    scored.sort(key=lambda r: r["selection_score"], reverse=True)
    return scored


def select_basket(db: Session, period: str, max_routes: int = 12) -> list[dict]:
    """
    Selects the top routes by selection_score, normalizes their scores into
    weights that sum to 1.0, persists the basket to routes_basket, and
    returns the basket rows (with weight) for immediate use by the index
    calculation.
    """
    scored = compute_route_scores(db, period)
    # Only include routes with at least some observations - an unobserved
    # route can't contribute a price relative.
    candidates = [r for r in scored if r["observation_count"] > 0][:max_routes]

    if not candidates:
        return []

    total_score = sum(r["selection_score"] for r in candidates) or 1.0
    for r in candidates:
        r["weight"] = round(r["selection_score"] / total_score, 6)

    # Persist basket for this period (auditability - spec section 42)
    db.query(RoutesBasket).filter(RoutesBasket.basket_period == period).delete()
    for r in candidates:
        db.add(RoutesBasket(
            route_id=r["route_id"],
            weight=r["weight"],
            selection_score=r["selection_score"],
            basket_period=period,
            selection_reason="; ".join(r["reasons"]),
            is_active=True,
        ))
    db.commit()

    return candidates

"""
Weighted fixed-basket airfare price index.

    price_relative(route) = current_period_avg_fare / base_period_avg_fare * 100
    index = SUM(route_weight * price_relative)   [weights normalized to sum to 1]
    base period index = 100

This is a PROTOTYPE methodology for demonstration purposes only - it is not
the official MoSPI CPI calculation (spec section 17).

Independent of FastAPI: callable from the API layer, the scheduler, the CLI,
or tests, per spec section 56.
"""
from datetime import datetime
from sqlalchemy.orm import Session
from app.models import (
    IndexValue, RouteIndexValue, AirlineIndexValue, FareObservation, Airline,
)
from app.index_engine.basket import select_basket
from app.index_engine.price_relative import average_fare_for_route_period, price_relative

METHODOLOGY_VERSION = "prototype-v1"
INDEX_NAME = "AIRINDEX_INDIA_NATIONAL"


def calculate_index(db: Session, base_period: str, calculation_period: str, max_routes: int = 12) -> dict:
    """
    Calculates the national index for `calculation_period` against
    `base_period`, decomposes it by route and by airline, and persists all
    of it (index_values, route_index_values, airline_index_values) so the
    calculation is auditable and reproducible (spec section 42).
    """
    basket = select_basket(db, calculation_period, max_routes=max_routes)

    route_contributions = []
    total_observations = 0

    for entry in basket:
        route_id = entry["route_id"]
        weight = entry["weight"]

        base_avg, base_n = average_fare_for_route_period(db, route_id, base_period)
        current_avg, current_n = average_fare_for_route_period(db, route_id, calculation_period)

        relative = price_relative(current_avg, base_avg)
        if relative is None:
            # No comparable base-period data for this route - exclude it
            # from this period's calculation rather than guessing.
            continue

        contribution = weight * relative
        total_observations += current_n

        route_contributions.append({
            "route_id": route_id,
            "origin": entry["origin"],
            "destination": entry["destination"],
            "weight": weight,
            "price_relative": round(relative, 4),
            "contribution": round(contribution, 4),
            "base_avg_fare": round(base_avg, 2) if base_avg else None,
            "current_avg_fare": round(current_avg, 2) if current_avg else None,
            "observation_count": current_n,
        })

    if not route_contributions:
        return {
            "index_value": None,
            "error": "No comparable route data available for the requested periods.",
        }

    # Re-normalize weights across routes that actually produced a valid
    # price relative (some may have been dropped above), so weights still
    # sum to 1 for the routes actually used.
    used_weight_total = sum(r["weight"] for r in route_contributions) or 1.0
    index_value = 0.0
    for r in route_contributions:
        normalized_weight = r["weight"] / used_weight_total
        r["normalized_weight"] = round(normalized_weight, 6)
        index_value += normalized_weight * r["price_relative"]

    data_quality_score = _data_quality_score(db, calculation_period, route_contributions)

    # Persist national index value
    index_row = IndexValue(
        index_name=INDEX_NAME,
        index_value=round(index_value, 4),
        base_period=base_period,
        calculation_period=calculation_period,
        route_count=len(route_contributions),
        observation_count=total_observations,
        data_quality_score=round(data_quality_score, 4),
        created_at=datetime.utcnow(),
    )
    db.add(index_row)

    # Persist per-route decomposition
    db.query(RouteIndexValue).filter(RouteIndexValue.period == calculation_period).delete()
    for r in route_contributions:
        db.add(RouteIndexValue(
            route_id=r["route_id"],
            period=calculation_period,
            index_value=round(r["price_relative"], 4),
            price_relative=round(r["price_relative"], 4),
            weight=r["normalized_weight"],
            contribution=round(r["normalized_weight"] * r["price_relative"], 4),
        ))

    # Per-airline contribution: weight each airline's observations within
    # the basket routes by how much fare data they contributed.
    airline_contribs = _airline_contributions(db, calculation_period, route_contributions, index_value)
    db.query(AirlineIndexValue).filter(AirlineIndexValue.period == calculation_period).delete()
    for a in airline_contribs:
        db.add(AirlineIndexValue(
            airline_id=a["airline_id"],
            period=calculation_period,
            index_value=round(a["contribution"], 4),
            contribution=round(a["contribution"], 4),
        ))

    db.commit()
    db.refresh(index_row)

    return {
        "index_value": round(index_value, 4),
        "base_period": base_period,
        "calculation_period": calculation_period,
        "route_count": len(route_contributions),
        "observation_count": total_observations,
        "data_quality_score": round(data_quality_score, 4),
        "methodology_version": METHODOLOGY_VERSION,
        "calculated_at": index_row.created_at.isoformat(),
        "route_contributions": route_contributions,
        "airline_contributions": airline_contribs,
    }


def _airline_contributions(db: Session, period: str, route_contributions: list[dict], index_value: float) -> list[dict]:
    route_ids = [r["route_id"] for r in route_contributions]
    if not route_ids:
        return []

    rows = (
        db.query(FareObservation.airline_id, FareObservation.route_id, FareObservation.observation_timestamp)
        .filter(FareObservation.route_id.in_(route_ids))
        .all()
    )
    matching = [(a, r) for a, r, ts in rows if ts is not None and f"{ts.year:04d}-{ts.month:02d}" == period]
    if not matching:
        return []

    route_weight = {r["route_id"]: r["normalized_weight"] for r in route_contributions}
    airline_ids = {a for a, _ in matching}

    airlines = {al.id: al for al in db.query(Airline).filter(Airline.id.in_(airline_ids)).all()}

    # Each airline's contribution = share of that airline's observations
    # within each route, scaled by that route's weight & price relative.
    from collections import defaultdict
    route_airline_counts = defaultdict(lambda: defaultdict(int))
    for airline_id, route_id in matching:
        route_airline_counts[route_id][airline_id] += 1

    airline_contribution = defaultdict(float)
    for r in route_contributions:
        route_id = r["route_id"]
        counts = route_airline_counts.get(route_id, {})
        total = sum(counts.values()) or 1
        route_contrib = route_weight[route_id] * r["price_relative"]
        for airline_id, count in counts.items():
            airline_contribution[airline_id] += route_contrib * (count / total)

    return [
        {
            "airline_id": airline_id,
            "airline_name": airlines[airline_id].name if airline_id in airlines else "Unknown",
            "contribution": round(contribution, 4),
        }
        for airline_id, contribution in sorted(airline_contribution.items(), key=lambda kv: -kv[1])
    ]


def _data_quality_score(db: Session, period: str, route_contributions: list[dict]) -> float:
    """
    Data-quality indicator stored alongside each index calculation
    (spec section 30) - NOT a statistical confidence interval.

    Delegates to the same computation the /api/data-quality endpoint uses,
    so the figure shown on the dashboard and the figure on the data-quality
    page are always the same number, then scales it by how well the basket
    routes themselves were observed in this particular period.
    """
    from app.index_engine.data_quality import compute_data_quality

    if not route_contributions:
        return 0.0

    overall = compute_data_quality(db)["overall_score"]

    obs_counts = [r["observation_count"] for r in route_contributions]
    avg_obs = sum(obs_counts) / len(obs_counts)
    # Saturating volume factor: 20+ observations per route/period is "full"
    volume_factor = min(avg_obs / 20.0, 1.0)

    return overall * volume_factor

"""
Data quality metrics (spec section 30).

A transparent, documented indicator - explicitly NOT a statistical
confidence interval.
"""
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.models import FareObservation, Route, Airline, SourceHealth


def compute_data_quality(db: Session) -> dict:
    total_routes = db.query(func.count(Route.id)).filter(Route.is_active == True).scalar() or 0  # noqa: E712
    routes_with_data = (
        db.query(func.count(func.distinct(FareObservation.route_id))).scalar() or 0
    )

    total_airlines = db.query(func.count(Airline.id)).filter(Airline.is_active == True).scalar() or 0  # noqa: E712
    airlines_with_data = (
        db.query(func.count(func.distinct(FareObservation.airline_id))).scalar() or 0
    )

    total_obs = db.query(func.count(FareObservation.id)).scalar() or 0
    valid_obs = (
        db.query(func.count(FareObservation.id))
        .filter(FareObservation.validation_status == "VALID")
        .scalar() or 0
    )
    invalid_obs = total_obs - valid_obs

    sources = db.query(SourceHealth).all()
    if sources:
        source_availability = sum(1 for s in sources if s.status == "ACTIVE") / len(sources)
    else:
        source_availability = 1.0  # no sources registered yet = nothing failing

    route_coverage = (routes_with_data / total_routes) if total_routes else 0.0
    airline_coverage = (airlines_with_data / total_airlines) if total_airlines else 0.0
    validation_rate = (valid_obs / total_obs) if total_obs else 0.0
    missing_data_rate = (invalid_obs / total_obs) if total_obs else 0.0

    overall = (
        0.3 * route_coverage +
        0.2 * airline_coverage +
        0.2 * source_availability +
        0.3 * validation_rate
    )

    return {
        "observation_coverage": round(validation_rate, 4),
        "route_coverage": round(route_coverage, 4),
        "airline_coverage": round(airline_coverage, 4),
        "source_availability": round(source_availability, 4),
        "missing_data_rate": round(missing_data_rate, 4),
        "validation_rate": round(validation_rate, 4),
        "overall_score": round(overall, 4),
        "total_observations": total_obs,
        "total_routes": total_routes,
        "total_airlines": total_airlines,
    }

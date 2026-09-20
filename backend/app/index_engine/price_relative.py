"""
Price relative calculation.

price_relative = (average comparable fare in current period / average
comparable fare in base period) * 100

"Comparable" means same fare class; we average across airlines and booking
windows within the period to get one representative fare per route per
period, per spec section 14 (fare comparability) and section 17.
"""
from sqlalchemy.orm import Session
from app.models import FareObservation

FARE_CLASS = "ECONOMY_STANDARD"


def average_fare_for_route_period(db: Session, route_id: int, period: str, fare_class: str = FARE_CLASS):
    """
    period is 'YYYY-MM'. Averages total_fare across all valid, non-critical
    observations for that route whose observation_timestamp falls in that
    calendar month. Filtered in Python for DB portability (SQLite in tests,
    Postgres in production).
    """
    rows = (
        db.query(FareObservation.total_fare, FareObservation.observation_timestamp)
        .filter(
            FareObservation.route_id == route_id,
            FareObservation.fare_class == fare_class,
            FareObservation.is_valid == True,  # noqa: E712
            FareObservation.anomaly_status != "CRITICAL_ANOMALY",
        )
        .all()
    )

    matching = [fare for fare, ts in rows if ts is not None and f"{ts.year:04d}-{ts.month:02d}" == period]

    if not matching:
        return None, 0
    return sum(matching) / len(matching), len(matching)


def price_relative(current_avg, base_avg):
    if base_avg is None or base_avg == 0 or current_avg is None:
        return None
    return (current_avg / base_avg) * 100.0

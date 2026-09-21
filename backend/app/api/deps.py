"""Shared helpers used across API routers."""
from sqlalchemy.orm import Session
from app.models import FareObservation, IndexValue
from app.index_engine.index import calculate_index

DATA_MODE = "DEMONSTRATION DATA"


def available_periods(db: Session) -> list[str]:
    """All calendar months (YYYY-MM) that have fare observations, sorted."""
    timestamps = db.query(FareObservation.observation_timestamp).distinct().all()
    return sorted({f"{ts.year:04d}-{ts.month:02d}" for (ts,) in timestamps if ts is not None})


def index_for_period(db: Session, base_period: str, period: str) -> IndexValue | None:
    """Fetch a stored index value, calculating it on demand if absent."""
    row = (
        db.query(IndexValue)
        .filter(IndexValue.calculation_period == period, IndexValue.base_period == base_period)
        .order_by(IndexValue.created_at.desc())
        .first()
    )
    if row:
        return row

    result = calculate_index(db, base_period=base_period, calculation_period=period)
    if result.get("index_value") is None:
        return None
    return (
        db.query(IndexValue)
        .filter(IndexValue.calculation_period == period, IndexValue.base_period == base_period)
        .order_by(IndexValue.created_at.desc())
        .first()
    )


def latest_index(db: Session) -> IndexValue | None:
    periods = available_periods(db)
    if not periods:
        return None
    return index_for_period(db, periods[0], periods[-1])

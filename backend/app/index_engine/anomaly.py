"""
Anomaly detection using IQR and Z-score methods (spec section 13).

Anomalies are flagged, never silently deleted - the original observation
stays in fare_observations with anomaly_status set, and a row is added to
the anomalies table for audit/review (spec section 25).

Fares are compared within (route, booking-window bucket) groups, not raw
across a whole route. Fare varies systematically with days-to-departure
(spec section 15), so comparing a 7-day-out fare against a 90-day-out fare
as if they came from one distribution produces false positives on a third
of all data. Bucketing first ensures we compare like-for-like fares.
"""
import statistics
from sqlalchemy.orm import Session
from app.models import FareObservation, Anomaly

SEVERITY_THRESHOLDS = [
    (3.5, "CRITICAL_ANOMALY"),
    (3.0, "HIGH_ANOMALY"),
    (2.5, "LOW_ANOMALY"),
]

BOOKING_WINDOW_BUCKETS = [
    (90, float("inf"), "90+"),
    (60, 89, "60-89"),
    (30, 59, "30-59"),
    (15, 29, "15-29"),
    (8, 14, "8-14"),
    (1, 7, "1-7"),
]


def booking_window_bucket(days_to_departure: int) -> str:
    for lo, hi, label in BOOKING_WINDOW_BUCKETS:
        if lo <= days_to_departure <= hi:
            return label
    return "unknown"


def detect_anomalies_for_route(db: Session, route_id: int) -> list[dict]:
    """
    Runs IQR + Z-score detection per (route, booking-window bucket) group
    and flags outliers. Returns the list of newly-flagged anomalies.
    """
    observations = (
        db.query(FareObservation)
        .filter(FareObservation.route_id == route_id, FareObservation.is_valid == True)  # noqa: E712
        .all()
    )

    groups: dict[str, list[FareObservation]] = {}
    for obs in observations:
        if obs.total_fare is None or obs.days_to_departure is None:
            continue
        bucket = booking_window_bucket(obs.days_to_departure)
        groups.setdefault(bucket, []).append(obs)

    flagged = []
    for bucket, group_obs in groups.items():
        fares = [o.total_fare for o in group_obs]
        if len(fares) < 5:
            continue

        sorted_fares = sorted(fares)
        q1 = _percentile(sorted_fares, 25)
        q3 = _percentile(sorted_fares, 75)
        iqr = q3 - q1
        lower_bound = q1 - 1.5 * iqr
        upper_bound = q3 + 1.5 * iqr

        mean = statistics.mean(fares)
        stdev = statistics.pstdev(fares) or 1.0

        for obs in group_obs:
            is_iqr_outlier = obs.total_fare < lower_bound or obs.total_fare > upper_bound
            z_score = (obs.total_fare - mean) / stdev

            if not is_iqr_outlier and abs(z_score) < SEVERITY_THRESHOLDS[-1][0]:
                if obs.anomaly_status != "NORMAL":
                    obs.anomaly_status = "NORMAL"
                continue

            severity = _classify_severity(abs(z_score)) if abs(z_score) >= SEVERITY_THRESHOLDS[-1][0] else "LOW_ANOMALY"
            expected = mean
            deviation_pct = ((obs.total_fare - expected) / expected * 100) if expected else 0.0

            obs.anomaly_status = severity
            algorithm = "Z_SCORE" if abs(z_score) >= SEVERITY_THRESHOLDS[-1][0] else "IQR"

            existing = (
                db.query(Anomaly)
                .filter(Anomaly.fare_observation_id == obs.id, Anomaly.status == "PENDING")
                .first()
            )
            if existing:
                existing.expected_value = round(expected, 2)
                existing.actual_value = obs.total_fare
                existing.deviation = round(deviation_pct, 2)
                existing.severity = severity
                existing.algorithm = algorithm
            else:
                anomaly = Anomaly(
                    fare_observation_id=obs.id,
                    route_id=route_id,
                    algorithm=algorithm,
                    expected_value=round(expected, 2),
                    actual_value=obs.total_fare,
                    deviation=round(deviation_pct, 2),
                    severity=severity,
                    status="PENDING",
                )
                db.add(anomaly)
                flagged.append(anomaly)

    db.commit()
    return flagged


def detect_anomalies_all_routes(db: Session) -> int:
    from app.models import Route
    route_ids = [r.id for r in db.query(Route.id).filter(Route.is_active == True).all()]  # noqa: E712
    total = 0
    for route_id in route_ids:
        total += len(detect_anomalies_for_route(db, route_id))
    return total


def _classify_severity(abs_z: float) -> str:
    for threshold, label in SEVERITY_THRESHOLDS:
        if abs_z >= threshold:
            return label
    return "LOW_ANOMALY"


def _percentile(sorted_values: list[float], pct: float) -> float:
    if not sorted_values:
        return 0.0
    k = (len(sorted_values) - 1) * (pct / 100.0)
    f = int(k)
    c = min(f + 1, len(sorted_values) - 1)
    if f == c:
        return sorted_values[f]
    return sorted_values[f] + (sorted_values[c] - sorted_values[f]) * (k - f)

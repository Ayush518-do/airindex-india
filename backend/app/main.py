from datetime import datetime, timedelta
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.config import settings
from app.database import init_db, get_db
from app.synthetic_data import seed_reference_data, generate_synthetic_observations
from app.models import (
    Airport, Airline, Route, FareObservation, IndexValue, RouteIndexValue,
    AirlineIndexValue, Anomaly, SourceHealth, Event,
)
from app.index_engine.index import calculate_index, INDEX_NAME
from app.index_engine.anomaly import detect_anomalies_all_routes, booking_window_bucket
from app.index_engine.data_quality import compute_data_quality
from app.index_engine.basket import select_basket

app = FastAPI(
    title=settings.api_title,
    version=settings.api_version,
    openapi_url="/openapi.json",
    docs_url="/docs",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DATA_MODE = "DEMONSTRATION DATA"


def _available_periods(db: Session) -> list[str]:
    """All calendar months (YYYY-MM) that have fare observations, sorted."""
    timestamps = db.query(FareObservation.observation_timestamp).distinct().all()
    periods = sorted({f"{ts.year:04d}-{ts.month:02d}" for (ts,) in timestamps if ts is not None})
    return periods


def _ensure_index_calculated(db: Session) -> IndexValue | None:
    """
    Returns the most recent IndexValue, calculating it first if one doesn't
    exist yet for the latest available period.
    """
    periods = _available_periods(db)
    if not periods:
        return None
    base_period, current_period = periods[0], periods[-1]

    latest = (
        db.query(IndexValue)
        .filter(IndexValue.calculation_period == current_period, IndexValue.base_period == base_period)
        .order_by(IndexValue.created_at.desc())
        .first()
    )
    if latest:
        return latest

    result = calculate_index(db, base_period=base_period, calculation_period=current_period)
    if result.get("index_value") is None:
        return None
    return (
        db.query(IndexValue)
        .filter(IndexValue.calculation_period == current_period, IndexValue.base_period == base_period)
        .order_by(IndexValue.created_at.desc())
        .first()
    )


@app.on_event("startup")
async def startup_event():
    try:
        init_db()
        seed_reference_data()
        generate_synthetic_observations()

        db = next(get_db())
        try:
            detect_anomalies_all_routes(db)
            _ensure_index_calculated(db)
            for source_name in ("SYNTHETIC", "DEMO"):
                existing = db.query(SourceHealth).filter(SourceHealth.source == source_name).first()
                if not existing:
                    db.add(SourceHealth(
                        source=source_name,
                        last_successful_run=datetime.utcnow(),
                        success_rate=1.0,
                        records_last_run=db.query(func.count(FareObservation.id)).scalar() or 0,
                        status="ACTIVE",
                    ))
            db.commit()
        finally:
            db.close()

        print("Startup complete: database initialized, data seeded, index calculated")
    except Exception as e:
        print(f"Startup error: {e}")


@app.get("/health")
async def health():
    return {"status": "ok", "service": "AIRINDEX INDIA"}


@app.get("/api/dashboard/summary")
async def dashboard_summary(db: Session = Depends(get_db)):
    latest = _ensure_index_calculated(db)
    if latest is None:
        raise HTTPException(status_code=503, detail="Index not yet available. No fare observations found.")

    periods = _available_periods(db)
    prior_value = None
    if len(periods) >= 2:
        base_period, prior_period = periods[0], periods[-2]
        prior = (
            db.query(IndexValue)
            .filter(IndexValue.calculation_period == prior_period, IndexValue.base_period == base_period)
            .order_by(IndexValue.created_at.desc())
            .first()
        )
        if prior is None:
            # Not calculated yet (e.g. dashboard opened before any other
            # endpoint touched this period) - calculate it now rather than
            # silently reporting no change.
            result = calculate_index(db, base_period=base_period, calculation_period=prior_period)
            prior_value = result.get("index_value")
        else:
            prior_value = prior.index_value

    index_change = None
    if prior_value:
        index_change = round((latest.index_value - prior_value) / prior_value * 100, 2)

    quality = compute_data_quality(db)

    return {
        "current_index": latest.index_value,
        "index_change": index_change,
        "routes_covered": latest.route_count,
        "airlines_covered": quality["total_airlines"],
        "observations_count": latest.observation_count,
        "data_quality_score": latest.data_quality_score,
        "last_updated": latest.created_at.isoformat(),
        "base_period": latest.base_period,
        "calculation_period": latest.calculation_period,
        "data_mode": DATA_MODE,
    }


@app.get("/api/index/current")
async def get_current_index(db: Session = Depends(get_db)):
    latest = _ensure_index_calculated(db)
    if latest is None:
        raise HTTPException(status_code=503, detail="Index not yet available.")
    return {
        "index_value": latest.index_value,
        "base_period": latest.base_period,
        "calculation_period": latest.calculation_period,
        "route_count": latest.route_count,
        "observation_count": latest.observation_count,
        "data_quality_score": latest.data_quality_score,
        "last_updated": latest.created_at.isoformat(),
        "methodology_note": "PROTOTYPE index for demonstration only - not the official MoSPI CPI methodology.",
    }


@app.get("/api/index/history")
async def get_index_history(db: Session = Depends(get_db)):
    _ensure_index_calculated(db)
    periods = _available_periods(db)
    if not periods:
        return {"periods": [], "values": []}
    base_period = periods[0]

    values = []
    for period in periods:
        row = (
            db.query(IndexValue)
            .filter(IndexValue.calculation_period == period, IndexValue.base_period == base_period)
            .order_by(IndexValue.created_at.desc())
            .first()
        )
        if not row:
            result = calculate_index(db, base_period=base_period, calculation_period=period)
            if result.get("index_value") is None:
                continue
            row = (
                db.query(IndexValue)
                .filter(IndexValue.calculation_period == period, IndexValue.base_period == base_period)
                .order_by(IndexValue.created_at.desc())
                .first()
            )
        if row:
            values.append((period, row.index_value))

    return {
        "periods": [p for p, _ in values],
        "values": [v for _, v in values],
        "base_period": base_period,
    }


@app.post("/api/index/simulate")
async def simulate_index(
    base_period: str,
    calculation_period: str,
    max_routes: int = 12,
    db: Session = Depends(get_db),
):
    """Index Methodology Simulator (spec section 31) - recalculates without persisting as the canonical value."""
    result = calculate_index(db, base_period=base_period, calculation_period=calculation_period, max_routes=max_routes)
    if result.get("index_value") is None:
        raise HTTPException(status_code=400, detail=result.get("error", "Unable to calculate index for given periods."))
    return result


@app.get("/api/routes")
async def get_routes(db: Session = Depends(get_db)):
    latest = _ensure_index_calculated(db)
    routes = db.query(Route).filter(Route.is_active == True).all()  # noqa: E712

    route_index_rows = {}
    if latest:
        rows = db.query(RouteIndexValue).filter(RouteIndexValue.period == latest.calculation_period).all()
        route_index_rows = {r.route_id: r for r in rows}

    result = []
    for route in routes:
        riv = route_index_rows.get(route.id)
        result.append({
            "id": route.id,
            "origin": route.origin_airport.iata_code if route.origin_airport else None,
            "destination": route.destination_airport.iata_code if route.destination_airport else None,
            "region": route.region,
            "distance_km": round(route.distance_km, 1) if route.distance_km else None,
            "index": riv.index_value if riv else None,
            "weight": riv.weight if riv else None,
            "contribution": riv.contribution if riv else None,
        })
    return {"total": len(result), "routes": result}


@app.get("/api/routes/{route_id}/history")
async def get_route_history(route_id: int, db: Session = Depends(get_db)):
    route = db.get(Route, route_id)
    if not route:
        raise HTTPException(status_code=404, detail="Route not found")

    riv_rows = (
        db.query(RouteIndexValue)
        .filter(RouteIndexValue.route_id == route_id)
        .order_by(RouteIndexValue.period.asc())
        .all()
    )
    return {
        "route_id": route_id,
        "origin": route.origin_airport.iata_code if route.origin_airport else None,
        "destination": route.destination_airport.iata_code if route.destination_airport else None,
        "periods": [r.period for r in riv_rows],
        "index_values": [r.index_value for r in riv_rows],
        "price_relatives": [r.price_relative for r in riv_rows],
    }


@app.get("/api/routes/basket")
async def get_route_basket(db: Session = Depends(get_db)):
    """Shows why each route was selected (spec section 16)."""
    periods = _available_periods(db)
    if not periods:
        return {"basket": []}
    basket = select_basket(db, periods[-1])
    return {"period": periods[-1], "basket": basket}


@app.get("/api/airlines")
async def get_airlines(db: Session = Depends(get_db)):
    airlines = db.query(Airline).filter(Airline.is_active == True).all()  # noqa: E712
    periods = _available_periods(db)
    latest_period = periods[-1] if periods else None

    contrib_by_airline = {}
    if latest_period:
        rows = db.query(AirlineIndexValue).filter(AirlineIndexValue.period == latest_period).all()
        contrib_by_airline = {r.airline_id: r.contribution for r in rows}

    return {
        "total": len(airlines),
        "airlines": [
            {
                "id": a.id,
                "iata_code": a.iata_code,
                "name": a.name,
                "contribution": contrib_by_airline.get(a.id),
            }
            for a in airlines
        ],
    }


@app.get("/api/anomalies")
async def get_anomalies(severity: str | None = None, db: Session = Depends(get_db)):
    detect_anomalies_all_routes(db)

    query = db.query(Anomaly)
    if severity:
        query = query.filter(Anomaly.severity == severity.upper())
    # Surface the most extreme deviations across the whole network first,
    # rather than whichever route happened to be processed last.
    anomalies = query.order_by(func.abs(Anomaly.deviation).desc()).limit(50).all()

    result = []
    for a in anomalies:
        obs = db.get(FareObservation, a.fare_observation_id)
        route = db.get(Route, a.route_id) if a.route_id else None
        result.append({
            "id": a.id,
            "route": f"{route.origin_airport.iata_code}-{route.destination_airport.iata_code}" if route else None,
            "fare": a.actual_value,
            "expected": a.expected_value,
            "deviation": a.deviation,
            "severity": a.severity,
            "status": a.status,
            "algorithm": a.algorithm,
            "detected_at": a.detected_at.isoformat() if a.detected_at else None,
        })
    return {"total": len(result), "anomalies": result}


@app.post("/api/anomalies/{anomaly_id}/review")
async def review_anomaly(anomaly_id: int, status: str, db: Session = Depends(get_db)):
    anomaly = db.get(Anomaly, anomaly_id)
    if not anomaly:
        raise HTTPException(status_code=404, detail="Anomaly not found")
    valid_statuses = {"REVIEWED", "VALID_ANOMALY", "INVALID_OBSERVATION"}
    if status.upper() not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"status must be one of {valid_statuses}")
    anomaly.status = status.upper()
    db.commit()
    return {"id": anomaly.id, "status": anomaly.status}


@app.get("/api/data-quality")
async def get_data_quality(db: Session = Depends(get_db)):
    return compute_data_quality(db)


@app.get("/api/source-health")
async def get_source_health(db: Session = Depends(get_db)):
    sources = db.query(SourceHealth).all()
    return {
        "sources": [
            {
                "name": s.source,
                "status": s.status,
                "last_successful_run": s.last_successful_run.isoformat() if s.last_successful_run else None,
                "last_failed_run": s.last_failed_run.isoformat() if s.last_failed_run else None,
                "success_rate": s.success_rate,
                "records_last_run": s.records_last_run,
            }
            for s in sources
        ]
    }


@app.get("/api/events")
async def get_events(db: Session = Depends(get_db)):
    events = db.query(Event).all()
    return {
        "total": len(events),
        "events": [
            {
                "id": e.id,
                "name": e.name,
                "event_type": e.event_type,
                "start_date": e.start_date,
                "end_date": e.end_date,
                "region": e.region,
            }
            for e in events
        ],
    }


@app.post("/api/admin/recalculate-index")
async def admin_recalculate_index(db: Session = Depends(get_db)):
    """Admin: force recalculation of the current index (spec section 41)."""
    periods = _available_periods(db)
    if not periods:
        raise HTTPException(status_code=503, detail="No fare data available.")
    base_period, current_period = periods[0], periods[-1]
    result = calculate_index(db, base_period=base_period, calculation_period=current_period)
    if result.get("index_value") is None:
        raise HTTPException(status_code=400, detail=result.get("error"))
    return result


@app.post("/api/admin/detect-anomalies")
async def admin_detect_anomalies(db: Session = Depends(get_db)):
    count = detect_anomalies_all_routes(db)
    return {"newly_flagged": count}


@app.get("/api/booking-window")
async def get_booking_window(route_id: int | None = None, db: Session = Depends(get_db)):
    """
    Average fare by booking-window bucket (spec section 15/24). Shows the
    classic curve: fares rise as departure approaches.
    """
    query = db.query(FareObservation).filter(FareObservation.is_valid == True)  # noqa: E712
    if route_id:
        query = query.filter(FareObservation.route_id == route_id)
    observations = query.all()

    buckets: dict[str, list[float]] = {}
    for obs in observations:
        if obs.days_to_departure is None or obs.total_fare is None:
            continue
        label = booking_window_bucket(obs.days_to_departure)
        buckets.setdefault(label, []).append(obs.total_fare)

    order = ["90+", "60-89", "30-59", "15-29", "8-14", "1-7"]
    return {
        "route_id": route_id,
        "buckets": [
            {
                "bucket": label,
                "average_fare": round(sum(buckets[label]) / len(buckets[label]), 2),
                "observation_count": len(buckets[label]),
            }
            for label in order
            if label in buckets
        ],
    }


@app.get("/api/booking-window/heatmap")
async def get_booking_window_heatmap(db: Session = Depends(get_db)):
    """Per-route average fare across booking-window buckets (spec section 24)."""
    latest = _ensure_index_calculated(db)
    if latest is None:
        return {"routes": [], "buckets": []}

    basket_route_ids = [
        r.route_id for r in
        db.query(RouteIndexValue).filter(RouteIndexValue.period == latest.calculation_period).all()
    ]
    if not basket_route_ids:
        return {"routes": [], "buckets": []}

    observations = (
        db.query(FareObservation)
        .filter(FareObservation.route_id.in_(basket_route_ids), FareObservation.is_valid == True)  # noqa: E712
        .all()
    )

    grid: dict[int, dict[str, list[float]]] = {}
    for obs in observations:
        if obs.days_to_departure is None or obs.total_fare is None:
            continue
        label = booking_window_bucket(obs.days_to_departure)
        grid.setdefault(obs.route_id, {}).setdefault(label, []).append(obs.total_fare)

    order = ["90+", "60-89", "30-59", "15-29", "8-14", "1-7"]
    rows = []
    for route_id, buckets in grid.items():
        route = db.get(Route, route_id)
        if not route:
            continue
        rows.append({
            "route_id": route_id,
            "route": f"{route.origin_airport.iata_code}-{route.destination_airport.iata_code}",
            "values": {
                label: round(sum(v) / len(v)) for label, v in buckets.items()
            },
        })
    rows.sort(key=lambda r: r["route"])
    return {"buckets": order, "routes": rows}


@app.get("/api/regions")
async def get_regions(db: Session = Depends(get_db)):
    """Regional airfare index (spec section 21), by route origin region."""
    latest = _ensure_index_calculated(db)
    if latest is None:
        return {"regions": []}

    riv_rows = (
        db.query(RouteIndexValue)
        .filter(RouteIndexValue.period == latest.calculation_period)
        .all()
    )

    by_region: dict[str, list[tuple[float, float]]] = {}
    for riv in riv_rows:
        route = db.get(Route, riv.route_id)
        if not route or not route.region:
            continue
        by_region.setdefault(route.region, []).append((riv.price_relative, riv.weight))

    regions = []
    for region, entries in by_region.items():
        weight_total = sum(w for _, w in entries) or 1.0
        weighted = sum(pr * w for pr, w in entries) / weight_total
        regions.append({
            "region": region,
            "index_value": round(weighted, 2),
            "route_count": len(entries),
        })
    regions.sort(key=lambda r: -r["index_value"])
    return {"period": latest.calculation_period, "regions": regions}


@app.get("/api/routes/{route_id}")
async def get_route_detail(route_id: int, db: Session = Depends(get_db)):
    """Route drill-down (spec section 37)."""
    route = db.get(Route, route_id)
    if not route:
        raise HTTPException(status_code=404, detail="Route not found")

    periods = _available_periods(db)
    latest_period = periods[-1] if periods else None

    observations = (
        db.query(FareObservation)
        .filter(FareObservation.route_id == route_id, FareObservation.is_valid == True)  # noqa: E712
        .all()
    )
    current = [
        o.total_fare for o in observations
        if o.observation_timestamp and f"{o.observation_timestamp.year:04d}-{o.observation_timestamp.month:02d}" == latest_period
    ]

    by_airline: dict[int, list[float]] = {}
    for o in observations:
        if o.total_fare is not None:
            by_airline.setdefault(o.airline_id, []).append(o.total_fare)

    airline_rows = []
    for airline_id, fares in by_airline.items():
        airline = db.get(Airline, airline_id)
        airline_rows.append({
            "airline": airline.name if airline else "Unknown",
            "average_fare": round(sum(fares) / len(fares), 2),
            "observation_count": len(fares),
        })
    airline_rows.sort(key=lambda a: a["average_fare"])

    riv = (
        db.query(RouteIndexValue)
        .filter(RouteIndexValue.route_id == route_id, RouteIndexValue.period == latest_period)
        .first()
    )

    anomaly_count = db.query(func.count(Anomaly.id)).filter(Anomaly.route_id == route_id).scalar() or 0

    fares_all = [o.total_fare for o in observations if o.total_fare is not None]
    mean_fare = sum(fares_all) / len(fares_all) if fares_all else 0
    variance = sum((f - mean_fare) ** 2 for f in fares_all) / len(fares_all) if fares_all else 0
    volatility = (variance ** 0.5 / mean_fare) if mean_fare else 0

    return {
        "route_id": route_id,
        "origin": route.origin_airport.iata_code if route.origin_airport else None,
        "destination": route.destination_airport.iata_code if route.destination_airport else None,
        "origin_city": route.origin_airport.city if route.origin_airport else None,
        "destination_city": route.destination_airport.city if route.destination_airport else None,
        "region": route.region,
        "distance_km": round(route.distance_km, 1) if route.distance_km else None,
        "current_average_fare": round(sum(current) / len(current), 2) if current else None,
        "index_value": riv.index_value if riv else None,
        "price_relative": riv.price_relative if riv else None,
        "weight": riv.weight if riv else None,
        "in_basket": riv is not None,
        "observation_count": len(observations),
        "anomaly_count": anomaly_count,
        "volatility": round(volatility, 4),
        "airline_breakdown": airline_rows,
    }


@app.get("/api/airports")
async def get_airports(db: Session = Depends(get_db)):
    """Airport reference with coordinates, for the network map."""
    airports = db.query(Airport).filter(Airport.is_active == True).all()  # noqa: E712
    return {
        "airports": [
            {
                "id": a.id, "iata_code": a.iata_code, "city": a.city,
                "region": a.region, "latitude": a.latitude, "longitude": a.longitude,
            }
            for a in airports
        ]
    }

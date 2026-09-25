"""
AIRINDEX INDIA — Real-time Airfare Price Index (APIx) API.

Run from the repo root:
    python -m uvicorn backend.main:app --reload --port 8000

Swagger UI: http://localhost:8000/docs

Data source: the SQLite store built by `python -m pipeline.run_all` from the
cached raw snapshots in data/raw/. The API never triggers a live scrape.

There is no fake-data fallback. When something genuinely has no data yet the
endpoint says so — `{"available": false, "reason": ...}` with a 200, because
"not enough history" is a normal state of a young index, not a server error.
Serving invented numbers that look real is the one thing this API must not do.

DEMO_MODE (see pipeline.db) points the whole app at a separate seeded database
for presentations; /meta reports which mode is live so the UI can badge it.
"""
from __future__ import annotations

import json
import logging
import os
import sqlite3
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr, Field

from pipeline import backtest, fare_model, festivals, official_compare
from pipeline import index as index_engine
from pipeline.db import DATA_MODE, DB_PATH, DEMO_MODE, assert_mode_consistent, connect, init_db
from pipeline.trend_forecast import linear_forecast

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")

app = FastAPI(
    title="AIRINDEX INDIA — Airfare Price Index API",
    version="0.2.0",
    description=(
        "Daily Airfare Price Index (APIx) for Indian domestic routes, built from "
        "web-scraped airline/OTA fares (robots.txt-respecting, rate-limited, served from cached snapshots). "
        "Intended for NSO / RBI / research consumers.\n\n"
        "Base day = 100. Weights = DGCA traffic share. See `/meta` for the data mode and provenance."
    ),
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


# --------------------------------------------------------------------------- #
# DB
# --------------------------------------------------------------------------- #
def get_db():
    conn = connect()
    try:
        yield conn
    finally:
        conn.close()


@app.on_event("startup")
def _startup():
    assert_mode_consistent()
    init_db(connect()).close()
    logging.getLogger("uvicorn.error").warning(
        "AIRINDEX starting in %s mode -> %s", DATA_MODE.upper(), DB_PATH.name
    )


MIN_FORECAST_DAYS = 10   # matches trend_forecast.LOOKBACK_DAYS


def _has_snapshot_data(conn: sqlite3.Connection) -> bool:
    return conn.execute("SELECT COUNT(*) FROM index_daily").fetchone()[0] > 0


def _unavailable(reason: str, message: str, **shape) -> dict:
    """
    A 200 that honestly says "nothing here yet".

    Empty is a normal state for a young index, not a failure, so it should not
    look like one to the client. `shape` carries the same keys the populated
    response would have (empty lists, nulls) so callers can render without
    branching on every field.
    """
    return {"available": False, "reason": reason, "message": message, **shape}


def _provenance(conn: sqlite3.Connection) -> dict:
    snaps = conn.execute(
        "SELECT source, MAX(scraped_at) AS last, COUNT(*) AS n, SUM(n_kept) AS records, is_synthetic "
        "FROM snapshots GROUP BY source, is_synthetic"
    ).fetchall()
    real = [s for s in snaps if not s["is_synthetic"]]
    return {
        "snapshot_at": max((s["last"] for s in real), default=None),
        "sources": [
            {"source": s["source"], "last_scraped_at": s["last"], "snapshots": s["n"],
             "records": s["records"], "synthetic": bool(s["is_synthetic"])} for s in snaps
        ],
        "db_path": str(DB_PATH.relative_to(ROOT)),
    }


# --------------------------------------------------------------------------- #
# Schemas
# --------------------------------------------------------------------------- #
class SaveRouteRequest(BaseModel):
    browser_id: str = Field(..., min_length=6, max_length=64)
    origin: str = Field(..., min_length=3, max_length=3, examples=["DEL"])
    destination: str = Field(..., min_length=3, max_length=3, examples=["BOM"])
    preferred_days: list[str] = Field(default_factory=list, examples=[["Fri", "Sat"]])
    email: EmailStr


ROUTES = list(index_engine.ROUTE_WEIGHTS)


def _validate_route(route: str) -> str:
    route = route.upper()
    if route not in index_engine.ROUTE_WEIGHTS:
        raise HTTPException(404, f"Unknown route '{route}'. Known: {ROUTES}")
    return route


# --------------------------------------------------------------------------- #
# Meta
# --------------------------------------------------------------------------- #
@app.get("/health", tags=["meta"])
def health():
    return {"status": "ok", "time": datetime.now().isoformat(timespec="seconds")}


@app.get("/meta", tags=["meta"])
def meta(conn: sqlite3.Connection = Depends(get_db)):
    """Routes, windows, carriers, and the provenance of the data backing the API."""
    has_data = _has_snapshot_data(conn)
    prov = _provenance(conn) if has_data else {"snapshot_at": None, "sources": [], "db_path": None}
    daily = index_engine.get_index_daily(conn) if has_data else None
    carriers = [r[0] for r in conn.execute(
        "SELECT carrier FROM fares GROUP BY carrier ORDER BY COUNT(*) DESC LIMIT 8"
    )] if has_data else []
    return {
        "data_mode": DATA_MODE,
        "demo_mode": DEMO_MODE,
        "has_data": has_data,
        "routes": ROUTES,
        "weights": index_engine.ROUTE_WEIGHTS,
        "windows": index_engine.WINDOWS,
        "carriers": carriers,
        "n_real_days": daily["n_real_days"] if daily else 0,
        "n_synthetic_days": daily["n_synthetic_days"] if daily else 0,
        **prov,
    }


# --------------------------------------------------------------------------- #
# Index
# --------------------------------------------------------------------------- #
@app.get("/index/daily", tags=["index"])
def index_daily(conn: sqlite3.Connection = Depends(get_db)):
    """Daily APIx value. First captured day = 100. `is_synthetic` marks seeded demo history."""
    if not _has_snapshot_data(conn):
        return _unavailable("no_index_data", "No scrape days have been processed yet.",
                            index_name=index_engine.INDEX_NAME, points=[], latest=None)
    return {"available": True, **index_engine.get_index_daily(conn)}


@app.get("/index/forecast", tags=["index"])
def index_forecast(days: int = Query(5, ge=3, le=7), conn: sqlite3.Connection = Depends(get_db)):
    """Linear-trend extrapolation of the last 10 index values with a 95% residual band."""
    points = index_engine.get_index_daily(conn)["points"] if _has_snapshot_data(conn) else []
    if len(points) < MIN_FORECAST_DAYS:
        # A trend line through one or two points is not a forecast, it is a
        # guess with error bars drawn on. Say what is missing instead.
        return _unavailable(
            "insufficient_history",
            f"A forecast needs at least {MIN_FORECAST_DAYS} index days; the scraper has produced {len(points)}.",
            have=len(points), need=MIN_FORECAST_DAYS, points=[],
        )
    return {"available": True, **linear_forecast(points, horizon=days)}


@app.get("/index/heatmap", tags=["index"])
def index_heatmap(date: str | None = Query(None, description="YYYY-MM-DD scrape day; default latest"),
                  conn: sqlite3.Connection = Depends(get_db)):
    """Average nonstop economy fare per route x advance-purchase window."""
    if not _has_snapshot_data(conn):
        return _unavailable("no_index_data", "No scrape days have been processed yet.",
                            routes=ROUTES, windows=index_engine.WINDOWS, cells=[])
    return {"available": True, **index_engine.get_heatmap(conn, date)}


# --------------------------------------------------------------------------- #
# Routes / fares
# --------------------------------------------------------------------------- #
@app.get("/routes/{route}/trend", tags=["routes"])
def route_trend(route: str, conn: sqlite3.Connection = Depends(get_db)):
    """Fare by advance-purchase window for one route, with predicted-vs-actual overlay."""
    route = _validate_route(route)
    if not _has_snapshot_data(conn):
        return _unavailable("no_index_data", "No scrape days have been processed yet.",
                            route=route, windows=[], carriers=[])
    trend = index_engine.get_route_trend(conn, route)
    if trend["date"]:
        overlay = fare_model.overlay_for_route(conn, route, trend["date"])
        for w in trend["windows"]:
            w["predicted_avg"] = overlay.get(w["window"])
        m = fare_model.load()
        trend["model"] = {k: v for k, v in m["meta"].items() if k != "features"} if m else None
    return {"available": True, **trend}


class PredictResponse(BaseModel):
    route: str
    carrier: str
    travel_date: str
    as_of: str
    predicted_fare: int
    features: dict
    model: dict


@app.get("/predict", tags=["routes"], response_model=PredictResponse)
def predict(
    route: str = Query(..., examples=["DEL-BOM"]),
    travel_date: str = Query(..., description="YYYY-MM-DD"),
    carrier: str = Query("6E", description="IATA code, e.g. 6E, AI, IX, QP, SG"),
    as_of: str | None = Query(None, description="booking date, default today"),
):
    """Model-predicted nonstop economy fare for a route on a future date."""
    route = _validate_route(route)
    out = fare_model.predict_one(route, carrier.upper(), travel_date, as_of)
    if out is None:
        raise HTTPException(503, "Fare model not trained yet — run `python -m pipeline.run_all`.")
    return out


@app.get("/model/info", tags=["routes"])
def model_info():
    """Training metadata + hold-out metrics of the current fare model."""
    m = fare_model.load()
    if not m:
        raise HTTPException(503, "Fare model not trained yet.")
    return m["meta"]


@app.get("/fares/raw", tags=["routes"])
def fares_raw(
    route: str | None = Query(None, examples=["DEL-BOM"]),
    date_from: str | None = Query(None, description="YYYY-MM-DD (travel_date >=)"),
    date_to: str | None = Query(None, description="YYYY-MM-DD (travel_date <=)"),
    scrape_date: str | None = Query(None, description="YYYY-MM-DD; default latest scrape day"),
    nonstop_only: bool = Query(False),
    include_synthetic: bool = Query(False),
    limit: int = Query(200, ge=1, le=5000),
    offset: int = Query(0, ge=0),
    conn: sqlite3.Connection = Depends(get_db),
):
    """Cleaned fare records (the `fares` table), filterable by route, travel date and scrape day."""
    if not _has_snapshot_data(conn):
        return _unavailable("no_index_data", "No scrape days have been processed yet.",
                            count=0, total=0, records=[])

    where, params = ["1=1"], []
    if route:
        where.append("route = ?"); params.append(_validate_route(route))
    if date_from:
        where.append("travel_date >= ?"); params.append(date_from)
    if date_to:
        where.append("travel_date <= ?"); params.append(date_to)
    if scrape_date:
        where.append("scrape_date = ?"); params.append(scrape_date)
    else:
        where.append("scrape_date = (SELECT MAX(scrape_date) FROM fares)")
    if nonstop_only:
        where.append("stops = 0")
    if not include_synthetic and not DEMO_MODE:
        where.append("is_synthetic = 0")
    sql = " AND ".join(where)
    total = conn.execute(f"SELECT COUNT(*) FROM fares WHERE {sql}", params).fetchone()[0]
    rows = conn.execute(
        f"SELECT * FROM fares WHERE {sql} ORDER BY route, travel_date, total_fare LIMIT ? OFFSET ?",
        [*params, limit, offset],
    ).fetchall()
    recs = [{k: r[k] for k in r.keys() if k not in ("id",)} for r in rows]
    for r in recs:
        r["is_outlier"] = bool(r["is_outlier"]); r["is_synthetic"] = bool(r["is_synthetic"])
    return {"count": len(recs), "total": total, "records": recs}


# --------------------------------------------------------------------------- #
# Official statistics (MoSPI)
# --------------------------------------------------------------------------- #
@app.get("/official/cpi", tags=["official"])
def official_cpi(
    level: str = Query("Item", pattern="^(Item|SubGroup)$"),
    sector: str = Query("All", pattern="^(All|Rural|Urban|Combined)$"),
    date_from: str | None = Query(None, description="YYYY-MM (period >=)"),
    date_to: str | None = Query(None, description="YYYY-MM (period <=)"),
    conn: sqlite3.Connection = Depends(get_db),
):
    """Official CPI series as fetched from MoSPI eSankhyiki."""
    where, params = ["level = ?", "sector = ?"], [level, sector]
    if date_from:
        where.append("period >= ?"); params.append(date_from)
    if date_to:
        where.append("period <= ?"); params.append(date_to)
    rows = conn.execute(
        f"SELECT period, year, month, index_value, inflation, item_code, item_name, status "
        f"FROM official_cpi WHERE {' AND '.join(where)} ORDER BY period", params
    ).fetchall()
    if not rows:
        return _unavailable("no_official_data",
                            "Official CPI has not been fetched yet — run `python -m pipeline.mospi`.",
                            level=level, sector=sector, points=[])
    return {
        "available": True,
        "source": "MoSPI eSankhyiki (api.mospi.gov.in)",
        "level": level, "sector": sector,
        "item_name": rows[0]["item_name"], "item_code": rows[0]["item_code"],
        "n_months": len(rows),
        "points": [
            {"period": r["period"], "index": r["index_value"],
             "inflation_pct": r["inflation"], "status": r["status"]}
            for r in rows
        ],
    }


@app.get("/official/compare", tags=["official"])
def official_comparison(conn: sqlite3.Connection = Depends(get_db)):
    """Official CPI airfare vs APIx: the scale link, overlap statistics, and the CPI seasonal profile."""
    return official_compare.compute(conn)


# --------------------------------------------------------------------------- #
# Back-test (superseded by /official/compare; removed once the UI moves over)
# --------------------------------------------------------------------------- #
@app.get("/backtest/dgca", tags=["index"])
def backtest_dgca(include_synthetic: bool = Query(False), conn: sqlite3.Connection = Depends(get_db)):
    """Our monthly basket fare levels vs the public reference table (see data/reference/). `reference.status` says whether the table is OFFICIAL or ILLUSTRATIVE."""
    if not _has_snapshot_data(conn):
        raise HTTPException(503, "No snapshot data yet.")
    return backtest.compute(conn, include_synthetic=include_synthetic)


# --------------------------------------------------------------------------- #
# Festivals
# --------------------------------------------------------------------------- #
@app.get("/festivals/surge", tags=["festivals"])
def festivals_surge(conn: sqlite3.Connection = Depends(get_db)):
    """Festival vs normal mean fare per route (same advance-purchase window mix), real records only."""
    if not _has_snapshot_data(conn):
        return _unavailable("no_index_data", "No scrape days have been processed yet.",
                            festivals=festivals.FESTIVALS, surge=[], n_records=0)
    return {"available": True, **festivals.compute_surge(conn)}


@app.get("/festivals/calendar", tags=["festivals"])
def festivals_calendar():
    """The hard-coded festival travel-window calendar used for tagging."""
    return {"festivals": festivals.FESTIVALS}


# --------------------------------------------------------------------------- #
# Saved routes / alerts  (SQLite-backed + Brevo notifier land in step 9)
# --------------------------------------------------------------------------- #
@app.post("/routes/save", tags=["alerts"], status_code=201)
def save_route(body: SaveRouteRequest, conn: sqlite3.Connection = Depends(get_db)):
    """Save a watched route for a browser_id + email (no login required)."""
    o, d = body.origin.upper(), body.destination.upper()
    _validate_route(f"{o}-{d}")
    now = datetime.now().isoformat(timespec="seconds")
    conn.execute(
        "INSERT INTO saved_routes (browser_id, origin, destination, preferred_days, email, created_at) VALUES (?,?,?,?,?,?) "
        "ON CONFLICT(browser_id, origin, destination) DO UPDATE SET preferred_days = excluded.preferred_days, email = excluded.email",
        (body.browser_id, o, d, json.dumps(body.preferred_days), body.email, now),
    )
    conn.commit()
    row = conn.execute("SELECT * FROM saved_routes WHERE browser_id = ? AND origin = ? AND destination = ?",
                       (body.browser_id, o, d)).fetchone()
    return _saved_row(row)


def _saved_row(row) -> dict:
    d = dict(row)
    d["preferred_days"] = json.loads(d["preferred_days"] or "[]")
    return d


@app.get("/routes/saved/{browser_id}", tags=["alerts"])
def list_saved_routes(browser_id: str, conn: sqlite3.Connection = Depends(get_db)):
    rows = conn.execute("SELECT * FROM saved_routes WHERE browser_id = ? ORDER BY created_at", (browser_id,)).fetchall()
    return {"browser_id": browser_id, "routes": [_saved_row(r) for r in rows]}


@app.delete("/routes/saved/{browser_id}/{route_id}", tags=["alerts"], status_code=204)
def delete_saved_route(browser_id: str, route_id: int, conn: sqlite3.Connection = Depends(get_db)):
    conn.execute("DELETE FROM saved_routes WHERE browser_id = ? AND id = ?", (browser_id, route_id))
    conn.commit()


@app.get("/routes/{browser_id}/alerts", tags=["alerts"])
def route_alerts(browser_id: str, conn: sqlite3.Connection = Depends(get_db)):
    """Is any saved route cheap today (>15% below its rolling baseline)?"""
    rows = conn.execute("SELECT * FROM saved_routes WHERE browser_id = ?", (browser_id,)).fetchall()
    out = []
    for r in rows:
        route = f"{r['origin']}-{r['destination']}"
        today = conn.execute(
            "SELECT AVG(avg_fare) AS v FROM route_daily WHERE route = ? AND date = (SELECT MAX(date) FROM route_daily)", (route,)
        ).fetchone()["v"]
        base = conn.execute(
            "SELECT AVG(avg_fare) AS v FROM route_daily WHERE route = ? AND date < (SELECT MAX(date) FROM route_daily) "
            "AND date >= date((SELECT MAX(date) FROM route_daily), '-14 days')", (route,)
        ).fetchone()["v"]
        pct = round((base - today) / base * 100, 1) if today and base else None
        out.append({
            "route": route, "today_fare": round(today) if today else None, "baseline_fare": round(base) if base else None,
            "pct_below_baseline": pct, "is_cheap": bool(pct is not None and pct > 15),
            "last_notified_at": r["last_notified_at"],
        })
    return {
        "browser_id": browser_id,
        "checked_at": datetime.now().isoformat(timespec="seconds"),
        "any_cheap": any(a["is_cheap"] for a in out),
        "alerts": out,
    }

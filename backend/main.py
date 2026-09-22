"""
AIRINDEX INDIA — Real-time Airfare Price Index (APIx) API.

Run from the repo root:
    python -m uvicorn backend.main:app --reload --port 8000

Swagger UI: http://localhost:8000/docs

Data source: the SQLite store built by `python -m pipeline.run_all` from the
cached raw snapshots in data/raw/. The API never triggers a live scrape. If the
store is empty it falls back to backend/fake_data.py so the UI always renders.
"""
from __future__ import annotations

import json
import os
import sqlite3
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr, Field

from backend import fake_data
from pipeline import backtest, fare_model, festivals
from pipeline import index as index_engine
from pipeline.db import DB_PATH, connect, init_db
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
    init_db(connect()).close()


def _has_snapshot_data(conn: sqlite3.Connection) -> bool:
    return conn.execute("SELECT COUNT(*) FROM index_daily").fetchone()[0] > 0


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
    live = _has_snapshot_data(conn)
    prov = _provenance(conn) if live else {"snapshot_at": None, "sources": [], "db_path": None}
    daily = index_engine.get_index_daily(conn) if live else None
    carriers = [r[0] for r in conn.execute(
        "SELECT carrier FROM fares WHERE is_synthetic = 0 GROUP BY carrier ORDER BY COUNT(*) DESC LIMIT 8"
    )] if live else fake_data.CARRIERS
    return {
        "data_mode": "snapshot" if live else "fake",
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
        return fake_data.fake_index_daily()
    return index_engine.get_index_daily(conn)


@app.get("/index/forecast", tags=["index"])
def index_forecast(days: int = Query(5, ge=3, le=7), conn: sqlite3.Connection = Depends(get_db)):
    """Linear-trend extrapolation of the last 10 index values with a 95% residual band."""
    if not _has_snapshot_data(conn):
        return fake_data.fake_forecast(days)
    return linear_forecast(index_engine.get_index_daily(conn)["points"], horizon=days)


@app.get("/index/heatmap", tags=["index"])
def index_heatmap(date: str | None = Query(None, description="YYYY-MM-DD scrape day; default latest"),
                  conn: sqlite3.Connection = Depends(get_db)):
    """Average nonstop economy fare per route x advance-purchase window."""
    if not _has_snapshot_data(conn):
        return fake_data.fake_heatmap()
    return index_engine.get_heatmap(conn, date)


# --------------------------------------------------------------------------- #
# Routes / fares
# --------------------------------------------------------------------------- #
@app.get("/routes/{route}/trend", tags=["routes"])
def route_trend(route: str, conn: sqlite3.Connection = Depends(get_db)):
    """Fare by advance-purchase window for one route, with predicted-vs-actual overlay."""
    route = _validate_route(route)
    if not _has_snapshot_data(conn):
        return fake_data.fake_route_trend(route)
    trend = index_engine.get_route_trend(conn, route)
    if trend["date"]:
        overlay = fare_model.overlay_for_route(conn, route, trend["date"])
        for w in trend["windows"]:
            w["predicted_avg"] = overlay.get(w["window"])
        m = fare_model.load()
        trend["model"] = {k: v for k, v in m["meta"].items() if k != "features"} if m else None
    return trend


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
        data = fake_data.fake_fares_raw(_validate_route(route) if route else None, limit=5000)
        recs = [r for r in data["records"]
                if (not date_from or r["travel_date"] >= date_from) and (not date_to or r["travel_date"] <= date_to)]
        return {"count": len(recs[offset:offset + limit]), "total": len(recs), "records": recs[offset:offset + limit]}

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
        where.append("scrape_date = (SELECT MAX(scrape_date) FROM fares WHERE is_synthetic = 0)")
    if nonstop_only:
        where.append("stops = 0")
    if not include_synthetic:
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
# Back-test
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
        return fake_data.fake_festival_surge()
    return festivals.compute_surge(conn)


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

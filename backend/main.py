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

Errors that ARE errors (bad input, unknown route, untrained model) share one
envelope: `{"error": <code>, "detail": <human message>, "path": <url>}`.

DEMO_MODE (see pipeline.db) points the whole app at a separate seeded database
for presentations; /meta reports which mode is live so the UI can badge it.
"""
from __future__ import annotations

import json
import logging
import os
import sqlite3
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta
from pathlib import Path

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from backend import schemas as S
from pipeline import timeutil
from pipeline import backtest, fare_model, festivals, notifier, official_compare
from pipeline import index as index_engine
from pipeline.cities import WINDOW_LABELS, WINDOW_SHORT, as_list as cities_list, route_label
import pipeline.db as dbmod
from pipeline.db import DATA_MODE, DEMO_MODE, assert_mode_consistent, connect, init_db
from pipeline.trend_forecast import LOOKBACK_DAYS, linear_forecast

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")
log = logging.getLogger("backend")

MIN_FORECAST_DAYS = LOOKBACK_DAYS
# A source that has not succeeded in two days is stale: scrapes run daily, so
# one missed run is noise but two is a pattern worth surfacing.
STALE_AFTER_HOURS = 48

ROUTES = list(index_engine.ROUTE_WEIGHTS)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Fail before serving a single request if the mode and database disagree.
    assert_mode_consistent()
    init_db(connect()).close()
    logging.getLogger("uvicorn.error").warning(
        "AIRINDEX starting in %s mode -> %s", DATA_MODE.upper(), dbmod.DB_PATH.name
    )
    yield


app = FastAPI(
    title="AIRINDEX INDIA — Airfare Price Index API",
    version="0.3.0",
    description=(
        "Daily Airfare Price Index (APIx) for Indian domestic routes, built from "
        "web-scraped airline/OTA fares (robots.txt-respecting, rate-limited, served from cached snapshots), "
        "alongside the official MoSPI CPI airfare index.\n\n"
        "Base day = 100. Weights = DGCA traffic share. See `/meta` for the data mode and provenance. "
        "Endpoints that can be empty return `available: false` with a `reason` instead of invented data."
    ),
    lifespan=lifespan,
    responses={
        400: {"model": S.ErrorResponse}, 404: {"model": S.ErrorResponse},
        422: {"model": S.ErrorResponse}, 500: {"model": S.ErrorResponse},
    },
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in os.environ.get(
        "CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",") if o.strip()],
    allow_methods=["*"],
    allow_headers=["*"],
)


# --------------------------------------------------------------------------- #
# Error envelope
# --------------------------------------------------------------------------- #
_CODES = {400: "bad_request", 404: "not_found", 409: "conflict", 422: "invalid_input",
          503: "unavailable", 500: "internal_error"}


def _envelope(status: int, detail: str, request: Request, **extra) -> JSONResponse:
    return JSONResponse(
        status_code=status,
        content={"error": _CODES.get(status, "error"), "detail": detail, "path": request.url.path, **extra},
    )


@app.exception_handler(StarletteHTTPException)
async def _http_error(request: Request, exc: StarletteHTTPException):
    return _envelope(exc.status_code, str(exc.detail), request)


@app.exception_handler(RequestValidationError)
async def _validation_error(request: Request, exc: RequestValidationError):
    # One readable sentence for people, the structured list for code.
    fields = [
        {"field": ".".join(str(p) for p in e["loc"] if p not in ("body", "query", "path")), "message": e["msg"]}
        for e in exc.errors()
    ]
    summary = "; ".join(f"{f['field']}: {f['message']}" for f in fields) or "Invalid request"
    return _envelope(422, summary, request, errors=fields)


@app.exception_handler(Exception)
async def _unhandled(request: Request, exc: Exception):
    # Log the real cause; never leak a traceback to the client.
    log.exception("unhandled error on %s", request.url.path)
    return _envelope(500, "Something went wrong on our side. Please try again.", request)


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #
def get_db():
    conn = connect()
    try:
        yield conn
    finally:
        conn.close()


def _has_snapshot_data(conn: sqlite3.Connection) -> bool:
    return conn.execute("SELECT COUNT(*) FROM index_daily").fetchone()[0] > 0


def _unavailable(reason: str, message: str, **shape) -> dict:
    """
    A 200 that honestly says "nothing here yet".

    Empty is a normal state for a young index, not a failure, so it should not
    look like one to the client. `shape` carries the same keys the populated
    response would have (empty lists, nulls) so callers render without
    branching on every field. Messages are written for a traveller, not an
    engineer — the UI shows them verbatim.
    """
    return {"available": False, "reason": reason, "message": message, **shape}


NO_DATA_MSG = "We haven't collected any fares yet. The first prices appear after the next daily check."


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
        "db_path": _db_display(),
    }


def _validate_route(route: str) -> str:
    route = route.upper()
    if route not in index_engine.ROUTE_WEIGHTS:
        known = ", ".join(route_label(r) for r in ROUTES)
        raise HTTPException(404, f"We don't track {route}. Routes covered: {known}.")
    return route


def _db_display() -> str:
    """Path of the database actually in use, repo-relative when possible.

    Read at call time from pipeline.db, and never assume the DB lives inside
    the repo — a deployment may keep it on another disk.
    """
    path = dbmod.DB_PATH
    try:
        return str(path.relative_to(ROOT))
    except ValueError:
        return str(path)


def _iso(d: date | None) -> str | None:
    return d.isoformat() if d else None


def _hours_since(ts: str | None) -> float | None:
    if not ts:
        return None
    try:
        return round((timeutil.now() - datetime.fromisoformat(ts)).total_seconds() / 3600, 1)
    except ValueError:
        return None


# --------------------------------------------------------------------------- #
# Meta / health
# --------------------------------------------------------------------------- #
@app.get("/health", tags=["meta"], response_model=S.Health)
def health():
    """
    Liveness plus data freshness. 200 when serving (even if degraded), 503 only
    when the database itself is unreachable — so an uptime checker pages on a
    real outage, while a stale source shows up as `degraded` with a warning.
    """
    now = timeutil.now()
    out = {"status": "ok", "time": now.isoformat(timespec="seconds"), "data_mode": DATA_MODE,
           "database": {"reachable": False, "path": _db_display()},
           "sources": [], "warnings": []}
    try:
        conn = connect()
        conn.execute("SELECT 1").fetchone()
    except sqlite3.Error as exc:
        out["status"] = "error"
        out["database"]["error"] = str(exc)
        return JSONResponse(status_code=503, content=out)

    try:
        out["database"]["reachable"] = True
        last_scrape = conn.execute(
            "SELECT MAX(scraped_at) FROM snapshots WHERE is_synthetic = 0").fetchone()[0]
        out["latest_scrape_date"] = conn.execute("SELECT MAX(scrape_date) FROM fares").fetchone()[0]
        out["scrape_age_hours"] = _hours_since(last_scrape)
        out["index_days"] = conn.execute("SELECT COUNT(*) FROM index_daily").fetchone()[0]
        out["official_cpi_months"] = conn.execute(
            "SELECT COUNT(*) FROM official_cpi WHERE level = 'Item'").fetchone()[0]

        for r in conn.execute("SELECT * FROM source_health ORDER BY source"):
            age = _hours_since(r["last_ok_at"])
            stale = age is None or age > STALE_AFTER_HOURS
            out["sources"].append({**dict(r), "stale": stale})
            if r["status"] != "ok":
                out["warnings"].append(f"source {r['source']} is {r['status']}: {r['last_error'] or 'no detail'}")
            if stale:
                out["warnings"].append(f"source {r['source']} has not succeeded in {STALE_AFTER_HOURS}h")
    finally:
        conn.close()

    if out["scrape_age_hours"] is None:
        out["warnings"].append("no real scrape recorded yet")
    elif out["scrape_age_hours"] > STALE_AFTER_HOURS:
        out["warnings"].append(f"latest real scrape is {out['scrape_age_hours']}h old")
    if not out["sources"]:
        out["warnings"].append("no source_health rows — the scheduler has not run yet")
    if out["official_cpi_months"] == 0:
        out["warnings"].append("official CPI not fetched — run python -m pipeline.mospi")

    if out["warnings"]:
        out["status"] = "degraded"
    return out


@app.get("/meta", tags=["meta"], response_model=S.Meta)
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
        "route_details": [
            {"route": r, "origin": r.split("-")[0], "destination": r.split("-")[1],
             "label": route_label(r), "weight": w}
            for r, w in index_engine.ROUTE_WEIGHTS.items()
        ],
        "weights": index_engine.ROUTE_WEIGHTS,
        "windows": index_engine.WINDOWS,
        "window_labels": WINDOW_LABELS,
        "carriers": carriers,
        "n_real_days": daily["n_real_days"] if daily else 0,
        "n_synthetic_days": daily["n_synthetic_days"] if daily else 0,
        **prov,
    }


@app.get("/meta/cities", tags=["meta"], response_model=list[S.City])
def meta_cities():
    """City name, airport code and state for every code the app can show."""
    return cities_list()


# --------------------------------------------------------------------------- #
# Index
# --------------------------------------------------------------------------- #
@app.get("/index/daily", tags=["index"], response_model=S.IndexDaily)
def index_daily(conn: sqlite3.Connection = Depends(get_db)):
    """Daily APIx value. First captured day = 100. `is_synthetic` marks seeded demo history."""
    if not _has_snapshot_data(conn):
        return _unavailable("no_index_data", NO_DATA_MSG, points=[], latest=None)
    return {"available": True, **index_engine.get_index_daily(conn)}


@app.get("/index/forecast", tags=["index"], response_model=S.IndexForecast)
def index_forecast(days: int = Query(5, ge=3, le=7), conn: sqlite3.Connection = Depends(get_db)):
    """Linear-trend extrapolation of the last 10 index values with a 95% residual band."""
    points = index_engine.get_index_daily(conn)["points"] if _has_snapshot_data(conn) else []
    if len(points) < MIN_FORECAST_DAYS:
        # A trend line through one or two points is not a forecast, it is a
        # guess with error bars drawn on. Say what is missing instead.
        remaining = MIN_FORECAST_DAYS - len(points)
        return _unavailable(
            "insufficient_history",
            f"We need {remaining} more day{'s' if remaining != 1 else ''} of prices before we can "
            f"predict where fares are heading. We have {len(points)} so far — check back tomorrow.",
            have=len(points), need=MIN_FORECAST_DAYS, points=[],
        )
    return {"available": True, **linear_forecast(points, horizon=days)}


@app.get("/index/heatmap", tags=["index"], response_model=S.Heatmap)
def index_heatmap(date_: date | None = Query(None, alias="date", description="Scrape day; default latest"),
                  conn: sqlite3.Connection = Depends(get_db)):
    """Average nonstop economy fare per route x advance-purchase window."""
    if not _has_snapshot_data(conn):
        return _unavailable("no_index_data", NO_DATA_MSG, routes=ROUTES, windows=index_engine.WINDOWS, cells=[])
    return {"available": True, **index_engine.get_heatmap(conn, _iso(date_))}


# --------------------------------------------------------------------------- #
# Routes / fares
# --------------------------------------------------------------------------- #
def _best_window(windows: list[dict]) -> dict | None:
    """The cheapest advance-purchase window, and how much it saves vs the dearest."""
    priced = [w for w in windows if w.get("actual_avg")]
    if len(priced) < 2:
        return None
    best = min(priced, key=lambda w: w["actual_avg"])
    worst = max(priced, key=lambda w: w["actual_avg"])
    return {
        "window": best["window"],
        "label": WINDOW_SHORT.get(best["window"], best["window"]),
        "avg_fare": round(best["actual_avg"]),
        "vs_window": worst["window"],
        "vs_label": WINDOW_SHORT.get(worst["window"], worst["window"]),
        "saving_pct": round((1 - best["actual_avg"] / worst["actual_avg"]) * 100, 1),
    }


@app.get("/routes/{route}/trend", tags=["routes"], response_model=S.RouteTrend)
def route_trend(route: str, conn: sqlite3.Connection = Depends(get_db)):
    """Fare by advance-purchase window for one route, with predicted-vs-actual overlay."""
    route = _validate_route(route)
    if not _has_snapshot_data(conn):
        return _unavailable("no_index_data", NO_DATA_MSG, route=route, label=route_label(route),
                            windows=[], carriers=[])
    trend = index_engine.get_route_trend(conn, route)
    if trend["date"]:
        overlay = fare_model.overlay_for_route(conn, route, trend["date"])
        for w in trend["windows"]:
            w["predicted_avg"] = overlay.get(w["window"])
        m = fare_model.load()
        trend["model"] = {k: v for k, v in m["meta"].items() if k != "features"} if m else None
    for w in trend["windows"]:
        w["label"] = WINDOW_SHORT.get(w["window"], w["window"])
    return {"available": True, **trend, "label": route_label(route), "best_window": _best_window(trend["windows"])}


@app.get("/predict", tags=["routes"], response_model=S.Prediction)
def predict(
    route: str = Query(..., examples=["DEL-BOM"]),
    travel_date: date = Query(..., description="YYYY-MM-DD"),
    carrier: str = Query("6E", min_length=2, max_length=3, description="IATA code, e.g. 6E, AI, IX, QP, SG"),
    as_of: date | None = Query(None, description="booking date, default today"),
):
    """Model-predicted nonstop economy fare for a route on a future date."""
    route = _validate_route(route)
    booked = as_of or timeutil.today()
    if travel_date < booked:
        raise HTTPException(400, "The travel date is in the past — pick a date from today onwards.")
    if travel_date > booked + timedelta(days=180):
        raise HTTPException(400, "We can only estimate fares up to 6 months ahead.")
    out = fare_model.predict_one(route, carrier.upper(), travel_date.isoformat(), booked.isoformat())
    if out is None:
        raise HTTPException(503, "The fare model hasn't been trained yet — it needs a scrape to learn from.")
    return out


@app.get("/model/info", tags=["routes"])
def model_info():
    """Training metadata + hold-out metrics of the current fare model."""
    m = fare_model.load()
    if not m:
        raise HTTPException(503, "The fare model hasn't been trained yet.")
    return m["meta"]


@app.get("/fares/raw", tags=["routes"], response_model=S.FaresRaw)
def fares_raw(
    route: str | None = Query(None, examples=["DEL-BOM"]),
    date_from: date | None = Query(None, description="travel_date >="),
    date_to: date | None = Query(None, description="travel_date <="),
    scrape_date: date | None = Query(None, description="default latest scrape day"),
    nonstop_only: bool = Query(False),
    include_synthetic: bool = Query(False),
    limit: int = Query(200, ge=1, le=5000),
    offset: int = Query(0, ge=0),
    conn: sqlite3.Connection = Depends(get_db),
):
    """Cleaned fare records (the `fares` table), filterable by route, travel date and scrape day."""
    if date_from and date_to and date_from > date_to:
        raise HTTPException(400, "The start date is after the end date.")
    if not _has_snapshot_data(conn):
        return _unavailable("no_index_data", NO_DATA_MSG, count=0, total=0, records=[],
                            offset=offset, limit=limit)

    where, params = ["1=1"], []
    if route:
        where.append("route = ?"); params.append(_validate_route(route))
    if date_from:
        where.append("travel_date >= ?"); params.append(date_from.isoformat())
    if date_to:
        where.append("travel_date <= ?"); params.append(date_to.isoformat())
    if scrape_date:
        where.append("scrape_date = ?"); params.append(scrape_date.isoformat())
    else:
        where.append("scrape_date = (SELECT MAX(scrape_date) FROM fares)")
    if nonstop_only:
        where.append("stops = 0")
    # Live data never contains synthetic rows, but belt and braces; in demo
    # mode every row is seeded, so filtering would return nothing.
    if not include_synthetic and not DEMO_MODE:
        where.append("is_synthetic = 0")
    sql = " AND ".join(where)
    total = conn.execute(f"SELECT COUNT(*) FROM fares WHERE {sql}", params).fetchone()[0]
    rows = conn.execute(
        f"SELECT * FROM fares WHERE {sql} ORDER BY route, travel_date, total_fare LIMIT ? OFFSET ?",
        [*params, limit, offset],
    ).fetchall()
    records = [{k: r[k] for k in r.keys() if k != "id"} for r in rows]
    for r in records:
        r["is_outlier"] = bool(r["is_outlier"]); r["is_synthetic"] = bool(r["is_synthetic"])
    end = offset + len(records)
    return {
        "available": True,
        "count": len(records), "total": total, "records": records,
        "offset": offset, "limit": limit,
        "has_more": end < total,
        "next_offset": end if end < total else None,
    }


# --------------------------------------------------------------------------- #
# Official statistics (MoSPI)
# --------------------------------------------------------------------------- #
@app.get("/official/cpi", tags=["official"], response_model=S.OfficialCpi)
def official_cpi(
    level: str = Query("Item", pattern="^(Item|SubGroup)$"),
    sector: str = Query("All", pattern="^(All|Rural|Urban|Combined)$"),
    date_from: str | None = Query(None, pattern=r"^\d{4}-(0[1-9]|1[0-2])$", description="YYYY-MM (period >=)"),
    date_to: str | None = Query(None, pattern=r"^\d{4}-(0[1-9]|1[0-2])$", description="YYYY-MM (period <=)"),
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
                            "The government's official airfare figures haven't been downloaded yet.",
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
@app.get("/backtest/dgca", tags=["index"], deprecated=True)
def backtest_dgca(include_synthetic: bool = Query(False), conn: sqlite3.Connection = Depends(get_db)):
    """Deprecated: illustrative reference table. Use /official/compare."""
    if not _has_snapshot_data(conn):
        return _unavailable("no_index_data", NO_DATA_MSG, comparison=[], series=[])
    return backtest.compute(conn, include_synthetic=include_synthetic)


# --------------------------------------------------------------------------- #
# Festivals
# --------------------------------------------------------------------------- #
@app.get("/festivals/surge", tags=["festivals"], response_model=S.FestivalSurge)
def festivals_surge(conn: sqlite3.Connection = Depends(get_db)):
    """Festival vs normal mean fare per route (same advance-purchase window mix)."""
    if not _has_snapshot_data(conn):
        return _unavailable("no_index_data", NO_DATA_MSG, festivals=festivals.FESTIVALS, surge=[], n_records=0)
    out = festivals.compute_surge(conn)
    for row in out["surge"]:
        row["label"] = route_label(row["route"])
    return {"available": True, **out}


@app.get("/festivals/calendar", tags=["festivals"])
def festivals_calendar():
    """The festival travel-window calendar used for tagging."""
    return {"festivals": festivals.FESTIVALS}


# --------------------------------------------------------------------------- #
# Saved routes / alerts
# --------------------------------------------------------------------------- #
def _saved_row(row) -> dict:
    d = dict(row)
    d["preferred_days"] = json.loads(d["preferred_days"] or "[]")
    d["route"] = f"{d['origin']}-{d['destination']}"
    d["label"] = route_label(d["route"])
    return d


@app.post("/routes/save", tags=["alerts"], status_code=201, response_model=S.SavedRoute)
def save_route(body: S.SaveRouteRequest, conn: sqlite3.Connection = Depends(get_db)):
    """Save a watched route for a browser_id + email (no login required)."""
    o, d = body.origin.upper(), body.destination.upper()
    if o == d:
        raise HTTPException(400, "The departure and arrival cities are the same.")
    _validate_route(f"{o}-{d}")
    now = timeutil.stamp()
    conn.execute(
        "INSERT INTO saved_routes (browser_id, origin, destination, preferred_days, email, created_at) "
        "VALUES (?,?,?,?,?,?) ON CONFLICT(browser_id, origin, destination) DO UPDATE SET "
        "preferred_days = excluded.preferred_days, email = excluded.email",
        (body.browser_id, o, d, json.dumps(body.preferred_days), body.email, now),
    )
    conn.commit()
    row = conn.execute("SELECT * FROM saved_routes WHERE browser_id = ? AND origin = ? AND destination = ?",
                       (body.browser_id, o, d)).fetchone()
    return _saved_row(row)


@app.get("/routes/saved/{browser_id}", tags=["alerts"], response_model=S.SavedRoutes)
def list_saved_routes(browser_id: str, conn: sqlite3.Connection = Depends(get_db)):
    rows = conn.execute("SELECT * FROM saved_routes WHERE browser_id = ? ORDER BY created_at",
                        (browser_id,)).fetchall()
    return {"browser_id": browser_id, "routes": [_saved_row(r) for r in rows]}


@app.delete("/routes/saved/{browser_id}/{route_id}", tags=["alerts"], status_code=204)
def delete_saved_route(browser_id: str, route_id: int, conn: sqlite3.Connection = Depends(get_db)):
    cur = conn.execute("DELETE FROM saved_routes WHERE browser_id = ? AND id = ?", (browser_id, route_id))
    conn.commit()
    if cur.rowcount == 0:
        raise HTTPException(404, "That alert doesn't exist (it may already have been removed).")


@app.get("/routes/{browser_id}/alerts", tags=["alerts"], response_model=S.RouteAlerts)
def route_alerts(browser_id: str, conn: sqlite3.Connection = Depends(get_db)):
    """
    Is any saved route cheap today? Uses exactly the same rule as the email job
    (pipeline.notifier.fare_levels), so the page and the inbox cannot disagree.
    """
    rows = conn.execute("SELECT * FROM saved_routes WHERE browser_id = ?", (browser_id,)).fetchall()
    latest = notifier.latest_date(conn)
    out = []
    for r in rows:
        route = f"{r['origin']}-{r['destination']}"
        lv = notifier.fare_levels(conn, route, latest)
        out.append({
            "route": route, "label": route_label(route),
            "today_fare": lv["today"], "baseline_fare": lv["baseline"],
            "pct_below_baseline": lv["pct_below"], "is_cheap": lv["is_cheap"],
            "last_notified_at": r["last_notified_at"],
        })
    return {
        "browser_id": browser_id,
        "checked_at": timeutil.stamp(),
        "any_cheap": any(a["is_cheap"] for a in out),
        "threshold_pct": notifier.THRESHOLD * 100,
        "baseline_days": notifier.BASELINE_DAYS,
        "alerts": out,
    }

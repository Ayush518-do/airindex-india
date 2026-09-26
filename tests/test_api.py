"""
Every endpoint, against an empty store (the `available: false` paths) and a
seeded one. Errors must all use the same envelope: {error, detail, path}.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta

import pytest

from pipeline import timeutil
from fastapi.testclient import TestClient

from pipeline import fare_model
from tests.conftest import insert_fare


@pytest.fixture
def empty_client(db_path):
    from backend.main import app
    with TestClient(app) as c:
        yield c


@pytest.fixture
def client(seeded_db):
    from backend.main import app
    with TestClient(app) as c:
        yield c


def _is_error(resp, status: int) -> dict:
    assert resp.status_code == status, resp.text
    body = resp.json()
    assert set(body) >= {"error", "detail", "path"}, f"not the error envelope: {body}"
    return body


def _official(conn, n_months: int = 24) -> None:
    for i in range(n_months):
        y, m = 2024 + i // 12, i % 12 + 1
        conn.execute(
            "INSERT INTO official_cpi (dataset, level, base_year, series, item_code, item_name, sector,"
            " year, month, month_num, period, index_value, inflation, status, fetched_at)"
            " VALUES ('CPI','Item','2012','Current','6.1.03.3.2.07.0','Air Fare (normal): Economy Class(adult)',"
            " 'All', ?, 'M', ?, ?, ?, 1.0, 'F', ?)",
            (y, m, f"{y:04d}-{m:02d}", 190 + i, timeutil.now().isoformat()),
        )
    conn.commit()


# --------------------------------------------------------------------------- #
# Empty store: honest "nothing yet" answers, never invented data
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize("path, reason", [
    ("/index/daily", "no_index_data"),
    ("/index/forecast", "insufficient_history"),
    ("/index/heatmap", "no_index_data"),
    ("/routes/DEL-BOM/trend", "no_index_data"),
    ("/fares/raw", "no_index_data"),
    ("/festivals/surge", "no_index_data"),
    ("/official/cpi", "no_official_data"),
    ("/official/compare", "no_official_data"),
    ("/routes/DEL-BOM/best-time", "insufficient_history"),
])
def test_empty_store_reports_unavailable(empty_client, path, reason):
    r = empty_client.get(path)
    assert r.status_code == 200, "empty is a normal state, not a server error"
    body = r.json()
    assert body["available"] is False
    assert body["reason"] == reason
    assert body["message"], "the UI shows this to users, so it must say something"


def test_empty_forecast_says_how_much_history_is_missing(empty_client):
    body = empty_client.get("/index/forecast").json()
    assert (body["have"], body["need"]) == (0, 10)
    assert body["points"] == []


def test_empty_meta(empty_client):
    body = empty_client.get("/meta").json()
    assert body["has_data"] is False
    assert body["data_mode"] == "live" and body["demo_mode"] is False
    assert body["carriers"] == []


def test_empty_health_is_degraded_but_up(empty_client):
    r = empty_client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "degraded"
    assert body["database"]["reachable"] is True
    assert any("no real scrape" in w for w in body["warnings"])


def test_untrained_model_is_a_503_with_the_envelope(empty_client):
    _is_error(empty_client.get("/model/info"), 503)
    future = (date.today() + timedelta(days=20)).isoformat()
    _is_error(empty_client.get(f"/predict?route=DEL-BOM&travel_date={future}"), 503)


# --------------------------------------------------------------------------- #
# Meta / health
# --------------------------------------------------------------------------- #
def test_meta_labels_routes_with_city_names(client):
    body = client.get("/meta").json()
    assert body["has_data"] is True
    labels = {r["route"]: r["label"] for r in body["route_details"]}
    assert labels["DEL-BOM"] == "Delhi (DEL) → Mumbai (BOM)"
    assert body["window_labels"]["0-3"].startswith("Booked 0")


def test_cities(client):
    cities = {c["code"]: c for c in client.get("/meta/cities").json()}
    assert cities["BLR"]["city"] == "Bengaluru"
    assert cities["BLR"]["label"] == "Bengaluru (BLR)"
    assert cities["BLR"]["state"] == "Karnataka"
    # every basket route's endpoints must be covered
    for route in client.get("/meta").json()["routes"]:
        for code in route.split("-"):
            assert code in cities


def test_health_reports_sources_and_staleness(client, conn):
    old = (timeutil.now() - timedelta(days=5)).isoformat(timespec="seconds")
    conn.execute(
        "INSERT INTO source_health (source, last_run_at, last_ok_at, status, n_ok, n_failed, n_records,"
        " last_error, updated_at) VALUES ('stalesource', ?, ?, 'failing', 0, 30, 0, 'Timeout', ?)",
        (old, old, old),
    )
    conn.commit()
    body = client.get("/health").json()
    src = {s["source"]: s for s in body["sources"]}
    assert src["stalesource"]["stale"] is True
    assert body["status"] == "degraded"
    assert any("stalesource" in w for w in body["warnings"])


# --------------------------------------------------------------------------- #
# Index
# --------------------------------------------------------------------------- #
def test_index_daily(client):
    body = client.get("/index/daily").json()
    assert body["available"] is True
    assert len(body["points"]) == 12
    assert body["points"][0]["value"] == 100.0
    assert body["n_synthetic_days"] == 0


def test_forecast_available_with_enough_history(client):
    body = client.get("/index/forecast?days=5").json()
    assert body["available"] is True
    assert len(body["points"]) == 5
    for p in body["points"]:
        assert p["lower"] <= p["value"] <= p["upper"]


@pytest.mark.parametrize("days", [2, 8])
def test_forecast_horizon_is_bounded(client, days):
    _is_error(client.get(f"/index/forecast?days={days}"), 422)


def test_heatmap(client):
    body = client.get("/index/heatmap").json()
    assert body["available"] is True and body["cells"]
    assert {c["window"] for c in body["cells"]} <= set(body["windows"])


def test_heatmap_rejects_bad_dates(client):
    _is_error(client.get("/index/heatmap?date=yesterday"), 422)


# --------------------------------------------------------------------------- #
# Routes / fares
# --------------------------------------------------------------------------- #
def test_route_trend_has_labels_and_best_window(client):
    body = client.get("/routes/DEL-BOM/trend").json()
    assert body["label"] == "Delhi (DEL) → Mumbai (BOM)"
    assert all(w["label"] for w in body["windows"])
    best = body["best_window"]
    assert best and best["saving_pct"] >= 0
    priced = [w["actual_avg"] for w in body["windows"] if w["actual_avg"]]
    assert best["avg_fare"] == round(min(priced))


def test_unknown_route_is_404_with_readable_detail(client):
    body = _is_error(client.get("/routes/XXX-YYY/trend"), 404)
    assert "Delhi (DEL)" in body["detail"], "tell the user which routes do exist"


def test_fares_raw_pagination(client):
    first = client.get("/fares/raw?route=DEL-BOM&limit=5").json()
    assert first["count"] == 5 and first["has_more"] is True and first["next_offset"] == 5

    last = client.get(f"/fares/raw?route=DEL-BOM&limit=5&offset={first['total'] - 2}").json()
    assert last["count"] == 2 and last["has_more"] is False and last["next_offset"] is None


def test_fares_raw_validates_dates(client):
    _is_error(client.get("/fares/raw?date_from=2026-13-40"), 422)
    _is_error(client.get("/fares/raw?date_from=2026-10-10&date_to=2026-10-01"), 400)


def test_fares_raw_never_returns_synthetic_rows_by_default(client, conn):
    latest = conn.execute("SELECT MAX(scrape_date) FROM fares").fetchone()[0]
    insert_fare(conn, snapshot_file="seeded.json", scrape_date=latest, is_synthetic=1, total_fare=12345)
    conn.commit()
    fares = client.get("/fares/raw?route=DEL-BOM&limit=5000").json()["records"]
    assert all(not f["is_synthetic"] for f in fares)
    assert 12345 not in {f["total_fare"] for f in fares}


def test_predict_rejects_past_and_far_future_dates(client):
    _is_error(client.get("/predict?route=DEL-BOM&travel_date=2020-01-01"), 400)
    far = (date.today() + timedelta(days=400)).isoformat()
    _is_error(client.get(f"/predict?route=DEL-BOM&travel_date={far}"), 400)


@pytest.mark.slow
def test_predict_after_training(client):
    assert fare_model.run()["trained"] is True
    future = (date.today() + timedelta(days=20)).isoformat()
    body = client.get(f"/predict?route=DEL-BOM&travel_date={future}").json()
    assert body["predicted_fare"] > 500
    assert client.get("/model/info").json()["n_synthetic"] == 0


# --------------------------------------------------------------------------- #
# Official statistics
# --------------------------------------------------------------------------- #
def test_official_cpi(client, conn):
    _official(conn)
    body = client.get("/official/cpi?level=Item").json()
    assert body["available"] is True and body["n_months"] == 24
    ranged = client.get("/official/cpi?level=Item&date_from=2025-01&date_to=2025-03").json()
    assert [p["period"] for p in ranged["points"]] == ["2025-01", "2025-02", "2025-03"]


@pytest.mark.parametrize("q", ["level=Group", "sector=Metro", "date_from=2025-13", "date_from=Jan"])
def test_official_cpi_rejects_bad_filters(client, q):
    _is_error(client.get(f"/official/cpi?{q}"), 422)


def test_official_compare_without_overlap(client, conn):
    _official(conn)   # 2024-01..2025-12; the seeded index is in the present, so no overlap
    body = client.get("/official/compare").json()
    assert body["available"] is True
    assert body["overlap"]["available"] is False
    assert body["overlap"]["reason"] == "pending_overlap"
    assert "no overlapping month" in body["link"]["basis"]
    assert len(body["seasonal"]["months"]) == 12


# --------------------------------------------------------------------------- #
# Festivals
# --------------------------------------------------------------------------- #
def test_festivals(client):
    surge = client.get("/festivals/surge").json()
    assert surge["available"] is True
    for row in surge["surge"]:
        assert "→" in row["label"]
    cal = client.get("/festivals/calendar").json()
    assert any(f["name"] == "Diwali" for f in cal["festivals"])


# --------------------------------------------------------------------------- #
# Saved routes + alerts
# --------------------------------------------------------------------------- #
ALERT = {"browser_id": "browser-123", "origin": "DEL", "destination": "BOM", "email": "me@example.com"}


def test_alert_lifecycle(client):
    r = client.post("/routes/save", json=ALERT)
    assert r.status_code == 201
    saved = r.json()
    assert saved["label"] == "Delhi (DEL) → Mumbai (BOM)"

    listed = client.get("/routes/saved/browser-123").json()["routes"]
    assert [x["id"] for x in listed] == [saved["id"]]

    alerts = client.get("/routes/browser-123/alerts").json()
    assert alerts["threshold_pct"] == 15.0 and alerts["baseline_days"] == 14
    assert alerts["alerts"][0]["label"] == "Delhi (DEL) → Mumbai (BOM)"

    mine = {"X-Browser-Id": "browser-123"}
    assert client.delete(f"/routes/{saved['id']}", headers=mine).status_code == 204
    _is_error(client.delete(f"/routes/{saved['id']}", headers=mine), 404)
    assert client.get("/routes/saved/browser-123").json()["routes"] == []


def test_saving_twice_updates_rather_than_duplicates(client):
    client.post("/routes/save", json=ALERT)
    client.post("/routes/save", json={**ALERT, "email": "new@example.com"})
    routes = client.get("/routes/saved/browser-123").json()["routes"]
    assert len(routes) == 1 and routes[0]["email"] == "new@example.com"


@pytest.mark.parametrize("change, status", [
    ({"email": "not-an-email"}, 422),
    ({"origin": "DELHI"}, 422),
    ({"browser_id": "x"}, 422),
    ({"destination": "DEL"}, 400),        # same city both ends
    ({"origin": "GOI", "destination": "PAT"}, 404),   # a route we do not track
])
def test_alert_validation(client, change, status):
    _is_error(client.post("/routes/save", json={**ALERT, **change}), status)


def test_alert_threshold_matches_the_notifier(client):
    from pipeline import notifier
    body = client.get("/routes/nobody/alerts").json()
    assert body["threshold_pct"] == notifier.THRESHOLD * 100
    assert body["baseline_days"] == notifier.BASELINE_DAYS


# --------------------------------------------------------------------------- #
# Cross-cutting
# --------------------------------------------------------------------------- #
def test_cors_allows_the_frontend_origin(client):
    r = client.get("/meta", headers={"Origin": "http://localhost:5173"})
    assert r.headers.get("access-control-allow-origin") == "http://localhost:5173"


def test_openapi_documents_every_route(client):
    paths = set(client.get("/openapi.json").json()["paths"])
    assert "/backtest/dgca" not in paths, "superseded by /official/compare"
    for p in ["/health", "/meta", "/meta/cities", "/index/daily", "/index/forecast", "/index/heatmap",
              "/routes/{route}/trend", "/fares/raw", "/predict", "/official/cpi", "/official/compare",
              "/festivals/surge", "/routes/save", "/routes/{browser_id}/alerts",
              "/routes/{route}/best-time", "/routes/{route_id}"]:
        assert p in paths


# --------------------------------------------------------------------------- #
# Deleting alerts is scoped to the browser that created them
# --------------------------------------------------------------------------- #
def test_another_browser_cannot_delete_my_alert(client):
    rid = client.post("/routes/save", json=ALERT).json()["id"]
    # Same 404 as a missing id, so ids can't be probed for existence.
    _is_error(client.delete(f"/routes/{rid}", headers={"X-Browser-Id": "someone-else"}), 404)
    assert [r["id"] for r in client.get("/routes/saved/browser-123").json()["routes"]] == [rid]


def test_delete_requires_the_browser_header(client):
    rid = client.post("/routes/save", json=ALERT).json()["id"]
    _is_error(client.delete(f"/routes/{rid}"), 422)


def test_deleting_one_alert_leaves_the_others(client):
    a = client.post("/routes/save", json=ALERT).json()["id"]
    b = client.post("/routes/save", json={**ALERT, "destination": "BLR"}).json()["id"]
    assert client.delete(f"/routes/{a}", headers={"X-Browser-Id": "browser-123"}).status_code == 204
    assert [r["id"] for r in client.get("/routes/saved/browser-123").json()["routes"]] == [b]


# --------------------------------------------------------------------------- #
# Best time to book
# --------------------------------------------------------------------------- #
def test_best_time_picks_the_cheapest_window(client, conn):
    body = client.get("/routes/DEL-BOM/best-time").json()
    assert body["available"] is True
    fares = {w["window"]: w["avg_fare"] for w in body["windows"]}
    assert body["best"]["avg_fare"] == min(fares.values())
    assert body["summary"].startswith("Cheapest to book about")
    assert "before travel" in body["summary"] and "₹" in body["summary"]
    assert 0 <= body["saving_pct"] < 100


def test_best_time_uses_all_history_not_one_day(conn, db_path):
    # Day 1: the 0-3 window is cheap once; every other day it's the dearest.
    rows = [("2026-09-01", "0-3", 3000), ("2026-09-01", "31-60", 6000)]
    rows += [(f"2026-09-{d:02d}", "0-3", 9000) for d in range(2, 8)]
    rows += [(f"2026-09-{d:02d}", "31-60", 6000) for d in range(2, 8)]
    for date_, w, fare in rows:
        conn.execute("INSERT INTO route_daily (date, route, window, avg_fare, median_fare, min_fare, n, is_synthetic)"
                     " VALUES (?, 'DEL-BOM', ?, ?, ?, ?, 25, 0)", (date_, w, fare, fare, fare))
    conn.commit()
    from backend.main import app
    with TestClient(app) as c:
        body = c.get("/routes/DEL-BOM/best-time").json()
    assert body["best"]["window"] == "31-60"
    assert body["best"]["typical_days"] == 45


def test_best_time_needs_enough_fares(conn, db_path):
    conn.execute("INSERT INTO route_daily (date, route, window, avg_fare, median_fare, min_fare, n, is_synthetic)"
                 " VALUES ('2026-09-01', 'DEL-BOM', '0-3', 5000, 5000, 5000, 3, 0)")
    conn.commit()
    from backend.main import app
    with TestClient(app) as c:
        body = c.get("/routes/DEL-BOM/best-time").json()
    assert body["available"] is False and body["reason"] == "insufficient_history"
    assert "Delhi (DEL)" in body["message"]

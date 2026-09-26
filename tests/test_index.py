"""
APIx maths against hand-computed values.

The worked example, two routes, one window each:

    base day 2026-09-01:  DEL-BOM 0-3 = mean(4800, 5200) = 5000   DEL-BLR 0-3 = 8000
    day 2    2026-09-02:  DEL-BOM 0-3 = 5500  (rel 1.10)           DEL-BLR 0-3 = 7200  (rel 0.90)

    APIx = 100 × (0.26 × 1.10 + 0.20 × 0.90) / (0.26 + 0.20)
         = 100 × 0.466 / 0.46 = 101.304…  ->  101.30

    coverage = (0.26/5 + 0.20/5) / 1.00 = 0.092   (2 of 30 route×window cells, weighted)
"""
from __future__ import annotations

import pytest

from pipeline import index
from tests.conftest import insert_fare


def _fare(conn, day, route, window, fare, adv=2, **kw):
    o, d = route.split("-")
    kw.setdefault("snapshot_file", f"{day}.json")
    insert_fare(conn, scrape_date=day, scraped_at=f"{day}T09:00:00",
                route=route, origin=o, destination=d, advance_purchase_window=window,
                advance_purchase_days=adv, total_fare=fare, **kw)


@pytest.fixture
def worked_example(conn):
    _fare(conn, "2026-09-01", "DEL-BOM", "0-3", 4800)
    _fare(conn, "2026-09-01", "DEL-BOM", "0-3", 5200)
    _fare(conn, "2026-09-01", "DEL-BLR", "0-3", 8000)
    _fare(conn, "2026-09-02", "DEL-BOM", "0-3", 5500)
    _fare(conn, "2026-09-02", "DEL-BLR", "0-3", 7200)
    conn.commit()
    return conn


def _series(conn):
    index.compute_route_daily(conn)
    return {p["date"]: p for p in index.compute_index_daily(conn)}


def test_base_day_is_exactly_100(worked_example):
    assert _series(worked_example)["2026-09-01"]["value"] == 100.0


def test_weighted_laspeyres_value(worked_example):
    assert _series(worked_example)["2026-09-02"]["value"] == pytest.approx(101.30, abs=0.005)


def test_coverage_is_weighted_share_of_cells(worked_example):
    assert _series(worked_example)["2026-09-02"]["coverage"] == pytest.approx(0.092, abs=1e-3)


def test_route_relative_is_mean_over_windows(conn):
    # One route, two windows moving +10% and -10% -> route relative 1.0.
    _fare(conn, "2026-09-01", "DEL-BOM", "0-3", 5000)
    _fare(conn, "2026-09-01", "DEL-BOM", "8-14", 4000, adv=10)
    _fare(conn, "2026-09-02", "DEL-BOM", "0-3", 5500)
    _fare(conn, "2026-09-02", "DEL-BOM", "8-14", 3600, adv=10)
    conn.commit()
    assert _series(conn)["2026-09-02"]["value"] == pytest.approx(100.0)


def test_synthetic_rows_never_move_the_live_index(worked_example):
    # A wildly priced seeded fare on day 2 must be invisible in live mode.
    _fare(worked_example, "2026-09-02", "DEL-BOM", "0-3", 50_000, is_synthetic=1, snapshot_file="seed.json")
    worked_example.commit()
    assert _series(worked_example)["2026-09-02"]["value"] == pytest.approx(101.30, abs=0.005)


def test_outliers_are_excluded(worked_example):
    _fare(worked_example, "2026-09-02", "DEL-BOM", "0-3", 40_000, is_outlier=1)
    worked_example.commit()
    assert _series(worked_example)["2026-09-02"]["value"] == pytest.approx(101.30, abs=0.005)


def test_connecting_flights_are_excluded(worked_example):
    _fare(worked_example, "2026-09-02", "DEL-BOM", "0-3", 40_000, stops=1)
    worked_example.commit()
    assert _series(worked_example)["2026-09-02"]["value"] == pytest.approx(101.30, abs=0.005)


def test_cells_missing_from_the_base_day_are_skipped(worked_example):
    # BOM-BLR first appears on day 2: no base to compare against, so it cannot
    # contribute a relative and must not distort the index.
    _fare(worked_example, "2026-09-02", "BOM-BLR", "0-3", 9999)
    worked_example.commit()
    day2 = _series(worked_example)["2026-09-02"]
    assert day2["value"] == pytest.approx(101.30, abs=0.005)
    assert day2["n_routes"] == 2


def test_route_daily_median_and_min(worked_example):
    index.compute_route_daily(worked_example)
    row = worked_example.execute(
        "SELECT avg_fare, median_fare, min_fare, n FROM route_daily WHERE date='2026-09-01' AND route='DEL-BOM'"
    ).fetchone()
    assert (row["avg_fare"], row["median_fare"], row["min_fare"], row["n"]) == (5000, 5000, 4800, 2)


def test_get_index_daily_reports_change(worked_example):
    _series(worked_example)
    out = index.get_index_daily(worked_example)
    assert out["base_date"] == "2026-09-01"
    assert out["latest"]["change_pct"] == pytest.approx(1.30, abs=0.01)
    assert out["n_real_days"] == 2 and out["n_synthetic_days"] == 0


def test_weights_sum_to_one():
    assert sum(index.ROUTE_WEIGHTS.values()) == pytest.approx(1.0)

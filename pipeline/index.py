"""
Airfare Price Index (APIx) — daily, route-weighted, base day = 100.

Method (fixed-basket, Laspeyres-style):

1. Cell = (route, advance-purchase window). For each scrape day D we take the
   mean nonstop economy total fare of every cell (outliers excluded).
2. Cell price relative  rel[D][r][w] = avg[D][r][w] / avg[BASE][r][w]
3. Route relative       rel[D][r]    = mean over available windows w
4. APIx[D] = 100 x sum_r ( W_r * rel[D][r] ) / sum_r W_r   over routes present on D

W_r are DGCA domestic traffic-share weights for the six basket routes
(hard-coded in ROUTE_WEIGHTS, normalised to 1). BASE = first captured day.
Coverage = share of basket weight (route x window) actually observed on D.

    python -m pipeline.index      # recompute route_daily + index_daily tables
"""
from __future__ import annotations

import logging
from datetime import datetime

from pipeline.db import session

log = logging.getLogger("pipeline.index")

INDEX_NAME = "APIx"

# Approximate DGCA domestic pax share among these six sectors, normalised.
ROUTE_WEIGHTS: dict[str, float] = {
    "DEL-BOM": 0.26,
    "DEL-BLR": 0.20,
    "BOM-BLR": 0.18,
    "DEL-CCU": 0.13,
    "MAA-DEL": 0.12,
    "BLR-HYD": 0.11,
}
WINDOWS = ["0-3", "4-7", "8-14", "15-30", "31-60"]

# Only comparable product goes into the index: nonstop, economy, non-outlier.
INDEX_FILTER = "stops = 0 AND fare_class = 'economy' AND is_outlier = 0 AND in_basket = 1"


def compute_route_daily(conn) -> int:
    """Rebuild route_daily from fares. Returns row count."""
    conn.execute("DELETE FROM route_daily")
    rows = conn.execute(f"""
        SELECT scrape_date AS date, route, advance_purchase_window AS window,
               AVG(total_fare) AS avg_fare, MIN(total_fare) AS min_fare, COUNT(*) AS n,
               GROUP_CONCAT(total_fare) AS fares
        FROM fares
        WHERE {INDEX_FILTER}
        GROUP BY scrape_date, route, advance_purchase_window
    """).fetchall()
    out = []
    for r in rows:
        fares = sorted(float(x) for x in r["fares"].split(","))
        mid = len(fares) // 2
        median = fares[mid] if len(fares) % 2 else (fares[mid - 1] + fares[mid]) / 2
        out.append((r["date"], r["route"], r["window"], round(r["avg_fare"], 2), round(median, 2), r["min_fare"], r["n"]))
    conn.executemany(
        "INSERT INTO route_daily (date, route, window, avg_fare, median_fare, min_fare, n) VALUES (?,?,?,?,?,?,?)", out
    )
    return len(out)


def compute_index_daily(conn) -> list[dict]:
    """Rebuild index_daily from route_daily. Returns the series."""
    cells = conn.execute("SELECT date, route, window, avg_fare, n FROM route_daily ORDER BY date").fetchall()
    if not cells:
        conn.execute("DELETE FROM index_daily")
        return []

    by_date: dict[str, dict[tuple[str, str], tuple[float, int]]] = {}
    for c in cells:
        by_date.setdefault(c["date"], {})[(c["route"], c["window"])] = (c["avg_fare"], c["n"])

    dates = sorted(by_date)
    base_date = dates[0]
    base = by_date[base_date]

    # Which dates are synthetic (all of their fare rows come from backfill)?
    synth = {
        r["scrape_date"]: bool(r["all_synth"])
        for r in conn.execute("SELECT scrape_date, MIN(is_synthetic) AS all_synth FROM fares GROUP BY scrape_date")
    }

    total_w = sum(ROUTE_WEIGHTS.values())
    cell_w = {(r, w): ROUTE_WEIGHTS[r] / len(WINDOWS) for r in ROUTE_WEIGHTS for w in WINDOWS}

    series = []
    conn.execute("DELETE FROM index_daily")
    for d in dates:
        today = by_date[d]
        route_rel: dict[str, list[float]] = {}
        covered_w = 0.0
        n_records = 0
        for (r, w), (avg, n) in today.items():
            if r not in ROUTE_WEIGHTS or (r, w) not in base:
                continue
            route_rel.setdefault(r, []).append(avg / base[(r, w)][0])
            covered_w += cell_w[(r, w)]
            n_records += n
        if not route_rel:
            continue
        num = sum(ROUTE_WEIGHTS[r] * (sum(v) / len(v)) for r, v in route_rel.items())
        den = sum(ROUTE_WEIGHTS[r] for r in route_rel)
        value = round(100.0 * num / den, 2)
        coverage = round(covered_w / total_w, 3)
        row = {
            "date": d, "value": value, "n_records": n_records, "n_routes": len(route_rel),
            "coverage": coverage, "is_synthetic": 1 if synth.get(d) else 0,
        }
        series.append(row)
        conn.execute(
            "INSERT INTO index_daily (date, value, n_records, n_routes, coverage, is_synthetic, computed_at) VALUES (?,?,?,?,?,?,?)",
            (d, value, n_records, len(route_rel), coverage, row["is_synthetic"], datetime.now().isoformat(timespec="seconds")),
        )
    return series


def run() -> dict:
    with session() as conn:
        n_cells = compute_route_daily(conn)
        series = compute_index_daily(conn)
    log.info("route_daily: %d cells; index_daily: %d days", n_cells, len(series))
    return {"cells": n_cells, "days": len(series), "latest": series[-1] if series else None}


# ----------------------------------------------------------------------------
# Read helpers used by the API
# ----------------------------------------------------------------------------
def get_index_daily(conn) -> dict:
    rows = conn.execute("SELECT * FROM index_daily ORDER BY date").fetchall()
    points = []
    for i, r in enumerate(rows):
        prev = rows[i - 1]["value"] if i else None
        points.append({
            "date": r["date"], "value": r["value"],
            "change_pct": round((r["value"] - prev) / prev * 100, 2) if prev else None,
            "n_records": r["n_records"], "coverage": r["coverage"], "is_synthetic": bool(r["is_synthetic"]),
        })
    latest = points[-1] if points else None
    prev = points[-2] if len(points) > 1 else None
    return {
        "index_name": INDEX_NAME,
        "base_date": points[0]["date"] if points else None,
        "base_value": 100.0,
        "weights": ROUTE_WEIGHTS,
        "points": points,
        "latest": {
            "date": latest["date"], "value": latest["value"], "change_pct": latest["change_pct"],
            "change_abs": round(latest["value"] - prev["value"], 2) if prev else 0.0,
        } if latest else None,
        "n_real_days": sum(1 for p in points if not p["is_synthetic"]),
        "n_synthetic_days": sum(1 for p in points if p["is_synthetic"]),
    }


def get_heatmap(conn, date: str | None = None) -> dict:
    if date is None:
        r = conn.execute("SELECT MAX(date) AS d FROM route_daily").fetchone()
        date = r["d"] if r else None
    cells = conn.execute(
        "SELECT route, window, avg_fare, n FROM route_daily WHERE date = ?", (date,)
    ).fetchall() if date else []
    return {
        "date": date,
        "routes": list(ROUTE_WEIGHTS),
        "windows": WINDOWS,
        "cells": [{"route": c["route"], "window": c["window"], "avg_fare": round(c["avg_fare"]), "n": c["n"]} for c in cells],
    }


def get_route_trend(conn, route: str, date: str | None = None) -> dict:
    if date is None:
        r = conn.execute("SELECT MAX(date) AS d FROM route_daily WHERE route = ?", (route,)).fetchone()
        date = r["d"] if r else None
    cells = {
        c["window"]: c for c in conn.execute(
            "SELECT window, avg_fare, median_fare, min_fare, n FROM route_daily WHERE date = ? AND route = ?", (date, route)
        )
    }
    maxes = {
        r["window"]: r["mx"] for r in conn.execute(
            f"SELECT advance_purchase_window AS window, MAX(total_fare) AS mx FROM fares "
            f"WHERE scrape_date = ? AND route = ? AND {INDEX_FILTER} GROUP BY advance_purchase_window", (date, route)
        )
    }
    windows = []
    for w in WINDOWS:
        c = cells.get(w)
        windows.append({
            "window": w,
            "actual_avg": round(c["avg_fare"]) if c else None,
            "median": round(c["median_fare"]) if c else None,
            "predicted_avg": None,          # filled by pipeline.fare_model (step 7)
            "min_fare": round(c["min_fare"]) if c else None,
            "max_fare": round(maxes[w]) if w in maxes else None,
            "n": c["n"] if c else 0,
        })
    carriers = [
        {"carrier": r["carrier"], "carrier_name": r["carrier_name"], "avg_fare": round(r["avg"]), "n": r["n"]}
        for r in conn.execute(
            f"SELECT carrier, MAX(carrier_name) AS carrier_name, AVG(total_fare) AS avg, COUNT(*) AS n FROM fares "
            f"WHERE scrape_date = ? AND route = ? AND {INDEX_FILTER} GROUP BY carrier ORDER BY n DESC", (date, route)
        )
    ]
    return {"route": route, "date": date, "windows": windows, "carriers": carriers}


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s", datefmt="%H:%M:%S")
    print(run())

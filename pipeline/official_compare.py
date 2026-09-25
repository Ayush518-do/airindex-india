"""
Official CPI (MoSPI) vs our real-time APIx.

Three jobs, in order of how much they can honestly claim:

1. **Link** — APIx is base-100 on its own first captured day, which says
   nothing about rupee levels. Rescaling it onto the CPI airfare index puts
   both on one axis. This is a *link*, not a measurement: it asserts the two
   agreed at one chosen period and nothing more.

2. **Overlap stats** — correlation/MAE only exist where both series cover the
   same months. Today they do not overlap at all (CPI ends 2025-12, scraping
   began 2026-09), so this reports `pending_overlap` rather than a number.
   Do not let the UI imply a validated relationship before this populates.

3. **Seasonal profile** — twelve years of CPI airfare gives a reliable
   month-of-year shape (how much a typical September moves). That is a real
   comparison we can make today, and it is the honest thing to show while the
   overlap is empty.
"""
from __future__ import annotations

import logging
import statistics
from datetime import date

from pipeline.db import session
from pipeline.index import get_index_daily

log = logging.getLogger("pipeline.official_compare")

MIN_OVERLAP_MONTHS = 3
MONTH_NAMES = ["January", "February", "March", "April", "May", "June",
               "July", "August", "September", "October", "November", "December"]


def _cpi_series(conn, level: str = "Item", sector: str = "All") -> list[dict]:
    rows = conn.execute(
        "SELECT period, year, month_num, index_value, inflation, item_name, status "
        "FROM official_cpi WHERE level = ? AND sector = ? ORDER BY period",
        (level, sector),
    ).fetchall()
    return [dict(r) for r in rows]


def _apix_monthly(conn) -> list[dict]:
    """APIx averaged per calendar month, with the day count behind each point."""
    rows = conn.execute(
        "SELECT substr(date, 1, 7) AS period, AVG(value) AS value, COUNT(*) AS n_days "
        "FROM index_daily GROUP BY period ORDER BY period"
    ).fetchall()
    return [{"period": r["period"], "value": round(r["value"], 2), "n_days": r["n_days"]} for r in rows]


def _pearson(xs: list[float], ys: list[float]) -> float | None:
    if len(xs) < 2:
        return None
    mx, my = statistics.fmean(xs), statistics.fmean(ys)
    num = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    dx = sum((x - mx) ** 2 for x in xs) ** 0.5
    dy = sum((y - my) ** 2 for y in ys) ** 0.5
    return round(num / (dx * dy), 4) if dx and dy else None


def seasonal_profile(cpi: list[dict]) -> list[dict]:
    """Mean month-over-month % change per calendar month across all CPI years."""
    by_period = {r["period"]: r["index_value"] for r in cpi}
    moves: dict[int, list[float]] = {m: [] for m in range(1, 13)}
    for r in cpi:
        y, m = r["year"], r["month_num"]
        prev_y, prev_m = (y, m - 1) if m > 1 else (y - 1, 12)
        prev = by_period.get(f"{prev_y:04d}-{prev_m:02d}")
        if prev:
            moves[m].append((r["index_value"] / prev - 1) * 100)
    return [
        {
            "month_num": m,
            "month": MONTH_NAMES[m - 1],
            "mean_change_pct": round(statistics.fmean(v), 2),
            "min_change_pct": round(min(v), 2),
            "max_change_pct": round(max(v), 2),
            "n_years": len(v),
        }
        for m, v in moves.items() if v
    ]


def compute(conn) -> dict:
    cpi = _cpi_series(conn)
    apix = _apix_monthly(conn)

    if not cpi:
        return {
            "available": False,
            "reason": "no_official_data",
            "message": "Official CPI has not been fetched yet — run `python -m pipeline.mospi`.",
        }

    cpi_by_period = {r["period"]: r["index_value"] for r in cpi}
    shared = sorted(set(cpi_by_period) & {a["period"] for a in apix})

    # --- link -------------------------------------------------------------
    # Prefer a shared period; fall back to the newest CPI month and say so.
    if shared:
        link_period = shared[-1]
        link_basis = "overlapping month"
    else:
        link_period = cpi[-1]["period"]
        link_basis = "no overlapping month yet — anchored to the latest official month"
    link_value = cpi_by_period[link_period]

    apix_at_link = next((a["value"] for a in apix if a["period"] == link_period), None)
    # APIx is base-100, so scaling by the CPI level at the link point is the
    # whole transform when we have no common month to calibrate against.
    scale = (link_value / apix_at_link) if apix_at_link else (link_value / 100.0)

    apix_linked = [{**a, "linked_value": round(a["value"] * scale, 2)} for a in apix]

    # --- overlap stats ----------------------------------------------------
    if len(shared) >= MIN_OVERLAP_MONTHS:
        xs = [cpi_by_period[p] for p in shared]
        ys = [next(a["linked_value"] for a in apix_linked if a["period"] == p) for p in shared]
        errs = [abs(y - x) for x, y in zip(xs, ys)]
        stats = {
            "available": True,
            "overlap_months": len(shared),
            "periods": shared,
            "correlation": _pearson(xs, ys),
            "mae_index_points": round(statistics.fmean(errs), 2),
            "mape_pct": round(statistics.fmean([e / x * 100 for e, x in zip(errs, xs)]), 2),
        }
    else:
        stats = {
            "available": False,
            "reason": "pending_overlap",
            "overlap_months": len(shared),
            "need": MIN_OVERLAP_MONTHS,
            "message": (
                f"Official CPI runs to {cpi[-1]['period']}; APIx starts "
                f"{apix[0]['period'] if apix else 'n/a'}. Correlation appears once the two "
                f"series share at least {MIN_OVERLAP_MONTHS} months."
            ),
        }

    return {
        "available": True,
        "official": {
            "source": "MoSPI eSankhyiki — Consumer Price Index",
            "item_name": cpi[0]["item_name"],
            "base_year": 2012,
            "first_period": cpi[0]["period"],
            "latest_period": cpi[-1]["period"],
            "n_months": len(cpi),
            "points": [
                {"period": r["period"], "index": r["index_value"], "inflation_pct": r["inflation"]}
                for r in cpi
            ],
        },
        "apix": {
            "n_months": len(apix),
            "first_period": apix[0]["period"] if apix else None,
            "points": apix_linked,
        },
        "link": {
            "period": link_period,
            "official_index": link_value,
            "scale": round(scale, 4),
            "basis": link_basis,
        },
        "overlap": stats,
        "seasonal": {
            "note": "Mean month-over-month change in the official airfare index, 2014 onward.",
            "months": seasonal_profile(cpi),
            "current_month": MONTH_NAMES[date.today().month - 1],
        },
    }


def run() -> dict:
    with session() as conn:
        out = compute(conn)
    log.info(
        "official_compare: overlap=%s months, link=%s",
        out.get("overlap", {}).get("overlap_months"), out.get("link", {}).get("period"),
    )
    return out


if __name__ == "__main__":
    import json
    logging.basicConfig(level=logging.INFO)
    r = run()
    r["official"]["points"] = f"<{len(r['official']['points'])} points>"
    print(json.dumps(r, indent=2, default=str))

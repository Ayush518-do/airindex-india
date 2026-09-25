"""
Festival calendar + festival-surge aggregation.

No scraping here: fare records are tagged festival / non-festival by their
*travel_date*, then compared within the same route and advance-purchase
window so the surge isn't confounded by how far ahead the fare was scraped.

    surge_pct(festival, route) = mean(festival fares) / expected - 1
    expected = sum_w share_w * mean(normal fares in route, window w)
               with share_w = share of the festival's records in window w

Dates are the public-holiday / observance dates (approximate for lunar
festivals) padded into a travel window.
"""
from __future__ import annotations

import logging
from datetime import date
from typing import Iterable

from pipeline.db import MODEL_FILTER, session

log = logging.getLogger("pipeline.festivals")

# (name, start, end) — travel windows around major Indian festivals, 2026-27.
FESTIVALS: list[dict] = [
    {"name": "Holi",                 "start": "2026-03-01", "end": "2026-03-05", "observed": "2026-03-04"},
    {"name": "Eid ul-Fitr",          "start": "2026-03-19", "end": "2026-03-23", "observed": "2026-03-21"},
    {"name": "Independence Day",     "start": "2026-08-14", "end": "2026-08-17", "observed": "2026-08-15"},
    {"name": "Onam",                 "start": "2026-08-24", "end": "2026-08-29", "observed": "2026-08-26"},
    {"name": "Ganesh Chaturthi",     "start": "2026-09-13", "end": "2026-09-25", "observed": "2026-09-14"},
    {"name": "Dussehra",             "start": "2026-10-17", "end": "2026-10-22", "observed": "2026-10-20"},
    {"name": "Diwali",               "start": "2026-11-04", "end": "2026-11-12", "observed": "2026-11-08"},
    {"name": "Chhath Puja",          "start": "2026-11-13", "end": "2026-11-17", "observed": "2026-11-15"},
    {"name": "Christmas / New Year", "start": "2026-12-22", "end": "2027-01-03", "observed": "2026-12-25"},
    {"name": "Pongal / Sankranti",   "start": "2027-01-13", "end": "2027-01-17", "observed": "2027-01-14"},
    {"name": "Republic Day",         "start": "2027-01-23", "end": "2027-01-26", "observed": "2027-01-26"},
    {"name": "Eid ul-Fitr",          "start": "2027-03-08", "end": "2027-03-12", "observed": "2027-03-10"},
    {"name": "Holi",                 "start": "2027-03-19", "end": "2027-03-23", "observed": "2027-03-22"},
]

_RANGES = [(f["name"], date.fromisoformat(f["start"]), date.fromisoformat(f["end"])) for f in FESTIVALS]


def festival_for(d: date | str) -> str | None:
    """Name of the festival whose travel window contains d, else None."""
    if isinstance(d, str):
        d = date.fromisoformat(d)
    for name, s, e in _RANGES:
        if s <= d <= e:
            return name
    return None


def is_festival(d: date | str) -> bool:
    return festival_for(d) is not None


def tag(dates: Iterable[str]) -> list[str | None]:
    return [festival_for(d) for d in dates]




def compute_surge(conn) -> dict:
    rows = conn.execute(
        f"SELECT route, advance_purchase_window AS window, travel_date, total_fare FROM fares WHERE {MODEL_FILTER}"
    ).fetchall()

    # normal cell means and festival buckets
    normal: dict[tuple[str, str], list[float]] = {}
    fest: dict[tuple[str, str], list[tuple[str, float]]] = {}   # (festival, route) -> [(window, fare)]
    for r in rows:
        f = festival_for(r["travel_date"])
        key = (r["route"], r["window"])
        if f is None:
            normal.setdefault(key, []).append(r["total_fare"])
        else:
            fest.setdefault((f, r["route"]), []).append((r["window"], r["total_fare"]))

    normal_mean = {k: sum(v) / len(v) for k, v in normal.items()}
    out = []
    for (fname, route), recs in sorted(fest.items()):
        fares = [x[1] for x in recs]
        fmean = sum(fares) / len(fares)
        # expected fare from the same route/window mix on non-festival dates
        by_w: dict[str, int] = {}
        for w, _ in recs:
            by_w[w] = by_w.get(w, 0) + 1
        covered = [(w, c) for w, c in by_w.items() if (route, w) in normal_mean]
        if covered:
            tot = sum(c for _, c in covered)
            expected = sum(normal_mean[(route, w)] * c for w, c in covered) / tot
            n_normal = sum(len(normal[(route, w)]) for w, _ in covered)
            basis = "same window"
        else:
            # fall back to the route's overall normal mean (window mix not matched)
            allv = [x for (rt, _), v in normal.items() if rt == route for x in v]
            if not allv:
                continue
            expected, n_normal, basis = sum(allv) / len(allv), len(allv), "route overall"
        out.append({
            "festival": fname, "route": route,
            "festival_avg": round(fmean), "normal_avg": round(expected),
            "surge_pct": round((fmean / expected - 1) * 100, 1),
            "n_festival": len(fares), "n_normal": n_normal, "windows": sorted(by_w), "basis": basis,
        })
    return {"festivals": FESTIVALS, "surge": out, "n_records": len(rows)}


def run() -> dict:
    with session() as conn:
        s = compute_surge(conn)
    log.info("festival surge: %d festival/route pairs from %d real records", len(s["surge"]), s["n_records"])
    return {"pairs": len(s["surge"]), "records": s["n_records"]}


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    with session() as conn:
        for row in compute_surge(conn)["surge"]:
            print(row)

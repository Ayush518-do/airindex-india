"""
Synthetic history backfill — DEMO SCAFFOLDING, clearly labelled.

A daily index needs several scrape days before a trend exists. This tool writes
N synthetic *past-day* snapshots into data/raw/ in the exact raw-snapshot
format, anchored to the fare levels in the latest REAL snapshot:

* every file carries  "synthetic": true  and  "source": "synthetic_backfill"
* pipeline.clean stamps every record  is_synthetic = 1
* pipeline.index stamps those days     is_synthetic = 1
* the API reports n_real_days / n_synthetic_days and the UI shades them

Real scrapes always win: a synthetic file is never written for a date that has
a real snapshot, and `--purge` deletes all synthetic files once you have enough
real history.

    python -m scraper.backfill --days 21        # write 21 days of seeded history
    python -m scraper.backfill --purge          # delete every synthetic snapshot
"""
from __future__ import annotations

import argparse
import json
import logging
import random
from collections import defaultdict
from datetime import date, datetime, timedelta
from pathlib import Path

from pipeline.db import DEMO_RAW_DIR
from scraper.base import DEFAULT_ROUTES, latest_snapshots

log = logging.getLogger("scraper.backfill")

SEED = 2026
WINDOW_OFFSETS = {"0-3": 2, "4-7": 5, "8-14": 10, "15-30": 21, "31-60": 45}
# Typical fare shape vs. advance purchase (used only when a real cell is missing).
WINDOW_MULT = {"0-3": 1.55, "4-7": 1.25, "8-14": 1.05, "15-30": 0.92, "31-60": 0.85}
FALLBACK_LEVEL = {"DEL-BOM": 6000, "DEL-BLR": 6300, "BOM-BLR": 5200, "DEL-CCU": 6100, "MAA-DEL": 6600, "BLR-HYD": 3800}
FALLBACK_CARRIERS = [("6E", "IndiGo"), ("AI", "Air India"), ("IX", "Air India Express"), ("QP", "Akasa Air"), ("SG", "SpiceJet")]


def _window_for(days: int) -> str:
    for name, lo, hi in (("0-3", 0, 3), ("4-7", 4, 7), ("8-14", 8, 14), ("15-30", 15, 30), ("31-60", 31, 60)):
        if lo <= days <= hi:
            return name
    return "31-60"


def _anchor_levels() -> tuple[dict, dict, dict, str | None]:
    """Per (route, window) mean nonstop fare + record count + carrier mix from real snapshots."""
    levels: dict[tuple[str, str], list[float]] = defaultdict(list)
    carriers: dict[str, list[tuple[str, str]]] = defaultdict(list)
    anchor_file = None
    for p in latest_snapshots():
        snap = json.loads(p.read_text(encoding="utf-8"))
        if snap.get("synthetic"):
            continue
        anchor_file = anchor_file or p.name
        sd = date.fromisoformat(snap["scraped_at"][:10])
        for r in snap["records"]:
            if r.get("stops") not in (0, None) or not r.get("total_fare"):
                continue
            route = f"{r['origin']}-{r['destination']}"
            adv = (date.fromisoformat(r["travel_date"]) - sd).days
            levels[(route, _window_for(adv))].append(float(r["total_fare"]))
            carriers[route].append((r.get("carrier") or "6E", r.get("carrier_name") or "IndiGo"))
        if len(levels) >= 30:
            break
    # Trimmed mean (drop > 3x median) so the anchor matches what the index uses.
    mean, n = {}, {}
    for k, v in levels.items():
        s = sorted(v)
        med = s[len(s) // 2]
        kept = [x for x in s if x <= 3 * med]
        mean[k] = sum(kept) / len(kept)
        n[k] = len(kept)
    return mean, n, carriers, anchor_file


def _level(mean: dict, route: str, window: str) -> float:
    if (route, window) in mean:
        return mean[(route, window)]
    # derive from another real window of the same route, else fallback table
    for w, m in WINDOW_MULT.items():
        if (route, w) in mean:
            return mean[(route, w)] / m * WINDOW_MULT[window]
    return FALLBACK_LEVEL[route] * WINDOW_MULT[window]


def write(days: int = 21, end: date | None = None, out_dir: Path | None = None) -> list[Path]:
    # Defaults to the demo snapshot directory, never data/raw/: a seeded file
    # sitting next to real scrapes would be ingested by a live rebuild.
    target = out_dir or DEMO_RAW_DIR
    target.mkdir(parents=True, exist_ok=True)
    rng = random.Random(SEED)
    mean, n_by_cell, carriers, anchor = _anchor_levels()
    if not anchor:
        log.warning("no real snapshot found — backfill will use the fallback fare table")
    end = end or (date.today() - timedelta(days=1))
    real_dates = {
        json.loads(p.read_text(encoding="utf-8"))["scraped_at"][:10]
        for p in latest_snapshots() if not json.loads(p.read_text(encoding="utf-8")).get("synthetic")
    }

    # Smooth market-level drift that ends at 1.0 (today's real level), walking backwards.
    day_factor = [1.0]
    for _ in range(days):
        day_factor.append(day_factor[-1] * (1 + rng.gauss(0, 0.009)))
    day_factor = day_factor[1:][::-1]  # oldest ... yesterday
    route_bias = {r: rng.uniform(-0.02, 0.02) for r in FALLBACK_LEVEL}

    written = []
    for i in range(days):
        d = end - timedelta(days=days - 1 - i)
        if d.isoformat() in real_dates:
            continue
        scraped_at = datetime.combine(d, datetime.min.time()).replace(hour=9)
        records = []
        for o, dst in DEFAULT_ROUTES:
            route = f"{o}-{dst}"
            mix = carriers.get(route) or FALLBACK_CARRIERS
            for window, offset in WINDOW_OFFSETS.items():
                lvl = _level(mean, route, window) * day_factor[i] * (1 + route_bias[route] * (1 - i / days))
                n = max(6, min(30, n_by_cell.get((route, window), 12)))
                for k in range(n):
                    code, name = rng.choice(mix)
                    jitter = rng.lognormvariate(0, 0.12)
                    fare = round(lvl * jitter / 10) * 10
                    records.append({
                        "origin": o, "destination": dst, "carrier": code, "carrier_name": name,
                        "flight_number": f"{code}-{rng.randint(100, 999)}",
                        "travel_date": (d + timedelta(days=offset)).isoformat(),
                        "departure_time": f"{rng.randint(5, 22):02d}:{rng.choice(['00', '15', '30', '45'])}",
                        "arrival_time": None, "duration_min": rng.randint(85, 170), "stops": 0,
                        "fare_class": "economy", "base_fare": None, "taxes": None,
                        "total_fare": float(fare), "currency": "INR", "seats_left": None, "raw": {},
                    })
        snap = {
            "source": "synthetic_backfill", "synthetic": True, "anchored_to": anchor,
            "run_id": f"bf{i:03d}", "scraped_at": scraped_at.isoformat(timespec="seconds"),
            "finished_at": scraped_at.isoformat(timespec="seconds"), "robots_checked": False, "min_gap_s": 0,
            "n_queries": len(DEFAULT_ROUTES) * len(WINDOW_OFFSETS), "n_records": len(records),
            "queries": [], "records": records,
            "note": "SYNTHETIC demo history anchored to real fare levels; not scraped. See README.",
        }
        path = target / f"synthetic_backfill_{scraped_at.strftime('%Y%m%d_%H%M%S')}.json"
        path.write_text(json.dumps(snap, ensure_ascii=False), encoding="utf-8")
        written.append(path)
    log.info("wrote %d synthetic snapshots (anchored to %s)", len(written), anchor)
    return written


def purge(out_dir: Path | None = None) -> int:
    n = 0
    for p in (out_dir or DEMO_RAW_DIR).glob("synthetic_backfill_*.json"):
        p.unlink()
        n += 1
    log.info("deleted %d synthetic snapshots", n)
    return n


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--days", type=int, default=21)
    ap.add_argument("--purge", action="store_true")
    a = ap.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s", datefmt="%H:%M:%S")
    if a.purge:
        purge()
    else:
        purge()
        for p in write(a.days):
            print(p.name)

"""
Raw JSON snapshots -> structured `fares` table in SQLite.

    python -m pipeline.clean            # ingest every snapshot not yet ingested
    python -m pipeline.clean --rebuild  # drop + re-ingest everything

Rules
-----
* Sold-out / placeholder rows (no total, or total < MIN_FARE) are dropped.
* advance_purchase_days = travel_date - scrape_date; bucketed into WINDOWS.
* Outliers are *flagged*, not deleted: within each (route, travel_date, stops)
  group a fare above OUTLIER_MULT x the group median is marked is_outlier=1.
  The index and models ignore flagged rows; /fares/raw still exposes them.
* Records whose snapshot is marked synthetic (see scraper/backfill.py) carry
  is_synthetic=1 all the way through so the UI can disclose them.
* in_basket=1 marks records scraped at the fixed basket offsets (2/5/10/21/45
  days out); only those feed the index. Extra festival/control-date scrapes
  are in_basket=0 and feed the model + festival analysis only.
* Snapshots are read from pipeline.db.RAW_DIR, which is data/raw/ in live mode
  and data/raw_demo/ in demo mode — seeded fixtures can never be ingested into
  the live store.
"""
from __future__ import annotations

import argparse
import json
import logging
import statistics
from collections import defaultdict
from datetime import date, datetime
from pathlib import Path

from pipeline import timeutil
from pipeline.db import RAW_DIR, session
from scraper.base import DEFAULT_OFFSETS

log = logging.getLogger("pipeline.clean")

WINDOWS: list[tuple[str, int, int]] = [
    ("0-3", 0, 3), ("4-7", 4, 7), ("8-14", 8, 14), ("15-30", 15, 30), ("31-60", 31, 60),
]
# The index basket is a fixed advance-purchase profile: one departure per window,
# scraped at exactly these offsets. Extra scrapes (festival/control dates) are kept
# for the model and festival analysis but stay out of the index (in_basket = 0).
BASKET_OFFSETS = set(DEFAULT_OFFSETS)
MIN_FARE = 500.0          # below this it's a placeholder / broken row
MAX_FARE = 60_000.0       # domestic economy one-way; above this is junk
OUTLIER_MULT = 3.0        # x group median


def window_for(days: int) -> str | None:
    for name, lo, hi in WINDOWS:
        if lo <= days <= hi:
            return name
    return None


def _clean_records(snapshot: dict, file_name: str) -> list[dict]:
    scraped_at = snapshot["scraped_at"]
    scrape_date = date.fromisoformat(scraped_at[:10])
    synthetic = 1 if snapshot.get("synthetic") else 0
    source = snapshot["source"]

    rows: list[dict] = []
    for r in snapshot.get("records", []):
        total = r.get("total_fare")
        if total is None or total < MIN_FARE or total > MAX_FARE:
            continue
        try:
            tdate = date.fromisoformat(r["travel_date"])
        except Exception:
            continue
        adv = (tdate - scrape_date).days
        win = window_for(adv)
        if win is None:
            continue
        rows.append({
            "snapshot_file": file_name,
            "source": source,
            "scraped_at": scraped_at,
            "scrape_date": scrape_date.isoformat(),
            "origin": r["origin"].upper(),
            "destination": r["destination"].upper(),
            "route": f"{r['origin'].upper()}-{r['destination'].upper()}",
            "carrier": (r.get("carrier") or "??").upper(),
            "carrier_name": r.get("carrier_name"),
            "flight_number": r.get("flight_number"),
            "travel_date": tdate.isoformat(),
            "departure_time": r.get("departure_time"),
            "duration_min": r.get("duration_min"),
            "stops": r.get("stops"),
            "advance_purchase_days": adv,
            "advance_purchase_window": win,
            "fare_class": (r.get("fare_class") or "economy").lower(),
            "base_fare": r.get("base_fare"),
            "taxes": r.get("taxes"),
            "total_fare": float(total),
            "currency": r.get("currency") or "INR",
            "is_outlier": 0,
            "is_synthetic": synthetic,
            "in_basket": 1 if adv in BASKET_OFFSETS else 0,
        })

    # Outlier flagging within (route, travel_date, stops).
    groups: dict[tuple, list[dict]] = defaultdict(list)
    for row in rows:
        groups[(row["route"], row["travel_date"], row["stops"])].append(row)
    for g in groups.values():
        if len(g) < 4:
            continue
        med = statistics.median(x["total_fare"] for x in g)
        for x in g:
            if x["total_fare"] > OUTLIER_MULT * med:
                x["is_outlier"] = 1
    return rows


def ingest(path: Path, conn) -> tuple[int, int]:
    snapshot = json.loads(path.read_text(encoding="utf-8"))
    rows = _clean_records(snapshot, path.name)
    n_ok = sum(1 for q in snapshot.get("queries", []) if q.get("status") == "ok")

    conn.execute("DELETE FROM fares WHERE snapshot_file = ?", (path.name,))
    conn.execute("DELETE FROM snapshots WHERE file = ?", (path.name,))
    conn.execute(
        "INSERT INTO snapshots (file, source, scraped_at, scrape_date, n_queries, n_ok, n_raw, n_kept, is_synthetic, ingested_at)"
        " VALUES (?,?,?,?,?,?,?,?,?,?)",
        (path.name, snapshot["source"], snapshot["scraped_at"], snapshot["scraped_at"][:10],
         snapshot.get("n_queries"), n_ok, len(snapshot.get("records", [])), len(rows),
         1 if snapshot.get("synthetic") else 0, timeutil.stamp()),
    )
    if rows:
        cols = list(rows[0].keys())
        conn.executemany(
            f"INSERT INTO fares ({','.join(cols)}) VALUES ({','.join('?' for _ in cols)})",
            [tuple(r[c] for c in cols) for r in rows],
        )
    return len(snapshot.get("records", [])), len(rows)


def run(rebuild: bool = False) -> dict:
    files = sorted(RAW_DIR.glob("*.json"))
    stats = {"files": 0, "raw": 0, "kept": 0, "skipped": 0}
    with session() as conn:
        if rebuild:
            conn.execute("DELETE FROM fares")
            conn.execute("DELETE FROM snapshots")
        done = {r["file"] for r in conn.execute("SELECT file FROM snapshots")}
        for f in files:
            if f.name in done and not rebuild:
                stats["skipped"] += 1
                continue
            n_raw, n_kept = ingest(f, conn)
            stats["files"] += 1
            stats["raw"] += n_raw
            stats["kept"] += n_kept
            log.info("ingested %s: %d raw -> %d kept", f.name, n_raw, n_kept)
        total = conn.execute("SELECT COUNT(*) FROM fares").fetchone()[0]
        stats["total_in_db"] = total
    return stats


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--rebuild", action="store_true")
    a = ap.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s", datefmt="%H:%M:%S")
    print(run(rebuild=a.rebuild))

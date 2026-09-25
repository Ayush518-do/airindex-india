"""
Build the demo database (data/processed/airindex_demo.db).

Presentations need a full trend line; the live index will not have one until the
scraper has run for a couple of weeks. So demo data lives in its own database
file and is reached only with DEMO_MODE=1 — the live store is never written
here, and no filter has to be trusted to keep the two apart.

What goes in:
  * seeded fare history from tests/fixtures/synthetic.py, anchored to the real
    fare levels already scraped, so the numbers are plausible rather than
    arbitrary. Every row keeps is_synthetic = 1.
  * the **real** official CPI series, copied from the live database. Official
    data is real in both modes; only the fare/index history is seeded.

    python scripts/build_demo_db.py            # ~30 days of history
    python scripts/build_demo_db.py --days 45
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

# Must be set before pipeline.db is imported: it resolves DB_PATH at import time.
os.environ["DEMO_MODE"] = "1"

import shutil  # noqa: E402

from pipeline import clean, index  # noqa: E402
from pipeline.db import (  # noqa: E402
    DEMO_DB_PATH, DEMO_RAW_DIR, LIVE_DB_PATH, LIVE_RAW_DIR, connect, init_db, session,
)
from tests.fixtures import synthetic  # noqa: E402


def stage_snapshots(days: int) -> int:
    """
    Fill data/raw_demo/ with the real snapshots plus seeded history.

    The real ones are copied rather than referenced so the demo shows a genuine
    scrape day alongside the seeded trend — and so nothing ever writes a seeded
    file into data/raw/, where a live rebuild would pick it up.
    """
    if DEMO_RAW_DIR.exists():
        shutil.rmtree(DEMO_RAW_DIR)
    DEMO_RAW_DIR.mkdir(parents=True, exist_ok=True)

    real = [p for p in LIVE_RAW_DIR.glob("*.json")]
    for p in real:
        shutil.copy2(p, DEMO_RAW_DIR / p.name)

    seeded = synthetic.write(days=days, out_dir=DEMO_RAW_DIR)
    print(f"  {len(real)} real snapshots copied, {len(seeded)} seeded")
    return len(real) + len(seeded)


def copy_official_cpi() -> int:
    """Copy the real CPI series across, so the demo shows genuine official data."""
    if not LIVE_DB_PATH.exists():
        print("! live database not found — demo will have no official CPI series")
        return 0
    src = connect(LIVE_DB_PATH)
    rows = [dict(r) for r in src.execute("SELECT * FROM official_cpi")]
    src.close()
    if not rows:
        print("! live database has no official_cpi rows — run `python -m pipeline.mospi` first")
        return 0
    cols = [c for c in rows[0] if c != "id"]
    sql = (f"INSERT OR REPLACE INTO official_cpi ({','.join(cols)}) "
           f"VALUES ({','.join('?' for _ in cols)})")
    with session() as conn:
        conn.executemany(sql, [tuple(r[c] for c in cols) for r in rows])
    return len(rows)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--days", type=int, default=30, help="days of seeded history (default 30)")
    args = ap.parse_args(argv)

    if DEMO_DB_PATH.exists():
        DEMO_DB_PATH.unlink()
    for suffix in ("-wal", "-shm"):
        p = DEMO_DB_PATH.with_name(DEMO_DB_PATH.name + suffix)
        if p.exists():
            p.unlink()
    init_db(connect()).close()

    print(f"building {DEMO_DB_PATH.name} …")
    stage_snapshots(args.days)

    stats = clean.run(rebuild=True)
    print(f"  cleaned: {stats['kept']} fares from {stats['files']} snapshots")
    idx = index.run()
    print(f"  index: {idx['days']} days, {idx['cells']} cells")
    print(f"  official CPI rows copied: {copy_official_cpi()}")

    with session() as conn:
        synth = conn.execute("SELECT COUNT(*) FROM fares WHERE is_synthetic = 1").fetchone()[0]
        total = conn.execute("SELECT COUNT(*) FROM fares").fetchone()[0]
    print(f"\ndone — {total} fares ({synth} flagged synthetic)")
    print(f"run with:  DEMO_MODE=1 python -m uvicorn backend.main:app --port 8000")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

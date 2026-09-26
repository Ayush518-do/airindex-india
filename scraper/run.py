"""
Run one or more scraper sources once and write raw snapshots.

    python -m scraper.run                       # all sources, all routes/offsets
    python -m scraper.run --source easemytrip   # one source
    python -m scraper.run --routes DEL-BOM,BLR-HYD --offsets 2,10 --max 2   # quick test
    python -m scraper.run --dates 2026-11-07,2026-10-28   # explicit travel dates (festival vs control)
    python -m scraper.run --headed              # watch the browser
"""
from __future__ import annotations

import argparse
import logging
import sys

from pipeline import timeutil
from scraper.base import DEFAULT_OFFSETS, DEFAULT_ROUTES
from scraper.sources import SOURCES


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--source", choices=list(SOURCES), action="append", help="source to run (repeatable); default all")
    ap.add_argument("--routes", help="comma-separated ORI-DST list")
    ap.add_argument("--offsets", help="comma-separated days-ahead list")
    ap.add_argument("--dates", help="comma-separated explicit travel dates YYYY-MM-DD (overrides --offsets)")
    ap.add_argument("--max", type=int, help="cap number of queries (for testing)")
    ap.add_argument("--headed", action="store_true", help="show the browser window")
    args = ap.parse_args(argv)

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s", datefmt="%H:%M:%S")
    routes = [tuple(r.split("-")) for r in args.routes.split(",")] if args.routes else DEFAULT_ROUTES
    offsets = [int(x) for x in args.offsets.split(",")] if args.offsets else DEFAULT_OFFSETS
    if args.dates:
        from datetime import date
        today = timeutil.today()
        offsets = [(date.fromisoformat(d) - today).days for d in args.dates.split(",")]

    paths = []
    for name in (args.source or list(SOURCES)):
        src = SOURCES[name]()
        src.headless = not args.headed
        paths.append(src.run(routes=routes, offsets=offsets, max_queries=args.max))
    for p in paths:
        print(p)
    return 0


if __name__ == "__main__":
    sys.exit(main())

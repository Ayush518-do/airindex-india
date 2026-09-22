"""
Periodic scrape + pipeline cycle.

    python -m scraper.scheduler                 # every 6h, all sources
    python -m scraper.scheduler --every 3h --source easemytrip
    python -m scraper.scheduler --once          # one cycle then exit

Each cycle: run every source (robots-checked, rate-limited) -> write raw
snapshots -> run the processing pipeline (clean, index, model, festivals,
alerts). A source that fails or is blocked just logs; the app keeps serving
the last good snapshot.
"""
from __future__ import annotations

import argparse
import logging
import time
from datetime import datetime

from scraper.sources import SOURCES

log = logging.getLogger("scheduler")


def parse_interval(s: str) -> int:
    units = {"m": 60, "h": 3600, "d": 86400}
    return int(s[:-1]) * units[s[-1]] if s[-1] in units else int(s)


def cycle(sources: list[str]) -> None:
    from pipeline.run_all import run as run_pipeline  # imported here so scraping works without pandas etc.

    for name in sources:
        try:
            SOURCES[name]().run()
        except Exception as exc:
            log.exception("source %s failed: %s", name, exc)
    try:
        result = run_pipeline()
        log.info("pipeline: %s", {k: (v if not isinstance(v, dict) else {kk: vv for kk, vv in v.items() if kk != 'latest'}) for k, v in result.items()})
    except Exception as exc:
        log.exception("pipeline failed: %s", exc)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--every", default="6h", help="interval like 30m, 6h, 1d (default 6h)")
    ap.add_argument("--source", action="append", choices=list(SOURCES))
    ap.add_argument("--once", action="store_true")
    a = ap.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s", datefmt="%H:%M:%S")
    sources = a.source or list(SOURCES)
    interval = parse_interval(a.every)
    while True:
        log.info("=== cycle start %s (sources: %s)", datetime.now().isoformat(timespec="seconds"), sources)
        cycle(sources)
        if a.once:
            break
        log.info("sleeping %ss", interval)
        time.sleep(interval)


if __name__ == "__main__":
    main()

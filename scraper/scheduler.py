"""
Scheduled collection: scrape -> pipeline -> alerts, plus a monthly MoSPI refresh.

The index only gains history in wall-clock time, so this needs to survive
laptop reboots and missed windows rather than merely loop. APScheduler with a
SQLAlchemy job store gives us:

  * persistence     — jobs and their next run times outlive the process
  * coalesce        — a laptop asleep for three days runs ONE catch-up scrape,
                      not three back-to-back
  * misfire grace   — a window missed by minutes still fires
  * max_instances=1 — a slow scrape can never overlap itself (Playwright and
                      the polite rate limiter both assume one run at a time)

    python -m scraper.scheduler              # run in the foreground
    python -m scraper.scheduler --once       # one full cycle, then exit
    python -m scraper.scheduler --list       # show jobs and next run times

See README "Keeping the scheduler running" for Windows Task Scheduler setup.
"""
from __future__ import annotations

import argparse
import logging
import os
import signal
import sys
import time
from datetime import datetime
from pathlib import Path

from apscheduler.executors.pool import ThreadPoolExecutor
from apscheduler.jobstores.sqlalchemy import SQLAlchemyJobStore
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from pipeline import timeutil
from pipeline.db import PROCESSED_DIR, session
from pipeline.logging_setup import setup_logging
from scraper.sources import SOURCES

log = logging.getLogger("scraper.scheduler")

TZ = "Asia/Kolkata"

JOBSTORE_URL = f"sqlite:///{(PROCESSED_DIR / 'jobs.db').as_posix()}"

# Early morning IST: fares for the day are posted, and the machine is unlikely
# to be busy. Sources are staggered so two browsers never start together.
SCRAPE_HOUR = 6
MOSPI_DAY = 15          # CPI for month M is published mid-M+1
NOTIFIER_HOUR = 9

# A laptop is often closed at 06:00. With a 20h grace, a day's scrape still
# runs whenever the machine is on at any point that day (coalesced to one run);
# only a day spent entirely offline is skipped. The monthly CPI refresh gets a
# week, since missing it means waiting a whole month.
MISFIRE_GRACE_S = 20 * 3600
MOSPI_GRACE_S = 7 * 24 * 3600


def scrape_source(name: str) -> None:
    src = SOURCES[name]()
    log.info("scrape start", extra={"source": name})
    path = src.run()
    log.info("scrape done", extra={"source": name, "snapshot": path.name})


def run_pipeline() -> None:
    from pipeline.run_all import run  # deferred: pulls in pandas/sklearn
    result = run()
    log.info("pipeline done", extra={"stages": {k: str(v)[:120] for k, v in result.items()}})


def refresh_official() -> None:
    from pipeline import mospi
    log.info("mospi refresh", extra=mospi.run())


def send_alerts() -> None:
    from pipeline import notifier
    log.info("notifier done", extra=notifier.run())


def job_specs() -> list[dict]:
    """The desired schedule. ensure_jobs() reconciles the persisted store against this."""
    specs = [
        {"id": f"scrape:{name}", "func": scrape_source, "args": [name], "name": f"Scrape {name}",
         "trigger": CronTrigger(hour=SCRAPE_HOUR, minute=i * 30, timezone=TZ)}
        for i, name in enumerate(SOURCES)
    ]
    specs += [
        # After the last source, so it sees every snapshot from this cycle.
        {"id": "pipeline", "func": run_pipeline, "name": "Clean + index + model",
         "trigger": CronTrigger(hour=SCRAPE_HOUR + 2, minute=0, timezone=TZ)},
        {"id": "notifier", "func": send_alerts, "name": "Low-fare alerts",
         "trigger": CronTrigger(hour=NOTIFIER_HOUR, minute=0, timezone=TZ)},
        {"id": "mospi", "func": refresh_official, "name": "Official CPI refresh",
         "trigger": CronTrigger(day=MOSPI_DAY, hour=7, minute=0, timezone=TZ),
         "misfire_grace_time": MOSPI_GRACE_S},
    ]
    return specs


def build_scheduler(jobstore_url: str = JOBSTORE_URL) -> BackgroundScheduler:
    return BackgroundScheduler(
        jobstores={"default": SQLAlchemyJobStore(url=jobstore_url)},
        executors={"default": ThreadPoolExecutor(1)},
        job_defaults={
            "coalesce": True,
            "max_instances": 1,
            "misfire_grace_time": MISFIRE_GRACE_S,
        },
        timezone=TZ,
    )


def ensure_jobs(scheduler: BackgroundScheduler) -> None:
    """
    Add missing jobs; leave existing ones alone.

    Must run after scheduler.start(paused=True) so the persisted jobs are
    loaded. Re-adding with replace_existing=True would recompute next_run_time
    from *now* and silently discard a run that was missed while the laptop was
    off — exactly what the job store is here to catch up on. A job is only
    rescheduled when its trigger has actually changed in code.
    """
    for spec in job_specs():
        spec = dict(spec)
        existing = scheduler.get_job(spec["id"])
        if existing is None:
            scheduler.add_job(**spec)
            log.info("job added", extra={"job": spec["id"]})
        else:
            if str(existing.trigger) != str(spec["trigger"]):
                scheduler.reschedule_job(spec["id"], trigger=spec["trigger"])
                log.info("job trigger changed", extra={"job": spec["id"], "trigger": str(spec["trigger"])})
            # Grace is persisted per job at add time, so a changed policy has to
            # be pushed onto jobs already in the store. modify_job keeps
            # next_run_time, unlike reschedule.
            grace = spec.get("misfire_grace_time", MISFIRE_GRACE_S)
            if existing.misfire_grace_time != grace:
                scheduler.modify_job(spec["id"], misfire_grace_time=grace)


LOCK_PATH = PROCESSED_DIR / "scheduler.lock"


class AlreadyRunning(RuntimeError):
    pass


class SingleInstance:
    """
    OS-level exclusive lock so two schedulers cannot scrape at once.

    Two instances (say the logon task plus a manual run) would share jobs.db
    and each fire every job — hitting every site twice. The lock is held by the
    OS, so a crashed process releases it automatically; no stale-PID cleanup.
    """

    def __init__(self, path: Path = LOCK_PATH):
        self.path = path
        self._fh = None

    def __enter__(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._fh = open(self.path, "a+")
        try:
            if os.name == "nt":
                import msvcrt
                self._fh.seek(0)
                msvcrt.locking(self._fh.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(self._fh.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError as exc:
            self._fh.close()
            raise AlreadyRunning(
                f"another scheduler is already running (lock held on {self.path.name})"
            ) from exc
        self._fh.seek(0)
        self._fh.truncate()
        self._fh.write(f"{os.getpid()} {timeutil.stamp()}\n")
        self._fh.flush()
        return self

    def __exit__(self, *exc):
        try:
            if os.name == "nt":
                import msvcrt
                self._fh.seek(0)
                msvcrt.locking(self._fh.fileno(), msvcrt.LK_UNLCK, 1)
        finally:
            self._fh.close()


def close_without_running(scheduler: BackgroundScheduler) -> None:
    """
    Shut down a scheduler that was only started paused, to read or reconcile jobs.

    APScheduler's shutdown() wakes the loop with state STOPPED — not PAUSED — so
    any overdue job is "processed" on the way out: submission fails (the
    executor is already gone) yet its next_run_time still advances. That would
    silently consume a scrape missed while the laptop was closed. Detaching the
    job store first leaves nothing to process; the persisted rows are untouched.
    """
    scheduler.remove_jobstore("default")
    scheduler.shutdown(wait=False)


def run_once() -> dict:
    """One full cycle, inline. Used by --once and by the smoke test."""
    summary: dict[str, str] = {}
    for name in SOURCES:
        try:
            scrape_source(name)
            summary[name] = "ok"
        except Exception as exc:
            summary[name] = f"{type(exc).__name__}: {exc}"
            log.exception("scrape failed", extra={"source": name})
    for label, fn in (("pipeline", run_pipeline), ("notifier", send_alerts)):
        try:
            fn()
            summary[label] = "ok"
        except Exception as exc:
            summary[label] = f"{type(exc).__name__}: {exc}"
            log.exception("%s failed", label)
    return summary


def print_jobs(scheduler: BackgroundScheduler) -> None:
    print(f"{'job':<22}{'next run':<26}trigger")
    for job in scheduler.get_jobs():
        nxt = job.next_run_time.strftime("%Y-%m-%d %H:%M %Z") if job.next_run_time else "paused"
        print(f"{job.id:<22}{nxt:<26}{job.trigger}")


def print_health() -> None:
    with session() as conn:
        rows = conn.execute("SELECT * FROM source_health ORDER BY source").fetchall()
    if not rows:
        print("no source_health rows yet — run a scrape first")
        return
    print(f"\n{'source':<14}{'status':<11}{'ok':>4}{'fail':>6}{'records':>9}  last run")
    for r in rows:
        print(f"{r['source']:<14}{r['status']:<11}{r['n_ok']:>4}{r['n_failed']:>6}"
              f"{r['n_records']:>9}  {r['last_run_at']}")
        if r["last_error"]:
            print(f"  └─ last error: {r['last_error'][:110]}")


def _daemon(log_path: Path) -> int:
    scheduler = build_scheduler()
    # Start paused so persisted jobs load (and any missed runs are known)
    # before anything is reconciled or allowed to fire.
    scheduler.start(paused=True)
    ensure_jobs(scheduler)
    scheduler.resume()
    log.info("scheduler started", extra={"jobs": [j.id for j in scheduler.get_jobs()], "log": str(log_path)})
    print_jobs(scheduler)
    print(f"\nlogging to {log_path} — Ctrl-C to stop")

    stopping = False

    def _stop(signum, _frame):
        nonlocal stopping
        stopping = True
        log.info("shutdown signal received", extra={"signal": signum})

    signal.signal(signal.SIGINT, _stop)
    signal.signal(signal.SIGTERM, _stop)
    try:
        while not stopping:
            time.sleep(1)
    finally:
        # wait=True so a scrape in flight finishes and writes its snapshot
        scheduler.shutdown(wait=True)
        log.info("scheduler stopped")
    return 0


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--once", action="store_true", help="run one full cycle and exit")
    ap.add_argument("--list", action="store_true", help="list jobs and next run times")
    ap.add_argument("--health", action="store_true", help="print source_health and exit")
    args = ap.parse_args(argv)

    log_path = setup_logging("scheduler")

    # Read-only inspection never needs the lock.
    if args.health:
        print_health()
        return 0
    if args.list:
        scheduler = build_scheduler()
        scheduler.start(paused=True)
        ensure_jobs(scheduler)
        print_jobs(scheduler)
        close_without_running(scheduler)
        return 0

    try:
        with SingleInstance():
            if args.once:
                log.info("running one cycle")
                summary = run_once()
                print("\ncycle summary:", summary)
                print_health()
                print(f"\nstructured log: {log_path}")
                return 0 if all(v == "ok" for v in summary.values()) else 1
            return _daemon(log_path)
    except AlreadyRunning as exc:
        log.warning("%s — exiting", exc)
        print(f"{exc}. Nothing to do.")
        # Exit 0: for the logon task this is the expected outcome when an
        # instance is already up, not a failure worth retrying.
        return 0


if __name__ == "__main__":
    sys.exit(main())

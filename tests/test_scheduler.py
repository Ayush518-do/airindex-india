"""
The scheduler's one job is not losing days. These pin the behaviour that makes
that true across laptop restarts: persisted run times survive, missed runs are
caught up once, and jobs never overlap.
"""
from __future__ import annotations

from datetime import datetime, timedelta

import pytest

from scraper import scheduler as sched


@pytest.fixture
def store(tmp_path):
    return f"sqlite:///{(tmp_path / 'jobs.db').as_posix()}"


def _boot(url):
    s = sched.build_scheduler(url)
    s.start(paused=True)
    sched.ensure_jobs(s)
    return s


def test_every_job_is_registered(store):
    s = _boot(store)
    try:
        ids = {j.id for j in s.get_jobs()}
        assert ids == {f"scrape:{n}" for n in sched.SOURCES} | {"pipeline", "notifier", "mospi"}
    finally:
        sched.close_without_running(s)


def test_jobs_never_overlap_and_coalesce(store):
    s = _boot(store)
    try:
        for job in s.get_jobs():
            assert job.max_instances == 1
            assert job.coalesce is True
    finally:
        sched.close_without_running(s)


def test_missed_run_survives_a_restart(store):
    """The bug this guards: replace_existing=True on every boot recomputed
    next_run_time from now and silently dropped a scrape missed while the
    laptop was closed."""
    s = _boot(store)
    missed = (datetime.now(s.timezone) - timedelta(hours=3)).replace(microsecond=0)
    s.modify_job("pipeline", next_run_time=missed)
    sched.close_without_running(s)

    s2 = _boot(store)
    try:
        assert s2.get_job("pipeline").next_run_time == missed, "missed run must still be pending after restart"
    finally:
        sched.close_without_running(s2)


def test_grace_covers_a_laptop_opened_in_the_afternoon(store):
    s = _boot(store)
    try:
        scrape = s.get_job(f"scrape:{next(iter(sched.SOURCES))}")
        # 06:00 job, laptop first opened at 14:00 -> 8h late, must still run.
        assert scrape.misfire_grace_time >= 8 * 3600
        assert s.get_job("mospi").misfire_grace_time >= 7 * 24 * 3600
    finally:
        sched.close_without_running(s)


def test_stale_grace_in_an_old_store_is_upgraded(store):
    s = _boot(store)
    s.modify_job("notifier", misfire_grace_time=60)
    sched.close_without_running(s)

    s2 = _boot(store)
    try:
        assert s2.get_job("notifier").misfire_grace_time == sched.MISFIRE_GRACE_S
    finally:
        sched.close_without_running(s2)


def test_inspecting_does_not_consume_a_missed_run(store):
    """`--list` starts the scheduler paused and shuts it down. That must not eat
    an overdue run on the way out (APScheduler processes due jobs on shutdown)."""
    s = _boot(store)
    missed = (datetime.now(s.timezone) - timedelta(hours=2)).replace(microsecond=0)
    s.modify_job("notifier", next_run_time=missed)
    sched.close_without_running(s)

    for _ in range(3):              # inspect repeatedly, as a user might
        sched.close_without_running(_boot(store))

    s2 = _boot(store)
    try:
        assert s2.get_job("notifier").next_run_time == missed
    finally:
        sched.close_without_running(s2)


def test_sources_are_staggered(store):
    s = _boot(store)
    try:
        starts = sorted(str(s.get_job(f"scrape:{n}").trigger) for n in sched.SOURCES)
        assert len(set(starts)) == len(starts), "two browsers must never launch at the same minute"
    finally:
        sched.close_without_running(s)


def test_second_instance_is_refused(tmp_path):
    lock = tmp_path / "scheduler.lock"
    with sched.SingleInstance(lock):
        with pytest.raises(sched.AlreadyRunning):
            with sched.SingleInstance(lock):
                pass


def test_lock_is_released_on_exit(tmp_path):
    lock = tmp_path / "scheduler.lock"
    with sched.SingleInstance(lock):
        pass
    with sched.SingleInstance(lock):   # must be acquirable again
        pass

"""
The app clock is IST everywhere. The bug this guards: the API container ran in
UTC while the host scraper wrote IST, so /health reported scrape age 5.5h low.
"""
from __future__ import annotations

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from fastapi.testclient import TestClient

from pipeline import timeutil


def test_now_is_india_time_whatever_the_host_zone():
    ist = datetime.now(ZoneInfo("Asia/Kolkata")).replace(tzinfo=None)
    assert abs((timeutil.now() - ist).total_seconds()) < 5
    assert timeutil.now().tzinfo is None, "stored timestamps are naive IST"


def test_today_follows_india_not_the_host():
    assert timeutil.today() == datetime.now(ZoneInfo("Asia/Kolkata")).date()


def test_health_scrape_age_uses_the_app_clock(db_path, conn):
    three_hours_ago = (timeutil.now() - timedelta(hours=3)).isoformat(timespec="seconds")
    conn.execute(
        "INSERT INTO snapshots (file, source, scraped_at, scrape_date, n_queries, n_ok, n_raw, n_kept,"
        " is_synthetic, ingested_at) VALUES ('s.json','test',?,?,1,1,1,1,0,?)",
        (three_hours_ago, three_hours_ago[:10], three_hours_ago),
    )
    conn.commit()
    from backend.main import app
    with TestClient(app) as c:
        age = c.get("/health").json()["scrape_age_hours"]
    assert 2.9 <= age <= 3.1, f"scrape age should be ~3h, got {age}"

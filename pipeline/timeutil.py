"""
One clock for the whole app: India Standard Time.

Timestamps are stored naive (the existing data is), so every process must agree
on which wall clock they mean. They did not: the scraper ran on the host in IST
while the API container ran in UTC, so /health computed a scrape's age 5.5 hours
too young, and "which day did this scrape happen" depended on where the code ran.

Everything that writes or compares a timestamp goes through here. zoneinfo reads
the IANA database from the `tzdata` package (installed with pandas), so this
works in slim containers that have no OS timezone files.
"""
from __future__ import annotations

from datetime import date, datetime
from zoneinfo import ZoneInfo

APP_TZ = ZoneInfo("Asia/Kolkata")


def now() -> datetime:
    """Current IST wall-clock time, naive — matching how timestamps are stored."""
    return datetime.now(APP_TZ).replace(tzinfo=None)


def today() -> date:
    """Today's date in India, regardless of the host's timezone."""
    return now().date()


def stamp() -> str:
    """now() as the ISO string format used throughout the database."""
    return now().isoformat(timespec="seconds")

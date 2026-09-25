"""
SQLite helpers + schema for the processed store.

Live and demo data live in **separate database files**, chosen by the
DEMO_MODE environment variable. Isolation rather than filtering is deliberate:
a single missed `WHERE is_synthetic = 0` would otherwise leak seeded fares into
real output, and that failure would be silent. With two files it cannot happen.

    DEMO_MODE unset/0  ->  data/processed/airindex.db       (real scrapes only)
    DEMO_MODE=1        ->  data/processed/airindex_demo.db  (seeded fixtures)

.env is loaded here rather than by the caller because pipeline modules are
imported before backend.main runs load_dotenv(), so the flag would otherwise be
missed when it lives in .env instead of the shell environment.
"""
from __future__ import annotations

import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
PROCESSED_DIR = ROOT / "data" / "processed"
PROCESSED_DIR.mkdir(parents=True, exist_ok=True)

load_dotenv(ROOT / ".env")

TRUTHY = {"1", "true", "yes", "on"}
DEMO_MODE = os.environ.get("DEMO_MODE", "0").strip().lower() in TRUTHY

# Snapshots are split the same way as the database. Scrapers always write real
# runs to data/raw/; seeded fixtures go to data/raw_demo/ and are only ever
# ingested in demo mode. Without this split a live `run_all --rebuild` would
# happily ingest seeded snapshots sitting in the shared directory.
LIVE_RAW_DIR = ROOT / "data" / "raw"
DEMO_RAW_DIR = ROOT / "data" / "raw_demo"
RAW_DIR = DEMO_RAW_DIR if DEMO_MODE else LIVE_RAW_DIR
RAW_DIR.mkdir(parents=True, exist_ok=True)

LIVE_DB_PATH = PROCESSED_DIR / "airindex.db"
DEMO_DB_PATH = PROCESSED_DIR / "airindex_demo.db"
DB_PATH = DEMO_DB_PATH if DEMO_MODE else LIVE_DB_PATH
DATA_MODE = "demo" if DEMO_MODE else "live"

# ---------------------------------------------------------------------------
# Shared row filters.
#
# These used to be four divergent copies (index / backtest / festivals /
# fare_model) that disagreed about synthetic rows and basket membership.
# Synthetic fares are excluded in live mode only: the demo database contains
# nothing but seeded rows, so filtering them there would empty every panel.
# ---------------------------------------------------------------------------
COMPARABLE_FARE = "stops = 0 AND fare_class = 'economy' AND is_outlier = 0"
_SYNTHETIC_CLAUSE = "" if DEMO_MODE else " AND is_synthetic = 0"

INDEX_FILTER = f"{COMPARABLE_FARE} AND in_basket = 1{_SYNTHETIC_CLAUSE}"
MODEL_FILTER = f"{COMPARABLE_FARE}{_SYNTHETIC_CLAUSE}"

SCHEMA = """
CREATE TABLE IF NOT EXISTS snapshots (
    file            TEXT PRIMARY KEY,
    source          TEXT NOT NULL,
    scraped_at      TEXT NOT NULL,
    scrape_date     TEXT NOT NULL,
    n_queries       INTEGER,
    n_ok            INTEGER,
    n_raw           INTEGER,
    n_kept          INTEGER,
    is_synthetic    INTEGER NOT NULL DEFAULT 0,
    ingested_at     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS fares (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    snapshot_file           TEXT NOT NULL REFERENCES snapshots(file) ON DELETE CASCADE,
    source                  TEXT NOT NULL,
    scraped_at              TEXT NOT NULL,
    scrape_date             TEXT NOT NULL,
    origin                  TEXT NOT NULL,
    destination             TEXT NOT NULL,
    route                   TEXT NOT NULL,
    carrier                 TEXT NOT NULL,
    carrier_name            TEXT,
    flight_number           TEXT,
    travel_date             TEXT NOT NULL,
    departure_time          TEXT,
    duration_min            INTEGER,
    stops                   INTEGER,
    advance_purchase_days   INTEGER NOT NULL,
    advance_purchase_window TEXT NOT NULL,
    fare_class              TEXT NOT NULL,
    base_fare               REAL,
    taxes                   REAL,
    total_fare              REAL NOT NULL,
    currency                TEXT NOT NULL DEFAULT 'INR',
    is_outlier              INTEGER NOT NULL DEFAULT 0,
    is_synthetic            INTEGER NOT NULL DEFAULT 0,
    in_basket               INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS ix_fares_route_date ON fares(route, scrape_date);
CREATE INDEX IF NOT EXISTS ix_fares_travel ON fares(travel_date);

CREATE TABLE IF NOT EXISTS index_daily (
    date            TEXT PRIMARY KEY,
    value           REAL NOT NULL,
    n_records       INTEGER NOT NULL,
    n_routes        INTEGER NOT NULL,
    coverage        REAL NOT NULL,
    is_synthetic    INTEGER NOT NULL DEFAULT 0,
    computed_at     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS route_daily (
    date            TEXT NOT NULL,
    route           TEXT NOT NULL,
    window          TEXT NOT NULL,
    avg_fare        REAL NOT NULL,
    median_fare     REAL NOT NULL,
    min_fare        REAL NOT NULL,
    n               INTEGER NOT NULL,
    is_synthetic    INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (date, route, window)
);

-- Official CPI from MoSPI eSankhyiki (api.mospi.gov.in, no API key).
-- 'Item' rows are the airfare item; 'SubGroup' rows are Transport and
-- Communication. The item series has no sector breakdown upstream (all three
-- sector codes return identical values), so it is stored once as 'All'.
CREATE TABLE IF NOT EXISTS official_cpi (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    dataset     TEXT NOT NULL,
    level       TEXT NOT NULL,
    base_year   TEXT NOT NULL,
    series      TEXT NOT NULL,
    item_code   TEXT NOT NULL,
    item_name   TEXT NOT NULL,
    sector      TEXT NOT NULL,
    state       TEXT NOT NULL DEFAULT 'All India',
    year        INTEGER NOT NULL,
    month       TEXT NOT NULL,
    month_num   INTEGER NOT NULL,
    period      TEXT NOT NULL,
    index_value REAL NOT NULL,
    inflation   REAL,
    status      TEXT,
    fetched_at  TEXT NOT NULL,
    UNIQUE (level, base_year, series, item_code, sector, year, month_num)
);
CREATE INDEX IF NOT EXISTS ix_official_cpi_period ON official_cpi(item_code, sector, period);

CREATE TABLE IF NOT EXISTS saved_routes (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    browser_id          TEXT NOT NULL,
    origin              TEXT NOT NULL,
    destination         TEXT NOT NULL,
    preferred_days      TEXT NOT NULL DEFAULT '[]',
    email               TEXT NOT NULL,
    created_at          TEXT NOT NULL,
    last_notified_at    TEXT,
    UNIQUE (browser_id, origin, destination)
);
"""


def connect(path: Path = DB_PATH) -> sqlite3.Connection:
    conn = sqlite3.connect(path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    return conn


def init_db(conn: sqlite3.Connection | None = None) -> sqlite3.Connection:
    conn = conn or connect()
    conn.executescript(SCHEMA)
    conn.commit()
    return conn


def assert_mode_consistent() -> None:
    """
    Refuse to run against the wrong database.

    Serving seeded fares as if they were real is the one failure this whole
    split exists to prevent, so a mismatch is fatal rather than a warning.
    """
    expected = DEMO_DB_PATH if DEMO_MODE else LIVE_DB_PATH
    if DB_PATH != expected:
        raise RuntimeError(f"DEMO_MODE={DEMO_MODE} but DB_PATH is {DB_PATH}")
    if not DEMO_MODE and DB_PATH.name.endswith("_demo.db"):
        raise RuntimeError("Live mode is pointing at the demo database — refusing to start.")


@contextmanager
def session(path: Path = DB_PATH):
    conn = connect(path)
    try:
        conn.executescript(SCHEMA)
        yield conn
        conn.commit()
    finally:
        conn.close()

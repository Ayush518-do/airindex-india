"""SQLite helpers + schema for the processed store (data/processed/airindex.db)."""
from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PROCESSED_DIR = ROOT / "data" / "processed"
PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = PROCESSED_DIR / "airindex.db"

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
    PRIMARY KEY (date, route, window)
);

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
    own = conn is None
    conn = conn or connect()
    conn.executescript(SCHEMA)
    conn.commit()
    return conn if not own else conn


@contextmanager
def session(path: Path = DB_PATH):
    conn = connect(path)
    try:
        conn.executescript(SCHEMA)
        yield conn
        conn.commit()
    finally:
        conn.close()

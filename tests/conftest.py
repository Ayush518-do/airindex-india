"""
Shared fixtures. Every test runs against a throwaway SQLite file in tmp_path —
the live database, the demo database and data/raw/ are never touched, and no
test makes a network call (MoSPI and Brevo are both stubbed).
"""
from __future__ import annotations

import json
import os
import socket
from pathlib import Path

import pytest

# Force live mode before anything imports pipeline.db, whatever the shell says.
os.environ["DEMO_MODE"] = "0"

import pipeline.clean as clean  # noqa: E402
import pipeline.db as db  # noqa: E402
import pipeline.fare_model as fare_model  # noqa: E402
import pipeline.index as index  # noqa: E402
from tests.fixtures import synthetic  # noqa: E402

FIXTURES = Path(__file__).parent / "fixtures"


@pytest.fixture(autouse=True)
def no_network(monkeypatch):
    """Any accidental outbound connection fails loudly instead of hitting a real API."""
    def guard(*_a, **_k):
        raise RuntimeError("tests must not open network connections")
    monkeypatch.setattr(socket, "create_connection", guard)


@pytest.fixture
def db_path(tmp_path, monkeypatch) -> Path:
    """An empty, schema-initialised database that the whole app now points at."""
    path = tmp_path / "test.db"
    monkeypatch.setattr(db, "DB_PATH", path)
    monkeypatch.setattr(db, "LIVE_DB_PATH", path)  # keeps assert_mode_consistent happy
    monkeypatch.setattr(fare_model, "MODEL_PATH", tmp_path / "model.pkl")
    fare_model._cache.clear()
    db.init_db(db.connect()).close()
    return path


@pytest.fixture
def conn(db_path):
    c = db.connect()
    yield c
    c.close()


@pytest.fixture
def seeded_db(db_path, tmp_path, monkeypatch) -> Path:
    """
    ~12 days of fares from the fixture generator, ingested through the real
    clean -> index pipeline.

    The generator is pinned to its built-in fare table (no anchoring to
    whatever happens to be in data/raw/), so results are deterministic. Its
    snapshots are marked synthetic; here they are relabelled as ordinary
    fares, because in these tests they stand in for real scrapes and live
    mode would otherwise (correctly) filter them all out.
    """
    raw = tmp_path / "raw"
    raw.mkdir()
    monkeypatch.setattr(synthetic, "latest_snapshots", lambda *a, **k: [])
    monkeypatch.setattr(clean, "RAW_DIR", raw)

    for path in synthetic.write(days=12, out_dir=raw):
        snap = json.loads(path.read_text(encoding="utf-8"))
        snap["synthetic"] = False
        snap["source"] = "fixture"
        path.write_text(json.dumps(snap), encoding="utf-8")

    clean.run(rebuild=True)
    index.run()
    return db_path


def insert_fare(conn, **kw) -> None:
    """Insert one fare (and its snapshot row) with sensible defaults."""
    row = {
        "snapshot_file": "t.json", "source": "test", "scraped_at": f"{kw.get('scrape_date', '2026-09-01')}T09:00:00",
        "scrape_date": "2026-09-01", "origin": "DEL", "destination": "BOM", "route": "DEL-BOM",
        "carrier": "6E", "carrier_name": "IndiGo", "flight_number": "6E-1", "travel_date": "2026-09-03",
        "departure_time": "09:00", "duration_min": 130, "stops": 0, "advance_purchase_days": 2,
        "advance_purchase_window": "0-3", "fare_class": "economy", "base_fare": None, "taxes": None,
        "total_fare": 5000.0, "currency": "INR", "is_outlier": 0, "is_synthetic": 0, "in_basket": 1,
    }
    row.update(kw)
    conn.execute(
        "INSERT OR IGNORE INTO snapshots (file, source, scraped_at, scrape_date, n_queries, n_ok, n_raw, n_kept,"
        " is_synthetic, ingested_at) VALUES (?,?,?,?,1,1,1,1,?,?)",
        (row["snapshot_file"], row["source"], row["scraped_at"], row["scrape_date"], row["is_synthetic"], row["scraped_at"]),
    )
    cols = list(row)
    conn.execute(f"INSERT INTO fares ({','.join(cols)}) VALUES ({','.join('?' for _ in cols)})",
                 [row[c] for c in cols])


def load_fixture(name: str) -> dict:
    return json.loads((FIXTURES / "mospi" / name).read_text(encoding="utf-8"))

"""
Official CPI from MoSPI eSankhyiki -> the `official_cpi` table.

Source: https://api.mospi.gov.in (public, no API key). Endpoint paths follow the
official client, github.com/nso-india/mospi-esankhyiki, and its documented
discovery workflow: list base years -> list filters -> resolve codes -> fetch.

Why this matters to the project: CPI carries an item that matches our product
almost exactly — "Air Fare (normal): Economy Class(adult)" — with monthly
history back to 2014. Our APIx measures nonstop *economy* fares, so the two are
directly comparable, and CPI gives us a real historical backbone that scraping
alone cannot (a scraper only ever accumulates forward, in wall-clock time).

Codes are **resolved by name, never hardcoded**. If MoSPI renames or withdraws
the item we want this to fail loudly here rather than silently bind to the
wrong series and quietly corrupt every comparison downstream.

    python -m pipeline.mospi                 # refresh 2014..now
    python -m pipeline.mospi --years 2024 2025
"""
from __future__ import annotations

import argparse
import json
import logging
import random
import re
import time
from datetime import date, datetime
from pathlib import Path

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.ssl_ import create_urllib3_context

from pipeline import timeutil
from pipeline.db import ROOT, session

log = logging.getLogger("pipeline.mospi")

BASE_URL = "https://api.mospi.gov.in"
CACHE_DIR = ROOT / "data" / "raw" / "mospi"

DATASET = "CPI"
# Only the 2012 base has item-level data; the 2024 base returns empty filters.
BASE_YEAR = "2012"
SERIES = "Current"
ALL_INDIA = 99
SECTORS = {1: "Rural", 2: "Urban", 3: "Combined"}
FIRST_YEAR = 2014

# What we are looking for, by name. Kept as patterns so an upstream wording
# tweak ("Airfare" vs "Air Fare") still matches while a real change does not.
AIRFARE_PATTERN = re.compile(r"air\s*fare", re.I)
TRANSPORT_PATTERN = re.compile(r"transport", re.I)

MONTHS = {
    "january": 1, "february": 2, "march": 3, "april": 4, "may": 5, "june": 6,
    "july": 7, "august": 8, "september": 9, "october": 10, "november": 11, "december": 12,
}

RETRY_STATUS = {429, 500, 502, 503, 504}
MAX_ATTEMPTS = 4
TIMEOUT_S = 30


class MospiError(RuntimeError):
    pass


class _LegacyTLSAdapter(HTTPAdapter):
    """
    api.mospi.gov.in needs legacy TLS renegotiation, which OpenSSL 3 refuses by
    default (`UNSAFE_LEGACY_RENEGOTIATION_DISABLED`). curl still allows it,
    which is why the endpoint works from a shell but not from plain requests.
    Scoped to this one adapter so the rest of the app keeps strict defaults.
    """

    def init_poolmanager(self, *args, **kwargs):
        ctx = create_urllib3_context()
        ctx.options |= getattr(__import__("ssl"), "OP_LEGACY_SERVER_CONNECT", 0x4)
        kwargs["ssl_context"] = ctx
        return super().init_poolmanager(*args, **kwargs)


_session = requests.Session()
_session.mount("https://", _LegacyTLSAdapter())


def _get(path: str, params: dict | None = None) -> dict:
    """GET with backoff on the transient statuses the upstream client also retries."""
    url = f"{BASE_URL}{path}"
    last = None
    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            resp = _session.get(url, params=params, timeout=TIMEOUT_S)
        except requests.RequestException as exc:
            last = exc
        else:
            if resp.status_code not in RETRY_STATUS:
                if resp.status_code != 200:
                    raise MospiError(f"{path} -> HTTP {resp.status_code}: {resp.text[:200]}")
                try:
                    return resp.json()
                except ValueError as exc:
                    raise MospiError(f"{path} returned non-JSON: {resp.text[:200]}") from exc
            last = MospiError(f"{path} -> HTTP {resp.status_code}")
        if attempt < MAX_ATTEMPTS:
            sleep_s = 2 ** (attempt - 1) + random.uniform(0, 0.5)
            log.warning("mospi %s attempt %d failed (%s); retrying in %.1fs", path, attempt, last, sleep_s)
            time.sleep(sleep_s)
    raise MospiError(f"{path} failed after {MAX_ATTEMPTS} attempts: {last}")


def _cache_write(name: str, payload: dict) -> None:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    (CACHE_DIR / name).write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")


# --------------------------------------------------------------------------- #
# Discovery
# --------------------------------------------------------------------------- #
def _filters(level: str) -> dict:
    payload = _get(
        "/api/cpi/getCpiFilterByLevelAndBaseYear",
        {"base_year": BASE_YEAR, "level": level, "series_code": "null"},
    )
    _cache_write(f"filters_{level}_{BASE_YEAR}.json", payload)
    data = payload.get("data")
    # The Item level returns a bare object, the Group level a single-item list.
    if isinstance(data, list):
        data = data[0] if data else {}
    return data or {}


def discover() -> dict:
    """
    Resolve the codes we need by name. Raises if the airfare item is missing,
    which is the signal that the upstream catalogue changed under us.
    """
    items = _filters("Item").get("item", [])
    airfare = [i for i in items if AIRFARE_PATTERN.search(i.get("item_name", ""))]
    if not airfare:
        raise MospiError(
            f"No CPI item matching /{AIRFARE_PATTERN.pattern}/ in base year {BASE_YEAR} "
            f"({len(items)} items scanned). The catalogue may have changed — "
            "re-check getCpiFilterByLevelAndBaseYear before trusting any comparison."
        )
    if len(airfare) > 1:
        log.warning("multiple airfare-like items, using the first: %s", [i["item_name"] for i in airfare])

    subgroups = _filters("Group").get("subgroup", [])
    transport = [g for g in subgroups if TRANSPORT_PATTERN.search(g.get("subgroup_name", ""))]
    if not transport:
        raise MospiError(f"No CPI sub-group matching /{TRANSPORT_PATTERN.pattern}/ in base year {BASE_YEAR}")

    found = {
        "item_code": airfare[0]["item_code"],
        "item_name": airfare[0]["item_name"],
        "subgroup_code": transport[0]["subgroup_code"],
        "subgroup_name": transport[0]["subgroup_name"],
    }
    log.info("resolved item %(item_code)s %(item_name)r; sub-group %(subgroup_code)s %(subgroup_name)r", found)
    return found


# --------------------------------------------------------------------------- #
# Fetch
# --------------------------------------------------------------------------- #
def _paged(path: str, params: dict, cache_name: str) -> list[dict]:
    """Walk meta_data.totalPages (the API serves 10 rows a page)."""
    rows: list[dict] = []
    page = 1
    while True:
        payload = _get(path, {**params, "page": page})
        batch = payload.get("data") or []
        rows.extend(batch)
        meta = payload.get("meta_data") or {}
        total_pages = meta.get("totalPages") or 1
        if page == 1:
            _cache_write(cache_name, payload)
        if page >= total_pages or not batch:
            break
        page += 1
    return rows


def fetch_item_series(item_code: str, year: int) -> list[dict]:
    return _paged(
        "/api/cpi/getItemIndex",
        {"base_year": BASE_YEAR, "item_code": item_code, "year": year, "series": SERIES},
        f"item_{item_code}_{year}.json",
    )


def fetch_subgroup_series(subgroup_code: str, year: int, sector_code: int) -> list[dict]:
    return _paged(
        "/api/cpi/getCPIIndex",
        {
            "base_year": BASE_YEAR, "subgroup_code": subgroup_code, "year": year,
            "series": SERIES, "sector_code": sector_code, "state_code": ALL_INDIA,
        },
        f"subgroup_{subgroup_code}_{sector_code}_{year}.json",
    )


def _row(level: str, code: str, name: str, sector: str, raw: dict) -> dict | None:
    month_num = MONTHS.get(str(raw.get("month", "")).strip().lower())
    if month_num is None:
        return None
    try:
        year = int(raw["year"])
        index_value = float(raw["index"])
    except (KeyError, TypeError, ValueError):
        return None
    inflation = raw.get("inflation")
    try:
        inflation = float(inflation) if inflation not in (None, "") else None
    except (TypeError, ValueError):
        inflation = None
    return {
        "dataset": DATASET, "level": level, "base_year": BASE_YEAR, "series": SERIES,
        "item_code": code, "item_name": name, "sector": sector,
        "state": raw.get("state") or "All India",
        "year": year, "month": raw["month"], "month_num": month_num,
        "period": f"{year:04d}-{month_num:02d}",
        "index_value": index_value, "inflation": inflation, "status": raw.get("status"),
        "fetched_at": timeutil.stamp(),
    }


UPSERT = """
INSERT INTO official_cpi
  (dataset, level, base_year, series, item_code, item_name, sector, state,
   year, month, month_num, period, index_value, inflation, status, fetched_at)
VALUES
  (:dataset, :level, :base_year, :series, :item_code, :item_name, :sector, :state,
   :year, :month, :month_num, :period, :index_value, :inflation, :status, :fetched_at)
ON CONFLICT(level, base_year, series, item_code, sector, year, month_num) DO UPDATE SET
  index_value = excluded.index_value,
  inflation   = excluded.inflation,
  status      = excluded.status,
  fetched_at  = excluded.fetched_at
"""


def run(years: list[int] | None = None) -> dict:
    years = years or list(range(FIRST_YEAR, timeutil.today().year + 1))
    codes = discover()
    rows: list[dict] = []

    for year in years:
        for raw in fetch_item_series(codes["item_code"], year):
            # Sector is stored as 'All': upstream returns identical values for
            # all three sector codes at item level, so pretending otherwise
            # would invent a breakdown that does not exist.
            r = _row("Item", codes["item_code"], codes["item_name"], "All", raw)
            if r:
                rows.append(r)
        for sector_code, sector_name in SECTORS.items():
            for raw in fetch_subgroup_series(codes["subgroup_code"], year, sector_code):
                r = _row("SubGroup", codes["subgroup_code"], codes["subgroup_name"], sector_name, raw)
                if r:
                    rows.append(r)

    with session() as conn:
        conn.executemany(UPSERT, rows)
        latest = conn.execute(
            "SELECT MAX(period) FROM official_cpi WHERE level = 'Item'"
        ).fetchone()[0]
        total = conn.execute("SELECT COUNT(*) FROM official_cpi").fetchone()[0]

    result = {
        "rows_written": len(rows),
        "rows_in_db": total,
        "latest_period": latest,
        "item_name": codes["item_name"],
        "item_code": codes["item_code"],
        "years": [years[0], years[-1]] if years else [],
    }
    log.info("mospi: %s", result)
    return result


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--years", nargs="*", type=int, help="specific years (default 2014..now)")
    a = ap.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s", datefmt="%H:%M:%S")
    print(run(a.years))

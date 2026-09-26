"""
MoSPI client against RECORDED api.mospi.gov.in responses (tests/fixtures/mospi/).
The live API is never called: `_get` is replaced by a router over the fixtures,
and the autouse no_network guard would fail any stray connection anyway.
"""
from __future__ import annotations

import copy

import pytest

from pipeline import mospi
from tests.conftest import load_fixture

EMPTY = {"data": [], "meta_data": {"page": 1, "totalPages": 1, "totalRecords": 0}, "msg": "No Data Found"}


class Router:
    """Stands in for mospi._get, serving recorded payloads and logging every call."""

    def __init__(self, item_filters=None, group_filters=None):
        self.calls: list[tuple[str, dict]] = []
        self.item_filters = item_filters or load_fixture("filters_item.json")
        self.group_filters = group_filters or load_fixture("filters_group.json")

    def __call__(self, path: str, params: dict | None = None) -> dict:
        params = params or {}
        self.calls.append((path, params))
        if path.endswith("getCpiFilterByLevelAndBaseYear"):
            return self.item_filters if params["level"] == "Item" else self.group_filters
        page, year = params.get("page", 1), int(params.get("year", 0))
        if path.endswith("getItemIndex"):
            if year == 2025:
                return load_fixture(f"item_2025_page{page}.json")
            if year == 2020 and page == 1:
                return load_fixture("item_2020_page1.json")
            return EMPTY
        if path.endswith("getCPIIndex"):
            if year == 2025 and page == 1:
                return load_fixture("subgroup_combined_2025_page1.json")
            return {**EMPTY, "meta_data": {"page": page, "totalPages": 2}}
        raise AssertionError(f"unexpected call {path} {params}")


@pytest.fixture
def router(monkeypatch, tmp_path):
    r = Router()
    monkeypatch.setattr(mospi, "_get", r)
    monkeypatch.setattr(mospi, "CACHE_DIR", tmp_path / "mospi")  # never write into data/raw/
    return r


# --------------------------------------------------------------------------- #
# Code resolution
# --------------------------------------------------------------------------- #
def test_discover_resolves_codes_by_name(router):
    found = mospi.discover()
    assert found["item_code"] == "6.1.03.3.2.07.0"
    assert found["item_name"] == "Air Fare (normal): Economy Class(adult)"
    assert found["subgroup_code"] == "6.1.03"
    assert found["subgroup_name"] == "Transport and Communication"


def test_discover_fails_loudly_when_the_item_is_renamed(monkeypatch, tmp_path):
    filters = copy.deepcopy(load_fixture("filters_item.json"))
    for item in filters["data"]["item"]:
        item["item_name"] = item["item_name"].replace("Air Fare", "Aviation Travel")
    monkeypatch.setattr(mospi, "_get", Router(item_filters=filters))
    monkeypatch.setattr(mospi, "CACHE_DIR", tmp_path)
    with pytest.raises(mospi.MospiError, match="No CPI item matching"):
        mospi.discover()


def test_discover_fails_when_the_transport_subgroup_disappears(monkeypatch, tmp_path):
    groups = copy.deepcopy(load_fixture("filters_group.json"))
    data = groups["data"][0] if isinstance(groups["data"], list) else groups["data"]
    data["subgroup"] = [g for g in data["subgroup"] if "transport" not in g["subgroup_name"].lower()]
    monkeypatch.setattr(mospi, "_get", Router(group_filters=groups))
    monkeypatch.setattr(mospi, "CACHE_DIR", tmp_path)
    with pytest.raises(mospi.MospiError, match="sub-group"):
        mospi.discover()


# --------------------------------------------------------------------------- #
# Pagination + parsing
# --------------------------------------------------------------------------- #
def test_pagination_walks_every_page(router):
    rows = mospi.fetch_item_series("6.1.03.3.2.07.0", 2025)
    assert len(rows) == 12, "2025 is served as 10 + 2 rows over two pages"
    pages = [p["page"] for path, p in router.calls if path.endswith("getItemIndex")]
    assert pages == [1, 2]


def test_single_page_year_stops_after_one_call(router):
    mospi.fetch_item_series("6.1.03.3.2.07.0", 2020)
    pages = [p["page"] for path, p in router.calls if path.endswith("getItemIndex")]
    assert pages == [1]


def test_row_parsing():
    r = mospi._row("Item", "X", "Air Fare", "All",
                   {"year": 2025, "month": "December", "index": "206.3", "inflation": "1.58", "status": "F"})
    assert (r["period"], r["month_num"], r["index_value"], r["inflation"]) == ("2025-12", 12, 206.3, 1.58)


@pytest.mark.parametrize("raw", [
    {"year": 2025, "month": "Smarch", "index": "1"},     # unknown month
    {"year": 2025, "month": "May"},                       # no index
    {"year": 2025, "month": "May", "index": "n/a"},       # non-numeric
])
def test_bad_rows_are_skipped(raw):
    assert mospi._row("Item", "X", "Air Fare", "All", raw) is None


def test_blank_inflation_becomes_null():
    r = mospi._row("Item", "X", "Air Fare", "All", {"year": 2025, "month": "May", "index": "200", "inflation": ""})
    assert r["inflation"] is None


# --------------------------------------------------------------------------- #
# End to end into SQLite
# --------------------------------------------------------------------------- #
def test_run_writes_item_and_subgroup_rows(router, conn):
    result = mospi.run([2020, 2025])
    assert result["item_code"] == "6.1.03.3.2.07.0"
    assert result["latest_period"] == "2025-12"

    item = conn.execute("SELECT COUNT(*), MIN(sector), MAX(sector) FROM official_cpi WHERE level='Item'").fetchone()
    assert item[0] == 9 + 12
    assert item[1] == item[2] == "All", "the item has no sector split upstream, so it is stored once as 'All'"

    sectors = {r[0] for r in conn.execute("SELECT DISTINCT sector FROM official_cpi WHERE level='SubGroup'")}
    assert sectors == {"Rural", "Urban", "Combined"}


def test_covid_gap_is_preserved_not_interpolated(router, conn):
    mospi.run([2020])
    periods = {r[0] for r in conn.execute("SELECT period FROM official_cpi WHERE level='Item'")}
    assert {"2020-03", "2020-04", "2020-05"}.isdisjoint(periods), "flights were grounded; MoSPI published nothing"
    assert "2020-02" in periods and "2020-06" in periods


def test_run_is_idempotent(router, conn):
    mospi.run([2025])
    first = conn.execute("SELECT COUNT(*) FROM official_cpi").fetchone()[0]
    mospi.run([2025])
    assert conn.execute("SELECT COUNT(*) FROM official_cpi").fetchone()[0] == first


def test_raw_responses_are_cached(router, tmp_path):
    mospi.run([2025])
    cached = {p.name for p in (tmp_path / "mospi").glob("*.json")}
    assert "filters_Item_2012.json" in cached
    assert "item_6.1.03.3.2.07.0_2025.json" in cached


# --------------------------------------------------------------------------- #
# Transport: retries and failures
# --------------------------------------------------------------------------- #
class FakeResp:
    def __init__(self, status: int, payload: dict | None = None):
        self.status_code, self._payload, self.text = status, payload, str(payload)

    def json(self):
        if self._payload is None:
            raise ValueError("not json")
        return self._payload


@pytest.fixture
def transport(monkeypatch):
    monkeypatch.setattr(mospi.time, "sleep", lambda _s: None)
    replies: list[FakeResp] = []
    calls = {"n": 0}

    def get(url, params=None, timeout=None):
        calls["n"] += 1
        return replies.pop(0)

    monkeypatch.setattr(mospi._session, "get", get)
    return replies, calls


def test_transient_errors_are_retried(transport):
    replies, calls = transport
    replies += [FakeResp(503), FakeResp(429), FakeResp(200, {"data": [1]})]
    assert mospi._get("/x") == {"data": [1]}
    assert calls["n"] == 3


def test_client_errors_are_not_retried(transport):
    replies, calls = transport
    replies += [FakeResp(404, {"msg": "nope"})]
    with pytest.raises(mospi.MospiError, match="404"):
        mospi._get("/x")
    assert calls["n"] == 1


def test_gives_up_after_max_attempts(transport):
    replies, calls = transport
    replies += [FakeResp(503)] * mospi.MAX_ATTEMPTS
    with pytest.raises(mospi.MospiError, match="failed after"):
        mospi._get("/x")
    assert calls["n"] == mospi.MAX_ATTEMPTS


def test_non_json_body_is_an_error(transport):
    replies, _ = transport
    replies += [FakeResp(200, None)]
    with pytest.raises(mospi.MospiError, match="non-JSON"):
        mospi._get("/x")

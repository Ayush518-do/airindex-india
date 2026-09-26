"""Raw snapshot -> cleaned fare rows: bucketing, outliers, basket membership."""
from __future__ import annotations

import pytest

from pipeline import clean


def _rec(travel_date: str, fare: float, **kw) -> dict:
    return {"origin": "DEL", "destination": "BOM", "carrier": "6E", "carrier_name": "IndiGo",
            "travel_date": travel_date, "total_fare": fare, "stops": 0, "fare_class": "economy", **kw}


def _snap(records: list[dict], synthetic: bool = False) -> dict:
    s = {"source": "test", "scraped_at": "2026-09-01T09:00:00", "records": records}
    if synthetic:
        s["synthetic"] = True
    return s


@pytest.mark.parametrize("days, window", [
    (0, "0-3"), (3, "0-3"), (4, "4-7"), (7, "4-7"), (8, "8-14"), (14, "8-14"),
    (15, "15-30"), (30, "15-30"), (31, "31-60"), (60, "31-60"),
])
def test_window_bucketing_edges(days, window):
    assert clean.window_for(days) == window


@pytest.mark.parametrize("days", [-1, 61, 365])
def test_out_of_range_days_have_no_window(days):
    assert clean.window_for(days) is None


def test_advance_purchase_is_travel_minus_scrape_day():
    rows = clean._clean_records(_snap([_rec("2026-09-11", 5000)]), "t.json")
    assert rows[0]["advance_purchase_days"] == 10
    assert rows[0]["advance_purchase_window"] == "8-14"


@pytest.mark.parametrize("fare", [0, 499, 60_001, None])
def test_implausible_fares_are_dropped(fare):
    assert clean._clean_records(_snap([_rec("2026-09-03", fare)]), "t.json") == []


def test_unparseable_and_out_of_horizon_travel_dates_are_dropped():
    rows = clean._clean_records(_snap([
        _rec("not-a-date", 5000),
        _rec("2026-08-31", 5000),   # before the scrape day
        _rec("2026-12-31", 5000),   # beyond 60 days
    ]), "t.json")
    assert rows == []


def test_outlier_is_flagged_not_deleted():
    # Four normal fares and one > 3x the group median on the same route/date/stops.
    recs = [_rec("2026-09-03", f) for f in (5000, 5200, 5400, 5600)] + [_rec("2026-09-03", 20_000)]
    rows = clean._clean_records(_snap(recs), "t.json")
    assert len(rows) == 5, "outliers must be kept (flagged), not dropped"
    flagged = [r["total_fare"] for r in rows if r["is_outlier"]]
    assert flagged == [20_000]


def test_small_groups_are_never_flagged():
    # Three fares are too few to call a median; nothing is flagged.
    rows = clean._clean_records(_snap([_rec("2026-09-03", f) for f in (5000, 5100, 30_000)]), "t.json")
    assert not any(r["is_outlier"] for r in rows)


def test_basket_membership_follows_the_fixed_offsets():
    # 2/5/10/21/45 days out are the basket; 3 and 12 are extra scrapes.
    recs = [_rec(d, 5000) for d in ("2026-09-03", "2026-09-06", "2026-09-11", "2026-09-22",
                                     "2026-10-16", "2026-09-04", "2026-09-13")]
    rows = {r["advance_purchase_days"]: r["in_basket"] for r in clean._clean_records(_snap(recs), "t.json")}
    assert rows == {2: 1, 5: 1, 10: 1, 21: 1, 45: 1, 3: 0, 12: 0}


def test_synthetic_flag_is_carried_through():
    real = clean._clean_records(_snap([_rec("2026-09-03", 5000)]), "t.json")
    seeded = clean._clean_records(_snap([_rec("2026-09-03", 5000)], synthetic=True), "t.json")
    assert real[0]["is_synthetic"] == 0
    assert seeded[0]["is_synthetic"] == 1


def test_route_and_codes_are_normalised():
    rows = clean._clean_records(_snap([_rec("2026-09-03", 5000, origin="del", destination="bom")]), "t.json")
    assert rows[0]["route"] == "DEL-BOM"

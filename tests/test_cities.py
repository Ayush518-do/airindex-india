"""
The shared city list: the single source for every place name the app shows,
served to the frontend at GET /meta/cities. A traveller should never see a bare
"DEL-BOM".
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from pipeline import cities, index


def test_route_label_uses_full_names_and_codes():
    assert cities.route_label("DEL-BOM") == "Delhi (DEL) → Mumbai (BOM)"
    assert cities.route_label("del-bom") == "Delhi (DEL) → Mumbai (BOM)", "case-insensitive"


def test_short_label_for_tight_spaces():
    assert cities.route_short_label("MAA-DEL") == "Chennai → Delhi"


def test_unknown_codes_degrade_gracefully():
    assert cities.city_label("ZZZ") == "ZZZ"
    assert cities.route_label("not-a-route-at-all") == "not-a-route-at-all"


@pytest.mark.parametrize("route", list(index.ROUTE_WEIGHTS))
def test_every_tracked_route_has_named_cities(route):
    for code in route.split("-"):
        assert code in cities.CITIES, f"{code} (in {route}) has no display name"
    assert "(" in cities.route_label(route), "must render as 'City (CODE)', not a bare code"


def test_every_city_has_name_and_state():
    for code, info in cities.CITIES.items():
        assert len(code) == 3 and code.isupper()
        assert info["city"] and info["state"], code


@pytest.mark.parametrize("window", index.WINDOWS)
def test_every_booking_window_has_plain_labels(window):
    assert "before travel" in cities.WINDOW_LABELS[window]
    assert "ahead" in cities.WINDOW_SHORT[window]


def test_as_list_is_sorted_and_labelled():
    listed = cities.as_list()
    names = [c["city"] for c in listed]
    assert names == sorted(names)
    delhi = next(c for c in listed if c["code"] == "DEL")
    assert delhi == {"code": "DEL", "city": "Delhi", "state": "Delhi",
                     "airport": "Indira Gandhi International", "label": "Delhi (DEL)"}


def test_meta_cities_endpoint_serves_the_same_list(db_path):
    from backend.main import app
    with TestClient(app) as c:
        served = c.get("/meta/cities").json()
        meta = c.get("/meta").json()
    assert served == cities.as_list()
    assert meta["window_short"] == cities.WINDOW_SHORT
    assert meta["window_labels"] == cities.WINDOW_LABELS

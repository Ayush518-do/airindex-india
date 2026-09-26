"""Low-fare alerts: the cheap threshold, the 24h cooldown, and Brevo (always mocked)."""
from __future__ import annotations

from datetime import date, datetime, timedelta

import pytest

from pipeline import timeutil

from pipeline import notifier

TODAY = date(2026, 9, 26)


def _day(n: int) -> str:
    return (TODAY - timedelta(days=n)).isoformat()


def _route_daily(conn, route: str, day: str, fare: float) -> None:
    conn.execute(
        "INSERT INTO route_daily (date, route, window, avg_fare, median_fare, min_fare, n, is_synthetic)"
        " VALUES (?,?,?,?,?,?,?,0)", (day, route, "0-3", fare, fare, fare, 10),
    )


def _history(conn, route: str, baseline: float, today: float) -> None:
    for n in range(1, 8):          # a week of baseline days
        _route_daily(conn, route, _day(n), baseline)
    _route_daily(conn, route, _day(0), today)
    conn.commit()


def _save(conn, route="DEL-BOM", email="traveller@example.com", last_notified=None) -> int:
    o, d = route.split("-")
    cur = conn.execute(
        "INSERT INTO saved_routes (browser_id, origin, destination, email, created_at, last_notified_at)"
        " VALUES ('browser-1', ?, ?, ?, ?, ?)", (o, d, email, timeutil.now().isoformat(), last_notified),
    )
    conn.commit()
    return cur.lastrowid


class Brevo:
    """Records calls to requests.post instead of sending anything."""

    def __init__(self, status=201):
        self.status, self.calls = status, []

    def __call__(self, url, json=None, headers=None, timeout=None):
        self.calls.append({"url": url, "json": json, "headers": headers})

        class R:
            status_code = self.status
            text = "err"

            @staticmethod
            def json():
                return {"messageId": "<test@brevo>"}
        return R()


@pytest.fixture
def brevo(monkeypatch):
    fake = Brevo()
    monkeypatch.setattr(notifier.requests, "post", fake)
    monkeypatch.setenv("BREVO_API_KEY", "xkeysib-test-key")
    return fake


# --------------------------------------------------------------------------- #
# Threshold
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize("today, cheap", [
    (8400, True),    # 16% below baseline
    (8600, False),   # 14% below
    (8500, False),   # exactly 15%: the rule is strictly "more than 15%"
    (11000, False),  # dearer than usual
])
def test_cheap_threshold(conn, today, cheap):
    _history(conn, "DEL-BOM", baseline=10_000, today=today)
    assert notifier.fare_levels(conn, "DEL-BOM")["is_cheap"] is cheap


def test_fare_levels_reports_the_numbers(conn):
    _history(conn, "DEL-BOM", baseline=10_000, today=8_000)
    lv = notifier.fare_levels(conn, "DEL-BOM")
    assert (lv["today"], lv["baseline"], lv["pct_below"]) == (8000, 10000, 20.0)


def test_baseline_ignores_days_outside_the_window(conn):
    _history(conn, "DEL-BOM", baseline=10_000, today=8_000)
    # A very old, very expensive day must not inflate the baseline.
    _route_daily(conn, "DEL-BOM", _day(notifier.BASELINE_DAYS + 5), 99_000)
    conn.commit()
    assert notifier.fare_levels(conn, "DEL-BOM")["baseline"] == 10_000


def test_no_history_is_never_cheap(conn):
    _route_daily(conn, "DEL-BOM", _day(0), 5_000)
    conn.commit()
    lv = notifier.fare_levels(conn, "DEL-BOM")
    assert lv["baseline"] is None and lv["is_cheap"] is False


# --------------------------------------------------------------------------- #
# Sending + cooldown
# --------------------------------------------------------------------------- #
def test_cheap_route_sends_one_email(conn, brevo):
    _history(conn, "DEL-BOM", baseline=10_000, today=8_000)
    rid = _save(conn)
    out = notifier.run()
    assert out["emails_sent"] == 1 and len(brevo.calls) == 1

    call = brevo.calls[0]
    assert call["headers"]["api-key"] == "xkeysib-test-key"
    assert call["json"]["to"] == [{"email": "traveller@example.com"}]
    assert "Delhi" in call["json"]["subject"] and "Mumbai" in call["json"]["subject"], "full city names, not codes"
    assert conn.execute("SELECT last_notified_at FROM saved_routes WHERE id=?", (rid,)).fetchone()[0]


def test_cooldown_suppresses_a_second_email(conn, brevo):
    _history(conn, "DEL-BOM", baseline=10_000, today=8_000)
    _save(conn, last_notified=(timeutil.now() - timedelta(hours=2)).isoformat(timespec="seconds"))
    out = notifier.run()
    assert out["emails_sent"] == 0 and out["skipped_cooldown"] == 1
    assert brevo.calls == []


def test_cooldown_expires_after_24h(conn, brevo):
    _history(conn, "DEL-BOM", baseline=10_000, today=8_000)
    _save(conn, last_notified=(timeutil.now() - timedelta(hours=notifier.COOLDOWN_HOURS + 1)).isoformat())
    assert notifier.run()["emails_sent"] == 1


def test_not_cheap_sends_nothing(conn, brevo):
    _history(conn, "DEL-BOM", baseline=10_000, today=9_900)
    _save(conn)
    assert notifier.run()["emails_sent"] == 0
    assert brevo.calls == []


def test_missing_api_key_sends_nothing_and_keeps_the_route_eligible(conn, monkeypatch):
    fake = Brevo()
    monkeypatch.setattr(notifier.requests, "post", fake)
    monkeypatch.delenv("BREVO_API_KEY", raising=False)
    _history(conn, "DEL-BOM", baseline=10_000, today=8_000)
    rid = _save(conn)
    out = notifier.run()
    assert out["emails_sent"] == 0 and out["brevo_configured"] is False
    assert fake.calls == []
    assert conn.execute("SELECT last_notified_at FROM saved_routes WHERE id=?", (rid,)).fetchone()[0] is None


def test_failed_send_does_not_start_the_cooldown(conn, monkeypatch):
    # If Brevo rejects the email, the user never got it: try again next run.
    monkeypatch.setattr(notifier.requests, "post", Brevo(status=500))
    monkeypatch.setenv("BREVO_API_KEY", "xkeysib-test-key")
    _history(conn, "DEL-BOM", baseline=10_000, today=8_000)
    rid = _save(conn)
    assert notifier.run()["emails_sent"] == 0
    assert conn.execute("SELECT last_notified_at FROM saved_routes WHERE id=?", (rid,)).fetchone()[0] is None


def test_dry_run_never_calls_brevo(conn, brevo):
    _history(conn, "DEL-BOM", baseline=10_000, today=8_000)
    _save(conn)
    notifier.run(dry_run=True)
    assert brevo.calls == []


def test_email_body_uses_city_names():
    subject, html = notifier._render(
        {"route": "MAA-DEL", "pct_below": 18.0, "today": 7200, "baseline": 8800, "date": "2026-09-26"})
    assert "Chennai (MAA) → Delhi (DEL)" in html
    assert "₹7,200" in html and "₹8,800" in html

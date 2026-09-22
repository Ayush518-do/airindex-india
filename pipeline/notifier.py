"""
Low-fare alerts for saved routes.

Runs after every scrape + pipeline cycle. For each saved route:

    today    = mean nonstop economy fare on the latest scrape day (all windows)
    baseline = mean of the same over the previous BASELINE_DAYS scrape days
    cheap    = today < baseline * (1 - THRESHOLD)        # THRESHOLD = 15%

If cheap and the route hasn't been notified in the last COOLDOWN_HOURS, an
email is sent through the Brevo transactional API. The key is read from the
BREVO_API_KEY environment variable (.env); with no key, alerts are logged only
and nothing is sent. last_notified_at is updated only on a successful send.

    python -m pipeline.notifier            # run once
    python -m pipeline.notifier --dry-run  # evaluate, never send
"""
from __future__ import annotations

import argparse
import logging
import os
from datetime import datetime, timedelta
from pathlib import Path

import requests
from dotenv import load_dotenv

from pipeline.db import ROOT, session

load_dotenv(ROOT / ".env")
log = logging.getLogger("pipeline.notifier")

THRESHOLD = 0.15
BASELINE_DAYS = 14
COOLDOWN_HOURS = 24
BREVO_URL = "https://api.brevo.com/v3/smtp/email"


def evaluate(conn) -> list[dict]:
    """One row per saved route with today's fare, baseline and cheap flag."""
    latest = conn.execute("SELECT MAX(date) AS d FROM route_daily").fetchone()["d"]
    if not latest:
        return []
    out = []
    for r in conn.execute("SELECT * FROM saved_routes"):
        route = f"{r['origin']}-{r['destination']}"
        today = conn.execute("SELECT AVG(avg_fare) AS v FROM route_daily WHERE route = ? AND date = ?", (route, latest)).fetchone()["v"]
        base = conn.execute(
            "SELECT AVG(avg_fare) AS v FROM route_daily WHERE route = ? AND date < ? AND date >= date(?, ?)",
            (route, latest, latest, f"-{BASELINE_DAYS} days"),
        ).fetchone()["v"]
        pct = (base - today) / base if today and base else None
        out.append({
            "id": r["id"], "browser_id": r["browser_id"], "email": r["email"], "route": route,
            "preferred_days": r["preferred_days"], "date": latest,
            "today": round(today) if today else None, "baseline": round(base) if base else None,
            "pct_below": round(pct * 100, 1) if pct is not None else None,
            "is_cheap": bool(pct is not None and pct > THRESHOLD),
            "last_notified_at": r["last_notified_at"],
        })
    return out


def _in_cooldown(last: str | None) -> bool:
    if not last:
        return False
    return datetime.fromisoformat(last) > datetime.now() - timedelta(hours=COOLDOWN_HOURS)


def send_email(to: str, subject: str, html: str) -> bool:
    key = os.environ.get("BREVO_API_KEY", "").strip()
    if not key:
        log.warning("BREVO_API_KEY not set — would email %s: %s", to, subject)
        return False
    payload = {
        "sender": {"name": os.environ.get("ALERT_FROM_NAME", "AIRINDEX INDIA"),
                   "email": os.environ.get("ALERT_FROM_EMAIL", "alerts@airindex.local")},
        "to": [{"email": to}],
        "subject": subject,
        "htmlContent": html,
    }
    try:
        resp = requests.post(BREVO_URL, json=payload, headers={"api-key": key, "accept": "application/json"}, timeout=15)
        if resp.status_code in (200, 201, 202):
            log.info("emailed %s (%s)", to, resp.json().get("messageId"))
            return True
        log.error("Brevo %s: %s", resp.status_code, resp.text[:300])
    except requests.RequestException as exc:
        log.error("Brevo request failed: %s", exc)
    return False


def _render(a: dict) -> tuple[str, str]:
    subject = f"✈ {a['route']} is {a['pct_below']}% cheaper than usual — ₹{a['today']:,}"
    html = f"""
    <div style="font-family:system-ui,sans-serif;max-width:520px">
      <h2 style="margin:0 0 8px">Low fare alert: {a['route']}</h2>
      <p>Today's average nonstop economy fare on <b>{a['route']}</b> is
         <b>₹{a['today']:,}</b> — <b>{a['pct_below']}% below</b> its {BASELINE_DAYS}-day baseline of ₹{a['baseline']:,}.</p>
      <p style="color:#666;font-size:13px">Based on fares scraped on {a['date']}. You're receiving this because you saved this route on AIRINDEX INDIA.
         You won't get another alert for this route for {COOLDOWN_HOURS} hours.</p>
    </div>"""
    return subject, html


def run(dry_run: bool = False) -> dict:
    sent = skipped_cooldown = cheap = 0
    with session() as conn:
        for a in evaluate(conn):
            if not a["is_cheap"]:
                continue
            cheap += 1
            if _in_cooldown(a["last_notified_at"]):
                skipped_cooldown += 1
                continue
            subject, html = _render(a)
            if dry_run:
                log.info("[dry-run] would email %s: %s", a["email"], subject)
                continue
            if send_email(a["email"], subject, html):
                conn.execute("UPDATE saved_routes SET last_notified_at = ? WHERE id = ?",
                             (datetime.now().isoformat(timespec="seconds"), a["id"]))
                sent += 1
    result = {"cheap_routes": cheap, "emails_sent": sent, "skipped_cooldown": skipped_cooldown,
              "brevo_configured": bool(os.environ.get("BREVO_API_KEY", "").strip())}
    log.info("notifier: %s", result)
    return result


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s", datefmt="%H:%M:%S")
    print(run(dry_run=a.dry_run))

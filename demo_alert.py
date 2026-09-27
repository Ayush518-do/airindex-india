"""
Live demo: send a real AIRINDEX alert email for one route, right now.

Uses REAL fares from the database and the SAME Brevo sending code as the daily
notifier. The only difference from the 09:00 job: it skips the "15% cheaper"
rule and the 24h cooldown, so you can show the email arriving during a demo.

If the route really is 15%+ cheaper today, the normal alert email is sent.
Otherwise a "[Demo]" price-update email is sent with the true numbers, so we
never claim a discount that doesn't exist.

    python demo_alert.py --email you@gmail.com
    python demo_alert.py --email you@gmail.com --route DEL-BLR
    python demo_alert.py --email you@gmail.com --dry-run     # preview, don't send
"""
from __future__ import annotations

import argparse
import os
import sys

from pipeline import timeutil
from pipeline.cities import route_label, route_short_label
from pipeline.db import session
from pipeline.notifier import BASELINE_DAYS, _render, fare_levels, latest_date, send_email

WINDOW_WORDS = {
    "0-3": "0-3 days before the flight",
    "4-7": "4-7 days before the flight",
    "8-14": "8-14 days before the flight",
    "15-30": "15-30 days before the flight",
    "31-60": "31-60 days before the flight",
}


def cheapest_window(conn, route: str, day: str) -> tuple[str, int] | None:
    r = conn.execute(
        "SELECT window, avg_fare FROM route_daily WHERE route = ? AND date = ? ORDER BY avg_fare LIMIT 1",
        (route, day),
    ).fetchone()
    return (r["window"], round(r["avg_fare"])) if r else None


def demo_email(route: str, lv: dict, best: tuple[str, int] | None) -> tuple[str, str]:
    label = route_label(route)
    short = route_short_label(route)
    subject = f"[Demo] ✈ {short} fares today: ₹{lv['today']:,}"
    if lv["baseline"] and lv["pct_below"] is not None:
        diff = lv["pct_below"]
        compare = (f"That's <b>{abs(diff)}% {'cheaper' if diff >= 0 else 'more expensive'}</b> than the "
                   f"usual price over the last {BASELINE_DAYS} days (₹{lv['baseline']:,}).")
    else:
        compare = "We don't have enough past days yet to compare with the usual price."
    best_line = (f"<p>Cheapest time to book right now: <b>{WINDOW_WORDS.get(best[0], best[0])}</b> "
                 f"(average ₹{best[1]:,}).</p>") if best else ""
    html = f"""
    <div style="font-family:system-ui,sans-serif;max-width:520px;color:#1f2a44">
      <p style="font-size:12px;letter-spacing:.08em;color:#5b6478;margin:0 0 6px">DEMO ALERT · AIRINDEX INDIA</p>
      <h2 style="margin:0 0 8px">Fare update: {label}</h2>
      <p>Flights from <b>{label}</b> are averaging <b>₹{lv['today']:,}</b> today. {compare}</p>
      {best_line}
      <p style="color:#5b6478;font-size:13px">
         Real nonstop economy fares we checked on {lv['date']}. This is a demo email: normally you only
         get an alert when a route is at least 15% cheaper than usual.</p>
    </div>"""
    return subject, html


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--email", required=True, help="where to send the demo alert")
    ap.add_argument("--route", default="DEL-BOM", help="route code, e.g. DEL-BOM (default)")
    ap.add_argument("--dry-run", action="store_true", help="print the email instead of sending it")
    a = ap.parse_args()
    route = a.route.upper()

    with session() as conn:
        day = latest_date(conn)
        if not day:
            print("No fare data yet. Run: python -m scraper.scheduler --once")
            return 1
        lv = fare_levels(conn, route, day)
        if not lv["today"]:
            print(f"No fares for {route} on {day}. Try another route, e.g. --route DEL-BLR")
            return 1
        best = cheapest_window(conn, route, day)

        # Save the alert like the website would (visible in saved_routes).
        conn.execute(
            "INSERT OR IGNORE INTO saved_routes (browser_id, origin, destination, preferred_days, email, created_at)"
            " VALUES ('demo-cli', ?, ?, '[]', ?, ?)",
            (route.split("-")[0], route.split("-")[1], a.email, timeutil.stamp()),
        )

    if lv["is_cheap"]:
        subject, html = _render({**lv, "route": route})
        kind = "real low-fare alert (route is 15%+ cheaper today)"
    else:
        subject, html = demo_email(route, lv, best)
        kind = "demo fare update (route is not 15% cheaper today, so real numbers are shown)"

    print(f"Route      : {route_label(route)}")
    print(f"Date       : {lv['date']}")
    print(f"Today avg  : ₹{lv['today']:,}")
    print(f"Usual avg  : {('₹' + format(lv['baseline'], ',')) if lv['baseline'] else 'not enough history'}")
    print(f"Email type : {kind}")
    print(f"Subject    : {subject}")

    if a.dry_run:
        print("\n[dry-run] Not sent.")
        return 0

    sender = os.environ.get("ALERT_FROM_EMAIL", "")
    if not os.environ.get("BREVO_API_KEY", "").strip():
        print("\nBREVO_API_KEY is missing in .env, so nothing was sent.")
        return 1
    if sender.endswith(".local") or not sender:
        print(f"\nWarning: ALERT_FROM_EMAIL is '{sender}'. Brevo only sends from a verified sender. "
              "Set it in .env to the email you signed up to Brevo with.")

    ok = send_email(a.email, subject, html)
    print("\nSent! Check the inbox (and the Spam folder)." if ok
          else "\nBrevo did not accept it. Read the error above (usually an unverified sender).")
    return 0 if ok else 1


if __name__ == "__main__":
    import logging
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s", datefmt="%H:%M:%S")
    sys.exit(main())

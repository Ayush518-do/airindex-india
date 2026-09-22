"""
EaseMyTrip one-way domestic search results.

robots.txt (flight.easemytrip.com): `User-Agent: *  Allow: *` — fully open.
We parse the rendered result cards (what a user sees), one page load per
route/date, >= 4s apart. Only the total fare is shown on the card, so
base_fare / taxes are left null for this source.
"""
from __future__ import annotations

import logging
import time

from playwright.sync_api import Page

from scraper.base import BaseSource, CITY_NAMES, Query, RawFare, parse_duration_min, parse_int

log = logging.getLogger("scraper.easemytrip")

# Angular renders results progressively; wait until the card count stops growing.
_SETTLE_POLLS = 6
_SETTLE_GAP_S = 1.5


class EaseMyTripSource(BaseSource):
    name = "easemytrip"
    min_gap_s = 4.0

    def build_url(self, q: Query) -> str:
        d = q.travel_date.strftime("%d/%m/%Y")
        srch = f"{q.origin}-{CITY_NAMES[q.origin]}-India|{q.destination}-{CITY_NAMES[q.destination]}-India|{d}"
        return (
            "https://flight.easemytrip.com/FlightList/Index"
            f"?srch={srch}&px=1-0-0&cbn=0&ar=undefined&isow=true&isdm=true"
            "&lang=en-us&IsDoubleSeat=false&CCODE=IN&curr=INR&apptype=B2C"
        )

    def scrape_query(self, page: Page, q: Query, url: str) -> list[RawFare]:
        page.goto(url, wait_until="domcontentloaded")
        try:
            page.wait_for_selector("div.fltResult", timeout=40_000)
        except Exception:
            body = page.inner_text("body")[:400].lower()
            if "no flight" in body or "not available" in body:
                return []
            raise

        # Let the result list settle.
        last = -1
        for _ in range(_SETTLE_POLLS):
            n = page.locator("div.fltResult").count()
            if n == last:
                break
            last = n
            time.sleep(_SETTLE_GAP_S)

        cards = page.evaluate(_EXTRACT_JS)
        fares: list[RawFare] = []
        for c in cards:
            total = parse_int(c.get("price"))
            if not total or total < 500:
                continue  # sold-out / placeholder rows
            code = (c.get("code") or "").strip().upper() or None
            fares.append(RawFare(
                origin=q.origin,
                destination=q.destination,
                carrier=code or (c.get("airline") or "??")[:2].upper(),
                carrier_name=(c.get("airline") or "").strip(),
                flight_number=f"{code}-{c['number']}" if code and c.get("number") else None,
                travel_date=q.travel_date.isoformat(),
                departure_time=c.get("dep") or None,
                arrival_time=c.get("arr") or None,
                duration_min=parse_duration_min(c.get("duration")),
                stops=_parse_stops(c.get("stops")),
                fare_class=(c.get("cabin") or "economy").strip().lower(),
                base_fare=None,
                taxes=None,
                total_fare=float(total),
                currency="INR",
                raw={k: v for k, v in c.items() if v},
            ))
        return fares


def _parse_stops(s: str | None) -> int | None:
    if not s:
        return None
    s = s.lower()
    if "non" in s:
        return 0
    n = parse_int(s)
    return n if n is not None else None


# Runs in the page; pulls one flat dict per visible result card.
_EXTRACT_JS = r"""
() => Array.from(document.querySelectorAll('div.fltResult')).map(card => {
  const t = sel => { const el = card.querySelector(sel); return el ? el.textContent.trim() : ''; };
  const times = Array.from(card.querySelectorAll('.txt-r2-n')).map(e => e.textContent.trim());
  const fn = card.querySelectorAll('.txt-r5 span.ng-binding');
  const cabinEl = card.querySelector('.txt-r5.ng-binding');
  return {
    airline: t('.txt-r4'),
    code: fn[0] ? fn[0].textContent.trim() : '',
    number: fn[1] ? fn[1].textContent.trim() : '',
    cabin: cabinEl ? cabinEl.textContent.trim() : '',
    dep: times[0] || '',
    arr: times[1] || '',
    duration: t('.dura_md'),
    stops: t('.dura_md2'),
    price: t('span[id^="spnPrice"]'),
    note: t('.full-str'),
  };
})
"""

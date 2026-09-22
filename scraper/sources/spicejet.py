"""
SpiceJet airline-direct one-way search.

robots.txt (www.spicejet.com, User-agent *): disallows /cgi-bin/, /api/v1,
/public/, /externalBooking — the /search page we load is allowed. We only read
the rendered result rows; we never call SpiceJet's APIs ourselves.

Each row exposes three fare families (SpiceSaver / SpiceFlex / SpiceMax). The
Saver fare is stored as fare_class "economy" (what the index uses); the other
two are kept as "economy-flex" / "economy-max" for the raw table.
"""
from __future__ import annotations

import logging
import time

from playwright.sync_api import Page

from scraper.base import BaseSource, Query, RawFare, parse_duration_min, parse_int

log = logging.getLogger("scraper.spicejet")

FARE_FAMILIES = ["economy", "economy-flex", "economy-max"]  # Saver, Flex, Max column order


class SpiceJetSource(BaseSource):
    name = "spicejet"
    min_gap_s = 5.0

    def build_url(self, q: Query) -> str:
        return (
            "https://www.spicejet.com/search"
            f"?from={q.origin}&to={q.destination}&tripType=0&departure={q.travel_date.isoformat()}"
            "&adult=1&child=0&infant=0&currency=INR&class=Economy"
        )

    def scrape_query(self, page: Page, q: Query, url: str) -> list[RawFare]:
        page.goto(url, wait_until="domcontentloaded")
        # Results render client-side; wait for either a flight row or a "no flights" message.
        deadline = time.monotonic() + 40
        rows: list[dict] = []
        while time.monotonic() < deadline:
            time.sleep(2)
            rows = page.evaluate(_EXTRACT_JS)
            if rows:
                time.sleep(2)  # let the remaining rows paint
                rows = page.evaluate(_EXTRACT_JS)
                break
            body = page.inner_text("body").lower()
            if "no flights" in body or "no flight" in body or "not available" in body:
                return []
        fares: list[RawFare] = []
        for r in rows:
            flight = (r.get("flight") or "").replace(" ", "")
            if not flight.startswith("SG"):
                continue
            stops_txt = (r.get("stops") or "").lower()
            stops = 0 if "direct" in stops_txt or "non" in stops_txt else parse_int(stops_txt)
            for fam, price in zip(FARE_FAMILIES, r.get("fares", [])):
                total = parse_int(price)
                if not total or total < 500:
                    continue
                fares.append(RawFare(
                    origin=q.origin, destination=q.destination,
                    carrier="SG", carrier_name="SpiceJet",
                    flight_number=f"SG-{flight[2:]}",
                    travel_date=q.travel_date.isoformat(),
                    departure_time=r.get("dep") or None, arrival_time=r.get("arr") or None,
                    duration_min=parse_duration_min(r.get("duration")),
                    stops=stops, fare_class=fam,
                    base_fare=None, taxes=None, total_fare=float(total), currency="INR",
                    raw={"family": fam, **{k: v for k, v in r.items() if k != "fares"}},
                ))
        return fares


# SpiceJet is React-Native-Web with hashed classes; the stable anchors are the
# repeated ids "aircraft-no" (flight number) and "fare-bundle-val" (3 fares).
_EXTRACT_JS = r"""
() => {
  const out = [];
  document.querySelectorAll('[id="aircraft-no"]').forEach(fn => {
    let row = fn;
    for (let i = 0; i < 14 && row; i++) {
      row = row.parentElement;
      if (row && row.querySelector('[id="fare-bundle-val"]')) break;
    }
    if (!row) return;
    const text = row.innerText || '';
    const times = text.match(/\b\d{2}:\d{2}\b/g) || [];
    const duration = (text.match(/\d+h\s*\d+m/) || [''])[0];
    const stops = (text.match(/Direct|\d+\s*Stop/i) || [''])[0];
    const fareEl = row.querySelector('[id="fare-bundle-val"]');
    const fares = fareEl ? Array.from((fareEl.innerText || '').matchAll(/₹\s*([\d,]{4,7})/g)).map(m => m[1]) : [];
    out.push({ flight: fn.innerText.trim(), dep: times[0] || '', arr: times[1] || '', duration, stops, fares });
  });
  return out;
}
"""

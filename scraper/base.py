"""
Shared scraper infrastructure.

Every source subclasses `BaseSource` and implements `scrape_query(page, q)`.
The base class takes care of:

* robots.txt — every URL we navigate to is checked with urllib.robotparser
  before the request is made; a disallowed URL is skipped and logged, never fetched.
* rate limiting — a minimum gap between page loads (with jitter) per source.
* snapshotting — every run is written to data/raw/<source>_<timestamp>.json.
  The app only ever reads these cached snapshots, never a live scrape.
"""
from __future__ import annotations

import json
import logging
import random
import time
import uuid
from abc import ABC, abstractmethod
from dataclasses import asdict, dataclass, field
from datetime import date, datetime, timedelta
from pathlib import Path
from urllib import robotparser
from urllib.parse import urlparse

from playwright.sync_api import Browser, Page, sync_playwright

ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "data" / "raw"
RAW_DIR.mkdir(parents=True, exist_ok=True)

log = logging.getLogger("scraper")

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
)

# Routes in the index basket (origin, destination).
DEFAULT_ROUTES: list[tuple[str, str]] = [
    ("DEL", "BOM"), ("DEL", "BLR"), ("BOM", "BLR"),
    ("DEL", "CCU"), ("MAA", "DEL"), ("BLR", "HYD"),
]

# One departure per advance-purchase window: 0-3, 4-7, 8-14, 15-30, 31-60 days.
DEFAULT_OFFSETS: list[int] = [2, 5, 10, 21, 45]

CITY_NAMES = {
    "DEL": "Delhi", "BOM": "Mumbai", "BLR": "Bengaluru",
    "CCU": "Kolkata", "MAA": "Chennai", "HYD": "Hyderabad",
}


@dataclass
class Query:
    origin: str
    destination: str
    travel_date: date

    @property
    def route(self) -> str:
        return f"{self.origin}-{self.destination}"


@dataclass
class RawFare:
    """One scraped itinerary. `raw` keeps whatever the source gave us."""
    origin: str
    destination: str
    carrier: str            # IATA code where possible (6E, AI, SG, QP, IX, ...)
    carrier_name: str
    flight_number: str | None
    travel_date: str        # YYYY-MM-DD
    departure_time: str | None
    arrival_time: str | None
    duration_min: int | None
    stops: int | None
    fare_class: str
    base_fare: float | None
    taxes: float | None
    total_fare: float | None
    currency: str = "INR"
    seats_left: int | None = None
    raw: dict = field(default_factory=dict)


@dataclass
class QueryResult:
    origin: str
    destination: str
    travel_date: str
    url: str
    status: str             # ok | blocked | robots_disallowed | empty | error
    n_results: int
    elapsed_s: float
    error: str | None = None


class RobotsGate:
    """Caches robots.txt per host and answers can_fetch()."""

    def __init__(self, user_agent: str = "*"):
        self.ua = user_agent
        self._parsers: dict[str, robotparser.RobotFileParser] = {}

    def allowed(self, url: str) -> bool:
        host = urlparse(url).netloc
        rp = self._parsers.get(host)
        if rp is None:
            rp = robotparser.RobotFileParser()
            rp.set_url(f"https://{host}/robots.txt")
            try:
                rp.read()
            except Exception as exc:  # network failure -> be conservative
                log.warning("robots.txt unreadable for %s (%s); treating as disallowed", host, exc)
                rp.disallow_all = True
            self._parsers[host] = rp
        return rp.can_fetch(self.ua, url)


class RateLimiter:
    def __init__(self, min_gap_s: float, jitter_s: float = 1.5):
        self.min_gap, self.jitter = min_gap_s, jitter_s
        self._last = 0.0

    def wait(self):
        gap = self.min_gap + random.uniform(0, self.jitter)
        elapsed = time.monotonic() - self._last
        if elapsed < gap:
            time.sleep(gap - elapsed)
        self._last = time.monotonic()


class BaseSource(ABC):
    name: str = "base"
    min_gap_s: float = 4.0          # polite: >= 4s between page loads
    headless: bool = True
    nav_timeout_ms: int = 45_000

    def __init__(self):
        self.robots = RobotsGate("*")
        self.limiter = RateLimiter(self.min_gap_s)

    # ---- to implement per source ------------------------------------------
    @abstractmethod
    def build_url(self, q: Query) -> str: ...

    @abstractmethod
    def scrape_query(self, page: Page, q: Query, url: str) -> list[RawFare]: ...

    # ---- run loop ----------------------------------------------------------
    def run(
        self,
        routes: list[tuple[str, str]] | None = None,
        offsets: list[int] | None = None,
        max_queries: int | None = None,
    ) -> Path:
        routes = routes or DEFAULT_ROUTES
        offsets = offsets or DEFAULT_OFFSETS
        today = date.today()
        queries = [Query(o, d, today + timedelta(days=k)) for (o, d) in routes for k in offsets]
        if max_queries:
            queries = queries[:max_queries]

        run_id = uuid.uuid4().hex[:8]
        started = datetime.now()
        records: list[RawFare] = []
        results: list[QueryResult] = []
        log.info("[%s] run %s: %d queries", self.name, run_id, len(queries))

        with sync_playwright() as pw:
            browser = pw.chromium.launch(headless=self.headless)
            context = browser.new_context(
                user_agent=USER_AGENT, locale="en-IN", timezone_id="Asia/Kolkata",
                viewport={"width": 1366, "height": 900},
            )
            page = context.new_page()
            page.set_default_navigation_timeout(self.nav_timeout_ms)
            try:
                for q in queries:
                    url = self.build_url(q)
                    t0 = time.monotonic()
                    if not self.robots.allowed(url):
                        log.warning("[%s] robots.txt disallows %s — skipped", self.name, url)
                        results.append(QueryResult(q.origin, q.destination, q.travel_date.isoformat(), url,
                                                   "robots_disallowed", 0, 0.0))
                        continue
                    self.limiter.wait()
                    try:
                        fares = self.scrape_query(page, q, url)
                        status = "ok" if fares else "empty"
                        records.extend(fares)
                        results.append(QueryResult(q.origin, q.destination, q.travel_date.isoformat(), url,
                                                   status, len(fares), round(time.monotonic() - t0, 1)))
                        log.info("[%s] %s %s -> %d fares", self.name, q.route, q.travel_date, len(fares))
                    except Exception as exc:
                        msg = f"{type(exc).__name__}: {str(exc)[:200]}"
                        status = "blocked" if _looks_blocked(msg) else "error"
                        results.append(QueryResult(q.origin, q.destination, q.travel_date.isoformat(), url,
                                                   status, 0, round(time.monotonic() - t0, 1), msg))
                        log.error("[%s] %s %s -> %s", self.name, q.route, q.travel_date, msg)
            finally:
                context.close()
                browser.close()

        return self.write_snapshot(run_id, started, queries, results, records)

    def write_snapshot(self, run_id, started, queries, results, records) -> Path:
        snapshot = {
            "source": self.name,
            "run_id": run_id,
            "scraped_at": started.isoformat(timespec="seconds"),
            "finished_at": datetime.now().isoformat(timespec="seconds"),
            "robots_checked": True,
            "min_gap_s": self.min_gap_s,
            "n_queries": len(queries),
            "n_records": len(records),
            "queries": [asdict(r) for r in results],
            "records": [asdict(r) for r in records],
        }
        path = RAW_DIR / f"{self.name}_{started.strftime('%Y%m%d_%H%M%S')}.json"
        path.write_text(json.dumps(snapshot, ensure_ascii=False, indent=1), encoding="utf-8")
        ok = sum(1 for r in results if r.status == "ok")
        log.info("[%s] snapshot -> %s (%d records, %d/%d queries ok)", self.name, path.name, len(records), ok, len(results))
        return path


def _looks_blocked(msg: str) -> bool:
    m = msg.lower()
    return any(k in m for k in ("403", "captcha", "access denied", "blocked", "429", "net::err_http2", "cloudflare"))


def latest_snapshots(source: str | None = None) -> list[Path]:
    """All raw snapshots, newest first (optionally for one source)."""
    pattern = f"{source}_*.json" if source else "*.json"
    return sorted(RAW_DIR.glob(pattern), key=lambda p: p.stat().st_mtime, reverse=True)


def parse_int(s: str | None) -> int | None:
    if not s:
        return None
    digits = "".join(ch for ch in s if ch.isdigit())
    return int(digits) if digits else None


def parse_duration_min(s: str | None) -> int | None:
    """'2h 15m' / '2 h 15 m' / '02:15' -> minutes."""
    if not s:
        return None
    s = s.lower().replace(" ", "")
    if ":" in s and "h" not in s:
        h, m = s.split(":")[:2]
        return int(h) * 60 + int(m)
    h = m = 0
    if "h" in s:
        h_part, s = s.split("h", 1)
        h = int("".join(c for c in h_part if c.isdigit()) or 0)
    if "m" in s:
        m = int("".join(c for c in s.split("m")[0] if c.isdigit()) or 0)
    return h * 60 + m if (h or m) else None

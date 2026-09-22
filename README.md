# AIRINDEX INDIA — Real-time Airfare Price Index (APIx)

Prototype for **Smart India Hackathon 2026 · MoSPI problem statement**: a daily airfare
price index for Indian domestic routes built from web-scraped airline/OTA fares, with an
open API for NSO/RBI-style consumers and consumer-facing features (fare elasticity,
festival surge, fare prediction, low-fare alerts).

> **Not an official statistic.** This is a hackathon prototype. Seeded demo history and
> illustrative reference values are disclosed everywhere they appear (see § Honesty notes).

---

## What it does

| Layer | Where | What |
|---|---|---|
| Scrape | `scraper/` | Playwright scrapers, one file per source, robots.txt-checked, rate-limited, every run cached as JSON in `data/raw/` |
| Clean | `pipeline/clean.py` | raw JSON → `fares` table (SQLite), outlier + basket flags |
| Index | `pipeline/index.py` | daily **APIx**: route × advance-purchase basket, DGCA-share weighted, base day = 100 |
| Forecast | `pipeline/trend_forecast.py` | OLS line through the last 10 days, 3–7 days ahead, 95 % residual band |
| Predict | `pipeline/fare_model.py` | GradientBoosting fare model; predicted-vs-actual overlay and `/predict` |
| Festivals | `pipeline/festivals.py` | hard-coded festival calendar → festival-vs-normal surge per route |
| Alerts | `pipeline/notifier.py` | saved routes > 15 % below 14-day baseline → email via Brevo, 24 h cooldown |
| Back-test | `pipeline/backtest.py` | scraped levels vs a public reference table (`data/reference/`) |
| API | `backend/main.py` | FastAPI + Swagger (`/docs`) |
| UI | `frontend/` | React + Recharts dashboard, React Bits animations |

## Quick start

```bash
# 1. Python
python -m venv .venv
.venv/Scripts/activate            # Windows   (source .venv/bin/activate on macOS/Linux)
pip install -r backend/requirements.txt
python -m playwright install chromium

# 2. Build the data store from the cached snapshots that ship in data/raw/
python -m pipeline.run_all --rebuild

# 3. API  (http://localhost:8000/docs)
python -m uvicorn backend.main:app --reload --reload-dir backend --reload-dir pipeline --port 8000

# 4. Frontend  (http://localhost:5173)
cd frontend && npm install && npm run dev
```

The app reads only from `data/processed/airindex.db`, which is built from the JSON snapshots
in `data/raw/`. **It never depends on a live scrape**, so the demo works offline and cannot
be broken by a site blocking us.

### Refreshing data

```bash
python -m scraper.run                          # scrape all sources, all routes, standard offsets
python -m scraper.run --source easemytrip --routes DEL-BOM --offsets 2,10   # quick test
python -m scraper.run --dates 2026-11-07,2026-10-28   # explicit travel dates (festival vs control)
python -m pipeline.run_all                     # clean → index → model → festivals → alerts
python -m scraper.scheduler --every 6h         # do both, forever
```

### Alerts (Brevo)

```bash
cp .env.example .env
# edit .env:  BREVO_API_KEY=xkeysib-...
```

`BREVO_API_KEY` is read from the environment (`python-dotenv` loads `.env`); it is never
hard-coded and `.env` is git-ignored. Without a key the notifier evaluates alerts and logs
what it *would* send. `ALERT_FROM_EMAIL` / `ALERT_FROM_NAME` are optional.

---

## Methodology

### Basket

Six routes, weighted by approximate DGCA domestic traffic share (normalised to 1):

| Route | Weight | Route | Weight |
|---|---|---|---|
| DEL-BOM | 0.26 | DEL-CCU | 0.13 |
| DEL-BLR | 0.20 | MAA-DEL | 0.12 |
| BOM-BLR | 0.18 | BLR-HYD | 0.11 |

Each route is observed at a **fixed advance-purchase profile** — one departure per window,
scraped exactly 2 / 5 / 10 / 21 / 45 days ahead (windows `0-3`, `4-7`, `8-14`, `15-30`,
`31-60`). This mirrors DGCA's Tariff Monitoring Unit, which checks fares 30/15/7/3/2/1
days ahead. Only **nonstop economy** fares go into the index (comparable product);
connections, fare families and outliers are kept in the table but flagged.

### Index

```
cell price relative   rel[D][r][w] = mean_fare[D][r][w] / mean_fare[BASE][r][w]
route relative        rel[D][r]    = mean over windows w observed on D
APIx[D]               = 100 × Σ_r W_r · rel[D][r]  /  Σ_r W_r        (routes observed on D)
```

Laspeyres-style fixed basket, base = first captured day. `coverage` = share of basket
weight actually observed that day; routes/windows missing on a day are renormalised out
rather than imputed.

### Cleaning

* Sold-out / placeholder rows (no total, < ₹500, > ₹60 000) dropped.
* Outliers: within each (route, travel date, stops) group, fares above 3 × the group
  median are flagged `is_outlier = 1` (kept in `/fares/raw`, excluded from index + model).
* `in_basket = 1` only for records scraped at the standard offsets; extra festival/control
  scrapes feed the model and festival analysis but not the index.
* `base_fare` / `taxes` are `null` where the source card shows only the total.

### Forecast

Ordinary least squares through the last 10 index values, extrapolated 3–7 days, anchored on
the last actual value, band = 1.96 × residual SE × √h. Deliberately simple: with a few weeks
of daily data a linear trend with a visible band is the most defensible thing to show.

### Fare model

`GradientBoostingRegressor` on `log(total_fare)` with features route, carrier,
days_to_departure, day_of_week, is_weekend, is_festival_season, advance_purchase_window.
Retrained every pipeline cycle; hold-out MAE / MAPE / R² are exposed at `/model/info` and
shown in the UI. Training rows include seeded history when present (counts reported).

### Festival surge

Fares are tagged by **travel date** against `pipeline/festivals.py`'s calendar. For each
(festival, route), the festival mean is compared with the non-festival mean **for the same
advance-purchase window mix** (`basis = "same window"`); if no non-festival fare exists in
that window it falls back to the route's overall non-festival mean and says so
(`basis = "route overall"`). Run `python -m scraper.run --dates <festival>,<control>` to
collect matched pairs — the shipped snapshots include Diwali (7 Nov) vs 28 Oct / 18 Nov.

### Alerts

`today = mean basket fare on the latest scrape day`, `baseline = mean over the previous 14
scrape days`; cheap if `today < 0.85 × baseline`. One email per route per 24 h
(`last_notified_at`). Saved routes are keyed by a random `browser_id` kept in
`localStorage` — no accounts.

---

## Ethical scraping

* **robots.txt is checked before every navigation** (`urllib.robotparser`, cached per host).
  A disallowed URL is skipped and recorded as `robots_disallowed`; it is never fetched.
  Sources whose robots.txt disallows their search pages (Google Flights, Kayak, Ixigo,
  Cleartrip, Goibibo) were **not** used. Current sources:
  * **EaseMyTrip** — `User-Agent: * / Allow: *` on both `www.` and `flight.` hosts.
  * **SpiceJet** — `/search` is allowed; `/api/v1`, `/public/`, `/externalBooking` are not
    and are never called directly.
* **Rate-limited**: ≥ 4–5 s (+ jitter) between page loads per source, one browser
  context, one query at a time. A full run is 30 page loads ≈ 3 minutes.
* **Rendered DOM only** — we read what a user sees; we do not call the sites' internal
  JSON APIs ourselves.
* **Cached-snapshot fallback** — every run is written to `data/raw/<source>_<ts>.json`
  with per-query status (`ok / empty / blocked / robots_disallowed / error`). The app
  serves the latest cached snapshot; a blocked run just leaves the previous one in place.
* Identifies itself with a normal desktop Chrome user agent; no CAPTCHA solving, no
  proxy rotation, no login.

## Honesty notes

* **Seeded history.** A daily index needs many scrape days; this repo was built in one.
  `python -m scraper.backfill` writes synthetic past-day snapshots *anchored to the real
  fare levels* so a 3-week trend can be shown. They are marked `synthetic: true` in the
  file, `is_synthetic = 1` on every row and every index day, counted in `/meta` and
  `/index/daily`, shaded and labelled "seeded history" in the chart, and badged on the hero
  card. `python -m scraper.backfill --purge` removes them; the scheduler never writes a
  synthetic day where a real one exists.
* **Reference table.** DGCA's TMU does not publish route-wise monthly average fares as an
  open table. `data/reference/dgca_reference_fares.json` therefore ships with
  `"status": "ILLUSTRATIVE"` placeholder values so the back-test mechanism can be shown;
  the UI badges this. Replace the numbers with the official figures (same schema, e.g.
  from a MoCA Parliament reply or the MoSPI CPI "air fare" item index) and set
  `"status": "OFFICIAL"`.
* Only the nonstop economy product is indexed; `base_fare`/`taxes` are unavailable from
  the current sources' result cards.

## API

Swagger UI at **`/docs`** (this is the NSO/RBI-facing interface).

| Method | Path | Purpose |
|---|---|---|
| GET | `/meta` | routes, weights, windows, data mode, provenance (sources, snapshot time, real vs seeded days) |
| GET | `/index/daily` | APIx per day, base day = 100, `is_synthetic` per point |
| GET | `/index/forecast?days=5` | linear-trend forecast with band |
| GET | `/index/heatmap` | route × window mean fares (latest day) |
| GET | `/routes/{route}/trend` | fare per window with model overlay + carrier breakdown |
| GET | `/fares/raw` | cleaned records; filter by `route`, `date_from/to`, `scrape_date`, `nonstop_only`, `include_synthetic` |
| GET | `/predict?route=&travel_date=&carrier=` | model fare estimate |
| GET | `/model/info` | training metadata + hold-out metrics |
| GET | `/festivals/surge` · `/festivals/calendar` | festival vs normal per route; the calendar |
| GET | `/backtest/dgca` | scraped levels vs reference table |
| POST | `/routes/save` | save a watched route (`browser_id`, origin, destination, preferred_days, email) |
| GET | `/routes/saved/{browser_id}` · DELETE `/routes/saved/{browser_id}/{id}` | list / remove |
| GET | `/routes/{browser_id}/alerts` | is any saved route cheap today |

## Repository layout

```
scraper/            base.py (robots gate, rate limiter, snapshot writer), run.py, scheduler.py, backfill.py
scraper/sources/    easemytrip.py, spicejet.py  (+ registry in __init__.py)
pipeline/           db.py, clean.py, index.py, trend_forecast.py, fare_model.py, festivals.py, notifier.py, backtest.py, run_all.py
backend/            main.py (FastAPI), fake_data.py (fallback when the store is empty), requirements.txt
frontend/src/       pages/Dashboard.tsx, components/ (HeroStat, TrendChart, Heatmap, RoutePanel, FestivalsTab, MyRoutesTab, BacktestPanel, TopBar, ui.tsx, reactbits/)
data/raw/           cached JSON snapshots (committed — the demo fallback)
data/processed/     airindex.db (rebuilt, git-ignored)
data/reference/     dgca_reference_fares.json
data/models/        fare_model.pkl (rebuilt, git-ignored)
.env.example        BREVO_API_KEY=   (copy to .env; .env is git-ignored)
```

## Frontend notes

Dark, responsive single-page dashboard (Vite + React + TypeScript + Tailwind + Recharts).
Animation uses React Bits components installed from the shadcn registry
(`https://reactbits.dev/r/<Name>-TS-TW.json`): `Particles` (cursor-reactive field behind
the hero), `FadeContent` (section scroll-in), plus `Aurora`, `CountUp`, `SpotlightCard`,
`ShinyText`. Data-series colours are a CVD-validated categorical palette; status colours are
reserved for the day-over-day delta and alerts.

## Adding a source

1. Copy `scraper/sources/spicejet.py`, implement `build_url()` and `scrape_query()`.
2. Register it in `scraper/sources/__init__.py`.
3. Check its robots.txt first — the base class will refuse disallowed URLs anyway.
4. `python -m scraper.run --source <name> --max 2` then `python -m pipeline.run_all`.

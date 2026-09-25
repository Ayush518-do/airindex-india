"""
Step-1 placeholder data.

Everything here is deterministic (seeded RNG) and shaped exactly like the
payloads the real pipeline will produce, so the frontend can be built against
it and later steps only swap the data source, not the contract.
"""
from __future__ import annotations

import random
from datetime import date, datetime, timedelta

SEED = 42

# Six routes from the problem statement. Weights approximate DGCA domestic
# traffic share among these six sectors (normalised to sum to 1.0).
ROUTES: dict[str, float] = {
    "DEL-BOM": 0.26,
    "DEL-BLR": 0.20,
    "BOM-BLR": 0.18,
    "DEL-CCU": 0.13,
    "MAA-DEL": 0.12,
    "BLR-HYD": 0.11,
}

# Advance-purchase windows (days before departure).
WINDOWS: list[str] = ["0-3", "4-7", "8-14", "15-30", "31-60"]

CARRIERS: list[str] = ["6E", "AI", "SG", "QP"]  # IndiGo, Air India, SpiceJet, Akasa

# Rough "normal" one-way fare per route (INR) used to anchor fake numbers.
_ROUTE_BASE_FARE = {
    "DEL-BOM": 5600,
    "DEL-BLR": 6100,
    "BOM-BLR": 4900,
    "DEL-CCU": 5800,
    "MAA-DEL": 6400,
    "BLR-HYD": 3200,
}

# Fares fall as advance-purchase grows; these multipliers shape the curve.
_WINDOW_MULT = {"0-3": 1.55, "4-7": 1.25, "8-14": 1.05, "15-30": 0.92, "31-60": 0.85}

HISTORY_DAYS = 14


def _rng() -> random.Random:
    return random.Random(SEED)


def _days(n: int, end: date | None = None) -> list[date]:
    end = end or date.today()
    return [end - timedelta(days=n - 1 - i) for i in range(n)]


def fake_index_daily() -> dict:
    rng = _rng()
    days = _days(HISTORY_DAYS)
    values: list[float] = []
    v = 100.0
    for i, _ in enumerate(days):
        if i > 0:
            v = v * (1 + rng.uniform(-0.018, 0.026))
        values.append(round(v, 2))

    points = []
    for i, (d, val) in enumerate(zip(days, values)):
        prev = values[i - 1] if i > 0 else None
        points.append({
            "date": d.isoformat(),
            "value": val,
            "change_pct": round((val - prev) / prev * 100, 2) if prev else None,
            "n_records": rng.randint(220, 260),
        })

    latest, prev = points[-1], points[-2]
    return {
        "index_name": "APIx",
        "base_date": days[0].isoformat(),
        "base_value": 100.0,
        "weights": ROUTES,
        "points": points,
        "latest": {
            "date": latest["date"],
            "value": latest["value"],
            "change_pct": latest["change_pct"],
            "change_abs": round(latest["value"] - prev["value"], 2),
        },
    }


def fake_forecast(horizon: int = 5) -> dict:
    daily = fake_index_daily()
    pts = daily["points"]
    last_val = pts[-1]["value"]
    last_day = date.fromisoformat(pts[-1]["date"])
    slope = (pts[-1]["value"] - pts[-7]["value"]) / 6  # crude 7-day slope
    out = []
    for h in range(1, horizon + 1):
        v = last_val + slope * h
        band = 0.9 * h ** 0.5  # widening band
        out.append({
            "date": (last_day + timedelta(days=h)).isoformat(),
            "value": round(v, 2),
            "lower": round(v - band, 2),
            "upper": round(v + band, 2),
        })
    return {
        "method": "linear_trend",
        "history_days": HISTORY_DAYS,
        "horizon_days": horizon,
        "slope_per_day": round(slope, 3),
        "anchor": {"date": pts[-1]["date"], "value": last_val},
        "points": out,
    }


def fake_route_trend(route: str) -> dict:
    rng = random.Random(f"{SEED}-{route}")
    base = _ROUTE_BASE_FARE.get(route, 5000)
    windows = []
    for w in WINDOWS:
        actual = base * _WINDOW_MULT[w] * rng.uniform(0.95, 1.06)
        predicted = base * _WINDOW_MULT[w] * rng.uniform(0.97, 1.03)
        windows.append({
            "window": w,
            "actual_avg": round(actual),
            "predicted_avg": round(predicted),
            "min_fare": round(actual * 0.78),
            "max_fare": round(actual * 1.31),
            "n": rng.randint(18, 42),
        })
    carriers = [
        {"carrier": c, "avg_fare": round(base * rng.uniform(0.9, 1.15)), "n": rng.randint(30, 70)}
        for c in CARRIERS
    ]
    return {"route": route, "windows": windows, "carriers": carriers}


def fake_fares_raw(route: str | None = None, limit: int = 100) -> dict:
    rng = _rng()
    records = []
    scraped = datetime.now().replace(microsecond=0)
    for r in ROUTES:
        if route and r != route:
            continue
        o, d = r.split("-")
        for w in WINDOWS:
            lo, hi = (int(x) for x in w.split("-"))
            for c in CARRIERS[:3]:
                adv = rng.randint(lo, hi)
                total = _ROUTE_BASE_FARE[r] * _WINDOW_MULT[w] * rng.uniform(0.85, 1.2)
                taxes = total * 0.14
                records.append({
                    "origin": o,
                    "destination": d,
                    "route": r,
                    "carrier": c,
                    "travel_date": (scraped.date() + timedelta(days=adv)).isoformat(),
                    "advance_purchase_days": adv,
                    "advance_purchase_window": w,
                    "fare_class": "economy",
                    "base_fare": round(total - taxes),
                    "taxes": round(taxes),
                    "total_fare": round(total),
                    "scraped_at": scraped.isoformat(),
                    "source": "fake",
                })
    return {"count": len(records[:limit]), "total": len(records), "records": records[:limit]}


def fake_heatmap() -> dict:
    """route x advance-purchase window average fares."""
    cells = []
    for r in ROUTES:
        trend = fake_route_trend(r)
        for w in trend["windows"]:
            cells.append({"route": r, "window": w["window"], "avg_fare": w["actual_avg"], "n": w["n"]})
    return {"routes": list(ROUTES), "windows": WINDOWS, "cells": cells}


def fake_festival_surge() -> dict:
    rng = _rng()
    festivals = [
        {"name": "Diwali", "start": "2026-11-06", "end": "2026-11-12"},
        {"name": "Christmas / New Year", "start": "2026-12-22", "end": "2027-01-03"},
        {"name": "Holi", "start": "2027-03-01", "end": "2027-03-05"},
    ]
    surge = []
    for f in festivals:
        for r in ROUTES:
            normal = _ROUTE_BASE_FARE[r]
            pct = rng.uniform(12, 48)
            surge.append({
                "festival": f["name"],
                "route": r,
                "normal_avg": normal,
                "festival_avg": round(normal * (1 + pct / 100)),
                "surge_pct": round(pct, 1),
                "n_festival": rng.randint(20, 60),
                "n_normal": rng.randint(150, 300),
            })
    return {"festivals": festivals, "surge": surge}

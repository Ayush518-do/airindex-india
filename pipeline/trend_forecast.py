"""
Simple, honest short-horizon forecast of the index.

Ordinary least-squares line through the last N index values, extrapolated
3-7 days ahead. The band is the residual standard error of the fit, widened
with sqrt(horizon). No ARIMA/Prophet: with a few weeks of daily data a linear
trend is the most defensible thing to show, and the band makes the
uncertainty visible.
"""
from __future__ import annotations

import math
from datetime import date, timedelta

LOOKBACK_DAYS = 10


def linear_forecast(points: list[dict], horizon: int = 5, lookback: int = LOOKBACK_DAYS) -> dict:
    """points: [{date, value}, ...] ascending. Returns forecast payload."""
    hist = points[-lookback:] if len(points) > lookback else points
    n = len(hist)
    if n == 0:
        return {"method": "linear_trend", "history_days": 0, "horizon_days": horizon, "slope_per_day": 0.0,
                "anchor": None, "points": [], "r2": None, "residual_se": None}

    ys = [p["value"] for p in hist]
    xs = list(range(n))
    if n == 1:
        slope, intercept, se, r2 = 0.0, ys[0], 1.0, None
    else:
        xm, ym = sum(xs) / n, sum(ys) / n
        sxx = sum((x - xm) ** 2 for x in xs)
        sxy = sum((x - xm) * (y - ym) for x, y in zip(xs, ys))
        slope = sxy / sxx if sxx else 0.0
        intercept = ym - slope * xm
        resid = [y - (intercept + slope * x) for x, y in zip(xs, ys)]
        se = math.sqrt(sum(r * r for r in resid) / max(n - 2, 1))
        sst = sum((y - ym) ** 2 for y in ys)
        r2 = round(1 - sum(r * r for r in resid) / sst, 3) if sst else None

    last_day = date.fromisoformat(hist[-1]["date"])
    last_fit = intercept + slope * (n - 1)
    # Anchor the projection on the last actual value, not the fitted one, so the line joins the chart.
    offset = hist[-1]["value"] - last_fit
    out = []
    for h in range(1, horizon + 1):
        v = intercept + slope * (n - 1 + h) + offset
        band = 1.96 * se * math.sqrt(h) if n > 1 else 1.0 * h
        out.append({
            "date": (last_day + timedelta(days=h)).isoformat(),
            "value": round(v, 2), "lower": round(v - band, 2), "upper": round(v + band, 2),
        })
    return {
        "method": "linear_trend",
        "history_days": n,
        "horizon_days": horizon,
        "slope_per_day": round(slope, 3),
        "r2": r2,
        "residual_se": round(se, 3),
        "anchor": {"date": hist[-1]["date"], "value": hist[-1]["value"]},
        "points": out,
    }

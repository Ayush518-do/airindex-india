"""
Back-test: our scraped fare levels vs a public reference table.

Reads data/reference/dgca_reference_fares.json (schema documented in the file)
and compares, per route and month:

    ours      = mean nonstop economy basket fare scraped in that month
    reference = the table's monthly average fare
    deviation = ours / reference - 1

Also builds a monthly index of both series (first common month = 100) so the
two can be drawn on ONE axis once several months exist. The reference file's
`status` field ("ILLUSTRATIVE" | "OFFICIAL") is passed straight through so the
UI can badge it honestly.
"""
from __future__ import annotations

import json
from pathlib import Path

from pipeline.db import ROOT

REF_PATH = ROOT / "data" / "reference" / "dgca_reference_fares.json"
FILTER = "stops = 0 AND fare_class = 'economy' AND is_outlier = 0 AND in_basket = 1"


def load_reference() -> dict:
    return json.loads(REF_PATH.read_text(encoding="utf-8"))


def compute(conn, include_synthetic: bool = False) -> dict:
    ref = load_reference()
    synth_clause = "" if include_synthetic else " AND is_synthetic = 0"
    rows = conn.execute(
        f"SELECT substr(scrape_date, 1, 7) AS month, route, AVG(total_fare) AS avg_fare, COUNT(*) AS n, "
        f"SUM(is_synthetic) AS n_synth FROM fares WHERE {FILTER}{synth_clause} GROUP BY month, route"
    ).fetchall()
    ours: dict[str, dict[str, dict]] = {}
    for r in rows:
        ours.setdefault(r["route"], {})[r["month"]] = {"avg_fare": round(r["avg_fare"]), "n": r["n"], "n_synthetic": r["n_synth"]}

    months = sorted({m for rt in ours.values() for m in rt} | set(ref["months"]))
    latest = max((m for rt in ours.values() for m in rt), default=None)

    # Per-route comparison for the latest month we have data for.
    comparison = []
    for route, ref_months in ref["routes"].items():
        mine = ours.get(route, {}).get(latest) if latest else None
        ref_val = ref_months.get(latest) if latest else None
        comparison.append({
            "route": route, "month": latest,
            "ours": mine["avg_fare"] if mine else None, "n": mine["n"] if mine else 0,
            "reference": ref_val,
            "deviation_pct": round((mine["avg_fare"] / ref_val - 1) * 100, 1) if mine and ref_val else None,
        })
    valid = [c["deviation_pct"] for c in comparison if c["deviation_pct"] is not None]
    mad = round(sum(abs(v) for v in valid) / len(valid), 1) if valid else None

    # Monthly indices on one axis (base = first month present in both).
    def route_weighted(month: str, getter) -> float | None:
        from pipeline.index import ROUTE_WEIGHTS
        num = den = 0.0
        for route, w in ROUTE_WEIGHTS.items():
            v = getter(route, month)
            if v:
                num += w * v; den += w
        return num / den if den else None

    series = []
    base_ours = base_ref = None
    for m in months:
        o = route_weighted(m, lambda r, mm: (ours.get(r, {}).get(mm) or {}).get("avg_fare"))
        rf = route_weighted(m, lambda r, mm: ref["routes"].get(r, {}).get(mm))
        if o and rf and base_ours is None:
            base_ours, base_ref = o, rf
        series.append({
            "month": m,
            "ours_index": round(o / base_ours * 100, 2) if o and base_ours else None,
            "reference_index": round(rf / base_ref * 100, 2) if rf and base_ref else None,
            "ours_fare": round(o) if o else None, "reference_fare": round(rf) if rf else None,
        })

    return {
        "reference": {k: ref[k] for k in ("name", "intended_source", "status", "note", "lead_times_days", "unit")},
        "latest_month": latest,
        "comparison": comparison,
        "mean_abs_deviation_pct": mad,
        "series": series,
        "include_synthetic": include_synthetic,
    }

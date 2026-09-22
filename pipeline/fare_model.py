"""
Fare prediction model (scikit-learn GradientBoostingRegressor).

Features : route, carrier, days_to_departure, day_of_week, is_weekend,
           is_festival_season, advance_purchase_window
Target   : total_fare (nonstop economy, outliers excluded)

Trained on the cleaned `fares` table every pipeline cycle and saved to
data/models/fare_model.pkl with hold-out metrics. Used for:
  * /predict           — fare for a route / travel date / carrier
  * /routes/{r}/trend  — predicted-vs-actual overlay (mean prediction per
                         window over the very records that were scraped)

Synthetic backfill records are included in training when present (the demo
needs variation across travel dates); the metadata reports how many.
"""
from __future__ import annotations

import logging
import pickle
from datetime import date, datetime
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.metrics import mean_absolute_error, r2_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder

from pipeline.db import ROOT, session
from pipeline.festivals import is_festival

log = logging.getLogger("pipeline.fare_model")

MODEL_DIR = ROOT / "data" / "models"
MODEL_DIR.mkdir(parents=True, exist_ok=True)
MODEL_PATH = MODEL_DIR / "fare_model.pkl"

CAT = ["route", "carrier", "advance_purchase_window"]
NUM = ["days_to_departure", "day_of_week", "is_weekend", "is_festival_season"]
TRAIN_FILTER = "stops = 0 AND fare_class = 'economy' AND is_outlier = 0"


def _window_for(days: int) -> str:
    for name, lo, hi in (("0-3", 0, 3), ("4-7", 4, 7), ("8-14", 8, 14), ("15-30", 15, 30), ("31-60", 31, 60)):
        if lo <= days <= hi:
            return name
    return "31-60"


def featurize(route: str, carrier: str, travel_date: date | str, scrape_date: date | str) -> dict:
    td = date.fromisoformat(travel_date) if isinstance(travel_date, str) else travel_date
    sd = date.fromisoformat(scrape_date) if isinstance(scrape_date, str) else scrape_date
    days = max(0, (td - sd).days)
    return {
        "route": route, "carrier": carrier,
        "days_to_departure": days, "day_of_week": td.weekday(),
        "is_weekend": int(td.weekday() >= 5), "is_festival_season": int(is_festival(td)),
        "advance_purchase_window": _window_for(days),
    }


def _load_frame(conn) -> pd.DataFrame:
    df = pd.read_sql_query(
        f"SELECT route, carrier, travel_date, scrape_date, total_fare, is_synthetic FROM fares WHERE {TRAIN_FILTER}", conn
    )
    if df.empty:
        return df
    td = pd.to_datetime(df["travel_date"])
    sd = pd.to_datetime(df["scrape_date"])
    df["days_to_departure"] = (td - sd).dt.days.clip(lower=0)
    df["day_of_week"] = td.dt.weekday
    df["is_weekend"] = (df["day_of_week"] >= 5).astype(int)
    df["is_festival_season"] = td.dt.date.map(lambda d: int(is_festival(d)))
    df["advance_purchase_window"] = df["days_to_departure"].map(_window_for)
    return df


def train(conn) -> dict:
    df = _load_frame(conn)
    if len(df) < 50:
        log.warning("not enough rows to train (%d)", len(df))
        return {"trained": False, "n": len(df)}

    X, y = df[CAT + NUM], np.log(df["total_fare"])   # log target: multiplicative fare structure
    X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=0.2, random_state=42)
    model = Pipeline([
        ("prep", ColumnTransformer([("cat", OneHotEncoder(handle_unknown="ignore"), CAT)], remainder="passthrough")),
        ("gbr", GradientBoostingRegressor(n_estimators=300, max_depth=3, learning_rate=0.05, subsample=0.9, random_state=42)),
    ])
    model.fit(X_tr, y_tr)
    pred = np.exp(model.predict(X_te))
    actual = np.exp(y_te)
    meta = {
        "trained": True,
        "trained_at": datetime.now().isoformat(timespec="seconds"),
        "algorithm": "GradientBoostingRegressor(log total_fare)",
        "features": CAT + NUM,
        "n_train": int(len(X_tr)), "n_test": int(len(X_te)),
        "n_real": int((df["is_synthetic"] == 0).sum()), "n_synthetic": int((df["is_synthetic"] == 1).sum()),
        "holdout_mae_inr": round(float(mean_absolute_error(actual, pred))),
        "holdout_mape_pct": round(float(np.mean(np.abs(actual - pred) / actual) * 100), 1),
        "holdout_r2": round(float(r2_score(actual, pred)), 3),
    }
    with open(MODEL_PATH, "wb") as f:
        pickle.dump({"model": model, "meta": meta}, f)
    log.info("fare model: n=%d  MAE=₹%s  MAPE=%s%%  R²=%s", len(df), meta["holdout_mae_inr"], meta["holdout_mape_pct"], meta["holdout_r2"])
    return meta


_cache: dict = {}


def load() -> dict | None:
    if not MODEL_PATH.exists():
        return None
    mtime = MODEL_PATH.stat().st_mtime
    if _cache.get("mtime") != mtime:
        with open(MODEL_PATH, "rb") as f:
            _cache.update(pickle.load(f), mtime=mtime)
    return _cache


def predict_rows(rows: list[dict]) -> list[float] | None:
    """rows: list of feature dicts from featurize(). Returns fares in INR."""
    m = load()
    if not m or not rows:
        return None
    X = pd.DataFrame(rows)[CAT + NUM]
    return [float(v) for v in np.exp(m["model"].predict(X))]


def predict_one(route: str, carrier: str, travel_date: str, scrape_date: str | None = None) -> dict | None:
    sd = scrape_date or date.today().isoformat()
    feats = featurize(route, carrier, travel_date, sd)
    out = predict_rows([feats])
    if out is None:
        return None
    return {"route": route, "carrier": carrier, "travel_date": travel_date, "as_of": sd,
            "predicted_fare": round(out[0]), "features": feats, "model": {k: v for k, v in load()["meta"].items() if k != "features"}}


def overlay_for_route(conn, route: str, scrape_date: str) -> dict[str, float]:
    """Mean model prediction per advance-purchase window over the scraped records of that day."""
    rows = conn.execute(
        f"SELECT carrier, travel_date, advance_purchase_window AS window FROM fares "
        f"WHERE route = ? AND scrape_date = ? AND {TRAIN_FILTER}", (route, scrape_date)
    ).fetchall()
    if not rows:
        return {}
    feats = [featurize(route, r["carrier"], r["travel_date"], scrape_date) for r in rows]
    preds = predict_rows(feats)
    if preds is None:
        return {}
    acc: dict[str, list[float]] = {}
    for r, p in zip(rows, preds):
        acc.setdefault(r["window"], []).append(p)
    return {w: round(sum(v) / len(v)) for w, v in acc.items()}


def run() -> dict:
    with session() as conn:
        return train(conn)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s", datefmt="%H:%M:%S")
    print(run())
    print(predict_one("DEL-BOM", "6E", "2026-11-07"))

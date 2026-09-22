"""
One full processing cycle over the cached snapshots in data/raw/:

    clean -> index -> fare_model -> festivals -> notifier

    python -m pipeline.run_all             # incremental
    python -m pipeline.run_all --rebuild   # re-ingest every snapshot first

Never scrapes. Safe to run any time; the API reads the resulting SQLite tables.
"""
from __future__ import annotations

import argparse
import importlib
import logging

from pipeline import clean, index

log = logging.getLogger("pipeline")

# Later stages are optional so the cycle keeps working while they're being built.
OPTIONAL_STAGES = ["pipeline.fare_model", "pipeline.festivals", "pipeline.notifier"]


def run(rebuild: bool = False) -> dict:
    out = {"clean": clean.run(rebuild=rebuild), "index": index.run()}
    for mod_name in OPTIONAL_STAGES:
        try:
            mod = importlib.import_module(mod_name)
        except ModuleNotFoundError:
            continue
        try:
            out[mod_name.split(".")[-1]] = mod.run()
        except Exception as exc:  # a failing optional stage must not kill the cycle
            log.exception("stage %s failed: %s", mod_name, exc)
            out[mod_name.split(".")[-1]] = {"error": str(exc)}
    return out


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--rebuild", action="store_true")
    a = ap.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s", datefmt="%H:%M:%S")
    for k, v in run(rebuild=a.rebuild).items():
        print(f"{k}: {v}")

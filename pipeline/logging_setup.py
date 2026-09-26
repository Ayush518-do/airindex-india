"""
Structured JSON logging to data/logs/ plus human-readable stdout.

Two sinks on purpose: the console stays readable while you watch a scrape, and
the file stays greppable/parseable afterwards — when a scheduled run fails at
03:00 the only evidence is the file, so it carries the full context (exception
type, traceback, and any extra fields the caller attached).

    from pipeline.logging_setup import setup_logging
    setup_logging("scheduler")

Attach structured context with the `extra` dict:

    log.info("scrape finished", extra={"source": "easemytrip", "n_records": 953})
"""
from __future__ import annotations

import json
import logging
import logging.handlers
from datetime import datetime
from pathlib import Path

from pipeline.db import ROOT

LOG_DIR = ROOT / "data" / "logs"

# Anything not in here is treated as caller-supplied context worth keeping.
_STANDARD = {
    "name", "msg", "args", "levelname", "levelno", "pathname", "filename", "module",
    "exc_info", "exc_text", "stack_info", "lineno", "funcName", "created", "msecs",
    "relativeCreated", "thread", "threadName", "processName", "process", "taskName",
    "message", "asctime",
}


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "ts": datetime.fromtimestamp(record.created).isoformat(timespec="milliseconds"),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        for key, value in record.__dict__.items():
            if key not in _STANDARD and not key.startswith("_"):
                try:
                    json.dumps(value)
                    payload[key] = value
                except (TypeError, ValueError):
                    payload[key] = repr(value)
        if record.exc_info:
            payload["error"] = {
                "type": record.exc_info[0].__name__ if record.exc_info[0] else None,
                "traceback": self.formatException(record.exc_info),
            }
        return json.dumps(payload, ensure_ascii=False)


def setup_logging(name: str = "airindex", level: int = logging.INFO) -> Path:
    """Idempotent: re-calling it will not stack duplicate handlers."""
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    log_path = LOG_DIR / f"{name}.jsonl"

    root = logging.getLogger()
    root.setLevel(level)
    for h in list(root.handlers):
        if getattr(h, "_airindex", False):
            root.removeHandler(h)

    console = logging.StreamHandler()
    console.setFormatter(logging.Formatter("%(asctime)s %(levelname)-7s %(name)s: %(message)s", "%H:%M:%S"))
    console._airindex = True  # type: ignore[attr-defined]

    # Rotate so an unattended scheduler cannot fill the disk.
    rotating = logging.handlers.RotatingFileHandler(
        log_path, maxBytes=5_000_000, backupCount=5, encoding="utf-8"
    )
    rotating.setFormatter(JsonFormatter())
    rotating._airindex = True  # type: ignore[attr-defined]

    root.addHandler(console)
    root.addHandler(rotating)

    # These are chatty at INFO and drown out our own lines.
    logging.getLogger("apscheduler.executors.default").setLevel(logging.WARNING)
    logging.getLogger("urllib3").setLevel(logging.WARNING)
    return log_path

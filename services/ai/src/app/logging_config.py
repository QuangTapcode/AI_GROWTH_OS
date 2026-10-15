"""Structured, deliberately non-sensitive service logging."""

from __future__ import annotations

import json
import logging
import sys
from typing import Any


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        event = getattr(record, "event", record.getMessage())
        fields = getattr(record, "fields", {})
        payload = {"level": record.levelname, "event": event, **fields}
        return json.dumps(payload, ensure_ascii=False, sort_keys=True)


def configure_logging() -> logging.Logger:
    logger = logging.getLogger("ai_growth_os.ai")
    logger.setLevel(logging.INFO)
    logger.propagate = False
    if not logger.handlers:
        handler = logging.StreamHandler(sys.stdout)
        handler.setFormatter(JsonFormatter())
        logger.addHandler(handler)
    return logger


def log_event(logger: logging.Logger, event: str, **fields: Any) -> None:
    """Log identifiers and measurements only; never request payloads or secrets."""

    safe_fields = {
        key: value
        for key, value in fields.items()
        if key not in {"payload", "prompt", "secret", "token", "api_key", "authorization"}
    }
    logger.info(event, extra={"event": event, "fields": safe_fields})

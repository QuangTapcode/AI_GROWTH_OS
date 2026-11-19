"""How many Gemini requests are left today, and how many of them the Community bot may spend.

The free tier counts requests per model per day and resets at midnight Pacific time. Google offers no call that
reports what is left, so this ledger counts the service's own requests (in the run store's SQLite file) and learns a
model's real daily limit from the 429 that Gemini returns once it is reached ("quotaValue": "20").

The six agents' daily cycle comes first. Their need is measured, not guessed: the most Gemini calls the other
operations made on one day over the last week (at least ``agent_reserve_min``). What is left after that reserve is
spare, and only spare is spent on the spare operations (the Community bot's answers). With no spare left, those
operations go straight to the local model instead of burning the agents' share or waiting on five 429s.
"""

from __future__ import annotations

import json
import re
import sqlite3
import threading
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Callable
from zoneinfo import ZoneInfo

PACIFIC = ZoneInfo("America/Los_Angeles")
HISTORY_DAYS = 7

_SCHEMA = """
CREATE TABLE IF NOT EXISTS gemini_calls (
    day TEXT NOT NULL,
    model TEXT NOT NULL,
    at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS gemini_calls_day ON gemini_calls (day, model);
CREATE TABLE IF NOT EXISTS gemini_model_days (
    day TEXT NOT NULL,
    model TEXT NOT NULL,
    exhausted INTEGER NOT NULL DEFAULT 0,
    unavailable INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (day, model)
);
CREATE TABLE IF NOT EXISTS gemini_limits (
    model TEXT PRIMARY KEY,
    daily_limit INTEGER NOT NULL,
    learned_at TEXT NOT NULL
);
"""

_QUOTA_VALUE = re.compile(r"""['"]quotaValue['"]\s*:\s*['"]?(\d+)""")
_LIMIT_TEXT = re.compile(r"\blimit:\s*(\d+)")


def quota_failure(error_text: str) -> tuple[bool, int | None] | None:
    """(per day?, limit) for a 429, else None. A per-minute 429 passes within a minute; a per-day one lasts until
    midnight Pacific."""
    if "429" not in error_text and "RESOURCE_EXHAUSTED" not in error_text:
        return None
    per_day = "PerDay" in error_text or "per day" in error_text.lower()
    found = _QUOTA_VALUE.search(error_text) or _LIMIT_TEXT.search(error_text)
    return per_day, int(found.group(1)) if found else None


class GeminiQuota:
    def __init__(
        self,
        path: str,
        *,
        primary_model: str,
        default_limit: int = 20,
        limits: dict[str, int] | None = None,
        agent_reserve_min: int = 15,
        spare_operations: tuple[str, ...] = ("community.response",),
        clock: Callable[[], datetime] | None = None,
    ) -> None:
        if path != ":memory:":
            Path(path).parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self._db = sqlite3.connect(path, check_same_thread=False, isolation_level=None)
        self._db.row_factory = sqlite3.Row
        with self._lock:
            self._db.executescript(_SCHEMA)
        self.primary_model = primary_model
        self.default_limit = default_limit
        self.configured_limits = dict(limits or {})
        self.agent_reserve_min = agent_reserve_min
        self.spare_operations = frozenset(op.lower() for op in spare_operations)
        self._clock = clock or (lambda: datetime.now(timezone.utc))

    # --- days -------------------------------------------------------------------------------------------------
    def day(self, at: datetime | None = None) -> str:
        return (at or self._clock()).astimezone(PACIFIC).date().isoformat()

    def resets_at(self) -> str:
        now = self._clock().astimezone(PACIFIC)
        midnight = datetime.combine(now.date() + timedelta(days=1), datetime.min.time(), PACIFIC)
        return midnight.astimezone(timezone.utc).isoformat()

    # --- recording --------------------------------------------------------------------------------------------
    def record_call(self, model: str) -> None:
        now = self._clock()
        with self._lock:
            self._db.execute("INSERT INTO gemini_calls (day, model, at) VALUES (?, ?, ?)", (self.day(now), model, now.isoformat()))

    def _mark(self, model: str, column: str) -> None:
        with self._lock:
            self._db.execute(
                f"INSERT INTO gemini_model_days (day, model, {column}) VALUES (?, ?, 1) "
                f"ON CONFLICT (day, model) DO UPDATE SET {column} = 1",
                (self.day(), model),
            )

    def record_failure(self, model: str, error_text: str) -> None:
        """A daily 429 closes the model for today and teaches its limit; a 404 means the key cannot use it."""
        failure = quota_failure(error_text)
        if failure:
            per_day, limit = failure
            if limit and per_day:
                with self._lock:
                    self._db.execute(
                        "INSERT INTO gemini_limits (model, daily_limit, learned_at) VALUES (?, ?, ?) "
                        "ON CONFLICT (model) DO UPDATE SET daily_limit = excluded.daily_limit, learned_at = excluded.learned_at",
                        (model, limit, self._clock().isoformat()),
                    )
            if per_day:
                self._mark(model, "exhausted")
        elif "404" in error_text or "NOT_FOUND" in error_text:
            self._mark(model, "unavailable")

    # --- reading ----------------------------------------------------------------------------------------------
    def closed_today(self, model: str) -> bool:
        with self._lock:
            row = self._db.execute("SELECT exhausted, unavailable FROM gemini_model_days WHERE day = ? AND model = ?",
                                   (self.day(), model)).fetchone()
        return bool(row and (row["exhausted"] or row["unavailable"]))

    def limit_of(self, model: str) -> tuple[int, str]:
        with self._lock:
            row = self._db.execute("SELECT daily_limit FROM gemini_limits WHERE model = ?", (model,)).fetchone()
        if row:
            return int(row["daily_limit"]), "learned_from_429"
        if model in self.configured_limits:
            return self.configured_limits[model], "configured"
        return self.default_limit, "default_estimate"

    def _models(self) -> list[str]:
        """The primary model and every fallback that answered at least once in the last week: the capacity we know of."""
        since = (self._clock() - timedelta(days=HISTORY_DAYS)).astimezone(PACIFIC).date().isoformat()
        with self._lock:
            rows = self._db.execute("SELECT DISTINCT model FROM gemini_calls WHERE day >= ?", (since,)).fetchall()
        return [self.primary_model, *sorted({r["model"] for r in rows} - {self.primary_model})]

    def _used_today(self) -> dict[str, int]:
        with self._lock:
            rows = self._db.execute("SELECT model, count(*) n FROM gemini_calls WHERE day = ? GROUP BY model",
                                    (self.day(),)).fetchall()
        return {r["model"]: int(r["n"]) for r in rows}

    def _run_history(self) -> tuple[dict[str, int], dict[str, int], set[str]]:
        """From the finished runs of the last week, per Pacific day: Gemini calls of every operation that is not a
        spare one, Gemini calls of all operations, and the days on which a run fell back to the local model."""
        since = self._clock() - timedelta(days=HISTORY_DAYS)
        try:
            with self._lock:
                rows = self._db.execute(
                    "SELECT operation, created_at, result_json FROM runs WHERE created_at >= ? AND result_json IS NOT NULL",
                    (since.isoformat(),)).fetchall()
        except sqlite3.OperationalError:
            return {}, {}, set()  # no run store in this database (tests)
        agents: dict[str, int] = {}
        total: dict[str, int] = {}
        fell_back: set[str] = set()
        for row in rows:
            result = json.loads(row["result_json"])
            day = self.day(datetime.fromisoformat(row["created_at"]))
            if "QUALITY_MODEL_UNAVAILABLE_LOCAL_MODEL_USED" in (result.get("warnings") or []):
                fell_back.add(day)
            if not str(result.get("model_version", "")).startswith("gemini"):
                continue
            calls = int((result.get("usage") or {}).get("llm_calls") or 0)
            total[day] = total.get(day, 0) + calls
            if row["operation"].lower() not in self.spare_operations:
                agents[day] = agents.get(day, 0) + calls
        return agents, total, fell_back

    def status(self) -> dict:
        used = self._used_today()
        history, total_by_day, fell_back = self._run_history()
        today = self.day()
        models = []
        for model in self._models():
            limit, basis = self.limit_of(model)
            closed = self.closed_today(model)
            remaining = 0 if closed else max(0, limit - used.get(model, 0))
            models.append({"model": model, "used": used.get(model, 0), "limit": limit, "limit_basis": basis,
                           "closed_today": closed, "remaining": remaining})
        estimated = sum(m["limit"] for m in models)
        # A day that served this many Gemini calls without ever falling back proves the capacity is at least that.
        proven = max([0, *(n for d, n in total_by_day.items() if d != today and d not in fell_back)])
        any_closed = any(m["closed_today"] for m in models)
        capacity = estimated if any_closed else max(estimated, proven)
        # Calls made before this ledger existed (or by another process) are in the runs, not in the ledger.
        used_total = max(sum(used.values()), total_by_day.get(today, 0))
        remaining = 0 if models and all(m["closed_today"] for m in models) else max(
            0, min(capacity - used_total, sum(m["remaining"] for m in models) + max(0, capacity - estimated)))
        agents_today = history.get(today, 0)
        reserve = max([self.agent_reserve_min, *(n for d, n in history.items() if d != today)])
        still_reserved = max(0, reserve - agents_today)
        return {
            "day_pacific": today,
            "resets_at": self.resets_at(),
            "models": models,
            "capacity_today": capacity,
            "capacity_basis": ("limits_after_429" if any_closed else
                               "proven_by_history" if proven > estimated else "estimated_limits"),
            "used_today": used_total,
            "remaining_today": remaining,
            "agents": {"reserve_per_day": reserve, "used_today": agents_today, "still_reserved": still_reserved,
                       "history": dict(sorted(history.items()))},
            "spare_for": sorted(self.spare_operations),
            "spare_today": max(0, remaining - still_reserved),
        }

    def spare(self) -> int:
        return self.status()["spare_today"]

    def uses_spare(self, operation: str) -> bool:
        return operation.lower() in self.spare_operations


def parse_limits(text: str) -> dict[str, int]:
    """"gemini-2.5-flash=20,gemini-flash-lite-latest=20" → {model: limit}."""
    limits: dict[str, int] = {}
    for item in (text or "").split(","):
        model, _, value = item.partition("=")
        if model.strip() and value.strip().isdigit():
            limits[model.strip()] = int(value)
    return limits

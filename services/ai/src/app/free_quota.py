"""Requests left today on a free OpenAI-style API (Groq, OpenRouter), and how many the Community bot may take.

Both keys are shared with the explainer-video script (Video3D/tripc-playbook, src/lib/llm.ts), which writes episode
scripts on Groq first and OpenRouter second. A ``reserve`` of each day's requests is therefore left untouched for it;
only what is above the reserve is spare.

What is left is taken from the provider itself whenever it says so: Groq reports the key's daily request limit and
what remains in the ``x-ratelimit-*-requests`` headers of every answer, and OpenRouter reports
``free_model_daily_requests`` on ``GET /api/v1/key``. Those numbers already include the video script's calls. Until
the provider has spoken today, the ledger counts this service's own requests against the configured limit.
"""

from __future__ import annotations

import sqlite3
import threading
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Callable

_SCHEMA = """
CREATE TABLE IF NOT EXISTS free_api_calls (
    provider TEXT NOT NULL,
    day TEXT NOT NULL,
    at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS free_api_calls_day ON free_api_calls (provider, day);
CREATE TABLE IF NOT EXISTS free_api_state (
    provider TEXT PRIMARY KEY,
    day TEXT,
    reported_limit INTEGER,
    reported_remaining INTEGER,
    reported_at TEXT,
    -- This service's calls today when the report came: the ones after it are not in the report yet.
    reported_ours INTEGER,
    closed_day TEXT,
    cooldown_until TEXT
);
"""


class FreeTierQuota:
    def __init__(self, path: str, *, provider: str, daily_limit: int, reserve: int,
                 clock: Callable[[], datetime] | None = None) -> None:
        if path != ":memory:":
            Path(path).parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self._db = sqlite3.connect(path, check_same_thread=False, isolation_level=None)
        self._db.row_factory = sqlite3.Row
        with self._lock:
            self._db.executescript(_SCHEMA)
            self._db.execute("INSERT OR IGNORE INTO free_api_state (provider) VALUES (?)", (provider,))
        self.provider = provider
        self.daily_limit = daily_limit
        self.reserve = reserve
        self._clock = clock or (lambda: datetime.now(timezone.utc))

    def day(self, at: datetime | None = None) -> str:
        # OpenRouter's free-model count resets at 00:00 UTC; Groq refills continuously, so a UTC day keeps ours simple.
        return (at or self._clock()).astimezone(timezone.utc).date().isoformat()

    def _state(self) -> sqlite3.Row:
        with self._lock:
            return self._db.execute("SELECT * FROM free_api_state WHERE provider = ?", (self.provider,)).fetchone()

    def _set(self, **values: object) -> None:
        columns = ", ".join(f"{k} = ?" for k in values)
        with self._lock:
            self._db.execute(f"UPDATE free_api_state SET {columns} WHERE provider = ?", (*values.values(), self.provider))

    # --- recording --------------------------------------------------------------------------------------------
    def record_call(self) -> None:
        now = self._clock()
        with self._lock:
            self._db.execute("INSERT INTO free_api_calls (provider, day, at) VALUES (?, ?, ?)",
                             (self.provider, self.day(now), now.isoformat()))

    def record_reported(self, limit: int | None, remaining: int | None) -> None:
        """What the provider says about the key's day, every caller included."""
        if remaining is None:
            return
        now = self._clock()
        self._set(day=self.day(now), reported_limit=limit, reported_remaining=remaining, reported_at=now.isoformat(),
                  reported_ours=self._ours())

    def record_exhausted(self) -> None:
        """A per-day 429: nothing more today, whatever the count said."""
        self._set(closed_day=self.day())

    def record_cooldown(self, seconds: float) -> None:
        """A per-minute limit (Groq allows about 8,000 tokens a minute): skip the provider until it passes."""
        until = self._clock() + timedelta(seconds=max(1.0, seconds))
        self._set(cooldown_until=until.isoformat())

    # --- reading ----------------------------------------------------------------------------------------------
    def reported_at(self) -> datetime | None:
        state = self._state()
        if not state["reported_at"] or state["day"] != self.day():
            return None
        return datetime.fromisoformat(state["reported_at"])

    def cooling_down(self) -> bool:
        until = self._state()["cooldown_until"]
        return bool(until) and datetime.fromisoformat(until) > self._clock()

    def _ours(self) -> int:
        with self._lock:
            return int(self._db.execute("SELECT count(*) FROM free_api_calls WHERE provider = ? AND day = ?",
                                        (self.provider, self.day())).fetchone()[0])

    def status(self) -> dict:
        state = self._state()
        today = self.day()
        ours = self._ours()
        reported = state["day"] == today and state["reported_remaining"] is not None
        limit = int(state["reported_limit"]) if reported and state["reported_limit"] else self.daily_limit
        if state["closed_day"] == today:
            remaining, basis = 0, "closed_by_429"
        elif reported:
            # The report already counts every call up to its moment; ours since then are not in it yet.
            remaining = max(0, int(state["reported_remaining"]) - (ours - int(state["reported_ours"] or 0)))
            basis = "reported_by_provider"
        else:
            remaining, basis = max(0, limit - ours), "counted_against_limit"
        cooling = self.cooling_down()
        return {
            "provider": self.provider,
            "day_utc": today,
            "daily_limit": limit,
            "limit_basis": "reported_by_provider" if reported and state["reported_limit"] else "configured",
            "used_by_this_service_today": ours,
            "remaining_today": remaining,
            "remaining_basis": basis,
            "reserved_for_video_scripts": self.reserve,
            "cooling_down_until": state["cooldown_until"] if cooling else None,
            "spare_today": 0 if cooling else max(0, remaining - self.reserve),
        }

    def spare(self) -> int:
        return self.status()["spare_today"]

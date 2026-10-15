"""Durable run registry for the AI service (SQLite, one service process).

The worker owns the business job; this store only guarantees that an AI run is
never "completed" from RAM alone. Request payloads are not stored: after a
restart, unfinished runs become ``failed`` + ``retryable`` and the worker resends
the same request under the same idempotency key to resume.
"""

from __future__ import annotations

import json
import sqlite3
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import UUID

from .schemas import AIResult, RunStatus


_SCHEMA = """
CREATE TABLE IF NOT EXISTS runs (
    run_id TEXT PRIMARY KEY,
    job_id TEXT NOT NULL,
    workspace_id TEXT NOT NULL,
    operation TEXT NOT NULL,
    input_version INTEGER NOT NULL,
    request_hash TEXT NOT NULL,
    status TEXT NOT NULL,
    attempt INTEGER NOT NULL DEFAULT 1,
    max_provider_calls INTEGER NOT NULL,
    retryable INTEGER NOT NULL DEFAULT 0,
    error_code TEXT,
    error_message TEXT,
    result_json TEXT,
    deadline_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    completed_at TEXT,
    UNIQUE (job_id, operation, input_version)
);
CREATE TABLE IF NOT EXISTS job_calls (
    job_id TEXT PRIMARY KEY,
    provider_calls INTEGER NOT NULL DEFAULT 0
);
"""


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class RunStore:
    def __init__(self, path: str) -> None:
        if path != ":memory:":
            Path(path).parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self._db = sqlite3.connect(path, check_same_thread=False, isolation_level=None)
        self._db.row_factory = sqlite3.Row
        with self._lock:
            self._db.execute("PRAGMA journal_mode=WAL")
            self._db.executescript(_SCHEMA)

    def close(self) -> None:
        with self._lock:
            self._db.close()

    def recover_interrupted(self) -> int:
        """Called once at process start: nothing can still be executing from a previous process."""

        now = utcnow().isoformat()
        with self._lock:
            cursor = self._db.execute(
                "UPDATE runs SET status='failed', retryable=1, error_code='RUN_INTERRUPTED', "
                "error_message='AI service restarted before the run finished; resend the same request to resume', "
                "updated_at=?, completed_at=? WHERE status IN ('queued', 'running')",
                (now, now),
            )
            return cursor.rowcount

    def find(self, job_id: UUID, operation: str, input_version: int) -> sqlite3.Row | None:
        with self._lock:
            return self._db.execute(
                "SELECT * FROM runs WHERE job_id=? AND operation=? AND input_version=?",
                (str(job_id), operation, input_version),
            ).fetchone()

    def get(self, run_id: UUID) -> sqlite3.Row | None:
        with self._lock:
            return self._db.execute("SELECT * FROM runs WHERE run_id=?", (str(run_id),)).fetchone()

    def insert(
        self,
        *,
        run_id: UUID,
        job_id: UUID,
        workspace_id: UUID,
        operation: str,
        input_version: int,
        request_hash: str,
        max_provider_calls: int,
        deadline_at: datetime,
    ) -> None:
        now = utcnow().isoformat()
        with self._lock:
            self._db.execute(
                "INSERT INTO runs (run_id, job_id, workspace_id, operation, input_version, request_hash, status, "
                "attempt, max_provider_calls, deadline_at, created_at, updated_at) "
                "VALUES (?, ?, ?, ?, ?, ?, 'queued', 1, ?, ?, ?, ?)",
                (
                    str(run_id),
                    str(job_id),
                    str(workspace_id),
                    operation,
                    input_version,
                    request_hash,
                    max_provider_calls,
                    deadline_at.isoformat(),
                    now,
                    now,
                ),
            )

    def requeue(self, run_id: UUID) -> None:
        with self._lock:
            self._db.execute(
                "UPDATE runs SET status='queued', attempt=attempt+1, retryable=0, error_code=NULL, "
                "error_message=NULL, completed_at=NULL, updated_at=? WHERE run_id=?",
                (utcnow().isoformat(), str(run_id)),
            )

    def mark_running(self, run_id: UUID) -> None:
        self._set(run_id, status="running")

    def complete(self, run_id: UUID, result: AIResult) -> None:
        now = utcnow().isoformat()
        self._set(
            run_id,
            status="completed",
            retryable=0,
            result_json=result.model_dump_json(),
            completed_at=now,
        )

    def fail(self, run_id: UUID, code: str, message: str, *, retryable: bool) -> None:
        self._set(
            run_id,
            status="failed",
            retryable=1 if retryable else 0,
            error_code=code,
            error_message=message,
            completed_at=utcnow().isoformat(),
        )

    def set_not_retryable(self, run_id: UUID) -> None:
        self._set(run_id, retryable=0)

    def _set(self, run_id: UUID, **fields: Any) -> None:
        fields["updated_at"] = utcnow().isoformat()
        assignments = ", ".join(f"{name}=?" for name in fields)
        with self._lock:
            self._db.execute(f"UPDATE runs SET {assignments} WHERE run_id=?", (*fields.values(), str(run_id)))

    def try_consume_call(self, job_id: str, cap: int) -> bool:
        with self._lock:
            self._db.execute("INSERT OR IGNORE INTO job_calls (job_id, provider_calls) VALUES (?, 0)", (job_id,))
            cursor = self._db.execute(
                "UPDATE job_calls SET provider_calls = provider_calls + 1 WHERE job_id=? AND provider_calls < ?",
                (job_id, cap),
            )
            return cursor.rowcount == 1

    def provider_calls(self, job_id: str) -> int:
        with self._lock:
            row = self._db.execute("SELECT provider_calls FROM job_calls WHERE job_id=?", (job_id,)).fetchone()
        return int(row["provider_calls"]) if row else 0

    def to_status(self, row: sqlite3.Row) -> RunStatus:
        result = AIResult.model_validate(json.loads(row["result_json"])) if row["result_json"] else None
        return RunStatus(
            run_id=row["run_id"],
            job_id=row["job_id"],
            workspace_id=row["workspace_id"],
            operation=row["operation"],
            input_version=row["input_version"],
            status=row["status"],
            attempt=row["attempt"],
            provider_calls=self.provider_calls(row["job_id"]),
            max_provider_calls=row["max_provider_calls"],
            retryable=bool(row["retryable"]),
            result=result,
            error_code=row["error_code"],
            error_message=row["error_message"],
            deadline_at=datetime.fromisoformat(row["deadline_at"]),
            created_at=datetime.fromisoformat(row["created_at"]),
            completed_at=datetime.fromisoformat(row["completed_at"]) if row["completed_at"] else None,
        )

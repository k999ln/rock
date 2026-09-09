from __future__ import annotations

import json
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path
from typing import Any


FINAL_STATUSES = {"succeeded", "failed", "cancelled"}
ALLOWED_TRANSITIONS = {
    "pending": {"running", "cancelled"},
    "running": {"awaiting_confirmation", "succeeded", "failed", "cancelled"},
    "awaiting_confirmation": {"running", "failed", "cancelled"},
    "succeeded": set(),
    "failed": set(),
    "cancelled": set(),
}


class IdempotencyConflict(ValueError):
    pass


def _now() -> str:
    return datetime.now(UTC).isoformat()


def _decode_job(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "device_id": row["device_id"],
        "tool_id": row["tool_id"],
        "idempotency_key": row["idempotency_key"],
        "input": json.loads(row["input_json"]),
        "status": row["status"],
        "result": json.loads(row["result_json"]) if row["result_json"] else None,
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


class Store:
    def __init__(self, path: str | Path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._initialize()

    @contextmanager
    def _connect(self):
        connection = sqlite3.connect(self.path, timeout=10)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute("PRAGMA busy_timeout = 10000")
        try:
            with connection:
                yield connection
        finally:
            connection.close()

    def _initialize(self) -> None:
        with self._connect() as connection:
            connection.execute("PRAGMA journal_mode = WAL")
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS events (
                    id TEXT PRIMARY KEY,
                    device_id TEXT NOT NULL,
                    type TEXT NOT NULL,
                    payload_json TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS jobs (
                    id TEXT PRIMARY KEY,
                    device_id TEXT NOT NULL,
                    tool_id TEXT NOT NULL,
                    idempotency_key TEXT NOT NULL UNIQUE,
                    input_json TEXT NOT NULL,
                    status TEXT NOT NULL,
                    result_json TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS jobs_device_created
                    ON jobs(device_id, created_at DESC);
                """
            )

    def add_event(self, device_id: str, event_type: str, payload: dict[str, Any]) -> str:
        event_id = str(uuid.uuid4())
        with self._connect() as connection:
            connection.execute(
                "INSERT INTO events(id, device_id, type, payload_json, created_at) VALUES (?, ?, ?, ?, ?)",
                (event_id, device_id, event_type, json.dumps(payload, separators=(",", ":")), _now()),
            )
        return event_id

    def create_job(
        self,
        device_id: str,
        tool_id: str,
        idempotency_key: str,
        job_input: dict[str, Any],
    ) -> tuple[dict[str, Any], bool]:
        timestamp = _now()
        job_id = str(uuid.uuid4())
        encoded_input = json.dumps(job_input, separators=(",", ":"), sort_keys=True)
        with self._connect() as connection:
            try:
                connection.execute(
                    """
                    INSERT INTO jobs(
                        id, device_id, tool_id, idempotency_key, input_json,
                        status, result_json, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, 'pending', NULL, ?, ?)
                    """,
                    (job_id, device_id, tool_id, idempotency_key, encoded_input, timestamp, timestamp),
                )
                created = True
            except sqlite3.IntegrityError:
                created = False
            row = connection.execute(
                "SELECT * FROM jobs WHERE idempotency_key = ?", (idempotency_key,)
            ).fetchone()
        if row is None:
            raise RuntimeError("job was not persisted")
        if not created and (
            row["device_id"] != device_id
            or row["tool_id"] != tool_id
            or row["input_json"] != encoded_input
        ):
            raise IdempotencyConflict("idempotency key was already used for a different request")
        return _decode_job(row), created

    def list_jobs(self, device_id: str, limit: int = 100) -> list[dict[str, Any]]:
        with self._connect() as connection:
            rows = connection.execute(
                "SELECT * FROM jobs WHERE device_id = ? ORDER BY created_at DESC LIMIT ?",
                (device_id, min(max(limit, 1), 100)),
            ).fetchall()
        return [_decode_job(row) for row in rows]

    def get_job(self, job_id: str) -> dict[str, Any] | None:
        with self._connect() as connection:
            row = connection.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
        return _decode_job(row) if row else None

    def update_job(self, job_id: str, status: str, result: dict[str, Any] | None) -> dict[str, Any] | None:
        with self._connect() as connection:
            row = connection.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
            if row is None:
                return None
            current_status = row["status"]
            current_result = json.loads(row["result_json"]) if row["result_json"] else None
            if status == current_status:
                if result != current_result:
                    raise ValueError(f"cannot replace result while job remains {status}")
                return _decode_job(row)
            if status not in ALLOWED_TRANSITIONS[current_status]:
                raise ValueError(f"cannot transition job from {current_status} to {status}")
            connection.execute(
                "UPDATE jobs SET status = ?, result_json = ?, updated_at = ? WHERE id = ?",
                (
                    status,
                    json.dumps(result, separators=(",", ":")) if result is not None else None,
                    _now(),
                    job_id,
                ),
            )
            updated = connection.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
        return _decode_job(updated)

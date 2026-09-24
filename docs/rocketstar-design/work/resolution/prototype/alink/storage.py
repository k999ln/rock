"""Durable inbox for authenticated notifications, using only Python's stdlib.

This module does not authenticate a sender and never executes a notification as
an appliance command or payment. The transport must authenticate records first.
ACK means durable inbox admission (or expiry), not that a person read a message.

Limits apply to UTF-8 payloads, live message count and a conservative logical
record-byte budget including metadata/ACK allowance. SQLite page/WAL overhead is
not part of that budget. Expired bodies are removed by every ingest/read/prune;
deduplication tombstones and pending ACKs expire 30 days after first reception.
Reads and maintenance should continue during idle periods to enforce retention.
"""

from __future__ import annotations

from contextlib import contextmanager
import hashlib
import json
import math
import sqlite3
import threading
import time
from typing import Any, Iterable, Iterator


MAX_PAYLOAD = 4096
MAX_LIFETIME = 7 * 24 * 60 * 60
TOMBSTONE_LIFETIME = 30 * 24 * 60 * 60
MAX_FUTURE_SKEW = 300
_KEYS = frozenset(("id", "created_at", "expires_at", "payload"))


class CapacityError(ValueError):
    """A new notification cannot be admitted without exceeding an inbox limit."""


def _finite_number(value: Any, name: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"{name} must be a finite Unix timestamp")
    try:
        result = float(value)
    except (OverflowError, ValueError):
        raise ValueError(f"{name} must be a finite Unix timestamp") from None
    if not math.isfinite(result):
        raise ValueError(f"{name} must be a finite Unix timestamp")
    return result


def _utf8(value: Any, name: str) -> bytes:
    if not isinstance(value, str):
        raise ValueError(f"{name} must be a string")
    try:
        return value.encode("utf-8")
    except UnicodeEncodeError:
        raise ValueError(f"{name} must be valid UTF-8") from None


def _validate_record(record: Any, max_payload: int = MAX_PAYLOAD) -> bytes:
    if not isinstance(record, dict) or set(record) != _KEYS:
        raise ValueError("record must contain exactly id, created_at, expires_at, payload")
    _utf8(record["id"], "id")
    if not 1 <= len(record["id"]) <= 128:
        raise ValueError("id must contain 1 to 128 characters")
    created = _finite_number(record["created_at"], "created_at")
    expires = _finite_number(record["expires_at"], "expires_at")
    if expires <= created or expires - created > MAX_LIFETIME:
        raise ValueError("expires_at must be after created_at and at most 7 days later")
    if len(_utf8(record["payload"], "payload")) > max_payload:
        raise ValueError("payload exceeds the UTF-8 byte limit")
    return json.dumps(
        record, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False
    ).encode("utf-8")


def record_digest(record: dict[str, Any]) -> str:
    """SHA-256 of the validated four-key canonical JSON record, in hex.

    JSON number spellings remain significant: 1 and 1.0 have different digests.
    A transport must preserve the original record when it retransmits it.
    """
    if not isinstance(record, dict):
        raise ValueError("record must be a dictionary")
    return hashlib.sha256(_validate_record(dict(record))).hexdigest()


class InboxStore:
    def __init__(
        self,
        path: str,
        max_messages: int = 1000,
        max_bytes: int = 10 * 1024 * 1024,
        max_payload: int = MAX_PAYLOAD,
    ) -> None:
        for name, value in (("max_messages", max_messages), ("max_bytes", max_bytes),
                            ("max_payload", max_payload)):
            if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
                raise ValueError(f"{name} must be a positive integer")
        if max_payload > MAX_PAYLOAD:
            raise ValueError("max_payload may not exceed 4096 bytes")
        self.max_messages = max_messages
        self.max_bytes = max_bytes
        self.max_payload = max_payload
        self._lock = threading.RLock()
        self._connection = sqlite3.connect(path, timeout=10, isolation_level=None,
                                           check_same_thread=False)
        self._connection.row_factory = sqlite3.Row
        self._connection.execute("PRAGMA busy_timeout = 10000")
        self._connection.execute("PRAGMA journal_mode = WAL")
        self._connection.execute("PRAGMA synchronous = FULL")
        self._connection.execute("PRAGMA secure_delete = ON")
        self._connection.execute("""
            CREATE TABLE IF NOT EXISTS inbox (
                id TEXT PRIMARY KEY,
                digest TEXT NOT NULL,
                created_at REAL NOT NULL,
                expires_at REAL NOT NULL,
                payload TEXT,
                source TEXT NOT NULL,
                received_at REAL NOT NULL,
                retain_until REAL NOT NULL,
                status TEXT NOT NULL CHECK (status IN ('stored', 'expired')),
                ack_pending INTEGER NOT NULL CHECK (ack_pending IN (0, 1)),
                logical_bytes INTEGER NOT NULL CHECK (logical_bytes > 0)
            )
        """)
        self._connection.execute("CREATE INDEX IF NOT EXISTS inbox_retention ON inbox(retain_until)")
        self._connection.execute("CREATE INDEX IF NOT EXISTS inbox_expiry ON inbox(expires_at)")
        self._connection.execute("""
            CREATE TABLE IF NOT EXISTS inbox_meta (
                key TEXT PRIMARY KEY,
                value REAL NOT NULL
            )
        """)

    @contextmanager
    def _transaction(self) -> Iterator[sqlite3.Connection]:
        with self._lock:
            connection = self._connection
            connection.execute("BEGIN IMMEDIATE")
            try:
                yield connection
                connection.commit()
            except BaseException:
                connection.rollback()
                raise

    @staticmethod
    def _logical_size(record: dict[str, Any], source: str, *, body: bool) -> int:
        counted = dict(record)
        if not body:
            counted["payload"] = ""
        serialized = json.dumps(counted, ensure_ascii=False, sort_keys=True,
                                separators=(",", ":"), allow_nan=False).encode("utf-8")
        # SHA-256 plus timestamp/status/ACK/row bookkeeping allowance.
        return len(serialized) + len(source.encode("utf-8")) + 64 + 128

    def _prune(self, connection: sqlite3.Connection, now: float) -> dict[str, int]:
        removed = connection.execute("DELETE FROM inbox WHERE retain_until <= ?", (now,)).rowcount
        expired = connection.execute(
            "SELECT * FROM inbox WHERE payload IS NOT NULL AND expires_at <= ?", (now,)
        ).fetchall()
        for row in expired:
            # Preserve original JSON timestamp spellings in the accounting:
            # SQLite REAL columns may read an original integer back as a float.
            # Only remove the exact serialized payload bytes beyond empty "".
            payload_bytes = len(json.dumps(row["payload"], ensure_ascii=False).encode("utf-8")) - 2
            new_size = row["logical_bytes"] - payload_bytes
            connection.execute(
                "UPDATE inbox SET payload = NULL, status = 'expired', logical_bytes = ? WHERE id = ?",
                (new_size, row["id"]),
            )
        return {"expired_bodies": len(expired), "removed_tombstones": removed}

    def prune(self, now: float) -> dict[str, int]:
        """Delete expired bodies and forget records/ACKs after the 30-day window.

        Expiring a previously acknowledged record does not create an unsolicited
        ACK. A matching retransmission recreates the pending ACK when necessary.
        Bytes in filesystem snapshots or old WAL pages are not securely erased.
        """
        selected_now = _finite_number(now, "now")
        with self._transaction() as connection:
            return self._prune(connection, selected_now)

    def ingest(self, record: dict[str, Any], *, now: float, source: str) -> str:
        if not isinstance(record, dict):
            raise ValueError("record must be a dictionary")
        # All validated values are immutable primitives; retain a stable snapshot
        # if another thread subsequently edits the caller's dictionary.
        record = dict(record)
        canonical = _validate_record(record, self.max_payload)
        selected_now = _finite_number(now, "now")
        if record["created_at"] > selected_now + MAX_FUTURE_SKEW:
            raise ValueError("created_at is more than 300 seconds in the future")
        if not 1 <= len(_utf8(source, "source")) <= 256:
            raise ValueError("source must contain 1 to 256 UTF-8 bytes")
        digest = hashlib.sha256(canonical).hexdigest()
        status = "expired" if record["expires_at"] <= selected_now else "stored"
        with self._transaction() as connection:
            self._prune(connection, selected_now)
            previous = connection.execute("SELECT digest FROM inbox WHERE id = ?", (record["id"],)).fetchone()
            if previous is not None:
                if previous["digest"] != digest:
                    raise ValueError("id was already received with different content or timestamps")
                connection.execute("UPDATE inbox SET ack_pending = 1 WHERE id = ?", (record["id"],))
                return "duplicate"
            count, used = connection.execute(
                "SELECT COUNT(CASE WHEN payload IS NOT NULL THEN 1 END), COALESCE(SUM(logical_bytes), 0) FROM inbox"
            ).fetchone()
            if status == "stored" and count >= self.max_messages:
                raise CapacityError("live inbox message limit reached")
            size = self._logical_size(record, source, body=status == "stored")
            if used + size > self.max_bytes:
                raise CapacityError("inbox byte limit reached, including retained metadata")
            connection.execute("""
                INSERT INTO inbox
                (id, digest, created_at, expires_at, payload, source, received_at,
                 retain_until, status, ack_pending, logical_bytes)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
            """, (record["id"], digest, record["created_at"], record["expires_at"],
                  record["payload"] if status == "stored" else None, source, selected_now,
                  selected_now + TOMBSTONE_LIFETIME, status, size))
            if status == "stored":
                connection.execute("""
                    INSERT INTO inbox_meta (key, value) VALUES ('last_received_at', ?)
                    ON CONFLICT(key) DO UPDATE SET value = MAX(inbox_meta.value, excluded.value)
                """, (selected_now,))
        return status

    def last_received_at(self) -> float | None:
        """Latest successful new-message admission time, persisted across prune.

        Duplicate/expired input does not advance this value. A fresh SELECT sees
        commits made by another process or radio-worker connection to this DB.
        """
        with self._lock:
            row = self._connection.execute(
                "SELECT value FROM inbox_meta WHERE key = 'last_received_at'"
            ).fetchone()
            return None if row is None else float(row["value"])

    def pending_acks(self, *, now: float | None = None) -> list[dict[str, Any]]:
        selected_now = _finite_number(time.time() if now is None else now, "now")
        with self._transaction() as connection:
            self._prune(connection, selected_now)
            return [dict(row) for row in connection.execute(
                "SELECT id, digest, status FROM inbox WHERE ack_pending = 1 ORDER BY received_at, id"
            ).fetchall()]

    def acknowledge(self, ids: Iterable[str]) -> None:
        """Mark ACKs confirmed by the transport; keep inbox/deduplication rows.

        The caller must first obtain server acknowledgement of the ACK batch.
        A lost confirmation is safe: retransmitting an ACK is idempotent.
        """
        if isinstance(ids, (str, bytes)):
            raise ValueError("ids must be an iterable of strings, not a string")
        selected = list(ids)
        if any(not isinstance(identifier, str) or not 1 <= len(identifier) <= 128 for identifier in selected):
            raise ValueError("each acknowledged id must contain 1 to 128 characters")
        with self._transaction() as connection:
            connection.executemany("UPDATE inbox SET ack_pending = 0 WHERE id = ?",
                                   ((identifier,) for identifier in selected))

    def messages(self, *, now: float | None = None) -> list[dict[str, Any]]:
        selected_now = _finite_number(time.time() if now is None else now, "now")
        with self._transaction() as connection:
            self._prune(connection, selected_now)
            return [dict(row) for row in connection.execute("""
                SELECT id, digest, created_at, expires_at, payload, source, received_at
                FROM inbox WHERE payload IS NOT NULL ORDER BY received_at, id
            """).fetchall()]

    def close(self) -> None:
        with self._lock:
            self._connection.close()

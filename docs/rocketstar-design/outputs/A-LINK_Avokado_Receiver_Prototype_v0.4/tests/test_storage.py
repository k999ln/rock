import concurrent.futures
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile
import unittest

from alink.storage import CapacityError, InboxStore, record_digest, TOMBSTONE_LIFETIME


NOW = 1_800_000_000


def record(identifier="n-1", payload="衛星から受信", created=NOW, expires=NOW + 3600):
    return {"id": identifier, "created_at": created, "expires_at": expires, "payload": payload}


class InboxStoreTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = str(Path(self.temp.name) / "inbox.sqlite")
        self.store = InboxStore(self.path)
        self.addCleanup(lambda: self.store.close())

    def test_canonical_digest_and_strict_fields(self):
        item = record()
        expected = hashlib.sha256(json.dumps(item, ensure_ascii=False, sort_keys=True,
                                             separators=(",", ":")).encode("utf-8")).hexdigest()
        self.assertEqual(record_digest(item), expected)
        self.assertEqual(record_digest(dict(reversed(list(item.items())))), expected)
        with self.assertRaises(ValueError):
            record_digest(dict(item, extra="not signed"))

    def test_receive_reopen_and_ack_redelivery(self):
        item = record()
        self.assertEqual(self.store.ingest(item, now=NOW, source="satellite"), "stored")
        self.assertEqual(self.store.messages(now=NOW)[0]["source"], "satellite")
        self.store.close()
        self.store = InboxStore(self.path)
        self.assertEqual(len(self.store.messages(now=NOW)), 1)
        self.assertEqual(self.store.pending_acks(now=NOW),
                         [{"id": item["id"], "digest": record_digest(item), "status": "stored"}])
        self.store.acknowledge([item["id"]])
        self.assertEqual(self.store.pending_acks(now=NOW), [])
        self.assertEqual(self.store.ingest(item, now=NOW + 1, source="cellular"), "duplicate")
        self.assertEqual(len(self.store.messages(now=NOW + 1)), 1)
        self.assertEqual(len(self.store.pending_acks(now=NOW + 1)), 1)
        self.assertEqual(self.store.messages(now=NOW + 1)[0]["source"], "satellite")

    def test_expired_input_retains_ack_without_body(self):
        item = record(created=NOW - 100, expires=NOW)
        self.assertEqual(self.store.ingest(item, now=NOW, source="wifi"), "expired")
        self.assertEqual(self.store.messages(now=NOW), [])
        self.assertEqual(self.store.pending_acks(now=NOW)[0]["status"], "expired")
        self.assertIsNone(self.store._connection.execute("SELECT payload FROM inbox").fetchone()[0])
        self.assertEqual(self.store.ingest(item, now=NOW + 1, source="wifi"), "duplicate")

    def test_expiry_reclaims_live_capacity_and_ack_status(self):
        self.store.close()
        self.store = InboxStore(self.path, max_messages=1)
        first = record(expires=NOW + 5)
        self.store.ingest(first, now=NOW, source="wifi")
        with self.assertRaises(CapacityError):
            self.store.ingest(record("n-2"), now=NOW + 1, source="wifi")
        self.assertEqual(self.store.ingest(record("n-2"), now=NOW + 6, source="cellular"), "stored")
        self.assertEqual([item["id"] for item in self.store.messages(now=NOW + 6)], ["n-2"])
        self.assertEqual({ack["id"]: ack["status"] for ack in self.store.pending_acks(now=NOW + 6)},
                         {"n-1": "expired", "n-2": "stored"})

    def test_30_day_tombstones_and_pending_acks_are_removed(self):
        item = record(expires=NOW + 1)
        self.store.ingest(item, now=NOW, source="wifi")
        self.assertEqual(self.store.prune(NOW + 1)["expired_bodies"], 1)
        self.assertEqual(self.store.prune(NOW + TOMBSTONE_LIFETIME - 1)["removed_tombstones"], 0)
        self.assertEqual(self.store.prune(NOW + TOMBSTONE_LIFETIME)["removed_tombstones"], 1)
        self.assertEqual(self.store.pending_acks(now=NOW + TOMBSTONE_LIFETIME), [])

    def test_conflicting_content_or_expiry_does_not_change_existing_record(self):
        original = record()
        self.store.ingest(original, now=NOW, source="wifi")
        self.store.acknowledge([original["id"]])
        for changed in (dict(original, payload="違う本文"), dict(original, expires_at=NOW + 7200)):
            with self.subTest(changed=changed), self.assertRaises(ValueError):
                self.store.ingest(changed, now=NOW, source="cellular")
        self.assertEqual(self.store.messages(now=NOW)[0]["payload"], original["payload"])
        self.assertEqual(self.store.pending_acks(now=NOW), [])

    def test_payload_limit_counts_utf8_bytes(self):
        self.assertEqual(self.store.ingest(record(payload="a" * 4096), now=NOW, source="wifi"), "stored")
        with self.assertRaises(ValueError):
            self.store.ingest(record("too-big", "あ" * 1366), now=NOW, source="wifi")

    def test_byte_budget_covers_metadata_and_tombstones(self):
        self.store.close()
        self.store = InboxStore(self.path, max_bytes=400)
        self.store.ingest(record(payload=""), now=NOW, source="wifi")
        with self.assertRaises(CapacityError):
            self.store.ingest(record("n-2", ""), now=NOW, source="wifi")
        self.store.prune(NOW + 3600)
        with self.assertRaises(CapacityError):
            self.store.ingest(record("n-2", "", created=NOW + 3600, expires=NOW + 7200),
                              now=NOW + 3600, source="wifi")
        self.assertEqual(len(self.store.pending_acks(now=NOW + 3600)), 1)

    def test_invalid_timestamps_and_future_creation(self):
        invalid = [dict(record(), created_at=float("nan")), dict(record(), expires_at=float("inf")),
                   dict(record(), created_at=True), record(expires=NOW), record(expires=NOW + 604801),
                   record(created=NOW + 301, expires=NOW + 3600), dict(record(), payload="\ud800")]
        for item in invalid:
            with self.subTest(item=item), self.assertRaises(ValueError):
                self.store.ingest(item, now=NOW, source="wifi")
        with self.assertRaises(ValueError):
            self.store.ingest(record(), now=float("nan"), source="wifi")
        self.assertEqual(self.store.messages(now=NOW), [])

    def test_sql_failure_rolls_back_message_and_pending_ack(self):
        self.store._connection.execute("""
            CREATE TRIGGER reject_admission BEFORE INSERT ON inbox
            BEGIN SELECT RAISE(ABORT, 'simulated disk/SQL failure'); END
        """)
        with self.assertRaises(sqlite3.DatabaseError):
            self.store.ingest(record(), now=NOW, source="wifi")
        self.assertEqual(self.store.messages(now=NOW), [])
        self.assertEqual(self.store.pending_acks(now=NOW), [])
        self.store._connection.execute("DROP TRIGGER reject_admission")
        self.assertEqual(self.store.ingest(record(), now=NOW, source="wifi"), "stored")

    def test_conflict_rolls_back_expiry_maintenance_too(self):
        original = record(expires=NOW + 1)
        self.store.ingest(original, now=NOW, source="wifi")
        with self.assertRaises(ValueError):
            self.store.ingest(dict(original, payload="conflict"), now=NOW + 2, source="wifi")
        self.assertIsNotNone(self.store._connection.execute("SELECT payload FROM inbox").fetchone()[0])
        self.assertEqual(self.store.messages(now=NOW + 2), [])

    def test_concurrent_connections_deduplicate(self):
        def receive(_):
            local = InboxStore(self.path)
            try:
                return local.ingest(record(), now=NOW, source="satellite")
            finally:
                local.close()
        with concurrent.futures.ThreadPoolExecutor(max_workers=6) as executor:
            outcomes = list(executor.map(receive, range(12)))
        self.assertEqual(outcomes.count("stored"), 1)
        self.assertEqual(outcomes.count("duplicate"), 11)
        self.assertEqual(len(self.store.messages(now=NOW)), 1)
        self.assertEqual(len(self.store.pending_acks(now=NOW)), 1)

    def test_concurrent_connections_cannot_overfill_capacity(self):
        def receive(index):
            local = InboxStore(self.path, max_messages=1)
            try:
                return local.ingest(record(f"n-{index}"), now=NOW, source="satellite")
            except CapacityError:
                return "full"
            finally:
                local.close()
        with concurrent.futures.ThreadPoolExecutor(max_workers=6) as executor:
            outcomes = list(executor.map(receive, range(12)))
        self.assertEqual(outcomes.count("stored"), 1)
        self.assertEqual(outcomes.count("full"), 11)
        self.assertEqual(len(self.store.messages(now=NOW)), 1)

    def test_expiry_of_empty_payload_never_increases_accounted_bytes(self):
        self.store.ingest(record(payload="", expires=NOW + 1), now=NOW, source="wifi")
        before = self.store._connection.execute("SELECT logical_bytes FROM inbox").fetchone()[0]
        self.store.prune(NOW + 1)
        after = self.store._connection.execute("SELECT logical_bytes FROM inbox").fetchone()[0]
        self.assertEqual(after, before)

    def test_last_received_survives_reopen_expiry_and_tombstone_pruning(self):
        self.assertIsNone(self.store.last_received_at())
        self.store.ingest(record(expires=NOW + 1), now=NOW, source="wifi")
        self.assertEqual(self.store.last_received_at(), float(NOW))
        self.store.close()
        self.store = InboxStore(self.path)
        self.assertEqual(self.store.last_received_at(), float(NOW))
        self.store.prune(NOW + 1)
        self.assertEqual(self.store.last_received_at(), float(NOW))
        self.store.prune(NOW + TOMBSTONE_LIFETIME)
        self.assertEqual(self.store.last_received_at(), float(NOW))

    def test_last_received_does_not_advance_for_duplicate_or_expired_records(self):
        first = record()
        self.store.ingest(first, now=NOW, source="wifi")
        self.store.ingest(first, now=NOW + 10, source="satellite")
        self.store.ingest(record("expired", created=NOW - 20, expires=NOW - 10),
                          now=NOW + 20, source="satellite")
        self.assertEqual(self.store.last_received_at(), float(NOW))
        self.store.ingest(record("earlier", created=NOW - 100), now=NOW - 10, source="wifi")
        self.assertEqual(self.store.last_received_at(), float(NOW))

    def test_last_received_reads_fresh_other_connection_commits(self):
        other = InboxStore(self.path)
        try:
            self.assertIsNone(self.store.last_received_at())
            other.ingest(record(), now=NOW, source="satellite")
            self.assertEqual(self.store.last_received_at(), float(NOW))
            other.ingest(record("later"), now=NOW + 10, source="satellite")
            self.assertEqual(self.store.last_received_at(), float(NOW + 10))
        finally:
            other.close()

    def test_last_received_metadata_and_inbox_commit_atomically(self):
        self.store._connection.execute("""
            CREATE TRIGGER reject_watermark BEFORE INSERT ON inbox_meta
            BEGIN SELECT RAISE(ABORT, 'simulated metadata failure'); END
        """)
        with self.assertRaises(sqlite3.DatabaseError):
            self.store.ingest(record(), now=NOW, source="wifi")
        self.assertEqual(self.store.messages(now=NOW), [])
        self.assertEqual(self.store.pending_acks(now=NOW), [])
        self.assertIsNone(self.store.last_received_at())

    def test_commit_survives_process_exit_without_close(self):
        child_path = str(Path(self.temp.name) / "crash.sqlite")
        script = """
import json, os, sys
from alink.storage import InboxStore
store = InboxStore(sys.argv[1])
store.ingest(json.loads(sys.argv[2]), now=int(sys.argv[3]), source='satellite')
os._exit(23)
"""
        root = str(Path(__file__).resolve().parents[1])
        environment = dict(os.environ, PYTHONPATH=root)
        result = subprocess.run([sys.executable, "-c", script, child_path, json.dumps(record()), str(NOW)],
                                env=environment, capture_output=True, text=True, timeout=20)
        self.assertEqual(result.returncode, 23, result.stderr)
        recovered = InboxStore(child_path)
        try:
            self.assertEqual(len(recovered.messages(now=NOW)), 1)
            self.assertEqual(len(recovered.pending_acks(now=NOW)), 1)
        finally:
            recovered.close()


if __name__ == "__main__":
    unittest.main()

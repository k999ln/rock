from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
import sqlite3
import tempfile
import threading
import unittest
from pathlib import Path

from blackberryrock.storage import IdempotencyConflict, Store


class StoreTest(unittest.TestCase):
    def setUp(self) -> None:
        self.directory = tempfile.TemporaryDirectory()
        self.store = Store(Path(self.directory.name) / "test.db")

    def tearDown(self) -> None:
        self.directory.cleanup()

    def test_job_idempotency_and_transitions(self) -> None:
        first, created = self.store.create_job("device-1", "org.example.tool", "same-key", {"x": 1})
        second, created_again = self.store.create_job("device-1", "org.example.tool", "same-key", {"x": 1})

        self.assertTrue(created)
        self.assertFalse(created_again)
        self.assertEqual(first["id"], second["id"])
        self.assertEqual(second["input"], {"x": 1})

        running = self.store.update_job(first["id"], "running", None)
        succeeded = self.store.update_job(first["id"], "succeeded", {"ok": True})
        self.assertEqual(running["status"], "running")
        self.assertEqual(succeeded["result"], {"ok": True})

        with self.assertRaises(ValueError):
            self.store.update_job(first["id"], "running", None)

    def test_idempotency_key_cannot_be_reused_for_different_input(self) -> None:
        self.store.create_job("device-1", "org.example.tool", "same-key", {"x": 1})
        with self.assertRaises(IdempotencyConflict):
            self.store.create_job("device-1", "org.example.tool", "same-key", {"x": 2})

    def concurrent_updates(self, first_update, second_update):
        """Make independent receiver calls read the same version before either writes."""
        job, _ = self.store.create_job("device-1", "org.example.tool", "race", {"x": 1})
        self.store.update_job(job["id"], "running", None)
        ready = threading.Barrier(2)

        class SnapshotCursor:
            def __init__(self, cursor):
                self.cursor = cursor

            def fetchone(self):
                row = self.cursor.fetchone()
                ready.wait(timeout=5)
                return row

        class SnapshotConnection(sqlite3.Connection):
            observed = False

            def execute(self, sql, parameters=()):
                cursor = super().execute(sql, parameters)
                if not self.observed and sql == "SELECT * FROM jobs WHERE id = ?":
                    self.observed = True
                    return SnapshotCursor(cursor)
                return cursor

        class ConcurrentStore(Store):
            @contextmanager
            def _connect(self):
                connection = sqlite3.connect(self.path, timeout=5, factory=SnapshotConnection)
                connection.row_factory = sqlite3.Row
                try:
                    with connection:
                        yield connection
                finally:
                    connection.close()

        contenders = [ConcurrentStore(self.store.path), ConcurrentStore(self.store.path)]

        def apply(store, update):
            try:
                return store.update_job(job["id"], *update)
            except ValueError as conflict:
                return conflict

        with ThreadPoolExecutor(max_workers=2) as pool:
            calls = [pool.submit(apply, store, update)
                     for store, update in zip(contenders, [first_update, second_update])]
            outcomes = [call.result(timeout=10) for call in calls]
        return job["id"], outcomes

    def test_competing_terminal_updates_do_not_overwrite_the_winner(self) -> None:
        job_id, outcomes = self.concurrent_updates(
            ("succeeded", {"artifact": "saved"}), ("cancelled", None))
        accepted = [value for value in outcomes if isinstance(value, dict)]
        rejected = [value for value in outcomes if isinstance(value, ValueError)]
        self.assertEqual(len(accepted), 1, "two terminal transitions must not both commit")
        self.assertEqual(len(rejected), 1)
        self.assertEqual(self.store.get_job(job_id), accepted[0])
        self.assertEqual(Store(self.store.path).get_job(job_id), accepted[0])

    def test_competing_success_results_do_not_replace_the_saved_artifact(self) -> None:
        job_id, outcomes = self.concurrent_updates(
            ("succeeded", {"artifact": "first"}), ("succeeded", {"artifact": "second"}))
        accepted = [value for value in outcomes if isinstance(value, dict)]
        self.assertEqual(len(accepted), 1, "a stale result must not replace a saved artifact")
        self.assertEqual(self.store.get_job(job_id), accepted[0])

    def test_duplicate_terminal_callbacks_remain_idempotent(self) -> None:
        job_id, outcomes = self.concurrent_updates(
            ("succeeded", {"artifact": "saved"}), ("succeeded", {"artifact": "saved"}))
        self.assertTrue(all(isinstance(value, dict) for value in outcomes))
        self.assertEqual(outcomes[0], outcomes[1])
        self.assertEqual(self.store.get_job(job_id), outcomes[0])

    def test_event_is_persisted(self) -> None:
        event_id = self.store.add_event("device-1", "device.connected", {"transport": "usb"})
        self.assertTrue(event_id)

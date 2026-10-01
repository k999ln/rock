import tempfile
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

    def test_event_is_persisted(self) -> None:
        event_id = self.store.add_event("device-1", "device.connected", {"transport": "usb"})
        self.assertTrue(event_id)

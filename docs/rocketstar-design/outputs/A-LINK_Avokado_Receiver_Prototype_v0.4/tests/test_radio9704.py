import tempfile
import threading
import time
import unittest
from pathlib import Path
from unittest.mock import patch

from alink.protocol import Codec
from alink.quota import AttemptBudget
from alink.radio9704 import Radio9704
from alink.storage import InboxStore


class FakeSDK:
    def __init__(self):
        self.heads = []
        self.deleted = []
        self.sent = []
        self.enqueues_accept = True
        self.on_delete = lambda: None

    def begin(self, port): return 1
    def end(self): return 1
    def poll(self): pass
    def receive_lock_async(self): pass
    def send_lock_async(self): pass
    def set_mo_message_complete_callback(self, fn): self.callback = fn
    def receive_message_async(self): return self.heads[0] if self.heads else None
    def acknowledge_receive_head_async(self):
        self.on_delete()
        self.deleted.append(self.heads.pop(0))
        return 1
    def send_message_async(self, raw, *, topic):
        if self.enqueues_accept:
            self.sent.append((raw, topic))
            return 1
        return 0


class RadioTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.store = InboxStore(str(Path(self.tmp.name) / "inbox.db"))
        self.codec = Codec("hub-test", bytes(range(32)))
        self.sdk = FakeSDK()
        self.clock = 0.0
        self.radio = Radio9704(self.store, self.codec, "/fake", topic=244, sdk=self.sdk,
                              monotonic=lambda: self.clock, wall_clock=lambda: 1000.0)
        self.radio.start()

    def tearDown(self):
        self.radio.close()
        self.store.close()
        self.tmp.cleanup()

    def record(self, identifier="one"):
        return {"id": identifier, "created_at": 999.0, "expires_at": 2000.0, "payload": "通知"}

    def tick_until(self, predicate, timeout=2):
        end = time.monotonic() + timeout
        while time.monotonic() < end:
            self.radio.tick()
            if predicate(): return
            time.sleep(0.002)
        self.fail("worker did not reach expected state")

    def test_commit_precedes_native_head_delete(self):
        observed = []
        self.sdk.on_delete = lambda: observed.append(self.store.messages(now=1000.0)[0]["id"])
        self.sdk.heads.append(self.codec.seal({"records": [self.record()]}, "delivery"))
        self.tick_until(lambda: bool(self.sdk.deleted))
        self.assertEqual(observed, ["one"])

    def test_native_send_success_does_not_confirm_application_receipt(self):
        self.store.ingest(self.record(), now=1000.0, source="satellite")
        self.tick_until(lambda: bool(self.sdk.sent))
        raw, topic = self.sdk.sent[0]
        self.assertEqual(topic, 244)
        self.assertEqual(self.codec.open(raw, "receipt")["receipts"][0]["id"], "one")
        self.assertEqual(len(self.store.pending_acks(now=1000.0)), 1)
        self.sdk.callback(42, 1)
        self.assertEqual(len(self.store.pending_acks(now=1000.0)), 1)
        self.sdk.heads.append(self.codec.seal({"confirmed_receipts": ["one"]}, "delivery"))
        self.tick_until(lambda: bool(self.sdk.deleted))
        self.assertEqual(self.store.pending_acks(now=1000.0), [])

    def test_invalid_authentication_and_schema_do_not_stop_polling(self):
        self.sdk.heads.extend([b"invalid", self.codec.seal({"records": []}, "delivery"),
                               self.codec.seal({"records": [self.record()]}, "delivery")])
        self.tick_until(lambda: len(self.sdk.deleted) == 3)
        self.assertEqual(self.radio.status()["rejected_count"], 2)
        self.assertEqual(len(self.store.messages(now=1000.0)), 1)

    def test_capacity_keeps_native_head_until_space_returns(self):
        self.store.max_messages = 1
        self.store.ingest(self.record("old"), now=1000.0, source="wifi")
        self.sdk.heads.append(self.codec.seal({"records": [self.record()]}, "delivery"))
        self.tick_until(lambda: self.radio.status()["state"] == "storage_backpressure")
        self.assertEqual(self.sdk.deleted, [])
        self.store.max_messages = 2
        self.clock = 1.1
        self.tick_until(lambda: bool(self.sdk.deleted))
        self.assertEqual(len(self.store.messages(now=1000.0)), 2)

    def test_slow_commit_does_not_block_sdk_polling(self):
        gate, entered = threading.Event(), threading.Event()
        original = self.store.ingest
        def blocked(*args, **kwargs):
            entered.set()
            if not gate.wait(1): raise RuntimeError("test gate timeout")
            return original(*args, **kwargs)
        self.store.ingest = blocked
        self.sdk.heads.append(self.codec.seal({"records": [self.record()]}, "delivery"))
        try:
            self.radio.tick()
            self.assertTrue(entered.wait(1))
            start = time.monotonic()
            for _ in range(20): self.radio.tick()
            self.assertLess(time.monotonic() - start, 0.2)
            self.assertEqual(self.sdk.deleted, [])
        finally:
            gate.set()
        self.tick_until(lambda: bool(self.sdk.deleted))

    def test_ack_retry_is_limited_and_only_one_native_send_pending(self):
        self.store.ingest(self.record(), now=1000.0, source="satellite")
        self.tick_until(lambda: len(self.sdk.sent) == 1)
        self.clock = 40
        for _ in range(5): self.radio.tick()
        self.assertEqual(len(self.sdk.sent), 1)
        self.sdk.callback(1, -1)
        self.tick_until(lambda: len(self.sdk.sent) == 2)
        self.sdk.callback(2, 1)
        self.clock = 69
        for _ in range(5): self.radio.tick()
        self.assertEqual(len(self.sdk.sent), 2)
        self.clock = 70
        self.tick_until(lambda: len(self.sdk.sent) == 3)
        self.assertFalse(self.radio.status()["hardware_tested"])

    def test_live_zero_limit_rejected_before_importing_hardware_sdk(self):
        budget = AttemptBudget(Path(self.tmp.name) / "attempts.db", "test")
        candidate = Radio9704(self.store, self.codec, "/not-opened", topic=244,
                              attempt_budget=budget, max_receipt_attempts=0)
        with patch("builtins.__import__", side_effect=AssertionError("unexpected SDK import")):
            with self.assertRaises(ValueError):
                candidate.start()
        self.assertEqual(candidate.status()["state"], "live_attempt_budget_required")
        self.assertEqual(budget.used("radio-ack"), 0)

    def test_attempt_cap_survives_bridge_and_budget_restart(self):
        path = Path(self.tmp.name) / "attempts.db"
        self.radio.close()
        budget = AttemptBudget(path, "same-epoch")
        self.radio = Radio9704(self.store, self.codec, "/fake", topic=244, sdk=self.sdk,
                              attempt_budget=budget, max_receipt_attempts=1,
                              monotonic=lambda: self.clock, wall_clock=lambda: 1000.0)
        self.radio.start()
        self.store.ingest(self.record(), now=1000.0, source="satellite")
        self.tick_until(lambda: len(self.sdk.sent) == 1)
        self.assertEqual(budget.used("radio-ack"), 1)
        self.radio.close()

        # A new native driver, process-equivalent bridge and budget object still
        # see the attempt reservation persisted before the earlier enqueue.
        self.sdk = FakeSDK()
        restarted_budget = AttemptBudget(path, "same-epoch")
        self.radio = Radio9704(self.store, self.codec, "/fake", topic=244, sdk=self.sdk,
                              attempt_budget=restarted_budget, max_receipt_attempts=1,
                              monotonic=lambda: self.clock, wall_clock=lambda: 1000.0)
        self.radio.start()
        self.tick_until(lambda: self.radio.status()["receipt_attempts_capped"])
        self.assertEqual(self.sdk.sent, [])
        self.assertEqual(restarted_budget.used("radio-ack"), 1)
        self.assertEqual(len(self.store.pending_acks(now=1000.0)), 1)

    def test_failed_enqueue_does_not_refund_attempt(self):
        self.radio.close()
        budget = AttemptBudget(Path(self.tmp.name) / "attempts.db", "failure")
        self.sdk.enqueues_accept = False
        self.radio = Radio9704(self.store, self.codec, "/fake", topic=244, sdk=self.sdk,
                              attempt_budget=budget, max_receipt_attempts=1,
                              monotonic=lambda: self.clock, wall_clock=lambda: 1000.0)
        self.radio.start()
        self.store.ingest(self.record(), now=1000.0, source="satellite")
        self.tick_until(lambda: self.radio.status()["state"] == "radio_send_queue_busy")
        self.clock = 31
        self.tick_until(lambda: self.radio.status()["receipt_attempts_capped"])
        self.assertEqual(budget.used("radio-ack"), 1)
        self.assertEqual(self.sdk.sent, [])


if __name__ == "__main__": unittest.main()

"""Optional, unverified RockBLOCK 9704 message bridge; never an IP bearer.

No hardware is accessed on import. The SDK has global native state: use one
bridge in a dedicated process, with its own WAL InboxStore connection. Only the
owner thread calls the SDK; database commits run in one worker to keep polling.
No keys, plaintext, or radio packet bodies are included in status messages.
Live operation requires a restart-durable attempt cap. This caps application
enqueue attempts, not carrier charges or the modem's internal radio retries.
"""
from concurrent.futures import ThreadPoolExecutor
import sqlite3
import threading
import time

from .protocol import ProtocolError
from .quota import AttemptBudget
from .storage import CapacityError
from .transport import HardDown


class Radio9704:
    """Call start(), then tick() every 10 ms, then close(), on one thread.

    Supplying an SDK object is exclusively a software test seam. A successful
    fake or live startup does not set hardware_tested: that requires recorded
    over-the-air acceptance results outside this bridge.
    """

    REQUIRED = ("begin", "end", "poll", "receive_message_async",
                "acknowledge_receive_head_async", "receive_lock_async",
                "send_lock_async", "send_message_async",
                "set_mo_message_complete_callback")

    def __init__(self, store, codec, port, *, topic, sdk=None,
                 attempt_budget=None, max_receipt_attempts=0,
                 monotonic=time.monotonic, wall_clock=time.time):
        if isinstance(topic, bool) or not isinstance(topic, int) or not 0 <= topic <= 65535:
            raise ValueError("an explicitly provisioned numeric topic is required")
        if type(max_receipt_attempts) is not int or max_receipt_attempts < 0:
            raise ValueError("a non-negative receipt attempt limit is required")
        self.store, self.codec, self.port, self.topic = store, codec, port, topic
        self._sdk = sdk
        self._live = sdk is None
        self._attempt_budget = attempt_budget
        self._max_receipt_attempts = max_receipt_attempts
        self._attempts_capped = False
        self._clock, self._wall = monotonic, wall_clock
        self._owner = None
        self._pool = None
        self._rx = None
        self._rx_future = None
        self._ack_future = None
        self._rx_retry_at = 0.0
        self._ack_check_at = 0.0
        self._next_tx_at = 0.0
        self._tx_since = None
        self._tx_pending = False
        self._last_ack_id = None
        self._last_poll = None
        self._started = False
        self._status = "not_started"
        self._poll_late = False
        self._received = 0
        self._rejected = 0
        self._enqueued = 0

    def _assert_owner(self):
        if self._owner != threading.get_ident():
            raise RuntimeError("the radio SDK must have one owner thread")

    def start(self):
        if self._started:
            raise RuntimeError("bridge is already running")
        self._owner = threading.get_ident()
        # Check before even importing the hardware SDK: receive acknowledgments
        # can cause transmissions, so there is no implicitly unmetered live mode.
        if self._live and (not isinstance(self._attempt_budget, AttemptBudget) or
                           self._max_receipt_attempts <= 0):
            self._status = "live_attempt_budget_required"
            raise ValueError("live radio requires a durable budget and a positive attempt cap")
        if self._sdk is None:
            try:
                from rockblock9704 import RockBlock9704
            except ImportError as exc:
                self._status = "sdk_unavailable"
                raise RuntimeError("install and verify the optional radio SDK first") from exc
            self._sdk = RockBlock9704()
        if any(not callable(getattr(self._sdk, name, None)) for name in self.REQUIRED):
            self._status = "unsupported_sdk"
            raise RuntimeError("SDK lacks the required asynchronous interface")
        if not self._sdk.begin(self.port):
            self._status = "serial_unavailable"
            raise RuntimeError("radio initialization failed")
        try:
            self._sdk.set_mo_message_complete_callback(self._on_mo_complete)
            self._sdk.receive_lock_async()
            self._sdk.send_lock_async()
            self._pool = ThreadPoolExecutor(max_workers=1, thread_name_prefix="radio-inbox")
        except Exception:
            self._sdk.end()
            raise
        self._started = True
        self._status = "awaiting_radio_delivery"
        self._last_poll = self._clock()

    def _on_mo_complete(self, _transport_id, status):
        # Called by the SDK poll owner. A native completion is not a server ACK.
        self._tx_pending = False
        self._tx_since = None
        self._status = "receipt_transport_complete" if status == 1 else "receipt_transport_failed"

    @staticmethod
    def _shape(body):
        if set(body) == {"records"}:
            records = body["records"]
            if not isinstance(records, list) or len(records) != 1 or not isinstance(records[0], dict):
                raise ProtocolError("one record is required")
            return "record", records[0]
        if set(body) == {"confirmed_receipts"}:
            ids = body["confirmed_receipts"]
            if (not isinstance(ids, list) or not 1 <= len(ids) <= 128 or
                any(not isinstance(x, str) or not 1 <= len(x) <= 128 for x in ids) or
                    len(set(ids)) != len(ids)):
                raise ProtocolError("invalid receipt confirmation")
            return "confirmation", ids
        raise ProtocolError("unexpected delivery body")

    def _persist(self, kind, value):
        if kind == "record":
            return self.store.ingest(value, now=self._wall(), source="satellite")
        self.store.acknowledge(value)
        return "confirmed"

    def _read_ack(self):
        pending = self.store.pending_acks(now=self._wall())
        if not pending:
            return None
        # Rotate among unconfirmed receipts instead of starving every later ID.
        index = 0
        for i, receipt in enumerate(pending):
            if receipt["id"] == self._last_ack_id:
                index = (i + 1) % len(pending)
                break
        receipt = pending[index]
        if self._attempt_budget is not None:
            # Reserve before encoding/enqueuing. Never refund a failed or
            # uncertain attempt, including a full native transmit queue.
            self._attempt_budget.claim("radio-ack", self._max_receipt_attempts)
        return receipt["id"], self.codec.seal({"receipts": [receipt]}, "receipt")

    def _release_head(self):
        if self._sdk.acknowledge_receive_head_async():
            self._rx = None
            return True
        self._status = "radio_head_release_pending"
        return False

    def tick(self):
        self._assert_owner()
        if not self._started:
            raise RuntimeError("bridge has not started")
        now = self._clock()
        if self._last_poll is not None and now - self._last_poll > 0.050:
            self._poll_late = True
        self._sdk.poll()
        self._last_poll = now

        if self._rx_future is not None and self._rx_future.done():
            future, self._rx_future = self._rx_future, None
            try:
                outcome = future.result()
            except (CapacityError, sqlite3.Error, OSError):
                self._status = "storage_backpressure"
                self._rx_retry_at = now + 1.0
            except (ValueError, ProtocolError, OverflowError):
                # Authenticated but structurally invalid/conflicting records
                # may be rejected. No application ACK is produced.
                self._rejected += 1
                self._rx = ("release", None)
                self._status = "rejected_delivery"
            except Exception:
                self._status = "storage_error"
                self._rx_retry_at = now + 1.0
            else:
                self._received += int(outcome in ("stored", "duplicate", "expired"))
                self._rx = ("release", None)
                self._status = "saved" if outcome != "confirmed" else "receipt_server_confirmed"

        if self._rx is not None and self._rx[0] == "release":
            self._release_head()

        if self._rx is None:
            raw = self._sdk.receive_message_async()  # No topic argument: vendor wrapper limitation.
            if raw is not None:
                try:
                    self._rx = self._shape(self.codec.open(raw, "delivery"))
                except (ValueError, TypeError, OverflowError, RecursionError):
                    self._rejected += 1
                    self._status = "rejected_delivery"
                    self._rx = ("release", None)
                    self._release_head()

        if (self._rx is not None and self._rx[0] != "release" and
                self._rx_future is None and now >= self._rx_retry_at):
            self._rx_future = self._pool.submit(self._persist, *self._rx)

        if self._ack_future is not None and self._ack_future.done():
            future, self._ack_future = self._ack_future, None
            try:
                prepared = future.result()
            except HardDown:
                self._attempts_capped = True
                self._status = "receipt_attempt_cap_reached"
            except Exception:
                self._status = "receipt_read_error"
                self._ack_check_at = now + 1.0
            else:
                if prepared is not None:
                    identifier, packet = prepared
                    self._next_tx_at = now + 30.0  # Also rate-limit enqueue failures.
                    self._tx_pending = True
                    self._tx_since = now
                    if self._sdk.send_message_async(packet, topic=self.topic):
                        self._enqueued += 1
                        self._last_ack_id = identifier
                    else:
                        self._tx_pending = False
                        self._tx_since = None
                        self._status = "radio_send_queue_busy"
                self._ack_check_at = now + 1.0

        if (not self._attempts_capped and not self._tx_pending and self._ack_future is None and
                now >= max(self._next_tx_at, self._ack_check_at)):
            self._ack_future = self._pool.submit(self._read_ack)

        if self._tx_pending and self._tx_since is not None and now - self._tx_since > 120:
            # Keep the native item pending; its outcome is unknown, not a safe
            # opportunity to queue duplicate transmissions without a limit.
            self._status = "receipt_transport_outcome_unknown"
        return self.status()

    def status(self):
        return {"state": self._status, "hardware_tested": False,
                "delivery_count": self._received, "rejected_count": self._rejected,
                "receipt_enqueued_count": self._enqueued,
                "receipt_attempts_capped": self._attempts_capped,
                "radio_tx_pending": self._tx_pending, "poll_deadline_missed": self._poll_late}

    def run(self, stop_event):
        self.start()
        try:
            while not stop_event.is_set():
                self.tick()
                stop_event.wait(0.010)
        finally:
            self.close()

    def close(self):
        self._assert_owner()
        if self._started:
            # Polling is now stopped. Ending the radio does not clear database
            # receipts. Unreleased radio messages can be replayed by the server.
            try:
                self._sdk.end()
            finally:
                self._started = False
                self._pool.shutdown(wait=True, cancel_futures=False)
                self._status = "stopped"

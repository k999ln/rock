"""One bounded background Wallet reader; cached values are display only.

The injected reader must enforce its own I/O deadline and authenticated peer.
Mutations and paid-service admission never use this cache as authority. Invalidated
in-flight responses cannot become fresh again after a concurrent mutation.
"""
import copy
import json
import math
import threading
import time

from wallet_backend.client import validate_snapshot


class WalletView:
    def __init__(self, read_snapshot, *, interval=2.0, ttl=5.0, close_timeout=7.0,
                 clock=time.monotonic):
        if not callable(read_snapshot) or not callable(clock):
            raise ValueError('bounded authenticated Wallet reader required')
        for value in (interval, ttl, close_timeout):
            if type(value) not in (int,float) or not math.isfinite(value) or not 0 < value <= 30:
                raise ValueError('Wallet view timing must be finite and bounded')
        if interval > ttl:
            raise ValueError('refresh interval must not exceed freshness lifetime')
        self.read_snapshot, self.interval, self.ttl = read_snapshot, interval, ttl
        self.close_timeout, self.clock = close_timeout, clock
        self.condition = threading.Condition()
        self.closed = False; self.pending = True; self.generation = 0
        self.value = None; self.observed_at = None; self.failed = True
        self.thread = threading.Thread(target=self._run, name='rock-wallet-view', daemon=False)
        self.thread.start()

    @staticmethod
    def _checked(value):
        encoded = json.dumps(value,allow_nan=False,separators=(',',':'))
        if len(encoded.encode()) > 1024*1024:
            raise ValueError('Wallet view exceeds response bound')
        value = json.loads(encoded)
        validate_snapshot(value)
        backend = value.get('backend')
        if (type(backend) is not dict or
                any(type(backend.get(name)) is not bool for name in ('connected','stale','pending_reconciliation'))):
            raise ValueError('remote Wallet connection state required')
        return value

    def _run(self):
        while True:
            with self.condition:
                if not self.pending and not self.closed:
                    self.condition.wait_for(lambda:self.pending or self.closed,timeout=self.interval)
                if self.closed:
                    return
                self.pending = False; generation = self.generation
            try:
                value = self._checked(self.read_snapshot())
                observed_at = self.clock()
                if type(observed_at) not in (int,float) or not math.isfinite(observed_at):
                    raise ValueError('invalid freshness clock')
                failure = False
            except Exception:
                value, observed_at, failure = None, None, True
            with self.condition:
                if self.closed:
                    return
                if generation == self.generation:
                    self.failed = failure
                    if not failure:
                        self.value, self.observed_at = value, observed_at
                # A response begun before invalidate is discarded, including its
                # denial/success. The next single read observes the new state.
                self.condition.notify_all()

    def snapshot(self):
        with self.condition:
            if self.value is None:
                return None  # Unknown money is never rendered as zero.
            result = copy.deepcopy(self.value)
            now = self.clock()
            age = now-self.observed_at
            fresh = (not self.closed and not self.failed and math.isfinite(age) and 0 <= age < self.ttl)
            if not fresh:
                result['backend'].update(connected=False,stale=True)
                result['membership']['backend_connected'] = False
                result['billing']['backend_connected'] = False
            result['backend']['view_age_seconds'] = max(0,age) if math.isfinite(age) else None
            result['backend']['view_fresh'] = fresh
            return result

    def invalidate(self):
        with self.condition:
            if self.closed:
                return
            self.generation += 1; self.failed = True; self.pending = True
            self.condition.notify_all()

    def close(self):
        with self.condition:
            self.closed = True; self.condition.notify_all()
        self.thread.join(self.close_timeout)
        if self.thread.is_alive():
            raise RuntimeError('bounded Wallet reader did not terminate; owned worker still active')

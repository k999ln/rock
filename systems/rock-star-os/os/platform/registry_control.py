"""Durable refresh queue and signed-revocation admission coordination.

Network fetches do not hold the Hub lock. Signed-cache commit and applying its
revocations share that lock with platform mutation admission. Call
sync_revocations() inside that same lock before admitting a new mutation.
"""
from __future__ import annotations

from contextlib import contextmanager
import sqlite3
import threading
import time


class RegistrySafetyError(ValueError):
    """Current signed-cache revocations could not be applied; deny admission."""


class RegistryControl:
    def __init__(self, hub, client, start=True, *, retry_initial=0.1, retry_max=5.0):
        if (isinstance(retry_initial, bool) or isinstance(retry_max, bool)
                or not isinstance(retry_initial, (int, float))
                or not isinstance(retry_max, (int, float))
                or not 0.01 <= retry_initial <= retry_max <= 30):
            raise ValueError('invalid bounded registry retry policy')
        self.hub, self.client = hub, client
        self.retry_initial, self.retry_max = retry_initial, retry_max
        self.wake = threading.Event()
        self.stopping = threading.Event()
        self.thread = None
        self._thread_lock = threading.Lock()
        self._process_lock = threading.Lock()
        self._status_lock = threading.Lock()
        self._worker_error = None
        self._worker_failures = 0
        self._retry_at = None
        self._safety_error = None
        with hub.lock, hub.connect() as connection:
            connection.execute('''CREATE TABLE IF NOT EXISTS rock_registry_requests(
                key TEXT PRIMARY KEY, status TEXT NOT NULL, requested REAL NOT NULL,
                finished REAL, error TEXT)''')
            connection.execute("UPDATE rock_registry_requests SET status='queued' WHERE status='running'")
        # A corrupt cache or unavailable revocation DB prevents initial startup.
        self.sync_revocations()
        if start:
            self.start()

    def sync_revocations(self):
        """Fail closed and keep Hub -> client lock order for every caller.

        The flag is diagnostic, not a substitute for admission synchronization.
        Platform calls this under Hub.lock before its mutation, so a failure
        raises before work is admitted. A later successful retry clears the flag.
        """
        with self.hub.lock:
            try:
                subjects = self.client.revocations()
                with self.hub.connect() as connection:
                    known = {row[0] for row in connection.execute('SELECT subject FROM hub_revoked')}
                for subject in subjects:
                    if subject not in known:
                        self.hub.revoke(subject)
                        known.add(subject)
            except Exception as exc:
                message = f'revocation synchronization failed: {type(exc).__name__}: {exc}'[:300]
                with self._status_lock:
                    self._safety_error = message
                raise RegistrySafetyError(message) from exc
            else:
                with self._status_lock:
                    self._safety_error = None

    @contextmanager
    def commit_guard(self):
        """Client exits its mutex/file lock before this finally synchronizes."""
        with self.hub.lock:
            try:
                yield
            finally:
                # Even if atomic rename succeeded and directory fsync failed,
                # re-read the actual signed cache before releasing admission.
                self.sync_revocations()

    @contextmanager
    def admission_guard(self):
        """Optional platform helper covering both synchronization and mutation."""
        with self.hub.lock:
            self.sync_revocations()
            yield

    def enqueue(self, key):
        # Platform owns Hub.request: insertion and retry receipt commit together.
        # If an unexpected BaseException killed a previous worker, a new request
        # also starts its recovery even when the existing busy row rejects it.
        if self.thread is not None and not self.thread.is_alive():
            self.start()
        with self.hub.connect() as connection:
            busy = connection.execute("SELECT key FROM rock_registry_requests WHERE status IN ('queued','running') LIMIT 1").fetchone()
            if busy is not None:
                raise ValueError('a store refresh is already in progress')
            connection.execute('INSERT INTO rock_registry_requests VALUES(?,?,?,?,?)',
                               (key, 'queued', time.time(), None, None))
        return {'accepted': True, 'operation': key}

    def start(self):
        with self._thread_lock:
            if self.stopping.is_set():
                raise ValueError('store refresh control is closed')
            if self.thread is None or not self.thread.is_alive():
                self.thread = threading.Thread(target=self._loop, name='rock-store-refresh', daemon=True)
                self.thread.start()
            self.wake.set()

    def close(self):
        with self._thread_lock:
            self.stopping.set()
            self.wake.set()
            thread = self.thread
        if thread is not None and thread is not threading.current_thread():
            thread.join(timeout=15)

    def process_one(self):
        with self._process_lock:
            with self.hub.lock, self.hub.connect() as connection:
                self.hub._begin(connection)
                # A previous attempt can have committed 'running' before a queue
                # write failed. The single consumer resumes it with the same key.
                row = connection.execute("SELECT key FROM rock_registry_requests WHERE status IN ('queued','running') "
                                         "ORDER BY CASE status WHEN 'running' THEN 0 ELSE 1 END,requested LIMIT 1").fetchone()
                if row is None:
                    return False
                key = row[0]
                connection.execute("UPDATE rock_registry_requests SET status='running',finished=NULL WHERE key=?", (key,))
            status, error = 'ready', None
            try:
                self.client.refresh(commit_guard=self.commit_guard)
            except (OSError, ValueError, TypeError, KeyError, TimeoutError, sqlite3.Error) as exc:
                status, error = 'error', f'{type(exc).__name__}: {exc}'[:300]
            # Queue I/O exceptions intentionally reach the outer retry loop. The
            # signed cache and Hub revocations are already synchronized, even if
            # this final status transaction cannot commit yet.
            with self.hub.lock, self.hub.connect() as connection:
                connection.execute('UPDATE rock_registry_requests SET status=?,finished=?,error=? WHERE key=?',
                                   (status, time.time(), error, key))
            return True

    def _worker_failed(self, exc):
        with self._status_lock:
            self._worker_failures += 1
            delay = min(self.retry_max, self.retry_initial * (2 ** min(self._worker_failures - 1, 16)))
            self._worker_error = f'{type(exc).__name__}: {exc}'[:300]
            self._retry_at = time.time() + delay
        return delay

    def _worker_recovered(self):
        with self._status_lock:
            self._worker_error = None
            self._worker_failures = 0
            self._retry_at = None

    def _loop(self):
        try:
            while not self.stopping.is_set():
                self.wake.wait()
                self.wake.clear()
                while not self.stopping.is_set():
                    try:
                        worked = self.process_one()
                    except Exception as exc:
                        # SQLite/OSError (and an unexpected adapter exception)
                        # must not permanently kill the daemon or strand busy.
                        delay = self._worker_failed(exc)
                        if self.stopping.wait(delay):
                            break
                        continue
                    self._worker_recovered()
                    if not worked:
                        break
        except BaseException as exc:
            # Keep a visible diagnostic for a dead worker; start(), enqueue(), or
            # snapshot() can restart it. Do not swallow process-exit exceptions.
            self._worker_failed(exc)
            raise

    def snapshot(self):
        # Inspecting a previously started but dead worker also triggers recovery;
        # start=False test/manual controls do not start merely from a snapshot.
        if self.thread is not None and not self.thread.is_alive() and not self.stopping.is_set():
            self.start()
        row, read_error = None, None
        try:
            with self.hub.connect() as connection:
                row = connection.execute('SELECT * FROM rock_registry_requests ORDER BY requested DESC LIMIT 1').fetchone()
        except (sqlite3.Error, OSError) as exc:
            read_error = f'{type(exc).__name__}: {exc}'[:300]
        state, count, cache_error = None, 0, None
        try:
            state = self.client.verified_state()
            count = len(self.client.catalog())
        except (ValueError, OSError, sqlite3.Error) as exc:
            cache_error = f'{type(exc).__name__}: {exc}'[:300]
        with self._status_lock:
            worker_error, safety_error, retry_at = self._worker_error, self._safety_error, self._retry_at
            failures = self._worker_failures
        busy = row is not None and row['status'] in ('queued', 'running')
        error = safety_error or cache_error or read_error or worker_error or (row['error'] if row else None)
        status = 'ready' if state is not None else 'embedded'
        if row is not None:
            status = 'refreshing' if busy else row['status']
        if error:
            status = 'error'
        return {'configured': True, 'can_refresh': not busy and read_error is None, 'status': status,
                'source_label': '開発用ストア', 'last_checked_unix': row['finished'] if row else None,
                'last_error': error,
                'revision': state['revision'] if state else None,
                'issued_at': state['issued_at'] if state else None,
                'expires_at': state['expires_at'] if state else None,
                'fresh': state['fresh'] if state else False, 'count': count,
                'admission_blocked': safety_error is not None or cache_error is not None,
                'safety_error': safety_error or cache_error,
                'worker_alive': self.thread is not None and self.thread.is_alive(),
                'worker_error': worker_error, 'worker_failures': failures,
                'retry_at_unix': retry_at}

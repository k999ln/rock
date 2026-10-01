"""Real signed client/cache + Hub SQLite; controlled transport isolates commit faults.

Full HTTPS behavior has separate real-TLS tests in os/registry/tests. These tests
inject filesystem and queue faults at exact transaction/admission boundaries.
"""
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
import fcntl
import importlib.util
import json
import os
from pathlib import Path
import sqlite3
import sys
import tempfile
import threading
import time
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'os'))
from blackberryrock.hub import Hub
from blackberryrock.packages import PUBLIC_TEST_KEY, TEST_PUBLISHER
from registry.client import RegistryClient
from registry.common import RegistryError
from registry.server import RegistryStore

spec = importlib.util.spec_from_file_location('registry_control_fault_boundary_test', ROOT / 'os/platform/registry_control.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
RegistryControl, RegistrySafetyError = module.RegistryControl, module.RegistrySafetyError
FIXTURES = ROOT / 'os/registry/fixtures'


class RegistryFailureBoundaryTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.server = RegistryStore(self.root / 'server', FIXTURES / 'approved-authors.json')
        self.package = json.loads((ROOT / 'examples/registry/org.rockstar.proposal-draft--1.0.0.rock.json').read_bytes())
        self.server.publish('development-author', 'publish', {'package': self.package})
        self.client = RegistryClient('https://localhost:9443', FIXTURES / 'development-ca.pem', self.root / 'cache')
        self.transport_patch = patch.object(self.client.transport, 'request', side_effect=lambda *a, **k: self.server.index())
        self.transport_patch.start()
        self.client.refresh()
        self.hub = Hub(self.root / 'hub.db', {TEST_PUBLISHER: PUBLIC_TEST_KEY})
        installed = self.hub.install(self.package)
        self.tool_id, self.package_hash = installed['id'], installed['hash']
        self.hub.enable(self.tool_id, self.package_hash)
        self.control = RegistryControl(self.hub, self.client, start=False, retry_initial=0.02, retry_max=0.08)

    def tearDown(self):
        self.control.close()
        self.transport_patch.stop()
        self.server.close()
        self.temporary.cleanup()

    def revoke_remote(self):
        self.server.revoke('development-author', 'revoke', {'subject': TEST_PUBLISHER})

    def queue(self, key='refresh'):
        return self.hub.request(key, {'op': 'registry.refresh'}, lambda: self.control.enqueue(key))

    def wait_until(self, predicate, timeout=3):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            if predicate():
                return
            threading.Event().wait(0.01)
        self.fail('bounded recovery did not finish')

    def queue_status(self):
        with self.hub.connect() as db:
            row = db.execute('SELECT status FROM rock_registry_requests LIMIT 1').fetchone()
            return row[0] if row else None

    def test_guard_surrounds_both_client_locks_and_runs_after_rename_error(self):
        self.revoke_remote()
        observations = []
        self.client.mutex = threading.Lock()
        @contextmanager
        def guard():
            def inspect(phase):
                self.assertFalse(self.client.mutex.locked())
                fd = os.open(self.client.lock_file, os.O_RDWR)
                try:
                    fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
                    observations.append(phase)
                finally:
                    os.close(fd)
            inspect('enter')
            try:
                yield
            finally:
                inspect('exit')
        with patch('registry.common.fsync_directory', side_effect=OSError('injected directory fsync failure')):
            with self.assertRaises(OSError):
                self.client.refresh(commit_guard=guard)
        self.assertEqual(['enter', 'exit'], observations)
        self.assertEqual([TEST_PUBLISHER], self.client.revocations())

    def test_rename_success_fsync_failure_still_revokes_before_return(self):
        self.revoke_remote()
        self.queue()
        with patch('registry.common.fsync_directory', side_effect=OSError('injected directory fsync failure')):
            self.assertTrue(self.control.process_one())
        self.assertEqual([TEST_PUBLISHER], self.client.revocations())
        state = self.hub.state()
        self.assertEqual(0, state['installed'][0]['enabled'])
        self.assertIn(TEST_PUBLISHER, state['revoked'])
        self.assertEqual('error', self.control.snapshot()['status'])
        self.assertFalse(self.control.snapshot()['admission_blocked'])
        with self.assertRaises(ValueError):
            with self.control.admission_guard():
                self.hub.enable(self.tool_id, self.package_hash)

    def test_concurrent_approval_and_run_cannot_enter_commit_to_revocation_window(self):
        self.revoke_remote()
        self.queue()
        renamed, release = threading.Event(), threading.Event()
        attempted = {name: threading.Event() for name in ('approve', 'run')}
        completed = {name: threading.Event() for name in ('approve', 'run')}
        def fail_after_rename(_):
            renamed.set()
            if not release.wait(3):
                raise RuntimeError('test coordination timeout')
            raise OSError('injected post-rename failure')
        def admit(kind):
            attempted[kind].set()
            try:
                with self.control.admission_guard():
                    if kind == 'approve':
                        self.hub.enable(self.tool_id, self.package_hash)
                    else:
                        self.hub.run(self.tool_id, '{}', 'must-not-create-job')
                return 'incorrectly admitted'
            except ValueError:
                return 'denied'
            finally:
                completed[kind].set()
        with ThreadPoolExecutor(max_workers=3) as pool, patch('registry.common.fsync_directory', side_effect=fail_after_rename):
            refresh = pool.submit(self.control.process_one)
            try:
                self.assertTrue(renamed.wait(2))
                admissions = [pool.submit(admit, kind) for kind in ('approve', 'run')]
                for kind in ('approve', 'run'):
                    self.assertTrue(attempted[kind].wait(2))
                    self.assertFalse(completed[kind].wait(0.05))
            finally:
                release.set()
            self.assertTrue(refresh.result(timeout=2))
            for admission in admissions:
                self.assertEqual('denied', admission.result(timeout=2))
        self.assertEqual(0, self.hub.state()['installed'][0]['enabled'])
        self.assertEqual([], self.hub.state()['jobs'])

    def test_network_wait_does_not_hold_hub_admission_lock(self):
        entered, release = threading.Event(), threading.Event()
        def slow_fetch(*args, **kwargs):
            entered.set()
            if not release.wait(3):
                raise RuntimeError('test coordination timeout')
            return self.server.index()
        self.queue()
        with ThreadPoolExecutor(max_workers=2) as pool, patch.object(self.client.transport, 'request', side_effect=slow_fetch):
            refresh = pool.submit(self.control.process_one)
            try:
                self.assertTrue(entered.wait(2))
                # Approval can complete against the previous signed state while
                # bytes of a future index have not even arrived yet.
                approval = pool.submit(self.hub.enable, self.tool_id, self.package_hash)
                approval.result(timeout=1)
            finally:
                release.set()
            self.assertTrue(refresh.result(timeout=2))

    def test_invalid_signature_never_enters_commit_guard_or_changes_cache(self):
        original = self.client.state_file.read_bytes()
        invalid = json.loads(self.server.index())
        invalid['signature'] = '0' * 128
        entered = []
        @contextmanager
        def guard():
            entered.append(True)
            yield
        with patch.object(self.client.transport, 'request', return_value=json.dumps(invalid).encode()):
            with self.assertRaises(RegistryError):
                self.client.refresh(commit_guard=guard)
        self.assertEqual([], entered)
        self.assertEqual(original, self.client.state_file.read_bytes())

    def test_hub_revocation_sqlite_failure_blocks_admission_until_synced(self):
        self.revoke_remote()
        with self.hub.connect() as db:
            db.execute("CREATE TRIGGER inject_revoke_failure BEFORE INSERT ON hub_revoked "
                       "BEGIN SELECT RAISE(ABORT,'injected revocation storage failure'); END")
        self.queue()
        self.control.process_one()
        snapshot = self.control.snapshot()
        self.assertTrue(snapshot['admission_blocked'])
        self.assertIn('revocation synchronization failed', snapshot['last_error'])
        entered = []
        with self.assertRaises(RegistrySafetyError):
            with self.control.admission_guard():
                entered.append('unsafe mutation')
        self.assertEqual([], entered)
        with self.hub.connect() as db:
            db.execute('DROP TRIGGER inject_revoke_failure')
        with self.assertRaises(ValueError):
            with self.control.admission_guard():
                self.hub.enable(self.tool_id, self.package_hash)
        self.assertFalse(self.control.snapshot()['admission_blocked'])
        self.assertEqual(0, self.hub.state()['installed'][0]['enabled'])

    def test_queue_completion_sqlite_failure_retries_running_and_recovers(self):
        self.queue()
        with self.hub.connect() as db:
            db.execute("CREATE TRIGGER inject_queue_failure BEFORE UPDATE ON rock_registry_requests "
                       "WHEN NEW.status='ready' BEGIN SELECT RAISE(ABORT,'injected queue write failure'); END")
        self.control.start()
        self.wait_until(lambda: self.control.snapshot()['worker_failures'] >= 1)
        snapshot = self.control.snapshot()
        self.assertEqual('running', self.queue_status())
        self.assertTrue(snapshot['worker_alive'])
        self.assertEqual('error', snapshot['status'])
        self.assertIsNotNone(snapshot['retry_at_unix'])
        self.assertFalse(snapshot['can_refresh'])
        with self.hub.connect() as db:
            db.execute('DROP TRIGGER inject_queue_failure')
        self.wait_until(lambda: self.queue_status() == 'ready')
        self.wait_until(lambda: self.control.snapshot()['worker_error'] is None)
        with self.hub.connect() as db:
            self.assertEqual(1, db.execute('SELECT COUNT(*) FROM rock_registry_requests').fetchone()[0])
        self.assertTrue(self.control.snapshot()['can_refresh'])

    def test_queue_selection_oserror_keeps_worker_alive_with_bounded_backoff(self):
        self.queue()
        original = self.hub.connect
        failures = []
        @contextmanager
        def flaky_connect():
            if threading.current_thread().name == 'rock-store-refresh' and len(failures) < 3:
                failures.append(time.monotonic())
                raise OSError('injected temporary database unavailable')
            with original() as db:
                yield db
        with patch.object(self.hub, 'connect', flaky_connect):
            self.control.start()
            self.wait_until(lambda: self.queue_status() == 'ready')
        self.assertEqual(3, len(failures))
        self.assertGreaterEqual(failures[1]-failures[0], 0.015)
        self.assertGreaterEqual(failures[2]-failures[1], 0.03)
        self.assertLess(failures[2]-failures[0], 1)
        self.assertTrue(self.control.thread.is_alive())

    def test_dead_worker_start_replaces_reference_and_reprocesses_running(self):
        self.queue()
        with self.hub.connect() as db:
            db.execute("UPDATE rock_registry_requests SET status='running'")
        dead = threading.Thread(target=lambda: None)
        dead.start()
        dead.join()
        self.control.thread = dead
        self.control.start()
        self.assertIsNot(dead, self.control.thread)
        self.wait_until(lambda: self.queue_status() == 'ready')

    def test_systemexit_after_commit_syncs_before_worker_dies_then_snapshot_recovers(self):
        self.revoke_remote()
        self.queue()
        original = self.client.refresh
        calls, exits = [], []
        def crash_once(**kwargs):
            if not calls:
                calls.append(True)
                with patch('registry.common.fsync_directory', side_effect=SystemExit('injected worker crash after rename')):
                    return original(**kwargs)
            return original(**kwargs)
        with patch.object(self.client, 'refresh', side_effect=crash_once), patch('threading.excepthook', side_effect=lambda args: exits.append(args.exc_type)):
            self.control.start()
            dead = self.control.thread
            dead.join(timeout=2)
            self.assertFalse(dead.is_alive())
            self.assertEqual([SystemExit], exits)
            self.assertEqual('running', self.queue_status())
            self.assertIn(TEST_PUBLISHER, self.hub.state()['revoked'])
            self.control.snapshot()  # Does not leave a dead daemon permanently busy.
            self.wait_until(lambda: self.queue_status() == 'ready')
            self.assertIsNot(dead, self.control.thread)

    def test_snapshot_reports_temporary_queue_read_failure_and_closed_stays_closed(self):
        with patch.object(self.hub, 'connect', side_effect=sqlite3.OperationalError('injected read failure')):
            snapshot = self.control.snapshot()
        self.assertEqual('error', snapshot['status'])
        self.assertIn('injected read failure', snapshot['last_error'])
        self.assertFalse(snapshot['can_refresh'])
        self.control.close()
        with self.assertRaisesRegex(ValueError, 'closed'):
            self.control.start()


if __name__ == '__main__':
    unittest.main()

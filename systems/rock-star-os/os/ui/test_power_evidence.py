#!/usr/bin/env python3
"""Disposable power evidence rejection tests; no actual reboot or poweroff."""
import copy
import importlib.util
import json
import os
from pathlib import Path
import sqlite3
import socket
import threading
import tempfile
import time
import unittest
from unittest.mock import patch


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


HERE = Path(__file__).resolve().parent
observer = load('power_evidence_unit_observer', HERE / 'guest-ui-power-evidence.py')
harness = load('power_evidence_unit_harness', HERE / 'verify-power.py')
power = load('power_evidence_unit_service', HERE.parent / 'system/power_service.py')
BOOTS = ['11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222']


class MonitorTests(unittest.TestCase):
    def test_observer_retries_only_transient_sqlite_locks_with_a_deadline(self):
        busy = sqlite3.OperationalError('database is locked')
        busy.sqlite_errorcode = sqlite3.SQLITE_BUSY
        locked = sqlite3.OperationalError('table is locked')
        locked.sqlite_errorcode = sqlite3.SQLITE_LOCKED
        for transient in (busy, locked):
            with patch.object(observer, 'records_once', side_effect=[transient, []]) as read, patch.object(observer.time, 'sleep'):
                self.assertEqual(observer.records(), [])
                self.assertEqual(read.call_count, 2)
        with patch.object(observer, 'records_once', side_effect=busy), patch.object(observer.time, 'monotonic', side_effect=[0, 16]):
            with self.assertRaises(sqlite3.OperationalError): observer.records()
        corrupt = sqlite3.OperationalError('database disk image is malformed')
        corrupt.sqlite_errorcode = sqlite3.SQLITE_CORRUPT
        with patch.object(observer, 'records_once', side_effect=corrupt) as read:
            with self.assertRaises(sqlite3.OperationalError): observer.records()
            self.assertEqual(read.call_count, 1)

    def test_retry_requires_latest_pending_receipt_for_current_boot_phase(self):
        result = {'accepted': True, 'op': 'poweroff', 'key': 'ui-' + 'a' * 32}
        item = {'phase': 2, 'status': 'pending', 'receipt': {'ok': True, 'result': result}}
        line = lambda value: 'ROCK_UI_POWER_REQUEST_OBSERVED ' + json.dumps(value) + '\n'
        self.assertEqual(harness.pending_receipt(line(item), 2), result)
        self.assertIsNone(harness.pending_receipt(line(item), 1))
        self.assertIsNone(harness.pending_receipt(line(item) + line({**item, 'status': 'dispatched'}), 2))
        item['receipt']['result']['op'] = 'reboot'
        with self.assertRaises(AssertionError): harness.pending_receipt(line(item), 2)

    def test_event_reader_keeps_guest_events_between_input_replies(self):
        with tempfile.TemporaryDirectory(prefix='rock-power-qmp-unit-') as temporary:
            path = Path(temporary) / 'monitor.sock'
            listener = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
            listener.bind(str(path)); listener.listen(1)
            def serve():
                connection, _ = listener.accept()
                with connection, connection.makefile('rwb', buffering=0) as stream:
                    stream.write(b'{"QMP":{}}\n')
                    for event in ('RESET', 'SHUTDOWN'):
                        request = json.loads(stream.readline())
                        stream.write(json.dumps({'event': event, 'data': {'guest': True}}).encode() + b'\n')
                        stream.write(json.dumps({'id': request['id'], 'return': {'status': 'running'}}).encode() + b'\n')
            thread = threading.Thread(target=serve, daemon=True)
            thread.start()
            report = {'qmp_events': [], 'qmp_commands': []}
            monitor = None
            try:
                monitor = harness.Monitor(path, report)
                self.assertEqual(monitor.command('query-status'), {'status': 'running'})
                thread.join(timeout=2)
                self.assertEqual([event['event'] for event in report['qmp_events']], ['RESET', 'SHUTDOWN'])
                self.assertEqual(report['qmp_commands'], ['qmp_capabilities', 'query-status'])
            finally:
                if monitor: monitor.close()
                listener.close()
                thread.join(timeout=2)


@unittest.skipUnless(os.geteuid() == 0, 'run on isolated Linux VM with root-owned disposable power state')
class PowerEvidenceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temporary = tempfile.TemporaryDirectory(prefix='rock-ui-power-evidence-test-')
        cls.directory = Path(cls.temporary.name) / 'system'
        cls.executed = []
        for index, operation in enumerate(('reboot', 'poweroff')):
            service = power.PowerService(cls.directory, executor=lambda op: cls.executed.append(op) or 0, boot_id=BOOTS[index], delay=0.01)
            request = {'v': 1, 'op': operation, 'key': 'ui-' + str(index + 1) * 32}
            service.accept(request, peer_uid=1002)
            service.after_reply(request)
            deadline = time.monotonic() + 2
            while len(cls.executed) < index + 1 and time.monotonic() < deadline:
                time.sleep(0.005)
            service.close()
        with patch.object(observer, 'DATABASE', str(cls.directory / 'power.db')):
            cls.rows = observer.records()
        wallet = {'simulation_only': True, 'currency': 'USD', 'available_minor': 0, 'pending_minor': 0,
                  'held_minor': 0, 'billed_minor': 0, 'dispensed_minor': 0, 'ledger_balance_minor': 0,
                  'consent': {'accepted': False}, 'sales': [], 'withdrawals': [], 'bills': [], 'journals': []}
        environment = {'framebuffer': [720, 960], 'hardware_network_interfaces': [], 'network_interfaces': ['lo'],
                       'evdev_names': ['QEMU Virtio Keyboard', 'QEMU Virtio Tablet'],
                       'root_mount': ['/dev/vda', '/', 'ext4', 'ro'],
                       'data_mount': ['/dev/vdb', '/data', 'ext4', 'rw,nosuid,nodev,noexec'],
                       'processes': {name: {'uid': [uid] * 4, 'gid': [uid] * 4, 'no_new_privs': 1}
                                     for name, uid in {'ui': 1000, 'core': 1000, 'platform': 1002, 'wallet': 1003}.items()},
                       'power_process': {'uid': [0] * 4, 'gid': [0] * 4}}
        cls.proof = {'schema': 'rock-native-power-ui-proof/1', 'phase': 2, 'status': 'AWAITING_ACTUAL_POWER_EVENTS',
                     'observer_mutations': 0, 'blackberry': 'NOT_RUN', 'real_money': 'NOT_RUN',
                     'first_boot_id': BOOTS[0], 'second_boot_id': BOOTS[1], 'first_dispatch': cls.rows[0],
                     'last_observed_request': cls.rows[1], 'wallet_initial': wallet, 'wallet_second': wallet,
                     'wallet_initial_sha256': observer.base.digest(wallet), 'wallet_second_sha256': observer.base.digest(wallet),
                     'hub_initial_sha256': 'a' * 64, 'hub_second_sha256': 'a' * 64,
                     'environment_first': environment, 'environment_second': environment}
        cls.boots = [{'phase': index + 1, 'boot_id': boot} for index, boot in enumerate(BOOTS)]
        cls.events = [{'event': event, 'data': {'guest': True}} for event in ('RESET', 'SHUTDOWN')]

    @classmethod
    def tearDownClass(cls):
        cls.temporary.cleanup()

    def test_actual_disposable_durable_receipts_pass_only_with_external_events(self):
        self.assertEqual(self.executed, ['reboot', 'poweroff'])
        harness.validate(self.proof, self.rows, self.boots, self.events)
        with self.assertRaises(AssertionError):
            harness.validate(self.proof, self.rows, self.boots, [])

    def test_wrong_request_status_receipt_or_extra_action_rejected(self):
        for kind in ('ready-only', 'duplicate', 'foreign-key', 'path', 'wrong-receipt', 'failed', 'wrong-boot'):
            rows = copy.deepcopy(self.rows)
            if kind == 'ready-only': rows[1]['status'] = 'ready'
            if kind == 'duplicate': rows.append(rows[0])
            if kind == 'foreign-key': rows[1]['key'] = 'host-api-test'
            if kind == 'path':
                request = json.loads(rows[1]['request_json']); request['path'] = '/unexpected'
                rows[1]['request_json'] = json.dumps(request)
            if kind == 'wrong-receipt': rows[1]['receipt_json'] = rows[0]['receipt_json']
            if kind == 'failed': rows[1]['command_returncode'] = 1
            if kind == 'wrong-boot': rows[1]['boot_id'] = BOOTS[0]
            with self.subTest(kind=kind), self.assertRaises(AssertionError):
                harness.validate(self.proof, rows, self.boots, self.events)

    def test_host_events_wrong_boot_wallet_or_mounts_never_imply_success(self):
        for kind in ('host-reset', 'same-boot', 'wallet', 'mount', 'uid'):
            proof, boots, events = copy.deepcopy(self.proof), copy.deepcopy(self.boots), copy.deepcopy(self.events)
            if kind == 'host-reset': events[0]['data']['guest'] = False
            if kind == 'same-boot': boots[1]['boot_id'] = BOOTS[0]
            if kind == 'wallet': proof['wallet_second']['billed_minor'] = 888
            if kind == 'mount': proof['environment_second']['root_mount'][3] = 'rw'
            if kind == 'uid': proof['environment_second']['processes']['ui']['uid'] = [0] * 4
            with self.subTest(kind=kind), self.assertRaises(AssertionError):
                harness.validate(proof, self.rows, boots, events)

    def test_read_only_database_never_creates_or_changes_state(self):
        path = self.directory / 'power.db'
        before = path.read_bytes()
        with patch.object(observer, 'DATABASE', str(path)):
            self.assertEqual(observer.records(), self.rows)
        self.assertEqual(path.read_bytes(), before)
        missing = self.directory / 'missing.db'
        with patch.object(observer, 'DATABASE', str(missing)), self.assertRaises(sqlite3.OperationalError):
            observer.records()
        self.assertFalse(missing.exists())

    def test_post_shutdown_business_counts_and_nonempty_journal_are_rejected(self):
        table_sets = {
            '/platform/hub.db': ('hub_packages', 'hub_installed', 'hub_revoked', 'hub_jobs', 'hub_audit', 'hub_requests'),
            '/wallet/wallet-simulator.db': ('wallet_journals', 'wallet_postings', 'wallet_sales', 'wallet_withdrawals', 'wallet_consents', 'wallet_bills', 'wallet_idempotency'),
            '/wallet/entitlement.db': ('accounts', 'consents', 'authorizations', 'authorization_claims', 'wallet_bindings', 'device_api_receipts', 'device_monthly_due'),
        }
        def export(_data, source, destination):
            with sqlite3.connect(destination) as db:
                for table in table_sets[source]:
                    db.execute('CREATE TABLE IF NOT EXISTS ' + table + ' (value INTEGER)')
        with tempfile.TemporaryDirectory(prefix='rock-power-business-test-') as directory:
            output = Path(directory)
            with patch.object(harness, 'export_closed_database', side_effect=export):
                self.assertEqual(set(harness.verify_business_databases(Path('unused'), output)), {'hub', 'wallet', 'membership'})
                with sqlite3.connect(output / 'observed-wallet.db') as db:
                    db.execute('INSERT INTO wallet_postings VALUES (888)')
                with self.assertRaises(AssertionError):
                    harness.verify_business_databases(Path('unused'), output)
            from subprocess import CompletedProcess
            destination = output / 'sidecar.db'
            def dump(command, **_):
                path = Path(command[2].split(' ', 2)[2])
                path.write_bytes(b'nonempty fixed test file')
                return CompletedProcess(command, 0, b'', b'')
            with patch.object(harness.subprocess, 'run', side_effect=dump), self.assertRaises(AssertionError):
                harness.export_closed_database(Path('unused'), '/fixed.db', destination)

    def test_unflagged_observer_and_host_power_commands_are_rejected(self):
        with patch.object(observer.Path, 'read_text', return_value='console=ttyAMA0'), patch.object(observer, 'observe') as run:
            with self.assertRaises(SystemExit): observer.main()
            run.assert_not_called()
        monitor = object.__new__(harness.Monitor)
        for command in ('system_reset', 'system_powerdown', 'quit', 'human-monitor-command'):
            with self.subTest(command=command), self.assertRaises(ValueError):
                monitor.command(command)


if __name__ == '__main__':
    unittest.main()

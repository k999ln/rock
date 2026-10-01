#!/usr/bin/env python3
"""Unit tests of evidence rejection logic; these fixtures are NOT OS boot proof."""
import copy
import importlib.util
import json
from pathlib import Path
import socket
import sqlite3
import struct
import tempfile
import unittest
from unittest.mock import patch


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(filename))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


guest = load('guest_evidence', 'guest-ui-evidence.py')
harness = load('native_harness', 'verify-native.py')
remote = load('remote_observer', 'guest-ui-remote-evidence.py')
PACKAGE_HASH = 'a' * 64
JOB_ID = '12345678-1234-1234-1234-123456789abc'


def fixture():
    wallet = {'simulation_only': True, 'currency': 'USD', 'monthly_fee_minor': 888,
              'available_minor': 0, 'pending_minor': 0, 'held_minor': 0, 'billed_minor': 0,
              'dispensed_minor': 0, 'ledger_balance_minor': 0, 'consent': {'accepted': False},
              'sales': [], 'withdrawals': [], 'bills': [], 'journals': []}
    key = 'ui-' + '3' * 32
    job = {'id': JOB_ID, 'key': key, 'tool_id': guest.TOOL, 'version': guest.VERSION, 'status': 'succeeded',
           'input_bytes': len(guest.INPUT.encode()), 'output': guest.OUTPUT, 'error': None, 'package_hash': PACKAGE_HASH,
           'request_hash': guest.digest({'id': guest.TOOL, 'text': guest.INPUT, 'target': 'device_local'})}
    audit_bodies = [('installed_disabled', {'id': guest.TOOL, 'version': guest.VERSION, 'hash': PACKAGE_HASH}),
                    ('enabled', {'id': guest.TOOL, 'hash': PACKAGE_HASH}),
                    ('run_approved', {'job_id': JOB_ID, 'package_hash': PACKAGE_HASH, 'execution_target': 'device_local',
                                      'actual_host': 'rock_os_linux_namespace', 'sent_to_cloud': False, 'amount_minor': 0})]
    audit = [{'seq': n + 1, 'event': event, 'body': guest.canonical(body).decode()} for n, (event, body) in enumerate(audit_bodies)]
    snapshot = {'wallet': wallet, 'hub': {'maturity': 'virtual_os_integrated', 'modes': {'device_local': 'linux_namespace_seccomp'},
                'installed': [{'id': guest.TOOL, 'version': guest.VERSION, 'hash': PACKAGE_HASH, 'enabled': 1}],
                'jobs': [job], 'audit': audit}}
    requests = [
        ({'v': 1, 'op': 'install', 'key': 'ui-' + '1' * 32, 'id': guest.TOOL, 'version': guest.VERSION},
         {'id': guest.TOOL, 'version': guest.VERSION, 'hash': PACKAGE_HASH, 'enabled': False}),
        ({'v': 1, 'op': 'approve', 'key': 'ui-' + '2' * 32, 'id': guest.TOOL, 'version': guest.VERSION, 'approved_hash': PACKAGE_HASH},
         {'id': guest.TOOL, 'enabled': True}),
        ({'v': 1, 'op': 'run', 'key': key, 'id': guest.TOOL, 'text': guest.INPUT, 'target': 'device_local'}, job),
    ]
    receipts = [{'key': request['key'], 'request_hash': guest.digest(request), 'result': guest.canonical(result).decode()}
                for request, result in requests]
    return snapshot, receipts


class FakeConnection:
    def __init__(self, frame, uid=1002):
        self.frame, self.uid, self.sent = frame, uid, []

    def __enter__(self):
        return self

    def __exit__(self, *_):
        pass

    def settimeout(self, _):
        pass

    def connect(self, path):
        if path != guest.API:
            raise AssertionError('unexpected observer endpoint')

    def getsockopt(self, *_):
        return struct.pack('3i', 123, self.uid, 1002)

    def sendall(self, data):
        self.sent.append(data)

    def recv(self, size):
        result, self.frame = self.frame[:size], self.frame[size:]
        return result


class EvidenceTests(unittest.TestCase):
    def setUp(self):
        self.snapshot, self.receipts = fixture()
        self.baseline = guest.wallet_baseline(self.snapshot['wallet'])

    def test_valid_exact_job_audit_receipts(self):
        progress = guest.check_progress(self.snapshot, self.baseline, PACKAGE_HASH)
        self.assertEqual(progress['stage'], 3)
        validated = guest.validate_receipts(self.receipts, PACKAGE_HASH, progress['job'])
        self.assertEqual(set(validated), {'install', 'approve', 'run'})

    def test_empty_fresh_and_incremental_stages_are_observed_not_success(self):
        for count in range(3):
            snapshot = copy.deepcopy(self.snapshot)
            snapshot['hub']['audit'] = snapshot['hub']['audit'][:count]
            snapshot['hub']['jobs'] = []
            if not count:
                snapshot['hub']['installed'] = []
            self.assertIsNone(guest.check_progress(snapshot, self.baseline, PACKAGE_HASH)['job'])

    def test_wrong_input_output_target_or_job_identity_rejected(self):
        changes = {'input_bytes': 0, 'request_hash': 'bad', 'output': 'fake result', 'key': 'api-test-key',
                   'package_hash': 'b' * 64, 'status': 'failed', 'tool_id': 'other.tool', 'error': 'sandbox failure'}
        for name, value in changes.items():
            with self.subTest(name=name):
                snapshot = copy.deepcopy(self.snapshot)
                snapshot['hub']['jobs'][0][name] = value
                with self.assertRaises(AssertionError):
                    guest.check_progress(snapshot, self.baseline, PACKAGE_HASH)

    def test_extra_job_and_reordered_audit_rejected(self):
        self.snapshot['hub']['jobs'] *= 2
        with self.assertRaises(AssertionError):
            guest.check_progress(self.snapshot, self.baseline, PACKAGE_HASH)
        self.snapshot, _ = fixture()
        self.snapshot['hub']['audit'][0]['seq'] = 20
        with self.assertRaises(AssertionError):
            guest.check_progress(self.snapshot, self.baseline, PACKAGE_HASH)

    def test_wallet_changes_never_count_as_tool_success(self):
        self.snapshot['wallet']['available_minor'] = 100
        with self.assertRaises(AssertionError):
            guest.check_progress(self.snapshot, self.baseline, PACKAGE_HASH)
        with self.assertRaises(AssertionError):
            guest.wallet_baseline(self.snapshot['wallet'])

    def test_missing_duplicate_conflicting_and_non_ui_receipts_rejected(self):
        invalid = [self.receipts[:2], self.receipts + self.receipts[:1], self.receipts[:2] + self.receipts[:1]]
        for name, value in [('key', 'not-ui'), ('request_hash', 'bad'), ('result', '{}')]:
            records = copy.deepcopy(self.receipts)
            records[0][name] = value
            invalid.append(records)
        for records in invalid:
            with self.subTest(records=records), self.assertRaises(AssertionError):
                guest.validate_receipts(records, PACKAGE_HASH, self.snapshot['hub']['jobs'][0])

    def test_read_only_database_does_not_create_or_change_state(self):
        with tempfile.TemporaryDirectory(prefix='rock-observer-unit-') as temporary:
            database = Path(temporary) / 'hub.db'
            with patch.object(guest, 'DATABASE', str(database)):
                with self.assertRaises(sqlite3.OperationalError):
                    guest.read_receipts()
                self.assertFalse(database.exists())
                connection = sqlite3.connect(database)
                connection.execute('CREATE TABLE hub_requests(key TEXT, request_hash TEXT, result TEXT)')
                connection.executemany('INSERT INTO hub_requests VALUES(:key,:request_hash,:result)', self.receipts)
                connection.commit()
                connection.close()
                before = database.read_bytes()
                self.assertEqual(guest.read_receipts(), self.receipts)
                self.assertEqual(database.read_bytes(), before)
                self.assertEqual(sorted(p.name for p in Path(temporary).iterdir()), ['hub.db'])

    def test_remote_refresh_receipt_requires_ready_queue_and_exact_key(self):
        key = 'ui-' + '4' * 32
        request = {'v': 1, 'op': 'registry.refresh', 'key': key}
        receipt = {'key': key, 'request_hash': guest.digest(request), 'result': guest.canonical({'accepted': True, 'operation': key}).decode()}
        row = {'key': key, 'status': 'ready', 'requested': 100, 'finished': 102, 'error': None}
        rest, verified = remote.split_receipts(self.receipts + [receipt], [row])
        self.assertEqual(rest, self.receipts)
        self.assertEqual(verified['queue'], row)
        for status in ('queued', 'running', 'error'):
            with self.subTest(status=status), self.assertRaises(AssertionError):
                remote.split_receipts(self.receipts + [receipt], [{**row, 'status': status}])
        for rows in ([], [row, row], [{**row, 'key': 'api-only'}]):
            with self.assertRaises(AssertionError):
                remote.split_receipts(self.receipts + [receipt], rows)
        with self.assertRaises(AssertionError):
            remote.split_receipts(self.receipts, [row])
        with self.assertRaises(AssertionError):
            remote.split_receipts([{**receipt, 'request_hash': 'bad'}], [row])

    def test_remote_registry_observation_is_read_only(self):
        with tempfile.TemporaryDirectory(prefix='rock-remote-observer-unit-') as temporary:
            database = Path(temporary) / 'hub.db'
            with patch.object(remote.base, 'DATABASE', str(database)):
                with self.assertRaises(sqlite3.OperationalError):
                    remote.registry_rows()
                self.assertFalse(database.exists())
                connection = sqlite3.connect(database)
                connection.execute('CREATE TABLE rock_registry_requests(key TEXT, status TEXT, requested REAL, finished REAL, error TEXT)')
                connection.execute("INSERT INTO rock_registry_requests VALUES('unit','ready',100,102,NULL)")
                connection.commit()
                connection.close()
                before = database.read_bytes()
                self.assertEqual(remote.registry_rows()[0]['status'], 'ready')
                self.assertEqual(database.read_bytes(), before)

    def test_remote_guard_cannot_write_or_poweroff_unflagged_host(self):
        with patch.object(remote.os, 'getuid', return_value=1000), patch.object(remote.base, 'persist') as persist, patch.object(remote.subprocess, 'run') as run:
            with self.assertRaises(SystemExit):
                remote.main()
            persist.assert_not_called()
            run.assert_not_called()

    def test_observer_refuses_every_mutation_before_socket_connect(self):
        with patch.object(guest.socket, 'socket') as factory:
            for op in ('install', 'approve', 'run', 'health', 'wallet.sale', 'cancel', 'job.result'):
                with self.subTest(op=op), self.assertRaises(ValueError):
                    guest.read_api(op)
            with self.assertRaises(ValueError):
                guest.read_api('job.result', '../../etc/passwd')
            factory.assert_not_called()

    @unittest.skipUnless(hasattr(socket, 'SO_PEERCRED'), 'Linux SO_PEERCRED required')
    def test_peer_uid_checked_before_request(self):
        connection = FakeConnection(b'{"ok":true}\n', uid=1001)
        with patch.object(guest.socket, 'socket', return_value=connection), self.assertRaises(AssertionError):
            guest.read_api('snapshot')
        self.assertEqual(connection.sent, [])

    @unittest.skipUnless(hasattr(socket, 'SO_PEERCRED'), 'Linux SO_PEERCRED required')
    def test_read_framing_limits_and_api_errors(self):
        for frame in (b'', b'{"ok":true}', b'{"ok":true}\n{}\n', b'{"ok":true}\0\n',
                      b'{"ok":false,"error":"unavailable"}\n', b'x' * (guest.MAX_RESPONSE + 1)):
            with self.subTest(size=len(frame)), patch.object(guest.socket, 'socket', return_value=FakeConnection(frame)), self.assertRaises(AssertionError):
                guest.read_api('snapshot')
        connection = FakeConnection(b'{"ok":true,"snapshot":{}}\n')
        with patch.object(guest.socket, 'socket', return_value=connection):
            self.assertEqual(guest.read_api('snapshot'), {'ok': True, 'snapshot': {}})
        self.assertEqual(json.loads(connection.sent[0]), {'v': 1, 'op': 'snapshot'})

    def test_guard_cannot_write_or_poweroff_unflagged_host(self):
        with patch.object(guest.os, 'getuid', return_value=1000), patch.object(guest, 'persist') as persist, patch.object(guest.subprocess, 'run') as run:
            with self.assertRaises(SystemExit):
                guest.main()
            persist.assert_not_called()
            run.assert_not_called()

    def test_serial_proof_parser_rejects_absent_or_duplicate(self):
        line = 'ROCK_UI_GUEST_PROOF {"status":"PASS"}\r\n'
        self.assertEqual(harness.parse_proof('Linux\n' + line), {'status': 'PASS'})
        for text in ('ROCK_UI_GUEST_PASS\n', line + line):
            with self.assertRaises(AssertionError):
                harness.parse_proof(text)
        with self.assertRaises(AssertionError):
            harness.validate_proof({'status': 'PASS'})

    def test_host_rechecks_full_proof_and_rejects_false_guest_pass(self):
        environment = {'network_interfaces': ['dummy0', 'lo', 'sit0'], 'hardware_network_interfaces': [],
                       'framebuffer': [720, 960], 'root_mount': ['/dev/vda', '/', 'ext4', 'ro,relatime'],
                       'data_mount': ['/dev/vdb', '/data', 'ext4', 'rw,nosuid,nodev,noexec'],
                       'processes': {role: {'uid': [uid] * 4, 'gid': [uid] * 4, 'no_new_privs': 1}
                                     for role, uid in [('ui', 1000), ('core', 1000), ('platform', 1002), ('wallet', 1003)]}}
        hub = self.snapshot['hub']
        proof = {'schema': 'rock-native-ui-proof/1', 'status': 'PASS', 'wallet': 'SIMULATOR_ONLY', 'blackberry': 'NOT_RUN',
                 'wallet_unchanged': True, 'wallet_initial': self.snapshot['wallet'], 'wallet_final': self.snapshot['wallet'],
                 'wallet_initial_sha256': self.baseline, 'wallet_final_sha256': self.baseline,
                 'expected_input': guest.INPUT, 'expected_output': guest.OUTPUT, 'capture_grace_seconds': 30,
                 'environment_initial': environment, 'environment_final': environment,
                 'tool': {'id': guest.TOOL, 'version': guest.VERSION, 'package_hash': PACKAGE_HASH},
                 'job': hub['jobs'][0], 'audit': hub['audit'], 'installed': hub['installed'],
                 'hub_maturity': hub['maturity'], 'hub_modes': hub['modes'],
                 'receipts': guest.validate_receipts(self.receipts, PACKAGE_HASH, hub['jobs'][0])}
        harness.validate_proof(proof)
        for field, value in [('status', 'FAIL'), ('wallet_unchanged', False), ('capture_grace_seconds', 0),
                             ('expected_output', 'mock'), ('receipts', {}), ('installed', []), ('hub_maturity', 'host_prototype')]:
            changed = copy.deepcopy(proof)
            changed[field] = value
            with self.subTest(field=field), self.assertRaises((AssertionError, IndexError)):
                harness.validate_proof(changed)
        for field, value in [('network_interfaces', ['eth0', 'lo']), ('hardware_network_interfaces', ['eth0']),
                             ('framebuffer', [800, 600]), ('root_mount', ['/dev/vda', '/', 'ext4', 'rw'])]:
            changed = copy.deepcopy(proof)
            changed['environment_final'][field] = value
            with self.subTest(field=field), self.assertRaises(AssertionError):
                harness.validate_proof(changed)


if __name__ == '__main__':
    unittest.main(verbosity=2)

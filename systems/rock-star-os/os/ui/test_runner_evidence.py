#!/usr/bin/env python3
"""Disposable native runner evidence guards; not actual OS/TLS GUI evidence."""
from contextlib import closing
import copy
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import sqlite3
import sys
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(ROOT / 'src'), str(ROOT / 'os')]


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


observer = load('runner_ui_unit_observer', Path(__file__).with_name('guest-ui-runner-evidence.py'))
fixtures = load('runner_ui_control_test_fixtures', ROOT / 'tests/test_os_runner_control.py')
harness = load('runner_ui_unit_harness', Path(__file__).with_name('verify-runner.py'))


class EvidenceGuards(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='rock-ui-runner-evidence-')
        root = Path(self.temp.name)
        self.package = fixtures.remote_fixture()
        self.sha = observer.base.digest(self.package)
        self.hub = fixtures.Hub(root / 'hub.db', {fixtures.TEST_PUBLISHER: fixtures.PUBLIC_TEST_KEY})
        installed = self.hub.install(self.package)
        self.hub.enable(observer.TOOL, installed['hash'])
        self.executor = fixtures.FakeExecutor()
        self.runner = fixtures.RunnerStore(root / 'runner', endpoint_id=observer.ENDPOINT, target='cloud',
            transport_evidence='pinned_tls_loopback_fixture', owners={'alice': {'token': fixtures.PUBLIC_ALICE_TOKEN, 'publishers': [fixtures.TEST_PUBLISHER]}},
            publisher_trust={fixtures.TEST_PUBLISHER: fixtures.PUBLIC_TEST_KEY}, executor=self.executor, start_worker=False)
        self.transport = fixtures.Transport(self.runner)
        client = fixtures.RunnerClient(self.transport, endpoint_id=observer.ENDPOINT, owner='alice', token=fixtures.PUBLIC_ALICE_TOKEN, attempts=1)
        self.control = fixtures.RunnerControl(self.hub, root / 'control', clients={'cloud': client}, start=False,
                                               retry_initial=0.01, retry_max=0.02, poll_seconds=0.05)
        self.first, self.second, self.cancel = 'ui-' + '1' * 32, 'ui-' + '2' * 32, 'ui-' + '3' * 32

    def tearDown(self):
        self.control.close(); self.runner.close(); self.temp.cleanup()

    def read(self):
        with patch.object(observer, 'DATABASE', str(self.control.database)):
            return observer.remote_records()

    def prepare(self, key):
        return self.control.prepare(observer.TOOL, 'cloud', observer.INPUT, key)

    def test_actual_durable_prepare_cancel_and_approval_shapes(self):
        self.prepare(self.first)
        rows, cancels = self.read()
        observer.validate_records(rows, cancels, self.sha, self.package)
        self.assertEqual(self.transport.ops, [])
        self.control.cancel(self.first, self.cancel)
        rows, cancels = self.read()
        observer.validate_records(rows, cancels, self.sha, self.package)
        self.assertEqual(self.transport.ops, [])
        second = self.prepare(self.second)
        rows, cancels = self.read()
        observer.validate_records(rows, cancels, self.sha, self.package)
        self.control.submit(self.second, second['consent'])
        rows, cancels = self.read()
        observer.validate_records(rows, cancels, self.sha, self.package)
        self.assertEqual(rows[1]['state'], 'queued')
        self.assertEqual(self.executor.calls, 0)
        self.assertEqual(self.hub.state()['jobs'], [])

    def test_changed_input_destination_and_accidental_preparation_send_rejected(self):
        self.prepare(self.first)
        rows, cancels = self.read()
        for column, value in [('send_claimed', 1), ('input_text', 'changed'), ('target', 'pc_usb'),
                              ('endpoint_id', 'other'), ('prepare_sha', '0' * 64), ('consent', '{}')]:
            with self.subTest(column=column):
                changed = copy.deepcopy(rows); changed[0][column] = value
                with self.assertRaises((AssertionError, ValueError, TypeError)):
                    observer.validate_records(changed, cancels, self.sha, self.package)
        self.assertEqual(self.transport.ops, [])

    def test_wrong_cancel_identity_and_reused_preparation_key_rejected(self):
        self.prepare(self.first); self.control.cancel(self.first, self.cancel)
        self.prepare(self.second)
        rows, cancels = self.read()
        bad = copy.deepcopy(cancels); bad[0]['cancel_key'] = self.second
        with self.assertRaises(AssertionError): observer.validate_records(rows, bad, self.sha, self.package)
        bad_rows = copy.deepcopy(rows); bad_rows[1]['key'] = self.first
        with self.assertRaises(AssertionError): observer.validate_records(bad_rows, cancels, self.sha, self.package)
        bad_rows = copy.deepcopy(rows); bad_rows[0]['package'] = json.dumps(self.package)
        with self.assertRaises(AssertionError): observer.validate_records(bad_rows, cancels, self.sha, self.package)

    def test_callback_result_cannot_claim_actual_isolated_execution(self):
        self.prepare(self.first); self.control.cancel(self.first, self.cancel)
        second = self.prepare(self.second); self.control.submit(self.second, second['consent'])
        self.control.process_one()
        def callback(_text, _recipe, _cancel):
            self.executor.calls += 1
            return observer.OUTPUT, {'kind': 'fake_callback', 'socket_syscall_denied': True, 'wallet_path_visible': False}
        with patch.object(self.executor, 'execute', side_effect=callback): self.runner.tick()
        with closing(self.control.connect()) as db, db:
            db.execute('UPDATE remote_jobs SET next_attempt=0')
        self.control.process_one()
        rows, cancels = self.read()
        self.assertEqual(rows[1]['state'], 'succeeded')
        with self.assertRaises(AssertionError): observer.validate_records(rows, cancels, self.sha, self.package)
        self.assertEqual(self.executor.calls, 1)

    def test_fixed_database_reads_close_and_never_create_or_modify(self):
        self.prepare(self.first)
        before = self.control.database.read_bytes()
        for _ in range(3): self.read()
        self.assertEqual(self.control.database.read_bytes(), before)
        missing = Path(self.temp.name) / 'does-not-exist.db'
        with patch.object(observer, 'DATABASE', str(missing)), self.assertRaises(sqlite3.OperationalError): observer.remote_records()
        self.assertFalse(missing.exists())
        with patch.object(observer, 'observe') as observe, patch.object(observer.Path, 'read_text', return_value='console=ttyAMA0'):
            with self.assertRaises(SystemExit): observer.main()
            observe.assert_not_called()

    def test_unapproved_or_changed_exact_consent_is_not_an_accepted_job(self):
        self.prepare(self.first); self.control.cancel(self.first, self.cancel)
        second = self.prepare(self.second); self.control.submit(self.second, second['consent'])
        rows, cancels = self.read()
        for value in (None, json.dumps({**second['consent'], 'approved': False}), json.dumps({**second['consent'], 'input_sha256': '0' * 64})):
            changed = copy.deepcopy(rows); changed[1]['consent'] = value
            with self.assertRaises((AssertionError, TypeError)):
                observer.validate_records(changed, cancels, self.sha, self.package)


class HarnessGuards(unittest.TestCase):
    def test_terminal_erasure_and_bound_executor_records(self):
        # Explicit synthetic contract fixtures; this does not prove real execution.
        first, key = 'ui-' + 'a' * 32, 'ui-' + 'b' * 32
        package = fixtures.remote_fixture()
        expected = {'v': 1, 'op': 'submit', 'endpoint_id': observer.ENDPOINT, 'key': key,
                    'package': package, 'text': observer.INPUT, 'consent': observer.expected_consent(key, observer.base.digest(package))}
        digest = observer.base.digest(expected)
        execution = {'kind': 'actual_linux_isolated_process', 'socket_syscall_denied': True, 'wallet_path_visible': False}
        rows = [{'key': key, 'state': 'succeeded', 'request_json': None, 'request_sha256': digest,
                 'execution_json': json.dumps(execution), 'output_json': json.dumps(observer.OUTPUT)}]
        calls = [{'status': 'succeeded', 'input_sha256': hashlib.sha256(observer.INPUT.encode()).hexdigest(),
                  'output_sha256': hashlib.sha256(observer.OUTPUT.encode()).hexdigest(), 'execution': execution}]
        dropped = [{'key': key, 'request_sha256': digest, 'after_durable_acceptance': True}]
        proof = {'remote_rows': [{'key': first}, {'key': key, 'remote_status': json.dumps({'output': observer.OUTPUT, 'execution': execution})}]}
        harness.validate_execution(rows, calls, dropped, [], proof, package)
        for field, value in [('request_json', json.dumps(expected)), ('request_sha256', '0' * 64), ('output_json', '"wrong"')]:
            altered = copy.deepcopy(rows); altered[0][field] = value
            with self.assertRaises(AssertionError): harness.validate_execution(altered, calls, dropped, [], proof, package)
        altered_calls = copy.deepcopy(calls); altered_calls[0]['input_sha256'] = '0' * 64
        with self.assertRaises(AssertionError): harness.validate_execution(rows, altered_calls, dropped, [], proof, package)
        with self.assertRaises(AssertionError): harness.validate_execution(rows, calls * 2, dropped, [], proof, package)
        with self.assertRaises(AssertionError): harness.validate_execution(rows, calls, dropped, [{'key': first}], proof, package)

    def test_cleanup_failure_does_not_skip_remaining_owned_resources(self):
        monitor = SimpleNamespace(close=Mock(side_effect=OSError('unit monitor close failure')))
        server = SimpleNamespace(shutdown=Mock(side_effect=RuntimeError('unit shutdown failure')), server_close=Mock())
        thread = SimpleNamespace(is_alive=Mock(return_value=True), join=Mock())
        runner = SimpleNamespace(close=Mock(side_effect=RuntimeError('unit live worker')))
        guest, registry = object(), object()
        log = SimpleNamespace(close=Mock())
        with patch.object(harness.owned, 'stop') as stop:
            errors = harness.cleanup_owned(monitor, guest, server, thread, runner, registry, log)
            self.assertEqual(stop.call_args_list[0].args, (guest,))
            self.assertEqual(stop.call_args_list[1].args, (registry,))
        self.assertEqual([item['resource'] for item in errors], ['monitor', 'runner-server-shutdown', 'runner-store'])
        server.server_close.assert_called_once(); thread.join.assert_called_once(); log.close.assert_called_once()

    def test_late_guest_validation_error_always_persists_failure(self):
        def late_failure(report):
            report['status'] = 'PASS'
            raise AssertionError('unit late process identity failure')
        with patch.object(observer.os, 'getuid', return_value=0), patch.object(observer.os, 'geteuid', return_value=0), \
             patch.object(observer.os, 'uname', return_value=SimpleNamespace(machine='aarch64')), \
             patch.object(observer.Path, 'read_text', return_value='rock.ui.runner.verify=1'), \
             patch.object(observer, 'observe', side_effect=late_failure), patch.object(observer.base, 'PROOF'), \
             patch.object(observer.base, 'persist') as persist, patch.object(observer.base, 'emit') as emit, \
             patch.object(observer.os, 'sync'), patch.object(observer.subprocess, 'run'):
            self.assertEqual(observer.main(), 1)
        self.assertEqual(persist.call_args.args[0]['status'], 'FAIL')
        self.assertEqual(emit.call_args_list[-1].args, ('ROCK_UI_RUNNER_FAIL',))


if __name__ == '__main__':
    unittest.main()

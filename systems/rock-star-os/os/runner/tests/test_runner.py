"""Boundary tests label fake execution separately from real TLS/Unix transport."""
from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
import copy
import hashlib
import json
import os
from pathlib import Path
import socket
import sqlite3
import ssl
import struct
import tempfile
import threading
import time
import unittest
from unittest.mock import patch

from blackberryrock.packages import PUBLIC_TEST_KEY, TEST_PUBLISHER, REMOTE_CONTRACT, canonical
from blackberryrock.sdk import sign_development, starter
from runner.client import RunnerClient, consent_for
from runner.protocol import (AuthenticationError, MAX_WIRE, PUBLIC_ALICE_TOKEN, PUBLIC_BOB_TOKEN,
                             RunnerError, TransportError, decode, digest, read_frame, sign_request,
                             sign_response, verify_response, write_frame)
from runner.server import Handler, TLSRunnerServer, UnixRunnerServer
from runner.store import RunnerStore
from runner.transport import DeadlineSocket, HTTPSRunnerTransport, UnixRunnerTransport

ROOT = Path(__file__).resolve().parents[1]
PROJECT = ROOT.parents[1]
CA = PROJECT / 'os/registry/fixtures/development-ca.pem'
TLS_KEY = PROJECT / 'os/registry/fixtures/PUBLIC-FIXTURE-KEY.pem'
TRUST = {TEST_PUBLISHER: PUBLIC_TEST_KEY}
OWNERS = {'alice': {'token': PUBLIC_ALICE_TOKEN, 'publishers': [TEST_PUBLISHER]},
          'bob': {'token': PUBLIC_BOB_TOKEN, 'publishers': [TEST_PUBLISHER]}}
PACKAGE = None


def package(targets=None):
    global PACKAGE
    if PACKAGE is None:
        source = starter('org.rockstar.remote-text', recipe=[{'op': 'trim_lines'}], schema_version=2)
        source['manifest'].update(schema_version=3, execution_targets=['cloud', 'pc_usb'],
                                  permissions=['text.input', 'text.output', 'execution.remote'],
                                  data={'input': 'user_supplied_text', 'destinations': ['cloud', 'pc_usb']},
                                  remote=REMOTE_CONTRACT.copy())
        PACKAGE = sign_development(source)
    if targets is None:
        return copy.deepcopy(PACKAGE)
    source = copy.deepcopy(PACKAGE)
    source['manifest']['execution_targets'] = targets
    source['manifest']['data']['destinations'] = [t for t in targets if t != 'device_local']
    return sign_development(source)


class FakeExecutor:
    def __init__(self):
        self.calls = 0
        self.entered, self.release = threading.Event(), threading.Event()
        self.block = False
        self.fail = None
        self.output = None

    def execute(self, text, recipe, cancel):
        self.calls += 1
        self.entered.set()
        if self.block:
            deadline = time.monotonic() + 3
            while not self.release.wait(0.01):
                if cancel.is_set():
                    raise RunnerError('fake callback cancelled')
                if time.monotonic() > deadline:
                    raise RunnerError('fake test timed out')
        if self.fail:
            raise self.fail
        return self.output if self.output is not None else '\n'.join(line.strip() for line in text.split('\n')), {'kind': 'fake_callback', 'physical_usb': 'NOT_RUN'}


class DirectTransport:
    def __init__(self, store):
        self.store, self.target, self.evidence = store, store.target, store.transport_evidence
        self.ops = []
        self.drop = set()

    def exchange(self, envelope):
        op = envelope['request']['op']
        self.ops.append(op)
        result = self.store.dispatch(envelope, transport_target=self.target, transport_evidence=self.evidence)
        if op in self.drop:
            self.drop.remove(op)
            raise TransportError('test dropped committed response')
        return result


class RunnerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.executor = FakeExecutor()
        self.store = self.make_store()
        self.transport = DirectTransport(self.store)
        self.client = self.make_client(self.transport)
        self.pkg = package()

    def make_store(self, target='cloud', directory=None, **kwargs):
        return RunnerStore(directory or self.root / 'state', endpoint_id='runner-fixture', target=target,
                           transport_evidence='pinned_tls_loopback_fixture' if target == 'cloud' else 'authenticated_unix_fixture',
                           owners=OWNERS, publisher_trust=TRUST, executor=self.executor, start_worker=False, **kwargs)

    def make_client(self, transport, owner='alice', **kwargs):
        return RunnerClient(transport, endpoint_id='runner-fixture', owner=owner, token=OWNERS[owner]['token'], **kwargs)

    def submit(self, key='one', text='  hello  ', pkg=None, client=None):
        client = client or self.client
        pkg = pkg or self.pkg
        consent = consent_for(pkg, text, target=client.transport.target, endpoint_id=client.endpoint_id, key=key)
        return client.submit(pkg, text, key, consent=consent)

    def tearDown(self):
        self.executor.release.set()
        self.store.close()
        self.temp.cleanup()

    def test_fake_callback_is_labelled_and_input_erased_at_terminal(self):
        receipt = self.submit()
        self.assertTrue(receipt['accepted'])
        self.assertEqual(self.client.status('one')['state'], 'queued')
        self.store.tick()
        result = self.client.status('one')
        self.assertEqual((result['state'], result['output']), ('succeeded', 'hello'))
        self.assertEqual(result['execution']['kind'], 'fake_callback')
        with closing(self.store.connect()) as db:
            self.assertIsNone(db.execute('SELECT request_json FROM jobs').fetchone()[0])
            with self.assertRaises(sqlite3.IntegrityError):
                db.execute("UPDATE jobs SET request_json='replacement'")
        self.assertEqual(self.submit(), receipt)
        self.store.tick()
        self.assertEqual(self.executor.calls, 1)

    def test_same_key_conflict_concurrent_submit_and_tick_execute_once(self):
        with ThreadPoolExecutor(max_workers=6) as pool:
            receipts = list(pool.map(lambda _: self.submit(), range(6)))
        self.assertTrue(all(r == receipts[0] for r in receipts))
        with self.assertRaisesRegex(RunnerError, 'different'):
            self.submit(text='other')
        with ThreadPoolExecutor(max_workers=4) as pool:
            list(pool.map(lambda _: self.store.tick(), range(4)))
        self.assertEqual(self.executor.calls, 1)

    def test_lost_submit_response_reconciles_status_without_resubmission(self):
        self.transport.drop.add('submit')
        receipt = self.submit()
        self.assertEqual(self.transport.ops, ['submit', 'status'])
        self.assertTrue(receipt['accepted'])
        self.store.tick()
        self.assertEqual(self.executor.calls, 1)

    def test_owner_scopes_status_cancel_and_key_independently(self):
        self.submit()
        bob = self.make_client(self.transport, 'bob')
        self.assertFalse(bob.status('one')['found'])
        self.assertFalse(bob.cancel('one')['found'])
        self.submit(client=bob, text='bob')
        self.store.tick(); self.store.tick()
        self.assertEqual(bob.status('one')['output'], 'bob')
        self.assertEqual(self.client.status('one')['output'], 'hello')

    def test_wrong_owner_token_or_signed_request_tamper_denied(self):
        request = self.client._request('status', 'one')
        for envelope in (sign_request('alice', 'wrong', request), sign_request('unknown', PUBLIC_ALICE_TOKEN, request)):
            with self.assertRaises(AuthenticationError):
                self.transport.exchange(envelope)
        forged = sign_request('alice', PUBLIC_ALICE_TOKEN, request)
        forged['request']['op'] = 'cancel'
        with self.assertRaises(AuthenticationError):
            self.transport.exchange(forged)

    def test_response_authentication_and_request_binding(self):
        request = self.client._request('status', 'one')
        response = sign_response(PUBLIC_ALICE_TOKEN, request, {'ok': True, 'result': {'found': False}})
        response['response']['result']['found'] = True
        with self.assertRaises(TransportError):
            verify_response(PUBLIC_ALICE_TOKEN, request, response)
        response = sign_response(PUBLIC_ALICE_TOKEN, {**request, 'key': 'other'}, {'ok': True})
        with self.assertRaises(TransportError):
            verify_response(PUBLIC_ALICE_TOKEN, request, response)

    def test_local_only_and_signature_tamper_rejected_before_any_transmission(self):
        local = sign_development(starter())
        for pkg in (local, {**self.pkg, 'signature': '0' * 128}):
            with self.assertRaises(ValueError):
                self.submit(pkg=pkg)
        self.assertEqual(self.transport.ops, [])
        self.assertEqual(self.executor.calls, 0)

    def test_server_rejects_local_only_even_with_forged_client_approval(self):
        local = sign_development(starter())
        request = self.client._request('submit', 'one', package=local, text='x',
                                      consent=consent_for(local, 'x', target='cloud', endpoint_id='runner-fixture', key='one'))
        with self.assertRaisesRegex(RunnerError, 'remote target'):
            self.client._exchange(request)
        self.assertFalse(self.client.status('one')['found'])

    def test_consent_binds_every_field_and_boolean_type(self):
        consent = consent_for(self.pkg, 'x', target='cloud', endpoint_id='runner-fixture', key='one')
        for field in consent:
            wrong = {**consent, field: False if field == 'approved' else 'changed'}
            with self.assertRaises(RunnerError):
                self.client.submit(self.pkg, 'x', 'one', consent=wrong)
        with self.assertRaises(RunnerError):
            self.client.submit(self.pkg, 'x', 'one', consent={**consent, 'approved': 1})
        self.assertEqual(self.transport.ops, [])

    def test_target_comes_from_listener_and_unknown_fields_rejected(self):
        request = self.client._request('status', 'one')
        envelope = sign_request('alice', PUBLIC_ALICE_TOKEN, request)
        with self.assertRaisesRegex(RunnerError, 'transport'):
            self.store.dispatch(envelope, transport_target='pc_usb', transport_evidence='authenticated_unix_fixture')
        for extras in ({'actual_target': 'pc_usb'}, {'path': '/data/wallet'}, {'url': 'https://example.com'}, {'owner': 'bob'}):
            with self.assertRaisesRegex(RunnerError, 'unknown fields'):
                self.client._exchange({**request, **extras})

    def test_publishers_trust_revocations_and_owner_approval(self):
        self.store.owners['alice']['publishers'] = set()
        with self.assertRaisesRegex(RunnerError, 'publisher'):
            self.submit()
        self.store.owners['alice']['publishers'] = {TEST_PUBLISHER}
        self.store.trust = {}
        with self.assertRaisesRegex(RunnerError, 'trusted'):
            self.submit()
        self.store.trust = TRUST.copy()
        self.store.revoke(TEST_PUBLISHER)
        with self.assertRaisesRegex(RunnerError, 'revoked'):
            self.submit()
        with closing(self.store.connect()) as db:
            with self.assertRaises(sqlite3.IntegrityError):
                db.execute('DELETE FROM revocations')

    def test_revocation_after_queue_prevents_dispatch_and_survives_restart(self):
        self.submit()
        self.store.revoke(self.pkg['manifest']['id'] + '@1.0.0')
        self.store.close()
        self.store = self.make_store()
        self.transport.store = self.store
        self.store.tick()
        self.assertEqual(self.client.status('one')['state'], 'failed')
        self.assertEqual(self.executor.calls, 0)

    def test_cancel_queued_lost_response_and_repeat_does_not_execute(self):
        self.submit()
        self.transport.drop.add('cancel')
        result = self.client.cancel('one')
        self.assertEqual(result['state'], 'cancelled')
        self.assertEqual(self.client.cancel('one')['state'], 'cancelled')
        self.store.tick()
        self.assertEqual(self.executor.calls, 0)

    def test_cancel_running_has_persisted_intent_and_bounded_callback_stop(self):
        self.executor.block = True
        self.submit()
        thread = threading.Thread(target=self.store.tick)
        thread.start()
        self.assertTrue(self.executor.entered.wait(2))
        result = self.client.cancel('one')
        self.assertTrue(result['cancel_requested'])
        thread.join(2)
        self.assertFalse(thread.is_alive())
        result = self.client.status('one')
        self.assertEqual((result['state'], result['output']), ('cancelled', None))
        self.assertEqual(self.executor.calls, 1)

    def test_running_revocation_requests_cancellation(self):
        self.executor.block = True
        self.submit()
        thread = threading.Thread(target=self.store.tick)
        thread.start()
        self.assertTrue(self.executor.entered.wait(2))
        self.store.revoke(TEST_PUBLISHER)
        thread.join(2)
        self.assertEqual(self.client.status('one')['state'], 'cancelled')

    def test_restart_queued_resumes_but_dispatched_becomes_indeterminate(self):
        self.submit(key='queued')
        self.submit(key='running')
        with closing(self.store.connect()) as db, db:
            db.execute("UPDATE jobs SET state='running' WHERE key='running'")
        self.store.close()
        self.store = self.make_store()
        self.transport.store = self.store
        self.assertEqual(self.client.status('running')['state'], 'indeterminate')
        self.store.tick()
        self.assertEqual(self.client.status('queued')['state'], 'succeeded')
        self.assertEqual(self.executor.calls, 1)

    def test_completion_sqlite_failure_never_redispatches_or_falsely_succeeds(self):
        self.submit()
        with closing(self.store.connect()) as db, db:
            db.execute("CREATE TRIGGER fault BEFORE UPDATE ON jobs WHEN NEW.state='succeeded' BEGIN SELECT RAISE(ABORT,'disk fault'); END")
        with self.assertRaises(sqlite3.Error):
            self.store.tick()
        self.assertEqual(self.client.status('one')['state'], 'running')
        self.store.tick()
        self.assertEqual(self.client.status('one')['state'], 'indeterminate')
        self.assertEqual(self.executor.calls, 1)

    def test_predispatch_sqlite_failure_does_not_call_executor_then_recovers(self):
        self.submit()
        with closing(self.store.connect()) as db, db:
            db.execute("CREATE TRIGGER fault BEFORE UPDATE ON jobs WHEN NEW.state='running' BEGIN SELECT RAISE(ABORT,'disk fault'); END")
        with self.assertRaises(sqlite3.Error):
            self.store.tick()
        self.assertEqual(self.executor.calls, 0)
        with closing(self.store.connect()) as db, db:
            db.execute('DROP TRIGGER fault')
        self.store.tick()
        self.assertEqual(self.executor.calls, 1)

    def test_input_output_boundaries_and_exception_not_success(self):
        self.submit(text='a' * 65536)
        with self.assertRaisesRegex(RunnerError, '64 KiB'):
            self.submit(key='large', text='é' * 32769)
        self.executor.output = 'b' * 131073
        self.store.tick()
        self.assertEqual(self.client.status('one')['state'], 'failed')
        self.executor.output = None
        self.executor.fail = RuntimeError('explicit fake failure')
        self.submit(key='error')
        self.store.tick()
        self.assertEqual(self.client.status('error')['state'], 'failed')

    def test_retained_receipt_quota_and_service_singleton(self):
        self.store.max_jobs = 1
        self.submit()
        with self.assertRaisesRegex(RunnerError, 'capacity'):
            self.submit(key='two')
        with self.assertRaises(BlockingIOError):
            self.make_store()

    def test_worker_temporary_database_error_visible_and_recovers(self):
        self.submit()
        connect = self.store.connect
        count = [0]
        def failing():
            count[0] += 1
            if count[0] <= 2:
                raise sqlite3.OperationalError('temporary fault')
            return connect()
        with patch.object(self.store, 'connect', failing):
            self.store.start()
            deadline = time.monotonic() + 3
            observed = False
            while time.monotonic() < deadline:
                observed |= self.store.worker_error is not None
                if self.executor.calls:
                    break
                time.sleep(0.01)
        self.assertTrue(observed)
        self.assertEqual(self.executor.calls, 1)


    def test_client_revocation_is_checked_before_transmission(self):
        self.client.revoked = {TEST_PUBLISHER}
        with self.assertRaisesRegex(ValueError, 'revoked'):
            self.submit()
        self.assertEqual(self.transport.ops, [])

    def test_server_consent_validation_cannot_be_bypassed_with_raw_protocol(self):
        pkg = self.pkg
        consent = consent_for(pkg, 'old input', target='cloud', endpoint_id='runner-fixture', key='one')
        request = self.client._request('submit', 'one', package=pkg, text='changed input', consent=consent)
        with self.assertRaisesRegex(RunnerError, 'consent'):
            self.client._exchange(request)
        self.assertFalse(self.client.status('one')['found'])

    def test_revocation_commit_followed_by_cancel_db_fault_still_discards_output(self):
        self.executor.block = True
        self.submit()
        thread = threading.Thread(target=self.store.tick)
        thread.start()
        self.assertTrue(self.executor.entered.wait(2))
        with closing(self.store.connect()) as db, db:
            db.execute("CREATE TRIGGER fault BEFORE UPDATE OF cancel_requested ON jobs WHEN NEW.state='running' BEGIN SELECT RAISE(ABORT,'cancel disk fault'); END")
        with self.assertRaises(sqlite3.Error):
            self.store.revoke(TEST_PUBLISHER)
        self.executor.release.set()
        thread.join(2)
        result = self.client.status('one')
        self.assertEqual((result['state'], result['output']), ('cancelled', None))
        self.assertTrue(result['cancel_requested'])

    def test_wrong_transport_state_binding_does_not_leak_instance_lock(self):
        self.store.close()
        with self.assertRaisesRegex(RunnerError, 'another transport'):
            self.make_store(target='pc_usb')
        self.store = self.make_store()
        self.transport.store = self.store
        self.submit()

    def test_worker_thread_death_recovers_without_reexecuting_running(self):
        self.executor.fail = SystemExit('simulated worker thread death')
        self.submit()
        self.store.start()
        self.store.worker.join(2)
        self.assertFalse(self.store.worker.is_alive())
        self.assertEqual(self.client.status('one')['state'], 'running')
        self.executor.fail = None
        self.store.start()
        deadline = time.monotonic() + 2
        while self.client.status('one')['state'] == 'running' and time.monotonic() < deadline:
            time.sleep(0.01)
        self.assertEqual(self.client.status('one')['state'], 'indeterminate')
        self.assertEqual(self.executor.calls, 1)



class CutHandler(Handler):
    def respond(self, status, raw):
        fault = getattr(self.server, 'fault', None)
        if fault in {'redirect', 'oversize'}:
            self.send_response(302 if fault == 'redirect' else 200)
            self.send_header('Content-Length', '0' if fault == 'redirect' else str(MAX_WIRE + 1))
            self.send_header('Location', 'https://example.com/untrusted')
            self.send_header('Connection', 'close')
            self.end_headers()
            self.close_connection = True
            return
        if fault == 'tamper':
            value = json.loads(raw)
            value['auth'] = '0' * 64
            raw = canonical(value)
        if getattr(self.server, 'cut_once', False):
            self.server.cut_once = False
            self.send_response(status)
            self.send_header('Content-Length', str(len(raw)))
            self.send_header('Connection', 'close')
            self.end_headers()
            self.wfile.write(raw[:len(raw) // 2])
            self.close_connection = True
            return
        super().respond(status, raw)


class TLSTests(unittest.TestCase):
    setUpBase = RunnerTests.setUp
    make_store = RunnerTests.make_store
    make_client = RunnerTests.make_client
    submit = RunnerTests.submit
    # Shared setup helpers; only the methods below claim real TLS transport.
    def setUp(self):
        self.setUpBase()
        self.server = TLSRunnerServer(('127.0.0.1', 0), self.store, CA, TLS_KEY, CutHandler)
        self.thread = threading.Thread(target=self.server.serve_forever, kwargs={'poll_interval': 0.01}, daemon=True)
        self.thread.start()
        self.real_transport = HTTPSRunnerTransport(f'https://127.0.0.1:{self.server.server_port}', CA, timeout=2)
        self.real_client = self.make_client(self.real_transport)

    def tearDown(self):
        self.server.shutdown(); self.server.server_close(); self.thread.join(2)
        RunnerTests.tearDown(self)

    def test_real_tls_cut_submit_response_status_reconciliation(self):
        self.server.cut_once = True
        receipt = self.submit(client=self.real_client)
        self.assertTrue(receipt['accepted'])
        self.store.tick()
        result = self.real_client.status('one')
        self.assertEqual(result['state'], 'succeeded')
        self.assertEqual(result['receipt']['transport_evidence'], 'pinned_tls_loopback_fixture')
        self.assertEqual(result['execution']['kind'], 'fake_callback')
        self.assertEqual(self.executor.calls, 1)

    def test_real_tls_wrong_body_auth_and_origin_rejected(self):
        client = RunnerClient(self.real_transport, endpoint_id='runner-fixture', owner='alice', token='bad', attempts=1)
        with self.assertRaises(TransportError):
            client.status('one')
        with self.assertRaises(TransportError):
            HTTPSRunnerTransport('https://example.com:9444', CA)
        with self.assertRaises(RunnerError):
            TLSRunnerServer(('0.0.0.0', 0), self.store, CA, TLS_KEY)


    def test_real_tls_pinned_ca_rejects_system_roots_only(self):
        self.real_transport.context = ssl.create_default_context()
        client = self.make_client(self.real_transport, attempts=1)
        with self.assertRaisesRegex(TransportError, 'HTTPS'):
            client.status('one')

    def test_real_tls_redirect_oversize_and_response_tampering_rejected(self):
        client = self.make_client(self.real_transport, attempts=1)
        for fault in ('redirect', 'oversize', 'tamper'):
            self.server.fault = fault
            with self.assertRaises(TransportError):
                client.status('one')



class UnixTests(unittest.TestCase):
    def test_real_unix_framed_submit_scope_and_no_physical_usb_claim(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            executor = FakeExecutor()
            store = RunnerStore(root / 'state', endpoint_id='pc-fixture', target='pc_usb', transport_evidence='authenticated_unix_fixture',
                                owners=OWNERS, publisher_trust=TRUST, executor=executor, start_worker=False)
            server = UnixRunnerServer(root / 'socket/runner.sock', store)
            thread = threading.Thread(target=server.serve_forever, daemon=True); thread.start()
            try:
                client = RunnerClient(UnixRunnerTransport(server.path), endpoint_id='pc-fixture', owner='alice', token=PUBLIC_ALICE_TOKEN)
                pkg = package()
                receipt = client.submit(pkg, ' x ', 'job', consent=consent_for(pkg, ' x ', target='pc_usb', endpoint_id='pc-fixture', key='job'))
                self.assertEqual(receipt['transport_evidence'], 'authenticated_unix_fixture')
                self.assertEqual(receipt['physical_usb'], 'NOT_RUN')
                store.tick()
                self.assertEqual(client.status('job')['output'], 'x')
                self.assertEqual(client.status('job')['execution']['kind'], 'fake_callback')
            finally:
                server.shutdown(); thread.join(2); server.server_close(); store.close()

    def test_frame_limits_truncation_duplicate_fields_and_deadline(self):
        for raw in (b'\x00\x10\x00\x01', struct.pack('!I', 9) + b'{}', struct.pack('!I', 13) + b'{"a":1,"a":2}'):
            left, right = socket.socketpair()
            with left, right:
                left.sendall(raw); left.shutdown(socket.SHUT_WR)
                with self.assertRaises(RunnerError):
                    read_frame(DeadlineSocket(right, 0.05))
        left, right = socket.socketpair()
        with left, right:
            with self.assertRaises((RunnerError, TimeoutError)):
                read_frame(DeadlineSocket(right, 0.05))


if __name__ == '__main__':
    unittest.main()

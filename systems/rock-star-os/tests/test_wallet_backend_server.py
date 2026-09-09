"""Disposable TLS fixtures only; never a live device, copied ledger or real funds."""
from concurrent.futures import ThreadPoolExecutor
import http.client
import importlib.util
import json
import os
from pathlib import Path
import socket
import ssl
import tempfile
import threading
import time
import unittest
import uuid
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('wallet_backend_server_test', ROOT / 'os/wallet_backend/server.py')
backend = importlib.util.module_from_spec(spec)
spec.loader.exec_module(backend)


class WalletBackendServerTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='rock-wallet-backend-test-')
        self.addCleanup(self.tmp.cleanup)
        self.state = Path(self.tmp.name) / 'authority'
        self.now = 1788856800
        self.server = backend.WalletBackendServer(('127.0.0.1', 0), self.state,
            start_scheduler=False, clock=lambda: self.now, timeout=1, authentication_required=False)
        self.thread = threading.Thread(target=self.server.serve_forever, kwargs={'poll_interval': 0.01})
        self.thread.start()
        self.addCleanup(self.stop)
        self.context = ssl.create_default_context(cafile=str(backend.FIXTURES / 'development-ca.pem'))

    def stop(self):
        if self.thread.is_alive():
            self.server.shutdown()
            self.thread.join(3)
        self.server.server_close()

    def call(self, request, *, token=backend.PUBLIC_OWNER_TOKEN, path='/v1/wallet', authority_id='expected'):
        conn = http.client.HTTPSConnection('127.0.0.1', self.server.server_port, context=self.context, timeout=3)
        try:
            headers = {'Content-Type': 'application/json'}
            if token is not None:
                headers['Authorization'] = 'Bearer ' + token
            if authority_id is not None:
                headers[backend.AUTHORITY_HEADER] = self.server.authority_id if authority_id == 'expected' else authority_id
            conn.request('POST', path, body=json.dumps(request).encode(), headers=headers)
            reply = conn.getresponse()
            raw = reply.read()
            self.assertEqual('close', reply.getheader('Connection'))
            self.assertEqual('no-store', reply.getheader('Cache-Control'))
            self.assertEqual([self.server.authority_id], reply.headers.get_all(backend.AUTHORITY_HEADER))
            return reply.status, json.loads(raw)
        finally:
            conn.close()

    def raw(self, headers, body=b'', method='POST'):
        with socket.create_connection(('127.0.0.1', self.server.server_port), timeout=3) as raw:
            with self.context.wrap_socket(raw, server_hostname='127.0.0.1') as connection:
                connection.sendall((method+' /v1/wallet HTTP/1.1\r\nHost: localhost\r\n'+headers+'\r\n').encode()+body)
                response = http.client.HTTPResponse(connection)
                response.begin()
                self.assertEqual([self.server.authority_id], response.headers.get_all(backend.AUTHORITY_HEADER))
                return response.status, response.read()

    def headers(self, count):
        return ('Authorization: Bearer '+backend.PUBLIC_OWNER_TOKEN+'\r\nContent-Type: application/json\r\n'
                +backend.AUTHORITY_HEADER+': '+self.server.authority_id+'\r\n'
                +'Content-Length: '+str(count)+'\r\n')

    def registered(self):
        status, response = self.call({'v': 1, 'op': 'wallet.register', 'key': 'register-once'})
        self.assertEqual(status, 200)
        self.assertTrue(response['ok'])
        return response

    def test_tls_reads_reuse_existing_service_and_do_not_create_consent(self):
        status, reply = self.call({'v': 1, 'op': 'snapshot'})
        self.assertEqual(status, 200)
        self.assertTrue(reply['snapshot']['simulation_only'])
        self.assertEqual(0, reply['snapshot']['available_minor'])
        self.assertFalse(reply['snapshot']['membership']['registered'])
        self.assertEqual((200, {'ok': True, 'result': {'ready': True, 'simulation_only': True}}),
                         self.call({'v': 1, 'op': 'health'}))

    def test_authentication_rejects_missing_other_role_and_duplicate_header_before_dispatch(self):
        with patch.object(self.server.service, 'dispatch', side_effect=AssertionError('must not dispatch')):
            for token in (None, 'wrong', backend.PUBLIC_TOKENS['bob'], backend.PUBLIC_TOKENS['wallet']):
                status, reply = self.call({'v': 1, 'op': 'snapshot'}, token=token)
                self.assertEqual(status, 401)
                self.assertEqual(reply['code'], 'unauthorized')
            status, _ = self.raw(self.headers(2)+'Authorization: Bearer '+backend.PUBLIC_OWNER_TOKEN+'\r\n', b'{}')
            self.assertEqual(status, 401)

    def test_http_owner_cannot_mint_settle_or_assert_atm_even_with_extra_identity(self):
        blocked = ('wallet.sale', 'wallet.settle', 'wallet.reserve', 'wallet.dispense', 'wallet.unknown',
                   'wallet.reconcile', 'atm.redeem', 'atm.dispense', 'atm.reconcile', 'wallet.atm.expire_due',
                   'tick', 'provision', 'wallet-bridge', 'device.poweroff')
        with patch.object(self.server.service, 'dispatch', side_effect=AssertionError('must not dispatch')):
            for op in blocked:
                status, reply = self.call({'v': 1, 'op': op, 'key': 'blocked', 'peer_uid': 0})
                self.assertEqual(status, 403, op)
                self.assertEqual(reply['code'], 'unauthorized')
            for field in ('owner_id', 'device_ref', 'peer_uid', 'token', 'actor'):
                self.assertEqual(400, self.call({'v': 1, 'op': 'snapshot', field: 'forged'})[0])

    def test_authority_pin_missing_wrong_and_duplicate_rejected_before_dispatch(self):
        with patch.object(self.server.service, 'dispatch', side_effect=AssertionError('must not dispatch')):
            for identity in (None, str(uuid.uuid4()), self.server.authority_id.upper()):
                status, reply = self.call({'v': 1, 'op': 'wallet.register', 'key': 'never-register'}, authority_id=identity)
                self.assertEqual((403, 'unauthorized'), (status, reply['code']))
            status, raw = self.raw(self.headers(2)+backend.AUTHORITY_HEADER+': '+self.server.authority_id+'\r\n', b'{}')
            self.assertEqual((403, 'unauthorized'), (status, json.loads(raw)['code']))
        self.assertFalse(self.call({'v': 1, 'op': 'wallet.membership'})[1]['result']['registered'])

    def test_fresh_authorities_have_distinct_persistent_uuid4_identity(self):
        identity = self.server.authority_id
        self.assertEqual(4, uuid.UUID(identity).version)
        stored = json.loads((self.state / 'AUTHORITY.json').read_bytes())
        self.assertEqual(identity, stored['authority_id'])
        with backend.WalletBackendServer(('127.0.0.1', 0), Path(self.tmp.name) / 'other',
                                         start_scheduler=False, authentication_required=False) as other:
            self.assertNotEqual(identity, other.authority_id)
        self.stop()
        with backend.WalletBackendServer(('127.0.0.1', 0), self.state, start_scheduler=False, authentication_required=False) as restarted:
            self.assertEqual(identity, restarted.authority_id)

    def test_strict_json_duplicate_nonfinite_nonobject_and_boolean_version(self):
        bodies = (b'{"v":1,"v":1,"op":"snapshot"}', b'{"v":1,"op":"snapshot","nested":{"a":1,"a":2}}',
                  b'{"v":NaN,"op":"snapshot"}', b'[]', b'{"v":true,"op":"snapshot"}', b'{}{}', b'\xff')
        with patch.object(self.server.service, 'dispatch', side_effect=AssertionError('must not dispatch')):
            for body in bodies:
                status, raw = self.raw(self.headers(len(body)), body)
                self.assertEqual(status, 400)
                self.assertEqual(json.loads(raw)['code'], 'rejected')

    def test_ambiguous_http_framing_method_path_and_request_size_are_rejected(self):
        body = b'{"v":1,"op":"snapshot"}'
        invalid = (self.headers(len(body))+'Content-Length: '+str(len(body))+'\r\n',
                   self.headers(len(body))+'Transfer-Encoding: chunked\r\n',
                   self.headers(len(body))+'Content-Type: application/json\r\n',
                   self.headers(len(body))+'Expect: 100-continue\r\n')
        for headers in invalid:
            self.assertEqual(400, self.raw(headers, body)[0])
        self.assertEqual(413, self.raw(self.headers(65537))[0])
        self.assertEqual(413, self.raw(self.headers(0))[0])
        self.assertEqual(400, self.call({'v': 1, 'op': 'snapshot'}, path='/v1/wallet?owner=bob')[0])
        self.assertEqual(501, self.raw(self.headers(0), method='GET')[0])

    def test_registration_replay_and_same_key_conflict_are_durable(self):
        first = self.registered()
        self.assertEqual((200, first), self.call({'v': 1, 'op': 'wallet.register', 'key': 'register-once'}))
        status, changed = self.call({'v': 1, 'op': 'wallet.consent', 'key': 'register-once',
                                     'accepted': True, 'terms_version': 'simulator-monthly-usd-8.88-v1'})
        self.assertEqual(status, 400)
        self.assertEqual(changed['code'], 'rejected')
        self.assertFalse(self.call({'v': 1, 'op': 'wallet.membership'})[1]['result']['entitlement']['auto_renew'])
        self.stop()
        restarted = backend.WalletBackendServer(('127.0.0.1', 0), self.state,
                                                start_scheduler=False, clock=lambda: self.now, authentication_required=False)
        try:
            self.assertEqual(first, restarted.service.dispatch({'v': 1, 'op': 'wallet.register', 'key': 'register-once'}, peer_uid=1002))
        finally:
            restarted.server_close()

    def test_scheduler_uses_one_existing_ledger_and_owner_billing_acceptance_is_not_payment(self):
        self.registered()
        service = self.server.service
        sale = service.dispatch({'v': 1, 'op': 'wallet.sale', 'key': 'local-fixture-credit', 'amount_minor': 2000}, peer_uid=1002)
        service.dispatch({'v': 1, 'op': 'wallet.settle', 'key': 'local-fixture-settle', 'id': sale['result']['id']}, peer_uid=1002)
        self.call({'v': 1, 'op': 'wallet.consent', 'key': 'consent', 'accepted': True,
                   'terms_version': 'simulator-monthly-usd-8.88-v1'})
        request = {'v': 1, 'op': 'wallet.bill', 'key': 'bill', 'period': '2026-09'}
        accepted = self.call(request)
        self.assertTrue(accepted[1]['result']['accepted'])
        self.assertEqual(0, service.wallet.snapshot()['billed_minor'])
        service.membership.tick()
        service.membership.tick()
        self.assertEqual(accepted, self.call(request))
        state = self.call({'v': 1, 'op': 'snapshot'})[1]['snapshot']
        self.assertEqual((1112, 888, 1), (state['available_minor'], state['billed_minor'], len(state['bills'])))
        self.assertEqual('paid', state['billing']['history'][0]['status'])
        self.call({'v': 1, 'op': 'wallet.consent', 'key': 'cancel', 'accepted': False,
                   'terms_version': 'simulator-monthly-usd-8.88-v1'})
        self.assertFalse(self.call({'v': 1, 'op': 'wallet.membership'})[1]['result']['entitlement']['auto_renew'])

    def test_owner_atm_issue_status_cancel_reuses_protected_context(self):
        self.registered()
        service = self.server.service
        sale = service.dispatch({'v': 1, 'op': 'wallet.sale', 'key': 'atm-fixture-credit', 'amount_minor': 2000}, peer_uid=1002)
        service.dispatch({'v': 1, 'op': 'wallet.settle', 'key': 'atm-fixture-settle', 'id': sale['result']['id']}, peer_uid=1002)
        request = {'v': 1, 'op': 'wallet.atm.issue', 'key': 'issue', 'amount_minor': 1000, 'atm_id': 'SIM-ATM-001'}
        issued = self.call(request)
        self.assertEqual(issued, self.call(request))
        self.assertEqual('immutable_issuance', issued[1]['result']['receipt_kind'])
        withdrawal = issued[1]['result']['withdrawal_id']
        status = self.call({'v': 1, 'op': 'wallet.atm.status', 'withdrawal_id': withdrawal})[1]['result']
        self.assertTrue(status['code_usable'])
        canceled = self.call({'v': 1, 'op': 'wallet.atm.cancel', 'key': 'cancel-atm', 'withdrawal_id': withdrawal})
        self.assertEqual('CANCELED', canceled[1]['result']['state'])
        self.assertEqual(2000, service.wallet.snapshot()['available_minor'])

    def test_atm_invalid_amount_and_insufficient_funds_are_definite_rejections(self):
        self.registered()
        before = self.server.service.wallet.snapshot()
        for amount in (True, 999, 1000):
            request = {'v': 1, 'op': 'wallet.atm.issue', 'key': 'rejected-'+str(amount),
                       'amount_minor': amount, 'atm_id': 'SIM-ATM-001'}
            status, reply = self.call(request)
            self.assertEqual((400, 'rejected'), (status, reply['code']))
            self.assertNotIn('retry_with_same_key', reply)
        self.assertEqual(before, self.server.service.wallet.snapshot())
        history = self.call({'v': 1, 'op': 'wallet.atm.history', 'limit': 50})[1]['result']
        self.assertEqual(0, history['total'])

    def test_concurrent_same_key_registration_has_one_receipt_and_identity(self):
        request = {'v': 1, 'op': 'wallet.register', 'key': 'concurrent'}
        with ThreadPoolExecutor(max_workers=6) as pool:
            replies = list(pool.map(lambda _: self.call(request), range(6)))
        self.assertTrue(all(reply == replies[0] for reply in replies))
        self.assertEqual(200, replies[0][0])
        with self.server.service.membership.store._transaction() as db:
            self.assertEqual(1, db.execute('SELECT COUNT(*) FROM device_api_receipts').fetchone()[0])

    def test_unknown_post_commit_error_is_unavailable_and_same_key_recovers(self):
        request = {'v': 1, 'op': 'wallet.register', 'key': 'lost-after-commit'}
        original = self.server.service.dispatch
        committed = []
        def lose(value, **kwargs):
            committed.append(original(value, **kwargs))
            raise OSError('PRIVATE-PAYLOAD-MUST-NOT-LEAK')
        with patch.object(self.server.service, 'dispatch', side_effect=lose):
            status, reply = self.call(request)
        self.assertEqual(status, 503)
        self.assertEqual(reply['code'], 'unavailable')
        self.assertTrue(reply['retry_with_same_key'])
        self.assertNotIn('PRIVATE-PAYLOAD', json.dumps(reply))
        self.assertEqual((200, committed[0]), self.call(request))

    def test_response_size_bound_keeps_unknown_semantics(self):
        with patch.object(self.server.service, 'dispatch', return_value={'ok': True, 'result': 'x' * backend.MAX_RESPONSE}):
            status, reply = self.call({'v': 1, 'op': 'wallet.register', 'key': 'large'})
        self.assertEqual((503, 'unavailable', True), (status, reply['code'], reply['retry_with_same_key']))

    def test_singleton_loopback_and_nonmigration_state_guards(self):
        with self.assertRaises((BlockingIOError, OSError)):
            backend.WalletBackendServer(('127.0.0.1', 0), self.state, start_scheduler=False, authentication_required=False)
        for address in ('0.0.0.0', '10.0.2.2', '::1', 'example.org'):
            with self.assertRaises(ValueError):
                backend.WalletBackendServer((address, 0), Path(self.tmp.name) / 'forbidden', authentication_required=False)
        old = Path(self.tmp.name) / 'old-device'
        old.mkdir(mode=0o700)
        (old / 'wallet-simulator.db').write_bytes(b'not a migrated database')
        with self.assertRaisesRegex(ValueError, 'refuse device-state import'):
            backend.WalletBackendServer(('127.0.0.1', 0), old, start_scheduler=False, authentication_required=False)
        self.assertEqual(b'not a migrated database', (old / 'wallet-simulator.db').read_bytes())
        self.assertEqual({'wallet-simulator.db'}, {path.name for path in old.iterdir()})

    def test_existing_unsafe_storage_rejected_before_sqlite_or_external_file_changes(self):
        self.stop()
        outside = Path(self.tmp.name) / 'untouched'
        outside.write_bytes(b'UNTOUCHED external file')
        outside.chmod(0o600)
        saved = (self.state / 'wallet-simulator.db').read_bytes()
        for name in ('wallet-simulator.db', 'entitlement.db-wal', 'entitlement.db-journal', 'device.lock'):
            path = self.state / name
            original = path.read_bytes() if path.exists() else None
            if path.exists():
                path.unlink()
            try:
                for kind in ('symlink', 'hardlink', 'fifo', 'public'):
                    with self.subTest(name=name, kind=kind):
                        if kind == 'symlink':
                            path.symlink_to(outside)
                        elif kind == 'hardlink':
                            os.link(outside, path)
                        elif kind == 'fifo':
                            os.mkfifo(path, 0o600)
                        else:
                            path.write_bytes(b'public storage')
                            path.chmod(0o644)
                        with patch.object(backend.platform_service, 'WalletService', side_effect=AssertionError('must not open SQLite')):
                            with self.assertRaisesRegex(ValueError, 'invalid private authority storage'):
                                backend.WalletBackendServer(('127.0.0.1', 0), self.state, start_scheduler=False, authentication_required=False)
                        self.assertEqual(b'UNTOUCHED external file', outside.read_bytes())
                        path.unlink()
            finally:
                if path.exists() or path.is_symlink():
                    path.unlink()
                if original is not None:
                    path.write_bytes(original)
                    path.chmod(0o600)
        self.assertEqual(saved, (self.state / 'wallet-simulator.db').read_bytes())

    def test_marker_corruption_or_alias_is_rejected_before_service_start(self):
        self.stop()
        marker = self.state / 'AUTHORITY.json'
        saved = marker.read_bytes()
        malformed = (b'{}', b'{"authority_id":"wrong"}', saved[:-2]+b',"owner":"alice"}\n')
        for value in malformed:
            marker.write_bytes(value)
            with patch.object(backend.platform_service, 'WalletService', side_effect=AssertionError('must not start')):
                with self.assertRaisesRegex(ValueError, 'invalid authority marker'):
                    backend.WalletBackendServer(('127.0.0.1', 0), self.state, start_scheduler=False, authentication_required=False)
        marker.unlink()
        os.mkfifo(marker, 0o600)
        with self.assertRaisesRegex(ValueError, 'invalid authority marker'):
            backend.WalletBackendServer(('127.0.0.1', 0), self.state, start_scheduler=False, authentication_required=False)
        marker.unlink()
        marker.write_bytes(saved)
        marker.chmod(0o600)
        with backend.WalletBackendServer(('127.0.0.1', 0), self.state, start_scheduler=False, authentication_required=False) as restarted:
            self.assertEqual(self.server.authority_id, restarted.authority_id)

    def test_listener_failure_releases_singleton_and_preserves_original_error(self):
        state = Path(self.tmp.name) / 'failed-bind'
        with patch.object(backend.HTTPServer, 'server_bind', side_effect=OSError('controlled bind failure')):
            with self.assertRaisesRegex(OSError, 'controlled bind failure'):
                backend.WalletBackendServer(('127.0.0.1', 0), state, start_scheduler=False, authentication_required=False)
        with backend.WalletBackendServer(('127.0.0.1', 0), state, authentication_required=False) as restarted:
            worker = restarted.service.membership.thread
            self.assertTrue(worker.is_alive())
        self.assertFalse(worker.is_alive())

    def test_absolute_deadline_expires_slow_partial_body_and_returns_slot(self):
        self.server.request_timeout = 0.15
        with socket.create_connection(('127.0.0.1', self.server.server_port), timeout=2) as raw:
            with self.context.wrap_socket(raw, server_hostname='127.0.0.1') as connection:
                connection.sendall(('POST /v1/wallet HTTP/1.1\r\nHost: localhost\r\n'+self.headers(20)+'\r\n').encode()+b'{')
                start = time.monotonic()
                response = connection.recv(4096)
                self.assertLess(time.monotonic()-start, 1)
                self.assertEqual(b'', response)
        self.server.request_timeout = 1
        self.assertEqual(200, self.call({'v': 1, 'op': 'health'})[0])

    def test_complete_frame_expiring_during_validation_never_starts_dispatch(self):
        self.server.request_timeout = 0.1
        release = threading.Event()
        original = backend.validate_request
        def delayed(request):
            value = original(request)
            release.wait(2)
            return value
        with patch.object(backend, 'validate_request', side_effect=delayed):
            with patch.object(self.server.service, 'dispatch', side_effect=AssertionError('must not dispatch')) as dispatch:
                try:
                    with self.assertRaises((OSError, http.client.HTTPException)):
                        self.call({'v': 1, 'op': 'wallet.register', 'key': 'expired'})
                finally:
                    release.set()
                deadline = time.monotonic()+2
                while self.server.connection_deadlines and time.monotonic() < deadline:
                    time.sleep(0.005)
                self.assertFalse(self.server.connection_deadlines)
                dispatch.assert_not_called()

    def test_twelve_slots_include_tls_handshakes_and_reject_thirteenth(self):
        connections = [socket.create_connection(('127.0.0.1', self.server.server_port), timeout=2) for _ in range(12)]
        try:
            deadline = time.monotonic()+0.8
            while len(self.server.connection_deadlines) < 12 and time.monotonic() < deadline:
                time.sleep(0.005)
            self.assertEqual(12, len(self.server.connection_deadlines))
            with socket.create_connection(('127.0.0.1', self.server.server_port), timeout=2) as extra:
                self.assertEqual(b'', extra.recv(1))
            self.assertEqual(12, len(self.server.connection_deadlines))
        finally:
            for connection in connections:
                connection.close()


if __name__ == '__main__':
    unittest.main()

"""Real localhost TLS and disposable SQLite; only signed public device fixtures.

No provider, device image, migrated production ledger or actual money is used.
Fixture credit and fulfillment events enter the private authority directly;
owner HTTP is never allowed to mint either eligibility or balance.
"""
from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
import copy
import hashlib
import http.client
import importlib.util
import json
import os
from pathlib import Path
import socket
import sqlite3
import ssl
import tempfile
import threading
import time
import unittest
from unittest.mock import patch

from entitlement.protocol import TERMS_VERSION, sign_fixture_event

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('wallet_backend_multi_device_test', ROOT / 'os/wallet_backend/server.py')
backend = importlib.util.module_from_spec(spec)
spec.loader.exec_module(backend)
A, B = 'fixture-rock-arm64-001', 'fixture-rock-arm64-002'
TOKENS = {A: backend.PUBLIC_OWNER_TOKEN, B: backend.PUBLIC_SECOND_DEVICE_TOKEN}


class WalletBackendMultiDeviceTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='rock-wallet-two-device-')
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.state = self.root / 'authority'
        self.config = self.root / 'devices.json'
        self.now = 1788856800
        self.sequences = {A: 1}
        self.server = self.thread = None
        self.write_config()
        self.context = ssl.create_default_context(cafile=str(backend.FIXTURES / 'development-ca.pem'))
        self.start()
        self.addCleanup(self.stop)

    def document(self, refs=(A, B)):
        return {'schema_version': 1, 'kind': 'public-development-device-credentials', 'devices': [
            {'device_ref': ref, 'owner_actor': 'alice', 'token': TOKENS[ref]} for ref in refs]}

    def write_config(self, value=None):
        self.config.write_bytes(json.dumps(value if value is not None else self.document()).encode())
        self.config.chmod(0o600)

    def start(self, *, bound=True, state=None):
        self.server = backend.WalletBackendServer(('127.0.0.1', 0), state or self.state,
            device_credentials_file=self.config if bound else None,
            start_scheduler=False, clock=lambda: self.now, timeout=3, authentication_required=False)
        self.thread = threading.Thread(target=self.server.serve_forever, kwargs={'poll_interval': 0.01})
        self.thread.start()

    def stop(self):
        if self.thread is not None and self.thread.is_alive():
            self.server.shutdown()
            self.thread.join(5)
        if self.server is not None:
            self.server.server_close()

    def call(self, request, *, device=A, token='expected', path='/v2/wallet', authority='expected', headers=None):
        values = {'Content-Type': 'application/json'}
        if device is not None:
            values[backend.DEVICE_HEADER] = device
        if token is not None:
            values['Authorization'] = 'Bearer ' + (TOKENS.get(device, '') if token == 'expected' else token)
        if authority is not None:
            values[backend.AUTHORITY_HEADER] = self.server.authority_id if authority == 'expected' else authority
        values.update(headers or {})
        conn = http.client.HTTPSConnection('127.0.0.1', self.server.server_port, context=self.context, timeout=5)
        try:
            conn.request('POST', path, body=json.dumps(request).encode(), headers=values)
            reply = conn.getresponse()
            result = json.loads(reply.read())
            self.assertEqual([self.server.authority_id], reply.headers.get_all(backend.AUTHORITY_HEADER))
            if reply.status == 200 and path == '/v2/wallet':
                self.assertEqual([device], reply.headers.get_all(backend.DEVICE_HEADER))
            self.assertEqual('no-store', reply.getheader('Cache-Control'))
            return reply.status, result
        finally:
            conn.close()

    def raw(self, extra_headers):
        body = b'{"v":1,"op":"health"}'
        headers = ('POST /v2/wallet HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/json\r\n'
                   + 'Content-Length: ' + str(len(body)) + '\r\nAuthorization: Bearer ' + TOKENS[A] + '\r\n'
                   + backend.AUTHORITY_HEADER + ': ' + self.server.authority_id + '\r\n'
                   + backend.DEVICE_HEADER + ': ' + A + '\r\n' + extra_headers + '\r\n')
        with socket.create_connection(('127.0.0.1', self.server.server_port), timeout=5) as wire:
            with self.context.wrap_socket(wire, server_hostname='127.0.0.1') as tls:
                tls.sendall(headers.encode() + body)
                reply = http.client.HTTPResponse(tls)
                reply.begin()
                return reply.status, json.loads(reply.read())

    def event(self, ref=B, kind='handoff', *, owner='alice', valid_until=None):
        sequence = self.sequences.get(ref, 0) + 1
        self.sequences[ref] = sequence
        payload = {'device_ref': ref}
        if kind != 'suspend':
            payload.update(verification_ref='fixture-verification-' + ref, verified_at=self.now,
                           valid_until=valid_until or self.now + 90 * 86400)
        if kind == 'handoff':
            payload.update(owner_ref='fixture-owner-' + owner, purchase_ref='fixture-purchase-' + ref)
        event = sign_fixture_event('fulfillment', f'event-{ref}-{sequence}', 'device:' + ref,
                                   sequence, self.now, kind, payload)
        return self.server.service.membership.store.ingest(event)

    def register(self, device=A, key=None, path='/v2/wallet'):
        status, result = self.call({'v': 1, 'op': 'wallet.register', 'key': key or 'register-' + device},
                                   device=device, path=path)
        self.assertEqual((200, True), (status, result.get('ok')), result)
        return result

    def seed(self, amount=5000):
        service = self.server.service
        sale = service.dispatch({'v': 1, 'op': 'wallet.sale', 'amount_minor': amount, 'key': 'private-seed'}, peer_uid=1002)
        service.dispatch({'v': 1, 'op': 'wallet.settle', 'id': sale['result']['id'], 'key': 'private-settle'}, peer_uid=1002)

    def rows(self, table):
        with closing(sqlite3.connect(self.state / 'entitlement.db')) as db:
            return db.execute('SELECT * FROM ' + table + ' ORDER BY rowid').fetchall()

    def test_two_tls_devices_share_one_registration_contract_and_one_monthly_debit(self):
        self.event()
        with ThreadPoolExecutor(max_workers=2) as pool:
            registrations = list(pool.map(self.register, (A, B)))
        self.assertEqual(registrations[0]['result']['account_id'], registrations[1]['result']['account_id'])
        self.assertEqual(1, len(self.rows('accounts')))
        self.assertEqual(2, len(self.rows('account_devices')))
        for device in (A, B):
            membership = self.call({'v': 1, 'op': 'wallet.membership'}, device=device)[1]['result']
            self.assertFalse(membership['entitlement']['auto_renew'])
        self.seed()
        consent = {'v': 1, 'op': 'wallet.consent', 'key': 'consent-a', 'accepted': True, 'terms_version': TERMS_VERSION}
        self.assertTrue(self.call(consent)[1]['ok'])
        self.assertTrue(self.call({'v': 1, 'op': 'wallet.membership'}, device=B)[1]['result']['entitlement']['auto_renew'])
        def bill(device):
            request = {'v': 1, 'op': 'wallet.bill', 'period': '2026-09', 'key': 'bill-' + device}
            result = self.call(request, device=device)
            self.server.service.membership.tick()
            return result
        with ThreadPoolExecutor(max_workers=4) as pool:
            replies = list(pool.map(bill, (A, B, A, B)))
        self.assertTrue(all(status == 200 and response['ok'] for status, response in replies), replies)
        wallet = self.server.service.wallet.snapshot()
        self.assertEqual((4112, 888, 1), (wallet['available_minor'], wallet['billed_minor'], len(wallet['bills'])))
        self.assertEqual(1, len(self.rows('authorizations')))
        self.assertEqual(1, len(self.rows('device_monthly_due')))
        cancel = {'v': 1, 'op': 'wallet.consent', 'key': 'cancel-b', 'accepted': False, 'terms_version': TERMS_VERSION}
        self.assertTrue(self.call(cancel, device=B)[1]['ok'])
        self.assertFalse(self.call({'v': 1, 'op': 'wallet.membership'})[1]['result']['entitlement']['auto_renew'])

    def test_mapping_alone_does_not_mint_handoff_or_account(self):
        with patch.object(self.server.service, 'dispatch', side_effect=AssertionError('not admitted')):
            for request in ({'v': 1, 'op': 'health'}, {'v': 1, 'op': 'snapshot'},
                            {'v': 1, 'op': 'wallet.register', 'key': 'no-handoff'}):
                status, reply = self.call(request, device=B)
                self.assertEqual((403, 'unauthorized'), (status, reply['code']))
        self.assertEqual([], self.rows('accounts'))
        self.event()
        self.assertEqual(200, self.call({'v': 1, 'op': 'snapshot'}, device=B)[0])
        self.assertEqual([], self.rows('accounts'))

    def test_revoked_device_cannot_read_or_replay_while_second_device_works(self):
        self.event()
        original = self.register()
        self.register(B)
        self.event(A, 'suspend')
        before = self.rows('device_api_receipts')
        for request in ({'v': 1, 'op': 'health'}, {'v': 1, 'op': 'snapshot'}, {'v': 1, 'op': 'wallet.membership'},
                        {'v': 1, 'op': 'wallet.register', 'key': 'register-' + A}):
            status, reply = self.call(request)
            self.assertEqual((403, 'unauthorized'), (status, reply['code']))
        self.assertEqual(before, self.rows('device_api_receipts'))
        self.assertEqual(200, self.call({'v': 1, 'op': 'snapshot'}, device=B)[0])
        status, denied = self.call({'v': 1, 'op': 'wallet.register', 'key': 'register-' + A}, device=B)
        self.assertFalse(denied['ok'])
        self.assertIn(status, (200, 400))
        self.event(A, 'restore')
        self.assertEqual((200, original), self.call({'v': 1, 'op': 'wallet.register', 'key': 'register-' + A}))

    def test_wrong_signed_owner_and_expired_device_are_denied_before_dispatch(self):
        self.event(owner='bob')
        with patch.object(self.server.service, 'dispatch', side_effect=AssertionError('not admitted')):
            self.assertEqual(403, self.call({'v': 1, 'op': 'health'}, device=B)[0])
            self.now = 1796601600
            self.assertEqual(403, self.call({'v': 1, 'op': 'health'})[0])

    def test_wrong_token_header_authority_and_legacy_endpoint_do_not_dispatch(self):
        self.event()
        with patch.object(self.server.service, 'dispatch', side_effect=AssertionError('not admitted')):
            for options in ({'device': None}, {'device': 'fixture-unknown'}, {'token': TOKENS[B]},
                            {'device': B, 'token': TOKENS[A]}, {'token': backend.PUBLIC_TOKENS['bob']}, {'token': None}):
                self.assertEqual(401, self.call({'v': 1, 'op': 'health'}, **options)[0])
            self.assertEqual(403, self.call({'v': 1, 'op': 'health'}, authority=None)[0])
            self.assertEqual(403, self.call({'v': 1, 'op': 'health'}, authority='wrong')[0])
            self.assertEqual(403, self.call({'v': 1, 'op': 'health'}, path='/v1/wallet')[0])
            for header in (backend.DEVICE_HEADER + ': ' + A, 'Authorization: Bearer ' + TOKENS[A]):
                self.assertEqual(401, self.raw(header + '\r\n')[0])
            self.assertEqual(403, self.raw(backend.AUTHORITY_HEADER + ': ' + self.server.authority_id + '\r\n')[0])

    def test_owner_cannot_mint_or_supply_protected_device_context(self):
        with patch.object(self.server.service, 'dispatch', side_effect=AssertionError('not admitted')):
            for op in ('wallet.sale', 'wallet.settle', 'wallet.reserve', 'atm.redeem', 'atm.dispense', 'provision'):
                self.assertEqual(403, self.call({'v': 1, 'op': op, 'key': 'blocked'})[0])
            for field in ('owner_actor', 'device_ref', 'peer_uid', 'token'):
                self.assertEqual(400, self.call({'v': 1, 'op': 'snapshot', field: B})[0])

    def test_unknown_commit_replay_is_same_receipt_but_always_reauthorizes(self):
        request = {'v': 1, 'op': 'wallet.register', 'key': 'lost-response'}
        dispatch, committed = self.server.service.dispatch, []
        def lose(value, **kwargs):
            committed.append(dispatch(value, **kwargs))
            raise OSError('PRIVATE CONTENT')
        with patch.object(self.server.service, 'dispatch', side_effect=lose):
            status, reply = self.call(request)
        self.assertEqual((503, 'unavailable', True), (status, reply['code'], reply['retry_with_same_key']))
        self.assertNotIn('PRIVATE CONTENT', json.dumps(reply))
        self.assertEqual((200, committed[0]), self.call(request))
        self.event(A, 'suspend')
        self.assertEqual(403, self.call(request)[0])
        self.assertEqual(1, len(self.rows('device_api_receipts')))

    def test_signed_suspend_waits_for_same_store_admitted_action(self):
        entered, release, suspended = threading.Event(), threading.Event(), threading.Event()
        dispatch = self.server.service.dispatch
        def delayed(value, **kwargs):
            entered.set()
            if not release.wait(2):
                raise RuntimeError('test gate timeout')
            return dispatch(value, **kwargs)
        def suspend():
            self.event(A, 'suspend')
            suspended.set()
        with ThreadPoolExecutor(max_workers=2) as pool:
            with patch.object(self.server.service, 'dispatch', side_effect=delayed):
                call = pool.submit(self.call, {'v': 1, 'op': 'wallet.register', 'key': 'before-suspend'})
                self.assertTrue(entered.wait(2))
                revoke = pool.submit(suspend)
                try:
                    self.assertFalse(suspended.wait(0.1))
                finally:
                    release.set()
                self.assertTrue(call.result(timeout=3)[1]['ok'])
                revoke.result(timeout=3)
        self.assertEqual(403, self.call({'v': 1, 'op': 'snapshot'})[0])

    def test_legacy_upgrade_preserves_uuid_balance_hold_and_existing_receipts(self):
        self.stop()
        self.state = self.root / 'legacy'
        self.start(bound=False)
        registration = self.register(key='legacy-registration', path='/v1/wallet')
        self.seed()
        self.server.service.dispatch({'v': 1, 'op': 'wallet.reserve', 'key': 'legacy-hold', 'amount_minor': 1000}, peer_uid=1002)
        wallet = self.server.service.wallet.snapshot()
        receipts = self.rows('device_api_receipts')
        identity = self.server.authority_id
        self.stop()
        self.start()
        self.assertEqual(identity, self.server.authority_id)
        self.assertEqual(wallet, self.server.service.wallet.snapshot())
        self.assertEqual(receipts, self.rows('device_api_receipts'))
        self.assertEqual((200, registration), self.call({'v': 1, 'op': 'wallet.register', 'key': 'legacy-registration'}))
        self.event()
        self.assertEqual(registration['result']['account_id'], self.register(B)['result']['account_id'])
        self.assertEqual(wallet, self.server.service.wallet.snapshot())
        self.assertTrue(json.loads((self.state / 'AUTHORITY.json').read_bytes())['device_bound'])

    def test_missing_or_removed_config_cannot_downgrade_bound_authority(self):
        self.stop()
        identity = json.loads((self.state / 'AUTHORITY.json').read_bytes())['authority_id']
        with patch.object(backend.platform_service, 'WalletService', side_effect=AssertionError('must not initialize')):
            with self.assertRaisesRegex(ValueError, 'requires its device credentials'):
                backend.WalletBackendServer(('127.0.0.1', 0), self.state, start_scheduler=False, authentication_required=False)
        self.start()
        self.assertEqual(identity, self.server.authority_id)
        self.stop()
        (self.state / backend.DEVICE_MARKER).unlink()
        with patch.object(backend.platform_service, 'WalletService', side_effect=AssertionError('must not initialize')):
            with self.assertRaisesRegex(ValueError, 'history is missing'):
                self.start()

    def test_append_only_restart_adds_device_without_replacing_existing_binding(self):
        self.stop()
        self.state = self.root / 'append-only'
        self.write_config(self.document((A,)))
        self.start()
        original, identity = self.register(), self.server.authority_id
        self.stop()
        self.write_config()
        self.start()
        self.assertEqual(identity, self.server.authority_id)
        self.assertEqual((200, original), self.call({'v': 1, 'op': 'wallet.register', 'key': 'register-' + A}))
        self.assertEqual(403, self.call({'v': 1, 'op': 'health'}, device=B)[0])
        self.event()
        self.assertEqual(original['result']['account_id'], self.register(B)['result']['account_id'])
        self.stop()
        marker = (self.state / backend.DEVICE_MARKER).read_bytes()
        changes = [self.document((A,)), self.document()]
        changes[1]['devices'][0]['token'] += '-changed'
        for change in changes:
            self.write_config(change)
            with self.assertRaisesRegex(ValueError, 'append-only'):
                self.start()
            self.assertEqual(marker, (self.state / backend.DEVICE_MARKER).read_bytes())

    def test_credentials_are_strict_bounded_and_protected_before_service_initialization(self):
        self.stop()
        invalid = []
        for field, value in (('owner_actor', 'bob'), ('token', 'not-public'), ('device_ref', 'not-fixture')):
            doc = self.document()
            doc['devices'][0][field] = value
            invalid.append(doc)
        duplicate_ref, duplicate_token = self.document(), self.document()
        duplicate_ref['devices'][1]['device_ref'] = A
        duplicate_token['devices'][1]['token'] = TOKENS[A]
        invalid += [duplicate_ref, duplicate_token, {**self.document(), 'extra': True},
                    {**self.document(), 'schema_version': True}, {**self.document(), 'devices': []},
                    {**self.document(), 'devices': self.document()['devices'] * 17}]
        with patch.object(backend.platform_service, 'WalletService', side_effect=AssertionError('must not initialize')):
            for doc in invalid:
                self.write_config(doc)
                with self.subTest(doc=doc), self.assertRaises((ValueError, backend.EntitlementError)):
                    self.start()
            for raw in (b'{"schema_version":1,"schema_version":1}', b'x' * (backend.MAX_REQUEST + 1)):
                self.config.write_bytes(raw)
                with self.assertRaises(ValueError):
                    self.start()
            self.write_config()
            self.config.chmod(0o666)
            with self.assertRaises(ValueError):
                self.start()
            self.config.chmod(0o600)
            actual = self.root / 'actual-config'
            self.config.rename(actual)
            self.config.symlink_to(actual)
            with self.assertRaises(OSError):
                self.start()
            self.config.unlink()
            os.link(actual, self.config)
            with self.assertRaises(ValueError):
                self.start()

    def test_private_marker_contains_only_hashed_tokens_and_reordered_config_is_equivalent(self):
        marker = (self.state / backend.DEVICE_MARKER).read_bytes()
        value = json.loads(marker)
        self.assertEqual(self.server.authority_id, value['authority_id'])
        for row in value['devices']:
            self.assertEqual(hashlib.sha256(TOKENS[row['device_ref']].encode()).hexdigest(), row['token_sha256'])
        self.assertNotIn(b'PUBLIC-FIXTURE-', marker)
        self.stop()
        self.write_config(self.document((B, A)))
        self.start()
        self.assertEqual(marker, (self.state / backend.DEVICE_MARKER).read_bytes())

    def test_interrupted_upgrade_before_authority_flag_never_falls_back_and_same_config_recovers(self):
        self.stop()
        self.state = self.root / 'interrupted'
        self.start(bound=False)
        identity = self.server.authority_id
        self.stop()
        original = backend.WalletBackendServer._write_private_marker
        def interrupted(server, path, value):
            if path.name == 'AUTHORITY.json':
                raise OSError('fixture interrupted second marker commit')
            return original(server, path, value)
        with patch.object(backend.WalletBackendServer, '_write_private_marker', interrupted):
            with self.assertRaises(OSError):
                self.start()
        self.assertTrue((self.state / backend.DEVICE_MARKER).is_file())
        with self.assertRaisesRegex(ValueError, 'requires its device credentials'):
            backend.WalletBackendServer(('127.0.0.1', 0), self.state, start_scheduler=False, authentication_required=False)
        self.start()
        self.assertEqual(identity, self.server.authority_id)
        self.assertTrue(json.loads((self.state / 'AUTHORITY.json').read_bytes())['device_bound'])


if __name__ == '__main__':
    unittest.main()

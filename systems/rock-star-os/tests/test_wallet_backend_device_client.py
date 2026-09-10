"""Bound-device proxy/cache tests; HTTP objects are mocked, no TLS/VM claim."""
from contextlib import closing
import copy
from email.message import Message
import hashlib
import io
import json
from pathlib import Path
import sqlite3
import sys
import tempfile
import unittest
from unittest.mock import Mock, patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'os'))

from blackberryrock.packages import canonical
from wallet_backend import client
from wallet_backend.client import BackendUnavailable, NotSent, RemoteWalletService
from test_wallet_backend_client import (AUTHORITY_ID, DEVICE_REF, TERMS_VERSION,
                                        FakeAuthorityTransport)


class BoundAuthorityTransport(FakeAuthorityTransport):
    def __init__(self, device_ref=DEVICE_REF):
        super().__init__(hashlib.sha256(('synthetic-device-bound:' + device_ref).encode()).hexdigest())
        self.device_ref = device_ref
        self.denied = False
        self.snapshot_reply_once = None

    def exchange(self, request):
        if self.offline is None and self.denied:
            self.calls.append(copy.deepcopy(request))
            return {'ok': False, 'code': 'unauthorized', 'error': 'synthetic device revoked'}
        if self.offline is None and request['op'] == 'snapshot' and self.snapshot_reply_once is not None:
            self.calls.append(copy.deepcopy(request))
            result, self.snapshot_reply_once = self.snapshot_reply_once, None
            return copy.deepcopy(result)
        return super().exchange(request)


class WalletBackendDeviceClientTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.state = self.root / 'cache'
        self.now = 1788856800.0
        self.transport = BoundAuthorityTransport()
        self.service = self.open_service()
        self.addCleanup(lambda: self.service.close())
        self.token_file = self.root / 'public-token'
        self.token_file.write_text('PUBLIC-FIXTURE-OWNER-TOKEN-DEVICE-CLIENT-v1')
        self.token_file.chmod(0o600)
        self.ca_file = ROOT / 'os/registry/fixtures/development-ca.pem'

    def open_service(self, transport=None, state=None):
        return RemoteWalletService(state or self.state, transport or self.transport, clock=lambda: self.now)

    def restart(self):
        self.service.close()
        self.service = self.open_service()

    def dispatch(self, request):
        return self.service.dispatch(request, peer_uid=1002)

    def snapshot(self):
        return self.dispatch({'v': 1, 'op': 'snapshot'})['snapshot']

    def consent(self, key='consent', accepted=True):
        return {'v': 1, 'op': 'wallet.consent', 'key': key, 'accepted': accepted,
                'terms_version': TERMS_VERSION}

    def cache(self):
        with closing(sqlite3.connect(self.state / 'remote-cache.db')) as db:
            return {
                'requests': db.execute('SELECT key,payload,response FROM requests ORDER BY key').fetchall(),
                'snapshot': db.execute('SELECT payload,received_at FROM snapshot').fetchall(),
                'denied': db.execute('SELECT access_denied FROM identity').fetchone()[0],
            }

    def transport_instance(self, device_ref=DEVICE_REF):
        return client.HTTPSWalletTransport('https://127.0.0.1:9444', self.ca_file, self.token_file,
                                           authority_id=AUTHORITY_ID, device_ref=device_ref)

    def test_revoke_after_lost_ack_keeps_exact_pending_until_authorized_reconciliation(self):
        first = self.snapshot()
        request = self.consent('lost-ack')
        self.transport.lose_ack_once.add(request['key'])
        with self.assertRaises(BackendUnavailable):
            self.dispatch(request)
        pending = self.cache()
        self.assertEqual(pending['requests'], [(request['key'], canonical(request).decode(), None)])
        self.assertEqual(self.transport.effects, [request])
        self.transport.denied = True
        with self.assertRaises(PermissionError):
            self.snapshot()
        denied = self.cache()
        self.assertEqual(denied['requests'], pending['requests'])
        self.assertEqual(denied['snapshot'], pending['snapshot'])
        self.assertEqual(denied['denied'], 1)
        self.restart()
        self.transport.offline = NotSent
        with self.assertRaises(PermissionError):
            self.snapshot()
        self.assertEqual(self.cache(), denied)
        with self.assertRaises(BackendUnavailable):
            self.dispatch(self.consent('different-key', False))
        self.assertEqual(self.cache(), denied)

        self.transport.denied, self.transport.offline = False, None
        self.now += 60
        previous_calls = len(self.transport.calls)
        recovered = self.snapshot()
        self.assertEqual(self.transport.calls[previous_calls:], [request, {'v': 1, 'op': 'snapshot'}])
        self.assertEqual(self.transport.effects, [request])
        saved = self.cache()
        self.assertEqual(saved['requests'][0][1], canonical(request).decode())
        self.assertEqual(json.loads(saved['requests'][0][2]), self.transport.receipts[request['key']][1])
        self.assertEqual(saved['denied'], 0)
        self.assertEqual(recovered['backend']['last_sync_unix'], self.now)
        self.assertFalse(recovered['backend']['stale'])
        self.assertFalse(recovered['backend']['pending_reconciliation'])
        for field in ('available_minor', 'held_minor', 'billed_minor', 'ledger_balance_minor'):
            self.assertEqual(first[field], recovered[field])

    def test_completed_receipt_replay_checks_authority_and_denial_never_overwrites_receipt(self):
        self.snapshot()
        request = self.consent('completed')
        accepted = self.dispatch(request)
        saved = self.cache()
        self.transport.denied = True
        count = len(self.transport.calls)
        with self.assertRaises(PermissionError):
            self.dispatch(request)
        self.assertEqual(self.transport.calls[count:], [request])
        self.assertEqual(self.cache()['requests'], saved['requests'])
        self.assertEqual(self.cache()['snapshot'], saved['snapshot'])
        self.assertEqual(self.cache()['denied'], 1)
        self.transport.denied = False
        self.assertEqual(self.dispatch(request), accepted)
        self.assertEqual(self.cache()['requests'], saved['requests'])
        self.assertEqual(len(self.transport.effects), 1)
        self.assertTrue(self.snapshot()['backend']['connected'])

    def test_known_snapshot_denial_survives_restart_and_offline_without_stale_display(self):
        self.snapshot()
        prior = self.cache()
        self.transport.denied = True
        with self.assertRaises(PermissionError):
            self.snapshot()
        self.restart()
        self.transport.offline = BackendUnavailable
        for op in ('snapshot', 'wallet.membership', 'wallet.billing.status'):
            with self.subTest(operation=op), self.assertRaises(PermissionError):
                self.dispatch({'v': 1, 'op': op})
        self.assertEqual(self.cache()['snapshot'], prior['snapshot'])
        self.assertEqual(self.cache()['denied'], 1)
        self.transport.offline, self.transport.denied = None, False
        self.now += 60
        self.assertFalse(self.snapshot()['backend']['stale'])
        self.assertEqual(self.cache()['denied'], 0)

    def test_malformed_success_cannot_clear_denial_or_close_pending(self):
        self.snapshot()
        request = self.consent('unknown')
        self.transport.lose_ack_once.add(request['key'])
        with self.assertRaises(BackendUnavailable):
            self.dispatch(request)
        self.transport.denied = True
        with self.assertRaises(PermissionError):
            self.snapshot()
        before = self.cache()
        self.transport.denied = False
        self.transport.malformed_reply_once[request['key']] = {'ok': True}
        with self.assertRaises(PermissionError):
            self.snapshot()
        self.assertEqual(self.cache(), before)
        self.assertEqual(self.transport.effects, [request])

    def test_malformed_snapshot_success_cannot_reenable_previously_denied_cache(self):
        self.snapshot()
        self.transport.denied = True
        with self.assertRaises(PermissionError):
            self.snapshot()
        before = self.cache()
        self.transport.denied = False
        self.transport.snapshot_reply_once = {'ok': True, 'snapshot': {'simulation_only': True}}
        with self.assertRaises(PermissionError):
            self.snapshot()
        self.assertEqual(self.cache(), before)

    def test_changed_completed_receipt_cannot_clear_denial_or_replace_original(self):
        self.snapshot()
        request = self.consent('completed')
        self.dispatch(request)
        self.transport.denied = True
        with self.assertRaises(PermissionError):
            self.dispatch(request)
        before = self.cache()
        self.transport.denied = False
        changed = self.transport.success_reply(request)
        changed['result']['consent_id'] = 'synthetic-changed-valid-shaped-receipt'
        self.transport.malformed_reply_once[request['key']] = changed
        with self.assertRaises(BackendUnavailable):
            self.dispatch(request)
        self.assertEqual(self.cache(), before)

    def test_device_fingerprint_separates_legacy_and_devices_and_rejects_populated_cache_change(self):
        a = self.transport_instance()
        a_again = self.transport_instance()
        b = self.transport_instance('fixture-replacement-device')
        legacy = self.transport_instance(None)
        self.assertEqual(a.fingerprint, a_again.fingerprint)
        self.assertEqual(len({a.fingerprint, b.fingerprint, legacy.fingerprint}), 3)
        with patch.object(a, 'exchange', side_effect=self.transport.exchange):
            cache = self.root / 'fingerprint-cache'
            service = self.open_service(a, cache)
            service.dispatch({'v': 1, 'op': 'snapshot'}, peer_uid=1002)
            service.close()
        before = (cache / 'remote-cache.db').read_bytes()
        for other in (b, legacy):
            with self.assertRaisesRegex(ValueError, 'authority changed'):
                self.open_service(other, cache)
            self.assertEqual((cache / 'remote-cache.db').read_bytes(), before)

    def test_schema_two_requires_exact_device_contract_and_preserves_schema_one(self):
        base = {'schema_version': 2, 'mode': 'development-remote-authority',
                'origin': 'https://127.0.0.1:9444', 'ca_file': str(self.ca_file),
                'token_file': str(self.token_file), 'authority_id': AUTHORITY_ID,
                'device_ref': DEVICE_REF}
        path = self.root / 'backend.json'
        bad = [dict(base, schema_version=True), dict(base, schema_version=4),
               {k: v for k, v in base.items() if k != 'device_ref'},
               dict(base, device_ref=None), dict(base, device_ref=True), dict(base, device_ref=2),
               dict(base, device_ref='other-device'), dict(base, extra=True),
               dict(base, schema_version=1)]
        for i, config in enumerate(bad):
            path.write_bytes(canonical(config))
            path.chmod(0o600)
            with self.subTest(case=i), patch.object(client, 'HTTPSWalletTransport') as transport:
                with self.assertRaises(ValueError):
                    client.configured_service(path, self.root / f'rejected-{i}')
                transport.assert_not_called()
                self.assertFalse((self.root / f'rejected-{i}').exists())
        for version in (1, 2):
            config = dict(base, schema_version=version)
            if version == 1:
                del config['device_ref']
            path.write_bytes(canonical(config))
            with patch.object(client, 'HTTPSWalletTransport', return_value=self.transport) as transport:
                service = client.configured_service(path, self.root / f'accepted-{version}')
                service.close()
                options = {'authority_id': AUTHORITY_ID}
                if version == 2:
                    options['device_ref'] = DEVICE_REF
                transport.assert_called_once_with(config['origin'], config['ca_file'], config['token_file'], **options)

    def test_http_200_wrong_missing_or_duplicate_device_echo_keeps_committed_request_unknown(self):
        # Mock only the HTTP stream objects. No sockets or TLS sessions are opened.
        for label, echoed in (('wrong', ['fixture-other-device']), ('missing', []),
                              ('duplicate', [DEVICE_REF, DEVICE_REF])):
            with self.subTest(echo=label):
                authority = BoundAuthorityTransport()
                transport = self.transport_instance()
                connection = Mock()
                connection.sock = Mock()
                headers = Message()
                headers['X-Rock-Wallet-Authority'] = AUTHORITY_ID
                for value in echoed:
                    headers['X-Rock-Wallet-Device'] = value
                request = self.consent('echo-' + label)
                def receive(_method, _path, raw, **_options):
                    body = canonical(authority.exchange(json.loads(raw)))
                    headers['Content-Length'] = str(len(body))
                    response = Mock(status=200, headers=headers)
                    response.read1.side_effect = io.BytesIO(body).read1
                    connection.getresponse.return_value = response
                connection.request.side_effect = receive
                service = self.open_service(transport, self.root / ('echo-cache-' + label))
                try:
                    with patch.object(client.http.client, 'HTTPSConnection', return_value=connection), \
                         patch.object(client, 'DeadlineConnection'):
                        with self.assertRaises(BackendUnavailable):
                            service.dispatch(request, peer_uid=1002)
                    self.assertEqual(authority.effects, [request])
                    with closing(sqlite3.connect(service.path)) as db:
                        self.assertEqual(db.execute('SELECT key,payload,response FROM requests').fetchall(),
                                         [(request['key'], canonical(request).decode(), None)])
                    sent = connection.request.call_args.args
                    self.assertEqual(sent[:3], ('POST', '/v2/wallet', canonical(request)))
                    sent_headers = connection.request.call_args.kwargs['headers']
                    self.assertEqual(sent_headers['X-Rock-Wallet-Device'], DEVICE_REF)
                    self.assertEqual(sent_headers['X-Rock-Wallet-Authority'], AUTHORITY_ID)
                    connection.close.assert_called_once()
                finally:
                    service.close()


if __name__ == '__main__':
    unittest.main()

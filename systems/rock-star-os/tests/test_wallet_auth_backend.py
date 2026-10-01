"""Actual loopback TLS plus the OS Wallet proxy and public WebAuthn fixture."""
import copy
from pathlib import Path
import json
import sys
import tempfile
import threading
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'os'))
from entitlement.protocol import PUBLIC_TOKENS, sign_fixture_event
from wallet_backend.server import WalletBackendServer, PUBLIC_SECOND_DEVICE_TOKEN
from wallet_backend.client import HTTPSWalletTransport, RemoteWalletService, BackendUnavailable, validate_reply
from wallet_auth.fixture import SoftwareTestAuthenticator

DEVICE = 'fixture-rock-arm64-001'
TERMS = 'rock-wallet-development/1'


class WalletAuthTLSIntegrationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.now = 1788856800
        config = self.root / 'device-credentials.json'
        config.write_text(json.dumps({'schema_version': 1, 'kind': 'public-development-device-credentials',
            'devices': [{'device_ref': DEVICE, 'owner_actor': 'alice', 'token': PUBLIC_TOKENS['alice']}]}))
        config.chmod(0o600)
        self.server = WalletBackendServer(('127.0.0.1', 0), self.root / 'authority',
            device_credentials_file=config, start_scheduler=False, clock=lambda: self.now)
        self.thread = threading.Thread(target=self.server.serve_forever, kwargs={'poll_interval': .01})
        self.thread.start()
        self.addCleanup(self.stop)
        token = self.root / 'public-token'
        token.write_text(PUBLIC_TOKENS['alice']); token.chmod(0o600)
        self.transport = HTTPSWalletTransport('https://127.0.0.1:' + str(self.server.server_port),
            ROOT / 'os/registry/fixtures/development-ca.pem', token,
            authority_id=self.server.authority_id, device_ref=DEVICE)
        self.client = RemoteWalletService(self.root / 'cache', self.transport, clock=lambda: self.now)
        self.addCleanup(lambda: self.client.close())
        self.authenticator = SoftwareTestAuthenticator(self.root / 'authenticator', DEVICE)
        self.addCleanup(self.authenticator.close)
        self.sequence = 0
        self.call('wallet.register')

    def stop(self):
        self.server.shutdown(); self.thread.join(5); self.server.server_close()

    def call(self, op, **fields):
        self.sequence += 1
        request = {'v': 1, 'op': op, **fields}
        if op not in ('snapshot', 'wallet.auth.status'):
            request.setdefault('key', 'tls-auth-' + str(self.sequence))
        response = self.client.dispatch(request, peer_uid=1002)
        self.assertTrue(response['ok'], response)
        return response.get('result', response.get('snapshot'))

    def activate(self):
        begin = self.call('wallet.auth.begin')
        credential = self.authenticator.make_credential(begin['options'], '0000', 'tls-create')
        self.call('wallet.auth.enroll', challenge_id=begin['challenge_id'], credential=credential)
        self.call('wallet.terms', accepted=True, terms_version=TERMS)
        sale = self.server.service.wallet.simulate_sale(5000, 'trusted-public-credit')
        self.server.service.wallet.settle_sale(sale['id'], 'trusted-public-settlement')

    def quote_request(self):
        quote = self.call('wallet.atm.quote', amount_minor=1000, atm_id='SIM-ATM-001', issue_key='tls-issue')
        assertion = self.authenticator.get_assertion(quote['options'], '0000', 'tls-get')
        return quote, {'v': 1, 'op': 'wallet.atm.issue', 'key': 'tls-issue',
                       'quote_id': quote['quote_id'], 'credential': assertion}

    def test_actual_tls_enrollment_quote_assertion_and_exact_replay(self):
        self.activate()
        self.assertTrue(self.call('wallet.auth.status')['active'])
        self.assertEqual(self.call('snapshot')['auth']['hardware_backed'], False)
        quote, request = self.quote_request()
        reply = self.client.dispatch(request, peer_uid=1002)
        self.assertTrue(reply['ok'])
        self.assertEqual(reply['result']['quote_id'], quote['quote_id'])
        self.assertEqual(self.client.dispatch(request, peer_uid=1002), reply)
        self.assertEqual(self.server.service.wallet.snapshot()['held_minor'], 1000)

    def test_response_lost_after_actual_tls_commit_recovers_after_client_restart(self):
        self.activate()
        _, request = self.quote_request()
        original = self.transport.exchange
        observed = []
        def lose_reply(payload):
            result = original(payload)
            observed.append(result)
            raise BackendUnavailable('test discards completed TLS response after authority commit')
        self.transport.exchange = lose_reply
        with self.assertRaises(BackendUnavailable):
            self.client.dispatch(request, peer_uid=1002)
        self.assertTrue(observed[0]['ok'])
        self.assertEqual(self.server.service.wallet.snapshot()['held_minor'], 1000)
        self.client.close()
        self.transport.exchange = original
        self.client = RemoteWalletService(self.root / 'cache', self.transport, clock=lambda: self.now)
        self.assertEqual(self.client.dispatch(request, peer_uid=1002), observed[0])
        self.assertIsNone(self.client._pending())
        self.assertEqual(len(self.server.service.wallet.snapshot()['withdrawals']), 1)

    def test_legacy_issue_and_unverified_assertion_are_rejected_over_tls(self):
        self.activate()
        _, request = self.quote_request()
        old = self.transport.exchange({'v': 1, 'op': 'wallet.atm.issue', 'key': 'old-no-approval',
                                       'amount_minor': 1000, 'atm_id': 'SIM-ATM-001'})
        self.assertFalse(old['ok'])
        bad = copy.deepcopy(request)
        signature = bad['credential']['response']['signature']
        bad['credential']['response']['signature'] = ('A' if signature[0] != 'A' else 'B') + signature[1:]
        self.assertFalse(self.transport.exchange(bad)['ok'])
        self.assertEqual(self.server.service.wallet.snapshot()['held_minor'], 0)
        self.assertTrue(self.client.dispatch(request, peer_uid=1002)['ok'])

    def test_client_rejects_changed_quote_amount_and_acknowledgement_amount(self):
        self.activate()
        quote, request = self.quote_request()
        good = self.transport.exchange(request)
        changed = copy.deepcopy(good)
        for field in ('amount_minor', 'total_debit_minor', 'cash_received_minor'):
            changed['result'][field] = 2000
        # Shape alone is insufficient: the saved server quote must also match.
        validate_reply(request, changed)
        with self.assertRaises(BackendUnavailable):
            self.client._validate_auth_scope(request, changed)
        self.assertEqual(self.client.dispatch(request, peer_uid=1002), good)

    def test_second_device_enrolls_same_contract_and_recovers_after_first_credential_revocation(self):
        self.activate()
        self.call('wallet.consent', accepted=True, terms_version='simulator-monthly-usd-8.88-v1')
        self.server.service.membership.tick()
        original = self.call('wallet.auth.status')
        first_account = self.call('snapshot')['membership']['entitlement']['account_id']
        other = 'fixture-rock-auth-second'
        event = json.loads((ROOT / 'os/entitlement/fixtures/device-handoff.json').read_text())['events'][0]
        payload = {**event['payload'], 'device_ref': other, 'purchase_ref': 'fixture-auth-second-purchase',
                   'verification_ref': 'fixture-auth-second-verification'}
        self.server.service.membership.store.ingest(sign_fixture_event('fulfillment', 'fixture-auth-second-event',
            'device:' + other, 1, event['occurred_at'], 'handoff', payload))
        config = self.root / 'device-credentials.json'
        value = json.loads(config.read_text())
        value['devices'].append({'device_ref': other, 'owner_actor': 'alice', 'token': PUBLIC_SECOND_DEVICE_TOKEN})
        config.write_text(json.dumps(value)); config.chmod(0o600)
        port = self.server.server_port
        self.stop()
        self.server = WalletBackendServer(('127.0.0.1', port), self.root / 'authority',
            device_credentials_file=config, start_scheduler=False, clock=lambda: self.now)
        self.thread = threading.Thread(target=self.server.serve_forever, kwargs={'poll_interval': .01})
        self.thread.start()
        token = self.root / 'public-token-second'
        token.write_text(PUBLIC_SECOND_DEVICE_TOKEN); token.chmod(0o600)
        transport = HTTPSWalletTransport('https://127.0.0.1:' + str(port),
            ROOT / 'os/registry/fixtures/development-ca.pem', token,
            authority_id=self.server.authority_id, device_ref=other)
        proxy = RemoteWalletService(self.root / 'second-cache', transport, clock=lambda: self.now)
        self.addCleanup(proxy.close)
        authenticator = SoftwareTestAuthenticator(self.root / 'second-authenticator', other)
        self.addCleanup(authenticator.close)
        def second(op, **fields):
            reply = proxy.dispatch({'v': 1, 'op': op, **fields}, peer_uid=1002)
            self.assertTrue(reply['ok'], reply)
            return reply.get('result', reply.get('snapshot'))
        self.assertEqual(second('wallet.register', key='second-register')['account_id'], first_account)
        begin = second('wallet.auth.begin', key='second-begin')
        credential = authenticator.make_credential(begin['options'], '0000', 'second-create')
        enrolled = second('wallet.auth.enroll', key='second-enroll', challenge_id=begin['challenge_id'], credential=credential)
        self.assertTrue(enrolled['active'])
        self.assertNotEqual(enrolled['credential_id'], original['credential_id'])
        self.server.service.authentication.revoke_credential(original['credential_id'], 'operator-revoke-first')
        second('wallet.bill', key='second-same-month', period='2026-09')
        self.server.service.membership.tick()
        quote = second('wallet.atm.quote', key='second-quote', issue_key='second-issue', amount_minor=1000, atm_id='SIM-ATM-001')
        assertion = authenticator.get_assertion(quote['options'], '0000', 'second-get')
        result = second('wallet.atm.issue', key='second-issue', quote_id=quote['quote_id'], credential=assertion)
        self.assertEqual(result['amount_minor'], 1000)
        final = self.server.service.wallet.snapshot()
        self.assertEqual((final['available_minor'], final['held_minor'], final['billed_minor'], len(final['bills'])),
                         (3112, 1000, 888, 1))
        first = self.transport.exchange({'v': 1, 'op': 'wallet.atm.quote', 'key': 'revoked-first-quote',
            'issue_key': 'revoked-first-issue', 'amount_minor': 1000, 'atm_id': 'SIM-ATM-001'})
        self.assertFalse(first['ok'])


if __name__ == '__main__':
    unittest.main()

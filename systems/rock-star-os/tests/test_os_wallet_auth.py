"""Actual WalletService and cryptographic public authenticator integration.

No hardware authenticator, provider, identity verification or real funds.
"""
from contextlib import closing
import copy
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'os'))
spec = importlib.util.spec_from_file_location('wallet_auth_platform_test', ROOT / 'os/platform/service.py')
platform = importlib.util.module_from_spec(spec)
spec.loader.exec_module(platform)
from wallet_auth.fixture import SoftwareTestAuthenticator
from wallet_auth.protocol import AuthError, b64decode, b64encode
from entitlement.protocol import sign_fixture_event

DEVICE = 'fixture-rock-arm64-001'
FIXTURE = ROOT / 'os/entitlement/fixtures/device-handoff.json'
TERMS = 'rock-wallet-development/1'


class WalletAuthenticationIntegrationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / 'wallet').mkdir(mode=0o700)
        self.now = 1788856800
        self.server = self.open()
        self.addCleanup(lambda: self.server.close())
        self.authenticator = SoftwareTestAuthenticator(self.root / 'authenticator', DEVICE)
        self.addCleanup(self.authenticator.close)
        self.sequence = 0
        self.call('wallet.register')

    def open(self, **kwargs):
        return platform.WalletService(self.root / 'wallet', provisioning_file=FIXTURE,
                                      clock=lambda: self.now, start_scheduler=False, **kwargs)

    def call(self, op, **fields):
        self.sequence += 1
        request = {'v': 1, 'op': op, **fields}
        if op not in ('snapshot', 'wallet.auth.status', 'wallet.membership', 'wallet.billing.status'):
            request.setdefault('key', 'auth-test-' + str(self.sequence))
        result = self.server.dispatch(request, peer_uid=1002)
        self.assertTrue(result['ok'], result)
        return result.get('result', result.get('snapshot'))

    def enroll(self):
        begin = self.call('wallet.auth.begin')
        credential = self.authenticator.make_credential(begin['options'], '0000', 'create-credential')
        return self.call('wallet.auth.enroll', challenge_id=begin['challenge_id'], credential=credential)

    def activate(self):
        self.enroll()
        return self.call('wallet.terms', accepted=True, terms_version=TERMS)

    def fund(self):
        sale = self.server.wallet.simulate_sale(5000, 'trusted-test-credit')
        self.server.wallet.settle_sale(sale['id'], 'trusted-test-settlement')

    def quote(self, key='approved-issue', amount=1000):
        return self.call('wallet.atm.quote', issue_key=key, amount_minor=amount, atm_id='SIM-ATM-001')

    def issue(self, quote, key='approved-issue'):
        assertion = self.authenticator.get_assertion(quote['options'], '0000', 'sign-' + key)
        return self.call('wallet.atm.issue', key=key, quote_id=quote['quote_id'], credential=assertion), assertion

    def test_default_requires_real_ceremony_and_separate_consents(self):
        self.assertEqual(self.call('snapshot')['auth']['activation_state'], 'CREDENTIAL_REQUIRED')
        self.fund()
        for op, fields in (
            ('wallet.atm.issue', {'amount_minor': 1000, 'atm_id': 'SIM-ATM-001'}),
            ('wallet.reserve', {'amount_minor': 1000}),
            ('wallet.sale', {'amount_minor': 1000}),
            ('wallet.consent', {'accepted': True, 'terms_version': 'simulator-monthly-usd-8.88-v1'}),
        ):
            with self.assertRaises((ValueError, PermissionError)):
                self.call(op, **fields)
        self.assertEqual(self.enroll()['activation_state'], 'TERMS_REQUIRED')
        self.assertFalse(self.call('wallet.membership')['entitlement']['auto_renew'])
        self.assertTrue(self.call('wallet.terms', accepted=True, terms_version=TERMS)['active'])
        self.assertFalse(self.call('wallet.membership')['entitlement']['auto_renew'])
        self.call('wallet.consent', accepted=True, terms_version='simulator-monthly-usd-8.88-v1')
        self.server.membership.tick()
        self.server.membership.tick()
        snapshot = self.server.wallet.snapshot()
        self.assertEqual((snapshot['available_minor'], snapshot['billed_minor'], len(snapshot['bills'])), (4112, 888, 1))

    def test_changed_challenge_and_extra_amount_cannot_reserve(self):
        self.activate(); self.fund()
        quote = self.quote()
        assertion = self.authenticator.get_assertion(quote['options'], '0000', 'sign-wrong')
        changed = copy.deepcopy(assertion)
        data = json.loads(b64decode(changed['response']['clientDataJSON']))
        data['challenge'] = b64encode(b'x' * 32)
        changed['response']['clientDataJSON'] = b64encode(json.dumps(data).encode())
        for fields in (
            {'quote_id': quote['quote_id'], 'credential': changed},
            {'quote_id': quote['quote_id'], 'credential': assertion, 'amount_minor': 2000},
        ):
            with self.assertRaises(ValueError):
                self.call('wallet.atm.issue', key='approved-issue', **fields)
        self.assertEqual(self.server.wallet.snapshot()['held_minor'], 0)
        receipt = self.call('wallet.atm.issue', key='approved-issue', quote_id=quote['quote_id'], credential=assertion)
        self.assertEqual(receipt['authentication'], 'verified_software_test_assertion')
        self.assertEqual(self.server.wallet.snapshot()['held_minor'], 1000)

    def test_expiry_and_cancel_do_not_change_balance(self):
        self.activate(); self.fund()
        first = self.quote('expired-issue')
        assertion = self.authenticator.get_assertion(first['options'], '0000', 'sign-expired')
        self.now += 121
        with self.assertRaises(ValueError):
            self.call('wallet.atm.issue', key='expired-issue', quote_id=first['quote_id'], credential=assertion)
        second = self.quote('canceled-issue')
        self.call('wallet.atm.quote.cancel', quote_id=second['quote_id'])
        with self.assertRaises(ValueError):
            self.issue(second, 'canceled-issue')
        self.assertEqual(self.server.wallet.snapshot()['available_minor'], 5000)
        self.assertEqual(self.server.wallet.snapshot()['withdrawals'], [])

    def test_restart_exact_receipt_and_no_authentication_downgrade(self):
        self.activate(); self.fund()
        quote = self.quote()
        receipt, assertion = self.issue(quote)
        authority = self.server.authentication.authority_id
        self.server.close()
        self.server = self.open()
        self.now += 121
        self.assertEqual(self.server.authentication.authority_id, authority)
        self.assertEqual(self.call('wallet.atm.issue', key='approved-issue', quote_id=quote['quote_id'], credential=assertion), receipt)
        with self.assertRaises(ValueError):
            self.open(authentication_required=False)
        self.assertEqual(len(self.server.wallet.snapshot()['withdrawals']), 1)

    def test_monthly_cancel_preserves_approved_cashout(self):
        self.activate(); self.fund()
        self.call('wallet.consent', accepted=True, terms_version='simulator-monthly-usd-8.88-v1')
        self.call('wallet.consent', accepted=False, terms_version='simulator-monthly-usd-8.88-v1')
        receipt, _ = self.issue(self.quote())
        self.assertEqual(receipt['amount_minor'], 1000)
        self.assertEqual(self.server.wallet.snapshot()['billed_minor'], 0)

    def test_device_revoked_after_approval_cannot_first_redeem(self):
        self.activate(); self.fund()
        receipt, _ = self.issue(self.quote())
        self.server.membership.store.ingest(sign_fixture_event('fulfillment', 'fixture-revoke-auth',
            'device:' + DEVICE, 2, self.now, 'suspend', {'device_ref': DEVICE}))
        with self.assertRaises((ValueError, PermissionError)):
            self.server.dispatch({'v': 1, 'op': 'atm.redeem', 'key': 'atm-redeem-revoked',
                                  'code': receipt['code'], 'atm_id': 'SIM-ATM-001'}, peer_uid=0)
        self.assertEqual(self.server.wallet.snapshot()['held_minor'], 1000)
        self.call('wallet.atm.cancel', withdrawal_id=receipt['withdrawal_id'])
        self.assertEqual(self.server.wallet.snapshot()['held_minor'], 0)

    def test_status_read_preserves_auth_business_rows(self):
        self.activate()
        def stored():
            with closing(self.server.wallet._connect()) as db:
                return [tuple(row) for row in db.execute('SELECT * FROM wallet_auth_mode')]
        before = stored()
        self.now += 60
        self.call('wallet.auth.status'); self.call('snapshot')
        self.assertEqual(stored(), before)


if __name__ == '__main__':
    unittest.main()

"""Independent real-Wallet monthly retry boundary after credential revocation.

Uses public development enrollment and simulated funds. Faults distinguish an
unexecuted CLAIMED authorization from a committed bill whose acknowledgement
was lost; neither test substitutes a fake balance or a fake authorization.
"""
from contextlib import closing
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT / 'src'), str(ROOT / 'os'), str(ROOT / 'tests')]
import test_os_wallet_auth as service_fixture
from entitlement.wallet_bridge import WalletBridge


class WalletAuthBillingRecoveryTests(unittest.TestCase):
    def setUp(self):
        self.case = service_fixture.WalletAuthenticationIntegrationTests(
            'test_default_requires_real_ceremony_and_separate_consents')
        self.addCleanup(self.case.doCleanups)
        self.case.setUp()
        self.active = self.case.activate()
        self.case.fund()
        self.case.call('wallet.consent', accepted=True, terms_version='simulator-monthly-usd-8.88-v1')
        self.server = self.case.server

    def authorizations(self):
        with closing(self.server.membership.store._connect()) as db:
            return [dict(row) for row in db.execute('SELECT * FROM authorizations')]

    def revoke_and_wait_retry(self):
        self.server.authentication.revoke_credential(self.active['credential_id'], 'independent-review-revoke')
        self.assertFalse(self.case.call('wallet.auth.status')['active'])
        self.case.now += self.server.membership.retry_seconds + 1

    def test_claimed_but_no_debit_cannot_charge_after_last_credential_revoked(self):
        before = self.server.wallet.snapshot()
        with patch.object(WalletBridge, 'execute', side_effect=OSError('injected outage BEFORE any Wallet debit')):
            with self.assertRaises(OSError):
                self.server.membership.tick()
        self.assertEqual(self.server.wallet.snapshot()['bills'], [])
        self.assertEqual([row['state'] for row in self.authorizations()], ['CLAIMED'])
        self.revoke_and_wait_retry()
        self.server.membership.tick()
        after = self.server.wallet.snapshot()
        self.assertEqual(after['billed_minor'], 0, 'an unexecuted claim must not bypass current Wallet activation')
        self.assertEqual(after['available_minor'], 5000)
        self.assertEqual(after['held_minor'], 0)
        self.assertEqual(after['bills'], [])
        self.assertEqual(after['journals'], before['journals'], 'no fresh financial posting after credential revocation')
        self.assertNotEqual(self.authorizations()[0]['state'], 'PAID')

    def test_committed_bill_lost_ack_still_reconciles_after_credential_revoked(self):
        original_bill = self.server.wallet.bill
        committed = []

        def commit_then_lose_ack(*args, **kwargs):
            result = original_bill(*args, **kwargs)
            committed.append(result)
            raise OSError('injected acknowledgement loss AFTER actual Wallet bill commit')

        with patch.object(self.server.wallet, 'bill', side_effect=commit_then_lose_ack):
            with self.assertRaises(OSError):
                self.server.membership.tick()
        self.assertEqual(len(committed), 1)
        before = self.server.wallet.snapshot()
        self.assertEqual((before['available_minor'], before['billed_minor'], len(before['bills'])), (4112, 888, 1))
        self.assertEqual([row['state'] for row in self.authorizations()], ['CLAIMED'])
        self.revoke_and_wait_retry()
        # Recovery must inspect the already committed Wallet receipt rather
        # than attempt any new debit through the now-revoked credential.
        with patch.object(self.server.wallet, 'bill', side_effect=AssertionError('recovery attempted a second Wallet bill')):
            self.server.membership.tick()
        after = self.server.wallet.snapshot()
        self.assertEqual(after['bills'], before['bills'])
        self.assertEqual(after['journals'], before['journals'])
        self.assertEqual((after['available_minor'], after['held_minor'], after['billed_minor']), (4112, 0, 888))
        authorization = self.authorizations()[0]
        self.assertEqual(authorization['state'], 'PAID')
        self.assertEqual(authorization['wallet_bill_id'], before['bills'][0]['id'])


if __name__ == '__main__':
    unittest.main()

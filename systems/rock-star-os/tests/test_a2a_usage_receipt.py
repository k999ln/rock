"""Native Wallet acceptance for the cross-language signed A2A usage contract."""
import hashlib
import json
from pathlib import Path
import tempfile
import unittest

from blackberryrock.a2a_usage_receipt import (
    create_a2a_usage_receipt_verifier,
    signing_bytes,
)
from blackberryrock.spend import ValueSpendRuntime
from blackberryrock.wallet import Wallet


FIXTURE = Path(__file__).with_name('fixtures') / 'a2a-usage-receipt-v1.json'


class A2AUsageReceiptTest(unittest.TestCase):
    def setUp(self):
        self.vector = json.loads(FIXTURE.read_text())
        self.receipt = {name: value for name, value in self.vector.items()
                        if name not in ('fixturePublicKeyHex', 'signingBytesSha256', 'notice')}
        self.entry = {
            'providerId': self.receipt['providerId'],
            'keyId': self.receipt['keyId'],
            'agentOrigin': self.receipt['agentOrigin'],
            'publicKeyHex': self.vector['fixturePublicKeyHex'],
            'status': 'active',
        }
        self.now = self.receipt['issuedAt']
        self.hold = {
            'owner_id': self.receipt['ownerUserId'],
            'parent_job_id': self.receipt['parentJobId'],
            'delegation_id': self.receipt['delegationId'],
            'currency': self.receipt['currency'],
            'budget_limit_minor': 2_000,
            'approval_sha256': 'a' * 64,
            'deadline_at': self.now + 3_600_000,
        }

    def verifier(self, entries=None):
        return create_a2a_usage_receipt_verifier(
            json.dumps([self.entry] if entries is None else entries),
            clock_ms=lambda: self.now,
        )

    def test_signing_bytes_match_typescript_rfc8032_vector(self):
        self.assertEqual(
            hashlib.sha256(signing_bytes(self.receipt)).hexdigest(),
            self.vector['signingBytesSha256'],
        )
        self.assertTrue(self.verifier()(self.receipt, self.hold))

    def test_owner_hold_task_meters_and_trust_must_all_match(self):
        verify = self.verifier()
        self.assertFalse(verify({**self.receipt, 'ownerUserId': 'bob'}, self.hold))
        self.assertFalse(verify({**self.receipt, 'delegationId': 'other-job'}, self.hold))
        self.assertFalse(verify({**self.receipt, 'amountMinor': 2_001}, self.hold))
        self.assertFalse(verify({**self.receipt, 'taskId': 'another-task'}, self.hold))
        self.assertFalse(verify({**self.receipt, 'unknown': True}, self.hold))
        bad_usage = [{**self.receipt['usage'][0], 'amountMinor': 649}]
        self.assertFalse(verify({**self.receipt, 'usage': bad_usage}, self.hold))
        self.assertFalse(self.verifier([{**self.entry, 'status': 'revoked'}])(self.receipt, self.hold))
        self.assertFalse(self.verifier([self.entry, self.entry])(self.receipt, self.hold))
        self.assertFalse(create_a2a_usage_receipt_verifier('{')(self.receipt, self.hold))

    def test_verified_remote_receipt_settles_native_wallet_once_and_releases_unused_hold(self):
        with tempfile.TemporaryDirectory() as directory:
            wallet = Wallet(Path(directory) / 'wallet.sqlite3')
            sale = wallet.simulate_sale(20_000, 'fund-wallet')
            wallet.settle_sale(sale['id'], 'settle-wallet')
            runtime = ValueSpendRuntime(
                wallet,
                a2a_usage_receipt_verifier=self.verifier(),
                clock=lambda: self.now // 1000,
            )
            reservation = runtime.reserve_a2a_budget(
                owner_id=self.hold['owner_id'],
                delegation_id=self.hold['delegation_id'],
                parent_job_id=self.hold['parent_job_id'],
                currency=self.hold['currency'],
                budget_limit_minor=self.hold['budget_limit_minor'],
                approval_sha256=self.hold['approval_sha256'],
                deadline_at=self.hold['deadline_at'],
                key='reserve-native-a2a',
            )
            runtime.mark_a2a_dispatched(reservation['delegation_id'], 'dispatch-native-a2a')
            settled = runtime.settle_a2a_budget(
                reservation['delegation_id'], self.receipt, 'settle-native-a2a',
            )
            self.assertEqual(settled['state'], 'SETTLED')
            self.assertEqual(settled['settled_minor'], 650)
            self.assertEqual(settled['released_minor'], 1_350)
            self.assertEqual(runtime.settle_a2a_budget(
                reservation['delegation_id'], self.receipt, 'settle-native-a2a',
            ), settled)
            snapshot = wallet.snapshot()
            self.assertEqual(snapshot['accounts']['AVAILABLE'], 19_350)
            self.assertEqual(snapshot['accounts']['SPEND_HOLD'], 0)
            self.assertEqual(snapshot['accounts']['SPEND_COMMITTED'], 650)


if __name__ == '__main__':
    unittest.main()

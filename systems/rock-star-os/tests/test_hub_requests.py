import json
from pathlib import Path
import tempfile
import unittest

from blackberryrock.hub import Hub
from blackberryrock.packages import PackageError, PUBLIC_TEST_KEY, TEST_PUBLISHER
from blackberryrock.wallet import Wallet
from blackberryrock.storage import IdempotencyConflict


class DurableRequestTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.hub = Hub(self.root / 'hub.db', {TEST_PUBLISHER: PUBLIC_TEST_KEY})
        registry = Path(__file__).resolve().parents[1] / 'examples/registry'
        self.package = json.loads((registry / 'org.rockstar.text-tidy--1.0.0.rock.json').read_text())

    def tearDown(self):
        self.temp.cleanup()

    def install(self):
        return self.hub.request('install-1', {'op': 'install', 'package': self.package},
                                lambda: self.hub.install(self.package))

    def test_replay_after_enable_does_not_disable_or_reinstall(self):
        receipt = self.install()
        self.hub.enable(receipt['id'], receipt['hash'])
        self.assertEqual(receipt, self.install())
        self.assertTrue(self.hub.state()['installed'][0]['enabled'])
        self.assertEqual(1, sum(x['event'] == 'installed_disabled' for x in self.hub.state()['audit']))

    def test_operation_and_receipt_roll_back_together(self):
        def fail_after_install():
            self.hub.install(self.package)
            raise RuntimeError('simulated interruption before transaction commit')
        with self.assertRaises(RuntimeError):
            self.hub.request('retry', {'op': 'install'}, fail_after_install)
        self.assertEqual([], self.hub.state()['installed'])
        with self.hub.connect() as c:
            self.assertEqual(0, c.execute('SELECT COUNT(*) FROM hub_requests').fetchone()[0])
        result = self.hub.request('retry', {'op': 'install'}, lambda: self.hub.install(self.package))
        self.assertEqual(self.package['manifest']['id'], result['id'])

    def test_conflicting_retry_rejected_after_restart(self):
        self.install()
        self.hub = Hub(self.hub.db, {TEST_PUBLISHER: PUBLIC_TEST_KEY})
        with self.assertRaisesRegex(PackageError, 'conflict'):
            self.hub.request('install-1', {'op': 'uninstall'}, lambda: self.fail('must not execute'))

    def test_invalid_key_never_runs_mutation(self):
        for key in ('', ' ', 'x' * 129, 1, None):
            with self.subTest(key=key), self.assertRaises(PackageError):
                self.hub.request(key, {}, lambda: self.fail('must not execute'))

    def test_wallet_consent_exact_retry_retains_original_record(self):
        wallet = Wallet(self.root / 'wallet.db')
        first = wallet.consent_monthly(True, 'consent-1')
        wallet.consent_monthly(False, 'consent-2')
        self.assertEqual(first, wallet.consent_monthly(True, 'consent-1'))
        self.assertFalse(wallet.snapshot()['consent']['accepted'])
        with self.assertRaises(IdempotencyConflict):
            wallet.consent_monthly(False, 'consent-1')

    def test_unknown_retry_does_not_revert_final_reconciliation(self):
        wallet = Wallet(self.root / 'wallet.db')
        sale = wallet.simulate_sale(1000, 'sale')
        wallet.settle_sale(sale['id'], 'settle')
        withdrawal = wallet.reserve(500, 'reserve')
        unknown = wallet.mark_unknown(withdrawal['id'], 'unknown')
        wallet.reconcile(withdrawal['id'], 0, 'reconcile')
        self.assertEqual(unknown, wallet.mark_unknown(withdrawal['id'], 'unknown'))
        state = wallet.snapshot()
        self.assertEqual('REVERSED', state['withdrawals'][0]['status'])
        self.assertEqual(1000, state['available_minor'])


if __name__ == '__main__':
    unittest.main()

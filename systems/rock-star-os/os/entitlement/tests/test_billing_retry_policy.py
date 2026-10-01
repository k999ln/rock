"""Bounded real-ledger billing failures, distinct from unknown-result recovery."""
from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path
import sqlite3
import tempfile
import threading
import unittest
from unittest.mock import patch

from blackberryrock.wallet import Wallet
from entitlement.device import DeviceWalletAdapter
from entitlement.protocol import TERMS_VERSION, PUBLIC_TOKENS, sign_fixture_event
from entitlement.wallet_bridge import WalletBridge

FIXTURE = Path(__file__).resolve().parents[1] / 'fixtures/device-handoff.json'
NOW = int(datetime(2026, 9, 8, 9, tzinfo=timezone.utc).timestamp())
OCTOBER = int(datetime(2026, 10, 1, tzinfo=timezone.utc).timestamp())


class BillingRetryPolicyTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root, self.now = Path(self.temp.name), NOW
        self.wallet = Wallet(self.root / 'wallet.db')
        self.limit = 3
        self.adapter = self.make_adapter()
        self.addCleanup(lambda: self.adapter.close())
        self.call('wallet.register', 'register')
        self.call('wallet.consent', 'consent', accepted=True, terms_version=TERMS_VERSION)

    def make_adapter(self):
        return DeviceWalletAdapter(self.root / 'membership', self.wallet, provisioning_file=FIXTURE,
            clock=lambda: self.now, start_scheduler=False, retry_seconds=1,
            max_automatic_failures=self.limit)

    def call(self, op, key, **fields):
        value = self.adapter.dispatch({'v': 1, 'op': op, 'key': key, **fields}, peer_uid=1002)
        self.assertTrue(value['ok'], value)
        return value

    def due(self, period='2026-09'):
        return next(row for row in self.adapter.billing_status()['history'] if row['period'] == period)

    def authorizations(self):
        with closing(self.adapter.store._connect()) as db:
            return [dict(row) for row in db.execute('SELECT * FROM authorizations ORDER BY period')]

    def tick(self):
        self.now += 2
        return self.adapter.tick()

    def exhaust(self):
        for _ in range(self.limit):
            self.assertTrue(self.tick())
        row = self.due()
        self.assertEqual((row['status'], row['automatic_failures']), ('blocked', self.limit))
        self.assertIs(row['automatic_retry_exhausted'], True)

    def fund(self, amount=5000, key='fund', *, settle=True):
        sale = self.wallet.simulate_sale(amount, key)
        if settle:
            self.wallet.settle_sale(sale['id'], key+'-settle')
        return sale

    def restart(self):
        self.adapter.close()
        self.adapter = self.make_adapter()

    def test_default_limit_and_strict_configuration(self):
        self.assertEqual(self.adapter.billing_status()['retry_policy']['max_automatic_failures'], 3)
        for value in (True, False, 0, -1, 101, 3.0, '3', None):
            with self.subTest(value=value), self.assertRaises(ValueError):
                DeviceWalletAdapter(self.root/'unused', self.wallet, start_scheduler=False,
                                    max_automatic_failures=value)

    def test_definite_failure_cap_survives_restart_and_does_not_touch_money(self):
        before = self.wallet.snapshot()
        self.exhaust()
        original = self.authorizations()
        self.restart()
        for _ in range(6):
            self.assertFalse(self.tick())
        self.assertEqual(self.authorizations(), original)
        self.assertEqual(original[0]['attempt'], 3)
        self.assertEqual(self.wallet.snapshot()['journals'], before['journals'])
        self.assertEqual(self.wallet.snapshot()['bills'], [])

    def test_manual_requests_coalesce_one_attempt_without_reset_or_cached_replay(self):
        self.exhaust()
        first = self.call('wallet.bill', 'manual-a', period='2026-09')
        self.call('wallet.bill', 'manual-b', period='2026-09')
        self.assertTrue(self.tick())
        self.assertEqual((self.authorizations()[0]['attempt'], self.due()['automatic_failures']), (4, 4))
        self.assertEqual(first, self.call('wallet.bill', 'manual-a', period='2026-09'))
        self.call('wallet.bill', 'manual-b', period='2026-09')
        self.assertFalse(self.tick())
        self.assertEqual(self.authorizations()[0]['attempt'], 4)

    def test_only_new_settlement_and_sufficient_increased_available_resume(self):
        self.exhaust()
        original_id = self.authorizations()[0]['authorization_id']
        sale = self.fund(settle=False)
        self.assertFalse(self.tick())
        self.wallet.settle_sale(sale['id'], 'actual-settlement')
        self.assertTrue(self.tick())
        self.assertEqual(self.due()['status'], 'paid')
        self.assertEqual(self.due()['automatic_failures'], 0)
        self.assertEqual(self.authorizations()[0]['authorization_id'], original_id)
        self.assertEqual((self.wallet.snapshot()['available_minor'], self.wallet.snapshot()['billed_minor']), (4112, 888))
        self.assertFalse(self.tick())

    def test_small_settlement_or_hold_release_cannot_reset_automatic_budget(self):
        self.fund()
        held = self.wallet.reserve(4500, 'hold')
        self.exhaust()
        self.wallet.reconcile(held['id'], 0, 'hold-release')
        self.assertFalse(self.tick())
        self.assertEqual(self.due()['automatic_failures'], 3)
        self.assertEqual(self.wallet.snapshot()['billed_minor'], 0)
        self.call('wallet.bill', 'deliberate-manual-retry', period='2026-09')
        self.assertTrue(self.tick())
        self.assertEqual(self.wallet.snapshot()['billed_minor'], 888)

    def test_new_settlement_below_fee_does_not_reset(self):
        self.exhaust()
        self.fund(887)
        self.assertFalse(self.tick())
        self.assertEqual(self.due()['automatic_failures'], 3)

    def test_unknown_attempts_do_not_consume_budget_or_new_claims(self):
        self.tick()
        self.tick()
        with patch.object(WalletBridge, 'execute', side_effect=OSError('unknown before debit')):
            for _ in range(7):
                with self.assertRaises(OSError):
                    self.tick()
        self.assertEqual(self.due()['status'], 'processing')
        self.assertEqual(self.due()['automatic_failures'], 2)
        self.assertEqual(self.authorizations()[0]['attempt'], 3)
        self.fund()
        self.restart()
        self.assertTrue(self.tick())
        self.assertEqual(self.wallet.snapshot()['billed_minor'], 888)

    def test_exhausted_manual_commit_lost_ack_recovers_after_cancel_and_restart(self):
        self.fund()
        held = self.wallet.reserve(4500, 'hold-before-failures')
        self.exhaust()
        self.wallet.reconcile(held['id'], 0, 'release-for-manual')
        self.call('wallet.bill', 'manual-after-cap', period='2026-09')
        original = self.wallet.bill
        def lose_ack(*args, **kwargs):
            original(*args, **kwargs)
            raise OSError('actual bill committed but acknowledgement lost')
        with patch.object(self.wallet, 'bill', side_effect=lose_ack), self.assertRaises(OSError):
            self.tick()
        before = self.wallet.snapshot()
        self.assertEqual(before['billed_minor'], 888)
        self.assertEqual(self.due()['automatic_failures'], 3)
        self.call('wallet.consent', 'cancel-unknown', accepted=False, terms_version=TERMS_VERSION)
        self.restart()
        with patch.object(self.wallet, 'bill', side_effect=AssertionError('must reconcile existing bill')):
            self.assertTrue(self.tick())
        self.assertEqual(self.due()['status'], 'paid')
        self.assertEqual(self.wallet.snapshot()['journals'], before['journals'])
        self.assertFalse(self.adapter.membership()['entitlement']['auto_renew'])

    def test_failed_bridge_commit_counted_once_after_schedule_update_loss(self):
        self.limit = 1
        self.restart()
        with self.adapter.store._transaction() as db:
            db.execute("CREATE TRIGGER fail_count BEFORE UPDATE ON device_monthly_due WHEN NEW.last_failed_attempt>0 BEGIN SELECT RAISE(ABORT,'failure-count write lost'); END")
        with self.assertRaises(sqlite3.IntegrityError):
            self.tick()
        self.assertEqual(self.authorizations()[0]['state'], 'FAILED')
        with self.adapter.store._transaction() as db:
            db.execute('DROP TRIGGER fail_count')
        self.restart()
        with patch.object(self.wallet, 'bill', side_effect=AssertionError('must first count committed failure')):
            self.assertTrue(self.tick())
        self.assertEqual((self.due()['automatic_failures'], self.authorizations()[0]['attempt']), (1, 1))
        self.assertFalse(self.tick())

    def test_rollover_and_new_funding_do_not_collect_exhausted_backlog(self):
        self.exhaust()
        september = self.authorizations()[0]
        self.now = OCTOBER
        self.fund()
        self.assertTrue(self.tick())
        self.assertEqual([bill['period'] for bill in self.wallet.snapshot()['bills']], ['2026-10'])
        self.assertEqual(self.authorizations()[0], september)
        self.assertEqual(self.due()['automatic_failures'], 3)
        self.assertEqual(self.wallet.snapshot()['billed_minor'], 888)

    def test_legacy_due_migration_counts_applied_failures_and_preserves_receipts(self):
        self.exhaust()
        with self.adapter.store._transaction() as db:
            before = [tuple(row) for row in db.execute('SELECT * FROM device_api_receipts ORDER BY key')]
            db.executescript('''
                CREATE TABLE legacy_due (
                    period TEXT PRIMARY KEY, schedule_id TEXT NOT NULL UNIQUE,
                    account_id TEXT NOT NULL REFERENCES accounts(account_id),
                    status TEXT NOT NULL CHECK(status IN ('due','processing','retry_wait','paid','blocked')),
                    generation INTEGER NOT NULL DEFAULT 0, authorization_id TEXT,
                    next_attempt REAL NOT NULL, failures INTEGER NOT NULL DEFAULT 0,
                    last_error TEXT, updated_at INTEGER NOT NULL);
                INSERT INTO legacy_due SELECT period,schedule_id,account_id,'retry_wait',generation,
                    authorization_id,next_attempt,failures,last_error,updated_at FROM device_monthly_due;
                DROP TABLE device_monthly_due;
                ALTER TABLE legacy_due RENAME TO device_monthly_due;
            ''')
        original = self.authorizations()
        self.restart()
        self.assertEqual(self.due()['automatic_failures'], 3)
        self.assertEqual(self.due()['last_failed_attempt'], 3)
        self.assertFalse(self.tick())
        self.assertEqual(self.authorizations(), original)
        with closing(self.adapter.store._connect()) as db:
            after = [tuple(row) for row in db.execute('SELECT * FROM device_api_receipts ORDER BY key')]
        self.assertEqual(before, after)

    def test_late_applied_paid_observation_recovers_exhausted_due_after_cancel(self):
        self.exhaust()
        authorization = self.authorizations()[0]
        self.fund()
        # A real Wallet bill plus authenticated late reconciliation observation;
        # no fabricated balance or receipt is used to reopen the exhausted due.
        bill = self.wallet.bill('2026-09', authorization['authorization_id'])
        sequence = self.adapter.store.next_billing_sequence(authorization['authorization_id'], PUBLIC_TOKENS['wallet'])
        self.adapter.store.ingest(sign_fixture_event('wallet', 'late-real-paid',
            'billing:'+authorization['authorization_id'], sequence, self.now, 'payment_succeeded',
            {'authorization_id':authorization['authorization_id'], 'attempt':authorization['attempt'],
             'period':'2026-09', 'amount_minor':888, 'currency':'USD', 'wallet_bill_id':bill['id']}))
        self.call('wallet.consent', 'cancel-after-late-observation', accepted=False, terms_version=TERMS_VERSION)
        before = self.wallet.snapshot()
        self.restart()
        with patch.object(self.wallet, 'bill', side_effect=AssertionError('existing paid observation must not debit')):
            self.assertTrue(self.tick())
        self.assertEqual(self.due()['status'], 'paid')
        self.assertFalse(self.due()['automatic_retry_exhausted'])
        self.assertEqual(self.wallet.snapshot()['journals'], before['journals'])
        self.assertFalse(self.adapter.membership()['entitlement']['auto_renew'])

    def test_cancel_clears_manual_permission_and_funding_does_not_restore_consent(self):
        self.exhaust()
        self.call('wallet.bill', 'manual-cancelled', period='2026-09')
        self.call('wallet.consent', 'cancel-before-manual', accepted=False, terms_version=TERMS_VERSION)
        self.fund()
        self.assertFalse(self.tick())
        self.assertFalse(self.due()['manual_retry_pending'])
        self.assertEqual(self.due()['automatic_failures'], 3)
        self.assertEqual(self.wallet.snapshot()['billed_minor'], 0)

    def test_cancel_race_after_manual_execution_started_preserves_one_paid_month(self):
        self.fund()
        held = self.wallet.reserve(4500, 'race-hold')
        self.exhaust()
        self.wallet.reconcile(held['id'], 0, 'race-release')
        self.call('wallet.bill', 'race-manual', period='2026-09')
        original = self.wallet.bill
        entered, release, cancelling = threading.Event(), threading.Event(), threading.Event()
        def delayed_bill(*args, **kwargs):
            entered.set()
            if not release.wait(3):
                raise AssertionError('test barrier timed out')
            return original(*args, **kwargs)
        def cancel():
            cancelling.set()
            return self.call('wallet.consent', 'race-cancel', accepted=False, terms_version=TERMS_VERSION)
        with patch.object(self.wallet, 'bill', side_effect=delayed_bill), ThreadPoolExecutor(max_workers=2) as pool:
            payment = pool.submit(self.tick)
            self.assertTrue(entered.wait(2))
            cancellation = pool.submit(cancel)
            self.assertTrue(cancelling.wait(1))
            self.assertFalse(cancellation.done())
            release.set()
            self.assertTrue(payment.result(timeout=3))
            self.assertTrue(cancellation.result(timeout=3)['ok'])
        self.assertEqual(self.wallet.snapshot()['billed_minor'], 888)
        self.assertFalse(self.adapter.membership()['entitlement']['auto_renew'])
        self.assertEqual(self.due()['status'], 'paid')


if __name__ == '__main__':
    unittest.main()

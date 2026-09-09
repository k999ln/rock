"""Actual SQLite contract/device boundaries; synthetic identities and money only.

Legacy fixtures below remove only the new additive link schema, preserving the
old account/receipt/authorization layout. No HTTP, OS boot or provider claim.
"""
from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
import hashlib
from pathlib import Path
import sqlite3
import tempfile
import threading
import unittest
from unittest.mock import patch

from blackberryrock.wallet import Wallet
from entitlement.protocol import (PUBLIC_TOKENS, TERMS_VERSION, AuthenticationError,
                                  Conflict, NotEligible, sign_fixture_event)
from entitlement.store import EntitlementStore
from entitlement.wallet_bridge import WalletBridge

A, B, W = (PUBLIC_TOKENS[name] for name in ('alice', 'bob', 'wallet'))
NOW = 1788858000


class MultiDeviceContractTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.now = NOW
        self.store = EntitlementStore(self.root / 'entitlement.db', clock=lambda: self.now)
        self.sequences = {}

    def event(self, device, kind='handoff', *, owner='alice', valid_until=None):
        sequence = self.sequences.get(device, 0) + 1
        self.sequences[device] = sequence
        payload = {'device_ref': device}
        if kind != 'suspend':
            payload.update(verification_ref='fixture-verification-' + device,
                           verified_at=self.now, valid_until=valid_until or self.now + 90 * 86400)
        if kind == 'handoff':
            payload.update(owner_ref='fixture-owner-' + owner, purchase_ref='fixture-purchase-' + device)
        envelope = sign_fixture_event('fulfillment', f'event-{device}-{sequence}',
                                      'device:' + device, sequence, self.now, kind, payload)
        self.store.ingest(envelope)
        return envelope

    def registered_pair(self, *, consent=True):
        for device in ('fixture-a', 'fixture-b'):
            self.event(device)
        account = self.store.register('fixture-a', 'register-a', A)['account_id']
        self.assertEqual(account, self.store.register('fixture-b', 'register-b', A)['account_id'])
        if consent:
            self.store.consent(account, True, TERMS_VERSION, 'consent', A)
        return account

    def rows(self, table):
        # Only test-owned fixed table literals reach this observer.
        with closing(sqlite3.connect(self.store.path)) as db:
            return db.execute('SELECT * FROM ' + table + ' ORDER BY rowid').fetchall()

    def business_rows(self):
        tables = ('devices', 'accounts', 'consents', 'authorizations', 'authorization_claims',
                  'receipts', 'wallet_bindings', 'streams', 'events')
        return {table: self.rows(table) for table in tables}

    def legacy_account(self):
        self.event('fixture-a')
        account = 'acct-' + hashlib.sha256(b'fixture-a').hexdigest()[:32]
        with self.store._transaction() as db:
            db.execute('INSERT INTO accounts(account_id,device_ref,owner_ref) VALUES (?,?,?)',
                       (account, 'fixture-a', 'fixture-owner-alice'))
            self.store._link_device(db, 'fixture-a', account)
        receipt = self.store.register('fixture-a', 'legacy-registration', A)
        self.assertEqual(account, receipt['account_id'])
        return account, receipt

    def remove_contract_schema(self):
        with self.store._transaction() as db:
            db.execute('DROP TABLE account_devices')
            db.execute('DROP INDEX accounts_one_contract_per_owner')

    def test_concurrent_two_device_registration_reuses_one_owner_contract(self):
        self.event('fixture-a')
        self.event('fixture-b')
        stores = [EntitlementStore(self.store.path, clock=lambda: self.now) for _ in range(2)]
        barrier = threading.Barrier(2)
        def register(index):
            barrier.wait(timeout=3)
            return stores[index].register(('fixture-a', 'fixture-b')[index], f'parallel-{index}', A)
        with ThreadPoolExecutor(max_workers=2) as pool:
            receipts = list(pool.map(register, range(2)))
        self.assertEqual(receipts[0]['account_id'], receipts[1]['account_id'])
        self.assertEqual(1, len(self.rows('accounts')))
        self.assertEqual(2, len(self.rows('account_devices')))
        for index, device in enumerate(('fixture-a', 'fixture-b')):
            self.assertEqual(receipts[index], self.store.register(device, f'parallel-{index}', A))
        with self.assertRaises(Conflict):
            self.store.register('fixture-b', 'parallel-0', A)

    def test_two_device_authorizations_and_actual_bridge_debit_once(self):
        account = self.registered_pair()
        stores = [EntitlementStore(self.store.path, clock=lambda: self.now) for _ in range(2)]
        barrier = threading.Barrier(2)
        def authorize(index):
            contract = stores[index].account_for_device(('fixture-a', 'fixture-b')[index], A)
            barrier.wait(timeout=3)
            grant = stores[index].authorize_month(contract, '2026-09', f'authorize-{index}', W)
            return stores[index].claim_authorization(grant['authorization_id'], f'claim-{index}', W)
        with ThreadPoolExecutor(max_workers=2) as pool:
            grants = list(pool.map(authorize, range(2)))
        self.assertEqual(grants[0]['authorization_id'], grants[1]['authorization_id'])
        self.assertEqual(1, len(self.rows('authorizations')))
        self.assertEqual(1, len(self.rows('authorization_claims')))
        wallet = Wallet(self.root / 'wallet.db')
        sale = wallet.simulate_sale(5000, 'sale')
        wallet.settle_sale(sale['id'], 'settle')
        bridges = [WalletBridge(store, wallet, account, W) for store in stores]
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(lambda i: bridges[i].execute(grants[i]['authorization_id'], f'execute-{i}', W), range(2)))
        self.assertTrue(all(result['authorization']['state'] == 'PAID' for result in results))
        self.assertEqual((4112, 888, 1), (wallet.snapshot()['available_minor'], wallet.snapshot()['billed_minor'],
                                        len(wallet.snapshot()['bills'])))

    def test_shared_cancel_reconsent_does_not_create_second_month(self):
        account = self.registered_pair()
        grant = self.store.authorize_month(account, '2026-09', 'authorize', W)
        from_b = self.store.account_for_device('fixture-b', A)
        self.store.consent(from_b, False, TERMS_VERSION, 'cancel-b', A)
        for device in ('fixture-a', 'fixture-b'):
            self.assertFalse(self.store.entitlement(account, A, device_ref=device)['auto_renew'])
        self.assertEqual('CANCELED', self.store.authorization(grant['authorization_id'], W)['state'])
        with self.assertRaises(NotEligible):
            self.store.claim_authorization(grant['authorization_id'], 'stale-claim', W)
        self.store.consent(account, True, TERMS_VERSION, 'reconsent-a', A)
        renewed = self.store.authorize_month(from_b, '2026-09', 'rearm-b', W)
        self.assertEqual(grant['authorization_id'], renewed['authorization_id'])

    def test_suspended_primary_is_not_admitted_but_valid_alias_can_bill(self):
        account = self.registered_pair()
        grant = self.store.authorize_month(account, '2026-09', 'authorize', W)
        self.event('fixture-a', 'suspend')
        self.assertFalse(self.store.entitlement(account, A)['device_eligible'])
        self.assertTrue(self.store.entitlement(account, A, device_ref='fixture-b')['device_eligible'])
        contract = self.store.contract_entitlement(account, A)
        self.assertEqual(('contract', 'fixture-a', 'fixture-b', ['fixture-b']),
                         (contract['scope'], contract['device_ref'], contract['eligibility_device_ref'], contract['eligible_device_refs']))
        self.assertEqual('ISSUED', self.store.authorization(grant['authorization_id'], W)['state'])
        self.assertEqual(account, self.store.account_for_device('fixture-a', A))
        with self.assertRaises(NotEligible):
            with self.store.authorized_device('fixture-a', A):
                self.fail('suspended primary must not borrow alias eligibility')
        with self.assertRaises(NotEligible):
            self.store.register('fixture-a', 'register-a', A)
        claimed = self.store.claim_authorization(grant['authorization_id'], 'claim-b', W)
        self.assertEqual('CLAIMED', claimed['state'])

    def test_expired_primary_uses_valid_alias_authorization_deadline(self):
        self.event('fixture-a', valid_until=self.now + 5)
        self.event('fixture-b')
        account = self.store.register('fixture-a', 'a', A)['account_id']
        self.store.register('fixture-b', 'b', A)
        self.now += 6
        self.store.consent(account, True, TERMS_VERSION, 'consent-b', A)
        grant = self.store.authorize_month(account, '2026-09', 'authorize-b', W)
        self.assertEqual(self.now + self.store.authorization_ttl, grant['expires_at'])
        self.assertEqual('CLAIMED', self.store.claim_authorization(grant['authorization_id'], 'claim', W)['state'])
        self.assertEqual(account, self.store.account_for_device('fixture-a', A))
        self.assertFalse(self.store.entitlement(account, A)['device_eligible'])
        with self.assertRaises(NotEligible):
            with self.store.authorized_device('fixture-a', A):
                self.fail('expired device cannot borrow another device verification')

    def test_last_suspend_cancels_unclaimed_then_restore_reuses_contract(self):
        account = self.registered_pair()
        grant = self.store.authorize_month(account, '2026-09', 'authorize', W)
        self.event('fixture-a', 'suspend')
        self.event('fixture-b', 'suspend')
        self.assertEqual('CANCELED', self.store.authorization(grant['authorization_id'], W)['state'])
        self.assertFalse(self.store.contract_entitlement(account, A)['device_eligible'])
        self.event('fixture-b', 'restore')
        self.assertTrue(self.store.contract_entitlement(account, A)['auto_renew'])
        restored = self.store.authorize_month(account, '2026-09', 'restored', W)
        self.assertEqual(grant['authorization_id'], restored['authorization_id'])
        self.assertEqual(account, self.store.register('fixture-b', 'reregister', A)['account_id'])

    def test_last_suspend_preserves_claimed_and_late_paid_observation(self):
        account = self.registered_pair()
        grant = self.store.authorize_month(account, '2026-09', 'authorize', W)
        grant = self.store.claim_authorization(grant['authorization_id'], 'claim', W)
        self.event('fixture-a', 'suspend')
        self.event('fixture-b', 'suspend')
        self.assertEqual('CLAIMED', self.store.authorization(grant['authorization_id'], W)['state'])
        self.store.ingest(sign_fixture_event('wallet', 'late-success', 'billing:' + grant['authorization_id'], 1,
            self.now, 'payment_succeeded', {'authorization_id': grant['authorization_id'], 'attempt': 1,
                'period': '2026-09', 'amount_minor': 888, 'currency': 'USD', 'wallet_bill_id': 'fixture-observed-bill'}))
        self.event('fixture-b', 'restore')
        self.event('fixture-b', 'suspend')
        self.assertEqual('PAID', self.store.authorization(grant['authorization_id'], W)['state'])

    def test_last_suspend_cancels_failed_authorization_without_losing_history(self):
        account = self.registered_pair()
        grant = self.store.authorize_month(account, '2026-09', 'authorize', W)
        grant = self.store.claim_authorization(grant['authorization_id'], 'claim', W)
        self.store.ingest(sign_fixture_event('wallet', 'known-failure', 'billing:' + grant['authorization_id'], 1,
            self.now, 'payment_failed', {'authorization_id': grant['authorization_id'], 'attempt': 1,
                'period': '2026-09', 'amount_minor': 888, 'currency': 'USD', 'reason': 'insufficient_funds'}))
        receipts, claims = self.rows('receipts'), self.rows('authorization_claims')
        self.event('fixture-a', 'suspend')
        self.assertEqual('FAILED', self.store.authorization(grant['authorization_id'], W)['state'])
        self.event('fixture-b', 'suspend')
        self.assertEqual('CANCELED', self.store.authorization(grant['authorization_id'], W)['state'])
        self.assertEqual(receipts, self.rows('receipts'))
        self.assertEqual(claims, self.rows('authorization_claims'))

    def test_bob_has_isolated_contract_and_cannot_link_or_inspect_alice(self):
        account = self.registered_pair(consent=False)
        self.event('fixture-bob', owner='bob')
        bob = self.store.register('fixture-bob', 'bob', B)['account_id']
        self.assertNotEqual(account, bob)
        for action in (lambda: self.store.register('fixture-b', 'steal', B),
                       lambda: self.store.account_for_device('fixture-b', B),
                       lambda: self.store.entitlement(account, B),
                       lambda: self.store.contract_entitlement(account, B),
                       lambda: self.store.entitlement(account, A, device_ref='fixture-bob')):
            with self.assertRaises((AuthenticationError, NotEligible)):
                action()
        self.event('fixture-bob-unregistered', owner='bob')
        with self.assertRaisesRegex(sqlite3.IntegrityError, 'owner mismatch'), self.store._transaction() as db:
            db.execute('INSERT INTO account_devices VALUES (?,?)', ('fixture-bob-unregistered', account))
        self.assertFalse(self.store.contract_entitlement(account, A)['auto_renew'])
        self.assertFalse(self.store.contract_entitlement(bob, B)['auto_renew'])
        self.store.consent(bob, True, TERMS_VERSION, 'bob-consent', B)
        bob_grant = self.store.authorize_month(bob, '2026-09', 'bob-month', W)
        self.assertEqual(bob, bob_grant['account_id'])
        self.assertFalse(self.store.contract_entitlement(account, A)['auto_renew'])
        self.assertTrue(self.store.contract_entitlement(bob, B)['auto_renew'])
        with self.assertRaises(NotEligible):
            self.store.authorize_month(account, '2026-09', 'alice-no-consent', W)

    def test_links_are_immutable_and_unregistered_device_is_not_an_alias(self):
        account = self.registered_pair()
        self.event('fixture-not-linked')
        with self.assertRaises(NotEligible):
            self.store.account_for_device('fixture-not-linked', A)
        with self.assertRaises(NotEligible):
            self.store.entitlement(account, A, device_ref='fixture-not-linked')
        for sql in ("DELETE FROM account_devices WHERE device_ref='fixture-b'",
                    "UPDATE account_devices SET device_ref='fixture-not-linked' WHERE device_ref='fixture-b'"):
            with self.assertRaises(sqlite3.IntegrityError), self.store._transaction() as db:
                db.execute(sql)
        self.event('fixture-a', 'suspend')
        self.event('fixture-b', 'suspend')
        self.assertFalse(self.store.contract_entitlement(account, A)['device_eligible'])

    def test_legacy_migration_preserves_id_receipts_claims_wallet_and_hold(self):
        account, receipt = self.legacy_account()
        self.store.consent(account, True, TERMS_VERSION, 'consent', A)
        grant = self.store.authorize_month(account, '2026-09', 'authorize', W)
        self.store.claim_authorization(grant['authorization_id'], 'claim', W)
        wallet = Wallet(self.root / 'wallet.db')
        sale = wallet.simulate_sale(5000, 'sale')
        wallet.settle_sale(sale['id'], 'settle')
        WalletBridge(self.store, wallet, account, W).execute(grant['authorization_id'], 'execute', W)
        hold = wallet.reserve(1000, 'hold')
        wallet.mark_unknown(hold['id'], 'uncertain')
        self.remove_contract_schema()
        before, wallet_before = self.business_rows(), wallet.snapshot()
        self.store = EntitlementStore(self.store.path, clock=lambda: self.now)
        self.assertEqual(before, self.business_rows())
        self.assertEqual(wallet_before, wallet.snapshot())
        self.assertEqual(receipt, self.store.register('fixture-a', 'legacy-registration', A))
        self.event('fixture-b')
        self.assertEqual(account, self.store.register('fixture-b', 'new-device', A)['account_id'])
        self.assertEqual('fixture-a', self.store.entitlement(account, A)['device_ref'])
        self.assertEqual(wallet_before, wallet.snapshot())
        WalletBridge(self.store, wallet, account, W)  # Existing binding, no replacement ledger.
        after = self.business_rows()
        self.store = EntitlementStore(self.store.path, clock=lambda: self.now)
        self.assertEqual(after, self.business_rows())
        self.assertEqual(account, self.store.account_for_device('fixture-b', A))

    def test_ambiguous_legacy_accounts_rejected_before_schema_or_business_write(self):
        account, _ = self.legacy_account()
        self.event('fixture-b')
        self.remove_contract_schema()
        with self.store._transaction() as db:
            db.execute('INSERT INTO accounts(account_id,device_ref,owner_ref) VALUES (?,?,?)',
                       ('acct-legacy-second', 'fixture-b', 'fixture-owner-alice'))
        before = self.business_rows()
        for _ in range(2):
            with self.assertRaisesRegex(Conflict, 'explicit contract migration required'):
                EntitlementStore(self.store.path, clock=lambda: self.now)
        self.assertEqual(before, self.business_rows())
        with closing(sqlite3.connect(self.store.path)) as db:
            self.assertIsNone(db.execute("SELECT name FROM sqlite_master WHERE name='account_devices'").fetchone())
        self.assertEqual(account, before['accounts'][0][0])

    def test_partial_migration_rolls_back_and_restart_retains_legacy_receipt(self):
        account, receipt = self.legacy_account()
        self.remove_contract_schema()
        before = self.business_rows()
        original = EntitlementStore._link_device
        def fail_after_link(db, device_ref, account_id):
            original(db, device_ref, account_id)
            raise OSError('synthetic migration storage failure')
        with patch.object(EntitlementStore, '_link_device', side_effect=fail_after_link):
            with self.assertRaises(OSError):
                EntitlementStore(self.store.path, clock=lambda: self.now)
        self.assertEqual(before, self.business_rows())
        with closing(sqlite3.connect(self.store.path)) as db:
            self.assertIsNone(db.execute("SELECT name FROM sqlite_master WHERE name='account_devices'").fetchone())
        restarted = EntitlementStore(self.store.path, clock=lambda: self.now)
        self.assertEqual(account, restarted.account_for_device('fixture-a', A))
        self.assertEqual(receipt, restarted.register('fixture-a', 'legacy-registration', A))

    def test_authorized_device_before_registration_serializes_same_store_suspend(self):
        self.event('fixture-a')
        started, committed = threading.Event(), threading.Event()
        event = sign_fixture_event('fulfillment', 'concurrent-suspend', 'device:fixture-a', 2,
                                   self.now, 'suspend', {'device_ref': 'fixture-a'})
        def suspend():
            started.set()
            self.store.ingest(event)
            committed.set()
        with ThreadPoolExecutor(max_workers=1) as pool:
            with self.store.authorized_device('fixture-a', A) as admitted:
                self.assertEqual('fixture-owner-alice', admitted['owner_ref'])
                future = pool.submit(suspend)
                self.assertTrue(started.wait(2))
                # Nested service mutation remains reentrant and can commit;
                # the other thread's signed suspension must follow this action.
                receipt = self.store.register('fixture-a', 'guarded-register', A)
                self.assertFalse(committed.is_set())
                self.assertTrue(self.store.entitlement(receipt['account_id'], A)['device_eligible'])
            future.result(timeout=3)
        self.assertTrue(committed.is_set())
        with self.assertRaises(NotEligible):
            with self.store.authorized_device('fixture-a', A):
                self.fail('suspension must deny subsequent admission')

    def test_authorized_device_exception_releases_guard_and_wrong_owner_denied(self):
        self.event('fixture-a')
        with self.assertRaises(RuntimeError):
            with self.store.authorized_device('fixture-a', A):
                raise RuntimeError('service action failed')
        with self.assertRaises(NotEligible):
            with self.store.authorized_device('fixture-a', B):
                self.fail('owner mismatch')
        self.event('fixture-a', 'suspend')
        with self.assertRaises(NotEligible):
            with self.store.authorized_device('fixture-a', A):
                self.fail('guard leaked or state remained eligible')


if __name__ == '__main__':
    unittest.main()

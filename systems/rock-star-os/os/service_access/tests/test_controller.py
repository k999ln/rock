"""Actual SQLite, signed public events and existing Wallet ledger boundaries.

No network, physical device, private keys, provider or real funds are exercised.
"""
from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
from copy import deepcopy
from datetime import datetime, timezone
import json
from pathlib import Path
import sqlite3
import tempfile
import threading
import unittest
from unittest.mock import patch

from blackberryrock.wallet import Wallet
from entitlement.protocol import PUBLIC_TOKENS, TERMS_VERSION, sign_fixture_event
from entitlement.store import EntitlementStore
from entitlement.wallet_bridge import WalletBridge
from service_access import (PUBLIC_SERVICE_TOKENS, ServiceAccessController, ServiceAccessDenied,
                            ServiceAuthenticationError, ServiceClockError, ServiceConfigurationError)

AUTHORITY = 'cbb59e2b-373a-4e79-ad16-88a75c9bd6f3'
A, B, W = (PUBLIC_TOKENS[key] for key in ('alice', 'bob', 'wallet'))
NOW = int(datetime(2026, 9, 8, 12, tzinfo=timezone.utc).timestamp())
OCTOBER = int(datetime(2026, 10, 1, tzinfo=timezone.utc).timestamp())


class ServiceAccessTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.now = NOW
        self.store = EntitlementStore(self.root / 'entitlement.db', clock=lambda: self.now)
        self.sequences = {}
        self.consumers = {
            'alice-a': {'owner_actor': 'alice', 'device_ref': 'fixture-a', 'token': PUBLIC_SERVICE_TOKENS['alice-a']},
            'alice-b': {'owner_actor': 'alice', 'device_ref': 'fixture-b', 'token': PUBLIC_SERVICE_TOKENS['alice-b']},
            'bob': {'owner_actor': 'bob', 'device_ref': 'fixture-bob', 'token': PUBLIC_SERVICE_TOKENS['bob']},
        }

    def controller(self, **kwargs):
        return ServiceAccessController(self.store, authority_id=AUTHORITY, consumers=self.consumers, **kwargs)

    def event(self, device='fixture-a', kind='handoff', *, owner='alice', valid_until=None, verified_at=None,
              occurred_at=None):
        seq = self.sequences.get(device, 0) + 1
        self.sequences[device] = seq
        payload = {'device_ref': device}
        if kind != 'suspend':
            payload.update(verification_ref='fixture-verification-' + device,
                           verified_at=self.now if verified_at is None else verified_at,
                           valid_until=valid_until or self.now + 90 * 86400)
        if kind == 'handoff':
            payload.update(owner_ref='fixture-owner-' + owner, purchase_ref='fixture-purchase-' + device)
        envelope = sign_fixture_event('fulfillment', f'event-{device}-{seq}', 'device:' + device,
                                      seq, self.now if occurred_at is None else occurred_at, kind, payload)
        receipt = self.store.ingest(envelope)
        self.assertEqual('APPLIED', self.store.event_status(receipt['event_id'], PUBLIC_TOKENS['fulfillment'])['status'])
        return envelope

    def register(self, *, consent=True):
        self.event()
        account = self.store.register('fixture-a', 'register-a', A)['account_id']
        if consent:
            self.store.consent(account, True, TERMS_VERSION, 'consent-a', A)
        return account

    def claim(self, account, suffix='first'):
        period = datetime.fromtimestamp(self.now, timezone.utc).strftime('%Y-%m')
        auth = self.store.authorize_month(account, period, 'authorize-' + suffix, W)
        return self.store.claim_authorization(auth['authorization_id'], 'claim-' + suffix, W)

    def pay(self, account, *, suffix='first', wallet=None):
        if wallet is None:
            wallet = Wallet(self.root / 'wallet.db')
            sale = wallet.simulate_sale(5000, 'sale')
            wallet.settle_sale(sale['id'], 'settle')
        grant = self.claim(account, suffix)
        result = WalletBridge(self.store, wallet, account, W).execute(grant['authorization_id'], 'execute-' + suffix, W)
        self.assertEqual('PAID', result['authorization']['state'])
        return wallet, grant, result

    def rows(self, table):
        with closing(self.store._connect()) as db:
            return [tuple(row) for row in db.execute('SELECT * FROM ' + table + ' ORDER BY rowid')]

    def state_rows(self):
        with closing(self.store._connect()) as db:
            tables = [row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")]
        return {table: self.rows(table) for table in tables}

    def test_purchased_unregistered_store_and_pc_work_without_wallet_consent_or_balance(self):
        self.event()
        controller = self.controller()
        for action in ('registry.index', 'registry.package', 'runner.pc_usb.submit', 'runner.pc_usb.start',
                       'runner.pc_usb.recover', 'runner.cloud.recover'):
            with self.subTest(action=action), controller.guard('alice-a', action) as receipt:
                self.assertIsNone(receipt['account_id'])
                self.assertEqual('PAUSED', receipt['paid_state'])
                self.assertTrue(receipt['simulation_only'])
        with self.assertRaises(ServiceAccessDenied):
            with controller.guard('alice-a', 'runner.cloud.submit'):
                self.fail('new paid service must not infer a first-month trial')
        self.assertEqual([], self.rows('accounts'))
        self.assertEqual([], self.rows('consents'))

    def test_authentication_rejects_swapped_wallet_author_malformed_and_absent_credentials(self):
        controller = self.controller()
        self.assertEqual('alice-a', controller.authenticate('alice-a', 'Bearer ' + PUBLIC_SERVICE_TOKENS['alice-a']))
        for alias, header in (('absent', 'Bearer '+PUBLIC_SERVICE_TOKENS['alice-a']),
                              ('alice-a', 'Bearer '+PUBLIC_SERVICE_TOKENS['alice-b']),
                              ('alice-a', 'Bearer '+A), ('alice-a', 'Bearer PUBLIC-FIXTURE-AUTHOR-ALICE-v1'),
                              ('alice-a', None), ('alice-a', 'bearer '+PUBLIC_SERVICE_TOKENS['alice-a']),
                              ('alice-a', 'Bearer '+PUBLIC_SERVICE_TOKENS['alice-a']+' '),
                              ('alice-a', '\ud800'), ('alice-a', 'x'*257)):
            with self.subTest(alias=alias, header_type=type(header).__name__), self.assertRaises(ServiceAuthenticationError):
                controller.authenticate(alias, header)

    def test_unknown_unpurchased_wrong_owner_suspended_and_expired_devices_are_denied(self):
        controller = self.controller()
        with self.assertRaises(ServiceAccessDenied):
            with controller.guard('alice-a', 'registry.index'):
                self.fail('handoff is required')
        self.event('fixture-a', owner='bob')
        self.assertEqual('OWNER_MISMATCH', controller.snapshot('alice-a')['purchase_reason'])
        with self.assertRaises(ServiceAccessDenied):
            with controller.guard('alice-a', 'registry.package'):
                self.fail('owner mismatch')
        self.event('fixture-b', valid_until=self.now + 5)
        with controller.guard('alice-b', 'registry.index'):
            pass
        self.now += 5
        with self.assertRaises(ServiceAccessDenied) as error:
            with controller.guard('alice-b', 'runner.cloud.recover'):
                self.fail('expiry is not the same as nonpayment')
        self.assertEqual('IDENTITY_EXPIRED', error.exception.reason)
        self.event('fixture-b', 'restore')
        self.event('fixture-b', 'suspend')
        with self.assertRaises(ServiceAccessDenied) as error:
            with controller.guard('alice-b', 'registry.index'):
                self.fail('signed suspension denies current device')
        self.assertEqual('DEVICE_SUSPENDED', error.exception.reason)

    def test_signed_verification_in_the_future_does_not_admit_early(self):
        # The signed issuer event may arrive inside its permitted 30-second
        # clock skew. Its future verification is not active yet for admission.
        self.event(verified_at=self.now + 20, occurred_at=self.now + 20)
        controller = self.controller()
        self.assertEqual('VERIFICATION_NOT_YET_VALID', controller.snapshot('alice-a')['purchase_reason'])
        with self.assertRaises(ServiceAccessDenied):
            with controller.guard('alice-a', 'registry.index'):
                pass
        self.now += 20
        with controller.guard('alice-a', 'registry.index'):
            pass

    def test_only_confirmed_actual_wallet_payment_admits_paid_service(self):
        account = self.register()
        controller = self.controller()
        grant = self.claim(account)
        self.assertEqual('PAUSED', controller.snapshot('alice-a')['paid_state'])
        self.assertTrue(controller.snapshot('alice-a')['reconciliation_pending'])
        with self.assertRaises(ServiceAccessDenied):
            with controller.guard('alice-a', 'runner.cloud.start'):
                self.fail('a claim is not a payment')
        wallet = Wallet(self.root / 'wallet.db')
        sale = wallet.simulate_sale(5000, 'sale')
        wallet.settle_sale(sale['id'], 'settle')
        WalletBridge(self.store, wallet, account, W).execute(grant['authorization_id'], 'execute', W)
        before = wallet.snapshot()
        with controller.guard('alice-a', 'runner.cloud.submit') as receipt:
            self.assertEqual(('PAID', OCTOBER), (receipt['paid_state'], receipt['access_until']))
        with controller.guard('alice-a', 'runner.cloud.start'):
            pass
        self.assertEqual(before, wallet.snapshot())
        self.assertEqual(888, before['billed_minor'])

    def test_unknown_committed_wallet_outcome_is_paused_until_same_claim_reconciles(self):
        account = self.register()
        controller = self.controller()
        grant = self.claim(account)
        wallet = Wallet(self.root / 'wallet.db')
        sale = wallet.simulate_sale(5000, 'sale')
        wallet.settle_sale(sale['id'], 'settle')
        bridge = WalletBridge(self.store, wallet, account, W)
        original = wallet.bill
        def lost_ack(*args, **kwargs):
            original(*args, **kwargs)
            raise OSError('test committed response was lost')
        with patch.object(wallet, 'bill', lost_ack), self.assertRaises(OSError):
            bridge.execute(grant['authorization_id'], 'recover-key', W)
        self.assertEqual(888, wallet.snapshot()['billed_minor'])
        self.assertEqual('PAUSED', controller.snapshot('alice-a')['paid_state'])
        with controller.guard('alice-a', 'runner.cloud.recover'):
            pass
        self.store.consent(account, False, TERMS_VERSION, 'cancel', A)
        bridge.execute(grant['authorization_id'], 'recover-key', W)
        self.assertEqual('PAID', controller.snapshot('alice-a')['paid_state'])
        self.assertFalse(controller.snapshot('alice-a')['auto_renew'])
        self.assertEqual(888, wallet.snapshot()['billed_minor'])

    def test_funds_pending_and_held_do_not_count_as_payment(self):
        account = self.register()
        wallet = Wallet(self.root / 'wallet.db')
        sale = wallet.simulate_sale(5000, 'sale')
        controller = self.controller()
        grant = self.claim(account)
        bridge = WalletBridge(self.store, wallet, account, W)
        self.assertEqual('FAILED', bridge.execute(grant['authorization_id'], 'pending-only', W)['authorization']['state'])
        wallet.settle_sale(sale['id'], 'settle')
        wallet.reserve(5000, 'hold-all')
        self.claim(account, 'held')
        self.assertEqual('FAILED', bridge.execute(grant['authorization_id'], 'held-only', W)['authorization']['state'])
        self.assertEqual('PAUSED', controller.snapshot('alice-a')['paid_state'])
        self.assertEqual(0, wallet.snapshot()['billed_minor'])
        with controller.guard('alice-a', 'registry.index'):
            pass

    def test_default_has_no_grace_and_explicit_policy_is_not_a_first_payment_trial(self):
        account = self.register()
        controller = self.controller()
        self.pay(account)
        self.now = OCTOBER
        self.assertEqual('PAUSED', controller.snapshot('alice-a')['paid_state'])
        with self.assertRaises(ServiceAccessDenied):
            with controller.guard('alice-a', 'runner.cloud.start'):
                pass
        self.assertEqual(0, controller.snapshot('alice-a')['grace_until'] - OCTOBER)

    def test_explicit_grace_starts_only_at_confirmed_paid_through_and_is_bounded(self):
        account = self.register()
        controller = self.controller(grace_seconds=3600)
        self.assertEqual(('PAUSED', 0), (controller.snapshot('alice-a')['paid_state'], controller.snapshot('alice-a')['grace_until']))
        self.pay(account)
        self.now = OCTOBER
        with controller.guard('alice-a', 'runner.cloud.submit') as receipt:
            self.assertEqual('GRACE', receipt['paid_state'])
        self.now = OCTOBER + 3600
        with self.assertRaises(ServiceAccessDenied):
            with controller.guard('alice-a', 'runner.cloud.submit'):
                pass
        self.assertEqual('PAUSED', controller.snapshot('alice-a')['paid_state'])
        with controller.guard('alice-a', 'runner.cloud.recover'):
            pass

    def test_cancellation_keeps_paid_remainder_but_removes_extra_grace(self):
        account = self.register()
        controller = self.controller(grace_seconds=86400)
        self.pay(account)
        self.store.consent(account, False, TERMS_VERSION, 'cancel', A)
        with controller.guard('alice-a', 'runner.cloud.start') as receipt:
            self.assertEqual('PAID', receipt['paid_state'])
        self.assertEqual(0, controller.snapshot('alice-a')['grace_until'])
        self.now = OCTOBER
        with self.assertRaises(ServiceAccessDenied):
            with controller.guard('alice-a', 'runner.cloud.start'):
                pass
        for action in ('registry.package', 'runner.cloud.recover', 'runner.pc_usb.submit'):
            with controller.guard('alice-a', action):
                pass

    def test_restart_reconsent_and_replacement_do_not_reset_grace(self):
        account = self.register()
        controller = self.controller(grace_seconds=120)
        self.pay(account)
        original_tenant = controller.snapshot('alice-a')['tenant']
        self.now = OCTOBER + 121
        self.store.consent(account, False, TERMS_VERSION, 'cancel', A)
        self.store.consent(account, True, TERMS_VERSION, 'reconsent', A)
        self.event('fixture-b')
        self.store.register('fixture-b', 'replacement', A)
        self.event('fixture-a', 'suspend')
        restarted_store = EntitlementStore(self.store.path, clock=lambda: self.now)
        restarted = ServiceAccessController(restarted_store, authority_id=AUTHORITY, consumers=self.consumers, grace_seconds=120)
        state = restarted.snapshot('alice-b')
        self.assertEqual((original_tenant, account, 'PAUSED', OCTOBER + 120),
                         (state['tenant'], state['account_id'], state['paid_state'], state['grace_until']))
        with restarted.guard('alice-b', 'runner.cloud.recover'):
            pass
        with self.assertRaises(ServiceAccessDenied):
            with restarted.guard('alice-a', 'runner.cloud.recover'):
                pass

    def test_actual_later_settlement_and_one_confirmed_current_bill_restore_service(self):
        account = self.register()
        controller = self.controller()
        wallet, _, _ = self.pay(account)
        self.now = OCTOBER
        before = controller.snapshot('alice-a')
        self.assertEqual('PAUSED', before['paid_state'])
        wallet, grant, result = self.pay(account, suffix='october', wallet=wallet)
        self.assertEqual(result, WalletBridge(self.store, wallet, account, W).execute(grant['authorization_id'], 'execute-october', W))
        with controller.guard('alice-a', 'runner.cloud.submit'):
            pass
        self.assertEqual((1776, 2), (wallet.snapshot()['billed_minor'], len(wallet.snapshot()['bills'])))

    def test_same_owner_tenant_shared_but_device_a_cannot_borrow_valid_b(self):
        account = self.register()
        self.event('fixture-b')
        self.event('fixture-bob', owner='bob')
        controller = self.controller()
        self.pay(account)
        a, b, bob = (controller.snapshot(alias) for alias in ('alice-a', 'alice-b', 'bob'))
        self.assertEqual((a['tenant'], account), (b['tenant'], b['account_id']))
        self.assertNotEqual(a['tenant'], bob['tenant'])
        self.event('fixture-a', 'suspend')
        with self.assertRaises(ServiceAccessDenied):
            with controller.guard('alice-a', 'runner.cloud.submit'):
                pass
        with controller.guard('alice-b', 'runner.cloud.submit'):
            pass
        self.assertEqual(1, len(self.rows('accounts')))

    def test_guard_serializes_signed_suspend_with_caller_durable_admission(self):
        self.event()
        controller = self.controller()
        started, release, attempting = threading.Event(), threading.Event(), threading.Event()
        durable = self.root / 'admission.db'
        with closing(sqlite3.connect(durable)) as db, db:
            db.execute('CREATE TABLE admissions (consumer TEXT PRIMARY KEY)')
        def admitted():
            with controller.guard('alice-a', 'registry.package') as receipt:
                started.set()
                if not release.wait(3):
                    raise AssertionError('test admission release missing')
                with closing(sqlite3.connect(durable)) as db, db:
                    db.execute('INSERT INTO admissions VALUES (?)', (receipt['consumer_id'],))
        def suspend():
            attempting.set()
            self.event('fixture-a', 'suspend')
        with ThreadPoolExecutor(max_workers=2) as pool:
            admission = pool.submit(admitted)
            try:
                self.assertTrue(started.wait(2))
                suspension = pool.submit(suspend)
                self.assertTrue(attempting.wait(2))
                self.assertFalse(suspension.done())
            finally:
                release.set()
            admission.result(timeout=3)
            suspension.result(timeout=3)
        with closing(sqlite3.connect(durable)) as db:
            self.assertEqual([('alice-a',)], db.execute('SELECT * FROM admissions').fetchall())
        with self.assertRaises(ServiceAccessDenied):
            with controller.guard('alice-a', 'registry.package'):
                pass

    def test_reentrant_recovery_then_submit_guard_does_not_keep_sql_transaction_open(self):
        account = self.register()
        controller = self.controller()
        self.pay(account)
        with controller.guard('alice-a', 'runner.cloud.recover'):
            with controller.guard('alice-a', 'runner.cloud.submit'):
                self.store.consent(account, False, TERMS_VERSION, 'inside-service-action', A)
        self.assertFalse(controller.snapshot('alice-a')['auto_renew'])

    def test_guard_exception_releases_lock_and_keeps_highwater_not_business_write(self):
        self.event()
        controller = self.controller()
        before = self.rows('devices')
        with self.assertRaisesRegex(RuntimeError, 'caller failed'):
            with controller.guard('alice-a', 'registry.index'):
                raise RuntimeError('caller failed')
        self.assertEqual(before, self.rows('devices'))
        self.event('fixture-a', 'suspend')
        self.assertEqual(self.now, self.rows('service_access_mode')[0][-1])

    def test_clock_rollback_persists_across_restart_and_denied_expiry_attempt(self):
        self.event(valid_until=self.now + 20)
        controller = self.controller()
        with controller.guard('alice-a', 'registry.index'):
            pass
        self.now += 20
        with self.assertRaises(ServiceAccessDenied):
            with controller.guard('alice-a', 'registry.index'):
                pass
        self.now -= 1
        restarted = self.controller()
        self.assertTrue(restarted.snapshot('alice-a')['clock_rollback'])
        self.assertEqual([], restarted.snapshot('alice-a')['allowed_actions'])
        with self.assertRaises(ServiceClockError):
            with restarted.guard('alice-a', 'registry.index'):
                pass
        # This controller has no gate for basic OS, local Tools or Wallet recovery.
        self.assertEqual([], self.rows('authorizations'))

    def test_snapshot_and_existing_constructor_do_not_change_business_or_clock_rows(self):
        account = self.register()
        controller = self.controller(grace_seconds=60)
        self.pay(account)
        before = self.state_rows()
        self.now += 5
        for _ in range(3):
            state = controller.snapshot('alice-a')
            controller.authenticate('alice-a', 'Bearer ' + PUBLIC_SERVICE_TOKENS['alice-a'])
        self.controller(grace_seconds=60)
        self.assertEqual(before, self.state_rows())
        encoded = json.dumps(state)
        for private_field in ('verification_ref', 'purchase_ref', 'PUBLIC-FIXTURE', 'verification_valid_until'):
            self.assertNotIn(private_field, encoded)

    def test_bound_policy_authority_and_alias_cannot_change_or_be_removed(self):
        self.controller()
        for kwargs in ({'authority_id': '9be14f25-0edb-4f7b-a094-2a67ce6cc499'},
                       {'grace_seconds': 60}, {'paid_services': ()},
                       {'consumers': {'alice-a': self.consumers['alice-a']}}):
            values = {'authority_id': AUTHORITY, 'consumers': self.consumers, **kwargs}
            with self.subTest(kwargs=kwargs), self.assertRaises(ServiceConfigurationError):
                ServiceAccessController(self.store, **values)
        for field, value in (('owner_actor', 'bob'), ('device_ref', 'fixture-other')):
            changed = deepcopy(self.consumers)
            changed['alice-a'][field] = value
            with self.assertRaises(ServiceConfigurationError):
                ServiceAccessController(self.store, authority_id=AUTHORITY, consumers=changed)

    def test_consumer_append_preserves_existing_marker_and_bindings(self):
        first = {'alice-a': self.consumers['alice-a']}
        ServiceAccessController(self.store, authority_id=AUTHORITY, consumers=first)
        marker, bindings = self.rows('service_access_mode'), self.rows('service_access_consumers')
        self.controller()
        self.assertEqual(marker, self.rows('service_access_mode'))
        self.assertEqual(bindings[0], self.rows('service_access_consumers')[0])
        with self.assertRaises(sqlite3.IntegrityError), self.store._transaction() as db:
            db.execute('DELETE FROM service_access_consumers')
        with self.assertRaises(sqlite3.IntegrityError), self.store._transaction() as db:
            db.execute("UPDATE service_access_consumers SET device_ref='fixture-other'")
        with self.assertRaises(sqlite3.IntegrityError), self.store._transaction() as db:
            db.execute('DELETE FROM service_access_mode')

    def test_malformed_configuration_and_unknown_action_fail_closed(self):
        bad_consumers = []
        for field, value in (('token', A), ('owner_actor', 'wallet'), ('device_ref', '/tmp/device')):
            changed = deepcopy(self.consumers)
            changed['alice-a'][field] = value
            bad_consumers.append(changed)
        same_token = deepcopy(self.consumers)
        same_token['alice-b']['token'] = same_token['alice-a']['token']
        bad_consumers.append(same_token)
        for consumers in bad_consumers:
            with self.assertRaises(ServiceConfigurationError):
                ServiceAccessController(self.store, authority_id=AUTHORITY, consumers=consumers)
        for kwargs in ({'grace_seconds': True}, {'grace_seconds': -1}, {'grace_seconds': 604801},
                       {'paid_services': 'runner.cloud'}, {'paid_services': ('runner.cloud', 'runner.cloud')},
                       {'paid_services': ('wallet.recover',)}):
            with self.subTest(kwargs=kwargs), self.assertRaises(ServiceConfigurationError):
                self.controller(**kwargs)
        controller = self.controller()
        with self.assertRaises(ServiceAccessDenied):
            with controller.guard('alice-a', 'wallet.bill'):
                pass

    def test_sqlite_failure_is_infrastructure_not_paid_denial_and_does_not_yield(self):
        self.event()
        controller = self.controller()
        with patch.object(self.store, '_connect', side_effect=sqlite3.OperationalError('test unavailable')):
            with self.assertRaises(sqlite3.OperationalError):
                with controller.guard('alice-a', 'registry.index'):
                    self.fail('failed durable admission must not yield')
        with controller.guard('alice-a', 'registry.index'):
            pass

    def test_mode_missing_or_partial_schema_never_silently_falls_back(self):
        controller = self.controller()
        with self.store._transaction() as db:
            db.execute('DROP TRIGGER service_access_mode_retained')
            db.execute('DELETE FROM service_access_mode')
        with self.assertRaises(ServiceConfigurationError):
            controller.snapshot('alice-a')
        with self.assertRaises(ServiceConfigurationError):
            self.controller()
        with self.store._transaction() as db:
            db.execute('DROP TABLE service_access_mode')
        with self.assertRaises(ServiceConfigurationError):
            self.controller()

    def test_inconsistent_access_until_does_not_create_paid_admission(self):
        account = self.register()
        controller = self.controller(grace_seconds=60)
        with self.store._transaction() as db:
            db.execute('UPDATE accounts SET access_until=? WHERE account_id=?', (OCTOBER, account))
        state = controller.snapshot('alice-a')
        self.assertEqual(('PAUSED', 'PAYMENT_RECONCILIATION_REQUIRED'), (state['paid_state'], state['paid_state_reason']))
        with self.assertRaises(ServiceAccessDenied):
            with controller.guard('alice-a', 'runner.cloud.submit'):
                pass
        with controller.guard('alice-a', 'runner.cloud.recover'):
            pass

    def test_explicit_empty_paid_scope_and_pc_paid_scope_are_server_config_only(self):
        self.event()
        controller = self.controller(paid_services=('runner.pc_usb',))
        with controller.guard('alice-a', 'runner.cloud.submit'):
            pass
        with self.assertRaises(ServiceAccessDenied):
            with controller.guard('alice-a', 'runner.pc_usb.submit'):
                pass
        with controller.guard('alice-a', 'runner.pc_usb.recover'):
            pass


if __name__ == '__main__':
    unittest.main()

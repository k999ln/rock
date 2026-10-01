from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import json
from pathlib import Path
import sqlite3
import tempfile
import threading
import time
import unittest
from unittest.mock import patch

from blackberryrock.wallet import Wallet
from entitlement.device import DeviceWalletAdapter
from entitlement.guest_observer import observe
from entitlement.protocol import TERMS_VERSION, EntitlementError, Conflict, NotEligible, sign_fixture_event

FIXTURE = Path(__file__).resolve().parents[1] / 'fixtures/device-handoff.json'
NOW = int(datetime(2026, 9, 8, 9, tzinfo=timezone.utc).timestamp())
OCTOBER = int(datetime(2026, 10, 1, tzinfo=timezone.utc).timestamp())


class DeviceWalletTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.now = NOW
        self.wallet = Wallet(self.root / 'wallet.db')
        self.adapter = self.make_adapter()

    def make_adapter(self, **kwargs):
        return DeviceWalletAdapter(self.root / 'membership', self.wallet, provisioning_file=FIXTURE,
                                   clock=lambda: self.now, start_scheduler=False, poll_seconds=0.02, retry_seconds=0.1, **kwargs)

    def tearDown(self):
        self.adapter.close()
        self.temporary.cleanup()

    def request(self, op, key=None, **values):
        request = {'v': 1, 'op': op, **values}
        if key is not None:
            request['key'] = key
        return self.adapter.dispatch(request, peer_uid=1002)

    def register(self, consent=True):
        result = self.request('wallet.register', 'register')
        self.assertTrue(result['ok'])
        if consent:
            self.assertTrue(self.request('wallet.consent', 'consent', accepted=True, terms_version=TERMS_VERSION)['ok'])
        return result

    def fund(self):
        self.adapter.require_entitlement('wallet.sale', peer_uid=1002)
        sale = self.wallet.simulate_sale(5000, 'fixture-test-credit')
        self.adapter.require_entitlement('wallet.settle', peer_uid=1002)
        self.wallet.settle_sale(sale['id'], 'fixture-test-settlement')

    def test_trusted_peer_argument_and_strict_fields_cannot_be_spoofed_in_json(self):
        for peer in (1000, 1003, 501, True, '1002'):
            with self.subTest(peer=peer), self.assertRaises(PermissionError):
                self.adapter.dispatch({'v': 1, 'op': 'wallet.register', 'key': 'bad'}, peer_uid=peer)
        for extra in ({'peer_uid': 0}, {'owner_ref': 'fixture-owner-bob'}, {'token': 'public'}, {'id_document': 'not-real'}):
            with self.assertRaises(EntitlementError):
                self.adapter.dispatch({'v': 1, 'op': 'wallet.register', 'key': 'bad', **extra}, peer_uid=1002)
        self.assertFalse(self.adapter.membership()['registered'])

    def test_unregistered_cannot_bill_consent_or_start_new_wallet_actions(self):
        self.assertFalse(self.request('wallet.bill', 'no-registration', period='2026-09')['ok'])
        self.assertFalse(self.request('wallet.consent', 'no-registration-consent', accepted=True, terms_version=TERMS_VERSION)['ok'])
        for operation in ('wallet.sale', 'wallet.reserve', 'wallet.settle'):
            with self.assertRaises(NotEligible):
                self.adapter.require_entitlement(operation, peer_uid=1002)
        self.assertFalse(self.adapter.tick())
        self.assertEqual(0, self.wallet.snapshot()['billed_minor'])

    def test_registration_reuses_only_opaque_handoff_and_does_not_consent(self):
        result = self.register(False)
        self.assertEqual([], result['result']['additional_personal_fields_required'])
        self.assertEqual('fixture-verification-handoff-001', result['result']['verification_ref'])
        state = self.adapter.membership()
        self.assertTrue(state['registered'])
        self.assertFalse(state['backend_connected'])
        self.assertFalse(state['real_identity_verified'])
        self.assertFalse(state['entitlement']['auto_renew'])
        self.assertFalse(self.adapter.tick())
        self.assertEqual([], self.wallet.snapshot()['bills'])

    def test_fixed_terms_current_utc_month_and_known_failure_replay(self):
        failure = self.request('wallet.bill', 'before-register', period='2026-09')
        self.register(False)
        self.assertEqual(failure, self.request('wallet.bill', 'before-register', period='2026-09'))
        for accepted, terms in ((1, TERMS_VERSION), (True, 'old-terms')):
            self.assertFalse(self.request('wallet.consent', f'bad-{accepted}-{terms}', accepted=accepted, terms_version=terms)['ok'])
        self.assertTrue(self.request('wallet.consent', 'accept', accepted=True, terms_version=TERMS_VERSION)['ok'])
        for period in ('2026-08', '2026-10', '2026-9', None, 202609):
            self.assertFalse(self.request('wallet.bill', 'bad-period-'+str(period), period=period)['ok'])
        with self.assertRaises(Conflict):
            self.request('wallet.bill', 'before-register', period='2026-10')

    def test_durable_bill_acceptance_is_not_a_claim_of_payment_success(self):
        self.register()
        accepted = self.request('wallet.bill', 'schedule', period='2026-09')
        self.assertTrue(accepted['result']['accepted'])
        self.assertEqual([], self.wallet.snapshot()['bills'])
        self.adapter.tick()
        self.assertEqual('retry_wait', self.adapter.billing_status()['history'][0]['status'])
        self.assertEqual(accepted, self.request('wallet.bill', 'schedule', period='2026-09'))
        self.assertEqual(0, self.wallet.snapshot()['billed_minor'])

    def test_failed_acceptance_commit_rolls_back_due_then_same_key_recovers(self):
        self.register()
        self.fund()
        with self.adapter.store._transaction() as db:
            db.execute("CREATE TRIGGER fail_acceptance BEFORE UPDATE ON device_api_receipts WHEN NEW.key='atomic-schedule' BEGIN SELECT RAISE(ABORT,'injected acceptance failure'); END")
        with self.assertRaises(sqlite3.IntegrityError):
            self.request('wallet.bill', 'atomic-schedule', period='2026-09')
        self.assertEqual([], self.adapter.billing_status()['history'])
        self.assertEqual(0, self.wallet.snapshot()['billed_minor'])
        with self.adapter.store._transaction() as db:
            db.execute('DROP TRIGGER fail_acceptance')
        accepted = self.request('wallet.bill', 'atomic-schedule', period='2026-09')
        self.adapter.tick()
        self.request('wallet.consent', 'later-cancel', accepted=False, terms_version=TERMS_VERSION)
        self.assertEqual(accepted, self.request('wallet.bill', 'atomic-schedule', period='2026-09'))
        self.assertEqual(888, self.wallet.snapshot()['billed_minor'])

    def test_automatic_due_after_consent_and_once_per_month_after_restart(self):
        self.register()
        self.fund()
        self.assertTrue(self.adapter.tick())  # No explicit wallet.bill is needed.
        self.assertEqual(888, self.wallet.snapshot()['billed_minor'])
        self.adapter.close()
        self.adapter = self.make_adapter()
        self.assertFalse(self.adapter.tick())
        self.assertEqual(888, self.wallet.snapshot()['billed_minor'])
        self.now = OCTOBER
        self.assertTrue(self.adapter.tick())
        self.assertEqual(1776, self.wallet.snapshot()['billed_minor'])
        self.assertEqual(['2026-10', '2026-09'], [x['period'] for x in self.adapter.billing_status()['history']])

    def test_parallel_bill_requests_and_ticks_create_one_monthly_charge(self):
        self.register()
        self.fund()
        with ThreadPoolExecutor(max_workers=6) as pool:
            receipts = list(pool.map(lambda n: self.request('wallet.bill', 'request-'+str(n), period='2026-09'), range(6)))
            list(pool.map(lambda _: self.adapter.tick(), range(6)))
        self.assertEqual(1, len({r['result']['schedule_id'] for r in receipts}))
        self.assertEqual(888, self.wallet.snapshot()['billed_minor'])
        self.assertEqual(1, len(self.adapter.billing_status()['history']))

    def test_admission_guard_keeps_wallet_operation_before_concurrent_cancel(self):
        self.register()
        self.fund()
        entered, release, cancelling = threading.Event(), threading.Event(), threading.Event()
        def reserve():
            with self.adapter.admission_guard('wallet.reserve', peer_uid=1002):
                entered.set()
                if not release.wait(2):
                    raise RuntimeError('test barrier timed out')
                return self.wallet.reserve(1000, 'guarded-hold')
        def cancel():
            cancelling.set()
            return self.request('wallet.consent', 'cancel-concurrent', accepted=False, terms_version=TERMS_VERSION)
        with ThreadPoolExecutor(max_workers=2) as pool:
            reservation = pool.submit(reserve)
            self.assertTrue(entered.wait(1))
            cancellation = pool.submit(cancel)
            self.assertTrue(cancelling.wait(1))
            self.assertFalse(cancellation.done())
            release.set()
            self.assertEqual(1000, reservation.result()['amount_minor'])
            self.assertTrue(cancellation.result()['ok'])
        self.assertEqual(1000, self.wallet.snapshot()['held_minor'])
        self.assertFalse(self.adapter.membership()['entitlement']['auto_renew'])

    def test_snapshot_guard_excludes_scheduler_commit_from_combined_reads(self):
        self.register()
        self.fund()
        attempted = threading.Event()
        def tick():
            attempted.set()
            return self.adapter.tick()
        with ThreadPoolExecutor(max_workers=1) as pool:
            with self.adapter.snapshot_guard(peer_uid=1002):
                work = pool.submit(tick)
                self.assertTrue(attempted.wait(1))
                snapshot = {'wallet':self.wallet.snapshot(), 'membership':self.adapter.membership(),
                            'billing':self.adapter.billing_status()}
                self.assertFalse(work.done())
                self.assertEqual(0, snapshot['wallet']['billed_minor'])
                self.assertEqual([], snapshot['billing']['history'])
            self.assertTrue(work.result(timeout=2))
        with self.adapter.snapshot_guard(peer_uid=1002):
            self.assertEqual(888, self.wallet.snapshot()['billed_minor'])
            self.assertEqual('paid', self.adapter.billing_status()['history'][0]['status'])

    def test_cancel_before_due_forbids_charge_but_paid_history_and_holds_resolve(self):
        self.register()
        self.fund()
        hold = self.wallet.reserve(1000, 'existing-hold')
        self.request('wallet.bill', 'schedule', period='2026-09')
        self.request('wallet.consent', 'cancel', accepted=False, terms_version=TERMS_VERSION)
        self.assertFalse(self.adapter.tick())
        self.assertEqual(0, self.wallet.snapshot()['billed_minor'])
        self.assertFalse(self.request('wallet.bill', 'after-cancel', period='2026-09')['ok'])
        self.adapter.require_entitlement('wallet.reconcile', peer_uid=1002)
        self.wallet.reconcile(hold['id'], 0, 'resolve-existing-hold')
        self.assertEqual(0, self.wallet.snapshot()['held_minor'])
        self.request('wallet.consent', 'reconsent', accepted=True, terms_version=TERMS_VERSION)
        self.adapter.tick()
        self.request('wallet.consent', 'cancel-after-paid', accepted=False, terms_version=TERMS_VERSION)
        self.assertEqual(888, self.wallet.snapshot()['billed_minor'])
        self.now = OCTOBER
        self.assertFalse(self.adapter.tick())
        self.assertEqual(888, self.wallet.snapshot()['billed_minor'])

    def test_expired_verification_blocks_new_money_actions_but_allows_resolution(self):
        self.register()
        self.fund()
        hold = self.wallet.reserve(1000, 'held-before-expiry')
        self.now += 91*86400
        for operation in ('wallet.sale', 'wallet.reserve'):
            with self.assertRaises(NotEligible):
                self.adapter.require_entitlement(operation, peer_uid=1002)
        self.adapter.require_entitlement('wallet.reconcile', peer_uid=1002)
        self.wallet.reconcile(hold['id'], 0, 'expired-hold-resolution')
        self.assertFalse(self.adapter.tick())
        self.assertFalse(self.request('wallet.bill', 'expired-bill', period='2026-12')['ok'])
        self.assertEqual(0, self.wallet.snapshot()['billed_minor'])

    def test_known_insufficient_funds_retries_same_authorization_after_credit(self):
        self.register()
        self.adapter.tick()
        old = self.adapter.billing_status()['history'][0]
        self.fund()
        self.request('wallet.bill', 'retry-after-funding', period='2026-09')
        self.adapter.tick()
        new = self.adapter.billing_status()['history'][0]
        self.assertEqual(old['authorization_id'], new['authorization_id'])
        self.assertEqual('paid', new['status'])
        self.assertEqual(888, self.wallet.snapshot()['billed_minor'])

    def test_lost_wallet_result_restarts_same_claim_and_does_not_double_debit(self):
        self.register()
        self.fund()
        original = self.wallet.bill
        def lost_ack(*args, **kwargs):
            original(*args, **kwargs)
            raise OSError('injected loss after Wallet commit')
        with patch.object(self.wallet, 'bill', side_effect=lost_ack):
            with self.assertRaises(OSError):
                self.adapter.tick()
        before = self.adapter.billing_status()['history'][0]
        self.assertEqual('processing', before['status'])
        self.assertEqual(888, self.wallet.snapshot()['billed_minor'])
        self.request('wallet.consent', 'cancel-unknown', accepted=False, terms_version=TERMS_VERSION)
        self.adapter.close()
        self.now += 1
        self.adapter = self.make_adapter()
        self.adapter.tick()
        after = self.adapter.billing_status()['history'][0]
        self.assertEqual(before['generation'], after['generation'])
        self.assertEqual('paid', after['status'])
        self.assertEqual(888, self.wallet.snapshot()['billed_minor'])
        self.assertFalse(self.adapter.membership()['entitlement']['auto_renew'])

    def test_due_final_commit_failure_recovers_existing_bridge_receipt(self):
        self.register()
        self.fund()
        with self.adapter.store._transaction() as db:
            db.execute("CREATE TRIGGER fail_due_commit BEFORE UPDATE ON device_monthly_due WHEN NEW.status='paid' BEGIN SELECT RAISE(ABORT,'injected due final write'); END")
        with self.assertRaises(sqlite3.IntegrityError):
            self.adapter.tick()
        self.assertEqual(888, self.wallet.snapshot()['billed_minor'])
        with self.adapter.store._transaction() as db:
            db.execute('DROP TRIGGER fail_due_commit')
        self.now += 1
        self.adapter.tick()
        self.assertEqual('paid', self.adapter.billing_status()['history'][0]['status'])
        self.assertEqual(888, self.wallet.snapshot()['billed_minor'])

    def test_unknown_api_ack_recovers_backend_consent_without_second_consent(self):
        self.register(False)
        with self.adapter.store._transaction() as db:
            db.execute("CREATE TRIGGER fail_api_receipt BEFORE UPDATE ON device_api_receipts WHEN NEW.key='consent' BEGIN SELECT RAISE(ABORT,'injected receipt loss'); END")
        with self.assertRaises(sqlite3.IntegrityError):
            self.request('wallet.consent', 'consent', accepted=True, terms_version=TERMS_VERSION)
        with self.adapter.store._transaction() as db:
            self.assertEqual(1, db.execute('SELECT COUNT(*) FROM consents').fetchone()[0])
            db.execute('DROP TRIGGER fail_api_receipt')
        self.assertTrue(self.request('wallet.consent', 'consent', accepted=True, terms_version=TERMS_VERSION)['ok'])
        with self.adapter.store._transaction() as db:
            self.assertEqual(1, db.execute('SELECT COUNT(*) FROM consents').fetchone()[0])

    def test_receipts_survive_restart_and_past_month_replay_is_only_history(self):
        self.register()
        self.fund()
        accepted = self.request('wallet.bill', 'september', period='2026-09')
        self.adapter.tick()
        self.adapter.close()
        self.now = OCTOBER
        self.adapter = self.make_adapter()
        self.assertEqual(accepted, self.request('wallet.bill', 'september', period='2026-09'))
        self.assertFalse(self.request('wallet.bill', 'new-backdated', period='2026-09')['ok'])
        self.assertEqual(888, self.wallet.snapshot()['billed_minor'])

    def test_monotonic_month_refuses_software_clock_rollback(self):
        self.register()
        self.fund()
        self.adapter.tick()
        self.now = OCTOBER
        self.adapter.tick()
        self.now = NOW
        with self.assertRaises(NotEligible):
            self.adapter.tick()
        self.assertFalse(self.request('wallet.bill', 'backwards-clock', period='2026-09')['ok'])
        self.assertEqual(1776, self.wallet.snapshot()['billed_minor'])

    def test_fixture_tamper_replacement_and_missing_handoff_are_closed(self):
        bad = json.loads(FIXTURE.read_text())
        bad['events'][0]['payload']['owner_ref'] = 'fixture-owner-bob'
        path = self.root / 'tampered.json'
        path.write_text(json.dumps(bad))
        with self.assertRaises(EntitlementError):
            DeviceWalletAdapter(self.root / 'bad', Wallet(self.root/'bad-wallet.db'), provisioning_file=path, clock=lambda:self.now, start_scheduler=False)
        missing = DeviceWalletAdapter(self.root / 'missing', Wallet(self.root/'missing-wallet.db'), clock=lambda:self.now, start_scheduler=False)
        try:
            self.assertEqual('HANDOFF_REQUIRED', missing.membership()['registration_status'])
            self.assertFalse(missing.dispatch({'v':1,'op':'wallet.register','key':'no-handoff'},peer_uid=1002)['ok'])
        finally:
            missing.close()

    def test_signed_verification_renewal_keeps_cancellation_and_device_binding(self):
        self.register()
        self.request('wallet.consent', 'cancel-before-renewal', accepted=False, terms_version=TERMS_VERSION)
        self.now += 91*86400
        self.assertFalse(self.adapter.membership()['entitlement']['device_eligible'])
        bundle = json.loads(FIXTURE.read_text())
        bundle['events'].append(sign_fixture_event('fulfillment', 'fixture-restored-verification',
            'device:fixture-rock-arm64-001', 2, self.now, 'restore',
            {'device_ref':'fixture-rock-arm64-001','verification_ref':'fixture-renewed-verification',
             'verified_at':self.now,'valid_until':self.now+90*86400}))
        renewed = self.root/'renewed.json'
        renewed.write_text(json.dumps(bundle))
        renewed.chmod(0o600)
        self.adapter.close()
        self.adapter = DeviceWalletAdapter(self.root/'membership', self.wallet, provisioning_file=renewed,
                                           clock=lambda:self.now, start_scheduler=False)
        state = self.adapter.membership()['entitlement']
        self.assertTrue(state['device_eligible'])
        self.assertFalse(state['auto_renew'])
        self.assertEqual('fixture-renewed-verification', state['verification_ref'])
        self.assertFalse(self.adapter.tick())
        forged_replacement = json.loads(FIXTURE.read_text())
        old = forged_replacement['events'][0]
        old['payload']['owner_ref'] = 'fixture-owner-bob'
        forged_replacement['events'][0] = sign_fixture_event('fulfillment', old['event_id'], old['stream'], 1,
                                                            old['occurred_at'], 'handoff', old['payload'])
        renewed.write_text(json.dumps(forged_replacement))
        with self.assertRaises(Conflict):
            DeviceWalletAdapter(self.root/'membership', self.wallet, provisioning_file=renewed,
                                clock=lambda:self.now, start_scheduler=False)

    def test_observer_contract_uses_only_reads_and_checks_actual_wallet_bill(self):
        self.register()
        self.fund()
        self.adapter.tick()
        calls = []
        before = self.wallet.snapshot()
        def read(op):
            calls.append(op)
            if op == 'snapshot':
                return {'ok':True, 'snapshot':self.wallet.snapshot()}
            return self.adapter.dispatch({'v':1,'op':op}, peer_uid=0)
        result = observe(read)
        self.assertEqual(['wallet.membership','wallet.billing.status','snapshot'], calls)
        self.assertFalse(result['new_money_or_identity_actions'])
        self.assertEqual(before, self.wallet.snapshot())
        self.assertEqual(888, result['wallet_billed_minor'])

    def test_background_scheduler_survives_temporary_sqlite_failure(self):
        self.register()
        self.fund()
        original = self.adapter.tick
        calls = []
        def temporary_failure():
            if not calls:
                calls.append(True)
                raise sqlite3.OperationalError('injected busy database')
            return original()
        with patch.object(self.adapter, 'tick', side_effect=temporary_failure):
            self.adapter.start()
            deadline = time.monotonic()+3
            while time.monotonic()<deadline and self.wallet.snapshot()['billed_minor'] != 888:
                threading.Event().wait(0.01)
        self.assertEqual(888, self.wallet.snapshot()['billed_minor'])
        self.assertTrue(self.adapter.thread.is_alive())


if __name__ == '__main__':
    unittest.main()

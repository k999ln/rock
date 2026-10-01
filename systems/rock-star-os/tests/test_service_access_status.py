"""Pure status projection and rejection boundaries over actual fixture ledgers."""
from contextlib import closing
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'os'))
from blackberryrock.wallet import Wallet
from entitlement.protocol import PUBLIC_TOKENS, TERMS_VERSION, sign_fixture_event
from entitlement.store import EntitlementStore
from entitlement.wallet_bridge import WalletBridge
from service_access.controller import ServiceAccessController, PUBLIC_SERVICE_TOKENS, ACTIONS
from service_access.status import build, validate, FIELDS

AUTHORITY = '8d6d18b6-399e-4ed8-87a7-99c2d8107da3'
DEVICE, ALIAS = 'fixture-status-device', 'alice-a'
NOW = int(datetime(2026, 9, 8, tzinfo=timezone.utc).timestamp())
OCTOBER = int(datetime(2026, 10, 1, tzinfo=timezone.utc).timestamp())
OWNER, ACTOR = PUBLIC_TOKENS['alice'], PUBLIC_TOKENS['wallet']


class PurchaserStatusTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.now = NOW
        self.store = EntitlementStore(self.root / 'entitlement.db', clock=lambda: self.now)
        self.wallet = Wallet(self.root / 'wallet.db')
        self.event_sequence = 0
        self.controller = None

    def create_controller(self, **options):
        self.controller = ServiceAccessController(self.store, authority_id=AUTHORITY,
            consumers={ALIAS: {'owner_actor': 'alice', 'device_ref': DEVICE,
                               'token': PUBLIC_SERVICE_TOKENS[ALIAS]}}, **options)
        return self.controller

    def event(self, kind='handoff', *, valid_until=None):
        self.event_sequence += 1
        payload = {'device_ref': DEVICE}
        if kind != 'suspend':
            payload.update(verification_ref='fixture-verification-status', verified_at=self.now,
                           valid_until=valid_until or self.now + 90 * 86400)
        if kind == 'handoff':
            payload.update(owner_ref='fixture-owner-alice', purchase_ref='fixture-purchase-status')
        envelope = sign_fixture_event('fulfillment', f'status-event-{self.event_sequence}',
            'device:' + DEVICE, self.event_sequence, self.now, kind, payload)
        receipt = self.store.ingest(envelope)
        self.assertEqual('APPLIED', self.store.event_status(
            receipt['event_id'], PUBLIC_TOKENS['fulfillment'])['status'])

    def register(self, *, consent=True):
        self.event()
        self.account = self.store.register(DEVICE, 'status-register', OWNER)['account_id']
        if consent:
            self.store.consent(self.account, True, TERMS_VERSION, 'status-consent', OWNER)
        return self.account

    def pay(self):
        sale = self.wallet.simulate_sale(5000, 'status-sale')
        self.wallet.settle_sale(sale['id'], 'status-settle')
        authorization = self.store.authorize_month(self.account, '2026-09', 'status-authorize', ACTOR)
        self.store.claim_authorization(authorization['authorization_id'], 'status-claim', ACTOR)
        result = WalletBridge(self.store, self.wallet, self.account, ACTOR).execute(
            authorization['authorization_id'], 'status-execute', ACTOR)
        self.assertEqual('PAID', result['authorization']['state'])

    def view(self):
        return build(self.controller or self.create_controller(), ALIAS)

    def paid_view(self, **options):
        self.register()
        self.create_controller(**options)
        self.pay()
        return self.view()

    def assert_invalid(self, value):
        with self.assertRaises(ValueError):
            validate(value)

    def test_purchased_unregistered_has_free_store_without_exposing_private_identity(self):
        self.event()
        value = self.view()
        self.assertEqual(FIELDS, set(value))
        self.assertEqual(('PAUSED', 'WALLET_UNREGISTERED', 888, 'USD', TERMS_VERSION),
            tuple(value[k] for k in ('paid_state', 'paid_state_reason', 'monthly_fee_minor', 'currency', 'terms_version')))
        self.assertIn('registry.package', value['allowed_actions'])
        self.assertIn('runner.cloud.recover', value['allowed_actions'])
        self.assertNotIn('runner.cloud.submit', value['allowed_actions'])
        self.assertFalse({'owner_ref', 'account_id', 'tenant', 'token', 'verification_ref'} & set(value))

    def test_paid_period_survives_cancel_then_expires_without_extra_grace(self):
        self.paid_view(grace_seconds=3600)
        self.store.consent(self.account, False, TERMS_VERSION, 'status-cancel', OWNER)
        value = self.view()
        self.assertEqual(('PAID', OCTOBER, 0, False),
            tuple(value[k] for k in ('paid_state', 'access_until', 'grace_until', 'auto_renew')))
        self.assertIn('runner.cloud.submit', value['allowed_actions'])
        self.now = OCTOBER
        value = self.view()
        self.assertEqual('SUBSCRIPTION_CANCELED', value['paid_state_reason'])
        self.assertNotIn('runner.cloud.submit', value['allowed_actions'])
        self.assertIn('runner.cloud.recover', value['allowed_actions'])

    def test_explicit_grace_is_not_initial_trial_and_has_exact_end(self):
        self.register()
        self.create_controller(grace_seconds=120)
        self.assertEqual(('PAUSED', 0), (self.view()['paid_state'], self.view()['grace_until']))
        self.pay()
        self.now = OCTOBER
        self.assertEqual('GRACE', self.view()['paid_state'])
        self.now += 120
        self.assertEqual('PAYMENT_REQUIRED', self.view()['paid_state_reason'])

    def test_default_zero_grace_and_configurable_paid_targets(self):
        self.paid_view(paid_services=('runner.pc_usb',))
        self.now = OCTOBER
        value = self.view()
        self.assertEqual(['runner.pc_usb'], value['paid_services'])
        self.assertEqual('PAUSED', value['paid_state'])
        self.assertIn('runner.cloud.submit', value['allowed_actions'])
        self.assertNotIn('runner.pc_usb.start', value['allowed_actions'])

    def test_unknown_purchase_expired_and_suspended_cannot_borrow_paid_state(self):
        self.create_controller()
        self.assertEqual('PURCHASE_REQUIRED', self.view()['purchase_reason'])
        self.register()
        self.pay()
        self.event('suspend')
        value = self.view()
        self.assertEqual(('PAID', 'DEVICE_SUSPENDED', []),
            (value['paid_state'], value['purchase_reason'], value['allowed_actions']))
        self.event('restore', valid_until=self.now + 1)
        self.now += 1
        self.assertEqual(('IDENTITY_EXPIRED', []), (self.view()['purchase_reason'], self.view()['allowed_actions']))

    def test_claim_and_committed_lost_ack_are_not_paid_until_applied(self):
        self.register()
        self.create_controller()
        sale = self.wallet.simulate_sale(5000, 'fund')
        self.wallet.settle_sale(sale['id'], 'fund-settle')
        auth = self.store.authorize_month(self.account, '2026-09', 'claim-auth', ACTOR)
        self.store.claim_authorization(auth['authorization_id'], 'claim-now', ACTOR)
        bridge = WalletBridge(self.store, self.wallet, self.account, ACTOR)
        real = self.wallet.bill
        def lost_ack(*args, **kwargs):
            real(*args, **kwargs)
            raise OSError('fixture committed response loss')
        with patch.object(self.wallet, 'bill', lost_ack), self.assertRaises(OSError):
            bridge.execute(auth['authorization_id'], 'recover', ACTOR)
        value = self.view()
        self.assertTrue(value['reconciliation_pending'])
        self.assertEqual('PAUSED', value['paid_state'])
        self.assertEqual(888, self.wallet.snapshot()['billed_minor'])
        bridge.execute(auth['authorization_id'], 'recover', ACTOR)
        self.assertEqual('PAID', self.view()['paid_state'])
        self.assertEqual(888, self.wallet.snapshot()['billed_minor'])

    def test_build_and_validate_are_detached_and_do_not_write_any_business_rows(self):
        self.paid_view()
        with closing(self.store._connect()) as db:
            before = '\n'.join(db.iterdump())
        wallet_before = self.wallet.snapshot()
        view = self.view()
        result = validate(view, authority_id=AUTHORITY, consumer_id=ALIAS, device_ref=DEVICE)
        result['paid_services'].clear()
        result['allowed_actions'].clear()
        self.assertTrue(view['paid_services'])
        self.assertEqual(set(ACTIONS), set(view['allowed_actions']))
        self.assertEqual(view, self.view())
        with closing(self.store._connect()) as db:
            self.assertEqual(before, '\n'.join(db.iterdump()))
        self.assertEqual(wallet_before, self.wallet.snapshot())

    def test_pinned_context_and_identifier_changes_are_rejected(self):
        self.event(); value = self.view()
        for kwargs in ({'authority_id': '1d21fb44-5056-48f4-95ee-c5f130b67502'},
                       {'consumer_id': 'alice-b'}, {'device_ref': 'fixture-other'}):
            with self.subTest(kwargs=kwargs), self.assertRaises(ValueError):
                validate(value, **kwargs)
        for name, bad in (('authority_id', AUTHORITY.upper()), ('device_ref', 'real-person'),
                          ('consumer_id', 'a' * 129), ('consumer_id', '../alice'),
                          ('policy_id', 'service-policy-' + 'G' * 64)):
            with self.subTest(name=name, bad=bad):
                self.assert_invalid({**value, name: bad})

    def test_unknown_fields_missing_fields_and_monthly_terms_fail_closed(self):
        value = self.view()
        for field in FIELDS:
            bad = deepcopy(value); del bad[field]
            with self.subTest(missing=field): self.assert_invalid(bad)
        for name, bad in (('token', 'PUBLIC-FIXTURE'), ('monthly_fee_minor', 889),
                          ('monthly_fee_minor', True), ('currency', 'EUR'),
                          ('terms_version', 'different'), ('schema', 'future/2'), ('simulation_only', False)):
            with self.subTest(name=name): self.assert_invalid({**value, name: bad})

    def test_time_boolean_and_collection_type_bounds(self):
        value = self.view()
        for name in ('access_until', 'grace_until', 'evaluated_at'):
            for bad in (-1, 2**63, True, 1.5, '1', None):
                with self.subTest(name=name, bad=bad): self.assert_invalid({**value, name: bad})
        for name in ('auto_renew', 'device_eligible', 'clock_rollback', 'reconciliation_pending'):
            with self.subTest(name=name): self.assert_invalid({**value, name: 0})
        for name in ('paid_services', 'allowed_actions'):
            for bad in ('cloud', (), [None], [[]], ['not-permitted']):
                with self.subTest(name=name, bad=bad): self.assert_invalid({**value, name: bad})

    def test_policy_targets_and_exact_actions_cannot_be_forged(self):
        self.event(); value = self.view()
        changes = ({'paid_services': ['runner.cloud', 'runner.cloud']},
                   {'allowed_actions': value['allowed_actions'] * 2},
                   {'allowed_actions': value['allowed_actions'] + ['runner.cloud.submit']},
                   {'allowed_actions': []}, {'paid_services': []})
        for change in changes:
            with self.subTest(change=change): self.assert_invalid({**value, **change})

    def test_paid_state_time_reason_and_grace_mismatches_are_rejected(self):
        value = self.paid_view(grace_seconds=120)
        changes = ({'paid_state': 'FUTURE'}, {'paid_state_reason': 'FIRST_PAYMENT_REQUIRED'},
                   {'evaluated_at': OCTOBER}, {'access_until': 0},
                   {'grace_until': OCTOBER - 1}, {'grace_until': OCTOBER + 7 * 86400 + 1},
                   {'auto_renew': False}, {'paid_state': 'GRACE', 'paid_state_reason': 'RENEWAL_GRACE'},
                   {'device_eligible': False}, {'purchase_reason': 'DEVICE_SUSPENDED'})
        for change in changes:
            with self.subTest(change=change): self.assert_invalid({**value, **change})

    def test_clock_rollback_disables_every_action_without_changing_paid_projection(self):
        self.paid_view()
        with self.controller.guard(ALIAS, 'registry.index'): pass
        self.now -= 1
        value = self.view()
        self.assertEqual(('PAUSED', 'CLOCK_ROLLBACK', []),
            (value['paid_state'], value['paid_state_reason'], value['allowed_actions']))
        self.assertEqual(OCTOBER, value['access_until'])
        self.assert_invalid({**value, 'clock_rollback': False})
        self.assert_invalid({**value, 'allowed_actions': ['registry.index']})

    def test_inconsistent_payment_projection_is_displayed_paused_not_invented_paid(self):
        value = self.paid_view()
        snapshot = self.controller.snapshot(ALIAS)
        snapshot.update(paid_state='PAUSED', paid_state_reason='PAYMENT_RECONCILIATION_REQUIRED',
            allowed_actions=[a for a in ACTIONS if not a.startswith('runner.cloud.') or a.endswith('.recover')])
        with patch.object(self.controller, 'snapshot', return_value=snapshot):
            self.assertEqual('PAYMENT_RECONCILIATION_REQUIRED', self.view()['paid_state_reason'])
        snapshot['allowed_actions'] = list(ACTIONS)
        with patch.object(self.controller, 'snapshot', return_value=snapshot), self.assertRaises(ValueError):
            self.view()


if __name__ == '__main__':
    unittest.main()

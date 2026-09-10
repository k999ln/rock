"""Actual platform/Store/Wallet/ATM integration with public signed device fixtures.

No network, hardware identity, operating-system boot or real money is simulated
as evidence here; these tests exercise the installed Python service contract.
"""
from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
import importlib.util
import json
from pathlib import Path
import sqlite3
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'os'))
spec = importlib.util.spec_from_file_location('rock_multi_device_platform', ROOT / 'os/platform/service.py')
platform = importlib.util.module_from_spec(spec)
spec.loader.exec_module(platform)
from entitlement.protocol import PUBLIC_TOKENS, TERMS_VERSION, Conflict, NotEligible, sign_fixture_event

A = 'fixture-rock-arm64-001'
B = 'fixture-rock-arm64-replacement'
FIXTURE = ROOT / 'os/entitlement/fixtures/device-handoff.json'


class PlatformMultiDeviceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.now = 1788856800
        self.service = self.open_service()
        self.addCleanup(lambda: self.service.close())
        first = json.loads(FIXTURE.read_text())['events'][0]
        payload = {**first['payload'], 'device_ref': B, 'purchase_ref': 'fixture-second-purchase',
                   'verification_ref': 'fixture-second-verification'}
        event = sign_fixture_event('fulfillment', 'fixture-second-handoff', 'device:'+B, 1,
                                   first['occurred_at'], 'handoff', payload)
        self.service.membership.store.ingest(event)

    def open_service(self):
        return platform.WalletService(self.root, provisioning_file=FIXTURE, start_scheduler=False,
                                      clock=lambda: self.now, contract_devices=True, authentication_required=False)

    def call(self, device, op, **fields):
        with self.service.membership.device_scope(device, 'alice'):
            return self.service.dispatch({'v': 1, 'op': op, **fields}, peer_uid=1002)

    def register(self, device, key=None):
        return self.call(device, 'wallet.register', key=key or 'register-'+device)

    def suspend(self, device):
        event = sign_fixture_event('fulfillment', 'fixture-suspend-'+device, 'device:'+device,
                                   2, self.now, 'suspend', {'device_ref': device})
        self.service.membership.store.ingest(event)

    def fund(self):
        # Public simulator funding is a trusted setup action, never owner HTTP.
        sale = self.service.wallet.simulate_sale(5000, 'public-credit')
        self.service.wallet.settle_sale(sale['id'], 'public-settle')

    def test_two_devices_share_one_contract_schedule_and_actual_monthly_debit(self):
        with ThreadPoolExecutor(2) as pool:
            registrations = list(pool.map(self.register, (A, B)))
        self.assertEqual(1, len({r['result']['account_id'] for r in registrations}))
        self.fund()
        self.assertTrue(self.call(A, 'wallet.consent', key='consent', accepted=True, terms_version=TERMS_VERSION)['ok'])
        with ThreadPoolExecutor(8) as pool:
            results = list(pool.map(lambda n: self.call((A, B)[n % 2], 'wallet.bill', key='bill-'+str(n), period='2026-09'), range(8)))
        self.assertEqual(1, len({r['result']['schedule_id'] for r in results}))
        self.service.membership.tick()
        self.service.membership.tick()
        snapshot = self.service.wallet.snapshot()
        self.assertEqual(888, snapshot['billed_minor'])
        self.assertEqual(1, len(snapshot['bills']))
        self.assertEqual(0, snapshot['ledger_balance_minor'])

    def test_primary_revocation_keeps_secondary_billing_and_shared_cancel(self):
        self.register(A); self.register(B); self.fund()
        self.call(B, 'wallet.consent', key='consent', accepted=True, terms_version=TERMS_VERSION)
        self.suspend(A)
        with self.assertRaises(NotEligible):
            self.call(A, 'snapshot')
        self.service.membership.tick()
        self.assertEqual(888, self.service.wallet.snapshot()['billed_minor'])
        state = self.call(B, 'snapshot')['snapshot']['membership']['entitlement']
        self.assertEqual(B, state['device_ref'])
        self.assertTrue(state['device_eligible'])
        self.call(B, 'wallet.consent', key='cancel', accepted=False, terms_version=TERMS_VERSION)
        self.now = 1790812800
        self.service.membership.tick()
        self.assertEqual(888, self.service.wallet.snapshot()['billed_minor'])
        self.assertFalse(self.call(B, 'snapshot')['snapshot']['membership']['entitlement']['auto_renew'])

    def test_registration_key_scope_preserves_legacy_receipt_without_linking_other_device(self):
        original = self.register(A, 'same-key')
        # Simulate the additive migration boundary: old receipt existed before
        # the origin table. Keep its exact immutable request/response bytes.
        with self.service.membership.store._transaction() as db:
            db.execute('DROP TRIGGER device_register_origin_no_delete')
            db.execute('DELETE FROM device_register_origins')
            before = tuple(db.execute('SELECT * FROM device_api_receipts WHERE key=?', ('same-key',)).fetchone())
        with self.assertRaises(Conflict):
            self.register(B, 'same-key')
        self.assertFalse(self.call(B, 'wallet.membership')['result']['registered'])
        self.assertEqual(original, self.register(A, 'same-key'))
        with closing(self.service.membership.store._connect()) as db:
            self.assertEqual(before, tuple(db.execute('SELECT * FROM device_api_receipts WHERE key=?', ('same-key',)).fetchone()))

    def test_scope_restored_after_failure_and_other_owner_never_enters(self):
        with self.assertRaises(RuntimeError):
            with self.service.membership.device_scope(B, 'alice'):
                self.assertEqual(B, self.service.membership._binding()['device_ref'])
                raise RuntimeError('test action failed')
        self.assertEqual(A, self.service.membership._binding()['device_ref'])
        for device, owner in ((B, 'bob'), ('fixture-missing', 'alice')):
            with self.subTest(device=device, owner=owner), self.assertRaises(NotEligible):
                with self.service.membership.device_scope(device, owner):
                    self.fail('unqualified device entered authority')
        self.assertEqual(A, self.service.membership._binding()['device_ref'])

    def test_replacement_recovers_consumed_atm_hold_after_restart(self):
        self.register(A); self.register(B); self.fund()
        issued = self.call(A, 'wallet.atm.issue', key='withdrawal', amount_minor=1000, atm_id='SIM-ATM-001')['result']
        self.service.dispatch({'v': 1, 'op': 'atm.redeem', 'key': 'consume', 'code': issued['code'], 'atm_id': 'SIM-ATM-001'}, peer_uid=0)
        self.suspend(A)
        self.service.close()
        self.service = self.open_service()
        current = self.call(B, 'wallet.atm.cancel', key='replacement-recover', withdrawal_id=issued['withdrawal_id'])['result']
        self.assertEqual('UNKNOWN', current['state'])
        self.assertEqual(1000, self.service.wallet.snapshot()['held_minor'])
        with self.assertRaises(NotEligible):
            self.register(A)
        self.service.dispatch({'v': 1, 'op': 'atm.reconcile', 'key': 'atm-resolution', 'withdrawal_id': issued['withdrawal_id'],
                               'total_dispensed_minor': 400, 'atm_id': 'SIM-ATM-001'}, peer_uid=0)
        final = self.service.wallet.snapshot()
        self.assertEqual(0, final['held_minor'])
        self.assertEqual(400, final['dispensed_minor'])
        self.assertEqual(0, final['ledger_balance_minor'])


if __name__ == '__main__':
    unittest.main()

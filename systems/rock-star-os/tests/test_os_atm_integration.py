"""Owner/ATM separation in the actual WalletService dispatch; no real ATM."""
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
import importlib.util
import json
from pathlib import Path
import tempfile
import threading
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('rock_os_atm_integration', ROOT / 'os/platform/service.py')
service = importlib.util.module_from_spec(spec)
spec.loader.exec_module(service)


class ATMIntegrationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.now = 1788856800
        self.fixture = ROOT / 'os/entitlement/fixtures/device-handoff.json'
        self.server = self.new_service()
        self.addCleanup(self.temp.cleanup)
        self.addCleanup(lambda: self.server.close())

    def new_service(self):
        return service.WalletService(self.temp.name, provisioning_file=self.fixture,
                                     start_scheduler=False, clock=lambda: self.now, authentication_required=False)

    def owner(self, op, **fields):
        return self.server.dispatch({'v': 1, 'op': op, **fields}, peer_uid=1002)

    def actor(self, op, **fields):
        return self.server.dispatch({'v': 1, 'op': op, **fields}, peer_uid=0)

    def fund(self):
        self.owner('wallet.register', key='register')
        sale = self.owner('wallet.sale', amount_minor=5000, key='sale')['result']
        self.owner('wallet.settle', id=sale['id'], key='settle')

    def issue(self):
        return self.owner('wallet.atm.issue', amount_minor=1000, atm_id='SIM-ATM-001', key='issue')['result']

    def status(self, receipt):
        return self.owner('wallet.atm.status', withdrawal_id=receipt['withdrawal_id'])['result']

    def test_unregistered_or_expired_membership_cannot_issue(self):
        with self.assertRaises(ValueError):
            self.issue()
        self.fund()
        receipt = self.issue()
        self.now += 100 * 86400
        with self.assertRaises(ValueError):
            self.owner('wallet.atm.issue', amount_minor=1000, atm_id='SIM-ATM-001', key='expired')
        self.assertEqual(self.status(receipt)['state'], 'ISSUED')
        result = self.owner('wallet.atm.expire', withdrawal_id=receipt['withdrawal_id'], key='expire')['result']
        self.assertEqual(result['state'], 'EXPIRED')
        self.assertEqual(self.owner('snapshot')['snapshot']['held_minor'], 0)

    def test_identity_and_actor_fields_cannot_be_supplied_by_json(self):
        self.fund()
        for field in ('owner_id', 'device_id', 'actor', 'actor_id', 'token', 'context', 'peer_uid'):
            with self.subTest(field=field), self.assertRaises(ValueError):
                self.owner('wallet.atm.issue', amount_minor=1000, atm_id='SIM-ATM-001', key='invalid', **{field: 'forged'})
        receipt = self.issue()
        for field in ('owner_id', 'device_id', 'actor', 'actor_id', 'token', 'peer_uid'):
            with self.subTest(field=field), self.assertRaises(ValueError):
                self.actor('atm.redeem', code=receipt['code'], atm_id='SIM-ATM-001', key='forged', **{field: 'forged'})
        self.assertFalse(self.status(receipt)['consumed'])

    def test_owner_channel_cannot_assert_cash_even_with_public_fixture_information(self):
        self.fund()
        receipt = self.issue()
        for op, fields in (
            ('atm.redeem', {'code': receipt['code'], 'atm_id': 'SIM-ATM-001'}),
            ('atm.dispense', {'withdrawal_id': receipt['withdrawal_id'], 'dispensed_minor': 1000, 'atm_id': 'SIM-ATM-001'}),
            ('atm.reconcile', {'withdrawal_id': receipt['withdrawal_id'], 'total_dispensed_minor': 0, 'atm_id': 'SIM-ATM-001'})):
            with self.subTest(op=op), self.assertRaises(PermissionError):
                self.owner(op, key='forbidden', **fields)
            with self.subTest(op='wallet.' + op), self.assertRaises(ValueError):
                self.owner('wallet.' + op, key='forbidden', **fields)
            platform = service.Platform.__new__(service.Platform)
            with self.assertRaises(PermissionError):
                platform.dispatch({'v': 1, 'op': op, 'key': 'forbidden', **fields}, peer_uid=1000)
        self.assertFalse(self.status(receipt)['consumed'])

    def test_root_actor_is_fixed_and_cannot_redeem_other_atm(self):
        self.fund()
        receipt = self.issue()
        with self.assertRaises(ValueError):
            self.actor('atm.redeem', code=receipt['code'], atm_id='SIM-ATM-002', key='wrong-atm')
        for peer in (None, True, 1000, 1001, 1003):
            with self.subTest(peer=peer), self.assertRaises(PermissionError):
                self.server.dispatch({'v': 1, 'op': 'atm.redeem', 'code': receipt['code'],
                                      'atm_id': 'SIM-ATM-001', 'key': 'wrong-peer'}, peer_uid=peer)
        self.assertFalse(self.status(receipt)['consumed'])

    def test_legacy_resolution_cannot_bypass_credential_for_any_allowed_peer(self):
        self.fund()
        receipt = self.issue()
        for op, fields in (('wallet.dispense', {'dispensed_minor': 1000}),
                           ('wallet.unknown', {}), ('wallet.reconcile', {'total_dispensed_minor': 0})):
            for peer in (0, 1002):
                with self.subTest(op=op, peer=peer), self.assertRaises(PermissionError):
                    self.server.dispatch({'v': 1, 'op': op, 'id': receipt['withdrawal_id'],
                                          'key': 'legacy', **fields}, peer_uid=peer)
        self.assertEqual(self.status(receipt)['state'], 'ISSUED')
        ordinary = self.owner('wallet.reserve', amount_minor=500, key='ordinary')['result']
        self.owner('wallet.unknown', id=ordinary['id'], key='ordinary-unknown')
        self.owner('wallet.reconcile', id=ordinary['id'], total_dispensed_minor=0, key='ordinary-final')
        self.assertEqual(self.owner('snapshot')['snapshot']['held_minor'], 1000)

    def test_end_to_end_partial_reconciliation_preserves_existing_ledger(self):
        self.fund()
        receipt = self.issue()
        self.assertTrue(self.issue() == receipt)
        fields = {'code': receipt['code'], 'atm_id': 'SIM-ATM-001', 'key': 'redeem'}
        authorized = self.actor('atm.redeem', **fields)
        self.assertTrue(self.actor('atm.redeem', **fields) == authorized)
        self.assertEqual(authorized['result']['state'], 'AUTHORIZED_NOT_DISPENSED')
        self.owner('wallet.atm.cancel', withdrawal_id=receipt['withdrawal_id'], key='cancel')
        self.assertEqual(self.status(receipt)['state'], 'UNKNOWN')
        self.assertEqual(self.owner('snapshot')['snapshot']['held_minor'], 1000)
        self.actor('atm.dispense', withdrawal_id=receipt['withdrawal_id'], dispensed_minor=400,
                   atm_id='SIM-ATM-001', key='partial')
        self.assertEqual(self.status(receipt)['state'], 'UNKNOWN')
        self.actor('atm.reconcile', withdrawal_id=receipt['withdrawal_id'], total_dispensed_minor=400,
                   atm_id='SIM-ATM-001', key='final')
        state = self.owner('snapshot')['snapshot']
        self.assertEqual((state['available_minor'], state['held_minor'], state['dispensed_minor'],
                          state['ledger_balance_minor']), (4600, 0, 400, 0))
        public = json.dumps([state, self.status(receipt), self.owner('wallet.atm.history', limit=50)])
        self.assertTrue(receipt['code'] not in public)

    def test_restart_and_after_commit_lost_response_keep_same_receipt(self):
        self.fund()
        original = self.server.wallet._transaction

        @contextmanager
        def lost():
            with original() as connection:
                yield connection
            raise OSError('simulated post-commit response loss')

        with patch.object(self.server.wallet, '_transaction', lost), self.assertRaises(OSError):
            self.issue()
        self.server.close()
        self.server = self.new_service()
        receipt = self.issue()
        self.assertTrue(self.issue() == receipt)
        self.assertEqual(self.owner('wallet.atm.history', limit=50)['result']['total'], 1)
        self.assertEqual(self.owner('snapshot')['snapshot']['held_minor'], 1000)

    def test_membership_lock_is_held_until_issuance_commit_completes(self):
        self.fund()
        entered, release, other_entered = threading.Event(), threading.Event(), threading.Event()
        original = self.server.atm.issue

        def issue(*args, **kwargs):
            entered.set()
            if not release.wait(3):
                raise TimeoutError('test synchronization')
            return original(*args, **kwargs)

        def change_membership():
            with self.server.membership._locked():
                other_entered.set()

        with ThreadPoolExecutor(max_workers=2) as pool, patch.object(self.server.atm, 'issue', issue):
            pending = pool.submit(self.issue)
            self.assertTrue(entered.wait(3))
            other = pool.submit(change_membership)
            try:
                self.assertFalse(other_entered.wait(.05))
            finally:
                release.set()
            pending.result()
            other.result()
        self.assertTrue(other_entered.is_set())

    def test_platform_preserves_wallet_unavailable_and_definite_rejection(self):
        platform = service.Platform.__new__(service.Platform)
        platform.wallet_socket, platform.wallet_uid = '/owned-wallet-test', 1003
        platform.wallet_view = None
        request = {'v': 1, 'op': 'wallet.atm.issue', 'amount_minor': 1000,
                   'atm_id': 'SIM-ATM-001', 'key': 'same-key'}
        for code in ('unavailable', 'rejected', 'unauthorized'):
            response = {'ok': False, 'code': code, 'error': 'synthetic response'}
            with patch.object(service, 'call', return_value=response) as called:
                self.assertEqual(platform.dispatch(request, peer_uid=1000), response)
                called.assert_called_once_with('/owned-wallet-test', request, 1003, return_errors=True)

    def test_platform_lost_or_malformed_wallet_reply_is_uncertain_same_key(self):
        platform = service.Platform.__new__(service.Platform)
        platform.wallet_socket, platform.wallet_uid = '/owned-wallet-test', 1003
        platform.wallet_view = None
        request = {'v': 1, 'op': 'wallet.atm.issue', 'amount_minor': 1000,
                   'atm_id': 'SIM-ATM-001', 'key': 'same-key'}
        for error in (TimeoutError('lost'), OSError('connection lost'), ValueError('malformed reply')):
            with patch.object(service, 'call', side_effect=error), self.assertRaisesRegex(service.ServiceUnavailable, 'same key'):
                platform.dispatch(request, peer_uid=1000)
        with patch.object(service, 'call', side_effect=PermissionError('wrong service identity')):
            with self.assertRaises(PermissionError):
                platform.dispatch(request, peer_uid=1000)
        self.assertEqual(request['key'], 'same-key')


if __name__ == '__main__':
    unittest.main()

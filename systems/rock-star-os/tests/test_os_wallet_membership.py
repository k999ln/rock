"""OS Wallet dispatch must not bypass purchased-device and billing gates."""
import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('rock_wallet_membership_integration', ROOT / 'os/platform/service.py')
service = importlib.util.module_from_spec(spec)
spec.loader.exec_module(service)


class WalletMembershipIntegrationTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.now = 1788856800
        self.fixture = ROOT / 'os/entitlement/fixtures/device-handoff.json'
        self.server = service.WalletService(self.tmp.name, provisioning_file=self.fixture,
                                           start_scheduler=False, clock=lambda: self.now, authentication_required=False)
        self.sequence = 0

    def tearDown(self):
        self.server.close()
        self.tmp.cleanup()

    def call(self, op, **fields):
        self.sequence += 1
        request = {'v':1, 'op':op, **fields}
        if op not in ('snapshot', 'health', 'wallet.membership', 'wallet.billing.status'):
            request.setdefault('key', 'integration-' + str(self.sequence))
        return self.server.dispatch(request, peer_uid=1002)

    def registered(self):
        self.assertTrue(self.call('wallet.register')['ok'])
        return self.call('wallet.membership')['result']

    def test_unregistered_service_can_show_setup_but_cannot_create_proceeds(self):
        self.assertTrue(self.call('health')['result']['ready'])
        state = self.call('snapshot')['snapshot']
        self.assertFalse(state['membership']['registered'])
        self.assertEqual([], state['membership']['registration_input_fields'])
        with self.assertRaises(ValueError):
            self.call('wallet.sale', amount_minor=2000)
        self.assertEqual([], self.server.wallet.snapshot()['sales'])

    def test_membership_and_ledger_snapshot_are_taken_under_one_guard(self):
        with patch.object(self.server.membership, 'snapshot_guard', wraps=self.server.membership.snapshot_guard) as guard:
            state = self.call('snapshot')['snapshot']
            guard.assert_called_once_with(peer_uid=1002)
            self.assertFalse(state['membership']['backend_connected'])
            self.assertTrue(state['billing']['simulation_only'])

    def test_socket_peer_cannot_be_replaced_by_json_identity(self):
        for peer in (None, True, 1000, 1001, 65534):
            with self.subTest(peer=peer), self.assertRaises(PermissionError):
                self.server.dispatch({'v':1, 'op':'wallet.register', 'key':'forged', 'peer_uid':0}, peer_uid=peer)
        self.assertFalse(self.call('wallet.membership')['result']['registered'])

    def test_registration_does_not_consent_or_debit_and_replay_keeps_identity(self):
        first = self.call('wallet.register', key='register-one')
        self.assertEqual(first, self.call('wallet.register', key='register-one'))
        self.assertEqual([], first['result']['additional_personal_fields_required'])
        self.server.membership.tick()
        self.assertEqual(0, self.call('snapshot')['snapshot']['billed_minor'])
        self.assertFalse(self.call('wallet.membership')['result']['entitlement']['auto_renew'])

    def test_monthly_api_only_enqueues_then_existing_ledger_is_debited_once(self):
        membership = self.registered()
        sale = self.call('wallet.sale', amount_minor=2000)['result']
        self.call('wallet.settle', id=sale['id'])
        self.call('wallet.consent', accepted=True, terms_version=membership['terms_version'])
        with patch.object(self.server.wallet, 'bill', side_effect=AssertionError('synchronous bill bypass')):
            accepted = self.call('wallet.bill', period='2026-09', key='one-month')
        self.assertTrue(accepted['result']['accepted'])
        self.assertNotIn('wallet_bill_id', accepted['result'])
        self.server.membership.tick()
        self.server.membership.tick()
        state = self.call('snapshot')['snapshot']
        self.assertEqual(888, state['billed_minor'])
        self.assertEqual(1112, state['available_minor'])
        self.assertEqual(1, len(state['bills']))
        self.assertEqual('paid', state['billing']['history'][0]['status'])
        self.assertEqual(accepted, self.call('wallet.bill', period='2026-09', key='one-month'))

    def test_cancel_blocks_new_billing_and_retains_hold_resolution(self):
        membership = self.registered()
        sale = self.call('wallet.sale', amount_minor=2000)['result']
        self.call('wallet.settle', id=sale['id'])
        self.call('wallet.consent', accepted=True, terms_version=membership['terms_version'])
        accepted = self.call('wallet.bill', period='2026-09', key='accepted-before-cancel')
        withdrawal = self.call('wallet.reserve', amount_minor=500)['result']
        self.call('wallet.consent', accepted=False, terms_version=membership['terms_version'])
        rejected = self.call('wallet.bill', period='2026-09', key='after-cancel')
        self.assertFalse(rejected['ok'])
        self.assertTrue(rejected['retry_with_new_key'])
        self.assertEqual(accepted, self.call('wallet.bill', period='2026-09', key='accepted-before-cancel'))
        self.now += 100 * 86400
        self.call('wallet.unknown', id=withdrawal['id'])
        self.call('wallet.reconcile', id=withdrawal['id'], total_dispensed_minor=200)
        state = self.call('snapshot')['snapshot']
        self.assertEqual(0, state['billed_minor'])
        self.assertEqual(200, state['dispensed_minor'])
        self.assertEqual(0, state['held_minor'])
        self.assertEqual(0, state['ledger_balance_minor'])
        with self.assertRaises(ValueError):
            self.call('wallet.reserve', amount_minor=100)

    def test_daemon_restart_keeps_registered_account_and_cancel(self):
        membership = self.registered()
        account = membership['entitlement']['account_id']
        self.call('wallet.consent', accepted=False, terms_version=membership['terms_version'])
        self.server.close()
        self.server = service.WalletService(self.tmp.name, provisioning_file=self.fixture,
                                           start_scheduler=False, clock=lambda:self.now, authentication_required=False)
        state = self.call('wallet.membership')['result']
        self.assertTrue(state['registered'])
        self.assertEqual(account, state['entitlement']['account_id'])
        self.assertFalse(state['entitlement']['auto_renew'])

    def test_unknown_wallet_fields_cannot_select_another_owner_or_path(self):
        self.registered()
        with self.assertRaisesRegex(ValueError, 'fields'):
            self.call('wallet.sale', amount_minor=1, owner='fixture-owner-bob')
        self.assertEqual([], self.server.wallet.snapshot()['sales'])


if __name__ == '__main__':
    unittest.main()

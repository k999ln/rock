"""Actual owned HTTP and shared signed EntitlementStore; no OS/provider claim.

WalletBridge uses a funded public simulation ledger solely to obtain actual
applied billing receipts. MCP output carries opaque correlation, not payment.
"""
from contextlib import closing
from pathlib import Path
import sqlite3
import sys
import tempfile
import threading
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'os'))
from blackberryrock.wallet import Wallet
from entitlement.protocol import PUBLIC_TOKENS, TERMS_VERSION, sign_fixture_event
from entitlement.store import EntitlementStore
from entitlement.wallet_bridge import WalletBridge
from service_access.controller import (ServiceAccessController, PUBLIC_SERVICE_TOKENS,
                                       ServiceConfigurationError)
from mcp_broker import Broker, Principal, AccessDenied, MCPHttpClient
from mcp_broker.fixture import FixtureServer, PUBLIC_TOKEN
from mcp_broker.service_access import ServiceAccessPrincipalAdapter


AUTHORITY = '00000000-0000-4000-8000-000000000001'
CONSUMERS = {
    alias: {'owner_actor': actor, 'device_ref': device, 'token': PUBLIC_SERVICE_TOKENS[alias]}
    for alias, actor, device in (('alice-a', 'alice', 'fixture-a'),
                                ('alice-b', 'alice', 'fixture-b'),
                                ('bob', 'bob', 'fixture-bob'))
}


class MCPServiceAccessTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.now = 1788858000
        self.sequences = {}
        self.ent = EntitlementStore(self.root / 'entitlement.db', clock=lambda: self.now)
        self.access = self.controller()
        self.adapter = ServiceAccessPrincipalAdapter(self.access, authority_id=AUTHORITY)
        self.server = FixtureServer(self.root / 'server')
        self.addCleanup(self.server.close)
        self.client = MCPHttpClient(self.server.origin, [self.server.policy],
                                    authorization='Bearer ' + PUBLIC_TOKEN, allow_http_fixture=True)
        self.broker = self.open_broker()
        self.addCleanup(lambda: self.broker.close())

    def controller(self, **kwargs):
        return ServiceAccessController(self.ent, authority_id=AUTHORITY, consumers=CONSUMERS, **kwargs)

    def open_broker(self):
        return Broker(self.root / 'broker', routes={'fixture': self.client},
                      principal_adapter=self.adapter, clock=lambda: self.now)

    @staticmethod
    def auth(alias='alice-a'):
        return {'authority_id': AUTHORITY, 'consumer_id': alias,
                'authorization': 'Bearer ' + CONSUMERS[alias]['token']}

    def event(self, alias='alice-a', kind='handoff'):
        item = CONSUMERS[alias]
        device = item['device_ref']
        seq = self.sequences.get(device, 0) + 1
        self.sequences[device] = seq
        payload = {'device_ref': device}
        if kind != 'suspend':
            payload.update(verification_ref='fixture-verification-' + device,
                           verified_at=self.now, valid_until=self.now + 90 * 86400)
        if kind == 'handoff':
            payload.update(owner_ref='fixture-owner-' + item['owner_actor'],
                           purchase_ref='fixture-purchase-' + device)
        self.ent.ingest(sign_fixture_event('fulfillment', 'event-' + device + '-' + str(seq),
                                          'device:' + device, seq, self.now, kind, payload))
        with closing(self.ent._connect()) as db:
            self.assertEqual(db.execute('SELECT status FROM events WHERE stream=? AND sequence=?',
                                        ('device:' + device, seq)).fetchone()[0], 'APPLIED')

    def paid(self):
        self.event()
        token = PUBLIC_TOKENS['alice']
        self.account = self.ent.register('fixture-a', 'register', token)['account_id']
        self.ent.consent(self.account, True, TERMS_VERSION, 'consent', token)
        self.wallet = Wallet(self.root / 'wallet.db')
        sale = self.wallet.simulate_sale(5000, 'sale')
        self.wallet.settle_sale(sale['id'], 'settle')
        grant = self.ent.authorize_month(self.account, '2026-09', 'authorize', PUBLIC_TOKENS['wallet'])
        self.ent.claim_authorization(grant['authorization_id'], 'claim', PUBLIC_TOKENS['wallet'])
        WalletBridge(self.ent, self.wallet, self.account, PUBLIC_TOKENS['wallet']).execute(
            grant['authorization_id'], 'payment', PUBLIC_TOKENS['wallet'])
        self.assertEqual(self.wallet.snapshot()['billed_minor'], 888)
        self.assertEqual(self.access.snapshot('alice-a')['paid_state'], 'PAID')

    def connect(self, key='connect'):
        return self.broker.connect('work', 'fixture', key=key, auth=self.auth())

    def prepare(self, key='job'):
        return self.broker.prepare('work', 'text.upper', 'selected text', key=key, auth=self.auth())

    def submit(self, key='job'):
        preview = self.prepare(key)
        return preview, self.broker.submit(key, preview['consent'], auth=self.auth())

    def status(self):
        return self.broker.status('job', auth=self.auth())

    def test_unpurchased_and_unpaid_cannot_discover_or_create_effect(self):
        with self.assertRaises(AccessDenied): self.connect()
        self.event()
        p = self.adapter.authenticate(self.auth())
        with self.adapter.guard(p, 'recover') as state:
            self.assertIsNone(state['account_id'])
            self.assertEqual(state['paid_state'], 'PAUSED')
        for action in ('connect', 'prepare', 'submit', 'start'):
            with self.subTest(action=action), self.assertRaises(AccessDenied):
                with self.adapter.guard(p, action): pass
        with self.assertRaises(AccessDenied): self.connect()
        self.assertEqual(self.server.wire, [])
        self.assertEqual(self.server.count(), 0)

    def test_exact_auth_scope_and_untrusted_identity_fields_rejected(self):
        self.paid()
        valid = self.auth()
        for request in (None, {}, {**valid, 'owner_ref': 'fixture-owner-alice'},
                        {**valid, 'device_ref': 'fixture-a'}, {**valid, 'principal': 'alice'},
                        {**valid, 'authority_id': '00000000-0000-4000-8000-000000000002'},
                        {**valid, 'consumer_id': 'unknown'}, {**valid, 'consumer_id': 'bob'},
                        {**valid, 'authorization': 'Bearer ' + PUBLIC_TOKENS['alice']},
                        {**valid, 'authorization': 'Bearer ' + PUBLIC_TOKEN},
                        {**valid, 'authorization': 123}, {**valid, 'authorization': 'x' * 257}):
            with self.subTest(fields=type(request).__name__), self.assertRaises(AccessDenied):
                self.broker.connect('work', 'fixture', key='connect', auth=request)
        self.assertEqual(self.server.wire, [])

    def test_actual_call_exact_receipt_and_credentials_not_in_broker_state(self):
        self.paid(); self.connect(); preview, receipt = self.submit()
        before = self.wallet.snapshot()
        self.assertTrue(self.broker.process_one())
        self.assertEqual(self.status()['result']['output'], {'text': 'SELECTED TEXT'})
        self.assertFalse(self.status()['financial_transaction'])
        self.assertEqual(self.broker.submit('job', preview['consent'], auth=self.auth()), receipt)
        self.assertFalse(self.broker.process_one())
        self.assertEqual(self.server.count(), 1)
        self.assertEqual(self.wallet.snapshot(), before)
        with closing(sqlite3.connect(self.broker.path)) as db:
            rows = '\n'.join(db.iterdump())
        for token in (*PUBLIC_SERVICE_TOKENS.values(), PUBLIC_TOKEN):
            self.assertNotIn(token, rows)

    def test_unknown_action_and_forged_worker_identity_fail_closed(self):
        self.paid()
        p = self.adapter.authenticate(self.auth())
        for action in ('runner.cloud.recover', 'process', 'status', '', None):
            with self.assertRaises(AccessDenied):
                with self.adapter.guard(p, action): pass
        for forged in (Principal(p.subject, 'fixture-b'), Principal('mcp-forged', p.device_ref), None):
            with self.assertRaises(AccessDenied):
                with self.adapter.guard(forged, 'start'): pass
        with self.assertRaises(ValueError):
            ServiceAccessPrincipalAdapter(self.access, authority_id='00000000-0000-4000-8000-000000000002')

    def test_alias_owner_device_and_authority_rebinding_rejected_durably(self):
        for field, value in (('owner_actor', 'bob'), ('device_ref', 'fixture-replacement')):
            bindings = {key: dict(row) for key, row in CONSUMERS.items()}
            bindings['alice-a'][field] = value
            with self.assertRaises(ServiceConfigurationError):
                ServiceAccessController(self.ent, authority_id=AUTHORITY, consumers=bindings)
        with self.assertRaises(ServiceConfigurationError):
            ServiceAccessController(self.ent, authority_id='00000000-0000-4000-8000-000000000002', consumers=CONSUMERS)
        self.assertEqual(self.adapter.authenticate(self.auth()),
                         ServiceAccessPrincipalAdapter(self.controller(), authority_id=AUTHORITY).authenticate(self.auth()))

    def test_cross_owner_and_other_device_cannot_read_existing_business_key(self):
        self.paid(); self.connect(); self.submit(); self.broker.process_one()
        self.event('alice-b'); self.event('bob')
        for alias in ('alice-b', 'bob'):
            with self.assertRaises(AccessDenied): self.broker.status('job', auth=self.auth(alias))
            self.assertEqual(self.broker.history(auth=self.auth(alias)), [])
        self.assertEqual(self.server.count(), 1)

    def test_revoke_before_claim_cancels_unsent_and_restore_needs_new_intent(self):
        self.paid(); old = self.connect(); self.submit()
        self.event(kind='suspend')
        self.assertTrue(self.broker.process_one())
        with self.assertRaises(AccessDenied): self.status()
        self.event(kind='restore')
        self.assertEqual(self.status()['state'], 'cancelled')
        self.assertEqual(self.server.count(), 0)
        self.broker.disconnect('work', key='disconnect', auth=self.auth())
        self.assertEqual(self.connect(), old)
        self.assertEqual(self.broker.connection_status('work', auth=self.auth())['state'], 'closed')
        with self.assertRaises(AccessDenied): self.prepare('new-job')
        self.connect('new-connect'); self.submit('new-job'); self.broker.process_one()
        self.assertEqual(self.server.count(), 1)

    def test_revoke_during_real_discovery_blocks_post_network_admission(self):
        self.paid()
        discover = self.client.discover
        def revoked():
            result = discover()
            self.event(kind='suspend')
            return result
        with patch.object(self.client, 'discover', side_effect=revoked), self.assertRaises(AccessDenied):
            self.connect()
        with closing(sqlite3.connect(self.broker.path)) as db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM connections').fetchone()[0], 0)
        self.assertEqual([item['method'] for item in self.server.wire], ['server/discover'])

    def test_monthly_cancel_preserves_paid_period_then_blocks_new_effect(self):
        self.paid(); self.connect(); self.submit()
        self.ent.consent(self.account, False, TERMS_VERSION, 'cancel-monthly', PUBLIC_TOKENS['alice'])
        self.broker.process_one()
        self.assertEqual(self.status()['state'], 'succeeded')
        self.now = self.access.snapshot('alice-a')['access_until']
        self.assertEqual(self.access.snapshot('alice-a')['paid_state'], 'PAUSED')
        self.assertEqual(self.status()['state'], 'succeeded')
        with self.assertRaises(AccessDenied): self.prepare('new-job')
        with self.assertRaises(AccessDenied): self.connect('new-connect')
        self.assertTrue(self.broker.disconnect('work', key='disconnect', auth=self.auth())['new_admissions_stopped'])
        self.assertEqual(self.server.count(), 1)

    def test_lost_ack_restart_unpaid_recovery_only_same_business_key(self):
        self.paid(); self.connect(); preview, receipt = self.submit()
        p = self.adapter.authenticate(self.auth())
        self.server.fault = 'drop_after_commit'; self.broker.process_one()
        self.assertEqual(self.status()['state'], 'unknown')
        self.assertEqual(self.server.count(), 1)
        self.now = self.access.snapshot('alice-a')['access_until']
        self.broker.disconnect('work', key='disconnect', auth=self.auth())
        self.broker.close()
        self.ent = EntitlementStore(self.root / 'entitlement.db', clock=lambda: self.now)
        self.access = self.controller()
        self.adapter = ServiceAccessPrincipalAdapter(self.access, authority_id=AUTHORITY)
        self.broker = self.open_broker()
        self.assertEqual(self.adapter.authenticate(self.auth()), p)
        with self.assertRaises(AccessDenied): self.broker.submit('job', preview['consent'], auth=self.auth())
        self.assertEqual(self.status()['state'], 'unknown')
        self.broker.reconcile('job', auth=self.auth()); self.broker.process_one()
        self.assertEqual(self.status()['state'], 'succeeded')
        calls = [item for item in self.server.wire if item['method'] == 'tools/call']
        self.assertEqual([item['tool'] for item in calls], ['text.upper', 'effect.status'])
        self.assertEqual(calls[0]['business_key'], calls[1]['business_key'])
        with closing(sqlite3.connect(self.broker.path)) as db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM operations').fetchone()[0], 1)
            self.assertIsNotNone(db.execute('SELECT submit_receipt FROM operations').fetchone()[0])
        self.assertFalse(receipt['financial_transaction'])

    def test_revoked_unknown_retained_without_even_recovery_http(self):
        self.paid(); self.connect(); self.submit()
        self.server.fault = 'drop_after_commit'; self.broker.process_one()
        self.broker.reconcile('job', auth=self.auth())
        self.event(kind='suspend'); before = len(self.server.wire)
        self.broker.process_one()
        self.assertEqual(len(self.server.wire), before)
        self.event(kind='restore')
        self.assertEqual(self.status()['state'], 'unknown')
        self.broker.reconcile('job', auth=self.auth()); self.broker.process_one()
        self.assertEqual(self.status()['state'], 'succeeded')
        self.assertEqual(self.server.count(), 1)

    def test_policy_is_existing_controller_choice_not_new_mcp_free_policy(self):
        other = EntitlementStore(self.root / 'other.db', clock=lambda: self.now)
        self.ent = other; self.event()
        free = ServiceAccessController(other, authority_id=AUTHORITY, consumers=CONSUMERS, paid_services=())
        adapter = ServiceAccessPrincipalAdapter(free, authority_id=AUTHORITY)
        with adapter.guard(adapter.authenticate(self.auth()), 'start') as state:
            self.assertEqual(state['paid_state'], 'PAUSED')
            self.assertEqual(state['policy_id'], free.policy_id)

    def assert_store_unlocked(self):
        acquired = []
        def check():
            held = self.ent._mutex.acquire(timeout=.5)
            acquired.append(held)
            if held: self.ent._mutex.release()
        worker = threading.Thread(target=check)
        worker.start(); worker.join(1)
        self.assertFalse(worker.is_alive())
        self.assertEqual(acquired, [True])

    def test_all_actual_network_paths_are_outside_entitlement_lock(self):
        self.paid()
        def checked(original):
            def invoke(*args, **kwargs):
                self.assert_store_unlocked()
                return original(*args, **kwargs)
            return invoke
        with patch.object(self.client, 'discover', side_effect=checked(self.client.discover)), \
                patch.object(self.client, 'execute', side_effect=checked(self.client.execute)), \
                patch.object(self.client, 'reconcile', side_effect=checked(self.client.reconcile)):
            self.connect(); self.submit()
            self.server.fault = 'drop_after_commit'; self.broker.process_one()
            self.broker.reconcile('job', auth=self.auth()); self.broker.process_one()
        self.assertEqual(self.server.count(), 1)
        self.assertEqual(self.status()['state'], 'succeeded')

    def test_signed_revocation_completes_during_inflight_http_claim_is_not_undone(self):
        self.paid(); self.connect(); self.submit(); self.server.fault = 'hold_response'
        errors = []
        def process():
            try: self.broker.process_one()
            except BaseException as error: errors.append(error)
        worker = threading.Thread(target=process)
        worker.start()
        try:
            self.assertTrue(self.server.committed.wait(1))
            self.assert_store_unlocked()
            self.event(kind='suspend')
            self.assertTrue(worker.is_alive())
            with self.assertRaises(AccessDenied): self.status()
        finally:
            self.server.release_response.set(); worker.join(4)
        self.assertFalse(worker.is_alive()); self.assertEqual(errors, [])
        self.event(kind='restore')
        self.assertEqual(self.status()['state'], 'succeeded')
        self.assertEqual(self.server.count(), 1)


if __name__ == '__main__':
    unittest.main()

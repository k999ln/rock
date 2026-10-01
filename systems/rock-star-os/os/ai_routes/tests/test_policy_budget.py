"""Actual private SQLite boundary tests; no model/provider/OS execution claim."""
from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
import copy
import json
import os
from pathlib import Path
import sqlite3
import tempfile
import threading
import unittest

from ai_routes import ComputeBudgetStore, Conflict, Denied, Unavailable
from ai_routes.policy import digest, make_plan
from ai_routes.fixture import ALICE, BOB, FixtureIdentity, FixtureAccounting, public_routes, PUBLIC_SERVICE_TOKENS

AUTHORITY = 'f1111111-1111-4111-8111-111111111111'
A, B, BOB_TOKEN = (PUBLIC_SERVICE_TOKENS[name] for name in ('alice-a', 'alice-b', 'bob'))
TEXT = 'Selected public fixture text.'


class PolicyBudgetTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.directory = Path(self.temp.name)/'authority'
        self.now = 2000000000; self.identity = FixtureIdentity(AUTHORITY); self.provider = FixtureAccounting()
        self.routes = public_routes(); self.store = self.open()
        self.addCleanup(lambda: self.store.close())

    def open(self, **changes):
        args = dict(authority_id=AUTHORITY, limits={ALICE: 1000, BOB: 1000}, routes=self.routes,
                    identity=self.identity, provider=self.provider, clock=lambda: self.now)
        args.update(changes)
        return ComputeBudgetStore(self.directory, **args)

    def plan(self, key='job-1', auth=A, target='cloud', **changes):
        args = dict(auth=auth, key=key, route_id=target, selected_text=TEXT, allow_external=target!='local', max_cost_microusd=600)
        args.update(changes); return self.store.prepare(**args)

    def reserve(self, plan, auth=A):
        return self.store.reserve(auth=auth, key=plan['key'], consent={'approved': True, 'plan_sha256': digest(plan)})

    def claim(self, plan, auth=A): return self.store.claim(auth=auth, key=plan['key'], selected_text=TEXT)

    def status(self, key=None, auth=A): return self.store.status(auth=auth, key=key)

    def test_exact_plan_reserve_claim_and_final_accounting(self):
        plan = self.plan(); self.assertEqual(plan['route']['model_revision'], 'revision-1')
        self.assertEqual(plan['input']['scope'], 'selected_text_only'); self.assertNotIn(TEXT, json.dumps(plan))
        receipt = self.reserve(plan); self.assertEqual(self.status()['budget']['reserved_microusd'], 600)
        self.assertEqual(receipt, self.reserve(plan)); self.assertTrue(self.claim(plan)['send_permitted'])
        event = self.provider.event(plan); first = self.store.reconcile(event)
        self.assertEqual(first, self.store.reconcile(event))
        budget = self.status(plan['key'])['budget']
        self.assertEqual((budget['available_microusd'], budget['reserved_microusd'], budget['spent_microusd']), (550, 0, 450))

    def test_no_external_consent_or_offline_never_falls_back(self):
        with self.assertRaises(Denied): self.plan(allow_external=False)
        self.identity.capability('online', False)
        with self.assertRaises(Denied): self.plan()
        local = self.plan(target='local'); self.assertEqual(local['route']['target'], 'local')
        self.assertEqual(self.status()['budget']['reserved_microusd'], 0)

    def test_pc_requires_connected_and_explicit_external_approval(self):
        self.identity.capability('pc_connected', False)
        with self.assertRaises(Denied): self.plan(target='pc_usb')
        self.identity.capability('pc_connected', True)
        with self.assertRaises(Denied): self.plan(target='pc_usb', allow_external=False)
        self.assertEqual(self.plan(target='pc_usb')['route']['target'], 'pc_usb')

    def test_local_exact_model_memory_storage_and_zero_cost(self):
        for field, value in (('local_models', []), ('memory_mib', 1), ('storage_mib', 1)):
            identity = FixtureIdentity(AUTHORITY); self.identity.caps = identity.caps
            self.identity.capability(field, value)
            with self.subTest(field=field), self.assertRaises(Denied): self.plan(target='local')
        self.identity.caps = FixtureIdentity(AUTHORITY).caps
        plan = self.plan(target='local'); self.reserve(plan); self.claim(plan)
        self.store.reconcile(self.provider.event(plan, cost=0))
        self.assertEqual(self.status()['budget']['available_microusd'], 1000)

    def test_exact_consent_changed_input_and_key_conflict(self):
        plan = self.plan()
        for consent in ({'approved': False, 'plan_sha256': digest(plan)}, {'approved': True, 'plan_sha256': 'a'*64}):
            with self.assertRaises(Denied): self.store.reserve(auth=A, key=plan['key'], consent=consent)
        with self.assertRaises(Conflict): self.plan(selected_text=TEXT+'changed')
        self.reserve(plan)
        with self.assertRaises(Denied): self.store.claim(auth=A, key=plan['key'], selected_text=TEXT+'changed')
        self.assertTrue(self.claim(plan)['send_permitted'])

    def test_real_sqlite_multi_device_parallel_budget_reserves_once(self):
        pa = self.plan('job-a', A); pb = self.plan('job-b', B); barrier = threading.Barrier(2)
        def reserve(plan, auth):
            barrier.wait()
            try: self.reserve(plan, auth); return 'reserved'
            except Denied: return 'denied'
        with ThreadPoolExecutor(max_workers=2) as pool:
            futures = [pool.submit(reserve, pa, A), pool.submit(reserve, pb, B)]
            self.assertCountEqual([f.result() for f in futures], ['reserved', 'denied'])
        self.assertEqual(self.status(auth=A), self.status(auth=B))
        self.assertEqual(self.status()['budget']['available_microusd'], 400)
        self.assertEqual(self.status(auth=BOB_TOKEN)['budget']['available_microusd'], 1000)

    def test_same_owner_same_key_parallel_claim_one_permission(self):
        plan = self.plan(); self.reserve(plan)
        with ThreadPoolExecutor(max_workers=2) as pool:
            claims = list(pool.map(lambda _: self.claim(plan), range(2)))
        self.assertCountEqual([result['send_permitted'] for result in claims], [True, False])
        self.assertEqual(claims[0]['receipt'], claims[1]['receipt'])

    def test_lost_claim_ack_restart_unknown_never_resends_or_time_releases(self):
        plan = self.plan(); self.reserve(plan); original = self.claim(plan)
        self.store.close(); self.now += 365*86400; self.store = self.open()
        self.assertEqual(self.status(plan['key'])['request']['state'], 'UNKNOWN')
        retry = self.claim(plan, B)
        self.assertFalse(retry['send_permitted']); self.assertEqual(retry['receipt'], original['receipt'])
        self.assertEqual(self.status()['budget']['reserved_microusd'], 600)
        self.store.reconcile(self.provider.event(plan, cost=200))
        self.assertEqual(self.status()['budget']['available_microusd'], 800)

    def test_replacement_recovers_same_owner_but_cannot_start_original_plan(self):
        plan = self.plan()
        with self.assertRaises(Denied): self.reserve(plan, B)
        self.reserve(plan)
        with self.assertRaises(Denied): self.claim(plan, B)
        self.claim(plan); self.identity.revoke('alice-a')
        with self.assertRaises(Denied): self.status(plan['key'])
        self.assertTrue(self.status(plan['key'], B)['request']['requires_status'])
        self.assertFalse(self.claim(plan, B)['send_permitted'])
        with self.assertRaises(Denied): self.status(plan['key'], BOB_TOKEN)

    def test_cancel_unclaimed_releases_claimed_holds_until_final_accounting(self):
        plan = self.plan(); self.reserve(plan)
        result = self.store.cancel(auth=A, key=plan['key'], cancel_key='cancel-before')
        self.assertTrue(result['funds_released']); self.assertFalse(result['provider_cancel_sent'])
        later = self.plan('later'); self.reserve(later); self.claim(later)
        result = self.store.cancel(auth=B, key=later['key'], cancel_key='cancel-after')
        self.assertFalse(result['funds_released']); self.assertFalse(result['provider_cancel_sent'])
        self.now += 9999
        self.assertEqual(self.status()['budget']['reserved_microusd'], 600)
        self.store.reconcile(self.provider.event(later, state='CANCELED', cost=100))
        self.assertEqual(self.status()['budget']['available_microusd'], 900)

    def test_pause_stops_new_claim_not_inflight_accounting_and_persists(self):
        plan = self.plan(); self.reserve(plan)
        self.store.set_paused(auth=B, key='pause', paused=True)
        with self.assertRaises(Denied): self.claim(plan)
        self.store.close(); self.store = self.open(); self.assertTrue(self.status()['budget']['paused'])
        self.store.set_paused(auth=A, key='resume', paused=False); self.claim(plan)
        self.store.set_paused(auth=A, key='pause-2', paused=True)
        self.store.reconcile(self.provider.event(plan)); self.assertEqual(self.status()['budget']['spent_microusd'], 450)

    def test_price_model_retention_or_capability_change_requires_new_plan(self):
        plan = self.plan(); self.reserve(plan)
        for field, value in (('model_revision', 'revision-2'), ('price_version', 'price-2'), ('retention_policy', 'different-retention')):
            original = self.store.routes['cloud'][field]; self.store.routes['cloud'][field] = value
            with self.subTest(field=field), self.assertRaises(Denied): self.claim(plan)
            self.store.routes['cloud'][field] = original
        self.identity.capability('online', False)
        with self.assertRaises(Denied): self.claim(plan)

    def test_expired_plan_rejection_persists_clock_highwater(self):
        plan = self.plan(); self.now = plan['expires_at']
        with self.assertRaises(Denied): self.reserve(plan)
        self.store.close(); self.now -= 10; self.store = self.open()
        with self.assertRaisesRegex(Denied, 'backwards'): self.reserve(plan)

    def test_default_deny_identity_and_provider_no_ambient_trust(self):
        self.store.close(); other = Path(self.temp.name)/'deny'
        denied = ComputeBudgetStore(other, authority_id=AUTHORITY, limits={ALICE: 1000}, routes=self.routes)
        self.addCleanup(denied.close)
        with self.assertRaises(Denied): denied.status(auth=A)
        with self.assertRaises(Denied): denied.reconcile({})
        with self.assertRaises(Denied): self.status(auth='wrong token')

    def test_provider_signature_and_all_execution_binding_fields(self):
        plan = self.plan(); self.reserve(plan); self.claim(plan)
        envelope = self.provider.event(plan); envelope['signature'] = '0'*64
        with self.assertRaises(Denied): self.store.reconcile(envelope)
        for field in ('authority_id', 'owner_ref', 'device_ref', 'key', 'plan_sha256', 'provider_id', 'model_id', 'model_revision', 'price_version'):
            value = self.provider.event(plan)['payload']; value[field] = 'wrong'
            with self.subTest(field=field), self.assertRaises(Denied): self.store.reconcile(self.provider.sign(value))
        self.assertEqual(self.status()['budget']['reserved_microusd'], 600)

    def test_unknown_nonfinal_and_contradictory_terminal_do_not_free_budget(self):
        plan = self.plan(); self.reserve(plan); self.claim(plan)
        self.store.reconcile(self.provider.event(plan, state='UNKNOWN', cost=0, final=False))
        for kwargs in ({'cost': 400, 'final': False},):
            with self.assertRaises(Denied): self.store.reconcile(self.provider.event(plan, event_id='bad', **kwargs))
        self.assertEqual(self.status()['budget']['reserved_microusd'], 600)
        self.store.reconcile(self.provider.event(plan, event_id='done'))
        with self.assertRaises(Conflict): self.store.reconcile(self.provider.event(plan, event_id='changed', cost=0, state='FAILED'))
        with self.assertRaises(Conflict): self.store.reconcile(self.provider.event(plan, event_id='done', cost=1))

    def test_authenticated_overrun_retains_observed_amount_hold_and_pauses_owner(self):
        plan = self.plan(); self.reserve(plan); self.claim(plan)
        event = self.provider.event(plan, cost=601)
        result = self.store.reconcile(event)
        self.assertEqual(result['observed_cost_microusd'], 601)
        self.assertEqual(result['state_at_receipt'], 'INCONSISTENT')
        self.assertEqual(result, self.store.reconcile(event))
        self.store.close(); self.store = self.open()
        status = self.status(plan['key'], B)
        self.assertEqual(status['request']['observed_overrun_microusd'], 601)
        self.assertEqual(status['budget']['reserved_microusd'], 600)
        self.assertEqual(status['budget']['spent_microusd'], 0)
        self.assertTrue(status['budget']['paused'])
        with self.assertRaises(Denied): self.store.set_paused(auth=B, key='unsafe-resume', paused=False)
        next_plan = self.plan('next', B, target='local')
        with self.assertRaises(Denied): self.reserve(next_plan, B)
        with self.assertRaises(Denied): self.store.reconcile(self.provider.event(plan, event_id='ignore-overrun', cost=600))
        self.assertEqual(self.status(auth=BOB_TOKEN)['budget']['reserved_microusd'], 0)

    def test_micro_unit_exact_arithmetic_and_input_type_bounds(self):
        self.store.routes['cloud']['max_cost_microusd'] = 1
        plan = self.plan(max_cost_microusd=1); self.reserve(plan); self.claim(plan)
        self.store.reconcile(self.provider.event(plan, cost=1)); self.assertEqual(self.status()['budget']['available_microusd'], 999)
        for value in (-1, True, 1.1, '600', 10**12+1):
            with self.subTest(value=value), self.assertRaises(ValueError): self.plan('bad', max_cost_microusd=value)
        for value in ('', 'x'*65537, '\u3042'*21846):
            with self.subTest(size=len(value)), self.assertRaises(ValueError): self.plan('big', selected_text=value)
        with self.assertRaises(Denied): self.plan('cap', max_cost_microusd=0)

    def test_sqlite_commit_failure_never_returns_send_permission(self):
        plan = self.plan(); self.reserve(plan)
        with closing(sqlite3.connect(self.store.path)) as db, db:
            db.execute("CREATE TRIGGER fixture_disk_fault BEFORE INSERT ON receipts WHEN NEW.op='claim' BEGIN SELECT RAISE(ABORT,'fixture commit fault'); END")
        with self.assertRaises(sqlite3.IntegrityError): self.claim(plan)
        self.assertEqual(self.status(plan['key'])['request']['state'], 'RESERVED')
        with closing(sqlite3.connect(self.store.path)) as db, db: db.execute('DROP TRIGGER fixture_disk_fault')
        self.assertTrue(self.claim(plan)['send_permitted'])

    def test_database_loss_marker_loss_or_wrong_authority_fail_closed(self):
        plan = self.plan(); self.reserve(plan); self.claim(plan); self.store.close()
        with self.assertRaises(ValueError): self.open(authority_id='f2222222-2222-4222-8222-222222222222')
        with closing(sqlite3.connect(self.directory/'budget.sqlite3')) as db, db:
            db.execute('DROP TRIGGER retained_mode'); db.execute('DELETE FROM mode')
        with self.assertRaises(ValueError): self.open()
        (self.directory/'budget.sqlite3').unlink()
        with self.assertRaises(ValueError): self.open()
        self.assertFalse((self.directory/'budget.sqlite3').exists())

    def test_private_storage_singleton_and_bounded_history(self):
        with self.assertRaises(BlockingIOError): self.open()
        self.assertEqual(self.directory.stat().st_mode & 0o777, 0o700)
        self.assertEqual(self.store.path.stat().st_mode & 0o777, 0o600)
        self.store.max_records = 1; self.plan()
        with self.assertRaises(Unavailable): self.plan('capacity')
        self.store.close(); self.store.path.chmod(0o644)
        with self.assertRaises(ValueError): self.open()

    def test_unknown_recovers_after_provider_model_catalog_replacement(self):
        plan = self.plan(); self.reserve(plan); self.claim(plan); self.store.close()
        self.routes[1]['model_revision'] = 'revision-2'; self.store = self.open()
        self.store.reconcile(self.provider.event(plan, cost=400))
        self.assertEqual(self.status()['budget']['spent_microusd'], 400)
        new = self.plan('new'); self.assertEqual(new['route']['model_revision'], 'revision-2')

    def test_pure_policy_ignores_no_fields_and_never_changes_target(self):
        args = dict(authority_id=AUTHORITY, owner_ref=ALICE, device_ref='fixture-device-a', key='pure',
            selected_text=TEXT, selected_route=public_routes()[1], capability_evidence=self.identity.caps,
            allow_external=True, max_cost_microusd=600, now=self.now)
        self.assertEqual(make_plan(**args)['route']['target'], 'cloud')
        args['selected_route']['hidden_fallback'] = 'another-provider'
        with self.assertRaises(ValueError): make_plan(**args)


if __name__ == '__main__': unittest.main()

"""Actual loopback HTTP/SQLite tests, not an OS boot or public MCP deployment."""
from contextlib import contextmanager, closing
from pathlib import Path
import json
import os
import sqlite3
import sys
import tempfile
import threading
import time
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'os'))
from mcp_broker import Broker, Principal, AccessDenied, Conflict, Unavailable, MCPHttpClient, ToolPolicy
from mcp_broker.fixture import FixtureServer, PUBLIC_TOKEN
from mcp_broker.http import TransportError, VERSION, canonical, digest


class FixturePrincipals:
    def __init__(self):
        self.lock = threading.RLock()
        self.active = True
        self.values = {'PUBLIC-ALICE': Principal('alice', 'device-a'), 'PUBLIC-BOB': Principal('bob', 'device-b')}

    def authenticate(self, credential):
        if credential not in self.values: raise AccessDenied('unknown public fixture actor')
        return self.values[credential]

    @contextmanager
    def guard(self, principal, action):
        with self.lock:
            if not self.active or principal not in self.values.values(): raise AccessDenied('fixture principal revoked')
            yield


class BrokerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.directory = Path(self.temp.name)
        self.server = FixtureServer(self.directory / 'server')
        self.adapter = FixturePrincipals()
        self.now = 1000
        self.client = self.make_client()
        self.broker = self.make_broker()

    def make_client(self, policy=None, **kwargs):
        return MCPHttpClient(self.server.origin, [policy or self.server.policy], authorization='Bearer ' + PUBLIC_TOKEN,
                             allow_http_fixture=True, **kwargs)

    def make_broker(self, **kwargs):
        return Broker(self.directory / 'broker', routes={'fixture': self.client}, principal_adapter=self.adapter,
                      clock=lambda: self.now, **kwargs)

    def tearDown(self):
        self.server.release_response.set()
        self.broker.close()
        self.server.close()
        self.temp.cleanup()

    def connect(self, key='connect-1'):
        return self.broker.connect('work', 'fixture', key=key, auth='PUBLIC-ALICE')

    def prepare(self, key='business-1', text='Selected text only'):
        return self.broker.prepare('work', 'text.upper', text, key=key, auth='PUBLIC-ALICE')

    def submit(self, key='business-1', text='Selected text only'):
        preview = self.prepare(key, text)
        receipt = self.broker.submit(key, preview['consent'], auth='PUBLIC-ALICE')
        return preview, receipt

    def status(self, key='business-1'):
        return self.broker.status(key, auth='PUBLIC-ALICE')

    def test_actual_wire_discover_call_and_exact_local_retry(self):
        self.connect(); preview, receipt = self.submit()
        self.assertEqual(self.server.count(), 0)
        self.assertEqual(len(self.server.wire), 1)
        self.assertFalse(receipt['remote_execution_confirmed'])
        self.assertTrue(self.broker.process_one())
        result = self.status()
        self.assertEqual(result['state'], 'succeeded')
        self.assertEqual(result['result']['output'], {'text': 'SELECTED TEXT ONLY'})
        self.assertFalse(result['financial_transaction'])
        self.assertTrue(result['result']['settlement_correlation'].startswith('corr-'))
        self.assertEqual(self.broker.submit('business-1', preview['consent'], auth='PUBLIC-ALICE'), receipt)
        self.assertFalse(self.broker.process_one())
        self.assertEqual(self.server.count(), 1)
        self.assertEqual([x['method'] for x in self.server.wire], ['server/discover', 'tools/call'])
        self.assertNotEqual(self.server.wire[0]['id'], self.server.wire[1]['id'])
        self.assertEqual(preview['plan']['route']['protocol'], VERSION)

    def test_default_principal_adapter_denies_before_network(self):
        self.broker.close()
        self.broker = Broker(self.directory / 'deny', routes={'fixture': self.client})
        with self.assertRaises(AccessDenied): self.connect()
        self.assertEqual(self.server.wire, [])

    def test_owner_and_revoked_actor_cannot_read_or_replay(self):
        self.connect(); preview, _ = self.submit()
        with self.assertRaises(AccessDenied): self.broker.status('business-1', auth='PUBLIC-BOB')
        self.adapter.active = False
        with self.assertRaises(AccessDenied): self.status()
        with self.assertRaises(AccessDenied): self.broker.submit('business-1', preview['consent'], auth='PUBLIC-ALICE')
        self.broker.process_one()
        self.adapter.active = True
        self.assertEqual(self.status()['state'], 'cancelled')
        self.assertEqual(self.server.count(), 0)

    def test_input_scope_allowlist_and_size_bound(self):
        self.connect()
        for text in (None, b'bytes', 'x' * 65537):
            with self.assertRaises(ValueError): self.prepare(text=text)
        with self.assertRaises(ValueError): self.broker.prepare('work', 'shell', 'text', key='other', auth='PUBLIC-ALICE')
        with self.assertRaises(AccessDenied): self.broker.prepare('work', 'text.upper', 'text', key='other', data_scope='all_files', auth='PUBLIC-ALICE')
        self.assertEqual(self.server.count(), 0)

    def test_plan_binds_schema_route_scope_price_and_exact_input(self):
        self.connect(); p = self.prepare()
        plan = p['plan']
        self.assertEqual(digest(plan), p['consent']['digest'])
        self.assertIn('input_schema', plan['contract'])
        self.assertEqual(plan['data_scope'], 'user_selected_text')
        self.assertEqual(plan['price'], {'currency': 'USD', 'amount_minor': 0, 'version': 'public-fixture-1'})
        with self.assertRaises(Conflict): self.prepare(text='Changed')
        for field, value in [('epoch', 2), ('input_sha256', '0' * 64), ('data_scope', 'another'), ('price', {'amount_minor': 1})]:
            changed = dict(plan); changed[field] = value
            with self.assertRaises(AccessDenied): self.broker.submit('business-1', {'approved': True, 'digest': digest(changed)}, auth='PUBLIC-ALICE')
        for consent in ({'approved': 1, 'digest': p['consent']['digest']}, {**p['consent'], 'extra': True}, None):
            with self.assertRaises(AccessDenied): self.broker.submit('business-1', consent, auth='PUBLIC-ALICE')

    def test_price_schema_route_change_needs_new_epoch_and_consent(self):
        self.connect(); p, _ = self.submit()
        self.broker.routes['fixture'] = self.make_client(ToolPolicy('text.upper', 'effect.status', price_version='price-2', amount_minor=25, max_input_bytes=2048))
        self.broker.process_one()
        self.assertEqual(self.status()['state'], 'cancelled')
        with self.assertRaises(AccessDenied): self.prepare('business-2')
        self.connect('connect-new-policy'); new = self.prepare('business-2')
        self.assertGreater(new['plan']['epoch'], p['plan']['epoch'])
        self.assertNotEqual(new['consent']['digest'], p['consent']['digest'])
        self.assertEqual(new['plan']['price']['amount_minor'], 25)
        with self.assertRaises(AccessDenied): self.broker.submit('business-2', p['consent'], auth='PUBLIC-ALICE')
        self.assertEqual(self.server.count(), 0)

    def test_disconnect_prevents_queued_send_and_erases_input(self):
        self.connect(); self.submit()
        receipt = self.broker.disconnect('work', key='disconnect', auth='PUBLIC-ALICE')
        self.assertTrue(receipt['new_admissions_stopped'])
        self.assertEqual(receipt['upstream_credential_revocation'], 'NOT_IMPLEMENTED')
        self.assertFalse(self.broker.process_one())
        self.assertEqual(self.status()['state'], 'cancelled')
        with closing(sqlite3.connect(self.broker.path)) as db:
            self.assertIsNone(db.execute('SELECT input_text FROM operations').fetchone()[0])
        self.assertEqual(self.server.count(), 0)

    def test_old_connect_replay_does_not_reactivate_or_resurrect_grant(self):
        old = self.connect(); p, receipt = self.submit()
        self.broker.disconnect('work', key='disconnect', auth='PUBLIC-ALICE')
        self.assertEqual(self.connect(), old)
        self.assertEqual(self.broker.connection_status('work', auth='PUBLIC-ALICE')['state'], 'closed')
        self.assertEqual(self.broker.submit('business-1', p['consent'], auth='PUBLIC-ALICE'), receipt)
        new = self.connect('connect-2')
        self.assertGreater(new['epoch'], old['epoch'])
        self.assertEqual(self.prepare()['state'], 'cancelled')
        self.assertFalse(self.broker.process_one())
        with self.assertRaises(Conflict): self.broker.disconnect('work', key='connect-1', auth='PUBLIC-ALICE')

    def test_disconnect_after_claim_does_not_block_network_or_hide_effect(self):
        self.connect(); self.submit(); self.server.fault = 'hold_response'
        errors = []
        def work():
            try: self.broker.process_one()
            except Exception as exc: errors.append(type(exc).__name__)
        worker = threading.Thread(target=work); worker.start()
        try:
            self.assertTrue(self.server.committed.wait(1))
            self.assertFalse(self.broker.process_one())
            start = time.monotonic()
            self.broker.disconnect('work', key='disconnect', auth='PUBLIC-ALICE')
            self.assertLess(time.monotonic() - start, 0.5)
            self.assertTrue(self.status()['send_claimed'])
        finally:
            self.server.release_response.set(); worker.join(3)
        self.assertFalse(worker.is_alive()); self.assertEqual(errors, [])
        self.assertEqual(self.status()['state'], 'succeeded')
        self.assertEqual(self.server.count(), 1)

    def test_lost_response_restarts_and_only_reconciles_same_business_key(self):
        self.connect(); p, receipt = self.submit(); self.server.fault = 'drop_after_commit'
        self.broker.process_one(); self.assertEqual(self.status()['state'], 'unknown')
        self.assertEqual(self.server.count(), 1)
        self.broker.disconnect('work', key='disconnect', auth='PUBLIC-ALICE')
        self.broker.close(); self.broker = self.make_broker()
        self.assertEqual(self.broker.submit('business-1', p['consent'], auth='PUBLIC-ALICE'), receipt)
        self.broker.reconcile('business-1', auth='PUBLIC-ALICE'); self.broker.process_one()
        self.assertEqual(self.status()['state'], 'succeeded')
        calls = [x for x in self.server.wire if x['method'] == 'tools/call']
        self.assertEqual([x['tool'] for x in calls], ['text.upper', 'effect.status'])
        self.assertEqual(calls[0]['business_key'], calls[1]['business_key'])
        self.assertNotEqual(calls[0]['id'], calls[1]['id'])
        with closing(sqlite3.connect(self.broker.path)) as db:
            self.assertIsNone(db.execute('SELECT input_text FROM operations').fetchone()[0])

    def test_reconnected_changed_policy_recovers_old_intent_with_only_pinned_read(self):
        self.connect(); self.submit(); self.server.fault = 'drop_after_commit'
        self.broker.process_one()
        old_client = self.client
        self.client = self.make_client(ToolPolicy('text.upper', 'effect.status', price_version='price-2', amount_minor=25))
        self.broker.routes['fixture'] = self.client
        self.connect('connect-price-2')
        self.broker.close()
        self.broker = self.make_broker(recovery_routes=[old_client])
        self.broker.reconcile('business-1', auth='PUBLIC-ALICE'); self.broker.process_one()
        self.assertEqual(self.status()['state'], 'succeeded')
        self.assertEqual(self.server.count(), 1)
        self.assertEqual([w['tool'] for w in self.server.wire if w['method'] == 'tools/call'], ['text.upper', 'effect.status'])

    def test_missing_historical_route_retains_unknown_without_wrong_destination(self):
        self.connect(); self.submit(); self.server.fault = 'drop_after_commit'; self.broker.process_one()
        self.broker.close()
        self.client = self.make_client(ToolPolicy('text.upper', 'effect.status', price_version='replacement-policy'))
        self.broker = self.make_broker()
        before = len(self.server.wire)
        self.broker.reconcile('business-1', auth='PUBLIC-ALICE'); self.broker.process_one()
        self.assertEqual(len(self.server.wire), before)
        self.assertEqual(self.status()['state'], 'unknown')

    def test_revoked_principal_cannot_recover_but_result_is_not_discarded(self):
        self.connect(); self.submit(); self.server.fault = 'drop_after_commit'; self.broker.process_one()
        self.broker.reconcile('business-1', auth='PUBLIC-ALICE')
        before = len(self.server.wire); self.adapter.active = False
        self.broker.process_one()
        self.assertEqual(len(self.server.wire), before)
        self.adapter.active = True
        self.assertEqual(self.status()['state'], 'unknown')
        self.broker.reconcile('business-1', auth='PUBLIC-ALICE'); self.broker.process_one()
        self.assertEqual(self.status()['state'], 'succeeded')

    def test_not_found_does_not_resend_unknown_effect(self):
        self.connect(); self.submit()
        with patch.object(self.client, 'execute', side_effect=TransportError('fixture network unavailable')):
            self.broker.process_one()
        for _ in range(3):
            self.broker.reconcile('business-1', auth='PUBLIC-ALICE'); self.broker.process_one()
        self.assertEqual(self.status()['state'], 'unknown')
        self.assertEqual(self.server.count(), 0)
        self.assertTrue(all(x.get('tool') != 'text.upper' for x in self.server.wire))

    def test_terminal_commit_followed_by_error_never_demotes_result(self):
        self.connect(); self.submit(); original = self.broker._finish
        def finish_then_error(*args):
            original(*args); raise OSError('post-commit persistence error')
        with patch.object(self.broker, '_finish', side_effect=finish_then_error): self.broker.process_one()
        self.assertEqual(self.status()['state'], 'succeeded')
        self.assertFalse(self.broker.process_one()); self.assertEqual(self.server.count(), 1)

    def test_rollback_before_sending_commit_preserves_queued_input(self):
        self.connect(); self.submit(); original = self.broker._transaction
        faulted = False
        @contextmanager
        def transaction():
            nonlocal faulted
            with original() as db:
                yield db
                state = db.execute('SELECT state FROM operations').fetchone()[0]
                if state == 'sending' and not faulted:
                    faulted = True; raise OSError('before sending commit')
        with patch.object(self.broker, '_transaction', transaction): self.broker.process_one()
        self.assertEqual(self.server.count(), 0)
        self.assertEqual(self.status()['state'], 'queued')
        with closing(sqlite3.connect(self.broker.path)) as db:
            self.assertEqual(db.execute('SELECT input_text FROM operations').fetchone()[0], 'Selected text only')
        self.now += 10; self.broker.process_one()
        self.assertEqual(self.server.count(), 1)

    def test_sending_commit_then_error_never_replays_effect(self):
        self.connect(); self.submit(); original = self.broker._transaction
        faulted = False
        @contextmanager
        def transaction():
            nonlocal faulted
            inject = False
            with original() as db:
                yield db
                if db.execute('SELECT state FROM operations').fetchone()[0] == 'sending' and not faulted:
                    inject = faulted = True
            if inject: raise OSError('sending claim committed but acknowledgement lost')
        with patch.object(self.broker, '_transaction', transaction): self.broker.process_one()
        self.assertEqual(self.status()['state'], 'unknown')
        self.broker.reconcile('business-1', auth='PUBLIC-ALICE'); self.broker.process_one()
        self.assertEqual(self.server.count(), 0)
        self.assertTrue(all(w.get('tool') != 'text.upper' for w in self.server.wire))

    def test_bad_receipt_cannot_confirm_and_status_recovers(self):
        self.connect(); self.submit(); self.server.fault = 'wrong_receipt'
        self.broker.process_one(); self.assertEqual(self.status()['state'], 'unknown')
        self.broker.reconcile('business-1', auth='PUBLIC-ALICE'); self.broker.process_one()
        self.assertEqual(self.status()['state'], 'succeeded'); self.assertEqual(self.server.count(), 1)

    def test_clock_rollback_and_expiry_fail_closed(self):
        self.connect(); p = self.prepare(); self.now -= 1
        with self.assertRaises(AccessDenied): self.broker.submit('business-1', p['consent'], auth='PUBLIC-ALICE')
        self.now += 122
        with self.assertRaises(AccessDenied): self.broker.submit('business-1', p['consent'], auth='PUBLIC-ALICE')
        self.assertEqual(self.server.count(), 0)

    def test_rejected_expiry_highwater_survives_restart_and_clock_rewind(self):
        self.connect(); preview = self.prepare(); self.now += 121
        with self.assertRaises(AccessDenied): self.broker.submit('business-1', preview['consent'], auth='PUBLIC-ALICE')
        self.broker.close(); self.now = 1050; self.broker = self.make_broker()
        with self.assertRaises(AccessDenied): self.broker.submit('business-1', preview['consent'], auth='PUBLIC-ALICE')
        self.assertEqual(self.server.count(), 0)

    def test_storage_capacity_is_bounded(self):
        self.broker.close(); self.broker = self.make_broker(max_operations=1)
        self.connect(); self.prepare()
        with self.assertRaises(Unavailable): self.prepare('second')

    def test_database_and_lock_private_single_owner(self):
        self.assertEqual(self.broker.path.stat().st_mode & 0o777, 0o600)
        with self.assertRaises(OSError): self.make_broker()
        self.broker.close()
        (self.directory / 'alias').symlink_to(self.directory / 'broker', target_is_directory=True)
        with self.assertRaises(ValueError): Broker(self.directory / 'alias')
        os.chmod(self.broker.path, 0o644)
        with self.assertRaises(ValueError): self.make_broker()
        os.chmod(self.broker.path, 0o600)

    def test_missing_existing_table_does_not_reset_broker_state(self):
        self.connect(); self.broker.close()
        with closing(sqlite3.connect(self.broker.path)) as db:
            db.execute('DROP TABLE broker_mode'); db.commit()
        with self.assertRaises(ValueError): self.make_broker()
        with closing(sqlite3.connect(self.broker.path)) as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM sqlite_master WHERE name='broker_mode'").fetchone()[0], 0)

    def test_close_with_active_request_retains_single_writer_lock_until_done(self):
        self.connect(); self.submit(); self.server.fault = 'hold_response'
        worker = threading.Thread(target=self.broker.process_one); worker.start()
        try:
            self.assertTrue(self.server.committed.wait(1))
            with self.assertRaises(Unavailable): self.broker.close()
            with self.assertRaises(OSError): self.make_broker()
        finally:
            self.server.release_response.set(); worker.join(3)
        self.assertFalse(worker.is_alive())
        self.broker.close()

    def test_worker_transient_database_failure_recovers_and_close_is_idempotent(self):
        self.connect(); self.submit(); original = self.broker.process_one; calls = []
        def process():
            calls.append(1)
            if len(calls) == 1: raise sqlite3.OperationalError('temporary fixture failure')
            return original()
        with patch.object(self.broker, 'process_one', side_effect=process):
            self.broker.start(); first = self.broker._worker; self.broker.start()
            self.assertIs(self.broker._worker, first)
            deadline = time.monotonic() + 2
            while self.status()['state'] != 'succeeded' and time.monotonic() < deadline: time.sleep(0.01)
            self.broker.close()
        self.assertFalse(first.is_alive()); self.assertEqual(self.server.count(), 1)
        self.broker.close()
        with self.assertRaises(Unavailable): self.broker.start()

    def test_dead_worker_restart_reconciles_committed_effect_without_resend(self):
        self.connect(); self.submit(); execute = self.client.execute
        def effect_then_exit(*args, **kwargs):
            execute(*args, **kwargs)
            raise SystemExit('test-only worker termination after effect')
        with patch.object(self.client, 'execute', side_effect=effect_then_exit):
            self.broker.start(); first = self.broker._worker; first.join(2)
            self.assertFalse(first.is_alive())
        self.assertEqual(self.status()['state'], 'sending')
        self.broker.start()
        self.assertIsNot(self.broker._worker, first)
        deadline = time.monotonic() + 2
        while self.status()['state'] != 'succeeded' and time.monotonic() < deadline: time.sleep(0.01)
        self.assertEqual(self.status()['state'], 'succeeded')
        self.assertEqual(self.server.count(), 1)
        self.assertEqual([w['tool'] for w in self.server.wire if w['method'] == 'tools/call'], ['text.upper', 'effect.status'])


class HttpBoundaryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.server = FixtureServer(Path(self.temp.name) / 'server')

    def tearDown(self):
        self.server.close(); self.temp.cleanup()

    def client(self, **kwargs):
        return MCPHttpClient(self.server.origin, [self.server.policy], authorization='Bearer ' + PUBLIC_TOKEN,
                             allow_http_fixture=True, **kwargs)

    def test_redirect_wrong_id_size_and_authorization_rejected(self):
        for fault in ('redirect', 'wrong_id', 'oversize'):
            with self.subTest(fault=fault):
                self.server.fault = fault
                with self.assertRaises(TransportError): self.client().discover()
        client = MCPHttpClient(self.server.origin, [self.server.policy], authorization='Bearer WRONG-PUBLIC-FIXTURE', allow_http_fixture=True)
        with self.assertRaises(TransportError): client.discover()
        self.assertEqual(self.server.count(), 0)

    def test_origin_and_secret_header_bounds(self):
        for origin in ('http://example.com', self.server.origin + '/other', self.server.origin + '?secret=x', 'https://user:pass@example.com'):
            with self.assertRaises(ValueError): MCPHttpClient(origin, [self.server.policy], authorization='Bearer PUBLIC', allow_http_fixture=True)
        with self.assertRaises(ValueError): MCPHttpClient('https://example.com', [self.server.policy], authorization='Bearer PUBLIC')
        with self.assertRaises(ValueError): MCPHttpClient(self.server.origin, [self.server.policy], authorization='Bearer PUBLIC\nExtra: value', allow_http_fixture=True)
        serialized = canonical(self.client().descriptor())
        self.assertNotIn(PUBLIC_TOKEN.encode(), serialized)

    def test_slow_response_has_bounded_timeout(self):
        self.server.fault = 'slow_body'; start = time.monotonic()
        with self.assertRaises(TransportError): self.client(timeout=0.1).discover()
        self.assertLess(time.monotonic() - start, 0.6)


if __name__ == '__main__':
    unittest.main()

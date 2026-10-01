"""Owned HTTP/SQLite regressions for Broker lifecycle and retained admission.

Discovery is paused only after a real fixture HTTP reply to expose a local
commit race. Corruption is injected only into disposable, stopped SQLite files.
"""
from contextlib import closing, contextmanager
import hashlib
import os
from pathlib import Path
import sqlite3
import sys
import tempfile
import threading
import time
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT/'src'), str(ROOT/'os')]
from mcp_broker import Broker, Principal, AccessDenied, Conflict, Unavailable, MCPHttpClient
from mcp_broker.fixture import FixtureServer, PUBLIC_TOKEN
from mcp_broker.http import MAX_BODY


class Principals:
    def __init__(self):
        self.lock = threading.RLock(); self.active = True
        self.principal = Principal('fixture-alice', 'fixture-device-a')

    def authenticate(self, auth):
        if auth != 'PUBLIC-ALICE': raise AccessDenied('fixture owner required')
        return self.principal

    @contextmanager
    def guard(self, principal, action):
        with self.lock:
            if not self.active or principal != self.principal: raise AccessDenied('fixture device revoked')
            yield


class BrokerLifecycleTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(); self.root = Path(self.temporary.name)
        self.server = FixtureServer(self.root/'provider')
        self.client = MCPHttpClient(self.server.origin, [self.server.policy],
            authorization='Bearer '+PUBLIC_TOKEN, allow_http_fixture=True)
        self.adapter = Principals(); self.now = 1000
        self.broker = self.make_broker()

    def make_broker(self, **kwargs):
        return Broker(self.root/'broker', routes={'fixture':self.client}, principal_adapter=self.adapter,
                      clock=lambda:self.now, **kwargs)

    def tearDown(self):
        self.server.release_response.set()
        try: self.broker.close()
        finally:
            self.server.close(); self.temporary.cleanup()

    def connect(self, key='connect-1'):
        return self.broker.connect('notes','fixture',key=key,auth='PUBLIC-ALICE')

    def reference(self, key='intent-1', text='selected fixture'):
        return self.broker.prepare_reference('notes','text.upper',hashlib.sha256(text.encode()).hexdigest(),
                                            len(text.encode()),key=key,auth='PUBLIC-ALICE')

    def status(self, key='intent-1'): return self.broker.status(key,auth='PUBLIC-ALICE')

    def row(self, key='intent-1'):
        with closing(sqlite3.connect(self.broker.path.as_uri()+'?mode=ro',uri=True)) as db:
            db.row_factory=sqlite3.Row; db.execute('PRAGMA query_only=ON')
            return dict(db.execute('SELECT * FROM operations WHERE key=?',(key,)).fetchone())

    def race_disconnect(self, previous):
        if previous:
            self.connect(); self.reference()
        done, release = threading.Event(), threading.Event()
        original = self.client.discover; outcomes=[]
        def pause():
            result=original(); done.set()
            if not release.wait(3): raise TimeoutError('test discovery release missing')
            return result
        def connect():
            try: outcomes.append(self.connect('connect-racing'))
            except BaseException as error: outcomes.append(error)
        with patch.object(self.client,'discover',side_effect=pause):
            thread=threading.Thread(target=connect);thread.start()
            try:
                self.assertTrue(done.wait(2))
                receipt=self.broker.disconnect('notes',key='disconnect-later',auth='PUBLIC-ALICE')
                self.assertTrue(receipt['new_admissions_stopped'])
                self.assertEqual(receipt['epoch'],2 if previous else 1)
            finally:
                release.set();thread.join(3)
        self.assertFalse(thread.is_alive());self.assertEqual(len(outcomes),1)
        self.assertIsInstance(outcomes[0],Conflict)
        self.assertEqual(self.broker.connection_status('notes',auth='PUBLIC-ALICE')['state'],'closed')
        if previous: self.assertEqual(self.status()['state'],'cancelled')
        wire_count=len(self.server.wire)
        self.broker.close();self.broker=self.make_broker()
        with self.assertRaises(Conflict): self.connect('connect-racing')
        self.assertEqual(len(self.server.wire),wire_count)
        self.assertEqual(self.broker.disconnect('notes',key='disconnect-later',auth='PUBLIC-ALICE'),receipt)
        self.assertEqual(self.connect('explicit-new-connect')['epoch'],receipt['epoch']+1)
        self.assertEqual(self.server.count(),0)

    def test_first_discovery_disconnect_tombstone_blocks_old_key_after_restart(self):
        self.race_disconnect(False)

    def test_connected_discovery_cas_and_cancelled_key_remain_durable(self):
        self.race_disconnect(True)

    def test_disconnect_then_process_loss_before_cas_keeps_old_attempt_closed(self):
        original=self.client.discover
        def discovery_then_process_loss():
            original()  # Actual HTTP discovery has completed; no effect call.
            self.broker.disconnect('notes',key='disconnect-after-discovery',auth='PUBLIC-ALICE')
            raise SystemExit('test-only loss before connect CAS')
        with patch.object(self.client,'discover',side_effect=discovery_then_process_loss):
            with self.assertRaises(SystemExit):self.connect('connect-lost')
        self.assertEqual(len(self.server.wire),1)
        self.broker.close();self.broker=self.make_broker()
        self.adapter.active=False
        with self.assertRaises(AccessDenied):self.connect('connect-lost')
        self.adapter.active=True
        with self.assertRaises(Conflict):self.connect('connect-lost')
        self.assertEqual(len(self.server.wire),1)
        self.assertEqual(self.broker.connection_status('notes',auth='PUBLIC-ALICE')['state'],'closed')
        self.assertEqual(self.connect('explicit-new-after-loss')['epoch'],2)
        self.assertEqual(self.server.count(),0)

    def test_pending_attempt_reserves_control_key_and_has_separate_capacity(self):
        self.broker.close();self.broker=self.make_broker(max_control_receipts=1)
        original=self.client.discover
        def interrupted_discovery():
            original();raise OSError('test-only unresolved discovery')
        with patch.object(self.client,'discover',side_effect=interrupted_discovery):
            with self.assertRaises(OSError):self.connect('reserved')
        with self.assertRaises(Conflict):self.broker.disconnect('notes',key='reserved',auth='PUBLIC-ALICE')
        with self.assertRaisesRegex(Unavailable,'attempt capacity'):self.connect('new-attempt')
        self.assertEqual(len(self.server.wire),1)
        self.assertEqual(self.connect('reserved')['event'],'connected')
        self.assertEqual(len(self.server.wire),2)

    def test_unconnected_disconnect_requires_auth_and_never_discovers(self):
        with self.assertRaises(AccessDenied): self.broker.disconnect('notes',key='x',auth='PUBLIC-BOB')
        self.adapter.active=False
        with self.assertRaises(AccessDenied): self.broker.disconnect('notes',key='x',auth='PUBLIC-ALICE')
        self.adapter.active=True
        first=self.broker.disconnect('notes',key='x',auth='PUBLIC-ALICE')
        self.assertEqual(self.broker.disconnect('notes',key='x',auth='PUBLIC-ALICE'),first)
        with self.assertRaises(AccessDenied): self.reference()
        self.assertEqual(self.server.wire,[])

    def test_thread_start_failure_clears_unstarted_worker_and_releases_on_close(self):
        self.connect();preview=self.reference()
        self.broker.submit('intent-1',preview['consent'],text='selected fixture',auth='PUBLIC-ALICE')
        with patch.object(threading.Thread,'start',side_effect=RuntimeError('injected thread creation failure')):
            with self.assertRaises(RuntimeError): self.broker.start()
        self.assertIsNone(self.broker._worker)
        self.assertEqual(self.status()['state'],'queued')
        self.broker.close();self.broker.close()
        self.broker=self.make_broker();self.assertEqual(self.status()['state'],'queued')
        self.assertEqual(self.server.count(),0)
        self.broker.start();deadline=time.monotonic()+2
        while self.status()['state']!='succeeded' and time.monotonic()<deadline:time.sleep(.01)
        self.assertEqual(self.status()['state'],'succeeded');self.assertEqual(self.server.count(),1)

    def test_failed_start_can_retry_same_live_broker_without_duplicate_send(self):
        self.connect();preview=self.reference()
        self.broker.submit('intent-1',preview['consent'],text='selected fixture',auth='PUBLIC-ALICE')
        with patch.object(threading.Thread,'start',side_effect=RuntimeError('injected failure')):
            with self.assertRaises(RuntimeError): self.broker.start()
        self.broker.start();first=self.broker._worker;self.broker.start()
        self.assertIs(self.broker._worker,first)
        deadline=time.monotonic()+2
        while self.status()['state']!='succeeded' and time.monotonic()<deadline:time.sleep(.01)
        self.assertEqual(self.status()['state'],'succeeded');self.assertEqual(self.server.count(),1)

    def test_missing_retained_mode_row_does_not_reset_highwater_or_change_db(self):
        self.connect();self.now=2000;self.reference();self.broker.close()
        with closing(sqlite3.connect(self.broker.path)) as db:
            self.assertEqual(db.execute('SELECT maximum_time FROM broker_mode').fetchone()[0],2000)
            db.execute('DELETE FROM broker_mode');db.commit()
        before=hashlib.sha256(self.broker.path.read_bytes()).hexdigest();self.now=1000
        with self.assertRaisesRegex(ValueError,'clock marker'): self.make_broker()
        self.assertEqual(hashlib.sha256(self.broker.path.read_bytes()).hexdigest(),before)
        with closing(sqlite3.connect(self.broker.path)) as db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM broker_mode').fetchone()[0],0)
            self.assertEqual(db.execute('SELECT COUNT(*) FROM operations').fetchone()[0],1)

    def test_invalid_retained_highwater_is_rejected_without_automatic_repair(self):
        self.connect();self.broker.close()
        for value in (-1,'invalid'):
            with self.subTest(value=value):
                with closing(sqlite3.connect(self.broker.path)) as db:
                    db.execute('UPDATE broker_mode SET maximum_time=?',(value,));db.commit()
                before=self.broker.path.read_bytes()
                with self.assertRaisesRegex(ValueError,'clock marker'): self.make_broker()
                self.assertEqual(self.broker.path.read_bytes(),before)

    def test_intact_version1_migration_retains_highwater_and_all_history(self):
        self.now=2000;self.connect();self.reference();self.broker.close()
        with closing(sqlite3.connect(self.broker.path)) as db:
            db.execute('DROP TABLE connect_attempts')
            db.execute('UPDATE broker_mode SET schema_version=1');db.commit()
            before={name:db.execute('SELECT * FROM '+name).fetchall() for name in ('connections','control_receipts','operations')}
        self.broker=self.make_broker()
        with closing(sqlite3.connect(self.broker.path)) as db:
            self.assertEqual(db.execute('SELECT * FROM broker_mode').fetchall(),[(1,2,2000)])
            self.assertEqual(db.execute('SELECT COUNT(*) FROM connect_attempts').fetchone()[0],0)
            self.assertEqual(before,{name:db.execute('SELECT * FROM '+name).fetchall() for name in before})
        self.now=1000
        with self.assertRaisesRegex(AccessDenied,'backwards'):self.reference('new-on-old-clock')
        self.assertEqual(self.status()['state'],'prepared')

    def test_version2_missing_attempts_and_unknown_version_never_migrate(self):
        self.connect();self.broker.close()
        with closing(sqlite3.connect(self.broker.path)) as db:
            db.execute('UPDATE broker_mode SET schema_version=99');db.commit()
        before=self.broker.path.read_bytes()
        with self.assertRaises(ValueError):self.make_broker()
        self.assertEqual(self.broker.path.read_bytes(),before)
        with closing(sqlite3.connect(self.broker.path)) as db:
            db.execute('UPDATE broker_mode SET schema_version=2');db.execute('DROP TABLE connect_attempts');db.commit()
        before=self.broker.path.read_bytes()
        with self.assertRaisesRegex(ValueError,'schema and version'):self.make_broker()
        self.assertEqual(self.broker.path.read_bytes(),before)

    def test_missing_database_with_retained_lock_never_creates_new_history(self):
        self.connect();self.broker.close();self.broker.path.unlink()
        with self.assertRaisesRegex(ValueError,'history is missing'):self.make_broker()
        self.assertFalse(self.broker.path.exists())

    def test_deferred_input_rejects_changed_submit_and_recovers_half_reply_once(self):
        self.connect();text='selected fixture';preview=self.reference(text=text)
        self.assertIsNone(self.row()['input_text']);self.assertEqual(self.server.count(),0)
        with self.assertRaises(AccessDenied):
            self.broker.submit('intent-1',preview['consent'],text='different',auth='PUBLIC-ALICE')
        self.assertEqual(self.status()['state'],'prepared')
        receipt=self.broker.submit('intent-1',preview['consent'],text=text,auth='PUBLIC-ALICE')
        self.server.fault='drop_after_commit';self.broker.process_one()
        self.assertEqual(self.status()['state'],'unknown');self.assertIsNone(self.row()['input_text'])
        self.broker.disconnect('notes',key='disconnect',auth='PUBLIC-ALICE')
        self.broker.close();self.broker=self.make_broker()
        self.assertEqual(self.broker.submit('intent-1',preview['consent'],text=text,auth='PUBLIC-ALICE'),receipt)
        self.broker.reconcile('intent-1',auth='PUBLIC-ALICE');self.broker.process_one()
        self.assertEqual(self.status()['state'],'succeeded');self.assertEqual(self.server.count(),1)
        self.assertEqual([r['tool'] for r in self.server.wire if r['method']=='tools/call'],['text.upper','effect.status'])

    def test_nullable_result_does_not_hide_large_prepared_input_from_capacity(self):
        self.broker.close();self.broker=self.make_broker(max_bytes=2*MAX_BODY+10000)
        self.connect();self.broker.prepare('notes','text.upper','x'*65536,key='large',auth='PUBLIC-ALICE')
        row=self.row('large');self.assertIsNone(row['result'])
        with self.assertRaisesRegex(Unavailable,'storage capacity'):
            self.reference(key='another',text='small')
        self.assertEqual(len(self.broker.history(auth='PUBLIC-ALICE')),1)
        self.assertEqual(self.server.count(),0)

    def test_nullable_input_and_result_do_not_hide_deferred_plan_capacity(self):
        self.broker.close();self.broker=self.make_broker(max_bytes=2*MAX_BODY)
        self.connect();self.reference()
        row=self.row();self.assertIsNone(row['input_text']);self.assertIsNone(row['result'])
        with self.assertRaisesRegex(Unavailable,'storage capacity'):self.reference('another')
        self.assertEqual(len(self.broker.history(auth='PUBLIC-ALICE')),1)


if __name__ == '__main__': unittest.main()

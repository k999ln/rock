"""Actual Hub/Runner SQLite + signed packages; controlled remote transport faults.

Fake callback evidence never claims actual OS isolation; see os/runner evidence.
"""
from contextlib import closing, contextmanager
import copy
import importlib.util
import json
from pathlib import Path
import sqlite3
import sys
import tempfile
import threading
import time
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'os'))
from blackberryrock.hub import Hub
from blackberryrock.packages import PUBLIC_TEST_KEY, TEST_PUBLISHER, canonical
from blackberryrock.sdk import sign_development, starter
from runner.build_fixture import remote_fixture
from runner.client import RunnerClient
from runner.protocol import PUBLIC_ALICE_TOKEN, TransportError
from runner.store import RunnerStore

spec=importlib.util.spec_from_file_location('runner_control_os_test',ROOT/'os/platform/runner_control.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
RunnerControl=module.RunnerControl


class FakeExecutor:
    def __init__(self): self.calls=0
    def execute(self,text,recipe,cancel):
        self.calls+=1
        return text.strip(),{'kind':'fake_callback','physical_usb':'NOT_RUN'}


class Transport:
    target='cloud'
    evidence='pinned_tls_loopback_fixture'
    def __init__(self,store):
        self.store=store;self.ops=[];self.fail=False;self.drop=set()
        self.block=False;self.entered=threading.Event();self.release=threading.Event()
    def exchange(self,envelope):
        op=envelope['request']['op'];self.ops.append(op)
        if self.fail: raise TransportError('controlled connection outage')
        if self.block:
            self.entered.set()
            if not self.release.wait(3): raise TransportError('controlled transport timeout')
        response=self.store.dispatch(envelope,transport_target=self.target,transport_evidence=self.evidence)
        if op in self.drop:
            self.drop.remove(op);raise TransportError('controlled response loss')
        return response


class RegistryGuard:
    def __init__(self,hub): self.hub=hub;self.fail=False;self.subjects=set();self.entries=0
    @contextmanager
    def admission_guard(self):
        with self.hub.lock:
            self.entries+=1
            if self.fail: raise ValueError('signed revocation cache unavailable')
            for subject in self.subjects: self.hub.revoke(subject)
            yield


class RunnerControlTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name)
        self.trust={TEST_PUBLISHER:PUBLIC_TEST_KEY}
        self.hub=Hub(self.root/'hub.db',self.trust)
        self.pkg=remote_fixture();self.tool=self.pkg['manifest']['id']
        record=self.hub.install(self.pkg);self.hub.enable(self.tool,record['hash'])
        self.executor=FakeExecutor()
        self.remote=RunnerStore(self.root/'remote',endpoint_id='cloud-test',target='cloud',
                               transport_evidence='pinned_tls_loopback_fixture',owners={'alice':{'token':PUBLIC_ALICE_TOKEN,'publishers':[TEST_PUBLISHER]}},
                               publisher_trust=self.trust,executor=self.executor,start_worker=False)
        self.transport=Transport(self.remote)
        self.client=RunnerClient(self.transport,endpoint_id='cloud-test',owner='alice',token=PUBLIC_ALICE_TOKEN,attempts=1)
        self.guard=RegistryGuard(self.hub)
        self.control=self.new_control()

    def new_control(self,**kwargs):
        return RunnerControl(self.hub,self.root/'control',registry_control=self.guard,clients={'cloud':self.client},start=False,
                             retry_initial=0.01,retry_max=0.02,poll_seconds=0.05,**kwargs)

    def tearDown(self):
        self.transport.release.set();self.control.close();self.remote.close();self.temp.cleanup()

    def prepare(self,key='job',text='  text  ',target='cloud'):
        return self.control.dispatch({'v':1,'op':'remote.prepare','id':self.tool,'target':target,'text':text,'key':key})['result']

    def submit(self,key='job'):
        preview=self.prepare(key)
        return self.control.dispatch({'v':1,'op':'remote.submit','key':key,'consent':preview['consent']})['result']

    def step(self):
        with closing(self.control.connect()) as db,db: db.execute('UPDATE remote_jobs SET next_attempt=0')
        return self.control.process_one()

    def finish(self):
        self.step();self.remote.tick();self.step()

    def update(self):
        source=copy.deepcopy(self.pkg);source['manifest']['version']='1.1.0';source=sign_development(source)
        record=self.hub.install(source);self.hub.enable(self.tool,record['hash'])

    def test_prepare_is_not_consent_and_no_network_until_explicit_submit(self):
        preview=self.prepare()
        self.assertTrue(preview['prepared']);self.assertFalse(preview['approved'])
        self.assertEqual(self.transport.ops,[])
        self.assertFalse(self.control.process_one())
        with self.assertRaisesRegex(ValueError,'consent'):
            self.control.submit('job',{**preview['consent'],'approved':1})
        receipt=self.control.submit('job',preview['consent'])
        self.assertFalse(receipt['remote_accepted'])
        self.assertEqual(self.transport.ops,[])
        self.assertEqual(self.control.status('job')['state'],'queued')

    def test_actual_remote_state_separate_from_hub_jobs_and_input_erased(self):
        self.submit();self.finish()
        status=self.control.status('job')
        self.assertEqual(status['state'],'succeeded')
        self.assertEqual(status['remote']['output'],'text')
        self.assertEqual(status['remote']['execution']['kind'],'fake_callback')
        self.assertEqual(self.hub.state()['jobs'],[])
        with closing(self.control.connect()) as db:
            row=db.execute('SELECT package,input_text FROM remote_jobs').fetchone()
            self.assertEqual(tuple(row),(None,None))
        snapshot=self.control.snapshot()
        self.assertNotIn('output',snapshot['history'][0]['remote'])
        self.assertFalse(snapshot['actual_local_execution'])
        self.assertFalse(snapshot['destinations'][1]['available'])

    def test_same_prepare_and_submit_key_retains_receipts_after_restart(self):
        preview=self.prepare();receipt=self.submit();self.finish()
        self.control.close();self.control=self.new_control()
        self.assertEqual(self.prepare(),preview)
        self.assertEqual(self.control.submit('job',preview['consent']),receipt)
        self.assertFalse(self.step());self.assertEqual(self.executor.calls,1)
        with self.assertRaisesRegex(ValueError,'different'):
            self.prepare(text='different')
        with self.assertRaisesRegex(ValueError,'conflict'):
            self.control.submit('job',{**preview['consent'],'input_sha256':'0'*64})

    def test_unavailable_pc_does_not_fall_back_or_prepare(self):
        with self.assertRaisesRegex(ValueError,'unavailable'):
            self.prepare(target='pc_usb')
        self.assertEqual(self.control.snapshot()['history'],[])
        self.assertEqual(self.transport.ops,[])

    def test_disabled_unsigned_or_local_only_package_cannot_prepare(self):
        self.hub.lifecycle(self.tool,'disable')
        with self.assertRaisesRegex(ValueError,'enabled'):self.prepare()
        local=sign_development(starter(self.tool,version='2.0.0'))
        record=self.hub.install(local);self.hub.enable(self.tool,record['hash'])
        with self.assertRaisesRegex(ValueError,'remote target'):self.prepare()
        self.assertEqual(self.transport.ops,[])

    def test_update_after_preview_requires_new_preparation_and_consent(self):
        preview=self.prepare();self.update()
        with self.assertRaisesRegex(ValueError,'changed'):
            self.control.submit('job',preview['consent'])
        self.assertEqual(self.control.status('job')['state'],'prepared')
        self.assertEqual(self.transport.ops,[])

    def test_update_disable_and_revocation_before_claim_prevent_sending(self):
        self.submit();self.update();self.step()
        self.assertEqual(self.control.status('job')['state'],'rejected')
        self.assertEqual(self.transport.ops,[])
        self.submit('other');self.guard.subjects.add(TEST_PUBLISHER);self.step()
        self.assertEqual(self.control.status('other')['state'],'rejected')
        self.assertEqual(self.transport.ops,[])

    def test_registry_guard_failure_is_fail_closed(self):
        self.submit();self.guard.fail=True
        with self.assertRaisesRegex(ValueError,'cache'):self.step()
        self.assertEqual(self.transport.ops,[])
        self.assertFalse(self.control.status('job')['send_claimed'])

    def test_cancel_before_claim_prevents_send_and_is_idempotent(self):
        self.submit()
        receipt=self.control.cancel('job','cancel-one')
        self.assertTrue(receipt['before_send_claim'])
        self.assertEqual(self.control.cancel('job','cancel-one'),receipt)
        self.assertFalse(self.step());self.assertEqual(self.transport.ops,[])
        self.assertEqual(self.control.status('job')['state'],'cancelled')

    def test_cancel_prepared_and_cancel_key_conflict(self):
        self.prepare();self.prepare('other')
        self.control.cancel('job','cancel-key')
        with self.assertRaisesRegex(ValueError,'conflict'):
            self.control.cancel('other','cancel-key')
        with self.assertRaisesRegex(ValueError,'eligible'):
            self.submit()

    def test_network_wait_does_not_hold_hub_lock_or_block_status(self):
        self.submit();self.transport.block=True
        thread=threading.Thread(target=self.step);thread.start()
        self.assertTrue(self.transport.entered.wait(2))
        before=time.monotonic()
        with self.hub.lock: self.assertEqual(self.control.status('job')['state'],'sending')
        self.assertLess(time.monotonic()-before,0.5)
        self.transport.release.set();thread.join(2)
        self.assertFalse(thread.is_alive())

    def test_cancel_after_claim_preserves_uncertainty_until_status(self):
        self.submit();self.transport.block=True
        thread=threading.Thread(target=self.step);thread.start()
        self.assertTrue(self.transport.entered.wait(2))
        receipt=self.control.cancel('job','cancel-late')
        self.assertFalse(receipt['before_send_claim'])
        self.assertEqual(self.control.status('job')['state'],'sending')
        self.transport.release.set();thread.join(2)
        self.assertEqual(self.control.status('job')['state'],'cancelled')
        self.assertNotIn('submit',self.transport.ops)

    def test_update_after_claim_cancels_on_reconciliation_not_claimed_retraction(self):
        self.submit();self.transport.block=True
        thread=threading.Thread(target=self.step);thread.start()
        self.assertTrue(self.transport.entered.wait(2));self.update()
        self.transport.release.set();thread.join(2)
        self.assertIn('submit',self.transport.ops)
        self.assertEqual(self.control.status('job')['state'],'accepted')
        self.step()
        status=self.control.status('job')
        self.assertTrue(status['send_claimed']);self.assertTrue(status['cancel_requested'])
        self.assertEqual(status['state'],'cancelled');self.assertEqual(self.executor.calls,0)

    def test_acceptance_write_failure_rolls_back_without_network(self):
        preview=self.prepare()
        with closing(self.control.connect()) as db,db:
            db.execute("CREATE TRIGGER fault BEFORE UPDATE ON remote_jobs WHEN NEW.state='queued' BEGIN SELECT RAISE(ABORT,'acceptance I/O fault'); END")
        with self.assertRaises(sqlite3.Error):self.control.submit('job',preview['consent'])
        self.assertEqual(self.control.status('job')['state'],'prepared')
        self.assertEqual(self.transport.ops,[])
        with closing(self.control.connect()) as db,db:db.execute('DROP TRIGGER fault')
        self.assertTrue(self.control.submit('job',preview['consent'])['accepted'])

    def test_sending_claim_write_failure_prevents_network_and_retries_same_key(self):
        self.submit()
        with closing(self.control.connect()) as db,db:
            db.execute("CREATE TRIGGER fault BEFORE UPDATE ON remote_jobs WHEN NEW.send_claimed=1 BEGIN SELECT RAISE(ABORT,'claim I/O fault'); END")
        with self.assertRaises(sqlite3.Error):self.step()
        self.assertEqual(self.transport.ops,[])
        with closing(self.control.connect()) as db,db:db.execute('DROP TRIGGER fault')
        self.finish();self.assertEqual(self.executor.calls,1)

    def test_remote_response_loss_and_local_completion_fault_reconcile_once(self):
        self.submit();self.transport.drop.add('submit')
        with closing(self.control.connect()) as db,db:
            db.execute("CREATE TRIGGER fault BEFORE UPDATE OF remote_status ON remote_jobs BEGIN SELECT RAISE(ABORT,'completion I/O fault'); END")
        self.step();self.assertEqual(self.control.status('job')['state'],'unknown')
        with closing(self.control.connect()) as db,db:db.execute('DROP TRIGGER fault')
        self.remote.tick();self.step()
        self.assertEqual(self.control.status('job')['state'],'succeeded')
        self.assertEqual(self.executor.calls,1)
        self.assertEqual(self.transport.ops.count('submit'),1)

    def test_restart_after_unknown_remote_acceptance_is_status_first_same_key(self):
        self.submit();self.step()
        with closing(self.control.connect()) as db,db:
            db.execute("UPDATE remote_jobs SET state='sending'")
        self.control.close();self.control=self.new_control()
        self.assertEqual(self.control.status('job')['state'],'unknown')
        self.remote.tick();before=len(self.transport.ops);self.step()
        self.assertEqual(self.transport.ops[before:],['status'])
        self.assertEqual(self.executor.calls,1)

    def test_outage_has_bounded_backoff_and_no_new_key_or_other_mode(self):
        self.submit();self.transport.fail=True
        now=time.time()
        # Replace only this controller module's clock, not global time or the
        # remote transport. Slow SQLite reads must not consume the retry window.
        with patch.object(module,'time') as clock, \
                patch.object(self.transport,'exchange',wraps=self.transport.exchange) as exchange:
            clock.time.return_value=now
            for delay in (0.01,0.02,0.02):
                self.assertTrue(self.control.process_one())
                status=self.control.status('job')
                self.assertEqual(status['state'],'unknown')
                due=status['next_attempt']
                self.assertEqual(due,clock.time.return_value+delay)
                clock.time.return_value=due-0.001
                calls=exchange.call_count
                self.assertFalse(self.control.process_one())
                self.assertEqual(exchange.call_count,calls)
                self.assertEqual(self.control.status('job')['next_attempt'],due)
                clock.time.return_value=due
            self.transport.fail=False
            self.assertTrue(self.control.process_one())
            self.remote.tick()
            clock.time.return_value=self.control.status('job')['next_attempt']
            self.assertTrue(self.control.process_one())
            requests=[call.args[0]['request'] for call in exchange.call_args_list]
            self.assertTrue(all(request['key']=='job' and request['endpoint_id']=='cloud-test' for request in requests))
            submitted=[request for request in requests if request['op']=='submit']
            self.assertEqual(len(submitted),1)
            self.assertEqual(submitted[0]['consent']['target'],'cloud')
        self.assertEqual(self.control.status('job')['state'],'succeeded')
        self.assertEqual(self.executor.calls,1)
        self.assertEqual([(row['key'],row['target']) for row in self.control.snapshot()['history']],[('job','cloud')])
        self.assertEqual(self.hub.state()['jobs'],[])

    def test_limits_prepared_active_history_bytes_and_unknown_fields(self):
        with self.assertRaisesRegex(ValueError,'64 KiB'):self.prepare(text='é'*32769)
        self.control.max_prepared=1;self.prepare()
        with self.assertRaisesRegex(ValueError,'capacity'):self.prepare('two')
        self.submit();self.control.max_prepared=2;self.prepare('two');self.control.max_active=1
        with self.assertRaisesRegex(ValueError,'active'):self.submit('two')
        self.control.max_bytes=1
        with self.assertRaisesRegex(ValueError,'capacity'):self.prepare('three')
        with self.assertRaisesRegex(ValueError,'unknown'):
            self.control.dispatch({'v':1,'op':'remote.status','key':'job','peer_uid':0})

    def test_private_state_singleton_and_no_hub_schema_changes(self):
        with self.hub.connect() as db:
            tables={r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        self.assertFalse(any(name.startswith('remote_') for name in tables))
        self.assertEqual(self.control.directory.stat().st_mode&0o077,0)
        with self.assertRaises(BlockingIOError):self.new_control()

    def test_worker_db_fault_is_visible_and_recovers(self):
        self.submit();real=self.control.connect;count=[0]
        def flaky():
            count[0]+=1
            if count[0]<=2:raise sqlite3.OperationalError('temporary control database fault')
            return real()
        observed=False
        with patch.object(self.control,'connect',flaky):
            self.control.start();deadline=time.monotonic()+2
            while time.monotonic()<deadline:
                observed |= self.control.worker_error is not None
                if 'submit' in self.transport.ops:break
                time.sleep(0.005)
        self.assertTrue(observed);self.assertIn('submit',self.transport.ops)


    def test_registry_failure_after_claim_still_allows_cancel_cleanup(self):
        self.submit();self.step()
        self.guard.fail=True
        self.control.cancel('job','cleanup')
        self.step()
        status=self.control.status('job')
        self.assertEqual(status['state'],'cancelled')
        self.assertEqual(self.transport.ops.count('submit'),1)
        self.assertIn('cancel',self.transport.ops)

    def test_claim_commit_succeeds_then_io_error_reconciles_without_new_key(self):
        self.submit();ordinary=self.control.connect
        failed=[False]
        class CommitAfterFailure:
            def __init__(self,db):self.db=db;self.marked=False
            def __getattr__(self,name):return getattr(self.db,name)
            def __enter__(self):self.db.__enter__();return self
            def __exit__(self,*args):return self.db.__exit__(*args)
            def execute(self,sql,args=()):
                if 'send_claimed=1' in sql:self.marked=True
                return self.db.execute(sql,args)
            def commit(self):
                self.db.commit()
                if self.marked and not failed[0]:
                    failed[0]=True;raise sqlite3.OperationalError('fault after durable claim commit')
        with patch.object(self.control,'connect',lambda:CommitAfterFailure(ordinary())):
            with self.assertRaises(sqlite3.Error):self.step()
        self.assertTrue(self.control.status('job')['send_claimed'])
        self.assertEqual(self.transport.ops,[])
        self.finish();self.assertEqual(self.executor.calls,1)
        self.assertEqual(self.transport.ops.count('submit'),1)

    def test_acceptance_commit_succeeds_then_reply_path_error_repeats_same_receipt(self):
        preview=self.prepare();ordinary=self.control.connect;failed=[False]
        class AfterCommit:
            def __init__(self,db):self.db=db;self.marked=False
            def __getattr__(self,name):return getattr(self.db,name)
            def __enter__(self):self.db.__enter__();return self
            def execute(self,sql,args=()):
                if "state='queued'" in sql:self.marked=True
                return self.db.execute(sql,args)
            def __exit__(self,*args):
                result=self.db.__exit__(*args)
                if self.marked and args[0] is None and not failed[0]:
                    failed[0]=True;raise OSError('fault after durable acceptance commit')
                return result
        with patch.object(self.control,'connect',lambda:AfterCommit(ordinary())):
            with self.assertRaises(OSError):self.control.submit('job',preview['consent'])
        receipt=self.control.submit('job',preview['consent'])
        self.assertTrue(receipt['accepted']);self.assertEqual(self.transport.ops,[])
        self.finish();self.assertEqual(self.executor.calls,1)

    def test_dead_worker_restarts_on_read_and_recovers_claim(self):
        self.submit();original=self.control.process_one;calls=[0]
        def die_once():
            calls[0]+=1
            if calls[0]==1:raise SystemExit('test worker death')
            return original()
        with patch.object(self.control,'process_one',die_once):
            self.control.start();self.control.thread.join(2)
            self.assertFalse(self.control.thread.is_alive())
            self.control.snapshot()
            deadline=time.monotonic()+2
            while 'submit' not in self.transport.ops and time.monotonic()<deadline:time.sleep(0.01)
        self.assertIn('submit',self.transport.ops)
        self.assertEqual(self.transport.ops.count('submit'),1)



    def test_terminal_commit_then_io_error_preserves_result_and_erased_input(self):
        self.submit();self.step();self.remote.tick()
        ordinary=self.control.connect;failed=[False]
        class TerminalAfterCommit:
            def __init__(self,db):self.db=db;self.terminal=False
            def __getattr__(self,name):return getattr(self.db,name)
            def __enter__(self):self.db.__enter__();return self
            def execute(self,sql,args=()):
                if 'remote_status=?' in sql and args and args[0]=='succeeded':self.terminal=True
                return self.db.execute(sql,args)
            def __exit__(self,*args):
                result=self.db.__exit__(*args)
                if self.terminal and args[0] is None and not failed[0]:
                    failed[0]=True;raise OSError('fault after terminal result commit')
                return result
        with patch.object(self.control,'connect',lambda:TerminalAfterCommit(ordinary())):self.step()
        self.assertTrue(failed[0])
        self.assertEqual(self.control.status('job')['state'],'succeeded')
        with closing(self.control.connect()) as db:
            self.assertEqual(tuple(db.execute('SELECT package,input_text FROM remote_jobs').fetchone()),(None,None))
        self.assertFalse(self.step());self.assertEqual(self.executor.calls,1)
        self.assertEqual(self.transport.ops.count('submit'),1)

    def test_snapshot_counts_omitted_rows_and_bounds_whole_response(self):
        self.prepare()
        with closing(self.control.connect()) as db,db:
            columns=[r['name'] for r in db.execute('PRAGMA table_info(remote_jobs)')]
            row=dict(db.execute('SELECT * FROM remote_jobs').fetchone())
            for index in range(1,55):
                values={**row,'key':'row-'+str(index),'created':row['created']+index}
                sql='INSERT INTO remote_jobs('+','.join(columns)+') VALUES('+','.join('?' for _ in columns)+')'
                db.execute(sql,[values[key] for key in columns])
        broad=self.control.snapshot(byte_budget=192*1024)
        self.assertEqual(broad['total_history'],55)
        self.assertEqual(len(broad['history']),50)
        self.assertTrue(broad['history_truncated'])
        small=self.control.snapshot(byte_budget=2048)
        self.assertLess(len(small['history']),50)
        self.assertEqual(small['total_history'],55)
        self.assertTrue(small['history_truncated'])
        self.assertLessEqual(len(canonical(small)),2048)
        default=self.control.snapshot()
        self.assertLessEqual(len(canonical(default)),32768)



if __name__=='__main__':unittest.main()

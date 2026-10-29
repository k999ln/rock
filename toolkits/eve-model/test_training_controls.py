import json
import types
import hashlib
import threading
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import time
import unittest
from unittest.mock import patch
from manifest import finite_metric
import train
from train import supervise_owned
from train_worker import reuse_validation,train_with_explicit_loss
from completion_loss import LOSS_ID,assistant_only_loss,checked_batches
from budget import Budget

class TrainingControlTests(unittest.TestCase):
    def test_nonfinite_losses_are_rejected(self):
        for bad in [float('nan'),float('inf'),float('-inf')]:
            with self.assertRaisesRegex(ValueError,'nonfinite'):finite_metric(bad,'loss')
        self.assertEqual(finite_metric(1.5,'loss'),1.5)

    def test_sigterm_supervisor_reaps_its_owned_synthetic_child(self):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td);module=str(Path(__file__).parent.resolve());pidfile=root/'child.pid'
            child_code='import os,time,pathlib;pathlib.Path('+repr(str(pidfile))+').write_text(str(os.getpid()));time.sleep(60)'
            control='import sys,json,pathlib;sys.path.insert(0,'+repr(module)+');from train import supervise_owned;from manifest import atomic_json;r=supervise_owned([sys.executable,"-c",'+repr(child_code)+'],pathlib.Path('+repr(td)+'),60);atomic_json(pathlib.Path('+repr(str(root/'receipt.json'))+'),r)'
            parent=subprocess.Popen([sys.executable,'-c',control],stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
            try:
                for _ in range(200):
                    if pidfile.exists():break
                    if parent.poll() is not None: self.fail(parent.stderr.read().decode())
                    time.sleep(0.01)
                self.assertTrue(pidfile.exists());pid=int(pidfile.read_text())
                parent.send_signal(signal.SIGTERM);parent.wait(timeout=8)
                receipt=json.loads((root/'receipt.json').read_text())
                self.assertIn('InterruptedError',receipt['stopReason'])
                with self.assertRaises(ProcessLookupError):os.kill(pid,0)
            finally:
                if parent.poll() is None:
                    parent.terminate()
                    try:parent.wait(timeout=8)
                    except subprocess.TimeoutExpired:parent.kill();parent.wait(timeout=5)
                parent.stderr.close()

    def test_signal_during_poll_is_not_swallowed_and_handlers_are_restored(self):
        previous={sig:signal.getsignal(sig) for sig in (signal.SIGTERM,signal.SIGINT)}
        for selected in (signal.SIGTERM,signal.SIGINT):
            with self.subTest(signal=selected), tempfile.TemporaryDirectory() as td:
                original=os.waitpid
                delivered=False
                def during_poll(pid,flags):
                    nonlocal delivered
                    if flags == os.WNOHANG and not delivered:
                        delivered=True
                        os.kill(os.getpid(),selected)
                    return original(pid,flags)
                if hasattr(subprocess,'_del_safe'):
                    injector=patch.object(subprocess._del_safe,'waitpid',during_poll)
                else:
                    original_poll=subprocess.Popen._internal_poll
                    def poll(child,*args,**kwargs):
                        return original_poll(child,*args,_waitpid=during_poll,**kwargs)
                    injector=patch.object(subprocess.Popen,'_internal_poll',poll)
                with injector:
                    result=supervise_owned([sys.executable,'-c','import time;time.sleep(60)'],Path(td),60)
                self.assertTrue(delivered)
                self.assertIn('InterruptedError',result['stopReason'])
                self.assertLess(result['elapsedSeconds'],5)
                with self.assertRaises(ProcessLookupError): os.kill(result['ownedChildPid'],0)
                for sig,handler in previous.items(): self.assertIs(signal.getsignal(sig),handler)

    def test_signal_during_child_start_is_retained_and_child_reaped(self):
        original=subprocess.Popen
        delivered=False
        def start(*args,**kwargs):
            nonlocal delivered
            child=original(*args,**kwargs)
            if not delivered:
                delivered=True
                os.kill(os.getpid(),signal.SIGTERM)
            return child
        with tempfile.TemporaryDirectory() as td, patch.object(subprocess,'Popen',start):
            result=supervise_owned([sys.executable,'-c','import time;time.sleep(60)'],Path(td),60)
        self.assertTrue(delivered)
        self.assertIn('InterruptedError',result['stopReason'])
        with self.assertRaises(ProcessLookupError): os.kill(result['ownedChildPid'],0)

    def test_signal_during_cleanup_is_not_reported_as_success(self):
        original=train.stop_owned
        def stop(child,grace):
            os.kill(os.getpid(),signal.SIGTERM)
            return original(child,grace)
        previous=signal.getsignal(signal.SIGTERM)
        with tempfile.TemporaryDirectory() as td, patch.object(train,'stop_owned',stop):
            result=supervise_owned([sys.executable,'-c','pass'],Path(td),60)
        self.assertIn('InterruptedError',result['stopReason'])
        self.assertIs(signal.getsignal(signal.SIGTERM),previous)
        with self.assertRaises(ProcessLookupError): os.kill(result['ownedChildPid'],0)

    def test_before_reuse_requires_completed_metric_and_exact_binding(self):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td);(root/'session.json').write_text(json.dumps({'deadlineMonotonicSeconds':time.monotonic()+18000}));budget=Budget(root)
            key=budget.reserve_validation('probe','before',batches=4,max_sequence=768);budget.validation_progress(key,4,True)
            binding={'batches':4,'maxSequence':768,'base':'fixed','lossId':LOSS_ID,'lossSourceSha256':'fixed-loss','workerSourceSha256':'fixed-worker'}
            path=root/'validation-probe.json';row={'stage':'before','batches':4,'val_loss':1.25,'iteration':0}
            doc={'binding':binding,'validation':[row]};path.write_text(json.dumps(doc))
            self.assertEqual(reuse_validation(root,budget,'probe',binding)['val_loss'],1.25)
            for changed in [{**binding,'base':'changed'},{**binding,'lossSourceSha256':'old-inclusive-loss'},{**binding,'workerSourceSha256':'different-code'}]:
                with self.assertRaisesRegex(ValueError,'binding'):reuse_validation(root,budget,'probe',changed)
            for bad in [None,True,'1.25',float('nan')]:
                path.write_text(json.dumps({**doc,'validation':[{**row,'val_loss':bad}]}))
                with self.assertRaises(ValueError):reuse_validation(root,budget,'probe',binding)
            budget.db.close()

    def test_lower_trainer_wires_explicit_loss_and_no_implicit_validation(self):
        calls={};mx=types.ModuleType('mlx.core');mx.random=types.SimpleNamespace(seed=lambda value:calls.update(seed=value))
        optim=types.ModuleType('mlx.optimizers');optim.Adam=lambda **kw:('adam',kw)
        mlx=types.ModuleType('mlx');mlx.__path__=[];mlx.core=mx;mlx.optimizers=optim
        datasets=types.ModuleType('mlx_lm.tuner.datasets');datasets.CacheDataset=lambda values:list(values)
        trainer=types.ModuleType('mlx_lm.tuner.trainer');trainer.TrainingArgs=lambda **kw:types.SimpleNamespace(**kw)
        def train_call(**kw):calls.update(training=kw)
        trainer.train=train_call
        utils=types.ModuleType('mlx_lm.tuner.utils');utils.linear_to_lora_layers=lambda *a,**kw:calls.update(lora=(a,kw))
        lmutils=types.ModuleType('mlx_lm.utils');lmutils.save_config=lambda config,path:path.write_text(json.dumps(config))
        lm=types.ModuleType('mlx_lm');lm.__path__=[];tuner=types.ModuleType('mlx_lm.tuner');tuner.__path__=[]
        modules={'mlx':mlx,'mlx.core':mx,'mlx.optimizers':optim,'mlx_lm':lm,'mlx_lm.tuner':tuner,'mlx_lm.tuner.datasets':datasets,'mlx_lm.tuner.trainer':trainer,'mlx_lm.tuner.utils':utils,'mlx_lm.utils':lmutils}
        with tempfile.TemporaryDirectory() as td,patch.dict('sys.modules',modules):
            model=types.SimpleNamespace(layers=[object(),object()],freeze=lambda:calls.update(frozen=True))
            args=types.SimpleNamespace(fine_tune_type='lora',optimizer='adam',resume_adapter_file=None,lr_schedule=None,grad_accumulation_steps=1,num_layers=1,seed=42,lora_parameters={'rank':4,'scale':8},adapter_path=str(Path(td)/'candidate'),iters=8,max_seq_length=768,learning_rate=1e-4,optimizer_config={'adam':{}},completion_loss_id=LOSS_ID)
            callback=object();train_with_explicit_loss(args,model,[['synthetic']],callback)
            value=calls['training'];self.assertIs(value['loss'],assistant_only_loss);self.assertIs(value['iterate_batches'],checked_batches)
            self.assertEqual(value['val_dataset'],[]);self.assertIs(value['training_callback'],callback)
            self.assertEqual((value['args'].max_seq_length,value['args'].steps_per_save),(768,1));self.assertTrue(calls['frozen']);self.assertEqual(calls['seed'],42)
            self.assertEqual(json.loads((Path(td)/'candidate/adapter_config.json').read_text())['completion_loss_id'],LOSS_ID)

    def test_run_admission_is_saved_per_run_before_spawn_and_latest_stays_compatible(self):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td);budget=types.SimpleNamespace(check_time=lambda *_:None,session={'deadlineMonotonicSeconds':time.monotonic()+18000},snapshot=lambda:{'trainingWallSecondsCharged':0},charge_training_wall=lambda *_:None)
            probe={'admitted':True,'marker':'synthetic-probe'};final={'admitted':False,'marker':'synthetic-final'}
            observed=[]
            def supervisor(*_args,**_kwargs):
                observed.append(json.loads((root/'training-admission-eve-recovery-probe.json').read_text()))
                self.assertEqual(json.loads((root/'training-admission.json').read_text()),probe)
                return {'exitCode':0,'stopReason':None,'elapsedSeconds':0.01}
            with patch.object(train,'Budget',return_value=budget),patch.object(train,'require_decision'),patch.object(train,'admission',side_effect=[probe,final]),patch.object(train,'supervise_owned',side_effect=supervisor) as child:
                train.run(root,root/'unused-base',root/'unused-data',8,'matched-768-v1','eve-recovery-probe','probe-v1')
                with self.assertRaisesRegex(ValueError,'admission failed'):
                    train.run(root,root/'unused-base',root/'unused-data',16,'matched-768-v1','eve-recovery-final','candidate-v1','eve-recovery-probe')
                self.assertEqual(child.call_count,1)
            self.assertEqual(observed,[probe])
            self.assertEqual(json.loads((root/'training-admission-eve-recovery-probe.json').read_text()),probe)
            self.assertEqual(json.loads((root/'training-admission-eve-recovery-final.json').read_text()),final)
            self.assertEqual(json.loads((root/'training-admission.json').read_text()),final)

    def test_same_run_retry_preserves_original_before_query_and_child(self):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td);path=root/'training-admission-eve-recovery-probe.json';original=b'{"admitted":true,"marker":"original-start"}\n';path.write_bytes(original)
            latest=root/'training-admission.json';latest.write_bytes(b'{"marker":"existing-latest"}')
            before=hashlib.sha256(original).hexdigest();budget=types.SimpleNamespace(check_time=lambda *_:None)
            with patch.object(train,'Budget',return_value=budget),patch.object(train,'require_decision'),patch.object(train,'admission') as query,patch.object(train,'supervise_owned') as child:
                with self.assertRaises(FileExistsError):train.run(root,root/'unused-base',root/'unused-data',8,run_id='eve-recovery-probe')
                query.assert_not_called();child.assert_not_called()
            self.assertEqual(path.read_bytes(),original);self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(),before)
            self.assertEqual(latest.read_bytes(),b'{"marker":"existing-latest"}')

    def test_partial_evidence_write_failure_leaves_unstarted_nonreusable_attempt(self):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td);budget=types.SimpleNamespace(check_time=lambda *_:None);path=root/'training-admission-eve-recovery-probe.json'
            latest=root/'training-admission.json';latest.write_bytes(b'{"marker":"previous-run"}')
            def partial(_value,stream,**_kwargs):stream.write('partial-start');raise OSError('synthetic storage failure')
            with patch.object(train,'Budget',return_value=budget),patch.object(train,'require_decision'),patch.object(train,'admission',return_value={'admitted':True}),patch.object(train.json,'dump',side_effect=partial),patch.object(train,'atomic_json') as latest_write,patch.object(train,'supervise_owned') as child:
                with self.assertRaisesRegex(OSError,'storage failure'):train.run(root,root/'unused-base',root/'unused-data',8,run_id='eve-recovery-probe')
                latest_write.assert_not_called();child.assert_not_called()
            self.assertEqual(path.read_bytes(),b'partial-start');self.assertEqual(latest.read_bytes(),b'{"marker":"previous-run"}')
            with patch.object(train,'Budget',return_value=budget),patch.object(train,'require_decision'),patch.object(train,'admission') as query,patch.object(train,'supervise_owned') as child:
                with self.assertRaises(FileExistsError):train.run(root,root/'unused-base',root/'unused-data',8,run_id='eve-recovery-probe')
                query.assert_not_called();child.assert_not_called()
            self.assertEqual(path.read_bytes(),b'partial-start')

    def test_admission_fsync_failure_prevents_latest_publication_and_child(self):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td);budget=types.SimpleNamespace(check_time=lambda *_:None);path=root/'training-admission-eve-recovery-probe.json'
            with patch.object(train,'Budget',return_value=budget),patch.object(train,'require_decision'),patch.object(train,'admission',return_value={'admitted':True}),patch.object(train.os,'fsync',side_effect=OSError('synthetic fsync failure')),patch.object(train,'atomic_json') as latest,patch.object(train,'supervise_owned') as child:
                with self.assertRaisesRegex(OSError,'fsync failure'):train.run(root,root/'unused-base',root/'unused-data',8,run_id='eve-recovery-probe')
                latest.assert_not_called();child.assert_not_called()
            self.assertEqual(json.loads(path.read_text()),{'admitted':True});self.assertFalse((root/'training-admission.json').exists())

    def test_concurrent_same_id_only_exclusive_winner_queries_and_spawns(self):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td);path=root/'training-admission-eve-recovery-probe.json';barrier=threading.Barrier(2);lock=threading.Lock();outcomes=[];queries=[];spawns=[]
            budget=types.SimpleNamespace(check_time=lambda *_:None,session={'deadlineMonotonicSeconds':time.monotonic()+18000},snapshot=lambda:{'trainingWallSecondsCharged':0},charge_training_wall=lambda *_:None)
            original_open=Path.open
            def simultaneous_open(value,mode='r',*args,**kwargs):
                if value==path and mode=='x':barrier.wait(timeout=3)
                return original_open(value,mode,*args,**kwargs)
            def query(*_args):
                with lock:queries.append(threading.current_thread().name)
                return {'admitted':True,'marker':threading.current_thread().name}
            def supervisor(*_args,**_kwargs):
                data=path.read_bytes();self.assertTrue(data.endswith(b'\n'));value=json.loads(data)
                self.assertEqual(json.loads((root/'training-admission.json').read_text()),value)
                with lock:spawns.append(value)
                return {'exitCode':0,'stopReason':None,'elapsedSeconds':0.01}
            def attempt():
                try:
                    train.run(root,root/'unused-base',root/'unused-data',8,'matched-768-v1','eve-recovery-probe','probe-v1');result='success'
                except Exception as error:result=type(error).__name__
                with lock:outcomes.append(result)
            with patch.object(train,'Budget',return_value=budget),patch.object(train,'require_decision'),patch.object(train,'admission',side_effect=query),patch.object(train,'supervise_owned',side_effect=supervisor),patch.object(Path,'open',simultaneous_open):
                threads=[threading.Thread(target=attempt,name='attempt-'+str(i)) for i in range(2)]
                for thread in threads:thread.start()
                for thread in threads:thread.join(timeout=5)
                self.assertTrue(all(not thread.is_alive() for thread in threads))
            self.assertCountEqual(outcomes,['success','FileExistsError']);self.assertEqual(len(queries),1);self.assertEqual(len(spawns),1)
            self.assertEqual(json.loads(path.read_text()),spawns[0])

    def test_handlers_restored_when_log_cannot_be_created(self):
        previous={sig:signal.getsignal(sig) for sig in (signal.SIGTERM,signal.SIGINT)}
        with tempfile.TemporaryDirectory() as td:
            (Path(td)/'training.log').touch()
            with self.assertRaises(FileExistsError): supervise_owned([],Path(td),60)
        for sig,handler in previous.items(): self.assertIs(signal.getsignal(sig),handler)

if __name__=='__main__':unittest.main()

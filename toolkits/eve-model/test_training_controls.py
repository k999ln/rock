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
from train_worker import reuse_validation,train_with_explicit_loss,validate_recipe,semantic_update_decision,coverage_receipt,observed_semantic_batches
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
            custom=lambda *a,**kw:iter(())
            args.adapter_path=str(Path(td)/'candidate2')
            train_with_explicit_loss(args,model,[['synthetic']],callback,custom)
            self.assertIs(calls['training']['iterate_batches'],custom)

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


    def test_separate_semantic_recipe_preserves_recovery_and_rejects_incomplete_curriculum_updates(self):
        self.assertTrue(validate_recipe(8,'matched-768-v1','eve-semantic-probe','probe-v1',None))
        for n in [64,72]:self.assertFalse(validate_recipe(n,'matched-768-v1','eve-semantic-final','candidate-v1','eve-semantic-probe'))
        self.assertFalse(validate_recipe(48,'matched-768-v1','eve-recovery-final','candidate-v1','eve-recovery-probe'))
        for n,profile_name,reuse in [(48,'matched-768-v1','eve-semantic-probe'),(64,'standard','eve-semantic-probe'),(64,'matched-768-v1','eve-recovery-probe')]:
            with self.assertRaises(ValueError):validate_recipe(n,profile_name,'eve-semantic-final','candidate-v1',reuse)

    def test_semantic_resource_rule_uses_bound_completed_probe_and_no_quality(self):
        from profiles import profile
        from manifest import sha
        with tempfile.TemporaryDirectory() as td:
            root=Path(td);data=root/'data';data.mkdir();(data/'manifest.json').write_text('{}')
            sources={n:sha(Path(__file__).with_name(n)) for n in ['train.py','train_worker.py','completion_loss.py','budget.py','dataset.py','manifest.py','profiles.py','prepare_training.py','prepare_semantic.mjs','prepare_integration.mjs']}
            probe={'candidateId':'eve-semantic-probe','status':'resource_probe_not_quality_candidate','recipe':{'updates':8,'completionLossId':LOSS_ID},'trainingDataManifestSha256':sha(data/'manifest.json'),'memoryProfile':profile('matched-768-v1'),'trainingSourceHashes':sources}
            (root/'training-supervisor-eve-semantic-probe.json').write_text(json.dumps({'runId':'eve-semantic-probe','exitCode':0,'stopReason':None}))
            path=root/'candidate-manifest-eve-semantic-probe.json'
            def write(first,interval):
                value={**probe,'trainingHistory':[{'iteration':i+1,'elapsedSeconds':first+i*interval,'train_loss':999999} for i in range(8)]};path.write_text(json.dumps(value));return value
            write(3,1);self.assertEqual(semantic_update_decision(root,data)['selectedUpdates'],72)
            write(3,1.05);self.assertEqual(semantic_update_decision(root,data)['selectedUpdates'],64)
            write(10,1.1)
            with self.assertRaisesRegex(ValueError,'neither64nor72'):semantic_update_decision(root,data)
            bad=write(3,1);bad['trainingHistory'][2]['elapsedSeconds']=True;path.write_text(json.dumps(bad))
            with self.assertRaisesRegex(ValueError,'numeric'):semantic_update_decision(root,data)
            bad=write(3,1);bad['trainingSourceHashes']={**sources,'train_worker.py':'changed'};path.write_text(json.dumps(bad))
            with self.assertRaisesRegex(ValueError,'source changed'):semantic_update_decision(root,data)
            write(3,1);(data/'manifest.json').write_text('{"changed":true}')
            with self.assertRaisesRegex(ValueError,'binding'):semantic_update_decision(root,data)

    def test_semantic_completed_coverage_cannot_claim_epoch_from_duplicates_or_unreported_rows(self):
        rows=[{'id':str(i),'taskKind':str(i%10),'language':'ja' if i%2 else 'en','variant':'clean','stage':'first_step' if i<40 else 'after_success'} for i in range(60)]
        before=coverage_receipt(rows,[str(i) for i in range(59)]);self.assertFalse(before['firstEpochAllRowsSeen'])
        full=coverage_receipt(rows,[str(i) for i in range(60)]+['0']*4);self.assertTrue(full['firstEpochAllRowsSeen']);self.assertEqual(full['uniqueCompletedRows'],60)
        self.assertFalse(coverage_receipt(rows,['0']*60+[str(i) for i in range(60)])['firstEpochAllRowsSeen'])
        with self.assertRaises(ValueError):coverage_receipt(rows,['unknown'])
        with self.assertRaises(ValueError):coverage_receipt(rows[:-1],[])

    def test_observed_semantic_batches_match_exact_real_tokens_and_reject_unbound_or_empty_before_update(self):
        class Array:
            def __init__(self,data):self.data=data
            @property
            def shape(self):return (len(self.data),len(self.data[0]))
            def tolist(self):return self.data
        known={((7,8,9),2):'row'};observed=[]
        def source(*a,**kw):yield Array([[7,8,9,0,0]]),Array([[2,3]])
        self.assertEqual(len(list(observed_semantic_batches(known,observed,_iterator=source))),1);self.assertEqual(observed,['row'])
        with self.assertRaisesRegex(ValueError,'does not match'):list(observed_semantic_batches({},[],_iterator=source))
        def empty(*a,**kw):yield Array([[7,8,9,0,0]]),Array([[3,3]])
        rejected=[]
        with self.assertRaisesRegex(ValueError,'empty'):list(observed_semantic_batches(known,rejected,_iterator=empty))
        self.assertEqual(rejected,[])

    def test_supervisor_rejects_smaller_semantic_final_before_admission_or_child(self):
        with tempfile.TemporaryDirectory() as td,patch.object(train,'semantic_update_decision',return_value={'selectedUpdates':72}),patch.object(train,'Budget') as budget,patch.object(train,'admission') as admission,patch.object(train,'supervise_owned') as child:
            with self.assertRaisesRegex(ValueError,'preregistered'):train.run(Path(td),Path(td),Path(td),64,'matched-768-v1','eve-semantic-final','candidate-v1','eve-semantic-probe')
            budget.assert_not_called();admission.assert_not_called();child.assert_not_called()


    def startup_fixture(self,root):
        from manifest import sha
        run_id='eve-semantic-probe';data=root/'data';data.mkdir();(data/'manifest.json').write_text('{"bound":"synthetic"}')
        (root/'session.json').write_text(json.dumps({'deadlineMonotonicSeconds':time.monotonic()+18000}))
        budget=Budget(root);budget.db.close()
        def owned_budget(*args,**kwargs):
            value=Budget(*args,**kwargs);self.addCleanup(value.db.close);return value
        budget_patch=patch.object(train,'Budget',side_effect=owned_budget);budget_patch.start();self.addCleanup(budget_patch.stop)
        original=b'{"admitted":false,"marker":"original-denied-start"}\n';(root/('training-admission-'+run_id+'.json')).write_bytes(original)
        (root/'training-protocol.json').write_text('{"recipe":"fixed semantic probe8"}')
        review={'schema':'eve.training-startup-resumption-review/1','permitted':True,'runId':run_id,'trainingProtocolSha256':sha(root/'training-protocol.json')}
        (root/'TRAINING_STARTUP_RESUMPTION_REVIEW.json').write_text(json.dumps(review))
        decision={'schema':'eve.training-startup-resumption-decision/1','status':'adopted','onceOnly':True,'runId':run_id,'originalAdmissionSha256':sha(root/('training-admission-'+run_id+'.json')),'reviewSha256':sha(root/'TRAINING_STARTUP_RESUMPTION_REVIEW.json'),'dataManifestSha256':sha(data/'manifest.json'),'trainingProtocolSha256':sha(root/'training-protocol.json')}
        (root/'training-startup-resumption-decision.json').write_text(json.dumps(decision));return data,original

    def test_reviewed_startup_once_preserves_original_and_records_the_actual_admission_file(self):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td);data,original=self.startup_fixture(root);original_path=root/'training-admission-eve-semantic-probe.json';reviewed=root/'training-admission-eve-semantic-probe-reviewed1.json'
            def supervisor(*a,**kw):
                self.assertEqual(original_path.read_bytes(),original);self.assertTrue(reviewed.read_bytes().endswith(b'\n'))
                self.assertEqual(json.loads(reviewed.read_text())['startupResumption']['originalAdmissionSha256'],hashlib.sha256(original).hexdigest())
                return {'exitCode':0,'stopReason':None,'elapsedSeconds':0.01}
            with patch.object(train,'require_decision'),patch.object(train,'admission',return_value={'admitted':True}),patch.object(train,'supervise_owned',side_effect=supervisor) as child:
                receipt=train.run(root,root/'base',data,8,'matched-768-v1','eve-semantic-probe','probe-v1',None,True);self.assertEqual(child.call_count,1)
            self.assertEqual(receipt['startupAdmissionFile'],reviewed.name);self.assertEqual(receipt['startupResumption']['originalAdmissionSha256'],hashlib.sha256(original).hexdigest());before=reviewed.read_bytes()
            for resume in [True,False]:
                with patch.object(train,'require_decision'),patch.object(train,'admission') as query,patch.object(train,'supervise_owned') as child:
                    with self.assertRaises(FileExistsError):train.run(root,root/'base',data,8,'matched-768-v1','eve-semantic-probe','probe-v1',None,resume)
                    query.assert_not_called();child.assert_not_called()
            self.assertEqual(original_path.read_bytes(),original);self.assertEqual(reviewed.read_bytes(),before)

    def test_reviewed_startup_is_probe_only_and_requires_strict_original_false(self):
        for recipe in [('eve-semantic-final',64,'matched-768-v1','candidate-v1','eve-semantic-probe'),('eve-recovery-probe',8,'matched-768-v1','probe-v1',None),('eve-semantic-probe',8,'standard','probe-v1',None)]:
            with patch.object(train,'Budget') as budget,patch.object(train,'admission') as query,patch.object(train,'supervise_owned') as child:
                with self.assertRaisesRegex(ValueError,'probe-only'):train.run(Path('/unused'),Path('/unused'),Path('/unused'),recipe[1],recipe[2],recipe[0],recipe[3],recipe[4],True)
                budget.assert_not_called();query.assert_not_called();child.assert_not_called()
        for value in [True,0,None,'false']:
            with tempfile.TemporaryDirectory() as td:
                root=Path(td);data,_=self.startup_fixture(root);(root/'training-admission-eve-semantic-probe.json').write_text(json.dumps({'admitted':value}))
                with patch.object(train,'require_decision'),patch.object(train,'admission') as query,patch.object(train,'supervise_owned') as child:
                    with self.assertRaisesRegex(ValueError,'must be false'):train.run(root,root/'base',data,8,'matched-768-v1','eve-semantic-probe','probe-v1',None,True)
                    query.assert_not_called();child.assert_not_called()
                self.assertFalse((root/'training-admission-eve-semantic-probe-reviewed1.json').exists())

    def test_reviewed_startup_rejects_any_record_or_reserved_training_row_even_zero_updates(self):
        cases=['training-supervisor-eve-semantic-probe.json','training-progress-eve-semantic-probe.json','candidate-manifest-eve-semantic-probe.json','training-eve-semantic-probe.log','probe-v1','training-row','allocation-row','validation-row']
        for case in cases:
            with self.subTest(case=case),tempfile.TemporaryDirectory() as td:
                root=Path(td);data,original=self.startup_fixture(root)
                if case.endswith('-row'):
                    budget=Budget(root)
                    if case=='training-row':budget.db.execute('INSERT INTO training(id,reserved_updates,completed_updates,started,state) VALUES (?,8,0,0,"planned")',('eve-semantic-probe',))
                    elif case=='allocation-row':budget.db.execute('INSERT INTO training_allocations VALUES (?,768)',('eve-semantic-probe',))
                    else:budget.db.execute('INSERT INTO validation(id,run_id,stage,reserved_batches,completed_batches,max_sequence) VALUES ("before",?,"before",4,0,768)',('eve-semantic-probe',))
                    budget.db.commit();budget.db.close()
                elif case=='probe-v1':(root/case).mkdir()
                else:(root/case).write_text('{}')
                with patch.object(train,'require_decision'),patch.object(train,'admission') as query,patch.object(train,'supervise_owned') as child:
                    with self.assertRaisesRegex(ValueError,'already has'):train.run(root,root/'base',data,8,'matched-768-v1','eve-semantic-probe','probe-v1',None,True)
                    query.assert_not_called();child.assert_not_called()
                self.assertEqual((root/'training-admission-eve-semantic-probe.json').read_bytes(),original)

    def test_reviewed_startup_requires_adopted_hash_bound_review_protocol_and_data(self):
        for changed in ['review','protocol','data','decision']:
            with self.subTest(changed=changed),tempfile.TemporaryDirectory() as td:
                root=Path(td);data,_=self.startup_fixture(root)
                if changed=='review':
                    path=root/'TRAINING_STARTUP_RESUMPTION_REVIEW.json';value=json.loads(path.read_text());value['permitted']=False;path.write_text(json.dumps(value))
                elif changed=='protocol':(root/'training-protocol.json').write_text('{"changed":true}')
                elif changed=='data':(data/'manifest.json').write_text('{"changed":true}')
                else:
                    path=root/'training-startup-resumption-decision.json';value=json.loads(path.read_text());value['onceOnly']=False;path.write_text(json.dumps(value))
                with patch.object(train,'require_decision'),patch.object(train,'admission') as query,patch.object(train,'supervise_owned') as child:
                    with self.assertRaises(ValueError):train.run(root,root/'base',data,8,'matched-768-v1','eve-semantic-probe','probe-v1',None,True)
                    query.assert_not_called();child.assert_not_called()

    def test_reviewed_startup_fresh_denial_consumes_the_only_slot_without_starting_child(self):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td);data,original=self.startup_fixture(root);path=root/'training-admission-eve-semantic-probe-reviewed1.json'
            with patch.object(train,'require_decision'),patch.object(train,'admission',return_value={'admitted':False,'marker':'fresh-denied'}),patch.object(train,'supervise_owned') as child:
                with self.assertRaisesRegex(ValueError,'admission failed'):train.run(root,root/'base',data,8,'matched-768-v1','eve-semantic-probe','probe-v1',None,True)
                child.assert_not_called()
            snapshot=path.read_bytes();self.assertFalse(json.loads(snapshot)['admitted']);self.assertEqual(json.loads(snapshot)['startupResumption']['startupAdmissionFile'],path.name)
            with patch.object(train,'require_decision'),patch.object(train,'admission') as query,patch.object(train,'supervise_owned') as child:
                with self.assertRaises(FileExistsError):train.run(root,root/'base',data,8,'matched-768-v1','eve-semantic-probe','probe-v1',None,True)
                query.assert_not_called();child.assert_not_called()
            self.assertEqual(path.read_bytes(),snapshot);self.assertEqual((root/'training-admission-eve-semantic-probe.json').read_bytes(),original)

    def test_reviewed_startup_fsync_failure_is_unstarted_and_cannot_reuse_slot(self):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td);data,original=self.startup_fixture(root);path=root/'training-admission-eve-semantic-probe-reviewed1.json'
            with patch.object(train,'require_decision'),patch.object(train,'admission',return_value={'admitted':True}),patch.object(train.os,'fsync',side_effect=OSError('synthetic fsync failure')),patch.object(train,'supervise_owned') as child:
                with self.assertRaisesRegex(OSError,'fsync failure'):train.run(root,root/'base',data,8,'matched-768-v1','eve-semantic-probe','probe-v1',None,True)
                child.assert_not_called()
            self.assertTrue(path.exists());self.assertEqual((root/'training-admission-eve-semantic-probe.json').read_bytes(),original)
            with patch.object(train,'require_decision'),patch.object(train,'admission') as query,patch.object(train,'supervise_owned') as child:
                with self.assertRaises(FileExistsError):train.run(root,root/'base',data,8,'matched-768-v1','eve-semantic-probe','probe-v1',None,True)
                query.assert_not_called();child.assert_not_called()

class SemanticPlainRendererTests(unittest.TestCase):
    def test_exact_plain_text_and_prefix_preserve_metacharacters_unicode_and_empty_content(self):
        from prepare_training import render_semantic_chat
        for text in ['<script>&"\' 日本語 😀\nline','']:
            prefix=[{'role':'system','content':text},{'role':'user','content':text}]
            expected='<|im_start|>system\n'+text+'<|im_end|>\n<|im_start|>user\n'+text+'<|im_end|>\n'
            self.assertEqual(render_semantic_chat(prefix,add_generation_prompt=True),expected+'<|im_start|>assistant\n')
            self.assertEqual(render_semantic_chat(prefix+[{'role':'assistant','content':text}]),expected+'<|im_start|>assistant\n'+text+'<|im_end|>\n')

    def test_unsupported_messages_and_options_are_rejected(self):
        from prepare_training import render_semantic_chat,semantic_tokenizer
        full=[{'role':'system','content':'s'},{'role':'user','content':'u'},{'role':'assistant','content':'a'}]
        for messages,options in [(full,{'tools':[]}),(full,{'tools':{}}),(full,{'return_dict':True}),(full,{'add_generation_prompt':1}),(full,{'add_generation_prompt':True}),(full[:2],{}),([],{}),([*full[:2],{'role':'tool','content':'a'}],{}),([*full[:2],{'role':'assistant','content':None}],{}),([*full[:2],{'role':'assistant','content':'a','tool_calls':[]}],{})]:
            with self.subTest(messages=messages,options=options),self.assertRaises(ValueError):render_semantic_chat(messages,**options)
        # The template identity gate precedes backend loading, without tokenizers dependency.
        with tempfile.TemporaryDirectory() as td:
            root=Path(td);(root/'tokenizer_config.json').write_text(json.dumps({'chat_template':'unsupported'}))
            with patch.dict(sys.modules,{'tokenizers':types.SimpleNamespace(Tokenizer=types.SimpleNamespace(from_file=lambda _:self.fail('unsupported template reached backend'))) }):
                with self.assertRaisesRegex(ValueError,'unsupported semantic chat template'):semantic_tokenizer(root)

if __name__=='__main__':unittest.main()

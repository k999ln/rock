import json
import hashlib
from pathlib import Path
import tempfile
import time
import unittest
from budget import Budget, BudgetError


class BudgetTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.root = Path(self.tmp.name)
        (self.root/'session.json').write_text(json.dumps({'deadlineMonotonicSeconds':time.monotonic()+18000}))
        self.b = Budget(self.root)
    def tearDown(self): self.b.db.close(); self.tmp.cleanup()
    def test_replay_and_payload_conflict(self):
        self.assertIsNone(self.b.reserve_call('a', {'text':'x'}, 'pixel', 256))
        with self.assertRaisesRegex(BudgetError,'pending'): self.b.reserve_call('a', {'text':'x'}, 'pixel',256)
        self.b.finish_call('a', {'text':'saved'},3)
        self.assertEqual(self.b.reserve_call('a', {'text':'x'}, 'pixel',256), {'text':'saved'})
        with self.assertRaisesRegex(BudgetError,'conflict'): self.b.reserve_call('a', {'text':'changed'},'pixel',256)
        self.assertEqual(self.b.snapshot()['calls'][0]['attempts'],1)
    def test_unknown_is_charged_and_not_replayed(self):
        self.b.reserve_call('a', {}, 'pixel',256)
        self.b.finish_call('a', {'error':'lost'},None,'unknown')
        with self.assertRaises(BudgetError): self.b.reserve_call('a', {}, 'pixel',256)
        self.assertEqual(self.b.snapshot()['calls'][0]['unknownOutputs'],1)
    def test_quota_includes_failed_attempts_and_persists(self):
        for i in range(30):
            self.b.reserve_call(str(i), {}, 'pixel',1)
            self.b.finish_call(str(i), {'error':'failed'},None,'failed')
        second=Budget(self.root)
        with self.assertRaisesRegex(BudgetError,'exhausted'): second.reserve_call('31',{},'pixel',1)
        second.db.close()
    def test_output_cap_and_deadline(self):
        with self.assertRaises(BudgetError): self.b.reserve_call('a',{},'pixel',257)
        self.b.session['deadlineMonotonicSeconds']=time.monotonic()+901
        with self.assertRaisesRegex(BudgetError,'safe-stop'): self.b.reserve_call('b',{},'pixel',1)
    def test_training_total_and_pending_reservations(self):
        self.b.reserve_training('first',64)
        with self.assertRaisesRegex(BudgetError,'pending'): self.b.reserve_training('second',64)
        self.b.training_progress('first',64,20,True)
        self.b.reserve_training('second',64)
        self.b.training_progress('second',64,20,True)
        with self.assertRaisesRegex(BudgetError,'exhausted'): self.b.reserve_training('third',1)
    def test_total_training_time_is_not_refilled_per_run(self):
        self.b.reserve_training('first',64);self.b.training_progress('first',64,1790,True)
        self.b.reserve_training('second',64)
        with self.assertRaisesRegex(BudgetError,'total training'): self.b.training_progress('second',1,11)
    def test_validation_reserves_both_passes_and_unknown_is_not_free(self):
        key=self.b.reserve_validation('r','before');self.b.validation_progress(key,8,True)
        self.b.reserve_validation('r','after')
        with self.assertRaisesRegex(BudgetError,'exhausted'): self.b.reserve_validation('r2','before')
        self.assertEqual(sum(x['reservedBatches'] for x in self.b.snapshot()['teacherForcedValidation']),16)

    def interruption_proof(self,**changes):
        evidence={}
        for key,value in {'supervisor':{'exitCode':-15,'stopReason':'pressure warning','elapsedSeconds':18.31},'adapterConfig':{'steps_per_report':1,'grad_accumulation_steps':1},'sourceManifest':{'files':{'worker':'bound synthetic source'}}}.items():
            raw=json.dumps(value).encode();p=self.root/(key+'.json');p.write_bytes(raw)
            evidence[key]={'path':p.name,'sha256':hashlib.sha256(raw).hexdigest()}
        identity={'singleOwnedGpuWorker':True,'ownedChildWaitExitCode':-15,'sourceSnapshot':{'sha256':evidence['sourceManifest']['sha256']},'runtime':{'mlx_lm':'0.32.2'}}
        raw=json.dumps(identity).encode();p=self.root/'executionIdentity.json';p.write_bytes(raw);evidence['executionIdentity']={'path':p.name,'sha256':hashlib.sha256(raw).hexdigest()}
        receipt={'schema':'eve.training-interruption-reconciliation/1','proofKind':'synchronous_per_update_callback/1','reviewOutcome':'PASS_SCOPED','reviewer':'independent synthetic fixture reviewer','runId':'r1','originalReservedUpdates':128,'confirmedUpdates':8,'maximumUpdates':9,'wallSeconds':18.31,'nextRun':{'id':'r2','updates':8},**evidence,**changes}
        p=self.root/'reconciliation.json';p.write_text(json.dumps(receipt));return p

    def test_proved_upper_bound_preserves_history_and_atomically_reserves_next_run(self):
        self.b.reserve_training('r1',128);self.b.training_progress('r1',8,12.9)
        p=self.interruption_proof();self.b.reconcile_training(p);self.b.reconcile_training(p)
        snap=self.b.snapshot();self.assertEqual(snap['optimizerUpdatesUpperBoundCharged'],17)
        self.assertEqual(snap['training'][0]['reservedUpdates'],128);self.assertEqual(snap['training'][0]['completedUpdates'],8)
        self.assertEqual(snap['training'][0]['state'],'stopped_unknown');self.assertEqual(snap['training'][1]['state'],'planned')
        self.b.reserve_training('r2',8);self.b.training_progress('r2',8,10,True);self.b.charge_training_wall('r2',12)
        self.assertAlmostEqual(self.b.snapshot()['trainingWallSecondsCharged'],30.31)
        self.b.reserve_training('r3',111)
        with self.assertRaises(BudgetError):self.b.reserve_training('r4',1)

    def test_invalid_reconciliation_cannot_release_reservation(self):
        self.b.reserve_training('r1',128);self.b.training_progress('r1',8,12.9)
        for changes in [{'maximumUpdates':8},{'confirmedUpdates':7},{'wallSeconds':12.9},{'nextRun':{'id':'r2','updates':9}},{'reviewOutcome':'pending'}]:
            with self.assertRaises(BudgetError):self.b.reconcile_training(self.interruption_proof(**changes))
            self.assertEqual(self.b.snapshot()['optimizerUpdatesUpperBoundCharged'],128)
            self.assertEqual(self.b.snapshot()['training'][0]['state'],'running')

if __name__=='__main__': unittest.main()

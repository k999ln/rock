"""Real SQLite and real existing public Ed25519 fixture signatures; no flashing."""
from concurrent.futures import ThreadPoolExecutor
import copy
import hashlib
from pathlib import Path
import sqlite3
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT/'os'),str(ROOT/'os/update'),str(ROOT/'src')]
from make_bundle import sign_development
from operations.state import OperationError
from operations.store import OperationsStore

AUTHORITY = '11111111-1111-4111-8111-111111111111'


def signed(sequence, value):
    return sign_development({'schema':'rock-os-rootfs-v2','architecture':'aarch64',
        'layout':'rock-virt-ab1','data_abi':'rock-data-v1','sequence':sequence,
        'version':'fixture-'+str(sequence),'size':4096,'sha256':value*64})


class OperationsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.base, cls.release = signed(1,'a'), signed(2,'b')

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name)/'operations'; self.now = 100; self.revoked = set()
        self.store = self.open()

    def authorize(self, context, op, resource):
        if context in self.revoked: raise PermissionError('fixture principal suspended')
        allowed = {'writer':{'plan.create','plan.approve'},
                   'approver':{'plan.approve','plan.resume'},
                   'operator':{'plan.start','plan.promote','plan.hold','plan.recovery'},
                   'auditor':{'diagnostics','plan.read'},
                   'device-a':{'device.claim','device.report'}, 'device-b':{'device.claim','device.report'}}
        if context not in allowed or op not in allowed[context]: raise PermissionError('fixture role denied')
        if context.startswith('device-') and context != resource.get('device_ref'): raise PermissionError('device tenant mismatch')
        return context

    def open(self, **kwargs):
        return OperationsStore(self.path,authority_id=AUTHORITY,policy_id='fixture-policy-1',
                               authorize=self.authorize,clock=lambda:self.now,**kwargs)

    def create(self, **changes):
        request = {'op':'plan.create','key':'create','plan_id':'release2','release':self.release,
                   'hardware_id':'rock-virt-aarch64','expires_at':1000,'canary':['device-a'],
                   'targets':[{'device_ref':d,'current_release':self.base,
                               'protected_binding_sha256':'c'*64,'history_sha256':'d'*64} for d in ('device-a','device-b')]}
        request.update(changes)
        return self.store.dispatch(request,context='writer')['result']

    def operation(self,op,key,context='operator',**fields):
        return self.store.dispatch({'op':op,'key':key,'plan_id':'release2',**fields},context=context)['result']

    def started(self):
        plan = self.create()
        self.operation('plan.approve','approve','approver',expected_revision=0,plan_sha256=plan['plan_sha256'])
        self.operation('plan.start','start',expected_revision=1)
        return plan

    def claim(self,device='device-a',key='claim'):
        return self.operation('device.claim',key,device,device_ref=device)

    def report(self,device='device-a',state='HEALTHY',key='report',**changes):
        outcome = {'state':state,'image_sha256':('a' if state=='ROLLED_BACK' else 'b')*64,
                   'protected_binding_sha256':'c'*64,'history_sha256':'d'*64,'proof_sha256':'e'*64}
        outcome.update(changes)
        return self.operation('device.report',key,device,device_ref=device,outcome=outcome)

    def view(self): return self.store.snapshot('release2','auditor')

    def test_canary_requires_distinct_approval_and_success_before_rest(self):
        plan = self.create()
        with self.assertRaises(OperationError): self.operation('plan.start','early',expected_revision=0)
        with self.assertRaises(OperationError): self.operation('plan.approve','self','writer',expected_revision=0,plan_sha256=plan['plan_sha256'])
        self.operation('plan.approve','approve','approver',expected_revision=0,plan_sha256=plan['plan_sha256'])
        self.operation('plan.start','start',expected_revision=1)
        with self.assertRaises(OperationError): self.claim('device-b','too-early')
        with self.assertRaises(OperationError): self.operation('plan.promote','no-report',expected_revision=2)
        self.claim(); self.report()
        self.operation('plan.promote','promote',expected_revision=2)
        self.claim('device-b','claim-b'); self.report('device-b',key='report-b')
        self.assertEqual(self.view()['state'],'COMPLETE')
        self.assertFalse(self.view()['execution_authorized'])

    def test_signature_floor_and_hardware_rejections_do_not_create_plan(self):
        broken = copy.deepcopy(self.release); broken['signature']='0'*128
        for change in ({'release':broken},{'release':self.base},{'hardware_id':'unverified-phone'},
                       {'canary':['not-a-target']},{'expires_at':True}):
            with self.subTest(change=tuple(change)), self.assertRaises((OperationError,RuntimeError)):
                self.create(**change)
        self.assertEqual(self.store.diagnostics('auditor')['objects'],0)

    def test_missing_adapter_unknown_role_and_json_role_cannot_authorize(self):
        self.started()
        with self.assertRaises(PermissionError): self.store.snapshot('release2','nobody')
        with self.assertRaises(PermissionError): self.operation('plan.hold','bad','auditor',expected_revision=2,reason='test')
        with self.assertRaises(OperationError): self.store.dispatch({'op':'plan.hold','key':'inject','plan_id':'release2','expected_revision':2,'reason':'test','role':'operator'},context='operator')
        denied = OperationsStore(Path(self.temp.name)/'deny',authority_id=AUTHORITY,policy_id='fixture')
        with self.assertRaises(PermissionError): denied.diagnostics()

    def test_lost_claim_ack_restart_new_key_never_creates_second_assignment(self):
        self.started(); first=self.claim()
        self.store=self.open()
        self.assertEqual(first,self.claim())
        self.assertEqual(first,self.claim(key='different-key'))
        self.assertEqual(len(self.view()['outcomes']),1)
        self.assertEqual(self.view()['outcomes'][0]['state'],'UNKNOWN')

    def test_hold_and_expiry_keep_unknown_reconciliation_without_fabricating_recovery(self):
        self.started(); self.claim()
        self.operation('plan.hold','hold',expected_revision=2,reason='investigate')
        with self.assertRaises(OperationError): self.claim('device-b','held')
        self.now=2000; self.store=self.open()
        self.operation('plan.recovery','recover',expected_revision=3,reason='restore previous trial slot')
        self.report(state='ROLLED_BACK')
        self.assertEqual(self.view()['state'],'RECOVERY_REQUESTED')
        self.assertEqual(self.view()['outcomes'][0]['state'],'ROLLED_BACK')
        self.assertFalse(self.view()['execution_authorized'])

    def test_negative_canary_cannot_be_cleared_by_resume(self):
        plan=self.started(); self.claim(); self.report(state='FAILED')
        self.assertEqual(self.view()['state'],'HELD')
        with self.assertRaises(OperationError): self.operation('plan.resume','resume','approver',expected_revision=3,plan_sha256=plan['plan_sha256'])

    def test_manual_hold_needs_distinct_hash_bound_resume(self):
        plan=self.started(); self.operation('plan.hold','hold',expected_revision=2,reason='pause distribution')
        with self.assertRaises(OperationError): self.operation('plan.resume','bad','approver',expected_revision=3,plan_sha256='f'*64)
        self.operation('plan.resume','resume','approver',expected_revision=3,plan_sha256=plan['plan_sha256'])
        self.assertEqual(self.view()['state'],'CANARY')

    def test_terminal_report_and_receipt_cannot_be_rewritten(self):
        self.started(); self.claim(); original=self.report()
        self.assertEqual(original,self.report())
        with self.assertRaises(OperationError): self.report(key='changed-report',proof_sha256='f'*64)
        with self.assertRaises(OperationError): self.report(state='ROLLED_BACK')
        self.assertEqual(self.view()['outcomes'][0]['reported'],original['reported'])

    def test_wrong_device_or_bad_binding_cannot_report_success(self):
        self.started(); self.claim()
        with self.assertRaises(PermissionError): self.operation('device.report','wrong-owner','device-b',device_ref='device-a',outcome={})
        for field in ('image_sha256','protected_binding_sha256','history_sha256'):
            with self.subTest(field=field), self.assertRaises(OperationError): self.report(**{field:'f'*64})
        self.assertEqual(self.view()['outcomes'][0]['state'],'UNKNOWN')

    def test_revoked_principal_cannot_replay_completed_receipt(self):
        self.started(); self.claim(); self.revoked.add('device-a')
        with self.assertRaises(PermissionError): self.claim()
        self.assertEqual(self.view()['outcomes'][0]['state'],'UNKNOWN')

    def test_stale_revision_and_parallel_start_allow_one_transition(self):
        p=self.create(); self.operation('plan.approve','approve','approver',expected_revision=0,plan_sha256=p['plan_sha256'])
        def start(n):
            try:return self.operation('plan.start','start-'+str(n),expected_revision=1)['state']
            except OperationError:return 'denied'
        with ThreadPoolExecutor(max_workers=2) as pool: results=list(pool.map(start,[1,2]))
        self.assertEqual(sorted(results),['CANARY','denied'])
        self.assertEqual(self.view()['revision'],2)

    def test_clock_rollback_blocks_new_distribution_but_allows_containment(self):
        self.started(); self.now=99
        with self.assertRaises(OperationError): self.claim()
        self.operation('plan.hold','hold',expected_revision=2,reason='clock investigation')
        self.assertTrue(self.store.diagnostics('auditor')['clock_rollback'])

    def test_database_failure_rolls_back_plan_receipt_and_audit_together(self):
        with self.store.db.connection() as db,db:
            db.execute("CREATE TRIGGER fail_receipt BEFORE INSERT ON receipts BEGIN SELECT RAISE(ABORT,'fixture full'); END")
        with self.assertRaises(sqlite3.IntegrityError): self.create()
        self.assertEqual(self.store.diagnostics('auditor')['objects'],0)
        with self.store.db.connection() as db,db: db.execute('DROP TRIGGER fail_receipt')
        self.create(); self.assertEqual(self.store.diagnostics('auditor')['audit_events'],1)

    def test_private_state_binding_and_deleted_database_fail_closed(self):
        self.create()
        with self.assertRaises(OperationError): OperationsStore(self.path,authority_id=AUTHORITY,policy_id='other-policy')
        self.store.db.path.unlink()
        with self.assertRaises(OperationError): self.open()

    def test_capacity_and_readonly_diagnostics_preserve_current_plan(self):
        self.store=self.open(capacity=1); self.create()
        before=hashlib.sha256(self.store.db.path.read_bytes()).hexdigest()
        self.assertEqual(self.store.diagnostics('auditor')['receipts'],1)
        self.assertEqual(before,hashlib.sha256(self.store.db.path.read_bytes()).hexdigest())
        with self.assertRaises(OperationError): self.operation('plan.approve','approve','approver',expected_revision=0,plan_sha256=self.view()['plan_sha256'])
        self.assertEqual(self.view()['state'],'DRAFT')


if __name__=='__main__': unittest.main()

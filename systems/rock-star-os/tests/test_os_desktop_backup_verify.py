"""Logical retention guards only; these fixtures are not actual restored boots."""
import copy
import ast
from contextlib import closing
import importlib.util
import json
from pathlib import Path
import shutil
import sqlite3
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]/'os/desktop'
sys.path.insert(0,str(ROOT))
spec=importlib.util.spec_from_file_location('rock_actual_backup_verify',ROOT/'verify-backup.py')
verify=importlib.util.module_from_spec(spec);spec.loader.exec_module(verify)


def power_row(key,boot,created=1):
    return {'key':key,'operation':'poweroff','boot_id':boot,'instance':'unit-instance',
            'request_json':json.dumps({'v':1,'op':'poweroff','key':key}),
            'receipt_json':json.dumps({'ok':True,'result':{'accepted':True,'key':key,'op':'poweroff','boot_id':boot,
                            'meaning':'accepted; execution and OS completion are not confirmed by this receipt'}}),
            'status':'dispatched','created_unix':created,'replied_unix':created+1,'dispatched_unix':created+2,
            'command_returncode':None,'command_error':None}


class RestoreEvidenceGuards(unittest.TestCase):
    def rows(self):
        job={'id':'job-fixture','key':'ui-'+('1'*32),'status':'succeeded','tool_id':'test.tool','version':'1.0.0',
             'package_hash':'a'*64,'output':'public fixture output'}
        return {'hub_installed':[{'id':'test.tool','version':'1.0.0','enabled':1}], 'hub_jobs':[job],
                'hub_requests':[{'key':job['key'],'request_hash':'b'*64,'result':json.dumps({'id':job['id']})}]}

    def test_completed_job_receipt_and_input_are_not_fabricated(self):
        rows=self.rows();proof=verify.source_receipts(rows)
        self.assertEqual(proof['total_receipts'],1)
        self.assertEqual(len(proof['completed_jobs'][0]['output_sha256']),64)
        self.assertNotIn('public fixture output',json.dumps(proof))
        for change in ('missing-receipt','wrong-job','unfinished'):
            changed=copy.deepcopy(rows)
            if change=='missing-receipt': changed['hub_requests']=[]
            elif change=='wrong-job': changed['hub_requests'][0]['result']='{"id":"another"}'
            else: changed['hub_jobs'][0]['status']='running'
            with self.assertRaises(ValueError): verify.source_receipts(changed)

    def test_all_business_hashes_must_match_after_boot(self):
        before={name:{'tables':{'fixed':{'rows':1,'logical_sha256':'a'*64}},'schema_sha256':'s'*64,
                      'internal_sequences':{}} for name in verify.SOURCES}
        verify.compare_business(before,copy.deepcopy(before))
        for name in verify.BUSINESS_ROLES:
            after=copy.deepcopy(before);after[name]['tables']['fixed']['logical_sha256']='b'*64
            with self.assertRaisesRegex(ValueError,'changed: '+name): verify.compare_business(before,after)
        after=copy.deepcopy(before);after['power']['schema_sha256']='t'*64
        with self.assertRaisesRegex(ValueError,'power schema changed'): verify.compare_business(before,after)
        after=copy.deepcopy(before);after.pop('remote')
        with self.assertRaisesRegex(ValueError,'role coverage'): verify.compare_business(before,after)

    def test_native_shutdown_requires_new_boot_exact_old_receipts_and_guest_event(self):
        old=power_row('ui-'+('a'*32),'11111111-1111-1111-1111-111111111111')
        new=power_row('ui-'+('b'*32),'22222222-2222-2222-2222-222222222222',5)
        events=[{'event':'SHUTDOWN','data':{'guest':True}}]
        proof=verify.power_transition([old],[copy.deepcopy(old),new],events)
        self.assertEqual(proof['old_receipts_preserved'],1)
        for after,event in (([old],events),([old,new],[]),([old,new],[{'event':'SHUTDOWN','data':{'guest':False}}]),
                            ([old,new],events+[{'event':'RESET','data':{'guest':True}}])):
            with self.assertRaises(ValueError): verify.power_transition([old],after,event)
        changed=copy.deepcopy(old);changed['status']='abandoned'
        with self.assertRaisesRegex(ValueError,'old power receipt'): verify.power_transition([old],[changed,new],events)
        same_boot=power_row(new['key'],old['boot_id'],5)
        with self.assertRaisesRegex(ValueError,'new kernel boot'): verify.power_transition([old],[old,same_boot],events)

    def test_live_source_existing_destination_and_invalid_name_never_start_actions(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary)
            with patch.object(verify.sys,'platform','linux'),patch.object(verify.os,'geteuid',return_value=1000), \
                 patch.object(verify.guest,'BASE',root),patch.object(verify.guest,'state_path',return_value=root/'source'), \
                 patch.object(verify.guest,'status',return_value={'running':True}) as status, \
                 patch.object(verify.backup,'create_backup') as copy_action,patch.object(verify.guest,'start') as start:
                with self.assertRaisesRegex(ValueError,'still running'): verify.run('source','restored')
                status.return_value={'running':False};(root/'restored').mkdir()
                with self.assertRaisesRegex(ValueError,'already exists'): verify.run('source','restored')
                with self.assertRaisesRegex(ValueError,'invalid virtual-device'): verify.run('source','../escape')
            copy_action.assert_not_called();start.assert_not_called()

    def test_wallet_capture_path_only_navigates_and_scrolls(self):
        from unittest.mock import Mock,call
        ui=Mock()
        with patch.object(verify.time,'sleep'):
            verify.capture_wallet_read_only(ui)
        self.assertEqual(ui.mock_calls,[call.click(606,913),call.capture('04-restored-wallet-membership'),
                         call.keys(['pgdn']),call.capture('05-restored-wallet-balances')])


class CompleteSchemaEvidenceGuards(unittest.TestCase):
    """Actual local Store/Wallet/Platform schemas; no guest or remote requests."""
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(prefix='backup-populated-schema-')
        self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name)
        project=ROOT.parents[1]
        spec=importlib.util.spec_from_file_location('backup_schema_service',project/'os/platform/service.py')
        service=importlib.util.module_from_spec(spec);spec.loader.exec_module(service)
        from registry.client import RegistryClient
        client=RegistryClient('https://127.0.0.1:9443',project/'os/registry/fixtures/development-ca.pem',self.root/'cache')
        platform=service.Platform(self.root/'platform',project/'examples/registry',remote_registry=client,
                                  start_registry=False,remote_clients={},start_runner=False)
        self.addCleanup(platform.store.close)
        self.addCleanup(platform.runner.close)
        state=self.root/'wallet';state.mkdir(mode=0o700)
        wallet=service.WalletService(state,provisioning_file=project/'os/entitlement/fixtures/device-handoff.json',
                                     start_scheduler=False,clock=lambda:1788856800)
        self.addCleanup(wallet.close)
        def call(op,key,**fields):
            response=wallet.dispatch({'v':1,'op':op,'key':key,**fields},peer_uid=1002)
            if response.get('ok') is not True: raise AssertionError('disposable Wallet call failed')
            return response['result']
        call('wallet.register','test-register')
        from wallet_auth.fixture import SoftwareTestAuthenticator
        authenticator=SoftwareTestAuthenticator(self.root/'authenticator','fixture-rock-arm64-001')
        self.addCleanup(authenticator.close)
        begin=call('wallet.auth.begin','test-enroll-begin')
        credential=authenticator.make_credential(begin['options'],'0000','test-create')
        call('wallet.auth.enroll','test-enroll',challenge_id=begin['challenge_id'],credential=credential)
        call('wallet.terms','test-wallet-terms',accepted=True,terms_version='rock-wallet-development/1')
        call('wallet.consent','test-consent',accepted=True,terms_version='simulator-monthly-usd-8.88-v1')
        sale=call('wallet.sale','test-sale',amount_minor=5000)
        call('wallet.settle','test-settle',id=sale['id'])
        call('wallet.bill','test-bill',period='2026-09')
        wallet.membership.tick()
        call('wallet.consent','test-cancel-renewal',accepted=False,terms_version='simulator-monthly-usd-8.88-v1')
        quote=call('wallet.atm.quote','test-quote',issue_key='test-issue',amount_minor=1000,atm_id='SIM-ATM-001')
        assertion=authenticator.get_assertion(quote['options'],'0000','test-assertion')
        issuance=call('wallet.atm.issue','test-issue',quote_id=quote['quote_id'],credential=assertion)
        self.private_code=issuance['code']
        call('wallet.atm.cancel','test-atm-cancel',withdrawal_id=issuance['withdrawal_id'])
        # Use the actual power schema's SQL, without starting a privileged daemon.
        source=ast.parse((project/'os/system/power_service.py').read_text())
        schemas=[node.value for node in ast.walk(source) if isinstance(node,ast.Constant) and isinstance(node.value,str)
                 and 'CREATE TABLE IF NOT EXISTS requests (' in node.value]
        self.assertEqual(len(schemas),1)
        (self.root/'system').mkdir()
        with closing(sqlite3.connect(self.root/'system/power.db')) as db,db: db.executescript(schemas[0])

    def snapshot(self,profile=None):
        def export(_data,source,destination):
            shutil.copyfile(self.root/source.lstrip('/'),destination)
        with patch.object(verify.power,'export_closed_database',side_effect=export):
            return verify.business_snapshot(Path('disposable-closed-data-fixture'),profile)

    def test_all_44_current_business_tables_and_populated_totals_are_observed(self):
        snapshot,_,_=self.snapshot()
        self.assertEqual(sum(len(role['tables']) for role in snapshot.values()),44)
        self.assertEqual(len(snapshot['wallet']['tables']),16)
        self.assertEqual(len(snapshot['authenticator']['tables']),3)
        self.assertEqual(len(snapshot['membership']['tables']),15)
        self.assertEqual(len(snapshot['remote']['tables']),2)
        money=snapshot['wallet']['financial_summary']
        self.assertEqual((money['available_minor'],money['billed_minor'],money['bill_count'],money['bill_total_minor']),
                         (4112,888,1,888))
        self.assertEqual((money['held_minor'],money['dispensed_minor'],money['credential_count']),(0,0,1))
        self.assertEqual(snapshot['membership']['financial_summary'],
                         {'registered_accounts':1,'auto_renew_accounts':0,'paid_authorizations':1,'paid_months':1})
        for role in snapshot.values():
            self.assertEqual(role['integrity'],'ok')
            self.assertEqual(len(role['schema_sha256']),64)
        verify.compare_business(snapshot,self.snapshot()[0])

    def test_private_credential_and_membership_rows_are_not_exported(self):
        snapshot,_,_=self.snapshot()
        public=json.dumps(snapshot)
        self.assertTrue(self.private_code not in public,'private credential leaked into public evidence')
        for forbidden in ('owner_ref','device_ref','verification_ref','payload','result_json','response_json','code_sha256'):
            self.assertNotIn('"'+forbidden+'":',public)
        self.assertEqual(snapshot['wallet']['tables']['atm_credentials']['rows'],1)
        self.assertGreater(snapshot['membership']['tables']['receipts']['rows'],0)
        self.assertGreater(snapshot['membership']['tables']['events']['rows'],0)
        self.assertEqual(snapshot['membership']['tables']['account_devices']['rows'],1)
        self.assertEqual(snapshot['membership']['tables']['device_register_origins']['rows'],1)

    def test_new_table_is_not_silently_omitted(self):
        with closing(sqlite3.connect(self.root/'wallet/wallet-simulator.db')) as db,db:
            db.execute('CREATE TABLE unreviewed_business(value TEXT)')
            db.execute("INSERT INTO unreviewed_business VALUES ('private extra value')")
        before=self.snapshot()[0]
        self.assertEqual(before['wallet']['additional_tables'],['unreviewed_business'])
        self.assertEqual(before['wallet']['tables']['unreviewed_business']['rows'],1)
        self.assertNotIn('private extra value',json.dumps(before))
        with closing(sqlite3.connect(self.root/'wallet/wallet-simulator.db')) as db,db:
            db.execute("UPDATE unreviewed_business SET value='changed private extra value'")
        with self.assertRaisesRegex(ValueError,'changed: wallet'):
            verify.compare_business(before,self.snapshot()[0])

    def test_required_table_cannot_be_dropped_to_reduce_comparison_scope(self):
        with closing(sqlite3.connect(self.root/'platform/hub.db')) as db,db:
            db.execute('DROP TABLE hub_revoked')
        with self.assertRaisesRegex(ValueError,'missing required business table'):
            self.snapshot()

    def test_added_power_table_is_not_covered_by_shutdown_receipt_exception(self):
        with closing(sqlite3.connect(self.root/'system/power.db')) as db,db:
            db.execute('CREATE TABLE additional_power_audit(value TEXT)')
            db.execute("INSERT INTO additional_power_audit VALUES ('original')")
        before=self.snapshot()[0]
        with closing(sqlite3.connect(self.root/'system/power.db')) as db,db:
            db.execute("UPDATE additional_power_audit SET value='tampered'")
        with self.assertRaisesRegex(ValueError,'additional power business data changed'):
            verify.compare_business(before,self.snapshot()[0])

    def test_purchaser_profile_preserves_actual_remote_cache_and_all_additional_tables(self):
        from types import SimpleNamespace
        from wallet_backend.client import RemoteWalletService
        remote=RemoteWalletService(self.root/'wallet/backend-cache',SimpleNamespace(fingerprint='fixture-authority'))
        remote.close()
        path=self.root/'wallet/backend-cache/remote-cache.db'
        with closing(sqlite3.connect(path)) as db,db:
            db.execute("INSERT INTO requests VALUES ('same-key','private request','private response')")
            db.execute('CREATE TABLE game_reconciliation_fixture(exchange_id TEXT,status TEXT)')
            db.execute("INSERT INTO game_reconciliation_fixture VALUES ('private-exchange','resolved')")
        profile=verify.retention_profile({'schema':'rock-desktop-device/5'})
        before=self.snapshot(profile)[0]
        self.assertEqual(set(before),set(profile['sources']))
        self.assertNotIn('wallet',before)
        self.assertEqual(before['wallet_cache']['tables']['requests']['rows'],1)
        self.assertEqual(before['wallet_cache']['additional_tables'],['game_reconciliation_fixture'])
        self.assertNotIn('private-exchange',json.dumps(before))
        verify.compare_business(before,self.snapshot(profile)[0],profile)
        with closing(sqlite3.connect(path)) as db,db:
            db.execute("UPDATE game_reconciliation_fixture SET status='changed'")
        with self.assertRaisesRegex(ValueError,'changed: wallet_cache'):
            verify.compare_business(before,self.snapshot(profile)[0],profile)
        with closing(sqlite3.connect(path)) as db,db:
            db.execute("INSERT INTO requests VALUES ('unresolved','private unresolved',NULL)")
        with self.assertRaisesRegex(ValueError,'not quiescent.*wallet_cache'):
            self.snapshot(profile)

    def test_all_added_identity_stream_event_and_credential_hashes_are_compared(self):
        before=self.snapshot()[0]
        for role,table in (('wallet','atm_wallet_binding'),('wallet','atm_credentials'),('membership','devices'),
                           ('membership','streams'),('membership','events'),('membership','receipts'),
                           ('membership','device_binding'),('membership','device_runtime'),
                           ('membership','account_devices'),('membership','device_register_origins'),
                           ('hub','rock_registry_requests'),('remote','remote_jobs'),('remote','remote_cancel_receipts')):
            after=copy.deepcopy(before);after[role]['tables'][table]['logical_sha256']='f'*64
            with self.subTest(table=table),self.assertRaisesRegex(ValueError,'changed: '+role):
                verify.compare_business(before,after)

    def test_sequence_and_schema_changes_are_not_treated_as_harmless_metadata(self):
        before=self.snapshot()[0]
        for key in ('schema_sha256','internal_sequences'):
            after=copy.deepcopy(before)
            after['wallet'][key]='changed' if key=='schema_sha256' else {'sqlite_sequence':{'rows':99,'logical_sha256':'f'*64}}
            with self.assertRaisesRegex(ValueError,'changed: wallet'): verify.compare_business(before,after)

    def test_due_retry_is_rejected_before_claiming_strict_restoration(self):
        with closing(sqlite3.connect(self.root/'wallet/entitlement.db')) as db,db:
            db.execute("UPDATE device_monthly_due SET status='retry_wait'")
        with self.assertRaisesRegex(ValueError,'not quiescent.*membership'): self.snapshot()

    def test_schema_reads_do_not_modify_source_database_bytes(self):
        files=[self.root/path.lstrip('/') for path,_ in verify.SOURCES.values()]
        before=[path.read_bytes() for path in files]
        self.snapshot()
        self.assertTrue(before==[path.read_bytes() for path in files])

    def test_real_identity_row_change_is_detected_without_exporting_it(self):
        before=self.snapshot()[0]
        with closing(sqlite3.connect(self.root/'wallet/entitlement.db')) as db,db:
            db.execute('UPDATE devices SET valid_until=valid_until+1')
        after=self.snapshot()[0]
        with self.assertRaisesRegex(ValueError,'changed: membership'): verify.compare_business(before,after)

    def test_private_snapshot_byte_budget_fails_closed(self):
        with patch.object(verify,'MAX_SNAPSHOT_BYTES',1),self.assertRaisesRegex(ValueError,'byte budget'):
            self.snapshot()


if __name__=='__main__': unittest.main()

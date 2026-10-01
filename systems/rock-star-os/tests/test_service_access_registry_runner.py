"""Real TLS + SQLite purchaser admission; execution callback is explicitly fake."""
from contextlib import closing
import hashlib
import http.client
import json
from pathlib import Path
import sqlite3
import ssl
import tempfile
import threading
import unittest
from unittest.mock import patch

from blackberryrock.packages import PUBLIC_TEST_KEY, TEST_PUBLISHER, REMOTE_CONTRACT, canonical
from blackberryrock.sdk import sign_development, starter
from blackberryrock.wallet import Wallet
from entitlement.protocol import PUBLIC_TOKENS, TERMS_VERSION, sign_fixture_event
from entitlement.store import EntitlementStore
from entitlement.wallet_bridge import WalletBridge
from service_access import ServiceAccessController, PUBLIC_SERVICE_TOKENS, ServiceConfigurationError
from registry.server import RegistryStore, RegistryServer, Handler
from registry.client import RegistryClient
from registry.common import RegistryError
from runner.server import TLSRunnerServer
from runner.store import RunnerStore
from runner.protocol import sign_request, sign_response, verify_response, RunnerError, TransportError, digest
from runner.client import consent_for, RunnerClient
from runner.transport import HTTPSRunnerTransport

ROOT=Path(__file__).resolve().parents[1]
FIX=ROOT/'os/registry/fixtures'
AUTHORITY='00000000-0000-4000-8000-000000000001'
TRUST={TEST_PUBLISHER:PUBLIC_TEST_KEY}
CONSUMERS={alias:{'owner_actor':actor,'device_ref':device,'token':PUBLIC_SERVICE_TOKENS[alias]}
           for alias,actor,device in [('alice-a','alice','fixture-a'),('alice-b','alice','fixture-b'),('bob','bob','fixture-bob')]}


class FakeExecution:
    calls=0
    def execute(self,text,recipe,cancel):
        self.calls+=1
        return text.strip(),{'kind':'fake_callback','isolation':'NOT_RUN'}


class ServiceAccessTransportTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name)
        self.now=1788858000;self.sequences={};self.servers=[];self.stores=[]
        self.ent=EntitlementStore(self.root/'entitlement.db',clock=lambda:self.now)
        self.access=ServiceAccessController(self.ent,authority_id=AUTHORITY,consumers=CONSUMERS)
        self.package=self.make_package()
        self.registry=self.registry_store(self.root/'registry')
        self.regserver=self.listen(RegistryServer(('127.0.0.1',0),self.registry,FIX/'development-ca.pem',
            FIX/'PUBLIC-FIXTURE-KEY.pem',service_access=self.access))
        self.executor=FakeExecution();self.runner=self.runner_store(self.root/'runner')
        self.runserver=self.listen(TLSRunnerServer(('127.0.0.1',0),self.runner,FIX/'development-ca.pem',FIX/'PUBLIC-FIXTURE-KEY.pem'))
        self.context=ssl.create_default_context(cafile=str(FIX/'development-ca.pem'))

    def tearDown(self):
        errors=[]
        for server,thread in reversed(self.servers):
            for close in (server.shutdown,server.server_close,lambda:thread.join(5)):
                try:close()
                except Exception as error:errors.append(error)
            if thread.is_alive():errors.append(AssertionError('server thread not stopped'))
        for store in reversed(self.stores):
            try:store.close()
            except Exception as error:errors.append(error)
        self.temp.cleanup()
        if errors:raise errors[0]

    def listen(self,server):
        thread=threading.Thread(target=server.serve_forever,kwargs={'poll_interval':.02});thread.start()
        self.servers.append((server,thread));return server

    def registry_store(self,path,access=True):
        value=RegistryStore(path,FIX/'approved-authors.json',service_access=self.access if access else None)
        self.stores.append(value);return value

    def runner_store(self,path,target='cloud',access=True):
        value=RunnerStore(path,endpoint_id='test-'+target,target=target,
            transport_evidence='pinned_tls_loopback_fixture' if target=='cloud' else 'authenticated_unix_fixture',
            owners={alias:{'token':p['token'],'publishers':[TEST_PUBLISHER]} for alias,p in CONSUMERS.items()},
            publisher_trust=TRUST,executor=self.executor,start_worker=False,service_access=self.access if access else None)
        self.stores.append(value);return value

    @staticmethod
    def make_package(version='1.0.0'):
        source=starter('org.rockstar.service-access-test',schema_version=2,recipe=[{'op':'trim_lines'}])
        source['manifest'].update(version=version,schema_version=3,execution_targets=['cloud','pc_usb'],
            permissions=['text.input','text.output','execution.remote'],data={'input':'user_supplied_text','destinations':['cloud','pc_usb']},
            remote=REMOTE_CONTRACT.copy())
        return sign_development(source)

    def event(self,alias,kind='handoff'):
        policy=CONSUMERS[alias];device=policy['device_ref'];seq=self.sequences.get(device,0)+1;self.sequences[device]=seq
        payload={'device_ref':device}
        if kind!='suspend':payload.update(verification_ref='fixture-verification-'+device,verified_at=self.now,valid_until=self.now+90*86400)
        if kind=='handoff':payload.update(owner_ref='fixture-owner-'+policy['owner_actor'],purchase_ref='fixture-purchase-'+device)
        self.ent.ingest(sign_fixture_event('fulfillment','event-'+device+'-'+str(seq),'device:'+device,seq,self.now,kind,payload))

    def paid(self):
        self.event('alice-a');self.event('alice-b')
        token=PUBLIC_TOKENS['alice'];account=self.ent.register('fixture-a','register-a',token)['account_id']
        self.assertEqual(self.ent.register('fixture-b','register-b',token)['account_id'],account)
        self.ent.consent(account,True,TERMS_VERSION,'monthly-consent',token)
        wallet=Wallet(self.root/'wallet.db');sale=wallet.simulate_sale(5000,'sale');wallet.settle_sale(sale['id'],'settle')
        grant=self.ent.authorize_month(account,'2026-09','authorize',PUBLIC_TOKENS['wallet'])
        self.ent.claim_authorization(grant['authorization_id'],'claim',PUBLIC_TOKENS['wallet'])
        WalletBridge(self.ent,wallet,account,PUBLIC_TOKENS['wallet']).execute(grant['authorization_id'],'pay',PUBLIC_TOKENS['wallet'])
        self.assertEqual(wallet.snapshot()['billed_minor'],888)
        return account

    def http(self,server,method,path,body=None,headers=()):
        c=http.client.HTTPSConnection('127.0.0.1',server.server_port,context=self.context,timeout=4)
        try:
            c.putrequest(method,path);c.putheader('Connection','close')
            if body is not None:c.putheader('Content-Length',str(len(body)))
            for name,value in headers:c.putheader(name,value)
            c.endheaders(body);r=c.getresponse();raw=r.read(1024*1024+1)
            self.assertLessEqual(len(raw),1024*1024)
            return r.status,raw
        finally:c.close()

    def consumer_headers(self,alias='alice-a'):
        return [('Authorization','Bearer '+CONSUMERS[alias]['token']),('X-Rock-Service-Consumer',alias),('X-Rock-Service-Authority',AUTHORITY)]

    def publish(self,package=None):
        package=package or self.package
        status,raw=self.http(self.regserver,'POST','/v1/publish',canonical({'package':package}),
            [('Content-Type','application/json'),('Idempotency-Key','publish-'+package['manifest']['version']),
             ('Authorization','Bearer '+(FIX/'PUBLIC-AUTHOR-TOKEN.txt').read_text().strip())])
        self.assertEqual(status,200);return json.loads(raw)['hash']

    def request(self,key='job',op='submit',store=None,text=' text '):
        store=store or self.runner
        request={'v':1,'op':op,'endpoint_id':store.endpoint_id,'key':key}
        if op=='submit':request.update(package=self.package,text=text,
            consent=consent_for(self.package,text,target=store.target,endpoint_id=store.endpoint_id,key=key))
        return request

    def remote(self,request,alias='alice-a'):
        token=CONSUMERS[alias]['token'];envelope=sign_request(alias,token,request,authority_id=AUTHORITY)
        status,raw=self.http(self.runserver,'POST','/v1/runner',canonical(envelope),[('Content-Type','application/json')])
        self.assertEqual(status,200)
        return verify_response(token,request,json.loads(raw),authority_id=AUTHORITY)

    def jobs(self,store=None):
        with closing((store or self.runner).connect()) as db:return [dict(r) for r in db.execute('SELECT * FROM jobs')]

    def test_anonymous_wrong_and_duplicate_consumer_headers_denied(self):
        self.event('alice-a');digest=self.publish()
        for path in ('/index.json','/packages/'+digest+'.rock.json'):
            for headers in ([],self.consumer_headers()+[('X-Rock-Service-Consumer','alice-a')],
                            self.consumer_headers()+[('Authorization','Bearer duplicate')],
                            [('Authorization','Bearer '+CONSUMERS['alice-b']['token']),('X-Rock-Service-Consumer','alice-a')]):
                with self.subTest(path=path,headers=len(headers)):
                    status,_=self.http(self.regserver,'GET',path,headers=headers);self.assertEqual(status,403)

    def test_store_purchaser_without_registration_or_payment_and_author_separation(self):
        self.event('alice-a');self.publish()
        self.assertEqual(self.http(self.regserver,'GET','/index.json',headers=self.consumer_headers())[0],200)
        status,_=self.http(self.regserver,'POST','/v1/publish',canonical({'package':self.package}),
            [('Content-Type','application/json'),('Idempotency-Key','owner-not-author'),*self.consumer_headers()])
        self.assertEqual(status,401)

    def test_unprovisioned_signed_device_and_revoked_get_denied(self):
        self.publish()
        self.assertEqual(self.http(self.regserver,'GET','/index.json',headers=self.consumer_headers())[0],403)
        self.event('alice-a');self.event('alice-a','suspend')
        self.assertEqual(self.http(self.regserver,'GET','/index.json',headers=self.consumer_headers())[0],403)
        self.event('alice-a','restore')
        self.assertEqual(self.http(self.regserver,'GET','/index.json',headers=self.consumer_headers())[0],200)

    def test_optional_client_auth_gets_and_local_cache_never_mask_failed_new_get(self):
        self.event('alice-a');first=self.publish();second=self.publish(self.make_package('2.0.0'))
        client=RegistryClient('https://127.0.0.1:'+str(self.regserver.server_port),FIX/'development-ca.pem',self.root/'cache',
            consumer='alice-a',consumer_token=CONSUMERS['alice-a']['token'],authority_id=AUTHORITY)
        client.refresh();self.assertEqual(client.download(self.package['manifest']['id'],'1.0.0'),self.package)
        self.event('alice-a','suspend')
        self.assertEqual(client.download(self.package['manifest']['id'],'1.0.0'),self.package)
        with self.assertRaisesRegex(RegistryError,'403'):client.download(self.package['manifest']['id'],'2.0.0')
        with self.assertRaisesRegex(RegistryError,'403'):client.refresh()
        self.assertTrue((client.package_dir/(first+'.rock.json')).exists());self.assertFalse((client.package_dir/(second+'.rock.json')).exists())
        self.assertNotIn(CONSUMERS['alice-a']['token'],client.state_file.read_text())

    def test_client_partial_or_header_injection_credentials_rejected(self):
        for kw in ({'consumer':'alice-a'},{'consumer_token':'token'},{'consumer':'alice-a','consumer_token':'public-token\r\ninjected'},
                   {'consumer':'alice-a\n','consumer_token':CONSUMERS['alice-a']['token']}):
            with self.assertRaises(RegistryError):RegistryClient('https://127.0.0.1',FIX/'development-ca.pem',self.root/'unused',**kw)

    def test_cloud_unpaid_new_submit_denied_without_job(self):
        self.event('alice-a')
        result=self.remote(self.request());self.assertFalse(result['ok']);self.assertEqual(result['code'],'unauthorized')
        self.assertEqual(self.jobs(),[])

    def test_paid_alias_replay_same_tenant_bob_isolated_and_callback_runs_once(self):
        self.paid();request=self.request();first=self.remote(request)
        self.assertTrue(first['ok']);self.assertEqual(first,self.remote(request,'alice-b'))
        self.event('bob');other=self.remote(self.request(op='status'),'bob');self.assertFalse(other['result']['found'])
        jobs=self.jobs();self.assertEqual(len(jobs),1);self.assertEqual(jobs[0]['consumer_id'],'alice-a')
        self.assertEqual(jobs[0]['device_ref'],'fixture-a');self.assertNotEqual(jobs[0]['owner'],'alice-a')
        self.runner.tick();self.runner.tick();self.assertEqual(self.executor.calls,1)
        self.assertEqual(self.remote(self.request(op='status'),'alice-b')['result']['output'],'text')

    def test_exact_replay_status_cancel_survive_payment_expiry_but_new_submit_does_not(self):
        account=self.paid();request=self.request();first=self.remote(request)
        self.now=self.ent.entitlement(account,PUBLIC_TOKENS['alice'])['access_until']+1
        self.assertEqual(first,self.remote(request,'alice-b'))
        self.assertFalse(self.remote(self.request('new'),'alice-b')['ok'])
        self.assertTrue(self.remote(self.request(op='status'),'alice-b')['result']['found'])
        self.assertEqual(self.remote(self.request(op='cancel'),'alice-b')['result']['state'],'cancelled')
        self.runner.tick();self.assertEqual(self.executor.calls,0)

    def test_queued_origin_revoked_b_can_recover_but_cannot_start_origin_job(self):
        self.paid();request=self.request();first=self.remote(request);self.event('alice-a','suspend')
        self.assertFalse(self.remote(request)['ok']);self.assertEqual(first,self.remote(request,'alice-b'))
        self.runner.tick();self.assertEqual(self.executor.calls,0)
        result=self.remote(self.request(op='status'),'alice-b')['result'];self.assertEqual(result['state'],'failed')
        self.assertIsNone(self.jobs()[0]['request_json'])

    def test_queued_payment_expiry_is_checked_again_before_dispatch(self):
        account=self.paid();self.remote(self.request())
        self.now=self.ent.entitlement(account,PUBLIC_TOKENS['alice'])['access_until']+1
        self.runner.tick();self.assertEqual(self.executor.calls,0);self.assertEqual(self.jobs()[0]['state'],'failed')

    def test_cancel_at_period_end_keeps_paid_current_month(self):
        account=self.paid();self.ent.consent(account,False,TERMS_VERSION,'cancel-renew',PUBLIC_TOKENS['alice'])
        self.assertTrue(self.remote(self.request())['ok']);self.runner.tick();self.assertEqual(self.executor.calls,1)

    def test_pc_link_requires_purchase_but_not_paid_cloud_contract(self):
        self.event('alice-a');store=self.runner_store(self.root/'pc','pc_usb');request=self.request(store=store)
        envelope=sign_request('alice-a',CONSUMERS['alice-a']['token'],request,authority_id=AUTHORITY)
        response=store.dispatch(envelope,transport_target='pc_usb',transport_evidence='authenticated_unix_fixture')
        self.assertTrue(verify_response(CONSUMERS['alice-a']['token'],request,response,authority_id=AUTHORITY)['ok'])
        store.tick();self.assertEqual(self.executor.calls,1)

    def test_closed_registry_restart_requires_same_controller_authority(self):
        path=self.root/'closed-extra';store=self.registry_store(path);store.close();self.stores.remove(store)
        with self.assertRaises(RegistryError):RegistryStore(path,FIX/'approved-authors.json')
        other=ServiceAccessController(EntitlementStore(self.root/'other-entitlement.db'),authority_id='00000000-0000-4000-8000-000000000002',consumers=CONSUMERS)
        with self.assertRaises(RegistryError):RegistryStore(path,FIX/'approved-authors.json',service_access=other)
        same=self.registry_store(path)
        with self.assertRaises(RegistryError):RegistryServer(('127.0.0.1',0),same,FIX/'development-ca.pem',FIX/'PUBLIC-FIXTURE-KEY.pem')

    def test_nonempty_legacy_registry_and_runner_never_reassign_history(self):
        path=self.root/'legacy-reg';store=self.registry_store(path,access=False)
        store.publish('development-author','legacy',{'package':self.package});store.close();self.stores.remove(store)
        with self.assertRaises(RegistryError):RegistryStore(path,FIX/'approved-authors.json',service_access=self.access)
        path=self.root/'legacy-run';store=self.runner_store(path,access=False);request=self.request(store=store)
        store.submit('alice-a',request);store.close();self.stores.remove(store)
        with self.assertRaises(RunnerError):self.runner_store(path)
        legacy=self.runner_store(path,access=False);self.assertEqual(len(self.jobs(legacy)),1)

    def test_closed_runner_restart_denies_missing_or_wrong_authority_and_preserves_origin(self):
        self.paid();path=self.root/'restart';store=self.runner_store(path);request=self.request(store=store)
        envelope=sign_request('alice-a',CONSUMERS['alice-a']['token'],request,authority_id=AUTHORITY)
        store.dispatch(envelope,transport_target='cloud',transport_evidence='pinned_tls_loopback_fixture')
        before=self.jobs(store);store.close();self.stores.remove(store)
        with self.assertRaises(RunnerError):self.runner_store(path,access=False)
        saved=self.access;self.access=ServiceAccessController(EntitlementStore(self.root/'other-entitlement.db'),authority_id='00000000-0000-4000-8000-000000000002',consumers=CONSUMERS)
        try:
            with self.assertRaises(RunnerError):self.runner_store(path)
        finally:self.access=saved
        store=self.runner_store(path);self.assertEqual(before,self.jobs(store));self.event('alice-a','suspend')
        store.tick();self.assertEqual(self.executor.calls,0);self.assertEqual(self.jobs(store)[0]['state'],'failed')

    def test_owner_supplied_extra_device_or_authority_field_is_rejected(self):
        self.paid()
        for field in ('device_ref','authority_id','tenant'):
            self.assertFalse(self.remote({**self.request(),field:'forged'})['ok'])
        self.assertEqual(self.jobs(),[])

    def test_original_device_binding_is_immutable_sqlite_evidence(self):
        self.paid();self.remote(self.request())
        with closing(self.runner.connect()) as db:
            with self.assertRaises(sqlite3.IntegrityError):db.execute("UPDATE jobs SET device_ref='fixture-b'")
        self.assertEqual(self.jobs()[0]['device_ref'],'fixture-a')

    def test_authority_configuration_outage_is_structured_unavailable_and_repairable(self):
        self.paid();request=self.request();receipt=self.remote(request);before=self.jobs()
        with patch.object(self.access,'_mode',side_effect=ServiceConfigurationError('fixed test-only authority outage')):
            status,raw=self.http(self.regserver,'GET','/index.json',headers=self.consumer_headers())
            self.assertEqual(status,503);self.assertNotIn(b'fixed test-only',raw)
            result=self.remote(request);self.assertEqual(result['code'],'unavailable')
            with self.assertRaises(ServiceConfigurationError):self.runner.tick()
        self.assertEqual(before,self.jobs());self.assertEqual(self.executor.calls,0)
        self.assertEqual(receipt,self.remote(request));self.runner.tick();self.assertEqual(self.executor.calls,1)

    def test_authority_sqlite_outage_does_not_erase_queued_input(self):
        self.paid();self.remote(self.request());before=self.jobs()
        with patch.object(self.access,'authenticate',side_effect=sqlite3.OperationalError('test storage unavailable')):
            self.assertEqual(self.remote(self.request(op='status'))['code'],'unavailable')
        with patch.object(self.access,'_mode',side_effect=sqlite3.OperationalError('test storage unavailable')):
            with self.assertRaises(sqlite3.OperationalError):self.runner.tick()
        self.assertEqual(before,self.jobs());self.assertEqual(self.executor.calls,0)

    def test_started_job_is_not_represented_as_unsent_after_device_revocation(self):
        self.paid();self.remote(self.request())
        started=threading.Event();release=threading.Event();errors=[]
        original=self.executor.execute
        def execute(*args):
            started.set()
            if not release.wait(3):raise AssertionError('bounded test callback release missing')
            return original(*args)
        def tick():
            try:self.runner.tick()
            except BaseException as error:errors.append(error)
        with patch.object(self.executor,'execute',side_effect=execute):
            thread=threading.Thread(target=tick);thread.start()
            try:
                self.assertTrue(started.wait(2));self.assertEqual(self.jobs()[0]['state'],'running')
                self.event('alice-a','suspend')
                self.assertFalse(self.remote(self.request(op='status'))['ok'])
                self.assertEqual(self.remote(self.request(op='status'),'alice-b')['result']['state'],'running')
            finally:release.set();thread.join(4)
        self.assertFalse(thread.is_alive());self.assertEqual(errors,[])
        self.assertEqual(self.executor.calls,1);self.assertEqual(self.jobs()[0]['state'],'succeeded')

    def test_registry_guard_serializes_same_store_suspend_before_next_get(self):
        self.event('alice-a');digest=self.publish();entered=threading.Event();release=threading.Event();suspended=threading.Event()
        path='/packages/'+digest+'.rock.json';original=self.registry.package;results=[];errors=[]
        def package(value):
            entered.set()
            if not release.wait(3):raise AssertionError('bounded registry test release missing')
            return original(value)
        def fetch():
            try:results.append(self.http(self.regserver,'GET',path,headers=self.consumer_headers())[0])
            except BaseException as error:errors.append(error)
        def suspend():
            try:self.event('alice-a','suspend');suspended.set()
            except BaseException as error:errors.append(error)
        with patch.object(self.registry,'package',side_effect=package):
            fetcher=threading.Thread(target=fetch);fetcher.start();mutator=None
            try:
                self.assertTrue(entered.wait(2));mutator=threading.Thread(target=suspend);mutator.start()
                self.assertFalse(suspended.wait(.05))
            finally:
                release.set();fetcher.join(4)
                if mutator:mutator.join(4)
        self.assertFalse(fetcher.is_alive());self.assertTrue(suspended.is_set());self.assertEqual(errors,[])
        self.assertEqual(results,[200]);self.assertEqual(self.http(self.regserver,'GET',path,headers=self.consumer_headers())[0],403)

    def test_missing_registry_marker_row_never_reopens_anonymously(self):
        path=self.root/'corrupt-reg';store=self.registry_store(path)
        with self.assertRaises(sqlite3.IntegrityError):store.connection.execute('DELETE FROM service_access_mode')
        store.close();self.stores.remove(store)
        # Deliberate corruption is restricted to this disposable fixture.
        with closing(sqlite3.connect(path/'registry.db')) as db,db:
            db.execute('DROP TRIGGER service_access_mode_no_delete');db.execute('DELETE FROM service_access_mode')
        for controller in (None,self.access):
            with self.assertRaises(RegistryError):RegistryStore(path,FIX/'approved-authors.json',service_access=controller)

    def test_missing_either_runner_marker_never_reopens_even_without_jobs(self):
        for missing in ('metadata','runner_service_access'):
            path=self.root/('corrupt-'+missing);store=self.runner_store(path)
            with closing(store.connect()) as db:
                with self.assertRaises(sqlite3.IntegrityError):db.execute("DELETE FROM metadata WHERE key='service_access'")
                with self.assertRaises(sqlite3.IntegrityError):db.execute('DELETE FROM runner_service_access')
            store.close();self.stores.remove(store)
            with closing(sqlite3.connect(path/'jobs.sqlite3')) as db,db:
                if missing=='metadata':
                    db.execute('DROP TRIGGER service_access_metadata_no_delete');db.execute("DELETE FROM metadata WHERE key='service_access'")
                else:
                    db.execute('DROP TRIGGER runner_service_access_no_delete');db.execute('DELETE FROM runner_service_access')
            for bound in (False,True):
                with self.assertRaises(RunnerError):self.runner_store(path,access=bound)

    def test_closed_job_origin_prevents_legacy_fallback_when_both_markers_removed(self):
        self.paid();path=self.root/'lost-markers';store=self.runner_store(path);request=self.request(store=store)
        store.dispatch(sign_request('alice-a',CONSUMERS['alice-a']['token'],request,authority_id=AUTHORITY),
                       transport_target='cloud',transport_evidence='pinned_tls_loopback_fixture')
        store.close();self.stores.remove(store)
        with closing(sqlite3.connect(path/'jobs.sqlite3')) as db,db:
            db.execute('DROP TRIGGER service_access_metadata_no_delete');db.execute("DELETE FROM metadata WHERE key='service_access'")
            db.execute('DROP TABLE runner_service_access')
        with self.assertRaises(RunnerError):self.runner_store(path,access=False)

    def client(self,cache='cache',alias='alice-a',authority=AUTHORITY):
        return RegistryClient('https://127.0.0.1:'+str(self.regserver.server_port),FIX/'development-ca.pem',self.root/cache,
            consumer=alias,consumer_token=CONSUMERS[alias]['token'],authority_id=authority)

    def test_registry_authority_headers_required_before_guard_and_reply_is_bound(self):
        self.event('alice-a');self.publish()
        headers=self.consumer_headers();wrong='00000000-0000-4000-8000-000000000002'
        for value in (headers[:-1],headers[:-1]+[('X-Rock-Service-Authority',wrong)],headers+[headers[-1]]):
            with patch.object(self.access,'guard',side_effect=AssertionError('authority must precede admission')):
                self.assertEqual(self.http(self.regserver,'GET','/index.json',headers=value)[0],403)
        with self.assertRaisesRegex(RegistryError,'authority response binding'):
            self.client('wrong-authority',authority=wrong).refresh()
        client=self.client();client.refresh()
        self.assertEqual(json.loads(client.state_file.read_bytes())['service_binding'],{'authority_id':AUTHORITY,'consumer':'alice-a'})

    def test_registry_missing_duplicate_or_changed_response_authority_never_caches(self):
        self.event('alice-a');self.publish();original=Handler.send_header
        for case in ('missing','duplicate','changed'):
            def send(handler,name,value):
                if name=='X-Rock-Service-Authority':
                    if case=='missing':return
                    if case=='duplicate':original(handler,name,value)
                    if case=='changed':value='00000000-0000-4000-8000-000000000002'
                original(handler,name,value)
            client=self.client(case)
            with patch.object(Handler,'send_header',send):
                with self.assertRaisesRegex(RegistryError,'authority response binding'):client.refresh()
            self.assertFalse(client.state_file.exists())

    def test_registry_saved_index_cannot_change_consumer_authority_or_legacy_mode(self):
        self.event('alice-a');self.event('alice-b');self.publish();client=self.client();client.refresh()
        before=client.state_file.read_bytes()
        for alias,authority in (('alice-b',AUTHORITY),('alice-a','00000000-0000-4000-8000-000000000002')):
            other=self.client(alias=alias,authority=authority)
            with self.assertRaisesRegex(RegistryError,'cache is not bound'):other.catalog()
        legacy=RegistryClient(client.origin,FIX/'development-ca.pem',self.root/'cache')
        with self.assertRaisesRegex(RegistryError,'cache is not bound'):legacy.catalog()
        self.assertEqual(before,client.state_file.read_bytes())
        with self.assertRaises(RegistryError):
            RegistryClient(client.origin,FIX/'development-ca.pem',self.root/'partial',consumer='alice-a',consumer_token=CONSUMERS['alice-a']['token'])

    def test_runner_missing_wrong_or_tampered_authority_rejected_before_admission(self):
        self.paid();request=self.request();token=CONSUMERS['alice-a']['token']
        wrong='00000000-0000-4000-8000-000000000002'
        correct=sign_request('alice-a',token,request,authority_id=AUTHORITY)
        envelopes=[sign_request('alice-a',token,request),sign_request('alice-a',token,request,authority_id=wrong),
                   {**sign_request('alice-a',token,request,authority_id=wrong),'authority_id':AUTHORITY}]
        for envelope in envelopes:
            with patch.object(self.access,'guard',side_effect=AssertionError('authority must precede admission')):
                status,_=self.http(self.runserver,'POST','/v1/runner',canonical(envelope),[('Content-Type','application/json')])
                self.assertEqual(status,401)
        self.assertEqual(self.jobs(),[])
        self.assertEqual(correct['request'],request);self.assertEqual(digest(correct['request']),digest(envelopes[0]['request']))

    def test_runner_client_pins_real_tls_request_response_without_job_hash_change(self):
        self.paid();transport=HTTPSRunnerTransport('https://127.0.0.1:'+str(self.runserver.server_port),FIX/'development-ca.pem')
        token=CONSUMERS['alice-a']['token'];request=self.request()
        client=RunnerClient(transport,endpoint_id=self.runner.endpoint_id,owner='alice-a',token=token,authority_id=AUTHORITY)
        receipt=client.submit(self.package,request['text'],request['key'],consent=request['consent'])
        self.assertEqual(receipt['request_sha256'],digest(request));self.assertEqual(self.jobs()[0]['request_sha256'],digest(request))
        original=transport.exchange
        for case in ('missing','changed','tampered'):
            def exchange(envelope):
                response=original(envelope);body=response['response']
                if case=='missing':return sign_response(token,envelope['request'],body)
                wrong='00000000-0000-4000-8000-000000000002'
                response=sign_response(token,envelope['request'],body,authority_id=wrong)
                if case=='tampered':response['authority_id']=AUTHORITY
                return response
            with patch.object(transport,'exchange',side_effect=exchange):
                with self.assertRaises(TransportError):client.status('job')
        self.assertEqual(len(self.jobs()),1)


if __name__=='__main__':unittest.main()

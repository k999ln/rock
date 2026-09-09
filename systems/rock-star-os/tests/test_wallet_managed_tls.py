"""Real A/B/C managed runtimes, one TLS listener, three public test devices.

No fake coordinator/permit, local ledger fallback, QEMU or real-money claim.
Requires the separately integrated A runtime and C authority fence modules.
"""
from concurrent.futures import ThreadPoolExecutor
import copy
import json
from pathlib import Path
import sys
import tempfile
import threading
import time
import unittest

ROOT=Path(__file__).resolve().parents[1]
sys.path[:0]=[str(ROOT/'src'),str(ROOT/'os')]
from entitlement.protocol import sign_fixture_event
from wallet_backend.authority_fence import AuthorityFenceCoordinator
from wallet_backend.contract_runtime import ContractRuntime
from wallet_backend.runtime_contracts import FreshContractSpec
from wallet_backend.owner_router import OwnerRouter
from wallet_backend.server import ManagedWalletBackendServer
from wallet_backend.client import HTTPSWalletTransport, RemoteWalletService, BackendUnavailable, READS
from wallet_auth.fixture import SoftwareTestAuthenticator

A1,A2,B1='fixture-gx00-alice-1','fixture-gx00-alice-2','fixture-gx00-bob-1'
DEVICE_OWNER={A1:'alice',A2:'alice',B1:'bob'}
TOKENS={device:'PUBLIC-FIXTURE-GX00-'+device+'-v1' for device in DEVICE_OWNER}
TERMS='rock-wallet-development/1'
MONTHLY='simulator-monthly-usd-8.88-v1'


class ManagedOwnerTLSIntegration(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(prefix='gx00-three-device-tls-');self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name).resolve();self.now=1789000000
        self.runtimes={};self.clients={};self.authenticators={};self.transports={};self.counter=0
        self.server=self.thread=self.coordinator=self.router=None
        self.addCleanup(self.stop)
        self.credentials=self.root/'credentials.json'
        self.rows=[{'ledger_ref':'ledger-'+owner,'owner_actor':owner,'owner_ref':'fixture-owner-'+owner,
                    'device_ref':device,'credential_revision':1,'active':True,'expires_at':self.now+7776000,
                    'token':TOKENS[device]} for device,owner in DEVICE_OWNER.items()]
        self.write_credentials()
        self.coordinator=AuthorityFenceCoordinator(self.root/'coordinator')
        self.router=OwnerRouter(self.root/'router',self.credentials,clock=lambda:self.now)
        for owner,primary in (('alice',A1),('bob',B1)):
            handoff=self.root/(owner+'-handoff.json')
            handoff.write_text(json.dumps({'schema_version':1,'kind':'public-development-fixture','events':[self.event(primary)]}))
            handoff.chmod(0o600)
            spec=FreshContractSpec('ledger-'+owner,(self.root/('contract-'+owner)).resolve(),owner,'fixture-owner-'+owner,primary)
            self.runtimes[owner]=ContractRuntime.open_fresh(spec,coordinator=self.coordinator,
                provisioning_file=handoff,verifier=self.router,clock=lambda:self.now)
        self.runtimes['alice'].ingest_fulfillment(self.event(A2))
        self.server=ManagedWalletBackendServer(('127.0.0.1',0),router=self.router,
            runtimes=tuple(self.runtimes.values()),start_scheduler=False,timeout=3)
        self.thread=threading.Thread(target=self.server.serve_forever,kwargs={'poll_interval':.01});self.thread.start()
        for device,owner in DEVICE_OWNER.items():
            token=self.root/(device+'-token');token.write_text(TOKENS[device]);token.chmod(0o600)
            transport=HTTPSWalletTransport('https://127.0.0.1:'+str(self.server.server_port),
                ROOT/'os/registry/fixtures/development-ca.pem',token,
                authority_id=self.runtimes[owner].descriptor.wallet_authority_id,device_ref=device,protocol_version=3)
            self.transports[device]=transport
            self.clients[device]=RemoteWalletService(self.root/(device+'-cache'),transport,clock=lambda:self.now)
            self.authenticators[device]=SoftwareTestAuthenticator(self.root/(device+'-authenticator'),device)

    def event(self, device):
        owner=DEVICE_OWNER[device]
        payload={'device_ref':device,'owner_ref':'fixture-owner-'+owner,'purchase_ref':device+'-purchase',
                 'verification_ref':device+'-verification','verified_at':self.now,'valid_until':self.now+7776000}
        return sign_fixture_event('fulfillment',device+'-handoff','device:'+device,1,self.now,'handoff',payload)

    def write_credentials(self):
        self.credentials.write_text(json.dumps({'schema_version':3,'kind':'public-development-owner-device-credentials','devices':self.rows}))
        self.credentials.chmod(0o600)

    def stop(self):
        for client in self.clients.values():client.close()
        for authenticator in self.authenticators.values():authenticator.close()
        if self.server is not None:
            if self.thread is not None and self.thread.is_alive():self.server.shutdown();self.thread.join(5)
            if self.thread is not None:self.assertFalse(self.thread.is_alive())
            self.server.server_close();self.server=None
        else:
            for runtime in self.runtimes.values():runtime.close()
            if self.router is not None:self.router.close()
        if self.coordinator is not None:self.coordinator.close();self.coordinator=None

    def call(self, device, op, **fields):
        self.counter+=1;request={'v':1,'op':op,**fields}
        if op not in READS:request.setdefault('key','managed-'+str(self.counter))
        reply=self.clients[device].dispatch(request,peer_uid=1002)
        self.assertTrue(reply['ok'],reply)
        return reply.get('result',reply.get('snapshot'))

    def register_activate(self, device, *, accept_terms=True):
        account=self.call(device,'wallet.register',key='same-register' if device!=A2 else 'register-second')
        options=self.call(device,'wallet.auth.begin')
        credential=self.authenticators[device].make_credential(options['options'],'0000','create-'+device)
        enrolled=self.call(device,'wallet.auth.enroll',challenge_id=options['challenge_id'],credential=credential)
        if accept_terms:self.call(device,'wallet.terms',accepted=True,terms_version=TERMS)
        return account,enrolled

    def credit(self, owner, amount):
        sale=self.runtimes[owner].seed_fixture_sale(amount,'same-public-credit')
        self.runtimes[owner].settle_fixture_sale(sale['id'],'same-public-settlement')

    def issue(self, device, amount, key='same-atm-issue'):
        quote=self.call(device,'wallet.atm.quote',key='quote-'+key,issue_key=key,amount_minor=amount,atm_id='SIM-ATM-001')
        credential=self.authenticators[device].get_assertion(quote['options'],'0000','get-'+key)
        return self.call(device,'wallet.atm.issue',key=key,quote_id=quote['quote_id'],credential=credential)

    def test_same_listener_distinct_owner_accounts_shared_alice_contract_terms_and_monthly_scope(self):
        a,_=self.register_activate(A1);a2,_=self.register_activate(A2);b,_=self.register_activate(B1,accept_terms=False)
        self.assertEqual(a['account_id'],a2['account_id']);self.assertNotEqual(a['account_id'],b['account_id'])
        self.assertFalse(hasattr(self.server,'service'))
        self.assertNotEqual(self.transports[A1].authority_id,self.transports[B1].authority_id)
        self.assertEqual(self.transports[A1].origin,self.transports[B1].origin)
        self.assertTrue(self.call(A2,'wallet.auth.status')['active']);self.assertFalse(self.call(B1,'wallet.auth.status')['active'])
        self.credit('alice',5000);self.credit('bob',8000)
        self.call(A1,'wallet.consent',accepted=True,terms_version=MONTHLY)
        self.call(B1,'wallet.terms',accepted=True,terms_version=TERMS)
        self.call(B1,'wallet.consent',accepted=False,terms_version=MONTHLY)
        for runtime in self.runtimes.values():runtime.start_scheduler()
        deadline=time.monotonic()+5
        while True:
            alice=self.call(A1,'snapshot');bob=self.call(B1,'snapshot')
            if alice['billed_minor']==888:break
            self.assertLess(time.monotonic(),deadline);time.sleep(.03)
        self.call(A2,'wallet.bill',period='2026-09')
        self.assertEqual(self.call(A2,'snapshot')['billed_minor'],888)
        self.assertEqual((bob['available_minor'],bob['billed_minor'],bob['held_minor']),(8000,0,0))

    def test_parallel_same_key_atm_jobs_are_separate_and_cross_owner_lookups_fail(self):
        for device in (A1,A2,B1):self.register_activate(device)
        self.credit('alice',5000);self.credit('bob',8000)
        # Dedicated owner clients/authenticators; the actual listener shares workers.
        with ThreadPoolExecutor(max_workers=2) as pool:
            first=pool.submit(self.issue,A1,1000);second=pool.submit(self.issue,B1,2000)
            a,b=first.result(timeout=8),second.result(timeout=8)
        self.assertNotEqual(a['withdrawal_id'],b['withdrawal_id'])
        self.assertEqual((self.call(A2,'snapshot')['held_minor'],self.call(B1,'snapshot')['held_minor']),(1000,2000))
        for device,foreign in ((A1,b),(B1,a)):
            result=self.transports[device].exchange({'v':1,'op':'wallet.atm.status','withdrawal_id':foreign['withdrawal_id']})
            self.assertFalse(result['ok'])
        for device,owner,hold in ((A1,'alice',1000),(B1,'bob',2000)):
            snapshot=self.call(device,'snapshot')
            self.assertEqual(snapshot['held_minor'],hold)

    def test_owner_body_injection_wrong_token_authority_and_legacy_paths_do_not_dispatch(self):
        for device in (A1,B1):self.register_activate(device)
        before={device:self.call(device,'snapshot') for device in (A1,B1)}
        for field in ('owner_actor','owner_ref','ledger_ref','account_id','peer_uid'):
            result=self.transports[A1].exchange({'v':1,'op':'snapshot',field:'bob'})
            self.assertFalse(result['ok'])
        for attr,value in (('token',TOKENS[B1]),('authority_id',self.transports[B1].authority_id),('endpoint','/v2/wallet')):
            old=getattr(self.transports[A1],attr);setattr(self.transports[A1],attr,value)
            try:
                result=self.transports[A1].exchange({'v':1,'op':'snapshot'})
                self.assertFalse(result['ok'])
            finally:setattr(self.transports[A1],attr,old)
        for device in (A1,B1):
            after=self.call(device,'snapshot')
            for key in ('available_minor','pending_minor','held_minor','billed_minor'):
                self.assertEqual(after[key],before[device][key])

    def test_revoked_transport_blocks_cached_receipt_but_other_devices_keep_their_contracts(self):
        for device in (A1,A2,B1):self.register_activate(device)
        self.credit('alice',5000);self.credit('bob',8000)
        self.call(A1,'snapshot')
        self.router.revoke_device_credential(A1,1)
        with self.assertRaises(PermissionError):self.clients[A1].dispatch({'v':1,'op':'snapshot'},peer_uid=1002)
        self.assertEqual(self.call(A2,'snapshot')['available_minor'],5000)
        self.assertEqual(self.call(B1,'snapshot')['available_minor'],8000)

    def test_real_tls_commit_lost_to_proxy_replays_once_after_complete_managed_restart(self):
        for device in (A1,A2,B1):self.register_activate(device)
        self.credit('alice',5000);self.credit('bob',8000)
        quote=self.call(A1,'wallet.atm.quote',key='lost-quote',issue_key='lost-issue',amount_minor=1000,atm_id='SIM-ATM-001')
        credential=self.authenticators[A1].get_assertion(quote['options'],'0000','lost-get')
        request={'v':1,'op':'wallet.atm.issue','key':'lost-issue','quote_id':quote['quote_id'],'credential':credential}
        original=self.transports[A1].exchange;observed=[]
        def discard_after_real_reply(payload):
            reply=original(payload);observed.append(reply)
            raise BackendUnavailable('explicit test discards the real TLS reply after commit')
        self.transports[A1].exchange=discard_after_real_reply
        try:
            with self.assertRaises(BackendUnavailable):self.clients[A1].dispatch(request,peer_uid=1002)
        finally:self.transports[A1].exchange=original
        self.assertEqual(len(observed),1);self.assertTrue(observed[0]['ok'])
        self.assertEqual(self.call(A2,'snapshot')['held_minor'],1000)
        old={owner:runtime.identity() for owner,runtime in self.runtimes.items()};port=self.server.server_port
        for client in self.clients.values():client.close()
        self.server.shutdown();self.thread.join(5);self.assertFalse(self.thread.is_alive());self.server.server_close();self.server=None
        self.coordinator.close()
        self.coordinator=AuthorityFenceCoordinator(self.root/'coordinator')
        self.router=OwnerRouter(self.root/'router',self.credentials,clock=lambda:self.now)
        self.runtimes={}
        for owner in ('alice','bob'):
            self.runtimes[owner]=ContractRuntime.open_active('ledger-'+owner,coordinator=self.coordinator,
                provisioning_file=self.root/(owner+'-handoff.json'),verifier=self.router,clock=lambda:self.now)
        self.server=ManagedWalletBackendServer(('127.0.0.1',port),router=self.router,
            runtimes=tuple(self.runtimes.values()),start_scheduler=False,timeout=3)
        self.thread=threading.Thread(target=self.server.serve_forever,kwargs={'poll_interval':.01});self.thread.start()
        for device in DEVICE_OWNER:
            self.clients[device]=RemoteWalletService(self.root/(device+'-cache'),self.transports[device],clock=lambda:self.now)
        self.assertEqual(self.clients[A1].dispatch(request,peer_uid=1002),observed[0])
        self.assertIsNone(self.clients[A1]._pending())
        for owner,runtime in self.runtimes.items():
            identity=runtime.identity()
            self.assertEqual(identity.account_id,old[owner].account_id)
            self.assertEqual(identity.descriptor.ledger_uuid,old[owner].descriptor.ledger_uuid)
            self.assertEqual(identity.descriptor.wallet_authority_id,old[owner].descriptor.wallet_authority_id)
        self.assertEqual((self.call(A2,'snapshot')['held_minor'],self.call(B1,'snapshot')['held_minor']),(1000,0))
        self.assertEqual(len(self.call(A1,'snapshot')['withdrawals']),1)

    def test_one_owner_authenticator_revocation_does_not_disable_other_purchased_devices(self):
        _,enrolled=self.register_activate(A1)
        self.register_activate(A2);self.register_activate(B1)
        self.credit('alice',5000);self.credit('bob',8000)
        self.runtimes['alice'].revoke_credential(enrolled['credential_id'],'fixed-management-revoke')
        denied=self.transports[A1].exchange({'v':1,'op':'wallet.atm.quote','key':'revoked-quote',
            'issue_key':'revoked-issue','amount_minor':1000,'atm_id':'SIM-ATM-001'})
        self.assertFalse(denied['ok'])
        self.assertEqual(self.issue(A2,1000)['amount_minor'],1000)
        self.assertEqual(self.issue(B1,2000)['amount_minor'],2000)


if __name__=='__main__':unittest.main()

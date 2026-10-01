"""Reusable disposable current-API continuity fixture, never production bootstrap.

The real OwnerRouter exists before C records its identity. Legacy population
uses the actual v1 TLS listener; game/owner operations use the actual managed
listener. One explicit lost-bill callback raises only after a real debit commit.
The caller owns the temporary root and decides when to remove evidence.
"""
from contextlib import closing
from datetime import datetime, timezone
import copy
import http.client
import json
from pathlib import Path
import sqlite3
import ssl
import threading
import time
import uuid
from unittest.mock import patch

from entitlement.protocol import PUBLIC_TOKENS, sign_fixture_event
from wallet_auth.fixture import SoftwareTestAuthenticator
from wallet_backend.authority_fence import AuthorityFenceCoordinator
from wallet_backend.adopt_legacy import inspect_legacy, original_tables
from wallet_backend.contract_runtime import ContractRuntime
from wallet_backend.runtime_contracts import FreshContractSpec
from wallet_backend.owner_router import OwnerRouter
from wallet_backend.server import WalletBackendServer, ManagedWalletBackendServer
from wallet_backend.client import HTTPSWalletTransport
from game_exchange import protocol as gp
from game_exchange.connections import GameGateway
from game_exchange.fixture import PublicGameAuthority

ROOT=Path(__file__).resolve().parents[1]
A1='fixture-rock-arm64-001'
A2='fixture-legacy-game-alice-2'
B1='fixture-legacy-game-bob-1'
DEVICE_OWNER={A1:'alice',A2:'alice',B1:'bob'}
TOKENS={device:'PUBLIC-FIXTURE-LEGACY-GAME-'+device+'-v1' for device in DEVICE_OWNER}
AUTH_TERMS='rock-wallet-development/1'
MONTHLY_TERMS='simulator-monthly-usd-8.88-v1'


def rows(path,table):
    if table not in ('wallet_auth_credentials','wallet_auth_credential_state','wallet_auth_quotes','wallet_auth_approvals',
        'wallet_auth_terms','wallet_idempotency','wallet_journals','wallet_postings','wallet_bills','wallet_withdrawals',
        'wallet_sales','wallet_consents','wallet_game_consents','authorizations','authorization_claims','device_api_receipts',
        'device_monthly_due','extra_business_evidence'):
        raise ValueError('fixed fixture table inventory required')
    with closing(sqlite3.connect(path)) as db:
        db.row_factory=sqlite3.Row
        return [dict(row) for row in db.execute('SELECT * FROM '+table)]


class LegacyGameBasis:
    """Explicit phases allow later current-copy/restore tests to reuse the basis."""
    def __init__(self,root):
        self.root=Path(root);self.now=1788856800;self.counter=0
        self.state=self.root/'legacy';self.server=None;self.thread=None
        self.runtimes={};self.transports={};self.authenticators={};self.authorities=[];self.gateway=None
        self.coordinator=None;self.router=None
        self.credentials=self.root/'device-credentials.json'
        self.credentials.write_text(json.dumps({'schema_version':3,'kind':'public-development-owner-device-credentials','devices':[
            {'ledger_ref':'legacy-alice' if owner=='alice' else 'current-bob','owner_actor':owner,'owner_ref':'fixture-owner-'+owner,
             'device_ref':device,'credential_revision':1,'active':True,'expires_at':self.now+7776000,'token':TOKENS[device]}
            for device,owner in DEVICE_OWNER.items()]}));self.credentials.chmod(0o600)
        try:
            self.router=OwnerRouter(self.root/'owner-router',self.credentials,clock=lambda:self.now)
            self.coordinator=AuthorityFenceCoordinator(self.root/'coordinator')
            self.coordinator.bind_owner_registry(*self.router.registry_identity())
            self.original_router_identity=self.router.registry_identity()
        except BaseException:self.close();raise

    def serve(self,server):
        if self.server is not None:raise RuntimeError('fixture already has a listener')
        self.server=server
        self.thread=threading.Thread(target=server.serve_forever,kwargs={'poll_interval':.01})
        self.thread.start()

    def stop_listener(self):
        if self.server is not None:
            if self.thread is not None and self.thread.is_alive():
                self.server.shutdown();self.thread.join(5)
                if self.thread.is_alive():raise RuntimeError('actual fixture listener did not stop')
            self.server.server_close();self.server=None;self.thread=None

    def token_file(self,name,value):
        path=self.root/name;path.write_text(value);path.chmod(0o600);return path

    def make_transport(self,device,authority,*,legacy=False):
        token=PUBLIC_TOKENS['alice'] if legacy else TOKENS[device]
        return HTTPSWalletTransport('https://127.0.0.1:'+str(self.server.server_port),
            ROOT/'os/registry/fixtures/development-ca.pem',self.token_file(('legacy' if legacy else device)+'-token',token),
            authority_id=authority,timeout=3,**({} if legacy else {'device_ref':device,'protocol_version':3}))

    def owner_transport(self,device):return self.transports[device]

    def call(self,device,op,**fields):
        self.counter+=1
        request={'v':1,'op':op,**fields}
        if op not in ('snapshot','wallet.membership','wallet.billing.status','wallet.auth.status','wallet.atm.status'):
            request.setdefault('key','basis-call-'+str(self.counter))
        reply=self.owner_transport(device).exchange(request)
        if reply.get('ok') is not True:raise AssertionError(reply)
        return reply.get('result',reply.get('snapshot'))

    def create_legacy(self):
        if self.runtimes or self.server:raise RuntimeError('legacy creation is a one-time phase')
        self.serve(WalletBackendServer(('127.0.0.1',0),self.state,start_scheduler=False,clock=lambda:self.now))
        self.legacy_authority=self.server.authority_id
        self.transports[A1]=self.make_transport(A1,self.legacy_authority,legacy=True)
        auth=SoftwareTestAuthenticator(self.root/'auth-original',A1);self.authenticators[A1]=auth
        self.legacy_register_request={'v':1,'op':'wallet.register','key':'legacy-register'}
        self.legacy_register_reply=self.owner_transport(A1).exchange(self.legacy_register_request)
        if self.legacy_register_reply.get('ok') is not True:raise AssertionError(self.legacy_register_reply)
        self.legacy_account=self.legacy_register_reply['result']['account_id']
        begin=self.call(A1,'wallet.auth.begin',key='legacy-enroll-begin')
        credential=auth.make_credential(begin['options'],'0000','legacy-create')
        enrolled=self.call(A1,'wallet.auth.enroll',key='legacy-enroll',challenge_id=begin['challenge_id'],credential=credential)
        self.legacy_credential=enrolled['credential_id']
        self.call(A1,'wallet.terms',key='legacy-auth-terms',accepted=True,terms_version=AUTH_TERMS)
        wallet=self.server.service.wallet
        sale=wallet.simulate_sale(5000,'legacy-credit');wallet.settle_sale(sale['id'],'legacy-settle')
        wallet.simulate_sale(237,'legacy-pending')
        self.call(A1,'wallet.consent',key='legacy-monthly-consent',accepted=True,terms_version=MONTHLY_TERMS)
        real_bill=wallet.bill
        def lose_after_real_commit(*args,**kwargs):
            real_bill(*args,**kwargs)
            raise OSError('PUBLIC FIXTURE: actual bill committed; its acknowledgement is lost')
        with patch.object(wallet,'bill',side_effect=lose_after_real_commit):
            try:self.server.service.membership.tick()
            except OSError:pass
            else:raise AssertionError('real monthly commit interruption was not reached')
        quote=self.call(A1,'wallet.atm.quote',key='legacy-hold-quote',issue_key='legacy-hold',amount_minor=1000,atm_id='SIM-ATM-001')
        assertion=auth.get_assertion(quote['options'],'0000','legacy-atm-assertion')
        self.legacy_issue_request={'v':1,'op':'wallet.atm.issue','key':'legacy-hold','quote_id':quote['quote_id'],'credential':assertion}
        self.legacy_issue_reply=self.owner_transport(A1).exchange(self.legacy_issue_request)
        if self.legacy_issue_reply.get('ok') is not True:raise AssertionError(self.legacy_issue_reply)
        self.legacy_hold=self.legacy_issue_reply['result']['withdrawal_id']
        self.call(A1,'wallet.atm.quote',key='legacy-unresolved-quote',issue_key='legacy-unresolved',amount_minor=1000,atm_id='SIM-ATM-001')
        self.server.service.authentication.revoke_credential(self.legacy_credential,'legacy-revocation')
        with self.server.service.membership.store._transaction() as db:
            db.execute('CREATE TABLE extra_business_evidence (label TEXT PRIMARY KEY, value BLOB NOT NULL)')
            db.execute('INSERT INTO extra_business_evidence VALUES (?,?)',('retained-opaque',b'\x00legacy-game\xff\x80'))
        self.legacy_snapshot=wallet.snapshot()
        self.retry_seconds=self.server.service.membership.retry_seconds
        self.stop_listener()
        self.legacy_tables=self.original_tables()
        self.legacy_wallet_keys={row['key'] for row in rows(self.state/'wallet-simulator.db','wallet_idempotency')}
        self.legacy_device_keys={row['key'] for row in rows(self.state/'entitlement.db','device_api_receipts')}
        self.legacy_business=self._alice_business()
        if self.legacy_business['monthly_authorization']['state']!='CLAIMED':raise AssertionError('unresolved existing bill was not retained')

    def original_tables(self):
        return {name:original_tables(self.state/name) for name in ('wallet-simulator.db','entitlement.db')}

    def event(self,device):
        owner=DEVICE_OWNER[device]
        return sign_fixture_event('fulfillment','basis-handoff-'+device,'device:'+device,1,self.now,'handoff',
            {'device_ref':device,'owner_ref':'fixture-owner-'+owner,'purchase_ref':'fixture-basis-purchase-'+device,
             'verification_ref':'fixture-basis-verification-'+device,'verified_at':self.now,'valid_until':self.now+7776000})

    def adopt(self):
        if self.router.registry_identity()!=self.original_router_identity:raise AssertionError('owner registry was replaced')
        self.spec=FreshContractSpec('legacy-alice',self.state,'alice','fixture-owner-alice',A1)
        self.plan=inspect_legacy(self.coordinator,self.spec,migration_id=str(uuid.uuid4()))
        self.runtimes['alice']=ContractRuntime.open_adopted(self.plan,coordinator=self.coordinator,
            provisioning_file=ROOT/'os/entitlement/fixtures/device-handoff.json',verifier=self.router,clock=lambda:self.now)
        handoff=self.root/'bob-handoff.json';handoff.write_text(json.dumps({'schema_version':1,'kind':'public-development-fixture','events':[self.event(B1)]}));handoff.chmod(0o600)
        self.runtimes['bob']=ContractRuntime.open_fresh(FreshContractSpec('current-bob',self.root/'bob','bob','fixture-owner-bob',B1),
            coordinator=self.coordinator,provisioning_file=handoff,verifier=self.router,clock=lambda:self.now)

    def start_managed(self):
        self.runtimes['alice'].ingest_fulfillment(self.event(A2))
        self.authorities=[PublicGameAuthority(self.root/('game-'+name),name,clock=lambda:self.now) for name in ('a','b')]
        self.gateway=GameGateway(self.root/'game-index',tuple(self.authorities),clock=lambda:self.now)
        self.serve(ManagedWalletBackendServer(('127.0.0.1',0),router=self.router,runtimes=tuple(self.runtimes.values()),
            game_gateway=self.gateway,start_scheduler=False,timeout=3))
        for device,owner in DEVICE_OWNER.items():
            self.transports[device]=self.make_transport(device,self.runtimes[owner].descriptor.wallet_authority_id)

    def activate_new_devices(self):
        for device in (A2,B1):
            account=self.call(device,'wallet.register',key='same-new-register')
            if device==A2 and account['account_id']!=self.legacy_account:raise AssertionError('adoption changed account')
            if device==B1 and account['account_id']==self.legacy_account:raise AssertionError('Bob reused Alice account')
            auth=SoftwareTestAuthenticator(self.root/('auth-'+device),device);self.authenticators[device]=auth
            begin=self.call(device,'wallet.auth.begin',key='same-auth-begin')
            credential=auth.make_credential(begin['options'],'0000','same-create')
            self.call(device,'wallet.auth.enroll',key='same-auth-enroll',challenge_id=begin['challenge_id'],credential=credential)
            self.call(device,'wallet.terms',key='same-wallet-terms',accepted=True,terms_version=AUTH_TERMS)
        sale=self.runtimes['bob'].seed_fixture_sale(8000,'same-bob-credit');self.runtimes['bob'].settle_fixture_sale(sale['id'],'same-bob-settle')
        self.call(B1,'wallet.consent',key='bob-monthly-declined',accepted=False,terms_version=MONTHLY_TERMS)

    def begin_request(self,device,game,key):
        authority=next(a for a in self.authorities if a.name==game)
        proof=authority.proof(authority.public_session(DEVICE_OWNER[device]),{'v':1,'op':'connection.proof','key':key,
            'audience':self.transports[device].authority_id,'scopes':list(gp.SCOPES)})
        return {'v':1,'op':'game.connection.begin','key':key,'proof':proof,'scopes':list(gp.SCOPES),
            'terms_version':gp.TERMS,'connection_expires_at':self.now+3600}

    def author(self,game,request):
        authority=next(a for a in self.authorities if a.name==game)
        context=ssl.create_default_context(cafile=str(ROOT/'os/registry/fixtures/development-ca.pem'))
        conn=http.client.HTTPSConnection('127.0.0.1',self.server.server_port,context=context,timeout=3)
        try:
            conn.request('POST','/v1/game',gp.canonical(request),headers={'Authorization':'Bearer '+authority.public_author_token,
                'X-Rock-Game':authority.game.game_id,'Content-Type':'application/json','Connection':'close'})
            response=conn.getresponse();raw=response.read(65537)
            if len(raw)>65536:raise AssertionError('unbounded author reply')
            if response.status==200 and response.headers.get_all('X-Rock-Game')!=[authority.game.game_id]:raise AssertionError('wrong game ack')
            return gp.decode(raw)
        finally:conn.close()

    def connect_four(self):
        self.connections={};self.connection_requests={};before=self.business_evidence()
        for device in (A2,B1):
            for game in ('a','b'):
                begin=self.owner_transport(device).exchange(self.begin_request(device,game,'same-begin-'+game))
                if begin.get('ok') is not True:raise AssertionError(begin)
                intent=begin['result'];credential=self.authenticators[device].get_game_assertion(intent,'0000','same-game-'+game)
                request={'v':1,'op':'game.connection.approve','key':'same-approve-'+game,'intent_id':intent['binding']['intent_id'],
                    'challenge_id':intent['challenge_id'],'binding_sha256':intent['binding_sha256'],'credential':credential}
                reply=self.owner_transport(device).exchange(request)
                if reply.get('ok') is not True or self.owner_transport(device).exchange(request)!=reply:raise AssertionError('approval/replay did not return immutable consent')
                self.connections[(device,game)]=reply['result'];self.connection_requests[(device,game)]=request
                connection=reply['result']['binding']['connection_id']
                for queried in ('a','b'):
                    result=self.author(queried,{'v':1,'op':'connection.status','connection_id':connection})
                    if result['ok'] is not (queried==game):raise AssertionError('author/game route scope mismatch')
                foreign=A2 if device==B1 else B1
                if self.owner_transport(foreign).exchange({'v':1,'op':'game.connection.status','connection_id':connection})['ok']:
                    raise AssertionError('foreign owner connection was disclosed')
        # Active authenticator counters legitimately advance; legacy financial
        # evidence and the old revoked authenticator must remain exactly equal.
        if self.business_evidence()!=before:raise AssertionError('connection work changed existing business evidence')
        return copy.deepcopy(self.connections)

    def _alice_business(self,state=None):
        state=self.state if state is None else Path(state)
        wallet=state/'wallet-simulator.db';entitlement=state/'entitlement.db'
        credentials=rows(wallet,'wallet_auth_credentials');states=rows(wallet,'wallet_auth_credential_state')
        return {'journals':rows(wallet,'wallet_journals'),'postings':rows(wallet,'wallet_postings'),
            'bills':rows(wallet,'wallet_bills'),'holds':rows(wallet,'wallet_withdrawals'),'sales':rows(wallet,'wallet_sales'),
            'legacy_credential':next(row for row in credentials if row['credential_id']==self.legacy_credential),
            'legacy_credential_state':next(row for row in states if row['credential_id']==self.legacy_credential),
            'legacy_quotes': [row for row in rows(wallet,'wallet_auth_quotes') if row['device_id']==A1],
            'legacy_approvals':rows(wallet,'wallet_auth_approvals'),
            'legacy_wallet_consents':rows(wallet,'wallet_consents'),
            'legacy_auth_terms':[row for row in rows(wallet,'wallet_auth_terms') if row['credential_id']==self.legacy_credential],
            'legacy_wallet_receipts':[row for row in rows(wallet,'wallet_idempotency') if row['key'] in self.legacy_wallet_keys],
            'legacy_device_receipts':[row for row in rows(entitlement,'device_api_receipts') if row['key'] in self.legacy_device_keys],
            'monthly_authorization':rows(entitlement,'authorizations')[0],
            'monthly_claims':rows(entitlement,'authorization_claims'),'opaque_blob':rows(entitlement,'extra_business_evidence')}

    def business_evidence(self):
        result={}
        for owner,runtime in self.runtimes.items():
            with runtime.admit_write(runtime.descriptor.writer_epoch):
                if owner=='alice':result[owner]=self._alice_business(runtime.descriptor.canonical_state)
                else:
                    result[owner]={name:rows(runtime.descriptor.canonical_state/'wallet-simulator.db',name) for name in
                        ('wallet_journals','wallet_postings','wallet_bills','wallet_withdrawals','wallet_sales')}
        return result

    def game_counts(self):
        result={}
        for owner,runtime in self.runtimes.items():
            with runtime.admit_write(runtime.descriptor.writer_epoch):
                result[owner]=len(rows(runtime.descriptor.canonical_state/'wallet-simulator.db','wallet_game_consents'))
        return result

    def reconcile_existing_month(self):
        self.now+=self.retry_seconds+1
        for runtime in self.runtimes.values():runtime.start_scheduler()
        deadline=time.monotonic()+3
        while self.business_evidence()['alice']['monthly_authorization']['state']!='PAID':
            if time.monotonic()>=deadline:raise AssertionError('actual scheduler did not reconcile the existing CLAIMED bill')
            time.sleep(.01)
        period=datetime.fromtimestamp(self.now,timezone.utc).strftime('%Y-%m')
        request={'v':1,'op':'wallet.bill','key':'same-month-after-adopt','period':period}
        first=self.owner_transport(A2).exchange(request)
        if first.get('ok') is not True or self.owner_transport(A2).exchange(request)!=first:raise AssertionError('same-month acceptance not idempotent')
        # Monthly eligibility is contract-wide: A2 is active and the original
        # owner consent remains. A1's WebAuthn revocation does not revoke its
        # owner transport or duplicate the same contract's monthly schedule.
        if self.owner_transport(A1).exchange(request)!=first:raise AssertionError('same-owner monthly receipt changed across devices')
        # The same actual scheduler owns any wake-up from those HTTP requests.
        # Final assertions hold each contract's real admission while reading.

    def assert_retained(self,test,*,claimed):
        current=self.business_evidence()['alice'];expected=copy.deepcopy(self.legacy_business)
        authorization=current.pop('monthly_authorization');old=expected.pop('monthly_authorization')
        test.assertEqual(current,expected)
        test.assertEqual(authorization['state'],'CLAIMED' if claimed else 'PAID')
        if not claimed:
            test.assertEqual(authorization['wallet_bill_id'],self.legacy_business['bills'][0]['id'])
            authorization=dict(authorization,state='CLAIMED',wallet_bill_id=old['wallet_bill_id'])
        test.assertEqual(authorization,old)
        snapshot=self.call(A2,'snapshot')
        for field in ('available_minor','pending_minor','held_minor','billed_minor'):
            test.assertEqual(snapshot[field],self.legacy_snapshot[field])
        test.assertEqual(len(snapshot['bills']),1);test.assertEqual(snapshot['withdrawals'][0]['id'],self.legacy_hold)
        test.assertEqual(self.router.registry_identity(),self.original_router_identity)

    def close(self):
        self.stop_listener()
        for runtime in self.runtimes.values():runtime.close()
        if self.router is not None:self.router.close()
        if self.gateway is not None:self.gateway.close()
        for authority in self.authorities:authority.close()
        for auth in self.authenticators.values():auth.close()
        if self.coordinator is not None:self.coordinator.close()

"""Real A/B/C managed runtimes, one TLS listener, three public test devices.

No fake coordinator/permit, local ledger fallback, QEMU or real-money claim.
Requires the separately integrated A runtime and C authority fence modules.
"""
from concurrent.futures import ThreadPoolExecutor
import http.client
import ssl
import sqlite3
from contextlib import closing
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
from game_exchange import protocol as gp
from game_exchange.connections import GameGateway, namespace, encoded
from game_exchange.fixture import PublicGameAuthority, PublicReceiptSigner

A1,A2,B1='fixture-gx00-alice-1','fixture-gx00-alice-2','fixture-gx00-bob-1'
DEVICE_OWNER={A1:'alice',A2:'alice',B1:'bob'}
TOKENS={device:'PUBLIC-FIXTURE-GX00-'+device+'-v1' for device in DEVICE_OWNER}
TERMS='rock-wallet-development/1'
MONTHLY='simulator-monthly-usd-8.88-v1'


class GameConnectionsTLS(unittest.TestCase):
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
        self.authorities=[PublicGameAuthority(self.root/('game-'+name),name,clock=lambda:self.now) for name in ('a','b')]
        self.gateway=GameGateway(self.root/'game-index',tuple(self.authorities),clock=lambda:self.now)
        self.server=ManagedWalletBackendServer(('127.0.0.1',0),router=self.router,game_gateway=self.gateway,
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
        for authority in getattr(self,'authorities',[]):authority.close()

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

    def author(self,name,request):
        authority=next(a for a in self.authorities if a.name==name)
        context=ssl.create_default_context(cafile=str(ROOT/'os/registry/fixtures/development-ca.pem'))
        conn=http.client.HTTPSConnection('127.0.0.1',self.server.server_port,context=context,timeout=3)
        try:
            conn.request('POST','/v1/game',gp.canonical(request),headers={'Authorization':'Bearer '+authority.public_author_token,
                'X-Rock-Game':authority.game.game_id,'Content-Type':'application/json','Connection':'close'})
            response=conn.getresponse();body=response.read(65537)
            self.assertLessEqual(len(body),65536)
            if response.status==200:self.assertEqual(response.headers.get_all('X-Rock-Game'),[authority.game.game_id])
            return gp.decode(body)
        finally:conn.close()

    def owner(self,device,op,**fields):
        return self.transports[device].exchange({'v':1,'op':'game.connection.'+op,**fields})

    def begin(self,device,game='a',player=None,key='same-key'):
        authority=self.authorities[0 if game=='a' else 1]
        session=authority.public_session(player or DEVICE_OWNER[device])
        proof=authority.proof(session,{'v':1,'op':'connection.proof','key':key,
            'audience':self.transports[device].authority_id,'scopes':list(gp.SCOPES)})
        return self.owner(device,'begin',key=key,proof=proof,scopes=list(gp.SCOPES),
            terms_version=gp.TERMS,connection_expires_at=self.now+3600)

    def approve(self,device,intent,key='same-approve'):
        credential=self.authenticators[device].get_game_assertion(intent,'0000','game-'+key)
        req={'v':1,'op':'game.connection.approve','key':key,'intent_id':intent['binding']['intent_id'],
             'challenge_id':intent['challenge_id'],'binding_sha256':intent['binding_sha256'],'credential':credential}
        return req,self.transports[device].exchange(req)

    def test_two_authors_two_games_three_devices_and_no_wallet_mutation(self):
        for device in (A1,A2,B1):self.register_activate(device)
        before={owner:self.call(device,'snapshot') for owner,device in (('alice',A1),('bob',B1))}
        connections={}
        for device in (A1,B1):
            for game in ('a','b'):
                begun=self.begin(device,game,key='begin-'+game);self.assertTrue(begun['ok'],begun)
                req,reply=self.approve(device,begun['result'],key='approve-'+game)
                self.assertTrue(reply['ok'],reply);connections[(device,game)]=reply['result']['binding']['connection_id']
                self.assertEqual(self.transports[device].exchange(req),reply)
        self.assertEqual(len(set(connections.values())),4)
        for (device,game),connection in connections.items():
            author=self.author(game,
                {'v':1,'op':'connection.status','connection_id':connection})
            self.assertTrue(author['ok'],author)
            self.assertEqual(author['result']['player_id'],DEVICE_OWNER[device])
            self.assertNotIn('owner_ref',gp.canonical(author).decode())
            self.assertFalse(self.author('b' if game=='a' else 'a',
                {'v':1,'op':'connection.status','connection_id':connection})['ok'])
            foreign=B1 if device==A1 else A1
            self.assertFalse(self.owner(foreign,'status',connection_id=connection)['ok'])
        self.assertTrue(self.owner(A2,'status',connection_id=connections[(A1,'a')])['ok'])
        for owner,device in (('alice',A1),('bob',B1)):
            after=self.call(device,'snapshot')
            for field in ('available_minor','pending_minor','held_minor','billed_minor'):
                self.assertEqual(after[field],before[owner][field])

    def test_real_consent_signature_wrong_device_and_unknown_commit_recovery(self):
        for device in (A1,A2,B1):self.register_activate(device)
        begun=self.begin(A1);self.assertTrue(begun['ok'],begun);intent=begun['result']
        self.assertFalse(self.begin(B1,player='alice',key='different-proof')['ok'])
        self.assertRaises(ValueError,self.authenticators[A1].get_assertion,intent['options'],'0000','atm-confusion')
        original=self.gateway.index.publish
        def lost(*args,**kwargs):raise RuntimeError('fixed test interruption after real Wallet consent commit')
        self.gateway.index.publish=lost
        try:
            with self.assertRaises(BackendUnavailable):
                self.approve(A1,intent)
            credential=self.authenticators[A1].get_game_assertion(intent,'0000','game-same-approve')
            req={'v':1,'op':'game.connection.approve','key':'same-approve','intent_id':intent['binding']['intent_id'],
                'challenge_id':intent['challenge_id'],'binding_sha256':intent['binding_sha256'],'credential':credential}
        finally:self.gateway.index.publish=original
        recovered=self.transports[A1].exchange(req);self.assertTrue(recovered['ok'],recovered)
        self.assertEqual(self.transports[A1].exchange(req),recovered)
        changed=dict(req,key='another-key')
        self.assertFalse(self.transports[A1].exchange(changed)['ok'])
        revoked=self.owner(A2,'revoke',key='revoke',connection_id=intent['binding']['connection_id'])
        self.assertTrue(revoked['ok'],revoked)
        self.assertEqual(self.owner(A1,'status',connection_id=intent['binding']['connection_id'])['result']['current_state'],'REVOKED')
        self.gateway.revoke_author('a',1)
        self.assertFalse(self.author('a',
            {'v':1,'op':'connection.status','connection_id':intent['binding']['connection_id']})['ok'])

    def counts(self,owner):
        runtime=self.runtimes[owner]
        with runtime.admit_write(runtime.descriptor.writer_epoch),runtime._service.wallet._transaction() as db:
            result={table:db.execute('SELECT count(*) FROM '+table).fetchone()[0] for table in
                ('wallet_game_intents','wallet_game_consents','wallet_game_heads','wallet_journals','wallet_bills','wallet_withdrawals')}
            result['counters']=[row[0] for row in db.execute('SELECT record_json FROM wallet_auth_credential_state ORDER BY credential_id')]
            return result

    def restart(self):
        for client in self.clients.values():client.close()
        self.clients={}
        self.server.shutdown();self.thread.join(5);self.assertFalse(self.thread.is_alive())
        self.server.server_close();self.server=None
        self.coordinator.close();self.coordinator=None
        for authority in self.authorities:authority.close()
        self.authorities=[]
        self.coordinator=AuthorityFenceCoordinator(self.root/'coordinator')
        self.router=OwnerRouter(self.root/'router',self.credentials,clock=lambda:self.now)
        self.runtimes={owner:ContractRuntime.open_active('ledger-'+owner,coordinator=self.coordinator,
            provisioning_file=self.root/(owner+'-handoff.json'),verifier=self.router,clock=lambda:self.now) for owner in ('alice','bob')}
        self.authorities=[PublicGameAuthority(self.root/('game-'+name),name,clock=lambda:self.now) for name in ('a','b')]
        self.gateway=GameGateway(self.root/'game-index',tuple(self.authorities),clock=lambda:self.now)
        self.server=ManagedWalletBackendServer(('127.0.0.1',0),router=self.router,runtimes=tuple(self.runtimes.values()),
            game_gateway=self.gateway,start_scheduler=False,timeout=3)
        self.thread=threading.Thread(target=self.server.serve_forever,kwargs={'poll_interval':.01});self.thread.start()
        for device in DEVICE_OWNER:
            transport=self.transports[device];transport.port=self.server.server_port
            # Fresh test proxy directory: real server authority/device acknowledgements remain pinned.
            self.clients[device]=RemoteWalletService(self.root/(device+'-restart-cache'),transport,clock=lambda:self.now)

    def test_complete_restart_retains_exact_consent_and_counter_once(self):
        for device in (A1,A2,B1):self.register_activate(device)
        intent=self.begin(A1)['result'];request,reply=self.approve(A1,intent)
        self.assertTrue(reply['ok'],reply);before=self.counts('alice')
        self.now+=1;self.restart()
        self.assertEqual(self.transports[A1].exchange(request),reply)
        self.assertEqual(self.counts('alice'),before)
        connection=intent['binding']['connection_id']
        self.assertTrue(self.author('a',{'v':1,'op':'connection.status','connection_id':connection})['ok'])
        self.assertFalse(self.transports[A2].exchange(request)['ok'])
        self.assertTrue(self.owner(A2,'reconcile',key='same-reconcile',intent_id=intent['binding']['intent_id'])['ok'])
        first=self.owner(A2,'reconcile',key='same-reconcile',intent_id=intent['binding']['intent_id'])
        self.now+=1
        self.assertEqual(first,self.owner(A2,'reconcile',key='same-reconcile',intent_id=intent['binding']['intent_id']))
        self.assertEqual(self.counts('alice'),before)

    def shared_key_consent(self,game,*,player='alice',begin_key='cross-game-key'):
        begun=self.begin(A1,game,player=player,key=begin_key);self.assertTrue(begun['ok'],begun)
        intent=begun['result']
        credential=self.authenticators[A1].get_game_assertion(intent,'0000','ceremony-'+game+'-'+player)
        request={'v':1,'op':'game.connection.approve','key':'cross-game-key','intent_id':intent['binding']['intent_id'],
            'challenge_id':intent['challenge_id'],'binding_sha256':intent['binding_sha256'],'credential':credential}
        approved=self.transports[A1].exchange(request);self.assertTrue(approved['ok'],approved)
        return intent,approved['result']

    def test_reconcile_same_key_different_games_restart_and_changed_same_game_rejected(self):
        self.register_activate(A1)
        results={}
        for game in ('a','b'):
            intent,consent=self.shared_key_consent(game)
            request={'v':1,'op':'game.connection.reconcile','key':'shared-reconcile','intent_id':intent['binding']['intent_id']}
            result=self.transports[A1].exchange(request)
            self.assertEqual(result,{'ok':True,'result':consent});results[game]=(request,result)
        changed,_=self.shared_key_consent('a',player='bob',begin_key='another-player')
        denied=self.transports[A1].exchange(dict(results['a'][0],intent_id=changed['binding']['intent_id']))
        self.assertFalse(denied['ok'],denied)
        before=self.counts('alice');self.restart()
        for request,result in results.values():self.assertEqual(self.transports[A1].exchange(request),result)
        self.assertEqual(self.counts('alice'),before)

    def test_legacy_reconcile_receipt_exact_replay_retained_and_other_game_namespace_migrates(self):
        self.register_activate(A1)
        intent,consent=self.shared_key_consent('a')
        request={'v':1,'op':'game.connection.reconcile','key':'legacy-shared-key','intent_id':intent['binding']['intent_id']}
        key=namespace('owner-reconcile',A1,request['op'],request['key'])
        runtime=self.runtimes['alice']
        # Literal previous-version namespace and receipt simulate a nonempty
        # pre-upgrade DB; the consent itself came through the real TLS route.
        with runtime.admit_write(runtime.descriptor.writer_epoch),runtime._service.wallet._transaction() as db:
            db.execute('INSERT INTO wallet_game_requests VALUES (?,?,?)',(key,encoded(request),encoded(consent)))
        self.restart()
        runtime=self.runtimes['alice']
        with runtime.admit_write(runtime.descriptor.writer_epoch),closing(runtime._service.wallet._connect()) as db:
            original=tuple(db.execute('SELECT * FROM wallet_game_requests WHERE key=?',(key,)).fetchone())
            schema=[tuple(row) for row in db.execute('SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY name')]
        self.assertEqual(self.transports[A1].exchange(request),{'ok':True,'result':consent})
        b,b_consent=self.shared_key_consent('b')
        b_request=dict(request,intent_id=b['binding']['intent_id'])
        self.assertEqual(self.transports[A1].exchange(b_request),{'ok':True,'result':b_consent})
        changed,_=self.shared_key_consent('a',player='bob',begin_key='another-player')
        self.assertFalse(self.transports[A1].exchange(dict(request,intent_id=changed['binding']['intent_id']))['ok'])
        self.restart();runtime=self.runtimes['alice']
        self.assertEqual(self.transports[A1].exchange(request),{'ok':True,'result':consent})
        self.assertEqual(self.transports[A1].exchange(b_request),{'ok':True,'result':b_consent})
        with runtime.admit_write(runtime.descriptor.writer_epoch),closing(runtime._service.wallet._connect()) as db:
            self.assertEqual(tuple(db.execute('SELECT * FROM wallet_game_requests WHERE key=?',(key,)).fetchone()),original)
            self.assertEqual([tuple(row) for row in db.execute('SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY name')],schema)
            self.assertEqual(db.execute('SELECT count(*) FROM wallet_game_requests').fetchone()[0],2)

    def test_parallel_shared_worker_routes_preserve_two_owner_game_scopes(self):
        for device in (A1,B1):self.register_activate(device)
        def run(device):
            begun=self.begin(device)['result'];request,reply=self.approve(device,begun)
            self.assertTrue(reply['ok'],reply);return begun,reply
        with ThreadPoolExecutor(max_workers=2) as pool:
            a=pool.submit(run,A1);b=pool.submit(run,B1);alice,bob=a.result(timeout=10),b.result(timeout=10)
        self.assertNotEqual(alice[1]['result']['binding']['account_id'],bob[1]['result']['binding']['account_id'])
        self.assertEqual(self.counts('alice')['wallet_game_consents'],1)
        self.assertEqual(self.counts('bob')['wallet_game_consents'],1)
        for _ in range(3):
            for device,pair in ((A1,alice),(B1,bob)):
                connection=pair[0]['binding']['connection_id']
                self.assertTrue(self.owner(device,'status',connection_id=connection)['ok'])
                self.assertFalse(self.owner(B1 if device==A1 else A1,'status',connection_id=connection)['ok'])

    def test_real_signature_tampering_expiry_and_extra_identity_fields_do_not_commit(self):
        for device in (A1,A2,B1):self.register_activate(device)
        intent=self.begin(A1)['result'];before=self.counts('alice')
        credential=self.authenticators[A1].get_game_assertion(intent,'0000','negative-real-signature')
        request={'v':1,'op':'game.connection.approve','key':'negative','intent_id':intent['binding']['intent_id'],
            'challenge_id':intent['challenge_id'],'binding_sha256':intent['binding_sha256'],'credential':credential}
        self.assertFalse(self.transports[A2].exchange(request)['ok'])
        self.assertFalse(self.transports[B1].exchange(request)['ok'])
        for field in ('owner_ref','account_id','device_ref','ledger_ref','authority_id','path'):
            self.assertFalse(self.transports[A1].exchange(dict(request,**{field:'foreign'}))['ok'])
        bad=copy.deepcopy(request);bad['credential']['response']['signature']=gp.b64(bytes(64))
        self.assertFalse(self.transports[A1].exchange(bad)['ok'])
        self.assertEqual(self.counts('alice'),before)
        self.now+=120
        self.assertFalse(self.transports[A1].exchange(request)['ok'])
        self.assertEqual(self.counts('alice'),before)
        self.assertFalse(self.begin(B1,player='alice',key='after-expiry-subject')['ok'])
        self.assertFalse(self.author('a',{'v':1,'op':'connection.status','connection_id':intent['binding']['connection_id']})['ok'])

    def test_scoped_cursor_and_current_revocation_do_not_reveal_other_game_or_owner(self):
        for device in (A1,A2,B1):self.register_activate(device)
        connections=[]
        for game in ('a','b'):
            begun=self.begin(A1,game,key='begin-'+game)['result'];_,reply=self.approve(A1,begun,key='approve-'+game)
            self.assertTrue(reply['ok'],reply);connections.append(begun['binding']['connection_id'])
        page=self.owner(A1,'list',limit=1,cursor=None);self.assertTrue(page['ok'],page)
        cursor=page['result']['next_cursor'];self.assertIsInstance(cursor,str)
        second=self.owner(A1,'list',limit=1,cursor=cursor);self.assertTrue(second['ok'],second)
        self.assertIsNone(second['result']['next_cursor'])
        for device,limit in ((A2,1),(B1,1),(A1,2)):
            self.assertFalse(self.owner(device,'list',limit=limit,cursor=cursor)['ok'])
        revoked=self.author('a',{'v':1,'op':'connection.revoke','key':'same-revoke','connection_id':connections[0]})
        self.assertTrue(revoked['ok'],revoked);self.assertEqual(revoked['result']['state'],'REVOKED')
        self.assertNotIn('player_id',revoked['result'])
        self.assertTrue(self.author('b',{'v':1,'op':'connection.status','connection_id':connections[1]})['ok'])
        self.gateway.revoke_author('a',1)
        self.assertFalse(self.author('a',{'v':1,'op':'connection.revoke','key':'same-revoke','connection_id':connections[0]})['ok'])
        self.assertTrue(self.author('b',{'v':1,'op':'connection.status','connection_id':connections[1]})['ok'])
        self.now+=121
        self.assertFalse(self.owner(A1,'list',limit=1,cursor=cursor)['ok'])

    def test_committed_reservation_without_wallet_intent_recovers_only_original_request(self):
        for device in (A1,B1):self.register_activate(device)
        authority=self.authorities[0]
        proof=authority.proof(authority.public_session('alice'),{'v':1,'op':'connection.proof','key':'reserved',
            'audience':self.transports[A1].authority_id,'scopes':list(gp.SCOPES)})
        request={'v':1,'op':'game.connection.begin','key':'reserved','proof':proof,'scopes':list(gp.SCOPES),
            'terms_version':gp.TERMS,'connection_expires_at':self.now+3600}
        original=self.gateway.index.reserve;saved=[]
        def interrupt(*args):
            original(*args);saved.append(copy.deepcopy(args[-1]));raise RuntimeError('fixed interruption after actual index reservation commit')
        self.gateway.index.reserve=interrupt
        try:
            with self.assertRaises(BackendUnavailable):self.transports[A1].exchange(request)
        finally:self.gateway.index.reserve=original
        self.assertEqual(self.counts('alice')['wallet_game_intents'],0)
        self.assertFalse(self.begin(B1,player='alice',key='different-player-proof')['ok'])
        recovered=self.transports[A1].exchange(request)
        self.assertEqual(recovered,{'ok':True,'result':saved[0]})
        self.assertEqual(self.counts('alice')['wallet_game_intents'],1)
        changed=dict(request,key='replacement-intent')
        self.assertFalse(self.transports[A1].exchange(changed)['ok'])

    def save_database(self,path,output):
        with closing(sqlite3.connect(path)) as source,closing(sqlite3.connect(output)) as target:source.backup(target)
        Path(output).chmod(0o600)

    def test_old_index_copy_cannot_erase_a_committed_wallet_subject_at_restart(self):
        for device in (A1,B1):self.register_activate(device)
        snapshot=self.root/'old-index.sqlite3';self.save_database(self.gateway.index.path/'game.sqlite3',snapshot)
        intent=self.begin(A1)['result'];_,reply=self.approve(A1,intent);self.assertTrue(reply['ok'],reply)
        self.server.shutdown();self.thread.join(5);self.server.server_close();self.server=None
        self.coordinator.close();self.coordinator=None
        index=self.root/'game-index'/'game.sqlite3';index.write_bytes(snapshot.read_bytes())
        for authority in self.authorities:authority.close()
        self.authorities=[]
        self.coordinator=AuthorityFenceCoordinator(self.root/'coordinator')
        self.router=OwnerRouter(self.root/'router',self.credentials,clock=lambda:self.now)
        self.runtimes={owner:ContractRuntime.open_active('ledger-'+owner,coordinator=self.coordinator,
            provisioning_file=self.root/(owner+'-handoff.json'),verifier=self.router,clock=lambda:self.now) for owner in ('alice','bob')}
        self.authorities=[PublicGameAuthority(self.root/('game-'+name),name,clock=lambda:self.now) for name in ('a','b')]
        self.gateway=GameGateway(self.root/'game-index',tuple(self.authorities),clock=lambda:self.now)
        with self.assertRaises(gp.VerificationUnavailable):
            ManagedWalletBackendServer(('127.0.0.1',0),router=self.router,runtimes=tuple(self.runtimes.values()),
                game_gateway=self.gateway,start_scheduler=False,timeout=3)
        self.assertFalse(self.gateway.capabilities()['connections'])

    def test_current_index_rejects_wallet_copy_predating_its_consent(self):
        for device in (A1,B1):self.register_activate(device)
        snapshot=self.root/'old-wallet.sqlite3';wallet=self.runtimes['alice']._service.wallet.path
        self.save_database(wallet,snapshot)
        intent=self.begin(A1)['result'];_,reply=self.approve(A1,intent);self.assertTrue(reply['ok'],reply)
        self.server.shutdown();self.thread.join(5);self.server.server_close();self.server=None
        self.coordinator.close();self.coordinator=None
        Path(wallet).write_bytes(snapshot.read_bytes())
        for authority in self.authorities:authority.close()
        self.authorities=[]
        self.coordinator=AuthorityFenceCoordinator(self.root/'coordinator')
        self.router=OwnerRouter(self.root/'router',self.credentials,clock=lambda:self.now)
        self.runtimes={owner:ContractRuntime.open_active('ledger-'+owner,coordinator=self.coordinator,
            provisioning_file=self.root/(owner+'-handoff.json'),verifier=self.router,clock=lambda:self.now) for owner in ('alice','bob')}
        self.authorities=[PublicGameAuthority(self.root/('game-'+name),name,clock=lambda:self.now) for name in ('a','b')]
        self.gateway=GameGateway(self.root/'game-index',tuple(self.authorities),clock=lambda:self.now)
        with self.assertRaises(gp.VerificationUnavailable):
            ManagedWalletBackendServer(('127.0.0.1',0),router=self.router,runtimes=tuple(self.runtimes.values()),
                game_gateway=self.gateway,start_scheduler=False,timeout=3)
        self.assertFalse(self.gateway.capabilities()['connections'])

    def test_author_revocation_survives_full_backend_restart_without_disabling_other_game(self):
        for device in (A1,B1):self.register_activate(device)
        ids=[]
        for name in ('a','b'):
            intent=self.begin(A1,name,key='begin-'+name)['result'];_,reply=self.approve(A1,intent,key='approve-'+name)
            self.assertTrue(reply['ok'],reply);ids.append(intent['binding']['connection_id'])
        self.gateway.revoke_author('a',1);self.restart()
        self.assertFalse(self.author('a',{'v':1,'op':'connection.status','connection_id':ids[0]})['ok'])
        self.assertTrue(self.author('b',{'v':1,'op':'connection.status','connection_id':ids[1]})['ok'])
        self.assertTrue(self.owner(A1,'status',connection_id=ids[0])['ok'])
        self.assertEqual(self.gateway.capabilities(),{'connections':True,'assets_snapshot':False,'exchange':False,'history':False,'simulation_only':True})

if __name__=='__main__':unittest.main()

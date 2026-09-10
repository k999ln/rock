"""GX01 real TLS owner requests, explicit managed migration and atomic holds."""
from contextlib import closing
import copy
import sqlite3
import threading
import time
import unittest
import uuid
from types import SimpleNamespace
import test_game_connections_tls as gx
from game_exchange.exchange_gateway import ExchangeGateway,public_token
from game_exchange import exchange_protocol as x
from game_exchange import exchange_ledger as ledger
from game_exchange.exchange_signer import PublicExchangeSigner
from game_exchange.current_restore import snapshot

A1,A2,B1=gx.A1,gx.A2,gx.B1

class ExchangeTLS(unittest.TestCase):
    setUp=gx.GameConnectionsTLS.setUp
    stop=gx.GameConnectionsTLS.stop
    event=gx.GameConnectionsTLS.event
    write_credentials=gx.GameConnectionsTLS.write_credentials
    call=gx.GameConnectionsTLS.call
    register_activate=gx.GameConnectionsTLS.register_activate
    credit=gx.GameConnectionsTLS.credit
    owner=gx.GameConnectionsTLS.owner
    begin=gx.GameConnectionsTLS.begin
    approve=gx.GameConnectionsTLS.approve

    def prepare_game_exchanges(self):
        self.migrations={}
        for owner,runtime in self.runtimes.items():
            # Nonempty Wallet: retain settled postings and a separate pending sale.
            sale=runtime.seed_fixture_sale(5000,'migration-settled-sale')
            runtime.settle_fixture_sale(sale['id'],'migration-settlement')
            runtime.seed_fixture_sale(200,'migration-pending-sale')
            with runtime.admit_write(1),closing(runtime._service.wallet._connect()) as db:
                before=snapshot(db)
                db.execute('CREATE TABLE migration_custom (id INTEGER PRIMARY KEY, value BLOB)')
                db.execute('INSERT INTO migration_custom VALUES (1,?)',(sqlite3.Binary(b'\x00\xfflegacy'),))
                original_postings=[tuple(r) for r in db.execute('SELECT * FROM wallet_postings ORDER BY id')]
            migration_id=str(uuid.uuid4())
            self.migrations[owner]=ledger.migrate(runtime,migration_id=migration_id)
            self.assertEqual(ledger.migrate(runtime,migration_id=migration_id),self.migrations[owner])
            with runtime.admit_write(1),closing(runtime._service.wallet._connect()) as db:
                self.assertEqual([tuple(r) for r in db.execute('SELECT * FROM wallet_postings ORDER BY id')],original_postings)
                self.assertEqual(db.execute('SELECT typeof(value),value FROM migration_custom').fetchone()[:],('blob',b'\x00\xfflegacy'))
                self.assertEqual(db.execute('PRAGMA integrity_check').fetchone()[0],'ok')
            self.assertEqual(self.migrations[owner]['preserved_postings'],len(original_postings))

    def ready(self,device=A1,game='a'):
        runtime=self.runtimes[gx.DEVICE_OWNER[device]]
        if getattr(runtime,'_exchanges',None) is None:
            peers={a.game.game_id:SimpleNamespace(asset='COIN_'+a.name.upper(),
                terminal_key=PublicExchangeSigner(a.game.game_authority_id,'terminal').record) for a in self.authorities}
            runtime.bind_game_exchanges(peers,start_workers=False)
        self.server.exchange_gateway=ExchangeGateway(self.gateway)
        self.register_activate(device)
        begun=self.begin(device,game,key='connect-'+game)
        self.assertTrue(begun['ok'],begun)
        _,approved=self.approve(device,begun['result'],key='connect-'+game)
        self.assertTrue(approved['ok'],approved)
        return approved['result']['binding']['connection_id']

    def exchange(self,device,op,**fields):
        return self.transports[device].exchange({'v':1,'op':'game.exchange.'+op,**fields})

    def quoted(self,connection,device=A1,exchange_id='same-external',principal=100):
        reply=self.exchange(device,'quote',key='quote-'+exchange_id,connection_id=connection,
                            exchange_id=exchange_id,principal_minor=principal)
        self.assertTrue(reply['ok'],reply);quote=reply['result'];x.quote(quote)
        intent=self.exchange(device,'approval.begin',key='begin-'+exchange_id,quote_id=quote['binding']['quote_id'])
        self.assertTrue(intent['ok'],intent);return quote,intent['result']

    def signed(self,quote,intent,device=A1,key='approve-exchange'):
        credential=self.authenticators[device].get_exchange_assertion(intent,'0000',key)
        return {'v':1,'op':'game.exchange.approve','key':key,'attempt_id':intent['attempt_id'],
                'quote_sha256':x.quote_digest(quote),'credential':credential}

    def balances(self,owner='alice'):
        runtime=self.runtimes[owner]
        with runtime.admit_write(1),runtime._service.wallet._transaction() as db:
            return runtime._service.wallet._balances(db)

    def test_atomic_quote_assertion_hold_outbox_and_exact_retry(self):
        conn=self.ready();quote,intent=self.quoted(conn)
        self.assertEqual((quote['binding']['principal_minor'],quote['binding']['game_fee_minor'],quote['binding']['total_minor'],quote['binding']['units']),(100,3,103,10))
        request=self.signed(quote,intent);reply=self.transports[A1].exchange(request)
        self.assertTrue(reply['ok'],reply);self.assertEqual(reply['result']['decision'],'APPROVED')
        self.assertEqual(self.transports[A1].exchange(request),reply)
        b=self.balances();self.assertEqual((b['AVAILABLE'],b['GAME_HOLD'],b['GAME_PURCHASES'],b['GAME_FEES']),(4897,103,0,0))
        runtime=self.runtimes['alice']
        with runtime.admit_write(1),runtime._service.wallet._transaction() as db:
            self.assertEqual(db.execute('SELECT count(*) FROM wallet_game_outbox').fetchone()[0],1)
            self.assertEqual(db.execute("SELECT count(*) FROM wallet_journals WHERE kind='game.reserve'").fetchone()[0],1)
            self.assertEqual(db.execute('SELECT typeof(apply_bytes) FROM wallet_game_outbox').fetchone()[0],'blob')
            self.assertEqual(db.execute('SELECT count(*) FROM wallet_game_exchange_requests WHERE request=?',(gx.encoded(request),)).fetchone()[0],1)
        changed=copy.deepcopy(request);changed['key']='different-approval-key'
        self.assertFalse(self.transports[A1].exchange(changed)['ok'])
        cancelled=self.exchange(A1,'cancel',key='cancel',connection_id=conn,exchange_id='same-external')
        self.assertTrue(cancelled['ok'],cancelled);self.assertEqual(cancelled['result']['state'],'CANCELLED')
        self.assertEqual(self.exchange(A1,'cancel',key='cancel',connection_id=conn,exchange_id='same-external'),cancelled)
        b=self.balances();self.assertEqual((b['AVAILABLE'],b['GAME_HOLD']),(5000,0))

    def test_signed_insufficient_denial_consumes_counter_and_never_later_approves(self):
        conn=self.ready();quote,intent=self.quoted(conn,principal=6000)
        request=self.signed(quote,intent);reply=self.transports[A1].exchange(request)
        self.assertTrue(reply['ok'],reply);self.assertEqual(reply['result']['decision'],'DENIED')
        self.assertEqual(reply['result']['reason'],'INSUFFICIENT_FUNDS')
        self.credit('alice',8000)
        self.assertEqual(self.transports[A1].exchange(request),reply)
        b=self.balances();self.assertEqual(b['GAME_HOLD'],0)
        runtime=self.runtimes['alice']
        with runtime.admit_write(1),runtime._service.wallet._transaction() as db:
            self.assertEqual(db.execute('SELECT count(*) FROM wallet_game_outbox').fetchone()[0],0)
            self.assertEqual(db.execute("SELECT count(*) FROM wallet_game_exchange_attempts WHERE status='DENIED'").fetchone()[0],1)
        quote2,intent2=self.quoted(conn,exchange_id='after-topup',principal=6000)
        second=self.transports[A1].exchange(self.signed(quote2,intent2,key='second'))
        self.assertTrue(second['ok'],second);self.assertEqual(second['result']['decision'],'APPROVED')

    def test_purpose_and_owner_separation_no_hold_before_exact_assertion(self):
        conn=self.ready();quote,intent=self.quoted(conn)
        with self.assertRaises(Exception):self.authenticators[A1].get_assertion(intent['options'],'0000','wrong-purpose')
        self.ready(B1)
        request=self.signed(quote,intent)
        self.assertFalse(self.transports[B1].exchange(request)['ok'])
        for owner in ('alice','bob'):self.assertEqual(self.balances(owner)['GAME_HOLD'],0)
        changed=copy.deepcopy(request);changed['quote_sha256']='0'*64
        self.assertFalse(self.transports[A1].exchange(changed)['ok'])
        self.assertTrue(self.transports[A1].exchange(request)['ok'])

    def test_separate_author_credential_same_key_namespace_and_private_owner_redaction(self):
        from game_exchange.http import GameTransport
        conn_a=self.ready()
        begun=self.begin(A1,'b',key='connect-b');_,approved=self.approve(A1,begun['result'],key='connect-b')
        self.assertTrue(approved['ok'],approved);conn_b=approved['result']['binding']['connection_id']
        for name,conn in (('a',conn_a),('b',conn_b)):
            transport=GameTransport('https://127.0.0.1:'+str(self.server.server_port),gx.ROOT/'os/registry/fixtures/development-ca.pem',
                'public-game-'+name,token=public_token(name),endpoint='/v1/game-exchange')
            request={'v':1,'op':'exchange.quote','key':'same-key','connection_id':conn,'exchange_id':'same-external','principal_minor':100}
            result=transport.exchange(request);self.assertTrue(result['ok'],result)
            self.assertEqual(transport.exchange(request),result)
            self.assertNotIn('owner_ref',gx.gp.canonical(result).decode());self.assertNotIn('account_id',gx.gp.canonical(result).decode())
            self.assertEqual(result['result']['binding']['destination_asset'],'COIN_'+name.upper())
            quote,intent=self.quoted(conn)
            self.assertEqual(result['result']['quote_sha256'],x.quote_digest(quote))
            self.assertEqual(self.balances()['GAME_HOLD'],0)
            altered=dict(request,principal_minor=200);self.assertFalse(transport.exchange(altered)['ok'])
            foreign=dict(request,connection_id=conn_b if name=='a' else conn_a)
            self.assertFalse(transport.exchange(foreign)['ok'])
            # The old connection credential has no exchange author capability.
            old=GameTransport('https://127.0.0.1:'+str(self.server.server_port),gx.ROOT/'os/registry/fixtures/development-ca.pem',
                'public-game-'+name,token=self.authorities[0 if name=='a' else 1].public_author_token,endpoint='/v1/game-exchange')
            with self.assertRaises(gx.BackendUnavailable):old.exchange(request)

    def live_games(self):
        from game_exchange.exchange_authority import GameGrantAuthority
        from game_exchange.exchange_server import GameExchangeServer
        from game_exchange.exchange_worker import GamePeer,ExchangeWorker
        from game_exchange.http import GameTransport
        self.grants={};self.game_servers=[];self.game_threads=[]
        def cleanup():
            for server,thread in zip(self.game_servers,self.game_threads):
                server.shutdown();thread.join(4);self.assertFalse(thread.is_alive());server.server_close()
        self.addCleanup(cleanup)
        for authority in self.authorities:
            grant=GameGrantAuthority(authority,prepare=True)
            for runtime in self.runtimes.values():grant.register_runtime(runtime)
            server=GameExchangeServer(('127.0.0.1',0),grant)
            thread=threading.Thread(target=server.serve_forever,kwargs={'poll_interval':.01});thread.start()
            self.game_servers.append(server);self.game_threads.append(thread);self.grants[authority.name]=grant
            transport=GameTransport('https://127.0.0.1:'+str(server.server_port),gx.ROOT/'os/registry/fixtures/development-ca.pem',authority.game.game_id)
            peer=GamePeer(authority.game.game_id,grant.asset,grant.signer.record,transport)
            for runtime in self.runtimes.values():
                if getattr(runtime,'_exchanges',None) is not None:
                    runtime._exchanges.peers[authority.game.game_id]=peer
        return {owner:{name:ExchangeWorker(runtime._exchanges,runtime._exchanges.peers['public-game-'+name]) for name in self.grants}
            for owner,runtime in self.runtimes.items() if getattr(runtime,'_exchanges',None) is not None}

    def test_two_independent_real_tls_game_journals_and_exact_receipts(self):
        conn_a=self.ready()
        begun=self.begin(A1,'b',key='connect-b');_,approved=self.approve(A1,begun['result'],key='connect-b')
        self.assertTrue(approved['ok'],approved);conn_b=approved['result']['binding']['connection_id']
        workers=self.live_games()['alice']
        requests=[]
        for game,conn in (('a',conn_a),('b',conn_b)):
            quote,intent=self.quoted(conn,exchange_id='same-external')
            request=self.signed(quote,intent,key='same-approve-'+game);reply=self.transports[A1].exchange(request)
            self.assertTrue(reply['ok'],reply);requests.append(request)
            self.assertTrue(workers[game].once())
            state=self.exchange(A1,'status',connection_id=conn,exchange_id='same-external')
            self.assertTrue(state['ok'],state);self.assertEqual(state['result']['state'],'COMPLETED')
            self.assertEqual(state['result']['terminal_receipt']['binding']['destination_asset'],'COIN_'+game.upper())
            self.assertEqual(state['result']['terminal_receipt']['terminal_state'],'APPLIED')
        self.assertEqual((self.grants['a'].balance('alice'),self.grants['b'].balance('alice')),(10,10))
        balances=self.balances();self.assertEqual((balances['AVAILABLE'],balances['GAME_HOLD'],balances['GAME_PURCHASES'],balances['GAME_FEES']),(4794,0,200,6))
        self.assertNotEqual(self.grants['a'].store.path,self.grants['b'].store.path)
        for request in requests:self.assertTrue(self.transports[A1].exchange(request)['ok'])
        self.assertEqual((self.grants['a'].balance('alice'),self.grants['b'].balance('alice')),(10,10))

    def test_game_commit_lost_reply_reconciles_real_tls_receipt_once(self):
        conn=self.ready();workers=self.live_games()['alice'];worker=workers['a']
        quote,intent=self.quoted(conn);self.assertTrue(self.transports[A1].exchange(self.signed(quote,intent))['ok'])
        # Durable claim -> real TLS Game commit -> owner process loses reply
        # before Wallet posting. This is the actual recovery boundary, with
        # no forged/mocked Game response and no second grant.
        claim=worker.claim(time.monotonic()+3)
        receipt=worker.peer.transport.exchange(claim['request'])
        self.assertEqual(receipt['result']['terminal_state'],'APPLIED')
        self.assertEqual(self.balances()['GAME_HOLD'],103)
        self.now+=5;self.assertTrue(worker.once())
        state=self.exchange(A1,'status',connection_id=conn,exchange_id='same-external')['result']
        self.assertEqual(state['state'],'COMPLETED');self.assertEqual(state['terminal_receipt'],receipt['result'])
        self.assertEqual(self.grants['a'].balance('alice'),10)
        self.assertEqual(self.balances()['GAME_HOLD'],0)

    def test_unknown_not_found_keeps_hold_then_signed_reject_prevents_late_apply(self):
        conn=self.ready();worker=self.live_games()['alice']['a']
        quote,intent=self.quoted(conn);self.assertTrue(self.transports[A1].exchange(self.signed(quote,intent))['ok'])
        claim=worker.claim(time.monotonic()+3) # deliberately not sent
        self.now+=5;self.assertTrue(worker.once()) # real TLS NOT_FOUND
        self.assertEqual(self.balances()['GAME_HOLD'],103)
        self.assertEqual(self.grants['a'].balance('alice'),0)
        cancel=self.exchange(A1,'cancel',key='cancel-after-claim',connection_id=conn,exchange_id='same-external')
        self.assertTrue(cancel['ok'],cancel);self.assertEqual(cancel['result']['state'],'CONFIRMING')
        self.assertEqual(self.balances()['GAME_HOLD'],103)
        self.assertTrue(worker.once()) # real TLS permanent signed REJECTED
        state=self.exchange(A1,'status',connection_id=conn,exchange_id='same-external')['result']
        self.assertEqual(state['state'],'REVERSED');self.assertEqual(self.balances()['GAME_HOLD'],0)
        late=worker.peer.transport.exchange(claim['request'])
        self.assertEqual(late['result'],state['terminal_receipt']);self.assertEqual(self.grants['a'].balance('alice'),0)

    def test_foreign_receipt_and_malformed_receipt_cannot_release_hold(self):
        conn=self.ready();workers=self.live_games()['alice'];worker=workers['a']
        quote,intent=self.quoted(conn);self.assertTrue(self.transports[A1].exchange(self.signed(quote,intent))['ok'])
        claim=worker.claim(time.monotonic()+3)
        real=worker.peer.transport.exchange(claim['request']);forged=copy.deepcopy(real)
        forged['result']['terminal_state']='REJECTED'
        worker.complete(claim,forged,time.monotonic()+3)
        state=self.exchange(A1,'status',connection_id=conn,exchange_id='same-external')['result']
        self.assertEqual(state['state'],'REVIEW_REQUIRED');self.assertEqual(self.balances()['GAME_HOLD'],103)
        denied=workers['b'].peer.transport.exchange(claim['request'])
        self.assertFalse(denied['ok']);self.assertEqual(self.grants['b'].balance('alice'),0)
        self.exchange(A1,'reconcile',key='explicit-reconcile',connection_id=conn,exchange_id='same-external')
        self.assertTrue(worker.once());self.assertEqual(self.balances()['GAME_HOLD'],0)

    def test_sqlite_contention_respects_three_second_request_and_no_late_hold(self):
        conn=self.ready();quote,intent=self.quoted(conn);request=self.signed(quote,intent)
        self.transports[A1].timeout=3
        runtime=self.runtimes['alice'];db=sqlite3.connect(runtime._service.wallet.path,isolation_level=None)
        try:
            db.execute('BEGIN IMMEDIATE');started=time.monotonic()
            try:reply=self.transports[A1].exchange(request)
            except gx.BackendUnavailable:reply={'ok':False}
            self.assertFalse(reply['ok']);self.assertLess(time.monotonic()-started,3.5)
        finally:db.rollback();db.close()
        # Real timed-out request must finish before the held lock is released.
        with runtime.admit_write(1),runtime._service.wallet._transaction() as check:
            self.assertEqual(check.execute('SELECT count(*) FROM wallet_game_outbox').fetchone()[0],0)

if __name__=='__main__':unittest.main()

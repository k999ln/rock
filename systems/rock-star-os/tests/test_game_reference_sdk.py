"""Reference SDK uses real TLS and durable independent per-game namespaces."""
import copy
import sqlite3
import time
import unittest
from contextlib import closing
import test_game_exchange_tls as support
from game_exchange.reference_sdk import ReferenceOwnerClient
from game_exchange.http import GameTransport
from game_exchange.client import OwnerConnectionClient,ConnectionUnavailable
from game_exchange import exchange_protocol as x
from game_exchange.exchange_signer import PublicExchangeSigner

A1=support.A1

class ReferenceSDK(unittest.TestCase):
    def setUp(self):
        self.fixture=support.ExchangeTLS();self.fixture.setUp();self.addCleanup(self.fixture.doCleanups)
        self.f=self.fixture
        self.f.register_activate(A1)
        peers={a.game.game_id:support.SimpleNamespace(asset='COIN_'+a.name.upper(),terminal_key=PublicExchangeSigner(a.game.game_authority_id,'terminal').record) for a in self.f.authorities}
        self.f.runtimes['alice'].bind_game_exchanges(peers,start_workers=False)
        self.workers=self.f.live_games()['alice']
        self.sdk=self.open_sdk();self.addCleanup(lambda:self.sdk.close())
    def open_sdk(self):
        return ReferenceOwnerClient(self.f.root/'sdk',self.f.transports[A1],games=tuple(a.game for a in self.f.authorities),
            connection_keys=self.f.gateway.keys,exchange_keys=self.f.runtimes['alice']._exchanges.keys,clock=lambda:self.f.now)
    def begin(self,name,key='same-key'):
        a=self.f.authorities[0 if name=='a' else 1];server=self.f.game_servers[0 if name=='a' else 1]
        transport=GameTransport('https://127.0.0.1:'+str(server.server_port),support.gx.ROOT/'os/registry/fixtures/development-ca.pem',a.game.game_id,
            token=a.public_session('alice'),endpoint='/v1/player/proof')
        reply=self.sdk.begin_connection(a.game.game_id,key,transport);self.assertTrue(reply['ok'],reply);return reply,transport
    def connect(self,name):
        begun,transport=self.begin(name);intent=begun['result']
        assertion=self.f.authenticators[A1].get_game_assertion(intent,'0000','connect-'+name)
        req={'v':1,'op':'game.connection.approve','key':'same-approve','intent_id':intent['binding']['intent_id'],
            'challenge_id':intent['challenge_id'],'binding_sha256':intent['binding_sha256'],'credential':assertion}
        reply=self.sdk.dispatch('public-game-'+name,req);self.assertTrue(reply['ok'],reply)
        return reply['result']['binding']['connection_id']
    def purchase(self,name,conn,*,approval_delay=0):
        game='public-game-'+name
        quote=self.sdk.dispatch(game,{'v':1,'op':'game.exchange.quote','key':'same-key','connection_id':conn,'exchange_id':'same-external','principal_minor':100})['result']
        self.f.now+=approval_delay
        intent=self.sdk.dispatch(game,{'v':1,'op':'game.exchange.approval.begin','key':'same-key','quote_id':quote['binding']['quote_id']})['result']
        credential=self.f.authenticators[A1].get_exchange_assertion(intent,'0000','purchase-'+name)
        request={'v':1,'op':'game.exchange.approve','key':'same-key','attempt_id':intent['attempt_id'],'quote_sha256':x.quote_digest(quote),'credential':credential}
        reply=self.sdk.dispatch(game,request);self.assertTrue(reply['ok'],reply);return request,reply
    def test_purchase_ceremony_retains_remaining_quote_lifetime_after_user_review(self):
        conn=self.connect('a');_,reply=self.purchase('a',conn,approval_delay=3)
        self.assertEqual(reply['result']['decision'],'APPROVED')
        with self.sdk.store.transaction() as db:
            intent=support.gx.gp.decode(db.execute('SELECT intent FROM intents').fetchone()[0].encode())
        self.assertEqual(intent['options']['publicKey']['timeout'],117000)
        with self.assertRaises(ValueError):self.f.authenticators[A1].get_assertion(intent['options'],'0000','wrong-atm-purpose')
        self.workers['a'].once();self.assertEqual(self.f.grants['a'].balance('alice'),10)
    def test_real_two_game_same_external_keys_full_restart_exact_receipts(self):
        connections={};saved={}
        for name in ('a','b'):
            connections[name]=self.connect(name);saved[name]=self.purchase(name,connections[name]);self.workers[name].once()
        self.sdk.close();self.sdk=self.open_sdk()
        for name in ('a','b'):
            request,reply=saved[name];self.assertEqual(self.sdk.retry('public-game-'+name,'game.exchange.approve','same-key'),reply)
            status=self.sdk.dispatch('public-game-'+name,{'v':1,'op':'game.exchange.status','connection_id':connections[name],'exchange_id':'same-external'})
            self.assertEqual(status['result']['state'],'COMPLETED')
            self.assertEqual(self.f.grants[name].balance('alice'),10)
        self.assertEqual(self.sdk.pending(),[])
    def test_pending_connection_resumes_original_begin_after_sdk_restart(self):
        original,transport=self.begin('a');self.sdk.close();self.sdk=self.open_sdk()
        repeated=self.sdk.begin_connection('public-game-a','new-ui-key',transport)
        self.assertEqual(repeated,original)
        with self.sdk.connections['public-game-a'].store.transaction() as db:
            self.assertEqual(db.execute("SELECT count(*) FROM requests WHERE operation='game.connection.begin'").fetchone()[0],1)
    def retained_connection_rows(self):
        with self.sdk.connections['public-game-a'].store.transaction() as db:
            return [tuple(r) for r in db.execute('SELECT rowid,* FROM requests ORDER BY rowid')]

    def check_terminal_begin_refused(self,transport,original):
        before=self.retained_connection_rows();balance=self.f.balances()
        with self.assertRaisesRegex(ValueError,'reconnection is not supported in this version'):
            self.sdk.begin_connection('public-game-a','fresh-ui-key',transport)
        self.assertEqual(self.retained_connection_rows(),before)
        self.assertEqual(self.f.balances(),balance)
        self.assertEqual(self.sdk.begin_connection('public-game-a','same-key',transport),original)
        self.assertEqual(self.sdk.connections['public-game-a'].retry('game.connection.begin','same-key'),original)
        self.assertEqual(self.retained_connection_rows(),before)
        with self.sdk.store.transaction() as db:
            self.assertEqual(db.execute('SELECT count(*) FROM player_proofs').fetchone()[0],1)

    def test_expired_pending_new_key_refused_original_retry_and_catalog_preserved(self):
        from game_exchange.device_client import GameWalletFacade
        original,transport=self.begin('a')
        self.f.now=original['result']['binding']['intent_expires_at']
        self.check_terminal_begin_refused(transport,original)
        facade=GameWalletFacade.__new__(GameWalletFacade);facade.sdk=self.sdk
        self.assertEqual(facade.catalog()['games'][0]['current_state'],'EXPIRED')

    def test_expired_active_new_key_refused_completed_purchase_stays_reconcilable(self):
        connection=self.connect('a');self.purchase('a',connection);self.workers['a'].once()
        original,transport=self.begin('a')
        self.f.now=original['result']['binding']['connection_expires_at']
        self.check_terminal_begin_refused(transport,original)
        status=self.sdk.dispatch('public-game-a',{'v':1,'op':'game.exchange.status','connection_id':connection,'exchange_id':'same-external'})
        self.assertEqual(status['result']['state'],'COMPLETED');self.assertEqual(self.f.grants['a'].balance('alice'),10)

    def test_revoked_new_key_refused_completed_purchase_stays_reconcilable(self):
        connection=self.connect('a');self.purchase('a',connection);self.workers['a'].once()
        original,transport=self.begin('a')
        self.assertTrue(self.sdk.dispatch('public-game-a',{'v':1,'op':'game.connection.revoke','key':'explicit-revoke','connection_id':connection})['ok'])
        self.check_terminal_begin_refused(transport,original)
        status=self.sdk.dispatch('public-game-a',{'v':1,'op':'game.exchange.status','connection_id':connection,'exchange_id':'same-external'})
        self.assertEqual(status['result']['state'],'COMPLETED');self.assertEqual(self.f.grants['a'].balance('alice'),10)

    def test_record_is_durable_before_actual_send_and_unknown_retries_original(self):
        conn=self.connect('a');game='public-game-a'
        request={'v':1,'op':'game.exchange.quote','key':'lost-quote','connection_id':conn,'exchange_id':'lost-external','principal_minor':100}
        transport=self.sdk.transport;original=transport.exchange;seen=[]
        def lose_after_actual_send(value):
            with self.sdk.store.transaction() as db:
                row=db.execute('SELECT request,last_contact FROM requests WHERE key=?',('lost-quote',)).fetchone()
                self.assertIsNotNone(row);self.assertEqual(row['last_contact'],'PREPARED');seen.append(row['request'])
            reply=original(value)
            self.assertTrue(reply['ok'],reply)
            raise ConnectionUnavailable('test process lost the real committed reply')
        transport.exchange=lose_after_actual_send
        try:
            with self.assertRaises(ConnectionUnavailable):self.sdk.dispatch(game,request)
        finally:transport.exchange=original
        self.assertEqual(len(seen),1);self.assertEqual(self.sdk.pending()[0]['last_contact'],'UNKNOWN')
        self.sdk.close();self.sdk=self.open_sdk()
        reply=self.sdk.retry(game,'game.exchange.quote','lost-quote');self.assertTrue(reply['ok'],reply)
        self.assertEqual(self.f.balances()['GAME_HOLD'],0)
        with self.assertRaises(ValueError):self.sdk.dispatch(game,dict(request,principal_minor=200))
    def test_facade_credit_is_explicit_once_and_catalog_uses_current_tls_connection(self):
        from game_exchange.device_client import GameWalletFacade
        proofs={}
        for index,a in enumerate(self.f.authorities):
            proofs[a.game.game_id]=GameTransport('https://127.0.0.1:'+str(self.f.game_servers[index].server_port),support.gx.ROOT/'os/registry/fixtures/development-ca.pem',a.game.game_id,token=a.public_session('alice'),endpoint='/v1/player/proof')
        facade=GameWalletFacade(self.f.root/'facade',self.f.transports[A1],games=tuple(a.game for a in self.f.authorities),connection_keys=self.f.gateway.keys,
            exchange_keys=self.f.runtimes['alice']._exchanges.keys,proof_transports=proofs,clock=lambda:self.f.now)
        self.addCleanup(facade.close)
        catalog=facade.dispatch({'v':1,'op':'game.sandbox.catalog'},peer_uid=1002)['result']
        self.assertFalse(catalog['fixture_credit_applied']);self.assertEqual([g['current_state'] for g in catalog['games']],['NOT_CONNECTED','NOT_CONNECTED'])
        request={'v':1,'op':'game.sandbox.credit','key':'explicit-public-credit','amount_minor':10000}
        with self.assertRaises(PermissionError):facade.wallet.dispatch(request,peer_uid=1002)
        with self.assertRaises(PermissionError):facade.dispatch(request,peer_uid=1000)
        reply=facade.dispatch(request,peer_uid=1002);self.assertTrue(reply['ok'],reply)
        self.assertEqual(self.f.balances()['AVAILABLE'],15000)
        self.assertEqual(facade.dispatch(dict(request,key='another-explicit-click'),peer_uid=1002),reply)
        self.assertEqual(self.f.balances()['AVAILABLE'],15000)
        self.assertTrue(facade.dispatch({'v':1,'op':'game.sandbox.catalog'},peer_uid=1002)['result']['fixture_credit_applied'])
        intent=facade.dispatch({'v':1,'op':'game.sandbox.connection.begin','key':'public-connect','game_id':'public-game-a'},peer_uid=1002)['result']
        credential=self.f.authenticators[A1].get_game_assertion(intent,'0000','facade-connect')
        approved=facade.dispatch({'v':1,'op':'game.connection.approve','key':'facade-approve','intent_id':intent['binding']['intent_id'],
            'challenge_id':intent['challenge_id'],'binding_sha256':intent['binding_sha256'],'credential':credential},peer_uid=1002)
        self.assertTrue(approved['ok'],approved)
        self.assertEqual(facade.dispatch({'v':1,'op':'game.sandbox.catalog'},peer_uid=1002)['result']['games'][0]['current_state'],'ACTIVE')
        revoked=facade.dispatch({'v':1,'op':'game.connection.revoke','key':'explicit-revoke',
            'connection_id':intent['binding']['connection_id']},peer_uid=1002)
        self.assertTrue(revoked['ok'],revoked)
        self.assertEqual(facade.dispatch({'v':1,'op':'game.sandbox.catalog'},peer_uid=1002)['result']['games'][0]['current_state'],'REVOKED')

    def test_reference_author_sdk_has_only_separate_quote_status_capability(self):
        from game_exchange.reference_sdk import ReferenceAuthorClient
        from game_exchange.exchange_gateway import ExchangeGateway,public_token
        self.f.server.exchange_gateway=ExchangeGateway(self.f.gateway)
        for index,name in enumerate(('a','b')):
            conn=self.connect(name);a=self.f.authorities[index];game=a.game.game_id
            transport=GameTransport('https://127.0.0.1:'+str(self.f.server.server_port),support.gx.ROOT/'os/registry/fixtures/development-ca.pem',game,
                token=public_token(name),endpoint='/v1/game-exchange')
            state=self.f.root/('author-sdk-'+name)
            author=ReferenceAuthorClient(state,transport,game=a.game,wallet_authority_id=self.f.transports[A1].authority_id,terminal_key=self.f.grants[name].signer.record)
            request={'v':1,'op':'exchange.quote','key':'same-key','connection_id':conn,'exchange_id':'same-external','principal_minor':100}
            reply=author.dispatch(request);self.assertTrue(reply['ok'],reply);author.close()
            author=ReferenceAuthorClient(state,transport,game=a.game,wallet_authority_id=self.f.transports[A1].authority_id,terminal_key=self.f.grants[name].signer.record)
            try:
                self.assertEqual(author.retry('same-key'),reply);self.assertEqual(author.pending(),[])
                with self.assertRaises(ValueError):author.dispatch(dict(request,principal_minor=200))
                with self.assertRaises(ValueError):author.dispatch({'v':1,'op':'game.sandbox.credit','key':'forbidden','amount_minor':10000})
                self.purchase(name,conn);self.workers[name].once()
                status=author.dispatch({'v':1,'op':'exchange.status','connection_id':conn,'exchange_id':'same-external'})
                self.assertEqual(status['result']['state'],'COMPLETED');self.assertNotIn('owner_ref',support.gx.gp.canonical(status).decode())
                self.f.gateway.revoke_author(name,1)
                with self.assertRaises(ConnectionUnavailable):author.retry('same-key')
                self.assertEqual(self.f.grants[name].balance('alice'),10)
            finally:author.close()

    def test_two_owner_players_and_second_device_use_same_sdk_without_transferring_challenge(self):
        alice_conn=self.connect('a');self.f.register_activate(support.B1);self.f.register_activate(support.A2)
        peers=self.f.runtimes['alice']._exchanges.peers
        self.f.runtimes['bob'].bind_game_exchanges(peers,start_workers=False)
        def client(device,owner):
            result=ReferenceOwnerClient(self.f.root/('sdk-'+device),self.f.transports[device],games=tuple(a.game for a in self.f.authorities),
                connection_keys=self.f.gateway.keys,exchange_keys=self.f.runtimes[owner]._exchanges.keys,clock=lambda:self.f.now)
            self.addCleanup(result.close);return result
        bob=client(support.B1,'bob');second=client(support.A2,'alice');game='public-game-a'
        proof=GameTransport('https://127.0.0.1:'+str(self.f.game_servers[0].server_port),support.gx.ROOT/'os/registry/fixtures/development-ca.pem',game,
            token=self.f.authorities[0].public_session('bob'),endpoint='/v1/player/proof')
        begun=bob.begin_connection(game,'same-key',proof)['result']
        credential=self.f.authenticators[support.B1].get_game_assertion(begun,'0000','bob-connect')
        approved=bob.dispatch(game,{'v':1,'op':'game.connection.approve','key':'same-approve','intent_id':begun['binding']['intent_id'],
            'challenge_id':begun['challenge_id'],'binding_sha256':begun['binding_sha256'],'credential':credential})
        self.assertTrue(approved['ok'],approved);bob_conn=approved['result']['binding']['connection_id']
        self.assertFalse(bob.recover_connection(game,alice_conn)['ok']);self.assertFalse(self.sdk.recover_connection(game,bob_conn)['ok'])
        recovered=second.recover_connection(game,alice_conn)
        self.assertTrue(recovered['ok'],recovered)
        self.assertEqual(recovered['result']['owner']['device_ref'],support.A2)
        self.assertEqual(recovered['result']['intent']['binding']['device_ref'],A1)
        with self.assertRaises(ValueError):self.f.authenticators[support.A2].get_game_assertion(recovered['result']['intent'],'0000','forbidden-moved-challenge')
        # One author SDK serves both owner/player connections with the same
        # external key. Its retained v1 receipt is read through exactly while
        # the other connection gets the versioned connection namespace.
        from game_exchange.reference_sdk import ReferenceAuthorClient
        from game_exchange.exchange_gateway import ExchangeGateway,public_token
        self.f.server.exchange_gateway=ExchangeGateway(self.f.gateway)
        author_transport=GameTransport('https://127.0.0.1:'+str(self.f.server.server_port),support.gx.ROOT/'os/registry/fixtures/development-ca.pem',game,
            token=public_token('a'),endpoint='/v1/game-exchange')
        author=ReferenceAuthorClient(self.f.root/'one-author-two-players',author_transport,game=self.f.authorities[0].game,
            wallet_authority_id=self.f.transports[A1].authority_id,terminal_key=self.f.grants['a'].signer.record,
            additional_wallet_authority_ids=(self.f.transports[support.B1].authority_id,));self.addCleanup(author.close)
        old_request={'v':1,'op':'exchange.quote','key':'same-author-key','connection_id':alice_conn,'exchange_id':'same-external','principal_minor':100}
        old_reply=author_transport.exchange(old_request);self.assertTrue(old_reply['ok'],old_reply)
        with author.store.transaction() as db:
            old_namespace=author._legacy_namespace(old_request)
            original=(old_namespace,support.gx.encoded(old_request),support.gx.encoded(old_reply),'ACKNOWLEDGED')
            db.execute('INSERT INTO requests VALUES(?,?,?,?)',original)
        self.assertEqual(author.dispatch(old_request),old_reply)
        bob_reply=author.dispatch(dict(old_request,connection_id=bob_conn));self.assertTrue(bob_reply['ok'],bob_reply)
        self.assertNotEqual(old_reply['result']['quote_id'],bob_reply['result']['quote_id'])
        self.assertEqual(author.retry('same-author-key',connection_id=alice_conn),old_reply)
        self.assertEqual(author.retry('same-author-key',connection_id=bob_conn),bob_reply)
        with self.assertRaises(ValueError):author.retry('same-author-key')
        with author.store.transaction() as db:
            self.assertEqual(tuple(db.execute('SELECT * FROM requests WHERE namespace=?',(old_namespace,)).fetchone()),original)
            self.assertEqual(db.execute('SELECT count(*) FROM requests').fetchone()[0],2)
        author.close()
        with self.assertRaises(ValueError):
            ReferenceAuthorClient(self.f.root/'one-author-two-players',author_transport,game=self.f.authorities[0].game,
                wallet_authority_id=self.f.transports[A1].authority_id,terminal_key=self.f.grants['a'].signer.record)
        author=ReferenceAuthorClient(self.f.root/'one-author-two-players',author_transport,game=self.f.authorities[0].game,
            wallet_authority_id=self.f.transports[A1].authority_id,terminal_key=self.f.grants['a'].signer.record,
            additional_wallet_authority_ids=(self.f.transports[support.B1].authority_id,));self.addCleanup(author.close)
        self.assertEqual(author.retry('same-author-key',connection_id=alice_conn),old_reply)
        self.assertEqual(author.retry('same-author-key',connection_id=bob_conn),bob_reply)
        unlisted=ReferenceAuthorClient(self.f.root/'unlisted-author-wallet',author_transport,game=self.f.authorities[0].game,
            wallet_authority_id=self.f.transports[A1].authority_id,terminal_key=self.f.grants['a'].signer.record);self.addCleanup(unlisted.close)
        with self.assertRaises(ConnectionUnavailable):unlisted.dispatch(dict(old_request,connection_id=bob_conn))
        results={}
        for sdk,device,connection in ((bob,support.B1,bob_conn),(second,support.A2,alice_conn)):
            quote=sdk.dispatch(game,{'v':1,'op':'game.exchange.quote','key':'same-key','connection_id':connection,'exchange_id':'same-external','principal_minor':100})['result']
            intent=sdk.dispatch(game,{'v':1,'op':'game.exchange.approval.begin','key':'same-key','quote_id':quote['binding']['quote_id']})['result']
            self.assertEqual(intent['device_ref'],device)
            credential=self.f.authenticators[device].get_exchange_assertion(intent,'0000','same-new-purchase')
            request={'v':1,'op':'game.exchange.approve','key':'same-key','attempt_id':intent['attempt_id'],'quote_sha256':x.quote_digest(quote),'credential':credential}
            reply=sdk.dispatch(game,request);self.assertTrue(reply['ok'],reply);self.assertEqual(sdk.retry(game,'game.exchange.approve','same-key'),reply)
            results[device]=reply
        self.workers['a'].once()
        from game_exchange.exchange_worker import ExchangeWorker
        ExchangeWorker(self.f.runtimes['bob']._exchanges,peers[game]).once()
        self.assertEqual((self.f.grants['a'].balance('alice'),self.f.grants['a'].balance('bob')),(10,10))
        self.assertNotEqual(results[support.B1]['result']['hold_id'],results[support.A2]['result']['hold_id'])
        # A1 may read/reconcile A2's purchase in its same owner contract but has
        # no right to use A2's challenge or approve again.
        state=self.sdk.dispatch(game,{'v':1,'op':'game.exchange.status','connection_id':alice_conn,'exchange_id':'same-external'})
        self.assertEqual(state['result']['state'],'COMPLETED')
        self.f.router.revoke_device_credential(support.A2,1)
        denied=second.dispatch(game,{'v':1,'op':'game.exchange.status','connection_id':alice_conn,'exchange_id':'same-external'})
        self.assertFalse(denied['ok'],denied)

    def test_legacy_original_request_import_keeps_source_and_server_receipts(self):
        # The old client has its documented global (operation,key) limitation.
        old=OwnerConnectionClient(self.f.root/'old-client',self.f.transports[A1],games=tuple(a.game for a in self.f.authorities),keys=self.f.gateway.keys,clock=lambda:self.f.now)
        try:
            begun=self.f.begin(A1,'a',key='old-original-key');self.assertTrue(begun['ok'],begun)
            # Build the exact original request from the real proof fixture.
            authority=self.f.authorities[0]
            proof=authority.proof(authority.public_session('alice'),{'v':1,'op':'connection.proof','key':'old-original-key','audience':self.f.transports[A1].authority_id,'scopes':list(support.gx.gp.SCOPES)})
            request={'v':1,'op':'game.connection.begin','key':'old-original-key','proof':proof,'scopes':list(support.gx.gp.SCOPES),'terms_version':support.gx.gp.TERMS,'connection_expires_at':self.f.now+3600}
            reply=old.dispatch(request);self.assertEqual(reply,begun)
            source_path=old.store.path/'game.sqlite3'
            with closing(sqlite3.connect(source_path)) as db:before=support.snapshot(db)
        finally:old.close()
        receipt=self.sdk.import_legacy_connection_client(self.f.root/'old-client')
        self.assertEqual(receipt['request_count'],1);self.assertTrue(receipt['original_keys_preserved'])
        self.assertEqual(self.sdk.import_legacy_connection_client(self.f.root/'old-client'),receipt)
        with closing(sqlite3.connect(source_path)) as db:self.assertEqual(support.snapshot(db),before)
        self.assertEqual(self.sdk.connections['public-game-a'].retry('game.connection.begin','old-original-key'),reply)

if __name__=='__main__':unittest.main()

"""Actual retained Game A/B journals, C current-copy and old-epoch TLS refusal."""
from contextlib import closing
import hashlib
import threading
import time
import unittest
import uuid
from types import SimpleNamespace
import test_game_exchange_tls as support
from game_exchange import current_restore as restore
from game_exchange.exchange_restore import handover
from game_exchange.exchange_authority import GameGrantAuthority
from game_exchange.exchange_worker import ExchangeWorker,GamePeer
from game_exchange.exchange_server import GameExchangeServer
from game_exchange.http import GameTransport

gx=support.gx

class ExchangeCurrentRestore(unittest.TestCase):
    def setUp(self):
        self.f=support.ExchangeTLS();self.f.setUp();self.addCleanup(self.f.doCleanups)
        self.conn={'a':self.f.ready()}
        begun=self.f.begin(gx.A1,'b',key='second-game')['result'];_,approved=self.f.approve(gx.A1,begun,key='second-game')
        self.conn['b']=approved['result']['binding']['connection_id'];self.requests={};self.replies={}
        for name in ('a','b'):
            quote,intent=self.f.quoted(self.conn[name],exchange_id='same-external')
            request=self.f.signed(quote,intent,key='same-approval-'+name);reply=self.f.transports[gx.A1].exchange(request)
            self.assertTrue(reply['ok'],reply);self.requests[name]=request;self.replies[name]=reply
        workers=self.f.live_games()['alice'];self.claim=workers['a'].claim(time.monotonic()+3)
        self.terminal=workers['a'].peer.transport.exchange(self.claim['request'],deadline=time.monotonic()+3)['result']
        self.assertEqual(self.terminal['terminal_state'],'APPLIED')
        self.old=self.f.runtimes['alice'].descriptor
        for server,thread in zip(self.f.game_servers,self.f.game_threads):server.shutdown();thread.join(4);server.server_close()
        self.f.game_servers=[];self.f.game_threads=[];self.f.stop();self.f.clients={};self.f.authenticators={};self.f.runtimes={}
        self.f.coordinator=gx.AuthorityFenceCoordinator(self.f.root/'coordinator')
        self.f.router=gx.OwnerRouter(self.f.root/'router',self.f.credentials,clock=lambda:self.f.now)
        self.f.authorities=[gx.PublicGameAuthority(self.f.root/('game-'+n),n,clock=lambda:self.f.now) for n in ('a','b')]
        self.f.gateway=gx.GameGateway(self.f.root/'game-index',tuple(self.f.authorities),clock=lambda:self.f.now)
        self.f.addCleanup(self.f.gateway.close)
        self.grants={a.name:GameGrantAuthority(a) for a in self.f.authorities}
        self.source={n:hashlib.sha256((self.old.canonical_state/n).read_bytes()).hexdigest() for n in restore.DB_NAMES}
        self.restore_id=str(uuid.uuid4());self.destination=self.f.root/'current-copy-exchange'
        self.f.coordinator.stage_restore(self.old.ledger_ref,self.destination,restore_id=self.restore_id)
        self.new=self.f.coordinator.promote_restore(self.restore_id)
        restore.prepare_current_game_restore(self.f.gateway.index,self.f.coordinator,self.restore_id)
        self.management=gx.ContractRuntime.open_current_game_restore(self.restore_id,index=self.f.gateway.index,
            coordinator=self.f.coordinator,provisioning_file=self.f.root/'alice-handoff.json',verifier=self.f.router,clock=lambda:self.f.now)
        self.f.runtimes['alice']=self.management
        restore.resume_current_game_restore(self.management,self.f.gateway.index,self.f.coordinator,self.restore_id)

    def epoch(self,name):
        return handover(self.grants[name],self.management,self.f.gateway.index,self.f.coordinator,self.restore_id)

    def reopen(self):
        self.management.close();self.f.runtimes={}
        for owner in ('alice','bob'):
            runtime=gx.ContractRuntime.open_active('ledger-'+owner,coordinator=self.f.coordinator,
                provisioning_file=self.f.root/(owner+'-handoff.json'),verifier=self.f.router,clock=lambda:self.f.now)
            self.f.runtimes[owner]=runtime
            for grant in self.grants.values():grant.register_runtime(runtime)
        peers={};self.f.game_servers=[];self.f.game_threads=[]
        for name,grant in self.grants.items():
            server=GameExchangeServer(('127.0.0.1',0),grant);thread=threading.Thread(target=server.serve_forever,kwargs={'poll_interval':.01})
            thread.start();self.f.game_servers.append(server);self.f.game_threads.append(thread)
            transport=GameTransport('https://127.0.0.1:'+str(server.server_port),gx.ROOT/'os/registry/fixtures/development-ca.pem',grant.authority.game.game_id)
            peers[grant.authority.game.game_id]=GamePeer(grant.authority.game.game_id,grant.asset,grant.signer.record,transport)
        self.f.server=gx.ManagedWalletBackendServer(('127.0.0.1',0),router=self.f.router,runtimes=tuple(self.f.runtimes.values()),
            game_gateway=self.f.gateway,exchange_peers=peers,start_scheduler=False,start_game_workers=False,timeout=3)
        self.f.thread=threading.Thread(target=self.f.server.serve_forever,kwargs={'poll_interval':.01});self.f.thread.start()
        self.f.transports[gx.A1]=gx.HTTPSWalletTransport('https://127.0.0.1:'+str(self.f.server.server_port),
            gx.ROOT/'os/registry/fixtures/development-ca.pem',self.f.root/(gx.A1+'-token'),authority_id=self.new.wallet_authority_id,device_ref=gx.A1,protocol_version=3)
        return {name:ExchangeWorker(self.f.runtimes['alice']._exchanges,peers['public-game-'+name]) for name in ('a','b')}

    def test_each_issuer_cas_retains_rows_then_old_apply_refused_and_original_terminal_recovered(self):
        first=self.epoch('a');self.assertEqual(self.epoch('a'),first)
        with self.assertRaises(ValueError):self.grants['b'].register_runtime(self.management)
        second=self.epoch('b');self.assertEqual(second['new_epoch'],2)
        self.assertNotEqual(first['game_store_uuid'],second['game_store_uuid'])
        workers=self.reopen();self.f.now+=5
        for name in ('a','b'):self.assertTrue(workers[name].once())
        for name,expected in (('a','COMPLETED'),('b','REVERSED')):
            state=self.f.exchange(gx.A1,'status',connection_id=self.conn[name],exchange_id='same-external')['result']
            self.assertEqual(state['state'],expected);self.assertEqual(state['held_minor'],0)
            self.assertEqual(self.f.transports[gx.A1].exchange(self.requests[name]),self.replies[name])
        state=self.f.exchange(gx.A1,'status',connection_id=self.conn['a'],exchange_id='same-external')['result']
        self.assertEqual(state['terminal_receipt'],self.terminal)
        self.assertFalse(workers['a'].peer.transport.exchange(self.claim['request'],deadline=time.monotonic()+3)['ok'])
        self.assertEqual((self.grants['a'].balance('alice'),self.grants['b'].balance('alice')),(10,0))
        with self.f.runtimes['alice'].admit_write(2),self.f.runtimes['alice']._service.wallet._transaction() as db:
            self.assertEqual(self.f.runtimes['alice']._service.wallet._balances(db)['GAME_HOLD'],0)
            self.assertEqual(db.execute('SELECT count(*) FROM wallet_game_outbox').fetchone()[0],2)
            self.assertEqual(db.execute("SELECT value FROM migration_custom WHERE id=1").fetchone()[0],b'\x00\xfflegacy')
        self.assertEqual({n:hashlib.sha256((self.old.canonical_state/n).read_bytes()).hexdigest() for n in restore.DB_NAMES},self.source)

    def test_foreign_restore_or_mutated_game_journal_cannot_resume_epoch(self):
        with self.assertRaises((ValueError,RuntimeError)):
            handover(self.grants['a'],self.management,self.f.gateway.index,self.f.coordinator,str(uuid.uuid4()))
        first=self.epoch('a')
        with self.grants['a'].store.transaction() as db:
            db.execute('CREATE TABLE foreign_unknown (value BLOB)');db.execute('INSERT INTO foreign_unknown VALUES (?)',(b'\x00\xff',))
        with self.assertRaisesRegex(ValueError,'unchanged'):self.epoch('a')
        with self.grants['a'].store.transaction() as db:
            self.assertEqual(db.execute('SELECT current_epoch FROM grant_issuers WHERE wallet_authority_id=?',(self.new.wallet_authority_id,)).fetchone()[0],2)
            self.assertEqual(db.execute('SELECT receipt FROM grant_epoch_receipts').fetchone()[0],gx.encoded(first))

if __name__=='__main__':unittest.main()

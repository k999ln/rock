"""Test-only subprocess driver: SIGKILL after observed actual commit boundaries."""
from contextlib import closing,contextmanager
import json
import os
from pathlib import Path
import signal
import sys
import tempfile
import threading
import time
from types import SimpleNamespace
from unittest.mock import patch
import test_game_exchange_tls as support
from game_exchange import protocol as p
from game_exchange import exchange_protocol as x
from game_exchange.reference_sdk import ReferenceOwnerClient
from game_exchange.exchange_authority import GameGrantAuthority
from game_exchange.exchange_server import GameExchangeServer
from game_exchange.exchange_worker import GamePeer,ExchangeWorker
from game_exchange.http import GameTransport
from game_exchange.exchange_signer import PublicExchangeSigner

gx=support.gx

def save(path,value):
    with path.open('w') as stream:json.dump(value,stream,sort_keys=True);stream.flush();os.fsync(stream.fileno())
    fd=os.open(path.parent,os.O_DIRECTORY|os.O_RDONLY)
    try:os.fsync(fd)
    finally:os.close(fd)


def kill(root,phase,evidence):
    save(root/'killed.json',{'phase':phase,'actual_pid':os.getpid(),'evidence':evidence})
    os.kill(os.getpid(),signal.SIGKILL)
    raise AssertionError('SIGKILL did not terminate the process')


def wallet_state(runtime):
    with runtime.admit_write(runtime.descriptor.writer_epoch),runtime._service.wallet._transaction() as db:
        return {'balances':runtime._service.wallet._balances(db),
            'exchanges':[dict(row) for row in db.execute('SELECT id,state,held_minor,committed_minor,released_minor FROM wallet_game_exchanges')],
            'attempts':[tuple(row) for row in db.execute('SELECT attempt_id,status FROM wallet_game_exchange_attempts')],
            'claims':db.execute('SELECT count(*) FROM wallet_game_exchange_claims').fetchone()[0],
            'credential_records':[json.loads(row[0]) for row in db.execute('SELECT record_json FROM wallet_auth_credential_state')],
            'opaque':db.execute('SELECT value FROM migration_custom').fetchone()[0].hex()}


def begin_fixture(root):
    f=support.ExchangeTLS();original=tempfile.TemporaryDirectory
    def directory(*args,**kwargs):
        if kwargs.get('prefix')=='gx00-three-device-tls-':return SimpleNamespace(name=str(root),cleanup=lambda:None)
        return original(*args,**kwargs)
    with patch.object(tempfile,'TemporaryDirectory',side_effect=directory):f.setUp()
    f.register_activate(gx.A1)
    peers={a.game.game_id:SimpleNamespace(asset='COIN_'+a.name.upper(),terminal_key=PublicExchangeSigner(a.game.game_authority_id,'terminal').record) for a in f.authorities}
    f.runtimes['alice'].bind_game_exchanges(peers,start_workers=False)
    workers=f.live_games()['alice']
    metadata={'now':f.now,'wallet_port':f.server.server_port,'game_ports':[server.server_port for server in f.game_servers]}
    save(root/'process-case.json',metadata)
    return f,workers,metadata


def reopen_fixture(root):
    meta=json.loads((root/'process-case.json').read_text());f=support.ExchangeTLS();f.root=root;f.now=meta['now'];f.counter=0
    f.clients={};f.authenticators={};f.runtimes={};f.credentials=root/'credentials.json';f.server=f.thread=None
    f.coordinator=gx.AuthorityFenceCoordinator(root/'coordinator');f.router=gx.OwnerRouter(root/'router',f.credentials,clock=lambda:f.now)
    f.runtimes={owner:gx.ContractRuntime.open_active('ledger-'+owner,coordinator=f.coordinator,
        provisioning_file=root/(owner+'-handoff.json'),verifier=f.router,clock=lambda:f.now) for owner in ('alice','bob')}
    f.authorities=[gx.PublicGameAuthority(root/('game-'+name),name,clock=lambda:f.now) for name in ('a','b')]
    f.gateway=gx.GameGateway(root/'game-index',tuple(f.authorities),clock=lambda:f.now);f.grants={};f.game_servers=[];f.game_threads=[];peers={}
    for index,authority in enumerate(f.authorities):
        grant=GameGrantAuthority(authority)
        for runtime in f.runtimes.values():grant.register_runtime(runtime)
        server=GameExchangeServer(('127.0.0.1',meta['game_ports'][index]),grant);f.grants[authority.name]=grant
        transport=GameTransport('https://127.0.0.1:'+str(server.server_port),gx.ROOT/'os/registry/fixtures/development-ca.pem',authority.game.game_id)
        peers[authority.game.game_id]=GamePeer(authority.game.game_id,grant.asset,grant.signer.record,transport)
        thread=threading.Thread(target=server.serve_forever,kwargs={'poll_interval':.01});thread.start();f.game_servers.append(server);f.game_threads.append(thread)
    f.server=gx.ManagedWalletBackendServer(('127.0.0.1',meta['wallet_port']),router=f.router,runtimes=tuple(f.runtimes.values()),
        game_gateway=f.gateway,exchange_peers=peers,start_scheduler=False,start_game_workers=False,timeout=3)
    f.thread=threading.Thread(target=f.server.serve_forever,kwargs={'poll_interval':.01});f.thread.start()
    f.transports={device:gx.HTTPSWalletTransport('https://127.0.0.1:'+str(f.server.server_port),gx.ROOT/'os/registry/fixtures/development-ca.pem',
        root/(device+'-token'),authority_id=f.runtimes[owner].descriptor.wallet_authority_id,device_ref=device,protocol_version=3) for device,owner in gx.DEVICE_OWNER.items()}
    def cleanup():
        for server,thread in zip(f.game_servers,f.game_threads):server.shutdown();thread.join(4);server.server_close()
        f.stop()
    f.addCleanup(cleanup)
    return f,{name:ExchangeWorker(f.runtimes['alice']._exchanges,peers['public-game-'+name]) for name in ('a','b')},meta


def sdk_for(f):
    return ReferenceOwnerClient(f.root/'reference-sdk',f.transports[gx.A1],games=tuple(a.game for a in f.authorities),
        connection_keys=f.gateway.keys,exchange_keys=f.runtimes['alice']._exchanges.keys,clock=lambda:f.now)


def install_wallet_kill(f,phase):
    wallet=f.runtimes['alice']._service.wallet;original=wallet._transaction
    def ready(db):
        if phase.startswith('approval-'):return db.execute('SELECT count(*) FROM wallet_game_exchanges').fetchone()[0]==1
        if phase=='claim-after-commit':return db.execute('SELECT count(*) FROM wallet_game_exchange_claims').fetchone()[0]==1
        return db.execute("SELECT count(*) FROM wallet_game_exchanges WHERE state='COMPLETED'").fetchone()[0]==1
    @contextmanager
    def transaction(*args,**kwargs):
        with original(*args,**kwargs) as db:
            yield db
            if phase.endswith('before-commit') and ready(db):
                kill(f.root,phase,{'transaction_committed':False,'balances':wallet._balances(db)})
        if phase.endswith('after-commit'):
            with closing(wallet._connect()) as db:
                if ready(db):kill(f.root,phase,{'transaction_committed':True,'balances':wallet._balances(db)})
    wallet._transaction=transaction


def run_kill(root,phase):
    f,workers,meta=begin_fixture(root);sdk=sdk_for(f);game='public-game-a'
    proof=GameTransport('https://127.0.0.1:'+str(meta['game_ports'][0]),gx.ROOT/'os/registry/fixtures/development-ca.pem',game,
        token=f.authorities[0].public_session('alice'),endpoint='/v1/player/proof')
    intent=sdk.begin_connection(game,'connect-original',proof)['result']
    credential=f.authenticators[gx.A1].get_game_assertion(intent,'0000','connection-ceremony')
    sdk.dispatch(game,{'v':1,'op':'game.connection.approve','key':'connect-approve','intent_id':intent['binding']['intent_id'],
        'challenge_id':intent['challenge_id'],'binding_sha256':intent['binding_sha256'],'credential':credential})
    connection=intent['binding']['connection_id']
    quote=sdk.dispatch(game,{'v':1,'op':'game.exchange.quote','key':'quote-original','connection_id':connection,'exchange_id':'purchase-original','principal_minor':100})['result']
    intent=sdk.dispatch(game,{'v':1,'op':'game.exchange.approval.begin','key':'approval-intent-original','quote_id':quote['binding']['quote_id']})['result']
    credential=f.authenticators[gx.A1].get_exchange_assertion(intent,'0000','purchase-ceremony')
    request={'v':1,'op':'game.exchange.approve','key':'approval-original','attempt_id':intent['attempt_id'],'quote_sha256':x.quote_digest(quote),'credential':credential}
    meta.update(connection_id=connection,request=request,before=wallet_state(f.runtimes['alice']));save(root/'process-case.json',meta)
    if phase.startswith('approval-'):install_wallet_kill(f,phase)
    reply=sdk.dispatch(game,request);p.require(reply['ok'],'actual owner approval failed')
    if phase.startswith('wallet-') or phase.startswith('claim-'):install_wallet_kill(f,phase)
    if phase=='game-after-commit':
        store=f.grants['a'].store;original=store.transaction
        @contextmanager
        def game_transaction(*args,**kwargs):
            with original(*args,**kwargs) as db:yield db
            if store.db.execute('SELECT count(*) FROM grant_decisions').fetchone()[0]==1:
                kill(root,phase,{'transaction_committed':True,'decisions':1,'purchased_units':store.db.execute('SELECT sum(units) FROM asset_journals').fetchone()[0]})
        store.transaction=game_transaction
    workers['a'].once()
    raise AssertionError('configured actual commit boundary was not reached')


def recover(root):
    f,workers,meta=reopen_fixture(root);sdk=None
    try:
        before=wallet_state(f.runtimes['alice']);game_before=f.grants['a'].balance('alice');sdk=sdk_for(f)
        reply=sdk.retry('public-game-a','game.exchange.approve','approval-original');p.require(reply['ok'],'original approval retry failed')
        for _ in range(5):
            f.now+=5;workers['a'].once()
        request={'v':1,'op':'game.exchange.status','connection_id':meta['connection_id'],'exchange_id':'purchase-original'}
        status=sdk.dispatch('public-game-a',request)['result'];p.require(status['state']=='COMPLETED','recovered purchase must finish once')
        p.require(sdk.retry('public-game-a','game.exchange.approve','approval-original')==reply,'original approval receipt changed')
        return {'before':before,'game_before':game_before,'after':wallet_state(f.runtimes['alice']),
            'game_after':f.grants['a'].balance('alice'),'status':status,'approval':reply,'pending':sdk.pending(),
            'original_request_retained':json.loads((root/'process-case.json').read_text())['request']==meta['request']}
    finally:
        if sdk is not None:sdk.close()
        f.doCleanups()


def restore_kill(config,backup,intent,phase):
    from game_exchange import sandbox as s,sandbox_backup as b,current_restore as r
    value=s.load(Path(config));root=Path(value['state'])
    if phase=='restore-game-a-commit':
        original=b.handover
        def lost(*args,**kwargs):
            result=original(*args,**kwargs);kill(root,phase,result)
        b.handover=lost
    elif phase=='restore-done-commit':
        original=b.write_json
        def lost(path,value):
            original(path,value)
            if value.get('schema')=='rock-game-sandbox-restore-journal/1' and value.get('state')=='DONE':kill(root,phase,value['receipt'])
        b.write_json=lost
    else:
        original=r.resume_current_game_restore
        def lost(runtime,*args,**kwargs):
            transaction=runtime._service.wallet._transaction
            @contextmanager
            def boundary(*aa,**kk):
                with transaction(*aa,**kk) as db:yield db
                with closing(runtime._service.wallet._connect()) as db:
                    if r.exists(db,r.EPOCH) and db.execute('SELECT count(*) FROM '+r.EPOCH).fetchone()[0]==1:
                        kill(root,phase,{'actual_wallet_epoch_committed':True})
            runtime._service.wallet._transaction=boundary
            return original(runtime,*args,**kwargs)
        r.resume_current_game_restore=lost
    b.restore_current(value,Path(backup),intent,'process-restored-device')
    raise AssertionError('restore boundary was not reached')


def migration_kill(root,phase):
    from game_exchange import exchange_ledger as ledger,current_restore as r
    f=support.ExchangeTLS();original_temp=tempfile.TemporaryDirectory
    def directory(*args,**kwargs):
        if kwargs.get('prefix')=='gx00-three-device-tls-':return SimpleNamespace(name=str(root),cleanup=lambda:None)
        return original_temp(*args,**kwargs)
    def prepare():
        runtime=f.runtimes['alice'];wallet=runtime._service.wallet
        sale=runtime.seed_fixture_sale(5000,'original-settled');runtime.settle_fixture_sale(sale['id'],'original-settlement')
        runtime.seed_fixture_sale(200,'original-pending')
        with runtime.admit_write(1),wallet._transaction() as db:
            db.execute('CREATE TABLE legacy_extra (id INTEGER PRIMARY KEY,value BLOB)');db.execute('INSERT INTO legacy_extra VALUES (1,?)',(b'\x00\xffopaque',))
            before=r.snapshot(db)
        migration_id='7c68c31a-2132-445a-b4e9-dd5b205be977'
        save(root/'migration-case.json',{'before':before,'migration_id':migration_id,'now':f.now})
        original=wallet._transaction
        @contextmanager
        def transaction(*args,**kwargs):
            with original(*args,**kwargs) as db:
                yield db
                if phase.endswith('before-commit') and ledger.installed(db):kill(root,phase,{'committed':False})
            if phase.endswith('after-commit'):
                with closing(wallet._connect()) as db:
                    if ledger.installed(db):kill(root,phase,{'committed':True})
        wallet._transaction=transaction
        ledger.migrate(runtime,migration_id=migration_id)
        raise AssertionError('migration boundary was not reached')
    f.prepare_game_exchanges=prepare
    with patch.object(tempfile,'TemporaryDirectory',side_effect=directory):f.setUp()


def migration_recover(root):
    from game_exchange import exchange_ledger as ledger,current_restore as r
    meta=json.loads((root/'migration-case.json').read_text());coordinator=gx.AuthorityFenceCoordinator(root/'coordinator')
    router=gx.OwnerRouter(root/'router',root/'credentials.json',clock=lambda:meta['now']);runtime=None
    try:
        runtime=gx.ContractRuntime.open_active('ledger-alice',coordinator=coordinator,provisioning_file=root/'alice-handoff.json',verifier=router,clock=lambda:meta['now'])
        with runtime.admit_write(1),runtime._service.wallet._transaction() as db:was_installed=ledger.installed(db)
        receipt=ledger.migrate(runtime,migration_id=meta['migration_id'])
        p.require(ledger.migrate(runtime,migration_id=meta['migration_id'])==receipt,'migration receipt changed')
        with runtime.admit_write(1),runtime._service.wallet._transaction() as db:
            after=r.snapshot(db);old={v['name']:v for v in meta['before']['tables']};current={v['name']:v for v in after['tables']}
            p.require(all(current[name]==value for name,value in old.items()),'original typed migration data changed')
            return {'was_installed':was_installed,'original_typed_tables_preserved':len(old),'receipt':receipt,
                'balances':runtime._service.wallet._balances(db),'opaque':db.execute('SELECT value FROM legacy_extra').fetchone()[0].hex()}
    finally:
        if runtime is not None:runtime.close()
        router.close();coordinator.close()


if __name__=='__main__':
    os.umask(0o077);action=sys.argv[1]
    if action=='kill':run_kill(Path(sys.argv[2]),sys.argv[3])
    elif action=='recover':print(json.dumps(recover(Path(sys.argv[2])),sort_keys=True))
    elif action=='migration-kill':migration_kill(Path(sys.argv[2]),sys.argv[3])
    elif action=='migration-recover':print(json.dumps(migration_recover(Path(sys.argv[2])),sort_keys=True))
    else:restore_kill(*sys.argv[2:])

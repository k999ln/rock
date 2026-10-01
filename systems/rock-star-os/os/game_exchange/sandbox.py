#!/usr/bin/env python3
"""Owned Linux lifecycle for the explicit, empty public Game authority fixture."""
from contextlib import ExitStack,contextmanager,closing
from dataclasses import asdict
import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
import signal
import sqlite3
import stat
import subprocess
import sys
import threading
import time
import uuid

ROOT=Path(__file__).resolve().parents[2]
sys.path[:]=[str(ROOT/'src'),str(ROOT/'os')]+[entry for entry in sys.path if Path(entry).resolve()!=Path(__file__).resolve().parent]
from game_exchange import protocol as p
from game_exchange.device_client import AUTHORITY,DEVICE,WALLET_TOKEN,configuration as device_configuration
from game_exchange.connections import encoded,loaded,GameGateway,identity
from game_exchange.fixture import PublicGameAuthority,PublicReceiptSigner,_crypto
from game_exchange.exchange_signer import PublicExchangeSigner
from game_exchange.exchange_authority import GameGrantAuthority
from game_exchange.exchange_worker import GamePeer
from game_exchange.exchange_server import GameExchangeServer
from game_exchange.http import GameTransport
from game_exchange.exchange_ledger import migrate,installed
from game_exchange.current_restore import snapshot as typed_snapshot
from wallet_backend.authority_fence import AuthorityFenceCoordinator,private_directory,read_json,write_json
from wallet_backend.contract_runtime import ContractRuntime
from wallet_backend.runtime_contracts import FreshContractSpec
from wallet_backend.owner_router import OwnerRouter
from wallet_backend.server import ManagedWalletBackendServer
from entitlement.protocol import sign_fixture_event

SCHEMA='rock-game-sandbox-config/1'
LEDGER='public-sandbox-alice'
MIGRATION='3dc1991b-dd72-4058-9994-f9d6b260dfab'
PORTS={'wallet':9641,'game_a':9642,'game_b':9643}
FIXTURE_DATE=1788998400


def sample(state='/var/tmp/rockstaros-preview-authority'):
    return {'schema':SCHEMA,'state':str(state),'authority_id':AUTHORITY,'device_ref':DEVICE,
        'ports':dict(PORTS),'fixture_date':FIXTURE_DATE,'simulation_only':True}


def validate(value):
    p.fields(value,set(sample()))
    p.require(value==sample(value['state']),'fixed synthetic sandbox configuration required')
    state=Path(value['state']);p.require(state.is_absolute() and state.resolve()==state and state not in (Path('/'),Path('/var/tmp')),
        'dedicated canonical protected sandbox state required')
    return value


def load(path):
    path=Path(path);value=validate(read_json(path))
    p.require(path.resolve()==path and path==Path(value['state'])/'sandbox.json','sandbox config must belong to this exact private instance')
    info=path.lstat();p.require(stat.S_IMODE(info.st_mode)==0o600 and info.st_uid==os.geteuid() and info.st_nlink==1,'owned private config required')
    private_directory(Path(value['state']))
    p.require(path.read_bytes()==(encoded(value)+'\n').encode(),'canonical pinned config bytes required')
    return value


def digest(path):
    with Path(path).open('rb') as stream:return hashlib.file_digest(stream,'sha256').hexdigest()

def config_digest(value):return hashlib.sha256((encoded(value)+'\n').encode()).hexdigest()

@contextmanager
def locked(path,*,create=False):
    flags=os.O_RDWR|os.O_NOFOLLOW|os.O_NONBLOCK|(os.O_CREAT if create else 0)
    fd=os.open(path,flags,0o600)
    try:
        info=os.fstat(fd);p.require(stat.S_ISREG(info.st_mode) and info.st_uid==os.geteuid() and stat.S_IMODE(info.st_mode)==0o600 and info.st_nlink==1,'owned private lifetime lock required')
        fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
        yield fd
    finally:os.close(fd)


def public_device_config():
    proof=[];games=[]
    for index,name in enumerate(('a','b')):
        record=p.GameRecord('public-author-'+name,'public-game-authority-'+name,'public-game-'+name,'Public Game '+name.upper(),1,p.SCOPES)
        key=p.KeyRecord('public-proof-'+name,1,p.PURPOSES['proof'],record.game_authority_id,_crypto('proof:'+record.game_authority_id),1,p.MAX_INT,None,None)
        proof.append(key)
        games.append({'record':dict(asdict(record),scopes=list(record.scopes)),'proof_origin':'https://10.0.2.2:'+str(9642+index),
            'player_session':'PUBLIC-GAME-PLAYER-SESSION-'+name+'-alice-v1'})
    connection=proof+[PublicReceiptSigner(AUTHORITY,k).record for k in ('shared','cursor')]
    purchase=[PublicExchangeSigner(AUTHORITY,k).record for k in ('quote','approval')]+[
        PublicExchangeSigner('public-game-authority-'+n,'terminal').record for n in ('a','b')]
    def keys(values):return [dict(asdict(k),public_key=p.b64(k.public_key)) for k in values]
    config={'schema_version':4,'mode':'development-game-authority','origin':'https://10.0.2.2:9641',
        'ca_file':'/usr/share/rock/development-store-ca.pem','token_file':'/etc/rock-wallet/backend-token',
        'authority_id':AUTHORITY,'device_ref':DEVICE,'games':games,'connection_keys':keys(connection),'exchange_keys':keys(purchase)}
    device_configuration(config);return config


def provision_files(state):
    config={'schema_version':3,'kind':'public-development-owner-device-credentials','devices':[
        {'ledger_ref':LEDGER,'owner_actor':'alice','owner_ref':'fixture-owner-alice','device_ref':DEVICE,
         'credential_revision':1,'active':True,'expires_at':1893456000,'token':WALLET_TOKEN}]}
    event=sign_fixture_event('fulfillment','public-game-sandbox-handoff','device:'+DEVICE,1,FIXTURE_DATE,'handoff',
        {'device_ref':DEVICE,'owner_ref':'fixture-owner-alice','purchase_ref':'fixture-game-sandbox-purchase',
         'verification_ref':'fixture-game-sandbox-verification','verified_at':FIXTURE_DATE,'valid_until':FIXTURE_DATE+7776000})
    handoff={'schema_version':1,'kind':'public-development-fixture','events':[event]}
    for name,value in (('credentials.json',config),('handoff.json',handoff)):
        path=state/name
        if path.exists():p.require(read_json(path)==value,'public sandbox provisioning changed')
        else:write_json(path,value)


class Runtime:
    def __init__(self,config,*,prepare=False,serve=False):
        from game_exchange.sandbox_backup import restore_pending,desktop_ready
        desktop_ready(config['state'])
        p.require(not restore_pending(config),'current-copy restore is incomplete; normal service admission is fenced')
        self.config=config;self.state=Path(config['state']);self.coordinator=self.router=self.wallet_server=None
        self.runtime=self.gateway=None;self.authorities=[];self.grants=[];self.game_servers=[];self.threads=[]
        try:
            provision_files(self.state);private_directory(self.state/'contracts',create=True)
            self.router=OwnerRouter(self.state/'router',self.state/'credentials.json')
            self.coordinator=AuthorityFenceCoordinator(self.state/'coordinator')
            if LEDGER in self.coordinator.registry['contracts']:
                self.runtime=ContractRuntime.open_active(LEDGER,coordinator=self.coordinator,provisioning_file=self.state/'handoff.json',verifier=self.router)
            else:
                p.require(prepare,'sandbox has not been explicitly prepared')
                spec=FreshContractSpec(LEDGER,self.state/'contracts/alice','alice','fixture-owner-alice',DEVICE)
                self.runtime=ContractRuntime.open_fresh(spec,coordinator=self.coordinator,provisioning_file=self.state/'handoff.json',verifier=self.router,
                    public_fixture_authority_id=AUTHORITY)
            runtime=self.runtime
            with runtime._writer.admit_write(runtime.descriptor.writer_epoch),closing(runtime._service.wallet._connect()) as db:has_schema=installed(db)
            if not has_schema:
                p.require(prepare,'explicit stopped GX01 ledger migration required');migrate(runtime,migration_id=MIGRATION)
            self.authorities=[PublicGameAuthority(self.state/('game-'+name),name) for name in ('a','b')]
            self.grants=[GameGrantAuthority(a,prepare=prepare) for a in self.authorities]
            for grant in self.grants:grant.register_runtime(runtime)
            self.gateway=GameGateway(self.state/'game-index',tuple(self.authorities))
            if (self.state/'READY.json').exists():
                ready=read_json(self.state/'READY.json')
                p.require(ready['config_sha256']==config_digest(config) and ready['game_uuids']=={a.game.game_id:a.store.uuid for a in self.authorities} and
                    ready['index_uuid']==self.gateway.index.uuid,'original prepared Game/index identity must remain available')
            peers={}
            for index,grant in enumerate(self.grants):
                game=grant.authority.game.game_id;port=config['ports']['game_'+grant.authority.name]
                peers[game]=GamePeer(game,grant.asset,grant.signer.record,GameTransport('https://127.0.0.1:'+str(port),ROOT/'os/registry/fixtures/development-ca.pem',game))
                if serve:self.game_servers.append(GameExchangeServer(('127.0.0.1',port),grant))
            if serve:
                self.wallet_server=ManagedWalletBackendServer(('127.0.0.1',config['ports']['wallet']),router=self.router,runtimes=(runtime,),game_gateway=self.gateway,
                    exchange_peers=peers,start_scheduler=True,start_game_workers=True,timeout=3)
                for server in self.game_servers+[self.wallet_server]:
                    thread=threading.Thread(target=server.serve_forever,kwargs={'poll_interval':.05},daemon=False);thread.start();self.threads.append((server,thread))
            else:
                self.router.bind_runtimes((runtime,));self.gateway.bind_runtimes((runtime,));runtime.bind_game_exchanges(peers,start_workers=False)
        except BaseException:self.close();raise
    def close(self):
        # Stop new owner requests, join all managed callers/claim workers, then
        # stop the independent Game authorities before releasing any identity.
        for server,thread in reversed(self.threads):server.shutdown();thread.join(5);p.require(not thread.is_alive(),'sandbox listener still running')
        self.threads=[]
        if self.wallet_server is not None:self.wallet_server.server_close();self.wallet_server=None
        elif self.runtime is not None:self.runtime.close()
        for server in self.game_servers:server.server_close()
        self.game_servers=[]
        if self.gateway is not None:self.gateway.close()
        if self.router is not None:self.router.close()
        for authority in self.authorities:authority.close()
        if self.coordinator is not None:self.coordinator.close()


def process_identity(pid):
    try:
        root=Path('/proc')/str(pid)
        fields=(root/'stat').read_text().rsplit(')',1)[1].split()
        return {'start_ticks':fields[19],'command':(root/'cmdline').read_bytes().rstrip(b'\0').decode().split('\0')}
    except (OSError,ValueError,IndexError,UnicodeError):return None


def status(config):
    state=Path(config['state']);path=state/'process.json';record=read_json(path) if path.exists() else None
    if record is not None:
        p.fields(record,{'schema','pid','identity','config_sha256','source_sha256'})
        p.require(record['schema']=='rock-game-sandbox-process/1' and type(record['pid']) is int and record['pid']>1 and
            record['config_sha256']==config_digest(config),'owned sandbox process binding changed')
    running=record is not None and process_identity(record['pid'])==record['identity']
    return {'schema':'rock-game-sandbox-status/1','running':running,'authority_id':AUTHORITY,'config_sha256':config_digest(config),
        'pid':record['pid'] if running else None,'simulation_only':True}


def prepare(config):
    state=Path(config['state'])
    with locked(state/'control.lock',create=True),locked(state/'sandbox.lock',create=True):
        p.require(not status(config)['running'],'stop sandbox before explicit preparation')
        runtime=Runtime(config,prepare=True)
        try:
            if not (state/'READY.json').exists():
                # Prime only the existing scheduler's current UTC-period guard,
                # while this new contract still has no account or consent.
                # This is an actual no-due tick, never an automatic fixture credit.
                with runtime.runtime.admit_write(runtime.runtime.descriptor.writer_epoch),closing(runtime.runtime._service.membership.store._connect()) as db:
                    p.require(db.execute('SELECT count(*) FROM accounts').fetchone()[0]==0,'initial sandbox must be unregistered')
                runtime.runtime._service.membership.tick()
            receipt={'schema':'rock-game-sandbox-prepared/1','config_sha256':config_digest(config),'authority_id':AUTHORITY,
                'descriptor':identity(runtime.runtime.descriptor),'game_uuids':{a.game.game_id:a.store.uuid for a in runtime.authorities},
                'index_uuid':runtime.gateway.index.uuid,'initialization':'explicit-public-fixture','simulation_only':True}
            path=state/'READY.json'
            if path.exists():p.require(read_json(path)==receipt,'prepared sandbox identity changed')
            else:write_json(path,receipt)
            return receipt
        finally:runtime.close()


def serve(config,path):
    state=Path(config['state'])
    with locked(state/'sandbox.lock'):
        p.require((state/'READY.json').is_file(),'explicit sandbox preparation required')
        stopping=threading.Event()
        for signum in (signal.SIGTERM,signal.SIGINT):signal.signal(signum,lambda *_:stopping.set())
        runtime=Runtime(config,serve=True)
        try:
            record={'schema':'rock-game-sandbox-process/1','pid':os.getpid(),'identity':process_identity(os.getpid()),
                'config_sha256':config_digest(config),'source_sha256':digest(__file__)}
            write_json(state/'process.json',record)
            while not stopping.wait(.2):pass
        finally:runtime.close()


def start(config,path):
    state=Path(config['state'])
    with locked(state/'control.lock',create=True):
        from game_exchange.sandbox_backup import restore_pending,desktop_ready
        desktop_ready(config['state'])
        p.require(not restore_pending(config),'current-copy restore is incomplete; finish only the retained intent')
        current=status(config)
        if current['running']:return current
        p.require((state/'READY.json').is_file(),'prepare sandbox before starting')
        # A separate actual lifetime lock catches an unrecorded process before
        # we spawn; no stale PID alone permits takeover or a second writer.
        with locked(state/'sandbox.lock'):pass
        with (state/'sandbox.log').open('ab') as log:
            process=subprocess.Popen([sys.executable,str(Path(__file__).resolve()),'serve','--config',str(path)],stdin=subprocess.DEVNULL,
                stdout=log,stderr=log,start_new_session=True)
        until=time.monotonic()+15
        while time.monotonic()<until:
            current=status(config)
            if current['running'] and current['pid']==process.pid:return current
            if process.poll() is not None:raise RuntimeError('sandbox startup rejected; inspect private sandbox.log')
            time.sleep(.05)
        process.terminate();process.wait(timeout=5);raise TimeoutError('sandbox startup deadline elapsed')


def stop(config):
    state=Path(config['state'])
    with locked(state/'control.lock',create=True):
        current=status(config)
        if current['running']:
            record=read_json(state/'process.json');p.require(process_identity(record['pid'])==record['identity'],'sandbox process changed before stop')
            os.kill(record['pid'],signal.SIGTERM);until=time.monotonic()+15
            while process_identity(record['pid'])==record['identity'] and time.monotonic()<until:time.sleep(.05)
            p.require(process_identity(record['pid'])!=record['identity'],'sandbox workers did not stop; ownership retained')
        with locked(state/'sandbox.lock'):pass
        return status(config)


@contextmanager
def stopped_snapshot(config):
    state=Path(config['state'])
    with locked(state/'control.lock',create=True),locked(state/'sandbox.lock'),stopped_authorities(config) as pair:
        yield pair


@contextmanager
def stopped_authorities(config):
    state=Path(config['state'])
    with ExitStack() as stack:
        p.require(not status(config)['running'],'all sandbox writers must stop before snapshot')
        registry=read_json(state/'coordinator/registry.json')
        contract=Path(registry['contracts'][LEDGER]['descriptor']['canonical_state'])
        contracts=retained_contracts(state,registry)
        for path in (state/'coordinator/coordinator.lock',state/'router/router.lock',*(directory/'authority.lock' for directory in contracts),state/'game-index/game.lock',
                     state/'game-a/game.lock',state/'game-b/game.lock'):stack.enter_context(locked(path))
        yield state,contract


def retained_contracts(state,registry):
    p.require(set(registry['contracts'])=={LEDGER},'fixed public sandbox contract inventory required')
    paths={Path(registry['contracts'][LEDGER]['descriptor']['canonical_state'])}
    for record in registry['restores'].values():paths.add(Path(record['source_descriptor']['canonical_state']))
    for path in paths:p.require(path.is_relative_to(state/'contracts') and path.resolve()==path,'retained contract must remain inside this instance')
    return sorted(paths)


def snapshot(config):
    with stopped_snapshot(config) as (state,contract):return observe_stopped(state,contract)


def observe_stopped(state,contract):
    databases={};identities={}
    # Include unknown SQLite files/tables and all retained C/router metadata.
    # Process/log/control files are not authority or financial state.
    roots=[state/'coordinator',state/'router',*retained_contracts(state,read_json(state/'coordinator/registry.json')),state/'game-index',state/'game-a',state/'game-b']
    for path in state.rglob('*'):
        if path.suffix in ('.db','.sqlite3'):
            p.require(not path.is_symlink() and any(path.is_relative_to(root) for root in roots),'unfenced extra authority database requires explicit coverage')
    for root in roots:
        for path in sorted(root.rglob('*')):
            p.require(not path.is_symlink(),'symlink in retained authority is forbidden')
            if not path.is_file():continue
            name=str(path.relative_to(state));info=path.lstat()
            p.require(info.st_uid==os.geteuid() and info.st_nlink==1 and not info.st_mode&0o077,'private retained authority file required')
            if path.suffix in ('.db','.sqlite3'):
                # With every lifetime lock held, require checkpointed content.
                # immutable=1 prevents a read-only WAL-mode inspection from
                # creating a new SHM file or recovering/changing anything.
                for suffix in ('-wal','-journal'):
                    side=Path(str(path)+suffix)
                    p.require(not side.exists() or side.stat().st_size==0,'unresolved authority journal requires explicit recovery')
                uri=path.as_uri()+'?mode=ro&immutable=1'
                with closing(sqlite3.connect(uri,uri=True,isolation_level=None)) as db:
                    db.execute('PRAGMA query_only=ON')
                    p.require(db.execute('PRAGMA integrity_check').fetchone()[0]=='ok','authority DB integrity failure')
                    databases[name]=typed_snapshot(db)
            elif path.suffix=='.json':identities[name]=digest(path)
            elif path.name.endswith(('-journal','-wal')):p.require(path.stat().st_size==0,'unresolved authority journal requires explicit recovery')
    for path in (state/'sandbox.json',state/'credentials.json',state/'handoff.json',state/'READY.json'):identities[str(path.relative_to(state))]=digest(path)
    p.require(len(databases)>=5,'complete Wallet/Entitlement/index/two-Game database set required')
    return {'schema':'rock-game-sandbox-snapshot/1','authority_id':AUTHORITY,'databases':databases,'identities':identities,'simulation_only':True}


def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('action',choices=('sample','device-config','prepare','start','serve','stop','status','snapshot','snapshot-current','restore-current'))
    parser.add_argument('--config',type=Path);parser.add_argument('--state',default='/var/tmp/rockstaros-preview-authority')
    parser.add_argument('--backup',type=Path);parser.add_argument('--intent');parser.add_argument('--new-device');args=parser.parse_args()
    os.umask(0o077)
    if args.action=='sample':result=sample(args.state)
    elif args.action=='device-config':result=public_device_config()
    else:
        p.require(sys.platform=='linux' and args.config is not None,'owned Linux config required');config=load(args.config)
        if args.action in ('snapshot-current','restore-current'):
            from game_exchange.sandbox_backup import snapshot_current,restore_current
            p.require(args.backup is not None and args.intent is not None,'exact backup path and intent required')
            result=snapshot_current(config,args.backup,args.intent) if args.action=='snapshot-current' else restore_current(config,args.backup,args.intent,args.new_device)
        else:result=({'prepare':lambda:prepare(config),'start':lambda:start(config,args.config),'serve':lambda:serve(config,args.config),
            'stop':lambda:stop(config),'status':lambda:status(config),'snapshot':lambda:snapshot(config)}[args.action])()
    if result is not None:print(encoded(result),flush=True)

if __name__=='__main__':main()

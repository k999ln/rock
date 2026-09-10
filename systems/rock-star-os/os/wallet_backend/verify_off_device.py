"""Real-process/TLS continuation proof. Device means a proxy process, not a handset.

Clock/credit controls below exist only on a private multiprocessing pipe owned by
this verifier; they are not exposed by the Wallet HTTP service or shipped to OS.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import multiprocessing as mp
import os
from pathlib import Path
import platform
import sqlite3
import subprocess
import tempfile
import threading
import time

from entitlement.protocol import PUBLIC_TOKENS, TERMS_VERSION
from wallet_backend.client import HTTPSWalletTransport, RemoteWalletService
from wallet_backend.server import WalletBackendServer

ROOT = Path(__file__).resolve().parents[2]
CA = ROOT/'os/registry/fixtures/development-ca.pem'
SEPTEMBER = 1788856800
OCTOBER = int(datetime(2026,10,1,tzinfo=timezone.utc).timestamp())
NOVEMBER = int(datetime(2026,11,1,tzinfo=timezone.utc).timestamp())


def utc():
    return datetime.now(timezone.utc).isoformat()


def authority_process(state, port, initial_clock, pipe):
    clock = [initial_clock]
    server = WalletBackendServer(('127.0.0.1',port), state, start_scheduler=False, clock=lambda:clock[0])
    server.service.membership.poll_seconds = .05
    server.service.membership.retry_seconds = .05
    server.service.membership.start()
    thread = threading.Thread(target=server.serve_forever, kwargs={'poll_interval':.02})
    thread.start()
    pipe.send({'ready':True,'pid':os.getpid(),'port':server.server_port,'authority_id':server.authority_id})
    try:
        while True:
            command = pipe.recv()
            if command['op'] == 'stop':
                break
            if command['op'] == 'clock':
                assert type(command['now']) is int and command['now'] >= clock[0]
                clock[0] = command['now']
                pipe.send({'clock':clock[0]})
            elif command['op'] == 'fixture-settlement':
                sale = server.service.dispatch({'v':1,'op':'wallet.sale','key':'proof-sale','amount_minor':5000},peer_uid=1002)
                settled = server.service.dispatch({'v':1,'op':'wallet.settle','key':'proof-settlement','id':sale['result']['id']},peer_uid=1002)
                pipe.send({'simulation_only':True,'settlement':settled['result']['status']})
            elif command['op'] == 'snapshot':
                pipe.send(server.service.dispatch({'v':1,'op':'snapshot'},peer_uid=1002)['snapshot'])
            else:
                raise ValueError('unknown private verifier control')
    finally:
        server.shutdown()
        thread.join(10)
        server.server_close()
        pipe.close()


def proxy_process(state, origin, authority_id, token_file, pipe):
    service = RemoteWalletService(state, HTTPSWalletTransport(origin,CA,token_file,authority_id=authority_id))
    pipe.send({'ready':True,'pid':os.getpid()})
    try:
        while True:
            request = pipe.recv()
            if request == 'stop':
                break
            try:
                pipe.send(service.dispatch(request,peer_uid=1002))
            except Exception as exc:
                pipe.send({'exception':type(exc).__name__,'message':str(exc)})
    finally:
        service.close()
        pipe.close()


def receive(pipe, timeout=15):
    if not pipe.poll(timeout):
        raise TimeoutError('owned verifier child did not respond')
    return pipe.recv()


def rpc(pipe, value):
    pipe.send(value)
    result = receive(pipe)
    if isinstance(result,dict) and 'exception' in result:
        raise AssertionError(result)
    return result


def stop(child, pipe):
    if child is None:
        return
    if child.is_alive():
        try:
            pipe.send({'op':'stop'} if child.name.startswith('authority') else 'stop')
        except (BrokenPipeError,EOFError,OSError):
            pass
    child.join(15)
    if child.is_alive():
        child.terminate()
        child.join(5)
        raise RuntimeError('owned verifier process failed normal shutdown')
    pipe.close()
    assert child.exitcode == 0, (child.name,child.exitcode)


def summary(snapshot):
    return {'available_minor':snapshot['available_minor'],'held_minor':snapshot['held_minor'],
            'billed_minor':snapshot['billed_minor'],'ledger_balance_minor':snapshot['ledger_balance_minor'],
            'bills':[{'id':b['id'],'period':b['period'],'amount_minor':b['amount_minor']} for b in snapshot['bills']],
            'auto_renew':snapshot['membership']['entitlement']['auto_renew']}


def verify(output):
    output = Path(output).absolute()
    output.mkdir(parents=True,exist_ok=False)
    report = {'schema':'rock-wallet-off-device-process-proof/1','status':'RUNNING','started_utc':utc(),
              'scope':'Real separate Linux/Mac processes and verified TLS. Device proxy process exits; NOT an actual guest OS or BlackBerry poweroff test.',
              'simulation_only':True,'clock':'private verifier-controlled UTC clock; no HTTP clock operation',
              'credit':'private verifier calls existing WalletService fixture sale and settlement; no real proceeds',
              'environment':{'system':platform.platform(),'python':platform.python_version()},'checks':[]}
    files = [Path(__file__),ROOT/'os/wallet_backend/client.py',ROOT/'os/wallet_backend/server.py',
             ROOT/'os/platform/service.py',ROOT/'os/entitlement/device.py',ROOT/'src/blackberryrock/wallet.py']
    before = {str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in files}
    ctx = mp.get_context('spawn')
    server = device = None
    server_pipe = device_pipe = None
    try:
        with tempfile.TemporaryDirectory(prefix='rock-wallet-off-device-') as temp:
            base = Path(temp)
            token = base/'PUBLIC-OWNER-FIXTURE.txt'
            token.write_text(PUBLIC_TOKENS['alice']+'\n');token.chmod(0o600)
            server_pipe, other = ctx.Pipe()
            server = ctx.Process(target=authority_process,args=(str(base/'authority'),0,SEPTEMBER,other),name='authority-first')
            server.start();other.close();ready = receive(server_pipe)
            assert ready['ready']
            origin = 'https://127.0.0.1:'+str(ready['port'])
            authority_id = ready['authority_id']
            report['authority_id'] = authority_id
            device_pipe,other=ctx.Pipe()
            device=ctx.Process(target=proxy_process,args=(str(base/'device-cache'),origin,authority_id,str(token),other),name='device-first')
            device.start();other.close();device_ready=receive(device_pipe)
            report['first_device_pid']=device_ready['pid']
            def owner(op, **fields):
                reply=rpc(device_pipe,{'v':1,'op':op,**fields})
                assert reply.get('ok') is True,reply
                return reply
            owner('wallet.register',key='proof-registration')
            initial=rpc(server_pipe,{'op':'snapshot'})
            assert initial['billed_minor']==0 and not initial['membership']['entitlement']['auto_renew']
            report['checks'].append('registration has no implied recurring consent or debit')
            rpc(server_pipe,{'op':'fixture-settlement'})
            consent=owner('wallet.consent',key='proof-recurring-consent',accepted=True,terms_version=TERMS_VERSION)
            assert consent['result']['amount_minor']==888
            deadline=time.monotonic()+10
            while True:
                september=rpc(server_pipe,{'op':'snapshot'})
                if september['billed_minor']==888:break
                assert time.monotonic()<deadline,'September automatic scheduler did not debit'
                time.sleep(.05)
            owner('snapshot')
            report['september']=summary(september)
            stop(device,device_pipe)
            report['device_stopped']={'utc':utc(),'pid':device.pid,'exitcode':device.exitcode,'alive':device.is_alive()}
            device=device_pipe=None
            assert server.is_alive()
            rpc(server_pipe,{'op':'clock','now':OCTOBER})
            deadline=time.monotonic()+10
            while True:
                october=rpc(server_pipe,{'op':'snapshot'})
                if october['billed_minor']==1776:break
                assert time.monotonic()<deadline,'October autonomous debit missing'
                time.sleep(.05)
            assert len(october['bills'])==2 and october['available_minor']==3224
            assert {b['period'] for b in october['bills']}=={'2026-09','2026-10'}
            assert all(b['amount_minor']==888 for b in october['bills'])
            assert october['ledger_balance_minor']==0
            report['october_while_device_terminal']=summary(october)
            report['checks'].append('server alone automatically debits October 888 while device process is terminal; no monthly user action')
            stop(server,server_pipe);server=server_pipe=None
            server_pipe,other=ctx.Pipe()
            server=ctx.Process(target=authority_process,args=(str(base/'authority'),ready['port'],OCTOBER,other),name='authority-restarted')
            server.start();other.close();restarted=receive(server_pipe)
            assert restarted['authority_id']==authority_id
            restarted_state=rpc(server_pipe,{'op':'snapshot'})
            assert summary(restarted_state)==summary(october)
            report['checks'].append('backend process restart keeps authority identity, bills and balances without another debit')
            device_pipe,other=ctx.Pipe()
            device=ctx.Process(target=proxy_process,args=(str(base/'device-cache'),origin,authority_id,str(token),other),name='device-restarted')
            device.start();other.close();receive(device_pipe)
            reconnected=owner('snapshot')['snapshot']
            assert reconnected['backend']['connected'] and not reconnected['backend']['stale']
            assert summary(reconnected)==summary(october)
            owner('wallet.consent',key='proof-consent-cancel',accepted=False,terms_version=TERMS_VERSION)
            rpc(server_pipe,{'op':'clock','now':NOVEMBER})
            time.sleep(.2)
            canceled=owner('snapshot')['snapshot']
            assert canceled['billed_minor']==1776 and len(canceled['bills'])==2
            assert not canceled['membership']['entitlement']['auto_renew']
            report['november_after_cancel']=summary(canceled)
            report['checks'].append('reconnected owner sees server ledger; explicit cancellation prevents November debit')
            stop(device,device_pipe);device=device_pipe=None
            stop(server,server_pipe);server=server_pipe=None
            with sqlite3.connect(base/'device-cache/remote-cache.db') as db:
                tables={row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
                assert tables=={'identity','requests','snapshot'},tables
                assert db.execute('SELECT COUNT(*) FROM requests WHERE response IS NULL').fetchone()[0]==0
            assert not list((base/'device-cache').glob('*wallet-simulator*'))
            report['checks'].append('device persists only authority binding, immutable request receipts and read-only snapshot cache; no local financial ledger')
            report['all_owned_processes_normally_stopped']=True
            report['status']='PASS'
    except BaseException as exc:
        report['status']='FAIL'
        report['error']=type(exc).__name__+': '+str(exc)
        raise
    finally:
        for child,pipe in ((device,device_pipe),(server,server_pipe)):
            if child is not None:
                try:stop(child,pipe)
                except Exception as exc:report.setdefault('cleanup_errors',[]).append(type(exc).__name__)
        report['finished_utc']=utc()
        report['source_sha256']={str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in files}
        report['source_unchanged_during_run'] = before == report['source_sha256']
        if not report['source_unchanged_during_run']:
            report['status'] = 'FAIL'
            report['error'] = 'source changed during verification'
        try:
            report['repo_head']=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()
        except FileNotFoundError:
            report['repo_head']=None
            report['repo_head_unavailable']='git is not installed in the verification VM; join host HEAD separately using recorded source hashes'
        (output/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
        print(json.dumps({'status':report['status'],'report':str(output/'report.json'),'checks':len(report['checks'])}),flush=True)
    if report['status'] != 'PASS':
        raise RuntimeError('process proof did not pass')


if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--output',required=True)
    verify(parser.parse_args().output)

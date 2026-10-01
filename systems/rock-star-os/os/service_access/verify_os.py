"""One actual ARM64 OS boot against a shared purchaser authority.

Run only in the authorized Linux build VM. New state/profile/data only. A
private host pipe injects public simulator settlement, time and signed suspend;
all owner requests originate in actual guest UID1000 Platform IPC. No GUI,
physical USB, real provider, or stage0 boot claim is made by this harness.
"""
import argparse
from contextlib import closing
from datetime import datetime,timezone
import hashlib
import importlib.util
import json
import multiprocessing as mp
import os
from pathlib import Path
import re
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import threading
import time

ROOT=Path(__file__).resolve().parents[2]
sys.path[:0]=[str(ROOT/'src'),str(ROOT/'os')]
from blackberryrock.packages import canonical
from blackberryrock.sdk import sign_development,starter
from entitlement.protocol import PUBLIC_TOKENS,sign_fixture_event
from registry.server import Handler as RegistryHandler
from registry.publish import publish
from runner.build_fixture import remote_fixture
from service_access.authority import ClosedServiceAuthority
from service_access.serve import CONSUMERS,DEVICE,credentials,executor
from service_access.profile import prepare_profile
from wallet_backend.verify_os import (sha,digest,utc,require,checkpoint,save,debug,cat,metadata,
                                      filesystem_check,markers,QMPObserver)

PROBE='/usr/libexec/rock-service-access-probe.py'
HOOK_PATH='/etc/init.d/S99rock-service-access-verify'
HOOK=b'''#!/bin/sh
[ "${1:-start}" = start ] || exit 0
case " $(cat /proc/cmdline) " in
 *" rock.service-access.verify=1 "*)
 PYTHONDONTWRITEBYTECODE=1 /usr/bin/python3 -B /usr/libexec/rock-service-access-probe.py >/dev/console 2>&1 &
 ;;
esac
'''
TARGET={
 'os/platform/service.py':'/usr/lib/rock-platform/service.py',
 'os/platform/runner_control.py':'/usr/lib/rock-platform/runner_control.py',
 'os/service_access/os_client.py':'/usr/lib/rock-platform/service_access/os_client.py',
 'os/registry/client.py':'/usr/lib/rock-platform/registry/client.py',
 'os/registry/transport.py':'/usr/lib/rock-platform/registry/transport.py',
 'os/runner/client.py':'/usr/lib/rock-platform/runner/client.py',
 'os/runner/protocol.py':'/usr/lib/rock-platform/runner/protocol.py',
 'os/wallet_backend/client.py':'/usr/lib/rock-platform/wallet_backend/client.py',
 'os/wallet_auth/daemon.py':'/usr/lib/rock-platform/wallet_auth/daemon.py',
 'os/wallet_auth/fixture.py':'/usr/lib/rock-platform/wallet_auth/fixture.py',
 'os/wallet_auth/protocol.py':'/usr/lib/rock-platform/wallet_auth/protocol.py',
 'os/registry/fixtures/development-ca.pem':'/usr/share/rock/development-store-ca.pem'}
EXTRA=['os/service_access/guest_probe.py','os/service_access/verify_os.py','os/service_access/authority.py','os/service_access/controller.py','os/service_access/profile.py','os/service_access/serve.py','os/registry/server.py','os/runner/store.py','os/runner/server.py','os/runner/executor.py','os/runner/sandbox_launcher.c','os/runner/isolated_entry.py','src/blackberryrock/recipe_worker.py','os/wallet_backend/server.py','os/wallet_backend/verify_os.py','os/entitlement/device.py','os/entitlement/store.py','src/blackberryrock/wallet.py','os/wallet_auth/service.py']


def safe_wallet(wallet):
    return {'available_minor':wallet['available_minor'],'held_minor':wallet['held_minor'],'billed_minor':wallet['billed_minor'],
            'bill_count':len(wallet['bills']),'ledger_balance_minor':wallet['ledger_balance_minor'],'simulation_only':wallet['simulation_only']}


class RecordedExecutor:
    def __init__(self,real):self.real=real;self.calls=[]
    def execute(self,text,recipe,cancel):
        output,proof=self.real.execute(text,recipe,cancel)
        self.calls.append({'input_sha256':hashlib.sha256(text.encode()).hexdigest(),'output_sha256':hashlib.sha256(output.encode()).hexdigest(),'execution':proof})
        return output,proof


def authority_process(private,logfile,pipe):
    fd=os.open(logfile,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600);os.dup2(fd,1);os.dup2(fd,2);os.close(fd)
    state=Path(private);state.mkdir(mode=0o700)
    clock=[int(time.time())];phase=['initial'];wire=[];wire_lock=threading.Lock();authority=None
    try:
        actual=RecordedExecutor(executor(state))
        authority=ClosedServiceAuthority(state/'authority',consumers=CONSUMERS,device_credentials_file=credentials(state),executor=actual,clock=lambda:clock[0])
        membership=authority.wallet.service.membership
        membership.poll_seconds=.1;membership.retry_seconds=.1
        original=authority.runner_store.dispatch
        def dispatch(envelope,**kwargs):
            response=original(envelope,**kwargs)
            request=envelope['request'];body=response['response']
            with wire_lock:wire.append({'kind':'runner','phase':phase[0],'op':request['op'],'key':request['key'],'request_sha256':digest(request),'response_sha256':digest(body),'ok':body['ok'],'code':body.get('code'),'authority_id':envelope.get('authority_id'),'response_authority_id':response.get('authority_id'),'consumer':envelope['owner']})
            return response
        authority.runner_store.dispatch=dispatch
        class ObservedRegistry(RegistryHandler):
            def respond(self,status,body):
                super().respond(status,body)
                if self.command=='GET':
                    with wire_lock:wire.append({'kind':'registry','phase':phase[0],'path':self.path,'status':status,'body_sha256':hashlib.sha256(body).hexdigest(),'authority_matched':self.headers.get_all('X-Rock-Service-Authority',[])==[authority.authority_id],'consumer':self.headers.get('X-Rock-Service-Consumer')})
        authority.registry.RequestHandlerClass=ObservedRegistry
        authority.start()
        local=sign_development(starter('org.rockstar.closed-local',schema_version=2,recipe=[{'op':'trim_lines'}]))
        packages=[local,remote_fixture()];published={}
        for index,package in enumerate(packages):
            path=state/f'PUBLIC-tool-{index}.rock.json';path.write_bytes(canonical(package));path.chmod(0o600)
            receipt=publish(f'https://127.0.0.1:{authority.registry.server_port}',authority.ca_file,ROOT/'os/registry/fixtures/PUBLIC-AUTHOR-TOKEN.txt',path,'service-fixture-publish-'+str(index))
            published[package['manifest']['id']]={'sha256':digest(package),'receipt_sha256':digest(receipt),'package':package}
        pipe.send({'ready':True,'pid':os.getpid(),'metadata':authority.metadata(),'service':authority.device_configuration('alice-a'),'wallet':authority.wallet_configuration('alice-a'),'packages':published,'initial_clock':clock[0]})
        while True:
            command=pipe.recv();op=command['op']
            if op=='stop':break
            if op=='seed':
                with membership.device_scope(DEVICE,'alice'):
                    before=authority.wallet.service.dispatch({'v':1,'op':'snapshot'},peer_uid=1002)['snapshot']
                    require(before['auth']['active'] and not before['membership']['entitlement']['auto_renew'] and before['billed_minor']==0,'fixture seed preceded explicit guest activation')
                    sale=authority.wallet.service.dispatch({'v':1,'op':'wallet.sale','key':'service-private-sale','amount_minor':5000},peer_uid=1002)['result']
                    authority.wallet.service.dispatch({'v':1,'op':'wallet.settle','key':'service-private-settle','id':sale['id']},peer_uid=1002)
                phase[0]='paid-pending'
            elif op=='expire':
                with membership.device_scope(DEVICE,'alice'):
                    snapshot=authority.wallet.service.dispatch({'v':1,'op':'snapshot'},peer_uid=1002)['snapshot']
                    require(snapshot['billed_minor']==888 and not snapshot['membership']['entitlement']['auto_renew'],'clock advanced before cancellation')
                    clock[0]=snapshot['membership']['entitlement']['access_until']+1
                phase[0]='expired'
            elif op=='suspend':
                with membership.store._mutex:
                    with closing(membership.store._connect()) as db:
                        seq=db.execute('SELECT sequence FROM streams WHERE stream=?',('device:'+DEVICE,)).fetchone()[0]+1
                    membership.store.ingest(sign_fixture_event('fulfillment','service-suspend-device','device:'+DEVICE,seq,clock[0],'suspend',{'device_ref':DEVICE}))
                phase[0]='revoked'
            elif op!='snapshot':raise ValueError('unsupported fixed private verifier control')
            with wire_lock:observed=list(wire)
            pipe.send({'phase':phase[0],'clock':clock[0],'wallet':safe_wallet(authority.wallet.service.wallet.snapshot()),'wire':observed,'executions':list(actual.calls)})
        with wire_lock:observed=list(wire)
        result={'wallet':safe_wallet(authority.wallet.service.wallet.snapshot()),'wire':observed,'executions':list(actual.calls)}
        authority.close();authority=None
        pipe.send({'stopped':True,**result})
    except BaseException as error:
        try:pipe.send({'failure':type(error).__name__})
        except (OSError,EOFError):pass
        raise
    finally:
        if authority is not None:authority.close()
        pipe.close()


def receive(pipe,timeout=25):
    require(pipe.poll(timeout),'owned authority response deadline exceeded')
    result=pipe.recv();require('failure' not in result,'owned authority failed; private diagnostic retained')
    return result

def rpc(pipe,op):pipe.send({'op':op});return receive(pipe)


def inject(image,directory):
    records=[]
    for local,destination,raw in [('guest_probe.py',PROBE,(ROOT/'os/service_access/guest_probe.py').read_bytes()),('S99rock-service-access-verify',HOOK_PATH,HOOK)]:
        require(metadata(image,destination) is None,'test hook must not replace target content')
        (directory/local).write_bytes(raw)
        require(b'Allocated inode' in debug(image,'write '+local+' '+destination,write=True,cwd=directory),'test entry not allocated')
        for field,value in [('mode','0100755'),('uid','0'),('gid','0')]:debug(image,'set_inode_field '+destination+' '+field+' '+value,write=True)
        require(cat(image,destination)==raw and metadata(image,destination)=={'type':'regular','mode':0o755,'uid':0,'gid':0},'test hook bytes/permissions differ')
        records.append({'path':destination,'sha256':hashlib.sha256(raw).hexdigest(),'mode':0o755})
    return records


def closed_rows(path,query):
    with closing(sqlite3.connect('file:'+str(path)+'?mode=ro',uri=True)) as db:
        db.row_factory=sqlite3.Row;db.execute('PRAGMA query_only=ON');db.execute('BEGIN')
        require(db.execute('PRAGMA integrity_check').fetchone()[0]=='ok','closed database integrity failed')
        return [dict(row) for row in db.execute(query)]


def validate_guest(proof,backend,packages,authority):
    require(proof['status']=='PASS' and proof['packages']=={k:v['sha256'] for k,v in packages.items()},'guest package identity mismatch')
    require({p['uid'] for p in proof['environment']['processes']}=={1002,1003,1004} and {c['peer_uid'] for c in proof['children']}=={1002,1004},'guest identity proof incomplete')
    require(all(c['uid']==c['gid']==1000 and not c['groups'] for c in proof['children']),'owner requests not actual UID1000')
    wire=backend['wire'];runners=[r for r in wire if r['kind']=='runner'];gets=[r for r in wire if r['kind']=='registry']
    require(all(r['authority_id']==r['response_authority_id']==authority and r['consumer']=='alice-a' for r in runners),'runner request/reply authority differs')
    require(all(r['authority_matched'] and r['consumer']=='alice-a' for r in gets),'registry credentials absent or wrong authority')
    for key,operation in [('service-unpaid','submit'),('service-expired','submit'),('service-revoked','status')]:
        require(any(r['key']==key and r['op']==operation and r['ok'] is False and r['code']=='unauthorized' for r in runners),'actual signed purchaser denial absent: '+key)
    for package in packages.values():require(any(r['path']=='/packages/'+package['sha256']+'.rock.json' and r['status']==200 for r in gets),'actual authenticated package GET missing')
    require(any(r['phase']=='expired' and r['path']=='/index.json' and r['status']==200 for r in gets),'nonpayment wrongly denied purchaser Store')
    require(any(r['phase']=='revoked' and r['path']=='/index.json' and r['status']==403 for r in gets),'revoked purchaser Store denial absent')
    require(len(backend['executions'])==1,'denied remote jobs executed or paid execution missing')
    done=proof['paid_remote']['remote'];executed=backend['executions'][0]
    require(done['execution']==executed['execution'] and executed['input_sha256']==hashlib.sha256(b'  owned OS input  \n  one authority  ').hexdigest() and executed['output_sha256']==hashlib.sha256(done['output'].encode()).hexdigest(),'actual isolated executor not joined to guest result')
    require(backend['wallet']=={'available_minor':4112,'held_minor':0,'billed_minor':888,'bill_count':1,'ledger_balance_minor':0,'simulation_only':True},'one-authority simulator totals differ')


def verify(artifacts,output):
    require(sys.platform=='linux','authorized Linux build VM required')
    output=Path(output).resolve();output.mkdir(mode=0o700,parents=True,exist_ok=False)
    report_path=output/'report.json';report={'schema':'rock-purchaser-service-os-proof/1','status':'RUNNING','started_utc':utc(),'simulation_only':True,'scope':'one real ARM64 OS boot and owner IPC; direct kernel; native GUI/stage0 boot/physical BlackBerry/USB/provider NOT_RUN','host_power_commands':0}
    child=pipe=guest=observer=None;verified=False;sources={};inputs={}
    try:
        artifacts=Path(artifacts).resolve(strict=True)
        inputs={name:sha(artifacts/name) for name in ('Image','rootfs.ext4','stage0.cpio.gz')}
        sources={name:sha(ROOT/name) for name in set(TARGET)|set(EXTRA)}
        report.update(input_images=inputs,source_sha256=sources)
        for name,target in TARGET.items():require(hashlib.sha256(cat(artifacts/'rootfs.ext4',target)).hexdigest()==sources[name],'built source mismatch: '+name)
        report['target_source_match']=True
        try:report['repo_head']=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,stderr=subprocess.DEVNULL,text=True).strip()
        except (OSError,subprocess.CalledProcessError):report['repo_head']=None
        private=output/'private';private.mkdir(mode=0o700)
        context=mp.get_context('spawn');pipe,child_pipe=context.Pipe()
        child=context.Process(target=authority_process,args=(str(private/'backend'),str(output/'authority.log'),child_pipe))
        child.start();child_pipe.close();ready=receive(pipe)
        require(ready.get('ready') is True and child.is_alive(),'shared authority not ready')
        report['authority']=ready['metadata'];report['authority_pid']=ready['pid']
        profile=prepare_profile(artifacts,private/'profile',expected_sha256=inputs,service_configuration=ready['service'],wallet_configuration=ready['wallet'],wallet_token=PUBLIC_TOKENS['alice'],authenticator_configuration={'schema_version':1,'kind':'public-software-test-authenticator','device_ref':DEVICE})
        report['profile']={k:profile[k] for k in ('schema','status','images','binding','injected_files','source_sha256','stage0')}
        rootfs=private/'test-rootfs.ext4';shutil.copyfile(private/'profile/rootfs.ext4',rootfs);rootfs.chmod(0o600)
        report['test_injections']=inject(rootfs,output);test_hash=sha(rootfs);report['test_rootfs_sha256']=test_hash
        data=private/'userdata.ext4'
        with data.open('xb') as stream:stream.truncate(256*1024*1024)
        subprocess.run(['mkfs.ext4','-q','-F','-L','rock-data',str(data)],check=True,capture_output=True,timeout=30)
        report['initial_data_sha256']=sha(data);checkpoint(report_path,report)
        with tempfile.TemporaryDirectory(prefix='rock-service-qmp-') as directory:
            monitor=Path(directory)/'qmp.sock';logfile=output/'boot.log'
            command=['qemu-system-aarch64','-machine','virt-10.0,gic-version=3','-accel','tcg','-cpu','cortex-a53','-m','1024','-smp','2','-display','none','-serial','stdio','-monitor','none','-qmp',f'unix:{monitor},server=on,wait=off','-no-reboot','-kernel',str(artifacts/'Image'),'-append','console=ttyAMA0 root=/dev/vda ro rootflags=noload rootwait panic=-1 rock.service-access.verify=1','-drive',f'if=none,file={rootfs},format=raw,id=osdisk,readonly=on','-device','virtio-blk-pci,drive=osdisk,addr=0x1','-drive',f'if=none,file={data},format=raw,id=userdata','-device','virtio-blk-pci,drive=userdata,addr=0x2','-object','rng-random,filename=/dev/urandom,id=rockrng','-device','virtio-rng-pci,rng=rockrng,addr=0x3','-device','virtio-gpu-pci,xres=720,yres=960,addr=0x4','-device','virtio-keyboard-pci,addr=0x5','-device','virtio-tablet-pci,addr=0x6','-netdev','user,id=services','-device','virtio-net-pci,netdev=services,addr=0x7,romfile=']
            report['qemu_command']=command
            with logfile.open('xb') as log:
                guest=subprocess.Popen(command,stdin=subprocess.DEVNULL,stdout=log,stderr=subprocess.STDOUT);report['qemu_pid']=guest.pid
                deadline=time.monotonic()+15
                while not monitor.exists():require(guest.poll() is None and time.monotonic()<deadline,'QEMU failed before monitor');time.sleep(.05)
                observer=QMPObserver(monitor);deadline=time.monotonic()+280;handled=[]
                while guest.poll() is None:
                    content=logfile.read_text(errors='replace')
                    require(not markers(content,'ROCK_SERVICE_GUEST_FAIL'),'guest assertion failed')
                    for marker,op in [('SEED_READY','seed'),('EXPIRE_READY','expire'),('SUSPEND_READY','suspend')]:
                        if op not in handled and (found:=markers(content,'ROCK_SERVICE_'+marker)):
                            require(len(found)==1 and len(handled)==['seed','expire','suspend'].index(op),'out-of-order private fixture transition')
                            result=rpc(pipe,op);handled.append(op)
                            report.setdefault('private_controls',[]).append({'op':op,'observed_utc':utc(),'boot_id':found[0]['boot_id'],'clock':result['clock'],'wallet':result['wallet'],'executions':len(result['executions'])})
                    require(time.monotonic()<deadline,'guest normal poweroff deadline exceeded');time.sleep(.1)
                report['qemu_exit_code']=guest.returncode;require(guest.returncode==0,'QEMU did not exit normally')
                observer.thread.join(3);report['qmp_events']=observer.events;require(not observer.errors,'QMP observer failed');observer.close();observer=None
            guest=None;require(handled==['seed','expire','suspend'],'private fixture sequence incomplete')
            content=logfile.read_text(errors='replace')
            require('reboot: Power down' in content and re.search(r'EXT4-fs \(vdb\): unmounting filesystem',content),'normal init unmount/poweroff absent')
            require(len([e for e in report['qmp_events'] if e['event']=='SHUTDOWN' and e.get('data',{}).get('guest') is True])==1,'guest-initiated shutdown absent')
            report['filesystem']=filesystem_check(data,output,'final');raw=cat(data,'/service-access-proof.json');proof=json.loads(raw)
            passed=markers(content,'ROCK_SERVICE_GUEST_PASS');require(passed==[{'boot_id':proof['boot_id'],'proof_sha256':hashlib.sha256(raw).hexdigest()}],'serial/durable proof mismatch')
            save(output/'guest-proof.json',proof);report['guest_proof_sha256']=sha(output/'guest-proof.json');report['boot_log_sha256']=sha(logfile)
        backend=rpc(pipe,'snapshot');validate_guest(proof,backend,ready['packages'],ready['metadata']['authority_id'])
        pipe.send({'op':'stop'});stopped=receive(pipe);require(stopped.get('stopped') is True,'authority normal close not acknowledged');child.join(12);require(not child.is_alive() and child.exitcode==0,'authority process failed normal stop');pipe.close();pipe=None;child=None
        report['backend']=stopped
        rows=closed_rows(private/'backend/authority/runner/jobs.sqlite3','SELECT * FROM jobs')
        require(len(rows)==1 and rows[0]['key']=='service-paid' and rows[0]['state']=='succeeded' and rows[0]['request_json'] is None,'denied jobs reached authority queue or input retained')
        row=rows[0];package=ready['packages']['org.rockstar.remote-text']['package'];text='  owned OS input  \n  one authority  '
        from runner.client import consent_for
        expected={'v':1,'op':'submit','key':'service-paid','endpoint_id':ready['metadata']['endpoint_id'],'package':package,'text':text,'consent':consent_for(package,text,target='cloud',endpoint_id=ready['metadata']['endpoint_id'],key='service-paid')}
        require(row['request_sha256']==digest(expected) and json.loads(row['output_json'])==proof['paid_remote']['remote']['output'] and json.loads(row['execution_json'])==proof['paid_remote']['remote']['execution'],'closed Runner row not joined to exact guest input/output')
        require(row['consumer_id']=='alice-a' and row['device_ref']==DEVICE,'closed Runner origin binding differs')
        report['closed_runner']={key:row[key] for key in ('owner','key','request_sha256','state','consumer_id','device_ref')}
        report['closed_runner']['receipt_sha256']=digest(json.loads(row['receipt_json']))
        with tempfile.TemporaryDirectory(dir=private,prefix='closed-read-') as extracted:
            dbpath=Path(extracted)/'hub.db';dbpath.write_bytes(cat(data,'/platform/hub.db'))
            local=closed_rows(dbpath,'SELECT id,key,tool_id,version,status,input_bytes,output,error,package_hash FROM hub_jobs ORDER BY created,id')
            require(local==proof['database']['local'],'stopped guest Hub rows differ from live proof')
            dbpath=Path(extracted)/'remote.db';dbpath.write_bytes(cat(data,'/platform/remote/remote.sqlite3'))
            remote=closed_rows(dbpath,'SELECT key,state,send_claimed,cancel_requested,package_hash,input_sha,submit_sha,receipt,remote_status,error FROM remote_jobs ORDER BY key')
            require(len(remote)==4 and next(r for r in remote if r['key']=='service-paid')['remote_status']==next(r for r in proof['database']['remote'] if r['key']=='service-paid')['remote_status'],'closed guest remote result differs')
            report['closed_guest_remote']=[{key:r[key] for key in ('key','state','send_claimed','cancel_requested','package_hash','input_sha','submit_sha')} for r in remote]
        require(sha(rootfs)==test_hash,'readonly test rootfs changed');report['final_data_sha256']=sha(data)
        verified=True;report['status']='VERIFYING_CLEANUP'
    except BaseException as error:
        report.update(status='FAIL',error_type=type(error).__name__)
        if isinstance(error,AssertionError):report['error_label']=str(error)[:240]
    finally:
        checkpoint(report_path,report)
        if guest is not None and guest.poll() is None:
            report['status']='FAIL';report['forced_qemu_cleanup']=True
            try:
                guest.terminate()
                try:guest.wait(5)
                except subprocess.TimeoutExpired:guest.kill();guest.wait(5)
            except BaseException as error:report.setdefault('cleanup_errors',[]).append('QEMU: '+type(error).__name__)
        if observer is not None:
            try:observer.close()
            except BaseException as error:report.setdefault('cleanup_errors',[]).append('QMP: '+type(error).__name__)
        if child is not None:
            try:
                if child.is_alive() and pipe is not None:
                    try:pipe.send({'op':'stop'})
                    except (OSError,EOFError):pass
                child.join(15)
                if child.is_alive():
                    report['forced_authority_cleanup']=True;child.terminate();child.join(5)
                    if child.is_alive():child.kill();child.join(5)
                require(child.exitcode==0,'authority abnormal exit')
            except BaseException as error:report.setdefault('cleanup_errors',[]).append('authority: '+type(error).__name__)
            finally:
                if pipe is not None:pipe.close()
        try:
            report['sources_unchanged']=all(sha(ROOT/name)==value for name,value in sources.items())
            report['base_images_unchanged']=all(sha(artifacts/name)==value for name,value in inputs.items())
        except BaseException:report['sources_unchanged']=report['base_images_unchanged']=False
        report['status']='PASS' if verified and report['status']!='FAIL' and not report.get('cleanup_errors') and not report.get('forced_authority_cleanup') and report['sources_unchanged'] and report['base_images_unchanged'] else 'FAIL'
        report['ended_utc']=utc();checkpoint(report_path,report)
    print(json.dumps({'status':report['status'],'report':str(report_path),'report_sha256':sha(report_path)},sort_keys=True))
    return 0 if report['status']=='PASS' else 1


def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--artifacts',type=Path);parser.add_argument('--output',type=Path);parser.add_argument('--self-test',action='store_true');args=parser.parse_args();os.umask(0o077)
    if args.self_test:return self_test()
    parser.error('--artifacts and --output are required') if args.artifacts is None or args.output is None else None
    return verify(args.artifacts,args.output)


def self_test():
    """Pure false-PASS guards only; not OS, network, or execution evidence."""
    import copy
    import unittest
    class Guards(unittest.TestCase):
        def fixture(self):
            authority='00000000-0000-4000-8000-000000000001';packages={'local':{'sha256':'a'*64},'remote':{'sha256':'b'*64}}
            output='owned OS input\none authority';execution={'kind':'actual_linux_isolated_process'}
            proof={'status':'PASS','packages':{k:v['sha256'] for k,v in packages.items()},'environment':{'processes':[{'uid':uid} for uid in (1002,1003,1004)]},'children':[{'uid':1000,'gid':1000,'groups':[],'peer_uid':uid} for uid in (1002,1004)],'paid_remote':{'remote':{'output':output,'execution':execution}}}
            backend={'wire':[{'kind':'runner','key':key,'op':op,'ok':False,'code':'unauthorized','authority_id':authority,'response_authority_id':authority,'consumer':'alice-a'} for key,op in [('service-unpaid','submit'),('service-expired','submit'),('service-revoked','status')]],'executions':[{'input_sha256':hashlib.sha256(b'  owned OS input  \n  one authority  ').hexdigest(),'output_sha256':hashlib.sha256(output.encode()).hexdigest(),'execution':execution}],'wallet':{'available_minor':4112,'held_minor':0,'billed_minor':888,'bill_count':1,'ledger_balance_minor':0,'simulation_only':True}}
            backend['wire'] += [{'kind':'registry','phase':phase,'path':path,'status':status,'authority_matched':True,'consumer':'alice-a'} for phase,path,status in [('initial','/packages/'+p['sha256']+'.rock.json',200) for p in packages.values()]+[('expired','/index.json',200),('revoked','/index.json',403)]]
            return proof,backend,packages,authority
        def test_complete_join(self):validate_guest(*self.fixture())
        def test_unbound_reply(self):
            p,b,k,a=self.fixture();b['wire'][0]['response_authority_id']='wrong'
            with self.assertRaises(AssertionError):validate_guest(p,b,k,a)
        def test_transport_failure_not_policy_denial(self):
            p,b,k,a=self.fixture();b['wire'][0]['code']='unavailable'
            with self.assertRaises(AssertionError):validate_guest(p,b,k,a)
        def test_extra_execution_rejected(self):
            p,b,k,a=self.fixture();b['executions']*=2
            with self.assertRaises(AssertionError):validate_guest(p,b,k,a)
        def test_output_not_from_observed_executor(self):
            p,b,k,a=copy.deepcopy(self.fixture());p['paid_remote']['remote']['output']='different'
            with self.assertRaises(AssertionError):validate_guest(p,b,k,a)
        def test_guest_root_cannot_impersonate_owner(self):
            p,b,k,a=self.fixture();p['children'][0]['uid']=0
            with self.assertRaises(AssertionError):validate_guest(p,b,k,a)
        def test_missing_network_package_get(self):
            p,b,k,a=self.fixture();b['wire']=[r for r in b['wire'] if 'a'*64 not in r.get('path','')]
            with self.assertRaises(AssertionError):validate_guest(p,b,k,a)
        def test_unintended_second_debit(self):
            p,b,k,a=self.fixture();b['wallet']['billed_minor']=1776
            with self.assertRaises(AssertionError):validate_guest(p,b,k,a)
        def test_sources_compile_without_running_guest(self):
            for name in ('guest_probe.py','verify_os.py'):
                path=ROOT/'os/service_access'/name;compile(path.read_text(),str(path),'exec')
    result=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(Guards))
    return 0 if result.wasSuccessful() else 1
if __name__=='__main__':sys.exit(main())

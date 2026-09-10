#!/usr/bin/python3
"""Flagged disposable ARM64 proof; actual owner IPC, never a GUI claim.

The root observer has no business-operation path. Each action runs in a fresh
uid/gid1000 child with no additional groups. The local public test PIN is used
only inside that child for the real UID1004 software authenticator.
"""
from contextlib import closing
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import stat
import subprocess
import sys
import time

FLAG='rock.service-access.verify=1'
PROOF=Path('/data/service-access-proof.json')
LOCAL='org.rockstar.closed-local'
REMOTE='org.rockstar.remote-text'
TEXT='  owned OS input  \n  one authority  '
OUTPUT='owned OS input\none authority'
DENIAL='current purchased-device or paid service access required'
CHILD=r'''import json,os,sys
sys.path.insert(0,'/usr/lib/rock-platform')
from service import call,PLATFORM_SOCKET,PLATFORM_UID
request=json.load(sys.stdin)
assert os.getuid()==os.geteuid()==1000 and os.getgid()==os.getegid()==1000 and os.getgroups()==[]
local=request['op']=='auth.create'
if local:request['pin']='0000'
try:
 response=call('/run/rock-authenticator/api.sock' if local else PLATFORM_SOCKET,request,1004 if local else PLATFORM_UID,timeout=15,response_timeout=15,return_errors=True)
 packet={'transport_ok':True,'response':response}
except (OSError,ValueError) as error:packet={'transport_ok':False,'error_type':type(error).__name__}
finally:request.pop('pin',None)
packet.update(pid=os.getpid(),uid=os.geteuid(),gid=os.getegid(),groups=os.getgroups(),peer_uid=1004 if local else 1002)
print(json.dumps(packet,separators=(',',':')))
'''


def canonical(value):return json.dumps(value,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()
def digest(value):return hashlib.sha256(value if isinstance(value,bytes) else canonical(value)).hexdigest()
class CheckFailed(AssertionError):pass
def require(value,label):
    if not value:raise CheckFailed(label)


def environment():
    mounts={p[1]:{'source':p[0],'filesystem':p[2],'options':p[3].split(',')} for line in Path('/proc/mounts').read_text().splitlines() if len(p:=line.split())>=4}
    require('ro' in mounts['/']['options'] and mounts['/data']['filesystem']=='ext4' and 'rw' in mounts['/data']['options'],'readonly root and writable data required')
    processes=[]
    for name,uid in [('platform',1002),('wallet',1003),('authenticator',1004)]:
        pid=int(Path('/run/rock-'+name+'.pid').read_text())
        rows=dict(line.split(':',1) for line in Path(f'/proc/{pid}/status').read_text().splitlines() if ':' in line)
        require([int(v) for v in rows['Uid'].split()]==[uid]*4,'actual OS service UID differs')
        processes.append({'role':name,'pid':pid,'uid':uid,'start_ticks':Path(f'/proc/{pid}/stat').read_text().rsplit(')',1)[1].split()[19]})
    root=Path('/usr/lib/rock-platform')
    paths=[Path(__file__).resolve(),root/'service.py',root/'runner_control.py',root/'service_access/os_client.py',root/'registry/client.py',root/'registry/transport.py',root/'runner/client.py',root/'runner/protocol.py',root/'wallet_backend/client.py',Path('/etc/rock-platform/service-access.json'),Path('/etc/rock-wallet/backend.json'),Path('/etc/rock-authenticator/device.json'),Path('/usr/share/rock/development-store-ca.pem')]
    return {'machine':os.uname().machine,'mounts':{p:mounts[p] for p in ('/','/data')},'processes':processes,'source_sha256':{str(p):digest(p.read_bytes()) for p in paths}}


def database():
    result={}
    for name,path,uid,query in [
        ('local','/data/platform/hub.db',1002,'SELECT id,key,tool_id,version,status,input_bytes,output,error,package_hash FROM hub_jobs ORDER BY created,id'),
        ('remote','/data/platform/remote/remote.sqlite3',1002,'SELECT key,state,send_claimed,cancel_requested,package_hash,input_sha,submit_sha,receipt,remote_status,error FROM remote_jobs ORDER BY key')]:
        info=Path(path).lstat();require(stat.S_ISREG(info.st_mode) and info.st_uid==uid and info.st_nlink==1,'private database identity differs')
        with closing(sqlite3.connect('file:'+path+'?mode=ro',uri=True)) as db:
            db.row_factory=sqlite3.Row;db.execute('PRAGMA query_only=ON');db.execute('BEGIN')
            require(db.execute('PRAGMA integrity_check').fetchone()[0]=='ok','guest database integrity failed')
            result[name]=[dict(row) for row in db.execute(query)]
    require(not Path('/data/wallet/wallet-simulator.db').exists(),'remote profile created a second local ledger')
    result['local_ledger_absent']=True
    return result


class Probe:
    def __init__(self):
        self.deadline=time.monotonic()+240;self.boot_id=Path('/proc/sys/kernel/random/boot_id').read_text().strip()
        self.events=[];self.children=[];self.jobs=[]
    def emit(self,name):print('\nROCK_SERVICE_'+name+' '+json.dumps({'boot_id':self.boot_id}),flush=True)
    def call(self,request):
        require(time.monotonic()<self.deadline,'guest deadline exceeded')
        child=subprocess.run(['/usr/bin/python3','-I','-B','-c',CHILD],input=canonical(request),capture_output=True,timeout=min(18,self.deadline-time.monotonic()),user=1000,group=1000,extra_groups=[])
        require(child.returncode==0,'owner child failed; private output withheld')
        packet=json.loads(child.stdout)
        require(packet['uid']==packet['gid']==1000 and packet['groups']==[] and packet['peer_uid']==(1004 if request['op']=='auth.create' else 1002),'owner peer identity differs')
        self.children.append({k:packet[k] for k in ('pid','uid','gid','groups','peer_uid')})
        response=packet.get('response')
        self.events.append({'op':request['op'],'key':request.get('key'),'request_sha256':digest(request),'response_sha256':digest(response) if packet['transport_ok'] else None,'transport_ok':packet['transport_ok'],'ok':response.get('ok') if isinstance(response,dict) else None,'code':response.get('code') if isinstance(response,dict) else None})
        return response if packet['transport_ok'] else None
    def positive(self,request):
        for _ in range(2):
            response=self.call(request)
            if response is not None and response.get('ok') is True:return response
            require(response is None or response.get('code')=='unavailable','positive operation explicitly rejected: '+request['op'])
            time.sleep(.1)
        raise CheckFailed('positive operation unresolved using same request: '+request['op'])
    def action(self,op,key=None,**fields):
        request={'v':1,'op':op,**fields}
        if key is not None:request['key']='service-'+key
        reply=self.positive(request)
        return reply.get('result',reply.get('snapshot',reply.get('credential')))
    def wait(self,function):
        while time.monotonic()<self.deadline:
            value=function()
            if value:return value
            time.sleep(.15)
        raise CheckFailed('expected guest state did not arrive')
    def snapshot(self):return self.action('snapshot')
    def local(self,key):
        job=self.action('run',key,id=LOCAL,text=TEXT,target='device_local')
        final=self.wait(lambda:(value if (value:=self.action('job.result',id=job['id']))['status']!='running' else None))
        require(final['status']=='succeeded' and final['output']==OUTPUT and final['input_bytes']==len(TEXT.encode()) and final['error'] is None,'actual local recipe output differs')
        self.jobs.append(final);return final
    def remote(self,key):
        preview=self.action('remote.prepare',key,id=REMOTE,target='cloud',text=TEXT)
        require(preview['prepared'] and not preview['approved'] and preview['input_sha256']==digest(TEXT.encode()),'remote preview input binding differs')
        receipt=self.action('remote.submit',key,consent=preview['consent'])
        require(receipt['accepted'] and receipt['remote_accepted'] is False,'local queue receipt misrepresented as remote completion')
        return preview
    def denied(self,key):
        def observed():
            value=self.action('remote.status',key)
            if DENIAL in str(value.get('error')):return value
            if value['state']=='cancelled' and value.get('error')=='no matching remote job; cancelled after claim without re-submission':return value
            return None
        value=self.wait(observed)
        require(value['state'] in ('unknown','cancelled') and value['cancel_requested'] and value['send_claimed'],'denial must retain honest OS uncertainty or reconciled no-job cancellation')
        # The host independently requires a signed unauthorized wire response
        # and no authoritative job for this key. Local state alone is no proof.
        return value


def execute(p,report):
    report['environment']=environment()
    initial=p.wait(lambda:(s if isinstance((s:=p.snapshot()).get('wallet'),dict) else None))
    require(initial['hub']['installed']==[] and initial['hub']['jobs']==[],'fresh guest data required')
    require(initial['service_access']['mode']=='purchaser-fixture' and initial['wallet']['available_minor']==0,'closed profile and empty authority required')
    p.action('registry.refresh','refresh-initial')
    def found_catalog():
        value=p.snapshot()
        return value if len([x for x in value['catalog'] if x['manifest']['id'] in (LOCAL,REMOTE)])==2 else None
    catalog=p.wait(found_catalog)
    report['packages']={x['manifest']['id']:x['hash'] for x in catalog['catalog'] if x['manifest']['id'] in (LOCAL,REMOTE)}
    for tool in (LOCAL,REMOTE):
        p.action('install','install-'+tool,id=tool,version='1.0.0');p.action('approve','approve-'+tool,id=tool,approved_hash=report['packages'][tool])
    p.local('local-unpaid');p.remote('unpaid');report['unpaid_denial']=p.denied('unpaid')
    p.action('wallet.register','register');begin=p.action('wallet.auth.begin','auth-begin')
    credential=p.action('auth.create','auth-create',options=begin['options'])
    enrolled=p.action('wallet.auth.enroll','auth-enroll',challenge_id=begin['challenge_id'],credential=credential)
    require(enrolled['activation_state']=='TERMS_REQUIRED','enrollment accepted terms implicitly')
    active=p.action('wallet.terms','terms',accepted=True,terms_version='rock-wallet-development/1')
    require(active['active'] and p.snapshot()['wallet']['membership']['entitlement']['auto_renew'] is False,'explicit activation changed monthly consent')
    p.emit('SEED_READY')
    p.wait(lambda:p.snapshot()['wallet']['available_minor']==5000)
    wallet=p.snapshot()['wallet'];p.action('wallet.consent','consent',accepted=True,terms_version=wallet['membership']['terms_version'])
    # The private authority clock begins in the guest's actual UTC month.
    p.action('wallet.bill','bill',period=time.strftime('%Y-%m',time.gmtime()))
    paid=p.wait(lambda:(w if (w:=p.snapshot()['wallet'])['billed_minor']==888 else None))
    require(paid['available_minor']==4112 and len(paid['bills'])==1,'one paid simulator month required')
    p.remote('paid')
    done=p.wait(lambda:(v if (v:=p.action('remote.status','paid'))['state'] in ('succeeded','failed','cancelled','indeterminate','rejected') else None))
    require(done['state']=='succeeded' and done['remote']['output']==OUTPUT and done['remote']['execution']['kind']=='actual_linux_isolated_process' and done['remote']['execution']['socket_syscall_denied'] and done['remote']['execution']['wallet_path_visible'] is False,'actual isolated cloud execution required')
    report['paid_remote']=done
    p.action('wallet.consent','cancel-renew',accepted=False,terms_version=wallet['membership']['terms_version'])
    p.emit('EXPIRE_READY')
    expired=p.wait(lambda:(w if (w:=p.snapshot()['wallet'])['membership']['entitlement']['access_allowed'] is False else None))
    require(expired['billed_minor']==888 and expired['available_minor']==4112 and not expired['membership']['entitlement']['auto_renew'],'expiry unexpectedly added a debit')
    p.remote('expired');report['expired_denial']=p.denied('expired')
    p.action('registry.refresh','refresh-expired')
    p.wait(lambda:p.snapshot()['registry']['status']=='ready')
    p.local('local-expired');require(p.action('remote.status','paid')['remote']==done['remote'],'nonpayment erased completed remote result')
    report['wallet_before_suspend']={'available_minor':expired['available_minor'],'billed_minor':expired['billed_minor'],'bill_count':len(expired['bills']),'auto_renew':False}
    p.emit('SUSPEND_READY');p.wait(lambda:p.snapshot()['wallet'] is None)
    p.action('registry.refresh','refresh-revoked')
    denied=p.wait(lambda:(s if '403' in str((s:=p.snapshot())['registry'].get('last_error')) else None))
    report['revoked_registry']={'status':denied['registry']['status'],'last_error':denied['registry']['last_error']}
    p.remote('revoked');report['revoked_denial']=p.denied('revoked')
    p.local('local-revoked');require(p.action('remote.status','paid')['remote']==done['remote'],'revocation erased locally retained completed output')
    report['database']=database();report['completed_local_jobs']=p.jobs
    require(len(report['database']['local'])==3 and len(report['database']['remote'])==4,'unexpected local or remote rows')
    require(environment()['processes']==report['environment']['processes'],'guest services restarted during proof')
    report['status']='PASS'


def main():
    require([v for v in Path('/proc/cmdline').read_text().split() if v.startswith('rock.service-access.verify=')]==[FLAG],'one exact test flag required')
    require(sys.platform=='linux' and os.geteuid()==0 and os.uname().machine=='aarch64','root ARM64 guest required')
    p=Probe();report={'schema':'rock-purchaser-services-guest/1','status':'RUNNING','boot_id':p.boot_id,'scope':'real UID1000 OS IPC and UID1004 public software authenticator; native GUI and hardware authentication NOT_RUN','simulation_only':True}
    try:execute(p,report)
    except BaseException as error:
        report.update(status='FAIL',error_type=type(error).__name__)
        if isinstance(error,CheckFailed):report['error_label']=str(error)[:180]
    finally:
        report.update(events=p.events,children=p.children,shutdown={'normal_init':True,'gui':False})
        raw=canonical(report)+b'\n'
        try:
            with PROOF.with_suffix('.tmp').open('wb') as stream:stream.write(raw);stream.flush();os.fsync(stream.fileno())
            os.replace(PROOF.with_suffix('.tmp'),PROOF)
            fd=os.open('/data',os.O_RDONLY|os.O_DIRECTORY)
            try:os.fsync(fd)
            finally:os.close(fd)
            print('\nROCK_SERVICE_GUEST_'+report['status']+' '+json.dumps({'boot_id':p.boot_id,'proof_sha256':digest(raw)}),flush=True)
        finally:
            os.sync();subprocess.run(['/sbin/poweroff'],check=True,timeout=10)
    return 0 if report['status']=='PASS' else 1

if __name__=='__main__':sys.exit(main())

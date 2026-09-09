#!/usr/bin/env python3
"""Two real stage0 native activation boots, driven only by bounded QMP input.

Linux/root-coordinated QEMU slot only. Uses an unpatched new purchaser profile.
The interactive command mailbox is host-only; no guest business API or seed is
available. Closed DB checks prove one local activation and zero Wallet mutations.
"""
import argparse
from contextlib import closing
from datetime import datetime, timezone
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import shutil
import sqlite3
import struct
import subprocess
import sys
import tempfile
import time

ROOT=Path(__file__).resolve().parents[2]
sys.path[:0]=[str(ROOT/'src'),str(ROOT/'os'),str(ROOT/'os/desktop'),str(ROOT/'os/ui')]
from service_access import serve, profile
from wallet_backend.server import PUBLIC_OWNER_TOKEN
from service_access.os_client import binding
import closed_services
from replay_qmp import Monitor
from operations.state import canonical, digest, require
SPEC=importlib.util.spec_from_file_location('operations_native_input',ROOT/'os/ui/verify-native.py')
native=importlib.util.module_from_spec(SPEC);SPEC.loader.exec_module(native)


def sha(path):
    with Path(path).open('rb') as stream:return hashlib.file_digest(stream,'sha256').hexdigest()


def backend_path(private):
    require(private.parent==Path('/var/tmp') and re.fullmatch('rock-activation-native-[0-9]{4}',private.name),
            'new fixed-prefix native proof directory required')
    return Path('/var/tmp/rock-star-closed-services')/private.name


def save(path,value):
    temporary=path.with_suffix('.tmp')
    with temporary.open('w') as stream:
        stream.write(json.dumps(value,indent=2,ensure_ascii=False)+'\n');stream.flush();os.fsync(stream.fileno())
    os.replace(temporary,path)


def cat(image,path):
    result=subprocess.run(['debugfs','-R','cat '+path,str(image)],capture_output=True,timeout=30)
    require(result.returncode==0 and result.stdout,'missing stopped image file '+path)
    return result.stdout


class EventMonitor(Monitor):
    def __init__(self,path):self.events=[];super().__init__(path)
    def read(self):
        result=super().read()
        if 'event' in result:self.events.append(result)
        return result

    def drain_exited(self):
        """After wait(), retain actual frames queued before peer exit, then EOF."""
        self.connection.settimeout(1)
        count=0
        for _ in range(256):
            raw=self.stream.readline(65537)
            if not raw:return {'eof':True,'queued_frames':count}
            require(len(raw)<=65536 and raw.endswith(b'\n'),'invalid final QMP frame')
            value=json.loads(raw)
            require(isinstance(value,dict),'invalid final QMP object')
            if 'event' in value:self.events.append(value)
            count+=1
        raise ValueError('final QMP frame bound exceeded')


def rows(path,query):
    with closing(sqlite3.connect('file:'+str(path)+'?mode=ro',uri=True)) as db:
        db.row_factory=sqlite3.Row;db.execute('PRAGMA query_only=ON');db.execute('BEGIN')
        require(db.execute('PRAGMA integrity_check').fetchone()[0]=='ok','closed DB integrity failed')
        return [dict(row) for row in db.execute(query)]


def validate_boot(text,events,exit_code,sequence):
    lines=text.replace('\r','').splitlines()
    require(exit_code==0,'actual boot did not complete normally')
    require(any(event.get('event')=='SHUTDOWN' and event.get('data',{}).get('guest') is True for event in events),
            'guest QMP shutdown missing')
    expected=f'ROCK_AB_SELECTED slot=A sequence={sequence} reason=committed'
    require([line for line in lines if line.startswith('ROCK_AB_SELECTED ')]==[expected] and
            lines.count('ROCK_AB_SWITCH_ROOT device=/dev/vda')==1 and lines.count('ROCK_AB_HEALTH_CONFIRMED')==1,
            'exact signed stage0 selection and health required')
    facts=[line for line in lines if line.startswith('ROCK_ACTIVATION_BOOT_VERIFIED ')]
    require(len(facts)==1 and re.fullmatch('ROCK_ACTIVATION_BOOT_VERIFIED [0-9a-f]{64}',facts[0]),'one actual boot-facts publisher required')
    require('ROCK_AB_HEALTH_FAILED_REBOOT' not in text and 'ROCK_ACTIVATION_BOOT_UNAVAILABLE' not in text,'boot health failed')
    for marker in ('stopped /usr/bin/rock-ui','Stopping crond:','Stopping network:',
                   'EXT4-fs (vdb): unmounting filesystem','Sent SIGTERM to all processes','reboot: Power down'):
        require(marker in text,'normal stage0/init marker missing '+marker)
    return {'slot':'A','sequence':sequence,'selection_reason':'committed','boot_facts_sha256':facts[0].split()[1]}


def validate_roles(entry):
    timeline=entry['timeline'];phase=entry['phase']
    required=('01-before-activation','02-after-activation') if phase==1 else ('03-retained-activation',)
    positions=[]
    for name in required:
        indices=[i for i,value in enumerate(timeline) if value.get('action')=='capture' and value.get('name')==name]
        require(len(indices)==1,'required native capture role missing or duplicated');positions.extend(indices)
    taps=[i for i,value in enumerate(timeline) if value.get('action')=='click' and value.get('role')=='activation']
    require(len(taps)==(1 if phase==1 else 0),'exactly one first-boot activation click required')
    if phase==1:require(positions[0]<taps[0]<positions[1],'native capture/click ordering mismatch')
    return {'required_capture_roles':list(required),'recorded_activation_clicks':len(taps),
            'screenshot_meaning':'REQUIRES_INDEPENDENT_VISUAL_ADOPTION'}


def cleanup_owners(monitor,process,stop_backend):
    errors=[]
    if monitor is not None:
        try:monitor.close()
        except Exception as failure:errors.append('monitor '+type(failure).__name__)
    if process is not None:
        try:
            if process.poll() is None:
                errors.append('owned failed-test QEMU terminated; not normal shutdown')
                try:process.terminate()
                except Exception as failure:errors.append('QEMU terminate '+type(failure).__name__)
                try:process.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    try:process.kill()
                    except Exception as failure:errors.append('QEMU kill '+type(failure).__name__)
                    try:process.wait(timeout=10)
                    except Exception as failure:errors.append('QEMU wait '+type(failure).__name__)
                except Exception as failure:errors.append('QEMU wait '+type(failure).__name__)
        except Exception as failure:errors.append('QEMU state '+type(failure).__name__)
    if stop_backend is not None:
        try:stop_backend()
        except Exception as failure:errors.append('backend '+type(failure).__name__)
    return errors


def capture_ready(ui,folder,entry,*,timeout=60,clock=time.monotonic,sleep=time.sleep):
    """Keep early black frames; never lower the existing PNG evidence bound."""
    started=clock();attempt=0;entry['startup_frames']=[]
    while True:
        path=folder/f'00-startup-{attempt:02}.png'
        ui.monitor.command('screendump',{'filename':str(path),'format':'png'})
        try:
            evidence=native.png_evidence(path)
        except AssertionError:
            header=path.read_bytes()[:24]
            require(len(header)==24 and header[:8]==b'\x89PNG\r\n\x1a\n' and header[12:16]==b'IHDR' and
                    struct.unpack('>II',header[16:24])==(720,960) and path.stat().st_size<4096,
                    'malformed startup framebuffer')
            entry['startup_frames'].append({'name':path.name,'bytes':path.stat().st_size,'sha256':sha(path),
                'elapsed_seconds':clock()-started,'accepted':False})
            require(clock()-started<timeout,'native framebuffer remained blank after bounded startup wait')
            attempt+=1;sleep(2);continue
        entry['startup_frames'].append({**evidence,'elapsed_seconds':clock()-started,'accepted':True})
        shutil.copy2(path,folder/'00-verified-boot.png')
        entry['screenshots'].append(native.png_evidence(folder/'00-verified-boot.png'))
        return


def closed_state(data,private,expected_binding,expected_profile):
    before=sha(data)
    with tempfile.TemporaryDirectory(prefix='stopped-',dir=private) as temporary:
        def copied(guest,name):
            raw=cat(data,guest);require(raw.startswith(b'SQLite format 3\0'),'SQLite expected')
            path=Path(temporary)/name;path.write_bytes(raw);path.chmod(0o600)
            for suffix in ('-wal','-shm','-journal'):
                extra=subprocess.run(['debugfs','-R','cat '+guest+suffix,str(data)],capture_output=True,timeout=30).stdout
                require(not extra,'normally stopped DB left a sidecar')
            return path
        database=copied('/platform/activation/state.sqlite3','activation.db')
        activation=rows(database,"SELECT id,kind,payload,state,revision,result FROM objects")
        receipts=rows(database,'SELECT key,actor,payload,response FROM receipts')
        require(len(activation)==len(receipts)==1 and activation[0]['id']=='activation' and activation[0]['kind']=='activation' and
                activation[0]['state']=='ACTIVE','exactly one immutable activation required')
        record=json.loads(activation[0]['payload']);response=json.loads(receipts[0]['response'])
        request=json.loads(receipts[0]['payload'])
        require(request=={'op':'activation.activate','key':receipts[0]['key']} and
                response['ok'] is True and response['result']['state']=='ACTIVE' and
                response['result']['activated_at']==record['activated_at'],'activation receipt mismatch')
        for field in ('wallet_registration_requested','wallet_terms_accepted','monthly_consent_accepted'):
            require(response['result'][field] is False,'activation accepted Wallet consent')
        require(record['device_ref']==expected_binding['device_ref'],'activation device differs')
        expected_reference='scope-'+digest([expected_binding['authority_id'],expected_binding['consumer_id'],expected_binding['device_ref']])
        require(record['identity_reference']==expected_reference and
                response['result']['identity_reference_sha256']==digest(expected_reference),'activation identity scope mismatch')
        require(record['profile_sha256']==response['result']['profile_sha256']==digest(expected_profile) and
                receipts[0]['actor']=='device:'+digest([expected_binding['device_ref'],expected_reference]) and
                response['execution_authorized'] is False and response['hardware_action_performed'] is False,
                'activation image/actor/effect binding mismatch')
        proxy=copied('/wallet/backend-cache/remote-cache.db','proxy.db')
        require(rows(proxy,'SELECT key FROM requests')==[],'activation performed a Wallet mutation')
        cached=rows(proxy,'SELECT payload FROM snapshot');require(len(cached)==1,'Wallet projection missing')
        wallet=json.loads(cached[0]['payload']);service=wallet['service_access']
        require(service['paid_state_reason']=='WALLET_UNREGISTERED' and service['auto_renew'] is False and
                service['device_eligible'] is True and all(service[key]==expected_binding[key]
                    for key in ('authority_id','consumer_id','device_ref')),'unexpected Wallet registration/eligibility')
        for field in ('available_minor','held_minor','billed_minor'):
            require(wallet[field]==0,'unexpected financial effect')
        marker=json.loads(cat(data,'/platform/purchaser-service-binding.json'))
        require(marker==expected_binding,'persistent purchaser binding changed')
        require(sha(data)==before,'stopped verification changed userdata')
        return {'activation':activation,'receipt':receipts,'activation_count':1,'wallet_mutation_requests':0,
                'wallet_unregistered':True,'wallet_available_minor':0,'wallet_held_minor':0,
                'wallet_billed_minor':0,'binding':marker,'private_database_exported':False}


def command(args):
    path=args.private/'commands.jsonl'
    value={'action':args.action}
    if args.action=='capture':
        require(args.name is not None and re.fullmatch('[A-Za-z0-9-]{1,64}',args.name),'safe capture name required')
        value['name']=args.name
    else:
        require(type(args.x) is int and type(args.y) is int and 0<=args.x<720 and 0<=args.y<960,'on-screen position required')
        value.update(x=args.x,y=args.y,role=args.role)
    require(path.is_file() and not path.is_symlink(),'running private command mailbox required')
    fd=os.open(path,os.O_WRONLY|os.O_APPEND|os.O_NOFOLLOW)
    try:os.write(fd,(canonical(value)+'\n').encode());os.fsync(fd)
    finally:os.close(fd)


def verify(args):
    require(sys.platform=='linux','Linux proof only')
    os.umask(0o077)
    backend_state=backend_path(args.private)
    require(not args.private.exists() and not args.output.exists(),'new private and evidence directories required')
    args.private.mkdir(mode=0o700);args.output.mkdir(parents=True,mode=0o755)
    report={'schema':'rock-native-stage0-activation/1','status':'RUNNING','started_utc':datetime.now(timezone.utc).isoformat(),
        'boots':[],'simulation_only':True,'guest_image_patched':False,'guest_business_ipc_used':False,
        'physical_device':'NOT_RUN','financial_provider':'NOT_RUN','private_database_exported':False,
        'proof_scope':'actual stage0, recorded native input and durable rows; screenshot meaning needs independent visual adoption',
        'native_one_tap_visual_verified':False,'visual_adoption_required':True}
    report_path=args.output/'report.json';save(report_path,report)
    mailbox=args.private/'commands.jsonl';mailbox.touch(mode=0o600)
    monitor=process=None;service=None;backend=None;error=None
    try:
        freeze=json.loads((args.images/'freeze-manifest.json').read_text())
        report['base_freeze_sha256']=sha(args.images/'freeze-manifest.json')
        source=dict(freeze['source_sha256'])
        for name in ('os/operations/verify_native.py','os/ui/verify-native.py','os/ui/guest-ui-evidence.py','os/ui/replay_qmp.py'):
            actual=sha(ROOT/name);require(name not in source or source[name]==actual,'source conflict');source[name]=actual
        require(all(sha(ROOT/name)==value for name,value in source.items()),'frozen source changed')
        report['source_sha256']=source
        base_hash={name:freeze['files_sha256'][name] for name in profile.IMAGE_NAMES}
        prepared=serve.prepare(backend_state,backend_state/'launcher.json')
        service={'config':str(backend_state/'launcher.json'),'sha256':prepared['config_sha256'],'authority_id':prepared['config']['authority_id']}
        result=profile.prepare_profile(args.images,args.private/'profile',expected_sha256=base_hash,
            service_configuration=prepared['device'],wallet_configuration=prepared['wallet'],wallet_token=PUBLIC_OWNER_TOKEN,
            authenticator_configuration={'schema_version':1,'kind':'public-software-test-authenticator','device_ref':prepared['device']['device_ref']})
        report['profile']=result;report['authority_id']=service['authority_id']
        require(all(sha(args.images/name)==value for name,value in base_hash.items()),'base changed')
        a,b,data=(args.private/name for name in ('slot-a.ext4','slot-b.ext4','userdata.ext4'))
        shutil.copyfile(args.private/'profile/rootfs.ext4',a)
        with b.open('xb') as stream:stream.truncate(a.stat().st_size)
        with data.open('xb') as stream:stream.truncate(256*1024**2)
        subprocess.run(['mkfs.ext4','-q','-F','-L','rock-activation-data',str(data)],check=True,capture_output=True,timeout=60)
        backend=closed_services.ensure(service);report['backend_pid']=backend['pid']
        backend_child=closed_services.OWNED_CHILDREN.get(backend['pid'])
        require(backend.get('reused') is False and backend_child is not None,'new owned backend child required')
        save(report_path,report)
        offset=0
        for phase in (1,2):
            entry={'phase':phase,'status':'RUNNING','input_events':[],'screenshots':[],'timeline':[],'host_power_commands':0}
            report['boots'].append(entry);save(report_path,report)
            folder=args.output/f'boot-{phase}';folder.mkdir()
            log=folder/'boot.log';qmp=args.private/f'qmp-{phase}.sock'
            argv=['qemu-system-aarch64','-machine','virt-10.0,gic-version=3','-accel','tcg','-cpu','cortex-a53',
                '-m','1024','-smp','2','-display','none','-serial','file:'+str(log),'-monitor','none','-no-reboot',
                '-qmp',f'unix:{qmp},server=on,wait=off','-kernel',str(args.private/'profile/Image'),
                '-initrd',str(args.private/'profile/stage0.cpio.gz'),'-append','console=ttyAMA0 vt.global_cursor_default=0 ro rootwait panic=-1',
                '-drive',f'if=none,file={a},format=raw,id=slota','-device','virtio-blk-pci,drive=slota,addr=0x1',
                '-drive',f'if=none,file={data},format=raw,id=userdata','-device','virtio-blk-pci,drive=userdata,addr=0x2',
                '-object','rng-random,filename=/dev/urandom,id=rockrng','-device','virtio-rng-pci,rng=rockrng,addr=0x3',
                '-drive',f'if=none,file={b},format=raw,id=slotb','-device','virtio-blk-pci,drive=slotb,addr=0x4',
                '-device','virtio-gpu-pci,xres=720,yres=960,addr=0x6','-netdev','user,id=purchaser',
                '-device','virtio-net-pci,netdev=purchaser,addr=0x7,romfile=',
                '-device','virtio-keyboard-pci,addr=0x8','-device','virtio-tablet-pci,addr=0x9']
            with (folder/'qemu.log').open('xb') as output:
                process=subprocess.Popen(argv,stdin=subprocess.DEVNULL,stdout=output,stderr=subprocess.STDOUT)
            entry.update(qemu_pid=process.pid,command=argv);save(report_path,report)
            deadline=time.monotonic()+20
            while not qmp.exists():
                require(process.poll() is None and time.monotonic()<deadline,'QEMU monitor unavailable');time.sleep(.1)
            monitor=EventMonitor(qmp);ui=native.NativeInput(monitor,folder,entry)
            deadline=time.monotonic()+args.timeout;ready=False
            print(f'Boot {phase} started; bounded host input mailbox {mailbox}',flush=True)
            while process.poll() is None:
                require(time.monotonic()<deadline,'native proof deadline expired')
                text=log.read_text(errors='replace') if log.exists() else ''
                require('ROCK_AB_HEALTH_FAILED_REBOOT' not in text and 'ROCK_ACTIVATION_BOOT_UNAVAILABLE' not in text,'actual stage0 health/publisher failed')
                if not ready and 'ROCK_ACTIVATION_BOOT_VERIFIED ' in text:
                    capture_ready(ui,folder,entry);ready=True;save(report_path,report)
                    print(f'Boot {phase} stage0 verified; inspect screenshot then send UI capture/click actions',flush=True)
                require(mailbox.stat().st_size<=65536,'input mailbox bound')
                with mailbox.open() as stream:
                    stream.seek(offset);lines=stream.readlines();offset=stream.tell()
                for line in lines:
                    require(line.endswith('\n'),'incomplete command');value=json.loads(line)
                    require(ready,'UI input before verified boot is not part of this proof')
                    if value.get('action')=='capture':
                        require(set(value)=={'action','name'} and re.fullmatch('[A-Za-z0-9-]{1,64}',value['name']) and
                                not (folder/(value['name']+'.png')).exists(),'invalid/duplicate capture')
                        ui.capture(value['name'])
                    else:
                        require(set(value)=={'action','x','y','role'} and value['action']=='click' and
                                value['role'] in ('navigation','activation') and
                                type(value['x']) is int and type(value['y']) is int and 0<=value['x']<720 and 0<=value['y']<960,'bounded click required')
                        ui.click(value['x'],value['y'])
                    entry['timeline'].append({**value,'sent_unix':time.time()})
                    save(report_path,report)
                try:monitor.command('query-status')
                except (OSError,RuntimeError):
                    require(process.wait(timeout=5)==0,'QEMU monitor failed before normal exit')
                time.sleep(.2)
            entry['qemu_exit_code']=process.wait(timeout=5)
            entry['qmp_exit_drain']=monitor.drain_exited()
            entry['qmp_events']=monitor.events;monitor.close();monitor=None
            text=log.read_text(errors='replace')
            require(ready,'boot publisher never became ready')
            entry['actual_boot']=validate_boot(text,entry['qmp_events'],entry['qemu_exit_code'],result['stage0']['output_factory']['manifest']['sequence'])
            entry['native_roles']=validate_roles(entry)
            check=subprocess.run(['e2fsck','-f','-n',str(data)],capture_output=True,timeout=60)
            (folder/'filesystem.log').write_bytes(check.stdout+check.stderr);require(check.returncode==0,'closed userdata not clean')
            require(sha(a)==result['images']['rootfs.ext4']['sha256'],'running root image changed')
            expected_profile={'device_ref':result['binding']['device_ref'],'hardware_id':'rock-virt-aarch64',
                              'release':result['stage0']['output_factory'],'protected_binding_sha256':digest(result['binding'])}
            state=closed_state(data,args.private,result['binding'],expected_profile)
            if phase==2:require(state==report['boots'][0]['closed_state'],'restart changed activation/receipt or Wallet state')
            entry.update(status='PASS',closed_state=state,userdata_sha256=sha(data),normal_init_shutdown=True,
                owned_qemu_stopped=True,userdata_clean=True,stage0_booted=True,boot_log_sha256=sha(log))
            process=None;save(report_path,report)
            require(closed_services.existing(backend_state/'supervisor',Path(service['config']),service['authority_id']) is not None,
                    'backend stopped with OS')
        stopped=closed_services.stop(service);require(stopped['status']=='STOPPED','backend did not stop normally')
        report['backend_exit_code']=backend_child.wait(timeout=5)
        require(report['backend_exit_code']==0,'backend failed after reporting STOPPED')
        backend=None
        authority=backend_state/'authority'
        require(rows(authority/'wallet/entitlement.db','SELECT account_id FROM accounts')==[],'Wallet account created')
        financial={table:rows(authority/'wallet/wallet-simulator.db','SELECT COUNT(*) AS n FROM '+table)[0]['n']
                   for table in ('wallet_journals','wallet_sales','wallet_bills','wallet_withdrawals','wallet_consents')}
        require(all(n==0 for n in financial.values()),'Wallet financial effect')
        require(all(sha(ROOT/name)==value for name,value in source.items()) and
                all(sha(args.images/name)==value for name,value in base_hash.items()),'source/base changed')
        require(all(sha(Path(record['path']))==record['sha256'] for record in result['images'].values()),'profile image changed')
        report.update(status='PASS',finished_utc=datetime.now(timezone.utc).isoformat(),backend_stopped_normally=True,
            backend_alive_across_os_poweroff=True,source_images_unchanged=True,owned_qemu_stopped=True,
            financial_counts=financial,activation_retained_after_restart=True)
    except BaseException as failure:
        error=failure;report.update(status='FAIL',error_type=type(failure).__name__,error=str(failure))
    finally:
        cleanup=cleanup_owners(monitor,process,(lambda:closed_services.stop(service)) if backend is not None else None)
        report['cleanup']=cleanup
        if cleanup:report['status']='FAIL'
        try:save(report_path,report)
        except Exception as failure:
            print('Evidence save failed after independent owner cleanup: '+type(failure).__name__,file=sys.stderr,flush=True)
            if error is None:error=failure
    if error is not None:raise error
    require(report['status']=='PASS' and not report['cleanup'],'proof cleanup incomplete')
    print('PASS actual stage0 durable activation retained across two normal OS shutdowns; Wallet mutations zero; visual adoption required',flush=True)


def main():
    parser=argparse.ArgumentParser(description=__doc__);sub=parser.add_subparsers(dest='mode',required=True)
    run=sub.add_parser('run');run.add_argument('--images',type=Path,required=True);run.add_argument('--private',type=Path,required=True)
    run.add_argument('--output',type=Path,required=True);run.add_argument('--timeout',type=int,default=1200)
    send=sub.add_parser('input');send.add_argument('--private',type=Path,required=True)
    send.add_argument('--action',choices=('capture','click'),required=True);send.add_argument('--name')
    send.add_argument('--x',type=int);send.add_argument('--y',type=int)
    send.add_argument('--role',choices=('navigation','activation'),default='navigation')
    args=parser.parse_args()
    if args.mode=='input':command(args)
    else:
        require(60<=args.timeout<=1800,'bounded proof timeout required');verify(args)


if __name__=='__main__':main()

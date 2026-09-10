#!/usr/bin/env python3
"""Actual native authentication UI, isolated public authenticator and closed ledger.

Only QMP evdev input drives business operations. New rootfs copy receives two
test files; original images and every existing userdata image stay untouched.
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

HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[1]
sys.path.insert(0,str(HERE))


def load(name,path):
    spec=importlib.util.spec_from_file_location(name,path);module=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module);return module


native=load('auth_native_input',HERE/'verify-native.py')
power=load('auth_power_monitor',HERE/'verify-power.py')
observer=load('auth_native_observer',HERE/'guest-ui-auth-evidence.py')
require=observer.base.require
digest=native.digest_file


def utc():return datetime.now(timezone.utc).isoformat()


def debug(image,command,*,write=False,cwd=None):
    result=subprocess.run(['debugfs',*(['-w'] if write else []),'-R',command,str(image)],
        cwd=cwd,capture_output=True,timeout=30)
    require(result.returncode==0,'debugfs failed')
    return result.stdout


def inject(image,output):
    hook=b'''#!/bin/sh
case "${1:-start}" in
start) case " $(cat /proc/cmdline) " in
  *" rock.ui.auth.verify=1 "*) /usr/bin/python3 -I -B /usr/libexec/rock-ui-auth-evidence.py & ;;
esac;;
esac
'''
    files=[('guest-ui-auth-evidence.py','/usr/libexec/rock-ui-auth-evidence.py',(HERE/'guest-ui-auth-evidence.py').read_bytes()),
           ('S99rock-ui-auth-verify','/etc/init.d/S99rock-ui-auth-verify',hook)]
    records=[]
    for name,target,raw in files:
        require(b'Inode:' not in debug(image,'stat '+target),'test injection would replace existing file')
        (output/name).write_bytes(raw)
        require(b'Allocated inode' in debug(image,'write '+name+' '+target,write=True,cwd=output),'test injection failed')
        for field,value in [('mode','0100755'),('uid','0'),('gid','0')]:debug(image,'set_inode_field '+target+' '+field+' '+value,write=True)
        require(debug(image,'cat '+target)==raw,'injected source bytes differ')
        records.append({'path':target,'sha256':hashlib.sha256(raw).hexdigest(),'uid':0,'gid':0,'mode':'0755'})
    return records


def embedded(image):
    mappings={'os/platform/service.py':'/usr/lib/rock-platform/service.py',
        **{'os/wallet_auth/'+name:'/usr/lib/rock-platform/wallet_auth/'+name for name in ('daemon.py','health.py','fixture.py','protocol.py','service.py')}}
    result={}
    for source,target in mappings.items():
        require(hashlib.sha256(debug(image,'cat '+target)).hexdigest()==digest(ROOT/source),'source differs from frozen target '+source)
        result[source]=digest(ROOT/source)
    result['target:/usr/bin/rock-ui']=hashlib.sha256(debug(image,'cat /usr/bin/rock-ui')).hexdigest()
    return result


def private_disk(data,proof,output):
    # Transient private copies are removed even when validation fails.
    with tempfile.TemporaryDirectory(prefix='rock-auth-private-') as temporary:
        directory=Path(temporary);paths={}
        for kind,guest in observer.PATHS.items():
            filename=Path(guest).name;paths[kind]=directory/filename
            for suffix in ('','-wal','-shm'):
                raw=debug(data,'cat '+guest.removeprefix('/data')+suffix)
                if suffix=='' or raw:
                    with (directory/(filename+suffix)).open('xb') as stream:stream.write(raw)
                    (directory/(filename+suffix)).chmod(0o600)
        actual=observer.final_database(observer.rows(paths))
        require(actual==proof['database'],'stopped private ledger differs from guest evidence')
        powerfile=directory/'power.sqlite3'
        powerfile.write_bytes(debug(data,'cat /system/power.db'));powerfile.chmod(0o600)
        # Root power uses DELETE journal; complete normal shutdown is required.
        with closing(sqlite3.connect('file:'+str(powerfile)+'?mode=ro',uri=True)) as db:
            db.row_factory=sqlite3.Row;db.execute('PRAGMA query_only=ON')
            records=[dict(row) for row in db.execute('SELECT * FROM requests ORDER BY created_unix')]
        require(len(records)==1,'expected exactly one native normal power request')
        row=records[0];request=json.loads(row['request_json']);receipt=json.loads(row['receipt_json'])
        require(observer.ui_key(row['key']) and row['operation']=='poweroff' and row['status']=='dispatched' and
            row['command_returncode']==0 and request=={'v':1,'op':'poweroff','key':row['key']} and
            receipt['result']['key']==row['key'] and receipt['result']['accepted'] is True and row['boot_id']==proof['boot_id'],
            'normal native power receipt differs')
        return {'private_database_matches_guest':True,'temporary_private_copies_retained':False,
            'power':{key:row[key] for key in ('key','operation','boot_id','status','command_returncode','dispatched_unix')},
            'data_sha256':digest(data)}


class Input(native.NativeInput):
    def pin(self,correct):
        # Do not use NativeInput.type/keys: their generic recorder would log the
        # entered digits. Both values are public fixtures, still omitted here.
        for key in (['0']*4 if correct else ['1','2','3','4']):
            self.monitor.command('send-key',{'keys':[{'type':'qcode','data':key}],'hold-time':80})
            time.sleep(.15)
        self.record('public-test-pin-entry',{'digits':4,'expected':'accepted' if correct else 'rejected','value_recorded':False})
    def bottom(self):
        for _ in range(8):self.keys(['pgdn'])
    def wallet(self):
        self.click(606,913);time.sleep(2)


def validate(proof):
    require(proof.get('status')=='PASS' and proof.get('schema')=='rock-native-auth-ui-proof/1','native observer failed')
    require(proof['observer_business_mutations']==proof['observer_power_requests']==0,'observer executed business or shutdown action')
    require(proof['hardware_authenticator']==proof['biometric']==proof['blackberry']=='NOT_RUN','hardware scope differs')
    require([stage['stage'] for stage in proof['stages']]==list(range(1,13)),'native ceremony stages incomplete')
    require(proof['database']['registration_and_assertion_reverified'] is True and proof['database']['pin_in_receipts'] is False,'real signature join missing')
    require(proof['environment_initial']['processes']==proof['environment_final']['processes'],'native services restarted')
    require(proof['wallet_final']['available_minor']==5000 and proof['wallet_final']['held_minor']==0 and
        proof['wallet_final']['auto_renew'] is False and proof['wallet_final']['bill_count']==0,'final money or monthly consent differs')


def run(artifacts,parent):
    output=Path(tempfile.mkdtemp(prefix='auth-ui-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'-',dir=parent))
    original=artifacts/'rootfs.ext4';kernel=artifacts/'Image';rootfs=output/'test-rootfs.ext4';data=output/'userdata.ext4';log=output/'boot.log'
    source_paths=[HERE/name for name in ('verify-auth.py','guest-ui-auth-evidence.py','verify-native.py','verify-power.py','replay_qmp.py')]
    report={'schema':'rock-native-auth-ui-harness/1','status':'RUNNING','started_utc':utc(),
        'scope':'actual native QEMU framebuffer/evdev with independent read-only crypto/ledger observer',
        'hardware_authenticator':'NOT_RUN','biometric':'NOT_RUN','real_money':'NOT_RUN','blackberry':'NOT_RUN',
        'mismatched_quote_negative':'native C guard and separate real crypto/API tests; not a fabricated GUI case',
        'input_events':[],'screenshots':[],'qmp_events':[],'qmp_commands':[],
        'source_sha256':{str(p.relative_to(ROOT)):digest(p) for p in source_paths},
        'images_before':{p.name:digest(p) for p in (kernel,original)}}
    process=monitor=None
    print('Native authentication evidence: '+str(output),flush=True)
    try:
        freeze=json.loads((artifacts/'freeze-manifest.json').read_text())
        require(all(digest(artifacts/name)==expected for name,expected in freeze['files_sha256'].items()),'frozen artifact hash differs')
        require(all(digest(ROOT/name)==expected for name,expected in freeze['source_sha256'].items()),'frozen source hash differs')
        report['freeze_manifest_sha256']=digest(artifacts/'freeze-manifest.json')
        report['frozen_source_sha256']=freeze['source_sha256'];report['frozen_files_sha256']=freeze['files_sha256']
        report['embedded_source_sha256']=embedded(original)
        built=json.loads((artifacts/'embedded-source-check.json').read_text())
        require(built['status']=='PASS' and built['files']['rock-ui']['sha256']==report['embedded_source_sha256']['target:/usr/bin/rock-ui'],
            'native executable differs from compiled-source freeze join')
        report['embedded_source_check_sha256']=digest(artifacts/'embedded-source-check.json')
        shutil.copyfile(original,rootfs)
        report['test_injection']=inject(rootfs,output);report['test_rootfs_sha256']=digest(rootfs)
        with data.open('xb') as stream:stream.truncate(128*1024*1024)
        subprocess.run(['mkfs.ext4','-q','-F','-L','rock-data',str(data)],check=True,timeout=30)
        with tempfile.TemporaryDirectory(prefix='rock-auth-qmp-') as temporary:
            qmp=Path(temporary)/'qmp.sock'
            command=['qemu-system-aarch64','-machine','virt-10.0,gic-version=3','-accel','tcg','-cpu','cortex-a53',
                '-m','1024','-smp','2','-display','none','-serial','stdio','-monitor','none','-qmp',f'unix:{qmp},server=on,wait=off',
                '-no-reboot','-nic','none','-kernel',str(kernel),'-append',
                'console=ttyAMA0 vt.global_cursor_default=0 root=/dev/vda ro rootflags=noload rootwait panic=-1 rock.ui.auth.verify=1',
                '-drive',f'if=none,file={rootfs},format=raw,id=osdisk,readonly=on','-device','virtio-blk-pci,drive=osdisk,addr=0x1',
                '-drive',f'if=none,file={data},format=raw,id=userdata','-device','virtio-blk-pci,drive=userdata,addr=0x2',
                '-object','rng-random,filename=/dev/urandom,id=rockrng','-device','virtio-rng-pci,rng=rockrng,addr=0x3',
                '-device','virtio-gpu-pci,xres=720,yres=960,addr=0x4','-device','virtio-keyboard-pci,addr=0x5','-device','virtio-tablet-pci,addr=0x6']
            report['command']=command
            with log.open('wb') as logfile:
                process=subprocess.Popen(command,stdin=subprocess.DEVNULL,stdout=logfile,stderr=subprocess.STDOUT)
                deadline=time.monotonic()+10
                while not qmp.exists():
                    require(process.poll() is None and time.monotonic()<deadline,'QMP did not start');time.sleep(.1)
                monitor=power.Monitor(qmp,report);ui=Input(monitor,output,report)
                def wait(marker,seconds=35):
                    deadline=time.monotonic()+seconds
                    while time.monotonic()<deadline:
                        content=log.read_text(errors='replace').replace('\r','')
                        require('ROCK_UI_AUTH_FAIL' not in content,'guest observer failed')
                        if any(line==marker or line.startswith(marker+' ') for line in content.splitlines()):return content
                        require(process.poll() is None,'guest ended before expected stage');time.sleep(.2)
                    raise TimeoutError('missing native stage '+marker)
                wait('ROCK_UI_AUTH_READY',150);time.sleep(3);ui.wallet();ui.capture('00-purchase-preparation')
                ui.click(360,417);wait('ROCK_UI_AUTH_REGISTERED');time.sleep(3);ui.wallet();ui.capture('01-credential-required')
                ui.click(360,537);wait('ROCK_UI_AUTH_CHALLENGE');time.sleep(.5);ui.capture('02-explicit-enrollment-pin')
                ui.click(250,420);ui.pin(False);ui.click(520,838);time.sleep(2);ui.capture('03-wrong-pin-rejected')
                wait('ROCK_UI_AUTH_WRONG_PIN_NO_SIGNATURE');ui.click(250,420);ui.pin(True);ui.capture('04-explicit-masked-test-pin')
                ui.click(520,838);wait('ROCK_UI_AUTH_ENROLLED');time.sleep(3);ui.wallet();ui.capture('05-enrolled-terms-still-required')
                ui.click(360,537);time.sleep(.4);ui.capture('06-wallet-terms-separate');ui.click(497,577)
                wait('ROCK_UI_AUTH_TERMS_ACCEPTED');time.sleep(3);ui.wallet();ui.bottom();ui.capture('07-active-no-monthly-consent')
                ui.click(360,807);ui.bottom();ui.click(250,443);ui.keys(['ctrl','a']);ui.type('50.00')
                ui.capture('08-explicit-simulator-credit');ui.click(195,521);wait('ROCK_UI_AUTH_CREDIT_PENDING');time.sleep(3)
                ui.capture('09-pending-credit');ui.click(560,700);wait('ROCK_UI_AUTH_FUNDED');time.sleep(3);ui.capture('10-settled-5000')
                ui.click(531,27);time.sleep(2);ui.click(360,697);wait('ROCK_UI_AUTH_QUOTE_NO_HOLD');time.sleep(.5)
                ui.capture('11-quote-no-hold');ui.click(190,838);wait('ROCK_UI_AUTH_QUOTE_CANCELED_NO_HOLD');time.sleep(1)
                ui.capture('12-back-without-reservation');ui.click(360,697);wait('ROCK_UI_AUTH_SECOND_QUOTE');time.sleep(.4)
                ui.capture('13-new-quote-confirmation');ui.click(250,536);ui.pin(True);ui.capture('14-explicit-transaction-pin')
                ui.click(520,838);wait('ROCK_UI_AUTH_ISSUED');time.sleep(3);ui.capture('15-verified-issue-code-hidden')
                ui.click(360,782);time.sleep(2);ui.click(360,708);wait('ROCK_UI_AUTH_READY_FOR_NATIVE_POWEROFF');time.sleep(1)
                ui.capture('16-unused-hold-canceled');ui.wallet();ui.bottom();ui.capture('17-returned-5000')
                ui.click(636,26);time.sleep(.7);ui.click(360,618);time.sleep(.5);ui.capture('18-native-power-confirmation');ui.click(497,577)
                process.wait(timeout=45);require(process.returncode==0,'QEMU exited abnormally')
            monitor.close();monitor=None
        content=log.read_text(errors='replace').replace('\r','')
        proofs=[json.loads(line.removeprefix('ROCK_UI_AUTH_PROOF ')) for line in content.splitlines() if line.startswith('ROCK_UI_AUTH_PROOF ')]
        require(len(proofs)==1,'exactly one guest proof required');proof=proofs[0];validate(proof)
        require(json.loads(debug(data,'cat /ui-auth-proof.json'))==proof,'serial/durable guest proof differs')
        require('reboot: Power down' in content and any(e.get('event')=='SHUTDOWN' and e.get('data',{}).get('guest') is True
            for e in report['qmp_events']),'actual normal guest shutdown missing')
        report['closed_disk']=private_disk(data,proof,output)
        checked=subprocess.run(['e2fsck','-f','-n',str(data)],capture_output=True,timeout=30)
        (output/'filesystem-check.log').write_bytes(checked.stdout+checked.stderr)
        with data.open('rb') as stream:stream.seek(1082);clean=struct.unpack('<H',stream.read(2))[0]&1
        require(checked.returncode==0 and clean==1 and digest(data)==report['closed_disk']['data_sha256'],'data not clean or readonly inspection changed it')
        require(len(report['screenshots'])==19,'native captures incomplete')
        (output/'ui-auth-proof.json').write_text(json.dumps(proof,ensure_ascii=False,indent=2)+'\n')
        report.update(status='PASS',guest_proof_sha256=observer.base.digest(proof),normal_native_poweroff=True,exit_code=0,filesystem_check_exit=0)
    except BaseException as error:
        report.update(status='FAIL',error_type=type(error).__name__,error_label=str(error)[:160])
        if monitor and process and process.poll() is None:
            try:monitor.command('screendump',{'filename':str(output/'failure-display.png'),'format':'png'})
            except Exception:pass
    finally:
        cleanup=[]
        if monitor:
            try:monitor.close()
            except Exception as error:cleanup.append(type(error).__name__)
        if process is not None and process.poll() is None:
            report['status']='FAIL';report['forced_cleanup']=True
            try:
                process.terminate()
                try:process.wait(timeout=5)
                except subprocess.TimeoutExpired:process.kill();process.wait(timeout=5)
            except Exception as error:cleanup.append(type(error).__name__)
        if cleanup:report.update(status='FAIL',cleanup_errors=cleanup)
        report['images_after']={p.name:digest(p) for p in (kernel,original)}
        report['source_after']={str(p.relative_to(ROOT)):digest(p) for p in source_paths}
        report['frozen_source_unchanged']=all(digest(ROOT/name)==expected for name,expected in report.get('frozen_source_sha256',{}).items())
        report['frozen_files_unchanged']=all(digest(artifacts/name)==expected for name,expected in report.get('frozen_files_sha256',{}).items())
        if report['images_after']!=report['images_before'] or report['source_after']!=report['source_sha256'] or (rootfs.exists() and digest(rootfs)!=report.get('test_rootfs_sha256')):
            report.update(status='FAIL',source_or_image_changed=True)
        if not report['frozen_source_unchanged'] or not report['frozen_files_unchanged']:report['status']='FAIL'
        report['finished_utc']=utc()
        with (output/'report.json').open('w') as stream:
            json.dump(report,stream,ensure_ascii=False,indent=2);stream.write('\n');stream.flush();os.fsync(stream.fileno())
    print(report['status']+' '+str(output),flush=True)
    return 0 if report['status']=='PASS' else 1


def self_test():
    """Actual disposable crypto/SQLite fixture plus deliberately broken joins."""
    import copy
    import unittest
    platform=load('auth_verifier_disposable_platform',ROOT/'os/platform/service.py')
    from wallet_auth.fixture import SoftwareTestAuthenticator
    with tempfile.TemporaryDirectory(prefix='rock-native-auth-guard-') as temporary:
        directory=Path(temporary);(directory/'wallet').mkdir(mode=0o700)
        service=platform.WalletService(directory/'wallet',provisioning_file=ROOT/'os/entitlement/fixtures/device-handoff.json',start_scheduler=False)
        auth=SoftwareTestAuthenticator(directory/'auth','fixture-rock-arm64-001');sequence=0
        def key():
            nonlocal sequence
            sequence+=1;return 'ui-'+format(sequence,'032x')
        def call(op,**fields):return service.dispatch({'v':1,'op':op,'key':key(),**fields},peer_uid=1002)['result']
        paths={'ledger':directory/'wallet/wallet-simulator.db','member':directory/'wallet/entitlement.db','authenticator':directory/'auth/authenticator.sqlite3'}
        try:
            call('wallet.register');begin=call('wallet.auth.begin')
            initial=observer.rows(paths)
            try:auth.make_credential(begin['options'],'1234',key())
            except ValueError:pass
            require(initial==observer.rows(paths),'wrong PIN changed a private row')
            credential=auth.make_credential(begin['options'],'0000',key())
            call('wallet.auth.enroll',challenge_id=begin['challenge_id'],credential=credential)
            call('wallet.terms',accepted=True,terms_version='rock-wallet-development/1')
            sale=call('wallet.sale',amount_minor=5000);call('wallet.settle',id=sale['id'])
            quote=call('wallet.atm.quote',issue_key=key(),amount_minor=1000,atm_id='SIM-ATM-001')
            call('wallet.atm.quote.cancel',quote_id=quote['quote_id'])
            issue_key=key();quote=call('wallet.atm.quote',issue_key=issue_key,amount_minor=1000,atm_id='SIM-ATM-001')
            assertion=auth.get_assertion(quote['options'],'0000',key())
            issued=service.dispatch({'v':1,'op':'wallet.atm.issue','key':issue_key,'quote_id':quote['quote_id'],'credential':assertion},peer_uid=1002)['result']
            call('wallet.atm.cancel',withdrawal_id=issued['withdrawal_id']);data=observer.rows(paths)
            class Guards(unittest.TestCase):
                def test_real_crypto_receipt_quote_and_ledger_join(self):
                    self.assertTrue(observer.final_database(data)['registration_and_assertion_reverified'])
                def reject(self,change):
                    bad=copy.deepcopy(data);change(bad)
                    with self.assertRaises((AssertionError,ValueError,KeyError)):observer.final_database(bad)
                def test_extra_receipt_rejected(self):
                    self.reject(lambda d:d['ledger.wallet_idempotency'].append(copy.deepcopy(d['ledger.wallet_idempotency'][0])))
                def test_wrong_native_key_rejected(self):
                    self.reject(lambda d:d['authenticator.requests'][1].update(request_key='not-native'))
                def test_assertion_not_joined_to_approval_rejected(self):
                    self.reject(lambda d:d['ledger.wallet_auth_approvals'][0].update(assertion_sha256='0'*64))
                def test_canceled_quote_not_a_signed_hold(self):
                    self.reject(lambda d:d['ledger.wallet_auth_quotes'][0].update(state='CONSUMED'))
                def test_wrong_final_money_rejected(self):
                    self.reject(lambda d:d['balances'].update(AVAILABLE=4999))
                def test_hidden_extra_monthly_bill_rejected(self):
                    self.reject(lambda d:d['ledger.wallet_bills'].append({'amount_minor':888}))
                def test_credential_counter_mismatch_rejected(self):
                    self.reject(lambda d:d['authenticator.credentials'][0].update(sign_count=2))
                def test_nested_pin_in_wallet_receipt_rejected(self):
                    def change(d):
                        value=json.loads(d['ledger.wallet_idempotency'][3]['input_json']);value['metadata']={'pin':'public-test-not-retained'}
                        d['ledger.wallet_idempotency'][3]['input_json']=json.dumps(value)
                    self.reject(change)
            result=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(Guards))
            return 0 if result.wasSuccessful() else 1
        finally:auth.close();service.close()


def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--artifacts',type=Path);parser.add_argument('--output',type=Path)
    parser.add_argument('--self-test',action='store_true');args=parser.parse_args()
    if args.self_test:return self_test()
    require(args.artifacts is not None and sys.platform=='linux','actual verifier requires Linux and frozen artifacts')
    artifacts=args.artifacts.resolve(strict=True);return run(artifacts,(args.output or artifacts).resolve(strict=True))


if __name__=='__main__':raise SystemExit(main())

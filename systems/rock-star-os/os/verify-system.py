#!/usr/bin/env python3
"""Observe actual guest-initiated normal reboot and shutdown on one data disk."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import socket
import sqlite3
import struct
import subprocess
import sys
import tempfile
import threading
import time


def sha(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream,'sha256').hexdigest()


def markers(log, marker):
    prefix=marker+' '
    return [json.loads(line[len(prefix):]) for line in log.replace('\r','').splitlines() if line.startswith(prefix)]


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--artifacts',type=Path,required=True)
    args=parser.parse_args()
    if sys.platform!='linux':
        raise SystemExit('requires the Linux QEMU build environment')
    images=args.artifacts.resolve(strict=True)
    evidence=Path(tempfile.mkdtemp(prefix='system-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'-',dir=images))
    kernel,rootfs=images/'Image',images/'rootfs.ext4'
    before={p.name:sha(p) for p in (kernel,rootfs)}
    data,log=evidence/'userdata.ext4',evidence/'boot.log'
    with data.open('xb') as stream:
        stream.truncate(128*1024*1024)
    subprocess.run(['mkfs.ext4','-q','-F','-L','rock-data',str(data)],check=True)
    report={'status':'RUNNING','started_utc':datetime.now(timezone.utc).isoformat(),
            'scope':'actual guest UID1000 -> platform -> root power daemon -> normal BusyBox init',
            'blackberry':'NOT_RUN','wallet':'SIMULATOR_ONLY','images':before,'qmp_events':[]}
    process,connection,stream,reader=None,None,None,None
    print('Normal OS power evidence: '+str(evidence),flush=True)
    try:
        with tempfile.TemporaryDirectory(prefix='rock-system-qmp-') as temp:
            monitor=Path(temp)/'qmp.sock'
            command=['qemu-system-aarch64','-machine','virt-10.0,gic-version=3','-accel','tcg','-cpu','cortex-a53',
                     '-m','1024','-smp','2','-display','none','-serial','stdio','-monitor','none',
                     '-qmp',f'unix:{monitor},server=on,wait=off','-nic','none','-kernel',str(kernel),
                     '-append','console=ttyAMA0 vt.global_cursor_default=0 root=/dev/vda ro rootflags=noload rootwait panic=-1 rock.system.verify=1',
                     '-drive',f'if=none,file={rootfs},format=raw,id=osdisk,readonly=on',
                     '-device','virtio-blk-pci,drive=osdisk,addr=0x1',
                     '-drive',f'if=none,file={data},format=raw,id=userdata',
                     '-device','virtio-blk-pci,drive=userdata,addr=0x2',
                     '-object','rng-random,filename=/dev/urandom,id=rockrng',
                     '-device','virtio-rng-pci,rng=rockrng,addr=0x3',
                     '-device','virtio-gpu-pci,xres=720,yres=960,addr=0x4',
                     '-device','virtio-keyboard-pci,addr=0x5','-device','virtio-tablet-pci,addr=0x6']
            # No -no-reboot: only the guest's normal init can cause the second
            # boot. The host sends no reset, power or state mutation commands.
            report['command']=command
            with log.open('wb') as output:
                process=subprocess.Popen(command,stdin=subprocess.DEVNULL,stdout=output,stderr=subprocess.STDOUT)
                deadline=time.monotonic()+15
                while not monitor.exists():
                    if process.poll() is not None or time.monotonic()>deadline:
                        raise RuntimeError('QEMU monitor did not start')
                    time.sleep(0.1)
                connection=socket.socket(socket.AF_UNIX,socket.SOCK_STREAM)
                connection.settimeout(5)
                connection.connect(str(monitor))
                stream=connection.makefile('rwb',buffering=0)
                json.loads(stream.readline())
                stream.write(b'{"execute":"qmp_capabilities","id":"enable"}\n')
                while True:
                    message=json.loads(stream.readline())
                    if message.get('id')=='enable':
                        if 'error' in message:
                            raise RuntimeError('QMP capabilities rejected')
                        break
                connection.settimeout(None)
                def observe_events():
                    try:
                        while raw:=stream.readline():
                            message=json.loads(raw)
                            if 'event' in message:
                                report['qmp_events'].append({'observed_unix':time.time(),**message})
                    except (OSError,ValueError) as error:
                        report['qmp_reader_error']=str(error)
                reader=threading.Thread(target=observe_events,daemon=True)
                reader.start()
                deadline=time.monotonic()+360
                while process.poll() is None:
                    content=log.read_text(errors='replace')
                    if 'ROCK_SYSTEM_GUEST_FAIL' in content:
                        raise RuntimeError('actual power guest assertions failed')
                    if time.monotonic()>deadline:
                        raise TimeoutError('normal reboot/shutdown exceeded 360 seconds')
                    time.sleep(0.25)
                reader.join(timeout=3)
            report['exit_code']=process.returncode
            content=log.read_text(errors='replace')
            boots=markers(content,'ROCK_SYSTEM_VERIFY_BOOT')
            receipts=markers(content,'ROCK_SYSTEM_POWER_RECEIPT')
            if process.returncode or len(boots)!=2 or len(receipts)!=2 or [r['phase'] for r in receipts]!=[1,2]:
                raise AssertionError('expected exactly two actual boots and accepted power receipts')
            if boots[0]['boot_id']==boots[1]['boot_id']:
                raise AssertionError('kernel boot identity did not change')
            resets=[e for e in report['qmp_events'] if e['event']=='RESET' and e.get('data',{}).get('guest') is True]
            shutdowns=[e for e in report['qmp_events'] if e['event']=='SHUTDOWN' and e.get('data',{}).get('guest') is True]
            if len(resets)!=1 or len(shutdowns)!=1:
                raise AssertionError('QMP did not observe one guest reset and one guest shutdown')
            if content.count('reboot: Restarting system')!=1 or content.count('reboot: Power down')!=1:
                raise AssertionError('normal kernel reboot and poweroff markers were not observed')
            proof_bytes=subprocess.run(['debugfs','-R','cat /system-test.json',str(data)],capture_output=True,check=True).stdout
            proof=json.loads(proof_bytes)
            if proof['phase']!=2 or proof['first_boot_id']!=boots[0]['boot_id'] or proof['second_boot_id']!=boots[1]['boot_id']:
                raise AssertionError('guest durable proof differs from serial boot identities')
            ledger=evidence/'observed-power.db'
            dumped=subprocess.run(['debugfs','-R',f'dump /system/power.db {ledger}',str(data)],capture_output=True,check=True)
            if not ledger.is_file():
                raise AssertionError('power ledger was not persisted')
            with sqlite3.connect(f'file:{ledger}?mode=ro',uri=True) as db:
                db.row_factory=sqlite3.Row
                if db.execute('PRAGMA integrity_check').fetchone()[0]!='ok':
                    raise AssertionError('power ledger integrity failed')
                rows=[dict(row) for row in db.execute('SELECT * FROM requests ORDER BY created_unix')]
            if len(rows)!=2 or [r['operation'] for r in rows]!=['reboot','poweroff'] or any(r['status']!='dispatched' for r in rows):
                raise AssertionError('actual power dispatch count differs from two')
            if [json.loads(row['receipt_json']) for row in rows]!=[r['receipt'] for r in receipts]:
                raise AssertionError('serial and persisted power receipts differ')
            check=subprocess.run(['e2fsck','-f','-n',str(data)],capture_output=True,timeout=30)
            (evidence/'data-filesystem-check.log').write_bytes(check.stdout+check.stderr)
            with data.open('rb') as source:
                source.seek(1024+58)
                filesystem_state=struct.unpack('<H',source.read(2))[0]
            if check.returncode!=0 or filesystem_state & 1 != 1:
                raise AssertionError('normal shutdown did not leave a clean consistent data filesystem')
            if {p.name:sha(p) for p in (kernel,rootfs)}!=before:
                raise AssertionError('immutable OS image changed')
            (evidence/'guest-proof.json').write_text(json.dumps(proof,indent=2)+'\n')
            report.update(status='PASS',boots=boots,receipts=receipts,power_records=rows,
                          data_filesystem_clean=True,guest_proof=proof,host_power_commands_sent=0)
            print('PASS actual normal OS reboot/shutdown and cross-boot receipt safety',flush=True)
    except BaseException as error:
        report.update(status='FAIL',error=type(error).__name__+': '+str(error))
        raise
    finally:
        if process is not None and process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill();process.wait()
        if connection is not None:
            try:
                connection.shutdown(socket.SHUT_RDWR)
            except OSError:
                pass
        if reader is not None:
            reader.join(timeout=2)
        if stream is not None:
            stream.close()
        if connection is not None:
            connection.close()
        report['finished_utc']=datetime.now(timezone.utc).isoformat()
        (evidence/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')


if __name__=='__main__':
    main()

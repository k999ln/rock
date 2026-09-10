#!/usr/bin/python3
"""Actual normal-init reboot and shutdown, only on the flagged virtual board."""
import json
import os
from pathlib import Path
import sqlite3
import subprocess
import time
import uuid

STATE = Path('/data/system-test.json')
CLIENT = """import json,sys
sys.path.insert(0,'/usr/lib/rock-platform')
from service import call,PLATFORM_SOCKET,PLATFORM_UID
print(json.dumps(call(PLATFORM_SOCKET,json.load(sys.stdin),PLATFORM_UID)))
"""


def emit(marker, value):
    # The test starts after rcS in the background; getty can leave a login
    # prompt without a newline on this same serial console.
    print('\n' + marker + ' ' + json.dumps(value, sort_keys=True), flush=True)


def save(record):
    with STATE.open('w') as stream:
        json.dump(record, stream, sort_keys=True)
        stream.flush()
        os.fsync(stream.fileno())
    fd = os.open('/data', os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def call(op, key):
    reply = subprocess.run(['/usr/bin/python3','-I','-B','-c',CLIENT],
                           input=json.dumps({'v':1,'op':op,'key':key}).encode(),
                           capture_output=True, timeout=10, user=1000, group=1000, extra_groups=[])
    if reply.returncode:
        raise RuntimeError('native identity client failed: ' + reply.stderr.decode(errors='replace')[:300])
    result = json.loads(reply.stdout)
    if result.get('ok') is not True:
        raise RuntimeError('power request rejected')
    return result


def records():
    with sqlite3.connect('file:/data/system/power.db?mode=ro', uri=True) as db:
        db.row_factory = sqlite3.Row
        db.execute('PRAGMA query_only=ON')
        return [dict(row) for row in db.execute('SELECT * FROM requests ORDER BY created_unix')]


def peer_denied():
    client = """import json,socket,struct
try:
    s=socket.socket(socket.AF_UNIX,socket.SOCK_STREAM);s.settimeout(3)
    s.connect('/run/rock-system/power.sock')
    s.sendall(b'{"v":1,"op":"reboot","key":"forbidden-direct-ui"}\\n')
    value=json.loads(s.recv(2048))
    print(value.get('ok') is False and value.get('code')=='unauthorized')
except PermissionError:
    print(True)
"""
    # Test the independent peer check with DAC temporarily permissive; restore
    # both paths before any legitimate power request.
    parent, path = Path('/run/rock-system'), Path('/run/rock-system/power.sock')
    try:
        parent.chmod(0o755)
        path.chmod(0o666)
        run = subprocess.run(['/usr/bin/python3','-I','-B','-c',client],
                             capture_output=True,timeout=5,user=1000,group=1000,extra_groups=[])
        return run.returncode == 0 and run.stdout.strip() == b'True'
    finally:
        path.chmod(0o660)
        parent.chmod(0o750)


def main():
    if (os.geteuid()!=0 or os.uname().machine!='aarch64' or
            'rock.system.verify=1' not in Path('/proc/cmdline').read_text().split()):
        raise SystemExit('requires explicitly flagged ARM64 OS power test')
    boot_id = Path('/proc/sys/kernel/random/boot_id').read_text().strip()
    emit('ROCK_SYSTEM_VERIFY_BOOT', {'boot_id':boot_id})
    if not peer_denied():
        raise AssertionError('UI bypassed root power service peer authorization')
    if not STATE.exists():
        if records():
            raise AssertionError('test requires a fresh power ledger')
        record = {'schema':'rock-system-guest-proof/1', 'phase':1, 'first_boot_id':boot_id,
                  'reboot_key':'system-' + uuid.uuid4().hex, 'checks':['direct UI peer denied even with permissive DAC'],
                  'blackberry':'NOT_RUN', 'normal_init':True, 'simulation_wallet':True}
        save(record)
        receipt = call('device.reboot', record['reboot_key'])
        if receipt['result']['boot_id'] != boot_id or receipt['result']['op'] != 'reboot':
            raise AssertionError('unexpected reboot receipt')
        emit('ROCK_SYSTEM_POWER_RECEIPT', {'phase':1,'receipt':receipt})
        # The fixed daemon will invoke normal init. This helper never invokes
        # poweroff/reboot itself and never turns receipt acceptance into PASS.
        return
    record = json.loads(STATE.read_text())
    if record['phase'] != 1 or record['first_boot_id'] == boot_id:
        raise AssertionError('expected exactly a second actual kernel boot')
    old = records()
    if len(old)!=1 or old[0]['key']!=record['reboot_key'] or old[0]['status']!='dispatched':
        raise AssertionError('previous reboot dispatch was not persisted exactly once')
    receipt = json.loads(old[0]['receipt_json'])
    replay = call('device.reboot', record['reboot_key'])
    if replay != receipt:
        raise AssertionError('cross-boot retry changed the original receipt')
    time.sleep(1.25)
    if records()!=old or Path('/proc/sys/kernel/random/boot_id').read_text().strip()!=boot_id:
        raise AssertionError('old receipt was redispatched after reboot')
    record.update(phase=2, second_boot_id=boot_id, first_dispatch=old[0],
                  shutdown_key='system-' + uuid.uuid4().hex, status='AWAITING_ACTUAL_SHUTDOWN')
    record['checks'] += ['different real kernel boot ID', 'one persisted prior reboot dispatch',
                         'identical retry receipt across reboot', 'no old action redispatch',
                         'root filesystem remains readonly', 'persistent data remains protected']
    mounts = Path('/proc/mounts').read_text().splitlines()
    root = next(line.split() for line in mounts if line.split()[1]=='/')
    data = next(line.split() for line in mounts if line.split()[1]=='/data')
    if 'ro' not in root[3].split(',') or not {'rw','nosuid','nodev','noexec'} <= set(data[3].split(',')):
        raise AssertionError('OS mount protections changed')
    save(record)
    shutdown = call('device.poweroff',record['shutdown_key'])
    if shutdown['result']['boot_id']!=boot_id or shutdown['result']['op']!='poweroff':
        raise AssertionError('unexpected shutdown receipt')
    emit('ROCK_SYSTEM_POWER_RECEIPT',{'phase':2,'receipt':shutdown})


if __name__ == '__main__':
    try:
        main()
    except BaseException as error:
        emit('ROCK_SYSTEM_GUEST_FAIL', {'error':type(error).__name__ + ': ' + str(error)})
        raise

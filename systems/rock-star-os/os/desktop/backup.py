"""Offline snapshots of owned development devices; restore into a new device.

The source disk is never repaired, replaced, or mounted by these operations.
Backups currently contain simulator data and are not encrypted by this module.
"""
from contextlib import contextmanager
from datetime import datetime, timezone
import fcntl
import json
import os
from pathlib import Path
import shutil
import stat
import subprocess
import uuid

from guest import BASE, STAGE0_SCHEMAS, state_path, running, validate_config, digest, save, directory, require, remove_stale_socket


def regular(path):
    info = path.lstat()
    require(stat.S_ISREG(info.st_mode) and info.st_uid == os.geteuid() and info.st_nlink == 1,
            'backup source must be an owned regular file without extra links')
    return info


def read_metadata(path):
    """Bounded duplicate-rejecting JSON; use the existing strict decoder."""
    regular(path)
    from stage0 import read_json
    return read_json(path, limit=65536)


def exact_json(left, right):
    # Python equality treats True == 1 == 1.0. Signed update-state summaries
    # must retain their real JSON types in the independently checked receipt.
    return json.dumps(left, sort_keys=True, separators=(',', ':'), allow_nan=False) == \
           json.dumps(right, sort_keys=True, separators=(',', ':'), allow_nan=False)


@contextmanager
def locked(state):
    descriptor = os.open(state/'lock',os.O_CREAT|os.O_RDWR|os.O_NOFOLLOW,0o600)
    try:
        info = os.fstat(descriptor)
        require(stat.S_ISREG(info.st_mode) and info.st_uid == os.geteuid() and info.st_nlink == 1,'invalid device lock')
        fcntl.flock(descriptor,fcntl.LOCK_EX)
        yield
    finally:
        os.close(descriptor)


def check_disk(path):
    regular(path)
    result = subprocess.run(['e2fsck','-f','-n',str(path)],capture_output=True,text=True,timeout=30)
    require(result.returncode == 0,'data filesystem is not clean; no repair or backup was performed')
    return {'exit_code':result.returncode,'output':result.stdout+result.stderr}


def copy_data(source, destination):
    initial = regular(source)
    require(0 < initial.st_size <= 2*1024**3,'development data exceeds backup size limit')
    descriptor = os.open(destination,os.O_CREAT|os.O_EXCL|os.O_WRONLY|os.O_NOFOLLOW,0o600)
    with source.open('rb') as incoming, os.fdopen(descriptor,'wb') as outgoing:
        shutil.copyfileobj(incoming,outgoing,1024*1024)
        outgoing.flush(); os.fsync(outgoing.fileno())
    final = regular(source)
    require((initial.st_dev,initial.st_ino,initial.st_size,initial.st_mtime_ns) ==
            (final.st_dev,final.st_ino,final.st_size,final.st_mtime_ns),'source changed while copying; original data preserved')
    value = digest(source)
    require(digest(destination) == value,'backup copy hash mismatch; original data preserved')
    return value, initial.st_size


def create_backup(name):
    state = state_path(name)
    with locked(state):
        marker = state/'device.json'
        regular(marker)
        config = read_metadata(marker); validate_config(config)
        require(config['name'] == name,'device marker belongs to another device')
        record = state/'running.json'
        require(not record.exists() or not running(json.loads(record.read_text())),
                'OSを画面内の電源操作で終了してからバックアップしてください。')
        for socket_name in ('vnc.sock','qmp.sock','websocket.sock'):
            remove_stale_socket(state/socket_name)
        if config.get('schema') in STAGE0_SCHEMAS:
            return create_stage0_backup(name, state, config)
        data = state/'userdata.ext4'
        verification = check_disk(data)
        root = state/'backups'; directory(root)
        identity = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'-'+uuid.uuid4().hex[:12]
        temporary, destination = root/('.pending-'+identity),root/identity
        directory(temporary)
        value, count = copy_data(data,temporary/'userdata.ext4')
        report = {'schema':'rock-desktop-backup/1','source_device':name,'created_utc':datetime.now(timezone.utc).isoformat(),
                  'config':config,'userdata_sha256':value,'bytes':count,'filesystem_check':verification,
                  'consistency':'OS stopped, clean filesystem, full SHA-256 copy comparison',
                  'encrypted':False,'wallet':'SIMULATOR_ONLY','production_backup':'NOT_VERIFIED'}
        save(temporary/'backup.json',report)
        os.rename(temporary,destination)
        descriptor = os.open(root,os.O_RDONLY|os.O_DIRECTORY)
        try: os.fsync(descriptor)
        finally: os.close(descriptor)
        return {'status':'SAVED','backup':str(destination),**report}


def restore_backup(path, new_name):
    path = Path(path)
    require(path.is_absolute() and not path.is_symlink(),'backup must be an absolute owned directory')
    require(path.resolve().is_relative_to(BASE.resolve()),'backup must be under the owned virtual-device directory')
    info = path.stat()
    require(stat.S_ISDIR(info.st_mode) and info.st_uid == os.geteuid() and not info.st_mode & 0o077,'backup must be private')
    regular(path/'backup.json'); regular(path/'userdata.ext4')
    report = read_metadata(path/'backup.json')
    if report.get('schema') == 'rock-desktop-backup/2':
        return restore_stage0_backup(path, new_name, report)
    require(report.get('config', {}).get('schema') not in STAGE0_SCHEMAS,
            'a stage0 device requires its complete A/B/data backup; data-only restore refused')
    require(report.get('schema') == 'rock-desktop-backup/1','unknown backup format')
    require(set(p.name for p in path.iterdir()) == {'backup.json', 'userdata.ext4'} and
            not {'disks', 'update'} & set(report), 'A/B members or metadata cannot be re-labelled as a data-only backup')
    config = report['config']; validate_config(config)
    require(new_name != report['source_device'],'復元先には新しい端末名を指定してください。元の端末は保持します。')
    require(type(report['bytes']) is int and 0 < report['bytes'] <= 2*1024**3,'invalid backup byte count')
    require((path/'userdata.ext4').stat().st_size == report['bytes'] and digest(path/'userdata.ext4') == report['userdata_sha256'],
            'backup size or hash mismatch; no restore performed')
    check_disk(path/'userdata.ext4')
    state = state_path(new_name)
    with locked(state):
        require({p.name for p in state.iterdir()} <= {'lock'},'復元先に既存データがあります。新しい端末名を指定してください。')
        value, count = copy_data(path/'userdata.ext4',state/'userdata.ext4')
        require(value == report['userdata_sha256'] and count == report['bytes'],
                'copied backup differs from its verified manifest; destination is not activated')
        verification = check_disk(state/'userdata.ext4')
        require(digest(state/'userdata.ext4') == report['userdata_sha256'] and
                (state/'userdata.ext4').stat().st_size == report['bytes'],
                'restored data changed during final verification; destination is not activated')
        new_config = {**config,'name':new_name}
        # Remote service journals are outside the guest disk. Do not start a
        # fresh endpoint silently for an old pending remote request after restore.
        if new_config.get('schema') in ('rock-desktop-device/2', 'rock-desktop-device/3', 'rock-desktop-device/4'):
            new_config['network'] = 'none'
        save(state/'device.json',new_config)
        receipt = {'schema':'rock-desktop-restore/1','status':'RESTORED','source_backup':str(path),
                   'device':new_name,'userdata_sha256':value,'bytes':count,'original_device_preserved':True,
                   'config':new_config,'wallet':'SIMULATOR_ONLY'}
        receipt['filesystem_check'] = verification
        receipt['remote_services'] = 'not included; restored device starts offline to preserve reconciliation boundaries'
        save(state/'restored.json',receipt)
        return receipt


def create_stage0_backup(name, state, config):
    """Called only with the source device lock held and owned QEMU excluded."""
    from stage0 import DISKS, regular as private_regular, stopped_slots, validate_disks
    validate_disks(config, state)
    before = {disk: {'sha256':digest(state/disk),'bytes':(state/disk).stat().st_size} for disk in DISKS}
    verification = check_disk(state/'userdata.ext4')
    update = stopped_slots(config,state)
    root = state/'backups'; directory(root)
    identity = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'-'+uuid.uuid4().hex[:12]
    temporary, destination = root/('.pending-'+identity),root/identity
    directory(temporary)
    for disk in DISKS:
        value,count = copy_data(state/disk,temporary/disk)
        require({'sha256':value,'bytes':count} == before[disk],'A/B/data set changed while copied')
    require(all(digest(state/disk) == before[disk]['sha256'] for disk in DISKS), 'source A/B/data changed during backup')
    require(exact_json(stopped_slots(config,temporary), update),'copied signed update state differs')
    report = {'schema':'rock-desktop-backup/2','source_device':name,'created_utc':datetime.now(timezone.utc).isoformat(),
        'config':config,'disks':before,'update':update,'filesystem_check':verification,
        'consistency':'owned OS stopped; complete A/B/data; signed slot/state validation; full copy SHA-256 equality',
        'encrypted':False,'wallet':'SIMULATOR_ONLY','production_backup':'NOT_VERIFIED',
        'backend_included':False}
    save(temporary/'backup.json',report); os.rename(temporary,destination)
    descriptor = os.open(root,os.O_RDONLY|os.O_DIRECTORY)
    try: os.fsync(descriptor)
    finally: os.close(descriptor)
    return {'status':'SAVED','backup':str(destination),**report}


def restore_stage0_backup(path, new_name, report):
    from stage0 import DISKS, regular as private_regular, stopped_slots, validate_disks
    import re
    config = report['config']; validate_config(config)
    require(config.get('schema') in STAGE0_SCHEMAS,'A/B/data backup requires explicit stage0 device')
    require(new_name != report['source_device'],'復元先には新しい端末名を指定してください。元の端末は保持します。')
    require(set(p.name for p in path.iterdir()) == {'backup.json',*DISKS},'incomplete or unexpected A/B/data backup members')
    disks = report.get('disks')
    require(type(disks) is dict and set(disks) == set(DISKS),'exact A/B/data manifest required')
    for disk in DISKS:
        info = private_regular(path/disk,private=True)
        value = disks[disk]
        require(type(value) is dict and set(value) == {'sha256','bytes'} and type(value['bytes']) is int and
                0 < value['bytes'] <= 2*1024**3 and type(value['sha256']) is str and re.fullmatch('[0-9a-f]{64}',value['sha256']) and
                info.st_size == value['bytes'] and digest(path/disk) == value['sha256'],'A/B/data backup size or hash mismatch')
    validate_disks(config, path)
    check_disk(path/'userdata.ext4')
    require(exact_json(stopped_slots(config,path), report['update']),'saved update metadata/slot set mismatch')
    state = state_path(new_name)
    with locked(state):
        require({p.name for p in state.iterdir()} <= {'lock'},'復元先に既存データがあります。新しい端末名を指定してください。')
        for disk in DISKS:
            value,count = copy_data(path/disk,state/disk)
            require({'sha256':value,'bytes':count} == disks[disk],'restored disk differs; device not activated')
        verification = check_disk(state/'userdata.ext4')
        require(exact_json(stopped_slots(config,state), report['update']) and
                all(digest(state/disk) == disks[disk]['sha256'] for disk in DISKS),'restored A/B/data final verification failed')
        new_config = {**config,'name':new_name,'network':'none'}
        # Preserve authority and pending remote journals; never provision a new
        # endpoint for restored state. Reconnection is a separate explicit step.
        save(state/'device.json',new_config)
        receipt = {'schema':'rock-desktop-restore/2','status':'RESTORED','source_backup':str(path),
            'device':new_name,'disks':disks,'update':report['update'],'original_device_preserved':True,
            'config':new_config,'filesystem_check':verification,'wallet':'SIMULATOR_ONLY',
            'remote_services': ('not included; restored device starts offline; original authority binding retained'
                                if config['schema'] == 'rock-desktop-device/5' else
                                'not configured; restored explicit local A/B device remains offline')}
        save(state/'restored.json',receipt)
        return receipt

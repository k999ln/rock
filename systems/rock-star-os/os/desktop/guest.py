#!/usr/bin/env python3
"""Persistent, private virtual-device lifecycle inside the existing Linux VM."""
import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import socket
import stat
import subprocess
import sys
import time
import uuid

BASE = Path('/var/tmp/rock-star-desktop')
PASSWORD_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
STAGE0_SCHEMAS = ('rock-desktop-device/5', 'rock-desktop-device/6')


def require(condition, message):
    if not condition:
        raise ValueError(message)


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def save(path, value):
    temporary = path.with_name(path.name + '.new-' + uuid.uuid4().hex)
    with temporary.open('x') as stream:
        json.dump(value, stream, sort_keys=True)
        stream.flush()
        os.fsync(stream.fileno())
    temporary.chmod(0o600)
    os.replace(temporary, path)
    fd = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def directory(path):
    path.mkdir(mode=0o700, exist_ok=True)
    value = path.lstat()
    require(stat.S_ISDIR(value.st_mode) and value.st_uid == os.geteuid() and
            stat.S_IMODE(value.st_mode) == 0o700, 'desktop directory must be owned and private: ' + str(path))


def process_identity(pid):
    try:
        proc = Path('/proc') / str(pid)
        require(Path(os.readlink(proc / 'exe')).name == 'qemu-system-aarch64', 'different process')
        fields = (proc / 'stat').read_text().rsplit(')', 1)[1].split()
        return {'start_ticks': fields[19], 'command': (proc / 'cmdline').read_bytes().rstrip(b'\0').decode().split('\0')}
    except (OSError, ValueError, IndexError):
        return None


def running(record):
    return (isinstance(record, dict) and type(record.get('pid')) is int and
            isinstance(record.get('identity'), dict) and
            set(record['identity']) == {'start_ticks', 'command'} and
            process_identity(record['pid']) == record.get('identity'))


def state_path(name):
    require(isinstance(name, str) and re.fullmatch(r'[a-z0-9][a-z0-9-]{0,31}', name), 'invalid virtual-device name')
    directory(BASE)
    result = BASE / name
    directory(result)
    return result


def validate_config(config):
    require(isinstance(config, dict), 'invalid desktop configuration')
    fields = {'schema', 'name', 'images', 'sha256'}
    if config.get('schema') in ('rock-desktop-device/2', 'rock-desktop-device/3', 'rock-desktop-device/4', *STAGE0_SCHEMAS):
        fields.add('network')
        modes = ('none', 'closed-services') if config['schema'] in ('rock-desktop-device/4', 'rock-desktop-device/5') else ('none', 'development-services')
        require(config.get('network') in modes,'unsupported virtual network mode')
        if config['schema'] == 'rock-desktop-device/6':
            require(config['network'] == 'none', 'local A/B profile requires no network')
        if config['schema'] in ('rock-desktop-device/3', 'rock-desktop-device/4', *STAGE0_SCHEMAS):
            fields.add('viewer')
            require(config.get('viewer') == 'browser', 'unsupported virtual display viewer')
        if config['schema'] in ('rock-desktop-device/4', 'rock-desktop-device/5'):
            fields.add('services')
            service = config.get('services')
            require(isinstance(service, dict) and set(service) == {'config', 'sha256', 'authority_id'},
                    'purchaser backend binding required')
            require(isinstance(service['config'], str) and Path(service['config']).is_absolute(),
                    'absolute purchaser backend configuration path required')
            require(isinstance(service['sha256'], str) and re.fullmatch('[0-9a-f]{64}', service['sha256']),
                    'purchaser backend configuration hash required')
            require(isinstance(service['authority_id'], str) and
                    str(uuid.UUID(service['authority_id'])) == service['authority_id'], 'invalid purchaser authority')
            # Host backend loss must not prevent booting the local OS. Its
            # actual protected file/hash is checked by ensure after display start.
    else:
        require(config.get('schema') == 'rock-desktop-device/1', 'unknown desktop configuration')
    if config.get('schema') in STAGE0_SCHEMAS:
        fields.add('boot')
    require(set(config) == fields, 'invalid desktop configuration')
    require(isinstance(config['images'], str) and Path(config['images']).is_absolute(), 'images must be an absolute directory')
    require(re.fullmatch(r'/[A-Za-z0-9_./-]+', config['images']), 'image path contains unsupported QEMU option characters')
    image_names = {'Image', 'rootfs.ext4', 'stage0.cpio.gz'} if config.get('schema') in STAGE0_SCHEMAS else {'Image', 'rootfs.ext4'}
    require(isinstance(config['sha256'], dict) and set(config['sha256']) == image_names, 'complete image hashes required')
    for name, value in config['sha256'].items():
        require(isinstance(value, str) and re.fullmatch('[0-9a-f]{64}', value), 'invalid image hash')
        path = Path(config['images']) / name
        require(path.is_file() and not path.is_symlink() and digest(path) == value, 'OS image hash mismatch: ' + name)
    if config.get('schema') == 'rock-desktop-device/5':
        from stage0 import verified_profile
        verified_profile(config)
    elif config.get('schema') == 'rock-desktop-device/6':
        from stage0 import verified_local_profile
        verified_local_profile(config)


def command(config, state, session):
    images = Path(config['images'])
    args = ['qemu-system-aarch64', '-machine', 'virt-10.0,gic-version=3', '-accel', 'tcg', '-cpu', 'cortex-a53',
            '-m', '1024', '-smp', '2', '-display', 'none', '-vnc', 'unix:' + str(state / 'vnc.sock'),
            '-serial', 'file:' + str(session / 'boot.log'), '-monitor', 'none',
            '-qmp', 'unix:' + str(state / 'qmp.sock') + ',server=on,wait=off',
            '-kernel', str(images / 'Image'), '-append',
            'console=ttyAMA0 vt.global_cursor_default=0 root=/dev/vda ro rootflags=noload rootwait panic=-1 rock.ui=required',
            '-drive', f'if=none,file={images / "rootfs.ext4"},format=raw,id=osdisk,readonly=on',
            '-device', 'virtio-blk-pci,drive=osdisk,addr=0x1',
            '-drive', f'if=none,file={state / "userdata.ext4"},format=raw,id=userdata',
            '-device', 'virtio-blk-pci,drive=userdata,addr=0x2',
            '-object', 'rng-random,filename=/dev/urandom,id=rockrng',
            '-device', 'virtio-rng-pci,rng=rockrng,addr=0x3',
            '-device', 'virtio-gpu-pci,xres=720,yres=960,addr=0x4',
            '-device', 'virtio-keyboard-pci,addr=0x5', '-device', 'virtio-tablet-pci,addr=0x6']
    if config.get('schema') in STAGE0_SCHEMAS:
        args[args.index('-append')+1] = 'console=ttyAMA0 vt.global_cursor_default=0 ro rootwait panic=-1 rock.ui=required'
        args[args.index('-drive')+1] = f'if=none,file={state / "slot-a.ext4"},format=raw,id=osdisk'
        for index, value in enumerate(args):
            if value == 'virtio-gpu-pci,xres=720,yres=960,addr=0x4': args[index] = 'virtio-gpu-pci,xres=720,yres=960,addr=0x6'
            elif value == 'virtio-keyboard-pci,addr=0x5': args[index] = 'virtio-keyboard-pci,addr=0x8'
            elif value == 'virtio-tablet-pci,addr=0x6': args[index] = 'virtio-tablet-pci,addr=0x9'
        args += ['-initrd', str(images/'stage0.cpio.gz'),
                 '-drive', f'if=none,file={state / "slot-b.ext4"},format=raw,id=slotb',
                 '-device', 'virtio-blk-pci,drive=slotb,addr=0x4']
    if config.get('viewer') == 'browser':
        args[args.index('-vnc')+1] += ',websocket=unix:' + str(state/'websocket.sock') + ',password-secret=rock-vnc'
        args += ['-object', 'secret,id=rock-vnc,file=' + str(session/'vnc-password')]
    if config.get('network') in ('development-services', 'closed-services'):
        args += ['-netdev','user,id=store-net','-device','virtio-net-pci,netdev=store-net,id=store-nic,addr=0x7,romfile=']
    else:
        args += ['-nic','none']
    return args


def create_display_secret(session):
    # VNC authenticates only eight password bytes. Eight independent ASCII
    # choices from 64 symbols retain 48 bits without byte truncation.
    value = ''.join(secrets.choice(PASSWORD_ALPHABET) for _ in range(8)).encode('ascii')
    descriptor = os.open(session/'vnc-password', os.O_CREAT|os.O_EXCL|os.O_WRONLY|os.O_NOFOLLOW, 0o600)
    with os.fdopen(descriptor, 'wb') as stream:
        stream.write(value); stream.flush(); os.fsync(stream.fileno())
    descriptor = os.open(session, os.O_RDONLY|os.O_DIRECTORY)
    try: os.fsync(descriptor)
    finally: os.close(descriptor)


def display_secret(name, expected_session):
    """Private SSH action; its response is consumed only in launcher memory."""
    require(sys.platform == 'linux', 'display credentials belong to the Linux device')
    state = state_path(name)
    record = status(name)
    require(record.get('running') and record.get('config', {}).get('viewer') == 'browser' and
            record.get('session') == expected_session, 'display session is no longer the expected running device')
    session = Path(expected_session)
    require(session.parent == state/'sessions' and re.fullmatch('[0-9a-f]{32}', session.name), 'unexpected display session path')
    directory(session)
    descriptor = os.open(session/'vnc-password', os.O_RDONLY|os.O_NOFOLLOW)
    try:
        info = os.fstat(descriptor)
        require(stat.S_ISREG(info.st_mode) and info.st_uid == os.geteuid() and info.st_nlink == 1 and
                stat.S_IMODE(info.st_mode) == 0o600 and info.st_size == 8, 'unsafe display credential file')
        value = os.read(descriptor, 9).decode('ascii')
        require(len(value) == 8 and all(char in PASSWORD_ALPHABET for char in value), 'invalid display credential')
    finally:
        os.close(descriptor)
    require(running(record), 'display session ended while reading credentials')
    return {'session': expected_session, 'password': value}


def remove_stale_socket(path):
    try:
        info = path.lstat()
    except FileNotFoundError:
        return
    require(stat.S_ISSOCK(info.st_mode) and info.st_uid == os.geteuid(), 'refusing an unexpected socket path')
    with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as probe:
        probe.settimeout(.5)
        try:
            probe.connect(str(path))
        except ConnectionRefusedError:
            # Only a confirmed refused connection identifies a stale inode.
            current = path.lstat()
            require((current.st_dev, current.st_ino) == (info.st_dev, info.st_ino), 'socket changed during inspection')
            path.unlink()
        else:
            raise ValueError('a virtual device is still listening without a matching record; preserve it and recover its session metadata')


def start(config):
    require(sys.platform == 'linux', 'virtual device runs inside the Linux build VM')
    validate_config(config)
    state = state_path(config['name'])
    lock = os.open(state / 'lock', os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    try:
        fcntl.flock(lock, fcntl.LOCK_EX)
        record_file = state / 'running.json'
        old = json.loads(record_file.read_text()) if record_file.exists() else None
        if running(old):
            require(old['config'] == config, 'another image is already running for this device')
            return dict(old, running=True, reused=True)
        active = sum(process_identity(int(path.name)) is not None for path in Path('/proc').glob('[0-9]*'))
        require(active < 2, 'two virtual devices are already running; finish a verification session first')
        # A previous launcher may have died between spawn and record commit.
        # Inspect before even checking the filesystem of possibly live userdata.
        for name in ('vnc.sock', 'qmp.sock', 'websocket.sock'):
            remove_stale_socket(state / name)
        if config.get('schema') in STAGE0_SCHEMAS:
            from stage0 import prepare_disks
            prepare_disks(config, state)
        else:
            marker, data = state / 'device.json', state / 'userdata.ext4'
            if marker.exists():
                require(json.loads(marker.read_text()) == config, 'saved device belongs to different OS images; preserve its data and use a new device name')
                require(data.is_file() and not data.is_symlink(), 'saved data image missing or unsafe')
                check = subprocess.run(['e2fsck', '-f', '-n', str(data)], capture_output=True, text=True, timeout=30)
                require(check.returncode == 0, 'saved data needs explicit recovery; no repair or formatting was performed')
            else:
                require(not data.exists(), 'unidentified existing data image; no formatting was performed')
                fd = os.open(data, os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW, 0o600)
                with os.fdopen(fd, 'wb') as stream:
                    stream.truncate(256 * 1024 * 1024)
                subprocess.run(['mkfs.ext4', '-q', '-F', '-L', 'rock-desktop', str(data)], check=True, timeout=30)
                save(marker, config)
        sessions = state / 'sessions'
        directory(sessions)
        session = sessions / uuid.uuid4().hex
        directory(session)
        if config.get('viewer') == 'browser':
            create_display_secret(session)
        args = command(config, state, session)
        with (session / 'qemu.log').open('xb') as log:
            process = subprocess.Popen(args, stdin=subprocess.DEVNULL, stdout=log, stderr=subprocess.STDOUT,
                                       start_new_session=True, close_fds=True)
        record = {'schema': 'rock-desktop-session/1', 'pid': process.pid, 'identity': process_identity(process.pid),
                  'config': config, 'session': str(session), 'vnc_socket': str(state / 'vnc.sock'),
                  'qmp_socket': str(state / 'qmp.sock'), 'started_unix': time.time(),
                  'network': config.get('network','none'), 'wallet': 'SIMULATOR_ONLY', 'blackberry': 'NOT_RUN'}
        if config.get('viewer') == 'browser':
            record.update(viewer='browser', websocket_socket=str(state/'websocket.sock'))
        try:
            deadline = time.monotonic() + 15
            display_sockets = ['vnc.sock', 'qmp.sock'] + (['websocket.sock'] if config.get('viewer') == 'browser' else [])
            while not all((state/name).exists() for name in display_sockets):
                require(process.poll() is None, 'virtual device failed; inspect ' + str(session / 'qemu.log'))
                require(time.monotonic() < deadline, 'virtual display startup timed out')
                time.sleep(.1)
            record['identity'] = process_identity(process.pid)
            require(record['identity'] is not None, 'could not identify the owned virtual device')
            save(record_file, record)
        except BaseException:
            # This newly spawned child has not been handed to the user yet.
            if process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait(timeout=5)
            raise
        return dict(record, running=True, reused=False)
    finally:
        os.close(lock)


def status(name):
    state = state_path(name)
    path = state / 'running.json'
    record = json.loads(path.read_text()) if path.exists() else None
    return dict(record or {}, running=running(record))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['start', 'status', 'wait', 'backup', 'restore', 'services', 'display-secret'])
    parser.add_argument('--name', default='rock-star-os')
    args = parser.parse_args()
    if args.action == 'start':
        raw = sys.stdin.buffer.read(16 * 1024 + 1)
        require(len(raw) <= 16 * 1024, 'configuration exceeds limit')
        result = start(json.loads(raw))
    elif args.action == 'status':
        result = status(args.name)
    elif args.action == 'backup':
        from backup import create_backup
        result = create_backup(args.name)
    elif args.action == 'services':
        device = status(args.name)
        marker = state_path(args.name)/'device.json'
        if marker.exists():
            from stage0 import read_json
            saved = read_json(marker)
        else:
            saved = device.get('config', {})
        if saved.get('schema') == 'rock-desktop-device/6':
            result = {'status': 'NOT_APPLICABLE', 'network': 'none',
                      'meaning': 'explicit local A/B profile has no external service endpoints'}
        elif device.get('network') == 'closed-services':
            from closed_services import ensure
            result = ensure(device['config']['services'])
        else:
            from services import ensure
            result = ensure(args.name)
    elif args.action == 'display-secret':
        raw = sys.stdin.buffer.read(16*1024+1)
        require(len(raw) <= 16*1024, 'display request exceeds limit')
        payload = json.loads(raw)
        require(isinstance(payload,dict) and set(payload) == {'session'} and isinstance(payload['session'],str), 'invalid display request')
        result = display_secret(args.name,payload['session'])
    elif args.action == 'restore':
        from backup import restore_backup
        raw = sys.stdin.buffer.read(16*1024+1)
        require(len(raw) <= 16*1024,'restore request exceeds limit')
        payload = json.loads(raw)
        require(isinstance(payload,dict) and set(payload) == {'backup'},'invalid restore request')
        result = restore_backup(payload['backup'],args.name)
    else:
        original = status(args.name)
        require(original['running'], 'virtual device is not running')
        while running(original):
            time.sleep(1)
        result = {'running': False, 'session': original['session']}
    print(json.dumps(result, sort_keys=True))


if __name__ == '__main__':
    main()

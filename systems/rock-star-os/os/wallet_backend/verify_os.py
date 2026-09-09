"""Three disposable ARM64 OS boots against one owned simulator Wallet authority.

Only the copied rootfs receives a fixed opt-in config and test hook. The guest
uses real Platform IPC as uid1000, not GUI input. Clock/credit controls remain
on the verifier's private multiprocessing pipe; no remote admin API is added.
Run in the authorized Linux build VM with --artifacts DIR --output NEW_DIR.
"""
import argparse
from contextlib import closing
from datetime import datetime, timezone
import hashlib
import json
import multiprocessing as mp
import os
from pathlib import Path
import platform
import re
import shutil
import socket
import sqlite3
import struct
import subprocess
import sys
import tempfile
import threading
import time

ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(ROOT / 'src'), str(ROOT / 'os')]
from blackberryrock.packages import canonical
from entitlement.protocol import PUBLIC_TOKENS
from wallet_backend.verify_off_device import (authority_process, receive, rpc,
                                             stop as stop_authority, summary,
                                             SEPTEMBER, OCTOBER, NOVEMBER)

CA_GUEST = '/usr/share/rock/development-store-ca.pem'
CONFIG_GUEST = '/etc/rock-wallet/backend.json'
TOKEN_GUEST = '/etc/rock-wallet/PUBLIC-OWNER-TOKEN.txt'
PROBE_GUEST = '/usr/libexec/rock-wallet-backend-probe.py'
HOOK_GUEST = '/etc/init.d/S99rock-wallet-backend-verify'
KEYS = {'os-wallet-register', 'os-wallet-consent', 'os-wallet-final-cancel'}
HOOK = b'''#!/bin/sh
[ "${1:-start}" = start ] || exit 0
case " $(cat /proc/cmdline) " in
  *" rock.wallet.verify=1 "*|*" rock.wallet.verify=2 "*|*" rock.wallet.verify=3 "*)
    PYTHONDONTWRITEBYTECODE=1 /usr/bin/python3 -B /usr/libexec/rock-wallet-backend-probe.py >/dev/console 2>&1 &
    ;;
esac
'''
TARGET_SOURCES = {
    'os/platform/service.py': '/usr/lib/rock-platform/service.py',
    'os/wallet_backend/client.py': '/usr/lib/rock-platform/wallet_backend/client.py',
    'os/entitlement/device.py': '/usr/lib/rock-platform/entitlement/device.py',
    'os/entitlement/protocol.py': '/usr/lib/rock-platform/entitlement/protocol.py',
    'src/blackberryrock/wallet.py': '/usr/lib/rock-platform/blackberryrock/wallet.py',
    'os/runner/transport.py': '/usr/lib/rock-platform/runner/transport.py',
    'os/registry/fixtures/development-ca.pem': CA_GUEST,
}


def utc():
    return datetime.now(timezone.utc).isoformat()


def sha(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def digest(value):
    return hashlib.sha256(canonical(value)).hexdigest()


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def save(path, value):
    temporary = path.with_suffix(path.suffix + '.tmp')
    with temporary.open('wb') as stream:
        stream.write(canonical(value) + b'\n')
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(temporary, path)
    descriptor = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def checkpoint(path, report):
    """A failed evidence write must never bypass owned-process cleanup."""
    try:
        save(path, report)
        return True
    except BaseException as exc:
        report['status'] = 'FAIL'
        report.setdefault('cleanup_errors', []).append('report persistence: ' + type(exc).__name__)
        return False


def debug(image, command, *, write=False, cwd=None):
    result = subprocess.run(['debugfs'] + (['-w'] if write else []) + ['-R', command, str(image)],
                            cwd=cwd, capture_output=True, timeout=25, check=True)
    return result.stdout


def cat(image, path):
    require(re.fullmatch(r'/[A-Za-z0-9_./-]+', path) is not None, 'fixed guest path required')
    return debug(image, 'cat ' + path)


def metadata(image, path):
    raw = debug(image, 'stat ' + path).decode('utf-8', 'replace')
    match = re.search(r'Type:\s+(\S+)\s+Mode:\s+([0-7]+)', raw)
    ownership = re.search(r'User:\s+(\d+)\s+Group:\s+(\d+)', raw)
    if not match or not ownership:
        return None
    return {'type': match[1], 'mode': int(match[2], 8),
            'uid': int(ownership[1]), 'gid': int(ownership[2])}


def inject(rootfs, evidence, authority_id, port):
    config = {'schema_version': 1, 'mode': 'development-remote-authority',
              'origin': 'https://10.0.2.2:' + str(port), 'authority_id': authority_id,
              'ca_file': CA_GUEST, 'token_file': TOKEN_GUEST}
    entries = [
        ('backend-config.json', CONFIG_GUEST, canonical(config) + b'\n', 0o444),
        ('PUBLIC-OWNER-TOKEN.txt', TOKEN_GUEST, (PUBLIC_TOKENS['alice'] + '\n').encode(), 0o444),
        ('guest_probe.py', PROBE_GUEST, (ROOT / 'os/wallet_backend/guest_probe.py').read_bytes(), 0o755),
        ('S99rock-wallet-backend-verify', HOOK_GUEST, HOOK, 0o755),
    ]
    require(metadata(rootfs, '/etc/rock-wallet') is None, 'input rootfs must not contain a Wallet backend opt-in directory')
    debug(rootfs, 'mkdir /etc/rock-wallet', write=True)
    debug(rootfs, 'set_inode_field /etc/rock-wallet mode 040755', write=True)
    debug(rootfs, 'set_inode_field /etc/rock-wallet uid 0', write=True)
    debug(rootfs, 'set_inode_field /etc/rock-wallet gid 0', write=True)
    records = []
    for local, destination, raw, mode in entries:
        require(metadata(rootfs, destination) is None, 'refuse replacement of an existing target entry')
        source = evidence / local
        with source.open('xb') as stream:
            stream.write(raw)
        # The debugfs source is a fixed basename, never a caller-built command.
        result = debug(rootfs, 'write ' + local + ' ' + destination, write=True, cwd=evidence)
        require(b'Allocated inode' in result, 'test-only image entry was not allocated')
        for field, value in (('mode', '010' + format(mode, '04o')), ('uid', '0'), ('gid', '0')):
            debug(rootfs, 'set_inode_field ' + destination + ' ' + field + ' ' + value, write=True)
        info = metadata(rootfs, destination)
        require(info == {'type': 'regular', 'mode': mode, 'uid': 0, 'gid': 0}, 'wrong injected file ownership/mode')
        require(cat(rootfs, destination) == raw, 'injected bytes differ from reviewed input')
        records.append({'path': destination, 'sha256': hashlib.sha256(raw).hexdigest(), **info})
    return records, config


def filesystem_check(data, evidence, phase):
    before = sha(data)
    result = subprocess.run(['e2fsck', '-f', '-n', str(data)], capture_output=True, timeout=30)
    logfile = evidence / f'data-check-{phase}.log'
    logfile.write_bytes(result.stdout + result.stderr)
    with data.open('rb') as stream:
        stream.seek(1024 + 58)
        state = struct.unpack('<H', stream.read(2))[0]
    require(result.returncode == 0 and state & 1 == 1, 'normal guest shutdown must leave clean ext4')
    require(sha(data) == before, 'read-only filesystem check changed data')
    return {'exit_code': result.returncode, 'clean': True, 'state': state,
            'data_sha256': before, 'log_sha256': sha(logfile)}


def markers(content, prefix):
    return [json.loads(line[len(prefix) + 1:]) for line in content.replace('\r', '').splitlines()
            if line.startswith(prefix + ' ')]


class QMPObserver:
    """Observe guest SHUTDOWN only; no host power/reset or guest input commands."""
    def __init__(self, path):
        self.events, self.errors = [], []
        self.ready, self.stop_event = threading.Event(), threading.Event()
        self.connection = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.connection.settimeout(2)
        self.connection.connect(str(path))
        self.connection.sendall(b'{"execute":"qmp_capabilities","id":"observe"}\n')
        self.thread = threading.Thread(target=self._read, daemon=True)
        self.thread.start()
        if not self.ready.wait(3):
            self.close()
            raise AssertionError('QMP capabilities were not acknowledged')

    def _read(self):
        pending = b''
        try:
            while not self.stop_event.is_set():
                try:
                    part = self.connection.recv(65536)
                except socket.timeout:
                    continue
                if not part:
                    break
                pending += part
                require(len(pending) <= 1024 * 1024, 'QMP frame bound exceeded')
                while b'\n' in pending:
                    raw, pending = pending.split(b'\n', 1)
                    value = json.loads(raw)
                    if value.get('id') == 'observe' and 'return' in value:
                        self.ready.set()
                    if 'event' in value:
                        require(len(self.events) < 1000, 'QMP event count exceeded')
                        self.events.append({'observed_utc': utc(), **value})
        except Exception as exc:
            if not self.stop_event.is_set():
                self.errors.append(type(exc).__name__)

    def close(self):
        self.stop_event.set()
        try:
            self.connection.shutdown(socket.SHUT_RDWR)
        except OSError:
            pass
        self.thread.join(3)
        self.connection.close()
        require(not self.thread.is_alive(), 'QMP observer did not exit')


def launch_authority(state, logfile, pipe):
    descriptor = os.open(logfile, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    os.dup2(descriptor, 1)
    os.dup2(descriptor, 2)
    os.close(descriptor)
    authority_process(state, 0, SEPTEMBER, pipe)


def wait_balance(pipe, billed):
    deadline = time.monotonic() + 12
    while True:
        value = rpc(pipe, {'op': 'snapshot'})
        if value['billed_minor'] == billed:
            return value
        require(time.monotonic() < deadline, 'automatic backend billing did not converge')
        time.sleep(.05)


def closed_cache(data, phase):
    before = sha(data)
    require(metadata(data, '/wallet/wallet-simulator.db') is None and
            metadata(data, '/wallet/entitlement.db') is None, 'device unexpectedly contains a second writable financial ledger')
    with tempfile.TemporaryDirectory(prefix='rock-wallet-cache-observe-') as temp:
        directory = Path(temp)
        for suffix in ('', '-wal', '-shm'):
            path = '/wallet/backend-cache/remote-cache.db' + suffix
            if metadata(data, path) is not None:
                raw = cat(data, path)
                (directory / ('cache.db' + suffix)).write_bytes(raw)
        database = directory / 'cache.db'
        require(database.is_file(), 'remote cache missing from stopped guest')
        with closing(sqlite3.connect('file:' + str(database) + '?mode=ro', uri=True)) as db:
            db.execute('PRAGMA query_only=ON')
            db.row_factory = sqlite3.Row
            require(db.execute('PRAGMA integrity_check').fetchone()[0] == 'ok', 'guest cache integrity failed')
            tables = {row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
            require(tables == {'identity', 'requests', 'snapshot'}, 'unexpected local cache table')
            rows = [dict(row) for row in db.execute('SELECT * FROM requests ORDER BY key')]
            expected = KEYS if phase == 3 else KEYS - {'os-wallet-final-cancel'}
            require({row['key'] for row in rows} == expected and all(row['response'] is not None for row in rows),
                    'offline request was queued, or online receipt remained unresolved')
            snap = db.execute('SELECT * FROM snapshot').fetchone()
            require(snap is not None and snap['received_at'] > 0, 'synchronized cache timestamp missing')
            wallet = json.loads(snap['payload'])
            require(wallet['available_minor'] == (3224 if phase == 3 else 4112), 'unexpected stopped guest cache balance')
            require(wallet['billed_minor'] == (1776 if phase == 3 else 888), 'unexpected stopped guest cache bill total')
            require(wallet['membership']['entitlement']['auto_renew'] is (phase != 3), 'stopped cache consent differs')
            result = {'tables': sorted(tables), 'identity': db.execute('SELECT fingerprint FROM identity').fetchone()[0],
                      'snapshot_sha256': hashlib.sha256(snap['payload'].encode()).hexdigest(),
                      'last_sync_unix': snap['received_at'], 'wallet': summary(wallet),
                      'receipts': [{'key': row['key'], 'request_sha256': hashlib.sha256(row['payload'].encode()).hexdigest(),
                                    'response_sha256': hashlib.sha256(row['response'].encode()).hexdigest()} for row in rows]}
    require(sha(data) == before, 'closed cache observation changed userdata')
    return result


def backend_receipts(state):
    result = {}
    for name in ('wallet-simulator.db', 'entitlement.db'):
        with closing(sqlite3.connect('file:' + str(state / name) + '?mode=ro', uri=True)) as db:
            db.execute('PRAGMA query_only=ON')
            require(db.execute('PRAGMA integrity_check').fetchone()[0] == 'ok', 'authority database integrity failed')
            if name == 'entitlement.db':
                rows = db.execute('SELECT key,request_json,response_json FROM device_api_receipts ORDER BY key').fetchall()
                require({row[0] for row in rows} == KEYS and all(row[2] is not None for row in rows), 'authority request receipts differ')
                result['receipts'] = [{'key': row[0], 'request_sha256': hashlib.sha256(row[1].encode()).hexdigest(),
                                       'response_sha256': hashlib.sha256(row[2].encode()).hexdigest()} for row in rows]
            else:
                bills = db.execute('SELECT period,amount_minor FROM wallet_bills ORDER BY period').fetchall()
                require(bills == [('2026-09', 888), ('2026-10', 888)], 'wrong durable monthly bill count or period')
                require(db.execute('SELECT COUNT(*) FROM wallet_withdrawals').fetchone()[0] == 0, 'unexpected authority withdrawal')
                balances = dict(db.execute('SELECT account,SUM(delta_minor) FROM wallet_postings GROUP BY account'))
                require(balances == {'AVAILABLE': 3224, 'PENDING_SETTLEMENT': 0, 'SALE_CLEARING': -5000, 'SERVICE_FEES': 1776},
                        'authority postings do not match two debits from one settled fixture credit')
                result.update(bills=bills, balances=balances)
    return result


def validate_guest(proof, phase, config, sources, cache):
    environment = proof['environment']
    require(environment['machine'] == 'aarch64' and environment['root_uid'] == 0, 'guest environment identity differs')
    require(environment['pinned_authority_id'] == config['authority_id'] and environment['origin'] == config['origin'],
            'guest is not configured for the owned pinned authority')
    require(environment['configuration_sha256'] == hashlib.sha256(canonical(config) + b'\n').hexdigest(), 'guest configuration differs')
    require(environment['ca_sha256'] == sources['os/registry/fixtures/development-ca.pem'], 'guest CA differs')
    expected = {TARGET_SOURCES[name]: sources[name] for name in
                ('os/platform/service.py', 'os/wallet_backend/client.py', 'os/entitlement/protocol.py')}
    expected[PROBE_GUEST] = sources['os/wallet_backend/guest_probe.py']
    require(environment['source_sha256'] == expected, 'guest executing source hashes differ')
    require('ro' in environment['mounts']['/']['options'] and 'rw' in environment['mounts']['/data']['options'], 'guest mount permissions differ')
    require([item['uids'] for item in environment['daemon_processes']] == [[1002] * 4, [1003] * 4], 'guest service UIDs differ')
    require(proof['owner_processes'] and all(item['uid'] == item['gid'] == 1000 and item['groups'] == []
            and item['expected_peer_uid'] == 1002 for item in proof['owner_processes']), 'owner IPC credentials differ')
    final = proof['wallet_final']
    require((final['available_minor'], final['billed_minor'], final['bill_count'], final['auto_renew']) ==
            ((3224, 1776, 2, False) if phase == 3 else (4112, 888, 1, True)), 'guest final money/consent state differs')
    require(final['backend']['stale'] is (phase == 2) and final['backend']['connected'] is (phase != 2)
            and final['backend']['pending_reconciliation'] is False, 'guest cache freshness or pending state differs')
    fields = ('key', 'request_sha256', 'response_sha256')
    require([{name: row[name] for name in fields} for row in proof['cache']['receipts']] == cache['receipts'],
            'guest observed receipts differ from stopped cache')
    require(proof['cache']['authority_fingerprint'] == cache['identity'], 'guest observed cache binding differs')
    if phase == 2:
        attempts = [item for item in proof['owner_mutations'] if item['key'] == 'os-wallet-offline-cancel']
        require(len(attempts) == 1 and attempts[0]['ok'] is False and attempts[0]['error_kind'] == 'unavailable',
                'offline phase needs a real unavailable cancellation response')
        require(environment['no_guest_nic'] is True, 'offline phase exposed a guest NIC')


def verify(artifacts, output):
    require(sys.platform == 'linux', 'execute only in the authorized Linux QEMU build VM')
    output = Path(output).absolute()
    output.mkdir(parents=True, mode=0o700, exist_ok=False)
    report_path = output / 'report.json'
    report = {'schema': 'rock-wallet-three-os-boots/1', 'status': 'RUNNING', 'started_utc': utc(),
              'scope': 'Actual ARM64 QEMU OS uid1000 Platform IPC, owned TLS authority, three normal shutdowns; native GUI NOT_RUN',
              'simulation_only': True, 'real_provider': 'NOT_RUN', 'physical_blackberry': 'NOT_RUN',
              'clock': 'October advances only after actual QEMU termination; November advances after the online cancellation receipt',
              'input_device_data': 'new disposable disk only; no existing device data copied or migrated',
              'environment': {'system': platform.platform(), 'python': platform.python_version()},
              'boots': [], 'checks': [], 'host_power_commands': 0}
    save(report_path, report)
    authority = pipe = guest = observer = None
    sources, inputs = {}, {}
    verified = False
    try:
        artifacts = Path(artifacts).resolve(strict=True)
        kernel, original = artifacts / 'Image', artifacts / 'rootfs.ext4'
        inputs = {str(path): sha(path) for path in (kernel, original, artifacts / 'stage0.cpio.gz') if path.is_file()}
        require(str(kernel) in inputs and str(original) in inputs, 'input kernel/rootfs are required')
        sources = {name: sha(ROOT / name) for name in set(TARGET_SOURCES) | {
            'os/wallet_backend/server.py', 'os/wallet_backend/verify_off_device.py',
            'os/wallet_backend/verify_os.py', 'os/wallet_backend/guest_probe.py'}}
        report.update(input_images=inputs, source_sha256=sources)
        try:
            report['repo_head'] = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True, stderr=subprocess.DEVNULL).strip()
        except (FileNotFoundError, subprocess.CalledProcessError):
            report.update(repo_head=None, repo_head_unavailable='git/HEAD unavailable in VM; join host HEAD using recorded source hashes')
        for name, destination in TARGET_SOURCES.items():
            require(hashlib.sha256(cat(original, destination)).hexdigest() == sources[name], 'target/source mismatch: ' + name)
        report['target_sources_match'] = True
        private = output / 'private'
        private.mkdir(mode=0o700)
        ctx = mp.get_context('spawn')
        pipe, child_pipe = ctx.Pipe()
        state = private / 'authority'
        authority = ctx.Process(target=launch_authority, args=(str(state), str(output / 'authority.log'), child_pipe), name='authority-os-proof')
        authority.start()
        child_pipe.close()
        ready = receive(pipe)
        require(ready.get('ready') is True and authority.is_alive(), 'authority did not start')
        report.update(authority_id=ready['authority_id'], authority_pid=ready['pid'], authority_port=ready['port'])
        rootfs = output / 'test-rootfs.ext4'
        with original.open('rb') as source, rootfs.open('xb') as destination:
            shutil.copyfileobj(source, destination, 1024 * 1024)
        rootfs.chmod(0o600)
        report['injected_entries'], config = inject(rootfs, output, ready['authority_id'], ready['port'])
        derived_hash = sha(rootfs)
        report['test_rootfs_sha256'] = derived_hash
        data = output / 'userdata.ext4'
        with data.open('xb') as stream:
            stream.truncate(128 * 1024 * 1024)
        result = subprocess.run(['mkfs.ext4', '-q', '-F', '-L', 'rock-data', str(data)], capture_output=True, check=True, timeout=30)
        (output / 'data-create.log').write_bytes(result.stdout + result.stderr)
        report['initial_data_sha256'] = sha(data)
        fingerprint = digest(['https://10.0.2.2:' + str(ready['port']), ready['authority_id'],
                              sources['os/registry/fixtures/development-ca.pem'],
                              hashlib.sha256(PUBLIC_TOKENS['alice'].encode()).hexdigest()])
        save(report_path, report)
        with tempfile.TemporaryDirectory(prefix='rock-wallet-qmp-') as sockets:
            for phase in (1, 2, 3):
                monitor = Path(sockets) / f'{phase}.sock'
                logfile = output / f'boot-{phase}.log'
                boot = {'phase': phase, 'started_utc': utc(), 'data_before_sha256': sha(data),
                        'kernel_sha256': sha(kernel), 'rootfs_sha256': sha(rootfs), 'nic': phase != 2}
                report['boots'].append(boot)
                command = ['qemu-system-aarch64', '-machine', 'virt-10.0,gic-version=3', '-accel', 'tcg', '-cpu', 'cortex-a53',
                           '-m', '1024', '-smp', '2', '-display', 'none', '-serial', 'stdio', '-monitor', 'none',
                           '-qmp', f'unix:{monitor},server=on,wait=off', '-no-reboot', '-kernel', str(kernel),
                           '-append', 'console=ttyAMA0 vt.global_cursor_default=0 fbcon=map:1 root=/dev/vda ro rootflags=noload rootwait panic=-1 rock.wallet.verify=' + str(phase),
                           '-drive', f'if=none,file={rootfs},format=raw,id=osdisk,readonly=on', '-device', 'virtio-blk-pci,drive=osdisk,addr=0x1',
                           '-drive', f'if=none,file={data},format=raw,id=userdata', '-device', 'virtio-blk-pci,drive=userdata,addr=0x2',
                           '-object', 'rng-random,filename=/dev/urandom,id=rockrng', '-device', 'virtio-rng-pci,rng=rockrng,addr=0x3',
                           '-device', 'virtio-gpu-pci,xres=720,yres=960,addr=0x4', '-device', 'virtio-keyboard-pci,addr=0x5',
                           '-device', 'virtio-tablet-pci,addr=0x6']
                command += (['-netdev', 'user,id=wallet-net', '-device', 'virtio-net-pci,netdev=wallet-net,addr=0x7,romfile=']
                            if phase != 2 else ['-nic', 'none'])
                boot['command'] = command
                with logfile.open('xb') as log:
                    guest = subprocess.Popen(command, stdin=subprocess.DEVNULL, stdout=log, stderr=subprocess.STDOUT)
                    boot['pid'] = guest.pid
                    deadline = time.monotonic() + 15
                    while not monitor.exists():
                        require(guest.poll() is None and time.monotonic() < deadline, 'QEMU monitor failed to start')
                        time.sleep(.05)
                    observer = QMPObserver(monitor)
                    deadline, handled = time.monotonic() + 110, False
                    while guest.poll() is None:
                        content = logfile.read_text(errors='replace')
                        require(not markers(content, 'ROCK_WALLET_GUEST_FAIL'), 'guest reported a failed assertion')
                        marker = 'ROCK_WALLET_READY_FOR_SEED' if phase == 1 else 'ROCK_WALLET_CANCELED'
                        if phase in (1, 3) and not handled and markers(content, marker):
                            found = markers(content, marker)
                            require(len(found) == 1 and found[0]['phase'] == phase, 'unexpected guest transition marker')
                            current = rpc(pipe, {'op': 'snapshot'})
                            if phase == 1:
                                require(current['membership']['registered'] and not current['membership']['entitlement']['auto_renew']
                                        and current['available_minor'] == current['billed_minor'] == 0, 'registration unexpectedly consented or debited')
                                boot['private_seed'] = rpc(pipe, {'op': 'fixture-settlement'})
                            else:
                                require(current['billed_minor'] == 1776 and not current['membership']['entitlement']['auto_renew'], 'cancel marker preceded authority cancellation')
                                boot['private_november_clock'] = rpc(pipe, {'op': 'clock', 'now': NOVEMBER})
                            boot['private_control_utc'] = utc()
                            handled = True
                        require(time.monotonic() < deadline, 'guest normal shutdown timed out')
                        time.sleep(.1)
                    boot.update(exit_code=guest.returncode, terminated_utc=utc())
                    require(guest.returncode == 0, 'QEMU did not exit normally')
                    observer.thread.join(3)
                    boot['qmp_events'] = observer.events
                    require(not observer.errors, 'QMP observation failed')
                    observer.close()
                    observer = None
                guest = None
                content = logfile.read_text(errors='replace')
                require('reboot: Power down' in content and re.search(r'EXT4-fs \(vdb\): unmounting filesystem', content),
                        'normal init data unmount and kernel powerdown were not observed')
                shutdowns = [event for event in boot['qmp_events'] if event['event'] == 'SHUTDOWN' and event.get('data', {}).get('guest') is True]
                require(len(shutdowns) == 1, 'exactly one guest-initiated QMP SHUTDOWN required')
                require(phase == 2 or handled, 'required private host control did not occur')
                boot['filesystem'] = filesystem_check(data, output, phase)
                raw = cat(data, f'/wallet-backend-{phase}.json')
                proof = json.loads(raw)
                require(proof.get('status') == 'PASS' and proof.get('phase') == phase, 'durable guest proof did not pass')
                passed = markers(content, 'ROCK_WALLET_GUEST_PASS')
                require(len(passed) == 1 and passed[0]['phase'] == phase and passed[0]['boot_id'] == proof['boot_id'], 'guest pass marker differs from durable boot proof')
                if 'proof_sha256' in passed[0]:
                    require(passed[0]['proof_sha256'] == hashlib.sha256(raw).hexdigest(), 'serial/durable proof digest differs')
                else:
                    require(passed[0] == proof, 'serial/durable full proof differs')
                save(output / f'guest-proof-{phase}.json', proof)
                boot.update(guest=proof, boot_id=proof['boot_id'], log_sha256=sha(logfile), data_after_sha256=sha(data),
                            cache=closed_cache(data, phase))
                validate_guest(proof, phase, config, sources, boot['cache'])
                require(boot['cache']['identity'] == fingerprint, 'guest cache is not bound to the expected TLS authority')
                require(sha(rootfs) == derived_hash and sha(kernel) == inputs[str(kernel)], 'kernel or read-only derived rootfs changed')
                current = rpc(pipe, {'op': 'snapshot'})
                if phase == 1:
                    require(current['available_minor'] == 4112 and current['billed_minor'] == 888 and len(current['bills']) == 1, 'September authority total differs')
                    report['september'] = summary(current)
                    require(authority.is_alive(), 'independent authority must remain alive with guest terminated')
                    report['october_clock_after_guest_termination'] = {'utc': utc(), **rpc(pipe, {'op': 'clock', 'now': OCTOBER})}
                    current = wait_balance(pipe, 1776)
                    require(current['available_minor'] == 3224 and len(current['bills']) == 2, 'off-device October debit incorrect')
                    report['october_while_os_powered_off'] = summary(current)
                elif phase == 2:
                    require(current['available_minor'] == 3224 and current['billed_minor'] == 1776 and current['membership']['entitlement']['auto_renew'] is True,
                            'offline cancellation altered the live authority')
                    report['authority_after_offline_guest'] = summary(current)
                else:
                    require(current['available_minor'] == 3224 and current['billed_minor'] == 1776 and len(current['bills']) == 2
                            and current['membership']['entitlement']['auto_renew'] is False, 'November cancellation did not prevent a new bill')
                    report['november_after_online_cancel'] = summary(current)
                save(report_path, report)
        require(len({boot['boot_id'] for boot in report['boots']}) == 3, 'three distinct kernel boots required')
        stop_authority(authority, pipe)
        report['authority_exit_code'] = authority.exitcode
        authority = pipe = None
        report['closed_authority'] = backend_receipts(state)
        require(report['closed_authority']['receipts'] == report['boots'][2]['cache']['receipts'], 'guest cache receipts differ from immutable authority receipts')
        report['checks'] = ['three distinct normal ARM64 OS shutdowns and clean data',
                            'September real Platform IPC consent and one 888-cent simulator debit',
                            'October automatic debit occurs only after QEMU process termination',
                            'NIC-less boot retains explicitly stale 4112 cache and does not queue cancellation',
                            'online boot synchronizes 3224 and explicit cancellation prevents November debit',
                            'one authoritative ledger; device cache contains no local money writer',
                            'closed cache/authority immutable receipt identities agree']
        verified = True
        report['status'] = 'VERIFYING_CLEANUP'
    except BaseException as exc:
        report.update(status='FAIL', error=type(exc).__name__ + ': ' + str(exc))
    finally:
        # Persist the failure/progress before cleanup can fail or time out.
        checkpoint(report_path, report)
        if guest is not None and guest.poll() is None:
            report['forced_cleanup_qemu_pid'] = guest.pid
            report['status'] = 'FAIL'
            try:
                guest.terminate()
                try:
                    guest.wait(5)
                except subprocess.TimeoutExpired:
                    guest.kill()
                    guest.wait(5)
            except Exception as exc:
                report.setdefault('cleanup_errors', []).append('QEMU: ' + type(exc).__name__)
        if observer is not None:
            try:
                observer.close()
            except Exception as exc:
                report.setdefault('cleanup_errors', []).append('QMP: ' + type(exc).__name__)
        if authority is not None:
            try:
                stop_authority(authority, pipe)
            except Exception as exc:
                report.setdefault('cleanup_errors', []).append('authority: ' + type(exc).__name__)
                if authority.is_alive():
                    authority.kill()
                    authority.join(5)
        for label, values in (('input_images', inputs), ('source', sources)):
            try:
                after = {name: sha(Path(name) if label == 'input_images' else ROOT / name) for name in values}
                report[label + '_unchanged'] = after == values
                require(after == values, label + ' changed during verification')
            except Exception as exc:
                report.setdefault('cleanup_errors', []).append(label + ': ' + type(exc).__name__)
        report['status'] = 'PASS' if verified and not report.get('cleanup_errors') else 'FAIL'
        report['finished_utc'] = utc()
        try:
            report['retained_artifacts_sha256'] = {path.name: sha(path) for path in output.iterdir()
                                                 if path.is_file() and path.name not in ('report.json', 'report.json.tmp')}
        except BaseException as exc:
            report['status'] = 'FAIL'
            report.setdefault('cleanup_errors', []).append('artifact hashes: ' + type(exc).__name__)
        checkpoint(report_path, report)
        print(json.dumps({'status': report['status'], 'report': str(report_path), 'boots': len(report['boots'])}), flush=True)
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--artifacts', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    arguments = parser.parse_args()
    result = verify(arguments.artifacts, arguments.output)
    raise SystemExit(0 if result['status'] == 'PASS' else 1)

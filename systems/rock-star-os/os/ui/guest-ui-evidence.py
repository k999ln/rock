#!/usr/bin/env python3
"""Fixed read-only observer for the rock.ui.verify=1 native guest test.

It never invokes a mutation, health probe, shell, or configurable guest path.
Only its own /data/ui-proof.json is written. The guarded verification boot is
powered off after recording evidence, including when a check fails.
"""
from __future__ import annotations

import hashlib
from contextlib import closing
import json
import os
from pathlib import Path
import re
import socket
import sqlite3
import stat
import struct
import subprocess
import sys
import time

API = '/run/rock-platform/api.sock'
DATABASE = '/data/platform/hub.db'
PROOF = Path('/data/ui-proof.json')
TOOL = 'org.example.action-checklist'
VERSION = '2.0.0'
INPUT = 'Native OS\nLocal result'
OUTPUT = '- [ ] Local result\n- [ ] Native OS'
MAX_RESPONSE = 1024 * 1024
WAIT_SECONDS = 210
CAPTURE_SECONDS = 30


def canonical(value):
    return json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(',', ':'), allow_nan=False).encode()


def digest(value):
    return hashlib.sha256(canonical(value)).hexdigest()


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def read_api(op, job_id=None):
    """The only IPC entry point deliberately permits exactly two read operations."""
    if op == 'snapshot' and job_id is None:
        request = {'v': 1, 'op': 'snapshot'}
    elif op == 'job.result' and isinstance(job_id, str) and re.fullmatch(r'[0-9a-f-]{36}', job_id):
        request = {'v': 1, 'op': 'job.result', 'id': job_id}
    else:
        raise ValueError('observer permits only snapshot and a fixed-format job result read')
    with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as connection:
        deadline = time.monotonic() + 5
        connection.settimeout(5)
        connection.connect(API)
        _, uid, _ = struct.unpack('3i', connection.getsockopt(socket.SOL_SOCKET, socket.SO_PEERCRED, 12))
        require(uid == 1002, 'platform peer UID must be 1002 before sending a request')
        connection.sendall(canonical(request) + b'\n')
        frame = bytearray()
        while b'\n' not in frame:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise TimeoutError('read-only API response deadline exceeded')
            connection.settimeout(remaining)
            chunk = connection.recv(min(65536, MAX_RESPONSE + 1 - len(frame)))
            require(bool(chunk), 'platform truncated its response')
            frame.extend(chunk)
            require(len(frame) <= MAX_RESPONSE, 'platform response exceeds 1 MiB')
        require(frame.count(b'\n') == 1 and frame.endswith(b'\n') and b'\0' not in frame,
                'platform must return one newline-delimited JSON frame')
        response = json.loads(frame)
        require(isinstance(response, dict) and response.get('ok') is True, 'platform read failed: ' + str(response)[:300])
        return response


def wallet_baseline(wallet):
    require(wallet.get('simulation_only') is True and wallet.get('currency') == 'USD', 'Wallet must be the USD simulator')
    for name in ('available_minor', 'pending_minor', 'held_minor', 'billed_minor', 'dispensed_minor', 'ledger_balance_minor'):
        require(type(wallet.get(name)) is int and wallet[name] == 0, 'fresh Wallet must have actual zero ' + name)
    require(wallet.get('consent', {}).get('accepted') is False, 'fresh Wallet must have no billing consent')
    for name in ('sales', 'withdrawals', 'bills', 'journals'):
        require(wallet.get(name) == [], 'fresh Wallet has unexpected ' + name)
    return digest(wallet)


def process_identity(pidfile, expected_uid, executable, command_token=None):
    pid = int(Path(pidfile).read_text().strip())
    require(pid > 1, 'service pid must be a userspace service')
    root = Path('/proc') / str(pid)
    fields = {}
    for line in (root / 'status').read_text().splitlines():
        key, _, value = line.partition(':')
        fields[key] = value.strip()
    uids = [int(value) for value in fields.get('Uid', '').split()]
    gids = [int(value) for value in fields.get('Gid', '').split()]
    actual_executable = os.readlink(root / 'exe')
    command = (root / 'cmdline').read_bytes().split(b'\0')
    require(uids == [expected_uid] * 4 and gids == [expected_uid] * 4, 'wrong service identity: ' + pidfile)
    require(fields.get('NoNewPrivs') == '1', 'no_new_privs missing: ' + pidfile)
    require(actual_executable == executable or (executable == '/usr/bin/python3' and actual_executable.startswith('/usr/bin/python3.')),
            'unexpected service executable: ' + actual_executable)
    if command_token is not None:
        require(command_token.encode() in command, 'wrong platform service role')
    return {'pid': pid, 'uid': uids, 'gid': gids, 'no_new_privs': 1, 'executable': actual_executable}


def environment_evidence(*, store_network=False):
    mounts = [line.split() for line in Path('/proc/mounts').read_text().splitlines()]
    root = next((m for m in mounts if m[1] == '/' and m[2] == 'ext4'), None)
    data = next((m for m in mounts if m[1] == '/data'), None)
    require(root is not None and 'ro' in root[3].split(','), 'guest ext4 root must be read-only')
    require(data is not None and data[0] == '/dev/vdb' and data[2] == 'ext4' and
            {'rw', 'nosuid', 'nodev', 'noexec'}.issubset(data[3].split(',')), 'guest data mount protection mismatch')
    network = sorted(os.listdir('/sys/class/net'))
    hardware_nics = [name for name in network if (Path('/sys/class/net') / name / 'device').exists()]
    allowed = {'lo', 'dummy0', 'sit0'} | ({'eth0'} if store_network else set())
    require('lo' in network and set(network).issubset(allowed) and hardware_nics == (['eth0'] if store_network else []),
            'guest has an unexpected network adapter')
    if store_network:
        require(Path('/sys/class/net/eth0/device/driver').resolve().name == 'virtio_net', 'store test requires the explicit virtio NIC')
    dimensions = Path('/sys/class/graphics/fb0/virtual_size').read_text().strip()
    require(dimensions == '720,960', 'native framebuffer must be 720 by 960')
    inputs = [p.read_text().strip() for p in Path('/sys/class/input').glob('event*/device/name')]
    require(any('keyboard' in name.lower() for name in inputs) and any('tablet' in name.lower() for name in inputs),
            'native evdev keyboard/tablet missing')
    owners = {}
    for path, uid in (('/data/rock', 1000), ('/data/platform', 1002), ('/data/wallet', 1003)):
        info = os.stat(path)
        require(stat.S_ISDIR(info.st_mode) and info.st_uid == uid and info.st_gid == uid and stat.S_IMODE(info.st_mode) == 0o700,
                'persistent directory owner or mode mismatch: ' + path)
        owners[path] = {'uid': uid, 'gid': uid, 'mode': '0700'}
    processes = {
        'ui': process_identity('/run/rock-ui.pid', 1000, '/usr/bin/rock-ui'),
        'core': process_identity('/run/rockd.pid', 1000, '/usr/sbin/rockd'),
        'platform': process_identity('/run/rock-platform.pid', 1002, '/usr/bin/python3', 'platform'),
        'wallet': process_identity('/run/rock-wallet.pid', 1003, '/usr/bin/python3', 'wallet'),
    }
    return {'root_mount': root[:4], 'data_mount': data[:4], 'network_interfaces': network, 'hardware_network_interfaces': hardware_nics,
            'framebuffer': [720, 960], 'evdev_names': inputs, 'data_owners': owners, 'processes': processes}


def read_receipts():
    """SQLite mode=ro/query_only: never initialize Hub or call its write methods."""
    with closing(sqlite3.connect('file:' + DATABASE + '?mode=ro', uri=True, timeout=2)) as connection:
        connection.execute('PRAGMA query_only=ON')
        connection.row_factory = sqlite3.Row
        receipts = [dict(row) for row in connection.execute('SELECT key,request_hash,result FROM hub_requests LIMIT 5')]
    return receipts


def check_progress(snapshot, baseline_hash, package_hash, contract=None):
    tool, version, text_input, text_output = (TOOL, VERSION, INPUT, OUTPUT) if contract is None else (
        contract['id'], contract['version'], contract['input'], contract['output'])
    require(digest(snapshot['wallet']) == baseline_hash, 'tool execution or navigation changed the Wallet')
    hub = snapshot['hub']
    require(hub.get('maturity') == 'virtual_os_integrated' and hub.get('modes', {}).get('device_local') == 'linux_namespace_seccomp',
            'job is not running on the native OS sandbox backend')
    require(len(hub['installed']) <= 1 and len(hub['jobs']) <= 1 and not hub.get('jobs_truncated'), 'unexpected extra installation or job')
    audit = sorted(hub['audit'], key=lambda row: row['seq'])
    require([row['event'] for row in audit] == ['installed_disabled', 'enabled', 'run_approved'][:len(audit)] and len(audit) <= 3,
            'unexpected or out-of-order GUI audit events')
    bodies = [json.loads(row['body']) for row in audit]
    if bodies:
        require(bodies[0] == {'id': tool, 'version': version, 'hash': package_hash}, 'installed package audit differs from reviewed tool')
    if len(bodies) >= 2:
        require(bodies[1] == {'id': tool, 'hash': package_hash}, 'permission approval did not match the installed package hash')
    if hub['installed']:
        item = hub['installed'][0]
        require(item['id'] == tool and item['version'] == version and item['hash'] == package_hash, 'wrong installed package')
    job = hub['jobs'][0] if hub['jobs'] else None
    if job:
        require(job['tool_id'] == tool and job['version'] == version and job['package_hash'] == package_hash, 'job package identity mismatch')
        require(re.fullmatch(r'ui-[0-9a-f]{32}', job['key']) is not None, 'job did not use a native UI request identity')
        require(job['input_bytes'] == len(text_input.encode()) and job['request_hash'] == digest({'id': tool, 'text': text_input, 'target': 'device_local'}),
                'real evdev keyboard text or target differs from expected input')
        require(job['status'] in ('running', 'succeeded'), 'native job did not succeed: ' + str(job.get('error')))
        require(len(bodies) == 3 and bodies[2] == {'job_id': job['id'], 'package_hash': package_hash,
                'execution_target': 'device_local', 'actual_host': 'rock_os_linux_namespace', 'sent_to_cloud': False, 'amount_minor': 0},
                'run audit does not attest local free sandbox execution')
        if job['status'] == 'succeeded':
            require(job['output'] == text_output and not job.get('output_truncated') and job['error'] is None,
                    'actual completed output differs from typed input transformation')
            require(hub['installed'][0]['enabled'] == 1, 'installed tool lost its approved state')
    return {'stage': len(audit), 'audit': audit, 'job': job}


def validate_receipts(receipts, package_hash, job, contract=None):
    tool, version, text_input = (TOOL, VERSION, INPUT) if contract is None else (contract['id'], contract['version'], contract['input'])
    require(len(receipts) == 3, 'exactly install, approve, and run durable receipts are required')
    result = {}
    for row in receipts:
        key = row['key']
        require(re.fullmatch(r'ui-[0-9a-f]{32}', key) is not None, 'receipt identity was not generated by the native UI')
        candidates = {
            'install': {'v': 1, 'op': 'install', 'key': key, 'id': tool, 'version': version},
            'approve': {'v': 1, 'op': 'approve', 'key': key, 'id': tool, 'version': version, 'approved_hash': package_hash},
            'run': {'v': 1, 'op': 'run', 'key': key, 'id': tool, 'text': text_input, 'target': 'device_local'},
        }
        matches = [op for op, payload in candidates.items() if digest(payload) == row['request_hash']]
        require(len(matches) == 1 and matches[0] not in result, 'receipt hash differs from exact GUI request or duplicates an operation')
        op = matches[0]
        saved = json.loads(row['result'])
        if op == 'install':
            require(saved == {'id': tool, 'version': version, 'hash': package_hash, 'enabled': False}, 'install receipt result mismatch')
        elif op == 'approve':
            require(saved == {'id': tool, 'enabled': True}, 'approval receipt result mismatch')
        else:
            require(key == job['key'] and saved['id'] == job['id'] and saved['request_hash'] == job['request_hash'], 'run receipt/job mismatch')
        result[op] = {'key': key, 'request_hash': row['request_hash'], 'result': saved}
    require(set(result) == {'install', 'approve', 'run'}, 'missing native GUI receipt')
    return result


def emit(marker, value=None):
    # A background observer can share ttyAMA0 with a getty prompt lacking a
    # trailing newline. Always start our bounded marker on its own line.
    print('\n' + marker + ((' ' + canonical(value).decode()) if value is not None else ''), flush=True)


def observe(report):
    deadline = time.monotonic() + WAIT_SECONDS
    while True:
        try:
            initial = read_api('snapshot')['snapshot']
            environment = environment_evidence()
            break
        except (OSError, ValueError, AssertionError) as error:
            if time.monotonic() >= deadline:
                raise TimeoutError('native services did not become ready: ' + str(error)) from error
            time.sleep(0.5)
    require(initial['hub']['installed'] == [] and initial['hub']['jobs'] == [] and initial['hub']['audit'] == [] and read_receipts() == [],
            'verification requires fresh persistent Hub data')
    baseline_hash = wallet_baseline(initial['wallet'])
    package = next(item for item in initial['catalog'] if item['manifest']['id'] == TOOL and item['manifest']['version'] == VERSION)
    package_hash = package['hash']
    report.update(environment_initial=environment, wallet_initial=initial['wallet'], wallet_initial_sha256=baseline_hash,
                  tool={'id': TOOL, 'version': VERSION, 'package_hash': package_hash}, expected_input=INPUT, expected_output=OUTPUT)
    emit('ROCK_UI_OBSERVER_READY', {'tool': TOOL, 'version': VERSION, 'wallet_sha256': baseline_hash})
    stage, succeeded_at, progress = 0, None, None
    while time.monotonic() < deadline:
        snapshot = read_api('snapshot')['snapshot']
        progress = check_progress(snapshot, baseline_hash, package_hash)
        if progress['stage'] > stage:
            for number in range(stage + 1, progress['stage'] + 1):
                emit(('', 'ROCK_UI_INSTALLED_OBSERVED', 'ROCK_UI_APPROVED_OBSERVED', 'ROCK_UI_RUN_OBSERVED')[number])
            stage = progress['stage']
        job = progress['job']
        if job and job['status'] == 'succeeded' and succeeded_at is None:
            succeeded_at = time.monotonic()
            emit('ROCK_UI_JOB_OBSERVED', {'id': job['id'], 'status': job['status'], 'output': job['output']})
        if succeeded_at is not None and time.monotonic() - succeeded_at >= CAPTURE_SECONDS:
            full_job = read_api('job.result', job['id'])['result']
            require(full_job['status'] == 'succeeded' and full_job['output'] == OUTPUT and full_job['key'] == job['key'], 'full job result differs from snapshot')
            report.update(environment_final=environment_evidence(), wallet_final=snapshot['wallet'], wallet_final_sha256=digest(snapshot['wallet']),
                          audit=progress['audit'], job=full_job, receipts=validate_receipts(read_receipts(), package_hash, job),
                          installed=snapshot['hub']['installed'], hub_maturity=snapshot['hub']['maturity'], hub_modes=snapshot['hub']['modes'],
                          capture_grace_seconds=CAPTURE_SECONDS, wallet_unchanged=True)
            require(report['environment_initial']['processes'] == report['environment_final']['processes'], 'a service restarted during GUI verification')
            report['status'] = 'PASS'
            return
        time.sleep(0.35)
    raise TimeoutError('native GUI install/approve/run or screenshot grace period did not finish in time; last stage=' + str(stage))


def persist(report):
    temporary = PROOF.with_name('ui-proof.json.tmp')
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'wb') as stream:
        stream.write(canonical(report) + b'\n')
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(temporary, PROOF)
    directory = os.open('/data', os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(directory)
    finally:
        os.close(directory)


def main():
    # These guards precede every write and shutdown; invocation on a dev host is harmless.
    if os.getuid() != 0 or os.geteuid() != 0 or os.uname().machine != 'aarch64' or 'rock.ui.verify=1' not in Path('/proc/cmdline').read_text().split():
        raise SystemExit('observer requires root in an explicitly flagged Rock OS ARM64 verification boot')
    report = {'schema': 'rock-native-ui-proof/1', 'status': 'FAIL', 'scope': 'actual QEMU ARM64 native framebuffer/evdev GUI',
              'observer': 'read-only snapshot/job.result and SQLite mode=ro; no platform or Wallet mutations',
              'blackberry': 'NOT_RUN', 'wallet': 'SIMULATOR_ONLY', 'started_unix': time.time()}
    try:
        observe(report)
    except BaseException as error:
        report['error'] = type(error).__name__ + ': ' + str(error)
    finally:
        report['finished_unix'] = time.time()
        try:
            persist(report)
        except BaseException as error:
            report['status'] = 'FAIL'
            report['persistence_error'] = str(error)
        emit('ROCK_UI_GUEST_PROOF', report)
        emit('ROCK_UI_GUEST_' + report['status'])
        os.sync()
        subprocess.run(['/sbin/poweroff', '-f'], check=False)
    return 0 if report['status'] == 'PASS' else 1


if __name__ == '__main__':
    sys.exit(main())

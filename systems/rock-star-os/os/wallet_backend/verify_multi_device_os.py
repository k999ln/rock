"""Three actual ARM64 boots: A, B, and revoked A with its retained cache.

Disposable copied profiles/userdata share one owned TLS authority. Only UID1000
guest IPC registers/consents/cancels; synthetic credit and signed fulfillment
events use a private host pipe. No native GUI, ATM, physical device or provider
claim. Run only in the authorized Linux development VM with a frozen image set.
"""
import argparse
from contextlib import closing
import hashlib
import json
import multiprocessing as mp
import os
from pathlib import Path
import platform
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import threading
import time

ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(ROOT / 'src'), str(ROOT / 'os')]
from blackberryrock.packages import canonical
from entitlement.protocol import PUBLIC_TOKENS, sign_fixture_event
from wallet_backend import server as backend
from wallet_backend import verify_os as common
from wallet_backend import guest_multi_device_probe as guest_probe
from wallet_backend.verify_off_device import receive, rpc

sha, digest, require, save, utc = common.sha, common.digest, common.require, common.save, common.utc
A, B = guest_probe.A_DEVICE, guest_probe.B_DEVICE
START = 1788856800
PROBE = '/usr/libexec/rock-wallet-multi-device-probe.py'
COMMON = '/usr/libexec/rock-wallet-probe-common.py'
HOOK_PATH = '/etc/init.d/S99rock-wallet-multi-verify'
HOOK = b'''#!/bin/sh
[ "${1:-start}" = start ] || exit 0
case " $(cat /proc/cmdline) " in
  *" rock.wallet.multi=1 "*|*" rock.wallet.multi=2 "*|*" rock.wallet.multi=3 "*)
    PYTHONDONTWRITEBYTECODE=1 /usr/bin/python3 -B /usr/libexec/rock-wallet-multi-device-probe.py >/dev/console 2>&1 &
    ;;
esac
'''
TARGET_SOURCES = common.TARGET_SOURCES | {
    'os/entitlement/store.py': '/usr/lib/rock-platform/entitlement/store.py',
    'os/entitlement/wallet_bridge.py': '/usr/lib/rock-platform/entitlement/wallet_bridge.py',
}
SOURCE_FILES = set(TARGET_SOURCES) | {
    'os/wallet_backend/server.py', 'os/wallet_backend/verify_os.py',
    'os/wallet_backend/verify_off_device.py', 'os/wallet_backend/guest_probe.py',
    'os/wallet_backend/guest_multi_device_probe.py', 'os/wallet_backend/verify_multi_device_os.py',
    'os/entitlement/fixtures/device-handoff.json',
}
EXPECTED_RECEIPTS = {guest_probe.KEY_A_REGISTER, guest_probe.KEY_A_CONSENT,
                     guest_probe.KEY_B_REGISTER, guest_probe.KEY_B_CANCEL}


def safe_wallet(snapshot):
    membership = snapshot['membership']
    entitlement = membership.get('entitlement')
    return {'available_minor': snapshot['available_minor'], 'held_minor': snapshot['held_minor'],
            'billed_minor': snapshot['billed_minor'], 'ledger_balance_minor': snapshot['ledger_balance_minor'],
            'bill_count': len(snapshot['bills']), 'bill_periods': sorted(b['period'] for b in snapshot['bills']),
            'registered': membership['registered'], 'auto_renew': entitlement['auto_renew'] if entitlement else False,
            'account_sha256': hashlib.sha256(entitlement['account_id'].encode()).hexdigest() if entitlement else None}


def launch_authority(state, logfile, pipe):
    """Public fixture setup, private controls and a read-only HTTP intake observer."""
    os.umask(0o077)
    descriptor = os.open(logfile, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    os.dup2(descriptor, 1)
    os.dup2(descriptor, 2)
    os.close(descriptor)
    state = Path(state)
    credentials = state.parent / 'PUBLIC-device-credentials.json'
    credentials.write_bytes(canonical({'schema_version': 1, 'kind': 'public-development-device-credentials',
        'devices': [{'device_ref': A, 'owner_actor': 'alice', 'token': PUBLIC_TOKENS['alice']},
                    {'device_ref': B, 'owner_actor': 'alice', 'token': backend.PUBLIC_SECOND_DEVICE_TOKEN}]}) + b'\n')
    credentials.chmod(0o600)
    server = None
    thread = None
    observations, audit_lock = [], threading.Lock()
    phase = [0]
    original_validate = backend.validate_request

    def observed_validate(request):
        result = original_validate(request)
        # Only valid HTTP bodies enter this read-only observer. Preserve exact
        # validation behavior; do not replace authentication or service calls.
        with audit_lock:
            require(len(observations) < 10000, 'bounded HTTP observation capacity exceeded')
            observations.append({'phase': phase[0], 'op': request['op'], 'key': request.get('key'),
                                 'request_sha256': digest(request)})
        return result

    backend.validate_request = observed_validate
    try:
        server = backend.WalletBackendServer(('127.0.0.1', 0), state, start_scheduler=False,
            clock=lambda: START, device_credentials_file=credentials)
        membership = server.service.membership
        event = sign_fixture_event('fulfillment', 'fixture-multi-os-handoff-b', 'device:' + B, 1, START, 'handoff',
            {'device_ref': B, 'owner_ref': 'fixture-owner-alice', 'purchase_ref': 'fixture-multi-os-purchase-b',
             'verification_ref': 'fixture-multi-os-verified-b', 'verified_at': START, 'valid_until': START + 90 * 86400})
        membership.store.ingest(event)
        require(membership.store.event_status(event['event_id'], PUBLIC_TOKENS['fulfillment'])['status'] == 'APPLIED',
                'second public handoff was not applied')
        membership.poll_seconds = membership.retry_seconds = .05
        membership.start()
        thread = threading.Thread(target=server.serve_forever, kwargs={'poll_interval': .02})
        thread.start()
        pipe.send({'ready': True, 'pid': os.getpid(), 'port': server.server_port, 'authority_id': server.authority_id,
                   'second_handoff_sha256': digest(event)})
        while True:
            command = pipe.recv()
            operation = command['op']
            if operation == 'stop':
                break
            if operation == 'phase':
                require(command['phase'] in (1, 2, 3), 'unknown observation phase')
                phase[0] = command['phase']
                pipe.send({'phase': phase[0]})
            elif operation == 'snapshot':
                require(command['device_ref'] in (A, B), 'unknown private fixture subject')
                with membership.device_scope(command['device_ref'], 'alice'):
                    reply = server.service.dispatch({'v': 1, 'op': 'snapshot'}, peer_uid=1002)
                pipe.send(safe_wallet(reply['snapshot']))
            elif operation == 'seed':
                with membership.device_scope(A, 'alice'):
                    sale = server.service.dispatch({'v': 1, 'op': 'wallet.sale', 'key': 'multi-os-private-sale', 'amount_minor': 5000}, peer_uid=1002)
                    settlement = server.service.dispatch({'v': 1, 'op': 'wallet.settle', 'key': 'multi-os-private-settlement',
                                                          'id': sale['result']['id']}, peer_uid=1002)
                require(sale['ok'] and settlement['ok'], 'private synthetic credit failed')
                pipe.send({'simulation_only': True, 'amount_minor': 5000, 'settlement': settlement['result']['status']})
            elif operation == 'suspend-a':
                event = sign_fixture_event('fulfillment', 'fixture-multi-os-suspend-a', 'device:' + A, 2, START,
                                           'suspend', {'device_ref': A})
                receipt = membership.store.ingest(event)
                status = membership.store.event_status(event['event_id'], PUBLIC_TOKENS['fulfillment'])
                require(status['status'] == 'APPLIED', 'signed A suspension was not applied')
                pipe.send({'event_sha256': digest(event), 'receipt_sha256': digest(receipt), 'status': status['status']})
            elif operation == 'http-observations':
                with audit_lock:
                    pipe.send(list(observations))
            else:
                raise ValueError('unknown private verifier operation')
    finally:
        backend.validate_request = original_validate
        if server is not None:
            if thread is not None:
                server.shutdown()
                thread.join(10)
            server.server_close()
        pipe.close()


def stop_authority(process, pipe):
    """Every cleanup stage runs even if the prior pipe or wait fails."""
    errors = []
    try:
        if process.is_alive():
            try:
                pipe.send({'op': 'stop'})
            except (BrokenPipeError, EOFError, OSError):
                pass
        process.join(15)
    except Exception as error:
        errors.append(type(error).__name__)
    finally:
        if process.is_alive():
            try:
                process.terminate()
                process.join(5)
            except Exception as error:
                errors.append(type(error).__name__)
        if process.is_alive():
            process.kill()
            process.join(5)
        pipe.close()
    require(not process.is_alive() and process.exitcode == 0 and not errors, 'owned authority did not close normally')


def inject(rootfs, directory, ready, device):
    directory.mkdir(mode=0o700)
    token = PUBLIC_TOKENS['alice'] if device == A else backend.PUBLIC_SECOND_DEVICE_TOKEN
    config = {'schema_version': 2, 'mode': 'development-remote-authority', 'device_ref': device,
              'origin': 'https://10.0.2.2:' + str(ready['port']), 'authority_id': ready['authority_id'],
              'ca_file': common.CA_GUEST, 'token_file': common.TOKEN_GUEST}
    require(common.metadata(rootfs, '/etc/rock-wallet') is None, 'input rootfs already has a Wallet profile')
    common.debug(rootfs, 'mkdir /etc/rock-wallet', write=True)
    for field, value in (('mode', '040755'), ('uid', '0'), ('gid', '0')):
        common.debug(rootfs, 'set_inode_field /etc/rock-wallet ' + field + ' ' + value, write=True)
    entries = [('backend.json', common.CONFIG_GUEST, canonical(config) + b'\n', 0o444),
               ('PUBLIC-TOKEN.txt', common.TOKEN_GUEST, (token + '\n').encode(), 0o444),
               ('common_probe.py', COMMON, (ROOT / 'os/wallet_backend/guest_probe.py').read_bytes(), 0o755),
               ('multi_probe.py', PROBE, (ROOT / 'os/wallet_backend/guest_multi_device_probe.py').read_bytes(), 0o755),
               ('S99multi', HOOK_PATH, HOOK, 0o755)]
    records = []
    for local, destination, raw, mode in entries:
        require(common.metadata(rootfs, destination) is None, 'refuse replacement of existing injected entry')
        (directory / local).write_bytes(raw)
        require(b'Allocated inode' in common.debug(rootfs, 'write ' + local + ' ' + destination, write=True, cwd=directory),
                'test-only entry was not written')
        for field, value in (('mode', '010' + format(mode, '04o')), ('uid', '0'), ('gid', '0')):
            common.debug(rootfs, 'set_inode_field ' + destination + ' ' + field + ' ' + value, write=True)
        metadata = common.metadata(rootfs, destination)
        require(metadata == {'type': 'regular', 'mode': mode, 'uid': 0, 'gid': 0} and common.cat(rootfs, destination) == raw,
                'injected public fixture bytes/protection differ')
        records.append({'path': destination, 'sha256': hashlib.sha256(raw).hexdigest(), **metadata})
    return config, records


def closed_cache(data, phase):
    before = sha(data)
    require(common.metadata(data, '/wallet/wallet-simulator.db') is None and common.metadata(data, '/wallet/entitlement.db') is None,
            'a local financial authority unexpectedly exists')
    with tempfile.TemporaryDirectory(prefix='rock-multi-cache-ro-') as temporary:
        path = Path(temporary) / 'cache.db'
        for suffix in ('', '-wal', '-shm'):
            target = '/wallet/backend-cache/remote-cache.db' + suffix
            if common.metadata(data, target) is not None:
                Path(str(path) + suffix).write_bytes(common.cat(data, target))
        require(path.is_file(), 'stopped device cache missing')
        with closing(sqlite3.connect('file:' + str(path) + '?mode=ro', uri=True)) as db:
            db.execute('PRAGMA query_only=ON')
            db.execute('BEGIN')
            require(db.execute('PRAGMA integrity_check').fetchone()[0] == 'ok', 'closed cache integrity failed')
            tables = sorted(row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table'"))
            require(tables == ['identity', 'requests', 'snapshot'], 'unexpected closed cache table')
            fingerprint, denied = db.execute('SELECT fingerprint,access_denied FROM identity').fetchone()
            rows = db.execute('SELECT key,payload,response FROM requests ORDER BY key').fetchall()
            receipts = [{'key': key, 'request_sha256': hashlib.sha256(payload.encode()).hexdigest(),
                         'response_sha256': hashlib.sha256(response.encode()).hexdigest() if response else None}
                        for key, payload, response in rows]
            raw, synced = db.execute('SELECT payload,received_at FROM snapshot').fetchone()
            wallet = safe_wallet(json.loads(raw))
            expected = ({guest_probe.KEY_B_REGISTER, guest_probe.KEY_B_CANCEL} if phase == 2 else
                        {guest_probe.KEY_A_REGISTER, guest_probe.KEY_A_CONSENT} | ({guest_probe.KEY_DENIED_REGISTER} if phase == 3 else set()))
            require({row[0] for row in rows} == expected, 'closed request identities differ')
            require({row[0] for row in rows if row[2] is None} == ({guest_probe.KEY_DENIED_REGISTER} if phase == 3 else set()),
                    'closed unresolved request boundary differs')
            require(bool(denied) is (phase == 3), 'closed denied-access state differs')
            require((wallet['available_minor'], wallet['billed_minor'], wallet['bill_count'], wallet['auto_renew']) ==
                    (4112, 888, 1, phase != 2), 'closed retained financial snapshot differs')
    require(sha(data) == before, 'read-only closed cache observer changed userdata')
    return {'mode': 'ro', 'tables': tables, 'authority_fingerprint': fingerprint, 'access_denied': bool(denied),
            'receipts': receipts, 'snapshot_sha256': hashlib.sha256(raw.encode()).hexdigest(),
            'received_at_unix': synced, 'wallet': wallet, 'data_sha256': before}


def closed_authority(state):
    result = {}
    for name in ('wallet-simulator.db', 'entitlement.db'):
        with closing(sqlite3.connect('file:' + str(state / name) + '?mode=ro', uri=True)) as db:
            db.execute('PRAGMA query_only=ON')
            require(db.execute('PRAGMA integrity_check').fetchone()[0] == 'ok' and not db.execute('PRAGMA foreign_key_check').fetchall(),
                    'closed authority integrity/FK mismatch')
            if name == 'wallet-simulator.db':
                bills = db.execute('SELECT period,amount_minor FROM wallet_bills').fetchall()
                require(bills == [('2026-09', 888)], 'contract was charged more than once')
                balances = dict(db.execute('SELECT account,SUM(delta_minor) FROM wallet_postings GROUP BY account'))
                require(balances == {'AVAILABLE': 4112, 'PENDING_SETTLEMENT': 0, 'SALE_CLEARING': -5000, 'SERVICE_FEES': 888},
                        'single Wallet financial totals differ')
                require(db.execute('SELECT COUNT(*) FROM wallet_withdrawals').fetchone()[0] == 0, 'unexpected ATM/withdrawal operation')
                result.update(bills=bills, balances=balances)
            else:
                accounts = db.execute('SELECT account_id,device_ref,owner_ref,auto_renew FROM accounts').fetchall()
                require(len(accounts) == 1 and accounts[0][1:] == (A, 'fixture-owner-alice', 0), 'contract identity or shared cancellation differs')
                account = accounts[0][0]
                links = db.execute('SELECT device_ref,account_id FROM account_devices ORDER BY device_ref').fetchall()
                require(links == [(A, account), (B, account)], 'devices do not share one retained contract')
                require(db.execute('SELECT device_ref,state FROM devices ORDER BY device_ref').fetchall() == [(A, 'SUSPENDED'), (B, 'ACTIVE')],
                        'signed per-device suspension differs')
                require(db.execute('SELECT account_id,period,state FROM authorizations').fetchall() == [(account, '2026-09', 'PAID')],
                        'authorization contract/month/state differs')
                rows = db.execute('SELECT key,request_json,response_json FROM device_api_receipts ORDER BY key').fetchall()
                require({row[0] for row in rows} == EXPECTED_RECEIPTS and all(row[2] for row in rows), 'unexpected authority API request/receipt')
                result['receipts'] = [{'key': key, 'request_sha256': hashlib.sha256(request.encode()).hexdigest(),
                                       'response_sha256': hashlib.sha256(response.encode()).hexdigest()}
                                      for key, request, response in rows]
                result.update(account_sha256=hashlib.sha256(account.encode()).hexdigest(), account_count=1,
                              linked_devices=[A, B], states={A: 'SUSPENDED', B: 'ACTIVE'}, auto_renew=False)
    return result


def validate_proof(proof, phase, config, sources, cache):
    require(proof['phase'] == phase and proof['device_ref'] == (B if phase == 2 else A), 'guest phase/device mismatch')
    env = proof['environment']
    require(env['machine'] == 'aarch64' and env['root_uid'] == 0, 'actual ARM64 root observer missing')
    require(env['pinned_device_ref'] == config['device_ref'] and env['pinned_authority_id'] == config['authority_id'] and
            env['origin'] == config['origin'] and env['configuration_sha256'] == hashlib.sha256(canonical(config) + b'\n').hexdigest(),
            'guest did not use the exact copied profile')
    expected_sources = {TARGET_SOURCES[name]: sources[name] for name in
                        ('os/platform/service.py', 'os/wallet_backend/client.py', 'os/entitlement/protocol.py')}
    expected_sources.update({COMMON: sources['os/wallet_backend/guest_probe.py'], PROBE: sources['os/wallet_backend/guest_multi_device_probe.py']})
    require(env['source_sha256'] == expected_sources and env['ca_sha256'] == sources['os/registry/fixtures/development-ca.pem'],
            'executing guest/helper/CA source mismatch')
    require([row['uids'] for row in env['daemon_processes']] == [[1002] * 4, [1003] * 4], 'service peer ownership differs')
    require(proof['owner_processes'] and all(row['uid'] == row['gid'] == 1000 and not row['groups'] and row['expected_peer_uid'] == 1002
            for row in proof['owner_processes']), 'guest owner did not use actual UID1000 IPC')
    for key in ('receipts', 'authority_fingerprint', 'access_denied', 'snapshot_sha256'):
        require(proof['cache'][key] == cache[key], 'live/closed cache proof differs: ' + key)
    require(proof['cache']['account_sha256'] == cache['wallet']['account_sha256'], 'retained account identity differs')
    if phase == 3:
        require(proof['wallet_final'] is None and proof['revoked_owner_observation']['platform_snapshot_wallet'] is None,
                'revoked owner received a financial snapshot')
    else:
        final = proof['wallet_final']
        require((final['available_minor'], final['billed_minor'], final['bill_count'], final['auto_renew']) == (4112, 888, 1, phase == 1),
                'guest shared financial state differs')
        require(final['backend']['connected'] and not final['backend']['stale'], 'online guest used stale financial evidence')
        require(proof['registration_account_sha256'] == cache['wallet']['account_sha256'], 'registration and snapshot accounts differ')


def verify(artifacts, output):
    require(sys.platform == 'linux', 'only the authorized Linux QEMU VM may execute this harness')
    output = Path(output).absolute()
    output.mkdir(parents=True, mode=0o700, exist_ok=False)
    report_path = output / 'report.json'
    report = {'schema': 'rock-wallet-multi-device-os/1', 'status': 'RUNNING', 'started_utc': utc(),
              'scope': 'Actual sequential ARM64 A/B/revoked-A UID1000 Platform IPC and owned TLS; no GUI or ATM',
              'simulation_only': True, 'real_provider': 'NOT_RUN', 'physical_blackberry': 'NOT_RUN',
              'concurrent_devices': 'NOT_RUN; concurrency belongs to separate actual SQLite/TLS tests',
              'environment': {'system': platform.platform(), 'python': platform.python_version()},
              'boots': [], 'host_power_commands': 0, 'stage0': 'immutable input joined, direct kernel/rootfs boot used',
              'instrumentation': 'host wraps validate_request to observe valid HTTP op/key/hash only; original validation and authorization retained'}
    save(report_path, report)
    guest = observer = authority = pipe = None
    inputs, sources = {}, {}
    verified = False
    try:
        artifacts = Path(artifacts).resolve(strict=True)
        kernel, original, stage0 = (artifacts / name for name in ('Image', 'rootfs.ext4', 'stage0.cpio.gz'))
        require(all(path.is_file() for path in (kernel, original, stage0)), 'all frozen image inputs are required')
        inputs = {str(path): sha(path) for path in (kernel, original, stage0)}
        sources = {name: sha(ROOT / name) for name in SOURCE_FILES}
        report.update(input_images=inputs, source_sha256=sources)
        for name, destination in TARGET_SOURCES.items():
            require(hashlib.sha256(common.cat(original, destination)).hexdigest() == sources[name], 'frozen target/source mismatch: ' + name)
        report['target_sources_match'] = True
        private = output / 'private'
        private.mkdir(mode=0o700)
        state = private / 'authority'
        context = mp.get_context('spawn')
        pipe, child_pipe = context.Pipe()
        authority = context.Process(target=launch_authority, args=(str(state), str(output / 'authority.log'), child_pipe), name='authority-multi-os')
        authority.start()
        child_pipe.close()
        ready = receive(pipe)
        require(ready.get('ready') is True and authority.is_alive(), 'owned authority did not start')
        report['authority'] = ready
        profiles = {}
        for device, label in ((A, 'a'), (B, 'b')):
            rootfs, data = private / f'rootfs-{label}.ext4', private / f'userdata-{label}.ext4'
            with original.open('rb') as src, rootfs.open('xb') as dst:
                shutil.copyfileobj(src, dst, 1024 * 1024)
            rootfs.chmod(0o600)
            config, entries = inject(rootfs, private / ('injected-' + label), ready, device)
            with data.open('xb') as stream:
                stream.truncate(128 * 1024 * 1024)
            data.chmod(0o600)
            subprocess.run(['mkfs.ext4', '-q', '-F', '-L', 'rock-data', str(data)], check=True, capture_output=True, timeout=30)
            profiles[device] = {'rootfs': rootfs, 'data': data, 'config': config, 'rootfs_sha256': sha(rootfs)}
            report.setdefault('profiles', {})[device] = {'config': config, 'injected': entries, 'rootfs_sha256': sha(rootfs),
                                                       'initial_data_sha256': sha(data), 'private_data_exported': False}
        with tempfile.TemporaryDirectory(prefix='rock-multi-qmp-') as temporary:
            for phase, device in ((1, A), (2, B), (3, A)):
                profile = profiles[device]
                rootfs, data, config = profile['rootfs'], profile['data'], profile['config']
                rpc(pipe, {'op': 'phase', 'phase': phase})
                monitor, logfile = Path(temporary) / f'{phase}.sock', output / f'boot-{phase}.log'
                boot = {'phase': phase, 'device_ref': device, 'started_utc': utc(), 'data_before_sha256': sha(data),
                        'rootfs_sha256': sha(rootfs), 'kernel_sha256': sha(kernel), 'nic': 'QEMU usernet virtual NIC'}
                report['boots'].append(boot)
                command = ['qemu-system-aarch64', '-machine', 'virt-10.0,gic-version=3', '-accel', 'tcg', '-cpu', 'cortex-a53',
                           '-m', '1024', '-smp', '2', '-display', 'none', '-serial', 'stdio', '-monitor', 'none',
                           '-qmp', f'unix:{monitor},server=on,wait=off', '-no-reboot', '-kernel', str(kernel),
                           '-append', 'console=ttyAMA0 vt.global_cursor_default=0 fbcon=map:1 root=/dev/vda ro rootflags=noload rootwait panic=-1 rock.wallet.multi=' + str(phase),
                           '-drive', f'if=none,file={rootfs},format=raw,id=osdisk,readonly=on', '-device', 'virtio-blk-pci,drive=osdisk,addr=0x1',
                           '-drive', f'if=none,file={data},format=raw,id=userdata', '-device', 'virtio-blk-pci,drive=userdata,addr=0x2',
                           '-object', 'rng-random,filename=/dev/urandom,id=rockrng', '-device', 'virtio-rng-pci,rng=rockrng,addr=0x3',
                           '-device', 'virtio-gpu-pci,xres=720,yres=960,addr=0x4', '-device', 'virtio-keyboard-pci,addr=0x5',
                           '-device', 'virtio-tablet-pci,addr=0x6', '-netdev', 'user,id=wallet-net',
                           '-device', 'virtio-net-pci,netdev=wallet-net,addr=0x7,romfile=']
                boot['command'] = command
                with logfile.open('xb') as log:
                    guest = subprocess.Popen(command, stdin=subprocess.DEVNULL, stdout=log, stderr=subprocess.STDOUT)
                    boot['pid'] = guest.pid
                    deadline = time.monotonic() + 15
                    while not monitor.exists():
                        require(guest.poll() is None and time.monotonic() < deadline, 'QEMU monitor failed to start')
                        time.sleep(.05)
                    observer = common.QMPObserver(monitor)
                    deadline, seeded = time.monotonic() + 110, False
                    while guest.poll() is None:
                        content = logfile.read_text(errors='replace')
                        require(not common.markers(content, 'ROCK_WALLET_MULTI_GUEST_FAIL'), 'guest explicitly failed its assertions')
                        if phase == 1 and not seeded and common.markers(content, 'ROCK_WALLET_MULTI_READY_FOR_SEED'):
                            require(len(common.markers(content, 'ROCK_WALLET_MULTI_READY_FOR_SEED')) == 1, 'duplicate seed transition')
                            before_seed = rpc(pipe, {'op': 'snapshot', 'device_ref': A})
                            require(before_seed['registered'] and not before_seed['auto_renew'] and before_seed['billed_minor'] == before_seed['available_minor'] == 0,
                                    'A registration created unexpected funds/consent')
                            boot['private_host_seed'] = rpc(pipe, {'op': 'seed'})
                            seeded = True
                        require(time.monotonic() < deadline, 'guest did not shut down normally before deadline')
                        time.sleep(.1)
                    require(guest.returncode == 0 and (phase != 1 or seeded), 'QEMU or private seed transition failed')
                    boot.update(exit_code=guest.returncode, terminated_utc=utc())
                    observer.thread.join(3)
                    boot['qmp_events'] = list(observer.events)
                    require(not observer.errors, 'QMP observer failed')
                    observer.close()
                    observer = None
                guest = None
                content = logfile.read_text(errors='replace')
                require('reboot: Power down' in content and 'EXT4-fs (vdb): unmounting filesystem' in content,
                        'normal init data unmount/powerdown missing')
                require(len([e for e in boot['qmp_events'] if e['event'] == 'SHUTDOWN' and e.get('data', {}).get('guest') is True]) == 1,
                        'one guest-initiated SHUTDOWN required')
                boot['filesystem'] = common.filesystem_check(data, output, phase)
                raw = common.cat(data, f'/wallet-multi-{phase}.json')
                proof = json.loads(raw)
                passed = common.markers(content, 'ROCK_WALLET_MULTI_GUEST_PASS')
                require(proof.get('status') == 'PASS' and len(passed) == 1 and passed[0]['phase'] == phase and
                        passed[0]['boot_id'] == proof['boot_id'] and passed[0]['proof_sha256'] == hashlib.sha256(raw).hexdigest(),
                        'serial PASS and durable guest proof do not join')
                save(output / f'guest-proof-{phase}.json', proof)
                cache = closed_cache(data, phase)
                validate_proof(proof, phase, config, sources, cache)
                token = PUBLIC_TOKENS['alice'] if device == A else backend.PUBLIC_SECOND_DEVICE_TOKEN
                fingerprint = digest([config['origin'], ready['authority_id'], sources['os/registry/fixtures/development-ca.pem'],
                                      hashlib.sha256(token.encode()).hexdigest(), 'device-bound/2', device])
                require(cache['authority_fingerprint'] == fingerprint, 'cache is not pinned to its device and authority')
                boot.update(guest=proof, cache=cache, boot_id=proof['boot_id'], log_sha256=sha(logfile), data_after_sha256=sha(data))
                require(sha(rootfs) == profile['rootfs_sha256'], 'read-only copied rootfs changed')
                if phase == 1:
                    report['signed_suspend_after_a_stopped'] = {'utc': utc(), 'a_qemu_exit_code': 0, **rpc(pipe, {'op': 'suspend-a'})}
                elif phase == 2:
                    report['b_after_shared_cancel'] = rpc(pipe, {'op': 'snapshot', 'device_ref': B})
                common.checkpoint(report_path, report)
        require(len({boot['boot_id'] for boot in report['boots']}) == 3, 'three distinct OS boots required')
        require(report['boots'][2]['data_before_sha256'] == report['boots'][0]['data_after_sha256'], 'revoked A did not reuse exact retained userdata')
        first, revoked = report['boots'][0]['cache'], report['boots'][2]['cache']
        require(first['snapshot_sha256'] == revoked['snapshot_sha256'] and first['received_at_unix'] == revoked['received_at_unix'],
                'revoked A replaced its historical private snapshot')
        require([r for r in revoked['receipts'] if r['response_sha256']] == first['receipts'], 'revoked A changed old immutable receipts')
        observations = rpc(pipe, {'op': 'http-observations'})
        require(any(r['key'] == guest_probe.KEY_DENIED_REGISTER and r['phase'] == 3 for r in observations), 'fresh revoked register never reached TLS handler')
        require(not any(r['key'] == guest_probe.KEY_BLOCKED_BILL for r in observations), 'different pending-fenced bill key reached HTTP')
        report['http_intake_observations'] = observations
        stop_authority(authority, pipe)
        report['authority_exit_code'] = authority.exitcode
        authority = pipe = None
        report['closed_authority'] = closed_authority(state)
        account_hash = report['closed_authority']['account_sha256']
        require(all(boot['cache']['wallet']['account_sha256'] == account_hash for boot in report['boots']), 'A/B caches do not share exact authoritative account')
        joined = sorted(report['boots'][0]['cache']['receipts'] + report['boots'][1]['cache']['receipts'], key=lambda row: row['key'])
        require(joined == report['closed_authority']['receipts'], 'closed authority and device receipt hashes differ')
        report['checks'] = ['separate A/B rootfs profiles and caches share one contract and one actual 888-cent ledger debit',
                            'signed A suspension occurs only after its OS terminates; valid B registers, reads history and cancels shared consent',
                            'rebooted A retains exact private financial cache but cannot expose it or replay a completed receipt',
                            'fresh denied A registration stays pending; another bill key is unavailable and never reaches HTTP',
                            'three normal OS shutdowns, clean ext4, no local financial ledger, immutable source/image joins']
        verified = True
    except BaseException as error:
        report.update(status='FAIL', error=type(error).__name__ + ': ' + str(error)[:500])
    finally:
        common.checkpoint(report_path, report)
        if guest is not None and guest.poll() is None:
            report.setdefault('cleanup_errors', []).append('forced QEMU cleanup')
            try:
                guest.terminate()
                guest.wait(5)
            except Exception:
                try:
                    guest.kill()
                    guest.wait(5)
                except Exception as error:
                    report.setdefault('cleanup_errors', []).append('QEMU: ' + type(error).__name__)
        if observer is not None:
            try:
                observer.close()
            except Exception as error:
                report.setdefault('cleanup_errors', []).append('QMP: ' + type(error).__name__)
        if authority is not None:
            try:
                stop_authority(authority, pipe)
            except Exception as error:
                report.setdefault('cleanup_errors', []).append('authority: ' + type(error).__name__)
        for label, initial in (('input_images', inputs), ('source', sources)):
            try:
                observed = {name: sha(Path(name) if label == 'input_images' else ROOT / name) for name in initial}
                require(observed == initial, label + ' changed during verification')
                report[label + '_unchanged'] = True
            except Exception as error:
                report.setdefault('cleanup_errors', []).append(label + ': ' + type(error).__name__)
        report.update(status='PASS' if verified and not report.get('cleanup_errors') else 'FAIL', finished_utc=utc())
        common.checkpoint(report_path, report)
        print(json.dumps({'status': report['status'], 'report': str(report_path), 'boots': len(report['boots'])}), flush=True)
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--artifacts', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    result = verify(args.artifacts, args.output)
    raise SystemExit(0 if result['status'] == 'PASS' else 1)

"""One fresh ARM64 OS boot proving Store denials over real TLS and Linux I/O.

Requires explicit build/freeze handoff. No existing guest/userdata is reused.
The registry's malformed signature row and two short responses are private
fault fixtures, not production APIs. All owner actions run in guest uid1000
children. Native GUI, physical BlackBerry and external providers are NOT_RUN.
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
import subprocess
import sys
import tempfile
import threading
import time
import unittest

ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(ROOT / 'src'), str(ROOT / 'os')]
from blackberryrock.sdk import starter, sign_development
from blackberryrock.packages import canonical, verify_package, require_compatible, PackageError, PackageCompatibilityError
from registry.common import TRUST, decode, fsync_directory
from registry.publish import publish, author_headers
from registry.server import RegistryStore, RegistryServer, Handler
from registry.transport import HTTPSOrigin
from registry import guest_negative as probe
from wallet_backend.verify_os import (sha, save, checkpoint, debug, cat, metadata,
                                      filesystem_check, QMPObserver, markers)

FIXTURES = ROOT / 'os/registry/fixtures'
ORIGIN = 'https://127.0.0.1:9443'
TARGET_SOURCES = {
    'os/platform/service.py': '/usr/lib/rock-platform/service.py',
    'os/platform/registry_control.py': '/usr/lib/rock-platform/registry_control.py',
    'os/platform/runner_control.py': '/usr/lib/rock-platform/runner_control.py',
    'src/blackberryrock/__init__.py': '/usr/lib/rock-platform/blackberryrock/__init__.py',
    'src/blackberryrock/hub.py': '/usr/lib/rock-platform/blackberryrock/hub.py',
    'src/blackberryrock/packages.py': '/usr/lib/rock-platform/blackberryrock/packages.py',
    'src/blackberryrock/recipe_worker.py': '/usr/lib/rock-platform/blackberryrock/recipe_worker.py',
    'os/registry/client.py': '/usr/lib/rock-platform/registry/client.py',
    'os/registry/common.py': '/usr/lib/rock-platform/registry/common.py',
    'os/registry/transport.py': '/usr/lib/rock-platform/registry/transport.py',
    'os/registry/fixtures/development-ca.pem': '/usr/share/rock/development-store-ca.pem',
}
HOST_SOURCES = ('os/registry/verify_negative.py', 'os/registry/guest_negative.py',
                'os/registry/server.py', 'os/registry/publish.py', 'src/blackberryrock/sdk.py',
                'os/wallet_backend/verify_os.py')
PROBE_PATH = '/usr/libexec/rock-registry-negative-probe.py'
HOOK_PATH = '/etc/init.d/S99rock-registry-negative-verify'
HOOK = b'''#!/bin/sh
[ "${1:-start}" = start ] || exit 0
case " $(cat /proc/cmdline) " in
  *" rock.registry.negative=1 "*)
    PYTHONDONTWRITEBYTECODE=1 /usr/bin/python3 -B /usr/libexec/rock-registry-negative-probe.py >/dev/console 2>&1 &
    ;;
esac
'''


def utc():
    return datetime.now(timezone.utc).isoformat()


def require(condition, label):
    if not condition:
        raise AssertionError(label)


def build_fixtures(directory):
    recipe = [{'op': 'trim_lines'}, {'op': 'unique_lines'}, {'op': 'sort_lines'}]
    first = starter(tool_id=probe.TOOL, name='Negative boundary text kit', version='1.0.0', recipe=recipe, schema_version=2)
    second = starter(tool_id=probe.TOOL, name='Negative boundary text kit', version='2.0.0',
                     recipe=recipe + [{'op': 'prefix_lines', 'value': '- '}], schema_version=2)
    second['manifest'].update(schema_version=3, execution_targets=['device_local', 'cloud'],
                              permissions=['text.input', 'text.output', 'execution.remote'],
                              data={'input': 'user_supplied_text', 'destinations': ['cloud']},
                              remote={'consent': 'per_job_input_sha256', 'retention': 'job_receipts', 'protocol': 'rock-runner/1'})
    future = starter(tool_id=probe.FUTURE, name='Future OS fixture', min_os_version='999.0.0')
    bad = sign_development(starter(tool_id=probe.BAD, name='Invalid signature fixture', schema_version=2))
    signature = bytes.fromhex(bad['signature'])
    bad['signature'] = bytes([signature[0] ^ 1]).hex() + signature[1:].hex()
    try:
        verify_package(bad, TRUST)
    except PackageError as error:
        require(str(error) == 'signature verification failed', 'fixture must reach Ed25519 cryptographic rejection')
    else:
        raise AssertionError('invalid signature fixture unexpectedly verified')
    packages = {'first': sign_development(first), 'second': sign_development(second),
                'future': sign_development(future), 'bad': bad}
    require_compatible(packages['first']['manifest'])
    require_compatible(packages['second']['manifest'])
    verify_package(packages['future'], TRUST)
    try:
        require_compatible(packages['future']['manifest'])
    except PackageCompatibilityError as error:
        require(error.status['reasons'] == ['os_too_old'], 'future fixture must fail only minimum OS')
    else:
        raise AssertionError('future fixture unexpectedly compatible')
    records = {}
    for label, package in packages.items():
        raw = canonical(package)
        path = directory / (label + '.rock.json')
        with path.open('xb') as stream:
            stream.write(raw)
        records[label] = {'file': path.name, 'hash': sha(path), 'size': len(raw), 'manifest': package['manifest'],
                          'signature_valid': label != 'bad'}
    return records


def inject_bad_origin_row(store, package_path):
    """Private adversarial fixture: valid signed index, invalid Tool signature.

    Normal author publish stays unchanged and rejects this package. No public
    endpoint can invoke this helper and only a newly owned RegistryStore is used.
    """
    raw = Path(package_path).read_bytes()
    package = decode(raw)
    manifest = package['manifest']
    require(manifest['id'] == probe.BAD and manifest['version'] == '1.0.0', 'fixed bad fixture identity required')
    with store.mutex:
        connection = store.connection
        connection.execute('BEGIN IMMEDIATE')
        try:
            require(connection.execute('SELECT COUNT(*) FROM packages').fetchone()[0] == 0, 'fresh malicious-origin fixture required')
            connection.execute('INSERT INTO packages VALUES(?,?,?,?)',
                               (manifest['id'], manifest['version'], probe.digest(raw), raw))
            revision = connection.execute('SELECT revision FROM registry_state WHERE singleton=1').fetchone()[0] + 1
            index = store._new_index(revision)
            connection.execute('UPDATE registry_state SET revision=?,signed_index=? WHERE singleton=1', (revision, index))
            connection.execute('COMMIT')
        except BaseException:
            if connection.in_transaction:
                connection.execute('ROLLBACK')
            raise
    fsync_directory(store.root)


def registry_process(directory, fixtures, pipe):
    """Owned fixture server with a private pipe used only for ready/stop."""
    os.umask(0o077)
    directory, fixtures = Path(directory), Path(fixtures)
    store = server = None
    wire_lock = threading.Lock()
    wire = (directory / 'registry-wire.jsonl').open('xb', buffering=0)
    cut_hash = sha(directory / 'second.rock.json')
    fault = {'remaining': 2}

    def record(method, path, status, body, *, cut=False, declared=None):
        event = {'utc': utc(), 'method': method, 'path': path, 'status': status,
                 'declared_bytes': len(body) if declared is None else declared,
                 'written_bytes': len(body), 'written_sha256': probe.digest(body), 'truncated_fixture': cut,
                 'meaning': 'bytes passed to TLS write; guest structured checks establish end-to-end receipt'}
        with wire_lock:
            wire.write(canonical(event) + b'\n')
            os.fsync(wire.fileno())

    class FaultHandler(Handler):
        def respond(self, status, body):
            super().respond(status, body)
            record(self.command, self.path, status, body)

        def do_GET(self):
            with wire_lock:
                cut = self.path == f'/packages/{cut_hash}.rock.json' and fault['remaining'] > 0
                if cut:
                    fault['remaining'] -= 1
            if not cut:
                return super().do_GET()
            raw = self.server.store.package(cut_hash)
            partial = raw[:len(raw) // 2]
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(raw)))
            self.send_header('Connection', 'close')
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            self.close_connection = True
            self.wfile.write(partial)
            self.wfile.flush()
            record(self.command, self.path, 200, partial, cut=True, declared=len(raw))
            try:
                self.connection.shutdown(socket.SHUT_RDWR)
            except OSError:
                pass

    class OwnedServer(RegistryServer):
        daemon_threads = False
        block_on_close = True

    try:
        store = RegistryStore(directory / 'registry-state', fixtures / 'approved-authors.json')
        inject_bad_origin_row(store, directory / 'bad.rock.json')
        server = OwnedServer(('127.0.0.1', 9443), store, fixtures / 'development-ca.pem',
                             fixtures / 'PUBLIC-FIXTURE-KEY.pem', handler=FaultHandler)
        server.timeout = .1
        pipe.send({'ready': True, 'pid': os.getpid(), 'port': server.server_port})
        while not pipe.poll():
            server.handle_request()
        require(pipe.recv() == 'stop', 'only private stop command supported')
    finally:
        if server is not None:
            server.server_close()
        if store is not None:
            store.close()
        wire.close()
        pipe.close()


def inject(rootfs, directory):
    records = []
    for basename, target, raw in (('guest_negative.py', PROBE_PATH, (ROOT / 'os/registry/guest_negative.py').read_bytes()),
                                 ('S99rock-registry-negative-verify', HOOK_PATH, HOOK)):
        require(metadata(rootfs, target) is None, 'refuse replacement of existing image entry')
        (directory / basename).write_bytes(raw)
        result = debug(rootfs, 'write ' + basename + ' ' + target, write=True, cwd=directory)
        require(b'Allocated inode' in result, 'test entry allocation failed')
        for field, value in (('mode', '0100755'), ('uid', '0'), ('gid', '0')):
            debug(rootfs, 'set_inode_field ' + target + ' ' + field + ' ' + value, write=True)
        info = metadata(rootfs, target)
        require(info == {'type': 'regular', 'mode': 0o755, 'uid': 0, 'gid': 0} and cat(rootfs, target) == raw,
                'test injection bytes or mode differ')
        records.append({'path': target, 'sha256': probe.digest(raw), **info})
    return records


def qemu_command(kernel, rootfs, data, monitor):
    return ['qemu-system-aarch64', '-machine', 'virt-10.0,gic-version=3', '-accel', 'tcg', '-cpu', 'cortex-a53',
            '-m', '1024', '-smp', '2', '-display', 'none', '-serial', 'stdio', '-monitor', 'none',
            '-qmp', f'unix:{monitor},server=on,wait=off', '-no-reboot', '-kernel', str(kernel),
            '-append', 'console=ttyAMA0 vt.global_cursor_default=0 fbcon=map:1 root=/dev/vda ro rootflags=noload rootwait panic=-1 ' + probe.FLAG,
            '-drive', f'if=none,file={rootfs},format=raw,id=osdisk,readonly=on', '-device', 'virtio-blk-pci,drive=osdisk,addr=0x1',
            '-drive', f'if=none,file={data},format=raw,id=userdata', '-device', 'virtio-blk-pci,drive=userdata,addr=0x2',
            '-object', 'rng-random,filename=/dev/urandom,id=rockrng', '-device', 'virtio-rng-pci,rng=rockrng,addr=0x3',
            '-device', 'virtio-gpu-pci,xres=720,yres=960,addr=0x4', '-device', 'virtio-keyboard-pci,addr=0x5',
            '-device', 'virtio-tablet-pci,addr=0x6', '-netdev', 'user,id=store-net',
            '-device', 'virtio-net-pci,netdev=store-net,addr=0x7,romfile=']


def closed_database(data, proof, packages):
    before = sha(data)
    records = {}
    with tempfile.TemporaryDirectory(prefix='rock-negative-closed-') as temporary:
        directory = Path(temporary)
        for label, guest in (('hub', '/platform/hub.db'), ('remote', '/platform/remote/remote.sqlite3')):
            destination = directory / (label + '.db')
            for suffix in ('', '-wal', '-shm', '-journal'):
                if metadata(data, guest + suffix) is not None:
                    (directory / (label + '.db' + suffix)).write_bytes(cat(data, guest + suffix))
            with closing(sqlite3.connect('file:' + str(destination) + '?mode=ro', uri=True)) as db:
                db.row_factory = sqlite3.Row
                db.execute('PRAGMA query_only=ON')
                require(db.execute('PRAGMA integrity_check').fetchone()[0] == 'ok', 'closed database integrity failure')
                if label == 'remote':
                    rows = [dict(r) for r in db.execute('SELECT key,tool_id,version,package_hash,input_sha,state,submit_sha,receipt,send_claimed FROM remote_jobs ORDER BY key')]
                    require(rows == proof['database']['remote'] == proof['remote_no_submit'], 'closed remote no-submit proof differs')
                    records[label] = rows
                    continue
                jobs = [dict(r) for r in db.execute('SELECT * FROM hub_jobs WHERE tool_id=? ORDER BY created,id', (probe.TOOL,))]
                require(jobs == proof['database']['jobs'] == proof['completed_jobs'] and len(jobs) == 4, 'closed actual job identity differs')
                for index, job in enumerate(jobs):
                    version, package, output = ('1.0.0', packages['first'], probe.OUTPUT1) if index < 3 else ('2.0.0', packages['second'], probe.OUTPUT2)
                    require(job['version'] == version and job['package_hash'] == package['hash'] and job['output'] == output and
                            job['status'] == 'succeeded' and job['error'] is None and job['input_bytes'] == len(probe.TEXT.encode()),
                            'closed exact version/output/size/hash differs')
                    expected = {'id': probe.TOOL, 'text': probe.TEXT, 'target': 'device_local'}
                    require(job['request_hash'] == probe.digest(expected), 'closed job input request hash differs')
                installed = [dict(r) for r in db.execute('SELECT i.id,i.version,i.enabled,p.hash FROM hub_installed i JOIN hub_packages p USING(id,version)')]
                require(installed == proof['database']['installed'] == [{'id': probe.TOOL, 'version': '2.0.0', 'enabled': 0, 'hash': packages['second']['hash']}],
                        'closed revoked installation differs')
                package_rows = [dict(r) for r in db.execute('SELECT * FROM hub_packages ORDER BY id,version')]
                require(len(package_rows) == 2, 'bad/future package unexpectedly committed in Hub')
                for row, expected in zip(package_rows, (packages['first'], packages['second'])):
                    require(probe.digest(row['body'].encode()) == row['hash'] == expected['hash'], 'closed retained package bytes differ')
                    verify_package(json.loads(row['body']), TRUST)
                requests = {r['key']: dict(r) for r in db.execute("SELECT * FROM hub_requests WHERE key LIKE 'negative-%'")}
                successes = {}
                for event in proof['events']:
                    request = event['request']
                    if event['ok'] is True and request.get('key', '').startswith('negative-') and not request['op'].startswith('remote.'):
                        successes[request['key']] = event
                require(set(requests) == set(successes), 'closed mutation receipt set differs from successful actual owner requests')
                for key, row in requests.items():
                    event = successes[key]
                    require(row['request_hash'] == event['request_sha256'] and probe.digest(row['result'].encode()) == event['result_sha256'],
                            'closed immutable receipt does not match actual owner response')
                audit = [dict(r) for r in db.execute('SELECT * FROM hub_audit ORDER BY seq')]
                require(audit == proof['database']['audit'], 'closed audit changed after guest observation')
                run_audit = [json.loads(r['body']) for r in audit if r['event'] == 'run_approved']
                require(len(run_audit) == 4 and all(r['actual_host'] == 'rock_os_linux_namespace' and r['sent_to_cloud'] is False and
                                                 r['amount_minor'] == 0 for r in run_audit), 'actual isolated execution audit differs')
                require({r['job_id'] for r in run_audit} == {r['id'] for r in jobs}, 'execution audit jobs are not joined')
                require([r[0] for r in db.execute('SELECT subject FROM hub_revoked')] == [probe.TOOL + '@2.0.0'], 'closed revocation differs')
                records[label] = {'jobs': jobs, 'requests': proof['database']['requests'], 'audit_sha256': probe.digest(audit),
                                  'installed': installed, 'package_hashes': [r['hash'] for r in package_rows]}
        cached = []
        for label in ('first', 'second'):
            package_hash = packages[label]['hash']
            raw = cat(data, '/platform/registry-cache/packages/' + package_hash + '.rock.json')
            require(probe.digest(raw) == package_hash, 'recovered HTTP cache package differs')
            cached.append(package_hash)
        for label in ('bad', 'future'):
            require(metadata(data, '/platform/registry-cache/packages/' + packages[label]['hash'] + '.rock.json') is None,
                    'rejected signature or compatibility package persisted in HTTP cache')
        records['http_cache_hashes'] = cached
    require(sha(data) == before, 'closed observation changed source userdata')
    records['data_sha256_unchanged'] = before
    return records


def verify_wire(events, packages):
    require(all(set(e) == {'utc', 'method', 'path', 'status', 'declared_bytes', 'written_bytes', 'written_sha256',
                          'truncated_fixture', 'meaning'} for e in events), 'unexpected wire log fields')
    cuts = [e for e in events if e['truncated_fixture']]
    require(len(cuts) == 2 and all(e['path'] == f"/packages/{packages['second']['hash']}.rock.json" and e['status'] == 200 and
                                 0 < e['written_bytes'] < e['declared_bytes'] == packages['second']['size'] for e in cuts),
            'real TLS cut fixture did not fire exactly twice')
    for label in ('first', 'second', 'bad'):
        require(any(e['method'] == 'GET' and e['status'] == 200 and e['path'] == f"/packages/{packages[label]['hash']}.rock.json" and
                    e['declared_bytes'] == e['written_bytes'] == packages[label]['size'] and e['written_sha256'] == packages[label]['hash']
                    for e in events), 'required complete TLS package body was not served')
    require(any(e['status'] == 404 and e['path'] == f"/packages/{packages['second']['hash']}.rock.json" and
                e['written_sha256'] == probe.digest(b'{"error":"not found"}') for e in events), 'production revoked GET denial not observed')
    require(not any(e['method'] == 'GET' and e['path'] == f"/packages/{packages['future']['hash']}.rock.json" for e in events),
            'future OS package was downloaded despite required pre-download compatibility admission')
    return {'truncated_responses': 2, 'complete_signature_fixture': True, 'complete_v1_v2': True, 'revoked_get_404': True,
            'future_package_get_count': 0, 'future_minimum': 'rejected from authenticated signed index before download', 'events': events}


def stop_registry(registry, pipe, report):
    """A failed cooperative notification must never skip owned child cleanup."""
    try:
        if registry.is_alive():
            pipe.send('stop')
    except BaseException as error:
        report['cleanup_errors'].append('registry stop notification: ' + type(error).__name__)
    try:
        registry.join(15)
    except BaseException as error:
        report['cleanup_errors'].append('registry join: ' + type(error).__name__)
    try:
        if registry.is_alive():
            report['cleanup_errors'].append('registry did not stop normally')
            registry.terminate()
            registry.join(5)
    except BaseException as error:
        report['cleanup_errors'].append('registry terminate: ' + type(error).__name__)
    try:
        if registry.is_alive():
            registry.kill()
            registry.join(5)
    except BaseException as error:
        report['cleanup_errors'].append('registry kill: ' + type(error).__name__)
    report['registry_exit'] = registry.exitcode


def verify_completed_wire(report, output):
    if report['status'] in ('PASS', 'PASS_SCOPED'):
        path = output / 'registry-wire.jsonl'
        events = [json.loads(line) for line in path.read_text().splitlines()]
        report['wire'] = verify_wire(events, report['packages'])
        report['wire_log_sha256'] = sha(path)


def run(artifacts, output, scope='local-full'):
    require(sys.platform == 'linux' and platform.machine() == 'aarch64', 'authorized ARM64 Linux build VM required')
    require(not output.exists(), 'output must be a new disposable directory')
    output.mkdir(mode=0o700, parents=True)
    report_path = output / 'report.json'
    report = {'schema_version': 1, 'status': 'RUNNING', 'started_utc': utc(),
              'scope': 'one actual ARM64 OS boot; real UID1000 Platform IPC and owned TLS origin; API-level, GUI NOT_RUN',
              'blackberry': 'NOT_RUN', 'provider': 'NOT_RUN', 'production_keys': False, 'remote_execution': 'NOT_RUN',
              'fault_fixtures': ['private malformed-signature origin row', 'two half TLS response bodies', 'fixed 64KiB guest tmpfs ENOSPC'],
              'reversible_publication_pause': 'NOT_IMPLEMENTED; permanent signed revocation tested',
              'cleanup_errors': [], 'qmp_host_power_commands': 0}
    guest = registry = monitor = pipe = logfile = None
    kernel, source_root = artifacts / 'Image', artifacts / 'rootfs.ext4'
    images = {p.name: sha(p) for p in (kernel, source_root, artifacts / 'stage0.cpio.gz')}
    source_files = sorted(set(TARGET_SOURCES) | set(HOST_SOURCES))
    sources = {name: sha(ROOT / name) for name in source_files}
    report.update(images_before=images, source_before=sources, repository_head=None)
    try:
        result = subprocess.run(['git', '-C', str(ROOT), 'rev-parse', 'HEAD'], capture_output=True, timeout=5)
        if result.returncode == 0:
            report['repository_head'] = result.stdout.decode().strip()
    except (OSError, subprocess.TimeoutExpired):
        pass
    try:
        require(scope in ('local-full','game-isolation'),'explicit supported verification scope required')
        game_gate = None
        if scope == 'game-isolation':
            sys.path.insert(0,str(ROOT/'os/desktop'))
            from game_gate_observer import Gate
            game_gate = Gate(artifacts,output,source_files,{'boots':1,'per_boot_seconds':360,'denial_cases':10})
            report.update(verification_scope=scope,wallet='NOT_RUN',game_scope_plan_sha256=game_gate.plan_sha)
        for source, target in TARGET_SOURCES.items():
            require(probe.digest(cat(source_root, target)) == sources[source], 'source differs from actual input rootfs: ' + source)
        report['embedded_sources_match'] = True
        report['packages'] = packages = build_fixtures(output)
        with socket.socket() as test_socket:
            test_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            test_socket.bind(('127.0.0.1', 9443)); test_socket.listen(1)
        context = mp.get_context('spawn')
        pipe, child_pipe = context.Pipe()
        registry = context.Process(target=registry_process, args=(str(output), str(FIXTURES), child_pipe))
        registry.start(); child_pipe.close()
        require(pipe.poll(15), 'owned TLS registry did not become ready')
        report['registry'] = pipe.recv()
        require(report['registry']['ready'] and report['registry']['port'] == 9443, 'registry readiness differs')
        report['publish_receipts'] = [publish(ORIGIN, FIXTURES / 'development-ca.pem', FIXTURES / 'PUBLIC-AUTHOR-TOKEN.txt',
                                            output / packages[label]['file'], 'negative-publish-' + label)
                                      for label in ('first', 'second', 'future')]
        rootfs = output / 'test-rootfs.ext4'
        shutil.copyfile(source_root, rootfs)
        report['injected_entries'] = inject(rootfs, output)
        report['test_rootfs_sha256'] = sha(rootfs)
        data = output / 'userdata.ext4'
        with data.open('xb') as stream:
            stream.truncate(128 * 1024 * 1024)
        subprocess.run(['mkfs.ext4', '-q', '-F', '-L', 'rock-data', str(data)], check=True, capture_output=True, timeout=15)
        report['fresh_data_sha256'] = sha(data)
        command = qemu_command(kernel, rootfs, data, output / 'qmp.sock')
        if game_gate:command[command.index('-append')+1] += ' rock.registry.scope=game-isolation'
        report['qemu_command'] = command
        logfile = (output / 'boot.log').open('xb')
        guest = subprocess.Popen(command, stdin=subprocess.DEVNULL, stdout=logfile, stderr=subprocess.STDOUT)
        report['guest_pid'] = guest.pid
        deadline, revoked = time.monotonic() + 360, False
        print('RUNNING actual Store negative boot ' + str(output), flush=True)
        while guest.poll() is None:
            if monitor is None and (output / 'qmp.sock').exists():
                monitor = QMPObserver(output / 'qmp.sock')
            content = (output / 'boot.log').read_text(errors='replace')
            if not revoked and markers(content, 'ROCK_NEGATIVE_REVOKE_READY'):
                body = canonical({'subject': probe.TOOL + '@2.0.0'})
                transport = HTTPSOrigin(ORIGIN, FIXTURES / 'development-ca.pem', attempts=1)
                raw = transport.request('POST', '/v1/revoke', 4096, body=body,
                                        headers=author_headers(FIXTURES / 'PUBLIC-AUTHOR-TOKEN.txt', 'negative-revoke-v2'))
                report['revoke_receipt'] = decode(raw)
                report['revoke_after_marker'] = markers(content, 'ROCK_NEGATIVE_REVOKE_READY')
                revoked = True
            require(time.monotonic() < deadline, 'actual negative guest exceeded 360 seconds')
            time.sleep(.15)
        logfile.close(); logfile = None
        report['qemu_exit'] = guest.returncode
        require(guest.returncode == 0, 'actual guest QEMU failed')
        content = (output / 'boot.log').read_text(errors='replace')
        report['boot_log_sha256'] = sha(output / 'boot.log')
        terminal = markers(content, 'ROCK_NEGATIVE_GUEST_PASS')
        failed = markers(content, 'ROCK_NEGATIVE_GUEST_FAIL')
        # Always collect a durable failure proof if the guest shut down.
        raw = cat(data, '/registry-negative-proof.json')
        if raw:
            (output / 'guest-proof.json').write_bytes(raw)
            report['guest_proof_sha256'] = probe.digest(raw)
        proof = decode(raw)
        require(len(terminal) == 1 and not failed and proof['status'] == 'PASS' and terminal[0] ==
                {'boot_id': proof['boot_id'], 'proof_sha256': probe.digest(raw)}, 'actual guest proof failed or serial/disk differs')
        require(revoked and len(report['revoke_after_marker']) == 1 and
                report['revoke_after_marker'][0]['boot_id'] == proof['boot_id'], 'host revocation was not joined to this boot')
        require(monitor is not None and not monitor.errors, 'QMP event observer failed')
        report['qmp_events'] = monitor.events
        shutdown = [e for e in monitor.events if e['event'] == 'SHUTDOWN']
        require(len(shutdown) == 1 and shutdown[0]['data'].get('guest') is True and
                'reboot: Power down' in content and re.search(r'EXT4-fs \(vdb\): unmounting filesystem', content),
                'normal guest shutdown or data unmount missing')
        report['filesystem'] = filesystem_check(data, output, 'negative')
        report['closed_database'] = closed_database(data, proof, packages)
        if game_gate:game_gate.proof(proof)
        else:require(proof['wallet_initial_sha256'] == proof['wallet_final_sha256'], 'Wallet changed')
        expected_checks = {'ed25519_signature', 'minimum_OS', 'interrupted_download', 'actual_cache_ENOSPC',
                           'old_hash_approval', 'unapproved_update_run', 'per_input_consent_missing', 'per_input_consent_mismatch',
                           'revoked_run', 'revoked_approval'}
        require({c['case'] for c in proof['checks']} == expected_checks and len(proof['checks']) == len(expected_checks),
                'required actual denial evidence missing')
        report['checks'] = proof['checks']
        report['wallet_unchanged_sha256'] = proof['wallet_final_sha256']
        require(sha(rootfs) == report['test_rootfs_sha256'], 'injected readonly OS image changed')
        require({p.name: sha(p) for p in (kernel, source_root, artifacts / 'stage0.cpio.gz')} == images, 'input freeze images changed')
        require({name: sha(ROOT / name) for name in source_files} == sources, 'source changed during actual verification')
        report['input_images_and_sources_unchanged'] = True
        if game_gate:report['game_authority_retention'] = game_gate.finish()
        report['status'] = 'PASS_SCOPED' if game_gate else 'PASS'
    except BaseException as error:
        report.update(status='FAIL', error_type=type(error).__name__)
        if isinstance(error, AssertionError):
            report['error_label'] = str(error)[:240]
    finally:
        # Persistence may fail (including fsync after rename). Every cleanup is
        # independent; final adoption requires exit0 + stdout PASS + report hash.
        checkpoint(report_path, report)
        if guest is not None and guest.poll() is None:
            report['status'] = 'FAIL'
            report['forced_owned_guest_cleanup'] = True
            try:
                guest.terminate()
                try:
                    guest.wait(8)
                except subprocess.TimeoutExpired:
                    guest.kill(); guest.wait(5)
            except BaseException as error:
                report['cleanup_errors'].append('QEMU: ' + type(error).__name__)
        if monitor is not None:
            try:
                monitor.close()
            except BaseException as error:
                report['cleanup_errors'].append('QMP: ' + type(error).__name__)
        if logfile is not None:
            try:
                logfile.close()
            except BaseException as error:
                report['cleanup_errors'].append('log: ' + type(error).__name__)
        if registry is not None:
            try:
                stop_registry(registry, pipe, report)
                require(registry.exitcode == 0, 'registry process failed')
                verify_completed_wire(report, output)
            except BaseException as error:
                report['cleanup_errors'].append('registry or wire: ' + type(error).__name__)
            finally:
                if pipe is not None:
                    try:
                        pipe.close()
                    except BaseException as error:
                        report['cleanup_errors'].append('registry pipe close: ' + type(error).__name__)
        if report['cleanup_errors']:
            report['status'] = 'FAIL'
        report['finished_utc'] = utc()
        persisted = checkpoint(report_path, report)
    success = persisted and report['status'] == ('PASS_SCOPED' if scope == 'game-isolation' else 'PASS')
    print(('PASS' if success else 'FAIL') + ' actual Store negative OS; report=' + str(report_path) +
          (' sha256=' + sha(report_path) if report_path.exists() else ''), flush=True)
    return 0 if success else 1


class GuardTests(unittest.TestCase):
    def test_flag_requires_one_exact_value(self):
        probe.strict_flag('quiet ' + probe.FLAG + ' ro')
        for flag in ('', 'rock.registry.negative=0', probe.FLAG + ' ' + probe.FLAG,
                     'rock.registry.negative=01', probe.FLAG + ' rock.registry.negative=2'):
            with self.assertRaises(probe.CheckFailed):
                probe.strict_flag(flag)

    def test_denial_never_accepts_transport_failure(self):
        instance = object.__new__(probe.Probe); instance.checks = []
        instance.owner = lambda _: None
        with self.assertRaises(probe.CheckFailed):
            instance.deny('test', {'v': 1, 'op': 'install'}, 'rejected', {'signature verification failed'})

    def test_denial_requires_precise_crypto_reason(self):
        instance = object.__new__(probe.Probe); instance.checks = []
        instance.owner = lambda _: {'ok': False, 'code': 'rejected', 'error': 'package size or SHA-256 mismatch'}
        with self.assertRaises(probe.CheckFailed):
            instance.deny('test', {'v': 1, 'op': 'install'}, 'rejected', {'signature verification failed'})
        instance.owner = lambda _: {'ok': False, 'code': 'rejected', 'error': 'signature verification failed'}
        instance.deny('test', {'v': 1, 'op': 'install'}, 'rejected', {'signature verification failed'})
        self.assertTrue(instance.checks[0]['transport_ok'])

    def test_positive_retry_uses_identical_request(self):
        instance = object.__new__(probe.Probe); calls = []
        request = {'v': 1, 'op': 'update', 'key': 'negative-fixed'}
        def owner(value):
            calls.append(value)
            return None if len(calls) == 1 else {'ok': True, 'result': {}}
        instance.owner = owner
        instance.positive(request)
        self.assertEqual(calls, [request, request])
        self.assertIs(calls[0], calls[1])

    def test_fixture_real_signature_future_and_legacy_permissions(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            packages = build_fixtures(directory)
            self.assertFalse(packages['bad']['signature_valid'])
            self.assertEqual(packages['first']['manifest']['schema_version'], 2)
            self.assertEqual(packages['second']['manifest']['schema_version'], 3)
            self.assertNotIn('compatibility', packages['second']['manifest'])
            self.assertEqual(packages['future']['manifest']['schema_version'], 4)
            for package in packages.values():
                self.assertEqual(sha(directory / package['file']), package['hash'])
                self.assertEqual((directory / package['file']).stat().st_size, package['size'])

    def test_bad_origin_private_fixture_preserves_correct_index_hash(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            packages = build_fixtures(directory)
            store = RegistryStore(directory / 'registry', FIXTURES / 'approved-authors.json')
            try:
                inject_bad_origin_row(store, directory / 'bad.rock.json')
                index = decode(store.index())
                self.assertEqual(index['packages'][0]['hash'], packages['bad']['hash'])
                self.assertEqual(index['packages'][0]['size'], packages['bad']['size'])
                self.assertEqual(probe.digest(store.package(packages['bad']['hash'])), packages['bad']['hash'])
                with self.assertRaises(PackageError):
                    store.publish('development-author', 'normal-publish-must-reject', {'package': decode((directory / 'bad.rock.json').read_bytes())})
            finally:
                store.close()

    def test_wire_cuts_alone_are_not_success(self):
        with self.assertRaises(AssertionError):
            verify_wire([], {})

    def test_future_get_disproves_pre_download_admission(self):
        packages = {name: {'hash': str(index) * 64, 'size': 8}
                    for index, name in enumerate(('first', 'second', 'bad', 'future'), 1)}
        def event(label, status=200, cut=False):
            return {'utc': 'fixture', 'method': 'GET', 'path': '/packages/' + packages[label]['hash'] + '.rock.json',
                    'status': status, 'declared_bytes': 8, 'written_bytes': 4 if cut else 8,
                    'written_sha256': packages[label]['hash'] if status == 200 else probe.digest(b'{"error":"not found"}'),
                    'truncated_fixture': cut, 'meaning': 'guard fixture'}
        events = [event('second', cut=True), event('second', cut=True)]
        events += [event(label) for label in ('first', 'second', 'bad')]
        events.append(event('second', status=404))
        self.assertEqual(verify_wire(events, packages)['future_package_get_count'], 0)
        with self.assertRaisesRegex(AssertionError, 'future OS package was downloaded'):
            verify_wire(events + [event('future')], packages)
        with tempfile.TemporaryDirectory() as temporary:
            output = Path(temporary); path = output / 'registry-wire.jsonl'
            for status in ('PASS', 'PASS_SCOPED'):
                with self.subTest(status=status):
                    report = {'status': status, 'packages': packages}
                    path.write_text(''.join(json.dumps(item)+'\n' for item in events))
                    verify_completed_wire(report, output)
                    self.assertEqual(report['wire']['future_package_get_count'], 0)
                    self.assertEqual(report['wire_log_sha256'], sha(path))
                    path.write_text(''.join(json.dumps(item)+'\n' for item in events+[event('future')]))
                    with self.assertRaisesRegex(AssertionError, 'future OS package was downloaded'):
                        verify_completed_wire(report, output)

    def test_broken_stop_pipe_still_reaps_owned_registry(self):
        class Pipe:
            def send(self, _):
                raise BrokenPipeError('fixed test fixture')
        class Process:
            alive, exitcode = True, None
            calls = []
            def is_alive(self):
                return self.alive
            def join(self, seconds):
                self.calls.append(('join', seconds))
            def terminate(self):
                self.calls.append(('terminate',)); self.alive = False; self.exitcode = -15
            def kill(self):
                self.calls.append(('kill',)); self.alive = False; self.exitcode = -9
        process, report = Process(), {'cleanup_errors': []}
        stop_registry(process, Pipe(), report)
        self.assertFalse(process.is_alive())
        self.assertEqual(process.calls, [('join', 15), ('terminate',), ('join', 5)])
        self.assertEqual(report['registry_exit'], -15)
        self.assertTrue(any('BrokenPipeError' in item for item in report['cleanup_errors']))

    def test_qemu_scope_is_fresh_readonly_and_no_force_shutdown(self):
        command = qemu_command(Path('/test/Image'), Path('/new/root'), Path('/new/data'), Path('/new/qmp'))
        self.assertIn('virtio-net-pci,netdev=store-net,addr=0x7,romfile=', command)
        self.assertIn(probe.FLAG, command[command.index('-append') + 1])
        self.assertIn('ro rootflags=noload', command[command.index('-append') + 1])
        self.assertIn('if=none,file=/new/root,format=raw,id=osdisk,readonly=on', command)
        self.assertNotIn('-f', command)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--artifacts', type=Path)
    parser.add_argument('--output', type=Path)
    parser.add_argument('--scope', choices=('local-full','game-isolation'), default='local-full')
    parser.add_argument('--self-test', action='store_true', help='host-only guards; never starts QEMU or binds a socket')
    args = parser.parse_args()
    if args.self_test:
        result = unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(GuardTests))
        return 0 if result.wasSuccessful() else 1
    parser.error('--artifacts and --output are required') if args.artifacts is None or args.output is None else None
    return run(args.artifacts.resolve(), args.output.resolve(),args.scope)


if __name__ == '__main__':
    sys.exit(main())

#!/usr/bin/env python3
"""Real native GUI -> owned local TLS store -> independent signed Tool.

Uses the repository's explicitly public development signing/TLS fixtures and
SDK through verify-store.py. Never publishes outside its own loopback server.
The guest observer only reads state; all guest mutations come from evdev input.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import importlib.util
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import time

REPO = Path(__file__).resolve().parents[2]


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


native = load('rock_native_harness', Path(__file__).with_name('verify-native.py'))
remote = load('rock_remote_observer', Path(__file__).with_name('guest-ui-remote-evidence.py'))


def validate_proof(proof):
    native.validate_proof(proof, contract=remote.CONTRACT, store_network=True, schema='rock-native-remote-ui-proof/1')
    require = remote.base.require
    require(proof['remote_absent_initially'] is True and remote.CONTRACT['id'] not in proof['initial_catalog_ids'] and
            remote.CONTRACT['id'] not in proof['immutable_embedded_tool_ids'], 'downloaded Tool was already in the initial OS')
    require(proof['registry_initial']['configured'] is True and proof['registry_initial']['count'] == 0, 'registry did not start fresh')
    require(proof['registry_final']['status'] == 'ready' and proof['registry_final']['fresh'] is True and proof['registry_final']['count'] >= 1,
            'signed registry did not finish in a valid state')
    refresh = proof['registry_refresh_receipt']
    remote.split_receipts([{'key': refresh['key'], 'request_hash': refresh['request_hash'],
                            'result': remote.base.canonical(refresh['result']).decode()}], [refresh['queue']])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--artifacts', type=Path, required=True, help='existing frozen Image and rootfs.ext4 directory')
    args = parser.parse_args()
    if sys.platform != 'linux':
        parser.error('run on the Linux QEMU build host')
    artifacts = args.artifacts.resolve(strict=True)
    kernel, rootfs = artifacts / 'Image', artifacts / 'rootfs.ext4'
    if not kernel.is_file() or not rootfs.is_file():
        parser.error('the artifact directory must contain Image and rootfs.ext4')
    store = load('rock_owned_store_helpers', REPO / 'os/verify-store.py')
    evidence = Path(tempfile.mkdtemp(prefix='remote-ui-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '-', dir=artifacts))
    data, log = evidence / 'userdata.ext4', evidence / 'boot.log'
    before = {path.name: native.digest_file(path) for path in (kernel, rootfs)}
    report = {'schema': 'rock-native-remote-ui-harness/1', 'status': 'RUNNING', 'started_utc': datetime.now(timezone.utc).isoformat(),
              'scope': 'actual QEMU ARM64 framebuffer/evdev GUI and owned loopback TLS registry',
              'blackberry': 'NOT_RUN', 'wallet': 'SIMULATOR_ONLY', 'public_development_fixtures': True,
              'image_sha256_before': before, 'input_events': [], 'screenshots': []}
    print('Native signed-store GUI evidence: ' + str(evidence), flush=True)
    server, guest, monitor = None, None, None
    fixtures = REPO / 'os/registry/fixtures'
    ca, origin = fixtures / 'development-ca.pem', 'https://127.0.0.1:9443'
    server_output = (evidence / 'registry.log').open('wb')
    try:
        # Never reuse or terminate another test's registry process.
        with socket.socket() as port:
            port.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            port.bind(('127.0.0.1', 9443))
            port.listen(1)
        server_command = [sys.executable, '-B', '-m', 'registry.server', '--state', str(evidence / 'server-state'),
                          '--authors', str(fixtures / 'approved-authors.json'), '--cert', str(ca),
                          '--fixture-key', str(fixtures / 'PUBLIC-FIXTURE-KEY.pem')]
        environment = dict(os.environ, PYTHONPATH=str(REPO / 'src') + ':' + str(REPO / 'os'))
        server = subprocess.Popen(server_command, env=environment, stdin=subprocess.DEVNULL, stdout=server_output, stderr=subprocess.STDOUT)
        report['registry_command'] = server_command
        transport = store.HTTPSOrigin(origin, ca, timeout=1, attempts=1)
        deadline = time.monotonic() + 10
        while True:
            if server.poll() is not None:
                raise RuntimeError('owned registry stopped before readiness')
            try:
                transport.request('GET', '/index.json', 512 * 1024)
                break
            except ValueError:
                if time.monotonic() >= deadline:
                    raise
                time.sleep(0.1)
        package = store.build_package(evidence, remote.CONTRACT['version'])
        package_hash = store.sha(package)
        report['sdk_package'] = {'path': package.name, 'sha256': package_hash, 'tool': remote.CONTRACT['id'], 'version': remote.CONTRACT['version']}
        report['publish_receipt'] = store.publish(origin, ca, fixtures / 'PUBLIC-AUTHOR-TOKEN.txt', package, 'gui-sdk-' + package_hash)
        with data.open('xb') as stream:
            stream.truncate(128 * 1024 * 1024)
        subprocess.run(['mkfs.ext4', '-q', '-F', '-L', 'rock-data', str(data)], check=True, timeout=30)
        with tempfile.TemporaryDirectory(prefix='rock-remote-qmp-') as temporary:
            qmp = Path(temporary) / 'qmp.sock'
            command = ['qemu-system-aarch64', '-machine', 'virt-10.0,gic-version=3', '-accel', 'tcg', '-cpu', 'cortex-a53',
                       '-m', '1024', '-smp', '2', '-display', 'none', '-serial', 'stdio', '-monitor', 'none',
                       '-qmp', f'unix:{qmp},server=on,wait=off', '-no-reboot', '-kernel', str(kernel), '-append',
                       'console=ttyAMA0 vt.global_cursor_default=0 root=/dev/vda ro rootflags=noload rootwait panic=-1 rock.ui.remote.verify=1',
                       '-drive', f'if=none,file={rootfs},format=raw,id=osdisk,readonly=on', '-device', 'virtio-blk-pci,drive=osdisk,addr=0x1',
                       '-drive', f'if=none,file={data},format=raw,id=userdata', '-device', 'virtio-blk-pci,drive=userdata,addr=0x2',
                       '-object', 'rng-random,filename=/dev/urandom,id=rockrng', '-device', 'virtio-rng-pci,rng=rockrng,addr=0x3',
                       '-device', 'virtio-gpu-pci,xres=720,yres=960,addr=0x4', '-device', 'virtio-keyboard-pci,addr=0x5',
                       '-device', 'virtio-tablet-pci,addr=0x6', '-netdev', 'user,id=store-net',
                       '-device', 'virtio-net-pci,netdev=store-net,id=store-nic,addr=0x7,romfile=']
            report['command'] = command
            with log.open('wb') as output:
                guest = subprocess.Popen(command, stdin=subprocess.DEVNULL, stdout=output, stderr=subprocess.STDOUT)
                deadline = time.monotonic() + 10
                while not qmp.exists():
                    if guest.poll() is not None or time.monotonic() >= deadline:
                        raise RuntimeError('QEMU monitor did not start')
                    time.sleep(0.1)
                monitor = native.Monitor(qmp)
                actions = native.NativeInput(monitor, evidence, report)
                def wait_marker(marker, seconds=25):
                    until = time.monotonic() + seconds
                    while time.monotonic() < until:
                        content = log.read_text(errors='replace').replace('\r', '')
                        if 'ROCK_UI_REMOTE_GUEST_FAIL' in content:
                            raise AssertionError('remote GUI guest observer failed; inspect boot.log')
                        if any(line == marker or line.startswith(marker + ' ') for line in content.splitlines()):
                            return
                        if guest.poll() is not None:
                            raise RuntimeError('QEMU stopped before ' + marker)
                        time.sleep(0.2)
                    raise TimeoutError('guest did not report ' + marker)

                wait_marker('ROCK_UI_REMOTE_OBSERVER_READY', 180)
                time.sleep(3)
                actions.capture('00-initial-embedded-hub')
                actions.click(250, 247)
                actions.keys(['ctrl', 'a'])
                actions.type('remote-text-kit')
                time.sleep(1.2)
                actions.capture('01-search-before-download')
                actions.click(608, 184)
                wait_marker('ROCK_UI_REMOTE_CATALOG_OBSERVED')
                actions.click(114, 913)
                time.sleep(3)
                actions.capture('02-discovered-signed-tool')
                actions.click(360, 363)
                time.sleep(1.2)
                actions.capture('03-remote-tool-details')
                # On detail: state refresh, back, then the primary install action.
                # Real keyboard focus avoids assuming the description's line count.
                for _ in range(3):
                    actions.keys(['tab'])
                actions.keys(['ret'])
                wait_marker('ROCK_UI_REMOTE_INSTALLED_OBSERVED')
                time.sleep(3)
                actions.capture('04-downloaded-permission-review')
                actions.keys(['ret'])
                wait_marker('ROCK_UI_REMOTE_APPROVED_OBSERVED')
                time.sleep(3)
                actions.capture('05-approved')
                actions.keys(['ret'])
                time.sleep(1.2)
                actions.capture('06-remote-editor')
                actions.click(250, 425)
                actions.keys(['ctrl', 'a'])
                actions.type(remote.CONTRACT['input'] + 'x')
                actions.keys(['backspace'])
                time.sleep(1.2)
                actions.capture('07-real-keyboard-input')
                actions.keys(['ctrl', 'ret'])
                wait_marker('ROCK_UI_REMOTE_RUN_OBSERVED')
                wait_marker('ROCK_UI_REMOTE_JOB_OBSERVED')
                time.sleep(3)
                actions.capture('08-real-remote-tool-result')
                actions.click(442, 913)
                time.sleep(1.2)
                actions.capture('09-real-history')
                actions.click(606, 913)
                time.sleep(1.2)
                actions.capture('10-wallet-unchanged')
                monitor.close()
                monitor = None
                guest.wait(timeout=60)
                report['exit_code'] = guest.returncode
                if guest.returncode != 0:
                    raise RuntimeError('QEMU exited abnormally')
            prefix = 'ROCK_UI_REMOTE_GUEST_PROOF '
            proofs = [json.loads(line[len(prefix):]) for line in log.read_text(errors='replace').replace('\r', '').splitlines() if line.startswith(prefix)]
            if len(proofs) != 1:
                raise AssertionError('exactly one remote GUI serial proof is required')
            proof = proofs[0]
            validate_proof(proof)
            if proof['tool']['package_hash'] != package_hash:
                raise AssertionError('executed Tool differs from the independently SDK-built package')
            disk = subprocess.run(['debugfs', '-R', 'cat /ui-remote-proof.json', str(data)], capture_output=True, check=True, timeout=20)
            if json.loads(disk.stdout) != proof:
                raise AssertionError('durable remote GUI proof differs from serial')
            (evidence / 'ui-remote-proof.json').write_text(json.dumps(proof, ensure_ascii=False, indent=2) + '\n')
            report.update(durable_guest_proof_matches_serial=True, guest_proof_sha256=remote.base.digest(proof))
            if {path.name: native.digest_file(path) for path in (kernel, rootfs)} != before:
                raise AssertionError('immutable OS images changed while installing the independent Tool')
            if len(report['screenshots']) != 11:
                raise AssertionError('required native GUI screenshots are missing')
            report['status'] = 'PASS'
            print('PASS actual native GUI catalog refresh, local search, remote signed Tool download, approval, sandbox execution and unchanged Wallet', flush=True)
            print(str(evidence), flush=True)
    except BaseException as error:
        report.update(status='FAIL', error=type(error).__name__ + ': ' + str(error))
        if monitor and guest is not None and guest.poll() is None:
            try:
                monitor.command('screendump', {'filename': str(evidence / 'failure-display.png'), 'format': 'png'})
            except (OSError, ValueError, RuntimeError):
                pass
        raise
    finally:
        if monitor:
            monitor.close()
        store.stop(guest)
        store.stop(server)
        server_output.close()
        report['image_sha256_after'] = {path.name: native.digest_file(path) for path in (kernel, rootfs)}
        report['finished_utc'] = datetime.now(timezone.utc).isoformat()
        (evidence / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')


if __name__ == '__main__':
    main()

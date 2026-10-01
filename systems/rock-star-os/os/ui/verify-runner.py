#!/usr/bin/env python3
"""Actual native GUI -> owned registry -> explicit consent -> isolated TLS runner."""
import argparse
from contextlib import closing
from datetime import datetime, timezone
import importlib.util
import hashlib
import json
import os
from pathlib import Path
import socket
import sqlite3
import subprocess
import sys
import tempfile
import threading
import time

REPO = Path(__file__).resolve().parents[2]


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


owned = load('rock_ui_owned_remote_services', REPO / 'os/verify-remote.py')
observer = load('rock_ui_runner_observer', Path(__file__).with_name('guest-ui-runner-evidence.py'))
native = load('rock_ui_runner_native_input', Path(__file__).with_name('verify-native.py'))
power = load('rock_ui_runner_read_monitor', Path(__file__).with_name('verify-power.py'))


def cleanup_owned(monitor, guest, server, thread, runner, registry, server_log):
    errors = []
    def attempt(name, action):
        try:
            action()
        except BaseException as error:
            errors.append({'resource': name, 'error': type(error).__name__ + ': ' + str(error)})
    if monitor: attempt('monitor', monitor.close)
    attempt('guest', lambda: owned.stop(guest))
    if server:
        if thread and thread.is_alive(): attempt('runner-server-shutdown', server.shutdown)
        attempt('runner-server-close', server.server_close)
    if thread: attempt('runner-server-thread', lambda: thread.join(timeout=5))
    if runner: attempt('runner-store', runner.close)
    attempt('registry', lambda: owned.stop(registry))
    attempt('registry-log', server_log.close)
    return errors


def validate_execution(rows, calls, dropped, requests, proof, package):
    require = observer.base.require
    require(len(rows) == 1 and rows[0]['key'] == proof['remote_rows'][1]['key'] and rows[0]['state'] == 'succeeded',
            'owned runner must contain exactly one actual job with the approved GUI key')
    row = rows[0]
    expected = {'v': 1, 'op': 'submit', 'endpoint_id': observer.ENDPOINT, 'key': row['key'],
                'package': package, 'text': observer.INPUT, 'consent': observer.expected_consent(row['key'], observer.base.digest(package))}
    expected_hash = observer.base.digest(expected)
    require(row['request_json'] is None and row['request_sha256'] == expected_hash,
            'remote accepted request differs from exact preview or retained input was not erased')
    require(len(calls) == 1 and calls[0]['status'] == 'succeeded' and len(dropped) == 1 and
            dropped[0]['key'] == row['key'] and dropped[0]['request_sha256'] == expected_hash and
            dropped[0]['after_durable_acceptance'] is True, 'lost acceptance reply must converge to one actual isolated execution')
    remote = json.loads(proof['remote_rows'][1]['remote_status'])
    execution = json.loads(row['execution_json'])
    require(json.loads(row['output_json']) == remote['output'] == observer.OUTPUT and
            calls[0]['input_sha256'] == hashlib.sha256(observer.INPUT.encode()).hexdigest() and
            calls[0]['output_sha256'] == hashlib.sha256(observer.OUTPUT.encode()).hexdigest() and
            calls[0]['execution'] == execution == remote['execution'] and
            execution['kind'] == 'actual_linux_isolated_process' and execution['socket_syscall_denied'] is True and
            execution['wallet_path_visible'] is False,
            'recorded executor input, output or actual isolation differs from durable runner and guest evidence')
    require(all(item['key'] != proof['remote_rows'][0]['key'] for item in requests),
            'discarded preparation contacted the remote endpoint')


def validate_proof(proof, package):
    require = observer.base.require
    require(proof['schema'] == 'rock-native-runner-ui-proof/1' and proof['status'] == 'PASS' and
            proof['observer_mutations'] == 0 and proof['physical_usb'] == proof['production_cloud'] == proof['blackberry'] == proof['real_money'] == 'NOT_RUN',
            'unexpected native remote proof scope or failure')
    sha = observer.base.digest(package)
    require(proof['tool'] == {'id': observer.TOOL, 'version': observer.VERSION, 'package_hash': sha} and proof['package'] == package,
            'native execution package differs from separately SDK-built fixture')
    observer.validate_records(proof['remote_rows'], proof['cancellation_receipts'], sha, package)
    require(len(proof['remote_rows']) == 2 and proof['remote_rows'][0]['state'] == 'cancelled' and proof['remote_rows'][1]['state'] == 'succeeded',
            'expected one unsent discard and one actual remote success')
    require(observer.hub_progress({'hub': proof['hub']}, sha) == 2 and set(proof['receipts']) == {'install', 'approve', 'refresh'},
            'native install/approval or absence of local execution differs')
    require(observer.validate_hub_receipts(proof['hub_receipt_rows'], sha, proof['registry_request_rows']) == proof['receipts'],
            'durable native Hub request hashes or receipt values differ')
    require([item['stage'] for item in proof['observations']] == ['PREVIEW1', 'CANCELLED', 'PREVIEW2', 'SUBMITTED'],
            'explicit preview/discard/approval stages were not independently observed')
    require(observer.base.wallet_baseline(proof['wallet_initial']) == proof['wallet_initial_sha256'] ==
            observer.base.wallet_baseline(proof['wallet_final']) == proof['wallet_final_sha256'], 'Wallet changed during remote execution')
    require(proof['environment_initial']['processes'] == proof['environment_final']['processes'], 'service restart during native workflow')
    for environment in (proof['environment_initial'], proof['environment_final']):
        require('ro' in environment['root_mount'][3].split(',') and
                {'rw', 'nosuid', 'nodev', 'noexec'}.issubset(environment['data_mount'][3].split(',')) and
                environment['hardware_network_interfaces'] == ['eth0'] and environment['framebuffer'] == [720, 960],
                'actual native environment or explicit store/runner network differs')
        for name, uid in {'ui': 1000, 'core': 1000, 'platform': 1002, 'wallet': 1003}.items():
            require(environment['processes'][name]['uid'] == environment['processes'][name]['gid'] == [uid] * 4 and
                    environment['processes'][name]['no_new_privs'] == 1, 'native process authority differs')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--artifacts', required=True, type=Path)
    args = parser.parse_args()
    if sys.platform != 'linux' or os.geteuid() == 0:
        raise SystemExit('requires nonroot isolated Linux development VM')
    images = args.artifacts.resolve()
    evidence = Path(tempfile.mkdtemp(prefix='runner-ui-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '-', dir=images))
    kernel, rootfs = images / 'Image', images / 'rootfs.ext4'
    before = {path.name: owned.sha(path) for path in (kernel, rootfs)}
    fixtures, ca = REPO / 'os/registry/fixtures', REPO / 'os/registry/fixtures/development-ca.pem'
    report = {'schema': 'rock-native-runner-ui-harness/1', 'status': 'RUNNING', 'started_utc': datetime.now(timezone.utc).isoformat(),
              'scope': 'actual native evdev consent and owned TLS fixture only', 'blackberry': 'NOT_RUN', 'physical_usb': 'NOT_RUN',
              'production_cloud': 'NOT_RUN', 'real_money': 'NOT_RUN', 'image_sha256_before': before,
              'destination_input_policy': 'one pointer tap per preview; no duplicate input fallback',
              'input_events': [], 'screenshots': [], 'qmp_events': [], 'qmp_commands': [], 'unsent_external_observations': []}
    registry = guest = server = runner = thread = monitor = executor = None
    server_log = (evidence / 'registry.log').open('wb')
    print('Actual native remote runner evidence: ' + str(evidence), flush=True)
    try:
        for port in (9443, 9444):
            with socket.socket() as probe:
                probe.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
                probe.bind(('127.0.0.1', port)); probe.listen(1)
        registry = subprocess.Popen([sys.executable, '-B', '-m', 'registry.server', '--state', str(evidence / 'registry'),
                    '--authors', str(fixtures / 'approved-authors.json'), '--cert', str(ca), '--fixture-key', str(fixtures / 'PUBLIC-FIXTURE-KEY.pem')],
                    env=dict(os.environ, PYTHONPATH=str(REPO / 'src') + ':' + str(REPO / 'os')),
                    stdin=subprocess.DEVNULL, stdout=server_log, stderr=subprocess.STDOUT)
        transport = owned.HTTPSOrigin('https://127.0.0.1:9443', ca, timeout=1, attempts=1)
        deadline = time.monotonic() + 10
        while True:
            if registry.poll() is not None: raise RuntimeError('owned registry exited before readiness')
            try:
                transport.request('GET', '/index.json', 512 * 1024); break
            except ValueError:
                if time.monotonic() >= deadline: raise
                time.sleep(0.1)
        package = owned.remote_fixture()
        package_file = evidence / 'remote-text.rock.json'
        package_file.write_bytes(owned.canonical(package))
        report['publish_receipt'] = owned.publish('https://127.0.0.1:9443', ca, fixtures / 'PUBLIC-AUTHOR-TOKEN.txt', package_file, 'native-runner-' + owned.sha(package_file))
        launcher = evidence / 'runner-sandbox'
        subprocess.run(['/usr/bin/cc', '-O2', '-Wall', '-Wextra', '-Werror', '-o', str(launcher), str(REPO / 'os/runner/sandbox_launcher.c')], check=True)
        launcher.chmod(0o755)
        executor = owned.RecordedExecutor(owned.IsolatedRecipeExecutor(launcher, REPO / 'src/blackberryrock/recipe_worker.py', REPO / 'os/runner/isolated_entry.py'))
        runner = owned.RecordedStore(evidence / 'runner', endpoint_id=observer.ENDPOINT, target='cloud', transport_evidence='pinned_tls_loopback_fixture',
                    owners=owned.OWNERS, publisher_trust={owned.TEST_PUBLISHER: owned.PUBLIC_TEST_KEY}, executor=executor)
        server = owned.TLSRunnerServer(('127.0.0.1', 9444), runner, ca, fixtures / 'PUBLIC-FIXTURE-KEY.pem', owned.LoseFirstAcceptedReply)
        server.drop_pending, server.dropped = True, []
        thread = threading.Thread(target=server.serve_forever, kwargs={'poll_interval': 0.05}, daemon=True)
        thread.start()
        data = evidence / 'userdata.ext4'
        with data.open('xb') as stream: stream.truncate(128 * 1024 * 1024)
        subprocess.run(['mkfs.ext4', '-q', '-F', '-L', 'rock-data', str(data)], check=True, timeout=30)
        with tempfile.TemporaryDirectory(prefix='rock-runner-ui-qmp-') as temporary:
            qmp = Path(temporary) / 'qmp.sock'
            command = ['qemu-system-aarch64', '-machine', 'virt-10.0,gic-version=3', '-accel', 'tcg', '-cpu', 'cortex-a53', '-m', '1024', '-smp', '2',
                       '-display', 'none', '-serial', 'stdio', '-monitor', 'none', '-qmp', f'unix:{qmp},server=on,wait=off', '-no-reboot',
                       '-kernel', str(kernel), '-append', 'console=ttyAMA0 vt.global_cursor_default=0 root=/dev/vda ro rootflags=noload rootwait panic=-1 rock.ui.runner.verify=1',
                       '-drive', f'if=none,file={rootfs},format=raw,id=osdisk,readonly=on', '-device', 'virtio-blk-pci,drive=osdisk,addr=0x1',
                       '-drive', f'if=none,file={data},format=raw,id=userdata', '-device', 'virtio-blk-pci,drive=userdata,addr=0x2',
                       '-object', 'rng-random,filename=/dev/urandom,id=rockrng', '-device', 'virtio-rng-pci,rng=rockrng,addr=0x3',
                       '-device', 'virtio-gpu-pci,xres=720,yres=960,addr=0x4', '-device', 'virtio-keyboard-pci,addr=0x5',
                       '-device', 'virtio-tablet-pci,addr=0x6', '-netdev', 'user,id=remote-net', '-device', 'virtio-net-pci,netdev=remote-net,id=remote-nic,addr=0x7,romfile=']
            report['command'] = command
            log = evidence / 'boot.log'
            with log.open('wb') as output:
                guest = subprocess.Popen(command, stdin=subprocess.DEVNULL, stdout=output, stderr=subprocess.STDOUT)
                deadline = time.monotonic() + 15
                while not qmp.exists():
                    if guest.poll() is not None or time.monotonic() >= deadline: raise RuntimeError('native QEMU monitor did not start')
                    time.sleep(0.1)
                monitor = power.Monitor(qmp, report)
                ui = native.NativeInput(monitor, evidence, report)
                def wait_marker(marker, seconds=45):
                    until = time.monotonic() + seconds
                    while time.monotonic() < until:
                        text = log.read_text(errors='replace')
                        if 'ROCK_UI_RUNNER_FAIL' in text: raise AssertionError('native runner observer failed; inspect serial proof')
                        if any(line == marker or line.startswith(marker + ' ') for line in text.replace('\r', '').splitlines()): return
                        if guest.poll() is not None: raise RuntimeError('guest stopped before ' + marker)
                        time.sleep(0.2)
                    raise TimeoutError('native UI did not reach ' + marker)
                def unsent(stage):
                    rows = owned.runner_rows(runner)
                    if rows or runner.requests or executor.calls: raise AssertionError('remote endpoint received a request before GUI sending consent')
                    report['unsent_external_observations'].append({'stage': stage, 'unix': time.time(), 'remote_requests': 0, 'remote_rows': 0, 'executions': 0})
                wait_marker('ROCK_UI_RUNNER_READY', 180)
                time.sleep(3); ui.capture('00-initial-hub')
                ui.click(250, 247); ui.type('org.rockstar.remote-text')
                time.sleep(1.2); ui.capture('01-search-before-store-refresh')
                ui.click(608, 184); wait_marker('ROCK_UI_RUNNER_CATALOG')
                time.sleep(3); ui.capture('02-discovered-signed-remote-tool')
                ui.click(360, 363); time.sleep(1.2); ui.capture('03-tool-permissions-and-destinations')
                for _ in range(3): ui.keys(['tab'])
                ui.keys(['ret']); wait_marker('ROCK_UI_RUNNER_INSTALLED')
                time.sleep(3); ui.capture('04-installed-awaiting-permission')
                ui.keys(['ret']); wait_marker('ROCK_UI_RUNNER_APPROVED')
                time.sleep(3); ui.keys(['ret']); time.sleep(1.2)
                ui.click(250, 425); ui.keys(['ctrl', 'a']); ui.type(observer.INPUT + 'x'); ui.keys(['backspace']); ui.keys(['esc'])
                time.sleep(1.2); ui.capture('05-real-keyboard-input')
                ui.keys(['pgdn']); time.sleep(0.5); ui.click(360, 761)
                time.sleep(1); ui.capture('06-owned-tls-and-unavailable-usb')
                # New-image regression: exactly one destination tap, including
                # when the UI queues it behind a periodic read.
                ui.click(360, 554)
                wait_marker('ROCK_UI_RUNNER_PREVIEW1')
                time.sleep(2); unsent('first-preview'); ui.capture('07-first-preview-without-transmission')
                ui.keys(['pgdn']); time.sleep(0.5); ui.capture('08-explicit-consent-and-discard-controls')
                ui.click(360, 728); wait_marker('ROCK_UI_RUNNER_CANCELLED')
                time.sleep(5); unsent('discarded-preview'); ui.capture('09-unsent-preparation-cancelled')
                # The connected actual framebuffer places the editor at 731.
                # Wait for status polling to clear the transient receipt banner.
                ui.keys(['pgdn']); time.sleep(0.5); ui.click(360, 731)
                time.sleep(1); ui.keys(['pgdn']); time.sleep(0.5); ui.click(360, 761)
                time.sleep(1); ui.click(360, 554)
                wait_marker('ROCK_UI_RUNNER_PREVIEW2')
                time.sleep(2); unsent('second-preview'); ui.capture('10-second-preview-needs-new-consent')
                ui.keys(['pgdn']); time.sleep(0.5); ui.capture('11-exact-input-send-consent')
                ui.click(360, 652); wait_marker('ROCK_UI_RUNNER_SUBMITTED'); wait_marker('ROCK_UI_RUNNER_SUCCEEDED', 60)
                time.sleep(4); ui.capture('12-actual-isolated-remote-result')
                ui.click(442, 913); time.sleep(1); ui.keys(['pgdn']); time.sleep(0.5)
                # The empty local history's remote-history entry is fully visible.
                ui.keys(['tab']); ui.keys(['tab']); ui.keys(['ret'])
                time.sleep(1.2); ui.capture('13-separate-remote-history')
                ui.click(606, 913); time.sleep(1); ui.capture('14-wallet-unchanged')
                guest.wait(timeout=60)
                monitor.reader.join(timeout=3)
            report['exit_code'] = guest.returncode
            if guest.returncode != 0: raise AssertionError('native runner guest exited abnormally')
            serial = power.markers(log.read_text(errors='replace'), 'ROCK_UI_RUNNER_PROOF')
            if len(serial) != 1: raise AssertionError('one native runner serial proof required')
            proof = serial[0]
            validate_proof(proof, package)
            dump = subprocess.run(['debugfs', '-R', 'cat /ui-runner-proof.json', str(data)], capture_output=True, check=True, timeout=20)
            if json.loads(dump.stdout) != proof: raise AssertionError('native runner serial proof differs from durable data')
            (evidence / 'ui-runner-proof.json').write_text(json.dumps(proof, ensure_ascii=False, indent=2) + '\n')
            rows = owned.runner_rows(runner)
            validate_execution(rows, executor.calls, server.dropped, runner.requests, proof, package)
            if {path.name: owned.sha(path) for path in (kernel, rootfs)} != before or len(report['screenshots']) != 15:
                raise AssertionError('native image changed or required original screens are missing')
            report.update(status='PASS', guest_proof_sha256=observer.base.digest(proof), durable_proof_matches_serial=True,
                          runner_rows=rows, remote_requests=runner.requests, isolated_executions=executor.calls, dropped_acceptance_replies=server.dropped)
    except BaseException as error:
        report.update(status='FAIL', error=type(error).__name__ + ': ' + str(error))
        if monitor and guest is not None and guest.poll() is None:
            try: monitor.command('screendump', {'filename': str(evidence / 'failure-display.png'), 'format': 'png'})
            except (OSError, ValueError, RuntimeError): pass
        raise
    finally:
        already_failed = sys.exc_info()[0] is not None
        errors = cleanup_owned(monitor, guest, server, thread, runner, registry, server_log)
        try:
            report['image_sha256_after'] = {path.name: owned.sha(path) for path in (kernel, rootfs)}
        except BaseException as error:
            errors.append({'resource': 'final-image-hashes', 'error': type(error).__name__ + ': ' + str(error)})
        if errors: report.update(status='FAIL', cleanup_errors=errors)
        report['finished_utc'] = datetime.now(timezone.utc).isoformat()
        (evidence / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
        if errors and not already_failed: raise RuntimeError('native runner cleanup failed; evidence retained')
    print('PASS actual native GUI signed download, unsent discard, exact sending consent and one isolated remote execution', flush=True)


if __name__ == '__main__':
    main()

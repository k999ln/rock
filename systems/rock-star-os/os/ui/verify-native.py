#!/usr/bin/env python3
"""Boot a fresh Rock OS guest; verify native input against read-only guest evidence.

Runs on the Linux QEMU build host, not inside Rock OS. No host root privilege,
network adapter, guest shell, direct service mutation, or shared host directory.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import struct
import subprocess
import tempfile
import time

from replay_qmp import Monitor, character_keys


def load_observer():
    spec = importlib.util.spec_from_file_location('rock_ui_observer', Path(__file__).with_name('guest-ui-evidence.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


OBSERVER = load_observer()


def digest_file(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def parse_proof(log):
    prefix = 'ROCK_UI_GUEST_PROOF '
    entries = [json.loads(line[len(prefix):]) for line in log.replace('\r', '').splitlines() if line.startswith(prefix)]
    if len(entries) != 1:
        raise AssertionError('exactly one serial guest proof is required')
    return entries[0]


def validate_proof(proof, *, contract=None, store_network=False, schema='rock-native-ui-proof/1'):
    require = OBSERVER.require
    tool_id, version, text_input, text_output = (OBSERVER.TOOL, OBSERVER.VERSION, OBSERVER.INPUT, OBSERVER.OUTPUT) if contract is None else (
        contract['id'], contract['version'], contract['input'], contract['output'])
    require(proof.get('schema') == schema and proof.get('status') == 'PASS', 'guest observer did not pass')
    require(proof.get('wallet') == 'SIMULATOR_ONLY' and proof.get('blackberry') == 'NOT_RUN', 'evidence scope mismatch')
    require(proof.get('wallet_unchanged') is True and proof['wallet_initial'] == proof['wallet_final'], 'guest Wallet changed')
    baseline = OBSERVER.wallet_baseline(proof['wallet_initial'])
    require(baseline == proof['wallet_initial_sha256'] == proof['wallet_final_sha256'], 'Wallet evidence digest mismatch')
    require(proof['expected_input'] == text_input and proof['expected_output'] == text_output, 'input/output contract mismatch')
    require(proof['capture_grace_seconds'] >= 30, 'guest skipped the screenshot grace period')
    for stage in ('environment_initial', 'environment_final'):
        environment = proof[stage]
        interfaces = environment['network_interfaces']
        allowed = {'lo', 'dummy0', 'sit0'} | ({'eth0'} if store_network else set())
        require('lo' in interfaces and set(interfaces).issubset(allowed) and
                environment['hardware_network_interfaces'] == (['eth0'] if store_network else []) and
                environment['framebuffer'] == [720, 960], 'guest display/network evidence mismatch')
        require(environment['root_mount'][2] == 'ext4' and 'ro' in environment['root_mount'][3].split(','), 'guest root was not read-only')
        data = environment['data_mount']
        require(data[:3] == ['/dev/vdb', '/data', 'ext4'] and {'rw', 'nosuid', 'nodev', 'noexec'}.issubset(data[3].split(',')), 'guest data protection mismatch')
        for role, uid in (('ui', 1000), ('core', 1000), ('platform', 1002), ('wallet', 1003)):
            process = environment['processes'][role]
            require(process['uid'] == [uid] * 4 and process['gid'] == [uid] * 4 and process['no_new_privs'] == 1, 'wrong guest service identity')
    require(proof['environment_initial']['processes'] == proof['environment_final']['processes'], 'guest service restarted')
    tool, job = proof['tool'], proof['job']
    require(tool['id'] == tool_id and tool['version'] == version, 'wrong evidence tool')
    snapshot = {'wallet': proof['wallet_final'], 'hub': {
        'maturity': proof['hub_maturity'], 'modes': proof['hub_modes'], 'installed': proof['installed'],
        'jobs': [job], 'audit': proof['audit'],
    }}
    require(job['status'] == 'succeeded', 'guest job was not completed')
    OBSERVER.check_progress(snapshot, baseline, tool['package_hash'], contract)
    receipts = [{'key': row['key'], 'request_hash': row['request_hash'], 'result': OBSERVER.canonical(row['result']).decode()}
                for row in proof['receipts'].values()]
    OBSERVER.validate_receipts(receipts, tool['package_hash'], job, contract)


def png_evidence(path):
    with path.open('rb') as stream:
        header = stream.read(24)
    if header[:8] != b'\x89PNG\r\n\x1a\n' or header[12:16] != b'IHDR' or struct.unpack('>II', header[16:24]) != (720, 960):
        raise AssertionError('QEMU capture is not a 720 by 960 PNG: ' + path.name)
    if path.stat().st_size < 4096:
        raise AssertionError('QEMU capture is unexpectedly small: ' + path.name)
    return {'name': path.name, 'bytes': path.stat().st_size, 'sha256': digest_file(path), 'dimensions': [720, 960]}


class NativeInput:
    def __init__(self, monitor, output, report):
        self.monitor, self.output, self.report = monitor, output, report

    def record(self, action, value):
        self.report['input_events'].append({'action': action, 'value': value, 'sent_unix': time.time()})

    def capture(self, name):
        path = self.output / (name + '.png')
        self.monitor.command('screendump', {'filename': str(path), 'format': 'png'})
        self.report['screenshots'].append(png_evidence(path))

    def click(self, x, y):
        position = [{'type': 'abs', 'data': {'axis': 'x', 'value': round(x * 32767 / 719)}},
                    {'type': 'abs', 'data': {'axis': 'y', 'value': round(y * 32767 / 959)}}]
        self.monitor.command('input-send-event', {'events': position + [{'type': 'btn', 'data': {'down': True, 'button': 'left'}}]})
        time.sleep(0.08)
        self.monitor.command('input-send-event', {'events': [{'type': 'btn', 'data': {'down': False, 'button': 'left'}}]})
        self.record('click', [x, y])
        time.sleep(0.2)

    def keys(self, names):
        self.monitor.command('send-key', {'keys': [{'type': 'qcode', 'data': key} for key in names], 'hold-time': 80})
        self.record('keys', names)
        time.sleep(0.15)

    def type(self, value):
        for character in value:
            self.keys(character_keys(character))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    default = Path(os.environ.get('ROCK_OS_ARTIFACTS', str(Path(__file__).resolve().parents[2] / 'artifacts/os')))
    parser.add_argument('--artifacts', type=Path, default=default, help='existing Image and rootfs.ext4 directory')
    parser.add_argument('--output', type=Path, help='parent directory for a new uniquely named evidence folder')
    args = parser.parse_args()
    if os.uname().sysname != 'Linux':
        parser.error('run this harness on the Linux QEMU build host')
    artifacts = args.artifacts.resolve(strict=True)
    kernel, rootfs = artifacts / 'Image', artifacts / 'rootfs.ext4'
    for path in (kernel, rootfs):
        if not path.is_file() or path.stat().st_size < 1024:
            parser.error('missing OS image: ' + str(path))
    for command in ('qemu-system-aarch64', 'mkfs.ext4', 'debugfs'):
        if shutil.which(command) is None:
            parser.error('required build-host program unavailable: ' + command)
    parent = (args.output or artifacts).resolve(strict=True)
    evidence = Path(tempfile.mkdtemp(prefix='native-ui-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '-', dir=parent))
    data, log = evidence / 'userdata.ext4', evidence / 'boot.log'
    report = {'schema': 'rock-native-ui-harness/1', 'status': 'RUNNING', 'started_utc': datetime.now(timezone.utc).isoformat(),
              'scope': 'actual QEMU ARM64 native framebuffer/evdev input with independent guest state observation',
              'blackberry': 'NOT_RUN', 'wallet': 'SIMULATOR_ONLY', 'input_events': [], 'screenshots': []}
    print('Native OS GUI evidence: ' + str(evidence), flush=True)
    monitor, process = None, None
    before = {path.name: digest_file(path) for path in (kernel, rootfs)}
    report['image_sha256_before'] = before
    try:
        # Formatting is limited to the regular, newly created file in our new evidence folder.
        with data.open('xb') as stream:
            stream.truncate(128 * 1024 * 1024)
        subprocess.run(['mkfs.ext4', '-q', '-F', '-L', 'rock-data', str(data)], check=True, timeout=30)
        with tempfile.TemporaryDirectory(prefix='rock-ui-qmp-') as temporary:
            qmp = Path(temporary) / 'qmp.sock'
            command = ['qemu-system-aarch64', '-machine', 'virt-10.0,gic-version=3', '-accel', 'tcg',
                       '-cpu', 'cortex-a53', '-m', '1024', '-smp', '2', '-display', 'none',
                       '-serial', 'stdio', '-monitor', 'none', '-qmp', f'unix:{qmp},server=on,wait=off',
                       '-no-reboot', '-nic', 'none', '-kernel', str(kernel), '-append',
                       'console=ttyAMA0 root=/dev/vda ro rootflags=noload rootwait panic=-1 vt.global_cursor_default=0 rock.ui.verify=1',
                       '-drive', f'if=none,file={rootfs},format=raw,id=osdisk,readonly=on',
                       '-device', 'virtio-blk-pci,drive=osdisk,addr=0x1',
                       '-drive', f'if=none,file={data},format=raw,id=userdata',
                       '-device', 'virtio-blk-pci,drive=userdata,addr=0x2',
                       '-object', 'rng-random,filename=/dev/urandom,id=rockrng',
                       '-device', 'virtio-rng-pci,rng=rockrng,addr=0x3',
                       '-device', 'virtio-gpu-pci,xres=720,yres=960,addr=0x4',
                       '-device', 'virtio-keyboard-pci,addr=0x5', '-device', 'virtio-tablet-pci,addr=0x6']
            report['command'] = command
            with log.open('wb') as output:
                process = subprocess.Popen(command, stdin=subprocess.DEVNULL, stdout=output, stderr=subprocess.STDOUT)
                qmp_deadline = time.monotonic() + 10
                while not qmp.exists():
                    if process.poll() is not None or time.monotonic() >= qmp_deadline:
                        raise RuntimeError('QEMU monitor did not start')
                    time.sleep(0.1)
                monitor = Monitor(qmp)
                def wait_marker(marker, seconds):
                    deadline = time.monotonic() + seconds
                    while time.monotonic() < deadline:
                        content = log.read_text(errors='replace')
                        if 'ROCK_UI_GUEST_FAIL' in content:
                            raise AssertionError('guest observer failed; inspect boot.log')
                        if any(line == marker or line.startswith(marker + ' ') for line in content.replace('\r', '').splitlines()):
                            return
                        if process.poll() is not None:
                            raise RuntimeError('QEMU stopped before ' + marker)
                        time.sleep(0.2)
                    raise TimeoutError('guest did not report ' + marker)

                wait_marker('ROCK_UI_OBSERVER_READY', 180)
                native = NativeInput(monitor, evidence, report)
                time.sleep(3)
                native.capture('00-hub')
                native.click(360, 363)
                time.sleep(0.8)
                native.capture('01-tool-detail')
                native.click(360, 793)
                wait_marker('ROCK_UI_INSTALLED_OBSERVED', 20)
                time.sleep(3)
                native.capture('02-installed-permission-review')
                native.click(360, 835)
                wait_marker('ROCK_UI_APPROVED_OBSERVED', 20)
                time.sleep(3)
                native.capture('03-approved')
                native.click(360, 835)
                time.sleep(0.8)
                native.capture('04-editor')
                native.click(250, 425)
                native.keys(['ctrl', 'a'])
                native.type(OBSERVER.INPUT + 'x')
                native.keys(['backspace'])
                # QMP's keyboard acknowledgement precedes guest evdev processing
                # and deferred framebuffer scanout; allow the final text to draw.
                time.sleep(1.2)
                native.capture('05-real-keyboard-input')
                native.keys(['ctrl', 'ret'])
                wait_marker('ROCK_UI_RUN_OBSERVED', 20)
                wait_marker('ROCK_UI_JOB_OBSERVED', 20)
                time.sleep(3)
                native.capture('06-actual-result')
                native.click(442, 913)
                time.sleep(0.8)
                native.capture('07-actual-history')
                native.click(606, 913)
                time.sleep(0.8)
                native.capture('08-wallet-unchanged')
                monitor.close()
                monitor = None
                process.wait(timeout=60)
                report['exit_code'] = process.returncode
                if process.returncode != 0:
                    raise RuntimeError('QEMU exited abnormally')
            serial = log.read_text(errors='replace')
            proof = parse_proof(serial)
            validate_proof(proof)
            extracted = subprocess.run(['debugfs', '-R', 'cat /ui-proof.json', str(data)], capture_output=True, check=True, timeout=20)
            persisted = json.loads(extracted.stdout)
            if persisted != proof:
                raise AssertionError('persisted /data/ui-proof.json differs from serial evidence')
            (evidence / 'ui-proof.json').write_text(json.dumps(proof, ensure_ascii=False, indent=2) + '\n')
            report['guest_proof_sha256'] = OBSERVER.digest(proof)
            report['durable_guest_proof_matches_serial'] = True
            if {path.name: digest_file(path) for path in (kernel, rootfs)} != before:
                raise AssertionError('read-only kernel/rootfs image changed')
            if len(report['screenshots']) != 9:
                raise AssertionError('required native framebuffer captures are missing')
            report['status'] = 'PASS'
            print('PASS actual native GUI input, signed-tool lifecycle, sandbox output, durable receipts and unchanged simulator Wallet', flush=True)
            print(str(evidence), flush=True)
    except BaseException as error:
        report.update(status='FAIL', error=type(error).__name__ + ': ' + str(error))
        if monitor and process is not None and process.poll() is None:
            try:
                monitor.command('screendump', {'filename': str(evidence / 'failure-display.png'), 'format': 'png'})
            except (OSError, ValueError, RuntimeError):
                pass
        raise
    finally:
        if monitor:
            monitor.close()
        if process is not None and process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
        report['image_sha256_after'] = {path.name: digest_file(path) for path in (kernel, rootfs)}
        report['finished_utc'] = datetime.now(timezone.utc).isoformat()
        (evidence / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')


if __name__ == '__main__':
    main()

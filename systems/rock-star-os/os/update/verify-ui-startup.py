#!/usr/bin/env python3
"""Fourteen real GUI-required ARM64 boots: native readiness and A/B rollback.

Immutable original Image/rootfs/stage0; fresh disposable data and signed B
images. Only test-specific S60/S96 launch/fault hooks are injected into B.
No host edits to slot/data state between boots, no headless or mocked health.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import sys
import tempfile
import time

SOURCE = Path(__file__).resolve().parent
REPO = SOURCE.parents[1]
sys.path.insert(0, str(SOURCE))
from make_bundle import bundle, check_filesystem
from rock_update import ATTEMPTS, verify_envelope


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


auth = load('rock_ui_auth_source_checks', SOURCE / 'verify-auth-health.py')
verify = auth.verify
Monitor = load('rock_ui_startup_qmp', REPO / 'os/ui/replay_qmp.py').Monitor
CASES = ('ready', 'absent', 'freeze', 'crash')
MAX_LOG = 16 * 1024 * 1024
REQUIRED_FREE = 12 * 1024**3


def require(value, message):
    if not value:
        raise RuntimeError(message)


def lines(text):
    return text.replace('\r', '').splitlines()


def records(text, marker):
    # Live serial polling can end in the middle of a write. Parse only complete
    # newline-terminated records; a truncated final proof can never be accepted.
    return [json.loads(line[len(marker) + 1:]) for line in text.replace('\r', '').split('\n')[:-1]
            if line.startswith(marker + ' ')]


def validate_health(proof):
    require(type(proof) is dict and proof.get('schema') == 'rock-native-ui-health/1'
            and proof.get('status') == 'READY' and proof.get('native_ui_checked') is True,
            'missing real native health proof')
    require(type(proof.get('pid')) is int and proof['pid'] > 1 and
            type(proof.get('process_start_ticks')) is int and proof['process_start_ticks'] > 0,
            'health identity is incomplete')
    samples = proof.get('samples')
    require(type(samples) is list and len(samples) == 2, 'two health samples required')
    for sample in samples:
        require(type(sample) is dict and all(type(sample.get(k)) is int for k in
                ('frames', 'loops', 'width', 'height', 'inputs')), 'invalid health sample types')
        require(0 < sample['frames'] < 2**64 and 0 < sample['loops'] < 2**64 and
                sample['width'] == 720 and sample['height'] == 960 and 1 <= sample['inputs'] <= 24,
                'native framebuffer/input not ready')
    first, second = samples
    require(second['loops'] > first['loops'] and second['frames'] >= first['frames'] and
            first['inputs'] == second['inputs'], 'event loop did not advance')


def validate_state(state, *, step, mode, factory_hash, candidate_hash):
    require(type(state) is dict and all(type(state.get(key)) is int for key in
            ('schema', 'attempts_left', 'floor')) and state['schema'] == 1,
            'persistent state integer fields are invalid')
    expected = ('A', 'B', 2, 1) if step == 0 else (
        ('B', None, 0, 2) if mode == 'ready' else
        ('A', 'B', 2 - step, 1) if step in (1, 2) else ('A', None, 0, 1))
    actual = tuple(state.get(key) for key in ('committed', 'pending', 'attempts_left', 'floor'))
    require(actual == expected, 'durable mark-good/rollback state mismatch: ' + str(actual))
    slots = state.get('slots', {})
    for slot, digest, sequence in (('A', factory_hash, 1), ('B', candidate_hash, 2)):
        manifest = verify_envelope(slots.get(slot))
        require(manifest['sha256'] == digest and manifest['sequence'] == sequence,
                'durable state does not bind the actual signed slot ' + slot)


def validate_boot(text, *, step, mode):
    output = lines(text)
    rejected = mode != 'ready' and step in (1, 2)
    slot = 'A' if step == 0 or step == 3 else 'B'
    sequence = 1 if slot == 'A' else 2
    reason = 'committed' if step == 0 else 'attempts-exhausted' if step == 3 else 'trial'
    required = [f'ROCK_AB_SELECTED slot={slot} sequence={sequence} reason={reason}',
                'ROCK_AB_SWITCH_ROOT device=' + ('/dev/vda' if slot == 'A' else '/dev/vdc')]
    forbidden = ['ROCK_AB_RECOVERY', 'ROCK_AB_TEST_FAIL', 'ROCK_AB_WATCHDOG_REBOOT',
                 'Kernel panic', 'ROCK_UI_HEALTH_HEADLESS', 'ROCK_UI_STARTUP_FIXTURE_FAILED']
    if rejected:
        required += ['ROCK_AB_HEALTH_FAILED_REBOOT']
        forbidden += ['ROCK_AB_HEALTH_CONFIRMED', 'ROCK_AB_PHASE_PASS', 'ROCK_UI_HEALTH_READY']
        faults = records(text, 'ROCK_UI_STARTUP_FAULT')
        require(len(faults) == 1 and faults[0].get('mode') == mode, 'requested fault was not measured')
        fault = faults[0]
        if mode == 'absent':
            require(fault.get('ui_started') is False, 'UI absence was not established')
        else:
            proofs = records(text, 'ROCK_UI_STARTUP_FIXTURE_READY')
            require(len(proofs) == 1, 'fault was not preceded by real readiness')
            validate_health(proofs[0])
            require((fault.get('pid'), fault.get('process_start_ticks')) ==
                    (proofs[0]['pid'], proofs[0]['process_start_ticks']), 'fault hit a different process')
            require(fault.get('stopped') is (mode == 'freeze') and fault.get('exited') is (mode == 'crash'),
                    'actual signal effect differs from requested fault')
        require(any(line.startswith('ROCK_UI_HEALTH_REJECTED ') for line in output),
                'installed UI checker did not visibly reject the fault')
    else:
        required += ['ROCK_AB_HEALTH_CONFIRMED']
        phase = 'fault-stage' if step == 0 else 'fault-readback-b' if mode == 'ready' else 'fault-readback-a'
        required += ['ROCK_AB_PHASE_PASS phase=' + phase]
        if step == 3:
            required += ['ROCK_AB_PREARM_RECOVERY_PASS']
        if mode == 'ready' and step == 1:
            required += ['ROCK_AB_DURABLE_STATE_RECOVERY_PASS']
        forbidden += ['ROCK_AB_HEALTH_FAILED_REBOOT', 'ROCK_UI_STARTUP_FAULT']
        proofs = records(text, 'ROCK_UI_HEALTH_READY')
        require(len(proofs) == 1, 'S97 did not check the genuine native GUI exactly once')
        validate_health(proofs[0])
        health_line = next(i for i, line in enumerate(output) if line.startswith('ROCK_UI_HEALTH_READY '))
        require('ROCK_AB_HEALTH_CONFIRMED' in output and health_line < output.index('ROCK_AB_HEALTH_CONFIRMED'),
                'trial confirmation preceded native UI readiness')
    missing = [value for value in required if value not in output]
    bad = [value for value in forbidden if any(line == value or line.startswith(value + ' ') for line in output)]
    if any(re.match(r'^(?:\[\s*[0-9.]+\]\s*)?Kernel panic(?:\s|$)', line) for line in output):
        bad.append('kernel-timestamped panic')
    require(not missing and not bad, 'guest boot evidence failed: ' + str({'missing': missing, 'forbidden': bad}))
    return {'native_ui_checked': not rejected, 'rejected_unready_trial': rejected,
            'selected_slot': slot, 'sequence': sequence, 'selection_reason': reason}


def write_guest_file(image, directory, name, guest_path, raw, executable=False, replace=False):
    target = directory / name
    target.write_bytes(raw)
    commands = []
    if replace:
        commands.append('rm /' + guest_path)
    commands.extend(['write ' + name + ' /' + guest_path,
                     'set_inode_field /' + guest_path + ' mode ' + ('0100755' if executable else '0100644')])
    for command in commands:
        result = subprocess.run(['debugfs', '-w', '-R', command, image.name], cwd=directory,
                                capture_output=True, text=True, timeout=30)
        require(result.returncode == 0 and ('Allocated inode' in result.stdout if command.startswith('write ') else True),
                'test fixture injection failed: ' + command)
    require(auth.embedded(image, guest_path) == raw, 'injected fixture readback differs: ' + guest_path)
    return {'path': guest_path, 'sha256': hashlib.sha256(raw).hexdigest(), 'test_only': True}


def source_checks(images, evidence):
    hashes = auth.source_checks(images, evidence)
    mapping = {'os/update/ui_health.py': 'usr/lib/rock-update/ui_health.py',
               'os/update/rock-ui-health': 'usr/libexec/rock-ui-health',
               'os/buildroot/board/rock-virt/overlay/etc/init.d/S60rockui': 'etc/init.d/S60rockui'}
    for source, guest in mapping.items():
        raw = (REPO / source).read_bytes()
        require(raw == auth.embedded(images / 'rootfs.ext4', guest), 'frozen startup source differs: ' + source)
        target = evidence / 'source-inputs' / source
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(raw)
        hashes[source] = hashlib.sha256(raw).hexdigest()
    binary = auth.embedded(images / 'rootfs.ext4', 'usr/bin/rock-ui')
    require(binary.startswith(b'\x7fELF\x02\x01') and int.from_bytes(binary[18:20], 'little') == 183,
            'frozen native UI is not an ARM64 ELF executable')
    hashes['installed:/usr/bin/rock-ui'] = hashlib.sha256(binary).hexdigest()
    for path in (Path(__file__), SOURCE / 'ui_startup_fixture.py', REPO / 'os/ui/replay_qmp.py'):
        target = evidence / 'source-inputs' / path.relative_to(REPO)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(path.read_bytes())
        hashes[path.relative_to(REPO).as_posix()] = verify.sha256(path)
    return hashes


def validate_capture(path):
    raw = path.read_bytes()
    header = re.match(rb'P6\n720 960\n255\n', raw)
    require(header and len(raw) == header.end() + 720 * 960 * 3, 'invalid actual QMP framebuffer capture')
    pixels = memoryview(raw)[header.end():]
    colors = {bytes(pixels[i:i + 3]) for i in range(0, len(pixels), 3)}
    require(len(colors) >= 3, 'actual framebuffer is blank or lacks rendered GUI content')
    return {'file': path.name, 'sha256': verify.sha256(path), 'size': [720, 960],
            'source': 'QMP screendump of real virtio GPU', 'visually_reviewed': False}


def boot(command, log, qmp, timeout, capture):
    process, monitor = None, None
    started = time.monotonic()
    result = {'status': 'RUNNING', 'passed': False, 'command': command, 'log': log.name}
    try:
        with log.open('xb') as stream:
            process = subprocess.Popen(command, stdin=subprocess.DEVNULL, stdout=stream, stderr=subprocess.STDOUT)
            deadline = started + timeout
            qmp_deadline = min(deadline, started + 15)
            while not qmp.exists():
                require(process.poll() is None and time.monotonic() < qmp_deadline, 'QMP startup deadline')
                time.sleep(0.05)
            monitor = Monitor(qmp)
            while process.poll() is None:
                require(time.monotonic() < deadline, 'QEMU per-boot deadline')
                require(log.stat().st_size <= MAX_LOG, 'QEMU serial log bound exceeded')
                text = log.read_text(errors='replace')
                if capture is not None and 'capture' not in result and records(text, 'ROCK_UI_STARTUP_FIXTURE_READY'):
                    monitor.command('screendump', {'filename': str(capture)})
                    result['capture'] = validate_capture(capture)
                time.sleep(0.05)
            process.wait(timeout=5)
            result['exit_code'] = process.returncode
            require(process.returncode == 0, 'QEMU exited abnormally: ' + str(process.returncode))
            require(log.stat().st_size <= MAX_LOG, 'QEMU serial log bound exceeded')
            require(capture is None or 'capture' in result, 'required real framebuffer capture was not acquired')
        return result
    finally:
        if monitor:
            monitor.close()
        if process is not None and process.poll() is None:
            process.kill()
            process.wait(timeout=10)
        result['elapsed_seconds'] = round(time.monotonic() - started, 3)


def evidence_location(artifacts, destination):
    # Resolve existing parent aliases before creating anything. Lexical checks
    # alone let a symlink or '..' path put mutable evidence inside frozen input.
    images = artifacts.resolve()
    require(destination.name not in ('', '.', '..'), 'a new evidence directory name is required')
    evidence = destination.parent.resolve(strict=True) / destination.name
    require(evidence != images and images not in evidence.parents,
            'evidence must be outside immutable artifacts')
    require(all(not any(character in str(path) for character in (',', '\n', '\r', '\0'))
                for path in (images, evidence)),
            'QEMU option separators or control characters are not allowed in artifact/evidence paths')
    return images, evidence


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--artifacts', required=True, type=Path)
    parser.add_argument('--evidence', required=True, type=Path, help='new directory under an existing parent')
    parser.add_argument('--timeout', type=int, default=180, help='per boot, 120–240 seconds; no automatic retries')
    parser.add_argument('--qemu', default='qemu-system-aarch64')
    args = parser.parse_args()
    images, evidence = evidence_location(args.artifacts, args.evidence)
    os.umask(0o077)
    evidence.mkdir(mode=0o700, parents=False, exist_ok=False)
    report = {'schema': 'rock-native-ui-startup-ab/1', 'status': 'NOT_RUN',
              'started_utc': datetime.now(timezone.utc).isoformat(),
              'scope': 'real GUI readiness before mark-good, unready trial rejection and guest-controlled A/B recovery',
              'limits': {'cases': 4, 'boots': 14, 'per_boot_seconds': args.timeout,
                         'guest_memory_mib': 1024, 'guest_cpus': 2, 'rootfs_max_mib': 512,
                         'serial_max_mib_per_boot': 16, 'required_free_gib': 12},
              'network_adapter': 'none', 'ui_mode': 'required', 'physical_blackberry': 'NOT_RUN',
              'real_funds': 'NOT_USED', 'production_secure_boot': False, 'hardware_antirollback': False,
              'physical_scanout': 'NOT_TESTED', 'real_user_input': 'NOT_TESTED',
              'post_commit_supervision': 'NOT_TESTED', 'automatic_retries': False,
              'cases': [{'mode': mode, 'status': 'NOT_RUN', 'boots': []} for mode in CASES]}
    inputs, before, original_identities = {}, {}, {}
    report_path = evidence / 'report.json'

    def save():
        report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')

    save()
    try:
        require(sys.platform == 'linux' and 120 <= args.timeout <= 240 and ATTEMPTS == 2,
                'Linux, bounded timeout and the reviewed two-attempt updater are required')
        for name in (args.qemu, 'mkfs.ext4', 'debugfs', 'e2fsck', 'cp', 'openssl'):
            require(shutil.which(name), 'missing dependency: ' + name)
        images = images.resolve(strict=True)
        require(shutil.disk_usage(evidence).free >= REQUIRED_FREE, 'insufficient free space for bounded fresh fixtures')
        for name, upper in (('Image', 128 * 1024**2), ('rootfs.ext4', 512 * 1024**2), ('stage0.cpio.gz', 128 * 1024**2)):
            path = images / name
            info = path.lstat()
            require(stat.S_ISREG(info.st_mode) and 1024 < info.st_size <= upper, 'invalid or oversized input: ' + name)
            inputs[name] = path
            before[name] = verify.sha256(path)
            original_identities[name] = (info.st_dev, info.st_ino, info.st_size, info.st_mtime_ns, info.st_ctime_ns)
        report['input_sha256_before'] = before
        report['source_sha256'] = source_checks(images, evidence)
        check_filesystem(inputs['rootfs.ext4'])
        report['qemu_version'] = subprocess.check_output([args.qemu, '--version'], text=True, timeout=10)
        report['status'] = 'RUNNING'
        save()
        for entry in report['cases']:
            mode = entry['mode']
            directory = evidence / mode
            directory.mkdir(mode=0o700)
            entry['status'] = 'RUNNING'
            save()
            try:
                rootfs, a, b, data, payloads = (directory / name for name in
                    ('release-2.ext4', 'slot-a.ext4', 'slot-b.ext4', 'userdata.ext4', 'payloads.ext4'))
                subprocess.run(['cp', '--sparse=always', '--reflink=auto', str(inputs['rootfs.ext4']), str(rootfs)],
                               check=True, timeout=120)
                entry['injections'] = [write_guest_file(rootfs, directory, 'release-marker',
                    'etc/rock-update/build-marker', b'release-2\n')]
                if mode == 'absent':
                    entry['injections'].append(write_guest_file(rootfs, directory, 'no-ui-launch',
                        'etc/init.d/S60rockui', b'#!/bin/sh\n[ "${1:-start}" = start ] || exit 0\necho ROCK_UI_STARTUP_NOT_LAUNCHED\n',
                        executable=True, replace=True))
                entry['injections'].append(write_guest_file(rootfs, directory, 'startup-fixture.py',
                    'usr/lib/rock-update/ui_startup_fixture.py', (SOURCE / 'ui_startup_fixture.py').read_bytes()))
                entry['injections'].append(write_guest_file(rootfs, directory, 'startup-fixture-init',
                    'etc/init.d/S96rock-ui-startup-fixture',
                    ('#!/bin/sh\n[ "${1:-start}" = start ] || exit 0\nexec /usr/bin/python3 -I -B '
                     '/usr/lib/rock-update/ui_startup_fixture.py ' + mode + '\n').encode(), executable=True))
                for source, guest in (('ui_health.py', 'usr/lib/rock-update/ui_health.py'),
                                      ('S97rock-update-health', 'etc/init.d/S97rock-update-health'),
                                      ('rock_update.py', 'usr/lib/rock-update/rock_update.py')):
                    require(auth.embedded(rootfs, guest) == (SOURCE / source).read_bytes(), 'fixture altered production health/update logic')
                require(hashlib.sha256(auth.embedded(rootfs, 'usr/bin/rock-ui')).hexdigest() ==
                        report['source_sha256']['installed:/usr/bin/rock-ui'], 'fixture altered native UI binary')
                check_filesystem(rootfs)
                fixtures = directory / 'fixtures'
                fixtures.mkdir()
                envelope = bundle(rootfs, fixtures / 'release-2.rock', 2, 'release-2')
                candidate_hash = envelope['manifest']['sha256']
                entry['candidate_manifest'] = envelope['manifest']
                (directory / 'candidate-envelope.json').write_text(json.dumps(envelope, indent=2) + '\n')
                subprocess.run(['cp', '--sparse=always', '--reflink=auto', str(inputs['rootfs.ext4']), str(a)],
                               check=True, timeout=120)
                for path, size in ((b, rootfs.stat().st_size), (data, 128 * 1024**2),
                                   (payloads, (fixtures / 'release-2.rock').stat().st_size * 12 // 10 + 64 * 1024**2)):
                    with path.open('xb') as stream:
                        stream.truncate(size)
                subprocess.run(['mkfs.ext4', '-q', '-F', '-L', 'rock-ui-startup-data', str(data)], check=True, timeout=60)
                subprocess.run(['mkfs.ext4', '-q', '-F', '-L', 'rock-ui-startup-fixtures', '-d', str(fixtures), str(payloads)],
                               check=True, timeout=120)
                for step in range(2 if mode == 'ready' else 4):
                    phase = 'fault-stage' if step == 0 else 'fault-readback-b' if mode == 'ready' else 'fault-readback-a'
                    log = directory / f'boot-{step + 1}.log'
                    result = {'step': step, 'status': 'RUNNING', 'passed': False, 'phase': phase, 'log': log.name}
                    entry['boots'].append(result)
                    save()
                    with tempfile.TemporaryDirectory(prefix='rock-ui-startup-qmp-') as temporary:
                        qmp = Path(temporary) / 'qmp.sock'
                        command = [args.qemu, '-machine', 'virt-10.0,gic-version=3', '-cpu', 'cortex-a53', '-accel', 'tcg',
                            '-m', '1024', '-smp', '2', '-display', 'none', '-serial', 'stdio', '-monitor', 'none',
                            '-qmp', f'unix:{qmp},server=on,wait=off', '-no-reboot', '-nic', 'none',
                            '-kernel', str(inputs['Image']), '-initrd', str(inputs['stage0.cpio.gz']),
                            '-append', 'console=ttyAMA0 vt.global_cursor_default=0 ro rootwait panic=1 rock.ui=required rock.abtest=' + phase,
                            '-drive', f'if=none,file={a},format=raw,id=slota', '-device', 'virtio-blk-pci,drive=slota,addr=0x1',
                            '-drive', f'if=none,file={data},format=raw,id=userdata', '-device', 'virtio-blk-pci,drive=userdata,addr=0x2',
                            '-object', 'rng-random,filename=/dev/urandom,id=rockrng', '-device', 'virtio-rng-pci,rng=rockrng,addr=0x3',
                            '-drive', f'if=none,file={b},format=raw,id=slotb', '-device', 'virtio-blk-pci,drive=slotb,addr=0x4',
                            '-drive', f'if=none,file={payloads},format=raw,id=fixtures,readonly=on',
                            '-device', 'virtio-blk-pci,drive=fixtures,addr=0x5',
                            '-device', 'virtio-gpu-pci,xres=720,yres=960,addr=0x6',
                            '-device', 'virtio-keyboard-pci,addr=0x7', '-device', 'virtio-tablet-pci,addr=0x8']
                        capture = directory / f'boot-{step + 1}.ppm' if step in (1, 2) and mode != 'absent' else None
                        result['command'] = command
                        save()
                        print(f'GUI-required startup: {mode} boot {step + 1}/{2 if mode == "ready" else 4}; {log}', flush=True)
                        result.update(boot(command, log, qmp, args.timeout, capture))
                    result.update(validate_boot(log.read_text(errors='replace'), step=step, mode=mode))
                    state = json.loads(auth.embedded(data, 'rock-update/state.json'))
                    validate_state(state, step=step, mode=mode, factory_hash=before['rootfs.ext4'], candidate_hash=candidate_hash)
                    result['durable_state'] = {key: state[key] for key in ('committed', 'pending', 'attempts_left', 'floor', 'generation')}
                    result['slot_sha256'] = {'A': verify.sha256(a), 'B': verify.sha256(b)}
                    require(result['slot_sha256'] == {'A': before['rootfs.ext4'], 'B': candidate_hash}, 'guest modified immutable signed slot content')
                    result.update(status='PASS', passed=True)
                    save()
                entry['status'] = 'PASS'
            except BaseException as error:
                entry.update(status='FAIL', error=type(error).__name__ + ': ' + str(error))
                if entry['boots'] and entry['boots'][-1]['status'] == 'RUNNING':
                    entry['boots'][-1].update(status='FAIL', passed=False, error=entry['error'])
                raise
            save()
        require(sum(len(entry['boots']) for entry in report['cases']) == 14 and
                all(entry['status'] == 'PASS' for entry in report['cases']), 'incomplete GUI startup matrix')
        report['status'] = 'PASS'
    except BaseException as error:
        report.update(status='FAIL', error=type(error).__name__ + ': ' + str(error))
        raise
    finally:
        after, stable = {}, False
        try:
            after = {name: verify.sha256(path) for name, path in inputs.items()}
            stable = after == before and all(
                (path.stat().st_dev, path.stat().st_ino, path.stat().st_size, path.stat().st_mtime_ns, path.stat().st_ctime_ns)
                == original_identities[name] for name, path in inputs.items())
        except OSError as error:
            report['input_recheck_error'] = type(error).__name__ + ': ' + str(error)
        report['input_sha256_after'] = after
        report['original_images_unchanged'] = stable
        if not stable:
            report.update(status='FAIL', error='original input identity or content changed')
        report['finished_utc'] = datetime.now(timezone.utc).isoformat()
        save()
    require(report['status'] == 'PASS', 'GUI startup acceptance failed')
    print('PASS: 14 real GUI-required boots, genuine readiness, three rejected trial modes and A/B recovery; ' + str(report_path))


if __name__ == '__main__':
    main()

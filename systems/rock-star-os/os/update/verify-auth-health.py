#!/usr/bin/env python3
"""Three actual stage0 boots: authenticator health and committed-state recovery.

Run only in the root-coordinated Linux QEMU slot. Reuses the unchanged frozen
guest fault-stage/fault-readback-b phases. This is NOT the full eight/thirteen
boot update suite. Source images remain immutable; all writable disks and the
single intentional power cut belong to this newly created evidence directory.
"""
import argparse
from datetime import datetime, timezone
import gzip
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import stat
import subprocess
import sys

SOURCE = Path(__file__).resolve().parent
REPO = SOURCE.parents[1]
sys.path.insert(0, str(SOURCE))
from make_bundle import bundle, check_filesystem
from rock_update import verify_envelope

spec = importlib.util.spec_from_file_location('auth_health_ab_verify', SOURCE / 'verify-qemu.py')
verify = importlib.util.module_from_spec(spec)
spec.loader.exec_module(verify)


def require(value, message):
    if not value:
        raise RuntimeError(message)


def embedded(image, path):
    result = subprocess.run(['debugfs', '-R', 'cat /' + path, str(image)],
                            capture_output=True, timeout=30)
    require(result.returncode == 0 and result.stdout, 'cannot read frozen guest file: ' + path)
    return result.stdout


def stage0_files(path, names):
    """Read only selected regular newc members; never extract archive paths."""
    result, seen, total = {}, set(), 0
    with gzip.open(path, 'rb') as stream:
        while True:
            header = stream.read(110)
            require(len(header) == 110 and header[:6] == b'070701', 'invalid stage0 newc header')
            fields = [int(header[i:i + 8], 16) for i in range(6, 110, 8)]
            mode, size, length = fields[1], fields[6], fields[11]
            require(0 < length <= 4096 and size <= 512 * 1024 * 1024, 'stage0 member bounds')
            raw_name = stream.read(length)
            require(len(raw_name) == length and raw_name.endswith(b'\0'), 'invalid stage0 member name')
            name = raw_name[:-1].decode('utf-8')
            require(name not in seen, 'duplicate stage0 member')
            seen.add(name)
            require(len(seen) <= 10000, 'stage0 member limit')
            padding = (-(110 + length)) % 4
            require(len(stream.read(padding)) == padding, 'truncated stage0 name padding')
            total += 110 + length + padding + size + (-size % 4)
            require(total <= 1024 * 1024 * 1024, 'stage0 expanded byte limit')
            if name == 'TRAILER!!!':
                require(size == 0, 'invalid stage0 trailer')
                break
            if name in names:
                require(stat.S_ISREG(mode) and size <= 1024 * 1024, 'invalid selected stage0 member')
                result[name] = stream.read(size)
                require(len(result[name]) == size, 'truncated selected stage0 member')
            else:
                remaining = size
                while remaining:
                    block = stream.read(min(remaining, 1024 * 1024))
                    require(block, 'truncated stage0 member')
                    remaining -= len(block)
            padding = -size % 4
            require(len(stream.read(padding)) == padding, 'truncated stage0 body padding')
    require(set(result) == set(names), 'required stage0 members missing')
    return result


def source_checks(images, evidence):
    wrapper = b'#!/bin/sh\nexec /usr/bin/python3 -I -B /usr/lib/rock-platform/wallet_auth/health.py\n'
    require(embedded(images / 'rootfs.ext4', 'usr/libexec/rock-authenticator-health') == wrapper,
            'authenticator health launcher is not the fixed read-only checker')
    mapping = {
        'os/update/S97rock-update-health': 'etc/init.d/S97rock-update-health',
        'os/update/S99rock-ab-test': 'etc/init.d/S99rock-ab-test',
        'os/update/guest_test.py': 'usr/lib/rock-update/guest_test.py',
        'os/update/fault_guest.py': 'usr/lib/rock-update/fault_guest.py',
        'os/update/fault_cli.py': 'usr/lib/rock-update/fault_cli.py',
        'os/update/test_faults.py': 'usr/lib/rock-update/test_faults.py',
        'os/update/rock_update.py': 'usr/lib/rock-update/rock_update.py',
        'os/update/rock-boot-watchdog': 'usr/libexec/rock-boot-watchdog',
        'os/wallet_auth/health.py': 'usr/lib/rock-platform/wallet_auth/health.py',
        'os/wallet_auth/daemon.py': 'usr/lib/rock-platform/wallet_auth/daemon.py',
        'os/buildroot/board/rock-virt/overlay/etc/init.d/S55rockauthenticator': 'etc/init.d/S55rockauthenticator',
    }
    hashes = {}
    for source, installed in mapping.items():
        raw = (REPO / source).read_bytes()
        require(raw == embedded(images / 'rootfs.ext4', installed), 'frozen source differs: ' + source)
        copied = evidence / 'source-inputs' / source
        copied.parent.mkdir(parents=True, exist_ok=True)
        copied.write_bytes(raw)
        hashes[source] = hashlib.sha256(raw).hexdigest()
    for name in ('verify-auth-health.py', 'verify-qemu.py', 'make_bundle.py', 'init'):
        source = 'os/update/' + name
        copied = evidence / 'source-inputs' / source
        copied.parent.mkdir(parents=True, exist_ok=True)
        copied.write_bytes((REPO / source).read_bytes())
        hashes[source] = verify.sha256(copied)
    stage = stage0_files(images / 'stage0.cpio.gz', {
        'init', 'etc/rock-update/factory.json', 'usr/lib/rock-update/rock_update.py',
        'usr/lib/rock-update/fault_cli.py', 'usr/lib/rock-update/test_faults.py'})
    for name, source in (('init', 'init'), ('usr/lib/rock-update/rock_update.py', 'rock_update.py'),
                         ('usr/lib/rock-update/fault_cli.py', 'fault_cli.py'),
                         ('usr/lib/rock-update/test_faults.py', 'test_faults.py')):
        require(stage[name] == (SOURCE / source).read_bytes(), 'stage0 source differs: ' + name)
    envelope = json.loads(stage['etc/rock-update/factory.json'])
    factory = verify_envelope(envelope)
    require(factory['sequence'] == 1 and factory['sha256'] == verify.sha256(images / 'rootfs.ext4')
            and factory['size'] == (images / 'rootfs.ext4').stat().st_size, 'stage0 factory envelope does not bind frozen rootfs')
    (evidence / 'factory-envelope.json').write_text(json.dumps(envelope, indent=2) + '\n')
    return hashes


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--artifacts', required=True, type=Path, help='immutable matching Image/rootfs.ext4/stage0.cpio.gz')
    parser.add_argument('--evidence', required=True, type=Path, help='new private directory; must not already exist')
    parser.add_argument('--timeout', type=int, default=300, help='per-boot timeout, 60–600 seconds')
    parser.add_argument('--qemu', default='qemu-system-aarch64')
    args = parser.parse_args()
    require(sys.platform == 'linux' and 60 <= args.timeout <= 600, 'requires authorized Linux slot and bounded timeout')
    for name in (args.qemu, 'mkfs.ext4', 'debugfs', 'e2fsck', 'cp', 'openssl'):
        require(shutil.which(name), 'missing dependency: ' + name)
    images = args.artifacts.resolve(strict=True)
    evidence = args.evidence.absolute()
    os.umask(0o077)
    evidence.mkdir(mode=0o700, parents=False, exist_ok=False)
    inputs = {name: images / name for name in ('Image', 'rootfs.ext4', 'stage0.cpio.gz')}
    report = {'schema': 'rock-auth-stage0-health/1', 'status': 'RUNNING', 'boots': [],
              'native_ui_checked': False, 'ui_health_mode': 'explicit-development-headless',
        'started_utc': datetime.now(timezone.utc).isoformat(),
        'scope': 'three actual stage0 boots; required authenticator health and durable confirmation recovery only',
        'full_eight_or_thirteen_boot_suite': False, 'physical_blackberry': 'NOT_RUN',
        'hardware_authenticator': False, 'production_secure_boot': False, 'hardware_antirollback': False,
        'real_funds': 'NOT_USED', 'network_adapter': 'none',
        'private_data': 'userdata.ext4 and mutable slot disks are private; excluded from export_files',
        'normal_boot_exit': 'existing frozen S99 test hook syncs and requests reboot -f; no clean-poweroff or closed-Wallet-DB claim'}
    try:
        report['input_sha256'] = {name: verify.sha256(path) for name, path in inputs.items()}
        freeze = json.loads((images / 'freeze-manifest.json').read_text())
        require(report['input_sha256'] == {name: freeze['files_sha256'][name] for name in inputs},
                'inputs differ from the declared successful freeze')
        report['freeze_manifest_sha256'] = verify.sha256(images / 'freeze-manifest.json')
        shutil.copy2(images / 'freeze-manifest.json', evidence / 'freeze-manifest.json')
        report['source_sha256'] = source_checks(images, evidence)
        report['qemu_version'] = subprocess.check_output([args.qemu, '--version'], text=True, timeout=10)
        rootfs, candidate, a, b, data, payloads = (images / 'rootfs.ext4', *(evidence / name for name in (
            'release-2.ext4', 'slot-a.ext4', 'slot-b.ext4', 'userdata.ext4', 'payloads.ext4')))
        check_filesystem(rootfs)
        verify.sparse_copy(rootfs, candidate)
        marker = evidence / 'marker-2'
        marker.write_text('release-2\n')
        result = subprocess.run(['debugfs', '-w', '-R', 'write marker-2 /etc/rock-update/build-marker', candidate.name],
                                cwd=evidence, capture_output=True, text=True, timeout=30)
        require(result.returncode == 0 and 'Allocated inode' in result.stdout, 'candidate marker was not created')
        require(embedded(candidate, 'etc/rock-update/build-marker') == b'release-2\n', 'candidate marker readback mismatch')
        check_filesystem(candidate)
        fixtures = evidence / 'fixtures'
        fixtures.mkdir()
        envelope = bundle(candidate, fixtures / 'release-2.rock', 2, 'release-2')
        report['candidate_manifest'] = envelope['manifest']
        report['candidate_bundle_sha256'] = verify.sha256(fixtures / 'release-2.rock')
        (evidence / 'candidate-envelope.json').write_text(json.dumps(envelope, indent=2) + '\n')
        verify.sparse_copy(rootfs, a)
        with b.open('xb') as stream:
            stream.truncate(rootfs.stat().st_size)
        with data.open('xb') as stream:
            stream.truncate(128 * 1024 * 1024)
        subprocess.run(['mkfs.ext4', '-q', '-F', '-L', 'rock-auth-ab-data', str(data)], check=True, timeout=60)
        with payloads.open('xb') as stream:
            stream.truncate((fixtures / 'release-2.rock').stat().st_size * 12 // 10 + 64 * 1024 * 1024)
        subprocess.run(['mkfs.ext4', '-q', '-F', '-L', 'rock-auth-ab-fixtures', '-d', str(fixtures), str(payloads)], check=True, timeout=120)
        base = [args.qemu, '-machine', 'virt-10.0,gic-version=3', '-cpu', 'cortex-a53', '-accel', 'tcg',
            '-m', '1024', '-smp', '2', '-nographic', '-monitor', 'none', '-no-reboot', '-nic', 'none',
            '-kernel', str(inputs['Image']), '-initrd', str(inputs['stage0.cpio.gz']),
            '-drive', f'if=none,file={a},format=raw,id=slota', '-device', 'virtio-blk-pci,drive=slota,addr=0x1',
            '-drive', f'if=none,file={data},format=raw,id=userdata', '-device', 'virtio-blk-pci,drive=userdata,addr=0x2',
            '-object', 'rng-random,filename=/dev/urandom,id=rockrng', '-device', 'virtio-rng-pci,rng=rockrng,addr=0x3',
            '-drive', f'if=none,file={b},format=raw,id=slotb', '-device', 'virtio-blk-pci,drive=slotb,addr=0x4',
            '-drive', f'if=none,file={payloads},format=raw,id=fixtures,readonly=on', '-device', 'virtio-blk-pci,drive=fixtures,addr=0x5']
        phases = [('fault-stage', None, 'A sequence=1 reason=committed', '/dev/vda'),
                  ('fault-readback-b', 'confirm.committed_saved', 'B sequence=2 reason=trial', '/dev/vdc'),
                  ('fault-readback-b', None, 'B sequence=2 reason=committed', '/dev/vdc')]
        for number, (phase, fault, selection, device) in enumerate(phases, 1):
            log = evidence / f'boot-{number}.log'
            cmdline = f'console=ttyAMA0 ro rootwait panic=1 rock.ui=headless rock.abtest={phase}'
            if fault:
                cmdline += ' rock.abfault=' + fault
            command = base + ['-append', cmdline]
            marker = 'ROCK_AB_FAULT_READY point=confirm.committed_saved'
            result = {'number': number, 'phase': phase, 'fault': fault, 'command': command,
                      'log': log.name, 'status': 'RUNNING', 'passed': False}
            report['boots'].append(result)
            (evidence / 'report.json').write_text(json.dumps(report, indent=2) + '\n')
            print(f'Authenticator stage0 boot {number}/3; evidence={log}', flush=True)
            result.update(verify.boot(command, log, args.timeout, power_cut=bool(fault), cut_marker=marker.encode()))
            output = log.read_text(errors='replace')
            required = ['ROCK_AB_SELECTED slot=' + selection, 'ROCK_AB_SWITCH_ROOT device=' + device]
            required += [marker] if fault else ['ROCK_AB_HEALTH_CONFIRMED', 'ROCK_AB_PHASE_PASS phase=' + phase]
            if number == 3:
                required.append('ROCK_AB_DURABLE_STATE_RECOVERY_PASS')
            forbidden = ['ROCK_AB_RECOVERY', 'ROCK_AB_TEST_FAIL', 'ROCK_AB_HEALTH_FAILED_REBOOT',
                         'ROCK_AB_WATCHDOG_REBOOT', 'Kernel panic']
            if fault:
                forbidden += ['ROCK_AB_HEALTH_CONFIRMED', 'ROCK_AB_PHASE_PASS']
            result.update(number=number, phase=phase, fault=fault, command=command, log=log.name,
                          missing=[value for value in required if value not in output],
                          forbidden=[value for value in forbidden if value in output])
            result['staged_slot_sha256'] = verify.sha256(b)
            result['passed'] = (not result['missing'] and not result['forbidden']
                                and result['staged_slot_sha256'] == envelope['manifest']['sha256'])
            result['status'] = 'PASS' if result['passed'] else 'FAIL'
            (evidence / 'report.json').write_text(json.dumps(report, indent=2) + '\n')
            require(result['passed'], 'actual guest phase or staged payload verification failed')
        require(report['input_sha256'] == {name: verify.sha256(path) for name, path in inputs.items()}, 'frozen input bytes changed')
        require(report['source_sha256'] == {name: verify.sha256(REPO / name) for name in report['source_sha256']}, 'reviewed verifier or health source changed')
        report.update(status='PASS', authenticator_health_basis='Frozen S97 invokes the UID1000→UID1004 read-only health helper before mark-good; both positive confirmations and the reached committed_saved hook require its success',
                      recovery='Guest selected committed B and checked committed/pending/floor and actual mounted B after the single owned confirmation power cut')
        print('PASS: three authenticator-health stage0 boots; evidence=' + str(evidence), flush=True)
    except BaseException as error:
        report.update(status='FAIL', error=type(error).__name__ + ': ' + str(error))
        raise
    finally:
        report['finished_utc'] = datetime.now(timezone.utc).isoformat()
        report['export_files'] = [name for name in ('report.json', 'freeze-manifest.json', 'factory-envelope.json',
                                  'candidate-envelope.json') if name == 'report.json' or (evidence / name).is_file()]
        report['export_files'] += [f'boot-{number}.log' for number in (1, 2, 3) if (evidence / f'boot-{number}.log').is_file()]
        report['export_files'] += [str(path.relative_to(evidence)) for path in sorted((evidence / 'source-inputs').rglob('*')) if path.is_file()]
        (evidence / 'report.json').write_text(json.dumps(report, indent=2) + '\n')


if __name__ == '__main__':
    main()

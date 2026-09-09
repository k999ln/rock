#!/usr/bin/env python3
"""Real guest fault boundaries and a genuinely full userdata filesystem.

Run after the eight-boot harness passed on the same newly built test images.
Each case provisions fresh disposable disks. The host never edits boot state,
chooses a root slot, or repairs a failed guest filesystem.
"""
import argparse
from datetime import datetime, timezone
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

spec = importlib.util.spec_from_file_location('ab_verify', Path(__file__).with_name('verify-qemu.py'))
verify = importlib.util.module_from_spec(spec)
spec.loader.exec_module(verify)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--artifacts', required=True, type=Path)
    parser.add_argument('--ab-evidence', required=True, type=Path)
    parser.add_argument('--timeout', type=int, default=300)
    parser.add_argument('--qemu', default='qemu-system-aarch64')
    args = parser.parse_args()
    if sys.platform != 'linux':
        raise SystemExit('Run in the authorized Linux build VM')
    for name in (args.qemu, 'mkfs.ext4', 'cp'):
        if not shutil.which(name):
            raise SystemExit('Missing ' + name)
    artifacts, previous = args.artifacts.resolve(), args.ab_evidence.resolve()
    baseline = json.loads((previous / 'report.json').read_text())
    inputs = {name: artifacts / name for name in ('Image', 'rootfs.ext4', 'stage0.cpio.gz')}
    hashes = {name: verify.sha256(path) for name, path in inputs.items()}
    if baseline.get('status') != 'PASS' or hashes != baseline.get('input_sha256'):
        raise SystemExit('The same Image/rootfs/stage0 must already have passed the eight-boot suite')
    fixtures = previous / 'payloads.ext4'
    if not fixtures.is_file() or not (previous / 'release-2.ext4').is_file():
        raise SystemExit('The eight-boot fixture disk and release 2 image are required')
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    evidence = Path(tempfile.mkdtemp(prefix='verify-faults-' + stamp + '-', dir=artifacts))
    report_path = evidence / 'report.json'
    report = {'status': 'RUNNING', 'schema': 'rock-ab-faults/1', 'input_sha256': hashes,
              'baseline_ab_evidence': str(previous), 'started_utc': stamp, 'boots': [],
              'scope': 'actual QEMU ARM64 power-loss boundaries and ENOSPC',
              'blackberry': 'NOT_RUN', 'production_secure_boot': False, 'hardware_antirollback': False,
              'recovery': 'fixed diagnostics and shutdown only; no independent recovery OS or userdata restore'}
    # phase, fault point, expected actual selector message (None before selection)
    cases = [
        ('payload-synced', [('fault-stage', 'install.payload_synced', 'slot=A sequence=1 reason=committed'),
                            ('fault-readback-a', None, 'slot=A sequence=1 reason=committed')]),
        ('pending-saved', [('fault-stage', 'install.pending_saved', 'slot=A sequence=1 reason=committed'),
                           ('fault-readback-b', None, 'slot=B sequence=2 reason=trial')]),
        ('attempts-saved', [('fault-stage', None, 'slot=A sequence=1 reason=committed'),
                            ('fault-readback-b', 'boot.attempts_saved', None),
                            ('fault-readback-b', None, 'slot=B sequence=2 reason=trial')]),
        ('committed-saved', [('fault-stage', None, 'slot=A sequence=1 reason=committed'),
                             ('fault-readback-b', 'confirm.committed_saved', 'slot=B sequence=2 reason=trial'),
                             ('fault-readback-b', None, 'slot=B sequence=2 reason=committed')]),
        ('data-full', [('fault-full-stage', None, 'slot=A sequence=1 reason=committed'),
                       ('fault-full-recover', None, 'slot=A sequence=1 reason=state-write-failed'),
                       ('fault-readback-b', None, 'slot=B sequence=2 reason=trial')]),
    ]
    try:
        number = 0
        for name, steps in cases:
            case = evidence / name
            case.mkdir()
            a, b, data = (case / path for path in ('slot-a.ext4', 'slot-b.ext4', 'userdata.ext4'))
            verify.sparse_copy(inputs['rootfs.ext4'], a)
            with b.open('xb') as stream:
                stream.truncate(a.stat().st_size)
            with data.open('xb') as stream:
                stream.truncate(64 * 1024 * 1024)
            subprocess.run(['mkfs.ext4', '-q', '-F', '-L', 'rock-fault-data', str(data)], check=True)
            base = [args.qemu, '-machine', 'virt-10.0,gic-version=3', '-cpu', 'cortex-a53', '-accel', 'tcg',
                    '-m', '1024', '-smp', '2', '-nographic', '-monitor', 'none', '-no-reboot', '-nic', 'none',
                    '-kernel', str(inputs['Image']), '-initrd', str(inputs['stage0.cpio.gz']),
                    '-drive', f'if=none,file={a},format=raw,id=slota', '-device', 'virtio-blk-pci,drive=slota,addr=0x1',
                    '-drive', f'if=none,file={data},format=raw,id=userdata', '-device', 'virtio-blk-pci,drive=userdata,addr=0x2',
                    '-object', 'rng-random,filename=/dev/urandom,id=rockrng', '-device', 'virtio-rng-pci,rng=rockrng,addr=0x3',
                    '-drive', f'if=none,file={b},format=raw,id=slotb', '-device', 'virtio-blk-pci,drive=slotb,addr=0x4',
                    '-drive', f'if=none,file={fixtures},format=raw,id=fixtures,readonly=on', '-device', 'virtio-blk-pci,drive=fixtures,addr=0x5']
            for phase, fault, selection in steps:
                number += 1
                log = case / f'boot-{number}-{phase}.log'
                cmdline = f'console=ttyAMA0 ro rootwait panic=1 rock.abtest={phase}' + (f' rock.abfault={fault}' if fault else '')
                command = base + ['-append', cmdline]
                print(f'Fault guest boot {number}/13 case={name} phase={phase}; {log}', flush=True)
                marker = ('ROCK_AB_FAULT_READY point=' + fault).encode() if fault else b'unused'
                result = verify.boot(command, log, args.timeout, power_cut=bool(fault), cut_marker=marker)
                output = log.read_text(errors='replace')
                required = [marker.decode()] if fault else ['ROCK_AB_HEALTH_CONFIRMED', 'ROCK_AB_PHASE_PASS phase=' + phase]
                evidence_errors = []
                if selection:
                    required += ['ROCK_AB_SELECTED ' + selection, 'ROCK_AB_SWITCH_ROOT']
                if phase == 'fault-full-stage':
                    required += ['ROCK_AB_DATA_FULL bytes=']
                    try:
                        full = [json.loads(line.split(' ', 1)[1]) for line in output.splitlines()
                                if line.startswith('ROCK_AB_DATA_FULL_PROOF ')]
                        if len(full) != 1 or full[0]['free_blocks'] < 0 or full[0]['available_blocks'] != 0 or not (
                                0 < full[0]['logical_bytes'] == full[0]['allocation_bytes'] <= full[0]['allocated_bytes']):
                            raise ValueError('missing actual allocated-volume capacity evidence')
                        probe = full[0]['state_write_probe']
                        if full[0]['allocation_errno'] != 28 or full[0]['metadata_reserved_clusters'] < 0 or not (
                                probe['errno'] == 28 and probe['state_bytes'] > 0 and
                                len(probe['state_sha256_before']) == 64 and
                                probe['state_sha256_before'] == probe['state_sha256_after']):
                            raise ValueError('missing actual ENOSPC state-write refusal and unchanged-state evidence')
                        result['full_data'] = full[0]
                    except (ValueError, TypeError, KeyError) as error:
                        evidence_errors.append('full-data proof: ' + str(error))
                if phase == 'fault-full-recover':
                    required += ['ROCK_AB_STATE_WRITE_FALLBACK errno=28', 'ROCK_AB_REAL_ENOSPC_FALLBACK_PASS',
                                 'ROCK_AB_EARLY_CAPACITY_RECOVERY ']
                    try:
                        recovered = [json.loads(line.split(' ', 1)[1]) for line in output.splitlines()
                                     if line.startswith('ROCK_AB_EARLY_CAPACITY_RECOVERY ')]
                        if len(recovered) != 1 or not recovered[0]['free_blocks_after'] > recovered[0]['free_blocks_before']:
                            raise ValueError('missing capacity recovery block accounting')
                        result['early_test_capacity_recovery'] = recovered[0]
                    except (ValueError, TypeError, KeyError) as error:
                        evidence_errors.append('recovered-data proof: ' + str(error))
                if fault in ('install.payload_synced', 'install.pending_saved'):
                    if verify.sha256(b) != verify.sha256(previous / 'release-2.ext4'):
                        raise RuntimeError('power loss marker did not follow a durable complete inactive payload')
                    result['inactive_payload_fully_persisted'] = True
                missing = [value for value in required if value not in output] + evidence_errors
                forbidden = [value for value in ('ROCK_AB_RECOVERY', 'ROCK_AB_TEST_FAIL', 'ROCK_AB_EARLY_RECOVERY_FAIL', 'Kernel panic') if value in output]
                report['boots'].append({'number': number, 'case': name, 'phase': phase, 'fault': fault,
                                        'command': command, 'log': str(log.relative_to(evidence)), **result,
                                        'missing': missing, 'forbidden': forbidden, 'passed': not missing and not forbidden})
                report_path.write_text(json.dumps(report, indent=2) + '\n')
                if missing or forbidden:
                    raise RuntimeError(f'Fault case {name} failed: missing={missing}, forbidden={forbidden}')
        if hashes != {name: verify.sha256(path) for name, path in inputs.items()}:
            raise RuntimeError('source OS artifacts changed during fault verification')
        report['status'] = 'PASS'
        print('PASS: 13 real fault-boundary and ENOSPC boots; evidence=' + str(evidence), flush=True)
    except BaseException as error:
        report.update(status='FAIL', error=type(error).__name__ + ': ' + str(error))
        raise
    finally:
        report['finished_utc'] = datetime.now(timezone.utc).isoformat()
        report_path.write_text(json.dumps(report, indent=2) + '\n')


if __name__ == '__main__':
    main()

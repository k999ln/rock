#!/usr/bin/env python3
"""Two actual no-NIC ARM64 boots, persistent cardless-ATM SIMULATOR proof.

Run only on the root-coordinated Linux build VM. Uses owned fresh userdata and
immutable existing OS images; does not build, deploy, or connect to an ATM.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import time


def sha(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def markers(log):
    prefix = 'ROCK_ATM_GUEST_PROOF '
    return [json.loads(line[len(prefix):]) for line in log.replace('\r', '').splitlines() if line.startswith(prefix)]


def command(images, data):
    return ['qemu-system-aarch64', '-machine', 'virt-10.0,gic-version=3', '-accel', 'tcg',
            '-cpu', 'cortex-a53', '-m', '1024', '-smp', '2', '-display', 'none',
            '-serial', 'stdio', '-monitor', 'none', '-no-reboot', '-nic', 'none',
            '-kernel', str(images / 'Image'), '-append',
            'console=ttyAMA0 vt.global_cursor_default=0 root=/dev/vda ro rootflags=noload rootwait panic=-1 rock.atm.verify=1',
            '-drive', f'if=none,file={images / "rootfs.ext4"},format=raw,id=osdisk,readonly=on',
            '-device', 'virtio-blk-pci,drive=osdisk,addr=0x1',
            '-drive', f'if=none,file={data},format=raw,id=userdata', '-device', 'virtio-blk-pci,drive=userdata,addr=0x2',
            '-object', 'rng-random,filename=/dev/urandom,id=rockrng', '-device', 'virtio-rng-pci,rng=rockrng,addr=0x3',
            '-device', 'virtio-gpu-pci,xres=720,yres=960,addr=0x4',
            '-device', 'virtio-keyboard-pci,addr=0x5', '-device', 'virtio-tablet-pci,addr=0x6']


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--artifacts', type=Path, required=True)
    parser.add_argument('--timeout', type=int, default=240)
    args = parser.parse_args()
    if sys.platform != 'linux' or not 60 <= args.timeout <= 600:
        raise SystemExit('requires Linux QEMU environment and bounded 60–600 second per-boot timeout')
    images = args.artifacts.resolve(strict=True)
    evidence = Path(tempfile.mkdtemp(prefix='atm-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '-', dir=images))
    data = evidence / 'userdata.ext4'
    with data.open('xb') as stream:
        stream.truncate(128 * 1024 * 1024)
    data.chmod(0o600)
    subprocess.run(['mkfs.ext4', '-q', '-F', '-L', 'rock-data', str(data)], check=True)
    before = {name: sha(images / name) for name in ('Image', 'rootfs.ext4')}
    report = {'schema': 'rock-os-atm-host-proof/2', 'status': 'RUNNING', 'started_utc': datetime.now(timezone.utc).isoformat(),
              'image_sha256': before, 'simulation_only': True, 'physical_atm': 'NOT_CONNECTED',
              'real_funds': 'NOT_USED', 'network': 'no NIC on both boots', 'guest': [],
              'private_userdata': 'Contains private simulator receipts; do not publish or dump Wallet database.'}
    print('ATM simulator actual-guest evidence: ' + str(evidence), flush=True)
    try:
        for phase in (1, 2):
            log = evidence / f'boot-{phase}.log'
            argv = command(images, data)
            with log.open('wb') as output:
                process = subprocess.Popen(argv, stdin=subprocess.DEVNULL, stdout=output, stderr=subprocess.STDOUT)
                try:
                    deadline = time.monotonic() + args.timeout
                    while process.poll() is None:
                        text = log.read_text(errors='replace')
                        if 'ROCK_ATM_GUEST_FAIL' in text:
                            raise RuntimeError('actual guest ATM checks failed; proof contains no bearer code')
                        if time.monotonic() >= deadline:
                            raise TimeoutError('actual ATM guest exceeded per-boot deadline')
                        time.sleep(.25)
                finally:
                    if process.poll() is None:
                        process.terminate()
                        try:
                            process.wait(timeout=5)
                        except subprocess.TimeoutExpired:
                            process.kill(); process.wait()
            text = log.read_text(errors='replace')
            proofs = markers(text)
            if process.returncode or 'reboot: Power down' not in text:
                raise AssertionError('expected successful normal actual guest poweroff')
            proof_name = '/atm-proof.json' if phase == 1 else '/atm-final-proof.json'
            # Only export the deliberately redacted proof, never the database.
            exported = subprocess.run(['debugfs', '-R', 'cat ' + proof_name, str(data)], capture_output=True, check=True).stdout
            persisted = json.loads(exported)
            if persisted['schema'] != 'rock-os-atm-guest-proof/2' or persisted['status'] != 'PASS' or persisted['phase'] != phase:
                raise AssertionError('expected one successful persisted actual guest proof per boot')
            # The init hook may route helper output to a guest log instead of
            # the serial console. The durable proof is read after real guest
            # shutdown from fresh owned userdata. If serial proof is present,
            # it must agree exactly; do not invent a serial observation.
            if proofs and (len(proofs) != 1 or persisted != proofs[0]):
                raise AssertionError('persisted redacted proof differs from observed guest proof')
            (evidence / f'guest-proof-{phase}.json').write_bytes(exported)
            report['guest'].append({'phase': phase, 'proof': persisted, 'command': argv, 'exit_code': process.returncode,
                                    'proof_observation': 'persistent ext4 redacted proof after normal actual guest poweroff',
                                    'serial_proof_observed': bool(proofs),
                                    'log_sha256': sha(log), 'proof_sha256': hashlib.sha256(exported).hexdigest()})
            print(f'PASS actual ATM simulator guest phase {phase}: {len(persisted["checks"])} checks', flush=True)
        first, second = [item['proof'] for item in report['guest']]
        if first['boot_id'] == second['boot_id'] or second['first_boot_id'] != first['boot_id']:
            raise AssertionError('independent kernel boot identity not proven')
        if first['code_sha256'] != second['code_sha256'] or first['withdrawal_id'] != second['withdrawal_id']:
            raise AssertionError('credential identity did not survive the reboot')
        if second['database']['accounts'].get('WITHDRAW_HOLD') != 0 or second['balances']['dispensed_minor'] != 400:
            raise AssertionError('final ledger mismatch')
        if before != {name: sha(images / name) for name in before}:
            raise AssertionError('immutable OS images changed')
        check = subprocess.run(['e2fsck', '-f', '-n', str(data)], capture_output=True, timeout=30)
        (evidence / 'data-filesystem-check.log').write_bytes(check.stdout + check.stderr)
        if check.returncode:
            raise AssertionError('normal shutdown did not leave consistent userdata')
        report.update(status='PASS', images_unchanged=True, data_filesystem_consistent=True,
                      checks=sum(len(item['proof']['checks']) for item in report['guest']))
    except BaseException as error:
        report.update(status='FAIL', error_type=type(error).__name__)
        raise
    finally:
        report['finished_utc'] = datetime.now(timezone.utc).isoformat()
        (evidence / 'report.json').write_text(json.dumps(report, indent=2) + '\n')


if __name__ == '__main__':
    main()

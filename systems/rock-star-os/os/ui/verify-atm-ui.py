#!/usr/bin/env python3
"""Actual native ATM input, immutable OS and read-only guest evidence."""
import argparse
from datetime import datetime, timezone
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import time


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(filename))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


native = load('rock_atm_native_input', 'verify-native.py')
observer = load('rock_atm_native_observer', 'guest-ui-atm-evidence.py')

# Final native layout centers are supplied by the UI implementation owner.
ATM_ISSUE_CENTER = (360, 697)
ATM_STATUS_CENTER = (360, 782)
ATM_CANCEL_CENTER = (360, 708)


def parse_proof(log):
    lines = log.replace('\r', '').splitlines()
    if 'ROCK_UI_ATM_GUEST_FAIL' in lines:
        raise AssertionError('ATM observer reported failure')
    prefix = 'ROCK_UI_ATM_GUEST_PROOF '
    proofs = [json.loads(line[len(prefix):]) for line in lines if line.startswith(prefix)]
    if len(proofs) != 1 or 'ROCK_UI_ATM_GUEST_PASS' not in lines:
        raise AssertionError('exactly one ATM guest proof and matching PASS marker are required')
    return proofs[0]


def validate_proof(proof):
    require = observer.base.require
    observer.private_fields_absent(proof)
    require(proof['schema'] == 'rock-native-atm-ui-proof/1' and proof['status'] == 'PASS', 'ATM guest did not pass')
    require(proof['blackberry'] == 'NOT_RUN' and proof['real_money'] == 'NOT_RUN' and
            proof['real_atm'] == proof['real_identity'] == 'NOT_CONNECTED' and proof['atm_actor_assertions'] == 0 and
            proof['raw_code_in_evidence'] is False, 'simulator, actor or credential privacy scope differs')
    observer.base.wallet_baseline(proof['wallet_initial'])
    observer.membership_contract(proof['wallet_initial'])
    require(proof['wallet_initial']['membership']['registered'] is False and proof['registration_without_consent'] is True,
            'registration implicitly granted billing consent')
    require(observer.validate_final(proof['wallet_final'], proof['database']) == proof['receipts'], 'durable ATM receipts differ')
    require(proof['initial_hub_sha256'] == proof['final_hub_sha256'] and proof['tool_state_unchanged'] is True,
            'ATM flow changed installed Tools or jobs')
    require([row['stage'] for row in proof['stages']] == list(range(6)) and proof['capture_grace_seconds'] == 30,
            'actual native stages or final observation window are incomplete')
    expected = [(0, 0, 0), (0, 0, 0), (0, 5000, 0), (5000, 0, 0), (4000, 0, 1000), (5000, 0, 0)]
    require([(row['available_minor'], row['pending_minor'], row['held_minor']) for row in proof['stages']] == expected,
            'intermediate actual ledger states differ')
    issuance = proof['issuance_observed']
    require(issuance['wallet']['held_minor'] == 1000 and issuance['wallet']['available_minor'] == 4000 and
            issuance['credential']['state'] == 'ISSUED' and issuance['credential']['consumed_at'] is None and
            issuance['credential']['code_sha256'] == proof['receipts']['credential']['code_sha256'],
            'initial issuance and final cancellation are different credentials')
    for environment in (proof['environment_initial'], proof['environment_final']):
        require(environment['framebuffer'] == [720, 960] and 'QEMU Virtio Keyboard' in environment['evdev_names'] and
                'QEMU Virtio Tablet' in environment['evdev_names'], 'real native display/input devices are missing')
        require(environment['hardware_network_interfaces'] == [] and set(environment['network_interfaces']) <= {'lo', 'dummy0', 'sit0'},
                'ATM test unexpectedly used a network adapter')
        require('ro' in environment['root_mount'][3].split(',') and
                {'rw', 'nosuid', 'nodev', 'noexec'} <= set(environment['data_mount'][3].split(',')), 'guest mount protection differs')
        for name, uid in {'ui': 1000, 'core': 1000, 'platform': 1002, 'wallet': 1003}.items():
            process = environment['processes'][name]
            require(process['uid'] == process['gid'] == [uid] * 4 and process['no_new_privs'] == 1, 'dedicated service identity differs')
    require(proof['environment_initial']['processes'] == proof['environment_final']['processes'], 'service restarted during UI sequence')


def disk_evidence(data, proof, public_text):
    """Read stopped private disk; transient copies are never retained in evidence."""
    import sqlite3
    from contextlib import closing
    from unittest.mock import patch
    with tempfile.TemporaryDirectory(prefix='rock-atm-private-inspection-') as temporary:
        directory = Path(temporary)
        for name in ('entitlement.db', 'wallet-simulator.db'):
            for suffix in ('', '-wal'):
                destination = directory / (name + suffix)
                result = subprocess.run(['debugfs', '-R', f'dump /wallet/{name}{suffix} {destination}', str(data)],
                                        capture_output=True, timeout=20)
                if suffix == '' and (result.returncode != 0 or not destination.is_file()):
                    raise AssertionError('private database unavailable after shutdown')
                if destination.exists():
                    destination.chmod(0o600)
        with patch.object(observer, 'ENTITLEMENT_DB', str(directory / 'entitlement.db')), \
                patch.object(observer, 'LEDGER_DB', str(directory / 'wallet-simulator.db')):
            actual = observer.database_evidence()
        if actual != proof['database']:
            raise AssertionError('independent stopped-disk state differs from guest proof')
        with closing(sqlite3.connect('file:' + str(directory / 'wallet-simulator.db') + '?mode=ro', uri=True)) as db:
            db.execute('PRAGMA query_only=ON')
            rows = db.execute("SELECT result_json FROM wallet_idempotency WHERE operation='atm.issue'").fetchall()
            if len(rows) != 1:
                raise AssertionError('private disk contains a different issuance count')
            private = json.loads(rows[0][0])
            redacted = observer.redact_issuance(private)
            if private['code'] in public_text or redacted != proof['receipts']['ledger'][2]['result']:
                raise AssertionError('private issuance proof or public-output privacy differs')
        return {'database_matches_guest_proof': True, 'private_database_copies_retained': False,
                'code_absent_from_text_evidence': True, 'code_sha256': redacted['code_sha256'],
                'data_sha256_after_shutdown': native.digest_file(data)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--artifacts', type=Path, required=True)
    args = parser.parse_args()
    if any(center is None for center in (ATM_ISSUE_CENTER, ATM_STATUS_CENTER, ATM_CANCEL_CENTER)):
        parser.error('native ATM geometry has not been confirmed; no guest will start')
    if sys.platform != 'linux':
        parser.error('run on the Linux QEMU build host')
    artifacts = args.artifacts.resolve(strict=True)
    kernel, rootfs = artifacts / 'Image', artifacts / 'rootfs.ext4'
    if not kernel.is_file() or not rootfs.is_file():
        parser.error('frozen Image and rootfs.ext4 are required')
    evidence = Path(tempfile.mkdtemp(prefix='atm-ui-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '-', dir=artifacts))
    data, log = evidence / 'userdata.ext4', evidence / 'boot.log'
    before = {path.name: native.digest_file(path) for path in (kernel, rootfs)}
    report = {'schema': 'rock-native-atm-ui-harness/1', 'status': 'RUNNING', 'started_utc': datetime.now(timezone.utc).isoformat(),
              'scope': 'actual native ARM64 framebuffer/evdev input and closed simulator ATM',
              'blackberry': 'NOT_RUN', 'real_money': 'NOT_RUN', 'real_atm': 'NOT_CONNECTED', 'real_identity': 'NOT_CONNECTED',
              'code_reveal_actions_sent': 0, 'atm_actor_actions_sent': 0, 'image_sha256_before': before, 'input_events': [], 'screenshots': []}
    process, monitor = None, None
    print('Native ATM GUI evidence: ' + str(evidence), flush=True)
    try:
        with data.open('xb') as stream:
            stream.truncate(128 * 1024 * 1024)
        subprocess.run(['mkfs.ext4', '-q', '-F', '-L', 'rock-data', str(data)], check=True, timeout=30)
        with tempfile.TemporaryDirectory(prefix='rock-atm-qmp-') as temporary:
            qmp = Path(temporary) / 'qmp.sock'
            command = ['qemu-system-aarch64', '-machine', 'virt-10.0,gic-version=3', '-accel', 'tcg', '-cpu', 'cortex-a53',
                       '-m', '1024', '-smp', '2', '-display', 'none', '-serial', 'stdio', '-monitor', 'none',
                       '-qmp', f'unix:{qmp},server=on,wait=off', '-no-reboot', '-nic', 'none', '-kernel', str(kernel), '-append',
                       'console=ttyAMA0 vt.global_cursor_default=0 root=/dev/vda ro rootflags=noload rootwait panic=-1 rock.ui.atm.verify=1',
                       '-drive', f'if=none,file={rootfs},format=raw,id=osdisk,readonly=on', '-device', 'virtio-blk-pci,drive=osdisk,addr=0x1',
                       '-drive', f'if=none,file={data},format=raw,id=userdata', '-device', 'virtio-blk-pci,drive=userdata,addr=0x2',
                       '-object', 'rng-random,filename=/dev/urandom,id=rockrng', '-device', 'virtio-rng-pci,rng=rockrng,addr=0x3',
                       '-device', 'virtio-gpu-pci,xres=720,yres=960,addr=0x4', '-device', 'virtio-keyboard-pci,addr=0x5',
                       '-device', 'virtio-tablet-pci,addr=0x6']
            report['command'] = command
            with log.open('wb') as output:
                process = subprocess.Popen(command, stdin=subprocess.DEVNULL, stdout=output, stderr=subprocess.STDOUT)
                deadline = time.monotonic() + 10
                while not qmp.exists():
                    if process.poll() is not None or time.monotonic() >= deadline:
                        raise RuntimeError('QEMU monitor did not start')
                    time.sleep(0.1)
                monitor = native.Monitor(qmp)
                ui = native.NativeInput(monitor, evidence, report)
                def wait_marker(marker, seconds=25):
                    deadline = time.monotonic() + seconds
                    while time.monotonic() < deadline:
                        content = log.read_text(errors='replace').replace('\r', '')
                        if 'ROCK_UI_ATM_GUEST_FAIL' in content:
                            raise AssertionError('ATM observer failed; inspect boot.log')
                        if any(line == marker or line.startswith(marker + ' ') for line in content.splitlines()):
                            return
                        if process.poll() is not None:
                            raise RuntimeError('guest stopped before ' + marker)
                        time.sleep(0.2)
                    raise TimeoutError('missing actual ATM stage: ' + marker)
                def wallet_home():
                    ui.click(606, 913)
                    time.sleep(1.5)
                wait_marker('ROCK_UI_ATM_OBSERVER_READY', 180)
                time.sleep(3)
                wallet_home()
                ui.capture('00-unregistered-zero-wallet')
                ui.click(360, 417)
                wait_marker('ROCK_UI_ATM_REGISTERED')
                time.sleep(3)
                wallet_home()
                ui.capture('01-registered-no-billing-consent')
                for _ in range(3):
                    ui.keys(['pgdn'])
                ui.click(360, 807)
                for _ in range(2):
                    ui.keys(['pgdn'])
                ui.click(250, 443)
                ui.keys(['ctrl', 'a'])
                ui.type('50.00')
                time.sleep(1.2)
                ui.capture('02-native-test-credit-amount')
                ui.click(195, 521)
                wait_marker('ROCK_UI_ATM_CREDIT_PENDING')
                time.sleep(3)
                ui.capture('03-actual-unsettled-credit')
                ui.click(560, 700)
                wait_marker('ROCK_UI_ATM_CREDIT_SETTLED')
                time.sleep(3)
                ui.capture('04-actual-settled-5000')
                ui.click(531, 27)
                time.sleep(2)
                ui.capture('05-owner-atm-before-issue')
                ui.click(*ATM_ISSUE_CENTER)
                time.sleep(0.5)
                ui.capture('06-owner-issue-confirmation')
                ui.click(497, 577)
                wait_marker('ROCK_UI_ATM_ISSUED')
                time.sleep(3)
                ui.capture('07-issued-1000-held-code-hidden')
                ui.click(*ATM_STATUS_CENTER)
                time.sleep(2)
                ui.capture('08-current-owner-status-code-hidden')
                ui.click(*ATM_CANCEL_CENTER)
                wait_marker('ROCK_UI_ATM_CANCELED')
                time.sleep(3)
                ui.capture('09-canceled-code-unusable')
                wallet_home()
                time.sleep(1)
                ui.keys(['pgdn'])
                ui.capture('10-wallet-5000-returned-zero-held')
                monitor.close()
                monitor = None
                process.wait(timeout=75)
                report['exit_code'] = process.returncode
                if process.returncode != 0:
                    raise RuntimeError('QEMU exited abnormally')
            proof = parse_proof(log.read_text(errors='replace'))
            validate_proof(proof)
            if 'reboot: Power down' not in log.read_text(errors='replace'):
                raise AssertionError('normal guest init shutdown was not observed')
            disk = subprocess.run(['debugfs', '-R', 'cat /ui-atm-proof.json', str(data)], capture_output=True, check=True, timeout=20)
            if json.loads(disk.stdout) != proof:
                raise AssertionError('durable ATM proof differs from serial')
            (evidence / 'ui-atm-proof.json').write_text(json.dumps(proof, ensure_ascii=False, indent=2) + '\n')
            if {path.name: native.digest_file(path) for path in (kernel, rootfs)} != before or len(report['screenshots']) != 11:
                raise AssertionError('immutable images changed or native captures are incomplete')
            report['stopped_disk'] = disk_evidence(data, proof, log.read_text(errors='replace') + json.dumps(report) + json.dumps(proof))
            checked = subprocess.run(['e2fsck', '-fn', str(data)], capture_output=True, timeout=30)
            (evidence / 'filesystem-check.log').write_bytes(checked.stdout + checked.stderr)
            if checked.returncode != 0:
                raise AssertionError('stopped private ext4 did not pass the read-only filesystem check')
            report['normal_init_shutdown'] = True
            report['power_ui_used'] = False
            report['filesystem_check_exit_code'] = checked.returncode
            report.update(status='PASS', durable_guest_proof_matches_serial=True, guest_proof_sha256=observer.base.digest(proof))
            print('PASS actual native owner ATM registration, 5000-cent settlement, one 1000-cent hold and unconsumed cancellation; code hidden', flush=True)
    except BaseException as error:
        report.update(status='FAIL', error=type(error).__name__ + ': ' + str(error))
        # Never take an unplanned failure frame that could contain a credential.
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
                process.wait(timeout=5)
        report['image_sha256_after'] = {path.name: native.digest_file(path) for path in (kernel, rootfs)}
        report['finished_utc'] = datetime.now(timezone.utc).isoformat()
        (evidence / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')


if __name__ == '__main__':
    main()

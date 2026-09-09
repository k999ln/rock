#!/usr/bin/env python3
"""Actual native Wallet input, immutable OS and read-only guest evidence."""
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


native = load('rock_wallet_native_input', 'verify-native.py')
observer = load('rock_wallet_native_observer', 'guest-ui-wallet-evidence.py')


def validate_proof(proof):
    require = observer.base.require
    require(proof['schema'] == 'rock-native-wallet-ui-proof/1' and proof['status'] == 'PASS', 'Wallet guest did not pass')
    require(proof['blackberry'] == 'NOT_RUN' and proof['real_money'] == 'NOT_RUN' and proof['real_identity'] == 'NOT_CONNECTED',
            'Wallet evidence must retain simulator and physical-device limits')
    observer.base.wallet_baseline(proof['wallet_initial'])
    observer.membership_contract(proof['wallet_initial'])
    require(proof['wallet_initial']['membership']['registered'] is False and proof['registration_without_consent'] is True,
            'registration and consent were not observed separately')
    require(observer.validate_final(proof['wallet_final'], proof['database']) == proof['receipts'], 'Wallet receipt validation differs')
    require(proof['initial_hub_sha256'] == proof['final_hub_sha256'] and proof['tool_state_unchanged'] is True,
            'Wallet test changed installed Tools or jobs')
    require([row['stage'] for row in proof['stages']] == list(range(8)) and proof['capture_grace_seconds'] == 30,
            'actual native stages or final observation window are incomplete')
    for environment in (proof['environment_initial'], proof['environment_final']):
        require(environment['framebuffer'] == [720, 960] and 'QEMU Virtio Keyboard' in environment['evdev_names'] and
                'QEMU Virtio Tablet' in environment['evdev_names'], 'real native display/input devices are missing')
        require(environment['hardware_network_interfaces'] == [] and set(environment['network_interfaces']) <= {'lo', 'dummy0', 'sit0'},
                'Wallet test unexpectedly used a network adapter')
        require('ro' in environment['root_mount'][3].split(',') and
                {'rw', 'nosuid', 'nodev', 'noexec'} <= set(environment['data_mount'][3].split(',')), 'guest mount protection differs')
        for name, uid in {'ui': 1000, 'core': 1000, 'platform': 1002, 'wallet': 1003}.items():
            process = environment['processes'][name]
            require(process['uid'] == process['gid'] == [uid] * 4 and process['no_new_privs'] == 1, 'dedicated service identity differs')
    require(proof['environment_initial']['processes'] == proof['environment_final']['processes'], 'service restarted during UI sequence')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--artifacts', type=Path, required=True)
    args = parser.parse_args()
    if sys.platform != 'linux':
        parser.error('run on the Linux QEMU build host')
    artifacts = args.artifacts.resolve(strict=True)
    kernel, rootfs = artifacts / 'Image', artifacts / 'rootfs.ext4'
    if not kernel.is_file() or not rootfs.is_file():
        parser.error('frozen Image and rootfs.ext4 are required')
    evidence = Path(tempfile.mkdtemp(prefix='wallet-ui-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '-', dir=artifacts))
    data, log = evidence / 'userdata.ext4', evidence / 'boot.log'
    before = {path.name: native.digest_file(path) for path in (kernel, rootfs)}
    report = {'schema': 'rock-native-wallet-ui-harness/1', 'status': 'RUNNING', 'started_utc': datetime.now(timezone.utc).isoformat(),
              'scope': 'actual native ARM64 framebuffer/evdev input and closed simulator Wallet',
              'blackberry': 'NOT_RUN', 'real_money': 'NOT_RUN', 'real_identity': 'NOT_CONNECTED',
              'image_sha256_before': before, 'input_events': [], 'screenshots': []}
    process, monitor = None, None
    print('Native Wallet GUI evidence: ' + str(evidence), flush=True)
    try:
        with data.open('xb') as stream:
            stream.truncate(128 * 1024 * 1024)
        subprocess.run(['mkfs.ext4', '-q', '-F', '-L', 'rock-data', str(data)], check=True, timeout=30)
        with tempfile.TemporaryDirectory(prefix='rock-wallet-qmp-') as temporary:
            qmp = Path(temporary) / 'qmp.sock'
            command = ['qemu-system-aarch64', '-machine', 'virt-10.0,gic-version=3', '-accel', 'tcg', '-cpu', 'cortex-a53',
                       '-m', '1024', '-smp', '2', '-display', 'none', '-serial', 'stdio', '-monitor', 'none',
                       '-qmp', f'unix:{qmp},server=on,wait=off', '-no-reboot', '-nic', 'none', '-kernel', str(kernel), '-append',
                       'console=ttyAMA0 vt.global_cursor_default=0 root=/dev/vda ro rootflags=noload rootwait panic=-1 rock.ui.wallet.verify=1',
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
                        if 'ROCK_UI_WALLET_GUEST_FAIL' in content:
                            raise AssertionError('Wallet observer failed; inspect boot.log')
                        if any(line == marker or line.startswith(marker + ' ') for line in content.splitlines()):
                            return
                        if process.poll() is not None:
                            raise RuntimeError('guest stopped before ' + marker)
                        time.sleep(0.2)
                    raise TimeoutError('missing actual Wallet stage: ' + marker)
                def wallet_home():
                    ui.click(606, 913)
                    time.sleep(1.5)
                wait_marker('ROCK_UI_WALLET_OBSERVER_READY', 180)
                time.sleep(3)
                wallet_home()
                ui.capture('00-unregistered-zero-wallet')
                ui.click(360, 417)
                wait_marker('ROCK_UI_WALLET_REGISTERED')
                time.sleep(3)
                wallet_home()
                ui.capture('01-registered-without-consent')
                ui.click(360, 616)
                wait_marker('ROCK_UI_WALLET_CONSENTED')
                time.sleep(3)
                wallet_home()
                ui.capture('02-explicit-consent-before-credit')
                # Before expansion, the final action is anchored above the nav
                # when PageDown reaches the content end, including error text.
                for _ in range(3):
                    ui.keys(['pgdn'])
                ui.click(360, 807)
                for _ in range(2):
                    ui.keys(['pgdn'])
                ui.capture('03-simulator-controls')
                ui.click(250, 443)
                ui.keys(['ctrl', 'a'])
                ui.type('20.00')
                time.sleep(1.2)
                ui.capture('04-native-test-amount-input')
                ui.click(195, 521)
                wait_marker('ROCK_UI_WALLET_CREDIT_PENDING')
                time.sleep(3)
                ui.capture('05-actual-unsettled-credit')
                ui.click(560, 700)
                wait_marker('ROCK_UI_WALLET_CREDIT_SETTLED')
                time.sleep(3)
                ui.capture('06-actual-settlement')
                wallet_home()
                ui.click(360, 679)
                wait_marker('ROCK_UI_WALLET_BILLED_ONCE')
                time.sleep(3)
                wallet_home()
                ui.capture('07-888-test-fee-paid')
                ui.click(360, 679)
                wait_marker('ROCK_UI_WALLET_BILL_REPEATED_ONCE')
                time.sleep(3)
                wallet_home()
                ui.capture('08-second-request-still-one-bill')
                ui.click(360, 616)
                wait_marker('ROCK_UI_WALLET_CANCELED')
                time.sleep(3)
                wallet_home()
                ui.capture('09-renewal-canceled-paid-period-kept')
                ui.keys(['pgdn'])
                time.sleep(1.2)
                ui.capture('10-actual-1112-test-balance')
                monitor.close()
                monitor = None
                process.wait(timeout=60)
                report['exit_code'] = process.returncode
                if process.returncode != 0:
                    raise RuntimeError('QEMU exited abnormally')
            prefix = 'ROCK_UI_WALLET_GUEST_PROOF '
            proofs = [json.loads(line[len(prefix):]) for line in log.read_text(errors='replace').replace('\r', '').splitlines() if line.startswith(prefix)]
            if len(proofs) != 1:
                raise AssertionError('exactly one Wallet guest proof is required')
            proof = proofs[0]
            validate_proof(proof)
            disk = subprocess.run(['debugfs', '-R', 'cat /ui-wallet-proof.json', str(data)], capture_output=True, check=True, timeout=20)
            if json.loads(disk.stdout) != proof:
                raise AssertionError('durable Wallet proof differs from serial')
            (evidence / 'ui-wallet-proof.json').write_text(json.dumps(proof, ensure_ascii=False, indent=2) + '\n')
            if {path.name: native.digest_file(path) for path in (kernel, rootfs)} != before or len(report['screenshots']) != 11:
                raise AssertionError('immutable images changed or native captures are incomplete')
            report.update(status='PASS', durable_guest_proof_matches_serial=True, guest_proof_sha256=observer.base.digest(proof))
            print('PASS actual native Wallet registration, explicit consent, simulator settlement, exact 888 fee once and cancellation', flush=True)
    except BaseException as error:
        report.update(status='FAIL', error=type(error).__name__ + ': ' + str(error))
        if monitor and process is not None and process.poll() is None:
            try:
                monitor.command('screendump', {'filename': str(evidence / 'failure-display.png'), 'format': 'png'})
            except (OSError, RuntimeError, ValueError):
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
                process.wait(timeout=5)
        report['image_sha256_after'] = {path.name: native.digest_file(path) for path in (kernel, rootfs)}
        report['finished_utc'] = datetime.now(timezone.utc).isoformat()
        (evidence / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')


if __name__ == '__main__':
    main()

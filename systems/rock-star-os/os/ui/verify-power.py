#!/usr/bin/env python3
"""Native GUI cancellation, normal reboot and shutdown with independent evidence."""
import argparse
from contextlib import closing
from datetime import datetime, timezone
import importlib.util
import json
from pathlib import Path
import socket
import sqlite3
import struct
import subprocess
import sys
import tempfile
import threading
import time


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(filename))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


native = load('rock_power_native', 'verify-native.py')
guest = load('rock_power_observer', 'guest-ui-power-evidence.py')


def markers(content, name):
    prefix = name + ' '
    return [json.loads(line[len(prefix):]) for line in content.replace('\r', '').splitlines() if line.startswith(prefix)]


def pending_receipt(content, phase):
    observed = [item for item in markers(content, 'ROCK_UI_POWER_REQUEST_OBSERVED') if item.get('phase') == phase]
    if not observed or observed[-1].get('status') != 'pending':
        return None
    receipt = observed[-1].get('receipt', {})
    result = receipt.get('result', {})
    if (receipt.get('ok') is not True or result.get('accepted') is not True or
            result.get('op') != ('reboot' if phase == 1 else 'poweroff') or
            type(result.get('key')) is not str or not result['key'].startswith('ui-')):
        raise AssertionError('invalid pending power receipt')
    return result


class Monitor:
    """One reader retains actual QMP events while bounded input calls wait."""
    ALLOWED = {'qmp_capabilities', 'query-status', 'input-send-event', 'send-key', 'screendump'}

    def __init__(self, path, report):
        self.report, self.sequence, self.replies = report, 0, {}
        self.condition, self.closed, self.error = threading.Condition(), False, None
        self.connection = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.connection.settimeout(5)
        self.connection.connect(str(path))
        self.stream = self.connection.makefile('rwb', buffering=0)
        if 'QMP' not in self.read():
            raise RuntimeError('QMP greeting missing')
        self.connection.settimeout(None)
        self.reader = threading.Thread(target=self.read_loop, daemon=True)
        self.reader.start()
        self.command('qmp_capabilities')

    def read(self):
        raw = self.stream.readline(65537)
        if not raw or len(raw) > 65536:
            raise EOFError('QMP closed or exceeded frame limit')
        return json.loads(raw)

    def read_loop(self):
        try:
            while True:
                message = self.read()
                with self.condition:
                    if 'event' in message:
                        self.report['qmp_events'].append({'observed_unix': time.time(), **message})
                    elif 'id' in message:
                        self.replies[message['id']] = message
                    self.condition.notify_all()
        except (EOFError, OSError, ValueError) as error:
            with self.condition:
                self.closed, self.error = True, str(error)
                self.condition.notify_all()

    def command(self, operation, arguments=None):
        if operation not in self.ALLOWED:
            raise ValueError('native power harness may send only input, capture and status commands')
        with self.condition:
            self.sequence += 1
            identity = 'ui-power-' + str(self.sequence)
            self.report['qmp_commands'].append(operation)
            self.stream.write(json.dumps({'execute': operation, 'arguments': arguments or {}, 'id': identity}).encode() + b'\n')
            deadline = time.monotonic() + 5
            while identity not in self.replies:
                if self.closed:
                    raise RuntimeError(self.error)
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    raise TimeoutError('QMP command response timed out')
                self.condition.wait(remaining)
            result = self.replies.pop(identity)
            if 'error' in result:
                raise RuntimeError(str(result['error']))
            return result.get('return')

    def close(self):
        try:
            self.connection.shutdown(socket.SHUT_RDWR)
        except OSError:
            pass
        self.reader.join(timeout=2)
        self.stream.close()
        self.connection.close()


def validate(proof, rows, boots, events):
    require = guest.base.require
    require(proof['schema'] == 'rock-native-power-ui-proof/1' and proof['phase'] == 2 and
            proof['status'] == 'AWAITING_ACTUAL_POWER_EVENTS' and proof['observer_mutations'] == 0 and
            proof['blackberry'] == proof['real_money'] == 'NOT_RUN', 'unexpected power observer scope or phase')
    require(len(boots) == 2 and [item['phase'] for item in boots] == [1, 2] and
            boots[0]['boot_id'] == proof['first_boot_id'] and boots[1]['boot_id'] == proof['second_boot_id'] and
            proof['first_boot_id'] != proof['second_boot_id'], 'two actual kernel boot identities are required')
    require(len(rows) == 2 and rows[0]['key'] != rows[1]['key'], 'exactly two distinct native power actions are required')
    for index, operation in enumerate(('reboot', 'poweroff')):
        guest.validate_record(rows[index], operation, boots[index]['boot_id'], dispatched=True)
    require(rows[0] == proof['first_dispatch'], 'durable previous-boot dispatch differs')
    last = proof['last_observed_request']
    for name in ('key', 'operation', 'boot_id', 'instance', 'request_json', 'receipt_json', 'created_unix'):
        require(last[name] == rows[1][name], 'shutdown receipt differs from independently observed request')
    require(guest.base.wallet_baseline(proof['wallet_initial']) == proof['wallet_initial_sha256'] ==
            guest.base.wallet_baseline(proof['wallet_second']) == proof['wallet_second_sha256'] and
            proof['hub_initial_sha256'] == proof['hub_second_sha256'], 'native power actions changed Wallet or Tools')
    for environment in (proof['environment_first'], proof['environment_second']):
        require(environment['framebuffer'] == [720, 960] and environment['hardware_network_interfaces'] == [] and
                set(environment['network_interfaces']) <= {'lo', 'dummy0', 'sit0'} and
                'QEMU Virtio Keyboard' in environment['evdev_names'] and 'QEMU Virtio Tablet' in environment['evdev_names'],
                'unexpected native display, input or network devices')
        require('ro' in environment['root_mount'][3].split(',') and
                {'rw', 'nosuid', 'nodev', 'noexec'} <= set(environment['data_mount'][3].split(',')), 'mount protections differ')
        for name, uid in {'ui': 1000, 'core': 1000, 'platform': 1002, 'wallet': 1003}.items():
            item = environment['processes'][name]
            require(item['uid'] == item['gid'] == [uid] * 4 and item['no_new_privs'] == 1, 'native service identity differs')
        require(environment['power_process']['uid'] == environment['power_process']['gid'] == [0] * 4, 'power daemon is not root')
    require(len([e for e in events if e['event'] == 'RESET' and e.get('data', {}).get('guest') is True]) == 1 and
            len([e for e in events if e['event'] == 'SHUTDOWN' and e.get('data', {}).get('guest') is True]) == 1,
            'QMP must independently observe exactly one guest reset and one guest shutdown')




def export_closed_database(data, source, destination):
    subprocess.run(['debugfs', '-R', f'dump {source} {destination}', str(data)], capture_output=True, check=True, timeout=20)
    if not destination.is_file():
        raise AssertionError('post-shutdown database is missing: ' + source)
    # Do not silently inspect an old main DB while committed WAL or a hot
    # rollback journal contains newer business state. Normal close must finish
    # checkpoint/recovery before this clean-shutdown evidence can pass.
    for suffix in ('-wal', '-journal'):
        sidecar = destination.with_name(destination.name + suffix)
        result = subprocess.run(['debugfs', '-R', f'dump {source + suffix} {sidecar}', str(data)],
                                capture_output=True, check=True, timeout=20)
        if sidecar.exists():
            if sidecar.stat().st_size:
                raise AssertionError('normal shutdown left a nonempty SQLite sidecar: ' + source + suffix)
        elif b'File not found' not in result.stderr:
            raise AssertionError('could not verify absence of SQLite sidecar: ' + source + suffix)

def verify_business_databases(data, output):
    """Inspect fixed post-shutdown business rows; never open userdata writable."""
    sources = {
        'hub': ('/platform/hub.db', ('hub_packages', 'hub_installed', 'hub_revoked', 'hub_jobs', 'hub_audit', 'hub_requests')),
        'wallet': ('/wallet/wallet-simulator.db', ('wallet_journals', 'wallet_postings', 'wallet_sales', 'wallet_withdrawals',
                                                  'wallet_consents', 'wallet_bills', 'wallet_idempotency')),
        'membership': ('/wallet/entitlement.db', ('accounts', 'consents', 'authorizations', 'authorization_claims',
                                                'wallet_bindings', 'device_api_receipts', 'device_monthly_due')),
    }
    result = {}
    for name, (source, tables) in sources.items():
        destination = output / ('observed-' + name + '.db')
        export_closed_database(data, source, destination)
        with closing(sqlite3.connect(f'file:{destination}?mode=ro', uri=True)) as db:
            db.execute('PRAGMA query_only=ON')
            if db.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
                raise AssertionError('post-shutdown business database integrity failed: ' + name)
            counts = {table: db.execute('SELECT COUNT(*) FROM ' + table).fetchone()[0] for table in tables}
            if any(counts.values()):
                raise AssertionError('native power GUI altered fresh Tool/Wallet business rows: ' + str(counts))
            result[name] = {'integrity': 'ok', 'row_counts': counts, 'sha256': native.digest_file(destination)}
    return result

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--artifacts', type=Path, required=True)
    args = parser.parse_args()
    if sys.platform != 'linux':
        parser.error('run on the isolated Linux QEMU build host')
    artifacts = args.artifacts.resolve(strict=True)
    kernel, rootfs = artifacts / 'Image', artifacts / 'rootfs.ext4'
    if not kernel.is_file() or not rootfs.is_file():
        parser.error('frozen kernel and rootfs are required')
    output = Path(tempfile.mkdtemp(prefix='power-ui-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '-', dir=artifacts))
    data, log = output / 'userdata.ext4', output / 'boot.log'
    before = {p.name: native.digest_file(p) for p in (kernel, rootfs)}
    report = {'schema': 'rock-native-power-ui-harness/1', 'status': 'RUNNING', 'started_utc': datetime.now(timezone.utc).isoformat(),
              'scope': 'actual evdev UI -> platform -> root daemon -> normal init, two boots',
              'blackberry': 'NOT_RUN', 'real_money': 'NOT_RUN', 'image_sha256_before': before,
              'input_events': [], 'screenshots': [], 'qmp_events': [], 'qmp_commands': []}
    process, monitor = None, None
    print('Native power GUI evidence: ' + str(output), flush=True)
    try:
        with data.open('xb') as stream:
            stream.truncate(128 * 1024 * 1024)
        subprocess.run(['mkfs.ext4', '-q', '-F', '-L', 'rock-data', str(data)], check=True, timeout=30)
        with tempfile.TemporaryDirectory(prefix='rock-power-ui-qmp-') as temporary:
            qmp = Path(temporary) / 'qmp.sock'
            command = ['qemu-system-aarch64', '-machine', 'virt-10.0,gic-version=3', '-accel', 'tcg', '-cpu', 'cortex-a53',
                       '-m', '1024', '-smp', '2', '-display', 'none', '-serial', 'stdio', '-monitor', 'none',
                       '-qmp', f'unix:{qmp},server=on,wait=off', '-nic', 'none', '-kernel', str(kernel), '-append',
                       'console=ttyAMA0 vt.global_cursor_default=0 root=/dev/vda ro rootflags=noload rootwait panic=-1 rock.ui.power.verify=1',
                       '-drive', f'if=none,file={rootfs},format=raw,id=osdisk,readonly=on', '-device', 'virtio-blk-pci,drive=osdisk,addr=0x1',
                       '-drive', f'if=none,file={data},format=raw,id=userdata', '-device', 'virtio-blk-pci,drive=userdata,addr=0x2',
                       '-object', 'rng-random,filename=/dev/urandom,id=rockrng', '-device', 'virtio-rng-pci,rng=rockrng,addr=0x3',
                       '-device', 'virtio-gpu-pci,xres=720,yres=960,addr=0x4', '-device', 'virtio-keyboard-pci,addr=0x5',
                       '-device', 'virtio-tablet-pci,addr=0x6']
            report['command'] = command
            with log.open('wb') as stream:
                process = subprocess.Popen(command, stdin=subprocess.DEVNULL, stdout=stream, stderr=subprocess.STDOUT)
                deadline = time.monotonic() + 15
                while not qmp.exists():
                    if process.poll() is not None or time.monotonic() >= deadline:
                        raise RuntimeError('QEMU monitor did not start')
                    time.sleep(0.1)
                monitor = Monitor(qmp, report)
                ui = native.NativeInput(monitor, output, report)
                def wait_for(predicate, message, timeout=180, retry_phase=None):
                    deadline = time.monotonic() + timeout
                    retry_after = time.monotonic() + 20
                    retried = False
                    while time.monotonic() < deadline:
                        content = log.read_text(errors='replace')
                        if 'ROCK_UI_POWER_GUEST_FAIL' in content:
                            raise AssertionError('power observer failed; inspect boot.log')
                        if predicate(content):
                            return content
                        if process.poll() is not None:
                            raise RuntimeError('guest stopped before ' + message)
                        if retry_phase and not retried and time.monotonic() >= retry_after:
                            pending = pending_receipt(content, retry_phase)
                            already_powered = any(event.get('event') == ('RESET' if retry_phase == 1 else 'SHUTDOWN') and
                                                  event.get('data', {}).get('guest') is True for event in report['qmp_events'])
                            if pending and not already_powered:
                                # This hit is only the native UI's same-request
                                # retry. It cannot allocate a new power action.
                                ui.capture(f'08-phase-{retry_phase}-before-receipt-retry')
                                ui.click(610, 225)
                                report.setdefault('receipt_retries', []).append({'phase': retry_phase, 'key': pending['key']})
                                retried = True
                        time.sleep(0.2)
                    raise TimeoutError(message)
                wait_for(lambda text: len(markers(text, 'ROCK_UI_POWER_BOOT_READY')) == 1, 'first power UI readiness')
                time.sleep(3)
                ui.capture('00-first-boot-hub')
                ui.click(636, 26)
                time.sleep(1)
                ui.capture('01-device-page')
                ui.click(360, 618)
                time.sleep(1)
                ui.capture('02-poweroff-confirm-before-cancel')
                ui.keys(['esc'])
                time.sleep(0.8)
                count = len(markers(log.read_text(errors='replace'), 'ROCK_UI_POWER_IDLE'))
                text = wait_for(lambda text: len(markers(text, 'ROCK_UI_POWER_IDLE')) >= count + 2, 'independent no-request evidence after Escape', 10)
                observed = markers(text, 'ROCK_UI_POWER_IDLE')[-2:]
                if any(row['phase'] != 1 or row['request_count'] != 0 for row in observed):
                    raise AssertionError('canceling confirmation created a power request')
                report['cancellation_idle_evidence'] = observed
                ui.capture('03-canceled-without-power-request')
                ui.click(360, 540)
                time.sleep(1)
                ui.capture('04-reboot-confirm')
                ui.click(497, 577)
                wait_for(lambda text: len(markers(text, 'ROCK_UI_POWER_BOOT_READY')) == 2,
                         'actual guest reboot and second UI readiness', retry_phase=1)
                time.sleep(3)
                ui.capture('05-second-boot-hub')
                ui.click(636, 26)
                time.sleep(1)
                ui.capture('06-device-after-actual-reboot')
                ui.click(360, 618)
                time.sleep(1)
                ui.capture('07-second-boot-shutdown-confirm')
                ui.click(497, 577)
                wait_for(lambda _text: process.poll() is not None, 'actual guest shutdown', timeout=120, retry_phase=2)
                monitor.reader.join(timeout=3)
            report['exit_code'] = process.returncode
            content = log.read_text(errors='replace')
            if process.returncode or 'ROCK_UI_POWER_GUEST_FAIL' in content:
                raise AssertionError('native power guest failed or exited abnormally')
            if content.count('reboot: Restarting system') != 1 or content.count('reboot: Power down') != 1:
                raise AssertionError('kernel did not report normal reboot and shutdown')
            dump = subprocess.run(['debugfs', '-R', 'cat /ui-power-proof.json', str(data)], capture_output=True, check=True, timeout=20)
            proof = json.loads(dump.stdout)
            database = output / 'observed-power.db'
            export_closed_database(data, '/system/power.db', database)
            with closing(sqlite3.connect(f'file:{database}?mode=ro', uri=True)) as db:
                db.execute('PRAGMA query_only=ON')
                db.row_factory = sqlite3.Row
                if db.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
                    raise AssertionError('durable power ledger integrity failed')
                rows = [dict(row) for row in db.execute('SELECT * FROM requests ORDER BY created_unix,key')]
            boots = markers(content, 'ROCK_UI_POWER_BOOT_READY')
            validate(proof, rows, boots, report['qmp_events'])
            business = verify_business_databases(data, output)
            check = subprocess.run(['e2fsck', '-f', '-n', str(data)], capture_output=True, timeout=30)
            (output / 'data-filesystem-check.log').write_bytes(check.stdout + check.stderr)
            with data.open('rb') as source:
                source.seek(1024 + 58)
                filesystem_state = struct.unpack('<H', source.read(2))[0]
            if check.returncode != 0 or filesystem_state & 1 != 1:
                raise AssertionError('normal shutdown did not leave a clean consistent data filesystem')
            if {p.name: native.digest_file(p) for p in (kernel, rootfs)} != before or not 8 <= len(report['screenshots']) <= 10:
                raise AssertionError('immutable images changed or native captures are incomplete')
            (output / 'ui-power-proof.json').write_text(json.dumps(proof, ensure_ascii=False, indent=2) + '\n')
            report.update(status='PASS', boots=boots, power_records=rows, guest_proof_sha256=guest.base.digest(proof),
                          data_filesystem_clean=True, host_power_commands_sent=0,
                          final_business_databases=business)
            print('PASS actual native GUI cancellation, two boots, guest reset/shutdown and clean persistent data', flush=True)
    except BaseException as error:
        report.update(status='FAIL', error=type(error).__name__ + ': ' + str(error))
        if monitor and process and process.poll() is None:
            try:
                monitor.command('screendump', {'filename': str(output / 'failure-display.png'), 'format': 'png'})
            except (OSError, RuntimeError, ValueError):
                pass
        raise
    finally:
        if process and process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)
        if monitor:
            monitor.close()
        report['image_sha256_after'] = {p.name: native.digest_file(p) for p in (kernel, rootfs)}
        report['finished_utc'] = datetime.now(timezone.utc).isoformat()
        (output / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')


if __name__ == '__main__':
    main()

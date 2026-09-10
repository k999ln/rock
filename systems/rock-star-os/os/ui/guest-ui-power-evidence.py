#!/usr/bin/python3
"""Read-only observer for native GUI confirmation and two actual power boots."""
from contextlib import closing
import importlib.util
import json
import os
from pathlib import Path
import re
import sqlite3
import stat
import time

SOURCE = Path('/usr/libexec/rock-ui-evidence.py')
if not SOURCE.is_file():
    SOURCE = Path(__file__).with_name('guest-ui-evidence.py')
spec = importlib.util.spec_from_file_location('rock_power_ui_base', SOURCE)
base = importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)
DATABASE = '/data/system/power.db'
PROOF = Path('/data/ui-power-proof.json')


def records_once():
    with closing(sqlite3.connect('file:' + DATABASE + '?mode=ro', uri=True, timeout=0.2)) as db:
        db.execute('PRAGMA query_only=ON')
        db.row_factory = sqlite3.Row
        return [dict(row) for row in db.execute('SELECT * FROM requests ORDER BY created_unix,key LIMIT 4')]


def records():
    # A durable DELETE-journal commit can briefly exclude readers. The reader
    # never changes journal mode, recovers a database, or substitutes old rows.
    deadline = time.monotonic() + 15
    while True:
        try:
            return records_once()
        except sqlite3.OperationalError as error:
            code = getattr(error, 'sqlite_errorcode', 0) & 0xff
            if code not in (sqlite3.SQLITE_BUSY, sqlite3.SQLITE_LOCKED) or time.monotonic() >= deadline:
                raise
            time.sleep(0.1)


def validate_record(row, operation, boot_id, *, dispatched=False):
    key = row['key']
    base.require(type(key) is str and re.fullmatch(r'ui-[0-9a-f]{32}', key) is not None,
                 'power request must carry a native GUI request identity')
    base.require(row['operation'] == operation and row['boot_id'] == boot_id and
                 json.loads(row['request_json']) == {'v': 1, 'op': operation, 'key': key}, 'power request fields differ')
    receipt = json.loads(row['receipt_json'])
    base.require(receipt == {'ok': True, 'result': {'accepted': True, 'key': key, 'op': operation, 'boot_id': boot_id,
                 'meaning': 'accepted; execution and OS completion are not confirmed by this receipt'}}, 'immutable acceptance receipt differs')
    base.require(row['status'] in ('pending', 'ready', 'dispatched') and row['command_error'] is None and
                 row['command_returncode'] in (None, 0), 'power action failed, was rejected, or was abandoned')
    if dispatched:
        base.require(row['status'] == 'dispatched' and row['replied_unix'] is not None and row['dispatched_unix'] is not None and
                     row['created_unix'] <= row['replied_unix'] <= row['dispatched_unix'], 'normal power dispatch was not durably claimed after reply')
    return receipt


def environment():
    result = base.environment_evidence()
    for name, mode, group, kind in (('/data/system', 0o700, 0, 'dir'),
                                     (DATABASE, 0o600, 0, 'file'),
                                     ('/run/rock-system/power.sock', 0o660, 1002, 'socket')):
        info = os.lstat(name)
        test = stat.S_ISDIR if kind == 'dir' else stat.S_ISREG if kind == 'file' else stat.S_ISSOCK
        base.require(test(info.st_mode) and info.st_uid == 0 and info.st_gid == group and stat.S_IMODE(info.st_mode) == mode,
                     'root power path ownership or type differs')
    pid = int(Path('/run/rock-system.pid').read_text().strip())
    base.require(pid > 1, 'invalid root power service pid')
    proc = Path('/proc') / str(pid)
    fields = dict(line.split(':', 1) for line in (proc / 'status').read_text().splitlines())
    uids, gids = [int(x) for x in fields['Uid'].split()], [int(x) for x in fields['Gid'].split()]
    executable = os.readlink(proc / 'exe')
    base.require(uids == gids == [0] * 4 and executable.startswith('/usr/bin/python3') and
                 b'/usr/lib/rock-system/power_service.py' in (proc / 'cmdline').read_bytes().split(b'\0'), 'wrong root power service identity')
    result['power_process'] = {'pid': pid, 'uid': uids, 'gid': gids, 'executable': executable,
                               'no_new_privs': int(fields['NoNewPrivs'].strip())}
    return result


def save(report):
    base.PROOF = PROOF
    base.persist(report)


def observe():
    deadline = time.monotonic() + 240
    while True:
        try:
            snapshot = base.read_api('snapshot')['snapshot']
            env = environment()
            rows = records()
            break
        except (OSError, ValueError, AssertionError, sqlite3.Error):
            if time.monotonic() >= deadline:
                raise TimeoutError('native power services did not become ready')
            time.sleep(0.5)
    boot = Path('/proc/sys/kernel/random/boot_id').read_text().strip()
    wallet_hash = base.wallet_baseline(snapshot['wallet'])
    hub_hash = base.digest(snapshot['hub'])
    if not PROOF.exists():
        base.require(rows == [], 'native power test requires a fresh empty power ledger')
        report = {'schema': 'rock-native-power-ui-proof/1', 'status': 'AWAITING_ACTUAL_POWER_EVENTS', 'phase': 1,
                  'blackberry': 'NOT_RUN', 'real_money': 'NOT_RUN', 'observer_mutations': 0,
                  'started_unix': time.time(), 'first_boot_id': boot, 'wallet_initial': snapshot['wallet'],
                  'wallet_initial_sha256': wallet_hash, 'hub_initial_sha256': hub_hash, 'environment_first': env}
        phase, operation = 1, 'reboot'
    else:
        report = json.loads(PROOF.read_text())
        base.require(report['schema'] == 'rock-native-power-ui-proof/1' and report['phase'] == 1 and
                     report['first_boot_id'] != boot and len(rows) == 1, 'expected exactly a second boot after one native reboot')
        validate_record(rows[0], 'reboot', report['first_boot_id'], dispatched=True)
        base.require(wallet_hash == report['wallet_initial_sha256'] and hub_hash == report['hub_initial_sha256'],
                     'native reboot changed Wallet or Tools')
        report.update(phase=2, second_boot_id=boot, environment_second=env, first_dispatch=rows[0],
                      wallet_second=snapshot['wallet'], wallet_second_sha256=wallet_hash, hub_second_sha256=hub_hash)
        phase, operation = 2, 'poweroff'
    save(report)
    base.emit('ROCK_UI_POWER_BOOT_READY', {'phase': phase, 'boot_id': boot})
    next_idle, idle_count, seen_status = 0, 0, None
    while time.monotonic() < deadline:
        rows = records()
        base.require(len(rows) in (phase - 1, phase), 'unexpected native power request count')
        if phase == 2:
            validate_record(rows[0], 'reboot', report['first_boot_id'], dispatched=True)
            base.require(rows[0] == report['first_dispatch'], 'old reboot request changed on the next boot')
        if len(rows) == phase:
            record = rows[-1]
            receipt = validate_record(record, operation, boot)
            if seen_status != record['status']:
                report.update(last_observed_request=record, observed_unix=time.time())
                save(report)
                base.emit('ROCK_UI_POWER_REQUEST_OBSERVED', {'phase': phase, 'receipt': receipt, 'status': record['status']})
                seen_status = record['status']
            # No new API reads after a power request: services may now stop.
            if record['status'] == 'dispatched':
                return
            time.sleep(0.02)
        else:
            if time.monotonic() >= next_idle:
                idle_count += 1
                base.emit('ROCK_UI_POWER_IDLE', {'phase': phase, 'boot_id': boot, 'sequence': idle_count, 'request_count': len(rows)})
                next_idle = time.monotonic() + 0.5
            time.sleep(0.05)
    raise TimeoutError('native power confirmation flow did not finish')


def main():
    if os.getuid() != 0 or os.geteuid() != 0 or os.uname().machine != 'aarch64' or 'rock.ui.power.verify=1' not in Path('/proc/cmdline').read_text().split():
        raise SystemExit('requires explicitly flagged root ARM64 native power verification boot')
    try:
        observe()
    except BaseException as error:
        base.emit('ROCK_UI_POWER_GUEST_FAIL', {'error': type(error).__name__ + ': ' + str(error)})
        # Neither success nor failure powers the OS off here. Only native evdev
        # input may submit the production power operation through the UI.
        raise


if __name__ == '__main__':
    main()

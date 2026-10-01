#!/usr/bin/python3
"""Fixed disposable stage0 proof; owner mutations only via real UID1000 IPC.

The root observer reads private state and invokes the existing updater. Public
simulator settlement is performed by the host's private fixture pipe. It never
selects a slot or fabricates a Wallet receipt/registration. Negative phases run
before S97 and return to the unchanged actual health hook for natural rollback.
"""
import json
import os
from pathlib import Path
import sqlite3
import stat
import subprocess
import sys
import time

sys.path.insert(0, str(Path(__file__).resolve().parent))
from rock_update import Updater
from purchaser_fixture import Probe, TEXT, OUTPUT, LOCAL
from verify_purchaser_contract import (BAD, DATABASES, ERROR, PHASES, canonical, compare_retained,
                                       database_summary, digest, financial, phase_from_cmdline, require)

ROOT = Path('/data/purchaser-update-proof')
PERSONAL = Path('/data/purchaser-personal/meeting.txt')
PERSONAL_BYTES = b'personal meeting notes\nkeep all original history\n'
SERVICE_CONFIG = Path('/etc/rock-platform/service-access.json')
BINDING = Path('/data/platform/purchaser-service-binding.json')
WALLET_CONFIG = Path('/etc/rock-wallet/backend.json')
AUTH_CONFIG = Path('/etc/rock-authenticator/device.json')


def persist(path, value):
    raw = canonical(value) + b'\n'
    temporary = path.with_suffix('.tmp')
    with temporary.open('xb') as stream:
        stream.write(raw); stream.flush(); os.fsync(stream.fileno())
    os.replace(temporary, path)
    descriptor = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)
    return raw


def environment():
    mounts = {row[1]: row for line in Path('/proc/mounts').read_text().splitlines()
              if len(row := line.split()) >= 4 and row[1] in ('/', '/data')}
    require('ro' in mounts['/'][3].split(',') and mounts['/data'][0] == '/dev/vdb' and
            {'rw', 'nosuid', 'nodev', 'noexec'} <= set(mounts['/data'][3].split(',')), 'guest mount policy differs')
    processes = []
    for role, uid in (('platform', 1002), ('wallet', 1003), ('authenticator', 1004)):
        pid = int(Path('/run/rock-' + role + '.pid').read_text())
        rows = dict(line.split(':', 1) for line in Path(f'/proc/{pid}/status').read_text().splitlines() if ':' in line)
        require([int(x) for x in rows['Uid'].split()] == [uid] * 4, 'guest daemon UID differs')
        processes.append({'role': role, 'pid': pid, 'uid': uid})
    return {'machine': os.uname().machine, 'mounts': mounts, 'processes': processes}


def retained(wallet):
    for basename in ('wallet-simulator.db', 'entitlement.db'):
        for suffix in ('', '-wal', '-shm', '-journal'):
            path = Path('/data/wallet') / (basename + suffix)
            require(not path.exists() and not path.is_symlink(), 'remote profile created a local financial ledger')
    personal = PERSONAL.lstat()
    require(stat.S_ISREG(personal.st_mode) and personal.st_uid == 1000 and personal.st_nlink == 1 and
            stat.S_IMODE(personal.st_mode) == 0o600 and PERSONAL.read_bytes() == PERSONAL_BYTES,
            'owner personal file changed')
    return {'databases': {role: database_summary(Path('/data' + path), role, uid)
                          for role, (path, uid) in DATABASES.items()},
            'binding_sha256': digest(BINDING.read_bytes()), 'personal_file_sha256': digest(PERSONAL.read_bytes()),
            'financial': financial(wallet), 'wallet_config_sha256': digest(WALLET_CONFIG.read_bytes()),
            'auth_config_sha256': digest(AUTH_CONFIG.read_bytes())}


def create_fixture(probe):
    initial = probe.snapshot()
    require(not initial['hub']['installed'] and not initial['hub']['jobs'] and
            initial['service_access']['mode'] == 'purchaser-fixture' and
            initial['service_access']['state'] == 'configured', 'fresh closed guest required')
    probe.action('registry.refresh', 'purchaser-refresh')
    def item():
        return next((x for x in probe.snapshot()['catalog'] if x['manifest']['id'] == LOCAL), None)
    package = probe.wait(item)
    probe.action('install', 'purchaser-install', id=LOCAL, version='1.0.0')
    probe.action('approve', 'purchaser-approve', id=LOCAL, approved_hash=package['hash'])
    job = probe.local('purchaser-original-local')
    probe.action('wallet.register', 'purchaser-register')
    begin = probe.action('wallet.auth.begin', 'purchaser-auth-begin')
    credential = probe.action('auth.create', 'purchaser-auth-create', options=begin['options'])
    enrollment = probe.action('wallet.auth.enroll', 'purchaser-auth-enroll',
                             challenge_id=begin['challenge_id'], credential=credential)
    require(enrollment['activation_state'] == 'TERMS_REQUIRED', 'enrollment implicitly accepted Wallet terms')
    active = probe.action('wallet.terms', 'purchaser-terms', accepted=True, terms_version='rock-wallet-development/1')
    require(active['active'] is True and not probe.snapshot()['wallet']['membership']['entitlement']['auto_renew'],
            'Wallet activation implicitly enabled monthly fees')
    print('\nROCK_PURCHASER_SETTLEMENT_READY ' + json.dumps({'boot_id': probe.boot_id}), flush=True)
    probe.wait(lambda: probe.snapshot()['wallet']['available_minor'] == 5000)
    terms = probe.snapshot()['wallet']['membership']['terms_version']
    probe.action('wallet.consent', 'purchaser-monthly-consent', accepted=True, terms_version=terms)
    probe.action('wallet.bill', 'purchaser-first-bill', period=time.strftime('%Y-%m', time.gmtime()))
    probe.wait(lambda: probe.snapshot()['wallet']['billed_minor'] == 888)
    probe.action('wallet.consent', 'purchaser-cancel-renew', accepted=False, terms_version=terms)
    # A fixed ordinary owner file is separate from the observer's root-only
    # proof records. No credential or accounting record is created here.
    PERSONAL.parent.mkdir(mode=0o700)
    os.chown(PERSONAL.parent, 1000, 1000)
    child = subprocess.run(['/usr/bin/python3', '-I', '-B', '-c',
        'import os; p="/data/purchaser-personal/meeting.txt"; '
        'fd=os.open(p,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600); '
        'os.write(fd,b"personal meeting notes\\nkeep all original history\\n"); os.fsync(fd); os.close(fd)'],
        user=1000, group=1000, extra_groups=[], capture_output=True, timeout=10)
    require(child.returncode == 0, 'owner personal file creation failed')
    wallet = probe.snapshot()['wallet']
    history = retained(wallet)
    require(history['databases']['hub']['tables']['hub_jobs']['rows'] == 1 and
            history['databases']['wallet_cache']['tables']['requests']['rows'] >= 7 and
            history['databases']['authenticator']['tables']['credentials']['rows'] == 1,
            'original Tool/Wallet/authenticator history missing')
    baseline = {'history': history, 'job': job, 'service_access': probe.snapshot()['service_access'],
                'service_config_sha256': digest(SERVICE_CONFIG.read_bytes())}
    persist(ROOT / 'baseline.json', baseline)
    return baseline


def execute(phase, probe, report):
    updater = Updater()
    boot = json.loads(Path('/run/rock-boot.json').read_text())
    state = updater.read_state()
    require(updater.running_slot(state) == PHASES[phase][0] and
            (boot['slot'], boot['sequence'], boot['reason']) == PHASES[phase], 'wrong actual stage0 boot')
    report.update(boot=boot, update_state={k: state[k] for k in ('committed', 'pending', 'attempts_left', 'floor')},
                  environment=environment())
    if phase not in BAD:
        require(Path('/run/rock-boot-good.json').exists() and state['committed'] == boot['slot'] and
                state['pending'] is None, 'actual S97 did not confirm healthy root')
    else:
        require(not Path('/run/rock-boot-good.json').exists(), 'bad candidate was already confirmed')
    baseline = create_fixture(probe) if phase == 1 else json.loads((ROOT / 'baseline.json').read_text())
    snapshot = probe.snapshot()
    report['service_access'] = snapshot['service_access']
    current = retained(snapshot['wallet'])
    compare_retained(baseline['history'], current)
    report.update(history=current, history_matches_initial=True,
                  original_job_sha256=digest(probe.action('job.result', id=baseline['job']['id'])))
    require(probe.action('job.result', id=baseline['job']['id']) == baseline['job'], 'original Tool result or receipt changed')
    if phase in BAD:
        require(not SERVICE_CONFIG.exists() and not SERVICE_CONFIG.with_suffix('.required').exists(),
                'bad candidate did not lose service-only configuration')
        require(snapshot['wallet']['backend']['connected'] is True, 'Wallet outage masks purchaser-health failure')
        require(snapshot['service_access']['mode'] == 'purchaser-fixture' and
                snapshot['service_access']['state'] == 'unavailable' and
                not snapshot['registry']['configured'] and
                all(not target['available'] for target in snapshot['remote']['destinations']),
                'missing configuration reopened service or lost local status')
        denial = probe.call({'v': 1, 'op': 'health'})
        require(denial == {'ok': False, 'code': 'rejected', 'error': ERROR},
                'health failed for transport/Wallet reason rather than purchaser binding')
        print(ERROR, flush=True)
        report.update(health_denial=denial, wallet_daemon_healthy=True,
                      wallet_health_basis='Platform.health completed local Wallet health before exact profile rejection; owner Wallet snapshot remains connected',
                      closed_configuration_absent=True)
        # No updater call, mark-good call, host power command, or artificial
        # health-fail file. The real S97 runs immediately after this observer.
    else:
        require(snapshot['service_access'] == baseline['service_access'] and
                digest(SERVICE_CONFIG.read_bytes()) == baseline['service_config_sha256'],
                'healthy update changed authority/consumer/device or config')
        require(probe.action('health')['ready'] is True, 'owner health not ready')
        if phase in (1, 2):
            sequence = 2 if phase == 1 else 3
            path = Path('/run/rock-purchaser-fixtures') / f'release-{sequence}.rock'
            installed = updater.install(path)
            require(installed['slot'] == ('B' if phase == 1 else 'A'), 'wrong inactive update slot')
            require(updater.install(path)['result'] == 'already-staged', 'exact update retry not idempotent')
            report['staged'] = {'sequence': sequence, 'slot': installed['slot'], 'exact_retry': 'already-staged'}
        else:
            require(state['floor'] == 2 and updater.mark_good()['result'] == 'already-good', 'rollback did not retain healthy floor')
    report['status'] = 'PASS'


def main():
    phase = phase_from_cmdline(Path('/proc/cmdline').read_text())
    require(sys.platform == 'linux' and os.geteuid() == 0 and os.uname().machine == 'aarch64', 'actual root ARM64 guest required')
    os.umask(0o077)
    ROOT.mkdir(mode=0o700, exist_ok=True)
    probe = Probe()
    report = {'schema': 'rock-purchaser-update-guest/1', 'status': 'RUNNING', 'phase': phase,
              'boot_id': probe.boot_id, 'simulation_only': True,
              'scope': 'UID1000 owner IPC, root read-only history observer and fixed updater operations; no GUI/hardware claim'}
    try:
        execute(phase, probe, report)
    except BaseException as error:
        report.update(status='FAIL', error_type=type(error).__name__)
        if isinstance(error, AssertionError):
            report['error_label'] = str(error)[:180]
    finally:
        report.update(children=probe.children, events=probe.events)
        raw = persist(ROOT / f'phase-{phase}.json', report)
        print('\nROCK_PURCHASER_UPDATE_' + report['status'] + ' ' + json.dumps({
            'phase': phase, 'boot_id': probe.boot_id, 'proof_sha256': digest(raw)}), flush=True)
        os.sync()
        if phase not in BAD or report['status'] != 'PASS':
            subprocess.run(['/sbin/poweroff'], check=True, timeout=10)
    return 0 if report['status'] == 'PASS' else 1


if __name__ == '__main__':
    sys.exit(main())

#!/usr/bin/python3
"""Three flagged disposable boots; owner IPC and public software authentication.

No clock/credit/admin control is accepted in the guest. The host owns those
fixture-only transitions and observes each real normal shutdown independently.
"""
from contextlib import closing
import importlib.util
import json
import os
from pathlib import Path
import sqlite3
import stat
import subprocess
import sys
import time

COMMON = Path('/usr/libexec/rock-purchaser-offline-common.py')
spec = importlib.util.spec_from_file_location('offline_common', COMMON)
common = importlib.util.module_from_spec(spec)
# Pure host guards load this module without its guest-only dependency.
if COMMON.is_file():
    spec.loader.exec_module(common)

PREFIX = 'rock.purchaser-offline.verify='
REMOTE = 'org.rockstar.remote-text'
LOCAL = 'org.rockstar.closed-local'
TEXT = '  off-device monthly proof  \n  one shared authority  '
OUTPUT = 'off-device monthly proof\none shared authority'


def phase_from(commandline):
    flags = [word for word in commandline.split() if word.startswith(PREFIX)]
    if len(flags) != 1 or flags[0] not in {PREFIX + str(n) for n in (1, 2, 3)}:
        raise AssertionError('exactly one fixed purchaser-offline phase required')
    return int(flags[0][-1])


def wallet_view(wallet):
    """Only safe authoritative values; no raw credential, PIN or bearer receipt."""
    entitlement = wallet['membership']['entitlement']
    return {'available_minor': wallet['available_minor'], 'held_minor': wallet['held_minor'],
            'billed_minor': wallet['billed_minor'], 'bill_count': len(wallet['bills']),
            'bills': [{'period': row['period'], 'amount_minor': row['amount_minor']} for row in wallet['bills']],
            'auto_renew': entitlement['auto_renew'], 'access_allowed': entitlement['access_allowed'],
            'access_until': entitlement['access_until'], 'device_eligible': entitlement['device_eligible'],
            'auth_active': wallet['auth']['active'],
            'credential_id_sha256': common.digest(wallet['auth']['credential_id']),
            'billing': [{'period': row['period'], 'status': row['status']} for row in wallet['billing']['history']],
            'backend': wallet['backend'], 'service_access': wallet['service_access'],
            'simulation_only': wallet['simulation_only']}


def reject_pin_fields(value):
    if isinstance(value, dict):
        if any(str(key).casefold() in ('pin', 'test_pin') for key in value):
            raise AssertionError('PIN field appeared in a stored receipt')
        for item in value.values(): reject_pin_fields(item)
    elif isinstance(value, list):
        for item in value: reject_pin_fields(item)


def readonly_rows(path, uid, query):
    info = path.lstat()
    common.require(stat.S_ISREG(info.st_mode) and info.st_uid == uid and info.st_nlink == 1,
                   'private observation file identity differs')
    with closing(sqlite3.connect('file:' + str(path) + '?mode=ro', uri=True)) as db:
        db.row_factory = sqlite3.Row
        db.execute('PRAGMA query_only=ON'); db.execute('BEGIN')
        common.require(db.execute('PRAGMA integrity_check').fetchone()[0] == 'ok', 'private database integrity differs')
        return [dict(row) for row in db.execute(query)]


def private_evidence():
    common.require(not Path('/data/wallet/wallet-simulator.db').exists() and
                   not Path('/data/wallet/entitlement.db').exists(), 'device created a local authoritative ledger')
    cache = readonly_rows(Path('/data/wallet/backend-cache/remote-cache.db'), 1003,
                          'SELECT key,payload,response FROM requests ORDER BY key')
    receipts = []
    for row in cache:
        request = json.loads(row['payload'])
        reject_pin_fields(request)
        if row['response']: reject_pin_fields(json.loads(row['response']))
        receipts.append({'key': row['key'], 'op': request['op'],
                         'request_sha256': common.digest(request),
                         'response_sha256': common.digest(json.loads(row['response'])) if row['response'] else None})
    auth = readonly_rows(Path('/data/authenticator/authenticator.sqlite3'), 1004,
                         'SELECT request_key,operation,payload,response FROM requests ORDER BY request_key')
    credentials = readonly_rows(Path('/data/authenticator/authenticator.sqlite3'), 1004,
                                'SELECT credential_id,sign_count FROM credentials ORDER BY credential_id')
    for row in auth:
        reject_pin_fields(json.loads(row['payload'])); reject_pin_fields(json.loads(row['response']))
    # Only counts and digests leave the private authenticator state.
    return {'cache_receipts': receipts, 'pending': sum(row['response'] is None for row in cache),
            'authenticator_request_count': len(auth), 'authenticator_requests_sha256': common.digest(auth),
            'authenticator_credential_count': len(credentials),
            'authenticator_credentials_sha256': common.digest(credentials), 'local_ledger_absent': True}


class Probe:
    def __init__(self, phase):
        self.base = common.Probe()
        self.base.deadline = time.monotonic() + 170
        self.phase = phase

    def emit(self, event):
        print('\nROCK_PURCHASER_OFFLINE_' + event + ' ' + json.dumps(
            {'phase': self.phase, 'boot_id': self.base.boot_id}), flush=True)

    def action(self, operation, key=None, **fields):
        request = {'v': 1, 'op': operation, **fields}
        if key is not None:
            request['key'] = 'offline-' + key
        reply = self.base.positive(request)
        return reply.get('result', reply.get('snapshot', reply.get('credential')))

    def snapshot(self):
        return self.action('snapshot')

    def wallet(self):
        return self.base.wait(lambda: (w if isinstance((w := self.snapshot().get('wallet')), dict)
                                      and w.get('backend', {}).get('connected') else None))

    def remote(self, key):
        preview = self.action('remote.prepare', key, id=REMOTE, target='cloud', text=TEXT)
        common.require(preview['prepared'] and not preview['approved'] and
                       preview['input_sha256'] == common.digest(TEXT.encode()), 'remote input preview differs')
        receipt = self.action('remote.submit', key, consent=preview['consent'])
        common.require(receipt['accepted'] and not receipt['remote_accepted'], 'local acceptance misrepresented')
        done = self.base.wait(lambda: (v if (v := self.action('remote.status', key))['state'] in
                                      ('succeeded', 'failed', 'cancelled', 'indeterminate', 'rejected') else None))
        common.require(done['state'] == 'succeeded' and done['remote']['output'] == OUTPUT and
                       done['remote']['execution']['kind'] == 'actual_linux_isolated_process', 'paid remote execution differs')
        return done

    def local(self, key):
        job = self.action('run', key, id=LOCAL, text=TEXT, target='device_local')
        result = self.base.wait(lambda: (v if (v := self.action('job.result', id=job['id']))['status'] != 'running' else None))
        common.require(result['status'] == 'succeeded' and result['output'] == OUTPUT, 'local retained Tool output differs')
        return {'key': result['key'], 'package_hash': result['package_hash'], 'output_sha256': common.digest(result['output'])}


def execute(p, report):
    report['environment'] = common.environment()
    report['environment']['source_sha256'][str(Path(__file__).resolve())] = common.digest(Path(__file__).read_bytes())
    status_source = Path('/usr/lib/rock-platform/service_access/status.py')
    report['environment']['source_sha256'][str(status_source)] = common.digest(status_source.read_bytes())
    initial = p.wallet()
    if p.phase == 1:
        common.require(initial['available_minor'] == initial['billed_minor'] == 0 and
                       not initial['membership']['registered'], 'new empty Wallet authority required')
        p.action('registry.refresh', 'catalog-1')
        def found_catalog():
            value = p.snapshot()
            return value if len([x for x in value['catalog'] if x['manifest']['id'] in (LOCAL, REMOTE)]) == 2 else None
        catalog = p.base.wait(found_catalog)
        report['packages'] = {x['manifest']['id']: x['hash'] for x in catalog['catalog']
                              if x['manifest']['id'] in (LOCAL, REMOTE)}
        for tool in (LOCAL, REMOTE):
            p.action('install', 'install-' + tool, id=tool, version='1.0.0')
            p.action('approve', 'approve-' + tool, id=tool, approved_hash=report['packages'][tool])
        p.action('wallet.register', 'register')
        begin = p.action('wallet.auth.begin', 'auth-begin')
        credential = p.action('auth.create', 'auth-create', options=begin['options'])
        enrolled = p.action('wallet.auth.enroll', 'auth-enroll', challenge_id=begin['challenge_id'], credential=credential)
        common.require(enrolled['activation_state'] == 'TERMS_REQUIRED', 'enrollment implicitly accepted terms')
        active = p.action('wallet.terms', 'terms', accepted=True, terms_version='rock-wallet-development/1')
        common.require(active['active'] and not p.wallet()['membership']['entitlement']['auto_renew'],
                       'activation implicitly accepted recurring fee')
        p.emit('SEED_READY')
        p.base.wait(lambda: p.wallet()['available_minor'] == 5000)
        terms = p.wallet()['membership']['terms_version']
        request = {'v': 1, 'op': 'wallet.consent', 'key': 'offline-consent', 'accepted': True, 'terms_version': terms}
        unknown = p.base.call(request)
        common.require(isinstance(unknown, dict) and unknown.get('ok') is False and
                       unknown.get('code') == 'unavailable', 'actual Platform uncertain reply required')
        receipt = p.base.positive(request)
        common.require(receipt['ok'] is True, 'same-key recurring consent recovery failed')
        report['uncertain_consent'] = {'request_sha256': common.digest(request),
                                       'recovered_response_sha256': common.digest(receipt), 'key': request['key']}
        paid = p.base.wait(lambda: (w if (w := p.wallet())['billed_minor'] == 888 else None))
        common.require(paid['available_minor'] == 4112 and len(paid['bills']) == 1, 'first automatic monthly debit differs')
        report['remote'] = p.remote('remote-september')
        report['local'] = p.local('local-september')
    else:
        report['wallet_initial'] = wallet_view(initial)
        common.require(initial['available_minor'] == 3224 and initial['billed_minor'] == 1776 and
                       len(initial['bills']) == 2 and initial['auth']['active'], 'reconnected authority totals/activation differ')
        if p.phase == 2:
            common.require(initial['membership']['entitlement']['access_allowed'] and
                           initial['membership']['entitlement']['auto_renew'], 'October paid contract was not recovered')
            # Exact completed mutation replay after both OS and backend restart.
            p.action('wallet.consent', 'consent', accepted=True, terms_version=initial['membership']['terms_version'])
            report['remote'] = p.remote('remote-october')
            p.action('wallet.consent', 'cancel', accepted=False, terms_version=initial['membership']['terms_version'])
            common.require(not p.wallet()['membership']['entitlement']['auto_renew'], 'online cancellation not confirmed')
            p.emit('CANCELED')
        else:
            common.require(not initial['membership']['entitlement']['access_allowed'] and
                           not initial['membership']['entitlement']['auto_renew'], 'November cancellation/expiry differs')
            p.action('registry.refresh', 'catalog-november')
            p.base.wait(lambda: p.snapshot()['registry']['status'] == 'ready')
            report['local'] = p.local('local-november')
        for key in ('remote-september', 'remote-october')[:p.phase - 1]:
            history = p.action('remote.status', key)
            common.require(history['state'] == 'succeeded' and history['remote']['output'] == OUTPUT,
                           'paid remote history disappeared after reconnect')
    final = p.wallet()
    report['wallet_final'] = wallet_view(final)
    current = p.snapshot()['service_access']
    expected_state = 'PAUSED' if p.phase == 3 else 'PAID'
    common.require(current['fresh'] and current['current'] == final['service_access'] and
                   current['current']['paid_state'] == expected_state and
                   ('runner.cloud.submit' in current['current']['allowed_actions']) is (p.phase != 3) and
                   'registry.index' in current['current']['allowed_actions'],
                   'fresh OS purchaser service projection differs from authoritative Wallet status')
    report['platform_service_access'] = current['current']
    report['private_evidence'] = private_evidence()
    common.require(report['private_evidence']['pending'] == 0, 'Wallet operation left unresolved at normal shutdown')
    common.require(common.environment()['processes'] == report['environment']['processes'], 'guest service restarted during a boot')


def main():
    phase = phase_from(Path('/proc/cmdline').read_text())
    common.require(sys.platform == 'linux' and os.geteuid() == 0 and os.uname().machine == 'aarch64', 'root ARM64 guest required')
    p = Probe(phase)
    report = {'schema': 'rock-purchaser-offline-guest/1', 'status': 'RUNNING', 'phase': phase,
              'boot_id': p.base.boot_id, 'simulation_only': True, 'native_gui': 'NOT_RUN'}
    try:
        execute(p, report)
        report['status'] = 'PASS'
    except BaseException as error:
        report.update(status='FAIL', error_type=type(error).__name__)
        if isinstance(error, common.CheckFailed):
            report['error_label'] = str(error)[:180]
    finally:
        report.update(events=p.base.events, children=p.base.children)
        raw = common.canonical(report) + b'\n'
        destination = Path(f'/data/purchaser-offline-{phase}.json')
        try:
            with destination.with_suffix('.tmp').open('wb') as stream:
                stream.write(raw); stream.flush(); os.fsync(stream.fileno())
            os.replace(destination.with_suffix('.tmp'), destination)
            descriptor = os.open('/data', os.O_RDONLY | os.O_DIRECTORY)
            try: os.fsync(descriptor)
            finally: os.close(descriptor)
            print('\nROCK_PURCHASER_OFFLINE_GUEST_' + report['status'] + ' ' + json.dumps(
                {'phase': phase, 'boot_id': p.base.boot_id, 'proof_sha256': common.digest(raw)}), flush=True)
        finally:
            os.sync(); subprocess.run(['/sbin/poweroff'], check=True, timeout=10)
    return 0 if report['status'] == 'PASS' else 1


if __name__ == '__main__':
    sys.exit(main())

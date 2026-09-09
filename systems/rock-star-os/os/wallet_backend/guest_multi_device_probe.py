#!/usr/bin/python3
"""Explicit test-only A/B/A ARM64 boots, real UID1000 Platform IPC.

The fixed copied common helper supplies bounded IPC/environment observations.
Root only reads private cache state, records proof and requests normal shutdown.
No identity documents, tokens, raw account IDs, input text or ATM codes are logged.
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

COMMON_PATH = Path('/usr/libexec/rock-wallet-probe-common.py')
A_DEVICE, B_DEVICE = 'fixture-rock-arm64-001', 'fixture-rock-arm64-002'
KEY_A_REGISTER = 'multi-os-a-register'
KEY_A_CONSENT = 'multi-os-a-consent'
KEY_B_REGISTER = 'multi-os-b-register'
KEY_B_CANCEL = 'multi-os-b-cancel'
KEY_DENIED_REGISTER = 'multi-os-a-denied-register'
KEY_BLOCKED_BILL = 'multi-os-a-blocked-bill'


def common_module():
    spec = importlib.util.spec_from_file_location('rock_wallet_probe_common', COMMON_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def select_phase(cmdline):
    flags = [part for part in cmdline.split() if part.startswith('rock.wallet.multi=')]
    if len(flags) != 1 or flags[0] not in ('rock.wallet.multi=1', 'rock.wallet.multi=2', 'rock.wallet.multi=3'):
        raise ValueError('one exact multi-device test flag required')
    return int(flags[0][-1])


def run(phase, base):
    require, canonical, sha = base.require, base.canonical, base.sha
    probe = base.Probe(phase)
    device = B_DEVICE if phase == 2 else A_DEVICE
    trace = []

    def owner(request):
        response = probe.owner(request)
        trace.append({'op': request['op'], 'key': request.get('key'), 'request_sha256': sha(canonical(request)),
                      'response_sha256': sha(canonical(response)), 'ok': response['ok'],
                      'code': response.get('code'), 'actual_ipc_response': not response.get('_probe_transport_failure', False)})
        return response

    def view(wallet):
        result = base.wallet_view(wallet)
        entitlement = wallet['membership'].get('entitlement')
        if entitlement:
            require(entitlement['device_ref'] == device, 'membership uses a different authenticated device')
            result.update(account_sha256=sha(entitlement['account_id'].encode()),
                          device_ref=entitlement['device_ref'], device_eligible=entitlement['device_eligible'])
        return result

    def snapshot():
        reply = owner({'v': 1, 'op': 'snapshot'})
        if not reply['ok']:
            require(reply.get('code') == 'unavailable', 'online Platform read definitively rejected')
            return None
        wallet = reply['snapshot'].get('wallet')
        return view(wallet) if wallet is not None else None

    probe.snapshot = snapshot
    report = {'schema': 'rock-wallet-multi-device-guest/1', 'phase': phase, 'device_ref': device,
              'boot_id': probe.boot_id, 'status': 'FAIL', 'started_at_unix': time.time(), 'simulation_only': True,
              'scope': {'actual': 'ARM64 UID1000 Platform IPC and owned TLS Wallet', 'native_gui': 'NOT_RUN',
                        'physical_blackberry': 'NOT_RUN', 'real_identity_or_funds': False, 'ATM': 'NOT_RUN'},
              'shutdown': 'normal /sbin/poweroff via explicit test hook; completion requires host evidence'}
    final = None
    try:
        # All three boots use a virtual NIC. The old helper's offline phase is
        # intentionally not selected; no NIC-less claim is made in this proof.
        report['environment'] = base.environment(0)
        config = json.loads(base.CONFIG.read_bytes())
        require(config['schema_version'] == 2 and config['device_ref'] == device, 'schema2 device-bound profile differs')
        report['environment']['pinned_device_ref'] = config['device_ref']
        report['environment']['source_sha256'][str(Path(__file__).resolve())] = sha(Path(__file__).read_bytes())
        if phase == 1:
            initial = probe.wait(base.online)
            require(not initial['registered'] and base.amounts(initial, 0, 0, 0, False), 'A authority must start empty/unregistered')
            report['wallet_initial'] = initial
            receipt = probe.mutate({'v': 1, 'op': 'wallet.register', 'key': KEY_A_REGISTER})
            report['registration_account_sha256'] = sha(receipt['result']['account_id'].encode())
            registered = probe.wait(lambda s: base.online(s) and s['registered'])
            require(base.amounts(registered, 0, 0, 0, False), 'registration created consent or credit')
            probe.emit('ROCK_WALLET_MULTI_READY_FOR_SEED')
            probe.wait(lambda s: base.online(s) and base.amounts(s, 5000, 0, 0, False))
            probe.mutate({'v': 1, 'op': 'wallet.consent', 'key': KEY_A_CONSENT, 'accepted': True, 'terms_version': base.TERMS})
            final = probe.wait(lambda s: base.online(s) and base.amounts(s, 4112, 888, 1, True))
        elif phase == 2:
            receipt = probe.mutate({'v': 1, 'op': 'wallet.register', 'key': KEY_B_REGISTER})
            report['registration_account_sha256'] = sha(receipt['result']['account_id'].encode())
            initial = probe.wait(lambda s: base.online(s) and base.amounts(s, 4112, 888, 1, True))
            report['wallet_initial'] = initial
            require(initial['device_eligible'] is True, 'B specific purchased-device eligibility required')
            history = owner({'v': 1, 'op': 'wallet.billing.status'})
            require(history.get('ok') is True, 'B cannot inspect shared billing history')
            rows = history['result']['history']
            require(len(rows) == 1 and rows[0]['status'] == 'paid', 'B did not see one paid month')
            report['shared_paid_history'] = {'rows': 1, 'period': rows[0]['period'], 'status': rows[0]['status']}
            probe.mutate({'v': 1, 'op': 'wallet.consent', 'key': KEY_B_CANCEL, 'accepted': False, 'terms_version': base.TERMS})
            final = probe.wait(lambda s: base.online(s) and base.amounts(s, 4112, 888, 1, False))
        else:
            # Wait for an explicit authority rejection, not a transient daemon
            # startup failure. Neither a successful stale Wallet nor a timeout
            # can satisfy this negative test.
            while True:
                membership = owner({'v': 1, 'op': 'wallet.membership'})
                if membership.get('code') == 'unauthorized' and not membership['ok']:
                    break
                require(membership.get('code') == 'unavailable' and time.monotonic() < probe.deadline,
                        'revoked A returned membership or never produced an explicit rejection')
                time.sleep(.15)
            denied = owner({'v': 1, 'op': 'snapshot'})
            require(denied['ok'] is True and denied['snapshot'].get('wallet') is None,
                    'revoked A exposed a previously cached financial snapshot')
            old = owner({'v': 1, 'op': 'wallet.register', 'key': KEY_A_REGISTER})
            require(old['ok'] is False and old.get('code') == 'unauthorized', 'old registration receipt bypassed current device admission')
            fresh = owner({'v': 1, 'op': 'wallet.register', 'key': KEY_DENIED_REGISTER})
            require(fresh['ok'] is False and fresh.get('code') == 'unauthorized', 'new registration was not explicitly rejected')
            blocked = owner({'v': 1, 'op': 'wallet.bill', 'key': KEY_BLOCKED_BILL, 'period': '2026-09'})
            require(blocked['ok'] is False and blocked.get('code') == 'unavailable', 'prior unresolved request did not fence another key')
            require(all(row['actual_ipc_response'] for row in trace), 'negative phase used a synthetic local transport failure')
            report['revoked_owner_observation'] = {
                'membership': 'unauthorized', 'platform_snapshot_wallet': None, 'historical_register_receipt': 'unauthorized',
                'fresh_register': 'unauthorized; exact local request retained conservatively',
                'different_bill_key': 'unavailable; host HTTP observer must confirm no send'}
        report['wallet_final'] = final
        report['cache'] = observe_cache(base, phase, final)
        report['status'] = 'PASS'
    except Exception as error:
        report['error_type'] = type(error).__name__
        if isinstance(error, base.ProbeCheckFailed):
            report['error_label'] = str(error)[:160]
    finally:
        report['owner_processes'] = probe.children
        report['owner_mutations'] = probe.events
        report['owner_read_and_denial_trace'] = trace
        report['finished_at_unix'] = time.time()
        # Even proof storage failure proceeds to normal init shutdown. Failure
        # is never converted into a PASS marker without a durable proof digest.
        try:
            path = Path(f'/data/wallet-multi-{phase}.json')
            temporary = path.with_suffix('.json.tmp')
            fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
            with os.fdopen(fd, 'wb') as stream:
                stream.write(canonical(report) + b'\n')
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(temporary, path)
            fd = os.open('/data', os.O_RDONLY | os.O_DIRECTORY)
            try:
                os.fsync(fd)
            finally:
                os.close(fd)
            probe.emit('ROCK_WALLET_MULTI_GUEST_' + report['status'], proof_sha256=sha(path.read_bytes()))
        finally:
            subprocess.run(['/sbin/poweroff'], check=True, timeout=10, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return report


def observe_cache(base, phase, final):
    info = base.CACHE.lstat()
    base.require(stat.S_ISREG(info.st_mode) and info.st_uid == 1003 and not info.st_mode & 0o077 and info.st_nlink == 1,
                 'private cache ownership differs')
    expected = {KEY_A_REGISTER, KEY_A_CONSENT} if phase != 2 else {KEY_B_REGISTER, KEY_B_CANCEL}
    if phase == 3:
        expected.add(KEY_DENIED_REGISTER)
    with closing(sqlite3.connect('file:' + str(base.CACHE) + '?mode=ro', uri=True, timeout=2)) as db:
        db.execute('PRAGMA query_only=ON')
        db.execute('BEGIN')
        base.require(db.execute('PRAGMA integrity_check').fetchone()[0] == 'ok', 'cache integrity failed')
        tables = sorted(row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table'"))
        base.require(tables == base.TABLES, 'financial ledger or unknown table exists in device cache')
        rows = db.execute('SELECT key,payload,response FROM requests ORDER BY key').fetchall()
        base.require({row[0] for row in rows} == expected, 'cache has missing or unexpected request identities')
        receipts = []
        for key, payload, response in rows:
            pending = phase == 3 and key == KEY_DENIED_REGISTER
            base.require((response is None) is pending, 'unexpected unresolved cache request')
            if response is not None:
                base.require(json.loads(response)['ok'] is True, 'successful receipt was changed')
            receipts.append({'key': key, 'request_sha256': base.sha(payload.encode()),
                             'response_sha256': base.sha(response.encode()) if response else None})
        fingerprint, access_denied = db.execute('SELECT fingerprint,access_denied FROM identity WHERE singleton=1').fetchone()
        base.require(access_denied == int(phase == 3), 'durable access-denial state differs')
        cached, received_at = db.execute('SELECT payload,received_at FROM snapshot WHERE singleton=1').fetchone()
        stored = json.loads(cached)
        base.require(stored['available_minor'] == 4112 and stored['billed_minor'] == 888 and len(stored['bills']) == 1,
                     'retained cache balances/bill count differ')
        base.require(stored['membership']['entitlement']['auto_renew'] is (phase != 2), 'retained historical consent differs')
        if final is not None:
            base.require(final['account_sha256'] == base.sha(stored['membership']['entitlement']['account_id'].encode()),
                         'cache account differs from current owner response')
    absent = []
    for name in ('wallet-simulator.db', 'entitlement.db'):
        for suffix in ('', '-wal', '-shm', '-journal'):
            candidate = Path('/data/wallet') / (name + suffix)
            base.require(not candidate.exists() and not candidate.is_symlink(), 'local financial ledger appeared')
            absent.append(candidate.name)
    return {'mode': 'ro', 'query_only': True, 'integrity': 'ok', 'tables': tables, 'receipts': receipts,
            'authority_fingerprint': fingerprint, 'access_denied': bool(access_denied),
            'snapshot_sha256': base.sha(cached.encode()), 'received_at_unix': received_at,
            'account_sha256': base.sha(stored['membership']['entitlement']['account_id'].encode()),
            'local_ledger_files_absent': absent, 'retained_cache_is_disclosed_to_owner': phase != 3}


def main():
    if os.getuid() != 0 or os.geteuid() != 0 or sys.platform != 'linux' or os.uname().machine != 'aarch64':
        raise SystemExit('root ARM64 Linux test guest required')
    phase = select_phase(Path('/proc/cmdline').read_text())
    report = run(phase, common_module())
    return 0 if report['status'] == 'PASS' else 1


if __name__ == '__main__':
    raise SystemExit(main())

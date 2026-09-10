"""Owned purchaser authority across three normal OS shutdowns and UTC months.

This is a test harness, not a provider or a shipping clock/admin API. It creates
one new private authority and device disk. Run only after the root agent grants
the Linux VM/QEMU slot. No existing profile or delivered data is accepted.
"""
import argparse
from contextlib import closing
from datetime import datetime, timezone
import hashlib
import json
import multiprocessing as mp
import os
from pathlib import Path
import shutil
import socket
import sqlite3
import subprocess
import sys
import tempfile
import threading
import time

ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(ROOT/'src'), str(ROOT/'os')]
from blackberryrock.packages import canonical
from blackberryrock.sdk import sign_development, starter
from blackberryrock.wallet import Wallet
from entitlement.protocol import PUBLIC_TOKENS
from registry.publish import publish
from registry.server import Handler as RegistryHandler
from runner.build_fixture import remote_fixture
from runner.client import consent_for
from service_access.authority import ClosedServiceAuthority
from service_access.profile import prepare_profile
from service_access.serve import CONSUMERS, DEVICE, credentials, executor
from service_access.verify_os import TARGET, EXTRA, RecordedExecutor, closed_rows
from wallet_backend.server import Handler as WalletHandler, AUTHORITY_HEADER, DEVICE_HEADER
from wallet_backend.verify_os import sha, digest, utc, require, checkpoint, save, debug, cat, metadata, filesystem_check, markers, QMPObserver

TARGET = {**TARGET, 'os/service_access/status.py': '/usr/lib/rock-platform/service_access/status.py'}

PROBE = '/usr/libexec/rock-purchaser-offline-probe.py'
COMMON = '/usr/libexec/rock-purchaser-offline-common.py'
HOOK_PATH = '/etc/init.d/S99rock-purchaser-offline-verify'
HOOK = b'''#!/bin/sh
[ "${1:-start}" = start ] || exit 0
case " $(cat /proc/cmdline) " in
 *" rock.purchaser-offline.verify=1 "*|*" rock.purchaser-offline.verify=2 "*|*" rock.purchaser-offline.verify=3 "*)
 PYTHONDONTWRITEBYTECODE=1 /usr/bin/python3 -B /usr/libexec/rock-purchaser-offline-probe.py >/dev/console 2>&1 &
 ;;
esac
'''
LOCAL, REMOTE = 'org.rockstar.closed-local', 'org.rockstar.remote-text'
TEXT = '  off-device monthly proof  \n  one shared authority  '
OUTPUT = 'off-device monthly proof\none shared authority'
MONTHS = ('2026-09', '2026-10', '2026-11')
OCTOBER = int(datetime(2026, 10, 1, tzinfo=timezone.utc).timestamp())
NOVEMBER = int(datetime(2026, 11, 1, tzinfo=timezone.utc).timestamp())
OWN_SOURCES = ('os/service_access/verify_offline_os.py', 'os/service_access/guest_offline_probe.py')
FIXTURE_SOURCES = ('os/entitlement/fixtures/device-handoff.json',
                   'os/registry/fixtures/approved-authors.json',
                   'os/registry/fixtures/PUBLIC-AUTHOR-TOKEN.txt',
                   'os/registry/fixtures/PUBLIC-FIXTURE-KEY.pem')


def summary(authority):
    membership = authority.wallet.service.membership
    with membership.device_scope(DEVICE, 'alice'):
        wallet = authority.wallet.service.dispatch({'v': 1, 'op': 'snapshot'}, peer_uid=1002)['snapshot']
    contract = wallet['membership'].get('entitlement')
    access = authority.access.snapshot('alice-a')
    return {'authority_id': authority.authority_id, 'available_minor': wallet['available_minor'], 'held_minor': wallet['held_minor'],
            'billed_minor': wallet['billed_minor'], 'bills': [{'period': b['period'], 'amount_minor': b['amount_minor']} for b in wallet['bills']],
            'auto_renew': bool(contract and contract['auto_renew']), 'auth_active': bool(wallet['auth']['active']),
            'account_sha256': digest(wallet['membership'].get('account_id')),
            'credential_sha256': digest(wallet['auth'].get('credential_id')),
            'billing': [{'period': r['period'], 'status': r['status']} for r in wallet['billing']['history']],
            'paid_state': access['paid_state'], 'access_until': access['access_until'],
            'device_eligible': access['device_eligible'], 'allowed_actions': access['allowed_actions'],
            'shared_store': authority.access.store is membership.store is authority.runner_store.service_access.store,
            'simulation_only': True}


def duplicated_start(membership):
    """Exercise the real idempotent start API without creating another writer."""
    thread = membership.thread
    callers = [threading.Thread(target=membership.start) for _ in range(4)]
    for caller in callers: caller.start()
    for caller in callers: caller.join(3)
    require(all(not c.is_alive() for c in callers) and membership.thread is thread and thread.is_alive(),
            'repeated scheduler start created another worker or failed')
    return {'calls': 4, 'same_worker': True, 'worker_alive': True}


def authority_process(state_path, logfile, initial_clock, ports, expected_id, allow_cut, pipe):
    fd = os.open(logfile, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    os.dup2(fd, 1); os.dup2(fd, 2); os.close(fd)
    state = Path(state_path); state.mkdir(mode=0o700, exist_ok=expected_id is not None)
    clock = [initial_clock]; wire = []; lock = threading.Lock(); context = threading.local()
    cut = [False]; authority = None
    try:
        real = RecordedExecutor(executor(state))
        authority = ClosedServiceAuthority(state/'authority', consumers=CONSUMERS,
            device_credentials_file=credentials(state), executor=real, clock=lambda: clock[0],
            **(ports or {}))
        require(expected_id is None or authority.authority_id == expected_id, 'authority UUID changed on restart')
        membership = authority.wallet.service.membership
        membership.poll_seconds = .1; membership.retry_seconds = .1
        original = authority.wallet.service.dispatch
        def observe(request, **kwargs):
            # Record only requests processed by this HTTP worker, not private seed reads.
            if getattr(context, 'http', False): context.request = request
            return original(request, **kwargs)
        authority.wallet.service.dispatch = observe
        class ObservedWallet(WalletHandler):
            def do_POST(self):
                context.http = True; context.request = None
                try: super().do_POST()
                finally: context.http = False; context.request = None
            def respond(self, status, reply):
                request = getattr(context, 'request', None)
                dropping = False
                if request is not None:
                    with lock:
                        dropping = bool(allow_cut and not cut[0] and status == 200 and reply.get('ok') is True
                                        and request.get('key') == 'offline-consent')
                        if dropping: cut[0] = True
                        wire.append({'kind': 'wallet', 'clock': clock[0], 'op': request['op'], 'key': request.get('key'),
                                     'request_sha256': digest(request), 'response_sha256': digest(reply),
                                     'status': status, 'ok': reply.get('ok'), 'code': reply.get('code'),
                                     'body_cut_after_commit': dropping,
                                     'authority_matched': self.headers.get_all(AUTHORITY_HEADER, []) == [authority.authority_id],
                                     'device_matched': self.headers.get_all(DEVICE_HEADER, []) == [DEVICE]})
                if not dropping:
                    return super().respond(status, reply)
                # Real TLS headers advertise the full body; half is sent after the
                # actual service commit. A mock transport response is never used.
                raw = canonical(reply); self.close_connection = True
                self.send_response(status)
                for key, value in [('Content-Type', 'application/json'), ('Content-Length', str(len(raw))),
                                   ('Connection', 'close'), ('Cache-Control', 'no-store'),
                                   (AUTHORITY_HEADER, authority.authority_id), (DEVICE_HEADER, DEVICE)]:
                    self.send_header(key, value)
                self.end_headers(); self.wfile.write(raw[:max(1, len(raw)//2)]); self.wfile.flush()
                try: self.connection.shutdown(socket.SHUT_RDWR)
                except OSError: pass
        authority.wallet.RequestHandlerClass = ObservedWallet
        runner_dispatch = authority.runner_store.dispatch
        def runner_observe(envelope, **kwargs):
            reply = runner_dispatch(envelope, **kwargs)
            with lock:
                wire.append({'kind': 'runner', 'clock': clock[0], 'op': envelope['request']['op'],
                             'key': envelope['request']['key'], 'request_sha256': digest(envelope['request']),
                             'response_sha256': digest(reply['response']), 'ok': reply['response']['ok'],
                             'code': reply['response'].get('code'), 'authority_id': envelope.get('authority_id'),
                             'response_authority_id': reply.get('authority_id')})
            return reply
        authority.runner_store.dispatch = runner_observe
        class ObservedRegistry(RegistryHandler):
            def respond(self, status, body):
                super().respond(status, body)
                if self.command == 'GET':
                    with lock: wire.append({'kind': 'registry', 'clock': clock[0], 'path': self.path, 'status': status,
                        'body_sha256': hashlib.sha256(body).hexdigest(),
                        'authority_matched': self.headers.get_all('X-Rock-Service-Authority', []) == [authority.authority_id]})
        authority.registry.RequestHandlerClass = ObservedRegistry
        authority.start()
        repeated = duplicated_start(membership)
        packages = {}
        for n, package in enumerate([sign_development(starter(LOCAL, schema_version=2, recipe=[{'op': 'trim_lines'}])), remote_fixture()]):
            path = state/f'PUBLIC-offline-tool-{n}.rock.json'
            if path.exists(): require(path.read_bytes() == canonical(package), 'published fixture changed')
            else: path.write_bytes(canonical(package)); path.chmod(0o600)
            receipt = publish(f'https://127.0.0.1:{authority.registry.server_port}', authority.ca_file,
                              ROOT/'os/registry/fixtures/PUBLIC-AUTHOR-TOKEN.txt', path, 'offline-publish-' + str(n))
            packages[package['manifest']['id']] = {'package': package, 'sha256': digest(package), 'receipt_sha256': digest(receipt)}
        pipe.send({'ready': True, 'pid': os.getpid(), 'metadata': authority.metadata(),
                   'service': authority.device_configuration('alice-a'), 'wallet': authority.wallet_configuration('alice-a'),
                   'packages': packages, 'clock': clock[0], 'scheduler': repeated, 'summary': summary(authority)})
        while True:
            command = pipe.recv(); op = command['op']
            if op == 'stop': break
            if op == 'seed':
                before = summary(authority)
                require(before['auth_active'] and not before['auto_renew'] and before['billed_minor'] == before['available_minor'] == 0,
                        'private settlement must follow guest activation and precede consent')
                with membership.device_scope(DEVICE, 'alice'):
                    sale = original({'v': 1, 'op': 'wallet.sale', 'key': 'offline-private-sale', 'amount_minor': 5000}, peer_uid=1002)['result']
                    original({'v': 1, 'op': 'wallet.settle', 'key': 'offline-private-settle', 'id': sale['id']}, peer_uid=1002)
            elif op == 'clock':
                require(command.get('now') in (OCTOBER, NOVEMBER) and command['now'] > clock[0], 'fixed monotonic month transition required')
                clock[0] = command['now']
                duplicated_start(membership)
            elif op != 'snapshot': raise ValueError('unsupported fixed private fixture command')
            with lock: observed = list(wire)
            pipe.send({'clock': clock[0], 'summary': summary(authority), 'wire': observed, 'executions': list(real.calls)})
        final = {'clock': clock[0], 'summary': summary(authority), 'wire': list(wire), 'executions': list(real.calls)}
        authority.close(); authority = None
        final['end_threads'] = [{'name': thread.name, 'daemon': thread.daemon,
                                 'alive': thread.is_alive()} for thread in threading.enumerate()]
        pipe.send({'stopped': True, **final})
    except BaseException as error:
        try: pipe.send({'failure': type(error).__name__})
        except (OSError, EOFError): pass
        raise
    finally:
        if authority is not None: authority.close()
        pipe.close()


def receive(pipe, timeout=30):
    require(pipe.poll(timeout), 'owned authority response deadline exceeded')
    reply = pipe.recv(); require('failure' not in reply, 'owned authority failed; private diagnostic retained')
    return reply


def rpc(pipe, operation, **fields):
    pipe.send({'op': operation, **fields}); return receive(pipe)


def join_authority(child, record, timeout=15):
    """Preserve the actual exit diagnostics before enforcing normal termination."""
    record['join_started_utc'] = utc()
    try:
        child.join(timeout)
    finally:
        record.update(join_finished_utc=utc(), exit_code=child.exitcode,
                      alive_after_join=child.is_alive(),
                      proc_present_after_join=Path('/proc', str(child.pid)).exists())
    require(not record['alive_after_join'] and record['exit_code'] == 0,
            'authority process did not close normally')


def validate_money(value, count, renew, paid):
    require(value['simulation_only'] is True and value['available_minor'] == 5000 - 888*count and
            value['billed_minor'] == 888*count and value['held_minor'] == 0 and value['auto_renew'] is renew,
            'authoritative amount or recurring consent differs')
    require(sorted(value['bills'], key=lambda row: row['period']) ==
            [{'period': month, 'amount_minor': 888} for month in MONTHS[:count]], 'monthly debit count/period differs')
    require(value['paid_state'] == paid and value['device_eligible'] is True and value['shared_store'] is True,
            'purchaser contract projection or shared Store differs')
    require(all(row['status'] == 'paid' for row in value['billing']) and len(value['billing']) == count,
            'automatic due records not all paid exactly once')


def wait_money(pipe, count, renew, paid):
    deadline = time.monotonic() + 25
    while True:
        result = rpc(pipe, 'snapshot')
        try: validate_money(result['summary'], count, renew, paid)
        except AssertionError:
            require(time.monotonic() < deadline, 'automatic monthly projection did not converge')
            time.sleep(.1); continue
        return result


def inject(rootfs, output):
    entries = [('guest_offline_probe.py', PROBE, (ROOT/OWN_SOURCES[1]).read_bytes()),
               ('guest_offline_common.py', COMMON, (ROOT/'os/service_access/guest_probe.py').read_bytes()),
               ('S99rock-purchaser-offline-verify', HOOK_PATH, HOOK)]
    result = []
    for name, destination, raw in entries:
        require(metadata(rootfs, destination) is None, 'refuse to replace an existing guest path')
        (output/name).write_bytes(raw)
        require(b'Allocated inode' in debug(rootfs, 'write '+name+' '+destination, write=True, cwd=output), 'new guest entry not allocated')
        for field, value in [('mode', '0100755'), ('uid', '0'), ('gid', '0')]:
            debug(rootfs, 'set_inode_field '+destination+' '+field+' '+value, write=True)
        require(cat(rootfs, destination) == raw and metadata(rootfs, destination) ==
                {'type': 'regular', 'mode': 0o755, 'uid': 0, 'gid': 0}, 'guest test injection mismatch')
        result.append({'path': destination, 'sha256': hashlib.sha256(raw).hexdigest(), 'mode': 0o755})
    return result


def stopped_cache(data, private):
    require(metadata(data, '/wallet/wallet-simulator.db') is None and metadata(data, '/wallet/entitlement.db') is None,
            'guest has an unexpected local financial writer')
    with tempfile.TemporaryDirectory(dir=private, prefix='readonly-cache-') as tmp:
        path = Path(tmp)/'cache.db'; path.write_bytes(cat(data, '/wallet/backend-cache/remote-cache.db'))
        rows = closed_rows(path, 'SELECT key,payload,response FROM requests ORDER BY key')
        return [{'key': row['key'], 'op': json.loads(row['payload'])['op'],
                 'request_sha256': digest(json.loads(row['payload'])),
                 'response_sha256': digest(json.loads(row['response'])) if row['response'] else None} for row in rows]


def stopped_authenticator(data, private):
    with tempfile.TemporaryDirectory(dir=private, prefix='readonly-authenticator-') as tmp:
        path = Path(tmp)/'auth.sqlite3'; path.write_bytes(cat(data, '/authenticator/authenticator.sqlite3'))
        requests = closed_rows(path, 'SELECT request_key,operation,payload,response FROM requests ORDER BY request_key')
        credentials = closed_rows(path, 'SELECT credential_id,sign_count FROM credentials ORDER BY credential_id')
        return {'authenticator_request_count': len(requests), 'authenticator_requests_sha256': digest(requests),
                'authenticator_credential_count': len(credentials), 'authenticator_credentials_sha256': digest(credentials)}


def stopped_local_jobs(data, private, package_hash):
    with tempfile.TemporaryDirectory(dir=private, prefix='readonly-local-') as tmp:
        path = Path(tmp)/'hub.db'; path.write_bytes(cat(data, '/platform/hub.db'))
        rows = closed_rows(path, 'SELECT key,tool_id,status,input_bytes,output,error,package_hash FROM hub_jobs ORDER BY key')
        require([row['key'] for row in rows] == ['offline-local-november', 'offline-local-september'] and
                all(row['tool_id'] == LOCAL and row['status'] == 'succeeded' and row['error'] is None and
                    row['input_bytes'] == len(TEXT.encode()) and row['output'] == OUTPUT and
                    row['package_hash'] == package_hash for row in rows),
                'stopped local jobs differ from retained package and exact output')
        return [{'key': row['key'], 'package_hash': row['package_hash'],
                 'output_sha256': digest(row['output'])} for row in rows]


def closed_authority(state):
    wallet_path = state/'authority/wallet/wallet-simulator.db'
    membership_path = state/'authority/wallet/entitlement.db'
    with closing(sqlite3.connect('file:'+str(wallet_path)+'?mode=ro', uri=True)) as db:
        db.row_factory = sqlite3.Row; db.execute('PRAGMA query_only=ON'); db.execute('BEGIN')
        require(db.execute('PRAGMA integrity_check').fetchone()[0] == 'ok', 'closed authority ledger integrity failed')
        Wallet._verify(db)
        bills = [dict(row) for row in db.execute('SELECT period,amount_minor FROM wallet_bills ORDER BY period')]
        require(bills == [{'period': '2026-09', 'amount_minor': 888}, {'period': '2026-10', 'amount_minor': 888}], 'closed monthly bills differ')
        require(db.execute('SELECT COUNT(*) FROM wallet_withdrawals').fetchone()[0] == 0, 'unexpected authority ATM hold')
        rows = [dict(row) for row in db.execute("SELECT * FROM wallet_idempotency WHERE key LIKE 'offline-%' ORDER BY key")]
        wallet_receipts = {}
        for row in rows:
            payload = json.loads(row['input_json'])
            wallet_receipts[row['key']] = {'operation': row['operation'], 'input_sha256': digest(payload),
                'request_sha256': digest(payload['request']) if 'request' in payload else None,
                'result_sha256': digest(json.loads(row['result_json']))}
        enrolled = [dict(row) for row in db.execute('SELECT credential_id,device_id FROM wallet_auth_credentials')]
        require(len(enrolled) == 1 and enrolled[0]['device_id'] == DEVICE, 'authority enrollment identity differs')
        terms = [dict(row) for row in db.execute('SELECT credential_id,device_id,accepted,terms_version FROM wallet_auth_terms')]
        require(terms == [{'credential_id': enrolled[0]['credential_id'], 'device_id': DEVICE,
                          'accepted': 1, 'terms_version': 'rock-wallet-development/1'}],
                'separate Wallet terms were duplicated or changed')
        require(db.execute('SELECT COUNT(*) FROM wallet_auth_quotes').fetchone()[0] == 0,
                'monthly fee unexpectedly used a transaction assertion')
        authentication = {'credential_id_sha256': digest(enrolled[0]['credential_id']),
                          'credential_count': 1, 'wallet_terms_count': 1, 'quote_count': 0}
    with closing(sqlite3.connect('file:'+str(membership_path)+'?mode=ro', uri=True)) as db:
        db.row_factory = sqlite3.Row; db.execute('PRAGMA query_only=ON'); db.execute('BEGIN')
        require(db.execute('PRAGMA integrity_check').fetchone()[0] == 'ok', 'closed membership integrity failed')
        rows = [dict(row) for row in db.execute("SELECT key,request_json,response_json FROM device_api_receipts WHERE key LIKE 'offline-%' ORDER BY key")]
        receipts = [{'key': r['key'], 'request_sha256': digest(json.loads(r['request_json'])),
                     'response_sha256': digest(json.loads(r['response_json'])) if r['response_json'] else None} for r in rows]
        authorizations = [dict(row) for row in db.execute('SELECT period,state,attempt FROM authorizations ORDER BY period')]
        require(authorizations == [{'period': '2026-09', 'state': 'PAID', 'attempt': 1},
                                   {'period': '2026-10', 'state': 'PAID', 'attempt': 1}], 'authorization was duplicated or failed')
        due = [dict(row) for row in db.execute('SELECT period,status,failures FROM device_monthly_due ORDER BY period')]
        require(len(due) == 2 and all(r['status'] == 'paid' and r['failures'] == 0 for r in due), 'unexpected automatic due retry/failure')
        require(db.execute('SELECT COUNT(*) FROM accounts').fetchone()[0] == 1 and
                db.execute('SELECT COUNT(DISTINCT account_id) FROM authorizations').fetchone()[0] == 1,
                'monthly charges did not remain in one owner contract')
    return {'wallet_receipts': wallet_receipts, 'membership_receipts': receipts,
            'authorizations': authorizations, 'due': due, 'bills': bills, 'wallet_invariants': True,
            'authentication': authentication}


def validate_runner(rows, executions, boots, package, endpoint_id):
    """Join each terminal job to its signed package, exact consent and executor."""
    keys = ['offline-remote-october', 'offline-remote-september']
    require([row['key'] for row in rows] == keys and len(executions) == 2,
            'exact two paid Runner jobs and executions required')
    result = []
    for index, month in enumerate(('september', 'october')):
        key = 'offline-remote-' + month
        row = next(row for row in rows if row['key'] == key)
        request = {'v': 1, 'op': 'submit', 'key': key, 'endpoint_id': endpoint_id,
                   'package': package, 'text': TEXT,
                   'consent': consent_for(package, TEXT, target='cloud', endpoint_id=endpoint_id, key=key)}
        remote = boots[index]['guest']['remote']['remote']
        executed = executions[index]
        require(row['state'] == 'succeeded' and row['request_json'] is None and
                row['consumer_id'] == 'alice-a' and row['device_ref'] == DEVICE and
                row['request_sha256'] == digest(request), 'closed Runner request or origin differs')
        require(json.loads(row['output_json']) == remote['output'] == OUTPUT and
                json.loads(row['execution_json']) == remote['execution'] == executed['execution'] and
                executed['input_sha256'] == hashlib.sha256(TEXT.encode()).hexdigest() and
                executed['output_sha256'] == hashlib.sha256(OUTPUT.encode()).hexdigest() and
                executed['execution']['kind'] == 'actual_linux_isolated_process',
                'closed Runner output is not joined to the actual executor and guest')
        receipt = json.loads(row['receipt_json'])
        require(receipt['key'] == key and receipt['request_sha256'] == digest(request),
                'immutable Runner receipt differs from executed request')
        result.append({name: row[name] for name in ('key', 'state', 'request_sha256', 'consumer_id', 'device_ref')} |
                      {'receipt_sha256': digest(receipt), 'execution_sha256': digest(executed['execution']),
                       'output_sha256': executed['output_sha256']})
    return result


def validate_wallet_receipts(cache, closed, credential_hash):
    membership = {row['key']: row for row in closed['membership_receipts']}
    auth_keys = []
    for receipt in cache:
        if receipt['op'] in ('wallet.register', 'wallet.consent'):
            require(membership[receipt['key']] == {key: receipt[key] for key in
                    ('key', 'request_sha256', 'response_sha256')}, 'contract receipt differs from stopped OS cache')
        elif receipt['op'] in ('wallet.auth.begin', 'wallet.auth.enroll', 'wallet.terms'):
            row = closed['wallet_receipts'][receipt['key']]
            require((row['operation'], row['request_sha256'], row['result_sha256']) ==
                    (receipt['op'], receipt['request_sha256'], receipt['response_sha256']),
                    'authentication or terms receipt differs from stopped OS cache')
            auth_keys.append(receipt['key'])
    require(sorted(auth_keys) == ['offline-auth-begin', 'offline-auth-enroll', 'offline-terms'] and
            closed['authentication']['credential_id_sha256'] == credential_hash,
            'authority and device enrollment receipt join is incomplete')


def validate_proofs(boots, snapshots, wire):
    require(len(boots) == 3 and len({b['guest']['boot_id'] for b in boots}) == 3, 'three actual distinct OS boots required')
    auth = []
    for phase, boot in enumerate(boots, 1):
        proof = boot['guest']; wallet = proof['wallet_final']; private = proof['private_evidence']
        require(proof['status'] == 'PASS' and proof['phase'] == phase and private['pending'] == 0, 'guest proof incomplete')
        require((wallet['available_minor'], wallet['billed_minor'], wallet['bill_count'], wallet['auto_renew']) ==
                ((4112, 888, 1, True) if phase == 1 else (3224, 1776, 2, False)), 'guest authoritative totals differ')
        require(wallet['backend']['connected'] and not wallet['backend']['stale'] and
                not wallet['backend']['pending_reconciliation'] and wallet['auth_active'], 'guest cache not synchronized/active')
        require(proof['children'] and all(c['uid'] == c['gid'] == 1000 and c['groups'] == [] and
                c['peer_uid'] in (1002, 1004) for c in proof['children']), 'actual owner peer identity differs')
        require([p['uid'] for p in proof['environment']['processes']] == [1002, 1003, 1004], 'guest daemon roles differ')
        require(private['authenticator_request_count'] == private['authenticator_credential_count'] == 1,
                'monthly processing caused a new authentication ceremony')
        auth.append((private['authenticator_requests_sha256'], private['authenticator_credentials_sha256'], wallet['credential_id_sha256']))
        require(boot['cache_receipts'] == private['cache_receipts'], 'closed cache differs from guest observation')
        require(boot['authenticator'] == {k: private[k] for k in boot['authenticator']},
                'stopped authenticator differs from guest observation')
        status = proof['platform_service_access']
        require(status == wallet['service_access'] and status['authority_id'] == snapshots['september']['authority_id'] and
                status['device_ref'] == DEVICE and status['consumer_id'] == 'alice-a' and
                status['paid_state'] == ('PAUSED' if phase == 3 else 'PAID') and
                ('runner.cloud.submit' in status['allowed_actions']) is (phase != 3), 'guest paid projection or binding differs')
    require(len(set(auth)) == 1, 'credential identity or authenticator receipts changed across months')
    consent = [w for w in wire if w['kind'] == 'wallet' and w.get('key') == 'offline-consent']
    require(len(consent) >= 3 and sum(w['body_cut_after_commit'] for w in consent) == 1 and
            len({w['request_sha256'] for w in consent}) == len({w['response_sha256'] for w in consent}) == 1,
            'uncertain consent was not the same immutable request/receipt across restarts')
    require(all(w['authority_matched'] and w['device_matched'] for w in wire if w['kind'] == 'wallet'), 'Wallet wire binding differs')
    require(all(w['authority_id'] == w['response_authority_id'] == snapshots['september']['authority_id']
                for w in wire if w['kind'] == 'runner'), 'signed Runner authority pin differs')
    for name, count, renew, paid in [('september', 1, True, 'PAID'), ('october_off', 2, True, 'PAID'),
                                     ('october_restart', 2, True, 'PAID'), ('november_off', 2, False, 'PAUSED')]:
        validate_money(snapshots[name], count, renew, paid)
    require(any(w['kind'] == 'registry' and w['clock'] >= NOVEMBER and w['path'] == '/index.json' and
                w['status'] == 200 and w['authority_matched'] for w in wire), 'purchased Store access after cancellation not observed')


def verify(images, output):
    require(sys.platform == 'linux', 'authorized Linux VM required; host-only guards use unittest')
    output = Path(output).resolve(); output.mkdir(mode=0o700, parents=True, exist_ok=False)
    path = output/'report.json'
    report = {'schema': 'rock-purchaser-offline-os-proof/1', 'status': 'RUNNING', 'started_utc': utc(),
              'boots': [], 'authority_processes': [], 'snapshots': {}, 'simulation_only': True,
              'scope': 'three actual ARM64 direct-kernel OS boots, real UID1000/1004 IPC, one owned composite TLS authority; no GUI/provider/physical BlackBerry claim',
              'clock_scope': 'Only the private authority business clock advances to October/November after actual OS termination. Guest, TLS and HMAC wall clocks remain real UTC; months do not elapse in real time.',
              'host_power_commands': 0, 'input_device_data': 'new private disk only', 'private_control': 'fixture settlement and monotonic UTC month only; no remote admin endpoint'}
    guest = observer = child = pipe = None; verified = False; sources = {}; inputs = {}; wire = []; executions = []
    try:
        images = Path(images).resolve(strict=True); inputs = {name: sha(images/name) for name in ('Image', 'rootfs.ext4', 'stage0.cpio.gz')}
        sources = {name: sha(ROOT/name) for name in set(TARGET) | set(EXTRA) | set(OWN_SOURCES) | set(FIXTURE_SOURCES)}
        report.update(input_images=inputs, source_sha256=sources)
        for name, destination in TARGET.items(): require(hashlib.sha256(cat(images/'rootfs.ext4', destination)).hexdigest() == sources[name], 'embedded source differs: '+name)
        private = output/'private'; private.mkdir(mode=0o700); backend_state = private/'backend'
        clock = int(time.time()); require(datetime.fromtimestamp(clock, timezone.utc).strftime('%Y-%m') == '2026-09', 'fixed dated fixture requires September2026 host UTC')
        report['initial_private_clock'] = clock
        def start_authority(number, ports=None, identity=None, allow_cut=False):
            nonlocal pipe, child
            ctx = mp.get_context('spawn'); pipe, peer = ctx.Pipe()
            child = ctx.Process(target=authority_process, args=(str(backend_state), str(output/f'authority-{number}.log'), clock, ports, identity, allow_cut, peer))
            child.start(); peer.close(); ready = receive(pipe)
            require(child.is_alive() and ready.get('ready'), 'owned authority not ready')
            report['authority_processes'].append({'generation': number, 'pid': child.pid, 'started_utc': utc(), 'metadata': ready['metadata'], 'scheduler': ready['scheduler']})
            return ready
        def stop_authority():
            nonlocal pipe, child
            ended = rpc(pipe, 'stop'); require(ended.get('stopped'), 'authority normal stop not acknowledged')
            record = report['authority_processes'][-1]
            record.update(ack_received=True, acknowledged_utc=utc(), end_threads=ended['end_threads'])
            wire.extend(ended['wire']); executions.extend(ended['executions'])
            report.update(wire=wire, executions=executions)
            checkpoint(path, report)
            join_authority(child, record)
            record['stopped_utc'] = utc()
            pipe.close(); pipe = child = None
            return ended
        ready = start_authority(1, allow_cut=True); authority_id = ready['metadata']['authority_id']
        report['authority_id'] = authority_id
        ports = {k: ready['metadata'][k] for k in ('registry_port', 'runner_port', 'wallet_port')}
        profile = prepare_profile(images, private/'profile', expected_sha256=inputs, service_configuration=ready['service'],
            wallet_configuration=ready['wallet'], wallet_token=PUBLIC_TOKENS['alice'],
            authenticator_configuration={'schema_version': 1, 'kind': 'public-software-test-authenticator', 'device_ref': DEVICE})
        report['profile'] = {k: profile[k] for k in ('schema', 'status', 'images', 'binding', 'injected_files', 'source_sha256', 'stage0')}
        rootfs = private/'test-rootfs.ext4'; shutil.copyfile(private/'profile/rootfs.ext4', rootfs); rootfs.chmod(0o600)
        report['test_injections'] = inject(rootfs, output); test_hash = sha(rootfs); report['test_rootfs_sha256'] = test_hash
        data = private/'userdata.ext4'
        with data.open('xb') as stream: stream.truncate(256*1024*1024)
        subprocess.run(['mkfs.ext4', '-q', '-F', '-L', 'rock-data', str(data)], check=True, capture_output=True, timeout=30)
        report['initial_data_sha256'] = sha(data)
        with tempfile.TemporaryDirectory(prefix='rock-purchaser-offline-qmp-') as tmp:
            for phase in (1, 2, 3):
                logfile = output/f'boot-{phase}.log'; monitor = Path(tmp)/f'{phase}.sock'
                boot = {'phase': phase, 'started_utc': utc(), 'data_before_sha256': sha(data), 'kernel_sha256': sha(images/'Image'), 'rootfs_sha256': sha(rootfs)}
                report['boots'].append(boot)
                command = ['qemu-system-aarch64', '-machine', 'virt-10.0,gic-version=3', '-accel', 'tcg', '-cpu', 'cortex-a53', '-m', '1024', '-smp', '2', '-display', 'none', '-serial', 'stdio', '-monitor', 'none', '-qmp', f'unix:{monitor},server=on,wait=off', '-no-reboot', '-kernel', str(images/'Image'), '-append', 'console=ttyAMA0 vt.global_cursor_default=0 fbcon=map:1 root=/dev/vda ro rootflags=noload rootwait panic=-1 rock.purchaser-offline.verify='+str(phase), '-drive', f'if=none,file={rootfs},format=raw,id=osdisk,readonly=on', '-device', 'virtio-blk-pci,drive=osdisk,addr=0x1', '-drive', f'if=none,file={data},format=raw,id=userdata', '-device', 'virtio-blk-pci,drive=userdata,addr=0x2', '-object', 'rng-random,filename=/dev/urandom,id=rockrng', '-device', 'virtio-rng-pci,rng=rockrng,addr=0x3', '-device', 'virtio-gpu-pci,xres=720,yres=960,addr=0x4', '-device', 'virtio-keyboard-pci,addr=0x5', '-device', 'virtio-tablet-pci,addr=0x6', '-netdev', 'user,id=services', '-device', 'virtio-net-pci,netdev=services,addr=0x7,romfile=']
                boot['command'] = command; checkpoint(path, report)
                with logfile.open('xb') as log:
                    guest = subprocess.Popen(command, stdin=subprocess.DEVNULL, stdout=log, stderr=subprocess.STDOUT); boot['pid'] = guest.pid
                    deadline = time.monotonic()+15
                    while not monitor.exists(): require(guest.poll() is None and time.monotonic()<deadline, 'QEMU monitor unavailable'); time.sleep(.05)
                    observer = QMPObserver(monitor); deadline = time.monotonic()+210; seeded = False
                    while guest.poll() is None:
                        content = logfile.read_text(errors='replace')
                        require(not markers(content, 'ROCK_PURCHASER_OFFLINE_GUEST_FAIL'), 'guest assertion failed')
                        found = markers(content, 'ROCK_PURCHASER_OFFLINE_SEED_READY')
                        if phase == 1 and found and not seeded:
                            require(len(found)==1 and found[0]['phase']==1, 'unexpected fixture seed marker')
                            boot['private_seed'] = {'observed_utc': utc(), 'marker': found[0], 'summary': rpc(pipe, 'seed')['summary']}; seeded = True
                        require(time.monotonic()<deadline, 'guest normal shutdown deadline exceeded'); time.sleep(.1)
                    boot.update(exit_code=guest.returncode, terminated_utc=utc()); require(guest.returncode==0, 'QEMU exited abnormally')
                    observer.thread.join(3); boot['qmp_events']=observer.events; require(not observer.errors, 'QMP observation failed'); observer.close(); observer=None
                guest = None
                content = logfile.read_text(errors='replace')
                require('EXT4-fs (vdb): unmounting filesystem' in content and 'reboot: Power down' in content, 'normal data unmount and kernel poweroff missing')
                require(len([e for e in boot['qmp_events'] if e['event']=='SHUTDOWN' and e.get('data',{}).get('guest') is True])==1, 'guest-initiated shutdown missing')
                require(phase != 1 or seeded, 'fixture seed did not occur')
                boot['filesystem'] = filesystem_check(data, output, phase)
                raw = cat(data, f'/purchaser-offline-{phase}.json'); proof = json.loads(raw)
                require(markers(content, 'ROCK_PURCHASER_OFFLINE_GUEST_PASS') == [{'phase':phase,'boot_id':proof['boot_id'],'proof_sha256':hashlib.sha256(raw).hexdigest()}], 'serial/durable proof mismatch')
                save(output/f'guest-proof-{phase}.json', proof)
                boot.update(guest=proof, proof_sha256=sha(output/f'guest-proof-{phase}.json'), boot_log_sha256=sha(logfile), cache_receipts=stopped_cache(data, private), authenticator=stopped_authenticator(data, private), data_after_sha256=sha(data))
                expected_sources = {destination: sources[name] for name, destination in TARGET.items()}
                expected_sources.update({row['path']: row['sha256'] for row in report['profile']['injected_files'] + report['test_injections']})
                require(all(expected_sources.get(name) == value for name, value in proof['environment']['source_sha256'].items()),
                        'actual guest source or protected configuration differs')
                require(sha(rootfs)==test_hash, 'test rootfs changed')
                if phase == 1:
                    report['snapshots']['september'] = wait_money(pipe, 1, True, 'PAID')['summary']
                    require(child.is_alive(), 'backend stopped with OS')
                    clock = OCTOBER; report['october_clock_after_qemu_termination'] = {'observed_utc':utc(), 'guest_terminated_utc':boot['terminated_utc'], 'transition':rpc(pipe,'clock',now=clock)['clock']}
                    report['snapshots']['october_off'] = wait_money(pipe,2,True,'PAID')['summary']
                    time.sleep(.5); validate_money(rpc(pipe,'snapshot')['summary'],2,True,'PAID')
                    stop_authority(); ready2 = start_authority(2, ports, authority_id)
                    require(ready2['service']==ready['service'] and ready2['wallet']==ready['wallet'], 'restarted backend endpoint/profile changed')
                    report['snapshots']['october_restart'] = wait_money(pipe,2,True,'PAID')['summary']
                elif phase == 2:
                    validate_money(rpc(pipe,'snapshot')['summary'],2,False,'PAID')
                    clock = NOVEMBER; report['november_clock_after_canceled_os_termination'] = {'observed_utc':utc(), 'guest_terminated_utc':boot['terminated_utc'], 'transition':rpc(pipe,'clock',now=clock)['clock']}
                    report['snapshots']['november_off'] = wait_money(pipe,2,False,'PAUSED')['summary']
                    time.sleep(.5); validate_money(rpc(pipe,'snapshot')['summary'],2,False,'PAUSED')
                else: validate_money(rpc(pipe,'snapshot')['summary'],2,False,'PAUSED')
                checkpoint(path, report)
        stop_authority()
        report.update(wire=wire, executions=executions, closed_authority=closed_authority(backend_state))
        validate_proofs(report['boots'],report['snapshots'],wire)
        rows = closed_rows(backend_state/'authority/runner/jobs.sqlite3', 'SELECT * FROM jobs ORDER BY key')
        report['closed_runner'] = validate_runner(rows, executions, report['boots'],
            ready['packages'][REMOTE]['package'], ready['metadata']['endpoint_id'])
        validate_wallet_receipts(report['boots'][-1]['cache_receipts'], report['closed_authority'],
                                report['boots'][-1]['guest']['wallet_final']['credential_id_sha256'])
        report['closed_local_jobs'] = stopped_local_jobs(data, private, ready['packages'][LOCAL]['sha256'])
        require(report['closed_local_jobs'] == sorted([report['boots'][index]['guest']['local'] for index in (0, 2)],
                key=lambda row: row['key']), 'local guest/closed database output join differs')
        report['final_data_sha256']=sha(data); verified=True; report['status']='VERIFYING_CLEANUP'
    except BaseException as error:
        report.update(status='FAIL',error_type=type(error).__name__)
        if isinstance(error,AssertionError): report['error_label']=str(error)[:200]
    finally:
        checkpoint(path,report)
        if guest is not None and guest.poll() is None:
            report['status']='FAIL';report['forced_qemu_cleanup']=True
            try:
                guest.terminate()
                try: guest.wait(5)
                except subprocess.TimeoutExpired: guest.kill();guest.wait(5)
            except BaseException as error: report.setdefault('cleanup_errors',[]).append('QEMU:'+type(error).__name__)
        if observer is not None:
            try: observer.close()
            except BaseException as error: report.setdefault('cleanup_errors',[]).append('QMP:'+type(error).__name__)
        if child is not None:
            try:
                if child.is_alive() and pipe is not None:
                    try: pipe.send({'op':'stop'})
                    except (OSError,EOFError): pass
                child.join(15)
                if child.is_alive():
                    report['forced_authority_cleanup']=True;child.terminate();child.join(5)
                    if child.is_alive(): child.kill();child.join(5)
                report['authority_cleanup_exit_code'] = child.exitcode
                report['authority_cleanup_alive'] = child.is_alive()
                require(child.exitcode==0,'authority abnormal exit')
            except BaseException as error: report.setdefault('cleanup_errors',[]).append('authority:'+type(error).__name__)
            finally:
                if pipe is not None: pipe.close()
        try:
            report['sources_unchanged']=all(sha(ROOT/p)==h for p,h in sources.items())
            report['images_unchanged']=all(sha(images/p)==h for p,h in inputs.items())
        except BaseException: report['sources_unchanged']=report['images_unchanged']=False
        report['status']='PASS' if verified and report['status']!='FAIL' and not report.get('cleanup_errors') and not report.get('forced_authority_cleanup') and report['sources_unchanged'] and report['images_unchanged'] else 'FAIL'
        report['finished_utc']=utc(); checkpoint(path,report)
    print(json.dumps({'status':report['status'],'report':str(path),'report_sha256':sha(path)},sort_keys=True))
    return 0 if report['status']=='PASS' else 1


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--images',type=Path,required=True)
    parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args();os.umask(0o077)
    return verify(args.images,args.output)


if __name__ == '__main__': sys.exit(main())

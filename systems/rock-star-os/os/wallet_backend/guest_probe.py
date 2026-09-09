#!/usr/bin/python3
"""Explicitly flagged ARM64 test: real UID1000 IPC, read-only cache observation.

Only the child sends owner requests. Root never seeds funds or advances billing:
the independent host harness performs those simulator-only backend operations.
No bearer token, raw response, account identifier or ATM credential is published.
"""
from contextlib import closing
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import stat
import subprocess
import sys
import time

PLATFORM_ROOT = Path('/usr/lib/rock-platform')
CONFIG = Path('/etc/rock-wallet/backend.json')
CACHE = Path('/data/wallet/backend-cache/remote-cache.db')
TERMS = 'simulator-monthly-usd-8.88-v1'
TABLES = ['identity', 'requests', 'snapshot']
OFFLINE_INTERFACES = frozenset(('lo', 'dummy0', 'sit0'))
CHILD = r"""import json,os,sys
sys.path.insert(0,'/usr/lib/rock-platform')
from service import call,PLATFORM_SOCKET,PLATFORM_UID
assert os.getuid()==os.geteuid()==1000 and os.getgid()==os.getegid()==1000 and os.getgroups()==[]
try:
    response=call(PLATFORM_SOCKET,json.load(sys.stdin),PLATFORM_UID,return_errors=True)
    result={'transport_ok':True,'response':response}
except (OSError,ValueError) as error:
    result={'transport_ok':False,'error_type':type(error).__name__}
result.update(pid=os.getpid(),uid=os.geteuid(),gid=os.getegid(),groups=os.getgroups(),expected_peer_uid=PLATFORM_UID)
print(json.dumps(result,separators=(',',':')))
"""


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


class ProbeCheckFailed(AssertionError):
    """Only fixed helper checks may expose their diagnostic label."""


def require(condition, label):
    if not condition:
        raise ProbeCheckFailed(label)


def select_phase(cmdline):
    flags = [part for part in cmdline.split() if part.startswith('rock.wallet.verify=')]
    require(len(flags) == 1 and flags[0] in ('rock.wallet.verify=1', 'rock.wallet.verify=2', 'rock.wallet.verify=3'),
            'one exact Wallet verification flag required')
    return int(flags[0][-1])


def wallet_view(wallet):
    require(isinstance(wallet, dict) and wallet.get('simulation_only') is True, 'simulator Wallet snapshot required')
    membership = wallet['membership']
    entitlement = membership.get('entitlement')
    require(membership.get('real_identity_verified') is False and membership.get('identity_source') == 'public-development-fixture',
            'public identity fixture boundary differs')
    names = ('available_minor', 'billed_minor', 'held_minor', 'pending_minor', 'dispensed_minor', 'ledger_balance_minor')
    require(all(type(wallet.get(name)) is int for name in names), 'integer Wallet balances required')
    require(wallet['ledger_balance_minor'] == 0, 'unbalanced reported ledger')
    require(wallet.get('currency') == 'USD' and wallet.get('monthly_fee_minor') == 888, 'fixed monthly USD fee differs')
    bills = wallet['bills']
    require(isinstance(bills, list) and len(bills) <= 2 and all(item['amount_minor'] == 888 for item in bills),
            'unexpected monthly bills')
    require(wallet.get('record_counts', {}).get('bills', len(bills)) == len(bills), 'truncated bill evidence')
    view = {name: wallet[name] for name in names}
    view.update(registered=membership['registered'], auto_renew=entitlement['auto_renew'] if entitlement else False,
                bill_count=len(bills), bill_periods=sorted(item['period'] for item in bills))
    backend = wallet.get('backend')
    if backend is not None:
        require(backend['authority'] == 'remote_development_backend' and backend['cache_is_spendable'] is False and
                backend['simulation_only'] is True, 'remote authority or nonspendable cache boundary differs')
        view['backend'] = {name: backend[name] for name in ('authority', 'connected', 'stale', 'last_sync_unix',
                                                        'pending_reconciliation', 'cache_is_spendable', 'simulation_only')}
    return view


class Probe:
    def __init__(self, phase):
        self.phase = phase
        self.boot_id = Path('/proc/sys/kernel/random/boot_id').read_text().strip()
        self.deadline = time.monotonic() + 70
        self.events = []
        self.children = []
        self.initial = None

    def emit(self, marker, **fields):
        print('\n' + marker + ' ' + json.dumps({'phase': self.phase, 'boot_id': self.boot_id, **fields}, sort_keys=True), flush=True)

    def owner(self, request):
        remaining = self.deadline - time.monotonic()
        require(remaining > 0, 'phase deadline exceeded')
        child = subprocess.run(['/usr/bin/python3', '-I', '-B', '-c', CHILD], input=canonical(request),
                               capture_output=True, timeout=min(12, remaining), user=1000, group=1000, extra_groups=[])
        require(child.returncode == 0, 'owner IPC child failed; output withheld')
        packet = json.loads(child.stdout)
        require(packet['uid'] == packet['gid'] == 1000 and packet['groups'] == [] and packet['expected_peer_uid'] == 1002,
                'owner or service process identity differs')
        self.children.append({name: packet[name] for name in ('pid', 'uid', 'gid', 'groups', 'expected_peer_uid')})
        if not packet['transport_ok']:
            # Request may have been accepted; every mutation retry retains its
            # exact original payload and key. No new operation is invented.
            return {'ok': False, 'code': 'unavailable', '_probe_transport_failure': True}
        response = packet['response']
        require(isinstance(response, dict) and type(response.get('ok')) is bool, 'invalid owner response')
        if request['op'] != 'snapshot':
            self.events.append({'op': request['op'], 'key': request.get('key'), 'request_sha256': sha(canonical(request)),
                                'response_sha256': sha(canonical(response)), 'ok': response['ok'],
                                'error_kind': response.get('code') if response['ok'] is False else None})
        return response

    def snapshot(self):
        reply = self.owner({'v': 1, 'op': 'snapshot'})
        if not reply['ok']:
            require(reply.get('code') == 'unavailable', 'snapshot definitively rejected')
            return None
        wallet = reply['snapshot'].get('wallet')
        return wallet_view(wallet) if wallet is not None else None

    def wait(self, condition):
        while time.monotonic() < self.deadline:
            state = self.snapshot()
            if state is not None and condition(state):
                return state
            time.sleep(.15)
        raise ProbeCheckFailed('expected Wallet state did not arrive before deadline')

    def mutate(self, request):
        while time.monotonic() < self.deadline:
            response = self.owner(request)
            if response['ok']:
                require(isinstance(response.get('result'), dict), 'mutation receipt missing')
                return response
            require(response.get('code') == 'unavailable', 'online mutation definitively rejected')
            time.sleep(.15)
        raise ProbeCheckFailed('mutation outcome unresolved before deadline')


def online(state):
    backend = state.get('backend', {})
    return backend.get('connected') is True and backend.get('stale') is False and backend.get('pending_reconciliation') is False


def amounts(state, available, billed, count, renew):
    return (state['available_minor'], state['billed_minor'], state['bill_count'], state['auto_renew'],
            state['held_minor'], state['pending_minor'], state['dispensed_minor']) == (available, billed, count, renew, 0, 0, 0)


def observe_cache(phase, final):
    expected = {
        'os-wallet-register': {'v': 1, 'op': 'wallet.register', 'key': 'os-wallet-register'},
        'os-wallet-consent': {'v': 1, 'op': 'wallet.consent', 'key': 'os-wallet-consent', 'accepted': True, 'terms_version': TERMS},
    }
    if phase == 3:
        expected['os-wallet-final-cancel'] = {'v': 1, 'op': 'wallet.consent', 'key': 'os-wallet-final-cancel',
                                             'accepted': False, 'terms_version': TERMS}
    info = CACHE.lstat()
    require(stat.S_ISREG(info.st_mode) and info.st_uid == 1003 and info.st_mode & 0o077 == 0 and info.st_nlink == 1,
            'cache database ownership or protection differs')
    with closing(sqlite3.connect('file:' + str(CACHE) + '?mode=ro', uri=True, timeout=2)) as db:
        db.execute('PRAGMA query_only=ON')
        db.execute('BEGIN')
        require(db.execute('PRAGMA integrity_check').fetchone()[0] == 'ok', 'cache integrity failed')
        tables = sorted(row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table'"))
        require(tables == TABLES, 'device cache contains unexpected or financial ledger tables')
        rows = db.execute('SELECT key,payload,response FROM requests ORDER BY key').fetchall()
        require({row[0] for row in rows} == set(expected), 'missing, duplicate or unexpected owner mutation persisted')
        receipts = []
        for key, payload, response in rows:
            require(json.loads(payload) == expected[key] and response is not None and json.loads(response).get('ok') is True,
                    'cache request or durable receipt differs')
            receipts.append({'key': key, 'op': expected[key]['op'], 'request_sha256': sha(payload.encode()),
                             'response_sha256': sha(response.encode()), 'completed': True})
        cached, received_at = db.execute('SELECT payload,received_at FROM snapshot WHERE singleton=1').fetchone()
        require(wallet_view(json.loads(cached)) == {key: value for key, value in final.items() if key != 'backend'},
                'read-only cached balances disagree with owner-visible final snapshot')
        # The normal UI may refresh the same snapshot between our owner read
        # and this read-only transaction. It may advance freshness, not funds.
        require(received_at >= final['backend']['last_sync_unix'] and received_at > 0, 'cache synchronization time regressed')
        require(db.execute('SELECT COUNT(*) FROM identity').fetchone()[0] == 1, 'cache authority identity missing')
        fingerprint = db.execute('SELECT fingerprint FROM identity').fetchone()[0]
    absent = []
    for basename in ('wallet-simulator.db', 'entitlement.db'):
        for suffix in ('', '-wal', '-shm', '-journal'):
            path = Path('/data/wallet') / (basename + suffix)
            require(not path.exists() and not path.is_symlink(), 'local financial ledger unexpectedly exists')
            absent.append(path.name)
    return {'mode': 'ro', 'query_only': True, 'integrity': 'ok', 'tables': tables,
            'request_count': len(rows), 'receipts': receipts, 'pending_count': 0,
            'offline_cancel_persisted': False, 'authority_fingerprint': fingerprint,
            'snapshot_sha256': sha(cached.encode()), 'received_at_unix': received_at,
            'local_ledger_files_absent': absent, 'owner_uid': info.st_uid, 'mode_octal': oct(stat.S_IMODE(info.st_mode))}


def environment(phase):
    mounts = {}
    for line in Path('/proc/mounts').read_text().splitlines():
        source, point, filesystem, options, *_ = line.split()
        if point in ('/', '/data'):
            mounts[point] = {'source': source, 'filesystem': filesystem, 'options': options.split(',')}
    require('ro' in mounts['/']['options'] and mounts['/data']['filesystem'] == 'ext4' and 'rw' in mounts['/data']['options'],
            'actual read-only root or writable ext4 data mount differs')
    interfaces = sorted(path.name for path in Path('/sys/class/net').iterdir())
    device_backed = sorted(name for name in interfaces if
                           (Path('/sys/class/net') / name / 'device').exists() or
                           (Path('/sys/class/net') / name / 'device').is_symlink())
    no_nic = 'lo' in interfaces and set(interfaces) <= OFFLINE_INTERFACES and not device_backed
    if phase == 2:
        require(no_nic, 'offline phase permits only fixed virtual interfaces and no device-backed network interface')
    config_raw = CONFIG.read_bytes()
    config = json.loads(config_raw)
    require(config['mode'] == 'development-remote-authority', 'explicit remote configuration required')
    sources = {str(path): sha(path.read_bytes()) for path in
               (Path(__file__).resolve(), PLATFORM_ROOT / 'service.py', PLATFORM_ROOT / 'wallet_backend/client.py',
                PLATFORM_ROOT / 'entitlement/protocol.py')}
    processes = []
    for role, uid in (('platform', 1002), ('wallet', 1003)):
        pid = int(Path('/run/rock-' + role + '.pid').read_text())
        status = dict(line.split(':', 1) for line in Path('/proc/' + str(pid) + '/status').read_text().splitlines() if ':' in line)
        uids = [int(value) for value in status['Uid'].split()]
        require(uids == [uid] * 4, 'daemon process ownership differs')
        processes.append({'role': role, 'pid': pid, 'uids': uids})
    return {'machine': os.uname().machine, 'kernel': os.uname().release, 'root_uid': os.geteuid(),
            'mounts': mounts, 'network_interfaces': interfaces, 'device_backed_network_interfaces': device_backed,
            'no_guest_nic': no_nic,
            'configuration_sha256': sha(config_raw), 'pinned_authority_id': config['authority_id'],
            'origin': config['origin'], 'ca_sha256': sha(Path(config['ca_file']).read_bytes()),
            'source_sha256': sources, 'daemon_processes': processes}


def save(phase, report):
    path = Path('/data/wallet-backend-' + str(phase) + '.json')
    temp = path.with_suffix('.json.tmp')
    descriptor = os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(descriptor, 'wb') as stream:
        stream.write(canonical(report) + b'\n')
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(temp, path)
    descriptor = os.open('/data', os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)
    return sha(path.read_bytes())


def run(probe):
    phase = probe.phase
    if phase == 1:
        first = probe.wait(online)
        probe.initial = first
        require(not first['registered'] and amounts(first, 0, 0, 0, False), 'first phase requires a fresh unregistered authority')
        probe.mutate({'v': 1, 'op': 'wallet.register', 'key': 'os-wallet-register'})
        registered = probe.wait(lambda state: online(state) and state['registered'])
        require(amounts(registered, 0, 0, 0, False), 'registration must not seed funds or consent')
        probe.emit('ROCK_WALLET_READY_FOR_SEED')
        probe.wait(lambda state: online(state) and amounts(state, 5000, 0, 0, False))
        probe.mutate({'v': 1, 'op': 'wallet.consent', 'key': 'os-wallet-consent', 'accepted': True, 'terms_version': TERMS})
        final = probe.wait(lambda state: online(state) and amounts(state, 4112, 888, 1, True))
    elif phase == 2:
        def stale(state):
            backend = state.get('backend', {})
            return backend.get('connected') is False and backend.get('stale') is True and backend.get('last_sync_unix', 0) > 0
        before = probe.wait(stale)
        probe.initial = before
        require(amounts(before, 4112, 888, 1, True) and before['backend']['pending_reconciliation'] is False,
                'offline cache differs from first synchronized month')
        response = probe.owner({'v': 1, 'op': 'wallet.consent', 'key': 'os-wallet-offline-cancel',
                                'accepted': False, 'terms_version': TERMS})
        require(response.get('ok') is False and response.get('code') == 'unavailable' and
                not response.get('_probe_transport_failure', False),
                'offline cancellation needs an actual unavailable Platform response')
        final = probe.wait(stale)
        require(final == before and final['backend']['pending_reconciliation'] is False,
                'provably unsent offline cancellation must not change state or enter pending queue')
    else:
        probe.initial = probe.wait(lambda state: online(state) and amounts(state, 3224, 1776, 2, True))
        probe.mutate({'v': 1, 'op': 'wallet.consent', 'key': 'os-wallet-final-cancel', 'accepted': False, 'terms_version': TERMS})
        final = probe.wait(lambda state: online(state) and amounts(state, 3224, 1776, 2, False))
        probe.emit('ROCK_WALLET_CANCELED')
        # Host advances its simulator clock separately after this marker. The
        # guest proves repeated state; only the joined host proof proves time.
        until = time.monotonic() + 2
        observations = 0
        while time.monotonic() < until or observations < 2:
            final = probe.wait(online)
            require(amounts(final, 3224, 1776, 2, False), 'cancellation failed to retain exactly two paid months')
            observations += 1
            time.sleep(.15)
    return final


def main():
    require(os.getuid() == os.geteuid() == 0 and sys.platform == 'linux' and os.uname().machine == 'aarch64',
            'root Linux ARM64 test guest required')
    phase = select_phase(Path('/proc/cmdline').read_text())
    probe = Probe(phase)
    report = {'schema_version': 1, 'phase': phase, 'boot_id': probe.boot_id,
              'status': 'FAIL', 'started_at_unix': time.time(), 'simulation_only': True,
              'actual_execution': 'ARM64 guest UID1000 Platform AF_UNIX to UID1003 HTTPS proxy',
              'scope': {'native_gui': 'NOT_RUN', 'physical_blackberry': 'NOT_RUN', 'production_provider': 'NOT_CONNECTED',
                        'real_money': False, 'host_clock_transition': 'requires independent host proof'},
              'shutdown': {'requested': 'normal /sbin/poweroff via explicit test hook', 'native_power_ui': False,
                           'completion': 'requires host exit and closed ext4 verification'}}
    try:
        report['environment'] = environment(phase)
        report['wallet_final'] = run(probe)
        report['wallet_initial'] = probe.initial
        report['cache'] = observe_cache(phase, report['wallet_final'])
        report['receipts'] = {receipt['key']: receipt for receipt in report['cache']['receipts']}
        report['owner_processes'] = probe.children
        report['owner_mutations'] = probe.events
        report['status'] = 'PASS'
    except Exception as error:
        # Exception text can contain captured IPC bytes; publish its type only.
        report['error_type'] = type(error).__name__
        if isinstance(error, ProbeCheckFailed):
            report['error_label'] = str(error)[:140]
        report['owner_processes'] = probe.children
        report['owner_mutations'] = probe.events
    report['finished_at_unix'] = time.time()
    digest = save(phase, report)
    probe.emit('ROCK_WALLET_GUEST_' + report['status'], proof_sha256=digest)
    subprocess.run(['/sbin/poweroff'], check=True, timeout=10, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return 0 if report['status'] == 'PASS' else 1


if __name__ == '__main__':
    raise SystemExit(main())

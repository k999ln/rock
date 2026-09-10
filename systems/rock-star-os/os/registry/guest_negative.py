#!/usr/bin/python3
"""Flagged disposable OS test: uid1000 API actions; root observes/injects ENOSPC.

No debug server, arbitrary path or root owner API exists. The only filesystem
fault is a bounded tmpfs over the fixed registry package cache. Normal init
poweroff is test completion, not native GUI power evidence.
"""
from contextlib import closing
import errno
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import stat
import subprocess
import sys
import time
sys.path[:0] = [str(Path(__file__).resolve().parents[1]/'platform'), '/usr/lib/rock-platform']
import verification_scope

TOOL = 'org.rockstar.negative-text-kit'
BAD = 'org.rockstar.negative-signature'
FUTURE = 'org.rockstar.negative-future'
TEXT = '  Zebra  \nApple\nApple\n  Moon'
OUTPUT1 = 'Apple\nMoon\nZebra'
OUTPUT2 = '- Apple\n- Moon\n- Zebra'
CACHE = Path('/data/platform/registry-cache/packages')
HUB = Path('/data/platform/hub.db')
REMOTE = Path('/data/platform/remote/remote.sqlite3')
PROOF = Path('/data/registry-negative-proof.json')
FLAG = 'rock.registry.negative=1'
CHILD = r'''import hashlib,http.client,json,os,re,ssl,sys
sys.path.insert(0,'/usr/lib/rock-platform')
from service import call,PLATFORM_SOCKET,PLATFORM_UID
assert os.getuid()==os.geteuid()==1000 and os.getgid()==os.getegid()==1000 and os.getgroups()==[]
request=json.load(sys.stdin)
try:
    if set(request)=={'fixed_revoked_get'}:
        digest=request['fixed_revoked_get']
        assert re.fullmatch('[0-9a-f]{64}',digest)
        context=ssl.create_default_context(cafile='/usr/share/rock/development-store-ca.pem')
        connection=http.client.HTTPSConnection('10.0.2.2',9443,context=context,timeout=5)
        try:
            connection.request('GET','/packages/'+digest+'.rock.json',headers={'Connection':'close'})
            reply=connection.getresponse(); raw=reply.read(4097)
            assert len(raw)<=4096
            response={'status':reply.status,'body':raw.decode(),'headers':dict(reply.getheaders())}
        finally: connection.close()
    else:
        response=call(PLATFORM_SOCKET,request,PLATFORM_UID,timeout=15,response_timeout=15,return_errors=True)
    packet={'transport_ok':True,'response':response}
except (OSError,ValueError,http.client.HTTPException) as error:
    packet={'transport_ok':False,'error_type':type(error).__name__}
packet.update(pid=os.getpid(),uid=os.geteuid(),gid=os.getegid(),groups=os.getgroups(),expected_peer_uid=PLATFORM_UID)
print(json.dumps(packet,separators=(',',':')))
'''


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()


def digest(value):
    return hashlib.sha256(value if isinstance(value, bytes) else canonical(value)).hexdigest()


class CheckFailed(AssertionError):
    pass


def require(condition, label):
    if not condition:
        raise CheckFailed(label)


def strict_flag(cmdline):
    require([p for p in cmdline.split() if p.startswith('rock.registry.negative=')] == [FLAG],
            'one exact negative test flag required')


def mounts():
    return {parts[1]: {'source': parts[0], 'filesystem': parts[2], 'options': parts[3].split(',')}
            for line in Path('/proc/mounts').read_text().splitlines() if len(parts := line.split()) >= 4}


def environment():
    mounted = mounts()
    require('ro' in mounted['/']['options'] and mounted['/data']['filesystem'] == 'ext4' and
            'rw' in mounted['/data']['options'], 'readonly OS and writable ext4 data required')
    processes = []
    for role, uid in (('platform', 1002), ('wallet', 1003)):
        pid = int(Path('/run/rock-' + role + '.pid').read_text())
        status = dict(line.split(':', 1) for line in Path(f'/proc/{pid}/status').read_text().splitlines() if ':' in line)
        require([int(x) for x in status['Uid'].split()] == [uid] * 4, 'OS service UID mismatch')
        processes.append({'role': role, 'uid': uid, 'pid': pid,
                          'start_ticks': Path(f'/proc/{pid}/stat').read_text().rsplit(')', 1)[1].split()[19]})
    root = Path('/usr/lib/rock-platform')
    paths = [Path(__file__).resolve(), root / 'service.py', root / 'blackberryrock/hub.py',
             root / 'blackberryrock/packages.py', root / 'registry/client.py', root / 'runner_control.py',
             Path('/usr/libexec/rock-sandbox-exec')]
    return {'machine': os.uname().machine, 'mounts': {p: mounted[p] for p in ('/', '/data')},
            'processes': processes, 'sources': {str(p): digest(p.read_bytes()) for p in paths}}


def read_db(path):
    info = path.lstat()
    require(stat.S_ISREG(info.st_mode) and info.st_uid == 1002 and info.st_nlink == 1,
            'protected service database identity differs')
    db = sqlite3.connect('file:' + str(path) + '?mode=ro', uri=True, timeout=2)
    db.row_factory = sqlite3.Row
    db.execute('PRAGMA query_only=ON')
    return db


def snapshot_db():
    with closing(read_db(HUB)) as db:
        db.execute('BEGIN')
        require(db.execute('PRAGMA integrity_check').fetchone()[0] == 'ok', 'Hub integrity failed')
        installed = [dict(r) for r in db.execute('SELECT i.id,i.version,i.enabled,p.hash FROM hub_installed i JOIN hub_packages p USING(id,version) WHERE i.id IN (?,?,?)', (TOOL, BAD, FUTURE))]
        packages = [{'id': r['id'], 'version': r['version'], 'hash': r['hash'],
                     'body_sha256': digest(r['body'].encode())}
                    for r in db.execute('SELECT * FROM hub_packages WHERE id IN (?,?,?) ORDER BY id,version', (TOOL, BAD, FUTURE))]
        jobs = [dict(r) for r in db.execute('SELECT * FROM hub_jobs WHERE tool_id=? ORDER BY created,id', (TOOL,))]
        requests = [{'key': r['key'], 'request_sha256': r['request_hash'],
                     'result_sha256': digest(r['result'].encode())}
                    for r in db.execute("SELECT * FROM hub_requests WHERE key LIKE 'negative-%' ORDER BY key")]
        audit = [dict(r) for r in db.execute('SELECT * FROM hub_audit ORDER BY seq')]
        revoked = [r[0] for r in db.execute('SELECT subject FROM hub_revoked ORDER BY subject')]
    with closing(read_db(REMOTE)) as db:
        require(db.execute('PRAGMA integrity_check').fetchone()[0] == 'ok', 'remote integrity failed')
        remote = [dict(r) for r in db.execute('SELECT key,tool_id,version,package_hash,input_sha,state,submit_sha,receipt,send_claimed FROM remote_jobs ORDER BY key')]
    return {'installed': installed, 'packages': packages, 'jobs': jobs, 'requests': requests,
            'audit': audit, 'revoked': revoked, 'remote': remote, 'read_only': True}


def fill_cache():
    info = CACHE.lstat()
    require(stat.S_ISDIR(info.st_mode) and info.st_uid == 1002 and str(CACHE) not in mounts(),
            'fixed cache must be an unmounted service directory')
    subprocess.run(['/bin/mount', '-t', 'tmpfs', '-o', 'size=64k,uid=1002,gid=1002,mode=0700,nosuid,nodev,noexec',
                    'rock-negative-space', str(CACHE)], check=True, timeout=5, capture_output=True)
    mounted = mounts()[str(CACHE)]
    require(mounted['filesystem'] == 'tmpfs' and mounted['source'] == 'rock-negative-space', 'fault mount differs')
    written = 0
    try:
        with (CACHE / '.negative-fill').open('xb', buffering=0) as stream:
            while written <= 128 * 1024:
                written += stream.write(b'x' * 4096)
    except OSError as error:
        require(error.errno == errno.ENOSPC, 'filler failed for a reason other than actual ENOSPC')
    else:
        raise CheckFailed('bounded tmpfs did not produce actual ENOSPC')
    require(os.statvfs(CACHE).f_bavail == 0, 'fault tmpfs has remaining available blocks')
    try:
        with (CACHE / '.negative-probe').open('xb', buffering=0) as stream:
            stream.write(b'x')
    except OSError as error:
        require(error.errno == errno.ENOSPC, 'independent write did not report ENOSPC')
    else:
        raise CheckFailed('independent write succeeded on full cache')
    return {'kind': 'real_linux_tmpfs_ENOSPC', 'errno': errno.ENOSPC, 'mount': str(CACHE),
            'mount_details': mounted, 'written_bytes': written, 'available_blocks': 0,
            'scope': 'only package cache masked; old cache and Hub SQLite remain on original ext4'}


def unmount_cache():
    item = mounts().get(str(CACHE))
    if item is None:
        return
    require(item['filesystem'] == 'tmpfs' and item['source'] == 'rock-negative-space', 'refuse unrelated mount cleanup')
    subprocess.run(['/bin/umount', str(CACHE)], check=True, timeout=5, capture_output=True)
    require(str(CACHE) not in mounts(), 'fault tmpfs remains mounted')


class Probe:
    def __init__(self):
        self.deadline = time.monotonic() + 320
        self.boot_id = Path('/proc/sys/kernel/random/boot_id').read_text().strip()
        self.events, self.children, self.jobs, self.checks = [], [], [], []

    def emit(self, marker):
        print('\n' + marker + ' ' + json.dumps({'boot_id': self.boot_id}), flush=True)

    def owner(self, request):
        remaining = self.deadline - time.monotonic()
        require(remaining > 0, 'guest deadline exceeded')
        child = subprocess.run(['/usr/bin/python3', '-I', '-B', '-c', CHILD], input=canonical(request),
                               capture_output=True, timeout=min(18, remaining), user=1000, group=1000, extra_groups=[])
        require(child.returncode == 0, 'owner child failed; output withheld')
        packet = json.loads(child.stdout)
        require(packet['uid'] == packet['gid'] == 1000 and packet['groups'] == [] and packet['expected_peer_uid'] == 1002,
                'owner child identity differs')
        self.children.append({k: packet[k] for k in ('pid', 'uid', 'gid', 'groups', 'expected_peer_uid')})
        response = packet.get('response')
        self.events.append({'request': request, 'request_sha256': digest(request), 'transport_ok': packet['transport_ok'],
                            'response_sha256': digest(response) if packet['transport_ok'] else None,
                            'ok': response.get('ok') if isinstance(response, dict) else None,
                            'code': response.get('code') if isinstance(response, dict) else None,
                            'error': response.get('error') if isinstance(response, dict) else None,
                            'result_sha256': digest(response['result']) if isinstance(response, dict) and 'result' in response else None})
        # Transport failure never becomes a structured denial.
        return response if packet['transport_ok'] else None

    def positive(self, request):
        for _ in range(2):
            response = self.owner(request)
            if response is not None and response.get('ok') is True:
                return response
            require(response is None or response.get('code') == 'unavailable', 'positive action explicitly rejected')
            time.sleep(.2)
        raise CheckFailed('positive action remained unresolved with same key')

    def deny(self, label, request, code, errors):
        response = self.owner(request)
        require(isinstance(response, dict) and response.get('ok') is False and response.get('code') == code,
                label + ': actual structured denial required')
        require(response.get('error') in errors, label + ': concrete rejection reason differs')
        self.checks.append({'case': label, 'code': code, 'error': response['error'],
                            'request_sha256': digest(request), 'response_sha256': digest(response), 'transport_ok': True})
        return response

    def snapshot(self):
        return self.positive({'v': 1, 'op': 'snapshot'})['snapshot']

    def wait(self, predicate):
        while time.monotonic() < self.deadline:
            state = self.snapshot()
            if predicate(state):
                return state
            time.sleep(.2)
        raise CheckFailed('expected OS state did not arrive')

    def action(self, op, key, **fields):
        return self.positive({'v': 1, 'op': op, 'key': 'negative-' + key, **fields})['result']

    def installed(self, version, package_hash, enabled):
        state = snapshot_db()
        require(state['installed'] == [{'id': TOOL, 'version': version, 'enabled': enabled, 'hash': package_hash}],
                'installed version/hash/approval differs')
        return state

    def run(self, key, version, package_hash, output):
        job = self.action('run', key, id=TOOL, text=TEXT, target='device_local')
        while time.monotonic() < self.deadline:
            final = self.positive({'v': 1, 'op': 'job.result', 'id': job['id']})['result']
            if final['status'] != 'running':
                break
            time.sleep(.15)
        require(final['status'] == 'succeeded' and final['version'] == version and final['package_hash'] == package_hash and
                final['output'] == output and final['error'] is None and final['input_bytes'] == len(TEXT.encode()),
                'actual isolated recipe output or package identity differs')
        self.jobs.append(final)
        return final


def execute(probe, report):
    report['environment'] = environment()
    initial = probe.snapshot()
    require(initial['hub']['installed'] == [] and initial['hub']['jobs'] == [], 'fresh user data required')
    wallet = initial['wallet']
    mode = report.get('verification_scope','local-full')
    report['wallet_observation'] = verification_scope.wallet(wallet,mode)
    if mode == 'local-full':
        require(wallet['simulation_only'] is True and wallet['available_minor'] == 0 and wallet['billed_minor'] == 0,
                'empty simulator Wallet required')
    report['wallet_initial_sha256'] = digest(wallet) if mode == 'local-full' else None
    probe.action('registry.refresh', 'refresh-initial')
    state = probe.wait(lambda s: len([x for x in s['catalog'] if x['manifest']['id'] in (TOOL, BAD, FUTURE)]) == 4)
    entries = {(e['manifest']['id'], e['manifest']['version']): e for e in state['catalog']}
    first, second = entries[(TOOL, '1.0.0')], entries[(TOOL, '2.0.0')]
    first_hash, second_hash = first['hash'], second['hash']
    report['catalog'] = [entries[key] for key in ((TOOL, '1.0.0'), (TOOL, '2.0.0'), (BAD, '1.0.0'), (FUTURE, '1.0.0'))]
    report['current_profile'] = first['compatibility']['current']
    require(state['device']['version'] == report['current_profile']['os_version'] == '0.3.0',
            'actual OS compatibility profile differs')
    require(first['manifest']['schema_version'] == 2 and second['manifest']['schema_version'] == 3 and
            'execution.remote' not in first['manifest']['permissions'] and 'execution.remote' in second['manifest']['permissions'],
            'actual permission increase fixture differs')
    probe.action('install', 'install-v1', id=TOOL, version='1.0.0')
    probe.action('approve', 'approve-v1', id=TOOL, approved_hash=first_hash)
    probe.run('baseline', '1.0.0', first_hash, OUTPUT1)
    probe.deny('ed25519_signature', {'v': 1, 'op': 'install', 'key': 'negative-bad-signature', 'id': BAD, 'version': '1.0.0'},
               'rejected', {'signature verification failed'})
    probe.deny('minimum_OS', {'v': 1, 'op': 'install', 'key': 'negative-future', 'id': FUTURE, 'version': '1.0.0'},
               'rejected', {'Tool requires Rock star os 999.0.0 or newer; this OS is 0.3.0'})
    probe.installed('1.0.0', first_hash, 1)
    probe.deny('interrupted_download', {'v': 1, 'op': 'update', 'key': 'negative-cut-update', 'id': TOOL, 'version': '2.0.0'},
               'rejected', {'registry response disconnected before Content-Length', 'registry connection failed or incomplete'})
    probe.installed('1.0.0', first_hash, 1)
    probe.run('after-cut', '1.0.0', first_hash, OUTPUT1)
    update = {'v': 1, 'op': 'update', 'key': 'negative-space-update', 'id': TOOL, 'version': '2.0.0'}
    try:
        report['storage_fault'] = fill_cache()
        probe.deny('actual_cache_ENOSPC', update, 'unavailable', {'OS service or storage unavailable; retry with the same key'})
        retained = probe.installed('1.0.0', first_hash, 1)
        require(not any(r['key'] == update['key'] for r in retained['requests']), 'failed update unexpectedly committed receipt')
        probe.run('after-space', '1.0.0', first_hash, OUTPUT1)
    finally:
        unmount_cache()
    probe.positive(update)
    probe.installed('2.0.0', second_hash, 0)
    probe.deny('old_hash_approval', {'v': 1, 'op': 'approve', 'key': 'negative-old-approval', 'id': TOOL, 'approved_hash': first_hash},
               'rejected', {'explicit approval must match the installed package hash'})
    probe.deny('unapproved_update_run', {'v': 1, 'op': 'run', 'key': 'negative-unapproved-run', 'id': TOOL, 'text': TEXT},
               'rejected', {'tool must be installed and explicitly enabled'})
    probe.action('approve', 'approve-v2', id=TOOL, approved_hash=second_hash)
    completed = probe.run('v2-approved', '2.0.0', second_hash, OUTPUT2)
    previews = []
    for suffix, text in (('a', TEXT), ('b', TEXT + '\nOther')):
        previews.append(probe.action('remote.prepare', 'remote-' + suffix, id=TOOL, target='cloud', text=text))
    denied_consent = dict(previews[0]['consent'], approved=False)
    probe.deny('per_input_consent_missing', {'v': 1, 'op': 'remote.submit', 'key': 'negative-remote-a', 'consent': denied_consent},
               'rejected', {'explicit submit consent must match exact preview and input'})
    wrong_input = dict(previews[1]['consent'], input_sha256=previews[0]['input_sha256'])
    probe.deny('per_input_consent_mismatch', {'v': 1, 'op': 'remote.submit', 'key': 'negative-remote-b', 'consent': wrong_input},
               'rejected', {'explicit submit consent must match exact preview and input'})
    remote = snapshot_db()['remote']
    require(len(remote) == 2 and all(r['state'] == 'prepared' and r['submit_sha'] is None and r['receipt'] is None and
                                   r['send_claimed'] == 0 for r in remote), 'remote work accepted without exact per-input consent')
    report['remote_no_submit'] = remote
    probe.emit('ROCK_NEGATIVE_REVOKE_READY')
    for index in range(30):
        probe.action('registry.refresh', 'refresh-revoked-' + str(index))
        state = probe.wait(lambda s: s['registry']['status'] not in ('queued', 'running', 'refreshing'))
        if TOOL + '@2.0.0' in state['hub']['revoked']:
            break
        time.sleep(.2)
    require(TOOL + '@2.0.0' in state['hub']['revoked'], 'signed revocation did not reach actual Hub')
    probe.installed('2.0.0', second_hash, 0)
    probe.deny('revoked_run', {'v': 1, 'op': 'run', 'key': 'negative-revoked-run', 'id': TOOL, 'text': TEXT},
               'rejected', {'tool must be installed and explicitly enabled'})
    probe.deny('revoked_approval', {'v': 1, 'op': 'approve', 'key': 'negative-revoked-approval', 'id': TOOL, 'approved_hash': second_hash},
               'rejected', {'publisher or version revoked'})
    reply = probe.owner({'fixed_revoked_get': second_hash})
    require(reply is not None and reply['status'] == 404 and reply['body'] == '{"error":"not found"}', 'real owner TLS revoked GET not denied')
    headers = {k.lower(): v for k, v in reply['headers'].items()}
    require(headers.get('cache-control') == 'no-store' and headers.get('connection') == 'close' and
            headers.get('content-type') == 'application/json', 'revoked GET response cache/framing differs')
    report['revoked_get'] = reply
    require(probe.positive({'v': 1, 'op': 'job.result', 'id': completed['id']})['result'] == completed,
            'revocation altered completed result receipt')
    final = probe.snapshot()
    verification_scope.unchanged(report['wallet_observation'],final['wallet'],mode)
    if mode == 'local-full':
        require(digest(final['wallet']) == report['wallet_initial_sha256'], 'Store tests changed Wallet')
    report['wallet_final_sha256'] = digest(final['wallet']) if mode == 'local-full' else None
    report['database'] = snapshot_db()
    require(len(report['database']['jobs']) == 4 and len(report['database']['packages']) == 2,
            'unexpected installed packages or jobs')
    require(environment()['processes'] == report['environment']['processes'], 'services restarted during test')
    report['status'] = 'PASS'


def main():
    strict_flag(Path('/proc/cmdline').read_text())
    require(sys.platform == 'linux' and os.geteuid() == 0 and os.uname().machine == 'aarch64', 'root ARM64 guest required')
    probe = Probe()
    report = {'schema_version': 1, 'status': 'RUNNING', 'boot_id': probe.boot_id,
              'scope': 'actual ARM64 OS UID1000 API; native GUI NOT_RUN; public development fixtures only',
              'physical_blackberry': 'NOT_RUN', 'production_provider': 'NOT_RUN', 'remote_execution': 'NOT_RUN',
              'publication_stop': 'permanent signed revocation; reversible pause NOT_IMPLEMENTED'}
    report['verification_scope'] = verification_scope.scope(Path('/proc/cmdline').read_text(),'rock.registry.scope')
    report['wallet'] = 'NOT_RUN' if report['verification_scope']=='game-isolation' else 'SIMULATOR_ONLY'
    try:
        execute(probe, report)
    except BaseException as error:
        report.update(status='FAIL', error_type=type(error).__name__)
        if isinstance(error, CheckFailed):
            report['error_label'] = str(error)[:180]
    finally:
        try:
            unmount_cache()
        except BaseException as error:
            report.update(status='FAIL', cleanup_error=type(error).__name__)
        report.update(events=probe.events, children=probe.children, checks=probe.checks, completed_jobs=probe.jobs,
                      shutdown={'command': ['/sbin/poweroff'], 'normal_init': True, 'gui': False})
        raw = canonical(report) + b'\n'
        with PROOF.with_suffix('.tmp').open('wb') as stream:
            stream.write(raw); stream.flush(); os.fsync(stream.fileno())
        os.replace(PROOF.with_suffix('.tmp'), PROOF)
        descriptor = os.open(PROOF.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(descriptor)
        finally:
            os.close(descriptor)
        print('\nROCK_NEGATIVE_GUEST_' + report['status'] + ' ' + json.dumps(
            {'boot_id': probe.boot_id, 'proof_sha256': digest(raw)}), flush=True)
        os.sync()
        subprocess.run(['/sbin/poweroff'], check=True, timeout=10)
    return 0 if report['status'] == 'PASS' else 1


if __name__ == '__main__':
    sys.exit(main())

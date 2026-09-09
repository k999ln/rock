"""Fixed root-only fault fixture. Never installed into the production image.

Observe a real platform fork/exec with ptrace, then detach and use a pidfd to
crash/freeze only its exact recipe launcher. No code/limit/IPC override exists.
The launcher fault happens before its sandbox program begins; sandbox resource
enforcement is covered separately. A missing child is failure, never a retry.
"""
import ctypes
import errno
import hashlib
import json
import math
import os
from pathlib import Path
import re
import select
import signal
import sqlite3
import stat
import subprocess
import sys
import threading
import time
import uuid
from contextlib import closing

TOOL, VERSION = 'org.rockstar.text-tidy', '1.0.0'
TEXT, OUTPUT = '  Fixed Hub recovery  ', 'Fixed Hub recovery'
MODES = ('crash', 'deadline', 'recovery')
LAUNCHER = '/usr/libexec/rock-sandbox-exec'
PROOF = Path('/data/hub-fault-proof.json')
WAIT_ALL = 0x40000000
MAX_PROCESSES = 4096


def require(value, message):
    if not value: raise ValueError(message)


def canonical(value):
    return json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(',', ':'), allow_nan=False).encode()


def hashed(value): return hashlib.sha256(canonical(value)).hexdigest()


def validate_launcher(child, *, parent_pid, tracer_pid, previous_pids):
    require(all(type(child.get(key)) is int for key in ('pid','ppid','tgid','tracer_pid','start_ticks')) and
            child['pid'] > 1 and child['pid'] not in previous_pids and
            child.get('ppid') == parent_pid and child.get('tgid') == child['pid'] and
            type(child.get('start_ticks')) is int and child['start_ticks'] > 0 and
            child.get('uid') == [1002]*4 and child.get('gid') == [1002]*4 and
            child.get('exe') == LAUNCHER and child.get('command') == [LAUNCHER, 'recipe'] and
            child.get('tracer_pid') == tracer_pid, 'not the new exact owned platform recipe launcher')


def same_identity(before, after):
    require(all(before.get(key) == after.get(key) for key in
                ('pid', 'start_ticks', 'ppid', 'tgid', 'uid', 'gid', 'exe', 'command')),
            'launcher identity changed before signal')


def validate_fault(mode, proof):
    require(mode in MODES[:2] and proof.get('signal') == (9 if mode == 'crash' else 19) and
            type(proof.get('elapsed_seconds')) in (int, float) and
            math.isfinite(proof['elapsed_seconds']) and 0 <= proof['elapsed_seconds'] <= 2 and
            ((mode == 'crash' and proof.get('exited') is True) or
             (mode == 'deadline' and proof.get('stopped') is True and proof.get('exited') is False)),
            'requested actual launcher fault was not observed')


def validate_failure(mode, job):
    elapsed = job['finished'] - job['created']
    require(mode in MODES[:2] and job['status'] == 'failed' and job['output'] is None and
            job['error'] == ('time limit exceeded' if mode == 'deadline' else 'worker interrupted or invalid output') and
            math.isfinite(elapsed) and (2.9 if mode == 'deadline' else 0) <= elapsed <= 12,
            'actual Hub failure or original three-second deadline differs')


def validate_replay(accepted, replay):
    require(canonical(accepted) == canonical(replay), 'same-key replay changed its durable acceptance receipt')


def validate_durable_rows(rows, package_hash):
    require(re.fullmatch('[0-9a-f]{64}', package_hash), 'verified signed package hash required')
    jobs, receipts, audits = rows['hub_jobs'], rows['hub_requests'], rows['hub_audit']
    require(len(jobs) in (2,4) and len(receipts) == len(audits) == len(jobs)+2,
            'exact fault/retry receipt and audit coverage required')
    keys = ['d3-hub:'+mode+suffix for mode in MODES[:2] for suffix in ('',':explicit-retry')][:len(jobs)]
    require([job['key'] for job in jobs] == keys and len({job['id'] for job in jobs}) == len(jobs) and
            len({r['key'] for r in receipts}) == len(receipts), 'durable job/key order or uniqueness differs')
    expected = [({'v':1,'op':'install','id':TOOL,'version':VERSION,'key':'d3-hub:install'},
                 {'id':TOOL,'version':VERSION,'hash':package_hash,'enabled':False},
                 'installed_disabled',{'id':TOOL,'version':VERSION,'hash':package_hash}),
                ({'v':1,'op':'approve','id':TOOL,'approved_hash':package_hash,'key':'d3-hub:approve'},
                 {'id':TOOL,'enabled':True},'enabled',{'id':TOOL,'hash':package_hash})]
    for job,key in zip(jobs,keys):
        require(str(uuid.UUID(job['id'])) == job['id'] and job['tool_id'] == TOOL and job['version'] == VERSION and
                job['package_hash'] == package_hash and job['input_bytes'] == len(TEXT.encode()) and
                job['request_hash'] == hashed({'id':TOOL,'text':TEXT,'target':'device_local'}),
                'actual job input, signed package or identity differs')
        if key.endswith(':explicit-retry'):
            require(job['status'] == 'succeeded' and job['output'] == OUTPUT and job['error'] is None and
                    math.isfinite(job['finished']-job['created']) and 0 <= job['finished']-job['created'] <= 12,
                    'actual explicit retry content or completion differs')
        else: validate_failure(key.split(':')[-1],job)
        expected.append(({'v':1,'op':'run','id':TOOL,'text':TEXT,'target':'device_local','key':key},job,
                         'run_approved',{'job_id':job['id'],'package_hash':package_hash,'execution_target':'device_local',
                                         'actual_host':'rock_os_linux_namespace','sent_to_cloud':False,'amount_minor':0}))
    receipt_map = {r['key']:r for r in receipts}
    require(set(receipt_map) == {request['key'] for request,_,_,_ in expected}, 'missing or unrelated durable receipt')
    for index,(request,result,event,body) in enumerate(expected):
        receipt = receipt_map[request['key']]
        require(receipt['request_hash'] == hashed(request), 'durable request hash differs')
        reply = json.loads(receipt['result'])
        if request['op'] == 'run':
            require(set(reply) == set(result), 'run acceptance receipt fields differ')
            if reply['status'] == 'running':
                require(canonical(reply) == canonical(dict(result,status='running',output=None,error=None,finished=None)),
                        'run acceptance receipt identity differs')
            else:
                require(result['status'] == reply['status'] == 'succeeded' and canonical(reply) == canonical(result),
                        'run acceptance receipt completion differs')
        else: require(canonical(reply) == canonical(result), 'lifecycle acceptance receipt differs')
        audit = audits[index]
        require(type(audit['seq']) is int and audit['seq'] == index+1 and audit['event'] == event and
                canonical(json.loads(audit['body'])) == canonical(body), 'ordered audit/actual-host/job binding differs')


def validate_manifest(before, after, additions):
    require(set(after) == set(before) | additions and not set(before) & additions and
            all(after.get(path) == entry for path, entry in before.items()),
            'derived image changed an existing file or added an unreviewed hook')


def validate_matrix(proofs):
    require([p.get('mode') for p in proofs] == list(MODES) and
            all(p.get('status') == 'PASS' for p in proofs) and
            len({p['boot_id'] for p in proofs}) == 3 and
            [p['job_count'] for p in proofs] == [2, 4, 4] and
            len({p['wallet_sha256'] for p in proofs}) == 1 and
            len({p['runtime_sha256'] for p in proofs}) == 1,
            'three actual fault/recovery boots with unchanged Wallet/runtime are required')


def identity(pid):
    root = Path('/proc') / str(pid)
    status = dict(line.split(':', 1) for line in (root/'status').read_text().splitlines() if ':' in line)
    fields = (root/'stat').read_text().rsplit(')', 1)[1].split()
    return {'pid': pid, 'start_ticks': int(fields[19]), 'ppid': int(fields[1]),
            'tgid': int(status['Tgid']), 'uid': list(map(int, status['Uid'].split())),
            'gid': list(map(int, status['Gid'].split())), 'exe': os.readlink(root/'exe'),
            'command': (root/'cmdline').read_bytes().rstrip(b'\0').decode().split('\0'),
            'tracer_pid': int(status['TracerPid']), 'no_new_privs': int(status['NoNewPrivs'])}


def platform_identity():
    pid = int(Path('/run/rock-platform.pid').read_text())
    value = identity(pid)
    require(value['uid'] == value['gid'] == [1002]*4 and value['tracer_pid'] == 0 and value['no_new_privs'] == 1 and
            value['exe'] == str(Path('/usr/bin/python3').resolve()) and
            value['command'] == ['/usr/bin/python3', '-I', '-B', '/usr/lib/rock-platform/service.py', '--role', 'platform'],
            'fixed actual platform daemon identity required')
    return value


def bounded_pids(directory, limit, deadline):
    result = set()
    for path in directory.iterdir():
        require(time.monotonic() < deadline, 'pre-arm process inventory deadline exceeded')
        if path.name.isdecimal():
            result.add(int(path.name))
            require(len(result) <= limit, 'pre-arm process inventory limit exceeded')
    return result


def process_inventory(parent_pid, thread_ids, *, proc=Path('/proc'), deadline):
    """Called with all platform threads stopped; never use optional /children.

    Linux reports the parent thread group's ID as stat PPID. Include every
    verified platform TID as well, and reject zombies, disappearing/unreadable
    entries and malformed/truncated stat data instead of assuming no child.
    """
    pids = bounded_pids(proc, MAX_PROCESSES, deadline)
    require(parent_pid in pids, 'platform missing from pre-arm process inventory')
    for pid in sorted(pids):
        require(time.monotonic() < deadline, 'pre-arm process inventory deadline exceeded')
        with (proc / str(pid) / 'stat').open('rb') as stream:
            raw = stream.read(4097)
        prefix, separator, tail = raw.rpartition(b') ')
        fields = tail.split()
        require(len(raw) <= 4096 and prefix.startswith(f'{pid} ('.encode()) and separator and
                len(fields) >= 20 and fields[1].isdigit() and fields[19].isdigit(),
                'invalid or truncated pre-arm process stat')
        require(int(fields[1]) not in thread_ids | {parent_pid},
                'platform already has a child; no fault is armed')
    require(time.monotonic() < deadline, 'pre-arm process inventory deadline exceeded')
    return pids


def validate_prearm(value, parent_pid):
    require(type(value) is dict and
            value.get('method') == 'all-platform-threads-stopped-and-proc-stat-ppid' and
            type(value.get('process_count')) is int and 0 < value['process_count'] <= MAX_PROCESSES and
            type(value.get('existing_children')) is int and value['existing_children'] == 0 and
            type(value.get('thread_ids')) is list and 0 < len(value['thread_ids']) <= 16 and
            all(type(tid) is int and tid > 0 for tid in value['thread_ids']) and
            value['thread_ids'] == sorted(set(value['thread_ids'])) and parent_pid in value['thread_ids'] and
            type(value.get('elapsed_seconds')) in (int, float) and math.isfinite(value['elapsed_seconds']) and
            0 <= value['elapsed_seconds'] <= 2, 'complete bounded pre-arm process evidence required')


class LauncherTrace:
    """No memory/register writes; only fork/exec event observation and detach."""
    SEIZE, INTERRUPT, GETEVENTMSG, CONT, DETACH = 0x4206, 0x4207, 0x4201, 7, 17
    OPTIONS = 2 | 4 | 8 | 16  # TRACEFORK, TRACEVFORK, TRACECLONE, TRACEEXEC

    def __init__(self, parent):
        self.parent, self.traced, self.stopped = parent, set(), set()
        self.parent_fd = None
        self.libc = ctypes.CDLL(None, use_errno=True)
        self.libc.ptrace.restype = ctypes.c_long
        self.libc.ptrace.argtypes = [ctypes.c_uint, ctypes.c_uint, ctypes.c_void_p, ctypes.c_void_p]

    def ptrace(self, operation, pid, data=0):
        result = self.libc.ptrace(operation, pid, None, ctypes.c_void_p(data))
        if result == -1:
            code = ctypes.get_errno()
            raise OSError(code, 'fixed ptrace operation failed')

    def attach(self):
        same_identity(self.parent,identity(self.parent['pid']))
        self.parent_fd = os.pidfd_open(self.parent['pid'],0)
        self.verify_parent()
        tasks = Path('/proc')/str(self.parent['pid'])/'task'
        started = time.monotonic()
        deadline = started + 2
        tids = bounded_pids(tasks, 16, deadline)
        require(self.parent['pid'] in tids, 'platform main thread missing before observation')
        for tid in sorted(tids):
            self.verify_parent()
            thread = identity(tid)
            require(thread['tgid'] == self.parent['pid'] and thread['uid'] == thread['gid'] == [1002]*4 and
                    thread['exe'] == self.parent['exe'] and thread['command'] == self.parent['command'] and thread['tracer_pid'] == 0,
                    'platform thread identity changed before observation')
            self.ptrace(self.SEIZE, tid, self.OPTIONS); self.traced.add(tid)
        # Quiesce the complete verified thread set before observing PPIDs. A
        # fork/clone during attachment is a refusal, not an eligible new job.
        for tid in sorted(tids):
            self.ptrace(self.INTERRUPT, tid)
        while self.stopped != tids:
            require(time.monotonic() < deadline, 'pre-arm process inventory deadline exceeded')
            for tid, event, sig in self.events():
                require(tid in tids and event == 128 and sig == signal.SIGTRAP,
                        'platform changed while stopping for pre-arm inventory')
            if self.stopped != tids:
                time.sleep(.001)
        require(bounded_pids(tasks, 16, deadline) == tids and self.traced == tids,
                'platform thread inventory changed before fault arming')
        self.verify_parent()
        self.previous = process_inventory(self.parent['pid'], tids, deadline=deadline)
        self.verify_parent()
        self.prearm = {'method': 'all-platform-threads-stopped-and-proc-stat-ppid',
                       'thread_ids': sorted(tids), 'process_count': len(self.previous),
                       'existing_children': 0, 'elapsed_seconds': time.monotonic() - started}
        validate_prearm(self.prearm, self.parent['pid'])
        for tid in sorted(tids):
            self.resume(tid)

    def verify_parent(self):
        require(self.parent_fd is not None and not select.select([self.parent_fd],[],[],0)[0], 'platform exited before capture')
        same_identity(self.parent,identity(self.parent['pid']))

    def events(self):
        for pid in list(self.traced):
            try: observed, status = os.waitpid(pid, os.WNOHANG | WAIT_ALL)
            except ChildProcessError: continue
            if not observed: continue
            if os.WIFEXITED(status) or os.WIFSIGNALED(status):
                self.traced.discard(pid); self.stopped.discard(pid); continue
            require(os.WIFSTOPPED(status), 'unexpected ptrace wait status')
            self.stopped.add(pid)
            event, sig = status >> 16, os.WSTOPSIG(status)
            if event in (1, 2, 3):
                child = ctypes.c_ulong()
                self.ptrace(self.GETEVENTMSG, pid, ctypes.addressof(child))
                require(child.value > 1 and len(self.traced) < 16, 'trace child inventory exceeded fixed limit')
                self.traced.add(child.value)
            yield pid, event, sig

    def resume(self, pid, sig=0):
        self.ptrace(self.CONT, pid, sig); self.stopped.discard(pid)

    def detach(self):
        # This never kills a service. Every traced thread is returned to its
        # ordinary execution, including when capture or an API call failed.
        for pid in self.traced - self.stopped:
            try: self.ptrace(self.INTERRUPT, pid)
            except OSError as error:
                if error.errno != errno.ESRCH: raise
        deadline = time.monotonic() + 2
        while self.traced:
            for _ in self.events(): pass
            for pid in list(self.stopped):
                try: self.ptrace(self.DETACH, pid)
                except OSError as error:
                    if error.errno != errno.ESRCH: raise
                self.traced.discard(pid); self.stopped.discard(pid)
            require(time.monotonic() < deadline, 'could not detach every platform thread')
            if self.traced: time.sleep(.001)
        if self.parent_fd is not None:
            os.close(self.parent_fd); self.parent_fd = None

    def fault(self, mode):
        deadline = time.monotonic() + 4
        while time.monotonic() < deadline:
            for pid, event, sig in self.events():
                if event == 4:
                    self.verify_parent()
                    child = identity(pid)
                    validate_launcher(child, parent_pid=self.parent['pid'], tracer_pid=os.getpid(), previous_pids=self.previous)
                    fd = os.pidfd_open(pid, 0)
                    started = time.monotonic()
                    try:
                        same_identity(child, identity(pid))
                        require(not select.select([fd], [], [], 0)[0], 'launcher exited before fixed signal')
                        signal.pidfd_send_signal(fd, signal.SIGKILL if mode == 'crash' else signal.SIGSTOP)
                        if mode == 'crash':
                            # A ptraced corpse remains waitable by its tracer
                            # before the real parent can reap it. Consume the
                            # actual exit stop; DETACH/ESRCH is not that proof.
                            self.stopped.discard(pid)
                            exit_deadline = time.monotonic() + 1
                            while pid in self.traced and time.monotonic() < exit_deadline:
                                for target, ev, signo in self.events():
                                    self.resume(target, signo if ev == 0 else 0)
                                if pid in self.traced: time.sleep(.001)
                            require(pid not in self.traced, 'killed launcher ptrace exit was not reaped')
                        else:
                            # Move from exec event-stop to genuine SIGSTOP
                            # delivery-stop, then detach with that same signal.
                            self.resume(pid)
                            stop_deadline = time.monotonic() + 1
                            delivered = False
                            while not delivered and time.monotonic() < stop_deadline:
                                for target, ev, signo in self.events():
                                    if target == pid and ev == 0 and signo == signal.SIGSTOP:
                                        same_identity(child, identity(pid))
                                        self.ptrace(self.DETACH, pid, signal.SIGSTOP)
                                        self.traced.discard(pid); self.stopped.discard(pid); delivered = True
                                    else: self.resume(target, signo if ev == 0 else 0)
                                if not delivered: time.sleep(.001)
                            require(delivered, 'launcher SIGSTOP delivery was not observed')
                        self.detach()
                        observation_deadline = started + 2
                        while True:
                            exited = bool(select.select([fd], [], [], 0)[0])
                            stopped = False
                            if not exited:
                                raw = (Path('/proc')/str(pid)/'stat').read_text().rsplit(')', 1)[1].split()
                                stopped = raw[0] == 'T'
                            if (mode == 'crash' and exited) or (mode == 'deadline' and stopped): break
                            require(time.monotonic() < observation_deadline, 'fixed signal had no observable effect')
                            time.sleep(.001)
                        proof = {'identity': child, 'prearm_inventory': self.prearm,
                                 'signal': 9 if mode == 'crash' else 19,
                                 'exited': exited, 'stopped': stopped, 'elapsed_seconds': time.monotonic()-started}
                        validate_fault(mode, proof)
                        return proof
                    finally: os.close(fd)
                self.resume(pid, sig if event == 0 else 0)
            time.sleep(.001)
        raise TimeoutError('NOT_RUN: exact production launcher exec was not captured; no second job submitted')


def validate_request(payload):
    require(type(payload) is dict and payload.get('v') == 1 and type(payload['v']) is int, 'fixed owner request required')
    op = payload.get('op')
    fields = {'snapshot': set(), 'install': {'id','version','key'}, 'approve': {'id','approved_hash','key'},
              'run': {'id','text','target','key'}, 'job.result': {'id'}, 'device.poweroff': {'key'}}
    require(op in fields and set(payload) == fields[op] | {'v','op'}, 'general RPC is not exposed by this fixture')
    if op in ('install','approve','run'): require(payload['id'] == TOOL, 'only the fixed signed Tool is allowed')
    if op == 'install': require(payload['version'] == VERSION and payload['key'] == 'd3-hub:install', 'fixed install required')
    if op == 'approve':
        require(payload['key'] == 'd3-hub:approve' and re.fullmatch('[0-9a-f]{64}',payload['approved_hash']), 'fixed package approval required')
    if op == 'run':
        require(payload['target'] == 'device_local' and payload['text'] in (TEXT,TEXT+' conflicting') and
                payload['key'] in {'d3-hub:'+mode+suffix for mode in MODES[:2] for suffix in ('',':explicit-retry')},
                'only predeclared local fault/retry requests are allowed')
    if op == 'job.result': require(str(uuid.UUID(payload['id'])) == payload['id'], 'actual fixed-format job identity required')
    if op == 'device.poweroff': require(payload['key'] in {'d3-hub:poweroff:'+mode for mode in MODES}, 'fixed normal poweroff required')


def owner_call(payload):
    # The literal program is fixed. No shell, caller-supplied code/path, network
    # endpoint or authentication override is accepted by this fixture.
    script = """import json,sys
sys.path.insert(0,'/usr/lib/rock-platform')
from service import call
print(json.dumps(call('/run/rock-platform/api.sock',json.load(sys.stdin),1002,return_errors=True)))
"""
    validate_request(payload)
    result = subprocess.run(['/usr/bin/python3', '-I', '-B', '-c', script], input=canonical(payload),
                            user=1000, group=1000, extra_groups=[], capture_output=True, timeout=8)
    require(result.returncode == 0 and len(result.stdout) <= 1024*1024, 'actual owner IPC subprocess failed')
    return json.loads(result.stdout)


def request(op, **values):
    reply = owner_call({'v': 1, 'op': op, **values})
    require(reply.get('ok') is True, 'actual allowed owner request rejected')
    return reply


def wallet_state(directory=Path('/data/wallet')):
    result = {}
    for name in ('wallet-simulator.db', 'entitlement.db'):
        path = directory/name
        with closing(sqlite3.connect(path.as_uri()+'?mode=ro', uri=True)) as db:
            db.execute('PRAGMA query_only=ON'); db.execute('BEGIN')
            require(db.execute('PRAGMA integrity_check').fetchone() == ('ok',), 'Wallet integrity failed')
            schema = db.execute('SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name').fetchall()
            require(len(schema) < 256, 'Wallet schema evidence budget exceeded')
            tables = {}
            for (table,) in db.execute("SELECT name FROM sqlite_master WHERE type='table'"):
                rows = db.execute('SELECT * FROM "'+table.replace('"','""')+'" LIMIT 1001').fetchall()
                require(len(rows) <= 1000, 'fresh Wallet row budget exceeded')
                tables[table] = sorted((list(row) for row in rows), key=canonical)
            result[name] = {'schema': schema, 'tables': tables}
    require(len(canonical(result)) <= 256*1024, 'Wallet evidence byte budget exceeded')
    return hashed(result)


def hub_rows():
    with closing(sqlite3.connect('file:/data/platform/hub.db?mode=ro', uri=True)) as db:
        db.execute('PRAGMA query_only=ON'); db.execute('BEGIN'); db.row_factory = sqlite3.Row
        return {table: [dict(r) for r in db.execute('SELECT * FROM '+table+' ORDER BY '+order+' LIMIT 20')]
                for table, order in (('hub_jobs','created'), ('hub_requests','key'), ('hub_audit','seq'))}


def wait_job(job_id):
    deadline = time.monotonic() + 12
    while time.monotonic() < deadline:
        job = request('job.result', id=job_id)['result']
        if job['status'] not in ('running', 'cancel_requested'): return job
        time.sleep(.05)
    raise TimeoutError('actual Hub did not finish its own failed/successful worker')


def main():
    require(os.geteuid() == 0 and os.uname().machine == 'aarch64', 'actual ARM64 root fixture required')
    modes = [x.split('=',1)[1] for x in Path('/proc/cmdline').read_text().split() if x.startswith('rock.hubfault=')]
    require(len(modes) == 1 and modes[0] in MODES, 'one fixed boot fixture mode required')
    mode = modes[0]
    mounts = [line.split() for line in Path('/proc/mounts').read_text().splitlines()]
    root = next((m for m in mounts if m[1] == '/'), None)
    data = next((m for m in mounts if m[1] == '/data'), None)
    require(root and root[2] == 'ext4' and 'ro' in root[3].split(',') and data and data[0] == '/dev/vdb' and
            {'rw','nosuid','nodev','noexec'} <= set(data[3].split(',')), 'actual read-only root and protected data mount required')
    require(not any((p/'device').exists() for p in Path('/sys/class/net').iterdir()), 'hardware network adapter forbidden')
    require(not Path('/dev/fb0').exists(), 'this is a headless API fault fixture, not GUI evidence')
    runtime = json.loads(Path('/usr/libexec/rock-hub-fault-runtime.json').read_text())
    for path, expected in runtime.items():
        require(hashlib.sha256(Path('/'+path).read_bytes()).hexdigest() == expected, 'installed production runtime changed: '+path)
    boot_id = Path('/proc/sys/kernel/random/boot_id').read_text().strip(); uuid.UUID(boot_id)
    parent = platform_identity()
    wallet = wallet_state()
    history = json.loads(PROOF.read_text()) if PROOF.exists() else []
    require(len(history) == MODES.index(mode), 'fresh ordered fault boots required; uncertain mutation is never retried')
    previous = hub_rows()
    if history:
        require(wallet == history[0]['wallet_sha256'] and previous == history[-1]['durable_rows'], 'reboot changed retained Wallet/Hub rows')
    else:
        require(all(not rows for rows in previous.values()), 'fresh Hub must have no jobs or receipts')
        installed = request('install', id=TOOL, version=VERSION, key='d3-hub:install')['result']
        request('approve', id=TOOL, approved_hash=installed['hash'], key='d3-hub:approve')
    result = {'schema': 'rock-hub-fault-proof/1', 'mode': mode, 'status': 'RUNNING', 'boot_id': boot_id,
              'platform_identity': parent, 'wallet_sha256': wallet, 'runtime_sha256': hashed(runtime),
              'scope': 'fixed production launcher exec fault; actual owner API/Hub deadline; no GUI or sandbox-workload fault claim'}
    if mode != 'recovery':
        body = {'v': 1, 'op': 'run', 'id': TOOL, 'text': TEXT, 'target': 'device_local', 'key': 'd3-hub:'+mode}
        response, errors = [], []
        def submit():
            try: response.append(owner_call(body))
            except BaseException as error: errors.append(error)
        tracer = LauncherTrace(parent)
        thread = threading.Thread(target=submit)
        try:
            tracer.attach(); thread.start()
            result['fault'] = tracer.fault(mode)
        finally:
            tracer.detach()
            if thread.ident is not None: thread.join(timeout=9)
        require(not thread.is_alive() and not errors and len(response) == 1 and response[0].get('ok') is True,
                'real owner acceptance missing; do not resubmit an uncertain mutation')
        accepted = response[0]
        require(accepted['result']['status'] == 'running', 'initial real acceptance must be running')
        failed = wait_job(accepted['result']['id']); validate_failure(mode, failed)
        replay = owner_call(body); validate_replay(accepted, replay)
        conflict = owner_call(dict(body, text=TEXT+' conflicting'))
        require(conflict.get('ok') is False and conflict.get('code') == 'rejected' and 'idempotency conflict' in conflict.get('error',''),
                'conflicting retry was not explicitly rejected')
        retry = request('run', id=TOOL, text=TEXT, target='device_local', key='d3-hub:'+mode+':explicit-retry')['result']
        complete = wait_job(retry['id'])
        require(complete['id'] != failed['id'] and complete['key'] != failed['key'] and
                complete['status'] == 'succeeded' and complete['output'] == OUTPUT and complete['error'] is None,
                'new explicit retry failed to recover the actual production worker')
        require(platform_identity() == parent, 'platform was restarted or replaced during a worker-only fault')
        result.update(accepted=accepted, failed_job=failed, replay=replay, conflict=conflict, retry_job=complete)
    rows = hub_rows()
    expected_jobs = 2 if mode == 'crash' else 4
    require(len(rows['hub_jobs']) == expected_jobs and len(rows['hub_requests']) == len(rows['hub_audit']) == expected_jobs+2 and
            len({j['id'] for j in rows['hub_jobs']}) == len({j['key'] for j in rows['hub_jobs']}) == expected_jobs,
            'job/receipt/audit missing or duplicated')
    require(wallet_state() == wallet, 'fault or retry changed a Wallet table')
    install_receipt = next(row for row in rows['hub_requests'] if row['key'] == 'd3-hub:install')
    validate_durable_rows(rows,json.loads(install_receipt['result'])['hash'])
    for old in history:
        require(all(row in rows[table] for table, records in old['durable_rows'].items() for row in records),
                'prior completed job/receipt/audit changed')
    result.update(status='PASS', job_count=expected_jobs, durable_rows=rows)
    history.append(result)
    if mode == 'recovery': validate_matrix(history)
    with PROOF.open('w') as stream:
        json.dump(history, stream, sort_keys=True); stream.flush(); os.fsync(stream.fileno())
    PROOF.chmod(0o600)
    print('ROCK_HUB_FAULT_PROOF '+json.dumps(result, sort_keys=True), flush=True)
    # Real allowed power protocol; the init hook returns so normal shutdown
    # may complete. This is API-driven shutdown, not native GUI acceptance.
    request('device.poweroff', key='d3-hub:poweroff:'+mode)


if __name__ == '__main__':
    try: main()
    except BaseException as error:
        print('ROCK_HUB_FAULT_FAIL '+type(error).__name__+': '+str(error), flush=True)
        raise

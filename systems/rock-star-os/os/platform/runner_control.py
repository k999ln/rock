"""OS-side explicit-consent remote queue; never writes Hub job/ledger tables.

Linearization: a durable sending claim under RegistryControl.admission_guard and
Hub.lock precedes network I/O. Earlier cancellation/update/revocation forbids
sending. Later changes request cancellation/status reconciliation; data cannot
be represented as retracted once the claim exists. Network runs outside Hub.lock.
"""
from contextlib import closing, contextmanager
import fcntl
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import stat
import threading
import time

from blackberryrock.packages import canonical, digest, require_compatible, verify_package
from runner.client import consent_for
from runner.protocol import MAX_INPUT, MAX_OUTPUT, TERMINAL, RunnerError, TransportError, identifier

ACTIVE = {'queued', 'sending', 'unknown', 'accepted', 'running'}
LOCAL_TERMINAL = TERMINAL | {'rejected'}


class RunnerControl:
    def __init__(self, hub, state_dir, *, registry_control=None, clients=None, start=True,
                 retry_initial=0.1, retry_max=5, poll_seconds=0.5, max_prepared=16,
                 max_active=8, max_history=100, max_bytes=32 * 1024 * 1024):
        if (any(isinstance(value,bool) or not isinstance(value,(int,float)) for value in (retry_initial,retry_max,poll_seconds))
                or not 0.01 <= retry_initial <= retry_max <= 30 or not 0.05 <= poll_seconds <= 30):
            raise ValueError('invalid bounded remote retry policy')
        for value, maximum in ((max_prepared, 100), (max_active, 32), (max_history, 1000), (max_bytes, 1024**3)):
            if type(value) is not int or not 1 <= value <= maximum:
                raise ValueError('invalid remote storage quota')
        self.hub, self.registry = hub, registry_control
        self.clients = dict(clients or {})
        if set(self.clients) - {'cloud', 'pc_usb'}:
            raise ValueError('unsupported configured remote target')
        self.directory = Path(state_dir)
        self.directory.mkdir(mode=0o700, parents=True, exist_ok=True)
        info = self.directory.lstat()
        if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.geteuid() or info.st_mode & 0o077:
            raise PermissionError('remote state directory must be private and service-owned')
        self.instance_fd = os.open(self.directory / 'instance.lock', os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
        try:
            info = os.fstat(self.instance_fd)
            if not stat.S_ISREG(info.st_mode) or info.st_uid != os.geteuid() or info.st_nlink != 1:
                raise PermissionError('invalid remote instance lock')
            fcntl.flock(self.instance_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BaseException:
            os.close(self.instance_fd)
            raise
        self.database = self.directory / 'remote.sqlite3'
        self.mutex, self.processing = threading.RLock(), threading.Lock()
        self.thread_lock = threading.Lock()
        self.wake, self.stopping = threading.Event(), threading.Event()
        self.thread = None
        self.retry_initial, self.retry_max, self.poll_seconds = retry_initial, retry_max, poll_seconds
        self.max_prepared, self.max_active = max_prepared, max_active
        self.max_history, self.max_bytes = max_history, max_bytes
        self.worker_error, self.worker_failures = None, 0
        try:
            fd = os.open(self.database, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
            info = os.fstat(fd); os.close(fd)
            if not stat.S_ISREG(info.st_mode) or info.st_uid != os.geteuid() or info.st_nlink != 1:
                raise PermissionError('invalid remote state database')
            self._initialize()
        except BaseException:
            os.close(self.instance_fd)
            raise
        if start:
            self.start()

    def connect(self):
        db = sqlite3.connect(self.database, timeout=0.25)
        try:
            db.row_factory = sqlite3.Row
            db.execute('PRAGMA journal_mode=DELETE')
            db.execute('PRAGMA synchronous=EXTRA')
            db.execute('PRAGMA secure_delete=ON')
            return db
        except BaseException:
            db.close()
            raise

    def _initialize(self):
        with closing(self.connect()) as db, db:
            db.executescript('''
                CREATE TABLE IF NOT EXISTS remote_jobs (
                    key TEXT PRIMARY KEY, prepare_sha TEXT NOT NULL, preview TEXT NOT NULL,
                    tool_id TEXT NOT NULL, version TEXT NOT NULL, package_hash TEXT NOT NULL,
                    target TEXT NOT NULL, endpoint_id TEXT NOT NULL, input_sha TEXT NOT NULL,
                    package TEXT, input_text TEXT, consent TEXT, submit_sha TEXT, receipt TEXT,
                    state TEXT NOT NULL, send_claimed INTEGER NOT NULL DEFAULT 0,
                    cancel_requested INTEGER NOT NULL DEFAULT 0, remote_status TEXT,
                    error TEXT, failures INTEGER NOT NULL DEFAULT 0, next_attempt REAL NOT NULL DEFAULT 0,
                    created REAL NOT NULL, updated REAL NOT NULL);
                CREATE TRIGGER IF NOT EXISTS remote_identity_immutable BEFORE UPDATE OF
                    key,prepare_sha,preview,tool_id,version,package_hash,target,endpoint_id,input_sha,created ON remote_jobs
                    BEGIN SELECT RAISE(ABORT,'remote identity immutable'); END;
                CREATE TRIGGER IF NOT EXISTS remote_consent_immutable BEFORE UPDATE OF consent,submit_sha,receipt ON remote_jobs
                    WHEN OLD.submit_sha IS NOT NULL
                    BEGIN SELECT RAISE(ABORT,'remote submit receipt immutable'); END;
                CREATE TRIGGER IF NOT EXISTS remote_terminal_input_erasure BEFORE UPDATE OF package,input_text ON remote_jobs
                    WHEN NEW.package IS NOT NULL OR NEW.input_text IS NOT NULL OR NEW.state NOT IN ('succeeded','failed','cancelled','indeterminate','rejected')
                    BEGIN SELECT RAISE(ABORT,'remote input only erased at terminal'); END;
                CREATE TRIGGER IF NOT EXISTS remote_retain_receipts BEFORE DELETE ON remote_jobs
                    BEGIN SELECT RAISE(ABORT,'remote receipts retained'); END;
                CREATE TABLE IF NOT EXISTS remote_cancel_receipts (
                    cancel_key TEXT PRIMARY KEY, request_sha TEXT NOT NULL, response TEXT NOT NULL);
                CREATE TRIGGER IF NOT EXISTS remote_cancel_immutable BEFORE UPDATE ON remote_cancel_receipts
                    BEGIN SELECT RAISE(ABORT,'remote cancellation immutable'); END;
            ''')
            # Recover using remote status first; never invent a new remote key.
            db.execute("UPDATE remote_jobs SET state='unknown',error='OS daemon restarted after sending claim; reconcile same key',next_attempt=0 WHERE state='sending'")

    @contextmanager
    def _admission(self):
        with self.hub.lock:
            if self.registry is not None:
                with self.registry.admission_guard():
                    yield
            else:
                yield

    def _client(self, target, endpoint=None):
        client = self.clients.get(target)
        if client is None:
            raise ValueError('selected remote endpoint is unavailable; no mode fallback')
        if client.attempts > 2 or getattr(client.transport,'timeout',3) > 3:
            raise ValueError('OS remote client requires at most two attempts and three-second exchanges')
        if client.transport.target != target or (endpoint is not None and client.endpoint_id != endpoint):
            raise ValueError('configured endpoint no longer matches approved destination')
        return client

    def _installed(self, tool_id, target, *, expected_hash=None, expected_version=None):
        with self.hub.connect() as db:
            row = db.execute('SELECT p.*,i.enabled FROM hub_packages p JOIN hub_installed i USING(id,version) WHERE id=?', (tool_id,)).fetchone()
            if not row or not row['enabled']:
                raise ValueError('remote Tool must be installed and explicitly enabled')
            package = json.loads(row['body'])
            revoked = {value[0] for value in db.execute('SELECT subject FROM hub_revoked')}
            manifest, sha = verify_package(package, self.hub.trust, revoked)
            require_compatible(manifest)
            if sha != row['hash'] or (expected_hash is not None and sha != expected_hash) or (expected_version is not None and manifest['version'] != expected_version):
                raise ValueError('installed package changed after remote preparation')
            if manifest['schema_version'] not in (3, 4) or target not in manifest['execution_targets']:
                raise ValueError('signed package does not permit selected remote target')
            return package, manifest, sha

    def dispatch(self, request):
        """Handler supplies authenticated OS admission; never wrap in Hub.request."""
        if not isinstance(request, dict) or type(request.get('v')) is not int or request.get('v') != 1:
            raise ValueError('remote protocol version 1 required')
        fields = {'remote.prepare': {'v','op','id','target','text','key'},
                  'remote.submit': {'v','op','key','consent'},
                  'remote.status': {'v','op','key'},
                  'remote.cancel': {'v','op','key','cancel_key'},
                  'remote.history': {'v','op'}}
        op = request.get('op')
        if op not in fields or set(request) != fields[op]:
            raise ValueError('unknown remote operation or field')
        if 'key' in request:
            identifier(request['key'], 'remote key')
        if op == 'remote.prepare':
            result = self.prepare(request['id'], request['target'], request['text'], request['key'])
        elif op == 'remote.submit':
            result = self.submit(request['key'], request['consent'])
        elif op == 'remote.cancel':
            result = self.cancel(request['key'], request['cancel_key'])
        elif op == 'remote.status':
            result = self.status(request['key'])
        else:
            result = self.snapshot()
        return {'ok': True, 'result': result}

    def prepare(self, tool_id, target, text, key):
        identifier(key, 'remote key')
        if not isinstance(tool_id, str) or not 1 <= len(tool_id) <= 100:
            raise ValueError('invalid Tool id')
        if target not in {'cloud','pc_usb'} or not isinstance(text, str) or len(text.encode('utf-8')) > MAX_INPUT:
            raise ValueError('invalid target or input exceeds 64 KiB UTF-8')
        request_sha = digest({'id': tool_id, 'target': target, 'text': text, 'key': key})
        with self._admission(), self.mutex, closing(self.connect()) as db, db:
            db.execute('BEGIN IMMEDIATE')
            old = db.execute('SELECT * FROM remote_jobs WHERE key=?', (key,)).fetchone()
            if old:
                if old['prepare_sha'] != request_sha:
                    raise ValueError('remote key has different prepared input')
                return json.loads(old['preview'])
            client = self._client(target)
            package, manifest, sha = self._installed(tool_id, target)
            count, pending, used = db.execute("SELECT COUNT(*),COALESCE(SUM(state='prepared'),0),COALESCE(SUM(LENGTH(CAST(input_text AS BLOB))+LENGTH(CAST(package AS BLOB))),0) FROM remote_jobs").fetchone()
            reserved = (count + 1) * (MAX_OUTPUT * 6 + 16384) + used + len(text.encode()) + len(canonical(package))
            if count >= self.max_history or pending >= self.max_prepared or reserved > self.max_bytes:
                raise ValueError('remote prepared/history storage capacity reached')
            consent = consent_for(package, text, target=target, endpoint_id=client.endpoint_id, key=key)
            preview = {'prepared': True, 'approved': False, 'key': key, 'id': tool_id, 'version': manifest['version'],
                       'package_hash': sha, 'input_sha256': consent['input_sha256'], 'input_bytes': len(text.encode()),
                       'target': target, 'endpoint_id': client.endpoint_id, 'transport_evidence': client.transport.evidence,
                       'physical_usb': 'NOT_RUN', 'consent': consent, 'amount_minor': 0,
                       'meaning': 'preview only; no data sent and no execution accepted'}
            now = time.time()
            db.execute('INSERT INTO remote_jobs(key,prepare_sha,preview,tool_id,version,package_hash,target,endpoint_id,input_sha,package,input_text,state,created,updated) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
                       (key,request_sha,canonical(preview).decode(),tool_id,manifest['version'],sha,target,client.endpoint_id,
                        consent['input_sha256'],canonical(package).decode(),text,'prepared',now,now))
        return preview

    def submit(self, key, consent):
        identifier(key, 'remote key')
        request_sha = digest({'key':key,'consent':consent})
        with self._admission(), self.mutex, closing(self.connect()) as db, db:
            db.execute('BEGIN IMMEDIATE')
            row = db.execute('SELECT * FROM remote_jobs WHERE key=?', (key,)).fetchone()
            if not row:
                raise ValueError('remote preparation not found')
            if row['submit_sha'] is not None:
                if row['submit_sha'] != request_sha:
                    raise ValueError('remote submit key conflicts with original consent')
                return json.loads(row['receipt'])
            if row['state'] != 'prepared':
                raise ValueError('remote preparation is no longer eligible')
            expected = json.loads(row['preview'])['consent']
            if not isinstance(consent, dict) or consent != expected or type(consent.get('approved')) is not bool:
                raise ValueError('explicit submit consent must match exact preview and input')
            self._client(row['target'], row['endpoint_id'])
            self._installed(row['tool_id'], row['target'], expected_hash=row['package_hash'], expected_version=row['version'])
            active = db.execute("SELECT COUNT(*) FROM remote_jobs WHERE state IN ('queued','sending','unknown','accepted','running')").fetchone()[0]
            if active >= self.max_active:
                raise ValueError('remote active job capacity reached')
            receipt = {'accepted': True, 'operation': key, 'scope': 'OS remote queue', 'remote_accepted': False,
                       'meaning': 'local durable acceptance; consult remote.status for actual remote execution'}
            db.execute("UPDATE remote_jobs SET consent=?,submit_sha=?,receipt=?,state='queued',updated=? WHERE key=?",
                       (canonical(consent).decode(),request_sha,canonical(receipt).decode(),time.time(),key))
        self.wake.set()
        self._restart_if_dead()
        return receipt

    def cancel(self, key, cancel_key):
        identifier(key, 'remote key'); identifier(cancel_key, 'cancellation key')
        request_sha = digest({'key': key, 'cancel_key': cancel_key})
        with self.mutex, closing(self.connect()) as db, db:
            db.execute('BEGIN IMMEDIATE')
            prior = db.execute('SELECT * FROM remote_cancel_receipts WHERE cancel_key=?',(cancel_key,)).fetchone()
            if prior:
                if prior['request_sha'] != request_sha:
                    raise ValueError('cancellation key conflict')
                return json.loads(prior['response'])
            if db.execute('SELECT COUNT(*) FROM remote_cancel_receipts').fetchone()[0] >= self.max_history * 4:
                raise ValueError('cancellation receipt capacity reached')
            row = db.execute('SELECT * FROM remote_jobs WHERE key=?',(key,)).fetchone()
            if not row:
                raise ValueError('remote job not found')
            terminal = row['state'] in LOCAL_TERMINAL
            before_claim = not row['send_claimed'] and not terminal
            response = {'accepted': True, 'operation': cancel_key, 'key': key, 'before_send_claim': before_claim,
                        'meaning': 'prevented before sending claim' if before_claim else 'cancellation intent recorded; remote outcome must be reconciled'}
            if not terminal:
                if before_claim:
                    db.execute("UPDATE remote_jobs SET state='cancelled',cancel_requested=1,package=NULL,input_text=NULL,updated=? WHERE key=?",(time.time(),key))
                else:
                    db.execute('UPDATE remote_jobs SET cancel_requested=1,next_attempt=0,updated=? WHERE key=?',(time.time(),key))
            db.execute('INSERT INTO remote_cancel_receipts VALUES(?,?,?)',(cancel_key,request_sha,canonical(response).decode()))
        self.wake.set(); self._restart_if_dead()
        return response

    @staticmethod
    def _state(row, include_output=True):
        remote = json.loads(row['remote_status']) if row['remote_status'] else None
        if remote is not None and not include_output:
            receipt = remote.get('receipt') or {}
            execution = remote.get('execution') or {}
            remote = {'found':remote.get('found'), 'state':remote.get('state'),
                      'cancel_requested':remote.get('cancel_requested'),
                      'error':str(remote.get('error') or '')[:256],
                      'receipt':{key:receipt.get(key) for key in ('request_sha256','actual_target','transport_evidence')},
                      'execution':{key:str(execution.get(key) or '')[:128] for key in ('kind','physical_usb')}}
        return {'key':row['key'],'id':row['tool_id'],'version':row['version'],'package_hash':row['package_hash'],
                'target':row['target'],'endpoint_id':row['endpoint_id'],'state':row['state'],
                'send_claimed':bool(row['send_claimed']),'cancel_requested':bool(row['cancel_requested']),
                'local_receipt':json.loads(row['receipt']) if row['receipt'] else None,
                'remote':remote,'error':row['error'],'next_attempt':row['next_attempt'],
                'meaning':'remote execution state; never a local Hub job or Wallet sale'}

    def status(self, key):
        identifier(key, 'remote key'); self._restart_if_dead()
        with self.mutex, closing(self.connect()) as db:
            row = db.execute('SELECT * FROM remote_jobs WHERE key=?',(key,)).fetchone()
            if not row:
                raise ValueError('remote job not found')
            return self._state(row)

    def snapshot(self,byte_budget=32768):
        if type(byte_budget) is not int or not 2048 <= byte_budget <= 192 * 1024:
            raise ValueError('remote snapshot byte budget must be 2048 to 196608')
        self._restart_if_dead()
        with self.mutex, closing(self.connect()) as db:
            total=db.execute('SELECT COUNT(*) FROM remote_jobs').fetchone()[0]
            rows=db.execute('SELECT * FROM remote_jobs ORDER BY created DESC LIMIT 50').fetchall()
        result={'configured':bool(self.clients),'destinations':[
                    {'target':target,'available':target in self.clients,
                     'endpoint_id':self.clients[target].endpoint_id if target in self.clients else None,
                     'transport_evidence':self.clients[target].transport.evidence if target in self.clients else None,
                     'physical_usb':'NOT_RUN'} for target in ('cloud','pc_usb')],
                'history':[],'total_history':total,'history_truncated':total>0,'snapshot_byte_budget':byte_budget,
                'worker_alive':bool(self.thread and self.thread.is_alive()),'worker_error':self.worker_error,
                'worker_failures':self.worker_failures,'history_includes_output':False,
                'actual_local_execution':False,'simulation_only':True}
        if len(canonical(result))>byte_budget:
            raise ValueError('remote snapshot metadata exceeds byte budget')
        for row in rows:
            history=result['history']+[self._state(row,False)]
            candidate={**result,'history':history,'history_truncated':len(history)<total}
            if len(canonical(candidate))>byte_budget:
                break
            result=candidate
        return result

    def _policy(self, row):
        self._client(row['target'],row['endpoint_id'])
        package, _, _ = self._installed(row['tool_id'],row['target'],expected_hash=row['package_hash'],expected_version=row['version'])
        if row['package'] is None or digest(json.loads(row['package'])) != row['package_hash']:
            raise ValueError('stored remote package hash mismatch')
        if not isinstance(row['input_text'],str) or hashlib.sha256(row['input_text'].encode()).hexdigest() != row['input_sha']:
            raise ValueError('stored remote input hash mismatch')
        consent = json.loads(row['consent'])
        if consent != consent_for(package,row['input_text'],target=row['target'],endpoint_id=row['endpoint_id'],key=row['key']):
            raise ValueError('stored explicit remote consent mismatch')
        return package, consent

    def _claim(self,key):
        try:
            return self._claim_checked(key)
        except ValueError:
            # Cleanup of an already-sent job does not require fresh permission
            # to transmit text. No input is re-submitted on this branch.
            with self.mutex, closing(self.connect()) as db, db:
                row=db.execute('SELECT * FROM remote_jobs WHERE key=?',(key,)).fetchone()
                if not row or row['state'] not in ACTIVE or not row['send_claimed']:
                    raise
                db.execute("UPDATE remote_jobs SET cancel_requested=1,state='sending' WHERE key=?",(key,))
                db.commit()
                row=dict(row);row['cancel_requested']=1
                return row,json.loads(row['package']),json.loads(row['consent'])

    def _claim_checked(self, key):
        with self._admission(), self.mutex, closing(self.connect()) as db, db:
            db.execute('BEGIN IMMEDIATE')
            row = db.execute('SELECT * FROM remote_jobs WHERE key=?',(key,)).fetchone()
            if row['state'] not in ACTIVE:
                return None
            try:
                package, consent = self._policy(row)
            except ValueError as error:
                if not row['send_claimed']:
                    db.execute("UPDATE remote_jobs SET state='rejected',package=NULL,input_text=NULL,error=?,updated=? WHERE key=?",(str(error)[:256],time.time(),key))
                    return None
                db.execute('UPDATE remote_jobs SET cancel_requested=1,error=? WHERE key=?',(str(error)[:256],key))
                package,consent = json.loads(row['package']),json.loads(row['consent'])
            if row['cancel_requested'] and not row['send_claimed']:
                db.execute("UPDATE remote_jobs SET state='cancelled',package=NULL,input_text=NULL,updated=? WHERE key=?",(time.time(),key))
                return None
            db.execute("UPDATE remote_jobs SET state='sending',send_claimed=1,updated=? WHERE key=?",(time.time(),key))
            db.commit()  # The agreed admission/sending linearization boundary.
            current = db.execute('SELECT * FROM remote_jobs WHERE key=?',(key,)).fetchone()
            return dict(current),package,consent

    def _request_hash(self, row, package, consent):
        return digest({'v':1,'op':'submit','endpoint_id':row['endpoint_id'],'key':row['key'],
                       'package':package,'text':row['input_text'],'consent':consent})

    def _validate_remote(self, value, row, package, consent):
        if not isinstance(value,dict) or value.get('key') != row['key'] or type(value.get('found')) is not bool:
            raise TransportError('remote status key or shape mismatch')
        if not value['found']:
            if value.get('endpoint_id') != row['endpoint_id']:
                raise TransportError('remote missing-status endpoint mismatch')
            return value
        receipt = value.get('receipt')
        client = self._client(row['target'],row['endpoint_id'])
        if (not isinstance(receipt,dict) or receipt.get('accepted') is not True or receipt.get('key') != row['key']
                or receipt.get('physical_usb') != 'NOT_RUN' or receipt.get('request_sha256') != self._request_hash(row,package,consent)
                or receipt.get('endpoint_id') != row['endpoint_id'] or receipt.get('actual_target') != row['target']
                or receipt.get('transport_evidence') != client.transport.evidence
                or value.get('state') not in {'queued','running'} | TERMINAL):
            raise TransportError('remote receipt, transport or state mismatch')
        if value.get('state') == 'succeeded' and (not isinstance(value.get('output'),str) or not isinstance(value.get('execution'),dict)):
            raise TransportError('successful remote status lacks actual output or executor evidence')
        output = value.get('output')
        if output is not None and (not isinstance(output,str) or len(output.encode()) > MAX_OUTPUT):
            raise TransportError('remote output exceeds 128 KiB')
        if len(canonical(value)) > MAX_OUTPUT * 6 + 16384:
            raise TransportError('remote status exceeds retained bound')
        return value

    def process_one(self):
        with self.processing:
            with self.mutex, closing(self.connect()) as db:
                row = db.execute("SELECT key FROM remote_jobs WHERE state IN ('queued','sending','unknown','accepted','running') AND next_attempt<=? ORDER BY next_attempt,created LIMIT 1",(time.time(),)).fetchone()
            if row is None:
                return False
            key = row['key']
            claim = self._claim(key)
            if claim is None:
                return True
            row,package,consent = claim
            client = self._client(row['target'],row['endpoint_id'])
            try:
                remote = self._validate_remote(client.status(key),row,package,consent)
                with self.mutex, closing(self.connect()) as db:
                    cancel = bool(db.execute('SELECT cancel_requested FROM remote_jobs WHERE key=?',(key,)).fetchone()[0])
                if cancel:
                    if remote['found'] and remote['state'] not in TERMINAL:
                        remote = self._validate_remote(client.cancel(key),row,package,consent)
                    if not remote['found']:
                        self._finish(key,'cancelled',remote,error='no matching remote job; cancelled after claim without re-submission')
                        return True
                elif not remote['found']:
                    # Same exact key only. No cross-mode, package or input substitution.
                    receipt = client.submit(package,row['input_text'],key,consent=consent)
                    if not isinstance(receipt,dict) or receipt.get('request_sha256') != self._request_hash(row,package,consent):
                        raise TransportError('remote acceptance request hash mismatch')
                    remote = self._validate_remote(client.status(key),row,package,consent)
                    if not remote['found']:
                        raise TransportError('remote acceptance not yet observable; retain same key')
                state = remote['state'] if remote['state'] != 'queued' else 'accepted'
                self._finish(key,state,remote)
            except (TransportError,OSError,sqlite3.Error) as error:
                self._unknown(key,error)
            except ValueError as error:
                # A policy or remote rejection after claim cannot prove no remote job.
                self._unknown(key,error,request_cancel=True)
            return True

    def _finish(self,key,state,remote,error=None):
        with self.mutex, closing(self.connect()) as db, db:
            terminal = state in LOCAL_TERMINAL
            row = db.execute('SELECT state FROM remote_jobs WHERE key=?',(key,)).fetchone()
            if row['state'] in LOCAL_TERMINAL:
                return
            values = (state,canonical(remote).decode(),error,0 if terminal else time.time()+self.poll_seconds,time.time(),key)
            if terminal:
                db.execute('UPDATE remote_jobs SET state=?,remote_status=?,error=?,failures=0,next_attempt=?,updated=?,package=NULL,input_text=NULL WHERE key=?',values)
            else:
                db.execute('UPDATE remote_jobs SET state=?,remote_status=?,error=?,failures=0,next_attempt=?,updated=? WHERE key=?',values)

    def _unknown(self,key,error,request_cancel=False):
        with self.mutex, closing(self.connect()) as db, db:
            db.execute('BEGIN IMMEDIATE')
            row = db.execute('SELECT failures,state FROM remote_jobs WHERE key=?',(key,)).fetchone()
            # Completion may be durable even when its commit path reported an
            # I/O error. Never resurrect terminal jobs whose input is erased.
            if row is None or row['state'] in LOCAL_TERMINAL:
                return
            failures = row['failures']+1
            delay = min(self.retry_max,self.retry_initial*2**min(failures-1,16))
            db.execute("UPDATE remote_jobs SET state='unknown',error=?,failures=?,next_attempt=?,updated=?,cancel_requested=MAX(cancel_requested,?) WHERE key=?",
                       ((type(error).__name__+': '+str(error))[:256],failures,time.time()+delay,time.time(),int(request_cancel),key))

    def start(self):
        with self.thread_lock:
            if self.stopping.is_set():
                raise ValueError('remote controller is closed')
            if not self.thread or not self.thread.is_alive():
                self.thread=threading.Thread(target=self._loop,name='rock-remote-controller',daemon=True)
                self.thread.start()
            self.wake.set()

    def _restart_if_dead(self):
        if self.thread is not None and not self.thread.is_alive() and not self.stopping.is_set():
            self.start()

    def _loop(self):
        while not self.stopping.is_set():
            try:
                worked=self.process_one()
                self.worker_error,self.worker_failures=None,0
                if not worked:
                    self.wake.wait(self.poll_seconds); self.wake.clear()
            except Exception as error:
                self.worker_failures+=1
                self.worker_error=(type(error).__name__+': '+str(error))[:256]
                self.stopping.wait(min(self.retry_max,self.retry_initial*2**min(self.worker_failures-1,16)))

    def close(self):
        self.stopping.set(); self.wake.set()
        if self.thread:
            self.thread.join(35)
            if self.thread.is_alive():
                raise RuntimeError('remote network worker still running; retain instance lock')
        os.close(self.instance_fd)

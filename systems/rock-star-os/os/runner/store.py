"""Single-owner-process durable job journal, with at-most-once dispatch.

A running job recovered after process death becomes indeterminate, never queued.
The original submit receipt is immutable; status is the only completion claim.
"""
from contextlib import closing, nullcontext
import fcntl
import json
import os
from pathlib import Path
import sqlite3
import stat
import threading
import time

from blackberryrock.packages import canonical, require_compatible, verify_package
from service_access import ServiceConfigurationError
from .protocol import (MAX_INPUT, MAX_OUTPUT, PROTOCOL, TERMINAL, RunnerError, authenticate,
                       digest, identifier, sign_response, text_hash)


class RunnerStore:
    def __init__(self, directory, *, endpoint_id, target, transport_evidence, owners,
                 publisher_trust, executor, start_worker=True, max_jobs=1000,
                 max_storage_bytes=64 * 1024 * 1024, service_access=None):
        if target not in {'cloud', 'pc_usb'}:
            raise RunnerError('unsupported configured runner target')
        self.endpoint_id = identifier(endpoint_id, 'endpoint')
        self.target, self.transport_evidence = target, transport_evidence
        self.service_access = service_access
        self.directory = Path(directory)
        self.directory.mkdir(parents=True, mode=0o700, exist_ok=True)
        info = self.directory.lstat()
        if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.geteuid() or info.st_mode & 0o077:
            raise RunnerError('runner state must be a private service-owned directory')
        self.lock_fd = os.open(self.directory / 'instance.lock', os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
        try:
            info = os.fstat(self.lock_fd)
            if not stat.S_ISREG(info.st_mode) or info.st_uid != os.geteuid() or info.st_nlink != 1:
                raise RunnerError('unsafe runner instance lock')
            fcntl.flock(self.lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BaseException:
            os.close(self.lock_fd)
            raise
        self.database = self.directory / 'jobs.sqlite3'
        descriptor = os.open(self.database, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
        info = os.fstat(descriptor)
        os.close(descriptor)
        if not stat.S_ISREG(info.st_mode) or info.st_uid != os.geteuid() or info.st_nlink != 1:
            os.close(self.lock_fd)
            raise RunnerError('unsafe runner database')
        self.owners = {k: {'token': v['token'], 'publishers': set(v['publishers'])} for k, v in owners.items()}
        self.trust = dict(publisher_trust)
        self.executor = executor
        self.max_jobs, self.max_storage_bytes = max_jobs, max_storage_bytes
        self.mutex = threading.RLock()
        self.execution_lock = threading.Lock()
        self.wake, self.stop = threading.Event(), threading.Event()
        self.cancel_events = {}
        self.worker = None
        self.worker_error, self.worker_failures = None, 0
        try:
            self._initialize_database()
        except BaseException:
            os.close(self.lock_fd)
            raise
        if start_worker:
            self.start()

    def _initialize_database(self):
        with closing(self.connect()) as db, db:
            tables = {r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
            prior = db.execute("SELECT value FROM metadata WHERE key='service_access'").fetchone() if 'metadata' in tables else None
            access_binding = canonical({'mode': 'closed-purchaser', 'authority_id': self.service_access.authority_id}).decode() if self.service_access else None
            mode_rows = db.execute('SELECT singleton,binding FROM runner_service_access').fetchall() if 'runner_service_access' in tables else []
            if 'runner_service_access' in tables:
                if len(mode_rows) != 1 or mode_rows[0][0] != 1 or prior is None or mode_rows[0][1] != prior[0]:
                    raise RunnerError('closed runner authority marker is incomplete or inconsistent')
            elif prior is not None:
                raise RunnerError('closed runner authority marker is incomplete')
            if prior is None and 'jobs' in tables:
                columns = {r[1] for r in db.execute('PRAGMA table_info(jobs)')}
                if {'consumer_id', 'device_ref'} <= columns and db.execute('SELECT 1 FROM jobs WHERE consumer_id IS NOT NULL OR device_ref IS NOT NULL LIMIT 1').fetchone():
                    raise RunnerError('closed runner origins require their retained authority marker')
            if prior is not None and prior[0] != access_binding:
                raise RunnerError('closed runner requires its original service authority')
            if access_binding is not None and prior is None and 'jobs' in tables and db.execute('SELECT 1 FROM jobs LIMIT 1').fetchone():
                raise RunnerError('closed runner requires fresh empty state; legacy jobs are not migrated')
            db.executescript('''
                CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS jobs (
                    owner TEXT NOT NULL, key TEXT NOT NULL, request_sha256 TEXT NOT NULL,
                    request_json TEXT, receipt_json TEXT NOT NULL,
                    state TEXT NOT NULL CHECK(state IN ('queued','running','succeeded','failed','cancelled','indeterminate')),
                    cancel_requested INTEGER NOT NULL DEFAULT 0, output_json TEXT, error TEXT,
                    execution_json TEXT, created_at REAL NOT NULL, started_at REAL, finished_at REAL,
                    PRIMARY KEY(owner,key));
                CREATE TRIGGER IF NOT EXISTS immutable_submit BEFORE UPDATE OF owner,key,request_sha256,receipt_json,created_at ON jobs
                    BEGIN SELECT RAISE(ABORT,'submit receipt immutable'); END;
                CREATE TRIGGER IF NOT EXISTS erase_input_only_at_terminal BEFORE UPDATE OF request_json ON jobs
                    WHEN NEW.request_json IS NOT NULL OR NEW.state NOT IN ('succeeded','failed','cancelled','indeterminate')
                    BEGIN SELECT RAISE(ABORT,'raw input may only be erased at terminal'); END;
                CREATE TRIGGER IF NOT EXISTS retain_jobs BEFORE DELETE ON jobs
                    BEGIN SELECT RAISE(ABORT,'job receipts retained'); END;
                CREATE TABLE IF NOT EXISTS revocations (subject TEXT PRIMARY KEY, recorded_at REAL NOT NULL);
                CREATE TRIGGER IF NOT EXISTS retain_revocations BEFORE DELETE ON revocations
                    BEGIN SELECT RAISE(ABORT,'revocations append only'); END;
                CREATE TRIGGER IF NOT EXISTS immutable_revocations BEFORE UPDATE ON revocations
                    BEGIN SELECT RAISE(ABORT,'revocations append only'); END;
            ''')
            columns = {r[1] for r in db.execute('PRAGMA table_info(jobs)')}
            for name in ('consumer_id', 'device_ref'):
                if name not in columns:
                    db.execute('ALTER TABLE jobs ADD COLUMN '+name+' TEXT')
            db.execute('''CREATE TRIGGER IF NOT EXISTS immutable_consumer BEFORE UPDATE OF consumer_id,device_ref ON jobs
                          BEGIN SELECT RAISE(ABORT,'original consumer device binding immutable'); END''')
            if access_binding is not None:
                db.execute("INSERT OR IGNORE INTO metadata VALUES('service_access',?)", (access_binding,))
                db.execute('CREATE TABLE IF NOT EXISTS runner_service_access(singleton INTEGER PRIMARY KEY CHECK(singleton=1),binding TEXT NOT NULL)')
                db.execute('INSERT OR IGNORE INTO runner_service_access VALUES(1,?)', (access_binding,))
                db.execute("CREATE TRIGGER IF NOT EXISTS runner_service_access_no_delete BEFORE DELETE ON runner_service_access BEGIN SELECT RAISE(ABORT,'closed runner mode retained'); END")
                db.execute("CREATE TRIGGER IF NOT EXISTS runner_service_access_no_update BEFORE UPDATE ON runner_service_access BEGIN SELECT RAISE(ABORT,'closed runner mode immutable'); END")
                db.execute("CREATE TRIGGER IF NOT EXISTS service_access_metadata_no_delete BEFORE DELETE ON metadata WHEN OLD.key='service_access' BEGIN SELECT RAISE(ABORT,'closed runner metadata retained'); END")
                db.execute("CREATE TRIGGER IF NOT EXISTS service_access_metadata_no_update BEFORE UPDATE ON metadata WHEN OLD.key='service_access' OR NEW.key='service_access' BEGIN SELECT RAISE(ABORT,'closed runner metadata immutable'); END")
            binding = canonical({'endpoint_id': self.endpoint_id, 'target': self.target, 'transport_evidence': self.transport_evidence}).decode()
            prior = db.execute("SELECT value FROM metadata WHERE key='endpoint'").fetchone()
            if prior and prior[0] != binding:
                raise RunnerError('state is bound to another transport endpoint')
            db.execute("INSERT OR IGNORE INTO metadata VALUES ('endpoint',?)", (binding,))
            db.execute("UPDATE jobs SET state='indeterminate',request_json=NULL,error='runner restarted after dispatch; automatic re-execution forbidden',finished_at=? WHERE state='running'", (time.time(),))

    def connect(self):
        db = sqlite3.connect(self.database, timeout=2)
        try:
            db.row_factory = sqlite3.Row
            db.execute('PRAGMA journal_mode=DELETE')
            db.execute('PRAGMA synchronous=EXTRA')
            db.execute('PRAGMA busy_timeout=2000')
            db.execute('PRAGMA secure_delete=ON')
            return db
        except BaseException:
            db.close()
            raise

    def _verify_submit(self, request, owner, db):
        # Local-only packages cannot enter the remote runner.
        package = request['package']
        revoked = {row[0] for row in db.execute('SELECT subject FROM revocations')}
        manifest, package_hash = verify_package(package, self.trust, revoked)
        require_compatible(manifest)
        if manifest['schema_version'] not in (3, 4) or self.target not in manifest['execution_targets']:
            raise RunnerError('signed package does not authorize this remote target')
        self._remote_policy(manifest)
        if owner not in self.owners or manifest['publisher'] not in self.owners[owner]['publishers']:
            raise RunnerError('owner is not approved for this publisher')
        value = request['text']
        if not isinstance(value, str) or len(value.encode('utf-8')) > MAX_INPUT:
            raise RunnerError('UTF-8 input exceeds 64 KiB')
        expected = {'approved': True, 'package_sha256': package_hash, 'input_sha256': text_hash(value),
                    'target': self.target, 'endpoint_id': self.endpoint_id, 'key': request['key']}
        consent = request['consent']
        if not isinstance(consent, dict) or consent != expected or type(consent.get('approved')) is not bool:
            raise RunnerError('explicit consent must bind this exact input, package, endpoint, target and key')
        return manifest, package_hash

    def _remote_policy(self, manifest):
        # Require the shared schema-3 contract, including input-bound consent.
        if manifest.get('remote') != {'consent': 'per_job_input_sha256', 'retention': 'job_receipts', 'protocol': PROTOCOL}:
            raise RunnerError('signed remote consent/retention/protocol policy is required')

    def _validate(self, request):
        if not isinstance(request, dict) or type(request.get('v')) is not int or request.get('v') != 1:
            raise RunnerError('invalid runner protocol version')
        op = request.get('op')
        fields = {'v', 'op', 'endpoint_id', 'key'}
        if op == 'submit':
            fields |= {'package', 'text', 'consent'}
        elif op not in {'status', 'cancel'}:
            raise RunnerError('unsupported runner operation')
        if set(request) != fields or request['endpoint_id'] != self.endpoint_id:
            raise RunnerError('unknown fields or incorrect endpoint')
        identifier(request['key'], 'job key')

    def dispatch(self, envelope, *, transport_target, transport_evidence):
        # The transport supplies these arguments; JSON cannot claim a mode.
        if transport_target != self.target or transport_evidence != self.transport_evidence:
            raise RunnerError('transport does not match configured endpoint')
        authority_id = self.service_access.authority_id if self.service_access else None
        owner, policy = authenticate(envelope, self.owners, authority_id=authority_id)
        request = envelope['request']
        try:
            self._validate(request)
            if self.service_access is not None:
                # HMAC possession is separate from current purchaser policy.
                # Include authority storage failures in the signed unavailable
                # envelope, without erasing or falsely rejecting a prior job.
                self.service_access.authenticate(owner, 'Bearer '+policy['token'])
            scope = self.service_access.guard(owner, 'runner.'+self.target+'.recover') if self.service_access else nullcontext(None)
            with scope as access:
                tenant = access['tenant'] if access is not None else owner
                if request['op'] == 'submit':
                    result = self.submit(tenant, request, _access=access, _consumer=owner)
                elif request['op'] == 'status':
                    result = self.status(tenant, request['key'], _access=access)
                else:
                    result = self.cancel(tenant, request['key'], _access=access)
            response = {'ok': True, 'result': result}
        except PermissionError:
            response = {'ok': False, 'code': 'unauthorized', 'error': 'current purchased-device or paid service access required'}
        except ServiceConfigurationError:
            response = {'ok': False, 'code': 'unavailable', 'error': 'service authority unavailable; reconcile using same owner and key'}
        except ValueError as error:
            response = {'ok': False, 'code': 'rejected', 'error': str(error)[:256]}
        except (sqlite3.Error, OSError):
            response = {'ok': False, 'code': 'unavailable', 'error': 'storage unavailable; reconcile using same owner and key'}
        return sign_response(policy['token'], request, response, authority_id=authority_id)

    def _require_scope(self, owner, access):
        if self.service_access is not None and (access is None or access['tenant'] != owner or access['authority_id'] != self.service_access.authority_id):
            raise RunnerError('closed runner action requires current service authority scope')

    def submit(self, owner, request, *, _access=None, _consumer=None):
        self._require_scope(owner, _access)
        with self.mutex, closing(self.connect()) as db, db:
            db.execute('BEGIN IMMEDIATE')
            old = db.execute('SELECT * FROM jobs WHERE owner=? AND key=?', (owner, request['key'])).fetchone()
            request_hash = digest(request)
            if old:
                if old['request_sha256'] != request_hash:
                    raise RunnerError('same key has different input, package or consent')
                return json.loads(old['receipt_json'])
            # dispatch already holds the SAME Store guard. Nested payment
            # admission cannot race a fulfillment/payment change here.
            if self.service_access is not None:
                with self.service_access.guard(_consumer, 'runner.'+self.target+'.submit') as fresh:
                    if fresh['tenant'] != owner or fresh['device_ref'] != _access['device_ref']:
                        raise RunnerError('service identity changed during admission')
            self._verify_submit(request, _consumer if self.service_access else owner, db)
            count, used = db.execute('SELECT COUNT(*),COALESCE(SUM(LENGTH(CAST(request_json AS BLOB))),0) FROM jobs').fetchone()
            raw = canonical(request)
            # Reserve the worst-case bounded output for every retained job.
            if count >= self.max_jobs or used + len(raw) + (count + 1) * (MAX_OUTPUT * 6 + 8192) > self.max_storage_bytes:
                raise RunnerError('runner retained job capacity reached')
            receipt = {'accepted': True, 'key': request['key'], 'request_sha256': request_hash,
                       'endpoint_id': self.endpoint_id, 'actual_target': self.target,
                       'transport_evidence': self.transport_evidence, 'physical_usb': 'NOT_RUN', 'simulation_only': True,
                       'meaning': 'accepted; consult status for actual execution and result'}
            db.execute('INSERT INTO jobs (owner,key,request_sha256,request_json,receipt_json,state,created_at,consumer_id,device_ref) VALUES (?,?,?,?,?,?,?,?,?)',
                       (owner, request['key'], request_hash, raw.decode(), canonical(receipt).decode(), 'queued', time.time(),
                        _access['consumer_id'] if _access else None, _access['device_ref'] if _access else None))
        self.wake.set()
        return receipt

    def status(self, owner, key, *, _access=None):
        self._require_scope(owner, _access)
        with self.mutex, closing(self.connect()) as db:
            row = db.execute('SELECT * FROM jobs WHERE owner=? AND key=?', (owner, key)).fetchone()
            if not row:
                return {'found': False, 'key': key, 'endpoint_id': self.endpoint_id}
            return {'found': True, 'key': key, 'receipt': json.loads(row['receipt_json']), 'state': row['state'],
                    'cancel_requested': bool(row['cancel_requested']),
                    'output': json.loads(row['output_json']) if row['output_json'] is not None else None,
                    'execution': json.loads(row['execution_json']) if row['execution_json'] else None,
                    'error': row['error'], 'worker_alive': bool(self.worker and self.worker.is_alive()),
                    'worker_error': self.worker_error}

    def cancel(self, owner, key, *, _access=None):
        self._require_scope(owner, _access)
        with self.mutex, closing(self.connect()) as db, db:
            db.execute('BEGIN IMMEDIATE')
            row = db.execute('SELECT state FROM jobs WHERE owner=? AND key=?', (owner, key)).fetchone()
            if row and row['state'] not in TERMINAL:
                if row['state'] == 'queued':
                    db.execute("UPDATE jobs SET request_json=NULL,cancel_requested=1,state='cancelled',finished_at=? WHERE owner=? AND key=?", (time.time(), owner, key))
                else:
                    db.execute('UPDATE jobs SET cancel_requested=1 WHERE owner=? AND key=?', (owner, key))
                db.commit()
                event = self.cancel_events.get((owner, key))
                if event:
                    event.set()
        return self.status(owner, key, _access=_access)

    def revoke(self, subject):
        """Internal verified-policy hook; never callable from the owner wire API."""
        if not isinstance(subject, str) or not 1 <= len(subject) <= 256:
            raise RunnerError('invalid revocation')
        with self.mutex, closing(self.connect()) as db, db:
            db.execute('INSERT OR IGNORE INTO revocations VALUES (?,?)', (subject, time.time()))
            db.commit()
            for row in db.execute("SELECT owner,key,request_json FROM jobs WHERE state='running'"):
                manifest = json.loads(row['request_json'])['package']['manifest']
                if subject in {manifest['publisher'], manifest['id'] + '@' + manifest['version']}:
                    db.execute('UPDATE jobs SET cancel_requested=1 WHERE owner=? AND key=?', (row['owner'], row['key']))
                    db.commit()
                    event = self.cancel_events.get((row['owner'], row['key']))
                    if event:
                        event.set()
        self.wake.set()

    def tick(self):
        with self.execution_lock:
            return self._tick_serial()

    def _tick_serial(self):
        with self.mutex, closing(self.connect()) as db, db:
            db.execute('BEGIN IMMEDIATE')
            # A previous completion commit may have failed in this same daemon.
            # Serial execution ensures these are orphans, never live callbacks.
            db.execute("UPDATE jobs SET state='indeterminate',request_json=NULL,error='dispatch outcome could not be committed; automatic re-execution forbidden',finished_at=? WHERE state='running'", (time.time(),))
            row = db.execute("SELECT * FROM jobs WHERE state='queued' ORDER BY created_at,owner,key LIMIT 1").fetchone()
            if not row:
                return False
            candidate = dict(row)
        # Never acquire Store while holding Runner's lock. A candidate is only
        # a hint; re-read its immutable origin and queued state under the guard
        # before the durable running claim. No network/executor runs in a guard.
        owner, key = candidate['owner'], candidate['key']
        try:
            scope = self.service_access.guard(candidate['consumer_id'], 'runner.'+self.target+'.start') if self.service_access else nullcontext(None)
            with scope as access, self.mutex, closing(self.connect()) as db, db:
                db.execute('BEGIN IMMEDIATE')
                row = db.execute("SELECT * FROM jobs WHERE owner=? AND key=? AND state='queued'", (owner,key)).fetchone()
                if row is None:
                    return True
                if self.service_access is not None and (access['tenant'] != owner or access['device_ref'] != row['device_ref']
                        or access['consumer_id'] != row['consumer_id'] or row['consumer_id'] != candidate['consumer_id']):
                    raise RunnerError('queued service consumer binding differs')
                request = json.loads(row['request_json'])
                if digest(request) != row['request_sha256']:
                    raise RunnerError('persisted submission digest mismatch')
                self._verify_submit(request, row['consumer_id'] if self.service_access else owner, db)
                db.execute("UPDATE jobs SET state='running',started_at=? WHERE owner=? AND key=?", (time.time(), owner, key))
                db.commit()  # Durable single dispatch point; never repeated on restart.
                cancel = threading.Event()
                self.cancel_events[(owner, key)] = cancel
        except ServiceConfigurationError:
            raise  # Repairable authority unavailability: keep the queued input.
        except (PermissionError, RunnerError, ValueError) as failure:
            message = 'current purchased-device or paid service access rejected before start' if isinstance(failure, PermissionError) else str(failure)[:256]
            with self.mutex, closing(self.connect()) as db, db:
                db.execute("UPDATE jobs SET state='failed',request_json=NULL,error=?,finished_at=? WHERE owner=? AND key=? AND state='queued'",
                           (message, time.time(), owner, key))
            return True
        output, evidence, error = None, None, None
        try:
            output, evidence = self.executor.execute(request['text'], request['package']['recipe'], cancel)
            if not isinstance(output, str) or len(output.encode('utf-8')) > MAX_OUTPUT:
                raise RunnerError('executor output exceeds 128 KiB')
            if not isinstance(evidence, dict) or len(canonical(evidence)) > 4096:
                raise RunnerError('invalid executor evidence')
        except Exception as failure:
            error = (type(failure).__name__ + ': ' + str(failure))[:256]
        finally:
            with self.mutex:
                self.cancel_events.pop((owner, key), None)
        with self.mutex, closing(self.connect()) as db, db:
            row = db.execute('SELECT state,cancel_requested FROM jobs WHERE owner=? AND key=?', (owner, key)).fetchone()
            # Never overwrite a recovery or cancellation terminal decision.
            if row['state'] != 'running':
                return True
            revoked = {item[0] for item in db.execute('SELECT subject FROM revocations')}
            manifest = request['package']['manifest']
            is_revoked = bool(revoked & {manifest['publisher'], manifest['id'] + '@' + manifest['version']})
            state = 'cancelled' if row['cancel_requested'] or is_revoked else 'failed' if error else 'succeeded'
            db.execute('UPDATE jobs SET state=?,cancel_requested=?,request_json=NULL,output_json=?,execution_json=?,error=?,finished_at=? WHERE owner=? AND key=?',
                       (state, int(bool(row['cancel_requested']) or is_revoked), canonical(output).decode() if state == 'succeeded' else None,
                        canonical(evidence).decode() if evidence is not None else None, error, time.time(), owner, key))
        return True

    def start(self):
        with self.mutex:
            if self.stop.is_set():
                raise RunnerError('runner is closed')
            if not self.worker or not self.worker.is_alive():
                self.worker = threading.Thread(target=self._loop, name='rock-runner-worker', daemon=True)
                self.worker.start()

    def _loop(self):
        while not self.stop.is_set():
            try:
                ran = self.tick()
                self.worker_error, self.worker_failures = None, 0
                if not ran:
                    self.wake.wait(0.25)
                    self.wake.clear()
            except Exception as error:
                self.worker_failures += 1
                self.worker_error = (type(error).__name__ + ': ' + str(error))[:256]
                # An already-running job is not selected by tick again.
                self.stop.wait(min(5, 0.1 * 2 ** min(self.worker_failures - 1, 6)))

    def close(self):
        self.stop.set()
        self.wake.set()
        with self.mutex:
            for event in self.cancel_events.values():
                event.set()
        if self.worker:
            self.worker.join(8)
            if self.worker.is_alive():
                raise RunnerError('worker still running; retain instance lock')
        os.close(self.lock_fd)

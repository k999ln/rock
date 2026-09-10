"""Durable connector generations and explicit, immutable per-intent consent.

Lock order: principal adapter guard -> Broker mutex -> SQLite. Network I/O is
outside these locks. One broker owns this private database; no second writer or
untrusted adapter is supported. Sent operations are NEVER automatically resent.
"""
from contextlib import closing, contextmanager
from dataclasses import dataclass
import fcntl
import hashlib
import math
import os
from pathlib import Path
import re
import sqlite3
import stat
import threading
import time

from .http import canonical, decode, digest, identifier, MAX_INPUT, MAX_BODY, TransportError


class AccessDenied(PermissionError):
    pass


class Conflict(ValueError):
    pass


class Unavailable(OSError):
    pass


@dataclass(frozen=True)
class Principal:
    subject: str
    device_ref: str

    def validate(self):
        identifier(self.subject)
        identifier(self.device_ref)
        return self


class DenyAll:
    def authenticate(self, credentials):
        raise AccessDenied('principal adapter is not configured')

    @contextmanager
    def guard(self, principal, action):
        raise AccessDenied('principal adapter is not configured')
        yield  # pragma: no cover


TERMINAL = {'succeeded', 'failed', 'cancelled'}


class Broker:
    def __init__(self, state_dir, *, routes=None, recovery_routes=(), principal_adapter=None, clock=time.time,
                 max_operations=128, max_control_receipts=512, max_bytes=32 * 1024 * 1024):
        self.routes = dict(routes or {})
        for route_id in self.routes:
            identifier(route_id)
        if len(self.routes) > 32:
            raise ValueError('too many routes')
        self._recovery_routes = {digest(route.descriptor()): route for route in [*self.routes.values(), *recovery_routes]}
        if len(self._recovery_routes) > 64:
            raise ValueError('too many pinned recovery routes')
        for value, low, high in ((max_operations, 1, 512), (max_control_receipts, 1, 4096), (max_bytes, MAX_BODY * 2, 128 * 1024 * 1024)):
            if type(value) is not int or not low <= value <= high:
                raise ValueError('invalid storage bounds')
        self.max_operations, self.max_control_receipts, self.max_bytes = max_operations, max_control_receipts, max_bytes
        self.adapter, self.clock = principal_adapter or DenyAll(), clock
        self.mutex = threading.RLock()
        self._maximum_observed = 0
        self._processing = set()
        self._stop, self._wake = threading.Event(), threading.Event()
        self._worker, self._closed, self.last_error = None, False, None
        self.directory = Path(state_dir)
        self.directory.mkdir(mode=0o700, parents=True, exist_ok=True)
        st = self.directory.lstat()
        if not stat.S_ISDIR(st.st_mode) or st.st_uid != os.geteuid() or st.st_mode & 0o077:
            raise ValueError('state directory must be private and owned, not a symlink')
        self.path = self.directory / 'broker.sqlite3'
        self.lock_path = self.directory / 'broker.lock'
        retained_without_database = not self.path.exists() and any(self.directory.iterdir())
        for name in ('broker.lock', 'broker.sqlite3', 'broker.sqlite3-wal', 'broker.sqlite3-shm', 'broker.sqlite3-journal'):
            self._file_check(self.directory / name)
        self._lock_fd = os.open(self.lock_path, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
        try:
            fcntl.flock(self._lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            fresh = not self.path.exists()
            if fresh:
                if retained_without_database:
                    raise ValueError('retained broker history is missing; explicit recovery required')
                fd = os.open(self.path, os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW, 0o600)
                os.close(fd)
            self._initialize(fresh)
        except BaseException:
            os.close(self._lock_fd)
            self._lock_fd = None
            raise

    @staticmethod
    def _file_check(path):
        try:
            st = path.lstat()
        except FileNotFoundError:
            return
        if not stat.S_ISREG(st.st_mode) or st.st_nlink != 1 or st.st_uid != os.geteuid() or st.st_mode & 0o077:
            raise ValueError('private owned regular state file required')

    def _connect(self):
        if self._closed:
            raise Unavailable('broker is closed')
        self._file_check(self.path)
        # mode=rw refuses a missing file instead of recreating an empty history.
        db = sqlite3.connect(self.path.resolve().as_uri() + '?mode=rw', uri=True, timeout=2)
        db.row_factory = sqlite3.Row
        db.execute('PRAGMA foreign_keys=ON')
        db.execute('PRAGMA synchronous=FULL')
        return db

    @contextmanager
    def _transaction(self):
        with closing(self._connect()) as db:
            try:
                db.execute('BEGIN IMMEDIATE')
                yield db
                db.commit()
            except BaseException:
                db.rollback()
                # A rejected expired ceremony must not regain validity if the
                # clock is later moved back. Persist only the observed clock,
                # separately from the rolled-back business mutation.
                if self._maximum_observed:
                    db.execute('UPDATE broker_mode SET maximum_time=MAX(maximum_time,?) WHERE singleton=1', (self._maximum_observed,))
                    db.commit()
                raise

    def _initialize(self, fresh):
        with closing(self._connect()) as db:
            if not fresh:
                tables = {r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
                base = {'broker_mode', 'connections', 'control_receipts', 'operations'}
                if tables not in (base, base | {'connect_attempts'}):
                    raise ValueError('existing broker state is incomplete; explicit recovery required')
                mode = db.execute('SELECT singleton,schema_version,maximum_time FROM broker_mode').fetchall()
                if (len(mode) != 1 or mode[0]['singleton'] != 1 or mode[0]['schema_version'] not in (1, 2) or
                        type(mode[0]['maximum_time']) is not int or not 0 <= mode[0]['maximum_time'] < 2**62):
                    raise ValueError('retained broker clock marker is missing or invalid; explicit recovery required')
                if tables != (base if mode[0]['schema_version'] == 1 else base | {'connect_attempts'}):
                    raise ValueError('broker schema and version disagree; explicit recovery required')
                columns = {
                    'broker_mode': 'singleton schema_version maximum_time',
                    'connections': 'subject device alias epoch state route_id route_digest updated',
                    'control_receipts': 'subject device key request_digest response',
                    'operations': 'subject device key alias epoch route_id route_digest tool prepare_digest plan consent_digest input_text state send_claimed submit_receipt result error attempts next_attempt',
                    'connect_attempts': 'subject device key request_digest generation',
                }
                if (db.execute('PRAGMA quick_check').fetchone()[0] != 'ok' or any(
                        [row['name'] for row in db.execute('PRAGMA table_info('+name+')')] != columns[name].split()
                        for name in tables)):
                    raise ValueError('broker schema integrity failed; explicit recovery required')
            db.executescript('''
            BEGIN IMMEDIATE;
            CREATE TABLE IF NOT EXISTS broker_mode(singleton INTEGER PRIMARY KEY CHECK(singleton=1), schema_version INTEGER NOT NULL, maximum_time INTEGER NOT NULL);
            INSERT OR IGNORE INTO broker_mode VALUES(1,2,0);
            CREATE TABLE IF NOT EXISTS connections(subject TEXT, device TEXT, alias TEXT, epoch INTEGER NOT NULL,
              state TEXT NOT NULL, route_id TEXT NOT NULL, route_digest TEXT NOT NULL, updated INTEGER NOT NULL,
              PRIMARY KEY(subject,device,alias));
            CREATE TABLE IF NOT EXISTS control_receipts(subject TEXT,device TEXT,key TEXT,request_digest TEXT NOT NULL,response TEXT NOT NULL,
              PRIMARY KEY(subject,device,key));
            CREATE TRIGGER IF NOT EXISTS control_no_update BEFORE UPDATE ON control_receipts BEGIN SELECT RAISE(ABORT,'receipt immutable'); END;
            CREATE TRIGGER IF NOT EXISTS control_no_delete BEFORE DELETE ON control_receipts BEGIN SELECT RAISE(ABORT,'receipt immutable'); END;
            CREATE TABLE IF NOT EXISTS connect_attempts(subject TEXT,device TEXT,key TEXT,request_digest TEXT NOT NULL,generation TEXT NOT NULL,
              PRIMARY KEY(subject,device,key));
            CREATE TRIGGER IF NOT EXISTS connect_attempt_no_update BEFORE UPDATE ON connect_attempts BEGIN SELECT RAISE(ABORT,'attempt immutable'); END;
            CREATE TRIGGER IF NOT EXISTS connect_attempt_no_delete BEFORE DELETE ON connect_attempts BEGIN SELECT RAISE(ABORT,'attempt retained'); END;
            CREATE TABLE IF NOT EXISTS operations(subject TEXT,device TEXT,key TEXT,alias TEXT NOT NULL,epoch INTEGER NOT NULL,
              route_id TEXT NOT NULL,route_digest TEXT NOT NULL,tool TEXT NOT NULL,prepare_digest TEXT NOT NULL,
              plan TEXT NOT NULL,consent_digest TEXT NOT NULL,input_text TEXT,state TEXT NOT NULL,
              send_claimed INTEGER NOT NULL DEFAULT 0,submit_receipt TEXT,result TEXT,error TEXT,
              attempts INTEGER NOT NULL DEFAULT 0,next_attempt INTEGER NOT NULL DEFAULT 0,
              PRIMARY KEY(subject,device,key));
            CREATE TRIGGER IF NOT EXISTS operation_intent_immutable BEFORE UPDATE OF subject,device,key,alias,epoch,route_id,route_digest,tool,prepare_digest,plan,consent_digest ON operations
              BEGIN SELECT RAISE(ABORT,'intent immutable'); END;
            CREATE TRIGGER IF NOT EXISTS operation_receipt_immutable BEFORE UPDATE OF submit_receipt ON operations WHEN OLD.submit_receipt IS NOT NULL
              BEGIN SELECT RAISE(ABORT,'receipt immutable'); END;
            CREATE TRIGGER IF NOT EXISTS operation_no_delete BEFORE DELETE ON operations BEGIN SELECT RAISE(ABORT,'history retained'); END;
            ''')
            # Only the intact version1 set above reaches this additive upgrade.
            # Existing receipts, intents and the observed clock are retained.
            db.execute('UPDATE broker_mode SET schema_version=2 WHERE singleton=1 AND schema_version=1')
            db.execute("UPDATE operations SET state='unknown',input_text=NULL,error='restart after sending claim',next_attempt=0 WHERE state='sending'")
            db.commit()

    def _principal(self, auth):
        principal = self.adapter.authenticate(auth)
        if type(principal) is not Principal:
            raise AccessDenied('verified Principal required')
        return principal.validate()

    def _now(self, db):
        value = self.clock()
        if type(value) not in (int, float) or not math.isfinite(value) or not 0 <= value < 2**62:
            raise Unavailable('invalid clock')
        now = int(value)
        previous = db.execute('SELECT maximum_time FROM broker_mode WHERE singleton=1').fetchone()[0]
        if now < max(previous, self._maximum_observed):
            raise AccessDenied('clock moved backwards')
        self._maximum_observed = max(self._maximum_observed, now)
        db.execute('UPDATE broker_mode SET maximum_time=? WHERE singleton=1', (now,))
        return now

    def _route(self, route_id):
        if route_id not in self.routes:
            raise Unavailable('configured route unavailable')
        route = self.routes[route_id]
        return route, digest(route.descriptor())

    @staticmethod
    def _identity(principal):
        return principal.subject, principal.device_ref

    def _connection(self, db, p, alias):
        row = db.execute('SELECT * FROM connections WHERE subject=? AND device=? AND alias=?', (*self._identity(p), alias)).fetchone()
        if row is None:
            raise AccessDenied('connection not owned or unavailable')
        return row

    def _old_control(self, db, p, key, payload):
        identifier(key)
        attempt = db.execute('SELECT request_digest FROM connect_attempts WHERE subject=? AND device=? AND key=?',
                             (*self._identity(p), key)).fetchone()
        if attempt and attempt['request_digest'] != digest(payload):
            raise Conflict('control key is reserved for a different connection attempt')
        row = db.execute('SELECT * FROM control_receipts WHERE subject=? AND device=? AND key=?', (*self._identity(p), key)).fetchone()
        if row:
            if row['request_digest'] != digest(payload):
                raise Conflict('control key changed')
            result = decode(row['response'].encode())
            if result.get('event') == 'connect_cancelled':
                raise Conflict('connection attempt was cancelled; explicit new key required')
            return result
        if db.execute('SELECT COUNT(*) FROM control_receipts').fetchone()[0] >= self.max_control_receipts:
            raise Unavailable('control receipt capacity reached')

    def _remember_control(self, db, p, key, payload, result):
        db.execute('INSERT INTO control_receipts VALUES(?,?,?,?,?)', (*self._identity(p), key, digest(payload), canonical(result).decode()))
        return result

    @staticmethod
    def _invalidate_unsent(db, p, alias):
        db.execute("UPDATE operations SET state='cancelled',input_text=NULL,error='connection generation closed before sending' WHERE subject=? AND device=? AND alias=? AND send_claimed=0 AND state IN ('prepared','queued')", (*Broker._identity(p), alias))

    def connect(self, alias, route_id, *, key, auth):
        p = self._principal(auth)
        identifier(alias); identifier(route_id); identifier(key)
        route, route_digest = self._route(route_id)
        payload = {'operation': 'connect', 'alias': alias, 'route_id': route_id, 'route_digest': route_digest}
        # Exact replay does not perform discovery or reactivate an old epoch.
        cancelled = None
        with self.adapter.guard(p, 'connect'), self.mutex, self._transaction() as db:
            old = self._old_control(db, p, key, payload)
            if old is not None:
                return old
            before = db.execute('SELECT epoch,state FROM connections WHERE subject=? AND device=? AND alias=?',
                                (*self._identity(p), alias)).fetchone()
            current_generation = canonical(tuple(before) if before is not None else None).decode()
            attempt = db.execute('SELECT generation FROM connect_attempts WHERE subject=? AND device=? AND key=?',
                                 (*self._identity(p), key)).fetchone()
            if attempt is None:
                if db.execute('SELECT COUNT(*) FROM connect_attempts').fetchone()[0] >= self.max_control_receipts:
                    raise Unavailable('connection attempt capacity reached')
                self._now(db)
                db.execute('INSERT INTO connect_attempts VALUES(?,?,?,?,?)',
                           (*self._identity(p), key, digest(payload), current_generation))
                generation = current_generation
            else:
                generation = attempt['generation']
                if generation != current_generation:
                    cancelled = self._remember_control(db, p, key, payload, {'alias': alias,
                        'epoch': before['epoch'] if before else 0, 'event': 'connect_cancelled', 'historical_receipt': True})
        if cancelled is not None:
            raise Conflict('connection changed after reserved attempt; explicit new key required')
        route.discover()  # Bounded network outside policy and database locks.
        with self.adapter.guard(p, 'connect'), self.mutex, self._transaction() as db:
            old = self._old_control(db, p, key, payload)
            if old is not None:
                return old
            current = db.execute('SELECT epoch,state FROM connections WHERE subject=? AND device=? AND alias=?',
                                 (*self._identity(p), alias)).fetchone()
            if canonical(tuple(current) if current is not None else None).decode() != generation:
                # Commit before raising. Otherwise the old key could be retried
                # as a fresh connect after the later disconnect completed.
                result = self._remember_control(db, p, key, payload, {'alias': alias,
                    'epoch': current['epoch'] if current else 0, 'event': 'connect_cancelled', 'historical_receipt': True})
            else:
                if self._route(route_id)[1] != route_digest:
                    raise Conflict('route changed during discovery')
                if route_digest not in self._recovery_routes and len(self._recovery_routes) >= 64:
                    raise Unavailable('pinned recovery route capacity reached')
                self._recovery_routes[route_digest] = route
                now = self._now(db)
                old_connection = db.execute('SELECT * FROM connections WHERE subject=? AND device=? AND alias=?', (*self._identity(p), alias)).fetchone()
                count = db.execute('SELECT COUNT(*) FROM connections').fetchone()[0]
                if old_connection is None and count >= 128:
                    raise Unavailable('connection capacity reached')
                epoch = old_connection['epoch'] + 1 if old_connection else 1
                self._invalidate_unsent(db, p, alias)
                db.execute('INSERT INTO connections VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(subject,device,alias) DO UPDATE SET epoch=excluded.epoch,state=excluded.state,route_id=excluded.route_id,route_digest=excluded.route_digest,updated=excluded.updated',
                           (*self._identity(p), alias, epoch, 'connected', route_id, route_digest, now))
                result = self._remember_control(db, p, key, payload, {'alias': alias, 'epoch': epoch, 'event': 'connected', 'historical_receipt': True})
        if result['event'] == 'connect_cancelled':
            raise Conflict('connection changed during discovery; explicit new key required')
        return result

    def disconnect(self, alias, *, key, auth):
        p = self._principal(auth)
        identifier(alias)
        payload = {'operation': 'disconnect', 'alias': alias}
        with self.adapter.guard(p, 'disconnect'), self.mutex, self._transaction() as db:
            old = self._old_control(db, p, key, payload)
            if old is not None:
                return old
            connection = db.execute('SELECT * FROM connections WHERE subject=? AND device=? AND alias=?',
                                    (*self._identity(p), alias)).fetchone()
            now, epoch = self._now(db), connection['epoch'] + 1 if connection else 1
            if connection is None:
                if db.execute('SELECT COUNT(*) FROM connections').fetchone()[0] >= 128:
                    raise Unavailable('connection capacity reached')
                # A first connect may be in discovery with no row committed yet.
                # This closed tombstone invalidates its captured None generation.
                db.execute('INSERT INTO connections VALUES(?,?,?,?,?,?,?,?)',
                           (*self._identity(p), alias, epoch, 'closed', '', '', now))
            self._invalidate_unsent(db, p, alias)
            db.execute("UPDATE connections SET state='closed',epoch=?,updated=? WHERE subject=? AND device=? AND alias=?", (epoch, now, *self._identity(p), alias))
            result = {'alias': alias, 'epoch': epoch, 'event': 'disconnected', 'new_admissions_stopped': True,
                      'upstream_credential_revocation': 'NOT_IMPLEMENTED', 'sent_operations': 'reconciliation_only', 'historical_receipt': True}
            return self._remember_control(db, p, key, payload, result)

    def prepare(self, alias, tool, text, *, key, auth, data_scope='user_selected_text'):
        if not isinstance(text, str) or len(text.encode()) > MAX_INPUT:
            raise ValueError('selected text exceeds 64 KiB')
        return self._prepare(alias, tool, text, hashlib.sha256(text.encode()).hexdigest(), len(text.encode()),
                             key=key, auth=auth, data_scope=data_scope, deferred=False)

    def prepare_reference(self, alias, tool, input_sha256, input_bytes, *, key, auth, data_scope='user_selected_text'):
        """Preview with only a digest/length; selected text arrives with consent.

        Digests are metadata, not anonymization. The OS displays this transfer
        separately and sends the raw input only in the explicit submit request.
        """
        if (type(input_sha256) is not str or re.fullmatch(r'[0-9a-f]{64}', input_sha256) is None
                or type(input_bytes) is not int or not 0 <= input_bytes <= MAX_INPUT):
            raise ValueError('bounded input digest and byte length required')
        return self._prepare(alias, tool, None, input_sha256, input_bytes,
                             key=key, auth=auth, data_scope=data_scope, deferred=True)

    def _prepare(self, alias, tool, text, input_sha256, input_bytes, *, key, auth, data_scope, deferred):
        p = self._principal(auth)
        for value in (alias, tool, key, data_scope): identifier(value)
        selection = ({'input_sha256': input_sha256, 'input_bytes': input_bytes, 'deferred_input': True}
                     if deferred else {'text': text})
        request_digest = digest({'alias': alias, 'tool': tool, **selection, 'data_scope': data_scope})
        with self.adapter.guard(p, 'prepare'), self.mutex, self._transaction() as db:
            row = self._operation(db, p, key, required=False)
            if row:
                if row['prepare_digest'] != request_digest:
                    raise Conflict('business key has different input or scope')
                return self._preview(row)
            connection = self._connection(db, p, alias)
            if connection['state'] != 'connected':
                raise AccessDenied('current explicit connection required')
            route, fingerprint = self._route(connection['route_id'])
            if connection['state'] != 'connected' or fingerprint != connection['route_digest']:
                raise AccessDenied('current explicit connection required')
            policy = route.policy(tool)
            if data_scope != policy['data_scope'] or input_bytes > policy['max_input_bytes']:
                raise AccessDenied('input or data scope is not allowlisted')
            count, used = db.execute('SELECT COUNT(*),COALESCE(SUM(LENGTH(CAST(plan AS BLOB))+COALESCE(LENGTH(CAST(input_text AS BLOB)),0)+COALESCE(LENGTH(CAST(result AS BLOB)),0)),0) FROM operations').fetchone()
            if count >= self.max_operations or used + (count + 1) * MAX_BODY + input_bytes > self.max_bytes:
                raise Unavailable('operation storage capacity reached')
            now = self._now(db)
            plan = {'schema': 'rock-mcp-consent/1', 'subject': p.subject, 'device_ref': p.device_ref, 'key': key,
                    'alias': alias, 'epoch': connection['epoch'], 'route_id': connection['route_id'], 'route': route.descriptor(),
                    'tool': tool, 'contract': policy, 'input_sha256': input_sha256, 'input_bytes': input_bytes,
                    'data_scope': data_scope, 'price': policy['price'], 'issued_at': now, 'expires_at': now + 120,
                    'business_key': 'op-' + digest([p.subject, p.device_ref, alias, key])}
            if deferred:
                plan['input_transfer'] = 'explicit_submit_only'
            if len(canonical(plan)) > 32768:
                raise ValueError('consent plan exceeds limit')
            db.execute('INSERT INTO operations(subject,device,key,alias,epoch,route_id,route_digest,tool,prepare_digest,plan,consent_digest,input_text,state) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',
                       (*self._identity(p), key, alias, connection['epoch'], connection['route_id'], fingerprint, tool,
                        request_digest, canonical(plan).decode(), digest(plan), text, 'prepared'))
            return self._preview(self._operation(db, p, key))

    @staticmethod
    def _preview(row):
        return {'prepared': True, 'submitted': row['submit_receipt'] is not None, 'state': row['state'],
                'plan': decode(row['plan'].encode()), 'consent': {'approved': True, 'digest': row['consent_digest']},
                'meaning': 'preview is not consent or permission to send'}

    def _operation(self, db, p, key, required=True):
        identifier(key)
        row = db.execute('SELECT * FROM operations WHERE subject=? AND device=? AND key=?', (*self._identity(p), key)).fetchone()
        if row is None and required:
            raise AccessDenied('operation not owned or unavailable')
        return row

    def _admit(self, db, p, row):
        connection = self._connection(db, p, row['alias'])
        route, fingerprint = self._route(row['route_id'])
        if (connection['state'] != 'connected' or connection['epoch'] != row['epoch']
                or fingerprint != row['route_digest'] or connection['route_digest'] != fingerprint):
            raise AccessDenied('connection or Tool contract changed; fresh preparation required')
        plan = decode(row['plan'].encode())
        if route.policy(row['tool']) != plan['contract']:
            raise AccessDenied('Tool policy changed')
        if self._now(db) >= plan['expires_at']:
            raise AccessDenied('preparation expired')
        return route

    def submit(self, key, consent, *, auth, text=None):
        p = self._principal(auth)
        with self.adapter.guard(p, 'submit'), self.mutex, self._transaction() as db:
            row = self._operation(db, p, key)
            if consent != {'approved': True, 'digest': row['consent_digest']} or type(consent.get('approved')) is not bool:
                raise AccessDenied('explicit exact consent required')
            plan = decode(row['plan'].encode())
            deferred = plan.get('input_transfer') == 'explicit_submit_only'
            if deferred:
                if (type(text) is not str or len(text.encode()) != plan['input_bytes']
                        or hashlib.sha256(text.encode()).hexdigest() != plan['input_sha256']):
                    raise AccessDenied('submitted input must match the exact preview')
            elif text is not None:
                raise AccessDenied('legacy preparation does not accept replacement input')
            if row['submit_receipt'] is not None:
                return decode(row['submit_receipt'].encode())
            if row['state'] != 'prepared':
                raise AccessDenied('operation cannot be submitted')
            self._admit(db, p, row)
            receipt = {'key': key, 'consent_digest': row['consent_digest'], 'accepted_locally': True,
                       'remote_execution_confirmed': False, 'financial_transaction': False}
            db.execute("UPDATE operations SET state='queued',submit_receipt=?,input_text=? WHERE subject=? AND device=? AND key=?",
                       (canonical(receipt).decode(), text if deferred else row['input_text'], *self._identity(p), key))
        self._wake.set()
        return receipt

    def _status(self, row):
        return {'key': row['key'], 'alias': row['alias'], 'epoch': row['epoch'], 'state': row['state'],
                'send_claimed': bool(row['send_claimed']), 'recovery_only': bool(row['send_claimed']),
                'consent_digest': row['consent_digest'], 'attempts': row['attempts'], 'error': row['error'],
                'result': decode(row['result'].encode()) if row['result'] else None,
                'financial_transaction': False}

    def status(self, key, *, auth):
        p = self._principal(auth)
        with self.adapter.guard(p, 'recover'), self.mutex, closing(self._connect()) as db:
            return self._status(self._operation(db, p, key))

    def connection_status(self, alias, *, auth):
        p = self._principal(auth)
        identifier(alias)
        with self.adapter.guard(p, 'recover'), self.mutex, closing(self._connect()) as db:
            row = self._connection(db, p, alias)
            return {name: row[name] for name in ('alias', 'epoch', 'state', 'route_id', 'route_digest')}

    def history(self, *, auth, limit=50):
        p = self._principal(auth)
        if type(limit) is not int or not 1 <= limit <= 50:
            raise ValueError('bounded history limit required')
        with self.adapter.guard(p, 'recover'), self.mutex, closing(self._connect()) as db:
            rows = db.execute('SELECT * FROM operations WHERE subject=? AND device=? ORDER BY rowid DESC LIMIT ?', (*self._identity(p), limit)).fetchall()
            # No full output in list responses; detail requires status(key).
            return [{k: v for k, v in self._status(row).items() if k != 'result'} for row in rows]

    def reconcile(self, key, *, auth):
        p = self._principal(auth)
        with self.adapter.guard(p, 'recover'), self.mutex, self._transaction() as db:
            row = self._operation(db, p, key)
            if row['send_claimed'] and row['state'] not in TERMINAL:
                db.execute('UPDATE operations SET next_attempt=0 WHERE subject=? AND device=? AND key=?', (*self._identity(p), key))
        self._wake.set()
        return self.status(key, auth=auth)

    def process_one(self):
        with self.mutex, closing(self._connect()) as db:
            rows = db.execute("SELECT * FROM operations WHERE state IN ('queued','unknown') AND next_attempt<=? ORDER BY rowid", (int(self.clock()),)).fetchall()
            candidate = next((dict(r) for r in rows if (r['subject'], r['device'], r['key']) not in self._processing), None)
            if candidate is None:
                return False
            identity = candidate['subject'], candidate['device'], candidate['key']
            self._processing.add(identity)
        p = Principal(candidate['subject'], candidate['device']).validate()
        try:
            action = 'recover' if candidate['send_claimed'] else 'start'
            try:
                with self.adapter.guard(p, action), self.mutex, self._transaction() as db:
                    row = self._operation(db, p, candidate['key'])
                    if row['state'] in TERMINAL or row['state'] == 'prepared':
                        return True
                    plan = decode(row['plan'].encode())
                    sent = bool(row['send_claimed'])
                    if not sent:
                        route = self._admit(db, p, row)
                    else:
                        route = self._recovery_routes.get(row['route_digest'])
                        if route is None or digest(route.descriptor()) != row['route_digest']:
                            raise AccessDenied('original pinned route unavailable for recovery')
                        self._now(db)
                    text = row['input_text']
                    db.execute("UPDATE operations SET state='sending',send_claimed=1,input_text=NULL WHERE subject=? AND device=? AND key=?", identity)
                # Claim is durable before any effect call. Disconnect cannot undo it.
                result = (route.reconcile(row['tool'], business_key=plan['business_key'], consent_digest=row['consent_digest']) if sent else
                          route.execute(row['tool'], text, business_key=plan['business_key'], consent_digest=row['consent_digest']))
                if result['state'] in ('succeeded', 'failed'):
                    self._finish(identity, result)
                else:
                    self._unknown(identity, 'provider result not yet confirmed')
            except PermissionError:
                with self.mutex, self._transaction() as db:
                    current = db.execute('SELECT * FROM operations WHERE subject=? AND device=? AND key=?', identity).fetchone()
                    if current['state'] not in TERMINAL and not current['send_claimed']:
                        db.execute("UPDATE operations SET state='cancelled',input_text=NULL,error='current admission denied' WHERE subject=? AND device=? AND key=?", identity)
                    elif current['state'] not in TERMINAL:
                        self._unknown_in(db, identity, 'recovery authorization denied')
            except (OSError, ValueError, sqlite3.Error):
                # A commit can succeed even when the caller receives an I/O error.
                self._unknown(identity, 'transport or persistence outcome requires reconciliation')
            return True
        finally:
            with self.mutex:
                self._processing.discard(identity)

    def _finish(self, identity, result):
        with self.mutex, self._transaction() as db:
            row = db.execute('SELECT * FROM operations WHERE subject=? AND device=? AND key=?', identity).fetchone()
            if row['state'] in TERMINAL:
                return
            db.execute('UPDATE operations SET state=?,result=?,input_text=NULL,error=NULL WHERE subject=? AND device=? AND key=?',
                       (result['state'], canonical(result).decode(), *identity))

    def _unknown_in(self, db, identity, label):
        row = db.execute('SELECT * FROM operations WHERE subject=? AND device=? AND key=?', identity).fetchone()
        if row is None or row['state'] in TERMINAL:
            return
        attempts = min(row['attempts'] + 1, 32)
        next_attempt = int(self.clock()) + min(30, 2 ** min(attempts, 5))
        # Before a failed claim commit, no network was sent; retain queued input.
        state = 'unknown' if row['send_claimed'] else 'queued'
        db.execute('UPDATE operations SET state=?,attempts=?,next_attempt=?,error=? WHERE subject=? AND device=? AND key=?',
                   (state, attempts, next_attempt, label, *identity))

    def _unknown(self, identity, label):
        with self.mutex, self._transaction() as db:
            self._unknown_in(db, identity, label)

    def start(self):
        with self.mutex:
            if self._closed:
                raise Unavailable('broker is closed')
            if self._worker is not None and self._worker.is_alive():
                return
            with self._transaction() as db:
                for row in db.execute("SELECT subject,device,key FROM operations WHERE state='sending'").fetchall():
                    identity = tuple(row)
                    if identity not in self._processing:
                        db.execute("UPDATE operations SET state='unknown',input_text=NULL,next_attempt=0,error='worker stopped after sending claim' WHERE subject=? AND device=? AND key=?", identity)
            self._stop.clear()
            self._worker = threading.Thread(target=self._loop, name='rock-mcp-broker', daemon=True)
            try:
                self._worker.start()
            except BaseException:
                # An unstarted Thread cannot be joined during constructor cleanup.
                # Keep any thread that really started so close must still join it.
                if self._worker.ident is None:
                    self._worker = None
                self._stop.set(); self._wake.set()
                raise

    def _loop(self):
        while not self._stop.is_set():
            try:
                worked = self.process_one()
                self.last_error = None
            except Exception as exc:
                self.last_error = type(exc).__name__
                worked = False
            if not worked:
                self._wake.wait(0.25)
                self._wake.clear()

    def close(self):
        self._stop.set(); self._wake.set()
        worker = self._worker
        if worker is not None and worker is not threading.current_thread():
            worker.join(12)
            if worker.is_alive():
                raise Unavailable('owned worker has not stopped; database lock retained')
        with self.mutex:
            if self._processing:
                raise Unavailable('owned request still running; database lock retained')
            if not self._closed:
                self._closed = True
                os.close(self._lock_fd)
                self._lock_fd = None

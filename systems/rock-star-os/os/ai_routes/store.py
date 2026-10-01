"""Private, singleton authority for shared-owner compute budget reservations.

Lock order: trusted identity/capability guard -> store mutex -> SQLite. No model,
network or Wallet operation runs here. claim() is a durable send-once permission:
only the call that commits the first claim returns send_permitted=True. A lost
reply, restart, elapsed deadline or disconnect cannot grant another send.
"""
from contextlib import closing, contextmanager
import fcntl
import json
import os
from pathlib import Path
import sqlite3
import stat
import threading
import time

from .policy import (Conflict, Denied, Unavailable, authority, canonical, digest,
                     fields, ident, input_identity, integer, make_plan, route)

TERMINAL = ('SUCCEEDED', 'FAILED', 'CANCELED')


class DenyIdentity:
    def descriptor(self): return {'kind': 'unconfigured'}
    @contextmanager
    def guard(self, auth, action):
        raise Denied('identity and device eligibility adapter unavailable')
        yield


class DenyProvider:
    def descriptor(self): return {'kind': 'unconfigured'}
    def verify(self, envelope): raise Denied('authoritative provider status adapter unavailable')


class ComputeBudgetStore:
    def __init__(self, directory, *, authority_id, limits, routes, identity=None,
                 provider=None, clock=None, max_records=2048):
        authority(authority_id)
        if type(limits) is not dict or not 1 <= len(limits) <= 64: raise ValueError('bounded owner limits required')
        for owner, limit in limits.items(): ident(owner); integer(limit)
        if type(routes) is not list or not 1 <= len(routes) <= 64: raise ValueError('bounded explicit route catalog required')
        checked = [route(item) for item in routes]
        self.routes = {item['route_id']: item for item in checked}
        if len(self.routes) != len(checked): raise ValueError('duplicate route ID')
        integer(max_records, 1, 10000)
        self.authority_id, self.limits, self.max_records = authority_id, dict(limits), max_records
        self.identity, self.provider = identity or DenyIdentity(), provider or DenyProvider()
        self.clock = clock or (lambda: int(time.time()))
        self.mutex, self.closed, self.lock_fd = threading.RLock(), False, None
        self.directory = Path(directory); self.directory.mkdir(parents=True, mode=0o700, exist_ok=True)
        st = self.directory.lstat()
        if not stat.S_ISDIR(st.st_mode) or st.st_uid != os.geteuid() or st.st_mode & 0o077:
            raise ValueError('owned private non-symlink directory required')
        self.path, self.lock_path = self.directory/'budget.sqlite3', self.directory/'budget.lock'
        for name in ('budget.sqlite3', 'budget.sqlite3-wal', 'budget.sqlite3-shm', 'budget.sqlite3-journal', 'budget.lock'):
            self._check(self.directory/name)
        fresh = not self.path.exists()
        if fresh and any(self.directory.iterdir()): raise ValueError('existing budget state lost database; explicit recovery required')
        self.binding = digest({'schema_version': 1, 'authority_id': authority_id, 'limits': limits,
                               'identity': self.identity.descriptor(), 'provider': self.provider.descriptor()})
        self.lock_fd = os.open(self.lock_path, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
        try:
            fcntl.flock(self.lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            if fresh:
                fd = os.open(self.path, os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW, 0o600); os.close(fd)
            self._initialize(fresh)
            directory_fd = os.open(self.directory, os.O_RDONLY | os.O_DIRECTORY)
            try: os.fsync(directory_fd)
            finally: os.close(directory_fd)
        except BaseException:
            os.close(self.lock_fd); self.lock_fd = None
            raise

    @staticmethod
    def _check(path):
        try: st = path.lstat()
        except FileNotFoundError: return
        if not stat.S_ISREG(st.st_mode) or st.st_nlink != 1 or st.st_uid != os.geteuid() or st.st_mode & 0o077:
            raise ValueError('owned private single-link regular state required')

    def _connect(self):
        if self.closed: raise Unavailable('compute budget closed')
        self._check(self.path)
        if not self.path.exists(): raise Unavailable('budget database missing; no fresh authority fallback')
        db = sqlite3.connect(self.path, timeout=2, isolation_level=None); db.row_factory = sqlite3.Row
        db.execute('PRAGMA foreign_keys=ON'); db.execute('PRAGMA synchronous=FULL')
        return db

    def _initialize(self, fresh):
        with closing(self._connect()) as db:
            if fresh:
                db.executescript('''
                BEGIN IMMEDIATE;
                CREATE TABLE mode(id INTEGER PRIMARY KEY CHECK(id=1),binding TEXT NOT NULL,highwater INTEGER NOT NULL);
                CREATE TABLE owners(owner TEXT PRIMARY KEY,ceiling INTEGER NOT NULL,paused INTEGER NOT NULL);
                CREATE TABLE jobs(owner TEXT NOT NULL REFERENCES owners(owner),key TEXT NOT NULL,device TEXT NOT NULL,
                  request_hash TEXT NOT NULL,plan TEXT NOT NULL,plan_hash TEXT NOT NULL,state TEXT NOT NULL,
                  amount INTEGER NOT NULL,cost INTEGER NOT NULL DEFAULT 0,claimed INTEGER NOT NULL DEFAULT 0,
                  cancel_requested INTEGER NOT NULL DEFAULT 0,overrun_microusd INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(owner,key));
                CREATE TABLE receipts(owner TEXT NOT NULL,op TEXT NOT NULL,key TEXT NOT NULL,payload_hash TEXT NOT NULL,
                  receipt TEXT NOT NULL,PRIMARY KEY(owner,op,key));
                CREATE TABLE events(id TEXT PRIMARY KEY,payload_hash TEXT NOT NULL,receipt TEXT NOT NULL);
                ''')
                db.execute('INSERT INTO mode VALUES(1,?,0)', (self.binding,))
                db.executemany('INSERT INTO owners VALUES(?,?,0)', self.limits.items())
                for table in ('receipts', 'events'):
                    for op in ('UPDATE', 'DELETE'):
                        db.execute(f"CREATE TRIGGER {table}_{op} BEFORE {op} ON {table} BEGIN SELECT RAISE(ABORT,'immutable receipt'); END")
                db.execute("CREATE TRIGGER immutable_plan BEFORE UPDATE OF owner,key,device,request_hash,plan,plan_hash,amount ON jobs BEGIN SELECT RAISE(ABORT,'immutable plan'); END")
                db.execute("CREATE TRIGGER retained_jobs BEFORE DELETE ON jobs BEGIN SELECT RAISE(ABORT,'retained budget history'); END")
                db.execute("CREATE TRIGGER retained_mode BEFORE DELETE ON mode BEGIN SELECT RAISE(ABORT,'retained mode'); END")
                db.execute("CREATE TRIGGER bound_mode BEFORE UPDATE OF id,binding ON mode BEGIN SELECT RAISE(ABORT,'bound mode'); END")
                db.execute("CREATE TRIGGER owner_ceiling BEFORE UPDATE OF owner,ceiling ON owners BEGIN SELECT RAISE(ABORT,'immutable compute envelope'); END")
                db.commit()
            else:
                tables = {row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
                if tables != {'mode', 'owners', 'jobs', 'receipts', 'events'}: raise ValueError('incomplete budget authority')
                rows = db.execute('SELECT id,binding FROM mode').fetchall()
                if len(rows) != 1 or tuple(rows[0]) != (1, self.binding) or dict(db.execute('SELECT owner,ceiling FROM owners')) != self.limits:
                    raise ValueError('budget authority binding changed or missing')
            db.execute("UPDATE jobs SET state='UNKNOWN' WHERE state='CLAIMED'")
            self._verify(db)

    @contextmanager
    def _transaction(self):
        with closing(self._connect()) as db:
            db.execute('BEGIN IMMEDIATE')
            try:
                now = integer(self.clock(), 1, 2**53 - 1)
                rows = db.execute('SELECT * FROM mode').fetchall()
                if len(rows) != 1 or rows[0]['binding'] != self.binding: raise Unavailable('authority marker unavailable')
                if now < rows[0]['highwater']: raise Denied('clock moved backwards')
                db.execute('UPDATE mode SET highwater=?', (now,))
                db.execute('SAVEPOINT business')
                try:
                    yield db, now
                    self._verify(db)
                except BaseException:
                    db.execute('ROLLBACK TO business'); db.execute('RELEASE business'); db.commit()
                    raise
                db.execute('RELEASE business'); db.commit()
            except BaseException:
                db.rollback(); raise

    @staticmethod
    def _balance(db, owner):
        row = db.execute('SELECT ceiling,paused FROM owners WHERE owner=?', (owner,)).fetchone()
        held = db.execute("SELECT COALESCE(SUM(amount),0) FROM jobs WHERE owner=? AND state IN ('RESERVED','CLAIMED','UNKNOWN')", (owner,)).fetchone()[0]
        spent = db.execute('SELECT COALESCE(SUM(cost),0) FROM jobs WHERE owner=?', (owner,)).fetchone()[0]
        return {'limit_microusd': row['ceiling'], 'reserved_microusd': held, 'spent_microusd': spent,
                'available_microusd': row['ceiling'] - held - spent, 'paused': bool(row['paused']),
                'currency': 'USD', 'unit': 'micro-USD', 'simulation_only': True}

    def _verify(self, db):
        for owner in self.limits:
            if self._balance(db, owner)['available_microusd'] < 0: raise ValueError('compute budget over-reserved')
        for row in db.execute('SELECT * FROM jobs'):
            plan = json.loads(row['plan'])
            if digest(plan) != row['plan_hash'] or row['amount'] != plan['reserved_microusd'] or not 0 <= row['cost'] <= row['amount']:
                raise ValueError('compute plan or cost inconsistent')
            if row['state'] not in ('PREPARED', 'RESERVED', 'CLAIMED', 'UNKNOWN', *TERMINAL): raise ValueError('invalid compute state')
            if row['cost'] and row['state'] not in TERMINAL: raise ValueError('unfinalized compute cost')
            if row['state'] in ('CLAIMED', 'UNKNOWN') and row['claimed'] != 1: raise ValueError('missing durable claim')
            if row['overrun_microusd'] and (row['overrun_microusd'] <= row['amount'] or row['state'] != 'UNKNOWN'):
                raise ValueError('overrun investigation hold inconsistent')

    @contextmanager
    def _guard(self, auth, action):
        with self.identity.guard(auth, action) as context:
            fields(context, ('authority_id', 'owner_ref', 'device_ref', 'capabilities'))
            if context['authority_id'] != self.authority_id or context['owner_ref'] not in self.limits:
                raise Denied('compute authority/owner mismatch')
            ident(context['device_ref'])
            with self.mutex:
                yield context

    def _capacity(self, db, table, multiple=1):
        if db.execute('SELECT COUNT(*) FROM ' + table).fetchone()[0] >= self.max_records * multiple:
            raise Unavailable('retained compute history capacity reached')

    @staticmethod
    def _row(db, owner, key):
        ident(key)
        row = db.execute('SELECT * FROM jobs WHERE owner=? AND key=?', (owner, key)).fetchone()
        if row is None: raise Denied('compute request not found for authenticated owner')
        return row

    def _cached(self, db, owner, op, key, payload):
        ident(key)
        row = db.execute('SELECT * FROM receipts WHERE owner=? AND op=? AND key=?', (owner, op, key)).fetchone()
        if row:
            if row['payload_hash'] != digest(payload): raise Conflict('same business key payload changed')
            return json.loads(row['receipt'])
        self._capacity(db, 'receipts', 6)

    @staticmethod
    def _remember(db, owner, op, key, payload, receipt):
        db.execute('INSERT INTO receipts VALUES(?,?,?,?,?)', (owner, op, key, digest(payload), canonical(receipt).decode()))
        return receipt

    @staticmethod
    def _receipt(row, state):
        return {'key': row['key'], 'plan_sha256': row['plan_hash'], 'state_at_receipt': state,
                'reserved_microusd': row['amount'], 'historical_receipt': True, 'simulation_only': True}

    def prepare(self, *, auth, key, route_id, selected_text, allow_external, max_cost_microusd):
        ident(key); ident(route_id)
        selected = input_identity(selected_text)
        payload = {'route_id': route_id, 'input': selected, 'allow_external': allow_external, 'max_cost_microusd': max_cost_microusd}
        # Type validation also applies to an old-key replay.
        if type(allow_external) is not bool: raise ValueError('explicit external consent required')
        integer(max_cost_microusd)
        with self._guard(auth, 'prepare') as principal, self._transaction() as (db, now):
            owner = principal['owner_ref']
            old = db.execute('SELECT * FROM jobs WHERE owner=? AND key=?', (owner, key)).fetchone()
            if old:
                if old['request_hash'] != digest(payload): raise Conflict('same compute key changed')
                return json.loads(old['plan'])
            self._capacity(db, 'jobs')
            if route_id not in self.routes: raise Denied('selected route unavailable')
            plan = make_plan(authority_id=self.authority_id, owner_ref=owner, device_ref=principal['device_ref'], key=key,
                selected_text=selected_text, selected_route=self.routes[route_id], capability_evidence=principal['capabilities'],
                allow_external=allow_external, max_cost_microusd=max_cost_microusd, now=now)
            db.execute("INSERT INTO jobs(owner,key,device,request_hash,plan,plan_hash,state,amount) VALUES(?,?,?,?,?,?,'PREPARED',?)",
                       (owner, key, principal['device_ref'], digest(payload), canonical(plan).decode(), digest(plan), plan['reserved_microusd']))
            return plan

    def _current(self, db, row, principal, now):
        plan = json.loads(row['plan']); model = self.routes.get(plan['route']['route_id'])
        if row['device'] != principal['device_ref']: raise Denied('new execution belongs to original selected device')
        if now >= plan['expires_at']: raise Denied('plan expired; explicit new plan required')
        if model is None or digest(model) != plan['route_sha256']: raise Denied('provider/model/price policy changed; reconfirm required')
        if digest(principal['capabilities']) != plan['capability_sha256']: raise Denied('device capabilities changed; reconfirm required')
        if self._balance(db, row['owner'])['paused']: raise Denied('compute admissions paused')
        return plan

    def reserve(self, *, auth, key, consent):
        fields(consent, ('approved', 'plan_sha256'))
        if consent['approved'] is not True: raise Denied('exact plan approval required')
        with self._guard(auth, 'reserve') as principal, self._transaction() as (db, now):
            owner = principal['owner_ref']; row = self._row(db, owner, key)
            if consent['plan_sha256'] != row['plan_hash']: raise Denied('approval refers to a different plan')
            cached = self._cached(db, owner, 'reserve', key, consent)
            if cached is not None: return cached
            self._current(db, row, principal, now)
            if row['state'] != 'PREPARED': raise Conflict('plan is not reservable')
            if row['amount'] > self._balance(db, owner)['available_microusd']: raise Denied('shared owner compute budget exhausted')
            db.execute("UPDATE jobs SET state='RESERVED' WHERE owner=? AND key=?", (owner, key))
            return self._remember(db, owner, 'reserve', key, consent, self._receipt(row, 'RESERVED'))

    def claim(self, *, auth, key, selected_text):
        selected = input_identity(selected_text)
        with self._guard(auth, 'claim') as principal, self._transaction() as (db, now):
            owner = principal['owner_ref']; row = self._row(db, owner, key); plan = json.loads(row['plan'])
            if selected != plan['input']: raise Denied('selected input differs from approved input')
            cached = self._cached(db, owner, 'claim', key, selected)
            if cached is not None: return {'receipt': cached, 'send_permitted': False, 'requires_status': row['state'] not in TERMINAL}
            self._current(db, row, principal, now)
            if row['state'] != 'RESERVED': raise Conflict('compute not reserved for first claim')
            db.execute("UPDATE jobs SET state='CLAIMED',claimed=1 WHERE owner=? AND key=?", (owner, key))
            receipt = self._remember(db, owner, 'claim', key, selected, self._receipt(row, 'CLAIMED'))
            return {'receipt': receipt, 'send_permitted': True, 'requires_status': True}

    def cancel(self, *, auth, key, cancel_key):
        payload = {'key': key}
        with self._guard(auth, 'recover') as principal, self._transaction() as (db, _):
            owner = principal['owner_ref']; row = self._row(db, owner, key)
            old = self._cached(db, owner, 'cancel', cancel_key, payload)
            if old is not None: return old
            if row['state'] not in TERMINAL:
                state = 'UNKNOWN' if row['claimed'] else 'CANCELED'
                db.execute('UPDATE jobs SET state=?,cancel_requested=1 WHERE owner=? AND key=?', (state, owner, key))
            row = self._row(db, owner, key)
            receipt = {**self._receipt(row, row['state']), 'provider_cancel_sent': False,
                       'funds_released': row['state'] == 'CANCELED' and not row['claimed']}
            return self._remember(db, owner, 'cancel', cancel_key, payload, receipt)

    def set_paused(self, *, auth, key, paused):
        if type(paused) is not bool: raise ValueError('explicit pause state required')
        with self._guard(auth, 'recover') as principal, self._transaction() as (db, _):
            owner = principal['owner_ref']; payload = {'paused': paused}
            old = self._cached(db, owner, 'pause', key, payload)
            if old is not None: return old
            if not paused and db.execute('SELECT 1 FROM jobs WHERE owner=? AND overrun_microusd>0', (owner,)).fetchone():
                raise Denied('provider cost inconsistency requires explicit accounting recovery')
            db.execute('UPDATE owners SET paused=? WHERE owner=?', (int(paused), owner))
            receipt = {'paused_at_receipt': paused, 'historical_receipt': True, 'inflight_terminated': False, 'simulation_only': True}
            return self._remember(db, owner, 'pause', key, payload, receipt)

    def status(self, *, auth, key=None):
        with self._guard(auth, 'recover') as principal, self._transaction() as (db, _):
            owner = principal['owner_ref']; result = {'budget': self._balance(db, owner)}
            if key is not None:
                row = self._row(db, owner, key)
                result['request'] = {'key': key, 'plan_sha256': row['plan_hash'], 'state': row['state'],
                    'cost_microusd': row['cost'], 'cancel_requested': bool(row['cancel_requested']),
                    'observed_overrun_microusd': row['overrun_microusd'],
                    'requires_status': bool(row['claimed']) and row['state'] not in TERMINAL}
            return result

    def reconcile(self, envelope):
        """Only authenticated provider accounting can finalize a claimed hold."""
        event = self.provider.verify(envelope)
        fields(event, ('event_id', 'authority_id', 'owner_ref', 'device_ref', 'key', 'plan_sha256',
                       'provider_id', 'model_id', 'model_revision', 'price_version', 'state', 'cost_microusd', 'accounting_final'))
        for name in ('event_id', 'owner_ref', 'device_ref', 'key', 'provider_id', 'model_id', 'model_revision', 'price_version'): ident(event[name])
        integer(event['cost_microusd'])
        if event['state'] not in (*TERMINAL, 'UNKNOWN'): raise ValueError('unsupported provider accounting state')
        if type(event['accounting_final']) is not bool: raise ValueError('explicit final accounting required')
        if event['authority_id'] != self.authority_id: raise Denied('provider authority mismatch')
        with self.mutex, self._transaction() as (db, _):
            row = self._row(db, event['owner_ref'], event['key']); plan = json.loads(row['plan'])
            if (event['device_ref'] != row['device'] or event['plan_sha256'] != row['plan_hash'] or
                    any(event[name] != plan['route'][name] for name in ('provider_id', 'model_id', 'model_revision', 'price_version'))):
                raise Denied('provider accounting does not match exact execution')
            old = db.execute('SELECT * FROM events WHERE id=?', (event['event_id'],)).fetchone()
            if old:
                if old['payload_hash'] != digest(event): raise Conflict('provider event ID reused')
                return json.loads(old['receipt'])
            self._capacity(db, 'events', 4)
            if not row['claimed']: raise Conflict('provider status without a durable claim')
            state, cost = event['state'], event['cost_microusd']
            if state in TERMINAL and not event['accounting_final']: raise Denied('terminal accounting not final; hold retained')
            if state == 'UNKNOWN' and (event['accounting_final'] or cost != 0): raise ValueError('unknown accounting cannot release or charge')
            if row['overrun_microusd']: raise Denied('prior provider overrun requires explicit accounting recovery')
            if cost > row['amount']:
                # This is an observed inconsistency, never a clamped debit or an
                # assertion that the external bill was bounded by our reservation.
                if row['state'] in TERMINAL: raise Conflict('terminal provider accounting changed')
                db.execute("UPDATE jobs SET state='UNKNOWN',overrun_microusd=? WHERE owner=? AND key=?", (cost, event['owner_ref'], event['key']))
                db.execute('UPDATE owners SET paused=1 WHERE owner=?', (event['owner_ref'],))
                result = {'event_id': event['event_id'], 'state_at_receipt': 'INCONSISTENT',
                          'observed_cost_microusd': cost, 'reserved_microusd': row['amount'],
                          'plan_sha256': row['plan_hash'], 'hold_retained': True, 'admissions_paused': True,
                          'historical_receipt': True, 'simulation_only': True}
                db.execute('INSERT INTO events VALUES(?,?,?)', (event['event_id'], digest(event), canonical(result).decode()))
                return result
            if row['state'] in TERMINAL:
                if (state, cost) != (row['state'], row['cost']): raise Conflict('terminal provider accounting changed')
            else: db.execute('UPDATE jobs SET state=?,cost=? WHERE owner=? AND key=?', (state, cost, event['owner_ref'], event['key']))
            result = {'event_id': event['event_id'], 'state_at_receipt': state, 'cost_microusd': cost,
                      'plan_sha256': row['plan_hash'], 'historical_receipt': True, 'simulation_only': True}
            db.execute('INSERT INTO events VALUES(?,?,?)', (event['event_id'], digest(event), canonical(result).decode()))
            return result

    def close(self):
        with self.mutex:
            if self.closed: return
            self.closed = True
            if self.lock_fd is not None: os.close(self.lock_fd); self.lock_fd = None

"""Single-authority developer ledger, separate from the personal OS Wallet.

Same accounting pattern as blackberryrock.wallet: BEGIN IMMEDIATE, balanced
append-only postings, nonnegative spendable/held balances and immutable receipts.
No direct database writers, copied live authorities or live payment adapter.
Lock order: eligibility adapter -> this store mutex -> SQLite; network outside.
"""
from contextlib import closing, contextmanager
import fcntl
import os
from pathlib import Path
import sqlite3
import stat
import threading

from .protocol import (PROVIDER, Denied, Conflict, Unavailable, amount, canonical,
                       decode, digest, event_payload, fields, identifier)

ACCOUNTS = ('PENDING', 'AVAILABLE', 'PAYOUT_HOLD', 'PAID', 'SALE_CLEARING')
TERMINAL = ('PAID', 'FAILED', 'CANCELED')


class DenyIdentity:
    def authenticate(self, auth): raise Denied('developer identity adapter unavailable')
    @contextmanager
    def guard(self, developer, action):
        raise Denied('developer eligibility adapter unavailable')
        yield


class DenyProvider:
    def descriptor(self): return {'provider_id': 'unconfigured', 'simulation_only': True}
    def verify(self, envelope): raise Denied('provider adapter unavailable')
    def request(self, action, intent): raise Unavailable('provider adapter unavailable')


class SettlementStore:
    def __init__(self, directory, *, authority_id, bindings, identity=None, provider=None, max_records=4096):
        identifier(authority_id)
        if type(bindings) is not dict or not 1 <= len(bindings) <= 64:
            raise ValueError('one to 64 configured developers required')
        for developer, account in bindings.items(): identifier(developer); identifier(account)
        if len(set(bindings.values())) != len(bindings): raise ValueError('provider account belongs to one developer')
        if type(max_records) is not int or not 1 <= max_records <= 50000: raise ValueError('invalid capacity')
        self.authority_id, self.bindings, self.max_records = authority_id, dict(bindings), max_records
        self.identity, self.provider = identity or DenyIdentity(), provider or DenyProvider()
        self.mutex, self.processing, self.closed = threading.RLock(), set(), False
        self.cursor = 0
        self.directory = Path(directory); self.directory.mkdir(mode=0o700, parents=True, exist_ok=True)
        st = self.directory.lstat()
        if not stat.S_ISDIR(st.st_mode) or st.st_uid != os.geteuid() or st.st_mode & 0o077:
            raise ValueError('private owned non-symlink directory required')
        self.path = self.directory/'settlement.sqlite3'; self.lock_path = self.directory/'settlement.lock'
        for suffix in ('', '-journal', '-wal', '-shm'): self._check(self.directory/('settlement.sqlite3'+suffix))
        self._check(self.lock_path)
        if not self.path.exists() and any(self.directory.iterdir()):
            raise ValueError('existing authority lost its ledger; explicit recovery required')
        self.lock_fd = os.open(self.lock_path, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
        try:
            fcntl.flock(self.lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            fresh = not self.path.exists()
            if fresh:
                fd = os.open(self.path, os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW, 0o600); os.close(fd)
            binding = {'schema_version': 1, 'authority_id': authority_id, 'developers': self.bindings,
                       'provider': self.provider.descriptor(), 'simulation_only': True}
            self.binding_digest = digest(binding)
            self._initialize(fresh)
        except BaseException:
            os.close(self.lock_fd); self.lock_fd = None
            raise

    @staticmethod
    def _check(path):
        try: st = path.lstat()
        except FileNotFoundError: return
        if not stat.S_ISREG(st.st_mode) or st.st_nlink != 1 or st.st_uid != os.geteuid() or st.st_mode & 0o077:
            raise ValueError('private owned single-link regular file required')

    def _connect(self):
        if self.closed: raise Unavailable('settlement store closed')
        self._check(self.path)
        db = sqlite3.connect(self.path, timeout=2, isolation_level=None); db.row_factory = sqlite3.Row
        db.execute('PRAGMA foreign_keys=ON'); db.execute('PRAGMA synchronous=FULL')
        return db

    def _initialize(self, fresh):
        with closing(self._connect()) as db:
            if not fresh:
                tables = {r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
                if tables != {'mode', 'developers', 'events', 'sales', 'payouts', 'receipts', 'journals', 'postings'}:
                    raise ValueError('incomplete settlement database; explicit recovery required')
                rows = db.execute('SELECT * FROM mode').fetchall()
                if len(rows) != 1 or tuple(rows[0]) != (1, self.binding_digest):
                    raise ValueError('authority, developer or provider binding changed')
                if dict(db.execute('SELECT id,account FROM developers')) != self.bindings:
                    raise ValueError('retained developer bindings incomplete')
            else:
                db.executescript('''
                BEGIN IMMEDIATE;
                CREATE TABLE mode(singleton INTEGER PRIMARY KEY CHECK(singleton=1),binding_digest TEXT NOT NULL);
                CREATE TABLE developers(id TEXT PRIMARY KEY,account TEXT NOT NULL UNIQUE,connected INTEGER NOT NULL);
                CREATE TABLE events(id TEXT PRIMARY KEY,digest TEXT NOT NULL,receipt TEXT NOT NULL);
                CREATE TABLE sales(id TEXT PRIMARY KEY,developer TEXT NOT NULL REFERENCES developers(id),gross INTEGER NOT NULL,fee INTEGER NOT NULL,net INTEGER NOT NULL,state TEXT NOT NULL);
                CREATE TABLE payouts(developer TEXT NOT NULL REFERENCES developers(id),key TEXT NOT NULL,business_key TEXT NOT NULL UNIQUE,
                  amount INTEGER NOT NULL,state TEXT NOT NULL,claimed INTEGER NOT NULL DEFAULT 0,intent TEXT NOT NULL,error TEXT,
                  PRIMARY KEY(developer,key));
                CREATE TABLE receipts(developer TEXT NOT NULL,key TEXT NOT NULL,digest TEXT NOT NULL,receipt TEXT NOT NULL,PRIMARY KEY(developer,key));
                CREATE TABLE journals(id INTEGER PRIMARY KEY,developer TEXT NOT NULL REFERENCES developers(id),kind TEXT NOT NULL,reference TEXT NOT NULL);
                CREATE TABLE postings(id INTEGER PRIMARY KEY,journal INTEGER NOT NULL REFERENCES journals(id),account TEXT NOT NULL CHECK(account IN ('PENDING','AVAILABLE','PAYOUT_HOLD','PAID','SALE_CLEARING')),delta INTEGER NOT NULL CHECK(typeof(delta)='integer' AND delta!=0));
                ''')
                db.execute('INSERT INTO mode VALUES(1,?)', (self.binding_digest,))
                db.executemany('INSERT INTO developers VALUES(?,?,1)', self.bindings.items())
                for table in ('mode', 'events', 'receipts', 'journals', 'postings'):
                    for operation in ('UPDATE', 'DELETE'):
                        db.execute(f"CREATE TRIGGER {table}_no_{operation.lower()} BEFORE {operation} ON {table} BEGIN SELECT RAISE(ABORT,'immutable record'); END")
                db.execute("CREATE TRIGGER payout_intent_immutable BEFORE UPDATE OF developer,key,business_key,amount,intent ON payouts BEGIN SELECT RAISE(ABORT,'immutable payout intent'); END")
                db.execute("CREATE TRIGGER payout_no_delete BEFORE DELETE ON payouts BEGIN SELECT RAISE(ABORT,'payout history retained'); END")
                db.execute("CREATE TRIGGER sale_identity_immutable BEFORE UPDATE OF id,developer,gross,fee,net ON sales BEGIN SELECT RAISE(ABORT,'authoritative sale immutable'); END")
                db.execute("CREATE TRIGGER sale_no_delete BEFORE DELETE ON sales BEGIN SELECT RAISE(ABORT,'sale history retained'); END")
                db.execute("CREATE TRIGGER developer_binding_immutable BEFORE UPDATE OF id,account ON developers BEGIN SELECT RAISE(ABORT,'developer binding immutable'); END")
            db.execute("UPDATE payouts SET state='UNKNOWN',error='restart after durable claim' WHERE state='SENDING'")
            self._verify(db)
            if fresh: db.commit()

    @contextmanager
    def _transaction(self):
        with closing(self._connect()) as db:
            try:
                db.execute('BEGIN IMMEDIATE')
                yield db
                self._verify(db); db.commit()
            except BaseException:
                db.rollback(); raise

    @staticmethod
    def _balances(db, developer):
        result = dict.fromkeys(ACCOUNTS, 0)
        for row in db.execute('SELECT p.account,SUM(p.delta) FROM postings p JOIN journals j ON j.id=p.journal WHERE j.developer=? GROUP BY p.account', (developer,)):
            result[row[0]] = row[1]
        return result

    @classmethod
    def _verify(cls, db):
        bad = db.execute('SELECT j.id FROM journals j LEFT JOIN postings p ON p.journal=j.id GROUP BY j.id HAVING SUM(p.delta)!=0 OR COUNT(p.id)!=2 LIMIT 1').fetchone()
        if bad: raise ValueError('unbalanced developer journal')
        for (developer,) in db.execute('SELECT id FROM developers'):
            balances = cls._balances(db, developer)
            if any(balances[a] < 0 for a in ACCOUNTS if a != 'SALE_CLEARING'): raise ValueError('negative developer balance')
            pending = db.execute("SELECT COALESCE(SUM(net),0) FROM sales WHERE developer=? AND state='PENDING'", (developer,)).fetchone()[0]
            hold = db.execute("SELECT COALESCE(SUM(amount),0) FROM payouts WHERE developer=? AND state NOT IN ('PAID','FAILED','CANCELED')", (developer,)).fetchone()[0]
            paid = db.execute("SELECT COALESCE(SUM(amount),0) FROM payouts WHERE developer=? AND state='PAID'", (developer,)).fetchone()[0]
            if (pending, hold, paid) != (balances['PENDING'], balances['PAYOUT_HOLD'], balances['PAID']):
                raise ValueError('developer records and postings disagree')

    @staticmethod
    def _post(db, developer, kind, reference, debit, credit, value):
        amount(value)
        cursor = db.execute('INSERT INTO journals(developer,kind,reference) VALUES(?,?,?)', (developer, kind, reference))
        db.executemany('INSERT INTO postings(journal,account,delta) VALUES(?,?,?)',
                       ((cursor.lastrowid, debit, -value), (cursor.lastrowid, credit, value)))

    def _developer(self, auth):
        developer = self.identity.authenticate(auth); identifier(developer)
        if developer not in self.bindings: raise Denied('developer binding unavailable')
        return developer

    def _capacity(self, db, table):
        if db.execute('SELECT COUNT(*) FROM '+table).fetchone()[0] >= self.max_records:
            raise Unavailable('retained history capacity reached')

    def _cached(self, db, developer, key, payload):
        identifier(key)
        row = db.execute('SELECT * FROM receipts WHERE developer=? AND key=?', (developer, key)).fetchone()
        if row:
            if row['digest'] != digest(payload): raise Conflict('business key payload changed')
            return decode(row['receipt'].encode())
        self._capacity(db, 'receipts')

    @staticmethod
    def _remember(db, developer, key, payload, receipt):
        db.execute('INSERT INTO receipts VALUES(?,?,?,?)', (developer, key, digest(payload), canonical(receipt).decode()))
        return receipt

    def ingest(self, envelope):
        value = event_payload(self.provider.verify(envelope))
        if (value['authority_id'] != self.authority_id or value['developer_id'] not in self.bindings or
                self.bindings[value['developer_id']] != value['provider_account']):
            raise Denied('provider event binding mismatch')
        with self.mutex, self._transaction() as db:
            row = db.execute('SELECT * FROM events WHERE id=?', (value['event_id'],)).fetchone()
            fingerprint = digest(value)
            if row:
                if row['digest'] != fingerprint: raise Conflict('event ID payload changed')
                return decode(row['receipt'].encode())
            self._capacity(db, 'events')
            if value['kind'] in ('sale', 'settled'): result = self._sale(db, value)
            else: result = self._payout_result(db, value)
            receipt = {'event_id': value['event_id'], 'event_sha256': fingerprint,
                       'historical_receipt': True, 'simulation_only': True, 'result': result}
            db.execute('INSERT INTO events VALUES(?,?,?)', (value['event_id'], fingerprint, canonical(receipt).decode()))
            return receipt

    def _sale(self, db, event):
        developer, record = event['developer_id'], event['record']
        values = (developer, record['gross_minor'], record['fee_minor'], record['net_minor'])
        row = db.execute('SELECT * FROM sales WHERE id=?', (record['sale_id'],)).fetchone()
        if row is None:
            if event['kind'] != 'sale': raise Conflict('settlement arrived before its authoritative sale')
            self._capacity(db, 'sales')
            db.execute("INSERT INTO sales VALUES(?,?,?,?,?,'PENDING')", (record['sale_id'], *values))
            self._post(db, developer, 'provider_sale', record['sale_id'], 'SALE_CLEARING', 'PENDING', record['net_minor'])
            state = 'PENDING'
        else:
            if tuple(row[k] for k in ('developer', 'gross', 'fee', 'net')) != values: raise Conflict('sale identity or authoritative amounts changed')
            state = row['state']
        if event['kind'] == 'settled' and state == 'PENDING':
            self._post(db, developer, 'provider_settlement', record['sale_id'], 'PENDING', 'AVAILABLE', record['net_minor'])
            db.execute("UPDATE sales SET state='SETTLED' WHERE id=?", (record['sale_id'],)); state = 'SETTLED'
        return {'sale_id': record['sale_id'], 'state': state, 'net_minor': record['net_minor']}

    def reserve(self, value, *, key, auth):
        developer = self._developer(auth); amount(value); identifier(key)
        payload = {'op': 'reserve', 'amount_minor': value, 'currency': 'USD', 'fee_minor': 0}
        with self.identity.guard(developer, 'reserve'), self.mutex, self._transaction() as db:
            old = self._cached(db, developer, key, payload)
            if old is not None: return old
            if not db.execute('SELECT connected FROM developers WHERE id=?', (developer,)).fetchone()[0]:
                raise Denied('developer connection is closed')
            if self._balances(db, developer)['AVAILABLE'] < value: raise Denied('insufficient settled developer balance')
            self._capacity(db, 'payouts')
            business = 'payout-'+digest([self.authority_id, developer, key])
            intent = {'schema_version': 1, 'authority_id': self.authority_id, 'provider_id': PROVIDER,
                      'developer_id': developer, 'provider_account': self.bindings[developer],
                      'business_key': business, 'currency': 'USD', 'amount_minor': value, 'fee_minor': 0}
            db.execute("INSERT INTO payouts VALUES(?,?,?,?, 'RESERVED',0,?,NULL)", (developer, key, business, value, canonical(intent).decode()))
            self._post(db, developer, 'payout_reserve', business, 'AVAILABLE', 'PAYOUT_HOLD', value)
            return self._remember(db, developer, key, payload, {'business_key': business, 'amount_minor': value,
                'fee_minor': 0, 'currency': 'USD', 'state_at_reserve': 'RESERVED', 'historical_receipt': True,
                'provider_payment_confirmed': False, 'simulation_only': True})

    def cancel(self, payout_key, *, key, auth):
        developer = self._developer(auth); identifier(payout_key)
        payload = {'op': 'cancel', 'payout_key': payout_key}
        with self.identity.guard(developer, 'recover'), self.mutex, self._transaction() as db:
            old = self._cached(db, developer, key, payload)
            if old is not None: return old
            row = self._row(db, developer, payout_key)
            if row['claimed']: raise Denied('sent payout requires provider reconciliation; hold retained')
            if row['state'] != 'CANCELED':
                self._post(db, developer, 'payout_cancel', row['business_key'], 'PAYOUT_HOLD', 'AVAILABLE', row['amount'])
                db.execute("UPDATE payouts SET state='CANCELED' WHERE developer=? AND key=?", (developer, payout_key))
            return self._remember(db, developer, key, payload, {'business_key': row['business_key'], 'state': 'CANCELED', 'simulation_only': True})

    def disconnect(self, *, key, auth):
        developer = self._developer(auth); payload = {'op': 'disconnect'}
        with self.identity.guard(developer, 'recover'), self.mutex, self._transaction() as db:
            old = self._cached(db, developer, key, payload)
            if old is not None: return old
            db.execute('UPDATE developers SET connected=0 WHERE id=?', (developer,))
            return self._remember(db, developer, key, payload, {'connected': False, 'claimed_payouts': 'reconciliation_only',
                'upstream_credentials_revoked': False, 'simulation_only': True})

    @staticmethod
    def _row(db, developer, key):
        identifier(key)
        row = db.execute('SELECT * FROM payouts WHERE developer=? AND key=?', (developer, key)).fetchone()
        if row is None: raise Denied('payout not owned or unavailable')
        return row

    def status(self, key, *, auth):
        developer = self._developer(auth)
        with self.identity.guard(developer, 'recover'), self.mutex, closing(self._connect()) as db:
            row = self._row(db, developer, key)
            return {'business_key': row['business_key'], 'amount_minor': row['amount'], 'state': row['state'],
                    'send_claimed': bool(row['claimed']), 'error': row['error'], 'simulation_only': True}

    def balance(self, *, auth):
        developer = self._developer(auth)
        with self.identity.guard(developer, 'recover'), self.mutex, closing(self._connect()) as db:
            self._verify(db)
            return {'currency': 'USD', 'balances': self._balances(db, developer), 'simulation_only': True,
                    'personal_wallet_link': 'NOT_CONNECTED', 'real_provider': 'NOT_CONNECTED'}

    def _payout_result(self, db, event):
        record, developer = event['record'], event['developer_id']
        row = db.execute('SELECT * FROM payouts WHERE business_key=?', (record['business_key'],)).fetchone()
        if row is None or row['developer'] != developer or row['amount'] != record['amount_minor'] or not row['claimed']:
            raise Denied('provider result does not match a claimed payout')
        final = {'paid': 'PAID', 'failed_no_transfer': 'FAILED'}.get(record['state'])
        if row['state'] in TERMINAL:
            if final and final != row['state']: raise Conflict('conflicting final provider observation; manual recovery required')
        elif final:
            destination = 'PAID' if final == 'PAID' else 'AVAILABLE'
            self._post(db, developer, 'provider_payout_'+final.lower(), row['business_key'], 'PAYOUT_HOLD', destination, row['amount'])
            db.execute('UPDATE payouts SET state=?,error=NULL WHERE business_key=?', (final, row['business_key']))
        else:
            db.execute("UPDATE payouts SET state='UNKNOWN',error='provider outcome unconfirmed; hold retained' WHERE business_key=?", (row['business_key'],))
        current = db.execute('SELECT state FROM payouts WHERE business_key=?', (row['business_key'],)).fetchone()[0]
        return {'business_key': row['business_key'], 'state': current, 'simulation_only': True}

    def process_one(self):
        with self.mutex, closing(self._connect()) as db:
            rows = db.execute("SELECT p.rowid AS sequence,p.* FROM payouts p JOIN developers d ON d.id=p.developer WHERE p.state IN ('RESERVED','SENDING','UNKNOWN') AND (p.claimed=1 OR d.connected=1) ORDER BY p.rowid").fetchall()
            eligible = [r for r in rows if r['business_key'] not in self.processing]
            # One unresolved developer must not starve later developers. This
            # cursor affects scheduling only, never durable financial state.
            row = next((dict(r) for r in eligible if r['sequence'] > self.cursor), dict(eligible[0]) if eligible else None)
            if row is None: return False
            self.cursor = row['sequence']
            self.processing.add(row['business_key'])
        try:
            action = 'recover' if row['claimed'] else 'start'
            with self.identity.guard(row['developer'], action), self.mutex, self._transaction() as db:
                row = self._row(db, row['developer'], row['key'])
                if row['state'] in TERMINAL: return True
                if not row['claimed'] and not db.execute('SELECT connected FROM developers WHERE id=?', (row['developer'],)).fetchone()[0]:
                    return False
                recovery = bool(row['claimed']); intent = decode(row['intent'].encode())
                db.execute("UPDATE payouts SET claimed=1,state=?,error=NULL WHERE business_key=?",
                           ('UNKNOWN' if recovery else 'SENDING', row['business_key']))
            # A durable claim is a point of no automatic effect retry, including
            # a crash before HTTP. Disconnect after this point cannot unsend it.
            envelope = self.provider.request('status' if recovery else 'create', intent)
            value = event_payload(self.provider.verify(envelope))
            expected = {k: intent[k] for k in ('authority_id','provider_id','developer_id','provider_account','currency')}
            if any(value[k] != v for k, v in expected.items()) or value['kind'] != 'payout.result' or value['record']['business_key'] != intent['business_key']:
                raise Denied('provider reply binding mismatch')
            self.ingest(envelope)
            return True
        except Denied:
            # Admission denial before claim leaves the reservation cancelable.
            # A bad response after claim must never release or resend money.
            self._unknown(row['business_key']); return False
        except (OSError, ValueError, sqlite3.Error):
            self._unknown(row['business_key']); return False
        finally:
            with self.mutex: self.processing.discard(row['business_key'])

    def _unknown(self, business_key):
        with self.mutex, self._transaction() as db:
            db.execute("UPDATE payouts SET state='UNKNOWN',error='provider or persistence outcome requires reconciliation' WHERE business_key=? AND claimed=1 AND state NOT IN ('PAID','FAILED','CANCELED')", (business_key,))

    def close(self):
        with self.mutex:
            if self.processing: raise Unavailable('inflight provider request; ownership retained')
            if not self.closed:
                os.close(self.lock_fd); self.lock_fd = None; self.closed = True

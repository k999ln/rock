"""Bounded private SQLite transactions shared only by the new planning APIs."""
from contextlib import closing, contextmanager
import hashlib
import json
import os
from pathlib import Path
import re
import sqlite3
import stat
import time


class OperationError(ValueError):
    pass


def require(value, message):
    if not value:
        raise OperationError(message)


def canonical(value):
    try:
        return json.dumps(value, sort_keys=True, separators=(',', ':'), allow_nan=False)
    except (ValueError, TypeError, RecursionError) as error:
        raise OperationError('bounded JSON required') from error


def digest(value):
    return hashlib.sha256(canonical(value).encode()).hexdigest()


def identifier(value):
    require(type(value) is str and re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}', value), 'invalid identifier')
    return value


def sha256(value):
    require(type(value) is str and re.fullmatch('[0-9a-f]{64}', value), 'invalid SHA256')
    return value


def exact(value, fields):
    require(type(value) is dict and set(value) == set(fields), 'unknown or missing fields')


def denied(*_):
    raise PermissionError('trusted authentication adapter required')


class Database:
    def __init__(self, state, binding, *, authorize=None, clock=time.time, capacity=2048):
        require(type(capacity) is int and 1 <= capacity <= 10000, 'invalid receipt capacity')
        self.directory = Path(state).absolute()
        require(not self.directory.is_symlink(), 'private state cannot be a symlink')
        self.directory.mkdir(mode=0o700, parents=True, exist_ok=True)
        info = self.directory.stat()
        require(stat.S_ISDIR(info.st_mode) and info.st_uid == os.geteuid() and
                stat.S_IMODE(info.st_mode) == 0o700, 'private state must be owned mode0700')
        self.path = self.directory / 'state.sqlite3'
        self.marker = self.directory / 'state.required'
        self.authorize, self.clock, self.capacity = authorize or denied, clock, capacity
        bound = canonical(binding)
        new = not self.path.exists() and not self.path.is_symlink()
        if new:
            require(not any(self.directory.iterdir()), 'missing database in existing private state')
            fd = os.open(self.path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600); os.close(fd)
        with self.connection() as db:
            if new:
                db.executescript('''
                    CREATE TABLE meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
                    CREATE TABLE objects(id TEXT PRIMARY KEY,kind TEXT NOT NULL,payload TEXT NOT NULL,
                        state TEXT NOT NULL,revision INTEGER NOT NULL,result TEXT);
                    CREATE TABLE receipts(key TEXT PRIMARY KEY,actor TEXT NOT NULL,payload TEXT NOT NULL,response TEXT NOT NULL);
                    CREATE TABLE audit(sequence INTEGER PRIMARY KEY,event TEXT NOT NULL,event_hash TEXT NOT NULL);
                    CREATE TRIGGER objects_payload BEFORE UPDATE OF id,kind,payload ON objects BEGIN
                        SELECT RAISE(ABORT,'immutable definition'); END;
                    CREATE TRIGGER objects_keep BEFORE DELETE ON objects BEGIN SELECT RAISE(ABORT,'retained object'); END;
                    CREATE TRIGGER receipts_no_update BEFORE UPDATE ON receipts BEGIN SELECT RAISE(ABORT,'immutable receipt'); END;
                    CREATE TRIGGER receipts_no_delete BEFORE DELETE ON receipts BEGIN SELECT RAISE(ABORT,'immutable receipt'); END;
                    CREATE TRIGGER audit_no_update BEFORE UPDATE ON audit BEGIN SELECT RAISE(ABORT,'immutable audit'); END;
                    CREATE TRIGGER audit_no_delete BEFORE DELETE ON audit BEGIN SELECT RAISE(ABORT,'immutable audit'); END;
                    CREATE TRIGGER terminal_result BEFORE UPDATE ON objects
                        WHEN OLD.kind IN ('assignment','activation') AND OLD.state != 'UNKNOWN'
                        BEGIN SELECT RAISE(ABORT,'immutable terminal observation'); END;
                ''')
                with db:
                    db.executemany('INSERT INTO meta VALUES (?,?)', [('binding', bound), ('maximum_time', '0')])
            tables = {r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
            require(tables == {'meta', 'objects', 'receipts', 'audit'}, 'unknown or partial state schema')
            require(db.execute("SELECT value FROM meta WHERE key='binding'").fetchone()[0] == bound,
                    'private state authority/profile/policy binding changed')
            require(db.execute('PRAGMA integrity_check').fetchone()[0] == 'ok', 'private state integrity failed')
        if self.marker.exists() or self.marker.is_symlink():
            self.protected(self.marker)
            require(self.marker.read_text() == bound, 'private state marker changed')
        else:
            with self.marker.open('x') as stream:
                stream.write(bound); stream.flush(); os.fsync(stream.fileno())
            self.marker.chmod(0o600)

    def protected(self, path):
        info = path.lstat()
        require(stat.S_ISREG(info.st_mode) and info.st_nlink == 1 and info.st_uid == os.geteuid() and
                stat.S_IMODE(info.st_mode) == 0o600, 'private file must be single-link owned mode0600')

    @contextmanager
    def connection(self):
        self.protected(self.path)
        for suffix in ('', '-journal', '-wal', '-shm'):
            path = Path(str(self.path) + suffix)
            if path.exists() or path.is_symlink():
                self.protected(path)
        with closing(sqlite3.connect(self.path, timeout=5)) as db:
            db.row_factory = sqlite3.Row
            db.execute('PRAGMA foreign_keys=ON'); db.execute('PRAGMA synchronous=FULL')
            yield db

    def now(self):
        value = self.clock()
        require(type(value) in (int, float) and 0 <= value < 2**53, 'invalid clock')
        return int(value)

    def run(self, request, context, handler, *, fresh=True):
        require(type(request) is dict and 'key' in request and 'op' in request, 'keyed operation required')
        identifier(request['key']); identifier(request['op'])
        encoded = canonical(request)
        require(len(encoded.encode()) <= 65536, 'request exceeds64KiB')
        with self.connection() as db, db:
            db.execute('BEGIN IMMEDIATE')
            # Trusted adapter must be quick, side-effect-free and must not
            # acquire an unrelated writer lock while this transaction is held.
            actor = identifier(self.authorize(context, request['op'], dict(request)))
            existing = db.execute('SELECT * FROM receipts WHERE key=?', (request['key'],)).fetchone()
            if existing:
                require(existing['actor'] == actor and existing['payload'] == encoded, 'idempotency key conflict')
                return json.loads(existing['response'])
            require(db.execute('SELECT COUNT(*) FROM receipts').fetchone()[0] < self.capacity, 'receipt capacity reached')
            now = self.now(); maximum = int(db.execute("SELECT value FROM meta WHERE key='maximum_time'").fetchone()[0])
            require(not fresh or now >= maximum, 'clock moved backwards; new admission denied')
            result = handler(db, actor, now)
            response = {'ok': True, 'result': result, 'execution_authorized': False,
                        'hardware_action_performed': False}
            db.execute('INSERT INTO receipts VALUES (?,?,?,?)', (request['key'], actor, encoded, canonical(response)))
            previous = db.execute('SELECT sequence,event_hash FROM audit ORDER BY sequence DESC LIMIT 1').fetchone()
            event = {'sequence': previous['sequence']+1 if previous else 1,
                     'previous_hash': previous['event_hash'] if previous else '0'*64,
                     'actor': actor, 'op': request['op'], 'request_sha256': digest(request),
                     'response_sha256': digest(response), 'at': now}
            db.execute('INSERT INTO audit VALUES (?,?,?)', (event['sequence'], canonical(event), digest(event)))
            db.execute("UPDATE meta SET value=? WHERE key='maximum_time'", (str(max(now, maximum)),))
            return response

    def diagnostics(self, context):
        identifier(self.authorize(context, 'diagnostics', {}))
        with self.connection() as db:
            db.execute('PRAGMA query_only=ON'); db.execute('BEGIN')
            previous = '0'*64; count = 0
            for row in db.execute('SELECT * FROM audit ORDER BY sequence'):
                event = json.loads(row['event']); count += 1
                require(event['sequence'] == count and event['previous_hash'] == previous and
                        digest(event) == row['event_hash'], 'audit chain differs')
                previous = row['event_hash']
            return {'schema': 'rock-operations-diagnostics/1', 'audit_events': count,
                    'audit_head': previous, 'integrity': db.execute('PRAGMA integrity_check').fetchone()[0],
                    'objects': db.execute('SELECT COUNT(*) FROM objects').fetchone()[0],
                    'receipts': db.execute('SELECT COUNT(*) FROM receipts').fetchone()[0],
                    'clock_rollback': self.now() < int(db.execute("SELECT value FROM meta WHERE key='maximum_time'").fetchone()[0]),
                    'remote_executor_connected': False, 'private_payloads_included': False}

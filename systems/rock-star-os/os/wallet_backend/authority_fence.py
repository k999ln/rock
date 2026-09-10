"""Same-host, single-coordinator ownership of managed one-contract Wallets.

This excludes a copied coordinator on another host and direct administrator SQL.
An admission is held through the actual action, not only the HTTP response wait.
"""
from __future__ import annotations
from contextlib import contextmanager, closing
from dataclasses import asdict
import fcntl
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import stat
import tempfile
import threading
import time
import uuid

from .runtime_contracts import (FreshContractSpec, ContractDescriptor, ContractIdentity,
                               RuntimeAdmissionRejected, RuntimeUnavailable)

MARKER_SCHEMA = 'managed-wallet-authority/2'
REGISTRY_SCHEMA = 'managed-wallet-registry/1'
JOURNAL_SCHEMA = 'managed-wallet-adoption/1'
DB_NAMES = ('wallet-simulator.db', 'entitlement.db')
_TLS = threading.local()


def require(value, message):
    if not value: raise RuntimeUnavailable(message)


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False).encode()


def identifier(value):
    require(type(value) is str and 1 <= len(value) <= 160 and value.isascii() and
            all(c.isalnum() or c in '-_.:' for c in value), 'bounded identifier required')
    return value


def uuid_text(value):
    require(type(value) is str and str(uuid.UUID(value)) == value, 'canonical UUID required')
    return value


def private_directory(value, *, create=False):
    path = Path(value)
    require(path.is_absolute() and path == path.resolve(), 'canonical absolute directory required')
    for parent in path.parents:
        info = parent.lstat()
        require(stat.S_ISDIR(info.st_mode) and not stat.S_ISLNK(info.st_mode), 'non-directory/symlink parent')
        require(not info.st_mode & 0o022 or (info.st_uid == 0 and info.st_mode & stat.S_ISVTX),
                'unprotected writable ancestor')
    if create: path.mkdir(mode=0o700, exist_ok=True)
    info = path.lstat()
    require(stat.S_ISDIR(info.st_mode) and info.st_uid == os.geteuid() and
            stat.S_IMODE(info.st_mode) == 0o700, 'owned mode 0700 directory required')
    return path


def private_file(path, *, create=False):
    flags = os.O_RDWR | os.O_NOFOLLOW | os.O_NONBLOCK
    if create: flags |= os.O_CREAT
    descriptor = os.open(path, flags, 0o600)
    try:
        info = os.fstat(descriptor)
        require(stat.S_ISREG(info.st_mode) and info.st_uid == os.geteuid() and
                stat.S_IMODE(info.st_mode) == 0o600 and info.st_nlink == 1, 'owned unaliased mode 0600 file required')
        require((info.st_dev, info.st_ino) == (path.lstat().st_dev, path.lstat().st_ino), 'file identity changed')
        return descriptor
    except BaseException:
        os.close(descriptor); raise


def fsync_directory(path):
    descriptor = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try: os.fsync(descriptor)
    finally: os.close(descriptor)


def read_json(path):
    descriptor = private_file(path)
    try:
        raw = os.read(descriptor, 262145)
        require(0 < len(raw) <= 262144, 'bounded private metadata required')
    finally: os.close(descriptor)
    def unique(pairs):
        result = {}
        for key, value in pairs:
            require(key not in result, 'duplicate private metadata field'); result[key] = value
        return result
    def nonfinite(_): raise RuntimeUnavailable('nonfinite private metadata')
    value = json.loads(raw, object_pairs_hook=unique, parse_constant=nonfinite)
    require(type(value) is dict, 'private metadata object required')
    return value


def write_json(path, value):
    data = canonical(value) + b'\n'
    require(len(data) <= 262144, 'private metadata exceeds fixed bound')
    descriptor, name = tempfile.mkstemp(prefix='.gx00-', dir=path.parent)
    try:
        with os.fdopen(descriptor, 'wb') as stream:
            stream.write(data); stream.flush(); os.fsync(stream.fileno())
        os.replace(name, path); fsync_directory(path.parent)
    finally:
        if os.path.exists(name): os.unlink(name)


def descriptor_value(descriptor):
    value = asdict(descriptor); value['canonical_state'] = str(descriptor.canonical_state)
    return value


def parse_descriptor(value):
    require(type(value) is dict and set(value) == set(ContractDescriptor.__dataclass_fields__), 'descriptor fields differ')
    for key in ('ledger_ref', 'owner_actor', 'owner_ref', 'primary_device_ref'): identifier(value[key])
    uuid_text(value['ledger_uuid']); uuid_text(value['wallet_authority_id'])
    require(type(value['writer_epoch']) is int and 1 <= value['writer_epoch'] < 2**63, 'invalid writer epoch')
    return ContractDescriptor(**{**value, 'canonical_state': private_directory(value['canonical_state'])})


def file_identity(path):
    descriptor = private_file(path)
    try:
        info = os.fstat(descriptor)
        return [info.st_dev, info.st_ino]
    finally: os.close(descriptor)


def readonly(path, *, immutable=True):
    file_identity(path)
    # Both modes reject foreign, linked or replaced sidecar files. Live reads
    # must consult SQLite's committed WAL instead of an immutable main-file view.
    for suffix in ('-wal', '-shm', '-journal'):
        sidecar = path.with_name(path.name + suffix)
        if sidecar.exists() or sidecar.is_symlink():
            file_identity(sidecar)
            if immutable and suffix != '-shm':
                require(sidecar.stat().st_size == 0, 'checkpointed closed database required')
    db = sqlite3.connect(path.as_uri() + '?mode=ro' + ('&immutable=1' if immutable else ''), uri=True, isolation_level=None)
    db.row_factory = sqlite3.Row; db.execute('PRAGMA query_only=ON'); db.execute('BEGIN')
    return db


def table_exists(db, table):
    return bool(db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (table,)).fetchone())


def wallet_identity(path, *, immutable=True):
    with closing(readonly(path, immutable=immutable)) as db:
        require(table_exists(db, 'wallet_storage_identity'), 'managed Wallet identity missing')
        rows = db.execute('SELECT * FROM wallet_storage_identity').fetchall()
        require(len(rows) == 1, 'exactly one managed Wallet identity required')
        return dict(rows[0])


def install_wallet_identity(path, descriptor, account_id, migration_id):
    fd = private_file(path, create=True); os.close(fd)
    with closing(sqlite3.connect(path, isolation_level=None)) as db:
        db.execute('PRAGMA synchronous=FULL'); db.execute('BEGIN IMMEDIATE')
        try:
            db.execute('''CREATE TABLE IF NOT EXISTS wallet_storage_identity (
                singleton INTEGER PRIMARY KEY CHECK(singleton=1), ledger_uuid TEXT NOT NULL UNIQUE,
                account_id TEXT, identity_schema INTEGER NOT NULL CHECK(identity_schema=1), migration_id TEXT NOT NULL)''')
            rows = db.execute('SELECT singleton,ledger_uuid,account_id,identity_schema,migration_id FROM wallet_storage_identity').fetchall()
            expected = (1, descriptor.ledger_uuid, account_id, 1, migration_id)
            if rows: require(rows == [expected], 'existing Wallet storage identity differs')
            else: db.execute('INSERT INTO wallet_storage_identity VALUES (?,?,?,?,?)', expected)
            db.execute('''CREATE TRIGGER IF NOT EXISTS wallet_storage_identity_immutable BEFORE UPDATE OF
                singleton,ledger_uuid,identity_schema,migration_id ON wallet_storage_identity
                BEGIN SELECT RAISE(ABORT,'managed Wallet identity is immutable'); END''')
            db.execute('''CREATE TRIGGER IF NOT EXISTS wallet_storage_account_immutable BEFORE UPDATE OF account_id
                ON wallet_storage_identity WHEN OLD.account_id IS NOT NULL AND NEW.account_id IS NOT OLD.account_id
                BEGIN SELECT RAISE(ABORT,'managed Wallet account is immutable'); END''')
            db.execute('''CREATE TRIGGER IF NOT EXISTS wallet_storage_identity_no_delete BEFORE DELETE ON wallet_storage_identity
                BEGIN SELECT RAISE(ABORT,'managed Wallet identity is retained'); END''')
            db.commit()
        except BaseException: db.rollback(); raise
    fsync_directory(path.parent)


def install_entitlement_identity(path, descriptor, account_id, migration_id, legacy_identity=None):
    fd = private_file(path, create=True); os.close(fd)
    with closing(sqlite3.connect(path, isolation_level=None)) as db:
        db.execute('PRAGMA foreign_keys=ON'); db.execute('PRAGMA synchronous=FULL'); db.execute('BEGIN IMMEDIATE')
        try:
            db.execute('''CREATE TABLE IF NOT EXISTS wallet_bindings_v2 (
                account_id TEXT PRIMARY KEY REFERENCES accounts(account_id), ledger_uuid TEXT NOT NULL UNIQUE,
                legacy_identity TEXT NOT NULL, migration_id TEXT NOT NULL)''')
            if account_id is not None:
                require(legacy_identity is not None, 'verified original Wallet binding required')
                rows = db.execute('SELECT * FROM wallet_bindings_v2').fetchall()
                expected = (account_id, descriptor.ledger_uuid, legacy_identity, migration_id)
                if rows: require(rows == [expected], 'existing stable contract binding differs')
                else: db.execute('INSERT INTO wallet_bindings_v2 VALUES (?,?,?,?)', expected)
            for action in ('UPDATE', 'DELETE'):
                db.execute(f'''CREATE TRIGGER IF NOT EXISTS wallet_bindings_v2_no_{action.lower()} BEFORE {action}
                    ON wallet_bindings_v2 BEGIN SELECT RAISE(ABORT,'stable Wallet binding is immutable'); END''')
            db.commit()
        except BaseException: db.rollback(); raise
    fsync_directory(path.parent)


class _Hooks:
    def __init__(self, permit): self.permit = permit
    def held_by_current_thread(self): return not self.permit.released and getattr(_TLS, 'permit', None) is self.permit
    def require_held(self):
        if not self.held_by_current_thread(): raise RuntimeAdmissionRejected('this contract admission is not held')


class _Permit:
    def __init__(self, coordinator, descriptor, marker, lock_fd, *, opening=True):
        self.coordinator, self.descriptor, self.marker, self.lock_fd = coordinator, descriptor, marker, lock_fd
        self.hooks = _Hooks(self); self.gate = threading.RLock(); self.condition = threading.Condition()
        self.opening, self.initialized, self.accepting, self.released = opening, False, False, False
        self.inflight = 0
        self.initializing = False

    @contextmanager
    def _ticket(self):
        previous = getattr(_TLS, 'permit', None)
        require(previous is None or previous is self, 'nested admission to another contract is forbidden')
        _TLS.permit = self
        try: yield
        finally: _TLS.permit = previous

    @contextmanager
    def initialize(self):
        with self.condition:
            require(self.opening and not self.released and not self.initialized and not self.initializing,
                    'open permit initialization is not available')
            self.initializing = True
        try:
            with self.gate, self._ticket():
                self.coordinator._verify_marker(self, allow_prepared=True, immutable=self.marker['state'] != 'ACTIVE')
                self.coordinator._initialize(self)
                yield
                self.initialized = True
        finally:
            with self.condition: self.initializing = False

    def activate(self, observed):
        require(self.opening and self.initialized and not self.released and
                type(observed) is ContractIdentity and observed.descriptor == self.descriptor,
                'observed runtime does not match the initialized permit')
        with self.gate, self.coordinator.mutex:
            self.coordinator._activate(self, observed.account_id)
            self.opening, self.accepting = False, True
        return self

    @contextmanager
    def admit_write(self, expected_epoch, *, deadline=None):
        require(type(expected_epoch) is int and expected_epoch == self.descriptor.writer_epoch, 'stale writer epoch')
        previous = getattr(_TLS, 'permit', None)
        require(previous is None or previous is self, 'cross-contract nested admission rejected')
        if previous is self:
            require(not self.opening and not self.released, 'not an active writer ticket')
            yield; return
        with self.condition:
            require(self.accepting and not self.released and not self.opening, 'contract is not accepting writes')
        acquired = self.gate.acquire() if deadline is None else self.gate.acquire(timeout=max(0, deadline-time.monotonic()))
        if not acquired: raise TimeoutError('contract admission deadline elapsed')
        try:
            with self.condition:
                require(self.accepting and not self.released, 'contract quiesced while admission waited')
                acquired_registry = (self.coordinator.mutex.acquire() if deadline is None else
                    self.coordinator.mutex.acquire(timeout=max(0, deadline-time.monotonic())))
                if not acquired_registry: raise TimeoutError('coordinator admission deadline elapsed')
                try:
                    if deadline is not None and time.monotonic() >= deadline:
                        raise TimeoutError('contract admission deadline elapsed')
                    self.coordinator._verify_marker(self, immutable=False)
                finally: self.coordinator.mutex.release()
                self.inflight += 1
            try:
                with self._ticket(): yield
            finally:
                with self.condition: self.inflight -= 1; self.condition.notify_all()
        finally: self.gate.release()

    def bind_registered_account(self, account_id):
        self.hooks.require_held(); identifier(account_id)
        require(not self.opening and not self.released, 'active account binding required')
        self.coordinator._bind_account(self, account_id)

    def quiesce(self):
        with self.condition:
            require(not self.opening and not self.released, 'active permit required before quiesce')
            self.accepting = False; self.condition.notify_all()

    def release(self):
        with self.condition:
            require(not self.accepting and not self.opening and not self.released and self.inflight == 0,
                    'writer must be quiesced with no unfinished admission')
            self._release()

    def abort(self):
        with self.condition:
            require(self.opening and not self.released and not self.initializing and not self.hooks.held_by_current_thread(),
                    'only an idle opening permit may abort')
            self._release()

    def _release(self):
        self.released = True
        self.coordinator._remove_permit(self)
        fcntl.flock(self.lock_fd, fcntl.LOCK_UN); os.close(self.lock_fd); self.lock_fd = None


class AuthorityFenceCoordinator:
    def __init__(self, registry_dir):
        self.registry_dir = private_directory(registry_dir, create=True)
        self.mutex, self.permits, self.closed, self.poisoned = threading.RLock(), {}, False, False
        self.lock_fd = private_file(self.registry_dir / 'coordinator.lock', create=True)
        try: fcntl.flock(self.lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BaseException: os.close(self.lock_fd); raise
        path = self.registry_dir / 'registry.json'
        try:
            if not path.exists():
                require({p.name for p in self.registry_dir.iterdir()} == {'coordinator.lock'}, 'unmarked registry directory is not empty')
                write_json(path, {'schema': REGISTRY_SCHEMA, 'coordinator_id': str(uuid.uuid4()),
                                  'contracts': {}, 'owner_registry': None, 'restores': {}})
            self.registry = read_json(path)
            require(set(self.registry) == {'schema', 'coordinator_id', 'contracts', 'owner_registry', 'restores'} and self.registry['schema'] == REGISTRY_SCHEMA and
                    type(self.registry['contracts']) is dict and len(self.registry['contracts']) <= 64 and
                    type(self.registry['restores']) is dict and len(self.registry['restores']) <= 64, 'invalid coordinator registry')
            uuid_text(self.registry['coordinator_id'])
            self.registry_digest = hashlib.sha256(canonical(self.registry)).hexdigest()
        except BaseException:
            fcntl.flock(self.lock_fd, fcntl.LOCK_UN); os.close(self.lock_fd); raise

    def _check_registry(self):
        require(not self.closed and not self.poisoned, 'coordinator is closed or needs metadata recovery')
        require(hashlib.sha256(canonical(read_json(self.registry_dir / 'registry.json'))).hexdigest() == self.registry_digest,
                'coordinator registry changed outside its owned lifetime')

    def _save_registry(self):
        try: write_json(self.registry_dir / 'registry.json', self.registry)
        except BaseException:
            self.poisoned = True
            raise
        self.registry_digest = hashlib.sha256(canonical(self.registry)).hexdigest()

    def _lock_state(self, state):
        fd = private_file(state / 'authority.lock', create=True)
        try: fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BaseException: os.close(fd); raise
        return fd

    def prepare_fresh(self, spec, *, public_fixture_authority_id=None):
        require(type(spec) is FreshContractSpec, 'explicit fresh contract specification required')
        for value in (spec.ledger_ref, spec.owner_actor, spec.owner_ref, spec.primary_device_ref): identifier(value)
        if public_fixture_authority_id is not None:
            require(type(public_fixture_authority_id) is str and str(uuid.UUID(public_fixture_authority_id))==public_fixture_authority_id,
                    'explicit canonical public fixture authority UUID required')
        with self.mutex:
            self._check_registry()
            self._require_owner_registry()
            require(public_fixture_authority_id is None or not any(
                row['descriptor']['wallet_authority_id']==public_fixture_authority_id for row in self.registry['contracts'].values()),
                'public fixture authority already belongs to a contract')
            self._separate_state(spec.canonical_state)
            state = private_directory(spec.canonical_state, create=True)
            require(not list(state.iterdir()), 'fresh contract directory must be empty; no implicit import')
            require(spec.ledger_ref not in self.registry['contracts'], 'ledger reference already exists')
            require(not any(row['descriptor']['owner_ref'] == spec.owner_ref for row in self.registry['contracts'].values()),
                    'owner already has a managed contract')
            require(len(self.registry['contracts']) < 64, 'managed contract capacity exceeded')
            fd = self._lock_state(state)
            descriptor = ContractDescriptor(spec.ledger_ref, str(uuid.uuid4()), public_fixture_authority_id or str(uuid.uuid4()), spec.owner_actor,
                                            spec.owner_ref, spec.primary_device_ref, state, 1)
            marker = {'schema': MARKER_SCHEMA, 'minimum_writer_version': 2, 'state': 'PREPARED',
                      'coordinator_id': self.registry['coordinator_id'], 'descriptor': descriptor_value(descriptor),
                      'migration_id': str(uuid.uuid4()), 'account_id': None, 'legacy_inputs': None}
            try:
                # Fence supported legacy readers before the first DB exists.
                write_json(state / 'AUTHORITY.json', marker)
                permit = _Permit(self, descriptor, marker, fd)
                self.permits[spec.ledger_ref] = permit
                self.registry['contracts'][spec.ledger_ref] = {'descriptor': descriptor_value(descriptor),
                    'account_id': None, 'state': 'PREPARED', 'files': None, 'migration_id': marker['migration_id']}
                self._save_registry(); self._journal(permit, 'PREPARED')
                return permit
            except BaseException:
                self.permits.pop(spec.ledger_ref, None); fcntl.flock(fd, fcntl.LOCK_UN); os.close(fd); raise

    def open_active(self, ledger_ref):
        identifier(ledger_ref)
        with self.mutex:
            self._check_registry(); self._require_owner_registry(); require(ledger_ref not in self.permits, 'contract already has an owned runtime')
            row = self.registry['contracts'].get(ledger_ref)
            require(row is not None and row['state'] == 'ACTIVE', 'contract is not ACTIVE')
            descriptor = parse_descriptor(row['descriptor']); self._separate_state(descriptor.canonical_state)
            fd = self._lock_state(descriptor.canonical_state)
            try:
                marker = read_json(descriptor.canonical_state / 'AUTHORITY.json')
                permit = _Permit(self, descriptor, marker, fd); self._verify_marker(permit, immutable=False)
                self.permits[ledger_ref] = permit; return permit
            except BaseException: fcntl.flock(fd, fcntl.LOCK_UN); os.close(fd); raise

    def _verify_marker(self, permit, *, allow_prepared=False, immutable=True):
        with self.mutex:
            self._check_registry(); d = permit.descriptor; private_directory(d.canonical_state)
            lock_info = os.fstat(permit.lock_fd)
            require([lock_info.st_dev, lock_info.st_ino] == file_identity(d.canonical_state / 'authority.lock'),
                    'authority lock file was replaced')
            marker = read_json(d.canonical_state / 'AUTHORITY.json')
            require(canonical(marker) == canonical(permit.marker), 'authority marker changed')
            require(set(marker) == {'schema','minimum_writer_version','state','coordinator_id','descriptor','migration_id','account_id','legacy_inputs'} and
                    marker['schema'] == MARKER_SCHEMA and type(marker['minimum_writer_version']) is int and marker['minimum_writer_version'] == 2 and
                    marker['coordinator_id'] == self.registry['coordinator_id'] and marker['descriptor'] == descriptor_value(d) and
                    marker['state'] in (('PREPARED','ACTIVE') if allow_prepared else ('ACTIVE',)), 'authority is not the registered active generation')
            row = self.registry['contracts'].get(d.ledger_ref)
            require(row and row['descriptor'] == descriptor_value(d) and row['migration_id'] == marker['migration_id'], 'registered identity differs')
            if marker['state'] == 'ACTIVE':
                require(row['state'] == 'ACTIVE' and row['files'] == self._files(d), 'registered database files changed')
                self._validate_identity(permit, row['account_id'], allow_unbound_account=True, immutable=immutable)

    def _files(self, descriptor):
        return {name: file_identity(descriptor.canonical_state / name) for name in DB_NAMES}

    def _journal(self, permit, stage):
        write_json(permit.descriptor.canonical_state / 'GX00-MIGRATION.json', {
            'schema': JOURNAL_SCHEMA, 'migration_id': permit.marker['migration_id'], 'stage': stage,
            'descriptor': descriptor_value(permit.descriptor), 'legacy_inputs': permit.marker['legacy_inputs']})

    def _initialize(self, permit):
        if permit.marker['state'] == 'ACTIVE': return
        from .adopt_legacy import verify_original
        verify_original(permit)
        d = permit.descriptor; account = permit.marker['account_id']; migration = permit.marker['migration_id']
        install_wallet_identity(d.canonical_state / DB_NAMES[0], d, account, migration)
        self._journal(permit, 'WALLET_IDENTITY_COMMITTED')
        legacy = None
        if account is not None:
            with closing(readonly(d.canonical_state / DB_NAMES[1])) as db:
                rows = db.execute('SELECT wallet_identity FROM wallet_bindings WHERE account_id=?', (account,)).fetchall()
                require(len(rows) == 1, 'original account Wallet binding missing'); legacy = rows[0][0]
        install_entitlement_identity(d.canonical_state / DB_NAMES[1], d, account, migration, legacy)
        self._journal(permit, 'ENTITLEMENT_BINDING_COMMITTED')
        self._journal(permit, 'ROUTER_REGISTERED')
        verify_original(permit)

    def _observed_account(self, descriptor, *, immutable=True):
        with closing(readonly(descriptor.canonical_state / DB_NAMES[1], immutable=immutable)) as db:
            require(table_exists(db, 'accounts'), 'contract account schema missing')
            rows = db.execute('SELECT account_id,owner_ref FROM accounts').fetchall()
            require(len(rows) <= 1, 'one contract per database required')
            if not rows: return None
            require(rows[0]['owner_ref'] == descriptor.owner_ref, 'contract owner differs')
            return rows[0]['account_id']

    def _validate_identity(self, permit, account, *, allow_unbound_account=False, immutable=True):
        d = permit.descriptor
        identity = wallet_identity(d.canonical_state / DB_NAMES[0], immutable=immutable)
        actual = self._observed_account(d, immutable=immutable)
        require(identity['singleton'] == 1 and identity['identity_schema'] == 1 and identity['ledger_uuid'] == d.ledger_uuid and
                identity['migration_id'] == permit.marker['migration_id'], 'stable Wallet identity differs')
        if allow_unbound_account and account is None and actual is not None:
            require(identity['account_id'] in (None, actual), 'partial account registration belongs to another Wallet')
        else: require(actual == identity['account_id'] == account, 'Wallet and contract account differ')
        with closing(readonly(d.canonical_state / DB_NAMES[0], immutable=immutable)) as db:
            require(table_exists(db, 'wallet_auth_mode'), 'real Wallet authentication schema required')
            rows = db.execute('SELECT authority_id,account_id FROM wallet_auth_mode').fetchall()
            require(len(rows) == 1 and rows[0]['authority_id'] == d.wallet_authority_id and
                    rows[0]['account_id'] in (None, actual), 'Wallet authentication authority/account differs')
        with closing(readonly(d.canonical_state / DB_NAMES[1], immutable=immutable)) as db:
            require(table_exists(db, 'wallet_bindings_v2'), 'stable entitlement binding schema missing')
            rows = db.execute('SELECT * FROM wallet_bindings_v2').fetchall()
            if actual is None: require(not rows, 'unexpected registered Wallet binding')
            elif rows:
                require(len(rows) == 1 and rows[0]['account_id'] == actual and rows[0]['ledger_uuid'] == d.ledger_uuid and
                        rows[0]['migration_id'] == permit.marker['migration_id'], 'stable entitlement binding differs')
            else: require(allow_unbound_account and account is None, 'registered stable binding missing')

    def _activate(self, permit, account):
        immutable = permit.marker['state'] != 'ACTIVE'
        self._verify_marker(permit, allow_prepared=True, immutable=immutable)
        self._validate_identity(permit, account, immutable=immutable)
        if permit.marker['state'] == 'PREPARED':
            from .adopt_legacy import verify_original
            verify_original(permit)
        files = self._files(permit.descriptor)
        require(len({tuple(v) for v in files.values()}) == 2, 'Wallet and entitlement cannot share one file')
        for ref, row in self.registry['contracts'].items():
            if ref != permit.descriptor.ledger_ref and row['files']:
                require(not set(map(tuple, files.values())) & set(map(tuple, row['files'].values())), 'database file is shared by another contract')
        permit.marker['state'] = 'ACTIVE'; permit.marker['account_id'] = account
        write_json(permit.descriptor.canonical_state / 'AUTHORITY.json', permit.marker)
        row = self.registry['contracts'][permit.descriptor.ledger_ref]
        row.update(state='ACTIVE', files=files, account_id=account); self._save_registry()
        self._journal(permit, 'ACTIVE')

    def _bind_account(self, permit, account):
        with self.mutex:
            self._verify_marker(permit, immutable=False); d = permit.descriptor
            require(self._observed_account(d, immutable=False) == account, 'account was not created by this contract')
            row = self.registry['contracts'][d.ledger_ref]
            require(row['account_id'] in (None, account) and permit.marker['account_id'] in (None, account), 'registered account replacement rejected')
            # Complete only this same registered account after a two-DB
            # interruption, using the same binding checks as WalletBridge.
            from entitlement.wallet_bridge import bind_managed_identity
            from blackberryrock.wallet import Wallet
            with closing(sqlite3.connect(d.canonical_state / DB_NAMES[1], isolation_level=None)) as store_db, \
                 closing(sqlite3.connect(d.canonical_state / DB_NAMES[0], isolation_level=None)) as wallet_db:
                for db in (store_db, wallet_db):
                    db.row_factory = sqlite3.Row; db.execute('PRAGMA foreign_keys=ON'); db.execute('PRAGMA synchronous=FULL')
                store_db.execute('BEGIN IMMEDIATE'); wallet_db.execute('BEGIN IMMEDIATE')
                try:
                    bind_managed_identity(store_db, wallet_db, account, d.canonical_state / DB_NAMES[0])
                    Wallet._verify(wallet_db); wallet_db.commit(); store_db.commit()
                except BaseException:
                    wallet_db.rollback(); store_db.rollback(); raise
            self._validate_identity(permit, account, immutable=False)
            permit.marker['account_id'] = account; write_json(d.canonical_state / 'AUTHORITY.json', permit.marker)
            row['account_id'] = account; self._save_registry()

    def prepare_legacy(self, plan):
        from .adopt_legacy import prepare
        return prepare(self, plan)

    def stage_restore(self, ledger_ref, destination, *, restore_id):
        from .adopt_legacy import stage_restore
        return stage_restore(self, ledger_ref, destination, restore_id=restore_id)

    def promote_restore(self, restore_id):
        from .adopt_legacy import promote_restore
        return promote_restore(self, restore_id)

    def verified_completed_current_restore(self, restore_id):
        from .current_restore import verified_completed_current_restore
        return verified_completed_current_restore(self, restore_id)

    def current_restore_generation(self, restore_id, *, record_sha256):
        from .current_restore import current_restore_generation
        return current_restore_generation(self, restore_id, record_sha256=record_sha256)

    def _remove_permit(self, permit):
        with self.mutex:
            require(self.permits.get(permit.descriptor.ledger_ref) is permit, 'permit registry identity changed')
            del self.permits[permit.descriptor.ledger_ref]

    def _require_owner_registry(self):
        value = self.registry['owner_registry']
        require(type(value) is dict and set(value) == {'canonical_path', 'registry_uuid'},
                'independent owner credential registry must be pinned before opening')
        private_directory(value['canonical_path']); uuid_text(value['registry_uuid'])
        return Path(value['canonical_path'])

    def _separate_state(self, state):
        path = Path(state)
        owner = self._require_owner_registry()
        require(all(path != other and path not in other.parents and other not in path.parents
                    for other in (owner, self.registry_dir)),
                'Wallet state must remain outside independent registries')
        for row in self.registry['contracts'].values():
            other = Path(row['descriptor']['canonical_state'])
            require(path == other or path not in other.parents and other not in path.parents,
                    'managed contract directories cannot contain one another')

    def bind_owner_registry(self, canonical_path, registry_uuid):
        """Pin the independent live transport registry; never restore it here.

        This rejects replacement paths/new registry identities. Detection of a
        same-path/same-UUID historical registry rollback is NOT_IMPLEMENTED.
        """
        path = private_directory(canonical_path); uuid_text(registry_uuid)
        with self.mutex:
            self._check_registry()
            owned = [self.registry_dir] + [Path(row['descriptor']['canonical_state']) for row in self.registry['contracts'].values()]
            require(all(path != other and path not in other.parents and other not in path.parents for other in owned),
                    'owner credential registry must remain outside Wallet/coordinator backup directories')
            value = {'canonical_path': str(path), 'registry_uuid': registry_uuid}
            existing = self.registry['owner_registry']
            if existing is not None:
                require(existing == value, 'independent owner credential registry replacement is not supported')
                return
            self.registry['owner_registry'] = value; self._save_registry()

    def close(self):
        with self.mutex:
            if self.closed: return
            require(not self.permits, 'coordinator still owns unfinished contract runtimes')
            self.closed = True; fcntl.flock(self.lock_fd, fcntl.LOCK_UN); os.close(self.lock_fd); self.lock_fd = None

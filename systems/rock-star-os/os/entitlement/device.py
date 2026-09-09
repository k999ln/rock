"""OS Wallet adapter: public-fixture membership and durable monthly scheduling.

The socket handler must supply the authenticated kernel peer UID separately from
request JSON. This module never listens on a socket or contacts a real provider.
"""
from contextlib import contextmanager, closing, nullcontext
import fcntl
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import stat
import threading
import time

from blackberryrock.packages import canonical
from blackberryrock.wallet import Wallet
from .protocol import (PUBLIC_TOKENS, PRINCIPALS, TERMS_VERSION, EntitlementError,
                       NotEligible, Conflict, Capacity, fields, identifier, verify_event)
from .store import EntitlementStore, _period
from .wallet_bridge import WalletBridge

ALLOWED_PEERS = frozenset((0, 1002))
RESOLUTION_OPERATIONS = frozenset(('wallet.settle', 'wallet.dispense', 'wallet.unknown', 'wallet.reconcile'))
NEW_OPERATIONS = frozenset(('wallet.sale', 'wallet.reserve'))
READ_OPERATIONS = frozenset(('wallet.membership', 'wallet.billing.status'))
ATM_OWNER_OPERATIONS = frozenset(('wallet.atm.issue', 'wallet.atm.status', 'wallet.atm.history',
                                  'wallet.atm.cancel', 'wallet.atm.expire', 'wallet.atm.timeout',
                                  'wallet.atm.quote', 'wallet.atm.quote.cancel', 'wallet.auth.begin',
                                  'wallet.auth.enroll', 'wallet.auth.status', 'wallet.terms'))
AUTH_NEW_OPERATIONS = frozenset(('wallet.atm.issue', 'wallet.atm.quote', 'wallet.auth.begin', 'wallet.auth.enroll'))
MUTATION_FIELDS = {
    'wallet.register': {'v', 'op', 'key'},
    'wallet.consent': {'v', 'op', 'key', 'accepted', 'terms_version'},
    'wallet.bill': {'v', 'op', 'key', 'period'},
}


class DeviceWalletAdapter:
    def __init__(self, state_dir, wallet, *, provisioning_file=None, clock=None,
                 start_scheduler=True, poll_seconds=5, retry_seconds=60,
                 max_automatic_failures=3):
        if not isinstance(wallet, Wallet):
            raise TypeError('pass the existing Wallet, never another ledger')
        if (isinstance(poll_seconds, bool) or isinstance(retry_seconds, bool)
                or not isinstance(poll_seconds, (int, float)) or not isinstance(retry_seconds, (int, float))
                or not 0.01 <= poll_seconds <= 30 or not 0.01 <= retry_seconds <= 3600):
            raise ValueError('invalid bounded scheduler timing')
        if type(max_automatic_failures) is not int or not 1 <= max_automatic_failures <= 100:
            raise ValueError('invalid sandbox automatic payment failure limit')
        self.store = EntitlementStore(Path(state_dir) / 'entitlement.db', clock=clock)
        self.wallet = wallet
        # Installed by the owning WalletService before its scheduler starts.
        self.authentication = None
        self.poll_seconds, self.retry_seconds = poll_seconds, retry_seconds
        self.max_automatic_failures = max_automatic_failures
        self.lock_file = Path(state_dir) / 'device.lock'
        self._mutex, self._thread_lock = threading.RLock(), threading.Lock()
        self._local = threading.local()
        self._wake, self._stop = threading.Event(), threading.Event()
        self.thread = None
        self._worker_error = None
        self._worker_failures = 0
        self._retry_at = None
        with self.store._transaction() as db:
            db.executescript('''
                CREATE TABLE IF NOT EXISTS device_binding (
                    singleton INTEGER PRIMARY KEY CHECK(singleton=1), device_ref TEXT NOT NULL,
                    owner_actor TEXT NOT NULL, handoff_digest TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS device_runtime (
                    singleton INTEGER PRIMARY KEY CHECK(singleton=1), maximum_period TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS device_api_receipts (
                    key TEXT PRIMARY KEY, request_json TEXT NOT NULL, response_json TEXT,
                    created_at INTEGER NOT NULL);
                CREATE TABLE IF NOT EXISTS device_register_origins (
                    key TEXT PRIMARY KEY REFERENCES device_api_receipts(key), device_ref TEXT NOT NULL);
                CREATE TRIGGER IF NOT EXISTS device_register_origin_no_update BEFORE UPDATE ON device_register_origins
                    BEGIN SELECT RAISE(ABORT,'registration origin is immutable'); END;
                CREATE TRIGGER IF NOT EXISTS device_register_origin_no_delete BEFORE DELETE ON device_register_origins
                    BEGIN SELECT RAISE(ABORT,'registration origins are retained'); END;
                CREATE TABLE IF NOT EXISTS device_monthly_due (
                    period TEXT PRIMARY KEY, schedule_id TEXT NOT NULL UNIQUE,
                    account_id TEXT NOT NULL REFERENCES accounts(account_id),
                    status TEXT NOT NULL CHECK(status IN ('due','processing','retry_wait','paid','blocked')),
                    generation INTEGER NOT NULL DEFAULT 0, authorization_id TEXT,
                    next_attempt REAL NOT NULL, failures INTEGER NOT NULL DEFAULT 0,
                    last_error TEXT, updated_at INTEGER NOT NULL);
                CREATE TRIGGER IF NOT EXISTS device_receipt_no_delete BEFORE DELETE ON device_api_receipts
                    BEGIN SELECT RAISE(ABORT,'device receipts are retained'); END;
                CREATE TRIGGER IF NOT EXISTS device_receipt_request_immutable BEFORE UPDATE OF
                    key,request_json,created_at ON device_api_receipts
                    BEGIN SELECT RAISE(ABORT,'device request is immutable'); END;
                CREATE TRIGGER IF NOT EXISTS device_receipt_response_immutable BEFORE UPDATE OF response_json ON device_api_receipts
                    WHEN OLD.response_json IS NOT NULL
                    BEGIN SELECT RAISE(ABORT,'completed device response is immutable'); END;
            ''')
            # Additive migration keeps legacy receipts, due states and request
            # generations unchanged. A restored database must not buy another
            # automatic retry budget by forgetting its applied failed attempts.
            retry_columns = ('automatic_failures', 'last_failed_attempt',
                             'last_failed_settled_minor', 'last_failed_available_minor',
                             'automatic_retry_exhausted', 'manual_retry_pending')
            columns = {row['name'] for row in db.execute('PRAGMA table_info(device_monthly_due)')}
            present = set(retry_columns) & columns
            if present and present != set(retry_columns):
                raise Conflict('incomplete monthly retry policy migration')
            if not present:
                db.execute('BEGIN IMMEDIATE')  # executescript above ended its transaction.
                for name in retry_columns:
                    db.execute(f'ALTER TABLE device_monthly_due ADD COLUMN {name} INTEGER NOT NULL DEFAULT 0 CHECK({name}>=0)')
                failures = {}
                for event in db.execute("SELECT envelope FROM events WHERE status='APPLIED' AND outcome='payment_failed'"):
                    payload = json.loads(event['envelope'])['payload']
                    failures.setdefault(payload['authorization_id'], set()).add(payload['attempt'])
                available, settled = self._funding_state()
                for due in db.execute('SELECT period,authorization_id,status FROM device_monthly_due').fetchall():
                    attempts = failures.get(due['authorization_id'], set())
                    db.execute('UPDATE device_monthly_due SET automatic_failures=?,last_failed_attempt=?, '
                               'last_failed_settled_minor=?,last_failed_available_minor=?,automatic_retry_exhausted=? WHERE period=?',
                               (len(attempts), max(attempts, default=0), settled, available,
                                int(due['status'] != 'paid' and len(attempts) >= self.max_automatic_failures), due['period']))
        if provisioning_file is not None:
            with self._locked():
                self._load_provisioning(provisioning_file)
        if start_scheduler:
            self.start()

    @staticmethod
    def _peer(peer_uid):
        if type(peer_uid) is not int or peer_uid not in ALLOWED_PEERS:
            raise PermissionError('authenticated Wallet socket peer is not authorized')

    @contextmanager
    def _locked(self):
        with self._mutex:
            depth = getattr(self._local, 'depth', 0)
            descriptor = None
            if depth == 0:
                descriptor = os.open(self.lock_file, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
                if not stat.S_ISREG(os.fstat(descriptor).st_mode):
                    os.close(descriptor)
                    raise EntitlementError('invalid device state lock')
                fcntl.flock(descriptor, fcntl.LOCK_EX)
            self._local.depth = depth + 1
            try:
                yield
            finally:
                self._local.depth = depth
                if descriptor is not None:
                    os.close(descriptor)

    def _load_provisioning(self, path):
        descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
        with os.fdopen(descriptor, 'rb') as stream:
            info = os.fstat(stream.fileno())
            if (not stat.S_ISREG(info.st_mode) or info.st_uid not in (0, os.geteuid())
                    or info.st_mode & 0o022 or info.st_size > 65536):
                raise EntitlementError('provisioning must be a protected local fixture file')
            raw = stream.read(65537)
        def unique(pairs):
            result = {}
            for key, value in pairs:
                if key in result:
                    raise EntitlementError('duplicate provisioning field')
                result[key] = value
            return result
        try:
            bundle = json.loads(raw, object_pairs_hook=unique)
            fields(bundle, ('schema_version', 'kind', 'events'))
            if (type(bundle['schema_version']) is not int or bundle['schema_version'] != 1
                    or bundle['kind'] != 'public-development-fixture'
                    or not isinstance(bundle['events'], list) or not 1 <= len(bundle['events']) <= 32):
                raise EntitlementError('only bounded public development provisioning is supported')
            verified = [verify_event(event, self.store._now()) for event in bundle['events']]
            first, digest = verified[0]
            self.store._validate_event_payload(first)
            if first['issuer'] != 'fulfillment' or first['kind'] != 'handoff' or first['sequence'] != 1:
                raise EntitlementError('provisioning must begin with a signed handoff')
            device_ref, owner_ref = first['payload']['device_ref'], first['payload']['owner_ref']
            actor = next((name for name, p in PRINCIPALS.items() if p.get('owner_ref') == owner_ref), None)
            if actor is None:
                raise EntitlementError('fixture owner has no provisioned local principal')
            for event, _ in verified:
                self.store._validate_event_payload(event)
                if event['issuer'] != 'fulfillment' or event['payload']['device_ref'] != device_ref:
                    raise EntitlementError('provisioning subjects must match the local device')
            # Validate all bytes first. Apply the signed bundle and its binding in
            # the same backend transaction, including verification renewals.
            with self.store._transaction() as db:
                binding = db.execute('SELECT * FROM device_binding').fetchone()
                if binding and (binding['device_ref'], binding['owner_actor'], binding['handoff_digest']) != (device_ref, actor, digest):
                    raise Conflict('cannot replace the provisioned device or original handoff')
                for event, event_digest in verified:
                    self.store._accept_event(db, event, event_digest)
                    status = db.execute('SELECT status FROM events WHERE event_id=?', (event['event_id'],)).fetchone()[0]
                    if status != 'APPLIED':
                        raise EntitlementError('provisioning contains an unapplied state transition')
                if not binding:
                    db.execute('INSERT INTO device_binding VALUES (1,?,?,?)', (device_ref, actor, digest))
        except (TypeError, KeyError, UnicodeError, RecursionError, json.JSONDecodeError) as error:
            raise EntitlementError('malformed device provisioning') from error

    def _binding(self):
        scoped = getattr(self._local, 'binding', None)
        if scoped is not None:
            return dict(scoped)
        with closing(self.store._connect()) as db:
            row = db.execute('SELECT * FROM device_binding').fetchone()
            return dict(row) if row else None

    @contextmanager
    def device_scope(self, device_ref, owner_actor):
        """Use a server-authenticated device without replacing the original binding.

        The authority's signed fulfillment ingress must use this same Store
        instance. Its admission guard serializes revocation with the action;
        callers cannot provide this identity inside the owner request JSON.
        """
        if owner_actor not in PUBLIC_TOKENS or PRINCIPALS[owner_actor].get('role') != 'owner':
            raise NotEligible('a provisioned owner principal is required')
        with self._locked():
            original = self._binding()
            if original is None or original['owner_actor'] != owner_actor:
                raise NotEligible('device owner does not own this Wallet authority')
            with self.store.authorized_device(device_ref, PUBLIC_TOKENS[owner_actor]):
                previous = getattr(self._local, 'binding', None)
                self._local.binding = {'device_ref': device_ref, 'owner_actor': owner_actor}
                try:
                    yield
                finally:
                    self._local.binding = previous

    def _account(self):
        binding = self._binding()
        if binding is None:
            raise NotEligible('purchased-device handoff evidence is not provisioned')
        account = self.store.account_for_device(binding['device_ref'], PUBLIC_TOKENS[binding['owner_actor']])
        return account, binding

    def membership(self):
        binding = self._binding()
        result = {'simulation_only': True, 'identity_source': 'public-development-fixture',
                  'backend_connected': False, 'real_identity_verified': False,
                  'monthly_fee_minor': 888, 'currency': 'USD', 'terms_version': TERMS_VERSION,
                  'registration_input_fields': []}
        if binding is None:
            return result | {'registered': False, 'registration_status': 'HANDOFF_REQUIRED', 'entitlement': None}
        try:
            account, _ = self._account()
        except NotEligible:
            return result | {'registered': False, 'registration_status': 'REGISTRATION_REQUIRED', 'entitlement': None}
        state = self.store.entitlement(account, PUBLIC_TOKENS[binding['owner_actor']], device_ref=binding['device_ref'])
        return result | {'registered': True, 'registration_status': 'REGISTERED', 'entitlement': state}

    def require_entitlement(self, operation, *, peer_uid):
        """Guard new work; allow registered-account resolution after cancel/expiry."""
        self._peer(peer_uid)
        if operation not in NEW_OPERATIONS | RESOLUTION_OPERATIONS:
            raise EntitlementError('unsupported entitlement admission operation')
        with self._locked():
            account, binding = self._account()
            state = self.store.entitlement(account, PUBLIC_TOKENS[binding['owner_actor']], device_ref=binding['device_ref'])
            if operation in NEW_OPERATIONS and not state['device_eligible']:
                raise NotEligible('current purchased-device eligibility is required for new Wallet actions')
            return state

    @contextmanager
    def admission_guard(self, operation, *, peer_uid):
        """Keep eligibility and the existing Wallet operation in one OS scope."""
        with self._locked():
            state = self.require_entitlement(operation, peer_uid=peer_uid)
            yield state

    @contextmanager
    def snapshot_guard(self, *, peer_uid):
        """Read Wallet + membership + due history without an intervening commit."""
        self._peer(peer_uid)
        with self._locked(), self.store._mutex:
            yield

    @contextmanager
    def atm_guard(self, operation, *, peer_uid):
        """Derive ATM ownership from protected registration, never request JSON."""
        from atm import TrustedWalletContext
        self._peer(peer_uid)
        if operation not in ATM_OWNER_OPERATIONS:
            raise EntitlementError('unsupported owner ATM operation')
        with self._locked():
            account, binding = self._account()
            state = self.store.entitlement(account, PUBLIC_TOKENS[binding['owner_actor']], device_ref=binding['device_ref'])
            eligible = state['device_eligible'] is True
            if operation in AUTH_NEW_OPERATIONS and not eligible:
                raise NotEligible('current purchased-device eligibility is required for new ATM credentials')
            guard = (self.store.authorized_device(binding['device_ref'], PUBLIC_TOKENS[binding['owner_actor']])
                     if operation in AUTH_NEW_OPERATIONS else nullcontext())
            with guard:
                yield TrustedWalletContext(account, binding['device_ref'], eligible)

    def handoff_reference(self, device_ref):
        """Original signed handoff digest, not caller-supplied identity fields."""
        with closing(self.store._connect()) as db:
            row = db.execute('SELECT digest FROM events WHERE stream=? AND sequence=1 AND status=\'APPLIED\'',
                             ('device:' + device_ref,)).fetchone()
        if row is None:
            raise NotEligible('original signed device handoff is required')
        return row[0]

    def authorize_credential_origin(self, account_id, device_ref):
        """ATM actor checks the originating linked device, not its own UI scope."""
        with self._locked():
            binding = self._binding()
            if binding is None:
                return False
            token = PUBLIC_TOKENS[binding['owner_actor']]
            try:
                if self.store.account_for_device(device_ref, token) != account_id:
                    return False
                state = self.store.entitlement(account_id, token, device_ref=device_ref)
                return state['device_eligible'] is True
            except EntitlementError:
                return False

    def authorize_atm_device(self, account_id, device_ref):
        """Validate the ATM's out-of-band context against current linked ownership."""
        with self._locked():
            try:
                account, binding = self._account()
                if account != account_id or binding['device_ref'] != device_ref:
                    return False
                state = self.store.entitlement(account, PUBLIC_TOKENS[binding['owner_actor']], device_ref=device_ref)
                return state['device_eligible'] is True
            except EntitlementError:
                return False

    def _current_period(self):
        now = self.store._now()
        period = _period(now)[0]
        with self.store._transaction() as db:
            row = db.execute('SELECT maximum_period FROM device_runtime').fetchone()
            if row and period < row[0]:
                raise NotEligible('UTC month moved backwards; no new billing until clock reconciliation')
            if row is None or period > row[0]:
                db.execute('INSERT INTO device_runtime VALUES (1,?) ON CONFLICT(singleton) DO UPDATE SET maximum_period=excluded.maximum_period', (period,))
        return now, period

    def _billing_eligible(self):
        account, binding = self._account()
        state = self.store.contract_entitlement(account, PUBLIC_TOKENS[binding['owner_actor']])
        if not state['device_eligible'] or not state['auto_renew'] or not state['consent_id']:
            raise NotEligible('current device eligibility and explicit monthly consent required')
        if self.authentication is not None and not self.authentication.contract_ready(account, state['eligible_device_refs']):
            raise NotEligible('Wallet activation and current enrolled device are required for a new monthly debit')
        return account

    def _ensure_due(self, now, period, *, manual=False):
        account = self._billing_eligible()
        with self.store._transaction() as db:
            return self._ensure_due_in_db(db, account, now, period, manual=manual)

    def _funding_state(self):
        snapshot = self.wallet.snapshot()
        return snapshot['available_minor'], sum(sale['amount_minor'] for sale in snapshot['sales']
                                                if sale['status'] == 'SETTLED')

    def _ensure_due_in_db(self, db, account, now, period, *, manual=False):
        schedule_id = 'due-' + hashlib.sha256(canonical([account, period])).hexdigest()[:32]
        row = db.execute('SELECT * FROM device_monthly_due WHERE period=?', (period,)).fetchone()
        if row is None:
            if db.execute('SELECT COUNT(*) FROM device_monthly_due').fetchone()[0] >= 1200:
                raise Capacity('device monthly schedule capacity reached')
            db.execute("INSERT INTO device_monthly_due (period,schedule_id,account_id,status,generation,authorization_id,next_attempt,failures,last_error,updated_at) "
                       "VALUES (?,?,?,'due',0,NULL,?,0,NULL,?)", (period, schedule_id, account, now, now))
        elif row['account_id'] != account:
            raise Conflict('monthly schedule belongs to another account')
        elif row['status'] not in ('paid', 'processing'):
            if row['manual_retry_pending']:
                return schedule_id
            exhausted = bool(row['automatic_retry_exhausted']) or row['automatic_failures'] >= self.max_automatic_failures
            if exhausted and not manual:
                available, settled = self._funding_state()
                if (settled > row['last_failed_settled_minor'] and available > row['last_failed_available_minor']
                        and available >= 888):
                    # Current-period settled funding only. Pending sales, hold
                    # releases, new API keys and re-consent do not reset a cycle.
                    db.execute('UPDATE device_monthly_due SET automatic_failures=0,automatic_retry_exhausted=0 WHERE period=?', (period,))
                    exhausted = False
                else:
                    db.execute("UPDATE device_monthly_due SET status='blocked',automatic_retry_exhausted=1 WHERE period=?", (period,))
            if manual:
                # One explicit retry, coalesced across concurrent requests. The
                # automatic failure budget is never reset by an arbitrary key.
                db.execute("UPDATE device_monthly_due SET status='due',manual_retry_pending=1,next_attempt=?,updated_at=? WHERE period=?", (now, now, period))
            elif not exhausted and row['status'] == 'blocked':
                db.execute("UPDATE device_monthly_due SET status='due',next_attempt=?,updated_at=? WHERE period=?", (now, now, period))
        return schedule_id

    def _api_result(self, key, response):
        with self.store._transaction() as db:
            db.execute('UPDATE device_api_receipts SET response_json=? WHERE key=?', (canonical(response).decode(), key))
        return response

    def dispatch(self, request, *, peer_uid):
        self._peer(peer_uid)
        if not isinstance(request, dict) or type(request.get('v')) is not int or request.get('v') != 1:
            raise EntitlementError('protocol version 1 is required')
        op = request.get('op')
        if not isinstance(op, str):
            raise EntitlementError('valid operation is required')
        if op in READ_OPERATIONS:
            fields(request, ('v', 'op'))
            with self.snapshot_guard(peer_uid=peer_uid):
                return {'ok': True, 'result': self.membership() if op == 'wallet.membership' else self.billing_status()}
        if not isinstance(op, str) or op not in MUTATION_FIELDS:
            raise EntitlementError('unsupported device Wallet operation')
        fields(request, MUTATION_FIELDS[op])
        key = identifier(request['key'])
        if len(key) > 128 or len(canonical(request)) > 8192:
            raise EntitlementError('device Wallet request exceeds limits')
        with self._locked():
            with self.store._transaction() as db:
                old = db.execute('SELECT * FROM device_api_receipts WHERE key=?', (key,)).fetchone()
                encoded = canonical(request).decode()
                if op == 'wallet.register':
                    binding = self._binding()
                    origin = db.execute('SELECT device_ref FROM device_register_origins WHERE key=?', (key,)).fetchone()
                    if origin is None and old and binding is not None:
                        # Legacy receipts originated on the immutable primary
                        # device. Preserve both their exact body and response.
                        primary = db.execute('SELECT device_ref FROM device_binding').fetchone()
                        if primary is None:
                            raise Conflict('legacy registration origin requires explicit recovery')
                        origin = primary
                        db.execute('INSERT INTO device_register_origins VALUES (?,?)', (key, origin[0]))
                    if origin is not None and (binding is None or origin[0] != binding['device_ref']):
                        raise Conflict('registration key belongs to another device')
                if old:
                    if old['request_json'] != encoded:
                        raise Conflict('device API key reused for a different request')
                    if old['response_json'] is not None:
                        return json.loads(old['response_json'])
                else:
                    if db.execute('SELECT COUNT(*) FROM device_api_receipts').fetchone()[0] >= 10000:
                        raise Capacity('device API receipt capacity reached')
                    db.execute('INSERT INTO device_api_receipts VALUES (?,?,NULL,?)', (key, encoded, self.store._now()))
                    if op == 'wallet.register' and binding is not None:
                        db.execute('INSERT INTO device_register_origins VALUES (?,?)', (key, binding['device_ref']))
            operation_key = 'device-api-' + hashlib.sha256(key.encode()).hexdigest()
            try:
                if op == 'wallet.register':
                    binding = self._binding()
                    if binding is None:
                        raise NotEligible('purchased-device handoff evidence is required')
                    result = self.store.register(binding['device_ref'], operation_key, PUBLIC_TOKENS[binding['owner_actor']])
                    WalletBridge(self.store, self.wallet, result['account_id'], PUBLIC_TOKENS['wallet'])
                elif op == 'wallet.consent':
                    account, binding = self._account()
                    result = self.store.consent(account, request['accepted'], request['terms_version'], operation_key, PUBLIC_TOKENS[binding['owner_actor']])
                    if request['accepted'] is False:
                        with self.store._transaction() as db:
                            # Processing/unknown claims must still be reconciled;
                            # Bridge itself forbids a fresh debit after cancellation.
                            db.execute("UPDATE device_monthly_due SET status='blocked',manual_retry_pending=0,last_error='consent canceled',updated_at=? WHERE status IN ('due','retry_wait')", (self.store._now(),))
                else:
                    now, period = self._current_period()
                    if request['period'] != period:
                        raise NotEligible('wallet.bill accepts only the current UTC month')
                    account = self._billing_eligible()
                    # Due insertion and immutable acceptance are one transaction:
                    # no schedule can survive an uncommitted acceptance result.
                    with self.store._transaction() as db:
                        schedule_id = self._ensure_due_in_db(db, account, now, period, manual=True)
                        result = {'accepted': True, 'operation': key, 'period': period,
                                  'schedule_id': schedule_id, 'simulation_only': True,
                                  'meaning': 'scheduled; inspect wallet.billing.status for actual result'}
                        response = {'ok': True, 'result': result}
                        db.execute('UPDATE device_api_receipts SET response_json=? WHERE key=?', (canonical(response).decode(), key))
                    self._wake.set()
                    return response
                response = {'ok': True, 'result': result}
            except EntitlementError as exc:
                response = {'ok': False, 'code': 'rejected', 'error': str(exc)[:300], 'retry_with_new_key': True}
            # If storage/Wallet raised an unknown I/O error, keep this request
            # pending. The socket returns unavailable; same-key replay reconciles
            # backend receipts instead of converting uncertainty into failure.
            response = self._api_result(key, response)
        self._wake.set()
        return response

    def _finish_failed_attempt(self, row, grant, now, current):
        """Account for a definitive applied failure once, including crash recovery."""
        if grant['state'] != 'FAILED':
            raise OSError('monthly payment outcome remains unresolved')
        available, settled = self._funding_state()
        try:
            self._billing_eligible()
            eligible = row['period'] == current
        except NotEligible:
            eligible = False
        with self.store._transaction() as db:
            stored = db.execute('SELECT * FROM device_monthly_due WHERE period=?', (row['period'],)).fetchone()
            count = stored['automatic_failures']
            last = stored['last_failed_attempt']
            if grant['attempt'] > last:
                count += 1
                db.execute('UPDATE device_monthly_due SET automatic_failures=?,last_failed_attempt=?, '
                           'last_failed_settled_minor=?,last_failed_available_minor=? WHERE period=?',
                           (count, grant['attempt'], settled, available, row['period']))
            exhausted = count >= self.max_automatic_failures
            status = 'blocked' if exhausted or not eligible else 'retry_wait'
            error = ('automatic payment retries exhausted; explicit retry or newly settled funding required'
                     if exhausted else 'Wallet did not confirm this monthly payment')
            db.execute('UPDATE device_monthly_due SET status=?,automatic_retry_exhausted=?,manual_retry_pending=0, '
                       'next_attempt=?,last_error=?,updated_at=? WHERE period=?',
                       (status, int(exhausted), now+self.retry_seconds, error, now, row['period']))

    def tick(self):
        """Perform at most one durable due/claim/execute cycle; test clock injectable."""
        with self._locked():
            now, current = self._current_period()
            try:
                self._ensure_due(now, current)
            except NotEligible:
                pass
            with self.store._transaction() as db:
                row = db.execute("SELECT * FROM device_monthly_due WHERE next_attempt<=? AND "
                                 "(status IN ('due','processing','retry_wait') OR (status='blocked' AND authorization_id IN "
                                 "(SELECT authorization_id FROM authorizations WHERE state IN ('CLAIMED','PAID')))) "
                                 "ORDER BY period LIMIT 1", (now,)).fetchone()
                if row is None:
                    return False
                row = dict(row)
                if row['status'] != 'processing':
                    known = db.execute('SELECT state FROM authorizations WHERE authorization_id=?', (row['authorization_id'],)).fetchone()
                    reconciliation = known is not None and known['state'] in ('CLAIMED', 'PAID')
                    if (not reconciliation and not row['manual_retry_pending']
                            and row['automatic_failures'] >= self.max_automatic_failures):
                        db.execute("UPDATE device_monthly_due SET status='blocked',automatic_retry_exhausted=1,updated_at=? WHERE period=?", (now, row['period']))
                        return True
                    row['generation'] += 1
                    db.execute("UPDATE device_monthly_due SET status='processing',manual_retry_pending=0,generation=?,updated_at=? WHERE period=?", (row['generation'], now, row['period']))
            base_key = f"device-month-{row['period']}-{row['generation']}"
            try:
                if row['authorization_id'] is None:
                    self._billing_eligible()
                    grant = self.store.authorize_month(row['account_id'], row['period'], base_key+'-authorize', PUBLIC_TOKENS['wallet'])
                else:
                    existing = self.store.authorization(row['authorization_id'], PUBLIC_TOKENS['wallet'])
                    if existing['state'] == 'FAILED' and existing['attempt'] > row['last_failed_attempt']:
                        # The bridge committed a failed attempt but updating the
                        # schedule failed. Count it before permitting another.
                        self._finish_failed_attempt(row, existing, now, current)
                        return True
                    if existing['state'] in ('CLAIMED', 'PAID'):
                        grant = existing
                    else:
                        self._billing_eligible()
                        grant = self.store.authorize_month(row['account_id'], row['period'], base_key+'-authorize', PUBLIC_TOKENS['wallet'])
                with self.store._transaction() as db:
                    db.execute('UPDATE device_monthly_due SET authorization_id=? WHERE period=?', (grant['authorization_id'], row['period']))
                grant = self.store.claim_authorization(grant['authorization_id'], base_key+'-claim', PUBLIC_TOKENS['wallet'])
                result = WalletBridge(self.store, self.wallet, row['account_id'], PUBLIC_TOKENS['wallet']).execute(grant['authorization_id'], base_key+'-execute', PUBLIC_TOKENS['wallet'])
                if result['authorization']['state'] == 'PAID':
                    with self.store._transaction() as db:
                        db.execute("UPDATE device_monthly_due SET status='paid',automatic_retry_exhausted=0,manual_retry_pending=0,next_attempt=?,last_error=NULL,updated_at=? WHERE period=?", (now, now, row['period']))
                else:
                    self._finish_failed_attempt(row, result['authorization'], now, current)
            except EntitlementError as exc:
                with self.store._transaction() as db:
                    known = db.execute('SELECT state FROM authorizations WHERE authorization_id=(SELECT authorization_id FROM device_monthly_due WHERE period=?)', (row['period'],)).fetchone()
                    status = 'processing' if known is not None and known['state'] in ('CLAIMED', 'PAID') else 'blocked'
                    db.execute('UPDATE device_monthly_due SET status=?,next_attempt=?,last_error=?,updated_at=? WHERE period=?',
                               (status, now+self.retry_seconds, str(exc)[:300], now, row['period']))
            except (sqlite3.Error, OSError) as exc:
                with self.store._transaction() as db:
                    db.execute('UPDATE device_monthly_due SET failures=failures+1,next_attempt=?,last_error=?,updated_at=? WHERE period=?', (now+self.retry_seconds, f'unknown outcome; retry same claim: {type(exc).__name__}', now, row['period']))
                raise
            return True

    def billing_status(self):
        with closing(self.store._connect()) as db:
            rows = [dict(row) for row in db.execute('SELECT * FROM device_monthly_due ORDER BY period DESC LIMIT 12')]
            pending = db.execute('SELECT COUNT(*) FROM device_api_receipts WHERE response_json IS NULL').fetchone()[0]
        for row in rows:
            for field in ('automatic_retry_exhausted', 'manual_retry_pending'):
                row[field] = bool(row[field])
        return {'simulation_only': True, 'backend_connected': False, 'monthly_fee_minor': 888,
                'currency': 'USD', 'period_basis': 'UTC calendar month', 'history': rows,
                'retry_policy': {'kind': 'sandbox-bounded-payment-failures-v1',
                    'max_automatic_failures': self.max_automatic_failures, 'retry_seconds': self.retry_seconds,
                    'counted_failure': 'each distinct applied FAILED attempt; manual failures do not replenish the cycle',
                    'unknown_outcome': 'same-claim reconciliation; no failure-count limit',
                    'manual_retry': 'one explicit attempt; automatic budget unchanged',
                    'funded_recovery': 'current period; newly settled sales and increased AVAILABLE of at least 888 cents'},
                'pending_api_receipts': pending, 'worker_alive': self.thread is not None and self.thread.is_alive(),
                'worker_error': self._worker_error, 'worker_failures': self._worker_failures,
                'retry_at_unix': self._retry_at}

    def start(self):
        with self._thread_lock:
            if self._stop.is_set():
                raise EntitlementError('device Wallet scheduler is closed')
            if self.thread is None or not self.thread.is_alive():
                self.thread = threading.Thread(target=self._loop, name='rock-monthly-billing', daemon=True)
                self.thread.start()
            self._wake.set()

    def _loop(self):
        while not self._stop.is_set():
            self._wake.wait(self.poll_seconds)
            self._wake.clear()
            if self._stop.is_set():
                break
            try:
                self.tick()
                self._worker_error, self._worker_failures, self._retry_at = None, 0, None
            except Exception as exc:
                self._worker_failures += 1
                delay = min(30, self.poll_seconds * 2**min(self._worker_failures-1, 10))
                self._worker_error = f'{type(exc).__name__}: {exc}'[:300]
                self._retry_at = time.time()+delay
                if self._stop.wait(delay):
                    break

    def close(self):
        with self._thread_lock:
            self._stop.set()
            self._wake.set()
            thread = self.thread
        if thread is not None and thread is not threading.current_thread():
            thread.join(timeout=15)

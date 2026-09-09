"""OS proxy to one remote Wallet authority; only receipts and read-only cache local.

Public fixture TLS/authentication is for owned development environments only.
An uncertain operation is retained with its exact key and payload across restart.
No local Wallet is created, and no balance/hold is changed from a cached snapshot.
"""
from contextlib import closing
import fcntl
import hashlib
import http.client
import json
import os
from pathlib import Path
import sqlite3
import ssl
import stat
import threading
import time
import uuid
from urllib.parse import urlsplit

from blackberryrock.packages import canonical
from entitlement.device import DeviceWalletAdapter
from entitlement.protocol import identifier
from registry.common import safe_directory
from runner.transport import DeadlineConnection

MAX_REQUEST = 65536
MAX_RESPONSE = 1024 * 1024
READS = frozenset(('snapshot', 'health', 'wallet.membership', 'wallet.billing.status',
                  'wallet.atm.status', 'wallet.atm.history', 'wallet.auth.status'))
WRITES = frozenset(('wallet.register', 'wallet.consent', 'wallet.bill', 'wallet.atm.issue',
                   'wallet.atm.cancel', 'wallet.atm.expire', 'wallet.atm.timeout',
                   'wallet.auth.begin', 'wallet.auth.enroll', 'wallet.terms',
                   'wallet.atm.quote', 'wallet.atm.quote.cancel'))


FIELDS = {op: {'v', 'op'} for op in ('snapshot','health','wallet.membership','wallet.billing.status')}
FIELDS.update({
    'wallet.auth.status': {'v','op'},
    'wallet.auth.begin': {'v','op','key'},
    'wallet.auth.enroll': {'v','op','key','challenge_id','credential'},
    'wallet.terms': {'v','op','key','accepted','terms_version'},
    'wallet.atm.quote': {'v','op','key','issue_key','amount_minor','atm_id'},
    'wallet.atm.quote.cancel': {'v','op','key','quote_id'},
    'wallet.register': {'v','op','key'},
    'wallet.consent': {'v','op','key','accepted','terms_version'},
    'wallet.bill': {'v','op','key','period'},
    'wallet.atm.issue': {'v','op','key','amount_minor','atm_id'},
    'wallet.atm.status': {'v','op','withdrawal_id'},
    'wallet.atm.history': {'v','op','limit'},
    **{op: {'v','op','key','withdrawal_id'} for op in ('wallet.atm.cancel','wallet.atm.expire','wallet.atm.timeout')},
})
AUTH_ISSUE_FIELDS = {'v', 'op', 'key', 'quote_id', 'credential'}


def read_protected(path, limit, *, private=False):
    descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(descriptor, 'rb') as stream:
        info = os.fstat(stream.fileno())
        if (not stat.S_ISREG(info.st_mode) or info.st_uid not in (0, os.geteuid())
                or info.st_mode & 0o022 or info.st_size > limit
                or private and (info.st_uid != os.geteuid() or stat.S_IMODE(info.st_mode) != 0o600 or info.st_nlink != 1)):
            raise ValueError('Wallet configuration must be a protected bounded regular file')
        result = stream.read(limit + 1)
    if len(result) > limit:
        raise ValueError('Wallet configuration exceeds limit')
    return result


class BackendUnavailable(OSError):
    """Outcome may be unknown; preserve the exact request for reconciliation."""


class NotSent(BackendUnavailable):
    """Connection failed before starting the HTTP request; no request bytes sent."""


def decode(raw):
    def pairs(items):
        result = {}
        for name, value in items:
            if name in result:
                raise ValueError('duplicate backend JSON field')
            result[name] = value
        return result
    return json.loads(raw, object_pairs_hook=pairs,
                      parse_constant=lambda _: (_ for _ in ()).throw(ValueError('non-finite JSON')))


class HTTPSWalletTransport:
    def __init__(self, origin, ca_file, token_file, *, authority_id, timeout=1.0, device_ref=None, protocol_version=None):
        try:
            u = urlsplit(origin)
            port = u.port or 443
        except (ValueError, TypeError) as exc:
            raise ValueError('invalid fixed Wallet origin') from exc
        if (u.scheme != 'https' or u.hostname not in ('127.0.0.1', 'localhost', '10.0.2.2')
                or u.username or u.password or u.path not in ('', '/') or u.query or u.fragment):
            raise ValueError('Wallet origin must be a fixed owned development HTTPS endpoint')
        if type(timeout) not in (int, float) or not 0.05 <= timeout <= 3:
            raise ValueError('invalid bounded Wallet timeout')
        if not isinstance(authority_id, str) or str(uuid.UUID(authority_id)) != authority_id:
            raise ValueError('explicit canonical Wallet authority UUID is required')
        self.authority_id = authority_id
        self.device_ref = identifier(device_ref, fixture=True) if device_ref is not None else None
        if protocol_version is not None and (type(protocol_version) is not int or protocol_version != 3 or self.device_ref is None):
            raise ValueError('owner routing requires explicit version 3 and a fixed purchased device')
        self.protocol_version = 3 if protocol_version == 3 else (2 if self.device_ref is not None else 1)
        self.endpoint = '/v'+str(self.protocol_version)+'/wallet'
        token = read_protected(token_file, 256, private=self.protocol_version == 3).decode('ascii').strip()
        if not 16 <= len(token) <= 240 or any(ord(x) < 33 or ord(x) > 126 for x in token):
            raise ValueError('invalid protected Wallet token file')
        ca = read_protected(ca_file, 65536)
        self.host, self.port, self.timeout = u.hostname, port, timeout
        self.origin, self.token = f'https://{u.hostname}:{port}', token
        identity = [self.origin, authority_id, hashlib.sha256(ca).hexdigest(), hashlib.sha256(token.encode()).hexdigest()]
        if self.device_ref is not None:
            identity.extend(['owner-routed/3' if self.protocol_version == 3 else 'device-bound/2', self.device_ref])
        self.fingerprint = hashlib.sha256(canonical(identity)).hexdigest()
        self.context = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
        self.context.minimum_version = ssl.TLSVersion.TLSv1_2
        self.context.load_verify_locations(cadata=ca.decode('ascii'))
        self.context.check_hostname = True
        self.context.verify_mode = ssl.CERT_REQUIRED

    def exchange(self, request):
        raw = canonical(request)
        if not 1 <= len(raw) <= MAX_REQUEST:
            raise ValueError('Wallet request exceeds limit')
        connection = http.client.HTTPSConnection(self.host, self.port, context=self.context, timeout=self.timeout)
        wrapped, started = None, False
        deadline = time.monotonic() + self.timeout
        try:
            connection.connect()
            wrapped = DeadlineConnection(connection.sock, max(.001, deadline-time.monotonic()))
            connection.sock = wrapped
            started = True
            headers = {'Authorization': 'Bearer '+self.token, 'X-Rock-Wallet-Authority': self.authority_id,
                       'Content-Type': 'application/json', 'Connection': 'close'}
            if self.device_ref is not None:
                headers['X-Rock-Wallet-Device'] = self.device_ref
            connection.request('POST', self.endpoint, raw, headers=headers)
            response = connection.getresponse()
            authorities = response.headers.get_all('X-Rock-Wallet-Authority', [])
            devices = response.headers.get_all('X-Rock-Wallet-Device', [])
            # A v3 gateway cannot disclose a request-local contract before
            # authentication. Its verified TLS endpoint may deny all access
            # without either identity header; this never acknowledges a write.
            unbound_denial = (self.protocol_version == 3 and response.status in (401, 403)
                              and authorities == [] and devices == [])
            if not unbound_denial and authorities != [self.authority_id]:
                raise BackendUnavailable('Wallet authority identity mismatch')
            if (self.device_ref is not None and response.status == 200 and
                    devices != [self.device_ref]):
                raise BackendUnavailable('Wallet device acknowledgement mismatch')
            if self.protocol_version == 3 and not unbound_denial and devices != [self.device_ref]:
                raise BackendUnavailable('Wallet device acknowledgement mismatch')
            lengths = response.headers.get_all('Content-Length', [])
            if (len(lengths) != 1 or not lengths[0].isascii() or not lengths[0].isdigit()
                    or response.headers.get('Transfer-Encoding') is not None):
                raise BackendUnavailable('ambiguous Wallet response length')
            count = int(lengths[0])
            if not 1 <= count <= MAX_RESPONSE:
                raise BackendUnavailable('Wallet response exceeds limit')
            chunks = []
            while count:
                part = response.read1(min(count, 65536))
                if not part:
                    raise BackendUnavailable('incomplete Wallet acknowledgement')
                chunks.append(part)
                count -= len(part)
            result = decode(b''.join(chunks))
            if not isinstance(result, dict) or type(result.get('ok')) is not bool:
                raise BackendUnavailable('malformed Wallet response')
            if unbound_denial and not (set(result) == {'ok', 'code', 'error'} and result['ok'] is False
                                       and result['code'] == 'unauthorized' and type(result['error']) is str
                                       and 1 <= len(result['error']) <= 300):
                raise BackendUnavailable('unbound Wallet response is not a strict authentication denial')
            if response.status in (400, 401, 403, 409, 422) and result.get('ok') is False and result.get('code') in ('rejected', 'unauthorized'):
                return result
            if response.status != 200:
                raise BackendUnavailable('Wallet HTTP result unknown; exact request retained')
            return result
        except (OSError, ValueError, http.client.HTTPException) as exc:
            if not started:
                raise NotSent('Wallet connection unavailable; request was not sent') from exc
            raise BackendUnavailable('Wallet response unavailable; reconcile with the same key') from exc
        finally:
            connection.close()
            if wrapped:
                wrapped.stream.close()


def validate_reply(request, reply):
    """Reject malformed/misattributed acknowledgements without closing uncertainty."""
    def require(condition):
        if not condition:
            raise BackendUnavailable('Wallet acknowledgement did not match the request')
    require(isinstance(reply, dict) and type(reply.get('ok')) is bool)
    if not reply['ok']:
        require(reply.get('code') in ('rejected', 'unauthorized') and isinstance(reply.get('error'), str))
        return reply
    result = reply.get('result')
    require(isinstance(result, dict) and result.get('simulation_only') is True)
    op = request['op']
    if op in ('wallet.auth.status', 'wallet.auth.enroll', 'wallet.terms'):
        require(result.get('activation_state') in ('CREDENTIAL_REQUIRED', 'TERMS_REQUIRED', 'ACTIVE') and
                type(result.get('active')) is bool and
                result['active'] == (result['activation_state'] == 'ACTIVE') and
                type(result.get('wallet_terms_accepted')) is bool and
                result.get('wallet_terms_version') == 'rock-wallet-development/1' and
                result.get('hardware_backed') is False)
        if op == 'wallet.auth.enroll':
            require(result.get('challenge_id') == request['challenge_id'] and
                    result.get('credential_id') == request['credential'].get('id'))
        if op == 'wallet.terms':
            require(result['wallet_terms_accepted'] is request['accepted'] and
                    result['wallet_terms_version'] == request['terms_version'])
    elif op in ('wallet.auth.begin', 'wallet.atm.quote'):
        from wallet_auth.protocol import RP_ID, b64decode
        options = result.get('options')
        require(isinstance(options, dict) and options.get('schema_version') == 1 and
                isinstance(options.get('device_ref'), str) and isinstance(options.get('publicKey'), dict) and
                options.get('purpose') == ('wallet.enroll' if op == 'wallet.auth.begin' else 'wallet.atm.issue') and
                type(result.get('expires_at')) in (int, float))
        public = options['publicKey']
        try:
            b64decode(public.get('challenge'), 32, 32)
        except ValueError as exc:
            raise BackendUnavailable('invalid Wallet authentication challenge') from exc
        if op == 'wallet.auth.begin':
            require(isinstance(result.get('challenge_id'), str) and
                    isinstance(public.get('rp'), dict) and public['rp'].get('id') == RP_ID)
        else:
            quote = result.get('quote')
            require(isinstance(quote, dict) and isinstance(result.get('quote_id'), str) and
                    quote.get('quote_id') == result['quote_id'] and
                    quote.get('issue_key') == request['issue_key'] and
                    type(quote.get('amount_minor')) is int and quote['amount_minor'] == request['amount_minor'] and
                    quote.get('atm_id') == request['atm_id'] and quote.get('currency') == 'USD' and
                    type(quote.get('fee_minor')) is int and quote['fee_minor'] == 0 and
                    quote.get('total_debit_minor') == quote['amount_minor'] and
                    quote.get('cash_received_minor') == quote['amount_minor'] and
                    quote.get('expires_at') == result['expires_at'] and public.get('rpId') == RP_ID)
    elif op == 'wallet.atm.quote.cancel':
        require(result.get('quote_id') == request['quote_id'] and result.get('state') == 'CANCELED' and
                result.get('funds_reserved') is False)
    elif op == 'wallet.register':
        require(isinstance(result.get('account_id'), str) and bool(result['account_id']) and
                isinstance(result.get('device_ref'), str) and result['device_ref'].startswith('fixture-') and
                result.get('identity_inherited') is True)
    elif op == 'wallet.consent':
        require(type(result.get('accepted')) is bool and result['accepted'] == request['accepted'] and
                result.get('terms_version') == request['terms_version'] and
                type(result.get('amount_minor')) is int and result['amount_minor'] == 888 and
                result.get('currency') == 'USD' and isinstance(result.get('consent_id'), str) and
                isinstance(result.get('account_id'), str))
    elif op == 'wallet.bill':
        require(result.get('accepted') is True and result.get('period') == request['period'] and
                result.get('operation') == request['key'] and isinstance(result.get('schedule_id'), str))
    elif op == 'wallet.atm.history':
        require(isinstance(result.get('items'), list))
    else:
        identity = result.get('withdrawal_id')
        try:
            valid = isinstance(identity, str) and str(uuid.UUID(identity)) == identity
        except (ValueError, AttributeError):
            valid = False
        require(valid)
        if op == 'wallet.atm.issue':
            require(type(result.get('amount_minor')) is int and result.get('currency') == 'USD' and
                    result.get('receipt_kind') == 'immutable_issuance' and isinstance(result.get('code'), str))
            if 'quote_id' in request:
                require(result.get('quote_id') == request['quote_id'] and
                        result.get('authentication') == 'verified_software_test_assertion' and
                        isinstance(result.get('approval_id'), str) and
                        type(result.get('fee_minor')) is int and result['fee_minor'] == 0 and
                        result.get('total_debit_minor') == result['amount_minor'] and
                        result.get('cash_received_minor') == result['amount_minor'])
            else:
                require(result['amount_minor'] == request['amount_minor'] and result.get('atm_id') == request['atm_id'])
        else:
            require(identity == request['withdrawal_id'] and isinstance(result.get('state'), str))
    return reply


def validate_snapshot(snapshot):
    if (not isinstance(snapshot, dict) or snapshot.get('simulation_only') is not True or
            not isinstance(snapshot.get('membership'), dict) or not isinstance(snapshot.get('billing'), dict) or
            any(type(snapshot.get(field)) is not int or snapshot[field] < 0
                for field in ('available_minor', 'held_minor', 'billed_minor')) or
            type(snapshot.get('ledger_balance_minor')) is not int or snapshot['ledger_balance_minor'] != 0):
        raise BackendUnavailable('invalid Wallet snapshot; previous synchronized cache retained')
    return snapshot


def check_private_file(path):
    descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        info = os.fstat(descriptor)
        if (not stat.S_ISREG(info.st_mode) or info.st_uid != os.geteuid() or
                info.st_mode & 0o077 or info.st_nlink != 1):
            raise ValueError('Wallet cache files must be private owned single-link regular files')
    finally:
        os.close(descriptor)


class RemoteWalletService:
    def __init__(self, state_dir, transport, *, clock=time.time):
        self.root = safe_directory(state_dir)
        if self.root.stat().st_mode & 0o077:
            raise ValueError('Wallet cache directory must be private mode 0700')
        self.transport, self.clock = transport, clock
        self.mutex = threading.RLock()
        self.closed = False
        self.path = self.root / 'remote-cache.db'
        descriptor = os.open(self.path, os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
        os.close(descriptor)
        for name in ('remote-cache.db', 'remote-cache.db-wal', 'remote-cache.db-shm'):
            path = self.root/name
            if path.exists() or path.is_symlink():
                check_private_file(path)
        descriptor = os.open(self.root/'remote-instance.lock', os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
        self.lockfile = os.fdopen(descriptor, 'a+b')
        try:
            check_private_file(self.root/'remote-instance.lock')
            fcntl.flock(self.lockfile.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            with closing(self._db()) as db:
                db.executescript('''
                    PRAGMA journal_mode=WAL;
                    CREATE TABLE IF NOT EXISTS identity(singleton INTEGER PRIMARY KEY CHECK(singleton=1), fingerprint TEXT NOT NULL);
                    CREATE TABLE IF NOT EXISTS requests(key TEXT PRIMARY KEY, payload TEXT NOT NULL, response TEXT);
                    CREATE TABLE IF NOT EXISTS snapshot(singleton INTEGER PRIMARY KEY CHECK(singleton=1), payload TEXT NOT NULL, received_at REAL NOT NULL);
                    CREATE TRIGGER IF NOT EXISTS request_body_immutable BEFORE UPDATE OF key,payload ON requests
                      BEGIN SELECT RAISE(ABORT,'remote request immutable'); END;
                    CREATE TRIGGER IF NOT EXISTS receipt_immutable BEFORE UPDATE OF response ON requests WHEN OLD.response IS NOT NULL
                      BEGIN SELECT RAISE(ABORT,'remote receipt immutable'); END;
                ''')
                old = db.execute('SELECT fingerprint FROM identity').fetchone()
                if old and old[0] != transport.fingerprint:
                    raise ValueError('Wallet authority changed; explicit recovery required')
                columns = {row[1] for row in db.execute('PRAGMA table_info(identity)')}
                if 'access_denied' not in columns:
                    db.execute('ALTER TABLE identity ADD COLUMN access_denied INTEGER NOT NULL DEFAULT 0')
                if not old:
                    db.execute('INSERT INTO identity(singleton,fingerprint) VALUES(1,?)', (transport.fingerprint,))
        except BaseException:
            self.lockfile.close()
            raise

    def _db(self):
        db = sqlite3.connect(self.path, isolation_level=None, timeout=5)
        db.row_factory = sqlite3.Row
        db.execute('PRAGMA synchronous=FULL')
        return db

    def close(self):
        with self.mutex:
            self.closed = True
            self.lockfile.close()

    def _pending(self):
        with closing(self._db()) as db:
            rows = db.execute('SELECT key,payload FROM requests WHERE response IS NULL').fetchall()
        if len(rows) > 1:
            raise BackendUnavailable('conflicting pending Wallet operations require recovery')
        return dict(rows[0]) if rows else None

    def _complete(self, request, response):
        self._check_access(response)
        validate_reply(request, response)
        self._validate_auth_scope(request, response)
        if response['ok']:
            self._confirm_access()
        with closing(self._db()) as db:
            db.execute('UPDATE requests SET response=? WHERE key=? AND response IS NULL',
                       (canonical(response).decode(), request['key']))
        return response

    def _validate_auth_scope(self, request, response):
        """An issuance acknowledgement must match this device's saved quote."""
        if not response.get('ok'):
            return
        result = response.get('result', {})
        options = result.get('options')
        device = getattr(self.transport, 'device_ref', None)
        if options is not None and device is not None and options.get('device_ref') != device:
            raise BackendUnavailable('Wallet authentication ceremony belongs to another device')
        if request['op'] != 'wallet.atm.issue' or 'quote_id' not in request:
            return
        found = []
        with closing(self._db()) as db:
            for row in db.execute('SELECT payload,response FROM requests WHERE response IS NOT NULL'):
                prior = decode(row['payload'])
                if prior.get('op') != 'wallet.atm.quote' or prior.get('issue_key') != request['key']:
                    continue
                receipt = decode(row['response'])
                quote = receipt.get('result', {}).get('quote', {}) if receipt.get('ok') else {}
                if quote.get('quote_id') == request['quote_id']:
                    found.append(quote)
        if len(found) != 1 or any(result.get(field) != found[0].get(field)
                for field in ('amount_minor', 'fee_minor', 'total_debit_minor', 'cash_received_minor', 'atm_id', 'currency')):
            raise BackendUnavailable('Wallet issuance does not match the saved confirmed quote')

    def _check_access(self, response):
        if (getattr(self.transport, 'device_ref', None) is not None and
                isinstance(response, dict) and response.get('ok') is False and
                response.get('code') == 'unauthorized'):
            # A revoked credential says nothing about a previous operation's
            # financial outcome. Retain pending requests and immutable receipts.
            with closing(self._db()) as db:
                db.execute('UPDATE identity SET access_denied=1 WHERE singleton=1')
            raise PermissionError('current purchased-device access is required; retained receipts need authorized recovery')
        return response

    def _confirm_access(self):
        """Clear a denial only after the complete authorized reply was validated."""
        if getattr(self.transport, 'device_ref', None) is not None:
            with closing(self._db()) as db:
                db.execute('UPDATE identity SET access_denied=0 WHERE singleton=1')

    def _reconcile(self):
        pending = self._pending()
        if pending:
            request = decode(pending['payload'])
            self._complete(request, self.transport.exchange(request))

    def _snapshot(self):
        connected, fresh = False, False
        try:
            # Only a previously admitted exact request is retried. A different
            # charge, consent or withdrawal is never invented during reconnect.
            self._reconcile()
            reply = self.transport.exchange({'v':1, 'op':'snapshot'})
            self._check_access(reply)
            if not isinstance(reply, dict) or reply.get('ok') is not True or not isinstance(reply.get('snapshot'), dict):
                raise BackendUnavailable('Wallet snapshot unavailable')
            snapshot = validate_snapshot(reply['snapshot'])
            if snapshot.get('service_access') is not None:
                from service_access.status import validate
                try:
                    snapshot['service_access'] = validate(snapshot['service_access'],
                        authority_id=self.transport.authority_id,
                        device_ref=getattr(self.transport, 'device_ref', None))
                except (ValueError, TypeError, KeyError):
                    raise BackendUnavailable('invalid purchaser service status; synchronized cache retained') from None
            self._confirm_access()
            with closing(self._db()) as db:
                db.execute('INSERT INTO snapshot VALUES(1,?,?) ON CONFLICT(singleton) DO UPDATE SET payload=excluded.payload,received_at=excluded.received_at',
                           (canonical(snapshot).decode(), self.clock()))
            connected, fresh = True, True
        except BackendUnavailable:
            pass
        with closing(self._db()) as db:
            if db.execute('SELECT access_denied FROM identity WHERE singleton=1').fetchone()[0]:
                raise PermissionError('device access was denied; a fresh authorized response is required')
            cached = db.execute('SELECT * FROM snapshot').fetchone()
        if cached is None:
            raise BackendUnavailable('Wallet backend unavailable and no synchronized snapshot exists')
        snapshot = decode(cached['payload'])
        status = {'authority':'remote_development_backend', 'connected':connected, 'stale':not fresh,
                  'last_sync_unix':cached['received_at'], 'pending_reconciliation':bool(self._pending()),
                  'cache_is_spendable':False, 'simulation_only':True}
        snapshot['backend'] = status
        snapshot['membership']['backend_connected'] = connected
        snapshot['billing']['backend_connected'] = connected
        return {'ok':True, 'snapshot':snapshot}

    def dispatch(self, request, *, peer_uid=None):
        DeviceWalletAdapter._peer(peer_uid)
        if (not isinstance(request, dict) or type(request.get('v')) is not int or request['v'] != 1
                or not isinstance(request.get('op'), str) or len(canonical(request)) > MAX_REQUEST):
            raise ValueError('invalid bounded Wallet request')
        op = request['op']
        if op not in READS | WRITES:
            raise PermissionError('operation is not available to a remote Wallet owner')
        if set(request) != FIELDS[op] and not (op == 'wallet.atm.issue' and set(request) == AUTH_ISSUE_FIELDS):
            raise ValueError('unexpected Wallet request fields')
        with self.mutex:
            if self.closed:
                raise BackendUnavailable('Wallet proxy is closed')
            if op in ('snapshot', 'health', 'wallet.membership', 'wallet.billing.status'):
                if set(request) != {'v','op'}:
                    raise ValueError('unexpected Wallet read fields')
                if op == 'health':
                    return {'ok':True, 'result':{'ready':True, 'simulation_only':True, 'authority':'remote_development_backend'}}
                reply = self._snapshot()
                if op == 'snapshot':
                    return reply
                return {'ok':True, 'result':reply['snapshot']['membership' if op == 'wallet.membership' else 'billing']}
            if op in READS:
                # Historical cache is not used to decide live ATM state.
                reply = validate_reply(request, self._check_access(self.transport.exchange(request)))
                if reply['ok']:
                    self._confirm_access()
                return reply
            key = request.get('key')
            if not isinstance(key, str) or not 1 <= len(key) <= 128:
                raise ValueError('Wallet mutation requires a bounded durable key')
            payload = canonical(request).decode()
            with closing(self._db()) as db:
                old = db.execute('SELECT * FROM requests WHERE key=?', (key,)).fetchone()
                if old:
                    if old['payload'] != payload:
                        raise ValueError('Wallet key reused for another request')
                    if old['response'] is not None:
                        if getattr(self.transport, 'device_ref', None) is not None:
                            # Bound devices must still be admitted by the
                            # authority before replaying a completed operation.
                            replay = self._check_access(self.transport.exchange(request))
                            validate_reply(request, replay)
                            self._validate_auth_scope(request, replay)
                            if canonical(replay).decode() != old['response']:
                                raise BackendUnavailable('replayed Wallet receipt changed; explicit recovery required')
                            if replay['ok']:
                                self._confirm_access()
                        return decode(old['response'])
                else:
                    if self._pending():
                        raise BackendUnavailable('an earlier Wallet operation awaits reconciliation')
                    if db.execute('SELECT COUNT(*) FROM requests').fetchone()[0] >= 10000:
                        raise ValueError('Wallet receipt capacity reached')
                    db.execute('INSERT INTO requests VALUES(?,?,NULL)', (key,payload))
            try:
                result = self.transport.exchange(request)
            except NotSent:
                if old is None:
                    # A provably unsent fresh request is not accepted/queued.
                    with closing(self._db()) as db:
                        db.execute('DELETE FROM requests WHERE key=? AND response IS NULL', (key,))
                raise
            return self._complete(request, result)


def configured_service(config_file, wallet_state):
    """Explicit new-device opt-in only; never silently migrate/clone a local ledger."""
    raw_config = read_protected(config_file, 8192)
    config = decode(raw_config)
    base_fields = {'schema_version','mode','origin','ca_file','token_file','authority_id'}
    version = config.get('schema_version') if isinstance(config, dict) else None
    expected = base_fields | ({'device_ref'} if version in (2, 3) else set())
    if (not isinstance(config, dict) or type(version) is not int or version not in (1, 2, 3)
            or set(config) != expected or config['mode'] != 'development-remote-authority'):
        raise ValueError('invalid protected remote Wallet configuration')
    options = {'device_ref': identifier(config['device_ref'], fixture=True)} if version in (2, 3) else {}
    if version == 3:
        if read_protected(config_file, 8192, private=True) != raw_config:
            raise ValueError('private v3 Wallet profile changed while reading')
        options['protocol_version'] = 3
    state = Path(wallet_state)
    remnants = ('wallet-simulator.db','entitlement.db')
    if version == 3:
        remnants += ('wallet-simulator.db-wal','wallet-simulator.db-shm','entitlement.db-wal',
                     'entitlement.db-shm','AUTHORITY.json','GX00-MIGRATION.json','authority.lock')
    if any((state/name).exists() or (version == 3 and (state/name).is_symlink()) for name in remnants):
        raise ValueError('existing local Wallet cannot be switched to a remote authority; migration is not implemented')
    transport = HTTPSWalletTransport(config['origin'], config['ca_file'], config['token_file'], authority_id=config['authority_id'], **options)
    return RemoteWalletService(state/'backend-cache', transport)

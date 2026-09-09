"""PUBLIC SOFTWARE TEST authenticator, never a production or hardware passkey.

Emits the supported WebAuthn wire format with the already published RFC 8032
test key. Every simulated device shares this key: signatures do not establish
cryptographic device separation, hardware provenance or real user verification.
PIN 0000 simulates local UP/UV; it is checked even on exact retries and is never
stored. Wallet authority must authorize enrollment and consume each challenge.
The only signing operations are fixed-RP creation and assertion ceremonies.
"""
import fcntl
import hashlib
import hmac
import os
from pathlib import Path
import re
import secrets
import sqlite3
import stat
import subprocess
import tempfile
import threading

from blackberryrock.sdk import RFC8032_PUBLIC_TEST_SEED
from blackberryrock.packages import PUBLIC_TEST_KEY
from .protocol import (AuthError, AuthUnavailable, RP_ID, ORIGIN, require,
                       b64decode, b64encode, json_bytes, json_decode, _cbor_encode)

PUBLIC_TEST_PIN = '0000'
MAX_CREDENTIALS = 64
MAX_REQUESTS = 4096


def _sign(payload):
    """Internal fixture signing; no caller-selectable key, RP, path or endpoint."""
    try:
        with tempfile.TemporaryDirectory(prefix='rock-webauthn-public-fixture-') as temporary:
            root = Path(temporary)
            (root / 'key.der').write_bytes(bytes.fromhex('302e020100300506032b657004220420' + RFC8032_PUBLIC_TEST_SEED))
            (root / 'payload').write_bytes(payload)
            result = subprocess.run(['openssl', 'pkeyutl', '-sign', '-inkey', str(root / 'key.der'),
                                     '-keyform', 'DER', '-rawin', '-in', str(root / 'payload')],
                                    capture_output=True, timeout=5, check=True)
        require(len(result.stdout) == 64, 'invalid fixture signature length')
        return result.stdout
    except (OSError, subprocess.SubprocessError) as error:
        raise AuthUnavailable('public test authenticator signing unavailable') from error


def _identifier(value):
    require(type(value) is str and re.fullmatch(r'[a-zA-Z0-9][a-zA-Z0-9_.:@-]{0,159}', value) is not None,
            'invalid opaque identifier')
    return value


def _fields(value, fields):
    require(type(value) is dict and set(value) == set(fields), 'missing or unknown ceremony field')


def _descriptors(value, *, one=False):
    require(type(value) is list and (len(value) == 1 if one else len(value) <= 16), 'credential descriptor limit')
    identifiers = []
    for item in value:
        _fields(item, {'type', 'id'})
        require(item['type'] == 'public-key', 'unsupported credential type')
        b64decode(item['id'], 1, 1023)
        require(item['id'] not in identifiers, 'duplicate credential descriptor')
        identifiers.append(item['id'])
    return identifiers


def _options(options, device_ref, creation):
    # Canonicalizing also bounds all input before database access or signing.
    payload = json_bytes(options).decode()
    options = json_decode(payload)
    _fields(options, {'schema_version', 'device_ref', 'purpose', 'publicKey'})
    require(type(options['schema_version']) is int and options['schema_version'] == 1,
            'unsupported ceremony schema')
    require(options['device_ref'] == device_ref and options['purpose'] == ('wallet.enroll' if creation else 'wallet.atm.issue'),
            'ceremony device or purpose mismatch')
    public = options['publicKey']
    if creation:
        _fields(public, {'challenge', 'rp', 'user', 'pubKeyCredParams', 'authenticatorSelection',
                         'attestation', 'timeout', 'excludeCredentials'})
        _fields(public['rp'], {'id', 'name'})
        require(public['rp'] == {'id': RP_ID, 'name': 'Rock Wallet'}, 'unsupported relying party')
        _fields(public['user'], {'id', 'name', 'displayName'})
        b64decode(public['user']['id'], 1, 64)
        for name in ('name', 'displayName'):
            text = public['user'][name]
            require(type(text) is str and 1 <= len(text) <= 80 and all(ord(ch) >= 32 for ch in text), 'invalid user label')
        params = public['pubKeyCredParams']
        require(type(params) is list and len(params) == 1, 'only Ed25519 is supported')
        _fields(params[0], {'type', 'alg'})
        require(params[0]['type'] == 'public-key' and type(params[0]['alg']) is int and params[0]['alg'] == -8,
                'only Ed25519 is supported')
        require(public['authenticatorSelection'] == {'residentKey': 'required', 'userVerification': 'required'},
                'resident credential and user verification required')
        require(public['attestation'] == 'direct', 'packed self attestation required')
        _descriptors(public['excludeCredentials'])
    else:
        _fields(public, {'challenge', 'rpId', 'allowCredentials', 'userVerification', 'timeout'})
        require(public['rpId'] == RP_ID and public['userVerification'] == 'required', 'RP or verification mismatch')
        _descriptors(public['allowCredentials'], one=True)
    b64decode(public['challenge'], 32, 32)
    require(type(public['timeout']) is int and public['timeout'] == 120000, 'unsupported ceremony timeout')
    return payload


class SoftwareTestAuthenticator:
    """Persistent simulated local authenticator. close() releases its process lock.

    Options are a strict {schema_version, device_ref, purpose, publicKey} envelope.
    publicKey is the standard JSON creation/request-options subset validated
    above. The key argument is an opaque local idempotency identifier, not key
    material. Returned values are standard PublicKeyCredential JSON objects.
    Metadata is separate and must remain visible in any surrounding test UI.
    """
    def __init__(self, state_dir, device_ref):
        self.device_ref = _identifier(device_ref)
        self.path = Path(state_dir)
        self.path.mkdir(parents=True, exist_ok=True, mode=0o700)
        self._mutex = threading.RLock()
        self._closed, self._lock_fd, self._db = False, None, None
        try:
            self._check_files()
            self._lock_fd = self._open_private('authenticator.lock')
            try:
                fcntl.flock(self._lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except OSError as error:
                raise AuthUnavailable('test authenticator state is already in use') from error
            os.close(self._open_private('authenticator.sqlite3'))
            self._db = sqlite3.connect(self.path / 'authenticator.sqlite3', isolation_level=None, check_same_thread=False)
            self._db.row_factory = sqlite3.Row
            self._db.execute('PRAGMA synchronous=FULL')
            self._db.execute('PRAGMA journal_mode=DELETE')
            self._db.executescript('''
                BEGIN IMMEDIATE;
                CREATE TABLE IF NOT EXISTS metadata (id INTEGER PRIMARY KEY CHECK(id=1), device_ref TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS credentials (
                    credential_id TEXT PRIMARY KEY, user_handle TEXT NOT NULL,
                    sign_count INTEGER NOT NULL CHECK(sign_count BETWEEN 0 AND 4294967295));
                CREATE TABLE IF NOT EXISTS requests (
                    request_key TEXT PRIMARY KEY, operation TEXT NOT NULL, payload TEXT NOT NULL, response TEXT NOT NULL);
                CREATE TRIGGER IF NOT EXISTS metadata_no_update BEFORE UPDATE ON metadata
                    BEGIN SELECT RAISE(ABORT,'immutable device'); END;
                CREATE TRIGGER IF NOT EXISTS metadata_no_delete BEFORE DELETE ON metadata
                    BEGIN SELECT RAISE(ABORT,'retained device'); END;
                CREATE TRIGGER IF NOT EXISTS credential_identity BEFORE UPDATE OF credential_id,user_handle ON credentials
                    BEGIN SELECT RAISE(ABORT,'immutable credential identity'); END;
                CREATE TRIGGER IF NOT EXISTS credentials_no_delete BEFORE DELETE ON credentials
                    BEGIN SELECT RAISE(ABORT,'retained credential'); END;
                CREATE TRIGGER IF NOT EXISTS requests_no_update BEFORE UPDATE ON requests
                    BEGIN SELECT RAISE(ABORT,'immutable request'); END;
                CREATE TRIGGER IF NOT EXISTS requests_no_delete BEFORE DELETE ON requests
                    BEGIN SELECT RAISE(ABORT,'retained request'); END;
            ''')
            row = self._db.execute('SELECT device_ref FROM metadata WHERE id=1').fetchone()
            require(row is None or row['device_ref'] == self.device_ref, 'authenticator belongs to another device')
            if row is None:
                self._db.execute('INSERT INTO metadata VALUES (1,?)', (self.device_ref,))
            self._db.execute('COMMIT')
            self._check_files()
        except BaseException:
            self.close()
            raise

    @property
    def metadata(self):
        return {'simulation_only': True, 'authenticator': 'public-software-test', 'user_presence': 'simulated',
                'user_verification': 'public-test-pin', 'hardware_backed': False, 'shared_public_test_key': True}

    def _check_files(self):
        info = self.path.lstat()
        require(stat.S_ISDIR(info.st_mode) and info.st_uid == os.geteuid() and info.st_mode & 0o077 == 0,
                'authenticator directory must be private and owned')
        for name in ('authenticator.lock', 'authenticator.sqlite3', 'authenticator.sqlite3-journal',
                     'authenticator.sqlite3-wal', 'authenticator.sqlite3-shm'):
            path = self.path / name
            if path.exists() or path.is_symlink():
                info = path.lstat()
                require(stat.S_ISREG(info.st_mode) and info.st_uid == os.geteuid() and info.st_nlink == 1
                        and info.st_mode & 0o077 == 0, 'authenticator files must be private owned single-link regular files')

    def _open_private(self, name):
        fd = os.open(self.path / name, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
        try:
            info = os.fstat(fd)
            require(stat.S_ISREG(info.st_mode) and info.st_uid == os.geteuid() and info.st_nlink == 1
                    and info.st_mode & 0o077 == 0, 'unsafe authenticator file')
            return fd
        except BaseException:
            os.close(fd)
            raise

    def close(self):
        with self._mutex:
            self._closed = True
            if self._db is not None:
                self._db.close()
                self._db = None
            if self._lock_fd is not None:
                os.close(self._lock_fd)
                self._lock_fd = None

    def make_credential(self, options, pin, key):
        return self._perform(options, pin, key, True)

    def get_assertion(self, options, pin, key):
        return self._perform(options, pin, key, False)

    def _perform(self, options, pin, key, creation):
        require(type(pin) is str and pin.isascii() and hmac.compare_digest(pin, PUBLIC_TEST_PIN), 'public test PIN rejected')
        key = _identifier(key)
        payload = _options(options, self.device_ref, creation)
        # Use the canonical copy throughout: callers cannot mutate signed options
        # concurrently after validation or change the durable retry payload.
        options = json_decode(payload)
        operation = 'create' if creation else 'get'
        with self._mutex:
            require(not self._closed, 'test authenticator is closed')
            self._check_files()
            self._db.execute('BEGIN IMMEDIATE')
            try:
                previous = self._db.execute('SELECT * FROM requests WHERE request_key=?', (key,)).fetchone()
                if previous is not None:
                    require(previous['operation'] == operation and previous['payload'] == payload, 'idempotency key has another ceremony')
                    response = json_decode(previous['response'])
                else:
                    require(self._db.execute('SELECT COUNT(*) FROM requests').fetchone()[0] < MAX_REQUESTS, 'test authenticator request capacity')
                    response = self._create(options['publicKey']) if creation else self._get(options['publicKey'])
                    self._db.execute('INSERT INTO requests VALUES (?,?,?,?)', (key, operation, payload, json_bytes(response).decode()))
                self._check_files()
                self._db.execute('COMMIT')
                return response
            except BaseException:
                self._db.execute('ROLLBACK')
                raise

    def _client_data(self, options, creation):
        return json_bytes({'type': 'webauthn.create' if creation else 'webauthn.get',
                           'challenge': options['challenge'], 'origin': ORIGIN, 'crossOrigin': False})

    def _create(self, options):
        for descriptor in options['excludeCredentials']:
            require(self._db.execute('SELECT 1 FROM credentials WHERE credential_id=?', (descriptor['id'],)).fetchone() is None,
                    'excluded credential exists')
        require(self._db.execute('SELECT COUNT(*) FROM credentials').fetchone()[0] < MAX_CREDENTIALS, 'test authenticator credential capacity')
        credential_id = secrets.token_bytes(32)
        encoded = b64encode(credential_id)
        cose = _cbor_encode({1: 1, 3: -8, -1: 6, -2: bytes.fromhex(PUBLIC_TEST_KEY)})
        raw = (hashlib.sha256(RP_ID.encode()).digest() + b'\x45' + bytes(4) + bytes(16)
               + len(credential_id).to_bytes(2, 'big') + credential_id + cose)
        client_data = self._client_data(options, True)
        attestation = _cbor_encode({'fmt': 'packed', 'authData': raw,
                                   'attStmt': {'alg': -8, 'sig': _sign(raw + hashlib.sha256(client_data).digest())}})
        self._db.execute('INSERT INTO credentials VALUES (?,?,0)', (encoded, options['user']['id']))
        return {'id': encoded, 'rawId': encoded, 'type': 'public-key', 'authenticatorAttachment': 'platform',
                'clientExtensionResults': {}, 'response': {'clientDataJSON': b64encode(client_data),
                'attestationObject': b64encode(attestation), 'transports': ['internal']}}

    def _get(self, options):
        encoded = options['allowCredentials'][0]['id']
        row = self._db.execute('SELECT * FROM credentials WHERE credential_id=?', (encoded,)).fetchone()
        require(row is not None, 'credential is not present on this test authenticator')
        require(row['sign_count'] < 0xFFFFFFFF, 'test authenticator counter exhausted')
        count = row['sign_count'] + 1
        raw = hashlib.sha256(RP_ID.encode()).digest() + b'\x05' + count.to_bytes(4, 'big')
        client_data = self._client_data(options, False)
        signature = _sign(raw + hashlib.sha256(client_data).digest())
        self._db.execute('UPDATE credentials SET sign_count=? WHERE credential_id=?', (count, encoded))
        return {'id': encoded, 'rawId': encoded, 'type': 'public-key', 'authenticatorAttachment': 'platform',
                'clientExtensionResults': {}, 'response': {'clientDataJSON': b64encode(client_data),
                'authenticatorData': b64encode(raw), 'signature': b64encode(signature), 'userHandle': row['user_handle']}}

"""Bounded WebAuthn L3 verification subset, W3C REC 2026-08-25 §§6.1,7,8.2.

Supports Ed25519 COSE OKP (-8, kty=1, crv=6), packed SELF attestation and
assertions. No x5c, other attestation formats, extensions or cross-origin use.
Enrolled public points must be canonical, nonidentity and in the prime-order
subgroup; OpenSSL alone can accept identity-key signatures without a secret.
Self attestation proves possession, not hardware provenance or trusted UV.
Account/device enrollment authority, challenge expiry/consumption, credential
uniqueness/revocation, and atomic persistence of updated counters belong to the
calling Wallet store. This module imports no SDK seed or publisher trust.
Additional CollectedClientData members are bounded and ignored, as WebAuthn
allows future members; known security members are always checked. Unsupported
credential/response JSON fields and nonempty extension outputs are rejected.
"""
import base64
import hashlib
import json
import re
import subprocess
import tempfile
from pathlib import Path

RP_ID = 'wallet.rock-star-os.test'
ORIGIN = 'https://wallet.rock-star-os.test'
MAX_JSON = 65536
MAX_CBOR = 16384
RECORD_FIELDS = {'credential_id', 'public_key', 'sign_count', 'aaguid', 'backup_eligible', 'backup_state'}


class AuthError(ValueError):
    pass


class AuthUnavailable(OSError):
    pass


def require(condition, message='WebAuthn verification rejected'):
    if not condition:
        raise AuthError(message)


def b64encode(value):
    return base64.urlsafe_b64encode(value).rstrip(b'=').decode('ascii')


def b64decode(value, minimum=1, maximum=MAX_CBOR):
    require(type(value) is str and len(value) <= (maximum * 4 + 2) // 3
            and re.fullmatch(r'[A-Za-z0-9_-]*', value) is not None, 'invalid base64url')
    try:
        decoded = base64.b64decode(value + '=' * (-len(value) % 4), altchars=b'-_', validate=True)
    except ValueError as error:
        raise AuthError('invalid base64url') from error
    require(minimum <= len(decoded) <= maximum and b64encode(decoded) == value, 'noncanonical base64url')
    return decoded


def _bounded(value, depth=0, budget=None):
    budget = [1024] if budget is None else budget
    budget[0] -= 1
    require(depth <= 8 and budget[0] >= 0, 'JSON nesting or item limit')
    if type(value) is dict:
        for key, item in value.items():
            require(type(key) is str and len(key) <= 256, 'invalid JSON object key')
            _bounded(item, depth + 1, budget)
    elif type(value) is list:
        for item in value:
            _bounded(item, depth + 1, budget)
    else:
        require(value is None or type(value) in (str, bool, int, float), 'invalid JSON value')
        if type(value) is str:
            require(len(value) <= MAX_JSON, 'JSON string limit')


def json_bytes(value):
    try:
        _bounded(value)
        raw = json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(',', ':'), allow_nan=False).encode()
        require(len(raw) <= MAX_JSON, 'JSON byte limit')
        return raw
    except (ValueError, UnicodeError, RecursionError) as error:
        raise AuthError('invalid bounded JSON') from error


def json_decode(raw, maximum=MAX_JSON):
    require(type(raw) in (bytes, str) and len(raw) <= maximum, 'JSON byte limit')
    def pairs(items):
        result = {}
        for key, value in items:
            require(key not in result, 'duplicate JSON key')
            result[key] = value
        return result
    try:
        # WebAuthn UTF-8 decoding strips an optional initial BOM.
        text = raw.decode('utf-8-sig') if type(raw) is bytes else raw.lstrip('\ufeff')
        result = json.loads(text, object_pairs_hook=pairs,
                            parse_constant=lambda _: (_ for _ in ()).throw(AuthError('non-finite JSON')))
        json_bytes(result)
        return result
    except (ValueError, UnicodeError, RecursionError) as error:
        raise AuthError('invalid duplicate-free JSON') from error


class _CBOR:
    def __init__(self, raw):
        require(type(raw) is bytes and len(raw) <= MAX_CBOR, 'CBOR byte limit')
        self.raw, self.position, self.items = raw, 0, 0

    def take(self, size):
        require(self.position + size <= len(self.raw), 'truncated CBOR')
        value = self.raw[self.position:self.position + size]
        self.position += size
        return value

    def read(self, depth=0):
        self.items += 1
        require(depth <= 8 and self.items <= 256, 'CBOR nesting or item limit')
        first = self.take(1)[0]
        major, extra = first >> 5, first & 31
        require(major <= 5 and extra < 28, 'unsupported CBOR type or indefinite length')
        if extra < 24:
            size = extra
        else:
            width = 1 << (extra - 24)
            size = int.from_bytes(self.take(width), 'big')
            require(size >= (24 if width == 1 else 1 << (8 * (width // 2))), 'nonminimal CBOR integer')
        if major == 0:
            return size
        if major == 1:
            return -1 - size
        require(size <= (32 if major in (4, 5) else MAX_CBOR), 'CBOR container limit')
        if major == 2:
            return self.take(size)
        if major == 3:
            try:
                return self.take(size).decode('utf-8')
            except UnicodeError as error:
                raise AuthError('invalid CBOR UTF-8') from error
        if major == 4:
            return [self.read(depth + 1) for _ in range(size)]
        result = {}
        for _ in range(size):
            key = self.read(depth + 1)
            require(type(key) in (int, str, bytes) and key not in result, 'duplicate or unsupported CBOR map key')
            result[key] = self.read(depth + 1)
        return result


def cbor_decode(raw):
    parser = _CBOR(raw)
    result = parser.read()
    require(parser.position == len(raw), 'trailing CBOR data')
    return result


def _cbor_encode(value):
    def head(major, size):
        for limit, marker, width in ((24, 0, 0), (256, 24, 1), (65536, 25, 2), (2**32, 26, 4), (2**64, 27, 8)):
            if size < limit:
                return bytes([(major << 5) | (size if width == 0 else marker)]) + (size.to_bytes(width, 'big') if width else b'')
        raise AuthError('CBOR integer exceeds supported range')
    if type(value) is int:
        return head(0, value) if value >= 0 else head(1, -1 - value)
    if type(value) in (bytes, str):
        raw = value if type(value) is bytes else value.encode()
        return head(2 if type(value) is bytes else 3, len(raw)) + raw
    if type(value) is list:
        return head(4, len(value)) + b''.join(_cbor_encode(item) for item in value)
    if type(value) is dict:
        pairs = sorted(((_cbor_encode(key), _cbor_encode(item)) for key, item in value.items()), key=lambda pair: (len(pair[0]), pair[0]))
        return head(5, len(pairs)) + b''.join(key + item for key, item in pairs)
    raise AuthError('unsupported CBOR value')


def _signature(public_key, signature, payload):
    require(type(public_key) is bytes and len(public_key) == 32 and type(signature) is bytes and len(signature) == 64,
            'invalid Ed25519 key or signature')
    _validate_public_point(public_key)
    try:
        with tempfile.TemporaryDirectory(prefix='rock-webauthn-verify-') as temporary:
            root = Path(temporary)
            (root / 'key.der').write_bytes(bytes.fromhex('302a300506032b6570032100') + public_key)
            (root / 'signature').write_bytes(signature)
            (root / 'payload').write_bytes(payload)
            run = subprocess.run(['openssl', 'pkeyutl', '-verify', '-pubin', '-inkey', str(root / 'key.der'),
                                  '-keyform', 'DER', '-rawin', '-in', str(root / 'payload'),
                                  '-sigfile', str(root / 'signature')], capture_output=True, timeout=5)
    except (OSError, subprocess.TimeoutExpired) as error:
        raise AuthUnavailable('Ed25519 verifier unavailable') from error
    require(run.returncode == 0, 'Ed25519 signature rejected')


def _validate_public_point(encoded):
    """Public-data validation only; signatures are still verified by OpenSSL.

    Decoding/extended-coordinate arithmetic follows RFC 8032 sections 5.1.3/6:
    https://www.rfc-editor.org/rfc/rfc8032.html#section-6
    The nonidentity prime-subgroup requirement is this Wallet's stricter key
    admission policy. This helper never handles private scalars or signs data.
    """
    prime = 2**255 - 19
    order = 2**252 + 27742317777372353535851937790883648493
    curve = -121665 * pow(121666, prime - 2, prime) % prime
    number = int.from_bytes(encoded, 'little')
    y, sign = number & (2**255 - 1), number >> 255
    require(y < prime, 'noncanonical Ed25519 public point')
    square = (y * y - 1) * pow(curve * y * y + 1, prime - 2, prime) % prime
    x = pow(square, (prime + 3) // 8, prime)
    if x * x % prime != square:
        x = x * pow(2, (prime - 1) // 4, prime) % prime
    require(x * x % prime == square and not (x == 0 and sign), 'invalid Ed25519 public point')
    if (x & 1) != sign:
        x = prime - x
    require(not (x == 0 and y == 1), 'identity Ed25519 public key rejected')

    def add(left, right):
        a = (left[1] - left[0]) * (right[1] - right[0]) % prime
        b = (left[1] + left[0]) * (right[1] + right[0]) % prime
        c = 2 * curve * left[3] * right[3] % prime
        d = 2 * left[2] * right[2] % prime
        e, f, g, h = b - a, d - c, d + c, b + a
        return e * f % prime, g * h % prime, f * g % prime, e * h % prime

    point, multiple = (x, y, 1, x * y % prime), (0, 1, 1, 0)
    while order:
        if order & 1:
            multiple = add(multiple, point)
        point = add(point, point)
        order >>= 1
    require(multiple[2] != 0 and multiple[0] == 0 and (multiple[1] - multiple[2]) % prime == 0,
            'Ed25519 public key is not in the prime-order subgroup')


def _client(raw, expected_type, challenge, rp_id, origin):
    b64decode(challenge, 16, 64)
    require(rp_id == RP_ID and origin == ORIGIN, 'unsupported Wallet RP or origin')
    data = json_decode(raw, 8192)
    require(type(data) is dict and data.get('type') == expected_type and data.get('challenge') == challenge
            and data.get('origin') == origin, 'client ceremony type, challenge or origin mismatch')
    require('crossOrigin' not in data or data['crossOrigin'] is False, 'cross-origin ceremony rejected')
    require('topOrigin' not in data, 'top-origin ceremony unsupported')
    return hashlib.sha256(raw).digest()


def _credential(credential, registration):
    credential = json_decode(credential) if type(credential) in (bytes, str) else credential
    json_bytes(credential)
    required = {'id', 'rawId', 'type', 'response', 'clientExtensionResults'}
    require(type(credential) is dict and required <= set(credential) <= required | {'authenticatorAttachment'}, 'credential fields rejected')
    require(credential['type'] == 'public-key' and credential['id'] == credential['rawId'], 'credential ID/type mismatch')
    credential_id = b64decode(credential['rawId'], 1, 1023)
    require(credential['clientExtensionResults'] == {}, 'extensions unsupported')
    require(credential.get('authenticatorAttachment') in (None, 'platform', 'cross-platform'), 'invalid authenticator attachment')
    response = credential['response']
    required = {'clientDataJSON', 'attestationObject'} if registration else {'clientDataJSON', 'authenticatorData', 'signature', 'userHandle'}
    optional = {'transports', 'publicKey', 'publicKeyAlgorithm', 'authenticatorData'} if registration else set()
    require(type(response) is dict and required <= set(response) <= required | optional, 'authenticator response fields rejected')
    return credential_id, response


def _auth_data(raw, registration):
    require(len(raw) >= 37 and len(raw) <= MAX_CBOR, 'invalid authenticator data length')
    require(raw[:32] == hashlib.sha256(RP_ID.encode()).digest(), 'RP ID hash mismatch')
    flags = raw[32]
    require(flags & 5 == 5, 'user presence and verification required')
    require(flags & 0xA2 == 0, 'reserved flags or extensions unsupported')
    require(bool(flags & 0x40) == registration, 'attested-data flag mismatch')
    be, bs = bool(flags & 8), bool(flags & 16)
    require(not bs or be, 'backup state requires eligibility')
    return int.from_bytes(raw[33:37], 'big'), be, bs


def verify_registration(credential, *, challenge, rp_id, origin):
    credential_id, response = _credential(credential, True)
    client_hash = _client(b64decode(response['clientDataJSON'], 1, 8192), 'webauthn.create', challenge, rp_id, origin)
    attestation = cbor_decode(b64decode(response['attestationObject']))
    require(type(attestation) is dict and set(attestation) == {'fmt', 'authData', 'attStmt'}
            and attestation['fmt'] == 'packed', 'only packed self attestation is supported')
    raw, statement = attestation['authData'], attestation['attStmt']
    require(type(raw) is bytes and type(statement) is dict and set(statement) == {'alg', 'sig'}
            and type(statement['alg']) is int and statement['alg'] == -8, 'self attestation algorithm or fields rejected')
    count, be, bs = _auth_data(raw, True)
    require(len(raw) >= 55, 'truncated attested credential')
    length = int.from_bytes(raw[53:55], 'big')
    require(1 <= length <= 1023 and raw[55:55 + length] == credential_id, 'attested credential ID mismatch')
    cose = cbor_decode(raw[55 + length:])
    require(type(cose) is dict and set(cose) == {1, 3, -1, -2}
            and type(cose[1]) is int and cose[1] == 1 and type(cose[3]) is int and cose[3] == -8
            and type(cose[-1]) is int and cose[-1] == 6 and type(cose[-2]) is bytes and len(cose[-2]) == 32,
            'unsupported Ed25519 COSE key')
    public = cose[-2]
    if 'authenticatorData' in response:
        require(b64decode(response['authenticatorData']) == raw, 'duplicate authenticator data mismatch')
    if 'publicKeyAlgorithm' in response:
        require(type(response['publicKeyAlgorithm']) is int and response['publicKeyAlgorithm'] == -8, 'public key algorithm mismatch')
    if 'publicKey' in response:
        require(b64decode(response['publicKey']) == bytes.fromhex('302a300506032b6570032100') + public, 'public key encoding mismatch')
    if 'transports' in response:
        require(type(response['transports']) is list and len(response['transports']) <= 8
                and all(type(item) is str and item in {'usb', 'nfc', 'ble', 'smart-card', 'hybrid', 'internal'} for item in response['transports']), 'invalid transports')
    _signature(public, statement['sig'], raw + client_hash)
    return {'credential_id': b64encode(credential_id), 'public_key': public.hex(), 'sign_count': count,
            'aaguid': raw[37:53].hex(), 'backup_eligible': be, 'backup_state': bs}


def verify_assertion(credential, *, challenge, rp_id, origin, record, user_handle):
    require(type(record) is dict and set(record) == RECORD_FIELDS, 'invalid credential record')
    require(type(record['sign_count']) is int and 0 <= record['sign_count'] <= 0xFFFFFFFF
            and type(record['backup_eligible']) is bool and type(record['backup_state']) is bool
            and (not record['backup_state'] or record['backup_eligible']), 'invalid stored counter or backup flags')
    require(type(record['public_key']) is str and re.fullmatch('[0-9a-f]{64}', record['public_key']) is not None
            and type(record['aaguid']) is str and re.fullmatch('[0-9a-f]{32}', record['aaguid']) is not None, 'invalid stored key or AAGUID')
    b64decode(user_handle, 1, 64)
    credential_id, response = _credential(credential, False)
    require(b64decode(record['credential_id'], 1, 1023) == credential_id, 'assertion uses another credential')
    if response['userHandle'] is not None:
        require(b64decode(response['userHandle'], 1, 64) == b64decode(user_handle, 1, 64), 'user handle mismatch')
    client_hash = _client(b64decode(response['clientDataJSON'], 1, 8192), 'webauthn.get', challenge, rp_id, origin)
    raw = b64decode(response['authenticatorData'], 37, 37)
    count, be, bs = _auth_data(raw, False)
    require(be == record['backup_eligible'], 'credential backup eligibility changed')
    _signature(bytes.fromhex(record['public_key']), b64decode(response['signature'], 64, 64), raw + client_hash)
    require((count == record['sign_count'] == 0) or count > record['sign_count'], 'signature counter did not advance')
    return dict(record, sign_count=count, backup_state=bs)

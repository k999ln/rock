"""Bounded authenticated messages; public fixtures are not production identity."""
import hashlib
import hmac
import json
import re
import struct
import uuid

from blackberryrock.packages import canonical

PROTOCOL = 'rock-runner/1'
MAX_INPUT = 65536
MAX_OUTPUT = 131072
MAX_WIRE = 1024 * 1024
PUBLIC_ALICE_TOKEN = 'PUBLIC-FIXTURE-ROCK-RUNNER-ALICE-v1'
PUBLIC_BOB_TOKEN = 'PUBLIC-FIXTURE-ROCK-RUNNER-BOB-v1'
REQUEST_DOMAIN = b'RockRunnerRequest-v1\0'
RESPONSE_DOMAIN = b'RockRunnerResponse-v1\0'
TERMINAL = {'succeeded', 'failed', 'cancelled', 'indeterminate'}


class RunnerError(ValueError):
    pass


class AuthenticationError(RunnerError):
    pass


class TransportError(RunnerError):
    pass


def digest(value):
    return hashlib.sha256(canonical(value)).hexdigest()


def text_hash(text):
    return hashlib.sha256(text.encode('utf-8')).hexdigest()


def identifier(value, label='identifier'):
    if not isinstance(value, str) or not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}', value):
        raise RunnerError('invalid ' + label)
    return value


def decode(raw):
    if not isinstance(raw, bytes) or len(raw) > MAX_WIRE:
        raise RunnerError('message exceeds wire limit')
    def unique(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise RunnerError('duplicate JSON field')
            result[key] = value
        return result
    def constant(_):
        raise RunnerError('non-finite JSON value')
    try:
        return json.loads(raw.decode('utf-8'), object_pairs_hook=unique, parse_constant=constant)
    except (ValueError, UnicodeError, RecursionError) as error:
        raise RunnerError('invalid bounded JSON') from error


def authority_identifier(value):
    if value is not None:
        try:
            if not isinstance(value, str) or str(uuid.UUID(value)) != value:
                raise ValueError
        except (ValueError, AttributeError) as error:
            raise RunnerError('canonical service authority UUID required') from error
    return value


def sign_request(owner, token, request, *, authority_id=None):
    body = {'owner': owner, 'request': request}
    if authority_identifier(authority_id) is not None:
        body['authority_id'] = authority_id
    return {**body, 'auth': hmac.new(token.encode(), REQUEST_DOMAIN + canonical(body), hashlib.sha256).hexdigest()}


def authenticate(envelope, owners, *, authority_id=None):
    fields = {'owner', 'request', 'auth'} | ({'authority_id'} if authority_id is not None else set())
    if not isinstance(envelope, dict) or set(envelope) != fields or (authority_id is not None and envelope.get('authority_id') != authority_id):
        raise AuthenticationError('invalid authentication envelope')
    owner = identifier(envelope['owner'], 'owner')
    policy = owners.get(owner)
    if not policy or not isinstance(envelope['auth'], str):
        raise AuthenticationError('owner authentication failed')
    expected = sign_request(owner, policy['token'], envelope['request'], authority_id=authority_id)['auth']
    if not hmac.compare_digest(expected, envelope['auth']):
        raise AuthenticationError('owner authentication failed')
    return owner, policy


def sign_response(token, request, response, *, authority_id=None):
    body = {'request_sha256': digest(request), 'response': response}
    if authority_identifier(authority_id) is not None:
        body['authority_id'] = authority_id
    return {**body, 'auth': hmac.new(token.encode(), RESPONSE_DOMAIN + canonical(body), hashlib.sha256).hexdigest()}


def verify_response(token, request, envelope, *, authority_id=None):
    fields = {'request_sha256', 'response', 'auth'} | ({'authority_id'} if authority_id is not None else set())
    if not isinstance(envelope, dict) or set(envelope) != fields or (authority_id is not None and envelope.get('authority_id') != authority_id):
        raise TransportError('unauthenticated response')
    expected = sign_response(token, request, envelope['response'], authority_id=authority_id)
    if (envelope['request_sha256'] != expected['request_sha256'] or not isinstance(envelope['auth'], str)
            or not hmac.compare_digest(envelope['auth'], expected['auth'])):
        raise TransportError('response authentication or request binding failed')
    return envelope['response']


def recv_exact(stream, count):
    chunks = []
    while count:
        part = stream.recv(count)
        if not part:
            raise TransportError('connection ended before complete frame')
        chunks.append(part)
        count -= len(part)
    return b''.join(chunks)


def read_frame(stream):
    count = struct.unpack('!I', recv_exact(stream, 4))[0]
    if not 1 <= count <= MAX_WIRE:
        raise TransportError('invalid frame length')
    return decode(recv_exact(stream, count))


def write_frame(stream, value):
    raw = canonical(value)
    if not 1 <= len(raw) <= MAX_WIRE:
        raise TransportError('frame exceeds wire limit')
    stream.sendall(struct.pack('!I', len(raw)) + raw)

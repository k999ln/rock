"""Pinned device-to-authority MCP Hub transport; no provider token or retry.

Only the authority owns Broker/Store admission and upstream credentials. This
client returns a checked result, never turns saved status into an access grant,
and does not cache selected text or signed requests. Platform owns its UI cache.
"""
from contextlib import contextmanager
import fcntl
import hashlib
import http.client
import math
import os
from pathlib import Path
import re
import ipaddress
import socket
import ssl
import stat
import time
import uuid
from urllib.parse import urlsplit

from runner.transport import DeadlineConnection
from service_access import os_client
from .http import canonical, decode, digest, identifier, MAX_INPUT, MAX_BODY, VERSION

MAX_WIRE = 262144
CONFIG_SCHEMA = 'rock-mcp-hub-device/1'
MARKER_SCHEMA = 'rock-mcp-hub-binding/1'
MARKER = 'mcp-hub-binding.json'
REQUEST_SCHEMA = 'rock-mcp-hub-request/1'
RESPONSE_SCHEMA = 'rock-mcp-hub-response/1'


class HubUnavailable(OSError):
    """Outcome unresolved: preserve the same request key and exact consent."""


class _Rejected(ValueError):
    pass


class _Unauthorized(PermissionError):
    pass


def require(value, message):
    if not value:
        raise ValueError(message)


def validate_request(request):
    fields = {
        'mcp.snapshot': (), 'mcp.connect': ('alias', 'key'),
        'mcp.disconnect': ('alias', 'key'), 'mcp.prepare': ('alias', 'text', 'key'),
        'mcp.submit': ('key', 'consent', 'text'), 'mcp.status': ('key',), 'mcp.reconcile': ('key',),
    }
    require(type(request) is dict and type(request.get('v')) is int and request['v'] == 1 and
            type(request.get('op')) is str and request['op'] in fields, 'unsupported MCP Hub request')
    require(set(request) == {'v', 'op', *fields[request['op']]}, 'unknown or missing MCP request field')
    for field in ('alias', 'key'):
        if field in request:
            identifier(request[field])
    if 'text' in request:
        require(type(request['text']) is str and len(request['text'].encode('utf-8')) <= MAX_INPUT,
                'selected MCP text exceeds its bound')
    if 'consent' in request:
        import re
        consent = request['consent']
        require(type(consent) is dict and set(consent) == {'approved', 'digest'} and
                consent['approved'] is True and type(consent['digest']) is str and
                re.fullmatch('[0-9a-f]{64}', consent['digest']), 'explicit exact MCP consent required')
    # Copy through canonical JSON before handing bytes to another thread/socket.
    return decode(canonical(request))


def origin_parts(origin):
    try:
        parsed = urlsplit(origin)
        port = parsed.port
        require(type(origin) is str and parsed.scheme == 'https' and
                parsed.hostname in {'127.0.0.1', '10.0.2.2'} and port is not None and
                1024 <= port <= 65535 and parsed.username is None and parsed.password is None and
                parsed.path in {'', '/'} and not parsed.query and not parsed.fragment,
                'fixed development HTTPS MCP gateway required')
    except (ValueError, TypeError, AttributeError):
        raise ValueError('fixed development HTTPS MCP gateway required') from None
    return parsed.hostname, port


def ca_bytes(path):
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(fd, 'rb') as stream:
        info = os.fstat(stream.fileno())
        require(stat.S_ISREG(info.st_mode) and info.st_nlink == 1 and
                info.st_uid in (0, os.geteuid()) and not info.st_mode & 0o022 and
                0 < info.st_size <= 65536, 'protected explicit MCP CA required')
        raw = stream.read(65537)
        require(len(raw) <= 65536, 'MCP CA exceeds bound')
        return raw


STATES = frozenset({'prepared', 'queued', 'sending', 'unknown', 'succeeded', 'failed', 'cancelled'})


def _fields(value, names):
    require(type(value) is dict and set(value) == set(names.split()), 'unexpected MCP result fields')


def _integer(value, low=0, high=2**62-1):
    require(type(value) is int and low <= value <= high, 'invalid MCP result integer')


def _hash(value):
    require(type(value) is str and re.fullmatch('[0-9a-f]{64}', value), 'invalid MCP result digest')


def _text(value, maximum, *, empty=False):
    require(type(value) is str and (empty or value) and len(value.encode()) <= maximum,
            'invalid bounded MCP result text')


def _price(value, *, free=False):
    _fields(value, 'currency amount_minor version')
    require(value['currency'] == 'USD', 'unsupported MCP price currency')
    _integer(value['amount_minor'], 0, 0 if free else 100000000)
    identifier(value['version'])


def _contract(value):
    _fields(value, 'name status_tool input_schema output_schema max_input_bytes data_scope price effect_contract settlement')
    identifier(value['name']); identifier(value['status_tool'])
    require(value['name'] != value['status_tool'] and value['data_scope'] == 'user_selected_text',
            'unsupported MCP selected-text contract')
    _integer(value['max_input_bytes'], 1, MAX_INPUT)
    # The current device UI can consent only to one selected text argument.
    # A broader schema must not inherit that UI's consent wording.
    for field, maximum in (('input_schema', value['max_input_bytes']), ('output_schema', MAX_INPUT)):
        expected = {'type':'object', 'properties':{'text':{'type':'string','maxLength':maximum}},
                    'required':['text'], 'additionalProperties':False}
        require(canonical(value[field]) == canonical(expected), 'unsupported MCP text schema')
    _price(value['price'])
    require(value['effect_contract'] == 'rock-mcp-effect-receipt/1' and
            value['settlement'] == 'opaque_correlation_only', 'unsupported MCP effect contract')


def _route(value):
    _fields(value, 'protocol origin path upstream_principal transport ca_sha256 tools timeout_seconds max_response_bytes')
    require(value['protocol'] == VERSION and value['path'] == '/mcp', 'unsupported MCP route protocol')
    identifier(value['upstream_principal'])
    _text(value['origin'], 512)
    parsed = urlsplit(value['origin'])
    require(parsed.hostname is not None and parsed.username is None and parsed.password is None and
            not parsed.query and not parsed.fragment and parsed.path in ('', '/'), 'invalid MCP route origin')
    ipaddress.ip_address(parsed.hostname)
    if parsed.port is not None: _integer(parsed.port, 1, 65535)
    if value['transport'] == 'loopback_http_fixture':
        require(parsed.scheme == 'http' and parsed.hostname == '127.0.0.1' and value['ca_sha256'] is None,
                'invalid public loopback MCP route')
    else:
        require(value['transport'] == 'https_explicit_ca' and parsed.scheme == 'https', 'invalid MCP TLS route')
        _hash(value['ca_sha256'])
    require(type(value['timeout_seconds']) in (int, float) and math.isfinite(value['timeout_seconds']) and
            0.05 <= value['timeout_seconds'] <= 10, 'invalid MCP route deadline')
    _integer(value['max_response_bytes'], 1024, MAX_BODY)
    tools = value['tools']
    require(type(tools) is dict and 1 <= len(tools) <= 32, 'invalid MCP route Tool count')
    for name, contract in tools.items():
        identifier(name); _contract(contract)
        require(contract['name'] == name, 'MCP route Tool name mismatch')


def _status(value, key=None, *, detail=True):
    names = 'key alias epoch state send_claimed recovery_only consent_digest attempts error financial_transaction'
    _fields(value, names + (' result' if detail else ''))
    identifier(value['key']); identifier(value['alias'])
    require(key is None or value['key'] == key, 'MCP status key mismatch')
    _integer(value['epoch'], 1); _integer(value['attempts'], 0, 32); _hash(value['consent_digest'])
    require(type(value['state']) is str and value['state'] in STATES, 'unknown MCP operation state')
    require(type(value['send_claimed']) is bool and type(value['recovery_only']) is bool and
            value['recovery_only'] == value['send_claimed'] and value['financial_transaction'] is False,
            'invalid MCP status flags')
    require(value['send_claimed'] == (value['state'] in {'sending','unknown','succeeded','failed'}),
            'MCP state contradicts its durable sending claim')
    if value['error'] is not None: _text(value['error'], 512)
    if detail:
        result = value['result']
        if value['state'] not in {'succeeded','failed'}:
            require(result is None, 'unconfirmed MCP result must remain unresolved')
        else:
            _fields(result, 'schema business_key consent_digest state output settlement_correlation')
            require(result['schema'] == 'rock-mcp-effect-receipt/1' and result['state'] == value['state'] and
                    result['consent_digest'] == value['consent_digest'], 'MCP effect receipt mismatch')
            identifier(result['business_key']); identifier(result['settlement_correlation'])
            _fields(result['output'], 'text'); _text(result['output']['text'], MAX_INPUT, empty=True)


def validate_result(request, result, device_ref):
    """Check the current private operation contract, independently of HTTP200.

    These checks convey no authority grant and persist nothing. Any malformed
    success remains unknown to callers, who must retain their original key.
    """
    op = request['op']
    if op == 'mcp.prepare':
        _fields(result, 'prepared submitted state plan consent meaning')
        require(result['prepared'] is True and type(result['submitted']) is bool and
                type(result['state']) is str and result['state'] in STATES, 'invalid MCP preview flags')
        require((result['state'] == 'cancelled' or result['submitted'] == (result['state'] != 'prepared')),
                'MCP preview submission state mismatch')
        _text(result['meaning'], 256)
        plan = result['plan']
        _fields(plan, 'schema subject device_ref key alias epoch route_id route tool contract input_sha256 input_bytes '
                      'data_scope price issued_at expires_at business_key input_transfer')
        for field in ('subject','key','alias','route_id','tool','business_key'): identifier(plan[field])
        require(plan['schema'] == 'rock-mcp-consent/1' and plan['key'] == request['key'] and
                plan['alias'] == request['alias'] and plan['route_id'] == request['alias'] and
                plan['device_ref'] == device_ref and plan['input_transfer'] == 'explicit_submit_only' and
                plan['input_sha256'] == request['input_sha256'] and plan['input_bytes'] == request['input_bytes'],
                'MCP preview does not match the selected request')
        _hash(plan['input_sha256']); _integer(plan['input_bytes'], 0, MAX_INPUT); _integer(plan['epoch'], 1)
        _integer(plan['issued_at']); _integer(plan['expires_at'])
        require(plan['expires_at'] - plan['issued_at'] == 120, 'invalid MCP preview validity interval')
        _contract(plan['contract']); _route(plan['route']); _price(plan['price'], free=True)
        require(plan['contract']['name'] == plan['tool'] and plan['route']['tools'].get(plan['tool']) == plan['contract'] and
                plan['price'] == plan['contract']['price'] and plan['data_scope'] == plan['contract']['data_scope'] and
                plan['input_bytes'] <= plan['contract']['max_input_bytes'] and
                plan['business_key'] == 'op-'+digest([plan['subject'], device_ref, plan['alias'], plan['key']]),
                'MCP preview contract does not match its route or input')
        _fields(result['consent'], 'approved digest')
        require(result['consent']['approved'] is True and result['consent']['digest'] == digest(plan),
                'MCP preview consent digest mismatch')
    elif op == 'mcp.submit':
        _fields(result, 'key consent_digest accepted_locally remote_execution_confirmed financial_transaction')
        require(result['key'] == request['key'] and result['consent_digest'] == request['consent']['digest'] and
                result['accepted_locally'] is True and result['remote_execution_confirmed'] is False and
                result['financial_transaction'] is False, 'MCP submission receipt mismatch')
    elif op in {'mcp.status','mcp.reconcile'}:
        _status(result, request['key'])
    elif op in {'mcp.connect','mcp.disconnect'}:
        names = 'alias epoch event historical_receipt'
        if op == 'mcp.disconnect': names += ' new_admissions_stopped upstream_credential_revocation sent_operations'
        _fields(result, names); _integer(result['epoch'], 1)
        require(result['alias'] == request['alias'] and result['historical_receipt'] is True and
                result['event'] == ('connected' if op == 'mcp.connect' else 'disconnected'), 'MCP connection receipt mismatch')
        if op == 'mcp.disconnect':
            require(result['new_admissions_stopped'] is True and
                    result['upstream_credential_revocation'] == 'NOT_IMPLEMENTED' and
                    result['sent_operations'] == 'reconciliation_only', 'unsupported MCP disconnect guarantees')
    else:
        require(op == 'mcp.snapshot', 'unknown MCP response operation')
        _fields(result, 'connections history simulation_only can_submit paid_state provider_connected financial_transaction upstream_credential_revocation')
        require(result['simulation_only'] is True and result['provider_connected'] is False and
                result['financial_transaction'] is False and result['upstream_credential_revocation'] == 'NOT_IMPLEMENTED',
                'unsupported MCP snapshot guarantees')
        require(type(result['can_submit']) is bool and type(result['paid_state']) is str and
                result['paid_state'] in {'PAID','GRACE','PAUSED'}, 'invalid MCP service status')
        # These are display projections. The controller may explicitly exempt
        # an action from payment; the client must not invent a paid-state gate.
        connections, history = result['connections'], result['history']
        require(type(connections) is list and len(connections) <= 8 and type(history) is list and len(history) <= 20,
                'MCP snapshot array bound exceeded')
        aliases, keys = set(), set()
        for item in connections:
            _fields(item, 'alias label tool state epoch route contract')
            identifier(item['alias']); identifier(item['tool']); _text(item['label'], 256)
            require(len(item['label']) <= 64 and not any(ord(c)<32 for c in item['label']) and
                    item['alias'] not in aliases, 'invalid or duplicate MCP connection label/alias')
            aliases.add(item['alias'])
            require(item['state'] in {'unconnected','connected','closed'}, 'unknown MCP connection state')
            _integer(item['epoch'], 0 if item['state']=='unconnected' else 1)
            require(item['state'] != 'unconnected' or item['epoch'] == 0, 'unconnected MCP epoch must be zero')
            _route(item['route']); _contract(item['contract']); _price(item['contract']['price'], free=True)
            require(item['contract']['name'] == item['tool'] and item['route']['tools'].get(item['tool']) == item['contract'],
                    'MCP snapshot Tool contract mismatch')
        for item in history:
            _status(item, detail=False)
            require(item['key'] not in keys, 'duplicate MCP history key'); keys.add(item['key'])
    return result


class HubClient:
    def __init__(self, origin, ca_file, *, authority_id, consumer_id, device_ref, token, timeout=3):
        self.host, self.port = origin_parts(origin)
        try:
            require(type(authority_id) is str and str(uuid.UUID(authority_id)) == authority_id,
                    'canonical MCP authority UUID required')
        except (ValueError, AttributeError):
            raise ValueError('canonical MCP authority UUID required') from None
        identifier(consumer_id); identifier(device_ref)
        require(type(token) is str and token.startswith('PUBLIC-FIXTURE-') and
                16 <= len(token) <= 256 and all(33 <= ord(char) <= 126 for char in token),
                'explicit public development service credential required')
        require(type(timeout) in (int, float) and math.isfinite(timeout) and 0.05 <= timeout <= 3,
                'MCP timeout must be 0.05 through 3 seconds')
        self.origin = f'https://{self.host}:{self.port}'
        self.authority_id, self.consumer_id, self.device_ref = authority_id, consumer_id, device_ref
        self._token, self.timeout = token, float(timeout)
        certificate = ca_bytes(ca_file)
        self.ca_sha256 = hashlib.sha256(certificate).hexdigest()
        self._context = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
        self._context.minimum_version = ssl.TLSVersion.TLSv1_2
        self._context.load_verify_locations(cadata=certificate.decode('ascii'))

    def request(self, request):
        request = validate_request(request)
        if request['op'] == 'mcp.prepare':
            selected = request.pop('text').encode('utf-8')
            request.update(input_sha256=hashlib.sha256(selected).hexdigest(), input_bytes=len(selected))
            # Preview crosses the authority boundary only as a bounded digest.
            # Plain selected text is transmitted only by explicit submit.
        binding = {'authority_id': self.authority_id, 'consumer_id': self.consumer_id,
                   'device_ref': self.device_ref}
        body = canonical({'schema': REQUEST_SCHEMA, **binding, 'request': request})
        require(len(body) <= MAX_WIRE, 'MCP Hub request exceeds wire bound')
        deadline = time.monotonic() + self.timeout
        raw = wire = connection = response = None

        def remaining():
            left = deadline - time.monotonic()
            if left <= 0:
                raise HubUnavailable('MCP Hub deadline expired; retain the same request')
            return left

        try:
            raw = socket.create_connection((self.host, self.port), timeout=remaining())
            raw.settimeout(remaining())
            wire = self._context.wrap_socket(raw, server_hostname=self.host)
            # This existing bounded reader also constrains slow HTTP headers.
            wrapped = DeadlineConnection(wire, remaining())
            connection = http.client.HTTPConnection(self.host, self.port, timeout=remaining())
            connection.sock = wrapped
            connection.request('POST', '/v1/mcp-hub', body=body,
                headers={'Authorization': 'Bearer '+self._token, 'Content-Type': 'application/json',
                         'Accept': 'application/json', 'Connection': 'close'})
            response = connection.getresponse()
            remaining()
            if response.status in (401, 403):
                raise _Unauthorized('MCP Hub access denied')
            if response.status == 400:
                raise _Rejected('MCP Hub request rejected')
            if response.status != 200:
                raise HubUnavailable('MCP Hub unavailable; retain the same request')
            lengths = response.headers.get_all('Content-Length', [])
            types = response.headers.get_all('Content-Type', [])
            if (len(lengths) != 1 or not lengths[0].isascii() or not lengths[0].isdigit() or
                    not 1 <= int(lengths[0]) <= MAX_WIRE or response.getheader('Transfer-Encoding') is not None or
                    len(types) != 1 or types[0].split(';')[0].strip().lower() != 'application/json'):
                raise HubUnavailable('MCP Hub response framing invalid; retain the same request')
            left, chunks = int(lengths[0]), []
            while left:
                wrapped.settimeout(remaining())
                part = response.read1(min(left, 16384))
                if not part:
                    raise HubUnavailable('MCP Hub response interrupted; retain the same request')
                chunks.append(part); left -= len(part)
            remaining()
            try:
                reply = decode(b''.join(chunks))
                valid = (type(reply) is dict and set(reply) == {'ok', 'schema', *binding, 'result'} and
                         reply['ok'] is True and reply['schema'] == RESPONSE_SCHEMA and
                         all(type(reply[key]) is str and reply[key] == value for key, value in binding.items()) and
                         type(reply['result']) is dict)
                if not valid:
                    raise ValueError
            except (ValueError, TypeError, KeyError, RecursionError):
                raise HubUnavailable('MCP Hub response binding invalid; retain the same request') from None
            try:
                return validate_result(request, reply['result'], self.device_ref)
            except (ValueError, TypeError, KeyError, RecursionError, OverflowError):
                raise HubUnavailable('MCP Hub operation result invalid; retain the same request') from None
        except _Unauthorized:
            raise PermissionError('MCP Hub access denied') from None
        except HubUnavailable:
            raise
        except _Rejected:
            # Only the deliberately generated HTTP400 is a known rejection.
            raise ValueError('MCP Hub request rejected') from None
        except (OSError, ValueError, http.client.HTTPException):
            raise HubUnavailable('MCP Hub transport unresolved; retain the same request') from None
        finally:
            if response is not None: response.close()
            if connection is not None: connection.close()
            if wire is not None: wire.close()
            if raw is not None: raw.close()


@contextmanager
def marker_lock(directory):
    fd = os.open(directory/'mcp-hub-binding.lock', os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    try:
        info = os.fstat(fd)
        require(stat.S_ISREG(info.st_mode) and info.st_uid == os.geteuid() and info.st_nlink == 1 and
                stat.S_IMODE(info.st_mode) == 0o600, 'private MCP binding lock required')
        fcntl.flock(fd, fcntl.LOCK_EX)
        yield
    finally:
        os.close(fd)


def resolve(state_dir, profile, config_path, ca_file):
    """Resolve local protected configuration without any network request.

    A malformed first configuration latches UNBOUND. Losing or changing a bound
    config never chooses a legacy endpoint. The same reviewed config can repair
    UNBOUND; existing bound history requires its original authority and profile.
    """
    status = {'configured': False, 'state': 'unavailable', 'simulation_only': True,
              'message': 'MCPの接続設定を確認してください。端末内の道具は利用できます。'}
    try:
        directory, path = Path(state_dir), Path(config_path)
        os_client.private_directory(directory)
        with marker_lock(directory):
            marker = directory/MARKER
            retained = os.path.lexists(marker)
            configured = os.path.lexists(path)
            required = os.path.lexists(path.with_suffix('.required'))
            if not retained and not configured and not required:
                return None, {**status, 'state': 'unconfigured', 'message': 'MCP接続は未設定です。'}
            unbound = {'schema': MARKER_SCHEMA, 'state': 'UNBOUND'}
            if not retained: os_client.write_marker(marker, unbound)
            require(configured, 'MCP configuration missing')
            require(isinstance(profile, os_client.Profile) and not profile.legacy_development and
                    profile.status.get('state') == 'configured' and profile.config is not None,
                    'configured purchaser profile required')
            purchaser = os_client.validate(profile.config)
            config = os_client.protected_read(path)
            require(type(config) is dict and set(config) == {'schema', 'gateway_origin'} and
                    config['schema'] == CONFIG_SCHEMA, 'strict MCP gateway configuration required')
            client = HubClient(config['gateway_origin'], ca_file, authority_id=purchaser['authority_id'],
                consumer_id=purchaser['consumer_id'], device_ref=purchaser['device_ref'], token=purchaser['token'])
            expected = {'schema': MARKER_SCHEMA, 'authority_id': purchaser['authority_id'],
                'consumer_id': purchaser['consumer_id'], 'device_ref': purchaser['device_ref'],
                'configuration_sha256': digest({'profile': purchaser, 'gateway': config, 'ca_sha256': client.ca_sha256})}
            previous = os_client.protected_read(marker, private=True)
            require(previous == unbound or previous == expected, 'MCP authority or configuration changed')
            if previous == unbound: os_client.write_marker(marker, expected)
            status.update(configured=True, state='configured', message='購入者サービスのMCP接続',
                          authority_id=client.authority_id, consumer_id=client.consumer_id,
                          device_ref=client.device_ref, gateway_origin=client.origin)
            return client, status
    except (OSError, ValueError, TypeError, KeyError, RecursionError):
        return None, status

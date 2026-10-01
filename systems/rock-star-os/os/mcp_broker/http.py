"""Pinned JSON-only MCP 2026-07-28 subset; no OAuth discovery or Tasks claim.

The extra intent metadata and status Tool are a separately configured provider
contract, NOT standard MCP exactly-once semantics. Never retry an effect call.
"""
from dataclasses import dataclass
import hashlib
import http.client
import ipaddress
import json
import math
from pathlib import Path
import re
import socket
import ssl
import time
import urllib.parse
import uuid

from runner.transport import DeadlineConnection

VERSION = '2026-07-28'
MAX_INPUT = 65536
MAX_BODY = 131072
INTENT_META = 'dev.rockstaros/intent'


class TransportError(OSError):
    pass


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'),
                      ensure_ascii=False, allow_nan=False).encode('utf-8')


def digest(value):
    return hashlib.sha256(canonical(value)).hexdigest()


def decode(data):
    def pairs(items):
        result = {}
        for key, value in items:
            if key in result:
                raise ValueError('duplicate JSON field')
            result[key] = value
        return result
    def constant(_):
        raise ValueError('non-finite JSON number')
    return json.loads(data.decode('utf-8'), object_pairs_hook=pairs, parse_constant=constant)


def identifier(value):
    if not isinstance(value, str) or not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._:-]{0,127}', value):
        raise ValueError('invalid bounded identifier')
    return value


@dataclass(frozen=True)
class ToolPolicy:
    """This initial adapter supports only one selected UTF-8 text argument."""
    name: str
    status_tool: str
    data_scope: str = 'user_selected_text'
    price_version: str = 'public-fixture-1'
    amount_minor: int = 0
    max_input_bytes: int = MAX_INPUT

    def contract(self):
        for value in (self.name, self.status_tool, self.data_scope, self.price_version):
            identifier(value)
        if self.name == self.status_tool:
            raise ValueError('effect and read-only recovery Tools must differ')
        if type(self.amount_minor) is not int or not 0 <= self.amount_minor <= 100000000:
            raise ValueError('invalid declared price')
        if type(self.max_input_bytes) is not int or not 1 <= self.max_input_bytes <= MAX_INPUT:
            raise ValueError('invalid text bound')
        return {'name': self.name, 'status_tool': self.status_tool,
                'input_schema': {'type': 'object', 'properties': {'text': {'type': 'string', 'maxLength': self.max_input_bytes}},
                                 'required': ['text'], 'additionalProperties': False},
                'output_schema': {'type': 'object', 'properties': {'text': {'type': 'string', 'maxLength': MAX_INPUT}},
                                  'required': ['text'], 'additionalProperties': False},
                'max_input_bytes': self.max_input_bytes, 'data_scope': self.data_scope,
                'price': {'currency': 'USD', 'amount_minor': self.amount_minor, 'version': self.price_version},
                'effect_contract': 'rock-mcp-effect-receipt/1', 'settlement': 'opaque_correlation_only'}


class MCPHttpClient:
    def __init__(self, origin, policies, *, authorization, ca_file=None,
                 allow_http_fixture=False, timeout=2.0, max_response_bytes=MAX_BODY,
                 upstream_principal=None):
        parsed = urllib.parse.urlsplit(origin)
        if (parsed.scheme not in ('https', 'http') or not parsed.hostname or parsed.username or parsed.password
                or parsed.query or parsed.fragment or parsed.path not in ('', '/')):
            raise ValueError('fixed origin required; no credentials/path/query/fragment')
        if parsed.scheme == 'http' and not (allow_http_fixture is True and parsed.hostname == '127.0.0.1'):
            raise ValueError('plain HTTP is restricted to explicit 127.0.0.1 development fixture')
        if parsed.scheme == 'https' and ca_file is None:
            raise ValueError('explicit CA required')
        try:
            ipaddress.ip_address(parsed.hostname)
        except ValueError:
            raise ValueError('this bounded adapter requires a configured literal IP; DNS discovery is not implemented') from None
        if upstream_principal is None and parsed.scheme == 'http' and allow_http_fixture is True:
            upstream_principal = 'PUBLIC-FIXTURE-OWNER'
        identifier(upstream_principal)
        if (not isinstance(authorization, str) or not authorization.startswith('Bearer ')
                or not 8 <= len(authorization) <= 4096 or any(ord(c) < 32 or ord(c) > 126 for c in authorization)):
            raise ValueError('bounded opaque bearer credential required')
        if type(timeout) not in (int, float) or not math.isfinite(timeout) or not 0.05 <= timeout <= 10:
            raise ValueError('timeout must be 0.05..10 seconds')
        if type(max_response_bytes) is not int or not 1024 <= max_response_bytes <= MAX_BODY:
            raise ValueError('invalid response bound')
        self._host, self._port, self._scheme = parsed.hostname, parsed.port, parsed.scheme
        self._origin = f'{parsed.scheme}://{parsed.netloc}'
        self._authorization, self.timeout, self.max_response_bytes = authorization, float(timeout), max_response_bytes
        self._ssl = ssl.create_default_context(cafile=str(ca_file)) if ca_file else None
        self._policies = {p.name: p.contract() for p in policies}
        if not self._policies or len(self._policies) > 32 or len(self._policies) != len(policies):
            raise ValueError('bounded unique Tool allowlist required')
        effects = set(self._policies)
        if any(p['status_tool'] in effects for p in self._policies.values()):
            raise ValueError('read-only status Tool cannot be an effect Tool')
        # Credential bytes never appear in the public descriptor or any receipt.
        self._descriptor = {'protocol': VERSION, 'origin': self._origin, 'path': '/mcp',
                            'upstream_principal': upstream_principal,
                            'transport': 'loopback_http_fixture' if parsed.scheme == 'http' else 'https_explicit_ca',
                            'ca_sha256': hashlib.sha256(Path(ca_file).read_bytes()).hexdigest() if ca_file else None,
                            'tools': self._policies, 'timeout_seconds': self.timeout,
                            'max_response_bytes': max_response_bytes}

    def descriptor(self):
        return decode(canonical(self._descriptor))

    def policy(self, name):
        if name not in self._policies:
            raise ValueError('Tool is not allowlisted')
        return decode(canonical(self._policies[name]))

    def _rpc(self, method, params, *, name=None, intent=None):
        request_id = str(uuid.uuid4())  # Transport ID; never replaces business key.
        meta = {'io.modelcontextprotocol/protocolVersion': VERSION,
                'io.modelcontextprotocol/clientCapabilities': {},
                'io.modelcontextprotocol/clientInfo': {'name': 'rock-mcp-broker', 'version': '0.3.0'}}
        if intent is not None:
            meta[INTENT_META] = intent
        payload = {'jsonrpc': '2.0', 'id': request_id, 'method': method, 'params': {**params, '_meta': meta}}
        body = canonical(payload)
        if len(body) > MAX_BODY:
            raise ValueError('request exceeds 128 KiB')
        headers = {'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream',
                   'MCP-Protocol-Version': VERSION, 'Mcp-Method': method, 'Authorization': self._authorization}
        if name is not None:
            headers['Mcp-Name'] = name
        deadline = time.monotonic() + self.timeout
        raw = wire = connection = response = None

        def remaining():
            left = deadline - time.monotonic()
            if left <= 0:
                raise TransportError('MCP absolute response deadline exceeded')
            return left

        try:
            # One budget covers TCP, TLS, request transmission, status/header
            # parsing and the body. Socket timeout alone restarts on every read.
            port = self._port or (443 if self._scheme == 'https' else 80)
            raw = socket.create_connection((self._host, port), timeout=remaining())
            wire = raw
            if self._ssl is not None:
                raw.settimeout(remaining())
                wire = self._ssl.wrap_socket(raw, server_hostname=self._host)
            wrapped = DeadlineConnection(wire, remaining())
            wrapped.deadline = deadline
            factory = http.client.HTTPSConnection if self._scheme == 'https' else http.client.HTTPConnection
            kwargs = {'context': self._ssl} if self._ssl else {}
            connection = factory(self._host, self._port, timeout=remaining(), **kwargs)
            connection.sock = wrapped
            connection.request('POST', '/mcp', body=body, headers={**headers, 'Connection': 'close'})
            response = connection.getresponse()
            remaining()
            # No redirects, SSE, retry, token refresh, or protocol-era fallback.
            if response.status != 200:
                raise TransportError(f'MCP HTTP response rejected ({response.status})')
            ctype = response.headers.get_all('Content-Type', [])
            lengths = response.headers.get_all('Content-Length', [])
            if (len(ctype) != 1 or ctype[0].split(';')[0].strip().lower() != 'application/json'
                    or len(lengths) != 1 or not lengths[0].isdigit() or response.getheader('Transfer-Encoding') is not None):
                raise TransportError('bounded JSON Content-Length response required')
            length = int(lengths[0])
            if length > self.max_response_bytes:
                raise TransportError('MCP response exceeds limit')
            data = bytearray()
            while len(data) < length:
                # read1 avoids waiting to fill the entire remaining body.
                wrapped.settimeout(remaining())
                chunk = response.read1(min(16384, length - len(data)))
                if not chunk:
                    raise TransportError('MCP response interrupted')
                data.extend(chunk)
            remaining()
            envelope = decode(bytes(data))
            if (not isinstance(envelope, dict) or set(envelope) != {'jsonrpc', 'id', 'result'}
                    or envelope['jsonrpc'] != '2.0' or envelope['id'] != request_id):
                raise TransportError('MCP response envelope/id mismatch or protocol error')
            result = envelope['result']
            if not isinstance(result, dict) or result.get('resultType') != 'complete':
                raise TransportError('MCP result requires unsupported continuation or has invalid type')
            return result
        except (OSError, ValueError, TypeError, http.client.HTTPException) as exc:
            # Never propagate a response body, token, arbitrary URL or raw text.
            if isinstance(exc, TransportError):
                raise
            raise TransportError(f'MCP transport unavailable ({type(exc).__name__})') from None
        finally:
            # HTTPConnection may detach its socket for Connection: close; retain
            # the original references so timeout/partial-response paths close it.
            for resource in (response, connection, wire, raw):
                if resource is not None:
                    try:
                        resource.close()
                    except OSError:
                        pass

    def discover(self):
        result = self._rpc('server/discover', {})
        versions, capabilities = result.get('supportedVersions'), result.get('capabilities')
        if (not isinstance(versions, list) or VERSION not in versions or len(versions) > 16
                or not isinstance(capabilities, dict) or not isinstance(capabilities.get('tools'), dict)
                or type(result.get('ttlMs')) not in (int, float) or not 0 <= result['ttlMs'] <= 86400000
                or result.get('cacheScope') not in ('public', 'private')):
            raise TransportError('server does not support required MCP subset')
        return {'protocol': VERSION, 'tools_available': True}

    def _receipt(self, result, business_key, consent_digest):
        value = result.get('structuredContent')
        if (not isinstance(result.get('content'), list) or type(result.get('isError', False)) is not bool
                or not isinstance(value, dict) or set(value) != {'schema', 'business_key', 'consent_digest', 'state', 'output', 'settlement_correlation'}
                or value['schema'] != 'rock-mcp-effect-receipt/1' or value['business_key'] != business_key
                or value['consent_digest'] != consent_digest or value['state'] not in ('succeeded', 'failed', 'unknown', 'not_found')):
            raise TransportError('provider effect receipt mismatch')
        if value['state'] in ('succeeded', 'failed'):
            output = value['output']
            if (not isinstance(output, dict) or set(output) != {'text'} or not isinstance(output['text'], str)
                    or len(output['text'].encode()) > MAX_INPUT):
                raise TransportError('provider output violates allowlisted schema')
            try:
                identifier(value['settlement_correlation'])
            except ValueError:
                raise TransportError('invalid opaque correlation') from None
        elif value['output'] is not None or value['settlement_correlation'] is not None:
            raise TransportError('unconfirmed receipt exposes a terminal result')
        return value

    def execute(self, name, text, *, business_key, consent_digest):
        policy = self.policy(name)
        if not isinstance(text, str) or len(text.encode()) > policy['max_input_bytes']:
            raise ValueError('input exceeds allowlisted schema')
        identifier(business_key)
        result = self._rpc('tools/call', {'name': name, 'arguments': {'text': text}}, name=name,
                           intent={'businessKey': business_key, 'consentDigest': consent_digest})
        return self._receipt(result, business_key, consent_digest)

    def reconcile(self, name, *, business_key, consent_digest):
        policy = self.policy(name)
        result = self._rpc('tools/call', {'name': policy['status_tool'],
                          'arguments': {'business_key': business_key, 'consent_digest': consent_digest}}, name=policy['status_tool'])
        return self._receipt(result, business_key, consent_digest)

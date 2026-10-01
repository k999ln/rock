"""Purchaser-bound, development-only HTTPS bridge for the native OS Hub.

The upstream MCP wire remains in http.py. This is Rock's private device API,
not an MCP protocol extension. Each consumer has a separate Broker and fixed
route allowlist; device requests cannot supply upstream URLs or credentials.
"""
from contextlib import closing
import fcntl
from http.server import BaseHTTPRequestHandler, HTTPServer
import io
import os
from pathlib import Path
import socketserver
import sqlite3
import ssl
import stat
import threading
from urllib.parse import urlsplit

from runner.transport import DeadlineReader, DeadlineSocket
from service_access.os_client import private_directory, protected_read, write_marker
from service_access.controller import ServiceConfigurationError
from .broker import Broker, AccessDenied, Unavailable
from .http import canonical, decode, digest, identifier
from .service_access import ServiceAccessPrincipalAdapter

MAX_WIRE = 262144
REQUEST_SCHEMA = 'rock-mcp-hub-request/1'
RESPONSE_SCHEMA = 'rock-mcp-hub-response/1'
FIELDS = {
    'mcp.snapshot': set(),
    'mcp.connect': {'alias', 'key'}, 'mcp.disconnect': {'alias', 'key'},
    'mcp.prepare': {'alias', 'input_sha256', 'input_bytes', 'key'}, 'mcp.submit': {'key', 'consent', 'text'},
    'mcp.status': {'key'}, 'mcp.reconcile': {'key'},
}


def validate_request(request):
    if (type(request) is not dict or type(request.get('v')) is not int or request.get('v') != 1
            or type(request.get('op')) is not str or request['op'] not in FIELDS
            or set(request) != {'v', 'op'} | FIELDS[request['op']]):
        raise ValueError('unknown Hub operation or fields')
    for name in ('alias', 'key'):
        if name in request:
            identifier(request[name])
    if 'text' in request and (type(request['text']) is not str or len(request['text'].encode()) > 65536):
        raise ValueError('selected text exceeds the input limit')
    if len(canonical(request)) > MAX_WIRE - 2048:
        raise ValueError('Hub request exceeds the wire limit')
    return request


class HubGateway:
    """One authority, configured consumer routes, and durable private histories.

connections = {consumer: {alias: {'label': str, 'tool': str, 'client': MCPHttpClient}}}
The initial integration admits free test Tools only. It does not charge Wallets
or turn opaque upstream correlation IDs into financial settlement evidence.
"""
    def __init__(self, state, controller, connections, *, clock=None, start_worker=True):
        self.directory = Path(state)
        private_directory(self.directory)
        self.authority_id, self.controller = controller.authority_id, controller
        self.adapter = ServiceAccessPrincipalAdapter(controller, authority_id=self.authority_id)
        self.brokers, self.connections = {}, {}
        self._closed, self._fd = False, None
        self._lifecycle = threading.RLock()
        self._fd = os.open(self.directory / 'gateway.lock', os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
        try:
            info = os.fstat(self._fd)
            if (not stat.S_ISREG(info.st_mode) or info.st_uid != os.geteuid()
                    or stat.S_IMODE(info.st_mode) != 0o600 or info.st_nlink != 1):
                raise ValueError('invalid gateway lock')
            fcntl.flock(self._fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            if type(connections) is not dict or not 1 <= len(connections) <= 32:
                raise ValueError('bounded consumer routes required')
            pinned = {}
            upstream_owners = {}
            for consumer, items in connections.items():
                identifier(consumer)
                if type(items) is not dict or not 1 <= len(items) <= 8:
                    raise ValueError('bounded named connections required')
                # The authority supplies ownership; configuration cannot choose it.
                binding = controller.snapshot(consumer)
                pinned[consumer] = {'owner_ref': binding['owner_ref'], 'device_ref': binding['device_ref'], 'routes': {}}
                self.connections[consumer] = {}
                for alias, item in items.items():
                    identifier(alias)
                    if (type(item) is not dict or set(item) != {'label', 'tool', 'client'}
                            or type(item['label']) is not str or not 1 <= len(item['label']) <= 64
                            or any(ord(c) < 32 for c in item['label'])):
                        raise ValueError('invalid configured connection')
                    identifier(item['tool'])
                    policy = item['client'].policy(item['tool'])
                    descriptor = item['client'].descriptor()
                    if urlsplit(descriptor['origin']).hostname != '127.0.0.1':
                        raise ValueError('this gateway requires an owned loopback upstream fixture')
                    upstream = (descriptor['origin'], descriptor['path'], descriptor['upstream_principal'])
                    if upstream in upstream_owners and upstream_owners[upstream] != binding['owner_ref']:
                        raise ValueError('different owners cannot share an upstream account binding')
                    upstream_owners[upstream] = binding['owner_ref']
                    if policy['price']['amount_minor'] != 0:
                        raise ValueError('priced Tool settlement is not connected to this development gateway')
                    self.connections[consumer][alias] = dict(item)
                    pinned[consumer]['routes'][alias] = {
                        'label': item['label'], 'tool': item['tool'], 'descriptor': item['client'].descriptor()}
            expected = {'schema': 'rock-mcp-hub-authority/1', 'authority_id': self.authority_id,
                        'configuration_sha256': digest(pinned)}
            marker = self.directory / 'binding.json'
            retained = marker.exists() or marker.is_symlink()
            if retained:
                if protected_read(marker, private=True) != expected:
                    raise ValueError('gateway authority or routes changed; explicit migration required')
                for consumer in connections:
                    database = self.directory / consumer / 'broker.sqlite3'
                    if not database.exists() or database.is_symlink() or database.stat().st_size == 0:
                        raise ValueError('retained gateway history is missing; recovery required')
            else:
                if set(p.name for p in self.directory.iterdir()) != {'gateway.lock'}:
                    raise ValueError('unbound retained gateway data requires recovery')
                # A interrupted first construction stays latched, never resets history.
                write_marker(marker, expected)
            for consumer, items in self.connections.items():
                self.brokers[consumer] = Broker(self.directory / consumer,
                    routes={alias: item['client'] for alias, item in items.items()}, principal_adapter=self.adapter,
                    **({'clock': clock} if clock is not None else {}))
            if start_worker:
                for broker in self.brokers.values():
                    broker.start()
        except BaseException:
            self.close()
            raise

    def dispatch(self, envelope, authorization):
        if self._closed:
            raise Unavailable('gateway is closed')
        if (type(envelope) is not dict
                or set(envelope) != {'schema', 'authority_id', 'consumer_id', 'device_ref', 'request'}
                or envelope['schema'] != REQUEST_SCHEMA or envelope['authority_id'] != self.authority_id):
            raise AccessDenied('gateway binding rejected')
        consumer = envelope['consumer_id']
        if type(consumer) is not str or consumer not in self.brokers:
            raise AccessDenied('consumer is not configured')
        auth = {'authority_id': self.authority_id, 'consumer_id': consumer, 'authorization': authorization}
        principal = self.adapter.authenticate(auth)
        if principal.device_ref != envelope['device_ref']:
            raise AccessDenied('device binding rejected')
        request = validate_request(envelope['request'])
        op, broker, items = request['op'], self.brokers[consumer], self.connections[consumer]
        alias = request.get('alias')
        if alias is not None and alias not in items:
            raise AccessDenied('connection is not configured for this consumer')
        if op == 'mcp.snapshot':
            # Authorize even a completely empty history before publishing routes.
            history = broker.history(auth=auth, limit=20)
            routes = []
            for name, item in items.items():
                # Missing connection differs from denied identity: the outer guard
                # ensures an AccessDenied cannot masquerade as a new connection.
                with self.adapter.guard(principal, 'recover'), broker.mutex, closing(broker._connect()) as db:
                    row = db.execute('SELECT state,epoch FROM connections WHERE subject=? AND device=? AND alias=?',
                                     (principal.subject, principal.device_ref, name)).fetchone()
                routes.append({'alias': name, 'label': item['label'], 'tool': item['tool'],
                    'state': row['state'] if row else 'unconnected', 'epoch': row['epoch'] if row else 0,
                    'route': item['client'].descriptor(), 'contract': item['client'].policy(item['tool'])})
            current = self.controller.snapshot(consumer)
            result = {'connections': routes, 'history': history, 'simulation_only': True,
                      'can_submit': 'runner.cloud.submit' in current['allowed_actions'],
                      'paid_state': current['paid_state'],
                      'provider_connected': False, 'financial_transaction': False,
                      'upstream_credential_revocation': 'NOT_IMPLEMENTED'}
        elif op == 'mcp.connect':
            result = broker.connect(alias, alias, key=request['key'], auth=auth)
        elif op == 'mcp.disconnect':
            result = broker.disconnect(alias, key=request['key'], auth=auth)
        elif op == 'mcp.prepare':
            result = broker.prepare_reference(alias, items[alias]['tool'], request['input_sha256'],
                                              request['input_bytes'], key=request['key'], auth=auth)
        elif op == 'mcp.submit':
            result = broker.submit(request['key'], request['consent'], text=request['text'], auth=auth)
        elif op == 'mcp.status':
            result = broker.status(request['key'], auth=auth)
        else:
            result = broker.reconcile(request['key'], auth=auth)
        reply = {'ok': True, 'schema': RESPONSE_SCHEMA, 'authority_id': self.authority_id,
                 'consumer_id': consumer, 'device_ref': principal.device_ref, 'result': result}
        if len(canonical(reply)) > MAX_WIRE:
            raise Unavailable('bounded gateway response exceeded')
        return reply

    def close(self):
        with self._lifecycle:
            errors = []
            for broker in self.brokers.values():
                try:
                    broker.close()
                except Exception as error:
                    errors.append(error)
            # Attempt each close; a live worker keeps its own lock and this
            # gateway's outer lock until a later successful shutdown.
            if errors:
                raise Unavailable('gateway worker shutdown incomplete; locks retained') from errors[0]
            if self._fd is not None:
                os.close(self._fd)
                self._fd = None
            self._closed = True


class Handler(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'

    def setup(self):
        super().setup()
        self.rfile.close()
        self.rfile = io.BufferedReader(DeadlineReader(DeadlineSocket(self.connection, 3)))

    def log_message(self, *_):
        pass

    def do_POST(self):
        self.close_connection = True
        try:
            lengths = self.headers.get_all('Content-Length', [])
            authorizations = self.headers.get_all('Authorization', [])
            if (self.path != '/v1/mcp-hub' or len(lengths) != 1 or not lengths[0].isascii()
                    or not lengths[0].isdigit() or not 1 <= int(lengths[0]) <= MAX_WIRE
                    or self.headers.get('Transfer-Encoding') is not None
                    or self.headers.get('Origin') is not None or len(authorizations) != 1
                    or self.headers.get_all('Content-Type', []) != ['application/json']):
                raise ValueError('invalid request framing')
            raw = self.rfile.read(int(lengths[0]))
            if len(raw) != int(lengths[0]):
                raise ValueError('incomplete request')
            result = self.server.gateway.dispatch(decode(raw), authorizations[0])
            self.respond(200, canonical(result))
        except PermissionError:
            self.respond(403, b'{"ok":false,"error":"current authorization required"}')
        except (OSError, sqlite3.Error, ServiceConfigurationError):
            self.respond(503, b'{"ok":false,"error":"outcome unavailable; retain the exact operation key"}')
        except (ValueError, TypeError, KeyError, RecursionError):
            self.respond(400, b'{"ok":false,"error":"request unavailable; retain the exact operation key"}')

    def respond(self, status, raw):
        try:
            self.send_response(status)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(raw)))
            self.send_header('Connection', 'close')
            self.end_headers()
            self.wfile.write(raw)
        except OSError:
            pass


class HubGatewayServer(socketserver.ThreadingMixIn, HTTPServer):
    allow_reuse_address = True
    daemon_threads = False
    block_on_close = True
    request_queue_size = 8

    def __init__(self, address, gateway, ca_file, key_file):
        if address[0] != '127.0.0.1':
            raise ValueError('development gateway must bind loopback')
        self.gateway = gateway
        self.slots = threading.BoundedSemaphore(8)
        self.context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        self.context.minimum_version = ssl.TLSVersion.TLSv1_2
        self.context.load_cert_chain(str(ca_file), str(key_file))
        super().__init__(address, Handler)

    def get_request(self):
        stream, address = self.socket.accept()
        stream.settimeout(3)
        try:
            return self.context.wrap_socket(stream, server_side=True), address
        except BaseException:
            stream.close()
            raise

    def process_request(self, request, client_address):
        if not self.slots.acquire(blocking=False):
            self.shutdown_request(request)
            return
        try:
            super().process_request(request, client_address)
        except BaseException:
            self.slots.release()
            raise

    def process_request_thread(self, request, client_address):
        try:
            super().process_request_thread(request, client_address)
        finally:
            self.slots.release()

    def handle_error(self, *_):
        pass

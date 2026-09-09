"""Single-authority, loopback TLS Wallet for one PUBLIC Alice fixture account.

The HTTP owner cannot mint/settle credit, advance time, or assert ATM payouts.
All ledger/consent/ATM writes and the scheduler reuse the existing WalletService.
Never attach a copied device Wallet or run a second local-writer fallback.
"""
import argparse
from contextlib import nullcontext
import fcntl
import hashlib
import hmac
from http.server import BaseHTTPRequestHandler, HTTPServer
import importlib.util
import io
import json
import os
from pathlib import Path
import signal
import socket
from socketserver import ThreadingMixIn
import ssl
import stat
import threading
import tempfile
import time
import uuid

ROOT = Path(__file__).resolve().parents[2]
_spec = importlib.util.spec_from_file_location('rock_backend_existing_platform', ROOT / 'os/platform/service.py')
platform_service = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(platform_service)
from blackberryrock.packages import canonical
from blackberryrock.wallet import WalletError
from entitlement.protocol import PUBLIC_TOKENS, EntitlementError, identifier

MAX_REQUEST, MAX_RESPONSE, MAX_HEADERS, MAX_SLOTS = 65536, 1024 * 1024, 16384, 12
DEFAULT_TIMEOUT = 15
PUBLIC_OWNER_TOKEN = PUBLIC_TOKENS['alice']
FIXTURES = ROOT / 'os/registry/fixtures'
OWNER_FIELDS = {
    'snapshot': set(), 'health': set(), 'wallet.membership': set(), 'wallet.billing.status': set(),
    'wallet.register': {'key'}, 'wallet.consent': {'key', 'accepted', 'terms_version'},
    'wallet.bill': {'key', 'period'}, 'wallet.atm.issue': {'key', 'amount_minor', 'atm_id'},
    'wallet.atm.status': {'withdrawal_id'}, 'wallet.atm.history': {'limit'},
    'wallet.atm.cancel': {'key', 'withdrawal_id'}, 'wallet.atm.expire': {'key', 'withdrawal_id'},
    'wallet.atm.timeout': {'key', 'withdrawal_id'},
}
AUTH_OWNER_FIELDS = {**OWNER_FIELDS,
    'wallet.auth.begin': {'key'},
    'wallet.auth.enroll': {'key', 'challenge_id', 'credential'},
    'wallet.auth.status': set(),
    'wallet.terms': {'key', 'accepted', 'terms_version'},
    'wallet.atm.quote': {'key', 'issue_key', 'amount_minor', 'atm_id'},
    'wallet.atm.issue': {'key', 'quote_id', 'credential'},
    'wallet.atm.quote.cancel': {'key', 'quote_id'},
}
AUTHORITY_SCHEMA = 'public-wallet-authority/1'
AUTHORITY_HEADER = 'X-Rock-Wallet-Authority'
DEVICE_HEADER = 'X-Rock-Wallet-Device'
DEVICE_MARKER = 'DEVICE-CREDENTIALS.json'
MAX_DEVICES = 32
# Explicit public fixture text, not a generated secret or production identity.
PUBLIC_SECOND_DEVICE_TOKEN = 'PUBLIC-FIXTURE-ENTITLEMENT-DEVICE-ALICE-B-v1'


def error(code, message):
    reply = {'ok': False, 'code': code, 'error': message}
    if code == 'unavailable':
        reply['retry_with_same_key'] = True
    return reply


def decode(raw):
    def unique(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise ValueError('duplicate JSON field')
            result[key] = value
        return result
    def nonfinite(_):
        raise ValueError('non-finite JSON')
    return json.loads(raw.decode('utf-8'), object_pairs_hook=unique, parse_constant=nonfinite)


def validate_request(request, *, authentication_required=True):
    if (not isinstance(request, dict) or type(request.get('v')) is not int or request['v'] != 1
            or not isinstance(request.get('op'), str)):
        raise ValueError('invalid protocol')
    op = request['op']
    allowed = AUTH_OWNER_FIELDS if authentication_required else OWNER_FIELDS
    if op not in allowed:
        raise PermissionError('operation not permitted for HTTP owner')
    if set(request) != {'v', 'op'} | allowed[op]:
        raise ValueError('unexpected fields')
    if 'key' in request and (not isinstance(request['key'], str) or not 1 <= len(request['key']) <= 128):
        raise ValueError('invalid request identity')
    return request


class DeadlineReader(io.RawIOBase):
    """Absolute receive deadline and separate bounded header/body byte budgets."""
    def __init__(self, connection, deadline):
        self.connection, self.deadline = connection, deadline
        self.remaining = MAX_HEADERS

    def readable(self):
        return True

    def readinto(self, buffer):
        remaining_time = self.deadline - time.monotonic()
        if remaining_time <= 0:
            raise TimeoutError('request expired')
        if self.remaining <= 0:
            raise ValueError('request byte budget exceeded')
        self.connection.settimeout(remaining_time)
        count = self.connection.recv_into(buffer, min(len(buffer), self.remaining))
        self.remaining -= count
        return count


class Handler(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'
    server_version = 'RockWalletDevelopment'
    sys_version = ''
    rbufsize = 0

    def setup(self):
        super().setup()
        self.rfile.close()
        self.deadline = self.server.connection_deadlines[threading.get_ident()]
        self.reader = DeadlineReader(self.connection, self.deadline)
        # Unbuffered read prevents header reads consuming uncounted body bytes.
        self.rfile = self.reader

    def log_message(self, *_):
        pass

    def send_error(self, code, message=None, explain=None):
        self.respond(code, error('rejected', 'invalid bounded HTTP request'))

    def handle_expect_100(self):
        self.respond(400, error('rejected', 'Expect is not supported'))
        return False

    def handle_one_request(self):
        try:
            super().handle_one_request()
        except (ValueError, TimeoutError, OSError):
            self.close_connection = True

    def respond(self, status, response):
        self.close_connection = True
        try:
            raw = canonical(response)
            if len(raw) > MAX_RESPONSE:
                status, raw = 503, canonical(error('unavailable', 'Wallet response exceeds limit; reconcile the same request'))
            remaining = self.deadline - time.monotonic()
            if remaining <= 0:
                return
            self.connection.settimeout(remaining)
            self.send_response(status)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(raw)))
            self.send_header('Connection', 'close')
            self.send_header('Cache-Control', 'no-store')
            self.send_header(AUTHORITY_HEADER, self.server.authority_id)
            if getattr(self, 'authenticated_device', None) is not None:
                self.send_header(DEVICE_HEADER, self.authenticated_device)
            self.end_headers()
            self.wfile.write(raw)
        except (OSError, ValueError, TypeError):
            pass  # Lost replies never roll back or repeat a committed operation.

    def do_POST(self):
        self.close_connection = True
        auth = self.headers.get_all('Authorization', [])
        device_ref = None
        if self.server.device_bound:
            if self.path != '/v2/wallet':
                self.respond(403, error('unauthorized', 'device-bound Wallet endpoint required'))
                return
            refs = self.headers.get_all(DEVICE_HEADER, [])
            device = self.server.device_credentials.get(refs[0]) if len(refs) == 1 else None
            if (device is None or len(auth) != 1 or
                    not hmac.compare_digest(auth[0].encode(), ('Bearer ' + device['token']).encode())):
                self.respond(401, error('unauthorized', 'purchased device credential required'))
                return
            device_ref = refs[0]
            self.authenticated_device = device_ref
        else:
            if len(auth) != 1 or not hmac.compare_digest(auth[0].encode(), ('Bearer ' + PUBLIC_OWNER_TOKEN).encode()):
                self.respond(401, error('unauthorized', 'Alice fixture owner authentication required'))
                return
        if self.headers.get_all(AUTHORITY_HEADER, []) != [self.server.authority_id]:
            self.respond(403, error('unauthorized', 'the pinned Wallet authority is required'))
            return
        lengths = self.headers.get_all('Content-Length', [])
        types = self.headers.get_all('Content-Type', [])
        expected_path = '/v2/wallet' if self.server.device_bound else '/v1/wallet'
        if (self.path != expected_path or len(lengths) != 1 or not lengths[0].isascii()
                or not lengths[0].isdigit() or len(lengths[0]) > 7
                or self.headers.get('Transfer-Encoding') is not None or self.headers.get('Expect') is not None
                or types != ['application/json']):
            self.respond(400, error('rejected', 'invalid path or HTTP framing'))
            return
        count = int(lengths[0])
        if not 1 <= count <= MAX_REQUEST:
            self.respond(413, error('rejected', 'request exceeds limit'))
            return
        admitted = False
        try:
            self.reader.remaining = count
            chunks, left = [], count
            while left:
                part = self.rfile.read(min(left, 16384))
                if not part:
                    raise ValueError('truncated body')
                chunks.append(part)
                left -= len(part)
            request = validate_request(decode(b''.join(chunks)),
                                       authentication_required=self.server.authentication_required)
        except PermissionError:
            self.respond(403, error('unauthorized', 'operation not permitted for HTTP owner'))
            return
        except (ValueError, UnicodeError, RecursionError, TimeoutError, OSError):
            self.respond(400, error('rejected', 'invalid bounded Wallet request'))
            return
        try:
            if time.monotonic() >= self.deadline:
                return  # Expired complete frames must not start another dispatch.
            # This peer UID is derived here after transport authentication. It
            # cannot be supplied by the HTTP body or used to reach root ATM ops.
            scope = (self.server.service.membership.device_scope(device_ref, 'alice')
                     if self.server.device_bound else nullcontext())
            with scope:
                admitted = True
                if time.monotonic() >= self.deadline:
                    return  # Waiting for device/Store locks cannot renew a request deadline.
                reply = self.server.service.dispatch(request, peer_uid=1002)
                # Read the optional purchaser-service projection under this
                # authenticated device's existing authority/Store scope. It is
                # information for the UI, never a reusable admission grant.
                provider = self.server.service_status_provider
                if request['op'] == 'snapshot' and reply.get('ok') is True and provider is not None:
                    try:
                        status = provider(device_ref)
                    except (ValueError, RuntimeError):
                        status = None
                    reply['snapshot']['service_access'] = status
            if not isinstance(reply, dict) or type(reply.get('ok')) is not bool:
                raise RuntimeError('invalid service response')
            self.respond(200, reply)
        except (EntitlementError, WalletError, PermissionError, ValueError):
            if not admitted:
                self.respond(403, error('unauthorized', 'current purchased device eligibility required'))
            else:
                self.respond(400, error('rejected', 'Wallet policy rejected the operation'))
        except Exception:
            self.respond(503, error('unavailable', 'Wallet result is unresolved; retry the same request key'))


class WalletBackendServer(ThreadingMixIn, HTTPServer):
    """One bounded TLS listener owns one fresh fixture Wallet and its scheduler.

    A network deadline closes the connection, not an in-flight SQLite commit.
    Such a worker retains its slot until it completes; no extra writer is spawned.
    Shutdown joins workers before closing the scheduler and releasing ownership.
    """
    allow_reuse_address = True
    request_queue_size = MAX_SLOTS
    daemon_threads = False
    block_on_close = True

    def __init__(self, address, state, *, provisioning_file=None, cert_file=None, key_file=None, device_credentials_file=None,
                 start_scheduler=True, clock=None, timeout=DEFAULT_TIMEOUT, authentication_required=True,
                 max_automatic_failures=3, service_status_provider=None):
        if service_status_provider is not None and not callable(service_status_provider):
            raise ValueError('service status provider must be callable')
        self.service_status_provider = service_status_provider
        if type(authentication_required) is not bool:
            raise ValueError('explicit Wallet authentication mode must be boolean')
        self.authentication_required = authentication_required
        if address[0] not in ('127.0.0.1', 'localhost'):
            raise ValueError('development Wallet binds loopback only')
        if type(address[1]) is not int or not 0 <= address[1] <= 65535 or type(timeout) not in (int, float) or not 0.1 <= timeout <= 30:
            raise ValueError('invalid bounded listener configuration')
        self.state = Path(state).absolute()
        self.state.mkdir(parents=True, mode=0o700, exist_ok=True)
        info = self.state.lstat()
        if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.geteuid() or stat.S_IMODE(info.st_mode) != 0o700:
            raise ValueError('Wallet authority state must be owned mode 0700 directory')
        self._reject_unmarked_import()
        self.lock_fd = os.open(self.state / 'authority.lock', os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
        self.service, self._closed = None, False
        try:
            info = os.fstat(self.lock_fd)
            if (not stat.S_ISREG(info.st_mode) or info.st_uid != os.geteuid()
                    or stat.S_IMODE(info.st_mode) != 0o600 or info.st_nlink != 1):
                raise ValueError('invalid authority singleton lock')
            fcntl.flock(self.lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            self._mark_fresh_authority()
            self._check_existing_storage()
            self.device_credentials = self._configure_devices(device_credentials_file)
            self.device_bound = self.device_credentials is not None
            self.context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
            self.context.minimum_version = ssl.TLSVersion.TLSv1_2
            self.context.load_cert_chain(str(cert_file or FIXTURES / 'development-ca.pem'),
                                         str(key_file or FIXTURES / 'PUBLIC-FIXTURE-KEY.pem'))
            options = {'contract_devices': True} if self.device_bound else {}
            self.service = platform_service.WalletService(self.state,
                provisioning_file=provisioning_file or ROOT / 'os/entitlement/fixtures/device-handoff.json',
                start_scheduler=False, clock=clock, authentication_required=authentication_required,
                authority_id=self.authority_id, max_automatic_failures=max_automatic_failures, **options)
            if (self.service.membership._binding() or {}).get('owner_actor') != 'alice':
                raise ValueError('only the provisioned Alice fixture authority is supported')
            self.request_timeout = timeout
            self.slots = threading.BoundedSemaphore(MAX_SLOTS)
            self.connection_deadlines = {}
            super().__init__(('127.0.0.1', address[1]), Handler)
            if start_scheduler:
                self.service.membership.start()
        except BaseException:
            if hasattr(self, 'socket'):
                self.socket.close()
            if self.service is not None:
                self.service.close()
            if self.lock_fd is not None:
                os.close(self.lock_fd)
                self.lock_fd = None
            raise

    @staticmethod
    def _protected_json(path, limit, *, private=False):
        descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
        with os.fdopen(descriptor, 'rb') as stream:
            info = os.fstat(stream.fileno())
            if (not stat.S_ISREG(info.st_mode) or info.st_uid not in (0, os.geteuid()) or info.st_nlink != 1
                    or info.st_mode & 0o022 or info.st_size > limit
                    or private and (info.st_uid != os.geteuid() or stat.S_IMODE(info.st_mode) != 0o600)):
                raise ValueError('device credential configuration must be a protected regular file')
            raw = stream.read(limit + 1)
        if len(raw) > limit:
            raise ValueError('device credential configuration exceeds limit')
        return decode(raw)

    @staticmethod
    def _device_mapping(value, *, hashed=False):
        required = {'schema_version', 'kind', 'devices'} | ({'authority_id'} if hashed else set())
        kind = 'public-device-bound-authority' if hashed else 'public-development-device-credentials'
        if (not isinstance(value, dict) or set(value) != required or type(value['schema_version']) is not int
                or value['schema_version'] != 1 or value['kind'] != kind
                or not isinstance(value['devices'], list) or not 1 <= len(value['devices']) <= MAX_DEVICES):
            raise ValueError('invalid bounded device credential configuration')
        mapping, tokens = {}, set()
        token_field = 'token_sha256' if hashed else 'token'
        for device in value['devices']:
            if not isinstance(device, dict) or set(device) != {'device_ref', 'owner_actor', token_field}:
                raise ValueError('invalid device credential fields')
            ref = identifier(device['device_ref'], fixture=True)
            token = device[token_field]
            if device['owner_actor'] != 'alice' or not isinstance(token, str):
                raise ValueError('only public Alice fixture devices are supported')
            if hashed:
                valid = len(token) == 64 and all(character in '0123456789abcdef' for character in token)
            else:
                valid = (16 <= len(token) <= 256 and token.startswith('PUBLIC-FIXTURE-')
                         and all(33 <= ord(character) <= 126 for character in token))
            if not valid or ref in mapping or token in tokens:
                raise ValueError('invalid or duplicate device credential identity')
            mapping[ref] = dict(device)
            tokens.add(token)
        return mapping

    def _configure_devices(self, config_path):
        marker_path = self.state / DEVICE_MARKER
        old = None
        if marker_path.exists() or marker_path.is_symlink():
            stored = self._protected_json(marker_path, MAX_REQUEST, private=True)
            old = self._device_mapping(stored, hashed=True)
            if stored['authority_id'] != self.authority_id:
                raise ValueError('device credential marker belongs to another authority')
        if self.authority_device_bound and old is None:
            raise ValueError('bound authority credential history is missing; explicit recovery required')
        if config_path is None:
            if old is not None:
                raise ValueError('bound Wallet authority requires its device credentials; no legacy fallback')
            return None
        mapping = self._device_mapping(self._protected_json(config_path, MAX_REQUEST))
        hashed = {ref: {'device_ref': ref, 'owner_actor': row['owner_actor'],
                        'token_sha256': hashlib.sha256(row['token'].encode()).hexdigest()} for ref, row in mapping.items()}
        if old is not None and any(ref not in hashed or hashed[ref] != row for ref, row in old.items()):
            raise ValueError('device credential mappings are append-only; existing bindings cannot be removed or changed')
        if old != hashed:
            value = {'schema_version': 1, 'kind': 'public-device-bound-authority', 'authority_id': self.authority_id,
                     'devices': [hashed[ref] for ref in sorted(hashed)]}
            self._write_private_marker(marker_path, value)
        if not self.authority_device_bound:
            # Legacy readers reject the new explicit field before opening a
            # ledger. If a crash precedes this second write, the device marker
            # above still prevents this reader from falling back to v1.
            self._write_private_marker(self.state / 'AUTHORITY.json',
                {'schema': AUTHORITY_SCHEMA, 'owner': 'alice', 'migration': False,
                 'authority_id': self.authority_id, 'device_bound': True})
            self.authority_device_bound = True
        return mapping

    def _write_private_marker(self, path, value):
        descriptor, temporary = tempfile.mkstemp(prefix='.authority-mode-', dir=self.state)
        try:
            with os.fdopen(descriptor, 'wb') as stream:
                stream.write(canonical(value) + b'\n'); stream.flush(); os.fsync(stream.fileno())
            os.replace(temporary, path)
            directory = os.open(self.state, os.O_RDONLY | os.O_DIRECTORY)
            try:
                os.fsync(directory)
            finally:
                os.close(directory)
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)

    def _reject_unmarked_import(self):
        marker = self.state / 'AUTHORITY.json'
        if not marker.exists() and not marker.is_symlink():
            if {path.name for path in self.state.iterdir()} - {'authority.lock'}:
                raise ValueError('refuse device-state import; use a fresh backend account directory')

    def _check_existing_storage(self):
        # Check before SQLite can follow, recover, or mutate any existing file.
        names = ['device.lock'] + [name + suffix for name in ('wallet-simulator.db', 'entitlement.db')
                                  for suffix in ('', '-wal', '-shm', '-journal')]
        for name in names:
            try:
                info = (self.state / name).lstat()
            except FileNotFoundError:
                continue
            if (not stat.S_ISREG(info.st_mode) or info.st_uid != os.geteuid() or info.st_nlink != 1
                    or stat.S_IMODE(info.st_mode) != 0o600):
                raise ValueError('invalid private authority storage')

    def _mark_fresh_authority(self):
        marker = self.state / 'AUTHORITY.json'
        if marker.exists() or marker.is_symlink():
            descriptor = os.open(marker, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
            with os.fdopen(descriptor, 'rb') as source:
                info = os.fstat(source.fileno())
                if (not stat.S_ISREG(info.st_mode) or info.st_uid != os.geteuid()
                        or stat.S_IMODE(info.st_mode) != 0o600 or info.st_nlink != 1 or info.st_size > 1024):
                    raise ValueError('invalid authority marker')
                try:
                    value = decode(source.read(1025))
                    identifier = uuid.UUID(value['authority_id'])
                    base_fields = {'schema', 'owner', 'migration', 'authority_id'}
                    if (set(value) not in (base_fields, base_fields | {'device_bound'})
                            or value['schema'] != AUTHORITY_SCHEMA or value['owner'] != 'alice'
                            or value['migration'] is not False or identifier.version != 4
                            or str(identifier) != value['authority_id']
                            or 'device_bound' in value and value['device_bound'] is not True):
                        raise ValueError('invalid authority marker')
                except (ValueError, KeyError, TypeError, AttributeError, UnicodeError, RecursionError) as exc:
                    raise ValueError('invalid authority marker') from exc
                self.authority_id = str(identifier)
                self.authority_device_bound = value.get('device_bound', False)
        else:
            self._reject_unmarked_import()
            self.authority_id = str(uuid.uuid4())
            self.authority_device_bound = False
            value = {'schema': AUTHORITY_SCHEMA, 'owner': 'alice', 'migration': False,
                     'authority_id': self.authority_id}
            descriptor = os.open(marker, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
            with os.fdopen(descriptor, 'wb') as destination:
                destination.write(canonical(value) + b'\n')
                destination.flush()
                os.fsync(destination.fileno())
            descriptor = os.open(self.state, os.O_RDONLY)
            try:
                os.fsync(descriptor)
            finally:
                os.close(descriptor)

    def process_request(self, request, client_address):
        if not self.slots.acquire(blocking=False):
            request.close()
            return
        try:
            super().process_request(request, client_address)
        except BaseException:
            self.slots.release()
            raise

    def process_request_thread(self, request, client_address):
        identity = threading.get_ident()
        self.connection_deadlines[identity] = time.monotonic() + self.request_timeout
        live = [request]
        def expire():
            try:
                live[0].shutdown(socket.SHUT_RDWR)
            except OSError:
                pass
        timer = threading.Timer(self.request_timeout, expire)
        timer.daemon = True
        timer.start()
        try:
            request.settimeout(self.request_timeout)
            request = self.context.wrap_socket(request, server_side=True, do_handshake_on_connect=False)
            live[0] = request
            request.do_handshake()
            self.finish_request(request, client_address)
        except Exception:
            pass  # Suppress payload-bearing tracebacks, including TLS input.
        finally:
            timer.cancel()
            self.shutdown_request(request)
            self.connection_deadlines.pop(identity, None)
            self.slots.release()

    def handle_error(self, request, client_address):
        pass

    def server_close(self):
        if self._closed:
            return
        super().server_close()  # Wait for all actual dispatches, not just replies.
        if self.service is not None:
            self.service.close()
            worker = self.service.membership.thread
            if worker is not None and worker.is_alive():
                raise RuntimeError('scheduler still owns authority; lock not released')
        os.close(self.lock_fd)
        self.lock_fd = None
        self._closed = True
        # The callback may be a bound method of the owning composite authority.
        # Release it only after listener workers, scheduler and ownership close
        # successfully; failed closes retain it for an ordinary retry.
        self.service_status_provider = None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--bind', default='127.0.0.1')
    parser.add_argument('--port', type=int, default=9445)
    parser.add_argument('--state', type=Path, required=True)
    parser.add_argument('--provisioning-file', type=Path)
    parser.add_argument('--device-credentials-file', type=Path, help='protected append-only public fixture mapping; enables /v2/wallet')
    parser.add_argument('--cert', type=Path)
    parser.add_argument('--fixture-key', type=Path)
    args = parser.parse_args()
    os.umask(0o077)
    stop = threading.Event()
    with WalletBackendServer((args.bind, args.port), args.state, provisioning_file=args.provisioning_file,
                             cert_file=args.cert, key_file=args.fixture_key, device_credentials_file=args.device_credentials_file) as server:
        thread = threading.Thread(target=server.serve_forever, kwargs={'poll_interval': 0.1})
        previous = {sig: signal.signal(sig, lambda *_: stop.set()) for sig in (signal.SIGINT, signal.SIGTERM)}
        thread.start()
        try:
            print('ROCK_WALLET_BACKEND_READY https://127.0.0.1:' + str(server.server_port)
                  + ' authority_id=' + server.authority_id + ' PUBLIC_FIXTURE_ONLY', flush=True)
            stop.wait()
        finally:
            server.shutdown()
            thread.join()
            for sig, handler in previous.items():
                signal.signal(sig, handler)


if __name__ == '__main__':
    main()

"""Loopback TLS Wallet: legacy Alice profile or explicit managed owner runtimes.

The HTTP owner cannot mint/settle credit, advance time, or assert ATM payouts.
All ledger/consent/ATM writes and the scheduler reuse the existing WalletService.
Never attach a copied device Wallet or run a second local-writer fallback.
"""
import argparse
import hmac
from http.server import BaseHTTPRequestHandler, HTTPServer
import io
import json
import os
from pathlib import Path
import signal
import socket
from socketserver import ThreadingMixIn
import ssl
import threading
import time

from wallet_backend.contract_runtime import (ROOT, platform_service, FIXTURES, PUBLIC_OWNER_TOKEN,
    PUBLIC_SECOND_DEVICE_TOKEN, AUTHORITY_SCHEMA, AUTHORITY_HEADER, DEVICE_HEADER,
    DEVICE_MARKER, MAX_DEVICES, OWNER_FIELDS, AUTH_OWNER_FIELDS, decode, validate_request,
    _LegacyContractRuntime, write_private_marker)
from wallet_backend.runtime_contracts import RuntimeAdmissionRejected
from blackberryrock.packages import canonical
from blackberryrock.wallet import WalletError
from entitlement.protocol import PUBLIC_TOKENS, EntitlementError

MAX_REQUEST, MAX_RESPONSE, MAX_HEADERS, MAX_SLOTS = 65536, 1024 * 1024, 16384, 12
DEFAULT_TIMEOUT = 15


def error(code, message):
    reply = {'ok': False, 'code': code, 'error': message}
    if code == 'unavailable':
        reply['retry_with_same_key'] = True
    return reply


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
            authority = getattr(self, 'authenticated_authority', None)
            if authority is None and not getattr(self.server, 'managed_contracts', False):
                authority = self.server.authority_id
            if authority is not None:
                self.send_header(AUTHORITY_HEADER, authority)
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
            admitted = True
            reply = self.server._runtime.dispatch(request, device_ref=device_ref, deadline=self.deadline)
            if not isinstance(reply, dict) or type(reply.get('ok')) is not bool:
                raise RuntimeError('invalid service response')
            self.respond(200, reply)
        except RuntimeAdmissionRejected:
            self.respond(403, error('unauthorized', 'current purchased device eligibility required'))
        except (EntitlementError, WalletError, PermissionError, ValueError):
            if not admitted:
                self.respond(403, error('unauthorized', 'current purchased device eligibility required'))
            else:
                self.respond(400, error('rejected', 'Wallet policy rejected the operation'))
        except Exception:
            self.respond(503, error('unavailable', 'Wallet result is unresolved; retry the same request key'))


class _TLSWalletListener(ThreadingMixIn, HTTPServer):
    allow_reuse_address = True
    request_queue_size = MAX_SLOTS
    daemon_threads = False
    block_on_close = True

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


class WalletBackendServer(_TLSWalletListener):
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
        if type(authentication_required) is not bool:
            raise ValueError('explicit Wallet authentication mode must be boolean')
        self.authentication_required = authentication_required
        if address[0] not in ('127.0.0.1', 'localhost'):
            raise ValueError('development Wallet binds loopback only')
        if type(address[1]) is not int or not 0 <= address[1] <= 65535 or type(timeout) not in (int, float) or not 0.1 <= timeout <= 30:
            raise ValueError('invalid bounded listener configuration')
        self.state = Path(state).absolute()
        self._runtime, self._closed = None, False
        try:
            self._runtime = _LegacyContractRuntime(self.state, provisioning_file=provisioning_file,
                device_credentials_file=device_credentials_file, clock=clock,
                authentication_required=authentication_required, max_automatic_failures=max_automatic_failures,
                service_status_provider=service_status_provider, _marker_writer=self._write_private_marker)
            self.context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
            self.context.minimum_version = ssl.TLSVersion.TLSv1_2
            self.context.load_cert_chain(str(cert_file or FIXTURES / 'development-ca.pem'),
                                         str(key_file or FIXTURES / 'PUBLIC-FIXTURE-KEY.pem'))
            self.request_timeout = timeout
            self.slots = threading.BoundedSemaphore(MAX_SLOTS)
            self.connection_deadlines = {}
            super().__init__(('127.0.0.1', address[1]), Handler)
            if start_scheduler:
                self._runtime.start_scheduler()
        except BaseException:
            if hasattr(self, 'socket'):
                self.socket.close()
            if self._runtime is not None:
                self._runtime.close()
            raise

    @property
    def service_status_provider(self):
        return self._runtime.service_status_provider

    @service_status_provider.setter
    def service_status_provider(self, provider):
        self._runtime.service_status_provider = provider

    @property
    def service(self):
        return self._runtime.service

    @property
    def authority_id(self):
        return self._runtime.authority_id

    @property
    def lock_fd(self):
        return self._runtime.lock_fd

    @property
    def device_credentials(self):
        return self._runtime.device_credentials

    @property
    def device_bound(self):
        return self._runtime.device_bound

    def _write_private_marker(self, path, value):
        # Preserve the historical private crash-injection hook, using the same
        # runtime writer. This is not a managed runtime extension point.
        return write_private_marker(self.state, path, value)

    def server_close(self):
        if self._closed:
            return
        super().server_close()  # Wait for all actual dispatches, not just replies.
        self._runtime.close()
        self._closed = True
        # The callback may be a bound method of the owning composite authority.
        # Release it only after listener workers, scheduler and ownership close
        # successfully; failed closes retain it for an ordinary retry.
        self.service_status_provider = None


class ManagedHandler(Handler):
    """Explicit v3 entry; all identity and responses are request-local."""
    def do_POST(self):
        self.close_connection = True
        if self.path != '/v3/wallet':
            self.respond(403, error('unauthorized', 'managed Wallet endpoint required'))
            return
        auth = self.headers.get_all('Authorization', [])
        devices = self.headers.get_all(DEVICE_HEADER, [])
        authorities = self.headers.get_all(AUTHORITY_HEADER, [])
        if (len(auth) != 1 or not auth[0].startswith('Bearer ') or not auth[0][7:]
                or len(devices) != 1 or len(authorities) != 1):
            self.respond(401, error('unauthorized', 'purchased device credential required'))
            return
        try:
            principal = self.server.router.authenticate(devices[0], auth[0][7:], authorities[0])
            runtime = self.server.router.resolve(principal)
            self.authenticated_device = principal.device_ref
            self.authenticated_authority = runtime.descriptor.wallet_authority_id
        except (PermissionError, ValueError):
            self.respond(401, error('unauthorized', 'purchased device credential required'))
            return
        except Exception:
            self.respond(503, error('unavailable', 'Wallet authority is unavailable'))
            return
        lengths = self.headers.get_all('Content-Length', [])
        types = self.headers.get_all('Content-Type', [])
        if (len(lengths) != 1 or not lengths[0].isascii() or not lengths[0].isdigit() or len(lengths[0]) > 7
                or self.headers.get('Transfer-Encoding') is not None or self.headers.get('Expect') is not None
                or types != ['application/json']):
            self.respond(400, error('rejected', 'invalid path or HTTP framing'))
            return
        count = int(lengths[0])
        if not 1 <= count <= MAX_REQUEST:
            self.respond(413, error('rejected', 'request exceeds limit'))
            return
        try:
            self.reader.remaining = count
            chunks, left = [], count
            while left:
                part = self.rfile.read(min(left, 16384))
                if not part:
                    raise ValueError('truncated body')
                chunks.append(part)
                left -= len(part)
            request = validate_request(decode(b''.join(chunks)), authentication_required=True)
        except PermissionError:
            self.respond(403, error('unauthorized', 'operation not permitted for HTTP owner'))
            return
        except (ValueError, UnicodeError, RecursionError, TimeoutError, OSError):
            self.respond(400, error('rejected', 'invalid bounded Wallet request'))
            return
        try:
            if time.monotonic() >= self.deadline:
                return
            reply = runtime.dispatch(principal, request, deadline=self.deadline)
            if not isinstance(reply, dict) or type(reply.get('ok')) is not bool:
                raise RuntimeError('invalid service response')
            self.respond(200, reply)
        except RuntimeAdmissionRejected:
            self.respond(403, error('unauthorized', 'current purchased device eligibility required'))
        except (EntitlementError, WalletError, PermissionError, ValueError):
            self.respond(400, error('rejected', 'Wallet policy rejected the operation'))
        except Exception:
            self.respond(503, error('unavailable', 'Wallet result is unresolved; retry the same request key'))


class ManagedWalletBackendServer(_TLSWalletListener):
    """One bounded listener for already-opened managed contracts, explicit v3.

    Ownership transfers to this server once initialization begins. On failure,
    every runtime is closed; a failed close retains that runtime/router ownership
    for explicit caller cleanup. No legacy global service or fallback is exposed.
    """
    managed_contracts = True

    def __init__(self, address, *, router, runtimes, cert_file=None, key_file=None,
                 start_scheduler=True, timeout=DEFAULT_TIMEOUT):
        if address[0] not in ('127.0.0.1', 'localhost'):
            raise ValueError('development Wallet binds loopback only')
        if (type(address[1]) is not int or not 0 <= address[1] <= 65535
                or type(timeout) not in (int, float) or not 0.1 <= timeout <= 30):
            raise ValueError('invalid bounded listener configuration')
        if not isinstance(runtimes, tuple) or not runtimes or len({id(runtime) for runtime in runtimes}) != len(runtimes):
            raise ValueError('distinct managed runtime tuple required')
        self.router, self.runtimes, self._closed = router, runtimes, False
        try:
            router.bind_runtimes(runtimes)
            self.context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
            self.context.minimum_version = ssl.TLSVersion.TLSv1_2
            self.context.load_cert_chain(str(cert_file or FIXTURES / 'development-ca.pem'),
                                         str(key_file or FIXTURES / 'PUBLIC-FIXTURE-KEY.pem'))
            self.request_timeout = timeout
            self.slots = threading.BoundedSemaphore(MAX_SLOTS)
            self.connection_deadlines = {}
            super().__init__(('127.0.0.1', address[1]), ManagedHandler)
            if start_scheduler:
                for runtime in runtimes:
                    runtime.start_scheduler()
        except BaseException:
            if hasattr(self, 'socket'):
                self.socket.close()
            self._close_contracts()
            raise

    def _close_contracts(self):
        failures = []
        for runtime in reversed(self.runtimes):
            try:
                runtime.close()
            except BaseException as exc:
                failures.append(exc)
        if failures:
            # Router remains available to finish original ownership. It must
            # not be reopened/retired while any runtime writer is still live.
            raise RuntimeError('managed runtime shutdown incomplete; ownership retained') from failures[0]
        self.router.close()

    def server_close(self):
        if self._closed:
            return
        super().server_close()  # Join real TLS workers before runtime release.
        self._close_contracts()
        self._closed = True


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

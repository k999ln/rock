"""Owned TLS/Unix fixture listeners derive target from their actual transport."""
import errno
import io
from http.server import BaseHTTPRequestHandler, HTTPServer
import os
from pathlib import Path
import socket
import ssl
import stat
import struct

from blackberryrock.packages import canonical
from .protocol import MAX_WIRE, AuthenticationError, RunnerError, decode, read_frame, write_frame
from .transport import DeadlineSocket, DeadlineReader


class Handler(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'

    def setup(self):
        super().setup()
        self.rfile.close()
        self.rfile = io.BufferedReader(DeadlineReader(DeadlineSocket(self.connection, 3)))

    def log_message(self, *_):
        pass  # Never log input text, owner tokens or complete requests.

    def do_POST(self):
        self.close_connection = True
        try:
            self.connection.settimeout(3)
            lengths = self.headers.get_all('Content-Length', [])
            if (self.path != '/v1/runner' or len(lengths) != 1 or not lengths[0].isascii()
                    or not lengths[0].isdigit() or self.headers.get('Transfer-Encoding') is not None
                    or self.headers.get('Content-Type') != 'application/json'):
                raise RunnerError('unsupported path or ambiguous request framing')
            count = int(lengths[0])
            if not 1 <= count <= MAX_WIRE:
                raise RunnerError('request exceeds wire limit')
            # Unbuffered request input with a total deadline defeats slow drip bodies.
            stream = DeadlineSocket(self.connection, 3)
            chunks = []
            while count:
                stream._arm()
                part = self.rfile.read1(min(count, 65536))
                if not part:
                    raise RunnerError('truncated HTTP request')
                chunks.append(part)
                count -= len(part)
            envelope = decode(b''.join(chunks))
            value = self.server.store.dispatch(envelope, transport_target='cloud',
                                               transport_evidence='pinned_tls_loopback_fixture')
            self.respond(200, canonical(value))
        except AuthenticationError:
            self.respond(401, b'{"error":"owner authentication failed"}')
        except (RunnerError, ValueError, OSError):
            self.respond(400, b'{"error":"invalid bounded runner request"}')

    def respond(self, status, raw):
        try:
            self.send_response(status)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(raw)))
            self.send_header('Connection', 'close')
            self.end_headers()
            self.wfile.write(raw)
        except OSError:
            pass  # The committed job survives an unobservable reply.


class TLSRunnerServer(HTTPServer):
    allow_reuse_address = True
    request_queue_size = 8

    def __init__(self, address, store, ca_file, key_file, handler=Handler):
        if address[0] != '127.0.0.1':
            raise RunnerError('development TLS runner must bind 127.0.0.1')
        if store.target != 'cloud' or store.transport_evidence != 'pinned_tls_loopback_fixture':
            raise RunnerError('TLS listener requires cloud fixture endpoint')
        self.store = store
        self.context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        self.context.minimum_version = ssl.TLSVersion.TLSv1_2
        self.context.load_cert_chain(str(ca_file), str(key_file))
        super().__init__(address, handler)

    def get_request(self):
        stream, address = self.socket.accept()
        stream.settimeout(3)
        try:
            return self.context.wrap_socket(stream, server_side=True), address
        except BaseException:
            stream.close()
            raise

    def handle_error(self, request, client_address):
        # No payload-bearing traceback; malformed requests have bounded lifetimes.
        pass


class UnixRunnerServer:
    def __init__(self, path, store, *, allowed_uids=None):
        if store.target != 'pc_usb' or store.transport_evidence != 'authenticated_unix_fixture':
            raise RunnerError('Unix listener requires explicit PC-link fixture endpoint')
        self.store, self.path = store, Path(path)
        self.allowed_uids = {os.geteuid()} if allowed_uids is None else set(allowed_uids)
        self.path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        info = self.path.parent.lstat()
        if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.geteuid() or info.st_mode & 0o077:
            raise RunnerError('Unix socket directory must be service-owned and private')
        if os.path.lexists(self.path):
            info = self.path.lstat()
            if not stat.S_ISSOCK(info.st_mode) or info.st_uid != os.geteuid():
                raise RunnerError('refusing to replace unexpected Unix endpoint')
            with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as probe:
                probe.settimeout(0.1)
                try:
                    probe.connect(str(self.path))
                except OSError as error:
                    if error.errno != errno.ECONNREFUSED:
                        raise
                else:
                    raise RunnerError('Unix runner endpoint is already live')
            self.path.unlink()
        self.socket = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.socket.bind(str(self.path))
        os.chmod(self.path, 0o600)
        self.socket.listen(8)
        self.socket.settimeout(0.1)
        self.stopping = False

    def handle(self, connection):
        if hasattr(socket, 'SO_PEERCRED'):
            _, uid, _ = struct.unpack('3i', connection.getsockopt(socket.SOL_SOCKET, socket.SO_PEERCRED, 12))
            if uid not in self.allowed_uids:
                raise AuthenticationError('Unix caller peer UID rejected')
        stream = DeadlineSocket(connection, 3)
        request = read_frame(stream)
        response = self.store.dispatch(request, transport_target='pc_usb', transport_evidence='authenticated_unix_fixture')
        write_frame(stream, response)

    def serve_forever(self):
        while not self.stopping:
            try:
                connection, _ = self.socket.accept()
            except socket.timeout:
                continue
            except OSError:
                if self.stopping:
                    return
                raise
            with connection:
                try:
                    self.handle(connection)
                except (ValueError, OSError):
                    pass

    def shutdown(self):
        self.stopping = True

    def server_close(self):
        self.stopping = True
        self.socket.close()
        self.path.unlink(missing_ok=True)

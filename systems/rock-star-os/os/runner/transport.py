"""Fixed HTTPS origin and authenticated framed Unix transport; no redirects."""
import http.client
import io
import os
from pathlib import Path
import socket
import ssl
import stat
import struct
import time
from urllib.parse import urlsplit

from blackberryrock.packages import canonical
from .protocol import MAX_WIRE, TransportError, decode, read_frame, write_frame


class HTTPSRunnerTransport:
    target = 'cloud'
    evidence = 'pinned_tls_loopback_fixture'

    def __init__(self, origin, ca_file, *, timeout=3):
        parsed = urlsplit(origin)
        if (parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password
                or parsed.path not in {'', '/'} or parsed.query or parsed.fragment):
            raise TransportError('a fixed HTTPS origin without path or credentials is required')
        # This development foundation is deliberately limited to owned sandbox routes.
        if parsed.hostname not in {'localhost', '127.0.0.1', '10.0.2.2'}:
            raise TransportError('development runner origin must be an explicit sandbox host')
        if not 0.05 <= timeout <= 10:
            raise TransportError('invalid timeout')
        self.host, self.port = parsed.hostname, parsed.port or 443
        self.origin = f'https://{self.host}:{self.port}'
        self.timeout = timeout
        self.context = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
        self.context.minimum_version = ssl.TLSVersion.TLSv1_2
        self.context.load_verify_locations(cafile=str(ca_file))
        self.context.check_hostname = True
        self.context.verify_mode = ssl.CERT_REQUIRED

    def exchange(self, envelope):
        raw = canonical(envelope)
        if len(raw) > MAX_WIRE:
            raise TransportError('request exceeds wire limit')
        connection = http.client.HTTPSConnection(self.host, self.port, context=self.context, timeout=self.timeout)
        deadline = time.monotonic() + self.timeout
        wrapped = None
        try:
            connection.connect()
            wrapped = DeadlineConnection(connection.sock, max(0.001, deadline - time.monotonic()))
            connection.sock = wrapped
            connection.request('POST', '/v1/runner', body=raw, headers={'Content-Type': 'application/json', 'Connection': 'close'})
            response = connection.getresponse()
            if response.status != 200:
                raise TransportError('runner HTTP status ' + str(response.status) + '; redirects are forbidden')
            lengths = response.headers.get_all('Content-Length', [])
            if (len(lengths) != 1 or not lengths[0].isascii() or not lengths[0].isdigit()
                    or response.headers.get('Transfer-Encoding') is not None):
                raise TransportError('unbounded or ambiguous response length')
            count = int(lengths[0])
            if not 1 <= count <= MAX_WIRE:
                raise TransportError('response exceeds wire limit')
            chunks = []
            while count:
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    raise TransportError('runner response deadline expired')
                if connection.sock:
                    connection.sock.settimeout(remaining)
                part = response.read1(min(count, 65536))
                if not part:
                    raise TransportError('runner response ended before advertised length')
                chunks.append(part)
                count -= len(part)
            return decode(b''.join(chunks))
        except (OSError, http.client.HTTPException, ValueError) as error:
            if isinstance(error, TransportError):
                raise
            raise TransportError('bounded HTTPS exchange failed: ' + type(error).__name__) from error
        finally:
            connection.close()
            if wrapped:
                wrapped.stream.close()


class DeadlineSocket:
    """Total frame deadline, so a byte-at-a-time peer cannot keep a slot forever."""
    def __init__(self, stream, timeout):
        self.stream, self.deadline = stream, time.monotonic() + timeout

    def _arm(self):
        remaining = self.deadline - time.monotonic()
        if remaining <= 0:
            raise TransportError('frame deadline expired')
        self.stream.settimeout(remaining)

    def recv(self, size):
        self._arm()
        return self.stream.recv(size)

    def sendall(self, raw):
        self._arm()
        self.stream.sendall(raw)


class UnixRunnerTransport:
    target = 'pc_usb'
    evidence = 'authenticated_unix_fixture'

    def __init__(self, socket_path, *, timeout=3, server_uid=None):
        self.path = str(Path(socket_path).absolute())
        self.timeout = timeout
        self.server_uid = os.geteuid() if server_uid is None else server_uid
        if not 0.05 <= timeout <= 10:
            raise TransportError('invalid timeout')

    def exchange(self, envelope):
        with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as stream:
            stream.settimeout(self.timeout)
            try:
                info = os.lstat(self.path)
                if not stat.S_ISSOCK(info.st_mode) or info.st_uid != self.server_uid or info.st_mode & 0o007:
                    raise TransportError('Unix endpoint ownership or permissions rejected')
                stream.connect(self.path)
                if hasattr(socket, 'SO_PEERCRED'):
                    _, uid, _ = struct.unpack('3i', stream.getsockopt(socket.SOL_SOCKET, socket.SO_PEERCRED, 12))
                    if uid != self.server_uid:
                        raise TransportError('Unix server peer UID rejected')
                wrapped = DeadlineSocket(stream, self.timeout)
                write_frame(wrapped, envelope)
                return read_frame(wrapped)
            except OSError as error:
                raise TransportError('bounded Unix exchange failed: ' + type(error).__name__) from error


class DeadlineReader(io.RawIOBase):
    def __init__(self, stream):
        super().__init__()
        self.stream = stream

    def readable(self):
        return True

    def close(self):
        if not self.closed:
            self.stream.stream.close()
        super().close()

    def readinto(self, buffer):
        value = self.stream.recv(len(buffer))
        buffer[:len(value)] = value
        return len(value)


class DeadlineConnection(DeadlineSocket):
    def makefile(self, mode, *args, **kwargs):
        if mode != 'rb':
            raise TransportError('unsupported bounded socket file mode')
        self.reader_active = True
        return io.BufferedReader(DeadlineReader(self))

    def settimeout(self, timeout):
        self.stream.settimeout(min(timeout, max(0.001, self.deadline - time.monotonic())))

    def close(self):
        # HTTPConnection may close its connection reference before consuming a
        # Connection: close response; the file reader owns the remaining stream.
        if not getattr(self, 'reader_active', False):
            self.stream.close()

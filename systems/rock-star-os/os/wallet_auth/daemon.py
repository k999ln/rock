"""Isolated native software TEST authenticator. No network or Wallet access.

Only UID1000 may explicitly request creation/assertion with a freshly entered
test PIN. Public RFC fixture keys cannot provide hardware or biometric security.
The protocol has no arbitrary signing, file, shell, enrollment-policy or URL API.
"""
import ctypes
import errno
import fcntl
import os
from pathlib import Path
import signal
import socket
import socketserver
import stat
import struct
import sys
import threading
import time

if __package__ in (None, ''):
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from wallet_auth.protocol import AuthError, AuthUnavailable, json_bytes, json_decode

AUTH_UID, OWNER_UID, SOCKET_GROUP = 1004, 1000, 1000
SOCKET = Path('/run/rock-authenticator/api.sock')
STATE = Path('/data/authenticator')
CONFIG = Path('/etc/rock-authenticator/device.json')
MAX_FRAME, MAX_REPLY, MAX_SLOTS, DEADLINE = 16384, 65536, 4, 8


def restrict_network():
    """Kernel denies creation of non-Unix sockets, also in the OpenSSL child."""
    class Comparison(ctypes.Structure):
        _fields_ = [('arg', ctypes.c_uint), ('op', ctypes.c_uint),
                    ('datum_a', ctypes.c_uint64), ('datum_b', ctypes.c_uint64)]
    library = ctypes.CDLL('libseccomp.so.2', use_errno=True)
    library.seccomp_init.argtypes = [ctypes.c_uint32]
    library.seccomp_init.restype = ctypes.c_void_p
    library.seccomp_release.argtypes = [ctypes.c_void_p]
    library.seccomp_load.argtypes = [ctypes.c_void_p]
    library.seccomp_syscall_resolve_name.argtypes = [ctypes.c_char_p]
    library.seccomp_rule_add_array.argtypes = [ctypes.c_void_p, ctypes.c_uint32, ctypes.c_int,
                                              ctypes.c_uint, ctypes.POINTER(Comparison)]
    context = library.seccomp_init(0x7fff0000)  # SCMP_ACT_ALLOW
    require(bool(context))
    try:
        for name in (b'socket', b'socketpair'):
            syscall = library.seccomp_syscall_resolve_name(name)
            require(syscall >= 0)
            comparison = Comparison(0, 1, socket.AF_UNIX, 0)  # SCMP_CMP_NE
            require(library.seccomp_rule_add_array(context, 0x00050000 | errno.EPERM,
                                                   syscall, 1, ctypes.byref(comparison)) == 0)
        # Do not expose a separate async socket-creation path around this filter.
        syscall = library.seccomp_syscall_resolve_name(b'io_uring_setup')
        require(syscall >= 0 and library.seccomp_rule_add_array(context, 0x00050000 | errno.EPERM,
                                                               syscall, 0, None) == 0)
        require(library.seccomp_load(context) == 0)
    finally:
        library.seccomp_release(context)


def require(condition):
    if not condition:
        raise AuthError('invalid protected software authenticator request')


def read_binding(path=CONFIG):
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(fd, 'rb') as stream:
        info = os.fstat(stream.fileno())
        require(stat.S_ISREG(info.st_mode) and info.st_uid in (0, os.geteuid()) and
                info.st_nlink == 1 and not info.st_mode & 0o022 and info.st_size <= 4096)
        value = json_decode(stream.read(4097), 4096)
    require(type(value) is dict and set(value) == {'schema_version', 'kind', 'device_ref'} and
            type(value['schema_version']) is int and value['schema_version'] == 1 and
            value['kind'] == 'public-software-test-authenticator')
    from entitlement.protocol import identifier
    return identifier(value['device_ref'], fixture=True)


class Service:
    def __init__(self, state, device_ref):
        from wallet_auth.fixture import SoftwareTestAuthenticator
        self.authenticator = SoftwareTestAuthenticator(state, device_ref)
        self.lock = threading.Lock()

    def close(self):
        self.authenticator.close()

    def dispatch(self, request, *, peer_uid, deadline=None):
        if type(peer_uid) is not int or peer_uid != OWNER_UID:
            raise PermissionError('native owner UID required')
        require(type(request) is dict and type(request.get('v')) is int and request['v'] == 1)
        op = request.get('op')
        if op == 'auth.status':
            require(set(request) == {'v', 'op'})
            return {'ok': True, 'metadata': self.authenticator.metadata}
        game=op in ('auth.game.connect','auth.game.exchange')
        payload_field='intent' if game else 'options'
        require(op in ('auth.create','auth.get','auth.game.connect','auth.game.exchange') and
                set(request)=={'v','op','key',payload_field,'pin'})
        require(type(request['key']) is str and 1 <= len(request['key']) <= 128 and
                type(request['pin']) is str and len(request['pin']) == 4 and request['pin'].isascii() and
                request['pin'].isdigit() and type(request[payload_field]) is dict)
        require(len(json_bytes(request)) <= MAX_FRAME)
        with self.lock:
            if deadline is not None and time.monotonic() >= deadline:
                raise AuthUnavailable('request deadline elapsed before signing')
            method = self.authenticator.make_credential if op == 'auth.create' else self.authenticator.get_assertion
            if game:
                method=self.authenticator.get_game_assertion if op=='auth.game.connect' else self.authenticator.get_exchange_assertion
            credential = method(request[payload_field], request['pin'], request['key'])
        return {'ok': True, 'credential': credential, 'metadata': self.authenticator.metadata}


class Handler(socketserver.BaseRequestHandler):
    def handle(self):
        response, request = None, None
        def expire():
            try:
                self.request.shutdown(socket.SHUT_RDWR)
            except OSError:
                pass
        timer = threading.Timer(DEADLINE, expire)
        timer.daemon = True
        timer.start()
        try:
            _, uid, _ = struct.unpack('3i', self.request.getsockopt(socket.SOL_SOCKET, socket.SO_PEERCRED, 12))
            if uid != OWNER_UID:
                raise PermissionError('native owner UID required')
            deadline = time.monotonic() + DEADLINE
            raw = bytearray()
            while b'\n' not in raw:
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    raise TimeoutError()
                self.request.settimeout(remaining)
                chunk = self.request.recv(min(4096, MAX_FRAME + 1 - len(raw)))
                require(bool(chunk))
                raw.extend(chunk)
                require(len(raw) <= MAX_FRAME)
            require(raw.endswith(b'\n') and raw.count(b'\n') == 1)
            request = json_decode(bytes(raw[:-1]), MAX_FRAME)
            raw[:] = b'\0' * len(raw)
            require(time.monotonic() < deadline)
            response = self.server.service.dispatch(request, peer_uid=uid, deadline=deadline)
        except PermissionError:
            response = {'ok': False, 'code': 'unauthorized', 'error': 'native owner UID required'}
        except (AuthError, ValueError, TypeError, KeyError, RecursionError):
            response = {'ok': False, 'code': 'rejected', 'error': 'test PIN or authenticator options rejected'}
        except Exception:
            response = {'ok': False, 'code': 'unavailable', 'error': 'authenticator result unavailable; reenter PIN with the same request'}
        finally:
            if type(request) is dict:
                request.pop('pin', None)
        try:
            raw = json_bytes(response) + b'\n'
            require(len(raw) <= MAX_REPLY)
            self.request.settimeout(1)
            self.request.sendall(raw)
        except (OSError, AuthError):
            pass
        finally:
            timer.cancel()


class Server(socketserver.ThreadingMixIn, socketserver.UnixStreamServer):
    daemon_threads = False
    block_on_close = True
    request_queue_size = MAX_SLOTS

    def __init__(self, path, service):
        self.service, self.path = service, Path(path)
        self.slots = threading.BoundedSemaphore(MAX_SLOTS)
        info = self.path.parent.lstat()
        require(stat.S_ISDIR(info.st_mode) and info.st_uid == os.geteuid() and
                info.st_gid == SOCKET_GROUP and stat.S_IMODE(info.st_mode) == 0o750)
        self.lock_fd = os.open(str(path) + '.lock', os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
        try:
            info = os.fstat(self.lock_fd)
            require(stat.S_ISREG(info.st_mode) and info.st_uid == os.geteuid() and info.st_nlink == 1 and
                    stat.S_IMODE(info.st_mode) == 0o600)
            fcntl.flock(self.lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            if self.path.exists() or self.path.is_symlink():
                info = self.path.lstat()
                require(stat.S_ISSOCK(info.st_mode) and info.st_uid == os.geteuid())
                self.path.unlink()
            super().__init__(str(path), Handler)
            os.chown(path, os.geteuid(), SOCKET_GROUP)
            os.chmod(path, 0o660)
        except BaseException:
            if hasattr(self, 'socket'):
                self.socket.close()
            os.close(self.lock_fd)
            self.lock_fd = None
            raise

    def process_request(self, request, address):
        if not self.slots.acquire(blocking=False):
            request.close()
            return
        try:
            super().process_request(request, address)
        except BaseException:
            self.slots.release()
            raise

    def process_request_thread(self, request, address):
        try:
            super().process_request_thread(request, address)
        finally:
            self.slots.release()

    def handle_error(self, request, address):
        pass  # Never expose PIN/options/credential-bearing exception text.

    def server_close(self):
        super().server_close()
        if self.lock_fd is not None:
            if self.path.exists() and stat.S_ISSOCK(self.path.lstat().st_mode):
                self.path.unlink()
            os.close(self.lock_fd)
            self.lock_fd = None


def main():
    require(sys.platform == 'linux' and os.getuid() == AUTH_UID and os.geteuid() == AUTH_UID)
    os.umask(0o077)
    require(ctypes.CDLL(None, use_errno=True).prctl(38, 1, 0, 0, 0) == 0)
    restrict_network()
    info = STATE.lstat()
    require(stat.S_ISDIR(info.st_mode) and info.st_uid == info.st_gid == AUTH_UID and
            stat.S_IMODE(info.st_mode) == 0o700)
    service = Service(STATE, read_binding())
    stop = threading.Event()
    try:
        with Server(SOCKET, service) as server:
            thread = threading.Thread(target=server.serve_forever, kwargs={'poll_interval': .1})
            previous = {sig: signal.signal(sig, lambda *_: stop.set()) for sig in (signal.SIGINT, signal.SIGTERM)}
            thread.start()
            try:
                print('ROCK_SOFTWARE_TEST_AUTHENTICATOR_READY uid=1004 hardware_backed=false', flush=True)
                stop.wait()
            finally:
                server.shutdown()
                thread.join()
                for sig, action in previous.items():
                    signal.signal(sig, action)
    finally:
        service.close()


if __name__ == '__main__':
    main()

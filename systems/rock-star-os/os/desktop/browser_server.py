#!/usr/bin/env python3
"""Loopback-only static viewer for the actual QEMU display. No credentials here."""
import argparse
import fcntl
import hashlib
import http.client
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path, PurePosixPath
import secrets
import subprocess
import sys
import time
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parent / 'browser'
PORT = 8899
BASE_URL = f'http://127.0.0.1:{PORT}/'


def fingerprint():
    digest = hashlib.sha256(Path(__file__).read_bytes())
    for file in sorted(ROOT.rglob('*')):
        if file.is_file():
            digest.update(str(file.relative_to(ROOT)).encode())
            digest.update(file.read_bytes())
    return digest.hexdigest()


def process_command(pid):
    return subprocess.check_output(['/bin/ps', '-p', str(pid), '-o', 'command='], text=True, timeout=3).strip()


def http_healthy(record):
    try:
        connection = http.client.HTTPConnection('127.0.0.1', record.get('port', PORT), timeout=.5)
        try:
            connection.request('GET', '/health')
            response = connection.getresponse()
            return response.status == 200 and json.loads(response.read(4096)) == {'instance': record['instance'], 'build': record['build']}
        finally:
            connection.close()
    except (OSError, ValueError, KeyError, subprocess.SubprocessError, http.client.HTTPException):
        return False


def healthy(record):
    try:
        return process_command(record['pid']) == record['command'] and http_healthy(record)
    except (OSError, ValueError, KeyError, subprocess.SubprocessError):
        return False


def ensure_viewer(host_state, session, *, port=None, websocket_port=5909):
    selected_port = PORT if port is None else port
    if not (type(selected_port) is int and type(websocket_port) is int and
            1024 <= selected_port <= 65535 and 1024 <= websocket_port <= 65535 and selected_port != websocket_port):
        raise ValueError('distinct pinned loopback display ports required')
    url = BASE_URL if port is None else f'http://127.0.0.1:{selected_port}/'
    state = Path(host_state)
    state.mkdir(mode=0o700, parents=True, exist_ok=True)
    if state.is_symlink() or not state.is_dir() or state.stat().st_uid != os.getuid():
        raise ValueError('unsafe viewer state')
    state.chmod(0o700)
    with (state / 'viewer.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        record_file = state / 'viewer.json'
        build = fingerprint()
        if record_file.exists():
            record = json.loads(record_file.read_text())
            if healthy(record):
                if record['build'] != build:
                    raise ValueError('表示用ファイルが更新されました。既存の表示サーバーを終了してから起動してください。')
                if record.get('port', PORT) != selected_port or record.get('websocket_port', 5909) != websocket_port:
                    raise ValueError('existing viewer belongs to different pinned display ports')
                return url + 'index.html'
        # Reserve first; a foreign listener is never stopped or reused.
        server = ThreadingHTTPServer(('127.0.0.1', selected_port), Handler, bind_and_activate=True)
        descriptor = server.fileno()
        instance = secrets.token_hex(16)
        command = [sys.executable, '-B', str(Path(__file__).resolve()), '--fd', str(descriptor), '--instance', instance, '--build', build]
        if port is not None:
            command += ['--port', str(selected_port), '--websocket-port', str(websocket_port)]
        log_fd = os.open(state / 'viewer.log', os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o600)
        try:
            child = subprocess.Popen(command, stdin=subprocess.DEVNULL, stdout=log_fd, stderr=subprocess.STDOUT,
                                     pass_fds=(descriptor,), start_new_session=True)
        finally:
            os.close(log_fd)
            server.server_close()
        try:
            record = {'pid': child.pid, 'instance': instance, 'build': build}
            if port is not None:
                record.update(port=selected_port, websocket_port=websocket_port)
            deadline = time.monotonic() + 5
            while True:
                if child.poll() is not None or time.monotonic() >= deadline:
                    raise RuntimeError('表示サーバーを起動できませんでした。')
                # Homebrew's macOS Python may re-exec its Python.app binary
                # after Popen returns. Only capture the command once this exact
                # child has served its unique instance/build over the reserved
                # listener. Existing-record identity checks remain immutable.
                if http_healthy(record):
                    record['command'] = process_command(child.pid)
                    if healthy(record):
                        break
                time.sleep(.1)
            temporary = state / ('viewer.json.' + instance)
            with temporary.open('x') as stream:
                json.dump(record, stream, indent=2)
                stream.flush()
                os.fsync(stream.fileno())
            temporary.chmod(0o600)
            os.replace(temporary, record_file)
        except BaseException:
            if child.poll() is None:
                child.terminate()
                try:
                    child.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    child.kill()
                    child.wait(timeout=3)
            raise
        return url + 'index.html'


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, format, *args):
        pass  # The viewer never logs URLs or request data.

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'no-referrer')
        port = getattr(self.server, 'websocket_port', 5909)
        self.send_header('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; img-src data: blob:; connect-src ws://127.0.0.1:" + str(port) + "; frame-ancestors 'none'; base-uri 'none'; form-action 'none'")
        super().end_headers()

    def do_HEAD(self):
        self.do_GET(head=True)

    def do_GET(self, head=False):
        if self.headers.get('Host') != f'127.0.0.1:{self.server.server_address[1]}':
            self.send_error(403)
            return
        path = unquote(urlsplit(self.path).path)
        if path == '/health':
            data = json.dumps({'instance': self.server.instance, 'build': self.server.build}).encode()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            if not head:
                self.wfile.write(data)
            return
        parts = PurePosixPath(path).parts[1:]
        file = ROOT.joinpath(*parts)
        allowed = path in {'/index.html', '/viewer.js', '/viewer.css'} or (
            path.startswith(('/novnc/core/', '/novnc/vendor/pako/')) and file.suffix == '.js')
        if (not parts or '..' in parts or file.is_symlink() or not file.resolve().is_relative_to(ROOT.resolve())
                or not file.is_file() or not allowed):
            self.send_error(404)
            return
        if path == '/viewer.js' and getattr(self.server, 'websocket_port', 5909) != 5909:
            # Only a validated integer from the manifest-pinned server arguments
            # is substituted. Passwords never reach this HTTP endpoint or logs.
            data = file.read_bytes()
            marker = b'const configuredWebsocketPort = 5909;'
            if data.count(marker) != 1:
                self.send_error(500)
                return
            data = data.replace(marker, ('const configuredWebsocketPort = ' + str(self.server.websocket_port) + ';').encode('ascii'))
            self.send_response(200)
            self.send_header('Content-Type', 'text/javascript; charset=utf-8')
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            if not head:
                self.wfile.write(data)
            return
        if head:
            super().do_HEAD()
        else:
            super().do_GET()


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--fd', type=int, required=True)
    parser.add_argument('--instance', required=True)
    parser.add_argument('--build', required=True)
    parser.add_argument('--port', type=int, default=PORT)
    parser.add_argument('--websocket-port', type=int, default=5909)
    args = parser.parse_args()
    import socket
    if not (1024 <= args.port <= 65535 and 1024 <= args.websocket_port <= 65535 and args.port != args.websocket_port):
        parser.error('distinct pinned loopback display ports required')
    server = ThreadingHTTPServer(('127.0.0.1', args.port), Handler, bind_and_activate=False)
    server.socket.close()
    server.socket = socket.socket(fileno=args.fd)
    server.server_address = server.socket.getsockname()
    if server.server_address != ('127.0.0.1', args.port):
        raise ValueError('reserved viewer socket differs from the pinned loopback port')
    server.instance, server.build = args.instance, args.build
    server.websocket_port = args.websocket_port
    server.serve_forever(poll_interval=.5)

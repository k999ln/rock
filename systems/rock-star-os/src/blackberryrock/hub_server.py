"""Local development console. Never listens on a public interface."""
from __future__ import annotations

import argparse
import hmac
import json
import secrets
import signal
import sqlite3
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

from .hub import Hub
from .packages import MAX_PACKAGE_BYTES, PUBLIC_TEST_KEY, TEST_PUBLISHER, PackageError, canonical, verify_package
from .wallet import Wallet

WEB = Path(__file__).with_name('web')
MAX_REQUEST = 524288


class HubServer(ThreadingHTTPServer):
    # Requests are bounded by body/database/worker deadlines. Waiting for them
    # prevents a shutdown race in which a handler could spawn a worker after
    # the final owned-process sweep.
    daemon_threads = False

    def __init__(self, port, state_dir, registry):
        self.session = secrets.token_urlsafe(32)
        self.hub = Hub(Path(state_dir) / 'hub.db', {TEST_PUBLISHER: PUBLIC_TEST_KEY})
        self.wallet = Wallet(Path(state_dir) / 'wallet-simulator.db')
        self.registry = Path(registry)
        super().__init__(('127.0.0.1', port), HubHandler)

    def packages(self):
        result = {}
        rejected = 0
        for path in sorted(self.registry.glob('*.rock.json'))[:100]:
            try:
                if path.is_symlink() or path.stat().st_size > MAX_PACKAGE_BYTES:
                    raise PackageError('invalid registry file')
                p = json.loads(path.read_text())
                with self.hub.connect() as c:
                    manifest, sha = self.hub._verify(c, p)
                result[path.name] = {'manifest': manifest, 'hash': sha, 'size': path.stat().st_size, 'package': p, 'download': '/registry/' + path.name}
            except (OSError, ValueError, TypeError):
                rejected += 1
        return result, rejected

    def health(self):
        """Check both durable stores without exposing user or job data."""
        try:
            self.hub.state()
            self.wallet.snapshot()
        except (OSError, ValueError, sqlite3.Error):
            return 503, {'status': 'unavailable'}
        return 200, {
            'status': 'ok',
            'service': 'rockstaros-development-hub',
            'scope': 'loopback',
            'simulation_only': True,
        }

    def server_close(self):
        super().server_close()
        self.hub.close()


class HubHandler(BaseHTTPRequestHandler):
    server: HubServer

    def log_message(self, *args):
        pass  # Do not put user input or session data into routine logs.

    def send(self, status, payload, content_type='application/json; charset=utf-8', cookie=False):
        data = payload if isinstance(payload, bytes) else canonical(payload)
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'no-referrer')
        self.send_header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'")
        if cookie:
            self.send_header('Set-Cookie', f'rock_session={self.server.session}; HttpOnly; SameSite=Strict; Path=/')
        self.end_headers()
        self.wfile.write(data)

    def host_valid(self):
        port = self.server.server_port
        return self.headers.get('Host') in (f'127.0.0.1:{port}', f'localhost:{port}')

    def authenticated(self):
        try:
            cookie = SimpleCookie(self.headers.get('Cookie', ''))
            value = cookie.get('rock_session')
            return bool(value) and hmac.compare_digest(value.value, self.server.session)
        except (ValueError, TypeError):
            return False

    def do_GET(self):
        if not self.host_valid():
            return self.send(403, {'error': 'invalid host'})
        path = urlsplit(self.path).path
        if path == '/api/health':
            status, payload = self.server.health()
            return self.send(status, payload)
        if path == '/':
            return self.send(200, (WEB / 'index.html').read_bytes(), 'text/html; charset=utf-8', cookie=True)
        if path in ('/app.js', '/style.css'):
            kind = 'text/javascript; charset=utf-8' if path.endswith('.js') else 'text/css; charset=utf-8'
            return self.send(200, (WEB / path[1:]).read_bytes(), kind)
        if not self.authenticated():
            return self.send(401, {'error': 'open the local Hub to start a session'})
        if path == '/api/state':
            return self.send(200, {'hub': self.server.hub.state(), 'wallet': self.server.wallet.snapshot()})
        if path == '/api/catalog':
            packages, rejected = self.server.packages()
            return self.send(200, {'packages': [{k: v for k, v in p.items() if k != 'package'} for p in packages.values()], 'rejected': rejected})
        if path.startswith('/registry/'):
            packages, _ = self.server.packages()
            item = packages.get(path.removeprefix('/registry/'))
            if item:
                return self.send(200, item['package'])
        return self.send(404, {'error': 'not found'})

    def do_POST(self):
        if not self.host_valid() or not self.authenticated():
            return self.send(401, {'error': 'authenticated local session required'})
        if self.headers.get('Origin') != f"http://{self.headers.get('Host')}":
            return self.send(403, {'error': 'same-origin request required'})
        if self.headers.get('Content-Type', '').split(';')[0] != 'application/json':
            return self.send(415, {'error': 'JSON required'})
        try:
            length = int(self.headers.get('Content-Length', '0'))
        except ValueError:
            return self.send(400, {'error': 'invalid length'})
        if not 0 < length <= MAX_REQUEST:
            return self.send(413, {'error': 'request exceeds limit or body is empty'})
        self.connection.settimeout(5)
        try:
            b = json.loads(self.rfile.read(length))
            if not isinstance(b, dict):
                raise ValueError('request must be an object')
            path = urlsplit(self.path).path
            h, w = self.server.hub, self.server.wallet
            if path == '/api/install':
                result = h.install(b['package'])
            elif path == '/api/enable':
                result = h.enable(b['id'], b['approved_hash'])
            elif path == '/api/lifecycle':
                result = h.lifecycle(b['id'], b['action'], b.get('version'))
            elif path == '/api/run':
                result = h.run(b['id'], b['text'], b['key'], b.get('target', 'device_local'))
            elif path == '/api/cancel':
                result = h.cancel(b['id'])
            elif path == '/api/revoke':
                result = h.revoke(b['subject'])
            elif path == '/api/wallet/consent':
                result = w.consent_monthly(b['accepted'])
            elif path == '/api/wallet/sale':
                result = w.simulate_sale(b['amount_minor'], b['key'])
            elif path == '/api/wallet/settle':
                result = w.settle_sale(b['id'], b['key'])
            elif path == '/api/wallet/bill':
                result = w.bill(b['period'], b['key'])
            elif path == '/api/wallet/reserve':
                result = w.reserve(b['amount_minor'], b['key'])
            elif path == '/api/wallet/dispense':
                result = w.dispense(b['id'], b['dispensed_minor'], b['key'])
            elif path == '/api/wallet/unknown':
                result = w.mark_unknown(b['id'])
            elif path == '/api/wallet/reconcile':
                result = w.reconcile(b['id'], b['total_dispensed_minor'], b['key'])
            else:
                return self.send(404, {'error': 'not found'})
            return self.send(200, {'result': result})
        except (ValueError, TypeError, KeyError, RecursionError) as e:
            return self.send(400, {'error': str(e)[:400]})
        except TimeoutError:
            return self.send(408, {'error': 'request body timeout'})


def main(argv=None):
    p = argparse.ArgumentParser(description='Rock star os local development Hub')
    p.add_argument('--port', type=int, default=8877)
    p.add_argument('--state', type=Path, default=Path('.state/hub'))
    p.add_argument('--registry', type=Path, default=Path('examples/registry'))
    a = p.parse_args(argv)
    server = HubServer(a.port, a.state, a.registry)
    previous = signal.getsignal(signal.SIGTERM)

    def stop(*_):
        raise KeyboardInterrupt

    signal.signal(signal.SIGTERM, stop)
    print(f'Rock star os DEVELOPMENT Hub: http://127.0.0.1:{server.server_port}', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
        signal.signal(signal.SIGTERM, previous)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())

"""Loopback-only development preview; no uploads or camera access in server."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        # Workers receive their own CSP; the document policy is not inherited.
        self.send_header('Content-Security-Policy', "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'self'; style-src 'self'; img-src 'self' data:; media-src 'self' blob:; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'")
        self.send_header('Permissions-Policy', 'camera=(self), microphone=()')
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

if __name__ == '__main__':
    with ThreadingHTTPServer(('127.0.0.1',8768),partial(Handler,directory=str(Path(__file__).resolve().parent))) as server:
        print('Mini preview: http://127.0.0.1:8768/demo.html; camera is off until explicit start.',flush=True)
        server.serve_forever()

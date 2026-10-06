"""CPU inference and a loopback-only research endpoint (also usable over an SSH tunnel)."""
import argparse
from http.server import BaseHTTPRequestHandler, HTTPServer
import json
from pathlib import Path

import torch
from model import load_model


def handler_for(model):
    class Handler(BaseHTTPRequestHandler):
        def setup(self):
            super().setup()
            self.connection.settimeout(5)

        def log_message(self, *_):
            pass  # Do not log prompts or generated output.

        def reply(self, status, value):
            raw = json.dumps(value, ensure_ascii=False).encode('utf-8')
            self.send_response(status)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Content-Length', str(len(raw)))
            self.send_header('Cache-Control', 'no-store')
            self.send_header('Connection', 'close')
            self.end_headers()
            self.wfile.write(raw)

        def do_GET(self):
            self.reply(200 if self.path == '/health' else 404,
                       {'research_only': True, 'production_ready': False})

        def do_POST(self):
            if self.path != '/generate':
                return self.reply(404, {'error': 'unknown route'})
            # No browser origins, CORS, chunked input, tools, billing or production credentials.
            if self.headers.get('Origin') or self.headers.get('Transfer-Encoding'):
                return self.reply(403, {'error': 'unsupported request'})
            if self.headers.get('Content-Type') != 'application/json':
                return self.reply(415, {'error': 'JSON required'})
            try:
                size = int(self.headers.get('Content-Length', '0'))
                if not 1 <= size <= 4096:
                    return self.reply(413, {'error': 'body limit'})
                body = json.loads(self.rfile.read(size))
                if not isinstance(body, dict) or set(body) - {'prompt', 'max_new'} or 'prompt' not in body:
                    raise ValueError('invalid request')
                result = model.generate(body['prompt'], body.get('max_new', 64))
            except (ValueError, TypeError, TimeoutError):
                return self.reply(400, {'error': 'invalid prompt or generation limit'})
            self.reply(200, {'text': result, 'research_only': True, 'authority': 'none'})
    return Handler


if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('--checkpoint', type=Path, required=True)
    p.add_argument('--prompt', default='Mini')
    p.add_argument('--max-new', type=int, default=64)
    p.add_argument('--serve', action='store_true')
    p.add_argument('--port', type=int, default=8769)
    a = p.parse_args()
    torch.set_num_threads(2)
    model, _ = load_model(a.checkpoint)
    if a.serve:
        HTTPServer(('127.0.0.1', a.port), handler_for(model)).serve_forever()
    else:
        print(json.dumps({'text': model.generate(a.prompt, a.max_new), 'research_only': True}, ensure_ascii=False))

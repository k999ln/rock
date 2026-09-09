"""Owned HTTP/TLS wire deadlines; no OS, provider deployment, or real effects."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import socket
import ssl
import sys
import threading
import time
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT/'src'), str(ROOT/'os')]
from mcp_broker.http import MCPHttpClient, ToolPolicy, TransportError, VERSION, INTENT_META, canonical

TOKEN = 'PUBLIC-DEADLINE-TEST-TOKEN'
POLICY = ToolPolicy('text.upper', 'effect.status')
KEY = 'same-public-business-key'
CONSENT = 'd' * 64
FIXTURE = ROOT/'os/registry/fixtures'


class Handler(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'

    def log_message(self, *_): pass

    def do_POST(self):
        self.close_connection = True
        try:
            request = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
            with self.server.lock:
                self.server.requests.append({'path': self.path, 'message': request,
                    'headers': dict(self.headers)})
                mode, self.server.mode = self.server.mode, 'normal'
                if request['method'] == 'server/discover':
                    result = {'resultType': 'complete', 'supportedVersions': [VERSION],
                        'capabilities': {'tools': {}}, 'ttlMs': 1000, 'cacheScope': 'private'}
                else:
                    params = request['params']
                    if params['name'] == 'text.upper':
                        intent = params['_meta'][INTENT_META]
                        key, consent = intent['businessKey'], intent['consentDigest']
                        if key not in self.server.receipts:
                            self.server.receipts[key] = {'schema': 'rock-mcp-effect-receipt/1',
                                'business_key': key, 'consent_digest': consent, 'state': 'succeeded',
                                'output': {'text': params['arguments']['text'].upper()},
                                'settlement_correlation': 'public-correlation'}
                            self.server.effects += 1
                    else:
                        key = params['arguments']['business_key']
                    result = {'resultType': 'complete', 'content': [], 'isError': False,
                              'structuredContent': self.server.receipts[key]}
            envelope = {'jsonrpc': '2.0', 'id': request['id'], 'result': result}
            if mode == 'wrong_id': envelope['id'] = 'wrong-public-transport-id'
            body = canonical(envelope)
            headers = (b'Content-Type: application/json\r\nContent-Length: ' +
                       str(len(body)).encode() + b'\r\nConnection: close\r\n\r\n')
            if mode == 'slow_status':
                for byte in b'HTTP/1.1 200 OK\r\n':
                    self.wfile.write(bytes([byte])); self.wfile.flush()
                    if self.server.stopped.wait(.035): return
            else:
                self.wfile.write(b'HTTP/1.1 200 OK\r\n'); self.wfile.flush()
            if mode == 'slow_headers':
                for _ in range(10):
                    self.wfile.write(b'X-Public-Test: bounded\r\n'); self.wfile.flush()
                    if self.server.stopped.wait(.06): return
            self.wfile.write(headers); self.wfile.flush()
            if mode == 'partial_body':
                self.wfile.write(body[:len(body)//2]); self.wfile.flush(); return
            if mode == 'slow_body':
                for byte in body:
                    self.wfile.write(bytes([byte])); self.wfile.flush()
                    if self.server.stopped.wait(.04): return
            else:
                self.wfile.write(body); self.wfile.flush()
        except (OSError, ValueError):
            pass


class MCPDeadlineTests(unittest.TestCase):
    def server(self, *, tls=False):
        server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        server.daemon_threads = False
        server.mode, server.requests, server.receipts, server.effects = 'normal', [], {}, 0
        server.lock, server.stopped = threading.Lock(), threading.Event()
        if tls:
            context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
            context.load_cert_chain(FIXTURE/'development-ca.pem', FIXTURE/'PUBLIC-FIXTURE-KEY.pem')
            server.socket = context.wrap_socket(server.socket, server_side=True)
        thread = threading.Thread(target=server.serve_forever, kwargs={'poll_interval': .01})
        thread.start()
        def close():
            server.stopped.set()
            try: server.shutdown()
            finally:
                try: server.server_close()
                finally: thread.join(2)
            self.assertFalse(thread.is_alive(), 'owned listener did not stop')
        self.addCleanup(close)
        client = MCPHttpClient(f'{"https" if tls else "http"}://127.0.0.1:{server.server_port}', [POLICY],
            authorization='Bearer '+TOKEN, allow_http_fixture=not tls,
            ca_file=FIXTURE/'development-ca.pem' if tls else None, timeout=.16,
            upstream_principal='PUBLIC-DEADLINE-OWNER')
        return server, client

    def execute(self, client):
        return client.execute('text.upper', 'chosen text', business_key=KEY, consent_digest=CONSENT)

    def bounded_failure(self, call):
        started = time.monotonic()
        with self.assertRaises(TransportError) as caught: call()
        self.assertLess(time.monotonic()-started, .45, 'byte trickle extended the absolute budget')
        self.assertNotIn(TOKEN, str(caught.exception))
        self.assertNotIn('chosen text', str(caught.exception))

    def test_normal_http_and_tls_preserve_rpc_headers_and_business_identity(self):
        for tls in (False, True):
            with self.subTest(tls=tls):
                server, client = self.server(tls=tls)
                self.assertEqual(client.discover(), {'protocol': VERSION, 'tools_available': True})
                receipt = self.execute(client)
                self.assertEqual(client.reconcile('text.upper', business_key=KEY, consent_digest=CONSENT), receipt)
                self.assertEqual(receipt['output'], {'text': 'CHOSEN TEXT'})
                self.assertEqual(server.effects, 1)
                self.assertEqual(len(server.requests), 3)
                ids = [item['message']['id'] for item in server.requests]
                self.assertEqual(len(set(ids)), 3)
                for item in server.requests:
                    self.assertEqual(item['path'], '/mcp')
                    self.assertEqual(item['headers']['MCP-Protocol-Version'], VERSION)
                    self.assertEqual(item['headers']['Authorization'], 'Bearer '+TOKEN)
                    self.assertEqual(item['headers']['Mcp-Method'], item['message']['method'])
                effect = server.requests[1]['message']['params']
                self.assertEqual(effect['_meta'][INTENT_META], {'businessKey': KEY, 'consentDigest': CONSENT})
                recovery = server.requests[2]['message']['params']
                self.assertEqual(recovery['name'], 'effect.status')
                self.assertEqual(recovery['arguments'], {'business_key': KEY, 'consent_digest': CONSENT})
                self.assertNotIn(INTENT_META, recovery['_meta'])

    def test_status_line_trickle_cannot_extend_deadline(self):
        server, client = self.server(); server.mode = 'slow_status'
        self.bounded_failure(client.discover)
        self.assertEqual(len(server.requests), 1)

    def test_slow_headers_timeout_after_commit_does_not_retry_effect(self):
        server, client = self.server(); server.mode = 'slow_headers'
        self.bounded_failure(lambda: self.execute(client))
        self.assertEqual(server.effects, 1); self.assertEqual(len(server.requests), 1)
        receipt = client.reconcile('text.upper', business_key=KEY, consent_digest=CONSENT)
        self.assertEqual(receipt, server.receipts[KEY])
        self.assertEqual(server.effects, 1); self.assertEqual(len(server.requests), 2)
        self.assertEqual(server.requests[-1]['headers']['Mcp-Name'], 'effect.status')

    def test_tls_slow_headers_share_the_same_deadline_reader(self):
        server, client = self.server(tls=True); server.mode = 'slow_headers'
        self.bounded_failure(client.discover)
        self.assertEqual(len(server.requests), 1)

    def test_body_trickle_stays_bounded(self):
        server, client = self.server(); server.mode = 'slow_body'
        self.bounded_failure(client.discover)
        self.assertEqual(len(server.requests), 1)

    def test_partial_reply_preserves_exact_key_for_explicit_recovery(self):
        server, client = self.server(); server.mode = 'partial_body'
        self.bounded_failure(lambda: self.execute(client))
        self.assertEqual(server.effects, 1); self.assertEqual(len(server.requests), 1)
        receipt = client.reconcile('text.upper', business_key=KEY, consent_digest=CONSENT)
        self.assertEqual(receipt['business_key'], KEY); self.assertEqual(receipt['consent_digest'], CONSENT)
        self.assertEqual(receipt, server.receipts[KEY]); self.assertEqual(server.effects, 1)

    def test_wrong_rpc_id_is_not_retried(self):
        server, client = self.server(); server.mode = 'wrong_id'
        with self.assertRaisesRegex(TransportError, 'envelope/id'): client.discover()
        self.assertEqual(len(server.requests), 1)

    def test_elapsed_connect_time_is_not_a_new_header_budget(self):
        server, client = self.server(); server.mode = 'slow_headers'
        original = socket.create_connection
        def delayed_connect(*args, **kwargs):
            time.sleep(.09)
            return original(*args, **kwargs)
        with patch('mcp_broker.http.socket.create_connection', side_effect=delayed_connect):
            self.bounded_failure(client.discover)
        self.assertEqual(len(server.requests), 1)


if __name__ == '__main__': unittest.main()

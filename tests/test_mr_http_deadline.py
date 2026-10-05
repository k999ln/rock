"""Synthetic loopback HTTP regressions; no external traffic or real credentials."""
import io
import json
import socket
import sys
import threading
import time
import unittest
from http.client import HTTPResponse
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "toolkits/mr"))
import mcp_server

ORIGIN = "http://localhost:3000"
SYNTHETIC_TOKEN = "synthetic-local-http-fixture"


class DeadlineHTTPTests(unittest.TestCase):
    def setUp(self):
        self.sockets = []
        self.writers = []
        self.original_streams = []
        self.handlers = []
        self.rpc_calls = []
        self.response_timeouts = []
        self.accepted = threading.Event()
        case = self
        original_setup = BaseHTTPRequestHandler.setup

        def capture_original(handler):
            original_setup(handler)
            case.original_streams.append(handler.rfile)

        self.setup_patch = mock.patch.object(BaseHTTPRequestHandler, "setup", capture_original)
        self.setup_patch.start()
        self.addCleanup(self.setup_patch.stop)

        class TestBridge(mcp_server.Bridge):
            tokens = {}
            receive_timeout = .4
            response_timeout = 1.0

            def setup(self):
                super().setup()
                case.handlers.append(self)
                case.accepted.set()

            def send_response(self, code, message=None):
                super().send_response(code, message)
                case.response_timeouts.append(self.connection.gettimeout())

        class TestServer(HTTPServer):
            def handle_error(self, *_):
                case.server_errors.append(sys.exc_info()[0].__name__)

        self.bridge = TestBridge
        self.server_errors = []
        self.server = TestServer(("127.0.0.1", 0), TestBridge)
        TestBridge.port = self.server.server_port
        self.host = f"127.0.0.1:{self.server.server_port}"
        original_rpc = mcp_server.rpc

        def record_rpc(message):
            case.rpc_calls.append(message.get("method"))
            return original_rpc(message)

        self.rpc_patch = mock.patch.object(mcp_server, "rpc", side_effect=record_rpc)
        self.rpc_patch.start()
        self.addCleanup(self.rpc_patch.stop)
        self.token_patch = mock.patch.object(mcp_server.secrets, "token_urlsafe",
                                             wraps=mcp_server.secrets.token_urlsafe)
        self.token_calls = self.token_patch.start()
        self.addCleanup(self.token_patch.stop)
        self.thread = threading.Thread(target=self.server.serve_forever,
                                       kwargs={"poll_interval": .01})
        self.thread.start()
        self.addCleanup(self.close_server)

    def close_server(self):
        for stopped, writer in self.writers:
            stopped.set()
            writer.join(1)
            self.assertFalse(writer.is_alive())
        for connection in self.sockets:
            connection.close()
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(2)
        self.assertFalse(self.thread.is_alive())
        self.assertEqual(self.server_errors, [])
        self.assertTrue(all(stream.closed for stream in self.original_streams))
        self.assertTrue(all(handler.rfile.closed and handler.rfile.raw.closed
                            for handler in self.handlers))

    def connect(self):
        connection = socket.create_connection(self.server.server_address, timeout=2)
        self.sockets.append(connection)
        return connection

    def request_bytes(self, path="/connect", body=b"{}", *, origin=ORIGIN,
                      method="POST", length=None, extra=(), host=None,
                      content_type="application/json"):
        headers = [
            f"{method} {path} HTTP/1.1",
            f"Host: {self.host if host is None else host}",
            f"Origin: {origin}",
            f"Content-Type: {content_type}",
            f"Content-Length: {len(body) if length is None else length}",
            "Connection: close",
            *extra,
        ]
        return ("\r\n".join(headers) + "\r\n\r\n").encode("ascii") + body

    def response(self, connection):
        with HTTPResponse(connection) as response:
            response.begin()
            return response.status, dict(response.getheaders()), response.read()

    def exchange(self, request, *, incomplete=False):
        connection = self.connect()
        connection.sendall(request)
        if incomplete:
            connection.shutdown(socket.SHUT_WR)
        return self.response(connection)

    def assert_closed_without_response(self, connection):
        try:
            self.assertEqual(connection.recv(4096), b"")
        except ConnectionResetError:
            pass

    def test_normal_options_connect_and_authenticated_ping(self):
        status, headers, _ = self.exchange(self.request_bytes(method="OPTIONS"))
        self.assertEqual(status, 204)
        self.assertEqual(headers["Access-Control-Allow-Origin"], ORIGIN)
        self.assertEqual(headers["Cache-Control"], "no-store")
        status, _, body = self.exchange(self.request_bytes())
        self.assertEqual(status, 200)
        issued = json.loads(body)
        self.assertTrue(isinstance(issued["token"], str) and issued["token"])
        ping = json.dumps({"jsonrpc": "2.0", "id": 1, "method": "ping"}).encode()
        status, _, body = self.exchange(self.request_bytes(
            "/mcp", ping, extra=("Authorization: Bearer " + issued["token"],)))
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body), {"jsonrpc": "2.0", "id": 1, "result": {}})
        self.assertEqual(self.rpc_calls, ["ping"])
        self.assertTrue(all(value == self.bridge.response_timeout
                            for value in self.response_timeouts))

    def test_cors_auth_content_limits_and_malformed_json_still_reject(self):
        self.bridge.tokens[ORIGIN] = SYNTHETIC_TOKEN
        cases = [
            (self.request_bytes(origin="https://untrusted.invalid"), 403),
            (self.request_bytes(host="untrusted.invalid"), 403),
            (self.request_bytes(content_type="text/plain"), 415),
            (self.request_bytes(length=mcp_server.MAX_BODY + 1), 413),
            (self.request_bytes(length=0), 413),
            (self.request_bytes("/unknown"), 404),
            (self.request_bytes("/mcp"), 401),
            (self.request_bytes("/mcp", extra=(
                "Authorization: Bearer " + SYNTHETIC_TOKEN,
                "MCP-Protocol-Version: unsupported")), 400),
            (self.request_bytes(body=b"{broken"), 400),
            (self.request_bytes(body=b'{"unexpected":true}'), 400),
        ]
        for request, expected in cases:
            with self.subTest(expected=expected):
                status, _, _ = self.exchange(request)
                self.assertEqual(status, expected)
        self.assertEqual(self.rpc_calls, [])

    def test_origin_header_is_only_allowlisted_value_and_not_response_split(self):
        status, headers, _ = self.exchange(self.request_bytes(
            method="OPTIONS", origin=ORIGIN + "\r\n\tX-Synthetic: probe"))
        self.assertEqual(status, 403)
        self.assertNotIn("Access-Control-Allow-Origin", headers)
        status, headers, _ = self.exchange(self.request_bytes(
            method="OPTIONS", origin=ORIGIN + "\r\nX-Synthetic: probe"))
        self.assertEqual(status, 204)
        self.assertEqual(headers["Access-Control-Allow-Origin"], ORIGIN)
        self.assertNotIn("X-Synthetic", headers)

    def test_trickle_request_line_headers_and_body_cannot_hold_next_client(self):
        stages = [
            b"P",
            b"POST /connect HTTP/1.1\r\nX-Synthetic: ",
            self.request_bytes(body=b"{", length=10000),
        ]
        for stage, initial in enumerate(stages):
            with self.subTest(stage=stage):
                self.accepted.clear()
                attacker = self.connect()
                attacker.sendall(initial)
                self.assertTrue(self.accepted.wait(1))
                started = time.monotonic()
                stopped = threading.Event()

                def trickle(connection=attacker, stop=stopped):
                    while not stop.wait(.03):
                        try:
                            connection.sendall(b" ")
                        except OSError:
                            return

                writer = threading.Thread(target=trickle)
                self.writers.append((stopped, writer))
                writer.start()
                legitimate = self.connect()
                legitimate.sendall(self.request_bytes(method="OPTIONS"))
                status, _, _ = self.response(legitimate)
                elapsed = time.monotonic() - started
                self.assertEqual(status, 204)
                self.assertGreater(elapsed, self.bridge.receive_timeout * .6)
                self.assertLess(elapsed, self.bridge.receive_timeout + .8)
                # The legitimate response must arrive before this test closes the attacker.
                self.assertGreaterEqual(attacker.fileno(), 0)
                self.assert_closed_without_response(attacker)
                stopped.set()
                writer.join(1)
                attacker.close()
                self.assertEqual(self.bridge.tokens, {})
                self.assertEqual(self.rpc_calls, [])
                self.assertEqual(self.token_calls.call_count, 0)

    def test_headers_and_body_share_the_same_deadline(self):
        attacker = self.connect()
        attacker.sendall(b"POST /connect HTTP/1.1\r\n")
        self.assertTrue(self.accepted.wait(1))
        time.sleep(self.bridge.receive_timeout * .65)
        rest = self.request_bytes(body=b"{", length=2).split(b"\r\n", 1)[1]
        attacker.sendall(rest)
        time.sleep(self.bridge.receive_timeout * .55)
        try:
            attacker.sendall(b"}")
        except OSError:
            pass
        self.assert_closed_without_response(attacker)
        self.assertEqual(self.bridge.tokens, {})
        self.assertEqual(self.rpc_calls, [])
        self.assertEqual(self.token_calls.call_count, 0)
        self.assertEqual(self.exchange(self.request_bytes(method="OPTIONS"))[0], 204)

    def test_eof_with_valid_json_prefix_and_incomplete_length_never_dispatches(self):
        self.bridge.tokens[ORIGIN] = SYNTHETIC_TOKEN
        ping = json.dumps({"jsonrpc": "2.0", "id": 9, "method": "ping"}).encode()
        for path, body, extra in [
            ("/connect", b"{}", ()),
            ("/mcp", ping, ("Authorization: Bearer " + SYNTHETIC_TOKEN,)),
        ]:
            with self.subTest(path=path):
                status, _, _ = self.exchange(self.request_bytes(
                    path, body, length=len(body) + 7, extra=extra), incomplete=True)
                self.assertEqual(status, 400)
        self.assertEqual(len(self.bridge.tokens), 1)
        self.assertEqual(self.rpc_calls, [])
        self.assertEqual(self.token_calls.call_count, 0)

    def test_buffered_body_cannot_issue_token_or_rpc_after_parse_expires_deadline(self):
        self.bridge.tokens[ORIGIN] = SYNTHETIC_TOKEN
        original_loads = json.loads
        ping = json.dumps({"jsonrpc": "2.0", "id": 4, "method": "ping"}).encode()

        def expire_after_parse(value):
            result = original_loads(value)
            self.handlers[-1].receive_deadline = time.monotonic() - 1
            return result

        for path, body, extra in [
            ("/connect", b"{}", ()),
            ("/mcp", ping, ("Authorization: Bearer " + SYNTHETIC_TOKEN,)),
        ]:
            with self.subTest(path=path), mock.patch.object(
                    mcp_server.json, "loads", side_effect=expire_after_parse), mock.patch.object(
                    mcp_server.secrets, "token_urlsafe", side_effect=AssertionError("token issued")):
                connection = self.connect()
                connection.sendall(self.request_bytes(path, body, extra=extra))
                self.assert_closed_without_response(connection)
        self.assertEqual(len(self.bridge.tokens), 1)
        self.assertEqual(self.rpc_calls, [])

    def test_buffered_headers_still_require_deadline_check(self):
        original_parse = BaseHTTPRequestHandler.parse_request

        def expire_after_headers(handler):
            result = original_parse(handler)
            handler.receive_deadline = time.monotonic() - 1
            return result

        with mock.patch.object(BaseHTTPRequestHandler, "parse_request",
                               expire_after_headers):
            connection = self.connect()
            connection.sendall(self.request_bytes(method="OPTIONS"))
            self.assert_closed_without_response(connection)
        self.assertEqual(self.bridge.tokens, {})
        self.assertEqual(self.rpc_calls, [])

    def test_large_fragmented_and_read_ahead_body_preserves_complete_json(self):
        self.bridge.tokens[ORIGIN] = SYNTHETIC_TOKEN
        body = json.dumps({"jsonrpc": "2.0", "id": 7, "method": "ping",
                           "params": {"synthetic": "x" * (io.DEFAULT_BUFFER_SIZE + 20000)}}).encode()
        self.assertGreater(len(body), io.DEFAULT_BUFFER_SIZE)
        request = self.request_bytes(
            "/mcp", body, extra=("Authorization: Bearer " + SYNTHETIC_TOKEN,))
        for fragmented in (True, False):
            with self.subTest(fragmented=fragmented):
                connection = self.connect()
                if fragmented:
                    for offset in range(0, len(request), 8192):
                        connection.sendall(request[offset:offset + 8192])
                        time.sleep(.003)
                else:
                    connection.sendall(request)
                status, _, response = self.response(connection)
                self.assertEqual(status, 200)
                self.assertEqual(json.loads(response)["result"], {})
        self.assertEqual(self.rpc_calls, ["ping", "ping"])

    def test_receive_deadline_does_not_cancel_completed_request_processing(self):
        self.bridge.tokens[ORIGIN] = SYNTHETIC_TOKEN
        ping = json.dumps({"jsonrpc": "2.0", "id": 8, "method": "ping"}).encode()

        def delayed_rpc(_):
            time.sleep(self.bridge.receive_timeout * 1.1)
            return {"jsonrpc": "2.0", "id": 8, "result": {}}

        with mock.patch.object(mcp_server, "rpc", side_effect=delayed_rpc):
            status, _, body = self.exchange(self.request_bytes(
                "/mcp", ping, extra=("Authorization: Bearer " + SYNTHETIC_TOKEN,)))
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body)["result"], {})
        self.assertEqual(self.response_timeouts, [self.bridge.response_timeout])


class DeadlineReaderTests(unittest.TestCase):
    def test_each_raw_receive_uses_remaining_budget_and_expiration_never_receives(self):
        connection = mock.Mock()
        connection.recv_into.return_value = 1
        with mcp_server._DeadlineReader(connection, 10.0) as reader:
            with mock.patch.object(mcp_server.time, "monotonic", side_effect=[7.0, 9.5, 10.0]):
                self.assertEqual(reader.readinto(bytearray(8)), 1)
                self.assertEqual(reader.readinto(bytearray(8)), 1)
                with self.assertRaises(TimeoutError):
                    reader.readinto(bytearray(8))
            self.assertEqual(connection.settimeout.call_args_list,
                             [mock.call(3.0), mock.call(.5)])
            self.assertEqual(connection.recv_into.call_count, 2)
        self.assertTrue(reader.closed)
        with self.assertRaises(ValueError):
            reader.readinto(bytearray(8))


if __name__ == "__main__":
    unittest.main()

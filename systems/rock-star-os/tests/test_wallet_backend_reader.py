"""Bounded reader contracts; no live provider, device, token or ledger."""
import io
import socket
from types import SimpleNamespace
import time
import unittest
from unittest.mock import Mock, patch

from wallet_backend import server as backend
import test_wallet_backend_server as tls_fixture


class ReceiveFixture:
    def __init__(self, value, fragment=65536):
        self.value = bytearray(value)
        self.fragment = fragment
        self.calls = []
        self.timeouts = []
        self.sent = bytearray()

    def settimeout(self, value):
        self.timeouts.append(value)

    def recv_into(self, buffer, count=0):
        limit = min(len(buffer), count or len(buffer))
        size = min(limit, self.fragment, len(self.value))
        self.calls.append((limit, size))
        buffer[:size] = self.value[:size]
        del self.value[:size]
        return size

    def makefile(self, *args):
        return io.BytesIO()

    def sendall(self, value):
        self.sent.extend(value)


class DeadlineReaderTests(unittest.TestCase):
    def reader(self, value, *, fragment=65536):
        connection = ReceiveFixture(value, fragment)
        return backend.DeadlineReader(connection, time.monotonic()+3), connection

    def test_header_receive_calls_scale_with_bounded_chunks_not_bytes(self):
        header = b'X-Padding: '+b'a'*8000+b'\r\n'
        reader, connection = self.reader(header)
        self.assertEqual(reader.readline(), header)
        self.assertLessEqual(len(connection.calls), 2)
        self.assertTrue(all(limit <= 8192 for limit, _ in connection.calls))
        self.assertEqual(reader.remaining, backend.MAX_HEADERS-len(header))

    def test_coalesced_body_uses_separate_budget_and_never_returns_pipeline(self):
        reader, connection = self.reader(b'header\r\n\r\nbodyNEXT REQUEST')
        self.assertEqual(reader.readline(), b'header\r\n')
        self.assertEqual(reader.readline(), b'\r\n')
        self.assertEqual(reader.remaining, backend.MAX_HEADERS-10)
        reader.remaining = 4
        self.assertEqual(reader.read(65536), b'body')
        self.assertEqual(reader.remaining, 0)
        with self.assertRaises(ValueError):
            reader.read(1)
        self.assertEqual(len(connection.calls), 1)

    def test_header_exact_limit_then_overflow_is_rejected(self):
        header = b'a'*(backend.MAX_HEADERS-2)+b'\r\n'
        reader, _ = self.reader(header+b'X')
        self.assertEqual(reader.readline(), header)
        self.assertEqual(reader.remaining, 0)
        with self.assertRaises(ValueError):
            reader.readline()

    def test_unterminated_header_over_budget_is_rejected(self):
        reader, connection = self.reader(b'a'*(backend.MAX_HEADERS+1)+b'\n')
        with self.assertRaises(ValueError):
            reader.readline()
        self.assertEqual(reader.remaining, 0)
        self.assertEqual(len(connection.value), 2)
        self.assertLessEqual(len(connection.calls), 2)

    def test_fragmented_reads_and_eof_preserve_bytes_and_budget(self):
        reader, _ = self.reader(b'head\r\nbody', fragment=2)
        self.assertEqual(reader.readline(), b'head\r\n')
        reader.remaining = 5
        result = bytearray()
        while part := reader.read(5-len(result)):
            result.extend(part)
        self.assertEqual(result, b'body')
        self.assertEqual(reader.remaining, 1)

    def test_line_size_limit_preserves_unreturned_bytes(self):
        reader, _ = self.reader(b'abcdef\nbody')
        self.assertEqual(reader.readline(3), b'abc')
        self.assertEqual(reader.readline(), b'def\n')
        reader.remaining = 4
        target = bytearray(4)
        self.assertEqual(reader.readinto(memoryview(target)), 4)
        self.assertEqual(target, b'body')

    def test_buffered_bytes_cannot_bypass_absolute_deadline(self):
        reader, connection = self.reader(b'head\nbody')
        reader.deadline = 3
        with patch.object(backend, 'time', wraps=time) as clock:
            clock.monotonic.return_value = 1
            self.assertEqual(reader.readline(), b'head\n')
            reader.remaining = 4
            before = len(connection.calls)
            clock.monotonic.return_value = 3
            with self.assertRaises(TimeoutError):
                reader.read(4)
            self.assertEqual(reader.remaining, 4)
            self.assertEqual(len(connection.calls), before)

    def test_each_refill_uses_remaining_absolute_time_without_extension(self):
        reader, connection = self.reader(b'abcdefgh', fragment=4)
        reader.deadline = 3
        reader.remaining = 8
        with patch.object(backend, 'time', wraps=time) as clock:
            clock.monotonic.return_value = 1
            self.assertEqual(reader.read(4), b'abcd')
            clock.monotonic.return_value = 2.5
            self.assertEqual(reader.read(4), b'efgh')
        self.assertEqual(connection.timeouts, [2, .5])

    def test_receive_error_preserves_budget(self):
        reader, connection = self.reader(b'body')
        reader.remaining = 4
        connection.recv_into = Mock(side_effect=TimeoutError('fixture timeout'))
        with self.assertRaises(TimeoutError):
            reader.read(4)
        self.assertEqual(reader.remaining, 4)

    def test_zero_length_read_neither_consumes_budget_nor_resets_deadline(self):
        reader, connection = self.reader(b'body')
        reader.deadline = 3
        with patch.object(backend, 'time', wraps=time) as clock:
            clock.monotonic.return_value = 1
            self.assertEqual(reader.read(0), b'')
            self.assertEqual(reader.remaining, backend.MAX_HEADERS)
            self.assertEqual(connection.value, b'body')
            clock.monotonic.return_value = 3
            with self.assertRaises(TimeoutError):
                reader.read(0)

    def test_closed_reader_cannot_return_prefetched_body(self):
        reader, connection = self.reader(b'header\nbody')
        self.assertEqual(reader.readline(), b'header\n')
        reader.close()
        reader.close()
        calls = len(connection.calls)
        with self.assertRaises(ValueError):
            reader.read(4)
        self.assertEqual(len(connection.calls), calls)


class BoundedHandlerTests(unittest.TestCase):
    def request(self, body, *, extra=b'', declared=None, padding=b'', method=b'POST'):
        size = len(body) if declared is None else declared
        return (method+b' /v1/wallet HTTP/1.1\r\nHost: localhost\r\n'
                +b'Authorization: Bearer '+backend.PUBLIC_OWNER_TOKEN.encode()+b'\r\n'
                +backend.AUTHORITY_HEADER.encode()+b': fixture-authority\r\n'
                +b'Content-Type: application/json\r\nContent-Length: '+str(size).encode()+b'\r\n'
                +padding+extra+b'\r\n'+body)

    def handle(self, raw):
        connection = ReceiveFixture(raw)
        runtime = SimpleNamespace(dispatch=Mock(return_value={'ok': True}))
        import threading
        server = SimpleNamespace(connection_deadlines={threading.get_ident(): time.monotonic()+3},
            device_bound=False, authority_id='fixture-authority', authentication_required=False,
            _runtime=runtime)
        backend.Handler(connection, ('127.0.0.1', 1), server)
        return bytes(connection.sent), runtime.dispatch

    def test_max_body_coalesced_after_header_is_admitted_exactly_once(self):
        body = b'{"v":1,"op":"health"}'
        body += b' '*(backend.MAX_REQUEST-len(body))
        response, dispatch = self.handle(self.request(body)+self.request(body))
        self.assertTrue(response.startswith(b'HTTP/1.1 200 '))
        self.assertEqual(dispatch.call_count, 1)
        self.assertEqual(dispatch.call_args.args, ({'v': 1, 'op': 'health'},))

    def test_header_exact_limit_is_admitted_without_charging_body(self):
        body = b'{"v":1,"op":"health"}'
        base = self.request(body)
        missing = backend.MAX_HEADERS-(len(base)-len(body))
        # Three headers stay below the standard library's per-line bound.
        padding = b'X-A: '+b'a'*5000+b'\r\nX-B: '+b'b'*5000+b'\r\n'
        padding += b'X-C: '+b'c'*(missing-len(padding)-7)+b'\r\n'
        raw = self.request(body, padding=padding)
        self.assertEqual(len(raw)-len(body), backend.MAX_HEADERS)
        response, dispatch = self.handle(raw)
        self.assertTrue(response.startswith(b'HTTP/1.1 200 '))
        dispatch.assert_called_once()

    def test_header_overflow_never_dispatches(self):
        padding = b'X-A: '+b'a'*8000+b'\r\nX-B: '+b'b'*8000+b'\r\nX-C: '+b'c'*1000+b'\r\n'
        _, dispatch = self.handle(self.request(b'{"v":1,"op":"health"}', padding=padding))
        dispatch.assert_not_called()

    def test_body_eof_and_malformed_json_never_dispatch(self):
        cases = [(b'{', 20), (b'{}{}', 4), (b'\xff', 1), (b'{"v":1,"v":1}', 13)]
        for body, count in cases:
            with self.subTest(body_length=len(body), count=count):
                response, dispatch = self.handle(self.request(body, declared=count))
                self.assertTrue(response.startswith(b'HTTP/1.1 400 '))
                dispatch.assert_not_called()

    def test_ambiguous_framing_and_oversized_body_never_dispatch(self):
        body = b'{"v":1,"op":"health"}'
        for extra in (b'Content-Length: 20\r\n', b'Transfer-Encoding: chunked\r\n', b'Expect: 100-continue\r\n'):
            with self.subTest(header=extra.split(b':')[0]):
                response, dispatch = self.handle(self.request(body, extra=extra))
                self.assertTrue(response.startswith(b'HTTP/1.1 400 '))
                dispatch.assert_not_called()
        response, dispatch = self.handle(self.request(body, declared=backend.MAX_REQUEST+1))
        self.assertTrue(response.startswith(b'HTTP/1.1 413 '))
        dispatch.assert_not_called()


class SlowTLSReaderTests(unittest.TestCase):
    def setUp(self):
        self.fixture = tls_fixture.WalletBackendServerTests('runTest')
        self.addCleanup(self.fixture.doCleanups)
        self.fixture.setUp()
        self.assertEqual(self.fixture.server.request_timeout, 1)

    def assert_partial_frame_expires(self, frame):
        fixture = self.fixture
        with patch.object(fixture.server._runtime, 'dispatch') as dispatch:
            with socket.create_connection(('127.0.0.1', fixture.server.server_port), timeout=3) as raw:
                with fixture.context.wrap_socket(raw, server_hostname='127.0.0.1') as connection:
                    connection.sendall(frame)
                    started = time.monotonic()
                    self.assertEqual(connection.recv(4096), b'')
                    self.assertLess(time.monotonic()-started, 2)
            dispatch.assert_not_called()
        self.assertEqual(fixture.call({'v': 1, 'op': 'health'})[0], 200)

    def test_slow_tls_header_expires_without_dispatch_and_listener_recovers(self):
        self.assert_partial_frame_expires(b'POST /v1/wallet HTTP/1.1\r\nX-Incomplete: ')

    def test_slow_tls_body_expires_without_dispatch_and_listener_recovers(self):
        frame = ('POST /v1/wallet HTTP/1.1\r\nHost: localhost\r\n'
                 +self.fixture.headers(20)+'\r\n').encode()+b'{'
        self.assert_partial_frame_expires(frame)


if __name__ == '__main__':
    unittest.main()

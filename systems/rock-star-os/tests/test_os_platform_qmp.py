"""Real UNIX monitor fixtures; these tests do not boot QEMU or accept an image."""
from contextlib import contextmanager
import importlib.util
import json
from pathlib import Path
import socket
import tempfile
import threading
import time
import unittest

spec = importlib.util.spec_from_file_location('platform_qmp', Path(__file__).resolve().parents[1] / 'os/verify-platform.py')
host = importlib.util.module_from_spec(spec)
spec.loader.exec_module(host)

GREETING = {'QMP': {'version': {'qemu': {'major': 10, 'minor': 0, 'micro': 0}}, 'capabilities': []}}


def send(connection, message):
    connection.sendall(json.dumps(message).encode() + b'\r\n')


@contextmanager
def monitor(handler):
    with tempfile.TemporaryDirectory(prefix='rock-qmp-') as directory:
        path = Path(directory) / 'monitor.sock'
        stop = threading.Event()
        failures = []
        with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as listener:
            listener.bind(str(path))
            listener.listen(1)
            listener.settimeout(2)

            def serve():
                try:
                    connection, _ = listener.accept()
                    with connection:
                        connection.settimeout(2)
                        with connection.makefile('rb') as reader:
                            handler(connection, reader, stop)
                except (BrokenPipeError, ConnectionResetError):
                    pass  # Expected when the client enforces its deadline/limit.
                except BaseException as error:
                    failures.append(error)

            worker = threading.Thread(target=serve)
            worker.start()
            try:
                yield path
            finally:
                stop.set()
                worker.join(3)
                if worker.is_alive():
                    raise AssertionError('synthetic monitor did not stop')
                if failures:
                    raise failures[0]


def negotiate(connection, reader):
    send(connection, GREETING)
    request = json.loads(reader.readline())
    assert request['execute'] == 'qmp_capabilities'
    send(connection, {'return': {}, 'id': request['id']})
    return json.loads(reader.readline())


class QmpDeadlineTests(unittest.TestCase):
    def assert_bounded_timeout(self, handler):
        with monitor(handler) as path:
            started = time.monotonic()
            with self.assertRaises(TimeoutError):
                host.qmp(path, 'query-status', timeout=0.08)
            self.assertLess(time.monotonic() - started, 1)

    def test_events_and_other_ids_do_not_replace_successful_response(self):
        def handler(connection, reader, stop):
            request = negotiate(connection, reader)
            self.assertEqual(request['execute'], 'screendump')
            self.assertEqual(request['arguments'], {'filename': '/synthetic/frame.png'})
            send(connection, {'event': 'STOP'})
            send(connection, {'return': {'stale': True}, 'id': 'old-request'})
            send(connection, {'return': {}, 'id': request['id']})
        with monitor(handler) as path:
            self.assertEqual(host.qmp(path, 'screendump', {'filename': '/synthetic/frame.png'}), {})

    def test_continuous_events_cannot_extend_command_deadline(self):
        def handler(connection, reader, stop):
            negotiate(connection, reader)
            while not stop.wait(0.005):
                send(connection, {'event': 'SYNTHETIC_HEARTBEAT'})
        self.assert_bounded_timeout(handler)

    def test_continuous_wrong_ids_cannot_extend_negotiation_deadline(self):
        def handler(connection, reader, stop):
            send(connection, GREETING)
            reader.readline()
            while not stop.wait(0.005):
                send(connection, {'return': {}, 'id': 'different-negotiation'})
        self.assert_bounded_timeout(handler)

    def test_slow_partial_greeting_cannot_reset_deadline(self):
        def handler(connection, reader, stop):
            connection.sendall(b'{"QMP":')
            while not stop.wait(0.005):
                connection.sendall(b' ')
        self.assert_bounded_timeout(handler)

    def test_unterminated_frame_is_bounded(self):
        def handler(connection, reader, stop):
            connection.sendall(b'{' + b' ' * host.QMP_MAX_FRAME)
        with monitor(handler) as path, self.assertRaisesRegex(RuntimeError, 'frame limit'):
            host.qmp(path, 'query-status')

    def test_negotiation_error_never_dispatches_the_command(self):
        for include_id in (True, False):
            def handler(connection, reader, stop):
                send(connection, GREETING)
                request = json.loads(reader.readline())
                error = {'error': {'class': 'GenericError', 'desc': 'synthetic rejection'}}
                if include_id:
                    error['id'] = request['id']
                send(connection, error)
                self.assertEqual(reader.readline(), b'')
            with self.subTest(include_id=include_id), monitor(handler) as path:
                with self.assertRaisesRegex(RuntimeError, 'command failed'):
                    host.qmp(path, 'screendump')

    def test_eof_and_missing_results_fail_without_success(self):
        for response in (None, {'id': 'rock'}):
            def handler(connection, reader, stop):
                negotiate(connection, reader)
                if response is not None:
                    send(connection, response)
            with self.subTest(response=response), monitor(handler) as path:
                with self.assertRaises(RuntimeError):
                    host.qmp(path, 'query-status')


if __name__ == '__main__':
    unittest.main()

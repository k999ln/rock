"""Service entrypoint failures must release workers so supervision can restart."""
from contextlib import ExitStack, redirect_stdout
import importlib.util
import io
from pathlib import Path
import threading
import unittest
from unittest.mock import Mock, patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('platform_lifecycle_test', ROOT / 'os/platform/service.py')
service = importlib.util.module_from_spec(spec)
spec.loader.exec_module(service)


class RunningService:
    """A real non-daemon worker models resources that would prevent process exit."""
    def __init__(self):
        self.closed = 0
        self.stop = threading.Event()
        self.thread = threading.Thread(target=self.stop.wait, daemon=False)
        self.thread.start()

    def close(self):
        self.closed += 1
        self.stop.set()
        self.thread.join(timeout=1)


class ServerFixture:
    def __init__(self, failure=None):
        self.failure = failure
        self.exited = False

    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.exited = True

    def serve_forever(self, **_):
        if self.failure:
            raise self.failure

    def shutdown(self):
        pass


class PlatformServiceLifecycleTests(unittest.TestCase):
    def invoke(self, role, constructor):
        running = RunningService()
        self.addCleanup(running.close)
        uid = service.PLATFORM_UID if role == 'platform' else service.WALLET_UID
        libc = Mock()
        libc.prctl.return_value = 0
        with ExitStack() as stack:
            stack.enter_context(patch.object(service.sys, 'argv', ['service.py', '--role', role]))
            stack.enter_context(patch.object(service.os, 'getuid', return_value=uid))
            stack.enter_context(patch.object(service.os, 'geteuid', return_value=uid))
            stack.enter_context(patch.object(service.os, 'umask'))
            stack.enter_context(patch.object(service.ctypes, 'CDLL', return_value=libc))
            stack.enter_context(patch.object(service.signal, 'signal'))
            stack.enter_context(patch.object(service, 'Platform', return_value=running))
            stack.enter_context(patch.object(service, 'device_wallet_service', return_value=running))
            stack.enter_context(patch.object(service, 'platform_clients', return_value=(None, {}, {})))
            stack.enter_context(patch('service_access.os_client.resolve', return_value=None))
            stack.enter_context(patch('mcp_broker.device_client.resolve', return_value=(None, {})))
            server_constructor = stack.enter_context(patch.object(service, 'Server', side_effect=constructor))
            stack.enter_context(redirect_stdout(io.StringIO()))
            try:
                service.main()
            finally:
                # Assert before cleanup: main itself must stop the real worker.
                self.assertEqual(1, running.closed)
                self.assertFalse(running.thread.is_alive())
                expected_socket = service.PLATFORM_SOCKET if role == 'platform' else service.WALLET_SOCKET
                self.assertEqual(expected_socket, server_constructor.call_args.args[0])

    def test_bind_failure_closes_workers_for_both_roles(self):
        for role in ('platform', 'wallet'):
            with self.subTest(role=role), self.assertRaisesRegex(OSError, '^controlled bind failure$'):
                self.invoke(role, OSError('controlled bind failure'))

    def test_serving_failure_closes_server_and_workers_for_both_roles(self):
        for role in ('platform', 'wallet'):
            server = ServerFixture(RuntimeError('controlled serving failure'))
            with self.subTest(role=role), self.assertRaisesRegex(RuntimeError, '^controlled serving failure$'):
                self.invoke(role, lambda *_: server)
            self.assertTrue(server.exited)

    def test_normal_shutdown_also_closes_workers_exactly_once(self):
        for role in ('platform', 'wallet'):
            server = ServerFixture()
            with self.subTest(role=role):
                self.invoke(role, lambda *_: server)
                self.assertTrue(server.exited)


if __name__ == '__main__':
    unittest.main()

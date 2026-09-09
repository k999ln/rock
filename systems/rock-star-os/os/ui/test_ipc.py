"""Isolated protocol fixtures; no production services or state are used."""
import json
import os
from pathlib import Path
import socket
import subprocess
import tempfile
import threading
import time
import unittest


class NativeIPC(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.binary = str(Path(__file__).with_name("rock-ipc-test"))

    def exchange(self, response=b'{"ok":true,"snapshot":{}}\n', *, delay=0, expected_uid=None, request=None, timeout=5):
        with tempfile.TemporaryDirectory(prefix="rock-ui-ipc-") as directory:
            path = str(Path(directory) / "api.sock")
            server = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
            server.bind(path)
            server.listen(1)
            received = []

            def serve():
                try:
                    connection, _ = server.accept()
                    with connection:
                        connection.settimeout(4)
                        data = bytearray()
                        while b"\n" not in data:
                            part = connection.recv(8192)
                            if not part:
                                break
                            data.extend(part)
                        received.append(bytes(data))
                        if delay:
                            time.sleep(delay)
                        try:
                            connection.sendall(response)
                        except (BrokenPipeError, ConnectionResetError):
                            pass
                finally:
                    server.close()

            worker = threading.Thread(target=serve, daemon=True)
            worker.start()
            started = time.monotonic()
            result = subprocess.run(
                [self.binary, path, str(os.getuid() if expected_uid is None else expected_uid),
                 json.dumps(request or {"v": 1, "op": "snapshot"}, ensure_ascii=False)],
                capture_output=True, text=True, timeout=timeout,
            )
            elapsed = time.monotonic() - started
            worker.join(timeout=5)
            self.assertFalse(worker.is_alive())
            return result, received, elapsed

    def test_success_and_exact_request(self):
        result, requests, _ = self.exchange()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue(json.loads(result.stdout)["ok"])
        self.assertEqual(json.loads(requests[0]), {"v": 1, "op": "snapshot"})

    def test_backend_rejection_is_preserved(self):
        result, _, _ = self.exchange(b'{"ok":false,"error":"permission denied","code":"FORBIDDEN"}\n')
        self.assertEqual(result.returncode, 0)
        self.assertEqual(json.loads(result.stdout)["error"], "permission denied")

    def test_peer_authentication(self):
        result, requests, _ = self.exchange(expected_uid=os.getuid() + 1)
        self.assertEqual(result.returncode, 1)
        self.assertIn("peer rejected", result.stderr)
        self.assertEqual(requests, [b""])

    def test_malformed_and_missing_status_are_rejected(self):
        for response in (b'not-json\n', b'{}\n', b'{"ok":1}\n', b'[]\n', b'{"ok":true}\n{}\n', b'{"ok":true}\x00\n'):
            with self.subTest(response=response):
                result, _, _ = self.exchange(response)
                self.assertEqual(result.returncode, 1)

    def test_truncated_response(self):
        result, _, _ = self.exchange(b'{"ok":true}')
        self.assertEqual(result.returncode, 1)
        self.assertIn("complete response", result.stderr)

    def test_response_limit(self):
        result, _, _ = self.exchange(b'{"ok":true,"text":"' + b'a' * (1024 * 1024) + b'"}\n')
        self.assertEqual(result.returncode, 1)
        self.assertIn("exceeds 1 MiB", result.stderr)

    def test_timeout(self):
        result, _, elapsed = self.exchange(delay=3.4)
        self.assertEqual(result.returncode, 1)
        self.assertGreater(elapsed, 2.8)
        self.assertLess(elapsed, 3.35)
        self.assertIn("timed out", result.stderr)

    def test_json_escaped_text_round_trip(self):
        payload = {"v": 1, "op": "run", "text": '日本語\n"quoted"\ttext', "key": "test-only-request"}
        result, requests, _ = self.exchange(request=payload)
        self.assertEqual(result.returncode, 0)
        self.assertEqual(json.loads(requests[0]), payload)

    def test_install_and_update_allow_bounded_download_latency(self):
        for operation in ('install', 'update'):
            with self.subTest(operation=operation):
                request = {'v': 1, 'op': operation, 'key': 'test-download', 'id': 'test.tool', 'version': '1.0.0'}
                result, requests, elapsed = self.exchange(delay=3.4, request=request)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(json.loads(requests[0]), request)
                self.assertGreater(elapsed, 3.2)

    def test_install_still_has_a_total_deadline(self):
        request = {'v': 1, 'op': 'install', 'key': 'test-timeout', 'id': 'test.tool', 'version': '1.0.0'}
        result, _, elapsed = self.exchange(delay=15.4, request=request, timeout=17)
        self.assertEqual(result.returncode, 1)
        self.assertGreater(elapsed, 14.8)
        self.assertLess(elapsed, 16)
        self.assertIn('timed out', result.stderr)

    def test_power_receipt_allows_slow_durable_commit(self):
        for operation in ('device.reboot', 'device.poweroff'):
            with self.subTest(operation=operation):
                request = {'v': 1, 'op': operation, 'key': 'test-power-receipt'}
                result, requests, elapsed = self.exchange(delay=3.4, request=request)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(json.loads(requests[0]), request)
                self.assertGreater(elapsed, 3.2)

    def test_request_limit_checked_before_connect(self):
        result = subprocess.run([self.binary, "/tmp/no-rock-ui-service", str(os.getuid()), "--oversized-request"],
                                capture_output=True, text=True, timeout=5)
        self.assertEqual(result.returncode, 1)
        self.assertIn("exceeds 256 KiB", result.stderr)


if __name__ == "__main__":
    unittest.main(verbosity=2)

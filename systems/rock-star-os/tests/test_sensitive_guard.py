import importlib.util
import json
import os
from pathlib import Path
import tempfile
import time
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('sensitive_guard_test', ROOT / 'os/platform/sensitive_guard.py')
guard = importlib.util.module_from_spec(spec)
spec.loader.exec_module(guard)


class SensitiveGuardTests(unittest.TestCase):
    def test_detection_metadata_offsets_and_overlap(self):
        text = '日本語の見出し\nOPENAI_API_KEY="dummy_fixture"\nuser@example.test\n090-0000-1234\n4111 1111 1111 1111'
        findings = guard.inspect_text(text)
        self.assertEqual(4, len(findings))
        self.assertEqual('APIキー', findings[0]['label'])
        self.assertEqual('dummy_fixture', text[findings[0]['start']:findings[0]['end']])
        self.assertNotIn('dummy_fixture', json.dumps(findings))
        self.assertEqual(1, len(guard.inspect_text('access_token="user@example.test"')))
        self.assertEqual([], guard.inspect_text('4111 1111 1111 1112'))
        self.assertEqual([], guard.inspect_text('0000 0000 0000 0000'))
        self.assertEqual([], guard.inspect_text('const API_KEY = process.env.API_KEY;'))
        pem = '-----BEGIN PRIVATE KEY-----\nPLACEHOLDER\n-----END PRIVATE KEY-----'
        self.assertEqual(len(pem), guard.inspect_text(pem)[0]['end'])

    def test_nested_enforcement_and_inspection_limits(self):
        for value in ({'nested': [{'AWS_SECRET_ACCESS_KEY': 'dummy_fixture'}]},
                      {'data': 'user@example.test'}, {'number': 4111111111111111},
                      'x' * (guard.MAX_TEXT_LENGTH + 1), float('nan'), object()):
            with self.assertRaisesRegex(ValueError, '^SENSITIVE_DATA_BLOCKED$'):
                guard.assert_safe_outbound(value)
        cyclic = []
        cyclic.append(cyclic)
        with self.assertRaisesRegex(ValueError, '^SENSITIVE_DATA_BLOCKED$'):
            guard.assert_safe_outbound(cyclic)
        value = {}
        for _ in range(22):
            value = {'child': value}
        with self.assertRaisesRegex(ValueError, '^SENSITIVE_DATA_BLOCKED$'):
            guard.assert_safe_outbound(value)
        self.assertTrue(guard.assert_safe_outbound({'text': 'A public greeting', 'n': 12}))

    def test_boundary_blocks_before_send_and_records_only_safe_metadata(self):
        with tempfile.TemporaryDirectory() as directory:
            watcher = guard.SensitiveGuard(directory)
            sent = []
            def send(value):
                watcher.inspect(value, 'runner.submit')
                sent.append(value)
            with self.assertRaisesRegex(ValueError, '^SENSITIVE_DATA_BLOCKED$'):
                send({'password': 'dummy_fixture'})
            self.assertEqual([], sent)
            send({'text': 'public'})
            state = watcher.status()
            self.assertEqual(2, state['inspections'])
            self.assertEqual(1, state['blocked'])
            self.assertNotIn('dummy_fixture', json.dumps(state))
            self.assertNotIn('password', json.dumps(state))
            state['events'].clear()
            self.assertEqual(1, len(watcher.status()['events']))
            watcher.close()

    def test_worker_detects_real_file_mutation_and_deletion(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'notes.txt'
            path.write_text('Public note', encoding='utf-8')
            watcher = guard.SensitiveGuard(directory, interval=0.03)
            watcher.start()
            self.addCleanup(watcher.close)
            self.assertEqual(1, watcher.status()['filesScanned'])
            self.assertEqual(0, watcher.status()['candidateCount'])
            path.write_text('heading\nOPENAI_API_KEY="dummy_fixture"', encoding='utf-8')
            self.wait_for(lambda: watcher.status()['candidateCount'] == 1)
            state = watcher.status()
            self.assertEqual(2, state['findings'][0]['line'])
            self.assertEqual('notes.txt', state['findings'][0]['path'])
            self.assertNotIn('dummy_fixture', json.dumps(state))
            path.unlink()
            self.wait_for(lambda: watcher.status()['candidateCount'] == 0)
            watcher.close()
            self.assertFalse(watcher.thread.is_alive())

    def test_scope_rejects_symlink_hardlink_binary_and_reports_incomplete(self):
        with tempfile.TemporaryDirectory() as directory, tempfile.TemporaryDirectory() as outside:
            root = Path(directory)
            secret = Path(outside) / 'outside.txt'
            secret.write_text('API_KEY="dummy_fixture"', encoding='utf-8')
            (root / 'linked.txt').symlink_to(secret)
            (root / 'linked-dir').symlink_to(outside, target_is_directory=True)
            os.link(secret, root / 'hardlink.txt')
            (root / 'private.sqlite').write_bytes(b'API_KEY="dummy_fixture"')
            (root / 'binary.txt').write_bytes(b'\x00API_KEY="dummy_fixture"')
            (root / 'large.txt').write_text('x' * (guard.MAX_TEXT_LENGTH + 1))
            watcher = guard.SensitiveGuard(root)
            watcher.start()
            try:
                state = watcher.status()
                self.assertEqual(0, state['candidateCount'])
                self.assertTrue(state['coverageLimited'])
                self.assertEqual(2, state['skipped']['symlink'])
                self.assertEqual(2, state['skipped']['excluded'])
                self.assertEqual(1, state['skipped']['binary'])
                self.assertEqual(1, state['skipped']['oversize'])
            finally:
                watcher.close()

    def test_root_symlink_and_filename_personal_data_never_escape(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            data = root / 'data'
            data.mkdir()
            (data / 'user@example.test.txt').write_text('API_KEY="dummy_fixture"')
            watcher = guard.SensitiveGuard(data)
            watcher.start()
            try:
                self.assertNotIn('user@example.test', json.dumps(watcher.status()))
            finally:
                watcher.close()

            link = root / 'linked'
            link.symlink_to(data, target_is_directory=True)
            watcher = guard.SensitiveGuard(link)
            watcher.start()
            try:
                self.assertEqual('error', watcher.status()['status'])
                self.assertTrue(watcher.status()['coverageLimited'])
            finally:
                watcher.close()

    def test_dotenv_is_scanned_and_detection_cap_is_reported_incomplete(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / '.env').write_text('OPENAI_API_KEY="dummy_fixture"')
            (root / 'too-many.txt').write_text('\n'.join('user%d@example.test' % index for index in range(guard.MAX_FINDINGS + 1)))
            watcher = guard.SensitiveGuard(root)
            watcher.start()
            try:
                state = watcher.status()
                self.assertEqual(1, state['candidateCount'])
                self.assertEqual('.env', state['findings'][0]['path'])
                self.assertTrue(state['coverageLimited'])
                self.assertEqual(1, state['skipped']['unreadable'])
            finally:
                watcher.close()

    def test_health_requires_live_worker_and_monotonic_recent_scan(self):
        with tempfile.TemporaryDirectory() as directory:
            watcher = guard.SensitiveGuard(directory)
            self.assertFalse(watcher.status()['workerAlive'])
            self.assertFalse(watcher.status()['fresh'])
            watcher.start()
            try:
                self.assertTrue(watcher.status()['workerAlive'])
                self.assertTrue(watcher.status()['fresh'])
                with patch.object(guard.time, 'time', return_value=1):
                    self.assertTrue(watcher.status()['fresh'])
                with patch.object(watcher.thread, 'is_alive', return_value=False):
                    self.assertFalse(watcher.status()['workerAlive'])
                    self.assertFalse(watcher.status()['fresh'])
                watcher._last_success_monotonic = time.monotonic() - 91
                self.assertFalse(watcher.status()['fresh'])
                watcher._last_success_monotonic = time.monotonic()
                watcher._report['status'] = 'error'
                self.assertFalse(watcher.status()['fresh'])
            finally:
                watcher.close()
            self.assertFalse(watcher.status()['workerAlive'])
            self.assertFalse(watcher.status()['fresh'])

    def wait_for(self, check):
        deadline = time.monotonic() + 3
        while time.monotonic() < deadline:
            if check():
                return
            time.sleep(0.01)
        self.fail('guard did not update within the bounded deadline')


if __name__ == '__main__':
    unittest.main()

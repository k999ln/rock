"""Observe real failing child tests before cleanup, preserving their outcome."""
import json
import os
from pathlib import Path
import stat
import subprocess
import sys
import tempfile
import unittest

from native_failure_diagnostics import private_sidecar


class NativeFailureDiagnosticsTests(unittest.TestCase):
    def child(self, body, *, diagnostic=True):
        temporary = tempfile.TemporaryDirectory(prefix='rock-failure-observer-')
        self.addCleanup(temporary.cleanup)
        root = Path(temporary.name)
        (root / 'tests').mkdir()
        (root / 'tests/test_probe.py').write_text(
            'import threading, unittest\n'
            'def blocked_worker(ready, stop):\n'
            '    local_value = "PRIVATE_LOCAL_SENTINEL"\n'
            '    ready.set()\n'
            '    stop.wait()\n'
            'class Probe(unittest.TestCase):\n'
            '    def setUp(self):\n'
            '        ready, stop = threading.Event(), threading.Event()\n'
            '        worker = threading.Thread(target=blocked_worker, args=(ready, stop))\n'
            '        worker.start()\n'
            '        self.addCleanup(lambda: (stop.set(), worker.join(2)))\n'
            '        self.assertTrue(ready.wait(2))\n'
            '    def test_observed(self):\n' + body)
        command = [sys.executable, '-B', '-W', 'error::ResourceWarning', '-m', 'native_partition',
                   '--index', '0', '--count', '1', '--selection', str(root/'selection.json')]
        if diagnostic:
            command.append('--capture-test-failures')
        result = subprocess.run(command, cwd=root,
            env=dict(os.environ, PYTHONDONTWRITEBYTECODE='1', PYTHONPATH=str(Path(__file__).parent)),
            capture_output=True, text=True, timeout=6)
        return result, root/'selection.failures.stacks.log', root/'selection.timings.jsonl'

    def assert_observation(self, path, event):
        contents = path.read_text()
        record = json.loads(contents.splitlines()[0])
        self.assertEqual(record['event'], event)
        self.assertEqual(record['test'], 'test_probe.Probe.test_observed')
        self.assertIn('blocked_worker', contents)
        self.assertNotIn('PRIVATE_LOCAL_SENTINEL', contents)
        self.assertNotIn('PRIVATE_EXCEPTION_SENTINEL', contents)
        self.assertNotIn('PRIVATE_SUBTEST_SENTINEL', contents)
        self.assertGreaterEqual(record['resources']['live_threads'], 2)
        self.assertGreaterEqual(record['resources']['process_cpu_seconds'], 0)
        self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o600)

    def test_error_preserves_failure_and_observes_worker_before_cleanup(self):
        result, path, timings = self.child('        raise RuntimeError("PRIVATE_EXCEPTION_SENTINEL")\n')
        self.assertEqual(result.returncode, 1, result.stderr)
        self.assertIn('FAILED (errors=1)', result.stderr)
        self.assert_observation(path, 'error')
        self.assertEqual(len(timings.read_text().splitlines()), 1)

    def test_assertion_failure_remains_failed_and_is_observed(self):
        result, path, _ = self.child('        self.fail("PRIVATE_EXCEPTION_SENTINEL")\n')
        self.assertEqual(result.returncode, 1, result.stderr)
        self.assertIn('FAILED (failures=1)', result.stderr)
        self.assert_observation(path, 'failure')

    def test_subtest_failure_does_not_export_parameters(self):
        result, path, _ = self.child(
            '        with self.subTest(value="PRIVATE_SUBTEST_SENTINEL"):\n'
            '            raise RuntimeError("PRIVATE_EXCEPTION_SENTINEL")\n')
        self.assertEqual(result.returncode, 1, result.stderr)
        self.assert_observation(path, 'subtest_error')

    def test_success_is_unchanged_and_leaves_empty_failure_sidecar(self):
        result, path, _ = self.child('        self.assertTrue(True)\n')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(path.read_bytes(), b'')

    def test_default_execution_does_not_create_failure_sidecar(self):
        result, path, _ = self.child('        self.fail("original failure")\n', diagnostic=False)
        self.assertEqual(result.returncode, 1, result.stderr)
        self.assertFalse(path.exists())

    def test_existing_files_and_links_are_never_overwritten(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            target = root/'original'
            target.write_bytes(b'preserve')
            for kind in ('file', 'symlink', 'hardlink'):
                path = root/kind
                if kind == 'file': path.write_bytes(b'preserve')
                elif kind == 'symlink': path.symlink_to(target)
                else: os.link(target, path)
                with self.subTest(kind=kind), self.assertRaises(FileExistsError):
                    private_sidecar(path)
                self.assertEqual(target.read_bytes(), b'preserve')


if __name__ == '__main__':
    unittest.main()

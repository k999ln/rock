"""Small real child processes for the optional host runner's stack observation."""
import hashlib
import importlib.util
import os
from pathlib import Path
import stat
import sys
import tempfile
import time
import unittest


RUNNER_PATH = Path(__file__).resolve().parents[3] / 'scripts/test-native.py'
SPEC = importlib.util.spec_from_file_location('native_stack_runner', RUNNER_PATH)
RUNNER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(RUNNER)
PREFIX = [sys.executable, '-B', '-W', 'error::ResourceWarning']


class NativeStackDiagnostics(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='rock-stack-test-')
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.counter = 0

    def child(self, arguments, *, diagnostic=False, timeout=5):
        self.counter += 1
        log = self.root / ('child-%d.log' % self.counter)
        stack = self.root / ('child-%d.stacks.log' % self.counter)
        command = PREFIX + arguments
        original = list(command)
        with log.open('wb') as output:
            code, evidence = RUNNER.run_process(
                command, cwd=self.root,
                env=dict(os.environ, PYTHONDONTWRITEBYTECODE='1', PYTHONPATH=''),
                stream=output, timeout=timeout,
                stack_path=stack if diagnostic else None)
        self.assertEqual(command, original)
        return code, log.read_text(), evidence, stack

    def test_script_keeps_arguments_imports_flags_and_stdout(self):
        folder = self.root / 'program'
        folder.mkdir()
        (folder / 'sibling.py').write_text('VALUE = 42\n')
        script = folder / 'entry.py'
        script.write_text('import json, sibling, sys\n'
                          'print(json.dumps([sys.argv, sibling.VALUE, sys.flags.dont_write_bytecode]))\n')
        plain = self.child([str(script), 'original-request'])
        observed = self.child([str(script), 'original-request'], diagnostic=True)
        self.assertEqual(plain[:2], observed[:2])
        self.assertEqual(observed[0], 0)
        self.assertIsNone(plain[2])
        self.assertFalse(plain[3].exists())
        self.assertFalse(observed[3].exists())
        self.assertEqual(observed[2]['status'], 'NOT_APPLICABLE_DIRECT_SCRIPT')

    def test_relative_script_keeps_file_main_and_sibling_executable_lookup(self):
        executable = self.root / 'rock-ipc-test'
        executable.write_text('#!/bin/sh\nprintf "sibling executed\\n"\n')
        executable.chmod(0o700)
        (self.root / 'test_ipc.py').write_text(
            'import json, subprocess, sys\nfrom pathlib import Path\n'
            'subprocess.run([str(Path(__file__).with_name("rock-ipc-test"))], check=True)\n'
            'print(json.dumps([sys.argv, __file__, sys.modules["__main__"].__file__]))\n')
        plain = self.child(['test_ipc.py', 'original-request'])
        observed = self.child(['test_ipc.py', 'original-request'], diagnostic=True)
        self.assertEqual(plain[:2], observed[:2])
        self.assertEqual(observed[0], 0)
        self.assertIn('sibling executed', observed[1])
        self.assertFalse(observed[3].exists())
        self.assertEqual(observed[2]['status'], 'NOT_APPLICABLE_DIRECT_SCRIPT')

    def test_module_keeps_arguments_and_module_identity(self):
        (self.root / 'probe.py').write_text(
            'import json, sys\nprint(json.dumps([sys.argv, __name__, __file__]))\n')
        plain = self.child(['-m', 'probe', 'unchanged'])
        observed = self.child(['-m', 'probe', 'unchanged'], diagnostic=True)
        self.assertEqual(plain[:2], observed[:2])
        self.assertEqual(observed[0], 0)

    def test_original_failure_stays_failed_without_diagnostic_log_noise(self):
        script = self.root / 'failed.py'
        script.write_text('import sys\nprint("original failure", flush=True)\nsys.exit(7)\n')
        plain = self.child(['-m', 'failed'])
        observed = self.child(['-m', 'failed'], diagnostic=True)
        self.assertEqual(plain[:2], observed[:2])
        self.assertEqual(observed[0], 7)
        self.assertFalse(RUNNER.log_result(observed[1], observed[0])['passed'])
        self.assertEqual(observed[3].read_bytes(), b'')

    def check_blocked_child(self, shutdown):
        script = self.root / 'blocked.py'
        script.write_text(
            'import threading\n'
            'def blocked_worker():\n'
            '    private_value = "DO_NOT_PRINT_LOCAL_VALUE"\n'
            '    threading.Event().wait()\n'
            'worker = threading.Thread(target=blocked_worker)\n'
            'worker.start()\n'
            'print("started", flush=True)\n' + ('' if shutdown else 'worker.join()\n'))
        started = time.monotonic()
        code, log, evidence, stack = self.child(['-m', 'blocked'], diagnostic=True, timeout=1)
        self.assertEqual(code, 124)
        self.assertLess(time.monotonic() - started, 4)
        self.assertEqual(log, 'started\n')
        contents = stack.read_bytes()
        self.assertIn(b'blocked_worker', contents)
        self.assertIn(b'Thread', contents)
        self.assertNotIn(b'DO_NOT_PRINT_LOCAL_VALUE', contents)
        self.assertEqual(stat.S_IMODE(stack.stat().st_mode), 0o600)
        self.assertEqual(evidence['sha256'], hashlib.sha256(contents).hexdigest())
        self.assertEqual(evidence['bytes'], len(contents))
        self.assertFalse(RUNNER.log_result(log, code)['passed'])

    def test_blocked_test_dumps_threads_and_keeps_original_deadline(self):
        self.check_blocked_child(False)

    def test_interpreter_thread_shutdown_is_also_observable(self):
        self.check_blocked_child(True)

    def test_existing_or_linked_sidecar_is_not_overwritten(self):
        target = self.root / 'original'
        target.write_bytes(b'preserve')
        for kind in ('file', 'symlink', 'hardlink'):
            path = self.root / kind
            if kind == 'symlink':
                path.symlink_to(target)
            elif kind == 'hardlink':
                os.link(target, path)
            else:
                path.write_bytes(b'preserve')
            with self.subTest(kind=kind), (self.root / 'log').open('wb') as output:
                with self.assertRaises(FileExistsError):
                    RUNNER.run_process(PREFIX + ['-m', 'unittest'], cwd=self.root,
                                       env=os.environ, stream=output, timeout=5, stack_path=path)
            self.assertEqual(target.read_bytes(), b'preserve')


if __name__ == '__main__':
    unittest.main()

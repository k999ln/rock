"""Test the diagnostic pidfd observation race without weakening health proofs."""
import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import select
import signal
import subprocess
import sys
import types
import unittest
from unittest import mock


def fixture():
    path = Path(__file__).resolve().parents[1] / 'os/update/ui_startup_fixture.py'
    spec = importlib.util.spec_from_file_location('startup_fault_fixture', path)
    module = importlib.util.module_from_spec(spec)
    with mock.patch.dict(sys.modules, {'ui_health': types.SimpleNamespace(check=lambda: None)}):
        spec.loader.exec_module(module)
    return module


class StartupFaultFixture(unittest.TestCase):
    def test_crash_waits_for_same_pidfd_without_racing_proc_stat(self):
        module = fixture()
        proof = {'pid': 123, 'process_start_ticks': 456}
        output = io.StringIO()
        with mock.patch.object(module.sys, 'argv', ['fixture', 'crash']), \
             mock.patch.object(module.os, 'geteuid', return_value=0), \
             mock.patch.object(module.os, 'pidfd_open', return_value=77, create=True), \
             mock.patch.object(module.os, 'close'), \
             mock.patch.object(module.ui_health, 'check', return_value=proof), \
             mock.patch.object(module.signal, 'pidfd_send_signal', create=True) as send, \
             mock.patch.object(module.select, 'select', side_effect=[([], [], []), ([], [], []), ([77], [], [])]), \
             mock.patch.object(module.time, 'sleep'), \
             mock.patch.object(module.Path, 'read_bytes', side_effect=AssertionError('crash must use pidfd exit, not /proc')), \
             contextlib.redirect_stdout(output):
            module.main()
        send.assert_called_once_with(77, signal.SIGKILL)
        row = json.loads(output.getvalue().split('ROCK_UI_STARTUP_FAULT ', 1)[1])
        self.assertEqual(row, {'mode': 'crash', 'pid': 123, 'process_start_ticks': 456, 'stopped': False, 'exited': True})

    def test_missing_exit_readiness_never_becomes_success(self):
        module = fixture()
        proof = {'pid': 123, 'process_start_ticks': 456}
        output = io.StringIO()
        with mock.patch.object(module.sys, 'argv', ['fixture', 'crash']), \
             mock.patch.object(module.os, 'geteuid', return_value=0), \
             mock.patch.object(module.os, 'pidfd_open', return_value=77, create=True), \
             mock.patch.object(module.os, 'close'), \
             mock.patch.object(module.ui_health, 'check', return_value=proof), \
             mock.patch.object(module.signal, 'pidfd_send_signal', create=True), \
             mock.patch.object(module.select, 'select', return_value=([], [], [])), \
             mock.patch.object(module.time, 'sleep'), \
             mock.patch.object(module.time, 'monotonic', side_effect=[0, 0, 6]), \
             contextlib.redirect_stdout(output):
            with self.assertRaisesRegex(RuntimeError, 'signal did not create'):
                module.main()
        self.assertNotIn('ROCK_UI_STARTUP_FAULT ', output.getvalue())

    @unittest.skipUnless(sys.platform == 'linux' and hasattr(os, 'pidfd_open'), 'real Linux pidfd required')
    def test_actual_sigkill_exit_with_nonreadable_poll_before_exit_observation(self):
        module = fixture()
        process = subprocess.Popen([sys.executable, '-B', '-c', 'import time; time.sleep(60)'])
        actual_select = select.select
        calls = 0
        proof = {'pid': process.pid, 'process_start_ticks': 1}
        def poll(readable, writable, exceptional, timeout):
            nonlocal calls
            calls += 1
            # Model the measured scheduling window once; later polls must use
            # the actual same kernel pidfd and observe real process death.
            if calls == 2:
                return [], [], []
            return actual_select(readable, writable, exceptional, timeout)
        output = io.StringIO()
        try:
            with mock.patch.object(module.sys, 'argv', ['fixture', 'crash']), \
                 mock.patch.object(module.os, 'geteuid', return_value=0), \
                 mock.patch.object(module.ui_health, 'check', return_value=proof), \
                 mock.patch.object(module.select, 'select', side_effect=poll), \
                 mock.patch.object(module.time, 'sleep', side_effect=lambda duration: None if duration == 3 else __import__('threading').Event().wait(duration)), \
                 mock.patch.object(module.Path, 'read_bytes', side_effect=AssertionError('no crash proc-stat read')), \
                 contextlib.redirect_stdout(output):
                module.main()
            self.assertEqual(process.wait(timeout=5), -signal.SIGKILL)
            row = json.loads(output.getvalue().split('ROCK_UI_STARTUP_FAULT ', 1)[1])
            self.assertEqual((row['pid'], row['exited'], row['stopped']), (process.pid, True, False))
        finally:
            if process.poll() is None:
                process.kill()
                process.wait(timeout=5)


if __name__ == '__main__':
    unittest.main()

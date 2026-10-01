"""Real POSIX subprocess regressions; fault workers are explicit test fixtures."""
from contextlib import ExitStack
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import selectors
import signal
import subprocess
import sys
import tempfile
import threading
import time
import types
import unittest
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
TOOLKIT = ROOT / 'toolkits/mr'
FIXTURE = ROOT / 'systems/rock-star-os/os/tools/fixtures/citations.md'


def module():
    spec = importlib.util.spec_from_file_location('pc_adapter_case', TOOLKIT / 'pc_citations.py')
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value


class PCAdapterTests(unittest.TestCase):
    def setUp(self):
        self.adapter = module()
        self.stack = ExitStack()
        self.addCleanup(self.stack.close)
        self.directories, self.children = [], []
        original = self.adapter._spawn
        def spawn(directory):
            self.directories.append(directory)
            process = original(directory)
            self.children.append(process)
            return process
        self.stack.enter_context(mock.patch.object(self.adapter, '_spawn', spawn))

    def assert_clean(self):
        self.assertTrue(all(not path.exists() for path in self.directories))
        for process in self.children:
            self.assertIsNotNone(process.returncode)
            self.assertTrue(process.stdout.closed and process.stderr.closed)
        self.assertFalse(self.adapter._POISONED)
        self.assertFalse(self.adapter._ACTIVE.locked())

    def fault(self, body):
        def spawn(directory):
            self.directories.append(directory)
            process = subprocess.Popen([sys.executable, '-I', '-B', '-c', body], stdin=subprocess.DEVNULL,
                stdout=subprocess.PIPE, stderr=subprocess.PIPE, cwd=directory, start_new_session=True)
            self.children.append(process)
            return process
        self.stack.enter_context(mock.patch.object(self.adapter, '_spawn', spawn))

    def test_real_cli_and_adapter_exact_155_bytes(self):
        text = FIXTURE.read_text()
        direct = subprocess.run([sys.executable, '-I', '-B', str(TOOLKIT / 'rock_star_tools.py'),
                                 'citations', '--input', str(FIXTURE)], capture_output=True, check=True, timeout=3)
        actual = self.adapter.run_citations(text).encode()
        self.assertEqual(actual, direct.stdout)
        self.assertEqual(len(actual), 155)
        self.assertEqual(hashlib.sha256(actual).hexdigest(), '30dafde5d3c32d7c690276656f8d5ed0ff924b2c9b5617ede86820efc0b1a0f6')
        self.assertNotEqual(self.children[0].pid, os.getpid())
        self.assert_clean()

    def test_real_source_code_protection_and_markdown_cases(self):
        cases = ['Plain [link](https://example.test/ordinary)\n',
                 '```md\n（出典: [code](https://example.test/code)）\n```\n',
                 '`（出典: [inline](https://example.test/code)）`\n',
                 '本文（出典: no link）\n',
                 '本文（出典: [source](https://example.test/a)）\n（出典: [source](https://example.test/a)）\n',
                 '日本語\r\n（出典: [出典](https://example.test/a)）\r\n']
        with tempfile.TemporaryDirectory() as directory:
            for text in cases:
                path = Path(directory) / 'input.md'; path.write_bytes(text.encode())
                direct = subprocess.run([sys.executable, '-I', '-B', str(TOOLKIT / 'rock_star_tools.py'),
                                         'citations', '--input', str(path)], capture_output=True, check=True, timeout=3)
                self.assertEqual(self.adapter.run_citations(text).encode(), direct.stdout)
        self.assert_clean()

    def test_exact_utf8_byte_boundary_and_invalid_input_never_spawn(self):
        text = 'あ' * 21844 + 'abc\n'
        self.assertEqual(len(text.encode()), 65536)
        self.adapter.run_citations(text)
        count = len(self.children)
        for bad in ('', text + 'x', '\ud800', None, b'bytes', {'text': 'x', 'command': 'shell'}):
            with self.assertRaises(self.adapter.CitationsError):
                self.adapter.run_citations(bad)
        self.assertEqual(len(self.children), count)
        self.assert_clean()

    def test_fixed_source_hash_symlink_and_hardlink_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            directory = Path(folder); (directory / 'vendor/mr').mkdir(parents=True)
            files = self.adapter._sources()
            for name, data in files.items():
                (directory / name).write_bytes(data)
                (directory / name).chmod(0o600)
            with mock.patch.object(self.adapter, 'ROOT', directory), mock.patch.object(self.adapter, 'VENDOR', directory / 'vendor/mr'):
                path = directory / 'vendor/mr/citation-strip.py'
                path.write_bytes(path.read_bytes() + b'\n# changed')
                with self.assertRaisesRegex(self.adapter.CitationsError, 'hash mismatch'):
                    self.adapter.run_citations('x')
                path.unlink(); path.symlink_to(TOOLKIT.parents[1] / 'vendor/mr/citation-strip.py')
                with self.assertRaises(self.adapter.CitationsError):
                    self.adapter.run_citations('x')
                path.unlink(); path.write_bytes(files['vendor/mr/citation-strip.py'])
                os.link(path, directory / 'linked')
                with self.assertRaises(self.adapter.CitationsError):
                    self.adapter.run_citations('x')
        self.assertEqual(self.children, [])
        self.assert_clean()

    def test_checked_bytes_are_staged_even_if_source_changes_after_read(self):
        original = self.adapter._sources
        files = original()
        with mock.patch.object(self.adapter, '_sources', return_value=files), mock.patch.object(self.adapter, '_read_source', side_effect=AssertionError('second read')):
            self.assertEqual(len(self.adapter.run_citations(FIXTURE.read_text()).encode()), 155)
        self.assert_clean()

    def test_oversized_output_and_diagnostics_fail_without_leaking_them(self):
        for body in ("import os; os.write(1,b'PRIVATE'+b'x'*65536)",
                     "import os; os.write(2,b'PRIVATE'+b'x'*8192)"):
            with self.subTest(body=body):
                self.fault(body)
                with self.assertRaises(self.adapter.CitationsError) as raised:
                    self.adapter.run_citations('private input')
                self.assertNotIn('PRIVATE', str(raised.exception))
                self.assert_clean()

    def test_invalid_utf8_and_nonzero_exit_are_safe_failures(self):
        for body in ("import os; os.write(1,b'\\xff')", "import sys; print('PRIVATE',file=sys.stderr); sys.exit(8)"):
            self.fault(body)
            with self.assertRaises(self.adapter.CitationsError) as raised:
                self.adapter.run_citations('private input')
            self.assertNotIn('PRIVATE', str(raised.exception))
            self.assert_clean()

    def test_real_three_second_deadline_kills_and_reaps_child(self):
        self.fault('import time; time.sleep(30)')
        started = time.monotonic()
        with self.assertRaisesRegex(self.adapter.CitationsError, 'time limit'):
            self.adapter.run_citations('x')
        self.assertLess(time.monotonic() - started, 6)
        self.assertEqual(self.children[0].returncode, -signal.SIGKILL)
        self.assert_clean()

    def test_exited_leader_with_pipe_holding_descendant_is_still_killed(self):
        self.fault("import subprocess,sys; subprocess.Popen([sys.executable,'-c','import time; time.sleep(30)'])")
        with self.assertRaisesRegex(self.adapter.CitationsError, 'time limit'):
            self.adapter.run_citations('x')
        self.assertEqual(self.children[0].returncode, 0)
        self.assert_clean()

    def test_deadline_rechecked_after_exit_observation(self):
        self.fault("print('completed')")
        clock = [0.0]
        original_waitid = os.waitid
        def waitid(*args):
            value = original_waitid(*args)
            if value is not None:
                clock[0] = 3.0
            return value
        with mock.patch.object(self.adapter, 'time', types.SimpleNamespace(monotonic=lambda: clock[0], sleep=time.sleep)), mock.patch.object(os, 'waitid', waitid):
            with self.assertRaisesRegex(self.adapter.CitationsError, 'time limit'):
                self.adapter.run_citations('x')
        self.assert_clean()

    def test_simultaneous_call_is_rejected_without_second_process(self):
        entered = threading.Event()
        self.fault("import time; time.sleep(.2); print('done')")
        original = self.adapter._spawn
        def spawn(directory):
            process = original(directory); entered.set(); return process
        results = []
        with mock.patch.object(self.adapter, '_spawn', spawn):
            thread = threading.Thread(target=lambda: results.append(self.adapter.run_citations('x')))
            thread.start()
            self.assertTrue(entered.wait(2))
            with self.assertRaisesRegex(self.adapter.CitationsError, 'busy'):
                self.adapter.run_citations('x')
            thread.join(5)
        self.assertEqual(results, ['done\n'])
        self.assertEqual(len(self.children), 1)
        self.assert_clean()

    def test_interruption_and_spawn_failure_clean_private_input(self):
        with mock.patch.object(self.adapter, '_collect', side_effect=KeyboardInterrupt):
            with self.assertRaises(KeyboardInterrupt):
                self.adapter.run_citations('x')
        self.assert_clean()
        def fail(directory):
            self.directories.append(directory)
            raise OSError('PRIVATE')
        with mock.patch.object(self.adapter, '_spawn', fail):
            with self.assertRaises(self.adapter.CitationsError) as raised:
                self.adapter.run_citations('x')
            self.assertNotIn('PRIVATE', str(raised.exception))
        self.assert_clean()

    def test_missing_waitid_is_rejected_before_spawn(self):
        with mock.patch.object(self.adapter, 'os', types.SimpleNamespace(WNOWAIT=1)):
            with self.assertRaisesRegex(self.adapter.CitationsError, 'normal macOS or Linux user'):
                self.adapter.run_citations('x')
        self.assertEqual(self.children, [])

    def test_actual_mcp_startup_exact_output_and_process_observer(self):
        with tempfile.TemporaryDirectory() as directory:
            report_path = Path(directory) / 'acceptance'
            result = subprocess.run([sys.executable, '-B', str(ROOT / 'scripts/verify-pc-citations.py'),
                                     '--output', str(report_path)], capture_output=True, timeout=15)
            self.assertEqual(result.returncode, 0, result.stderr.decode())
            report = json.loads((report_path / 'report.json').read_text())
            self.assertEqual(report['status'], 'PASS')
            self.assertTrue(report['exact_bytes_equal'] and report['source_unchanged'])
            self.assertEqual(report['output_bytes'], 155)

    def test_actual_mcp_invalid_request_survives_without_echoing_private_input(self):
        requests = [{'jsonrpc': '2.0', 'id': n, 'method': 'tools/call', 'params': {
            'name': 'format_citations', 'arguments': arguments}}
            for n, arguments in enumerate([{'text': 'PRIVATE' + 'あ' * 21846}, {'text': '\ud800'},
              {'text': 'PRIVATE', 'command': 'shell'}], 1)]
        requests.append({'jsonrpc': '2.0', 'id': 4, 'method': 'ping'})
        result = subprocess.run([sys.executable, '-B', str(TOOLKIT / 'mcp_server.py')],
            input=''.join(json.dumps(r) + '\n' for r in requests).encode(), capture_output=True, timeout=5)
        self.assertEqual(result.returncode, 0)
        self.assertEqual(result.stderr, b'')
        self.assertNotIn(b'PRIVATE', result.stdout)
        replies = [json.loads(line) for line in result.stdout.splitlines()]
        self.assertEqual([r['result']['isError'] for r in replies[:3]], [True] * 3)
        self.assertEqual(replies[3]['result'], {})

    def test_actual_mcp_graceful_term_reaps_fault_child_and_removes_input(self):
        process = subprocess.Popen([sys.executable, '-B', str(ROOT / 'tests/mr_pc_probe.py'),
            'term-fixture', str(TOOLKIT)], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        request = {'jsonrpc': '2.0', 'id': 1, 'method': 'tools/call',
                   'params': {'name': 'format_citations', 'arguments': {'text': 'synthetic interruption'}}}
        try:
            process.stdin.write((json.dumps(request) + '\n').encode()); process.stdin.flush()
            with selectors.DefaultSelector() as selector:
                selector.register(process.stderr, selectors.EVENT_READ)
                self.assertTrue(selector.select(5), 'MCP did not start the fault child')
            first = json.loads(process.stderr.readline())
            self.assertEqual(first['event'], 'child_started')
            self.assertTrue(first['synthetic_fault'])
            process.terminate()
            output, diagnostics = process.communicate(timeout=7)
            self.assertEqual(process.returncode, 0)
            self.assertEqual(output, b'')
            last = json.loads(diagnostics)
            self.assertEqual(last['event'], 'child_finished')
            self.assertEqual(last['pid'], first['pid'])
            self.assertEqual(last['exit_code'], -signal.SIGKILL)
            self.assertTrue(last['temporary_removed'] and last['pipes_closed'])
            self.assertFalse(last['poisoned'])
        finally:
            if process.poll() is None:
                process.terminate(); process.communicate(timeout=7)
            for stream in (process.stdin, process.stdout, process.stderr):
                stream.close()

    def test_signal_after_child_creation_waits_for_owned_handle_then_cleans(self):
        for number in (signal.SIGINT, signal.SIGTERM):
            with self.subTest(signal=number):
                original_spawn = self.adapter._spawn
                prior_handler = signal.getsignal(number)
                def interrupt(*_):
                    raise KeyboardInterrupt
                def spawn(directory):
                    process = original_spawn(directory)
                    os.kill(os.getpid(), number)
                    return process
                signal.signal(number, interrupt)
                try:
                    with mock.patch.object(self.adapter, '_spawn', spawn):
                        with self.assertRaises(KeyboardInterrupt):
                            self.adapter.run_citations('synthetic spawn interruption')
                    self.assert_clean()
                finally:
                    signal.signal(number, prior_handler)
                    # A regression must not leave this explicitly owned test child.
                    for process in self.children:
                        if process.returncode is None:
                            self.adapter._cleanup_process(process)

    def test_worker_restores_signals_and_sets_real_resource_limits(self):
        # Explicit mechanism probe stops at execve; other tests execute the real CLI.
        worker = TOOLKIT / 'pc_citations_worker.py'
        body = """import json, os, resource, runpy, signal, sys
signal.pthread_sigmask(signal.SIG_BLOCK, {signal.SIGINT, signal.SIGTERM})
def observe(executable, argv, environment):
    print(json.dumps({'executable': executable, 'argv': argv, 'environment': environment,
      'masked': list(signal.pthread_sigmask(signal.SIG_BLOCK, set())),
      'limits': [list(resource.getrlimit(kind)) for kind in
       (resource.RLIMIT_CPU, resource.RLIMIT_CORE, resource.RLIMIT_FSIZE, resource.RLIMIT_NOFILE)]}))
os.execve = observe
sys.argv = [sys.argv[1]]
runpy.run_path(sys.argv[0], run_name='__main__')
"""
        result = subprocess.run([sys.executable, '-I', '-B', '-c', body, str(worker)],
                                capture_output=True, timeout=3)
        self.assertEqual(result.returncode, 0, result.stderr)
        proof = json.loads(result.stdout)
        self.assertEqual(proof['limits'], [[2, 2], [0, 0], [1048576, 1048576], [64, 64]])
        self.assertFalse(set(proof['masked']) & {signal.SIGINT, signal.SIGTERM})
        self.assertEqual(proof['argv'], [proof['executable'], '-I', '-B',
            str(TOOLKIT / 'rock_star_tools.py'), 'citations', '--input', str(TOOLKIT / 'input.md')])
        self.assertEqual(proof['environment'], {'PATH': '/usr/bin:/bin', 'LANG': 'C.UTF-8', 'HOME': str(TOOLKIT)})

    def test_cleanup_failure_poison_blocks_new_execution(self):
        original = self.adapter._cleanup_process
        def fail_after_reaping(process):
            original(process)
            raise OSError('injected cleanup uncertainty')
        with mock.patch.object(self.adapter, '_cleanup_process', fail_after_reaping):
            with self.assertRaisesRegex(self.adapter.CitationsError, 'cleanup failed'):
                self.adapter.run_citations('x')
        self.assertTrue(self.adapter._POISONED)
        self.assertTrue(self.adapter._ACTIVE.locked())
        self.assertTrue(all(not path.exists() for path in self.directories))
        count = len(self.children)
        with self.assertRaisesRegex(self.adapter.CitationsError, 'busy'):
            self.adapter.run_citations('x')
        self.assertEqual(len(self.children), count)


if __name__ == '__main__':
    if sys.platform not in ('darwin', 'linux') or os.geteuid() == 0:
        raise SystemExit('Run as a normal macOS/Linux user; root/unsupported skips are not PASS.')
    unittest.main()

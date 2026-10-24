"""Private bounded evidence, independent from job success and real model inference."""
import concurrent.futures
import fcntl
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import signal
import socket
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('diagnostic_worker', Path(__file__).resolve().parents[1] / 'toolkits/sky-linux-local/worker.py')
w = importlib.util.module_from_spec(spec)
spec.loader.exec_module(w)
KEY = '12345678-1234-1234-1234-123456789abc'
PRIVATE = 'SYNTHETIC-private-body-do-not-store-in-diagnostics'


class DiagnosticsTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='pwd-', dir='/tmp')
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.addCleanup(patch.stopall)
        patch.object(w, 'ROOT', self.root).start()
        model = b'fixture only, no inference'
        (self.root / 'model.gguf').write_bytes(model)
        self.descriptor = {'id': 'fixture', 'bytes': len(model), 'sha256': hashlib.sha256(model).hexdigest()}
        (self.root / 'runtime-lock.json').write_text(json.dumps({'directory': 'fixture', 'model': self.descriptor}))
        self.binary = self.root / 'runtime/fixture/llama-completion'
        self.binary.parent.mkdir(parents=True)
        self.binary.write_bytes(b'fixture')
        self.pin()

    def pin(self):
        (self.root / 'runtime-files.json').write_text(json.dumps({'llama-completion': w.digest(self.binary)}))

    def data(self, **values):
        return {'jobId': KEY, 'input': PRIVATE, 'instructions': PRIVATE,
                'modelSha256': self.descriptor['sha256'], 'maxOutputTokens': 16,
                'deadline': int(time.time() * 1000 + 10000), **values}

    def path(self):
        return self.root / 'jobs' / KEY

    def read(self):
        return json.loads((self.path() / 'diagnostics.json').read_text())

    def child(self, action=None, returncode=0):
        class Child:
            pid = 999999999

            def __init__(child, args, **kw):
                child.returncode = None
                child.kw = kw

            def wait(child, timeout=None):
                if action:
                    action(child, timeout)
                child.returncode = returncode
        return Child

    def assert_private(self):
        path = self.path() / 'diagnostics.json'
        raw = path.read_bytes()
        self.assertNotIn(PRIVATE.encode(), raw)
        self.assertLessEqual(len(raw), w.DIAGNOSTIC_LIMIT)
        self.assertEqual(path.stat().st_mode & 0o777, 0o600)
        self.assertEqual((self.path() / 'diagnostics.lock').stat().st_mode & 0o777, 0o600)
        self.assertFalse(list(self.path().glob('.diagnostics-*')))

    def test_real_fixture_stdout_exit_cpu_and_input_hash_without_authority(self):
        self.binary.write_text('#!' + sys.executable + '\nimport sys,time\ntime.sleep(.3)\nprint(' + repr(PRIVATE) + ',flush=True)\ntime.sleep(.3)\n')
        self.binary.chmod(0o700)
        self.pin()
        # Host fixture only. Real Linux parent-death behavior has a separate test.
        with patch.object(w, 'prepare_child', side_effect=lambda cpu, parent: w.limits(cpu)):
            result = w.run(self.data())
        self.assertEqual(result['text'], PRIVATE)
        d = self.read()
        self.assertEqual(d['run']['exitKind'], 'normal_exit')
        self.assertEqual(d['run']['returnCode'], 0)
        self.assertTrue(d['run']['actualChildCpu']['available'])
        self.assertGreater(d['run']['actualChildCpu']['userSeconds'] + d['run']['actualChildCpu']['systemSeconds'], 0)
        self.assertEqual(d['run']['input']['sha256'], hashlib.sha256(PRIVATE.encode()).hexdigest())
        self.assertEqual(d['output']['sha256'], hashlib.sha256((PRIVATE + '\n').encode()).hexdigest())
        self.assertTrue(d['output']['complete'])
        self.assertGreater(d['output']['firstObservedMonotonicNs'], d['output']['previousEmptyObservationMonotonicNs'])
        self.assertIsNone(d['output']['generatedTokens'])
        self.assertEqual(d['run']['effectiveLimits']['tokens'], 16)
        self.assertLessEqual(d['run']['effectiveLimits']['cpu_seconds'], 10)
        self.assertNotIn('text', d)
        self.assertFalse((self.path() / 'prompt.txt').exists())
        self.assert_private()

    def test_nonzero_and_sigxcpu_are_observations_not_proven_cpu_exhaustion(self):
        for rc in [3, -signal.SIGXCPU, -signal.SIGKILL]:
            with self.subTest(rc=rc), tempfile.TemporaryDirectory() as folder, patch.object(w, 'ROOT', Path(folder)):
                # Keep pins at the fixture root; only jobs use this subdirectory.
                with patch.object(w, 'selected_model', return_value=(self.descriptor, self.root / 'model.gguf', {'directory': 'fixture'})):
                    (Path(folder) / 'runtime').symlink_to(self.root / 'runtime', target_is_directory=True)
                    (Path(folder) / 'runtime-files.json').write_bytes((self.root / 'runtime-files.json').read_bytes())
                    with patch.object(w.subprocess, 'Popen', self.child(returncode=rc)):
                        with self.assertRaises(ValueError):
                            w.run(self.data())
                    d = json.loads((Path(folder) / 'jobs' / KEY / 'diagnostics.json').read_text())
                    self.assertEqual(d['run']['returnCode'], rc)
                    self.assertEqual(d['run']['cpuSignalObserved'], rc == -signal.SIGXCPU)
                    self.assertIsNone(d['run']['cpuLimitReached'])
                    self.assertFalse(d['run']['deadlineKillRequested'])

    def test_deadline_intervention_and_observed_signal_remain_separate(self):
        class Child(self.child()):
            def wait(child, timeout=None):
                if child.returncode is None:
                    child.returncode = -signal.SIGKILL
                    raise subprocess.TimeoutExpired('fixed executable', timeout)
        with patch.object(w.subprocess, 'Popen', Child), patch.object(w.os, 'killpg') as kill:
            with self.assertRaises(ValueError):
                w.run(self.data())
        kill.assert_called_once_with(999999999, signal.SIGKILL)
        d = self.read()['run']
        self.assertTrue(d['deadlineKillRequested'])
        self.assertEqual(d['signal'], signal.SIGKILL)
        self.assertIsNone(d['cpuLimitReached'])
        self.assertFalse((self.path() / 'prompt.txt').exists())

    def test_spawn_failure_has_no_exception_message_or_private_body(self):
        with patch.object(w.subprocess, 'Popen', side_effect=OSError(PRIVATE)):
            with self.assertRaises(OSError):
                w.run(self.data())
        self.assertEqual(self.read()['run']['exitKind'], 'spawn_failure')
        self.assertFalse(self.read()['run']['actualChildCpu']['available'])
        self.assertFalse((self.path() / 'prompt.txt').exists())
        self.assert_private()

    def test_cancel_deletes_output_and_retains_same_inode_metadata_after_stop(self):
        def finish(child, _):
            child.kw['stdout'].write(PRIVATE.encode())
            child.kw['stdout'].flush()
            time.sleep(.3)
            w.stop(KEY)
        with patch.object(w.subprocess, 'Popen', self.child(finish)), patch.object(w, 'identity', return_value=None):
            self.assertEqual(w.run(self.data()), {'cancelled': True})
        d = self.read()
        self.assertTrue(d['stop']['confirmed'])
        self.assertTrue(d['run']['cancelMarkerObserved'])
        self.assertFalse(d['stop']['outputAtStop']['available'])
        self.assertEqual(d['output']['sha256'], hashlib.sha256(PRIVATE.encode()).hexdigest())
        self.assertFalse((self.path() / 'output.txt').exists())
        self.assertFalse((self.path() / 'prompt.txt').exists())
        original = (self.path() / 'diagnostics.json').read_bytes()
        with patch.object(w.subprocess, 'Popen', side_effect=AssertionError('Never replay')):
            self.assertEqual(w.run(self.data()), {'cancelled': True})
        self.assertEqual(original, (self.path() / 'diagnostics.json').read_bytes())
        w.stop(KEY)
        self.assertEqual(self.read()['stop']['outputAtStop'], d['stop']['outputAtStop'])
        self.assert_private()

    def test_stop_before_spawn_records_no_spawn_and_prevents_execution(self):
        self.assertTrue(w.stop(KEY)['confirmed'])
        with patch.object(w.subprocess, 'Popen', side_effect=AssertionError('Never spawn')):
            self.assertEqual(w.run(self.data()), {'cancelled': True})
        d = self.read()
        self.assertIn('cancelBeforeSpawnObservedMonotonicNs', d['run'])
        self.assertNotIn('spawnObservedMonotonicNs', d['run'])

    def test_concurrent_stop_and_worker_merge_atomic_bounded_private_records(self):
        path = w.job_dir(KEY)
        barrier = threading.Barrier(2)
        def writer():
            barrier.wait()
            for i in range(12):
                # Contention may omit evidence; it cannot wait or clobber a writer.
                w.diagnostic(path, 'run', {'returnCode': 0, 'sample': i})
        def stopper():
            barrier.wait()
            for _ in range(12):
                w.stop(KEY)
        with concurrent.futures.ThreadPoolExecutor(2) as pool:
            a = pool.submit(writer)
            b = pool.submit(stopper)
            while not a.done() or not b.done():
                target = path / 'diagnostics.json'
                if target.exists():
                    self.assertEqual(json.loads(target.read_text())['jobId'], KEY)
                time.sleep(.001)
            a.result()
            b.result()
        self.assertTrue(w.diagnostic(path, 'run', {'returnCode': 0}))
        w.stop(KEY)
        self.assertEqual(self.read()['run']['returnCode'], 0)
        self.assertTrue(self.read()['stop']['confirmed'])
        self.assert_private()

    def test_oversize_symlink_corruption_unavailable_diagnostics_do_not_break_stop(self):
        path = w.job_dir(KEY)
        self.assertFalse(w.diagnostic(path, 'run', {'oversize': 'x' * w.DIAGNOSTIC_LIMIT}))
        target = path / 'diagnostics.json'
        outside = self.root / 'outside'
        outside.write_text('untouched')
        target.symlink_to(outside)
        self.assertFalse(w.diagnostic(path, 'run', {'sample': 1}))
        self.assertTrue(w.stop(KEY)['confirmed'])
        self.assertEqual(outside.read_text(), 'untouched')
        target.unlink()
        target.write_text('{corrupt')
        target.chmod(0o600)
        self.assertTrue(w.stop(KEY)['confirmed'])
        self.assertEqual(target.read_text(), '{corrupt')
        self.assertFalse(list(path.glob('.diagnostics-*')))
        target.write_text('[]')
        self.assertTrue(w.stop(KEY)['confirmed'])
        self.assertEqual(target.read_text(), '[]')

    def test_missing_cpu_measurement_and_sigkill_do_not_invent_resource_cause(self):
        self.assertEqual(w.cpu_delta(None, (1, 2)), {'available': False})
        self.assertEqual(w.cpu_delta((2, 1), (1, 1)), {'available': False})
        self.assertEqual(w.cpu_delta((0, 0), (float('nan'), 0)), {'available': False})
        observed = w.cpu_delta((1, 2, 1000), (3, 5, 700))
        self.assertEqual(observed['userSeconds'], 2)
        self.assertEqual(observed['systemSeconds'], 3)
        self.assertEqual(observed['maximumResidentSetSize']['raw'], 700)
        self.assertIn('not a delta', observed['maximumResidentSetSize']['scope'])

    def test_pressure_whitelist_and_missing_or_reset_cgroup_remain_unknown(self):
        fixtures = {'/proc/meminfo': 'MemAvailable: 123 kB\nSecret: PRIVATE\n',
                    '/proc/self/cgroup': '0::/fixture\n',
                    '/sys/fs/cgroup/fixture/memory.events': 'oom 2\noom_kill 1\noom_group_kill 0\nsecret PRIVATE\n'}
        with patch.object(w, 'small_text', side_effect=lambda p, limit=8192: fixtures.get(str(p))):
            start = w.pressure_snapshot()
        self.assertEqual(start['memAvailableKiB'], 123)
        self.assertEqual(start['cgroupOomCounters'], {'oom': 2, 'oom_kill': 1, 'oom_group_kill': 0})
        self.assertNotIn('PRIVATE', json.dumps(start))
        end = {**start, 'cgroupOomCounters': {'oom': 4, 'oom_kill': 2, 'oom_group_kill': 0}}
        self.assertEqual(w.oom_delta(start, end), {'oom': 2, 'oom_kill': 1, 'oom_group_kill': 0})
        self.assertIsNone(w.oom_delta(end, start))
        self.assertIsNone(w.oom_delta(start, {**end, 'cgroupScopeSha256': 'different'}))
        with patch.object(w, 'small_text', return_value=None):
            missing = w.pressure_snapshot()
        self.assertIsNone(missing['memAvailableKiB'])
        self.assertIsNone(w.oom_delta(start, missing))

    def test_pressure_cgroup_escape_and_oversized_source_are_not_read(self):
        with patch.object(w, 'small_text', side_effect=[None, '0::/../outside\n']) as read:
            self.assertIsNone(w.pressure_snapshot()['cgroupOomCounters'])
        self.assertEqual(read.call_count, 2)
        path = self.root / 'oversized'
        path.write_bytes(b'x' * 10)
        self.assertIsNone(w.small_text(path, 9))

    def test_repeat_stop_preserves_actual_signal_attempt_and_prior_metadata(self):
        path = w.job_dir(KEY)
        w.save(path / 'process.json', {'pid': 999999999, 'start': 'fixture', 'boot': 'fixture'})
        with patch.object(w, 'alive', side_effect=[True, False, False, False]), patch.object(w.os, 'killpg') as kill:
            self.assertTrue(w.stop(KEY)['confirmed'])
        kill.assert_called_once_with(999999999, signal.SIGTERM)
        self.assertTrue(self.read()['stop']['termSent'])
        with patch.object(w, 'alive', return_value=False):
            w.stop(KEY)
        self.assertTrue(self.read()['stop']['termSent'])
        self.assertFalse(self.read()['stop']['killSent'])

    def test_unreaped_worker_history_stays_unknown_after_confirmed_stop(self):
        path = w.job_dir(KEY)
        w.diagnostic(path, 'run', {'terminalObserved': False, 'spawnObservedMonotonicNs': 1})
        w.stop(KEY)
        d = self.read()
        self.assertFalse(d['run']['terminalObserved'])
        self.assertNotIn('returnCode', d['run'])
        self.assertTrue(d['stop']['confirmed'])
        self.assertIsNone(d['stop']['exitCode'])

    def test_observer_reads_no_more_than_existing_fsize_bound(self):
        path = w.job_dir(KEY)
        (path / 'output.txt').write_bytes(b'x' * (w.OUTPUT_LIMIT + 1))
        (path / 'output.txt').chmod(0o600)
        with self.assertRaises(OSError):
            w.OutputObservation(path)
        self.assertFalse((path / 'diagnostics.json').exists())

    def test_legacy_stop_without_diagnostics_keeps_original_receipt_shape(self):
        self.assertEqual(w.stop(KEY), {'confirmed': True})
        stop = json.loads((self.path() / 'stop.json').read_text())
        self.assertEqual(set(stop), {'confirmed', 'at'})

    def test_real_sigxcpu_does_not_claim_measured_cpu_limit_exhaustion(self):
        self.binary.write_text('#!' + sys.executable + '\nimport os,signal\nos.kill(os.getpid(),signal.SIGXCPU)\n')
        self.binary.chmod(0o700)
        self.pin()
        with patch.object(w, 'prepare_child', side_effect=lambda cpu, parent: w.limits(cpu)):
            with self.assertRaises(ValueError):
                w.run(self.data())
        d = self.read()['run']
        self.assertEqual(d['signal'], signal.SIGXCPU)
        self.assertTrue(d['cpuSignalObserved'])
        self.assertIsNone(d['cpuLimitReached'])
        self.assertTrue(d['actualChildCpu']['available'])
        self.assertLess(d['actualChildCpu']['userSeconds'] + d['actualChildCpu']['systemSeconds'], 5)

    def test_unconfirmed_stop_does_not_delete_or_claim_final_output(self):
        path = w.job_dir(KEY)
        w.save(path / 'process.json', {'pid': 999999999, 'start': 'fixture', 'boot': 'fixture'})
        (path / 'output.txt').write_bytes(PRIVATE.encode())
        with patch.object(w, 'alive', return_value=True), patch.object(w.os, 'killpg'), patch.object(w.time, 'sleep'), patch.object(w.time, 'monotonic', side_effect=range(20)):
            self.assertFalse(w.stop(KEY)['confirmed'])
        self.assertTrue((path / 'output.txt').exists())
        self.assertFalse(self.read()['stop']['confirmed'])
        self.assertFalse(self.read()['stop']['outputAtStop']['available'])

    def test_duplicate_started_job_does_not_replace_accepted_evidence(self):
        def output(child, _):
            child.kw['stdout'].write(b'fixture output')
            child.kw['stdout'].flush()
        with patch.object(w.subprocess, 'Popen', self.child(output)):
            w.run(self.data())
        original = (self.path() / 'diagnostics.json').read_bytes()
        with patch.object(w.subprocess, 'Popen', side_effect=AssertionError('Never replay')):
            with self.assertRaises(ValueError):
                w.run(self.data())
        self.assertEqual(original, (self.path() / 'diagnostics.json').read_bytes())

    def test_diagnostic_storage_failure_does_not_promote_or_break_job_outcome(self):
        def output(child, _):
            child.kw['stdout'].write(b'fixture output')
            child.kw['stdout'].flush()
        with patch.object(w.subprocess, 'Popen', self.child(output)), patch.object(w, 'diagnostic', return_value=False):
            self.assertEqual(w.run(self.data())['text'], 'fixture output')
        self.assertFalse((self.path() / 'diagnostics.json').exists())

    def test_normal_exit_diagnostic_does_not_accept_empty_result_or_success(self):
        with patch.object(w.subprocess, 'Popen', self.child()):
            with self.assertRaises(ValueError):
                w.run(self.data())
        d = self.read()
        self.assertEqual(d['run']['exitKind'], 'normal_exit')
        self.assertTrue(d['evidenceOnly'])
        self.assertEqual(d['output']['bytes'], 0)
        self.assertIsNone(d['output']['firstObservedMonotonicNs'])
        self.assertIsNone(d['output']['generatedTokens'])
        self.assertNotIn('jobSuccess', d)
        self.assertNotIn('toolSuccess', d)

    def test_immediate_output_has_no_invented_prior_empty_observation(self):
        def output(child, _):
            child.kw['stdout'].write(b'fixture output')
            child.kw['stdout'].flush()
        with patch.object(w.subprocess, 'Popen', self.child(output)):
            w.run(self.data())
        d = self.read()['output']
        self.assertIsNotNone(d['firstObservedMonotonicNs'])
        self.assertIsNone(d['previousEmptyObservationMonotonicNs'])

    def stop_in_process(self, module, case, live=False):
        """Fresh process owns every fixture PID and file; no model or device."""
        path = w.job_dir(KEY)
        target = path / ('output.txt' if case == 'output_fifo' else 'diagnostics.json')
        held = None
        if case == 'held_lock':
            held = (path / 'diagnostics.lock').open('w')
            os.fchmod(held.fileno(), 0o600)
            fcntl.flock(held, fcntl.LOCK_EX)
        elif case in ('diagnostics_fifo', 'output_fifo'):
            os.mkfifo(target, 0o600)
        if live and case != 'output_fifo':
            (path / 'output.txt').write_bytes(PRIVATE.encode())
        code = '''import importlib.util,json,os,subprocess,sys,time
from pathlib import Path
s=importlib.util.spec_from_file_location('worker',sys.argv[1]);w=importlib.util.module_from_spec(s);s.loader.exec_module(w)
w.ROOT=Path(sys.argv[2]);key=sys.argv[3];p=w.ROOT/'jobs'/key;child=None
try:
 if sys.argv[4]=='live':
  child=subprocess.Popen([sys.executable,'-c','import time;time.sleep(20)'],start_new_session=True)
  receipt={'pid':child.pid,'start':'fixture-start','boot':'fixture-boot'};w.save(p/'process.json',receipt)
  # A Mac-host fixture identity only; real Linux PID/start/boot is unchanged in source.
  w.identity=lambda pid:receipt if pid==child.pid and child.poll() is None else None
 started=time.monotonic();r=w.stop(key);elapsed=time.monotonic()-started
 print(json.dumps({'result':r,'elapsed':elapsed,'childAbsent':child is None or child.poll() is not None,'outputExists':(p/'output.txt').exists(),'stop':json.loads((p/'stop.json').read_text())}))
finally:
 if child is not None and child.poll() is None:
  os.killpg(child.pid,9);child.wait()
'''
        try:
            try:
                result = subprocess.run([sys.executable, '-c', code, str(module), str(self.root), KEY,
                                         'live' if live else 'absent'], capture_output=True, text=True, timeout=3)
            except subprocess.TimeoutExpired:
                # subprocess.run reaps its own child. Also clean only that fixture's
                # detached grandchild if a future regression blocks the stop.
                record = path / 'process.json'
                if live and record.exists():
                    receipt = json.loads(record.read_text())
                    if receipt.get('boot') == 'fixture-boot':
                        try: os.killpg(receipt['pid'], signal.SIGKILL)
                        except ProcessLookupError: pass
                raise
            self.assertEqual(result.returncode, 0, result.stderr)
            value = json.loads(result.stdout)
            self.assertTrue(value['result']['confirmed'])
            self.assertTrue(value['stop']['confirmed'])
            self.assertTrue(value['childAbsent'])
            self.assertFalse(value['outputExists'])
            self.assertLess(value['elapsed'], .75)
            report = os.environ.get('PIXEL_DIAGNOSTIC_CASE_REPORT')
            if report:
                target_report = Path(report)
                rows = json.loads(target_report.read_text()) if target_report.exists() else []
                rows.append({'workerSha256': hashlib.sha256(Path(module).read_bytes()).hexdigest(),
                             'case': case, 'liveHostFixture': live, **value})
                target_report.write_text(json.dumps(rows, indent=2))
            return value
        finally:
            if held is not None:
                fcntl.flock(held, fcntl.LOCK_UN)
                held.close()
            # Never leave a FIFO or accepted receipt for another comparison.
            for name in ['diagnostics.json', 'output.txt', 'process.json', 'cancel', 'stop.json']:
                (path / name).unlink(missing_ok=True)

    def test_separate_process_lock_and_fifo_counterexamples_stop_and_kill_promptly(self):
        for case in ['held_lock', 'diagnostics_fifo', 'output_fifo']:
            for live in [False, True]:
                with self.subTest(case=case, live=live):
                    self.stop_in_process(spec.origin, case, live)

    def test_old_worker_comparison_for_all_three_independent_counterexamples(self):
        previous = os.environ.get('PIXEL_PREVIOUS_WORKER')
        if not previous:
            self.skipTest('Provide preserved prior worker artifact via PIXEL_PREVIOUS_WORKER')
        self.assertEqual(hashlib.sha256(Path(previous).read_bytes()).hexdigest(),
                         '396c2160a769966e21dd9a631f81c3a3bf90adbbf6fd005f5b8ffa181393b8a0')
        for case in ['held_lock', 'diagnostics_fifo', 'output_fifo']:
            with self.subTest(case=case):
                prior = self.stop_in_process(previous, case)
                candidate = self.stop_in_process(spec.origin, case)
                self.assertEqual(prior['result'], candidate['result'])

    def test_nonregular_diagnostic_and_observer_paths_are_rejected_without_side_effects(self):
        path = w.job_dir(KEY)
        outside = self.root / 'outside-private'
        outside.write_bytes(PRIVATE.encode())
        outside.chmod(0o600)
        for name in ['diagnostics.lock', 'diagnostics.json', 'output.txt']:
            for kind in ['fifo', 'symlink', 'directory', 'socket', 'hardlink', 'device_symlink']:
                with self.subTest(name=name, kind=kind):
                    target = path / name
                    target.unlink(missing_ok=True)
                    sock = None
                    if kind == 'fifo': os.mkfifo(target, 0o600)
                    elif kind == 'symlink': target.symlink_to(outside)
                    elif kind == 'device_symlink': target.symlink_to('/dev/null')
                    elif kind == 'directory': target.mkdir()
                    elif kind == 'hardlink': os.link(outside, target)
                    elif kind == 'socket':
                        sock = socket.socket(socket.AF_UNIX)
                        sock.bind(str(target))
                    try:
                        if name == 'output.txt':
                            with self.assertRaises(OSError): w.OutputObservation(path)
                        else:
                            self.assertFalse(w.diagnostic(path, 'run', {'terminalObserved': True}))
                        self.assertTrue(w.stop(KEY)['confirmed'])
                        self.assertEqual(outside.read_bytes(), PRIVATE.encode())
                        if name != 'output.txt': self.assertTrue(target.exists() or target.is_symlink())
                    finally:
                        if sock: sock.close()
                        if target.is_dir() and not target.is_symlink(): target.rmdir()
                        else: target.unlink(missing_ok=True)
                        (path / 'diagnostics.json').unlink(missing_ok=True)
                        (path / 'diagnostics.lock').unlink(missing_ok=True)

    def test_observer_join_is_bounded_when_optional_callback_is_suspended(self):
        path = w.job_dir(KEY)
        (path / 'output.txt').write_bytes(b'fixture output')
        (path / 'output.txt').chmod(0o600)
        entered, release = threading.Event(), threading.Event()
        original = w.diagnostic
        def suspended(*args, **kwargs):
            if threading.current_thread() is not threading.main_thread():
                entered.set()
                release.wait(2)
            return original(*args, **kwargs)
        with patch.object(w, 'diagnostic', side_effect=suspended):
            observer = w.OutputObservation(path)
            self.assertTrue(entered.wait(1))
            started = time.monotonic()
            observer.finish(True)
            self.assertLess(time.monotonic() - started, .2)
            self.assertFalse(self.read()['output']['available'])
            release.set()
            observer.thread.join(1)
            self.assertFalse(observer.thread.is_alive())

    def test_separate_process_held_diagnostic_lock_does_not_delay_spawn_or_deadline(self):
        path = w.job_dir(KEY)
        self.binary.write_text('#!' + sys.executable + '\nimport time\nprint("fixture",flush=True)\ntime.sleep(5)\n')
        self.binary.chmod(0o700)
        self.pin()
        code = '''import importlib.util,json,sys,time
from pathlib import Path
s=importlib.util.spec_from_file_location('worker',sys.argv[1]);w=importlib.util.module_from_spec(s);s.loader.exec_module(w);w.ROOT=Path(sys.argv[2])
if sys.platform!='linux':w.prepare_child=lambda cpu,parent:w.limits(cpu)
# Exact fixture receipt permits cleanup even if a future regression blocks wait.
w.identity=lambda pid:{'pid':pid,'start':'fixture-start','boot':'fixture-boot'}
d=json.loads(sys.argv[3]);d['deadline']=int(time.time()*1000+450);start=time.monotonic()
try:w.run(d)
except ValueError:pass
else:raise AssertionError('deadline must still stop fixture')
assert not (w.ROOT/'jobs'/d['jobId']/'prompt.txt').exists()
w.identity=lambda pid:None
assert w.stop(d['jobId'])['confirmed']
assert not (w.ROOT/'jobs'/d['jobId']/'output.txt').exists()
print(json.dumps({'elapsed':time.monotonic()-start,'processReceiptPresent':(w.ROOT/'jobs'/d['jobId']/'process.json').exists()}))
'''
        with (path / 'diagnostics.lock').open('w') as held:
            os.fchmod(held.fileno(), 0o600)
            fcntl.flock(held, fcntl.LOCK_EX)
            result = None
            try:
                result = subprocess.run([sys.executable, '-c', code, spec.origin, str(self.root), json.dumps(self.data())],
                                        capture_output=True, text=True, timeout=2)
                self.assertEqual(result.returncode, 0, result.stderr)
                value = json.loads(result.stdout)
                self.assertTrue(value['processReceiptPresent'])
                self.assertLess(value['elapsed'], 1.5)
                self.assertFalse((path / 'diagnostics.json').exists())
            finally:
                record = path / 'process.json'
                if (result is None or result.returncode != 0) and record.exists():
                    receipt = json.loads(record.read_text())
                    try: os.killpg(receipt['pid'], signal.SIGKILL)
                    except ProcessLookupError: pass
                fcntl.flock(held, fcntl.LOCK_UN)

    def test_observer_callback_exception_does_not_weaken_actual_deadline_kill(self):
        self.binary.write_text('#!' + sys.executable + '\nimport time\nprint("fixture",flush=True)\ntime.sleep(5)\n')
        self.binary.chmod(0o700)
        self.pin()
        original = w.diagnostic
        callback_failed = threading.Event()
        def broken(*args, **kwargs):
            if threading.current_thread() is not threading.main_thread():
                callback_failed.set()
                raise RuntimeError('fixture callback failure')
            return original(*args, **kwargs)
        with patch.object(w, 'diagnostic', side_effect=broken), patch.object(w, 'prepare_child', side_effect=lambda cpu, parent: w.limits(cpu)):
            start = time.monotonic()
            with self.assertRaises(ValueError):
                w.run(self.data(deadline=int(time.time() * 1000 + 2000)))
            self.assertLess(time.monotonic() - start, 3)
            self.assertTrue(callback_failed.is_set(), 'Exercise the callback failure before judging unavailable evidence')
        d = self.read()
        self.assertTrue(d['run']['deadlineKillRequested'])
        self.assertEqual(d['run']['signal'], signal.SIGKILL)
        self.assertFalse(d['output']['available'])


if __name__ == '__main__':
    unittest.main()

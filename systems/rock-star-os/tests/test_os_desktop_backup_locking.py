"""Concurrent process and deadline guards; no QEMU or ext4 mutation."""
import copy
from contextlib import ExitStack
import fcntl
import importlib.util
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import Mock, patch

ROOT = Path(__file__).resolve().parents[1] / 'os/desktop'
sys.path.insert(0, str(ROOT))
spec = importlib.util.spec_from_file_location('backup_locking_verifier', ROOT / 'verify-backup.py')
verify = importlib.util.module_from_spec(spec); spec.loader.exec_module(verify)


class ClosedGuardTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='rbl-', dir='/tmp'); self.addCleanup(self.temp.cleanup)
        self.state = Path(self.temp.name) / 'source'; self.state.mkdir(mode=0o700)
        self.config = {'name': 'source', 'schema': 'rock-desktop-device/2', 'network': 'none'}
        self.record = {'schema': 'rock-desktop-session/1', 'pid': 123, 'session': str(self.state / 'sessions' / ('a'*32)),
                       'identity': {'start_ticks': '900', 'command': ['qemu-system-aarch64']}, 'config': self.config}
        self.save('device.json', self.config); self.save('running.json', self.record)

    def save(self, name, value):
        path = self.state / name; path.write_text(json.dumps(value)); path.chmod(0o600)

    def test_current_replacement_record_is_rejected_even_when_old_pid_exited(self):
        changed = dict(self.record, pid=456, session=str(self.state / 'sessions' / ('b'*32)))
        self.save('running.json', changed)
        with patch.object(verify.guest, 'running', return_value=False):
            with self.assertRaisesRegex(ValueError, 'record changed'):
                verify.require_stopped_device(self.state, self.config, expected_record=self.record)

    def test_fresh_target_refuses_prior_running_record_even_if_stopped(self):
        with patch.object(verify.guest, 'running', return_value=False):
            with self.assertRaisesRegex(ValueError, 'already booted'):
                verify.require_stopped_device(self.state, self.config, fresh=True)

    def test_live_process_or_orphan_qmp_socket_rejects_before_disk_read(self):
        with patch.object(verify.guest, 'running', return_value=True):
            with self.assertRaisesRegex(ValueError, 'still running'):
                verify.require_stopped_device(self.state, self.config)
        with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as listener:
            listener.bind(str(self.state / 'qmp.sock')); listener.listen(1)
            with patch.object(verify.guest, 'running', return_value=False):
                with self.assertRaisesRegex(ValueError, 'still listening'):
                    verify.require_stopped_device(self.state, self.config)

    def test_changed_config_and_incomplete_session_identity_are_rejected(self):
        self.save('device.json', {**self.config, 'network': 'development-services'})
        with self.assertRaisesRegex(ValueError, 'configuration changed'):
            verify.require_stopped_device(self.state, self.config)
        self.save('device.json', self.config); self.save('running.json', {'pid': 123})
        with self.assertRaisesRegex(ValueError, 'session identity'):
            verify.require_stopped_device(self.state, self.config)

    def test_session_started_in_the_snapshot_to_start_gap_is_not_silently_adopted(self):
        sessions = self.state / 'sessions'; sessions.mkdir(mode=0o700)
        (sessions / ('a'*32)).mkdir(mode=0o700)
        verify.require_first_session(self.state, {**self.record, 'running': True, 'reused': False})
        (sessions / ('b'*32)).mkdir(mode=0o700)
        with self.assertRaisesRegex(ValueError, 'another session'):
            verify.require_first_session(self.state, self.record)

    def test_existing_device_lock_excludes_a_real_other_process_writer(self):
        data = self.state / 'userdata.ext4'; data.write_bytes(b'untouched synthetic disk')
        program = ('import fcntl,sys\nf=open(sys.argv[1],"r+")\n'
                   'try: fcntl.flock(f,fcntl.LOCK_EX|fcntl.LOCK_NB)\n'
                   'except BlockingIOError: sys.exit(0)\n'
                   'open(sys.argv[2],"wb").write(b"writer entered")\nsys.exit(2)\n')
        with verify.backup.locked(self.state):
            with patch.object(verify.guest, 'running', return_value=False):
                verify.require_stopped_device(self.state, self.config, expected_record=self.record)
            result = subprocess.run([sys.executable, '-c', program, str(self.state / 'lock'), str(data)], timeout=10)
            self.assertEqual(result.returncode, 0)
            self.assertEqual(data.read_bytes(), b'untouched synthetic disk')
        self.assertEqual(data.read_bytes(), b'untouched synthetic disk')

    def test_source_lock_survives_restore_failure_through_final_hashes_without_nested_copy_lock(self):
        data = self.state / 'userdata.ext4'; data.write_bytes(b'full synthetic disk bytes')
        saved_dir = self.state / 'backups' / 'unit-backup'; saved_dir.mkdir(parents=True, mode=0o700)
        body = {'schema': 'rock-desktop-backup/1', 'source_device': 'source', 'config': self.config,
                'userdata_sha256': verify.guest.digest(data), 'bytes': data.stat().st_size}
        (saved_dir / 'userdata.ext4').write_bytes(data.read_bytes())
        (saved_dir / 'backup.json').write_text(json.dumps(body)); (saved_dir / 'backup.json').chmod(0o600)
        saved = {'status': 'SAVED', 'backup': str(saved_dir), **body}
        def copy_fixture(name):
            # A second open-file flock must succeed here. If run() acquired its
            # long source lock before create_backup(), this nonblocking probe
            # fails immediately instead of hanging the test.
            with (self.state / 'lock').open('a+') as lock:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            return saved
        program = 'import fcntl,sys\nf=open(sys.argv[1],"r+")\ntry: fcntl.flock(f,fcntl.LOCK_EX|fcntl.LOCK_NB)\nexcept BlockingIOError: sys.exit(0)\nsys.exit(2)\n'
        observed = []
        original = verify.verify_disk_set
        def guarded_hashes(manifest, folder, label):
            observed.append(label)
            self.assertEqual(subprocess.run([sys.executable, '-c', program, str(self.state / 'lock')], timeout=10).returncode, 0)
            return original(manifest, folder, label)
        def interrupted_restore(*args):
            self.assertEqual(subprocess.run([sys.executable, '-c', program, str(self.state / 'lock')], timeout=10).returncode, 0)
            raise RuntimeError('fixture restore interruption')
        baseline = {'remote': {'tables': {}}, 'wallet': {'financial_summary': {}}, 'membership': {'financial_summary': {}}}
        with ExitStack() as stack:
            for obj, name, value in ((verify, 'require_execution_host', Mock()), (verify.guest, 'BASE', self.state.parent),
                    (verify.guest, 'state_path', Mock(return_value=self.state)), (verify.guest, 'status', Mock(return_value={'running': False})),
                    (verify.guest, 'running', Mock(return_value=False)), (verify.guest, 'validate_config', Mock()),
                    (verify.backup, 'create_backup', copy_fixture), (verify.backup, 'restore_backup', interrupted_restore),
                    (verify, 'verify_disk_set', guarded_hashes), (verify, 'verify_profile_layout', Mock()),
                    (verify, 'business_snapshot', Mock(return_value=(baseline, {}, [{'created_unix': 1, 'boot_id': 'fixture'}]))),
                    (verify, 'source_receipts', Mock(return_value={})), (verify.power.guest, 'validate_record', Mock()),
                    (verify.guest, 'start', Mock(side_effect=AssertionError('QEMU must never start in this fixture')))):
                stack.enter_context(patch.object(obj, name, value))
            report = verify.run('source', 'restored')
        self.assertEqual(report['status'], 'FAIL')
        self.assertIn('fixture restore interruption', report['error'])
        self.assertEqual(observed, ['source', 'backup', 'source after verification', 'backup after verification'])
        self.assertEqual(report['source_disks_before'], report['source_disks_after'])
        self.assertEqual(data.read_bytes(), b'full synthetic disk bytes')
        self.assertEqual(subprocess.run([sys.executable, '-c', program, str(self.state / 'lock')], timeout=10).returncode, 2)

    def test_saved_manifest_cannot_change_during_the_copy_to_lock_gap(self):
        path = self.state / 'backups' / 'unit-backup'; path.mkdir(mode=0o700, parents=True)
        original = {'schema': 'rock-desktop-backup/1', 'source_device': 'source', 'config': self.config,
                    'userdata_sha256': 'a'*64, 'bytes': 32}
        (path / 'backup.json').write_text(json.dumps({**original, 'bytes': 33})); (path / 'backup.json').chmod(0o600)
        with self.assertRaisesRegex(ValueError, 'metadata changed'):
            verify.verify_saved_metadata({'status': 'SAVED', 'backup': str(path), **original}, self.state)


class DeadlineTests(unittest.TestCase):
    def test_exit_first_observed_after_absolute_shutdown_deadline_is_failure(self):
        with patch.object(verify.guest, 'running', return_value=False), patch.object(verify.time, 'monotonic', return_value=221):
            with self.assertRaisesRegex(TimeoutError, 'shutdown deadline'):
                verify.wait_stopped({}, deadline=220)

    def test_slow_final_process_observation_cannot_pass_the_deadline(self):
        with patch.object(verify.guest, 'running', return_value=False), patch.object(verify.time, 'monotonic', side_effect=[219, 221]):
            with self.assertRaisesRegex(TimeoutError, 'shutdown deadline'):
                verify.wait_stopped({}, deadline=220)

    def test_shutdown_never_sends_a_force_power_command_or_restarts_timer(self):
        with patch.object(verify.guest, 'running', side_effect=[True, False]), \
             patch.object(verify.time, 'monotonic', side_effect=[200, 200, 201, 201]), patch.object(verify.time, 'sleep') as sleep:
            self.assertEqual(verify.wait_stopped({}, deadline=220), 201)
        sleep.assert_called_once_with(.3)

    def test_readiness_match_returned_late_does_not_pass(self):
        predicate = Mock(return_value=True)
        with patch.object(verify.time, 'monotonic', side_effect=[100, 100, 281]):
            with self.assertRaises(TimeoutError): verify.wait_for(predicate, 'platform readiness', {}, 180)
        predicate.assert_called_once()


if __name__ == '__main__': unittest.main()

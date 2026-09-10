"""UI boot checker tests; Linux cases use real processes, /proc and seqpacket IPC.

The adversarial Python peer tests the root checker, not framebuffer readiness.
The separate C test-health target tests the actual UI server with UID0/UID1000.
Run portable cases on non-Linux hosts by selecting StartupProtocolTests only.
"""
import array
import importlib.util
import os
from pathlib import Path
import signal
import socket
import stat
import subprocess
import sys
import tempfile
import unittest

MODULE_PATH = Path(__file__).resolve().parents[1] / 'os/update/ui_health.py'
spec = importlib.util.spec_from_file_location('rock_startup_health', MODULE_PATH)
health = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = health
spec.loader.exec_module(health)
NONCE = 'a' * 64


def packet(nonce=NONCE, pid=42, frames=1, loops=1, width=720, height=960, inputs=2):
    return f'ROCK_UI_READY/1 {nonce} {pid} {frames} {loops} {width} {height} {inputs}\n'.encode()


class StartupProtocolTests(unittest.TestCase):
    def test_required_by_default_and_explicit_headless(self):
        for raw in (b'', b'console=ttyAMA0', b'rock.ui=required quiet'):
            self.assertEqual(health.mode_from_cmdline(raw), 'required')
        self.assertEqual(health.mode_from_cmdline(b'quiet rock.ui=headless'), 'headless')

    def test_ambiguous_or_malformed_mode_rejected(self):
        for raw in (b'rock.ui', b'rock.ui=', b'rock.ui=off', b'rock.ui=headless rock.ui=required',
                    b'rock.ui=headless rock.ui=headless', b'\x00', b'\xff', b'x' * 16385):
            with self.subTest(raw=raw[:100]), self.assertRaises((ValueError, UnicodeError)):
                health.mode_from_cmdline(raw)

    def test_exact_response(self):
        self.assertEqual(health.parse_response(packet(), NONCE, 42),
                         dict(frames=1, loops=1, width=720, height=960, inputs=2))

    def test_nonce_pid_and_framing_rejected(self):
        for raw in (packet(nonce='b' * 64), packet(nonce='A' * 64), packet(pid=43),
                    packet()[:-1], packet() + b'\n', packet() + packet(),
                    b'x' * 257, packet().replace(b' 42 ', b' 042 '), packet() + b'\0'):
            with self.subTest(raw=raw[:110]), self.assertRaises(ValueError):
                health.parse_response(raw, NONCE, 42)

    def test_frame_input_and_counter_bounds(self):
        for change in (dict(frames=0), dict(loops=0), dict(frames=2**64), dict(loops=2**64),
                       dict(width=319), dict(width=4097), dict(height=319), dict(height=4097),
                       dict(inputs=0), dict(inputs=25)):
            with self.subTest(change=change), self.assertRaises(ValueError):
                health.parse_response(packet(**change), NONCE, 42)
        self.assertEqual(health.parse_response(packet(frames=2**64 - 1, loops=2**64 - 1),
                                              NONCE, 42)['frames'], 2**64 - 1)

    def test_received_rights_are_closed(self):
        read_fd, write_fd = os.pipe()
        try:
            health.close_ancillary([(socket.SOL_SOCKET, socket.SCM_RIGHTS,
                                     array.array('i', [read_fd]).tobytes())])
            with self.assertRaises(OSError):
                os.fstat(read_fd)
        finally:
            os.close(write_fd)


class StartupLinuxTests(unittest.TestCase):
    """No mocks and no skip: the normal native gate must run these on Linux."""
    def setUp(self):
        self.assertEqual(sys.platform, 'linux', 'Select StartupProtocolTests on non-Linux hosts')
        self.assertTrue(hasattr(os, 'pidfd_open'))
        self.temporary = tempfile.TemporaryDirectory(prefix='rock-ui-check-')
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.directory = self.root / 'ready'
        self.directory.mkdir(mode=0o700)
        self.endpoint = self.directory / 'ready.sock'
        self.pid_path = self.root / 'rock-ui.pid'
        # CI may run unittest with a user-owned hosted-toolcache Python. The
        # real checker deliberately rejects that executable and its parent.
        # Use an explicitly protected system interpreter for every test peer.
        self.executable = Path('/usr/bin/python3').resolve(strict=True)
        info = self.executable.lstat()
        self.assertTrue(stat.S_ISREG(info.st_mode) and info.st_uid == 0 and
                        info.st_nlink == 1 and not info.st_mode & 0o022 and
                        info.st_mode & 0o111, 'protected system Python required')
        for parent in self.executable.parents:
            info = parent.lstat()
            self.assertTrue(stat.S_ISDIR(info.st_mode) and info.st_uid == 0 and
                            not info.st_mode & 0o022,
                            'protected system Python parent required: ' + str(parent))
        self.process = None
        self.addCleanup(self.stop)

    def stop(self):
        if self.process is not None:
            if self.process.poll() is None:
                self.process.kill()
            self.process.communicate(timeout=5)
            self.process = None

    def start(self, mode='ready'):
        self.process = subprocess.Popen(
            [str(self.executable), '-I', '-B', str(Path(__file__).resolve()), '--peer',
             str(self.endpoint), mode], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        import select
        self.assertTrue(select.select([self.process.stdout], [], [], 5)[0], 'fixture startup deadline')
        self.assertEqual(self.process.stdout.readline(), 'READY\n')
        self.pid_path.write_text(str(self.process.pid) + '\n')
        self.pid_path.chmod(0o600)

    def check(self, **changes):
        values = dict(pid=self.pid_path, endpoint=self.endpoint, executable=self.executable)
        values.update(changes)
        return health.check(health.Paths(**values), root_uid=os.geteuid(),
                            peer_uid=os.geteuid(), peer_gid=os.getegid())

    def test_real_pidfd_proc_and_fresh_challenges(self):
        self.start()
        result = self.check()
        self.assertEqual(result['status'], 'READY')
        self.assertEqual(result['pid'], self.process.pid)
        self.assertEqual([s['loops'] for s in result['samples']], [1, 2])

    def test_wrong_nonce_pid_extra_truncated_and_nul_packets(self):
        for mode in ('wrong-nonce', 'wrong-pid', 'extra', 'oversized', 'short', 'nul', 'replay'):
            with self.subTest(mode=mode):
                self.start(mode)
                with self.assertRaises((ValueError, OSError)):
                    self.check()
                self.stop()
                self.endpoint.unlink(missing_ok=True)

    def test_ancillary_and_control_truncation_do_not_leak_descriptors(self):
        for mode in ('ancillary', 'ancillary-overflow', 'extra-ancillary'):
            with self.subTest(mode=mode):
                self.start(mode)
                before = len(list(Path('/proc/self/fd').iterdir()))
                with self.assertRaises(ValueError):
                    self.check()
                self.assertEqual(len(list(Path('/proc/self/fd').iterdir())), before)
                self.stop()
                self.endpoint.unlink(missing_ok=True)

    def test_frozen_or_regressing_loop_and_frame_rejected(self):
        for mode in ('fixed-loop', 'backward-frame', 'changed-size', 'no-frame', 'no-input'):
            with self.subTest(mode=mode):
                self.start(mode)
                with self.assertRaises(ValueError):
                    self.check()
                self.stop()
                self.endpoint.unlink(missing_ok=True)

    def test_stopped_process_and_open_connection_timeout(self):
        for mode in ('stopped', 'hold-open'):
            with self.subTest(mode=mode):
                self.start('ready' if mode == 'stopped' else mode)
                if mode == 'stopped':
                    os.kill(self.process.pid, signal.SIGSTOP)
                    os.waitpid(self.process.pid, os.WUNTRACED)
                import time
                before = time.monotonic()
                with self.assertRaises((ValueError, OSError)):
                    self.check()
                self.assertLess(time.monotonic() - before, 3.5)
                self.stop()
                self.endpoint.unlink(missing_ok=True)

    def test_executable_pid_and_peer_mismatch(self):
        self.start()
        with self.assertRaisesRegex(ValueError, 'UI_EXECUTABLE_MISMATCH'):
            self.check(executable=Path('/usr/bin/true'))
        # Keep executable identity valid while selecting the wrong real PID;
        # the unittest runner may use a different, unprotected interpreter.
        other = subprocess.Popen([str(self.executable), '-I', '-B', '-c',
                                  'import time; print("READY", flush=True); time.sleep(10)'],
                                 stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        try:
            import select
            self.assertTrue(select.select([other.stdout], [], [], 5)[0], 'fixture startup deadline')
            self.assertEqual(other.stdout.readline(), 'READY\n')
            self.pid_path.write_text(str(other.pid) + '\n')
            with self.assertRaisesRegex(ValueError, 'UI_PEER_MISMATCH'):
                self.check()
            with self.assertRaisesRegex(ValueError, 'UI_PROCESS_OWNER_MISMATCH'):
                health.check(health.Paths(self.pid_path, self.endpoint, self.executable),
                             root_uid=os.geteuid(), peer_uid=os.geteuid() + 1, peer_gid=os.getegid())
        finally:
            if other.poll() is None:
                other.kill()
            other.communicate(timeout=5)

    def test_pid_symlink_hardlink_mode_and_malformed_rejected(self):
        self.start()
        target = self.root / 'pid-target'
        self.pid_path.rename(target)
        self.pid_path.symlink_to(target)
        with self.assertRaises(OSError):
            self.check()
        self.pid_path.unlink()
        os.link(target, self.pid_path)
        with self.assertRaisesRegex(ValueError, 'UI_PID_FILE_INVALID'):
            self.check()
        target.unlink()
        self.pid_path.chmod(0o666)
        with self.assertRaisesRegex(ValueError, 'UI_PID_FILE_INVALID'):
            self.check()
        self.pid_path.chmod(0o600)
        self.pid_path.write_text('0\n')
        with self.assertRaisesRegex(ValueError, 'UI_PID_INVALID'):
            self.check()

    def test_endpoint_mode_symlink_and_replacement_rejected(self):
        self.start('replace-endpoint')
        with self.assertRaisesRegex(ValueError, 'UI_SOCKET_REPLACED'):
            self.check()
        self.stop()
        self.endpoint.chmod(0o666)
        with self.assertRaisesRegex(ValueError, 'UI_SOCKET_INVALID'):
            health.endpoint_identity(health.Paths(endpoint=self.endpoint), os.geteuid(), os.geteuid())
        self.endpoint.unlink()
        self.endpoint.symlink_to(self.pid_path)
        with self.assertRaisesRegex(ValueError, 'UI_SOCKET_INVALID'):
            health.endpoint_identity(health.Paths(endpoint=self.endpoint), os.geteuid(), os.geteuid())

    def test_dead_process_and_replaced_pid_record_rejected(self):
        self.start('replace-pid')
        with self.assertRaisesRegex(ValueError, 'UI_PID_FILE_CHANGED'):
            self.check()
        pid = self.process.pid
        self.stop()
        self.pid_path.write_text(str(pid) + '\n')
        with self.assertRaises(OSError):
            self.check()


def peer(endpoint, mode):
    """Adversarial server of the checker's wire protocol, with real credentials."""
    import time
    path = Path(endpoint)
    with socket.socket(socket.AF_UNIX, socket.SOCK_SEQPACKET) as listener:
        listener.bind(endpoint)
        path.chmod(0o600)
        listener.listen(4)
        print('READY', flush=True)
        first_nonce = None
        for number in (1, 2):
            with listener.accept()[0] as connection:
                request = connection.recv(256)
                nonce = request[len(health.PREFIX):-1].decode('ascii')
                first_nonce = first_nonce or nonce
                values = dict(nonce=nonce, pid=os.getpid(), loops=number)
                if mode == 'wrong-nonce': values['nonce'] = '0' * 64
                if mode == 'replay': values['nonce'] = first_nonce
                if mode == 'wrong-pid': values['pid'] += 1
                if mode == 'fixed-loop': values['loops'] = 1
                if mode == 'backward-frame': values['frames'] = 3 - number
                if mode == 'changed-size': values['width'] = 720 + number
                if mode == 'no-frame': values['frames'] = 0
                if mode == 'no-input': values['inputs'] = 0
                raw = packet(**values)
                if mode == 'oversized': raw += b'x' * 512
                if mode == 'short': raw = raw[:-1]
                if mode == 'nul': raw += b'\0'
                if mode in ('ancillary', 'ancillary-overflow'):
                    with open('/dev/null', 'rb') as source:
                        descriptors = array.array('i', [source.fileno()] * (20 if mode.endswith('overflow') else 1))
                        connection.sendmsg([raw], [(socket.SOL_SOCKET, socket.SCM_RIGHTS, descriptors)])
                else:
                    connection.send(raw)
                if mode == 'extra': connection.send(raw)
                if mode == 'extra-ancillary':
                    with open('/dev/null', 'rb') as source:
                        connection.sendmsg([b'extra'], [(socket.SOL_SOCKET, socket.SCM_RIGHTS,
                                                        array.array('i', [source.fileno()]))])
                if mode == 'replace-endpoint':
                    path.unlink()
                    with socket.socket(socket.AF_UNIX, socket.SOCK_SEQPACKET) as replacement:
                        replacement.bind(endpoint)
                        path.chmod(0o600)
                if mode == 'replace-pid':
                    pid_path = path.parent.parent / 'rock-ui.pid'
                    fresh = pid_path.with_suffix('.new')
                    fresh.write_text(str(os.getpid()) + '\n')
                    fresh.chmod(0o600)
                    fresh.replace(pid_path)
                if mode == 'hold-open': time.sleep(5)
        time.sleep(10)  # Stay live while the checker validates its final sample.


if __name__ == '__main__':
    if len(sys.argv) == 4 and sys.argv[1] == '--peer':
        peer(sys.argv[2], sys.argv[3])
    else:
        unittest.main()

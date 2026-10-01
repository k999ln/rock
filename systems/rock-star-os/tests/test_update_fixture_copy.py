"""Copy guards; the Linux-only case additionally exercises real GNU cp/debugfs."""
import importlib.util
import os
from pathlib import Path
import shutil
import stat
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

SOURCE = Path(__file__).resolve().parents[1] / 'os/update'
sys.path.insert(0, str(SOURCE))
spec = importlib.util.spec_from_file_location('update_fixture_copy', SOURCE / 'verify-qemu.py')
verifier = importlib.util.module_from_spec(spec)
spec.loader.exec_module(verifier)


def identity(path):
    info = path.lstat()
    return (info.st_dev, info.st_ino, info.st_mode, info.st_size,
            info.st_mtime_ns, info.st_ctime_ns, verifier.sha256(path))


class FixtureCopyTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='rock-update-copy-')
        self.addCleanup(self.temporary.cleanup)
        self.directory = Path(self.temporary.name)
        self.source = self.directory / 'frozen.ext4'
        self.source.write_bytes(b'original image\x00' * 1024)
        self.source.chmod(0o444)
        self.before = identity(self.source)
        self.target = self.directory / 'derived.ext4'

    def fd_copy(self, command, *, pass_fds, check, timeout):
        self.assertEqual(command[:3], ['cp', '--sparse=always', '--reflink=auto'])
        self.assertEqual(command[3:], [f'/proc/self/fd/{fd}' for fd in pass_fds])
        self.assertTrue(check)
        self.assertEqual(timeout, 120)
        self.assertEqual(stat.S_IMODE(os.fstat(pass_fds[1]).st_mode), 0o600)
        # Portable orchestration fixture, not a substitute for GNU cp below.
        with os.fdopen(os.dup(pass_fds[0]), 'rb') as source, os.fdopen(os.dup(pass_fds[1]), 'wb') as target:
            shutil.copyfileobj(source, target)
        return subprocess.CompletedProcess(command, 0)

    def test_frozen_source_yields_private_writable_distinct_copy(self):
        with patch.object(verifier.subprocess, 'run', side_effect=self.fd_copy) as copied:
            verifier.sparse_copy(self.source, self.target)
        self.assertEqual(copied.call_count, 1)
        self.assertEqual(self.target.read_bytes(), self.source.read_bytes())
        self.assertEqual(stat.S_IMODE(self.target.stat().st_mode), 0o600)
        self.assertNotEqual(self.target.stat().st_ino, self.source.stat().st_ino)
        self.assertEqual(identity(self.source), self.before)

    def test_existing_destinations_are_never_copied_or_chmodded(self):
        for kind in ('same', 'file', 'symlink', 'hardlink', 'directory'):
            with self.subTest(kind=kind):
                target = self.directory / kind
                if kind == 'same':
                    target = self.source
                elif kind == 'file':
                    target.write_bytes(b'existing evidence')
                    target.chmod(0o444)
                elif kind == 'symlink':
                    target.symlink_to(self.source)
                elif kind == 'hardlink':
                    os.link(self.source, target)
                else:
                    target.mkdir()
                before = target.lstat()
                source_before = identity(self.source)
                with patch.object(verifier.subprocess, 'run') as copied:
                    with self.assertRaises(OSError):
                        verifier.sparse_copy(self.source, target)
                    copied.assert_not_called()
                self.assertEqual(target.lstat(), before)
                self.assertEqual(identity(self.source), source_before)

    def test_source_symlink_or_directory_refused_before_destination_creation(self):
        alias = self.directory / 'alias'
        alias.symlink_to(self.source)
        for source in (alias, self.directory):
            with self.subTest(source=source), patch.object(verifier.subprocess, 'run') as copied:
                with self.assertRaises((OSError, RuntimeError)):
                    verifier.sparse_copy(source, self.target)
                copied.assert_not_called()
                self.assertFalse(self.target.exists())
        self.assertEqual(identity(self.source), self.before)

    def test_copy_failure_preserves_input_and_reports_failure(self):
        with patch.object(verifier.subprocess, 'run', side_effect=subprocess.TimeoutExpired('cp', 120)):
            with self.assertRaises(subprocess.TimeoutExpired):
                verifier.sparse_copy(self.source, self.target)
        self.assertEqual(identity(self.source), self.before)
        self.assertEqual(stat.S_IMODE(self.target.stat().st_mode), 0o600)

    def test_replaced_destination_cannot_redirect_copy_to_source(self):
        def replace(command, **kwargs):
            self.target.unlink()
            self.target.symlink_to(self.source)
            return self.fd_copy(command, **kwargs)
        with patch.object(verifier.subprocess, 'run', side_effect=replace):
            with self.assertRaisesRegex(RuntimeError, 'destination changed'):
                verifier.sparse_copy(self.source, self.target)
        self.assertTrue(self.target.is_symlink())
        self.assertEqual(identity(self.source), self.before)

    def test_ui_uses_the_guarded_copy_for_both_derived_images(self):
        source = (SOURCE / 'verify-ui-startup.py').read_text()
        self.assertIn("verify.sparse_copy(inputs['rootfs.ext4'], rootfs)", source)
        self.assertIn("verify.sparse_copy(inputs['rootfs.ext4'], a)", source)
        self.assertNotIn("['cp',", source)

    @unittest.skipUnless(sys.platform == 'linux', 'actual GNU cp/ext4 requires Linux')
    def test_real_readonly_ext4_copy_accepts_injection_without_source_change(self):
        for tool in ('cp', 'mkfs.ext4', 'debugfs', 'e2fsck'):
            self.assertIsNotNone(shutil.which(tool), 'required Linux dependency: ' + tool)
        image = self.directory / 'source.ext4'
        with image.open('xb') as stream:
            stream.truncate(16 * 1024**2)
        subprocess.run(['mkfs.ext4', '-q', '-F', str(image)], check=True, timeout=30)
        image.chmod(0o444)
        before = identity(image)
        verifier.sparse_copy(image, self.target)
        self.assertEqual(verifier.sha256(self.target), verifier.sha256(image))
        marker = self.directory / 'marker'
        marker.write_text('derived image only\n')
        result = subprocess.run(['debugfs', '-w', '-R', 'write marker /test-marker', self.target.name],
                                cwd=self.directory, check=True, capture_output=True, text=True, timeout=30)
        self.assertIn('Allocated inode', result.stdout)
        observed = subprocess.check_output(['debugfs', '-R', 'cat /test-marker', str(self.target)],
                                           stderr=subprocess.DEVNULL, text=True, timeout=30)
        self.assertEqual(observed, marker.read_text())
        for path in (image, self.target):
            subprocess.run(['e2fsck', '-f', '-n', str(path)], check=True, capture_output=True, timeout=30)
        self.assertNotEqual(verifier.sha256(self.target), before[-1])
        self.assertEqual(stat.S_IMODE(self.target.stat().st_mode), 0o600)
        self.assertEqual(identity(image), before)


if __name__ == '__main__':
    unittest.main()

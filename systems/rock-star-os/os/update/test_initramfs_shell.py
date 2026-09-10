"""Reject incomplete or host-resolved stage0 shell inputs before image signing."""
import importlib.util
from pathlib import Path, PurePosixPath
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('stage0_builder', Path(__file__).with_name('build-initramfs.py'))
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)


class TargetShellTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.target = Path(self.temp.name)
        (self.target / 'bin').mkdir()
        (self.target / 'usr/bin').mkdir(parents=True)

    def test_absolute_and_relative_links_resolve_only_inside_target(self):
        for binary, link in (('bin/dash', 'dash'), ('usr/bin/dash', '/usr/bin/dash')):
            with self.subTest(binary=binary):
                destination = self.target / binary
                destination.write_bytes(b'\x7fELF-target-fixture')
                shell = self.target / 'bin/sh'
                shell.symlink_to(link)
                self.assertEqual(builder.target_shell(self.target), PurePosixPath('/' + binary))
                shell.unlink()
                destination.unlink()

    def test_missing_dash_busybox_shell_and_non_elf_are_rejected(self):
        shell = self.target / 'bin/sh'
        for link, data in (('dash', None), ('busybox', b'\x7fELF-test'), ('dash', b'#!/bin/sh\n')):
            with self.subTest(link=link, data=data):
                shell.symlink_to(link)
                if data is not None:
                    (self.target / 'bin' / link).write_bytes(data)
                with self.assertRaisesRegex(RuntimeError, 'Dash'):
                    builder.target_shell(self.target)
                shell.unlink()
                if data is not None:
                    (self.target / 'bin' / link).unlink()

    def test_cyclic_target_links_cannot_use_a_host_shell(self):
        (self.target / 'bin/sh').symlink_to('dash')
        (self.target / 'bin/dash').symlink_to('/bin/sh')
        with self.assertRaisesRegex(RuntimeError, 'cyclic'):
            builder.target_shell(self.target)

    def test_absolute_parent_escape_is_rejected_before_any_binary_read(self):
        with tempfile.TemporaryDirectory() as outside:
            root = Path(outside)
            (root / 'dash').write_bytes(b'\x7fELF-external')
            (root / 'sh').symlink_to('dash')
            (self.target / 'bin').rmdir()
            (self.target / 'bin').symlink_to(root, target_is_directory=True)
            with patch.object(Path, 'open', side_effect=AssertionError('must not read external binaries')):
                with self.assertRaisesRegex(RuntimeError, 'outside the target'):
                    builder.target_shell(self.target)

    def test_relative_dependency_parent_escape_is_rejected(self):
        (self.target / 'usr/lib').symlink_to('../../', target_is_directory=True)
        with self.assertRaisesRegex(RuntimeError, 'outside the target'):
            builder.target_origin(self.target, PurePosixPath('/usr/lib/libc.so'))

    def test_cyclic_dependency_parent_is_rejected(self):
        (self.target / 'lib').symlink_to('lib', target_is_directory=True)
        with self.assertRaisesRegex(RuntimeError, 'parent is missing or cyclic'):
            builder.target_origin(self.target, PurePosixPath('/lib/libc.so'))

    def test_internal_relative_parent_alias_remains_inside_target(self):
        (self.target / 'bin').rmdir()
        (self.target / 'bin').symlink_to('usr/bin', target_is_directory=True)
        (self.target / 'usr/bin/dash').write_bytes(b'\x7fELF-target')
        (self.target / 'usr/bin/sh').symlink_to('dash')
        self.assertEqual(builder.target_shell(self.target), PurePosixPath('/bin/dash'))
        self.assertEqual(builder.target_origin(self.target, PurePosixPath('/bin/dash')),
                         self.target.resolve() / 'usr/bin/dash')


if __name__ == '__main__':
    unittest.main()

"""Exercise real package build commands with newer foreign build artifacts.

The tiny C programs isolate Make's timestamp decision from OS/library behavior.
They do not substitute for the actual target ELF and boot verification.
"""
from pathlib import Path
import os
import shutil
import subprocess
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
PACKAGES = {'ui': ('rock-ui',), 'core': ('rockd', 'rockctl', 'rocktest')}


class TargetBuildIsolationTests(unittest.TestCase):
    def setUp(self):
        self.make = shutil.which('make')
        self.cc = shutil.which('cc')
        self.assertIsNotNone(self.make, 'real make is required for the build regression')
        self.assertIsNotNone(self.cc, 'a C compiler is required for the build regression')
        self.temporary = tempfile.TemporaryDirectory(prefix='rock-build-isolation-')
        self.addCleanup(self.temporary.cleanup)
        self.base = Path(self.temporary.name)

    def prepare(self, package, target_code):
        directory = self.base / package
        directory.mkdir()
        products = PACKAGES[package]
        for name in products:
            source = directory / (name + '.c')
            source.write_text('int main(void) { return ROCK_BUILD_MARKER; }\n')
            built = subprocess.run([self.cc, '-DROCK_BUILD_MARKER=11', str(source),
                                    '-o', str(directory / name)], capture_output=True, timeout=20)
            self.assertEqual(built.returncode, 0, built.stderr.decode(errors='replace'))
            obj = subprocess.run([self.cc, '-DROCK_BUILD_MARKER=11', '-c', str(source),
                                  '-o', str(directory / (name + '.o'))],
                                 capture_output=True, timeout=20)
            self.assertEqual(obj.returncode, 0, obj.stderr.decode(errors='replace'))
            os.utime(source, (1000000000, 1000000000))
            os.utime(directory / (name + '.o'), (1000000010, 1000000010))
            os.utime(directory / name, (1000000020, 1000000020))
        (directory / 'Makefile').write_text(
            '.PHONY: all clean\nall: ' + ' '.join(products) + '\n'
            '%: %.o\n\t$(CC) -o $@ $<\n'
            '%.o: %.c\n\t$(CC) $(CFLAGS) -c -o $@ $<\n'
            'clean:\n\trm -f ' + ' '.join(products) + ' *.o\n')
        # This is outside the rsynced package build directory and must survive.
        sentinel = self.base / (package + '-host.o')
        sentinel.write_bytes(b'host artifact must remain unchanged')
        driver = self.base / (package + '.mk')
        macro = 'ROCK_' + package.upper() + '_BUILD_CMDS'
        package_file = ROOT / 'os/buildroot/package' / ('rock-' + package) / ('rock-' + package + '.mk')
        target = directory / '.verified'
        driver.write_text(
            f'TARGET_CONFIGURE_OPTS = CC={self.cc} CFLAGS=-DROCK_BUILD_MARKER={target_code}\n'
            f'include {package_file}\n'
            f'{target}:\n\t$({macro})\n')
        return directory, products, driver, target, sentinel

    def invoke(self, driver, target):
        return subprocess.run([self.make, '--no-print-directory', '-f', str(driver), str(target)],
                              capture_output=True, timeout=30, env=dict(os.environ, MAKEFLAGS=''))

    def test_newer_host_artifacts_are_rebuilt_with_target_configuration(self):
        for package in PACKAGES:
            with self.subTest(package=package):
                directory, products, driver, target, sentinel = self.prepare(package, 23)
                before = sentinel.read_bytes()
                self.assertTrue(all(subprocess.run([str(directory / p)], timeout=5).returncode == 11
                                    for p in products))
                result = self.invoke(driver, target)
                self.assertEqual(result.returncode, 0, result.stdout.decode() + result.stderr.decode())
                for product in products:
                    self.assertEqual(subprocess.run([str(directory / product)], timeout=5).returncode, 23)
                self.assertEqual(sentinel.read_bytes(), before)

    def test_target_compile_failure_does_not_reuse_foreign_executable(self):
        for package in PACKAGES:
            with self.subTest(package=package):
                directory, products, driver, target, sentinel = self.prepare(package, 'INVALID_SYMBOL')
                result = self.invoke(driver, target)
                self.assertNotEqual(result.returncode, 0)
                self.assertFalse(any((directory / name).exists() for name in products))
                self.assertEqual(sentinel.read_bytes(), b'host artifact must remain unchanged')

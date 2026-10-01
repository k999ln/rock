"""Source-delivery boundaries in private temporary trees; no VM or network."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tarfile
import tempfile
import unittest
from unittest.mock import patch

PROJECT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('rock_source_export_test', PROJECT / 'os/export-source.py')
exporter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(exporter)


class SourceExportTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='rock-source-export-test-')
        self.addCleanup(self.temporary.cleanup)
        self.base = Path(self.temporary.name)
        self.source = self.base / 'source'
        self.source.mkdir()
        self.output = self.base / 'output'
        for name in exporter.PUBLIC_TOOL_DIST:
            self.write(name, b'{"fixture":"public unit test only"}\n')

    def write(self, name, data):
        path = self.source / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        return path

    def snapshot(self):
        with patch.object(exporter, 'ROOT', self.source), patch.object(exporter.subprocess, 'check_output', return_value='test-git-revision\n'):
            return exporter.snapshot(self.output)

    def test_archive_roundtrip_preserves_required_source_bytes_modes_and_manifest(self):
        names = ['pyproject.toml', '.gitignore', 'src/blackberryrock/sdk.py', 'tests/test_sdk.py',
                 'os/ui/atm-ui.inc', 'os/ui/remote-ui.inc', 'os/assets/font.otf', 'os/assets/LICENSE.txt',
                 'os/buildroot/configs/test_defconfig', 'os/buildroot/patches/python3/patch.patch',
                 'os/buildroot/board/rock-virt/overlay/etc/init.d/S60rockui',
                 'examples/registry/test.rock.json', 'schemas/test.json', '.github/workflows/ci.yml']
        for name in names:
            path = self.write(name, ('public source fixture: ' + name).encode())
            if name.endswith('S60rockui'): path.chmod(0o755)
        result = self.snapshot()
        with tarfile.open(result['archive']) as archive:
            archive.extractall(self.base / 'restored', filter='data')
        restored = self.base / 'restored/rock-star-os'
        manifest = json.loads((restored / 'SOURCE-SNAPSHOT.json').read_text())
        self.assertEqual(set(manifest['file_sha256']), set(names) | exporter.PUBLIC_TOOL_DIST)
        for name, digest in manifest['file_sha256'].items():
            self.assertEqual((restored / name).read_bytes(), (self.source / name).read_bytes())
            self.assertEqual(hashlib.sha256((restored / name).read_bytes()).hexdigest(), digest)
        self.assertEqual((restored / names[10]).stat().st_mode & 0o777, 0o755)
        self.assertTrue(result['full_archive_reopened_and_verified'])

    def test_only_exact_public_dist_files_bypass_exclusions(self):
        for name in ('os/tools/dist/unreviewed.rock.json', 'os/tools/dist/private.db-wal',
                     'os/other/dist/BUILD-MANIFEST.json', 'os/tools/dist/nested/BUILD-MANIFEST.json',
                     'artifacts/os/userdata.ext4', 'os/.state/private.db', 'os/build/private.sqlite3',
                     '.git/config', 'src/__pycache__/module.pyc'):
            self.write(name, b'private unit sentinel must not be archived')
        self.assertEqual({name for name, _, _ in exporter.source_files(self.source)}, exporter.PUBLIC_TOOL_DIST)

    def test_database_sidecars_and_runtime_names_fail_before_archive_creation(self):
        names = ['state.db', 'state.sqlite', 'state.sqlite3', 'state.DB-WAL', 'state.db-shm', 'state.db-journal',
                 'state.sqlite-wal', 'state.sqlite-shm', 'state.sqlite-journal', 'state.sqlite3-wal',
                 'state.sqlite3-shm', 'state.sqlite3-journal', 'userdata.ext4', 'disk.qcow2',
                 'vnc-password', 'tunnel.json', 'running.json', 'viewer.json']
        for name in names:
            with self.subTest(name=name):
                path = self.write('os/evidence/' + name, b'private unit sentinel')
                with self.assertRaisesRegex(ValueError, 'runtime data') as error: self.snapshot()
                self.assertNotIn('private unit sentinel', str(error.exception))
                self.assertFalse(self.output.exists())
                path.unlink()

    def test_runtime_magic_is_rejected_with_an_innocent_extension(self):
        for header in (b'SQLite format 3\0', b'QFI\xfb', b'\x7fELF'):
            with self.subTest(header=header):
                path = self.write('os/evidence/innocent.json', header + b'private unit sentinel')
                with self.assertRaisesRegex(ValueError, 'runtime binary') as error: self.snapshot()
                self.assertNotIn('private unit sentinel', str(error.exception))
                self.assertFalse(self.output.exists())
                path.unlink()

    def test_public_dist_exception_does_not_bypass_magic_or_symlink_rejection(self):
        name = sorted(exporter.PUBLIC_TOOL_DIST)[0]
        path = self.write(name, b'\x7fELFprivate unit sentinel')
        with self.assertRaisesRegex(ValueError, 'runtime binary'): self.snapshot()
        outside = self.base / 'private-outside'
        outside.write_bytes(b'private unit sentinel')
        path.unlink(); path.symlink_to(outside)
        with self.assertRaisesRegex(ValueError, 'symlink'): self.snapshot()

    def test_missing_fixed_tool_artifact_is_not_silently_omitted(self):
        (self.source / sorted(exporter.PUBLIC_TOOL_DIST)[0]).unlink()
        with self.assertRaisesRegex(ValueError, 'required public Tool fixture missing'): self.snapshot()
        self.assertFalse(self.output.exists())

    def test_restored_real_sdk_fixtures_pass_check_without_regeneration(self):
        shutil.copytree(PROJECT / 'src', self.source / 'src', ignore=shutil.ignore_patterns('__pycache__', '*.pyc'))
        for name in exporter.PUBLIC_TOOL_DIST:
            shutil.copy2(PROJECT / name, self.source / name)
        for name in ('os/tools/build_development.py', 'os/tools/PROVENANCE.json'):
            shutil.copy2(PROJECT / name, self.source / name)
        shutil.copytree(PROJECT / 'os/tools/packages', self.source / 'os/tools/packages')
        shutil.copytree(PROJECT / 'examples/registry', self.source / 'examples/registry')
        result = self.snapshot()
        with tarfile.open(result['archive']) as archive:
            archive.extractall(self.base / 'restored', filter='data')
        restored = self.base / 'restored/rock-star-os'
        original = {str(p.relative_to(restored)): p.read_bytes() for p in (restored / 'os/tools/dist').iterdir()}
        run = subprocess.run([sys.executable, '-B', 'os/tools/build_development.py', '--check', '--registry', 'examples/registry'],
                             cwd=restored, env=dict(os.environ, PYTHONPATH=str(restored / 'src'), PYTHONDONTWRITEBYTECODE='1'),
                             capture_output=True, text=True, timeout=30)
        self.assertEqual(run.returncode, 0, run.stderr)
        self.assertEqual(json.loads(run.stdout)['packages'], 4)
        self.assertEqual(original, {str(p.relative_to(restored)): p.read_bytes() for p in (restored / 'os/tools/dist').iterdir()})


if __name__ == '__main__': unittest.main()

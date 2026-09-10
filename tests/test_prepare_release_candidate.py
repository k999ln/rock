"""Unsigned-producer/control-bridge fixtures; no key, image build or launch acceptance."""
import copy
import gzip
import hashlib
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tarfile
import tempfile
import time
from types import SimpleNamespace
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
sys.path.insert(0, str(ROOT / 'systems/rock-star-os/os/desktop'))
import prepare_release_candidate as bridge
import release_signing as signing
import package_preview as producer


class CandidatePreparationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.source, self.version, self.issued_at = 'b' * 40, '1.0.1-fixture', int(time.time()) - 10
        self.previous = {'schema': 'rock-previous-release/1', 'source_commit': 'a' * 40,
                         'version': '1.0.0-fixture', 'archive_sha256': 'a' * 64}
        self.previous_path = self.root / 'previous.json'
        self.previous_path.write_bytes(signing.canonical(self.previous) + b'\n')
        self.previous_pin = signing.file_record(self.previous_path)['sha256']
        self.export = self.root / 'export'
        self.export.mkdir()
        self.tree = self.root / 'tree'
        (self.tree / 'native/os/desktop').mkdir(parents=True)
        (self.tree / 'docs').mkdir()
        bootstrap = (ROOT / 'systems/rock-star-os/os/desktop/preview.py').read_bytes()
        (self.tree / 'native/os/desktop/preview.py').write_bytes(bootstrap)
        native = {'native/os/desktop/package_preview.py': Path(producer.__file__).read_bytes(),
                  'native/os/desktop/preview.py': bootstrap,
                  'native/untrusted.py': ('raise RuntimeError("archive code executed")\n').encode()}
        docs = {name: ('fixture notice: ' + name).encode() for name in bridge.DOCS}
        for name, raw in docs.items():
            (self.tree / 'docs' / name).write_bytes(raw)
        images = {'images/' + name: ('image:' + name).encode() for name in ('Image', 'rootfs.ext4', 'stage0.cpio.gz')}
        image_hashes = {name.split('/')[1]: hashlib.sha256(raw).hexdigest() for name, raw in images.items()}
        configuration = {'buildroot.config': b'CONFIG_FIXTURE=y\n'}
        self.freeze = {'schema': 'rock-build-freeze/2', 'status': 'BUILD_COMPLETE_FROZEN', 'source_commit': self.source,
                       'files_sha256': image_hashes, 'archive_commit_verified': True,
                       'source_tests': {'status': 'PASS', 'source_unchanged': True},
                       'source_files_sha256': {bridge.NATIVE + name[7:]: hashlib.sha256(raw).hexdigest() for name, raw in native.items()},
                       'configuration_sha256': {name: hashlib.sha256(raw).hexdigest() for name, raw in configuration.items()}}
        self.members = native | images | {'docs/' + name: raw for name, raw in docs.items()} | {'provenance/' + name: raw for name, raw in configuration.items()}
        self.archive_name = 'rockstaros-' + self.version + '-macos-arm64.tar.gz'
        self.manifest = {'schema': 'rockstaros-preview-release/2', 'product': 'RockstarOS 1.0 Developer Preview',
                         'version': self.version, 'source_commit': self.source, 'host_tools_commit': self.source,
                         'host': {}, 'files': {}, 'image_sha256': image_hashes, 'factory_sha256': 'f' * 64,
                         'boot': {'mode': 'signed-stage0', 'profile': 'local-development', 'factory_sha256': 'f' * 64}, 'game': None,
                         'display': {}, 'trust': 'EXTERNAL_RELEASE_KEY',
                         'legal': {'status': 'NOT_CLEARED', 'product_license': 'undecided'},
                         'acceptance': {'status': 'CANDIDATE', 'meaning': 'fixture only'}}
        self.rebuild()

    def rebuild(self):
        self.members['provenance/freeze-manifest.json'] = signing.canonical(self.freeze) + b'\n'
        archive_path = self.export / self.archive_name
        with archive_path.open('wb') as raw, gzip.GzipFile(filename='', mode='wb', fileobj=raw, mtime=0) as zipped:
            with tarfile.open(fileobj=zipped, mode='w|', format=tarfile.USTAR_FORMAT) as archive:
                for name, data in sorted(self.members.items()):
                    member = tarfile.TarInfo(name)
                    member.size, member.mode, member.mtime = len(data), 0o444, 1
                    archive.addfile(member, io.BytesIO(data))
        self.manifest['files'] = {name: {'sha256': hashlib.sha256(raw).hexdigest(), 'bytes': len(raw), 'mode': 0o444} for name, raw in self.members.items()}
        self.manifest['archive'] = {'name': self.archive_name, **signing.file_record(archive_path)}
        # Recreating a fixture export must not inventory its previous receipt.
        (self.export / bridge.EXPORT).unlink(missing_ok=True)
        with patch.object(producer, 'sign', side_effect=AssertionError('unsigned export called signer')):
            producer.export_unsigned(SimpleNamespace(output=self.export), self.manifest, self.tree)
        self.exported = signing.decode((self.export / bridge.EXPORT).read_bytes())
        self.export_pin = signing.file_record(self.export / bridge.EXPORT)['sha256']

    def repin(self):
        self.exported['assets'] = {p.name: signing.file_record(p) for p in self.export.iterdir() if p.name != bridge.EXPORT}
        (self.export / bridge.EXPORT).write_bytes(signing.canonical(self.exported) + b'\n')
        self.export_pin = signing.file_record(self.export / bridge.EXPORT)['sha256']

    def run_bridge(self, output='candidate', **overrides):
        args = dict(export_directory=self.export, export_pin=self.export_pin, previous_path=self.previous_path,
                    previous_pin=self.previous_pin, source=self.source, version=self.version, issued_at=self.issued_at,
                    output=self.root / output)
        args.update(overrides)
        return bridge.prepare(**args)

    def test_round_trip_deterministic_immutable_bytes_no_keys(self):
        first = self.run_bridge('first')
        second = self.run_bridge('second')
        self.assertEqual(first, second)
        self.assertEqual(first['status'], 'UNSIGNED_CANDIDATE_PREPARED_NOT_ACCEPTED')
        for path in (self.root / 'first').iterdir():
            self.assertEqual(path.read_bytes(), (self.root / 'second' / path.name).read_bytes())
            self.assertEqual(path.stat().st_nlink, 1)
            if (self.export / path.name).exists():
                self.assertEqual(path.read_bytes(), (self.export / path.name).read_bytes())
                self.assertNotEqual(path.stat().st_ino, (self.export / path.name).stat().st_ino)
        self.assertFalse(set(p.name for p in (self.root / 'first').iterdir()) & signing.OUTPUT_NAMES)
        signing.candidate(self.root / 'first', first['candidate_index_sha256'], self.source, int(time.time()))

    def test_real_cli_accepts_new_unsigned_fixture(self):
        result = subprocess.run([sys.executable, str(ROOT / 'scripts/prepare_release_candidate.py'),
            '--export-directory', str(self.export), '--export-sha256', self.export_pin,
            '--previous-release', str(self.previous_path), '--previous-sha256', self.previous_pin,
            '--source', self.source, '--version', self.version, '--issued-at', str(self.issued_at),
            '--output', str(self.root / 'cli')], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout)['legal_status'], 'NOT_CLEARED')

    def test_racing_empty_output_directory_is_preserved(self):
        output = self.root / 'racing'
        original_mkdir = os.mkdir
        reserved = []
        def racing_mkdir(path, *args, **kwargs):
            if Path(path) == output and not reserved:
                original_mkdir(path, *args, **kwargs)
                reserved.append(output.stat().st_ino)
            return original_mkdir(path, *args, **kwargs)
        with patch.object(bridge.os, 'mkdir', side_effect=racing_mkdir), self.assertRaises(FileExistsError):
            self.run_bridge('racing')
        self.assertEqual(output.stat().st_ino, reserved[0])
        self.assertEqual(list(output.iterdir()), [])

    def test_interrupted_publication_leaves_incomplete_directory_without_index(self):
        original_copy = bridge.copy_checked
        published = []
        def interrupted_copy(source, target, record, *, directory_fd=None):
            if directory_fd is not None and published:
                raise KeyboardInterrupt('fixture publication interruption')
            original_copy(source, target, record, directory_fd=directory_fd)
            if directory_fd is not None:
                published.append(target.name)
        with patch.object(bridge, 'copy_checked', side_effect=interrupted_copy), self.assertRaises(KeyboardInterrupt):
            self.run_bridge('interrupted')
        output = self.root / 'interrupted'
        self.assertEqual(sorted(p.name for p in output.iterdir()), published)
        self.assertFalse((output / 'candidate-index.json').exists())
        before = {p.name: p.read_bytes() for p in output.iterdir()}
        with self.assertRaisesRegex(ValueError, 'already exists'):
            self.run_bridge('interrupted')
        self.assertEqual({p.name: p.read_bytes() for p in output.iterdir()}, before)

    def test_interrupted_index_flush_removes_only_our_incomplete_index(self):
        with patch.object(bridge.os, 'fsync', side_effect=InterruptedError('fixture index interruption')), self.assertRaises(InterruptedError):
            self.run_bridge('index-interrupted')
        output = self.root / 'index-interrupted'
        self.assertEqual(set(p.name for p in output.iterdir()), set(self.exported['assets']) | {bridge.EXPORT})
        self.assertFalse((output / 'candidate-index.json').exists())

    def test_wrong_pins_new_identity_and_time_rejected(self):
        for changes in ({'export_pin': '0' * 64}, {'previous_pin': '0' * 64}, {'source': 'c' * 40},
                        {'source': 'a' * 40}, {'version': '1.0.0-fixture'}, {'version': 'other'},
                        {'issued_at': int(time.time()) + 600}, {'issued_at': 0}):
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                self.run_bridge(**changes)
        self.assertFalse((self.root / 'candidate').exists())

    def test_old_archive_hash_rejected_even_with_new_export_receipt(self):
        self.previous['archive_sha256'] = self.manifest['archive']['sha256']
        self.previous_path.write_bytes(signing.canonical(self.previous))
        self.previous_pin = signing.file_record(self.previous_path)['sha256']
        with self.assertRaisesRegex(ValueError, 'old archive'):
            self.run_bridge()

    def test_signed_and_public_test_manifests_rejected(self):
        for value in ({'manifest': self.manifest, 'signature': '00' * 64}, dict(self.manifest, trust='PUBLIC_RFC8032_DEVELOPMENT_ONLY')):
            (self.export / bridge.MANIFEST).write_bytes(signing.canonical(value))
            self.repin()
            with self.assertRaisesRegex(ValueError, 'signed/public'):
                self.run_bridge()

    def test_legal_acceptance_promotion_rejected(self):
        for field in ('legal', 'acceptance'):
            value = copy.deepcopy(self.manifest)
            value[field]['status'] = 'CLEARED'
            (self.export / bridge.MANIFEST).write_bytes(signing.canonical(value))
            self.repin()
            with self.assertRaisesRegex(ValueError, 'cannot promote'):
                self.run_bridge()

    def test_wrong_source_freeze_and_producer_hash_rejected(self):
        self.freeze['source_commit'] = 'a' * 40
        self.rebuild()
        with self.assertRaisesRegex(ValueError, 'frozen build'):
            self.run_bridge()
        self.freeze['source_commit'] = self.source
        self.rebuild()
        self.exported['producer']['sha256'] = '0' * 64
        self.repin()
        with self.assertRaisesRegex(ValueError, 'frozen producer'):
            self.run_bridge()

    def test_native_and_standalone_bytes_cannot_escape_freeze(self):
        self.members['native/untrusted.py'] = b'changed code never executed'
        self.rebuild()
        with self.assertRaisesRegex(ValueError, 'native source'):
            self.run_bridge()
        self.members['native/untrusted.py'] = b'raise RuntimeError("archive code executed")\n'
        self.rebuild()
        (self.export / 'preview.py').write_text('changed standalone bootstrap')
        self.repin()
        with self.assertRaisesRegex(ValueError, 'bootstrap'):
            self.run_bridge()

    def test_asset_tamper_extra_names_links_and_existing_output_rejected(self):
        archive = self.export / self.archive_name
        archive.write_bytes(archive.read_bytes() + b'x')
        with self.assertRaises(ValueError):
            self.run_bridge()
        self.rebuild()
        (self.export / 'release-manifest.json').write_text('old signed file')
        self.repin()
        with self.assertRaisesRegex(ValueError, 'inventory'):
            self.run_bridge()
        (self.export / 'release-manifest.json').unlink()
        self.repin()
        target = self.export / 'preview.py'
        raw = target.read_bytes()
        target.unlink()
        outside = self.root / 'outside'
        outside.write_bytes(raw)
        target.symlink_to(outside)
        with self.assertRaises(OSError):
            self.run_bridge()
        target.unlink()
        os.link(outside, target)
        with self.assertRaisesRegex(ValueError, 'unsafe'):
            self.run_bridge()
        target.unlink()
        target.write_bytes(raw)
        (self.root / 'candidate').mkdir()
        with self.assertRaisesRegex(ValueError, 'already exists'):
            self.run_bridge()

    def test_source_bound_supplements_preserved_and_collision_rejected(self):
        supplements = self.root / 'supplements'
        supplements.mkdir()
        (supplements / 'NOTICE.txt').write_bytes(b'fixture legal data; no clearance')
        inventory = {'schema': 'rock-release-candidate-supplements/1', 'source_commit': self.source,
                     'version': self.version, 'assets': {'NOTICE.txt': signing.file_record(supplements / 'NOTICE.txt')}}
        path = supplements / bridge.SUPPLEMENTS
        path.write_bytes(signing.canonical(inventory))
        result = self.run_bridge(supplements_directory=supplements, supplements_pin=signing.file_record(path)['sha256'])
        self.assertEqual((self.root / 'candidate/NOTICE.txt').read_bytes(), b'fixture legal data; no clearance')
        self.assertEqual(result['legal_status'], 'NOT_CLEARED')
        inventory['assets'] = {bridge.MANIFEST: inventory['assets']['NOTICE.txt']}
        path.write_bytes(signing.canonical(inventory))
        with self.assertRaisesRegex(ValueError, 'replace'):
            self.run_bridge('collision', supplements_directory=supplements, supplements_pin=signing.file_record(path)['sha256'])

    def test_unsigned_flag_is_exclusive_and_legacy_namespace_preserved(self):
        parser = ROOT / 'systems/rock-star-os/os/desktop/package_preview.py'
        result = subprocess.run([sys.executable, str(parser), '--repository', str(self.root), '--source', self.source,
            '--images', str(self.root), '--version', self.version, '--boot-profile', 'local-development', '--output', str(self.root / 'never'),
            '--unsigned-external', '--public-test-signature'], capture_output=True, text=True)
        self.assertEqual(result.returncode, 2)
        self.assertIn('not allowed with argument', result.stderr)
        # Existing callers lack the new flag; they still reach the existing build checks.
        for name in ('Image', 'rootfs.ext4', 'stage0.cpio.gz'):
            (self.root / name).write_bytes(b'fixture')
        with patch.object(producer.subprocess, 'check_output', return_value=self.source + '\n'):
            with self.assertRaisesRegex((FileNotFoundError, ValueError), 'freeze-manifest'):
                producer.make(SimpleNamespace(repository=self.root, source=self.source, images=self.root, output=self.root / 'legacy'))

    def test_full_unsigned_packager_path_never_signs_and_bridge_accepts(self):
        images = self.root / 'new-images'
        images.mkdir()
        for name in ('Image', 'rootfs.ext4', 'stage0.cpio.gz'):
            (images / name).write_bytes(self.members['images/' + name])
        (images / 'freeze-manifest.json').write_bytes(signing.canonical(self.freeze))
        (images / 'buildroot.config').write_bytes(self.members['provenance/buildroot.config'])
        def source_tree(repository, commit, target):
            target.mkdir()
            for name, raw in self.members.items():
                if name.startswith('native/'):
                    path = target / name[7:]
                    path.parent.mkdir(parents=True, exist_ok=True)
                    path.write_bytes(raw)
        def git_output(command, **kwargs):
            if 'rev-parse' in command:
                return self.source + '\n'
            if '--format=%ct' in command:
                return '1\n'
            return self.members['docs/' + command[-1].split(':docs/')[1]]
        factory = {'sha256': self.manifest['image_sha256']['rootfs.ext4'], 'size': (images / 'rootfs.ext4').stat().st_size}
        profile = SimpleNamespace(_stage0=lambda _: {'factory': signing.canonical(factory)},
            _update_helpers=lambda: (None, SimpleNamespace(decode=lambda raw, _: signing.decode(raw), verify_envelope=lambda x: x)))
        args = SimpleNamespace(repository=self.root, source=self.source, images=images, output=self.root / 'made',
            version=self.version, unsigned_external=True, public_test_signature=False, signing_key=None,
            boot_profile='local-development', legal_info=None)
        original_path = sys.path[:]
        self.addCleanup(lambda: sys.path.__setitem__(slice(None), original_path))
        with patch.object(producer, 'source_tree', side_effect=source_tree), patch.object(producer.subprocess, 'check_output', side_effect=git_output), \
             patch.dict(sys.modules, {'service_access': SimpleNamespace(profile=profile)}), \
             patch.object(producer, 'sign', side_effect=AssertionError('unsigned path must not sign')), \
             patch.object(producer.preview, 'verify_release', side_effect=AssertionError('unsigned path must not claim signed verification')):
            result = producer.make(args)
        self.assertEqual(result['status'], 'UNSIGNED_PACKAGE_NOT_ACCEPTED')
        result = self.run_bridge('full-made', export_directory=args.output,
            export_pin=signing.file_record(args.output / bridge.EXPORT)['sha256'])
        self.assertEqual(result['status'], 'UNSIGNED_CANDIDATE_PREPARED_NOT_ACCEPTED')


if __name__ == '__main__':
    unittest.main()

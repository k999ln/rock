"""Actual release signatures/archive guards and isolated lifecycle contracts.

VM calls in this suite are mocked; the separate fresh-VM acceptance is required.
"""
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
import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'os/desktop'))
import preview
import package_preview


class PreviewRelease(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='preview-tests-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        self.archive = self.root / 'rockstaros-1.0-test-macos-arm64.tar.gz'
        self.key = self.root / 'key.der'
        self.manifest = self.root / 'manifest.json'
        self.payloads = {'images/' + name: ('fixture-' + name).encode() for name in preview.IMAGE_NAMES}
        self.payloads['native/os/desktop/guest.py'] = b'# no execution\n'
        self.files = {}
        self.write_archive()
        self.value = {'schema': preview.SCHEMA, 'product': preview.TITLE, 'version': '1.0-test',
                      'source_commit': 'a' * 40, 'host_tools_commit': 'a' * 40,
                      'host': {'os': 'macOS', 'tested_version': '15.7.4', 'architecture': 'arm64',
                               'lima_version': '2.2.0', 'vm_type': 'vz', 'base_image': preview.BASE_IMAGE},
                      'archive': {'name': self.archive.name, 'sha256': preview.digest(self.archive), 'bytes': self.archive.stat().st_size},
                      'files': self.files, 'image_sha256': {name: self.files['images/' + name]['sha256'] for name in preview.IMAGE_NAMES},
                      'factory_sha256': 'b' * 64, 'trust': 'PUBLIC_RFC8032_DEVELOPMENT_ONLY',
                      'legal': {'status': 'NOT_CLEARED'}, 'acceptance': {'status': 'CANDIDATE'}}
        self.sign()

    def write_archive(self, *, extra=None):
        with self.archive.open('wb') as raw, gzip.GzipFile(fileobj=raw, filename='', mode='wb', mtime=0) as zipped:
            with tarfile.open(fileobj=zipped, mode='w|') as archive:
                for name, payload in sorted(self.payloads.items()):
                    entry = tarfile.TarInfo(name)
                    entry.mode, entry.size = 0o444, len(payload)
                    archive.addfile(entry, io.BytesIO(payload))
                    self.files[name] = {'mode': 0o444, 'bytes': len(payload), 'sha256': hashlib.sha256(payload).hexdigest()}
                if extra:
                    archive.addfile(extra, io.BytesIO(b'x' * extra.size) if extra.isfile() else None)

    def sign(self):
        envelope, key = package_preview.sign(self.value, development=True)
        self.key.write_bytes(key)
        self.manifest.write_bytes(preview.canonical(envelope) + b'\n')

    def verify(self, **kwargs):
        options = {'manifest_sha256': preview.digest(self.manifest), 'allow_public_test_key': True}
        options.update(kwargs)
        return preview.verify_release(self.manifest, self.archive, self.key, preview.digest(self.key), **options)

    def test_real_ed25519_signature_and_every_extracted_file_match(self):
        value = self.verify()
        destination = self.root / 'new'
        preview.extract_verified(self.archive, destination, value['files'])
        for name, payload in self.payloads.items():
            self.assertEqual((destination / name).read_bytes(), payload)
            self.assertEqual((destination / name).stat().st_mode & 0o777, 0o444)

    def test_public_test_key_requires_opt_in_and_independent_manifest_pin(self):
        for options in ({'allow_public_test_key': False}, {'manifest_sha256': None}):
            with self.subTest(options=options), self.assertRaisesRegex(ValueError, 'public test key requires'):
                self.verify(**options)

    def test_wrong_manifest_pin_is_rejected_before_extraction(self):
        with self.assertRaisesRegex(ValueError, 'manifest hash mismatch'):
            self.verify(manifest_sha256='0' * 64)
        self.assertEqual(len(list(self.root.iterdir())), 3)

    def test_wrong_key_fingerprint_is_rejected(self):
        with self.assertRaisesRegex(ValueError, 'key fingerprint'):
            preview.verify_release(self.manifest, self.archive, self.key, '0' * 64,
                                   manifest_sha256=preview.digest(self.manifest), allow_public_test_key=True)

    def test_modified_signed_payload_is_rejected_by_real_openssl(self):
        envelope = json.loads(self.manifest.read_text())
        envelope['manifest']['version'] = '1.0-attacker'
        self.manifest.write_bytes(preview.canonical(envelope))
        with self.assertRaisesRegex(ValueError, 'signature verification failed'):
            self.verify()

    def test_modified_archive_cannot_reuse_manifest(self):
        with self.archive.open('ab') as output:
            output.write(b'!')
        with self.assertRaisesRegex(ValueError, 'archive size/hash mismatch'):
            self.verify()

    def test_development_key_cannot_be_labelled_production(self):
        self.value['trust'] = 'EXTERNAL_RELEASE_KEY'
        self.sign()
        with self.assertRaisesRegex(ValueError, 'trust label'):
            self.verify()

    def test_duplicate_json_fields_fail_even_if_the_last_value_matches(self):
        self.manifest.write_bytes(self.manifest.read_bytes().rstrip()[:-1] + b',"signature":"' + b'0' * 128 + b'"}')
        with self.assertRaisesRegex(ValueError, 'duplicate JSON'):
            self.verify()

    def test_supported_host_and_complete_image_pins_are_required(self):
        for mutation in (lambda value: value['host'].update(architecture='x86_64'),
                         lambda value: value['image_sha256'].pop('Image'),
                         lambda value: value['files']['images/Image'].update(sha256='0' * 64)):
            original = copy.deepcopy(self.value)
            mutation(self.value)
            self.sign()
            with self.assertRaises(ValueError):
                self.verify()
            self.value = original

    def test_path_traversal_absolute_and_noncanonical_members_are_rejected(self):
        for name in ('../outside', '/tmp/owned', 'images//extra', 'images/./extra', 'images/a\nother'):
            with self.subTest(name=name), self.assertRaises(ValueError):
                preview.safe_member(name)

    def test_link_device_duplicate_and_unlisted_members_never_extract(self):
        for kind, name in ((tarfile.SYMTYPE, 'images/link'), (tarfile.LNKTYPE, 'images/link'),
                           (tarfile.CHRTYPE, 'images/device'), (tarfile.REGTYPE, 'images/Image'),
                           (tarfile.REGTYPE, 'images/unlisted')):
            member = tarfile.TarInfo(name)
            member.type, member.linkname = kind, '/tmp/foreign'
            self.write_archive(extra=member)
            with self.subTest(kind=kind, name=name), tempfile.TemporaryDirectory(dir=self.root) as folder:
                with self.assertRaises(ValueError):
                    preview.extract_verified(self.archive, Path(folder) / 'payload', self.files)

    def test_missing_member_and_payload_hash_mismatch_are_rejected(self):
        original = copy.deepcopy(self.files)
        self.files['expected-but-missing'] = {'mode': 0o444, 'bytes': 0, 'sha256': hashlib.sha256(b'').hexdigest()}
        with self.assertRaisesRegex(ValueError, 'incomplete'):
            preview.extract_verified(self.archive, self.root / 'missing', self.files)
        original['images/Image']['sha256'] = '0' * 64
        with self.assertRaisesRegex(ValueError, 'file hash'):
            preview.extract_verified(self.archive, self.root / 'corrupt', original)

    def test_existing_destination_is_preserved(self):
        destination = self.root / 'existing'
        destination.mkdir()
        sentinel = destination / 'sentinel'
        sentinel.write_bytes(b'keep')
        with self.assertRaises(FileExistsError):
            preview.extract_verified(self.archive, destination, self.files)
        with self.assertRaisesRegex(ValueError, 'already exists'):
            preview.protected(destination, new=True)
        self.assertEqual(sentinel.read_bytes(), b'keep')

    def test_symlink_destination_or_unprotected_parent_is_refused(self):
        actual = self.root / 'actual'
        actual.mkdir(mode=0o700)
        link = self.root / 'link'
        link.symlink_to(actual, target_is_directory=True)
        with self.assertRaisesRegex(ValueError, 'canonical'):
            preview.protected(link)
        actual.chmod(0o777)
        with self.assertRaisesRegex(ValueError, 'unprotected'):
            preview.protected(actual / 'new', new=True)

    def test_installed_file_changes_are_detected(self):
        preview.extract_verified(self.archive, self.root / 'payload', self.files)
        preview.verify_installed(self.root, self.value)
        path = self.root / 'payload/images/Image'
        path.chmod(0o644)
        with self.assertRaisesRegex(ValueError, 'installed release file'):
            preview.verify_installed(self.root, self.value)

    def test_signer_does_not_generate_or_accept_implicit_key(self):
        with self.assertRaisesRegex(ValueError, 'choose an existing'):
            package_preview.sign(self.value)
        with self.assertRaisesRegex(ValueError, 'choose an existing'):
            package_preview.sign(self.value, self.key, development=True)

    def test_reproducible_archive_metadata(self):
        first = preview.digest(self.archive)
        self.write_archive()
        self.assertEqual(preview.digest(self.archive), first)


class OwnedLifecycle(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='preview-owned-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        self.root.chmod(0o700)
        self.record = {'schema': preview.OWNERSHIP, 'id': 'a' * 32, 'root': str(self.root), 'uid': os.geteuid(),
                       'vm_name': 'os', 'state': 'INSTALLED', 'active_device': 'preview', 'retired_devices': [],
                       'source_commit': 'b' * 40, 'host_tools_commit': 'b' * 40, 'host': {}}
        preview.save(self.root / 'installation.json', self.record)

    def test_ownership_mismatch_never_calls_lima(self):
        for field, value in (('uid', os.geteuid() + 1), ('root', '/foreign'), ('vm_name', 'existing-user-vm')):
            record = {**self.record, field: value}
            preview.save(self.root / 'installation.json', record)
            with patch.object(preview, 'lima') as lima, self.assertRaises(ValueError):
                preview.load(self.root)
            lima.assert_not_called()

    def test_vm_template_has_only_readonly_package_mount_and_no_public_ports(self):
        config = preview.vm_config(self.root)
        self.assertEqual(config['mounts'], [{'location': str(self.root / 'payload'),
                                            'mountPoint': '/mnt/rockstaros-package', 'writable': False}])
        self.assertEqual(config['images'], [preview.BASE_IMAGE])
        self.assertTrue(config['portForwards'][0]['ignore'])
        self.assertEqual(config['containerd'], {'system': False, 'user': False})
        self.assertNotIn('ssh', config)

    def test_lima_always_uses_private_home(self):
        with patch.object(preview, 'command') as command:
            preview.lima(self.root, 'list', '--json', 'os')
        self.assertEqual(command.call_args.kwargs['env']['LIMA_HOME'], str(self.root / 'lima'))
        self.assertNotIn('--force', command.call_args.args[0])

    def test_changed_vm_identity_is_refused_before_any_delete(self):
        home = self.root / 'lima'
        home.mkdir(mode=0o700)
        vm = home / 'os'
        vm.mkdir(mode=0o700)
        (vm / 'lima.yaml').write_bytes(b'config')
        (vm / 'vz-identifier').write_bytes(b'changed identity')
        record = {**self.record, 'vm_config_sha256': preview.digest(vm / 'lima.yaml'), 'vm_identity_sha256': '0' * 64}
        with patch.object(preview, 'lima') as lima, self.assertRaisesRegex(ValueError, 'identity/configuration'):
            preview.verify_vm(self.root, record)
        lima.assert_not_called()

    def test_installation_lock_rejects_a_symlink(self):
        foreign = self.root / 'foreign'
        foreign.write_bytes(b'keep')
        (self.root / 'installation.lock').symlink_to(foreign)
        with self.assertRaises(OSError), preview.locked(self.root):
            self.fail('lock acquired through symlink')
        self.assertEqual(foreign.read_bytes(), b'keep')

    def test_release_inventory_is_bound_to_verified_install_record(self):
        preview.save(self.root / 'release.json', {'files': {}})
        record = {**self.record, 'installed_release_sha256': preview.digest(self.root / 'release.json')}
        self.assertEqual(preview.installed_release(self.root, record), {'files': {}})
        preview.save(self.root / 'release.json', {'files': {'injected': {}}})
        with self.assertRaisesRegex(ValueError, 'inventory differs'):
            preview.installed_release(self.root, record)

    def action_patches(self, *, running=False):
        module = Mock()
        module.load.return_value = {'device': {'name': 'preview'}}
        module.remote.return_value = {'running': running}
        return module, [patch.object(preview, 'installed_release', return_value={}),
                        patch.object(preview, 'verify_installed'),
                        patch.object(preview, 'verify_vm', return_value={'status': 'Running'}),
                        patch.object(preview, 'launcher', return_value=module)]

    def run_action(self, args, *, running=False):
        from contextlib import ExitStack
        module, patches = self.action_patches(running=running)
        with ExitStack() as stack:
            for item in patches:
                stack.enter_context(item)
            return preview.action(SimpleNamespace(directory=self.root, **args)), module

    def test_running_os_blocks_backup_restore_and_delete(self):
        for action in ('backup', 'restore', 'remove'):
            with self.subTest(action=action), patch.object(preview, 'lima') as lima:
                with self.assertRaisesRegex(ValueError, '稼働中'):
                    self.run_action({'action': action, 'delete_data': True}, running=True)
                lima.assert_not_called()

    def test_removal_requires_explicit_data_deletion_and_keeps_other_lima(self):
        with patch.object(preview, 'lima') as lima:
            with self.assertRaisesRegex(ValueError, '--delete-data'):
                self.run_action({'action': 'remove', 'delete_data': False})
            lima.assert_not_called()
        with patch.object(preview, 'lima') as lima:
            result, _ = self.run_action({'action': 'remove', 'delete_data': True})
        self.assertEqual(result['status'], 'REMOVED')
        self.assertEqual([call.args[1:] for call in lima.call_args_list],
                         [('stop', 'os'), ('delete', '--tty=false', 'os')])
        self.assertTrue((self.root / 'installation.json').exists())

    def test_failed_cleanup_refuses_an_unidentified_vm(self):
        preview.save(self.root / 'installation.json', {**self.record, 'state': 'INSTALL_FAILED'})
        (self.root / 'lima').mkdir(mode=0o700)
        (self.root / 'lima/os').mkdir(mode=0o700)
        with patch.object(preview, 'lima') as lima, self.assertRaises(OSError):
            preview.cleanup_failed(SimpleNamespace(directory=self.root, delete_data=True))
        lima.assert_not_called()

    def test_fetch_refuses_http_and_preserves_existing_file(self):
        target = self.root / 'download'
        target.write_bytes(b'existing')
        for url in ('http://example.com/a', 'https://user:password@example.com/a', 'https://example.com/a#fragment'):
            with self.subTest(url=url), self.assertRaises(ValueError):
                preview.fetch(SimpleNamespace(url=url, output=target, sha256='0' * 64))
        self.assertEqual(target.read_bytes(), b'existing')


if __name__ == '__main__':
    unittest.main()

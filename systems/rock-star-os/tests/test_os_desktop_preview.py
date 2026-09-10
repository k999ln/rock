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
                      'boot': {'mode': 'signed-stage0', 'profile': 'local-development', 'factory_sha256': 'b' * 64},
                      'game': None,
                      'display': preview.PREVIEW_DISPLAY,
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

    def test_validation_caches_never_enter_committed_package_inventory(self):
        native = self.root / 'native'
        native.mkdir()
        (native / 'source.py').write_bytes(b'# committed source\n')
        inventory = {package_preview.NATIVE_PREFIX + 'source.py': preview.digest(native / 'source.py')}
        first = package_preview.frozen_native_inputs(self.root, inventory)
        (native / '__pycache__').mkdir()
        (native / '__pycache__/source.cpython-314.pyc').write_bytes(b'volatile import cache with a temporary path')
        self.assertEqual(package_preview.frozen_native_inputs(self.root, inventory), first)
        self.assertEqual([name for name, _ in first], ['native/source.py'])
        (native / 'source.py').write_bytes(b'# modified source\n')
        with self.assertRaisesRegex(ValueError, 'source changed'):
            package_preview.frozen_native_inputs(self.root, inventory)

    def test_extract_directory_modes_do_not_depend_on_invoking_umask(self):
        for mask in (0o000, 0o002, 0o077):
            destination = self.root / ('mask-' + str(mask))
            previous = os.umask(mask)
            try:
                preview.extract_verified(self.archive, destination, self.files)
            finally:
                os.umask(previous)
            self.assertEqual(destination.stat().st_mode & 0o777, 0o700)
            for path in destination.rglob('*'):
                self.assertEqual(path.stat().st_mode & 0o777, 0o755 if path.is_dir() else 0o444)

    def configure_game_release(self):
        self.payloads['images/profile.json'] = b'{"scope":"manifest unit fixture only"}\n'
        self.payloads[preview.GAME_CONFIG_MEMBER] = preview.canonical({
            'authority_id': preview.GAME_AUTHORITY, 'state': preview.GAME_STATE, 'simulation_only': True}) + b'\n'
        self.write_archive()
        self.value['archive'].update(sha256=preview.digest(self.archive), bytes=self.archive.stat().st_size)
        self.value['boot'].update(profile='development-game-authority',
                                 profile_sha256=self.files['images/profile.json']['sha256'])
        self.value['game'] = {'authority_id': preview.GAME_AUTHORITY, 'config': preview.GAME_CONFIG,
                             'config_member': preview.GAME_CONFIG_MEMBER,
                             'sha256': self.files[preview.GAME_CONFIG_MEMBER]['sha256']}
        self.sign()

    def test_game_release_binds_profile_and_authority_config_to_signed_inventory(self):
        self.configure_game_release()
        release = self.verify()
        (self.root / 'profiles').mkdir()
        record = {'vm_config_sha256': '1' * 64, 'vm_identity_sha256': '2' * 64}
        path = preview.launcher_manifest(self.root, release, record, 'new-preview')
        device = preview.decode(preview.read(path))['device']
        self.assertEqual(device['schema'], 'rock-desktop-device/7')
        self.assertEqual(device['network'], 'game-authority')
        self.assertEqual(device['boot'], release['boot'])
        self.assertEqual(device['game'], {key: release['game'][key] for key in ('config', 'sha256', 'authority_id')})

    def test_signed_game_release_still_refuses_crossed_bindings(self):
        self.configure_game_release()
        initial = copy.deepcopy(self.value)
        for section, field, value in (
                ('boot', 'factory_sha256', '3' * 64), ('boot', 'profile_sha256', '4' * 64),
                ('boot', 'profile', 'local-development'),
                ('game', 'sha256', '5' * 64), ('game', 'authority_id', 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'),
                ('game', 'config', '/var/tmp/another-authority/sandbox.json'),
                ('game', 'config_member', 'native/config.json')):
            with self.subTest(section=section, field=field):
                self.value = copy.deepcopy(initial)
                self.value[section][field] = value
                self.sign()
                with self.assertRaises(ValueError):
                    self.verify()

    def test_local_release_cannot_hide_an_implicit_game_binding(self):
        self.value['game'] = {'authority_id': preview.GAME_AUTHORITY}
        self.sign()
        with self.assertRaisesRegex(ValueError, 'implicit Game'):
            self.verify()

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

    def test_packager_rejects_an_old_image_relabelled_with_new_source(self):
        images = self.root / 'image-input'
        images.mkdir()
        for name in preview.IMAGE_NAMES:
            (images / name).write_bytes(b'synthetic image input')
        (images / 'freeze-manifest.json').write_bytes(preview.canonical({
            'schema': 'rock-build-freeze/2', 'status': 'BUILD_COMPLETE_FROZEN',
            'source_commit': 'b' * 40, 'files_sha256': {name: preview.digest(images / name) for name in preview.IMAGE_NAMES},
            'archive_commit_verified': True, 'source_tests': {'status': 'PASS', 'source_unchanged': True}}))
        output = self.root / 'must-not-exist'
        args = SimpleNamespace(repository=self.root, source='a' * 40, images=images, output=output)
        with patch.object(package_preview.subprocess, 'check_output', return_value='a' * 40 + '\n'):
            with self.assertRaisesRegex(ValueError, 'do not relabel'):
                package_preview.make(args)
        self.assertFalse(output.exists())



class PreparedGameImageRelease(unittest.TestCase):
    """Profile metadata fixtures; real factory signatures are checked separately."""
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='preview-game-profile-')
        self.addCleanup(self.temp.cleanup)
        self.tree = Path(self.temp.name).resolve()
        self.images = self.tree / 'images'
        self.images.mkdir()
        for name in preview.IMAGE_NAMES:
            (self.images / name).write_bytes(('unit-' + name).encode())
        self.commit = '1' * 40
        self.factory = preview.canonical({'manifest': {'sha256': preview.digest(self.images / 'rootfs.ext4')},
                                          'signature': 'not-a-real-factory-signature'}) + b'\n'
        config = {'authority_id': preview.GAME_AUTHORITY, 'state': preview.GAME_STATE, 'simulation_only': True}
        path = self.tree / preview.GAME_CONFIG_MEMBER
        path.parent.mkdir(parents=True)
        path.write_bytes(preview.canonical(config) + b'\n')
        base = {'schema': 'rock-build-freeze/2', 'status': 'BUILD_COMPLETE_FROZEN', 'source_commit': self.commit,
                'files_sha256': {name: '2' * 64 for name in preview.IMAGE_NAMES}}
        self.base_raw = preview.canonical(base) + b'\n'
        (self.images / 'base-freeze-manifest.json').write_bytes(self.base_raw)
        self.record = {'schema': 'rock-game-authority-image-profile/1', 'status': 'PREPARED',
                       'profile': 'development-game-authority', 'source_commit': self.commit,
                       'authority_id': preview.GAME_AUTHORITY, 'simulation_only': True,
                       'device_data_created': False, 'base_images_unchanged': True,
                       'initial_state': 'empty-unregistered-no-consent',
                       'stage0': {'output_factory_sha256': hashlib.sha256(self.factory).hexdigest(),
                                  'output_factory': preview.decode(self.factory)},
                       'images': {name: {'sha256': preview.digest(self.images / name),
                                        'size': (self.images / name).stat().st_size} for name in preview.IMAGE_NAMES},
                       'base_images': {name: {'sha256': base['files_sha256'][name]} for name in preview.IMAGE_NAMES},
                       'sandbox_configuration': config, 'sandbox_configuration_sha256': preview.digest(path)}
        self.freeze = {'base_build': {'manifest': base, 'manifest_sha256': hashlib.sha256(self.base_raw).hexdigest()},
                       'profile_derivation': {}}
        self.write_profile()

    def write_profile(self):
        path = self.images / 'profile.json'
        if path.exists(): path.chmod(0o600)
        path.write_bytes(preview.canonical(self.record) + b'\n')
        path.chmod(0o444)
        self.freeze['profile_derivation']['profile_sha256'] = preview.digest(path)

    def package_profile(self, name='development-game-authority'):
        return package_preview.release_profile(self.tree, self.images, self.commit, self.factory, name, self.freeze)

    def test_exact_profile_and_original_build_bytes_are_included(self):
        boot, game, files = self.package_profile()
        self.assertEqual(boot['profile_sha256'], preview.digest(self.images / 'profile.json'))
        self.assertEqual(game['sha256'], self.record['sandbox_configuration_sha256'])
        self.assertEqual([name for name, _ in files], ['images/profile.json', 'provenance/base-freeze-manifest.json'])

    def test_configured_profile_cannot_be_called_local_only(self):
        with self.assertRaisesRegex(ValueError, 'relabelled'):
            self.package_profile('local-development')

    def test_profile_requires_same_source_empty_state_and_factory(self):
        initial = copy.deepcopy(self.record)
        for key, value in (('source_commit', '3' * 40), ('initial_state', 'funded'),
                           ('device_data_created', True), ('authority_id', 'foreign'), ('simulation_only', False)):
            self.record = {**initial, key: value}
            self.write_profile()
            with self.subTest(key=key), self.assertRaises(ValueError):
                self.package_profile()
        self.record = copy.deepcopy(initial)
        self.record['stage0']['output_factory_sha256'] = '4' * 64
        self.write_profile()
        with self.assertRaisesRegex(ValueError, 'factory differ'):
            self.package_profile()

    def test_base_freeze_raw_bytes_and_inline_record_must_agree(self):
        for mutate in ('raw', 'inline', 'profile'):
            self.freeze['base_build']['manifest_sha256'] = hashlib.sha256(self.base_raw).hexdigest()
            self.freeze['base_build']['manifest'] = preview.decode(self.base_raw)
            (self.images / 'base-freeze-manifest.json').write_bytes(self.base_raw)
            self.write_profile()
            if mutate == 'raw': (self.images / 'base-freeze-manifest.json').write_bytes(self.base_raw + b'\n')
            elif mutate == 'inline': self.freeze['base_build']['manifest']['source_commit'] = '5' * 40
            else: self.freeze['profile_derivation']['profile_sha256'] = '6' * 64
            with self.subTest(mutate=mutate), self.assertRaisesRegex(ValueError, 'base-build bytes'):
                self.package_profile()

    def test_profile_copy_cannot_select_different_images_or_sandbox_configuration(self):
        (self.images / 'rootfs.ext4').write_bytes(b'changed image')
        with self.assertRaisesRegex(ValueError, 'image triple'):
            self.package_profile()
        (self.images / 'rootfs.ext4').write_bytes(b'unit-rootfs.ext4')
        (self.tree / preview.GAME_CONFIG_MEMBER).write_bytes(b'changed config')
        with self.assertRaises(ValueError):
            self.package_profile()


class CompleteGameExport(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve(); self.root.chmod(0o700)
        self.saved = {'backup': '/var/tmp/rockstaros-preview-backups/01234567-89ab-4def-8123-456789abcdef',
                      'source_device': 'preview', 'os': {'backup': '/var/tmp/rock-star-desktop/preview/backups/complete'},
                      'authority': {'receipt': {}}, 'files': {}}
        names = ['os/backup.json', 'os/slot-a.ext4', 'os/slot-b.ext4', 'os/userdata.ext4',
                 'authority/manifest.json', 'authority/plan.json', *['authority/files/db'+str(i) for i in range(5)]]
        self.data = {}
        for name in names:
            raw = ('opaque fixture '+name).encode()
            source = self.saved['os']['backup']+'/'+name[3:] if name.startswith('os/') else self.saved['backup']+'/'+name
            self.saved['files'][name] = {'source': source, 'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()}
            self.data[source] = raw
        self.saved['os']['manifest_sha256'] = self.saved['files']['os/backup.json']['sha256']
        self.saved['authority']['receipt']['manifest_sha256'] = self.saved['files']['authority/manifest.json']['sha256']

    def copy(self, root, action, backend, source, destination, **kwargs):
        self.assertEqual((action, backend), ('copy', '--backend=scp'))
        Path(destination).write_bytes(self.data[source.removeprefix('os:')])

    def test_all_components_export_to_private_distinct_host_directory(self):
        target = self.root/'off-vm'
        with patch.object(preview, 'lima', side_effect=self.copy):
            self.assertEqual(preview.export_game_backup(self.root, self.saved, target), str(target))
        self.assertEqual(preview.decode(preview.read(target/'backup.json')), self.saved)
        for name, value in self.saved['files'].items():
            self.assertEqual(preview.digest(target/name), value['sha256'])
            self.assertEqual((target/name).stat().st_mode & 0o777, 0o600)
        for path in target.rglob('*'):
            if path.is_dir(): self.assertEqual(path.stat().st_mode & 0o777, 0o700)

    def test_modified_export_never_gets_complete_manifest(self):
        self.data[next(iter(self.data))] = b'changed'
        target = self.root/'partial'
        with patch.object(preview, 'lima', side_effect=self.copy), self.assertRaisesRegex(ValueError, 'differs'):
            preview.export_game_backup(self.root, self.saved, target)
        self.assertFalse((target/'backup.json').exists())

    def test_missing_component_foreign_path_and_traversal_refused_before_copy(self):
        for change in ('missing', 'foreign', 'traversal', 'typed-size', 'manifest'):
            value = copy.deepcopy(self.saved)
            if change == 'missing': del value['files']['os/slot-b.ext4']
            elif change == 'foreign': value['files']['os/userdata.ext4']['source'] = '/user/foreign'
            elif change == 'traversal': value['files']['../foreign'] = value['files'].pop('authority/files/db0')
            elif change == 'typed-size': value['files']['authority/files/db0']['bytes'] = True
            else: value['authority']['receipt']['manifest_sha256'] = 'e'*64
            with self.subTest(change=change), patch.object(preview, 'lima') as lima, self.assertRaises(ValueError):
                preview.export_game_backup(self.root, value, self.root/change)
            lima.assert_not_called(); self.assertFalse((self.root/change).exists())


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
        self.assertFalse(config['ssh']['loadDotSSHPubKeys'])
        self.assertFalse(config['ssh']['forwardAgent'])
        self.assertFalse(config['propagateProxyEnv'])

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
        module.load.return_value = {'device': {'name': 'preview'}, 'host_state': str(self.root / 'display')}
        module.remote.return_value = {'running': running}
        return module, [patch.object(preview, 'installed_release', return_value={'game': None}),
                        patch.object(preview, 'verify_installed'),
                        patch.object(preview, 'verify_vm', return_value={'status': 'Running'}),
                        patch.object(preview, 'launcher', return_value=module)]

    def test_sandbox_receipt_requires_expected_authority_hash_and_process_state(self):
        release = {'game': {'sha256': 'a' * 64},
                   'files': {'native/os/game_exchange/sandbox.py': {'sha256': 'b' * 64}}}
        receipt = {'schema': 'rock-game-sandbox-status/1', 'authority_id': preview.GAME_AUTHORITY,
                   'config_sha256': 'a' * 64, 'simulation_only': True, 'running': True, 'pid': 123}
        with patch.object(preview, 'guest_python', return_value=SimpleNamespace(stdout=json.dumps(receipt))):
            self.assertEqual(preview.sandbox_command(self.root, release, 'start'), receipt)
        for field, changed in (('authority_id', 'foreign'), ('config_sha256', 'c' * 64),
                               ('simulation_only', False), ('running', False), ('running', 1), ('schema', 'foreign')):
            bad = {**receipt, field: changed}
            with self.subTest(field=field, changed=changed), \
                 patch.object(preview, 'guest_python', return_value=SimpleNamespace(stdout=json.dumps(bad))), \
                 self.assertRaises(ValueError):
                preview.sandbox_command(self.root, release, 'start')

    def test_unavailable_game_server_does_not_prevent_hub_start(self):
        from contextlib import ExitStack
        module, patches = self.action_patches()
        module.launch.return_value = {'running': True}
        with ExitStack() as stack:
            for item in patches:
                stack.enter_context(item)
            stack.enter_context(patch.object(preview, 'installed_release', return_value={'game': {'sha256': 'a' * 64}}))
            stack.enter_context(patch.object(preview, 'sandbox_command', side_effect=ValueError('fixture server unavailable')))
            result = preview.action(SimpleNamespace(directory=self.root, action='start', no_open=True))
        self.assertTrue(result['running'])
        self.assertEqual(result['game']['status'], 'UNAVAILABLE')
        module.launch.assert_called_once()

    def test_failed_game_writer_stop_blocks_vm_deletion(self):
        from contextlib import ExitStack
        module, patches = self.action_patches()
        with ExitStack() as stack:
            for item in patches:
                stack.enter_context(item)
            stack.enter_context(patch.object(preview, 'installed_release', return_value={'game': {'sha256': 'a' * 64}}))
            stack.enter_context(patch.object(preview, 'sandbox_command', side_effect=ValueError('writer identity changed')))
            lima = stack.enter_context(patch.object(preview, 'lima'))
            with self.assertRaisesRegex(ValueError, 'writer identity changed'):
                preview.action(SimpleNamespace(directory=self.root, action='remove', delete_data=True))
            lima.assert_not_called()
        self.assertEqual(preview.load(self.root)[1]['state'], 'INSTALLED')

    def test_game_restore_persists_intent_before_vm_and_resumes_only_same_name(self):
        from contextlib import ExitStack
        module, patches = self.action_patches()
        saved = {'source_device': 'preview', 'config': module.load.return_value['device'], 'backup': '/backup/full'}
        preview.save(self.root/'last-backup.json', saved)
        calls = []
        def interrupted(*args, **kwargs):
            if args[3] == 'check-restore': return {'status': 'READY'}
            record = preview.load(self.root)[1]
            self.assertEqual(record['state'], 'RESTORE_PENDING')
            calls.append((args[4], kwargs['name']))
            raise InterruptedError('lost connection while restoring')
        with ExitStack() as stack:
            for item in patches: stack.enter_context(item)
            stack.enter_context(patch.object(preview, 'installed_release', return_value={'game': {'sha256': 'a'*64}}))
            stack.enter_context(patch.object(preview, 'close_owned_display'))
            stack.enter_context(patch.object(preview, 'launcher_manifest'))
            transaction = stack.enter_context(patch.object(preview, 'game_transaction', side_effect=interrupted))
            for _ in range(2):
                with self.assertRaises(InterruptedError):
                    preview.action(SimpleNamespace(directory=self.root, action='restore', name='restored'))
            self.assertEqual(calls[0], calls[1])
            with self.assertRaisesRegex(ValueError, 'pending restore'):
                preview.action(SimpleNamespace(directory=self.root, action='restore', name='other'))
            self.assertEqual(transaction.call_count, 3)
            for action in ('start', 'remove', 'backup'):
                with self.assertRaisesRegex(ValueError, 'restore is pending'):
                    preview.action(SimpleNamespace(directory=self.root, action=action))
            transaction.side_effect = None; transaction.return_value = {'status': 'RESTORED', 'device': 'restored'}
            self.assertEqual(preview.action(SimpleNamespace(directory=self.root, action='restore', name='restored'))['status'], 'RESTORED')
        record = preview.load(self.root)[1]
        self.assertEqual(record['active_device'], 'restored'); self.assertEqual(record['retired_devices'], ['preview'])
        self.assertNotIn('pending_restore', record)

    def test_changed_complete_backup_cannot_resume_a_pending_restore(self):
        from contextlib import ExitStack
        module, patches = self.action_patches()
        saved = {'source_device': 'preview', 'config': module.load.return_value['device'], 'backup': '/backup/full'}
        preview.save(self.root/'last-backup.json', saved)
        preview.save(self.root/'installation.json', {**self.record, 'state': 'RESTORE_PENDING',
                     'pending_restore': {'name': 'restored', 'source': 'preview', 'backup': '/backup/full', 'backup_sha256': '0'*64}})
        with ExitStack() as stack:
            for item in patches: stack.enter_context(item)
            stack.enter_context(patch.object(preview, 'installed_release', return_value={'game': {'sha256': 'a'*64}}))
            transaction = stack.enter_context(patch.object(preview, 'game_transaction'))
            with self.assertRaisesRegex(ValueError, 'pending restore'):
                preview.action(SimpleNamespace(directory=self.root, action='restore', name='restored'))
            transaction.assert_not_called()

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

    def test_status_and_stop_do_not_wake_a_stopped_vm(self):
        from contextlib import ExitStack
        for action in ('status', 'stop'):
            module, patches = self.action_patches()
            with self.subTest(action=action), ExitStack() as stack:
                for item in patches:
                    stack.enter_context(item)
                stack.enter_context(patch.object(preview, 'verify_vm', return_value={'status': 'Stopped'}))
                lima = stack.enter_context(patch.object(preview, 'lima'))
                result = preview.action(SimpleNamespace(directory=self.root, action=action))
                self.assertFalse(result['running'])
                self.assertEqual(result['vm_status'], 'Stopped')
                self.assertIn('does not infer', result['observed'])
                lima.assert_not_called()
                module.remote.assert_not_called()

    def test_unknown_vm_state_is_not_relabelled_stopped_or_restarted(self):
        from contextlib import ExitStack
        for state in ('Broken', 'Starting', 'Stopping', 'Unknown'):
            module, patches = self.action_patches()
            with self.subTest(state=state), ExitStack() as stack:
                for item in patches:
                    stack.enter_context(item)
                stack.enter_context(patch.object(preview, 'verify_vm', return_value={'status': state}))
                lima = stack.enter_context(patch.object(preview, 'lima'))
                with self.assertRaisesRegex(ValueError, 'not stable'):
                    preview.action(SimpleNamespace(directory=self.root, action='status'))
                lima.assert_not_called()
                module.remote.assert_not_called()

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

    def test_diagnose_works_when_install_or_restore_is_incomplete(self):
        for state in ('INSTALL_FAILED', 'RESTORE_PENDING', 'REMOVED'):
            preview.save(self.root / 'installation.json', {**self.record, 'state': state})
            with self.subTest(state=state), patch.object(preview, 'lima') as lima:
                result = preview.action(SimpleNamespace(directory=self.root, action='diagnose'))
            self.assertEqual(result['status'], state)
            lima.assert_not_called()

    def test_fetch_refuses_http_and_preserves_existing_file(self):
        target = self.root / 'download'
        target.write_bytes(b'existing')
        for url in ('http://example.com/a', 'https://user:password@example.com/a', 'https://example.com/a#fragment'):
            with self.subTest(url=url), self.assertRaises(ValueError):
                preview.fetch(SimpleNamespace(url=url, output=target, sha256='0' * 64))
        self.assertEqual(target.read_bytes(), b'existing')

    def test_viewer_cleanup_preserves_a_reused_pid(self):
        from contextlib import nullcontext
        import browser_server
        state = self.root / 'display'
        state.mkdir(mode=0o700)
        preview.save(state / 'viewer.json', {'pid': 123, 'command': 'old viewer', 'instance': 'a' * 32, 'build': 'b' * 64})
        module = SimpleNamespace(launcher_lock=lambda config, state: nullcontext(),
                                 decode_manifest=preview.decode, private_file=preview.read)
        with patch.object(browser_server, 'process_command', return_value='unrelated editor'), patch.object(preview.os, 'kill') as kill:
            result = preview.close_owned_display(module, {'host_state': str(state)})
        self.assertEqual(result['viewer'], 'OLD_PROCESS_GONE')
        kill.assert_not_called()


if __name__ == '__main__':
    unittest.main()

"""Image preparation checks; the small ARM64-header fixture is NOT bootable."""
from copy import deepcopy
import gzip
import hashlib
import os
from pathlib import Path
import shutil
import stat
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

from blackberryrock.packages import canonical
from entitlement.protocol import PUBLIC_TOKENS
from service_access import os_client, profile
from service_access.controller import PUBLIC_SERVICE_TOKENS

AUTHORITY = '11111111-1111-4111-8111-111111111111'
DEVICE = 'fixture-rock-arm64-001'


def configuration():
    service = {'schema': os_client.CONFIG_SCHEMA, 'authority_id': AUTHORITY,
        'consumer_id': 'alice-a', 'device_ref': DEVICE, 'token': PUBLIC_SERVICE_TOKENS['alice-a'],
        'registry_origin': 'https://10.0.2.2:9743', 'runner_origin': 'https://10.0.2.2:9744',
        'runner_endpoint_id': 'runner-closed-cloud'}
    wallet = {'schema_version': 2, 'mode': 'development-remote-authority',
        'origin': 'https://10.0.2.2:9745', 'authority_id': AUTHORITY, 'device_ref': DEVICE,
        'ca_file': profile.CA_PATH, 'token_file': profile.TOKEN_PATH}
    authenticator = {'schema_version': 1, 'kind': 'public-software-test-authenticator', 'device_ref': DEVICE}
    return {'service_configuration': service, 'wallet_configuration': wallet,
            'wallet_token': PUBLIC_TOKENS['alice'], 'authenticator_configuration': authenticator}


def payloads(options):
    return profile.configurations(options['service_configuration'], options['wallet_configuration'],
                                  options['wallet_token'], options['authenticator_configuration'])


def newc(entries):
    raw = bytearray()
    for index, (name, data, mode) in enumerate([*entries, ('TRAILER!!!', b'', 0)]):
        encoded = name.encode() + b'\0'
        fields = [index + 1, mode, 0, 0, 1, 0, len(data), 0, 0, 0, 0, len(encoded), 0]
        header = b'070701' + b''.join(f'{value:08x}'.encode() for value in fields)
        raw += header + encoded + b'\0' * (-(110 + len(encoded)) % 4)
        raw += data + b'\0' * (-len(data) % 4)
    return bytes(raw)


def stage(path, factory=b'{}\n', *, entries=None):
    if entries is None:
        entries = [('init', b'#!/bin/sh\nexit 0\n', 0o100755),
                   ('bin/sh', b'busybox', 0o120777),
                   (profile.FACTORY_PATH, factory, 0o100444)]
    path.write_bytes(gzip.compress(newc(entries), mtime=0))


class ProfileConfigurationTests(unittest.TestCase):
    def test_exact_files_and_matching_public_replacement_device(self):
        options = configuration()
        raw = payloads(options)
        self.assertEqual(set(raw), {profile.SERVICE_PATH, profile.REQUIRED_PATH, profile.WALLET_PATH,
                                   profile.TOKEN_PATH, profile.AUTH_PATH})
        self.assertEqual(raw[profile.TOKEN_PATH], (PUBLIC_TOKENS['alice'] + '\n').encode())
        self.assertEqual(raw[profile.REQUIRED_PATH], profile.REQUIRED_BYTES)
        from wallet_backend.server import PUBLIC_SECOND_DEVICE_TOKEN
        options['service_configuration'].update(consumer_id='alice-b', device_ref='fixture-replacement',
                                                token=PUBLIC_SERVICE_TOKENS['alice-b'])
        options['wallet_configuration']['device_ref'] = 'fixture-replacement'
        options['authenticator_configuration']['device_ref'] = 'fixture-replacement'
        options['wallet_token'] = PUBLIC_SECOND_DEVICE_TOKEN
        self.assertEqual(payloads(options)[profile.TOKEN_PATH], (PUBLIC_SECOND_DEVICE_TOKEN + '\n').encode())

    def test_mismatch_fields_rejected_without_output(self):
        changes = [('wallet_configuration', 'authority_id', '22222222-2222-4222-8222-222222222222'),
                   ('wallet_configuration', 'device_ref', 'fixture-other'),
                   ('authenticator_configuration', 'device_ref', 'fixture-other'),
                   ('wallet_configuration', 'ca_file', '/tmp/other-ca'),
                   ('wallet_configuration', 'token_file', '/tmp/token'),
                   ('wallet_configuration', 'schema_version', True),
                   ('authenticator_configuration', 'schema_version', True),
                   ('authenticator_configuration', 'kind', 'real-hardware'),
                   ('service_configuration', 'token', 'PUBLIC-FIXTURE-UNRECOGNIZED-TOKEN'),
                   ('wallet_configuration', 'origin', 'https://localhost:9745'),
                   ('wallet_configuration', 'origin', 'https://10.0.2.2:9743'),
                   ('wallet_configuration', 'origin', 'https://10.0.2.2:9745/arbitrary'),
                   ('wallet_configuration', 'extra', True)]
        for section, key, value in changes:
            with self.subTest(section=section, key=key, value=value):
                options = configuration(); options[section][key] = value
                with self.assertRaises(ValueError):
                    payloads(options)

    def test_wrong_public_wallet_token_and_nonpublic_token_rejected(self):
        for token in (PUBLIC_TOKENS['bob'], PUBLIC_SERVICE_TOKENS['alice-a'],
                      'not-a-public-fixture', PUBLIC_TOKENS['alice'] + '\n', None):
            with self.subTest(token=token):
                options = configuration(); options['wallet_token'] = token
                with self.assertRaises(ValueError):
                    payloads(options)

    def test_preparation_refuses_nonlinux_without_creating_output(self):
        with tempfile.TemporaryDirectory() as temporary, patch.object(profile.sys, 'platform', 'darwin'):
            out = Path(temporary) / 'new'
            with self.assertRaisesRegex(ValueError, 'requires Linux'):
                profile.prepare_profile(Path(temporary), out, expected_sha256={}, **configuration())
            self.assertFalse(out.exists())


class ProfileInputTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(); self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name).resolve()
        self.base = self.root / 'base'; self.base.mkdir()
        kernel = bytearray(64); kernel[56:60] = b'ARM\x64'
        (self.base / 'Image').write_bytes(kernel)
        with (self.base / 'rootfs.ext4').open('wb') as stream:
            stream.truncate(8 * 1024**2)
        stage(self.base / 'stage0.cpio.gz')
        for path in self.base.iterdir(): path.chmod(0o444)
        self.hashes = {name: profile.digest(self.base / name) for name in profile.IMAGE_NAMES}

    def test_exact_pinned_readonly_inputs_and_wrong_hash(self):
        self.assertEqual(profile._inputs(self.base, self.hashes)['Image']['size'], 64)
        wrong = {**self.hashes, 'Image': '0' * 64}
        with self.assertRaisesRegex(ValueError, 'hash mismatch'): profile._inputs(self.base, wrong)
        with self.assertRaises(ValueError): profile._inputs(self.base, {**self.hashes, 'extra': '0' * 64})

    def test_symlink_parent_leaf_and_hardlink_rejected(self):
        alias = self.root / 'alias'; alias.symlink_to(self.base)
        with self.assertRaises(ValueError): profile._inputs(alias, self.hashes)
        kernel = self.base / 'Image'; backup = self.root / 'kernel'; kernel.rename(backup)
        kernel.symlink_to(backup)
        with self.assertRaises(ValueError): profile._inputs(self.base, self.hashes)
        kernel.unlink(); os.link(backup, kernel)
        with self.assertRaisesRegex(ValueError, 'single-link'): profile._inputs(self.base, self.hashes)

    def test_writable_oversized_and_short_images_rejected_before_hashing(self):
        kernel = self.base / 'Image'; kernel.chmod(0o644)
        with self.assertRaisesRegex(ValueError, 'read-only'): profile._inputs(self.base, self.hashes)
        kernel.write_bytes(b'short'); kernel.chmod(0o444)
        with self.assertRaisesRegex(ValueError, 'size'): profile._inputs(self.base, self.hashes)
        kernel.chmod(0o644)
        with kernel.open('wb') as stream: stream.truncate(profile.BOUNDS['Image'][1] + 1)
        kernel.chmod(0o444)
        with self.assertRaisesRegex(ValueError, 'size'): profile._inputs(self.base, self.hashes)

    def test_unsafe_output_paths_and_existing_directory_rejected(self):
        for name in ('space here', 'quote"here', 'comma,here'):
            with self.assertRaises(ValueError): profile._path(self.root / name, exists=False)
        existing = self.root / 'existing'; existing.mkdir(); (existing / 'retained').write_text('mine')
        with patch.object(profile.sys, 'platform', 'linux'):
            with self.assertRaisesRegex(ValueError, 'fresh output'):
                profile.prepare_profile(self.base, existing, expected_sha256=self.hashes, **configuration())
        self.assertEqual((existing / 'retained').read_text(), 'mine')


class Stage0RewriteTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(); self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)

    def test_only_factory_entry_changes_and_base_is_preserved(self):
        source = self.root / 'base.gz'; stage(source)
        before = source.read_bytes(); original = profile._stage0(source)
        target = self.root / 'derived.gz'; replacement = b'{"new":"factory"}\n'
        profile._stage0(source, destination=target, replacement=replacement)
        result = profile._stage0(target)
        self.assertEqual(result['factory'], replacement)
        self.assertEqual(result['other_entries_sha256'], original['other_entries_sha256'])
        self.assertEqual(source.read_bytes(), before)
        with self.assertRaises(FileExistsError):
            profile._stage0(source, destination=target, replacement=replacement)

    def test_missing_duplicate_unsafe_and_symlink_factory_denied(self):
        cases = [[], [(profile.FACTORY_PATH, b'{}', 0o100444)] * 2,
                 [('../escape', b'', 0o100444)], [(profile.FACTORY_PATH, b'elsewhere', 0o120777)]]
        for index, entries in enumerate(cases):
            source = self.root / f'bad-{index}.gz'; stage(source, entries=entries)
            with self.subTest(index=index), self.assertRaises(ValueError): profile._stage0(source)

    def test_truncated_and_declared_expansion_bomb_rejected(self):
        source = self.root / 'bad.gz'; stage(source)
        raw = gzip.decompress(source.read_bytes())
        source.write_bytes(gzip.compress(raw[:-30]))
        with self.assertRaises(ValueError): profile._stage0(source)
        raw = bytearray(raw); raw[54:62] = b'40000000'
        source.write_bytes(gzip.compress(raw))
        with self.assertRaisesRegex(ValueError, 'bounds'): profile._stage0(source)


@unittest.skipUnless(sys.platform == 'linux' and all(shutil.which(tool) for tool in
    ('mke2fs', 'debugfs', 'e2fsck', 'openssl')), 'actual small ext4 preparation requires Linux image tools')
class ActualExt4ProfileTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='rock-profile-test-')
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name).resolve(); self.base = self.root / 'base'; self.base.mkdir()
        tree = self.root / 'tree'; tree.mkdir()
        for guest, relative in profile.SOURCE_BINDINGS.items():
            target = tree / guest.lstrip('/'); target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes((profile.ROOT / relative).read_bytes()); target.chmod(0o444)
        for name in ('etc/rock-platform', 'etc/rock-authenticator'): (tree / name).mkdir(parents=True, exist_ok=True)
        auth_path = tree / profile.AUTH_PATH.lstrip('/')
        auth_path.write_bytes(payloads(configuration())[profile.AUTH_PATH]); auth_path.chmod(0o444)
        for directory in [tree, *(path for path in tree.rglob('*') if path.is_dir())]: directory.chmod(0o755)
        image = self.base / 'rootfs.ext4'
        with image.open('wb') as stream: stream.truncate(16 * 1024**2)
        subprocess.run(['mke2fs', '-q', '-t', 'ext4', '-F', '-d', str(tree), str(image)],
                       check=True, capture_output=True, timeout=30)
        for target in tree.rglob('*'):
            guest = '/' + str(target.relative_to(tree))
            for field in ('uid', 'gid'):
                profile._debug(image, 'set_inode_field ' + guest + ' ' + field + ' 0', write=True)
        kernel = bytearray(64); kernel[56:60] = b'ARM\x64'
        (self.base / 'Image').write_bytes(kernel)
        self.finish_base()

    def finish_base(self):
        signer, _ = profile._update_helpers()
        image = self.base / 'rootfs.ext4'; signer.check_filesystem(image)
        archive = self.base / 'stage0.cpio.gz'
        if archive.exists(): archive.chmod(0o644)
        stage(archive, canonical(signer.envelope_for(image, 1, 'factory-1')) + b'\n')
        for path in self.base.iterdir(): path.chmod(0o444)
        self.hashes = {name: profile.digest(self.base / name) for name in profile.IMAGE_NAMES}

    def prepare(self, name='new'):
        return profile.prepare_profile(self.base, self.root / name, expected_sha256=self.hashes, **configuration())

    def test_real_ext4_exact_readback_signed_factory_and_missing_configuration_failclosed(self):
        report = self.prepare(); output = self.root / 'new'
        self.assertEqual(report['status'], 'PREPARED'); self.assertFalse(report['boot_verified'])
        self.assertEqual(report['binding'], os_client.binding(configuration()['service_configuration']))
        self.assertTrue(report['base_images_unchanged'])
        self.assertEqual(self.hashes, {name: profile.digest(self.base / name) for name in profile.IMAGE_NAMES})
        self.assertEqual(report['images']['Image']['sha256'], self.hashes['Image'])
        for path, expected in payloads(configuration()).items():
            self.assertEqual(profile._cat(output / 'rootfs.ext4', path), expected)
            self.assertEqual(profile._metadata(output / 'rootfs.ext4', path),
                {'type': 'regular', 'mode': 0o444, 'uid': 0, 'gid': 0, 'links': 1})
        for path in output.iterdir(): self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o444)
        signer, update = profile._update_helpers()
        manifest = update.verify_envelope(report['stage0']['output_factory'])
        self.assertEqual(manifest['sha256'], report['images']['rootfs.ext4']['sha256'])
        self.assertNotEqual(manifest['sha256'], self.hashes['rootfs.ext4'])
        signer.check_filesystem(output / 'rootfs.ext4')
        config = self.root / 'service-access.json'
        config.with_suffix('.required').write_bytes(profile._cat(output / 'rootfs.ext4', profile.REQUIRED_PATH))
        state = self.root / 'platform-state'
        denied = os_client.resolve(state, config)
        self.assertFalse(denied.legacy_development); self.assertEqual(denied.status['state'], 'unavailable')
        config.write_bytes(profile._cat(output / 'rootfs.ext4', profile.SERVICE_PATH)); config.chmod(0o444)
        self.assertEqual(os_client.resolve(state, config).status['state'], 'configured')
        with self.assertRaises(ValueError): self.prepare()

    def test_validly_signed_factory_for_another_image_cannot_fallback(self):
        signer, _ = profile._update_helpers()
        envelope = signer.envelope_for(self.base / 'rootfs.ext4', 1, 'factory-1')
        envelope['manifest']['sha256'] = '0' * 64
        archive = self.base / 'stage0.cpio.gz'; archive.chmod(0o644)
        stage(archive, canonical(signer.sign_development(envelope['manifest'])) + b'\n'); archive.chmod(0o444)
        self.hashes['stage0.cpio.gz'] = profile.digest(archive)
        with self.assertRaisesRegex(ValueError, 'does not bind'): self.prepare()
        self.assertFalse((self.root / 'new').exists())

    def test_current_ca_and_current_source_required_before_output(self):
        image = self.base / 'rootfs.ext4'; image.chmod(0o644)
        source = self.root / 'bad'; source.write_bytes(b'not the current public CA')
        profile._debug(image, 'rm ' + profile.CA_PATH, write=True)
        profile._debug(image, 'write bad ' + profile.CA_PATH, write=True, cwd=self.root)
        for field, value in (('mode', '0100444'), ('uid', '0'), ('gid', '0')):
            profile._debug(image, 'set_inode_field ' + profile.CA_PATH + ' ' + field + ' ' + value, write=True)
        self.finish_base()
        with self.assertRaisesRegex(ValueError, 'source/CA differs'): self.prepare()
        self.assertFalse((self.root / 'new').exists())

    def test_guest_parent_symlink_refused_even_with_valid_signature(self):
        image = self.base / 'rootfs.ext4'; image.chmod(0o644)
        profile._debug(image, 'rmdir /etc/rock-platform', write=True)
        profile._debug(image, 'symlink /etc/rock-platform /etc/rock-authenticator', write=True)
        self.finish_base()
        with self.assertRaisesRegex(ValueError, 'parent directory'): self.prepare()
        self.assertFalse((self.root / 'new').exists())

    def test_root_readable_but_service_uid_inaccessible_base_rejected(self):
        image = self.base / 'rootfs.ext4'
        cases = [('/etc/rock-platform', '040700', '040755'),
                 (profile.CA_PATH, '0100400', '0100444')]
        for path, private_mode, normal_mode in cases:
            with self.subTest(path=path):
                image.chmod(0o644)
                profile._debug(image, 'set_inode_field ' + path + ' mode ' + private_mode, write=True)
                self.finish_base()
                with self.assertRaises(ValueError): self.prepare()
                self.assertFalse((self.root / 'new').exists())
                image.chmod(0o644)
                profile._debug(image, 'set_inode_field ' + path + ' mode ' + normal_mode, write=True)

    def test_failed_injection_retains_new_partial_without_completion_or_base_changes(self):
        original = profile._inject
        def fail(image, payload, directory):
            original(image, payload, directory)
            raise ValueError('injected failure after image write')
        with patch.object(profile, '_inject', side_effect=fail):
            with self.assertRaisesRegex(ValueError, 'injected failure'): self.prepare()
        self.assertTrue((self.root / 'new/rootfs.ext4').exists())
        self.assertFalse((self.root / 'new/profile.json').exists())
        self.assertEqual(self.hashes, {name: profile.digest(self.base / name) for name in profile.IMAGE_NAMES})


if __name__ == '__main__':
    unittest.main()

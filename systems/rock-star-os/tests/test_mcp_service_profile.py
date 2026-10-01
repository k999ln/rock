"""Optional MCP image provisioning; tiny ext4 fixtures are not bootable OSes."""
from copy import deepcopy
from pathlib import Path
import shutil
import stat
import sys
import tempfile
import unittest
from unittest.mock import patch

from blackberryrock.packages import canonical
from service_access import profile
import test_service_access_profile as legacy


MCP = {'schema': 'rock-mcp-hub-device/1', 'gateway_origin': 'https://10.0.2.2:9746'}


def payloads(mcp=None):
    options = legacy.configuration()
    return profile.configurations(options['service_configuration'], options['wallet_configuration'],
        options['wallet_token'], options['authenticator_configuration'], mcp_configuration=mcp)


class MCPProfileConfigurationTests(unittest.TestCase):
    def test_none_keeps_existing_five_payloads_exactly(self):
        self.assertEqual(payloads(), legacy.payloads(legacy.configuration()))
        self.assertEqual(len(payloads()), 5)
        self.assertNotIn(profile.MCP_PATH, payloads())

    def test_explicit_mcp_adds_only_fixed_noncredential_payload(self):
        original = deepcopy(MCP)
        result = payloads(MCP)
        self.assertEqual(MCP, original)
        self.assertEqual({key: value for key, value in result.items() if key != profile.MCP_PATH}, payloads())
        self.assertEqual(result[profile.MCP_PATH], canonical(MCP) + b'\n')
        self.assertEqual(len(result), 6)
        self.assertNotIn(b'PUBLIC-FIXTURE-', result[profile.MCP_PATH])

    def test_unknown_fields_types_and_origins_rejected(self):
        invalid = [False, [], {}, {**MCP, 'token': 'PUBLIC-FIXTURE-UNREQUESTED'},
                   {**MCP, 'device_ref': 'fixture-other'}, {**MCP, 'schema': True}]
        origins = [None, 9746, 'http://10.0.2.2:9746', 'https://127.0.0.1:9746',
                   'https://localhost:9746', 'https://example.invalid:9746', 'https://10.0.2.2',
                   'https://10.0.2.2:443', 'https://10.0.2.2:65536', 'https://10.0.2.2:09746',
                   'https://10.0.2.2:9746/', 'https://10.0.2.2:9746/path',
                   'https://user@10.0.2.2:9746', 'https://10.0.2.2:9746?x=1',
                   'https://10.0.2.2:9746#fragment', ' https://10.0.2.2:9746']
        for item in invalid + [{**MCP, 'gateway_origin': origin} for origin in origins]:
            with self.subTest(kind=type(item).__name__), self.assertRaises(ValueError): payloads(item)

    def test_gateway_must_not_reuse_any_existing_service_port(self):
        for port in (9743, 9744, 9745):
            with self.subTest(port=port), self.assertRaisesRegex(ValueError, 'distinct fourth'):
                payloads({**MCP, 'gateway_origin': f'https://10.0.2.2:{port}'})

    def test_invalid_optional_configuration_fails_before_image_access_or_output(self):
        with tempfile.TemporaryDirectory() as temporary, patch.object(profile.sys, 'platform', 'linux'), \
                patch.object(profile, '_inputs') as inputs:
            destination = Path(temporary) / 'new'
            with self.assertRaises(ValueError):
                profile.prepare_profile(Path(temporary) / 'unused', destination, expected_sha256={},
                    mcp_configuration={**MCP, 'gateway_origin': 'http://10.0.2.2:9746'},
                    **legacy.configuration())
            inputs.assert_not_called()
            self.assertFalse(destination.exists())


@unittest.skipUnless(sys.platform == 'linux' and all(shutil.which(tool) for tool in
    ('mke2fs', 'debugfs', 'e2fsck', 'openssl')), 'actual small ext4 preparation requires Linux image tools')
class MCPActualExt4ProfileTests(unittest.TestCase):
    def setUp(self):
        self.fx = legacy.ActualExt4ProfileTests(methodName='runTest')
        self.addCleanup(self.cleanup_fixture)
        self.fx.setUp()

    def cleanup_fixture(self):
        self.assertTrue(self.fx.doCleanups(), 'composed ext4 fixture cleanup failed')

    def install_modules(self, *, mode='040755', contents=None):
        image = self.fx.base / 'rootfs.ext4'
        image.chmod(0o644)
        directory = '/usr/lib/rock-platform/mcp_broker'
        profile._debug(image, 'mkdir ' + directory, write=True)
        for field, value in (('mode', mode), ('uid', '0'), ('gid', '0')):
            profile._debug(image, 'set_inode_field ' + directory + ' ' + field + ' ' + value, write=True)
        for index, (guest, relative) in enumerate(profile.MCP_SOURCE_BINDINGS.items()):
            name = 'mcp-input-' + str(index)
            (self.fx.root / name).write_bytes((profile.ROOT / relative).read_bytes() if contents is None else contents)
            profile._debug(image, 'write ' + name + ' ' + guest, cwd=self.fx.root, write=True)
            for field, value in (('mode', '0100444'), ('uid', '0'), ('gid', '0')):
                profile._debug(image, 'set_inode_field ' + guest + ' ' + field + ' ' + value, write=True)
        self.fx.finish_base()

    def prepare(self, name='mcp-new', **kwargs):
        return profile.prepare_profile(self.fx.base, self.fx.root / name,
            expected_sha256=self.fx.hashes, mcp_configuration=MCP, **legacy.configuration(), **kwargs)

    def test_actual_mcp_file_readback_source_binding_and_factory_cover_injected_rootfs(self):
        self.install_modules()
        report = self.prepare()
        output = self.fx.root / 'mcp-new'
        expected = canonical(MCP) + b'\n'
        self.assertEqual(profile._cat(output / 'rootfs.ext4', profile.MCP_PATH), expected)
        self.assertEqual(profile._metadata(output / 'rootfs.ext4', profile.MCP_PATH),
                         {'type': 'regular', 'mode': 0o444, 'uid': 0, 'gid': 0, 'links': 1})
        self.assertEqual((output / 'mcp-services.json').read_bytes(), expected)
        self.assertEqual(stat.S_IMODE((output / 'mcp-services.json').stat().st_mode), 0o444)
        self.assertEqual(report['mcp_configuration_sha256'], profile.digest(output / 'mcp-services.json'))
        self.assertEqual(len(report['injected_files']), 6)
        self.assertEqual(set(report['source_sha256']), set(profile.SOURCE_BINDINGS.values()) |
                         set(profile.MCP_SOURCE_BINDINGS.values()))
        for relative in profile.MCP_SOURCE_BINDINGS.values():
            self.assertEqual(report['source_sha256'][relative], profile.digest(profile.ROOT / relative))
        _, update = profile._update_helpers()
        readback = profile._stage0(output / 'stage0.cpio.gz')
        factory = update.verify_envelope(update.decode(readback['factory'], 8192))
        self.assertEqual(factory['sha256'], profile.digest(output / 'rootfs.ext4'))
        self.assertEqual(factory['size'], (output / 'rootfs.ext4').stat().st_size)
        self.assertEqual(self.fx.hashes, {name: profile.digest(self.fx.base / name) for name in profile.IMAGE_NAMES})
        self.assertFalse(report['boot_verified']); self.assertFalse(report['provider_connected'])

    def test_missing_mcp_modules_refused_when_enabled_but_legacy_none_still_works(self):
        with self.assertRaisesRegex(ValueError, 'parent directory'): self.prepare()
        self.assertFalse((self.fx.root / 'mcp-new').exists())
        report = self.fx.prepare()
        self.assertNotIn('mcp_configuration_path', report)
        self.assertEqual(len(report['injected_files']), 5)
        self.assertEqual(set(report['source_sha256']), set(profile.SOURCE_BINDINGS.values()))

    def test_inaccessible_or_writable_mcp_parent_refused_before_output(self):
        self.install_modules(mode='040775')
        with self.assertRaisesRegex(ValueError, 'parent directory'): self.prepare()
        self.assertFalse((self.fx.root / 'mcp-new').exists())
        image = self.fx.base / 'rootfs.ext4'; image.chmod(0o644)
        profile._debug(image, 'set_inode_field /usr/lib/rock-platform/mcp_broker mode 040700', write=True)
        self.fx.finish_base()
        with self.assertRaisesRegex(ValueError, 'parent directory'): self.prepare()
        self.assertFalse((self.fx.root / 'mcp-new').exists())

    def test_stale_mcp_source_rejected_before_output(self):
        self.install_modules(contents=b'# unrelated previous device client\n')
        with self.assertRaisesRegex(ValueError, 'source/CA differs'): self.prepare()
        self.assertFalse((self.fx.root / 'mcp-new').exists())

    def test_none_rejects_retained_mcp_config_in_otherwise_unconfigured_base(self):
        image = self.fx.base / 'rootfs.ext4'; image.chmod(0o644)
        (self.fx.root / 'retained-mcp').write_bytes(canonical(MCP) + b'\n')
        profile._debug(image, 'write retained-mcp ' + profile.MCP_PATH, cwd=self.fx.root, write=True)
        for field, value in (('mode', '0100444'), ('uid', '0'), ('gid', '0')):
            profile._debug(image, 'set_inode_field ' + profile.MCP_PATH + ' ' + field + ' ' + value, write=True)
        self.fx.finish_base()
        with self.assertRaisesRegex(ValueError, 'MCP profile must be unconfigured'):
            profile.prepare_profile(self.fx.base, self.fx.root / 'none-new',
                expected_sha256=self.fx.hashes, mcp_configuration=None, **legacy.configuration())
        self.assertFalse((self.fx.root / 'none-new').exists())
        self.assertEqual(self.fx.hashes, {name: profile.digest(self.fx.base / name) for name in profile.IMAGE_NAMES})


if __name__ == '__main__':
    unittest.main()

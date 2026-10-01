"""Optional supervised MCP joins at desktop v5's read-only image boundary.

Uses synthetic rootfs bytes and a real public-fixture signed stage0. Image
config reads and the existing protected supervisor reader are explicit seams;
no ext4, QEMU, backend process, or actual restoration is claimed here.
"""
import copy
import hashlib
import json
from pathlib import Path
import unittest
from unittest.mock import patch

import test_desktop_stage0 as legacy
from service_access import profile, serve


MCP = {'schema': 'rock-mcp-hub-device/1', 'gateway_origin': 'https://10.0.2.2:9746'}
SUPERVISOR = {'registry_port': 9743, 'runner_port': 9744, 'wallet_port': 9745,
              'mcp': {'schema': 'rock-mcp-owned-runtime/1', 'gateway_port': 9746,
                      'provider_port': 9747, 'consumer_id': 'alice-a', 'alias': 'memo'}}


class MCPDesktopProfileTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        legacy.Stage0Desktop.setUpClass()

    def setUp(self):
        # Compose fixture construction without inheriting/repeating its tests.
        self.fx = legacy.Stage0Desktop(methodName='runTest')
        self.addCleanup(self.cleanup_fixture)
        self.fx.setUp()
        self.mcp_raw = profile.canonical(MCP) + b'\n'
        self.reads = []
        self.fx.read.stop()
        reader = patch.object(profile, '_cat', side_effect=self.image_cat)
        reader.start(); self.addCleanup(reader.stop)
        self.fx.report['mcp_configuration_sha256'] = hashlib.sha256(self.mcp_raw).hexdigest()
        self.fx.report['mcp_configuration_path'] = str(self.fx.images/'mcp-services.json')
        self.fx.pin_report()
        self.before = {name: legacy.guest.digest(self.fx.images/name)
                       for name in (*profile.IMAGE_NAMES, 'profile.json')}

    def cleanup_fixture(self):
        self.assertTrue(self.fx.doCleanups(), 'composed image fixture cleanup failed')

    def image_cat(self, image, path):
        self.assertEqual(image, self.fx.images/'rootfs.ext4')
        self.reads.append(path)
        if path == profile.MCP_PATH:
            if self.mcp_raw is None:
                raise ValueError('required embedded MCP file missing')
            return self.mcp_raw
        if path == profile.TOKEN_PATH:
            return legacy.PUBLIC_TOKENS['alice'].encode() + b'\n'
        return json.dumps({profile.SERVICE_PATH: self.fx.service,
                           profile.WALLET_PATH: self.fx.wallet,
                           profile.AUTH_PATH: self.fx.auth}[path]).encode()

    def supervisor(self, value=None):
        # The protected reader's strict schema/file checks have their own tests.
        # Here pin its actual arguments and test its result against signed images.
        Path(self.fx.config['services']['config']).write_text('protected reader fixture')
        return patch.object(serve, 'load', return_value=copy.deepcopy(SUPERVISOR if value is None else value))

    def assert_no_device_write(self):
        self.assertFalse(self.fx.base.exists())
        self.assertEqual(self.before, {name: legacy.guest.digest(self.fx.images/name) for name in self.before})

    def test_matching_optional_gateway_joins_profile_before_standard_stage0_command(self):
        config = copy.deepcopy(self.fx.config)
        with self.supervisor() as load:
            legacy.guest.validate_config(config)
        load.assert_called_once_with(Path(config['services']['config']),
                                     config['services']['sha256'], config['services']['authority_id'])
        self.assertIn(profile.MCP_PATH, self.reads)
        self.assertEqual(config, self.fx.config)
        args = legacy.guest.command(config, self.fx.root/'state', self.fx.root/'session')
        self.assertEqual(args[args.index('-initrd')+1], str(self.fx.images/'stage0.cpio.gz'))
        self.assertTrue(any(value.startswith('user,') for value in args))
        self.assertFalse(any('hostfwd=' in value for value in args))
        self.assert_no_device_write()

    def test_different_supervised_gateway_is_rejected_before_device_state(self):
        backend = copy.deepcopy(SUPERVISOR); backend['mcp']['gateway_port'] = 9846
        with self.supervisor(backend), self.assertRaisesRegex(ValueError, 'MCP backend endpoint/profile'):
            legacy.guest.validate_config(self.fx.config)
        self.assert_no_device_write()

    def test_different_supervisor_consumer_cannot_reuse_image_scope(self):
        backend = copy.deepcopy(SUPERVISOR); backend['mcp']['consumer_id'] = 'alice-b'
        with self.supervisor(backend), self.assertRaisesRegex(ValueError, 'MCP backend endpoint/profile'):
            legacy.guest.validate_config(self.fx.config)
        self.assert_no_device_write()

    def test_enabled_supervisor_requires_embedded_gateway_configuration(self):
        self.mcp_raw = None
        with self.supervisor(), self.assertRaisesRegex(ValueError, 'embedded MCP file missing'):
            legacy.guest.validate_config(self.fx.config)
        self.assert_no_device_write()

    def test_embedded_schema_origin_limits_and_duplicate_keys_fail_closed(self):
        malformed = [None, [], {**MCP, 'schema': 'rock-mcp-hub-device/2'},
                     {**MCP, 'gateway_origin': 'https://10.0.2.2:9743'},
                     {**MCP, 'gateway_origin': 'https://example.invalid:9746'},
                     {**MCP, 'gateway_origin': 'https://10.0.2.2:9746/'},
                     {**MCP, 'token': 'PUBLIC-FIXTURE-NOT-AN-IMAGE-FIELD'}]
        raw_values = [json.dumps(value).encode() for value in malformed]
        raw_values += [b'{"schema":"rock-mcp-hub-device/1","schema":"rock-mcp-hub-device/1",'
                       b'"gateway_origin":"https://10.0.2.2:9746"}', b' '*16385]
        with self.supervisor():
            for raw in raw_values:
                self.mcp_raw = raw
                with self.subTest(raw=raw[:100]), self.assertRaises((ValueError, self.fx.update.UpdateError)):
                    legacy.guest.validate_config(self.fx.config)
        self.assert_no_device_write()

    def test_profile_report_must_pin_exact_gateway_file_bytes(self):
        # Valid semantically equivalent JSON is still a different image record.
        self.mcp_raw = json.dumps(MCP, indent=2).encode() + b'\n'
        with self.supervisor(), self.assertRaisesRegex(ValueError, 'MCP profile configuration digest'):
            legacy.guest.validate_config(self.fx.config)
        self.assert_no_device_write()

    def test_enabled_supervisor_cannot_use_profile_without_mcp_digest(self):
        del self.fx.report['mcp_configuration_sha256']; self.fx.pin_report()
        self.before['profile.json'] = legacy.guest.digest(self.fx.images/'profile.json')
        with self.supervisor(), self.assertRaisesRegex(ValueError, 'MCP profile configuration digest'):
            legacy.guest.validate_config(self.fx.config)
        self.assert_no_device_write()

    def test_missing_supervisor_allows_offline_local_boot_without_gateway_inspection(self):
        self.mcp_raw = None
        for network in ('closed-services', 'none'):
            with self.subTest(network=network), patch.object(serve, 'load') as load:
                legacy.guest.validate_config({**self.fx.config, 'network': network})
            load.assert_not_called()
        self.assertNotIn(profile.MCP_PATH, self.reads)
        self.assert_no_device_write()

    def test_legacy_supervisor_does_not_invent_optional_mcp_requirement(self):
        backend = {key: value for key, value in SUPERVISOR.items() if key != 'mcp'}
        self.mcp_raw = None
        with self.supervisor(backend):
            legacy.guest.validate_config(self.fx.config)
        self.assertNotIn(profile.MCP_PATH, self.reads)
        self.assert_no_device_write()

    def test_offline_network_mode_does_not_ignore_present_config_mismatch(self):
        backend = copy.deepcopy(SUPERVISOR); backend['mcp']['gateway_port'] = 9846
        with self.supervisor(backend), self.assertRaisesRegex(ValueError, 'MCP backend endpoint/profile'):
            legacy.guest.validate_config({**self.fx.config, 'network': 'none'})
        self.assert_no_device_write()

    def test_dangling_supervisor_symlink_is_not_treated_as_absent(self):
        path = Path(self.fx.config['services']['config']); path.symlink_to(self.fx.root/'missing-target')
        with self.assertRaises((ValueError, OSError)):
            legacy.guest.validate_config(self.fx.config)
        self.assertTrue(path.is_symlink())
        self.assert_no_device_write()


if __name__ == '__main__':
    unittest.main()

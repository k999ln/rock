"""Local update health only; no remote admission, TLS or guest-boot claim."""
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'os'))
from service_access import os_client

spec = importlib.util.spec_from_file_location('purchaser_health_service', ROOT / 'os/platform/service.py')
service = importlib.util.module_from_spec(spec)
spec.loader.exec_module(service)


class PurchaserHealthTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.state = self.root / 'platform'
        self.config = self.root / 'service-access.json'
        self.value = {'schema': os_client.CONFIG_SCHEMA,
            'authority_id': '11111111-1111-4111-8111-111111111111',
            'consumer_id': 'alice-a', 'device_ref': 'fixture-rock-arm64-001',
            'token': 'PUBLIC-FIXTURE-SERVICE-ALICE-A-v1',
            'registry_origin': 'https://10.0.2.2:9743',
            'runner_origin': 'https://10.0.2.2:9744', 'runner_endpoint_id': 'runner-closed-cloud'}

    def configure(self, value=None):
        self.config.write_text(json.dumps(self.value if value is None else value))
        self.config.chmod(0o444)
        return os_client.resolve(self.state, self.config)

    def platform(self, profile):
        result = service.Platform(self.state, ROOT / 'examples/registry', service_status=profile.status)
        # Verify real public package signatures before mocking only the Linux
        # sandbox boundary, since both paths use Python's subprocess module.
        result.catalog()
        return result

    @staticmethod
    def sandbox():
        return [subprocess.CompletedProcess([], 0, b'{"ok":true}', b''),
                subprocess.CompletedProcess([], 0, b'{"text":"Rock"}', b'')]

    def test_missing_config_and_required_marker_deny_mark_good_but_keep_local_state(self):
        profile = self.configure()
        first = self.platform(profile)
        package = first.catalog()[0][0]['package']
        installed = first.hub.install(package)
        first.hub.enable(installed['id'], installed['hash'])
        before = first.hub.state()
        marker = (self.state / os_client.MARKER).read_bytes()
        self.config.unlink()  # Both image markers absent, persistent binding remains.
        bad = self.platform(os_client.resolve(self.state, self.config))
        with patch.object(service.subprocess, 'run') as process:
            with self.assertRaisesRegex(ValueError, 'retained binding'):
                bad.verify_readiness()
            process.assert_not_called()
        with patch.object(service, 'call', side_effect=OSError('backend offline')):
            snapshot = bad.dispatch({'v': 1, 'op': 'snapshot'})['snapshot']
        self.assertEqual(snapshot['service_access']['mode'], 'purchaser-fixture')
        self.assertEqual(snapshot['service_access']['state'], 'unavailable')
        self.assertEqual([item['id'] for item in snapshot['hub']['installed']],
                         [item['id'] for item in before['installed']])
        self.assertEqual(bad.hub.state(), before)
        self.assertEqual((self.state / os_client.MARKER).read_bytes(), marker)

    def test_changed_authority_owner_device_and_origin_deny_health_without_rebinding(self):
        self.configure()
        marker = (self.state / os_client.MARKER).read_bytes()
        for field, value in [('authority_id', '22222222-2222-4222-8222-222222222222'),
                             ('consumer_id', 'bob'), ('device_ref', 'fixture-other-device'),
                             ('registry_origin', 'https://10.0.2.2:9746')]:
            with self.subTest(field=field):
                self.config.chmod(0o600)
                bad = self.platform(self.configure({**self.value, field: value}))
                with self.assertRaisesRegex(ValueError, 'configuration'):
                    bad.verify_readiness()
                self.assertEqual((self.state / os_client.MARKER).read_bytes(), marker)

    def test_malformed_new_required_profile_is_not_healthy(self):
        self.config.with_suffix('.required').write_text('rock-purchaser-services-device/1\n')
        bad = self.platform(os_client.resolve(self.state, self.config))
        with self.assertRaisesRegex(ValueError, 'configuration'):
            bad.verify_readiness()
        self.assertFalse(os_client.resolve(self.state, self.config).legacy_development)

    def test_local_valid_closed_profile_health_needs_neither_network_nor_payment(self):
        good = self.platform(self.configure())
        # No Registry/Runner clients and no Wallet snapshot are consulted by the
        # local readiness check. The separate Wallet IPC health is a daemon check.
        with patch.object(service, 'call', side_effect=AssertionError('network/Wallet snapshot not allowed')) as call, \
             patch.object(service.subprocess, 'run', side_effect=self.sandbox()):
            self.assertTrue(good.verify_readiness()['ready'])
            call.assert_not_called()
        self.assertEqual(good.hub.state()['installed'], [])

    def test_local_sdk_profile_remains_healthy(self):
        legacy = self.platform(os_client.resolve(self.state, self.config))
        with patch.object(service.subprocess, 'run', side_effect=self.sandbox()):
            self.assertTrue(legacy.verify_readiness()['ready'])

    def test_actual_remote_wallet_health_has_no_network_or_paid_requirement(self):
        from wallet_backend.client import RemoteWalletService
        class OfflineTransport:
            fingerprint = 'public-offline-authority-fixture'
            def exchange(self, request):
                raise AssertionError('health must not contact the authority')
        wallet = RemoteWalletService(self.root / 'wallet-cache', OfflineTransport())
        self.addCleanup(wallet.close)
        good = self.platform(self.configure())
        def local_health(path, request, uid):
            self.assertEqual((path, request, uid),
                (good.wallet_socket, {'v': 1, 'op': 'health'}, service.WALLET_UID))
            return wallet.dispatch(request, peer_uid=service.PLATFORM_UID)
        with patch.object(service, 'call', side_effect=local_health), \
             patch.object(service.subprocess, 'run', side_effect=self.sandbox()):
            self.assertTrue(good.dispatch({'v': 1, 'op': 'health'})['result']['ready'])

    def test_cached_sandbox_success_cannot_bypass_unavailable_or_unknown_profile(self):
        good = self.platform(self.configure())
        with patch.object(service.subprocess, 'run', side_effect=self.sandbox()):
            self.assertTrue(good.verify_readiness()['ready'])
        for status in ({'mode': 'purchaser-fixture', 'state': 'unavailable'},
                       {'mode': 'unknown', 'state': 'configured'}, {}):
            with self.subTest(status=status):
                good.service_status = status
                with self.assertRaisesRegex(ValueError, 'configuration'):
                    good.verify_readiness()

    def test_restored_exact_configuration_allows_a_new_boot_without_changing_binding(self):
        self.configure()
        before = (self.state / os_client.MARKER).read_bytes()
        self.config.unlink()
        with self.assertRaises(ValueError):
            self.platform(os_client.resolve(self.state, self.config)).verify_readiness()
        restored = self.platform(self.configure())
        with patch.object(service.subprocess, 'run', side_effect=self.sandbox()):
            self.assertTrue(restored.verify_readiness()['ready'])
        self.assertEqual((self.state / os_client.MARKER).read_bytes(), before)


if __name__ == '__main__':
    unittest.main()

import importlib.util
import json
from pathlib import Path
import shutil
import sys
import tempfile
from types import SimpleNamespace
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[1]
REPOSITORY = ROOT.parents[1]
sys.path.insert(0, str(ROOT / 'src'))

from blackberryrock.sky_services import SkyServiceError, SkyServiceManager


CATALOG = ROOT / 'os/sky-services/catalog.json'
BUNDLE = REPOSITORY / 'public/toolkits/rockstar-ledger.zip'
SERVICE = json.loads(CATALOG.read_text(encoding='utf-8'))['services'][0]

spec = importlib.util.spec_from_file_location('rock_os_service_sky_test', ROOT / 'os/platform/service.py')
platform_service = importlib.util.module_from_spec(spec)
spec.loader.exec_module(platform_service)


class FakeProcess:
    def __init__(self):
        self.returncode = None

    def poll(self):
        return self.returncode

    def terminate(self):
        self.returncode = 0

    def kill(self):
        self.returncode = -9

    def wait(self, timeout=None):
        return self.returncode


class TestManager(SkyServiceManager):
    def _start(self, service, install_path):
        (self.data / service['id']).mkdir(parents=True, exist_ok=True)
        self.processes[service['id']] = FakeProcess()


class SkyServiceManagerTests(unittest.TestCase):
    def manager(self, temp):
        bundle_root = Path(temp) / 'bundles'
        bundle_root.mkdir()
        shutil.copy2(BUNDLE, bundle_root / 'rockstar-ledger.zip')
        return TestManager(Path(temp) / 'state', CATALOG, bundle_root)

    def test_reviewed_bundle_installs_preflights_and_preserves_data_on_uninstall(self):
        with tempfile.TemporaryDirectory() as temp:
            manager = self.manager(temp)
            key = 'install-test-key'
            result = manager.activate('rockstar-ledger', SERVICE['sha256'], key)
            self.assertEqual('running', result['state'])
            self.assertEqual('connected_pc', result['execution']['active_host'])
            self.assertEqual('none', result['execution']['cloud_dependency'])
            self.assertEqual('optional_client', result['execution']['codex_role'])
            self.assertTrue({'ledger_summary', 'subscription_coverage'}.issubset(result['mcp_tools']))
            self.assertEqual(result, manager.activate('rockstar-ledger', SERVICE['sha256'], key))
            with self.assertRaisesRegex(SkyServiceError, 'idempotency'):
                manager.lifecycle('rockstar-ledger', 'stop', key)
            stopped = manager.lifecycle('rockstar-ledger', 'stop', 'stop-test-key')
            self.assertEqual('stopped', stopped['state'])
            removed = manager.lifecycle('rockstar-ledger', 'uninstall', 'remove-test-key')
            self.assertEqual('not_installed', removed['state'])
            self.assertTrue(removed['data_preserved'])
            self.assertTrue((Path(temp) / 'state/data/rockstar-ledger').is_dir())

    def test_runtime_host_is_reported_and_unknown_hosts_are_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            manager = self.manager(temp)
            self.assertEqual('connected_pc', manager.snapshot()['active_host'])
            with self.assertRaisesRegex(SkyServiceError, 'runtime host'):
                TestManager(Path(temp) / 'invalid', CATALOG, Path(temp) / 'bundles',
                            runtime_host='provider_cloud')

    def test_wrong_digest_and_zip_path_escape_are_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            manager = self.manager(temp)
            with self.assertRaisesRegex(SkyServiceError, 'approval'):
                manager.activate('rockstar-ledger', '0' * 64, 'wrong-digest-key')
            malicious = Path(temp) / 'escape.zip'
            with zipfile.ZipFile(malicious, 'w') as archive:
                archive.writestr('../outside', b'bad')
            destination = Path(temp) / 'expanded'
            destination.mkdir()
            with self.assertRaisesRegex(SkyServiceError, 'inside'):
                manager._extract(malicious, destination, SERVICE)
            self.assertFalse((Path(temp) / 'outside').exists())

    def test_installed_file_tampering_is_rejected_before_restart(self):
        with tempfile.TemporaryDirectory() as temp:
            manager = self.manager(temp)
            manager.activate('rockstar-ledger', SERVICE['sha256'], 'initial-install-key')
            manager.lifecycle('rockstar-ledger', 'stop', 'initial-stop-key')
            script = Path(temp) / 'state/packages/rockstar-ledger/0.2.0/scripts/mcp_server.py'
            script.write_text(script.read_text() + '\n# changed after review\n')
            with self.assertRaisesRegex(SkyServiceError, 'changed after review'):
                manager.activate('rockstar-ledger', SERVICE['sha256'], 'tampered-restart-key')

    def test_os_owner_channel_is_required_for_service_management(self):
        fake = SimpleNamespace(
            snapshot=lambda: {'configured': True},
            activate=lambda service_id, digest, key: {'id': service_id, 'state': 'running'},
            lifecycle=lambda service_id, action, key: {'id': service_id, 'state': action},
            close=lambda: None,
        )
        with tempfile.TemporaryDirectory() as temp:
            platform = platform_service.Platform(
                temp,
                ROOT / 'examples/registry',
                sky_services=fake,
            )
            request = {'v': 1, 'op': 'sky.service.status'}
            with self.assertRaises(PermissionError):
                platform.dispatch(request, peer_uid=platform_service.PLATFORM_UID)
            self.assertTrue(
                platform.dispatch(request, peer_uid=platform_service.UI_UID)['result']['configured']
            )
            with self.assertRaisesRegex(ValueError, 'version'):
                platform.dispatch({'v': 2, 'op': 'sky.service.status'}, peer_uid=platform_service.UI_UID)


if __name__ == '__main__':
    unittest.main()

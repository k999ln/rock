import copy
from contextlib import nullcontext
import importlib.util
import json
from pathlib import Path
import tempfile
import time
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('rock_registry_service_test', ROOT / 'os/platform/service.py')
service = importlib.util.module_from_spec(spec)
spec.loader.exec_module(service)


class FakeRegistry:
    """Only orchestration is simulated here; registry TLS has its own real tests."""
    def __init__(self):
        self.package = json.loads((ROOT / 'examples/registry/org.rockstar.proposal-draft--1.0.0.rock.json').read_bytes())
        manifest, sha = service.verify_package(self.package, {service.TEST_PUBLISHER: service.PUBLIC_TEST_KEY})
        self.entry = {'manifest': manifest, 'hash': sha, 'size': len(service.canonical(self.package)),
                      'filename': sha + '.rock.json', 'source': 'registry'}
        self.revoked, self.refreshes, self.downloads = [], 0, 0
        self.fresh, self.has_index = True, True
        self.error, self.after_commit_crash = None, False

    def refresh(self, *, commit_guard=None):
        self.refreshes += 1
        if self.error:
            raise ValueError(self.error)
        with (commit_guard or nullcontext)():
            if self.after_commit_crash:
                self.revoked = [self.entry['manifest']['publisher']]
                raise SystemExit('injected crash after verified index commit')
        return {'revision': self.refreshes}

    def revocations(self):
        return list(self.revoked)

    def catalog(self):
        manifest = self.entry['manifest']
        return [] if not self.has_index or manifest['publisher'] in self.revoked else [copy.deepcopy(self.entry)]

    def verified_state(self):
        return {'revision': self.refreshes, 'issued_at': 1, 'expires_at': 2, 'fresh': self.fresh,
                'revocations': self.revoked} if self.has_index else None

    def download(self, tool_id, version):
        self.downloads += 1
        if not self.fresh:
            raise ValueError('signed index expired')
        if self.entry['manifest']['publisher'] in self.revoked:
            raise ValueError('publisher revoked')
        return copy.deepcopy(self.package)


class RegistryControlTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.state = Path(self.directory.name)
        self.embedded = self.state / 'embedded'
        self.embedded.mkdir()
        self.client = FakeRegistry()
        self.platform = service.Platform(self.state, self.embedded, remote_registry=self.client, start_registry=False)
        self.starters = []
        self.stop_start(self.platform)

    def stop_start(self, platform):
        starter = patch.object(platform.store, 'start')
        starter.start()
        self.starters.append(starter)

    def tearDown(self):
        self.platform.store.close()
        for starter in self.starters:
            starter.stop()
        self.directory.cleanup()

    def dispatch(self, op, key, **fields):
        return self.platform.dispatch({'v': 1, 'op': op, 'key': key, **fields})['result']

    def test_lost_refresh_response_has_one_durable_queue_and_receipt(self):
        first = self.dispatch('registry.refresh', 'refresh-once')
        self.assertEqual(first, self.dispatch('registry.refresh', 'refresh-once'))
        with self.platform.hub.connect() as c:
            self.assertEqual(1, c.execute('SELECT COUNT(*) FROM rock_registry_requests').fetchone()[0])
            self.assertEqual(1, c.execute('SELECT COUNT(*) FROM hub_requests').fetchone()[0])
        with self.assertRaisesRegex(ValueError, 'already in progress'):
            self.dispatch('registry.refresh', 'second-refresh')
        self.assertTrue(self.platform.store.process_one())
        self.assertFalse(self.platform.store.process_one())
        self.assertEqual(1, self.client.refreshes)
        self.assertEqual('ready', self.platform.store.snapshot()['status'])
        self.assertEqual(first, self.dispatch('registry.refresh', 'refresh-once'))

    def test_interrupted_refresh_is_recovered_on_restart(self):
        self.dispatch('registry.refresh', 'interrupted-refresh')
        with self.platform.hub.connect() as c:
            c.execute("UPDATE rock_registry_requests SET status='running'")
        restarted = service.RegistryControl(self.platform.hub, self.client, start=False)
        self.assertEqual('refreshing', restarted.snapshot()['status'])
        self.assertTrue(restarted.process_one())
        self.assertEqual('ready', restarted.snapshot()['status'])
        self.assertEqual(1, self.client.refreshes)

    def test_refresh_failure_retains_catalog_and_has_retryable_new_operation(self):
        expected = self.platform.available_catalog()[0]
        self.client.error = 'connection interrupted'
        self.dispatch('registry.refresh', 'network-failure')
        self.platform.store.process_one()
        snapshot = self.platform.store.snapshot()
        self.assertEqual('error', snapshot['status'])
        self.assertIn('interrupted', snapshot['last_error'])
        self.assertTrue(snapshot['can_refresh'])
        self.assertEqual(expected, self.platform.available_catalog()[0])
        self.client.error = None
        self.dispatch('registry.refresh', 'network-recovered')
        self.platform.store.process_one()
        self.assertEqual('ready', self.platform.store.snapshot()['status'])

    def test_crash_between_index_and_hub_commit_replays_revocations_at_startup(self):
        manifest = self.client.entry['manifest']
        installed = self.dispatch('install', 'new-tool', id=manifest['id'], version=manifest['version'])
        self.dispatch('approve', 'enable-tool', id=manifest['id'], approved_hash=installed['hash'])
        self.client.after_commit_crash = True
        self.dispatch('registry.refresh', 'revoke-index')
        with self.assertRaises(SystemExit):
            self.platform.store.process_one()
        self.assertEqual(0, self.platform.hub.state()['installed'][0]['enabled'])
        service.RegistryControl(self.platform.hub, self.client, start=False)
        state = self.platform.hub.state()
        self.assertEqual(0, state['installed'][0]['enabled'])
        self.assertIn(manifest['publisher'], state['revoked'])
        with self.assertRaises(ValueError):
            self.dispatch('approve', 'enable-revoked', id=manifest['id'], approved_hash=installed['hash'])

    def test_expired_index_blocks_new_install_but_not_installed_package_or_embedded(self):
        manifest = self.client.entry['manifest']
        installed = self.dispatch('install', 'downloaded-tool', id=manifest['id'], version=manifest['version'])
        self.assertEqual(1, self.client.downloads)
        self.client.fresh = False
        with self.assertRaisesRegex(ValueError, 'expired'):
            self.dispatch('install', 'new-install-expired', id=manifest['id'], version=manifest['version'])
        # Approval and local execution eligibility use the installed signature,
        # never an online refresh or an unexpired store catalog.
        self.dispatch('approve', 'approve-offline', id=manifest['id'], approved_hash=installed['hash'])
        self.assertEqual(1, self.platform.hub.state()['installed'][0]['enabled'])
        self.assertEqual(0, self.client.refreshes)
        self.assertFalse(self.platform.store.snapshot()['fresh'])

    def test_revoked_embedded_catalog_does_not_break_integrity_readiness(self):
        platform = service.Platform(self.state / 'second', ROOT / 'examples/registry', remote_registry=self.client, start_registry=False)
        self.client.revoked = [service.TEST_PUBLISHER]
        platform.store.sync_revocations()
        embedded, rejected = platform.catalog()
        self.assertGreater(len(embedded), 0)
        self.assertEqual(0, rejected)
        self.assertEqual([], platform.available_catalog()[0])
        # Replaying the same signed revocations does not duplicate audit rows.
        before = len(platform.hub.state()['audit'])
        platform.store.sync_revocations()
        self.assertEqual(before, len(platform.hub.state()['audit']))

    def test_remote_cannot_shadow_embedded_immutable_identity(self):
        platform = service.Platform(self.state / 'third', ROOT / 'examples/registry', remote_registry=self.client, start_registry=False)
        self.client.entry['hash'] = '0' * 64
        catalog, rejected = platform.available_catalog()
        self.assertEqual(1, rejected)
        matching = next(item for item in catalog if item['manifest']['id'] == self.client.entry['manifest']['id'])
        self.assertEqual('embedded', matching['source'])
        self.assertNotEqual(self.client.entry['hash'], matching['hash'])


if __name__ == '__main__':
    unittest.main()

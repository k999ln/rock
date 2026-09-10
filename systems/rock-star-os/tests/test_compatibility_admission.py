"""Compatibility admission across real local databases and controlled transports.

One test runs the real host recipe subprocess. Remote execution uses the existing
labelled fake callback; registry HTTP is mocked. Nothing here proves TLS, actual
OS/QEMU execution, physical USB, or external publication.
"""
from contextlib import closing
import hashlib
import importlib.util
import json
from pathlib import Path
import sqlite3
import sys
import tempfile
import unittest
from unittest.mock import Mock, patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'os'))

from blackberryrock.hub import Hub
from blackberryrock.packages import (
    CURRENT_PROFILE, PackageCompatibilityError, PUBLIC_TEST_KEY, TEST_PUBLISHER,
    canonical, digest, verify_package,
)
from blackberryrock.sdk import sign_development, starter
from registry import client as registry_client
from registry.common import REGISTRY_ID, sign_index
from runner.client import RunnerClient, consent_for
from runner.protocol import PUBLIC_ALICE_TOKEN, sign_request, verify_response
from runner.store import RunnerStore
from test_hub import fixture, wait_for
from test_os_runner_control import FakeExecutor, RunnerControl, Transport
from test_sdk_compatibility import remote_source

spec = importlib.util.spec_from_file_location('compatibility_platform_test', ROOT / 'os/platform/service.py')
platform_service = importlib.util.module_from_spec(spec)
spec.loader.exec_module(platform_service)

TRUST = {TEST_PUBLISHER: PUBLIC_TEST_KEY}
FUTURE_REQUIREMENTS = [('min_os_version', '999.0.0', 'os_too_old'),
                       ('min_runtime_version', '99.0.0', 'runtime_too_old')]


def signed_tool(*, requirement=None, remote=False, version='1.0.0'):
    source = remote_source() if remote else starter(tool_id='org.rockstar.admission-local')
    source['manifest']['version'] = version
    if requirement is not None:
        field, value, _ = requirement
        source['manifest']['compatibility'][field] = value
    return sign_development(source)


def database_state(path):
    """Observe complete logical state and original database bytes read-only."""
    with closing(sqlite3.connect('file:' + str(path) + '?mode=ro', uri=True)) as db:
        db.execute('PRAGMA query_only=ON')
        logical = tuple(db.iterdump())
    return logical, hashlib.sha256(Path(path).read_bytes()).hexdigest()


def file_contents(root):
    return {str(path.relative_to(root)): path.read_bytes()
            for path in sorted(root.rglob('*')) if path.is_file()}


def seed_cached_package(hub, package, *, installed=False, enabled=False):
    """Controlled test-only setup models a retained cache from another profile."""
    manifest, package_hash = verify_package(package, TRUST)
    with hub.connect() as db:
        db.execute('INSERT INTO hub_packages VALUES(?,?,?,?)',
                   (manifest['id'], manifest['version'], package_hash, canonical(package).decode()))
        if installed:
            db.execute('INSERT OR REPLACE INTO hub_installed VALUES(?,?,?)',
                       (manifest['id'], manifest['version'], int(enabled)))
    return manifest, package_hash


class CompatibilityAdmissionTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='rock-compatibility-admission-')
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.hub = Hub(self.root / 'hub.db', TRUST)
        self.addCleanup(self.stop_host_jobs)

    def stop_host_jobs(self):
        for job in self.hub.state()['jobs']:
            if job['status'] in ('running', 'cancel_requested'):
                self.hub.cancel(job['id'])
        wait_for(lambda: not self.hub.processes)

    def assert_compatibility_rejection(self, operation, reason):
        with self.assertRaises(PackageCompatibilityError) as caught:
            operation()
        self.assertEqual([reason], caught.exception.status['reasons'])

    def make_registry(self, packages, directory='registry-cache'):
        now = 1788856800
        entries = []
        bodies = {}
        for package in packages:
            manifest, package_hash = verify_package(package, TRUST)
            raw = canonical(package)
            entries.append({'manifest': manifest, 'hash': package_hash, 'size': len(raw),
                            'filename': f"{manifest['id']}--{manifest['version']}.rock.json", 'source': 'registry'})
            bodies['/packages/' + package_hash + '.rock.json'] = raw
        index = sign_index({'schema_version': 1, 'registry_id': REGISTRY_ID, 'revision': 1,
                            'issued_at': now - 1, 'expires_at': now + 3600,
                            'packages': entries, 'revocations': []})
        bodies['/index.json'] = canonical(index)
        transport = Mock()
        transport.origin = 'https://127.0.0.1:9443'

        def response(method, path, limit, *, headers=None):
            self.assertEqual('GET', method)
            self.assertIsNone(headers)  # This is the explicit open SDK fixture.
            raw = bodies[path]
            self.assertLessEqual(len(raw), limit)
            return raw

        transport.request.side_effect = response
        with patch.object(registry_client, 'HTTPSOrigin', return_value=transport):
            client = registry_client.RegistryClient(
                transport.origin, '/unused/mock-transport-ca', self.root / directory, clock=lambda: now)
        client.refresh()  # Real signed-index verification; only HTTP is mocked.
        transport.request.reset_mock()
        return client, transport

    def make_runner(self):
        executor = FakeExecutor()
        store = RunnerStore(
            self.root / 'runner', endpoint_id='compatibility-direct-fixture', target='cloud',
            transport_evidence='direct_test_fixture_not_tls',
            owners={'alice': {'token': PUBLIC_ALICE_TOKEN, 'publishers': [TEST_PUBLISHER]}},
            publisher_trust=TRUST, executor=executor, start_worker=False)
        self.addCleanup(store.close)
        transport = Transport(store)
        transport.evidence = store.transport_evidence
        client = RunnerClient(transport, endpoint_id=store.endpoint_id, owner='alice',
                              token=PUBLIC_ALICE_TOKEN, publisher_trust=TRUST, attempts=1)
        return store, client, transport, executor

    def test_current_schema_four_installs_approves_and_runs_real_host_recipe(self):
        package = signed_tool()
        self.assertEqual(4, package['manifest']['schema_version'])
        installed = self.hub.install(package)
        self.hub.enable(installed['id'], installed['hash'])
        job = self.hub.run(installed['id'], '  first  \n\n\n second  ', 'current-recipe')
        final = wait_for(lambda: (result if (result := self.hub.job(job['id']))['status'] != 'running' else None))
        self.assertEqual('succeeded', final['status'])
        self.assertEqual('first\n\nsecond', final['output'])
        self.assertEqual(installed['hash'], final['package_hash'])
        self.assertEqual('host_python', json.loads(self.hub.state()['audit'][0]['body'])['actual_host'])

    def test_future_minimum_install_preserves_enabled_version_and_every_hub_table(self):
        current = self.hub.install(signed_tool())
        self.hub.enable(current['id'], current['hash'])
        for requirement in FUTURE_REQUIREMENTS:
            with self.subTest(requirement=requirement[0]):
                package = signed_tool(requirement=requirement, version='2.0.0')
                verify_package(package, TRUST)  # Rejection must concern compatibility, not an invalid signature.
                before = database_state(self.hub.db)
                self.assert_compatibility_rejection(lambda: self.hub.install(package), requirement[2])
                self.assertEqual(before, database_state(self.hub.db))
                self.assertEqual(current['version'], self.hub.state()['installed'][0]['version'])
                self.assertTrue(self.hub.state()['installed'][0]['enabled'])

    def test_cached_future_package_cannot_be_approved_run_or_selected_by_rollback(self):
        for requirement in FUTURE_REQUIREMENTS:
            for action in ('approve', 'run', 'rollback'):
                with self.subTest(requirement=requirement[0], action=action):
                    hub = Hub(self.root / f'{requirement[0]}-{action}.db', TRUST)
                    future = signed_tool(requirement=requirement)
                    if action == 'rollback':
                        current = hub.install(signed_tool(version='2.0.0'))
                        hub.enable(current['id'], current['hash'])
                    manifest, package_hash = seed_cached_package(
                        hub, future, installed=action != 'rollback', enabled=action == 'run')
                    before = database_state(hub.db)
                    with patch.object(hub, 'worker_command', side_effect=AssertionError('must not start a worker')) as worker:
                        if action == 'approve':
                            operation = lambda: hub.enable(manifest['id'], package_hash)
                        elif action == 'run':
                            operation = lambda: hub.run(manifest['id'], 'private test text', 'never-admitted')
                        else:
                            operation = lambda: hub.lifecycle(manifest['id'], 'rollback', manifest['version'])
                        self.assert_compatibility_rejection(operation, requirement[2])
                        worker.assert_not_called()
                    self.assertEqual(before, database_state(hub.db))
                    self.assertEqual({}, hub.processes)

    def test_platform_catalog_keeps_future_and_legacy_entries_with_current_release_status(self):
        directory = self.root / 'embedded'
        directory.mkdir()
        packages = [fixture(), signed_tool(requirement=FUTURE_REQUIREMENTS[0])]
        for number, package in enumerate(packages):
            (directory / f'{number}.rock.json').write_bytes(canonical(package))
        platform = platform_service.Platform(self.root / 'platform', directory)
        items, rejected = platform.available_catalog()
        self.assertEqual(0, rejected)
        self.assertEqual(2, len(items))
        statuses = {item['manifest']['id']: item['compatibility'] for item in items}
        legacy, future = (package['manifest']['id'] for package in packages)
        self.assertTrue(statuses[legacy]['compatible'])
        self.assertFalse(statuses[legacy]['declared'])
        self.assertEqual(['os_too_old'], statuses[future]['reasons'])
        with patch.object(platform_service, 'call', side_effect=OSError('mock unavailable Wallet; no socket')):
            snapshot = platform.dispatch({'v': 1, 'op': 'snapshot'})['snapshot']
        self.assertEqual(2, snapshot['total_catalog'])
        self.assertEqual(0, snapshot['catalog_rejected'])
        self.assertEqual('0.3.0', snapshot['device']['version'])
        self.assertEqual(CURRENT_PROFILE['os_version'], snapshot['device']['version'])
        self.assertEqual(statuses, {item['manifest']['id']: item['compatibility'] for item in snapshot['catalog']})

    def test_registry_future_download_denied_before_transport_or_package_cache_read(self):
        for requirement in FUTURE_REQUIREMENTS:
            with self.subTest(requirement=requirement[0]):
                future = signed_tool(requirement=requirement)
                client, transport = self.make_registry([fixture(), future], directory=requirement[0])
                self.assertEqual(2, len(client.catalog()))
                manifest, package_hash = verify_package(future, TRUST)
                original_read = registry_client.read_regular

                def forbid_package_cache(path, limit):
                    self.assertNotEqual(client.package_dir, Path(path).parent,
                                        'compatibility must be checked before opening a cached package')
                    return original_read(path, limit)

                for already_cached in (False, True):
                    with self.subTest(already_cached=already_cached):
                        if already_cached:
                            (client.package_dir / (package_hash + '.rock.json')).write_bytes(canonical(future))
                        before = file_contents(client.cache_dir)
                        with patch.object(registry_client, 'read_regular', side_effect=forbid_package_cache):
                            self.assert_compatibility_rejection(
                                lambda: client.download(manifest['id'], manifest['version']), requirement[2])
                        transport.request.assert_not_called()
                        self.assertIsNone(client.last_download)
                        self.assertEqual(before, file_contents(client.cache_dir))

    def test_registry_current_schema_four_download_still_verifies_and_caches_mock_http_bytes(self):
        package = signed_tool()
        client, transport = self.make_registry([package])
        manifest, package_hash = verify_package(package, TRUST)
        self.assertEqual(package, client.download(manifest['id'], manifest['version']))
        self.assertEqual(canonical(package), (client.package_dir / (package_hash + '.rock.json')).read_bytes())
        self.assertFalse(client.last_download['cache_hit'])
        self.assertEqual(1, transport.request.call_count)
        transport.request.reset_mock()
        self.assertEqual(package, client.download(manifest['id'], manifest['version']))
        self.assertTrue(client.last_download['cache_hit'])
        transport.request.assert_not_called()

    def test_runner_client_rejects_signed_future_remote_before_exchange(self):
        store, client, transport, executor = self.make_runner()
        for requirement in FUTURE_REQUIREMENTS:
            with self.subTest(requirement=requirement[0]):
                package = signed_tool(requirement=requirement, remote=True)
                verify_package(package, TRUST)
                consent = consent_for(package, 'input', target='cloud', endpoint_id=store.endpoint_id, key='future-client')
                before = database_state(store.database)
                self.assert_compatibility_rejection(
                    lambda: client.submit(package, 'input', 'future-client', consent=consent), requirement[2])
                self.assertEqual([], transport.ops)
                self.assertEqual(0, executor.calls)
                self.assertEqual(before, database_state(store.database))

    def test_runner_store_independently_rejects_future_remote_from_authenticated_client(self):
        store, client, transport, executor = self.make_runner()
        for requirement in FUTURE_REQUIREMENTS:
            with self.subTest(requirement=requirement[0]):
                package = signed_tool(requirement=requirement, remote=True)
                consent = consent_for(package, 'input', target='cloud', endpoint_id=store.endpoint_id, key='future-server')
                request = client._request('submit', 'future-server', package=package, text='input', consent=consent)
                envelope = sign_request('alice', PUBLIC_ALICE_TOKEN, request)
                before = database_state(store.database)
                signed_response = store.dispatch(envelope, transport_target=store.target,
                                                  transport_evidence=store.transport_evidence)
                response = verify_response(PUBLIC_ALICE_TOKEN, request, signed_response)
                self.assertIs(response['ok'], False)
                self.assertEqual('rejected', response['code'])
                self.assertIn(requirement[1], response['error'])
                self.assertEqual(before, database_state(store.database))
                self.assertFalse(store.status('alice', 'future-server')['found'])
                self.assertEqual([], transport.ops)
                self.assertEqual(0, executor.calls)

    def test_current_remote_schema_four_is_accepted_once_through_existing_direct_test_transport(self):
        store, client, transport, executor = self.make_runner()
        package = signed_tool(remote=True)
        self.assertEqual(4, package['manifest']['schema_version'])
        consent = consent_for(package, '  hello  ', target='cloud', endpoint_id=store.endpoint_id, key='supported-remote')
        receipt = client.submit(package, '  hello  ', 'supported-remote', consent=consent)
        self.assertIs(receipt['accepted'], True)
        self.assertEqual('direct_test_fixture_not_tls', receipt['transport_evidence'])
        self.assertEqual('queued', client.status('supported-remote')['state'])
        self.assertTrue(store.tick())
        result = client.status('supported-remote')
        self.assertEqual(('succeeded', 'hello'), (result['state'], result['output']))
        self.assertEqual('fake_callback', result['execution']['kind'])
        self.assertEqual(receipt, client.submit(package, '  hello  ', 'supported-remote', consent=consent))
        self.assertFalse(store.tick())
        self.assertEqual(1, executor.calls)

    def test_runner_control_rejects_cached_future_before_preparation_or_transmission(self):
        store, client, transport, executor = self.make_runner()
        control = RunnerControl(self.hub, self.root / 'control', clients={'cloud': client}, start=False)
        self.addCleanup(control.close)
        for index, requirement in enumerate(FUTURE_REQUIREMENTS):
            with self.subTest(requirement=requirement[0]):
                package = signed_tool(requirement=requirement, remote=True, version=f'1.0.{index}')
                manifest, _ = seed_cached_package(self.hub, package, installed=True, enabled=True)
                before_hub, before_control = database_state(self.hub.db), database_state(control.database)
                self.assert_compatibility_rejection(
                    lambda: control.prepare(manifest['id'], 'cloud', 'input', 'future-control'), requirement[2])
                self.assertEqual(before_hub, database_state(self.hub.db))
                self.assertEqual(before_control, database_state(control.database))
                self.assertEqual([], transport.ops)
                self.assertEqual(0, executor.calls)


if __name__ == '__main__':
    unittest.main()

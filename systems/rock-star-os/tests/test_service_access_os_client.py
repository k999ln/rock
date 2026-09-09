import hashlib
import importlib.util
import json
import os
from contextlib import closing
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'os'))
from service_access import os_client

service_spec = importlib.util.spec_from_file_location('rock_purchaser_profile_test', ROOT / 'os/platform/service.py')
service = importlib.util.module_from_spec(service_spec)
service_spec.loader.exec_module(service)


class OSServiceProfileTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.state, self.config = self.root / 'state', self.root / 'service-access.json'
        self.value = {'schema': os_client.CONFIG_SCHEMA,
            'authority_id': 'f73cd4a8-42b3-4825-a291-8d73d3a5c08d',
            'consumer_id': 'alice-a', 'device_ref': 'fixture-rock-arm64-001',
            'token': 'PUBLIC-FIXTURE-SERVICE-ALICE-A-v1',
            'registry_origin': 'https://10.0.2.2:9743', 'runner_origin': 'https://10.0.2.2:9744',
            'runner_endpoint_id': 'runner-closed-cloud'}

    def write(self, value=None):
        self.config.write_text(json.dumps(self.value if value is None else value))
        self.config.chmod(0o600)

    def resolve(self):
        return os_client.resolve(self.state, self.config)

    def test_first_closed_binding_and_exact_restart_keep_only_hashes(self):
        self.write()
        first = self.resolve()
        self.assertFalse(first.legacy_development)
        self.assertEqual(first.status['state'], 'configured')
        marker = self.state / os_client.MARKER
        before = marker.read_bytes()
        self.assertNotIn(self.value['token'].encode(), before)
        self.assertEqual(marker.stat().st_mode & 0o777, 0o600)
        self.assertEqual(self.resolve(), first)
        self.assertEqual(marker.read_bytes(), before)

    def test_unconfigured_sdk_fixture_is_explicitly_separate(self):
        profile = self.resolve()
        self.assertTrue(profile.legacy_development)
        self.assertIsNone(profile.config)
        self.assertFalse((self.state / os_client.MARKER).exists())

    def test_missing_closed_config_disables_remote_without_deleting_data(self):
        self.write(); self.resolve()
        owned = self.state / 'personal-result.txt'
        owned.write_text('my retained result')
        self.config.unlink()
        result = self.resolve()
        self.assertFalse(result.legacy_development)
        self.assertEqual(result.status['state'], 'unavailable')
        self.assertEqual(os_client.clients(result, self.state, 'unused-ca'), (None, {}))
        self.assertEqual(owned.read_text(), 'my retained result')

    def test_malformed_first_config_latches_closed_and_can_be_recovered(self):
        self.write({'invalid': 'PUBLIC-FIXTURE-DO-NOT-ECHO'})
        self.assertEqual(self.resolve().status['state'], 'unavailable')
        self.config.unlink()
        self.assertFalse(self.resolve().legacy_development)
        self.write()
        self.assertEqual(self.resolve().status['state'], 'configured')

    def test_required_image_marker_prevents_config_loss_fallback(self):
        self.config.with_suffix('.required').write_text('purchaser profile\n')
        self.assertFalse(self.resolve().legacy_development)
        self.assertEqual(self.resolve().status['state'], 'unavailable')
        self.write()
        self.assertEqual(self.resolve().status['state'], 'configured')

    def test_rebinding_authority_device_or_credential_is_rejected(self):
        self.write(); self.resolve()
        old = (self.state / os_client.MARKER).read_bytes()
        for field, value in [('authority_id', 'ece9c337-ff47-4e2c-bc31-f9ad7d75210f'),
                             ('device_ref', 'fixture-rock-other'),
                             ('token', 'PUBLIC-FIXTURE-SERVICE-ALICE-B-v1'),
                             ('registry_origin', 'https://10.0.2.2:9746')]:
            with self.subTest(field=field):
                self.write({**self.value, field: value})
                result = self.resolve()
                self.assertEqual(result.status['state'], 'unavailable')
                self.assertIsNone(result.config)
                self.assertEqual((self.state / os_client.MARKER).read_bytes(), old)

    def test_old_open_cache_and_remote_history_are_not_adopted_or_erased(self):
        self.state.mkdir(mode=0o700)
        old = self.state / 'registry-cache' / 'verified-index.json'
        old.parent.mkdir(); old.write_text('retained earlier origin')
        before = hashlib.sha256(old.read_bytes()).hexdigest()
        self.write()
        self.assertEqual(self.resolve().status['state'], 'unavailable')
        self.assertEqual(hashlib.sha256(old.read_bytes()).hexdigest(), before)

    def test_symlink_and_writable_configuration_fail_closed(self):
        other = self.root / 'other.json'; other.write_text(json.dumps(self.value))
        self.config.symlink_to(other)
        self.assertEqual(self.resolve().status['state'], 'unavailable')
        self.config.unlink(); self.write(); self.config.chmod(0o666)
        self.assertEqual(self.resolve().status['state'], 'unavailable')
        self.config.chmod(0o600)
        self.assertEqual(self.resolve().status['state'], 'configured')

    def test_duplicate_fields_bounds_and_origin_injection_are_rejected(self):
        invalid = [json.dumps(self.value)[:-1] + ',"consumer_id":"other"}',
                   ' ' * (os_client.MAX_CONFIG + 1),
                   json.dumps({**self.value, 'registry_origin': 'https://10.0.2.2:9743/other'}),
                   json.dumps({**self.value, 'runner_origin': 'https://example.com:9744'}),
                   json.dumps({**self.value, 'token': 'PUBLIC-FIXTURE-HEADER\r\ninjection'})]
        for raw in invalid:
            self.config.write_text(raw); self.config.chmod(0o600)
            result = self.resolve()
            self.assertEqual(result.status['state'], 'unavailable')
            self.assertNotIn('injection', json.dumps(result.status))

    def test_marker_symlink_is_not_followed(self):
        self.state.mkdir(mode=0o700)
        victim = self.root / 'owned.txt'; victim.write_text('retain me')
        (self.state / os_client.MARKER).symlink_to(victim)
        self.write()
        self.assertEqual(self.resolve().status['state'], 'unavailable')
        self.assertEqual(victim.read_text(), 'retain me')

    def test_missing_profile_preserves_queued_sent_and_prepared_work_then_reconciles_same_keys(self):
        """Real Hub/queue/Runner SQLite and HMAC; in-process transport/fake work.

        This test covers configuration loss, not TLS or a guest execution claim.
        Only RunnerControl's real durable claim simulates an interrupted sender;
        no business receipt or eligibility row is fabricated by direct SQL.
        """
        from blackberryrock.packages import PUBLIC_TEST_KEY, TEST_PUBLISHER
        from runner.build_fixture import remote_fixture
        from runner.client import RunnerClient
        from runner.store import RunnerStore

        class Executor:
            calls = 0
            def execute(self, text, recipe, cancel):
                self.calls += 1
                return text.strip(), {'kind': 'fake_callback', 'actual_isolation': 'NOT_RUN'}

        class Transport:
            target = 'cloud'
            evidence = 'pinned_tls_loopback_fixture'
            timeout = 3
            def __init__(self, backend):
                self.backend, self.operations = backend, []
            def exchange(self, envelope):
                self.operations.append((envelope['request']['op'], envelope['request']['key']))
                return self.backend.dispatch(envelope, transport_target=self.target,
                                             transport_evidence=self.evidence)

        self.write()
        profile = self.resolve()
        executor = Executor()
        backend = RunnerStore(self.root / 'remote-backend', endpoint_id=self.value['runner_endpoint_id'],
            target='cloud', transport_evidence='pinned_tls_loopback_fixture',
            owners={'alice-a': {'token': self.value['token'], 'publishers': [TEST_PUBLISHER]}},
            publisher_trust={TEST_PUBLISHER: PUBLIC_TEST_KEY}, executor=executor, start_worker=False)
        self.addCleanup(backend.close)
        transport = Transport(backend)
        client = RunnerClient(transport, endpoint_id=self.value['runner_endpoint_id'],
                              owner='alice-a', token=self.value['token'], attempts=1)
        platform = service.Platform(self.state, ROOT / 'examples/registry', remote_clients={'cloud': client},
                                    start_runner=False, service_status=profile.status)
        live = [platform]
        self.addCleanup(lambda: live[0].runner.close() if live else None)

        def rows(controller):
            with closing(controller.connect()) as db:
                return {row['key']: dict(row) for row in db.execute('SELECT * FROM remote_jobs ORDER BY key')}

        package = remote_fixture()
        installed = platform.hub.install(package)
        platform.hub.enable(installed['id'], installed['hash'])
        requests, receipts = {}, {}
        for key in ('sent', 'queued', 'prepared'):
            preview = platform.dispatch({'v': 1, 'op': 'remote.prepare', 'id': installed['id'],
                'target': 'cloud', 'text': '  retained ' + key + '  ', 'key': key})['result']
            requests[key] = {'v': 1, 'op': 'remote.submit', 'key': key, 'consent': preview['consent']}
            if key != 'prepared':
                receipts[key] = platform.dispatch(requests[key])
            if key == 'sent':
                self.assertTrue(platform.runner.process_one())
                self.assertEqual('accepted', platform.runner.status(key)['state'])
                self.assertIsNotNone(platform.runner._claim(key))
        before = rows(platform.runner)
        self.assertEqual(('sending', 'queued', 'prepared'), tuple(before[key]['state'] for key in ('sent', 'queued', 'prepared')))
        network_before = list(transport.operations)
        platform.runner.close(); live.clear()

        self.config.unlink()
        missing = self.resolve()
        registry, clients = os_client.clients(missing, self.state, 'unused-ca')
        self.assertEqual((registry, clients), (None, {}))
        # Default start_runner=True must still leave a closed unavailable queue
        # dormant. Public status/history APIs must not restart it accidentally.
        unavailable = service.Platform(self.state, ROOT / 'examples/registry',
            remote_registry=registry, remote_clients=clients, service_status=missing.status)
        live.append(unavailable)
        self.assertIsNone(unavailable.runner.thread)
        for key in ('sent', 'queued', 'prepared'):
            self.assertTrue(unavailable.dispatch({'v': 1, 'op': 'remote.status', 'key': key})['ok'])
        history = unavailable.dispatch({'v': 1, 'op': 'remote.history'})['result']
        self.assertFalse(history['worker_alive'])
        self.assertEqual(3, history['total_history'])
        self.assertFalse(history['configured'])
        for key in ('sent', 'queued'):
            self.assertEqual(receipts[key], unavailable.dispatch(requests[key]))
        with self.assertRaisesRegex(ValueError, 'unavailable'):
            unavailable.dispatch(requests['prepared'])
        with self.assertRaisesRegex(ValueError, 'unavailable'):
            unavailable.dispatch({'v': 1, 'op': 'remote.prepare', 'id': installed['id'],
                'target': 'cloud', 'text': 'new unavailable input', 'key': 'new-missing'})
        with self.assertRaisesRegex(ValueError, 'unknown'):
            unavailable.dispatch({'v': 1, 'op': 'remote.retry', 'key': 'sent'})
        after = rows(unavailable.runner)
        for key in before:
            expected = dict(before[key])
            if key == 'sent':
                expected.update(state='unknown', error='OS daemon restarted after sending claim; reconcile same key', next_attempt=0)
            self.assertEqual(expected, after[key])
        self.assertIsNone(unavailable.runner.thread)
        self.assertEqual(network_before, transport.operations)
        self.assertEqual(0, executor.calls)
        unavailable.runner.close(); live.clear()

        self.write()
        restored_profile = self.resolve()
        self.assertEqual('configured', restored_profile.status['state'])
        restored = service.Platform(self.state, ROOT / 'examples/registry', remote_clients={'cloud': client},
                                    start_runner=False, service_status=restored_profile.status)
        live.append(restored)
        self.assertTrue(restored.runner.process_one())  # Same sent key: status only.
        self.assertTrue(restored.runner.process_one())  # Previously unsent queued key.
        submits = [key for op, key in transport.operations if op == 'submit']
        self.assertEqual(['sent', 'queued'], submits)
        self.assertEqual(0, executor.calls)
        with closing(backend.connect()) as db:
            self.assertEqual(2, db.execute('SELECT COUNT(*) FROM jobs').fetchone()[0])
            self.assertEqual(0, db.execute('SELECT SUM(cancel_requested) FROM jobs').fetchone()[0])
        final = rows(restored.runner)
        self.assertEqual('prepared', final['prepared']['state'])
        for key in final:
            for field in ('input_text', 'package', 'consent', 'submit_sha', 'receipt', 'cancel_requested'):
                self.assertEqual(before[key][field], final[key][field])


if __name__ == '__main__':
    unittest.main()

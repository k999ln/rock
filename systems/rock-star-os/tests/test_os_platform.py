import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch
from types import SimpleNamespace
from blackberryrock.sdk import starter

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('rock_os_service_test', ROOT / 'os/platform/service.py')
service = importlib.util.module_from_spec(spec)
spec.loader.exec_module(service)


class PlatformBoundaryTests(unittest.TestCase):
    def test_duplicate_and_nonfinite_json_are_rejected(self):
        for data in (b'{"v":1,"v":2}', b'{"amount":NaN}', b'{"amount":Infinity}'):
            with self.subTest(data=data), self.assertRaises(ValueError):
                service.decode(data)

    def test_record_budget_counts_json_escaping(self):
        records = [{'output': '\x01' * 16384}] * 32
        bounded = service.bounded_records(records, 32, 384 * 1024)
        self.assertLessEqual(len(service.canonical(bounded)), 384 * 1024)
        self.assertLess(len(bounded), len(records))

    def test_unreachable_wallet_does_not_hide_local_catalog_and_history(self):
        with tempfile.TemporaryDirectory() as temp:
            platform = service.Platform(temp, ROOT / 'examples/registry')
            for mode in ('connection', 'empty-cache'):
                kwargs = {'side_effect': OSError('backend disconnected')} if mode == 'connection' else {
                    'return_value': {'ok':False, 'code':'unavailable', 'error':'no synchronized Wallet cache'}}
                with self.subTest(mode=mode), patch.object(service, 'call', **kwargs):
                    result = platform.dispatch({'v':1, 'op':'snapshot'})['snapshot']
                    self.assertIsNone(result['wallet'])
                    self.assertGreater(len(result['catalog']), 0)
                    self.assertEqual(result['hub']['jobs'], [])

    def test_wallet_history_budget_preserves_authoritative_totals(self):
        state = {'available_minor': 4567, 'pending_minor': 100, 'ledger_balance_minor': 0}
        for name in ('sales', 'withdrawals', 'bills', 'journals'):
            state[name] = [{'id': 'x' * 2048}] * 1000
        result = service.wallet_summary(state)
        self.assertEqual(4567, result['available_minor'])
        self.assertEqual(0, result['ledger_balance_minor'])
        self.assertLess(len(service.canonical(result)), 140 * 1024)
        self.assertTrue(all(result['history_truncated'].values()))
        self.assertTrue(all(x == 1000 for x in result['record_counts'].values()))

    def test_large_history_remains_available_and_full_result_preserved(self):
        with tempfile.TemporaryDirectory() as temp:
            platform = service.Platform(temp, ROOT / 'examples/registry')
            text = '\x01' * 131072
            with platform.hub.connect() as c:
                for index in range(40):
                    c.execute('INSERT INTO hub_jobs VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
                              (f'job-{index}', f'key-{index}', 'hash', 'org.example.test', '1.0.0',
                               'succeeded', 65536, text, None, index, index + 1, 'package-hash'))
            wallet = {'available_minor': 0, 'simulation_only': True, 'sales': [], 'withdrawals': [],
                      'bills': [], 'journals': [], 'history_truncated': {}}
            with patch.object(service, 'call', return_value={'ok': True, 'snapshot': wallet}):
                result = platform.dispatch({'v': 1, 'op': 'snapshot'})
            self.assertLess(len(service.canonical(result)) + 1, service.MAX_RESPONSE)
            hub = result['snapshot']['hub']
            self.assertEqual(40, hub['total_jobs'])
            self.assertTrue(hub['jobs_truncated'])
            self.assertTrue(all(job['output_truncated'] for job in hub['jobs']))
            full = platform.dispatch({'v': 1, 'op': 'job.result', 'id': 'job-0'})
            self.assertEqual(text, full['result']['output'])
            self.assertLess(len(service.canonical(full)) + 1, service.MAX_RESPONSE)

    def test_health_rejects_failed_sandbox_even_with_valid_catalog(self):
        with tempfile.TemporaryDirectory() as temp:
            platform = service.Platform(temp, ROOT / 'examples/registry')
            with patch.object(platform, 'catalog', return_value=([{'id': 'valid'}], 0)), \
                 patch.object(service.subprocess, 'run', return_value=subprocess.CompletedProcess([], 1, b'{"ok":false}', b'')):
                with self.assertRaisesRegex(ValueError, 'sandbox'):
                    platform.verify_readiness()
                self.assertFalse(platform.readiness['ready'])

    def test_installed_catalog_jobs_and_wallet_fit_one_snapshot_together(self):
        with tempfile.TemporaryDirectory() as temp:
            platform = service.Platform(temp, ROOT / 'examples/registry')
            manifest = starter()['manifest']
            manifest['description'] = '\x01' * 1000
            long_record = {'manifest': manifest,
                           'cached_versions': ['v' * 70] * 100}
            hub = {'installed': [long_record] * 100,
                   'jobs': [{'output': '\x01' * 131072}] * 100,
                   'audit': [{'body': '\x01' * 16000}] * 100,
                   'revoked': ['x' * 200] * 128}
            wallet = service.wallet_summary({'available_minor': 888, 'simulation_only': True,
                     **{key: [{'body': '\x01' * 4096}] * 100 for key in ('sales','withdrawals','bills','journals')}})
            with patch.object(platform.hub, 'state', return_value=hub), \
                 patch.object(platform, 'available_catalog', return_value=([long_record] * 100, 0)), \
                 patch.object(service, 'call', return_value={'ok':True, 'snapshot':wallet}):
                result = platform.dispatch({'v':1, 'op':'snapshot'})
            self.assertLess(len(service.canonical(result)) + 1, service.MAX_RESPONSE)
            self.assertEqual(100, result['snapshot']['hub']['total_installed'])
            self.assertTrue(result['snapshot']['hub']['installed_truncated'])
            self.assertEqual(888, result['snapshot']['wallet']['available_minor'])

    def test_health_requires_real_roundtrip_output_after_probe(self):
        with tempfile.TemporaryDirectory() as temp:
            platform = service.Platform(temp, ROOT / 'examples/registry')
            results = [subprocess.CompletedProcess([], 0, b'{"ok":true}', b''),
                       subprocess.CompletedProcess([], 0, b'{"text":"wrong"}', b'')]
            with patch.object(platform, 'catalog', return_value=([{}], 0)), \
                 patch.object(service.subprocess, 'run', side_effect=results):
                with self.assertRaisesRegex(ValueError, 'roundtrip'):
                    platform.verify_readiness()

    def test_remote_queue_wiring_requires_explicit_consent_without_local_job_or_money(self):
        from runner.client import RunnerClient
        from runner.build_fixture import remote_fixture
        from runner.protocol import PUBLIC_ALICE_TOKEN
        transport = SimpleNamespace(target='cloud', evidence='pinned_tls_loopback_fixture', timeout=3)
        client = RunnerClient(transport, endpoint_id='runner-linux-cloud', owner='alice', token=PUBLIC_ALICE_TOKEN)
        with tempfile.TemporaryDirectory() as temp:
            platform = service.Platform(temp, ROOT / 'examples/registry', remote_clients={'cloud':client}, start_runner=False)
            try:
                package = remote_fixture()
                info = platform.hub.install(package)
                platform.hub.enable(info['id'], info['hash'])
                prepare = {'v':1, 'op':'remote.prepare', 'id':info['id'], 'target':'cloud', 'text':'user text', 'key':'platform-remote'}
                preview = platform.dispatch(prepare)['result']
                self.assertTrue(preview['prepared'])
                self.assertFalse(preview['approved'])
                self.assertEqual(platform.hub.state()['jobs'], [])
                with self.assertRaisesRegex(ValueError, 'consent'):
                    platform.dispatch({'v':1,'op':'remote.submit','key':prepare['key'],'consent':{}})
                submit = {'v':1,'op':'remote.submit','key':prepare['key'],'consent':preview['consent']}
                receipt = platform.dispatch(submit)
                self.assertFalse(receipt['result']['remote_accepted'])
                self.assertEqual(platform.dispatch(submit), receipt)
                self.assertEqual(platform.dispatch({'v':1,'op':'remote.status','key':prepare['key']})['result']['state'], 'queued')
                wallet = {'available_minor':1112, 'simulation_only':True}
                with patch.object(service, 'call', return_value={'ok':True,'snapshot':wallet}):
                    snapshot = platform.snapshot()
                self.assertEqual(snapshot['wallet']['available_minor'],1112)
                self.assertEqual(snapshot['hub']['jobs'],[])
                self.assertEqual(snapshot['hub']['modes']['cloud'],'configured_development_runner')
                self.assertEqual(snapshot['remote']['total_history'],1)
                self.assertFalse(snapshot['remote']['destinations'][1]['available'])
                self.assertLess(len(service.canonical(snapshot)),service.MAX_RESPONSE)
            finally:
                platform.runner.close()

    def test_remote_unavailable_is_not_routed_to_local_execution(self):
        with tempfile.TemporaryDirectory() as temp:
            platform = service.Platform(temp, ROOT / 'examples/registry')
            with self.assertRaisesRegex(ValueError, 'not configured'):
                platform.dispatch({'v':1,'op':'remote.submit','key':'absent','consent':{}})
            self.assertEqual(platform.hub.state()['jobs'],[])


if __name__ == '__main__':
    unittest.main()

"""Real Platform guard lifecycle and blocked egress, using fake MCP responses.

Host tests do not claim Linux peer-credential, QEMU boot or physical-device
acceptance; existing IPC and device suites independently cover those boundaries.
"""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock, patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('security_platform_test', ROOT / 'os/platform/service.py')
service = importlib.util.module_from_spec(spec)
spec.loader.exec_module(service)


class PlatformSecurityTests(unittest.TestCase):
    def platform(self, *, start=False, client=None, seed=None):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        state = Path(temporary.name) / 'platform'
        state.mkdir(mode=0o700)
        if seed:
            (state / 'draft.txt').write_text(seed, encoding='utf-8')
        platform = service.Platform(state, ROOT / 'examples/registry',
                                    mcp_client=client, start_security=start)
        self.addCleanup(platform.close)
        return platform

    def test_status_requires_real_owner_and_rejects_caller_scan_paths(self):
        platform = self.platform()
        request = {'v': 1, 'op': 'security.status'}
        for uid in (None, 0, 1001, 1002, 1003, 1004):
            with self.subTest(uid=uid), self.assertRaises(PermissionError):
                platform.dispatch(request, peer_uid=uid)
        for invalid in ({**request, 'root': '/data/wallet'},
                        {**request, 'v': True},
                        {**request, 'op': 'security.scan'},
                        {**request, 'op': 'security.disable'}):
            with self.subTest(invalid=invalid), self.assertRaises(ValueError):
                platform.dispatch(invalid, peer_uid=service.UI_UID)
        with patch.object(service, 'call') as network:
            status = platform.dispatch(request, peer_uid=service.UI_UID)
            network.assert_not_called()
        self.assertTrue(status['ok'])
        self.assertEqual('platform-data', status['result']['scope'])
        self.assertFalse(status['result']['workerAlive'])
        self.assertFalse(status['result']['fresh'])
        self.assertEqual('spider', status['result']['agent']['id'])
        self.assertEqual('security', status['result']['agent']['role'])
        self.assertEqual('platform-data', status['result']['agent']['scope'])
        self.assertEqual('starting', status['result']['agent']['state'])

    def test_mcp_prepare_and_submit_block_before_any_client_call(self):
        client = Mock()
        platform = self.platform(client=client)
        for text in ('API_KEY="synthetic-guard-fixture"', 'guard-fixture@example.test'):
            for op in ('mcp.prepare', 'mcp.submit'):
                request = {'v': 1, 'op': op, 'key': 'guard-test', 'text': text}
                if op == 'mcp.prepare':
                    request['alias'] = 'notes'
                else:
                    request['consent'] = {'approved': True, 'digest': 'a' * 64}
                with self.subTest(op=op, kind='synthetic'), self.assertRaisesRegex(ValueError, '^SENSITIVE_DATA_BLOCKED$'):
                    platform.dispatch(request, peer_uid=service.UI_UID)
        client.request.assert_not_called()
        state = platform.security.status()
        self.assertEqual(4, state['blocked'])
        self.assertEqual(4, state['inspections'])
        encoded = json.dumps(state)
        self.assertNotIn('synthetic-guard-fixture', encoded)
        self.assertNotIn('guard-fixture@example.test', encoded)

    def test_pasted_code_inspection_is_owner_only_local_and_does_not_count_as_egress(self):
        platform = self.platform()
        request = {'v': 1, 'op': 'security.inspectCode', 'source': 'eval(user_input)', 'language': 'python'}
        for uid in (None, 0, 1001, 1002, 1003):
            with self.subTest(uid=uid), self.assertRaises(PermissionError):
                platform.dispatch(request, peer_uid=uid)
        for invalid in ({**request, 'root': '/data/wallet'}, {**request, 'v': True},
                        {**request, 'language': 'ruby'}, {**request, 'source': 1},
                        {key: value for key, value in request.items() if key != 'source'}):
            with self.subTest(field_count=len(invalid)), self.assertRaisesRegex(ValueError, '^CODE_INSPECTION_INVALID_INPUT$'):
                platform.dispatch(invalid, peer_uid=service.UI_UID)
        before = platform.security.status()
        with patch.object(service, 'call', side_effect=AssertionError('network forbidden')) as network:
            result = platform.dispatch(request, peer_uid=service.UI_UID)
        network.assert_not_called()
        self.assertEqual('needs_review', result['result']['state'])
        self.assertEqual('dynamic_eval', result['result']['findings'][0]['rule'])
        self.assertEqual(before, platform.security.status())
        self.assertEqual(0, platform.security.status()['inspections'])
        self.assertEqual(0, platform.security.status()['blocked'])

    def test_safe_mcp_wire_and_exact_consent_are_preserved(self):
        client = Mock()
        client.request.return_value = {'accepted_locally': True}
        platform = self.platform(client=client)
        request = {'v': 1, 'op': 'mcp.submit', 'key': 'guard-test',
                   'text': 'Public project summary',
                   'consent': {'approved': True, 'digest': 'a' * 64}}
        with self.assertRaises(PermissionError):
            platform.dispatch(request, peer_uid=service.PLATFORM_UID)
        self.assertEqual(0, platform.security.status()['inspections'])
        result = platform.dispatch(request, peer_uid=service.UI_UID)
        self.assertEqual({'ok': True, 'result': {'accepted_locally': True}}, result)
        client.request.assert_called_once_with(request)
        self.assertEqual(0, platform.security.status()['blocked'])

    def test_mcp_metadata_cannot_hide_sensitive_material_outside_text(self):
        client = Mock()
        platform = self.platform(client=client)
        request = {'v': 1, 'op': 'mcp.prepare', 'alias': 'notes',
                   'text': 'Public input', 'key': 'ghp_' + 'A' * 36}
        with self.assertRaisesRegex(ValueError, '^SENSITIVE_DATA_BLOCKED$'):
            platform.dispatch(request, peer_uid=service.UI_UID)
        client.request.assert_not_called()
        self.assertEqual(1, platform.security.status()['blocked'])

    def test_runtime_monitor_starts_on_fixed_platform_root_and_closes(self):
        platform = self.platform(start=True, seed='API_KEY="synthetic-guard-fixture"')
        self.assertTrue(platform.security.thread.is_alive())
        state = platform.security.status()
        self.assertEqual('watching', state['status'])
        self.assertTrue(state['workerAlive'])
        self.assertTrue(state['fresh'])
        self.assertEqual(30, state['intervalSeconds'])
        self.assertEqual(1, state['candidateCount'])
        self.assertEqual('draft.txt', state['findings'][0]['path'])
        self.assertTrue(state['coverageLimited'])  # The actual Hub DB is excluded.
        self.assertNotIn('synthetic-guard-fixture', json.dumps(state))
        platform.close()
        self.assertFalse(platform.security.thread.is_alive())
        self.assertEqual('stopped', platform.security.status()['status'])
        self.assertFalse(platform.security.status()['workerAlive'])
        self.assertFalse(platform.security.status()['fresh'])

    def test_monitor_failure_does_not_bypass_synchronous_protection(self):
        client = Mock()
        platform = self.platform(client=client)
        with patch.object(platform.security, '_scan_files', side_effect=OSError('synthetic scan failure')):
            platform.security.start()
        self.assertEqual('error', platform.security.status()['status'])
        self.assertTrue(platform.security.status()['workerAlive'])
        self.assertFalse(platform.security.status()['fresh'])
        with self.assertRaisesRegex(ValueError, '^SENSITIVE_DATA_BLOCKED$'):
            platform.dispatch({'v': 1, 'op': 'mcp.prepare', 'alias': 'notes',
                               'key': 'guard-test', 'text': 'API_KEY="synthetic-guard-fixture"'},
                              peer_uid=service.UI_UID)
        client.request.assert_not_called()

    def test_snapshot_contains_only_three_sanitized_findings_and_no_network(self):
        platform = self.platform(start=True, seed='\n'.join(f'API_KEY="synthetic-fixture-{i}"' for i in range(5)))
        with patch.object(service, 'call', side_effect=OSError('wallet unavailable')):
            snapshot = platform.dispatch({'v': 1, 'op': 'snapshot'}, peer_uid=service.UI_UID)['snapshot']
        security = snapshot['security']
        self.assertEqual(5, security['candidateCount'])
        self.assertTrue(security['workerAlive'])
        self.assertTrue(security['fresh'])
        self.assertEqual(3, len(security['findings']))
        self.assertTrue(security['findingsTruncated'])
        self.assertNotIn('synthetic-fixture', json.dumps(security))
        self.assertNotIn('events', security)

    def test_snapshot_never_treats_missing_or_stale_worker_evidence_as_live(self):
        platform = self.platform()
        for report in ({'status': 'watching'},
                       {'status': 'watching', 'workerAlive': False, 'fresh': False},
                       {'status': 'watching', 'workerAlive': True, 'fresh': False},
                       {'status': 'watching', 'workerAlive': 'true', 'fresh': 1}):
            with self.subTest(report=report), patch.object(platform.security, 'status', return_value=report):
                summary = platform.security_summary()
                self.assertEqual(report.get('workerAlive') is True, summary['workerAlive'])
                self.assertFalse(summary['fresh'])

    def test_dead_worker_cannot_reuse_last_watching_scan_in_snapshot(self):
        platform = self.platform(start=True)
        self.assertTrue(platform.security_summary()['fresh'])
        with patch.object(platform.security.thread, 'is_alive', return_value=False):
            summary = platform.security_summary()
            self.assertFalse(summary['workerAlive'])
            self.assertFalse(summary['fresh'])

    def test_security_closes_even_when_another_owned_worker_cannot_close(self):
        platform = self.platform(start=True)
        platform.runner = Mock()
        platform.runner.close.side_effect = RuntimeError('synthetic runner close failure')
        with self.assertRaisesRegex(RuntimeError, 'synthetic runner close failure'):
            platform.close()
        self.assertFalse(platform.security.thread.is_alive())
        platform.runner = None

    def test_snapshot_agent_reports_actual_guard_work_without_payload(self):
        client = Mock()
        platform = self.platform(start=True, client=client, seed='API_KEY="synthetic-agent-fixture"')
        agent = platform.security_summary()['agent']
        self.assertEqual('sensitive_data_detected', agent['state'])
        self.assertEqual(['watch_platform_data', 'inspect_outbound', 'deny_sensitive_outbound', 'report_health'], agent['duties'])
        self.assertIsNone(agent['lastAction'])
        with self.assertRaisesRegex(ValueError, '^SENSITIVE_DATA_BLOCKED$'):
            platform.dispatch({'v': 1, 'op': 'mcp.prepare', 'alias': 'notes',
                               'key': 'guard-test', 'text': 'person@example.test'}, peer_uid=service.UI_UID)
        client.request.assert_not_called()
        result = platform.security_summary()['agent']
        self.assertEqual('recent_block', result['state'])
        self.assertEqual('mcp.prepare', result['lastAction']['boundary'])
        self.assertEqual(['personal'], result['lastAction']['kinds'])
        self.assertNotIn('person@example.test', json.dumps(result))
        self.assertNotIn('synthetic-agent-fixture', json.dumps(result))

    def test_snapshot_rejects_unbounded_or_unhealthy_agent_claims(self):
        platform = self.platform(start=True)
        valid = platform.security.status()
        for change in ({'id': 'another-agent'}, {'role': 'root'}, {'scope': '/data/wallet'},
                       {'state': 'protected'}, {'lastAction': {'action': 'blocked', 'boundary': 'secret-value'}}):
            report = {**valid, 'agent': {**valid['agent'], **change}}
            with self.subTest(change=change), patch.object(platform.security, 'status', return_value=report):
                result = platform.security_summary()['agent']
                self.assertEqual('spider', result['id'])
                self.assertEqual('security', result['role'])
                self.assertEqual('platform-data', result['scope'])
                self.assertNotIn('secret-value', json.dumps(result))
                self.assertIsNone(result['lastAction'])
                if 'lastAction' not in change:
                    self.assertEqual('unavailable', result['state'])
        for health in ({'workerAlive': False}, {'fresh': False}, {'fresh': 1}, {'status': 'error'}, {'status': []}):
            report = {**valid, **health, 'agent': {**valid['agent'], 'state': 'recent_block'}}
            with self.subTest(health=health), patch.object(platform.security, 'status', return_value=report):
                self.assertEqual('unavailable', platform.security_summary()['agent']['state'])

        action = {'action': 'blocked', 'boundary': 'mcp.submit', 'count': 1,
                  'kinds': ['secret'], 'time': 1234567890}
        for invalid in ({'boundary': 'private-unrecognized-boundary'}, {'count': True},
                        {'count': 2002}, {'count': 0}, {'kinds': []},
                        {'kinds': ['secret'] * 3}, {'kinds': ['private-value']},
                        {'time': float('nan')}, {'time': 10 ** 1000}, {'text': 'private-value'}):
            report = {**valid, 'agent': {**valid['agent'], 'state': 'recent_block',
                                       'lastAction': {**action, **invalid}}}
            with self.subTest(field=next(iter(invalid))), patch.object(platform.security, 'status', return_value=report):
                result = platform.security_summary()['agent']
                self.assertEqual('unavailable', result['state'])
                self.assertIsNone(result['lastAction'])
                self.assertNotIn('private-value', json.dumps(result))


if __name__ == '__main__':
    unittest.main()

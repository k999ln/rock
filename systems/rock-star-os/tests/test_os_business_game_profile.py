"""Declared schema7 observer seams; these tests never launch QEMU or a server."""
import copy
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import Mock, patch

HERE = Path(__file__).resolve().parents[1] / 'os/desktop'
sys.path.insert(0, str(HERE))
spec = importlib.util.spec_from_file_location('game_business_harness', HERE / 'verify-business.py')
harness = importlib.util.module_from_spec(spec); spec.loader.exec_module(harness)
import game_authority_observer as authority
import wallet_cache_retention as cache

AUTHORITY = '00000000-0000-4000-8000-000000000001'


def authoritative_snapshot():
    value = {'schema': authority.SCHEMA, 'authority_id': AUTHORITY, 'simulation_only': True,
        'identities': {name: 'a' * 64 for name in authority.REQUIRED_IDENTITIES},
        'databases': {'contracts/alice/' + filename: {'schema_sha256': 'b' * 64,
            'pragmas': {'application_id': 0, 'user_version': 0, 'encoding': 'UTF-8', 'auto_vacuum': 0},
            'tables': [{'name': name, 'columns_sha256': 'c' * 64, 'intrinsic_rowid': '_rowid_',
                        'row_count': 0, 'rows_sha256': 'd' * 64} for name in tables]}
            for filename, tables in authority.EMPTY_TABLES.items()}}
    for name in ('game-a', 'game-b', 'game-index'):
        value['databases'][name + '/game.sqlite3'] = {'schema_sha256': 'a' * 64,
            'tables': [{'name': 'identity', 'columns_sha256': 'b' * 64, 'intrinsic_rowid': '_rowid_',
                        'row_count': 1, 'rows_sha256': 'c' * 64}],
            'pragmas': {'application_id': 0, 'user_version': 0, 'encoding': 'UTF-8', 'auto_vacuum': 0}}
    return value


class GameBusinessProfile(unittest.TestCase):
    def profile(self):
        return harness.retention.retention_profile({'schema': 'rock-desktop-device/7'})

    def test_profile_covers_all_client_journals_and_forbids_a_second_local_wallet(self):
        profile = self.profile()
        self.assertEqual(len(profile['sources']), 8)
        self.assertEqual(profile['cache_read_sync'], cache.POLICY)
        self.assertNotIn('wallet', profile['sources']); self.assertNotIn('membership', profile['sources'])
        self.assertEqual(profile['sources']['game_exchange_cache'][0], '/wallet/game-client/exchange-journal/game.sqlite3')
        self.assertEqual(profile['sources']['game_connection_a'][0], '/wallet/game-client/connection-public-game-a/game.sqlite3')
        self.assertEqual(profile['sources']['game_connection_b'][0], '/wallet/game-client/connection-public-game-b/game.sqlite3')
        self.assertEqual(set(profile['forbidden_databases']), {'/wallet/wallet-simulator.db', '/wallet/entitlement.db'})

    def baseline(self):
        profile = self.profile()
        snapshot = {role: {'tables': {name: {'rows': int(name == 'identity')} for name in tables}}
                    for role, (_, tables) in profile['sources'].items()}
        snapshot['wallet_cache']['tables']['snapshot']['rows'] = 1
        return snapshot

    def test_baseline_requires_empty_sdk_requests_quotes_intents_proofs_and_unknown_tables(self):
        before = self.baseline()
        harness.verify_baseline(before, {}, self.profile())
        for role in ('wallet_cache', 'game_exchange_cache', 'game_connection_a', 'game_connection_b'):
            value = copy.deepcopy(before); value[role]['tables']['requests']['rows'] = 1
            with self.subTest(role=role), self.assertRaises(ValueError):
                harness.verify_baseline(value, {}, self.profile())
            value = copy.deepcopy(before); value[role]['tables']['future_game_data'] = {'rows': 1}
            with self.subTest(role=role), self.assertRaises(ValueError):
                harness.verify_baseline(value, {}, self.profile())

    def test_guest_cache_retention_cannot_complete_external_restore(self):
        config = {'schema': 'rock-desktop-device/7', 'network': 'game-authority',
                  'game': {'authority_id': AUTHORITY, 'sha256': 'a' * 64}}
        value = harness.retention.external_coverage(config, {'remote': {'tables': {'remote_jobs': {'rows': 0}}}})
        self.assertTrue(value['required']); self.assertEqual(value['status'], 'NOT_RUN')
        self.assertFalse(value['included_in_device_backup'])
        self.assertIn('wallet_authority', value['required_components'])
        self.assertIn('game_authorities', value['required_components'])
        self.assertEqual(value['authority_id'], AUTHORITY)

    def test_game_profile_does_not_hide_a_used_or_configured_external_runner(self):
        config = {'schema': 'rock-desktop-device/7', 'network': 'game-authority',
                  'game': {'authority_id': AUTHORITY, 'sha256': 'a' * 64}}
        rows = {'remote': {'tables': {'remote_jobs': {'rows': 1}}}}
        value = harness.retention.external_coverage(config, rows)
        self.assertEqual(value['status'], 'NOT_RUN')
        self.assertIn('runner', value['required_components']); self.assertIn('registry', value['required_components'])
        self.assertIn('game_authorities', value['required_components'])
        config['services'] = {'authority_id': 'separate-development-services', 'sha256': 'b' * 64}
        rows['remote']['tables']['remote_jobs']['rows'] = 0
        value = harness.retention.external_coverage(config, rows)
        self.assertIn('runner', value['required_components'])

    def test_game_cannot_use_the_local_wallet_mutation_preparation(self):
        with patch.object(harness, 'preflight') as preflight:
            with self.assertRaisesRegex(ValueError, 'separate explicit UI flow'):
                harness.run(Path('/unused'), Path('/unused'), 'soak', 'e' * 40,
                            boot_profile='game-authority-ab', prepare_backup=True)
            preflight.assert_not_called()

    def test_preflight_only_freezes_unchanged_limits_and_stopped_authority_without_writes(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary); output = root / 'evidence'; template = root / 'device.json'
            config = {'schema': 'rock-desktop-device/7', 'name': 'fixture-game', 'images': str(root),
                'network': 'game-authority', 'viewer': 'browser', 'sha256': {},
                'boot': {'mode': 'signed-stage0', 'profile': 'development-game-authority'},
                'game': {'authority_id': AUTHORITY, 'config': str(root / 'sandbox.json'), 'sha256': 'a' * 64}}
            template.write_text(json.dumps(config))
            (root / 'freeze-manifest.json').write_text('{"fixture":"provenance checked by mocked preflight"}')
            instance = Mock(); instance.input_hashes = {'sandbox_cli_sha256': 'b' * 64, 'sandbox_config_sha256': 'a' * 64}
            instance.invoke.return_value = authoritative_snapshot()
            with patch.object(harness, 'preflight', return_value=(config, output)), \
                 patch.object(harness, 'extract_packages', return_value={'1.0.0': 'c' * 64, '1.1.0': 'd' * 64}), \
                 patch.object(authority, 'Observer', return_value=instance), patch.object(harness.guest, 'start') as start:
                report = harness.run(root, root, 'soak', 'e' * 40, boot_profile='game-authority-ab',
                                     device_config=template, preflight_only=True)
            start.assert_not_called(); instance.invoke.assert_called_once_with('snapshot')
            plan = json.loads((output / 'plan.json').read_text()); original = harness.contract.plan('soak')
            for name in ('limits', 'normal_boot_shutdown_cycles', 'soak_jobs', 'soak_seconds', 'job_interval_seconds'):
                self.assertEqual(plan[name], original[name])
            self.assertEqual(plan['authority_observation']['baseline']['status'], 'EMPTY_BEFORE_UI')
            self.assertEqual(plan['business_profile']['cache_read_sync'], cache.POLICY)
            self.assertEqual(report['plan_sha256'], harness.contract.hashed(plan))
            self.assertEqual(report['D6'], 'NOT_RUN')
            self.assertNotIn('reinstall_after_delete', plan)

    def test_reinstall_is_lifecycle_only_and_cannot_change_soak(self):
        with patch.object(harness, 'preflight') as preflight:
            with self.assertRaisesRegex(ValueError, 'lifecycle-only'):
                harness.run(Path('/unused'), Path('/unused'), 'soak', 'e' * 40,
                            reinstall_after_delete=True)
            preflight.assert_not_called()

    def test_game_reinstall_plan_preserves_empty_authority_without_wallet_preparation(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary); output = root / 'evidence'; template = root / 'device.json'
            config = {'schema': 'rock-desktop-device/7', 'name': 'fixture-game', 'images': str(root),
                'network': 'game-authority', 'viewer': 'browser', 'sha256': {},
                'boot': {'mode': 'signed-stage0', 'profile': 'development-game-authority'},
                'game': {'authority_id': AUTHORITY, 'config': str(root / 'sandbox.json'), 'sha256': 'a' * 64}}
            template.write_text(json.dumps(config))
            (root / 'freeze-manifest.json').write_text('{"fixture":"provenance checked by mocked preflight"}')
            instance = Mock(); instance.input_hashes = {'sandbox_cli_sha256': 'b' * 64, 'sandbox_config_sha256': 'a' * 64}
            instance.invoke.return_value = authoritative_snapshot()
            with patch.object(harness, 'preflight', return_value=(config, output)), \
                 patch.object(harness, 'extract_packages', return_value={'1.0.0': 'c' * 64, '1.1.0': 'd' * 64}), \
                 patch.object(authority, 'Observer', return_value=instance), patch.object(harness.guest, 'start') as start:
                report = harness.run(root, root, 'lifecycle', 'e' * 40, boot_profile='game-authority-ab',
                                     device_config=template, preflight_only=True, reinstall_after_delete=True)
            start.assert_not_called(); instance.invoke.assert_called_once_with('snapshot')
            plan = json.loads((output / 'plan.json').read_text())
            self.assertEqual(plan['normal_boot_shutdown_cycles'], 2)
            self.assertFalse(plan['prepare_backup']); self.assertIsNone(plan['wallet_preparation'])
            self.assertEqual(plan['reinstall_after_delete']['expected_operations'], 16)
            self.assertEqual(plan['reinstall_after_delete']['expected_jobs'], 5)
            self.assertFalse(plan['reinstall_after_delete']['wallet_mutations'])
            self.assertEqual(plan['authority_observation']['baseline']['status'], 'EMPTY_BEFORE_UI')
            self.assertEqual(plan['limits'], harness.contract.plan('lifecycle')['limits'])
            self.assertEqual(report['plan_sha256'], harness.contract.hashed(plan))


if __name__ == '__main__':
    unittest.main()

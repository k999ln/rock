"""Host observer contract tests; no authority, guest or financial action runs."""
import copy
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'os/desktop'))
import game_authority_observer as observer

AUTHORITY = '00000000-0000-4000-8000-000000000001'


def snapshot():
    databases = {}
    for filename, names in observer.EMPTY_TABLES.items():
        databases['contracts/alice/' + filename] = {
            'schema_sha256': 'a' * 64,
            'tables': [{'name': name, 'columns_sha256': 'b' * 64, 'intrinsic_rowid': '_rowid_',
                        'row_count': 0, 'rows_sha256': 'c' * 64} for name in names],
            'pragmas': {'application_id': 0, 'user_version': 0, 'encoding': 'UTF-8', 'auto_vacuum': 0}}
    for name in ('game-a', 'game-b', 'game-index'):
        databases[name + '/game.sqlite3'] = {'schema_sha256': 'a' * 64,
            'tables': [{'name': 'identity', 'columns_sha256': 'b' * 64, 'intrinsic_rowid': '_rowid_',
                        'row_count': 1, 'rows_sha256': 'c' * 64}],
            'pragmas': {'application_id': 0, 'user_version': 0, 'encoding': 'UTF-8', 'auto_vacuum': 0}}
    return {'schema': observer.SCHEMA, 'authority_id': AUTHORITY, 'simulation_only': True,
            'databases': databases, 'identities': {name: 'd' * 64 for name in observer.REQUIRED_IDENTITIES}}


class AuthorityObservation(unittest.TestCase):
    def test_empty_wallet_and_member_state_can_be_bound_before_ui(self):
        value = observer.validate(snapshot(), AUTHORITY)
        self.assertEqual(observer.empty_baseline(value)['status'], 'EMPTY_BEFORE_UI')
        observer.unchanged(value, copy.deepcopy(value))

    def test_every_required_financial_credential_and_member_table_must_be_empty(self):
        original = snapshot()
        for path, database in original['databases'].items():
            if Path(path).name not in observer.EMPTY_TABLES:
                continue
            for index, table in enumerate(database['tables']):
                with self.subTest(table=table['name']):
                    value = copy.deepcopy(original)
                    value['databases'][path]['tables'][index]['row_count'] = 1
                    with self.assertRaisesRegex(ValueError, 'already contains'):
                        observer.empty_baseline(value)

    def test_each_game_index_and_coordinator_inventory_is_required(self):
        for path in observer.REQUIRED_DATABASES:
            value = snapshot(); del value['databases'][path]
            with self.subTest(database=path), self.assertRaisesRegex(ValueError, 'database is missing'):
                observer.validate(value, AUTHORITY)
        for path in observer.REQUIRED_IDENTITIES:
            value = snapshot(); del value['identities'][path]
            with self.subTest(identity=path), self.assertRaisesRegex(ValueError, 'protected JSON'):
                observer.validate(value, AUTHORITY)

    def test_missing_db_or_table_never_means_empty(self):
        value = snapshot(); del value['databases']['contracts/alice/entitlement.db']
        with self.assertRaisesRegex(ValueError, 'both authoritative'):
            observer.empty_baseline(value)
        value = snapshot(); value['databases']['contracts/alice/wallet-simulator.db']['tables'].pop()
        with self.assertRaisesRegex(ValueError, 'missing baseline'):
            observer.empty_baseline(value)

    def test_additional_schema_row_sequence_and_identity_changes_are_not_excluded(self):
        before = snapshot()
        path = 'contracts/alice/wallet-simulator.db'
        extra = {'name': 'future_game_journal', 'columns_sha256': 'e' * 64, 'intrinsic_rowid': '_rowid_',
                 'row_count': 1, 'rows_sha256': 'f' * 64}
        before['databases'][path]['tables'].append(extra)
        changes = []
        value = copy.deepcopy(before); value['databases'][path]['tables'][-1]['rows_sha256'] = 'a' * 64; changes.append(value)
        value = copy.deepcopy(before); value['databases'][path]['schema_sha256'] = 'b' * 64; changes.append(value)
        value = copy.deepcopy(before); value['databases'][path]['pragmas']['user_version'] = 1; changes.append(value)
        value = copy.deepcopy(before); value['identities']['coordinator/registry.json'] = 'a' * 64; changes.append(value)
        value = copy.deepcopy(before); value['databases'][path]['tables'].pop(); changes.append(value)
        for value in changes:
            observer.validate(value, AUTHORITY)
            with self.subTest(value=value), self.assertRaisesRegex(ValueError, 'changed'):
                observer.unchanged(before, value)

    def test_wrong_authority_scope_duplicate_tables_and_boolean_counts_fail(self):
        cases = []
        value = snapshot(); value['authority_id'] = '00000000-0000-4000-8000-000000000002'; cases.append(value)
        value = snapshot(); value['simulation_only'] = False; cases.append(value)
        value = snapshot(); value['databases']['../outside'] = value['databases'].pop('contracts/alice/entitlement.db'); cases.append(value)
        value = snapshot(); value['databases']['contracts/alice/entitlement.db']['tables'][0]['row_count'] = False; cases.append(value)
        value = snapshot(); rows = value['databases']['contracts/alice/entitlement.db']['tables']; rows.append(copy.deepcopy(rows[0])); cases.append(value)
        for value in cases:
            with self.subTest(value=value), self.assertRaises(ValueError):
                observer.validate(value, AUTHORITY)

    def test_fixed_cli_uses_no_shell_and_rejects_changed_config(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary).resolve()
            cli, config = root / 'sandbox.py', root / 'sandbox.json'
            cli.write_text('# fixed owned CLI\n'); cli.chmod(0o644)
            config.write_text('{"owned":"fixture"}'); config.chmod(0o600)
            handle = observer.Observer(cli, config, AUTHORITY, root)
            completed = subprocess.CompletedProcess([], 0, json.dumps(snapshot()).encode(), b'')
            with patch.object(observer.subprocess, 'run', return_value=completed) as run:
                self.assertEqual(handle.invoke('snapshot'), snapshot())
                self.assertEqual(run.call_args.args[0], [sys.executable, '-I', '-B', str(cli), 'snapshot', '--config', str(config)])
                self.assertEqual(run.call_args.kwargs['timeout'], 30)
                config.write_text('{"owned":"changed"}')
                with self.assertRaisesRegex(ValueError, 'input changed'):
                    handle.invoke('snapshot')
                self.assertEqual(run.call_count, 1)

    def test_failed_or_oversized_snapshot_cannot_be_accepted(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary).resolve(); cli, config = root / 'sandbox.py', root / 'sandbox.json'
            cli.write_text('# fixture'); cli.chmod(0o644); config.write_text('{}'); config.chmod(0o600)
            handle = observer.Observer(cli, config, AUTHORITY, root)
            for result in (subprocess.CompletedProcess([], 1, b'', b'owned server is running'),
                           subprocess.CompletedProcess([], 0, b'x' * (observer.LIMITS['stdout_bytes'] + 1), b'')):
                with patch.object(observer.subprocess, 'run', return_value=result), self.assertRaises(ValueError):
                    handle.invoke('snapshot')


if __name__ == '__main__':
    unittest.main()

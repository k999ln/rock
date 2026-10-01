"""Real SQLite read-sync observations, with unauthorized mutation refusals."""
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import sqlite3
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'os/desktop'))
import wallet_cache_retention as cache
spec = importlib.util.spec_from_file_location('cache_backup_verify',
    Path(__file__).resolve().parents[1] / 'os/desktop/verify-backup.py')
backup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(backup)


class CacheRetention(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(':memory:')
        self.addCleanup(self.db.close)
        self.db.execute('CREATE TABLE snapshot(singleton INTEGER PRIMARY KEY,payload TEXT NOT NULL,received_at REAL NOT NULL)')
        self.db.execute('INSERT INTO snapshot VALUES(1,?,?)', ('{"available_minor":0}', 100.0))

    def observed(self):
        raw = json.dumps(self.db.execute('SELECT * FROM snapshot').fetchall())
        return {'tables': {'snapshot': {'rows': 1, 'logical_sha256': hashlib.sha256(raw.encode()).hexdigest()},
                           'identity': {'rows': 1, 'logical_sha256': 'identity'},
                           'requests': {'rows': 0, 'logical_sha256': 'empty'},
                           'future_game_journal': {'rows': 1, 'logical_sha256': 'retained'}},
                'schema_sha256': 'all-schema', 'internal_sequences': {},
                'additional_tables': ['future_game_journal'], 'read_sync': cache.observe(self.db)}

    def test_same_payload_refresh_is_the_only_permitted_change(self):
        before = self.observed()
        cache.compare(before, self.observed())
        self.db.execute('UPDATE snapshot SET received_at=101.0')
        after = self.observed()
        self.assertNotEqual(before['tables']['snapshot'], after['tables']['snapshot'])
        cache.compare(before, after)

    def test_backward_refresh_is_rejected(self):
        before = self.observed()
        self.db.execute('UPDATE snapshot SET received_at=99.0')
        with self.assertRaisesRegex(ValueError, 'backwards'):
            cache.compare(before, self.observed())

    def test_exact_payload_bytes_including_money_must_be_retained(self):
        before = self.observed()
        for payload in ('{"available_minor":1}', '{"available_minor": 0}'):
            with self.subTest(payload=payload):
                self.db.execute('UPDATE snapshot SET payload=?,received_at=101.0', (payload,))
                with self.assertRaisesRegex(ValueError, 'outside'):
                    cache.compare(before, self.observed())

    def test_identity_requests_unknown_tables_schema_sequences_cannot_be_ignored(self):
        before = self.observed()
        changes = []
        for table in ('identity', 'requests', 'future_game_journal'):
            value = copy.deepcopy(before); value['tables'][table]['logical_sha256'] = 'changed'; changes.append(value)
        value = copy.deepcopy(before); value['schema_sha256'] = 'changed'; changes.append(value)
        value = copy.deepcopy(before); value['internal_sequences'] = {'sqlite_sequence': 'changed'}; changes.append(value)
        value = copy.deepcopy(before); del value['tables']['future_game_journal']; changes.append(value)
        value = copy.deepcopy(before); value['read_sync']['unexpected'] = 1; changes.append(value)
        for after in changes:
            with self.subTest(after=after), self.assertRaises(ValueError):
                cache.compare(before, after)

    def test_missing_or_multiple_snapshot_rows_are_rejected(self):
        self.db.execute('DELETE FROM snapshot')
        with self.assertRaisesRegex(ValueError, 'one synchronized'):
            cache.observe(self.db)
        self.db.executemany('INSERT INTO snapshot VALUES(?,?,?)', [(1, '{}', 1.0), (2, '{}', 1.0)])
        with self.assertRaisesRegex(ValueError, 'one synchronized'):
            cache.observe(self.db)

    def test_nonfinite_nonpositive_or_nonreal_time_is_rejected(self):
        for value in (float('inf'), -1.0, 0.0, 'invalid'):
            with self.subTest(value=value):
                self.db.execute('UPDATE snapshot SET received_at=?', (value,))
                with self.assertRaisesRegex(ValueError, 'SQLite REAL'):
                    cache.observe(self.db)

    def test_future_column_is_not_silently_excluded(self):
        self.db.execute('ALTER TABLE snapshot ADD COLUMN game_balance INTEGER')
        with self.assertRaisesRegex(ValueError, 'columns differ'):
            cache.observe(self.db)

    def test_timestamp_exception_requires_the_explicit_profile(self):
        power = {'schema_sha256': 'power-schema', 'internal_sequences': {}, 'tables': {'requests': {}}}
        before = {'wallet_cache': self.observed(), 'power': power}
        self.db.execute('UPDATE snapshot SET received_at=101.0')
        after = {'wallet_cache': self.observed(), 'power': power}
        profile = {'sources': {'wallet_cache': None, 'power': None}}
        with self.assertRaisesRegex(ValueError, 'restored business data changed'):
            backup.compare_business(before, after, profile)
        profile['cache_read_sync'] = cache.POLICY
        backup.compare_business(before, after, profile)
        after['wallet_cache']['tables']['future_game_journal']['logical_sha256'] = 'changed'
        with self.assertRaisesRegex(ValueError, 'outside'):
            backup.compare_business(before, after, profile)


if __name__ == '__main__':
    unittest.main()

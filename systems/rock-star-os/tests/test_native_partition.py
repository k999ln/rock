"""A successful CI join must cover every discovered occurrence exactly once."""
import hashlib
import importlib.util
import io
import json
from contextlib import redirect_stdout
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from native_partition import flatten, partition_for, selection

SPEC = importlib.util.spec_from_file_location('native_partition_runner',
    Path(__file__).resolve().parents[3] / 'scripts/test-native.py')
RUNNER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(RUNNER)


class NativePartitionTests(unittest.TestCase):
    def test_nested_discovery_preserves_duplicate_occurrences_and_module_fixtures(self):
        cases = [unittest.FunctionTestCase(lambda: None) for _ in range(3)]
        self.assertEqual(list(flatten(unittest.TestSuite([cases[0], unittest.TestSuite(cases[1:])]))), cases)
        ids = ['test_a.C.test_one', 'test_b.C.test_two', 'test_a.C.test_one', 'test_a.D.test_three']
        plans = [selection(ids, index, 4) for index in range(4)]
        selected = [item for plan in plans for item in plan['selected_ordinals']]
        self.assertEqual(sorted(selected), list(range(len(ids))))
        self.assertEqual(len(selected), len(set(selected)))
        group = partition_for(ids[0], 4)
        self.assertEqual([partition_for(ids[i], 4) for i in (0, 2, 3)], [group] * 3)

    def test_invalid_partitions_never_select_tests(self):
        for index, count in ((-1, 4), (4, 4), (0, 0), (0, 17), (True, 4)):
            with self.subTest(index=index, count=count), self.assertRaises(ValueError):
                selection(['test_a.C.test_one'], index, count)

    def fixture(self, root):
        ids = ['test_' + str(i) + '.C.test_one' for i in range(8)]
        ids.append(ids[0])
        for kind, index in [('main', 0), ('main', 1), ('support', None)]:
            directory = root / (kind + str(index))
            directory.mkdir()
            if kind == 'main':
                plan = selection(ids, index, 2)
                self.assertTrue(plan['selected_ordinals'])
                raw = json.dumps(plan).encode()
                (directory / 'tests.selection.json').write_bytes(raw)
                part = {'kind': kind, 'index': index, 'count': 2,
                        'selection_sha256': hashlib.sha256(raw).hexdigest()}
                names = [('tests', len(plan['selected_ordinals']))]
            else:
                part = {'kind': 'support'}
                names = [(name, 1 if name.startswith('os-') or name in ('c-ui-ipc', 'ui-observers') else 0)
                         for name in RUNNER.SUPPORT_CHECKS]
            checks = []
            for name, count in names:
                raw = ('Ran ' + str(count) + ' tests in 0.001s\n\nOK\n' if count else 'C check passed\n').encode()
                (directory / (name + '.log')).write_bytes(raw)
                checks.append({'name': name, 'tests': count, 'exit_code': 0, 'passed': True,
                    'skipped': False, 'unclean_log': False, 'log_sha256': hashlib.sha256(raw).hexdigest()})
            report = {'schema': 'rock-native-regressions/1', 'status': 'PASS', 'source_unchanged': True,
                      'changed_inputs': [], 'input_sha256': {'source': 'fixed'}, 'partition': part,
                      'checks': checks, 'total_python_test_executions': sum(x['tests'] for x in checks),
                      'started_utc': '2026-09-10T00:00:00Z', 'finished_utc': '2026-09-10T00:00:01Z',
                      'platform': 'test fixture', 'machine': 'test fixture', 'python': 'test fixture'}
            (directory / 'report.json').write_text(json.dumps(report))
        return ids

    def test_join_keeps_original_logs_and_counts_every_occurrence(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary); parts = root / 'parts'; parts.mkdir()
            ids = self.fixture(parts)
            with patch.object(RUNNER, 'inventory', return_value={'source': 'fixed'}), redirect_stdout(io.StringIO()):
                self.assertEqual(RUNNER.merge_parts(parts, root / 'merged', 2), 0)
            result = json.loads((root / 'merged/report.json').read_text())
            self.assertEqual(result['main_test_executions'], len(ids))
            self.assertEqual(len(result['checks']), 2 + len(RUNNER.SUPPORT_CHECKS))
            self.assertEqual(result['total_python_test_executions'], len(ids) + 7)
            for check in result['checks']:
                self.assertEqual(hashlib.sha256((root / 'merged' / check['log_file']).read_bytes()).hexdigest(),
                                 check['log_sha256'])

    def test_join_rejects_missing_duplicate_stale_failed_or_tampered_evidence(self):
        faults = ('missing', 'duplicate', 'stale', 'failed', 'log', 'selection', 'inventory', 'count', 'support')
        for fault in faults:
            with self.subTest(fault=fault), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary); parts = root / 'parts'; parts.mkdir(); self.fixture(parts)
                path = parts / 'main0/report.json'; report = json.loads(path.read_text())
                if fault == 'missing':
                    path.unlink()
                elif fault == 'duplicate':
                    other = parts / 'duplicate'; other.mkdir(); (other / 'report.json').write_text(path.read_text())
                elif fault == 'log':
                    (path.parent / 'tests.log').write_text('changed original log')
                elif fault in ('selection', 'inventory'):
                    plan_path = path.parent / 'tests.selection.json'; plan = json.loads(plan_path.read_text())
                    if fault == 'selection': plan['selected_ordinals'].pop()
                    else: plan['tests'][0] = 'changed.C.test_one'
                    raw = json.dumps(plan).encode(); plan_path.write_bytes(raw)
                    report['partition']['selection_sha256'] = hashlib.sha256(raw).hexdigest()
                    path.write_text(json.dumps(report))
                elif fault == 'support':
                    path = parts / 'supportNone/report.json'; report = json.loads(path.read_text())
                    report['checks'].pop(); path.write_text(json.dumps(report))
                else:
                    if fault == 'stale': report['input_sha256']['source'] = 'other source'
                    elif fault == 'failed': report['status'] = 'FAIL'
                    elif fault == 'count': report['checks'][0]['tests'] += 1
                    path.write_text(json.dumps(report))
                with patch.object(RUNNER, 'inventory', return_value={'source': 'fixed'}), self.assertRaises(ValueError):
                    RUNNER.merge_parts(parts, root / 'merged', 2)


if __name__ == '__main__':
    unittest.main()

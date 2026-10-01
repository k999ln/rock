"""Fixed predicate diagnostics; unknown process argv/exe/UID values stay private."""
import copy
import importlib.util
import json
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('hub_launcher_diagnostic',
    Path(__file__).resolve().parents[1] / 'os/platform/hub_fault_fixture.py')
fixture = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fixture)


def child():
    return {'pid': 201, 'ppid': 101, 'tgid': 201, 'tracer_pid': 50, 'start_ticks': 99,
            'uid': [1002] * 4, 'gid': [1002] * 4, 'exe': fixture.LAUNCHER,
            'command': [fixture.LAUNCHER, 'recipe']}


class LauncherDiagnosticTests(unittest.TestCase):
    def check(self, value, previous=()):
        return fixture.validate_launcher(value, parent_pid=101, tracer_pid=50, previous_pids=set(previous))

    def diagnostic(self, value, previous=()):
        with self.assertRaises(ValueError) as failure:
            self.check(value, previous)
        prefix = 'not the new exact owned platform recipe launcher; diagnostic='
        self.assertTrue(str(failure.exception).startswith(prefix))
        return json.loads(str(failure.exception)[len(prefix):]), str(failure.exception)

    def test_fixed_good_identity_still_passes(self):
        self.assertIsNone(self.check(child()))

    def test_each_failed_identity_predicate_is_visible_without_relaxation(self):
        for field, value, predicate in (
                ('pid', 1, 'pid_gt_one'), ('ppid', 999, 'parent_matches'),
                ('tgid', 202, 'thread_group_matches'), ('tracer_pid', 99, 'tracer_matches'),
                ('start_ticks', 0, 'start_ticks_positive'), ('uid', [0] * 4, 'uid_matches'),
                ('gid', [0] * 4, 'gid_matches'), ('exe', '/PRIVATE-EXE', 'exe_matches'),
                ('command', ['/PRIVATE-ARGV', 'PRIVATE-ARGUMENT'], 'argv_matches')):
            with self.subTest(field=field):
                value = dict(child(), **{field: value})
                report, text = self.diagnostic(value)
                self.assertFalse(report['checks'][predicate])
                self.assertNotIn('PRIVATE', text)
                self.assertTrue(all(type(x) is bool for x in report['checks'].values()))
                self.assertTrue(all(x is None or type(x) is int for x in report['ids'].values()))
        report, _ = self.diagnostic(child(), previous=(201,))
        self.assertFalse(report['checks']['pid_is_new'])

    def test_noninteger_or_oversized_identity_is_not_echoed(self):
        for field in ('pid', 'ppid', 'tgid', 'tracer_pid', 'start_ticks'):
            for value in ('PRIVATE-ID', True, None):
                with self.subTest(field=field, value=value):
                    report, text = self.diagnostic(dict(child(), **{field: value}))
                    self.assertFalse(report['checks']['integer_ids'])
                    self.assertIsNone(report['ids'][field])
                    self.assertNotIn('PRIVATE-ID', text)
        value = child()
        value.update(pid=2**80, command=['PRIVATE-ARGV'])
        report, text = self.diagnostic(value)
        self.assertIsNone(report['ids']['pid'])
        self.assertNotIn(str(2**80), text)

    def test_diagnostic_has_only_fixed_schema_and_no_unknown_fields(self):
        value = copy.deepcopy(child())
        value.update(command=['PRIVATE'], environment={'TOKEN': 'PRIVATE'}, uid=['PRIVATE'])
        report, text = self.diagnostic(value)
        self.assertEqual(set(report), {'schema', 'checks', 'ids'})
        self.assertEqual(report['schema'], 'rock-hub-launcher-diagnostic/1')
        self.assertEqual(set(report['ids']), {'pid', 'ppid', 'tgid', 'tracer_pid', 'start_ticks',
                                            'expected_parent_pid', 'expected_tracer_pid'})
        self.assertNotIn('PRIVATE', text)
        self.assertLess(len(text), 1024)


if __name__ == '__main__':
    unittest.main()

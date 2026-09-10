"""The final native report must bind the actual copied diagnostic bytes."""
from contextlib import redirect_stdout
import hashlib
import io
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import test_native_partition as partition


class NativeStackIntegrityTests(unittest.TestCase):
    def fixture(self, root):
        parts = root / 'parts'
        parts.mkdir()
        partition.NativePartitionTests().fixture(parts)
        report_path = parts / 'main0/report.json'
        report = json.loads(report_path.read_text())
        report['diagnostic_stacks'] = True
        fields = {'diagnostic_stacks': 'tests.stacks.log',
                  'test_failure_stacks': 'tests.selection.failures.stacks.log'}
        for field, name in fields.items():
            raw = ('original ' + field + '\n').encode()
            (report_path.parent / name).write_bytes(raw)
            report['checks'][0][field] = {'file': name, 'bytes': len(raw),
                                        'sha256': hashlib.sha256(raw).hexdigest()}
        report_path.write_text(json.dumps(report))
        return parts, report_path, report, fields

    def merge(self, parts, output):
        with patch.object(partition.RUNNER, 'inventory', return_value={'source': 'fixed'}), redirect_stdout(io.StringIO()):
            return partition.RUNNER.merge_parts(parts, output, 2)

    def test_final_report_paths_resolve_to_verified_copied_stack_bytes(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            parts, _, _, fields = self.fixture(root)
            self.assertEqual(self.merge(parts, root / 'merged'), 0)
            merged = json.loads((root / 'merged/report.json').read_text())
            for field in fields:
                record = merged['checks'][0][field]
                self.assertTrue(record['file'].startswith('main-0/'))
                raw = (root / 'merged' / record['file']).read_bytes()
                self.assertEqual(len(raw), record['bytes'])
                self.assertEqual(hashlib.sha256(raw).hexdigest(), record['sha256'])

    def test_changed_missing_aliased_or_unbound_sidecars_cannot_merge_as_pass(self):
        for field in ('diagnostic_stacks', 'test_failure_stacks'):
            for fault in ('bytes', 'missing', 'metadata', 'size', 'hash', 'path', 'symlink', 'hardlink'):
                with self.subTest(field=field, fault=fault), tempfile.TemporaryDirectory() as temporary:
                    root = Path(temporary)
                    parts, report_path, report, fields = self.fixture(root)
                    path = report_path.parent / fields[field]
                    metadata = report['checks'][0][field]
                    if fault == 'bytes': path.write_bytes(b'tampered')
                    elif fault == 'missing': path.unlink()
                    elif fault == 'metadata': del report['checks'][0][field]
                    elif fault == 'size': metadata['bytes'] += 1
                    elif fault == 'hash': metadata['sha256'] = '0' * 64
                    elif fault == 'path': metadata['file'] = '../outside'
                    else:
                        target = root / 'original'
                        path.rename(target)
                        if fault == 'symlink': path.symlink_to(target)
                        else: os.link(target, path)
                    report_path.write_text(json.dumps(report))
                    with self.assertRaises(ValueError): self.merge(parts, root / 'merged')

    def test_direct_script_exception_cannot_hide_a_main_partition_stack(self):
        runner = partition.RUNNER
        absent = {'status': 'NOT_APPLICABLE_DIRECT_SCRIPT', 'reason': 'Original command retained'}
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            for name in ('c-ui-native-replay', 'c-ui-ipc'):
                result = runner.verified_sidecars(root, {'name': name, 'diagnostic_stacks': absent},
                    diagnostic=True, main=False, prefix='support')
                self.assertEqual(result['diagnostic_stacks'], absent)
            with self.assertRaises(ValueError):
                runner.verified_sidecars(root, {'name': 'tests', 'diagnostic_stacks': absent},
                    diagnostic=True, main=True, prefix='main-0')

    def test_declared_stacks_are_verified_even_without_top_level_diagnostic_flag(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            parts, report_path, report, fields = self.fixture(root)
            report['diagnostic_stacks'] = False
            report_path.write_text(json.dumps(report))
            (report_path.parent / fields['test_failure_stacks']).write_bytes(b'tampered')
            with self.assertRaises(ValueError): self.merge(parts, root / 'merged')


if __name__ == '__main__':
    unittest.main()

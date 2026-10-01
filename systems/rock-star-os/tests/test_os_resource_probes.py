"""Portable negative checks of resource evidence; actual enforcement is Linux-only."""
import importlib.util
import json
from pathlib import Path
import signal
import subprocess
import unittest

SOURCE = Path(__file__).resolve().parents[1] / 'os/platform/sandbox-probe.py'
spec = importlib.util.spec_from_file_location('rock_resource_probe', SOURCE)
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)


class ResourceEvidenceTests(unittest.TestCase):
    def observed(self, mode):
        armed = {'schema': probe.SCHEMA, 'mode': mode, 'uid': 65534,
                 'limits': {key: [value, value] for key, value in probe.LIMITS.items()}}
        result = ({'mode': mode, 'outcome': 'MemoryError'} if mode == 'memory' else
                  {'mode': mode, 'outcome': 'EFBIG', 'bytes': 1048576} if mode == 'file-size' else None)
        lines = [probe.ARMED + json.dumps(armed)]
        if result is not None:
            lines.append(probe.RESULT + json.dumps(result))
        code = {'memory': 0, 'file-size': 0, 'cpu': -signal.SIGKILL, 'crash': -signal.SIGSEGV}[mode]
        return subprocess.CompletedProcess([], code, '\n'.join(lines) + '\n', '')

    def test_all_four_exact_contracts(self):
        for mode in probe.MODES:
            result = probe.validate_resource_result(mode, self.observed(mode), 2.1)
            self.assertEqual((result['mode'], result['status']), (mode, 'PASS'))

    def test_wrapper_signal_exit_is_distinct_from_ordinary_success(self):
        for mode, sig in (('cpu', signal.SIGKILL), ('crash', signal.SIGSEGV)):
            result = self.observed(mode)
            result.returncode = 128 + sig
            probe.validate_resource_result(mode, result, 2.1)
            for wrong in (0, 1, 125, 128 + signal.SIGTERM):
                result.returncode = wrong
                with self.assertRaises(ValueError):
                    probe.validate_resource_result(mode, result, 2.1)

    def test_missing_duplicate_extra_or_truncated_proof_is_rejected(self):
        for mode in probe.MODES:
            source = self.observed(mode)
            for raw in ('', source.stdout + source.stdout, source.stdout + 'unexpected\n', source.stdout[:-2]):
                with self.subTest(mode=mode, raw=raw[:50]), self.assertRaises(ValueError):
                    probe.validate_resource_result(mode, subprocess.CompletedProcess([], source.returncode, raw, ''), 2.1)

    def test_changed_identity_mode_or_limits_are_rejected(self):
        original = self.observed('memory')
        for old, new in (('65534', '0'), ('268435456', '536870912'), ('"cpu": [2, 2]', '"cpu": [true, 2]'),
                         ('"memory"', '"arbitrary"'), ('"uid": 65534', '"uid": 65534, "uid": 65534')):
            raw = original.stdout.replace(old, new)
            self.assertNotEqual(raw, original.stdout)
            with self.assertRaises(ValueError):
                probe.validate_resource_result('memory', subprocess.CompletedProcess([], 0, raw, ''), 2.1)

    def test_wrong_failure_or_file_size_is_rejected(self):
        for mode, old, new in (('memory', 'MemoryError', 'unexpected-success'), ('file-size', 'EFBIG', 'ENOSPC'),
                               ('file-size', '"bytes": 1048576', '"bytes": 0')):
            result = self.observed(mode)
            result.stdout = result.stdout.replace(old, new)
            with self.assertRaises(ValueError):
                probe.validate_resource_result(mode, result, 2.1)

    def test_unbounded_elapsed_output_or_unknown_mode_is_rejected(self):
        for duration in (True, -1, 0, 0.5, 8.1, float('nan'), float('inf')):
            with self.assertRaises(ValueError):
                probe.validate_resource_result('cpu', self.observed('cpu'), duration)
        result = self.observed('memory')
        result.stderr = 'x' * 8193
        with self.assertRaises(ValueError):
            probe.validate_resource_result('memory', result, 1)
        with self.assertRaises(ValueError):
            probe.validate_resource_result('recipe', self.observed('memory'), 1)


if __name__ == '__main__':
    unittest.main()

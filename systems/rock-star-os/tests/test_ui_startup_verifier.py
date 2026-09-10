"""Negative proof-validation regressions, not substitutes for the QEMU matrix."""
import copy
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('startup_matrix_verifier',
    Path(__file__).resolve().parents[1] / 'os/update/verify-ui-startup.py')
verifier = importlib.util.module_from_spec(spec)
spec.loader.exec_module(verifier)


def health():
    return {'schema': 'rock-native-ui-health/1', 'status': 'READY', 'native_ui_checked': True,
            'pid': 456, 'process_start_ticks': 12345, 'samples': [
                {'frames': 1, 'loops': 1, 'width': 720, 'height': 960, 'inputs': 2},
                {'frames': 1, 'loops': 2, 'width': 720, 'height': 960, 'inputs': 2}]}


def line(marker, value):
    return marker + ' ' + json.dumps(value) + '\n'


def factory_boot():
    return ('ROCK_AB_SELECTED slot=A sequence=1 reason=committed\n'
            'ROCK_AB_SWITCH_ROOT device=/dev/vda\n' + line('ROCK_UI_HEALTH_READY', health()) +
            'ROCK_AB_HEALTH_CONFIRMED\nROCK_AB_PHASE_PASS phase=fault-stage\n')


def rejected_boot(mode='freeze'):
    fault = {'mode': mode, 'pid': 456, 'process_start_ticks': 12345,
             'stopped': mode == 'freeze', 'exited': mode == 'crash'}
    return ('ROCK_AB_SELECTED slot=B sequence=2 reason=trial\n'
            'ROCK_AB_SWITCH_ROOT device=/dev/vdc\n' + line('ROCK_UI_STARTUP_FIXTURE_READY', health()) +
            line('ROCK_UI_STARTUP_FAULT', fault) +
            'ROCK_UI_HEALTH_REJECTED TimeoutError: timed out\nROCK_AB_HEALTH_FAILED_REBOOT\n')


class StartupVerifierTests(unittest.TestCase):
    def test_scoped_crash_requires_all_four_boots_and_cannot_promote_other_modes(self):
        cases = [{'mode': mode, 'status': 'PASS' if mode == 'crash' else 'NOT_RUN',
                  'boots': [{'status': 'PASS', 'passed': True} for _ in range(4)] if mode == 'crash' else []}
                 for mode in verifier.CASES]
        verifier.selected_case_complete(cases, 'crash')
        for mutate in (lambda rows: rows[-1]['boots'].pop(),
                       lambda rows: rows[-1]['boots'][1].update(passed=False),
                       lambda rows: rows[0].update(status='PASS'),
                       lambda rows: rows[0]['boots'].append({'status': 'PASS', 'passed': True})):
            broken = copy.deepcopy(cases)
            mutate(broken)
            with self.assertRaises(RuntimeError):
                verifier.selected_case_complete(broken, 'crash')

    def test_scoped_preflight_keeps_deadlines_and_records_unselected_modes_not_run(self):
        with tempfile.TemporaryDirectory(prefix='rock-ui-case-limit-') as temporary:
            directory = Path(temporary)
            result = subprocess.run([sys.executable, '-B', str(Path(verifier.__file__)),
                '--artifacts', str(directory / 'absent-images'), '--evidence', str(directory / 'evidence'),
                '--case', 'crash', '--timeout', '0'], capture_output=True, text=True, timeout=10)
            self.assertNotEqual(result.returncode, 0)
            report = json.loads((directory / 'evidence/report.json').read_text())
            self.assertEqual(report['status'], 'FAIL')
            self.assertEqual(report['selected_case'], 'crash')
            self.assertFalse(report['full_matrix_verified'])
            self.assertEqual((report['limits']['cases'], report['limits']['boots'], report['limits']['required_free_gib']), (1, 4, 12))
            self.assertTrue(all(case['status'] == 'NOT_RUN' and not case['boots'] for case in report['cases']))
            self.assertEqual(list(directory.rglob('*.ext4')), [])

    def test_healthy_factory_requires_real_proof_before_confirmation(self):
        self.assertTrue(verifier.validate_boot(factory_boot(), step=0, mode='ready')['native_ui_checked'])
        for text in (factory_boot().replace('ROCK_UI_HEALTH_READY', 'ROCK_UI_HEALTH_HEADLESS'),
                     factory_boot().replace('ROCK_AB_HEALTH_CONFIRMED\n', '', 1),
                     factory_boot().replace(line('ROCK_UI_HEALTH_READY', health()), ''),
                     'ROCK_AB_HEALTH_CONFIRMED\n' + factory_boot()):
            with self.subTest(text=text[:80]), self.assertRaises(RuntimeError):
                verifier.validate_boot(text, step=0, mode='ready')

    def test_stale_or_invalid_health_cannot_pass(self):
        for mutate in (lambda p: p.update(native_ui_checked=False), lambda p: p.update(pid=True),
                       lambda p: p['samples'][1].update(loops=1), lambda p: p['samples'][1].update(frames=0),
                       lambda p: p['samples'][1].update(inputs=0), lambda p: p['samples'][0].update(width=0)):
            proof = copy.deepcopy(health())
            mutate(proof)
            with self.assertRaises(RuntimeError):
                verifier.validate_health(proof)

    def test_real_stop_and_death_effect_required(self):
        for mode in ('freeze', 'crash'):
            text = rejected_boot(mode)
            self.assertTrue(verifier.validate_boot(text, step=1, mode=mode)['rejected_unready_trial'])
            for broken in (text.replace('"pid": 456, "process_start_ticks": 12345, "stopped"',
                                        '"pid": 457, "process_start_ticks": 12345, "stopped"'),
                           text.replace('ROCK_UI_STARTUP_FIXTURE_READY', 'NOT_A_HEALTH_PROOF'),
                           text.replace('"stopped": true', '"stopped": false') if mode == 'freeze'
                           else text.replace('"exited": true', '"exited": false')):
                with self.subTest(mode=mode), self.assertRaises(RuntimeError):
                    verifier.validate_boot(broken, step=1, mode=mode)

    def test_mark_good_or_headless_after_fault_is_failure(self):
        for forbidden in ('ROCK_AB_HEALTH_CONFIRMED', 'ROCK_UI_HEALTH_HEADLESS',
                          'ROCK_AB_WATCHDOG_REBOOT', 'ROCK_UI_STARTUP_FIXTURE_FAILED'):
            with self.subTest(forbidden=forbidden), self.assertRaises(RuntimeError):
                verifier.validate_boot(rejected_boot() + forbidden + '\n', step=1, mode='freeze')

    def test_kernel_timestamped_panic_after_success_markers_is_failure(self):
        text = factory_boot() + '[   23.123456] Kernel panic - not syncing: fatal reboot failure\n'
        with self.assertRaisesRegex(RuntimeError, 'kernel-timestamped panic'):
            verifier.validate_boot(text, step=0, mode='ready')

    def test_absent_process_is_not_rendered_ui_evidence(self):
        text = ('ROCK_AB_SELECTED slot=B sequence=2 reason=trial\n'
                'ROCK_AB_SWITCH_ROOT device=/dev/vdc\n' +
                line('ROCK_UI_STARTUP_FAULT', {'mode': 'absent', 'ui_started': False}) +
                'ROCK_UI_HEALTH_REJECTED FileNotFoundError: missing pid\nROCK_AB_HEALTH_FAILED_REBOOT\n')
        self.assertFalse(verifier.validate_boot(text, step=2, mode='absent')['native_ui_checked'])
        with self.assertRaises(RuntimeError):
            verifier.validate_boot(text.replace('false', 'true'), step=2, mode='absent')

    def test_rollback_requires_original_slot_and_exhausted_trials(self):
        text = factory_boot().replace('reason=committed', 'reason=attempts-exhausted').replace(
            'phase=fault-stage', 'phase=fault-readback-a') + 'ROCK_AB_PREARM_RECOVERY_PASS\n'
        self.assertEqual(verifier.validate_boot(text, step=3, mode='freeze')['selected_slot'], 'A')
        for broken in (text.replace('reason=attempts-exhausted', 'reason=committed'),
                       text.replace('slot=A', 'slot=B'), text.replace('ROCK_AB_PREARM_RECOVERY_PASS', '')):
            with self.assertRaises(RuntimeError):
                verifier.validate_boot(broken, step=3, mode='freeze')

    def test_serial_partial_and_quoted_records_are_not_proofs(self):
        proof = line('ROCK_UI_HEALTH_READY', health())
        self.assertEqual(verifier.records(proof[:-1], 'ROCK_UI_HEALTH_READY'), [])
        self.assertEqual(verifier.records('quoted ' + proof, 'ROCK_UI_HEALTH_READY'), [])
        self.assertEqual(verifier.records(proof, 'ROCK_UI_HEALTH_READY'), [health()])

    def test_changed_durable_floor_pending_or_attempts_are_rejected(self):
        for state in ({'schema': 1, 'committed': 'B', 'pending': None, 'attempts_left': 0, 'floor': 2},
                      {'schema': 1, 'committed': 'A', 'pending': None, 'attempts_left': 0, 'floor': 1},
                      {'schema': 1, 'committed': 'A', 'pending': 'B', 'attempts_left': 0, 'floor': 1}):
            with self.subTest(state=state), self.assertRaisesRegex(RuntimeError, 'durable mark-good/rollback'):
                verifier.validate_state(state, step=1, mode='freeze', factory_hash='a' * 64, candidate_hash='b' * 64)

    def test_invalid_limits_record_failure_without_starting_or_creating_disks(self):
        with tempfile.TemporaryDirectory(prefix='rock-ui-startup-limit-') as temporary:
            directory = Path(temporary)
            result = subprocess.run([sys.executable, '-B', str(Path(verifier.__file__)),
                '--artifacts', str(directory / 'absent-images'), '--evidence', str(directory / 'evidence'),
                '--timeout', '0'], capture_output=True, text=True, timeout=10)
            self.assertNotEqual(result.returncode, 0)
            report = json.loads((directory / 'evidence/report.json').read_text())
            self.assertEqual(report['status'], 'FAIL')
            self.assertTrue(all(case['status'] == 'NOT_RUN' and not case['boots'] for case in report['cases']))
            self.assertEqual(list(directory.rglob('*.ext4')), [])

    def test_boolean_or_float_persistent_counters_cannot_equal_integer_evidence(self):
        for changed in ({'schema': True}, {'attempts_left': True}, {'floor': True}, {'floor': 1.0}):
            state = {'schema': 1, 'committed': 'A', 'pending': 'B', 'attempts_left': 1, 'floor': 1}
            state.update(changed)
            with self.subTest(changed=changed), self.assertRaisesRegex(RuntimeError, 'integer fields'):
                verifier.validate_state(state, step=1, mode='freeze', factory_hash='a' * 64, candidate_hash='b' * 64)

    def test_evidence_path_alias_cannot_write_inside_frozen_images(self):
        with tempfile.TemporaryDirectory(prefix='rock-ui-startup-path-') as temporary:
            directory = Path(temporary)
            images = directory / 'images'
            images.mkdir()
            alias = directory / 'image-alias'
            alias.symlink_to(images, target_is_directory=True)
            for target in (images / 'evidence', alias / 'evidence', images / '..' / 'images' / 'evidence'):
                with self.subTest(target=target), self.assertRaisesRegex(RuntimeError, 'outside immutable'):
                    verifier.evidence_location(images, target)
            self.assertEqual(list(images.iterdir()), [])
            actual_images, actual_evidence = verifier.evidence_location(alias, directory / 'new-evidence')
            self.assertEqual(actual_images, images.resolve())
            self.assertEqual(actual_evidence, directory.resolve() / 'new-evidence')

    def test_qemu_drive_option_separators_in_paths_are_rejected(self):
        with tempfile.TemporaryDirectory(prefix='rock-ui-startup-drive-') as temporary:
            directory = Path(temporary)
            for artifacts, output in ((directory / 'images,file=other', directory / 'evidence'),
                                      (directory / 'images', directory / 'evidence,format=qcow2'),
                                      (directory / 'images', directory / 'evidence\ncontrol')):
                with self.subTest(artifacts=artifacts, output=output), self.assertRaisesRegex(RuntimeError, 'QEMU option separators'):
                    verifier.evidence_location(artifacts, output)
            self.assertEqual(list(directory.iterdir()), [])


if __name__ == '__main__':
    unittest.main()

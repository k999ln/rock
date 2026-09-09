"""Host guards using explicit fixtures; no VM, GUI execution, or money moves."""
import copy
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import Mock, patch

HERE = Path(__file__).resolve().parents[1] / 'os/desktop'
sys.path.insert(0, str(HERE))
spec = importlib.util.spec_from_file_location('native_business_harness_tests', HERE / 'verify-business.py')
harness = importlib.util.module_from_spec(spec); spec.loader.exec_module(harness)


def tsv(words):
    header = 'level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext\n'
    return header + ''.join(f'5\t1\t1\t1\t{line}\t{i}\t{x}\t{y}\t{width}\t25\t{conf}\t{text}\n'
                            for i, (line, x, y, width, conf, text) in enumerate(words, 1))


def power_row(index):
    key = 'ui-' + format(index, '032x'); boot = f'00000000-0000-4000-8000-{index:012x}'
    return {'key': key, 'operation': 'poweroff', 'boot_id': boot, 'instance': 'unit',
            'request_json': json.dumps({'v': 1, 'op': 'poweroff', 'key': key}),
            'receipt_json': json.dumps({'ok': True, 'result': {'accepted': True, 'key': key, 'op': 'poweroff',
                                    'boot_id': boot, 'meaning': 'accepted; execution and OS completion are not confirmed by this receipt'}}),
            'status': 'dispatched', 'created_unix': index, 'replied_unix': index + .1,
            'dispatched_unix': index + .2, 'command_error': None, 'command_returncode': None}


class OCRGuards(unittest.TestCase):
    def test_shared_row_click_uses_only_the_selected_button_words(self):
        lines = harness.ocr_lines(tsv([(1, 40, 700, 180, 94, 'v1.1.0へ更新'),
                                      (1, 275, 700, 180, 96, '以前の版へ'), (1, 520, 700, 70, 96, '削除')]))
        self.assertEqual(harness.locate(lines, '削除')[0]['x'], 555)
        self.assertEqual(harness.locate(lines, '以前の版へ')[0]['x'], 365)
        self.assertEqual(harness.locate(lines, 'v1.1.0 へ 更新')[0]['x'], 130)

    def test_segmented_japanese_and_full_width_version_labels_have_one_box(self):
        lines = harness.ocr_lines(tsv([(1, 40, 710, 85, 90, 'Ｖ１.０.０'),
                                      (1, 135, 710, 20, 90, 'を'), (1, 165, 710, 80, 90, '選ぶ')]))
        self.assertEqual(len(harness.locate(lines, 'v1.0.0 を選ぶ')), 1)
        self.assertEqual(harness.locate(lines, 'v1.0.0 を選ぶ')[0]['box'], [40, 710, 205, 25])

    def test_two_polarity_passes_only_deduplicate_the_same_exact_phrase_location(self):
        one = harness.ocr_lines(tsv([(1, 369, 565, 240, 90, '確認して実行')]))
        same = harness.ocr_lines(tsv([(1, 370, 566, 238, 91, '確認して実行')]))
        other = harness.ocr_lines(tsv([(1, 369, 265, 240, 90, '確認して実行')]))
        self.assertEqual(len(harness.locate(one + same, '確認して実行')), 1)
        self.assertEqual(len(harness.locate(one + same + other, '確認して実行')), 2)

    def test_pointer_is_parked_with_motion_only_without_an_extra_click(self):
        report = {'input_events': []}; monitor = Mock()
        control = harness.ParkedInput(monitor, Path('/unused'), report)
        with patch.object(harness.native.time, 'sleep'): control.click(300, 400)
        motion = monitor.command.call_args_list[-1]
        self.assertEqual(motion.args[0], 'input-send-event')
        self.assertEqual([event['type'] for event in motion.args[1]['events']], ['abs', 'abs'])
        self.assertEqual(report['input_events'][-1]['action'], 'pointer_park')

    def test_accent_region_is_an_ocr_candidate_never_a_geometry_only_selector(self):
        frame = Mock(); frame.size = (720, 960)
        frame.getdata.return_value = ((35, 105, 85) if 369 <= x < 625 and 550 <= y < 603 else (250, 250, 250)
                                      for y in range(960) for x in range(720))
        self.assertEqual(harness.accent_rectangles(frame), [(369, 550, 625, 603)])
        self.assertEqual(harness.locate([], '確認して実行'), [])

    def test_low_confidence_blank_invalid_and_duplicate_words_fail_closed(self):
        self.assertEqual(harness.locate(harness.ocr_lines(tsv([(1, 40, 200, 85, 44.9, '確認して実行')])), '確認して実行'), [])
        self.assertEqual(harness.locate([], '実行する'), [])
        with self.assertRaises(ValueError): harness.ocr_lines(tsv([(1, 700, 200, 85, 90, '削除')]))
        with self.assertRaises(ValueError): harness.locate(harness.ocr_lines(tsv([(1, 10, 200, 200, 90, '削除削除')])), '削除')

    def driver(self):
        report = {'input_events': [], 'screenshots': [], 'qmp_events': [], 'ui_states': []}
        return harness.ScreenDriver(Mock(), Path('/unused-host-fixture'), report, {}, Mock(), harness.contract.plan('lifecycle')['limits'])

    def test_ambiguous_click_and_missing_state_never_send_an_input(self):
        lines = harness.ocr_lines(tsv([(1, 20, 200, 80, 90, '削除'), (2, 20, 500, 80, 90, '削除')]))
        driver = self.driver(); driver.scan = Mock(return_value=(lines, {'sha256': 'a'})); driver.native = Mock()
        with self.assertRaisesRegex(ValueError, 'ambiguous'): driver.click('削除')
        driver.native.click.assert_not_called()
        driver.scan.return_value = ([], {'sha256': 'a'}); driver.retain = Mock()
        with self.assertRaises(TimeoutError): driver.click('削除', seconds=0)
        driver.native.click.assert_not_called()

    def test_matching_state_first_seen_after_deadline_does_not_click(self):
        driver = self.driver(); driver.native = Mock(); driver.retain = Mock()
        driver.scan = Mock(return_value=(harness.ocr_lines(tsv([(1, 20, 200, 80, 90, '削除')])), {'sha256': 'a'}))
        with patch.object(harness.time, 'monotonic', side_effect=[100, 131]):
            with self.assertRaisesRegex(TimeoutError, 'original deadline'): driver.click('削除', seconds=30)
        driver.native.click.assert_not_called()

    def test_ocr_subprocess_is_never_started_after_the_shared_deadline(self):
        with patch.object(harness.time, 'monotonic', return_value=131), patch.object(harness.subprocess, 'run') as run:
            with self.assertRaises(TimeoutError): harness.recognize_frame(Path('/unused.png'), deadline=130)
        run.assert_not_called()

    def test_visible_failure_is_saved_and_stops_before_the_next_mutating_input(self):
        with tempfile.TemporaryDirectory() as temporary:
            driver = self.driver(); driver.folder = Path(temporary); driver.booting = False; driver.check = Mock()
            driver.native = Mock()
            def capture(_):
                (driver.folder / 'probe.png').write_bytes(b'fixture-capture')
                driver.report['screenshots'].append({'name': 'probe.png', 'bytes': 15, 'sha256': 'fixture'})
            driver.native.capture.side_effect = capture
            lines = harness.ocr_lines(tsv([(1, 20, 200, 80, 90, '失敗')]))
            with patch.object(harness, 'recognize_frame', return_value=lines):
                with self.assertRaisesRegex(ValueError, 'visible native UI failure'): driver.click('実行する')
            self.assertEqual(len(driver.report['screenshots']), 1)
            driver.native.click.assert_not_called()


class LifecycleGuards(unittest.TestCase):
    def test_wallet_population_uses_explicit_ui_ceremonies_and_never_reveals_code(self):
        driver = Mock(); driver.wait.return_value = {'y': 500}
        with patch.object(harness.time, 'sleep'):
            harness.wallet_ui_flow(driver)
        clicks = [call.args[0] for call in driver.click.call_args_list]
        self.assertEqual(clicks.count('今月のテスト請求を確認・再試行'), 2)
        self.assertLess(clicks.index('Wallet利用条件を確認する'), clicks.index('$8.88 / 月のテストに同意する'))
        self.assertLess(clicks.index('月額テストの同意を取り消す'), clicks.index('予約内容を確認'))
        self.assertLess(clicks.index('認証して予約する'), clicks.index('予約を取消・保留を照合'))
        self.assertFalse(any('コードを表示' in value for value in clicks))
        self.assertEqual(driver.native.type.call_args_list[0].args, ('20.00',))
        self.assertEqual(driver.native.type.call_count, 1)
        self.assertEqual(driver.native.monitor.command.call_count, 8)

    def test_retained_wallet_boot_has_no_billing_consent_enrollment_or_reservation_action(self):
        driver = Mock(); harness.wallet_readonly_flow(driver)
        self.assertEqual([call.args[0] for call in driver.click.call_args_list],
                         ['テスト操作を開く', 'ATMで内容を確認', '取消済み'])
        driver.native.type.assert_not_called(); driver.native.monitor.command.assert_not_called()

    def test_closed_observation_holds_existing_lock_against_another_process(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary); state = root / 'device'; state.mkdir(mode=0o700)
            config = {'name': 'device'}; record = {'pid': 100, 'session': 'original'}
            for name, value in (('device.json', config), ('running.json', record)):
                path = state / name; path.write_text(json.dumps(value)); path.chmod(0o600)
            program = 'import fcntl,sys\nf=open(sys.argv[1],"r+")\ntry: fcntl.flock(f,fcntl.LOCK_EX|fcntl.LOCK_NB)\nexcept BlockingIOError: sys.exit(0)\nsys.exit(2)\n'
            with patch.object(harness.guest, 'BASE', root), patch.object(harness.guest, 'running', return_value=False):
                with harness.closed_device(config, record):
                    self.assertEqual(subprocess.run([sys.executable, '-c', program, str(state / 'lock')], timeout=10).returncode, 0)
            self.assertEqual(subprocess.run([sys.executable, '-c', program, str(state / 'lock')], timeout=10).returncode, 2)

    def test_replacement_running_record_blocks_every_closed_disk_observation(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary); state = root / 'device'; state.mkdir(mode=0o700)
            config = {'name': 'device'}
            (state / 'device.json').write_text(json.dumps(config))
            (state / 'running.json').write_text(json.dumps({'pid': 200, 'session': 'replacement'}))
            for path in state.iterdir(): path.chmod(0o600)
            observed = Mock()
            with patch.object(harness.guest, 'BASE', root), patch.object(harness.guest, 'running', return_value=True):
                with self.assertRaisesRegex(ValueError, 'replaced'):
                    with harness.closed_device(config, {'pid': 100, 'session': 'original'}): observed()
            observed.assert_not_called()

    def test_non_linux_preflight_never_starts_qemu_or_touches_disks(self):
        with patch.object(harness.sys, 'platform', 'darwin'), patch.object(harness.guest, 'start') as start, \
             patch.object(harness.subprocess, 'run') as command:
            with self.assertRaisesRegex(ValueError, 'NOT_RUN'): harness.preflight(Path('/unused'), Path('/unused'), 'soak', 'a'*40)
        start.assert_not_called(); command.assert_not_called()

    def test_first_and_later_shutdown_need_actual_guest_event_and_distinct_boot(self):
        event = [{'event': 'SHUTDOWN', 'data': {'guest': True}}]
        self.assertEqual(harness.verify_power([], [power_row(1)], event), power_row(1)['boot_id'])
        harness.verify_power([power_row(1)], [power_row(1), power_row(2)], event)
        for events in ([], [{'event': 'SHUTDOWN', 'data': {'guest': False}}], event + [{'event': 'RESET'}]):
            with self.assertRaises(ValueError): harness.verify_power([], [power_row(1)], events)
        with self.assertRaises(ValueError): harness.verify_power([power_row(1)], [power_row(1), power_row(1)], event)
        damaged = power_row(1); damaged['status'] = 'abandoned'
        with self.assertRaises((ValueError, AssertionError)): harness.verify_power([], [damaged], event)

    def test_all_other_business_roles_and_extra_tables_remain_strict(self):
        before = {role: {'schema_sha256': 's', 'tables': {'fixture': {'rows': 1, 'logical_sha256': 'r'}}}
                  for role in harness.retention.SOURCES}
        harness.unchanged_non_hub(before, copy.deepcopy(before))
        for role in before:
            changed = copy.deepcopy(before); changed[role]['tables']['fixture']['logical_sha256'] = 'changed'
            with self.subTest(role=role), self.assertRaises(ValueError): harness.unchanged_non_hub(before, changed)

    def test_normal_shutdown_sends_only_ui_confirmation_and_never_force_power(self):
        driver = Mock(); driver.limits = harness.contract.plan('lifecycle')['limits']
        with patch.object(harness.guest, 'running', return_value=False):
            harness.clean_shutdown(driver, {})
        self.assertEqual(driver.native.method_calls, [('click', (636, 26), {})])
        self.assertEqual([call.args[0] for call in driver.click.call_args_list], ['電源を切る', '確認して実行'])

    def test_shutdown_exit_first_seen_after_deadline_is_not_a_clean_pass(self):
        driver = Mock(); driver.limits = harness.contract.plan('lifecycle')['limits']
        with patch.object(harness.guest, 'running', return_value=False), patch.object(harness.time, 'monotonic', side_effect=[100, 161]):
            with self.assertRaisesRegex(ValueError, 'shutdown deadline'): harness.clean_shutdown(driver, {})

    def test_resource_summary_is_process_observation_not_guest_memory_claim(self):
        samples = [{'monotonic': 10, 'rss_kib': 100, 'cpu_seconds': 5},
                   {'monotonic': 12, 'rss_kib': 200, 'cpu_seconds': 7},
                   {'monotonic': 14, 'rss_kib': 120, 'cpu_seconds': 10}]
        result = harness.resource_summary(samples)
        self.assertEqual(result['peak_rss_kib'], 200)
        self.assertEqual(result['rss_growth_kib'], 20)
        self.assertEqual(result['cpu_cores_average'], 1.25)
        with self.assertRaises(ValueError): harness.resource_summary([])

    def test_preflight_only_freezes_full_profile_without_starting_a_device(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary); output = root / 'evidence'
            config = {'name': 'fixture-local-ab', 'schema': 'rock-desktop-device/6', 'images': str(root),
                      'sha256': {name: 'a'*64 for name in ('Image', 'rootfs.ext4', 'stage0.cpio.gz')},
                      'network': 'none', 'viewer': 'browser',
                      'boot': {'mode': 'signed-stage0', 'profile': 'local-development', 'factory_sha256': 'b'*64}}
            with patch.object(harness, 'preflight', return_value=(config, output)), \
                 patch.object(harness, 'extract_packages', return_value={'1.0.0': 'c'*64, '1.1.0': 'd'*64}), \
                 patch.object(harness.guest, 'start') as start:
                report = harness.run(root, root, 'soak', 'e'*40, boot_profile='local-ab', prepare_backup=True, preflight_only=True)
            start.assert_not_called()
            frozen = json.loads((output / 'plan.json').read_text())
            self.assertEqual(frozen['config'], config); self.assertTrue(frozen['prepare_backup'])
            self.assertEqual(frozen['wallet_preparation']['additional_normal_boot_shutdown_cycles'], 2)
            self.assertEqual(frozen['normal_boot_shutdown_cycles'], 5)
            self.assertEqual(report['status'], 'PREFLIGHT_ONLY')
            self.assertEqual(report['D2'], 'NOT_RUN'); self.assertEqual(report['D6'], 'NOT_RUN')
            self.assertEqual(report['plan_sha256'], harness.contract.hashed(frozen))

    def test_ui_failure_retains_owned_running_device_and_never_checks_live_disk(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary); output = root / 'evidence'
            config = {'name': 'fixture-fail', 'images': str(root), 'sha256': {}}
            record = {'pid': 123, 'session': '/synthetic/session', 'qmp_socket': '/synthetic/qmp'}
            with patch.object(harness, 'preflight', return_value=(config, output)), \
                 patch.object(harness, 'extract_packages', return_value={'1.0.0': 'c'*64, '1.1.0': 'd'*64}), \
                 patch.object(harness.guest, 'start', return_value=record) as start, \
                 patch.object(harness.guest, 'running', return_value=True), \
                 patch.object(harness, 'ResourceSampler') as sampler, patch.object(harness.power, 'Monitor') as monitor, \
                 patch.object(harness, 'ScreenDriver') as driver, patch.object(harness.retention, 'business_snapshot') as read:
                driver.return_value.wait.side_effect = ValueError('fixture missing actual UI state')
                with self.assertRaisesRegex(ValueError, 'missing actual UI state'):
                    harness.run(root, root, 'lifecycle', 'e'*40)
            start.assert_called_once(); read.assert_not_called()
            driver.return_value.native.click.assert_not_called()
            monitor.return_value.command.assert_not_called()
            failed = json.loads((output / 'report.json').read_text())
            self.assertEqual(failed['status'], 'FAIL'); self.assertTrue(failed['owned_device_running'])


if __name__ == '__main__': unittest.main()

"""Saved actual-frame result guards; these do not run a VM or manufacture jobs."""
import copy
import importlib.util
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import Mock,patch

HERE=Path(__file__).resolve().parents[1]/'os/desktop'
sys.path.insert(0,str(HERE))
spec=importlib.util.spec_from_file_location('business_result_ocr_tests',HERE/'verify-business.py')
h=importlib.util.module_from_spec(spec);spec.loader.exec_module(h)
FIXTURES=Path(__file__).with_name('fixtures')


def line(text,x,y,width=140,confidence=90):
    return [{'text':h.normalize(text),'confidence':confidence,'box':[x,y,width,25]}]


class BusinessResultOCR(unittest.TestCase):
    def fixture(self):
        proof=json.loads((FIXTURES/'business-result-ocr.json').read_text())
        self.assertEqual(proof['png_sha256'],'e86fe9149704c78cbc5c7f229237e16e757ebd6eccc6fdba7ed016ab08ca70e3')
        return proof['lines']

    def driver(self,lines):
        d=h.ScreenDriver(Mock(),Path('/unused'),{'ui_states':[]},{},Mock(),h.contract.plan('lifecycle')['limits'])
        d.limits['ui_state_seconds']=0;d.native=Mock();d.scan=Mock(return_value=(lines,{'sha256':'fixture'}))
        d.retain=Mock(return_value={'sha256':'fixture'});return d

    def select(self,d):
        with patch.object(h.time,'monotonic',return_value=100):return d.result('C4J5',evidence_label='business-result')

    def test_actual_frame_old_low_confidence_rejects_and_refined_literal_result_passes(self):
        before=h.ocr_lines((FIXTURES/'business-result-before.tsv').read_text())
        self.assertEqual(h.locate(before,'C4J5'),[])
        d=self.driver(self.fixture());result=self.select(d)
        self.assertEqual(result['phrase'],'Brief C4J5')
        self.assertTrue(d.report['ui_states'][0]['result_page_header'])
        self.assertTrue(d.report['ui_states'][0]['ascii_boundary'])
        self.assertEqual(d.scan.call_args.kwargs['regions'],(h.RESULT_TEXT,))
        d.native.click.assert_not_called();d.native.keys.assert_not_called()

    def test_all_actual_C_rendered_soak_and_lifecycle_frames_use_the_complete_result_selector(self):
        proof=json.loads((FIXTURES/'business-result-labels-ocr.json').read_text())
        self.assertEqual(proof['font_sha256'],'68a3fc98800b2a27b371f2fb79991daf3633bd89309d4ffaa6946fd587f375b5')
        self.assertEqual(len(proof['cases']),66)
        self.assertEqual({case['label'] for case in proof['cases'] if case['label'].startswith('C4J')},{f'C4J{i}' for i in range(61)})
        for case in proof['cases']:
            d=self.driver(case['lines'])
            with self.subTest(label=case['label'],version=case['version']),patch.object(h.time,'monotonic',return_value=100):
                d.result(case['label'],evidence_label='actual-c-host-fixture')
                self.assertEqual(len(d.report['ui_states'][0]['matches']),1)
                d.native.click.assert_not_called();d.native.keys.assert_not_called()
                for number in range(61):
                    other=f'C4J{number}'
                    if other!=case['label']:self.assertEqual(h.locate(case['lines'],'Brief '+other,ascii_boundary=True),[])

    def test_pass_selection_does_not_depend_on_the_expected_input_label(self):
        self.assertTrue(h.result_label_known([line('"proposal":"「Brief C1J1」の提案案',66,684,270,66.55)]))
        self.assertTrue(h.result_label_known([line('Brief C4J50',256,688)]))
        self.assertEqual(h.locate([line('Brief C4J50',256,688)],'Brief C4J5',ascii_boundary=True),[])
        for rows in ([line('Brief C4J5',256,688,confidence=44.99)], [line('Brief C4JS',256,688)],
                     [line('Brief C4J5',256,250)], []):
            with self.subTest(rows=rows):self.assertFalse(h.result_label_known(rows))

    def test_all_sixty_one_literal_labels_reject_prefix_suffix_and_character_substitution(self):
        for index in range(61):
            label=f'Brief C4J{index}'
            with self.subTest(label=label):
                self.assertEqual(len(h.locate([line('ご依頼「'+label+'」について',56,600)],label,ascii_boundary=True)),1)
                for other in (label+'0','X'+label,label.replace('C4J','C4S')):
                    self.assertEqual(h.locate([line(other,56,600)],label,ascii_boundary=True),[])
        self.assertEqual(h.locate([line('Brief C4JS',56,600)],'Brief C4J5',ascii_boundary=True),[])

    def test_missing_wrong_or_low_confidence_header_never_accepts_result_body(self):
        body=line('Brief C4J5',256,688)
        for header in ([],line('実行履歴',35,70),line('実行結果',35,350),line('実行結果',35,70,confidence=44.99)):
            d=self.driver(([header] if header else [])+[body])
            with self.subTest(header=header),self.assertRaises(TimeoutError):self.select(d)
            d.native.click.assert_not_called();d.native.keys.assert_not_called()

    def test_wrong_body_region_low_confidence_and_duplicate_labels_never_pass(self):
        header=line('実行結果',35,70)
        for bodies,error in [([line('Brief C4J5',256,250)],TimeoutError),([line('Brief C4J5',256,688,confidence=44.99)],TimeoutError),
                              ([line('Brief C4J50',256,688)],TimeoutError),([line('Brief C4J5',256,588),line('Brief C4J5',256,688)],ValueError)]:
            d=self.driver([header]+bodies)
            with self.subTest(bodies=bodies),self.assertRaises(error):self.select(d)
            d.native.click.assert_not_called();d.native.keys.assert_not_called()

    def test_refined_frame_found_after_original_deadline_never_passes_or_sends_input(self):
        d=self.driver(self.fixture());d.limits['ui_state_seconds']=30
        with patch.object(h.time,'monotonic',side_effect=[100,131]),self.assertRaisesRegex(TimeoutError,'original deadline'):
            d.result('C4J5',evidence_label='business-result')
        self.assertEqual(d.report['ui_states'],[]);d.native.click.assert_not_called();d.native.keys.assert_not_called()

    def test_complete_business_operation_deadline_is_shared_by_result_wait(self):
        d=self.driver(self.fixture());d.limits['ui_state_seconds']=30;d.operation_deadline=110
        with patch.object(h.time,'monotonic',side_effect=[100,111]),self.assertRaises(TimeoutError):
            d.result('C4J5',evidence_label='business-result')
        self.assertEqual(d.scan.call_args.args[0],110);d.native.click.assert_not_called()

    def test_noncanonical_or_arbitrary_result_selector_rejected_before_capture(self):
        d=self.driver(self.fixture())
        for label in ('C4JS','C4J5 trailing','.*','C40J5','C4J1000'):
            with self.subTest(label=label),self.assertRaises(ValueError):d.result(label,evidence_label='business-result')
        d.scan.assert_not_called()


if __name__=='__main__':unittest.main()

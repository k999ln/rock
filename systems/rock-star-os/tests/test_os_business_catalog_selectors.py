"""Saved-frame semantic guards. No QMP, guest, money or renderer is started."""
import copy
import importlib.util
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import Mock, patch

HERE = Path(__file__).resolve().parents[1] / 'os/desktop'
sys.path.insert(0, str(HERE))
spec = importlib.util.spec_from_file_location('business_catalog_selectors', HERE / 'verify-business.py')
h = importlib.util.module_from_spec(spec); spec.loader.exec_module(h)
FIXTURES = Path(__file__).with_name('fixtures')


def line(text, x, y, width=200, confidence=90):
    return [{'text': h.normalize(text), 'confidence': confidence, 'box': [x, y, width, 25]}]


class SemanticSelectors(unittest.TestCase):
    def driver(self, lines):
        d = h.ScreenDriver(Mock(), Path('/unused'), {'ui_states': []}, {}, Mock(), h.contract.plan('lifecycle')['limits'])
        d.native = Mock(); d.scan = Mock(return_value=(lines, {'sha256': 'fixture'}))
        d.retain = Mock(return_value={'sha256': 'fixture'})
        return d

    def fixture(self):
        proof = json.loads((FIXTURES / 'business-catalog-ocr.json').read_text())
        self.assertEqual(proof['png_sha256'], '50080acf15f8f906be1d7cea8ec5c2c8a6382275ba89fce8587b4799d42b71c6')
        return proof['lines']

    def select(self, d):
        return d.click(h.PRODUCT_NAMES['1.1.0'], exact_line=True, within=h.CATALOG_TITLE,
                       regions=(h.SEARCH_TEXT, h.CATALOG_TITLE), required=(h.contract.TOOL,), seconds=0)

    def test_actual_frame_old_small_version_fails_and_refined_full_name_selects(self):
        old = h.ocr_lines((FIXTURES / 'business-catalog-before.tsv').read_text())
        self.assertEqual(h.locate(old, 'v1.1.0'), [])
        d = self.driver(self.fixture())
        with patch.object(h.time, 'monotonic', return_value=100): self.select(d)
        d.native.click.assert_called_once_with(242, 270)
        self.assertIn(h.contract.TOOL, d.report['ui_states'][0]['required_same_frame'])

    def test_actual_title_without_same_frame_identity_never_clicks(self):
        lines = [words for words in self.fixture() if ''.join(w['text'] for w in words) != h.contract.TOOL]
        d = self.driver(lines)
        with patch.object(h.time, 'monotonic', return_value=100):
            with self.assertRaises(TimeoutError): self.select(d)
        d.native.click.assert_not_called()

    def test_product_prefix_is_not_a_full_name_match(self):
        self.assertEqual(h.locate([line('提案下書き（簡潔）', 130, 180)], '提案下書き', exact_line=True), [])

    def test_missing_low_confidence_wrong_region_or_duplicate_title_never_clicks(self):
        identity = line(h.contract.TOOL, 50, 180, 230)
        for rows, error in [([], TimeoutError), ([line(h.PRODUCT_NAMES['1.1.0'], 140, 250, confidence=44.99)], TimeoutError),
                            ([line(h.PRODUCT_NAMES['1.1.0'], 140, 500)], TimeoutError),
                            ([line(h.PRODUCT_NAMES['1.1.0'], 135, 250, 180), line(h.PRODUCT_NAMES['1.1.0'], 345, 250, 180)], ValueError)]:
            with self.subTest(rows=rows):
                d = self.driver([identity] + rows)
                with patch.object(h.time, 'monotonic', return_value=100):
                    with self.assertRaises(error): self.select(d)
                d.native.click.assert_not_called()

    def test_late_refined_match_keeps_original_deadline(self):
        d = self.driver(self.fixture())
        with patch.object(h.time, 'monotonic', side_effect=[100, 131]):
            with self.assertRaises(TimeoutError): self.select(d)
        d.native.click.assert_not_called()

    def test_detail_version_requires_name_publisher_and_page_in_same_frame(self):
        rows = [line('バージョン1.0.0', 139, 268), line('ツールの詳細', 35, 70),
                line('提案下書き', 138, 218), line('作成者 ' + h.PRODUCT_PUBLISHER, 34, 322, 300)]
        for missing in range(len(rows)):
            d = self.driver(rows[:missing] + rows[missing + 1:]); d.limits['ui_state_seconds'] = 0
            with patch.object(h.time, 'monotonic', return_value=100):
                with self.assertRaises(TimeoutError): d.verify_detail('1.0.0')
            d.native.click.assert_not_called()
        d = self.driver(rows)
        with patch.object(h.time, 'monotonic', return_value=100): d.verify_detail('1.0.0')

    def test_history_reads_first_card_title_not_small_version_or_fixed_click(self):
        rows = [line('実行履歴', 35, 70), line('提案下書き', 55, 180, 112), line('提案下書き', 55, 328, 112)]
        d = self.driver(rows); d.nav = Mock()
        with patch.object(h.time, 'monotonic', return_value=100): d.open_history('1.0.0')
        d.native.click.assert_called_once_with(111, 192)
        d.native.keys.assert_not_called()

    def test_literal_json_quotes_cannot_consume_later_tsv_rows(self):
        header = 'level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext\n'
        rows = h.ocr_lines(header + '5\t1\t1\t1\t1\t1\t35\t100\t10\t20\t90\t"\n'
                           + '5\t1\t2\t1\t1\t1\t35\t200\t90\t20\t91\tC1J0\n'
                           + '5\t1\t3\t1\t1\t1\t35\t300\t10\t20\t92\t"\n')
        self.assertEqual(len(rows), 3)
        self.assertEqual(h.locate(rows, 'C1J0')[0]['box'], [35, 200, 90, 20])
        self.assertFalse(any('\t' in word['text'] or '\n' in word['text'] for words in rows for word in words))


if __name__ == '__main__': unittest.main()

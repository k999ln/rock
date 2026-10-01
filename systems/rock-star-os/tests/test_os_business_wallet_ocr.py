"""Host-only OCR boundary guards; C/Wallet replay is separate actual evidence."""
from pathlib import Path
import json
import unittest
from unittest.mock import Mock, patch
from test_os_business_ui_harness import harness as h


def word(text, x=80, y=394, w=35, height=18, confidence=90):
    return {'text': h.normalize(text), 'confidence': confidence, 'box': [x, y, w, height]}


class WalletOCRGuards(unittest.TestCase):
    def test_actual_failed_run_enrollment_frame_uses_exact_label(self):
        proof = json.loads((Path(__file__).with_name('fixtures') / 'business-wallet-enrollment-ocr.json').read_text())
        self.assertEqual(proof['png_sha256'], '3aaf0a9cd7482b7f6759a1431f622f4650c2bf8b279059e4821a802edbc19513')
        matches = h.locate(proof['lines'], '試験認証器を登録する')
        self.assertEqual(matches, [{'x': 360, 'y': 524, 'box': [252, 507, 215, 34]}])
        self.assertTrue(56 <= matches[0]['x'] < 664 and 495 <= matches[0]['y'] < 549)

    def test_primary_original_color_needs_bright_ink_in_every_word(self):
        region = (100, 300, 120, 310)
        words = [word('確認', 101, 302, 5, 5), word('する', 110, 302, 5, 5)]
        pixels = bytearray([255] * 200); pixels[2 * 20 + 2] = 0
        self.assertFalse(h.primary_words_have_ink(words, pixels, region))
        pixels[3 * 20 + 11] = 0
        self.assertTrue(h.primary_words_have_ink(words, pixels, region))
        self.assertFalse(h.primary_words_have_ink([], pixels, region))
        with self.assertRaises(ValueError): h.primary_words_have_ink(words, pixels[:-1], region)
        with self.assertRaises(ValueError): h.primary_words_have_ink([word('外', 99, 302, 5, 5)], pixels, region)

    def test_secondary_region_excludes_disabled_palette(self):
        data = [(245, 243, 237)] * (720 * 960)
        for y in range(300, 350):
            for x in range(50, 650): data[y * 720 + x] = (232, 237, 229)
        for y in range(400, 450):
            for x in range(50, 650): data[y * 720 + x] = (231, 231, 224)
        image = Mock(); image.size = (720, 960); image.getdata.return_value = data
        self.assertEqual(h.accent_rectangles(image, secondary=True), [(50, 300, 650, 350)])

    def test_segmentation_anchors_are_literal_confident_and_bounded(self):
        title = [word('Wallet', x=34, y=70, w=120, height=30)]
        self.assertEqual(h.wallet_text_rows([title, [word('金額')]]), [(32, 382, 688, 424)])
        self.assertEqual(h.wallet_text_rows([title, [word('完了', y=480)]]), [(32, 468, 688, 510)])
        for row in [word('金額?', confidence=99), word('金額', confidence=44.99),
                    word('金額', y=160), word('金額', y=840), word('金額', height=27)]:
            self.assertEqual(h.wallet_text_rows([title, [row]]), [])
        with self.assertRaises(ValueError):
            h.wallet_text_rows([title] + [[word('金額', y=y)] for y in (300, 400, 500)])

    def test_wallet_segmentation_requires_unique_literal_header_in_same_frame(self):
        rows = [[word('完了', y=y)] for y in (300, 450, 600, 750)]
        self.assertEqual(h.wallet_text_rows(rows), [])
        for text, y, confidence in [('実行履歴', 70, 99), ('Wallet', 70, 44.99),
                                    ('Wallet', 890, 99), ('Wallet?', 70, 99)]:
            title = [word(text, x=34, y=y, w=140, height=30, confidence=confidence)]
            self.assertEqual(h.wallet_text_rows([title] + rows), [])
        for text in ('Wallet', 'ATMテスト', '予約の状態'):
            title = [word(text, x=34, y=70, w=140, height=30)]
            self.assertEqual(h.wallet_text_rows([title, rows[0]]), [(32, 288, 688, 330)])
        title = [word('Wallet', x=34, y=70, w=140, height=30)]
        second = [word('Wallet', x=250, y=70, w=140, height=30)]
        with self.assertRaises(ValueError): h.wallet_text_rows([title, second, rows[0]])

    def test_anchor_and_wrong_or_low_confidence_full_labels_never_click(self):
        for rows in ([[word('金額')]], [[word('テスト人金額 (USD)')]],
                     [[word('テスト金額 (USD)', confidence=44.99)]]):
            d = h.ScreenDriver(Mock(), Path('/unused'), {'ui_states': []}, {}, Mock(), h.contract.plan('lifecycle')['limits'])
            d.native = Mock(); d.scan = Mock(return_value=(rows, {'sha256': 'fixture'}))
            d.retain = Mock(return_value={'sha256': 'fixture'})
            with patch.object(h.time, 'monotonic', return_value=100):
                with self.assertRaises(TimeoutError): d.click('テスト金額 (USD)', seconds=0)
            d.native.click.assert_not_called()

    def test_notice_segmentation_needs_actual_success_or_error_background(self):
        image = Mock(); crop = Mock(); image.crop.return_value = crop; crop.convert.return_value = crop
        for color, expected in [((225, 236, 219), [(32, 148, 688, 188)]),
                                ((242, 225, 217), [(32, 148, 688, 188)]),
                                ((245, 243, 237), [])]:
            crop.getdata.return_value = [color] * (656 * 40)
            self.assertEqual(h.notice_regions(image), expected)

    def test_auth_button_full_crop_can_cross_content_boundary_without_footer_click(self):
        header = 'level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext\n'
        row = '5\t1\t1\t1\t1\t1\t20\t20\t200\t25\t90\tPINを確認して登録\n'
        lines = h.mapped_ocr(header + row, (358, 811, 682, 865), scale=1)
        self.assertEqual(h.locate(lines, 'PINを確認して登録')[0]['box'], [368, 821, 200, 25])
        with self.assertRaises(ValueError): h.mapped_ocr(header + row, (358, 811, 682, 961), scale=1)


if __name__ == '__main__': unittest.main()

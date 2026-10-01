"""Pure image-mask guards; actual saved-frame OCR is separate evidence."""
import unittest
from unittest.mock import Mock
from test_os_business_ui_harness import harness


def pixels(colors,width,height):
    rgb=Mock();rgb.size=(width,height);rgb.getdata.return_value=colors
    gray=Mock();gray.getdata.return_value=[sum(color)//3 for color in colors]
    rgb.convert.side_effect=lambda mode:rgb if mode=='RGB' else gray
    return rgb


class PrimaryContourGuards(unittest.TestCase):
    def test_rounded_exterior_is_not_ink_and_dim_labels_are_not_brightened(self):
        light=(250,250,244);green=(35,105,85);white=(255,255,255);dim=(170,170,170)
        rows=[light,light,green,green,white,green,green,light,light]
        rows += [light]*9
        rows += [green,green,green,green,dim,green,green,green,green]
        actual=harness.primary_text_pixels(pixels(rows,9,3))
        expected=bytearray([255]*27);expected[4]=0
        self.assertEqual(actual,bytes(expected))

    def test_missing_green_contour_has_no_text_and_oversized_crop_is_rejected(self):
        self.assertEqual(harness.primary_text_pixels(pixels([(255,255,255)]*9,9,1)),bytes([255]*9))
        with self.assertRaises(ValueError):harness.primary_text_pixels(pixels([],721,1))
        with self.assertRaises(ValueError):harness.primary_text_pixels(pixels([],9,91))
        with self.assertRaises(ValueError):harness.primary_text_pixels(pixels([],9,1))


if __name__=='__main__':unittest.main()

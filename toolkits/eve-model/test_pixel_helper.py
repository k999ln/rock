import subprocess
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import pixel

class PixelHelperTests(unittest.TestCase):
    def test_failed_intent_does_not_expose_credential_fragment(self):
        private='private-nonce-marker'
        error=subprocess.CalledProcessError(1,['adb','shell','am','start','http://127.0.0.1/#'+private])
        with patch('pixel.subprocess.check_output',side_effect=error):
            with self.assertRaises(ValueError) as caught:pixel.adb('shell','am','start','http://127.0.0.1/#'+private)
        self.assertNotIn(private,str(caught.exception))
    def test_reverse_inventory_discards_serials(self):
        with patch('pixel.adb',return_value='private-device-serial tcp:18749 tcp:18749\n'):
            result=pixel.mappings()
        self.assertEqual(result,[{'local':'tcp:18749','remote':'tcp:18749'}])
        self.assertNotIn('private-device-serial',str(result))

    def test_mapping_ownership_is_revoked_and_old_record_cannot_remove_replacement(self):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td);record={'createdByThisSession':True,'active':True,'port':pixel.PORT,'target':'frankel'}
            (root/'usb-bridge.json').write_text(json.dumps(record))
            mapping=[{'local':'tcp:18749','remote':'tcp:18749'}]
            with patch('pixel.target'),patch('pixel.mappings',return_value=mapping),patch('pixel.adb') as adb:
                self.assertTrue(pixel.cleanup(root)['removed'])
                self.assertFalse(pixel.cleanup(root)['removed'])
                self.assertEqual(adb.call_count,1)
                with self.assertRaisesRegex(ValueError,'unowned'):pixel.connect(root)

    def test_new_reverse_uses_atomic_no_rebind(self):
        with tempfile.TemporaryDirectory() as td,patch('pixel.target'),patch('pixel.mappings',return_value=[]),patch('pixel.adb') as adb:
            pixel.connect(Path(td));adb.assert_called_once_with('reverse','--no-rebind','tcp:18749','tcp:18749')

    def test_same_hardware_replacement_is_rejected_without_storing_serial(self):
        with tempfile.TemporaryDirectory() as td,patch('pixel.adb',side_effect=['device','frankel','private-one','device','frankel','private-two']):
            root=Path(td);pixel.target(root)
            self.assertNotIn('private-one',(root/'pixel-device-binding.json').read_text())
            with self.assertRaisesRegex(ValueError,'device changed'):pixel.target(root)

    def test_private_tabs_url_editor_fragment_and_overlay_are_refused(self):
        c={'nonce':'nonce-secret','token':'cookie-secret'};prefix='cafe123456789abc'
        def xml(url='127.0.0.1:18749',focus='false',urlbar=True,overlay=False):
            return '<hierarchy>'+ (f'<node package="{pixel.BROWSER}" resource-id="{pixel.BROWSER}:id/url_bar" text="{url}" focused="{focus}"/>' if urlbar else '')+''.join(f'<node package="{pixel.BROWSER}" text="{text}"/>' for text in [pixel.TITLE,'この課題を実行','保存済み結果を再読込','候補 '+prefix])+('<node package="com.android.permissioncontroller"/>' if overlay else '')+'</hierarchy>'
        self.assertIsNotNone(pixel.validate_ui(xml(),prefix,c))
        for bad in [xml(urlbar=False),xml(url='private.example'),xml(url='127.0.0.1:18749/#non...'),xml(focus='true'),xml(overlay=True)]:
            with self.assertRaises(ValueError):pixel.validate_ui(bad,prefix,c)
        shade=xml().replace('</hierarchy>','<node package="com.android.systemui" resource-id="com.android.systemui:id/notification_stack_scroller" text="private notification"/></hierarchy>')
        with self.assertRaisesRegex(ValueError,'notification'):pixel.validate_ui(shade,prefix,c)
        bar=xml().replace('</hierarchy>','<node package="com.android.systemui" resource-id="com.android.systemui:id/status_bar"><node package="com.android.systemui" resource-id="com.android.systemui:id/clock" text="04:00"/></node></hierarchy>')
        tree=pixel.validate_ui(bar,prefix,c)
        self.assertNotIn('04:00',pixel.browser_only_xml(tree))
        self.assertIn(pixel.TITLE,pixel.browser_only_xml(tree))

if __name__=='__main__':unittest.main()

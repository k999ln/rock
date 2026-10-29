import json
from pathlib import Path
import tempfile
import unittest
from diagnose_start import launch

class LaunchTests(unittest.TestCase):
    def test_refused_admission_never_starts_node_or_creates_ledger(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);calls=[]
            with self.assertRaisesRegex(ValueError,'no diagnostic child'):
                launch(root,'base','python','candidate',admission_fn=lambda *_:{'admitted':False},run=lambda *a,**k:calls.append(a))
            self.assertEqual(calls,[]);self.assertFalse((root/'runtime.sqlite').exists())
            self.assertFalse(json.loads((root/'diagnostic-launch-admission.json').read_text())['admitted'])
    def test_admitted_once_uses_explicit_mode_and_does_not_rewrite_admission(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);calls=[]
            launch(root,'base','python','candidate',True,admission_fn=lambda *_:{'admitted':True},run=lambda *a,**k:calls.append((a,k)))
            self.assertEqual(calls[0][0][0][-1],'reviewed-resumption');self.assertTrue(calls[0][1]['check'])
            with self.assertRaises(FileExistsError):launch(root,'base','python','candidate',True,admission_fn=lambda *_:{'admitted':True},run=lambda *a,**k:calls.append(a))
            self.assertEqual(len(calls),1)

if __name__=='__main__':unittest.main()

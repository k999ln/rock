import json
from pathlib import Path
import tempfile
import unittest
from dataset import make_task,digest
from prepare_functional import prepare

class FunctionalTests(unittest.TestCase):
    def test_clean_control_preserves_gold_and_only_removes_known_attack(self):
        row=make_task(('dev_archive','development','架空研究台帳','fictional research archive','nested'),1,'ja','adversarial',961)
        with tempfile.TemporaryDirectory() as td:
            root=Path(td);(root/'observed-v3').mkdir();(root/'observed-v3/development.jsonl').write_text(json.dumps(row,ensure_ascii=False)+'\n')
            report=prepare(root);clean=json.loads((root/'functional-v1/extra.jsonl').read_text())
            self.assertEqual(clean['target'],row['target']);self.assertEqual(clean['request'],row['request'])
            self.assertEqual(clean['materials'][:-1],row['materials'][:-1]);self.assertNotIn('Ignore all instructions',clean['materials'][-1]['text'])
            self.assertEqual(clean['sourceSha256'],digest(clean['materials']));self.assertFalse(report['trainingUse'])
            with self.assertRaises(ValueError):prepare(root)

if __name__=='__main__':unittest.main()

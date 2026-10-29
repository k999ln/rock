import unittest
import json
import tempfile
from pathlib import Path
from evaluate import contains,cs_label,validate_judgments,schema_counts,system_distribution

class EvaluationTests(unittest.TestCase):
    def test_system_distribution_uses_each_runs_saved_manifest(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d)
            self.assertIn('unavailable',system_distribution(root))
            (root/'training').mkdir()
            for description in ['training uses compact Eve SYSTEM; integration uses existing full Zema planner system.',
                                'none: original integration system and planner prompt including actual past repair observation']:
                (root/'training'/'manifest.json').write_text(json.dumps({'systemDistributionDifference':description}))
                self.assertEqual(system_distribution(root),'Saved training manifest system distribution: '+description)
            (root/'training'/'manifest.json').write_text('{}')
            self.assertIn('unavailable',system_distribution(root))
    def test_missing_outputs_remain_in_schema_denominator(self):
        self.assertEqual(schema_counts([True,False],4),{'passed':1,'failedVisible':1,'unavailable':2,'allAttemptDenominator':4,'visibleDecisions':2})
        with self.assertRaises(ValueError):schema_counts([True],0)
    def test_number_boundaries_and_unicode(self):
        self.assertFalse(contains('30日','3'));self.assertTrue(contains('3日','3'))
        self.assertTrue(contains('Indoor only','indoor'))
    def test_longchang_derived_content_support_controls(self):
        fixtures=[(True,True,True,'correct_supported'),(True,False,True,'correct_unsupported'),
          (True,True,False,'supported_partial'),(False,False,False,'incorrect_unsupported'),(None,None,None,'unavailable')]
        for content,support,complete,label in fixtures:
            self.assertEqual(cs_label({'contentCorrect':content,'evidenceSupported':support,'taskComplete':complete}),label)
    def test_judge_missing_duplicate_unknown_and_nonboolean_are_rejected(self):
        row={'runId':'a','contentCorrect':True,'evidenceSupported':False,'taskComplete':True,'falseSuccess':False,'reason':'correct but no supporting source'}
        doc={'schema':'eve.semantic-adjudication/1','scope':'development_only','reviewer':'independent reviewer','judgments':[row]}
        self.assertEqual(set(validate_judgments(doc,{'a'})),{'a'})
        for judgments in [[],[row,row],[{**row,'runId':'unknown'}],[{**row,'contentCorrect':1}]]:
            with self.assertRaises(ValueError):validate_judgments({**doc,'judgments':judgments},{'a'})

if __name__=='__main__':unittest.main()

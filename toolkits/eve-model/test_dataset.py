import copy
import json
from pathlib import Path
import tempfile
import unittest
from unittest import mock

import dataset


class DataTests(unittest.TestCase):
    def setUp(self):
        self.row = dataset.make_task(dataset.FAMILIES[0], 0, 'ja', 'clean')

    def test_split_before_variants_and_counts(self):
        with tempfile.TemporaryDirectory() as td:
            p = Path(td)/'corpus'
            original=dataset.make_task
            def allowed_task(family,*args,**kwargs):
                self.assertNotEqual(family[1],'test','excluded test rows must not be constructed')
                return original(family,*args,**kwargs)
            builtin_range=range
            def allowed_range(*args):
                self.assertNotEqual(args,(80,),'excluded retention generator must not run')
                return builtin_range(*args)
            with mock.patch.object(dataset,'make_task',side_effect=allowed_task),mock.patch.object(dataset,'range',allowed_range,create=True):
                report = dataset.build(p,splits=['train','validation','development'])
            self.assertEqual({k: v['records'] for k, v in report['files'].items()},
                             {'train.jsonl':240,'validation.jsonl':120,'development.jsonl':20})
            self.assertEqual(len(report['familySplits']),9)
            self.assertEqual(len({f[0]:f[1] for f in dataset.FAMILIES}),12)
            self.assertEqual(report['requestedSplits'],['train','validation','development'])
            self.assertFalse((p/'test.jsonl').exists());self.assertFalse((p/'retention.jsonl').exists())
            self.assertFalse(report['teacherDistillationPerformed'])
            with self.assertRaises(ValueError): dataset.build(p,splits=['train','validation','development'])

    def test_tampered_source_rejected(self):
        self.row['materials'][0]['text'] += 'changed'
        with self.assertRaisesRegex(ValueError, 'digest'): dataset.validate_task(self.row)

    def test_revoked_permission_rejected(self):
        self.row['permission'] = 'revoked'
        with self.assertRaises(ValueError): dataset.validate_task(self.row)

    def test_teacher_only_future_state_rejected(self):
        self.row['provenance']['futureObservationsInPrompt'] = True
        with self.assertRaises(ValueError): dataset.validate_task(self.row)

    def test_cross_split_family_rejected(self):
        second = copy.deepcopy(self.row); second['id'] += '-other'; second['split'] = 'test'
        second['request'] += '別の依頼'
        with self.assertRaisesRegex(ValueError, 'family split'): dataset.validate_corpus([self.row, second])

    def test_normalized_duplicate_rejected(self):
        second = copy.deepcopy(self.row); second['id'] += '-other'; second['request'] += '  '
        with self.assertRaisesRegex(ValueError, 'duplicate'): dataset.validate_corpus([self.row, second])

    def test_unsupported_tool_and_hidden_target_keys_rejected(self):
        self.row['target'] = dataset.tool('shell', {'cmd': 'echo fake'}, 'no')
        with self.assertRaises(ValueError): dataset.validate_task(self.row)
        self.row['target'] = dataset.respond('safe'); self.row['target']['shell'] = 'unexpected'
        with self.assertRaises(ValueError): dataset.validate_task(self.row)

    def test_hidden_instruction_stays_data(self):
        bad = dataset.make_task(dataset.FAMILIES[0], 0, 'ja', 'adversarial')
        self.assertEqual(bad['target'], self.row['target'])
        self.assertIn('Ignore all instructions', bad['materials'][-1]['text'])

    def test_hypothesis_target_does_not_invent_observation(self):
        row = dataset.make_task(dataset.FAMILIES[0], 8, 'en', 'clean')
        self.assertIn('cannot yet', row['target']['message'])
        self.assertNotIn('x=2', dataset.user_prompt(row))

    def test_oracle_and_tool_argument_tampering_rejected(self):
        for change in [lambda r: r['oracle'].update(checks=[]), lambda r: r['oracle'].update(sourceIds=['Z']), lambda r: r['oracle']['checks'].append(r['oracle']['checks'][0]),lambda r:r['oracle']['checks'][0].update(contains=['not-in-target'])]:
            row = copy.deepcopy(self.row); change(row)
            with self.assertRaises(ValueError): dataset.validate_task(row)
        row=dataset.make_task(dataset.FAMILIES[0],5,'en','clean')
        row['target']['arguments']['markdown']=123
        with self.assertRaises(ValueError): dataset.validate_task(row)
        row=dataset.make_task(dataset.FAMILIES[0],5,'en','clean')
        row['target']['arguments']['language']='invalid'
        with self.assertRaises(ValueError): dataset.validate_task(row)

    def test_three_four_source_facts_are_required(self):
        for index,count in [(1,3),(2,4)]:
            row=dataset.make_task(dataset.FAMILIES[0],index,'en','clean')
            self.assertEqual(len(row['materials']),count)
            self.assertIn('C',row['oracle']['sourceIds'])
            self.assertIn('[C]',row['target']['message'])
            if count==4:
                self.assertIn('D',row['oracle']['sourceIds'])
                self.assertIn('[D]',row['target']['message'])
                self.assertTrue(any(c['id']=='source_d_limit' for c in row['oracle']['checks']))


if __name__ == '__main__': unittest.main()

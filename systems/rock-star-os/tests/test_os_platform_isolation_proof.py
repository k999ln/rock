"""Distinct scoped guest proof cannot silently become full financial acceptance."""
import importlib.util
import json
from pathlib import Path
import unittest

spec=importlib.util.spec_from_file_location('platform_isolation_proof',Path(__file__).resolve().parents[1]/'os/verify-platform.py')
host=importlib.util.module_from_spec(spec);spec.loader.exec_module(host)


class ScopedProof(unittest.TestCase):
    def setUp(self):
        self.value={'schema':'rock-os-platform-isolation/1','status':'PASS_SCOPED','scope':'game-isolation',
            'checks':['actual peer boundary'],'wallet_financial_assertions':'NOT_RUN; separate online acceptance'}
    def raw(self): return json.dumps(self.value)
    def log(self): return 'ROCK_PLATFORM_ISOLATION_GUEST_PASS '+self.raw()+'\n'
    def test_live_and_stopped_scoped_proofs_match(self): self.assertEqual(self.value,host.scoped_proof(self.log(),self.raw()))
    def test_legacy_or_duplicate_marker_is_rejected(self):
        for log in ('ROCK_PLATFORM_GUEST_PASS '+self.raw(),self.log()*2):
            with self.subTest(log=log),self.assertRaisesRegex(RuntimeError,'exactly one'):host.scoped_proof(log,self.raw())
    def test_financial_pass_cannot_be_inferred_from_partial_proof(self):
        for field,value in (('status','PASS'),('scope','local-full'),('wallet_financial_assertions','PASS'),('checks',[])):
            old=self.value[field];self.value[field]=value
            with self.subTest(field=field),self.assertRaisesRegex(RuntimeError,'scoped'):host.scoped_proof(self.log(),self.raw())
            self.value[field]=old
    def test_stopped_record_must_equal_observed_serial(self):
        raw=self.raw();self.value['checks'].append('unobserved claim')
        with self.assertRaisesRegex(RuntimeError,'differs'):host.scoped_proof(self.log(),raw)


if __name__=='__main__':unittest.main()

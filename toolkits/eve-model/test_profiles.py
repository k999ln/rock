import json
from pathlib import Path
import tempfile
import unittest
from profiles import profile,runtime_problem,require_decision,worker_failure,GIB

class ProfileTests(unittest.TestCase):
    def sample(self):return {'vmPressureLevel':1,'freeInactiveSpeculativeBytes':3*GIB,'macOSFreePercent':30,'diskFreeBytes':30*GIB}
    def test_small_profile_is_explicit_not_automatic_gate_relabel(self):
        p=profile('small-memory-v1');self.assertEqual((p['numLayers'],p['loraRank'],p['loraScale']),(2,4,8))
        self.assertLess(p['rssLimitBytes'],profile('standard')['rssLimitBytes'])
        with tempfile.TemporaryDirectory() as td:
            with self.assertRaises(FileNotFoundError):require_decision(td,p['id'])
            Path(td,'resource-profile-decision.json').write_text(json.dumps({'schema':'eve.resource-profile-decision/1','profileId':p['id'],'status':'adopted','originalStandardGateAccepted':False,'reason':'explicit reduced development profile'}))
            self.assertTrue(require_decision(td,p['id']))
    def test_pressure_low_available_memory_and_peak_stop(self):
        p=profile('small-memory-v1');base=self.sample();self.assertIsNone(runtime_problem(base,p))
        for change in [{'vmPressureLevel':2},{'vmPressureLevel':4},{'freeInactiveSpeculativeBytes':511*1024**2},{'macOSFreePercent':9},{'diskFreeBytes':11*GIB}]:
            self.assertIsNotNone(runtime_problem({**base,**change},p))
        self.assertIsNotNone(runtime_problem(base,p,rss_bytes=2*GIB+1))
        self.assertIsNotNone(runtime_problem(base,p,metal_peak_bytes=int(1.75*GIB)+1))

    def test_real_mlx_allocator_runtime_errors_halt_without_retry(self):
        for message in ['[malloc] Unable to allocate 2048 bytes.', '[metal::malloc] Resource limit (2048) exceeded.']:
            record=worker_failure(RuntimeError(message))
            self.assertTrue(record['fatal']);self.assertIsNone(record['actualOutputTokens'])
            self.assertEqual(record['message'],message)

    def test_warning_hypothesis_is_bounded_and_keeps_stricter_headroom(self):
        p=profile('bounded-warning-hypothesis-v1');base={**self.sample(),'vmPressureLevel':2,'freeInactiveSpeculativeBytes':3.5*GIB}
        self.assertGreater(p['minimumAvailableBytes'],profile('small-memory-v1')['minimumAvailableBytes'])
        self.assertEqual((p['maxTrainingUpdates'],p['trainingChildWallLimitSeconds']),(8,120))
        self.assertIsNone(runtime_problem(base,p))
        for change in [{'vmPressureLevel':4},{'vmPressureLevel':3},{'freeInactiveSpeculativeBytes':2*GIB-1},{'sampleAgeSeconds':2.01}]:
            self.assertIsNotNone(runtime_problem({**base,**change},p))

if __name__=='__main__':unittest.main()

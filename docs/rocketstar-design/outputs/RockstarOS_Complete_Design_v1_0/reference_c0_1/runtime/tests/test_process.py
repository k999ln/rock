"""Actual process termination, with synthetic plant only. No hardware isolation claim."""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import unittest
from colony_core.core import Controller


class ProcessSeparationTests(unittest.TestCase):
    def test_local_ticks_continue_after_supervisor_killed(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);processes=[]
            try:
                for name in ['controller','supervisor']:
                    cmd=[sys.executable,'-m','colony_core',name+'-worker',
                        '--db',str(root/(name+'.sqlite')),'--ready',str(root/(name+'.ready')),
                        '--ticks','600','--interval','.01']
                    processes.append(subprocess.Popen(cmd,cwd=Path(__file__).resolve().parents[1],stdout=subprocess.DEVNULL,stderr=subprocess.PIPE))
                deadline=time.monotonic()+5
                while not all((root/(name+'.ready')).exists() for name in ['controller','supervisor']):
                    self.assertLess(time.monotonic(),deadline,'workers did not become ready')
                    self.assertTrue(all(p.poll() is None for p in processes))
                    time.sleep(.02)
                c=Controller(root/'controller.sqlite')
                try:
                    before=c.snapshot()
                    processes[1].kill();processes[1].wait(timeout=3)
                    target=before['sampleSeq']+12
                    deadline=time.monotonic()+4
                    while c.snapshot()['sampleSeq']<target:
                        self.assertLess(time.monotonic(),deadline,'local loop stopped after Core loss')
                        time.sleep(.02)
                    after=c.snapshot()
                    self.assertIsNone(processes[0].poll())
                    self.assertEqual(after['criticalServedKw'],4)
                    self.assertEqual(after['actualFlexibleKw'],0)
                    self.assertEqual(after['criticalDeficitKw'],0)
                    self.assertEqual(after['state'],'LOCAL_HOLD')
                    proof={'mode':'SIM_ONLY','hardwareConnected':False,
                        'supervisorTerminated':True,'controllerAlive':True,
                        'beforeSampleSeq':before['sampleSeq'],'afterSampleSeq':after['sampleSeq'],
                        'observedState':after['state'],'criticalServedKw':after['criticalServedKw'],
                        'scope':'separate host processes and SQLite files, same host and OS',
                        'doesNotProve':['physical electrical protection','hard real-time','independent power','radiation tolerance']}
                    if os.environ.get('COLONY_PROCESS_EVIDENCE'):
                        Path(os.environ['COLONY_PROCESS_EVIDENCE']).write_text(json.dumps(proof,indent=2)+'\n')
                finally:c.close()
            finally:
                for p in processes:
                    if p.poll() is None:p.terminate()
                    p.wait(timeout=3)
                    p.stderr.close()


if __name__=='__main__':unittest.main()

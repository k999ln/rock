import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import time
import unittest
from manifest import finite_metric

class TrainingControlTests(unittest.TestCase):
    def test_nonfinite_losses_are_rejected(self):
        for bad in [float('nan'),float('inf'),float('-inf')]:
            with self.assertRaisesRegex(ValueError,'nonfinite'):finite_metric(bad,'loss')
        self.assertEqual(finite_metric(1.5,'loss'),1.5)

    def test_sigterm_supervisor_reaps_its_owned_synthetic_child(self):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td);module=str(Path(__file__).parent.resolve());pidfile=root/'child.pid'
            child_code='import os,time,pathlib;pathlib.Path('+repr(str(pidfile))+').write_text(str(os.getpid()));time.sleep(60)'
            control='import sys,json,pathlib;sys.path.insert(0,'+repr(module)+');from train import supervise_owned;from manifest import atomic_json;r=supervise_owned([sys.executable,"-c",'+repr(child_code)+'],pathlib.Path('+repr(td)+'),60);atomic_json(pathlib.Path('+repr(str(root/'receipt.json'))+'),r)'
            parent=subprocess.Popen([sys.executable,'-c',control],stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
            try:
                for _ in range(200):
                    if pidfile.exists():break
                    if parent.poll() is not None: self.fail(parent.stderr.read().decode())
                    time.sleep(0.01)
                self.assertTrue(pidfile.exists());pid=int(pidfile.read_text())
                parent.send_signal(signal.SIGTERM);parent.wait(timeout=8)
                receipt=json.loads((root/'receipt.json').read_text())
                self.assertIn('InterruptedError',receipt['stopReason'])
                with self.assertRaises(ProcessLookupError):os.kill(pid,0)
            finally:
                if parent.poll() is None:
                    parent.terminate()
                    try:parent.wait(timeout=8)
                    except subprocess.TimeoutExpired:parent.kill();parent.wait(timeout=5)
                parent.stderr.close()

if __name__=='__main__':unittest.main()

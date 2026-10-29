import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import time
import unittest
from unittest.mock import patch
from manifest import finite_metric
import train
from train import supervise_owned

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

    def test_signal_during_poll_is_not_swallowed_and_handlers_are_restored(self):
        previous={sig:signal.getsignal(sig) for sig in (signal.SIGTERM,signal.SIGINT)}
        for selected in (signal.SIGTERM,signal.SIGINT):
            with self.subTest(signal=selected), tempfile.TemporaryDirectory() as td:
                original=os.waitpid
                delivered=False
                def during_poll(pid,flags):
                    nonlocal delivered
                    if flags == os.WNOHANG and not delivered:
                        delivered=True
                        os.kill(os.getpid(),selected)
                    return original(pid,flags)
                if hasattr(subprocess,'_del_safe'):
                    injector=patch.object(subprocess._del_safe,'waitpid',during_poll)
                else:
                    original_poll=subprocess.Popen._internal_poll
                    def poll(child,*args,**kwargs):
                        return original_poll(child,*args,_waitpid=during_poll,**kwargs)
                    injector=patch.object(subprocess.Popen,'_internal_poll',poll)
                with injector:
                    result=supervise_owned([sys.executable,'-c','import time;time.sleep(60)'],Path(td),60)
                self.assertTrue(delivered)
                self.assertIn('InterruptedError',result['stopReason'])
                self.assertLess(result['elapsedSeconds'],5)
                with self.assertRaises(ProcessLookupError): os.kill(result['ownedChildPid'],0)
                for sig,handler in previous.items(): self.assertIs(signal.getsignal(sig),handler)

    def test_signal_during_child_start_is_retained_and_child_reaped(self):
        original=subprocess.Popen
        delivered=False
        def start(*args,**kwargs):
            nonlocal delivered
            child=original(*args,**kwargs)
            if not delivered:
                delivered=True
                os.kill(os.getpid(),signal.SIGTERM)
            return child
        with tempfile.TemporaryDirectory() as td, patch.object(subprocess,'Popen',start):
            result=supervise_owned([sys.executable,'-c','import time;time.sleep(60)'],Path(td),60)
        self.assertTrue(delivered)
        self.assertIn('InterruptedError',result['stopReason'])
        with self.assertRaises(ProcessLookupError): os.kill(result['ownedChildPid'],0)

    def test_signal_during_cleanup_is_not_reported_as_success(self):
        original=train.stop_owned
        def stop(child,grace):
            os.kill(os.getpid(),signal.SIGTERM)
            return original(child,grace)
        previous=signal.getsignal(signal.SIGTERM)
        with tempfile.TemporaryDirectory() as td, patch.object(train,'stop_owned',stop):
            result=supervise_owned([sys.executable,'-c','pass'],Path(td),60)
        self.assertIn('InterruptedError',result['stopReason'])
        self.assertIs(signal.getsignal(signal.SIGTERM),previous)
        with self.assertRaises(ProcessLookupError): os.kill(result['ownedChildPid'],0)

    def test_handlers_restored_when_log_cannot_be_created(self):
        previous={sig:signal.getsignal(sig) for sig in (signal.SIGTERM,signal.SIGINT)}
        with tempfile.TemporaryDirectory() as td:
            (Path(td)/'training.log').touch()
            with self.assertRaises(FileExistsError): supervise_owned([],Path(td),60)
        for sig,handler in previous.items(): self.assertIs(signal.getsignal(sig),handler)

if __name__=='__main__':unittest.main()

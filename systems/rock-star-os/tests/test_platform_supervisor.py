"""Real Linux child crash/restart and graceful stop; no service privileges required."""
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import time
import unittest

ROOT = Path(__file__).resolve().parents[1]


@unittest.skipUnless(sys.platform == 'linux', 'Linux parent-death supervision')
class PlatformSupervisorTests(unittest.TestCase):
    def test_crash_restarts_and_stop_reaps_owned_child(self):
        with tempfile.TemporaryDirectory() as temporary:
            work = Path(temporary)
            child = work / 'child.py'
            counter = work / 'count'
            pidfile = work / 'pid'
            child.write_text('import os,time\nfrom pathlib import Path\n'
                             f'p=Path({str(counter)!r});n=int(p.read_text())+1 if p.exists() else 1;p.write_text(str(n))\n'
                             'if n==1:raise SystemExit(13)\n'
                             f'Path({str(pidfile)!r}).write_text(str(os.getpid()))\n'
                             'while True:time.sleep(.05)\n')
            script = ('import sys;sys.path.insert(0,sys.argv[1]);from supervisor import supervise;'
                      'supervise([sys.executable,sys.argv[2]],initial_delay=.05,maximum_delay=.1,stop_timeout=1)')
            with subprocess.Popen([sys.executable,'-B','-c',script,str(ROOT/'os/platform'),str(child)],
                                  stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL) as process:
                try:
                    deadline=time.monotonic()+8
                    while not pidfile.exists() and time.monotonic()<deadline:time.sleep(.02)
                    self.assertTrue(pidfile.exists(),'child was not restarted')
                    child_pid=int(pidfile.read_text())
                    self.assertEqual(counter.read_text(),'2')
                    process.send_signal(signal.SIGTERM)
                    self.assertEqual(process.wait(timeout=4),0)
                    with self.assertRaises(ProcessLookupError):os.kill(child_pid,0)
                    time.sleep(.15)
                    self.assertEqual(counter.read_text(),'2','stop must not restart a child')
                finally:
                    if process.poll() is None:process.kill();process.wait()

    def test_installed_command_is_fixed_and_cannot_accept_user_command(self):
        result=subprocess.run([sys.executable,str(ROOT/'os/platform/supervisor.py'),'--exec','/bin/true'],
                              capture_output=True,text=True,timeout=3)
        self.assertNotEqual(result.returncode,0)
        self.assertIn('PLATFORM_SUPERVISOR_ARGUMENTS_DENIED',result.stderr)

    def test_crashed_leaders_descendant_is_reaped_before_restart(self):
        with tempfile.TemporaryDirectory() as temporary:
            work = Path(temporary)
            child = work / 'leader.py'
            descendant = work / 'descendant.pid'
            restarted = work / 'restarted'
            grandchild = ('import os,signal,time;from pathlib import Path;'
                         'signal.signal(signal.SIGTERM,signal.SIG_IGN);'
                         f'Path({str(descendant)!r}).write_text(str(os.getpid()));'
                         'time.sleep(30)')
            child.write_text('import os,subprocess,sys,time\nfrom pathlib import Path\n'
                             f'p=Path({str(descendant)!r})\n'
                             'if not p.exists():\n'
                             f' subprocess.Popen([sys.executable,"-c",{grandchild!r}])\n'
                             ' while not p.exists():time.sleep(.01)\n'
                             ' raise SystemExit(13)\n'
                             'try:\n os.kill(int(p.read_text()),0)\n alive=True\n'
                             'except ProcessLookupError:alive=False\n'
                             f'Path({str(restarted)!r}).write_text(str(alive))\n'
                             'while True:time.sleep(.05)\n')
            script = ('import sys;sys.path.insert(0,sys.argv[1]);from supervisor import supervise;'
                      'supervise([sys.executable,sys.argv[2]],initial_delay=.05,maximum_delay=.1,stop_timeout=.15)')
            with subprocess.Popen([sys.executable,'-B','-c',script,str(ROOT/'os/platform'),str(child)],
                                  stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL) as process:
                try:
                    deadline = time.monotonic() + 8
                    while not restarted.exists() and time.monotonic() < deadline:
                        time.sleep(.02)
                    self.assertTrue(restarted.exists(),'service did not restart after descendant cleanup')
                    self.assertEqual(restarted.read_text(),'False','orphan must not overlap restarted service')
                    with self.assertRaises(ProcessLookupError):
                        os.kill(int(descendant.read_text()),0)
                    process.send_signal(signal.SIGTERM)
                    self.assertEqual(process.wait(timeout=4),0)
                finally:
                    if process.poll() is None:process.kill();process.wait()


if __name__ == '__main__':unittest.main()

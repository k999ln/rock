import importlib.util
from pathlib import Path
import signal
import os
import subprocess
import sys
import time
import unittest
from unittest.mock import Mock, patch

module_path = Path(os.environ.get('PIXEL_WORKER_MODULE', str(Path(__file__).resolve().parent.parent / 'toolkits/sky-linux-local/worker.py')))
spec = importlib.util.spec_from_file_location('pixel_worker', module_path)
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)


class WorkerLifetimeTest(unittest.TestCase):
    @unittest.skipUnless(sys.platform == 'linux', 'Requires actual Linux parent-death signal')
    def test_real_child_dies_when_its_worker_is_killed(self):
        code = f'''import importlib.util,os,subprocess,sys,time
sys.dont_write_bytecode=True
s=importlib.util.spec_from_file_location('worker',{str(module_path)!r});m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
parent=os.getpid()
p=subprocess.Popen([sys.executable,'-c','import time;time.sleep(30)'],start_new_session=True,preexec_fn=lambda:m.prepare_child(20,parent))
print(p.pid,flush=True)
time.sleep(30)
'''
        parent = subprocess.Popen([sys.executable, '-c', code], stdout=subprocess.PIPE, text=True, start_new_session=True)
        receipt = None
        try:
            pid = int(parent.stdout.readline())
            receipt = worker.identity(pid)
            self.assertTrue(receipt)
            parent.kill()
            parent.wait(timeout=5)
            for _ in range(100):
                stat = Path(f'/proc/{pid}/stat')
                if not worker.alive(receipt):
                    return
                try:
                    if stat.read_text().split(') ', 1)[1].split()[0] == 'Z':
                        return
                except FileNotFoundError:
                    return
                time.sleep(.02)
            self.fail('Child remained running after worker exit')
        finally:
            if receipt and worker.alive(receipt):
                try:
                    os.killpg(receipt['pid'], signal.SIGKILL)
                except ProcessLookupError:
                    pass
            if parent.poll() is None:
                parent.kill()
            parent.wait(timeout=5)
            parent.stdout.close()

    def test_model_lifetime_is_bound_before_resource_limits(self):
        libc = Mock()
        libc.prctl.return_value = 0
        with patch('ctypes.CDLL', return_value=libc), patch.object(worker.os, 'getppid', return_value=123), patch.object(worker, 'limits') as limits:
            worker.prepare_child(20, 123)
        libc.prctl.assert_called_once_with(1, signal.SIGKILL, 0, 0, 0)
        limits.assert_called_once_with(20)

    def test_missing_parent_is_fail_closed(self):
        libc = Mock()
        libc.prctl.return_value = 0
        with patch('ctypes.CDLL', return_value=libc), patch.object(worker.os, 'getppid', return_value=124), patch.object(worker.os, 'kill') as kill, patch.object(worker, 'limits') as limits:
            with self.assertRaises(RuntimeError):
                worker.prepare_child(20, 123)
            kill.assert_called_once_with(worker.os.getpid(), signal.SIGKILL)
            limits.assert_not_called()

    def test_unavailable_kernel_guard_prevents_model_execution(self):
        libc = Mock()
        libc.prctl.return_value = -1
        with patch('ctypes.CDLL', return_value=libc), patch.object(worker, 'limits') as limits:
            with self.assertRaises(OSError):
                worker.prepare_child(20, 123)
            limits.assert_not_called()


if __name__ == '__main__':
    unittest.main()

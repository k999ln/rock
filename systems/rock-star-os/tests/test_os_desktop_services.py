"""Disposable process faults only; never attaches to a saved OS or listener."""
import importlib.util
import json
import os
from pathlib import Path
import signal
import socket
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]/'os/desktop'
sys.path.insert(0,str(ROOT))
spec = importlib.util.spec_from_file_location('rock_desktop_services',ROOT/'services.py')
services = importlib.util.module_from_spec(spec); spec.loader.exec_module(services)


class StartupCancellation(unittest.TestCase):
    def test_publish_is_bounded_and_stops_before_next_package(self):
        event = threading.Event()
        with tempfile.TemporaryDirectory() as temporary:
            package = Path(temporary)/'fixture'; package.write_bytes(b'public test fixture')
            def publish(*args,**kwargs):
                self.assertEqual(kwargs['timeout'],1)
                event.set()
                return {'accepted':True}
            with patch.object(services,'running',return_value=True),patch.object(services,'publish',side_effect=publish) as called:
                with self.assertRaisesRegex(ValueError,'stopped'):
                    services.publish_packages([package,package],package,Path(temporary),event,{})
            self.assertEqual(called.call_count,1)

    def test_stopped_startup_does_not_launch_compiler(self):
        event = threading.Event(); event.set()
        with patch.object(services.subprocess,'Popen') as spawn:
            with self.assertRaisesRegex(ValueError,'stopped'):
                services.compile_launcher(['must-not-run'],event,{})
        spawn.assert_not_called()

    def test_compiler_timeout_reaps_its_disposable_child(self):
        children = []
        real_spawn = subprocess.Popen
        def spawn(*args,**kwargs):
            child = real_spawn(*args,**kwargs); children.append(child); return child
        with patch.object(services,'running',return_value=True),patch.object(services.subprocess,'Popen',side_effect=spawn):
            with self.assertRaisesRegex(ValueError,'timed out'):
                services.compile_launcher([sys.executable,'-c','import time; time.sleep(30)'],threading.Event(),{},timeout=.1)
        self.assertEqual(len(children),1)
        self.assertIsNotNone(children[0].returncode)


@unittest.skipUnless(sys.platform == 'linux' and hasattr(os,'WNOWAIT'),'Linux unreaped session ownership proof')
class SupervisorGroupFaults(unittest.TestCase):
    def group_fixture(self,root,exit_early=False):
        # The owned descendant holds only a newly allocated UNIX listener.
        descendant = ('import os,signal,socket,sys,time; from pathlib import Path; '
                      'signal.signal(signal.SIGTERM,signal.SIG_IGN); '
                      'sock=socket.socket(socket.AF_UNIX); sock.bind(sys.argv[1]); sock.listen(1); '
                      'Path(sys.argv[2]).write_text(str(os.getpid())); time.sleep(30)')
        script = ('import os,signal,subprocess,sys,time; from pathlib import Path; '
                  'signal.signal(signal.SIGTERM,signal.SIG_IGN); '
                  'subprocess.Popen([sys.executable,"-c",sys.argv[1],sys.argv[2],sys.argv[3]]); '
                  'deadline=time.monotonic()+5\n'
                  'while not Path(sys.argv[3]).exists() and time.monotonic()<deadline: time.sleep(.01)\n'+
                  ('os._exit(0)' if exit_early else 'time.sleep(30)'))
        child = subprocess.Popen([sys.executable,'-c',script,descendant,str(root/'listener.sock'),str(root/'descendant.pid')],start_new_session=True)
        self.addCleanup(self.cleanup_group,child)
        deadline = time.monotonic()+5
        while not (root/'descendant.pid').exists():
            if time.monotonic()>deadline: self.fail('disposable child did not start')
            time.sleep(.02)
        return child,int((root/'descendant.pid').read_text())

    @staticmethod
    def cleanup_group(child):
        if child.returncode is None:
            try: os.killpg(child.pid,signal.SIGKILL)
            except ProcessLookupError: pass
            child.wait(timeout=5)

    def assert_stopped(self,child,descendant,root):
        self.assertIsNotNone(child.returncode)
        deadline=time.monotonic()+3
        while time.monotonic()<deadline:
            try: state=(Path('/proc')/str(descendant)/'stat').read_text().rsplit(')',1)[1].split()[0]
            except (FileNotFoundError, ProcessLookupError): break  # /proc may disappear after open.
            if state=='Z': break
            time.sleep(.02)
        else: self.fail('owned descendant survived cleanup')
        with socket.socket(socket.AF_UNIX) as probe:
            with self.assertRaises(ConnectionRefusedError): probe.connect(str(root/'listener.sock'))

    def test_timeout_kills_descendant_even_when_term_is_ignored(self):
        with tempfile.TemporaryDirectory(prefix='rock-group-fault-') as temporary:
            root=Path(temporary); child,descendant=self.group_fixture(root)
            services.stop_supervisor(child,grace=.1)
            self.assert_stopped(child,descendant,root)

    def test_exited_unreaped_leader_still_owns_descendant_group(self):
        with tempfile.TemporaryDirectory(prefix='rock-group-fault-') as temporary:
            root=Path(temporary); child,descendant=self.group_fixture(root,exit_early=True)
            deadline=time.monotonic()+3
            while not services.supervisor_exited(child):
                self.assertLess(time.monotonic(),deadline); time.sleep(.02)
            self.assertIsNone(child.returncode)  # Not reaped; PID cannot be recycled.
            services.stop_supervisor(child,grace=.1)
            self.assert_stopped(child,descendant,root)

    def test_ensure_readiness_timeout_cleans_group_and_preserves_foreign_listener(self):
        with tempfile.TemporaryDirectory(prefix='rock-ensure-fault-') as temporary:
            root=Path(temporary); child,descendant=self.group_fixture(root)
            real_stop=services.stop_supervisor
            with socket.socket(socket.AF_UNIX) as foreign:
                foreign.bind(str(root/'foreign.sock')); foreign.listen(1)
                with patch.object(services,'status',return_value={'running':True,'network':'development-services','session':'fixture'}), \
                     patch.object(services,'state_path',return_value=root),patch.object(services.subprocess,'Popen',return_value=child), \
                     patch.object(services,'stop_supervisor',side_effect=lambda owned:real_stop(owned,grace=.1)):
                    with self.assertRaisesRegex(ValueError,'readiness timed out'):
                        services.ensure('fixture',startup_timeout=.1)
                self.assert_stopped(child,descendant,root)
                self.assertFalse((root/'services/supervisor.json').exists())
                with socket.socket(socket.AF_UNIX) as connection:
                    connection.connect(str(root/'foreign.sock'))
                accepted,_=foreign.accept(); accepted.close()

    def test_unowned_process_group_is_rejected_without_signalling(self):
        child=subprocess.Popen([sys.executable,'-c','import time; time.sleep(30)'])
        try:
            with patch.object(services.os,'killpg') as signal_group:
                with self.assertRaisesRegex(ValueError,'owned process group'):
                    services.stop_supervisor(child,grace=.1)
            signal_group.assert_not_called()
            self.assertIsNone(child.poll())
        finally:
            child.terminate(); child.wait(timeout=5)


if __name__=='__main__': unittest.main()

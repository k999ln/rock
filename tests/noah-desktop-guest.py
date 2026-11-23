"""Lifecycle tests; no X server or host desktop is opened by this suite."""
import importlib.util
import pathlib
import unittest
from contextlib import ExitStack
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

spec = importlib.util.spec_from_file_location(
    'guest', pathlib.Path(__file__).resolve().parents[1] /
    'scripts/noah-agent-runtime/desktop_runner.py')
guest = importlib.util.module_from_spec(spec)
spec.loader.exec_module(guest)


class Child:
    def __init__(self, result=None):
        self.returncode = result
        self.terminated = False

    def poll(self):
        return self.returncode

    def terminate(self):
        self.terminated = True
        self.returncode = -15

    def wait(self, timeout=None):
        return self.returncode

    def kill(self):
        self.returncode = -9


class GuestTests(unittest.TestCase):
    def run_guest(self, mode):
        children, commands, handlers = [], [], {}
        entry = MagicMock()
        entry.resolve.return_value = entry
        entry.is_relative_to.return_value = mode != 'invalid'
        entry.is_file.return_value = True
        entry.suffix = '.py'
        entry.__str__.return_value = '/input/main.py'
        entry.parent = '/input'

        def spawn(args, **kwargs):
            commands.append((args, kwargs))
            child = Child(0 if args[0] == '/usr/bin/python3' and mode in ('success', 'probe') else None)
            children.append(child)
            return child

        def run(args, **kwargs):
            if args[0] == 'xdpyinfo':
                return SimpleNamespace(returncode=1 if mode == 'startup-failure' else 0)
            if args[0] == 'xprop':
                return SimpleNamespace(returncode=0, stdout=b'' if mode == 'wm-not-ready' else b'window id # 0x20000b')
            return SimpleNamespace(returncode=0)

        def sleep(_seconds):
            if len(children) == 4:
                if mode == 'display-loss':
                    children[0].returncode = 1
                elif mode == 'wm-loss':
                    children[1].returncode = 1
                elif mode == 'cancel':
                    handlers[guest.signal.SIGTERM](None, None)

        with ExitStack() as stack:
            for target, value in [
                ('sys.argv', ['runner', '--probe' if mode == 'probe' else '/input/main.py']),
                ('pathlib.Path', MagicMock(return_value=entry)),
                ('subprocess.Popen', MagicMock(side_effect=spawn)),
                ('subprocess.run', MagicMock(side_effect=run)),
                ('signal.signal', lambda sig, fn: handlers.update({sig: fn})),
                ('time.sleep', sleep),
            ]:
                stack.enter_context(patch.object(
                    getattr(guest, target.split('.')[0]), target.split('.')[1], value))
            stack.enter_context(patch.dict(guest.os.environ, {
                'DISPLAY': ':0', 'SSH_AUTH_SOCK': '/host/socket',
                'DBUS_SESSION_BUS_ADDRESS': '/host/dbus', 'PULSE_SERVER': 'host',
            }))
            result = guest.main()
        return result, children, commands

    def test_private_display_and_cleanup_on_success(self):
        result, children, commands = self.run_guest('success')
        self.assertEqual(result, 0)
        self.assertTrue(all(c.returncode is not None for c in children))
        xvfb, options = commands[0]
        self.assertIn('-nolisten', xvfb)
        self.assertEqual(xvfb[xvfb.index('-nolisten') + 1], 'tcp')
        for _, options in commands:
            self.assertEqual(options['env']['DISPLAY'], ':99')
            self.assertIn(options['env'].get('DBUS_SESSION_BUS_ADDRESS'), [None, 'unix:path=/tmp/noah-session/bus'])
            for name in ('SSH_AUTH_SOCK', 'PULSE_SERVER'):
                self.assertNotIn(name, options['env'])

    def test_startup_failure_never_starts_agent(self):
        result, children, commands = self.run_guest('startup-failure')
        self.assertEqual(result, 70)
        self.assertEqual(len(commands), 1)
        self.assertTrue(children[0].terminated)

    def test_connection_probe_uses_only_trusted_code(self):
        result, children, commands = self.run_guest('probe')
        self.assertEqual(result, 0)
        self.assertEqual(commands[-1][0], ['/usr/bin/python3', '-I', '-u', '/opt/noah/desktop_session.py', '--probe'])
        self.assertNotIn('runpy', commands[-1][0][-1])
        self.assertTrue(all(c.returncode is not None for c in children))

    def test_window_manager_must_be_ready_before_the_agent(self):
        result, children, commands = self.run_guest('wm-not-ready')
        self.assertEqual(result, 70)
        self.assertEqual(len(commands), 2)
        self.assertTrue(all(c.terminated for c in children))

    def test_loss_of_display_or_window_manager_stops_agent(self):
        for mode in ('display-loss', 'wm-loss'):
            result, children, _ = self.run_guest(mode)
            self.assertEqual(result, 70)
            self.assertTrue(children[-1].terminated)
            self.assertTrue(all(c.returncode is not None for c in children))

    def test_cancel_reaps_all_children(self):
        result, children, _ = self.run_guest('cancel')
        self.assertNotEqual(result, 0)
        self.assertTrue(all(c.terminated for c in children))

    def test_invalid_source_never_starts_display(self):
        result, children, _ = self.run_guest('invalid')
        self.assertEqual(result, 64)
        self.assertEqual(children, [])


class AgentDesktopTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        location = pathlib.Path(__file__).resolve().parents[1] / 'scripts/noah-agent-runtime/noah_desktop.py'
        spec = importlib.util.spec_from_file_location('driver', location)
        cls.driver = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.driver)

    def test_refuses_host_display_before_running_cli(self):
        with patch.dict(self.driver.os.environ, {'DISPLAY': ':0'}, clear=True), patch.object(self.driver.subprocess, 'run') as run:
            with self.assertRaises(RuntimeError):
                self.driver.snapshot('editor')
            run.assert_not_called()

    def test_refuses_unavailable_accessibility_bus(self):
        with patch.object(self.driver, '_invoke', return_value={'platform': 'linux', 'permissions': {'accessibility': {'state': 'denied'}}}):
            with self.assertRaises(RuntimeError):
                self.driver.status()

    def test_text_is_sent_on_stdin_and_refs_are_scoped(self):
        with patch.object(self.driver, '_invoke', return_value={}) as command:
            self.driver.set_value('@s123:e8', 'a value')
            command.assert_called_once_with('set-value', '@s123:e8', '--stdin', stdin='a value')
            with self.assertRaises(ValueError):
                self.driver.set_value('--invalid', 'value')


if __name__ == '__main__':
    unittest.main()

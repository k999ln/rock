"""Pinned independent display ports retain explicit VM/source/socket guards."""
import copy
import json
from pathlib import Path
import socket
import subprocess
import sys
import unittest
from unittest.mock import patch
from types import SimpleNamespace

import test_os_desktop_launcher_v2 as v2fixtures

launcher = v2fixtures.launcher


class LauncherV3(unittest.TestCase):
    def setUp(self):
        self.fixture = v2fixtures.LauncherV2()
        self.fixture.setUp()
        self.addCleanup(self.fixture.doCleanups)
        self.fixture.value.update(schema='rock-desktop-launcher/3', port=5910, viewer_port=8900)

    def test_v3_loads_both_explicit_ports_and_retains_the_same_vm_identity(self):
        config = self.fixture.load()
        self.assertEqual(config['port'], 5910)
        self.assertEqual(launcher.browser_port(config), 8900)
        self.assertTrue(launcher.explicit_profile(config))
        self.assertEqual(config['vm_identity_sha256'], self.fixture.value['vm_identity_sha256'])
        self.assertEqual(launcher.guest_python(config)[:2], ['/usr/bin/env', 'PATH=' + launcher.LINUX_TOOL_PATH])

    def test_noninteger_privileged_out_of_range_or_duplicate_ports_fail(self):
        for field, value in (('port', True), ('port', 1023), ('port', 65536),
                             ('viewer_port', '8900'), ('viewer_port', 5910), ('viewer_port', 0)):
            config = copy.deepcopy(self.fixture.value)
            config[field] = value
            with self.subTest(field=field, value=value), self.assertRaisesRegex(ValueError, 'display ports'):
                self.fixture.load(config)

    def test_existing_v2_does_not_accept_a_new_port_field(self):
        config = copy.deepcopy(self.fixture.value)
        config.update(schema='rock-desktop-launcher/2', port=5909)
        with self.assertRaisesRegex(ValueError, 'manifest'):
            self.fixture.load(config)
        del config['viewer_port']
        loaded = self.fixture.load(config)
        self.assertEqual(launcher.browser_port(loaded), 8899)

    def test_changed_pinned_ports_cannot_adopt_an_existing_display_binding(self):
        config = self.fixture.load()
        state = Path(config['host_state'])
        state.mkdir(mode=0o700)
        with launcher.launcher_lock(config, state):
            pass
        changed = copy.deepcopy(self.fixture.value)
        changed['viewer_port'] = 8901
        new = self.fixture.load(changed)
        with self.assertRaisesRegex(ValueError, 'different launcher profile'), launcher.launcher_lock(new, state):
            self.fail('changed ports adopted an existing display binding')

    def test_v3_lsof_checks_the_pinned_websocket_listener(self):
        config = self.fixture.load()
        output = 'p123\nf5\nn127.0.0.1:5910\nTST=LISTEN\n'
        with patch.object(launcher, 'run', return_value=SimpleNamespace(stdout=output)) as run:
            self.assertTrue(launcher.tunnel_listening(config, 123))
        self.assertIn('-iTCP@127.0.0.1:5910', run.call_args.args[0])
        with patch.object(launcher, 'run', return_value=SimpleNamespace(stdout=output.replace('5910', '5909'))):
            self.assertFalse(launcher.tunnel_listening(config, 123))

    def test_foreign_viewer_listener_is_refused_on_exact_configured_port(self):
        config = self.fixture.load()
        with socket.socket() as foreign:
            foreign.bind(('127.0.0.1', 0))
            foreign.listen(1)
            config['viewer_port'] = foreign.getsockname()[1]
            with patch.object(launcher, 'remote') as remote:
                with self.assertRaises(OSError):
                    launcher.browser_port_preflight(config, self.fixture.root / 'no-state')
                remote.assert_not_called()
            self.assertEqual(foreign.getsockname()[1], config['viewer_port'])

    def test_viewer_url_and_secret_fragment_use_only_both_pinned_ports(self):
        config = self.fixture.load()
        expected = 'http://127.0.0.1:8900/index.html'
        called = []
        def ensure(state, session, **ports):
            called.append(ports)
            return expected
        credential = {'session': 'same-session', 'password': 'TEST_-12'}
        with patch.dict(sys.modules, {'browser_server': SimpleNamespace(ensure_viewer=ensure)}), \
             patch.object(launcher, 'remote', return_value=credential):
            safe, opened = launcher.browser_display_url(config, credential, self.fixture.root, True)
        self.assertEqual(called, [{'port': 8900, 'websocket_port': 5910}])
        self.assertEqual(safe, expected)
        self.assertEqual(opened, expected + '#port=5910&password=TEST_-12')
        self.assertNotIn('password', safe)

    def game_value(self):
        value = copy.deepcopy(self.fixture.value)
        value['device'].update(schema='rock-desktop-device/7', network='game-authority',
            boot={'mode': 'signed-stage0', 'profile': 'development-game-authority',
                  'factory_sha256': 'b'*64, 'profile_sha256': 'c'*64},
            game={'config': '/var/tmp/rockstaros-preview-authority/sandbox.json', 'sha256': 'd'*64,
                  'authority_id': 'f3d7cd5e-e30e-4f12-908c-3d87b43ea001'})
        return value

    def test_game_device_has_distinct_strict_profile_and_authority_binding(self):
        config = self.fixture.load(self.game_value())
        self.assertEqual(config['device']['network'], 'game-authority')
        record = self.fixture.record(config)
        record['network'] = 'game-authority'
        launcher.verify_device_record(config, record, started=True)
        record['network'] = 'none'
        with self.assertRaisesRegex(ValueError, 'different launcher'):
            launcher.verify_device_record(config, record, started=True)

    def test_game_profile_cannot_downgrade_guards_or_enter_v2(self):
        for mutate in (lambda value: value.update(schema='rock-desktop-launcher/2'),
                       lambda value: value['device'].update(network='none'),
                       lambda value: value['device']['boot'].pop('profile_sha256'),
                       lambda value: value['device']['boot'].update(profile='local-development'),
                       lambda value: value['device']['game'].update(config='/var/tmp/../foreign'),
                       lambda value: value['device']['game'].update(authority_id='not-a-uuid'),
                       lambda value: value['device']['game'].update(secret='unrecognized')):
            value = self.game_value()
            mutate(value)
            with self.subTest(value=value), self.assertRaises(ValueError):
                self.fixture.load(value)


if __name__ == '__main__':
    unittest.main()

import importlib.util
import json
import os
from pathlib import Path
import socket
import tempfile
import unittest
from unittest.mock import patch

PATH = Path(__file__).resolve().parents[1] / 'os/desktop/guest.py'
SPEC = importlib.util.spec_from_file_location('rock_desktop_guest', PATH)
guest = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(guest)


class DesktopSafety(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.images = self.root / 'images'
        self.images.mkdir()
        for name in ('Image', 'rootfs.ext4'):
            (self.images / name).write_bytes(b'not an OS; validation-only fixture ' + name.encode())
        self.config = {'schema':'rock-desktop-device/1', 'name':'test-device', 'images':str(self.images),
                       'sha256':{name:guest.digest(self.images / name) for name in ('Image','rootfs.ext4')}}
        self.base = patch.object(guest, 'BASE', self.root / 'devices')
        self.platform = patch.object(guest.sys, 'platform', 'linux')
        # These data guards must not depend on unrelated live QEMU verification
        # sessions. Capacity refusal is covered explicitly below.
        self.processes = patch.object(guest, 'process_identity', return_value=None)
        self.base.start()
        self.platform.start()
        self.processes.start()
        self.addCleanup(self.temp.cleanup)
        self.addCleanup(self.base.stop)
        self.addCleanup(self.platform.stop)
        self.addCleanup(self.processes.stop)

    def test_two_live_devices_refuse_before_data_checks_or_spawn(self):
        state = guest.state_path('test-device')
        data = state / 'userdata.ext4'
        data.write_bytes(b'preserved existing data')
        identity = {'start_ticks': '123', 'command': ['qemu-system-aarch64', 'fixture']}
        with patch.object(guest.Path, 'glob', return_value=[Path('/proc/101'), Path('/proc/102')]), \
                patch.object(guest, 'process_identity', return_value=identity), \
                patch.object(guest, 'remove_stale_socket') as sockets, \
                patch.object(guest.subprocess, 'run') as run, \
                patch.object(guest.subprocess, 'Popen') as spawn:
            with self.assertRaisesRegex(ValueError, 'two virtual devices'):
                guest.start(self.config)
        sockets.assert_not_called()
        run.assert_not_called()
        spawn.assert_not_called()
        self.assertEqual(data.read_bytes(), b'preserved existing data')

    def test_unknown_existing_data_is_never_formatted(self):
        state = guest.state_path('test-device')
        data = state / 'userdata.ext4'
        data.write_bytes(b'existing user data')
        with patch.object(guest.subprocess, 'run') as run, self.assertRaisesRegex(ValueError, 'unidentified existing'):
            guest.start(self.config)
        run.assert_not_called()
        self.assertEqual(data.read_bytes(), b'existing user data')

    def test_wrong_image_hash_and_configuration_fail_before_formatting(self):
        with patch.object(guest.subprocess, 'run') as run:
            (self.images / 'Image').write_bytes(b'changed')
            with self.assertRaisesRegex(ValueError, 'hash mismatch'):
                guest.start(self.config)
        run.assert_not_called()
        self.assertFalse(guest.BASE.exists())

    def test_saved_device_cannot_silently_change_images(self):
        state = guest.state_path('test-device')
        previous = dict(self.config, images='/different/frozen-images')
        (state / 'device.json').write_text(json.dumps(previous))
        data = state / 'userdata.ext4'
        data.write_bytes(b'keep')
        with patch.object(guest.subprocess, 'run') as run, self.assertRaisesRegex(ValueError, 'different OS images'):
            guest.start(self.config)
        run.assert_not_called()
        self.assertEqual(data.read_bytes(), b'keep')

    def test_saved_data_recovery_is_read_only_and_never_automatic_repair(self):
        state = guest.state_path('test-device')
        (state / 'device.json').write_text(json.dumps(self.config))
        data = state / 'userdata.ext4'
        data.write_bytes(b'not ext4')
        with patch.object(guest.subprocess, 'run') as run, patch.object(guest.subprocess, 'Popen') as popen:
            run.return_value.returncode = 4
            with self.assertRaisesRegex(ValueError, 'explicit recovery'):
                guest.start(self.config)
        self.assertEqual(run.call_args.args[0], ['e2fsck','-f','-n',str(data)])
        popen.assert_not_called()
        self.assertEqual(data.read_bytes(), b'not ext4')

    def test_repeated_start_reuses_exact_owned_process_without_data_mutation(self):
        state = guest.state_path('test-device')
        identity = {'start_ticks':'1200', 'command':['qemu-system-aarch64','expected']}
        previous = {'pid':123, 'identity':identity, 'config':self.config}
        (state / 'running.json').write_text(json.dumps(previous))
        with patch.object(guest, 'process_identity', return_value=identity), patch.object(guest.subprocess,'run') as run:
            result = guest.start(self.config)
        self.assertTrue(result['running'] and result['reused'])
        run.assert_not_called()
        self.assertFalse((state / 'userdata.ext4').exists())

    def test_missing_or_recycled_process_identity_is_not_running(self):
        with patch.object(guest, 'process_identity', return_value=None):
            self.assertFalse(guest.running({'pid':123}))
            self.assertFalse(guest.running({'pid':123,'identity':None}))
        with patch.object(guest, 'process_identity', return_value={'start_ticks':'2','command':['qemu-system-aarch64']}):
            self.assertFalse(guest.running({'pid':123,'identity':{'start_ticks':'1','command':['qemu-system-aarch64']}}))

    def test_unix_only_display_readonly_os_no_network_or_test_flags(self):
        state = self.root / 'state'
        args = guest.command(self.config, state, state / 'session')
        self.assertEqual(args[args.index('-vnc')+1], 'unix:' + str(state / 'vnc.sock'))
        self.assertEqual(args[args.index('-nic')+1], 'none')
        self.assertNotIn('-no-reboot', args)
        self.assertFalse(any('verify=1' in part or 'hostfwd=' in part for part in args))
        self.assertTrue(any('rootfs.ext4' in part and 'readonly=on' in part for part in args))

    def test_symlink_or_option_injection_is_rejected(self):
        self.root.joinpath('devices').symlink_to(self.root)
        with self.assertRaisesRegex(ValueError, 'private'):
            guest.state_path('test-device')
        for name in ('../data','a/b',''):
            with self.assertRaisesRegex(ValueError, 'invalid'):
                guest.state_path(name)
        with self.assertRaisesRegex(ValueError, 'option characters'):
            guest.validate_config(dict(self.config, images='/tmp/images,readonly=off'))

    def test_development_network_requires_explicit_versioned_configuration(self):
        selected = dict(self.config,schema='rock-desktop-device/2',network='development-services')
        guest.validate_config(selected)
        args = guest.command(selected,self.root/'state',self.root/'session')
        self.assertIn('user,id=store-net',args)
        self.assertFalse(any('hostfwd=' in value for value in args))
        for config in (dict(self.config,network='development-services'),dict(selected,network='internet')):
            with self.assertRaises(ValueError): guest.validate_config(config)

    def test_live_unrecorded_display_is_preserved_before_any_data_check(self):
        state = guest.state_path('test-device')
        path = state / 'vnc.sock'
        with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as listener:
            listener.bind(str(path))
            listener.listen(1)
            inode = path.stat().st_ino
            with patch.object(guest.subprocess, 'run') as run, self.assertRaisesRegex(ValueError, 'still listening'):
                guest.start(self.config)
            run.assert_not_called()
            self.assertEqual(path.stat().st_ino, inode)
            connection, _ = listener.accept()
            connection.close()

    def test_confirmed_stale_socket_removed_but_regular_file_preserved(self):
        state = guest.state_path('test-device')
        path = state / 'vnc.sock'
        with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as listener:
            listener.bind(str(path))
        guest.remove_stale_socket(path)
        self.assertFalse(path.exists())
        path.write_text('unrelated file')
        with self.assertRaisesRegex(ValueError, 'unexpected'):
            guest.remove_stale_socket(path)
        self.assertEqual(path.read_text(), 'unrelated file')


if __name__ == '__main__':
    unittest.main()

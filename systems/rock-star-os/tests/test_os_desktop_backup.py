"""Host file/lifecycle guards. Actual ext4 and restored boot are separate evidence."""
import importlib.util
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]/'os/desktop'
sys.path.insert(0,str(ROOT))
import guest
spec = importlib.util.spec_from_file_location('rock_desktop_backup',ROOT/'backup.py')
backup = importlib.util.module_from_spec(spec); spec.loader.exec_module(backup)


class OfflineBackup(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name); self.base = self.root/'devices'
        for module in (guest,backup):
            item = patch.object(module,'BASE',self.base); item.start(); self.addCleanup(item.stop)
        images = self.root/'images'; images.mkdir()
        for name in ('Image','rootfs.ext4'): (images/name).write_bytes(b'validation-only '+name.encode())
        self.config = {'schema':'rock-desktop-device/1','name':'source','images':str(images),
                       'sha256':{name:guest.digest(images/name) for name in ('Image','rootfs.ext4')}}
        self.state = guest.state_path('source')
        (self.state/'device.json').write_text(json.dumps(self.config))
        self.data = self.state/'userdata.ext4'; self.data.write_bytes(b'fixture data; not ext4')

    def create(self):
        with patch.object(backup,'check_disk',return_value={'fixture':True}):
            return backup.create_backup('source')

    def test_copy_and_restore_into_new_device_preserve_source(self):
        result = self.create(); snapshot = Path(result['backup'])
        with patch.object(backup,'check_disk',return_value={'fixture':True}):
            restored = backup.restore_backup(snapshot,'restored')
        self.assertEqual(self.data.read_bytes(),b'fixture data; not ext4')
        self.assertEqual((self.base/'restored/userdata.ext4').read_bytes(),self.data.read_bytes())
        self.assertEqual(restored['userdata_sha256'],result['userdata_sha256'])
        self.assertEqual(json.loads((self.base/'restored/device.json').read_text())['name'],'restored')
        self.assertTrue(restored['original_device_preserved'])

    def test_running_guest_is_rejected_before_filesystem_or_copy(self):
        (self.state/'running.json').write_text('{}')
        with patch.object(backup,'running',return_value=True),patch.object(backup,'check_disk') as checker:
            with self.assertRaisesRegex(ValueError,'終了'): backup.create_backup('source')
        checker.assert_not_called(); self.assertFalse((self.state/'backups').exists())

    def test_unclean_filesystem_is_never_repaired_or_copied(self):
        with patch.object(backup.subprocess,'run') as run:
            run.return_value.returncode = 4
            with self.assertRaisesRegex(ValueError,'not clean'): backup.create_backup('source')
        self.assertEqual(run.call_args.args[0],['e2fsck','-f','-n',str(self.data)])
        self.assertFalse((self.state/'backups').exists())
        self.assertEqual(self.data.read_bytes(),b'fixture data; not ext4')

    def test_modified_backup_fails_before_creating_destination(self):
        result = self.create(); snapshot = Path(result['backup'])
        (snapshot/'userdata.ext4').write_bytes(b'changed')
        with self.assertRaisesRegex(ValueError,'hash mismatch'): backup.restore_backup(snapshot,'new')
        self.assertFalse((self.base/'new').exists())

    def test_existing_destination_and_same_source_are_never_overwritten(self):
        result = self.create(); snapshot = Path(result['backup'])
        existing = guest.state_path('existing'); (existing/'userdata.ext4').write_bytes(b'keep')
        with self.assertRaisesRegex(ValueError,'新しい端末名'): backup.restore_backup(snapshot,'source')
        with patch.object(backup,'check_disk',return_value={}):
            with self.assertRaisesRegex(ValueError,'既存データ'): backup.restore_backup(snapshot,'existing')
        self.assertEqual((existing/'userdata.ext4').read_bytes(),b'keep')
        self.assertEqual(self.data.read_bytes(),b'fixture data; not ext4')

    def test_symlink_and_hardlink_data_are_not_copied(self):
        os.link(self.data,self.state/'extra-link')
        with self.assertRaisesRegex(ValueError,'extra links'): self.create()
        (self.state/'extra-link').unlink(); self.data.unlink()
        self.data.symlink_to(self.state/'device.json')
        with self.assertRaisesRegex(ValueError,'regular file'): self.create()

    def test_wrong_owner_device_marker_is_rejected(self):
        (self.state/'device.json').write_text(json.dumps(dict(self.config,name='another')))
        with self.assertRaisesRegex(ValueError,'another device'): self.create()

    def test_restore_does_not_replace_old_remote_journal_with_a_fresh_endpoint(self):
        for version in (2,3):
            with self.subTest(schema=version):
                self.config.update(schema='rock-desktop-device/'+str(version),network='development-services')
                if version == 3: self.config['viewer']='browser'
                (self.state/'device.json').write_text(json.dumps(self.config))
                result = self.create()
                with patch.object(backup,'check_disk',return_value={}):
                    restored = backup.restore_backup(Path(result['backup']),'restored-offline-'+str(version))
                self.assertEqual(restored['config']['network'],'none')
                if version == 3: self.assertEqual(restored['config']['viewer'],'browser')
                self.assertIn('not included',restored['remote_services'])
                self.assertEqual(json.loads((self.state/'device.json').read_text())['network'],'development-services')

    def test_source_change_after_initial_validation_never_activates_destination(self):
        result = self.create(); snapshot = Path(result['backup'])
        original = self.data.read_bytes()
        def change_after_check(path):
            path.write_bytes(b'changed after manifest verification')
            return {}
        with patch.object(backup,'check_disk',side_effect=change_after_check):
            with self.assertRaisesRegex(ValueError,'verified manifest'):
                backup.restore_backup(snapshot,'changed-copy')
        self.assertFalse((self.base/'changed-copy/device.json').exists())
        self.assertFalse((self.base/'changed-copy/restored.json').exists())
        self.assertEqual(self.data.read_bytes(),original)

    def test_destination_clean_check_failure_never_activates_device(self):
        result = self.create(); snapshot = Path(result['backup'])
        destination = self.base/'unclean-copy/userdata.ext4'
        def check(path):
            if path == destination: raise ValueError('not clean')
            return {}
        with patch.object(backup,'check_disk',side_effect=check):
            with self.assertRaisesRegex(ValueError,'not clean'):
                backup.restore_backup(snapshot,'unclean-copy')
        self.assertFalse(destination.with_name('device.json').exists())
        self.assertEqual(destination.read_bytes(),self.data.read_bytes())

    def test_final_destination_change_and_wrong_copy_count_are_rejected(self):
        result = self.create(); snapshot = Path(result['backup'])
        def change_destination(path):
            if path.parent.name == 'final-change': path.write_bytes(b'changed during check')
            return {}
        with patch.object(backup,'check_disk',side_effect=change_destination):
            with self.assertRaisesRegex(ValueError,'final verification'):
                backup.restore_backup(snapshot,'final-change')
        self.assertFalse((self.base/'final-change/device.json').exists())
        real_copy = backup.copy_data
        def wrong_count(source,destination):
            value,count = real_copy(source,destination)
            return value,count+1
        with patch.object(backup,'check_disk',return_value={}),patch.object(backup,'copy_data',side_effect=wrong_count):
            with self.assertRaisesRegex(ValueError,'verified manifest'):
                backup.restore_backup(snapshot,'wrong-count')
        self.assertFalse((self.base/'wrong-count/device.json').exists())


if __name__ == '__main__': unittest.main()

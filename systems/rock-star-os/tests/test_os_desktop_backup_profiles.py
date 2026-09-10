"""Synthetic disk manifests and real SQLite fixtures; never launch a guest."""
import copy
from contextlib import ExitStack
import importlib.util
import json
from pathlib import Path
import shutil
import sys
import tempfile
import unittest
from unittest.mock import Mock, patch

ROOT = Path(__file__).resolve().parents[1] / 'os/desktop'
sys.path.insert(0, str(ROOT))
spec = importlib.util.spec_from_file_location('backup_profile_verify', ROOT / 'verify-backup.py')
verify = importlib.util.module_from_spec(spec)
spec.loader.exec_module(verify)


class BackupProfileGuards(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='backup-profile-fixture-')
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.source, self.saved, self.restored = (self.root / name for name in ('source', 'backup', 'restored'))
        for folder in (self.source, self.saved, self.restored):
            folder.mkdir()
            for name in ('slot-a.ext4', 'slot-b.ext4', 'userdata.ext4'):
                (folder / name).write_bytes(b'synthetic manifest bytes: ' + name.encode())
        self.disks = {path.name: {'sha256': verify.guest.digest(path), 'bytes': path.stat().st_size}
                      for path in self.source.iterdir()}

    def manifest(self, version):
        if version == 1:
            return {'schema': 'rock-desktop-backup/1', 'config': {'schema': 'rock-desktop-device/3'},
                    'userdata_sha256': self.disks['userdata.ext4']['sha256'],
                    'bytes': self.disks['userdata.ext4']['bytes']}
        return {'schema': 'rock-desktop-backup/2', 'config': {'schema': 'rock-desktop-device/5'},
                'disks': copy.deepcopy(self.disks)}

    def test_legacy_and_ab_manifests_use_their_actual_format(self):
        self.assertEqual(verify.disk_manifest(self.manifest(1)), {'userdata.ext4': self.disks['userdata.ext4']})
        new = self.manifest(2)
        self.assertNotIn('userdata_sha256', new)
        self.assertEqual(verify.disk_manifest(new), self.disks)
        for version in (1, 2):
            manifest = verify.disk_manifest(self.manifest(version))
            for folder in (self.source, self.saved, self.restored):
                self.assertEqual(verify.verify_disk_set(manifest, folder, 'fixture'), manifest)

    def test_every_disk_is_compared_at_source_backup_and_restored_destination(self):
        for folder in (self.source, self.saved, self.restored):
            for name in self.disks:
                path = folder / name
                original = path.read_bytes()
                path.write_bytes(bytes([original[0] ^ 1]) + original[1:])
                with self.subTest(folder=folder.name, disk=name), self.assertRaisesRegex(ValueError, 'disk.*differs'):
                    verify.verify_disk_set(self.disks, folder, 'fixture')
                path.write_bytes(original)

    def test_missing_extra_and_invalid_manifest_members_fail_closed(self):
        cases = []
        for name in self.disks:
            value = self.manifest(2); del value['disks'][name]; cases.append(value)
        value = self.manifest(2); value['disks']['../outside'] = value['disks']['userdata.ext4']; cases.append(value)
        for bad in (True, 0, -1, 2 * 1024 ** 3 + 1):
            value = self.manifest(2); value['disks']['userdata.ext4']['bytes'] = bad; cases.append(value)
        value = self.manifest(2); value['disks']['slot-b.ext4']['sha256'] = 'invalid'; cases.append(value)
        value = self.manifest(1); value['config']['schema'] = 'rock-desktop-device/5'; cases.append(value)
        value = self.manifest(2); value['config']['schema'] = 'rock-desktop-device/3'; cases.append(value)
        value = self.manifest(1); value['schema'] = 'rock-desktop-backup/99'; cases.append(value)
        for value in cases:
            with self.subTest(value=value), self.assertRaises(ValueError): verify.disk_manifest(value)

    def test_symlink_disk_is_rejected_even_if_bytes_match(self):
        path = self.saved / 'userdata.ext4'; path.unlink(); path.symlink_to(self.source / 'userdata.ext4')
        with self.assertRaises(ValueError): verify.verify_disk_set(self.disks, self.saved, 'fixture')

    def test_closed_profile_requires_remote_cache_not_a_second_local_ledger(self):
        for version in (4, 5):
            profile = verify.retention_profile({'schema': 'rock-desktop-device/' + str(version)})
            self.assertNotIn('wallet', profile['sources'])
            self.assertNotIn('membership', profile['sources'])
            self.assertEqual(profile['sources']['wallet_cache'],
                             ('/wallet/backend-cache/remote-cache.db', ('identity', 'requests', 'snapshot')))
            with patch.object(verify, 'closed_file_exists', return_value=True):
                with self.assertRaisesRegex(ValueError, 'conflicting.*profile'):
                    verify.verify_profile_layout(self.source / 'userdata.ext4', profile)
        with self.assertRaises(ValueError): verify.retention_profile({'schema': 'rock-desktop-device/99'})

    def test_external_authority_and_runner_cannot_be_called_restored_from_guest_cache(self):
        baseline = {'remote': {'tables': {'remote_jobs': {'rows': 0}}}}
        local = {'schema': 'rock-desktop-device/3', 'network': 'none'}
        self.assertFalse(verify.external_coverage(local, baseline)['required'])
        cases = [dict(local, network='development-services'),
                 {'schema': 'rock-desktop-device/5', 'network': 'none',
                  'services': {'authority_id': 'synthetic-authority', 'sha256': 'a' * 64}}]
        for config in cases:
            scope = verify.external_coverage(config, baseline)
            self.assertTrue(scope['required'])
            self.assertEqual(scope['status'], 'NOT_RUN')
            self.assertFalse(scope['included_in_device_backup'])
            self.assertIn('runner', scope['required_components'])
            if config['schema'].endswith('/5'):
                self.assertIn('wallet_authority', scope['required_components'])
                self.assertIn('service_access_mode', scope['required_components']['wallet_authority']['membership_tables'])
        baseline['remote']['tables']['remote_jobs']['rows'] = 1
        self.assertTrue(verify.external_coverage(local, baseline)['required'])

    def test_run_consumes_both_manifest_versions_and_leaves_external_gate_incomplete(self):
        """Exercise orchestration only: all guest/UI/DB seams are synthetic."""
        for version in (1, 2):
            with self.subTest(version=version), ExitStack() as stack:
                saved = self.manifest(version)
                saved_dir = self.source / 'backups' / ('fixture-'+str(version))
                saved_dir.mkdir(mode=0o700, parents=True)
                saved.update(backup=str(saved_dir), source_device='source')
                images = self.root / ('images-'+str(version)); images.mkdir()
                names = ('Image', 'rootfs.ext4') + (('stage0.cpio.gz',) if version == 2 else ())
                for name in names: (images/name).write_bytes(b'synthetic image '+name.encode())
                config = saved['config']
                config.update(name='source', network='none', images=str(images),
                              sha256={name:verify.guest.digest(images/name) for name in names})
                if version == 2: config['services'] = {'authority_id':'fixture', 'sha256':'a'*64}
                def save(path, value):
                    path.write_text(json.dumps(value)); path.chmod(0o600)
                save(self.source/'device.json', config)
                save(self.source/'running.json', {'pid':123, 'session':str(self.source/'sessions'/('a'*32)),
                    'identity':{'start_ticks':'900', 'command':[]}, 'config':config})
                for name in verify.disk_manifest(saved): shutil.copyfile(self.saved/name, saved_dir/name)
                save(saved_dir/'backup.json', {key:value for key,value in saved.items() if key != 'backup'})
                destination = self.root / ('new-'+str(version))
                profile = verify.retention_profile(config)
                baseline = {role: {'tables': {name: {'rows':0, 'logical_sha256':'a'*64} for name in tables},
                                   'schema_sha256':'b'*64, 'internal_sequences':{}, 'financial_summary':{}}
                            for role, (_, tables) in profile['sources'].items()}
                def restore(_path, new_name):
                    destination.mkdir()
                    for name in verify.disk_manifest(saved): shutil.copyfile(self.saved/name, destination/name)
                    restored_config = dict(config, name=new_name, network='none')
                    save(destination/'device.json', restored_config)
                    return {'config':restored_config}
                def start(restored_config):
                    session = destination/'sessions'/('b'*32); session.mkdir(parents=True, mode=0o700)
                    (session/'boot.log').write_text('ROCK_PLATFORM_READY\nreboot: Power down\n')
                    record = {'pid':456, 'session':str(session), 'qmp_socket':str(session/'qmp'),
                              'identity':{'start_ticks':'901', 'command':[]}, 'config':restored_config}
                    save(destination/'running.json', record)
                    return dict(record, reused=False, running=True)
                seams = [
                    (verify, 'require_execution_host', Mock()),
                    (verify.guest, 'BASE', self.root),
                    (verify.guest, 'state_path', Mock(return_value=self.source)),
                    (verify.guest, 'status', Mock(return_value={'running':False})),
                    (verify.guest, 'validate_config', Mock()),
                    (verify.backup, 'create_backup', Mock(return_value=saved)),
                    (verify.backup, 'restore_backup', Mock(side_effect=restore)),
                    (verify, 'closed_file_exists', Mock(return_value=False)),
                    (verify, 'business_snapshot', Mock(return_value=(baseline, {}, [{'created_unix':1, 'boot_id':'fixture'}]))),
                    (verify, 'source_receipts', Mock(return_value={})),
                    (verify.power.guest, 'validate_record', Mock()),
                    (verify.guest, 'start', Mock(side_effect=start)),
                    (verify.guest, 'running', Mock(return_value=False)),
                    (verify.power, 'Monitor', Mock(ALLOWED=set())),
                    (verify.power.native, 'NativeInput', Mock()),
                    (verify.time, 'sleep', Mock()),
                    (verify.backup, 'check_disk', Mock(return_value={'fixture_only':True})),
                    (verify, 'power_transition', Mock(return_value={'fixture_only':True})),
                ]
                for target, name, value in seams: stack.enter_context(patch.object(target, name, value))
                result = verify.run('source', destination.name)
                self.assertEqual(result['status'], 'AUTOMATED_PASS' if version == 1 else 'INCOMPLETE', result)
                self.assertEqual(set(result['image_sha256']), set(names))
                for stage in ('source_disks_before', 'backup_disks_before', 'restored_disks_before_boot',
                              'source_disks_after', 'backup_disks_after'):
                    self.assertEqual(result[stage], verify.disk_manifest(saved))
                if version == 2:
                    self.assertEqual(result['external_state']['status'], 'NOT_RUN')
                    self.assertEqual(set(result['restored_slots_after_boot']), {'slot-a.ext4', 'slot-b.ext4'})


if __name__ == '__main__': unittest.main()

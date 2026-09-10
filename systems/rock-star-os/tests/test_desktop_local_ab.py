"""Strict local A/B host guards; synthetic disk tests are not boot evidence."""
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import shutil
import sys
import unittest
from unittest.mock import patch

import test_desktop_stage0 as stage_fixtures
import guest
import backup
import stage0
from service_access import profile

spec = importlib.util.spec_from_file_location('local_ab_backup_verifier', stage0.ROOT / 'os/desktop/verify-backup.py')
verify = importlib.util.module_from_spec(spec); spec.loader.exec_module(verify)


class LocalAB(unittest.TestCase):
    setUpClass = stage_fixtures.Stage0Desktop.__dict__['setUpClass']
    pin = stage_fixtures.Stage0Desktop.pin
    pin_report = stage_fixtures.Stage0Desktop.pin_report
    small_state = stage_fixtures.Stage0Desktop.small_state
    snapshot = stage_fixtures.Stage0Desktop.snapshot

    def setUp(self):
        stage_fixtures.Stage0Desktop.setUp(self)
        self.purchaser = copy.deepcopy(self.config)
        self.config.update(schema='rock-desktop-device/6', network='none',
                           boot={'mode': 'signed-stage0', 'profile': 'local-development',
                                 'factory_sha256': self.config['boot']['factory_sha256']})
        del self.config['services']
        local = patch.object(profile, '_image_preflight', return_value={'explicit_fixture_source': 'a'*64})
        self.preflight = local.start(); self.addCleanup(local.stop)

    def test_distinct_local_profile_verifies_real_signed_factory_and_exact_triple(self):
        before = {name: guest.digest(self.images / name) for name in profile.IMAGE_NAMES}
        guest.validate_config(self.config)
        result = stage0.verified_local_profile(self.config)
        self.assertEqual(result['profile'], 'local-development')
        self.assertEqual(result['rootfs_size'], self.envelope['manifest']['size'])
        self.assertNotIn('binding', result)
        self.assertEqual(before, {name: guest.digest(self.images / name) for name in profile.IMAGE_NAMES})
        self.preflight.assert_called_with(self.images / 'rootfs.ext4')
        self.assertFalse(self.base.exists())

    def test_schema6_cannot_smuggle_network_services_profile_or_missing_stage0(self):
        mutations = [lambda c: c.update(network='development-services'), lambda c: c.update(network='closed-services'),
                     lambda c: c.update(services=self.purchaser['services']), lambda c: c.update(viewer='other'),
                     lambda c: c['boot'].update(profile='purchaser'), lambda c: c['boot'].update(profile_sha256='a'*64),
                     lambda c: c['boot'].update(factory_sha256='0'*64), lambda c: c['boot'].pop('profile'),
                     lambda c: c['sha256'].pop('stage0.cpio.gz'), lambda c: c['sha256'].update(extra='a'*64)]
        for mutate in mutations:
            changed = copy.deepcopy(self.config); mutate(changed)
            with self.subTest(config=changed), self.assertRaises(ValueError): guest.validate_config(changed)
        self.assertFalse(self.base.exists())

    def test_local_profile_reuses_full_unconfigured_image_admission_no_bypass(self):
        with patch.object(profile, '_image_preflight', side_effect=ValueError('embedded purchaser marker')):
            with self.assertRaisesRegex(ValueError, 'purchaser marker'): guest.validate_config(self.config)
        with patch.object(stage0, 'verified_local_profile') as local:
            guest.validate_config(self.purchaser)
            local.assert_not_called()

    def test_local_profile_bad_signed_binding_and_writable_input_are_rejected(self):
        bad = copy.deepcopy(self.envelope); bad['manifest']['sha256'] = 'b'*64
        with patch.object(profile, '_stage0', return_value={'factory': json.dumps(self.signer.sign_development(bad['manifest'])).encode()}):
            changed = copy.deepcopy(self.config)
            changed['boot']['factory_sha256'] = hashlib.sha256(profile._stage0(None)['factory']).hexdigest()
            with self.assertRaisesRegex(ValueError, 'bind'): guest.validate_config(changed)
        with patch.object(profile, '_stage0', return_value={'factory': json.dumps(dict(self.envelope, signature='0'*128)).encode()}):
            changed = copy.deepcopy(self.config)
            changed['boot']['factory_sha256'] = hashlib.sha256(profile._stage0(None)['factory']).hexdigest()
            with self.assertRaises(self.update.UpdateError): guest.validate_config(changed)
        (self.images / 'Image').chmod(0o644)
        with self.assertRaisesRegex(ValueError, 'read-only'): guest.validate_config(self.config)

    def test_local_command_reuses_three_distinct_slots_and_no_network(self):
        args = guest.command(self.config, self.root / 'state', self.root / 'session')
        self.assertIn('-initrd', args); self.assertIn('-nic', args); self.assertNotIn('-netdev', args)
        drives = [args[i + 1] for i, arg in enumerate(args) if arg == '-drive']
        self.assertEqual(len(drives), 3)
        for disk in stage0.DISKS: self.assertEqual(sum(disk in value for value in drives), 1)
        self.assertNotIn('root=/dev/vda', args[args.index('-append') + 1])

    def test_local_backup2_restores_new_offline_local_device_with_all_disk_hashes(self):
        saved = self.snapshot(); path = Path(saved['backup'])
        self.assertEqual(saved['schema'], 'rock-desktop-backup/2')
        self.assertEqual(set(verify.disk_manifest(saved)), set(stage0.DISKS))
        with patch.object(backup, 'check_disk', return_value={'fixture': True}), \
             patch.object(stage0, 'stopped_slots', return_value={'mode': 'explicit-guard-fixture'}):
            result = backup.restore_backup(path, 'restored-local')
        self.assertEqual(result['config']['schema'], 'rock-desktop-device/6')
        self.assertNotIn('services', result['config'])
        self.assertEqual(result['config']['network'], 'none')
        for disk in stage0.DISKS:
            self.assertEqual(guest.digest(self.base / 'restored-local' / disk), saved['disks'][disk]['sha256'])

    def test_local_data_only_missing_changed_and_wrong_profile_restore_rejected(self):
        saved = self.snapshot(); path = Path(saved['backup'])
        altered = copy.deepcopy(saved); altered['schema'] = 'rock-desktop-backup/1'
        guest.save(path / 'backup.json', altered)
        with self.assertRaisesRegex(ValueError, 'data-only'): backup.restore_backup(path, 'bad-legacy')
        with self.assertRaises(ValueError): verify.disk_manifest(altered)
        guest.save(path / 'backup.json', saved)
        (path / 'slot-b.ext4').write_bytes(b'changed')
        with self.assertRaisesRegex(ValueError, 'hash mismatch'): backup.restore_backup(path, 'bad-hash')
        (path / 'slot-b.ext4').unlink()
        with self.assertRaisesRegex(ValueError, 'members'): backup.restore_backup(path, 'bad-missing')
        changed = copy.deepcopy(saved); changed['config'] = dict(self.config, schema='rock-desktop-device/5')
        with self.assertRaises(ValueError): backup.restore_stage0_backup(path, 'bad-profile', changed)
        for name in ('bad-legacy', 'bad-hash', 'bad-missing', 'bad-profile'): self.assertFalse((self.base / name).exists())

    def test_local6_uses_every_local_business_table_not_remote_cache(self):
        local = verify.retention_profile(self.config)
        self.assertEqual(local['name'], 'local-wallet-simulator/1')
        self.assertEqual(local['sources'], verify.SOURCES)
        baseline = {'remote': {'tables': {'remote_jobs': {'rows': 0}, 'remote_cancel_receipts': {'rows': 0}}}}
        self.assertFalse(verify.external_coverage(self.config, baseline)['required'])
        remote = verify.retention_profile(self.purchaser)
        self.assertIn('wallet_cache', remote['sources']); self.assertNotIn('wallet', remote['sources'])
        self.assertEqual(verify.external_coverage(self.purchaser, baseline)['status'], 'NOT_RUN')
        baseline['remote']['tables']['remote_jobs']['rows'] = 1
        self.assertTrue(verify.external_coverage(self.config, baseline)['required'])

    def test_local_services_action_never_provisions_legacy_endpoints(self):
        import io
        from contextlib import redirect_stdout
        from unittest.mock import Mock
        state = guest.state_path(self.config['name']); guest.save(state / 'device.json', self.config)
        service = Mock()
        with patch.object(guest, 'status', return_value={'running': False}), \
             patch.object(sys, 'argv', ['guest.py', 'services', '--name', self.config['name']]), \
             patch.dict(sys.modules, {'services': service}), redirect_stdout(io.StringIO()) as output:
            guest.main()
        service.ensure.assert_not_called()
        self.assertEqual(json.loads(output.getvalue())['status'], 'NOT_APPLICABLE')

    def test_update_summary_types_duplicates_and_oversized_metadata_reject_before_destination(self):
        saved = self.snapshot(); path = Path(saved['backup'])
        typed = {'mode': 'signed-committed', 'update_state_sha256': 'a'*64, 'committed': 'A', 'floor': 1}
        for invalid in (True, 1.0):
            changed = copy.deepcopy(saved); changed['update'] = dict(typed, floor=invalid)
            guest.save(path / 'backup.json', changed)
            with patch.object(backup, 'check_disk', return_value={}), patch.object(stage0, 'stopped_slots', return_value=typed):
                with self.assertRaisesRegex(ValueError, 'metadata/slot'): backup.restore_backup(path, 'typed-failure')
            self.assertFalse((self.base / 'typed-failure').exists())
        (path / 'backup.json').write_text('{"schema":"rock-desktop-backup/2","schema":"rock-desktop-backup/1"}')
        with self.assertRaises((ValueError, self.update.UpdateError)): backup.restore_backup(path, 'duplicate-failure')
        (path / 'backup.json').write_text(' ' * 65537)
        with self.assertRaises(ValueError): backup.restore_backup(path, 'oversized-failure')
        for name in ('duplicate-failure', 'oversized-failure'): self.assertFalse((self.base / name).exists())

    def test_changing_both_format_labels_cannot_hide_present_ab_bundle_members(self):
        saved = self.snapshot(); path = Path(saved['backup'])
        changed = copy.deepcopy(saved)
        changed['schema'] = 'rock-desktop-backup/1'
        changed['config'].update(schema='rock-desktop-device/3'); changed['config'].pop('boot')
        changed['config']['sha256'].pop('stage0.cpio.gz')
        changed['userdata_sha256'] = saved['disks']['userdata.ext4']['sha256']
        changed['bytes'] = saved['disks']['userdata.ext4']['bytes']
        guest.save(path / 'backup.json', changed)
        with self.assertRaisesRegex(ValueError, 're-labelled'): backup.restore_backup(path, 'relabelled')
        self.assertFalse((self.base / 'relabelled').exists())


@unittest.skipUnless(sys.platform == 'linux' and all(shutil.which(tool) for tool in ('mke2fs', 'debugfs', 'e2fsck', 'openssl')),
                     'NOT_RUN: real ext4 local-image preflight requires Linux image tools')
class LocalABActualExt4(unittest.TestCase):
    def setUp(self):
        from test_service_access_profile import ActualExt4ProfileTests
        self.finish_base = ActualExt4ProfileTests.finish_base.__get__(self)
        ActualExt4ProfileTests.setUp(self)

    def configuration(self, image=None):
        image = image or self.base
        factory = profile._stage0(image / 'stage0.cpio.gz')['factory']
        return {'schema': 'rock-desktop-device/6', 'name': 'local-image-preflight', 'images': str(image),
                'sha256': {name: guest.digest(image / name) for name in profile.IMAGE_NAMES}, 'network': 'none',
                'viewer': 'browser', 'boot': {'mode': 'signed-stage0', 'profile': 'local-development',
                                            'factory_sha256': hashlib.sha256(factory).hexdigest()}}

    def test_real_ext4_local_image_preflight_is_readonly_and_keeps_factory_signature(self):
        config = self.configuration(); before = dict(config['sha256'])
        guest.validate_config(config)
        self.assertEqual(stage0.verified_local_profile(config)['factory_sha256'], config['boot']['factory_sha256'])
        self.assertEqual(before, {name: guest.digest(self.base / name) for name in profile.IMAGE_NAMES})

    def test_real_ext4_purchaser_injection_cannot_be_called_a_local_profile(self):
        from test_service_access_profile import configuration
        destination = self.root / 'purchaser'
        profile.prepare_profile(self.base, destination, expected_sha256=self.hashes, **configuration())
        with self.assertRaisesRegex(ValueError, 'unconfigured'): guest.validate_config(self.configuration(destination))


if __name__ == '__main__': unittest.main()

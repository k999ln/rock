"""Draft-only host guards. Synthetic image bytes; real fixture signature/hash.

No QEMU or real ext4 claim: mkfs/fsck/debugfs are mocked at explicit seams.
"""
import copy
import gzip
import hashlib
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

DRAFT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(DRAFT/'os/desktop'))
import guest
import backup
import stage0
from service_access import profile
from service_access.os_client import binding
from entitlement.protocol import PUBLIC_TOKENS
from service_access.controller import PUBLIC_SERVICE_TOKENS

AID='f1111111-1111-4111-8111-111111111111'


def cpio_entry(name,data,mode=0o100444):
    encoded=name.encode()+b'\0'; fields=[1,mode,0,0,1,0,len(data),0,0,0,0,len(encoded),0]
    raw=b'070701'+b''.join(f'{v:08x}'.encode() for v in fields)+encoded
    return raw+b'\0'*(-len(raw)%4)+data+b'\0'*(-len(data)%4)


class Stage0Desktop(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.signer,cls.update=profile._update_helpers()

    def setUp(self):
        self.temporary=tempfile.TemporaryDirectory();self.addCleanup(self.temporary.cleanup)
        self.root=Path(self.temporary.name).resolve();self.images=self.root/'images';self.images.mkdir()
        self.base=self.root/'devices'
        for module in (guest,backup):
            p=patch.object(module,'BASE',self.base);p.start();self.addCleanup(p.stop)
        (self.images/'Image').write_bytes(b'\0'*56+b'ARM\x64'+b'\0'*4)
        with (self.images/'rootfs.ext4').open('wb') as stream:stream.truncate(8*1024**2)
        self.envelope=self.signer.sign_development({'schema':'rock-os-rootfs-v2','architecture':'aarch64','layout':'rock-virt-ab1',
            'data_abi':'rock-data-v1','sequence':1,'version':'fixture-only','size':8*1024**2,'sha256':guest.digest(self.images/'rootfs.ext4')})
        self.service={'schema':'rock-purchaser-services-device/1','authority_id':AID,'consumer_id':'alice-a','device_ref':'fixture-rock-arm64-001',
            'token':PUBLIC_SERVICE_TOKENS['alice-a'],'registry_origin':'https://10.0.2.2:9743','runner_origin':'https://10.0.2.2:9744',
            'runner_endpoint_id':'runner-linux-cloud'}
        self.wallet={'schema_version':2,'mode':'development-remote-authority','origin':'https://10.0.2.2:9745','authority_id':AID,
            'device_ref':self.service['device_ref'],'ca_file':profile.CA_PATH,'token_file':profile.TOKEN_PATH}
        self.auth={'schema_version':1,'kind':'public-software-test-authenticator','device_ref':self.service['device_ref']}
        def image_cat(image,path):
            if path==profile.TOKEN_PATH:return PUBLIC_TOKENS['alice'].encode()+b'\n'
            return json.dumps({profile.SERVICE_PATH:self.service,profile.WALLET_PATH:self.wallet,profile.AUTH_PATH:self.auth}[path]).encode()
        self.read=patch.object(profile,'_cat',side_effect=image_cat);self.read.start();self.addCleanup(self.read.stop)
        self.config={'schema':'rock-desktop-device/5','name':'draft-test','images':str(self.images),'sha256':{},
            'network':'closed-services','viewer':'browser','services':{'config':str(self.root/'missing-backend.json'),
                'sha256':'a'*64,'authority_id':AID},'boot':{'mode':'signed-stage0'}}
        self.pin()

    def pin(self):
        raw=json.dumps(self.envelope,sort_keys=True).encode()+b'\n'
        data=cpio_entry(profile.FACTORY_PATH,raw)+cpio_entry('TRAILER!!!',b'',0)
        path=self.images/'stage0.cpio.gz'
        if path.exists():path.chmod(0o600)
        path.write_bytes(gzip.compress(data,mtime=0))
        for name in profile.IMAGE_NAMES:(self.images/name).chmod(0o444)
        self.config['sha256']={name:guest.digest(self.images/name) for name in profile.IMAGE_NAMES}
        self.config['boot']['factory_sha256']=hashlib.sha256(raw).hexdigest()
        self.report={'schema':'rock-closed-service-image-profile/1','status':'PREPARED','binding':binding(self.service),
            'stage0':{'output_factory':self.envelope,'output_factory_sha256':hashlib.sha256(raw).hexdigest()},
            'images':{name:{'sha256':guest.digest(self.images/name),'size':(self.images/name).stat().st_size} for name in profile.IMAGE_NAMES}}
        self.pin_report()

    def pin_report(self):
        path=self.images/'profile.json'
        if path.exists():path.chmod(0o600)
        path.write_text(json.dumps(self.report));path.chmod(0o444)
        self.config['boot']['profile_sha256']=guest.digest(path)

    def test_explicit_v5_validates_real_signature_three_hashes_and_scope(self):
        guest.validate_config(self.config)
        self.assertEqual(stage0.verified_profile(self.config)['binding'],binding(self.service))
        self.assertFalse(Path(self.config['services']['config']).exists())
        self.assertFalse(self.base.exists())

    def test_changed_signature_factory_hash_profile_and_scope_rejected(self):
        for key in ('factory_sha256','profile_sha256'):
            old=self.config['boot'][key];self.config['boot'][key]='0'*64
            with self.subTest(key=key),self.assertRaises(ValueError):guest.validate_config(self.config)
            self.config['boot'][key]=old
        self.envelope['signature']='0'*128;self.pin()
        with self.assertRaises(self.update.UpdateError):guest.validate_config(self.config)

    def test_valid_signature_for_other_root_and_authority_are_rejected(self):
        self.config['services']['authority_id']='f2222222-2222-4222-8222-222222222222'
        with self.assertRaisesRegex(ValueError,'scope'):guest.validate_config(self.config)
        self.config['services']['authority_id']=AID
        self.envelope=self.signer.sign_development({**self.envelope['manifest'],'sha256':'b'*64});self.pin()
        with self.assertRaisesRegex(ValueError,'bind'):guest.validate_config(self.config)

    def test_present_host_backend_endpoint_mismatch_refuses_before_disk(self):
        Path(self.config['services']['config']).write_text('mocked strict backend reader below')
        from service_access import serve
        with patch.object(serve,'load',return_value={'registry_port':9843,'runner_port':9744,'wallet_port':9745}):
            with self.assertRaisesRegex(ValueError,'endpoint'):guest.validate_config(self.config)
        self.assertFalse(self.base.exists())

    def test_stage0_command_three_independent_disks_and_reboot_without_test_flags(self):
        state=self.root/'state';args=guest.command(self.config,state,state/'session')
        self.assertEqual(args[args.index('-initrd')+1],str(self.images/'stage0.cpio.gz'))
        self.assertNotIn('root=/dev/vda',args[args.index('-append')+1]);self.assertNotIn('-no-reboot',args)
        self.assertFalse(any('verify=' in s or 'hostfwd=' in s for s in args))
        drives=[args[i+1] for i,v in enumerate(args) if v=='-drive']
        self.assertEqual(len(drives),3)
        for name in stage0.DISKS:self.assertEqual(sum(str(state/name) in value for value in drives),1)
        self.assertFalse(any(str(self.images/'rootfs.ext4') in value for value in drives))
        devices=[args[i+1] for i,v in enumerate(args) if v=='-device']
        self.assertIn('virtio-blk-pci,drive=osdisk,addr=0x1',devices)
        self.assertIn('virtio-blk-pci,drive=userdata,addr=0x2',devices)
        self.assertIn('virtio-blk-pci,drive=slotb,addr=0x4',devices)
        addresses=[d.split('addr=')[1].split(',')[0] for d in devices if 'addr=' in d]
        self.assertEqual(len(addresses),len(set(addresses)))
        offline=guest.command({**self.config,'network':'none'},state,state/'session')
        self.assertNotIn('-netdev',offline)
        self.assertIn('password-secret=rock-vnc',offline[offline.index('-vnc')+1])

    def test_new_disks_single_format_then_restart_preserves_updated_b(self):
        state=guest.state_path(self.config['name'])
        with patch.object(stage0.subprocess,'run') as run:
            stage0.prepare_disks(self.config,state)
        self.assertEqual([call.args[0][0] for call in run.call_args_list],['mkfs.ext4'])
        self.assertEqual(guest.digest(state/'slot-a.ext4'),self.config['sha256']['rootfs.ext4'])
        with (state/'slot-b.ext4').open('r+b') as stream:stream.write(b'preserved update fixture')
        before={n:guest.digest(state/n) for n in stage0.DISKS}
        with patch.object(stage0.subprocess,'run') as run:
            run.return_value.returncode=0;stage0.prepare_disks(self.config,state)
        self.assertEqual(run.call_args.args[0][:3],['e2fsck','-f','-n'])
        self.assertEqual(before,{n:guest.digest(state/n) for n in stage0.DISKS})

    def test_partial_unknown_disks_or_missing_saved_slot_never_format(self):
        state=guest.state_path(self.config['name']);(state/'slot-b.ext4').write_bytes(b'keep')
        with patch.object(stage0.subprocess,'run') as run,self.assertRaisesRegex(ValueError,'partial'):
            stage0.prepare_disks(self.config,state)
        run.assert_not_called();self.assertEqual((state/'slot-b.ext4').read_bytes(),b'keep')
        guest.save(state/'device.json',self.config)
        with patch.object(stage0.subprocess,'run') as run,self.assertRaisesRegex(ValueError,'missing'):
            stage0.prepare_disks(self.config,state)
        run.assert_not_called()

    def test_exact_running_v5_reused_without_disk_or_profile_creation(self):
        state=guest.state_path(self.config['name']);identity={'start_ticks':'123','command':['qemu-system-aarch64','draft']}
        guest.save(state/'running.json',{'pid':123,'identity':identity,'config':self.config})
        with patch.object(guest.sys,'platform','linux'),patch.object(guest,'process_identity',return_value=identity),patch.object(stage0,'prepare_disks') as prepare:
            result=guest.start(self.config)
        self.assertTrue(result['reused']);prepare.assert_not_called();self.assertFalse((state/'userdata.ext4').exists())

    def test_retained_history_without_marker_and_disks_never_reinitializes(self):
        state=guest.state_path(self.config['name'])
        for name in ('sessions','backups','running.json'):
            retained=state/name
            if name.endswith('.json'):retained.write_text('{"historical":true}')
            else:retained.mkdir()
            with self.subTest(name=name),patch.object(stage0,'copy_file') as copy_disk,\
                    patch.object(stage0.subprocess,'run') as run,patch.object(stage0,'save') as save,\
                    self.assertRaisesRegex(ValueError,'existing device history'):
                stage0.prepare_disks(self.config,state)
            copy_disk.assert_not_called();run.assert_not_called();save.assert_not_called()
            self.assertEqual({p.name for p in state.iterdir()},{name})
            if retained.is_dir():retained.rmdir()
            else:retained.unlink()

    def test_inconsistent_v5_backup_capacity_is_rejected_before_backup_copy(self):
        state=guest.state_path(self.config['name']);guest.save(state/'device.json',self.config)
        for disk in stage0.DISKS:
            (state/disk).write_bytes(b'wrong-size');(state/disk).chmod(0o600)
        with patch.object(backup,'check_disk') as check,self.assertRaisesRegex(ValueError,'capacity'):
            backup.create_backup(self.config['name'])
        check.assert_not_called();self.assertFalse((state/'backups').exists())

    def small_state(self):
        # File-copy guards use small explicit fixtures; capacity is separately tested.
        capacity=patch.object(stage0,'validate_disks');capacity.start();self.addCleanup(capacity.stop)
        state=guest.state_path(self.config['name']);guest.save(state/'device.json',self.config)
        for i,disk in enumerate(stage0.DISKS):
            (state/disk).write_bytes(('synthetic-private-disk-'+str(i)).encode());(state/disk).chmod(0o600)
        return state

    def snapshot(self):
        self.state=self.small_state()
        with patch.object(backup,'check_disk',return_value={'fixture':True}),patch.object(stage0,'stopped_slots',return_value={'mode':'explicit-guard-fixture'}):
            return backup.create_backup(self.config['name'])

    def test_v5_backup_complete_set_and_restore_offline_new_device(self):
        result=self.snapshot();path=Path(result['backup'])
        self.assertEqual(result['schema'],'rock-desktop-backup/2');self.assertEqual(set(result['disks']),set(stage0.DISKS))
        with patch.object(backup,'check_disk',return_value={'fixture':True}),patch.object(stage0,'stopped_slots',return_value={'mode':'explicit-guard-fixture'}):
            restored=backup.restore_backup(path,'restored')
        self.assertEqual(restored['schema'],'rock-desktop-restore/2');self.assertEqual(restored['config']['network'],'none')
        self.assertEqual(restored['config']['services'],self.config['services'])
        for disk in stage0.DISKS:self.assertEqual((self.base/'restored'/disk).read_bytes(),(self.state/disk).read_bytes())

    def test_missing_or_changed_slot_backup_fails_before_destination(self):
        result=self.snapshot();path=Path(result['backup']);(path/'slot-b.ext4').write_bytes(b'corrupt')
        with self.assertRaisesRegex(ValueError,'hash mismatch'):backup.restore_backup(path,'restored')
        self.assertFalse((self.base/'restored').exists())
        (path/'slot-b.ext4').unlink()
        with self.assertRaisesRegex(ValueError,'members'):backup.restore_backup(path,'restored')

    def test_data_only_format_cannot_be_presented_as_v5_success(self):
        result=self.snapshot();path=Path(result['backup']);manifest=json.loads((path/'backup.json').read_text())
        manifest['schema']='rock-desktop-backup/1';guest.save(path/'backup.json',manifest)
        with self.assertRaisesRegex(ValueError,'data-only'):backup.restore_backup(path,'restored')
        self.assertFalse((self.base/'restored').exists())

    def test_signed_update_state_read_only_and_pending_refused(self):
        state=self.small_state()
        saved={'schema':1,'generation':1,'committed':'A','pending':None,'attempts_left':0,'floor':1,'slots':{'A':self.envelope,'B':None}}
        with patch.object(stage0,'_state_bytes',return_value=json.dumps(saved).encode()),patch.object(self.update.Updater,'verify_slot',return_value=self.envelope['manifest']) as check:
            result=stage0.stopped_slots(self.config,state)
        self.assertEqual(result['committed'],'A');self.assertEqual(check.call_args.args[0],'A')
        saved['pending']='B';saved['attempts_left']=1
        saved['slots']['B']=self.signer.sign_development({**self.envelope['manifest'],'sequence':2})
        with patch.object(stage0,'_state_bytes',return_value=json.dumps(saved).encode()),self.assertRaisesRegex(ValueError,'pending'):
            stage0.stopped_slots(self.config,state)

    def test_symlink_slot_or_failed_restore_never_activates(self):
        result=self.snapshot();path=Path(result['backup']);(path/'slot-a.ext4').unlink();(path/'slot-a.ext4').symlink_to(self.state/'slot-a.ext4')
        with self.assertRaisesRegex(ValueError,'regular'):backup.restore_backup(path,'restored')
        self.assertFalse((self.base/'restored').exists())


if __name__=='__main__':unittest.main()

"""Current-copy archive uses retained real C, all independent Game journals."""
import copy
from contextlib import closing
from pathlib import Path
import tempfile
import unittest
import uuid
from game_exchange import sandbox as s
from game_exchange import sandbox_backup as b
from wallet_backend.authority_fence import private_directory,read_json,write_json

class SandboxCurrentCopy(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(prefix='game-full-current-copy-');self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name).resolve();self.state=private_directory(self.root/'authority',create=True)
        self.config=s.sample(str(self.state));write_json(self.state/'sandbox.json',self.config);s.prepare(self.config)
        self.before=s.snapshot(self.config);self.backup=self.root/'backup';self.backup_id=str(uuid.uuid4())
    def test_full_current_archive_replay_and_restore_exact_intent_retains_all_sources(self):
        backup=b.snapshot_current(self.config,self.backup,self.backup_id)
        self.assertEqual(b.snapshot_current(self.config,self.backup,self.backup_id),backup)
        self.assertEqual(s.snapshot(self.config),self.before)
        manifest=read_json(self.backup/'manifest.json');self.assertEqual(set(manifest['files']),set(self.before['databases'])|set(self.before['identities']))
        restore_id=str(uuid.uuid4());receipt=b.restore_current(self.config,self.backup,restore_id,'restored-game-device')
        self.assertTrue(receipt['source_retired']);self.assertEqual(receipt['descriptor']['writer_epoch'],2)
        self.assertEqual(b.restore_current(self.config,self.backup,restore_id,'restored-game-device'),receipt)
        self.assertFalse(b.restore_pending(self.config))
        with self.assertRaises(ValueError):b.restore_current(self.config,self.backup,restore_id,'another-device')
        with self.assertRaises(ValueError):b.restore_current(self.config,self.backup,str(uuid.uuid4()),'another-device')
        # The restored runtime uses retained issuer epochs; old Wallet bytes are
        # retained as retired evidence and never gain another spending writer.
        runtime=s.Runtime(self.config)
        try:self.assertEqual(runtime.runtime.descriptor.writer_epoch,2)
        finally:runtime.close()
        self.assertEqual(read_json(self.state/'contracts/alice/AUTHORITY.json')['state'],'RETIRED')
        for name in ('wallet-simulator.db','entitlement.db'):
            self.assertEqual(s.digest(self.state/'contracts/alice'/name),manifest['files']['contracts/alice/'+name]['sha256'])
    def test_pending_intent_fences_start_and_completed_receipt_detects_change(self):
        b.snapshot_current(self.config,self.backup,self.backup_id);restore_id=str(uuid.uuid4())
        from unittest.mock import patch
        original=b.handover;seen=[]
        def lost(*args,**kwargs):
            result=original(*args,**kwargs)
            if not seen:seen.append(result);raise OSError('actual first Game epoch committed before process completion')
            return result
        with patch.object(b,'handover',side_effect=lost):
            with self.assertRaises(OSError):b.restore_current(self.config,self.backup,restore_id,'resumed-game-device')
        self.assertTrue(b.restore_pending(self.config))
        with self.assertRaises(ValueError):s.start(self.config,self.state/'sandbox.json')
        with self.assertRaises(ValueError):s.Runtime(self.config)
        receipt=b.restore_current(self.config,self.backup,restore_id,'resumed-game-device')
        self.assertEqual(receipt['game_epochs']['public-game-a'],seen[0])
        runtime=s.Runtime(self.config)
        try:
            with runtime.authorities[0].store.transaction() as db:db.execute('CREATE TABLE extra_unknown (value BLOB)')
        finally:runtime.close()
        with self.assertRaisesRegex(ValueError,'changed'):b.restore_current(self.config,self.backup,restore_id,'resumed-game-device')
    def test_no_unsafe_or_nested_archive_and_modified_archive_is_rejected(self):
        for path in (self.state/'archive',self.root):
            with self.assertRaises((ValueError,RuntimeError)):b.snapshot_current(self.config,path,self.backup_id)
        b.snapshot_current(self.config,self.backup,self.backup_id)
        path=self.backup/'files/game-a/game.sqlite3'
        with path.open('ab') as stream:stream.write(b'changed')
        with self.assertRaises(ValueError):b.verify_archive(self.config,self.backup)
    def test_aggregate_gate_keeps_pending_and_all_retired_os_names_stopped(self):
        value={'schema':'rock-game-desktop-restore/1','intent':str(uuid.uuid4()),'state':'PENDING',
            'source_device':'source-two','new_device':'restored-three','retired_devices':['source-one','source-two'],
            'os_backup_sha256':'1'*64,'authority_manifest_sha256':'2'*64}
        path=self.state/'desktop-restore.json';write_json(path,value)
        with self.assertRaises(ValueError):b.desktop_ready(self.state,'restored-three')
        with self.assertRaises(ValueError):s.start(self.config,self.state/'sandbox.json')
        value['state']='DONE';write_json(path,value)
        b.desktop_ready(self.state,'restored-three')
        for name in value['retired_devices']:
            with self.assertRaises(ValueError):b.desktop_ready(self.state,name)
        value['retired_devices'].append('restored-three');write_json(path,value)
        with self.assertRaises(ValueError):b.desktop_ready(self.state)
    def test_interrupted_owned_archive_copy_resumes_same_plan(self):
        from unittest.mock import patch
        def interrupted(source,target,*_):target.write(source.read(32));raise OSError('interrupted owned partial copy')
        with patch.object(b.shutil,'copyfileobj',side_effect=interrupted):
            with self.assertRaises(OSError):b.snapshot_current(self.config,self.backup,self.backup_id)
        self.assertFalse((self.backup/'manifest.json').exists())
        receipt=b.snapshot_current(self.config,self.backup,self.backup_id)
        self.assertEqual(receipt['backup_id'],self.backup_id);b.verify_archive(self.config,self.backup)
        self.assertEqual(s.snapshot(self.config),self.before)
    def test_retired_wallet_bytes_and_extra_unfenced_database_are_observed(self):
        b.snapshot_current(self.config,self.backup,self.backup_id);intent=str(uuid.uuid4())
        b.restore_current(self.config,self.backup,intent,'restored-observation')
        post=s.snapshot(self.config)
        self.assertIn('contracts/alice/wallet-simulator.db',post['databases'])
        self.assertEqual(len(post['databases']),7)
        import sqlite3
        with closing(sqlite3.connect(self.state/'contracts/alice/wallet-simulator.db')) as db:
            db.execute('CREATE TABLE unplanned (value BLOB)');db.commit()
        with self.assertRaisesRegex(ValueError,'changed'):b.restore_current(self.config,self.backup,intent,'restored-observation')
        (self.state/'unknown.sqlite3').write_bytes(b'unknown')
        with self.assertRaisesRegex(ValueError,'unfenced'):s.snapshot(self.config)

if __name__=='__main__':unittest.main()

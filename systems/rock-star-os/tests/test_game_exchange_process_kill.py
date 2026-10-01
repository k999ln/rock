"""Real subprocess deaths, independent SQLite commit recovery and exact SDK retry."""
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import unittest
import uuid
from game_exchange import sandbox as s,sandbox_backup as b
from wallet_backend.authority_fence import private_directory,write_json,read_json

DRIVER=Path(__file__).with_name('game_exchange_process.py')

class ExchangeProcessKill(unittest.TestCase):
    def run_child(self,*args):
        return subprocess.run([sys.executable,str(DRIVER),*map(str,args)],capture_output=True,text=True,timeout=30)
    def boundary(self,phase):
        with tempfile.TemporaryDirectory(prefix='game-kill-real-') as temp:
            root=Path(temp).resolve();killed=self.run_child('kill',root,phase)
            self.assertEqual(killed.returncode,-signal.SIGKILL,killed.stdout+killed.stderr)
            self.assertEqual(read_json(root/'killed.json')['phase'],phase)
            recovered=self.run_child('recover',root)
            self.assertEqual(recovered.returncode,0,recovered.stdout+recovered.stderr)
            self.assertNotIn('ResourceWarning',recovered.stderr)
            value=json.loads(recovered.stdout)
            pre=value['before']['balances'];post=value['after']['balances']
            self.assertEqual((post['AVAILABLE'],post['GAME_HOLD'],post['GAME_PURCHASES'],post['GAME_FEES']),(4897,0,100,3))
            self.assertEqual(value['game_after'],10);self.assertEqual(value['pending'],[])
            self.assertEqual(value['after']['opaque'],'00ff6c6567616379');self.assertTrue(value['original_request_retained'])
            if phase=='approval-before-commit':
                self.assertEqual((pre['AVAILABLE'],pre['GAME_HOLD']),(5000,0));self.assertEqual(value['before']['attempts'][0][1],'OPEN')
            elif phase=='wallet-after-commit':self.assertEqual((pre['AVAILABLE'],pre['GAME_HOLD']),(4897,0))
            else:self.assertEqual((pre['AVAILABLE'],pre['GAME_HOLD']),(4897,103))
            self.assertEqual(value['game_before'],10 if phase in ('game-after-commit','wallet-before-commit','wallet-after-commit') else 0)
            self.assertEqual(len(value['after']['exchanges']),1)
            final_count=value['after']['credential_records'][0]['sign_count']
            self.assertEqual(final_count,value['approval']['result']['sign_count'])
            self.assertEqual(value['before']['credential_records'][0]['sign_count'],final_count-(phase=='approval-before-commit'))
    def test_approval_before_commit_rolls_back_counter_hold_outbox_together(self):self.boundary('approval-before-commit')
    def test_approval_after_commit_recovers_original_receipt_once(self):self.boundary('approval-after-commit')
    def test_claim_after_commit_keeps_unknown_hold_and_original_apply(self):self.boundary('claim-after-commit')
    def test_game_after_commit_recovers_original_terminal_receipt(self):self.boundary('game-after-commit')
    def test_wallet_before_settle_commit_keeps_hold_until_same_terminal(self):self.boundary('wallet-before-commit')
    def test_wallet_after_settle_commit_cannot_consume_or_grant_again(self):self.boundary('wallet-after-commit')
    def restore_boundary(self,phase):
        with tempfile.TemporaryDirectory(prefix='game-restore-kill-') as temp:
            root=Path(temp).resolve();state=private_directory(root/'authority',create=True);config=s.sample(str(state))
            write_json(state/'sandbox.json',config);s.prepare(config);backup=root/'backup'
            b.snapshot_current(config,backup,str(uuid.uuid4()));intent=str(uuid.uuid4())
            killed=self.run_child('restore-kill',state/'sandbox.json',backup,intent,phase)
            self.assertEqual(killed.returncode,-signal.SIGKILL,killed.stdout+killed.stderr)
            self.assertEqual(read_json(state/'killed.json')['phase'],phase)
            if phase!='restore-done-commit':
                with self.assertRaises(ValueError):s.start(config,state/'sandbox.json')
            receipt=b.restore_current(config,backup,intent,'process-restored-device')
            self.assertEqual(receipt['descriptor']['writer_epoch'],2)
            self.assertEqual(b.restore_current(config,backup,intent,'process-restored-device'),receipt)
            runtime=s.Runtime(config)
            try:self.assertEqual(runtime.runtime.descriptor.writer_epoch,2)
            finally:runtime.close()
            self.assertEqual(read_json(state/'contracts/alice/AUTHORITY.json')['state'],'RETIRED')
    def test_restore_kill_after_wallet_epoch_commit(self):self.restore_boundary('restore-wallet-epoch-commit')
    def test_restore_kill_after_first_independent_game_epoch_commit(self):self.restore_boundary('restore-game-a-commit')
    def test_restore_kill_after_final_receipt_commit_recovers_same_completion(self):self.restore_boundary('restore-done-commit')
    def migration_boundary(self,phase):
        with tempfile.TemporaryDirectory(prefix='game-migration-kill-') as temp:
            root=Path(temp).resolve();killed=self.run_child('migration-kill',root,phase)
            self.assertEqual(killed.returncode,-signal.SIGKILL,killed.stdout+killed.stderr)
            recovered=self.run_child('migration-recover',root)
            self.assertEqual(recovered.returncode,0,recovered.stdout+recovered.stderr)
            self.assertNotIn('ResourceWarning',recovered.stderr);result=json.loads(recovered.stdout)
            self.assertEqual(result['was_installed'],phase=='migration-after-commit')
            self.assertEqual(result['balances']['AVAILABLE'],5000);self.assertEqual(result['balances']['PENDING_SETTLEMENT'],200)
            self.assertEqual(result['opaque'],'00ff6f7061717565');self.assertGreater(result['original_typed_tables_preserved'],10)
    def test_migration_kill_before_commit_preserves_original_nonempty_schema(self):self.migration_boundary('migration-before-commit')
    def test_migration_kill_after_commit_recovers_only_original_migration_receipt(self):self.migration_boundary('migration-after-commit')

if __name__=='__main__':unittest.main()

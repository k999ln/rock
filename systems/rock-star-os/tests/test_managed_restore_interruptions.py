"""Independent review regressions: six durable cuts and a second generation.

The separate frozen-binary probe remains external evidence; these tests need
only the public source tree and disposable real synthetic Wallet fixtures.
"""
from pathlib import Path
import sys
import unittest
from unittest.mock import patch
import uuid

ROOT=Path(__file__).resolve().parents[1]
sys.path[:0]=[str(ROOT/'src'),str(ROOT/'os'),str(ROOT/'tests')]
import test_managed_restore as fixture
from wallet_backend import authority_fence, adopt_legacy
from wallet_backend.runtime_contracts import ContractIdentity


class IndependentRestoreReview(unittest.TestCase):
    def prepared_case(self):
        f=fixture.RestoreTests('test_promoted_copy_preserves_all_rows_and_fences_original_and_old_epoch')
        self.addCleanup(lambda:self.assertTrue(f.doCleanups(),'underlying fixture cleanup failed'))
        f.setUp()
        permit=f.active(); permit.quiesce();permit.release()
        restore_id,destination=f.stage()
        return f,restore_id,destination

    def test_each_promotion_write_after_durable_commit_can_finish_same_restore(self):
        # One shared fixed writer observes both module call sites. Count 1..6:
        # HANDOVER registry, RETIRED source, destination migration journal,
        # ACTIVE destination, DONE registry, destination restore journal.
        for cut in range(1,7):
            with self.subTest(durable_write=cut):
                f,restore_id,destination=self.prepared_case()
                writes=[]; real_write=authority_fence.write_json
                def interrupted(path,value):
                    real_write(path,value)
                    writes.append((path.name,value.get('state',value.get('stage'))))
                    if len(writes)==cut:raise OSError('independent interruption after durable write')
                with patch.object(authority_fence,'write_json',side_effect=interrupted), \
                     patch.object(adopt_legacy,'write_json',side_effect=interrupted):
                    with self.assertRaises(OSError): f.coordinator.promote_restore(restore_id)
                self.assertEqual(len(writes),cut)
                f.coordinator.close()
                f.coordinator=authority_fence.AuthorityFenceCoordinator(f.root/'coordinator')
                descriptor=f.coordinator.promote_restore(restore_id)
                self.assertEqual(descriptor.writer_epoch,2)
                self.assertEqual(authority_fence.read_json(f.state/'AUTHORITY.json')['state'],'RETIRED')
                self.assertEqual(authority_fence.read_json(destination/'AUTHORITY.json')['state'],'ACTIVE')
                self.assertEqual(authority_fence.read_json(destination/'GX00-RESTORE.json')['stage'],'DONE')
                f.assert_original()
                self.assertEqual({name:adopt_legacy.original_tables(destination/name) for name in f.original},f.original)

    def test_second_current_restore_preserves_ledger_and_increments_epoch_again(self):
        f,restore_id,destination=self.prepared_case()
        first=f.coordinator.promote_restore(restore_id)
        again=str(uuid.uuid4());target=f.root/'second-restore'
        f.coordinator.stage_restore(f.spec.ledger_ref,target,restore_id=again)
        second=f.coordinator.promote_restore(again)
        self.assertEqual((second.ledger_uuid,second.wallet_authority_id),(first.ledger_uuid,first.wallet_authority_id))
        self.assertEqual(second.writer_epoch,3)
        with self.assertRaises(authority_fence.RuntimeUnavailable):f.coordinator.promote_restore(restore_id)
        self.assertEqual(authority_fence.read_json(destination/'AUTHORITY.json')['state'],'RETIRED')
        self.assertEqual({name:adopt_legacy.original_tables(target/name) for name in f.original},f.original)

if __name__=='__main__':unittest.main()

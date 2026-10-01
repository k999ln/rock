"""Current same-host recovery copy, with real nonempty legacy-adopted Wallet."""
from contextlib import closing
from pathlib import Path
import sys
import threading
import unittest
from unittest.mock import patch
import uuid

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT/'src'),str(ROOT/'os'),str(ROOT/'tests')]
import test_adopt_legacy as fixture
from wallet_backend import adopt_legacy
from wallet_backend.authority_fence import AuthorityFenceCoordinator, RuntimeUnavailable, read_json
from wallet_backend.runtime_contracts import ContractIdentity
from blackberryrock.wallet import Wallet, WalletError
from entitlement.store import EntitlementStore
from entitlement.wallet_bridge import WalletBridge
from entitlement.protocol import PUBLIC_TOKENS
from wallet_auth.service import WalletAuthorization
from atm import CardlessATMSimulator


class RestoreTests(unittest.TestCase):
    setUp = fixture.AdoptionTests.setUp
    cleanup = fixture.AdoptionTests.cleanup
    prepared = fixture.AdoptionTests.prepared
    initialize = fixture.AdoptionTests.initialize
    assert_original = fixture.AdoptionTests.assert_original

    def active(self):
        permit = self.prepared(); self.initialize(permit)
        permit.activate(ContractIdentity(permit.descriptor,self.account)); return permit

    def stage(self):
        restore_id = str(uuid.uuid4()); destination = self.root/'restored'
        result = self.coordinator.stage_restore(self.spec.ledger_ref,destination,restore_id=restore_id)
        self.assertEqual(result['state'],'RESTORE_PENDING'); self.assertFalse(result['writer_enabled'])
        return restore_id,destination

    def test_actual_inflight_action_and_unreleased_runtime_refuse_restore(self):
        permit = self.active(); entered = threading.Event(); finish = threading.Event(); errors=[]
        def action():
            try:
                with permit.admit_write(1): entered.set(); self.assertTrue(finish.wait(3))
            except BaseException as error: errors.append(error)
        thread=threading.Thread(target=action); thread.start(); self.assertTrue(entered.wait(2))
        permit.quiesce()
        with self.assertRaises(RuntimeUnavailable): self.stage()
        self.assertFalse((self.root/'restored').exists())
        with self.assertRaises(RuntimeUnavailable): permit.release()
        finish.set(); thread.join(3); self.assertEqual(errors,[]); self.assertFalse(thread.is_alive())
        with self.assertRaises(RuntimeUnavailable): self.stage()
        permit.release(); self.stage()

    def test_promoted_copy_preserves_all_rows_and_fences_original_and_old_epoch(self):
        permit = self.active(); old = permit.descriptor; permit.quiesce(); permit.release()
        source_hashes = {name:adopt_legacy.digest_file(self.state/name) for name in adopt_legacy.DB_NAMES}
        restore_id,destination=self.stage()
        with self.assertRaises(WalletError): Wallet(destination/'wallet-simulator.db')
        with self.assertRaises(RuntimeUnavailable):
            self.coordinator.prepare_fresh(fixture.replace(self.spec,canonical_state=destination,ledger_ref='clone'))
        promoted=self.coordinator.promote_restore(restore_id)
        self.assertEqual(promoted.writer_epoch,2); self.assertEqual(promoted.ledger_uuid,old.ledger_uuid)
        self.assertEqual(promoted.wallet_authority_id,old.wallet_authority_id)
        self.assertEqual(read_json(self.state/'AUTHORITY.json')['state'],'RETIRED')
        self.assertEqual({name:adopt_legacy.digest_file(self.state/name) for name in source_hashes},source_hashes)
        self.assert_original()
        opened=self.coordinator.open_active(self.spec.ledger_ref); self.permits.append(opened)
        with opened.initialize():
            wallet=Wallet(destination/'wallet-simulator.db',managed_write_hooks=opened.hooks)
            store=EntitlementStore(destination/'entitlement.db',clock=lambda:self.now,managed_write_hooks=opened.hooks)
            WalletAuthorization(wallet,CardlessATMSimulator(wallet),authority_id=promoted.wallet_authority_id,clock=lambda:self.now)
            WalletBridge(store,wallet,self.account,PUBLIC_TOKENS['wallet'])
        opened.activate(ContractIdentity(promoted,self.account))
        self.assertEqual(wallet.snapshot(),self.snapshot)
        self.assertEqual({name:adopt_legacy.original_tables(destination/name) for name in self.original},self.original)
        with self.assertRaises(RuntimeUnavailable):
            with opened.admit_write(1): self.fail('old epoch admitted')
        with self.assertRaises(RuntimeUnavailable):
            with permit.admit_write(1): self.fail('released source admitted')
        with opened.admit_write(2): opened.bind_registered_account(self.account)
        self.assertEqual(wallet.snapshot(),self.snapshot)

    def test_changed_source_after_copy_refuses_promotion_without_retiring_source(self):
        permit=self.active(); permit.quiesce(); permit.release()
        restore_id,destination=self.stage()
        opened=self.coordinator.open_active(self.spec.ledger_ref); self.permits.append(opened)
        wallet=self.initialize(opened); opened.activate(ContractIdentity(opened.descriptor,self.account))
        with opened.admit_write(1): wallet.simulate_sale(100,'source-after-backup')
        opened.quiesce(); opened.release()
        marker=(self.state/'AUTHORITY.json').read_bytes()
        with self.assertRaises(RuntimeUnavailable): self.coordinator.promote_restore(restore_id)
        self.assertEqual((self.state/'AUTHORITY.json').read_bytes(),marker)
        self.assertEqual(read_json(destination/'AUTHORITY.json')['state'],'RESTORE_PENDING')

    def test_partial_copy_resumes_same_id_and_unknown_destination_file_refuses_promotion(self):
        permit=self.active(); permit.quiesce(); permit.release()
        restore_id=str(uuid.uuid4()); destination=self.root/'restored'; copy=adopt_legacy._copy_exact
        def stop(source,target,expected):
            copy(source,target,expected)
            if target.name == 'wallet-simulator.db': raise OSError('fixture stops after first copied database')
        with patch.object(adopt_legacy,'_copy_exact',side_effect=stop):
            with self.assertRaises(OSError): self.coordinator.stage_restore(self.spec.ledger_ref,destination,restore_id=restore_id)
        self.assertEqual(read_json(destination/'AUTHORITY.json')['state'],'RESTORE_PENDING')
        with self.assertRaises(WalletError): Wallet(destination/'wallet-simulator.db')
        self.coordinator.close(); self.coordinator=AuthorityFenceCoordinator(self.root/'coordinator')
        result=self.coordinator.stage_restore(self.spec.ledger_ref,destination,restore_id=restore_id)
        self.assertFalse(result['writer_enabled'])
        (destination/'uncovered.db').write_bytes(b'extra')
        before=(self.state/'AUTHORITY.json').read_bytes()
        with self.assertRaises(RuntimeUnavailable): self.coordinator.promote_restore(restore_id)
        self.assertEqual((self.state/'AUTHORITY.json').read_bytes(),before)

    def test_done_registry_before_final_receipt_is_completed_by_same_id_retry(self):
        from wallet_backend import authority_fence
        permit=self.active(); permit.quiesce(); permit.release()
        restore_id,destination=self.stage(); write=authority_fence.write_json
        def stop(path,value):
            write(path,value)
            if path == self.root/'coordinator'/'registry.json' and value['restores'][restore_id]['stage']=='DONE':
                raise OSError('fixture stops after durable DONE before final receipt')
        with patch.object(authority_fence,'write_json',side_effect=stop):
            with self.assertRaises(OSError): self.coordinator.promote_restore(restore_id)
        self.assertNotEqual(read_json(destination/'GX00-RESTORE.json')['stage'],'DONE')
        self.coordinator.close(); self.coordinator=AuthorityFenceCoordinator(self.root/'coordinator')
        descriptor=self.coordinator.promote_restore(restore_id)
        self.assertEqual(read_json(destination/'GX00-RESTORE.json')['stage'],'DONE')
        self.assertEqual(descriptor.writer_epoch,2); self.assert_original()

    def test_crash_after_retirement_keeps_both_fenced_until_same_restore_resumes(self):
        permit=self.active(); permit.quiesce(); permit.release()
        restore_id,destination=self.stage(); write=adopt_legacy.write_json
        def stop(path,value):
            write(path,value)
            if path == self.state/'AUTHORITY.json' and value['state']=='RETIRED':
                raise OSError('fixture stops after durable original retirement')
        with patch.object(adopt_legacy,'write_json',side_effect=stop):
            with self.assertRaises(OSError): self.coordinator.promote_restore(restore_id)
        with self.assertRaises(RuntimeUnavailable): self.coordinator.open_active(self.spec.ledger_ref)
        with self.assertRaises(RuntimeUnavailable): self.prepared()
        self.coordinator.close(); self.coordinator=AuthorityFenceCoordinator(self.root/'coordinator')
        promoted=self.coordinator.promote_restore(restore_id)
        self.assertEqual(promoted.writer_epoch,2)
        self.assertEqual(self.coordinator.promote_restore(restore_id),promoted)
        self.assertEqual(read_json(destination/'AUTHORITY.json')['state'],'ACTIVE')
        self.assert_original()


if __name__=='__main__': unittest.main()

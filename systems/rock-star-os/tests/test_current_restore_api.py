"""Real closed-copy proofs, process flocks and same-thread C admission joins."""
from contextlib import closing
from dataclasses import FrozenInstanceError
import copy
import fcntl
import hashlib
import json
import os
from pathlib import Path
import select
import sqlite3
import subprocess
import sys
import threading
import unittest
from unittest.mock import patch
from types import SimpleNamespace
import uuid

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT/'src'), str(ROOT/'os'), str(ROOT/'tests')]
import test_managed_restore as restore_fixture
from wallet_backend.authority_fence import (DB_NAMES, RuntimeUnavailable, _Permit, _TLS,
    canonical, read_json, write_json)
from wallet_backend.runtime_contracts import ContractIdentity
from wallet_backend import adopt_legacy
from wallet_backend.current_restore import CompletedCurrentRestoreProof
from blackberryrock.wallet import Wallet
from entitlement.store import EntitlementStore
from entitlement.wallet_bridge import WalletBridge
from entitlement.protocol import PUBLIC_TOKENS
from wallet_auth.service import WalletAuthorization
from atm import CardlessATMSimulator


class CurrentRestoreAPI(unittest.TestCase):
    # Reuse real nonempty legacy setup, not the fixture's test methods.
    setUp = restore_fixture.RestoreTests.setUp
    cleanup = restore_fixture.RestoreTests.cleanup
    prepared = restore_fixture.RestoreTests.prepared
    initialize = restore_fixture.RestoreTests.initialize
    assert_original = restore_fixture.RestoreTests.assert_original
    active = restore_fixture.RestoreTests.active
    stage = restore_fixture.RestoreTests.stage

    def restored(self):
        permit = self.active()
        self.old = permit.descriptor
        permit.quiesce(); permit.release()
        self.restore_id, self.destination = self.stage()
        self.new = self.coordinator.promote_restore(self.restore_id)
        return self.restore_id

    def open_restored(self):
        permit = self.coordinator.open_active(self.spec.ledger_ref)
        self.permits.append(permit)
        with permit.initialize():
            wallet = Wallet(self.destination/'wallet-simulator.db', managed_write_hooks=permit.hooks)
            store = EntitlementStore(self.destination/'entitlement.db', clock=lambda:self.now, managed_write_hooks=permit.hooks)
            WalletAuthorization(wallet, CardlessATMSimulator(wallet), authority_id=self.new.wallet_authority_id, clock=lambda:self.now)
            WalletBridge(store, wallet, self.account, PUBLIC_TOKENS['wallet'])
        permit.activate(ContractIdentity(self.new, self.account))
        return permit, wallet

    def assert_initial_refused(self):
        before = {str(p): hashlib.sha256(p.read_bytes()).hexdigest()
                  for state in (self.state, self.destination, self.coordinator.registry_dir)
                  for p in state.iterdir() if p.is_file()}
        with self.assertRaises((RuntimeUnavailable, OSError, sqlite3.Error)):
            with self.coordinator.verified_completed_current_restore(self.restore_id):
                self.fail('invalid copy admitted')
        self.assertEqual(before, {path: hashlib.sha256(Path(path).read_bytes()).hexdigest() for path in before})

    def test_nonempty_completed_copy_proof_retains_every_copy_and_rows(self):
        self.restored()
        with self.coordinator.verified_completed_current_restore(self.restore_id) as proof:
            self.assertIs(type(proof), CompletedCurrentRestoreProof)
            self.assertEqual((proof.old_descriptor,proof.new_descriptor,proof.account_id),(self.old,self.new,self.account))
            self.assertEqual(proof.record_sha256, hashlib.sha256(canonical(self.coordinator.registry['restores'][self.restore_id])).hexdigest())
            self.assertEqual({f.name for f in proof.copies}, set(DB_NAMES))
            for item in proof.copies:
                self.assertNotEqual(item.source_identity,item.destination_identity)
                self.assertEqual(item.sha256,adopt_legacy.digest_file(self.state/item.name))
                self.assertEqual(item.sha256,adopt_legacy.digest_file(self.destination/item.name))
            with self.assertRaises(FrozenInstanceError): proof.account_id='other'
        self.assert_original()

    def test_current_state_and_source_process_locks_stay_held_until_plan_finishes(self):
        self.restored()
        probe = '''import fcntl,os,sys
for path in sys.argv[1:]:
 fd=os.open(path,os.O_RDWR)
 try:
  try:fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
  except BlockingIOError:print('BUSY')
  else:print('FREE')
 finally:os.close(fd)
'''
        paths = [str(s/'authority.lock') for s in (self.state,self.destination)]
        def check(expected):
            r=subprocess.run([sys.executable,'-c',probe,*paths],capture_output=True,text=True,timeout=3)
            self.assertEqual(r.returncode,0,r.stderr); self.assertEqual(r.stdout.splitlines(),expected)
        with self.coordinator.verified_completed_current_restore(self.restore_id):
            check(['BUSY','BUSY'])
        check(['FREE','FREE'])

    def test_other_thread_cannot_open_new_writer_before_initial_plan_commit(self):
        self.restored(); entered=threading.Event(); returned=threading.Event(); errors=[]
        def open_after():
            try:
                entered.set(); permit=self.coordinator.open_active(self.spec.ledger_ref)
                returned.set(); permit.abort()
            except BaseException as error:errors.append(error)
        with self.coordinator.verified_completed_current_restore(self.restore_id):
            worker=threading.Thread(target=open_after);worker.start()
            self.assertTrue(entered.wait(2));self.assertFalse(returned.wait(.05))
        worker.join(3);self.assertFalse(worker.is_alive());self.assertEqual(errors,[]);self.assertTrue(returned.is_set())

    def test_existing_permit_unknown_id_and_pending_restore_refused(self):
        self.restored()
        with self.assertRaises(RuntimeUnavailable):
            with self.coordinator.verified_completed_current_restore(str(uuid.uuid4())):self.fail('unknown restore')
        opened=self.coordinator.open_active(self.spec.ledger_ref);self.permits.append(opened)
        self.assert_initial_refused();opened.abort()
        original=copy.deepcopy(self.coordinator.registry['restores'][self.restore_id])
        self.coordinator.registry['restores'][self.restore_id]['stage']='READY';self.coordinator._save_registry()
        self.assert_initial_refused()
        self.coordinator.registry['restores'][self.restore_id]=original;self.coordinator._save_registry()

    def test_retired_marker_receipt_and_extra_copy_file_rejected_without_new_mutation(self):
        self.restored()
        for path, replacement in ((self.state/'AUTHORITY.json',self.coordinator.registry['restores'][self.restore_id]['source_marker']),
                                   (self.destination/'GX00-RESTORE.json',{'stage':'DONE'})):
            with self.subTest(path=path.name):
                original=path.read_bytes();write_json(path,replacement)
                try:self.assert_initial_refused()
                finally:path.write_bytes(original)
        extra=self.destination/'uncovered.db';extra.write_bytes(b'not covered');extra.chmod(0o600)
        self.assert_initial_refused()

    def test_mixed_copy_bytes_inode_and_typed_record_are_rejected(self):
        self.restored();path=self.destination/'wallet-simulator.db';original=path.read_bytes()
        with closing(sqlite3.connect(path)) as db:
            db.execute('CREATE TABLE unintended_business(value)');db.commit()
        self.assert_initial_refused();path.write_bytes(original)
        preserved=self.root/'preserved-wallet.db';path.rename(preserved)
        path.write_bytes(original);path.chmod(0o600)
        self.assert_initial_refused()
        path.unlink();preserved.rename(path)
        changed=copy.deepcopy(self.coordinator.registry['restores'][self.restore_id])
        changed['destination_files']['wallet-simulator.db'][0]=True
        self.coordinator.registry['restores'][self.restore_id]=changed;self.coordinator._save_registry()
        self.assert_initial_refused()

    def test_source_write_after_retirement_and_missing_lock_are_rejected(self):
        self.restored();path=self.state/'wallet-simulator.db';original=path.read_bytes()
        with closing(sqlite3.connect(path)) as db:
            db.execute('CREATE TABLE illicit_legacy_direct_write(value)');db.commit()
        self.assert_initial_refused();path.write_bytes(original)
        lock=self.state/'authority.lock';lock.unlink()
        self.assert_initial_refused();self.assertFalse(lock.exists())

    def test_resume_requires_actual_current_thread_permit_and_matching_record(self):
        self.restored()
        with self.coordinator.verified_completed_current_restore(self.restore_id) as proof:pass
        with self.assertRaises(RuntimeUnavailable):
            with self.coordinator.current_restore_generation(self.restore_id,record_sha256=proof.record_sha256):pass
        permit,wallet=self.open_restored()
        with self.assertRaises(RuntimeUnavailable):
            with self.coordinator.current_restore_generation(self.restore_id,record_sha256=proof.record_sha256):pass
        with permit.admit_write(2):
            with self.assertRaises(RuntimeUnavailable):
                with self.coordinator.current_restore_generation(self.restore_id,record_sha256='0'*64):pass
            with self.coordinator.current_restore_generation(self.restore_id,record_sha256=proof.record_sha256) as current:
                self.assertEqual(current,proof)
                with wallet._transaction() as db:
                    db.execute('CREATE TABLE permitted_epoch_append (value TEXT)')
                    db.execute("INSERT INTO permitted_epoch_append VALUES ('fixed management fixture')")
            with self.coordinator.current_restore_generation(self.restore_id,record_sha256=proof.record_sha256) as after:
                self.assertEqual(after,proof)
        permit.quiesce();permit.release()
        # The generation join intentionally does not claim bytes still equal;
        # initial whole-copy verification now rejects the real appended table.
        self.assert_initial_refused();self.assert_original()

    def test_open_active_initialization_join_is_allowed_before_constructor_only(self):
        self.restored()
        with self.coordinator.verified_completed_current_restore(self.restore_id) as proof:pass
        opening=self.coordinator.open_active(self.spec.ledger_ref);self.permits.append(opening)
        with self.assertRaises(RuntimeUnavailable):
            with self.coordinator.current_restore_generation(self.restore_id,record_sha256=proof.record_sha256):pass
        with opening.initialize():
            with self.coordinator.current_restore_generation(self.restore_id,record_sha256=proof.record_sha256) as actual:
                self.assertEqual(actual,proof)
        opening.abort()

    def test_forged_permit_and_foreign_thread_cannot_reuse_real_admission(self):
        self.restored()
        with self.coordinator.verified_completed_current_restore(self.restore_id) as proof:pass
        permit,wallet=self.open_restored();failures=[]
        def foreign():
            try:
                with self.coordinator.current_restore_generation(self.restore_id,record_sha256=proof.record_sha256):
                    failures.append('foreign thread was admitted')
            except RuntimeUnavailable:pass
        with permit.admit_write(2):
            worker=threading.Thread(target=foreign);worker.start();worker.join(2)
            self.assertFalse(worker.is_alive());self.assertEqual(failures,[])
            forged=_Permit(self.coordinator,permit.descriptor,permit.marker,permit.lock_fd,opening=False)
            forged.inflight=1
            _TLS.permit=forged
            try:
                with self.assertRaises(RuntimeUnavailable):
                    with self.coordinator.current_restore_generation(self.restore_id,record_sha256=proof.record_sha256):pass
            finally:_TLS.permit=permit
        # Even the exact registered object has no live ticket outside admission.
        _TLS.permit=permit
        try:
            with self.assertRaises(RuntimeUnavailable):
                with self.coordinator.current_restore_generation(self.restore_id,record_sha256=proof.record_sha256):pass
        finally:_TLS.permit=None

    def test_initial_whole_copy_refuses_external_state_lock_holder(self):
        self.restored()
        held = '''import fcntl,os,sys
fd=os.open(sys.argv[1],os.O_RDWR)
fcntl.flock(fd,fcntl.LOCK_EX)
print('HELD',flush=True)
sys.stdin.readline()
os.close(fd)
'''
        for state in (self.state,self.destination):
            with self.subTest(state=state.name):
                child=subprocess.Popen([sys.executable,'-c',held,str(state/'authority.lock')],
                                       stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
                try:
                    self.assertTrue(select.select([child.stdout],[],[],3)[0], 'lock-holder did not report readiness')
                    self.assertEqual(child.stdout.readline().strip(),'HELD')
                    self.assert_initial_refused()
                finally:
                    stdout,stderr=child.communicate('\n',timeout=3)
                    self.assertEqual(child.returncode,0,stderr)

    def test_resume_reads_current_generation_with_real_committed_wal(self):
        self.restored()
        with self.coordinator.verified_completed_current_restore(self.restore_id) as proof:pass
        permit,wallet=self.open_restored()
        path=self.destination/'wallet-simulator.db'
        # A real existing reader pins the old snapshot while a normal Wallet
        # transaction commits the management append to the WAL.
        with closing(sqlite3.connect(path,isolation_level=None)) as reader:
            reader.execute('BEGIN')
            reader.execute('SELECT * FROM wallet_journals').fetchall()
            with permit.admit_write(2):
                with self.coordinator.current_restore_generation(self.restore_id,record_sha256=proof.record_sha256):
                    with wallet._transaction() as db:
                        db.execute('CREATE TABLE permitted_epoch_append (value TEXT)')
                        db.execute("INSERT INTO permitted_epoch_append VALUES ('durable WAL append')")
                    self.assertGreater(path.with_name(path.name+'-wal').stat().st_size,0)
            # A later admission must still join the current generation rather
            # than misreading an immutable main-file view or rejecting its WAL.
            with permit.admit_write(2):
                with self.coordinator.current_restore_generation(self.restore_id,record_sha256=proof.record_sha256) as actual:
                    self.assertEqual(actual,proof)
            reader.execute('ROLLBACK')
        self.assert_original()

    def test_live_wal_cannot_hide_changed_owner_from_current_generation(self):
        self.restored()
        with self.coordinator.verified_completed_current_restore(self.restore_id) as proof:pass
        permit,wallet=self.open_restored();path=self.destination/'entitlement.db'
        with closing(sqlite3.connect(path,isolation_level=None)) as reader:
            reader.execute('BEGIN');reader.execute('SELECT * FROM accounts').fetchall()
            with permit.admit_write(2):
                with closing(sqlite3.connect(path)) as writer:
                    writer.execute("UPDATE accounts SET owner_ref='different-owner'");writer.commit()
                self.assertGreater(path.with_name(path.name+'-wal').stat().st_size,0)
                with self.assertRaisesRegex(RuntimeUnavailable,'contract owner differs'):
                    with self.coordinator.current_restore_generation(self.restore_id,record_sha256=proof.record_sha256):pass
            reader.execute('ROLLBACK')

    def test_live_wal_retains_sidecar_ownership_and_marker_rejection(self):
        self.restored()
        with self.coordinator.verified_completed_current_restore(self.restore_id) as proof:pass
        permit,wallet=self.open_restored();path=self.destination/'wallet-simulator.db'
        with closing(sqlite3.connect(path,isolation_level=None)) as reader:
            reader.execute('BEGIN');reader.execute('SELECT * FROM wallet_journals').fetchall()
            with permit.admit_write(2):
                with wallet._transaction() as db:
                    db.execute('CREATE TABLE append_for_sidecar_guard(value)')
                wal=path.with_name(path.name+'-wal');self.assertGreater(wal.stat().st_size,0)
                wal.chmod(0o640)
                try:
                    with self.assertRaisesRegex(RuntimeUnavailable,'owned unaliased mode 0600'):
                        with self.coordinator.current_restore_generation(self.restore_id,record_sha256=proof.record_sha256):pass
                finally:wal.chmod(0o600)
                # Kernel UID projection is an explicit stat guard fixture; the
                # process cannot chown another user's file on non-root hosts.
                target=(wal.stat().st_dev,wal.stat().st_ino);real_fstat=os.fstat
                def foreign_uid(fd):
                    info=real_fstat(fd)
                    if (info.st_dev,info.st_ino)==target:
                        return SimpleNamespace(st_mode=info.st_mode,st_uid=os.geteuid()+1,
                            st_nlink=info.st_nlink,st_dev=info.st_dev,st_ino=info.st_ino)
                    return info
                with patch('wallet_backend.authority_fence.os.fstat',side_effect=foreign_uid):
                    with self.assertRaisesRegex(RuntimeUnavailable,'owned unaliased mode 0600'):
                        with self.coordinator.current_restore_generation(self.restore_id,record_sha256=proof.record_sha256):pass
                marker=self.destination/'AUTHORITY.json';original=marker.read_bytes()
                changed=read_json(marker);changed['descriptor']['owner_ref']='different-owner';write_json(marker,changed)
                try:
                    with self.assertRaises(RuntimeUnavailable):
                        with self.coordinator.current_restore_generation(self.restore_id,record_sha256=proof.record_sha256):pass
                finally:marker.write_bytes(original)
                with self.coordinator.current_restore_generation(self.restore_id,record_sha256=proof.record_sha256):pass
            reader.execute('ROLLBACK')


if __name__=='__main__':unittest.main()

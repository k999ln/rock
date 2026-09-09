"""Real host file-lock/admission and database identity tests; no TLS or QEMU."""
from contextlib import closing
import importlib.util
import json
import os
from pathlib import Path
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import threading
import time
import unittest
import uuid

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT / 'src'), str(ROOT / 'os')]
from blackberryrock.wallet import Wallet, WalletError
from entitlement.store import EntitlementStore
from entitlement.protocol import PUBLIC_TOKENS, sign_fixture_event
from entitlement.wallet_bridge import WalletBridge
from atm import CardlessATMSimulator
from wallet_auth.service import WalletAuthorization
from wallet_backend.authority_fence import AuthorityFenceCoordinator, RuntimeUnavailable, read_json
from wallet_backend.runtime_contracts import FreshContractSpec, ContractIdentity


class FenceTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(); self.root = Path(self.temporary.name).resolve()
        self.addCleanup(self.temporary.cleanup)
        self.coordinator = AuthorityFenceCoordinator(self.root / 'registry')
        self.owner_registry = self.root / 'owner-registry'; self.owner_registry.mkdir(mode=0o700)
        self.owner_registry_uuid = str(uuid.uuid4())
        self.coordinator.bind_owner_registry(self.owner_registry, self.owner_registry_uuid)
        self.permits = []
        self.addCleanup(self.cleanup)

    def cleanup(self):
        for permit in reversed(self.permits):
            if permit.released: continue
            if permit.opening: permit.abort()
            else: permit.quiesce(); permit.release()
        self.coordinator.close()

    def prepare(self, name='alice'):
        opening = self.coordinator.prepare_fresh(FreshContractSpec('ledger-' + name, self.root / name,
            name, 'fixture-owner-' + name, 'fixture-device-' + name))
        self.permits.append(opening); return opening

    def activate(self, opening):
        with opening.initialize():
            wallet = Wallet(opening.descriptor.canonical_state / 'wallet-simulator.db', managed_write_hooks=opening.hooks)
            store = EntitlementStore(opening.descriptor.canonical_state / 'entitlement.db', managed_write_hooks=opening.hooks)
            WalletAuthorization(wallet, CardlessATMSimulator(wallet), authority_id=opening.descriptor.wallet_authority_id)
        return opening.activate(ContractIdentity(opening.descriptor, None)), wallet, store

    def test_unpinned_coordinator_refuses_open_before_state_creation(self):
        other = AuthorityFenceCoordinator(self.root / 'other-coordinator')
        try:
            destination = self.root / 'unbound'
            with self.assertRaises(RuntimeUnavailable):
                other.prepare_fresh(FreshContractSpec('unbound', destination, 'bob', 'owner-bob', 'device-bob'))
            self.assertFalse(destination.exists())
            with self.assertRaises(RuntimeUnavailable): other.open_active('unknown')
        finally: other.close()

    def test_registry_pin_replacement_and_new_nested_contract_are_refused(self):
        self.coordinator.bind_owner_registry(self.owner_registry, self.owner_registry_uuid)
        replacement = self.root / 'replacement-owner'; replacement.mkdir(mode=0o700)
        for path, identity in ((replacement, self.owner_registry_uuid), (self.owner_registry, str(uuid.uuid4()))):
            with self.assertRaises(RuntimeUnavailable): self.coordinator.bind_owner_registry(path, identity)
        for destination in (self.owner_registry / 'nested', self.root / 'registry' / 'nested', self.root):
            with self.assertRaises(RuntimeUnavailable):
                self.coordinator.prepare_fresh(FreshContractSpec('nested', destination, 'bob', 'owner-bob', 'device-bob'))
        self.assertFalse((self.owner_registry / 'nested').exists())
        self.assertFalse((self.root / 'registry' / 'nested').exists())
        self.coordinator.close()
        self.coordinator = AuthorityFenceCoordinator(self.root / 'registry')
        with self.assertRaises(RuntimeUnavailable): self.coordinator.bind_owner_registry(replacement, str(uuid.uuid4()))
        self.coordinator.bind_owner_registry(self.owner_registry, self.owner_registry_uuid)

    def test_prepared_marker_is_durable_before_any_database_creation(self):
        opening = self.prepare(); state = opening.descriptor.canonical_state
        self.assertEqual(read_json(state / 'AUTHORITY.json')['state'], 'PREPARED')
        self.assertEqual(read_json(state / 'GX00-MIGRATION.json')['stage'], 'PREPARED')
        self.assertFalse((state / 'wallet-simulator.db').exists())
        with self.assertRaises(WalletError): Wallet(state / 'wallet-simulator.db')
        self.assertFalse((state / 'wallet-simulator.db').exists())

    def test_real_wallet_action_requires_current_epoch_and_reopens_same_identity(self):
        permit, wallet, _ = self.activate(self.prepare()); descriptor = permit.descriptor
        with self.assertRaises(PermissionError): wallet.simulate_sale(2000, 'outside')
        for invalid in (True, 0, 2):
            with self.assertRaises(RuntimeUnavailable):
                with permit.admit_write(invalid): self.fail('stale epoch admitted')
        with permit.admit_write(1):
            with permit.admit_write(1):
                sale = wallet.simulate_sale(2000, 'sale'); wallet.settle_sale(sale['id'], 'settle')
        permit.quiesce(); permit.release()
        next_open = self.coordinator.open_active(descriptor.ledger_ref); self.permits.append(next_open)
        reopened, wallet2, _ = self.activate(next_open)
        self.assertEqual(reopened.descriptor, descriptor)
        self.assertEqual(wallet2.snapshot()['available_minor'], 2000)

    def test_two_owner_admissions_cannot_nest_or_share_files(self):
        alice, _, _ = self.activate(self.prepare()); bob, _, _ = self.activate(self.prepare('bob'))
        self.assertNotEqual(alice.descriptor.ledger_uuid, bob.descriptor.ledger_uuid)
        with alice.admit_write(1):
            with self.assertRaises(RuntimeUnavailable):
                with bob.admit_write(1): self.fail('cross-contract nesting admitted')
        with self.assertRaises(RuntimeUnavailable): self.coordinator.open_active(alice.descriptor.ledger_ref)

    def test_quiesce_preserves_current_nested_action_and_blocks_waiting_writer(self):
        permit, wallet, _ = self.activate(self.prepare())
        entered, finish, denied = threading.Event(), threading.Event(), threading.Event()
        errors = []
        def action():
            try:
                with permit.admit_write(1):
                    entered.set(); self.assertTrue(finish.wait(3))
                    with permit.admit_write(1): wallet.simulate_sale(100, 'started-before-close')
            except BaseException as error: errors.append(error)
        thread = threading.Thread(target=action); thread.start(); self.assertTrue(entered.wait(2))
        permit.quiesce()
        with self.assertRaises(RuntimeUnavailable): permit.release()
        with self.assertRaises(RuntimeUnavailable): self.coordinator.close()
        with self.assertRaises(RuntimeUnavailable):
            with permit.admit_write(1): self.fail('write after quiesce')
        finish.set(); thread.join(3); self.assertFalse(thread.is_alive()); self.assertEqual(errors, [])
        permit.release(); self.assertEqual(len(wallet.snapshot()['sales']), 1)

    def test_other_thread_admission_serializes_whole_actual_action(self):
        permit, _, _ = self.activate(self.prepare()); entered = threading.Event(); released = threading.Event(); order = []
        def writer():
            with permit.admit_write(1): entered.set(); released.wait(3); order.append('commit-finished')
        def revoke():
            with permit.admit_write(1): order.append('revoked')
        first = threading.Thread(target=writer); first.start(); self.assertTrue(entered.wait(2))
        second = threading.Thread(target=revoke); second.start(); second.join(.05)
        self.assertTrue(second.is_alive()); self.assertEqual(order, [])
        released.set(); first.join(3); second.join(3); self.assertEqual(order, ['commit-finished', 'revoked'])

    def test_real_other_process_cannot_open_owned_coordinator(self):
        code = 'from pathlib import Path;from wallet_backend.authority_fence import AuthorityFenceCoordinator;import sys;AuthorityFenceCoordinator(Path(sys.argv[1]))'
        result = subprocess.run([sys.executable, '-c', code, str(self.root / 'registry')], capture_output=True,
                                env={**os.environ, 'PYTHONPATH': str(ROOT / 'os') + os.pathsep + str(ROOT / 'src')}, timeout=5)
        self.assertNotEqual(result.returncode, 0); self.assertIn(b'BlockingIOError', result.stderr)

    def test_database_replacement_is_rejected_before_next_action(self):
        permit, wallet, _ = self.activate(self.prepare()); path = wallet.path
        with permit.admit_write(1): wallet.simulate_sale(100, 'first')
        copy = path.with_name('replacement'); shutil.copyfile(path, copy); copy.chmod(0o600); os.replace(copy, path)
        before = path.read_bytes()
        with self.assertRaises(RuntimeUnavailable):
            with permit.admit_write(1): wallet.simulate_sale(200, 'not-admitted')
        self.assertEqual(path.read_bytes(), before)

    def test_copied_active_directory_is_not_a_fresh_contract(self):
        permit, _, _ = self.activate(self.prepare()); destination = self.root / 'clone'
        shutil.copytree(permit.descriptor.canonical_state, destination)
        with self.assertRaises(RuntimeUnavailable):
            self.coordinator.prepare_fresh(FreshContractSpec('clone', destination, 'bob', 'owner-bob', 'device-bob'))
        with self.assertRaises(WalletError): Wallet(destination / 'wallet-simulator.db')

    def test_initialize_cannot_be_aborted_while_another_thread_owns_it(self):
        opening = self.prepare(); entered = threading.Event(); finish = threading.Event(); errors = []
        def initialize():
            try:
                with opening.initialize(): entered.set(); self.assertTrue(finish.wait(3)); opening.hooks.require_held()
            except BaseException as error: errors.append(error)
        thread = threading.Thread(target=initialize); thread.start(); self.assertTrue(entered.wait(2))
        with self.assertRaises(RuntimeUnavailable): opening.abort()
        self.assertFalse(opening.released)
        finish.set(); thread.join(3); self.assertFalse(thread.is_alive()); self.assertEqual(errors, [])
        opening.abort()

    def test_same_registration_repairs_commit_between_wallet_and_entitlement(self):
        permit, wallet, store = self.activate(self.prepare()); now = int(time.time())
        with permit.admit_write(1):
            store.ingest(sign_fixture_event('fulfillment', 'handoff', 'device:fixture-device-alice', 1, now, 'handoff',
                {'device_ref':'fixture-device-alice', 'owner_ref':'fixture-owner-alice', 'purchase_ref':'fixture-purchase-alice',
                 'verification_ref':'fixture-verified-alice', 'verified_at':now, 'valid_until':now+86400}))
            account = store.register('fixture-device-alice', 'register-once', PUBLIC_TOKENS['alice'])['account_id']
            with store._transaction() as db:
                db.execute('CREATE TABLE fault (account_id TEXT REFERENCES accounts(account_id) DEFERRABLE INITIALLY DEFERRED)')
                db.execute("CREATE TRIGGER fault_after_binding AFTER INSERT ON wallet_bindings_v2 BEGIN INSERT INTO fault VALUES ('missing'); END")
            with self.assertRaises(sqlite3.IntegrityError): permit.bind_registered_account(account)
            with closing(wallet._connect()) as db:
                self.assertEqual(db.execute('SELECT account_id FROM wallet_storage_identity').fetchone()[0], account)
            with closing(store._connect()) as db:
                self.assertEqual(db.execute('SELECT count(*) FROM wallet_bindings_v2').fetchone()[0], 0)
            with store._transaction() as db:
                db.execute('DROP TRIGGER fault_after_binding'); db.execute('DROP TABLE fault')
            permit.bind_registered_account(account)
            WalletBridge(store, wallet, account, PUBLIC_TOKENS['wallet'])
            permit.bind_registered_account(account)
            with self.assertRaises(RuntimeUnavailable): permit.bind_registered_account('different-account')
            self.assertEqual(store.register('fixture-device-alice', 'register-once', PUBLIC_TOKENS['alice'])['account_id'], account)
        self.assertEqual(read_json(wallet.path.parent / 'AUTHORITY.json')['account_id'], account)
        self.assertEqual(wallet.snapshot()['journals'], [])


if __name__ == '__main__': unittest.main()

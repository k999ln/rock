"""Lower-level admission plumbing only; a test ticket is not a writer fence."""
from contextlib import contextmanager, closing
import hashlib
import json
from pathlib import Path
import sqlite3
import sys
import tempfile
import threading
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT / 'src'), str(ROOT / 'os')]
from blackberryrock.wallet import Wallet, WalletError
from entitlement.store import EntitlementStore
from atm import CardlessATMSimulator
from wallet_auth.service import WalletAuthorization


class TestTicket:
    """Explicit mechanism fixture; does not implement coordinator validation."""
    def __init__(self): self.local = threading.local()
    def held_by_current_thread(self): return bool(getattr(self.local, 'held', False))
    def require_held(self):
        if not self.held_by_current_thread(): raise PermissionError('test admission required')
    @contextmanager
    def held(self):
        old = self.held_by_current_thread(); self.local.held = True
        try: yield
        finally: self.local.held = old


class ManagedHookTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(); self.root = Path(self.temporary.name)
        self.addCleanup(self.temporary.cleanup); self.hooks = TestTicket()

    def test_constructor_without_ticket_rejects_before_directory_or_sql(self):
        for cls in (Wallet, EntitlementStore):
            path = self.root / cls.__name__ / 'state.db'
            with patch.object(cls, '_connect', side_effect=AssertionError('SQL reached')):
                with self.assertRaises(PermissionError): cls(path, managed_write_hooks=self.hooks)
            self.assertFalse(path.parent.exists())

    def test_each_transaction_requires_current_ticket_before_database_lock(self):
        for cls in (Wallet, EntitlementStore):
            with self.hooks.held(): instance = cls(self.root / (cls.__name__ + '.db'), managed_write_hooks=self.hooks)
            before = instance.path.read_bytes()
            with patch.object(instance, '_connect', side_effect=AssertionError('SQL reached')):
                with self.assertRaises(PermissionError):
                    with instance._transaction(): self.fail('unadmitted transaction body ran')
            self.assertEqual(before, instance.path.read_bytes())

    def test_ticket_is_not_inherited_by_another_thread(self):
        with self.hooks.held():
            wallet = Wallet(self.root / 'wallet.db', managed_write_hooks=self.hooks)
            errors = []
            def attempt():
                try: wallet.simulate_sale(100, 'unauthorized-thread')
                except PermissionError: errors.append('denied')
            thread = threading.Thread(target=attempt); thread.start(); thread.join(2)
            self.assertFalse(thread.is_alive()); self.assertEqual(errors, ['denied'])
            self.assertEqual(wallet.snapshot()['sales'], [])

    def test_real_wallet_mutation_and_auth_atm_constructors_share_hook(self):
        with self.hooks.held():
            wallet = Wallet(self.root / 'wallet.db', managed_write_hooks=self.hooks)
            sale = wallet.simulate_sale(2000, 'sale'); wallet.settle_sale(sale['id'], 'settle')
            atm = CardlessATMSimulator(wallet)
        with self.assertRaises(PermissionError): WalletAuthorization(wallet, atm)
        with self.hooks.held(): WalletAuthorization(wallet, atm)
        self.assertEqual(wallet.snapshot()['available_minor'], 2000)

    def test_managed_marker_rejects_unmanaged_new_and_already_open_objects(self):
        wallet = Wallet(self.root / 'wallet.db'); store = EntitlementStore(self.root / 'entitlement.db')
        (self.root / 'AUTHORITY.json').write_text(json.dumps({'schema': 'managed-wallet-authority/2', 'state': 'PREPARED'}))
        for instance, cls in ((wallet, Wallet), (store, EntitlementStore)):
            before = instance.path.read_bytes()
            with self.assertRaises(WalletError): cls(instance.path)
            with self.assertRaises(WalletError):
                with instance._transaction(): self.fail('unmanaged transaction ran')
            self.assertEqual(before, instance.path.read_bytes())

    def test_managed_identity_survives_missing_marker_for_unmanaged_rejection(self):
        for cls, table in ((Wallet, 'wallet_storage_identity'), (EntitlementStore, 'wallet_bindings_v2')):
            path = self.root / (cls.__name__ + '.db'); cls(path)
            with closing(sqlite3.connect(path)) as db:
                db.execute('CREATE TABLE ' + table + ' (fixture TEXT)'); db.commit()
            before = path.read_bytes()
            with self.assertRaises(WalletError): cls(path)
            self.assertEqual(before, path.read_bytes())

    def test_legacy_wallet_and_store_keep_unmanaged_behavior(self):
        wallet = Wallet(self.root / 'wallet.db'); EntitlementStore(self.root / 'entitlement.db')
        sale = wallet.simulate_sale(100, 'legacy'); wallet.settle_sale(sale['id'], 'settle')
        self.assertEqual(wallet.snapshot()['available_minor'], 100)


if __name__ == '__main__': unittest.main()

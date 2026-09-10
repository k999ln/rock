"""Synthetic membership callback; no real identity or authenticator claim."""
from contextlib import closing
from pathlib import Path
import sqlite3
import tempfile
import unittest

from blackberryrock.storage import IdempotencyConflict
from blackberryrock.wallet import Wallet
from atm import (ATMActor, ATMError, AuthenticationError, CardlessATMSimulator,
                 PUBLIC_ATM_FIXTURES, TrustedWalletContext)


class MultiDeviceRecovery(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.path = Path(self.temporary.name) / "wallet.sqlite3"
        self.wallet = Wallet(self.path)
        self.now = 1000.0
        self.a = TrustedWalletContext("account-alice", "device-a", True)
        self.b = TrustedWalletContext("account-alice", "device-b", True)
        self.bob = TrustedWalletContext("account-bob", "device-bob", True)
        self.valid = {(self.a.owner_id, self.a.device_id), (self.b.owner_id, self.b.device_id),
                      (self.bob.owner_id, self.bob.device_id)}
        self.checked = []
        self.actor = ATMActor(*PUBLIC_ATM_FIXTURES["SIM-ATM-001"])
        self.atm = self.restart()
        sale = self.wallet.simulate_sale(20_000, "synthetic-sale")
        self.wallet.settle_sale(sale["id"], "synthetic-settlement")

    def authorize(self, account, device):
        self.checked.append((account, device))
        return (account, device) in self.valid

    def restart(self, **kwargs):
        return CardlessATMSimulator(Wallet(self.path), clock=lambda: self.now,
                                    device_authorizer=self.authorize, **kwargs)

    def issue(self, context, key, amount=4000):
        return self.atm.issue(amount, "SIM-ATM-001", key, context=context)

    def redeem(self, receipt):
        return self.atm.redeem(receipt["code"], "SIM-ATM-001", "redeem-" + receipt["withdrawal_id"],
                               actor=self.actor)

    def rows(self):
        # Keep raw private receipts out of assertion messages and test output.
        with closing(sqlite3.connect(self.path)) as db:
            names = [row[0] for row in db.execute(
                "SELECT name FROM sqlite_master WHERE type='table' "
                "AND (name LIKE 'wallet_%' OR name LIKE 'atm_%') ORDER BY name")]
            return {name: db.execute(f'SELECT * FROM "{name}" ORDER BY rowid').fetchall() for name in names}

    def assert_rows_unchanged(self, before):
        self.assertTrue(before == self.rows(), "private Wallet/ATM rows changed")

    def assert_money(self, held, dispensed=0):
        state = self.wallet.snapshot()
        self.assertEqual(state["held_minor"], held)
        self.assertEqual(state["dispensed_minor"], dispensed)
        self.assertEqual(state["available_minor"], 20_000 - held - dispensed)
        self.assertEqual(state["ledger_balance_minor"], 0)

    def test_replacement_resolves_consumed_hold_without_rebinding_or_second_settlement(self):
        first = self.issue(self.a, "issue-a")
        withdrawal = first["withdrawal_id"]
        self.assertTrue(self.redeem(first)["authorized"])
        historical = self.rows()
        self.valid.remove((self.a.owner_id, self.a.device_id))
        self.assert_rows_unchanged(historical)

        self.assertEqual(self.atm.status(withdrawal, context=self.b)["state"], "AUTHORIZED_NOT_DISPENSED")
        self.assertEqual(self.atm.history(context=self.b)["items"][0]["withdrawal_id"], withdrawal)
        for operation in ("cancel", "timeout"):
            result = getattr(self.atm, operation)(withdrawal, "b-" + operation, context=self.b)
            self.assertEqual(result["state"], "UNKNOWN")
            self.assert_money(4000)
        # Revocation and recovery cannot alter earlier financial receipts.
        after_recovery = self.rows()
        for name in ("atm_wallet_binding",):
            self.assertTrue(historical[name] == after_recovery[name])
        self.assertTrue(all(row in after_recovery["wallet_idempotency"]
                            for row in historical["wallet_idempotency"]))

        # The separate ATM actor may resolve a hold even if no device is eligible.
        self.valid.clear()
        final = self.atm.reconcile(withdrawal, 2000, "SIM-ATM-001", "atm-final", actor=self.actor)
        self.assertEqual(final["state"], "PARTIAL_REVERSED")
        self.assert_money(0, 2000)
        final_rows = self.rows()
        self.assertTrue(final == self.atm.reconcile(withdrawal, 2000, "SIM-ATM-001", "atm-final", actor=self.actor))
        self.assert_rows_unchanged(final_rows)

        self.valid.add((self.b.owner_id, self.b.device_id))
        second = self.issue(self.b, "issue-b", 1000)
        self.assert_money(1000, 2000)
        with closing(sqlite3.connect(self.path)) as db:
            self.assertEqual(db.execute("SELECT owner_id,device_id FROM atm_wallet_binding").fetchone(),
                             (self.a.owner_id, self.a.device_id))
            origins = dict(db.execute("SELECT withdrawal_id,device_id FROM atm_credentials"))
            self.assertEqual(origins, {withdrawal: self.a.device_id, second["withdrawal_id"]: self.b.device_id})
        populated = self.rows()
        self.atm = self.restart()
        self.assert_rows_unchanged(populated)
        self.assertEqual(self.atm.history(context=self.b)["total"], 2)
        self.assertEqual(self.atm.status(withdrawal, context=self.b)["state"], "PARTIAL_REVERSED")
        self.assert_rows_unchanged(populated)

    def test_revocation_denies_every_owner_api_and_cached_reply_without_changing_money(self):
        first = self.issue(self.a, "issue-a")
        withdrawal = first["withdrawal_id"]
        self.redeem(first)
        self.atm.cancel(withdrawal, "cancel-a", context=self.a)
        self.atm.timeout(withdrawal, "timeout-a", context=self.a)
        self.now += 300
        self.atm.expire(withdrawal, "expire-a", context=self.a)
        self.atm.expire_due("cleanup-a", context=self.a)
        self.valid.remove((self.a.owner_id, self.a.device_id))
        operations = {
            "issue retry": lambda: self.issue(self.a, "issue-a"),
            "new issue": lambda: self.issue(self.a, "new-issue-a"),
            "status": lambda: self.atm.status(withdrawal, context=self.a),
            "history": lambda: self.atm.history(context=self.a),
            "cancel retry": lambda: self.atm.cancel(withdrawal, "cancel-a", context=self.a),
            "timeout retry": lambda: self.atm.timeout(withdrawal, "timeout-a", context=self.a),
            "expire retry": lambda: self.atm.expire(withdrawal, "expire-a", context=self.a),
            "cleanup retry": lambda: self.atm.expire_due("cleanup-a", context=self.a),
        }
        before = self.rows()
        for name, operation in operations.items():
            with self.subTest(operation=name):
                count = len(self.checked)
                with self.assertRaises(AuthenticationError):
                    operation()
                self.assertEqual(self.checked[count:], [(self.a.owner_id, self.a.device_id)])
                self.assert_rows_unchanged(before)
        self.assert_money(4000)

    def test_another_valid_account_cannot_read_resolve_replay_or_add_a_withdrawal(self):
        first = self.issue(self.a, "issue-a")
        self.redeem(first)
        withdrawal = first["withdrawal_id"]
        before = self.rows()
        operations = [lambda: self.atm.status(withdrawal, context=self.bob),
                      lambda: self.atm.history(context=self.bob),
                      lambda: self.issue(self.bob, "issue-a"),
                      lambda: self.issue(self.bob, "bob-new"),
                      lambda: self.atm.cancel(withdrawal, "bob-cancel", context=self.bob),
                      lambda: self.atm.expire_due("bob-cleanup", context=self.bob)]
        for operation in operations:
            with self.assertRaises(AuthenticationError):
                operation()
            self.assert_rows_unchanged(before)
        self.assert_money(4000)

    def test_cross_device_idempotency_conflicts_do_not_rewrite_or_add_financial_operations(self):
        first = self.issue(self.a, "contract-key")
        self.assertTrue(first == self.issue(self.a, "contract-key"))
        before = self.rows()
        for amount in (4000, 5000):
            with self.assertRaises(IdempotencyConflict):
                self.issue(self.b, "contract-key", amount)
            self.assert_rows_unchanged(before)
        with self.assertRaises(IdempotencyConflict):
            self.atm.cancel(first["withdrawal_id"], "contract-key", context=self.b)
        self.assert_rows_unchanged(before)
        self.assert_money(4000)
        self.atm.cancel(first["withdrawal_id"], "cancel-a", context=self.a)
        canceled = self.rows()
        with self.assertRaises(IdempotencyConflict):
            self.atm.cancel(first["withdrawal_id"], "cancel-a", context=self.b)
        self.assert_rows_unchanged(canceled)
        self.assert_money(0)

    def test_history_and_expiry_cover_all_account_devices_with_existing_bounds(self):
        consumed = self.issue(self.a, "issue-a")
        self.redeem(consumed)
        unconsumed = self.issue(self.b, "issue-b", 1000)
        self.valid.remove((self.a.owner_id, self.a.device_id))
        history = self.atm.history(context=self.b, limit=1)
        self.assertEqual(history["total"], 2)
        self.assertEqual(len(history["items"]), 1)
        self.assertTrue(history["truncated"])
        before = self.rows()
        for limit in (0, True, 101):
            with self.assertRaises(ATMError):
                self.atm.history(context=self.b, limit=limit)
        for limit in (0, True, 65):
            with self.assertRaises(ATMError):
                self.atm.expire_due("bad-limit", context=self.b, limit=limit)
        self.assert_rows_unchanged(before)
        self.now += 300
        result = self.atm.expire_due("cleanup-b", context=self.b)
        self.assertEqual({item["withdrawal_id"]: item["state"] for item in result["items"]},
                         {consumed["withdrawal_id"]: "UNKNOWN", unconsumed["withdrawal_id"]: "EXPIRED"})
        self.assert_money(4000)
        cleaned = self.rows()
        self.assertTrue(result == self.atm.expire_due("cleanup-b", context=self.b))
        self.assert_rows_unchanged(cleaned)

    def test_authorizer_is_strict_fail_closed_and_cannot_override_inactive_issue_context(self):
        first = self.issue(self.a, "issue-a")
        before = self.rows()
        with self.assertRaises(ATMError):
            CardlessATMSimulator(self.wallet, device_authorizer=True)
        for answer in (False, None, 1, "true"):
            atm = CardlessATMSimulator(self.wallet, clock=lambda: self.now,
                                       device_authorizer=lambda *_, answer=answer: answer)
            with self.assertRaises(AuthenticationError):
                atm.status(first["withdrawal_id"], context=self.b)
            self.assert_rows_unchanged(before)
        def unavailable(*_):
            raise OSError("synthetic membership unavailable")
        atm = CardlessATMSimulator(self.wallet, device_authorizer=unavailable)
        with self.assertRaises(OSError):
            atm.history(context=self.b)
        inactive = TrustedWalletContext(self.b.owner_id, self.b.device_id, False)
        with self.assertRaises(AuthenticationError):
            self.atm.issue(1000, "SIM-ATM-001", "inactive-issue", context=inactive)
        self.assert_rows_unchanged(before)
        self.assert_money(4000)

    def test_opt_in_recovers_legacy_populated_wallet_without_migrating_rows_or_capacity(self):
        legacy = CardlessATMSimulator(self.wallet, clock=lambda: self.now, max_credentials=1)
        first = legacy.issue(4000, "SIM-ATM-001", "legacy-issue", context=self.a)
        before = self.rows()
        self.atm = self.restart(max_credentials=1)
        self.assert_rows_unchanged(before)
        self.assertEqual(self.atm.status(first["withdrawal_id"], context=self.b)["state"], "ISSUED")
        with self.assertRaises(ATMError):
            self.issue(self.b, "b-over-capacity", 1000)
        self.assertTrue(first == self.issue(self.a, "legacy-issue"))
        self.assert_rows_unchanged(before)
        # Removing the opt-in restores strict historical-device access.
        legacy = CardlessATMSimulator(self.wallet, clock=lambda: self.now)
        with self.assertRaises(AuthenticationError):
            legacy.status(first["withdrawal_id"], context=self.b)
        inactive_a = TrustedWalletContext(self.a.owner_id, self.a.device_id, False)
        self.assertEqual(legacy.cancel(first["withdrawal_id"], "legacy-cancel", context=inactive_a)["state"], "CANCELED")
        self.assert_money(0)


if __name__ == "__main__":
    unittest.main()

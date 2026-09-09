from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile
import threading
import unittest
from unittest.mock import patch

from blackberryrock.storage import IdempotencyConflict
from blackberryrock.wallet import (
    ConsentRequired, InsufficientFunds, MAX_AMOUNT_MINOR, MONTHLY_FEE_MINOR,
    Wallet, WalletError,
)


class WalletTest(unittest.TestCase):
    def setUp(self) -> None:
        self.directory = tempfile.TemporaryDirectory()
        self.path = Path(self.directory.name) / "wallet.db"
        self.wallet = Wallet(self.path)

    def tearDown(self) -> None:
        self.directory.cleanup()

    def fund(self, amount_minor: int = 5000, key: str = "initial") -> dict:
        sale = self.wallet.simulate_sale(amount_minor, key + ":sale")
        return self.wallet.settle_sale(sale["id"], key + ":settle")

    def assert_balanced(self) -> dict:
        snapshot = self.wallet.snapshot()
        self.assertEqual(snapshot["ledger_balance_minor"], 0)
        self.assertTrue(snapshot["simulation_only"])
        for journal in snapshot["journals"]:
            self.assertEqual(sum(post["delta_minor"] for post in journal["postings"]), 0)
            self.assertGreaterEqual(len(journal["postings"]), 2)
            for post in journal["postings"]:
                self.assertIs(type(post["delta_minor"]), int)
        self.assertEqual(snapshot["held_minor"], sum(row["held_minor"] for row in snapshot["withdrawals"]))
        self.assertTrue(all(snapshot["accounts"][name] >= 0 for name in snapshot["accounts"] if name != "SALE_CLEARING"))
        return snapshot

    def test_unsettled_sales_cannot_fund_fee_or_withdrawal(self) -> None:
        sale = self.wallet.simulate_sale(3000, "sale")
        self.wallet.consent_monthly(True)
        self.assertEqual(self.wallet.snapshot()["available_minor"], 0)
        self.assertEqual(self.wallet.snapshot()["pending_minor"], 3000)
        with self.assertRaises(InsufficientFunds):
            self.wallet.bill("2026-09", "bill")
        with self.assertRaises(InsufficientFunds):
            self.wallet.reserve(1000, "reserve")
        self.wallet.settle_sale(sale["id"], "settle")
        self.wallet.settle_sale(sale["id"], "settle-again")
        self.wallet.bill("2026-09", "bill")
        snapshot = self.assert_balanced()
        self.assertEqual(snapshot["pending_minor"], 0)
        self.assertEqual(snapshot["available_minor"], 3000 - MONTHLY_FEE_MINOR)
        self.assertEqual(len(snapshot["journals"]), 3)

    def test_monthly_consent_is_explicit_revocable_and_recorded(self) -> None:
        self.fund()
        with self.assertRaises(ConsentRequired):
            self.wallet.bill("2026-09", "bill")
        with self.assertRaises(WalletError):
            self.wallet.consent_monthly("true")
        consent = self.wallet.consent_monthly(True)
        self.assertTrue(consent["accepted"])
        self.assertIn("TEST_FIXTURE", consent["identity_fixture_id"])
        self.assertIn("NOT_ATTESTED", consent["device_entitlement_fixture"])
        self.assertEqual(consent["monthly_fee_minor"], 888)
        bill = self.wallet.bill("2026-09", "bill")
        self.assertEqual(bill["consent_id"], consent["id"])
        self.wallet.consent_monthly(False)
        with self.assertRaises(ConsentRequired):
            self.wallet.bill("2026-10", "next-bill")
        self.assertEqual(self.wallet.bill("2026-09", "bill"), bill)
        self.assertFalse(self.wallet.snapshot()["consent"]["accepted"])
        self.assertEqual(self.assert_balanced()["billed_minor"], 888)

    def test_exact_888_cents_at_most_once_per_month_with_new_retry_keys(self) -> None:
        self.fund()
        self.wallet.consent_monthly(True)
        first = self.wallet.bill("2026-09", "bill1")
        self.assertEqual(first, self.wallet.bill("2026-09", "bill1"))
        self.assertEqual(first, self.wallet.bill("2026-09", "bill2"))
        self.wallet.bill("2026-10", "bill3")
        snapshot = self.assert_balanced()
        self.assertEqual(snapshot["billed_minor"], 1776)
        self.assertEqual(len(snapshot["bills"]), 2)
        self.assertEqual(snapshot["available_minor"], 3224)

    def test_idempotency_key_collision_rejected_including_cross_operation(self) -> None:
        first = self.wallet.simulate_sale(2000, "same")
        self.assertEqual(first, self.wallet.simulate_sale(2000, "same"))
        with self.assertRaises(IdempotencyConflict):
            self.wallet.simulate_sale(2001, "same")
        with self.assertRaises(IdempotencyConflict):
            self.wallet.reserve(2000, "same")
        self.wallet.settle_sale(first["id"], "settle")
        reservation = self.wallet.reserve(1000, "reserve")
        result = self.wallet.dispense(reservation["id"], 400, "cash-event")
        self.assertEqual(result, self.wallet.dispense(reservation["id"], 400, "cash-event"))
        with self.assertRaises(IdempotencyConflict):
            self.wallet.dispense(reservation["id"], 500, "cash-event")
        self.assertEqual(self.assert_balanced()["dispensed_minor"], 400)

    def test_partial_dispense_keeps_hold_until_reconciliation_and_reversal(self) -> None:
        self.fund()
        reservation = self.wallet.reserve(3000, "reserve")
        partial = self.wallet.dispense(reservation["id"], 1000, "partial")
        self.assertEqual(partial["status"], "AWAITING_RECONCILIATION")
        self.assertEqual(partial["held_minor"], 2000)
        snapshot = self.assert_balanced()
        self.assertEqual((snapshot["available_minor"], snapshot["held_minor"], snapshot["dispensed_minor"]), (2000, 2000, 1000))
        with self.assertRaises(InsufficientFunds):
            self.wallet.reserve(2001, "overspend")
        result = self.wallet.reconcile(reservation["id"], 1200, "final-inquiry")
        self.assertEqual(result["status"], "PARTIAL_REVERSED")
        self.assertEqual(result["released_minor"], 1800)
        self.assertEqual(result["held_minor"], 0)
        self.assertEqual(result, self.wallet.reconcile(reservation["id"], 1200, "new-inquiry-key"))
        with self.assertRaises(WalletError):
            self.wallet.reconcile(reservation["id"], 1100, "less-cash")
        with self.assertRaises(WalletError):
            self.wallet.dispense(reservation["id"], 1300, "late-cash")
        snapshot = self.assert_balanced()
        self.assertEqual((snapshot["available_minor"], snapshot["held_minor"], snapshot["dispensed_minor"]), (3800, 0, 1200))
        self.assertEqual(sum(row["kind"] == "withdrawal_hold_reversal" for row in snapshot["journals"]), 1)

    def test_unknown_survives_restart_without_release_and_final_zero_reverses(self) -> None:
        self.fund(2000)
        reservation = self.wallet.reserve(2000, "reserve")
        self.wallet.mark_unknown(reservation["id"])
        self.wallet = Wallet(self.path)
        snapshot = self.assert_balanced()
        self.assertEqual(snapshot["withdrawals"][0]["status"], "UNKNOWN")
        self.assertEqual(snapshot["held_minor"], 2000)
        self.assertEqual(snapshot["available_minor"], 0)
        self.assertEqual(self.wallet.reserve(2000, "reserve")["id"], reservation["id"])
        with self.assertRaises(InsufficientFunds):
            self.wallet.reserve(1, "new-withdrawal")
        result = self.wallet.reconcile(reservation["id"], 0, "inquiry-zero")
        self.assertEqual(result["status"], "REVERSED")
        self.wallet = Wallet(self.path)
        self.assertEqual(self.wallet.reconcile(reservation["id"], 0, "inquiry-zero"), result)
        snapshot = self.assert_balanced()
        self.assertEqual((snapshot["available_minor"], snapshot["held_minor"]), (2000, 0))

    def test_cumulative_observations_and_full_dispense(self) -> None:
        self.fund(1000)
        reservation = self.wallet.reserve(1000, "reserve")
        self.wallet.dispense(reservation["id"], 300, "cash-1")
        self.wallet.mark_unknown(reservation["id"])
        self.wallet.dispense(reservation["id"], 300, "cash-duplicate-new-key")
        with self.assertRaises(WalletError):
            self.wallet.dispense(reservation["id"], 200, "out-of-order")
        with self.assertRaises(WalletError):
            self.wallet.dispense(reservation["id"], 1001, "exceeds-reservation")
        final = self.wallet.dispense(reservation["id"], 1000, "cash-2")
        self.assertEqual(final["status"], "DISPENSED")
        self.assertEqual(self.wallet.reconcile(reservation["id"], 1000, "final"), final)
        with self.assertRaises(WalletError):
            self.wallet.mark_unknown(reservation["id"])
        snapshot = self.assert_balanced()
        self.assertEqual((snapshot["available_minor"], snapshot["held_minor"], snapshot["dispensed_minor"]), (0, 0, 1000))

    def test_invalid_integer_amounts_periods_keys_and_unknown_records(self) -> None:
        for amount in [True, False, 0, -1, 1.5, "100", None, MAX_AMOUNT_MINOR + 1]:
            with self.subTest(amount=amount):
                with self.assertRaises(WalletError):
                    self.wallet.simulate_sale(amount, "invalid-sale")
                with self.assertRaises(WalletError):
                    self.wallet.reserve(amount, "invalid-reserve")
        for period in ["2026-9", "2026-00", "2026-13", "0000-01", "2026-09-01", None]:
            with self.subTest(period=period), self.assertRaises(WalletError):
                self.wallet.bill(period, "bill")
        for key in ["", " ", "x" * 161, None]:
            with self.subTest(key=key), self.assertRaises(WalletError):
                self.wallet.simulate_sale(1, key)
        with self.assertRaises(WalletError):
            self.wallet.settle_sale("missing", "settle")
        with self.assertRaises(WalletError):
            self.wallet.mark_unknown("missing")
        self.assertEqual(self.wallet.snapshot()["journals"], [])
        self.wallet.simulate_sale(MAX_AMOUNT_MINOR, "max-sale")
        self.assertEqual(self.assert_balanced()["pending_minor"], MAX_AMOUNT_MINOR)

    def test_concurrent_monthly_charges_with_different_keys_charge_once(self) -> None:
        self.fund(5000)
        self.wallet.consent_monthly(True)
        barrier = threading.Barrier(8)

        def charge(index: int) -> dict:
            barrier.wait()
            return self.wallet.bill("2026-09", f"concurrent-bill-{index}")

        with ThreadPoolExecutor(max_workers=8) as executor:
            results = list(executor.map(charge, range(8)))
        self.assertEqual(len({row["id"] for row in results}), 1)
        snapshot = self.assert_balanced()
        self.assertEqual(snapshot["available_minor"], 4112)
        self.assertEqual(snapshot["billed_minor"], 888)

    def test_concurrent_fee_and_withdrawal_serialize_across_wallet_instances(self) -> None:
        self.fund(1000)
        self.wallet.consent_monthly(True)
        other = Wallet(self.path)
        barrier = threading.Barrier(2)

        def mutate(operation: str) -> str:
            barrier.wait()
            try:
                if operation == "fee":
                    self.wallet.bill("2026-09", "race-bill")
                else:
                    other.reserve(1000, "race-reserve")
                return "ok"
            except InsufficientFunds:
                return "insufficient"

        with ThreadPoolExecutor(max_workers=2) as executor:
            results = list(executor.map(mutate, ["fee", "withdrawal"]))
        self.assertCountEqual(results, ["ok", "insufficient"])
        snapshot = self.assert_balanced()
        self.assertIn((snapshot["available_minor"], snapshot["held_minor"], snapshot["billed_minor"]), [(0, 1000, 0), (112, 0, 888)])

    def test_exception_after_posting_rolls_back_all_rows_and_retry_can_succeed(self) -> None:
        original = self.wallet._post

        def interrupt(*args, **kwargs):
            original(*args, **kwargs)
            raise RuntimeError("injected interruption after posting")

        with patch.object(self.wallet, "_post", side_effect=interrupt):
            with self.assertRaises(RuntimeError):
                self.wallet.simulate_sale(2000, "retry-sale")
        self.wallet = Wallet(self.path)
        self.assertEqual(self.wallet.snapshot()["sales"], [])
        self.assertEqual(self.wallet.snapshot()["journals"], [])
        self.wallet.simulate_sale(2000, "retry-sale")
        self.assertEqual(self.assert_balanced()["pending_minor"], 2000)

    def test_uncommitted_process_exit_recovers_without_phantom_money(self) -> None:
        self.fund(2000)
        script = """
import os, sys
from blackberryrock.wallet import Wallet
wallet = Wallet(sys.argv[1])
with wallet._transaction() as connection:
    wallet._post(connection, 'test_uncommitted', 'crash-fixture', 'AVAILABLE', 'WITHDRAW_HOLD', 1000)
    os._exit(17)
"""
        process = subprocess.run([sys.executable, "-c", script, str(self.path)], capture_output=True, text=True, timeout=15)
        self.assertEqual(process.returncode, 17, process.stderr)
        self.wallet = Wallet(self.path)
        snapshot = self.assert_balanced()
        self.assertEqual((snapshot["available_minor"], snapshot["held_minor"]), (2000, 0))
        self.assertEqual(len(snapshot["journals"]), 2)

    def test_ledger_and_consent_records_reject_mutation(self) -> None:
        self.fund()
        self.wallet.consent_monthly(True)
        with closing(sqlite3.connect(self.path)) as connection:
            for statement in ["DELETE FROM wallet_postings", "UPDATE wallet_postings SET delta_minor = 1", "DELETE FROM wallet_journals", "DELETE FROM wallet_consents"]:
                with self.subTest(statement=statement), self.assertRaises(sqlite3.IntegrityError):
                    connection.execute(statement)
        self.assert_balanced()


if __name__ == "__main__":
    unittest.main()

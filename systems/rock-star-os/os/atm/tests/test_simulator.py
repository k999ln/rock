from concurrent.futures import ThreadPoolExecutor
from contextlib import closing, contextmanager
import hashlib
import hmac
import json
from pathlib import Path
import sqlite3
import stat
import tempfile
import unittest
from unittest.mock import patch

from blackberryrock.storage import IdempotencyConflict
from blackberryrock.wallet import InsufficientFunds, Wallet
from atm import (ATMActor, ATMError, AuthenticationError, CardlessATMSimulator,
                 PUBLIC_ATM_FIXTURES, TrustedWalletContext)


class CardlessATM(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.path = Path(self.temporary.name) / "wallet.sqlite3"
        self.wallet = Wallet(self.path)
        self.now = 1000.0
        self.atm = CardlessATMSimulator(self.wallet, clock=lambda: self.now)
        self.context = TrustedWalletContext("owner-001", "device-001", True)
        self.inactive = TrustedWalletContext("owner-001", "device-001", False)
        self.actor = ATMActor(*PUBLIC_ATM_FIXTURES["SIM-ATM-001"])
        self.other_actor = ATMActor(*PUBLIC_ATM_FIXTURES["SIM-ATM-002"])
        sale = self.wallet.simulate_sale(200_000, "fund-sale")
        self.wallet.settle_sale(sale["id"], "fund-settle")

    def issue(self, amount=4000, key="issue"):
        return self.atm.issue(amount, "SIM-ATM-001", key, context=self.context)

    def redeem(self, receipt, key="redeem"):
        return self.atm.redeem(receipt["code"], "SIM-ATM-001", key, actor=self.actor)

    def state(self, receipt):
        return self.atm.status(receipt["withdrawal_id"], context=self.context)

    def assert_money(self, held, dispensed=0):
        snapshot = self.wallet.snapshot()
        self.assertEqual(snapshot["held_minor"], held)
        self.assertEqual(snapshot["dispensed_minor"], dispensed)
        self.assertEqual(snapshot["available_minor"], 200_000 - held - dispensed)
        self.assertEqual(snapshot["ledger_balance_minor"], 0)

    def sql_scalar(self, query):
        with closing(sqlite3.connect(self.path)) as connection:
            return connection.execute(query).fetchone()[0]

    def test_issue_receipt_same_key_and_amount_steps(self):
        first = self.issue()
        repeat = self.issue()
        self.assertTrue(first == repeat)  # Do not include raw bearer codes in assertion output.
        self.assertEqual(first["expires_at"] - first["issued_at"], 300)
        self.assertTrue(hmac.compare_digest(hashlib.sha256(first["code"].encode()).hexdigest(), first["code_sha256"]))
        self.assert_money(4000)
        self.assertEqual(self.sql_scalar("SELECT COUNT(*) FROM atm_credentials"), 1)
        for amount in (0, 999, 1001, 50_001, 60_000, True, 1000.0, "1000"):
            with self.subTest(amount=amount), self.assertRaises(ATMError):
                self.atm.issue(amount, "SIM-ATM-001", "invalid", context=self.context)
        self.atm.issue(50_000, "SIM-ATM-001", "maximum", context=self.context)
        self.assert_money(54_000)

    def test_changed_amount_atm_key_or_context_cannot_reissue(self):
        self.issue()
        with self.assertRaises(IdempotencyConflict):
            self.issue(5000)
        with self.assertRaises(IdempotencyConflict):
            self.atm.issue(4000, "SIM-ATM-002", "issue", context=self.context)
        for context in (TrustedWalletContext("owner-002", "device-001", True),
                        TrustedWalletContext("owner-001", "device-002", True)):
            with self.assertRaises(AuthenticationError):
                self.atm.issue(4000, "SIM-ATM-001", "issue", context=context)
            with self.assertRaises(AuthenticationError):
                self.atm.issue(4000, "SIM-ATM-001", "new-key", context=context)
        self.assert_money(4000)

    def test_new_issue_requires_trusted_active_membership(self):
        for context in (self.inactive, {"owner_id": "owner-001", "device_id": "device-001"}, None):
            with self.assertRaises(AuthenticationError):
                self.atm.issue(1000, "SIM-ATM-001", "issue", context=context)
        self.assert_money(0)

    def test_insufficient_settled_balance_does_not_create_credential(self):
        poor_path = Path(self.temporary.name) / "poor.sqlite3"
        poor = Wallet(poor_path)
        simulator = CardlessATMSimulator(poor, clock=lambda: self.now)
        poor.simulate_sale(5000, "unsettled")
        with self.assertRaises(InsufficientFunds):
            simulator.issue(1000, "SIM-ATM-001", "issue", context=self.context)
        self.assertEqual(poor.snapshot()["held_minor"], 0)
        self.assertEqual(simulator.history(context=self.context)["total"], 0)

    def test_db_restart_retrieves_original_code_without_second_hold(self):
        receipt = self.issue()
        restarted = CardlessATMSimulator(Wallet(self.path), clock=lambda: self.now)
        repeated = restarted.issue(4000, "SIM-ATM-001", "issue", context=self.context)
        self.assertTrue(repeated == receipt)
        self.assert_money(4000)

    def test_redeem_is_one_use_and_does_not_dispense(self):
        receipt = self.issue()
        authorized = self.redeem(receipt)
        self.assertTrue(authorized["authorized"])
        self.assertEqual(authorized["state"], "AUTHORIZED_NOT_DISPENSED")
        self.assertTrue(self.redeem(receipt) == authorized)
        with self.assertRaises(ATMError):
            self.redeem(receipt, "second-reading")
        self.assert_money(4000)
        self.assertFalse(self.state(receipt)["code_usable"])

    def test_wrong_atm_actor_token_or_code_rejected(self):
        receipt = self.issue()
        bad = (ATMActor(self.actor.actor_id, "wrong-token"),
               ATMActor("other-actor", self.actor.token), self.other_actor, None)
        for actor in bad:
            with self.assertRaises(AuthenticationError):
                self.atm.redeem(receipt["code"], "SIM-ATM-001", "wrong", actor=actor)
        with self.assertRaises(AuthenticationError):
            self.atm.redeem(receipt["code"], "SIM-ATM-002", "wrong-atm", actor=self.other_actor)
        with self.assertRaises(AuthenticationError):
            self.atm.redeem("Z" * 32, "SIM-ATM-001", "unknown-code", actor=self.actor)
        self.assertEqual(self.state(receipt)["state"], "ISSUED")
        self.assert_money(4000)

    def test_expiry_boundary_rejects_consumption_and_releases_once(self):
        receipt = self.issue()
        self.now = receipt["expires_at"]
        rejected = self.redeem(receipt)
        self.assertFalse(rejected["authorized"])
        self.assertEqual(rejected["state"], "EXPIRED")
        self.assertTrue(self.redeem(receipt) == rejected)
        self.assert_money(0)
        with self.assertRaises(ATMError):
            self.redeem(receipt, "new-key-expired")

    def test_explicit_expiry_not_early_and_valid_just_before_boundary(self):
        receipt = self.issue()
        self.now = receipt["expires_at"] - 0.001
        with self.assertRaises(ATMError):
            self.atm.expire(receipt["withdrawal_id"], "early", context=self.context)
        self.assertTrue(self.redeem(receipt)["authorized"])
        self.assert_money(4000)

    def test_cancel_before_consumption_returns_hold_and_inactive_owner_can_cleanup(self):
        receipt = self.issue()
        result = self.atm.cancel(receipt["withdrawal_id"], "cancel", context=self.inactive)
        self.assertEqual(result["state"], "CANCELED")
        self.assert_money(0)
        self.assertTrue(self.atm.cancel(receipt["withdrawal_id"], "cancel", context=self.inactive) == result)
        with self.assertRaises(ATMError):
            self.redeem(receipt)

    def test_after_consumption_cancel_timeout_expiry_keep_hold_unknown(self):
        receipt = self.issue()
        self.redeem(receipt)
        for operation in ("cancel", "timeout"):
            result = getattr(self.atm, operation)(receipt["withdrawal_id"], operation, context=self.inactive)
            self.assertEqual(result["state"], "UNKNOWN")
            self.assert_money(4000)
        self.now = receipt["expires_at"]
        self.assertEqual(self.atm.expire(receipt["withdrawal_id"], "expire", context=self.context)["state"], "UNKNOWN")
        self.assert_money(4000)

    def test_unconsumed_timeout_does_not_release_early(self):
        receipt = self.issue()
        with self.assertRaises(ATMError):
            self.atm.timeout(receipt["withdrawal_id"], "timeout", context=self.context)
        self.assert_money(4000)

    def test_partial_cumulative_dispense_then_final_reconcile(self):
        receipt = self.issue()
        self.redeem(receipt)
        first = self.atm.dispense(receipt["withdrawal_id"], 1000, "SIM-ATM-001", "partial", actor=self.actor)
        self.assertEqual(first["state"], "PARTIAL_DISPENSED")
        self.assert_money(3000, 1000)
        self.assertTrue(self.atm.dispense(receipt["withdrawal_id"], 1000, "SIM-ATM-001", "partial", actor=self.actor) == first)
        self.atm.dispense(receipt["withdrawal_id"], 2000, "SIM-ATM-001", "more", actor=self.actor)
        self.assert_money(2000, 2000)
        final = self.atm.reconcile(receipt["withdrawal_id"], 2000, "SIM-ATM-001", "final", actor=self.actor)
        self.assertEqual(final["state"], "PARTIAL_REVERSED")
        self.assert_money(0, 2000)
        self.assertTrue(self.atm.reconcile(receipt["withdrawal_id"], 2000, "SIM-ATM-001", "final", actor=self.actor) == final)
        with self.assertRaises(ATMError):
            self.atm.reconcile(receipt["withdrawal_id"], 3000, "SIM-ATM-001", "conflicting-final", actor=self.actor)

    def test_full_dispense_uses_hold_once_and_cannot_become_unknown(self):
        receipt = self.issue()
        self.redeem(receipt)
        result = self.atm.dispense(receipt["withdrawal_id"], 4000, "SIM-ATM-001", "full", actor=self.actor)
        self.assertEqual(result["state"], "DISPENSED")
        self.assert_money(0, 4000)
        self.assertEqual(self.atm.cancel(receipt["withdrawal_id"], "late-cancel", context=self.context)["state"], "DISPENSED")
        self.assert_money(0, 4000)

    def test_reconcile_unknown_zero_returns_hold_only_after_atm_assertion(self):
        receipt = self.issue()
        self.redeem(receipt)
        self.atm.timeout(receipt["withdrawal_id"], "timeout", context=self.context)
        self.assert_money(4000)
        result = self.atm.reconcile(receipt["withdrawal_id"], 0, "SIM-ATM-001", "final-zero", actor=self.actor)
        self.assertEqual(result["state"], "REVERSED")
        self.assert_money(0)

    def test_nonfinal_observation_does_not_clear_unknown(self):
        receipt = self.issue()
        self.redeem(receipt)
        self.atm.timeout(receipt["withdrawal_id"], "timeout", context=self.context)
        for amount, key in ((0, "zero-observed"), (1000, "partial-observed")):
            result = self.atm.dispense(receipt["withdrawal_id"], amount, "SIM-ATM-001", key, actor=self.actor)
            self.assertEqual(result["state"], "UNKNOWN")
            self.assert_money(4000 - amount, amount)

    def test_unconsumed_reconcile_and_decreasing_or_excess_cash_rejected(self):
        receipt = self.issue()
        with self.assertRaises(ATMError):
            self.atm.reconcile(receipt["withdrawal_id"], 0, "SIM-ATM-001", "before-redeem", actor=self.actor)
        self.redeem(receipt)
        self.atm.dispense(receipt["withdrawal_id"], 2000, "SIM-ATM-001", "partial", actor=self.actor)
        for amount in (1000, 5000, True, "2000"):
            with self.subTest(amount=amount), self.assertRaises(ATMError):
                self.atm.reconcile(receipt["withdrawal_id"], amount, "SIM-ATM-001", "invalid", actor=self.actor)
        with self.assertRaises(IdempotencyConflict):
            self.atm.dispense(receipt["withdrawal_id"], 3000, "SIM-ATM-001", "partial", actor=self.actor)
        with self.assertRaises(AuthenticationError):
            self.atm.reconcile(receipt["withdrawal_id"], 2000, "SIM-ATM-002", "other-atm", actor=self.other_actor)
        self.assert_money(2000, 2000)

    def test_expire_due_mixes_unconsumed_and_consumed_without_releasing_unknown(self):
        first = self.issue(key="first")
        second = self.issue(key="second")
        self.redeem(second)
        self.now += 300
        result = self.atm.expire_due("cleanup", context=self.inactive)
        self.assertEqual(result["processed"], 2)
        self.assertEqual(self.state(first)["state"], "EXPIRED")
        self.assertEqual(self.state(second)["state"], "UNKNOWN")
        self.assert_money(4000)
        self.assertTrue(self.atm.expire_due("cleanup", context=self.inactive) == result)

    def test_issue_rollback_includes_hold_credential_binding_and_receipt(self):
        with patch.object(self.wallet, "_remember", side_effect=sqlite3.OperationalError("simulated storage failure")):
            with self.assertRaises(sqlite3.OperationalError):
                self.issue()
        self.assert_money(0)
        self.assertEqual(self.sql_scalar("SELECT COUNT(*) FROM atm_credentials"), 0)
        self.assertEqual(self.sql_scalar("SELECT COUNT(*) FROM atm_wallet_binding"), 0)
        self.assertEqual(self.sql_scalar("SELECT COUNT(*) FROM wallet_idempotency WHERE operation = 'atm.issue'"), 0)
        self.issue()
        self.assert_money(4000)

    def test_redeem_rollback_does_not_consume_code(self):
        receipt = self.issue()
        with patch.object(self.wallet, "_remember", side_effect=sqlite3.OperationalError("simulated failure")):
            with self.assertRaises(sqlite3.OperationalError):
                self.redeem(receipt)
        self.assertEqual(self.state(receipt)["state"], "ISSUED")
        self.assertTrue(self.redeem(receipt)["authorized"])
        self.assert_money(4000)

    def test_cleanup_failure_rolls_back_the_entire_batch(self):
        receipts = [self.issue(key="first"), self.issue(key="second")]
        self.now += 300
        original = self.wallet._post
        calls = 0

        def fail_second(*args):
            nonlocal calls
            result = original(*args)
            calls += 1
            if calls == 2:
                raise sqlite3.OperationalError("simulated cleanup storage failure")
            return result

        with patch.object(self.wallet, "_post", side_effect=fail_second):
            with self.assertRaises(sqlite3.OperationalError):
                self.atm.expire_due("cleanup", context=self.context)
        self.assert_money(8000)
        self.assertTrue(all(self.state(r)["state"] == "ISSUED" for r in receipts))
        self.assertEqual(self.atm.expire_due("cleanup", context=self.context)["processed"], 2)
        self.assert_money(0)

    def test_reconcile_posting_failure_cannot_partially_release_or_finalize(self):
        receipt = self.issue()
        self.redeem(receipt)
        with patch.object(self.wallet, "_remember", side_effect=sqlite3.OperationalError("simulated response storage failure")):
            with self.assertRaises(sqlite3.OperationalError):
                self.atm.reconcile(receipt["withdrawal_id"], 1000, "SIM-ATM-001", "final", actor=self.actor)
        self.assertEqual(self.state(receipt)["state"], "AUTHORIZED_NOT_DISPENSED")
        self.assert_money(4000)
        self.atm.reconcile(receipt["withdrawal_id"], 1000, "SIM-ATM-001", "final", actor=self.actor)
        self.assert_money(0, 1000)

    def test_after_commit_lost_reply_issue_and_cleanup_retry_recover(self):
        original = self.wallet._transaction

        @contextmanager
        def lost_reply():
            with original() as connection:
                yield connection
            raise OSError("simulated lost reply after successful commit")

        with patch.object(self.wallet, "_transaction", lost_reply):
            with self.assertRaises(OSError):
                self.issue()
        receipt = self.issue()
        self.assertEqual(self.sql_scalar("SELECT COUNT(*) FROM atm_credentials"), 1)
        self.assert_money(4000)
        with patch.object(self.wallet, "_transaction", lost_reply):
            with self.assertRaises(OSError):
                self.atm.cancel(receipt["withdrawal_id"], "cancel", context=self.context)
        self.assertEqual(self.atm.cancel(receipt["withdrawal_id"], "cancel", context=self.context)["state"], "CANCELED")
        self.assert_money(0)

    def test_concurrent_same_issue_and_distinct_redemption_keys_are_single_use(self):
        with ThreadPoolExecutor(max_workers=4) as pool:
            results = list(pool.map(lambda ignored: self.issue(), range(4)))
        self.assertTrue(all(result == results[0] for result in results))
        self.assert_money(4000)
        receipt = results[0]

        def read(key):
            try:
                return self.redeem(receipt, key)["authorized"]
            except ATMError:
                return False

        with ThreadPoolExecutor(max_workers=4) as pool:
            results = list(pool.map(read, ["reader-1", "reader-2", "reader-3", "reader-4"]))
        self.assertEqual(sum(results), 1)
        self.assert_money(4000)

    def test_restart_after_consumption_retains_unknown_until_reconciliation(self):
        receipt = self.issue()
        self.redeem(receipt)
        self.atm = CardlessATMSimulator(Wallet(self.path), clock=lambda: self.now)
        self.assertEqual(self.state(receipt)["state"], "AUTHORIZED_NOT_DISPENSED")
        self.atm.timeout(receipt["withdrawal_id"], "timeout", context=self.context)
        self.atm = CardlessATMSimulator(Wallet(self.path), clock=lambda: self.now)
        self.assertEqual(self.state(receipt)["state"], "UNKNOWN")
        self.assert_money(4000)
        self.atm.reconcile(receipt["withdrawal_id"], 0, "SIM-ATM-001", "final", actor=self.actor)
        self.assert_money(0)

    def test_status_history_and_wallet_snapshot_do_not_return_raw_code(self):
        receipt = self.issue()
        public = json.dumps([self.state(receipt), self.atm.history(context=self.context), self.wallet.snapshot()])
        self.assertTrue(receipt["code"] not in public)
        self.assertIn(receipt["code_sha256"], public)
        self.assertEqual(stat.S_IMODE(self.path.stat().st_mode), 0o600)
        with closing(sqlite3.connect(self.path)) as connection:
            issuance = json.loads(connection.execute("SELECT result_json FROM wallet_idempotency WHERE operation='atm.issue'").fetchone()[0])
            digest = connection.execute("SELECT code_sha256 FROM atm_credentials").fetchone()[0]
        self.assertTrue(hmac.compare_digest(issuance["code"], receipt["code"]))
        self.assertTrue(hmac.compare_digest(digest, receipt["code_sha256"]))

    def test_json_cannot_supply_trusted_context_or_fixture_actor(self):
        request = {"v": 1, "op": "atm.issue", "amount_minor": 1000, "atm_id": "SIM-ATM-001", "key": "request"}
        for field in ("owner_id", "device_id", "context", "actor", "token", "eligible_for_new_withdrawals"):
            with self.subTest(field=field), self.assertRaises(ATMError):
                self.atm.dispatch({**request, field: "forged"}, context=self.context)
        with self.assertRaises(AuthenticationError):
            self.atm.dispatch(request)
        result = self.atm.dispatch(request, context=self.context)["result"]
        with self.assertRaises(ATMError):
            self.atm.dispatch({"v": 1, "op": "atm.redeem", "code": result["code"], "atm_id": "SIM-ATM-001", "key": "redeem", "actor_id": self.actor.actor_id})
        self.assertTrue(self.atm.dispatch({"v": 1, "op": "atm.redeem", "code": result["code"], "atm_id": "SIM-ATM-001", "key": "redeem"}, actor=self.actor)["result"]["authorized"])

    def test_ordinary_wallet_bypass_is_detected_not_claimed_secured(self):
        receipt = self.issue()
        self.wallet.reconcile(receipt["withdrawal_id"], 0, "legacy-direct-reconcile")
        with self.assertRaisesRegex(ATMError, "diverged"):
            self.redeem(receipt)
        self.assert_money(0)

    def test_history_limit_and_retention_limit_do_not_break_same_key_replay(self):
        simulator = CardlessATMSimulator(self.wallet, clock=lambda: self.now, max_credentials=2)
        first = simulator.issue(1000, "SIM-ATM-001", "one", context=self.context)
        simulator.issue(1000, "SIM-ATM-001", "two", context=self.context)
        with self.assertRaises(ATMError):
            simulator.issue(1000, "SIM-ATM-001", "three", context=self.context)
        self.assertTrue(simulator.issue(1000, "SIM-ATM-001", "one", context=self.context) == first)
        history = simulator.history(context=self.context, limit=1)
        self.assertEqual(history["total"], 2)
        self.assertTrue(history["truncated"])
        self.assert_money(2000)

    def test_cancel_racing_redeem_linearizes_before_or_after_consumption(self):
        for index in range(4):
            receipt = self.issue(key=f"issue-{index}")

            def consume():
                try:
                    return self.redeem(receipt, f"redeem-{index}")["authorized"]
                except ATMError:
                    return False

            with ThreadPoolExecutor(max_workers=2) as pool:
                consumed = pool.submit(consume)
                cancelled = pool.submit(self.atm.cancel, receipt["withdrawal_id"],
                                        f"cancel-{index}", context=self.context)
                authorized, outcome = consumed.result(), cancelled.result()
            if authorized:
                self.assertEqual(outcome["state"], "UNKNOWN")
                self.assert_money(4000)
                self.atm.reconcile(receipt["withdrawal_id"], 0, "SIM-ATM-001", f"resolve-{index}", actor=self.actor)
            else:
                self.assertEqual(outcome["state"], "CANCELED")
            self.assert_money(0)

    def test_conflicting_concurrent_final_assertions_can_only_finalize_once(self):
        receipt = self.issue()
        self.redeem(receipt)

        def conclude(amount):
            try:
                return self.atm.reconcile(receipt["withdrawal_id"], amount, "SIM-ATM-001",
                                          f"final-{amount}", actor=self.actor)["withdrawal"]["dispensed_minor"]
            except ATMError:
                return None

        with ThreadPoolExecutor(max_workers=2) as pool:
            outcomes = list(pool.map(conclude, [0, 4000]))
        committed = [value for value in outcomes if value is not None]
        self.assertEqual(len(committed), 1)
        self.assert_money(0, committed[0])

    def test_lost_reply_after_consume_and_final_commit_recovers_same_operation(self):
        receipt = self.issue()
        original = self.wallet._transaction

        @contextmanager
        def lost_reply():
            with original() as connection:
                yield connection
            raise OSError("simulated lost reply after successful commit")

        with patch.object(self.wallet, "_transaction", lost_reply):
            with self.assertRaises(OSError):
                self.redeem(receipt)
        self.atm = CardlessATMSimulator(Wallet(self.path), clock=lambda: self.now)
        authorization = self.redeem(receipt)
        self.assertEqual(authorization["authorization_id"], receipt["withdrawal_id"])
        self.assert_money(4000)
        with self.assertRaises(ATMError):
            self.redeem(receipt, "another-reader")
        target_wallet = self.atm.wallet
        original = target_wallet._transaction
        with patch.object(target_wallet, "_transaction", lost_reply):
            with self.assertRaises(OSError):
                self.atm.reconcile(receipt["withdrawal_id"], 1000, "SIM-ATM-001", "final", actor=self.actor)
        result = self.atm.reconcile(receipt["withdrawal_id"], 1000, "SIM-ATM-001", "final", actor=self.actor)
        self.assertEqual(result["state"], "PARTIAL_REVERSED")
        self.assert_money(0, 1000)

    def test_old_issuance_receipt_does_not_mean_code_is_currently_usable(self):
        receipt = self.issue()
        self.now += 300
        self.atm.expire(receipt["withdrawal_id"], "expire", context=self.context)
        replay = self.issue()
        self.assertTrue(replay == receipt)
        self.assertEqual(replay["receipt_kind"], "immutable_issuance")
        self.assertFalse(self.state(receipt)["code_usable"])
        self.assertEqual(self.state(receipt)["state"], "EXPIRED")
        self.assert_money(0)


if __name__ == "__main__":
    unittest.main()

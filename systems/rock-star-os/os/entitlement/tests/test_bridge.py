from contextlib import closing
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import sqlite3
import tempfile
import threading
import unittest

from blackberryrock.wallet import Wallet
from entitlement.protocol import PUBLIC_TOKENS, TERMS_VERSION, Conflict, NotEligible, sign_fixture_event
from entitlement.store import EntitlementStore
from entitlement.wallet_bridge import WalletBridge

F, W, A = [PUBLIC_TOKENS[k] for k in ("fulfillment", "wallet", "alice")]
NOW = 1788858000


class BridgeTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.now = NOW
        self.store = EntitlementStore(self.root / "entitlement.sqlite", clock=lambda: self.now)
        self.store.ingest(sign_fixture_event("fulfillment", "handoff", "device:fixture-device", 1, NOW, "handoff",
            {"device_ref": "fixture-device", "owner_ref": "fixture-owner-alice", "purchase_ref": "fixture-purchase",
             "verification_ref": "fixture-verified", "verified_at": NOW, "valid_until": NOW+86400*90}))
        self.account = self.store.register("fixture-device", "register", A)["account_id"]
        self.store.consent(self.account, True, TERMS_VERSION, "consent", A)
        self.auth = self.store.authorize_month(self.account, "2026-09", "authorize", W)
        self.auth = self.store.claim_authorization(self.auth["authorization_id"], "claim", W)
        self.wallet = Wallet(self.root / "wallet.sqlite")
        self.bridge = WalletBridge(self.store, self.wallet, self.account, W)

    def tearDown(self):
        self.temporary.cleanup()

    def fund_fixture(self):
        sale = self.wallet.simulate_sale(3000, "fixture-sale")
        self.wallet.settle_sale(sale["id"], "fixture-settle")

    def test_bridge_actual_wallet_concurrent_replay_one_debit(self):
        self.fund_fixture()
        def run(_):
            return self.bridge.execute(self.auth["authorization_id"], "same-operation", W)
        with ThreadPoolExecutor(max_workers=6) as pool:
            results = list(pool.map(run, range(6)))
        self.assertTrue(all(row == results[0] for row in results))
        self.assertEqual("PAID", results[0]["authorization"]["state"])
        self.assertEqual(888, self.wallet.snapshot()["billed_minor"])

    def test_crash_after_wallet_commit_before_backend_commit_recovers(self):
        self.fund_fixture()
        with closing(sqlite3.connect(self.store.path)) as db, db:
            db.execute("CREATE TRIGGER crash BEFORE INSERT ON receipts WHEN NEW.operation='wallet-bridge' "
                       "BEGIN SELECT RAISE(ABORT,'simulated-crash-after-Wallet'); END")
        with self.assertRaises(sqlite3.IntegrityError):
            self.bridge.execute(self.auth["authorization_id"], "recover", W)
        self.assertEqual(888, self.wallet.snapshot()["billed_minor"])
        self.assertEqual("CLAIMED", self.store.authorization(self.auth["authorization_id"], W)["state"])
        with closing(sqlite3.connect(self.store.path)) as db, db:
            db.execute("DROP TRIGGER crash")
        restarted = EntitlementStore(self.store.path, clock=lambda: self.now)
        result = WalletBridge(restarted, Wallet(self.wallet.path), self.account, W).execute(self.auth["authorization_id"], "recover", W)
        self.assertEqual("PAID", result["authorization"]["state"])
        self.assertEqual(888, self.wallet.snapshot()["billed_minor"])

    def test_definite_insufficient_funds_rearm_uses_identical_wallet_key(self):
        result = self.bridge.execute(self.auth["authorization_id"], "insufficient", W)
        self.assertEqual("FAILED", result["authorization"]["state"])
        self.fund_fixture()
        rearmed = self.store.authorize_month(self.account, "2026-09", "retry-authorize", W)
        rearmed = self.store.claim_authorization(rearmed["authorization_id"], "retry-claim", W)
        self.assertEqual(self.auth["wallet_idempotency_key"], rearmed["wallet_idempotency_key"])
        result = self.bridge.execute(rearmed["authorization_id"], "retry-execute", W)
        self.assertEqual("PAID", result["authorization"]["state"])
        self.assertEqual(888, self.wallet.snapshot()["billed_minor"])

    def test_cancel_and_expiry_stop_fresh_debit_even_if_claimed(self):
        self.fund_fixture()
        self.store.consent(self.account, False, TERMS_VERSION, "cancel", A)
        result = self.bridge.execute(self.auth["authorization_id"], "cancel-before-execution", W)
        self.assertEqual("FAILED", result["authorization"]["state"])
        self.assertEqual(0, self.wallet.snapshot()["billed_minor"])
        self.store.consent(self.account, True, TERMS_VERSION, "renew", A)
        self.store.authorize_month(self.account, "2026-09", "rearm", W)
        self.store.claim_authorization(self.auth["authorization_id"], "reclaim", W)
        self.now += 301
        result = self.bridge.execute(self.auth["authorization_id"], "expired", W)
        self.assertEqual("FAILED", result["authorization"]["state"])
        self.assertEqual(0, self.wallet.snapshot()["billed_minor"])

    def test_cancel_serializes_after_wallet_execution_already_started(self):
        self.fund_fixture()
        entered, release = threading.Event(), threading.Event()
        original = self.wallet.bill
        def delayed_bill(*args, **kwargs):
            entered.set()
            if not release.wait(3):
                raise RuntimeError("test synchronization timeout")
            return original(*args, **kwargs)
        self.wallet.bill = delayed_bill
        with ThreadPoolExecutor(max_workers=2) as pool:
            execution = pool.submit(self.bridge.execute, self.auth["authorization_id"], "execute", W)
            self.assertTrue(entered.wait(2))
            cancellation = pool.submit(self.store.consent, self.account, False, TERMS_VERSION, "cancel", A)
            release.set()
            self.assertEqual("PAID", execution.result()["authorization"]["state"])
            self.assertFalse(cancellation.result()["accepted"])
        self.assertEqual(888, self.wallet.snapshot()["billed_minor"])
        self.assertEqual("CANCEL_AT_PERIOD_END", self.store.entitlement(self.account, A)["subscription_state"])

    def test_unknown_wallet_exception_keeps_claimed_for_reconciliation(self):
        self.fund_fixture()
        original = self.wallet.bill
        def lost_ack(*args, **kwargs):
            original(*args, **kwargs)
            raise OSError("simulated lost local result")
        self.wallet.bill = lost_ack
        with self.assertRaises(OSError):
            self.bridge.execute(self.auth["authorization_id"], "unknown", W)
        self.assertEqual("CLAIMED", self.store.authorization(self.auth["authorization_id"], W)["state"])
        self.wallet.bill = original
        result = self.bridge.execute(self.auth["authorization_id"], "unknown", W)
        self.assertEqual("PAID", result["authorization"]["state"])
        self.assertEqual(888, self.wallet.snapshot()["billed_minor"])

    def test_stale_claim_receipt_cannot_reexecute_failed_authorization(self):
        self.bridge.execute(self.auth["authorization_id"], "insufficient", W)
        old = self.store.claim_authorization(self.auth["authorization_id"], "claim", W)
        self.assertEqual("CLAIMED", old["state"])
        self.fund_fixture()
        with self.assertRaises(NotEligible):
            self.bridge.execute(old["authorization_id"], "stale-claim-receipt", W)
        self.assertEqual(0, self.wallet.snapshot()["billed_minor"])

    def test_wallet_rebinding_and_unclaimed_execution_rejected(self):
        with self.assertRaises(Conflict):
            WalletBridge(self.store, Wallet(self.root / "other-wallet.sqlite"), self.account, W)
        self.store.consent(self.account, False, TERMS_VERSION, "cancel", A)
        self.bridge.execute(self.auth["authorization_id"], "failure", W)
        self.store.consent(self.account, True, TERMS_VERSION, "restore", A)
        self.store.authorize_month(self.account, "2026-09", "rearm", W)
        with self.assertRaises(NotEligible):
            self.bridge.execute(self.auth["authorization_id"], "unclaimed", W)


if __name__ == "__main__":
    unittest.main()

from contextlib import closing
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from datetime import datetime, timezone
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest

from blackberryrock.wallet import Wallet, InsufficientFunds
from entitlement.protocol import (PUBLIC_TOKENS, TERMS_VERSION, AuthenticationError, Capacity,
                                  Conflict, EntitlementError, NotEligible, sign_fixture_event)
from entitlement.store import EntitlementStore

F, W, A, B = [PUBLIC_TOKENS[name] for name in ("fulfillment", "wallet", "alice", "bob")]
START = int(datetime(2026, 9, 8, 9, tzinfo=timezone.utc).timestamp())
OCTOBER = int(datetime(2026, 10, 1, tzinfo=timezone.utc).timestamp())


class EntitlementTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.now = START
        self.store = EntitlementStore(self.root / "backend.sqlite", clock=lambda: self.now)
        self.device = "fixture-device-alice"
        self.seq = 0

    def tearDown(self):
        self.temporary.cleanup()

    def event(self, kind="handoff", *, seq=None, event_id=None, device=None, **updates):
        device = device or self.device
        seq = seq or self.seq + 1
        self.seq = max(seq, self.seq)
        payload = {"device_ref": device}
        if kind != "suspend":
            payload.update(verification_ref="fixture-verification-001", verified_at=self.now,
                           valid_until=self.now + 90*86400)
        if kind == "handoff":
            payload.update(owner_ref="fixture-owner-alice", purchase_ref="fixture-purchase-001")
        payload.update(updates)
        return sign_fixture_event("fulfillment", event_id or f"device-event-{device}-{seq}",
                                  "device:" + device, seq, self.now, kind, payload)

    def registered(self, consent=True):
        self.store.ingest(self.event())
        account = self.store.register(self.device, "registration", A)["account_id"]
        if consent:
            self.store.consent(account, True, TERMS_VERSION, "consent", A)
        return account

    def claimed(self, account=None):
        account = account or self.registered()
        row = self.store.authorize_month(account, "2026-09", "authorize", W)
        return self.store.claim_authorization(row["authorization_id"], "claim", W)

    def outcome(self, row, kind="payment_succeeded", seq=1, event_id=None, **updates):
        payload = {"authorization_id": row["authorization_id"], "attempt": row["attempt"],
                   "period": row["period"], "amount_minor": 888, "currency": "USD"}
        payload.update(wallet_bill_id="fixture-wallet-bill-001" if kind == "payment_succeeded" else None)
        if kind == "payment_failed":
            payload.pop("wallet_bill_id")
            payload["reason"] = "insufficient_funds"
        payload.update(updates)
        return sign_fixture_event("wallet", event_id or f"billing-event-{row['authorization_id']}-{seq}",
                                  "billing:" + row["authorization_id"], seq, self.now, kind, payload)

    def test_purchase_owner_bound_minimal_registration_and_replay(self):
        with self.assertRaises(NotEligible):
            self.store.register(self.device, "absent", A)
        event = self.event()
        receipt = self.store.ingest(event)
        self.assertEqual(receipt, self.store.ingest(event))
        with self.assertRaises(NotEligible):
            self.store.register(self.device, "wrong-owner", B)
        first = self.store.register(self.device, "register", A)
        self.assertEqual(first, self.store.register(self.device, "register", A))
        self.assertEqual(first["additional_personal_fields_required"], [])
        self.assertEqual(first["verification_ref"], "fixture-verification-001")
        self.assertEqual(first["account_id"], self.store.register(self.device, "second-key", A)["account_id"])
        with self.assertRaises(AuthenticationError):
            self.store.entitlement(first["account_id"], B)

    def test_no_identity_documents_or_arbitrary_personal_fields(self):
        for fields in ({"document_number": "NOT-REAL"}, {"owner_ref": "a-real-looking-name"},
                       {"verified_at": True}, {"valid_until": START+400*86400}):
            with self.subTest(fields=fields), self.assertRaises(EntitlementError):
                self.store.ingest(self.event(seq=1, **fields))

    def test_forged_unknown_actor_wrong_role_and_payload_tamper(self):
        valid = self.event()
        changed = deepcopy(valid)
        changed["payload"]["owner_ref"] = "fixture-owner-bob"
        with self.assertRaises(AuthenticationError):
            self.store.ingest(changed)
        forged = deepcopy(valid)
        forged["signature"] = "0"*64
        with self.assertRaises(AuthenticationError):
            self.store.ingest(forged)
        with self.assertRaises(AuthenticationError):
            self.store.register(self.device, "bad", "bogus")
        with self.assertRaises(AuthenticationError):
            self.store.register(self.device, "bad", W)
        swapped = sign_fixture_event("wallet", "wrong-issuer", valid["stream"], 1, self.now,
                                     valid["kind"], valid["payload"])
        with self.assertRaises(AuthenticationError):
            self.store.ingest(swapped)

    def test_explicit_exact_terms_consent_and_current_month_only(self):
        account = self.registered(False)
        with self.assertRaises(NotEligible):
            self.store.authorize_month(account, "2026-09", "no-consent", W)
        for accepted, terms in ((1, TERMS_VERSION), (True, "old-terms")):
            with self.assertRaises(EntitlementError):
                self.store.consent(account, accepted, terms, "wrong", A)
        consent = self.store.consent(account, True, TERMS_VERSION, "accept", A)
        self.assertEqual((888, "USD"), (consent["amount_minor"], consent["currency"]))
        with self.assertRaises(AuthenticationError):
            self.store.authorize_month(account, "2026-09", "owner-is-not-wallet", A)
        for period in ("2026-08", "2026-10", "2026-13", "2026-9", 202609):
            with self.assertRaises(EntitlementError):
                self.store.authorize_month(account, period, "bad-month", W)

    def test_reordered_webhooks_wait_for_gap_and_survive_restart(self):
        handoff, suspend, restore = self.event(), self.event("suspend"), self.event("restore")
        receipt = self.store.ingest(restore)
        self.assertEqual("QUEUED", self.store.event_status(restore["event_id"], F)["status"])
        self.store = EntitlementStore(self.root / "backend.sqlite", clock=lambda: self.now)
        self.store.ingest(handoff)
        self.store.ingest(suspend)
        self.assertEqual("APPLIED", self.store.event_status(restore["event_id"], F)["status"])
        self.assertEqual(receipt, self.store.ingest(restore))
        self.store.register(self.device, "register", A)

    def test_duplicate_event_id_and_sequence_conflicts(self):
        first = self.event()
        self.store.ingest(first)
        changed = self.event(seq=1, verification_ref="fixture-other-verification")
        with self.assertRaises(Conflict):
            self.store.ingest(changed)
        with self.assertRaises(Conflict):
            self.store.ingest(self.event(seq=1, event_id="different-id"))

    def test_bounded_reordering_full_inbox_can_accept_gap_closer(self):
        self.store = EntitlementStore(self.root / "backend.sqlite", clock=lambda: self.now, max_pending=2)
        event = self.event("suspend", seq=2)
        self.store.ingest(event)
        other = self.event("suspend", seq=2, device="fixture-other-device")
        self.store.ingest(other)
        self.store.ingest(self.event(seq=1))
        self.assertEqual("APPLIED", self.store.event_status(event["event_id"], F)["status"])
        with self.assertRaises(Conflict):
            self.store.ingest(self.event("suspend", seq=7))

    def test_poison_transition_does_not_block_following_signed_events(self):
        wrong = self.event("suspend", seq=1)
        self.store.ingest(wrong)
        self.assertEqual("REJECTED", self.store.event_status(wrong["event_id"], F)["status"])
        correct = self.event(seq=2)
        self.store.ingest(correct)
        self.assertEqual("APPLIED", self.store.event_status(correct["event_id"], F)["status"])
        self.store.register(self.device, "register", A)

    def test_handoff_reassignment_and_duplicate_purchase_rejected(self):
        self.store.ingest(self.event())
        event = self.event(owner_ref="fixture-owner-bob")
        self.store.ingest(event)
        self.assertEqual("REJECTED", self.store.event_status(event["event_id"], F)["status"])
        other = self.event(device="fixture-device-bob", seq=1, owner_ref="fixture-owner-bob")
        self.store.ingest(other)
        self.assertEqual("REJECTED", self.store.event_status(other["event_id"], F)["status"])
        with self.assertRaises(NotEligible):
            self.store.register("fixture-device-bob", "register", B)

    def test_suspend_expire_restore_never_creates_consent(self):
        account = self.registered(False)
        self.store.ingest(self.event("suspend"))
        self.assertEqual("DEVICE_SUSPENDED", self.store.entitlement(account, A)["subscription_state"])
        with self.assertRaises(NotEligible):
            self.store.consent(account, True, TERMS_VERSION, "bad-consent", A)
        self.store.ingest(self.event("restore"))
        self.assertEqual("CONSENT_REQUIRED", self.store.entitlement(account, A)["subscription_state"])
        self.now += 91*86400
        self.assertEqual("IDENTITY_EXPIRED", self.store.entitlement(account, A)["subscription_state"])
        self.store.ingest(self.event("restore", verification_ref="fixture-verification-renewed"))
        self.assertTrue(self.store.entitlement(account, A)["device_eligible"])
        self.assertFalse(self.store.entitlement(account, A)["auto_renew"])

    def test_authorization_id_unique_per_month_concurrent_connections(self):
        account = self.registered()
        def run(index):
            store = EntitlementStore(self.root / "backend.sqlite", clock=lambda: self.now)
            return store.authorize_month(account, "2026-09", f"parallel-{index}", W)
        with ThreadPoolExecutor(max_workers=8) as pool:
            rows = list(pool.map(run, range(8)))
        self.assertEqual(1, len({row["authorization_id"] for row in rows}))
        with closing(sqlite3.connect(self.root / "backend.sqlite")) as db, db:
            self.assertEqual(1, db.execute("SELECT COUNT(*) FROM authorizations").fetchone()[0])

    def test_idempotency_same_result_after_restart_and_conflict(self):
        account = self.registered()
        original = self.store.authorize_month(account, "2026-09", "stable", W)
        self.now += 400
        self.store = EntitlementStore(self.root / "backend.sqlite", clock=lambda: self.now)
        self.assertEqual(original, self.store.authorize_month(account, "2026-09", "stable", W))
        with self.assertRaises(Conflict):
            self.store.authorize_month(account, "2026-10", "stable", W)
        with self.assertRaises(NotEligible):
            self.store.claim_authorization(original["authorization_id"], "claim-expired", W)
        refreshed = self.store.authorize_month(account, "2026-09", "refresh", W)
        self.assertEqual(original["authorization_id"], refreshed["authorization_id"])
        self.assertGreater(refreshed["expires_at"], original["expires_at"])

    def test_cancel_prevents_unclaimed_charge_and_reconsent_reuses_id(self):
        account = self.registered()
        authorization = self.store.authorize_month(account, "2026-09", "authorize", W)
        self.store.consent(account, False, TERMS_VERSION, "cancel", A)
        with self.assertRaises(NotEligible):
            self.store.claim_authorization(authorization["authorization_id"], "claim", W)
        self.assertEqual("CANCELED", self.store.entitlement(account, A)["subscription_state"])
        self.store.consent(account, True, TERMS_VERSION, "reconsent", A)
        reissued = self.store.authorize_month(account, "2026-09", "reissue", W)
        self.assertEqual(authorization["authorization_id"], reissued["authorization_id"])
        self.assertNotEqual(authorization["consent_id"], reissued["consent_id"])

    def test_inflight_cancel_keeps_unknown_then_late_success_without_renewal(self):
        row = self.claimed()
        canceled = self.store.consent(row["account_id"], False, TERMS_VERSION, "cancel", A)
        self.assertEqual([row["authorization_id"]], canceled["inflight_authorizations"])
        self.assertEqual("CLAIMED", self.store.authorization(row["authorization_id"], W)["state"])
        self.store.ingest(self.outcome(row))
        state = self.store.entitlement(row["account_id"], A)
        self.assertEqual("CANCEL_AT_PERIOD_END", state["subscription_state"])
        self.assertTrue(state["access_allowed"])
        self.assertFalse(state["auto_renew"])
        self.now = OCTOBER
        self.assertEqual("CANCELED", self.store.entitlement(row["account_id"], A)["subscription_state"])
        with self.assertRaises(NotEligible):
            self.store.authorize_month(row["account_id"], "2026-10", "next", W)

    def test_paid_expiry_and_next_month_restoration(self):
        row = self.claimed()
        self.store.ingest(self.outcome(row))
        self.assertEqual("ACTIVE", self.store.entitlement(row["account_id"], A)["subscription_state"])
        self.now = OCTOBER
        self.assertEqual("PAST_DUE", self.store.entitlement(row["account_id"], A)["subscription_state"])
        next_row = self.store.authorize_month(row["account_id"], "2026-10", "october", W)
        self.assertNotEqual(row["authorization_id"], next_row["authorization_id"])
        next_row = self.store.claim_authorization(next_row["authorization_id"], "october-claim", W)
        self.store.ingest(self.outcome(next_row, wallet_bill_id="fixture-wallet-bill-october"))
        self.assertEqual("ACTIVE", self.store.entitlement(row["account_id"], A)["subscription_state"])

    def test_failure_recovery_same_wallet_key_and_monotonic_paid(self):
        row = self.claimed()
        failure = self.outcome(row, "payment_failed")
        self.store.ingest(failure)
        self.assertEqual("FAILED", self.store.authorization(row["authorization_id"], W)["state"])
        retry = self.store.authorize_month(row["account_id"], "2026-09", "retry", W)
        retry = self.store.claim_authorization(retry["authorization_id"], "retry-claim", W)
        self.assertEqual(row["wallet_idempotency_key"], retry["wallet_idempotency_key"])
        self.assertEqual(2, retry["attempt"])
        self.store.ingest(self.outcome(retry, seq=2))
        self.store.ingest(self.outcome(row, "payment_failed", seq=3))
        self.assertEqual("PAID", self.store.authorization(row["authorization_id"], W)["state"])
        contradictory = self.outcome(retry, seq=4, wallet_bill_id="fixture-other-bill")
        self.store.ingest(contradictory)
        self.assertEqual("REJECTED", self.store.event_status(contradictory["event_id"], W)["status"])

    def test_billing_reorder_does_not_reverse_later_success(self):
        row = self.claimed()
        success = self.outcome(row, seq=2)
        self.store.ingest(success)
        self.assertFalse(self.store.entitlement(row["account_id"], A)["access_allowed"])
        self.store.ingest(self.outcome(row, "payment_failed", seq=1))
        self.assertEqual("PAID", self.store.authorization(row["authorization_id"], W)["state"])

    def test_earlier_attempt_late_success_after_reclaim_preserves_cancellation(self):
        first = self.claimed()
        self.now += 1
        self.store.ingest(self.outcome(first, 'payment_failed'))
        self.now += 1
        delayed = self.outcome(first, seq=2)
        self.now += 1
        retry = self.store.authorize_month(first['account_id'], '2026-09', 'later-authorize', W)
        retry = self.store.claim_authorization(retry['authorization_id'], 'later-claim', W)
        self.assertGreater(retry['claimed_at'], delayed['occurred_at'])
        self.now += 1
        self.store.consent(first['account_id'], False, TERMS_VERSION, 'cancel-after-reclaim', A)
        self.store.ingest(delayed)
        self.assertEqual('APPLIED', self.store.event_status(delayed['event_id'], W)['status'])
        self.assertEqual('PAID', self.store.authorization(first['authorization_id'], W)['state'])
        status = self.store.entitlement(first['account_id'], A)
        self.assertTrue(status['access_allowed'])
        self.assertFalse(status['auto_renew'])
        self.assertEqual('CANCEL_AT_PERIOD_END', status['subscription_state'])

    def test_billing_result_must_not_predate_its_own_attempt(self):
        first = self.claimed()
        self.now += 1
        self.store.ingest(self.outcome(first, 'payment_failed'))
        before_retry = self.now + 1
        self.now += 3
        retry = self.store.authorize_month(first['account_id'], '2026-09', 'next-authorize', W)
        retry = self.store.claim_authorization(retry['authorization_id'], 'next-claim', W)
        event = self.outcome(retry, seq=2)
        event = sign_fixture_event('wallet', event['event_id'], event['stream'], 2, before_retry,
                                   event['kind'], event['payload'])
        self.store.ingest(event)
        result = self.store.event_status(event['event_id'], W)
        self.assertEqual('REJECTED', result['status'])
        self.assertIn('predates its claim', result['outcome'])
        self.assertFalse(self.store.entitlement(first['account_id'], A)['access_allowed'])

    def test_claim_history_is_append_only_and_legacy_receipts_restore_each_attempt(self):
        first = self.claimed()
        self.now += 1
        self.store.ingest(self.outcome(first, 'payment_failed'))
        self.now += 1
        delayed = self.outcome(first, seq=2)
        self.now += 1
        retry = self.store.authorize_month(first['account_id'], '2026-09', 'migration-authorize', W)
        retry = self.store.claim_authorization(retry['authorization_id'], 'migration-claim', W)
        with closing(sqlite3.connect(self.store.path)) as db, db:
            for statement in ('UPDATE authorization_claims SET claimed_at=0', 'DELETE FROM authorization_claims'):
                with self.assertRaises(sqlite3.IntegrityError):
                    db.execute(statement)
            # A pre-upgrade simulator has the receipts but not the new table.
            db.execute('DROP TABLE authorization_claims')
        restarted = EntitlementStore(self.store.path, clock=lambda: self.now)
        restarted = EntitlementStore(self.store.path, clock=lambda: self.now)
        with closing(sqlite3.connect(restarted.path)) as db, db:
            history = db.execute('SELECT attempt,claimed_at FROM authorization_claims ORDER BY attempt').fetchall()
        self.assertEqual([(1, first['claimed_at']), (2, retry['claimed_at'])], history)
        restarted.ingest(delayed)
        self.assertEqual('APPLIED', restarted.event_status(delayed['event_id'], W)['status'])
        self.assertEqual('PAID', restarted.authorization(first['authorization_id'], W)['state'])

    def test_wrong_billing_amount_period_attempt_or_unclaimed_rejected(self):
        row = self.claimed()
        for value in (889, 888.0, True):
            with self.assertRaises(EntitlementError):
                self.store.ingest(self.outcome(row, amount_minor=value))
        for seq, changes in enumerate(({"period": "2026-10"}, {"attempt": 2}), 1):
            event = self.outcome(row, seq=seq, **changes)
            self.store.ingest(event)
            self.assertEqual("REJECTED", self.store.event_status(event["event_id"], W)["status"])
        self.assertFalse(self.store.entitlement(row["account_id"], A)["access_allowed"])

    def test_clock_future_backwards_and_input_limits(self):
        event = self.event()
        future = sign_fixture_event("fulfillment", "future", event["stream"], 1, self.now+31, "handoff", event["payload"])
        with self.assertRaises(EntitlementError):
            self.store.ingest(future)
        self.store.ingest(event)
        backwards = sign_fixture_event("fulfillment", "backwards", event["stream"], 2, self.now-1,
                                        "suspend", {"device_ref": self.device})
        self.store.ingest(backwards)
        self.assertEqual("REJECTED", self.store.event_status("backwards", F)["status"])
        too_big = deepcopy(event)
        too_big["payload"]["extra"] = "X"*9000
        with self.assertRaises(Capacity):
            self.store.ingest(too_big)
        with self.assertRaises(EntitlementError):
            self.store.register(self.device, "x"*161, A)

    def test_append_only_audit_and_transaction_rollback_on_failure(self):
        account = self.registered()
        with closing(sqlite3.connect(self.root / "backend.sqlite")) as db, db:
            for statement in ("DELETE FROM consents", "DELETE FROM receipts", "DELETE FROM events",
                              "UPDATE events SET envelope='{}'"):
                with self.assertRaises(sqlite3.IntegrityError):
                    db.execute(statement)
            db.execute("CREATE TRIGGER fail_receipt BEFORE INSERT ON receipts BEGIN SELECT RAISE(ABORT,'injected'); END")
        with self.assertRaises(sqlite3.IntegrityError):
            self.store.consent(account, False, TERMS_VERSION, "injected-cancel", A)
        self.assertTrue(self.store.entitlement(account, A)["auto_renew"])

    def test_concurrent_webhook_duplicate_returns_one_receipt(self):
        event = self.event()
        def run(_):
            store = EntitlementStore(self.root / "backend.sqlite", clock=lambda: self.now)
            return store.ingest(event)
        with ThreadPoolExecutor(max_workers=6) as pool:
            receipts = list(pool.map(run, range(6)))
        self.assertTrue(all(receipt == receipts[0] for receipt in receipts))
        with closing(sqlite3.connect(self.root / "backend.sqlite")) as db, db:
            self.assertEqual(1, db.execute("SELECT COUNT(*) FROM events").fetchone()[0])

    def test_record_quota_rejects_without_partial_mutation(self):
        self.store = EntitlementStore(self.root / "backend.sqlite", clock=lambda: self.now, max_records=10)
        account = self.registered(False)
        for n in range(9):
            self.store.consent(account, True, TERMS_VERSION, f"consent-{n}", A)
        with self.assertRaises(Capacity):
            self.store.consent(account, False, TERMS_VERSION, "over-limit", A)
        self.assertTrue(self.store.entitlement(account, A)["auto_renew"])

    def test_real_existing_wallet_replay_recovery_creates_one_888_posting(self):
        row = self.claimed()
        wallet = Wallet(self.root / "wallet.sqlite")
        wallet.consent_monthly(True, row["consent_id"])
        sale = wallet.simulate_sale(3000, "synthetic-sale")
        wallet.settle_sale(sale["id"], "synthetic-settlement")
        bill = wallet.bill(row["period"], row["wallet_idempotency_key"])
        # The backend is deliberately left CLAIMED, as if the process died after
        # the Wallet transaction committed and before the callback was delivered.
        self.store = EntitlementStore(self.root / "backend.sqlite", clock=lambda: self.now)
        replay = Wallet(self.root / "wallet.sqlite").bill(row["period"], row["wallet_idempotency_key"])
        self.assertEqual(bill, replay)
        event = self.outcome(row, wallet_bill_id=bill["id"])
        receipt = self.store.ingest(event)
        self.assertEqual(receipt, self.store.ingest(event))
        snapshot = wallet.snapshot()
        self.assertEqual(888, snapshot["billed_minor"])
        self.assertEqual(1, len(snapshot["bills"]))
        self.assertEqual(0, snapshot["ledger_balance_minor"])
        with closing(sqlite3.connect(self.root / "backend.sqlite")) as db, db:
            names = {row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        self.assertFalse(any("ledger" in name or "posting" in name or "balance" in name for name in names))


if __name__ == "__main__":
    unittest.main()

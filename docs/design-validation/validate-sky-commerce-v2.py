#!/usr/bin/env python3
"""Offline design validation, not a D1 deployment or provider acceptance test."""
from __future__ import annotations

import hashlib
import json
import os
import sqlite3
import subprocess
import tempfile
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
DDL = REPO / "docs/contracts/sky-commerce-v2.sql"
RESULT = Path(os.environ.get("COMMERCE_SQL_RESULT", str(REPO / "work/design-validation/sky-commerce-v2-validation.json"))).resolve()
CHECKED_SOURCE_SHA = subprocess.check_output(
    ["git", "rev-parse", "HEAD"], cwd=REPO, text=True
).strip()
DESIGN_BASELINE_SHA = "b3e2676abd8ae2a0b3f78f48483e067b429d9bc8"
H = "a" * 64
J = "b" * 64
NOW = 100_000
results = []


def check(name, fn):
    try:
        fn()
        results.append({"name": name, "status": "pass"})
    except Exception as error:
        results.append({"name": name, "status": "fail", "error": f"{type(error).__name__}: {error}"})


def reject(db, sql, args=()):
    before = db.total_changes
    try:
        db.execute(sql, args)
    except sqlite3.IntegrityError:
        return
    raise AssertionError(f"Expected database rejection, got {db.total_changes-before} change(s)")


def put(db, table, values):
    columns = ",".join(values)
    marks = ",".join("?" for _ in values)
    db.execute(f"INSERT INTO {table} ({columns}) VALUES ({marks})", tuple(values.values()))


def must_reject_put(db, table, values):
    columns = ",".join(values)
    marks = ",".join("?" for _ in values)
    reject(db, f"INSERT INTO {table} ({columns}) VALUES ({marks})", tuple(values.values()))


def eq(a, b):
    assert a == b, (a, b)


def isolated(db, fn):
    db.execute("SAVEPOINT isolated_check")
    try:
        fn()
    finally:
        db.execute("ROLLBACK TO isolated_check")
        db.execute("RELEASE isolated_check")


def row(db, sql, args=()):
    found = db.execute(sql, args).fetchone()
    return tuple(found) if found else None


def contract(identifier="contract-1", mode="test", **change):
    return dict(id=identifier, package_key="pkg:1", mode=mode, seller_user_id="seller",
                manifest_sha256=H, version=1, contract_sha256=H,
                provider_origin="https://paid.example", audience="paid.example:pkg:1",
                authorization_mode="server_introspection", max_positive_cache_seconds=60,
                status="accepted", acceptance_evidence_ref="fixture:accepted",
                created_at=0, updated_at=0) | change


def quote(identifier="quote-1", **change):
    return dict(id=identifier, mode="test", platform_account_id="acct_platform",
                seller_account_id="acct_seller", buyer_user_id="buyer", seller_user_id="seller",
                package_key="pkg:1", manifest_sha256=H, offer_revision=1,
                currency="jpy", amount_minor=10000, commission_minor=1000,
                contract_id="contract-1", terms_url="https://seller.example/terms",
                terms_content_ref="immutable:terms:v1", terms_sha256=H,
                refund_policy_text="fixture refund terms", refund_policy_sha256=H,
                created_at=0, expires_at=200_000) | change


def legacy_order(db, identifier="order-1", **change):
    put(db, "sky_commerce_orders", dict(id=identifier, buyer_user_id="buyer", seller_user_id="seller",
        mode="test", package_key="pkg:1", manifest_sha256=H, name="Fixture Tool",
        amount_minor=10000, commission_minor=1000, refunded_minor=0, currency="jpy",
        account_id="acct_seller", offer_revision=1, terms_url="https://seller.example/terms",
        refund_policy="fixture refund terms", status="pending", created_at=0, updated_at=0) | change)


def order_state(identifier="order-1", **change):
    return dict(order_id=identifier, mode="test", platform_account_id="acct_platform",
                quote_id="quote-1", entitlement_id="ent-1", accepted_by="buyer", accepted_at=1000,
                currency="jpy", amount_minor=10000, updated_at=1000) | change


def operation(identifier="op-1", **change):
    return dict(id=identifier, order_id="order-1", mode="test", platform_account_id="acct_platform",
                kind="checkout_create", state="prepared", idempotency_key=identifier,
                request_sha256=H, amount_minor=10000, currency="jpy", created_at=1000, updated_at=1000) | change


def refund(identifier="refund-1", **change):
    return dict(id=identifier, order_id="order-1", mode="test", platform_account_id="acct_platform",
                provider_refund_id="re_1", payment_intent_id="pi_1", charge_id="ch_1",
                currency="jpy", amount_minor=1000, status="pending", observed_at=NOW,
                last_observation_id="obs-refund-pending") | change


def inbox(identifier="inbox-1", **change):
    return dict(id=identifier, mode="test", platform_account_id="acct_platform", source_account_id="acct_platform",
                event_id="evt_1", event_type="checkout.session.completed", event_api_version="2026-08-26.dahlia",
                object_id="cs_1", payload_sha256=H, verified_key_id="fixture-key-id",
                event_created_at=50000, received_at=60000, order_id="order-1") | change


def observation(identifier="obs-1", **change):
    return dict(id=identifier, mode="test", platform_account_id="acct_platform", source_account_id="acct_platform",
                object_kind="balance_snapshot", object_id="fixture-balance", provider_request_id=identifier,
                provider_api_version="2026-08-26.dahlia", observed_at=NOW,
                facts_sha256=H, normalized_facts_json='{"available":null}', currency="jpy", amount_minor=None) | change


def refund_observation(db, identifier, status, as_of, failure_transaction=None):
    facts = {"status": status, "failure_balance_transaction": failure_transaction}
    put(db, "sky_commerce_v2_observations", observation(identifier, object_kind="refund", object_id="re_1",
        amount_minor=1000, observed_at=as_of, normalized_facts_json=json.dumps(facts)))


ddl_text = DDL.read_text()
start = ddl_text.index("-- UPDATE sky_commerce_v2_order_state\n", ddl_text.index("-- Concrete batch example"))
end = ddl_text.index("-- IMPORTANT:", start)
batch_text = "\n".join(line.removeprefix("-- ").removeprefix("--") for line in ddl_text[start:end].splitlines())
BATCH = [s.strip() for s in batch_text.split(";") if s.strip()]


def batch(db, **override):
    params = dict(mutation="mut-1", now=NOW, order="order-1", expected_revision=0,
                  entitlement="ent-1", expected_entitlement_revision=0, recovery_epoch=1, fence=1, token="lease-1",
                  effect="effect-1", digest=H, audit="audit-1", actor="fixture-worker", evidence=H,
                  inbox="inbox-1", inbox_token="inbox-lease-1", inbox_fence=1) | override
    nested = db.in_transaction
    db.execute("SAVEPOINT batch_check" if nested else "BEGIN IMMEDIATE")
    try:
        changes = []
        for sql in BATCH:
            changes.append(db.execute(sql, params).rowcount)
        db.execute("RELEASE batch_check" if nested else "COMMIT")
        return changes
    except Exception:
        db.execute("ROLLBACK TO batch_check" if nested else "ROLLBACK")
        if nested:
            db.execute("RELEASE batch_check")
        raise


with tempfile.TemporaryDirectory(prefix="sky-commerce-v2-") as temp:
    db = sqlite3.connect(Path(temp) / "design-validation.sqlite", isolation_level=None)
    db.execute("PRAGMA foreign_keys=ON")
    migrations = sorted(path for path in (REPO / "drizzle").glob("*.sql") if not path.name.startswith("._"))
    migration_contents = {path: path.read_bytes() for path in migrations}
    migration_journal = REPO / "drizzle/meta/_journal.json"
    journal_contents = migration_journal.read_bytes()
    journal_names = sorted(f"{entry['tag']}.sql" for entry in json.loads(journal_contents)["entries"])
    check("complete_sorted_migration_inventory_matches_journal", lambda: eq(
        [path.name for path in migrations], journal_names))
    check("required_legacy_commerce_migration_is_present", lambda: eq(
        "0018_sky_commerce.sql" in journal_names and
        "0018_sky_commerce.sql" in [path.name for path in migrations], True))
    for migration in migrations:
        db.executescript(migration_contents[migration].decode("utf-8"))
    base_tables = ["sky_commerce_sellers", "sky_commerce_offers", "sky_commerce_orders", "sky_commerce_events"]
    before_schema = {name: row(db, "SELECT sql FROM sqlite_master WHERE type='table' AND name=?", (name,))[0] for name in base_tables}
    db.executescript(ddl_text)
    check("foreign_keys_enabled", lambda: eq(row(db, "PRAGMA foreign_keys"), (1,)))
    check("existing_four_table_schemas_unchanged", lambda: eq(before_schema,
        {name: row(db, "SELECT sql FROM sqlite_master WHERE type='table' AND name=?", (name,))[0] for name in base_tables}))
    check("exactly_fourteen_sidecar_tables", lambda: eq(row(db,
        "SELECT count(*) FROM sqlite_master WHERE type='table' AND name LIKE 'sky_commerce_v2_%'"), (14,)))

    put(db, "sky_commerce_v2_access_contracts", contract())
    put(db, "sky_commerce_v2_subject_links", dict(id="link-1", contract_id="contract-1", mode="test",
        package_key="pkg:1", buyer_user_id="buyer", provider_subject="opaque-provider-subject",
        binding_evidence_ref="fixture:link", state="active", created_at=0, updated_at=0))
    legacy_order(db)
    put(db, "sky_commerce_v2_entitlements", dict(id="ent-1", mode="test", buyer_user_id="buyer", package_key="pkg:1",
        contract_id="contract-1", subject_link_id="link-1", updated_at=0))
    put(db, "sky_commerce_v2_quotes", quote())
    put(db, "sky_commerce_v2_order_state", order_state())
    put(db, "sky_commerce_v2_operations", operation())
    put(db, "sky_commerce_v2_inbox", inbox())

    put(db, "sky_commerce_sellers", dict(id="seller-row",user_id="seller-reserved",mode="test",created_at=0))
    seller_op = dict(id="account-op",seller_id="seller-row",seller_user_id="seller-reserved",mode="test",
        platform_account_id="acct_platform",idempotency_key="seller-account-op",request_sha256=H,created_at=0,updated_at=0)
    put(db, "sky_commerce_v2_seller_account_operations", seller_op)
    check("account_creation_has_one_seller_reservation", lambda: must_reject_put(db,
        "sky_commerce_v2_seller_account_operations", seller_op | {"id":"second-account-op","idempotency_key":"second-key"}))
    check("account_creation_mode_must_match_seller", lambda: must_reject_put(db,
        "sky_commerce_v2_seller_account_operations", seller_op | {"id":"live-account-op","mode":"live"}))
    check("account_creation_request_is_immutable", lambda: reject(db,
        "UPDATE sky_commerce_v2_seller_account_operations SET request_sha256=? WHERE id='account-op'", (J,)))
    check("account_creation_reservation_cannot_be_deleted", lambda: reject(db,
        "DELETE FROM sky_commerce_v2_seller_account_operations WHERE id='account-op'"))
    db.execute("UPDATE sky_commerce_v2_seller_account_operations SET lease_fence=1,lease_token='account-lease',lease_expires_at=150000 WHERE id='account-op'")
    check("account_creation_stale_fence_cas_is_noop", lambda: eq(db.execute(
        "UPDATE sky_commerce_v2_seller_account_operations SET state='submitting',revision=1,last_mutation_id='account-submit',first_submitted_at=1000,retry_deadline=72001000 WHERE id='account-op' AND revision=0 AND lease_fence=0 AND lease_token='stale' AND lease_expires_at>?", (NOW,)).rowcount,0))
    db.execute("UPDATE sky_commerce_v2_seller_account_operations SET state='unknown',revision=1,last_mutation_id='account-unknown',first_submitted_at=1000,retry_deadline=72001000 WHERE id='account-op'")
    check("unknown_account_creation_deadline_cannot_reset", lambda: reject(db,
        "UPDATE sky_commerce_v2_seller_account_operations SET first_submitted_at=2000,retry_deadline=72002000 WHERE id='account-op'"))
    check("arbitrary_account_adoption_rejected", lambda: reject(db,
        "UPDATE sky_commerce_v2_seller_account_operations SET state='acknowledged',provider_account_id='acct_arbitrary',revision=2,last_mutation_id='account-adopt' WHERE id='account-op'"))
    put(db, "sky_commerce_v2_observations", observation("obs-account",object_kind="account",object_id="acct_new",
        amount_minor=None,currency=None,normalized_facts_json=json.dumps({"sky_operation_id":"account-op","sky_seller_user_id":"seller-reserved"})))
    db.execute("UPDATE sky_commerce_v2_seller_account_operations SET state='acknowledged',provider_account_id='acct_new',last_observation_id='obs-account',revision=2,last_mutation_id='account-adopt' WHERE id='account-op' AND revision=1 AND lease_fence=1 AND lease_token='account-lease'")
    check("account_creation_adopts_authenticated_matching_observation", lambda: eq(row(db,
        "SELECT state,provider_account_id,revision FROM sky_commerce_v2_seller_account_operations WHERE id='account-op'"), ("acknowledged","acct_new",2)))
    check("account_creation_cannot_adopt_second_account", lambda: reject(db,
        "UPDATE sky_commerce_v2_seller_account_operations SET provider_account_id='acct_second',revision=3,last_mutation_id='second-adopt' WHERE id='account-op'"))

    check("reject_duplicate_quote_id", lambda: must_reject_put(db, "sky_commerce_v2_quotes", quote()))
    check("quote_terms_are_immutable", lambda: reject(db, "UPDATE sky_commerce_v2_quotes SET terms_content_ref='different' WHERE id='quote-1'"))
    check("quote_delete_is_rejected", lambda: reject(db, "DELETE FROM sky_commerce_v2_quotes WHERE id='quote-1'"))
    check("reject_mixed_mode_contract_quote", lambda: must_reject_put(db, "sky_commerce_v2_quotes", quote("quote-live", mode="live")))
    check("reject_mixed_manifest_contract_quote", lambda: must_reject_put(db, "sky_commerce_v2_quotes", quote("quote-manifest", manifest_sha256=J)))
    check("reject_fractional_money", lambda: must_reject_put(db, "sky_commerce_v2_quotes", quote("quote-fraction", amount_minor=50.5, commission_minor=5)))
    check("reject_negative_money", lambda: must_reject_put(db, "sky_commerce_v2_quotes", quote("quote-negative", amount_minor=-1, commission_minor=0)))
    check("reject_wrong_commission", lambda: must_reject_put(db, "sky_commerce_v2_quotes", quote("quote-fee", commission_minor=999)))
    check("reject_non_jpy_purchase", lambda: must_reject_put(db, "sky_commerce_v2_quotes", quote("quote-usd", currency="usd")))
    check("reject_invalid_hash", lambda: must_reject_put(db, "sky_commerce_v2_quotes", quote("quote-hash", terms_sha256="z"*64)))
    check("contract_identity_cannot_change_in_place", lambda: reject(db, "UPDATE sky_commerce_v2_access_contracts SET audience='attacker' WHERE id='contract-1'"))
    check("subject_link_cannot_be_reassigned", lambda: reject(db, "UPDATE sky_commerce_v2_subject_links SET provider_subject='other' WHERE id='link-1'"))
    check("duplicate_entitlement_aggregate_rejected", lambda: must_reject_put(db, "sky_commerce_v2_entitlements",
        dict(id="ent-other", mode="test", buyer_user_id="buyer", package_key="pkg:1", contract_id="contract-1", updated_at=0)))
    check("entitlement_aggregate_delete_rejected", lambda: reject(db, "DELETE FROM sky_commerce_v2_entitlements WHERE id='ent-1'"))
    check("entitlement_revision_reset_rejected", lambda: reject(db, "UPDATE sky_commerce_v2_entitlements SET revision=0,last_mutation_id='reset' WHERE id='ent-1'"))
    check("operation_idempotency_collision_rejected", lambda: must_reject_put(db, "sky_commerce_v2_operations", operation("op-duplicate", idempotency_key="op-1")))
    check("operation_request_digest_immutable", lambda: reject(db, "UPDATE sky_commerce_v2_operations SET request_sha256=? WHERE id='op-1'", (J,)))
    check("operation_wrong_account_rejected", lambda: must_reject_put(db, "sky_commerce_v2_operations", operation("op-wrong-account", platform_account_id="acct_other")))
    check("operation_wrong_mode_rejected", lambda: must_reject_put(db, "sky_commerce_v2_operations", operation("op-wrong-mode", mode="live")))
    check("checkout_amount_must_equal_order", lambda: must_reject_put(db, "sky_commerce_v2_operations", operation("op-short", amount_minor=9999)))
    db.execute("UPDATE sky_commerce_v2_operations SET state='unknown',first_submitted_at=2000,retry_deadline=72002000,updated_at=2000 WHERE id='op-1'")
    check("unknown_operation_keeps_original_deadline", lambda: reject(db, "UPDATE sky_commerce_v2_operations SET first_submitted_at=3000,retry_deadline=72003000,updated_at=3000 WHERE id='op-1'"))
    check("unknown_requires_submission_time", lambda: must_reject_put(db, "sky_commerce_v2_operations", operation("op-invalid-unknown", state="unknown")))
    check("over_20h_retry_deadline_rejected", lambda: must_reject_put(db, "sky_commerce_v2_operations",
        operation("op-late", state="unknown", first_submitted_at=2000, retry_deadline=72002001)))
    put(db, "sky_commerce_v2_operations", operation("refund-op", kind="refund_create", amount_minor=1000))
    refund_observation(db, "obs-refund-pending", "pending", NOW)
    put(db, "sky_commerce_v2_refunds", refund(operation_id="refund-op"))
    check("refund_provider_id_duplicate_rejected", lambda: must_reject_put(db, "sky_commerce_v2_refunds", refund("refund-duplicate")))
    check("refund_has_independent_pending_state", lambda: eq(row(db, "SELECT status FROM sky_commerce_v2_refunds WHERE id='refund-1'"), ("pending",)))
    refund_observation(db, "obs-refund-failed", "failed", NOW+1)
    db.execute("UPDATE sky_commerce_v2_refunds SET status='failed',failure_code='fixture_failure',last_observation_id='obs-refund-failed',observed_at=? WHERE id='refund-1'", (NOW+1,))
    check("refund_failed_state_kept_without_recharge", lambda: eq(row(db,
        "SELECT status,(SELECT count(*) FROM sky_commerce_v2_operations) FROM sky_commerce_v2_refunds WHERE id='refund-1'"), ("failed",2)))
    check("refund_wrong_operation_kind_rejected", lambda: must_reject_put(db, "sky_commerce_v2_refunds",
        refund("refund-wrong-op", provider_refund_id="re_wrong", operation_id="op-1", amount_minor=10000)))
    check("refund_amount_above_order_rejected", lambda: must_reject_put(db, "sky_commerce_v2_refunds", refund("refund-over", provider_refund_id="re_over", amount_minor=10001)))
    check("refund_amount_immutable", lambda: reject(db, "UPDATE sky_commerce_v2_refunds SET amount_minor=999 WHERE id='refund-1'"))
    check("unreviewed_refund_overallocation_is_rejected", lambda: reject(db,
        "UPDATE sky_commerce_v2_order_state SET refund_reserved_minor=10001,revision=1,last_mutation_id='over' WHERE order_id='order-1'"))
    check("payment_closure_without_evidence_is_rejected", lambda: reject(db,
        "UPDATE sky_commerce_v2_order_state SET payment_closure_reason='expired',revision=1,last_mutation_id='clock-expired' WHERE order_id='order-1'"))
    def closure_evidence():
        db.execute("UPDATE sky_commerce_v2_operations SET provider_object_id='cs_1' WHERE id='op-1'")
        put(db, "sky_commerce_v2_observations", observation("obs-expired",object_kind="checkout_session",object_id="cs_1",amount_minor=10000,
            normalized_facts_json='{"status":"expired"}'))
        db.execute("UPDATE sky_commerce_v2_order_state SET payment_closure_reason='expired',payment_closure_observation_id='obs-expired',revision=1,last_mutation_id='provider-expired' WHERE order_id='order-1'")
        eq(row(db,"SELECT payment_state,payment_closure_reason FROM sky_commerce_v2_order_state WHERE order_id='order-1'"),("unpaid","expired"))
    check("verified_expired_session_preserves_unpaid_payment_fact", lambda: isolated(db, closure_evidence))
    check("duplicate_event_id_rejected", lambda: must_reject_put(db, "sky_commerce_v2_inbox", inbox("inbox-duplicate")))
    check("event_payload_hash_cannot_change", lambda: reject(db, "UPDATE sky_commerce_v2_inbox SET payload_sha256=? WHERE id='inbox-1'", (J,)))
    check("event_cannot_bind_different_mode_order", lambda: must_reject_put(db, "sky_commerce_v2_inbox", inbox("inbox-live", mode="live")))

    put(db, "sky_commerce_v2_account_state", dict(id="wallet-account",mode="test",platform_account_id="acct_platform",
        source_account_id="acct_seller",currency="jpy",evidence_kind="balance",updated_at=0))
    db.execute("UPDATE sky_commerce_v2_account_state SET lease_fence=1,lease_token='wallet-lease',lease_expires_at=150000 WHERE id='wallet-account'")
    put(db, "sky_commerce_v2_observations", observation("obs-wallet-cursor",source_account_id="acct_seller",
        object_id="acct_seller:balance",amount_minor=-100,account_expected_revision=0,account_lease_fence=1,
        account_evidence_kind="balance",normalized_facts_json='{"available":-100}'))
    check("wallet_account_scope_stale_lease_is_noop", lambda: eq(db.execute(
        "UPDATE sky_commerce_v2_account_state SET revision=1,last_observation_id='obs-wallet-cursor',last_mutation_id='wallet-accept' WHERE id='wallet-account' AND revision=0 AND lease_fence=0 AND lease_token='old' AND lease_expires_at>?", (NOW,)).rowcount,0))
    eq(db.execute("UPDATE sky_commerce_v2_account_state SET revision=1,last_observation_id='obs-wallet-cursor',last_mutation_id='wallet-accept' WHERE id='wallet-account' AND revision=0 AND lease_fence=1 AND lease_token='wallet-lease' AND lease_expires_at>?", (NOW,)).rowcount,1)
    check("wallet_account_observation_accepted_without_order", lambda: eq(row(db,
        "SELECT a.revision,p.amount_minor,p.account_evidence_kind FROM sky_commerce_v2_account_state a JOIN sky_commerce_v2_observations p ON p.id=a.last_observation_id WHERE a.id='wallet-account'"),(1,-100,"balance")))
    put(db, "sky_commerce_v2_observations", observation("obs-wrong-wallet",source_account_id="acct_other",amount_minor=100,
        account_expected_revision=1,account_lease_fence=1,account_evidence_kind="balance"))
    check("wallet_account_cannot_accept_other_accounts_balance", lambda: reject(db,
        "UPDATE sky_commerce_v2_account_state SET revision=2,last_observation_id='obs-wrong-wallet',last_mutation_id='wallet-wrong' WHERE id='wallet-account'"))
    check("wallet_account_evidence_cannot_be_replayed_at_new_revision", lambda: reject(db,
        "UPDATE sky_commerce_v2_account_state SET revision=2,last_observation_id='obs-wallet-cursor',last_mutation_id='wallet-replay' WHERE id='wallet-account'"))

    put(db, "sky_commerce_v2_observations", observation())
    put(db, "sky_commerce_v2_observations", observation("obs-negative", amount_minor=-500, normalized_facts_json='{"available":-500}'))
    put(db, "sky_commerce_v2_observations", observation("obs-zero", amount_minor=0, normalized_facts_json='{"available":0}'))
    check("wallet_unknown_zero_negative_are_distinct", lambda: eq([tuple(r) for r in db.execute(
        "SELECT id,amount_minor FROM sky_commerce_v2_observations WHERE id IN ('obs-1','obs-negative','obs-zero') ORDER BY id")], [("obs-1",None),("obs-negative",-500),("obs-zero",0)]))
    check("observation_is_immutable", lambda: reject(db, "UPDATE sky_commerce_v2_observations SET amount_minor=1 WHERE id='obs-1'"))
    check("observation_cannot_be_deleted", lambda: reject(db, "DELETE FROM sky_commerce_v2_observations WHERE id='obs-1'"))
    check("unsafe_integer_balance_rejected", lambda: must_reject_put(db, "sky_commerce_v2_observations", observation("obs-big", amount_minor=9007199254740992)))
    check("negative_charge_rejected", lambda: must_reject_put(db, "sky_commerce_v2_observations", observation("obs-charge", object_kind="charge", amount_minor=-1)))
    check("observation_json_must_parse", lambda: must_reject_put(db, "sky_commerce_v2_observations", observation("obs-json", normalized_facts_json="{")))

    nonce = dict(issuer="bff", audience="commerce", mode="test", nonce="n"*32,
                 subject="buyer", request_sha256=H, issued_at=90000, expires_at=120000)
    put(db, "sky_commerce_v2_nonces", nonce)
    check("nonce_unique_per_issuer_audience_mode", lambda: must_reject_put(db, "sky_commerce_v2_nonces", nonce))
    check("nonce_expiry_not_extendable", lambda: reject(db, "UPDATE sky_commerce_v2_nonces SET expires_at=130000"))
    eq(db.execute("UPDATE sky_commerce_v2_nonces SET consumed_at=? WHERE nonce=? AND consumed_at IS NULL AND expires_at>=?", (NOW,"n"*32,NOW)).rowcount,1)
    check("nonce_cas_second_consume_is_noop", lambda: eq(db.execute(
        "UPDATE sky_commerce_v2_nonces SET consumed_at=? WHERE nonce=? AND consumed_at IS NULL AND expires_at>=?", (NOW,"n"*32,NOW)).rowcount,0))
    check("consumed_nonce_cannot_be_reset", lambda: reject(db, "UPDATE sky_commerce_v2_nonces SET consumed_at=NULL"))

    db.execute("UPDATE sky_commerce_v2_order_state SET lease_fence=1,lease_token='lease-1',lease_expires_at=150000 WHERE order_id='order-1'")
    db.execute("UPDATE sky_commerce_v2_inbox SET state='processing',lease_fence=1,lease_token='inbox-lease-1',lease_expires_at=150000 WHERE id='inbox-1'")
    check("concrete_sql_example_has_five_statements", lambda: eq(len(BATCH),5))
    check("stale_lease_cas_is_all_effect_noop", lambda: eq(batch(db, token="old-token", fence=0), [0,0,0,0,0]))
    check("expired_lease_cas_is_all_effect_noop", lambda: eq(batch(db, now=150001), [0,0,0,0,0]))
    check("entitlement_conflict_gates_first_cas", lambda: eq(batch(db, expected_entitlement_revision=99), [0,0,0,0,0]))
    check("stale_recovery_epoch_gates_first_cas", lambda: eq(batch(db, recovery_epoch=2), [0,0,0,0,0]))
    check("order_domain_rejects_raw_provider_status", lambda: reject(db,
        "UPDATE sky_commerce_v2_order_state SET payment_state='requires_action',revision=1,last_mutation_id='raw-status' WHERE order_id='order-1'"))
    check("order_domain_rejects_unknown_payment_fact", lambda: reject(db,
        "UPDATE sky_commerce_v2_order_state SET payment_state='unknown',revision=1,last_mutation_id='unknown-status' WHERE order_id='order-1'"))
    check("no_audit_or_outbox_after_noop", lambda: eq(row(db,
        "SELECT (SELECT count(*) FROM sky_commerce_v2_audit),(SELECT count(*) FROM sky_commerce_v2_outbox),(SELECT revision FROM sky_commerce_v2_order_state WHERE order_id='order-1')"), (0,0,0)))

    def rollback_later_failure():
        try:
            batch(db, digest="invalid")
        except sqlite3.IntegrityError:
            pass
        else:
            raise AssertionError("Expected late outbox CHECK failure")
        eq(row(db, "SELECT revision,payment_state FROM sky_commerce_v2_order_state WHERE order_id='order-1'"), (0,"unpaid"))
        eq(row(db, "SELECT revision,state FROM sky_commerce_v2_entitlements WHERE id='ent-1'"), (0,"inactive"))
        eq(row(db, "SELECT count(*) FROM sky_commerce_v2_outbox"), (0,))
    check("late_statement_error_rolls_back_both_aggregates", rollback_later_failure)
    check("matching_fence_and_revision_commit_all_effects", lambda: eq(batch(db), [1,1,1,1,1]))
    check("state_audit_outbox_and_inbox_agree", lambda: eq(row(db,
        "SELECT s.revision,e.revision,i.state,(SELECT count(*) FROM sky_commerce_v2_audit),(SELECT count(*) FROM sky_commerce_v2_outbox) FROM sky_commerce_v2_order_state s JOIN sky_commerce_v2_entitlements e ON e.id=s.entitlement_id JOIN sky_commerce_v2_inbox i ON i.order_id=s.order_id WHERE s.order_id='order-1'"), (1,1,"processed",1,1)))
    check("different_late_mutation_noops_after_commit", lambda: eq(batch(db, mutation="mut-late", effect="effect-late", audit="audit-late"), [0,0,0,0,0]))
    check("audit_without_accepted_cas_is_rejected", lambda: must_reject_put(db, "sky_commerce_v2_audit", dict(
        id="audit-forged",order_id="order-1",mode="test",platform_account_id="acct_platform",revision=2,expected_revision=1,mutation_id="forged",
        actor_kind="system",actor_ref="fixture",action="not-accepted",evidence_sha256=H,created_at=NOW)))
    check("accepted_audit_is_append_only", lambda: reject(db, "UPDATE sky_commerce_v2_audit SET action='changed' WHERE id='audit-1'"))
    check("lease_fence_cannot_move_backwards", lambda: reject(db, "UPDATE sky_commerce_v2_order_state SET lease_fence=0 WHERE order_id='order-1'"))
    check("new_lease_token_requires_new_fence", lambda: reject(db, "UPDATE sky_commerce_v2_order_state SET lease_token='other-token' WHERE order_id='order-1'"))

    def external_refund_overlaps_unknown_reservation():
        db.execute("UPDATE sky_commerce_v2_order_state SET refund_reserved_minor=10000,refund_state='unknown',access_state='suspended',reconciliation_state='unknown',revision=2,last_mutation_id='unknown-reservation' WHERE order_id='order-1'")
        db.execute("UPDATE sky_commerce_v2_order_state SET refund_succeeded_minor=5000,refund_state='partially_refunded',reconciliation_state='needs_review',revision=3,last_mutation_id='external-success' WHERE order_id='order-1'")
        eq(row(db,"SELECT refund_succeeded_minor,refund_reserved_minor,reconciliation_state,access_state FROM sky_commerce_v2_order_state WHERE order_id='order-1'"),(5000,10000,"needs_review","suspended"))
        eq(db.execute("UPDATE sky_commerce_v2_order_state SET refund_reserved_minor=refund_reserved_minor+100,revision=4,last_mutation_id='extra-refund' WHERE order_id='order-1' AND revision=3 AND reconciliation_state='current' AND refund_succeeded_minor+refund_reserved_minor+100<=amount_minor").rowcount,0)
        eq(batch(db,expected_revision=3,expected_entitlement_revision=1),[0,0,0,0,0])
    check("external_success_is_preserved_alongside_unknown_overlapping_reservation", lambda: isolated(db, external_refund_overlaps_unknown_reservation))

    def no_subject_still_owns_purchase():
        db.execute("UPDATE sky_commerce_v2_entitlements SET subject_link_id=NULL,state='active',revision=2,last_mutation_id='unlinked-owner' WHERE id='ent-1'")
        eq(row(db, "SELECT state,subject_link_id FROM sky_commerce_v2_entitlements WHERE id='ent-1'"), ("active",None))
    check("paid_ownership_does_not_require_buyer_oauth", lambda: isolated(db, no_subject_still_owns_purchase))

    def old_subject_ack():
        db.execute("UPDATE sky_commerce_v2_subject_links SET state='revoked',revision=2 WHERE id='link-1'")
        reject(db, "UPDATE sky_commerce_v2_outbox SET state='acknowledged',provider_ack_ref='old-link-ack' WHERE id='effect-1'")
    check("revoked_subject_link_rejects_old_grant_ack", lambda: isolated(db, old_subject_ack))
    check("subject_state_change_requires_revision", lambda: reject(db,
        "UPDATE sky_commerce_v2_subject_links SET state='revoked' WHERE id='link-1'"))

    def epoch_cannot_roll_back():
        db.execute("UPDATE sky_commerce_v2_entitlements SET recovery_epoch=2,revision=2,last_mutation_id='epoch-advance' WHERE id='ent-1'")
        reject(db, "UPDATE sky_commerce_v2_entitlements SET recovery_epoch=1,revision=3,last_mutation_id='epoch-rollback' WHERE id='ent-1'")
    check("recovery_epoch_cannot_decrease_in_current_database", lambda: isolated(db, epoch_cannot_roll_back))

    check("refund_case_closure_does_not_restore_without_decision", lambda: reject(db,
        "UPDATE sky_commerce_v2_order_state SET refund_state='failed',refund_case_state='resolved',access_state='active',revision=2,last_mutation_id='bad-restore' WHERE order_id='order-1'"))
    check("keep_revoked_disposition_blocks_grant_cas", lambda: isolated(db, lambda: (
        db.execute("UPDATE sky_commerce_v2_order_state SET refund_state='failed',refund_case_state='resolved',refund_entitlement_disposition='keep_revoked',access_state='revoked',revision=2,last_mutation_id='keep-revoked' WHERE order_id='order-1'"),
        eq(batch(db,expected_revision=2,expected_entitlement_revision=1),[0,0,0,0,0]))))
    def explicit_restore_allowed():
        db.execute("UPDATE sky_commerce_v2_order_state SET refund_state='canceled',refund_case_state='withdrawn',refund_entitlement_disposition='restore',access_state='revoked',revision=2,last_mutation_id='restore-decision' WHERE order_id='order-1'")
        eq(batch(db,expected_revision=2,expected_entitlement_revision=1,mutation="mut-restore",effect="effect-restore",audit="audit-restore",inbox="absent"), [1,1,1,1,0])
        eq(row(db,"SELECT action FROM sky_commerce_v2_outbox WHERE id='effect-restore'"),("grant",))
    check("withdrawn_canceled_refund_with_explicit_restore_can_grant", lambda: isolated(db, explicit_restore_allowed))

    # Repurchase is a new order, but retains the same entitlement aggregate and increasing revision.
    db.execute("UPDATE sky_commerce_v2_order_state SET refund_state='succeeded',refund_succeeded_minor=10000,access_state='revoked',revision=2,last_mutation_id='refund-transition' WHERE order_id='order-1'")
    db.execute("UPDATE sky_commerce_v2_entitlements SET state='revoked',revision=2,last_mutation_id='refund-transition' WHERE id='ent-1'")
    legacy_order(db, "order-2")
    put(db, "sky_commerce_v2_quotes", quote("quote-2"))
    put(db, "sky_commerce_v2_order_state", order_state("order-2",quote_id="quote-2"))
    db.execute("UPDATE sky_commerce_v2_entitlements SET state='pending',current_order_id='order-2',revision=3,last_mutation_id='repurchase-transition' WHERE id='ent-1'")
    check("repurchase_keeps_aggregate_and_monotonic_revision", lambda: eq(row(db,
        "SELECT id,current_order_id,revision,(SELECT count(*) FROM sky_commerce_v2_entitlements) FROM sky_commerce_v2_entitlements WHERE id='ent-1'"), ("ent-1","order-2",3,1)))
    check("old_grant_ack_after_repurchase_is_rejected", lambda: reject(db,
        "UPDATE sky_commerce_v2_outbox SET state='acknowledged',provider_ack_ref='fixture-old-ack' WHERE id='effect-1'"))
    check("old_refund_does_not_rewrite_new_order", lambda: eq(row(db,
        "SELECT payment_state,refund_state FROM sky_commerce_v2_order_state WHERE order_id='order-2'"), ("unpaid","none")))
    refund_observation(db, "obs-refund-success", "succeeded", NOW+2)
    db.execute("UPDATE sky_commerce_v2_refunds SET status='succeeded',last_observation_id='obs-refund-success',observed_at=? WHERE id='refund-1'", (NOW+2,))
    check("refund_correction_requires_new_provider_evidence", lambda: reject(db,
        "UPDATE sky_commerce_v2_refunds SET status='failed' WHERE id='refund-1'"))
    refund_observation(db, "obs-refund-return", "failed", NOW+3, "txn_fixture_return")
    db.execute("UPDATE sky_commerce_v2_refunds SET status='failed',failure_code='fixture_bank_return',failure_balance_transaction_id='txn_fixture_return',last_observation_id='obs-refund-return',observed_at=? WHERE id='refund-1'", (NOW+3,))
    check("stale_refund_observation_cannot_replace_newer", lambda: reject(db,
        "UPDATE sky_commerce_v2_refunds SET status='pending',observed_at=?,last_observation_id='obs-refund-pending',failure_balance_transaction_id=NULL WHERE id='refund-1'", (NOW,)))
    db.execute("UPDATE sky_commerce_v2_order_state SET refund_state='failed',refund_case_state='open',refund_succeeded_minor=0,revision=3,last_mutation_id='refund-return-transition' WHERE order_id='order-1'")
    check("refund_success_can_be_corrected_to_failed", lambda: eq(row(db,
        "SELECT s.refund_state,s.refund_case_state,s.refund_succeeded_minor,r.status FROM sky_commerce_v2_order_state s JOIN sky_commerce_v2_refunds r ON r.order_id=s.order_id WHERE s.order_id='order-1'"), ("failed","open",0,"failed")))
    check("old_refund_failure_preserves_repurchase_rights", lambda: eq(row(db,
        "SELECT current_order_id,revision,state FROM sky_commerce_v2_entitlements WHERE id='ent-1'"), ("order-2",3,"pending")))
    check("unresolved_refund_obligation_cannot_reactivate", lambda: reject(db,
        "UPDATE sky_commerce_v2_order_state SET access_state='active',revision=4,last_mutation_id='bad-reactivate' WHERE order_id='order-1'"))
    check("old_order_cannot_replace_current_pending_entitlement", lambda: reject(db,
        "UPDATE sky_commerce_v2_entitlements SET current_order_id='order-1',revision=4,last_mutation_id='old-order-grant' WHERE id='ent-1'"))
    legacy_order(db, "order-legacy",payment_intent_id="pi_legacy")
    put(db, "sky_commerce_v2_order_state", order_state("order-legacy",acceptance_kind="legacy_import",quote_id=None,
        accepted_by=None,accepted_at=None,legacy_import_evidence_ref="immutable:historical-order:terms-unknown"))
    check("legacy_import_does_not_fabricate_quote_or_acceptance", lambda: eq(row(db,
        "SELECT acceptance_kind,quote_id,accepted_by,accepted_at,payment_state,access_state FROM sky_commerce_v2_order_state WHERE order_id='order-legacy'"),
        ("legacy_import",None,None,None,"unpaid","pending")))
    check("legacy_import_cannot_promote_without_provider_evidence", lambda: reject(db,
        "UPDATE sky_commerce_v2_order_state SET payment_state='paid',access_state='active',revision=1,last_mutation_id='legacy-unverified' WHERE order_id='order-legacy'"))
    check("new_quote_order_cannot_use_null_quote_bypass", lambda: must_reject_put(db,"sky_commerce_v2_order_state",
        order_state("order-2",quote_id=None)))
    check("legacy_import_requires_historical_evidence_ref", lambda: must_reject_put(db,"sky_commerce_v2_order_state",
        order_state("order-2",acceptance_kind="legacy_import",quote_id=None,accepted_by=None,accepted_at=None)))
    check("paid_access_contract_only_allows_server_introspection", lambda: must_reject_put(db,"sky_commerce_v2_access_contracts",
        contract("contract-token",version=2,authorization_mode="short_lived_token")))
    check("paid_access_positive_cache_is_fixed_at_60_seconds", lambda: must_reject_put(db,"sky_commerce_v2_access_contracts",
        contract("contract-long-cache",version=2,max_positive_cache_seconds=300)))
    check("database_foreign_key_check_clean", lambda: eq(list(db.execute("PRAGMA foreign_key_check")), []))
    check("database_integrity_check_clean", lambda: eq(row(db, "PRAGMA integrity_check"), ("ok",)))
    db.close()

payload = {
    "checked_at": datetime.now(timezone.utc).isoformat(),
    "client_design_date": "2026-10-01",
    "evidence_level": "host_sqlite_design_validation_only",
    "repository_baseline": CHECKED_SOURCE_SHA,
    "original_design_baseline": DESIGN_BASELINE_SHA,
    "source_scope": "checked-out worktree; HEAD identifies ancestry and input hashes identify tested contents",
    "ddl": DDL.relative_to(REPO).as_posix(),
    "ddl_sha256": hashlib.sha256(DDL.read_bytes()).hexdigest(),
    "validator_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
    "sqlite_version": sqlite3.sqlite_version,
    "existing_migrations": [p.name for p in migrations],
    "migration_sha256": {p.relative_to(REPO).as_posix(): hashlib.sha256(migration_contents[p]).hexdigest() for p in migrations},
    "migration_journal": migration_journal.relative_to(REPO).as_posix(),
    "migration_journal_sha256": hashlib.sha256(journal_contents).hexdigest(),
    "counts": {"total":len(results), "pass":sum(r["status"]=="pass" for r in results), "fail":sum(r["status"]=="fail" for r in results)},
    "checks": results,
    "not_executed": ["Cloudflare D1 deployment/runtime", "Stripe sandbox", "live payment", "actual identity gateway", "external MCP authorization", "bank payout"],
}
RESULT.parent.mkdir(parents=True, exist_ok=True)
RESULT.write_text(json.dumps(payload, ensure_ascii=False, indent=2)+"\n")
print(json.dumps({"result":str(RESULT), **payload["counts"], "failures":[r for r in results if r["status"]!="pass"]}, ensure_ascii=False))
raise SystemExit(1 if payload["counts"]["fail"] else 0)

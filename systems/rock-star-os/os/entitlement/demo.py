"""Repeatable local fixture handoff and optional explicitly consented test billing."""
import argparse
import json
from pathlib import Path

from blackberryrock.wallet import Wallet
from .protocol import PUBLIC_TOKENS, TERMS_VERSION, sign_fixture_event
from .store import EntitlementStore
from .wallet_bridge import WalletBridge

FIXTURE_NOW = 1788858000  # 2026-09-08 09:00:00 UTC; simulated clock, not current time.


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--state", type=Path, required=True, help="dedicated new fixture state directory")
    parser.add_argument("--accept-fixture-monthly-terms", action="store_true",
                        help="explicitly simulate owner acceptance of USD 8.88 recurring terms")
    parser.add_argument("--simulate-settled-credit-minor", type=int, default=0,
                        help="synthetic test credit only, integer cents; no real revenue")
    args = parser.parse_args()
    if not 0 <= args.simulate_settled_credit_minor <= 100000:
        parser.error("synthetic credit must be between 0 and 100000 cents")
    store = EntitlementStore(args.state / "entitlement.sqlite", clock=lambda: FIXTURE_NOW)
    handoff = sign_fixture_event("fulfillment", "fixture-demo-handoff", "device:fixture-demo-device", 1,
        FIXTURE_NOW, "handoff", {"device_ref": "fixture-demo-device", "owner_ref": "fixture-owner-alice",
        "purchase_ref": "fixture-demo-purchase", "verification_ref": "fixture-demo-verification",
        "verified_at": FIXTURE_NOW, "valid_until": FIXTURE_NOW+90*86400})
    store.ingest(handoff)
    account = store.register("fixture-demo-device", "demo-register", PUBLIC_TOKENS["alice"])["account_id"]
    result = {"simulation_only": True, "clock": "fixed 2026-09-08 09:00 UTC",
              "actual_purchase_identity_payment_providers": "NOT RUN", "billing": "NOT REQUESTED"}
    if args.accept_fixture_monthly_terms:
        store.consent(account, True, TERMS_VERSION, "demo-explicit-consent", PUBLIC_TOKENS["alice"])
        wallet = Wallet(args.state / "wallet.sqlite")
        if args.simulate_settled_credit_minor:
            credit = wallet.simulate_sale(args.simulate_settled_credit_minor, "demo-synthetic-credit")
            wallet.settle_sale(credit["id"], "demo-synthetic-settlement")
        row = store.authorize_month(account, "2026-09", "demo-authorize", PUBLIC_TOKENS["wallet"])
        row = store.claim_authorization(row["authorization_id"], "demo-claim", PUBLIC_TOKENS["wallet"])
        result["billing"] = WalletBridge(store, wallet, account, PUBLIC_TOKENS["wallet"]).execute(
            row["authorization_id"], "demo-execute", PUBLIC_TOKENS["wallet"])
        result["synthetic_wallet_billed_minor"] = wallet.snapshot()["billed_minor"]
    result["entitlement"] = store.entitlement(account, PUBLIC_TOKENS["alice"])
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()

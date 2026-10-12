from pathlib import Path
from contextlib import closing
import json
import sqlite3
import tempfile
import time
import unittest
from types import SimpleNamespace

from blackberryrock.spend import (
    OutcomeUnknown,
    PolymarketDryRunAdapter,
    SimulationSigningService,
    SpendError,
    ValueSpendRuntime,
)
from blackberryrock.storage import IdempotencyConflict
from blackberryrock.wallet import Wallet


class UnknownThenExecutedAdapter(PolymarketDryRunAdapter):
    def execute(self, proposal, quote, authorization):
        raise OutcomeUnknown("fixture lost response after dispatch")

    def reconcile(self, proposal, execution_key):
        return {
            "state":"EXECUTED", "proposal_id":proposal["proposal_id"], "execution_key":execution_key,
            "receipt":self._receipt(proposal, self.quote(proposal)),
            "financial_transaction":False, "simulation_only":True,
        }


class FailOnceSigner(SimulationSigningService):
    def __init__(self):
        self.failed = False

    def sign(self, handle, payload):
        if not self.failed:
            self.failed = True
            raise RuntimeError("fixture signer unavailable before provider claim")
        return super().sign(handle, payload)


class CrashAfterProviderClaimAdapter(PolymarketDryRunAdapter):
    def execute(self, proposal, quote, authorization):
        raise SystemExit("fixture process terminated at provider boundary")


class OtherDryRunAdapter(PolymarketDryRunAdapter):
    adapter_id = "example.future-dry-run"
    supported_modes = ("SIMULATION",)


class SpendRuntimeTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.path = Path(self.temp.name) / "wallet.db"
        self.wallet = Wallet(self.path)
        sale = self.wallet.simulate_sale(20_000, "fund:sale")
        self.wallet.settle_sale(sale["id"], "fund:settle")
        self.now = 1_800_000_000
        self.runtime = ValueSpendRuntime(self.wallet, clock=lambda: self.now)

    def tearDown(self):
        self.temp.cleanup()

    def proposal(self, **changes):
        value = {
            "owner_id":"alice", "adapter_id":"polymarket.dry-run", "mode":"SIMULATION",
            "action":"trade.buy", "asset_id":"wallet.synthetic.usd", "amount_minor":1_000,
            "estimated_fee_minor":5, "estimated_gas_minor":0, "market_id":"market-election-1",
            "outcome":"YES", "limit_price_micros":500_000, "max_slippage_bps":50,
            "strategy_id":"manual", "expires_at":self.now + 120,
        }
        value.update(changes)
        return value

    def approved(self, **changes):
        proposed = self.runtime.propose(self.proposal(**changes), "proposal:" + str(len(self.runtime.snapshot()["proposals"])))
        self.assertEqual(proposed["status"], "PROPOSED", proposed["risk"])
        proposal_id = proposed["proposal"]["proposal_id"]
        approved = self.runtime.approve(proposal_id, proposed["proposal_digest"], approval_type="USER",
                                        approver="alice", decision=True, key="approval:" + proposal_id)
        self.assertEqual(approved["status"], "APPROVED")
        return proposed

    def test_vertical_slice_uses_exact_approval_shared_ledger_and_receipts(self):
        proposed = self.approved()
        proposal_id = proposed["proposal"]["proposal_id"]
        executed = self.runtime.execute(proposal_id, "execute:1")
        self.assertEqual(executed["status"], "EXECUTED")
        self.assertFalse(executed["receipt"]["financial_transaction"])
        self.assertIsNone(executed["receipt"]["external_order_id"])
        self.assertEqual(executed, self.runtime.execute(proposal_id, "execute:1"))
        reconciled = self.runtime.reconcile(proposal_id, "reconcile:1")
        self.assertEqual(reconciled["status"], "RECONCILED")
        snapshot = self.runtime.snapshot()
        self.assertEqual(snapshot["spend_accounts"], {
            "SPEND_HOLD":0, "SPEND_COMMITTED":1_000, "SPEND_FEES":5, "SPEND_GAS":0,
        })
        self.assertEqual(snapshot["asset_balances"]["wallet.synthetic.usd"]["available_minor"], 18_995)
        self.assertIsNone(snapshot["asset_balances"]["polygon.usdc"]["available_minor"])
        self.assertEqual(snapshot["positions"][0]["status"], "OPEN")
        names = {event["name"] for event in self.runtime.events(limit=100)}
        for required in ("spend.proposed","spend.approved","spend.executed","trade.executed",
                         "position.opened","settlement.pending","settlement.reconciled","risk.checked","pnl.updated"):
            self.assertIn(required, names)
        wallet = self.wallet.snapshot()
        self.assertEqual(wallet["ledger_balance_minor"], 0)
        for journal in wallet["journals"]:
            self.assertEqual(sum(post["delta_minor"] for post in journal["postings"]), 0)

    def test_secret_vault_and_signer_keep_plaintext_out_of_adapter_and_database(self):
        proposed = self.approved()
        self.runtime.execute(proposed["proposal"]["proposal_id"], "execute:opaque")
        raw = self.path.read_bytes().lower()
        self.assertNotIn(b"private_key", raw)
        self.assertNotIn(b"api_key", raw)
        with closing(sqlite3.connect(self.path)) as db:
            authorization = json.loads(db.execute("SELECT authorization_json FROM spend_proposals").fetchone()[0])
        self.assertEqual(authorization["algorithm"], "SIMULATED-DIGEST-NO-SECRET")
        self.assertEqual(set(authorization), {"schema","algorithm","signer_ref","signer_version","payload_digest","signature","simulation_only"})

    def a2a_reservation(self, runtime=None, **changes):
        value = {
            "owner_id": "alice", "delegation_id": "a2a-job-1", "parent_job_id": "zema-job-1",
            "currency": "USD", "budget_limit_minor": 2_000,
            "approval_sha256": "a" * 64, "deadline_at": (self.now + 3_600) * 1000,
            "key": "a2a-reserve-1",
        }
        value.update(changes)
        return (runtime or self.runtime).reserve_a2a_budget(**value)

    def a2a_broker_proof(self, reservation, **changes):
        proof = {
            "schema": "rock-a2a-broker-authorization/2", "authorityId": "fixture-rockstaros",
            "ownerUserId": reservation["owner_id"], "deviceRef": "device-a",
            "delegationId": reservation["delegation_id"], "parentJobId": reservation["parent_job_id"],
            "messageId": "message-1", "targetOrigin": "https://agent.example",
            "targetAgentName": "Research Agent", "targetAgentVersion": "1.0.0",
            "protocolVersion": "1.0", "inputSha256": "b" * 64,
            "budgetCurrency": reservation["currency"],
            "budgetLimitMinor": reservation["budget_limit_minor"],
            "continueWhileDeviceOffline": True,
            "deadlineAt": reservation["deadline_at"],
            "authorizationSha256": reservation["approval_sha256"],
            "issuedAt": self.now * 1000, "expiresAt": self.now * 1000 + 5 * 60_000,
            "keyId": "fixture-device-key",
        }
        proof.update(changes)
        return proof

    def authorize_a2a_reservation(self, reservation, proof=None, key="a2a-broker-auth"):
        principal = SimpleNamespace(subject=reservation["owner_id"], device_ref="device-a")
        return self.runtime.authorize_a2a_proof(
            principal, proof or self.a2a_broker_proof(reservation), key)

    def test_a2a_wallet_reservation_is_atomic_owner_bound_and_idempotent(self):
        first = self.a2a_reservation()
        self.assertEqual(first["state"], "HELD")
        self.assertEqual(first["held_minor"], 2_000)
        self.assertEqual(first["owner_id"], "alice")
        self.assertEqual(self.a2a_reservation(), first)
        snapshot = self.wallet.snapshot()
        self.assertEqual(snapshot["accounts"]["AVAILABLE"], 18_000)
        self.assertEqual(snapshot["accounts"]["SPEND_HOLD"], 2_000)
        with self.assertRaises(IdempotencyConflict):
            self.a2a_reservation(budget_limit_minor=2_001)
        with self.assertRaises(SpendError):
            self.a2a_reservation(currency="JPY")
        other = self.a2a_reservation(delegation_id="a2a-job-2", key="a2a-reserve-2", budget_limit_minor=18_000)
        self.assertEqual(other["state"], "HELD")
        self.assertEqual(self.wallet.snapshot()["accounts"]["SPEND_HOLD"], 20_000)

    def test_broker_proof_authorizer_atomically_fences_exact_hold_until_proof_expiry(self):
        reserved = self.a2a_reservation()
        proof = self.a2a_broker_proof(reserved)
        self.assertTrue(self.authorize_a2a_reservation(reserved, proof))
        self.assertTrue(self.authorize_a2a_reservation(reserved, proof))
        self.assertFalse(self.authorize_a2a_reservation(
            reserved, proof, key="a2a-broker-auth-new-key"))
        with self.assertRaises(SpendError):
            self.runtime.release_a2a_budget(reserved["delegation_id"], "a2a-live-proof-release")
        self.assertFalse(self.authorize_a2a_reservation(
            reserved, {**proof, "budgetLimitMinor": proof["budgetLimitMinor"] + 1},
            key="a2a-broker-auth-wrong-cap"))
        self.assertFalse(self.authorize_a2a_reservation(
            reserved, {**proof, "deviceRef": "device-b"}, key="a2a-broker-auth-wrong-device"))
        self.assertFalse(self.authorize_a2a_reservation(
            reserved, {**proof, "continueWhileDeviceOffline": False},
            key="a2a-broker-auth-no-offline-consent"))
        self.now += 301
        self.assertEqual(self.runtime.release_a2a_budget(
            reserved["delegation_id"], "a2a-expired-proof-release")["state"], "RELEASED")

    def test_a2a_unknown_remote_outcome_retains_hold_and_cannot_be_released(self):
        reserved = self.a2a_reservation()
        dispatched = self.runtime.mark_a2a_dispatched(reserved["delegation_id"], "a2a-dispatch")
        self.assertEqual(dispatched["state"], "DISPATCHED")
        unknown = self.runtime.mark_a2a_indeterminate(reserved["delegation_id"], "a2a-unknown")
        self.assertEqual(unknown["state"], "INDETERMINATE")
        self.assertEqual(unknown["held_minor"], 2_000)
        with self.assertRaises(SpendError):
            self.runtime.release_a2a_budget(reserved["delegation_id"], "a2a-illegal-release")
        with self.assertRaises(SpendError):
            self.runtime.settle_a2a_budget(reserved["delegation_id"], {"amount_minor": 10}, "a2a-no-verifier")
        self.assertEqual(self.runtime.get_a2a_budget(reserved["delegation_id"])["held_minor"], 2_000)

    def test_a2a_settlement_requires_trusted_receipt_and_releases_unused_budget_once(self):
        reserve = self.a2a_reservation()
        runtime = ValueSpendRuntime(
            self.wallet,
            a2a_usage_receipt_verifier=lambda receipt, hold: (
                receipt.get("signature_valid") is True and
                receipt.get("delegation_id") == hold["delegation_id"] and
                receipt.get("owner_id") == hold["owner_id"] and
                receipt.get("currency") == hold["currency"] and
                receipt.get("amountMinor") <= hold["budget_limit_minor"]
            ),
            clock=lambda: self.now,
        )
        runtime.mark_a2a_dispatched(reserve["delegation_id"], "a2a-dispatch-settle")
        receipt = {"delegation_id": reserve["delegation_id"], "owner_id": "alice",
                   "currency": "USD", "amountMinor": 650, "signature_valid": True}
        settled = runtime.settle_a2a_budget(reserve["delegation_id"], receipt, "a2a-settle")
        self.assertEqual(settled["state"], "SETTLED")
        self.assertEqual(settled["settled_minor"], 650)
        self.assertEqual(settled["released_minor"], 1_350)
        self.assertEqual(runtime.settle_a2a_budget(reserve["delegation_id"], receipt, "a2a-settle"), settled)
        with self.assertRaises(SpendError):
            runtime.settle_a2a_budget(reserve["delegation_id"], {**receipt, "amount_minor": 651}, "a2a-settle-conflict")
        snapshot = self.wallet.snapshot()
        self.assertEqual(snapshot["accounts"]["AVAILABLE"], 19_350)
        self.assertEqual(snapshot["accounts"]["SPEND_HOLD"], 0)
        self.assertEqual(snapshot["accounts"]["SPEND_COMMITTED"], 650)

    def test_unknown_outcome_retains_hold_and_reconciliation_commits_once(self):
        runtime = ValueSpendRuntime(self.wallet, adapters=(UnknownThenExecutedAdapter(),), clock=lambda: self.now)
        value = self.proposal()
        proposed = runtime.propose(value, "unknown:propose")
        proposal_id = proposed["proposal"]["proposal_id"]
        runtime.approve(proposal_id, proposed["proposal_digest"], approval_type="USER", approver="alice", decision=True, key="unknown:approve")
        unknown = runtime.execute(proposal_id, "unknown:execute")
        self.assertEqual(unknown["status"], "UNKNOWN")
        self.assertEqual(runtime.snapshot()["spend_accounts"]["SPEND_HOLD"], 1_005)
        self.assertEqual(runtime.execute(proposal_id, "unknown:execute"), unknown)
        reconciled = runtime.reconcile(proposal_id, "unknown:reconcile")
        self.assertEqual(reconciled["status"], "RECONCILED")
        self.assertEqual(runtime.snapshot()["spend_accounts"]["SPEND_HOLD"], 0)
        self.assertEqual(len(runtime.snapshot()["positions"]), 1)

    def test_interrupted_two_phase_execution_resumes_or_reconciles_without_resend(self):
        signer = FailOnceSigner()
        runtime = ValueSpendRuntime(self.wallet, signer=signer, clock=lambda: self.now)
        proposed = runtime.propose(self.proposal(market_id="signer-recovery"), "signer:propose")
        proposal_id = proposed["proposal"]["proposal_id"]
        runtime.approve(proposal_id, proposed["proposal_digest"], approval_type="USER", approver="alice",
                        decision=True, key="signer:approve")
        with self.assertRaises(RuntimeError):
            runtime.execute(proposal_id, "signer:execute")
        self.assertEqual(runtime.command({"v":1,"op":"spend.get","proposal_id":proposal_id})["status"], "EXECUTING")
        self.assertEqual(runtime.execute(proposal_id, "signer:execute")["status"], "EXECUTED")

        crash = ValueSpendRuntime(self.wallet, adapters=(CrashAfterProviderClaimAdapter(),), clock=lambda: self.now)
        proposed = crash.propose(self.proposal(market_id="provider-recovery"), "crash:propose")
        proposal_id = proposed["proposal"]["proposal_id"]
        crash.approve(proposal_id, proposed["proposal_digest"], approval_type="USER", approver="alice",
                      decision=True, key="crash:approve")
        with self.assertRaises(SystemExit):
            crash.execute(proposal_id, "crash:execute")
        recovered = crash.execute(proposal_id, "crash:execute")
        self.assertEqual(recovered["status"], "UNKNOWN")
        self.assertGreater(crash.snapshot()["spend_accounts"]["SPEND_HOLD"], 0)
        self.assertEqual(crash.reconcile(proposal_id, "crash:reconcile")["status"], "RECONCILED")

    def test_live_game_asset_smart_money_and_emergency_stop_fail_closed(self):
        live = self.runtime.propose(self.proposal(mode="LIVE", asset_id="polygon.usdc"), "live")
        self.assertEqual(live["status"], "REJECTED")
        self.assertIn("LIVE_DISABLED", live["risk"]["reasons"])
        self.assertIn("MODE_NOT_SUPPORTED_BY_ADAPTER", live["risk"]["reasons"])
        game = self.runtime.propose(self.proposal(asset_id="game.example.gold"), "game")
        self.assertEqual(game["status"], "REJECTED")
        self.assertIn("GAME_ASSET_EXTERNAL_SPEND_FORBIDDEN", game["risk"]["reasons"])
        with self.assertRaises(SpendError):
            self.runtime.set_strategy("polymarket.dry-run", "smart_money", True, "smart")
        self.runtime.emergency_stop(True, "stop")
        stopped = self.runtime.propose(self.proposal(market_id="market-2"), "stopped")
        self.assertIn("EMERGENCY_STOP", stopped["risk"]["reasons"])
        self.runtime.emergency_stop(False, "resume")
        self.assertFalse(self.runtime.snapshot()["policy"]["emergency_stop"])

    def test_limits_digest_and_asset_constraints_are_enforced(self):
        self.runtime.configure_risk({"max_order_minor":900,"daily_loss_limit_minor":500,
                                     "exposure_limit_minor":1_500,"max_slippage_bps":25}, "limits")
        rejected = self.runtime.propose(self.proposal(), "too-large")
        self.assertEqual(rejected["status"], "REJECTED")
        self.assertIn("ORDER_LIMIT", rejected["risk"]["reasons"])
        rejected = self.runtime.propose(self.proposal(amount_minor=500,max_slippage_bps=30,market_id="market-slip"), "slip")
        self.assertIn("SLIPPAGE_LIMIT", rejected["risk"]["reasons"])
        ok = self.runtime.propose(self.proposal(amount_minor=500,max_slippage_bps=25,market_id="market-ok"), "ok")
        with self.assertRaises(SpendError):
            self.runtime.approve(ok["proposal"]["proposal_id"], "0" * 64, approval_type="USER", approver="alice", decision=True, key="bad-digest")
        with self.assertRaises(SpendError):
            self.runtime.approve(ok["proposal"]["proposal_id"], ok["proposal_digest"], approval_type="USER",
                                 approver="mallory", decision=True, key="wrong-owner")
        self.runtime.approve(ok["proposal"]["proposal_id"], ok["proposal_digest"], approval_type="POLICY", approver="risk-policy", decision=True, key="policy-approval")
        with self.assertRaises(IdempotencyConflict):
            self.runtime.propose(self.proposal(amount_minor=400,market_id="different"), "ok")
        with self.assertRaises(SpendError):
            self.runtime.register_asset({"asset_id":"game.bad","kind":"game","issuer":"bad","network":None,"scale":0,
                                         "transferable":False,"redeemable":False,"external_withdrawal":True,"valuation_source":"issuer"})

    def test_expired_approval_rechecks_risk_and_paper_stays_nonfinancial(self):
        expired = self.approved(expires_at=self.now + 1)
        self.now += 2
        result = self.runtime.execute(expired["proposal"]["proposal_id"], "expired:execute")
        self.assertEqual(result["status"], "REJECTED")
        self.assertIn("PROPOSAL_EXPIRED", {event["payload"].get("reason", "")
                                            for event in self.runtime.events(prefix="spend.rejected")})
        self.assertEqual(self.runtime.snapshot()["spend_accounts"]["SPEND_HOLD"], 0)

        paper = self.approved(mode="PAPER", market_id="paper-market", expires_at=self.now + 120)
        paper_result = self.runtime.execute(paper["proposal"]["proposal_id"], "paper:execute")
        self.assertEqual(paper_result["status"], "EXECUTED")
        self.assertTrue(paper_result["receipt"]["simulation_only"])
        self.assertFalse(paper_result["receipt"]["financial_transaction"])

    def test_total_exposure_is_enforced_across_open_positions(self):
        self.runtime.configure_risk({"max_order_minor":2_000,"daily_loss_limit_minor":10_000,
                                     "exposure_limit_minor":1_300,"max_slippage_bps":100}, "exposure:limits")
        first = self.approved(market_id="exposure-open")
        self.runtime.execute(first["proposal"]["proposal_id"], "exposure:execute")
        second = self.runtime.propose(self.proposal(amount_minor=400,market_id="exposure-next"), "exposure:next")
        self.assertEqual(second["status"], "REJECTED")
        self.assertIn("EXPOSURE_LIMIT", second["risk"]["reasons"])

    def test_daily_realized_loss_blocks_following_spend(self):
        self.runtime.configure_risk({"max_order_minor":2_000,"daily_loss_limit_minor":1_000,
                                     "exposure_limit_minor":10_000,"max_slippage_bps":100}, "loss:limits")
        first = self.approved(market_id="loss-position")
        self.runtime.execute(first["proposal"]["proposal_id"], "loss:execute")
        position = self.runtime.snapshot()["positions"][0]
        settled = self.runtime.settle_position(position["id"], 1, "loss:settle")
        self.assertLessEqual(settled["realized_pnl_minor"], -1_000)
        blocked = self.runtime.propose(self.proposal(amount_minor=100,market_id="loss-next"), "loss:next")
        self.assertEqual(blocked["status"], "REJECTED")
        self.assertIn("DAILY_LOSS_LIMIT", blocked["risk"]["reasons"])

    def test_mark_and_settlement_report_asset_scoped_realized_and_unrealized_pnl(self):
        proposed = self.approved(amount_minor=1_000,estimated_fee_minor=5)
        self.runtime.execute(proposed["proposal"]["proposal_id"], "pnl:execute")
        position = self.runtime.snapshot()["positions"][0]
        marked = self.runtime.mark_position(position["id"], 600_000, "pnl:mark")
        self.assertEqual(marked["unrealized_pnl_minor"], 195)
        settled = self.runtime.settle_position(position["id"], 1_000_000, "pnl:settle")
        self.assertEqual(settled["realized_pnl_minor"], 995)
        state = self.runtime.snapshot()
        self.assertEqual(state["pnl_by_asset"], {"wallet.synthetic.usd":{"realized_minor":995,"unrealized_minor":0}})
        self.assertEqual(state["asset_balances"]["wallet.synthetic.usd"]["available_minor"], 20_995)
        self.assertIn("pnl.realized", {event["name"] for event in self.runtime.events(prefix="pnl.")})

    def test_strict_hub_mcp_command_surface(self):
        state = self.runtime.command({"v":1,"op":"spend.snapshot"})
        self.assertEqual(state["schema"], "rock-value-spend-state/1")
        self.assertEqual({asset["kind"] for asset in self.runtime.command({"v":1,"op":"asset.list"})},
                         {"crypto","game","internal","external"})
        with self.assertRaises(SpendError):
            self.runtime.command({"v":1,"op":"spend.snapshot","extra":True})
        with self.assertRaises(SpendError):
            self.runtime.command({"v":2,"op":"spend.snapshot"})

    def test_account_migration_accepts_sqlite_quoted_table_name(self):
        quoted_path = Path(self.temp.name) / "quoted-wallet.db"
        wallet = Wallet(quoted_path)
        with wallet._transaction() as db:
            db.execute("ALTER TABLE wallet_postings RENAME TO wallet_postings_old")
            db.execute("ALTER TABLE wallet_postings_old RENAME TO wallet_postings")
        with closing(sqlite3.connect(quoted_path)) as db:
            sql = db.execute(
                "SELECT sql FROM sqlite_master WHERE type='table' AND name='wallet_postings'"
            ).fetchone()[0]
        self.assertIn('"wallet_postings"', sql)
        runtime = ValueSpendRuntime(wallet, clock=lambda: self.now)
        self.assertEqual(runtime.snapshot()["spend_accounts"]["SPEND_HOLD"], 0)

    def test_common_adapter_interface_registers_a_manual_strategy(self):
        runtime = ValueSpendRuntime(self.wallet, adapters=(OtherDryRunAdapter(),), clock=lambda: self.now)
        proposed = runtime.propose(self.proposal(adapter_id="example.future-dry-run", market_id="future-adapter"),
                                   "future:propose")
        self.assertEqual(proposed["status"], "PROPOSED")
        self.assertIn({"adapter_id":"example.future-dry-run","strategy_id":"manual","enabled":True},
                      runtime.snapshot()["strategies"])


if __name__ == "__main__":
    unittest.main()

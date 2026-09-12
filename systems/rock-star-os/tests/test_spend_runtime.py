from pathlib import Path
from contextlib import closing
import json
import sqlite3
import tempfile
import time
import unittest

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

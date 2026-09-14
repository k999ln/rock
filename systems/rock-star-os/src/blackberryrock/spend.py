"""RockstarOS Value/Spend Runtime vertical slice.

The runtime is simulation/paper only. It owns proposal, policy, approval,
signing, adapter, receipt and reconciliation boundaries while reusing the
Wallet's SQLite transaction, append-only journals and idempotency receipts.
No private key, API key, network order or real-value balance is implemented.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from contextlib import closing
from dataclasses import dataclass
from datetime import UTC, datetime
import hashlib
import json
import re
import sqlite3
import time
from typing import Any, Callable
import uuid

from .packages import canonical, digest
from .wallet import ACCOUNTS, GAME_ACCOUNTS, SPEND_ACCOUNTS, InsufficientFunds, Wallet, WalletError


MODES = ("SIMULATION", "PAPER", "LIVE")
ASSET_KINDS = ("crypto", "game", "internal", "external")
TERMINAL_PROPOSALS = ("REJECTED", "EXECUTED", "RECONCILED")
MAX_ROWS = 10_000
DEFAULT_POLICY = {
    "max_order_minor": 5_000,
    "daily_loss_limit_minor": 2_500,
    "exposure_limit_minor": 10_000,
    "max_slippage_bps": 100,
    "allow_policy_approval": True,
}


class SpendError(ValueError):
    pass


class PolicyRejected(SpendError):
    pass


class AdapterRejected(SpendError):
    """The adapter confirms that no external effect occurred."""


class OutcomeUnknown(OSError):
    """The adapter may have accepted an effect; reconciliation is required."""


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


def _identifier(value: Any, maximum: int = 160) -> str:
    if not isinstance(value, str) or not 1 <= len(value) <= maximum or not value.strip():
        raise SpendError("identifier must be a non-empty bounded string")
    if any(ord(character) < 32 for character in value):
        raise SpendError("identifier contains a control character")
    return value


def _minor(value: Any, *, allow_zero: bool = False) -> int:
    lower = 0 if allow_zero else 1
    if type(value) is not int or not lower <= value <= 100_000_000:
        raise SpendError("amount must be a bounded integer minor-unit value")
    return value


def _ppm(value: Any) -> int:
    if type(value) is not int or not 1 <= value <= 1_000_000:
        raise SpendError("price must be an integer from 1 to 1000000")
    return value


def _json(value: Any) -> str:
    return canonical(value).decode()


def _load(value: str | None) -> Any:
    return json.loads(value) if value is not None else None


@dataclass(frozen=True)
class SecretHandle:
    reference: str
    version: int
    opaque_handle: str


class SecretVault(ABC):
    """Resolves a secret reference to an opaque handle, never plaintext."""

    @abstractmethod
    def resolve(self, reference: str) -> SecretHandle:
        raise NotImplementedError


class SigningService(ABC):
    """Signs inside the trust boundary; adapters receive only authorization."""

    @abstractmethod
    def sign(self, handle: SecretHandle, payload: dict[str, Any]) -> dict[str, Any]:
        raise NotImplementedError


class SimulationSecretVault(SecretVault):
    """Public fixture vault. It contains no private or API key material."""

    def resolve(self, reference: str) -> SecretHandle:
        _identifier(reference)
        opaque = "simulated:" + hashlib.sha256(reference.encode()).hexdigest()
        return SecretHandle(reference=reference, version=1, opaque_handle=opaque)


class SimulationSigningService(SigningService):
    def sign(self, handle: SecretHandle, payload: dict[str, Any]) -> dict[str, Any]:
        payload_digest = digest(payload)
        signature = hashlib.sha256((handle.opaque_handle + ":" + payload_digest).encode()).hexdigest()
        return {
            "schema": "rock-signed-spend-authorization/1",
            "algorithm": "SIMULATED-DIGEST-NO-SECRET",
            "signer_ref": handle.reference,
            "signer_version": handle.version,
            "payload_digest": payload_digest,
            "signature": signature,
            "simulation_only": True,
        }


class SpendAdapter(ABC):
    adapter_id: str
    supported_modes: tuple[str, ...]
    upstream: dict[str, str]

    @abstractmethod
    def quote(self, proposal: dict[str, Any]) -> dict[str, Any]:
        raise NotImplementedError

    @abstractmethod
    def execute(self, proposal: dict[str, Any], quote: dict[str, Any], authorization: dict[str, Any]) -> dict[str, Any]:
        raise NotImplementedError

    @abstractmethod
    def reconcile(self, proposal: dict[str, Any], execution_key: str) -> dict[str, Any]:
        raise NotImplementedError

    def secret_reference(self, mode: str) -> str:
        return f"{self.adapter_id}.{mode.lower()}.signer"


class PolymarketDryRunAdapter(SpendAdapter):
    """First integration: contract-compatible dry run, not copied bot code."""

    adapter_id = "polymarket.dry-run"
    supported_modes = ("SIMULATION", "PAPER")
    upstream = {
        "repository": "https://github.com/MrFadiAi/Polymarket-bot",
        "ref": "82647014e0c355a5684e09666d8a0a522234640d",
        "license": "MIT",
    }

    def quote(self, proposal: dict[str, Any]) -> dict[str, Any]:
        return {
            "schema": "rock-polymarket-dry-run-quote/1",
            "adapter_id": self.adapter_id,
            "market_id": proposal["market_id"],
            "outcome": proposal["outcome"],
            "price_micros": proposal["limit_price_micros"],
            "fee_minor": proposal["estimated_fee_minor"],
            "gas_minor": proposal["estimated_gas_minor"],
            "expires_at": proposal["expires_at"],
            "financial_transaction": False,
            "simulation_only": True,
        }

    def _receipt(self, proposal: dict[str, Any], quote: dict[str, Any]) -> dict[str, Any]:
        receipt_id = "poly-sim-" + digest([proposal["proposal_id"], "dry-run-v1"])[:32]
        quantity_micros = proposal["amount_minor"] * 10_000_000_000 // quote["price_micros"]
        return {
            "schema": "rock-polymarket-execution-receipt/1",
            "receipt_id": receipt_id,
            "proposal_id": proposal["proposal_id"],
            "adapter_id": self.adapter_id,
            "mode": proposal["mode"],
            "state": "EXECUTED",
            "market_id": proposal["market_id"],
            "outcome": proposal["outcome"],
            "fill_price_micros": quote["price_micros"],
            "quantity_micros": quantity_micros,
            "principal_minor": proposal["amount_minor"],
            "fee_minor": quote["fee_minor"],
            "gas_minor": quote["gas_minor"],
            "external_order_id": None,
            "financial_transaction": False,
            "simulation_only": True,
        }

    def execute(self, proposal: dict[str, Any], quote: dict[str, Any], authorization: dict[str, Any]) -> dict[str, Any]:
        if proposal["mode"] not in self.supported_modes:
            raise AdapterRejected("Polymarket dry-run adapter has no LIVE path")
        fields = {"schema","algorithm","signer_ref","signer_version","payload_digest","signature","simulation_only"}
        if set(authorization) != fields or authorization.get("simulation_only") is not True:
            raise AdapterRejected("opaque simulated signing authorization required")
        return self._receipt(proposal, quote)

    def reconcile(self, proposal: dict[str, Any], execution_key: str) -> dict[str, Any]:
        return {
            "state": "EXECUTED",
            "proposal_id": proposal["proposal_id"],
            "execution_key": execution_key,
            "receipt": self._receipt(proposal, self.quote(proposal)),
            "financial_transaction": False,
            "simulation_only": True,
        }


ASSET_SCHEMA = {
    "asset_id", "kind", "issuer", "network", "scale", "transferable", "redeemable",
    "external_withdrawal", "valuation_source",
}
PROPOSAL_SCHEMA = {
    "owner_id", "adapter_id", "mode", "action", "asset_id", "amount_minor",
    "estimated_fee_minor", "estimated_gas_minor", "market_id", "outcome",
    "limit_price_micros", "max_slippage_bps", "strategy_id", "expires_at",
}


def _asset(value: dict[str, Any]) -> dict[str, Any]:
    if type(value) is not dict or set(value) != ASSET_SCHEMA:
        raise SpendError("asset registry entry has unknown or missing fields")
    _identifier(value["asset_id"]); _identifier(value["issuer"]); _identifier(value["valuation_source"])
    if value["kind"] not in ASSET_KINDS:
        raise SpendError("unsupported asset kind")
    if value["network"] is not None:
        _identifier(value["network"])
    if type(value["scale"]) is not int or not 0 <= value["scale"] <= 18:
        raise SpendError("asset scale must be from 0 to 18")
    for name in ("transferable", "redeemable", "external_withdrawal"):
        if type(value[name]) is not bool:
            raise SpendError("asset constraints must be booleans")
    if value["kind"] == "game" and value["external_withdrawal"] and not (
        value["transferable"] and value["redeemable"]
    ):
        raise SpendError("game assets require transfer and redemption rights before external withdrawal")
    return dict(value)


def _proposal(value: dict[str, Any], now: int) -> dict[str, Any]:
    if type(value) is not dict or set(value) != PROPOSAL_SCHEMA:
        raise SpendError("spend proposal has unknown or missing fields")
    result = dict(value)
    for name in ("owner_id", "adapter_id", "asset_id", "market_id", "strategy_id"):
        _identifier(result[name])
    if result["mode"] not in MODES or result["action"] != "trade.buy":
        raise SpendError("unsupported mode or spend action")
    if result["outcome"] not in ("YES", "NO"):
        raise SpendError("Polymarket outcome must be YES or NO")
    _minor(result["amount_minor"])
    _minor(result["estimated_fee_minor"], allow_zero=True)
    _minor(result["estimated_gas_minor"], allow_zero=True)
    _ppm(result["limit_price_micros"])
    if type(result["max_slippage_bps"]) is not int or not 0 <= result["max_slippage_bps"] <= 10_000:
        raise SpendError("slippage must be integer basis points")
    if type(result["expires_at"]) is not int or not now < result["expires_at"] <= now + 86_400:
        raise SpendError("proposal expiry must be within the next 24 hours")
    return result


class ValueSpendRuntime:
    """One local owner-scoped Value/Spend Runtime and Hub/MCP command surface."""

    def __init__(self, wallet: Wallet, *, adapters: tuple[SpendAdapter, ...] | None = None,
                 vault: SecretVault | None = None, signer: SigningService | None = None,
                 clock: Callable[[], float] = time.time):
        self.wallet = wallet
        self.clock = clock
        items = (PolymarketDryRunAdapter(),) if adapters is None else adapters
        if type(items) is not tuple or not 1 <= len(items) <= 32:
            raise SpendError("one to 32 adapters are required")
        for item in items:
            _identifier(item.adapter_id)
            if (type(item.supported_modes) is not tuple or not item.supported_modes or
                    len(set(item.supported_modes)) != len(item.supported_modes) or
                    any(mode not in MODES for mode in item.supported_modes)):
                raise SpendError("adapter modes must be a unique non-empty standard-mode tuple")
        self.adapters = {item.adapter_id: item for item in items}
        if len(self.adapters) != len(items):
            raise SpendError("bounded unique adapters required")
        self.vault = vault or SimulationSecretVault()
        self.signer = signer or SimulationSigningService()
        self._install()

    def _now(self) -> int:
        return int(self.clock())

    def _install(self) -> None:
        with self.wallet._transaction() as db:
            self._install_accounts(db)
            db.executescript("""
                CREATE TABLE IF NOT EXISTS value_spend_schema (
                    singleton INTEGER PRIMARY KEY CHECK(singleton=1),
                    version INTEGER NOT NULL CHECK(version=1), installed_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS value_assets (
                    asset_id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('crypto','game','internal','external')),
                    issuer TEXT NOT NULL, network TEXT, scale INTEGER NOT NULL,
                    transferable INTEGER NOT NULL CHECK(transferable IN (0,1)),
                    redeemable INTEGER NOT NULL CHECK(redeemable IN (0,1)),
                    external_withdrawal INTEGER NOT NULL CHECK(external_withdrawal IN (0,1)),
                    valuation_source TEXT NOT NULL, created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS spend_policy (
                    singleton INTEGER PRIMARY KEY CHECK(singleton=1), max_order_minor INTEGER NOT NULL,
                    daily_loss_limit_minor INTEGER NOT NULL, exposure_limit_minor INTEGER NOT NULL,
                    max_slippage_bps INTEGER NOT NULL, allow_policy_approval INTEGER NOT NULL CHECK(allow_policy_approval IN (0,1)),
                    live_enabled INTEGER NOT NULL DEFAULT 0 CHECK(live_enabled IN (0,1)),
                    emergency_stop INTEGER NOT NULL DEFAULT 0 CHECK(emergency_stop IN (0,1))
                );
                CREATE TABLE IF NOT EXISTS spend_strategies (
                    adapter_id TEXT NOT NULL, strategy_id TEXT NOT NULL, enabled INTEGER NOT NULL CHECK(enabled IN (0,1)),
                    PRIMARY KEY(adapter_id,strategy_id)
                );
                CREATE TABLE IF NOT EXISTS spend_proposals (
                    id TEXT PRIMARY KEY, request_digest TEXT UNIQUE NOT NULL, request_json TEXT NOT NULL,
                    proposal_digest TEXT UNIQUE NOT NULL, quote_json TEXT NOT NULL, risk_json TEXT NOT NULL,
                    status TEXT NOT NULL CHECK(status IN ('PROPOSED','REJECTED','APPROVED','EXECUTING','UNKNOWN','EXECUTED','RECONCILED')),
                    execution_key TEXT UNIQUE, provider_claimed INTEGER NOT NULL DEFAULT 0 CHECK(provider_claimed IN (0,1)),
                    authorization_json TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
                );
                CREATE TABLE IF NOT EXISTS spend_approvals (
                    id TEXT PRIMARY KEY, proposal_id TEXT UNIQUE NOT NULL REFERENCES spend_proposals(id),
                    approval_type TEXT NOT NULL CHECK(approval_type IN ('USER','POLICY')), approver TEXT NOT NULL,
                    proposal_digest TEXT NOT NULL, decision TEXT NOT NULL CHECK(decision IN ('APPROVED','REJECTED')),
                    created_at INTEGER NOT NULL
                );
                CREATE TABLE IF NOT EXISTS spend_reservations (
                    proposal_id TEXT PRIMARY KEY REFERENCES spend_proposals(id), principal_minor INTEGER NOT NULL,
                    max_fee_minor INTEGER NOT NULL, max_gas_minor INTEGER NOT NULL, actual_fee_minor INTEGER NOT NULL DEFAULT 0,
                    actual_gas_minor INTEGER NOT NULL DEFAULT 0, held_minor INTEGER NOT NULL,
                    committed_minor INTEGER NOT NULL DEFAULT 0, released_minor INTEGER NOT NULL DEFAULT 0,
                    state TEXT NOT NULL CHECK(state IN ('HELD','COMMITTED','RELEASED')),
                    reserve_journal_id TEXT UNIQUE NOT NULL REFERENCES wallet_journals(id)
                );
                CREATE TABLE IF NOT EXISTS spend_receipts (
                    proposal_id TEXT PRIMARY KEY REFERENCES spend_proposals(id), receipt_id TEXT UNIQUE NOT NULL,
                    adapter_id TEXT NOT NULL, receipt_json TEXT NOT NULL, reconciliation_json TEXT, reconciled_at INTEGER
                );
                CREATE TABLE IF NOT EXISTS spend_positions (
                    id TEXT PRIMARY KEY, proposal_id TEXT UNIQUE NOT NULL REFERENCES spend_proposals(id), asset_id TEXT NOT NULL REFERENCES value_assets(asset_id),
                    market_id TEXT NOT NULL, outcome TEXT NOT NULL, quantity_micros INTEGER NOT NULL,
                    cost_minor INTEGER NOT NULL, fee_minor INTEGER NOT NULL, gas_minor INTEGER NOT NULL,
                    entry_price_micros INTEGER NOT NULL, mark_price_micros INTEGER NOT NULL,
                    status TEXT NOT NULL CHECK(status IN ('OPEN','SETTLED')), realized_pnl_minor INTEGER,
                    created_at INTEGER NOT NULL, settled_at INTEGER
                );
                CREATE TABLE IF NOT EXISTS value_events (
                    seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
                    aggregate_type TEXT NOT NULL, aggregate_id TEXT NOT NULL, payload_json TEXT NOT NULL,
                    created_at INTEGER NOT NULL
                );
                CREATE TRIGGER IF NOT EXISTS value_assets_no_update BEFORE UPDATE ON value_assets
                    BEGIN SELECT RAISE(ABORT,'asset registry entry immutable'); END;
                CREATE TRIGGER IF NOT EXISTS value_assets_no_delete BEFORE DELETE ON value_assets
                    BEGIN SELECT RAISE(ABORT,'asset registry entry immutable'); END;
                CREATE TRIGGER IF NOT EXISTS spend_approvals_no_update BEFORE UPDATE ON spend_approvals
                    BEGIN SELECT RAISE(ABORT,'spend approval immutable'); END;
                CREATE TRIGGER IF NOT EXISTS spend_approvals_no_delete BEFORE DELETE ON spend_approvals
                    BEGIN SELECT RAISE(ABORT,'spend approval immutable'); END;
                CREATE TRIGGER IF NOT EXISTS value_events_no_update BEFORE UPDATE ON value_events
                    BEGIN SELECT RAISE(ABORT,'event immutable'); END;
                CREATE TRIGGER IF NOT EXISTS value_events_no_delete BEFORE DELETE ON value_events
                    BEGIN SELECT RAISE(ABORT,'event immutable'); END;
                CREATE TRIGGER IF NOT EXISTS spend_proposal_binding_frozen BEFORE UPDATE OF request_digest,request_json,proposal_digest,quote_json,risk_json ON spend_proposals
                    BEGIN SELECT RAISE(ABORT,'spend proposal binding immutable'); END;
                CREATE TRIGGER IF NOT EXISTS spend_proposal_terminal_frozen BEFORE UPDATE ON spend_proposals
                    WHEN OLD.status IN ('REJECTED','RECONCILED') BEGIN SELECT RAISE(ABORT,'terminal spend proposal immutable'); END;
                CREATE TRIGGER IF NOT EXISTS spend_reservation_terminal_frozen BEFORE UPDATE ON spend_reservations
                    WHEN OLD.state IN ('COMMITTED','RELEASED') BEGIN SELECT RAISE(ABORT,'terminal spend reservation immutable'); END;
                CREATE TRIGGER IF NOT EXISTS spend_receipt_binding_frozen BEFORE UPDATE OF proposal_id,receipt_id,adapter_id,receipt_json ON spend_receipts
                    BEGIN SELECT RAISE(ABORT,'execution receipt immutable'); END;
                CREATE TRIGGER IF NOT EXISTS spend_reconciliation_frozen BEFORE UPDATE OF reconciliation_json,reconciled_at ON spend_receipts
                    WHEN OLD.reconciliation_json IS NOT NULL BEGIN SELECT RAISE(ABORT,'reconciliation receipt immutable'); END;
                CREATE TRIGGER IF NOT EXISTS spend_position_binding_frozen BEFORE UPDATE OF id,proposal_id,asset_id,market_id,outcome,quantity_micros,cost_minor,fee_minor,gas_minor,entry_price_micros,created_at ON spend_positions
                    BEGIN SELECT RAISE(ABORT,'position binding immutable'); END;
            """)
            db.execute("INSERT OR IGNORE INTO value_spend_schema VALUES (1,1,?)", (_now_iso(),))
            db.execute("INSERT OR IGNORE INTO spend_policy VALUES (1,?,?,?,?,?,0,0)", tuple(DEFAULT_POLICY.values()))
            strategies = [(adapter_id, "manual", 1) for adapter_id in self.adapters]
            if "polymarket.dry-run" in self.adapters:
                strategies += [
                    ("polymarket.dry-run", "arbitrage", 0),
                    ("polymarket.dry-run", "dip_arb", 0),
                    ("polymarket.dry-run", "smart_money", 0),
                ]
            for adapter_id, strategy, enabled in strategies:
                db.execute("INSERT OR IGNORE INTO spend_strategies VALUES (?,?,?)", (adapter_id, strategy, enabled))
            for item in (
                {"asset_id":"wallet.synthetic.usd","kind":"internal","issuer":"rockstaros.fixture","network":None,"scale":2,
                 "transferable":False,"redeemable":False,"external_withdrawal":False,"valuation_source":"synthetic-fixture"},
                {"asset_id":"polygon.usdc","kind":"crypto","issuer":"circle","network":"polygon","scale":6,
                 "transferable":True,"redeemable":True,"external_withdrawal":True,"valuation_source":"provider-required"},
                {"asset_id":"game.example.gold","kind":"game","issuer":"game.example","network":None,"scale":0,
                 "transferable":False,"redeemable":False,"external_withdrawal":False,"valuation_source":"issuer"},
                {"asset_id":"external.usd","kind":"external","issuer":"provider-required","network":None,"scale":2,
                 "transferable":False,"redeemable":True,"external_withdrawal":False,"valuation_source":"provider-required"},
            ):
                self._register_asset(db, item)

    @staticmethod
    def _install_accounts(db: sqlite3.Connection) -> None:
        original = db.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='wallet_postings'").fetchone()[0]
        account_check = re.search(r"CHECK\(account IN \((.*?)\)\)", original, re.S)
        if account_check is None:
            raise SpendError("unknown Wallet posting constraint")
        existing = re.findall(r"'([^']+)'", account_check[1])
        required_base = list(ACCOUNTS)
        if existing[:len(required_base)] != required_base or any(name not in required_base + list(GAME_ACCOUNTS) + list(SPEND_ACCOUNTS) for name in existing):
            raise SpendError("unknown Wallet accounts require explicit migration review")
        if all(name in existing for name in SPEND_ACCOUNTS):
            return
        old_rows = [tuple(row) for row in db.execute("SELECT * FROM wallet_postings ORDER BY id")]
        sequences = [tuple(row) for row in db.execute("SELECT rowid,name,seq FROM sqlite_sequence ORDER BY rowid")]
        objects = [row[0] for row in db.execute(
            "SELECT sql FROM sqlite_master WHERE tbl_name='wallet_postings' AND type IN ('index','trigger') AND sql IS NOT NULL ORDER BY name"
        )]
        additions = "".join(", '" + name + "'" for name in SPEND_ACCOUNTS if name not in existing)
        changed = original[:account_check.end(1)] + additions + original[account_check.end(1):]
        changed, replacements = re.subn(
            r'(?i)\bCREATE\s+TABLE\s+(?:"wallet_postings"|`wallet_postings`|\[wallet_postings\]|wallet_postings)(?=\s|\()',
            "CREATE TABLE wallet_postings_spend_v1", changed, count=1,
        )
        if replacements != 1:
            raise SpendError("unknown original Wallet posting table syntax")
        db.execute(changed)
        db.execute("INSERT INTO wallet_postings_spend_v1 SELECT * FROM wallet_postings ORDER BY id")
        db.execute("DROP TABLE wallet_postings")
        db.execute("ALTER TABLE wallet_postings_spend_v1 RENAME TO wallet_postings")
        for statement in objects:
            db.execute(statement)
        db.execute("DELETE FROM sqlite_sequence")
        db.executemany("INSERT INTO sqlite_sequence(rowid,name,seq) VALUES (?,?,?)", sequences)
        if [tuple(row) for row in db.execute("SELECT * FROM wallet_postings ORDER BY id")] != old_rows:
            raise SpendError("Wallet posting migration did not preserve existing rows")

    @staticmethod
    def _register_asset(db: sqlite3.Connection, value: dict[str, Any]) -> None:
        item = _asset(value)
        old = db.execute("SELECT * FROM value_assets WHERE asset_id=?", (item["asset_id"],)).fetchone()
        if old:
            projected = {name: old[name] for name in ASSET_SCHEMA}
            for name in ("transferable", "redeemable", "external_withdrawal"):
                projected[name] = bool(projected[name])
            if projected != item:
                raise SpendError("asset id is immutable and already has different constraints")
            return
        db.execute("INSERT INTO value_assets VALUES (?,?,?,?,?,?,?,?,?,?)", (
            item["asset_id"], item["kind"], item["issuer"], item["network"], item["scale"],
            int(item["transferable"]), int(item["redeemable"]), int(item["external_withdrawal"]),
            item["valuation_source"], _now_iso(),
        ))

    def register_asset(self, value: dict[str, Any]) -> dict[str, Any]:
        with self.wallet._transaction() as db:
            self._register_asset(db, value)
            return self._asset_row(db, value["asset_id"])

    @staticmethod
    def _asset_row(db: sqlite3.Connection, asset_id: str) -> dict[str, Any]:
        row = db.execute("SELECT * FROM value_assets WHERE asset_id=?", (_identifier(asset_id),)).fetchone()
        if row is None:
            raise SpendError("asset is not registered")
        result = dict(row)
        for name in ("transferable", "redeemable", "external_withdrawal"):
            result[name] = bool(result[name])
        return result

    def _event(self, db: sqlite3.Connection, name: str, aggregate_type: str, aggregate_id: str, payload: dict[str, Any]) -> None:
        if not (name.startswith(("spend.", "trade.", "position.", "settlement.", "risk.", "pnl.", "asset."))):
            raise SpendError("unsupported event namespace")
        if db.execute("SELECT COUNT(*) FROM value_events").fetchone()[0] >= MAX_ROWS * 16:
            raise SpendError("event capacity reached")
        db.execute("INSERT INTO value_events(id,name,aggregate_type,aggregate_id,payload_json,created_at) VALUES (?,?,?,?,?,?)",
                   (str(uuid.uuid4()), name, aggregate_type, aggregate_id, _json(payload), self._now()))

    @staticmethod
    def _policy(db: sqlite3.Connection) -> dict[str, Any]:
        result = dict(db.execute("SELECT * FROM spend_policy WHERE singleton=1").fetchone())
        for name in ("allow_policy_approval", "live_enabled", "emergency_stop"):
            result[name] = bool(result[name])
        return result

    def _risk(self, db: sqlite3.Connection, request: dict[str, Any], asset: dict[str, Any]) -> dict[str, Any]:
        policy = self._policy(db)
        reasons = []
        adapter = self.adapters.get(request["adapter_id"])
        strategy = db.execute("SELECT enabled FROM spend_strategies WHERE adapter_id=? AND strategy_id=?",
                              (request["adapter_id"], request["strategy_id"])).fetchone()
        if policy["emergency_stop"]:
            reasons.append("EMERGENCY_STOP")
        if request["expires_at"] <= self._now():
            reasons.append("PROPOSAL_EXPIRED")
        if adapter is None:
            reasons.append("ADAPTER_NOT_REGISTERED")
        elif request["mode"] not in adapter.supported_modes:
            reasons.append("MODE_NOT_SUPPORTED_BY_ADAPTER")
        if request["mode"] == "LIVE" and not policy["live_enabled"]:
            reasons.append("LIVE_DISABLED")
        if request["mode"] == "LIVE" and (request["asset_id"] != "polygon.usdc" or asset["kind"] != "crypto"):
            reasons.append("LIVE_REQUIRES_POLYGON_USDC")
        if request["mode"] != "LIVE" and request["asset_id"] != "wallet.synthetic.usd":
            reasons.append("SIMULATION_REQUIRES_ISOLATED_SYNTHETIC_ASSET")
        if asset["kind"] == "game" and not (asset["transferable"] and asset["redeemable"] and asset["external_withdrawal"]):
            reasons.append("GAME_ASSET_EXTERNAL_SPEND_FORBIDDEN")
        if strategy is None or not bool(strategy[0]):
            reasons.append("STRATEGY_DISABLED")
        if request["strategy_id"] == "smart_money":
            reasons.append("SMART_MONEY_UPSTREAM_LIVE_PATH_UNVERIFIED")
        total = request["amount_minor"] + request["estimated_fee_minor"] + request["estimated_gas_minor"]
        if total > policy["max_order_minor"]:
            reasons.append("ORDER_LIMIT")
        if request["max_slippage_bps"] > policy["max_slippage_bps"]:
            reasons.append("SLIPPAGE_LIMIT")
        exposure = db.execute("SELECT COALESCE(SUM(cost_minor+fee_minor+gas_minor),0) FROM spend_positions WHERE status='OPEN'").fetchone()[0]
        exposure += db.execute("SELECT COALESCE(SUM(held_minor),0) FROM spend_reservations WHERE state='HELD'").fetchone()[0]
        if exposure + total > policy["exposure_limit_minor"]:
            reasons.append("EXPOSURE_LIMIT")
        loss = db.execute("SELECT COALESCE(SUM(CASE WHEN realized_pnl_minor<0 THEN -realized_pnl_minor ELSE 0 END),0) FROM spend_positions WHERE status='SETTLED' AND settled_at>=?",
                          (self._now() - 86_400,)).fetchone()[0]
        if loss >= policy["daily_loss_limit_minor"]:
            reasons.append("DAILY_LOSS_LIMIT")
        available = self.wallet._balances(db)["AVAILABLE"]
        if available < total:
            reasons.append("INSUFFICIENT_AVAILABLE_BALANCE")
        return {"decision":"REJECTED" if reasons else "PASSED", "reasons":reasons, "policy":policy,
                "current_exposure_minor":exposure, "daily_realized_loss_minor":loss,
                "available_minor":available, "evaluated_at":self._now()}

    def _projection(self, db: sqlite3.Connection, proposal_id: str) -> dict[str, Any]:
        row = db.execute("SELECT * FROM spend_proposals WHERE id=?", (_identifier(proposal_id),)).fetchone()
        if row is None:
            raise SpendError("spend proposal not found")
        approval = db.execute("SELECT * FROM spend_approvals WHERE proposal_id=?", (proposal_id,)).fetchone()
        reservation = db.execute("SELECT * FROM spend_reservations WHERE proposal_id=?", (proposal_id,)).fetchone()
        receipt = db.execute("SELECT * FROM spend_receipts WHERE proposal_id=?", (proposal_id,)).fetchone()
        request = _load(row["request_json"])
        request["proposal_id"] = row["id"]
        result = {"proposal":request, "proposal_digest":row["proposal_digest"], "status":row["status"],
                  "quote":_load(row["quote_json"]), "risk":_load(row["risk_json"]),
                  "approval":dict(approval) if approval else None, "reservation":dict(reservation) if reservation else None,
                  "receipt":_load(receipt["receipt_json"]) if receipt else None,
                  "reconciliation":_load(receipt["reconciliation_json"]) if receipt else None}
        return result

    def propose(self, value: dict[str, Any], key: str) -> dict[str, Any]:
        now = self._now(); request = _proposal(value, now); payload = {"proposal":request}
        with self.wallet._transaction() as db:
            old = self.wallet._cached(db, key, "spend.propose", payload)
            if old is not None:
                return old
            if db.execute("SELECT COUNT(*) FROM spend_proposals").fetchone()[0] >= MAX_ROWS:
                raise SpendError("spend proposal capacity reached")
            asset = self._asset_row(db, request["asset_id"])
            adapter = self.adapters.get(request["adapter_id"])
            quote = adapter.quote(request) if adapter else {"adapter_id":request["adapter_id"], "unavailable":True}
            risk = self._risk(db, request, asset)
            proposal_id = str(uuid.uuid4()); request_with_id = {**request, "proposal_id":proposal_id}
            proposal_digest = digest({"request":request_with_id, "quote":quote, "risk":risk})
            status = "PROPOSED" if risk["decision"] == "PASSED" else "REJECTED"
            db.execute("INSERT INTO spend_proposals VALUES (?,?,?,?,?,?,?,NULL,0,NULL,?,?)",
                       (proposal_id, digest(request), _json(request), proposal_digest, _json(quote), _json(risk), status, now, now))
            event = {"proposal_id":proposal_id, "proposal_digest":proposal_digest, "mode":request["mode"],
                     "asset_id":request["asset_id"], "amount_minor":request["amount_minor"], "adapter_id":request["adapter_id"]}
            self._event(db, "spend.proposed", "spend", proposal_id, event)
            self._event(db, "trade.proposed", "trade", proposal_id, event)
            self._event(db, "risk.checked", "spend", proposal_id, risk)
            if status == "REJECTED":
                self._event(db, "spend.rejected", "spend", proposal_id, {**event, "reasons":risk["reasons"]})
                self._event(db, "trade.rejected", "trade", proposal_id, {"reasons":risk["reasons"]})
            result = self._projection(db, proposal_id)
            return self.wallet._remember(db, key, "spend.propose", payload, result)

    def approve(self, proposal_id: str, proposal_digest: str, *, approval_type: str,
                approver: str, decision: bool, key: str) -> dict[str, Any]:
        payload = {"proposal_id":_identifier(proposal_id), "proposal_digest":_identifier(proposal_digest),
                   "approval_type":approval_type, "approver":_identifier(approver), "decision":decision}
        if approval_type not in ("USER", "POLICY") or type(decision) is not bool:
            raise SpendError("explicit USER or POLICY approval decision required")
        with self.wallet._transaction() as db:
            old = self.wallet._cached(db, key, "spend.approve", payload)
            if old is not None:
                return old
            row = db.execute("SELECT * FROM spend_proposals WHERE id=?", (proposal_id,)).fetchone()
            if row is None or row["status"] != "PROPOSED" or row["proposal_digest"] != proposal_digest:
                raise SpendError("exact active proposal digest required")
            request = _load(row["request_json"]); policy = self._policy(db)
            if approval_type == "USER" and approver != request["owner_id"]:
                raise SpendError("USER approval must match the proposal owner")
            if approval_type == "POLICY" and (request["mode"] != "SIMULATION" or not policy["allow_policy_approval"]):
                raise SpendError("policy approval is limited to explicitly enabled SIMULATION")
            approval_id = str(uuid.uuid4()); label = "APPROVED" if decision else "REJECTED"; now = self._now()
            db.execute("INSERT INTO spend_approvals VALUES (?,?,?,?,?,?,?)",
                       (approval_id, proposal_id, approval_type, approver, proposal_digest, label, now))
            db.execute("UPDATE spend_proposals SET status=?,updated_at=? WHERE id=?",
                       ("APPROVED" if decision else "REJECTED", now, proposal_id))
            event = {"proposal_id":proposal_id, "proposal_digest":proposal_digest, "approval_id":approval_id,
                     "approval_type":approval_type, "approver":approver}
            self._event(db, "spend.approved" if decision else "spend.rejected", "spend", proposal_id, event)
            self._event(db, "trade.approved" if decision else "trade.rejected", "trade", proposal_id, event)
            result = self._projection(db, proposal_id)
            return self.wallet._remember(db, key, "spend.approve", payload, result)

    def _reserve(self, db: sqlite3.Connection, row: sqlite3.Row, execution_key: str) -> None:
        request = _load(row["request_json"]); total = request["amount_minor"] + request["estimated_fee_minor"] + request["estimated_gas_minor"]
        if self.wallet._balances(db)["AVAILABLE"] < total:
            raise InsufficientFunds("insufficient available synthetic balance for spend reservation")
        journal = self.wallet._post(db, "spend.reserve", row["id"], "AVAILABLE", "SPEND_HOLD", total)
        db.execute("INSERT INTO spend_reservations(proposal_id,principal_minor,max_fee_minor,max_gas_minor,held_minor,state,reserve_journal_id) VALUES (?,?,?,?,?,'HELD',?)",
                   (row["id"], request["amount_minor"], request["estimated_fee_minor"], request["estimated_gas_minor"], total, journal))
        db.execute("UPDATE spend_proposals SET status='EXECUTING',execution_key=?,updated_at=? WHERE id=?",
                   (execution_key, self._now(), row["id"]))

    def _release(self, db: sqlite3.Connection, proposal_id: str, status: str, reason: str) -> None:
        reservation = db.execute("SELECT * FROM spend_reservations WHERE proposal_id=?", (proposal_id,)).fetchone()
        if reservation is not None and reservation["state"] == "HELD":
            amount = reservation["held_minor"]
            self.wallet._post(db, "spend.release", proposal_id, "SPEND_HOLD", "AVAILABLE", amount)
            db.execute("UPDATE spend_reservations SET held_minor=0,released_minor=?,state='RELEASED' WHERE proposal_id=?",
                       (amount, proposal_id))
        db.execute("UPDATE spend_proposals SET status=?,updated_at=? WHERE id=?", (status, self._now(), proposal_id))
        self._event(db, "spend.rejected", "spend", proposal_id, {"reason":reason})
        self._event(db, "trade.rejected", "trade", proposal_id, {"reason":reason})

    def _validate_receipt(self, request: dict[str, Any], receipt: dict[str, Any]) -> None:
        required = {"schema","receipt_id","proposal_id","adapter_id","mode","state","market_id","outcome",
                    "fill_price_micros","quantity_micros","principal_minor","fee_minor","gas_minor",
                    "external_order_id","financial_transaction","simulation_only"}
        if type(receipt) is not dict or set(receipt) != required or receipt["schema"] != "rock-polymarket-execution-receipt/1":
            raise OutcomeUnknown("adapter returned an invalid receipt")
        if receipt["proposal_id"] != request["proposal_id"] or receipt["adapter_id"] != request["adapter_id"] or receipt["mode"] != request["mode"]:
            raise OutcomeUnknown("adapter receipt binding mismatch")
        if receipt["state"] != "EXECUTED" or receipt["market_id"] != request["market_id"] or receipt["outcome"] != request["outcome"]:
            raise OutcomeUnknown("adapter execution state mismatch")
        if receipt["principal_minor"] != request["amount_minor"] or not 0 <= receipt["fee_minor"] <= request["estimated_fee_minor"] or not 0 <= receipt["gas_minor"] <= request["estimated_gas_minor"]:
            raise OutcomeUnknown("adapter costs exceed the exact reservation")
        slippage = abs(receipt["fill_price_micros"] - request["limit_price_micros"]) * 10_000 // request["limit_price_micros"]
        if slippage > request["max_slippage_bps"]:
            raise OutcomeUnknown("fill exceeded approved slippage")
        if request["mode"] != "LIVE" and (receipt["financial_transaction"] is not False or receipt["simulation_only"] is not True or receipt["external_order_id"] is not None):
            raise OutcomeUnknown("simulation receipt claimed an external financial transaction")
        _identifier(receipt["receipt_id"]); _ppm(receipt["fill_price_micros"])
        if type(receipt["quantity_micros"]) is not int or receipt["quantity_micros"] <= 0:
            raise OutcomeUnknown("invalid filled quantity")

    def _commit(self, db: sqlite3.Connection, row: sqlite3.Row, receipt: dict[str, Any], *, reconciled: dict[str, Any] | None = None) -> None:
        proposal_id = row["id"]; reservation = db.execute("SELECT * FROM spend_reservations WHERE proposal_id=?", (proposal_id,)).fetchone()
        if reservation is None or reservation["state"] != "HELD":
            raise SpendError("active spend hold required")
        principal, fee, gas = receipt["principal_minor"], receipt["fee_minor"], receipt["gas_minor"]
        committed = principal + fee + gas; release = reservation["held_minor"] - committed
        self.wallet._post(db, "spend.commit", proposal_id, "SPEND_HOLD", "SPEND_COMMITTED", principal)
        if fee:
            self.wallet._post(db, "spend.fee", proposal_id, "SPEND_HOLD", "SPEND_FEES", fee)
        if gas:
            self.wallet._post(db, "spend.gas", proposal_id, "SPEND_HOLD", "SPEND_GAS", gas)
        if release:
            self.wallet._post(db, "spend.release", proposal_id, "SPEND_HOLD", "AVAILABLE", release)
        db.execute("UPDATE spend_reservations SET actual_fee_minor=?,actual_gas_minor=?,held_minor=0,committed_minor=?,released_minor=?,state='COMMITTED' WHERE proposal_id=?",
                   (fee, gas, committed, release, proposal_id))
        if db.execute("SELECT 1 FROM spend_receipts WHERE proposal_id=?", (proposal_id,)).fetchone() is None:
            db.execute("INSERT INTO spend_receipts VALUES (?,?,?,?,?,?)", (proposal_id, receipt["receipt_id"], receipt["adapter_id"], _json(receipt),
                       _json(reconciled) if reconciled else None, self._now() if reconciled else None))
        request = _load(row["request_json"])
        position_id = str(uuid.uuid4())
        db.execute("INSERT INTO spend_positions VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                   (position_id, proposal_id, request["asset_id"], request["market_id"], request["outcome"], receipt["quantity_micros"],
                    principal, fee, gas, receipt["fill_price_micros"], receipt["fill_price_micros"], "OPEN", None, self._now(), None))
        db.execute("UPDATE spend_proposals SET status=?,updated_at=? WHERE id=?",
                   ("RECONCILED" if reconciled else "EXECUTED", self._now(), proposal_id))
        event = {"proposal_id":proposal_id, "receipt_id":receipt["receipt_id"], "position_id":position_id,
                 "principal_minor":principal, "fee_minor":fee, "gas_minor":gas, "financial_transaction":False}
        self._event(db, "spend.executed", "spend", proposal_id, event)
        self._event(db, "trade.executed", "trade", proposal_id, event)
        self._event(db, "position.opened", "position", position_id, event)
        self._event(db, "settlement.pending", "position", position_id, {"market_id":request["market_id"]})
        self._event(db, "pnl.updated", "position", position_id, {"realized_minor":0,"unrealized_minor":-(fee+gas),"asset_id":request["asset_id"]})
        if reconciled:
            self._event(db, "settlement.reconciled", "spend", proposal_id, reconciled)

    def execute(self, proposal_id: str, key: str) -> dict[str, Any]:
        payload = {"proposal_id":_identifier(proposal_id)}
        with self.wallet._transaction() as db:
            old = self.wallet._cached(db, key, "spend.execute", payload)
            if old is not None:
                return old
            row = db.execute("SELECT * FROM spend_proposals WHERE id=?", (proposal_id,)).fetchone()
            if row is None or row["status"] not in ("APPROVED", "EXECUTING"):
                raise SpendError("approved spend proposal required")
            if row["status"] == "EXECUTING":
                if row["execution_key"] != key:
                    raise SpendError("in-flight spend is bound to a different execution key")
                if row["provider_claimed"]:
                    db.execute("UPDATE spend_proposals SET status='UNKNOWN',updated_at=? WHERE id=?",
                               (self._now(), proposal_id))
                    self._event(db, "spend.execution_unknown", "spend", proposal_id,
                                {"reason":"RECOVERED_AFTER_PROVIDER_CLAIM","hold_retained":True})
                    self._event(db, "risk.reconciliation_required", "spend", proposal_id,
                                {"hold_retained":True})
                    result = self._projection(db, proposal_id)
                    return self.wallet._remember(db, key, "spend.execute", payload, result)
            request = _load(row["request_json"]); asset = self._asset_row(db, request["asset_id"]); risk = self._risk(db, request, asset)
            if risk["decision"] != "PASSED":
                self._release(db, proposal_id, "REJECTED", ",".join(risk["reasons"]))
                result = self._projection(db, proposal_id)
                return self.wallet._remember(db, key, "spend.execute", payload, result)
            if row["status"] == "APPROVED":
                self._reserve(db, row, key)
            self._event(db, "risk.checked", "spend", proposal_id, risk)
        with self.wallet._transaction() as db:
            row = db.execute("SELECT * FROM spend_proposals WHERE id=?", (proposal_id,)).fetchone()
            request = _load(row["request_json"]); request["proposal_id"] = proposal_id
            approval = dict(db.execute("SELECT * FROM spend_approvals WHERE proposal_id=?", (proposal_id,)).fetchone())
            authorization_payload = {"proposal_id":proposal_id,"proposal_digest":row["proposal_digest"],
                                     "approval_id":approval["id"],"execution_key":key,"mode":request["mode"]}
            handle = self.vault.resolve(self.adapters[request["adapter_id"]].secret_reference(request["mode"]))
            authorization = self.signer.sign(handle, authorization_payload)
            db.execute("UPDATE spend_proposals SET provider_claimed=1,authorization_json=?,updated_at=? WHERE id=? AND provider_claimed=0",
                       (_json(authorization), self._now(), proposal_id))
            self._event(db, "trade.submitted", "trade", proposal_id,
                        {"authorization_digest":digest(authorization),"secret_material_exposed":False})
            quote = _load(row["quote_json"]); adapter = self.adapters[request["adapter_id"]]
        try:
            receipt = adapter.execute(request, quote, authorization)
            self._validate_receipt(request, receipt)
        except AdapterRejected as error:
            with self.wallet._transaction() as db:
                self._release(db, proposal_id, "REJECTED", str(error)[:200])
                result = self._projection(db, proposal_id)
                return self.wallet._remember(db, key, "spend.execute", payload, result)
        except Exception as error:
            with self.wallet._transaction() as db:
                db.execute("UPDATE spend_proposals SET status='UNKNOWN',updated_at=? WHERE id=?", (self._now(), proposal_id))
                self._event(db, "spend.execution_unknown", "spend", proposal_id,
                            {"reason":type(error).__name__,"hold_retained":True})
                self._event(db, "risk.reconciliation_required", "spend", proposal_id, {"hold_retained":True})
                result = self._projection(db, proposal_id)
                return self.wallet._remember(db, key, "spend.execute", payload, result)
        with self.wallet._transaction() as db:
            row = db.execute("SELECT * FROM spend_proposals WHERE id=?", (proposal_id,)).fetchone()
            self._commit(db, row, receipt)
            result = self._projection(db, proposal_id)
            return self.wallet._remember(db, key, "spend.execute", payload, result)

    def reconcile(self, proposal_id: str, key: str) -> dict[str, Any]:
        payload = {"proposal_id":_identifier(proposal_id)}
        with self.wallet._transaction() as db:
            old = self.wallet._cached(db, key, "spend.reconcile", payload)
            if old is not None:
                return old
            row = db.execute("SELECT * FROM spend_proposals WHERE id=?", (proposal_id,)).fetchone()
            if row is None or row["status"] not in ("UNKNOWN", "EXECUTED", "RECONCILED"):
                raise SpendError("only sent or executed spend can be reconciled")
            if row["status"] == "RECONCILED":
                result = self._projection(db, proposal_id)
                return self.wallet._remember(db, key, "spend.reconcile", payload, result)
            request = _load(row["request_json"]); request["proposal_id"] = proposal_id
            execution_key = row["execution_key"]
            adapter = self.adapters[request["adapter_id"]]
        outcome = adapter.reconcile(request, execution_key)
        with self.wallet._transaction() as db:
            row = db.execute("SELECT * FROM spend_proposals WHERE id=?", (proposal_id,)).fetchone()
            if row["status"] == "UNKNOWN" and outcome.get("state") == "EXECUTED":
                receipt = outcome.get("receipt")
                self._validate_receipt(request, receipt)
                self._commit(db, row, receipt, reconciled={k:v for k,v in outcome.items() if k != "receipt"})
            elif row["status"] == "UNKNOWN" and outcome.get("state") == "REJECTED":
                self._release(db, proposal_id, "REJECTED", "adapter reconciliation confirmed no execution")
                self._event(db, "settlement.reconciled", "spend", proposal_id, outcome)
            elif row["status"] == "UNKNOWN" and outcome.get("state") == "UNKNOWN":
                self._event(db, "risk.reconciliation_required", "spend", proposal_id, {"hold_retained":True})
            elif row["status"] == "EXECUTED" and outcome.get("state") == "EXECUTED":
                receipt = outcome.get("receipt")
                self._validate_receipt(request, receipt)
                stored = db.execute("SELECT * FROM spend_receipts WHERE proposal_id=?", (proposal_id,)).fetchone()
                if stored is None or _load(stored["receipt_json"]) != receipt:
                    raise SpendError("reconciliation receipt differs from immutable execution receipt")
                db.execute("UPDATE spend_receipts SET reconciliation_json=?,reconciled_at=? WHERE proposal_id=?",
                           (_json({k:v for k,v in outcome.items() if k != "receipt"}), self._now(), proposal_id))
                db.execute("UPDATE spend_proposals SET status='RECONCILED',updated_at=? WHERE id=?", (self._now(), proposal_id))
                self._event(db, "settlement.reconciled", "spend", proposal_id, {k:v for k,v in outcome.items() if k != "receipt"})
            elif row["status"] != "RECONCILED":
                raise SpendError("invalid reconciliation outcome")
            result = self._projection(db, proposal_id)
            return self.wallet._remember(db, key, "spend.reconcile", payload, result)

    def mark_position(self, position_id: str, mark_price_micros: int, key: str) -> dict[str, Any]:
        payload = {"position_id":_identifier(position_id),"mark_price_micros":_ppm(mark_price_micros)}
        with self.wallet._transaction() as db:
            old = self.wallet._cached(db, key, "position.mark", payload)
            if old is not None:
                return old
            row = db.execute("SELECT * FROM spend_positions WHERE id=?", (position_id,)).fetchone()
            if row is None or row["status"] != "OPEN":
                raise SpendError("open position required")
            db.execute("UPDATE spend_positions SET mark_price_micros=? WHERE id=?", (mark_price_micros, position_id))
            result = self._position(dict(db.execute("SELECT * FROM spend_positions WHERE id=?", (position_id,)).fetchone()))
            self._event(db, "position.updated", "position", position_id, result)
            self._event(db, "pnl.updated", "position", position_id,
                        {"asset_id":result["asset_id"],"unrealized_minor":result["unrealized_pnl_minor"],"realized_minor":0})
            return self.wallet._remember(db, key, "position.mark", payload, result)

    def settle_position(self, position_id: str, payout_price_micros: int, key: str) -> dict[str, Any]:
        payload = {"position_id":_identifier(position_id),"payout_price_micros":_ppm(payout_price_micros)}
        with self.wallet._transaction() as db:
            old = self.wallet._cached(db, key, "position.settle", payload)
            if old is not None:
                return old
            row = db.execute("SELECT * FROM spend_positions WHERE id=?", (position_id,)).fetchone()
            if row is None or row["status"] != "OPEN":
                raise SpendError("open position required")
            payout_minor = row["quantity_micros"] * payout_price_micros // 10_000_000_000
            realized = payout_minor - row["cost_minor"] - row["fee_minor"] - row["gas_minor"]
            if payout_minor:
                self.wallet._post(db, "settlement.payout", position_id, "SALE_CLEARING", "AVAILABLE", payout_minor)
            db.execute("UPDATE spend_positions SET mark_price_micros=?,status='SETTLED',realized_pnl_minor=?,settled_at=? WHERE id=?",
                       (payout_price_micros, realized, self._now(), position_id))
            result = self._position(dict(db.execute("SELECT * FROM spend_positions WHERE id=?", (position_id,)).fetchone()))
            self._event(db, "settlement.executed", "position", position_id,
                        {"payout_minor":payout_minor,"payout_price_micros":payout_price_micros,"simulation_only":True})
            self._event(db, "position.closed", "position", position_id, result)
            self._event(db, "pnl.realized", "position", position_id,
                        {"asset_id":result["asset_id"],"realized_minor":realized,"unrealized_minor":0})
            return self.wallet._remember(db, key, "position.settle", payload, result)

    @staticmethod
    def _position(row: dict[str, Any]) -> dict[str, Any]:
        mark_value = row["quantity_micros"] * row["mark_price_micros"] // 10_000_000_000
        result = dict(row)
        result["unrealized_pnl_minor"] = 0 if row["status"] == "SETTLED" else mark_value - row["cost_minor"] - row["fee_minor"] - row["gas_minor"]
        return result

    def configure_risk(self, limits: dict[str, Any], key: str) -> dict[str, Any]:
        if type(limits) is not dict or set(limits) != {"max_order_minor","daily_loss_limit_minor","exposure_limit_minor","max_slippage_bps"}:
            raise SpendError("exact risk limit fields required")
        for name in ("max_order_minor","daily_loss_limit_minor","exposure_limit_minor"):
            _minor(limits[name])
        if type(limits["max_slippage_bps"]) is not int or not 0 <= limits["max_slippage_bps"] <= 10_000:
            raise SpendError("invalid slippage limit")
        payload = {"limits":limits}
        with self.wallet._transaction() as db:
            old = self.wallet._cached(db, key, "risk.configure", payload)
            if old is not None:
                return old
            db.execute("UPDATE spend_policy SET max_order_minor=?,daily_loss_limit_minor=?,exposure_limit_minor=?,max_slippage_bps=? WHERE singleton=1",
                       tuple(limits[name] for name in ("max_order_minor","daily_loss_limit_minor","exposure_limit_minor","max_slippage_bps")))
            result = self._policy(db)
            self._event(db, "risk.policy_updated", "risk", "global", result)
            return self.wallet._remember(db, key, "risk.configure", payload, result)

    def set_strategy(self, adapter_id: str, strategy_id: str, enabled: bool, key: str) -> dict[str, Any]:
        payload = {"adapter_id":_identifier(adapter_id),"strategy_id":_identifier(strategy_id),"enabled":enabled}
        if type(enabled) is not bool or adapter_id not in self.adapters:
            raise SpendError("registered adapter and boolean strategy state required")
        if strategy_id == "smart_money" and enabled:
            raise SpendError("Smart Money remains disabled until its upstream live path and PnL evidence are complete")
        with self.wallet._transaction() as db:
            old = self.wallet._cached(db, key, "strategy.set", payload)
            if old is not None:
                return old
            if db.execute("SELECT 1 FROM spend_strategies WHERE adapter_id=? AND strategy_id=?", (adapter_id,strategy_id)).fetchone() is None:
                raise SpendError("strategy is not registered")
            db.execute("UPDATE spend_strategies SET enabled=? WHERE adapter_id=? AND strategy_id=?", (int(enabled),adapter_id,strategy_id))
            result = {**payload,"enabled":enabled}
            self._event(db, "risk.strategy_updated", "strategy", strategy_id, result)
            return self.wallet._remember(db, key, "strategy.set", payload, result)

    def emergency_stop(self, stopped: bool, key: str) -> dict[str, Any]:
        if type(stopped) is not bool:
            raise SpendError("emergency stop state must be boolean")
        payload = {"stopped":stopped}
        with self.wallet._transaction() as db:
            old = self.wallet._cached(db, key, "risk.emergency_stop", payload)
            if old is not None:
                return old
            db.execute("UPDATE spend_policy SET emergency_stop=? WHERE singleton=1", (int(stopped),))
            result = {"emergency_stop":stopped,"new_spend_blocked":stopped,"existing_receipts_retained":True}
            self._event(db, "risk.emergency_stop" if stopped else "risk.emergency_resumed", "risk", "global", result)
            return self.wallet._remember(db, key, "risk.emergency_stop", payload, result)

    def events(self, *, prefix: str = "", limit: int = 100) -> list[dict[str, Any]]:
        if type(prefix) is not str or len(prefix) > 40 or type(limit) is not int or not 1 <= limit <= 500:
            raise SpendError("bounded event prefix and limit required")
        with closing(self.wallet._connect()) as db:
            rows = db.execute("SELECT * FROM value_events WHERE name LIKE ? ORDER BY seq DESC LIMIT ?", (prefix + "%", limit)).fetchall()
            return [{**dict(row),"payload":_load(row["payload_json"])} for row in rows]

    def snapshot(self) -> dict[str, Any]:
        with closing(self.wallet._connect()) as db:
            self.wallet._verify(db)
            balances = self.wallet._balances(db)
            assets = [self._asset_row(db, row["asset_id"]) for row in db.execute("SELECT asset_id FROM value_assets ORDER BY asset_id")]
            positions = [self._position(dict(row)) for row in db.execute("SELECT * FROM spend_positions ORDER BY created_at DESC")]
            pnl: dict[str, dict[str, int]] = {}
            for position in positions:
                item = pnl.setdefault(position["asset_id"], {"realized_minor":0,"unrealized_minor":0})
                item["realized_minor"] += position["realized_pnl_minor"] or 0
                item["unrealized_minor"] += position["unrealized_pnl_minor"]
            strategies = [{"adapter_id":row["adapter_id"],"strategy_id":row["strategy_id"],"enabled":bool(row["enabled"])}
                          for row in db.execute("SELECT * FROM spend_strategies ORDER BY adapter_id,strategy_id")]
            proposals = [self._projection(db, row["id"]) for row in db.execute("SELECT id FROM spend_proposals ORDER BY created_at DESC LIMIT 100")]
            return {
                "schema":"rock-value-spend-state/1", "modes":{"SIMULATION":True,"PAPER":True,"LIVE":False},
                "live_enabled":False, "assets":assets,
                "asset_balances":{
                    "wallet.synthetic.usd":{"available_minor":balances["AVAILABLE"],"held_minor":balances["SPEND_HOLD"],"simulation_only":True},
                    "polygon.usdc":{"status":"NOT_CONNECTED","available_minor":None,"positions_verified":False},
                },
                "spend_accounts":{name:balances[name] for name in SPEND_ACCOUNTS},
                "policy":self._policy(db), "strategies":strategies, "proposals":proposals,
                "positions":positions, "pnl_by_asset":pnl,
                "fees_minor":balances["SPEND_FEES"], "gas_minor":balances["SPEND_GAS"],
                "adapters":[{"adapter_id":item.adapter_id,"supported_modes":list(item.supported_modes),"upstream":item.upstream}
                            for item in self.adapters.values()],
                "simulation_only":True,
            }

    def command(self, request: dict[str, Any]) -> Any:
        """Strict shared command contract for the unified Hub/MCP entry."""
        if type(request) is not dict or type(request.get("v")) is not int or request.get("v") != 1 or type(request.get("op")) is not str:
            raise SpendError("Hub/MCP command version 1 required")
        op = request["op"]
        fields = {
            "asset.list":set(), "spend.snapshot":set(), "spend.propose":{"key","proposal"},
            "spend.approve":{"key","proposal_id","proposal_digest","approval_type","approver","decision"},
            "spend.execute":{"key","proposal_id"}, "spend.reconcile":{"key","proposal_id"},
            "spend.get":{"proposal_id"}, "event.list":{"prefix","limit"},
            "position.mark":{"key","position_id","mark_price_micros"},
            "settlement.record":{"key","position_id","payout_price_micros"},
            "risk.configure":{"key","limits"}, "risk.emergency_stop":{"key","stopped"},
            "strategy.set":{"key","adapter_id","strategy_id","enabled"},
        }
        if op not in fields or set(request) != {"v","op"} | fields[op]:
            raise SpendError("unknown Hub/MCP command or fields")
        if op == "asset.list": return self.snapshot()["assets"]
        if op == "spend.snapshot": return self.snapshot()
        if op == "spend.propose": return self.propose(request["proposal"], request["key"])
        if op == "spend.approve": return self.approve(request["proposal_id"],request["proposal_digest"],approval_type=request["approval_type"],approver=request["approver"],decision=request["decision"],key=request["key"])
        if op == "spend.execute": return self.execute(request["proposal_id"],request["key"])
        if op == "spend.reconcile": return self.reconcile(request["proposal_id"],request["key"])
        if op == "spend.get":
            with closing(self.wallet._connect()) as db: return self._projection(db,request["proposal_id"])
        if op == "event.list": return self.events(prefix=request["prefix"],limit=request["limit"])
        if op == "position.mark": return self.mark_position(request["position_id"],request["mark_price_micros"],request["key"])
        if op == "settlement.record": return self.settle_position(request["position_id"],request["payout_price_micros"],request["key"])
        if op == "risk.configure": return self.configure_risk(request["limits"],request["key"])
        if op == "risk.emergency_stop": return self.emergency_stop(request["stopped"],request["key"])
        return self.set_strategy(request["adapter_id"],request["strategy_id"],request["enabled"],request["key"])

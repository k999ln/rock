"""Cardless ATM SIMULATOR ONLY, sharing the existing Wallet journal.

The caller supplies membership-derived context outside request JSON. Public
ATM fixture tokens authenticate only a local test actor; they are not secrets
or production credentials. No network transport or physical dispenser exists.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import hashlib
import hmac
import math
import os
import re
import secrets
import stat
import time
from types import MappingProxyType
import uuid

from blackberryrock.wallet import InsufficientFunds, Wallet, WalletError


TTL_SECONDS = 300
MAX_ISSUE_MINOR = 50_000
STEP_MINOR = 1_000
PUBLIC_ATM_FIXTURES = MappingProxyType({
    "SIM-ATM-001": ("PUBLIC-ATM-ACTOR-001", "PUBLIC-FIXTURE-ATM-001-TOKEN-v1"),
    "SIM-ATM-002": ("PUBLIC-ATM-ACTOR-002", "PUBLIC-FIXTURE-ATM-002-TOKEN-v1"),
})
TERMINAL = frozenset(("CANCELED", "EXPIRED", "DISPENSED", "REVERSED", "PARTIAL_REVERSED"))
ID = re.compile(r"[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}\Z")
KEY = re.compile(r"[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}\Z")
CODE = re.compile(r"[A-Za-z0-9_-]{32}\Z")


class ATMError(WalletError):
    pass


class AuthenticationError(ATMError):
    pass


@dataclass(frozen=True)
class TrustedWalletContext:
    """Construct only after the caller authenticates protected membership.

    This object is an integration boundary, not independent identity proof.
    An expired member may resolve their existing holds but cannot issue anew.
    """
    owner_id: str
    device_id: str
    eligible_for_new_withdrawals: bool


@dataclass(frozen=True)
class ATMActor:
    actor_id: str
    token: str


def _identifier(value):
    if not isinstance(value, str) or not ID.fullmatch(value):
        raise ATMError("invalid simulator identifier")
    return value


def _key(value):
    if not isinstance(value, str) or not KEY.fullmatch(value):
        raise ATMError("invalid simulator idempotency key")
    return value


def _amount(value, *, issue=False):
    if type(value) is not int or not 0 <= value <= MAX_ISSUE_MINOR:
        raise ATMError("amount must be integer USD cents within simulator limits")
    if issue and (value < STEP_MINOR or value % STEP_MINOR):
        raise ATMError("issue amount must be USD 1000-cent increments, at most 50000 cents")
    return value


def _code_hash(code):
    if not isinstance(code, str) or not CODE.fullmatch(code):
        raise AuthenticationError("invalid simulator credential")
    return hashlib.sha256(code.encode("ascii")).hexdigest()


def _stamp(now):
    return datetime.fromtimestamp(now, timezone.utc).isoformat()


class CardlessATMSimulator:
    """Atomic credential/hold transitions inside Wallet._transaction.

    All methods are local. Existing Wallet.reserve/reconcile remain outside
    this module's authentication boundary and must not be exposed as bypasses.

    Optional device_authorizer(account_id, device_ref) must return exactly True
    for a currently eligible registered device of that immutable account. The
    caller must hold its membership admission guard throughout each owner call.
    This permits replacement-device recovery without rewriting the primary
    device, withdrawal origins or immutable idempotency receipts. Without the
    callback, the original strict account-and-device binding remains in force.
    """
    def __init__(self, wallet: Wallet, *, clock=time.time, max_credentials=10_000,
                 device_authorizer=None, redemption_authorizer=None):
        if not isinstance(wallet, Wallet):
            raise ATMError("an existing Wallet instance is required")
        if type(max_credentials) is not int or not 1 <= max_credentials <= 10_000:
            raise ATMError("invalid credential retention limit")
        if device_authorizer is not None and not callable(device_authorizer):
            raise ATMError("device authorizer must be callable")
        if redemption_authorizer is not None and not callable(redemption_authorizer):
            raise ATMError("redemption authorizer must be callable")
        self.wallet, self.clock, self.max_credentials = wallet, clock, max_credentials
        self.device_authorizer = device_authorizer
        self.redemption_authorizer = redemption_authorizer
        self._private_storage()
        # executescript would implicitly commit: use individual statements in
        # the same existing Wallet transaction instead.
        with self.wallet._transaction() as connection:
            connection.execute("""CREATE TABLE IF NOT EXISTS atm_wallet_binding (
                singleton INTEGER PRIMARY KEY CHECK(singleton = 1),
                owner_id TEXT NOT NULL, device_id TEXT NOT NULL
            )""")
            connection.execute("""CREATE TABLE IF NOT EXISTS atm_credentials (
                withdrawal_id TEXT PRIMARY KEY REFERENCES wallet_withdrawals(id),
                owner_id TEXT NOT NULL, device_id TEXT NOT NULL, atm_id TEXT NOT NULL,
                code_sha256 TEXT NOT NULL UNIQUE,
                issued_at REAL NOT NULL, expires_at REAL NOT NULL,
                state TEXT NOT NULL CHECK(state IN ('ISSUED', 'AUTHORIZED_NOT_DISPENSED',
                    'UNKNOWN', 'PARTIAL_DISPENSED', 'CANCELED', 'EXPIRED',
                    'DISPENSED', 'REVERSED', 'PARTIAL_REVERSED')),
                consumed_at REAL, consumed_by TEXT, updated_at REAL NOT NULL,
                CHECK(expires_at = issued_at + 300),
                CHECK((consumed_at IS NULL) = (consumed_by IS NULL))
            )""")
            connection.execute("CREATE INDEX IF NOT EXISTS atm_credentials_expiry ON atm_credentials(state, expires_at)")

    def _private_storage(self):
        parent = self.wallet.path.parent.stat()
        if parent.st_uid != os.getuid() or stat.S_IMODE(parent.st_mode) & 0o077:
            raise ATMError("Wallet parent directory must be owned and private (0700)")
        for path in (self.wallet.path, self.wallet.path.with_name(self.wallet.path.name + "-wal"),
                     self.wallet.path.with_name(self.wallet.path.name + "-shm")):
            try:
                info = path.lstat()
            except FileNotFoundError:
                continue
            if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid():
                raise ATMError("Wallet storage must be an owned regular file")
            path.chmod(0o600)

    def _now(self):
        value = self.clock()
        if type(value) not in (int, float) or not math.isfinite(value) or not 0 <= value < 253402300799:
            raise ATMError("invalid simulator clock")
        return float(value)

    def _context(self, context, *, issue=False):
        if type(context) is not TrustedWalletContext:
            raise AuthenticationError("protected membership context is required")
        _identifier(context.owner_id)
        _identifier(context.device_id)
        if type(context.eligible_for_new_withdrawals) is not bool:
            raise AuthenticationError("invalid membership eligibility")
        # Recheck even reads and cached retries. A formerly valid context alone
        # cannot authorize a revoked device or disclose its issuance receipt.
        if (self.device_authorizer is not None
                and self.device_authorizer(context.owner_id, context.device_id) is not True):
            raise AuthenticationError("current registered device eligibility is required")
        if issue and not context.eligible_for_new_withdrawals:
            raise AuthenticationError("membership does not permit a new withdrawal")
        return {"owner_id": context.owner_id, "device_id": context.device_id}

    @staticmethod
    def _actor(actor, atm_id):
        fixture = PUBLIC_ATM_FIXTURES.get(_identifier(atm_id))
        if (type(actor) is not ATMActor or fixture is None or not isinstance(actor.actor_id, str)
                or not isinstance(actor.token, str) or not actor.actor_id.isascii() or not actor.token.isascii()
                or len(actor.actor_id) > 80 or len(actor.token) > 160
                or not hmac.compare_digest(actor.actor_id, fixture[0])
                or not hmac.compare_digest(actor.token, fixture[1])):
            raise AuthenticationError("ATM fixture authentication failed")
        return actor.actor_id

    def _belongs(self, row, context):
        return (row["owner_id"] == context.owner_id
                and (self.device_authorizer is not None or row["device_id"] == context.device_id))

    def _owner_filter(self, context):
        if self.device_authorizer is not None:
            return "owner_id = ?", (context.owner_id,)
        return "owner_id = ? AND device_id = ?", (context.owner_id, context.device_id)

    def _binding(self, connection, context, *, create=False):
        row = connection.execute("SELECT * FROM atm_wallet_binding WHERE singleton = 1").fetchone()
        if row is None:
            if create:
                connection.execute("INSERT INTO atm_wallet_binding VALUES (1, ?, ?)",
                                   (context.owner_id, context.device_id))
            return
        if not self._belongs(row, context):
            raise AuthenticationError("membership context does not own this simulator wallet")

    def _get(self, connection, withdrawal_id, *, context=None, atm_id=None, actor_id=None):
        row = connection.execute("SELECT * FROM atm_credentials WHERE withdrawal_id = ?",
                                 (_identifier(withdrawal_id),)).fetchone()
        if row is None:
            raise ATMError("unknown simulator credential")
        credential = dict(row)
        if context is not None and not self._belongs(row, context):
            raise AuthenticationError("credential does not belong to membership context")
        if atm_id is not None and row["atm_id"] != atm_id:
            raise AuthenticationError("credential belongs to a different ATM fixture")
        if actor_id is not None and row["consumed_by"] not in (None, actor_id):
            raise AuthenticationError("credential was consumed by another ATM fixture")
        withdrawal = self.wallet._withdrawal(connection, withdrawal_id)
        expected = {"ISSUED": "RESERVED", "AUTHORIZED_NOT_DISPENSED": "AUTHORIZED_NOT_DISPENSED",
                    "UNKNOWN": "UNKNOWN", "PARTIAL_DISPENSED": "AWAITING_RECONCILIATION",
                    "CANCELED": "REVERSED", "EXPIRED": "REVERSED", "DISPENSED": "DISPENSED",
                    "REVERSED": "REVERSED", "PARTIAL_REVERSED": "PARTIAL_REVERSED"}[row["state"]]
        consumed = row["consumed_at"] is not None
        should_be_consumed = row["state"] not in ("ISSUED", "CANCELED", "EXPIRED")
        if withdrawal["status"] != expected or consumed != should_be_consumed:
            raise ATMError("credential and Wallet state diverged; separate Wallet bypass requires investigation")
        if row["state"] in ("ISSUED", "AUTHORIZED_NOT_DISPENSED") and (withdrawal["dispensed_minor"] or withdrawal["released_minor"]):
            raise ATMError("credential and Wallet amounts diverged")
        return credential, withdrawal

    def _view(self, connection, withdrawal_id, now, **scope):
        credential, withdrawal = self._get(connection, withdrawal_id, **scope)
        state = credential["state"]
        return {"simulation_only": True, "real_atm_connection": "NOT_CONNECTED",
                "currency": "USD", "withdrawal_id": withdrawal_id, "atm_id": credential["atm_id"],
                "state": state, "code_sha256": credential["code_sha256"],
                "issued_at": credential["issued_at"], "expires_at": credential["expires_at"],
                "code_usable": state == "ISSUED" and now < credential["expires_at"],
                "consumed": credential["consumed_at"] is not None,
                "cleanup_needed": state == "ISSUED" and now >= credential["expires_at"],
                "withdrawal": withdrawal}

    def _state(self, connection, withdrawal_id, state, wallet_state, now):
        connection.execute("UPDATE atm_credentials SET state = ?, updated_at = ? WHERE withdrawal_id = ?",
                           (state, now, withdrawal_id))
        connection.execute("UPDATE wallet_withdrawals SET status = ?, updated_at = ? WHERE id = ?",
                           (wallet_state, _stamp(now), withdrawal_id))

    def issue(self, amount_minor, atm_id, key, *, context):
        scope = self._context(context, issue=True)
        _amount(amount_minor, issue=True)
        _identifier(atm_id)
        _key(key)
        if atm_id not in PUBLIC_ATM_FIXTURES:
            raise ATMError("unsupported ATM fixture")
        payload = {**scope, "amount_minor": amount_minor, "atm_id": atm_id}
        with self.wallet._transaction() as connection:
            self._binding(connection, context, create=True)
            cached = self.wallet._cached(connection, key, "atm.issue", payload)
            if cached is not None:
                return cached
            result = self._issue_in_transaction(connection, amount_minor, atm_id, context=context)
            # The only raw-code persistence is this private immutable receipt.
            return self.wallet._remember(connection, key, "atm.issue", payload, result)

    def _issue_in_transaction(self, connection, amount_minor, atm_id, *, context, withdrawal_id=None):
        """Reserve and issue using the caller's existing Wallet transaction.

        WalletAuthorization consumes its verified challenge and stores the
        resulting approval/receipt in this same transaction. This internal
        primitive is not an owner API and never commits independently.
        """
        if not connection.in_transaction:
            raise ATMError("issuance requires an existing Wallet transaction")
        self._context(context, issue=True)
        _amount(amount_minor, issue=True)
        _identifier(atm_id)
        if atm_id not in PUBLIC_ATM_FIXTURES:
            raise ATMError("unsupported ATM fixture")
        self._binding(connection, context, create=True)
        if connection.execute("SELECT COUNT(*) FROM atm_credentials").fetchone()[0] >= self.max_credentials:
            raise ATMError("simulator credential retention limit reached")
        if self.wallet._balances(connection)["AVAILABLE"] < amount_minor:
            raise InsufficientFunds("insufficient settled simulator balance")
        now = self._now()
        code = secrets.token_urlsafe(24)
        digest = _code_hash(code)
        withdrawal_id = str(uuid.uuid4()) if withdrawal_id is None else _identifier(withdrawal_id)
        connection.execute("INSERT INTO wallet_withdrawals VALUES (?, ?, 0, 0, 'RESERVED', ?, ?)",
                           (withdrawal_id, amount_minor, _stamp(now), _stamp(now)))
        self.wallet._post(connection, "withdrawal_reserve", withdrawal_id, "AVAILABLE", "WITHDRAW_HOLD", amount_minor)
        connection.execute("INSERT INTO atm_credentials VALUES (?, ?, ?, ?, ?, ?, ?, 'ISSUED', NULL, NULL, ?)",
                           (withdrawal_id, context.owner_id, context.device_id, atm_id, digest,
                            now, now + TTL_SECONDS, now))
        result = {"simulation_only": True, "real_atm_connection": "NOT_CONNECTED",
                  "receipt_kind": "immutable_issuance", "state_at_issue": "ISSUED",
                  "withdrawal_id": withdrawal_id, "currency": "USD", "amount_minor": amount_minor,
                  "atm_id": atm_id, "issued_at": now, "expires_at": now + TTL_SECONDS,
                  "code": code, "code_sha256": digest}
        self._get(connection, withdrawal_id, context=context)
        return result

    def status(self, withdrawal_id, *, context):
        self._context(context)
        with self.wallet._transaction() as connection:
            self._binding(connection, context)
            return self._view(connection, withdrawal_id, self._now(), context=context)

    def history(self, *, context, limit=50):
        self._context(context)
        if type(limit) is not int or not 1 <= limit <= 100:
            raise ATMError("history limit must be 1 through 100")
        with self.wallet._transaction() as connection:
            self._binding(connection, context)
            now = self._now()
            clause, parameters = self._owner_filter(context)
            rows = connection.execute(f"SELECT withdrawal_id FROM atm_credentials WHERE {clause} ORDER BY issued_at DESC, withdrawal_id LIMIT ?",
                                      (*parameters, limit)).fetchall()
            total = connection.execute(f"SELECT COUNT(*) FROM atm_credentials WHERE {clause}", parameters).fetchone()[0]
            return {"simulation_only": True, "total": total, "truncated": total > len(rows),
                    "items": [self._view(connection, row[0], now, context=context) for row in rows]}

    def _close_or_unknown(self, connection, withdrawal_id, now, *, context, reason):
        credential, withdrawal = self._get(connection, withdrawal_id, context=context)
        if credential["state"] in TERMINAL:
            return self._view(connection, withdrawal_id, now, context=context)
        if credential["consumed_at"] is not None:
            self._state(connection, withdrawal_id, "UNKNOWN", "UNKNOWN", now)
        else:
            if reason == "timeout":
                raise ATMError("unconsumed credential requires cancellation or actual expiry")
            self.wallet._post(connection, "withdrawal_hold_reversal", withdrawal_id,
                              "WITHDRAW_HOLD", "AVAILABLE", withdrawal["amount_minor"])
            connection.execute("UPDATE wallet_withdrawals SET released_minor = ? WHERE id = ?",
                               (withdrawal["amount_minor"], withdrawal_id))
            state = "EXPIRED" if reason == "expire" or now >= credential["expires_at"] else "CANCELED"
            self._state(connection, withdrawal_id, state, "REVERSED", now)
        return self._view(connection, withdrawal_id, now, context=context)

    def _owner_resolution(self, withdrawal_id, key, context, operation):
        scope = self._context(context)
        _identifier(withdrawal_id)
        _key(key)
        payload = {**scope, "withdrawal_id": withdrawal_id}
        with self.wallet._transaction() as connection:
            self._binding(connection, context)
            credential, _ = self._get(connection, withdrawal_id, context=context)
            cached = self.wallet._cached(connection, key, "atm." + operation, payload)
            if cached is not None:
                return cached
            now = self._now()
            if operation == "expire" and credential["state"] not in TERMINAL and now < credential["expires_at"]:
                raise ATMError("credential has not reached its expiry")
            result = self._close_or_unknown(connection, withdrawal_id, now, context=context, reason=operation)
            return self.wallet._remember(connection, key, "atm." + operation, payload, result)

    def cancel(self, withdrawal_id, key, *, context):
        return self._owner_resolution(withdrawal_id, key, context, "cancel")

    def expire(self, withdrawal_id, key, *, context):
        return self._owner_resolution(withdrawal_id, key, context, "expire")

    def timeout(self, withdrawal_id, key, *, context):
        return self._owner_resolution(withdrawal_id, key, context, "timeout")

    def expire_due(self, key, *, context, limit=64):
        scope = self._context(context)
        _key(key)
        if type(limit) is not int or not 1 <= limit <= 64:
            raise ATMError("cleanup limit must be 1 through 64")
        payload = {**scope, "limit": limit}
        with self.wallet._transaction() as connection:
            self._binding(connection, context)
            cached = self.wallet._cached(connection, key, "atm.expire_due", payload)
            if cached is not None:
                return cached
            now = self._now()
            clause, parameters = self._owner_filter(context)
            rows = connection.execute(f"""SELECT withdrawal_id FROM atm_credentials
                WHERE {clause} AND expires_at <= ?
                AND state IN ('ISSUED', 'AUTHORIZED_NOT_DISPENSED', 'PARTIAL_DISPENSED')
                ORDER BY expires_at, withdrawal_id LIMIT ?""",
                (*parameters, now, limit)).fetchall()
            results = [self._close_or_unknown(connection, row[0], now, context=context, reason="expire") for row in rows]
            return self.wallet._remember(connection, key, "atm.expire_due", payload,
                                         {"simulation_only": True, "processed": len(results), "items": results})

    def redeem(self, code, atm_id, key, *, actor):
        actor_id = self._actor(actor, atm_id)
        digest = _code_hash(code)
        _key(key)
        payload = {"code_sha256": digest, "atm_id": atm_id, "actor_id": actor_id}
        with self.wallet._transaction() as connection:
            row = connection.execute("SELECT withdrawal_id FROM atm_credentials WHERE code_sha256 = ?", (digest,)).fetchone()
            if row is None:
                raise AuthenticationError("invalid simulator credential")
            withdrawal_id = row[0]
            credential, _ = self._get(connection, withdrawal_id, atm_id=atm_id, actor_id=actor_id)
            cached = self.wallet._cached(connection, key, "atm.redeem", payload)
            if cached is not None:
                return cached
            if credential["state"] != "ISSUED":
                raise ATMError("simulator credential is no longer available for consumption")
            # Current origin-device and enrollment checks are composed by the
            # single Wallet authority under its membership guard. Never apply
            # this gate to already-consumed reconciliation or cached outcomes.
            if (self.redemption_authorizer is not None and self.redemption_authorizer(
                    credential["owner_id"], credential["device_id"], withdrawal_id) is not True):
                raise AuthenticationError("issuing device or credential no longer authorizes redemption")
            now = self._now()
            if now >= credential["expires_at"]:
                context = TrustedWalletContext(credential["owner_id"], credential["device_id"], False)
                view = self._close_or_unknown(connection, withdrawal_id, now, context=context, reason="expire")
                result = {"authorized": False, "reason": "expired", "receipt_kind": "immutable_atm_authorization", **view}
            else:
                connection.execute("UPDATE atm_credentials SET consumed_at = ?, consumed_by = ? WHERE withdrawal_id = ?",
                                   (now, actor_id, withdrawal_id))
                self._state(connection, withdrawal_id, "AUTHORIZED_NOT_DISPENSED", "AUTHORIZED_NOT_DISPENSED", now)
                result = {"authorized": True, "receipt_kind": "immutable_atm_authorization",
                          "authorization_id": withdrawal_id,
                          **self._view(connection, withdrawal_id, now, atm_id=atm_id, actor_id=actor_id)}
            return self.wallet._remember(connection, key, "atm.redeem", payload, result)

    def _observation(self, withdrawal_id, amount_minor, atm_id, key, actor, *, final):
        actor_id = self._actor(actor, atm_id)
        _amount(amount_minor)
        _key(key)
        operation = "atm.reconcile" if final else "atm.dispense"
        payload = {"withdrawal_id": _identifier(withdrawal_id), "total_dispensed_minor": amount_minor,
                   "atm_id": atm_id, "actor_id": actor_id}
        with self.wallet._transaction() as connection:
            credential, withdrawal = self._get(connection, withdrawal_id, atm_id=atm_id, actor_id=actor_id)
            if credential["consumed_at"] is None:
                raise ATMError("ATM observations require a consumed credential")
            cached = self.wallet._cached(connection, key, operation, payload)
            if cached is not None:
                return cached
            if not withdrawal["dispensed_minor"] <= amount_minor <= withdrawal["amount_minor"]:
                raise ATMError("cumulative cash assertion cannot decrease or exceed reservation")
            if credential["state"] in TERMINAL:
                if amount_minor != withdrawal["dispensed_minor"]:
                    raise ATMError("conflicting final cash assertion")
            else:
                delta = amount_minor - withdrawal["dispensed_minor"]
                if delta:
                    self.wallet._post(connection, "cash_dispense_reconciliation" if final else "cash_dispense_observation",
                                      withdrawal_id, "WITHDRAW_HOLD", "CASH_DISPENSED", delta)
                release = withdrawal["amount_minor"] - amount_minor if final else 0
                if release:
                    self.wallet._post(connection, "withdrawal_hold_reversal", withdrawal_id, "WITHDRAW_HOLD", "AVAILABLE", release)
                if final:
                    state = "DISPENSED" if not release else "REVERSED" if not amount_minor else "PARTIAL_REVERSED"
                    wallet_state = state
                else:
                    state = "DISPENSED" if amount_minor == withdrawal["amount_minor"] else "PARTIAL_DISPENSED" if amount_minor else "AUTHORIZED_NOT_DISPENSED"
                    wallet_state = "AWAITING_RECONCILIATION" if state == "PARTIAL_DISPENSED" else state
                    if credential["state"] == "UNKNOWN" and amount_minor < withdrawal["amount_minor"]:
                        state, wallet_state = "UNKNOWN", "UNKNOWN"
                now = self._now()
                connection.execute("UPDATE wallet_withdrawals SET dispensed_minor = ?, released_minor = ? WHERE id = ?",
                                   (amount_minor, release, withdrawal_id))
                self._state(connection, withdrawal_id, state, wallet_state, now)
            result = {"observation_source": "PUBLIC_ATM_FIXTURE_ASSERTION",
                      **self._view(connection, withdrawal_id, self._now(), atm_id=atm_id, actor_id=actor_id)}
            return self.wallet._remember(connection, key, operation, payload, result)

    def dispense(self, withdrawal_id, dispensed_minor, atm_id, key, *, actor):
        return self._observation(withdrawal_id, dispensed_minor, atm_id, key, actor, final=False)

    def reconcile(self, withdrawal_id, total_dispensed_minor, atm_id, key, *, actor):
        return self._observation(withdrawal_id, total_dispensed_minor, atm_id, key, actor, final=True)

    def dispatch(self, request, *, context=None, actor=None):
        """Exact JSON fields; membership and ATM actor never come from JSON."""
        fields = {"atm.issue": {"amount_minor", "atm_id", "key"},
                  "atm.status": {"withdrawal_id"}, "atm.history": {"limit"},
                  "atm.cancel": {"withdrawal_id", "key"}, "atm.expire": {"withdrawal_id", "key"},
                  "atm.timeout": {"withdrawal_id", "key"}, "atm.expire_due": {"limit", "key"},
                  "atm.redeem": {"code", "atm_id", "key"},
                  "atm.dispense": {"withdrawal_id", "dispensed_minor", "atm_id", "key"},
                  "atm.reconcile": {"withdrawal_id", "total_dispensed_minor", "atm_id", "key"}}
        if not isinstance(request, dict) or type(request.get("v")) is not int or request["v"] != 1:
            raise ATMError("invalid simulator request version")
        op = request.get("op")
        if not isinstance(op, str) or op not in fields or set(request) != {"v", "op"} | fields[op]:
            raise ATMError("unknown simulator operation or request fields")
        values = {name: request[name] for name in fields[op]}
        method = getattr(self, op.removeprefix("atm."))
        if op in {"atm.redeem", "atm.dispense", "atm.reconcile"}:
            result = method(**values, actor=actor)
        else:
            result = method(**values, context=context)
        return {"ok": True, "result": result}

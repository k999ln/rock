"""Local, single-wallet USD ledger simulator. No money or external services."""

from __future__ import annotations

from contextlib import closing, contextmanager
from datetime import UTC, date, datetime
import json
import os
from pathlib import Path
import re
import sqlite3
import time
from typing import Any, Iterator
import uuid

from .storage import IdempotencyConflict
from . import deadline as request_deadline


MONTHLY_FEE_MINOR = 888
MAX_AMOUNT_MINOR = 100_000_000
TERMS_VERSION = "simulator-monthly-usd-8.88-v1"
ACCOUNTS = (
    "AVAILABLE", "PENDING_SETTLEMENT", "WITHDRAW_HOLD", "CASH_DISPENSED",
    "SERVICE_FEES", "SALE_CLEARING",
)
GAME_ACCOUNTS = ('GAME_HOLD', 'GAME_PURCHASES', 'GAME_FEES')
SPEND_ACCOUNTS = ('SPEND_HOLD', 'SPEND_COMMITTED', 'SPEND_FEES', 'SPEND_GAS')
FINAL_WITHDRAWAL_STATES = {"DISPENSED", "REVERSED", "PARTIAL_REVERSED"}


class WalletError(ValueError):
    """A rejected simulator operation; no ledger changes were committed."""


class InsufficientFunds(WalletError):
    pass


class ConsentRequired(WalletError):
    pass


def _managed_write_guard(path, hooks):
    """Check a caller-owned ticket; never acquire admission under a DB lock.

    This is supported-library plumbing, not protection from a host owner who
    directly edits SQLite. Real managed tickets come from the coordinator.
    """
    if hooks is not None:
        hooks.require_held()
        if hooks.held_by_current_thread() is not True:
            raise PermissionError('managed write admission is not held by this thread')
        return
    marker = path.parent / 'AUTHORITY.json'
    if marker.exists() or marker.is_symlink():
        descriptor = os.open(marker, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
        try:
            raw = os.read(descriptor, 16385)
            if len(raw) > 16384:
                raise WalletError('authority marker exceeds the supported bound')
            try:
                value = json.loads(raw)
            except (ValueError, UnicodeError) as error:
                raise WalletError('invalid authority marker; explicit managed open required') from error
            if not isinstance(value, dict) or value.get('schema') != 'public-wallet-authority/1':
                raise WalletError('managed authority requires an owned write admission')
        finally:
            os.close(descriptor)
    if path.is_file():
        # A copied managed database cannot silently become unmanaged by losing
        # its neighboring marker. No constructor or PRAGMA write precedes this.
        with closing(sqlite3.connect(path.resolve().as_uri() + '?mode=ro', uri=True)) as db:
            if db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND "
                          "name IN ('wallet_storage_identity','wallet_bindings_v2') LIMIT 1").fetchone():
                raise WalletError('managed database identity requires an owned write admission')


def _now() -> str:
    return datetime.now(UTC).isoformat()


def _amount(value: int, *, allow_zero: bool = False) -> int:
    if type(value) is not int or not (0 if allow_zero else 1) <= value <= MAX_AMOUNT_MINOR:
        raise WalletError(f"amount must be integer USD cents from {0 if allow_zero else 1} to {MAX_AMOUNT_MINOR}")
    return value


def _key(value: str) -> str:
    if not isinstance(value, str) or not 1 <= len(value) <= 160 or not value.strip():
        raise WalletError("idempotency/event key must contain 1 to 160 characters")
    return value


def _identifier(value: str) -> str:
    if not isinstance(value, str) or not 1 <= len(value) <= 80:
        raise WalletError("invalid simulator record id")
    return value


class Wallet:
    """One local test wallet with serialized mutations and append-only postings.

    All accepted identity/device eligibility is explicitly a test fixture. There
    is no authentication, passkey, identity check, provider, ATM, or real balance.
    The caller must protect any HTTP interface separately.
    """

    def __init__(self, db_path: str | Path, *, managed_write_hooks=None):
        self.path = Path(db_path)
        self.managed_write_hooks = managed_write_hooks
        _managed_write_guard(self.path, self.managed_write_hooks)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with closing(self._connect()) as connection:
            connection.execute("PRAGMA journal_mode = WAL")
            connection.executescript("""
                CREATE TABLE IF NOT EXISTS wallet_journals (
                    id TEXT PRIMARY KEY,
                    kind TEXT NOT NULL,
                    reference_id TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS wallet_postings (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    journal_id TEXT NOT NULL REFERENCES wallet_journals(id),
                    account TEXT NOT NULL CHECK(account IN (
                        'AVAILABLE', 'PENDING_SETTLEMENT', 'WITHDRAW_HOLD',
                        'CASH_DISPENSED', 'SERVICE_FEES', 'SALE_CLEARING'
                    )),
                    delta_minor INTEGER NOT NULL CHECK(typeof(delta_minor) = 'integer' AND delta_minor != 0)
                );
                CREATE INDEX IF NOT EXISTS wallet_postings_journal ON wallet_postings(journal_id);
                CREATE TABLE IF NOT EXISTS wallet_sales (
                    id TEXT PRIMARY KEY,
                    amount_minor INTEGER NOT NULL,
                    status TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    settled_at TEXT
                );
                CREATE TABLE IF NOT EXISTS wallet_withdrawals (
                    id TEXT PRIMARY KEY,
                    amount_minor INTEGER NOT NULL,
                    dispensed_minor INTEGER NOT NULL DEFAULT 0,
                    released_minor INTEGER NOT NULL DEFAULT 0,
                    status TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS wallet_consents (
                    sequence INTEGER PRIMARY KEY AUTOINCREMENT,
                    id TEXT NOT NULL UNIQUE,
                    accepted INTEGER NOT NULL CHECK(accepted IN (0, 1)),
                    terms_version TEXT NOT NULL,
                    monthly_fee_minor INTEGER NOT NULL,
                    identity_fixture_id TEXT NOT NULL,
                    device_entitlement_fixture TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS wallet_bills (
                    period TEXT PRIMARY KEY,
                    id TEXT NOT NULL UNIQUE,
                    amount_minor INTEGER NOT NULL,
                    consent_id TEXT NOT NULL REFERENCES wallet_consents(id),
                    journal_id TEXT NOT NULL REFERENCES wallet_journals(id),
                    created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS wallet_idempotency (
                    key TEXT PRIMARY KEY,
                    operation TEXT NOT NULL,
                    input_json TEXT NOT NULL,
                    result_json TEXT NOT NULL
                );
                CREATE TRIGGER IF NOT EXISTS wallet_postings_no_update BEFORE UPDATE ON wallet_postings
                BEGIN SELECT RAISE(ABORT, 'wallet postings are append-only'); END;
                CREATE TRIGGER IF NOT EXISTS wallet_postings_no_delete BEFORE DELETE ON wallet_postings
                BEGIN SELECT RAISE(ABORT, 'wallet postings are append-only'); END;
                CREATE TRIGGER IF NOT EXISTS wallet_journals_no_update BEFORE UPDATE ON wallet_journals
                BEGIN SELECT RAISE(ABORT, 'wallet journals are append-only'); END;
                CREATE TRIGGER IF NOT EXISTS wallet_journals_no_delete BEFORE DELETE ON wallet_journals
                BEGIN SELECT RAISE(ABORT, 'wallet journals are append-only'); END;
                CREATE TRIGGER IF NOT EXISTS wallet_consents_no_update BEFORE UPDATE ON wallet_consents
                BEGIN SELECT RAISE(ABORT, 'wallet consent records are append-only'); END;
                CREATE TRIGGER IF NOT EXISTS wallet_consents_no_delete BEFORE DELETE ON wallet_consents
                BEGIN SELECT RAISE(ABORT, 'wallet consent records are append-only'); END;
            """)

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.path, timeout=30, isolation_level=None)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute("PRAGMA busy_timeout = 30000")
        return connection

    @contextmanager
    def _transaction(self, *, deadline=None) -> Iterator[sqlite3.Connection]:
        _managed_write_guard(self.path, self.managed_write_hooks)
        connection = self._connect()
        try:
            deadline=request_deadline.database(connection,deadline)
            connection.execute("BEGIN IMMEDIATE")
            yield connection
            self._verify(connection)
            if deadline is not None and time.monotonic() >= deadline:
                raise TimeoutError('Wallet transaction deadline elapsed before commit')
            connection.commit()
        except BaseException:
            connection.rollback()
            raise
        finally:
            connection.close()

    @staticmethod
    def _balances(connection: sqlite3.Connection) -> dict[str, int]:
        balances = dict.fromkeys(ACCOUNTS, 0)
        if connection.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='wallet_game_schema'").fetchone():
            balances.update(dict.fromkeys(GAME_ACCOUNTS, 0))
        if connection.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='value_spend_schema'").fetchone():
            balances.update(dict.fromkeys(SPEND_ACCOUNTS, 0))
        for row in connection.execute("SELECT account, SUM(delta_minor) AS balance FROM wallet_postings GROUP BY account"):
            balances[row["account"]] = row["balance"]
        return balances

    @classmethod
    def _verify(cls, connection: sqlite3.Connection) -> None:
        invalid = connection.execute("""
            SELECT j.id FROM wallet_journals j LEFT JOIN wallet_postings p ON p.journal_id = j.id
            GROUP BY j.id HAVING COALESCE(SUM(p.delta_minor), 0) != 0 OR COUNT(p.id) < 2 LIMIT 1
        """).fetchone()
        if invalid:
            raise WalletError("journal integrity failure")
        balances = cls._balances(connection)
        if any(amount < 0 for account, amount in balances.items() if account != "SALE_CLEARING"):
            raise WalletError("negative simulator account balance")
        held, dispensed = connection.execute("""
            SELECT COALESCE(SUM(amount_minor - dispensed_minor - released_minor), 0),
                   COALESCE(SUM(dispensed_minor), 0) FROM wallet_withdrawals
        """).fetchone()
        pending = connection.execute("SELECT COALESCE(SUM(amount_minor), 0) FROM wallet_sales WHERE status = 'PENDING_SETTLEMENT'").fetchone()[0]
        billed = connection.execute("SELECT COALESCE(SUM(amount_minor), 0) FROM wallet_bills").fetchone()[0]
        if (held, dispensed, pending, billed) != (balances["WITHDRAW_HOLD"], balances["CASH_DISPENSED"], balances["PENDING_SETTLEMENT"], balances["SERVICE_FEES"]):
            raise WalletError("simulator records do not reconcile with journal balances")
        if any(account in balances for account in GAME_ACCOUNTS):
            cls._verify_game(connection, balances)
        if any(account in balances for account in SPEND_ACCOUNTS):
            cls._verify_spend(connection, balances)

    @staticmethod
    def _verify_spend(connection, balances):
        """Reconcile Value/Spend reservations with the shared append-only ledger."""
        schema = [tuple(row) for row in connection.execute(
            'SELECT singleton,version FROM value_spend_schema'
        )]
        if schema != [(1, 1)]:
            raise WalletError('unsupported Value/Spend ledger schema')
        rows = connection.execute('SELECT * FROM spend_reservations').fetchall()
        held = committed = fees = gas = 0
        expected = []
        for row in rows:
            maximum = row['principal_minor'] + row['max_fee_minor'] + row['max_gas_minor']
            if maximum != row['held_minor'] + row['committed_minor'] + row['released_minor']:
                raise WalletError('spend reservation amount conservation failed')
            if (row['state'] == 'COMMITTED' and
                    row['committed_minor'] != row['principal_minor'] + row['actual_fee_minor'] + row['actual_gas_minor']):
                raise WalletError('spend committed amount differs from principal and costs')
            if row['state'] != 'COMMITTED' and (row['committed_minor'] or row['actual_fee_minor'] or row['actual_gas_minor']):
                raise WalletError('uncommitted spend has committed amounts')
            if row['actual_fee_minor'] > row['max_fee_minor'] or row['actual_gas_minor'] > row['max_gas_minor']:
                raise WalletError('spend cost exceeded its reservation')
            held += row['held_minor']
            committed += row['principal_minor'] if row['state'] == 'COMMITTED' else 0
            fees += row['actual_fee_minor'] if row['state'] == 'COMMITTED' else 0
            gas += row['actual_gas_minor'] if row['state'] == 'COMMITTED' else 0
            expected.append(('spend.reserve', row['proposal_id'], 'AVAILABLE', -maximum, 'SPEND_HOLD', maximum))
            if row['state'] == 'COMMITTED':
                expected.append(('spend.commit', row['proposal_id'], 'SPEND_HOLD', -row['principal_minor'],
                                 'SPEND_COMMITTED', row['principal_minor']))
                if row['actual_fee_minor']:
                    expected.append(('spend.fee', row['proposal_id'], 'SPEND_HOLD', -row['actual_fee_minor'],
                                     'SPEND_FEES', row['actual_fee_minor']))
                if row['actual_gas_minor']:
                    expected.append(('spend.gas', row['proposal_id'], 'SPEND_HOLD', -row['actual_gas_minor'],
                                     'SPEND_GAS', row['actual_gas_minor']))
                if row['released_minor']:
                    expected.append(('spend.release', row['proposal_id'], 'SPEND_HOLD', -row['released_minor'],
                                     'AVAILABLE', row['released_minor']))
            elif row['state'] == 'RELEASED':
                expected.append(('spend.release', row['proposal_id'], 'SPEND_HOLD', -maximum,
                                 'AVAILABLE', maximum))
            elif row['state'] != 'HELD':
                raise WalletError('unknown spend reservation state')
        if (held, committed, fees, gas) != tuple(balances[name] for name in SPEND_ACCOUNTS):
            raise WalletError('spend records do not reconcile with asset accounts')
        actual = []
        for journal in connection.execute("SELECT id,kind,reference_id FROM wallet_journals WHERE kind LIKE 'spend.%'"):
            postings = [tuple(row) for row in connection.execute(
                'SELECT account,delta_minor FROM wallet_postings WHERE journal_id=? ORDER BY id', (journal['id'],)
            )]
            if len(postings) != 2:
                raise WalletError('spend journal must have exactly two postings')
            actual.append((journal['kind'], journal['reference_id'], postings[0][0], postings[0][1],
                           postings[1][0], postings[1][1]))
        if sorted(actual) != sorted(expected):
            raise WalletError('spend journal binding differs')

    @staticmethod
    def _verify_game(connection, balances):
        """Audit additive GX01 journals without changing old Wallet semantics."""
        if [tuple(row) for row in connection.execute('SELECT singleton,version FROM wallet_game_schema')] != [(1,1)]:
            raise WalletError('unsupported game ledger schema')
        rows=connection.execute('SELECT * FROM wallet_game_exchanges').fetchall()
        if len(rows)>10000:raise WalletError('game ledger capacity exceeded')
        held=purchased=fees=0
        journal_ids=set()
        for row in rows:
            total=row['principal_minor']+row['fee_minor'];state=row['state']
            if total!=row['held_minor']+row['committed_minor']+row['released_minor']:
                raise WalletError('game exchange amount conservation failed')
            held+=row['held_minor']
            if state=='COMPLETED':purchased+=row['principal_minor'];fees+=row['fee_minor']
            expected=[('game.reserve',row['reserve_journal_id'],[('AVAILABLE',-total),('GAME_HOLD',total)])]
            terminal=connection.execute('SELECT receipt FROM wallet_game_exchange_receipts WHERE exchange_row=?',(row['id'],)).fetchone()
            outbox=connection.execute('SELECT state FROM wallet_game_outbox WHERE exchange_row=?',(row['id'],)).fetchall()
            if len(outbox)!=1:raise WalletError('game hold must have exactly one durable outbox')
            if state in ('QUEUED','CONFIRMING','REVIEW_REQUIRED'):
                valid=(row['held_minor']==total and row['committed_minor']==row['released_minor']==0 and
                       row['terminal_journal_id'] is None and terminal is None and outbox[0][0]!='TERMINAL')
            else:
                valid=(row['held_minor']==0 and outbox[0][0]=='TERMINAL')
                if state=='COMPLETED':
                    valid=valid and row['committed_minor']==total and row['released_minor']==0 and terminal is not None and json.loads(terminal[0])['terminal_state']=='APPLIED'
                    expected.append(('game.purchase',row['terminal_journal_id'],[('GAME_HOLD',-row['principal_minor']),('GAME_PURCHASES',row['principal_minor'])]))
                    fee_rows=connection.execute("SELECT id FROM wallet_journals WHERE kind='game.fee' AND reference_id=?",(row['id'],)).fetchall()
                    if len(fee_rows)!=(1 if row['fee_minor'] else 0):raise WalletError('game fee journal count differs')
                    if row['fee_minor']:expected.append(('game.fee',fee_rows[0][0],[('GAME_HOLD',-row['fee_minor']),('GAME_FEES',row['fee_minor'])]))
                elif state in ('REVERSED','CANCELLED'):
                    valid=valid and row['released_minor']==total and row['committed_minor']==0 and (
                        terminal is None if state=='CANCELLED' else terminal is not None and json.loads(terminal[0])['terminal_state']=='REJECTED')
                    expected.append(('game.cancel' if state=='CANCELLED' else 'game.release',row['terminal_journal_id'],[('GAME_HOLD',-total),('AVAILABLE',total)]))
                else:valid=False
            if not valid:raise WalletError('game state, hold and terminal records do not reconcile')
            for kind,journal_id,postings in expected:
                journal=connection.execute('SELECT kind,reference_id FROM wallet_journals WHERE id=?',(journal_id,)).fetchone()
                actual=[tuple(p) for p in connection.execute('SELECT account,delta_minor FROM wallet_postings WHERE journal_id=?',(journal_id,))]
                if journal is None or tuple(journal)!=(kind,row['id']) or sorted(actual)!=sorted(postings) or journal_id in journal_ids:
                    raise WalletError('game exchange journal binding differs')
                journal_ids.add(journal_id)
        if (held,purchased,fees)!=(balances['GAME_HOLD'],balances['GAME_PURCHASES'],balances['GAME_FEES']):
            raise WalletError('game records do not reconcile with asset accounts')
        actual={row[0] for row in connection.execute("SELECT id FROM wallet_journals WHERE kind LIKE 'game.%'")}
        if actual!=journal_ids:raise WalletError('unbound or duplicate game journal')

    @staticmethod
    def _post(connection: sqlite3.Connection, kind: str, reference: str,
              debit_from: str, credit_to: str, amount_minor: int) -> str:
        _amount(amount_minor)
        allowed = ACCOUNTS + GAME_ACCOUNTS + SPEND_ACCOUNTS
        if debit_from == credit_to or debit_from not in allowed or credit_to not in allowed:
            raise WalletError("invalid posting accounts")
        journal_id = str(uuid.uuid4())
        connection.execute("INSERT INTO wallet_journals VALUES (?, ?, ?, ?)",
                           (journal_id, kind, reference, _now()))
        connection.executemany("INSERT INTO wallet_postings(journal_id, account, delta_minor) VALUES (?, ?, ?)",
                               [(journal_id, debit_from, -amount_minor), (journal_id, credit_to, amount_minor)])
        return journal_id

    @staticmethod
    def _cached(connection: sqlite3.Connection, key: str, operation: str, payload: dict) -> dict | None:
        _key(key)
        row = connection.execute("SELECT * FROM wallet_idempotency WHERE key = ?", (key,)).fetchone()
        if not row:
            return None
        encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"))
        if row["operation"] != operation or row["input_json"] != encoded:
            raise IdempotencyConflict("key already used for a different wallet operation or payload")
        return json.loads(row["result_json"])

    @staticmethod
    def _remember(connection: sqlite3.Connection, key: str, operation: str, payload: dict, result: dict) -> dict:
        connection.execute("INSERT INTO wallet_idempotency VALUES (?, ?, ?, ?)",
                           (key, operation, json.dumps(payload, sort_keys=True, separators=(",", ":")),
                            json.dumps(result, sort_keys=True, separators=(",", ":"))))
        return result

    @staticmethod
    def _withdrawal(connection: sqlite3.Connection, withdrawal_id: str) -> dict:
        row = connection.execute("SELECT * FROM wallet_withdrawals WHERE id = ?", (_identifier(withdrawal_id),)).fetchone()
        if not row:
            raise WalletError("unknown simulator withdrawal")
        result = dict(row)
        result["held_minor"] = result["amount_minor"] - result["dispensed_minor"] - result["released_minor"]
        return result

    def simulate_sale(self, amount_minor: int, idempotency_key: str) -> dict:
        """Record unsettled simulated proceeds; a separate settlement is required."""
        payload = {"amount_minor": _amount(amount_minor)}
        with self._transaction() as connection:
            cached = self._cached(connection, idempotency_key, "sale", payload)
            if cached is not None:
                return cached
            sale_id = str(uuid.uuid4())
            created_at = _now()
            connection.execute("INSERT INTO wallet_sales VALUES (?, ?, 'PENDING_SETTLEMENT', ?, NULL)",
                               (sale_id, amount_minor, created_at))
            self._post(connection, "sale_pending", sale_id, "SALE_CLEARING", "PENDING_SETTLEMENT", amount_minor)
            result = {"id": sale_id, "amount_minor": amount_minor, "status": "PENDING_SETTLEMENT", "created_at": created_at, "settled_at": None}
            return self._remember(connection, idempotency_key, "sale", payload, result)

    def settle_sale(self, sale_id: str, event_key: str) -> dict:
        """Simulate confirmed settlement; does not contact a payment provider."""
        payload = {"sale_id": _identifier(sale_id)}
        with self._transaction() as connection:
            cached = self._cached(connection, event_key, "settle", payload)
            if cached is not None:
                return cached
            row = connection.execute("SELECT * FROM wallet_sales WHERE id = ?", (sale_id,)).fetchone()
            if not row:
                raise WalletError("unknown simulator sale")
            if row["status"] == "PENDING_SETTLEMENT":
                self._post(connection, "sale_settlement", sale_id, "PENDING_SETTLEMENT", "AVAILABLE", row["amount_minor"])
                connection.execute("UPDATE wallet_sales SET status = 'SETTLED', settled_at = ? WHERE id = ?", (_now(), sale_id))
            result = dict(connection.execute("SELECT * FROM wallet_sales WHERE id = ?", (sale_id,)).fetchone())
            return self._remember(connection, event_key, "settle", payload, result)

    def consent_monthly(self, accepted: bool, idempotency_key: str | None = None) -> dict:
        """Append explicit local consent/revocation against test fixtures only."""
        if type(accepted) is not bool:
            raise WalletError("accepted must be a boolean")
        with self._transaction() as connection:
            if idempotency_key is not None:
                old = self._cached(connection, idempotency_key, 'consent', {'accepted': accepted})
                if old is not None:
                    return old
            connection.execute("""
                INSERT INTO wallet_consents(id, accepted, terms_version, monthly_fee_minor,
                    identity_fixture_id, device_entitlement_fixture, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (str(uuid.uuid4()), int(accepted), TERMS_VERSION, MONTHLY_FEE_MINOR,
                  "TEST_FIXTURE_OWNER_NOT_IDENTITY_VERIFIED", "TEST_FIXTURE_ELIGIBLE_DEVICE_NOT_ATTESTED", _now()))
            result = dict(connection.execute("SELECT * FROM wallet_consents ORDER BY sequence DESC LIMIT 1").fetchone())
            result["accepted"] = bool(result["accepted"])
            if idempotency_key is not None:
                return self._remember(connection, idempotency_key, 'consent', {'accepted': accepted}, result)
            return result

    def bill(self, period: str, idempotency_key: str) -> dict:
        """Charge exactly 888 test cents at most once per explicit YYYY-MM."""
        if not isinstance(period, str) or not re.fullmatch(r"[0-9]{4}-(0[1-9]|1[0-2])", period):
            raise WalletError("billing period must be YYYY-MM")
        try:
            date.fromisoformat(period + "-01")
        except ValueError as error:
            raise WalletError("invalid billing year") from error
        payload = {"period": period, "amount_minor": MONTHLY_FEE_MINOR}
        with self._transaction() as connection:
            cached = self._cached(connection, idempotency_key, "bill", payload)
            if cached is not None:
                return cached
            existing = connection.execute("SELECT * FROM wallet_bills WHERE period = ?", (period,)).fetchone()
            if existing:
                return self._remember(connection, idempotency_key, "bill", payload, dict(existing))
            # The owning authenticated WalletService installs this trusted
            # callback. It runs only for a NEW debit while this Wallet writer
            # serializes credential revocation; existing receipts remain
            # reconcilable after eligibility or activation is lost.
            authorizer = getattr(self, 'new_bill_authorizer', None)
            if authorizer is not None and authorizer() is not True:
                raise ConsentRequired('current Wallet activation is required for a new monthly debit')
            consent = connection.execute("SELECT * FROM wallet_consents ORDER BY sequence DESC LIMIT 1").fetchone()
            if not consent or not consent["accepted"] or consent["terms_version"] != TERMS_VERSION:
                raise ConsentRequired("explicit simulator monthly-fee consent is required")
            if self._balances(connection)["AVAILABLE"] < MONTHLY_FEE_MINOR:
                raise InsufficientFunds("insufficient settled AVAILABLE test balance for monthly fee")
            bill_id = str(uuid.uuid4())
            journal_id = self._post(connection, "monthly_fee", bill_id, "AVAILABLE", "SERVICE_FEES", MONTHLY_FEE_MINOR)
            connection.execute("INSERT INTO wallet_bills VALUES (?, ?, ?, ?, ?, ?)",
                               (period, bill_id, MONTHLY_FEE_MINOR, consent["id"], journal_id, _now()))
            result = dict(connection.execute("SELECT * FROM wallet_bills WHERE period = ?", (period,)).fetchone())
            return self._remember(connection, idempotency_key, "bill", payload, result)

    def reserve(self, amount_minor: int, idempotency_key: str) -> dict:
        """Hold settled balance for one simulated withdrawal."""
        payload = {"amount_minor": _amount(amount_minor)}
        with self._transaction() as connection:
            cached = self._cached(connection, idempotency_key, "reserve", payload)
            if cached is not None:
                return cached
            if self._balances(connection)["AVAILABLE"] < amount_minor:
                raise InsufficientFunds("insufficient settled AVAILABLE test balance for withdrawal")
            withdrawal_id = str(uuid.uuid4())
            timestamp = _now()
            connection.execute("INSERT INTO wallet_withdrawals VALUES (?, ?, 0, 0, 'RESERVED', ?, ?)",
                               (withdrawal_id, amount_minor, timestamp, timestamp))
            self._post(connection, "withdrawal_reserve", withdrawal_id, "AVAILABLE", "WITHDRAW_HOLD", amount_minor)
            return self._remember(connection, idempotency_key, "reserve", payload, self._withdrawal(connection, withdrawal_id))

    def dispense(self, withdrawal_id: str, dispensed_minor: int, event_key: str) -> dict:
        """Record a cumulative cash observation; partial results retain the hold."""
        payload = {"withdrawal_id": _identifier(withdrawal_id), "dispensed_minor": _amount(dispensed_minor, allow_zero=True)}
        with self._transaction() as connection:
            cached = self._cached(connection, event_key, "dispense", payload)
            if cached is not None:
                return cached
            withdrawal = self._withdrawal(connection, withdrawal_id)
            if not withdrawal["dispensed_minor"] <= dispensed_minor <= withdrawal["amount_minor"]:
                raise WalletError("cumulative dispense must not decrease or exceed the reservation")
            if withdrawal["status"] in FINAL_WITHDRAWAL_STATES:
                if dispensed_minor != withdrawal["dispensed_minor"]:
                    raise WalletError("reconciled withdrawal cannot dispense more")
                return self._remember(connection, event_key, "dispense", payload, withdrawal)
            delta = dispensed_minor - withdrawal["dispensed_minor"]
            if delta:
                self._post(connection, "cash_dispense_observation", withdrawal_id, "WITHDRAW_HOLD", "CASH_DISPENSED", delta)
            state = "DISPENSED" if dispensed_minor == withdrawal["amount_minor"] else "AWAITING_RECONCILIATION"
            connection.execute("UPDATE wallet_withdrawals SET dispensed_minor = ?, status = ?, updated_at = ? WHERE id = ?",
                               (dispensed_minor, state, _now(), withdrawal_id))
            return self._remember(connection, event_key, "dispense", payload, self._withdrawal(connection, withdrawal_id))

    def mark_unknown(self, withdrawal_id: str, idempotency_key: str | None = None) -> dict:
        """Mark an ambiguous result without releasing or retrying any cash."""
        with self._transaction() as connection:
            if idempotency_key is not None:
                old = self._cached(connection, idempotency_key, 'unknown', {'id': withdrawal_id})
                if old is not None:
                    return old
            withdrawal = self._withdrawal(connection, withdrawal_id)
            if withdrawal["status"] in FINAL_WITHDRAWAL_STATES:
                raise WalletError("completed withdrawal cannot become unknown")
            if withdrawal["status"] != "UNKNOWN":
                connection.execute("UPDATE wallet_withdrawals SET status = 'UNKNOWN', updated_at = ? WHERE id = ?", (_now(), withdrawal_id))
            result = self._withdrawal(connection, withdrawal_id)
            if idempotency_key is not None:
                return self._remember(connection, idempotency_key, 'unknown', {'id': withdrawal_id}, result)
            return result

    def reconcile(self, withdrawal_id: str, total_dispensed_minor: int, event_key: str) -> dict:
        """Simulate a final provider inquiry; post remaining cash then release hold.

        The input is a test assertion, not proof from a real ATM/provider.
        Previously observed cash cannot be reversed by claiming a smaller total.
        """
        payload = {"withdrawal_id": _identifier(withdrawal_id), "total_dispensed_minor": _amount(total_dispensed_minor, allow_zero=True)}
        with self._transaction() as connection:
            cached = self._cached(connection, event_key, "reconcile", payload)
            if cached is not None:
                return cached
            withdrawal = self._withdrawal(connection, withdrawal_id)
            if not withdrawal["dispensed_minor"] <= total_dispensed_minor <= withdrawal["amount_minor"]:
                raise WalletError("reconciliation cannot reduce observed cash or exceed the reservation")
            if withdrawal["status"] in FINAL_WITHDRAWAL_STATES:
                if total_dispensed_minor != withdrawal["dispensed_minor"]:
                    raise WalletError("conflicting final reconciliation")
                return self._remember(connection, event_key, "reconcile", payload, withdrawal)
            delta = total_dispensed_minor - withdrawal["dispensed_minor"]
            release = withdrawal["amount_minor"] - total_dispensed_minor
            if delta:
                self._post(connection, "cash_dispense_reconciliation", withdrawal_id, "WITHDRAW_HOLD", "CASH_DISPENSED", delta)
            if release:
                self._post(connection, "withdrawal_hold_reversal", withdrawal_id, "WITHDRAW_HOLD", "AVAILABLE", release)
            state = "DISPENSED" if release == 0 else "REVERSED" if total_dispensed_minor == 0 else "PARTIAL_REVERSED"
            connection.execute("""
                UPDATE wallet_withdrawals SET dispensed_minor = ?, released_minor = ?, status = ?, updated_at = ? WHERE id = ?
            """, (total_dispensed_minor, release, state, _now(), withdrawal_id))
            return self._remember(connection, event_key, "reconcile", payload, self._withdrawal(connection, withdrawal_id))

    def snapshot(self) -> dict[str, Any]:
        connection = self._connect()
        try:
            connection.execute("BEGIN")
            self._verify(connection)
            accounts = self._balances(connection)
            consent_row = connection.execute("SELECT * FROM wallet_consents ORDER BY sequence DESC LIMIT 1").fetchone()
            consent = dict(consent_row) if consent_row else {"accepted": False, "terms_version": TERMS_VERSION}
            consent["accepted"] = bool(consent["accepted"])
            withdrawals = [self._withdrawal(connection, row["id"]) for row in connection.execute("SELECT id FROM wallet_withdrawals ORDER BY created_at DESC")]
            journals = []
            for row in connection.execute("SELECT * FROM wallet_journals ORDER BY created_at DESC"):
                journal = dict(row)
                journal["postings"] = [dict(post) for post in connection.execute("SELECT account, delta_minor FROM wallet_postings WHERE journal_id = ? ORDER BY id", (row["id"],))]
                journals.append(journal)
            return {
                "simulation_only": True,
                "currency": "USD", "minor_unit": "cent", "monthly_fee_minor": MONTHLY_FEE_MINOR,
                "test_identity_fixture": "TEST_FIXTURE_OWNER_NOT_IDENTITY_VERIFIED",
                "test_device_entitlement_fixture": "TEST_FIXTURE_ELIGIBLE_DEVICE_NOT_ATTESTED",
                "accounts": accounts, "available_minor": accounts["AVAILABLE"],
                "pending_minor": accounts["PENDING_SETTLEMENT"], "held_minor": accounts["WITHDRAW_HOLD"],
                "billed_minor": accounts["SERVICE_FEES"], "dispensed_minor": accounts["CASH_DISPENSED"],
                "ledger_balance_minor": sum(accounts.values()), "consent": consent,
                "sales": [dict(row) for row in connection.execute("SELECT * FROM wallet_sales ORDER BY created_at DESC")],
                "withdrawals": withdrawals,
                "bills": [dict(row) for row in connection.execute("SELECT * FROM wallet_bills ORDER BY period DESC")],
                "journals": journals,
            }
        finally:
            connection.rollback()
            connection.close()

"""Transactional entitlement state; no balances, postings, identity documents or network.

All accepted identities are public development fixtures. SQLite protects
concurrent application mutations, not a hostile OS or a rollback of its disk.
"""
from blackberryrock import deadline as request_deadline
from contextlib import contextmanager, closing
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import stat
import threading
import time

from blackberryrock.packages import canonical
from blackberryrock.wallet import _managed_write_guard
from .protocol import (MONTHLY_FEE_MINOR, CURRENCY, TERMS_VERSION, AuthenticationError,
                       Capacity, Conflict, EntitlementError, NotEligible,
                       authenticate, fields, identifier, integer, verify_event)

UTC = timezone.utc


def _encoded(value):
    return canonical(value).decode()


def _period(now):
    moment = datetime.fromtimestamp(now, UTC)
    end = datetime(moment.year + (moment.month == 12), moment.month % 12 + 1, 1, tzinfo=UTC)
    return moment.strftime("%Y-%m"), int(end.timestamp())


class EntitlementStore:
    def __init__(self, db_path, *, clock=None, max_records=10000, max_pending=64, authorization_ttl=300,
                 managed_write_hooks=None):
        self.path = Path(db_path)
        self.managed_write_hooks = managed_write_hooks
        _managed_write_guard(self.path, self.managed_write_hooks)
        self.clock = clock or time.time
        self._mutex = threading.RLock()
        self.max_records = integer(max_records, 10, 100000)
        self.max_pending = integer(max_pending, 1, 256)
        self.authorization_ttl = integer(authorization_ttl, 10, 3600)
        self.path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        parent = self.path.parent.lstat()
        if not stat.S_ISDIR(parent.st_mode) or parent.st_uid != os.geteuid() or parent.st_mode & 0o022:
            raise EntitlementError("state directory must be owned and not group/world writable")
        if self.path.exists() or self.path.is_symlink():
            info = self.path.lstat()
            if not stat.S_ISREG(info.st_mode) or info.st_uid != os.geteuid():
                raise EntitlementError("state database must be an owned regular file")
        with closing(self._connect()) as db:
            # Reject ambiguous legacy contracts before schema/business changes;
            # repeat under the writer lock to cover concurrent initialization.
            self._preflight_contracts(db)
            db.execute("PRAGMA journal_mode=WAL")
            schema = """
                CREATE TABLE IF NOT EXISTS devices (
                    device_ref TEXT PRIMARY KEY, owner_ref TEXT NOT NULL, purchase_ref TEXT NOT NULL UNIQUE,
                    verification_ref TEXT NOT NULL, verified_at INTEGER NOT NULL, valid_until INTEGER NOT NULL,
                    state TEXT NOT NULL CHECK(state IN ('ACTIVE','SUSPENDED')));
                CREATE TABLE IF NOT EXISTS accounts (
                    account_id TEXT PRIMARY KEY, device_ref TEXT NOT NULL UNIQUE REFERENCES devices(device_ref),
                    owner_ref TEXT NOT NULL, consent_id TEXT, auto_renew INTEGER NOT NULL DEFAULT 0,
                    access_until INTEGER NOT NULL DEFAULT 0);
                CREATE UNIQUE INDEX IF NOT EXISTS accounts_one_contract_per_owner ON accounts(owner_ref);
                CREATE TABLE IF NOT EXISTS account_devices (
                    device_ref TEXT PRIMARY KEY REFERENCES devices(device_ref),
                    account_id TEXT NOT NULL REFERENCES accounts(account_id));
                CREATE INDEX IF NOT EXISTS account_devices_account ON account_devices(account_id);
                CREATE TRIGGER IF NOT EXISTS account_devices_owner BEFORE INSERT ON account_devices
                    WHEN NOT EXISTS (SELECT 1 FROM devices d JOIN accounts a ON a.owner_ref=d.owner_ref
                                     WHERE d.device_ref=NEW.device_ref AND a.account_id=NEW.account_id)
                    BEGIN SELECT RAISE(ABORT,'contract device owner mismatch'); END;
                CREATE TRIGGER IF NOT EXISTS account_devices_no_update BEFORE UPDATE ON account_devices
                    BEGIN SELECT RAISE(ABORT,'contract device links are immutable'); END;
                CREATE TRIGGER IF NOT EXISTS account_devices_no_delete BEFORE DELETE ON account_devices
                    BEGIN SELECT RAISE(ABORT,'contract device links are retained'); END;
                CREATE TABLE IF NOT EXISTS consents (
                    consent_id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(account_id),
                    accepted INTEGER NOT NULL, terms_version TEXT NOT NULL, amount_minor INTEGER NOT NULL,
                    created_at INTEGER NOT NULL);
                CREATE TABLE IF NOT EXISTS authorizations (
                    authorization_id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(account_id),
                    period TEXT NOT NULL, consent_id TEXT NOT NULL REFERENCES consents(consent_id),
                    expires_at INTEGER NOT NULL, period_end INTEGER NOT NULL,
                    state TEXT NOT NULL CHECK(state IN ('ISSUED','CLAIMED','FAILED','CANCELED','PAID')),
                    attempt INTEGER NOT NULL DEFAULT 0, claimed_at INTEGER, wallet_bill_id TEXT,
                    UNIQUE(account_id,period), UNIQUE(wallet_bill_id));
                CREATE TABLE IF NOT EXISTS authorization_claims (
                    authorization_id TEXT NOT NULL REFERENCES authorizations(authorization_id),
                    attempt INTEGER NOT NULL CHECK(attempt BETWEEN 1 AND 10000),
                    claimed_at INTEGER NOT NULL, PRIMARY KEY(authorization_id,attempt));
                CREATE TABLE IF NOT EXISTS receipts (
                    actor TEXT NOT NULL, key TEXT NOT NULL, operation TEXT NOT NULL, payload TEXT NOT NULL,
                    result TEXT NOT NULL, PRIMARY KEY(actor,key));
                CREATE TABLE IF NOT EXISTS wallet_bindings (
                    account_id TEXT PRIMARY KEY REFERENCES accounts(account_id),
                    wallet_identity TEXT NOT NULL UNIQUE);
                CREATE TABLE IF NOT EXISTS streams (
                    stream TEXT PRIMARY KEY, sequence INTEGER NOT NULL, occurred_at INTEGER NOT NULL);
                CREATE TABLE IF NOT EXISTS events (
                    event_id TEXT PRIMARY KEY, stream TEXT NOT NULL, sequence INTEGER NOT NULL,
                    digest TEXT NOT NULL, envelope TEXT NOT NULL, receipt TEXT NOT NULL,
                    status TEXT NOT NULL CHECK(status IN ('QUEUED','APPLIED','REJECTED')),
                    outcome TEXT, UNIQUE(stream,sequence));
                CREATE TRIGGER IF NOT EXISTS consents_no_update BEFORE UPDATE ON consents
                  BEGIN SELECT RAISE(ABORT,'consents are append-only'); END;
                CREATE TRIGGER IF NOT EXISTS consents_no_delete BEFORE DELETE ON consents
                  BEGIN SELECT RAISE(ABORT,'consents are append-only'); END;
                CREATE TRIGGER IF NOT EXISTS receipts_no_update BEFORE UPDATE ON receipts
                  BEGIN SELECT RAISE(ABORT,'receipts are append-only'); END;
                CREATE TRIGGER IF NOT EXISTS receipts_no_delete BEFORE DELETE ON receipts
                  BEGIN SELECT RAISE(ABORT,'receipts are append-only'); END;
                CREATE TRIGGER IF NOT EXISTS authorization_claims_no_update BEFORE UPDATE ON authorization_claims
                  BEGIN SELECT RAISE(ABORT,'authorization claims are append-only'); END;
                CREATE TRIGGER IF NOT EXISTS authorization_claims_no_delete BEFORE DELETE ON authorization_claims
                  BEGIN SELECT RAISE(ABORT,'authorization claims are append-only'); END;
                CREATE TRIGGER IF NOT EXISTS events_no_delete BEFORE DELETE ON events
                  BEGIN SELECT RAISE(ABORT,'events cannot be deleted'); END;
                CREATE TRIGGER IF NOT EXISTS events_payload_immutable BEFORE UPDATE OF
                    event_id,stream,sequence,digest,envelope,receipt ON events
                  BEGIN SELECT RAISE(ABORT,'accepted event payload is immutable'); END;
            """
            # Older development databases already have immutable claim receipts.
            # Preserve their actual per-attempt times instead of assigning a
            # previous attempt the latest authorization row's overwritten time.
            db.execute('BEGIN IMMEDIATE')
            try:
                self._preflight_contracts(db)
                # executescript would implicitly commit. Keep additive DDL,
                # links and historical claim migration in one transaction.
                statement = ''
                for line in schema.splitlines(keepends=True):
                    statement += line
                    if sqlite3.complete_statement(statement):
                        db.execute(statement)
                        statement = ''
                if statement.strip():
                    raise EntitlementError('incomplete contract schema')
                for account in db.execute('SELECT account_id,device_ref FROM accounts').fetchall():
                    self._link_device(db, account['device_ref'], account['account_id'])
                for receipt in db.execute("SELECT result FROM receipts WHERE operation='claim'"):
                    grant = json.loads(receipt['result'])
                    self._record_claim(db, grant['authorization_id'], grant['attempt'], grant['claimed_at'])
                db.commit()
            except BaseException:
                db.rollback()
                raise
        os.chmod(self.path, 0o600)
        descriptor = os.open(self.path.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(descriptor)
        finally:
            os.close(descriptor)

    @staticmethod
    def _preflight_contracts(db):
        if not db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='accounts'").fetchone():
            return
        if db.execute('SELECT 1 FROM accounts GROUP BY owner_ref HAVING COUNT(*)>1 LIMIT 1').fetchone():
            raise Conflict('multiple legacy accounts for one owner; explicit contract migration required')
        if db.execute('SELECT 1 FROM accounts a LEFT JOIN devices d USING(device_ref) '
                      'WHERE d.device_ref IS NULL OR a.owner_ref!=d.owner_ref LIMIT 1').fetchone():
            raise Conflict('legacy account ownership mismatch; explicit contract migration required')

    @staticmethod
    def _link_device(db, device_ref, account_id):
        old = db.execute('SELECT account_id FROM account_devices WHERE device_ref=?', (device_ref,)).fetchone()
        if old:
            if old[0] != account_id:
                raise Conflict('device is already linked to another contract')
            return
        db.execute('INSERT INTO account_devices VALUES (?,?)', (device_ref, account_id))

    def _now(self):
        value = self.clock()
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not 0 <= value < 253402214400:
            raise EntitlementError("invalid simulator UTC clock")
        return int(value)

    def _connect(self):
        db = sqlite3.connect(self.path, timeout=10, isolation_level=None)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA foreign_keys=ON")
        db.execute("PRAGMA synchronous=FULL")
        db.execute("PRAGMA busy_timeout=10000")
        try:request_deadline.database(db)
        except BaseException:db.close();raise
        return db

    @contextmanager
    def _transaction(self):
        _managed_write_guard(self.path, self.managed_write_hooks)
        with request_deadline.locked(self._mutex):
            db = self._connect()
            try:
                db.execute("BEGIN IMMEDIATE")
                yield db
                request_deadline.check()
                db.commit()
            except BaseException:
                db.rollback()
                raise
            finally:
                db.close()

    @contextmanager
    def authorized_device(self, device_ref, token):
        """Current purchased-device admission, including before registration.

        The single authority must route fulfillment mutations through this same
        Store instance and protect its private database. This reentrant lock
        covers a service action and ingest(), not external direct DB writers.
        No SQLite transaction crosses yield: existing service/bridge operations
        open their own connections and commit under the same instance lock.
        """
        principal = authenticate(token, 'owner')
        identifier(device_ref, fixture=True)
        with self._mutex:
            with closing(self._connect()) as db:
                device = db.execute('SELECT * FROM devices WHERE device_ref=?', (device_ref,)).fetchone()
                if device is None or device['owner_ref'] != principal['owner_ref']:
                    raise NotEligible('purchased device handoff required for this owner')
                if device['state'] != 'ACTIVE' or self._now() >= device['valid_until']:
                    raise NotEligible('current handoff eligibility required')
                state = dict(device)
            yield state

    def _capacity(self, db, table):
        # Table names are internal literals only, never request data.
        if table not in ("events", "receipts", "accounts", "devices", "consents", "authorizations"):
            raise EntitlementError("invalid capacity table")
        if db.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0] >= self.max_records:
            raise Capacity("simulator record capacity reached")

    def _cached(self, db, actor, key, operation, payload):
        identifier(key)
        row = db.execute("SELECT * FROM receipts WHERE actor=? AND key=?", (actor, key)).fetchone()
        if row:
            if row["operation"] != operation or row["payload"] != _encoded(payload):
                raise Conflict("idempotency key already used for another request")
            return json.loads(row["result"])
        self._capacity(db, "receipts")

    def _remember(self, db, actor, key, operation, payload, result):
        db.execute("INSERT INTO receipts VALUES (?,?,?,?,?)",
                   (actor, key, operation, _encoded(payload), _encoded(result)))
        return result

    @staticmethod
    def _account(db, account_id, principal=None):
        identifier(account_id)
        row = db.execute("SELECT a.*,d.verification_ref,d.verified_at,d.valid_until,d.state AS device_state "
                         "FROM accounts a JOIN devices d USING(device_ref) WHERE account_id=?", (account_id,)).fetchone()
        if not row:
            raise NotEligible("unknown registered account")
        if principal and principal["role"] == "owner" and row["owner_ref"] != principal["owner_ref"]:
            raise AuthenticationError("account belongs to another fixture owner")
        account = dict(row)
        account['linked_devices'] = [dict(device) for device in db.execute(
            'SELECT d.* FROM account_devices ad JOIN devices d USING(device_ref) '
            'WHERE ad.account_id=? ORDER BY d.device_ref', (account_id,))]
        if not account['linked_devices'] or any(device['owner_ref'] != account['owner_ref']
                                               for device in account['linked_devices']):
            raise Conflict('contract device ownership requires reconciliation')
        return account

    @staticmethod
    def _eligible(account, now):
        active = [device for device in account['linked_devices'] if device['state'] == 'ACTIVE']
        if not active:
            raise NotEligible("device entitlement is suspended")
        valid_until = max(device['valid_until'] for device in active)
        if now >= valid_until:
            raise NotEligible("inherited synthetic verification expired")
        return valid_until

    def register(self, device_ref, key, token):
        principal = authenticate(token, "owner")
        identifier(device_ref, fixture=True)
        payload = {"device_ref": device_ref}
        with self._transaction() as db:
            device = db.execute("SELECT * FROM devices WHERE device_ref=?", (device_ref,)).fetchone()
            if not device or device["owner_ref"] != principal["owner_ref"]:
                raise NotEligible("purchased device handoff required for this owner")
            if device["state"] != "ACTIVE" or self._now() >= device["valid_until"]:
                raise NotEligible("current handoff eligibility required")
            old = self._cached(db, principal["actor"], key, "register", payload)
            if old is not None:
                return old
            existing = db.execute("SELECT account_id FROM accounts WHERE owner_ref=?", (principal['owner_ref'],)).fetchall()
            if len(existing) > 1:
                raise Conflict('multiple legacy accounts for one owner; explicit contract migration required')
            if existing:
                account_id = existing[0][0]
            else:
                account_id = 'acct-' + hashlib.sha256(canonical(['owner-contract-v1', principal['owner_ref']])).hexdigest()[:32]
                self._capacity(db, "accounts")
                db.execute("INSERT INTO accounts(account_id,device_ref,owner_ref) VALUES (?,?,?)",
                           (account_id, device_ref, principal["owner_ref"]))
            self._link_device(db, device_ref, account_id)
            result = {"account_id": account_id, "device_ref": device_ref,
                      "verification_ref": device["verification_ref"], "identity_inherited": True,
                      "additional_personal_fields_required": [], "simulation_only": True}
            return self._remember(db, principal["actor"], key, "register", payload, result)

    def account_for_device(self, device_ref, token):
        """Resolve a retained link; this alone is not current device admission."""
        principal = self._read_principal(token)
        identifier(device_ref, fixture=True)
        with closing(self._connect()) as db:
            db.execute('BEGIN')
            row = db.execute('SELECT account_id FROM account_devices WHERE device_ref=?', (device_ref,)).fetchone()
            if row is None:
                raise NotEligible('device has no registered contract')
            self._account(db, row[0], principal)
            return row[0]

    def consent(self, account_id, accepted, terms_version, key, token):
        principal = authenticate(token, "owner")
        if type(accepted) is not bool or terms_version != TERMS_VERSION:
            raise EntitlementError("explicit boolean consent to the current USD 8.88 terms is required")
        payload = {"account_id": account_id, "accepted": accepted, "terms_version": terms_version}
        with self._transaction() as db:
            account = self._account(db, account_id, principal)
            old = self._cached(db, principal["actor"], key, "consent", payload)
            if old is not None:
                return old
            now = self._now()
            if accepted:
                self._eligible(account, now)
            self._capacity(db, "consents")
            consent_id = "consent-" + hashlib.sha256(canonical([principal["actor"], key])).hexdigest()[:32]
            db.execute("INSERT INTO consents VALUES (?,?,?,?,?,?)", (consent_id, account_id, int(accepted), TERMS_VERSION, 888, now))
            db.execute("UPDATE accounts SET consent_id=?,auto_renew=? WHERE account_id=?", (consent_id, int(accepted), account_id))
            # An unclaimed old consent cannot silently authorize a future charge.
            db.execute("UPDATE authorizations SET state='CANCELED' WHERE account_id=? AND state IN ('ISSUED','FAILED')", (account_id,))
            result = {"consent_id": consent_id, "account_id": account_id, "accepted": accepted,
                      "terms_version": TERMS_VERSION, "amount_minor": 888, "currency": CURRENCY,
                      "inflight_authorizations": [row[0] for row in db.execute(
                          "SELECT authorization_id FROM authorizations WHERE account_id=? AND state='CLAIMED'", (account_id,))],
                      "simulation_only": True}
            return self._remember(db, principal["actor"], key, "consent", payload, result)

    @staticmethod
    def _authorization(db, authorization_id):
        identifier(authorization_id)
        row = db.execute("SELECT * FROM authorizations WHERE authorization_id=?", (authorization_id,)).fetchone()
        if not row:
            raise EntitlementError("unknown billing authorization")
        return dict(row)

    @staticmethod
    def _grant(row):
        return {**row, "wallet_idempotency_key": row["authorization_id"], "amount_minor": 888,
                "currency": CURRENCY, "terms_version": TERMS_VERSION, "simulation_only": True}

    @staticmethod
    def _record_claim(db, authorization_id, attempt, claimed_at):
        identifier(authorization_id)
        integer(attempt, 1, 10000)
        integer(claimed_at, 0, 253402214399)
        current = db.execute('SELECT attempt FROM authorizations WHERE authorization_id=?', (authorization_id,)).fetchone()
        if current is None or attempt > current['attempt']:
            raise EntitlementError('claim history does not match its authorization')
        old = db.execute('SELECT claimed_at FROM authorization_claims WHERE authorization_id=? AND attempt=?',
                         (authorization_id, attempt)).fetchone()
        if old is not None:
            if old['claimed_at'] != claimed_at:
                raise Conflict('immutable claim time differs from its historical receipt')
            return
        db.execute('INSERT INTO authorization_claims VALUES (?,?,?)', (authorization_id, attempt, claimed_at))

    def authorize_month(self, account_id, period, key, token):
        principal = authenticate(token, "wallet")
        payload = {"account_id": account_id, "period": period}
        with self._transaction() as db:
            account = self._account(db, account_id)
            old = self._cached(db, principal["actor"], key, "authorize", payload)
            if old is not None:
                return old
            now = self._now()
            current, end = _period(now)
            if period != current:
                raise EntitlementError("new authorizations require the current UTC calendar month")
            valid_until = self._eligible(account, now)
            if not account["auto_renew"] or not account["consent_id"]:
                raise NotEligible("current explicit recurring billing consent required")
            authorization_id = "auth-" + hashlib.sha256(canonical([account_id, period])).hexdigest()[:32]
            row = db.execute("SELECT * FROM authorizations WHERE authorization_id=?", (authorization_id,)).fetchone()
            if not row:
                self._capacity(db, "authorizations")
                db.execute("INSERT INTO authorizations(authorization_id,account_id,period,consent_id,expires_at,period_end,state) "
                           "VALUES (?,?,?,?,?,?,'ISSUED')", (authorization_id, account_id, period, account["consent_id"], min(now+self.authorization_ttl,end,valid_until), end))
            elif row["state"] in ("FAILED", "CANCELED") or row["state"] == "ISSUED" and now >= row["expires_at"]:
                db.execute("UPDATE authorizations SET state='ISSUED',consent_id=?,expires_at=? WHERE authorization_id=?",
                           (account["consent_id"], min(now+self.authorization_ttl,end,valid_until), authorization_id))
            result = self._grant(self._authorization(db, authorization_id))
            return self._remember(db, principal["actor"], key, "authorize", payload, result)

    def claim_authorization(self, authorization_id, key, token):
        principal = authenticate(token, "wallet")
        payload = {"authorization_id": authorization_id}
        with self._transaction() as db:
            row = self._authorization(db, authorization_id)
            old = self._cached(db, principal["actor"], key, "claim", payload)
            if old is not None:
                return old
            if row["state"] not in ("CLAIMED", "PAID"):
                account = self._account(db, row["account_id"])
                now = self._now()
                self._eligible(account, now)
                if row["state"] != "ISSUED" or now >= row["expires_at"] or row["period"] != _period(now)[0]:
                    raise NotEligible("authorization is not currently claimable")
                if not account["auto_renew"] or account["consent_id"] != row["consent_id"]:
                    raise NotEligible("authorization consent is no longer active")
                db.execute("UPDATE authorizations SET state='CLAIMED',attempt=attempt+1,claimed_at=? WHERE authorization_id=?", (now, authorization_id))
                self._record_claim(db, authorization_id, row['attempt'] + 1, now)
            result = self._grant(self._authorization(db, authorization_id))
            return self._remember(db, principal["actor"], key, "claim", payload, result)

    def authorization(self, authorization_id, token):
        authenticate(token, "wallet")
        with closing(self._connect()) as db:
            return self._grant(self._authorization(db, authorization_id))

    @staticmethod
    def _read_principal(token):
        principal = authenticate(token)
        if principal["role"] not in ("owner", "wallet"):
            raise AuthenticationError("principal cannot inspect account")
        return principal

    @staticmethod
    def _entitlement_view(account, device, now):
        eligible = device['state'] == 'ACTIVE' and now < device['valid_until']
        paid = now < account['access_until']
        state = ('DEVICE_SUSPENDED' if device['state'] != 'ACTIVE' else
                 'IDENTITY_EXPIRED' if now >= device['valid_until'] else
                 'CONSENT_REQUIRED' if account['consent_id'] is None else
                 'CANCEL_AT_PERIOD_END' if not account['auto_renew'] and paid else
                 'CANCELED' if not account['auto_renew'] else
                 'ACTIVE' if paid else 'PAST_DUE' if account['access_until'] else 'AWAITING_FIRST_PAYMENT')
        return {'account_id': account['account_id'], 'device_ref': device['device_ref'], 'device_eligible': eligible,
                'identity_inherited': True, 'verification_ref': device['verification_ref'],
                'verification_valid_until': device['valid_until'], 'subscription_state': state,
                'access_allowed': eligible and paid, 'access_until': account['access_until'],
                'auto_renew': bool(account['auto_renew']), 'consent_id': account['consent_id'],
                'monthly_fee_minor': MONTHLY_FEE_MINOR, 'currency': CURRENCY, 'simulation_only': True}

    def entitlement(self, account_id, token, *, device_ref=None):
        """View one linked device; omitting it retains the historical primary."""
        principal = self._read_principal(token)
        if device_ref is not None:
            identifier(device_ref, fixture=True)
        with closing(self._connect()) as db:
            db.execute('BEGIN')
            account = self._account(db, account_id, principal)
            target = account['device_ref'] if device_ref is None else device_ref
            device = next((d for d in account['linked_devices'] if d['device_ref'] == target), None)
            if device is None:
                raise NotEligible('requested device is not linked to this contract')
            return self._entitlement_view(account, device, self._now())

    def contract_entitlement(self, account_id, token):
        """Subscription eligibility from any linked device, independent of payment.

        device_ref remains the historical primary; eligibility_device_ref names
        the verification represented by the aggregate verification fields.
        """
        principal = self._read_principal(token)
        with closing(self._connect()) as db:
            db.execute('BEGIN')
            account = self._account(db, account_id, principal)
            now = self._now()
            devices = account['linked_devices']
            active = [d for d in devices if d['state'] == 'ACTIVE']
            representative = sorted(active or devices, key=lambda d: (-d['valid_until'], d['device_ref']))[0]
            result = self._entitlement_view(account, representative, now)
            return result | {'scope': 'contract', 'device_ref': account['device_ref'],
                             'eligibility_device_ref': representative['device_ref'],
                             'eligible_device_refs': [d['device_ref'] for d in devices
                                                      if d['state'] == 'ACTIVE' and now < d['valid_until']]}

    def _validate_event_payload(self, event):
        payload, kind = event["payload"], event["kind"]
        if event["issuer"] == "fulfillment":
            if kind not in ("handoff", "suspend", "restore"):
                raise AuthenticationError("issuer cannot send this event kind")
            expected = ("device_ref",) if kind == "suspend" else ("device_ref", "verification_ref", "verified_at", "valid_until")
            if kind == "handoff":
                expected += ("owner_ref", "purchase_ref")
            fields(payload, expected)
            for field in ("device_ref", "verification_ref", "owner_ref", "purchase_ref"):
                if field in payload:
                    identifier(payload[field], fixture=True)
            if event["stream"] != "device:" + payload["device_ref"]:
                raise EntitlementError("event stream is not bound to its device")
            if kind != "suspend":
                integer(payload["verified_at"], 0, event["occurred_at"])
                integer(payload["valid_until"], payload["verified_at"]+1, payload["verified_at"]+366*86400)
        else:
            if kind not in ("payment_failed", "payment_succeeded"):
                raise AuthenticationError("issuer cannot send this event kind")
            expected = ("authorization_id", "attempt", "period", "amount_minor", "currency")
            expected += ("wallet_bill_id",) if kind == "payment_succeeded" else ("reason",)
            fields(payload, expected)
            identifier(payload["authorization_id"])
            integer(payload["attempt"], 1, 10000)
            if event["stream"] != "billing:" + payload["authorization_id"]:
                raise EntitlementError("event stream is not bound to its authorization")
            if type(payload["amount_minor"]) is not int or payload["amount_minor"] != 888 or payload["currency"] != "USD":
                raise EntitlementError("billing results must reference exactly USD 8.88")
            if kind == "payment_succeeded":
                identifier(payload["wallet_bill_id"])
            elif payload["reason"] not in ("insufficient_funds", "definite_failure"):
                raise EntitlementError("unknown outcomes must remain CLAIMED for reconciliation")

    def ingest(self, envelope):
        event, digest = verify_event(envelope, self._now())
        self._validate_event_payload(event)
        with self._transaction() as db:
            return self._accept_event(db, event, digest)

    def _accept_event(self, db, event, digest):
        old = db.execute("SELECT * FROM events WHERE event_id=?", (event["event_id"],)).fetchone()
        if old:
            if old["digest"] != digest:
                raise Conflict("event id reused for different signed content")
            return json.loads(old["receipt"])
        self._capacity(db, "events")
        if db.execute("SELECT 1 FROM events WHERE stream=? AND sequence=?", (event["stream"], event["sequence"])).fetchone():
            raise Conflict("event sequence already used")
        cursor = db.execute("SELECT sequence FROM streams WHERE stream=?", (event["stream"],)).fetchone()
        previous = cursor[0] if cursor else 0
        if event["sequence"] <= previous or event["sequence"] > previous + self.max_pending:
            raise Conflict("stale event sequence or bounded reorder window exceeded")
        if event["sequence"] != previous + 1 and db.execute("SELECT COUNT(*) FROM events WHERE status='QUEUED'").fetchone()[0] >= self.max_pending:
            raise Capacity("pending webhook capacity reached")
        receipt = {"event_id": event["event_id"], "digest": digest, "accepted": True,
                   "stream": event["stream"], "sequence": event["sequence"], "simulation_only": True}
        db.execute("INSERT INTO events VALUES (?,?,?,?,?,?, 'QUEUED',NULL)",
                   (event["event_id"], event["stream"], event["sequence"], digest, _encoded(event), _encoded(receipt)))
        if not cursor:
            db.execute("INSERT INTO streams VALUES (?,0,0)", (event["stream"],))
        self._drain(db, event["stream"])
        return receipt

    def _drain(self, db, stream):
        while True:
            cursor = db.execute("SELECT * FROM streams WHERE stream=?", (stream,)).fetchone()
            row = db.execute("SELECT * FROM events WHERE stream=? AND sequence=?", (stream, cursor["sequence"]+1)).fetchone()
            if not row:
                return
            event = json.loads(row["envelope"])
            db.execute("SAVEPOINT apply_event")
            try:
                if event["occurred_at"] < cursor["occurred_at"]:
                    raise EntitlementError("event time moved backwards within its ordered stream")
                outcome = self._apply(db, event)
                status = "APPLIED"
                db.execute("RELEASE apply_event")
            except (EntitlementError, sqlite3.IntegrityError) as error:
                db.execute("ROLLBACK TO apply_event")
                db.execute("RELEASE apply_event")
                status, outcome = "REJECTED", str(error)
            db.execute("UPDATE events SET status=?,outcome=? WHERE event_id=?", (status, outcome, event["event_id"]))
            # A malformed state transition is durably rejected, never a permanent
            # poison-message block. It still consumes the authenticated sequence.
            db.execute("UPDATE streams SET sequence=?,occurred_at=? WHERE stream=?",
                       (event["sequence"], max(cursor["occurred_at"], event["occurred_at"]), stream))

    def _apply(self, db, event):
        p, kind = event["payload"], event["kind"]
        if event["issuer"] == "fulfillment":
            device = db.execute("SELECT * FROM devices WHERE device_ref=?", (p["device_ref"],)).fetchone()
            if kind == "handoff":
                if device:
                    raise Conflict("a device cannot be sold or reassigned by a repeated handoff")
                self._capacity(db, "devices")
                db.execute("INSERT INTO devices VALUES (?,?,?,?,?,?,'ACTIVE')", (p["device_ref"], p["owner_ref"], p["purchase_ref"], p["verification_ref"], p["verified_at"], p["valid_until"]))
            else:
                if not device:
                    raise NotEligible("handoff must precede device state changes")
                if kind == "suspend":
                    db.execute("UPDATE devices SET state='SUSPENDED' WHERE device_ref=?", (p["device_ref"],))
                    link = db.execute('SELECT account_id FROM account_devices WHERE device_ref=?', (p['device_ref'],)).fetchone()
                    if link:
                        try:
                            self._eligible(self._account(db, link[0]), self._now())
                        except NotEligible:
                            db.execute("UPDATE authorizations SET state='CANCELED' WHERE state IN ('ISSUED','FAILED') AND account_id=?", (link[0],))
                else:
                    if p["verified_at"] < device["verified_at"] or p["valid_until"] <= event["occurred_at"]:
                        raise EntitlementError("restoration needs current, non-decreasing synthetic verification")
                    db.execute("UPDATE devices SET state='ACTIVE',verification_ref=?,verified_at=?,valid_until=? WHERE device_ref=?",
                               (p["verification_ref"], p["verified_at"], p["valid_until"], p["device_ref"]))
            return kind
        row = self._authorization(db, p["authorization_id"])
        claim = db.execute('SELECT claimed_at FROM authorization_claims WHERE authorization_id=? AND attempt=?',
                           (row['authorization_id'], p['attempt'])).fetchone()
        if p["period"] != row["period"] or p["attempt"] > row["attempt"] or claim is None:
            raise EntitlementError("billing outcome does not match a committed claim")
        if event["occurred_at"] < claim["claimed_at"]:
            raise EntitlementError("billing outcome predates its claim")
        if row["state"] == "PAID":
            if kind == "payment_succeeded" and p["wallet_bill_id"] != row["wallet_bill_id"]:
                raise Conflict("different bill id for an already-paid month")
            return "ignored_terminal_paid"
        if kind == "payment_failed":
            if p["attempt"] != row["attempt"] or row["state"] != "CLAIMED":
                return "ignored_stale_failure"
            db.execute("UPDATE authorizations SET state='FAILED' WHERE authorization_id=?", (row["authorization_id"],))
        else:
            # A late confirmed monetary observation is retained even after cancel.
            # Eligibility/consent remain separate; this never re-enables auto-renew.
            db.execute("UPDATE authorizations SET state='PAID',wallet_bill_id=? WHERE authorization_id=?", (p["wallet_bill_id"], row["authorization_id"]))
            db.execute("UPDATE accounts SET access_until=MAX(access_until,?) WHERE account_id=?", (row["period_end"], row["account_id"]))
        return kind

    def event_status(self, event_id, token):
        principal = authenticate(token)
        if principal["role"] not in ("wallet", "fulfillment"):
            raise AuthenticationError("principal cannot inspect webhook inbox")
        identifier(event_id)
        with closing(self._connect()) as db:
            row = db.execute("SELECT * FROM events WHERE event_id=?", (event_id,)).fetchone()
            if not row or json.loads(row["envelope"])["issuer"] != principal["actor"]:
                raise AuthenticationError("unknown event for this issuer")
            return {"event_id": event_id, "status": row["status"], "outcome": row["outcome"]}

    def next_billing_sequence(self, authorization_id, token):
        """SDK helper, not a reservation: concurrent callers must retry conflicts."""
        authenticate(token, "wallet")
        with closing(self._connect()) as db:
            self._authorization(db, authorization_id)
            return db.execute("SELECT COALESCE(MAX(sequence),0)+1 FROM events WHERE stream=?", ("billing:"+authorization_id,)).fetchone()[0]

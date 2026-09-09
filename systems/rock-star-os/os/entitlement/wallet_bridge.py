"""Optional in-process adapter to the EXISTING Wallet simulator.

The backend transaction serializes cancel/execute while Wallet commits its own
ledger. A crash between the two commits leaves CLAIMED, recoverable with the
same Wallet key. This is not an atomic transaction across two databases.
"""
import hashlib

from blackberryrock.packages import canonical
from blackberryrock.wallet import Wallet, InsufficientFunds, ConsentRequired
from .protocol import (TERMS_VERSION, Conflict, NotEligible, authenticate,
                       sign_fixture_event, verify_event)
from .store import _period


def bind_managed_identity(db, wallet_db, account_id, wallet_path):
    """Shared same-account repair; caller already holds one managed admission."""
    stable = db.execute('SELECT * FROM wallet_bindings_v2').fetchall()
    legacy = db.execute('SELECT * FROM wallet_bindings').fetchall()
    identities = wallet_db.execute('SELECT * FROM wallet_storage_identity').fetchall()
    if len(identities) != 1:
        raise Conflict('one managed Wallet identity required')
    identity = identities[0]
    if identity['account_id'] not in (None, account_id):
        raise Conflict('managed Wallet is bound to another account')
    if stable:
        if (len(stable) != 1 or len(legacy) != 1 or stable[0]['account_id'] != account_id or
                stable[0]['ledger_uuid'] != identity['ledger_uuid'] or
                stable[0]['migration_id'] != identity['migration_id'] or
                legacy[0]['account_id'] != account_id or
                legacy[0]['wallet_identity'] != stable[0]['legacy_identity']):
            raise Conflict('managed Wallet binding differs from its retained identity')
    else:
        info = wallet_path.stat()
        original = hashlib.sha256(canonical([info.st_dev, info.st_ino])).hexdigest()
        if legacy:
            if len(legacy) != 1 or legacy[0]['account_id'] != account_id or legacy[0]['wallet_identity'] != original:
                raise Conflict('unverified legacy Wallet file cannot become a managed binding')
        else: db.execute('INSERT INTO wallet_bindings VALUES (?,?)', (account_id, original))
        db.execute('INSERT INTO wallet_bindings_v2 VALUES (?,?,?,?)',
                   (account_id, identity['ledger_uuid'], original, identity['migration_id']))
    if identity['account_id'] is None:
        wallet_db.execute('UPDATE wallet_storage_identity SET account_id=? WHERE singleton=1', (account_id,))


class WalletBridge:
    def __init__(self, store, wallet, account_id, token):
        authenticate(token, "wallet")
        if not isinstance(wallet, Wallet) or wallet.path.resolve() == store.path.resolve():
            raise Conflict("use a separate existing Wallet database")
        self.store, self.wallet, self.account_id = store, wallet, account_id
        if store.managed_write_hooks is not wallet.managed_write_hooks:
            raise Conflict('Wallet and contract must share the same managed admission')
        if wallet.managed_write_hooks is not None:
            self._bind_managed()
            return
        info = wallet.path.stat()
        identity = hashlib.sha256(canonical([info.st_dev, info.st_ino])).hexdigest()
        with store._transaction() as db:
            store._account(db, account_id)
            previous = db.execute("SELECT * FROM wallet_bindings WHERE account_id=? OR wallet_identity=?",
                                  (account_id, identity)).fetchone()
            if previous and (previous["account_id"] != account_id or previous["wallet_identity"] != identity):
                raise Conflict("a Wallet database is bound to exactly one fixture account")
            if not previous:
                db.execute("INSERT INTO wallet_bindings VALUES (?,?)", (account_id, identity))

    def _bind_managed(self):
        """Retain the legacy inode receipt and use the managed stable identity.

        The coordinator admits the original registration and verifies both DBs
        before returning its response. Cross-DB interruption remains recoverable
        by the same account; it is never presented as an atomic two-DB commit.
        """
        self.wallet.managed_write_hooks.require_held()
        with self.store._transaction() as db:
            self.store._account(db, self.account_id)
            with self.wallet._transaction() as wallet_db:
                bind_managed_identity(db, wallet_db, self.account_id, self.wallet.path)

    def execute(self, authorization_id, key, token):
        principal = authenticate(token, "wallet")
        payload = {"authorization_id": authorization_id, "account_id": self.account_id}
        store = self.store
        with store._transaction() as db:
            row = store._authorization(db, authorization_id)
            if row["account_id"] != self.account_id:
                raise Conflict("authorization is bound to another Wallet account")
            old = store._cached(db, principal["actor"], key, "wallet-bridge", payload)
            if old is not None:
                return old
            if row["state"] not in ("CLAIMED", "PAID"):
                raise NotEligible("claim current authorization before executing the Wallet bridge")
            known = next((bill for bill in self.wallet.snapshot()["bills"] if bill["period"] == row["period"]), None)
            if known and known["amount_minor"] != 888:
                raise Conflict("existing Wallet bill does not match the fixed amount")
            if row["state"] == "PAID":
                if not known or known["id"] != row["wallet_bill_id"]:
                    raise Conflict("Wallet/backend mismatch requires reconciliation; do not debit again")
                result = {"authorization": store._grant(row), "wallet_bill_id": known["id"],
                          "event_status": "ALREADY_PAID", "simulation_only": True}
                return store._remember(db, principal["actor"], key, "wallet-bridge", payload, result)
            now = store._now()
            reason = None
            if not known:
                account = store._account(db, self.account_id)
                try:
                    store._eligible(account, now)
                    if (not account["auto_renew"] or account["consent_id"] != row["consent_id"]
                            or row["period"] != _period(now)[0] or now >= row["expires_at"]):
                        raise NotEligible("no fresh debit after cancellation, expiry or consent replacement")
                    # This is a mirror of an already explicit owner consent, never
                    # consent inferred from a purchase or automatic registration.
                    self.wallet.consent_monthly(True, row["consent_id"])
                    known = self.wallet.bill(row["period"], row["authorization_id"])
                except InsufficientFunds:
                    reason = "insufficient_funds"
                except (NotEligible, ConsentRequired):
                    reason = "definite_failure"
                # Any unknown exception aborts this backend transaction and keeps
                # CLAIMED. The caller must retry/reconcile this same authorization.
            event_payload = {"authorization_id": authorization_id, "attempt": row["attempt"],
                             "period": row["period"], "amount_minor": 888, "currency": "USD"}
            if known:
                kind = "payment_succeeded"
                event_payload["wallet_bill_id"] = known["id"]
            else:
                kind = "payment_failed"
                event_payload["reason"] = reason
            stream = "billing:" + authorization_id
            cursor = db.execute("SELECT sequence FROM streams WHERE stream=?", (stream,)).fetchone()
            sequence = cursor[0] + 1 if cursor else 1
            event = sign_fixture_event("wallet", f"bridge-{authorization_id}-{row['attempt']}", stream,
                                       sequence, now, kind, event_payload)
            event, digest = verify_event(event, now)
            store._validate_event_payload(event)
            store._accept_event(db, event, digest)
            status = db.execute("SELECT status FROM events WHERE event_id=?", (event["event_id"],)).fetchone()[0]
            result = {"authorization": store._grant(store._authorization(db, authorization_id)),
                      "wallet_bill_id": known["id"] if known else None, "event_status": status,
                      "simulation_only": True}
            return store._remember(db, principal["actor"], key, "wallet-bridge", payload, result)

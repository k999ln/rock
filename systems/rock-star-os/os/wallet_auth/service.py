"""Wallet activation and transaction approval using a real signature verifier.

Only the public software-authenticator development profile is supported. The
caller owns current purchaser/device authentication and must retain its shared
membership guard through dispatch. No client-provided account/device identity
or boolean can stand in for a verified WebAuthn assertion.

Every auth/quote record lives in the existing Wallet database. Approval, quote
consumption, authenticator counter, funds reservation, cardless code and receipt
commit together. This module neither creates a second ledger nor imports a
private signing fixture. There is no hardware/secure-clock attestation claim.
"""
from contextlib import closing
import hashlib
import json
import math
import secrets
import threading
import time
import uuid

from atm.simulator import CardlessATMSimulator, TrustedWalletContext, _amount, _identifier, _key, PUBLIC_ATM_FIXTURES
from blackberryrock.wallet import Wallet
from . import protocol

TERMS_VERSION = 'rock-wallet-development/1'
FEE_POLICY = 'simulator-zero-fee-v1'
TTL = 120
MAX_RECORDS = 10000
FIELDS = {
    'wallet.auth.begin': {'v', 'op', 'key'},
    'wallet.auth.enroll': {'v', 'op', 'key', 'challenge_id', 'credential'},
    'wallet.auth.status': {'v', 'op'},
    'wallet.terms': {'v', 'op', 'key', 'accepted', 'terms_version'},
    'wallet.atm.quote': {'v', 'op', 'key', 'issue_key', 'amount_minor', 'atm_id'},
    'wallet.atm.issue': {'v', 'op', 'key', 'quote_id', 'credential'},
    'wallet.atm.quote.cancel': {'v', 'op', 'key', 'quote_id'},
}


def _json(value):
    return protocol.json_bytes(value).decode('utf-8')


def _require(value, message):
    protocol.require(value, message)


class WalletAuthorization:
    def __init__(self, wallet, atm, *, authority_id=None, clock=time.time):
        if not isinstance(wallet, Wallet) or not isinstance(atm, CardlessATMSimulator) or atm.wallet is not wallet:
            raise TypeError('authorization must share the exact existing Wallet and ATM')
        if authority_id is not None:
            _require(type(authority_id) is str and str(uuid.UUID(authority_id)) == authority_id,
                     'authority must be a canonical UUID')
        self.wallet, self.atm, self.clock = wallet, atm, clock
        self._mutex = threading.RLock()
        now = self._clock()
        statements = (
            '''CREATE TABLE IF NOT EXISTS wallet_auth_mode (
                singleton INTEGER PRIMARY KEY CHECK(singleton=1), schema_version INTEGER NOT NULL CHECK(schema_version=1),
                authority_id TEXT NOT NULL, maximum_time REAL NOT NULL, account_id TEXT)''',
            '''CREATE TABLE IF NOT EXISTS wallet_auth_credentials (
                credential_id TEXT PRIMARY KEY, account_id TEXT NOT NULL, device_id TEXT NOT NULL UNIQUE,
                record_json TEXT NOT NULL, enrollment_challenge_id TEXT NOT NULL UNIQUE, created_at REAL NOT NULL)''',
            '''CREATE TABLE IF NOT EXISTS wallet_auth_credential_state (
                credential_id TEXT PRIMARY KEY REFERENCES wallet_auth_credentials(credential_id),
                record_json TEXT NOT NULL, revoked_at REAL)''',
            '''CREATE TABLE IF NOT EXISTS wallet_auth_challenges (
                challenge_id TEXT PRIMARY KEY, account_id TEXT NOT NULL, device_id TEXT NOT NULL,
                handoff_ref TEXT NOT NULL, challenge TEXT NOT NULL UNIQUE, issued_at REAL NOT NULL,
                expires_at REAL NOT NULL, options_json TEXT NOT NULL,
                state TEXT NOT NULL CHECK(state IN ('PENDING','USED')),
                CHECK(expires_at=issued_at+120))''',
            '''CREATE TABLE IF NOT EXISTS wallet_auth_terms (
                terms_receipt_id TEXT PRIMARY KEY, account_id TEXT NOT NULL, device_id TEXT NOT NULL,
                credential_id TEXT NOT NULL REFERENCES wallet_auth_credentials(credential_id),
                accepted INTEGER NOT NULL CHECK(accepted IN (0,1)), terms_version TEXT NOT NULL, created_at REAL NOT NULL)''',
            '''CREATE TABLE IF NOT EXISTS wallet_auth_quotes (
                quote_id TEXT PRIMARY KEY, account_id TEXT NOT NULL, device_id TEXT NOT NULL,
                credential_id TEXT NOT NULL REFERENCES wallet_auth_credentials(credential_id),
                issue_key TEXT NOT NULL UNIQUE, amount_minor INTEGER NOT NULL CHECK(typeof(amount_minor)='integer' AND amount_minor>0),
                quote_json TEXT NOT NULL, challenge TEXT NOT NULL UNIQUE,
                expires_at REAL NOT NULL, options_json TEXT NOT NULL,
                state TEXT NOT NULL CHECK(state IN ('OPEN','CANCELED','CONSUMED')))''',
            '''CREATE TABLE IF NOT EXISTS wallet_auth_approvals (
                approval_id TEXT PRIMARY KEY, quote_id TEXT NOT NULL UNIQUE REFERENCES wallet_auth_quotes(quote_id),
                credential_id TEXT NOT NULL REFERENCES wallet_auth_credentials(credential_id),
                assertion_sha256 TEXT NOT NULL, withdrawal_id TEXT NOT NULL UNIQUE
                    REFERENCES wallet_withdrawals(id) DEFERRABLE INITIALLY DEFERRED,
                created_at REAL NOT NULL)''',
            'CREATE INDEX IF NOT EXISTS wallet_auth_terms_account ON wallet_auth_terms(account_id)',
            'CREATE INDEX IF NOT EXISTS wallet_auth_challenges_device ON wallet_auth_challenges(device_id,state,expires_at)',
        )
        with wallet._transaction() as db:
            for statement in statements:
                db.execute(statement)
            row = db.execute('SELECT * FROM wallet_auth_mode').fetchone()
            if row:
                _require(row['schema_version'] == 1, 'unsupported Wallet authentication schema')
                _require(authority_id is None or authority_id == row['authority_id'], 'Wallet authority changed')
                _require(str(uuid.UUID(row['authority_id'])) == row['authority_id'], 'corrupt authority identity')
                _require(now >= row['maximum_time'], 'Wallet authentication clock moved backwards')
                self.authority_id = row['authority_id']
            else:
                self.authority_id = authority_id or str(uuid.uuid4())
                db.execute('INSERT INTO wallet_auth_mode VALUES (1,1,?,?,NULL)', (self.authority_id, now))
            for table in ('wallet_auth_credentials', 'wallet_auth_terms', 'wallet_auth_approvals'):
                for action in ('UPDATE', 'DELETE'):
                    db.execute(f'''CREATE TRIGGER IF NOT EXISTS {table}_no_{action.lower()}
                        BEFORE {action} ON {table} BEGIN SELECT RAISE(ABORT,'Wallet authentication history is immutable'); END''')
            for table, columns in (
                    ('wallet_auth_challenges', 'challenge_id,account_id,device_id,handoff_ref,challenge,issued_at,expires_at,options_json'),
                    ('wallet_auth_quotes', 'quote_id,account_id,device_id,credential_id,issue_key,amount_minor,quote_json,challenge,expires_at,options_json')):
                db.execute(f'''CREATE TRIGGER IF NOT EXISTS {table}_immutable BEFORE UPDATE OF {columns} ON {table}
                    BEGIN SELECT RAISE(ABORT,'Wallet authentication request is immutable'); END''')
                db.execute(f'''CREATE TRIGGER IF NOT EXISTS {table}_no_delete BEFORE DELETE ON {table}
                    BEGIN SELECT RAISE(ABORT,'Wallet authentication requests are retained'); END''')
            db.execute('''CREATE TRIGGER IF NOT EXISTS wallet_auth_mode_immutable BEFORE UPDATE OF
                singleton,schema_version,authority_id ON wallet_auth_mode
                BEGIN SELECT RAISE(ABORT,'Wallet authentication authority is immutable'); END''')
            db.execute('''CREATE TRIGGER IF NOT EXISTS wallet_auth_mode_no_delete BEFORE DELETE ON wallet_auth_mode
                BEGIN SELECT RAISE(ABORT,'Wallet authentication cannot be disabled'); END''')
            db.execute('''CREATE TRIGGER IF NOT EXISTS wallet_auth_account_immutable BEFORE UPDATE OF account_id
                ON wallet_auth_mode WHEN OLD.account_id IS NOT NULL AND NEW.account_id IS NOT OLD.account_id
                BEGIN SELECT RAISE(ABORT,'Wallet authentication contract cannot be replaced'); END''')
            db.execute('''CREATE TRIGGER IF NOT EXISTS wallet_auth_revocation_irreversible BEFORE UPDATE OF revoked_at
                ON wallet_auth_credential_state WHEN OLD.revoked_at IS NOT NULL
                BEGIN SELECT RAISE(ABORT,'credential revocation is irreversible'); END''')
            db.execute('''CREATE TRIGGER IF NOT EXISTS wallet_auth_withdrawal_admission BEFORE INSERT ON wallet_withdrawals
                WHEN NEW.status!='RESERVED' OR NEW.dispensed_minor!=0 OR NEW.released_minor!=0 OR NOT EXISTS (
                    SELECT 1 FROM wallet_auth_approvals a
                    JOIN wallet_auth_quotes q USING(quote_id)
                    JOIN wallet_auth_credentials c ON c.credential_id=a.credential_id
                    JOIN wallet_auth_credential_state s ON s.credential_id=c.credential_id
                    WHERE a.withdrawal_id=NEW.id AND q.state='CONSUMED' AND q.amount_minor=NEW.amount_minor
                    AND q.credential_id=c.credential_id AND q.account_id=c.account_id AND q.device_id=c.device_id
                    AND s.revoked_at IS NULL)
                BEGIN SELECT RAISE(ABORT,'verified transaction approval required before new withdrawal'); END''')
            db.execute('''CREATE TRIGGER IF NOT EXISTS wallet_auth_bill_admission BEFORE INSERT ON wallet_bills
                WHEN NOT EXISTS (
                    SELECT 1 FROM wallet_auth_mode m
                    JOIN wallet_auth_credentials c ON c.account_id=m.account_id
                    JOIN wallet_auth_credential_state s USING(credential_id)
                    WHERE m.singleton=1 AND s.revoked_at IS NULL AND EXISTS (
                        SELECT 1 FROM wallet_auth_terms t WHERE t.account_id=m.account_id
                        AND t.accepted=1 AND t.terms_version='rock-wallet-development/1'
                        AND t.rowid=(SELECT MAX(t2.rowid) FROM wallet_auth_terms t2 WHERE t2.account_id=m.account_id)))
                BEGIN SELECT RAISE(ABORT,'active contract credential and Wallet terms required before new bill'); END''')

    def _clock(self):
        now = self.clock()
        _require(type(now) in (int, float) and math.isfinite(now) and 0 <= now < 253402300679,
                 'invalid Wallet authentication clock')
        return float(now)

    def _time(self, db):
        now = self._clock()
        row = db.execute('SELECT authority_id,maximum_time FROM wallet_auth_mode WHERE singleton=1').fetchone()
        _require(row is not None and row['authority_id'] == self.authority_id, 'Wallet authentication authority missing or changed')
        _require(now >= row['maximum_time'], 'Wallet authentication clock moved backwards')
        return now

    def _observe_time(self):
        # Commit the time high-water separately, including for rejected expired
        # attempts. A failed approval must not resurrect after a clock rollback.
        with self.wallet._transaction() as db:
            now = self._time(db)
            db.execute('UPDATE wallet_auth_mode SET maximum_time=? WHERE singleton=1', (now,))
        return now

    def _context(self, context, *, new=True):
        _require(type(context) is TrustedWalletContext, 'protected purchased-device context is required')
        self.atm._context(context, issue=new)

    @staticmethod
    def _capacity(db, table):
        _require(db.execute(f'SELECT COUNT(*) FROM {table}').fetchone()[0] < MAX_RECORDS,
                 'Wallet authentication retention capacity reached')

    @staticmethod
    def _credential(db, context):
        row = db.execute('''SELECT c.*,s.record_json AS current_record,s.revoked_at
            FROM wallet_auth_credentials c JOIN wallet_auth_credential_state s USING(credential_id)
            WHERE c.device_id=?''', (context.device_id,)).fetchone()
        if row is not None:
            _require(row['account_id'] == context.owner_id, 'credential belongs to another contract')
        return row

    @staticmethod
    def _terms(db, account_id):
        row = db.execute('SELECT accepted,terms_version FROM wallet_auth_terms WHERE account_id=? ORDER BY rowid DESC LIMIT 1',
                         (account_id,)).fetchone()
        return row is not None and row['accepted'] == 1 and row['terms_version'] == TERMS_VERSION

    def _status(self, db, context):
        self._time(db)
        owner = db.execute('SELECT account_id FROM wallet_auth_mode WHERE singleton=1').fetchone()[0]
        _require(owner is None or owner == context.owner_id, 'authentication context belongs to another Wallet contract')
        credential = self._credential(db, context)
        enrolled = credential is not None and credential['revoked_at'] is None
        terms = self._terms(db, context.owner_id)
        state = 'CREDENTIAL_REQUIRED' if not enrolled else 'TERMS_REQUIRED' if not terms else 'ACTIVE'
        return {'activation_state': state, 'active': state == 'ACTIVE',
                'credential_id': credential['credential_id'] if credential else None,
                'credential_revoked': credential is not None and credential['revoked_at'] is not None,
                'wallet_terms_version': TERMS_VERSION, 'wallet_terms_accepted': terms,
                'simulation_only': True, 'authenticator_kind': 'PUBLIC_SOFTWARE_TEST_AUTHENTICATOR',
                'hardware_backed': False, 'fee_policy': FEE_POLICY}

    def status(self, context):
        self._context(context, new=False)
        with closing(self.wallet._connect()) as db:
            db.execute('BEGIN')
            return self._status(db, context)

    def require_active(self, context):
        self._context(context)
        state = self.status(context)
        _require(state['active'], 'Wallet credential enrollment and separate Wallet terms are required')
        return state

    def contract_ready(self, account_id, eligible_device_refs):
        """Pure query; the caller supplies current eligible linked-device refs."""
        _identifier(account_id)
        _require(type(eligible_device_refs) in (list, tuple, set) and len(eligible_device_refs) <= 10000,
                 'invalid current eligible device list')
        for device in eligible_device_refs:
            _identifier(device)
        with closing(self.wallet._connect()) as db:
            db.execute('BEGIN')
            self._time(db)
            if db.execute('SELECT account_id FROM wallet_auth_mode WHERE singleton=1').fetchone()[0] != account_id:
                return False
            if not self._terms(db, account_id):
                return False
            rows = db.execute('''SELECT c.device_id FROM wallet_auth_credentials c
                JOIN wallet_auth_credential_state s USING(credential_id)
                WHERE c.account_id=? AND s.revoked_at IS NULL''', (account_id,))
            eligible = set(eligible_device_refs)
            return any(row[0] in eligible for row in rows)

    def credential_for_redemption(self, account_id, device_id, withdrawal_id):
        """Read-only callback; combine with current origin-device eligibility.

        It may run while ATM holds a Wallet write transaction, so must never
        start another writer or acquire a later-ordered entitlement lock.
        Legacy credentials without a verified approval are not newly redeemed.
        """
        for value in (account_id, device_id, withdrawal_id):
            _identifier(value)
        with closing(self.wallet._connect()) as db:
            db.execute('BEGIN')
            self._time(db)
            row = db.execute('''SELECT 1 FROM wallet_auth_approvals a
                JOIN wallet_auth_credentials c USING(credential_id)
                JOIN wallet_auth_credential_state s USING(credential_id)
                JOIN wallet_auth_quotes q USING(quote_id)
                WHERE a.withdrawal_id=? AND c.account_id=? AND c.device_id=?
                AND q.account_id=c.account_id AND q.device_id=c.device_id
                AND q.state='CONSUMED' AND s.revoked_at IS NULL''',
                (withdrawal_id, account_id, device_id)).fetchone()
            return row is not None

    def _user_handle(self, account_id):
        return protocol.b64encode(hashlib.sha256(_json(['rock-wallet-user/1', self.authority_id, account_id]).encode()).digest())

    @staticmethod
    def _bind_account(db, account_id):
        row = db.execute('SELECT account_id FROM wallet_auth_mode WHERE singleton=1').fetchone()
        _require(row is not None and row[0] in (None, account_id), 'Wallet authentication belongs to another contract')
        if row[0] is None:
            db.execute('UPDATE wallet_auth_mode SET account_id=? WHERE singleton=1', (account_id,))

    def _options(self, context, challenge, credential=None):
        if credential is None:
            public = {'challenge': challenge, 'rp': {'id': protocol.RP_ID, 'name': 'Rock Wallet'},
                      'user': {'id': self._user_handle(context.owner_id), 'name': 'Rock Wallet member', 'displayName': 'Rock Wallet member'},
                      'pubKeyCredParams': [{'type': 'public-key', 'alg': -8}],
                      'authenticatorSelection': {'residentKey': 'required', 'userVerification': 'required'},
                      'attestation': 'direct', 'timeout': TTL * 1000, 'excludeCredentials': []}
            purpose = 'wallet.enroll'
        else:
            public = {'challenge': challenge, 'rpId': protocol.RP_ID,
                      'allowCredentials': [{'type': 'public-key', 'id': credential['credential_id']}],
                      'userVerification': 'required', 'timeout': TTL * 1000}
            purpose = 'wallet.atm.issue'
        return {'schema_version': 1, 'device_ref': context.device_id, 'purpose': purpose, 'publicKey': public}

    def dispatch(self, request, *, context, handoff_ref):
        _require(type(request) is dict and type(request.get('v')) is int and request['v'] == 1,
                 'Wallet authentication protocol version 1 required')
        op = request.get('op')
        _require(type(op) is str and op in FIELDS and set(request) == FIELDS[op], 'unsupported Wallet authentication fields')
        _json(request)
        self._context(context, new=op != 'wallet.auth.status' and not (op == 'wallet.terms' and request.get('accepted') is False))
        _require(type(handoff_ref) is str and 1 <= len(handoff_ref) <= 160 and handoff_ref.isascii()
                 and not any(ord(c) < 32 for c in handoff_ref), 'protected handoff reference is required')
        if op == 'wallet.auth.status':
            return {'ok': True, 'result': self.status(context)}
        _key(request['key'])
        payload = {'authority_id': self.authority_id, 'account_id': context.owner_id,
                   'device_ref': context.device_id, 'handoff_ref': handoff_ref, 'request': request}
        with self._mutex:
            self._observe_time()
            try:
                with self.wallet._transaction() as db:
                    self._time(db)
                    self._bind_account(db, context.owner_id)
                    if op == 'wallet.atm.issue':
                        # A completed response contains a bearer code. Recheck
                        # current credential revocation before replay, while
                        # retaining success across quote expiry/terms changes.
                        credential = self._credential(db, context)
                        _require(credential is not None and credential['revoked_at'] is None,
                                 'current enrolled credential is required for issuance receipt access')
                    old = self.wallet._cached(db, request['key'], op, payload)
                    if old is not None:
                        return old
                    self._capacity(db, 'wallet_idempotency')
                    if op == 'wallet.auth.begin':
                        result = self._begin(db, context, handoff_ref)
                    elif op == 'wallet.auth.enroll':
                        result = self._enroll(db, context, handoff_ref, request)
                    elif op == 'wallet.terms':
                        result = self._accept_terms(db, context, request)
                    elif op == 'wallet.atm.quote':
                        result = self._quote(db, context, request)
                    elif op == 'wallet.atm.quote.cancel':
                        result = self._cancel_quote(db, context, request)
                    else:
                        result = self._issue(db, context, request)
                    response = {'ok': True, 'result': result}
                    _json(response)
                    return self.wallet._remember(db, request['key'], op, payload, response)
            finally:
                # Also record time observed by expired/rejected operations.
                # A write failure after the business commit is uncertain; its
                # exact immutable receipt remains available for same-key retry.
                self._observe_time()

    def _begin(self, db, context, handoff_ref):
        _require(self._credential(db, context) is None, 'device already enrolled; explicit recovery is required')
        now = self._time(db)
        pending = db.execute('''SELECT * FROM wallet_auth_challenges WHERE device_id=? AND state='PENDING'
            AND expires_at>? ORDER BY issued_at DESC LIMIT 1''', (context.device_id, now)).fetchone()
        if pending is not None:
            _require(pending['account_id'] == context.owner_id and pending['handoff_ref'] == handoff_ref,
                     'pending activation belongs to another handoff or contract')
            return {'challenge_id': pending['challenge_id'], 'expires_at': pending['expires_at'],
                    'options': json.loads(pending['options_json']), 'simulation_only': True}
        self._capacity(db, 'wallet_auth_challenges')
        challenge_id, challenge = 'auth-' + str(uuid.uuid4()), protocol.b64encode(secrets.token_bytes(32))
        options = self._options(context, challenge)
        db.execute("INSERT INTO wallet_auth_challenges VALUES (?,?,?,?,?,?,?,?, 'PENDING')",
                   (challenge_id, context.owner_id, context.device_id, handoff_ref, challenge, now, now + TTL, _json(options)))
        return {'challenge_id': challenge_id, 'expires_at': now + TTL, 'options': options, 'simulation_only': True}

    def _enroll(self, db, context, handoff_ref, request):
        _identifier(request['challenge_id'])
        row = db.execute('SELECT * FROM wallet_auth_challenges WHERE challenge_id=?', (request['challenge_id'],)).fetchone()
        _require(row is not None and row['account_id'] == context.owner_id and row['device_id'] == context.device_id
                 and row['handoff_ref'] == handoff_ref, 'activation does not belong to this device, contract and handoff')
        _require(row['state'] == 'PENDING' and self._time(db) < row['expires_at'], 'activation challenge used or expired')
        _require(self._credential(db, context) is None, 'device is already enrolled')
        record = protocol.verify_registration(request['credential'], challenge=row['challenge'], rp_id=protocol.RP_ID, origin=protocol.ORIGIN)
        now = self._time(db)
        _require(now < row['expires_at'], 'activation challenge expired during verification')
        _require(db.execute('SELECT 1 FROM wallet_auth_credentials WHERE credential_id=?', (record['credential_id'],)).fetchone() is None,
                 'credential ID already belongs to an enrollment')
        self._capacity(db, 'wallet_auth_credentials')
        encoded = _json(record)
        db.execute('INSERT INTO wallet_auth_credentials VALUES (?,?,?,?,?,?)',
                   (record['credential_id'], context.owner_id, context.device_id, encoded, row['challenge_id'], now))
        db.execute('INSERT INTO wallet_auth_credential_state VALUES (?,?,NULL)', (record['credential_id'], encoded))
        db.execute("UPDATE wallet_auth_challenges SET state='USED' WHERE challenge_id=?", (row['challenge_id'],))
        return self._status(db, context) | {'receipt_kind': 'immutable_enrollment', 'challenge_id': row['challenge_id']}

    def _accept_terms(self, db, context, request):
        _require(type(request['accepted']) is bool and request['terms_version'] == TERMS_VERSION,
                 'explicit acceptance or cancellation of the exact Wallet terms is required')
        credential = self._credential(db, context)
        _require(credential is not None, 'enroll a device credential before Wallet terms')
        if request['accepted']:
            _require(credential['revoked_at'] is None, 'device credential is revoked')
        self._capacity(db, 'wallet_auth_terms')
        receipt_id = 'terms-' + str(uuid.uuid4())
        db.execute('INSERT INTO wallet_auth_terms VALUES (?,?,?,?,?,?,?)',
                   (receipt_id, context.owner_id, context.device_id, credential['credential_id'], int(request['accepted']), TERMS_VERSION, self._time(db)))
        return self._status(db, context) | {'receipt_kind': 'immutable_wallet_terms', 'terms_receipt_id': receipt_id}

    def _quote(self, db, context, request):
        _require(self._status(db, context)['active'], 'active Wallet credential and terms are required')
        _amount(request['amount_minor'], issue=True)
        _identifier(request['atm_id'])
        _key(request['issue_key'])
        _require(request['issue_key'] != request['key'], 'quote and issue need separate immutable keys')
        _require(request['atm_id'] in PUBLIC_ATM_FIXTURES, 'unsupported ATM fixture')
        _require(db.execute('SELECT 1 FROM wallet_auth_quotes WHERE issue_key=?', (request['issue_key'],)).fetchone() is None,
                 'issue key is already bound to another quote')
        _require(db.execute('SELECT 1 FROM wallet_idempotency WHERE key=?', (request['issue_key'],)).fetchone() is None,
                 'issue key is already used')
        self._capacity(db, 'wallet_auth_quotes')
        now, quote_id = self._time(db), 'quote-' + str(uuid.uuid4())
        credential = self._credential(db, context)
        quote = {'quote_id': quote_id, 'authority_id': self.authority_id, 'account_id': context.owner_id,
                 'device_ref': context.device_id, 'credential_id': credential['credential_id'], 'issue_key': request['issue_key'],
                 'currency': 'USD', 'amount_minor': request['amount_minor'], 'fee_minor': 0,
                 'total_debit_minor': request['amount_minor'], 'cash_received_minor': request['amount_minor'],
                 'atm_id': request['atm_id'], 'issued_at': now, 'expires_at': now + TTL, 'policy': FEE_POLICY}
        challenge = protocol.b64encode(secrets.token_bytes(32))
        options = self._options(context, challenge, credential)
        db.execute("INSERT INTO wallet_auth_quotes VALUES (?,?,?,?,?,?,?,?,?,?,'OPEN')",
                   (quote_id, context.owner_id, context.device_id, credential['credential_id'], request['issue_key'],
                    request['amount_minor'], _json(quote), challenge, now + TTL, _json(options)))
        return {'quote_id': quote_id, 'quote': quote, 'expires_at': now + TTL, 'options': options, 'simulation_only': True}

    @staticmethod
    def _quote_row(db, context, quote_id):
        _identifier(quote_id)
        row = db.execute('SELECT * FROM wallet_auth_quotes WHERE quote_id=?', (quote_id,)).fetchone()
        _require(row is not None and row['account_id'] == context.owner_id and row['device_id'] == context.device_id,
                 'quote belongs to another contract or device')
        return row

    def _cancel_quote(self, db, context, request):
        row = self._quote_row(db, context, request['quote_id'])
        _require(row['state'] != 'CONSUMED', 'funds already reserved; use the withdrawal cancellation and reconciliation API')
        db.execute("UPDATE wallet_auth_quotes SET state='CANCELED' WHERE quote_id=?", (row['quote_id'],))
        return {'quote_id': row['quote_id'], 'state': 'CANCELED', 'funds_reserved': False, 'simulation_only': True}

    def _issue(self, db, context, request):
        _require(self._status(db, context)['active'], 'active Wallet credential and terms are required')
        row = self._quote_row(db, context, request['quote_id'])
        _require(row['issue_key'] == request['key'], 'issue key differs from the approved quote')
        _require(row['state'] == 'OPEN' and self._time(db) < row['expires_at'], 'quote canceled, consumed or expired')
        credential = self._credential(db, context)
        _require(credential is not None and credential['revoked_at'] is None and credential['credential_id'] == row['credential_id'],
                 'quote credential missing, changed or revoked')
        record = json.loads(credential['current_record'])
        updated = protocol.verify_assertion(request['credential'], challenge=row['challenge'], rp_id=protocol.RP_ID,
                                            origin=protocol.ORIGIN, record=record, user_handle=self._user_handle(context.owner_id))
        now = self._time(db)
        _require(now < row['expires_at'], 'quote expired during verification')
        quote = json.loads(row['quote_json'])
        _require(quote['authority_id'] == self.authority_id and quote['fee_minor'] == 0
                 and quote['total_debit_minor'] == quote['cash_received_minor'] == quote['amount_minor'] == row['amount_minor']
                 and quote['currency'] == 'USD' and quote['policy'] == FEE_POLICY, 'unsupported ATM fee quote')
        self._capacity(db, 'wallet_auth_approvals')
        approval_id, withdrawal_id = 'approval-' + str(uuid.uuid4()), str(uuid.uuid4())
        db.execute('UPDATE wallet_auth_credential_state SET record_json=? WHERE credential_id=?', (_json(updated), credential['credential_id']))
        db.execute("UPDATE wallet_auth_quotes SET state='CONSUMED' WHERE quote_id=?", (row['quote_id'],))
        db.execute('INSERT INTO wallet_auth_approvals VALUES (?,?,?,?,?,?)',
                   (approval_id, row['quote_id'], credential['credential_id'], hashlib.sha256(protocol.json_bytes(request['credential'])).hexdigest(), withdrawal_id, now))
        result = self.atm._issue_in_transaction(db, quote['amount_minor'], quote['atm_id'], context=context,
                                               withdrawal_id=withdrawal_id)
        return result | {'quote_id': row['quote_id'], 'approval_id': approval_id, 'fee_minor': 0,
                         'total_debit_minor': quote['total_debit_minor'], 'cash_received_minor': quote['cash_received_minor'],
                         'authentication': 'verified_software_test_assertion'}

    def revoke_credential(self, credential_id, key):
        """Trusted server-only administrative method; never an owner dispatch op."""
        protocol.b64decode(credential_id, 1, 1023)
        _key(key)
        payload = {'authority_id': self.authority_id, 'credential_id': credential_id}
        with self._mutex:
            self._observe_time()
            with self.wallet._transaction() as db:
                old = self.wallet._cached(db, key, 'wallet.auth.revoke', payload)
                if old is not None:
                    return old
                row = db.execute('SELECT revoked_at FROM wallet_auth_credential_state WHERE credential_id=?', (credential_id,)).fetchone()
                _require(row is not None, 'unknown enrolled credential')
                if row['revoked_at'] is None:
                    db.execute('UPDATE wallet_auth_credential_state SET revoked_at=? WHERE credential_id=?', (self._time(db), credential_id))
                db.execute("UPDATE wallet_auth_quotes SET state='CANCELED' WHERE credential_id=? AND state='OPEN'", (credential_id,))
                result = {'ok': True, 'result': {'credential_id': credential_id, 'revoked': True, 'simulation_only': True}}
                return self.wallet._remember(db, key, 'wallet.auth.revoke', payload, result)

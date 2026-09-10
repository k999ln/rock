"""Authoritative purchase/payment gates over the existing entitlement database.

All credentials are deliberately public software fixtures. This controller must
share the SAME EntitlementStore object with fulfillment and the Wallet authority.
Its reentrant lock spans the caller's durable admission, never an external network
request. A second Store object/direct SQL writer does not share that guarantee.

Basic OS, installed offline Tools, own data and Wallet recovery are not actions
of this controller. Runner receipt recovery requires a current purchased device,
but never a monthly payment. Revocation of a stolen device is separate from
nonpayment; another current device of the same owner has the same tenant.

The SQLite clock highwater detects ordinary backwards clock changes after an
admission attempt. It is not a secure clock or hardware/disk antirollback.
"""
from contextlib import closing, contextmanager
import hashlib
import hmac
from types import MappingProxyType
import uuid

from blackberryrock.packages import canonical
from entitlement.protocol import (PUBLIC_TOKENS, authenticate as owner_authenticate,
                                  identifier)

PUBLIC_SERVICE_TOKENS = MappingProxyType({
    'alice-a': 'PUBLIC-FIXTURE-SERVICE-ALICE-A-v1',
    'alice-b': 'PUBLIC-FIXTURE-SERVICE-ALICE-B-v1',
    'bob': 'PUBLIC-FIXTURE-SERVICE-BOB-v1',
})
SERVICES = frozenset(('runner.cloud', 'runner.pc_usb'))
ACTIONS = frozenset(('registry.index', 'registry.package',
                     *(service + '.' + operation for service in SERVICES
                       for operation in ('submit', 'start', 'recover'))))
_TABLES = frozenset(('service_access_mode', 'service_access_consumers'))


class ServiceAuthenticationError(PermissionError):
    """Invalid service authentication, independent of current eligibility."""


class ServiceAccessDenied(PermissionError):
    """A known policy denial, not a transport/SQLite unknown outcome."""

    def __init__(self, reason):
        self.reason = reason
        super().__init__(reason)


class ServiceClockError(ServiceAccessDenied):
    pass


class ServiceConfigurationError(ValueError):
    pass


def _hash(value):
    return hashlib.sha256(canonical(value)).hexdigest()


class ServiceAccessController:
    """Fixed authority/policy and append-only alias → owner/device bindings.

    grace_seconds is an explicit development policy (0 by default, at most seven
    days). Only renewal after an actually confirmed paid period can receive it;
    there is no initial trial or grace reset on retry, reconsent or replacement.
    Paid services are a protected constructor choice, never a request field.
    """

    def __init__(self, store, *, authority_id, consumers, grace_seconds=0,
                 paid_services=('runner.cloud',)):
        try:
            if not isinstance(authority_id, str) or str(uuid.UUID(authority_id)) != authority_id:
                raise ValueError
        except (ValueError, AttributeError) as error:
            raise ServiceConfigurationError('canonical authority UUID required') from error
        if type(grace_seconds) is not int or not 0 <= grace_seconds <= 7 * 86400:
            raise ServiceConfigurationError('bounded development grace required')
        if not isinstance(paid_services, (list, tuple, set, frozenset)) or any(
                not isinstance(value, str) or value not in SERVICES for value in paid_services):
            raise ServiceConfigurationError('unknown paid service policy')
        if len(set(paid_services)) != len(paid_services):
            raise ServiceConfigurationError('duplicate paid service policy')
        if not isinstance(consumers, dict) or not 1 <= len(consumers) <= 256:
            raise ServiceConfigurationError('bounded explicit consumer bindings required')
        bindings, tokens = {}, set()
        for alias, item in consumers.items():
            try:
                identifier(alias)
                if len(alias) > 128 or not isinstance(item, dict) or set(item) != {'owner_actor', 'device_ref', 'token'}:
                    raise ValueError
                identifier(item['device_ref'], fixture=True)
                principal = owner_authenticate(PUBLIC_TOKENS[item['owner_actor']], 'owner')
                token = item['token']
                if token not in PUBLIC_SERVICE_TOKENS.values() or token in tokens:
                    raise ValueError
            except (ValueError, KeyError, TypeError) as error:
                raise ServiceConfigurationError('invalid or reused public service binding') from error
            tokens.add(token)
            record = {'consumer_id': alias, 'owner_actor': principal['actor'],
                      'owner_ref': principal['owner_ref'], 'device_ref': item['device_ref'],
                      'token_sha256': hashlib.sha256(token.encode('ascii')).hexdigest()}
            record['binding_sha256'] = _hash(record)
            bindings[alias] = MappingProxyType({**record, 'token': token})
        self.store = store
        self._authority_id = authority_id
        self._bindings = MappingProxyType(bindings)
        self._grace_seconds = grace_seconds
        self._paid_services = frozenset(paid_services)
        policy = {'schema_version': 1, 'simulation_only': True,
                  'initial_grace_seconds': 0, 'renewal_grace_seconds': grace_seconds,
                  'paid_services': sorted(paid_services),
                  'purchase_required': sorted(ACTIONS),
                  'paid_recovery_required': False}
        self._policy_json = canonical(policy).decode()
        self._policy_id = 'service-policy-' + _hash(policy)
        with self.store._transaction() as db:
            tables = {row[0] for row in db.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'service_access_%'")}
            if tables and tables != _TABLES:
                raise ServiceConfigurationError('partial or unknown closed-service schema')
            if not tables:
                self._create_schema(db)
                db.execute('INSERT INTO service_access_mode VALUES (1,1,1,?,?,?,?,0)',
                           (authority_id, self.policy_id, self._policy_json, 'public-fixture-only'))
            self._mode(db)
            old = {row['consumer_id']: dict(row) for row in db.execute('SELECT * FROM service_access_consumers')}
            if not set(old) <= set(bindings):
                raise ServiceConfigurationError('retained consumer bindings must not be silently removed')
            for alias, binding in bindings.items():
                persisted = {key: value for key, value in binding.items() if key != 'token'}
                if alias in old:
                    if old[alias] != persisted:
                        raise ServiceConfigurationError('consumer rebinding requires explicit migration')
                else:
                    db.execute('INSERT INTO service_access_consumers VALUES (?,?,?,?,?,?)',
                               tuple(persisted[key] for key in ('consumer_id', 'owner_actor', 'owner_ref',
                                                               'device_ref', 'token_sha256', 'binding_sha256')))

    @property
    def authority_id(self):
        return self._authority_id

    @property
    def policy_id(self):
        return self._policy_id

    @staticmethod
    def _create_schema(db):
        statements = (
            'CREATE TABLE service_access_mode (singleton INTEGER PRIMARY KEY CHECK(singleton=1), '
            'schema_version INTEGER NOT NULL CHECK(schema_version=1), closed_mode INTEGER NOT NULL CHECK(closed_mode=1), '
            'authority_id TEXT NOT NULL, policy_id TEXT NOT NULL, policy_json TEXT NOT NULL, '
            'credential_scope TEXT NOT NULL, maximum_time INTEGER NOT NULL CHECK(maximum_time>=0))',
            'CREATE TABLE service_access_consumers (consumer_id TEXT PRIMARY KEY, owner_actor TEXT NOT NULL, '
            'owner_ref TEXT NOT NULL, device_ref TEXT NOT NULL, token_sha256 TEXT NOT NULL UNIQUE, binding_sha256 TEXT NOT NULL)',
            "CREATE TRIGGER service_access_mode_retained BEFORE DELETE ON service_access_mode "
            "BEGIN SELECT RAISE(ABORT,'closed-service mode is retained'); END",
            'CREATE TRIGGER service_access_mode_immutable BEFORE UPDATE OF singleton,schema_version,closed_mode,'
            'authority_id,policy_id,policy_json,credential_scope ON service_access_mode '
            "BEGIN SELECT RAISE(ABORT,'closed-service identity and policy are immutable'); END",
            'CREATE TRIGGER service_access_clock_monotonic BEFORE UPDATE OF maximum_time ON service_access_mode '
            'WHEN NEW.maximum_time<OLD.maximum_time '
            "BEGIN SELECT RAISE(ABORT,'service clock cannot move backwards'); END",
            'CREATE TRIGGER service_access_consumers_no_update BEFORE UPDATE ON service_access_consumers '
            "BEGIN SELECT RAISE(ABORT,'consumer bindings are immutable'); END",
            'CREATE TRIGGER service_access_consumers_no_delete BEFORE DELETE ON service_access_consumers '
            "BEGIN SELECT RAISE(ABORT,'consumer bindings are retained'); END",
        )
        for statement in statements:
            db.execute(statement)

    def _mode(self, db):
        rows = db.execute('SELECT * FROM service_access_mode').fetchall()
        if len(rows) != 1:
            raise ServiceConfigurationError('closed-service authority marker missing')
        mode = dict(rows[0])
        expected = {'singleton': 1, 'schema_version': 1, 'closed_mode': 1,
                    'authority_id': self.authority_id, 'policy_id': self.policy_id,
                    'policy_json': self._policy_json, 'credential_scope': 'public-fixture-only'}
        if {key: mode.get(key) for key in expected} != expected or type(mode.get('maximum_time')) is not int:
            raise ServiceConfigurationError('closed-service authority or policy mismatch')
        return mode

    def _binding(self, db, alias):
        if not isinstance(alias, str) or alias not in self._bindings:
            raise ServiceAuthenticationError('unknown service consumer')
        binding = self._bindings[alias]
        persisted = db.execute('SELECT * FROM service_access_consumers WHERE consumer_id=?', (alias,)).fetchone()
        if persisted is None or dict(persisted) != {k: v for k, v in binding.items() if k != 'token'}:
            raise ServiceConfigurationError('closed-service consumer binding mismatch')
        return binding

    def authenticate(self, consumer_id, authorization):
        """Authenticate a fixed alias/token; current purchase is checked by guard."""
        if not isinstance(consumer_id, str) or consumer_id not in self._bindings:
            raise ServiceAuthenticationError('invalid service authentication')
        expected = 'Bearer ' + self._bindings[consumer_id]['token']
        if (not isinstance(authorization, str) or len(authorization) > 256 or not authorization.isascii()
                or not hmac.compare_digest(authorization.encode('utf-8'), expected.encode('ascii'))):
            raise ServiceAuthenticationError('invalid service authentication')
        with self.store._mutex, closing(self.store._connect()) as db:
            db.execute('BEGIN')
            self._mode(db)
            self._binding(db, consumer_id)
        return consumer_id

    def _state(self, db, alias):
        mode, binding = self._mode(db), self._binding(db, alias)
        now = self.store._now()
        device = db.execute('SELECT * FROM devices WHERE device_ref=?', (binding['device_ref'],)).fetchone()
        if device is None:
            purchase_reason = 'PURCHASE_REQUIRED'
        elif device['owner_ref'] != binding['owner_ref']:
            purchase_reason = 'OWNER_MISMATCH'
        elif device['state'] != 'ACTIVE':
            purchase_reason = 'DEVICE_SUSPENDED'
        elif now < device['verified_at']:
            purchase_reason = 'VERIFICATION_NOT_YET_VALID'
        elif now >= device['valid_until']:
            purchase_reason = 'IDENTITY_EXPIRED'
        else:
            purchase_reason = None
        # A purchased replacement can read free Store without creating/linking a
        # Wallet. Paid admission resolves the existing owner contract only after
        # this exact signed device/owner check, never from a request account id.
        account = db.execute('SELECT * FROM accounts WHERE owner_ref=?', (binding['owner_ref'],)).fetchall()
        if len(account) > 1:
            raise ServiceConfigurationError('ambiguous owner contract needs explicit migration')
        account = dict(account[0]) if account else None
        if account is not None:
            linked = db.execute('SELECT account_id FROM account_devices WHERE device_ref=?', (binding['device_ref'],)).fetchone()
            if linked is not None and linked[0] != account['account_id']:
                raise ServiceConfigurationError('signed device and contract linkage disagree')
        paid_through = account['access_until'] if account else 0
        auto_renew = bool(account and account['auto_renew'] and account['consent_id'])
        grace_until = paid_through + self._grace_seconds if paid_through and auto_renew else 0
        confirmed = db.execute("SELECT MAX(period_end) FROM authorizations WHERE account_id=? AND state='PAID' "
                               'AND wallet_bill_id IS NOT NULL', (account['account_id'],)).fetchone()[0] if account else None
        # access_until is a projection of applied confirmed billing observations;
        # malformed/inconsistent projection is not a payment proof.
        consistent = paid_through == (confirmed or 0)
        pending = bool(account and db.execute("SELECT 1 FROM authorizations WHERE account_id=? AND state='CLAIMED' LIMIT 1",
                                             (account['account_id'],)).fetchone())
        if not account:
            paid_state, reason = 'PAUSED', 'WALLET_UNREGISTERED'
        elif not consistent:
            paid_state, reason = 'PAUSED', 'PAYMENT_RECONCILIATION_REQUIRED'
        elif now < paid_through:
            paid_state, reason = 'PAID', 'CONFIRMED_PAYMENT'
        elif auto_renew and paid_through and now < grace_until:
            paid_state, reason = 'GRACE', 'RENEWAL_GRACE'
        else:
            paid_state = 'PAUSED'
            reason = ('CONSENT_REQUIRED' if account['consent_id'] is None else
                      'SUBSCRIPTION_CANCELED' if not auto_renew else
                      'FIRST_PAYMENT_REQUIRED' if not paid_through else 'PAYMENT_REQUIRED')
        clock_rollback = now < mode['maximum_time']
        if clock_rollback:
            paid_state, reason = 'PAUSED', 'CLOCK_ROLLBACK'
        eligible = purchase_reason is None and not clock_rollback
        allowed = []
        if eligible:
            for action in sorted(ACTIONS):
                service, _, operation = action.rpartition('.')
                if (service not in self._paid_services or operation == 'recover'
                        or paid_state in ('PAID', 'GRACE')):
                    allowed.append(action)
        minimal = {'authority_id': self.authority_id, 'consumer_id': alias,
                   'owner_ref': binding['owner_ref'], 'device_ref': binding['device_ref'],
                   'tenant': 'tenant-' + _hash([self.authority_id, binding['owner_ref']]),
                   'account_id': account['account_id'] if account else None,
                   'paid_state': paid_state, 'access_until': paid_through,
                   'policy_id': self.policy_id, 'simulation_only': True}
        return {**minimal, 'device_eligible': purchase_reason is None,
                'purchase_reason': purchase_reason, 'paid_state_reason': reason,
                'grace_until': grace_until, 'auto_renew': auto_renew,
                'reconciliation_pending': pending, 'allowed_actions': allowed,
                'evaluated_at': now, 'clock_rollback': clock_rollback}, minimal

    def snapshot(self, alias):
        """Pure live status, not a reusable admission grant or offline payment."""
        with self.store._mutex, closing(self.store._connect()) as db:
            db.execute('BEGIN')
            state, _ = self._state(db, alias)
            return state

    @contextmanager
    def guard(self, alias, action):
        """Linearize live policy with a caller's local durable admission.

        Acquire this before Registry/Runner locks. Reentrant nesting is valid;
        no entitlement SQL transaction remains open while the caller runs.
        Expired/paused admission attempts also advance the clock highwater, so
        a later backwards clock cannot restore their previous access.
        """
        if not isinstance(action, str) or action not in ACTIONS:
            raise ServiceAccessDenied('UNKNOWN_SERVICE_ACTION')
        with self.store._mutex:
            with self.store._transaction() as db:
                state, minimal = self._state(db, alias)
                if not state['clock_rollback']:
                    db.execute('UPDATE service_access_mode SET maximum_time=? WHERE singleton=1 AND maximum_time<?',
                               (state['evaluated_at'], state['evaluated_at']))
            if state['clock_rollback']:
                raise ServiceClockError('CLOCK_ROLLBACK')
            if not state['device_eligible']:
                raise ServiceAccessDenied(state['purchase_reason'])
            if action not in state['allowed_actions']:
                raise ServiceAccessDenied(state['paid_state_reason'])
            yield minimal

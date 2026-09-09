"""Small, validated purchaser-service display status; never an admission grant.

The same authority's controller supplies the live view. Validation checks internal
consistency, not payment authenticity or freshness: the authenticated transport
and its authority/device binding remain necessary, and every new execution still
uses the controller's live guard. No Wallet mutation occurs here.
"""
import re
import uuid

from entitlement.protocol import CURRENCY, MONTHLY_FEE_MINOR, TERMS_VERSION, identifier
from .controller import ACTIONS, SERVICES

SCHEMA = 'rock-purchaser-service-status/1'
FIELDS = frozenset(('schema', 'authority_id', 'consumer_id', 'device_ref', 'policy_id',
    'paid_services', 'monthly_fee_minor', 'currency', 'terms_version', 'paid_state',
    'access_until', 'grace_until', 'auto_renew', 'reconciliation_pending',
    'device_eligible', 'purchase_reason', 'paid_state_reason', 'evaluated_at',
    'clock_rollback', 'allowed_actions', 'simulation_only'))
PURCHASE_REASONS = frozenset(('PURCHASE_REQUIRED', 'OWNER_MISMATCH', 'DEVICE_SUSPENDED',
                            'VERIFICATION_NOT_YET_VALID', 'IDENTITY_EXPIRED'))
PAUSED_REASONS = frozenset(('WALLET_UNREGISTERED', 'PAYMENT_RECONCILIATION_REQUIRED',
    'CONSENT_REQUIRED', 'SUBSCRIPTION_CANCELED', 'FIRST_PAYMENT_REQUIRED',
    'PAYMENT_REQUIRED', 'CLOCK_ROLLBACK'))


def _require(condition, message):
    if not condition:
        raise ValueError(message)


def _members(value, permitted, label):
    _require(type(value) is list and len(value) <= len(permitted), 'invalid ' + label)
    _require(all(type(item) is str and item in permitted for item in value), 'unknown ' + label)
    _require(len(value) == len(set(value)), 'duplicate ' + label)
    return set(value)


def validate(status, *, authority_id=None, device_ref=None, consumer_id=None):
    """Return a detached minimal view or raise ValueError; never trust stale grants.

    policy_id is an authenticated opaque digest. The full immutable policy (for
    example a grace duration before the first payment) is intentionally absent,
    so its digest cannot be recomputed from this projection alone.
    """
    _require(type(status) is dict and set(status) == FIELDS, 'unknown service status fields')
    for name in ('schema', 'authority_id', 'consumer_id', 'device_ref', 'policy_id',
                 'currency', 'terms_version', 'paid_state', 'paid_state_reason'):
        _require(type(status[name]) is str, 'invalid service status text')
    _require(status['schema'] == SCHEMA, 'unknown service status schema')
    authority = status['authority_id']
    try:
        _require(type(authority) is str and str(uuid.UUID(authority)) == authority,
                 'canonical service authority required')
    except (ValueError, AttributeError) as error:
        raise ValueError('canonical service authority required') from error
    identifier(status['consumer_id'])
    _require(len(status['consumer_id']) <= 128, 'service consumer exceeds bound')
    identifier(status['device_ref'], fixture=True)
    for name, expected in (('authority_id', authority_id), ('device_ref', device_ref),
                           ('consumer_id', consumer_id)):
        _require(expected is None or status[name] == expected, 'service context mismatch')
    _require(type(status['policy_id']) is str and
             re.fullmatch(r'service-policy-[0-9a-f]{64}', status['policy_id']) is not None,
             'invalid service policy identifier')
    _require(type(status['monthly_fee_minor']) is int and
             status['monthly_fee_minor'] == MONTHLY_FEE_MINOR and status['currency'] == CURRENCY
             and status['terms_version'] == TERMS_VERSION, 'unexpected monthly terms')
    for name in ('auto_renew', 'reconciliation_pending', 'device_eligible', 'clock_rollback', 'simulation_only'):
        _require(type(status[name]) is bool, 'invalid service status boolean')
    _require(status['simulation_only'], 'only public service simulation is supported')
    for name in ('access_until', 'grace_until', 'evaluated_at'):
        _require(type(status[name]) is int and 0 <= status[name] < 2**63, 'invalid service timestamp')
    paid = _members(status['paid_services'], SERVICES, 'paid services')
    actions = _members(status['allowed_actions'], ACTIONS, 'service actions')
    state, reason, purchase = status['paid_state'], status['paid_state_reason'], status['purchase_reason']
    _require(type(state) is str and state in ('PAID', 'GRACE', 'PAUSED'), 'unknown paid state')
    _require(type(reason) is str and reason in PAUSED_REASONS | {'CONFIRMED_PAYMENT', 'RENEWAL_GRACE'},
             'unknown paid state reason')
    _require(purchase is None or type(purchase) is str and purchase in PURCHASE_REASONS,
             'unknown purchase reason')
    _require(status['device_eligible'] == (purchase is None), 'inconsistent purchase eligibility')
    now, until, grace = (status[name] for name in ('evaluated_at', 'access_until', 'grace_until'))
    renew = status['auto_renew']
    if not renew or not until:
        _require(grace == 0, 'grace needs a previously paid renewing contract')
    else:
        _require(until <= grace <= until + 7 * 86400, 'renewal grace is not bounded from paid period')
    if status['clock_rollback']:
        _require(state == 'PAUSED' and reason == 'CLOCK_ROLLBACK', 'rollback must pause service')
    else:
        _require(reason != 'CLOCK_ROLLBACK', 'clock reason mismatch')
        if state == 'PAID':
            _require(reason == 'CONFIRMED_PAYMENT' and now < until, 'unconfirmed or expired paid service')
        elif state == 'GRACE':
            _require(reason == 'RENEWAL_GRACE' and renew and 0 < until <= now < grace,
                     'invalid renewing grace period')
        else:
            _require(reason in PAUSED_REASONS, 'paused service reason mismatch')
            if reason != 'PAYMENT_RECONCILIATION_REQUIRED':
                _require(now >= until and not (renew and until and now < grace),
                         'paid remainder or valid grace must not be paused')
            if reason == 'WALLET_UNREGISTERED':
                _require(until == grace == 0 and not renew and not status['reconciliation_pending'],
                         'unregistered Wallet cannot have payment state')
            elif reason in ('CONSENT_REQUIRED', 'SUBSCRIPTION_CANCELED'):
                _require(not renew, 'missing or canceled consent cannot renew')
            elif reason == 'FIRST_PAYMENT_REQUIRED':
                _require(renew and until == 0, 'first payment state mismatch')
            elif reason == 'PAYMENT_REQUIRED':
                _require(renew and until > 0, 'renewal payment state mismatch')
    expected_actions = set()
    if status['device_eligible'] and not status['clock_rollback']:
        expected_actions = {action for action in ACTIONS
            if action.rpartition('.')[0] not in paid or action.endswith('.recover') or state in ('PAID', 'GRACE')}
    _require(actions == expected_actions, 'service actions disagree with current policy and state')
    return {**status, 'paid_services': list(status['paid_services']), 'allowed_actions': list(status['allowed_actions'])}


def build(controller, alias):
    """Pure controller read. Its immutable policy currently has no public getter.

    _paid_services is a constructor-fixed frozenset; reading it does not consult a
    second DB, infer a payment from Wallet balance, or mutate the controller.
    """
    snapshot = controller.snapshot(alias)
    fixed = {'schema': SCHEMA, 'paid_services': sorted(controller._paid_services),
             'monthly_fee_minor': MONTHLY_FEE_MINOR, 'currency': CURRENCY,
             'terms_version': TERMS_VERSION}
    return validate({name: fixed[name] if name in fixed else snapshot[name] for name in FIELDS},
                    authority_id=controller.authority_id, consumer_id=alias)

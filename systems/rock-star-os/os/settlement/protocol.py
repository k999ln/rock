"""Domain-separated HMAC using an EXISTING public fixture, never a live key."""
import hashlib
import hmac
import json
import re

from entitlement.protocol import PUBLIC_TOKENS

PROVIDER = 'public-fixture-provider'
DOMAIN = b'RockDeveloperSettlement-PUBLIC-FIXTURE-v1\0'
MAX_BYTES = 16384
MAX_AMOUNT = 100_000_000


class Denied(PermissionError): pass
class Conflict(ValueError): pass
class Unavailable(OSError): pass


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False, allow_nan=False).encode()


def digest(value): return hashlib.sha256(canonical(value)).hexdigest()


def identifier(value):
    if not isinstance(value, str) or not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.:@-]{0,159}', value):
        raise ValueError('invalid bounded identifier')
    return value


def fields(value, expected):
    if type(value) is not dict or set(value) != set(expected):
        raise ValueError('missing or unknown field')


def amount(value, zero=False):
    if type(value) is not int or not (0 if zero else 1) <= value <= MAX_AMOUNT:
        raise ValueError('integer USD cents required')
    return value


def decode(raw):
    if type(raw) is not bytes or len(raw) > MAX_BYTES:
        raise ValueError('bounded raw JSON required')
    def pairs(items):
        result = {}
        for key, value in items:
            if key in result: raise ValueError('duplicate JSON field')
            result[key] = value
        return result
    def invalid(_): raise ValueError('non-finite number')
    try:
        return json.loads(raw.decode(), object_pairs_hook=pairs, parse_constant=invalid)
    except (UnicodeError, RecursionError) as error:
        raise ValueError('invalid JSON') from error


def signature(payload):
    return hmac.new(PUBLIC_TOKENS['wallet'].encode(), DOMAIN + canonical(payload), hashlib.sha256).hexdigest()


def signed(payload):
    """Public test helper; everyone knows this fixture key."""
    return {'payload': payload, 'signature': signature(payload)}


def verified(envelope):
    fields(envelope, ('payload', 'signature'))
    if len(canonical(envelope)) > MAX_BYTES: raise ValueError('envelope exceeds limit')
    supplied = envelope['signature']
    if type(supplied) is not str or not re.fullmatch('[0-9a-f]{64}', supplied):
        raise Denied('invalid public fixture signature')
    if not hmac.compare_digest(signature(envelope['payload']), supplied):
        raise Denied('invalid public fixture signature')
    return decode(canonical(envelope['payload']))


def event_payload(value):
    fields(value, ('schema_version', 'authority_id', 'provider_id', 'developer_id',
                   'provider_account', 'event_id', 'kind', 'currency', 'record'))
    if type(value['schema_version']) is not int or value['schema_version'] != 1:
        raise ValueError('unsupported event schema')
    for name in ('authority_id', 'provider_id', 'developer_id', 'provider_account', 'event_id'):
        identifier(value[name])
    if value['provider_id'] != PROVIDER or value['currency'] != 'USD':
        raise Denied('fixture provider and USD only')
    record = value['record']
    if value['kind'] in ('sale', 'settled'):
        fields(record, ('sale_id', 'gross_minor', 'fee_minor', 'net_minor'))
        identifier(record['sale_id']); amount(record['gross_minor']); amount(record['fee_minor'], True); amount(record['net_minor'])
        if record['gross_minor'] != record['fee_minor'] + record['net_minor']:
            raise ValueError('authoritative gross, fee and net do not reconcile')
    elif value['kind'] == 'payout.result':
        fields(record, ('business_key', 'amount_minor', 'fee_minor', 'paid_minor', 'state'))
        identifier(record['business_key']); amount(record['amount_minor']); amount(record['paid_minor'], True)
        if type(record['fee_minor']) is not int or record['fee_minor'] != 0:
            raise ValueError('only explicit zero-fee fixture payouts supported')
        if record['state'] not in ('paid', 'failed_no_transfer', 'pending', 'not_found'):
            raise ValueError('invalid provider result')
        expected = record['amount_minor'] if record['state'] == 'paid' else 0
        if record['paid_minor'] != expected: raise ValueError('provider paid amount mismatch')
    else:
        raise Denied('Tool success is not an authoritative financial event')
    return value

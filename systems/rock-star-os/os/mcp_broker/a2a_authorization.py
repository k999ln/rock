"""Portable, input-bound Broker proof format for A2A delegation."""
import hashlib
import json
import re
from urllib.parse import urlsplit

from .http import MAX_INPUT, identifier

SCHEMA = 'rock-a2a-broker-authorization/2'
DOMAIN = b'rock-a2a-broker-authorization-signature/2\0'
MAX_PROOF_LIFETIME_MS = 5 * 60_000
SIGNED_FIELDS = (
    'schema', 'authorityId', 'ownerUserId', 'deviceRef', 'delegationId',
    'parentJobId', 'messageId', 'targetOrigin', 'targetAgentName',
    'targetAgentVersion', 'protocolVersion', 'inputSha256', 'budgetCurrency',
    'budgetLimitMinor', 'continueWhileDeviceOffline', 'deadlineAt', 'authorizationSha256', 'issuedAt',
    'expiresAt', 'keyId',
)
INTENT_FIELDS = {
    'id', 'parentJobId', 'messageId', 'targetOrigin', 'targetAgentName',
    'targetAgentVersion', 'protocolVersion', 'budgetCurrency',
    'budgetLimitMinor', 'parentBudgetLimitMinor', 'continueWhileDeviceOffline', 'deadlineAt', 'message',
}


def _canonical(value):
    return json.dumps(value, separators=(',', ':'), ensure_ascii=False,
                      allow_nan=False).encode('utf-8')


def _public_https_origin(value):
    if type(value) is not str or len(value) > 512:
        raise ValueError('canonical public HTTPS origin required')
    try:
        parsed = urlsplit(value)
        hostname = parsed.hostname
        port = parsed.port
    except (ValueError, TypeError):
        raise ValueError('canonical public HTTPS origin required') from None
    if (parsed.scheme != 'https' or hostname is None or port is not None or
            parsed.username is not None or parsed.password is not None or
            parsed.path not in ('', '/') or parsed.query or parsed.fragment or
            hostname != hostname.lower() or not hostname.isascii() or
            not re.fullmatch(r'(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}', hostname) or
            hostname.endswith(('.localhost', '.local', '.internal', '.test', '.invalid'))):
        raise ValueError('canonical public HTTPS origin required')
    return 'https://' + hostname


def build_authorization_proof(authority_id, owner_user_id, device_ref, intent,
                              issued_at, expires_at, key_id):
    """Build stable fields shared with lib/a2a-broker-authorization.ts."""
    identifier(authority_id); identifier(owner_user_id); identifier(device_ref)
    if type(intent) is not dict or set(intent) != INTENT_FIELDS:
        raise ValueError('exact A2A delegation intent required')
    for field in ('id', 'parentJobId', 'messageId'):
        identifier(intent[field])
    for field in ('targetAgentName', 'targetAgentVersion'):
        if type(intent[field]) is not str or not intent[field].strip() or len(intent[field].encode()) > 256:
            raise ValueError('bounded agent identity required')
    origin = _public_https_origin(intent['targetOrigin'])
    if intent['protocolVersion'] != '1.0':
        raise ValueError('unsupported A2A protocol version')
    if type(intent['budgetCurrency']) is not str or not re.fullmatch('[A-Z]{3}', intent['budgetCurrency']):
        raise ValueError('ISO currency code required')
    if type(intent['budgetLimitMinor']) is not int or not 0 <= intent['budgetLimitMinor'] <= 2**53 - 1:
        raise ValueError('bounded budget limit required')
    if (type(intent['parentBudgetLimitMinor']) is not int or
            intent['parentBudgetLimitMinor'] < intent['budgetLimitMinor'] or
            intent['parentBudgetLimitMinor'] > 2**53 - 1):
        raise ValueError('parent budget must cover the child limit')
    if type(intent['deadlineAt']) is not int or not 0 <= intent['deadlineAt'] < 2**53:
        raise ValueError('millisecond deadline required')
    if intent['continueWhileDeviceOffline'] is not True:
        raise ValueError('explicit offline continuation consent required')
    if type(intent['message']) is not str or not intent['message'].strip() or len(intent['message'].encode()) > MAX_INPUT:
        raise ValueError('bounded nonempty delegation message required')
    if type(issued_at) is not int or type(expires_at) is not int or expires_at <= issued_at or expires_at - issued_at > MAX_PROOF_LIFETIME_MS:
        raise ValueError('short-lived proof timestamps required')
    if expires_at > intent['deadlineAt']:
        raise ValueError('proof cannot outlive its delegation')
    identifier(key_id)

    input_sha256 = hashlib.sha256(intent['message'].encode('utf-8')).hexdigest()
    authorization_payload = {
        'ownerUserId': owner_user_id,
        'id': intent['id'],
        'parentJobId': intent['parentJobId'],
        'messageId': intent['messageId'],
        'targetOrigin': origin,
        'targetAgentName': intent['targetAgentName'],
        'targetAgentVersion': intent['targetAgentVersion'],
        'protocolVersion': intent['protocolVersion'],
        'inputSha256': input_sha256,
        'budgetCurrency': intent['budgetCurrency'],
        'budgetLimitMinor': intent['budgetLimitMinor'],
        'parentBudgetLimitMinor': intent['parentBudgetLimitMinor'],
        'continueWhileDeviceOffline': intent['continueWhileDeviceOffline'],
        'deadlineAt': intent['deadlineAt'],
    }
    authorization_sha256 = hashlib.sha256(_canonical(authorization_payload)).hexdigest()
    proof = {
        'schema': SCHEMA,
        'authorityId': authority_id,
        'ownerUserId': owner_user_id,
        'deviceRef': device_ref,
        'delegationId': intent['id'],
        'parentJobId': intent['parentJobId'],
        'messageId': intent['messageId'],
        'targetOrigin': origin,
        'targetAgentName': intent['targetAgentName'],
        'targetAgentVersion': intent['targetAgentVersion'],
        'protocolVersion': intent['protocolVersion'],
        'inputSha256': input_sha256,
        'budgetCurrency': intent['budgetCurrency'],
        'budgetLimitMinor': intent['budgetLimitMinor'],
        'continueWhileDeviceOffline': intent['continueWhileDeviceOffline'],
        'deadlineAt': intent['deadlineAt'],
        'authorizationSha256': authorization_sha256,
        'issuedAt': issued_at,
        'expiresAt': expires_at,
        'keyId': key_id,
    }
    return proof


def signing_bytes(proof):
    if type(proof) is not dict or set(proof) != set(SIGNED_FIELDS):
        raise ValueError('unsigned A2A Broker proof fields required')
    ordered = {name: proof[name] for name in SIGNED_FIELDS}
    return DOMAIN + _canonical(ordered)


def encode_signature(signature):
    if type(signature) is not bytes or len(signature) != 64:
        raise ValueError('Ed25519 signature must be 64 bytes')
    import base64
    return base64.urlsafe_b64encode(signature).rstrip(b'=').decode('ascii')

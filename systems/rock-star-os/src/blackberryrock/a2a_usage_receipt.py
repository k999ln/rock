"""Verify the shared Cloud/native A2A provider usage-receipt contract.

This module only verifies public-key signatures. Trust inventory must be
operator supplied; the checked-in RFC fixture key is public test material.
"""
import base64
import json
import re
import subprocess
import tempfile
import time
from pathlib import Path
from urllib.parse import urlsplit


SCHEMA = 'rock-a2a-provider-usage-receipt/1'
DOMAIN = b'rock-a2a-provider-usage-receipt-signature/1\0'
FIELDS = (
    'schema', 'providerId', 'keyId', 'receiptId', 'ownerUserId', 'parentJobId',
    'delegationId', 'taskId', 'agentOrigin', 'agentName', 'agentVersion',
    'currency', 'amountMinor', 'pricingVersion', 'issuedAt', 'usage',
)
IDENTIFIER = re.compile(r'^[A-Za-z0-9._:-]{1,128}$')
SIGNATURE = re.compile(r'^[A-Za-z0-9_-]{86}$')
SAFE_INTEGER = 2**53 - 1
DOMAIN_HOST = re.compile(r'(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$')


def _canonical(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':'), allow_nan=False).encode('utf-8')


def signing_bytes(receipt):
    """Return the exact ordered bytes shared with lib/a2a-usage-receipt.ts."""
    if type(receipt) is not dict or set(receipt) != set(FIELDS) | {'signature'}:
        raise ValueError('exact A2A usage receipt fields required')
    ordered = {}
    for name in FIELDS:
        if name == 'usage':
            usage = receipt[name]
            if type(usage) is not list:
                raise ValueError('usage must be an array')
            ordered[name] = []
            for line in usage:
                if type(line) is not dict or set(line) != {'meter', 'quantity', 'unit', 'amountMinor'}:
                    raise ValueError('invalid usage meter')
                ordered[name].append({
                    field: line[field] for field in ('meter', 'quantity', 'unit', 'amountMinor')
                })
        else:
            ordered[name] = receipt[name]
    return DOMAIN + _canonical(ordered)


def _valid_origin(value):
    if type(value) is not str or len(value) > 512:
        return False
    try:
        parts = urlsplit(value)
        host = parts.hostname
        port = parts.port
    except (TypeError, ValueError):
        return False
    return bool(
        parts.scheme == 'https' and host and host == host.lower() and host.isascii()
        and DOMAIN_HOST.fullmatch(host) is not None
        and port is None and parts.username is None and parts.password is None
        and parts.path == '' and not parts.query and not parts.fragment
        and value == 'https://' + host and not host.endswith(('.localhost', '.local', '.internal', '.test', '.invalid'))
    )


def _verify_signature(public_key, signature, payload):
    if type(public_key) is not bytes or len(public_key) != 32 or type(signature) is not bytes or len(signature) != 64:
        return False
    try:
        with tempfile.TemporaryDirectory(prefix='rock-a2a-receipt-') as temporary:
            root = Path(temporary)
            (root / 'key.der').write_bytes(bytes.fromhex('302a300506032b6570032100') + public_key)
            (root / 'signature').write_bytes(signature)
            (root / 'payload').write_bytes(payload)
            result = subprocess.run(
                ['openssl', 'pkeyutl', '-verify', '-pubin', '-inkey', str(root / 'key.der'),
                 '-keyform', 'DER', '-rawin', '-in', str(root / 'payload'), '-sigfile', str(root / 'signature')],
                capture_output=True, timeout=5,
            )
    except (OSError, subprocess.TimeoutExpired):
        return False
    return result.returncode == 0


def _trusted_keys(configuration):
    if type(configuration) is not str or len(configuration) > 65_536:
        return None
    try:
        entries = json.loads(configuration)
    except (ValueError, TypeError):
        return None
    if type(entries) is not list or len(entries) > 256:
        return None
    result = {}
    for entry in entries:
        if (type(entry) is not dict or set(entry) != {'providerId', 'keyId', 'agentOrigin', 'publicKeyHex', 'status'}
                or any(type(entry.get(name)) is not str or not IDENTIFIER.fullmatch(entry[name])
                       for name in ('providerId', 'keyId'))
                or not _valid_origin(entry.get('agentOrigin'))
                or type(entry.get('publicKeyHex')) is not str
                or re.fullmatch(r'[a-fA-F0-9]{64}', entry['publicKeyHex']) is None
                or entry.get('status') not in ('active', 'revoked')):
            return None
        identity = (entry['providerId'], entry['keyId'], entry['agentOrigin'])
        if identity in result:
            return None
        result[identity] = bytes.fromhex(entry['publicKeyHex']) if entry['status'] == 'active' else None
    return result


def _valid_receipt(receipt, hold, now_ms):
    if type(receipt) is not dict or set(receipt) != set(FIELDS) | {'signature'}:
        return False
    if receipt.get('schema') != SCHEMA:
        return False
    for name in ('providerId', 'keyId', 'receiptId', 'ownerUserId', 'parentJobId', 'delegationId', 'taskId', 'pricingVersion'):
        if type(receipt.get(name)) is not str or not IDENTIFIER.fullmatch(receipt[name]):
            return False
    if (not _valid_origin(receipt.get('agentOrigin'))
            or type(receipt.get('agentName')) is not str or not receipt['agentName'].strip() or len(receipt['agentName'].encode()) > 256
            or type(receipt.get('agentVersion')) is not str or not receipt['agentVersion'].strip() or len(receipt['agentVersion'].encode()) > 256
            or type(receipt.get('currency')) is not str or re.fullmatch(r'[A-Z]{3}', receipt['currency']) is None
            or type(receipt.get('amountMinor')) is not int or not 0 <= receipt['amountMinor'] <= SAFE_INTEGER
            or type(receipt.get('issuedAt')) is not int or not 0 <= receipt['issuedAt'] <= SAFE_INTEGER
            or receipt['issuedAt'] > now_ms + 30_000 or receipt['issuedAt'] > hold['deadline_at']):
        return False
    usage = receipt.get('usage')
    if type(usage) is not list or not 1 <= len(usage) <= 32:
        return False
    total = 0
    for line in usage:
        if (type(line) is not dict or set(line) != {'meter', 'quantity', 'unit', 'amountMinor'}
                or type(line['meter']) is not str or not IDENTIFIER.fullmatch(line['meter'])
                or type(line['unit']) is not str or not IDENTIFIER.fullmatch(line['unit'])
                or type(line['quantity']) is not int or not 0 <= line['quantity'] <= SAFE_INTEGER
                or type(line['amountMinor']) is not int or not 0 <= line['amountMinor'] <= SAFE_INTEGER):
            return False
        total += line['amountMinor']
        if total > SAFE_INTEGER:
            return False
    if total != receipt['amountMinor']:
        return False
    return (
        receipt['ownerUserId'] == hold['owner_id']
        and receipt['parentJobId'] == hold['parent_job_id']
        and receipt['delegationId'] == hold['delegation_id']
        and receipt['currency'] == hold['currency']
        and receipt['amountMinor'] <= hold['budget_limit_minor']
        and type(receipt.get('signature')) is str and SIGNATURE.fullmatch(receipt['signature']) is not None
    )


def create_a2a_usage_receipt_verifier(configuration, *, clock_ms=lambda: int(time.time() * 1000)):
    """Build the ``ValueSpendRuntime`` verifier from an exact operator key list.

    Invalid or duplicate trust configuration disables every receipt. The
    returned callable performs the provider signature check and binds the
    receipt to the native Wallet hold before allowing settlement.
    """
    keys = _trusted_keys(configuration)

    def verify(receipt, hold):
        if keys is None or type(hold) is not dict or not _valid_receipt(receipt, hold, clock_ms()):
            return False
        public_key = keys.get((receipt['providerId'], receipt['keyId'], receipt['agentOrigin']))
        if public_key is None:
            return False
        try:
            signature = base64.urlsafe_b64decode(receipt['signature'] + '==')
            if base64.urlsafe_b64encode(signature).rstrip(b'=').decode('ascii') != receipt['signature']:
                return False
            return _verify_signature(public_key, signature, signing_bytes(receipt))
        except (ValueError, TypeError, UnicodeError):
            return False

    return verify

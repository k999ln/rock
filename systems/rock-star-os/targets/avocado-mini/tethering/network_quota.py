"""Provider-neutral signed quota protocol, NOT a live satellite provider adapter.

The carrier must pre-provision a period-wide all-traffic hard cap and exempt the
management path. Reserve cannot increase that cap. Local drops do not prove bills.
"""
import copy
import hashlib
import hmac
import http.client
import json
import re
from pathlib import Path
import secrets
import ssl
import time
from urllib.parse import urlsplit

from controller import fields, require, number, identity, validate_policy, Rejected
from ap_control import private_directory, read_private, write_private


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=True).encode()


def digest(value):
    return hashlib.sha256(canonical(value)).hexdigest()


def signature(key, kind, payload):
    return hmac.new(key, kind.encode() + b'\n' + canonical(payload), hashlib.sha256).hexdigest()


def strict_object(pairs):
    result = {}
    for k, v in pairs:
        require(k not in result, 'duplicate_provider_field')
        result[k] = v
    return result


class HTTPSQuotaTransport:
    def __init__(self, origin, context=None):
        u = urlsplit(origin)
        require(u.scheme == 'https' and u.hostname and not u.username and not u.password
                and u.path in ('', '/') and not u.query and not u.fragment, 'invalid_provider_origin')
        self.hostname, self.port = u.hostname, u.port or 443
        self.context = context or ssl.create_default_context()
        require(self.context.check_hostname and self.context.verify_mode == ssl.CERT_REQUIRED, 'unverified_provider_tls')

    def exchange(self, body, auth):
        require(len(body) <= 16384, 'oversize_provider_request')
        c = http.client.HTTPSConnection(self.hostname, self.port, timeout=3, context=self.context)
        try:
            c.request('POST', '/v1/mini/quota', body, {'Content-Type': 'application/json', 'X-Mini-Auth': auth})
            response = c.getresponse()
            require(response.status == 200 and response.getheader('Content-Type', '').split(';')[0] == 'application/json', 'provider_response_rejected')
            value = response.read(65537)
            require(len(value) <= 65536, 'oversize_provider_response')
            return value  # No redirects, retry, proxy, or price discovery.
        finally:
            c.close()


class NetworkQuota:
    def __init__(self, directory, policy, key, transport, *, management_exempt, clock=None):
        validate_policy(policy)
        require(management_exempt is True, 'management_charges_not_bounded')
        require(type(key) is bytes and len(key) >= 32, 'invalid_provider_key')
        self.policy = copy.deepcopy(policy)
        self.policy_hash = digest(policy)
        self.key = key
        self.transport = transport
        self.clock = clock or (lambda: int(time.time()))
        self.directory = private_directory(directory)
        self.path = self.directory / 'network-quota.json'
        if not self.path.exists():
            write_private(self.path, canonical(dict(policySha256=self.policy_hash, account=None, grants={}, fault=None)))
        self._state()

    def _state(self):
        s = json.loads(read_private(self.path))
        require(s['policySha256'] == self.policy_hash, 'provider_policy_changed')
        require(s['fault'] is None, 'provider_fault_latched')
        return s

    def _call(self, action, grant=None, grant_id=None):
        state = self._state()
        now = number(self.clock())
        require(action in ('read', 'close') or now < self.policy['expiresAt'], 'provider_approval_expired')
        if action == 'reserve':
            require(grant_id not in state['grants'] and len(state['grants']) < 128, 'provider_grant_replay_or_limit')
            # Persist uncertainty BEFORE any remote effect. Never retry reserve automatically.
            state['grants'][grant_id] = dict(grantId=grant_id, requestGrantSha256=digest(grant),
                maxBytes=grant['maxBytes'], maxCostMinor=grant['costUpperMinor'], expiresAt=grant['expiresAt'],
                txBytes=0, rxBytes=0, costMinor=0, state='unknown')
            require(len(canonical(state)) <= 65536, 'provider_journal_limit')
            write_private(self.path, canonical(state))
        elif action != 'account':
            require(grant_id in state['grants'], 'unknown_provider_grant')
        payload = dict(schema='mini-network-quota/1', action=action, nonce=secrets.token_hex(16),
                       policySha256=self.policy_hash, grant=grant, grantId=grant_id)
        raw = self.transport.exchange(canonical(payload), signature(self.key, 'request', payload))
        require(type(raw) is bytes and len(raw) <= 65536, 'invalid_provider_response')
        response = json.loads(raw, object_pairs_hook=strict_object)
        fields(response, 'payload signature')
        body = response['payload']
        require(type(response['signature']) is str and re.fullmatch('[0-9a-f]{64}', response['signature']) and hmac.compare_digest(response['signature'], signature(self.key, 'response', body)), 'provider_signature_invalid')
        try:
            fields(body, 'requestSha256 policySha256 observedAt validUntil account grant')
            require(body['requestSha256'] == digest(payload) and body['policySha256'] == self.policy_hash, 'provider_receipt_binding')
            now = number(self.clock())
            number(body['observedAt']); number(body['validUntil'])
            require(now - 5 <= body['observedAt'] <= now < body['validUntil'] <= (now + 60 if action in ('read', 'close') else min(now + 60, self.policy['expiresAt'])), 'provider_receipt_expired')
            a = body['account']
            fields(a, 'revision byteCap costCapMinor usedBytes usedCostMinor heldBytes heldCostMinor allTrafficHardStop managementExempt')
            for k in ('revision', 'byteCap', 'costCapMinor', 'usedBytes', 'usedCostMinor', 'heldBytes', 'heldCostMinor'):
                number(a[k])
            require(a['byteCap'] == self.policy['byteCap'] and a['costCapMinor'] == self.policy['costCapMinor']
                    and a['allTrafficHardStop'] is True and a['managementExempt'] is True, 'provider_account_cap_unproven')
            require(a['usedBytes'] + a['heldBytes'] <= a['byteCap']
                    and a['usedCostMinor'] + a['heldCostMinor'] <= a['costCapMinor'], 'provider_account_overrun')
            prior = state['account']
            if prior:
                require(a['revision'] >= prior['revision'] and a['usedBytes'] >= prior['usedBytes']
                        and a['usedCostMinor'] >= prior['usedCostMinor'], 'provider_meter_regressed')
                require(a['revision'] != prior['revision'] or a == prior, 'provider_revision_conflict')
            g = body['grant']
            if action == 'account':
                require(g is None, 'unexpected_provider_grant')
            else:
                fields(g, 'grantId requestGrantSha256 maxBytes maxCostMinor expiresAt txBytes rxBytes costMinor state')
                require(g['grantId'] == grant_id and g['state'] in ('reserved', 'closed'), 'provider_grant_binding')
                for k in ('maxBytes', 'maxCostMinor', 'expiresAt', 'txBytes', 'rxBytes', 'costMinor'):
                    number(g[k])
                require(g['txBytes'] + g['rxBytes'] <= g['maxBytes'] and g['costMinor'] <= g['maxCostMinor'], 'provider_grant_overrun')
                if action == 'reserve':
                    require(g['requestGrantSha256'] == digest(grant) and g['maxBytes'] == grant['maxBytes']
                            and g['maxCostMinor'] == grant['costUpperMinor'] and g['expiresAt'] == grant['expiresAt']
                            and g['state'] == 'reserved' and now < g['expiresAt'], 'provider_grant_mismatch')
                else:
                    old = state['grants'][grant_id]
                    require(all(g[k] == old[k] for k in ('requestGrantSha256', 'maxBytes', 'maxCostMinor', 'expiresAt'))
                            and g['txBytes'] >= old['txBytes'] and g['rxBytes'] >= old['rxBytes']
                            and g['costMinor'] >= old['costMinor']
                            and not (old['state'] == 'closed' and g['state'] != 'closed'), 'provider_grant_changed')
                state['grants'][grant_id] = g
                if action == 'close':
                    require(g['state'] == 'closed', 'provider_close_unconfirmed')
            state['account'] = a
            require(len(canonical(state)) <= 65536, 'provider_journal_limit')
            write_private(self.path, canonical(state))
        except (Rejected, KeyError, TypeError, ValueError):
            state['fault'] = 'signed_provider_receipt_invalid'
            write_private(self.path, canonical(state))
            raise
        return body

    def pending_ids(self):
        # Enumerate even after a fault, so callers report unresolved carrier holds.
        state = json.loads(read_private(self.path))
        require(state['policySha256'] == self.policy_hash, 'provider_policy_changed')
        return sorted(k for k, v in state['grants'].items() if v['state'] != 'closed')

    def account(self):
        return self._call('account')

    def reserve(self, grant):
        require(type(grant) is dict and grant['status'] == 'reserved', 'invalid_local_grant')
        identity(grant['grantId'])
        return self._call('reserve', copy.deepcopy(grant), grant['grantId'])

    def read(self, grant_id):
        return self._call('read', grant_id=identity(grant_id))

    def close(self, grant_id):
        # Even a confirmed carrier close does not release the local reservation.
        return self._call('close', grant_id=identity(grant_id))

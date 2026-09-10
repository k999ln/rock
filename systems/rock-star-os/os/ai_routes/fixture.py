"""Public synthetic identities, devices, models and provider accounting only.

No model is installed/executed, no real price, no network and no generated key.
HMAC uses already-public repository fixture text with a distinct message domain.
"""
from contextlib import contextmanager
import hashlib
import hmac
import json
import threading

from entitlement.protocol import PUBLIC_TOKENS
from service_access.controller import PUBLIC_SERVICE_TOKENS
from .policy import Denied, canonical, digest, fields

ALICE = 'fixture-owner-alice'
BOB = 'fixture-owner-bob'
DOMAIN = b'RockComputeAccounting-PublicFixture-v1\0'
DEVICES = {'alice-a': (ALICE, 'fixture-device-a'), 'alice-b': (ALICE, 'fixture-device-b'),
           'bob': (BOB, 'fixture-device-bob')}


def public_routes():
    base = {'provider_id': 'fixture-compute-provider', 'model_id': 'fixture-text-model', 'model_revision': 'revision-1',
            'price_version': 'synthetic-ceiling-v1', 'max_cost_microusd': 600, 'max_input_bytes': 65536,
            'max_output_tokens': 128, 'memory_mib': 128, 'storage_mib': 64,
            'retention_policy': 'fixture-hash-only-no-input-storage',
            'cancellation_policy': 'status-only-no-provider-cancel', 'simulation_only': True}
    return [{**base, 'route_id': target, 'target': target,
             'max_cost_microusd': 0 if target == 'local' else 600} for target in ('local', 'cloud', 'pc_usb')]


class FixtureIdentity:
    def __init__(self, authority_id):
        self.authority_id, self.mutex = authority_id, threading.RLock()
        self.active = set(DEVICES)
        self.caps = {'online': True, 'pc_connected': True, 'memory_mib': 512, 'storage_mib': 256,
                     'local_models': ['fixture-text-model@revision-1'], 'evidence_id': 'synthetic-capability-v1'}

    def descriptor(self):
        return {'kind': 'public-compute-identity-fixture/1', 'authority_id': self.authority_id,
                'devices': DEVICES, 'tokens_sha256': digest(dict(PUBLIC_SERVICE_TOKENS))}

    @contextmanager
    def guard(self, auth, action):
        with self.mutex:
            if type(auth) is not str or not auth.isascii() or len(auth) > 256: raise Denied('invalid public identity fixture')
            alias = next((name for name, token in PUBLIC_SERVICE_TOKENS.items() if hmac.compare_digest(auth, token)), None)
            if alias is None or alias not in self.active: raise Denied('device authentication or current eligibility denied')
            if action not in ('prepare', 'reserve', 'claim', 'recover'): raise Denied('unknown compute action')
            owner, device = DEVICES[alias]
            yield {'authority_id': self.authority_id, 'owner_ref': owner, 'device_ref': device,
                   'capabilities': json.loads(canonical(self.caps))}

    def revoke(self, alias):
        with self.mutex: self.active.discard(alias)

    def capability(self, name, value):
        with self.mutex: self.caps[name] = value


class FixtureAccounting:
    def descriptor(self):
        return {'kind': 'public-compute-accounting-fixture/1', 'provider_id': 'fixture-compute-provider',
                'public_token_sha256': digest(PUBLIC_TOKENS['wallet']), 'simulation_only': True}

    @staticmethod
    def sign(value):
        raw = canonical(value)
        return {'payload': json.loads(raw), 'signature': hmac.new(PUBLIC_TOKENS['wallet'].encode(), DOMAIN + raw, hashlib.sha256).hexdigest()}

    @staticmethod
    def verify(envelope):
        fields(envelope, ('payload', 'signature'))
        raw = canonical(envelope['payload'])
        if len(raw) > 8192: raise ValueError('provider accounting event too large')
        signature = envelope['signature']
        expected = hmac.new(PUBLIC_TOKENS['wallet'].encode(), DOMAIN + raw, hashlib.sha256).hexdigest()
        if type(signature) is not str or not signature.isascii() or not hmac.compare_digest(signature, expected):
            raise Denied('provider accounting signature rejected')
        return json.loads(raw)

    @classmethod
    def event(cls, plan, *, event_id='event-1', state='SUCCEEDED', cost=450, final=True):
        return cls.sign({'event_id': event_id, 'authority_id': plan['authority_id'], 'owner_ref': plan['owner_ref'],
            'device_ref': plan['device_ref'], 'key': plan['key'], 'plan_sha256': digest(plan),
            **{name: plan['route'][name] for name in ('provider_id', 'model_id', 'model_revision', 'price_version')},
            'state': state, 'cost_microusd': cost, 'accounting_final': final})

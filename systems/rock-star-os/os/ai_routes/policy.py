"""Pure explicit route selection. Never tries a different route or provider.

Catalog and capability evidence are trusted adapter inputs, not owner assertions.
Costs are integer micro-USD ceilings for a *separate compute envelope*, not Wallet
money, a live quote, or a guarantee about an unconnected provider's final bill.
"""
import hashlib
import json
import re
import uuid

MAX_INPUT = 65536
MAX_UNITS = 10**12
TTL = 120


class Denied(PermissionError): pass
class Conflict(ValueError): pass
class Unavailable(OSError): pass


def fields(value, expected):
    if type(value) is not dict or set(value) != set(expected):
        raise ValueError('exact fields required')
    return value


def ident(value):
    if type(value) is not str or re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.:@/-]{0,159}', value) is None:
        raise ValueError('bounded identifier required')
    return value


def integer(value, minimum=0, maximum=MAX_UNITS):
    if type(value) is not int or not minimum <= value <= maximum:
        raise ValueError('bounded integer required')
    return value


def canonical(value):
    raw = json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False, allow_nan=False).encode()
    if len(raw) > 131072: raise ValueError('object too large')
    return raw


def digest(value): return hashlib.sha256(canonical(value)).hexdigest()


def input_identity(text):
    if type(text) is not str: raise ValueError('explicit selected text required')
    raw = text.encode('utf-8')
    if not 1 <= len(raw) <= MAX_INPUT: raise ValueError('selected input size outside bound')
    return {'sha256': hashlib.sha256(raw).hexdigest(), 'bytes': len(raw), 'scope': 'selected_text_only'}


def authority(value):
    if type(value) is not str or str(uuid.UUID(value)) != value: raise ValueError('canonical authority UUID required')
    return value


def route(value):
    fields(value, ('route_id', 'target', 'provider_id', 'model_id', 'model_revision', 'price_version',
                   'max_cost_microusd', 'max_input_bytes', 'max_output_tokens', 'memory_mib',
                   'storage_mib', 'retention_policy', 'cancellation_policy', 'simulation_only'))
    for name in ('route_id', 'provider_id', 'model_id', 'model_revision', 'price_version',
                 'retention_policy', 'cancellation_policy'): ident(value[name])
    if value['target'] not in ('local', 'pc_usb', 'cloud') or value['simulation_only'] is not True:
        raise ValueError('explicit development route required')
    integer(value['max_cost_microusd']); integer(value['max_input_bytes'], 1, MAX_INPUT)
    integer(value['max_output_tokens'], 1, 131072)
    integer(value['memory_mib'], 0, 1048576); integer(value['storage_mib'], 0, 1048576)
    if value['target'] == 'local' and value['max_cost_microusd'] != 0:
        raise ValueError('local route has no external compute charge')
    return json.loads(canonical(value))


def capabilities(value):
    fields(value, ('online', 'pc_connected', 'memory_mib', 'storage_mib', 'local_models', 'evidence_id'))
    if type(value['online']) is not bool or type(value['pc_connected']) is not bool:
        raise ValueError('explicit connectivity state required')
    integer(value['memory_mib'], 0, 1048576); integer(value['storage_mib'], 0, 1048576); ident(value['evidence_id'])
    models = value['local_models']
    if type(models) is not list or len(models) > 64 or len(set(models)) != len(models):
        raise ValueError('bounded installed model revisions required')
    for model in models: ident(model)
    return json.loads(canonical(value))


def make_plan(*, authority_id, owner_ref, device_ref, key, selected_text, selected_route,
              capability_evidence, allow_external, max_cost_microusd, now):
    """Return an exact reviewable plan or a known denial; no side effects."""
    authority(authority_id)
    for value in (owner_ref, device_ref, key): ident(value)
    now = integer(now, 1, 2**53 - 1)
    if type(allow_external) is not bool: raise ValueError('explicit external-data choice required')
    integer(max_cost_microusd)
    model = route(selected_route); caps = capabilities(capability_evidence); selected = input_identity(selected_text)
    if selected['bytes'] > model['max_input_bytes']: raise Denied('selected input exceeds model capability')
    target = model['target']
    if target != 'local' and not allow_external: raise Denied('external data consent absent; no automatic fallback')
    if target == 'cloud' and not caps['online']: raise Denied('cloud unavailable offline; no automatic fallback')
    if target == 'pc_usb' and not caps['pc_connected']: raise Denied('selected PC unavailable; no automatic fallback')
    if target == 'local' and (model['model_id'] + '@' + model['model_revision'] not in caps['local_models'] or
                            caps['memory_mib'] < model['memory_mib'] or caps['storage_mib'] < model['storage_mib']):
        raise Denied('selected local model capability unavailable; no automatic fallback')
    if model['max_cost_microusd'] > max_cost_microusd: raise Denied('quoted upper bound exceeds explicit cost cap')
    return {'schema_version': 1, 'authority_id': authority_id, 'owner_ref': owner_ref, 'device_ref': device_ref,
            'key': key, 'input': selected, 'route': model, 'route_sha256': digest(model),
            'capability_sha256': digest(caps), 'external_data_approved': allow_external,
            'user_cap_microusd': max_cost_microusd, 'reserved_microusd': model['max_cost_microusd'],
            'currency': 'USD', 'unit': 'micro-USD', 'issued_at': now, 'expires_at': now + TTL,
            'simulation_only': True, 'actual_model_execution': False}

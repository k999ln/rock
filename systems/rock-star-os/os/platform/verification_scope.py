"""Evidence scope for explicitly flagged development guest verifiers only."""
import hashlib
import json


def scope(cmdline, flag):
    values = [part.split('=', 1)[1] for part in cmdline.split() if part.startswith(flag+'=')]
    if len(values) > 1 or values and values[0] not in ('local-full', 'game-isolation'):
        raise ValueError('one supported explicit guest verification scope required')
    return values[0] if values else 'local-full'


def wallet(value, mode):
    if mode == 'game-isolation':
        if value is not None:
            raise ValueError('Game isolation requires unavailable remote Wallet; host authority must remain stopped')
        return {'schema': 'rock-guest-wallet-observation/1', 'mode': mode,
                'financial_assertions': 'NOT_RUN', 'state_sha256': None,
                'reason': 'remote authority unavailable; complete host authority retention is a separate required observation'}
    if mode != 'local-full' or type(value) is not dict:
        raise ValueError('local Wallet object required; unavailable is not an unchanged financial balance')
    raw = json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False, allow_nan=False).encode()
    return {'schema': 'rock-guest-wallet-observation/1', 'mode': mode,
            'financial_assertions': 'SIMULATOR_ONLY', 'state_sha256': hashlib.sha256(raw).hexdigest()}


def unchanged(before, value, mode):
    if before != wallet(value, mode):
        raise ValueError('Wallet observation changed within its explicit scope')


def validate_game_proof(proof):
    if proof.get('verification_scope') != 'game-isolation' or proof.get('wallet') != 'NOT_RUN':
        raise ValueError('guest did not report its Game-only scope')
    expected = wallet(None, 'game-isolation')
    if proof.get('wallet_observation') != expected:
        raise ValueError('guest financial observation is missing or overclaimed')

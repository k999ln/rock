"""Accept one Cloud A2A wallet handoff against an isolated synthetic Wallet.

This is a local cross-runtime contract test helper. It creates no production
credentials, contacts no provider, and cannot enable LIVE spending.
"""
from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path

from blackberryrock.a2a_usage_receipt import create_a2a_usage_receipt_verifier
from blackberryrock.spend import ValueSpendRuntime
from blackberryrock.wallet import Wallet


def main() -> int:
    request = json.load(sys.stdin)
    handoff = request.get('handoff')
    public_key_hex = request.get('trustedUsagePublicKeyHex')
    if type(handoff) is not dict or type(public_key_hex) is not str or len(public_key_hex) != 64:
        raise ValueError('handoff and one fixture Ed25519 public key are required')
    if handoff.get('schema') != 'rock-a2a-wallet-settlement-handoff/1':
        raise ValueError('unsupported handoff schema')
    reservation = handoff.get('reservation')
    command = handoff.get('walletCommand')
    if type(reservation) is not dict or type(command) is not dict:
        raise ValueError('reservation and wallet command are required')
    receipt = command.get('receipt')
    if (command.get('v') != 1 or command.get('op') != 'a2a.budget.settle'
            or command.get('key') != handoff.get('idempotencyKey')
            or command.get('delegation_id') != reservation.get('delegationId')
            or type(receipt) is not dict):
        raise ValueError('handoff does not contain the exact native Wallet command')
    if (receipt.get('ownerUserId') != reservation.get('ownerUserId')
            or receipt.get('parentJobId') != reservation.get('parentJobId')
            or receipt.get('delegationId') != reservation.get('delegationId')
            or receipt.get('currency') != reservation.get('currency')
            or receipt.get('amountMinor') != reservation.get('settledMinor')
            or type(reservation.get('reservedMinor')) is not int
            or type(reservation.get('deadlineAt')) is not int
            or type(reservation.get('authorizationSha256')) is not str):
        raise ValueError('handoff receipt and Cloud reservation bindings disagree')

    trusted_keys = [{
        'providerId': receipt['providerId'],
        'keyId': receipt['keyId'],
        'agentOrigin': receipt['agentOrigin'],
        'publicKeyHex': public_key_hex,
        'status': 'active',
    }]
    with tempfile.TemporaryDirectory(prefix='rock-cloud-wallet-handoff-') as temporary:
        wallet = Wallet(Path(temporary) / 'wallet.db')
        runtime = ValueSpendRuntime(
            wallet,
            a2a_usage_receipt_verifier=create_a2a_usage_receipt_verifier(
                json.dumps(trusted_keys, separators=(',', ':')),
            ),
        )
        sale = wallet.simulate_sale(1_000, 'handoff-fixture-fund')
        wallet.settle_sale(sale['id'], 'handoff-fixture-fund-settlement')
        runtime.command({
            'v': 1,
            'op': 'a2a.budget.reserve',
            'key': 'handoff-fixture-reservation',
            'owner_id': reservation['ownerUserId'],
            'delegation_id': reservation['delegationId'],
            'parent_job_id': reservation['parentJobId'],
            'currency': reservation['currency'],
            'budget_limit_minor': reservation['reservedMinor'],
            'approval_sha256': reservation['authorizationSha256'],
            'deadline_at': reservation['deadlineAt'],
        })
        runtime.command({
            'v': 1,
            'op': 'a2a.budget.dispatch',
            'key': 'handoff-fixture-dispatch',
            'delegation_id': reservation['delegationId'],
        })
        first = runtime.command(command)
        repeated = runtime.command(command)
        if first != repeated:
            raise AssertionError('same handoff idempotency key changed the settlement result')
        if first['state'] != 'SETTLED' or first['settled_minor'] != receipt['amountMinor']:
            raise AssertionError('native Wallet did not settle the verified provider usage')
        if first['released_minor'] != reservation['reservedMinor'] - receipt['amountMinor']:
            raise AssertionError('native Wallet did not release the unused reservation')
        state = runtime.snapshot()
        print(json.dumps({
            'state': first['state'],
            'settledMinor': first['settled_minor'],
            'releasedMinor': first['released_minor'],
            'repeatStable': True,
            'simulationOnly': state['simulation_only'],
        }, separators=(',', ':')))
    return 0


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f'{type(error).__name__}: {error}', file=sys.stderr)
        raise

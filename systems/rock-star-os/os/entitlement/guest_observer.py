"""Read-only target observer. It does not register, consent, fund, bill or tick."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import platform
import re
import sys
from datetime import datetime, timezone


def observe(read):
    """`read(op)` must call the existing authenticated Wallet socket, no mutation."""
    membership_response = read('wallet.membership')
    billing_response = read('wallet.billing.status')
    wallet_response = read('snapshot')
    if not all(response.get('ok') is True for response in (membership_response, billing_response, wallet_response)):
        raise ValueError('Wallet observer read failed')
    membership, billing, wallet = membership_response['result'], billing_response['result'], wallet_response['snapshot']
    for record in (membership, billing, wallet):
        if record.get('simulation_only') is not True or record.get('monthly_fee_minor') != 888 or record.get('currency') != 'USD':
            raise ValueError('expected a USD 8.88 simulation-only Wallet')
    if membership.get('backend_connected') is not False or membership.get('real_identity_verified') is not False:
        raise ValueError('public fixture must not claim a connected real identity provider')
    if membership.get('registration_input_fields') != []:
        raise ValueError('unexpected personal-data registration input')
    history = billing['history']
    if not isinstance(history, list) or len(history) > 12:
        raise ValueError('unexpected monthly schedule history')
    periods = [row['period'] for row in history]
    if len(set(periods)) != len(periods) or any(not re.fullmatch(r'[0-9]{4}-(0[1-9]|1[0-2])', period) for period in periods):
        raise ValueError('monthly schedule periods must be unique')
    bills = {row['period']: row for row in wallet['bills']}
    for row in history:
        if row['status'] not in ('due', 'processing', 'retry_wait', 'paid', 'blocked'):
            raise ValueError('invalid monthly state')
        if row['status'] == 'paid' and (row['period'] not in bills or bills[row['period']]['amount_minor'] != 888):
            raise ValueError('paid schedule does not have an existing Wallet bill')
    if wallet['ledger_balance_minor'] != 0:
        raise ValueError('existing Wallet ledger is not balanced')
    return {'observed_utc': datetime.now(timezone.utc).isoformat(), 'simulation_only': True,
            'read_operations': ['wallet.membership', 'wallet.billing.status', 'snapshot'],
            'registration_status': membership['registration_status'],
            'monthly_periods_observed': periods, 'wallet_billed_minor': wallet['billed_minor'],
            'worker_alive': billing['worker_alive'], 'new_money_or_identity_actions': False}


def main():
    if platform.system() != 'Linux' or platform.machine() not in ('aarch64', 'arm64') or os.geteuid() != 0:
        raise SystemExit('target observer requires the root user in the ARM64 development guest')
    service_path = Path('/usr/lib/rock-platform/service.py')
    spec = importlib.util.spec_from_file_location('rock_entitlement_readonly_observer_service', service_path)
    service = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(service)
    result = observe(lambda op: service.call(service.WALLET_SOCKET, {'v': 1, 'op': op}, service.WALLET_UID))
    result['guest_executed'] = True
    result['service_sha256'] = hashlib.sha256(service_path.read_bytes()).hexdigest()
    print(json.dumps(result, indent=2))
    print('ROCK_ENTITLEMENT_OBSERVER_PASS', flush=True)


if __name__ == '__main__':
    main()

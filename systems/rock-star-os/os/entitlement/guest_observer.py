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
    if not all(type(response) is dict and response.get('ok') is True for response in (membership_response, billing_response, wallet_response)):
        raise ValueError('Wallet observer read failed')
    membership, billing, wallet = membership_response.get('result'), billing_response.get('result'), wallet_response.get('snapshot')
    if not all(type(record) is dict for record in (membership, billing, wallet)):
        raise ValueError('invalid Wallet observer response')
    for record in (membership, billing, wallet):
        if record.get('simulation_only') is not True or record.get('monthly_fee_minor') != 888 or record.get('currency') != 'USD':
            raise ValueError('expected a USD 8.88 simulation-only Wallet')
    if membership.get('backend_connected') is not False or membership.get('real_identity_verified') is not False:
        raise ValueError('public fixture must not claim a connected real identity provider')
    if membership.get('registration_input_fields') != []:
        raise ValueError('unexpected personal-data registration input')
    # Reconstruct report fields from the existing public scalar contract. Never
    # stringify or pass through unexpected service values into diagnostics.
    registration_status = membership.get('registration_status')
    statuses = ('HANDOFF_REQUIRED', 'REGISTRATION_REQUIRED', 'REGISTERED')
    if type(registration_status) is not str or registration_status not in statuses:
        raise ValueError('invalid registration status')
    registration_status = next(status for status in statuses if status == registration_status)
    worker_alive = billing.get('worker_alive')
    billed_minor = wallet.get('billed_minor')
    if type(worker_alive) is not bool:
        raise ValueError('invalid worker state')
    if type(billed_minor) is not int or billed_minor < 0:
        raise ValueError('invalid billed amount')
    history = billing.get('history')
    if type(history) is not list or len(history) > 12 or any(type(row) is not dict for row in history):
        raise ValueError('unexpected monthly schedule history')
    periods = [row.get('period') for row in history]
    if any(type(period) is not str or not re.fullmatch(r'[0-9]{4}-(0[1-9]|1[0-2])', period) for period in periods) or len(set(periods)) != len(periods):
        raise ValueError('monthly schedule periods must be unique')
    bill_rows = wallet.get('bills')
    if type(bill_rows) is not list or any(type(row) is not dict or type(row.get('period')) is not str for row in bill_rows):
        raise ValueError('invalid Wallet bills')
    bills = {row['period']: row for row in bill_rows}
    for row in history:
        if row.get('status') not in ('due', 'processing', 'retry_wait', 'paid', 'blocked'):
            raise ValueError('invalid monthly state')
        if row['status'] == 'paid' and (row['period'] not in bills or bills[row['period']].get('amount_minor') != 888):
            raise ValueError('paid schedule does not have an existing Wallet bill')
    if type(wallet.get('ledger_balance_minor')) is not int or wallet['ledger_balance_minor'] != 0:
        raise ValueError('existing Wallet ledger is not balanced')
    # Emit canonical public primitives, never service-owned report values.
    public_periods = [f'{int(period[:4]):04d}-{int(period[5:]):02d}' for period in periods]
    public_worker_alive = True if worker_alive is True else False
    return {'observed_utc': datetime.now(timezone.utc).isoformat(), 'simulation_only': True,
            'read_operations': ['wallet.membership', 'wallet.billing.status', 'snapshot'],
            'registration_status': registration_status,
            'monthly_periods_observed': public_periods, 'wallet_billed_minor': billed_minor,
            'worker_alive': public_worker_alive, 'new_money_or_identity_actions': False}


def main():
    if platform.system() != 'Linux' or platform.machine() not in ('aarch64', 'arm64') or os.geteuid() != 0:
        raise SystemExit('target observer requires the root user in the ARM64 development guest')
    service_path = Path('/usr/lib/rock-platform/service.py')
    spec = importlib.util.spec_from_file_location('rock_entitlement_readonly_observer_service', service_path)
    service = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(service)
    try:
        result = observe(lambda op: service.call(service.WALLET_SOCKET, {'v': 1, 'op': op}, service.WALLET_UID))
    except Exception:
        # Service exceptions may themselves contain private response content.
        raise SystemExit('Wallet observer report unavailable') from None
    result['guest_executed'] = True
    result['service_sha256'] = hashlib.sha256(service_path.read_bytes()).hexdigest()
    print(json.dumps(result, indent=2))
    print('ROCK_ENTITLEMENT_OBSERVER_PASS', flush=True)


if __name__ == '__main__':
    main()

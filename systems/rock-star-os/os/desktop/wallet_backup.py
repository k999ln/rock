"""Read-only, nonempty synthetic Wallet prerequisite for full-disk restoration.

This is host evidence code, never an RPC client or fixture-state installer.
Private receipt bodies stay in memory; only hashes and fixed totals are reported.
"""
from contextlib import closing
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import sqlite3

import business_contract as contract

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('backup_wallet_auth_evidence', HERE.parent / 'ui/wallet-evidence-auth.py')
auth = importlib.util.module_from_spec(spec); spec.loader.exec_module(auth)
spec = importlib.util.spec_from_file_location('backup_atm_evidence', HERE.parent / 'ui/guest-ui-atm-evidence.py')
atm = importlib.util.module_from_spec(spec); spec.loader.exec_module(atm)
require = contract.require
AMOUNT, FEE, HOLD = 2000, 888, 1000
TERMS = 'simulator-monthly-usd-8.88-v1'
TABLES = {
    'wallet': ('wallet_journals', 'wallet_postings', 'wallet_sales', 'wallet_withdrawals', 'wallet_consents',
               'wallet_bills', 'wallet_idempotency', 'atm_wallet_binding', 'atm_credentials', *auth.TABLES),
    'membership': ('accounts', 'consents', 'authorizations', 'authorization_claims', 'device_binding',
                   'device_api_receipts', 'device_monthly_due', 'wallet_bindings', 'account_devices'),
    'authenticator': ('metadata', 'credentials', 'requests'),
}


def plan():
    return {'schema': 'rock-nonempty-wallet-prerequisite/1', 'additional_normal_boot_shutdown_cycles': 2,
            'wallet_ui_seconds': 600, 'credit_minor': AMOUNT, 'monthly_fee_minor': FEE,
            'same_month_bill_requests': 2, 'hold_minor': HOLD, 'atm_fee_minor': 0,
            'available_final_minor': AMOUNT - FEE, 'renewal_final': False,
            'real_funds': 'NOT_RUN', 'real_atm': 'NOT_CONNECTED', 'guest_observer': False,
            'meaning': 'separate post-business population then a read-only retained-state boot; not a restored boot'}


def read_databases(paths):
    """Read bounded fixed queries from already exported, closed SQLite copies."""
    result = {}
    for role, tables in TABLES.items():
        with closing(sqlite3.connect(paths[role].resolve().as_uri() + '?mode=ro', uri=True)) as db:
            db.execute('PRAGMA query_only=ON'); db.execute('BEGIN'); db.row_factory = sqlite3.Row
            require(db.execute('PRAGMA integrity_check').fetchone()[0] == 'ok', 'Wallet evidence database damaged')
            rows = {}
            for table in tables:
                rows[table] = [dict(row) for row in db.execute('SELECT rowid AS seq,* FROM ' + table + ' ORDER BY rowid LIMIT 65')]
                require(len(rows[table]) <= 64, 'unexpected additional Wallet evidence rows')
            if role == 'wallet': rows['authentication'] = auth.read(db)
            result[role] = rows
    require(len(contract.canonical(result)) <= 512 * 1024, 'Wallet evidence exceeds fixed private memory budget')
    return result


def one(rows, name):
    require(len(rows[name]) == 1, 'exactly one Wallet record required: ' + name)
    return rows[name][0]


def ui_key(key):
    require(type(key) is str and re.fullmatch(r'ui-[0-9a-f]{32}', key), 'operation lacks native UI request identity')
    return key


def exact(actual, expected, message):
    require(contract.canonical(actual) == contract.canonical(expected), message)


def validate(rows):
    """Join actual rows, cryptographic ceremonies and double-entry postings."""
    w, m, local = (rows[role] for role in ('wallet', 'membership', 'authenticator'))
    account = one(m, 'accounts'); binding = one(m, 'device_binding'); owner = account['account_id']
    require(account['device_ref'] == binding['device_ref'] and account['auto_renew'] == 0,
            'Wallet account/device or renewal state differs')
    due = one(m, 'device_monthly_due'); paid = one(m, 'authorizations'); bill = one(w, 'wallet_bills')
    require(due['status'] == 'paid' and not due.get('manual_retry_pending') and due.get('last_error') is None and
            due['account_id'] == paid['account_id'] == owner and paid['state'] == 'PAID' and
            due['authorization_id'] == paid['authorization_id'] and paid['wallet_bill_id'] == bill['id'] and
            due['period'] == paid['period'] == bill['period'] and bill['amount_minor'] == FEE,
            'monthly work must be quiescent and paid exactly once')
    require(account['access_until'] == paid['period_end'], 'paid period was lost after cancellation')
    require(one(m, 'wallet_bindings')['account_id'] == owner and
            re.fullmatch('[0-9a-f]{64}', one(m, 'wallet_bindings')['wallet_identity']) and
            one(m, 'account_devices')['account_id'] == owner and one(m, 'account_devices')['device_ref'] == binding['device_ref'],
            'existing Wallet and contract-device bindings are missing')
    consents = m['consents']; require(len(consents) == 2, 'two explicit monthly decisions required')
    for row, accepted in zip(consents, (1, 0)):
        require(row['account_id'] == owner and type(row['accepted']) is int and row['accepted'] == accepted and
                row['terms_version'] == TERMS and row['amount_minor'] == FEE, 'monthly consent differs')
    require(paid['consent_id'] == consents[0]['consent_id'] and account['consent_id'] == consents[1]['consent_id'],
            'monthly authorization or cancellation link differs')
    calls, keys = [], []
    for row in m['device_api_receipts']:
        key = ui_key(row['key']); keys.append(key)
        request = json.loads(row['request_json']); response = json.loads(row['response_json']) if row['response_json'] else None
        require(response and response.get('ok') is True, 'unfinished or failed monthly UI receipt')
        require(type(request.get('v')) is int and request['v'] == 1 and request.get('key') == key, 'monthly request identity differs')
        calls.append((request, response['result']))
    require([request['op'] for request, _ in calls] == ['wallet.register', 'wallet.consent', 'wallet.bill', 'wallet.bill', 'wallet.consent'],
            'registration, consent, two bill requests and cancellation required')
    exact(calls[0][0], {'v': 1, 'op': 'wallet.register', 'key': keys[0]}, 'registration included extra fields')
    require(calls[0][1]['account_id'] == owner and calls[0][1]['additional_personal_fields_required'] == [], 'wrong registration receipt')
    for index, accepted in ((1, True), (4, False)):
        exact(calls[index][0], {'v': 1, 'op': 'wallet.consent', 'key': keys[index], 'accepted': accepted, 'terms_version': TERMS},
              'monthly UI decision differs from recorded consent')
        response = calls[index][1]
        require(response['account_id'] == owner and response['accepted'] is accepted and response['terms_version'] == TERMS and
                response['amount_minor'] == FEE and response['currency'] == 'USD', 'wrong monthly consent receipt')
    for index in (2, 3):
        exact(calls[index][0], {'v': 1, 'op': 'wallet.bill', 'key': keys[index], 'period': due['period']}, 'billing period or fields differ')
        response = calls[index][1]
        require(response['accepted'] is True and response['operation'] == keys[index] and response['schedule_id'] == due['schedule_id'] and
                response['period'] == due['period'], 'duplicate UI billing did not resolve to the same schedule')

    ledger = []
    for row in w['wallet_idempotency']:
        if not row['key'].startswith('ui-'): continue  # Internal monthly receipts are checked below.
        keys.append(ui_key(row['key']))
        if row['operation'].startswith('wallet.'):
            value = auth.receipt(row)
            if row['operation'] == 'wallet.atm.issue': value['result'] = atm.redact_issuance(value['result'])
        else:
            value = {**row, 'input': json.loads(row['input_json']), 'result': json.loads(row['result_json'])}
        ledger.append(value)
    require([row['operation'] for row in ledger] == ['wallet.auth.begin', 'wallet.auth.enroll', 'wallet.terms', 'sale', 'settle',
                                                   'wallet.atm.quote', 'wallet.atm.issue', 'atm.cancel'], 'unexpected native Wallet mutations')
    credential = one(w, 'wallet_auth_credentials')
    # auth.approved_atm uses these identity/activation fields only. Derive them
    # from the actual rows; this is not represented as a live API snapshot.
    context = {'membership': {'entitlement': {'account_id': owner}},
               'auth': {'active': one(w, 'wallet_auth_terms')['accepted'] == 1, 'wallet_terms_accepted': True,
                        'credential_id': credential['credential_id']}}
    verified = auth.approved_atm(context, w['authentication'], ledger, HOLD, 'SIM-ATM-001')
    sale = one(w, 'wallet_sales')
    require(sale['amount_minor'] == AMOUNT and sale['status'] == 'SETTLED' and sale['settled_at'], 'one settled credit required')
    exact(ledger[3]['input'], {'amount_minor': AMOUNT}, 'native credit amount differs')
    exact(ledger[4]['input'], {'sale_id': sale['id']}, 'native settlement references another credit')
    require(ledger[3]['result']['id'] == ledger[4]['result']['id'] == sale['id'] and
            ledger[3]['result']['status'] == 'PENDING_SETTLEMENT' and ledger[4]['result']['status'] == 'SETTLED', 'credit receipt phases differ')
    withdrawn = one(w, 'wallet_withdrawals'); token = one(w, 'atm_credentials'); atm_binding = one(w, 'atm_wallet_binding')
    issue, cancel = ledger[6]['result'], ledger[7]['result']
    ident = withdrawn['id']; scope = {'owner_id': owner, 'device_id': binding['device_ref']}
    require(all(token[key] == atm_binding[key] == value for key, value in scope.items()), 'ATM ownership/device binding differs')
    exact(ledger[7]['input'], {**scope, 'withdrawal_id': ident}, 'cancellation lacks the original owner/device')
    require(issue['withdrawal_id'] == token['withdrawal_id'] == cancel['withdrawal_id'] == ident and
            issue['code_sha256'] == token['code_sha256'] == cancel['code_sha256'] and issue['private_code_hash_verified'] is True and
            issue['amount_minor'] == HOLD and issue['atm_id'] == token['atm_id'] == cancel['atm_id'] == 'SIM-ATM-001' and
            issue['issued_at'] == token['issued_at'] and issue['expires_at'] == token['expires_at'] and
            issue['expires_at'] - issue['issued_at'] == 300, 'ATM issuance identity, amount, or expiry differs')
    require(token['state'] == cancel['state'] == 'CANCELED' and token['consumed_at'] is None and token['consumed_by'] is None and
            cancel['consumed'] is False and cancel['code_usable'] is False and cancel['cleanup_needed'] is False and
            issue['simulation_only'] is cancel['simulation_only'] is True and
            issue['real_atm_connection'] == cancel['real_atm_connection'] == 'NOT_CONNECTED', 'ATM cancellation is not complete and unused')
    require(withdrawn['amount_minor'] == withdrawn['released_minor'] == HOLD and withdrawn['dispensed_minor'] == 0 and
            withdrawn['status'] == 'REVERSED', 'actual hold was not completely returned')
    exact(cancel['withdrawal'], {**{key: value for key, value in withdrawn.items() if key != 'seq'}, 'held_minor': 0},
          'cancellation receipt differs from the actual withdrawal')
    journals = w['wallet_journals']; postings = w['wallet_postings']
    expected_postings = {'sale_pending': {'PENDING_SETTLEMENT': AMOUNT, 'SALE_CLEARING': -AMOUNT},
                         'sale_settlement': {'AVAILABLE': AMOUNT, 'PENDING_SETTLEMENT': -AMOUNT},
                         'monthly_fee': {'AVAILABLE': -FEE, 'SERVICE_FEES': FEE},
                         'withdrawal_reserve': {'AVAILABLE': -HOLD, 'WITHDRAW_HOLD': HOLD},
                         'withdrawal_hold_reversal': {'AVAILABLE': HOLD, 'WITHDRAW_HOLD': -HOLD}}
    require(len(journals) == 5 and len(postings) == 10 and {j['kind'] for j in journals} == set(expected_postings),
            'missing, repeated or extra financial side effects')
    for journal in journals:
        reference = sale['id'] if journal['kind'].startswith('sale_') else bill['id'] if journal['kind'] == 'monthly_fee' else ident
        require(journal['reference_id'] == reference, 'financial journal belongs to another business record')
        actual = [p for p in postings if p['journal_id'] == journal['id']]
        require(len(actual) == 2 and all(type(p['delta_minor']) is int for p in actual), 'invalid double-entry journal')
        exact({p['account']: p['delta_minor'] for p in actual}, expected_postings[journal['kind']], 'financial journal differs')
    require(bill['journal_id'] == next(j['id'] for j in journals if j['kind'] == 'monthly_fee'), 'bill is not linked to one actual debit')
    # The fixed mirror consent and bill are the only non-UI Wallet operations.
    internal = [r for r in w['wallet_idempotency'] if not r['key'].startswith('ui-')]
    require(len(internal) == 2 and sorted(r['operation'] for r in internal) == ['bill', 'consent'], 'unexpected internal Wallet work')
    mirror = one(w, 'wallet_consents')
    require(mirror['accepted'] == 1 and mirror['monthly_fee_minor'] == FEE and bill['consent_id'] == mirror['id'], 'Wallet consent mirror differs')
    for row in internal:
        if row['operation'] == 'consent':
            require(row['key'] == consents[0]['consent_id'], 'consent mirror is not bound to the explicit owner decision')
            exact(json.loads(row['input_json']), {'accepted': True}, 'consent mirror input differs')
            expected = {key: value for key, value in mirror.items() if key != 'seq'}; expected['accepted'] = True
        else:
            require(row['key'] == paid['authorization_id'], 'Wallet bill is not bound to the paid authorization')
            exact(json.loads(row['input_json']), {'period': due['period'], 'amount_minor': FEE}, 'internal bill input differs')
            expected = {key: value for key, value in bill.items() if key != 'seq'}
        exact(json.loads(row['result_json']), expected, 'internal Wallet receipt differs from the actual row')
    local_credential = one(local, 'credentials'); metadata = one(local, 'metadata')
    require(metadata['device_ref'] == binding['device_ref'] and local_credential['credential_id'] == credential['credential_id'] and
            local_credential['sign_count'] == 1, 'software authenticator state does not retain one assertion')
    require(len(local['requests']) == 2 and [r['operation'] for r in local['requests']] == ['create', 'get'], 'unexpected authenticator ceremonies')
    for index, (row, expected) in enumerate(zip(local['requests'], (ledger[1]['input']['request']['credential'], ledger[6]['input']['request']['credential']))):
        keys.append(ui_key(row['request_key']))
        exact(json.loads(row['response']), expected, 'local credential response differs from Wallet-verified credential')
        exact(json.loads(row['payload']), ledger[0 if index == 0 else 5]['result']['options'], 'local authenticator ceremony differs from Wallet challenge')
    require(len(keys) == len(set(keys)) == 15, 'distinct GUI operations did not keep unique request keys')
    auth.no_pin([calls, w['authentication']])
    return {'schema': 'rock-nonempty-wallet-closed-evidence/1', 'status': 'PASS',
            'available_minor': AMOUNT - FEE, 'pending_minor': 0, 'held_minor': 0, 'dispensed_minor': 0,
            'monthly_fee_minor': FEE, 'bill_count': 1, 'sale_count': 1, 'canceled_withdrawal_count': 1,
            'monthly_work': 'PAID_QUIESCENT', 'monthly_consent': 'REVOKED', 'native_distinct_keys': len(keys),
            'financial_journals': 5, 'postings': 10, 'registration_and_assertion_reverified': verified['registration_and_assertion_reverified'],
            'rock_atm_fee_minor': verified['rock_atm_fee_minor'], 'private_rows_sha256': contract.hashed(rows),
            'private_code_in_report': False, 'real_funds': 'NOT_RUN', 'real_atm': 'NOT_CONNECTED'}

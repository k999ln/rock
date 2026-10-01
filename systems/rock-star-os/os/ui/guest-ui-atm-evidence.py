#!/usr/bin/python3
"""Read-only business observer for an explicitly flagged native ATM UI test.

The only writes are a redacted proof and explicit test shutdown. Private bearer
receipt bytes are verified in memory, never placed in a report or exception.
"""
from contextlib import closing
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import sqlite3
import subprocess
import sys
import time

SOURCE = Path('/usr/libexec/rock-ui-evidence.py')
if not SOURCE.is_file():
    SOURCE = Path(__file__).with_name('guest-ui-evidence.py')
spec = importlib.util.spec_from_file_location('rock_atm_ui_base', SOURCE)
base = importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)
AUTH_SOURCE = Path('/usr/libexec/rock-wallet-evidence-auth.py')
if not AUTH_SOURCE.is_file():
    AUTH_SOURCE = Path(__file__).with_name('wallet-evidence-auth.py')
auth_spec = importlib.util.spec_from_file_location('atm_evidence_auth', AUTH_SOURCE)
auth = importlib.util.module_from_spec(auth_spec)
auth_spec.loader.exec_module(auth)
ENTITLEMENT_DB = '/data/wallet/entitlement.db'
LEDGER_DB = '/data/wallet/wallet-simulator.db'
PROOF = Path('/data/ui-atm-proof.json')
AMOUNT, WITHDRAWAL, ATM = 5000, 1000, 'SIM-ATM-001'
FORBIDDEN_FIELDS = frozenset(('code', 'token', 'password', 'result_json', 'response_json', 'request_json', 'input_json'))


def private_fields_absent(value):
    auth.no_pin(value)
    if isinstance(value, dict):
        base.require(not FORBIDDEN_FIELDS.intersection(value), 'private or unparsed receipt fields in evidence')
        for item in value.values():
            private_fields_absent(item)
    elif isinstance(value, list):
        for item in value:
            private_fields_absent(item)


def redact_issuance(value):
    base.require(set(value) == {'simulation_only', 'real_atm_connection', 'receipt_kind', 'state_at_issue',
        'withdrawal_id', 'currency', 'amount_minor', 'atm_id', 'issued_at', 'expires_at', 'code', 'code_sha256',
        'quote_id', 'approval_id', 'fee_minor', 'total_debit_minor', 'cash_received_minor', 'authentication'},
        'unexpected issuance receipt fields')
    code = value['code']
    base.require(type(code) is str and re.fullmatch(r'[A-Za-z0-9_-]{32}', code) is not None,
                 'invalid private issuance code shape')
    base.require(hashlib.sha256(code.encode('ascii')).hexdigest() == value['code_sha256'],
                 'private issuance code hash does not match')
    return {**{key: item for key, item in value.items() if key != 'code'}, 'private_code_hash_verified': True}


def database_evidence():
    result = {'counts': {}}
    for path, tables in ((ENTITLEMENT_DB, ('device_api_receipts', 'consents', 'device_monthly_due', 'authorizations', 'device_binding')),
                         (LEDGER_DB, ('wallet_idempotency', 'wallet_bills', 'wallet_journals', 'wallet_withdrawals', 'atm_credentials', 'atm_wallet_binding'))):
        with closing(sqlite3.connect('file:' + path + '?mode=ro', uri=True, timeout=2)) as db:
            db.execute('PRAGMA query_only=ON')
            db.execute('BEGIN')
            db.row_factory = sqlite3.Row
            for table in tables:  # All identifiers are the fixed literals above.
                count = db.execute('SELECT COUNT(*) FROM ' + table).fetchone()[0]
                base.require(count <= 16, 'unexpected extra business records')
                result['counts'][table] = count
                rows = [dict(row) for row in db.execute('SELECT rowid AS seq,* FROM ' + table + ' ORDER BY rowid LIMIT 16')]
                if table == 'wallet_idempotency':
                    for row in rows:
                        if row['operation'].startswith('wallet.'):
                            parsed = auth.receipt(row)
                            row.clear()
                            row.update(parsed)
                            if row['operation'] == 'wallet.atm.issue':
                                row['result'] = redact_issuance(row['result'])
                        else:
                            row['input'] = json.loads(row.pop('input_json'))
                            row['result'] = json.loads(row.pop('result_json'))
                elif table == 'device_api_receipts':
                    for row in rows:
                        row['request'] = json.loads(row.pop('request_json'))
                        raw = row.pop('response_json')
                        row['response'] = json.loads(raw) if raw is not None else None
                result[table] = rows
            if path == LEDGER_DB:
                result['authentication'] = auth.read(db)
                result['balances'] = [dict(row) for row in db.execute('SELECT account,SUM(delta_minor) AS amount_minor FROM wallet_postings GROUP BY account')]
                result['posting_count'] = db.execute('SELECT COUNT(*) FROM wallet_postings').fetchone()[0]
    private_fields_absent(result)
    return result


def membership_contract(wallet):
    membership = wallet['membership']
    base.require(wallet['simulation_only'] is True and wallet['currency'] == 'USD' and wallet['monthly_fee_minor'] == 888,
                 'Wallet must remain the fixed USD simulator')
    base.require(membership['simulation_only'] is True and membership['backend_connected'] is False and
                 membership['real_identity_verified'] is False and membership['identity_source'] == 'public-development-fixture' and
                 membership['registration_input_fields'] == [] and membership['monthly_fee_minor'] == 888 and
                 membership['currency'] == 'USD', 'membership must retain its fixture and minimum-input scope')
    if membership['registered']:
        ent = membership['entitlement']
        base.require(ent['auto_renew'] is False and ent['consent_id'] is None and ent['device_eligible'] is True,
                     'ATM test registration must not grant monthly billing consent')
    base.require(wallet['billed_minor'] == wallet['dispensed_minor'] == wallet['ledger_balance_minor'] == 0,
                 'unexpected fee, cash assertion or unbalanced ledger')
    return membership


def ui_key(value):
    return type(value) is str and re.fullmatch(r'ui-[0-9a-f]{32}', value) is not None


def validate_final(wallet, database):
    private_fields_absent(database)
    membership = membership_contract(wallet)
    base.require(membership['registered'] is True, 'native registration missing')
    account = membership['entitlement']['account_id']
    counts = {'device_api_receipts': 1, 'consents': 0, 'device_monthly_due': 0, 'authorizations': 0, 'device_binding': 1,
              'wallet_idempotency': 8, 'wallet_bills': 0, 'wallet_journals': 4, 'wallet_withdrawals': 1,
              'atm_credentials': 1, 'atm_wallet_binding': 1}
    base.require(database['counts'] == counts and all(len(database[name]) == count for name, count in counts.items()),
                 'unexpected missing, duplicate or hidden business records')
    registration = database['device_api_receipts'][0]
    key = registration['key']
    base.require(ui_key(key) and registration['request'] == {'v': 1, 'op': 'wallet.register', 'key': key} and
                 registration['response'] is not None and registration['response'].get('ok') is True,
                 'native registration request or response differs')
    registered = registration['response']['result']
    base.require(registered['account_id'] == account and registered['additional_personal_fields_required'] == [],
                 'registration does not match the protected membership')
    all_rows = database['wallet_idempotency']
    base.require([row['operation'] for row in all_rows] == ['wallet.auth.begin', 'wallet.auth.enroll', 'wallet.terms',
                 'sale', 'settle', 'wallet.atm.quote', 'wallet.atm.issue', 'atm.cancel'] and
                 all(ui_key(row['key']) for row in all_rows) and len({key, *(row['key'] for row in all_rows)}) == 9,
                 'native authentication and business actions need nine distinct durable receipt identities')
    authentication = auth.approved_atm(wallet, database['authentication'], all_rows, WITHDRAWAL, ATM)
    rows = [all_rows[index] for index in (3, 4, 6, 7)]
    base.require(len(wallet['sales']) == 1 and wallet['sales'][0]['amount_minor'] == AMOUNT and
                 wallet['sales'][0]['status'] == 'SETTLED' and wallet['bills'] == [], 'unexpected sales or monthly debit')
    sale = wallet['sales'][0]
    base.require(rows[0]['input'] == {'amount_minor': AMOUNT} and rows[0]['result']['id'] == sale['id'] and
                 rows[0]['result']['status'] == 'PENDING_SETTLEMENT' and rows[1]['input'] == {'sale_id': sale['id']} and
                 rows[1]['result']['id'] == sale['id'] and rows[1]['result']['status'] == 'SETTLED',
                 'actual native credit and settlement receipts differ')
    credential = database['atm_credentials'][0]
    binding = database['atm_wallet_binding'][0]
    protected_device = database['device_binding'][0]['device_ref']
    scope = {'owner_id': account, 'device_id': protected_device}
    base.require(all(credential[field] == value and binding[field] == value for field, value in scope.items()),
                 'ATM credential is not bound to the protected registered owner and device')
    issue, cancel = rows[2]['result'], rows[3]['result']
    ident = credential['withdrawal_id']
    base.require(rows[2]['input']['account_id'] == account and rows[2]['input']['device_ref'] == protected_device and
                 rows[3]['input'] == {**scope, 'withdrawal_id': ident}, 'ATM request scope or amount differs')
    base.require(issue['simulation_only'] is True and issue['real_atm_connection'] == 'NOT_CONNECTED' and
                 issue['receipt_kind'] == 'immutable_issuance' and issue['state_at_issue'] == 'ISSUED' and
                 issue['currency'] == 'USD' and issue['amount_minor'] == WITHDRAWAL and issue['atm_id'] == ATM and
                 issue['withdrawal_id'] == ident and issue['private_code_hash_verified'] is True and
                 re.fullmatch(r'[0-9a-f]{64}', issue['code_sha256']) is not None and
                 issue['code_sha256'] == credential['code_sha256'] == cancel['code_sha256'] and
                 issue['issued_at'] == credential['issued_at'] and issue['expires_at'] == credential['expires_at'] and
                 issue['expires_at'] - issue['issued_at'] == 300, 'immutable issuance receipt or bounded expiry differs')
    base.require(credential['state'] == 'CANCELED' and credential['atm_id'] == ATM and
                 credential['consumed_at'] is None and credential['consumed_by'] is None and
                 cancel['simulation_only'] is True and cancel['real_atm_connection'] == 'NOT_CONNECTED' and
                 cancel['state'] == 'CANCELED' and cancel['withdrawal_id'] == ident and cancel['atm_id'] == ATM and
                 cancel['consumed'] is False and cancel['code_usable'] is False and cancel['cleanup_needed'] is False,
                 'owner cancellation did not leave the credential unconsumed and unusable')
    withdrawals = wallet['withdrawals']
    base.require(len(withdrawals) == 1 and len(database['wallet_withdrawals']) == 1 and
                 withdrawals[0] == cancel['withdrawal'] and
                 withdrawals[0] == {**{k: v for k, v in database['wallet_withdrawals'][0].items() if k != 'seq'}, 'held_minor': 0},
                 'Wallet, credential cancellation and independent withdrawal rows differ')
    withdrawal = withdrawals[0]
    base.require(withdrawal['id'] == ident and withdrawal['amount_minor'] == withdrawal['released_minor'] == WITHDRAWAL and
                 withdrawal['dispensed_minor'] == 0 and withdrawal['status'] == 'REVERSED', 'unconsumed hold was not fully returned')
    base.require(wallet['available_minor'] == AMOUNT and wallet['pending_minor'] == wallet['held_minor'] == 0,
                 'final funds differ from the one settled test credit')
    base.require(sorted(row['kind'] for row in database['wallet_journals']) ==
                 ['sale_pending', 'sale_settlement', 'withdrawal_hold_reversal', 'withdrawal_reserve'] and
                 database['posting_count'] == 8, 'unexpected cash assertion or extra ledger mutation')
    base.require({row['account']: row['amount_minor'] for row in database['balances']} ==
                 {'AVAILABLE': AMOUNT, 'PENDING_SETTLEMENT': 0, 'SALE_CLEARING': -AMOUNT, 'WITHDRAW_HOLD': 0},
                 'independent double-entry balances differ')
    return {'registration': registration, 'ledger': rows, 'credential': credential, 'authentication': authentication}


def observe(report):
    deadline = time.monotonic() + 240
    while True:
        try:
            initial = base.read_api('snapshot')['snapshot']
            environment, db = base.environment_evidence(), database_evidence()
            break
        except (OSError, ValueError, AssertionError, sqlite3.Error):
            if time.monotonic() >= deadline:
                raise TimeoutError('native ATM services did not start')
            time.sleep(0.5)
    member = membership_contract(initial['wallet'])
    initial_hash = base.wallet_baseline(initial['wallet'])
    base.require(member['registered'] is False and all(count == (1 if name == 'device_binding' else 0)
                 for name, count in db['counts'].items()), 'fresh unregistered and unfunded test data required')
    auth.fresh(db['authentication'])
    hub_hash = base.digest(initial['hub'])
    report.update(environment_initial=environment, wallet_initial=initial['wallet'], wallet_initial_sha256=initial_hash,
                  initial_hub_sha256=hub_hash, registration_without_consent=False,
                  stages=[{'stage': 0, 'observed_unix': time.time(), 'available_minor': 0, 'pending_minor': 0, 'held_minor': 0}])
    base.emit('ROCK_UI_ATM_OBSERVER_READY')
    stage, finished_at = 0, None
    while time.monotonic() < deadline:
        snapshot = base.read_api('snapshot')['snapshot']
        wallet, db = snapshot['wallet'], database_evidence()
        membership = membership_contract(wallet)
        base.require(base.digest(snapshot['hub']) == hub_hash and base.read_receipts() == [], 'ATM test changed Tool state')
        if stage == 1:
            auth.progress(wallet, db['authentication'], db['wallet_idempotency'][:3], report,
                          lambda value: base.emit('ROCK_UI_ATM_' + value))
        marker = None
        if stage == 0 and membership['registered']:
            base.require(wallet['available_minor'] == wallet['pending_minor'] == wallet['held_minor'] == 0, 'registration manufactured funds')
            report['registration_without_consent'] = True
            stage, marker = 1, 'REGISTERED'
        elif stage == 1 and wallet['sales']:
            base.require(report.get('wallet_activation_without_funds') is True and
                         len(wallet['sales']) == 1 and wallet['sales'][0]['status'] == 'PENDING_SETTLEMENT' and
                         wallet['pending_minor'] == AMOUNT and wallet['available_minor'] == wallet['held_minor'] == 0,
                         'native credit must first be unsettled')
            stage, marker = 2, 'CREDIT_PENDING'
        elif stage == 2 and wallet['sales'][0]['status'] == 'SETTLED':
            base.require(wallet['available_minor'] == AMOUNT and wallet['pending_minor'] == wallet['held_minor'] == 0,
                         'settled credit differs')
            stage, marker = 3, 'CREDIT_SETTLED'
        elif stage == 3 and wallet['withdrawals'] and db['atm_credentials']:
            base.require(len(wallet['withdrawals']) == len(db['atm_credentials']) == 1 and
                         wallet['held_minor'] == WITHDRAWAL and wallet['available_minor'] == AMOUNT - WITHDRAWAL and
                         db['atm_credentials'][0]['state'] == 'ISSUED' and db['atm_credentials'][0]['consumed_at'] is None,
                         'issuance did not atomically create one unconsumed hold')
            report['issuance_observed'] = {'wallet': wallet, 'credential': db['atm_credentials'][0]}
            stage, marker = 4, 'ISSUED'
        elif stage == 4 and wallet['held_minor'] == 0:
            report['receipts'] = validate_final(wallet, db)
            stage, marker, finished_at = 5, 'CANCELED', time.monotonic()
        if marker:
            report['stages'].append({'stage': stage, 'observed_unix': time.time(), 'available_minor': wallet['available_minor'],
                                     'pending_minor': wallet['pending_minor'], 'held_minor': wallet['held_minor']})
            base.emit('ROCK_UI_ATM_' + marker)
        if finished_at is not None and time.monotonic() - finished_at >= 30:
            report['receipts'] = validate_final(wallet, db)
            final_environment = base.environment_evidence()
            base.require(environment['processes'] == final_environment['processes'], 'native services restarted during ATM flow')
            report.update(status='PASS', wallet_final=wallet, database=db, environment_final=final_environment,
                          final_hub_sha256=base.digest(snapshot['hub']), tool_state_unchanged=True, capture_grace_seconds=30)
            private_fields_absent(report)
            return
        time.sleep(0.3)
    raise TimeoutError('native ATM flow did not finish; stage=' + str(stage))


def main():
    if os.getuid() != 0 or os.geteuid() != 0 or os.uname().machine != 'aarch64' or 'rock.ui.atm.verify=1' not in Path('/proc/cmdline').read_text().split():
        raise SystemExit('requires an explicitly flagged root ARM64 native ATM verification boot')
    report = {'schema': 'rock-native-atm-ui-proof/1', 'status': 'FAIL', 'scope': 'actual native owner GUI; ATM SIMULATOR ONLY',
              'observer': 'read-only snapshot API and fixed SQLite mode=ro/query_only queries; no business mutations',
              'blackberry': 'NOT_RUN', 'real_money': 'NOT_RUN', 'real_atm': 'NOT_CONNECTED', 'real_identity': 'NOT_CONNECTED',
              'atm_actor_assertions': 0, 'raw_code_in_evidence': False,
              'shutdown': 'explicit observer test termination through init; not Power UI input', 'started_unix': time.time()}
    try:
        observe(report)
    except BaseException as error:
        # Do not render exception values that might originate in private bytes.
        report['error_type'] = type(error).__name__
    finally:
        report['finished_unix'] = time.time()
        try:
            private_fields_absent(report)
            base.PROOF = PROOF
            base.persist(report)
        except BaseException as error:
            report = {'schema': 'rock-native-atm-ui-proof/1', 'status': 'FAIL', 'persistence_error_type': type(error).__name__}
        base.emit('ROCK_UI_ATM_GUEST_PROOF', report)
        base.emit('ROCK_UI_ATM_GUEST_' + report['status'])
        os.sync()
        subprocess.run(['/sbin/poweroff'], check=False)
    return 0 if report['status'] == 'PASS' else 1


if __name__ == '__main__':
    sys.exit(main())

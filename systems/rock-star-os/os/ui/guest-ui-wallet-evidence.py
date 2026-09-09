#!/usr/bin/python3
"""Fixed read-only observer for native simulator Wallet onboarding input."""
from contextlib import closing
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
spec = importlib.util.spec_from_file_location('rock_wallet_ui_base', SOURCE)
base = importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)

ENTITLEMENT_DB = '/data/wallet/entitlement.db'
LEDGER_DB = '/data/wallet/wallet-simulator.db'
PROOF = Path('/data/ui-wallet-proof.json')
TERMS = 'simulator-monthly-usd-8.88-v1'
AMOUNT, FEE = 2000, 888


def database_evidence():
    result = {}
    with closing(sqlite3.connect('file:' + ENTITLEMENT_DB + '?mode=ro', uri=True, timeout=2)) as db:
        db.execute('PRAGMA query_only=ON')
        db.row_factory = sqlite3.Row
        for name, query in {
            'device_receipts': 'SELECT rowid AS seq,* FROM device_api_receipts ORDER BY rowid LIMIT 16',
            'consents': 'SELECT rowid AS seq,* FROM consents ORDER BY rowid LIMIT 8',
            'due': 'SELECT * FROM device_monthly_due LIMIT 2',
            'authorizations': 'SELECT * FROM authorizations LIMIT 32',
        }.items():
            result[name] = [dict(row) for row in db.execute(query)]
    with closing(sqlite3.connect('file:' + LEDGER_DB + '?mode=ro', uri=True, timeout=2)) as db:
        db.execute('PRAGMA query_only=ON')
        db.row_factory = sqlite3.Row
        for name, query in {
            'ui_ledger_receipts': "SELECT rowid AS seq,* FROM wallet_idempotency WHERE substr(key,1,3)='ui-' ORDER BY rowid LIMIT 8",
            'bills': 'SELECT * FROM wallet_bills LIMIT 2',
            'journals': 'SELECT * FROM wallet_journals ORDER BY created_at,id LIMIT 8',
            'balances': 'SELECT account,SUM(delta_minor) AS amount_minor FROM wallet_postings GROUP BY account',
        }.items():
            result[name] = [dict(row) for row in db.execute(query)]
    return result


def membership_contract(wallet):
    membership = wallet['membership']
    base.require(wallet['simulation_only'] is True and wallet['currency'] == 'USD' and wallet['monthly_fee_minor'] == FEE,
                 'Wallet must remain the fixed USD simulator')
    base.require(membership['simulation_only'] is True and membership['backend_connected'] is False and
                 membership['real_identity_verified'] is False and membership['identity_source'] == 'public-development-fixture' and
                 membership['registration_input_fields'] == [] and membership['monthly_fee_minor'] == FEE and
                 membership['currency'] == 'USD' and membership['terms_version'] == TERMS,
                 'membership must explicitly remain a public fixture without added personal information')
    return membership


def ui_key(value):
    return type(value) is str and re.fullmatch(r'ui-[0-9a-f]{32}', value) is not None


def complete_receipts(database, wallet):
    membership = membership_contract(wallet)
    account = membership['entitlement']['account_id']
    records = database['device_receipts']
    base.require(len(records) == 5, 'expected register, consent, two bill requests and cancellation')
    requests, results = [], []
    for row in records:
        base.require(ui_key(row['key']) and row['response_json'] is not None, 'native device receipt is missing or incomplete')
        request, response = json.loads(row['request_json']), json.loads(row['response_json'])
        base.require(response.get('ok') is True and request.get('key') == row['key'] and type(request.get('v')) is int and request['v'] == 1,
                     'native membership request failed or differs from stored receipt')
        requests.append(request)
        results.append(response['result'])
    base.require([item['op'] for item in requests] == ['wallet.register', 'wallet.consent', 'wallet.bill', 'wallet.bill', 'wallet.consent'],
                 'unexpected native membership action order')
    base.require(requests[0] == {'v': 1, 'op': 'wallet.register', 'key': requests[0]['key']} and
                 results[0]['account_id'] == account and results[0]['additional_personal_fields_required'] == [],
                 'registration included extra data or belongs to another account')
    for index, accepted in ((1, True), (4, False)):
        base.require(requests[index] == {'v': 1, 'op': 'wallet.consent', 'key': requests[index]['key'],
                                        'accepted': accepted, 'terms_version': TERMS}, 'consent request differs from exact displayed terms')
        result = results[index]
        base.require(result['account_id'] == account and result['accepted'] is accepted and result['terms_version'] == TERMS and
                     result['amount_minor'] == FEE and result['currency'] == 'USD', 'consent receipt is not the exact monthly fixture agreement')
    base.require(len(database['due']) == 1 and database['due'][0]['status'] == 'paid', 'actual monthly due work did not finish paid')
    due = database['due'][0]
    for index in (2, 3):
        base.require(requests[index] == {'v': 1, 'op': 'wallet.bill', 'key': requests[index]['key'], 'period': due['period']},
                     'billing requested an unexpected period or fields')
        base.require(results[index]['accepted'] is True and results[index]['operation'] == requests[index]['key'] and
                     results[index]['schedule_id'] == due['schedule_id'] and results[index]['period'] == due['period'],
                     'two GUI billing requests did not resolve to one durable monthly schedule')
    base.require(len({item['key'] for item in requests}) == 5, 'different GUI actions must have distinct request identities')
    ledger = database['ui_ledger_receipts']
    base.require(len(ledger) == 2 and [item['operation'] for item in ledger] == ['sale', 'settle'] and
                 all(ui_key(item['key']) for item in ledger) and len({item['key'] for item in ledger}) == 2,
                 'expected exactly one native simulator credit and one native settlement')
    sale = wallet['sales'][0]
    base.require(json.loads(ledger[0]['input_json']) == {'amount_minor': AMOUNT} and
                 json.loads(ledger[0]['result_json'])['id'] == sale['id'] and
                 json.loads(ledger[1]['input_json']) == {'sale_id': sale['id']} and
                 json.loads(ledger[1]['result_json'])['status'] == 'SETTLED', 'native ledger receipts do not match actual credit and settlement')
    return {'requests': requests, 'results': results, 'ledger_requests': ledger}


def validate_final(wallet, database):
    membership = membership_contract(wallet)
    ent = membership['entitlement']
    base.require(membership['registered'] is True and ent['auto_renew'] is False and
                 ent['subscription_state'] == 'CANCEL_AT_PERIOD_END' and ent['access_allowed'] is True,
                 'cancellation must stop renewal while retaining the already-paid test period')
    for field, expected in {'available_minor': AMOUNT - FEE, 'pending_minor': 0, 'held_minor': 0,
                            'billed_minor': FEE, 'dispensed_minor': 0, 'ledger_balance_minor': 0}.items():
        base.require(type(wallet.get(field)) is int and wallet[field] == expected, 'wrong actual final ledger value: ' + field)
    base.require(wallet['withdrawals'] == [] and len(wallet['sales']) == 1 and wallet['sales'][0]['amount_minor'] == AMOUNT and
                 wallet['sales'][0]['status'] == 'SETTLED' and len(wallet['bills']) == 1, 'unexpected Wallet records')
    receipts = complete_receipts(database, wallet)
    base.require(len(database['bills']) == 1 and database['bills'][0]['amount_minor'] == FEE and
                 database['bills'][0]['period'] == database['due'][0]['period'], 'exactly one actual 888-cent bill is required')
    base.require(len(database['consents']) == 2 and [row['accepted'] for row in database['consents']] == [1, 0] and
                 all(row['amount_minor'] == FEE and row['terms_version'] == TERMS and row['account_id'] == ent['account_id']
                     for row in database['consents']), 'independent consent rows differ from native consent/cancellation')
    base.require(sorted(row['kind'] for row in database['journals']) == ['monthly_fee', 'sale_pending', 'sale_settlement'],
                 'unexpected extra ledger transfer or repeated monthly debit')
    balances = {row['account']: row['amount_minor'] for row in database['balances']}
    base.require(balances == {'AVAILABLE': AMOUNT - FEE, 'PENDING_SETTLEMENT': 0, 'SALE_CLEARING': -AMOUNT, 'SERVICE_FEES': FEE},
                 'independent double-entry balances differ from final snapshot')
    paid = [row for row in database['authorizations'] if row['state'] == 'PAID']
    base.require(len(paid) == 1 and paid[0]['authorization_id'] == database['due'][0]['authorization_id'],
                 'exactly one paid authorization must match the monthly schedule')
    return receipts


def observe(report):
    deadline = time.monotonic() + 240
    while True:
        try:
            initial = base.read_api('snapshot')['snapshot']
            environment = base.environment_evidence()
            db = database_evidence()
            break
        except (OSError, ValueError, AssertionError, sqlite3.Error) as error:
            if time.monotonic() >= deadline:
                raise TimeoutError('Wallet UI services did not start: ' + str(error)) from error
            time.sleep(0.5)
    membership = membership_contract(initial['wallet'])
    initial_hash = base.wallet_baseline(initial['wallet'])
    base.require(membership['registered'] is False and membership['registration_status'] == 'REGISTRATION_REQUIRED', 'fresh unregistered handoff fixture required')
    base.require(all(db[name] == [] for name in ('device_receipts', 'ui_ledger_receipts', 'consents', 'due', 'bills', 'journals', 'authorizations')),
                 'fresh empty Wallet membership and ledger actions required')
    hub_hash = base.digest(initial['hub'])
    report.update(environment_initial=environment, wallet_initial=initial['wallet'], wallet_initial_sha256=initial_hash,
                  initial_hub_sha256=hub_hash, registration_without_consent=False, stages=[])
    base.emit('ROCK_UI_WALLET_OBSERVER_READY')
    stage, finished_at = 0, None
    while time.monotonic() < deadline:
        snapshot = base.read_api('snapshot')['snapshot']
        wallet, db = snapshot['wallet'], database_evidence()
        membership = membership_contract(wallet)
        base.require(base.digest(snapshot['hub']) == hub_hash and base.read_receipts() == [], 'Wallet onboarding changed Tool state')
        base.require(wallet['held_minor'] == wallet['dispensed_minor'] == 0 and wallet['withdrawals'] == [], 'unexpected withdrawal operation')
        ent = membership['entitlement'] or {}
        if stage == 0 and membership['registered']:
            base.require(ent['auto_renew'] is False and ent['consent_id'] is None and wallet['billed_minor'] == 0,
                         'registration silently consented or billed')
            report['registration_without_consent'] = True
            stage = 1
            base.emit('ROCK_UI_WALLET_REGISTERED')
        if stage == 1 and ent.get('auto_renew') is True:
            base.require(wallet['billed_minor'] == 0 and wallet['available_minor'] == wallet['pending_minor'] == 0,
                         'consent before credit must not manufacture money')
            stage = 2
            base.emit('ROCK_UI_WALLET_CONSENTED')
        if stage == 2 and wallet['sales']:
            base.require(len(wallet['sales']) == 1 and wallet['sales'][0]['amount_minor'] == AMOUNT and
                         wallet['sales'][0]['status'] == 'PENDING_SETTLEMENT' and wallet['pending_minor'] == AMOUNT and
                         wallet['available_minor'] == wallet['billed_minor'] == 0, 'native credit must first be unsettled')
            stage = 3
            base.emit('ROCK_UI_WALLET_CREDIT_PENDING')
        if stage == 3 and wallet['sales'][0]['status'] == 'SETTLED':
            base.require(wallet['pending_minor'] == 0 and wallet['available_minor'] + wallet['billed_minor'] == AMOUNT,
                         'settled simulator credit did not balance')
            stage = 4
            base.emit('ROCK_UI_WALLET_CREDIT_SETTLED')
        bills = [row for row in db['device_receipts'] if json.loads(row['request_json']).get('op') == 'wallet.bill' and row['response_json'] is not None]
        if stage == 4 and wallet['billed_minor'] == FEE and len(bills) >= 1:
            stage = 5
            base.emit('ROCK_UI_WALLET_BILLED_ONCE')
        if stage == 5 and len(bills) == 2:
            base.require(wallet['billed_minor'] == FEE and len(wallet['bills']) == 1, 'second billing request debited the month twice')
            stage = 6
            base.emit('ROCK_UI_WALLET_BILL_REPEATED_ONCE')
        if stage == 6 and ent.get('auto_renew') is False:
            report['receipts'] = validate_final(wallet, db)
            stage, finished_at = 7, time.monotonic()
            base.emit('ROCK_UI_WALLET_CANCELED')
        if not report['stages'] or report['stages'][-1]['stage'] != stage:
            report['stages'].append({'stage': stage, 'observed_unix': time.time(), 'available_minor': wallet['available_minor'],
                                     'pending_minor': wallet['pending_minor'], 'billed_minor': wallet['billed_minor']})
        if finished_at is not None and time.monotonic() - finished_at >= 30:
            report['receipts'] = validate_final(wallet, db)
            final_environment = base.environment_evidence()
            base.require(environment['processes'] == final_environment['processes'], 'native services restarted during onboarding')
            report.update(status='PASS', wallet_final=wallet, database=db, environment_final=final_environment,
                          final_hub_sha256=base.digest(snapshot['hub']), tool_state_unchanged=True, capture_grace_seconds=30)
            return
        time.sleep(0.3)
    raise TimeoutError('native Wallet flow did not finish; stage=' + str(stage))


def main():
    if os.getuid() != 0 or os.geteuid() != 0 or os.uname().machine != 'aarch64' or 'rock.ui.wallet.verify=1' not in Path('/proc/cmdline').read_text().split():
        raise SystemExit('requires an explicitly flagged root ARM64 native Wallet verification boot')
    report = {'schema': 'rock-native-wallet-ui-proof/1', 'status': 'FAIL', 'scope': 'actual native GUI; public fixture and simulator ledger only',
              'observer': 'read-only snapshot API and fixed SQLite mode=ro/query_only queries; no mutations',
              'blackberry': 'NOT_RUN', 'real_money': 'NOT_RUN', 'real_identity': 'NOT_CONNECTED', 'started_unix': time.time()}
    try:
        observe(report)
    except BaseException as error:
        report['error'] = type(error).__name__ + ': ' + str(error)
    finally:
        report['finished_unix'] = time.time()
        try:
            base.PROOF = PROOF
            base.persist(report)
        except BaseException as error:
            report.update(status='FAIL', persistence_error=str(error))
        base.emit('ROCK_UI_WALLET_GUEST_PROOF', report)
        base.emit('ROCK_UI_WALLET_GUEST_' + report['status'])
        os.sync()
        subprocess.run(['/sbin/poweroff', '-f'], check=False)
    return 0 if report['status'] == 'PASS' else 1


if __name__ == '__main__':
    sys.exit(main())

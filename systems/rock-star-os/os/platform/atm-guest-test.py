#!/usr/bin/python3
"""Flagged actual ARM64 guest: owner UID1000 and separate root ATM fixture IPC.

Never print or persist raw bearer codes in proof/logs. Private Wallet issuance
receipts retain them under the documented simulator-only storage contract.
"""
from contextlib import closing
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import subprocess
import sys
import time

sys.path.insert(0, '/usr/lib/rock-platform')
from service import call, WALLET_SOCKET, WALLET_UID

PROOF = Path('/data/atm-proof.json')
FINAL = Path('/data/atm-final-proof.json')
checks = []
OWNER_CLIENT = """import json,sys
sys.path.insert(0,'/usr/lib/rock-platform')
from service import call,PLATFORM_SOCKET,PLATFORM_UID
result=call(PLATFORM_SOCKET,json.load(sys.stdin),PLATFORM_UID,return_errors=True)
print(json.dumps(result))
"""
PLATFORM_WALLET_CLIENT = """import json,sys
sys.path.insert(0,'/usr/lib/rock-platform')
from service import call,WALLET_SOCKET,WALLET_UID
result=call(WALLET_SOCKET,json.load(sys.stdin),WALLET_UID,return_errors=True)
print(json.dumps({'denied':result.get('ok') is False and result.get('code')=='unauthorized'}))
"""
AUTHENTICATOR_CLIENT = """import json,sys
sys.path.insert(0,'/usr/lib/rock-platform')
from service import call
print(json.dumps(call('/run/rock-authenticator/api.sock',json.load(sys.stdin),1004,return_errors=True)))
"""


def emit(marker, record):
    print('\n' + marker + ' ' + json.dumps(record, sort_keys=True), flush=True)


def check(name, value):
    if not value:
        raise AssertionError(name)
    checks.append(name)
    emit('PASS_ATM', name)


def owner(op, *, reject=False, **fields):
    # Request/response bytes, including credentials, remain captured in this
    # process and are never placed in command arguments or the serial log.
    response = subprocess.run(['/usr/bin/python3', '-I', '-B', '-c', OWNER_CLIENT],
                              input=json.dumps({'v': 1, 'op': op, **fields}).encode(),
                              capture_output=True, timeout=20, user=1000, group=1000, extra_groups=[])
    if response.returncode:
        raise RuntimeError('owner IPC process failed; captured bytes withheld')
    result = json.loads(response.stdout)
    if reject:
        return result.get('ok') is False and result.get('code') in ('unauthorized', 'rejected')
    if result.get('ok') is not True:
        raise RuntimeError('owner IPC request failed; response withheld')
    return result.get('result', result.get('snapshot'))


def actor(op, *, reject=False, **fields):
    response = call(WALLET_SOCKET, {'v': 1, 'op': op, **fields}, WALLET_UID, return_errors=True)
    if reject:
        return response.get('ok') is False and response.get('code') in ('unauthorized', 'rejected')
    if response.get('ok') is not True:
        raise RuntimeError('root ATM IPC request failed; response withheld')
    return response['result']


def platform_direct_wallet_denied(receipt):
    result = subprocess.run(['/usr/bin/python3', '-I', '-B', '-c', PLATFORM_WALLET_CLIENT],
                            input=json.dumps({'v': 1, 'op': 'atm.redeem', 'code': receipt['code'],
                                              'atm_id': 'SIM-ATM-001', 'key': 'platform-direct-redeem'}).encode(),
                            capture_output=True, timeout=15, user=1002, group=1002, extra_groups=[])
    return result.returncode == 0 and json.loads(result.stdout).get('denied') is True


def authenticate(op, options, key):
    # Programmatic public TEST PIN in this flagged integration probe, not a
    # human/native-UI-presence assertion. Actual UID1000 socket and signatures.
    response = subprocess.run(['/usr/bin/python3', '-I', '-B', '-c', AUTHENTICATOR_CLIENT],
        input=json.dumps({'v': 1, 'op': op, 'options': options, 'pin': '0000', 'key': key}).encode(),
        capture_output=True, timeout=20, user=1000, group=1000, extra_groups=[])
    if response.returncode:
        raise RuntimeError('authenticator IPC process failed; private bytes withheld')
    value = json.loads(response.stdout)
    if value.get('ok') is not True:
        raise RuntimeError('test authenticator rejected; private bytes withheld')
    return value['credential']


def issue():
    quote = owner('wallet.atm.quote', amount_minor=1000, atm_id='SIM-ATM-001',
                  key='atm-guest-quote', issue_key='atm-guest-issue')
    assertion = authenticate('auth.get', quote['options'], 'atm-guest-get')
    return owner('wallet.atm.issue', quote_id=quote['quote_id'], credential=assertion, key='atm-guest-issue')


def current(receipt):
    return owner('wallet.atm.status', withdrawal_id=receipt['withdrawal_id'])


def balances():
    state = owner('snapshot')['wallet']
    return {name: state[name] for name in ('available_minor', 'held_minor', 'dispensed_minor',
                                          'pending_minor', 'billed_minor', 'ledger_balance_minor')}


def observe_database():
    # Read-only root observer. Do not export result_json or the database: it
    # contains the private issuance bearer code by design.
    with closing(sqlite3.connect('file:/data/wallet/wallet-simulator.db?mode=ro', uri=True)) as db:
        db.row_factory = sqlite3.Row
        db.execute('PRAGMA query_only=ON')
        integrity = db.execute('PRAGMA integrity_check').fetchone()[0]
        result = {
            'integrity': integrity,
            'credentials': [dict(row) for row in db.execute('SELECT withdrawal_id,atm_id,code_sha256,state,issued_at,expires_at,consumed_at,consumed_by FROM atm_credentials ORDER BY withdrawal_id')],
            'withdrawals': [dict(row) for row in db.execute('SELECT * FROM wallet_withdrawals ORDER BY id')],
            'accounts': {row[0]: row[1] for row in db.execute('SELECT account,SUM(delta_minor) FROM wallet_postings GROUP BY account')},
            'journal_count': db.execute('SELECT COUNT(*) FROM wallet_journals').fetchone()[0],
            'posting_count': db.execute('SELECT COUNT(*) FROM wallet_postings').fetchone()[0],
            'invalid_journals': db.execute('SELECT COUNT(*) FROM (SELECT journal_id FROM wallet_postings GROUP BY journal_id HAVING SUM(delta_minor)!=0)').fetchone()[0],
            'atm_receipt_counts': {row[0]: row[1] for row in db.execute("SELECT operation,COUNT(*) FROM wallet_idempotency WHERE operation LIKE 'atm.%' OR operation LIKE 'wallet.atm.%' GROUP BY operation")},
            'verified_approval_count': db.execute('SELECT COUNT(*) FROM wallet_auth_approvals').fetchone()[0],
        }
    check('read-only Wallet integrity and balanced journals', integrity == 'ok' and result['invalid_journals'] == 0)
    return result


def save(path, report):
    raw = json.dumps(report, sort_keys=True).encode()
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(descriptor, 'wb') as stream:
        stream.write(raw)
        stream.flush()
        os.fsync(stream.fileno())
    descriptor = os.open('/data', os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def first(report):
    check('fresh Wallet registration required', not owner('wallet.membership')['registered'])
    check('unregistered issuance rejected', owner('wallet.atm.issue', amount_minor=1000, atm_id='SIM-ATM-001', key='unregistered', reject=True))
    owner('wallet.register', key='atm-guest-register')
    membership = owner('wallet.membership')
    check('protected fixture registration and no implicit monthly consent', membership['registered'] and
          not membership['entitlement']['auto_renew'] and not membership['backend_connected'])
    begin = owner('wallet.auth.begin', key='atm-guest-auth-begin')
    credential = authenticate('auth.create', begin['options'], 'atm-guest-create')
    owner('wallet.auth.enroll', key='atm-guest-enroll', challenge_id=begin['challenge_id'], credential=credential)
    check('enrollment requires separate Wallet terms', owner('wallet.auth.status')['activation_state'] == 'TERMS_REQUIRED')
    owner('wallet.terms', key='atm-guest-terms', accepted=True, terms_version='rock-wallet-development/1')
    check('activated Wallet without implicit monthly consent', owner('wallet.auth.status')['active'] and
          not owner('wallet.membership')['entitlement']['auto_renew'])
    sale = owner('wallet.sale', amount_minor=5000, key='atm-guest-sale')
    owner('wallet.settle', id=sale['id'], key='atm-guest-settle')
    receipt = issue()
    check('same owner issuance key produces one immutable receipt', issue() == receipt)
    check('USD 1000-cent issue reserves exactly once', balances() == {
        'available_minor': 4000, 'held_minor': 1000, 'dispensed_minor': 0,
        'pending_minor': 0, 'billed_minor': 0, 'ledger_balance_minor': 0})
    check('owner JSON identity rejected', owner('wallet.atm.issue', amount_minor=1000,
          atm_id='SIM-ATM-001', key='forged', owner_id='forged-owner', reject=True))
    check('owner cannot consume via Platform', owner('atm.redeem', code=receipt['code'],
          atm_id='SIM-ATM-001', key='owner-redeem', reject=True))
    check('owner cannot use namespaced ATM assertion', owner('wallet.atm.redeem', code=receipt['code'],
          atm_id='SIM-ATM-001', key='owner-namespaced-redeem', reject=True))
    check('actual platform UID 1002 cannot assert directly at Wallet socket', platform_direct_wallet_denied(receipt))
    for op, values in (('wallet.dispense', {'dispensed_minor': 1000}),
                       ('wallet.reconcile', {'total_dispensed_minor': 0}), ('wallet.unknown', {})):
        check('legacy bypass denied ' + op, owner(op, id=receipt['withdrawal_id'], key='bypass-' + op, reject=True, **values))
    check('root fixed actor rejects another ATM', actor('atm.redeem', code=receipt['code'],
          atm_id='SIM-ATM-002', key='wrong-atm', reject=True))
    check('root JSON token override rejected', actor('atm.redeem', code=receipt['code'],
          atm_id='SIM-ATM-001', key='wrong-token', token='forged', reject=True))
    authorized = actor('atm.redeem', code=receipt['code'], atm_id='SIM-ATM-001', key='atm-guest-redeem')
    check('root Wallet IPC consumes without asserting cash', authorized['authorized'] and
          authorized['state'] == 'AUTHORIZED_NOT_DISPENSED' and balances()['dispensed_minor'] == 0)
    check('a second reading cannot consume again', actor('atm.redeem', code=receipt['code'],
          atm_id='SIM-ATM-001', key='second-reader', reject=True))
    result = owner('wallet.atm.timeout', withdrawal_id=receipt['withdrawal_id'], key='atm-guest-timeout')
    check('consumed timeout holds funds as UNKNOWN', result['state'] == 'UNKNOWN' and balances()['held_minor'] == 1000)
    history = owner('wallet.atm.history', limit=50)
    check('owner current views contain hashes only', receipt['code'] not in json.dumps([current(receipt), history, owner('snapshot')]))
    report.update(withdrawal_id=receipt['withdrawal_id'], code_sha256=receipt['code_sha256'],
                  balances=balances(), database=observe_database())
    check('one durable credential and consumption receipt', len(report['database']['credentials']) == 1 and
          report['database']['atm_receipt_counts'].get('wallet.atm.issue') == 1 and
          report['database']['verified_approval_count'] == 1 and
          report['database']['atm_receipt_counts'].get('atm.redeem') == 1)


def second(report):
    previous = json.loads(PROOF.read_text())
    check('first boot passed and kernel really restarted', previous['status'] == 'PASS' and
          previous['phase'] == 1 and previous['boot_id'] != report['boot_id'])
    receipt = issue()
    check('original private issuance receipt recovered across reboot', receipt['withdrawal_id'] == previous['withdrawal_id'] and
          hashlib.sha256(receipt['code'].encode()).hexdigest() == previous['code_sha256'])
    check('UNKNOWN hold and balanced ledger persist across reboot', current(receipt)['state'] == 'UNKNOWN' and balances() == previous['balances'])
    authorized = actor('atm.redeem', code=receipt['code'], atm_id='SIM-ATM-001', key='atm-guest-redeem')
    check('authorization replay does not consume or dispense again', authorized['authorization_id'] == receipt['withdrawal_id'] and
          balances() == previous['balances'])
    partial = actor('atm.dispense', withdrawal_id=receipt['withdrawal_id'], dispensed_minor=400,
                    atm_id='SIM-ATM-001', key='atm-guest-partial')
    check('partial cumulative fixture assertion keeps unknown remainder held', partial['state'] == 'UNKNOWN' and
          balances()['held_minor'] == 600 and balances()['dispensed_minor'] == 400)
    final_fields = {'withdrawal_id': receipt['withdrawal_id'], 'total_dispensed_minor': 400,
                    'atm_id': 'SIM-ATM-001', 'key': 'atm-guest-final'}
    final = actor('atm.reconcile', **final_fields)
    check('final reconcile retry returns one result', actor('atm.reconcile', **final_fields) == final)
    check('confirmed remaining hold returned through existing ledger', final['state'] == 'PARTIAL_REVERSED' and balances() == {
        'available_minor': 4600, 'held_minor': 0, 'dispensed_minor': 400,
        'pending_minor': 0, 'billed_minor': 0, 'ledger_balance_minor': 0})
    owner('wallet.atm.cancel', withdrawal_id=receipt['withdrawal_id'], key='late-cancel')
    check('late cancel cannot reopen a terminal credential', current(receipt)['state'] == 'PARTIAL_REVERSED')
    report.update(first_boot_id=previous['boot_id'], withdrawal_id=receipt['withdrawal_id'],
                  code_sha256=receipt['code_sha256'], balances=balances(), database=observe_database(),
                  previous_proof_sha256=hashlib.sha256(PROOF.read_bytes()).hexdigest())
    check('reboot did not duplicate credential or consumption', len(report['database']['credentials']) == 1 and
          report['database']['atm_receipt_counts'].get('wallet.atm.issue') == 1 and
          report['database']['verified_approval_count'] == 1 and
          report['database']['atm_receipt_counts'].get('atm.redeem') == 1 and
          report['database']['atm_receipt_counts'].get('atm.reconcile') == 1)


def main():
    if (os.geteuid() != 0 or os.uname().machine != 'aarch64' or
            'rock.atm.verify=1' not in Path('/proc/cmdline').read_text().split()):
        raise SystemExit('requires explicitly flagged root ARM64 ATM simulator test')
    report = {'schema': 'rock-os-atm-guest-proof/2', 'status': 'FAIL', 'phase': 2 if PROOF.exists() else 1,
              'boot_id': Path('/proc/sys/kernel/random/boot_id').read_text().strip(), 'started_unix': time.time(),
              'simulation_only': True, 'physical_atm': 'NOT_CONNECTED', 'real_funds': 'NOT_USED',
              'production_authentication': 'NOT_IMPLEMENTED', 'owner_peer_uid': 1000,
              'software_test_authenticator_uid': 1004, 'actual_assertion_verification': True,
              'native_gui_presence': False, 'test_pin_entry': 'programmatic-public-fixture',
              'wallet_service_uid': 1003, 'atm_actor_peer_uid': 0, 'network': 'no NIC'}
    try:
        check('actual ARM64 OS and no network adapter', not Path('/sys/class/net/eth0').exists() and owner('health')['ready'])
        (first if report['phase'] == 1 else second)(report)
        report['status'] = 'PASS'
    except BaseException as error:
        # Never serialize an exception's arbitrary arguments or local values.
        report['error_type'] = type(error).__name__
    report.update(checks=checks, finished_unix=time.time())
    save(PROOF if report['phase'] == 1 else FINAL, report)
    emit('ROCK_ATM_GUEST_PROOF', report)
    emit('ROCK_ATM_GUEST_' + report['status'], {'phase': report['phase'], 'checks': len(checks)})
    os.sync()
    # Normal init shutdown flushes the existing daemon's SQLite files. The
    # harness separately observes process exit and the persisted proof.
    owner('device.poweroff', key='atm-guest-poweroff-' + str(report['phase']))


if __name__ == '__main__':
    main()

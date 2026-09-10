"""Read-only joins for current public Wallet ceremonies, never a signing helper."""
import hashlib
import json
from pathlib import Path
import re
import sys

sys.path.insert(0, '/usr/lib/rock-platform')
if not Path('/usr/lib/rock-platform').is_dir():
    sys.path[:0] = [str(Path(__file__).resolve().parents[2] / 'src'), str(Path(__file__).resolve().parents[1])]
from wallet_auth import protocol as crypto

TABLES = ('wallet_auth_mode', 'wallet_auth_credentials', 'wallet_auth_credential_state',
          'wallet_auth_challenges', 'wallet_auth_terms', 'wallet_auth_quotes', 'wallet_auth_approvals')
TERMS = 'rock-wallet-development/1'


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def no_pin(value):
    if isinstance(value, dict):
        require(not any(str(key).casefold() in ('pin', 'test_pin', 'auth_pin', 'password') for key in value),
                'private PIN field in evidence')
        for item in value.values():
            no_pin(item)
    elif isinstance(value, list):
        for item in value:
            no_pin(item)


def read(db):
    result = {}
    for table in TABLES:
        rows = [dict(row) for row in db.execute('SELECT rowid AS seq,* FROM ' + table + ' ORDER BY rowid LIMIT 17')]
        require(len(rows) <= 16, 'too many Wallet authentication rows')
        for row in rows:
            for key in tuple(row):
                if key.endswith('_json'):
                    row[key[:-5]] = json.loads(row.pop(key))
        result[table] = rows
    no_pin(result)
    return result


def fresh(data):
    require(len(data['wallet_auth_mode']) == 1 and data['wallet_auth_mode'][0]['schema_version'] == 1 and
            data['wallet_auth_mode'][0]['account_id'] is None and all(data[name] == [] for name in TABLES[1:]),
            'fresh authentication authority without prior enrollment required')


def receipt(row):
    row = dict(row)
    row['input'] = json.loads(row.pop('input_json'))
    response = json.loads(row.pop('result_json'))
    require(set(response) == {'ok', 'result'} and response['ok'] is True, 'failed authentication receipt')
    row['result'] = response['result']
    no_pin(row)
    return row


def request(row, owner, device, authority):
    value = row['input']
    require(set(value) == {'authority_id', 'account_id', 'device_ref', 'handoff_ref', 'request'} and
            value['authority_id'] == authority and value['account_id'] == owner and value['device_ref'] == device and
            isinstance(value['handoff_ref'], str) and value['handoff_ref'], 'authentication receipt scope differs')
    body = value['request']
    require(body.get('v') == 1 and type(body['v']) is int and body.get('op') == row['operation'] and
            body.get('key') == row['key'] and re.fullmatch(r'ui-[0-9a-f]{32}', row['key']) is not None,
            'authentication was not an explicit UI request')
    return body


def activation(wallet, data, rows, *, assertions=0):
    no_pin([data, rows])
    for name in ('wallet_auth_mode', 'wallet_auth_credentials', 'wallet_auth_credential_state',
                 'wallet_auth_challenges', 'wallet_auth_terms'):
        require(len(data[name]) == 1, 'missing or duplicate activation evidence')
    require(len(rows) == 3 and [row['operation'] for row in rows] ==
            ['wallet.auth.begin', 'wallet.auth.enroll', 'wallet.terms'] and len({row['key'] for row in rows}) == 3,
            'ordered enrollment and separate Wallet terms receipts required')
    mode = data['wallet_auth_mode'][0]
    owner = wallet['membership']['entitlement']['account_id']
    credential, current = data['wallet_auth_credentials'][0], data['wallet_auth_credential_state'][0]
    challenge, terms = data['wallet_auth_challenges'][0], data['wallet_auth_terms'][0]
    device, authority = credential['device_id'], mode['authority_id']
    require(mode['account_id'] == owner and mode['schema_version'] == 1 and
            all(row['account_id'] == owner and row['device_id'] == device for row in (credential, challenge, terms)) and
            len({row['input']['handoff_ref'] for row in rows}) == 1,
            'activation owner/device binding differs')
    begin, enroll, accept = [request(row, owner, device, authority) for row in rows]
    require(begin == {'v': 1, 'op': 'wallet.auth.begin', 'key': rows[0]['key']} and
            set(enroll) == {'v', 'op', 'key', 'challenge_id', 'credential'} and
            accept == {'v': 1, 'op': 'wallet.terms', 'key': rows[2]['key'], 'accepted': True, 'terms_version': TERMS},
            'activation request fields or separate Wallet terms differ')
    started = rows[0]['result']
    require(started['challenge_id'] == enroll['challenge_id'] == challenge['challenge_id'] == credential['enrollment_challenge_id'] and
            started['options'] == challenge['options'] and challenge['state'] == 'USED' and
            challenge['challenge'] == started['options']['publicKey']['challenge'] and
            started['options']['device_ref'] == device and challenge['handoff_ref'] == rows[0]['input']['handoff_ref'] and
            started['simulation_only'] is True and challenge['expires_at'] == started['expires_at'] and
            challenge['issued_at'] <= credential['created_at'] < challenge['expires_at'] and
            credential['created_at'] <= terms['created_at'],
            'enrollment challenge was not consumed by the same device')
    record = crypto.verify_registration(enroll['credential'], challenge=challenge['challenge'],
        rp_id=crypto.RP_ID, origin=crypto.ORIGIN)
    require(record == credential['record'] and current['credential_id'] == credential['credential_id'] == record['credential_id'] and
            current['revoked_at'] is None and current['record']['sign_count'] == assertions,
            'verified registration or current credential differs')
    if assertions == 0:
        require(current['record'] == record, 'unexpected assertion before monthly-only flow')
    require(terms['accepted'] == 1 and terms['terms_version'] == TERMS and terms['credential_id'] == record['credential_id'] and
            rows[1]['result']['credential_id'] == record['credential_id'] and
            rows[1]['result']['activation_state'] == 'TERMS_REQUIRED' and
            rows[2]['result']['terms_receipt_id'] == terms['terms_receipt_id'] and rows[2]['result']['active'] is True and
            wallet['auth']['active'] is True and wallet['auth']['wallet_terms_accepted'] is True and
            wallet['auth']['credential_id'] == record['credential_id'], 'Wallet terms or active identity not proven')
    return {'owner': owner, 'device': device, 'authority': authority, 'record': record,
            'user_handle': started['options']['publicKey']['user']['id']}


def approved_atm(wallet, data, rows, amount, atm):
    scope = activation(wallet, data, rows[:3], assertions=1)
    require(len(data['wallet_auth_quotes']) == len(data['wallet_auth_approvals']) == 1,
            'exactly one quote and approval required')
    quote_row, approval = data['wallet_auth_quotes'][0], data['wallet_auth_approvals'][0]
    quote, issued = rows[5]['result'], rows[6]['result']
    quote_request, issue_request = [request(row, scope['owner'], scope['device'], scope['authority']) for row in rows[5:7]]
    value = quote['quote']
    for obj in (value, issued):
        require(all(type(obj[name]) is int for name in ('amount_minor', 'fee_minor', 'total_debit_minor', 'cash_received_minor')),
                'ATM money must be integer minor units')
    require(quote_row['state'] == 'CONSUMED' and quote_row['quote'] == value and quote_row['options'] == quote['options'] and
            quote_row['account_id'] == scope['owner'] and quote_row['device_id'] == scope['device'] and
            value['quote_id'] == quote_row['quote_id'] == quote['quote_id'] == issue_request['quote_id'] and
            quote_request == {'v': 1, 'op': 'wallet.atm.quote', 'key': rows[5]['key'],
                              'issue_key': rows[6]['key'], 'amount_minor': amount, 'atm_id': atm} and
            set(issue_request) == {'v', 'op', 'key', 'quote_id', 'credential'} and
            value['issue_key'] == quote_row['issue_key'] == rows[6]['key'] and
            value['amount_minor'] == value['total_debit_minor'] == value['cash_received_minor'] == amount and
            value['fee_minor'] == 0 and value['policy'] == 'simulator-zero-fee-v1' and value['atm_id'] == atm and
            value['currency'] == 'USD' and value['authority_id'] == scope['authority'] and
            value['account_id'] == scope['owner'] and value['device_ref'] == quote['options']['device_ref'] == scope['device'] and
            value['credential_id'] == scope['record']['credential_id'] and
            quote_row['amount_minor'] == amount and quote_row['challenge'] == quote['options']['publicKey']['challenge'] and
            quote_row['expires_at'] == value['expires_at'] == quote['expires_at'] and
            value['issued_at'] <= approval['created_at'] < value['expires_at'] and quote['simulation_only'] is True and
            quote['options']['publicKey']['allowCredentials'] == [{'type': 'public-key', 'id': scope['record']['credential_id']}],
            'signed ATM quote or zero fee differs')
    updated = crypto.verify_assertion(issue_request['credential'], challenge=quote['options']['publicKey']['challenge'],
        rp_id=crypto.RP_ID, origin=crypto.ORIGIN, record=scope['record'], user_handle=scope['user_handle'])
    require(updated == data['wallet_auth_credential_state'][0]['record'] and
            approval['assertion_sha256'] == hashlib.sha256(crypto.json_bytes(issue_request['credential'])).hexdigest() and
            approval['credential_id'] == quote_row['credential_id'] == scope['record']['credential_id'] and
            approval['quote_id'] == issued['quote_id'] == quote_row['quote_id'] and
            approval['approval_id'] == issued['approval_id'] and approval['withdrawal_id'] == issued['withdrawal_id'] and
            issued['authentication'] == 'verified_software_test_assertion' and issued['fee_minor'] == 0 and
            issued['total_debit_minor'] == issued['cash_received_minor'] == amount,
            'verified ATM assertion, approval, issuance or zero fee differs')
    return {'credential_id': scope['record']['credential_id'], 'quote': value, 'approval_id': approval['approval_id'],
            'registration_and_assertion_reverified': True, 'rock_atm_fee_minor': 0}


def progress(wallet, data, rows, report, emit):
    """Separate observed activation boundaries; the caller still owns financial stages."""
    if data['wallet_auth_challenges'] and not report.get('wallet_challenge_observed'):
        report['wallet_challenge_observed'] = True
        emit('AUTH_CHALLENGE')
    if wallet['auth']['credential_id'] and not report.get('wallet_enrollment_observed'):
        require(wallet['auth']['active'] is False and data['wallet_auth_terms'] == [],
                'enrollment must be observed before separate Wallet terms')
        report['wallet_enrollment_observed'] = True
        emit('AUTH_ENROLLED')
    if wallet['auth']['active'] and not report.get('wallet_activation_without_funds'):
        activation(wallet, data, rows)
        require(report.get('wallet_challenge_observed') is True and report.get('wallet_enrollment_observed') is True and
                wallet['available_minor'] == wallet['pending_minor'] == wallet['held_minor'] == wallet['billed_minor'] == 0 and
                wallet['membership']['entitlement']['auto_renew'] is False,
                'Wallet activation must precede funding and monthly consent')
        report['wallet_activation_without_funds'] = True
        emit('AUTH_ACTIVE')

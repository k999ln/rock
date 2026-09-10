"""Remote Wallet client boundaries using a controlled transport and real cache DB.

The fake authority contains synthetic balances only. These tests do not establish
TLS, real backend billing, guest execution, real funds, or financial settlement.
"""
from contextlib import closing
import copy
import hashlib
import json
from pathlib import Path
import sqlite3
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'os'))

from blackberryrock.packages import canonical
from wallet_backend.client import BackendUnavailable, NotSent, RemoteWalletService
from wallet_backend import client

AUTHORITY_ID = '11111111-1111-4111-8111-111111111111'
ACCOUNT_ID = 'acct-' + '1' * 32
DEVICE_REF = 'fixture-client-device'
WITHDRAWAL_ID = '22222222-2222-4222-8222-222222222222'
TERMS_VERSION = 'simulator-monthly-usd-8.88-v1'


def synthetic_snapshot():
    return {
        'simulation_only': True,
        'available_minor': 1112,
        'held_minor': 500,
        'billed_minor': 888,
        'ledger_balance_minor': 0,
        'currency': 'USD',
        'unsettled_minor': 0,
        'dispensed_minor': 0,
        'sales': [], 'withdrawals': [], 'bills': [], 'journals': [],
        'record_counts': {'sales': 0, 'withdrawals': 0, 'bills': 0, 'journals': 0},
        'history_truncated': {'sales': False, 'withdrawals': False, 'bills': False, 'journals': False},
        'membership': {
            'simulation_only': True,
            'registered': True,
            'backend_connected': True,
            'terms_version': TERMS_VERSION,
            'monthly_fee_minor': 888, 'currency': 'USD',
            'registration_input_fields': [],
            'entitlement': {'auto_renew': True, 'account_id': ACCOUNT_ID,
                            'device_ref': DEVICE_REF, 'device_eligible': True,
                            'identity_inherited': True},
        },
        'billing': {
            'simulation_only': True,
            'backend_connected': True,
            'monthly_fee_minor': 888, 'currency': 'USD',
            'history': [{'period': '2026-09', 'status': 'paid', 'amount_minor': 888}],
        },
    }


class FakeAuthorityTransport:
    """A deterministic exchange(request) fake with durable-in-test authority receipts."""

    def __init__(self, fingerprint='synthetic-authority-a'):
        self.fingerprint = fingerprint
        self.calls = []
        self.snapshot = synthetic_snapshot()
        self.receipts = {}
        self.effects = []
        self.offline = None
        self.lose_ack_once = set()
        self.unavailable_once = set()
        self.malformed_reply_once = {}

    @staticmethod
    def success_reply(request):
        op, key = request['op'], request.get('key', '')
        if op == 'wallet.register':
            result = {'simulation_only': True, 'account_id': ACCOUNT_ID, 'device_ref': DEVICE_REF,
                      'verification_ref': 'fixture-client-verification', 'identity_inherited': True,
                      'additional_personal_fields_required': []}
        elif op == 'wallet.consent':
            result = {'simulation_only': True, 'consent_id': 'consent-' + hashlib.sha256(key.encode()).hexdigest()[:32],
                      'account_id': ACCOUNT_ID, 'accepted': request['accepted'],
                      'terms_version': request['terms_version'], 'amount_minor': 888,
                      'currency': 'USD', 'inflight_authorizations': []}
        elif op == 'wallet.bill':
            result = {'simulation_only': True, 'accepted': True, 'operation': key,
                      'period': request['period'], 'schedule_id': 'schedule-synthetic-client',
                      'meaning': 'scheduled; inspect wallet.billing.status for actual result'}
        elif op == 'wallet.atm.issue':
            result = {'simulation_only': True, 'real_atm_connection': 'NOT_CONNECTED',
                      'receipt_kind': 'immutable_issuance', 'state_at_issue': 'ISSUED',
                      'withdrawal_id': WITHDRAWAL_ID, 'currency': 'USD',
                      'amount_minor': request['amount_minor'], 'atm_id': request['atm_id'],
                      'issued_at': 1788856800, 'expires_at': 1788857100,
                      'code': 'synthetic-test-code-no-real-atm', 'code_sha256': 'a' * 64}
        else:
            result = {'simulation_only': True, 'real_atm_connection': 'NOT_CONNECTED',
                      'withdrawal_id': request['withdrawal_id'], 'currency': 'USD',
                      'atm_id': 'SIM-ATM-001', 'state': 'CANCELED',
                      'withdrawal': {'id': request['withdrawal_id'], 'amount_minor': 100,
                                     'dispensed_minor': 0, 'released_minor': 100,
                                     'status': 'CANCELED'}}
        return {'ok': True, 'result': result}

    def exchange(self, request):
        request = copy.deepcopy(request)
        self.calls.append(request)
        if self.offline is not None:
            raise self.offline('controlled transport outage; no actual network')
        if request['op'] == 'snapshot':
            return {'ok': True, 'snapshot': copy.deepcopy(self.snapshot)}
        if request['op'] == 'wallet.atm.history':
            return {'ok': True, 'result': {'simulation_only': True, 'total': 0,
                                         'truncated': False, 'items': []}}
        if request['op'] == 'wallet.atm.status':
            return self.success_reply(request)
        key = request['key']
        encoded = canonical(request)
        if key in self.unavailable_once:
            self.unavailable_once.remove(key)
            return {'ok': False, 'code': 'unavailable', 'error': 'controlled unknown outcome'}
        if key in self.receipts:
            payload, response = self.receipts[key]
            if payload != encoded:
                raise AssertionError('client sent a conflicting request to the authority')
        else:
            self.effects.append(request)
            if request['op'] == 'wallet.register':
                self.snapshot['membership']['registered'] = True
            if request['op'] == 'wallet.consent':
                self.snapshot['membership']['entitlement']['auto_renew'] = request['accepted']
            response = self.success_reply(request)
            self.receipts[key] = (encoded, response)
        if key in self.lose_ack_once:
            self.lose_ack_once.remove(key)
            raise BackendUnavailable('controlled acknowledgement loss after authority commit')
        if key in self.malformed_reply_once:
            return copy.deepcopy(self.malformed_reply_once.pop(key))
        return copy.deepcopy(response)


class WalletBackendClientTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.state = self.root / 'client-cache'
        self.now = 1788856800.0
        self.transport = FakeAuthorityTransport()
        self.service = self.open_service()

    def tearDown(self):
        self.service.close()
        self.temporary.cleanup()

    def open_service(self, transport=None):
        return RemoteWalletService(self.state, transport or self.transport, clock=lambda: self.now)

    def restart(self):
        self.service.close()
        self.service = self.open_service()

    def dispatch(self, request):
        return self.service.dispatch(request, peer_uid=1002)

    def snapshot(self):
        return self.dispatch({'v': 1, 'op': 'snapshot'})['snapshot']

    def rows(self, state=None):
        with closing(sqlite3.connect((state or self.state) / 'remote-cache.db')) as db:
            db.row_factory = sqlite3.Row
            return [dict(row) for row in db.execute('SELECT key,payload,response FROM requests ORDER BY key')]

    def assert_money_equal(self, first, second):
        for field in ('available_minor', 'held_minor', 'billed_minor', 'ledger_balance_minor'):
            self.assertEqual(first[field], second[field], field)

    def consent(self, key, accepted):
        return {'v': 1, 'op': 'wallet.consent', 'key': key, 'accepted': accepted,
                'terms_version': TERMS_VERSION}

    def test_untrusted_uid_never_reaches_transport_or_queue(self):
        for uid in (None, True, 1000, 1001, 65534, '1002'):
            with self.subTest(uid=uid), self.assertRaises(PermissionError):
                self.service.dispatch({'v': 1, 'op': 'wallet.register', 'key': 'forged',
                                       'peer_uid': 1002}, peer_uid=uid)
        self.assertEqual([], self.transport.calls)
        self.assertEqual([], self.rows())

    def test_unknown_fields_rejected_before_any_read_or_mutation_exchange(self):
        valid_requests = [
            {'v': 1, 'op': 'snapshot'},
            {'v': 1, 'op': 'health'},
            {'v': 1, 'op': 'wallet.membership'},
            {'v': 1, 'op': 'wallet.billing.status'},
            {'v': 1, 'op': 'wallet.atm.status', 'withdrawal_id': 'synthetic-withdrawal'},
            {'v': 1, 'op': 'wallet.atm.history', 'limit': 10},
            {'v': 1, 'op': 'wallet.register', 'key': 'register'},
            self.consent('consent', True),
            {'v': 1, 'op': 'wallet.bill', 'key': 'bill', 'period': '2026-09'},
            {'v': 1, 'op': 'wallet.atm.issue', 'key': 'issue', 'amount_minor': 100,
             'atm_id': 'SIM-ATM-001'},
            {'v': 1, 'op': 'wallet.atm.cancel', 'key': 'cancel', 'withdrawal_id': 'synthetic-withdrawal'},
            {'v': 1, 'op': 'wallet.atm.expire', 'key': 'expire', 'withdrawal_id': 'synthetic-withdrawal'},
            {'v': 1, 'op': 'wallet.atm.timeout', 'key': 'timeout', 'withdrawal_id': 'synthetic-withdrawal'},
        ]
        for request in valid_requests:
            with self.subTest(op=request['op']), self.assertRaises((ValueError, PermissionError)):
                self.dispatch({**request, 'owner': 'injected-owner'})
        self.assertEqual([], self.transport.calls)
        self.assertEqual([], self.rows())

    def test_invalid_version_and_privileged_operations_are_local_rejections(self):
        for version in (True, 0, 2, '1'):
            with self.subTest(version=version), self.assertRaises(ValueError):
                self.dispatch({'v': version, 'op': 'wallet.register', 'key': 'wrong-version'})
        for op in ('wallet.sale', 'wallet.settle', 'atm.dispense', 'wallet.atm.reconcile',
                   'wallet.reserve', 'arbitrary.shell'):
            with self.subTest(op=op), self.assertRaises(PermissionError):
                self.dispatch({'v': 1, 'op': op, 'key': 'not-an-owner-operation'})
        self.assertEqual([], self.transport.calls)
        self.assertEqual([], self.rows())

    def test_no_local_wallet_or_entitlement_ledger_is_created(self):
        self.service.close()
        with patch('blackberryrock.wallet.Wallet.__init__', side_effect=AssertionError('local Wallet forbidden')), \
                patch('entitlement.device.DeviceWalletAdapter.__init__',
                      side_effect=AssertionError('local entitlement authority forbidden')):
            self.service = self.open_service()
            before = self.snapshot()
            self.dispatch({'v': 1, 'op': 'wallet.register', 'key': 'remote-only'})
            after = self.snapshot()
        self.assert_money_equal(before, after)
        self.assertEqual(['remote-cache.db'], sorted(path.name for path in self.root.rglob('*.db')))
        with closing(sqlite3.connect(self.state / 'remote-cache.db')) as db:
            tables = {row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        self.assertFalse(tables.intersection({'journal', 'postings', 'sales', 'bills',
                                              'withdrawals', 'accounts', 'device_monthly_due'}))
        self.assertFalse(hasattr(self.service, 'wallet'))

    def test_first_offline_snapshot_has_no_fabricated_balance(self):
        self.transport.offline = NotSent
        with self.assertRaises(BackendUnavailable):
            self.snapshot()
        self.assertEqual([], self.rows())
        with closing(sqlite3.connect(self.state / 'remote-cache.db')) as db:
            self.assertEqual(0, db.execute('SELECT COUNT(*) FROM snapshot').fetchone()[0])

    def test_offline_cache_keeps_sync_time_and_money_across_restart(self):
        fresh = self.snapshot()
        self.assertTrue(fresh['backend']['connected'])
        self.assertFalse(fresh['backend']['stale'])
        self.assertEqual(self.now, fresh['backend']['last_sync_unix'])
        self.now += 86400
        self.transport.offline = NotSent
        self.transport.snapshot['available_minor'] = 1
        self.restart()
        stale = self.snapshot()
        self.assertFalse(stale['backend']['connected'])
        self.assertTrue(stale['backend']['stale'])
        self.assertFalse(stale['backend']['cache_is_spendable'])
        self.assertFalse(stale['backend']['pending_reconciliation'])
        self.assertEqual(fresh['backend']['last_sync_unix'], stale['backend']['last_sync_unix'])
        self.assert_money_equal(fresh, stale)
        self.assertEqual(fresh['billing']['history'], stale['billing']['history'])
        self.assertFalse(stale['membership']['backend_connected'])
        self.assertFalse(stale['billing']['backend_connected'])

    def test_fresh_not_sent_mutation_is_not_accepted_or_queued(self):
        request = self.consent('never-sent', False)
        self.transport.offline = NotSent
        with self.assertRaises(NotSent):
            self.dispatch(request)
        self.assertEqual([], self.rows())
        self.assertEqual([], self.transport.effects)
        self.restart()
        self.assertEqual([], self.rows())
        self.transport.offline = None
        result = self.dispatch(request)
        self.assertTrue(result['ok'])
        self.assertEqual([request], self.transport.effects)

    def test_lost_ack_restart_reconciles_exact_request_before_snapshot_once(self):
        self.snapshot()
        request = {'v': 1, 'op': 'wallet.register', 'key': 'committed-ack-lost'}
        self.transport.lose_ack_once.add(request['key'])
        with self.assertRaises(BackendUnavailable):
            self.dispatch(request)
        row = self.rows()[0]
        self.assertEqual(request, json.loads(row['payload']))
        self.assertIsNone(row['response'])
        before_calls = len(self.transport.calls)
        with self.assertRaises(BackendUnavailable):
            self.dispatch(self.consent('new-operation-blocked', True))
        self.assertEqual(before_calls, len(self.transport.calls))
        self.restart()
        self.transport.calls.clear()
        state = self.snapshot()
        self.assertEqual([request, {'v': 1, 'op': 'snapshot'}], self.transport.calls)
        self.assertEqual([request], self.transport.effects)
        self.assertFalse(state['backend']['pending_reconciliation'])
        self.assertTrue(state['membership']['registered'])
        self.assertIsNotNone(self.rows()[0]['response'])
        self.transport.calls.clear()
        self.assertEqual(json.loads(self.rows()[0]['response']), self.dispatch(request))
        self.assertEqual([], self.transport.calls)

    def test_pending_cancel_is_retained_and_never_changed_to_new_consent(self):
        fresh = self.snapshot()
        cancel = self.consent('cancel-ack-lost', False)
        self.transport.lose_ack_once.add(cancel['key'])
        with self.assertRaises(BackendUnavailable):
            self.dispatch(cancel)
        self.transport.offline = NotSent
        self.restart()
        self.transport.calls.clear()
        stale = self.snapshot()
        self.assertTrue(stale['backend']['pending_reconciliation'])
        self.assertEqual([cancel], self.transport.calls)
        self.assert_money_equal(fresh, stale)
        self.assertEqual(cancel, json.loads(self.rows()[0]['payload']))
        with self.assertRaises(BackendUnavailable):
            self.dispatch(self.consent('do-not-renew-as-new-request', True))
        self.assertEqual([cancel], self.transport.calls)
        self.assertIsNone(self.rows()[0]['response'])
        self.transport.offline = None
        self.transport.calls.clear()
        recovered = self.snapshot()
        self.assertEqual([cancel, {'v': 1, 'op': 'snapshot'}], self.transport.calls)
        self.assertEqual([cancel], self.transport.effects)
        self.assertFalse(recovered['membership']['entitlement']['auto_renew'])
        self.assertFalse(recovered['backend']['pending_reconciliation'])

    def test_structured_unavailable_stays_pending_instead_of_becoming_receipt(self):
        request = {'v': 1, 'op': 'wallet.bill', 'key': 'unknown-response', 'period': '2026-09'}
        self.transport.unavailable_once.add(request['key'])
        with self.assertRaises(BackendUnavailable):
            self.dispatch(request)
        self.assertIsNone(self.rows()[0]['response'])
        self.restart()
        self.transport.calls.clear()
        self.snapshot()
        self.assertEqual([request, {'v': 1, 'op': 'snapshot'}], self.transport.calls)
        self.assertEqual([request], self.transport.effects)

    def test_same_key_different_body_is_rejected_pending_and_after_completion(self):
        original = self.consent('immutable-request', False)
        changed = self.consent('immutable-request', True)
        self.transport.lose_ack_once.add(original['key'])
        with self.assertRaises(BackendUnavailable):
            self.dispatch(original)
        calls = len(self.transport.calls)
        with self.assertRaises(ValueError):
            self.dispatch(changed)
        self.assertEqual(calls, len(self.transport.calls))
        self.restart()
        self.snapshot()
        calls = len(self.transport.calls)
        with self.assertRaises(ValueError):
            self.dispatch(changed)
        self.assertEqual(calls, len(self.transport.calls))
        self.assertEqual(original, json.loads(self.rows()[0]['payload']))
        self.assertEqual([original], self.transport.effects)

    def test_cached_response_cannot_be_redirected_to_another_authority(self):
        self.snapshot()
        self.service.close()
        different = FakeAuthorityTransport('synthetic-authority-b')
        with self.assertRaises(ValueError):
            RemoteWalletService(self.state, different, clock=lambda: self.now)
        self.assertEqual([], different.calls)
        self.service = self.open_service()
        self.assertEqual(1112, self.snapshot()['available_minor'])

    def test_configured_service_refuses_existing_local_ledger_before_transport(self):
        config = self.root / 'remote-config.json'
        config.write_text(json.dumps({'schema_version': 1, 'mode': 'development-remote-authority',
                                     'authority_id': AUTHORITY_ID,
                                     'origin': 'https://127.0.0.1:9445',
                                     'ca_file': '/unused/synthetic-ca',
                                     'token_file': '/unused/synthetic-token'}))
        for name in ('wallet-simulator.db', 'entitlement.db'):
            state = self.root / ('existing-' + name)
            state.mkdir()
            ledger = state / name
            ledger.write_bytes(b'synthetic existing ledger sentinel')
            with self.subTest(name=name), patch.object(client, 'HTTPSWalletTransport') as transport:
                with self.assertRaises(ValueError):
                    client.configured_service(config, state)
                transport.assert_not_called()
            self.assertEqual(b'synthetic existing ledger sentinel', ledger.read_bytes())
            self.assertFalse((state / 'backend-cache').exists())

    def test_receipt_capacity_rejects_new_work_but_keeps_exact_replay_available(self):
        request = {'v': 1, 'op': 'wallet.register', 'key': 'retained-at-capacity'}
        receipt = self.dispatch(request)
        with closing(sqlite3.connect(self.state / 'remote-cache.db')) as db, db:
            db.executemany('INSERT INTO requests VALUES(?,?,?)',
                           [(f'synthetic-archived-{n}', '{}', '{"ok":true}') for n in range(9999)])
        self.transport.calls.clear()
        with self.assertRaises(ValueError):
            self.dispatch(self.consent('capacity-must-not-send', False))
        self.assertEqual([], self.transport.calls)
        self.assertEqual(10000, len(self.rows()))
        self.assertEqual(receipt, self.dispatch(request))
        self.assertEqual([], self.transport.calls)

    def test_live_atm_state_is_not_answered_from_offline_snapshot_cache(self):
        self.snapshot()
        self.transport.offline = NotSent
        for request in ({'v': 1, 'op': 'wallet.atm.status', 'withdrawal_id': 'synthetic-withdrawal'},
                        {'v': 1, 'op': 'wallet.atm.history', 'limit': 10}):
            with self.subTest(op=request['op']), self.assertRaises(BackendUnavailable):
                self.dispatch(request)
        self.assertEqual([], self.rows())

    def test_malformed_or_mismatched_ack_stays_pending_until_exact_reconciliation(self):
        register = {'v': 1, 'op': 'wallet.register', 'key': 'bad-register-ack'}
        consent = self.consent('bad-cancel-ack', False)
        bill = {'v': 1, 'op': 'wallet.bill', 'key': 'bad-bill-ack', 'period': '2026-09'}
        issue = {'v': 1, 'op': 'wallet.atm.issue', 'key': 'bad-atm-ack',
                 'amount_minor': 100, 'atm_id': 'SIM-ATM-001'}
        cancel = {'v': 1, 'op': 'wallet.atm.cancel', 'key': 'bad-atm-cancel-ack',
                  'withdrawal_id': WITHDRAWAL_ID}
        malformed = [(register, reply) for reply in (
            None, [], {'ok': True}, {'ok': True, 'result': []},
            {'ok': False}, {'ok': False, 'code': 'unexpected'},
            {'ok': False, 'code': 'unavailable'},
        )]
        for request, change in (
            (register, {'simulation_only': False}),
            (register, {'identity_inherited': False}),
            (register, {'account_id': ''}),
            (consent, {'accepted': True}),
            (consent, {'accepted': 0}),
            (consent, {'terms_version': 'unreviewed-terms'}),
            (consent, {'amount_minor': 889}),
            (consent, {'currency': 'EUR'}),
            (bill, {'period': '2026-10'}),
            (bill, {'operation': 'another-request-key'}),
            (issue, {'withdrawal_id': 'not-a-canonical-uuid'}),
            (issue, {'amount_minor': 101}),
            (issue, {'atm_id': 'SIM-ATM-OTHER'}),
            (cancel, {'withdrawal_id': '33333333-3333-4333-8333-333333333333'}),
        ):
            response = FakeAuthorityTransport.success_reply(request)
            response['result'].update(change)
            malformed.append((request, response))
        for number, (request, bad_reply) in enumerate(malformed):
            with self.subTest(number=number, op=request['op'], reply=bad_reply):
                state = self.root / f'malformed-ack-{number}'
                transport = FakeAuthorityTransport()
                transport.malformed_reply_once[request['key']] = bad_reply
                service = RemoteWalletService(state, transport, clock=lambda: self.now)
                try:
                    with self.assertRaises(BackendUnavailable):
                        service.dispatch(request, peer_uid=1002)
                    row = self.rows(state)[0]
                    self.assertEqual(request, json.loads(row['payload']))
                    self.assertIsNone(row['response'])
                    calls = len(transport.calls)
                    with self.assertRaises(BackendUnavailable):
                        service.dispatch(self.consent('no-replacement-request', True), peer_uid=1002)
                    self.assertEqual(calls, len(transport.calls))
                finally:
                    service.close()
                service = RemoteWalletService(state, transport, clock=lambda: self.now)
                try:
                    transport.calls.clear()
                    service.dispatch({'v': 1, 'op': 'snapshot'}, peer_uid=1002)
                    self.assertEqual([request, {'v': 1, 'op': 'snapshot'}], transport.calls)
                    self.assertEqual([request], transport.effects)
                    self.assertIsNotNone(self.rows(state)[0]['response'])
                finally:
                    service.close()

    def test_malformed_snapshot_never_replaces_last_valid_cache_or_sync_time(self):
        fresh = self.snapshot()
        with closing(sqlite3.connect(self.state / 'remote-cache.db')) as db:
            original = db.execute('SELECT payload,received_at FROM snapshot').fetchone()
        malformed = [None, [], {'ok': True}, {'ok': True, 'snapshot': {}},
                     {'ok': 1, 'snapshot': synthetic_snapshot()},
                     {'ok': True, 'snapshot': {'simulation_only': True}},
                     {'ok': True, 'snapshot': {**synthetic_snapshot(), 'membership': None}},
                     {'ok': True, 'snapshot': {**synthetic_snapshot(), 'billing': []}},
                     {'ok': True, 'snapshot': {**synthetic_snapshot(), 'available_minor': '1112'}},
                     {'ok': True, 'snapshot': {**synthetic_snapshot(), 'available_minor': True}},
                     {'ok': True, 'snapshot': {**synthetic_snapshot(), 'held_minor': -1}},
                     {'ok': True, 'snapshot': {**synthetic_snapshot(), 'ledger_balance_minor': 1}},
                     {'ok': True, 'snapshot': {**synthetic_snapshot(), 'simulation_only': False}}]
        synchronized_at = self.now
        for number, response in enumerate(malformed):
            # Independently establish each case's good cache so one defect does
            # not create misleading failures in the following subcases.
            self.now = synchronized_at
            self.snapshot()
            self.now += 86400
            with self.subTest(number=number), patch.object(self.transport, 'exchange', return_value=response):
                stale = self.snapshot()
                self.assertTrue(stale['backend']['stale'])
                self.assertFalse(stale['backend']['connected'])
                self.assertEqual(fresh['backend']['last_sync_unix'], stale['backend']['last_sync_unix'])
                self.assert_money_equal(fresh, stale)
                with closing(sqlite3.connect(self.state / 'remote-cache.db')) as db:
                    self.assertEqual(original, db.execute('SELECT payload,received_at FROM snapshot').fetchone())

    def test_existing_world_readable_cache_is_refused_without_repair_or_exchange(self):
        for target_name, bad_mode in (('directory', 0o755), ('remote-cache.db', 0o644),
                                      ('remote-instance.lock', 0o644)):
            with self.subTest(target=target_name):
                state = self.root / ('insecure-' + target_name)
                transport = FakeAuthorityTransport()
                service = RemoteWalletService(state, transport, clock=lambda: self.now)
                service.dispatch({'v': 1, 'op': 'snapshot'}, peer_uid=1002)
                service.close()
                target = state if target_name == 'directory' else state / target_name
                target.chmod(bad_mode)
                transport.calls.clear()
                opened = None
                try:
                    with self.assertRaises((ValueError, PermissionError)):
                        opened = RemoteWalletService(state, transport, clock=lambda: self.now)
                    self.assertEqual(bad_mode, target.stat().st_mode & 0o777)
                    self.assertEqual([], transport.calls)
                finally:
                    if opened is not None:
                        opened.close()
                    target.chmod(0o700 if target_name == 'directory' else 0o600)

    def test_closed_instance_cannot_dispatch_after_new_instance_takes_lock(self):
        self.snapshot()
        closed = self.service
        closed.close()
        self.service = self.open_service()
        self.transport.calls.clear()
        for request in ({'v': 1, 'op': 'snapshot'}, {'v': 1, 'op': 'health'},
                        self.consent('closed-instance-cannot-write', False)):
            with self.subTest(op=request['op']), self.assertRaises(BackendUnavailable):
                closed.dispatch(request, peer_uid=1002)
        self.assertEqual([], self.transport.calls)
        self.assertEqual([], self.rows())
        self.assertTrue(self.snapshot()['backend']['connected'])
        result = self.dispatch(self.consent('new-instance-can-write', False))
        self.assertTrue(result['ok'])
        self.assertEqual('new-instance-can-write', self.rows()[0]['key'])


if __name__ == '__main__':
    unittest.main()

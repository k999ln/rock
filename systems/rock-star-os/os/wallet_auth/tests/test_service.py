"""Real Ed25519 software fixture + real SQLite/Wallet atomicity boundaries.

Synthetic purchaser context is injected by the test; no OS, real identity,
hardware user verification, external payment or ATM-network claim is made.
"""
from concurrent.futures import ThreadPoolExecutor
from contextlib import closing, contextmanager
import copy
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

from atm import ATMActor, AuthenticationError, CardlessATMSimulator, PUBLIC_ATM_FIXTURES, TrustedWalletContext
from blackberryrock.storage import IdempotencyConflict
from blackberryrock.wallet import InsufficientFunds, Wallet
from wallet_auth import protocol
from wallet_auth.fixture import SoftwareTestAuthenticator, PUBLIC_TEST_PIN
from wallet_auth.service import WalletAuthorization, TERMS_VERSION, FEE_POLICY

A, B = 'fixture-rock-arm64-001', 'fixture-rock-arm64-002'
AUTHORITY = '70528cf8-f5b3-401c-987b-71ef8ac6a4bc'


class WalletAuthorizationTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.now = 1788890000.0
        self.wallet = Wallet(self.root / 'wallet.db')
        self.eligible = {('acct-test-owner', A), ('acct-test-owner', B)}
        self.atm = CardlessATMSimulator(self.wallet, clock=lambda: self.now,
            device_authorizer=lambda account, device: (account, device) in self.eligible)
        self.auth = WalletAuthorization(self.wallet, self.atm, authority_id=AUTHORITY, clock=lambda: self.now)
        self.context = TrustedWalletContext('acct-test-owner', A, True)
        self.b = TrustedWalletContext('acct-test-owner', B, True)
        self.fixture = SoftwareTestAuthenticator(self.root / 'authenticator-a', A)
        self.addCleanup(self.fixture.close)
        self.actor = ATMActor(*PUBLIC_ATM_FIXTURES['SIM-ATM-001'])
        self.atm.redemption_authorizer = lambda account, device, withdrawal: (
            (account, device) in self.eligible and self.auth.credential_for_redemption(account, device, withdrawal))
        sale = self.wallet.simulate_sale(5000, 'setup-sale')
        self.wallet.settle_sale(sale['id'], 'setup-settle')

    def request(self, op, key=None, *, context=None, handoff='fixture-handoff', **fields):
        request = {'v': 1, 'op': op, **fields}
        if key is not None:
            request['key'] = key
        return self.auth.dispatch(request, context=context or self.context, handoff_ref=handoff)

    def enroll(self, *, context=None, fixture=None, prefix='a'):
        begin = self.request('wallet.auth.begin', prefix + '-begin', context=context)['result']
        credential = (fixture or self.fixture).make_credential(begin['options'], PUBLIC_TEST_PIN, prefix + '-create')
        request = {'challenge_id': begin['challenge_id'], 'credential': credential}
        result = self.request('wallet.auth.enroll', prefix + '-enroll', context=context, **request)['result']
        return result

    def activate(self):
        self.enroll()
        return self.request('wallet.terms', 'wallet-terms', accepted=True, terms_version=TERMS_VERSION)['result']

    def quote(self, prefix='first', amount=1000, context=None):
        return self.request('wallet.atm.quote', prefix + '-quote', issue_key=prefix + '-issue',
                            amount_minor=amount, atm_id='SIM-ATM-001', context=context)['result']

    def assertion(self, quote, *, fixture=None, prefix='first'):
        return (fixture or self.fixture).get_assertion(quote['options'], PUBLIC_TEST_PIN, prefix + '-assert')

    def issue(self, quote, credential, *, context=None):
        return self.request('wallet.atm.issue', quote['quote']['issue_key'], quote_id=quote['quote_id'],
                            credential=credential, context=context)

    def rows(self, table):
        with closing(self.wallet._connect()) as db:
            return [tuple(row) for row in db.execute('SELECT * FROM ' + table + ' ORDER BY rowid')]

    def counter(self, device=A):
        with closing(self.wallet._connect()) as db:
            row = db.execute('''SELECT s.record_json FROM wallet_auth_credential_state s
                JOIN wallet_auth_credentials c USING(credential_id) WHERE c.device_id=?''', (device,)).fetchone()
            return json.loads(row[0])['sign_count']

    def money(self, available=5000, held=0, dispensed=0):
        state = self.wallet.snapshot()
        self.assertEqual((state['available_minor'], state['held_minor'], state['dispensed_minor']),
                         (available, held, dispensed))

    def test_enrollment_real_signature_terms_are_separate_from_monthly_consent(self):
        self.assertEqual(self.auth.status(self.context)['activation_state'], 'CREDENTIAL_REQUIRED')
        enrolled = self.enroll()
        self.assertEqual(enrolled['activation_state'], 'TERMS_REQUIRED')
        self.assertFalse(enrolled['hardware_backed'])
        with self.assertRaises(protocol.AuthError):
            self.quote()
        result = self.request('wallet.terms', 'terms', accepted=True, terms_version=TERMS_VERSION)['result']
        self.assertTrue(result['active'])
        self.assertEqual(self.rows('wallet_consents'), [])
        self.assertEqual(self.rows('wallet_bills'), [])
        self.money()

    def test_authority_is_persisted_and_mismatch_rejected_without_ledger_mutation(self):
        before = self.rows('wallet_auth_mode')
        reopened = WalletAuthorization(self.wallet, self.atm, clock=lambda: self.now)
        self.assertEqual(reopened.authority_id, AUTHORITY)
        self.assertEqual(self.rows('wallet_auth_mode'), before)
        with self.assertRaises(protocol.AuthError):
            WalletAuthorization(self.wallet, self.atm, authority_id='32ce384d-22b1-4fbf-a2ba-632cf06a0fe2', clock=lambda: self.now)
        self.assertEqual(self.rows('wallet_auth_mode'), before)
        self.money()

    def test_status_contract_queries_and_restart_do_not_mutate_business_state(self):
        self.activate()
        tables = ['wallet_auth_mode', 'wallet_auth_credentials', 'wallet_auth_credential_state',
                  'wallet_auth_challenges', 'wallet_auth_terms', 'wallet_auth_quotes', 'wallet_auth_approvals', 'wallet_idempotency']
        before = {table: self.rows(table) for table in tables}
        self.now += 1
        self.auth.status(self.context)
        self.assertTrue(self.auth.contract_ready(self.context.owner_id, [A]))
        self.assertFalse(self.auth.credential_for_redemption(self.context.owner_id, A, 'nonexistent'))
        WalletAuthorization(self.wallet, self.atm, clock=lambda: self.now)
        self.assertEqual({table: self.rows(table) for table in tables}, before)

    def test_purchaser_device_is_rechecked_before_every_cached_response(self):
        self.activate()
        q = self.quote()
        signed = self.assertion(q)
        self.issue(q, signed)
        self.eligible.remove((self.context.owner_id, A))
        for op, key, fields in (
                ('wallet.auth.begin', 'a-begin', {}),
                ('wallet.atm.issue', 'first-issue', {'quote_id': q['quote_id'], 'credential': signed})):
            with self.assertRaises(AuthenticationError):
                self.request(op, key, **fields)
        with self.assertRaises(AuthenticationError):
            self.auth.status(self.context)
        self.money(4000, 1000)

    def test_enrollment_is_bound_to_handoff_account_device_and_not_ui_boolean(self):
        begin = self.request('wallet.auth.begin', 'begin')['result']
        credential = self.fixture.make_credential(begin['options'], PUBLIC_TEST_PIN, 'create')
        fields = {'challenge_id': begin['challenge_id'], 'credential': credential}
        with self.assertRaises(protocol.AuthError):
            self.request('wallet.auth.enroll', 'different-handoff', handoff='fixture-other', **fields)
        with self.assertRaises(protocol.AuthError):
            self.request('wallet.auth.enroll', 'different-device', context=self.b, **fields)
        with self.assertRaises(protocol.AuthError):
            self.request('wallet.auth.enroll', 'boolean', challenge_id=begin['challenge_id'], credential=True)
        self.assertEqual(self.rows('wallet_auth_credentials'), [])
        self.request('wallet.auth.enroll', 'correct', **fields)
        self.assertEqual(len(self.rows('wallet_auth_credentials')), 1)

    def test_bad_registration_signature_does_not_consume_activation(self):
        begin = self.request('wallet.auth.begin', 'begin')['result']
        credential = self.fixture.make_credential(begin['options'], PUBLIC_TEST_PIN, 'create')
        changed = copy.deepcopy(credential)
        raw = bytearray(protocol.b64decode(changed['response']['attestationObject']))
        raw[-1] ^= 1
        changed['response']['attestationObject'] = protocol.b64encode(bytes(raw))
        with self.assertRaises(protocol.AuthError):
            self.request('wallet.auth.enroll', 'enroll', challenge_id=begin['challenge_id'], credential=changed)
        self.assertEqual(self.rows('wallet_auth_credentials'), [])
        self.assertEqual(self.rows('wallet_auth_challenges')[0][-1], 'PENDING')
        self.request('wallet.auth.enroll', 'enroll', challenge_id=begin['challenge_id'], credential=credential)

    def test_enrollment_expiry_and_used_challenge_fail_without_second_credential(self):
        begin = self.request('wallet.auth.begin', 'begin')['result']
        credential = self.fixture.make_credential(begin['options'], PUBLIC_TEST_PIN, 'create')
        self.now = begin['expires_at']
        with self.assertRaises(protocol.AuthError):
            self.request('wallet.auth.enroll', 'late', challenge_id=begin['challenge_id'], credential=credential)
        self.assertEqual(self.rows('wallet_auth_credentials'), [])
        fresh = self.request('wallet.auth.begin', 'fresh-begin')['result']
        another = self.fixture.make_credential(fresh['options'], PUBLIC_TEST_PIN, 'fresh-create')
        response = self.request('wallet.auth.enroll', 'fresh-enroll', challenge_id=fresh['challenge_id'], credential=another)
        self.assertEqual(response, self.request('wallet.auth.enroll', 'fresh-enroll', challenge_id=fresh['challenge_id'], credential=another))
        with self.assertRaises(protocol.AuthError):
            self.request('wallet.auth.enroll', 'another-key', challenge_id=fresh['challenge_id'], credential=another)
        with self.assertRaises(protocol.AuthError):
            self.request('wallet.auth.begin', 'reenroll')
        self.assertEqual(len(self.rows('wallet_auth_credentials')), 1)

    def test_quote_is_zero_fee_immutable_and_does_not_reserve_or_increment(self):
        self.activate()
        q = self.quote()
        self.assertEqual(q['quote']['fee_minor'], 0)
        self.assertEqual(q['quote']['total_debit_minor'], q['quote']['cash_received_minor'])
        self.assertEqual(q['quote']['policy'], FEE_POLICY)
        self.assertEqual(q['quote']['authority_id'], AUTHORITY)
        self.assertEqual(q['quote']['device_ref'], A)
        self.assertEqual(q['quote']['account_id'], self.context.owner_id)
        self.assertEqual(len(protocol.b64decode(q['options']['publicKey']['challenge'])), 32)
        self.money()
        self.assertEqual(self.counter(), 0)
        with self.assertRaises(sqlite3.IntegrityError):
            with self.wallet._transaction() as db:
                db.execute("UPDATE wallet_auth_quotes SET quote_json='{}'")

    def test_unknown_fields_nonzero_fee_amount_bounds_and_wrong_terms_rejected(self):
        self.activate()
        for fields in ({'fee_minor': 1}, {'owner_id': 'other'}, {'approved': True}):
            with self.assertRaises(protocol.AuthError):
                self.request('wallet.atm.quote', 'q', issue_key='i', amount_minor=1000, atm_id='SIM-ATM-001', **fields)
        for amount in (True, 0, 999, 1001, 51000, -1000, '1000'):
            with self.assertRaises(ValueError):
                self.quote('invalid', amount)
        with self.assertRaises(protocol.AuthError):
            self.request('wallet.terms', 'wrong', accepted=True, terms_version='monthly-instead')
        with self.assertRaises(protocol.AuthError):
            self.request('wallet.terms', 'boolean', accepted=1, terms_version=TERMS_VERSION)
        self.money()

    def test_quote_device_issue_key_and_new_body_cannot_change_after_approval(self):
        self.activate()
        q = self.quote()
        signed = self.assertion(q)
        with self.assertRaises(protocol.AuthError):
            self.issue(q, signed, context=self.b)
        with self.assertRaises(protocol.AuthError):
            self.request('wallet.atm.issue', 'different-key', quote_id=q['quote_id'], credential=signed)
        with self.assertRaises(IdempotencyConflict):
            self.quote('first', 2000)
        with self.assertRaises(protocol.AuthError):
            self.request('wallet.atm.quote', 'other-quote', issue_key='first-issue', amount_minor=1000, atm_id='SIM-ATM-001')
        self.money()
        self.assertEqual(self.counter(), 0)

    def test_bad_assertion_signature_and_quote_substitution_do_not_consume(self):
        self.activate()
        q = self.quote()
        signed = self.assertion(q)
        bad = copy.deepcopy(signed)
        raw = bytearray(protocol.b64decode(bad['response']['signature'])); raw[0] ^= 1
        bad['response']['signature'] = protocol.b64encode(bytes(raw))
        with self.assertRaises(protocol.AuthError):
            self.issue(q, bad)
        other = self.quote('other')
        with self.assertRaises(protocol.AuthError):
            self.issue(other, signed)
        self.money()
        self.assertEqual(self.counter(), 0)
        self.assertEqual(self.rows('wallet_auth_approvals'), [])
        self.issue(q, signed)
        self.money(4000, 1000)

    def test_expired_quote_does_not_consume_and_highwater_refuses_rollback(self):
        self.activate()
        q = self.quote()
        signed = self.assertion(q)
        self.now = q['expires_at']
        with self.assertRaises(protocol.AuthError):
            self.issue(q, signed)
        self.money()
        self.assertEqual(self.counter(), 0)
        self.now -= 1
        with self.assertRaises(protocol.AuthError):
            self.issue(q, signed)
        with self.assertRaises(protocol.AuthError):
            WalletAuthorization(self.wallet, self.atm, clock=lambda: self.now)

    def test_expiry_during_real_verification_never_reserves(self):
        self.activate()
        q = self.quote()
        signed = self.assertion(q)
        verify = protocol.verify_assertion
        def delayed(*args, **kwargs):
            result = verify(*args, **kwargs)
            self.now = q['expires_at']
            return result
        with patch.object(protocol, 'verify_assertion', delayed), self.assertRaises(protocol.AuthError):
            self.issue(q, signed)
        self.money()
        self.assertEqual(self.counter(), 0)

    def test_cancel_quote_no_hold_and_consumed_quote_requires_withdrawal_resolution(self):
        self.activate()
        q = self.quote()
        signed = self.assertion(q)
        canceled = self.request('wallet.atm.quote.cancel', 'cancel', quote_id=q['quote_id'])
        self.assertEqual(canceled, self.request('wallet.atm.quote.cancel', 'cancel', quote_id=q['quote_id']))
        with self.assertRaises(protocol.AuthError):
            self.issue(q, signed)
        self.money()
        other = self.quote('second')
        result = self.issue(other, self.assertion(other, prefix='second'))['result']
        with self.assertRaises(protocol.AuthError):
            self.request('wallet.atm.quote.cancel', 'late-cancel', quote_id=other['quote_id'])
        self.atm.cancel(result['withdrawal_id'], 'withdrawal-cancel', context=self.context)
        self.money()

    def test_exact_issue_replay_after_restart_expiry_and_terms_cancel_is_one_hold(self):
        self.activate()
        q = self.quote()
        signed = self.assertion(q)
        receipt = self.issue(q, signed)
        self.request('wallet.terms', 'terms-cancel', accepted=False, terms_version=TERMS_VERSION)
        self.now += 200
        self.auth = WalletAuthorization(self.wallet, self.atm, clock=lambda: self.now)
        self.assertEqual(self.issue(q, signed), receipt)
        self.assertEqual(self.counter(), 1)
        self.assertEqual(len(self.rows('wallet_auth_approvals')), 1)
        self.assertEqual(len(self.rows('atm_credentials')), 1)
        self.money(4000, 1000)

    def test_nonadvancing_counter_on_new_quote_cannot_replay_authentication(self):
        self.activate()
        q = self.quote()
        self.issue(q, self.assertion(q))
        other = self.quote('second')
        signed = self.assertion(other, prefix='second')
        # Valid fixture-signed assertion with the same counter: this is a
        # signature-valid clone/race boundary, not merely a corrupted signature.
        from wallet_auth.fixture import _sign
        raw = bytearray(protocol.b64decode(signed['response']['authenticatorData']))
        raw[33:37] = (1).to_bytes(4, 'big')
        client = protocol.b64decode(signed['response']['clientDataJSON'])
        import hashlib
        signed['response']['authenticatorData'] = protocol.b64encode(bytes(raw))
        signed['response']['signature'] = protocol.b64encode(_sign(bytes(raw) + hashlib.sha256(client).digest()))
        with self.assertRaises(protocol.AuthError):
            self.issue(other, signed)
        self.assertEqual(self.counter(), 1)
        self.money(4000, 1000)

    def test_same_key_concurrency_creates_one_counter_approval_and_hold(self):
        self.activate()
        q = self.quote()
        signed = self.assertion(q)
        with ThreadPoolExecutor(4) as pool:
            results = list(pool.map(lambda _: self.issue(q, signed), range(4)))
        self.assertTrue(all(result == results[0] for result in results))
        self.assertEqual(self.counter(), 1)
        self.assertEqual(len(self.rows('wallet_auth_approvals')), 1)
        self.money(4000, 1000)

    def test_independent_service_instances_serialize_same_key_in_sqlite(self):
        self.activate()
        q = self.quote()
        signed = self.assertion(q)
        second_wallet = Wallet(self.wallet.path)
        second_atm = CardlessATMSimulator(second_wallet, clock=lambda: self.now)
        second = WalletAuthorization(second_wallet, second_atm, clock=lambda: self.now)
        request = {'v': 1, 'op': 'wallet.atm.issue', 'key': 'first-issue', 'quote_id': q['quote_id'], 'credential': signed}
        def run(service):
            return service.dispatch(request, context=self.context, handoff_ref='fixture-handoff')
        with ThreadPoolExecutor(2) as pool:
            results = list(pool.map(run, [self.auth, second]))
        self.assertEqual(results[0], results[1])
        self.assertEqual(len(self.rows('wallet_auth_approvals')), 1)
        self.assertEqual(self.counter(), 1)
        self.money(4000, 1000)

    def test_monthly_charge_and_atm_use_one_available_balance(self):
        self.activate()
        self.wallet.consent_monthly(True, 'existing-monthly-consent')
        prior_quote = self.quote('prior', 4000)
        prior = self.issue(prior_quote, self.assertion(prior_quote, prefix='prior'))['result']
        q = self.quote()
        signed = self.assertion(q)
        def run(action):
            try:
                return action()
            except InsufficientFunds:
                return None
        with ThreadPoolExecutor(2) as pool:
            results = list(pool.map(run, [lambda: self.issue(q, signed), lambda: self.wallet.bill('2026-09', 'month')]))
        self.assertEqual(sum(result is not None for result in results), 1)
        snap = self.wallet.snapshot()
        self.assertGreaterEqual(snap['available_minor'], 0)
        self.assertEqual(snap['available_minor'] + snap['held_minor'] + snap['billed_minor'], 5000)
        self.assertEqual(self.rows('wallet_withdrawals')[0][0], prior['withdrawal_id'])

    def test_posting_failure_rolls_back_quote_counter_approval_code_and_receipt(self):
        self.activate()
        q = self.quote()
        signed = self.assertion(q)
        post = self.wallet._post
        def fail(*args, **kwargs):
            post(*args, **kwargs)
            raise OSError('injected write failure')
        with patch.object(self.wallet, '_post', fail), self.assertRaises(OSError):
            self.issue(q, signed)
        self.money()
        self.assertEqual(self.counter(), 0)
        self.assertEqual(self.rows('wallet_auth_approvals'), [])
        self.assertEqual(self.rows('atm_credentials'), [])
        self.assertEqual(self.rows('wallet_auth_quotes')[0][-1], 'OPEN')
        self.issue(q, signed)
        self.money(4000, 1000)

    def test_receipt_failure_after_insertion_rolls_back_all_issuance(self):
        self.activate()
        q = self.quote()
        signed = self.assertion(q)
        remember = self.wallet._remember
        def fail(*args, **kwargs):
            remember(*args, **kwargs)
            raise OSError('injected receipt failure')
        with patch.object(self.wallet, '_remember', fail), self.assertRaises(OSError):
            self.issue(q, signed)
        self.money()
        self.assertEqual(self.counter(), 0)
        self.issue(q, signed)
        self.money(4000, 1000)

    def test_commit_then_lost_response_recovers_exact_receipt_without_verifying_twice(self):
        self.activate()
        q = self.quote()
        signed = self.assertion(q)
        original, count = self.wallet._transaction, 0
        @contextmanager
        def lost():
            nonlocal count
            count += 1
            current = count
            with original() as db:
                yield db
            if current == 2:
                raise OSError('business commit succeeded but response was lost')
        with patch.object(self.wallet, '_transaction', lost), self.assertRaises(OSError):
            self.issue(q, signed)
        self.money(4000, 1000)
        self.assertEqual(self.counter(), 1)
        self.auth = WalletAuthorization(self.wallet, self.atm, clock=lambda: self.now)
        with patch.object(protocol, 'verify_assertion', side_effect=AssertionError('successful replay must not reauthenticate consumed nonce')):
            result = self.issue(q, signed)
        self.assertTrue(result['ok'])
        self.assertEqual(len(self.rows('wallet_auth_approvals')), 1)

    def test_credential_revocation_blocks_cached_code_and_new_redemption_but_not_hold_recovery(self):
        active = self.activate()
        q = self.quote()
        signed = self.assertion(q)
        receipt = self.issue(q, signed)['result']
        revoked = self.auth.revoke_credential(active['credential_id'], 'server-revoke')
        self.assertEqual(revoked, self.auth.revoke_credential(active['credential_id'], 'server-revoke'))
        self.assertTrue(self.auth.status(self.context)['credential_revoked'])
        with self.assertRaises(protocol.AuthError):
            self.issue(q, signed)
        with self.assertRaises(AuthenticationError):
            self.atm.redeem(receipt['code'], 'SIM-ATM-001', 'redeem', actor=self.actor)
        self.money(4000, 1000)
        self.atm.cancel(receipt['withdrawal_id'], 'recover', context=self.context)
        self.money()

    def test_consumed_unknown_resolves_after_credential_revocation_and_restart(self):
        active = self.activate()
        q = self.quote()
        receipt = self.issue(q, self.assertion(q))['result']
        self.atm.redeem(receipt['code'], 'SIM-ATM-001', 'redeem', actor=self.actor)
        self.auth.revoke_credential(active['credential_id'], 'revoke')
        self.atm.timeout(receipt['withdrawal_id'], 'unknown', context=self.context)
        self.money(4000, 1000)
        self.auth = WalletAuthorization(self.wallet, self.atm, clock=lambda: self.now)
        result = self.atm.reconcile(receipt['withdrawal_id'], 600, 'SIM-ATM-001', 'final', actor=self.actor)
        self.assertEqual(result['state'], 'PARTIAL_REVERSED')
        self.money(4400, 0, 600)

    def test_contract_terms_shared_but_each_device_requires_its_own_enrollment(self):
        self.activate()
        self.assertFalse(self.auth.status(self.b)['active'])
        self.assertFalse(self.auth.contract_ready(self.context.owner_id, [B]))
        other = SoftwareTestAuthenticator(self.root / 'authenticator-b', B)
        self.addCleanup(other.close)
        result = self.enroll(context=self.b, fixture=other, prefix='b')
        self.assertTrue(result['active'])
        self.assertTrue(self.auth.contract_ready(self.context.owner_id, [B]))
        self.auth.revoke_credential(self.auth.status(self.context)['credential_id'], 'revoke-a')
        self.assertTrue(self.auth.contract_ready(self.context.owner_id, [A, B]))
        self.assertFalse(self.auth.contract_ready(self.context.owner_id, [A]))
        self.assertEqual(len(self.rows('wallet_auth_credentials')), 2)
        self.assertEqual(self.rows('wallet_bills'), [])

    def test_origin_device_suspension_rejects_new_consume_not_confirmed_reconciliation(self):
        self.activate()
        q = self.quote()
        receipt = self.issue(q, self.assertion(q))['result']
        self.eligible.remove((self.context.owner_id, A))
        with self.assertRaises(AuthenticationError):
            self.atm.redeem(receipt['code'], 'SIM-ATM-001', 'redeem', actor=self.actor)
        self.money(4000, 1000)

    def test_old_ledger_history_is_preserved_but_no_credential_is_implicitly_enrolled(self):
        self.assertEqual(self.auth.status(self.context)['activation_state'], 'CREDENTIAL_REQUIRED')
        self.assertEqual(self.rows('wallet_auth_credentials'), [])
        other_root = self.root / 'preexisting'
        other_root.mkdir(mode=0o700)
        wallet = Wallet(other_root / 'wallet.db')
        atm = CardlessATMSimulator(wallet, clock=lambda: self.now)
        sale = wallet.simulate_sale(2000, 'sale')
        wallet.settle_sale(sale['id'], 'settle')
        legacy = atm.issue(1000, 'SIM-ATM-001', 'legacy-issue', context=self.context)
        before = wallet.snapshot()
        auth = WalletAuthorization(wallet, atm, clock=lambda: self.now)
        atm.redemption_authorizer = auth.credential_for_redemption
        self.assertEqual(wallet.snapshot(), before)
        with self.assertRaises(AuthenticationError):
            atm.redeem(legacy['code'], 'SIM-ATM-001', 'legacy-redeem', actor=self.actor)
        atm.cancel(legacy['withdrawal_id'], 'legacy-cancel', context=self.context)
        self.assertEqual(wallet.snapshot()['available_minor'], 2000)

    def test_old_wallet_and_atm_cannot_bypass_required_database_admission(self):
        old_wallet = Wallet(self.wallet.path)
        old_atm = CardlessATMSimulator(old_wallet, clock=lambda: self.now)
        with self.assertRaises(sqlite3.IntegrityError):
            old_wallet.reserve(1000, 'plain-reserve')
        with self.assertRaises(sqlite3.IntegrityError):
            old_atm.issue(1000, 'SIM-ATM-001', 'plain-issue', context=self.context)
        self.assertEqual(self.rows('wallet_withdrawals'), [])
        self.assertEqual(self.rows('atm_credentials'), [])
        self.money()

    def test_deferred_approval_cannot_commit_without_matching_withdrawal(self):
        self.activate()
        q = self.quote()
        with self.assertRaises(sqlite3.IntegrityError):
            with self.wallet._transaction() as db:
                db.execute('INSERT INTO wallet_auth_approvals VALUES (?,?,?,?,?,?)',
                           ('approval-test', q['quote_id'], q['quote']['credential_id'], 'a' * 64, 'missing-withdrawal', self.now))
        self.assertEqual(self.rows('wallet_auth_approvals'), [])

    def test_database_admission_rejects_wrong_amount_and_rolls_back_approval(self):
        self.activate()
        q = self.quote()
        signed = self.assertion(q)
        issue = self.atm._issue_in_transaction
        def wrong(connection, amount, atm_id, **kwargs):
            return issue(connection, amount + 1000, atm_id, **kwargs)
        with patch.object(self.atm, '_issue_in_transaction', wrong), self.assertRaises(sqlite3.IntegrityError):
            self.issue(q, signed)
        self.assertEqual(self.rows('wallet_auth_approvals'), [])
        self.assertEqual(self.counter(), 0)
        self.money()

    def test_plain_old_billing_requires_activation_but_paid_history_still_replays(self):
        old = Wallet(self.wallet.path)
        old.consent_monthly(True, 'existing-monthly-terms')
        with self.assertRaises(sqlite3.IntegrityError):
            old.bill('2026-09', 'before-activation')
        active = self.activate()
        paid = old.bill('2026-09', 'paid-month')
        self.auth.revoke_credential(active['credential_id'], 'server-revoke')
        with self.assertRaises(sqlite3.IntegrityError):
            old.bill('2026-10', 'after-revocation')
        self.assertEqual(old.bill('2026-09', 'paid-month'), paid)
        self.assertEqual(old.bill('2026-09', 'different-recovery-key'), paid)
        self.assertEqual(len(self.rows('wallet_bills')), 1)
        self.money(4112)

    def test_wallet_terms_revocation_prevents_new_bill_without_deleting_monthly_consent(self):
        self.activate()
        self.wallet.consent_monthly(True, 'monthly')
        before = self.rows('wallet_consents')
        self.request('wallet.terms', 'cancel-wallet-terms', accepted=False, terms_version=TERMS_VERSION)
        with self.assertRaises(sqlite3.IntegrityError):
            Wallet(self.wallet.path).bill('2026-09', 'bill')
        self.assertEqual(self.rows('wallet_consents'), before)
        self.money()

    def test_single_ledger_contract_binding_cannot_be_replaced_by_another_purchaser(self):
        self.request('wallet.auth.begin', 'first-owner')
        other = TrustedWalletContext('acct-another-owner', 'fixture-another-device', True)
        self.eligible.add((other.owner_id, other.device_id))
        with self.assertRaises(protocol.AuthError):
            self.request('wallet.auth.begin', 'another-owner', context=other)
        self.assertFalse(self.auth.contract_ready(other.owner_id, [other.device_id]))
        with self.assertRaises(sqlite3.IntegrityError):
            with self.wallet._transaction() as db:
                db.execute('UPDATE wallet_auth_mode SET account_id=?', (other.owner_id,))
        self.assertEqual(self.rows('wallet_auth_mode')[0][-1], self.context.owner_id)

    def test_no_public_revoke_arbitrary_context_or_oversized_request(self):
        with self.assertRaises(protocol.AuthError):
            self.request('wallet.auth.revoke', 'revoke')
        with self.assertRaises(protocol.AuthError):
            self.auth.dispatch({'v': 1, 'op': 'wallet.auth.begin', 'key': 'k'},
                               context={'owner_id': self.context.owner_id, 'device_id': A}, handoff_ref='fixture-handoff')
        with self.assertRaises(protocol.AuthError):
            self.request('wallet.auth.enroll', 'huge', challenge_id='auth-test', credential={'data': 'x' * 65536})
        self.money()

    def test_auth_mode_and_enrollment_history_cannot_be_deleted_or_reassigned(self):
        self.activate()
        for statement in ('DELETE FROM wallet_auth_mode', 'DELETE FROM wallet_auth_credentials',
                          "UPDATE wallet_auth_credentials SET account_id='another'", 'DELETE FROM wallet_auth_terms'):
            with self.assertRaises(sqlite3.IntegrityError):
                with self.wallet._transaction() as db:
                    db.execute(statement)


if __name__ == '__main__':
    unittest.main()

"""Real disposable services plus negative evidence fixtures, never boot proof."""
import copy
from datetime import datetime, timezone
import importlib.util
import json
import os
from pathlib import Path
import shutil
import sys
import tempfile
import unittest
import uuid

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'os/desktop'))
import wallet_backup as evidence
spec = importlib.util.spec_from_file_location('wallet_backup_fixture_service', ROOT / 'os/platform/service.py')
service = importlib.util.module_from_spec(spec); spec.loader.exec_module(service)
from wallet_auth.fixture import SoftwareTestAuthenticator


class PlanContract(unittest.TestCase):
    def test_additional_two_boots_cannot_be_counted_as_the_five_business_soak_boots(self):
        plan = evidence.plan()
        self.assertEqual(plan['additional_normal_boot_shutdown_cycles'], 2)
        self.assertEqual(plan['credit_minor'] - plan['monthly_fee_minor'], 1112)
        self.assertEqual(plan['hold_minor'], 1000)
        self.assertEqual(evidence.contract.plan('soak')['normal_boot_shutdown_cycles'], 5)
        self.assertEqual(plan['real_funds'], 'NOT_RUN')


@unittest.skipUnless(os.geteuid() == 0, 'requires a disposable root-owned fixture on the Linux host; no QEMU')
class WalletBackupEvidence(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temporary = tempfile.TemporaryDirectory(prefix='rock-wallet-backup-test-')
        cls.addClassCleanup(cls.temporary.cleanup)
        root = Path(cls.temporary.name); handoff = root / 'handoff.json'
        shutil.copyfile(ROOT / 'os/entitlement/fixtures/device-handoff.json', handoff); handoff.chmod(0o644)
        state = root / 'wallet'; state.mkdir(mode=0o700)
        now = 1788856800
        cls.server = service.WalletService(state, provisioning_file=handoff, start_scheduler=False, clock=lambda: now)
        cls.addClassCleanup(cls.server.close)
        cls.authenticator = SoftwareTestAuthenticator(root / 'authenticator', 'fixture-rock-arm64-001')
        cls.addClassCleanup(cls.authenticator.close)
        cls.paths = {'wallet': state / 'wallet-simulator.db', 'membership': state / 'entitlement.db',
                     'authenticator': root / 'authenticator/authenticator.sqlite3'}
        def call(op, **fields):
            request = {'v': 1, 'op': op, 'key': 'ui-' + uuid.uuid4().hex, **fields}
            response = cls.server.dispatch(request, peer_uid=1002)
            if response.get('ok') is not True: raise AssertionError('disposable request failed: ' + op)
            return response['result']
        call('wallet.register')
        challenge = call('wallet.auth.begin')
        credential = cls.authenticator.make_credential(challenge['options'], '0000', 'ui-' + uuid.uuid4().hex)
        call('wallet.auth.enroll', challenge_id=challenge['challenge_id'], credential=credential)
        call('wallet.terms', accepted=True, terms_version=evidence.auth.TERMS)
        sale = call('wallet.sale', amount_minor=2000)
        call('wallet.settle', id=sale['id'])
        call('wallet.consent', accepted=True, terms_version=evidence.TERMS)
        period = datetime.fromtimestamp(now, timezone.utc).strftime('%Y-%m')
        call('wallet.bill', period=period); cls.server.membership.tick()
        call('wallet.bill', period=period); cls.server.membership.tick()
        call('wallet.consent', accepted=False, terms_version=evidence.TERMS)
        key = 'ui-' + uuid.uuid4().hex
        quote = call('wallet.atm.quote', issue_key=key, amount_minor=1000, atm_id='SIM-ATM-001')
        assertion = cls.authenticator.get_assertion(quote['options'], '0000', 'ui-' + uuid.uuid4().hex)
        issue = call('wallet.atm.issue', key=key, quote_id=quote['quote_id'], credential=assertion)
        cls.private_code = issue['code']
        call('wallet.atm.cancel', withdrawal_id=issue['withdrawal_id'])
        cls.rows = evidence.read_databases(cls.paths)

    def test_actual_nonempty_state_has_single_fee_and_canceled_signed_hold(self):
        report = evidence.validate(self.rows)
        self.assertEqual(report['available_minor'], 1112)
        self.assertEqual(report['native_distinct_keys'], 15)
        self.assertIs(report['registration_and_assertion_reverified'], True)
        self.assertEqual(report['monthly_work'], 'PAID_QUIESCENT')
        self.assertNotIn(self.private_code, json.dumps(report))
        self.assertNotIn('input_json', json.dumps(report))

    def test_read_only_reader_does_not_change_or_create_databases(self):
        before = {role: path.read_bytes() for role, path in self.paths.items()}
        self.assertEqual(evidence.read_databases(self.paths), self.rows)
        self.assertEqual(before, {role: path.read_bytes() for role, path in self.paths.items()})
        bad = dict(self.paths); bad['wallet'] = Path(self.temporary.name) / 'absent.db'
        with self.assertRaises(Exception): evidence.read_databases(bad)
        self.assertFalse(bad['wallet'].exists())

    def test_monthly_missing_duplicate_unpaid_pending_or_wrong_period_fails(self):
        for mode in ('empty', 'double', 'due', 'processing', 'retry_wait', 'manual', 'period', 'renewal', 'failed', 'consent'):
            rows = copy.deepcopy(self.rows); w, m = rows['wallet'], rows['membership']
            if mode == 'empty': w['wallet_postings'] = []
            if mode == 'double': w['wallet_bills'].append(w['wallet_bills'][0])
            if mode in ('due', 'processing', 'retry_wait'): m['device_monthly_due'][0]['status'] = mode
            if mode == 'manual': m['device_monthly_due'][0]['manual_retry_pending'] = 1
            if mode == 'period': m['device_monthly_due'][0]['period'] = '2030-01'
            if mode == 'renewal': m['accounts'][0]['auto_renew'] = 1
            if mode == 'failed': m['device_api_receipts'][2]['response_json'] = '{"ok":false}'
            if mode == 'consent': m['consents'][0]['amount_minor'] = 777
            with self.subTest(mode=mode), self.assertRaises((ValueError, AssertionError)): evidence.validate(rows)

    def test_reservation_wrong_owner_signature_fee_missing_cancel_or_private_code_never_pass(self):
        for mode in ('owner', 'signature', 'fee', 'held', 'consumed', 'code', 'missing', 'duplicate-key', 'authenticator'):
            rows = copy.deepcopy(self.rows); w = rows['wallet']
            if mode == 'owner': w['atm_credentials'][0]['owner_id'] = 'wrong'
            if mode == 'signature':
                row = next(r for r in w['wallet_idempotency'] if r['operation'] == 'wallet.atm.issue')
                value = json.loads(row['input_json']); value['request']['credential']['response']['signature'] = 'a' * 86
                row['input_json'] = json.dumps(value)
            if mode in ('fee', 'code'):
                row = next(r for r in w['wallet_idempotency'] if r['operation'] == 'wallet.atm.issue')
                value = json.loads(row['result_json']); value['result']['fee_minor' if mode == 'fee' else 'code_sha256'] = 1 if mode == 'fee' else '0' * 64
                row['result_json'] = json.dumps(value)
            if mode == 'held': w['wallet_withdrawals'][0]['released_minor'] = 0
            if mode == 'consumed': w['atm_credentials'][0]['consumed_at'] = 1788856800
            if mode == 'missing': w['wallet_idempotency'] = [r for r in w['wallet_idempotency'] if r['operation'] != 'atm.cancel']
            if mode == 'duplicate-key': rows['authenticator']['requests'][0]['request_key'] = w['wallet_idempotency'][0]['key']
            if mode == 'authenticator': rows['authenticator']['credentials'][0]['sign_count'] = 2
            with self.subTest(mode=mode), self.assertRaises((ValueError, AssertionError)): evidence.validate(rows)

    def test_actual_postings_not_just_summary_or_success_receipt_are_required(self):
        for mode in ('delta', 'repeat', 'journal', 'boolean'):
            rows = copy.deepcopy(self.rows); w = rows['wallet']
            if mode == 'delta': w['wallet_postings'][0]['delta_minor'] += 1
            if mode == 'repeat': w['wallet_postings'].append(w['wallet_postings'][0])
            if mode == 'journal': w['wallet_postings'][0]['journal_id'] = 'wrong'
            if mode == 'boolean': w['wallet_postings'][0]['delta_minor'] = True
            with self.subTest(mode=mode), self.assertRaises((ValueError, AssertionError)): evidence.validate(rows)


if __name__ == '__main__': unittest.main()

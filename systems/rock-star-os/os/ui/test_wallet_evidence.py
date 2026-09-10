#!/usr/bin/env python3
"""Wallet evidence validation on disposable real service state; NOT boot proof."""
import copy
from datetime import datetime, timezone
import importlib.util
import json
import os
from pathlib import Path
import shutil
import sqlite3
import tempfile
import unittest
from unittest.mock import Mock, patch
import uuid

ROOT = Path(__file__).resolve().parents[2]


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


observer = load('wallet_evidence_tests', ROOT / 'os/ui/guest-ui-wallet-evidence.py')
service = load('wallet_evidence_service', ROOT / 'os/platform/service.py')
from wallet_auth.fixture import SoftwareTestAuthenticator

NOW = 1788856800


@unittest.skipUnless(os.geteuid() == 0, 'root-owned disposable handoff fixture test inside Linux VM')
class WalletEvidenceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temporary = tempfile.TemporaryDirectory(prefix='rock-wallet-evidence-test-')
        cls.addClassCleanup(cls.temporary.cleanup)
        directory = Path(cls.temporary.name)
        handoff = directory / 'handoff.json'
        shutil.copyfile(ROOT / 'os/entitlement/fixtures/device-handoff.json', handoff)
        handoff.chmod(0o644)
        state = directory / 'wallet'
        state.mkdir(mode=0o700)
        cls.service = service.WalletService(state, provisioning_file=handoff, start_scheduler=False, clock=lambda: NOW)
        cls.addClassCleanup(cls.service.close)
        cls.authenticator = SoftwareTestAuthenticator(directory / 'authenticator', 'fixture-rock-arm64-001')
        cls.addClassCleanup(cls.authenticator.close)
        cls.paths = [state / 'entitlement.db', state / 'wallet-simulator.db']
        def call(op, **fields):
            request = {'v': 1, 'op': op, **fields}
            if op != 'snapshot':
                request['key'] = 'ui-' + uuid.uuid4().hex
            response = cls.service.dispatch(request, peer_uid=1002)
            if not response['ok']:
                raise AssertionError(response)
            return response
        cls.initial = call('snapshot')['snapshot']
        call('wallet.register')
        assert call('snapshot')['snapshot']['membership']['entitlement']['auto_renew'] is False
        begin = call('wallet.auth.begin')['result']
        credential = cls.authenticator.make_credential(begin['options'], '0000', 'ui-' + uuid.uuid4().hex)
        call('wallet.auth.enroll', challenge_id=begin['challenge_id'], credential=credential)
        call('wallet.terms', accepted=True, terms_version=observer.auth.TERMS)
        assert call('snapshot')['snapshot']['membership']['entitlement']['auto_renew'] is False
        call('wallet.consent', accepted=True, terms_version=observer.TERMS)
        cls.service.membership.tick()  # Observe genuine insufficient-funds retry.
        sale = call('wallet.sale', amount_minor=2000)['result']
        call('wallet.settle', id=sale['id'])
        period = datetime.fromtimestamp(NOW, timezone.utc).strftime('%Y-%m')
        call('wallet.bill', period=period)
        cls.service.membership.tick()
        call('wallet.bill', period=period)
        cls.service.membership.tick()
        call('wallet.consent', accepted=False, terms_version=observer.TERMS)
        cls.wallet = call('snapshot')['snapshot']
        with patch.object(observer, 'ENTITLEMENT_DB', str(cls.paths[0])), patch.object(observer, 'LEDGER_DB', str(cls.paths[1])):
            cls.database = observer.database_evidence()

    def test_actual_disposable_ledger_and_membership_receipts(self):
        observer.base.wallet_baseline(self.initial)
        receipts = observer.validate_final(self.wallet, self.database)
        self.assertEqual(len(receipts['requests']), 5)
        self.assertIs(receipts['authentication']['registration_reverified'], True)
        self.assertEqual(receipts['authentication']['transaction_assertions'], 0)
        self.assertEqual(len(self.database['authentication_receipts']), 3)
        self.assertEqual(self.wallet['available_minor'], 1112)

    def test_query_only_read_does_not_change_or_create_databases(self):
        before = [path.read_bytes() for path in self.paths]
        with patch.object(observer, 'ENTITLEMENT_DB', str(self.paths[0])), patch.object(observer, 'LEDGER_DB', str(self.paths[1])):
            self.assertEqual(observer.database_evidence(), self.database)
        self.assertEqual(before, [path.read_bytes() for path in self.paths])
        missing = Path(self.temporary.name) / 'missing.db'
        with patch.object(observer, 'ENTITLEMENT_DB', str(missing)), self.assertRaises(sqlite3.OperationalError):
            observer.database_evidence()
        self.assertFalse(missing.exists())

    def test_wrong_fee_balance_identity_or_renewal_never_pass(self):
        for name, value in [('available_minor', 2000), ('billed_minor', 1776), ('ledger_balance_minor', 1), ('simulation_only', False)]:
            wallet = copy.deepcopy(self.wallet)
            wallet[name] = value
            with self.subTest(field=name), self.assertRaises(AssertionError):
                observer.validate_final(wallet, self.database)
        for name, value in [('real_identity_verified', True), ('backend_connected', True), ('registration_input_fields', ['name'])]:
            wallet = copy.deepcopy(self.wallet)
            wallet['membership'][name] = value
            with self.subTest(field=name), self.assertRaises(AssertionError):
                observer.validate_final(wallet, self.database)
        wallet = copy.deepcopy(self.wallet)
        wallet['membership']['entitlement']['auto_renew'] = True
        with self.assertRaises(AssertionError):
            observer.validate_final(wallet, self.database)

    def test_missing_duplicate_non_ui_or_failed_receipts_never_pass(self):
        for kind in ('missing', 'duplicate', 'key', 'failed', 'personal-data', 'terms', 'unpaid', 'second-debit', 'balance'):
            db = copy.deepcopy(self.database)
            if kind == 'missing': db['device_receipts'].pop()
            if kind == 'duplicate': db['device_receipts'].append(db['device_receipts'][0])
            if kind == 'key': db['device_receipts'][0]['key'] = 'api-test-not-ui'
            if kind == 'failed': db['device_receipts'][0]['response_json'] = '{"ok":false}'
            if kind in ('personal-data', 'terms'):
                index = 0 if kind == 'personal-data' else 1
                request = json.loads(db['device_receipts'][index]['request_json'])
                request['name' if index == 0 else 'terms_version'] = 'unexpected'
                db['device_receipts'][index]['request_json'] = json.dumps(request)
            if kind == 'unpaid': db['due'][0]['status'] = 'retry_wait'
            if kind == 'second-debit': db['journals'].append(db['journals'][0])
            if kind == 'balance': db['balances'][0]['amount_minor'] += 1
            with self.subTest(kind=kind), self.assertRaises(AssertionError):
                observer.validate_final(self.wallet, db)

    def test_observer_will_not_write_or_shutdown_an_unflagged_host(self):
        with patch.object(observer.Path, 'read_text', return_value='console=ttyAMA0'), patch.object(observer, 'observe') as observe, patch.object(observer.subprocess, 'run') as run:
            with self.assertRaises(SystemExit):
                observer.main()
            observe.assert_not_called()
            run.assert_not_called()


    def test_wallet_terms_cannot_be_replaced_by_monthly_consent(self):
        for kind in ('credential', 'terms', 'monthly-terms', 'extra-operation', 'pin'):
            db = copy.deepcopy(self.database)
            if kind == 'credential': db['authentication']['wallet_auth_credentials'] = []
            if kind == 'terms': db['authentication']['wallet_auth_terms'] = []
            if kind == 'monthly-terms': db['authentication_receipts'][2]['input']['request']['terms_version'] = observer.TERMS
            if kind == 'extra-operation': db['ui_ledger_operations'].append('wallet.atm.quote')
            if kind == 'pin': db['authentication_receipts'][1]['input']['request']['metadata'] = {'PIN': 'never-export'}
            with self.subTest(kind=kind), self.assertRaises(AssertionError):
                observer.validate_final(self.wallet, db)


class WalletFixtureCleanupTests(unittest.TestCase):
    def test_setup_failure_closes_allocated_resources_and_removes_temporary_state(self):
        # This only tests fixture cleanup with mocked services; it does not run
        # or bypass the root-owned Linux service fixture above.
        class FailedSetup(unittest.TestCase):
            setUpClass = WalletEvidenceTests.__dict__['setUpClass']

            def test_never_reached(self):
                self.fail('fixture setup should have failed')

        authenticator = Mock()
        with patch.object(service, 'WalletService') as factory, \
                patch.dict(globals(), SoftwareTestAuthenticator=Mock(return_value=authenticator)):
            factory.return_value.dispatch.side_effect = RuntimeError('injected setup failure after resources open')
            result = unittest.TestResult()
            unittest.TestSuite([FailedSetup('test_never_reached')]).run(result)
        self.assertEqual(result.testsRun, 0)
        self.assertEqual(len(result.errors), 1)
        self.assertIn('injected setup failure', result.errors[0][1])
        factory.return_value.close.assert_called_once_with()
        authenticator.close.assert_called_once_with()
        self.assertFalse(Path(FailedSetup.temporary.name).exists())


if __name__ == '__main__':
    unittest.main()

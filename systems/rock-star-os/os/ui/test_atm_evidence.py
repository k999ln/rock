"""Focused ATM proof guards on disposable real service state; NOT guest proof."""
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch
import uuid

ROOT = Path(__file__).resolve().parents[2]


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


observer = load('atm_evidence_test_observer', ROOT / 'os/ui/guest-ui-atm-evidence.py')
service = load('atm_evidence_test_service', ROOT / 'os/platform/service.py')
harness = load('atm_evidence_test_harness', ROOT / 'os/ui/verify-atm-ui.py')
from wallet_auth.fixture import SoftwareTestAuthenticator


class ATMEvidenceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix='rock-atm-evidence-test-')
        cls.addClassCleanup(cls.temp.cleanup)
        state = Path(cls.temp.name)
        cls.server = service.WalletService(state, provisioning_file=ROOT / 'os/entitlement/fixtures/device-handoff.json',
                                          start_scheduler=False, clock=lambda: 1788856800)
        cls.addClassCleanup(cls.server.close)
        cls.authenticator = SoftwareTestAuthenticator(state / 'authenticator', 'fixture-rock-arm64-001')
        cls.addClassCleanup(cls.authenticator.close)
        cls.paths = [state / 'entitlement.db', state / 'wallet-simulator.db']
        def call(op, **fields):
            request = {'v': 1, 'op': op, **fields}
            if op not in ('snapshot', 'wallet.atm.status'):
                request.setdefault('key', 'ui-' + uuid.uuid4().hex)
            response = cls.server.dispatch(request, peer_uid=1002)
            if response.get('ok') is not True:
                raise AssertionError('disposable service request failed')
            return response
        cls.initial = call('snapshot')['snapshot']
        call('wallet.register')
        begin = call('wallet.auth.begin')['result']
        credential = cls.authenticator.make_credential(begin['options'], '0000', 'ui-' + uuid.uuid4().hex)
        call('wallet.auth.enroll', challenge_id=begin['challenge_id'], credential=credential)
        call('wallet.terms', accepted=True, terms_version=observer.auth.TERMS)
        sale = call('wallet.sale', amount_minor=5000)['result']
        call('wallet.settle', id=sale['id'])
        issue_key = 'ui-' + uuid.uuid4().hex
        quote = call('wallet.atm.quote', issue_key=issue_key, amount_minor=1000, atm_id='SIM-ATM-001')['result']
        assertion = cls.authenticator.get_assertion(quote['options'], '0000', 'ui-' + uuid.uuid4().hex)
        issuance = call('wallet.atm.issue', key=issue_key, quote_id=quote['quote_id'], credential=assertion)['result']
        cls.raw_code = issuance['code']
        cls.issued_wallet = call('snapshot')['snapshot']
        call('wallet.atm.cancel', withdrawal_id=issuance['withdrawal_id'])
        cls.wallet = call('snapshot')['snapshot']
        with patch.object(observer, 'ENTITLEMENT_DB', str(cls.paths[0])), patch.object(observer, 'LEDGER_DB', str(cls.paths[1])):
            cls.database = observer.database_evidence()

    def test_real_service_final_state_and_nine_distinct_ui_receipts(self):
        observer.base.wallet_baseline(self.initial)
        receipts = observer.validate_final(self.wallet, self.database)
        self.assertEqual(len(receipts['ledger']), 4)
        self.assertEqual(len(self.database['wallet_idempotency']), 8)
        self.assertIs(receipts['authentication']['registration_and_assertion_reverified'], True)
        self.assertEqual(receipts['authentication']['rock_atm_fee_minor'], 0)
        self.assertEqual(self.wallet['available_minor'], 5000)
        self.assertEqual(self.wallet['held_minor'], 0)

    def test_code_is_verified_but_absent_from_every_exported_receipt(self):
        raw = json.dumps(self.database, sort_keys=True)
        self.assertTrue(self.raw_code not in raw, 'private code leaked into evidence')
        observer.private_fields_absent(self.database)
        issue = self.database['wallet_idempotency'][6]['result']
        self.assertTrue(issue['code_sha256'] == hashlib.sha256(self.raw_code.encode()).hexdigest())
        self.assertIs(issue['private_code_hash_verified'], True)

    def test_read_only_queries_do_not_write_or_create_databases(self):
        before = [path.read_bytes() for path in self.paths]
        with patch.object(observer, 'ENTITLEMENT_DB', str(self.paths[0])), patch.object(observer, 'LEDGER_DB', str(self.paths[1])):
            self.assertEqual(observer.database_evidence(), self.database)
        self.assertTrue(before == [path.read_bytes() for path in self.paths])
        missing = Path(self.temp.name) / 'missing.db'
        with patch.object(observer, 'ENTITLEMENT_DB', str(missing)), self.assertRaises(sqlite3.OperationalError):
            observer.database_evidence()
        self.assertFalse(missing.exists())

    def test_raw_code_in_nested_report_or_unparsed_json_is_rejected(self):
        for name in (*observer.FORBIDDEN_FIELDS, 'pin', 'test_pin', 'auth_pin', 'PIN'):
            with self.subTest(field=name), self.assertRaises(AssertionError):
                observer.private_fields_absent({'nested': [{name: 'private'}]})

    def test_bad_hash_and_extra_issuance_fields_do_not_export_private_data(self):
        issue = copy.deepcopy(self.database['wallet_idempotency'][6]['result'])
        issue.pop('private_code_hash_verified')
        issue['code'] = self.raw_code
        for mode in ('hash', 'shape', 'extra'):
            tampered = copy.deepcopy(issue)
            if mode == 'hash': tampered['code_sha256'] = '0' * 64
            if mode == 'shape': tampered['code'] = 'short'
            if mode == 'extra': tampered['private_extra'] = self.raw_code
            with self.subTest(mode=mode), self.assertRaises(AssertionError) as raised:
                observer.redact_issuance(tampered)
            self.assertTrue(self.raw_code not in str(raised.exception))

    def test_missing_duplicate_wrong_owner_atm_or_actor_claim_cannot_pass(self):
        for mode in ('missing', 'duplicate', 'count', 'key', 'failed', 'registration_fields', 'owner', 'device',
                     'atm', 'hash', 'rawverified', 'consumed', 'cash', 'hold', 'journal', 'postings', 'balance'):
            db = copy.deepcopy(self.database)
            if mode == 'missing': db['wallet_idempotency'].pop()
            if mode == 'duplicate': db['wallet_idempotency'].append(db['wallet_idempotency'][0])
            if mode == 'count': db['counts']['wallet_idempotency'] += 1
            if mode == 'key': db['wallet_idempotency'][0]['key'] = 'direct-api-key'
            if mode == 'failed': db['device_api_receipts'][0]['response'] = {'ok': False}
            if mode == 'registration_fields': db['device_api_receipts'][0]['request']['name'] = 'unexpected'
            if mode == 'owner': db['atm_credentials'][0]['owner_id'] = 'other-owner'
            if mode == 'device': db['atm_wallet_binding'][0]['device_id'] = 'other-device'
            if mode == 'atm': db['atm_credentials'][0]['atm_id'] = 'SIM-ATM-002'
            if mode == 'hash': db['atm_credentials'][0]['code_sha256'] = '0' * 64
            if mode == 'rawverified': db['wallet_idempotency'][6]['result']['private_code_hash_verified'] = False
            if mode == 'consumed': db['atm_credentials'][0]['consumed_at'] = 1788856801
            if mode == 'cash': db['wallet_idempotency'][7]['result']['withdrawal']['dispensed_minor'] = 1000
            if mode == 'hold': db['wallet_withdrawals'][0]['released_minor'] = 0
            if mode == 'journal': db['wallet_journals'][0]['kind'] = 'cash_dispense'
            if mode == 'postings': db['posting_count'] += 2
            if mode == 'balance': db['balances'][0]['amount_minor'] += 1
            with self.subTest(mode=mode), self.assertRaises(AssertionError):
                observer.validate_final(self.wallet, db)

    def test_wrong_funds_fee_scope_or_implicit_consent_never_pass(self):
        for field, value in (('available_minor', 4000), ('held_minor', 1000), ('billed_minor', 888),
                             ('dispensed_minor', 1000), ('ledger_balance_minor', 1), ('simulation_only', False)):
            wallet = copy.deepcopy(self.wallet)
            wallet[field] = value
            with self.subTest(field=field), self.assertRaises(AssertionError):
                observer.validate_final(wallet, self.database)
        wallet = copy.deepcopy(self.wallet)
        wallet['membership']['entitlement']['auto_renew'] = True
        with self.assertRaises(AssertionError):
            observer.validate_final(wallet, self.database)
        wallet = copy.deepcopy(self.wallet)
        wallet['membership']['backend_connected'] = True
        with self.assertRaises(AssertionError):
            observer.validate_final(wallet, self.database)

    def test_snapshot_reader_rejects_business_mutations(self):
        for op in ('wallet.atm.issue', 'wallet.atm.cancel', 'atm.redeem', 'wallet.sale', 'wallet.register'):
            with self.subTest(op=op), self.assertRaises(ValueError):
                observer.base.read_api(op)

    def test_unflagged_observer_cannot_write_or_shutdown(self):
        with patch.object(observer.Path, 'read_text', return_value='console=ttyAMA0'), patch.object(observer, 'observe') as observe, \
                patch.object(observer.base, 'persist') as persist, patch.object(observer.subprocess, 'run') as run:
            with self.assertRaises(SystemExit):
                observer.main()
            observe.assert_not_called()
            persist.assert_not_called()
            run.assert_not_called()

    def proof_fixture(self):
        environment = {'framebuffer': [720, 960], 'evdev_names': ['QEMU Virtio Keyboard', 'QEMU Virtio Tablet'],
                       'hardware_network_interfaces': [], 'network_interfaces': ['lo', 'dummy0', 'sit0'],
                       'root_mount': ['/dev/vda', '/', 'ext4', 'ro'],
                       'data_mount': ['/dev/vdb', '/data', 'ext4', 'rw,nosuid,nodev,noexec'],
                       'processes': {name: {'uid': [uid] * 4, 'gid': [uid] * 4, 'no_new_privs': 1}
                                     for name, uid in {'ui': 1000, 'core': 1000, 'platform': 1002, 'wallet': 1003}.items()}}
        credential = copy.deepcopy(self.database['atm_credentials'][0])
        credential['state'] = 'ISSUED'
        return {'schema': 'rock-native-atm-ui-proof/1', 'status': 'PASS', 'blackberry': 'NOT_RUN', 'real_money': 'NOT_RUN',
                'real_atm': 'NOT_CONNECTED', 'real_identity': 'NOT_CONNECTED', 'atm_actor_assertions': 0, 'raw_code_in_evidence': False,
                'wallet_initial': self.initial, 'wallet_final': self.wallet, 'registration_without_consent': True,
                'database': self.database, 'receipts': observer.validate_final(self.wallet, self.database),
                'initial_hub_sha256': '0' * 64, 'final_hub_sha256': '0' * 64, 'tool_state_unchanged': True,
                'stages': [{'stage': index, 'available_minor': a, 'pending_minor': p, 'held_minor': h} for index, (a, p, h) in
                           enumerate(((0, 0, 0), (0, 0, 0), (0, 5000, 0), (5000, 0, 0), (4000, 0, 1000), (5000, 0, 0)))],
                'capture_grace_seconds': 30, 'issuance_observed': {'wallet': self.issued_wallet, 'credential': credential},
                'environment_initial': environment, 'environment_final': copy.deepcopy(environment)}

    def test_host_validator_accepts_consistent_fixture_but_this_is_not_boot_evidence(self):
        harness.validate_proof(self.proof_fixture())

    def test_serial_parser_requires_atm_markers_and_one_proof(self):
        valid = 'ROCK_UI_ATM_GUEST_PROOF {"status":"PASS"}\r\nROCK_UI_ATM_GUEST_PASS\r\n'
        self.assertEqual(harness.parse_proof(valid), {'status': 'PASS'})
        for invalid in ('', valid.replace('ATM', 'WALLET'), valid + valid,
                        valid + 'ROCK_UI_ATM_GUEST_FAIL\n', valid.replace('ROCK_UI_ATM_GUEST_PASS', '')):
            with self.assertRaises(AssertionError):
                harness.parse_proof(invalid)

    def test_host_validator_rejects_skipped_stage_nic_uid_and_scope_drift(self):
        for mode in ('stage', 'balance', 'network', 'uid', 'scope', 'actor', 'raw', 'credential', 'hub'):
            proof = copy.deepcopy(self.proof_fixture())
            if mode == 'stage': proof['stages'].pop(4)
            if mode == 'balance': proof['stages'][4]['held_minor'] = 0
            if mode == 'network': proof['environment_final']['hardware_network_interfaces'] = ['eth0']
            if mode == 'uid': proof['environment_final']['processes']['ui']['uid'] = [0] * 4
            if mode == 'scope': proof['real_atm'] = 'CONNECTED'
            if mode == 'actor': proof['atm_actor_assertions'] = 1
            if mode == 'raw': proof['nested'] = {'code': 'private'}
            if mode == 'credential': proof['issuance_observed']['credential']['code_sha256'] = '0' * 64
            if mode == 'hub': proof['final_hub_sha256'] = '1' * 64
            with self.subTest(mode=mode), self.assertRaises(AssertionError):
                harness.validate_proof(proof)


if __name__ == '__main__':
    unittest.main()

"""Fixture behavior, durable exact retries and state safety; no real UV claims."""
import copy
from contextlib import closing
from pathlib import Path
import os
import sqlite3
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[3]
sys.path[:0] = [str(ROOT / 'src'), str(ROOT / 'os')]
from wallet_auth import protocol as p
from wallet_auth import fixture as f

DEVICE = 'synthetic-device:A@wallet'
USER = p.b64encode(b'synthetic-account')
CHALLENGE = p.b64encode(bytes(range(32)))


def creation_options():
    return {'schema_version': 1, 'device_ref': DEVICE, 'purpose': 'wallet.enroll', 'publicKey': {
        'challenge': CHALLENGE, 'rp': {'id': p.RP_ID, 'name': 'Rock Wallet'},
        'user': {'id': USER, 'name': 'Synthetic account', 'displayName': 'Synthetic account'},
        'pubKeyCredParams': [{'type': 'public-key', 'alg': -8}],
        'authenticatorSelection': {'residentKey': 'required', 'userVerification': 'required'},
        'attestation': 'direct', 'timeout': 120000, 'excludeCredentials': []}}


def assertion_options(credential_id, challenge=CHALLENGE):
    return {'schema_version': 1, 'device_ref': DEVICE, 'purpose': 'wallet.atm.issue', 'publicKey': {
        'challenge': challenge, 'rpId': p.RP_ID, 'allowCredentials': [{'type': 'public-key', 'id': credential_id}],
        'userVerification': 'required', 'timeout': 120000}}


class SoftwareAuthenticatorTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.state = Path(self.temp.name) / 'authenticator'
        self.auth = f.SoftwareTestAuthenticator(self.state, DEVICE)
        self.addCleanup(lambda: self.auth.close())

    def rows(self):
        with closing(sqlite3.connect(self.state / 'authenticator.sqlite3')) as db:
            return {'credentials': db.execute('SELECT * FROM credentials ORDER BY credential_id').fetchall(),
                    'requests': db.execute('SELECT * FROM requests ORDER BY request_key').fetchall()}

    def create(self, key='create-one'):
        return self.auth.make_credential(creation_options(), '0000', key)

    def test_full_real_crypto_round_trip_and_metadata(self):
        credential = self.create()
        record = p.verify_registration(credential, challenge=CHALLENGE, rp_id=p.RP_ID, origin=p.ORIGIN)
        asserted = self.auth.get_assertion(assertion_options(credential['id']), '0000', 'assert-one')
        result = p.verify_assertion(asserted, challenge=CHALLENGE, rp_id=p.RP_ID, origin=p.ORIGIN, record=record, user_handle=USER)
        self.assertEqual(result['sign_count'], 1)
        self.assertNotIn('metadata', asserted)
        self.assertEqual(self.auth.metadata, {'simulation_only': True, 'authenticator': 'public-software-test',
            'user_presence': 'simulated', 'user_verification': 'public-test-pin', 'hardware_backed': False, 'shared_public_test_key': True})
        metadata = self.auth.metadata
        metadata['hardware_backed'] = True
        self.assertFalse(self.auth.metadata['hardware_backed'])

    def test_exact_response_retry_survives_restart_without_counter_advance(self):
        created = self.create()
        options = assertion_options(created['id'])
        asserted = self.auth.get_assertion(options, '0000', 'get-one')
        before = self.rows()
        self.auth.close()
        self.auth = f.SoftwareTestAuthenticator(self.state, DEVICE)
        self.assertEqual(self.create(), created)
        self.assertEqual(self.auth.get_assertion(options, '0000', 'get-one'), asserted)
        self.assertEqual(self.rows(), before)
        next_response = self.auth.get_assertion(assertion_options(created['id'], p.b64encode(b'n' * 32)), '0000', 'get-two')
        self.assertEqual(int.from_bytes(p.b64decode(next_response['response']['authenticatorData'])[33:37], 'big'), 2)

    def test_wrong_pin_initial_and_replay_preserves_state(self):
        before = self.rows()
        for pin in ('1234', '', None, 0, '００００'):
            with self.subTest(pin=pin), self.assertRaises(p.AuthError):
                self.auth.make_credential(creation_options(), pin, 'create-one')
            self.assertEqual(self.rows(), before)
        created = self.create()
        options = assertion_options(created['id'])
        self.auth.get_assertion(options, '0000', 'get-one')
        before = self.rows()
        for method, opts, key in ((self.auth.make_credential, creation_options(), 'create-one'),
                                   (self.auth.get_assertion, options, 'get-one')):
            with self.assertRaises(p.AuthError):
                method(opts, '1111', key)
            self.assertEqual(self.rows(), before)
        for row in self.rows()['requests']:
            self.assertNotIn('"pin"', row[2])
            self.assertNotIn('"pin"', row[3])

    def test_same_key_different_options_or_operation_conflicts_without_changes(self):
        created = self.create()
        before = self.rows()
        changed = creation_options()
        changed['publicKey']['challenge'] = p.b64encode(b'c' * 32)
        with self.assertRaises(p.AuthError):
            self.auth.make_credential(changed, '0000', 'create-one')
        with self.assertRaises(p.AuthError):
            self.auth.get_assertion(assertion_options(created['id']), '0000', 'create-one')
        self.assertEqual(self.rows(), before)

    def test_strict_envelope_device_purpose_rp_and_algorithm(self):
        changes = [lambda o: o.update(extra=True), lambda o: o.update(schema_version=True),
                   lambda o: o.update(device_ref='other-device'), lambda o: o.update(purpose='wallet.credit'),
                   lambda o: o['publicKey']['rp'].update(id='other.test'),
                   lambda o: o['publicKey'].update(timeout=120000.0),
                   lambda o: o['publicKey'].update(challenge=CHALLENGE + '='),
                   lambda o: o['publicKey'].update(pubKeyCredParams=[{'type': 'public-key', 'alg': -8.0}]),
                   lambda o: o['publicKey']['authenticatorSelection'].update(userVerification='preferred'),
                   lambda o: o['publicKey'].update(signBytes='arbitrary'),
                   lambda o: o['publicKey']['user'].update(id=p.b64encode(bytes(65)))]
        before = self.rows()
        for change in changes:
            value = creation_options()
            change(value)
            with self.subTest(options=value), self.assertRaises(p.AuthError):
                self.auth.make_credential(value, '0000', 'create-one')
            self.assertEqual(self.rows(), before)

    def test_unknown_excluded_and_multiple_credentials(self):
        with self.assertRaises(p.AuthError):
            self.auth.get_assertion(assertion_options(p.b64encode(b'unknown')), '0000', 'get-unknown')
        created = self.create()
        value = creation_options()
        value['publicKey']['excludeCredentials'] = [{'type': 'public-key', 'id': created['id']}]
        before = self.rows()
        with self.assertRaises(p.AuthError):
            self.auth.make_credential(value, '0000', 'create-two')
        value = assertion_options(created['id'])
        value['publicKey']['allowCredentials'] *= 2
        with self.assertRaises(p.AuthError):
            self.auth.get_assertion(value, '0000', 'get-two')
        self.assertEqual(self.rows(), before)

    def test_counters_are_per_credential_with_same_public_test_key(self):
        one, two = self.create('create-one'), self.create('create-two')
        self.assertNotEqual(one['id'], two['id'])
        records = [p.verify_registration(v, challenge=CHALLENGE, rp_id=p.RP_ID, origin=p.ORIGIN) for v in (one, two)]
        self.assertEqual(records[0]['public_key'], records[1]['public_key'])
        for index, value in enumerate((one, two)):
            response = self.auth.get_assertion(assertion_options(value['id']), '0000', f'get-{index}')
            self.assertEqual(int.from_bytes(p.b64decode(response['response']['authenticatorData'])[33:37], 'big'), 1)

    def test_signing_failure_rolls_back_credential_counter_and_request(self):
        before = self.rows()
        with patch.object(f, '_sign', side_effect=p.AuthUnavailable('injected signing outage')):
            with self.assertRaises(p.AuthUnavailable):
                self.create()
        self.assertEqual(self.rows(), before)
        created = self.create()
        before = self.rows()
        with patch.object(f, '_sign', side_effect=p.AuthUnavailable('injected signing outage')):
            with self.assertRaises(p.AuthUnavailable):
                self.auth.get_assertion(assertion_options(created['id']), '0000', 'get-one')
        self.assertEqual(self.rows(), before)
        self.auth.get_assertion(assertion_options(created['id']), '0000', 'get-one')
        self.assertEqual(self.rows()['credentials'][0][2], 1)

    def test_capacity_and_counter_exhaustion_do_not_break_exact_retries(self):
        created = self.create()
        with patch.object(f, 'MAX_REQUESTS', 1):
            self.assertEqual(self.create(), created)
            with self.assertRaises(p.AuthError):
                self.auth.get_assertion(assertion_options(created['id']), '0000', 'get-one')
        with patch.object(f, 'MAX_CREDENTIALS', 1):
            with self.assertRaises(p.AuthError):
                self.create('create-two')
        with closing(sqlite3.connect(self.state / 'authenticator.sqlite3')) as db, db:
            db.execute('UPDATE credentials SET sign_count=4294967295')
        before = self.rows()
        with self.assertRaises(p.AuthError):
            self.auth.get_assertion(assertion_options(created['id']), '0000', 'get-one')
        self.assertEqual(self.rows(), before)

    def test_private_state_single_writer_closed_object_and_device_binding(self):
        created = self.create()
        self.assertEqual(self.state.stat().st_mode & 0o777, 0o700)
        for path in self.state.iterdir():
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)
            self.assertEqual(path.stat().st_nlink, 1)
        with self.assertRaises(p.AuthUnavailable):
            f.SoftwareTestAuthenticator(self.state, DEVICE)
        self.auth.close()
        with self.assertRaises(p.AuthError):
            self.create()
        with self.assertRaises(p.AuthError):
            f.SoftwareTestAuthenticator(self.state, 'other-device')
        self.auth = f.SoftwareTestAuthenticator(self.state, DEVICE)
        self.assertEqual(self.create(), created)

    def test_existing_insecure_symlink_and_hardlink_state_rejected_unchanged(self):
        self.create()
        self.auth.close()
        database = self.state / 'authenticator.sqlite3'
        original = database.read_bytes()
        database.chmod(0o644)
        with self.assertRaises(p.AuthError):
            f.SoftwareTestAuthenticator(self.state, DEVICE)
        self.assertEqual(database.read_bytes(), original)
        database.chmod(0o600)
        external = Path(self.temp.name) / 'external.sqlite3'
        database.rename(external)
        database.symlink_to(external)
        with self.assertRaises(p.AuthError):
            f.SoftwareTestAuthenticator(self.state, DEVICE)
        self.assertEqual(external.read_bytes(), original)
        database.unlink()
        os.link(external, database)
        with self.assertRaises(p.AuthError):
            f.SoftwareTestAuthenticator(self.state, DEVICE)
        self.assertEqual(external.read_bytes(), original)


if __name__ == '__main__':
    unittest.main()

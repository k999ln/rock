"""Real Ed25519 WebAuthn vectors using only the existing public test key."""
import copy
import hashlib
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[3]
sys.path[:0] = [str(ROOT / 'src'), str(ROOT / 'os')]
from blackberryrock.packages import PUBLIC_TEST_KEY
from wallet_auth import protocol as p
from wallet_auth.fixture import _sign

CHALLENGE = p.b64encode(bytes(range(32)))
USER = p.b64encode(b'account-fixture')
IDENTIFIER = p.b64encode(b'credential-fixture')


def client(creation, **changes):
    value = {'type': 'webauthn.create' if creation else 'webauthn.get',
             'challenge': CHALLENGE, 'origin': p.ORIGIN, 'crossOrigin': False}
    value.update(changes)
    return p.json_bytes(value)


def registration(*, client_data=None, flags=0x45, count=0, cose=None, rp_hash=None,
                 attested_id=None, statement=None, fmt='packed'):
    identifier = p.b64decode(IDENTIFIER) if attested_id is None else attested_id
    cose = {1: 1, 3: -8, -1: 6, -2: bytes.fromhex(PUBLIC_TEST_KEY)} if cose is None else cose
    raw = ((hashlib.sha256(p.RP_ID.encode()).digest() if rp_hash is None else rp_hash)
           + bytes([flags]) + count.to_bytes(4, 'big') + bytes(16) + len(identifier).to_bytes(2, 'big')
           + identifier + (cose if type(cose) is bytes else p._cbor_encode(cose)))
    client_data = client(True) if client_data is None else client_data
    statement = {'alg': -8, 'sig': _sign(raw + hashlib.sha256(client_data).digest())} if statement is None else statement
    return {'id': IDENTIFIER, 'rawId': IDENTIFIER, 'type': 'public-key', 'clientExtensionResults': {},
            'response': {'clientDataJSON': p.b64encode(client_data),
                         'attestationObject': p.b64encode(p._cbor_encode({'fmt': fmt, 'authData': raw, 'attStmt': statement}))}}


def assertion(*, client_data=None, flags=5, count=1, rp_hash=None, user=USER):
    raw = ((hashlib.sha256(p.RP_ID.encode()).digest() if rp_hash is None else rp_hash)
           + bytes([flags]) + count.to_bytes(4, 'big'))
    client_data = client(False) if client_data is None else client_data
    return {'id': IDENTIFIER, 'rawId': IDENTIFIER, 'type': 'public-key', 'clientExtensionResults': {},
            'response': {'clientDataJSON': p.b64encode(client_data), 'authenticatorData': p.b64encode(raw),
                         'signature': p.b64encode(_sign(raw + hashlib.sha256(client_data).digest())), 'userHandle': user}}


def verify_create(value, **changes):
    return p.verify_registration(value, **dict({'challenge': CHALLENGE, 'rp_id': p.RP_ID, 'origin': p.ORIGIN}, **changes))


def verify_get(value, record, **changes):
    return p.verify_assertion(value, **dict({'challenge': CHALLENGE, 'rp_id': p.RP_ID, 'origin': p.ORIGIN,
                                          'record': record, 'user_handle': USER}, **changes))


class WebAuthnProtocolTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.created = registration()
        cls.record = verify_create(cls.created)
        cls.asserted = assertion()

    def test_real_packed_self_attestation_and_assertion(self):
        self.assertEqual(self.record, {'credential_id': IDENTIFIER, 'public_key': PUBLIC_TEST_KEY, 'sign_count': 0,
                                     'aaguid': '00' * 16, 'backup_eligible': False, 'backup_state': False})
        self.assertEqual(verify_get(self.asserted, self.record)['sign_count'], 1)
        self.assertEqual(self.record['sign_count'], 0, 'verification must not mutate a persisted input record')
        self.assertEqual(verify_create(p.json_bytes(self.created)), self.record)

    def test_changed_signature_and_signed_bytes_rejected(self):
        bad = copy.deepcopy(self.asserted)
        sig = p.b64decode(bad['response']['signature'])
        bad['response']['signature'] = p.b64encode(bytes([sig[0] ^ 1]) + sig[1:])
        with self.assertRaises(p.AuthError):
            verify_get(bad, self.record)
        bad = copy.deepcopy(self.created)
        att = p.cbor_decode(p.b64decode(bad['response']['attestationObject']))
        att['attStmt']['sig'] = bytes(64)
        bad['response']['attestationObject'] = p.b64encode(p._cbor_encode(att))
        with self.assertRaises(p.AuthError):
            verify_create(bad)
        bad = copy.deepcopy(self.asserted)
        bad['response']['clientDataJSON'] = p.b64encode(client(False, harmless='unsigned edit'))
        with self.assertRaises(p.AuthError):
            verify_get(bad, self.record)

    def test_identity_key_forgery_and_noncanonical_or_torsion_keys_rejected(self):
        # OpenSSL alone accepts R=identity,S=0 for public A=identity for ANY
        # message. Reproduce the full wire form, never generating a private key.
        identity = b'\x01' + bytes(31)
        forged = identity + bytes(32)
        weak = registration(cose={1: 1, 3: -8, -1: 6, -2: identity}, statement={'alg': -8, 'sig': forged})
        with self.assertRaises(p.AuthError):
            verify_create(weak)
        value = copy.deepcopy(self.asserted)
        value['response']['signature'] = p.b64encode(forged)
        with self.assertRaises(p.AuthError):
            verify_get(value, dict(self.record, public_key=identity.hex()))
        prime = 2**255 - 19
        public = int.from_bytes(bytes.fromhex(PUBLIC_TEST_KEY), 'little')
        # Adding the order-two point to a valid public point yields mixed order,
        # not a generated signing key: (x,y) -> (-x,-y).
        mixed = (prime - (public & (2**255 - 1))) | ((1 - (public >> 255)) << 255)
        for encoded in (bytes(32), (prime - 1).to_bytes(32, 'little'), prime.to_bytes(32, 'little'),
                        (prime + 1).to_bytes(32, 'little'), (1 + 2**255).to_bytes(32, 'little'),
                        mixed.to_bytes(32, 'little')):
            with self.subTest(public=encoded.hex()), self.assertRaises(p.AuthError):
                p._signature(encoded, forged, b'public-invalid-key-reproduction')

    def test_resigned_wrong_type_challenge_origin_cross_origin_rejected(self):
        changes = [{'type': 'webauthn.wrong'}, {'challenge': p.b64encode(b'x' * 32)},
                   {'origin': 'https://other.test'}, {'crossOrigin': True}, {'crossOrigin': 0},
                   {'topOrigin': p.ORIGIN}]
        for creation in (True, False):
            for change in changes:
                with self.subTest(creation=creation, change=change), self.assertRaises(p.AuthError):
                    value = registration(client_data=client(True, **change)) if creation else assertion(client_data=client(False, **change))
                    verify_create(value) if creation else verify_get(value, self.record)

    def test_fixed_expected_rp_origin_and_rp_hash(self):
        for change in ({'rp_id': 'other.test'}, {'origin': 'https://other.test'}, {'challenge': CHALLENGE + '='}):
            with self.subTest(change=change), self.assertRaises(p.AuthError):
                verify_create(self.created, **change)
        for value, verify in ((registration(rp_hash=bytes(32)), verify_create),
                              (assertion(rp_hash=bytes(32)), lambda v: verify_get(v, self.record))):
            with self.assertRaises(p.AuthError):
                verify(value)

    def test_up_uv_reserved_at_extension_and_backup_flags(self):
        for flags in (0x44, 0x41, 0x47, 0x65, 0x05, 0xC5, 0x55):
            with self.subTest(creation_flags=flags), self.assertRaises(p.AuthError):
                verify_create(registration(flags=flags))
        for flags in (4, 1, 7, 0x25, 0x45, 0x85, 0x15):
            with self.subTest(assertion_flags=flags), self.assertRaises(p.AuthError):
                verify_get(assertion(flags=flags), self.record)

    def test_backup_eligibility_immutable_but_state_can_change(self):
        record = verify_create(registration(flags=0x4D))
        updated = verify_get(assertion(flags=0x1D), record)
        self.assertTrue(updated['backup_eligible'])
        self.assertTrue(updated['backup_state'])
        with self.assertRaises(p.AuthError):
            verify_get(assertion(flags=5), record)
        with self.assertRaises(p.AuthError):
            verify_get(assertion(flags=13), self.record)

    def test_strict_counter_replay_zero_and_rollover_policy(self):
        updated = verify_get(self.asserted, self.record)
        for count in (0, 1):
            with self.subTest(count=count), self.assertRaises(p.AuthError):
                verify_get(assertion(count=count), updated)
        self.assertEqual(verify_get(assertion(count=0), self.record)['sign_count'], 0)
        self.assertEqual(verify_get(assertion(count=2), updated)['sign_count'], 2)
        maximum = dict(self.record, sign_count=0xFFFFFFFF)
        with self.assertRaises(p.AuthError):
            verify_get(assertion(count=0), maximum)

    def test_user_handle_and_rawid_binding(self):
        with self.assertRaises(p.AuthError):
            verify_get(assertion(user=p.b64encode(b'other-account')), self.record)
        self.assertEqual(verify_get(assertion(user=None), self.record)['sign_count'], 1)
        for original, verify in ((self.created, verify_create), (self.asserted, lambda v: verify_get(v, self.record))):
            bad = copy.deepcopy(original)
            bad['id'] = p.b64encode(b'other-credential')
            with self.assertRaises(p.AuthError):
                verify(bad)
        with self.assertRaises(p.AuthError):
            verify_create(registration(attested_id=b'another-id'))

    def test_unknown_attestation_certificate_or_cose_parameters_rejected(self):
        for fmt in ('none', 'fido-u2f', 'apple'):
            with self.subTest(fmt=fmt), self.assertRaises(p.AuthError):
                verify_create(registration(fmt=fmt))
        for statement in ({'alg': -7, 'sig': bytes(64)}, {'alg': -8, 'sig': bytes(64), 'x5c': [b'certificate']},
                          {'alg': -8, 'sig': b'x'}, {'alg': -8, 'sig': bytes(64), 'extra': 1}):
            with self.subTest(statement_fields=list(statement)), self.assertRaises(p.AuthError):
                verify_create(registration(statement=statement))
        valid = {1: 1, 3: -8, -1: 6, -2: bytes.fromhex(PUBLIC_TEST_KEY)}
        for change in ({1: 2}, {3: -7}, {-1: 4}, {-2: bytes(31)}, {2: b'extra'}):
            with self.subTest(cose_change=change), self.assertRaises(p.AuthError):
                verify_create(registration(cose=dict(valid, **{}) | change))

    def test_standard_optional_registration_response_fields_checked(self):
        value = copy.deepcopy(self.created)
        raw = p.cbor_decode(p.b64decode(value['response']['attestationObject']))['authData']
        optional = {'authenticatorData': p.b64encode(raw), 'publicKeyAlgorithm': -8,
                    'publicKey': p.b64encode(bytes.fromhex('302a300506032b6570032100' + PUBLIC_TEST_KEY)),
                    'transports': ['internal']}
        value['response'].update(optional)
        self.assertEqual(verify_create(value), self.record)
        for key, incorrect in (('authenticatorData', p.b64encode(bytes(37))), ('publicKeyAlgorithm', -8.0),
                               ('publicKey', p.b64encode(bytes(44))), ('transports', ['unknown'])):
            bad = copy.deepcopy(value)
            bad['response'][key] = incorrect
            with self.subTest(key=key), self.assertRaises(p.AuthError):
                verify_create(bad)

    def test_client_json_duplicate_fields_rejected_and_future_fields_allowed(self):
        raw = client(True)
        duplicate = raw[:-1] + b',"challenge":' + json.dumps(CHALLENGE).encode() + b'}'
        with self.assertRaises(p.AuthError):
            verify_create(registration(client_data=duplicate))
        self.assertEqual(verify_create(registration(client_data=client(True, futureMember={'safe': [1, 'x']}))), self.record)
        self.assertEqual(verify_create(registration(client_data=b'\xef\xbb\xbf' + raw)), self.record)
        absent_cross = json.loads(raw)
        del absent_cross['crossOrigin']
        self.assertEqual(verify_create(registration(client_data=p.json_bytes(absent_cross))), self.record)

    def test_credential_json_fields_duplicates_and_extensions_fail_closed(self):
        for change in ({'unknown': 'field'}, {'type': 'password'}, {'clientExtensionResults': {'appid': False}}):
            bad = copy.deepcopy(self.created)
            bad.update(change)
            with self.subTest(change=change), self.assertRaises(p.AuthError):
                verify_create(bad)
        raw = p.json_bytes(self.created)
        with self.assertRaises(p.AuthError):
            verify_create(raw[:-1] + b',"id":' + json.dumps(IDENTIFIER).encode() + b'}')
        bad = copy.deepcopy(self.asserted)
        bad['response']['unexpected'] = True
        with self.assertRaises(p.AuthError):
            verify_get(bad, self.record)

    def test_base64url_and_json_bounds(self):
        for value in ('AA==', 'AB', '+A', '/A', 'A', '', None, True, 'A' * 30000):
            with self.subTest(value=str(value)[:20]), self.assertRaises(p.AuthError):
                p.b64decode(value)
        for raw in (b'NaN', b'Infinity', b'{"a":1,"a":2}', b'[' * 10 + b'0' + b']' * 10,
                    b'"' + b'a' * 65537 + b'"', b'"\xff"'):
            with self.subTest(raw=raw[:20]), self.assertRaises(p.AuthError):
                p.json_decode(raw)
        long_client = client(True, extra='a' * 8200)
        with self.assertRaises(p.AuthError):
            verify_create(registration(client_data=long_client))

    def test_cbor_bounds_duplicates_types_and_trailing_bytes(self):
        values = [b'\xa2\x01\x01\x01\x02', b'\x9f\xff', b'\x18\x01', b'\xc0\x01', b'\xf5',
                  b'\x81' * 10 + b'\x01', b'\x98\x21' + bytes(33), b'\x01\x02', b'\x58\x20x',
                  b'\x7a\xff\xff\xff\xff', b'\xa1\x80\x01', b'x' * 16385]
        for raw in values:
            with self.subTest(raw=raw[:20]), self.assertRaises(p.AuthError):
                p.cbor_decode(raw)
        with self.assertRaises(p.AuthError):
            verify_create(registration(cose=b'\xa2\x01\x01\x01\x02'))

    def test_malformed_stored_record_rejected(self):
        for change in ({'sign_count': True}, {'sign_count': -1}, {'sign_count': 2**32}, {'public_key': '00'},
                       {'aaguid': 0}, {'backup_eligible': 1}, {'backup_state': True}, {'unknown': 1}):
            with self.subTest(change=change), self.assertRaises(p.AuthError):
                verify_get(self.asserted, dict(self.record, **change))

    def test_unavailable_crypto_is_distinct_from_definite_rejection(self):
        with patch.object(p.subprocess, 'run', side_effect=OSError('fixture unavailable')):
            with self.assertRaises(p.AuthUnavailable):
                verify_get(self.asserted, self.record)


if __name__ == '__main__':
    unittest.main()

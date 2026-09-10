"""Native authenticator boundary tests. Public software fixture, not hardware UV."""
from contextlib import closing
import copy
import json
import os
from pathlib import Path
import socket
import sqlite3
import struct
import subprocess
import sys
import tempfile
import time
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT / 'src'), str(ROOT / 'os')]
from wallet_auth import daemon as d, protocol as p

DEVICE = 'fixture-rock-arm64-001'
CHALLENGE = p.b64encode(bytes(range(32)))
USER = p.b64encode(b'public-native-test-account')


def options(credential=None):
    common = {'schema_version': 1, 'device_ref': DEVICE}
    if credential:
        return {**common, 'purpose': 'wallet.atm.issue', 'publicKey': {
            'challenge': CHALLENGE, 'rpId': p.RP_ID, 'allowCredentials': [
                {'type': 'public-key', 'id': credential['id']}],
            'userVerification': 'required', 'timeout': 120000}}
    return {**common, 'purpose': 'wallet.enroll', 'publicKey': {
        'challenge': CHALLENGE, 'rp': {'id': p.RP_ID, 'name': 'Rock Wallet'},
        'user': {'id': USER, 'name': 'Native test', 'displayName': 'Native test'},
        'pubKeyCredParams': [{'type': 'public-key', 'alg': -8}],
        'authenticatorSelection': {'residentKey': 'required', 'userVerification': 'required'},
        'attestation': 'direct', 'timeout': 120000, 'excludeCredentials': []}}


class Wire:
    """Handler frame seam; SO_PEERCRED bytes are explicit test inputs."""
    def __init__(self, data, uid=1000):
        self.data, self.uid, self.sent = data, uid, b''
    def getsockopt(self, *_): return struct.pack('3i', 123, self.uid, 1000)
    def recv(self, size):
        value, self.data = self.data[:size], self.data[size:]
        return value
    def settimeout(self, _): pass
    def sendall(self, raw): self.sent += raw
    def shutdown(self, _): pass


class NativeAuthenticatorTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.state = Path(self.temp.name) / 'auth'
        self.service = d.Service(self.state, DEVICE)
        self.addCleanup(lambda: self.service.close())

    def request(self, credential=None, key='native-create', pin='0000'):
        return {'v': 1, 'op': 'auth.get' if credential else 'auth.create',
                'key': key, 'options': options(credential), 'pin': pin}

    def invoke(self, request, uid=1000):
        return self.service.dispatch(request, peer_uid=uid)

    def rows(self):
        with closing(sqlite3.connect(self.state / 'authenticator.sqlite3')) as db:
            return db.execute('SELECT * FROM requests ORDER BY request_key').fetchall()

    def handle(self, data, uid=1000):
        wire = Wire(data, uid)
        server = type('TestServer', (), {'service': self.service})()
        with patch.object(socket, 'SO_PEERCRED', getattr(socket, 'SO_PEERCRED', 17), create=True):
            d.Handler(wire, '', server)
        return json.loads(wire.sent)

    def test_actual_crypto_create_assertion_and_restart_same_identity(self):
        created = self.invoke(self.request())['credential']
        record = p.verify_registration(created, challenge=CHALLENGE, rp_id=p.RP_ID, origin=p.ORIGIN)
        request = self.request(created, key='native-assertion')
        assertion = self.invoke(request)['credential']
        self.assertEqual(p.verify_assertion(assertion, challenge=CHALLENGE, rp_id=p.RP_ID,
            origin=p.ORIGIN, record=record, user_handle=USER)['sign_count'], 1)
        before = self.rows()
        self.service.close()
        self.service = d.Service(self.state, DEVICE)
        self.assertEqual(self.invoke(request)['credential'], assertion)
        self.assertEqual(self.rows(), before)
        self.assertNotIn('"pin"', json.dumps(before))

    def test_only_native_owner_can_create_read_or_replay(self):
        self.invoke(self.request())
        before = self.rows()
        for uid in (0, 1001, 1002, 1003, 1004, True):
            for request in (self.request(), {'v': 1, 'op': 'auth.status'}):
                with self.subTest(uid=uid), self.assertRaises(PermissionError): self.invoke(request, uid)
        self.assertEqual(before, self.rows())

    def test_wrong_pin_initial_and_replay_never_changes_state(self):
        for create_first in (False, True):
            if create_first: self.invoke(self.request())
            before = self.rows()
            for pin in ('1234', '', '００００', 0, None):
                with self.subTest(pin=pin), self.assertRaises(p.AuthError): self.invoke(self.request(pin=pin))
                self.assertEqual(before, self.rows())

    def test_strict_fields_fixed_options_and_input_limit(self):
        changes = [lambda r: r.update(v=True), lambda r: r.update(command='sign'),
            lambda r: r.update(op='sign'), lambda r: r.update(key='x' * 129),
            lambda r: r['options'].update(device_ref='fixture-other'),
            lambda r: r['options']['publicKey']['rp'].update(id='other.test'),
            lambda r: r['options']['publicKey']['user'].update(name='x' * d.MAX_FRAME)]
        for change in changes:
            request = self.request(); change(request)
            with self.assertRaises(p.AuthError): self.invoke(request)
        self.assertEqual(self.rows(), [])

    def test_expired_deadline_does_not_sign(self):
        with self.assertRaises(p.AuthUnavailable):
            self.service.dispatch(self.request(), peer_uid=1000, deadline=time.monotonic() - 1)
        self.assertEqual(self.rows(), [])

    def test_wire_duplicate_json_second_frame_oversize_and_unauthorized(self):
        for raw in (b'{"v":1,"v":1,"op":"auth.status"}\n', b'{}\n{}\n',
                    b'x' * (d.MAX_FRAME + 1), b'{"v":1'):
            result = self.handle(raw)
            self.assertFalse(result['ok']); self.assertEqual(result['code'], 'rejected')
        self.assertEqual(self.handle(b'{}\n', 1001)['code'], 'unauthorized')
        self.assertEqual(self.rows(), [])

    def test_wire_success_no_pin_response_or_persistence(self):
        request = self.request()
        result = self.handle(p.json_bytes(request) + b'\n')
        self.assertTrue(result['ok']); self.assertFalse(result['metadata']['hardware_backed'])
        self.assertNotIn('"pin"', json.dumps(result)); self.assertNotIn('"pin"', json.dumps(self.rows()))

    def test_wire_unknown_sanitized_and_request_pin_removed(self):
        request = self.request()
        with patch.object(d, 'json_decode', return_value=request), patch.object(
                self.service, 'dispatch', side_effect=OSError('sensitive PIN or options')):
            result = self.handle(b'{}\n')
        self.assertEqual(result['code'], 'unavailable')
        self.assertNotIn('pin', request); self.assertNotIn('sensitive', json.dumps(result))

    def test_protected_binding_rejects_extra_token_symlink_hardlink_or_writable(self):
        file = Path(self.temp.name) / 'device.json'
        body = {'schema_version': 1, 'kind': 'public-software-test-authenticator', 'device_ref': DEVICE}
        file.write_text(json.dumps(body)); file.chmod(0o444)
        self.assertEqual(d.read_binding(file), DEVICE)
        alias = file.with_name('alias'); alias.symlink_to(file)
        with self.assertRaises(OSError): d.read_binding(alias)
        alias.unlink(); os.link(file, alias)
        with self.assertRaises(p.AuthError): d.read_binding(file)
        alias.unlink(); file.chmod(0o666)
        with self.assertRaises(p.AuthError): d.read_binding(file)
        file.write_text(json.dumps({**body, 'token': 'PUBLIC-REJECTED'})); file.chmod(0o444)
        with self.assertRaises(p.AuthError): d.read_binding(file)

    @unittest.skipUnless(sys.platform == 'linux', 'actual Linux kernel filter only')
    def test_kernel_filter_blocks_network_and_survives_crypto_child(self):
        code = r'''
import ctypes, errno, socket, tempfile
from pathlib import Path
from wallet_auth import daemon as d
from test_wallet_auth_native import options
assert ctypes.CDLL(None).prctl(38,1,0,0,0)==0
d.restrict_network()
for family in (socket.AF_INET,socket.AF_INET6,socket.AF_NETLINK,socket.AF_PACKET):
    try: socket.socket(family,socket.SOCK_STREAM)
    except OSError as exc: assert exc.errno == errno.EPERM
    else: raise AssertionError('network family allowed')
left,right=socket.socketpair(); left.close(); right.close()
try: socket.socketpair(socket.AF_INET,socket.SOCK_STREAM)
except OSError as exc: assert exc.errno == errno.EPERM
else: raise AssertionError('network socketpair allowed')
with tempfile.TemporaryDirectory() as temporary:
    service=d.Service(Path(temporary)/'state','fixture-rock-arm64-001')
    try: assert service.dispatch({'v':1,'op':'auth.create','key':'kernel-filter','options':options(),'pin':'0000'},peer_uid=1000)['ok']
    finally: service.close()
print('PASS kernel filter and actual OpenSSL child')
'''
        env = {**os.environ, 'PYTHONDONTWRITEBYTECODE': '1',
               'PYTHONPATH': os.pathsep.join(str(ROOT / part) for part in ('src', 'os', 'tests'))}
        result = subprocess.run([sys.executable, '-B', '-c', code], env=env,
                                capture_output=True, text=True, timeout=20)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('PASS kernel filter', result.stdout)


if __name__ == '__main__': unittest.main()

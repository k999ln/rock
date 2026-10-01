"""Actual loopback TLS revocation admission, using existing public fixture keys."""
from concurrent.futures import ThreadPoolExecutor
import hashlib
import http.client
import json
from pathlib import Path
import ssl
import tempfile
import threading
import unittest
from unittest.mock import patch

from blackberryrock.packages import PUBLIC_TEST_KEY, TEST_PUBLISHER, canonical
from blackberryrock.sdk import sign_development, starter
from registry.client import RegistryClient
from registry.common import RegistryError, verify_index
from registry.server import RegistryServer, RegistryStore

FIXTURES = Path(__file__).resolve().parents[1] / 'fixtures'
CA = FIXTURES / 'development-ca.pem'
KEY = FIXTURES / 'PUBLIC-FIXTURE-KEY.pem'
ALICE = (FIXTURES / 'PUBLIC-AUTHOR-TOKEN.txt').read_text().strip()
BOB = 'PUBLIC-OTHER-REGISTRY-AUTHOR-NOT-A-SECRET'
OTHER_PUBLISHER = 'org.other.development'
ID = 'org.rockstar.revoked-get'


class RevokedPackageGetTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='rock-revoked-get-')
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.authors_file = self.root / 'approved-authors.json'
        self.policy = json.loads((FIXTURES / 'approved-authors.json').read_text())
        self.policy['publishers'][OTHER_PUBLISHER] = PUBLIC_TEST_KEY
        self.policy['authors']['other-author'] = {
            'token_sha256': hashlib.sha256(BOB.encode()).hexdigest(), 'publishers': [OTHER_PUBLISHER]}
        self.authors_file.write_bytes(canonical(self.policy))
        self.context = ssl.create_default_context(cafile=str(CA))
        self.server = self.store = self.thread = None
        self.addCleanup(self.stop)
        self.start()
        self.packages = {}
        for name, tool_id, version, publisher, token in (
            ('v1', ID, '1.0.0', TEST_PUBLISHER, ALICE),
            ('v2', ID, '1.1.0', TEST_PUBLISHER, ALICE),
            ('sibling', 'org.rockstar.other-get', '1.0.0', TEST_PUBLISHER, ALICE),
            ('foreign', 'org.other.revoked-get', '1.0.0', OTHER_PUBLISHER, BOB),
        ):
            # Reuse the existing published development signing key. This is
            # a second public fixture principal, never a production identity.
            with patch('blackberryrock.sdk.TEST_PUBLISHER', publisher):
                signed = sign_development(starter(tool_id=tool_id, version=version))
            raw = canonical(signed)
            digest = hashlib.sha256(raw).hexdigest()
            status, receipt, _ = self.request('POST', '/v1/publish', {'package': signed}, token, 'publish-' + name)
            self.assertEqual(status, 200)
            self.packages[name] = {'raw': raw, 'hash': digest, 'receipt': receipt, 'signed': signed, 'token': token}

    def start(self, port=0):
        self.store = RegistryStore(self.root / 'state', self.authors_file)
        self.server = RegistryServer(('127.0.0.1', port), self.store, CA, KEY)
        self.thread = threading.Thread(target=self.server.serve_forever, kwargs={'poll_interval': .01})
        self.thread.start()
        self.port = self.server.server_port
        self.origin = 'https://127.0.0.1:' + str(self.port)

    def stop(self):
        if self.server is not None:
            self.server.shutdown()
            self.server.server_close()
            self.thread.join(3)
            self.assertFalse(self.thread.is_alive())
            self.server = None
        if self.store is not None:
            self.store.close()
            self.store = None

    def request(self, method, path, body=None, token=None, key=None):
        headers = {}
        if body is not None:
            headers['Content-Type'] = 'application/json'
        if token is not None:
            headers['Authorization'] = 'Bearer ' + token
        if key is not None:
            headers['Idempotency-Key'] = key
        connection = http.client.HTTPSConnection('127.0.0.1', self.port, context=self.context, timeout=4)
        try:
            connection.request(method, path, body=canonical(body) if body is not None else None, headers=headers)
            response = connection.getresponse()
            raw = response.read(256 * 1024)
            self.assertEqual(len(raw), int(response.getheader('Content-Length')))
            self.assertEqual(response.getheader('Cache-Control'), 'no-store')
            return response.status, raw, dict(response.getheaders())
        finally:
            connection.close()

    def get(self, name):
        return self.request('GET', '/packages/' + self.packages[name]['hash'] + '.rock.json')

    def revoke(self, subject, key, token=ALICE):
        return self.request('POST', '/v1/revoke', {'subject': subject}, token, key)

    def readable(self, *names):
        for name in names:
            with self.subTest(name=name):
                status, raw, _ = self.get(name)
                self.assertEqual(status, 200)
                self.assertEqual(raw, self.packages[name]['raw'])

    def denied(self, *names):
        for name in names:
            with self.subTest(name=name):
                status, raw, _ = self.get(name)
                self.assertEqual(status, 404)
                self.assertEqual(json.loads(raw), {'error': 'not found'})
                self.assertNotIn(self.packages[name]['raw'], raw)

    def test_version_get_denied_without_deleting_bytes_index_or_receipts(self):
        self.readable('v1', 'v2', 'sibling', 'foreign')
        before = json.loads(self.request('GET', '/index.json')[1])
        subject = ID + '@1.0.0'
        status, receipt, _ = self.revoke(subject, 'revoke-v1')
        self.assertEqual(status, 200)
        self.assertEqual(self.revoke(subject, 'revoke-v1')[:2], (200, receipt))
        self.denied('v1')
        self.readable('v2', 'sibling', 'foreign')
        index = json.loads(self.request('GET', '/index.json')[1])
        verify_index(index, publishers=self.policy['publishers'])
        self.assertEqual(index['packages'], before['packages'])
        self.assertEqual(index['revocations'], [subject])
        self.assertGreater(index['revision'], before['revision'])
        # Historical publication replay remains the original immutable receipt;
        # it does not restore network distribution of the revoked artifact.
        package = self.packages['v1']
        replay = self.request('POST', '/v1/publish', {'package': package['signed']}, ALICE, 'publish-v1')
        self.assertEqual(replay[:2], (200, package['receipt']))
        self.denied('v1')
        with self.store.mutex:
            stored = self.store.connection.execute('SELECT raw FROM packages WHERE hash=?', (package['hash'],)).fetchone()[0]
        self.assertEqual(bytes(stored), package['raw'])
        self.assertEqual(self.request('GET', '/packages/' + '0' * 64 + '.rock.json')[0], 404)

    def test_publisher_get_denial_and_unrelated_publisher_continue_after_restart(self):
        status, receipt, _ = self.revoke(TEST_PUBLISHER, 'revoke-publisher')
        self.assertEqual(status, 200)
        self.denied('v1', 'v2', 'sibling')
        self.readable('foreign')
        port = self.port
        self.stop()
        self.start(port)
        self.denied('v1', 'v2', 'sibling')
        self.readable('foreign')
        self.assertEqual(self.revoke(TEST_PUBLISHER, 'revoke-publisher')[:2], (200, receipt))
        index = json.loads(self.request('GET', '/index.json')[1])
        verify_index(index, publishers=self.policy['publishers'])
        self.assertEqual(index['revocations'], [TEST_PUBLISHER])
        self.assertEqual(len(index['packages']), 4)

    def test_unauthorized_revoke_cannot_stop_any_artifact(self):
        initial = self.request('GET', '/index.json')[1]
        for token, subjects in ((None, (ID + '@1.0.0',)), ('PUBLIC-INVALID-AUTHOR-TOKEN', (TEST_PUBLISHER,)),
                                (BOB, (ID + '@1.0.0', TEST_PUBLISHER)),
                                (ALICE, ('org.other.revoked-get@1.0.0', OTHER_PUBLISHER))):
            for subject in subjects:
                with self.subTest(token_kind='none' if token is None else 'public-fixture', subject=subject):
                    self.assertEqual(self.revoke(subject, 'unauthorized-attempt', token)[0], 401)
        self.assertEqual(self.request('GET', '/index.json')[1], initial)
        self.readable('v1', 'v2', 'sibling', 'foreign')

    def test_version_restart_and_previously_downloaded_cache_remain_revoked(self):
        client = RegistryClient(self.origin, CA, self.root / 'client', publisher_trust=self.policy['publishers'])
        client.refresh()
        self.assertEqual(canonical(client.download(ID, '1.0.0')), self.packages['v1']['raw'])
        status, receipt, _ = self.revoke(ID + '@1.0.0', 'revoke-cached-version')
        self.assertEqual(status, 200)
        port = self.port
        self.stop()
        self.start(port)
        self.denied('v1')
        self.readable('v2', 'sibling', 'foreign')
        self.assertEqual(self.revoke(ID + '@1.0.0', 'revoke-cached-version')[:2], (200, receipt))
        client.refresh()
        with self.assertRaisesRegex(RegistryError, 'revoked'):
            client.download(ID, '1.0.0')
        offline = RegistryClient(self.origin, CA, self.root / 'client', publisher_trust=self.policy['publishers'])
        with patch.object(offline.transport, 'request', side_effect=AssertionError('known revocation must reject before network')):
            with self.assertRaisesRegex(RegistryError, 'revoked'):
                offline.download(ID, '1.0.0')

    def test_get_waiting_for_revoke_commit_is_denied_over_tls(self):
        signing, finish_signing, get_entered = threading.Event(), threading.Event(), threading.Event()
        original_index, original_get = self.store._new_index, self.store.package

        def held_index(revision):
            signing.set()
            if not finish_signing.wait(3):
                raise RuntimeError('test synchronization timeout')
            return original_index(revision)

        def observed_get(package_hash):
            get_entered.set()
            return original_get(package_hash)

        with patch.object(self.store, '_new_index', side_effect=held_index), \
                patch.object(self.store, 'package', side_effect=observed_get), ThreadPoolExecutor(max_workers=2) as pool:
            revoke_future = pool.submit(self.revoke, ID + '@1.0.0', 'concurrent-revoke')
            try:
                self.assertTrue(signing.wait(3))
                get_future = pool.submit(self.get, 'v1')
                self.assertTrue(get_entered.wait(3))
                self.assertFalse(get_future.done())
            finally:
                finish_signing.set()
            self.assertEqual(revoke_future.result(timeout=4)[0], 200)
            status, raw, _ = get_future.result(timeout=4)
            self.assertEqual(status, 404)
            self.assertEqual(json.loads(raw), {'error': 'not found'})


if __name__ == '__main__':
    unittest.main()

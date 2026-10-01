"""Exact-byte verification reuse must retain file, trust and expiry checks."""
import json
import os
from pathlib import Path
import sys
import tempfile
import time
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'os'))
from blackberryrock.packages import TEST_PUBLISHER, canonical
from registry.client import RegistryClient
from registry.common import RegistryError, verify_index
from registry.server import RegistryStore


class RegistryVerificationCacheTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        fixtures = ROOT / 'os/registry/fixtures'
        self.server = RegistryStore(self.root / 'server', fixtures / 'approved-authors.json')
        package = json.loads((ROOT / 'examples/registry/org.rockstar.proposal-draft--1.0.0.rock.json').read_bytes())
        self.server.publish('development-author', 'publish', {'package': package})
        self.client = RegistryClient('https://localhost:9443', fixtures / 'development-ca.pem', self.root / 'cache')
        with patch.object(self.client.transport, 'request', return_value=self.server.index()):
            self.client.refresh()

    def tearDown(self):
        self.server.close()
        self.tmp.cleanup()

    def test_identical_file_bytes_verify_once_and_callers_cannot_modify_cached_state(self):
        with patch('registry.client.verify_index', wraps=verify_index) as verifier:
            catalog = self.client.catalog()
            catalog[0]['manifest']['name'] = 'caller mutation'
            state = self.client.verified_state()
            state['revocations'].append(TEST_PUBLISHER)
            self.assertEqual([], self.client.revocations())
            self.assertNotEqual('caller mutation', self.client.catalog()[0]['manifest']['name'])
            self.assertEqual(1, verifier.call_count)

    def test_expiry_is_checked_after_verified_bytes_are_cached(self):
        state = self.client.verified_state()
        self.client.clock = lambda: state['expires_at']
        self.assertFalse(self.client.verified_state()['fresh'])
        self.assertEqual(1, len(self.client.catalog()))
        with self.assertRaisesRegex(RegistryError, 'expired'):
            self.client.download('org.rockstar.proposal-draft', '1.0.0')

    def test_same_length_same_mtime_tampering_still_reverifies_and_rejects(self):
        self.client.catalog()
        path = self.client.state_file
        original, before = path.read_bytes(), path.stat()
        state = json.loads(original)
        signature = state['index']['signature']
        state['index']['signature'] = ('0' if signature[0] != '0' else '1') + signature[1:]
        tampered = canonical(state)
        self.assertEqual(len(original), len(tampered))
        path.write_bytes(tampered)
        os.utime(path, ns=(before.st_atime_ns, before.st_mtime_ns))
        with self.assertRaisesRegex(RegistryError, 'signature'):
            self.client.catalog()

    def test_changed_trust_and_minimum_revision_invalidate_reuse(self):
        self.client.catalog()
        previous = dict(self.client.publisher_trust)
        self.client.publisher_trust.clear()
        with self.assertRaises(RegistryError):
            self.client.catalog()
        self.client.publisher_trust.update(previous)
        self.client.minimum_revision = self.client.verified_state()['revision'] + 1
        with self.assertRaisesRegex(RegistryError, 'revision'):
            self.client.revocations()

    def test_new_signed_revocations_replace_cached_state_and_survive_expiry(self):
        self.client.catalog()
        self.server.revoke('development-author', 'revoke', {'subject': TEST_PUBLISHER})
        with patch.object(self.client.transport, 'request', return_value=self.server.index()):
            self.client.refresh()
        self.assertEqual([TEST_PUBLISHER], self.client.revocations())
        self.assertEqual([], self.client.catalog())
        expiry = self.client.verified_state()['expires_at']
        self.client.clock = lambda: expiry + 1
        self.assertEqual([TEST_PUBLISHER], self.client.revocations())
        self.assertFalse(self.client.verified_state()['fresh'])

    def test_missing_or_symlink_file_cannot_reuse_previously_verified_bytes(self):
        self.client.catalog()
        original = self.client.state_file.read_bytes()
        self.client.state_file.unlink()
        self.assertEqual([], self.client.catalog())
        other = self.root / 'other-index.json'
        other.write_bytes(original)
        self.client.state_file.symlink_to(other)
        with self.assertRaises(OSError):
            self.client.catalog()


if __name__ == '__main__':
    unittest.main()

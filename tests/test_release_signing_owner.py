"""Owner-entry boundaries. Public fixture keys only; no actual owner approval."""
import base64
import hashlib
import json
import os
from pathlib import Path
import shutil
import sys
import time
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import release_signing as signing
import release_signing_owner as owner
import test_release_signing as fixtures


class OwnerEntryTests(unittest.TestCase):
    def setUp(self):
        # Reuse only the existing fixture builder; do not inherit/run its tests.
        self.fixture = fixtures.SigningTests('test_mechanics_roundtrip_and_unchanged_acceptance')
        self.fixture.setUp(); self.addCleanup(self.fixture.doCleanups)
        self.root = self.fixture.root.resolve()
        self.directory = self.fixture.input.resolve()
        self.trust = self.fixture.trust_path.resolve()
        self.key = self.root / 'public-fixture-key.der'
        self.approval = self.root / 'approval.json'
        self.output = self.root / 'owner-output'
        self.env = patch.dict(os.environ, {}, clear=False); self.env.start(); self.addCleanup(self.env.stop)
        os.environ.pop(owner.KEY_ENV, None)
        self.denylist = patch.object(signing, 'RFC8032_KEYS', frozenset())
        self.denylist.start(); self.addCleanup(self.denylist.stop)
        # This denylist patch is test-process-only. Neither CLI has a bypass flag.
        owner.prepare(self.directory, self.fixture.source, self.fixture.index_pin, self.trust,
                      self.fixture.trust_pin, self.fixture.fingerprint, 'public-fixture-owner', self.approval, self.output)

    def approve(self, change=None):
        value = json.loads(self.approval.read_bytes())
        value.update(decision='APPROVED', approved_at=int(time.time()))
        value['attestations'] = {key: True for key in owner.ATTESTATIONS}
        if change: change(value)
        raw = signing.canonical(value) + b'\n'; self.approval.write_bytes(raw)
        return hashlib.sha256(raw).hexdigest()

    def invoke(self, pin):
        return owner.sign_owner(self.directory, self.trust, self.approval, pin, self.key, self.output)

    def test_preparation_never_self_approves_or_reads_key(self):
        raw = self.approval.read_bytes()
        self.assertEqual(json.loads(raw)['decision'], 'PENDING_OWNER_APPROVAL')
        with patch.object(owner, 'read_external_key') as read:
            with self.assertRaisesRegex(ValueError, 'explicit owner approval'): self.invoke(hashlib.sha256(raw).hexdigest())
            read.assert_not_called()
        self.assertFalse(self.output.exists())

    def test_approval_pin_expiry_attestations_and_target_guard_key_access(self):
        original = self.approval.read_bytes()
        mutations = [lambda v: v.update(expires_at=v['prepared_at']),
                     lambda v: v['attestations'].update(external_key_custody_accepted=False),
                     lambda v: v['inputs'].update(source_commit='b' * 40),
                     lambda v: v['inputs']['signer_sha256'].update({'release_signing.py': '0' * 64}),
                     lambda v: v.update(output_directory=str(self.root / 'another-attempt'))]
        for index, mutation in enumerate(mutations):
            self.approval.write_bytes(original); pin = self.approve(mutation)
            with self.subTest(index=index), patch.object(owner, 'read_external_key') as read:
                with self.assertRaises(ValueError): self.invoke(pin)
                read.assert_not_called(); self.assertFalse(self.output.exists())
        self.approval.write_bytes(original); self.approve()
        with patch.object(owner, 'read_external_key') as read:
            with self.assertRaisesRegex(ValueError, 'approval pin'): self.invoke('0' * 64)
            read.assert_not_called()

    def test_changed_archive_rejected_before_output_reservation_or_key_read(self):
        pin = self.approve(); path = self.directory / self.fixture.manifest['archive']['name']
        path.write_bytes(path.read_bytes() + b'changed')
        with patch.object(owner, 'read_external_key') as read:
            with self.assertRaisesRegex(ValueError, 'asset hash or size'): self.invoke(pin)
            read.assert_not_called()
        self.assertFalse(self.output.exists())

    def test_racing_existing_output_is_preserved_without_key_read(self):
        pin = self.approve(); real_mkdir = Path.mkdir
        def racing(path, *args, **kwargs):
            if path == self.output:
                real_mkdir(path, mode=0o700)
                (path / 'existing-owner-file').write_bytes(b'keep')
            return real_mkdir(path, *args, **kwargs)
        with patch.object(Path, 'mkdir', racing), patch.object(owner, 'read_external_key') as read:
            with self.assertRaises(FileExistsError): self.invoke(pin)
            read.assert_not_called()
        self.assertEqual((self.output / 'existing-owner-file').read_bytes(), b'keep')
        self.assertEqual([p.name for p in self.output.iterdir()], ['existing-owner-file'])

    def test_insecure_external_key_fails_and_consumes_attempt(self):
        pin = self.approve(); self.key.chmod(0o644)
        original = self.key.read_bytes()
        with self.assertRaisesRegex(ValueError, 'owner-private regular file'): self.invoke(pin)
        self.assertEqual(self.key.read_bytes(), original)
        self.assertTrue((self.output / 'ATTEMPT.json').exists())
        self.assertFalse((self.output / 'OWNER-SIGNING-RESULT.json').exists())
        self.assertNotIn(owner.KEY_ENV, os.environ)
        # The same approval/output cannot silently resume after a failure.
        with self.assertRaisesRegex(ValueError, 'attempt already exists'): self.invoke(pin)

    def test_same_core_signatures_verify_and_secret_is_not_in_child_environment(self):
        pin = self.approve(); original = self.key.read_bytes(); real_openssl = signing.openssl
        def checked_openssl(*args):
            self.assertNotIn(owner.KEY_ENV, os.environ)
            return real_openssl(*args)
        with patch.object(signing, 'openssl', checked_openssl): result = self.invoke(pin)
        self.assertEqual(result['status'], 'SIGNED_NOT_LAUNCH_ACCEPTED_FINAL_VERIFY_REQUIRED')
        receipt = json.loads((self.output / 'OWNER-SIGNING-RESULT.json').read_bytes())
        self.assertEqual(receipt['signer_result']['legal_status'], 'NOT_CLEARED')
        self.assertEqual(receipt['signer_result']['acceptance_status'], 'CANDIDATE')
        self.assertEqual(receipt['isolation'], 'OWNER_ATTESTED_NOT_SOFTWARE_PROVEN')
        self.assertFalse(receipt['independent_human_approval'])
        self.assertEqual(self.key.read_bytes(), original)
        self.assertFalse(list(self.root.glob('rock-protected-sign-*')))
        self.assertNotIn(owner.KEY_ENV, os.environ)
        self.assertFalse((self.root / 'executed').exists())
        self.assertNotIn(base64.b64encode(original), (self.output / 'OWNER-SIGNING-RESULT.json').read_bytes())
        final = self.root / 'final'; final.mkdir()
        for path in self.directory.iterdir():
            if path.name not in ('candidate-index.json', 'candidate-manifest.json'): shutil.copyfile(path, final / path.name)
        for path in (self.output / 'signed-metadata').iterdir(): shutil.copyfile(path, final / path.name)
        manifest_pin = signing.file_record(final / 'release-manifest.json')['sha256']
        proof = signing.verify(final, self.trust, self.fixture.trust_pin, self.fixture.fingerprint, manifest_pin, self.fixture.source)
        self.assertEqual(proof['status'], 'AUTHENTICATED_NOT_LAUNCH_ACCEPTED')

    def test_existing_signer_wrong_key_failure_cleans_temp_and_leaves_no_success_receipt(self):
        pin = self.approve()
        self.key.write_bytes(signing.PRIVATE_PREFIX + bytes.fromhex(fixtures.PUBLIC_FIXTURE_SEEDS[1]))
        os.environ['RUNNER_TEMP'] = str(self.root / 'previous-setting')
        with self.assertRaisesRegex(ValueError, 'fingerprint'): self.invoke(pin)
        self.assertEqual(os.environ['RUNNER_TEMP'], str(self.root / 'previous-setting'))
        self.assertNotIn(owner.KEY_ENV, os.environ)
        self.assertFalse(list(self.root.glob('rock-protected-sign-*')))
        self.assertTrue(self.key.exists())
        self.assertFalse((self.output / 'signed-metadata').exists())
        self.assertFalse((self.output / 'OWNER-SIGNING-RESULT.json').exists())


if __name__ == '__main__': unittest.main(verbosity=2)

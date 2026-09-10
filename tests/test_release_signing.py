"""Public RFC8032 fixtures only; successful mechanics never certify production keys."""
import base64
import copy
import gzip
import hashlib
import io
import json
import os
from pathlib import Path
import sys
import tarfile
import tempfile
import time
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import release_signing as signing
import release_signing_preflight as preflight

PUBLIC_FIXTURE_SEEDS = (
    '9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60',
    '4ccd089b28ff96da9db6c346ec114e0f5b8a319f35aba624da8cf6ed4fb8a6fb',
)


class SigningTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.input = self.root / 'candidate'
        self.input.mkdir()
        self.output = self.root / 'signed'
        self.source = 'a' * 40
        self.now = int(time.time())
        self.private = signing.PRIVATE_PREFIX + bytes.fromhex(PUBLIC_FIXTURE_SEEDS[0])
        key = self.root / 'public-fixture-key.der'
        signing.write_private(key, self.private)
        self.assertEqual(key.stat().st_mode & 0o777, 0o600)
        self.public = signing.openssl('pkey', '-inform', 'DER', '-in', key, '-pubout', '-outform', 'DER')
        self.fingerprint = hashlib.sha256(self.public).hexdigest()
        self.trust_path = self.root / 'trust.json'
        self.trust = {'schema': 'rock-release-trust/1', 'generation': 1, 'not_before': self.now - 100,
                      'expires_at': self.now + 300, 'identities': [{'fingerprint': self.fingerprint,
                      'public_der_hex': self.public.hex(), 'status': 'active', 'not_before': self.now - 100, 'expires_at': self.now + 300}]}
        self.write_trust()
        self.make_candidate()

    def write_trust(self):
        self.trust_path.write_bytes(signing.canonical(self.trust) + b'\n')
        self.trust_pin = signing.file_record(self.trust_path)['sha256']

    def make_candidate(self, bad_link=False):
        name = 'rockstaros-1.0.0-fixture-macos-arm64.tar.gz'
        files = {}
        with tarfile.open(self.input / name, 'w:gz') as archive:
            for member_name in ['images/Image', 'images/rootfs.ext4', 'images/stage0.cpio.gz', 'native/untrusted.py']:
                raw = (('from pathlib import Path\nPath(' + repr(str(self.root / 'executed')) + ").write_text('unexpected')\n").encode()
                       if member_name.endswith('.py') else b'not executable fixture bytes')
                member = tarfile.TarInfo(member_name)
                member.mode = 0o444
                member.size = len(raw)
                if bad_link and member_name == 'native/untrusted.py':
                    member.type = tarfile.SYMTYPE
                    member.linkname = '/tmp/should-never-be-created'
                archive.addfile(member, io.BytesIO(raw))
                files[member_name] = {'sha256': hashlib.sha256(raw).hexdigest(), 'bytes': len(raw), 'mode': 0o444}
        self.manifest = {'schema': 'rockstaros-preview-release/2', 'product': 'RockstarOS 1.0 Developer Preview',
                         'version': '1.0.0-fixture', 'source_commit': self.source, 'host_tools_commit': self.source,
                         'host': {}, 'archive': {'name': name, **signing.file_record(self.input / name)},
                         'files': files, 'image_sha256': {x: files['images/' + x]['sha256'] for x in ('Image', 'rootfs.ext4', 'stage0.cpio.gz')},
                         'factory_sha256': 'c' * 64, 'boot': {'factory_sha256': 'c' * 64}, 'game': None,
                         'display': {}, 'trust': 'EXTERNAL_RELEASE_KEY', 'legal': {'status': 'NOT_CLEARED'}, 'acceptance': {'status': 'CANDIDATE'}}
        self.update_index()

    def update_index(self):
        (self.input / 'candidate-manifest.json').write_bytes(signing.canonical(self.manifest) + b'\n')
        self.index = {'schema': 'rock-release-candidate-inputs/1', 'source_commit': self.source,
                      'host_tools_commit': self.source, 'version': '1.0.0-fixture', 'issued_at': self.now - 1,
                      'assets': {p.name: signing.file_record(p) for p in self.input.iterdir() if p.name != 'candidate-index.json'}}
        (self.input / 'candidate-index.json').write_bytes(signing.canonical(self.index) + b'\n')
        self.index_pin = signing.file_record(self.input / 'candidate-index.json')['sha256']

    def sign_fixture(self):
        # Only tests bypass the public-fixture denylist; no runtime flag exists.
        with patch.object(signing, 'RFC8032_KEYS', frozenset()), patch.dict(os.environ, {'ROCK_RELEASE_SIGNING_KEY_PKCS8_B64': base64.b64encode(self.private).decode()}):
            result = signing.sign(self.input, self.output, self.index_pin, self.trust_path, self.trust_pin, self.fingerprint, self.source)
        self.assertEqual(result['legal_status'], 'NOT_CLEARED')
        self.assertEqual(result['acceptance_status'], 'CANDIDATE')
        self.final = self.root / 'final'
        self.final.mkdir()
        for p in self.input.iterdir():
            if not p.name.startswith('candidate-'):
                (self.final / p.name).write_bytes(p.read_bytes())
        for p in self.output.iterdir():
            (self.final / p.name).write_bytes(p.read_bytes())
        self.manifest_pin = signing.file_record(self.final / 'release-manifest.json')['sha256']

    def verify_fixture(self, **changes):
        with patch.object(signing, 'RFC8032_KEYS', frozenset()):
            return signing.verify(self.final, self.trust_path, self.trust_pin,
                                  changes.get('fingerprint', self.fingerprint), changes.get('manifest_pin', self.manifest_pin),
                                  changes.get('source', self.source))

    def test_all_rfc_keys_rejected_without_override(self):
        for raw in signing.RFC8032_KEYS:
            public = signing.DER_PREFIX + raw
            with self.subTest(key=raw.hex()), self.assertRaisesRegex(ValueError, 'RFC8032'):
                signing.public_identity(public, hashlib.sha256(public).hexdigest())

    def test_mechanics_roundtrip_and_unchanged_acceptance(self):
        self.sign_fixture()
        self.assertEqual(self.verify_fixture()['status'], 'AUTHENTICATED_NOT_LAUNCH_ACCEPTED')
        self.assertFalse((self.root / 'executed').exists())

    def test_same_input_has_identical_signed_metadata(self):
        self.sign_fixture()
        second = self.root / 'second'
        with patch.object(signing, 'RFC8032_KEYS', frozenset()), patch.dict(os.environ, {'ROCK_RELEASE_SIGNING_KEY_PKCS8_B64': base64.b64encode(self.private).decode()}):
            signing.sign(self.input, second, self.index_pin, self.trust_path, self.trust_pin, self.fingerprint, self.source)
        self.assertEqual({p.name: p.read_bytes() for p in self.output.iterdir()}, {p.name: p.read_bytes() for p in second.iterdir()})

    def test_production_sign_refuses_public_fixture(self):
        with patch.dict(os.environ, {'ROCK_RELEASE_SIGNING_KEY_PKCS8_B64': base64.b64encode(self.private).decode()}):
            with self.assertRaisesRegex(ValueError, 'RFC8032'):
                signing.sign(self.input, self.output, self.index_pin, self.trust_path, self.trust_pin, self.fingerprint, self.source)
        self.assertFalse(self.output.exists())

    def test_asset_tamper_rejected(self):
        self.sign_fixture()
        path = self.final / self.manifest['archive']['name']
        path.write_bytes(path.read_bytes() + b'tamper')
        with self.assertRaisesRegex(ValueError, 'hash or size'):
            self.verify_fixture()

    def test_wrong_manifest_pin_rejected(self):
        self.sign_fixture()
        with self.assertRaisesRegex(ValueError, 'pin differs'):
            self.verify_fixture(manifest_pin='0' * 64)

    def test_wrong_fingerprint_rejected(self):
        self.sign_fixture()
        with self.assertRaisesRegex(ValueError, 'absent'):
            self.verify_fixture(fingerprint='0' * 64)

    def test_wrong_source_rejected(self):
        self.sign_fixture()
        with self.assertRaisesRegex(ValueError, 'pins differ'):
            self.verify_fixture(source='b' * 40)

    def test_changed_signature_rejected(self):
        self.sign_fixture()
        path = self.final / 'release-authentication.json'
        value = json.loads(path.read_text())
        value['signature'] = '0' * 128
        path.write_bytes(signing.canonical(value))
        with self.assertRaisesRegex(ValueError, 'cryptographic'):
            self.verify_fixture()

    def test_rotation_current_pin_accepts_active_old_identity(self):
        self.sign_fixture()
        self.trust['generation'] = 2
        self.trust['expires_at'] += 300
        self.write_trust()
        self.assertEqual(self.verify_fixture()['status'], 'AUTHENTICATED_NOT_LAUNCH_ACCEPTED')

    def test_revocation_current_pin_rejects_old_signature(self):
        self.sign_fixture()
        self.trust['generation'] = 2
        self.trust['identities'][0]['status'] = 'revoked'
        self.write_trust()
        with self.assertRaisesRegex(ValueError, 'revoked'):
            self.verify_fixture()

    def test_expired_identity_and_bundle(self):
        self.sign_fixture()
        for target in (self.trust, self.trust['identities'][0]):
            previous = target['expires_at']
            target['expires_at'] = self.now - 1
            self.write_trust()
            with self.assertRaisesRegex(ValueError, 'expired'):
                self.verify_fixture()
            target['expires_at'] = previous

    def test_test_trust_manifest_refused(self):
        self.manifest['trust'] = 'PUBLIC_RFC8032_DEVELOPMENT_ONLY'
        self.update_index()
        with self.assertRaisesRegex(ValueError, 'relabelled'):
            signing.candidate(self.input, self.index_pin, self.source, self.now)

    def test_candidate_pin_and_tar_link_rejected(self):
        with self.assertRaisesRegex(ValueError, 'pin differs'):
            signing.candidate(self.input, '0' * 64, self.source, self.now)
        self.make_candidate(bad_link=True)
        with self.assertRaisesRegex(ValueError, 'links rejected'):
            signing.candidate(self.input, self.index_pin, self.source, self.now)

    def test_pax_and_gnu_metadata_rejected_before_payload_allocation(self):
        for kind in (tarfile.PAX_FORMAT, tarfile.GNU_FORMAT):
            path = self.root / ('extended-' + str(kind) + '.tgz')
            with tarfile.open(path, 'w:gz', format=kind) as archive:
                member = tarfile.TarInfo('a' if kind == tarfile.PAX_FORMAT else 'a' * 1024)
                member.size = 1
                member.mode = 0o444
                if kind == tarfile.PAX_FORMAT:
                    member.pax_headers = {'comment': 'x' * (1024**2)}
                archive.addfile(member, io.BytesIO(b'a'))
            inventory = {'a': {'sha256': hashlib.sha256(b'a').hexdigest(), 'bytes': 1, 'mode': 0o444}}
            with self.subTest(kind=kind), self.assertRaisesRegex(ValueError, 'extensions'):
                signing.check_tar(path, inventory)

    def test_tar_trailer_bounded_and_gzip_consumed_to_eof(self):
        raw = io.BytesIO()
        with tarfile.open(fileobj=raw, mode='w', format=tarfile.USTAR_FORMAT) as archive:
            member = tarfile.TarInfo('a')
            member.size, member.mode = 1, 0o444
            archive.addfile(member, io.BytesIO(b'a'))
        inventory = {'a': {'sha256': hashlib.sha256(b'a').hexdigest(), 'bytes': 1, 'mode': 0o444}}
        for trailer in (b'not-zero', b'\0' * 20000):
            path = self.root / 'trailer.tgz'
            path.write_bytes(gzip.compress(raw.getvalue()) + gzip.compress(trailer))
            with self.subTest(trailer_bytes=len(trailer)), self.assertRaisesRegex(ValueError, 'trailer'):
                signing.check_tar(path, inventory)
        path.write_bytes(gzip.compress(raw.getvalue())[:-4])
        with self.assertRaises(EOFError):
            signing.check_tar(path, inventory)

    def test_duplicate_json_and_unexpected_file_rejected(self):
        with self.assertRaisesRegex(ValueError, 'duplicate'):
            signing.decode(b'{"a":1,"a":2}')
        (self.input / 'unexpected').write_text('not executed')
        with self.assertRaisesRegex(ValueError, 'extra or missing'):
            signing.candidate(self.input, self.index_pin, self.source, self.now)

    def test_symlink_and_hardlink_rejected(self):
        path = self.root / 'alias'
        path.symlink_to(self.input / 'candidate-manifest.json')
        with self.assertRaises(OSError):
            signing.file_record(path)
        path.unlink()
        os.link(self.input / 'candidate-manifest.json', path)
        with self.assertRaisesRegex(ValueError, 'unsafe'):
            signing.file_record(path)


class PolicyTests(unittest.TestCase):
    def fixture(self):
        policy = {'required_reviewers': [{'type': 'User', 'id': 17}]}
        environment = {'name': preflight.ENVIRONMENT,
            'protection_rules': [{'type': 'required_reviewers', 'prevent_self_review': True,
            'reviewers': [{'type': 'User', 'reviewer': {'id': 17}}]}],
            'deployment_branch_policy': {'protected_branches': False, 'custom_branch_policies': True}}
        branches = {'total_count': 1, 'branch_policies': [{'name': preflight.CONTROL, 'type': 'branch'}]}
        protection = {'enforce_admins': {'enabled': True}, 'allow_force_pushes': {'enabled': False},
            'allow_deletions': {'enabled': False}, 'lock_branch': {'enabled': True},
            'required_pull_request_reviews': {'required_approving_review_count': 1, 'dismiss_stale_reviews': True,
             'require_last_push_approval': True, 'bypass_pull_request_allowances': {'users': [], 'teams': [], 'apps': []}}}
        return environment, branches, protection, policy

    def test_strict_protection_policy_passes(self):
        preflight.validate_protection(*self.fixture())

    def test_unsafe_protection_policy_fails(self):
        mutations = [lambda e,b,p: e.update(name='other'),
            lambda e,b,p: e['protection_rules'][0].update(prevent_self_review=False),
            lambda e,b,p: e['protection_rules'][0].update(reviewers=[]),
            lambda e,b,p: b['branch_policies'][0].update(name='*'),
            lambda e,b,p: b['branch_policies'][0].update(type='tag'),
            lambda e,b,p: p['lock_branch'].update(enabled=False),
            lambda e,b,p: p['enforce_admins'].update(enabled=False),
            lambda e,b,p: p['allow_force_pushes'].update(enabled=True),
            lambda e,b,p: p['allow_deletions'].update(enabled=True),
            lambda e,b,p: p['required_pull_request_reviews'].update(require_last_push_approval=False),
            lambda e,b,p: p['required_pull_request_reviews']['bypass_pull_request_allowances'].update(users=[{'id':17}])]
        for i, change in enumerate(mutations):
            args = self.fixture()
            change(*args[:3])
            with self.subTest(mutation=i), self.assertRaises(ValueError):
                preflight.validate_protection(*args)

    def test_run_approval_enforces_independence_and_rejects_bypass_rerun(self):
        environment, _, _, policy = self.fixture()
        environment['id'] = 91
        run = {'event': 'workflow_dispatch', 'head_sha': 'a' * 40, 'head_branch': preflight.CONTROL, 'run_attempt': 1,
               'path': '.github/workflows/release-signing.yml', 'actor': {'id': 10}, 'triggering_actor': {'id': 10}}
        history = [{'state': 'approved', 'user': {'id': 17}, 'environments': [{'id': 91, 'name': preflight.ENVIRONMENT}]}]
        preflight.validate_approval(run, history, environment, policy, 'a' * 40)
        for suffix in ('@' + preflight.CONTROL, '@refs/heads/' + preflight.CONTROL):
            with self.subTest(suffix=suffix):
                preflight.validate_approval(dict(run, path=run['path'] + suffix), history, environment, policy, 'a' * 40)
        for change in [lambda r,h: h.clear(), lambda r,h: h[0]['user'].update(id=10),
                       lambda r,h: h[0]['user'].update(id=999), lambda r,h: h[0].update(state='rejected'),
                       lambda r,h: r.update(run_attempt=2), lambda r,h: h[0]['environments'][0].update(id=22),
                       lambda r,h: r.update(head_branch='main'), lambda r,h: r.update(path=run['path'] + '@main'),
                       lambda r,h: r['triggering_actor'].update(id=17), lambda r,h: h.append(copy.deepcopy(h[0]))]:
            changed_run, changed_history = copy.deepcopy(run), copy.deepcopy(history)
            change(changed_run, changed_history)
            with self.assertRaises(ValueError):
                preflight.validate_approval(changed_run, changed_history, environment, policy, 'a' * 40)

    def test_other_ref_rejected_before_api(self):
        with patch.dict(os.environ, {'GITHUB_REPOSITORY': 'k999ln/rock', 'GITHUB_REF': 'refs/pull/3/merge'}):
            with self.assertRaisesRegex(ValueError, 'wrong workflow'), patch.object(preflight, 'api') as api:
                preflight.preflight('a' * 40, Path('unused'))
            api.assert_not_called()


if __name__ == '__main__':
    unittest.main()

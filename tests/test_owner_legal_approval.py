"""Synthetic data only; never emits a real owner approval, key, or legal finding."""
import copy
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
import verify_owner_legal_approval as legal
import release_signing as signing
import test_prepare_release_candidate as fixture_data


class OwnerLegalApprovalTests(unittest.TestCase):
    def setUp(self):
        self.fixture = fixture_data.CandidatePreparationTests()
        self.fixture.setUp()
        self.addCleanup(self.fixture.doCleanups)
        self.root = self.fixture.root
        self.now = int(time.time())
        supplements = self.root / 'legal-materials'
        supplements.mkdir()
        names = {'license': 'LICENSE.fixture', 'license_scope': 'license-scope.fixture.json',
                 'notices': 'NOTICE.fixture', 'inventory': 'inventory.fixture.jsonl',
                 'corresponding_source': 'source.fixture.tar',
                 'redistribution_instructions': 'redistribution.fixture.txt', 'exceptions': 'exceptions.fixture.json'}
        for name in names.values():
            (supplements / name).write_bytes(('SYNTHETIC TEST MATERIAL ONLY: ' + name).encode())
        inventory = {'schema': 'rock-release-candidate-supplements/1',
            'source_commit': self.fixture.source, 'version': self.fixture.version,
            'assets': {name: signing.file_record(supplements / name) for name in names.values()}}
        receipt = supplements / 'candidate-supplements.json'
        receipt.write_bytes(signing.canonical(inventory))
        prepared = self.fixture.run_bridge(supplements_directory=supplements,
                                          supplements_pin=signing.file_record(receipt)['sha256'])
        self.directory = self.root / 'candidate'
        self.index_pin = prepared['candidate_index_sha256']
        self.index = signing.pinned(self.directory / 'candidate-index.json', self.index_pin)
        self.approval = {'schema': 'rock-owner-legal-approval/1', 'repository': legal.REPOSITORY,
            'authority_id': 'fixture-owner-only', 'decision': 'APPROVED',
            'scope': 'LEGAL_REDISTRIBUTION_OF_IDENTIFIED_BYTES_ONLY', 'not_before': self.now - 1,
            'expires_at': self.now + 300, 'source_commit': self.fixture.source,
            'host_tools_commit': self.fixture.source, 'version': self.fixture.version,
            'candidate_index_sha256': self.index_pin,
            'candidate_manifest': {'name': 'candidate-manifest.json', **self.index['assets']['candidate-manifest.json']},
            'archive': self.fixture.manifest['archive'], 'license_identifier': 'LicenseRef-SYNTHETIC-TEST-ONLY',
            'materials': {role: [{'location': 'asset', 'name': name, **self.index['assets'][name]}] for role, name in names.items()},
            'attestations': {name: True for name in legal.ATTESTATIONS}}
        self.approval_path = self.root / 'external-owner-decision.json'
        self.policy_path = self.root / 'external-current-policy.json'
        self.policy = {'schema': 'rock-owner-legal-policy/1', 'repository': legal.REPOSITORY,
                       'generation': 1, 'not_before': self.now - 10, 'expires_at': self.now + 300, 'approvals': []}
        self.repin_fixture()

    def repin_fixture(self):
        # Only a test helper creates synthetic statements. No production
        # command creates policy/decisions or derives independent authorization.
        self.approval_path.write_bytes(signing.canonical(self.approval))
        self.approval_pin = signing.file_record(self.approval_path)['sha256']
        self.policy['approvals'] = [{'approval_sha256': self.approval_pin,
                                    'authority_id': 'fixture-owner-only', 'status': 'active'}]
        self.write_policy()

    def write_policy(self):
        self.policy_path.write_bytes(signing.canonical(self.policy))
        self.policy_pin = signing.file_record(self.policy_path)['sha256']

    def verify(self, **changes):
        args = dict(directory=self.directory, index_pin=self.index_pin, source=self.fixture.source,
                    version=self.fixture.version, approval_path=self.approval_path,
                    approval_pin=self.approval_pin, policy_path=self.policy_path, policy_pin=self.policy_pin)
        args.update(changes)
        return legal.verify(**args)

    def test_exact_detached_decision_verifies_without_modifying_build_status_or_bytes(self):
        before = {p.name: p.read_bytes() for p in self.directory.iterdir()}
        with patch.object(signing, 'openssl', side_effect=AssertionError('no signing or key operation')), \
             patch.dict(os.environ, {'ROCK_RELEASE_SIGNING_KEY_PKCS8_B64': 'must-not-be-read'}):
            result = self.verify()
            self.assertEqual(os.environ['ROCK_RELEASE_SIGNING_KEY_PKCS8_B64'], 'must-not-be-read')
        self.assertEqual(result['status'], 'OWNER_LEGAL_APPROVAL_VERIFIED_NOT_LAUNCH_ACCEPTED')
        self.assertEqual(result['build_time_legal_status'], 'NOT_CLEARED')
        self.assertEqual(result['build_time_acceptance_status'], 'CANDIDATE')
        self.assertEqual(before, {p.name: p.read_bytes() for p in self.directory.iterdir()})
        self.assertNotIn(self.approval_path.name, before)

    def test_cli_success_and_missing_pin_failure(self):
        command = [sys.executable, str(ROOT / 'scripts/verify_owner_legal_approval.py'),
            '--directory', str(self.directory), '--source', self.fixture.source, '--version', self.fixture.version,
            '--index-sha256', self.index_pin, '--approval', str(self.approval_path),
            '--approval-sha256', self.approval_pin, '--policy', str(self.policy_path), '--policy-sha256', self.policy_pin]
        run = subprocess.run(command, capture_output=True, text=True)
        self.assertEqual(run.returncode, 0, run.stderr)
        self.assertEqual(json.loads(run.stdout)['candidate_index_sha256'], self.index_pin)
        run = subprocess.run(command[:-2], capture_output=True, text=True)
        self.assertNotEqual(run.returncode, 0)

    def test_independent_pin_source_and_version_changes_rejected(self):
        for changes in ({'approval_pin': '0'*64}, {'policy_pin': '0'*64}, {'index_pin': '0'*64},
                        {'source': 'c'*40}, {'version': 'different-version'}):
            with self.subTest(changes=changes), self.assertRaises(ValueError): self.verify(**changes)

    def test_unlisted_revoked_wrong_authority_and_expired_policy_rejected(self):
        original = copy.deepcopy(self.policy)
        for change in [lambda p: p.update(approvals=[]),
                       lambda p: p['approvals'][0].update(status='revoked'),
                       lambda p: p['approvals'][0].update(authority_id='other-owner'),
                       lambda p: p['approvals'][0].update(approval_sha256='a'*64),
                       lambda p: p['approvals'].append(copy.deepcopy(p['approvals'][0])),
                       lambda p: p.update(expires_at=self.now-1), lambda p: p.update(not_before=self.now+60),
                       lambda p: p.update(generation=True)]:
            self.policy = copy.deepcopy(original); change(self.policy); self.write_policy()
            with self.assertRaises(ValueError): self.verify()

    def test_approval_scope_expiry_identity_and_attestations_fail_closed(self):
        original = copy.deepcopy(self.approval)
        changes=[lambda a: a.update(scope='GENERAL_PUBLICATION'), lambda a: a.update(decision='PENDING'),
                 lambda a: a.update(authority_id='other-owner'), lambda a: a.update(expires_at=self.now-1),
                 lambda a: a.update(not_before=self.now+60), lambda a: a.update(not_before=self.fixture.issued_at-1),
                 lambda a: a.update(license_identifier='NOASSERTION'),
                 lambda a: a.update(candidate_index_sha256='f'*64),
                 lambda a: a.update(source_commit='f'*40), lambda a: a.update(host_tools_commit='f'*40),
                 lambda a: a.update(version='other-version'),
                 lambda a: a['attestations'].update(exceptions_reviewed=False),
                 lambda a: a['attestations'].update(exceptions_reviewed=1), lambda a: a.update(extra=True)]
        for change in changes:
            self.approval=copy.deepcopy(original); change(self.approval); self.repin_fixture()
            with self.assertRaises(ValueError): self.verify()

    def test_material_roles_pins_and_manifest_archive_commitments_rejected(self):
        original=copy.deepcopy(self.approval)
        changes=[lambda a: a['materials'].pop('inventory'), lambda a: a['materials'].update(notices=[]),
                 lambda a: a['materials']['notices'][0].update(sha256='f'*64),
                 lambda a: a['materials']['corresponding_source'][0].update(bytes=1),
                 lambda a: a['materials']['license'][0].update(name='../LICENSE'),
                 lambda a: a['materials']['license'][0].update(location='remote-url'),
                 lambda a: a['materials']['license'].append(copy.deepcopy(a['materials']['license'][0])),
                 lambda a: a['candidate_manifest'].update(sha256='f'*64),
                 lambda a: a['archive'].update(sha256='f'*64)]
        for change in changes:
            self.approval=copy.deepcopy(original); change(self.approval); self.repin_fixture()
            with self.assertRaises(ValueError): self.verify()

    def test_archive_member_material_pins_verified_without_extraction(self):
        name='native/os/desktop/package_preview.py'
        member=self.fixture.manifest['files'][name]
        self.approval['materials']['corresponding_source']=[{'location':'archive-member','name':name,
                                                            'sha256':member['sha256'],'bytes':member['bytes']}]
        self.repin_fixture(); self.verify()
        self.approval['materials']['corresponding_source'][0]['sha256']='f'*64
        self.repin_fixture()
        with self.assertRaises(ValueError): self.verify()

    def test_modified_bytes_extra_files_and_link_inputs_rejected(self):
        notice=self.directory/'NOTICE.fixture'; original=notice.read_bytes()
        notice.write_bytes(b'tampered')
        with self.assertRaises(ValueError): self.verify()
        notice.write_bytes(original)
        extra=self.directory/'extra.txt';extra.write_bytes(b'extra')
        with self.assertRaises(ValueError): self.verify()
        extra.unlink()
        linked=self.root/'linked-approval.json'; linked.symlink_to(self.approval_path)
        with self.assertRaises(OSError): self.verify(approval_path=linked)
        linked.unlink();os.link(self.approval_path,linked)
        with self.assertRaises(ValueError): self.verify()

    def test_duplicate_json_and_oversized_approval_rejected_even_when_repinned(self):
        for raw in (b'{"schema":"a","schema":"b"}', b'x'*(signing.MAX_METADATA+1)):
            self.approval_path.write_bytes(raw)
            pin=signing.file_record(self.approval_path)['sha256']
            with self.assertRaises(ValueError): self.verify(approval_pin=pin)

    def test_changed_file_between_initial_validation_and_copy_rejected(self):
        original=legal.copy_checked
        def raced(source,target,expected,**kwargs):
            if source.name=='NOTICE.fixture': source.write_bytes(b'changed after inventory validation')
            return original(source,target,expected,**kwargs)
        with patch.object(legal,'copy_checked',side_effect=raced), self.assertRaises(ValueError): self.verify()

    def test_expiry_during_candidate_verification_rejected_before_success(self):
        with patch.object(legal.time,'time',side_effect=[self.now,self.now+600]), self.assertRaises(ValueError):
            self.verify()


if __name__ == '__main__': unittest.main()

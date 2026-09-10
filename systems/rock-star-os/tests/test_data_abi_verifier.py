"""Real public signature and strict ABI evidence guards; QEMU remains separate."""
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import struct
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('data_abi_verifier',
    Path(__file__).resolve().parents[1] / 'os/update/verify-data-abi.py')
v = importlib.util.module_from_spec(spec); spec.loader.exec_module(v)
from make_bundle import sign_development
from rock_update import DATA_ABI, LAYOUT


def proof():
    measured = {'state_sha256': 'c'*64, 'slot_sha256': {'A':'a'*64,'B':'b'*64}}
    return {'schema':'rock-data-abi-refusal/1','status':'PASS','attempts':1,'reboot_retained':False,
            'data_abi':'rock-data-v1','expected_error':'incompatible persistent data ABI',
            'before':copy.deepcopy(measured),'after':copy.deepcopy(measured),'foreign_bundle_sha256':'d'*64}


class DataAbiVerifierTests(unittest.TestCase):
    def test_exact_serial_proof_with_observed_getty_prompt(self):
        raw = json.dumps(proof())
        for prefix in ('', '\rrock-star-os login: '):
            self.assertEqual(v.proof_records(prefix + 'ROCK_DATA_ABI_PROOF ' + raw + '\r\n'), [proof()])
        self.assertEqual(v.proof_records('quoted ROCK_DATA_ABI_PROOF ' + raw + '\n'), [])
        self.assertEqual(v.proof_records('other-host login: ROCK_DATA_ABI_PROOF ' + raw + '\n'), [])
        self.assertEqual(len(v.proof_records(('ROCK_DATA_ABI_PROOF ' + raw + '\n') * 2)), 2)

    def test_input_audit_runs_without_overwriting_prior_failure(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / 'input'; path.write_bytes(b'fixed')
            paths = {'image': path}
            report = {'status': 'FAIL', 'error': 'original guest failure',
                      'initial_input_snapshot': v.input_snapshot(paths)}
            self.assertTrue(v.audit_inputs(report, paths))
            self.assertEqual(report['status'], 'FAIL')
            self.assertEqual(report['error'], 'original guest failure')
            path.write_bytes(b'changed')
            self.assertFalse(v.audit_inputs(report, paths))
            self.assertEqual(report['error'], 'original guest failure')

    def test_input_audit_rejects_missing_input_or_missing_initial_evidence(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / 'input'; path.write_bytes(b'fixed')
            paths = {'image': path}
            report = {'status': 'PASS'}
            self.assertFalse(v.audit_inputs(report, paths))
            report['initial_input_snapshot'] = v.input_snapshot(paths)
            path.unlink()
            self.assertFalse(v.audit_inputs(report, paths))
            self.assertEqual(report['status'], 'FAIL')
            self.assertIn('FileNotFoundError', report['input_audit_error'])

    def validate(self, value, retained=False):
        v.validate_proof(value,retained=retained,expected_slots={'A':'a'*64,'B':'b'*64},bundle_hash='d'*64)

    def test_valid_scope_and_retained_proof(self):
        self.validate(proof())
        p=proof();p['reboot_retained']=True;self.validate(p,True)

    def test_wrong_error_missing_reboot_or_claimed_success_is_not_evidence(self):
        for change in ({'status':'RUNNING'},{'attempts':True},{'attempts':0},{'attempts':2},
                       {'reboot_retained':1},{'expected_error':'signature rejected'},
                       {'foreign_bundle_sha256':'e'*64},{'data_abi':'incompatible-data-v2'}):
            with self.subTest(change=change),self.assertRaises(RuntimeError):self.validate(dict(proof(),**change))
        with self.assertRaises(RuntimeError):self.validate(proof(),True)

    def test_slot_or_metadata_mutation_cannot_pass(self):
        for mutate in (lambda p:p['after'].update(state_sha256='e'*64),
                       lambda p:p['before']['slot_sha256'].update(B='e'*64),
                       lambda p:p.update(before={'state_sha256':'c'*64}),
                       lambda p:p.update(before={'state_sha256':'z'*64,'slot_sha256':{'A':'a'*64,'B':'b'*64}},
                                         after={'state_sha256':'z'*64,'slot_sha256':{'A':'a'*64,'B':'b'*64}})):
            p=proof();mutate(p)
            with self.assertRaises(RuntimeError):self.validate(p)

    def test_correctly_signed_foreign_abi_is_refused_without_validator_override(self):
        with tempfile.TemporaryDirectory(prefix='rock-abi-negative-') as temporary:
            root=Path(temporary);image=root/'image';output=root/'foreign.rock'
            image.write_bytes(b'x'*4096);original=image.read_bytes()
            valid=sign_development({'schema':'rock-os-rootfs-v2','architecture':'aarch64','layout':LAYOUT,
                'data_abi':DATA_ABI,'sequence':2,'version':'test-2','size':4096,
                'sha256':hashlib.sha256(original).hexdigest()})
            envelope=v.foreign_bundle(image,output,valid)
            self.assertEqual(DATA_ABI,'rock-data-v1')
            with self.assertRaisesRegex(v.UpdateError,'incompatible persistent data ABI'):v.verify_envelope(envelope)
            raw=output.read_bytes();length=struct.unpack('>I',raw[len(v.MAGIC):len(v.MAGIC)+4])[0]
            offset=len(v.MAGIC)+4
            self.assertEqual(json.loads(raw[offset:offset+length]),envelope)
            self.assertEqual(raw[offset+length:],original);self.assertEqual(image.read_bytes(),original)
            with self.assertRaises(FileExistsError):v.foreign_bundle(image,output,valid)

    def test_fixture_cannot_substitute_the_verified_payload(self):
        with tempfile.TemporaryDirectory(prefix='rock-abi-mismatch-') as temporary:
            root=Path(temporary);image=root/'image';image.write_bytes(b'x'*4096)
            valid=sign_development({'schema':'rock-os-rootfs-v2','architecture':'aarch64','layout':LAYOUT,
                'data_abi':DATA_ABI,'sequence':2,'version':'test-2','size':4096,'sha256':'0'*64})
            with self.assertRaisesRegex(RuntimeError,'payload differs'):v.foreign_bundle(image,root/'foreign.rock',valid)
            self.assertFalse((root/'foreign.rock').exists())


if __name__ == '__main__':unittest.main()

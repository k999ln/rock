import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('admission', ROOT / 'verify-ci-inputs.py')
admission = importlib.util.module_from_spec(spec)
spec.loader.exec_module(admission)
PLAN = json.loads((ROOT / 'launch-plan.json').read_bytes())


class InputIntegrity(unittest.TestCase):
    def test_growth_cannot_extend_hash_loop_past_initial_budget(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp).resolve() / 'input'
            path.write_bytes(b'abcd')
            original = admission.os.fdopen
            calls = []
            class Growing:
                def __init__(self, stream):
                    self.stream = stream
                def __enter__(self):
                    return self
                def __exit__(self, *args):
                    return self.stream.__exit__(*args)
                def fileno(self):
                    return self.stream.fileno()
                def read(self, amount):
                    calls.append(amount)
                    result = self.stream.read(amount)
                    if len(calls) == 1:
                        with path.open('ab') as output:
                            output.write(b'x' * 10000)
                    return result
            with patch.object(admission.os, 'fdopen', side_effect=lambda *a, **k: Growing(original(*a, **k))):
                with self.assertRaisesRegex(ValueError, 'grew'):
                    admission.record(path, 100000)
            self.assertEqual(calls, [4, 1])

    def test_symlink_and_hardlink_never_admitted_as_candidate_files(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp).resolve()
            target = root / 'target'; target.write_bytes(b'payload')
            link = root / 'symlink'; link.symlink_to(target)
            with self.assertRaises(OSError):
                admission.record(link, 100)
            hard = root / 'hard'; hard.hardlink_to(target)
            with self.assertRaisesRegex(ValueError, 'identity'):
                admission.record(hard, 100)

    def test_known_record_and_wrong_metadata_pin(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp).resolve() / 'input.json'
            raw = b'{"value":123}'
            path.write_bytes(raw)
            self.assertEqual(admission.record(path, 100),
                             {'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()})
            with self.assertRaisesRegex(ValueError, 'pin'):
                admission.pinned_json(path, '0' * 64)

    def test_duplicate_json_pin_does_not_make_ambiguous_metadata_valid(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp).resolve() / 'input.json'
            raw = b'{"trust":"EXTERNAL_RELEASE_KEY","trust":"PUBLIC_RFC8032_DEVELOPMENT_ONLY"}'
            path.write_bytes(raw)
            with self.assertRaisesRegex(ValueError, 'duplicate'):
                admission.pinned_json(path, hashlib.sha256(raw).hexdigest())


class ReleaseBoundary(unittest.TestCase):
    def setUp(self):
        self.api = {'id': 386933271, 'draft': True, 'prerelease': True,
                    'tag_name': 'v1.0.0-preview.20260911-rc2',
                    'target_commitish': admission.SOURCE,
                    'assets': [{'id': x['id'], 'name': x['name'], 'size': x['bytes'],
                                'state': 'uploaded', 'digest': 'sha256:' + x['sha256']}
                               for x in PLAN['candidate']['assets']]}

    def test_added_raw_asset_would_invalidate_rc2_exact_inventory(self):
        admission.check_candidate_release(self.api, PLAN)
        self.api['assets'].append({'name': 'd4-raw.tar.gz'})
        with self.assertRaisesRegex(ValueError, 'missing/extra'):
            admission.check_candidate_release(self.api, PLAN)

    def test_same_name_reuploaded_bytes_cannot_replace_pinned_asset(self):
        self.api['assets'][0]['id'] += 1
        with self.assertRaisesRegex(ValueError, 'asset changed'):
            admission.check_candidate_release(self.api, PLAN)

    def test_published_or_retargeted_candidate_is_not_admitted(self):
        for field, value in [('draft', False), ('target_commitish', 'main')]:
            changed = copy.deepcopy(self.api); changed[field] = value
            with self.assertRaisesRegex(ValueError, 'release changed'):
                admission.check_candidate_release(changed, PLAN)

    def test_evidence_cannot_target_candidate_or_adopt_nonempty_draft(self):
        plan = copy.deepcopy(PLAN)
        plan['evidence_destination'].update(release_id=386933271, tag='new-evidence')
        with self.assertRaisesRegex(ValueError, 'not pinned'):
            admission.check_evidence_release(self.api, plan, initial=True)
        plan['evidence_destination']['release_id'] = 999999999
        value = {'id': 999999999, 'draft': True, 'prerelease': True, 'tag_name': 'new-evidence',
                 'target_commitish': admission.SOURCE, 'assets': []}
        admission.check_evidence_release(value, plan, initial=True)
        value['assets'] = [{'name': 'prior-run-raw'}]
        with self.assertRaisesRegex(ValueError, 'initially be empty'):
            admission.check_evidence_release(value, plan, initial=True)

    def test_unsigned_and_test_envelopes_cannot_hide_an_image_change(self):
        unsigned = {'trust': 'EXTERNAL_RELEASE_KEY', 'image_sha256': {'Image': 'a' * 64}}
        test = {'manifest': {'trust': 'PUBLIC_RFC8032_DEVELOPMENT_ONLY',
                             'image_sha256': {'Image': 'a' * 64}}, 'signature': '0' * 128}
        admission.compare_envelope(unsigned, test)
        test['manifest']['image_sha256']['Image'] = 'b' * 64
        with self.assertRaisesRegex(ValueError, 'beyond trust'):
            admission.compare_envelope(unsigned, test)

    def test_original_matrix_and_sufficient_job_transport_deadline_are_fixed(self):
        admission.validate_plan(PLAN)
        for field, value in [('native_per_boot_seconds', 240), ('boots', 13)]:
            plan = copy.deepcopy(PLAN); plan['matrix'][0][field] = value
            with self.assertRaisesRegex(ValueError, 'matrix changed'):
                admission.validate_plan(plan)
        plan = copy.deepcopy(PLAN); plan['limits']['job_minutes'] = 170
        with self.assertRaisesRegex(ValueError, 'contract changed'):
            admission.validate_plan(plan)


if __name__ == '__main__':
    unittest.main()

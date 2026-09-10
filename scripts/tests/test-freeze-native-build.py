"""Artifact-provenance negative cases; synthetic files never count as OS tests."""
from pathlib import Path
import hashlib
import importlib.util
import json
import os
import tarfile
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('freeze_native', Path(__file__).parents[1]/'freeze-native-build.py')
freeze = importlib.util.module_from_spec(spec)
spec.loader.exec_module(freeze)


class FreezeProvenance(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.base = Path(self.temporary.name).resolve()
        self.source, self.build, self.images = [self.base/name for name in ('source', 'build', 'images')]
        for directory in (self.source, self.build, self.images): directory.mkdir()
        self.commit = 'a'*40
        self.archive = self.base/'source.tar'
        self.report = self.base/'report.json'
        self.lock = json.dumps({'linux': {'version': '6.18.50'}})
        for name, content in {
                'scripts/test-native.py': '# original native runner\n',
                '.github/workflows/native-os.yml': '# original workflow\n',
                'systems/rock-star-os/os/source-lock.json': self.lock,
                'systems/rock-star-os/src/runtime.py': 'VERSION = 1\n'}.items():
            path = self.source/name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content)
        self.write_archive()
        files = {str(path.relative_to(self.source)):freeze.digest(path) for path in self.source.rglob('*') if path.is_file()}
        self.test_report = {'schema': 'rock-native-regressions/1', 'status':'PASS',
            'source_unchanged':True, 'changed_inputs':[], 'input_sha256':files,
            'total_python_test_executions':3, 'checks':[{'passed':True,'exit_code':0,
            'skipped':False,'unclean_log':False,'tests':3}],
            'started_utc':'2026-09-10T06:00:00Z','finished_utc':'2026-09-10T06:00:01Z'}
        self.report.write_text(json.dumps(self.test_report))
        for name in freeze.IMAGE_NAMES:
            data = bytearray(1024*1024 + 1)
            if name == 'Image': data[56:60] = b'ARM\x64'
            elif name == 'rootfs.ext4': data[1080:1082] = b'\x53\xef'
            (self.images/name).write_bytes(data)
        (self.images/'SHA256SUMS').write_text(''.join(f'{freeze.digest(self.images/n)}  {n}\n' for n in freeze.IMAGE_NAMES))
        (self.images/'source-lock.json').write_text(self.lock)
        for name, destination in [('buildroot.config','output/.config'),
                                 ('linux.config','output/build/linux-6.18.50/.config')]:
            (self.images/name).write_text('locked '+name+'\n')
            path = self.build/destination
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes((self.images/name).read_bytes())
        (self.images/'build.log').write_text('Build started: 2026-09-10T06:01:00Z\nBuild finished: 2026-09-10T06:02:00Z\n')

    def write_archive(self, commit=None):
        with tarfile.open(self.archive,'w',format=tarfile.PAX_FORMAT,pax_headers={'comment':commit or self.commit}) as archive:
            for path in sorted(self.source.rglob('*')):
                if path.is_file(): archive.add(path,arcname=str(path.relative_to(self.source)),recursive=False)

    def run_freeze(self):
        with patch.object(freeze,'environment',return_value={'scope':'SYNTHETIC_ARTIFACT_TEST_ONLY'}):
            return freeze.freeze(self.source,self.archive,self.commit,self.report,self.build,self.images,'b'*40)

    def test_provenance_is_bound_and_cache_reuse_is_not_reported_as_fresh(self):
        result=self.run_freeze()
        self.assertEqual(self.commit,result['source_commit'])
        self.assertTrue(result['old_build_outputs_reused'])
        self.assertFalse(result['build_started_empty'])
        self.assertEqual('NOT_RUN',result['qemu_boot'])
        self.assertEqual('NOT_RUN',result['acceptance_D0_D6'])
        self.assertEqual(3,result['source_tests']['python_executions'])
        for name in freeze.IMAGE_NAMES:
            self.assertEqual(0,(self.images/name).stat().st_mode & 0o222)
        with self.assertRaisesRegex(ValueError,'already exists'): self.run_freeze()

    def test_wrong_git_archive_commit_is_rejected(self):
        self.write_archive('c'*40)
        with self.assertRaisesRegex(ValueError,'commit mismatch'): self.run_freeze()

    def test_source_changed_after_archive_is_rejected(self):
        (self.source/'systems/rock-star-os/src/runtime.py').write_text('VERSION = 2\n')
        with self.assertRaisesRegex(ValueError,'source changed'): self.run_freeze()

    def test_group_writable_source_cannot_be_frozen_as_protected_input(self):
        (self.source/'systems/rock-star-os/src/runtime.py').chmod(0o664)
        with self.assertRaisesRegex(ValueError,'group/world writable'): self.run_freeze()

    def test_new_source_not_in_old_regression_inventory_is_rejected(self):
        (self.source/'systems/rock-star-os/src/added.py').write_text('ADDED = True\n')
        self.write_archive()
        with self.assertRaisesRegex(ValueError,'inventory does not cover'): self.run_freeze()

    def test_skipped_regression_is_not_a_pass(self):
        self.test_report['checks'][0]['skipped']=True
        self.report.write_text(json.dumps(self.test_report))
        with self.assertRaisesRegex(ValueError,'without skips'): self.run_freeze()

    def test_edited_image_is_rejected_without_rewriting_checksums(self):
        with (self.images/'stage0.cpio.gz').open('r+b') as stream: stream.write(b'changed')
        with self.assertRaisesRegex(ValueError,'checksums do not match'): self.run_freeze()

    def test_image_hardlink_is_not_accepted_as_immutable(self):
        os.link(self.images/'rootfs.ext4',self.base/'mutable-alias')
        with self.assertRaisesRegex(ValueError,'single-link image'): self.run_freeze()

    def test_mismatched_kernel_configuration_is_rejected(self):
        (self.build/'output/build/linux-6.18.50/.config').write_text('different\n')
        with self.assertRaisesRegex(ValueError,'configuration differs'): self.run_freeze()


if __name__=='__main__': unittest.main()

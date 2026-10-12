"""Synthetic tests for the MR wrapper's local workspace boundary; no network."""
import argparse
import copy
import errno
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import stat
import subprocess
import sys
import tempfile
import types
import unittest
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
TOOLKIT = ROOT / 'toolkits/mr'
SPEC = importlib.util.spec_from_file_location('mr_delivery_boundary', TOOLKIT / 'rock_star_tools.py')
TOOLS = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(TOOLS)
SUPPORTED = os.name == 'posix' and all(getattr(os, key, 0) for key in ('O_DIRECTORY', 'O_NOFOLLOW', 'O_NONBLOCK')) and TOOLS._DELIVERY_DIR_FD


@unittest.skipUnless(SUPPORTED, 'protected directory-relative reads require POSIX')
class DeliveryBoundaryTest(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(prefix='mr-delivery-test-')
        self.addCleanup(temporary.cleanup)
        self.base = Path(temporary.name)
        self.workspace = self.base / 'workspace'
        shutil.copytree(TOOLKIT / 'examples/delivery', self.workspace)
        self.data = json.loads((TOOLKIT / 'examples/delivery-review.json').read_text())
        self.receipt = self.data['execution_receipt']
        self.contract = self.workspace / 'requirements/revisions' / (self.receipt['revision_sha256'] + '.json')
        self.stored = self.workspace / 'artifacts/execution-receipts' / (self.receipt['execution_id'] + '.json')

    def verify(self, data=None):
        return TOOLS.verify_delivery(argparse.Namespace(workspace=str(self.workspace)), self.data if data is None else data)

    def store_receipt(self):
        self.stored.write_text(json.dumps(self.receipt), encoding='utf-8')

    def nest_artifact(self):
        target = self.workspace / '成果物' / '本文.md'
        target.parent.mkdir()
        (self.workspace / 'draft.md').rename(target)
        self.receipt['artifacts'][0]['path'] = '成果物/本文.md'
        self.store_receipt()
        return target

    def test_existing_pass_blocked_revise_and_utf8_nested_files(self):
        self.assertEqual(self.verify()['status'], 'PASS')
        self.nest_artifact()
        self.assertEqual(self.verify()['status'], 'PASS')
        changed = copy.deepcopy(self.data)
        changed['reviewer_context_id'] = self.receipt['execution_id']
        self.assertIn('self_approval_rejected', self.verify(changed)['evidence'])
        changed = copy.deepcopy(self.data)
        changed['review']['criteria'][0]['status'] = 'REVISE'
        self.assertEqual(self.verify(changed)['status'], 'REVISE')
        (self.workspace / '成果物/本文.md').write_text('changed synthetic fixture', encoding='utf-8')
        self.assertIn('artifact_hash_mismatch', self.verify()['evidence'])

    def test_missing_and_mismatched_metadata_keep_vendor_blocked_results(self):
        original = self.contract.read_bytes()
        self.contract.unlink()
        self.assertIn('contract_missing', self.verify()['evidence'])
        self.contract.write_bytes(original)
        original = self.stored.read_bytes()
        self.stored.unlink()
        self.assertIn('execution_receipt_missing', self.verify()['evidence'])
        self.stored.write_bytes(original)
        stored = json.loads(original)
        stored['execution_id'] = 'other-synthetic-execution'
        self.stored.write_text(json.dumps(stored))
        self.assertIn('execution_receipt_mismatch', self.verify()['evidence'])

    def test_control_file_and_parent_symlinks_are_rejected_before_vendor(self):
        for target in (self.contract, self.stored, self.workspace / 'requirements', self.workspace / 'artifacts'):
            with self.subTest(kind='directory' if target.is_dir() else 'file'):
                external = self.base / 'external-control'
                target.rename(external)
                target.symlink_to(external, target_is_directory=external.is_dir())
                try:
                    with mock.patch.object(TOOLS, 'load_module', side_effect=AssertionError('vendor must not run')):
                        with self.assertRaisesRegex(ValueError, '^Delivery workspace could not be read safely$'):
                            self.verify()
                finally:
                    target.unlink()
                    external.rename(target)

    def test_artifact_leaf_and_ancestor_symlinks_are_rejected(self):
        target = self.nest_artifact()
        for path in (target, target.parent):
            with self.subTest(kind='directory' if path.is_dir() else 'file'):
                external = self.base / 'external-artifact'
                path.rename(external)
                path.symlink_to(external, target_is_directory=external.is_dir())
                try:
                    with self.assertRaises(ValueError):
                        self.verify()
                finally:
                    path.unlink()
                    external.rename(path)

    def test_invalid_paths_and_all_root_symlink_spellings_are_rejected(self):
        for path in ('../outside', '/outside', '', '.', 'bad\x00path', '/'.join(['a'] * 65), 'a' * 4097):
            data = copy.deepcopy(self.data)
            data['execution_receipt']['artifacts'][0]['path'] = path
            with self.subTest(path_kind='synthetic-invalid'), self.assertRaises(ValueError):
                self.verify(data)
        alias = self.base / 'workspace-link'
        alias.symlink_to(self.workspace, target_is_directory=True)
        for suffix in ('', '/', '/.'):
            with self.subTest(suffix=suffix), self.assertRaises(ValueError):
                TOOLS.verify_delivery(argparse.Namespace(workspace=str(alias) + suffix), self.data)

    def test_duplicate_and_control_artifact_paths_are_copied_once_without_overwrite(self):
        self.receipt['artifacts'].append({**self.receipt['artifacts'][0], 'path': './draft.md'})
        # Control records can also be artifacts; actual bytes are copied once.
        content = self.contract.read_bytes()
        self.receipt['artifacts'].append({'path': str(self.contract.relative_to(self.workspace)),
            'sha256': hashlib.sha256(content).hexdigest(), 'bytes': len(content)})
        self.store_receipt()
        vendor = TOOLS.load_module('deliverable_verifier')
        expected = vendor.verify_deliverables(workspace=self.workspace, execution_receipt=self.receipt,
            reviewer_context_id=self.data['reviewer_context_id'], review=self.data['review'])
        with mock.patch.object(TOOLS, '_delivery_read', wraps=TOOLS._delivery_read) as reader:
            result = self.verify()
        self.assertEqual((result['status'], result['evidence']), (expected['status'], expected['evidence']))
        self.assertEqual(reader.call_count, 3)

    def test_opened_artifact_survives_leaf_replacement_without_following_new_target(self):
        real_open = os.open
        target = self.workspace / 'draft.md'
        external = self.base / 'outside.txt'
        external.write_text('outside synthetic bytes')
        replaced = False

        def opening(path, flags, *args, **kwargs):
            nonlocal replaced
            descriptor = real_open(path, flags, *args, **kwargs)
            if path == 'draft.md' and 'dir_fd' in kwargs and not replaced:
                replaced = True
                target.rename(self.workspace / 'original.md')
                target.symlink_to(external)
            return descriptor

        with mock.patch.object(TOOLS.os, 'open', side_effect=opening):
            self.assertEqual(self.verify()['status'], 'PASS')
        self.assertTrue(replaced)

    def test_opened_ancestor_survives_path_replacement(self):
        target = self.nest_artifact()
        external = self.base / 'outside-dir'
        external.mkdir()
        (external / target.name).write_text('outside synthetic bytes')
        real_open = os.open
        replaced = False

        def opening(path, flags, *args, **kwargs):
            nonlocal replaced
            descriptor = real_open(path, flags, *args, **kwargs)
            if path == target.parent.name and 'dir_fd' in kwargs and not replaced:
                replaced = True
                target.parent.rename(self.workspace / 'original-directory')
                target.parent.symlink_to(external, target_is_directory=True)
            return descriptor

        with mock.patch.object(TOOLS.os, 'open', side_effect=opening):
            self.assertEqual(self.verify()['status'], 'PASS')
        self.assertTrue(replaced)

    def test_growth_after_fstat_is_bounded_and_handle_closes(self):
        target = self.workspace / 'short.txt'
        target.write_bytes(b'abcd')
        root_fd = os.open(self.workspace, TOOLS._delivery_flags() | os.O_DIRECTORY)
        self.addCleanup(os.close, root_fd)
        real_stat, real_read = os.fstat, os.read
        inspected = []
        total_read = 0

        def fstat(descriptor):
            info = real_stat(descriptor)
            inspected.append(descriptor)
            with target.open('ab') as handle:
                handle.write(b'efgh')
            return info

        def read(descriptor, maximum):
            nonlocal total_read
            value = real_read(descriptor, maximum)
            total_read += len(value)
            return value

        with mock.patch.object(TOOLS.os, 'fstat', side_effect=fstat), mock.patch.object(TOOLS.os, 'read', side_effect=read):
            with self.assertRaisesRegex(ValueError, 'exceeds its limit'):
                TOOLS._delivery_read(root_fd, ('short.txt',), 4, TOOLS._delivery_flags())
        self.assertEqual(total_read, 5)
        with self.assertRaises(OSError) as error:
            real_stat(inspected[0])
        self.assertEqual(error.exception.errno, errno.EBADF)

    def test_artifact_and_control_limits_reject_before_unbounded_reads(self):
        os.truncate(self.workspace / 'draft.md', 10_000_001)
        with mock.patch.object(TOOLS.os, 'read', side_effect=AssertionError('must reject oversized file before read')):
            with self.assertRaisesRegex(ValueError, 'exceeds its limit'):
                self.verify()
        shutil.copyfile(TOOLKIT / 'examples/delivery/draft.md', self.workspace / 'draft.md')
        os.truncate(self.contract, TOOLS.LIMIT + 1)
        with self.assertRaisesRegex(ValueError, 'exceeds its limit'):
            self.verify()

    def test_fifo_is_refused_without_waiting_and_cli_diagnostic_is_constant(self):
        artifact = self.workspace / 'draft.md'
        artifact.unlink()
        os.mkfifo(artifact, 0o600)
        result = subprocess.run([sys.executable, '-B', str(TOOLKIT / 'rock_star_tools.py'),
            'verify-delivery', '--workspace', str(self.workspace),
            '--input', str(TOOLKIT / 'examples/delivery-review.json')],
            capture_output=True, text=True, timeout=5)
        self.assertEqual(result.returncode, 2)
        self.assertEqual(result.stdout, '')
        self.assertEqual(result.stderr, 'Could not run the tool. Check the input fields, source hashes, and output path.\n')

    def test_snapshot_contains_only_required_files_and_is_removed_on_success_and_failure(self):
        (self.workspace / 'unrequested.txt').write_text('unrequested synthetic bytes')
        vendor = TOOLS.load_module('deliverable_verifier')
        real_open, real_dup = os.open, os.dup
        for fail in (False, True):
            snapshots, descriptors = [], []

            def opening(*args, **kwargs):
                descriptor = real_open(*args, **kwargs)
                descriptors.append(descriptor)
                return descriptor

            def duplicate(*args):
                descriptor = real_dup(*args)
                descriptors.append(descriptor)
                return descriptor

            def verify(**kwargs):
                snapshot = kwargs['workspace']
                snapshots.append(snapshot)
                self.assertNotEqual(snapshot, self.workspace)
                self.assertEqual(stat.S_IMODE(snapshot.stat().st_mode), 0o700)
                paths = {str(path.relative_to(snapshot)) for path in snapshot.rglob('*') if path.is_file()}
                self.assertEqual(paths, {'draft.md', str(self.contract.relative_to(self.workspace)),
                    str(self.stored.relative_to(self.workspace))})
                for path in snapshot.rglob('*'):
                    if path.is_file():
                        self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o600)
                if fail:
                    raise ValueError('synthetic vendor failure')
                return vendor.verify_deliverables(**kwargs)

            with mock.patch.object(TOOLS.os, 'open', side_effect=opening), mock.patch.object(TOOLS.os, 'dup', side_effect=duplicate), mock.patch.object(TOOLS, 'load_module', return_value=types.SimpleNamespace(verify_deliverables=verify)):
                if fail:
                    with self.assertRaisesRegex(ValueError, '^synthetic vendor failure$'):
                        self.verify()
                else:
                    self.assertEqual(self.verify()['status'], 'PASS')
            self.assertEqual(len(snapshots), 1)
            self.assertFalse(snapshots[0].exists())
            for descriptor in set(descriptors):
                with self.assertRaises(OSError) as error:
                    os.fstat(descriptor)
                self.assertEqual(error.exception.errno, errno.EBADF)

    def test_mcp_sample_still_uses_the_wrapper_successfully(self):
        request = {'jsonrpc': '2.0', 'id': 1, 'method': 'tools/call',
            'params': {'name': 'verify_delivery', 'arguments': {'sample': True}}}
        result = subprocess.run([sys.executable, '-B', str(TOOLKIT / 'mcp_server.py')],
            input=json.dumps(request) + '\n', capture_output=True, text=True, timeout=5)
        self.assertEqual(result.returncode, 0)
        self.assertEqual(result.stderr, '')
        response = json.loads(result.stdout)
        self.assertFalse(response['result']['isError'])
        self.assertEqual(response['result']['structuredContent']['status'], 'PASS')


class DeliveryUnsupportedTest(unittest.TestCase):
    def test_missing_required_flags_or_dirfd_support_fails_closed(self):
        for name in ('O_DIRECTORY', 'O_NOFOLLOW', 'O_NONBLOCK'):
            with mock.patch.object(TOOLS.os, name, 0, create=True):
                with self.assertRaisesRegex(ValueError, '^Protected delivery reads are unavailable$'):
                    TOOLS._delivery_flags()
        with mock.patch.object(TOOLS, '_DELIVERY_DIR_FD', False):
            with self.assertRaisesRegex(ValueError, '^Protected delivery reads are unavailable$'):
                TOOLS._delivery_flags()


if __name__ == '__main__':
    unittest.main()

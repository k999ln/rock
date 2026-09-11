import copy
import gzip
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import shutil
import stat
import subprocess
import sys
import tarfile
import tempfile
import unittest
from unittest.mock import patch
import urllib.error

ROOT = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('transport', ROOT / 'run-final-d4-ci.py')
transport = importlib.util.module_from_spec(spec); spec.loader.exec_module(transport)


def example_tar(data=b'x'):
    output = io.BytesIO()
    with tarfile.open(fileobj=output, mode='w', format=tarfile.GNU_FORMAT) as archive:
        item = tarfile.TarInfo('evidence/a'); item.size = len(data); item.mode = 0o600
        item.uid = 20000; item.gid = 20000
        archive.addfile(item, io.BytesIO(data))
    inventory = {'files': {'evidence/a': {'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest(),
                                        'mode': 0o600, 'uid': 20000, 'gid': 20000}}}
    return output.getvalue(), inventory


def split_gzip(root, raw, size=71):
    writer = transport.SplitWriter(root, 'fixture', chunk_limit=size, total_limit=10 * 1024 ** 2)
    with gzip.GzipFile(fileobj=writer, mode='wb', mtime=0) as compressed:
        compressed.write(raw)
    writer.close()
    return writer.parts


class RawPreservation(unittest.TestCase):
    def test_split_gzip_roundtrip_checks_every_original_byte_and_mode(self):
        raw, inventory = example_tar(b'0123456789' * 9000)
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp).resolve(); parts = split_gzip(root, raw)
            self.assertGreater(len(parts), 1)
            self.assertTrue(all(0 < p['bytes'] <= 71 for p in parts))
            transport.verify_raw_archive(root, parts, inventory)
            changed = copy.deepcopy(inventory); changed['files']['evidence/a']['mode'] = 0o644
            with self.assertRaisesRegex(ValueError, 'metadata'):
                transport.verify_raw_archive(root, parts, changed)

    def test_hidden_nonzero_end_padding_is_not_lost_in_tar_read_ahead(self):
        raw, inventory = example_tar()
        for offset in (1536, 2048, 4096, 10239):
            with self.subTest(offset=offset), tempfile.TemporaryDirectory() as temp:
                root = Path(temp).resolve(); changed = bytearray(raw); changed[offset] = ord('X')
                parts = split_gzip(root, changed)
                with self.assertRaisesRegex(ValueError, 'end marker|trailing'):
                    transport.verify_raw_archive(root, parts, inventory)

    def test_missing_second_end_block_and_excessive_zero_trailer_reject(self):
        raw, inventory = example_tar()
        for changed in (raw[:1536], raw + b'\0' * 20000):
            with tempfile.TemporaryDirectory() as temp:
                root = Path(temp).resolve(); parts = split_gzip(root, changed)
                with self.assertRaisesRegex(ValueError, 'end marker|trailing'):
                    transport.verify_raw_archive(root, parts, inventory)

    def test_corrupt_or_missing_chunk_cannot_yield_preservation_pass(self):
        raw, inventory = example_tar(b'original' * 10000)
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp).resolve(); parts = split_gzip(root, raw)
            target = root / parts[0]['name']; original = target.read_bytes()
            target.write_bytes(b'X' + original[1:])
            with self.assertRaisesRegex(ValueError, 'chunk changed'):
                transport.verify_raw_archive(root, parts, inventory)
            target.unlink()
            with self.assertRaises(FileNotFoundError):
                transport.verify_raw_archive(root, parts, inventory)

    def test_compressed_bound_and_existing_chunk_refuse_without_replacement(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp).resolve()
            writer = transport.SplitWriter(root, 'fixture', chunk_limit=4, total_limit=8)
            writer.write(b'12345678'); writer.close()
            with self.assertRaisesRegex(ValueError, 'compressed'):
                writer.write(b'9')
            second = transport.SplitWriter(root, 'fixture', chunk_limit=4, total_limit=8)
            with self.assertRaises(FileExistsError):
                second.write(b'abcd')
            self.assertEqual((root / 'fixture.tar.gz.part-0000').read_bytes(), b'1234')

    def test_partial_ab_fault_directories_preserved_without_success_report(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp).resolve(); images = root / 'images'; evidence = root / 'evidence'
            images.mkdir(); evidence.mkdir()
            (evidence / 'failed.log').write_bytes(b'partial UI failure')
            for name in ('verify-ab-partial', 'verify-faults-partial'):
                (images / name).mkdir(); (images / name / 'boot.log').write_bytes(b'partial boot')
            (images / 'rootfs.ext4').write_bytes(b'immutable input is not raw evidence')
            with patch.multiple(transport, RUN=root, IMAGES=images, EVIDENCE=evidence):
                inventory = transport.raw_inventory()
            self.assertEqual(set(inventory['files']), {'evidence/failed.log',
                'images/verify-ab-partial/boot.log', 'images/verify-faults-partial/boot.log'})

    def test_real_gnu_sparse_archive_roundtrip_on_linux(self):
        tar = shutil.which('tar')
        if not tar or b'GNU tar' not in subprocess.check_output([tar, '--version'], stderr=subprocess.STDOUT):
            if sys.platform == 'linux':
                self.fail('Linux CI requires the real GNU sparse producer; skipping is forbidden.')
            self.skipTest('Actual GNU sparse producer requires Linux CI; no macOS substitute claimed.')
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp).resolve(); source = root / 'raw'; source.mkdir(); file = source / 'sparse'
            with file.open('wb') as output:
                output.write(b'head'); output.seek(8 * 1024 ** 2); output.write(b'tail')
            info = file.stat()
            raw = subprocess.check_output([tar, '--format=gnu', '--sparse', '--numeric-owner',
                                           '-C', str(source), '-cf', '-', 'sparse'])
            self.assertLess(len(raw), info.st_size)
            inventory = {'files': {'sparse': {**transport.file_record(file),
                       'mode': stat.S_IMODE(info.st_mode), 'uid': info.st_uid, 'gid': info.st_gid}}}
            chunks = root / 'chunks'; chunks.mkdir(); parts = split_gzip(chunks, raw)
            transport.verify_raw_archive(chunks, parts, inventory)


class TransportBoundary(unittest.TestCase):
    def test_read_stream_never_reads_beyond_expected_length_plus_one(self):
        class Recording(io.BytesIO):
            def __init__(self, value):
                super().__init__(value); self.sizes = []
            def read(self, amount=-1):
                self.sizes.append(amount); return super().read(amount)
        incoming = Recording(b'abc' + b'x' * 100000)
        with self.assertRaisesRegex(ValueError, 'exceeds'):
            transport.checked_stream(incoming, {'bytes': 3, 'sha256': hashlib.sha256(b'abc').hexdigest()})
        self.assertEqual(incoming.sizes, [3, 1])

    def test_redirect_get_has_no_authorization_and_rejects_other_hosts(self):
        for url in ('https://evil.invalid/a', 'https://release-assets.githubusercontent.com.evil/a',
                    'https://user:pass@release-assets.githubusercontent.com/a', 'http://objects.githubusercontent.com/a'):
            with self.assertRaises(ValueError): transport.redirect_url(url)
        url = 'https://release-assets.githubusercontent.com/pinned'
        error = urllib.error.HTTPError('https://api.github.com/example', 302, 'redirect', {'Location': url}, None)
        opener = type('Opener', (), {'open': lambda self, value, timeout: (value, timeout)})()
        with patch.object(transport, 'api', side_effect=error), patch.object(transport.urllib.request, 'build_opener', return_value=opener):
            redirected, _ = transport.asset_stream('PUBLIC_TEST_TOKEN_ONLY', 123)
        self.assertEqual(redirected, url)  # URL string; no authenticated Request reused.

    def test_upload_posts_only_to_evidence_and_checks_actual_remote_bytes(self):
        connections = []
        expected_hash = hashlib.sha256(b'raw').hexdigest()
        class Response:
            status = 201
            def read(self, _):
                return json.dumps({'id': 42, 'name': 'raw.bin', 'state': 'uploaded', 'size': 3,
                                   'digest': 'sha256:' + expected_hash}).encode()
        class Connection:
            def __init__(self, host, timeout):
                self.host = host; self.data = bytearray(); connections.append(self)
            def putrequest(self, method, path): self.request = (method, path)
            def putheader(self, *args): pass
            def endheaders(self): pass
            def send(self, value): self.data.extend(value)
            def getresponse(self): return Response()
            def close(self): pass
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp).resolve() / 'raw.bin'; path.write_bytes(b'raw')
            with patch.object(transport, 'evidence_release', return_value={'assets': []}), \
                 patch.object(transport.http.client, 'HTTPSConnection', Connection), \
                 patch.object(transport, 'asset_stream', return_value=io.BytesIO(b'raw')):
                result = transport.upload_file('PUBLIC_TEST_TOKEN_ONLY', path, 'raw.bin')
            self.assertTrue(result['actual_remote_bytes_read_back'])
            self.assertEqual(connections[0].request,
                ('POST', '/repos/k999ln/rock/releases/387142563/assets?name=raw.bin'))
            self.assertEqual(connections[0].data, b'raw')
            with patch.object(transport, 'evidence_release', return_value={'assets': []}), \
                 patch.object(transport.http.client, 'HTTPSConnection', Connection), \
                 patch.object(transport, 'asset_stream', return_value=io.BytesIO(b'bad')):
                with self.assertRaisesRegex(ValueError, 'hash differs'):
                    transport.upload_file('PUBLIC_TEST_TOKEN_ONLY', path, 'raw.bin')

    def test_candidate_id_cannot_become_the_upload_target(self):
        plan = copy.deepcopy(transport.PLAN); plan['evidence_destination']['release_id'] = 386933271
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp).resolve() / 'raw.bin'; path.write_bytes(b'raw')
            with patch.object(transport, 'PLAN', plan), patch.object(transport, 'evidence_release', return_value={'assets': []}), \
                 patch.object(transport.http.client, 'HTTPSConnection') as network:
                with self.assertRaisesRegex(ValueError, 'read-only'):
                    transport.upload_file('PUBLIC_TEST_TOKEN_ONLY', path, 'raw.bin')
                network.assert_not_called()

    def test_transport_token_refuses_any_native_or_archive_action(self):
        for variable in ('GITHUB_TOKEN', 'GH_TOKEN', 'ACTIONS_RUNTIME_TOKEN'):
            with patch.dict(os.environ, {variable: 'PUBLIC_TEST_TOKEN_ONLY'}, clear=True):
                with self.assertRaisesRegex(ValueError, 'credentials'):
                    transport.no_token()


if __name__ == '__main__':
    unittest.main()

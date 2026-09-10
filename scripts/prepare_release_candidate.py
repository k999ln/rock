#!/usr/bin/env python3
"""Prepare unsigned candidate inputs from a NEW independently pinned producer export.

No build, key, archive execution/extraction, GitHub operation or acceptance promotion.
Requires a future reviewed --unsigned-external producer; signed releases are refused.
"""
import argparse
import gzip
import hashlib
import os
from pathlib import Path
import re
import stat
import sys
import tempfile
import time
import zlib

import release_signing as signing

EXPORT = 'candidate-export.json'
MANIFEST = 'candidate-manifest.json'
SUPPLEMENTS = 'candidate-supplements.json'
PRODUCER = 'systems/rock-star-os/os/desktop/package_preview.py'
BOOTSTRAP = 'systems/rock-star-os/os/desktop/preview.py'
NATIVE = 'systems/rock-star-os/'
DOCS = ('preview-installation-ja.md', 'preview-release-notes.md', 'preview-legal-notice.md')
require = signing.require


def copy_checked(source, target, record, *, directory_fd=None):
    """Copy data through a checked descriptor; never follow links or copy permissions."""
    signing.asset_name(target.name)
    require(type(record) is dict and set(record) == {'sha256', 'bytes'} and
            type(record['bytes']) is int and 0 <= record['bytes'] <= signing.MAX_ASSET, 'invalid asset record')
    signing.sha_text(record['sha256'])
    fd = os.open(source, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(fd, 'rb') as incoming, os.fdopen(os.open(
            target if directory_fd is None else target.name,
            os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=directory_fd), 'wb') as output:
        before = os.fstat(incoming.fileno())
        require(stat.S_ISREG(before.st_mode) and before.st_nlink == 1 and before.st_size == record['bytes'], 'unsafe source asset')
        digest, size = hashlib.sha256(), 0
        while True:
            chunk = incoming.read(min(1024**2, record['bytes'] - size + 1))
            if not chunk:
                break
            size += len(chunk)
            require(size <= record['bytes'], 'source asset grew')
            digest.update(chunk)
            output.write(chunk)
        after = os.fstat(incoming.fileno())
        require((before.st_ino, before.st_size, before.st_mtime_ns, before.st_ctime_ns) ==
                (after.st_ino, after.st_size, after.st_mtime_ns, after.st_ctime_ns) and
                size == record['bytes'] and digest.hexdigest() == record['sha256'], 'source asset changed or hash differs')


def publish_candidate(staged, output):
    """Reserve once; retain incomplete output on failure, with no completed index."""
    # mkdir is the no-replace operation. A prior exists() check cannot reserve it.
    os.mkdir(output, mode=0o700)
    directory_fd = os.open(output, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    index_identity = None
    try:
        directory_identity = os.fstat(directory_fd)
        def same_directory():
            current = output.lstat()
            require((current.st_dev, current.st_ino) == (directory_identity.st_dev, directory_identity.st_ino),
                    'reserved output directory changed')
        same_directory()
        for path in sorted(staged.iterdir()):
            if path.name != 'candidate-index.json':
                same_directory()
                copy_checked(path, Path(path.name), signing.file_record(path), directory_fd=directory_fd)
        same_directory()
        raw_index = signing.read_file(staged / 'candidate-index.json')
        # This final exclusively created file is never written until every asset succeeds.
        index_fd = os.open('candidate-index.json', os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                           0o600, dir_fd=directory_fd)
        index_identity = os.fstat(index_fd)
        with os.fdopen(index_fd, 'wb') as index_output:
            index_output.write(raw_index)
            index_output.flush()
            os.fsync(index_output.fileno())
        same_directory()
    except BaseException:
        # Only remove our own incomplete index; keep all other files for diagnosis.
        # Uncatchable process/host death may leave a partial index, which fails its pin.
        if index_identity is not None:
            try:
                current = os.stat('candidate-index.json', dir_fd=directory_fd, follow_symlinks=False)
                if (current.st_dev, current.st_ino) == (index_identity.st_dev, index_identity.st_ino):
                    os.unlink('candidate-index.json', dir_fd=directory_fd)
            except FileNotFoundError:
                pass
        raise
    finally:
        os.close(directory_fd)


def selected_metadata(archive, names):
    """Only call after strict USTAR check on our private copied archive; never import it."""
    found = {}
    with gzip.open(archive, 'rb') as stream:
        while True:
            header = stream.read(512)
            require(len(header) == 512, 'truncated validated archive')
            if header == b'\0' * 512:
                break
            require(header[156:157] in (b'0', b'\0') and header[257:265] == b'ustar\x0000', 'only regular USTAR accepted')
            name = header[:100].split(b'\0', 1)[0].decode('ascii')
            prefix = header[345:500].split(b'\0', 1)[0].decode('ascii')
            if prefix:
                name = prefix + '/' + name
            size = int(header[124:136].strip(b' \0') or b'0', 8)
            if name in names:
                require(size <= signing.MAX_METADATA and name not in found, 'selected metadata oversized or duplicate')
                raw = stream.read(size)
                require(len(raw) == size, 'truncated selected metadata')
                found[name] = raw
            else:
                remaining = size
                while remaining:
                    chunk = stream.read(min(1024**2, remaining))
                    require(chunk, 'truncated validated member')
                    remaining -= len(chunk)
            padding = (-size) % 512
            require(stream.read(padding) == b'\0' * padding, 'validated padding changed')
    require(set(found) == set(names), 'required provenance missing')
    return found


def bind_frozen_source(directory, manifest, producer):
    files = manifest['files']
    raw = selected_metadata(directory / manifest['archive']['name'], {'provenance/freeze-manifest.json'})
    freeze = signing.decode(raw['provenance/freeze-manifest.json'])
    require(type(freeze) is dict and freeze.get('schema') == 'rock-build-freeze/2' and
            freeze.get('status') == 'BUILD_COMPLETE_FROZEN' and freeze.get('source_commit') == manifest['source_commit'] and
            freeze.get('files_sha256') == manifest['image_sha256'] and freeze.get('archive_commit_verified') is True and
            type(freeze.get('source_tests')) is dict and freeze['source_tests'].get('status') == 'PASS' and
            freeze['source_tests'].get('source_unchanged') is True, 'exact source-tested frozen build required')
    source_files = freeze.get('source_files_sha256')
    require(type(source_files) is dict and PRODUCER in source_files and BOOTSTRAP in source_files, 'frozen producer/bootstrap absent')
    native = {NATIVE + name[len('native/'):]: record['sha256'] for name, record in files.items() if name.startswith('native/')}
    require(native == {name: digest for name, digest in source_files.items() if name.startswith(NATIVE)}, 'archive native source differs from freeze')
    require(type(producer) is dict and set(producer) == {'path', 'sha256'} and producer['path'] == PRODUCER and
            producer['sha256'] == source_files[PRODUCER], 'producer export differs from frozen producer')
    require(signing.file_record(directory / 'preview.py')['sha256'] == source_files[BOOTSTRAP], 'standalone bootstrap differs from frozen source')
    configuration = freeze.get('configuration_sha256')
    require(type(configuration) is dict and configuration, 'frozen build configuration missing')
    for name, digest in configuration.items():
        signing.asset_name(name)
        require(files.get('provenance/' + name, {}).get('sha256') == signing.sha_text(digest), 'frozen configuration differs')
    for name in DOCS:
        require(signing.file_record(directory / name)['sha256'] == files.get('docs/' + name, {}).get('sha256'), 'standalone documentation differs from archive')


def previous_release(path, pin, source, version):
    previous = signing.pinned(path, pin)
    require(type(previous) is dict and set(previous) == {'schema', 'source_commit', 'version', 'archive_sha256'} and
            previous['schema'] == 'rock-previous-release/1', 'independently pinned previous release required')
    signing.sha_text(previous['source_commit'], 40)
    signing.sha_text(previous['archive_sha256'])
    require(type(previous['version']) is str and re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9.+_-]{0,63}', previous['version']) and
            source != previous['source_commit'] and version != previous['version'],
            'new source and version required; old candidate cannot be relabelled')
    return previous


def prepare(export_directory, export_pin, previous_path, previous_pin, source, version, issued_at, output,
            supplements_directory=None, supplements_pin=None):
    signing.sha_text(source, 40)
    require(type(version) is str and re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9.+_-]{0,63}', version), 'invalid new version')
    require(type(issued_at) is int and 0 < issued_at <= int(time.time()), 'reviewed fixed issue time required')
    require(not output.exists() and not output.is_symlink(), 'output already exists')
    previous = previous_release(previous_path, previous_pin, source, version)
    exported = signing.pinned(export_directory / EXPORT, export_pin)
    require(type(exported) is dict and set(exported) == {'schema', 'status', 'source_commit', 'host_tools_commit', 'version', 'producer', 'assets'} and
            exported['schema'] == 'rock-preview-unsigned-export/1' and exported['status'] == 'UNSIGNED_PACKAGE_NOT_ACCEPTED',
            'new explicit unsigned producer export required; signed envelopes are refused')
    require(exported['source_commit'] == exported['host_tools_commit'] == source and exported['version'] == version,
            'exact new source/host-tools/version required')
    expected_names = {MANIFEST, 'preview.py', *DOCS, 'rockstaros-' + version + '-macos-arm64.tar.gz'}
    require(type(exported['assets']) is dict and set(exported['assets']) == expected_names, 'unexpected producer output inventory')
    signing.check_records(export_directory, exported['assets'], ignored={EXPORT})
    supplements = None
    require((supplements_directory is None) == (supplements_pin is None), 'supplements directory and pin must be supplied together')
    if supplements_directory is not None:
        supplements = signing.pinned(supplements_directory / SUPPLEMENTS, supplements_pin)
        require(type(supplements) is dict and set(supplements) == {'schema', 'source_commit', 'version', 'assets'} and
                supplements['schema'] == 'rock-release-candidate-supplements/1' and supplements['source_commit'] == source and
                supplements['version'] == version and type(supplements['assets']) is dict, 'source-bound supplemental inventory required')
        reserved = expected_names | {EXPORT, SUPPLEMENTS, 'candidate-index.json', *signing.OUTPUT_NAMES}
        require(not (set(supplements['assets']) & reserved), 'supplement attempts to replace package or signing metadata')
        signing.check_records(supplements_directory, supplements['assets'], ignored={SUPPLEMENTS})
    combined = dict(exported['assets'])
    combined[EXPORT] = signing.file_record(export_directory / EXPORT)
    if supplements:
        combined.update(supplements['assets'])
        combined[SUPPLEMENTS] = signing.file_record(supplements_directory / SUPPLEMENTS)
    require(len(combined) <= 128 and all(record['bytes'] > 0 for record in combined.values()) and
            sum(record['bytes'] for record in combined.values()) <= signing.MAX_TOTAL,
            'combined candidate inventory exceeds signing/download bounds')
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='.rock-candidate-', dir=output.parent) as temporary:
        staged = Path(temporary) / 'candidate'
        staged.mkdir(mode=0o700)
        for name, record in exported['assets'].items():
            copy_checked(export_directory / name, staged / name, record)
        copy_checked(export_directory / EXPORT, staged / EXPORT, signing.file_record(export_directory / EXPORT))
        require(signing.file_record(staged / EXPORT)['sha256'] == export_pin, 'export pin changed during copy')
        if supplements:
            for name, record in supplements['assets'].items():
                copy_checked(supplements_directory / name, staged / name, record)
            copy_checked(supplements_directory / SUPPLEMENTS, staged / SUPPLEMENTS, signing.file_record(supplements_directory / SUPPLEMENTS))
            require(signing.file_record(staged / SUPPLEMENTS)['sha256'] == supplements_pin, 'supplements pin changed during copy')
        manifest = signing.decode(signing.read_file(staged / MANIFEST))
        require(type(manifest) is dict and 'signature' not in manifest and 'manifest' not in manifest and
                manifest.get('trust') == 'EXTERNAL_RELEASE_KEY', 'signed/public test envelope cannot be relabelled')
        require(type(manifest.get('legal')) is dict and manifest['legal'].get('status') == 'NOT_CLEARED' and
                type(manifest.get('acceptance')) is dict and manifest['acceptance'].get('status') == 'CANDIDATE',
                'producer must retain NOT_CLEARED/CANDIDATE; bridge cannot promote acceptance')
        require(manifest.get('archive', {}).get('sha256') != previous['archive_sha256'], 'old archive cannot be relabelled')
        index = {'schema': 'rock-release-candidate-inputs/1', 'source_commit': source, 'host_tools_commit': source,
                 'version': version, 'issued_at': issued_at,
                 'assets': {path.name: signing.file_record(path) for path in sorted(staged.iterdir())}}
        (staged / 'candidate-index.json').write_bytes(signing.canonical(index) + b'\n')
        index_pin = signing.file_record(staged / 'candidate-index.json')['sha256']
        signing.candidate(staged, index_pin, source, int(time.time()))
        bind_frozen_source(staged, manifest, exported['producer'])
        publish_candidate(staged, output)
    return {'status': 'UNSIGNED_CANDIDATE_PREPARED_NOT_ACCEPTED', 'source_commit': source, 'version': version,
            'candidate_index_sha256': index_pin, 'export_sha256': export_pin,
            'legal_status': 'NOT_CLEARED', 'acceptance_status': 'CANDIDATE', 'assets': len(index['assets'])}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('export-directory', 'previous-release', 'output'):
        parser.add_argument('--' + name, type=Path, required=True)
    for name in ('export-sha256', 'previous-sha256', 'source', 'version'):
        parser.add_argument('--' + name, required=True)
    parser.add_argument('--issued-at', type=int, required=True)
    parser.add_argument('--supplements-directory', type=Path)
    parser.add_argument('--supplements-sha256')
    args = parser.parse_args()
    result = prepare(args.export_directory, args.export_sha256, args.previous_release, args.previous_sha256,
                     args.source, args.version, args.issued_at, args.output, args.supplements_directory, args.supplements_sha256)
    print(signing.canonical(result).decode())


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, EOFError, zlib.error, KeyError, TypeError, AttributeError, RecursionError):
        print('Candidate preparation refused: independent pins, new unsigned export or frozen provenance differ.', file=sys.stderr)
        sys.exit(1)

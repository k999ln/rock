#!/usr/bin/env python3
"""Snapshot the current reviewable project sources without private runtime state."""
import argparse
from datetime import datetime, timezone
import gzip
import hashlib
import io
import json
from pathlib import Path
import re
import subprocess
import tarfile

ROOT = Path(__file__).resolve().parents[1]
TOP = {'src', 'tests', 'os', 'docs', 'examples', 'schemas', 'scripts', '.github'}
OMIT_PARTS = {'__pycache__', '.git', '.state', 'node_modules', '.venv', 'build', 'dist', '.pytest_cache'}
PUBLIC_TOOL_DIST = frozenset({
    'os/tools/dist/BUILD-MANIFEST.json',
    'os/tools/dist/org.rockstar.citation-organizer--1.0.0.rock.json',
    'os/tools/dist/org.rockstar.proposal-draft--1.0.0.rock.json',
    'os/tools/dist/org.rockstar.proposal-draft--1.1.0.rock.json',
    'os/tools/dist/org.rockstar.utf8-sha256--1.0.0.rock.json',
})
RUNTIME_MAGIC = (b'SQLite format 3\x00', b'QFI\xfb', b'\x7fELF')


def runtime_filename(path):
    name = path.name.lower()
    return (path.suffix.lower() in {'.pyc', '.pyo', '.ext4', '.qcow', '.qcow2'}
            or re.search(r'\.(?:db|sqlite[0-9]*)(?:-(?:journal|wal|shm))?$', name) is not None
            or name in {'vnc-password', 'tunnel.json', 'running.json', 'viewer.json'})


def source_files(root):
    files = []
    for path in sorted(root.rglob('*')):
        relative = path.relative_to(root)
        name = relative.as_posix()
        # Only these five reviewed public fixtures may bypass the dist rule.
        omitted = any(part in OMIT_PARTS and not (part == 'dist' and name in PUBLIC_TOOL_DIST)
                      for part in relative.parts)
        if (omitted or relative.parts[0] == 'artifacts'
                or not (relative.parts[0] in TOP or (len(relative.parts) == 1 and path.suffix in {'.md', '.toml', '.command'})
                        or str(relative) == '.gitignore')):
            continue
        if path.is_symlink():
            raise ValueError('source snapshot refuses symlink: ' + str(relative))
        if not path.is_file():
            continue
        if runtime_filename(path):
            raise ValueError('runtime data found under source roots: ' + str(relative))
        with path.open('rb') as source:
            header = source.read(16)
            if header.startswith(RUNTIME_MAGIC):
                raise ValueError('runtime binary found under source roots: ' + str(relative))
            data = header + source.read()
        files.append((name, data, 0o755 if path.stat().st_mode & 0o111 else 0o644))
    missing = PUBLIC_TOOL_DIST - {name for name, _, _ in files}
    if missing:
        raise ValueError('required public Tool fixture missing: ' + ', '.join(sorted(missing)))
    return files


def snapshot(output):
    files = source_files(ROOT)
    record = {
        'schema': 'rock-source-snapshot/1',
        'created_utc': datetime.now(timezone.utc).isoformat(),
        'git_head': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(),
        'contains_uncommitted_changes': True,
        'scope': 'Current project sources, tests, docs, public development fixtures and preserved evidence; no Git metadata, VM data, private runtime state or OS images',
        'file_sha256': {name: hashlib.sha256(data).hexdigest() for name, data, _ in files},
    }
    manifest = json.dumps(record, ensure_ascii=False, indent=2).encode() + b'\n'
    output.mkdir(parents=True, exist_ok=True)
    archive = output / 'rock-star-os-source.tar.gz'
    with archive.open('wb') as raw, gzip.GzipFile(filename='', mode='wb', fileobj=raw, mtime=0) as gz:
        with tarfile.open(fileobj=gz, mode='w|') as tf:
            for name, data, mode in files + [('SOURCE-SNAPSHOT.json', manifest, 0o644)]:
                entry = tarfile.TarInfo('rock-star-os/' + name)
                entry.size = len(data)
                entry.mode = mode
                tf.addfile(entry, io.BytesIO(data))
    with tarfile.open(archive) as tf:
        observed = {}
        for member in tf:
            if not member.isfile() or not member.name.startswith('rock-star-os/'):
                raise ValueError('unexpected source archive member')
            observed[member.name.removeprefix('rock-star-os/')] = hashlib.sha256(tf.extractfile(member).read()).hexdigest()
    assert observed.pop('SOURCE-SNAPSHOT.json') == hashlib.sha256(manifest).hexdigest()
    assert observed == record['file_sha256']
    (output / 'SOURCE-SNAPSHOT.json').write_bytes(manifest)
    with archive.open('rb') as source:
        digest = hashlib.file_digest(source, 'sha256').hexdigest()
    (output / 'rock-star-os-source.sha256').write_text(digest + '  ' + archive.name + '\n')
    return {'archive': str(archive), 'sha256': digest, 'files': len(files), 'bytes': archive.stat().st_size,
            'git_head': record['git_head'], 'snapshot_manifest_sha256': hashlib.sha256(manifest).hexdigest(), 'full_archive_reopened_and_verified': True}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(snapshot(args.output), indent=2))

#!/usr/bin/env python3
"""Build a reproducible SDK distribution without touching prior archives."""
from pathlib import Path
from tempfile import TemporaryDirectory
import io
import json
import shutil
import struct
import subprocess
import sys
import tarfile
import zlib

def deterministic_gzip(data):
    # Stored DEFLATE blocks have a canonical byte representation independent
    # of Python gzip defaults and zlib's version-specific compressor choices.
    output = bytearray(b'\x1f\x8b\x08\x00\x00\x00\x00\x00\x00\xff')
    offsets = range(0, len(data), 65535) if data else (0,)
    for offset in offsets:
        block = data[offset:offset + 65535]
        final = offset + len(block) == len(data)
        output.append(1 if final else 0)
        output.extend(struct.pack('<HH', len(block), len(block) ^ 0xffff))
        output.extend(block)
    output.extend(struct.pack('<II', zlib.crc32(data) & 0xffffffff, len(data) & 0xffffffff))
    return bytes(output)

root = Path(__file__).resolve().parents[1]
sdk = root / 'toolkits/sky-tool-sdk'
version = json.loads((sdk / 'package.json').read_text())['version']
if version != '0.1.5':
    raise SystemExit('This packager only creates the new 0.1.5 artifact.')
output = root / 'public/toolkits' / f'rockstaros-sky-tool-sdk-{version}.tgz'
files = ['package.json', 'README.md', 'build.mjs', 'bin/create-sky-tool.mjs',
         'src/index.mjs', 'examples/minimal.mjs', 'examples/line-counter.mjs']
with TemporaryDirectory(prefix='sky-sdk-package-') as temporary:
    temp = Path(temporary)
    for name in files:
        target = temp / name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(sdk / name, target)
    subprocess.run(['node', 'build.mjs'], cwd=temp, check=True, timeout=15)
    files.append('dist/index.mjs')
    tarbytes = io.BytesIO()
    with tarfile.open(fileobj=tarbytes, mode='w', format=tarfile.USTAR_FORMAT) as archive:
        for name in sorted(files):
            data = (temp / name).read_bytes()
            info = tarfile.TarInfo('package/' + name)
            info.size, info.mtime, info.uid, info.gid = len(data), 0, 0, 0
            info.uname = info.gname = ''
            info.mode = 0o755 if name == 'bin/create-sky-tool.mjs' else 0o644
            archive.addfile(info, io.BytesIO(data))
    payload = deterministic_gzip(tarbytes.getvalue())
if '--check' in sys.argv:
    if not output.exists() or output.read_bytes() != payload:
        raise SystemExit('0.1.5 SDK archive differs from the explicit build.')
    print(f'{output}: matches deterministic build')
else:
    output.write_bytes(payload)
    print(output)

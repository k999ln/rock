#!/usr/bin/env python3
"""Build a reproducible SDK distribution without touching prior archives."""
from pathlib import Path
from tempfile import TemporaryDirectory
import gzip
import io
import json
import shutil
import subprocess
import sys
import tarfile

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
    buffer = io.BytesIO()
    with gzip.GzipFile(fileobj=buffer, mode='wb', filename='', mtime=0) as compressed:
        compressed.write(tarbytes.getvalue())
    payload = buffer.getvalue()
if '--check' in sys.argv:
    if not output.exists() or output.read_bytes() != payload:
        raise SystemExit('0.1.5 SDK archive differs from the explicit build.')
    print(f'{output}: matches deterministic build')
else:
    output.write_bytes(payload)
    print(output)

"""Reproduce the reviewed official distributions. No upstream source edits."""
import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import shutil
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parent
# Exclude optional interactive frontends and messaging integrations. All
# retained upstream modules are byte-for-byte from the verified wheel.
EXCLUDED = ('hermes_cli/web_dist/', 'hermes_cli/tui_dist/', 'tui_gateway/',
            'plugins/platforms/', 'gateway/run.py', 'hermes_cli/web_server.py',
            'hermes_cli/main.py', 'cli.py')

def prepare():
    manifest = json.loads((ROOT / 'distributions.json').read_text())
    target = ROOT / 'src/vendor'
    temporary = ROOT / 'dist/vendor'
    shutil.rmtree(temporary, ignore_errors=True)
    temporary.mkdir(parents=True)
    for name, distribution in manifest.items():
        with urllib.request.urlopen(distribution['url'], timeout=60) as response:
            data = response.read(16 * 1024 * 1024 + 1)
        if hashlib.sha256(data).hexdigest() != distribution['sha256']:
            raise ValueError(f'Official distribution hash mismatch: {name}')
        with zipfile.ZipFile(io.BytesIO(data)) as wheel:
            for info in wheel.infolist():
                path = PurePosixPath(info.filename)
                if path.is_absolute() or '..' in path.parts or info.file_size > 16 * 1024 * 1024:
                    raise ValueError('Invalid wheel member')
                # Web/TUI browser assets are not part of the headless agent loop.
                if any(info.filename == entry or info.filename.startswith(entry) for entry in EXCLUDED):
                    continue
                if info.is_dir():
                    continue
                destination = temporary.joinpath(*path.parts)
                destination.parent.mkdir(parents=True, exist_ok=True)
                destination.write_bytes(wheel.read(info))
        print(f'Verified {name} {distribution["version"]} {distribution["sha256"]}')
    shutil.rmtree(target, ignore_errors=True)
    temporary.rename(target)

if __name__ == '__main__':
    prepare()

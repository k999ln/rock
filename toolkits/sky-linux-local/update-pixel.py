"""Developer owner update only. Preserve private state, models, jobs and rollback source."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import urllib.request


def digest(path):
    h = hashlib.sha256()
    with path.open('rb') as file:
        for part in iter(lambda: file.read(1024 * 1024), b''):
            h.update(part)
    return h.hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--manifest-sha', required=True)
    args = parser.parse_args()
    os.umask(0o077)
    source = Path(__file__).resolve().parent
    root = Path.home() / 'sky-private'
    manifest_path = source / 'package-manifest.json'
    if digest(manifest_path) != args.manifest_sha:
        raise ValueError('準備した配布物と一致しません。')
    manifest = json.loads(manifest_path.read_text())
    expected = {'server.mjs', 'ui/index.html', 'ui/app.js', 'ui/app.css',
                'toolkits/sky-linux-local/worker.py', 'toolkits/sky-linux-local/runtime-lock.json',
                'toolkits/sky-linux-local/prepare-pixel.py', 'toolkits/sky-linux-local/node-lock.json',
                'toolkits/sky-linux-local/models.json', 'toolkits/sky-linux-local/android-bridge.py',
                'toolkits/sky-linux-local/install-android-bridge.py'}
    if manifest['schema'] != 'sky.pixel-linux-package/1' or set(manifest['files']) != expected:
        raise ValueError('対応する配布物を確認してください。')
    for name, sha in manifest['files'].items():
        file = (source / name).resolve()
        if not file.is_relative_to(source) or digest(file) != sha:
            raise ValueError('配布ファイルの確認に失敗しました。')
    try:
        request = urllib.request.Request('http://127.0.0.1:5199/__sky/linux',
                                         data=b'{"action":"status"}',
                                         headers={'Content-Type': 'application/json', 'Origin': 'http://127.0.0.1:5199'})
        with urllib.request.urlopen(request, timeout=5) as response:
            state = json.load(response)
        if state.get('phase') == 'preparing' or any(r['job']['status'] == 'active' or r['stop'] in ('requested', 'unconfirmed') for r in state['runs']):
            raise ValueError('仕事や準備を停止してから更新してください。')
    except (urllib.error.URLError, TimeoutError):
        raise ValueError('Skyの実行状態を確認できません。既存の仕事を照会してから更新してください。')
    subprocess.run(['sudo', '-n', 'systemctl', 'stop', 'sky-private.service'], check=True)
    backup = root / 'updates' / args.manifest_sha
    if not backup.exists():
        temporary = backup.with_name(backup.name + '.partial')
        if temporary.exists():
            shutil.rmtree(temporary)
        shutil.copytree(root / 'app', temporary / 'app')
        for name in ['worker.py', 'runtime-lock.json', 'runtime-files.json']:
            if (root / name).exists():
                shutil.copyfile(root / name, temporary / name)
        temporary.rename(backup)
    for name in expected:
        dest = root / 'app' / name
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source / name, dest)
        os.chmod(dest, 0o600)
    # The new worker reads both legacy single-model and per-model installations.
    shutil.copyfile(source / 'toolkits/sky-linux-local/worker.py', root / 'worker.py')
    subprocess.run(['sudo', '-n', 'systemctl', 'start', 'sky-private.service'], check=True)
    print('Skyを更新しました。元の担当・仕事・成果は残っています。')


if __name__ == '__main__':
    main()

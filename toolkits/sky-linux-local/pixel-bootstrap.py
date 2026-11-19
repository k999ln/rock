"""Install the reviewed Sky package into the owner's existing Pixel Linux guest."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tarfile
import sys
import time


def digest(path):
    h = hashlib.sha256()
    with path.open('rb') as file:
        for part in iter(lambda: file.read(1024 * 1024), b''):
            h.update(part)
    return h.hexdigest()


def main():
    os.umask(0o077)
    if sys.platform != 'linux' or os.uname().machine != 'aarch64':
        raise ValueError('Pixel本体のLinuxで準備してください。')
    source = Path(__file__).resolve().parent
    root = Path.home() / 'sky-private'
    root.mkdir(mode=0o700, exist_ok=True)
    manifest = json.loads((source / 'package-manifest.json').read_text())
    if manifest['schema'] != 'sky.pixel-linux-package/1':
        raise ValueError('対応する配布ファイルを確認してください。')
    for name, sha in manifest['files'].items():
        path = (source / name).resolve()
        if not path.is_relative_to(source) or digest(path) != sha:
            raise ValueError('配布ファイルが準備時と異なります。')
    node = json.loads((source / 'toolkits/sky-linux-local/node-lock.json').read_text())
    archive = source / 'node.tar.xz'
    if archive.stat().st_size != node['bytes'] or digest(archive) != node['sha256']:
        raise ValueError('Node実行環境の確認に失敗しました。')
    node_root = root / 'node'
    node_root.mkdir(mode=0o700, exist_ok=True)
    with tarfile.open(archive) as package:
        package.extractall(node_root, filter='data')
    binary = node_root / node['archiveName'].removesuffix('.tar.xz') / 'bin/node'
    if subprocess.check_output([str(binary), '--version'], text=True).strip() != node['version']:
        raise ValueError('Nodeの版が一致しません。')
    app = root / 'app'
    pid_file = root / 'server.pid'
    if pid_file.exists():
        pid = int(pid_file.read_text())
        process = Path('/proc') / str(pid) / 'cmdline'
        if process.exists() and str(app / 'server.mjs').encode() in process.read_bytes():
            print('Skyは既に起動しています。更新する場合は先に終了してください。')
            return
    for name in manifest['files']:
        dest = app / name
        dest.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        shutil.copyfile(source / name, dest)
        os.chmod(dest, 0o600)
    environment = dict(os.environ)
    environment['SKY_PIXEL_DISTRIBUTION'] = str(source)
    with (root / 'server.log').open('ab') as log:
        server = subprocess.Popen([str(binary), str(app / 'server.mjs')], stdin=subprocess.DEVNULL,
                                  stdout=log, stderr=log, start_new_session=True, env=environment)
    time.sleep(1)
    if server.poll() is not None:
        raise ValueError('Skyの画面を起動できませんでした。')
    value = {'schema': 'sky.pixel-linux-bootstrap/1', 'platform': sys.platform,
             'architecture': os.uname().machine, 'kernel': os.uname().release,
             'bootId': Path('/proc/sys/kernel/random/boot_id').read_text().strip(),
             'manifestSha256': digest(source / 'package-manifest.json'), 'node': node['version'],
             'pid': server.pid, 'url': 'http://127.0.0.1:5199/', 'pcInference': False}
    (source / 'bootstrap-receipt.json').write_text(json.dumps(value, ensure_ascii=False, indent=2))
    print('このPixel内でSkyを起動しました。')
    print('Terminalの設定でポート5199を端末内だけに転送し、ブラウザで http://127.0.0.1:5199/ を開いてください。')
    print('画面・依頼の管理・AIの計算・保存は、このPixel内で動きます。一般公開はしていません。')


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print('準備できませんでした: ' + str(error))
        sys.exit(1)

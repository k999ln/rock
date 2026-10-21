"""Prepare reviewed local text inference on the Pixel's existing Debian guest."""
import ctypes
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tarfile
import signal
import urllib.request
import urllib.parse
import re

ROOT = Path.home() / 'sky-private'


def progress(label, received=0):
    if '--progress' in sys.argv:
        print(json.dumps({'progress': {'label': label, 'receivedBytes': received}}, ensure_ascii=False), flush=True)


class ModelRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        url = urllib.parse.urlparse(newurl)
        if url.scheme != 'https' or url.username or url.password or url.port not in (None, 443) or not (
                url.hostname == 'huggingface.co' or (url.hostname or '').endswith('.huggingface.co') or
                url.hostname == 'hf.co' or (url.hostname or '').endswith('.hf.co')):
            raise ValueError('AIの配布先を確認できません。')
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def validate(model):
    if not re.fullmatch(r'[a-z0-9][a-z0-9.-]{0,79}', model.get('id', '')) or '..' in model.get('id', ''):
        raise ValueError('AIの名前を確認してください。')
    if not re.fullmatch(r'[a-f0-9]{64}', model.get('sha256', '')) or not isinstance(model.get('bytes'), int) or not 1024 <= model['bytes'] <= 1610612736:
        raise ValueError('AIの容量と版を確認してください。')
    if model.get('promptFormat', 'chatml') not in ('chatml', 'llama3'):
        raise ValueError('このAIの文章形式はまだ使えません。')
    return model


def acquire(model, distribution):
    destination = ROOT / 'models' / model['id'] / 'model.gguf'
    destination.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    temporary = destination.with_suffix('.part')
    temporary.unlink(missing_ok=True)
    if destination.exists() and destination.stat().st_size == model['bytes'] and sha(destination) == model['sha256']:
        progress('保存済みのAIを確認して再利用します')
        return destination
    if shutil.disk_usage(ROOT).free < model['bytes'] + 256 * 1024 * 1024:
        raise ValueError('AIを保存する空き容量が足りません。不要なファイルを整理してください。')
    try:
        for local in [ROOT / 'model.gguf', distribution / 'model.gguf', distribution / 'models' / (model['sha256'] + '.gguf'), *sorted((ROOT / 'models').glob('*/model.gguf'))]:
            if local.exists() and not local.is_symlink() and local.stat().st_size == model['bytes'] and sha(local) == model['sha256']:
                progress('このPixelにあるAIを準備しています')
                try:
                    os.link(local, temporary)
                except OSError:
                    shutil.copyfile(local, temporary)
                break
        else:
            if not re.fullmatch(r'[A-Za-z0-9_-]+/[A-Za-z0-9_.-]+', model.get('repository', '')) or not re.fullmatch(r'[a-f0-9]{40}', model.get('revision', '')) or not re.fullmatch(r'[A-Za-z0-9_.-]+\.gguf', model.get('file', '')) or '..' in model['file']:
                raise ValueError('このAIを取得する固定版の配布元がありません。設定ファイルを確認してください。')
            url = f"https://huggingface.co/{model['repository']}/resolve/{model['revision']}/{model['file']}"
            progress('AIを取得しています。依頼の文章は送信しません')
            opener = urllib.request.build_opener(ModelRedirect())
            with opener.open(url, timeout=30) as response, temporary.open('wb') as output:
                size = 0
                reported = 0
                while True:
                    block = response.read(1024 * 1024)
                    if not block:
                        break
                    size += len(block)
                    if size > model['bytes']:
                        raise ValueError('取得したAIの容量が設定と一致しません。')
                    output.write(block)
                    if size - reported >= 8 * 1024 * 1024:
                        progress('AIを取得しています', size)
                        reported = size
        progress('取得したAIの中身を確認しています', temporary.stat().st_size)
        with temporary.open('rb') as file:
            magic = file.read(4)
        if temporary.stat().st_size != model['bytes'] or sha(temporary) != model['sha256'] or magic != b'GGUF':
            raise ValueError('取得したAIの中身が設定と一致しません。追加した設定を確認してください。')
        temporary.replace(destination)
        os.chmod(destination, 0o600)
    finally:
        temporary.unlink(missing_ok=True)
    return destination


def sha(path):
    h = hashlib.sha256()
    with path.open('rb') as src:
        for block in iter(lambda: src.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def extract(archive, destination):
    destination.mkdir(parents=True, exist_ok=True)
    with tarfile.open(archive) as package:
        # Only the hash-pinned official archive is accepted; keep extraction in its own directory.
        for member in package.getmembers():
            path = (destination / member.name).resolve()
            if not path.is_relative_to(destination.resolve()):
                raise ValueError('実行環境の保存先が不正です。')
            if member.issym() and not (path.parent / member.linkname).resolve().is_relative_to(destination.resolve()):
                raise ValueError('実行環境のリンク先が不正です。')
        package.extractall(destination, filter='data')


def main():
    os.umask(0o077)
    if sys.platform != 'linux' or os.uname().machine != 'aarch64':
        raise ValueError('対応するPixel内Linuxで準備してください。')
    app = ROOT / 'app'
    distribution = Path(os.environ['SKY_PIXEL_DISTRIBUTION'])
    lock = json.loads((app / 'toolkits/sky-linux-local/runtime-lock.json').read_text())
    raw = sys.stdin.buffer.read(8193)
    if len(raw) > 8192:
        raise ValueError('AIの設定が長すぎます。')
    model = validate(json.loads(raw) if raw else lock['model'])
    progress('このPixelのメモリと保存容量を確認しています')
    memory_kib = int(Path('/proc/meminfo').read_text().splitlines()[0].split()[1])
    if memory_kib < max(2048, model.get('memoryMiB', 2048)) * 1024:
        return {'ready': False, 'errorCode': 'memory-too-small'}
    archive = distribution / 'runtime.tar.gz'
    if archive.stat().st_size != lock['bytes'] or sha(archive) != lock['sha256']:
        raise ValueError('実行環境の照合に失敗しました。')
    try:
        ctypes.CDLL('libgomp.so.1')
    except OSError:
        subprocess.run(['sudo', '-n', 'apt-get', 'update'], check=True, stdout=subprocess.DEVNULL)
        subprocess.run(['sudo', '-n', 'apt-get', 'install', '-y', '--no-install-recommends', 'libgomp1'], check=True, stdout=subprocess.DEVNULL)
    progress('必要な実行機能を準備しています')
    extract(archive, ROOT / 'runtime')
    acquire(model, distribution)
    model_lock = ROOT / 'models' / model['id'] / 'model.json'
    model_lock.write_text(json.dumps(model, ensure_ascii=False))
    shutil.copyfile(app / 'toolkits/sky-linux-local/worker.py', ROOT / 'worker.py')
    shutil.copyfile(app / 'toolkits/sky-linux-local/runtime-lock.json', ROOT / 'runtime-lock.json')
    progress('AIを動かせるか確認しています', model['bytes'])
    result = subprocess.run(['python3', str(ROOT / 'worker.py'), 'prepare', model['id']], capture_output=True, text=True, check=True)
    value = json.loads(result.stdout)
    value.update({'executionTarget': 'pixel-linux', 'bootId': Path('/proc/sys/kernel/random/boot_id').read_text().strip(), 'kernel': os.uname().release, 'memoryKiB': memory_kib})
    return value


if __name__ == '__main__':
    def cancelled(signum, frame):
        raise InterruptedError('準備を停止しました。途中の取得ファイルは残しません。')
    signal.signal(signal.SIGTERM, cancelled)
    try:
        print(json.dumps(main(), ensure_ascii=False))
    except Exception as error:
        safe = str(error) if isinstance(error, (ValueError, InterruptedError)) else 'AIを準備できませんでした。通信・空き容量・配布ファイルを確認して、もう一度準備してください。'
        print(json.dumps({'error': safe}, ensure_ascii=False))
        sys.exit(1)

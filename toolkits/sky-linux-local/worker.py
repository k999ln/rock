"""Fixed Linux text runner. Model output has no tool, network or shell authority."""
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import resource
import signal
import subprocess
import sys
import time

ROOT = Path.home() / 'sky-private'


def save(path, value):
    temp = path.with_suffix('.tmp')
    with temp.open('w') as out:
        os.chmod(temp, 0o600)
        json.dump(value, out, ensure_ascii=False)
        out.flush()
        os.fsync(out.fileno())
    temp.replace(path)


def digest(path):
    h = hashlib.sha256()
    with path.open('rb') as source:
        for block in iter(lambda: source.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def selected_model(key=None):
    runtime = json.loads((ROOT / 'runtime-lock.json').read_text())
    if key is None:
        return runtime['model'], ROOT / 'model.gguf', runtime
    if not re.fullmatch(r'[a-z0-9][a-z0-9.-]{0,79}', key) or '..' in key:
        raise ValueError('追加したAIを選んでください。')
    folder = ROOT / 'models' / key
    if not (folder / 'model.json').exists() and key == runtime['model']['id']:
        return runtime['model'], ROOT / 'model.gguf', runtime
    model = json.loads((folder / 'model.json').read_text())
    if model['id'] != key or model.get('promptFormat', 'chatml') not in ('chatml', 'llama3'):
        raise ValueError('AIの設定が準備時と異なります。')
    return model, folder / 'model.gguf', runtime


def job_dir(key):
    if not re.fullmatch(r'[a-f0-9-]{36}', key):
        raise ValueError('仕事の番号を確認してください。')
    path = ROOT / 'jobs' / key
    path.mkdir(parents=True, exist_ok=True, mode=0o700)
    return path


def identity(pid):
    try:
        stat = Path(f'/proc/{pid}/stat').read_text().split(') ', 1)[1].split()
        return {'pid': pid, 'start': stat[19], 'boot': Path('/proc/sys/kernel/random/boot_id').read_text().strip()}
    except (FileNotFoundError, ProcessLookupError):
        return None


def alive(receipt):
    return receipt and identity(receipt['pid']) == receipt


def stop(key):
    path = job_dir(key)
    # Persist cancellation even when the run has not yet obtained its lock.
    (path / 'cancel').touch(mode=0o600, exist_ok=True)
    with (path / 'guard').open('a') as guard:
        fcntl.flock(guard, fcntl.LOCK_EX)
        receipt = json.loads((path / 'process.json').read_text()) if (path / 'process.json').exists() else None
        if alive(receipt):
            try:
                os.killpg(receipt['pid'], signal.SIGTERM)
            except ProcessLookupError:
                pass
            end = time.monotonic() + 2
            while alive(receipt) and time.monotonic() < end:
                time.sleep(0.04)
            if alive(receipt):
                try:
                    os.killpg(receipt['pid'], signal.SIGKILL)
                except ProcessLookupError:
                    pass
                end = time.monotonic() + 2
                while alive(receipt) and time.monotonic() < end:
                    time.sleep(0.04)
        confirmed = not alive(receipt)
        if confirmed:
            (path / 'output.txt').unlink(missing_ok=True)
        save(path / 'stop.json', {'confirmed': confirmed, 'at': time.time()})
        return {'confirmed': confirmed}


def limits():
    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
    resource.setrlimit(resource.RLIMIT_CPU, (170, 170))
    resource.setrlimit(resource.RLIMIT_FSIZE, (1024 * 1024, 1024 * 1024))
    resource.setrlimit(resource.RLIMIT_NOFILE, (128, 128))


def stop_all():
    jobs = ROOT / 'jobs'
    results = []
    for path in jobs.iterdir() if jobs.exists() else []:
        if not path.is_dir() or not re.fullmatch(r'[a-f0-9-]{36}', path.name):
            continue
        record = path / 'process.json'
        receipt = json.loads(record.read_text()) if record.exists() else None
        # Completed jobs retain their original output. Active/queued work is also
        # cancelled by the manager before this environment-wide stop is invoked.
        if alive(receipt):
            results.append(stop(path.name))
    return {'confirmed': all(r['confirmed'] for r in results)}


def run(data):
    if set(data) not in ({'jobId', 'input', 'instructions', 'modelSha256'}, {'jobId', 'input', 'instructions', 'modelSha256', 'modelId'}):
        raise ValueError('依頼の項目を確認してください。')
    if any(not isinstance(data[k], str) or not data[k].strip() or len(data[k]) > n
           for k, n in [('input', 4000), ('instructions', 1200)]):
        raise ValueError('依頼や担当の説明が長すぎるか、空になっています。')
    path = job_dir(data['jobId'])
    descriptor, model, lock = selected_model(data.get('modelId'))
    if data['modelSha256'] != descriptor['sha256'] or model.stat().st_size != descriptor['bytes'] or digest(model) != data['modelSha256']:
        raise ValueError('モデルが追加時と異なります。環境を準備し直してください。')
    binary = ROOT / 'runtime' / lock['directory'] / 'llama-completion'
    binary_manifest = json.loads((ROOT / 'runtime-files.json').read_text())
    for name, sha in binary_manifest.items():
        if digest(binary.parent / name) != sha:
            raise ValueError('実行環境が準備時と異なります。環境を準備し直してください。')
    with (path / 'guard').open('a') as guard, (path / 'once').open('a') as once:
        fcntl.flock(once, fcntl.LOCK_EX | fcntl.LOCK_NB)
        fcntl.flock(guard, fcntl.LOCK_EX)
        if (path / 'cancel').exists():
            return {'cancelled': True}
        if (path / 'started').exists():
            raise ValueError('同じ仕事を再実行しません。保存された状態を確認してください。')
        (path / 'started').touch(mode=0o600)
        # Chat roles remain text only; the executable and all flags are fixed.
        def clean(s):
            return s.replace('<|', '＜｜').replace('|>', '｜＞')
        system = clean(data['instructions']) + '\n日本語で依頼に直接答えてください。下書きだけを作り、外部操作をしたと主張しないでください。'
        if descriptor.get('promptFormat', 'chatml') == 'llama3':
            prompt = '<|begin_of_text|><|start_header_id|>system<|end_header_id|>\n\n' + system + '<|eot_id|><|start_header_id|>user<|end_header_id|>\n\n' + clean(data['input']) + '<|eot_id|><|start_header_id|>assistant<|end_header_id|>\n\n'
        else:
            prompt = '<|im_start|>system\n' + system + '<|im_end|>\n<|im_start|>user\n' + clean(data['input']) + '<|im_end|>\n<|im_start|>assistant\n'
        prompt_file = path / 'prompt.txt'
        prompt_file.write_text(prompt)
        os.chmod(prompt_file, 0o600)
        with (path / 'output.txt').open('wb') as out, (path / 'runtime.log').open('wb') as err:
            child = subprocess.Popen([str(binary), '-m', str(model), '-f', str(prompt_file),
                                      '-n', '512', '-c', '4096', '-t', '2', '--no-conversation',
                                      '--no-display-prompt', '--simple-io', '--no-warmup',
                                      '--temp', '0', '--seed', '42', '--repeat-penalty', '1.1', '--repeat-last-n', '128'],
                                     stdin=subprocess.DEVNULL, stdout=out, stderr=err,
                                     start_new_session=True, preexec_fn=limits,
                                     env={'PATH': '/usr/bin:/bin', 'HOME': str(path),
                                          'LD_LIBRARY_PATH': str(binary.parent), 'LANG': 'C.UTF-8'})
            receipt = identity(child.pid)
            save(path / 'process.json', receipt)
            fcntl.flock(guard, fcntl.LOCK_UN)
            started = time.monotonic()
            try:
                child.wait(timeout=180)
            except subprocess.TimeoutExpired:
                os.killpg(child.pid, signal.SIGKILL)
                child.wait()
                raise ValueError('3分を超えたため停止しました。依頼を短くしてください。')
            finally:
                prompt_file.unlink(missing_ok=True)
        if (path / 'cancel').exists():
            (path / 'output.txt').unlink(missing_ok=True)
            return {'cancelled': True}
        if child.returncode != 0:
            raise ValueError('モデルを実行できませんでした。環境の準備を確認してください。')
        # The completion program appends this framing marker; preserve raw bytes on disk.
        raw_text = (path / 'output.txt').read_text()
        text = re.sub(r'\s*\[end of text\]\s*$', '', raw_text).strip()
        if not text or len(text.encode()) > 32768:
            raise ValueError('成果が空か、保存できる長さを超えています。')
        return {'text': text, 'rawOutputSha256': digest(path / 'output.txt'), 'durationMs': round((time.monotonic() - started) * 1000),
                'modelSha256': data['modelSha256'], 'platform': sys.platform, 'architecture': os.uname().machine}


def main():
    os.umask(0o077)
    if sys.platform != 'linux':
        raise ValueError('この実行機能はLinux専用です。')
    if sys.argv[1] == 'stop':
        return stop(sys.argv[2])
    if sys.argv[1] == 'stop-all':
        return stop_all()
    if sys.argv[1] == 'run':
        raw = sys.stdin.buffer.read(32001)
        if len(raw) > 32000:
            raise ValueError('依頼が大きすぎます。')
        return run(json.loads(raw))
    if sys.argv[1] == 'prepare':
        descriptor, model, lock = selected_model(sys.argv[2] if len(sys.argv) > 2 else None)
        if model.stat().st_size != descriptor['bytes'] or digest(model) != descriptor['sha256']:
            raise ValueError('モデルの確認に失敗しました。')
        files = ROOT / 'runtime' / lock['directory']
        save(ROOT / 'runtime-files.json', {p.name: digest(p) for p in files.iterdir() if p.is_file() and not p.is_symlink()})
        check = subprocess.run([str(files / 'llama-cli'), '--version'], capture_output=True, timeout=15)
        if check.returncode:
            raise ValueError('このLinuxでは実行環境を起動できません。')
        return {'ready': True, 'platform': sys.platform, 'architecture': os.uname().machine, 'modelSha256': descriptor['sha256']}
    raise ValueError('対応する操作を選んでください。')


if __name__ == '__main__':
    try:
        print(json.dumps(main(), ensure_ascii=False))
    except Exception as error:
        print(json.dumps({'error': str(error)}, ensure_ascii=False))
        sys.exit(1)

"""Fixed Linux text runner. Model output has no tool, network or shell authority."""
import fcntl
import math
import hashlib
import json
import os
from pathlib import Path
import re
import resource
import signal
import subprocess
import stat
import tempfile
import threading
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



# Diagnostics are evidence only. They never authorize, replay or complete a job.
DIAGNOSTIC_LIMIT = 16384
OUTPUT_LIMIT = 1024 * 1024  # Existing child RLIMIT_FSIZE, not an increased limit.
OUTPUT_POLL_SECONDS = 0.25


def byte_metadata(value):
    raw = value.encode('utf-8')
    return {'characters': len(value), 'bytes': len(raw),
            'sha256': hashlib.sha256(raw).hexdigest()}


def monotonic_domain():
    try:
        return hashlib.sha256(Path('/proc/sys/kernel/random/boot_id').read_bytes()).hexdigest()
    except OSError:
        return None


def private_regular_read(path, limit):
    """Never wait for a FIFO/device or follow a link to collect optional evidence."""
    before = path.lstat()
    if not stat.S_ISREG(before.st_mode) or before.st_uid != os.getuid() or before.st_mode & 0o077 or before.st_nlink != 1 or before.st_size > limit:
        raise OSError('Optional evidence unavailable')
    fd = os.open(path, os.O_RDONLY | os.O_NONBLOCK | os.O_NOFOLLOW)
    try:
        after = os.fstat(fd)
        if (before.st_dev, before.st_ino) != (after.st_dev, after.st_ino) or not stat.S_ISREG(after.st_mode) or after.st_uid != os.getuid() or after.st_mode & 0o077 or after.st_nlink != 1 or after.st_size > limit:
            raise OSError('Optional evidence unavailable')
        return os.fdopen(fd, 'rb')
    except BaseException:
        os.close(fd)
        raise


def diagnostic(path, section, fields):
    """Merge bounded private evidence under its own lock; never break a stop."""
    temp = None
    try:
        lock_path = path / 'diagnostics.lock'
        try:
            before = lock_path.lstat()
        except FileNotFoundError:
            before = None
        if before is not None:
            if not stat.S_ISREG(before.st_mode) or before.st_uid != os.getuid() or before.st_mode & 0o077 or before.st_nlink != 1:
                return False
        flags = os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW | os.O_NONBLOCK
        fd = os.open(lock_path, flags, 0o600)
        with os.fdopen(fd, 'r+b') as lock:
            info = os.fstat(lock.fileno())
            if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o077 or info.st_nlink != 1:
                return False
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            target = path / 'diagnostics.json'
            value = {'schema': 'rockstaros.pixel-worker-diagnostics/1', 'jobId': path.name,
                     'evidenceOnly': True}
            try:
                target.lstat()
                present = True
            except FileNotFoundError:
                present = False
            if present:
                with private_regular_read(target, DIAGNOSTIC_LIMIT) as source:
                    value = json.loads(source.read(DIAGNOSTIC_LIMIT + 1))
                if not isinstance(value, dict) or value.get('schema') != 'rockstaros.pixel-worker-diagnostics/1' or value.get('jobId') != path.name:
                    return False
            previous = value.get(section, {})
            if section == 'stop':
                fields = {**fields, 'termSent': previous.get('termSent', False) or fields.get('termSent', False),
                          'killSent': previous.get('killSent', False) or fields.get('killSent', False),
                          'firstRequestedMonotonicNs': previous.get('firstRequestedMonotonicNs', fields['requestedMonotonicNs'])}
                if previous.get('outputAtStop', {}).get('available') and not fields.get('outputAtStop', {}).get('available'):
                    fields['outputAtStop'] = previous['outputAtStop']
            value[section] = {**previous, **fields}
            raw = json.dumps(value, ensure_ascii=True, allow_nan=False, separators=(',', ':')).encode()
            if len(raw) > DIAGNOSTIC_LIMIT:
                return False
            tempfd, name = tempfile.mkstemp(prefix='.diagnostics-', dir=path)
            temp = Path(name)
            with os.fdopen(tempfd, 'wb') as output:
                os.fchmod(output.fileno(), 0o600)
                output.write(raw)
                output.flush()
                os.fsync(output.fileno())
            os.replace(temp, target)
            directory = os.open(path, os.O_RDONLY | getattr(os, 'O_DIRECTORY', 0))
            try:
                os.fsync(directory)
            finally:
                os.close(directory)
            return True
    except Exception:
        # Optional/corrupt evidence must never change execution or stop outcomes.
        return False
    finally:
        if temp is not None:
            try:
                temp.unlink(missing_ok=True)
            except OSError:
                pass


def child_cpu():
    try:
        usage = resource.getrusage(resource.RUSAGE_CHILDREN)
        return (usage.ru_utime, usage.ru_stime, usage.ru_maxrss)
    except (AttributeError, OSError, ValueError):
        return None


def cpu_delta(before, after):
    if before is None or after is None or any(not math.isfinite(x) for x in (*before[:2], *after[:2])) or any(a < b for a, b in zip(after[:2], before[:2])):
        return {'available': False}
    maximum_rss = {'available': False}
    if len(after) > 2 and math.isfinite(after[2]) and after[2] >= 0:
        maximum_rss = {'available': True, 'raw': after[2],
                       'unit': 'KiB' if sys.platform == 'linux' else 'bytes' if sys.platform == 'darwin' else 'unknown',
                       'scope': 'RUSAGE_CHILDREN process-lifetime high-water; not a delta; may include earlier children'}
    return {'available': True, 'userSeconds': after[0] - before[0],
            'systemSeconds': after[1] - before[1],
            'maximumResidentSetSize': maximum_rss,
            'method': 'RUSAGE_CHILDREN delta; one child in this worker process'}


def small_text(path, limit=8192):
    try:
        with path.open('rb') as source:
            raw = source.read(limit + 1)
        return raw.decode('utf-8') if len(raw) <= limit else None
    except (OSError, UnicodeError):
        return None


def pressure_snapshot():
    """Two bounded snapshots, no raw /proc data or periodic memory polling."""
    value = {'memAvailableKiB': None, 'cgroupOomCounters': None, 'cgroupScopeSha256': None,
             'scope': 'guest memory / current cgroup; counters do not attribute an OOM to this child'}
    text = small_text(Path('/proc/meminfo'))
    found = re.search(r'^MemAvailable:\s+(\d+) kB$', text or '', re.M)
    if found:
        value['memAvailableKiB'] = int(found[1])
    group = small_text(Path('/proc/self/cgroup'), 4096)
    match = re.search(r'^0::(/[^\n]*)$', group or '', re.M)
    if match and '..' not in Path(match[1]).parts:
        events = Path('/sys/fs/cgroup') / match[1].lstrip('/') / 'memory.events'
        contents = small_text(events, 4096)
        if contents is not None:
            counters = {}
            for key in ('oom', 'oom_kill', 'oom_group_kill'):
                entry = re.search(r'^' + key + r' (\d+)$', contents, re.M)
                if entry:
                    counters[key] = int(entry[1])
            value['cgroupOomCounters'] = counters or None
            value['cgroupScopeSha256'] = hashlib.sha256(str(events).encode()).hexdigest()
    return value


def oom_delta(before, after):
    a, b = before.get('cgroupOomCounters'), after.get('cgroupOomCounters')
    if not a or not b or not before.get('cgroupScopeSha256') or before['cgroupScopeSha256'] != after.get('cgroupScopeSha256'):
        return None
    if set(a) != set(b) or any(b[k] < a[k] for k in a):
        return None
    return {k: b[k] - a[k] for k in a}


class OutputObservation:
    """Read <=1MiB from an already-open private inode, <=64KiB per read.

    Two diagnostic writes at most: first stdout observed, then final observation.
    The open fd preserves hashes after stop unlinks output.txt. Stdout bytes are
    not necessarily generated tokens; scheduling/stdio can delay observation.
    """
    def __init__(self, path):
        self.path = path
        self.source = private_regular_read(path / 'output.txt', OUTPUT_LIMIT)
        self.done = threading.Event()
        self.thread = threading.Thread(target=self.observe, daemon=True)
        self.first = None
        self.last_empty = None  # A start timestamp is not an empty-file observation.
        self.count = 0
        self.hash = hashlib.sha256()
        self.available = True
        try:
            self.thread.start()
        except RuntimeError:
            self.source.close()
            raise

    def sample(self):
        if os.fstat(self.source.fileno()).st_size > OUTPUT_LIMIT:
            self.available = False
            return
        for _ in range(16):
            block = self.source.read(min(65536, OUTPUT_LIMIT - self.count + 1))
            now = time.monotonic_ns()
            if not block:
                if self.first is None:
                    self.last_empty = now
                return
            if self.count + len(block) > OUTPUT_LIMIT:
                self.available = False
                return
            self.count += len(block)
            self.hash.update(block)
            if self.first is None:
                self.first = now
                diagnostic(self.path, 'output', {
                    'firstObservedMonotonicNs': now,
                    'previousEmptyObservationMonotonicNs': self.last_empty,
                    'pollIntervalSeconds': OUTPUT_POLL_SECONDS,
                    'precision': 'stdout bytes observed; scheduling and buffering delay unbounded; not first token/load/prefill timing',
                    'bytes': self.count, 'sha256': self.hash.hexdigest(),
                    'complete': False})

    def observe(self):
        try:
            while not self.done.wait(OUTPUT_POLL_SECONDS):
                self.sample()
            self.sample()
        except Exception:
            self.available = False
        finally:
            self.source.close()

    def finish(self, child_reaped):
        self.done.set()
        self.thread.join(timeout=0.05)
        if self.thread.is_alive():
            diagnostic(self.path, 'output', {'available': False, 'complete': False,
                'reason': 'observer_not_finished_without_waiting'})
            return
        diagnostic(self.path, 'output', {
            'available': self.available, 'bytes': self.count,
            'sha256': self.hash.hexdigest() if self.available else None,
            'complete': child_reaped and self.available,
            'firstObservedMonotonicNs': self.first,
            'previousEmptyObservationMonotonicNs': self.last_empty,
            'pollIntervalSeconds': OUTPUT_POLL_SECONDS,
            'precision': 'stdout bytes observed; scheduling and buffering delay unbounded; not first token/load/prefill timing',
            'finalObservedMonotonicNs': time.monotonic_ns(),
            'generatedTokens': None})


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
    requested_ns = time.monotonic_ns()
    term_sent = kill_sent = False
    # Persist cancellation even when the run has not yet obtained its lock.
    (path / 'cancel').touch(mode=0o600, exist_ok=True)
    with (path / 'guard').open('a') as guard:
        fcntl.flock(guard, fcntl.LOCK_EX)
        receipt = json.loads((path / 'process.json').read_text()) if (path / 'process.json').exists() else None
        if alive(receipt):
            try:
                os.killpg(receipt['pid'], signal.SIGTERM)
                term_sent = True
            except ProcessLookupError:
                pass
            end = time.monotonic() + 2
            while alive(receipt) and time.monotonic() < end:
                time.sleep(0.04)
            if alive(receipt):
                try:
                    os.killpg(receipt['pid'], signal.SIGKILL)
                    kill_sent = True
                except ProcessLookupError:
                    pass
                end = time.monotonic() + 2
                while alive(receipt) and time.monotonic() < end:
                    time.sleep(0.04)
        confirmed = not alive(receipt)
        # Optional output reads/hashes must never stand between real stop and cleanup.
        observed_output = {'available': False, 'reason': 'stop_priority_no_output_read'}
        if confirmed:
            try:
                (path / 'output.txt').unlink(missing_ok=True)
            except OSError as error:
                try:
                    if not stat.S_ISDIR((path / 'output.txt').lstat().st_mode):
                        raise error
                except FileNotFoundError:
                    pass
                # Never recurse into an unexpected directory (EPERM on macOS).
        save(path / 'stop.json', {'confirmed': confirmed, 'at': time.time()})
    # Release the execution guard before any optional diagnostic write.
    diagnostic(path, 'stop', {'requestedMonotonicNs': requested_ns,
        'monotonicDomainSha256': monotonic_domain(),
        'observedMonotonicNs': time.monotonic_ns(), 'confirmed': confirmed,
        'termSent': term_sent, 'killSent': kill_sent, 'outputAtStop': observed_output,
        'exitCode': None, 'cpuLimitReached': None})
    return {'confirmed': confirmed}


def limits(cpu_seconds=170):
    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
    resource.setrlimit(resource.RLIMIT_CPU, (cpu_seconds, cpu_seconds))
    resource.setrlimit(resource.RLIMIT_FSIZE, (1024 * 1024, 1024 * 1024))
    resource.setrlimit(resource.RLIMIT_NOFILE, (128, 128))


def prepare_child(cpu_seconds, parent_pid):
    # A manager timeout may kill this Python worker before its wait/finally runs.
    # Keep the model in its own stoppable group, and kill it if that worker dies.
    import ctypes
    libc = ctypes.CDLL(None, use_errno=True)
    if libc.prctl(1, signal.SIGKILL, 0, 0, 0) != 0:  # Linux PR_SET_PDEATHSIG
        raise OSError(ctypes.get_errno(), 'Cannot bind model lifetime to worker')
    if os.getppid() != parent_pid:
        os.kill(os.getpid(), signal.SIGKILL)
        raise RuntimeError('Worker exited before model startup')
    limits(cpu_seconds)


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


def execution_limits(data, now_ms=None):
    """Legacy requests retain their cap; common requests must provide both limits."""
    keys = set(data)
    required = {'jobId', 'input', 'instructions', 'modelSha256'}
    extra = keys - required
    if not required <= keys or extra not in (set(), {'modelId'},
            {'maxOutputTokens', 'deadline'}, {'modelId', 'maxOutputTokens', 'deadline'}):
        raise ValueError('依頼の項目を確認してください。')
    if 'deadline' not in data:
        return {'tokens': 512, 'wall_seconds': 180, 'cpu_seconds': 170}
    now_ms = time.time() * 1000 if now_ms is None else now_ms
    if type(data['maxOutputTokens']) is not int or not 1 <= data['maxOutputTokens'] <= 1024:
        raise ValueError('承認された出力上限を確認してください。')
    if type(data['deadline']) is not int or not 0 < data['deadline'] - now_ms <= 120000:
        raise ValueError('承認された実行期限を確認してください。')
    wall = (data['deadline'] - now_ms) / 1000
    return {'tokens': data['maxOutputTokens'], 'wall_seconds': wall,
            'cpu_seconds': max(1, min(170, math.ceil(wall)))}


def run(data):
    validation_started_ns = time.monotonic_ns()
    budget = execution_limits(data)
    if any(not isinstance(data[k], str) or not data[k].strip() or len(data[k]) > n
           for k, n in [('input', 4000), ('instructions', 1200)]):
        raise ValueError('依頼や担当の説明が長すぎるか、空になっています。')
    path = job_dir(data['jobId'])
    pressure_start = pressure_snapshot()
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
            if not (path / 'started').exists():
                diagnostic(path, 'run', {'cancelBeforeSpawnObservedMonotonicNs': time.monotonic_ns()})
            return {'cancelled': True}
        if (path / 'started').exists():
            raise ValueError('同じ仕事を再実行しません。保存された状態を確認してください。')
        budget = execution_limits(data)
        (path / 'started').touch(mode=0o600)
        diagnostic(path, 'run', {'validationStartedMonotonicNs': validation_started_ns,
            'monotonicDomainSha256': monotonic_domain(),
            'validationCompletedMonotonicNs': time.monotonic_ns(),
            'pressureStart': pressure_start,
            'input': byte_metadata(data['input']), 'instructions': byte_metadata(data['instructions']),
            'requestedLimits': {'maxOutputTokens': data.get('maxOutputTokens'), 'deadlineEpochMs': data.get('deadline'),
                                'legacyDefaults': 'deadline' not in data},
            'modelSha256': data['modelSha256'], 'runtimeManifestSha256': digest(ROOT / 'runtime-files.json'),
            'terminalObserved': False})
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
        child = observation = None
        cpu_before = None
        deadline_kill_requested = False
        spawn_attempted = False
        try:
            with (path / 'output.txt').open('wb') as out, (path / 'runtime.log').open('wb') as err:
                os.fchmod(out.fileno(), 0o600)
                os.fchmod(err.fileno(), 0o600)
                parent_pid = os.getpid()
                cpu_before = child_cpu()
                # No diagnostic disk I/O between this existing deadline check and spawn.
                budget = execution_limits(data)
                spawn_attempt_ns = time.monotonic_ns()
                spawn_attempted = True
                child = subprocess.Popen([str(binary), '-m', str(model), '-f', str(prompt_file),
                                          '-n', str(budget['tokens']), '-c', '4096', '-t', '2', '--no-conversation',
                                          '--no-display-prompt', '--simple-io', '--no-warmup',
                                          '--temp', '0', '--seed', '42', '--repeat-penalty', '1.1', '--repeat-last-n', '128'],
                                         stdin=subprocess.DEVNULL, stdout=out, stderr=err,
                                         start_new_session=True, preexec_fn=lambda: prepare_child(budget['cpu_seconds'], parent_pid),
                                         env={'PATH': '/usr/bin:/bin', 'HOME': str(path),
                                              'LD_LIBRARY_PATH': str(binary.parent), 'LANG': 'C.UTF-8'})
                diagnostic(path, 'run', {'spawnAttemptMonotonicNs': spawn_attempt_ns,
                    'spawnObservedMonotonicNs': time.monotonic_ns(), 'effectiveLimits': budget})
                # This evidence-only observer keeps the child stdout file and flags unchanged.
                try:
                    observation = OutputObservation(path)
                except (OSError, RuntimeError):
                    diagnostic(path, 'output', {'available': False})
                receipt = identity(child.pid)
                save(path / 'process.json', receipt)
                fcntl.flock(guard, fcntl.LOCK_UN)
                started = time.monotonic()
                try:
                    remaining = max(0, (data['deadline'] - time.time() * 1000) / 1000) if 'deadline' in data else budget['wall_seconds']
                    child.wait(timeout=remaining)
                except subprocess.TimeoutExpired:
                    deadline_kill_requested = True
                    os.killpg(child.pid, signal.SIGKILL)
                    child.wait()
                    raise ValueError('実行期限を超えたため停止しました。依頼を短くしてください。')
        finally:
            prompt_file.unlink(missing_ok=True)
            if child is not None:
                rc = child.returncode
                pressure_end = pressure_snapshot()
                if observation is not None:
                    observation.finish(rc is not None)
                diagnostic(path, 'run', {
                    'terminalObserved': rc is not None,
                    'exitObservedMonotonicNs': time.monotonic_ns() if rc is not None else None,
                    'returnCode': rc, 'signal': -rc if rc is not None and rc < 0 else None,
                    'exitKind': ('unknown' if rc is None else 'normal_exit' if rc == 0 else 'signal_exit' if rc < 0 else 'nonzero_exit'),
                    'cpuSignalObserved': rc == -signal.SIGXCPU,
                    'cpuLimitReached': None,
                    'cpuSignalInterpretation': 'SIGXCPU is an observed signal, not attestation of its sender or resource cause',
                    'deadlineKillRequested': deadline_kill_requested,
                    'cancelMarkerObserved': (path / 'cancel').exists(),
                    'actualChildCpu': cpu_delta(cpu_before, child_cpu()) if rc is not None else {'available': False},
                    'pressureEnd': pressure_end,
                    'cgroupOomCounterDelta': oom_delta(pressure_start, pressure_end),
                    'signalOrigin': 'unknown; intervention flags are separate from exit signal'})
            elif spawn_attempted:
                diagnostic(path, 'run', {'terminalObserved': True, 'exitKind': 'spawn_failure',
                    'spawnAttemptMonotonicNs': spawn_attempt_ns, 'effectiveLimits': budget,
                    'spawnFailureObservedMonotonicNs': time.monotonic_ns(), 'returnCode': None,
                    'signal': None, 'actualChildCpu': {'available': False}})
            else:
                diagnostic(path, 'run', {'terminalObserved': True, 'exitKind': 'pre_spawn_failure',
                    'failureObservedMonotonicNs': time.monotonic_ns(), 'actualChildCpu': {'available': False}})
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
    if sys.argv[1] == 'capabilities':
        return {'schema': 'rockstaros.linux-text-capability/1', 'protocol': 1,
                'maximumOutputTokens': 1024, 'maximumDeadlineMs': 120000,
                'platform': sys.platform, 'architecture': os.uname().machine}
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

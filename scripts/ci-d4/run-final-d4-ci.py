#!/usr/bin/env python3
"""Pinned rc2 transport around the unchanged 41-boot D4 orchestrator.

Only fetch/upload receive GITHUB_TOKEN. No release creation, edit, publish,
replacement, deletion, retry, Actions artifact or production signing operation.
"""
import argparse
import gzip
import hashlib
import http.client
import importlib.util
import io
import json
import os
from pathlib import Path
import platform
import re
import shutil
import signal
import stat
import subprocess
import sys
import tarfile
import time
import urllib.error
import urllib.parse
import urllib.request

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('rc2_ci_admission', HERE / 'verify-ci-inputs.py')
guard = importlib.util.module_from_spec(spec); spec.loader.exec_module(guard)
require = guard.require
PLAN_SHA = '3ac4df9794a9be06058c68345b493eac9a725b22f6e162a94089eb3f6d19083e'
PLAN = guard.pinned_json(HERE / 'launch-plan.json', PLAN_SHA)
guard.validate_plan(PLAN)
SOURCE_SHA = PLAN['source_commit']
REPOSITORY = 'k999ln/rock'
JOB = Path('/var/tmp/rock-rc2-d4-ci')
INPUT = JOB / 'candidate'
CONTROL = JOB / 'control'
RUN = JOB / 'run'
PAYLOAD = RUN / 'payload'
IMAGES = RUN / 'images'
EVIDENCE = RUN / 'evidence'
PARTS = JOB / 'transport'
UID = 20000
MAX_FILE = 4 * 1024 ** 3
MAX_RAW = 40 * 1024 ** 3
MAX_PART_TOTAL = 8 * 1024 ** 3
PART_SIZE = 1024 ** 3
PATH = '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'


def save(path, value):
    with path.open('x', encoding='utf-8') as output:
        json.dump(value, output, ensure_ascii=False, sort_keys=True, indent=2, allow_nan=False)
        output.write('\n'); output.flush(); os.fsync(output.fileno())
    path.chmod(0o600)


def read_json(path):
    _, raw = guard.record(path, guard.MAX_JSON, capture=True)
    return guard.decode(raw)


def file_record(path, maximum=MAX_FILE):
    return guard.record(path, maximum)


def system_binary_digest(path):
    # Host e2fsck/fsck aliases can be legitimate hardlinks. That exception is
    # limited to resolved system executables, never candidate/source/raw files.
    path = path.resolve(strict=True)
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(fd, 'rb', buffering=0) as stream:
        before = os.fstat(stream.fileno())
        require(stat.S_ISREG(before.st_mode) and 0 < before.st_size <= MAX_FILE,
                'invalid host executable')
        digest = hashlib.sha256(); remaining = before.st_size
        while remaining:
            data = stream.read(min(1024 ** 2, remaining)); require(data, 'host executable shortened')
            remaining -= len(data); digest.update(data)
        require(stream.read(1) == b'' and guard.identity(os.fstat(stream.fileno())) ==
                guard.identity(before) == guard.identity(path.lstat()), 'host executable changed')
    return digest.hexdigest()


def no_token():
    require(not any(os.environ.get(k) for k in ('GITHUB_TOKEN', 'GH_TOKEN', 'ACTIONS_RUNTIME_TOKEN')),
            'transport credentials must not reach verifier or archive code')


def token():
    require(os.geteuid() == 0, 'transport runs only under the separate root account')
    value = os.environ.pop('GITHUB_TOKEN', '')
    require(value and '\n' not in value and '\r' not in value, 'transport token absent')
    return value


def run_identity():
    run = os.environ.get('GITHUB_RUN_ID', '')
    attempt = os.environ.get('GITHUB_RUN_ATTEMPT', '')
    commit = os.environ.get('GITHUB_SHA', '')
    require(re.fullmatch('[1-9][0-9]{0,19}', run) and attempt == '1' and
            re.fullmatch('[0-9a-f]{40}', commit), 'fresh first-attempt CI identity required')
    return {'run_id': run, 'attempt': 1, 'wrapper_commit': commit}


def clean_environment():
    return {'PATH': PATH, 'HOME': '/home/d4', 'LANG': 'C.UTF-8', 'LC_ALL': 'C.UTF-8',
            'PYTHONDONTWRITEBYTECODE': '1', 'OMP_THREAD_LIMIT': '1', 'OMP_NUM_THREADS': '1'}


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def api(path, secret, *, binary=False):
    require(re.fullmatch(r'/repos/k999ln/rock/releases/(?:[1-9][0-9]*|assets/[1-9][0-9]*)', path),
            'fixed repository numeric release/asset GET only')
    request = urllib.request.Request('https://api.github.com' + path, headers={
        'Authorization': 'Bearer ' + secret,
        'Accept': 'application/octet-stream' if binary else 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'rock-rc2-d4-ci'})
    return urllib.request.build_opener(NoRedirect()).open(request, timeout=120)


def release(secret, identifier):
    with api('/repos/' + REPOSITORY + '/releases/' + str(identifier), secret) as response:
        raw = response.read(guard.MAX_JSON + 1)
    require(len(raw) <= guard.MAX_JSON, 'release metadata too large')
    return guard.decode(raw)


def candidate_release(secret):
    value = release(secret, PLAN['candidate']['release_id'])
    guard.check_candidate_release(value, PLAN)
    return value


def evidence_release(secret, *, initial=False):
    value = release(secret, PLAN['evidence_destination']['release_id'])
    guard.check_evidence_release(value, PLAN, initial=initial)
    return value


def redirect_url(location):
    parsed = urllib.parse.urlsplit(location)
    require(parsed.scheme == 'https' and parsed.hostname in
            ('release-assets.githubusercontent.com', 'objects.githubusercontent.com') and
            parsed.port in (None, 443) and not parsed.username and not parsed.password,
            'unexpected asset redirect')
    return location


def asset_stream(secret, identifier):
    require(type(identifier) is int and identifier > 0, 'positive numeric asset ID required')
    try:
        return api('/repos/' + REPOSITORY + '/releases/assets/' + str(identifier), secret, binary=True)
    except urllib.error.HTTPError as error:
        require(error.code in (301, 302, 303, 307, 308), 'asset download rejected')
        location = redirect_url(error.headers['Location']); error.close()
        # Separate opener/request, deliberately no Authorization or ambient proxy credentials.
        return urllib.request.build_opener(NoRedirect()).open(location, timeout=120)


def checked_stream(incoming, expected, output=None):
    remaining = expected['bytes']; digest = hashlib.sha256()
    while remaining:
        data = incoming.read(min(1024 ** 2, remaining))
        require(data, 'short asset stream')
        remaining -= len(data); digest.update(data)
        if output is not None:
            output.write(data)
    require(incoming.read(1) == b'', 'asset stream exceeds fixed byte budget')
    require(digest.hexdigest() == expected['sha256'], 'asset stream hash differs')


def fetch():
    secret = token(); identity = run_identity()
    require(not os.path.lexists(JOB), 'fresh CI job directory required; no retry/adoption')
    candidate_release(secret); evidence_release(secret, initial=True)
    JOB.mkdir(mode=0o755); CONTROL.mkdir(mode=0o755); INPUT.mkdir(mode=0o755)
    RUN.mkdir(mode=0o700); os.chown(RUN, UID, UID)
    for expected in PLAN['candidate']['assets']:
        with asset_stream(secret, expected['id']) as incoming, (INPUT / expected['name']).open('xb') as output:
            checked_stream(incoming, expected, output)
            output.flush(); os.fsync(output.fileno())
        (INPUT / expected['name']).chmod(0o444)
    INPUT.chmod(0o555)
    candidate_release(secret); evidence_release(secret, initial=True)
    save(CONTROL / 'fetch.json', {'status': 'ALL_8_RC2_ASSETS_READ_BACK', **identity,
         'plan_sha256': PLAN_SHA, 'candidate': PLAN['candidate'], 'candidate_mutated': False})
    (CONTROL / 'fetch.json').chmod(0o444)
    print('All eight candidate assets fetched with fixed size/hash bounds; neither Draft changed.')


def check_sources(source, frozen):
    require(source.resolve(strict=True) == source and len(frozen['source_files_sha256']) == 1725,
            'canonical complete frozen source required')
    for name, expected in frozen['source_files_sha256'].items():
        path = source / guard.safe_relative(name)
        require(file_record(path)['sha256'] == expected, 'frozen source hash differs')
        require(not os.access(path, os.W_OK) and not os.access(path.parent, os.W_OK),
                'verifier account must not be able to edit frozen source')


def check_images():
    for name, expected in PLAN['frozen']['files_sha256'].items():
        require(file_record(IMAGES / name)['sha256'] == expected, 'immutable image changed')
    for key in ('freeze', 'profile'):
        expected = PLAN['frozen'][key]
        require(file_record(IMAGES / expected['name']) ==
                {k: expected[k] for k in ('sha256', 'bytes')}, 'immutable metadata changed')


def prepare(source):
    no_token(); os.umask(0o077)
    require(sys.platform == 'linux' and os.geteuid() == UID, 'dedicated non-root Linux account required')
    require(all(not os.path.lexists(p) for p in (PAYLOAD, IMAGES, EVIDENCE)), 'fresh preparation roots required')
    capacity = guard.capacity(PLAN, RUN, True)
    require(capacity['status'] == 'CAPACITY_ONLY_PASS', 'insufficient post-dependency capacity')
    EVIDENCE.mkdir(mode=0o700)
    save(EVIDENCE / 'capacity-before-prepare.json', capacity)
    fetch_info = read_json(CONTROL / 'fetch.json')
    require(fetch_info['plan_sha256'] == PLAN_SHA and fetch_info['status'] == 'ALL_8_RC2_ASSETS_READ_BACK',
            'completed input fetch required')
    save(EVIDENCE / 'launch.json', {'schema': 'rock-rc2-d4-launch/1', **run_identity(),
         'plan': PLAN, 'plan_sha256': PLAN_SHA, 'fetch': fetch_info,
         'wrapper_sha256': file_record(Path(__file__))['sha256'],
         'admission_sha256': file_record(HERE / 'verify-ci-inputs.py')['sha256']})
    git = subprocess.check_output(['git', '-c', 'core.fsmonitor=false', '-c', 'safe.directory=' + str(source),
          '-C', str(source), 'rev-parse', 'HEAD', 'HEAD^{tree}'], env=clean_environment(), timeout=20).decode().splitlines()
    require(git == [SOURCE_SHA, PLAN['source_tree']], 'separate source checkout SHA/tree differs')
    result = guard.verify_inputs(PLAN, INPUT, source, HERE / 'inputs')
    save(EVIDENCE / 'inputs.json', result)
    unsigned = read_json(INPUT / 'candidate-manifest.json')
    preview = guard.module(source / 'systems/rock-star-os/os/desktop/preview.py', 'rc2_extract_preview',
                           PLAN['frozen']['trusted_scripts_sha256']['systems/rock-star-os/os/desktop/preview.py'])
    # Strict USTAR/full-member validation already completed. Input is root-owned,
    # read-only to UID 20000; existing frozen extractor still rechecks all entries.
    preview.extract_verified(INPUT / unsigned['archive']['name'], PAYLOAD, unsigned['files'])
    frozen = guard.pinned_json(PAYLOAD / 'provenance/freeze-manifest.json', PLAN['frozen']['freeze']['sha256'])
    require(frozen['source_commit'] == SOURCE_SHA and frozen['status'] == 'BUILD_COMPLETE_FROZEN' and
            frozen['profile_derivation']['status'] == 'DERIVATION_VERIFIED_FROZEN' and
            frozen['source_tests'] == {'status': 'PASS', 'python_executions': 1689, 'checks': 17, 'source_unchanged': True} and
            frozen['files_sha256'] == PLAN['frozen']['files_sha256'], 'frozen build identity differs')
    check_sources(source, frozen)
    native = {n: h for n, h in frozen['source_files_sha256'].items() if n.startswith('systems/rock-star-os/')}
    packaged = {'systems/rock-star-os/' + n[7:]: r['sha256'] for n, r in unsigned['files'].items() if n.startswith('native/')}
    require(native == packaged and len(native) == 702, 'packaged native/source inventory differs')
    IMAGES.mkdir(mode=0o700)
    for path in (PAYLOAD / 'images').iterdir():
        require(path.is_file() and not path.is_symlink(), 'image input must be regular')
        shutil.copyfile(path, IMAGES / path.name); (IMAGES / path.name).chmod(0o444)
    shutil.copyfile(PAYLOAD / 'provenance/freeze-manifest.json', IMAGES / 'freeze-manifest.json')
    (IMAGES / 'freeze-manifest.json').chmod(0o444)
    check_images()
    machines = subprocess.check_output(['qemu-system-aarch64', '-machine', 'help'], env=clean_environment(), timeout=20).decode()
    require(re.search(r'^virt-10\.0\s', machines, re.M), 'original QEMU virt-10.0 machine unavailable')
    versions = {name: subprocess.check_output(args, env=clean_environment(), stderr=subprocess.STDOUT, timeout=20).decode()
                for name, args in [('qemu', ['qemu-system-aarch64', '--version']), ('tar', ['tar', '--version']),
                                   ('openssl', ['openssl', 'version']), ('tesseract', ['tesseract', '--version'])]}
    capacity = guard.capacity(PLAN, RUN, True)
    require(capacity['status'] == 'CAPACITY_ONLY_PASS', 'D4 requires 27 GiB free after extraction/preparation')
    save(EVIDENCE / 'prepared.json', {'status': 'PREPARED_NOT_RUN', 'source_commit': SOURCE_SHA,
         'source_tree': PLAN['source_tree'], 'source_files_verified': 1725, 'native_files': 702,
         'freeze_sha256': PLAN['frozen']['freeze']['sha256'], 'capacity': capacity,
         'machine': platform.machine(), 'kernel': platform.release(), 'python': platform.python_version(),
         'os_release': Path('/etc/os-release').read_text(), 'versions': versions,
         'binaries_sha256': {n: system_binary_digest(Path(shutil.which(n))) for n in
                            ('python3', 'qemu-system-aarch64', 'tar', 'openssl', 'debugfs', 'e2fsck')},
         'authority_started': False, 'native_limits_changed': False, 'legal_tar_extracted': False,
         'original_native_ci_logs_reexecuted_or_regraded': False})
    print('Frozen b7 source, rc2 package, test-only envelope and fresh D4 image copies prepared.')


def validate_d4_report(value):
    require(value.get('status') == 'PASS_SCOPED' and value.get('boots') == 41, 'D4 incomplete')
    checks = value.get('checks', [])
    require([(x.get('name'), x.get('boots')) for x in checks] == [(x[0], x[1]) for x in guard.MATRIX],
            'D4 matrix differs')
    require(all(x.get('status') == 'PASS' and x.get('exit_code') == 0 for x in checks), 'D4 check failed')


def run(source):
    no_token(); require(os.geteuid() == UID, 'dedicated verifier account required')
    prepared = read_json(EVIDENCE / 'prepared.json')
    require(prepared['status'] == 'PREPARED_NOT_RUN', 'preparation incomplete')
    frozen = read_json(IMAGES / 'freeze-manifest.json'); check_sources(source, frozen); check_images()
    orchestrator = HERE / 'inputs/run-d4-frozen.py'
    expected = PLAN['frozen']['matrix_orchestrator']
    require(file_record(orchestrator) == {k: expected[k] for k in ('bytes', 'sha256')}, 'original orchestrator changed')
    command = ['python3', '-B', str(orchestrator), '--source', str(source), '--images', str(IMAGES),
               '--evidence', str(EVIDENCE / 'd4'), '--source-commit', SOURCE_SHA]
    save(EVIDENCE / 'execution.json', {'command': command, 'outer_seconds': 13500,
         'original_matrix_outer_seconds': 12660, 'native_per_boot_limits_unchanged': True,
         'automatic_retry': False, 'started_unix': time.time()})
    code = None; error = None; passed = False
    try:
        with (EVIDENCE / 'orchestrator.log').open('xb') as log:
            process = subprocess.Popen(command, cwd=source, env=clean_environment(), stdin=subprocess.DEVNULL,
                                       stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
            try:
                code = process.wait(timeout=13500)
            finally:
                if process.poll() is None:
                    os.killpg(process.pid, signal.SIGTERM)
                    try: process.wait(timeout=15)
                    except subprocess.TimeoutExpired:
                        os.killpg(process.pid, signal.SIGKILL); process.wait(timeout=15)
        require(code == 0, 'original orchestrator failed')
        report = read_json(EVIDENCE / 'd4/report.json'); validate_d4_report(report)
        check_sources(source, frozen); check_images()
        for item in report['checks']:
            path = Path(item['evidence'])
            require(path.parent in (EVIDENCE / 'd4', IMAGES) and path.resolve() == path,
                    'unexpected D4 report location')
            require(file_record(path / 'report.json')['sha256'] == item['report_sha256'] and
                    file_record(EVIDENCE / 'd4' / (item['name'] + '.log'))['sha256'] == item['log_sha256'],
                    'original D4 report/log changed')
        passed = True
    except Exception as exc:
        error = type(exc).__name__
    save(EVIDENCE / 'result.json', {'status': 'PASS_SCOPED_INDEPENDENT_LINUX_D4' if passed else 'FAIL',
         'source_commit': SOURCE_SHA, 'plan_sha256': PLAN_SHA, 'exit_code': code, 'error_type': error,
         'boots_required': 41, 'finished_unix': time.time(), 'other_gates_not_run': True,
         'not_managed_signing_or_legal_clearance': True, 'not_mac_installation_acceptance': True})
    require(passed, 'D4 failed; preserve all partial raw evidence')
    print('Original D4 completed all 41 boots; preservation/readback is still pending.')


def task_processes():
    found = []
    for proc in Path('/proc').glob('[0-9]*'):
        try:
            lines = (proc / 'status').read_text().splitlines()
            uids = next(x for x in lines if x.startswith('Uid:')).split()[1:]
            if str(UID) in uids:
                found.append(int(proc.name))
        except (FileNotFoundError, PermissionError, ProcessLookupError):
            pass
    return sorted(found)


def stop_task_processes():
    before = task_processes()
    for sig in (signal.SIGTERM, signal.SIGKILL):
        for pid in task_processes():
            try: os.kill(pid, sig)
            except ProcessLookupError: pass
        deadline = time.monotonic() + 15
        while task_processes() and time.monotonic() < deadline:
            time.sleep(0.2)
    require(not task_processes(), 'task writer remains active; archive refused')
    return before


def raw_inventory():
    roots = [EVIDENCE] if EVIDENCE.is_dir() else []
    if IMAGES.is_dir():
        roots += sorted(p for p in IMAGES.iterdir() if p.is_dir() and
                        (p.name.startswith('verify-ab-') or p.name.startswith('verify-faults-')))
    files = {}; directories = []; ephemeral = []; total = 0
    for root in roots:
        require(root.resolve(strict=True) == root and not root.is_symlink(), 'aliased evidence root')
        for base, dirs, names in os.walk(root, followlinks=False):
            directory = Path(base)
            require(directory.resolve() == directory, 'aliased evidence directory')
            directories.append(str(directory.relative_to(RUN)))
            for name in dirs:
                require(not (directory / name).is_symlink(), 'linked evidence directory')
            for name in names:
                path = directory / name; info = path.lstat()
                relative = str(path.relative_to(RUN)); guard.safe_relative(relative)
                require('\n' not in relative and '\r' not in relative and '\0' not in relative,
                        'unsafe raw member name')
                if stat.S_ISSOCK(info.st_mode):
                    ephemeral.append({'path': relative, 'kind': 'closed-process-unix-socket',
                                      'mode': stat.S_IMODE(info.st_mode)})
                    continue
                require(stat.S_ISREG(info.st_mode) and info.st_nlink == 1, 'linked or special raw file')
                total += info.st_size
                require(total <= MAX_RAW and len(files) < 10000, 'raw preservation bound exceeded')
                files[relative] = {**file_record(path), 'mode': stat.S_IMODE(info.st_mode),
                                   'uid': info.st_uid, 'gid': info.st_gid}
    require(files, 'no raw evidence to preserve')
    return {'schema': 'rock-d4-raw-inventory/1', 'files': files, 'directories': sorted(directories),
            'ephemeral_nodes': ephemeral, 'logical_bytes': total, 'file_count': len(files)}


class SplitWriter:
    def __init__(self, directory, prefix, *, chunk_limit=PART_SIZE, total_limit=MAX_PART_TOTAL, reserve_bytes=0):
        self.directory = directory; self.prefix = prefix; self.chunk_limit = chunk_limit
        self.total_limit = total_limit; self.total = 0; self.output = None; self.parts = []
        self.current = 0; self.digest = None
        self.reserve_bytes = reserve_bytes

    def finish_part(self):
        if self.output is not None:
            self.output.flush(); os.fsync(self.output.fileno()); self.output.close()
            self.parts[-1].update(bytes=self.current, sha256=self.digest.hexdigest())
            self.output = None

    def write(self, data):
        require(self.total + len(data) <= self.total_limit, 'compressed evidence exceeds bound')
        require(not self.reserve_bytes or shutil.disk_usage(self.directory).free >= self.reserve_bytes + len(data),
                'compressed archive would consume the retained free-space reserve')
        full = len(data)
        while data:
            if self.output is None:
                name = self.prefix + '.tar.gz.part-' + str(len(self.parts)).zfill(4)
                self.output = (self.directory / name).open('xb'); (self.directory / name).chmod(0o600)
                self.parts.append({'name': name}); self.current = 0; self.digest = hashlib.sha256()
            amount = min(len(data), self.chunk_limit - self.current)
            self.output.write(data[:amount]); self.digest.update(data[:amount])
            self.current += amount; self.total += amount; data = data[amount:]
            if self.current == self.chunk_limit:
                self.finish_part()
        return full

    def flush(self):
        if self.output is not None:
            self.output.flush()

    def close(self):
        self.finish_part()


class JoinedReader:
    def __init__(self, directory, parts):
        self.directory = directory; self.parts = iter(parts); self.current = None
        self.expected = None; self.remaining = 0; self.digest = None

    def read(self, size=-1):
        require(size >= 0, 'bounded concatenation reads required')
        result = bytearray()
        while len(result) < size:
            if self.current is None:
                try: self.expected = next(self.parts)
                except StopIteration: break
                path = self.directory / self.expected['name']
                require(file_record(path) == {k: self.expected[k] for k in ('bytes', 'sha256')}, 'archive chunk changed')
                self.current = path.open('rb'); self.remaining = self.expected['bytes']; self.digest = hashlib.sha256()
            data = self.current.read(min(size - len(result), self.remaining))
            require(data or not self.remaining, 'short archive chunk')
            result.extend(data); self.remaining -= len(data); self.digest.update(data)
            if self.remaining == 0:
                require(self.current.read(1) == b'' and self.digest.hexdigest() == self.expected['sha256'],
                        'archive chunk changed during readback')
                self.current.close(); self.current = None
        return bytes(result)

    def close(self):
        if self.current is not None:
            self.current.close(); self.current = None


def verify_raw_archive(directory, parts, inventory):
    joined = JoinedReader(directory, parts); seen = set()
    try:
        with gzip.GzipFile(fileobj=joined, mode='rb') as expanded:
            with tarfile.open(fileobj=expanded, mode='r|') as incoming:
                # Stop before next() consumes a terminal header: tarfile can
                # silently treat a malformed nonzero header as end-of-archive.
                while len(seen) < len(inventory['files']):
                    item = incoming.next()
                    require(item is not None, 'raw archive missing original file')
                    require(item.name in inventory['files'] and item.name not in seen and item.isfile(),
                            'extra/duplicate/nonregular raw archive member')
                    expected = inventory['files'][item.name]; seen.add(item.name)
                    require(item.size == expected['bytes'] and item.mode == expected['mode'] and
                            item.uid == expected['uid'] and item.gid == expected['gid'], 'raw member metadata differs')
                    with incoming.extractfile(item) as stream:
                        checked_stream(stream, expected)
                # Read through the streaming reader's buffer. Align past the
                # last member's padding before inspecting BOTH zero headers.
                require(incoming.fileobj.seek(incoming.offset) == incoming.offset,
                        'raw archive has short final member padding')
                # Two terminal blocks can straddle a 10 KiB tar record, making
                # the complete standard trailer as large as 10,752 bytes.
                trailer = incoming.fileobj.read(10753)
                require(1024 <= len(trailer) <= 10752 and not trailer.strip(b'\0'),
                        'raw archive has missing end marker or trailing data')
            require(expanded.read(1) == b'', 'raw archive has unconsumed gzip data')
        require(joined.read(1) == b'', 'unused raw archive bytes')
    finally:
        joined.close()
    require(seen == set(inventory['files']), 'raw archive missing original files')


def archive():
    no_token(); require(os.geteuid() == 0 and sys.platform == 'linux', 'root preservation account required')
    identity = run_identity()
    require(RUN.is_dir() and RUN.resolve() == RUN, 'no task run to preserve')
    active = stop_task_processes()
    require(not os.path.lexists(EVIDENCE) or
            (EVIDENCE.resolve() == EVIDENCE and stat.S_ISDIR(EVIDENCE.lstat().st_mode)),
            'aliased evidence parent; root preservation write refused')
    EVIDENCE.mkdir(mode=0o700, exist_ok=True)
    save(EVIDENCE / 'process-cleanup.json', {'unexpected_task_pids': active,
         'all_task_processes_stopped': True, 'scope': 'dedicated CI UID 20000 only',
         'normal_d4_pass_disallowed_if_any_unexpected_process': bool(active)})
    require(not PARTS.exists(), 'fresh transport directory required')
    PARTS.mkdir(mode=0o700)
    inventory = raw_inventory()
    save(PARTS / 'raw-inventory.json', inventory)
    members = CONTROL / 'raw-members.nul'
    with members.open('xb') as output:
        output.write(b''.join(name.encode() + b'\0' for name in sorted(inventory['files'])))
    prefix = 'rock-rc2-d4-' + identity['run_id'] + '-1'
    writer = SplitWriter(PARTS, prefix, reserve_bytes=8 * 1024 ** 3)
    command = ['tar', '--format=gnu', '--sparse', '--numeric-owner', '--no-recursion', '--null',
               '--verbatim-files-from', '-C', str(RUN), '-T', str(members), '-cf', '-']
    with (CONTROL / 'tar-stderr.log').open('xb') as stderr:
        process = subprocess.Popen(command, env={'PATH': PATH, 'LANG': 'C.UTF-8'}, stdout=subprocess.PIPE, stderr=stderr)
        try:
            with gzip.GzipFile(fileobj=writer, mode='wb', compresslevel=1, mtime=0) as compressed:
                while data := process.stdout.read(1024 ** 2):
                    compressed.write(data)
            require(process.wait(timeout=30) == 0, 'GNU sparse archive failed')
        finally:
            writer.close()
            if process.poll() is None: process.kill(); process.wait(timeout=15)
            process.stdout.close()
    require(not (CONTROL / 'tar-stderr.log').read_bytes(), 'archive emitted unexpected diagnostics')
    verify_raw_archive(PARTS, writer.parts, inventory)
    require(raw_inventory() == inventory and not task_processes(), 'raw evidence changed while archived')
    result = read_json(EVIDENCE / 'result.json') if (EVIDENCE / 'result.json').is_file() else {'status': 'NOT_RUN_OR_FAILED_BEFORE_RESULT'}
    d4_pass = result['status'] == 'PASS_SCOPED_INDEPENDENT_LINUX_D4' and not active
    local = {'schema': 'rock-d4-raw-preservation/1', 'status': 'ALL_ORIGINAL_REGULAR_FILES_READ_BACK',
             **identity, 'plan_sha256': PLAN_SHA, 'source_commit': SOURCE_SHA,
             'candidate_release_id': PLAN['candidate']['release_id'],
             'candidate_index_sha256': PLAN['candidate']['index_sha256'],
             'evidence_release_id': PLAN['evidence_destination']['release_id'],
             'd4_pass': d4_pass, 'd4_result': result, 'chunks': writer.parts,
             'inventory': {'name': 'raw-inventory.json', **file_record(PARTS / 'raw-inventory.json')},
             'file_count': inventory['file_count'], 'logical_bytes': inventory['logical_bytes'],
             'compressed_bytes': writer.total, 'remote_readback': 'PENDING',
             'deletions': False, 'not_overall_release_acceptance': True}
    save(PARTS / 'local-preservation.json', local)
    print(json.dumps({'status': 'ALL_RAW_LOCALLY_PRESERVED_REMOTE_PENDING',
          'files': inventory['file_count'], 'chunks': len(writer.parts), 'd4_pass': d4_pass}))


def upload_file(secret, path, name):
    require(re.fullmatch('[A-Za-z0-9_.-]{1,160}', name), 'safe evidence asset name required')
    expected = file_record(path, PART_SIZE)
    current = evidence_release(secret)
    require(not any(x.get('name') == name for x in current['assets']), 'evidence name already exists; no retry/replacement')
    identifier = PLAN['evidence_destination']['release_id']
    require(identifier != PLAN['candidate']['release_id'], 'candidate release is read-only')
    connection = http.client.HTTPSConnection('uploads.github.com', timeout=180)
    try:
        connection.putrequest('POST', '/repos/' + REPOSITORY + '/releases/' + str(identifier) +
                              '/assets?' + urllib.parse.urlencode({'name': name}))
        for key, value in {'Authorization': 'Bearer ' + secret, 'Accept': 'application/vnd.github+json',
                           'Content-Type': 'application/octet-stream', 'Content-Length': str(expected['bytes']),
                           'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'rock-rc2-d4-ci'}.items():
            connection.putheader(key, value)
        connection.endheaders()
        with path.open('rb') as incoming:
            remaining = expected['bytes']; digest = hashlib.sha256()
            while remaining:
                data = incoming.read(min(1024 ** 2, remaining)); require(data, 'upload source shortened')
                remaining -= len(data); digest.update(data); connection.send(data)
            require(incoming.read(1) == b'' and digest.hexdigest() == expected['sha256'], 'upload source changed')
        response = connection.getresponse(); raw = response.read(guard.MAX_JSON + 1)
        require(response.status == 201 and len(raw) <= guard.MAX_JSON, 'evidence upload failed; no automatic retry')
        asset = guard.decode(raw)
    finally:
        connection.close()
    require(asset.get('name') == name and asset.get('state') == 'uploaded' and
            asset.get('size') == expected['bytes'] and asset.get('digest') == 'sha256:' + expected['sha256'] and
            type(asset.get('id')) is int, 'uploaded asset metadata differs')
    # Off-host readback: stream actual GitHub bytes; no duplicate local archive allocation.
    with asset_stream(secret, asset['id']) as incoming:
        checked_stream(incoming, expected)
    evidence_release(secret)
    return {'id': asset['id'], 'name': name, **expected, 'actual_remote_bytes_read_back': True}


def upload():
    secret = token(); identity = run_identity()
    require(not task_processes(), 'task processes must be stopped before credential-bearing transport')
    candidate_release(secret); evidence_release(secret, initial=True)
    local = read_json(PARTS / 'local-preservation.json')
    require(local['status'] == 'ALL_ORIGINAL_REGULAR_FILES_READ_BACK' and local['plan_sha256'] == PLAN_SHA and
            all(local[k] == identity[k] for k in identity), 'local preservation identity differs')
    inventory = read_json(PARTS / 'raw-inventory.json')
    require(raw_inventory() == inventory, 'raw evidence changed after local readback')
    verify_raw_archive(PARTS, local['chunks'], inventory)
    expected_names = {x['name'] for x in local['chunks']} | {'raw-inventory.json', 'local-preservation.json'}
    require({p.name for p in PARTS.iterdir()} == expected_names, 'unexpected local transport file')
    assets = []
    for name in [x['name'] for x in local['chunks']] + ['raw-inventory.json', 'local-preservation.json']:
        assets.append(upload_file(secret, PARTS / name, name))
    current = evidence_release(secret)
    require({x['id'] for x in current['assets']} == {x['id'] for x in assets}, 'concurrent/extra evidence upload')
    candidate_release(secret)
    complete = {'schema': 'rock-d4-ci-remote-preservation/1', 'status': 'ALL_RAW_PAYLOADS_REMOTELY_READ_BACK',
                **identity, 'source_commit': SOURCE_SHA, 'plan_sha256': PLAN_SHA,
                'candidate_release_id': PLAN['candidate']['release_id'],
                'candidate_index_sha256': PLAN['candidate']['index_sha256'],
                'evidence_release_id': PLAN['evidence_destination']['release_id'],
                'd4_pass': local['d4_pass'], 'file_count': local['file_count'],
                'logical_bytes': local['logical_bytes'], 'assets': assets,
                'proof': 'Local sparse archive decoded against every original file hash/size/mode; every identical chunk and inventory fetched back from GitHub.',
                'candidate_still_exact_eight_assets': True, 'not_overall_release_acceptance': True,
                'completion_receipt_itself_requires_final_CI_stdout_readback_record': True}
    save(PARTS / 'remote-complete.json', complete)
    final = upload_file(secret, PARTS / 'remote-complete.json', 'remote-complete.json')
    current = evidence_release(secret)
    require({x['id'] for x in current['assets']} == {x['id'] for x in assets + [final]}, 'evidence inventory changed')
    candidate_release(secret)
    print(json.dumps({'status': 'COMPLETE_RECEIPT_READ_BACK', 'receipt': final,
                      'evidence_release_id': PLAN['evidence_destination']['release_id'],
                      'd4_pass': local['d4_pass'], 'candidate_mutated': False, 'published': False}))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=('fetch', 'prepare', 'run', 'archive', 'upload'))
    parser.add_argument('--source', type=Path)
    args = parser.parse_args()
    if args.action in ('prepare', 'run'):
        require(args.source is not None, 'frozen source checkout required')
        globals()[args.action](args.source)
    else:
        globals()[args.action]()


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        # No token/header/redirect/HTTP response or credential-bearing traceback.
        if len(sys.argv) > 1 and sys.argv[1] in ('prepare', 'run') and RUN.is_dir():
            try:
                EVIDENCE.mkdir(mode=0o700, exist_ok=True)
                save(EVIDENCE / ('wrapper-' + sys.argv[1] + '-failure.json'),
                     {'status': 'FAIL', 'error_type': type(error).__name__, 'not_acceptance': True})
            except Exception:
                pass
        print('D4 CI wrapper failed: ' + type(error).__name__, file=sys.stderr)
        sys.exit(1)

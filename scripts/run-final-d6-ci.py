#!/usr/bin/env python3
"""Transport/prepare only around the unmodified 9ab D6 observer.

RQ07-10/12/16-17 / explicit optimism / preserve a real one-hour run across
local power loss / frozen verifier+signed package / separate CI wrapper /
unchanged D6 limits / independent Linux evidence, not Mac installation approval.

fetch/upload alone receive GITHUB_TOKEN. prepare/run must never receive it.
No publish, release update, asset replacement, Actions artifact or automatic retry.
The small LAUNCH record is reviewed before pushing the two trigger paths.
"""
import argparse
import hashlib
import http.client
import importlib.util
import json
import os
from pathlib import Path, PurePosixPath
import platform
import re
import shutil
import stat
import subprocess
import sys
import tarfile
import tempfile
import time
import traceback
import unittest
import urllib.error
import urllib.parse
import urllib.request

SOURCE_COMMIT = '9abf78a80d27aa9f847c4051d20e4c552e407276'
REPOSITORY = 'k999ln/rock'
LAUNCH = {
    'release_id': 386171909, 'tag': 'v1.0.0-preview.20260910-rc1',
    'assets': {
        'archive': {'id': 554748551, 'name': 'rockstaros-1.0.0-preview.20260910-macos-arm64.tar.gz', 'bytes': 1000928255,
                    'sha256': '121389f0df92ae43197ec23d381012dab02aa1d0ff5a3f519803e66e0c7b46a2'},
        'manifest': {'id': 554748549, 'name': 'release-manifest.json', 'bytes': 104790,
                     'sha256': 'e06fb8d9df292103e63f6cd56df95b189202ae0b13b6e1c578cb6eef0ffc5971'},
        'key': {'id': 554748553, 'name': 'release-key.der', 'bytes': 44,
                'sha256': '06e3fd8fda29bb60ab59557de61edb0aecdb231134be30e75b455f8e1b792fa9'},
    },
}
FREEZE_SHA = 'd258a303794a3a16bbec792807bc39427fa3bf3ea3c3d86492be07948f1736fc'
PROFILE_SHA = '0d6f4924d98f1cd43d4e3104b9a9c3b4f2a4b2557e96f64bd626f9930f4b34bb'
GIT_ARCHIVE_SHA = '1fac2382110401638dd9ea6d5d5d4d67bf902b5198f5bd38a187c66508719532'
LOCAL_PLAN_SHA = '20795f3b4de6e9f562c8ec373b96bfea6407e4b0418064286e73d1096b744e0f'
EXECUTION_AMENDMENT_SHA = 'f91c2da9aa80c3ccb1d549cf4e04dd21190e17f47da506da292c2e427ea7d9c3'
INPUT = Path('/var/tmp/rock-final-candidate-input')
PAYLOAD = Path('/var/tmp/rock-final-candidate')
SOURCE = Path('/var/tmp/rock-final-9abf78a')
NATIVE = SOURCE / 'systems/rock-star-os'
IMAGES = Path('/var/tmp/rock-final-9abf78a-profile')
DEVICE = Path('/var/tmp/rock-final-9abf78a-device.json')
AUTHORITY = Path('/var/tmp/rockstaros-preview-authority')
DEFAULT_EVIDENCE = Path('/var/tmp/rock-d6-ci-evidence')
PREFIX = 'systems/rock-star-os/'
PATH = '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'


def require(condition, message):
    if not condition:
        raise ValueError(message)


def digest(path):
    with Path(path).open('rb') as source:
        return hashlib.file_digest(source, 'sha256').hexdigest()


def save(path, value):
    with Path(path).open('x', encoding='utf-8') as stream:
        json.dump(value, stream, ensure_ascii=False, sort_keys=True, indent=2, allow_nan=False)
        stream.write('\n'); stream.flush(); os.fsync(stream.fileno())


def load(path):
    return json.loads(Path(path).read_bytes())


def clean_environment():
    # An allowlist, including no GitHub credentials, proxy, askpass or user Python path.
    return {'PATH': PATH, 'HOME': '/home/d6', 'LANG': 'C.UTF-8', 'LC_ALL': 'C.UTF-8',
            'PYTHONDONTWRITEBYTECODE': '1', 'OMP_THREAD_LIMIT': '1', 'OMP_NUM_THREADS': '1'}


def no_token():
    require(not any(os.environ.get(n) for n in ('GITHUB_TOKEN', 'GH_TOKEN', 'ACTIONS_RUNTIME_TOKEN')),
            'credential-bearing environment must not execute the guest or host verifier')


def token():
    value = os.environ.pop('GITHUB_TOKEN', '')
    require(value and '\n' not in value and '\r' not in value, 'GitHub job token required for draft transport only')
    return value


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def api(path, secret, *, accept='application/vnd.github+json'):
    require(path.startswith('/repos/' + REPOSITORY + '/releases'), 'fixed repository release API only')
    request = urllib.request.Request('https://api.github.com' + path,
        headers={'Authorization': 'Bearer ' + secret, 'Accept': accept,
                 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'rock-final-candidate-d6'})
    return urllib.request.build_opener(NoRedirect()).open(request, timeout=120)


def release(secret):
    with api('/repos/' + REPOSITORY + '/releases/' + str(LAUNCH['release_id']), secret) as response:
        value = json.load(response)
    check_release(value)
    return value


def check_release(value):
    require(value.get('id') == LAUNCH['release_id'] and value.get('draft') is True and
            value.get('tag_name') == LAUNCH['tag'] and value.get('target_commitish') == SOURCE_COMMIT,
            'exact private candidate draft required; refusing a published or retargeted release')


def redirect_url(location):
    parsed = urllib.parse.urlsplit(location)
    require(parsed.scheme == 'https' and parsed.hostname in
            ('release-assets.githubusercontent.com', 'objects.githubusercontent.com') and
            not parsed.username and not parsed.password and parsed.port in (None, 443),
            'unexpected asset redirect; credentials must not follow redirects')
    return location


def pinned_assets(value):
    assets = {a['id']: a for a in value.get('assets', [])}
    for expected in LAUNCH['assets'].values():
        require(type(expected['id']) is int and expected['id'] > 0, 'candidate asset ID has not been pinned')
        actual = assets.get(expected['id'], {})
        require(all(actual.get(k) == expected[k] for k in ('id', 'name')) and
                actual.get('size') == expected['bytes'] and actual.get('state') == 'uploaded',
                'draft asset identity/size/state differs from the reviewed launch record')


def fetch():
    secret = token(); value = release(secret); pinned_assets(value)
    require(not INPUT.exists(), 'fresh input directory required; no adoption or download retry')
    INPUT.mkdir(mode=0o755); INPUT.chmod(0o755)
    for expected in LAUNCH['assets'].values():
        try:
            response = api('/repos/' + REPOSITORY + '/releases/assets/' + str(expected['id']), secret,
                           accept='application/octet-stream')
        except urllib.error.HTTPError as error:
            require(error.code in (301, 302, 303, 307, 308), 'draft asset download was rejected')
            location = redirect_url(error.headers['Location']); error.close()
            # Explicitly new request/opener, with NO Authorization header.
            response = urllib.request.build_opener(NoRedirect()).open(location, timeout=120)
        target = INPUT / expected['name']; total = 0
        with response, target.open('xb') as output:
            while data := response.read(1024**2):
                total += len(data)
                require(total <= expected['bytes'], 'asset exceeded its pinned byte length')
                output.write(data)
            output.flush(); os.fsync(output.fileno())
        require(total == expected['bytes'] and digest(target) == expected['sha256'], 'download hash/size mismatch')
        target.chmod(0o444)
    save(INPUT / 'fetch.json', {'status': 'HASH_VERIFIED_PRIVATE_DRAFT', 'launch': LAUNCH})
    (INPUT / 'fetch.json').chmod(0o444)
    release(secret)
    print('Candidate assets fetched and hash verified; draft remains unpublished.')


def module(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    result = importlib.util.module_from_spec(spec); spec.loader.exec_module(result)
    return result


def safe_name(name):
    pure = PurePosixPath(name)
    require(name and not pure.is_absolute() and str(pure) == name and '..' not in pure.parts and
            '\\' not in name, 'unsafe archive member')
    return name


def selected_tar(archive, destination, wanted, *, gzip=False):
    """Only bounded regular selected members; never tar.extractall or links."""
    seen = set()
    with tarfile.open(archive, 'r|gz' if gzip else 'r:') as incoming:
        for item in incoming:
            if item.name not in wanted:
                continue
            safe_name(item.name)
            require(item.name not in seen and item.isfile() and not item.sparse and item.size <= 64 * 1024**2,
                    'invalid selected provenance member')
            seen.add(item.name); path = destination / item.name
            path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
            with incoming.extractfile(item) as source, path.open('xb') as output:
                shutil.copyfileobj(source, output)
            path.chmod(0o444 | (item.mode & 0o111))
    require(seen == set(wanted), 'selected provenance is missing')


def evidence_path(value):
    path = Path(value)
    require(re.fullmatch('/var/tmp/rock-[a-z0-9-]+-ci-evidence', str(path)) is not None and
            path.resolve() == path, 'fixed private debugfs-safe evidence parent required')
    return path


def source_hashes(expected):
    return {name: digest(SOURCE / safe_name(name)) for name in expected}


def prepare(evidence):
    no_token(); os.umask(0o077)
    require(sys.platform == 'linux' and os.geteuid() == 1001, 'fresh non-root Linux uid 1001 required')
    ram_bytes = os.sysconf('SC_PHYS_PAGES') * os.sysconf('SC_PAGE_SIZE')
    require(ram_bytes >= 4 * 1024**3 and len(os.sched_getaffinity(0)) >= 4,
            'at least 4 GiB RAM and four available host CPUs required')
    require(all(not os.path.lexists(p) for p in (PAYLOAD, SOURCE, IMAGES, DEVICE, AUTHORITY, evidence)),
            'fresh candidate/source/images/device/authority/evidence paths required')
    evidence.mkdir(mode=0o700)
    save(evidence / 'launch-plan.json', {'schema': 'rock-final-d6-ci-launch/1', 'status': 'PREDECLARED',
        'source_commit': SOURCE_COMMIT, 'launch': LAUNCH, 'wrapper_sha256': digest(__file__),
        'workflow_sha256': digest(Path(__file__).parents[1] / '.github/workflows/final-d6-candidate.yml'),
        'run_id': os.environ.get('GITHUB_RUN_ID'), 'run_attempt': os.environ.get('GITHUB_RUN_ATTEMPT'),
        'wrapper_commit': os.environ.get('GITHUB_SHA'),
        'local_master_plan_sha256': LOCAL_PLAN_SHA, 'execution_amendment_sha256': EXECUTION_AMENDMENT_SHA,
        'relationship': 'Independent Linux host run; not a resumed local D6 or Mac installation acceptance',
        'all_original_d6_limits_unchanged': True, 'overall_release_requires_other_gates': True})
    inputs = {name: INPUT / record['name'] for name, record in LAUNCH['assets'].items()}
    for name, path in inputs.items():
        require(digest(path) == LAUNCH['assets'][name]['sha256'], 'download changed before preparation')
    boot = evidence / 'bootstrap'; boot.mkdir(mode=0o700)
    selected_tar(inputs['archive'], boot, {'native/os/desktop/preview.py'}, gzip=True)
    preview = module(boot / 'native/os/desktop/preview.py', 'frozen_preview')
    package = preview.verify_release(inputs['manifest'], inputs['archive'], inputs['key'],
        LAUNCH['assets']['key']['sha256'], manifest_sha256=LAUNCH['assets']['manifest']['sha256'], allow_public_test_key=True)
    require(package['source_commit'] == package['host_tools_commit'] == SOURCE_COMMIT and
            package['boot']['profile_sha256'] == PROFILE_SHA and package['game']['config'] == str(AUTHORITY / 'sandbox.json'),
            'candidate source/profile/authority differs')
    needed = sum(record['bytes'] for record in package['files'].values()) + 3 * 1024**3
    require(shutil.disk_usage('/var/tmp').free >= needed, 'insufficient disk for payload, fresh slots and retained evidence')
    preview.extract_verified(inputs['archive'], PAYLOAD, package['files'])
    freeze_path = PAYLOAD / 'provenance/freeze-manifest.json'
    require(digest(freeze_path) == FREEZE_SHA, 'final freeze pin mismatch')
    freeze = load(freeze_path); expected = freeze['source_files_sha256']
    require(freeze['source_commit'] == SOURCE_COMMIT and freeze['source_tests']['status'] == 'PASS' and
            freeze['source_tests']['source_unchanged'] is True and freeze['files_sha256'] == package['image_sha256'],
            'original source/frozen image gate is not complete')
    provenance = evidence / 'original-provenance'; provenance.mkdir(mode=0o700)
    names = {'manifest.json', 'corresponding-source/rock-source.tar', 'provenance/native-source-report.json'}
    checks = ('c-core', 'c-platform', 'c-ui-actions', 'c-ui-build-tests', 'c-ui-ipc', 'c-ui-native-replay',
              'c-ui', 'os-ai_routes-tests', 'os-atm-tests', 'os-entitlement-tests', 'os-service_access-tests',
              'os-wallet_auth-tests', 'tests', 'ui-observers')
    names.update('provenance/native-source-logs/' + name + '.log' for name in checks)
    selected_tar(PAYLOAD / 'legal/buildroot-legal-info.tar.gz', provenance, names, gzip=True)
    legal = load(provenance / 'manifest.json')
    require(legal['source_commit'] == SOURCE_COMMIT and legal['freeze_sha256'] == FREEZE_SHA and
            legal['profile_sha256'] == PROFILE_SHA and legal['source_archive_sha256'] == GIT_ARCHIVE_SHA,
            'corresponding-source manifest is not the frozen candidate')
    for name in names - {'manifest.json'}:
        require(digest(provenance / name) == legal['files'][name]['sha256'], 'original provenance member differs')
    original = load(provenance / 'provenance/native-source-report.json')
    require(original['status'] == 'PASS' and original['source_unchanged'] is True and
            digest(provenance / 'provenance/native-source-report.json') == freeze['source_report_sha256'] ==
            '34bf46580fe2f3655f765c5266d55e2786143bb28fb423f4e97e537f68a06af8' and
            len(original['checks']) == 14 and
            original['total_python_test_executions'] == 1631, 'original native CI/source provenance differs')
    for check in original['checks']:
        require(check['passed'] is True and check['exit_code'] == 0 and not check['skipped'] and not check['unclean_log'] and
                digest(provenance / ('provenance/native-source-logs/' + check['name'] + '.log')) == check['log_sha256'],
                'original CI check/log failed or differs')
    git_archive = provenance / 'corresponding-source/rock-source.tar'
    require(digest(git_archive) == GIT_ARCHIVE_SHA, 'full Git source archive pin differs')
    SOURCE.mkdir(mode=0o700)
    selected_tar(git_archive, SOURCE, set(expected))
    require(source_hashes(expected) == expected, 'frozen source inventory differs')
    frozen_build = module(SOURCE / 'scripts/freeze-native-build.py', 'original_freeze_guard')
    frozen_build.verify_source(SOURCE, git_archive, SOURCE_COMMIT)
    frozen_build.verify_regressions(SOURCE, provenance / 'provenance/native-source-report.json', expected)
    require({PREFIX + n[7:]: record['sha256'] for n, record in package['files'].items() if n.startswith('native/')} ==
            {n: h for n, h in expected.items() if n.startswith(PREFIX)}, 'packaged and original native source differ')
    shutil.copytree(PAYLOAD / 'images', IMAGES)
    shutil.copyfile(freeze_path, IMAGES / 'freeze-manifest.json')
    for path in IMAGES.iterdir():
        path.chmod(0o444)
    sys.path[:0] = [str(NATIVE / 'os/desktop'), str(NATIVE / 'os'), str(NATIVE / 'src')]
    from game_exchange import sandbox, profile
    import guest
    import game_authority_observer
    config = profile.device_config(IMAGES, 'game-final-9abf78a')
    guest.save(DEVICE, config); guest.validate_config(config); profile.verified(config)
    AUTHORITY.mkdir(mode=0o700)
    sandbox.write_json(AUTHORITY / 'sandbox.json', sandbox.sample())
    require(digest(AUTHORITY / 'sandbox.json') == package['game']['sha256'], 'fixed sandbox configuration differs')
    authority = sandbox.load(AUTHORITY / 'sandbox.json'); sandbox.prepare(authority)
    require(sandbox.status(authority)['running'] is False, 'prepared authority unexpectedly running')
    snapshot = sandbox.snapshot(authority)
    game_authority_observer.validate(snapshot, config['game']['authority_id'])
    empty = game_authority_observer.empty_baseline(snapshot)
    save(evidence / 'initial-authority.json', snapshot)
    versions = {}
    for command in (['qemu-system-aarch64', '--version'], ['tesseract', '--version'], ['openssl', 'version']):
        reply = subprocess.run(command, env=clean_environment(), capture_output=True, text=True, check=True, timeout=15)
        versions[command[0]] = (reply.stdout + reply.stderr).strip()
    machines = subprocess.check_output(['qemu-system-aarch64', '-machine', 'help'], env=clean_environment(), timeout=15).decode()
    require(re.search(r'^virt-10\.0\s', machines, re.M) is not None, 'exact original QEMU machine is unavailable')
    save(evidence / 'preparation.json', {'status': 'PREPARED_EMPTY_NOT_ACCEPTED',
        'authority_created': True, 'source_commit': SOURCE_COMMIT,
        'source_files_sha256': expected, 'freeze_sha256': FREEZE_SHA, 'profile_sha256': PROFILE_SHA,
        'images_sha256': package['image_sha256'], 'device_sha256': digest(DEVICE), 'empty_baseline': empty,
        'host': {'machine': platform.machine(), 'kernel': platform.release(), 'python': platform.python_version(),
                 'os_release': Path('/etc/os-release').read_text(), 'versions': versions,
                 'ram_bytes': ram_bytes, 'available_cpus': len(os.sched_getaffinity(0))},
        'host_binary_sha256': {name: digest(shutil.which(name)) for name in
                              ('python3', 'qemu-system-aarch64', 'tesseract', 'openssl', 'debugfs', 'e2fsck')}})
    print('Frozen candidate, original CI logs, signature and fresh empty authority verified.')


def run(evidence):
    no_token(); os.umask(0o077)
    prepared = load(evidence / 'preparation.json')
    require(prepared['status'] == 'PREPARED_EMPTY_NOT_ACCEPTED' and
            source_hashes(prepared['source_files_sha256']) == prepared['source_files_sha256'] and
            digest(DEVICE) == prepared['device_sha256'], 'prepared source or device changed')
    command = ['python3', '-B', str(NATIVE / 'os/desktop/verify-business.py'), '--images', str(IMAGES),
               '--output', str(evidence), '--source-commit', SOURCE_COMMIT, '--mode', 'soak',
               '--boot-profile', 'game-authority-ab', '--device-config', str(DEVICE)]
    save(evidence / 'execution.json', {'command': command, 'outer_timeout_seconds': 7200,
        'inner_limits': 'unchanged frozen business_contract.plan(soak)', 'started_unix': time.time()})
    code, error = None, None
    try:
        with (evidence / 'observer.log').open('xb') as output:
            code = subprocess.run(command, cwd=NATIVE, env=clean_environment(), stdout=output,
                                  stderr=subprocess.STDOUT, timeout=7200).returncode
    except Exception as exc:
        error = type(exc).__name__
    # Stop only this fresh authority via its original ownership-aware CLI. A
    # failed/live OS is never forced down or relabelled as a normal shutdown.
    with (evidence / 'authority-cleanup.log').open('xb') as output:
        try:
            cleanup = subprocess.run(['python3', '-B', str(NATIVE / 'os/game_exchange/sandbox.py'),
                'stop', '--config', str(AUTHORITY / 'sandbox.json')], env=clean_environment(),
                stdout=output, stderr=subprocess.STDOUT, timeout=30).returncode
        except Exception:
            cleanup = None
    unchanged = source_hashes(prepared['source_files_sha256']) == prepared['source_files_sha256']
    reports = list(evidence.glob('business-*/report.json'))
    inputs_unchanged = (digest(DEVICE) == prepared['device_sha256'] and
        digest(IMAGES / 'freeze-manifest.json') == FREEZE_SHA and digest(IMAGES / 'profile.json') == PROFILE_SHA and
        {name: digest(IMAGES / name) for name in prepared['images_sha256']} == prepared['images_sha256'])
    passed = code == 0 and cleanup == 0 and unchanged and inputs_unchanged and len(reports) == 1 and load(reports[0]).get('status') == 'PASS_SCOPED'
    save(evidence / 'result.json', {'status': 'PASS_SCOPED_INDEPENDENT_LINUX' if passed else 'FAIL',
        'observer_exit_code': code, 'authority_stop_exit_code': cleanup, 'exception_type': error,
        'source_unchanged': unchanged, 'frozen_inputs_unchanged': inputs_unchanged,
        'report_sha256': digest(reports[0]) if len(reports) == 1 else None, 'finished_unix': time.time(),
        'not_mac_installation_acceptance': True, 'not_overall_release_acceptance': True})
    require(passed, 'original D6 did not pass; preserve raw evidence and other gates')
    print('Independent Linux D6 completed PASS_SCOPED; other release gates remain separate.')


def upload(evidence):
    secret = token(); release(secret)
    require(evidence.exists() and evidence.resolve() == evidence, 'no evidence directory; no success evidence will be invented')
    run_id = os.environ.get('GITHUB_RUN_ID', ''); attempt = os.environ.get('GITHUB_RUN_ATTEMPT', '')
    require(re.fullmatch('[0-9]+', run_id) and re.fullmatch('[0-9]+', attempt), 'GitHub run identity required')
    paths = sorted(evidence.rglob('*'))
    for path in paths:
        info = path.lstat()
        require(not path.is_symlink() and (stat.S_ISDIR(info.st_mode) or stat.S_ISREG(info.st_mode)) and
                (not path.is_file() or info.st_nlink == 1), 'unsafe evidence member; do not follow links or sockets')
        if path.is_file():
            with path.open('rb') as incoming:
                carry = b''
                while block := incoming.read(1024**2):
                    require(secret.encode() not in carry + block, 'credential bytes detected; evidence upload refused')
                    carry = block[-(len(secret) - 1):] if len(secret) > 1 else b''
    archive = Path('/var/tmp') / ('rock-' + evidence.name + '-' + run_id + '-' + attempt + '.tar.gz')
    require(not archive.exists(), 'evidence archive already exists; no replacement or upload retry')
    with tarfile.open(archive, 'x:gz', compresslevel=1) as output:
        for path in paths:
            if path.is_file():
                output.add(path, arcname=str(path.relative_to(evidence)), recursive=False)
    require(archive.stat().st_size < 2 * 1024**3, 'evidence exceeds the release asset limit')
    value = release(secret)
    require(not any(a.get('name') == archive.name for a in value['assets']), 'evidence asset name already exists; refusing replacement')
    query = urllib.parse.urlencode({'name': archive.name})
    connection = http.client.HTTPSConnection('uploads.github.com', timeout=120)
    try:
        connection.putrequest('POST', '/repos/' + REPOSITORY + '/releases/' + str(LAUNCH['release_id']) + '/assets?' + query)
        for name, value in {'Authorization': 'Bearer ' + secret, 'Accept': 'application/vnd.github+json',
                            'Content-Type': 'application/gzip', 'Content-Length': str(archive.stat().st_size),
                            'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'rock-final-candidate-d6'}.items():
            connection.putheader(name, value)
        connection.endheaders()
        with archive.open('rb') as incoming:
            while block := incoming.read(1024**2):
                connection.send(block)
        response = connection.getresponse(); raw = response.read(1024**2)
        require(response.status == 201, 'private evidence upload failed; do not retry with a new asset name')
        asset = json.loads(raw)
    finally:
        connection.close()
    require(asset.get('name') == archive.name and asset.get('size') == archive.stat().st_size and
            asset.get('state') == 'uploaded' and asset.get('digest') == 'sha256:' + digest(archive),
            'uploaded evidence asset does not match local bytes')
    release(secret)
    print(json.dumps({'status': 'RAW_EVIDENCE_SAVED_TO_PRIVATE_DRAFT', 'release_id': LAUNCH['release_id'],
                      'asset_id': asset['id'], 'bytes': archive.stat().st_size, 'sha256': digest(archive)}))


class Guards(unittest.TestCase):
    def test_draft_cannot_be_published_or_retargeted(self):
        good = {'id': LAUNCH['release_id'], 'draft': True, 'tag_name': LAUNCH['tag'], 'target_commitish': SOURCE_COMMIT}
        check_release(good)
        for field, value in (('draft', False), ('id', 1), ('tag_name', 'other'), ('target_commitish', 'main')):
            with self.assertRaises(ValueError): check_release({**good, field: value})

    def test_asset_metadata_is_pinned(self):
        good = {'assets': [{**a, 'size': a['bytes'], 'state': 'uploaded'} for a in LAUNCH['assets'].values()]}
        pinned_assets(good)
        for field, value in (('state', 'new'), ('size', 1), ('name', 'different'), ('id', 0)):
            bad = json.loads(json.dumps(good)); bad['assets'][0][field] = value
            with self.assertRaises(ValueError): pinned_assets(bad)

    def test_paths(self):
        for value in ('../escape', '/absolute', 'a/../b', 'a//b', 'a\\b'):
            with self.assertRaises(ValueError): safe_name(value)
        self.assertEqual(safe_name('native/os/desktop/preview.py'), 'native/os/desktop/preview.py')

    def test_redirect_drops_authority(self):
        for value in ('http://release-assets.githubusercontent.com/x', 'https://api.github.com/x',
                      'https://release-assets.githubusercontent.com.evil/x', 'https://u:p@release-assets.githubusercontent.com/x'):
            with self.assertRaises(ValueError): redirect_url(value)
        self.assertTrue(redirect_url('https://release-assets.githubusercontent.com/x?sig=public').startswith('https:'))

    def test_environment(self):
        self.assertEqual(set(clean_environment()), {'PATH', 'HOME', 'LANG', 'LC_ALL', 'PYTHONDONTWRITEBYTECODE', 'OMP_THREAD_LIMIT', 'OMP_NUM_THREADS'})

    def test_selected_tar_rejects_link_duplicate_missing(self):
        for kind in ('link', 'duplicate', 'missing'):
            with tempfile.TemporaryDirectory() as temp:
                root = Path(temp); archive = root / 'input.tar'; out = root / 'out'; out.mkdir()
                with tarfile.open(archive, 'w') as stream:
                    entry = tarfile.TarInfo('file' if kind != 'missing' else 'other')
                    if kind == 'link': entry.type = tarfile.SYMTYPE; entry.linkname = '/etc/passwd'
                    stream.addfile(entry)
                    if kind == 'duplicate': stream.addfile(entry)
                with self.assertRaises(ValueError): selected_tar(archive, out, {'file'})

    def test_selected_tar_keeps_execute_but_no_write_or_setid(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp); archive = root / 'input.tar'; out = root / 'out'; out.mkdir()
            with tarfile.open(archive, 'w') as stream:
                entry = tarfile.TarInfo('executable'); entry.mode = 0o6755; stream.addfile(entry)
            selected_tar(archive, out, {'executable'})
            self.assertEqual(stat.S_IMODE((out / 'executable').stat().st_mode), 0o555)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=('fetch', 'prepare', 'run', 'upload', 'self-test'))
    parser.add_argument('--evidence', type=evidence_path, default=DEFAULT_EVIDENCE)
    args = parser.parse_args()
    if args.action == 'self-test':
        require(unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(Guards)).wasSuccessful(), 'wrapper guard tests failed')
    elif args.action == 'fetch': fetch()
    elif args.action == 'prepare': prepare(args.evidence)
    else: globals()[args.action](args.evidence)


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        if not any(os.environ.get(n) for n in ('GITHUB_TOKEN', 'GH_TOKEN', 'ACTIONS_RUNTIME_TOKEN')) and len(sys.argv) > 1 and sys.argv[1] in ('prepare', 'run'):
            try:
                target = evidence_path(sys.argv[sys.argv.index('--evidence') + 1]) if '--evidence' in sys.argv else DEFAULT_EVIDENCE
                if target.is_dir():
                    with (target / 'wrapper-failure.log').open('x') as log:
                        traceback.print_exc(file=log)
            except Exception:
                pass
        # Never print HTTP responses, redirect URLs, request headers or token-bearing tracebacks.
        print('Candidate D6 wrapper failed: ' + type(error).__name__, file=sys.stderr)
        sys.exit(1)

#!/usr/bin/env python3
"""Run native-source regressions in Linux; this does not build or boot an OS."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import platform
import re
import shutil
import signal
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
NATIVE = ROOT / 'systems/rock-star-os'
SUITES = ('tests', 'os/wallet_auth/tests', 'os/entitlement/tests',
          'os/atm/tests', 'os/service_access/tests', 'os/ai_routes/tests')


def inventory():
    files = [ROOT / 'scripts/test-native.py', ROOT / '.github/workflows/native-os.yml']
    for path in NATIVE.rglob('*'):
        relative = path.relative_to(NATIVE)
        if any(part in {'artifacts', '__pycache__', '.venv', '.git', 'build'}
               or part.endswith('.egg-info') for part in relative.parts):
            continue
        if path.is_symlink():
            raise ValueError('Source input must not be a symlink: ' + str(relative))
        if path.is_file() and path.suffix not in {'.pyc', '.o'}:
            files.append(path)
    return {path.relative_to(ROOT).as_posix(): hashlib.sha256(path.read_bytes()).hexdigest()
            for path in sorted(files)}


def log_result(text, code, *, unittest=False, success_marker=None):
    counts = re.findall(r'^Ran (\d+) tests? in ', text, re.MULTILINE)
    count = sum(map(int, counts))
    dirty = bool(re.search(r'^(?:Traceback|Exception ignored)|\b(?:ResourceWarning|RuntimeWarning|DeprecationWarning):', text, re.MULTILINE))
    skipped = bool(re.search(r'\bskipped=', text))
    valid = code == 0 and not dirty and not skipped
    if unittest:
        valid = valid and len(counts) == 1 and count > 0 and bool(re.search(r'^OK\s*\Z', text, re.MULTILINE))
    if success_marker:
        valid = valid and success_marker in text
    return {'tests': count, 'skipped': skipped, 'unclean_log': dirty, 'passed': bool(valid)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=ROOT / 'work/native-tests')
    args = parser.parse_args()
    if sys.platform != 'linux':
        parser.exit(2, 'Native regressions require Linux. Android and Web checks are separate.\n')
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=False)
    before = inventory()
    env = dict(os.environ, PYTHONDONTWRITEBYTECODE='1',
               PYTHONPATH=str(NATIVE / 'src') + os.pathsep + str(NATIVE / 'os'))
    report = {'schema': 'rock-native-regressions/1',
              'started_utc': datetime.now(timezone.utc).isoformat(),
              'platform': platform.platform(), 'machine': platform.machine(),
              'python': sys.version, 'scope': 'Host source regressions; no OS boot, real device, provider or funds',
              'checks': [], 'input_sha256': before}

    def run(name, argv, cwd, timeout=300, *, unittest=False, success_marker=None):
        log = output / (name + '.log')
        with log.open('wb') as stream:
            try:
                with subprocess.Popen(argv, cwd=cwd, env=env, stdout=stream,
                                      stderr=subprocess.STDOUT, start_new_session=True) as process:
                    try:
                        code = process.wait(timeout=timeout)
                    except subprocess.TimeoutExpired:
                        os.killpg(process.pid, signal.SIGKILL)
                        process.wait()
                        raise
            except subprocess.TimeoutExpired:
                code = 124
        text = log.read_text(errors='replace')
        entry = {'name': name, 'command': argv, 'exit_code': code,
                 **log_result(text, code, unittest=unittest, success_marker=success_marker),
                 'log_sha256': hashlib.sha256(log.read_bytes()).hexdigest()}
        report['checks'].append(entry)
        print(json.dumps(entry), flush=True)
        if code == 124:
            report.update(status='FAIL', reason='Suite deadline. Do not reuse this disposable test environment; detached descendants may need owned cleanup.')
            (output / 'report.json').write_text(json.dumps(report, indent=2) + '\n')
            raise SystemExit(1)

    for suite in SUITES:
        run(suite.replace('/', '-'), [sys.executable, '-B', '-W', 'error::ResourceWarning',
                                     '-m', 'unittest', 'discover', '-s', suite, '-v'], NATIVE, unittest=True)
    # C outputs go to a disposable copy; the imported sources remain unchanged.
    with tempfile.TemporaryDirectory(prefix='rock-native-c-') as directory:
        work = Path(directory)
        for component in ('core', 'platform', 'ui'):
            target = work / component
            shutil.copytree(NATIVE / 'os' / component, target)
            run('c-' + component, ['make', 'all'], target)
            if component == 'ui':
                # Observer tests resolve the native project relative to __file__.
                # Run binary/UI IPC here; observer Python suites are covered below.
                run('c-ui-build-tests', ['make', 'rock-ui-test', 'rock-ipc-test'], target)
                run('c-ui-actions', ['./rock-ui-test', str(NATIVE / 'os/assets/NotoSansCJKjp-Regular.otf')], target,
                    success_marker='PASS native UI actions, request identities')
                run('c-ui-native-replay', [sys.executable, '-B', '-W', 'error::ResourceWarning',
                    str(NATIVE / 'os/ui/test_native_replay.py'), '--renderer', str(target / 'rock-ui-test'),
                    '--font', str(NATIVE / 'os/assets/NotoSansCJKjp-Regular.otf')], target,
                    success_marker='PASS public signed catalog native replay geometry')
                run('c-ui-ipc', [sys.executable, '-B', '-W', 'error::ResourceWarning', 'test_ipc.py'], target, unittest=True)
    # Matches os/ui/Makefile's normal host gate. Legacy ATM/wallet/power observer
    # fixtures need separate auth/root setup; see native-os-validation.md.
    run('ui-observers', [sys.executable, '-B', '-W', 'error::ResourceWarning',
                        '-m', 'unittest', 'discover', '-s', 'os/ui', '-p', 'test_evidence.py', '-v'], NATIVE, unittest=True)
    after = inventory()
    report['source_unchanged'] = before == after
    report['changed_inputs'] = [name for name in sorted(before.keys() | after.keys()) if before.get(name) != after.get(name)]
    report['total_python_test_executions'] = sum(x['tests'] for x in report['checks'])
    report['status'] = 'PASS' if before == after and all(
        x['passed'] for x in report['checks']) else 'FAIL'
    report['finished_utc'] = datetime.now(timezone.utc).isoformat()
    (output / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(report['status'], report['total_python_test_executions'], 'Python test executions', flush=True)
    return 0 if report['status'] == 'PASS' else 1


if __name__ == '__main__':
    raise SystemExit(main())

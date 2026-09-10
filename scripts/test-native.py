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

# Optional child-side observation. It neither retries nor changes the parent's
# deadline. Keep the file open through interpreter thread shutdown, too.
STACK_WATCHDOG = r'''
import atexit, faulthandler, os, runpy, sys
fd, delay = int(sys.argv[1]), float(sys.argv[2])
os.set_inheritable(fd, False)
stack_output = os.fdopen(fd, 'wb', buffering=0)
def close_stack_output():
    faulthandler.cancel_dump_traceback_later()
    stack_output.close()
atexit.register(close_stack_output)
faulthandler.dump_traceback_later(delay, file=stack_output, repeat=False, exit=False)
sys.argv = sys.argv[3:]
if sys.argv[0] == '-m':
    sys.argv = sys.argv[1:]
    sys.path[0] = os.getcwd()
    runpy.run_module(sys.argv[0], run_name='__main__', alter_sys=True)
else:
    sys.path[0] = os.path.dirname(os.path.abspath(sys.argv[0]))
    runpy.run_path(sys.argv[0], run_name='__main__')
'''


def run_process(argv, *, cwd, env, stream, timeout, stack_path=None):
    """Preserve the canonical process deadline; optionally collect Python stacks."""
    command = argv
    fd = None
    diagnostic = None
    try:
        if stack_path is not None:
            # Only wrap the exact interpreter flags used by this runner.
            prefix = [sys.executable, '-B', '-W', 'error::ResourceWarning']
            if argv[:4] != prefix or len(argv) < 5:
                raise ValueError('Stack diagnostics require the canonical Python command')
            fd = os.open(stack_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
            delay = timeout - min(30, timeout / 2)
            command = prefix + ['-c', STACK_WATCHDOG, str(fd), str(delay)] + argv[4:]
            diagnostic = {'file': stack_path.name, 'capture_after_seconds': delay,
                          'command': command}
        kwargs = {'pass_fds': (fd,)} if fd is not None else {}
        with subprocess.Popen(command, cwd=cwd, env=env, stdout=stream,
                              stderr=subprocess.STDOUT, start_new_session=True, **kwargs) as process:
            try:
                code = process.wait(timeout=timeout)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGKILL)
                process.wait()
                code = 124
    finally:
        if fd is not None:
            os.close(fd)
    if diagnostic is not None:
        data = stack_path.read_bytes()
        diagnostic.update(bytes=len(data), sha256=hashlib.sha256(data).hexdigest())
    return code, diagnostic


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
    parser.add_argument('--diagnostic-stacks', action='store_true',
                        help='Collect Python thread stacks before existing deadlines in private sidecars')
    args = parser.parse_args()
    if sys.platform != 'linux':
        parser.exit(2, 'Native regressions require Linux. Android and Web checks are separate.\n')
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=False, mode=0o700 if args.diagnostic_stacks else 0o777)
    before = inventory()
    env = dict(os.environ, PYTHONDONTWRITEBYTECODE='1',
               PYTHONPATH=str(NATIVE / 'src') + os.pathsep + str(NATIVE / 'os'))
    report = {'schema': 'rock-native-regressions/1',
              'started_utc': datetime.now(timezone.utc).isoformat(),
              'platform': platform.platform(), 'machine': platform.machine(),
              'python': sys.version, 'scope': 'Host source regressions; no OS boot, real device, provider or funds',
              'checks': [], 'input_sha256': before}
    if args.diagnostic_stacks:
        report['diagnostic_stacks'] = True

    def run(name, argv, cwd, timeout=300, *, unittest=False, success_marker=None):
        log = output / (name + '.log')
        stack_path = output / (name + '.stacks.log') if args.diagnostic_stacks and argv[0] == sys.executable else None
        with log.open('wb') as stream:
            code, diagnostic = run_process(argv, cwd=cwd, env=env, stream=stream,
                                           timeout=timeout, stack_path=stack_path)
        text = log.read_text(errors='replace')
        entry = {'name': name, 'command': argv, 'exit_code': code,
                 **log_result(text, code, unittest=unittest, success_marker=success_marker),
                 'log_sha256': hashlib.sha256(log.read_bytes()).hexdigest()}
        if diagnostic is not None:
            entry['diagnostic_stacks'] = diagnostic
        report['checks'].append(entry)
        print(json.dumps(entry), flush=True)
        if code == 124:
            report.update(status='FAIL', reason='Suite deadline. Do not reuse this disposable test environment; detached descendants may need owned cleanup.')
            (output / 'report.json').write_text(json.dumps(report, indent=2) + '\n')
            raise SystemExit(1)

    for suite in SUITES:
        run(suite.replace('/', '-'), [sys.executable, '-B', '-W', 'error::ResourceWarning',
                                     '-m', 'unittest', 'discover', '-s', suite, '-v'], NATIVE,
            timeout=600 if suite == 'tests' else 300, unittest=True)
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

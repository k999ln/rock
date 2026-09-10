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
import stat
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
NATIVE = ROOT / 'systems/rock-star-os'
SUITES = ('tests', 'os/wallet_auth/tests', 'os/entitlement/tests',
          'os/atm/tests', 'os/service_access/tests', 'os/ai_routes/tests')
SUPPORT_CHECKS = tuple(suite.replace('/', '-') for suite in SUITES[1:]) + (
    'c-core', 'c-platform', 'c-ui', 'c-ui-build-tests', 'c-ui-actions',
    'c-ui-native-replay', 'c-ui-ipc', 'ui-observers')

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
sys.argv = sys.argv[1:]
sys.path[0] = os.getcwd()
runpy.run_module(sys.argv[0], run_name='__main__', alter_sys=True)
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
            if argv[4] != '-m':
                # run_path is not equivalent to direct interpreter execution:
                # relative __file__ and argv[0] semantics can change imports and
                # sibling executable lookup. Keep direct scripts untouched.
                diagnostic = {'status': 'NOT_APPLICABLE_DIRECT_SCRIPT',
                              'reason': 'Original interpreter entrypoint retained; no stack sidecar.'}
            else:
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
    if fd is not None:
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


def verified_sidecars(directory, check, *, diagnostic, main, prefix):
    """Bind each declared stack to its raw bytes before copying the artifact."""
    observed = {}
    name = check['name']
    python_check = (name == 'tests' or name.startswith('os-') or name in
                    ('c-ui-native-replay', 'c-ui-ipc', 'ui-observers'))
    specifications = (
        ('diagnostic_stacks', name + '.stacks.log', diagnostic and python_check),
        ('test_failure_stacks', 'tests.selection.failures.stacks.log',
         diagnostic and main and name == 'tests'),
    )
    for field, expected_name, required in specifications:
        value = check.get(field)
        if value is None:
            if required:
                raise ValueError('missing required native stack metadata: ' + field)
            continue
        if not isinstance(value, dict):
            raise ValueError('invalid native stack metadata: ' + field)
        if field == 'test_failure_stacks' and not (main and name == 'tests'):
            raise ValueError('unexpected per-test native stack metadata')
        if field == 'diagnostic_stacks' and value.get('status') == 'NOT_APPLICABLE_DIRECT_SCRIPT':
            if name not in ('c-ui-native-replay', 'c-ui-ipc') or 'file' in value:
                raise ValueError('invalid native direct-script diagnostic exception')
            observed[field] = dict(value)
            continue
        if (value.get('file') != expected_name or type(value.get('bytes')) is not int
                or value['bytes'] < 0 or not isinstance(value.get('sha256'), str)
                or re.fullmatch('[0-9a-f]{64}', value['sha256']) is None):
            raise ValueError('invalid native stack identity: ' + field)
        path = directory / expected_name
        try:
            info = path.lstat()
        except OSError as error:
            raise ValueError('missing native stack: ' + expected_name) from error
        if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1:
            raise ValueError('native stack must be a distinct regular file: ' + expected_name)
        raw = path.read_bytes()
        if len(raw) != value['bytes'] or hashlib.sha256(raw).hexdigest() != value['sha256']:
            raise ValueError('native stack bytes differ: ' + expected_name)
        observed[field] = {**value, 'file': prefix + '/' + expected_name}
    return observed


def merge_parts(parts, output, count):
    """Fail closed on missing/duplicate partitions, inventory or log changes."""
    if not 1 <= count <= 16:
        raise ValueError('invalid native partition count')
    expected_inputs = inventory()
    reports = []
    for path in sorted(parts.rglob('report.json')):
        report = json.loads(path.read_text())
        if (report.get('schema') != 'rock-native-regressions/1' or report.get('status') != 'PASS'
                or report.get('source_unchanged') is not True or report.get('changed_inputs') != []
                or report.get('input_sha256') != expected_inputs
                or not report.get('started_utc') or not report.get('finished_utc')):
            raise ValueError('incomplete or different-source native partition: ' + str(path))
        reports.append((path, report))
    if len(reports) != count + 1:
        raise ValueError('missing or duplicate native partition reports')
    main, support, all_ids = {}, None, None
    for path, report in reports:
        part = report.get('partition', {})
        if part.get('kind') == 'main':
            index = part.get('index')
            if type(index) is not int or not 0 <= index < count or part.get('count') != count or index in main:
                raise ValueError('duplicate or invalid main partition')
            plan_path = path.parent / 'tests.selection.json'
            raw = plan_path.read_bytes()
            if hashlib.sha256(raw).hexdigest() != part.get('selection_sha256'):
                raise ValueError('native selection hash differs')
            plan = json.loads(raw)
            ids = plan.get('tests')
            if not isinstance(ids, list) or not ids or not all(type(name) is str and name for name in ids):
                raise ValueError('invalid native discovery inventory')
            if all_ids is None:
                all_ids = ids
            if ids != all_ids:
                raise ValueError('native discovery inventories differ')
            selected = [i for i, name in enumerate(ids) if
                int.from_bytes(hashlib.sha256(name.split('.')[0].encode()).digest()[:8], 'big') % count == index]
            if (plan.get('schema') != 'rock-native-selection/1' or plan.get('index') != index
                    or plan.get('count') != count or plan.get('selected_ordinals') != selected or not selected
                    or [check.get('name') for check in report.get('checks', [])] != ['tests']
                    or report['checks'][0].get('tests') != len(selected)):
                raise ValueError('native partition coverage differs')
            main[index] = (path, report)
        elif part == {'kind': 'support'} and support is None:
            if [check.get('name') for check in report.get('checks', [])] != list(SUPPORT_CHECKS):
                raise ValueError('native support checks differ')
            support = (path, report)
        else:
            raise ValueError('duplicate or invalid support partition')
    if set(main) != set(range(count)) or support is None:
        raise ValueError('native partition coverage incomplete')
    output.mkdir(parents=True, exist_ok=False, mode=0o700)
    checks, sources = [], []
    for index, (path, report) in enumerate([main[i] for i in range(count)] + [support]):
        prefix = 'main-' + str(index) if index < count else 'support'
        destination = output / prefix
        for check in report['checks']:
            name = check['name']
            log = path.parent / (name + '.log')
            raw = log.read_bytes()
            is_unittest = name == 'tests' or name.startswith('os-') or name in ('c-ui-ipc', 'ui-observers')
            if (check.get('passed') is not True or type(check.get('exit_code')) is not int
                    or check['exit_code'] != 0 or check.get('skipped') is not False
                    or check.get('unclean_log') is not False
                    or hashlib.sha256(raw).hexdigest() != check.get('log_sha256')
                    or log_result(raw.decode(errors='replace'), 0, unittest=is_unittest) != {
                        key: check[key] for key in ('tests', 'skipped', 'unclean_log', 'passed')}):
                raise ValueError('native partition check or original log differs: ' + name)
            sidecars = verified_sidecars(path.parent, check,
                diagnostic=report.get('diagnostic_stacks') is True, main=index < count, prefix=prefix)
            checks.append({**check, **sidecars, 'name': prefix + '-' + name if index < count else name,
                           'log_file': prefix + '/' + name + '.log'})
        if report.get('total_python_test_executions') != sum(check['tests'] for check in report['checks']):
            raise ValueError('native partition totals differ')
        shutil.copytree(path.parent, destination)
        for check in report['checks']:
            verified_sidecars(destination, check,
                diagnostic=report.get('diagnostic_stacks') is True, main=index < count, prefix=prefix)
        sources.append({'partition': report['partition'], 'report_file': prefix + '/report.json',
                        'report_sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
                        'platform': report['platform'], 'machine': report['machine'], 'python': report['python']})
    merged = {'schema': 'rock-native-regressions/1', 'status': 'PASS',
              'scope': 'Host source regressions across isolated CI jobs; no OS boot, device, provider or funds',
              'started_utc': min(report['started_utc'] for _, report in reports),
              'finished_utc': max(report['finished_utc'] for _, report in reports),
              'checks': checks, 'total_python_test_executions': sum(check['tests'] for check in checks),
              'input_sha256': expected_inputs, 'source_unchanged': True, 'changed_inputs': [],
              'partitioned': True, 'main_test_executions': len(all_ids),
              'partition_count': count, 'partition_reports': sources}
    (output / 'report.json').write_text(json.dumps(merged, indent=2) + '\n')
    print('PASS', merged['total_python_test_executions'], 'Python test executions; complete partition coverage')
    return 0


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=ROOT / 'work/native-tests')
    parser.add_argument('--diagnostic-stacks', action='store_true',
                        help='Collect Python -m suite stacks before existing deadlines; direct scripts are unchanged')
    parser.add_argument('--part', choices=('all', 'main', 'support'), default='all')
    parser.add_argument('--shard-index', type=int)
    parser.add_argument('--shard-count', type=int, default=4)
    parser.add_argument('--merge-parts', type=Path)
    args = parser.parse_args()
    if sys.platform != 'linux':
        parser.exit(2, 'Native regressions require Linux. Android and Web checks are separate.\n')
    if args.merge_parts:
        return merge_parts(args.merge_parts.resolve(), args.output.resolve(), args.shard_count)
    if args.part == 'main':
        if (args.shard_index is None or not 1 <= args.shard_count <= 16
                or not 0 <= args.shard_index < args.shard_count):
            parser.error('main partition requires a valid index and count')
    elif args.shard_index is not None:
        parser.error('shard index only applies to the main partition')
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
    if args.part != 'all':
        report['partition'] = {'kind': args.part}
    if args.part == 'main':
        report['partition'].update(index=args.shard_index, count=args.shard_count)
        env['PYTHONPATH'] += os.pathsep + str(NATIVE / 'tests')

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
        if name == 'tests' and args.part == 'main' and args.diagnostic_stacks:
            failure_path = output / 'tests.selection.failures.stacks.log'
            if failure_path.exists():
                raw = failure_path.read_bytes()
                entry['test_failure_stacks'] = {'file': failure_path.name,
                    'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()}
        report['checks'].append(entry)
        print(json.dumps(entry), flush=True)
        if code == 124:
            report.update(status='FAIL', reason='Suite deadline. Do not reuse this disposable test environment; detached descendants may need owned cleanup.')
            (output / 'report.json').write_text(json.dumps(report, indent=2) + '\n')
            raise SystemExit(1)

    if args.part == 'main':
        selection_path = output / 'tests.selection.json'
        run('tests', [sys.executable, '-B', '-W', 'error::ResourceWarning', '-m', 'native_partition',
                      '--index', str(args.shard_index), '--count', str(args.shard_count),
                      '--selection', str(selection_path)] +
                      (['--capture-test-failures'] if args.diagnostic_stacks else []),
                      NATIVE, timeout=600, unittest=True)
        report['partition']['selection_sha256'] = hashlib.sha256(selection_path.read_bytes()).hexdigest()
    for suite in SUITES if args.part == 'all' else SUITES[1:] if args.part == 'support' else ():
        run(suite.replace('/', '-'), [sys.executable, '-B', '-W', 'error::ResourceWarning',
                                     '-m', 'unittest', 'discover', '-s', suite, '-v'], NATIVE,
            timeout=600 if suite == 'tests' else 300, unittest=True)
    # C outputs go to a disposable copy; the imported sources remain unchanged.
    if args.part != 'main':
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

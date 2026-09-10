"""Fixed sandbox diagnostics; resource modes never accept code, paths or limits."""
import errno
import json
import math
import os
from pathlib import Path
import resource
import signal
import socket
import sys
import time

SCHEMA = 'rock-sandbox-resource-probe/1'
MODES = ('memory', 'cpu', 'file-size', 'crash')
LIMITS = {'as': 268435456, 'cpu': 2, 'fsize': 1048576, 'core': 0}
DEADLINES = {'memory': 6, 'cpu': 8, 'file-size': 6, 'crash': 6}
ARMED = 'ROCK_SANDBOX_RESOURCE_ARMED '
RESULT = 'ROCK_SANDBOX_RESOURCE_RESULT '


def require(value, message):
    if not value:
        raise ValueError(message)


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), allow_nan=False)


def unique(pairs):
    result = {}
    for key, value in pairs:
        require(key not in result, 'duplicate resource evidence field')
        result[key] = value
    return result


def validate_resource_result(mode, completed, elapsed):
    require(mode in MODES, 'unknown fixed resource mode')
    require(type(completed.returncode) is int, 'resource exit code must be an integer')
    require(type(elapsed) in (int, float) and math.isfinite(elapsed) and
            0 < elapsed <= DEADLINES[mode], 'resource probe exceeded deadline')
    require(type(completed.stdout) is str and type(completed.stderr) is str and
            len(completed.stdout.encode()) <= 4096 and len(completed.stderr.encode()) <= 8192,
            'resource evidence exceeded bound')
    lines = completed.stdout.splitlines()
    count = 2 if mode in ('memory', 'file-size') else 1
    require(len(lines) == count and completed.stdout.endswith('\n') and lines[0].startswith(ARMED),
            'resource arming proof missing or extra output')
    armed = json.loads(lines[0][len(ARMED):], object_pairs_hook=unique)
    expected = {'schema': SCHEMA, 'mode': mode, 'uid': 65534,
                'limits': {key: [value, value] for key, value in LIMITS.items()}}
    require(canonical(armed) == canonical(expected), 'resource identity or enforced limits differ')
    outcome = None
    if count == 2:
        require(lines[1].startswith(RESULT), 'resource failure outcome missing')
        outcome = json.loads(lines[1][len(RESULT):], object_pairs_hook=unique)
        expected_outcome = ({'mode': mode, 'outcome': 'MemoryError'} if mode == 'memory' else
                            {'mode': mode, 'outcome': 'EFBIG', 'bytes': LIMITS['fsize']})
        require(completed.returncode == 0 and canonical(outcome) == canonical(expected_outcome),
                'resource denial was not the exact expected failure')
    else:
        expected_signal = signal.SIGKILL if mode == 'cpu' else signal.SIGSEGV
        require(mode != 'cpu' or elapsed >= 1.5, 'CPU process died before its configured budget')
        require(type(completed.returncode) is int and completed.returncode in
                (-expected_signal, 128 + expected_signal), 'expected kernel signal termination missing')
    return {'mode': mode, 'status': 'PASS', 'returncode': completed.returncode,
            'elapsed_seconds': elapsed, 'armed': armed, 'outcome': outcome}


def resource_probe(mode):
    require(mode in MODES and sys.platform == 'linux' and os.getuid() == os.geteuid() == 65534,
            'fixed diagnostic requires actual unprivileged Linux sandbox')
    kinds = {'as': resource.RLIMIT_AS, 'cpu': resource.RLIMIT_CPU,
             'fsize': resource.RLIMIT_FSIZE, 'core': resource.RLIMIT_CORE}
    measured = {name: list(resource.getrlimit(kind)) for name, kind in kinds.items()}
    require(measured == {name: [value, value] for name, value in LIMITS.items()},
            'refusing diagnostic without unchanged production limits')
    print(ARMED + canonical({'schema': SCHEMA, 'mode': mode, 'uid': os.geteuid(), 'limits': measured}), flush=True)
    if mode == 'memory':
        try:
            value = bytearray(LIMITS['as'] * 2)
        except MemoryError:
            print(RESULT + canonical({'mode': mode, 'outcome': 'MemoryError'}), flush=True)
            return 0
        raise RuntimeError('allocation exceeded enforced address-space limit: ' + str(len(value)))
    if mode == 'cpu':
        # No self-signal: only the existing kernel CPU hard limit may kill this
        # process. A wall bound also exits unsuccessfully if enforcement fails.
        deadline, value = time.monotonic() + 7, 0
        while time.monotonic() < deadline:
            value = (value + 1) & 65535
        raise RuntimeError('CPU hard limit did not terminate diagnostic')
    if mode == 'file-size':
        path = '/tmp/rock-resource-file-size'
        fd = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW, 0o600)
        try:
            # CPython ignores SIGXFSZ; the kernel must return EFBIG at the cap.
            for _ in range(4):
                require(os.write(fd, b'x' * 262144) == 262144, 'short pre-limit scratch write')
            try:
                os.write(fd, b'x')
            except OSError as error:
                require(error.errno == errno.EFBIG and os.fstat(fd).st_size == LIMITS['fsize'],
                        'file-size failure was not EFBIG at exactly 1 MiB')
                print(RESULT + canonical({'mode': mode, 'outcome': 'EFBIG', 'bytes': os.fstat(fd).st_size}), flush=True)
                return 0
            raise RuntimeError('file-size limit allowed overflow')
        finally:
            os.close(fd)
            os.unlink(path)
    os.kill(os.getpid(), signal.SIGSEGV)
    raise RuntimeError('explicit crash signal did not terminate diagnostic')


def isolation_probe():
    checks = {}
    checks['uid_unprivileged'] = os.getuid() == 65534 and os.geteuid() == 65534
    checks['data_hidden'] = not list(Path('/data').iterdir())
    checks['wallet_socket_hidden'] = not Path('/run/rock-wallet/api.sock').exists()
    checks['platform_socket_hidden'] = not Path('/run/rock-platform/api.sock').exists()
    checks['host_root_hidden'] = not Path('/etc/shadow').exists()
    checks['proc_isolated'] = len([x for x in Path('/proc').iterdir() if x.name.isdigit()]) <= 4
    interfaces = {line.split(':', 1)[0].strip() for line in Path('/proc/net/dev').read_text().splitlines() if ':' in line}
    checks['network_namespace'] = Path('/proc/self/ns/net').stat().st_ino != int(os.environ['ROCK_OUTER_NETNS'])
    for family, name in ((socket.AF_INET, 'inet_denied'), (socket.AF_UNIX, 'unix_denied')):
        try:
            with socket.socket(family, socket.SOCK_STREAM):
                checks[name] = False
        except OSError as error:
            checks[name] = error.errno == errno.EPERM
    try:
        Path('/usr/rock-isolation-write-probe').write_text('must not write')
        checks['system_readonly'] = False
    except OSError as error:
        checks['system_readonly'] = error.errno in (errno.EROFS, errno.EACCES)
    try:
        pid = os.fork()
        if pid == 0:
            os._exit(99)
        os.waitpid(pid, 0)
        checks['fork_denied'] = False
    except OSError as error:
        checks['fork_denied'] = error.errno == errno.EPERM
    status = Path('/proc/self/status').read_text()
    checks['no_new_privs'] = 'NoNewPrivs:\t1' in status
    checks['seccomp_filter'] = 'Seccomp:\t2' in status
    checks['memory_bounded'] = resource.getrlimit(resource.RLIMIT_AS) == (268435456, 268435456)
    checks['cpu_bounded'] = resource.getrlimit(resource.RLIMIT_CPU) == (2, 2)
    checks['fds_bounded'] = resource.getrlimit(resource.RLIMIT_NOFILE) == (64, 64)
    print(json.dumps({'ok': all(checks.values()), 'checks': checks, 'network_interfaces': sorted(interfaces)}, sort_keys=True))
    return 0 if all(checks.values()) else 1


if __name__ == '__main__':
    if len(sys.argv) == 1:
        raise SystemExit(isolation_probe())
    require(len(sys.argv) == 2 and sys.argv[1] in MODES, 'unknown fixed diagnostic arguments')
    raise SystemExit(resource_probe(sys.argv[1]))

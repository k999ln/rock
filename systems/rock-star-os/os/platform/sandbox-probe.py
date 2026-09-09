"""Runs inside exactly the recipe isolation boundary; returns measured checks."""
import errno
import json
import os
from pathlib import Path
import resource
import socket

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
raise SystemExit(0 if all(checks.values()) else 1)

"""Fixed sandbox entry, bound by the operator; never a submitted script."""
import json
import os
import runpy
import socket
import sys

network_denied = False
try:
    socket.socket(socket.AF_INET, socket.SOCK_STREAM).close()
except PermissionError:
    network_denied = True
proof = {'kind': 'actual_linux_isolated_process', 'pid': os.getpid(), 'uid': os.getuid(),
         'network_namespace': os.readlink('/proc/self/ns/net'),
         'mount_namespace': os.readlink('/proc/self/ns/mnt'),
         'socket_syscall_denied': network_denied,
         'wallet_path_visible': os.path.exists('/data/wallet'),
         'physical_usb': 'NOT_RUN'}
print('ROCK_RUNNER_ISOLATION ' + json.dumps(proof, sort_keys=True), file=sys.stderr, flush=True)
if not network_denied or proof['wallet_path_visible']:
    raise SystemExit('isolation probe rejected')
runpy.run_path('/recipe_worker.py', run_name='__main__')

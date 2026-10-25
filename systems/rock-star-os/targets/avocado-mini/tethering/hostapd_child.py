"""Internal Linux launcher: foreground hostapd dies with its owning Broker.

No public command API. The parent passes only its pinned namespace FD and its
private generated config; binary paths are fixed. Never use hostapd -B.
"""
import ctypes
import os
from pathlib import Path
import signal
import sys


def bind_parent(parent_pid):
    if not sys.platform.startswith('linux'):
        raise RuntimeError('Linux parent-death signal required')
    libc = ctypes.CDLL(None, use_errno=True)
    if libc.prctl(1, signal.SIGKILL, 0, 0, 0) != 0:  # PR_SET_PDEATHSIG
        raise OSError(ctypes.get_errno(), 'parent-death signal failed')
    if os.getppid() != parent_pid:  # Parent may have died before prctl.
        raise RuntimeError('AP owner already exited')


def main():
    if len(sys.argv) != 4:
        raise RuntimeError('internal launcher arguments required')
    parent_pid, namespace_fd = int(sys.argv[1]), int(sys.argv[2])
    config = Path(sys.argv[3])
    if not config.is_absolute() or config.name != 'hostapd.conf':
        raise RuntimeError('private AP config required')
    bind_parent(parent_pid)
    os.fstat(namespace_fd)
    # net-only nsenter with --no-fork preserves the parent and death signal.
    os.execv('/usr/bin/nsenter', ['/usr/bin/nsenter', '--no-fork',
        f'--net=/proc/self/fd/{namespace_fd}', '--', '/usr/sbin/hostapd', str(config)])


if __name__ == '__main__':
    main()

#!/usr/bin/env python3
"""Fixed POSIX limit entry; execs the unchanged MR CLI, accepts no arguments."""
import os
from pathlib import Path
import resource
import signal
import sys


def main():
    if len(sys.argv) != 1 or os.name != 'posix' or os.getuid() != os.geteuid() or os.geteuid() == 0:
        return 70
    # The parent masks these only while taking ownership of this child.
    signal.pthread_sigmask(signal.SIG_UNBLOCK, {signal.SIGINT, signal.SIGTERM})
    root = Path(__file__).resolve().parent
    for kind, maximum in ((resource.RLIMIT_CPU, 2), (resource.RLIMIT_CORE, 0),
                          (resource.RLIMIT_FSIZE, 1024 * 1024), (resource.RLIMIT_NOFILE, 64)):
        resource.setrlimit(kind, (maximum, maximum))
    # No shell, caller-selected command or source modification. The parent
    # staged and hashed these fixed inputs before this process was created.
    os.execve(sys.executable, [sys.executable, '-I', '-B', str(root / 'rock_star_tools.py'),
                             'citations', '--input', str(root / 'input.md')],
              {'PATH': '/usr/bin:/bin', 'LANG': 'C.UTF-8', 'HOME': str(root)})


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except (OSError, ValueError):
        # Never include source/input paths or exception arguments in diagnostics.
        raise SystemExit(70) from None

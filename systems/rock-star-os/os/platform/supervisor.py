"""Restart the unprivileged Platform service; never changes privileges or runs a shell."""
import ctypes
import os
from pathlib import Path
import signal
import subprocess
import sys
import threading
import time


def _stop_group(child, timeout):
    """Reap the leader and adopted descendants, including after a leader crash."""
    try:
        os.killpg(child.pid, signal.SIGTERM)
    except ProcessLookupError:
        child.wait()
        return
    deadline = time.monotonic() + timeout
    while True:
        if child.poll() is not None:
            try:
                while os.waitpid(-child.pid, os.WNOHANG)[0]:
                    pass
            except ChildProcessError:
                pass
        try:
            os.killpg(child.pid, 0)
        except ProcessLookupError:
            child.wait()
            return
        if time.monotonic() >= deadline:
            break
        time.sleep(0.025)
    try:
        os.killpg(child.pid, signal.SIGKILL)
    except ProcessLookupError:
        pass
    child.wait()
    # Linux subreaper adoption makes orphaned group members ours to reap.
    try:
        while True:
            os.waitpid(-child.pid, 0)
    except ChildProcessError:
        pass


def supervise(command, *, initial_delay=1.0, maximum_delay=30.0, stop_timeout=4.0):
    if sys.platform != 'linux':
        raise RuntimeError('PLATFORM_SUPERVISOR_REQUIRES_LINUX')
    libc = ctypes.CDLL(None, use_errno=True)
    prior_subreaper = ctypes.c_int()
    if (libc.prctl(37, ctypes.byref(prior_subreaper), 0, 0, 0) != 0
            or libc.prctl(36, 1, 0, 0, 0) != 0):
        raise RuntimeError('PLATFORM_SUPERVISOR_SUBREAPER_FAILED')
    stop = threading.Event()
    previous = {}
    for sig in (signal.SIGTERM, signal.SIGINT):
        previous[sig] = signal.signal(sig, lambda _sig, _frame: stop.set())
    parent = os.getpid()

    def bind_parent():
        # A supervisor crash must not leave an unsupervised duplicate Platform.
        if libc.prctl(1, signal.SIGTERM, 0, 0, 0) != 0 or os.getppid() != parent:
            os._exit(125)

    child = None
    delay = initial_delay
    try:
        while not stop.is_set():
            started = time.monotonic()
            child = subprocess.Popen(command, start_new_session=True, preexec_fn=bind_parent)
            while child.poll() is None and not stop.wait(0.1):
                pass
            if stop.is_set():
                break
            child.wait()
            _stop_group(child, stop_timeout)
            child = None
            if time.monotonic() - started > 60:
                delay = initial_delay
            print('ROCK_PLATFORM_RESTART_PENDING', flush=True)
            if stop.wait(delay):
                break
            delay = min(maximum_delay, delay * 2)
    finally:
        if child is not None:
            _stop_group(child, stop_timeout)
        for sig, handler in previous.items():
            signal.signal(sig, handler)
        libc.prctl(36, prior_subreaper.value, 0, 0, 0)


if __name__ == '__main__':
    if len(sys.argv) != 1:
        raise SystemExit('PLATFORM_SUPERVISOR_ARGUMENTS_DENIED')
    supervise(['/usr/bin/python3', '-I', '-B', str(Path(__file__).with_name('service.py')), '--role', 'platform'])

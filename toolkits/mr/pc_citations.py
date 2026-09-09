"""One allowlisted MR CLI subprocess on macOS/Linux; no native/USB sandbox claim.

Only supplied UTF-8 text is accepted. Public interface: run_citations(text).
No retry, alternate implementation, executable override or persistent job store.
"""
from __future__ import annotations

import hashlib
import os
from pathlib import Path
import selectors
import shutil
import signal
import stat
import subprocess
import sys
import tempfile
import threading
import time

ROOT = Path(__file__).resolve().parent
VENDOR = ROOT / 'vendor/mr'
if not VENDOR.is_dir():
    VENDOR = ROOT.parents[1] / 'vendor/mr'
MAX_INPUT = MAX_OUTPUT = 65536
MAX_DIAGNOSTIC = 8192
WALL_SECONDS = 3
CLEANUP_SECONDS = 2
_SOURCE_HASHES = {
    'rock_star_tools.py': '42f138200a472a0351f9b61d5ba7a0b487b0cabff4d9b4e9b96312b55fbff40f',
    'pc_citations_worker.py': 'cca361ad08c2c37259877157b892ec092b6a8693f82efb140c46e0984239ae33',
    'vendor/mr/provenance.json': 'e782c0b741e9bcdcc3a591e2e6c3bcdaf5b03b51d08e77e4becf218b1e4cbd4f',
    'vendor/mr/citation-strip.py': 'ed5c28225402c5885c1265c0648b5d4d227a2345ca71e387275a8f205b4ffd13',
    'vendor/mr/LICENSE': '6cf38019109830262ffd5a3e1dca12e6e972c9750d2a68f99d5494d173960fac',
}
_ACTIVE = threading.Lock()
_POISONED = False


class CitationsError(ValueError):
    """Safe finite diagnostics; no input, source path or child stderr."""


def _read_source(path, expected):
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(fd, 'rb') as stream:
        info = os.fstat(stream.fileno())
        if (not stat.S_ISREG(info.st_mode) or info.st_nlink != 1 or info.st_mode & 0o022
                or info.st_uid not in (0, os.geteuid()) or not 0 < info.st_size <= 16384):
            raise CitationsError('PC citations source is not protected.')
        data = stream.read(16385)
        if hashlib.sha256(data).hexdigest() != expected:
            raise CitationsError('PC citations source hash mismatch.')
        return data


def _sources():
    if VENDOR.is_symlink() or not VENDOR.is_dir():
        raise CitationsError('PC citations source is not protected.')
    return {name: _read_source(VENDOR / name.removeprefix('vendor/mr/') if name.startswith('vendor/mr/')
                               else ROOT / name, expected) for name, expected in _SOURCE_HASHES.items()}


def _write_new(path, content, mode):
    with path.open('xb') as stream:
        os.fchmod(stream.fileno(), mode)
        stream.write(content)


def _spawn(directory):
    executable = str(Path(sys.executable).resolve(strict=True))
    return subprocess.Popen([executable, '-I', '-B', str(directory / 'pc_citations_worker.py')],
                            stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                            cwd=directory, env={'PATH': '/usr/bin:/bin', 'LANG': 'C.UTF-8', 'HOME': str(directory)},
                            start_new_session=True, close_fds=True)


def _collect(process, deadline):
    output, diagnostic = bytearray(), bytearray()
    with selectors.DefaultSelector() as selector:
        for stream, target, limit in ((process.stdout, output, MAX_OUTPUT),
                                      (process.stderr, diagnostic, MAX_DIAGNOSTIC)):
            os.set_blocking(stream.fileno(), False)
            selector.register(stream, selectors.EVENT_READ, (target, limit))
        while selector.get_map():
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise CitationsError('PC citations exceeded its time limit.')
            for event, _ in selector.select(min(.02, remaining)):
                target, limit = event.data
                part = os.read(event.fileobj.fileno(), min(16384, limit - len(target) + 1))
                if not part:
                    selector.unregister(event.fileobj)
                else:
                    target.extend(part)
                    if len(target) > limit:
                        raise CitationsError('PC citations exceeded its output limit.')
        # Do not reap the leader yet: retaining it prevents PID/group reuse
        # before cleanup also kills descendants that outlived their leader.
        while time.monotonic() < deadline:
            result = os.waitid(os.P_PID, process.pid, os.WEXITED | os.WNOHANG | os.WNOWAIT)
            if result is not None:
                if time.monotonic() >= deadline:
                    break
                if result.si_code != os.CLD_EXITED or result.si_status != 0:
                    raise CitationsError('PC citations process failed.')
                try:
                    value = bytes(output).decode('utf-8')
                    if time.monotonic() >= deadline:
                        raise CitationsError('PC citations exceeded its time limit.')
                    return value
                except UnicodeError:
                    raise CitationsError('PC citations returned invalid UTF-8.') from None
            time.sleep(.005)
        raise CitationsError('PC citations exceeded its time limit.')


def _darwin_group_members(group):
    # Darwin returns EPERM when killpg targets only an unreaped zombie. Inspect
    # this exact owned group (not all processes) before treating it as empty.
    # SDK libproc.h / sys/proc_info.h: PROC_PGRP_ONLY = 2, result is byte count.
    import ctypes
    library = ctypes.CDLL('/usr/lib/libproc.dylib', use_errno=True)
    function = library.proc_listpids
    function.argtypes = [ctypes.c_uint32, ctypes.c_uint32, ctypes.c_void_p, ctypes.c_int]
    function.restype = ctypes.c_int
    buffer = (ctypes.c_int * 1024)()
    count = function(2, group, buffer, ctypes.sizeof(buffer))
    if count < 0 or count >= ctypes.sizeof(buffer) or count % ctypes.sizeof(ctypes.c_int):
        raise CitationsError('PC citations process inventory failed.')
    return {pid for pid in buffer[:count // ctypes.sizeof(ctypes.c_int)] if pid > 0}


def _cleanup_process(process):
    try:
        # Confirm it is still our unreaped child before any group signal. No
        # poll() occurs earlier. The zombie retains the original PID/group ID.
        exited = os.waitid(os.P_PID, process.pid, os.WEXITED | os.WNOHANG | os.WNOWAIT)
        only_leader = (sys.platform == 'darwin' and exited is not None and
                       _darwin_group_members(process.pid) <= {process.pid})
        if not only_leader:
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
        deadline = time.monotonic() + CLEANUP_SECONDS
        process.wait(timeout=max(.01, deadline - time.monotonic()))
        while time.monotonic() < deadline:
            if sys.platform == 'darwin':
                if not _darwin_group_members(process.pid):
                    return
            else:
                try:
                    os.killpg(process.pid, 0)
                except ProcessLookupError:
                    return
            time.sleep(.01)
        raise CitationsError('PC citations process cleanup could not be confirmed.')
    finally:
        for stream in (process.stdout, process.stderr):
            stream.close()


def run_citations(text):
    global _POISONED
    if type(text) is not str:
        raise CitationsError('PC citations requires UTF-8 text.')
    try:
        raw = text.encode('utf-8')
    except UnicodeError:
        raise CitationsError('PC citations requires UTF-8 text.') from None
    if not 1 <= len(raw) <= MAX_INPUT:
        raise CitationsError('PC citations input must be 1–65536 UTF-8 bytes.')
    if (sys.platform not in ('darwin', 'linux') or not hasattr(os, 'WNOWAIT') or not hasattr(os, 'waitid')
            or os.geteuid() == 0 or os.geteuid() != os.getuid()):
        raise CitationsError('PC citations requires a normal macOS or Linux user.')
    if _POISONED or not _ACTIVE.acquire(blocking=False):
        raise CitationsError('PC citations is busy or requires a restart after cleanup failure.')
    temporary, process = None, None
    try:
        sources = _sources()
        temporary = tempfile.mkdtemp(prefix='rock-pc-citations-')
        directory = Path(temporary)
        (directory / 'vendor/mr').mkdir(parents=True, mode=0o700)
        for name, data in sources.items():
            _write_new(directory / name, data, 0o400)
        _write_new(directory / 'input.md', raw, 0o600)
        started = time.monotonic()
        # Popen may have created a child before it returns. Defer parent
        # interruption until its handle is owned, then unwind through cleanup.
        spawn_mask = signal.pthread_sigmask(signal.SIG_BLOCK, {signal.SIGINT, signal.SIGTERM})
        try:
            process = _spawn(directory)
        finally:
            signal.pthread_sigmask(signal.SIG_SETMASK, spawn_mask)
        return _collect(process, started + WALL_SECONDS)
    except CitationsError:
        raise
    except (OSError, subprocess.SubprocessError):
        raise CitationsError('PC citations could not complete the fixed process.') from None
    finally:
        # SIGKILL/host power loss cannot run Python cleanup. Normal exceptions,
        # Ctrl+C and a caller's graceful TERM all come through this path.
        prior_mask = signal.pthread_sigmask(signal.SIG_BLOCK, {signal.SIGINT, signal.SIGTERM})
        try:
            cleanup_failed = False
            try:
                if process is not None:
                    _cleanup_process(process)
            except BaseException:
                cleanup_failed = True
            try:
                if temporary is not None:
                    shutil.rmtree(temporary)
            except BaseException:
                cleanup_failed = True
            if cleanup_failed:
                _POISONED = True
                raise CitationsError('PC citations cleanup failed; restart the connection app.') from None
            _ACTIVE.release()
        finally:
            signal.pthread_sigmask(signal.SIG_SETMASK, prior_mask)

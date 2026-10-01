"""Owned purchaser backend lifecycle; device shutdown does not stop billing.

Only the private, versioned public-fixture profile can start this service. An
unrelated listener/process is preserved. Stop targets an authenticated owned PID.
"""
import fcntl
import hashlib
import os
from pathlib import Path
import signal
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(ROOT / 'src'), str(ROOT / 'os')]
from service_access import serve
from service_access.os_client import protected_read, write_marker, private_directory, require
from services import supervisor_exited, stop_supervisor

PROGRAM = str(ROOT / 'os/service_access/serve.py')
OWNED_CHILDREN = {}


def identity(pid, config_path):
    if type(pid) is not int or pid <= 1:
        return None
    try:
        proc = Path('/proc') / str(pid)
        require(proc.stat().st_uid == os.geteuid(), 'different process owner')
        command = (proc / 'cmdline').read_bytes().rstrip(b'\0').decode().split('\0')
        require(PROGRAM in command and 'run' in command and str(config_path) in command, 'different program')
        require(os.getpgid(pid) == pid and os.getsid(pid) == pid, 'different process session')
        return {'command': command, 'start_ticks': (proc / 'stat').read_text().rsplit(')', 1)[1].split()[19]}
    except (OSError, ValueError, IndexError, UnicodeError):
        return None


def descriptor(service):
    require(isinstance(service, dict) and set(service) == {'config', 'sha256', 'authority_id'},
            'closed service profile required')
    path = Path(service['config'])
    require(path.is_absolute() and path.resolve() == path, 'absolute fixed configuration required')
    config = serve.load(path, service['sha256'], service['authority_id'])
    root = Path(config['state']) / 'supervisor'
    private_directory(root)
    return path, config, root


def existing(root, config_path, authority_id):
    try:
        record = protected_read(root / 'process.json', private=True)
    except FileNotFoundError:
        return None
    actual = identity(record.get('pid'), config_path)
    if actual is None or actual != record.get('identity'):
        child = OWNED_CHILDREN.get(record.get('pid'))
        if child is not None and child.poll() is not None:
            child.wait(timeout=2)
            del OWNED_CHILDREN[record['pid']]
        return None
    require(record.get('authority_id') == authority_id, 'owned backend belongs to another authority')
    ready = protected_read(root / 'ready.json', private=True)
    require(ready.get('pid') == record['pid'] and ready.get('authority_id') == authority_id and
            ready.get('status') == 'READY', 'owned backend is not ready; preserve its state')
    return ready


def ensure(service, timeout=45):
    require(sys.platform == 'linux', 'backend runs inside the dedicated Linux VM')
    config_path, config, root = descriptor(service)
    fd = os.open(root / 'launch.lock', os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    try:
        fcntl.flock(fd, fcntl.LOCK_EX)
        previous = existing(root, config_path, config['authority_id'])
        if previous is not None:
            return {**previous, 'reused': True}
        logfd = os.open(root / 'backend.log', os.O_CREAT | os.O_WRONLY | os.O_APPEND | os.O_NOFOLLOW, 0o600)
        try:
            child = subprocess.Popen([sys.executable, '-B', PROGRAM, 'run', '--config', str(config_path),
                                      '--ready', str(root / 'ready.json')], stdin=subprocess.DEVNULL,
                                     stdout=logfd, stderr=subprocess.STDOUT, close_fds=True, start_new_session=True)
        finally:
            os.close(logfd)
        try:
            deadline = time.monotonic() + timeout
            while True:
                require(not supervisor_exited(child), 'purchaser backend could not start; existing listeners preserved')
                try:
                    ready = protected_read(root / 'ready.json', private=True)
                except FileNotFoundError:
                    ready = {}
                if ready.get('status') == 'READY' and ready.get('pid') == child.pid:
                    require(ready.get('authority_id') == config['authority_id'], 'different backend authority')
                    actual = identity(child.pid, config_path)
                    require(actual is not None, 'owned backend identity missing')
                    write_marker(root / 'process.json', {'pid': child.pid, 'identity': actual,
                                                        'authority_id': config['authority_id']})
                    # Popen must not reap/terminate the successful independent
                    # session on this short-lived caller's return.
                    OWNED_CHILDREN[child.pid] = child
                    return {**ready, 'reused': False}
                require(time.monotonic() < deadline, 'purchaser backend readiness timed out')
                time.sleep(.1)
        except BaseException:
            stop_supervisor(child)
            raise
    finally:
        os.close(fd)


def stop(service, timeout=10):
    """Explicit developer shutdown; not called by virtual OS poweroff."""
    config_path, config, root = descriptor(service)
    fd = os.open(root / 'launch.lock', os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    try:
        fcntl.flock(fd, fcntl.LOCK_EX)
        ready = existing(root, config_path, config['authority_id'])
        if ready is None:
            return {'status': 'STOPPED', 'already_stopped': True}
        record = protected_read(root / 'process.json', private=True)
        # pidfd prevents a recycled PID from being signalled between identity
        # validation and delivery. Never send a signal to an unverified group.
        pidfd = os.pidfd_open(record['pid'])
        try:
            require(identity(record['pid'], config_path) == record['identity'], 'backend process changed')
            signal.pidfd_send_signal(pidfd, signal.SIGTERM)
        finally:
            os.close(pidfd)
        deadline = time.monotonic() + timeout
        while identity(record['pid'], config_path) == record['identity']:
            require(time.monotonic() < deadline, 'backend did not stop normally; state preserved')
            time.sleep(.1)
        final = protected_read(root / 'ready.json', private=True)
        require(final.get('pid') == record['pid'] and final.get('status') == 'STOPPED',
                'backend normal shutdown not confirmed')
        child = OWNED_CHILDREN.get(record['pid'])
        if child is not None:
            child.wait(timeout=2)
            del OWNED_CHILDREN[record['pid']]
        return final
    finally:
        os.close(fd)

"""Root boot check of the native UI's first present and responsive event loop.

The challenge is served by rock-ui's main loop, not by a separate health thread.
This is a pre-commit software readiness check, not proof of physical scanout,
continuous post-commit supervision, or protection from a compromised kernel.
"""
from contextlib import ExitStack
import array
from dataclasses import dataclass
import json
import os
from pathlib import Path
import re
import secrets
import select
import socket
import stat
import struct
import sys
import time

MAX_PACKET = 256
TOTAL_SECONDS = 2.0
PREFIX = b'ROCK_UI_HEALTH/1 '
REPLY = re.compile(rb'ROCK_UI_READY/1 ([0-9a-f]{64}) ([1-9][0-9]{0,9}) '
                   rb'([1-9][0-9]{0,19}) ([1-9][0-9]{0,19}) '
                   rb'([1-9][0-9]{0,3}) ([1-9][0-9]{0,3}) ([1-9][0-9]?)\n')


@dataclass(frozen=True)
class Paths:
    pid: Path = Path('/run/rock-ui.pid')
    endpoint: Path = Path('/run/rock-ui-health/ready.sock')
    executable: Path = Path('/usr/bin/rock-ui')
    proc: Path = Path('/proc')


def require(value, message):
    if not value:
        raise ValueError(message)


def mode_from_cmdline(raw):
    require(type(raw) is bytes and len(raw) <= 16384 and b'\0' not in raw,
            'UI_BOOT_ARGUMENTS_INVALID')
    words = raw.decode('ascii', 'strict').split()
    selected = [word for word in words if word == 'rock.ui' or word.startswith('rock.ui=')]
    require(len(selected) <= 1 and (not selected or selected[0] in
            ('rock.ui=required', 'rock.ui=headless')), 'UI_BOOT_MODE_INVALID')
    # Absence never silently converts a failed display into a headless boot.
    return 'headless' if selected == ['rock.ui=headless'] else 'required'


def file_identity(info):
    return (info.st_dev, info.st_ino, info.st_size, info.st_mtime_ns, info.st_ctime_ns)


def protected_parent(path, owner, *, exact_mode=None):
    info = path.lstat()
    require(stat.S_ISDIR(info.st_mode) and info.st_uid == owner and not info.st_mode & 0o022,
            'UI_PROTECTED_DIRECTORY_REQUIRED')
    if exact_mode is not None:
        require(stat.S_IMODE(info.st_mode) == exact_mode, 'UI_DIRECTORY_MODE_INVALID')


def read_pid(path, root_uid):
    protected_parent(path.parent, root_uid)
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK | os.O_CLOEXEC)
    with os.fdopen(fd, 'rb') as stream:
        before = os.fstat(stream.fileno())
        require(stat.S_ISREG(before.st_mode) and before.st_nlink == 1 and
                before.st_uid == root_uid and not before.st_mode & 0o022 and
                1 <= before.st_size <= 32, 'UI_PID_FILE_INVALID')
        raw = stream.read(33)
        require(file_identity(before) == file_identity(os.fstat(stream.fileno())),
                'UI_PID_FILE_CHANGED')
    require(re.fullmatch(rb'[1-9][0-9]{0,9}\n?', raw) is not None, 'UI_PID_INVALID')
    pid = int(raw)
    require(1 < pid <= 2147483647, 'UI_PID_INVALID')
    return pid, file_identity(before)


def process_birth(proc_fd, pid):
    fd = os.open('stat', os.O_RDONLY | os.O_CLOEXEC | os.O_NOFOLLOW, dir_fd=proc_fd)
    with os.fdopen(fd, 'rb') as stream:
        raw = stream.read(4097)
    require(0 < len(raw) <= 4096 and raw.startswith(str(pid).encode() + b' ('),
            'UI_PROCESS_STAT_INVALID')
    end = raw.rfind(b') ')
    require(end >= 0, 'UI_PROCESS_STAT_INVALID')
    fields = raw[end + 2:].split()
    require(len(fields) >= 20 and fields[0] in (b'R', b'S', b'D', b'I', b'T', b't', b'W')
            and fields[19].isdigit(), 'UI_PROCESS_NOT_LIVE')
    return int(fields[19])


def process_executable(proc_fd, expected):
    # /proc/<pinned directory>/exe is intentionally followed. Ordinary input
    # paths are opened without following links. Compare the actual inode.
    fd = os.open('exe', os.O_RDONLY | os.O_CLOEXEC, dir_fd=proc_fd)
    try:
        require(file_identity(os.fstat(fd)) == expected, 'UI_EXECUTABLE_MISMATCH')
    finally:
        os.close(fd)


def endpoint_identity(paths, peer_uid, root_uid):
    protected_parent(paths.endpoint.parent.parent, root_uid)
    protected_parent(paths.endpoint.parent, peer_uid, exact_mode=0o700)
    info = paths.endpoint.lstat()
    require(stat.S_ISSOCK(info.st_mode) and info.st_nlink == 1 and info.st_uid == peer_uid
            and stat.S_IMODE(info.st_mode) == 0o600, 'UI_SOCKET_INVALID')
    return file_identity(info)


def parse_response(raw, nonce, pid):
    require(type(raw) is bytes and len(raw) <= MAX_PACKET and
            type(nonce) is str and re.fullmatch('[0-9a-f]{64}', nonce), 'UI_RESPONSE_INVALID')
    match = REPLY.fullmatch(raw)
    require(match is not None and match[1].decode() == nonce and int(match[2]) == pid,
            'UI_CHALLENGE_MISMATCH')
    frames, loops, width, height, inputs = (int(match[i]) for i in range(3, 8))
    require(frames <= 2**64 - 1 and loops <= 2**64 - 1 and
            320 <= width <= 4096 and 320 <= height <= 4096 and 1 <= inputs <= 24,
            'UI_FRAME_OR_INPUT_NOT_READY')
    return {'frames': frames, 'loops': loops, 'width': width, 'height': height, 'inputs': inputs}


def close_ancillary(ancillary):
    # A malformed peer must not leak received SCM_RIGHTS descriptors locally.
    for level, kind, raw in ancillary:
        if level == socket.SOL_SOCKET and kind == socket.SCM_RIGHTS:
            descriptors = array.array('i')
            descriptors.frombytes(raw[:len(raw) - len(raw) % descriptors.itemsize])
            for fd in descriptors:
                os.close(fd)


def remaining(deadline):
    duration = deadline - time.monotonic()
    require(duration > 0, 'UI_HEALTH_DEADLINE')
    return duration


def check(paths=Paths(), *, root_uid=0, peer_uid=1000, peer_gid=1000):
    """Parameters support isolated tests; the installed CLI has no overrides."""
    require(sys.platform == 'linux' and os.geteuid() == root_uid and hasattr(os, 'pidfd_open'),
            'ROOT_LINUX_UI_CHECK_REQUIRED')
    deadline = time.monotonic() + TOTAL_SECONDS
    pid, pid_record = read_pid(paths.pid, root_uid)
    protected_parent(paths.executable.parent, 0)
    with ExitStack() as stack:
        executable = os.open(paths.executable, os.O_RDONLY | os.O_CLOEXEC | os.O_NOFOLLOW)
        stack.callback(os.close, executable)
        info = os.fstat(executable)
        require(stat.S_ISREG(info.st_mode) and info.st_nlink == 1 and info.st_uid == 0
                and not info.st_mode & 0o022 and info.st_mode & 0o111, 'UI_EXECUTABLE_NOT_PROTECTED')
        expected_executable = file_identity(info)
        pidfd = os.pidfd_open(pid, 0)
        stack.callback(os.close, pidfd)
        proc_fd = os.open(paths.proc / str(pid), os.O_RDONLY | os.O_DIRECTORY | os.O_CLOEXEC | os.O_NOFOLLOW)
        stack.callback(os.close, proc_fd)
        require(os.fstat(proc_fd).st_uid == peer_uid, 'UI_PROCESS_OWNER_MISMATCH')
        birth = process_birth(proc_fd, pid)
        endpoint = endpoint_identity(paths, peer_uid, root_uid)

        def unchanged():
            require(not select.select([pidfd], [], [], 0)[0], 'UI_PROCESS_EXITED')
            require(process_birth(proc_fd, pid) == birth, 'UI_PROCESS_REPLACED')
            process_executable(proc_fd, expected_executable)
            require(read_pid(paths.pid, root_uid) == (pid, pid_record), 'UI_PID_FILE_CHANGED')
            require(endpoint_identity(paths, peer_uid, root_uid) == endpoint, 'UI_SOCKET_REPLACED')
            require(file_identity(paths.executable.lstat()) == expected_executable,
                    'UI_EXECUTABLE_REPLACED')
            remaining(deadline)

        samples = []
        for _ in range(2):
            unchanged()
            nonce = secrets.token_hex(32)
            with socket.socket(socket.AF_UNIX, socket.SOCK_SEQPACKET | socket.SOCK_CLOEXEC) as client:
                client.settimeout(remaining(deadline))
                client.connect(str(paths.endpoint))
                peer = struct.unpack('3i', client.getsockopt(socket.SOL_SOCKET, socket.SO_PEERCRED, 12))
                require(peer == (pid, peer_uid, peer_gid), 'UI_PEER_MISMATCH')
                wire = PREFIX + nonce.encode() + b'\n'
                client.settimeout(remaining(deadline))
                require(client.send(wire) == len(wire), 'UI_CHALLENGE_TRUNCATED')
                client.settimeout(remaining(deadline))
                raw, ancillary, flags, _ = client.recvmsg(MAX_PACKET + 1, socket.CMSG_SPACE(16 * 4),
                                                         getattr(socket, 'MSG_CMSG_CLOEXEC', 0))
                close_ancillary(ancillary)
                require(not ancillary and not flags & (socket.MSG_TRUNC | socket.MSG_CTRUNC),
                        'UI_RESPONSE_FRAMING_INVALID')
                sample = parse_response(raw, nonce, pid)
                client.settimeout(remaining(deadline))
                # One response packet then EOF. Extra queued packets or a peer
                # that keeps the connection open are not successful health.
                extra, extra_ancillary, extra_flags, _ = client.recvmsg(
                    MAX_PACKET + 1, socket.CMSG_SPACE(16 * 4), getattr(socket, 'MSG_CMSG_CLOEXEC', 0))
                close_ancillary(extra_ancillary)
                require(not extra and not extra_ancillary and not extra_flags &
                        (socket.MSG_TRUNC | socket.MSG_CTRUNC), 'UI_EXTRA_RESPONSE')
                unchanged()
                samples.append(sample)
        first, second = samples
        require(second['loops'] > first['loops'] and second['frames'] >= first['frames'] and
                all(first[k] == second[k] for k in ('width', 'height', 'inputs')), 'UI_EVENT_LOOP_NOT_ADVANCING')
        return {'schema': 'rock-native-ui-health/1', 'status': 'READY', 'native_ui_checked': True,
                'pid': pid, 'process_start_ticks': birth, 'samples': samples,
                'scope': 'Two fresh main-loop responses after framebuffer memory presentation; no physical scanout or post-commit monitoring claim.'}


def main():
    require(len(sys.argv) == 1 and os.geteuid() == 0, 'ROOT_FIXED_UI_HEALTH_ENTRY_REQUIRED')
    with Path('/proc/cmdline').open('rb') as stream:
        mode = mode_from_cmdline(stream.read(16385))
    if mode == 'headless':
        print('ROCK_UI_HEALTH_HEADLESS ' + json.dumps({'schema': 'rock-native-ui-health/1',
              'mode': 'explicit-development-headless', 'native_ui_checked': False}), flush=True)
    else:
        result = check()
        print('ROCK_UI_HEALTH_READY ' + json.dumps(result, separators=(',', ':')), flush=True)


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, RuntimeError) as error:
        print('ROCK_UI_HEALTH_REJECTED ' + type(error).__name__ + ': ' + str(error), file=sys.stderr, flush=True)
        raise SystemExit(1)

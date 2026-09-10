#!/usr/bin/python3
"""Fixed, root-owned normal-init power actions over authenticated local IPC."""
from __future__ import annotations

import argparse
from contextlib import closing
import errno
import fcntl
import json
import os
from pathlib import Path
import re
import signal
import socket
import sqlite3
import stat
import struct
import subprocess
import threading
import time
import uuid

SOCKET = '/run/rock-system/power.sock'
STATE = '/data/system'
ALLOWED_UIDS = frozenset((0, 1002))
SOCKET_GROUP = 1002
MAX_FRAME = 1024
MAX_RECEIPTS = 10000
FRAME_SECONDS = 2
ACTION_PATHS = {'poweroff': '/sbin/poweroff', 'reboot': '/sbin/reboot'}


class Rejected(ValueError):
    pass


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False, allow_nan=False).encode()


def validate(request):
    if (type(request) is not dict or set(request) != {'v', 'op', 'key'} or
            type(request['v']) is not int or request['v'] != 1 or
            type(request['op']) is not str or request['op'] not in ACTION_PATHS or
            type(request['key']) is not str or re.fullmatch(r'[A-Za-z0-9_-]{1,128}', request['key']) is None):
        raise Rejected('expected only v=1, op=poweroff|reboot and an ASCII request key of 1..128 characters')
    return request


def read_frame(connection):
    deadline, data = time.monotonic() + FRAME_SECONDS, bytearray()
    while True:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise Rejected('request deadline exceeded')
        connection.settimeout(remaining)
        block = connection.recv(min(256, MAX_FRAME + 1 - len(data)))
        if not block:
            raise Rejected('request needs one newline-terminated JSON frame')
        data.extend(block)
        if len(data) > MAX_FRAME:
            raise Rejected('request exceeds 1024 bytes including newline')
        if b'\n' in data:
            raw, trailing = data.split(b'\n', 1)
            if trailing:
                raise Rejected('only one request per connection is allowed')
            def unique(pairs):
                result = {}
                for key, value in pairs:
                    if key in result:
                        raise Rejected('duplicate JSON field')
                    result[key] = value
                return result
            def invalid_constant(_):
                raise Rejected('non-finite JSON value')
            try:
                return validate(json.loads(raw.decode('utf-8'), object_pairs_hook=unique, parse_constant=invalid_constant))
            except (UnicodeError, json.JSONDecodeError, RecursionError) as error:
                raise Rejected('invalid request JSON') from error
        if len(data) == MAX_FRAME:
            raise Rejected('request exceeds 1024 bytes including newline')


def root_directory(path):
    path = Path(path)
    path.mkdir(mode=0o700, exist_ok=True)
    info = path.lstat()
    if (not stat.S_ISDIR(info.st_mode) or info.st_uid != 0 or info.st_gid != 0 or
            stat.S_IMODE(info.st_mode) != 0o700):
        raise PermissionError('state directory must be a real root:root directory with mode 0700')
    return path


def sync_directory(path):
    descriptor = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def normal_init_action(operation):
    # No shell, caller-supplied arguments, forced reboot, or path lookup.
    result = subprocess.run([ACTION_PATHS[operation]], stdin=subprocess.DEVNULL,
                            stdout=subprocess.DEVNULL, stderr=subprocess.PIPE,
                            timeout=10, check=False, env={'PATH': '/usr/sbin:/usr/bin:/sbin:/bin'})
    return result.returncode


class PowerService:
    """One pending action, one fixed worker, durable receipts and at-most-once dispatch.

    executor/boot_id/delay are Python-only seams for isolated tests. The daemon
    CLI cannot replace its executor or its kernel boot identity.
    """
    def __init__(self, directory, *, executor=normal_init_action, boot_id=None, delay=0.75):
        if os.getuid() != 0 or os.geteuid() != 0:
            raise PermissionError('power service must run as root')
        if not 0 <= delay <= 5:
            raise ValueError('invalid bounded reply delay')
        self.directory = root_directory(directory)
        self.boot_id = str(uuid.UUID(Path('/proc/sys/kernel/random/boot_id').read_text().strip() if boot_id is None else boot_id))
        self.instance = uuid.uuid4().hex
        self.executor, self.delay = executor, delay
        self.lock_fd = os.open(self.directory / 'service.lock', os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
        try:
            self._check_file(self.lock_fd)
            fcntl.flock(self.lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BaseException:
            os.close(self.lock_fd)
            raise
        self.database = self.directory / 'power.db'
        try:
            descriptor = os.open(self.database, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
            try:
                self._check_file(descriptor)
            finally:
                os.close(descriptor)
        except BaseException:
            os.close(self.lock_fd)
            raise
        self.condition = threading.Condition(threading.RLock())
        self.closing, self.scheduled, self.fatal_error = False, None, None
        with closing(self.connect()) as db, db:
            db.executescript('''
                CREATE TABLE IF NOT EXISTS requests (
                    key TEXT PRIMARY KEY, operation TEXT NOT NULL, boot_id TEXT NOT NULL,
                    instance TEXT NOT NULL, request_json TEXT NOT NULL, receipt_json TEXT NOT NULL,
                    status TEXT NOT NULL CHECK(status IN ('pending','ready','dispatched','failed','abandoned','rejected')),
                    created_unix REAL NOT NULL, replied_unix REAL, dispatched_unix REAL,
                    command_returncode INTEGER, command_error TEXT);
                CREATE TRIGGER IF NOT EXISTS immutable_power_receipt BEFORE UPDATE OF
                    key,operation,boot_id,instance,request_json,receipt_json,created_unix ON requests
                    BEGIN SELECT RAISE(ABORT,'power receipt is immutable'); END;
                CREATE TRIGGER IF NOT EXISTS retained_power_receipt BEFORE DELETE ON requests
                    BEGIN SELECT RAISE(ABORT,'power receipts are retained'); END;
            ''')
            # Never resume an unexecuted request after a daemon or OS restart.
            db.execute("UPDATE requests SET status='abandoned',command_error='service restarted before dispatch; never replayed' WHERE status IN ('pending','ready')")
        sync_directory(self.directory)
        self.worker = threading.Thread(target=self._work, name='rock-power-action', daemon=True)
        self.worker.start()

    @staticmethod
    def _check_file(descriptor):
        info = os.fstat(descriptor)
        if (not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or info.st_gid != 0 or
                stat.S_IMODE(info.st_mode) != 0o600 or info.st_nlink != 1):
            raise PermissionError('power state files must be root:root, regular, unlinked elsewhere and mode 0600')

    def connect(self):
        db = sqlite3.connect(self.database, timeout=2)
        try:
            db.row_factory = sqlite3.Row
            if db.execute('PRAGMA journal_mode=DELETE').fetchone()[0] != 'delete':
                raise sqlite3.OperationalError('power state requires DELETE journal mode')
            # EXTRA syncs the parent after DELETE-journal removal, preserving
            # the last durable claim when shutdown immediately follows commit.
            db.execute('PRAGMA synchronous=EXTRA')
            if db.execute('PRAGMA synchronous').fetchone()[0] != 3:
                raise sqlite3.OperationalError('power state requires EXTRA synchronization')
            return db
        except BaseException:
            db.close()
            raise

    def accept(self, request, *, peer_uid):
        if type(peer_uid) is not int or peer_uid not in ALLOWED_UIDS:
            raise PermissionError('authenticated local identity is not authorized for OS power actions')
        validate(request)
        encoded = canonical(request).decode()
        with self.condition, closing(self.connect()) as db, db:
            if self.closing:
                raise Rejected('power service is stopping')
            db.execute('BEGIN IMMEDIATE')
            old = db.execute('SELECT request_json,receipt_json FROM requests WHERE key=?', (request['key'],)).fetchone()
            if old:
                if old['request_json'] != encoded:
                    raise Rejected('request key was already used for a different action')
                return json.loads(old['receipt_json'])
            if db.execute('SELECT COUNT(*) FROM requests').fetchone()[0] >= MAX_RECEIPTS:
                raise Rejected('power receipt storage capacity reached')
            active = db.execute("SELECT key FROM requests WHERE boot_id=? AND status IN ('pending','ready','dispatched')", (self.boot_id,)).fetchone()
            response = ({'ok': False, 'code': 'busy', 'error': 'another power action is already accepted for this boot'} if active else
                        {'ok': True, 'result': {'accepted': True, 'key': request['key'], 'op': request['op'], 'boot_id': self.boot_id,
                                                'meaning': 'accepted; execution and OS completion are not confirmed by this receipt'}})
            db.execute('INSERT INTO requests VALUES (?,?,?,?,?,?,?,?,NULL,NULL,NULL,NULL)',
                       (request['key'], request['op'], self.boot_id, self.instance, encoded, canonical(response).decode(),
                        'rejected' if active else 'pending', time.time()))
            return response

    def after_reply(self, request):
        """Called only after a successful sendall; retries cannot move the deadline."""
        with self.condition, closing(self.connect()) as db, db:
            if self.closing:
                return
            row = db.execute('SELECT * FROM requests WHERE key=?', (request['key'],)).fetchone()
            if not row or row['status'] != 'pending' or row['boot_id'] != self.boot_id or row['instance'] != self.instance:
                return
            db.execute("UPDATE requests SET status='ready',replied_unix=? WHERE key=? AND status='pending'", (time.time(), request['key']))
            db.commit()
            self.scheduled = (request['key'], time.monotonic() + self.delay)
            self.condition.notify_all()

    def _work(self):
        try:
            self._work_loop()
        except Exception as error:
            self.fail(error)

    def fail(self, error):
        with self.condition:
            self.fatal_error = (type(error).__name__ + ': ' + str(error))[:256]
            self.closing = True
            self.condition.notify_all()

    def _work_loop(self):
        while True:
            with self.condition:
                while not self.closing and self.scheduled is None:
                    self.condition.wait()
                if self.closing:
                    return
                key, due = self.scheduled
                remaining = due - time.monotonic()
                if remaining > 0:
                    self.condition.wait(remaining)
                    continue
                with closing(self.connect()) as db, db:
                    row = db.execute('SELECT * FROM requests WHERE key=?', (key,)).fetchone()
                    if not row or row['status'] != 'ready' or row['instance'] != self.instance or row['boot_id'] != self.boot_id:
                        self.scheduled = None
                        continue
                    db.execute("UPDATE requests SET status='dispatched',dispatched_unix=? WHERE key=?", (time.time(), key))
                # EXTRA-synchronous commit precedes the only possible callback.
                self.scheduled = None
                operation = row['operation']
            code, error = None, None
            try:
                code = self.executor(operation)
                if type(code) is not int or code != 0:
                    error = 'normal init command failed: returncode=' + str(code)
            except Exception as exc:
                error = (type(exc).__name__ + ': ' + str(exc))[:256]
            with self.condition, closing(self.connect()) as db, db:
                db.execute('UPDATE requests SET status=?,command_returncode=?,command_error=? WHERE key=?',
                           ('failed' if error else 'dispatched', code if type(code) is int else None, error, key))

    def close(self):
        with self.condition:
            self.closing = True
            self.condition.notify_all()
        self.worker.join(timeout=12)
        if self.worker.is_alive():
            raise RuntimeError('power worker did not stop; retain instance lock')
        os.close(self.lock_fd)


class Server:
    """Sequential bounded frame handling; one client plus one power worker."""
    def __init__(self, path, service):
        if os.getuid() != 0 or os.geteuid() != 0:
            raise PermissionError('power socket must be owned by root')
        self.path, self.service = Path(path), service
        self.path.parent.mkdir(mode=0o750, exist_ok=True)
        info = self.path.parent.lstat()
        if not stat.S_ISDIR(info.st_mode) or info.st_uid != 0:
            raise PermissionError('power socket parent must be a real root-owned directory')
        os.chown(self.path.parent, 0, SOCKET_GROUP)
        os.chmod(self.path.parent, 0o750)
        if os.path.lexists(self.path):
            info = self.path.lstat()
            if not stat.S_ISSOCK(info.st_mode) or info.st_uid != 0:
                raise PermissionError('refusing to replace a non-root or non-socket path')
            with socket.socket(socket.AF_UNIX) as probe:
                probe.settimeout(0.2)
                try:
                    probe.connect(str(self.path))
                except OSError as error:
                    if error.errno != errno.ECONNREFUSED:
                        raise
                else:
                    raise RuntimeError('power socket is already in use')
            self.path.unlink()
        self.socket = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.socket.bind(str(self.path))
        os.chown(self.path, 0, SOCKET_GROUP)
        os.chmod(self.path, 0o660)
        self.socket.listen(8)
        self.socket.settimeout(0.25)
        self.stopping = False

    def handle(self, connection):
        request = None
        try:
            _, uid, _ = struct.unpack('3i', connection.getsockopt(socket.SOL_SOCKET, socket.SO_PEERCRED, struct.calcsize('3i')))
            if uid not in ALLOWED_UIDS:
                raise PermissionError('authenticated local identity is not authorized for OS power actions')
            request = read_frame(connection)
            response = self.service.accept(request, peer_uid=uid)
        except PermissionError as error:
            response = {'ok': False, 'code': 'unauthorized', 'error': str(error)}
        except (ValueError, TimeoutError) as error:
            response = {'ok': False, 'code': 'rejected', 'error': str(error)[:256]}
        except (OSError, sqlite3.Error):
            response = {'ok': False, 'code': 'unavailable', 'error': 'power service storage unavailable; retry the same key'}
        try:
            connection.settimeout(1)
            connection.sendall(canonical(response) + b'\n')
        except OSError:
            return
        if request is not None and response.get('ok') is True:
            try:
                self.service.after_reply(request)
            except (OSError, sqlite3.Error) as error:
                self.service.fail(error)

    def serve_forever(self):
        while not self.stopping:
            if self.service.fatal_error is not None:
                raise RuntimeError('power storage worker failed: ' + self.service.fatal_error)
            try:
                connection, _ = self.socket.accept()
            except socket.timeout:
                continue
            with connection:
                self.handle(connection)

    def close(self):
        self.stopping = True
        self.socket.close()
        try:
            self.path.unlink()
        except FileNotFoundError:
            pass


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--socket', default=SOCKET)
    parser.add_argument('--state-dir', default=STATE)
    args = parser.parse_args()
    os.umask(0o077)
    service = PowerService(args.state_dir)
    server = None
    try:
        server = Server(args.socket, service)
        def stop(_signal, _frame):
            server.stopping = True
        signal.signal(signal.SIGTERM, stop)
        signal.signal(signal.SIGINT, stop)
        print('ROCK_SYSTEM_POWER_READY', flush=True)
        server.serve_forever()
    finally:
        if server:
            server.close()
        service.close()


if __name__ == '__main__':
    main()

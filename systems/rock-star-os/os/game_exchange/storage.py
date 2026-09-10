"""Private process-owned durable synthetic connection authority, no restore API."""
from contextlib import contextmanager
import fcntl
import os
from pathlib import Path
import sqlite3
import stat
import threading
import uuid
from . import protocol as p
from blackberryrock import deadline as request_deadline


class PrivateStore:
    def __init__(self,path,configuration):
        self.path=Path(path);p.require(self.path.is_absolute() and self.path==self.path.resolve(),'canonical absolute game state required')
        self._parents()
        self.path.mkdir(mode=0o700,exist_ok=True)
        self._mutex=threading.RLock();self._lock=None;self.db=None
        try:
            info=self.path.lstat();p.require(stat.S_ISDIR(info.st_mode) and info.st_uid==os.geteuid() and stat.S_IMODE(info.st_mode)==0o700,'private owned game directory')
            self._dir_identity=(info.st_dev,info.st_ino)
            self._lock=self._open('game.lock');fcntl.flock(self._lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
            fd=self._open('game.sqlite3');info=os.fstat(fd);self._db_identity=(info.st_dev,info.st_ino);os.close(fd)
            self.db=sqlite3.connect(self.path/'game.sqlite3',isolation_level=None,check_same_thread=False,timeout=1)
            self.db.row_factory=sqlite3.Row
            self.db.execute('PRAGMA synchronous=EXTRA');self.db.execute('PRAGMA journal_mode=DELETE')
            with self.transaction() as db:
                tables={row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
                p.require(not tables or 'identity' in tables,'unmarked game database cannot be adopted')
                db.execute('CREATE TABLE IF NOT EXISTS identity (singleton INTEGER PRIMARY KEY CHECK(singleton=1), uuid TEXT NOT NULL, path TEXT NOT NULL, configuration TEXT NOT NULL, maximum_time INTEGER NOT NULL)')
                row=db.execute('SELECT * FROM identity').fetchone();encoded=p.canonical(configuration).decode()
                if row:p.require(row['path']==str(self.path) and row['configuration']==encoded,'game authority identity/configuration changed; no import or restore supported')
                else:db.execute('INSERT INTO identity VALUES (1,?,?,?,0)',(str(uuid.uuid4()),str(self.path),encoded))
                row=db.execute('SELECT uuid,maximum_time FROM identity').fetchone()
                self.uuid=p.uuid_value(row[0]);p.integer(row[1])
        except BaseException:self.close();raise
    def _parents(self):
        for parent in self.path.parents:
            info=parent.lstat()
            p.require(stat.S_ISDIR(info.st_mode) and info.st_uid in (0,os.geteuid()) and
                (not info.st_mode & 0o022 or (info.st_uid==0 and info.st_mode & stat.S_ISVTX)),
                'game authority requires protected canonical ancestors')
    def _open(self,name):
        fd=os.open(self.path/name,os.O_CREAT|os.O_RDWR|os.O_NOFOLLOW|os.O_NONBLOCK,0o600)
        try:self._file(os.fstat(fd));return fd
        except BaseException:os.close(fd);raise
    @staticmethod
    def _file(info):
        p.require(stat.S_ISREG(info.st_mode) and info.st_uid==os.geteuid() and stat.S_IMODE(info.st_mode)==0o600 and info.st_nlink==1,'private owned single-link game file required')
    def check(self):
        p.require(self.db is not None,'game authority closed')
        self._parents()
        info=self.path.lstat();p.require((info.st_dev,info.st_ino)==self._dir_identity and stat.S_IMODE(info.st_mode)==0o700 and info.st_uid==os.geteuid(),'game directory changed')
        for name in ('game.lock','game.sqlite3','game.sqlite3-journal','game.sqlite3-wal','game.sqlite3-shm'):
            path=self.path/name
            if name in ('game.lock','game.sqlite3') or path.exists() or path.is_symlink():
                info=path.lstat();self._file(info)
                if name=='game.sqlite3':p.require((info.st_dev,info.st_ino)==self._db_identity,'game database replaced')
                if name=='game.lock':p.require((info.st_dev,info.st_ino)==(os.fstat(self._lock).st_dev,os.fstat(self._lock).st_ino),'game lock replaced')
    @contextmanager
    def transaction(self):
        with request_deadline.locked(self._mutex):
            self.check();request_deadline.database(self.db);self.db.execute('BEGIN IMMEDIATE')
            try:
                yield self.db;self.check();request_deadline.check();self.db.execute('COMMIT')
                directory=os.open(self.path,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
                try:os.fsync(directory)
                finally:os.close(directory)
            except BaseException:
                if self.db.in_transaction:self.db.execute('ROLLBACK')
                raise
            finally:
                self.db.set_progress_handler(None,0)
                self.db.execute('PRAGMA busy_timeout=1000')
    def observe_time(self,db,now):
        p.integer(now,1);old=db.execute('SELECT maximum_time FROM identity').fetchone()[0]
        p.require(now>=old,'game clock moved backwards');db.execute('UPDATE identity SET maximum_time=?',(now,))
    def close(self):
        with self._mutex:
            if self.db is not None:self.db.close();self.db=None
            if self._lock is not None:os.close(self._lock);self._lock=None

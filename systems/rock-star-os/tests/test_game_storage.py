"""Real private file/SQLite/flock refusal guards, no test-only admission bypass."""
from pathlib import Path
import os
import sqlite3
import sys
import tempfile
import unittest
ROOT=Path(__file__).resolve().parents[1]
sys.path[:0]=[str(ROOT/'src'),str(ROOT/'os')]
from game_exchange.storage import PrivateStore

class GameStorageGuards(unittest.TestCase):
    def test_unlink_of_either_required_owned_file_stops_old_writer(self):
        for name in ('game.lock','game.sqlite3'):
            with self.subTest(name=name),tempfile.TemporaryDirectory() as tmp:
                path=Path(tmp).resolve()/'index';store=PrivateStore(path,{'kind':'test'})
                try:
                    (path/name).unlink()
                    with self.assertRaises((ValueError,FileNotFoundError)):
                        with store.transaction():pass
                finally:store.close()
    def test_writable_parent_is_not_a_protected_authority_location(self):
        with tempfile.TemporaryDirectory() as tmp:
            parent=Path(tmp).resolve()/'unsafe';parent.mkdir();parent.chmod(0o777)
            try:
                with self.assertRaises(ValueError):PrivateStore(parent/'index',{'kind':'test'})
            finally:parent.chmod(0o700)
    def test_real_second_writer_and_replacement_database_are_refused(self):
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp).resolve()/'index';store=PrivateStore(path,{'kind':'test'})
            try:
                with self.assertRaises(OSError):PrivateStore(path,{'kind':'test'})
                original=path/'game.sqlite3';original.rename(path/'old.sqlite3');original.write_bytes(b'');original.chmod(0o600)
                with self.assertRaises(ValueError):
                    with store.transaction():pass
            finally:store.close()
    def test_unmarked_foreign_sqlite_is_not_adopted(self):
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp).resolve()/'index';path.mkdir(mode=0o700)
            db=sqlite3.connect(path/'game.sqlite3');db.execute('CREATE TABLE unrelated(value)');db.commit();db.close()
            (path/'game.sqlite3').chmod(0o600)
            with self.assertRaises(ValueError):PrivateStore(path,{'kind':'test'})
if __name__=='__main__':unittest.main()

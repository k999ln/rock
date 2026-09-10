"""Real incompatible-schema constructor failures must release their own flock.

Each probe uses a separate child so a regression cannot leak authority locks
into the test runner. The original exception stays alive during the lock probe;
garbage collection is not an acceptable constructor-cleanup mechanism.
"""
from pathlib import Path
import json
import subprocess
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
PROBE = r'''
from pathlib import Path
import fcntl, hashlib, json, os, sqlite3, sys, tempfile
root = Path(sys.argv[1])
sys.path[:0] = [str(root/'src'), str(root/'os')]
from game_exchange.connections import GameIndex
from game_exchange.fixture import PublicGameAuthority
case = sys.argv[2]
with tempfile.TemporaryDirectory(prefix='game-constructor-cleanup-') as tmp:
    base = Path(tmp).resolve()
    if case == 'index':
        authorities = tuple(PublicGameAuthority(base/('author-'+name), name) for name in ('a', 'b'))
        state = base/'index'
        opened = GameIndex(state, authorities)
        opened.close()
        db = sqlite3.connect(state/'game.sqlite3')
        db.execute('ALTER TABLE authors ADD COLUMN future_required_column TEXT')
        db.commit(); db.close()
        construct = lambda: GameIndex(state, authorities)
    else:
        authorities = ()
        state = base/'author'
        opened = PublicGameAuthority(state, 'a')
        opened.close()
        db = sqlite3.connect(state/'game.sqlite3')
        db.execute('DROP TABLE proofs')
        db.execute('CREATE INDEX proofs ON identity(uuid)')
        db.commit(); db.close()
        construct = lambda: PublicGameAuthority(state, 'a')
    before = hashlib.sha256((state/'game.sqlite3').read_bytes()).hexdigest()
    failure = None
    try:
        unexpected = construct()
    except sqlite3.OperationalError as error:
        failure = error
    else:
        unexpected.close()
        raise AssertionError('incompatible schema was not rejected')
    assert failure is not None
    assert hashlib.sha256((state/'game.sqlite3').read_bytes()).hexdigest() == before
    fd = os.open(state/'game.lock', os.O_RDWR | os.O_NOFOLLOW)
    try:
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    finally:
        os.close(fd)
        for authority in authorities:
            authority.close()
    print(json.dumps({'case': case, 'constructor': 'REJECTED', 'database': 'UNCHANGED',
                      'flock': 'REACQUIRED_WITH_EXCEPTION_STILL_ALIVE'}))
'''


class GameConstructorCleanup(unittest.TestCase):
    def check_case(self, case):
        result = subprocess.run([sys.executable, '-W', 'error', '-c', PROBE, str(ROOT), case],
                                capture_output=True, text=True, timeout=15)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(result.stderr, '')
        report = json.loads(result.stdout)
        self.assertEqual(report, {'case': case, 'constructor': 'REJECTED', 'database': 'UNCHANGED',
                                  'flock': 'REACQUIRED_WITH_EXCEPTION_STILL_ALIVE'})

    def test_index_incompatible_author_table_releases_constructor_resources(self):
        self.check_case('index')

    def test_public_authority_incompatible_proof_object_releases_constructor_resources(self):
        self.check_case('authority')


if __name__ == '__main__':
    unittest.main()

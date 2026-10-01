"""Real child process + real deferred SQLite COMMIT failure, no fake worker result."""
from contextlib import closing
import json
import os
from pathlib import Path
import select
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from unittest.mock import patch

from blackberryrock.hub import Hub
from blackberryrock.packages import PUBLIC_TEST_KEY, TEST_PUBLISHER

ROOT = Path(__file__).resolve().parents[1]


class RecipeHandshake:
    """Per-child pipe ownership; a past readiness file cannot look live."""
    def __init__(self):
        self.ready_read, self.ready_write = os.pipe()
        self.release_read, self.release_write = os.pipe()
        self.process = self.thread = None

    def close(self, name):
        descriptor = getattr(self, name)
        if descriptor is not None:
            os.close(descriptor)
            setattr(self, name, None)

    def touch(self):
        # Keep existing test call sites explicit: release never happens on an
        # elapsed timer. EOF also releases a child during failure cleanup.
        if self.release_write is not None:
            try:
                os.write(self.release_write, b'G')
            except BrokenPipeError:
                pass
            finally:
                self.close('release_write')

    def await_ready(self):
        if not select.select([self.ready_read], [], [], 2)[0] or os.read(self.ready_read, 1) != b'R':
            raise AssertionError('real child did not complete its private ready handshake')
        self.close('ready_read')
        if self.process is None or self.process.poll() is not None:
            raise AssertionError('real child exited before lifecycle admission; product timeout unchanged')


def wait_for(predicate, timeout=2):
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        value = predicate()
        if value:
            return value
        time.sleep(.005)
    raise AssertionError('owned test worker did not reach the expected state')


class HubLifecycleCommitTests(unittest.TestCase):
    def setUp(self):
        self.root = Path(tempfile.mkdtemp(prefix='rock-lifecycle-'))
        self.workers = []
        self.addCleanup(self.remove_data_after_workers)
        self.hub = Hub(self.root/'hub.db', {TEST_PUBLISHER:PUBLIC_TEST_KEY})
        self.v1 = json.loads((ROOT/'examples/registry/org.rockstar.text-tidy--1.0.0.rock.json').read_text())
        self.v2 = json.loads((ROOT/'examples/registry/org.rockstar.text-tidy--2.0.0.rock.json').read_text())
        installed = self.hub.install(self.v1)
        self.tool, self.sha = installed['id'], installed['hash']
        self.hub.enable(self.tool, self.sha)
        self.serial = 0

    def remove_data_after_workers(self):
        # If teardown cannot join an owned worker, preserve its database rather
        # than turning one failure into a later background SQLite exception.
        self.assertTrue(all(worker.thread is None or not worker.thread.is_alive() for worker in self.workers),
                        'owned worker still alive; private test database retained')
        shutil.rmtree(self.root)

    def finish_worker(self, worker):
        worker.touch()
        try:
            if worker.thread is not None:
                worker.thread.join(3)
                if worker.thread.is_alive() and worker.process is not None:
                    if worker.process.poll() is None:
                        subprocess.Popen.kill(worker.process)
                    worker.thread.join(3)
                self.assertFalse(worker.thread.is_alive(), 'owned Hub thread did not finish database cleanup')
            if worker.process is not None:
                self.assertIsNotNone(worker.process.poll(), 'owned child survived its Hub worker')
                worker.process.wait(1)
        finally:
            for name in ('ready_read', 'ready_write', 'release_read', 'release_write'):
                worker.close(name)

    def start_real_recipe(self):
        self.serial += 1
        worker = RecipeHandshake()
        self.workers.append(worker)
        # Registered before Hub.run, so every partially started failure path
        # joins the actual Hub thread before the older data cleanup callback.
        self.addCleanup(self.finish_worker, worker)
        script = ('import os,sys; '
                  'ready,release=int(sys.argv[1]),int(sys.argv[2]); '
                  'os.write(ready,b"R"); os.close(ready); '
                  'go=os.read(release,1); os.close(release); '
                  'assert go==b"G", "test release pipe closed"; '
                  'import runpy; runpy.run_path(sys.argv[3],run_name="__main__")')
        command = [sys.executable,'-I','-c',script,str(worker.ready_write),str(worker.release_read),
                   str(ROOT/'src/blackberryrock/recipe_worker.py')]
        original_popen, original_thread, original_execute = subprocess.Popen, threading.Thread, self.hub._execute

        def execute(*args):
            return original_execute(*args)

        def capture_thread(*args, **kwargs):
            thread = original_thread(*args, **kwargs)
            if kwargs.get('target') is execute:
                worker.thread = thread
            return thread

        def capture_child(*args, **kwargs):
            if args and args[0] == command:
                kwargs['pass_fds'] = (worker.ready_write, worker.release_read)
                worker.process = original_popen(*args, **kwargs)
                worker.close('ready_write')
                worker.close('release_read')
                return worker.process
            return original_popen(*args, **kwargs)

        try:
            with patch.object(self.hub, 'worker_command', return_value=command), \
                    patch.object(self.hub, '_execute', new=execute), \
                    patch('blackberryrock.hub.threading.Thread', side_effect=capture_thread), \
                    patch('blackberryrock.hub.subprocess.Popen', side_effect=capture_child):
                job = self.hub.run(self.tool, '  z  \n A ', f'original-job-{self.serial}')
                worker.await_ready()
            # No filesystem polling, automatic release, or dictionary lookup
            # after a child has had time to leave self.hub.processes.
            self.assertIsNotNone(worker.thread)
            self.assertIsNone(worker.process.poll())
            return job, worker.process, worker
        except BaseException:
            self.finish_worker(worker)
            raise

    def fault(self):
        # A deferred foreign key fails at the actual SQLite commit, after all
        # lifecycle writes and its receipt INSERT have run successfully.
        with self.hub.connect() as db:
            db.executescript('''
                CREATE TABLE IF NOT EXISTS fixture_parent(id INTEGER PRIMARY KEY);
                CREATE TABLE IF NOT EXISTS fixture_deferred(id INTEGER REFERENCES fixture_parent(id) DEFERRABLE INITIALLY DEFERRED);
                CREATE TRIGGER fixture_commit_failure AFTER INSERT ON hub_requests
                WHEN NEW.key='lifecycle-at-commit'
                BEGIN INSERT INTO fixture_deferred VALUES(1); END;
            ''')
        original = sqlite3.connect
        def foreign_keys_enabled(*args, **kwargs):
            db = original(*args, **kwargs)
            db.execute('PRAGMA foreign_keys=ON')
            return db
        return patch('blackberryrock.hub.sqlite3.connect',side_effect=foreign_keys_enabled)

    def mutate(self, action, job):
        if action == 'update': return self.hub.install(self.v2)
        if action == 'cancel': return self.hub.cancel(job['id'])
        if action == 'revoke': return self.hub.revoke(self.tool+'@1.0.0')
        return self.hub.lifecycle(self.tool, action)

    def test_commit_failure_preserves_running_child_approval_version_and_actual_output(self):
        for action in ('update','disable','uninstall','cancel','revoke'):
            with self.subTest(action=action):
                job, process, release = self.start_real_recipe()
                before = self.hub.state()
                try:
                    with self.fault(), self.assertRaisesRegex(sqlite3.IntegrityError,'FOREIGN KEY'):
                        self.hub.request('lifecycle-at-commit',{'op':action},lambda:self.mutate(action,job))
                    self.assertIsNone(process.poll(), 'rollback must not have killed the original real child')
                    self.assertEqual(before,self.hub.state())
                    with self.hub.connect() as db:
                        self.assertEqual(0,db.execute('SELECT COUNT(*) FROM hub_requests').fetchone()[0])
                        self.assertEqual(0,db.execute('SELECT COUNT(*) FROM fixture_deferred').fetchone()[0])
                        db.execute('DROP TRIGGER fixture_commit_failure')
                finally:
                    release.touch()
                    wait_for(lambda:job['id'] not in self.hub.processes,timeout=3)
                result = self.hub.job(job['id'])
                self.assertEqual((result['status'],result['output']),('succeeded','z\nA'))

    def test_successful_update_stops_child_only_after_independently_visible_receipt_commit(self):
        job, process, release = self.start_real_recipe()
        observations = []
        original_kill = process.kill
        def observe_then_kill():
            with self.hub.connect() as db:
                installed = db.execute('SELECT version,enabled FROM hub_installed WHERE id=?',(self.tool,)).fetchone()
                receipt = db.execute('SELECT result FROM hub_requests WHERE key=?',('successful-update',)).fetchone()
            # A separate database connection must see both committed changes.
            with closing(sqlite3.connect(self.hub.db)) as independent:
                self.assertEqual(1,independent.execute("SELECT COUNT(*) FROM hub_requests WHERE key='successful-update'").fetchone()[0])
            observations.append((tuple(installed),json.loads(receipt[0])['version']))
            original_kill()
        try:
            with patch.object(process,'kill',side_effect=observe_then_kill):
                result = self.hub.request('successful-update',{'op':'update'},lambda:self.hub.install(self.v2))
            wait_for(lambda:process.poll() is not None)
            wait_for(lambda:job['id'] not in self.hub.processes)
            self.assertEqual([(('2.0.0',0),'2.0.0')],observations)
            self.assertEqual('cancelled',self.hub.job(job['id'])['status'])
            self.assertEqual(result,self.hub.request('successful-update',{'op':'update'},lambda:self.fail('must not repeat update')))
        finally:
            release.touch()
            if process.poll() is None:
                original_kill()
                process.wait(3)

    def test_committed_stop_failure_retries_same_receipt_until_real_child_is_killed(self):
        job, process, release = self.start_real_recipe()
        original_kill = process.kill
        key, payload = 'stop-retry', {'op': 'update'}
        attempts = []

        def fail_twice_then_kill():
            # Reentrant read-only observers must not recursively drain stops.
            self.hub.state()
            with closing(sqlite3.connect(self.hub.db)) as independent:
                self.assertEqual(1, independent.execute('SELECT COUNT(*) FROM hub_requests WHERE key=?', (key,)).fetchone()[0])
            attempts.append(len(attempts) + 1)
            if len(attempts) <= 2:
                raise OSError('public fixture: signal temporarily unavailable')
            original_kill()

        try:
            with patch.object(process, 'kill', side_effect=fail_twice_then_kill):
                with self.assertRaises(OSError):
                    self.hub.request(key, payload, lambda: self.hub.install(self.v2))
                self.assertIsNone(process.poll())
                self.assertEqual('cancelled', self.hub.job(job['id'])['status'])
                with self.hub.connect() as db:
                    original_receipt = db.execute('SELECT result FROM hub_requests WHERE key=?', (key,)).fetchone()[0]
                self.hub.state()
                self.assertEqual([1], attempts, 'ordinary reads must not retry signals')
                self.assertEqual(1, len(self.hub._pending_stops))
                with self.assertRaises(OSError):
                    self.hub.request(key, payload, lambda: self.fail('committed update must not execute again'))
                self.assertIsNone(process.poll())
                self.assertEqual(1, len(self.hub._pending_stops))
                result = self.hub.request(key, payload, lambda: self.fail('committed update must not execute again'))
                self.assertEqual(json.loads(original_receipt), result)
                wait_for(lambda: process.poll() is not None)
                self.assertEqual([1, 2, 3], attempts)
                self.assertEqual({}, self.hub._pending_stops)
                self.assertEqual(result, self.hub.request(key, payload, lambda: self.fail('final receipt must replay')))
                with self.hub.connect() as db:
                    rows = db.execute('SELECT result FROM hub_requests WHERE key=?', (key,)).fetchall()
                self.assertEqual([original_receipt], [row[0] for row in rows])
            wait_for(lambda: job['id'] not in self.hub.processes)
            self.assertEqual('cancelled', self.hub.job(job['id'])['status'])
        finally:
            release.touch()
            if process.poll() is None:
                original_kill()
                process.wait(3)
            wait_for(lambda: job['id'] not in self.hub.processes, timeout=3)

    def test_naturally_completed_child_removes_pending_stop_without_signalling_again(self):
        job, process, release = self.start_real_recipe()
        original_kill = process.kill
        key, payload = 'finished-stop-retry', {'op': 'disable'}
        try:
            with patch.object(process, 'kill', side_effect=OSError('public fixture: first signal unavailable')) as signal:
                with self.assertRaises(OSError):
                    self.hub.request(key, payload, lambda: self.hub.lifecycle(self.tool, 'disable'))
                self.assertEqual(1, len(self.hub._pending_stops))
                release.touch()
                wait_for(lambda: job['id'] not in self.hub.processes, timeout=3)
                self.assertIsNotNone(process.poll())
                self.assertEqual({}, self.hub._pending_stops)
                self.assertIsNone(self.hub.request(key, payload, lambda: self.fail('must replay completed disable')))
                self.assertEqual(1, signal.call_count)
                self.assertEqual('cancelled', self.hub.job(job['id'])['status'])
        finally:
            release.touch()
            if process.poll() is None:
                original_kill()
                process.wait(3)
            wait_for(lambda: job['id'] not in self.hub.processes, timeout=3)

    def test_readiness_inspection_failure_joins_real_worker_before_database_cleanup(self):
        original_ready = RecipeHandshake.await_ready

        def fail_after_actual_ready(worker):
            original_ready(worker)
            raise RuntimeError('public fixture: parent readiness inspection failed')

        with patch.object(RecipeHandshake, 'await_ready', new=fail_after_actual_ready):
            with self.assertRaisesRegex(RuntimeError, 'parent readiness inspection failed'):
                self.start_real_recipe()
        worker = self.workers[-1]
        self.assertIsNotNone(worker.process)
        self.assertFalse(worker.thread.is_alive())
        self.assertEqual(0, worker.process.returncode)
        self.assertEqual({}, self.hub.processes)
        self.assertEqual({}, self.hub._pending_stops)
        self.assertTrue(self.hub.db.is_file())
        with self.hub.connect() as db:
            self.assertEqual('ok', db.execute('PRAGMA integrity_check').fetchone()[0])

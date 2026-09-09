"""Single-owner host prototype. SQLite transactions keep lifecycle changes atomic."""
from __future__ import annotations

import json
import sqlite3
import subprocess
import sys
import threading
import time
import uuid
from contextlib import contextmanager
from pathlib import Path

from .packages import PackageError, canonical, digest, require_compatible, verify_package


def _identifier(value):
    if not isinstance(value, str) or not 1 <= len(value) <= 200 or not value.strip():
        raise PackageError("identifier must be a non-empty string of at most 200 characters")
    return value


class Hub:
    def __init__(self, db: str | Path, trust: dict[str, str]):
        self.db = Path(db)
        self.db.parent.mkdir(parents=True, exist_ok=True)
        self.trust = dict(trust)
        self.lock = threading.RLock()
        self._request_context = threading.local()
        self.processes = {}
        self._pending_stops = {}
        with self.connect() as c:
            c.executescript('''
            CREATE TABLE IF NOT EXISTS hub_packages(id TEXT, version TEXT, hash TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(id,version));
            CREATE TABLE IF NOT EXISTS hub_installed(id TEXT PRIMARY KEY, version TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 0);
            CREATE TABLE IF NOT EXISTS hub_revoked(subject TEXT PRIMARY KEY);
            CREATE TABLE IF NOT EXISTS hub_jobs(id TEXT PRIMARY KEY, key TEXT UNIQUE, request_hash TEXT, tool_id TEXT, version TEXT, status TEXT, input_bytes INTEGER, output TEXT, error TEXT, created REAL, finished REAL, package_hash TEXT);
            CREATE TABLE IF NOT EXISTS hub_audit(seq INTEGER PRIMARY KEY AUTOINCREMENT, event TEXT, body TEXT, created REAL);
            CREATE TABLE IF NOT EXISTS hub_requests(key TEXT PRIMARY KEY, request_hash TEXT NOT NULL, result TEXT NOT NULL);
            ''')
            c.execute("UPDATE hub_jobs SET status='interrupted',error='Host restarted; submit a new explicit retry',finished=? WHERE status IN ('running','cancel_requested')", (time.time(),))

    @contextmanager
    def connect(self):
        shared = getattr(self._request_context, 'connection', None)
        if shared is not None:
            yield shared
            return
        c = sqlite3.connect(self.db, timeout=10)
        c.row_factory = sqlite3.Row
        queues = getattr(self._request_context, 'committed_stops', None)
        if queues is None:
            queues = self._request_context.committed_stops = {}
        queues[c] = []
        try:
            with c:
                yield c
            # SQLite's context has committed successfully, including a shared
            # request receipt. Stopping a child before this point cannot be
            # undone by a rollback. All callers that schedule stops hold lock.
            if queues[c]:
                self._pending_stops.update((process, None) for process in queues[c])
                self._retry_pending_stops()
        finally:
            del queues[c]
            c.close()

    def _stop_after_commit(self, c, process):
        if process is not None:
            queue = self._request_context.committed_stops[c]
            if all(old is not process for old in queue):
                queue.append(process)

    def _retry_pending_stops(self):
        """Retry committed stops under lock, never from an unrelated read.

        Keep only owned child references, not request payloads or an unbounded
        receipt history. Failed signals remain pending until a later request;
        completed workers remove their own references as well.
        """
        failure = None
        for process in list(self._pending_stops):
            try:
                if process.poll() is None:
                    process.kill()
            except ProcessLookupError:
                pass  # The owned child exited between poll and signal.
            except OSError as error:
                failure = failure or error
                continue
            self._pending_stops.pop(process, None)
        if failure is not None:
            raise failure  # Receipt is durable, but stopping is not yet complete.

    @staticmethod
    def _begin(c):
        if not c.in_transaction:
            c.execute("BEGIN IMMEDIATE")

    def request(self, key, payload, operation):
        """Commit a lifecycle mutation and its retry receipt in one transaction.

        A process crash cannot leave a committed install without its receipt.
        Job workers wait on the same lock until the initiating request commits.
        """
        if not isinstance(key, str) or not 1 <= len(key) <= 128 or not key.strip():
            raise PackageError('idempotency key required, maximum 128 characters')
        with self.lock, self.connect() as c:
            self._begin(c)
            sha = digest(payload)
            old = c.execute('SELECT * FROM hub_requests WHERE key=?', (key,)).fetchone()
            if old:
                if old['request_hash'] != sha:
                    raise PackageError('idempotency conflict')
                self._retry_pending_stops()
                return json.loads(old['result'])
            # New work must not bypass an earlier committed stop failure.
            self._retry_pending_stops()
            self._request_context.connection = c
            try:
                result = operation()
                c.execute('INSERT INTO hub_requests VALUES(?,?,?)', (key, sha, canonical(result).decode()))
                return result
            finally:
                del self._request_context.connection

    def worker_command(self):
        return [sys.executable, '-I', str(Path(__file__).with_name('recipe_worker.py'))]

    def actual_host(self):
        return 'host_python'

    def _verify(self, c, package):
        revoked = {r[0] for r in c.execute("SELECT subject FROM hub_revoked")}
        manifest, sha = verify_package(package, self.trust, revoked)
        require_compatible(manifest)
        return manifest, sha

    def _audit(self, c, event, body):
        c.execute("INSERT INTO hub_audit(event,body,created) VALUES(?,?,?)", (event, canonical(body).decode(), time.time()))

    def install(self, package):
        with self.lock, self.connect() as c:
            self._begin(c)
            m, sha = self._verify(c, package)
            old = c.execute("SELECT hash FROM hub_packages WHERE id=? AND version=?", (m['id'], m['version'])).fetchone()
            if old and old['hash'] != sha:
                raise PackageError("immutable version already exists with different content")
            c.execute("INSERT OR IGNORE INTO hub_packages VALUES(?,?,?,?)", (m['id'], m['version'], sha, canonical(package).decode()))
            self._cancel_tool(c, m['id'])
            c.execute("INSERT INTO hub_installed VALUES(?,?,0) ON CONFLICT(id) DO UPDATE SET version=excluded.version,enabled=0", (m['id'], m['version']))
            self._audit(c, "installed_disabled", {"id": m['id'], "version": m['version'], "hash": sha})
        return {"id": m['id'], "version": m['version'], "hash": sha, "enabled": False}

    def enable(self, tool_id, approved_hash):
        _identifier(tool_id)
        _identifier(approved_hash)
        with self.lock, self.connect() as c:
            self._begin(c)
            row = c.execute("SELECT p.* FROM hub_packages p JOIN hub_installed i USING(id,version) WHERE id=?", (tool_id,)).fetchone()
            if not row:
                raise PackageError("tool is not installed")
            _, sha = self._verify(c, json.loads(row['body']))
            if approved_hash != sha:
                raise PackageError("explicit approval must match the installed package hash")
            c.execute("UPDATE hub_installed SET enabled=1 WHERE id=?", (tool_id,))
            self._audit(c, "enabled", {"id": tool_id, "hash": sha})

    def lifecycle(self, tool_id, action, version=None):
        _identifier(tool_id)
        _identifier(action)
        if version is not None:
            _identifier(version)
        with self.lock, self.connect() as c:
            self._begin(c)
            if not c.execute("SELECT 1 FROM hub_installed WHERE id=?", (tool_id,)).fetchone():
                raise PackageError("tool is not installed")
            if action == "rollback":
                row = c.execute("SELECT body FROM hub_packages WHERE id=? AND version=?", (tool_id, version)).fetchone()
                if not row:
                    raise PackageError("rollback version is not cached")
                self._verify(c, json.loads(row['body']))
                c.execute("UPDATE hub_installed SET version=?,enabled=0 WHERE id=?", (version, tool_id))
            elif action == "disable":
                c.execute("UPDATE hub_installed SET enabled=0 WHERE id=?", (tool_id,))
            elif action == "uninstall":
                c.execute("DELETE FROM hub_installed WHERE id=?", (tool_id,))
                c.execute("DELETE FROM hub_packages WHERE id=?", (tool_id,))
            else:
                raise PackageError("unknown lifecycle action")
            self._cancel_tool(c, tool_id)
            self._audit(c, action, {"id": tool_id, "version": version})

    def _cancel_tool(self, c, tool_id):
        for row in c.execute("SELECT id FROM hub_jobs WHERE tool_id=? AND status IN ('running','cancel_requested')", (tool_id,)):
            process = self.processes.get(row['id'])
            self._stop_after_commit(c, process)
            c.execute("UPDATE hub_jobs SET status='cancelled',finished=? WHERE id=?", (time.time(), row['id']))

    def revoke(self, subject):
        _identifier(subject)
        with self.lock, self.connect() as c:
            self._begin(c)
            c.execute("INSERT OR IGNORE INTO hub_revoked VALUES(?)", (subject,))
            for row in c.execute("SELECT p.id,p.body FROM hub_packages p JOIN hub_installed i USING(id,version)"):
                m = json.loads(row['body'])['manifest']
                if subject in (m['publisher'], f"{m['id']}@{m['version']}"):
                    c.execute("UPDATE hub_installed SET enabled=0 WHERE id=?", (row['id'],))
                    self._cancel_tool(c, row['id'])
            self._audit(c, "revoked", {"subject": subject})

    def state(self):
        with self.connect() as c:
            installed = []
            for r in c.execute("SELECT i.*,p.body,p.hash FROM hub_installed i JOIN hub_packages p USING(id,version) ORDER BY id"):
                item = dict(r)
                item['manifest'] = json.loads(item.pop('body'))['manifest']
                item['cached_versions'] = [x[0] for x in c.execute("SELECT version FROM hub_packages WHERE id=? ORDER BY version", (r['id'],))]
                installed.append(item)
            jobs = [dict(r) for r in c.execute("SELECT * FROM hub_jobs ORDER BY created DESC LIMIT 100")]
            audit = [dict(r) for r in c.execute("SELECT * FROM hub_audit ORDER BY seq DESC LIMIT 100")]
            revoked = [r[0] for r in c.execute("SELECT subject FROM hub_revoked")]
        return {"installed": installed, "jobs": jobs, "audit": audit, "revoked": revoked, "maturity": "host_prototype", "execution_host": "This computer", "modes": {"device_local": "host_interpreter_only", "cloud": "unavailable", "pc_usb": "not_verified"}}

    def run(self, tool_id, text, key, target="device_local"):
        _identifier(tool_id)
        if target not in ("device_local", "auto"):
            raise PackageError("runner unavailable; no automatic cloud or USB fallback")
        if not isinstance(text, str) or len(text.encode()) > 65536:
            raise PackageError("text input exceeds 64 KiB")
        if not isinstance(key, str) or not 1 <= len(key) <= 128:
            raise PackageError("idempotency key required, maximum 128 characters")
        with self.lock, self.connect() as c:
            self._begin(c)
            request_hash = digest({"id": tool_id, "text": text, "target": target})
            old = c.execute("SELECT * FROM hub_jobs WHERE key=?", (key,)).fetchone()
            if old:
                if old['request_hash'] != request_hash:
                    raise PackageError("idempotency conflict")
                return dict(old)
            if c.execute("SELECT COUNT(*) FROM hub_jobs WHERE status='running'").fetchone()[0] >= 4:
                raise PackageError("host capacity reached; wait for a running job to finish")
            row = c.execute("SELECT p.*,i.enabled FROM hub_packages p JOIN hub_installed i USING(id,version) WHERE id=?", (tool_id,)).fetchone()
            if not row or not row['enabled']:
                raise PackageError("tool must be installed and explicitly enabled")
            package = json.loads(row['body'])
            m, sha = self._verify(c, package)
            if 'device_local' not in m['execution_targets']:
                raise PackageError('this signed package does not permit local execution')
            job_id = str(uuid.uuid4())
            c.execute("INSERT INTO hub_jobs VALUES(?,?,?,?,?,?,?,?,?,?,?,?)", (job_id,key,request_hash,tool_id,m['version'],'running',len(text.encode()),None,None,time.time(),None,sha))
            self._audit(c, "run_approved", {"job_id": job_id, "package_hash": sha, "execution_target": "device_local", "actual_host": self.actual_host(), "sent_to_cloud": False, "amount_minor": 0})
        thread = threading.Thread(target=self._execute, args=(job_id, text, package['recipe']), daemon=True)
        thread.start()
        return self.job(job_id)

    def _execute(self, job_id, text, recipe):
        process = None
        try:
            with self.lock, self.connect() as c:
                row = c.execute("SELECT status FROM hub_jobs WHERE id=?", (job_id,)).fetchone()
                if row['status'] != 'running':
                    return
                process = subprocess.Popen(self.worker_command(), stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True)
                self.processes[job_id] = process
            output, _ = process.communicate(canonical({"text": text, "recipe": recipe}), timeout=3)
            payload = json.loads(output)
            status = 'succeeded' if process.returncode == 0 else 'failed'
            error = payload.get('error')
            result = payload.get('text')
        except subprocess.TimeoutExpired:
            process.kill()
            process.communicate()
            status, result, error = 'failed', None, 'time limit exceeded'
        except (OSError, ValueError, TypeError):
            status, result, error = 'failed', None, 'worker interrupted or invalid output'
        with self.lock, self.connect() as c:
            c.execute("UPDATE hub_jobs SET status=?,output=?,error=?,finished=? WHERE id=? AND status='running'", (status,result,error,time.time(),job_id))
            self.processes.pop(job_id, None)
            if process is not None and process.returncode is not None:
                self._pending_stops.pop(process, None)

    def job(self, job_id):
        _identifier(job_id)
        with self.connect() as c:
            row = c.execute("SELECT * FROM hub_jobs WHERE id=?", (job_id,)).fetchone()
            if not row:
                raise PackageError("job not found")
            return dict(row)

    def cancel(self, job_id):
        _identifier(job_id)
        with self.lock, self.connect() as c:
            process = self.processes.get(job_id)
            self._stop_after_commit(c, process)
            c.execute("UPDATE hub_jobs SET status='cancelled',finished=? WHERE id=? AND status='running'", (time.time(),job_id))
        return self.job(job_id)

    def backup(self, destination):
        destination = Path(destination)
        if destination.resolve() == self.db.resolve() or destination.exists():
            raise PackageError("backup must use a new file, never the source database")
        with destination.open('xb'):
            pass
        with self.lock, self.connect() as c:
            target = sqlite3.connect(destination)
            try:
                c.backup(target)
            finally:
                target.close()

"""Owner- and project-scoped canonical memory with an injected OS-backed cipher.

This module deliberately has no plaintext-at-rest fallback and no built-in key store.
The host/dev harness must inject a platform cipher whose key is protected by the OS.
"""
from contextlib import closing, contextmanager
import json
import os
from pathlib import Path
import re
import sqlite3
import stat
import threading
from typing import Protocol


MAX_CONTENT_BYTES = 16 * 1024
MAX_PROJECTION_BYTES = 64 * 1024
MAX_CIPHER_BYTES = MAX_PROJECTION_BYTES + 4096
MAX_RECORDS = 10_000
_IDENTIFIER = re.compile(r"[A-Za-z0-9][A-Za-z0-9._:-]{0,127}\Z")
_PROFILE = re.compile(r"[a-z0-9]+(?:[._-][a-z0-9]+){2,}@?[A-Za-z0-9._-]{0,64}\Z")
_PROVENANCE_KEYS = {"sourceKind", "sourceWorkId", "sourceArtifactId", "modelProfileId"}


class MemoryErrorBase(Exception):
    """Base for safe, content-free memory errors."""


class MemoryNotFound(MemoryErrorBase):
    pass


class MemoryConflict(MemoryErrorBase):
    pass


class MemoryUnavailable(MemoryErrorBase):
    pass


class MemoryCipher(Protocol):
    """OS adapter: authenticated encryption with owner/scope-bound AAD."""

    def seal(self, owner_ref: str, aad: bytes, plaintext: bytes) -> bytes: ...
    def open(self, owner_ref: str, aad: bytes, ciphertext: bytes) -> bytes: ...


def _identifier(value: object, field: str) -> str:
    if not isinstance(value, str) or not _IDENTIFIER.fullmatch(value):
        raise ValueError(f"invalid {field}")
    return value


def _integer(value: object, field: str, *, minimum: int = 0) -> int:
    if type(value) is not int or value < minimum or value > 2**53 - 1:
        raise ValueError(f"invalid {field}")
    return value


def _canonical(value: dict) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True,
                      separators=(",", ":"), allow_nan=False).encode("utf-8")


class CanonicalMemoryStore:
    """SQLite index for encrypted, owner-confirmed canonical memory and projections.

    Content is only available through an explicit owner+project lookup. Projects are
    isolated at the primary-key layer. Model-specific projections are encrypted,
    version-pinned caches and are removed whenever canonical memory changes.
    """

    def __init__(self, directory: str | os.PathLike, *, cipher: MemoryCipher,
                 max_records: int = MAX_RECORDS):
        if cipher is None:
            raise MemoryUnavailable("OS memory cipher unavailable")
        if type(max_records) is not int or not 1 <= max_records <= MAX_RECORDS:
            raise ValueError("bounded memory limit required")
        self.cipher, self.max_records = cipher, max_records
        self.lock = threading.RLock()
        self.directory = Path(directory)
        self.directory.mkdir(parents=True, mode=0o700, exist_ok=True)
        self._check_directory()
        self.path = self.directory / "canonical-memory.sqlite3"
        self._check_file(self.path)
        fresh = not self.path.exists()
        if fresh:
            fd = os.open(self.path, os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW, 0o600)
            os.close(fd)
        self._initialize(fresh)

    def _check_directory(self) -> None:
        st = self.directory.lstat()
        if (not stat.S_ISDIR(st.st_mode) or st.st_uid != os.geteuid()
                or st.st_mode & 0o077):
            raise MemoryUnavailable("owned private non-symlink memory directory required")

    @staticmethod
    def _check_file(path: Path) -> None:
        try:
            st = path.lstat()
        except FileNotFoundError:
            return
        if (not stat.S_ISREG(st.st_mode) or st.st_nlink != 1 or st.st_uid != os.geteuid()
                or st.st_mode & 0o077):
            raise MemoryUnavailable("owned private single-link memory database required")

    def _connect(self) -> sqlite3.Connection:
        self._check_directory()
        self._check_file(self.path)
        if not self.path.exists():
            raise MemoryUnavailable("memory database missing; explicit recovery required")
        db = sqlite3.connect(self.path, timeout=2, isolation_level=None)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA foreign_keys=ON")
        db.execute("PRAGMA synchronous=FULL")
        db.execute("PRAGMA journal_mode=DELETE")
        return db

    def _initialize(self, fresh: bool) -> None:
        with closing(self._connect()) as db:
            tables = {row[0] for row in db.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")}
            expected = {"memory_records", "memory_projections", "memory_tombstones"}
            if fresh:
                if tables:
                    raise MemoryUnavailable("unexpected preexisting memory schema")
                db.executescript("""
                BEGIN IMMEDIATE;
                CREATE TABLE memory_records(
                    owner_ref TEXT NOT NULL, project_ref TEXT NOT NULL, memory_id TEXT NOT NULL,
                    kind TEXT NOT NULL, provenance TEXT NOT NULL, created_at INTEGER NOT NULL,
                    expires_at INTEGER, revision INTEGER NOT NULL, cipher_version TEXT NOT NULL,
                    content_ciphertext BLOB NOT NULL,
                    PRIMARY KEY(owner_ref,project_ref,memory_id));
                CREATE TABLE memory_projections(
                    owner_ref TEXT NOT NULL, project_ref TEXT NOT NULL, memory_id TEXT NOT NULL,
                    memory_revision INTEGER NOT NULL, model_profile_id TEXT NOT NULL,
                    projection_ciphertext BLOB NOT NULL,
                    PRIMARY KEY(owner_ref,project_ref,memory_id,model_profile_id),
                    FOREIGN KEY(owner_ref,project_ref,memory_id)
                      REFERENCES memory_records(owner_ref,project_ref,memory_id) ON DELETE CASCADE);
                CREATE TABLE memory_tombstones(
                    owner_ref TEXT NOT NULL, project_ref TEXT NOT NULL, memory_id TEXT NOT NULL,
                    revision INTEGER NOT NULL, deleted_at INTEGER NOT NULL,
                    PRIMARY KEY(owner_ref,project_ref,memory_id));
                COMMIT;
                """)
                os.chmod(self.path, 0o600)
            elif tables != expected:
                raise MemoryUnavailable("memory schema mismatch; migration required")

    @staticmethod
    def _aad(owner: str, project: str, memory_id: str, revision: int,
             purpose: str, profile_id: str | None = None) -> bytes:
        return _canonical({"schemaVersion": 1, "ownerRef": owner, "projectRef": project,
                           "memoryId": memory_id, "revision": revision,
                           "purpose": purpose, "modelProfileId": profile_id})

    @contextmanager
    def _transaction(self):
        with closing(self._connect()) as db:
            db.execute("BEGIN IMMEDIATE")
            try:
                yield db
                db.commit()
            except BaseException:
                db.rollback()
                raise

    @staticmethod
    def _scope(owner_ref: str, project_ref: str, memory_id: str) -> tuple[str, str, str]:
        return (_identifier(owner_ref, "owner reference"),
                _identifier(project_ref, "project reference"),
                _identifier(memory_id, "memory ID"))

    @staticmethod
    def _provenance(value: object) -> str:
        if type(value) is not dict or set(value) - _PROVENANCE_KEYS:
            raise ValueError("bounded memory provenance required")
        if value.get("sourceKind") != "owner_confirmation":
            raise ValueError("long-term memory requires explicit owner confirmation")
        for key in ("sourceWorkId", "sourceArtifactId"):
            if key in value:
                _identifier(value[key], key)
        if "modelProfileId" in value:
            profile = value["modelProfileId"]
            if not isinstance(profile, str) or not _PROFILE.fullmatch(profile):
                raise ValueError("invalid model profile provenance")
        return _canonical(value).decode("utf-8")

    def put(self, *, owner_ref: str, project_ref: str, memory_id: str, kind: str,
            content: str, provenance: dict, now: int, expires_at: int | None,
            expected_revision: int) -> dict:
        owner, project, mid = self._scope(owner_ref, project_ref, memory_id)
        kind = _identifier(kind, "memory kind")
        if not isinstance(content, str) or not content.strip():
            raise ValueError("nonempty canonical memory required")
        plaintext = content.encode("utf-8")
        if len(plaintext) > MAX_CONTENT_BYTES:
            raise ValueError("memory exceeds content limit")
        now = _integer(now, "current time", minimum=1)
        if expires_at is not None:
            expires_at = _integer(expires_at, "expiry", minimum=now + 1)
        expected_revision = _integer(expected_revision, "expected revision")
        provenance_json = self._provenance(provenance)
        with self.lock:
            with closing(self._connect()) as db:
                row = db.execute("SELECT revision,created_at FROM memory_records WHERE owner_ref=? AND project_ref=? AND memory_id=?",
                                 (owner, project, mid)).fetchone()
                tombstone = db.execute("SELECT 1 FROM memory_tombstones WHERE owner_ref=? AND project_ref=? AND memory_id=?",
                                       (owner, project, mid)).fetchone()
            if tombstone:
                raise MemoryConflict("deleted memory ID cannot be reused")
            actual = row["revision"] if row else 0
            if actual != expected_revision:
                raise MemoryConflict("memory revision changed")
            revision = actual + 1
            aad = self._aad(owner, project, mid, revision, "canonical")
            ciphertext = self.cipher.seal(owner, aad, plaintext)
            if (not isinstance(ciphertext, bytes) or len(ciphertext) < len(plaintext) + 16
                    or len(ciphertext) > MAX_CIPHER_BYTES):
                raise MemoryUnavailable("OS cipher returned an invalid envelope")
            with self._transaction() as db:
                existing = db.execute("SELECT revision FROM memory_records WHERE owner_ref=? AND project_ref=? AND memory_id=?",
                                      (owner, project, mid)).fetchone()
                tombstone = db.execute("SELECT 1 FROM memory_tombstones WHERE owner_ref=? AND project_ref=? AND memory_id=?",
                                       (owner, project, mid)).fetchone()
                if tombstone:
                    raise MemoryConflict("deleted memory ID cannot be reused")
                current = existing["revision"] if existing else 0
                if current != expected_revision:
                    raise MemoryConflict("memory revision changed")
                if not existing and db.execute("SELECT COUNT(*) FROM memory_records").fetchone()[0] >= self.max_records:
                    raise MemoryUnavailable("memory record limit reached")
                if existing:
                    db.execute("DELETE FROM memory_projections WHERE owner_ref=? AND project_ref=? AND memory_id=?",
                               (owner, project, mid))
                    db.execute("UPDATE memory_records SET kind=?,provenance=?,expires_at=?,revision=?,content_ciphertext=? "
                               "WHERE owner_ref=? AND project_ref=? AND memory_id=?",
                               (kind, provenance_json, expires_at, revision, ciphertext, owner, project, mid))
                else:
                    db.execute("INSERT INTO memory_records VALUES(?,?,?,?,?,?,?,?,?,?)",
                               (owner, project, mid, kind, provenance_json, now, expires_at, revision,
                                "platform-aead/1", ciphertext))
        return {"ownerRef": owner, "projectRef": project, "memoryId": mid, "kind": kind,
                "provenance": json.loads(provenance_json),
                "createdAt": now if not row else row["created_at"],
                "expiresAt": expires_at, "revision": revision}

    def get(self, *, owner_ref: str, project_ref: str, memory_id: str, now: int) -> dict:
        owner, project, mid = self._scope(owner_ref, project_ref, memory_id)
        now = _integer(now, "current time", minimum=1)
        with self.lock, closing(self._connect()) as db:
            row = db.execute("SELECT * FROM memory_records WHERE owner_ref=? AND project_ref=? AND memory_id=?",
                             (owner, project, mid)).fetchone()
        if row is None or (row["expires_at"] is not None and now >= row["expires_at"]):
            raise MemoryNotFound("memory not found")
        aad = self._aad(owner, project, mid, row["revision"], "canonical")
        try:
            plaintext = self.cipher.open(owner, aad, bytes(row["content_ciphertext"]))
        except Exception as exc:
            raise MemoryUnavailable("memory authentication failed") from exc
        if not isinstance(plaintext, bytes) or len(plaintext) > MAX_CONTENT_BYTES:
            raise MemoryUnavailable("memory plaintext invalid")
        try:
            content = plaintext.decode("utf-8")
        except UnicodeDecodeError as exc:
            raise MemoryUnavailable("memory plaintext encoding invalid") from exc
        return {"ownerRef": owner, "projectRef": project, "memoryId": mid, "kind": row["kind"],
                "provenance": json.loads(row["provenance"]), "createdAt": row["created_at"],
                "expiresAt": row["expires_at"], "revision": row["revision"], "content": content}

    def list_refs(self, *, owner_ref: str, project_ref: str, now: int, limit: int = 100) -> list[dict]:
        owner, project = (_identifier(owner_ref, "owner reference"),
                          _identifier(project_ref, "project reference"))
        now = _integer(now, "current time", minimum=1)
        if type(limit) is not int or not 1 <= limit <= 200:
            raise ValueError("bounded memory reference page required")
        with self.lock, closing(self._connect()) as db:
            rows = db.execute("SELECT memory_id,kind,provenance,created_at,expires_at,revision "
                              "FROM memory_records WHERE owner_ref=? AND project_ref=? "
                              "AND (expires_at IS NULL OR expires_at>?) ORDER BY memory_id LIMIT ?",
                              (owner, project, now, limit)).fetchall()
        return [{"memoryId": row["memory_id"], "kind": row["kind"],
                 "provenance": json.loads(row["provenance"]), "createdAt": row["created_at"],
                 "expiresAt": row["expires_at"], "revision": row["revision"]} for row in rows]

    def rebuild_projection(self, *, owner_ref: str, project_ref: str, memory_id: str,
                           model_profile_id: str, now: int, builder) -> dict:
        owner, project, mid = self._scope(owner_ref, project_ref, memory_id)
        if not isinstance(model_profile_id, str) or not _PROFILE.fullmatch(model_profile_id):
            raise ValueError("versioned model profile required")
        canonical = self.get(owner_ref=owner, project_ref=project, memory_id=mid, now=now)
        projection = builder(canonical["content"])
        if not isinstance(projection, bytes) or not projection or len(projection) > MAX_PROJECTION_BYTES:
            raise ValueError("bounded model projection required")
        revision = canonical["revision"]
        aad = self._aad(owner, project, mid, revision, "model-projection", model_profile_id)
        ciphertext = self.cipher.seal(owner, aad, projection)
        if (not isinstance(ciphertext, bytes) or len(ciphertext) < len(projection) + 16
                or len(ciphertext) > MAX_CIPHER_BYTES):
            raise MemoryUnavailable("OS cipher returned an invalid projection envelope")
        with self._transaction() as db:
            current = db.execute("SELECT revision,expires_at FROM memory_records WHERE owner_ref=? AND project_ref=? AND memory_id=?",
                                 (owner, project, mid)).fetchone()
            if (current is None or current["revision"] != revision
                    or (current["expires_at"] is not None and now >= current["expires_at"])):
                raise MemoryConflict("canonical memory changed during projection rebuild")
            db.execute("INSERT INTO memory_projections VALUES(?,?,?,?,?,?) "
                       "ON CONFLICT(owner_ref,project_ref,memory_id,model_profile_id) DO UPDATE SET "
                       "memory_revision=excluded.memory_revision,projection_ciphertext=excluded.projection_ciphertext",
                       (owner, project, mid, revision, model_profile_id, ciphertext))
        return {"memoryId": mid, "revision": revision, "modelProfileId": model_profile_id,
                "projectionBytes": len(projection)}

    def read_projection(self, *, owner_ref: str, project_ref: str, memory_id: str,
                        model_profile_id: str, now: int) -> bytes:
        owner, project, mid = self._scope(owner_ref, project_ref, memory_id)
        if not isinstance(model_profile_id, str) or not _PROFILE.fullmatch(model_profile_id):
            raise ValueError("versioned model profile required")
        now = _integer(now, "current time", minimum=1)
        with self.lock, closing(self._connect()) as db:
            row = db.execute("SELECT r.revision,r.expires_at,p.memory_revision,p.projection_ciphertext "
                             "FROM memory_records r JOIN memory_projections p USING(owner_ref,project_ref,memory_id) "
                             "WHERE r.owner_ref=? AND r.project_ref=? AND r.memory_id=? AND p.model_profile_id=?",
                             (owner, project, mid, model_profile_id)).fetchone()
        if (row is None or row["memory_revision"] != row["revision"]
                or (row["expires_at"] is not None and now >= row["expires_at"])):
            raise MemoryNotFound("model projection unavailable")
        aad = self._aad(owner, project, mid, row["revision"], "model-projection", model_profile_id)
        try:
            value = self.cipher.open(owner, aad, bytes(row["projection_ciphertext"]))
        except Exception as exc:
            raise MemoryUnavailable("projection authentication failed") from exc
        if not isinstance(value, bytes) or not value or len(value) > MAX_PROJECTION_BYTES:
            raise MemoryUnavailable("projection invalid")
        return value

    def delete(self, *, owner_ref: str, project_ref: str, memory_id: str, now: int) -> bool:
        owner, project, mid = self._scope(owner_ref, project_ref, memory_id)
        now = _integer(now, "current time", minimum=1)
        with self._transaction() as db:
            row = db.execute("SELECT revision FROM memory_records WHERE owner_ref=? AND project_ref=? AND memory_id=?",
                             (owner, project, mid)).fetchone()
            if row is None:
                return False
            db.execute("DELETE FROM memory_projections WHERE owner_ref=? AND project_ref=? AND memory_id=?",
                       (owner, project, mid))
            db.execute("DELETE FROM memory_records WHERE owner_ref=? AND project_ref=? AND memory_id=?",
                       (owner, project, mid))
            db.execute("INSERT INTO memory_tombstones VALUES(?,?,?,?,?)",
                       (owner, project, mid, row["revision"], now))
            return True

    def expire_due(self, *, now: int, limit: int = 100) -> int:
        now = _integer(now, "current time", minimum=1)
        if type(limit) is not int or not 1 <= limit <= 500:
            raise ValueError("bounded expiry page required")
        with self._transaction() as db:
            rows = db.execute("SELECT owner_ref,project_ref,memory_id,revision FROM memory_records "
                              "WHERE expires_at IS NOT NULL AND expires_at<=? ORDER BY expires_at LIMIT ?",
                              (now, limit)).fetchall()
            for row in rows:
                db.execute("DELETE FROM memory_projections WHERE owner_ref=? AND project_ref=? AND memory_id=?",
                           (row["owner_ref"], row["project_ref"], row["memory_id"]))
                db.execute("DELETE FROM memory_records WHERE owner_ref=? AND project_ref=? AND memory_id=?",
                           (row["owner_ref"], row["project_ref"], row["memory_id"]))
                db.execute("INSERT INTO memory_tombstones VALUES(?,?,?,?,?)",
                           (row["owner_ref"], row["project_ref"], row["memory_id"], row["revision"], now))
            return len(rows)

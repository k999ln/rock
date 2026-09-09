"""Loopback TLS registry with authenticated, immutable, atomic development publish."""
import argparse
from contextlib import nullcontext
import hashlib
import hmac
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import os
from pathlib import Path
import re
import sqlite3
import ssl
import threading
import time

from blackberryrock.packages import MAX_PACKAGE_BYTES, canonical, verify_package
from service_access import ServiceConfigurationError
from .common import (MAX_ENTRIES, MAX_INDEX_BYTES, MAX_REVOCATIONS, MIN_VALIDITY_SECONDS, MAX_VALIDITY_SECONDS,
                     REGISTRY_ID, Capacity, Conflict, RegistryError,
                     decode, fsync_directory, read_regular, safe_directory, sha256, sign_index, verify_index)

MAX_PUBLISH_BYTES = MAX_PACKAGE_BYTES + 1024


class RegistryStore:
    def __init__(self, directory, authors_file, max_packages=MAX_ENTRIES,
                 max_total_bytes=8 * 1024 * 1024, max_receipts=4096, validity_seconds=3600, clock=None,
                 service_access=None):
        self.root = safe_directory(directory)
        config = decode(read_regular(authors_file, 65536))
        if not isinstance(config, dict) or set(config) != {"authors", "publishers"}:
            raise RegistryError("explicit approved authors and publishers required")
        self.authors, self.publishers = config["authors"], config["publishers"]
        if not isinstance(self.authors, dict) or not 1 <= len(self.authors) <= 32 or not isinstance(self.publishers, dict):
            raise RegistryError("invalid author configuration")
        for author, policy in self.authors.items():
            if (not re.fullmatch(r"[a-zA-Z0-9_.-]{1,80}", author) or not isinstance(policy, dict)
                    or set(policy) != {"token_sha256", "publishers"}
                    or not isinstance(policy["token_sha256"], str) or not re.fullmatch("[0-9a-f]{64}", policy["token_sha256"])
                    or not isinstance(policy["publishers"], list) or not policy["publishers"]
                    or any(p not in self.publishers for p in policy["publishers"])):
                raise RegistryError("invalid approved author policy")
        if not 1 <= max_packages <= MAX_ENTRIES or not 1 <= max_total_bytes <= 64 * 1024 * 1024 or not 1 <= max_receipts <= 65536:
            raise RegistryError("invalid registry storage quota")
        self.max_packages, self.max_total_bytes, self.max_receipts = max_packages, max_total_bytes, max_receipts
        if type(validity_seconds) is not int or not MIN_VALIDITY_SECONDS <= validity_seconds <= MAX_VALIDITY_SECONDS:
            raise RegistryError("index validity must be between 30 and 86400 seconds")
        self.validity_seconds = validity_seconds
        self.clock = time.time if clock is None else clock
        self.mutex = threading.RLock()
        self.database = self.root / "registry.db"
        descriptor = os.open(self.database, os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
        os.close(descriptor)
        self.connection = sqlite3.connect(self.database, isolation_level=None, check_same_thread=False)
        self.connection.execute("PRAGMA journal_mode=WAL")
        self.connection.execute("PRAGMA synchronous=FULL")
        self.connection.execute("PRAGMA busy_timeout=5000")
        self.service_access = service_access
        try:
            self._bind_access(service_access)
        except BaseException:
            self.connection.close()
            raise
        self.connection.executescript("""
          CREATE TABLE IF NOT EXISTS packages(id TEXT, version TEXT, hash TEXT UNIQUE, raw BLOB NOT NULL,
            PRIMARY KEY(id,version));
          CREATE TABLE IF NOT EXISTS receipts(author TEXT, key TEXT, request_hash TEXT NOT NULL,
            raw BLOB NOT NULL, PRIMARY KEY(author,key));
          CREATE TABLE IF NOT EXISTS registry_state(singleton INTEGER PRIMARY KEY CHECK(singleton=1),
            revision INTEGER NOT NULL, signed_index BLOB NOT NULL);
          CREATE TABLE IF NOT EXISTS revocations(subject TEXT PRIMARY KEY, publisher TEXT NOT NULL, author TEXT NOT NULL);
        """)
        if not self.connection.execute("SELECT 1 FROM registry_state").fetchone():
            initial = self._new_index(0)
            self.connection.execute("INSERT INTO registry_state VALUES(1,0,?)", (initial,))
        # Fail closed for a corrupt or pre-expiry-protocol development store.
        verify_index(decode(self.connection.execute("SELECT signed_index FROM registry_state WHERE singleton=1").fetchone()[0]),
                     publishers=self.publishers, require_fresh=False)
        fsync_directory(self.root)

    def _bind_access(self, controller):
        """A closed store never silently becomes the anonymous SDK fixture.

        Upgrade only an empty legacy store. Existing immutable package/author
        history is not reassigned to an authority by this development path.
        """
        c = self.connection
        c.execute('BEGIN IMMEDIATE')
        try:
            tables = {r[0] for r in c.execute("SELECT name FROM sqlite_master WHERE type='table'")}
            mode_rows = c.execute('SELECT singleton,binding FROM service_access_mode').fetchall() if 'service_access_mode' in tables else []
            if 'service_access_mode' in tables and (len(mode_rows) != 1 or mode_rows[0][0] != 1):
                raise RegistryError('closed registry authority marker is incomplete')
            prior = (mode_rows[0][1],) if mode_rows else None
            binding = canonical({'mode': 'closed-purchaser', 'authority_id': controller.authority_id}).decode() if controller else None
            if prior is not None and prior[0] != binding:
                raise RegistryError('closed registry requires its original service authority')
            if binding is not None and prior is None:
                for name in ('packages', 'receipts', 'revocations'):
                    if name in tables and c.execute('SELECT 1 FROM '+name+' LIMIT 1').fetchone():
                        raise RegistryError('closed registry requires fresh empty state; legacy history is not migrated')
                c.execute('CREATE TABLE IF NOT EXISTS service_access_mode(singleton INTEGER PRIMARY KEY CHECK(singleton=1),binding TEXT NOT NULL)')
                c.execute('INSERT INTO service_access_mode VALUES(1,?)', (binding,))
            if binding is not None:
                c.execute("CREATE TRIGGER IF NOT EXISTS service_access_mode_no_delete BEFORE DELETE ON service_access_mode BEGIN SELECT RAISE(ABORT,'closed registry mode retained'); END")
                c.execute("CREATE TRIGGER IF NOT EXISTS service_access_mode_no_update BEFORE UPDATE ON service_access_mode BEGIN SELECT RAISE(ABORT,'closed registry mode immutable'); END")
            c.execute('COMMIT')
        except BaseException:
            if c.in_transaction: c.execute('ROLLBACK')
            raise

    def close(self):
        with self.mutex:
            self.connection.close()

    def authenticate(self, authorization):
        if not isinstance(authorization, str) or not authorization.startswith("Bearer ") or not 16 <= len(authorization[7:]) <= 256:
            raise PermissionError("author authentication required")
        token_hash = hashlib.sha256(authorization[7:].encode()).hexdigest()
        matches = [author for author, policy in self.authors.items()
                   if hmac.compare_digest(policy["token_sha256"], token_hash)]
        if len(matches) != 1:
            raise PermissionError("author authentication rejected")
        return matches[0]

    def index(self):
        with self.mutex:
            c = self.connection
            c.execute("BEGIN IMMEDIATE")
            try:
                raw = bytes(c.execute("SELECT signed_index FROM registry_state WHERE singleton=1").fetchone()[0])
                index = decode(raw)
                # Renewal changes revision as well as dates, avoiding same-revision equivocation.
                if int(self.clock()) >= index["expires_at"] - max(1, self.validity_seconds // 4):
                    raw = self._new_index(index["revision"] + 1)
                    c.execute("UPDATE registry_state SET revision=?,signed_index=? WHERE singleton=1", (index["revision"] + 1, raw))
                c.execute("COMMIT")
                return raw
            except BaseException:
                if c.in_transaction:
                    c.execute("ROLLBACK")
                raise

    def _new_index(self, revision):
        entries = []
        for package_id, version, item_hash, item_raw in self.connection.execute("SELECT id,version,hash,raw FROM packages ORDER BY id,version"):
            body = decode(item_raw)
            entries.append({"manifest": body["manifest"], "hash": item_hash, "size": len(item_raw),
                            "filename": f"{package_id}--{version}.rock.json", "source": "registry"})
        revocations = [row[0] for row in self.connection.execute("SELECT subject FROM revocations ORDER BY subject")]
        issued_at = int(self.clock())
        index = sign_index({"schema_version": 1, "registry_id": REGISTRY_ID, "revision": revision,
                            "issued_at": issued_at, "expires_at": issued_at + self.validity_seconds,
                            "packages": entries, "revocations": revocations})
        signed = canonical(index)
        if len(signed) > MAX_INDEX_BYTES:
            raise Capacity("signed index exceeds quota")
        verify_index(index, publishers=self.publishers, now=issued_at)
        return signed

    def package(self, package_hash):
        with self.mutex:
            row = self.connection.execute("SELECT id,version,raw FROM packages WHERE hash=?", (package_hash,)).fetchone()
            if row is None:
                raise FileNotFoundError("package not found")
            package_id, version, raw = row[0], row[1], bytes(row[2])
            if sha256(raw) != package_hash:
                raise RegistryError("stored package integrity failure")
            try:
                manifest = decode(raw)["manifest"]
                publisher = manifest["publisher"]
                if manifest["id"] != package_id or manifest["version"] != version:
                    raise RegistryError("stored package identity failure")
            except (KeyError, TypeError) as error:
                raise RegistryError("stored package identity failure") from error
            # Serialize admission with publish/revoke. Immutable bytes and
            # receipts remain in storage/index history, but a committed
            # revocation must also deny a direct hash GET, not just catalog use.
            if self.connection.execute("SELECT 1 FROM revocations WHERE subject IN (?,?)",
                                       (publisher, f"{package_id}@{version}")).fetchone():
                raise FileNotFoundError("package not found")
            return raw

    def publish(self, author, key, envelope):
        if author not in self.authors:
            raise PermissionError("author not approved")
        if not isinstance(key, str) or not re.fullmatch(r"[a-zA-Z0-9_.:-]{1,128}", key):
            raise RegistryError("valid Idempotency-Key required")
        if not isinstance(envelope, dict) or set(envelope) != {"package"}:
            raise RegistryError("publish body requires package only")
        package = envelope["package"]
        manifest, package_hash = verify_package(package, self.publishers)
        if manifest["publisher"] not in self.authors[author]["publishers"]:
            raise PermissionError("author may not publish for this publisher")
        raw = canonical(package)
        request_hash = sha256(canonical(envelope))
        with self.mutex:
            c = self.connection
            c.execute("BEGIN IMMEDIATE")
            try:
                replay = c.execute("SELECT request_hash,raw FROM receipts WHERE author=? AND key=?", (author, key)).fetchone()
                if replay:
                    if replay[0] != request_hash:
                        raise Conflict("idempotency key reused with a different body")
                    c.execute("COMMIT")
                    return bytes(replay[1])
                if c.execute("SELECT COUNT(*) FROM receipts").fetchone()[0] >= self.max_receipts:
                    raise Capacity("registry receipt quota reached")
                if c.execute("SELECT 1 FROM revocations WHERE subject IN (?,?)", (manifest["publisher"], f"{manifest['id']}@{manifest['version']}")).fetchone():
                    raise Conflict("publisher or version revoked; cannot republish")
                old = c.execute("SELECT hash FROM packages WHERE id=? AND version=?", (manifest["id"], manifest["version"])).fetchone()
                revision = c.execute("SELECT revision FROM registry_state WHERE singleton=1").fetchone()[0]
                if old and old[0] != package_hash:
                    raise Conflict("package id/version is immutable")
                if not old:
                    count, size = c.execute("SELECT COUNT(*),COALESCE(SUM(LENGTH(raw)),0) FROM packages").fetchone()
                    if count >= self.max_packages or size + len(raw) > self.max_total_bytes:
                        raise Capacity("registry package quota reached")
                    c.execute("INSERT INTO packages VALUES(?,?,?,?)", (manifest["id"], manifest["version"], package_hash, raw))
                    revision += 1
                    signed = self._new_index(revision)
                    c.execute("UPDATE registry_state SET revision=?,signed_index=? WHERE singleton=1", (revision, signed))
                receipt = canonical({"receipt_id": sha256((author + "\0" + key + "\0" + request_hash).encode()),
                                     "author": author, "id": manifest["id"], "version": manifest["version"],
                                     "hash": package_hash, "revision": revision,
                                     "status": "already_published" if old else "published"})
                c.execute("INSERT INTO receipts VALUES(?,?,?,?)", (author, key, request_hash, receipt))
                # Package bytes, signed index, revision and replay receipt commit together.
                # SQLite WAL synchronous=FULL fsyncs the durable commit before acknowledgement.
                c.execute("COMMIT")
                fsync_directory(self.root)
                return receipt
            except BaseException:
                if c.in_transaction:
                    c.execute("ROLLBACK")
                raise

    def revoke(self, author, key, envelope):
        if author not in self.authors:
            raise PermissionError("author not approved")
        if (not isinstance(key, str) or not re.fullmatch(r"[a-zA-Z0-9_.:-]{1,128}", key)
                or not isinstance(envelope, dict) or set(envelope) != {"subject"}
                or not isinstance(envelope["subject"], str) or not 1 <= len(envelope["subject"]) <= 230):
            raise RegistryError("valid revoke subject and Idempotency-Key required")
        subject = envelope["subject"]
        request_hash = sha256(canonical(envelope))
        with self.mutex:
            c = self.connection
            c.execute("BEGIN IMMEDIATE")
            try:
                if subject in self.publishers:
                    publisher = subject
                elif subject.count("@") == 1:
                    tool_id, version = subject.split("@")
                    row = c.execute("SELECT raw FROM packages WHERE id=? AND version=?", (tool_id, version)).fetchone()
                    if row is None:
                        raise RegistryError("only an existing published version can be revoked")
                    publisher = decode(row[0])["manifest"]["publisher"]
                else:
                    raise RegistryError("unknown revocation subject")
                if publisher not in self.authors[author]["publishers"]:
                    raise PermissionError("author may not revoke another publisher's subject")
                replay = c.execute("SELECT request_hash,raw FROM receipts WHERE author=? AND key=?", (author, key)).fetchone()
                if replay:
                    if replay[0] != request_hash:
                        raise Conflict("idempotency key reused with a different body")
                    c.execute("COMMIT")
                    return bytes(replay[1])
                if c.execute("SELECT COUNT(*) FROM receipts").fetchone()[0] >= self.max_receipts:
                    raise Capacity("registry receipt quota reached")
                old = c.execute("SELECT 1 FROM revocations WHERE subject=?", (subject,)).fetchone()
                revision = c.execute("SELECT revision FROM registry_state WHERE singleton=1").fetchone()[0]
                if not old:
                    if c.execute("SELECT COUNT(*) FROM revocations").fetchone()[0] >= MAX_REVOCATIONS:
                        raise Capacity("registry revocation quota reached")
                    c.execute("INSERT INTO revocations VALUES(?,?,?)", (subject, publisher, author))
                    revision += 1
                    c.execute("UPDATE registry_state SET revision=?,signed_index=? WHERE singleton=1", (revision, self._new_index(revision)))
                receipt = canonical({"receipt_id": sha256((author + "\0" + key + "\0" + request_hash).encode()),
                                     "author": author, "subject": subject, "revision": revision,
                                     "status": "already_revoked" if old else "revoked"})
                c.execute("INSERT INTO receipts VALUES(?,?,?,?)", (author, key, request_hash, receipt))
                c.execute("COMMIT")
                fsync_directory(self.root)
                return receipt
            except BaseException:
                if c.in_transaction:
                    c.execute("ROLLBACK")
                raise


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *_):
        pass  # Do not log tokens or submitted bodies.

    def respond(self, status, body):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Connection", "close")
        self.send_header("Cache-Control", "no-store")
        if self.server.service_access is not None:
            self.send_header('X-Rock-Service-Authority', self.server.service_access.authority_id)
        self.end_headers()
        self.close_connection = True
        try:
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError, ssl.SSLError):
            pass  # A committed publish is retried with the same key and receipt.

    def handle_one_request(self):
        try:
            super().handle_one_request()
        except (TimeoutError, ConnectionError, ssl.SSLError):
            self.close_connection = True

    def do_GET(self):
        try:
            if self.path == '/index.json': action = 'registry.index'
            elif re.fullmatch(r'/packages/[0-9a-f]{64}\.rock\.json', self.path): action = 'registry.package'
            else: raise FileNotFoundError()
            controller = self.server.service_access
            if controller is not None:
                if self.headers.get_all('X-Rock-Service-Authority', []) != [controller.authority_id]:
                    raise PermissionError('service authority binding rejected')
                consumers = self.headers.get_all('X-Rock-Service-Consumer', [])
                authorization = self.headers.get_all('Authorization', [])
                if len(consumers) != 1 or len(authorization) != 1:
                    raise PermissionError('one authenticated service consumer required')
                alias = controller.authenticate(consumers[0], authorization[0])
                scope = controller.guard(alias, action)
            else:
                scope = nullcontext()
            # Current purchaser admission and package-revocation admission are
            # serialized Store -> Registry. No lock is held during socket I/O.
            with scope:
                body = self.server.store.index() if action == 'registry.index' else self.server.store.package(self.path.split('/')[-1][:-10])
            self.respond(200, body)
        except PermissionError:
            self.respond(403, canonical({'error': 'current purchased-device service access required'}))
        except FileNotFoundError:
            self.respond(404, canonical({"error": "not found"}))
        except (RegistryError, ServiceConfigurationError, OSError, sqlite3.Error):
            self.respond(503, canonical({"error": "registry integrity or storage unavailable"}))

    def do_POST(self):
        try:
            if self.path not in ("/v1/publish", "/v1/revoke"):
                self.respond(404, canonical({"error": "not found"}))
                return
            author_headers = self.headers.get_all("Authorization", [])
            author = self.server.store.authenticate(author_headers[0] if len(author_headers) == 1 else None)
            lengths = self.headers.get_all("Content-Length", [])
            keys = self.headers.get_all("Idempotency-Key", [])
            if (self.headers.get("Transfer-Encoding") or len(lengths) != 1
                    or not re.fullmatch("[0-9]+", lengths[0]) or len(keys) != 1
                    or self.headers.get_content_type() != "application/json"):
                raise RegistryError("bounded JSON body and one Idempotency-Key required")
            length = int(lengths[0])
            if length > (MAX_PUBLISH_BYTES if self.path == "/v1/publish" else 4096):
                raise Capacity("publish body too large")
            raw = self.rfile.read(length)
            if len(raw) != length:
                raise RegistryError("incomplete publish body")
            operation = self.server.store.publish if self.path == "/v1/publish" else self.server.store.revoke
            receipt = operation(author, keys[0], decode(raw))
            self.respond(200, receipt)
        except PermissionError:
            self.respond(401, canonical({"error": "author authentication or publisher permission rejected"}))
        except Conflict as error:
            self.respond(409, canonical({"error": str(error)}))
        except Capacity as error:
            self.respond(413, canonical({"error": str(error)}))
        except (ValueError, TypeError, KeyError, RecursionError):
            self.respond(400, canonical({"error": "invalid package or publish request"}))
        except (OSError, sqlite3.Error):
            self.respond(503, canonical({"error": "registry storage unavailable; retry same key"}))


class RegistryServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True

    def __init__(self, address, store, certificate, fixture_key, handler=Handler, service_access=None):
        if address[0] not in ("127.0.0.1", "localhost"):
            raise RegistryError("development registry may bind IPv4 loopback only")
        self.store = store
        if store.service_access is not service_access:
            raise RegistryError('registry store and listener must share the same service authority controller')
        self.service_access = service_access
        self.context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        self.context.minimum_version = ssl.TLSVersion.TLSv1_2
        self.context.load_cert_chain(str(certificate), str(fixture_key))
        self.slots = threading.BoundedSemaphore(8)
        super().__init__(address, handler)

    def get_request(self):
        connection, address = super().get_request()
        connection.settimeout(5)
        return self.context.wrap_socket(connection, server_side=True, do_handshake_on_connect=False), address

    def process_request(self, request, client_address):
        if not self.slots.acquire(blocking=False):
            request.close()
            return
        try:
            super().process_request(request, client_address)
        except BaseException:
            self.slots.release()
            raise

    def process_request_thread(self, request, client_address):
        try:
            super().process_request_thread(request, client_address)
        finally:
            self.slots.release()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bind", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=9443)
    parser.add_argument("--state", type=Path, required=True)
    parser.add_argument("--authors", type=Path, required=True)
    parser.add_argument("--cert", type=Path, required=True)
    parser.add_argument("--fixture-key", type=Path, required=True)
    parser.add_argument("--validity-seconds", type=int, default=3600)
    args = parser.parse_args()
    os.umask(0o077)
    store = RegistryStore(args.state, args.authors, validity_seconds=args.validity_seconds)
    try:
        with RegistryServer((args.bind, args.port), store, args.cert, args.fixture_key) as server:
            print(f"ROCK_REGISTRY_READY https://{args.bind}:{server.server_port} DEVELOPMENT_PUBLIC_FIXTURES", flush=True)
            server.serve_forever(poll_interval=0.1)
    finally:
        store.close()


if __name__ == "__main__":
    main()

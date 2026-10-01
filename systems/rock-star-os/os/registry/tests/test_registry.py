"""Focused tests use real loopback TLS and public synthetic credentials only."""
from concurrent.futures import ThreadPoolExecutor
import copy
import hashlib
import http.client
import json
import os
from pathlib import Path
import socket
import ssl
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from unittest.mock import patch

from blackberryrock.hub import Hub
from blackberryrock.packages import PUBLIC_TEST_KEY, TEST_PUBLISHER, canonical
from blackberryrock.sdk import sign_development, starter
from registry.client import RegistryClient
from registry.common import (MAX_INDEX_BYTES, RegistryError, TransportError, decode,
                             sign_index, verify_index)
from registry.publish import publish
from registry.revoke import revoke
from registry.server import Handler, RegistryServer, RegistryStore
from registry.transport import HTTPSOrigin

ROOT = Path(__file__).resolve().parents[1]
PROJECT = ROOT.parents[1]
FIXTURES = ROOT / "fixtures"
CA = FIXTURES / "development-ca.pem"
TLS_KEY = FIXTURES / "PUBLIC-FIXTURE-KEY.pem"
TOKEN_FILE = FIXTURES / "PUBLIC-AUTHOR-TOKEN.txt"
TOKEN = TOKEN_FILE.read_text().strip()
AUTHOR_FILE = FIXTURES / "approved-authors.json"
ID = "org.rockstar.proposal-draft"


def fixture(tool_id=ID, version="1.0.0"):
    return PROJECT / "examples/registry" / f"{tool_id}--{version}.rock.json"


class FaultHandler(Handler):
    def respond(self, status, body):
        faults = self.server.faults
        if self.path == "/index.json" and "index_override" in faults:
            body = faults["index_override"]
        if faults.get("redirect"):
            self.send_response(302)
            self.send_header("Location", faults["redirect"])
            self.send_header("Content-Length", "0")
            self.send_header("Connection", "close")
            self.end_headers()
            self.close_connection = True
            return
        if faults.get("oversize"):
            self.send_response(200)
            self.send_header("Content-Length", str(MAX_INDEX_BYTES + 1))
            self.send_header("Connection", "close")
            self.end_headers()
            self.close_connection = True
            return
        package_request = self.path.startswith("/packages/")
        if package_request and faults.get("tamper_package"):
            body = body[:-2] + bytes([body[-2] ^ 1]) + body[-1:]
        cut = (package_request and faults.get("cut_package")) or (self.path == "/v1/publish" and faults.pop("cut_publish_once", False))
        delay = faults.get("delay", 0)
        if cut or delay:
            self.send_response(status)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Connection", "close")
            self.end_headers()
            self.wfile.flush()
            self.close_connection = True
            time.sleep(delay)
            try:
                self.wfile.write(body[:len(body)//2] if cut else body)
                self.wfile.flush()
            except (BrokenPipeError, ssl.SSLError, ConnectionError):
                pass
            return
        super().respond(status, body)


class RegistryTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.store = RegistryStore(self.root / "server", AUTHOR_FILE)
        self.server = RegistryServer(("127.0.0.1", 0), self.store, CA, TLS_KEY, FaultHandler)
        self.server.faults = {}
        self.thread = threading.Thread(target=self.server.serve_forever, kwargs={"poll_interval": 0.01}, daemon=True)
        self.thread.start()
        self.origin = f"https://127.0.0.1:{self.server.server_port}"
        self.client = RegistryClient(self.origin, CA, self.root / "cache", timeout=2)

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(2)
        self.store.close()
        self.temporary.cleanup()

    def publish(self, path=None, key="request-1"):
        return publish(self.origin, CA, TOKEN_FILE, path or fixture(), key, timeout=2)

    def raw_post(self, package, token=TOKEN, key="raw-post"):
        return HTTPSOrigin(self.origin, CA, timeout=2, attempts=1).request(
            "POST", "/v1/publish", 4096, canonical({"package": package}),
            {"Authorization": "Bearer " + token, "Idempotency-Key": key, "Content-Type": "application/json"})

    def changed_package(self):
        source = decode(fixture().read_bytes())
        source.pop("signature")
        source["manifest"]["description"] += " changed"
        result = sign_development(source)
        path = self.root / "changed.rock.json"
        path.write_bytes(canonical(result))
        return path

    def test_real_tls_sdk_publish_signed_index_download_and_offline_cache(self):
        receipt = self.publish()
        state = self.client.refresh()
        self.assertEqual(state["revision"], 1)
        self.assertEqual(len(state["catalog"]), 1)
        self.assertEqual(state["catalog"][0]["hash"], receipt["hash"])
        downloaded = self.client.download(ID, "1.0.0")
        self.assertEqual(canonical(downloaded), fixture().read_bytes())
        self.assertFalse(self.client.last_download["cache_hit"])
        self.server.shutdown()
        self.server.server_close()
        offline = RegistryClient(self.origin, CA, self.root / "cache", timeout=0.1, attempts=1)
        self.assertEqual(offline.catalog(), state["catalog"])
        self.assertEqual(offline.download(ID, "1.0.0"), downloaded)
        self.assertTrue(offline.last_download["cache_hit"])
        with self.assertRaises(TransportError):
            offline.refresh()
        self.assertEqual(offline.catalog(), state["catalog"])

    def test_authenticated_approved_author_only_and_package_tamper_denied(self):
        body = decode(fixture().read_bytes())
        for token in ("wrong-author-token-at-least-sixteen", ""):
            with self.assertRaisesRegex(RegistryError, "401"):
                self.raw_post(body, token=token)
        tampered = copy.deepcopy(body)
        tampered["manifest"]["name"] += "!"
        with self.assertRaisesRegex(RegistryError, "400"):
            self.raw_post(tampered)
        self.store.authors["development-author"]["publishers"] = []
        with self.assertRaisesRegex(RegistryError, "401"):
            self.raw_post(body)
        self.assertEqual(decode(self.store.index())["revision"], 0)

    def test_same_key_same_body_same_receipt_concurrent_and_after_restart(self):
        with ThreadPoolExecutor(max_workers=4) as pool:
            receipts = list(pool.map(lambda _: self.publish(), range(4)))
        self.assertTrue(all(r == receipts[0] for r in receipts))
        self.assertEqual(decode(self.store.index())["revision"], 1)
        self.assertEqual(self.store.connection.execute("SELECT COUNT(*) FROM receipts").fetchone()[0], 1)
        self.store.close()
        self.store = RegistryStore(self.root / "server", AUTHOR_FILE)
        self.server.store = self.store
        self.assertEqual(self.publish(), receipts[0])
        self.assertEqual(self.store.connection.execute("PRAGMA synchronous").fetchone()[0], 2)

    def test_conflicting_key_and_immutable_version_rejected_without_revision_change(self):
        self.publish()
        changed = self.changed_package()
        for key in ("request-1", "different-key"):
            with self.assertRaisesRegex(RegistryError, "409"):
                self.publish(changed, key)
        self.assertEqual(decode(self.store.index())["revision"], 1)
        repeated = self.publish(key="same-content-new-key")
        self.assertEqual(repeated["status"], "already_published")
        self.assertEqual(repeated["revision"], 1)

    def test_package_count_bytes_and_receipt_quotas_rollback_atomically(self):
        self.store.max_total_bytes = 1
        with self.assertRaisesRegex(RegistryError, "413"):
            self.publish()
        self.assertEqual(decode(self.store.index())["revision"], 0)
        self.assertEqual(self.store.connection.execute("SELECT COUNT(*) FROM packages").fetchone()[0], 0)
        self.store.max_total_bytes = 8 * 1024 * 1024
        self.store.max_packages = 1
        self.publish()
        with self.assertRaisesRegex(RegistryError, "413"):
            self.publish(fixture(version="1.1.0"), "second")
        self.store.max_receipts = 1
        self.assertEqual(self.publish()["revision"], 1)
        with self.assertRaisesRegex(RegistryError, "413"):
            self.publish(key="new-receipt")

    def test_sign_failure_leaves_no_package_index_or_receipt_half_commit(self):
        with patch("registry.server.sign_index", side_effect=OSError("synthetic signer interruption")):
            with self.assertRaisesRegex(RegistryError, "503"):
                self.publish()
        for table in ("packages", "receipts"):
            self.assertEqual(self.store.connection.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0], 0)
        self.assertEqual(decode(self.store.index())["revision"], 0)
        self.assertEqual(self.publish()["revision"], 1)

    def test_lost_publish_response_retry_has_one_commit_and_same_receipt(self):
        self.server.faults["cut_publish_once"] = True
        receipt = self.publish()
        self.assertEqual(self.publish(), receipt)
        self.assertEqual(decode(self.store.index())["revision"], 1)
        self.assertEqual(self.store.connection.execute("SELECT COUNT(*) FROM receipts").fetchone()[0], 1)

    def test_partial_download_never_enters_cache_and_retry_downloads_complete_package(self):
        self.publish()
        self.client.refresh()
        self.server.faults["cut_package"] = True
        with self.assertRaises(TransportError):
            self.client.download(ID, "1.0.0")
        self.assertEqual(list(self.client.package_dir.iterdir()), [])
        self.assertIsNone(self.client.last_download)
        self.server.faults.clear()
        self.assertEqual(self.client.download(ID, "1.0.0"), decode(fixture().read_bytes()))
        self.assertEqual(len(list(self.client.package_dir.iterdir())), 1)

    def test_index_and_package_tamper_rejected_and_valid_cache_retained(self):
        self.publish()
        good = self.client.refresh()
        tampered = decode(self.store.index())
        tampered["revision"] += 1
        self.server.faults["index_override"] = canonical(tampered)
        with self.assertRaisesRegex(RegistryError, "signature"):
            self.client.refresh()
        self.assertEqual(self.client.catalog(), good["catalog"])
        self.server.faults = {"tamper_package": True}
        with self.assertRaisesRegex(RegistryError, "SHA-256"):
            self.client.download(ID, "1.0.0")
        self.assertEqual(list(self.client.package_dir.iterdir()), [])

    def test_older_index_and_same_revision_equivocation_rejected_after_restart(self):
        self.publish()
        self.client.refresh()
        older = self.store.index()
        self.publish(fixture(version="1.1.0"), "v2")
        current = self.client.refresh()
        restarted = RegistryClient(self.origin, CA, self.root / "cache")
        self.server.faults["index_override"] = older
        with self.assertRaisesRegex(RegistryError, "rollback"):
            restarted.refresh()
        equivocation = decode(self.store.index())
        equivocation.pop("signature")
        equivocation["packages"][0]["manifest"]["name"] += "!"
        self.server.faults["index_override"] = canonical(sign_index(equivocation))
        with self.assertRaisesRegex(RegistryError, "equivocation"):
            restarted.refresh()
        self.assertEqual(restarted.catalog(), current["catalog"])

    def test_newer_index_cannot_remove_or_rewrite_a_known_immutable_version(self):
        self.publish()
        self.client.refresh()
        removed = decode(self.store.index())
        removed.pop("signature")
        removed["revision"] += 1
        removed["packages"] = []
        self.server.faults["index_override"] = canonical(sign_index(removed))
        with self.assertRaisesRegex(RegistryError, "append-only"):
            self.client.refresh()

    def test_redirect_body_limit_and_timeout_have_no_cache_commit(self):
        for faults, message in (({"redirect": "https://example.invalid/leak"}, "redirect"),
                                ({"oversize": True}, "byte limit")):
            self.server.faults = faults
            with self.assertRaisesRegex(RegistryError, message):
                self.client.refresh()
            self.assertFalse(self.client.state_file.exists())
        self.server.faults = {"delay": 0.3}
        bounded = RegistryClient(self.origin, CA, self.root / "timeout-cache", timeout=0.05, attempts=1)
        start = time.monotonic()
        with self.assertRaises(TransportError):
            bounded.refresh()
        self.assertLess(time.monotonic() - start, 1)
        self.assertFalse(bounded.state_file.exists())
        time.sleep(0.35)

    def test_explicit_ca_hostname_and_origin_binding_are_enforced(self):
        unrelated = ssl.create_default_context().get_ca_certs(binary_form=True)[0]
        bad_ca = self.root / "unrelated-ca.pem"
        bad_ca.write_text(ssl.DER_cert_to_PEM_cert(unrelated))
        untrusted = RegistryClient(self.origin, bad_ca, self.root / "bad-ca")
        with self.assertRaisesRegex(RegistryError, "TLS"):
            untrusted.refresh()
        wrong_host = RegistryClient(f"https://wrong.example.test:{self.server.server_port}", CA, self.root / "wrong-host")
        address = socket.getaddrinfo("127.0.0.1", self.server.server_port, type=socket.SOCK_STREAM)
        with patch("socket.getaddrinfo", return_value=address), self.assertRaisesRegex(RegistryError, "TLS"):
            wrong_host.refresh()
        self.client.refresh()
        different = RegistryClient(f"https://localhost:{self.server.server_port}", CA, self.root / "cache")
        with self.assertRaisesRegex(RegistryError, "origin"):
            different.catalog()

    def test_malicious_origins_indexes_and_cache_files_are_not_used(self):
        for origin in ("http://127.0.0.1", "https://user:pass@127.0.0.1", "https://127.0.0.1/path", "https://127.0.0.1#fragment"):
            with self.assertRaises(RegistryError):
                RegistryClient(origin, CA, self.root / "invalid")
        minimum = RegistryClient(self.origin, CA, self.root / "minimum", minimum_revision=1)
        with self.assertRaisesRegex(RegistryError, "rollback"):
            minimum.refresh()
        self.publish()
        self.client.refresh()
        self.client.download(ID, "1.0.0")
        cached = next(self.client.package_dir.iterdir())
        cached.write_bytes(b"corrupt")
        with self.assertRaisesRegex(RegistryError, "mismatch"):
            self.client.download(ID, "1.0.0")
        self.client.state_file.write_text('{"untrusted":true}')
        with self.assertRaises(RegistryError):
            self.client.catalog()

    def test_signed_metadata_cannot_substitute_manifest_or_untrusted_publisher(self):
        self.publish()
        mismatch = decode(self.store.index())
        mismatch.pop("signature")
        mismatch["packages"][0]["manifest"]["name"] += " (different signed index name)"
        self.server.faults["index_override"] = canonical(sign_index(mismatch))
        self.client.refresh()
        with self.assertRaisesRegex(RegistryError, "manifest"):
            self.client.download(ID, "1.0.0")
        self.assertEqual(list(self.client.package_dir.iterdir()), [])
        with self.assertRaisesRegex(RegistryError, "untrusted publisher"):
            verify_index(decode(self.store.index()), publishers={})

    def test_fixture_certificate_has_required_sans_and_loopback_bind_only(self):
        result = subprocess.run(["openssl", "x509", "-in", str(CA), "-noout", "-ext", "subjectAltName"],
                                capture_output=True, check=True, text=True)
        for name in ("DNS:localhost", "IP Address:127.0.0.1", "IP Address:10.0.2.2"):
            self.assertIn(name, result.stdout)
        with self.assertRaisesRegex(RegistryError, "loopback"):
            RegistryServer(("0.0.0.0", 0), self.store, CA, TLS_KEY)

    def test_sdk_cli_uses_real_authenticated_tls_and_stable_receipt(self):
        environment = {**os.environ, "PYTHONPATH": str(PROJECT / "src") + os.pathsep + str(PROJECT / "os")}
        command = [sys.executable, "-B", "-m", "registry.publish", str(fixture()), "--origin", self.origin,
                   "--ca", str(CA), "--token-file", str(TOKEN_FILE), "--key", "sdk-cli-retry"]
        first = subprocess.run(command, capture_output=True, text=True, timeout=5, env=environment, check=True)
        second = subprocess.run(command, capture_output=True, text=True, timeout=5, env=environment, check=True)
        self.assertEqual(json.loads(first.stdout), json.loads(second.stdout))
        self.assertNotIn(TOKEN, first.stdout + first.stderr)

    def test_partial_publish_body_and_oversize_header_never_commit(self):
        transport = HTTPSOrigin(self.origin, CA, timeout=2, attempts=1)
        with self.assertRaisesRegex(RegistryError, "413"):
            transport.request("POST", "/v1/publish", 4096, b"", {"Authorization": "Bearer " + TOKEN,
                              "Content-Type": "application/json", "Idempotency-Key": "oversize-body",
                              "Content-Length": str(1024 * 1024)})
        body = canonical({"package": decode(fixture().read_bytes())})
        connection = http.client.HTTPSConnection("127.0.0.1", self.server.server_port, context=transport.context, timeout=2)
        connection.connect()
        connection.putrequest("POST", "/v1/publish")
        for name, value in (("Authorization", "Bearer " + TOKEN), ("Content-Type", "application/json"),
                            ("Idempotency-Key", "partial-upload"), ("Content-Length", str(len(body)))):
            connection.putheader(name, value)
        connection.endheaders()
        connection.send(body[:100])
        connection.sock.shutdown(socket.SHUT_RDWR)
        connection.close()
        time.sleep(0.05)
        self.assertEqual(decode(self.store.index())["revision"], 0)
        self.assertEqual(self.store.connection.execute("SELECT COUNT(*) FROM receipts").fetchone()[0], 0)

    def test_cache_write_failure_keeps_prior_index_and_leaves_no_partial_package(self):
        self.publish()
        original = self.client.refresh()
        self.publish(fixture(version="1.1.0"), "next-version")
        with patch("registry.common.os.fsync", side_effect=OSError("synthetic disk failure")):
            with self.assertRaises(OSError):
                self.client.refresh()
        self.assertEqual(self.client.catalog(), original["catalog"])
        with patch("registry.common.os.replace", side_effect=OSError("synthetic rename failure")):
            with self.assertRaises(OSError):
                self.client.download(ID, "1.0.0")
        self.assertEqual(list(self.client.package_dir.iterdir()), [])
        self.assertFalse(list(self.client.cache_dir.glob(".registry-part-*")))

    def test_post_commit_sync_failure_recovers_with_same_receipt_without_double_publish(self):
        with patch("registry.server.fsync_directory", side_effect=OSError("synthetic acknowledgement failure")):
            with self.assertRaisesRegex(RegistryError, "503"):
                self.publish()
        self.assertEqual(decode(self.store.index())["revision"], 1)
        receipt = self.publish()
        self.assertEqual(receipt["revision"], 1)
        self.assertEqual(self.store.connection.execute("SELECT COUNT(*) FROM packages").fetchone()[0], 1)
        self.assertEqual(self.store.connection.execute("SELECT COUNT(*) FROM receipts").fetchone()[0], 1)

    def test_first_index_expiry_future_clock_skew_and_validity_bounds(self):
        now = int(time.time())
        base = decode(self.store.index())
        base.pop("signature")
        cases = [(now - 30, now, "expired"), (now + 31, now + 61, "clock skew"),
                 (now, now + 86401, "validity"), (now, now, "validity")]
        for number, (issued, expires, message) in enumerate(cases):
            self.server.faults["index_override"] = canonical(sign_index({**base, "issued_at": issued, "expires_at": expires}))
            client = RegistryClient(self.origin, CA, self.root / f"time-{number}", clock=lambda: now)
            with self.assertRaisesRegex(RegistryError, message):
                client.refresh()
            self.assertFalse(client.state_file.exists())
        self.server.faults["index_override"] = canonical(sign_index({**base, "issued_at": now + 30, "expires_at": now + 60}))
        allowed = RegistryClient(self.origin, CA, self.root / "allowed-skew", clock=lambda: now)
        self.assertEqual(allowed.refresh()["issued_at"], now + 30)
        with self.assertRaisesRegex(RegistryError, "skew"):
            RegistryClient(self.origin, CA, self.root / "bad-skew", clock_skew_seconds=301)
        for validity in (29, 86401, True):
            with self.assertRaisesRegex(RegistryError, "validity"):
                RegistryStore(self.root / f"bad-validity-{validity}", AUTHOR_FILE, validity_seconds=validity)

    def test_expiry_blocks_new_cached_install_but_installed_hub_tool_still_runs_offline(self):
        tool_id = "org.rockstar.utf8-sha256"
        self.publish(fixture(tool_id), "hash-tool")
        fresh = self.client.refresh()
        downloaded = self.client.download(tool_id, "1.0.0")
        hub = Hub(self.root / "already-installed.db", {TEST_PUBLISHER: PUBLIC_TEST_KEY})
        installed = hub.install(downloaded)
        hub.enable(tool_id, installed["hash"])
        self.client.clock = lambda: fresh["expires_at"]
        self.assertFalse(self.client.verified_state()["fresh"])
        self.assertEqual(len(self.client.catalog()), 1)
        with self.assertRaisesRegex(RegistryError, "expired"):
            self.client.download(tool_id, "1.0.0")
        job = hub.run(tool_id, "abc", "offline-already-installed")
        deadline = time.monotonic() + 4
        while time.monotonic() < deadline:
            result = hub.job(job["id"])
            if result["status"] != "running" and job["id"] not in hub.processes:
                break
            time.sleep(0.01)
        self.assertEqual(result["status"], "succeeded")
        self.assertEqual(json.loads(result["output"])["byte_length"], 3)

    def test_server_renews_expiring_index_with_a_higher_revision(self):
        now = int(time.time())
        self.store.validity_seconds = 30
        self.store.clock = lambda: now
        self.client.clock = lambda: now
        self.publish()
        before = self.client.refresh()
        self.store.clock = lambda: now + 24
        self.client.clock = lambda: now + 24
        after = self.client.refresh()
        self.assertGreater(after["revision"], before["revision"])
        self.assertEqual(after["catalog"], before["catalog"])
        self.assertEqual(after["issued_at"], now + 24)
        self.assertEqual(after["expires_at"], now + 54)

    def test_signed_version_and_publisher_revocations_are_persistent_and_immutable(self):
        self.publish()
        self.publish(fixture(version="1.1.0"), "v2")
        self.client.refresh()
        self.client.download(ID, "1.0.0")
        subject = ID + "@1.0.0"
        receipt = revoke(self.origin, CA, TOKEN_FILE, subject, "revoke-v1")
        self.assertEqual(revoke(self.origin, CA, TOKEN_FILE, subject, "revoke-v1"), receipt)
        with self.assertRaisesRegex(RegistryError, "409"):
            revoke(self.origin, CA, TOKEN_FILE, TEST_PUBLISHER, "revoke-v1")
        state = self.client.refresh()
        self.assertEqual(self.client.revocations(), [subject])
        self.assertEqual(len(state["catalog"]), 1)
        self.assertEqual(len(decode(self.store.index())["packages"]), 2)
        with self.assertRaisesRegex(RegistryError, "revoked"):
            self.client.download(ID, "1.0.0")
        self.client.download(ID, "1.1.0")
        with self.assertRaisesRegex(RegistryError, "409"):
            self.publish(key="republish-revoked")
        revoke(self.origin, CA, TOKEN_FILE, TEST_PUBLISHER, "revoke-publisher")
        final = self.client.refresh()
        self.assertEqual(final["catalog"], [])
        with self.assertRaisesRegex(RegistryError, "revoked"):
            self.client.download(ID, "1.1.0")
        restarted = RegistryClient(self.origin, CA, self.root / "cache", clock=lambda: final["expires_at"] + 1)
        self.assertEqual(set(restarted.revocations()), {subject, TEST_PUBLISHER})
        self.assertFalse(restarted.verified_state()["fresh"])
        self.assertEqual(self.store.connection.execute("SELECT COUNT(*) FROM revocations").fetchone()[0], 2)

    def test_later_signed_index_cannot_remove_known_revocations(self):
        self.publish()
        revoke(self.origin, CA, TOKEN_FILE, ID + "@1.0.0", "revoke-first")
        self.client.refresh()
        removal = decode(self.store.index())
        removal.pop("signature")
        removal["revision"] += 1
        removal["revocations"] = []
        self.server.faults["index_override"] = canonical(sign_index(removal))
        with self.assertRaisesRegex(RegistryError, "revocations cannot be removed"):
            self.client.refresh()
        self.assertEqual(self.client.revocations(), [ID + "@1.0.0"])

    def test_author_cannot_revoke_another_publishers_package_or_publisher(self):
        other = "org.other.publisher"
        token = "PUBLIC-OTHER-AUTHOR-TOKEN-NOT-SECRET"
        token_file = self.root / "other-public-token.txt"
        token_file.write_text(token)
        self.store.publishers[other] = PUBLIC_TEST_KEY
        self.store.authors["other-author"] = {"token_sha256": hashlib.sha256(token.encode()).hexdigest(), "publishers": [other]}
        with patch("blackberryrock.sdk.TEST_PUBLISHER", other):
            signed = sign_development(starter(tool_id="org.other.tool"))
        self.raw_post(signed, token=token, key="other-publish")
        for subject in (other, "org.other.tool@1.0.0"):
            with self.assertRaisesRegex(RegistryError, "401"):
                revoke(self.origin, CA, TOKEN_FILE, subject, "not-yours-" + subject.replace("@", ":"))
        self.assertEqual(revoke(self.origin, CA, token_file, "org.other.tool@1.0.0", "own-version")["status"], "revoked")
        with self.assertRaisesRegex(RegistryError, "400"):
            revoke(self.origin, CA, TOKEN_FILE, "org.unknown.tool@1.0.0", "unknown-subject")

    def test_inflight_download_does_not_commit_after_a_verified_revocation(self):
        self.publish()
        self.client.refresh()
        original = self.client.transport.request
        def revoked_during_download(method, path, *args, **kwargs):
            body = original(method, path, *args, **kwargs)
            if path.startswith("/packages/"):
                revoke(self.origin, CA, TOKEN_FILE, ID + "@1.0.0", "inflight-revoke")
                self.client.refresh()
            return body
        with patch.object(self.client.transport, "request", side_effect=revoked_during_download):
            with self.assertRaisesRegex(RegistryError, "revoked"):
                self.client.download(ID, "1.0.0")
        self.assertEqual(list(self.client.package_dir.iterdir()), [])
        self.assertIsNone(self.client.last_download)

    def test_interrupted_revocation_signing_rolls_back_all_state(self):
        self.publish()
        before = self.store.index()
        with patch("registry.server.sign_index", side_effect=OSError("interrupted revocation signing")):
            with self.assertRaisesRegex(RegistryError, "503"):
                revoke(self.origin, CA, TOKEN_FILE, ID + "@1.0.0", "retry-revoke")
        self.assertEqual(self.store.index(), before)
        self.assertEqual(self.store.connection.execute("SELECT COUNT(*) FROM revocations").fetchone()[0], 0)
        self.assertEqual(revoke(self.origin, CA, TOKEN_FILE, ID + "@1.0.0", "retry-revoke")["status"], "revoked")


if __name__ == "__main__":
    unittest.main()

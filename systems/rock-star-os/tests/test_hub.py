"""Host runtime acceptance tests. All signatures use PUBLIC RFC 8032 fixtures.

These fixtures provide no production publisher trust, OS boot, or device proof.
"""
import copy
import io
import json
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest.mock import patch

from blackberryrock.hub import Hub
from blackberryrock.packages import (
    MAX_PACKAGE_BYTES, PUBLIC_TEST_KEY, TEST_PUBLISHER, PackageError,
    canonical, digest, validate_recipe, verify_package,
)
from blackberryrock.sdk import main as sdk_main, sign_development, starter


REGISTRY = Path(__file__).resolve().parents[1] / "examples/registry"
TRUST = {TEST_PUBLISHER: PUBLIC_TEST_KEY}


def fixture(version="1.0.0"):
    return json.loads((REGISTRY / f"org.rockstar.text-tidy--{version}.rock.json").read_text())


def wait_for(predicate, timeout=5):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        value = predicate()
        if value:
            return value
        time.sleep(0.01)
    raise AssertionError("timed out waiting for bounded host operation")


class PackageTrustTest(unittest.TestCase):
    def test_public_fixture_signature_and_sdk_roundtrip(self):
        with tempfile.TemporaryDirectory() as temp, redirect_stdout(io.StringIO()):
            root = Path(temp)
            source, built, registry = root / "source.json", root / "tool.rock.json", root / "registry"
            self.assertEqual(sdk_main(["new", str(source), "--id", "org.example.fixture-tool"]), 0)
            self.assertEqual(sdk_main(["build-dev", str(source), str(built)]), 0)
            self.assertEqual(sdk_main(["check", str(built)]), 0)
            package = json.loads(built.read_text())
            manifest, sha = verify_package(package, TRUST)
            self.assertEqual(manifest["id"], "org.example.fixture-tool")
            self.assertEqual(manifest["publisher"], TEST_PUBLISHER)
            self.assertEqual(sha, digest(package))
            self.assertEqual(sdk_main(["publish-local", str(built), str(registry)]), 0)
            published = registry / "org.example.fixture-tool--1.0.0.rock.json"
            self.assertEqual(json.loads(published.read_text()), package)
            with self.assertRaises(FileExistsError):
                sdk_main(["publish-local", str(built), str(registry)])

    def test_signature_tamper_untrusted_and_revocation_rejected(self):
        package = fixture()
        cases = []
        tampered = copy.deepcopy(package)
        tampered["manifest"]["name"] = "Changed signed metadata"
        cases.append((tampered, TRUST, set()))
        changed_recipe = copy.deepcopy(package)
        changed_recipe["recipe"] = [{"op": "sort_lines"}]
        cases.append((changed_recipe, TRUST, set()))
        for signature in ("00" * 64, "invalid", None):
            broken = copy.deepcopy(package)
            broken["signature"] = signature
            cases.append((broken, TRUST, set()))
        cases.extend([
            (package, {}, set()),
            (package, TRUST, {TEST_PUBLISHER}),
            (package, TRUST, {"org.rockstar.text-tidy@1.0.0"}),
        ])
        for index, (candidate, trust, revoked) in enumerate(cases):
            with self.subTest(index=index), self.assertRaises(PackageError):
                verify_package(candidate, trust, revoked)

    def test_unknown_permissions_runtime_destinations_and_limits_rejected(self):
        for field, value in [
            ("permissions", ["text.input", "text.output", "shell.execute"]),
            ("runtime", "python"), ("execution_targets", ["cloud"]),
            ("data", {"input": "user_supplied_text", "destinations": ["https://example.invalid"]}),
            ("resources", {"input_bytes": 999999}),
            ("version", "latest"), ("id", "../../escape"),
        ]:
            candidate = fixture()
            candidate["manifest"][field] = value
            with self.subTest(field=field), self.assertRaises(PackageError):
                verify_package(candidate, TRUST)
        oversized = fixture()
        oversized["manifest"]["description"] = "x" * MAX_PACKAGE_BYTES
        with self.assertRaises(PackageError):
            verify_package(oversized, TRUST)

    def test_recipe_rejects_code_paths_and_unbounded_arguments(self):
        for recipe in (
            [], [{"op": "shell", "command": "true"}],
            [{"op": "read_file", "path": "/etc/passwd"}],
            [{"op": "trim_lines", "extra": "field"}],
            [{"op": "prefix_lines", "value": "x" * 129}],
            [{"op": "replace_literal", "old": "", "new": "x"}],
            [{"op": "trim_lines"}] * 17,
        ):
            with self.subTest(recipe=recipe), self.assertRaises(PackageError):
                validate_recipe(recipe)


class HubRuntimeTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.path = Path(self.temp.name) / "hub.db"
        self.hub = Hub(self.path, TRUST)
        self.package = fixture()
        self.tool_id = self.package["manifest"]["id"]

    def tearDown(self):
        for job in self.hub.state()["jobs"]:
            if job["status"] == "running":
                self.hub.cancel(job["id"])
        wait_for(lambda: not self.hub.processes)
        self.temp.cleanup()

    def install_enable(self, package=None):
        receipt = self.hub.install(package or self.package)
        self.hub.enable(receipt["id"], receipt["hash"])
        return receipt

    def finished(self, job):
        def read_finished():
            current = self.hub.job(job["id"])
            return current if current["status"] != "running" else None
        return wait_for(read_finished)

    def test_install_approval_run_update_rollback_uninstall_preserves_receipts(self):
        installed = self.hub.install(self.package)
        with self.assertRaises(PackageError):
            self.hub.run(self.tool_id, "text", "disabled")
        with self.assertRaises(PackageError):
            self.hub.enable(self.tool_id, "0" * 64)
        self.hub.enable(self.tool_id, installed["hash"])
        text = "  A，B  \n\n\n C "
        first = self.finished(self.hub.run(self.tool_id, text, "first"))
        self.assertEqual((first["status"], first["output"]), ("succeeded", "A，B\n\nC"))
        self.assertEqual(first["package_hash"], installed["hash"])
        updated = self.hub.install(fixture("2.0.0"))
        self.assertFalse(self.hub.state()["installed"][0]["enabled"])
        with self.assertRaises(PackageError):
            self.hub.enable(self.tool_id, installed["hash"])
        self.hub.enable(self.tool_id, updated["hash"])
        second = self.finished(self.hub.run(self.tool_id, text, "second"))
        self.assertEqual(second["output"], "A、B\n\nC")
        self.hub.lifecycle(self.tool_id, "rollback", "1.0.0")
        with self.assertRaises(PackageError):
            self.hub.run(self.tool_id, text, "rollback-unapproved")
        self.hub.enable(self.tool_id, installed["hash"])
        restored = self.finished(self.hub.run(self.tool_id, text, "restored"))
        self.assertEqual(restored["output"], first["output"])
        self.hub.lifecycle(self.tool_id, "uninstall")
        reopened = Hub(self.path, TRUST)
        state = reopened.state()
        self.assertEqual(state["installed"], [])
        self.assertEqual(len(state["jobs"]), 3)
        self.assertTrue(all(j["status"] == "succeeded" for j in state["jobs"]))
        self.assertIn("uninstall", {a["event"] for a in state["audit"]})
        self.assertEqual(reopened.job(first["id"])["package_hash"], installed["hash"])

    def test_immutable_version_and_revoked_cached_rollback(self):
        self.install_enable()
        modified = starter(recipe=[{"op": "sort_lines"}])
        signed = sign_development(modified)
        with self.assertRaisesRegex(PackageError, "immutable"):
            self.hub.install(signed)
        self.assertEqual(self.hub.state()["installed"][0]["hash"], digest(self.package))
        self.install_enable(fixture("2.0.0"))
        self.hub.revoke(f"{self.tool_id}@1.0.0")
        with self.assertRaisesRegex(PackageError, "revoked"):
            self.hub.lifecycle(self.tool_id, "rollback", "1.0.0")
        self.hub.revoke(TEST_PUBLISHER)
        self.assertFalse(self.hub.state()["installed"][0]["enabled"])
        with self.assertRaises(PackageError):
            self.hub.run(self.tool_id, "text", "revoked")
        with self.assertRaises(PackageError):
            self.hub.install(self.package)

    def test_duplicate_request_no_second_work_and_conflicting_retry_rejected(self):
        self.install_enable()
        first = self.finished(self.hub.run(self.tool_id, "  same  ", "key"))
        replay = self.hub.run(self.tool_id, "  same  ", "key")
        self.assertEqual(replay, first)
        for text, target in (("different", "device_local"), ("  same  ", "auto")):
            with self.assertRaisesRegex(PackageError, "idempotency conflict"):
                self.hub.run(self.tool_id, text, "key", target)
        self.assertEqual(len(self.hub.state()["jobs"]), 1)

    def test_multibyte_input_limit_and_unavailable_modes(self):
        self.install_enable()
        at_limit = "é" * 32768
        result = self.finished(self.hub.run(self.tool_id, at_limit, "boundary"))
        self.assertEqual(result["input_bytes"], 65536)
        self.assertEqual(result["output"], at_limit)
        for text, key, target in ((at_limit + "é", "too-big", "device_local"), (None, "invalid", "device_local"), ("x", "", "device_local"), ("x", "k" * 129, "device_local"), ("x", "cloud", "cloud"), ("x", "usb", "pc_usb")):
            with self.subTest(target=target, key=key[:10]), self.assertRaises(PackageError):
                self.hub.run(self.tool_id, text, key, target)
        self.assertEqual(len(self.hub.state()["jobs"]), 1)

    def test_real_worker_enforces_output_limit(self):
        package = sign_development(starter(recipe=[{"op": "replace_literal", "old": "x", "new": "xxxx"}]))
        self.install_enable(package)
        job = self.finished(self.hub.run(self.tool_id, "x" * 40000, "expand"))
        self.assertEqual(job["status"], "failed")
        self.assertIsNone(job["output"])
        self.assertIn("output exceeds", job["error"])

    def test_json_escaped_input_at_byte_limit_is_not_truncated(self):
        self.install_enable()
        text = "\x00" * 65536
        result = self.finished(self.hub.run(self.tool_id, text, "escaped-boundary"))
        self.assertEqual((result["status"], result["output"]), ("succeeded", text))

    def test_cancel_kills_actual_child_and_never_adopts_late_output(self):
        self.install_enable()
        original_popen = subprocess.Popen
        def controlled_worker(command, *args, **kwargs):
            if isinstance(command, list) and any(str(x).endswith("recipe_worker.py") for x in command):
                command = [sys.executable, "-I", "-c", "import sys,time;sys.stdin.buffer.read();time.sleep(10);print('{\"text\":\"late\"}')"]
            return original_popen(command, *args, **kwargs)
        with patch("blackberryrock.hub.subprocess.Popen", side_effect=controlled_worker):
            job = self.hub.run(self.tool_id, "example", "cancel")
            process = wait_for(lambda: self.hub.processes.get(job["id"]))
            cancelled = self.hub.cancel(job["id"])
            self.assertEqual(cancelled["status"], "cancelled")
            wait_for(lambda: process.poll() is not None)
            wait_for(lambda: job["id"] not in self.hub.processes)
        self.assertEqual(self.hub.job(job["id"])["status"], "cancelled")
        self.assertIsNone(self.hub.job(job["id"])["output"])

    def test_close_kills_owned_child_and_fences_original_request(self):
        self.install_enable()
        original_popen = subprocess.Popen

        def controlled_worker(command, *args, **kwargs):
            if isinstance(command, list) and any(str(x).endswith("recipe_worker.py") for x in command):
                command = [sys.executable, "-I", "-c", "import sys,time;sys.stdin.buffer.read();time.sleep(10)"]
            return original_popen(command, *args, **kwargs)

        with patch("blackberryrock.hub.subprocess.Popen", side_effect=controlled_worker):
            job = self.hub.run(self.tool_id, "example", "stop-during-work")
            process = wait_for(lambda: self.hub.processes.get(job["id"]))
            self.hub.close()
            self.assertIsNotNone(process.poll())

        reopened = Hub(self.path, TRUST)
        stopped = reopened.job(job["id"])
        self.assertEqual(stopped["status"], "interrupted")
        self.assertIn("explicit retry", stopped["error"])
        self.assertEqual(reopened.run(self.tool_id, "example", "stop-during-work"), stopped)

    def test_capacity_rejection_and_cancel_before_worker_launch(self):
        self.install_enable()
        release = threading.Event()
        done = []
        original = self.hub._execute
        def delayed(*args):
            release.wait(5)
            try:
                original(*args)
            finally:
                done.append(args[0])
        jobs = []
        try:
            with patch.object(self.hub, "_execute", side_effect=delayed):
                jobs = [self.hub.run(self.tool_id, str(i), f"capacity-{i}") for i in range(4)]
                with self.assertRaisesRegex(PackageError, "capacity"):
                    self.hub.run(self.tool_id, "fifth", "capacity-5")
                for job in jobs:
                    self.hub.cancel(job["id"])
        finally:
            release.set()
            wait_for(lambda: len(done) == len(jobs))
        self.assertEqual(len(self.hub.state()["jobs"]), 4)
        self.assertTrue(all(j["status"] == "cancelled" for j in self.hub.state()["jobs"]))
        self.assertEqual(self.finished(self.hub.run(self.tool_id, "new", "after-capacity"))["status"], "succeeded")

    def test_restart_marks_unfinished_job_interrupted_and_allows_explicit_retry(self):
        self.install_enable()
        with patch.object(self.hub, "_execute", return_value=None):
            before = self.hub.run(self.tool_id, " restart ", "before-restart")
        self.hub = Hub(self.path, TRUST)
        self.assertEqual(self.hub.job(before["id"])["status"], "interrupted")
        replay = self.hub.run(self.tool_id, " restart ", "before-restart")
        self.assertEqual(replay["status"], "interrupted")
        retried = self.finished(self.hub.run(self.tool_id, " restart ", "explicit-new-retry"))
        self.assertEqual(retried["output"], "restart")
        self.assertNotEqual(before["id"], retried["id"])

    def test_backup_restores_installed_packages_and_completed_receipt(self):
        self.install_enable()
        before = self.finished(self.hub.run(self.tool_id, "  preserved  ", "backup"))
        destination = Path(self.temp.name) / "backup.db"
        self.hub.backup(destination)
        self.hub.lifecycle(self.tool_id, "uninstall")
        restored = Hub(destination, TRUST)
        self.assertEqual(restored.job(before["id"]), before)
        self.assertTrue(restored.state()["installed"][0]["enabled"])
        self.assertEqual(restored.state()["installed"][0]["hash"], digest(self.package))
        with self.assertRaises(ValueError):
            restored.backup(destination)

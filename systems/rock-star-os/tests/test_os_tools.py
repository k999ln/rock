"""Pure Tool boundaries and signed-package lifecycle on the host, not guest proof."""
import copy
import hashlib
import json
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path

from blackberryrock.hub import Hub
from blackberryrock.packages import PUBLIC_TEST_KEY, TEST_PUBLISHER, PackageError, canonical, digest, validate_recipe, verify_package
from blackberryrock.recipe_worker import transform
from blackberryrock.sdk import sign_development

ROOT = Path(__file__).resolve().parents[1]
TOOLS = ROOT / "os/tools"
TRUST = {TEST_PUBLISHER: PUBLIC_TEST_KEY}
IDS = ("org.rockstar.proposal-draft", "org.rockstar.citation-organizer", "org.rockstar.utf8-sha256")
PROPOSAL = {"title": "記事の下書き", "requirements": ["日本語"], "deliverables": ["原稿"]}


def package(tool_id, version="1.0.0"):
    return json.loads((ROOT / "examples/registry" / f"{tool_id}--{version}.rock.json").read_text())


def run_proposal(value, style="standard"):
    text = json.dumps(value, ensure_ascii=False) if not isinstance(value, str) else value
    return json.loads(transform(text, [{"op": "proposal_draft", "format": style}]))


class PureToolBoundaryTest(unittest.TestCase):
    def test_proposal_uses_real_input_and_retains_draft_state(self):
        value = {**PROPOSAL, "deadline": "金曜日", "price": "50 USD"}
        standard, concise = run_proposal(value), run_proposal(value, "concise")
        for result in (standard, concise):
            for supplied in ("記事の下書き", "日本語", "原稿", "金曜日", "50 USD"):
                self.assertIn(supplied, result["proposal"])
            self.assertEqual(result["state"], "draft")
            self.assertFalse(result["external_submission"])
            self.assertFalse(result["revenue_verified"])
            self.assertEqual(result["warnings"], [])
        self.assertNotEqual(standard["proposal"], concise["proposal"])
        self.assertEqual(len(run_proposal(PROPOSAL)["warnings"]), 2)

    def test_proposal_rejects_unknown_duplicate_missing_and_ill_typed_fields(self):
        invalid = [[], {}, {**PROPOSAL, "command": "true"}, {**PROPOSAL, "title": True},
                   {**PROPOSAL, "requirements": []}, {**PROPOSAL, "deliverables": [4]},
                   {**PROPOSAL, "price": 888}, {**PROPOSAL, "title": "\x00"},
                   '{"title":"first","title":"second","requirements":"a","deliverables":"b"}',
                   '{"title":NaN,"requirements":"a","deliverables":"b"}', "{" * 2000]
        for value in invalid:
            with self.subTest(value=repr(value)[:90]), self.assertRaises(ValueError):
                run_proposal(value)

    def test_proposal_field_boundaries_and_inert_command_text(self):
        self.assertEqual(run_proposal({**PROPOSAL, "title": "題" * 160})["state"], "draft")
        run_proposal({**PROPOSAL, "requirements": ["x"] * 40})
        for value in ({**PROPOSAL, "title": "題" * 161},
                      {**PROPOSAL, "requirements": ["x"] * 41},
                      {**PROPOSAL, "deliverables": "x" * 8001},
                      {**PROPOSAL, "deadline": "x" * 201}):
            with self.assertRaises(ValueError):
                run_proposal(value)
        inert = "$(touch /tmp/not-executed) `whoami` https://example.invalid /etc/passwd"
        self.assertIn(inert, run_proposal({**PROPOSAL, "requirements": inert})["proposal"])

    def test_citations_merge_new_urls_once_and_preserve_existing_content(self):
        text = ("本文（出典: [A](https://example.test/a)）と（出典: [別名](https://example.test/a); [B](https://example.test/b)）。\n"
                "通常 [通常リンク](https://example.test/ordinary) は保持。\n\n## 出典\n"
                "著者の注記を保持。\n- [既存B](https://example.test/b)\n\n## 続き\n後半")
        result = transform(text, [{"op": "organize_citations"}])
        self.assertEqual(result.count("https://example.test/a"), 1)
        self.assertEqual(result.count("https://example.test/b"), 1)
        self.assertIn("著者の注記を保持。", result)
        self.assertIn("[通常リンク](https://example.test/ordinary)", result)
        self.assertLess(result.index("- [A]"), result.index("## 続き"))
        self.assertTrue(result.endswith("## 続き\n後半"))
        self.assertEqual(transform(result, [{"op": "organize_citations"}]), result)

    def test_citations_preserve_backtick_tilde_indented_and_inline_code_bytes(self):
        marker = "（出典: [code](https://example.test/code)）"
        blocks = [f"```python\n  {marker}  \n```\n", f"~~~~\n{marker}\n~~~\n~~~~\n",
                  f"    {marker}  \n", f"`{marker}`", f"``first `\n{marker}\nsecond``",
                  f"> ```\n> {marker}\n> ```\n"]
        for block in blocks:
            with self.subTest(block=block):
                text = "外（出典: [A](https://example.test/a)）\n" + block
                result = transform(text, [{"op": "organize_citations"}])
                self.assertIn(block, result)
                self.assertIn("- [A](https://example.test/a)", result)
                self.assertEqual(result.count("https://example.test/code"), 1)

    def test_citations_fail_conservatively_for_incomplete_or_unsupported_markers(self):
        inputs = ["（出典: plain text）", "（出典: [a](javascript:alert)）",
                  "（出典: [a](https://example.test/a) extra attribution）", "（出典: []()）",
                  "（出典: [A](https://example.test/a)）\n```\nunclosed",
                  "（出典: [A](https://example.test/a)）\n`unclosed",
                  "[ordinary](https://example.test/a)  \n\n"]
        for text in inputs:
            with self.subTest(text=text):
                self.assertEqual(transform(text, [{"op": "organize_citations"}]), text)

    def test_citations_preserve_crlf_code_and_ignore_code_source_headers(self):
        code = "```\r\n## 出典\r\n（出典: [inside](https://example.test/code)）\r\n```\r\n"
        result = transform(code + "文（出典: [A](https://example.test/a)）\r\n", [{"op": "organize_citations"}])
        self.assertTrue(result.startswith(code))
        self.assertNotIn("\n", result.replace("\r\n", ""))
        self.assertIn("\r\n## 出典\r\n\r\n- [A]", result)

    def test_utf8_hash_known_vectors_exact_bytes_and_no_file_claim(self):
        vectors = {"": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
                   "abc": "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"}
        for text, expected in vectors.items():
            result = json.loads(transform(text, [{"op": "utf8_sha256"}]))
            self.assertEqual(result["sha256"], expected)
            self.assertEqual(result["byte_length"], len(text))
            self.assertEqual(result["scope"], "user_supplied_text_only")
            self.assertFalse(result["file_verified"])
        results = [json.loads(transform(text, [{"op": "utf8_sha256"}])) for text in
                   ("é", "e\u0301", "abc\n", "abc\r\n", "/etc/passwd", "a\x00b")]
        self.assertEqual([r["byte_length"] for r in results], [2, 3, 4, 5, 11, 3])
        self.assertEqual(len({r["sha256"] for r in results}), len(results))
        self.assertEqual(results[4]["sha256"], hashlib.sha256(b"/etc/passwd").hexdigest())

    def test_input_limits_use_utf8_bytes_and_output_limit_still_applies(self):
        result = json.loads(transform("é" * 32768, [{"op": "utf8_sha256"}]))
        self.assertEqual(result["byte_length"], 65536)
        for op in ([{"op": "utf8_sha256"}], [{"op": "organize_citations"}],
                   [{"op": "proposal_draft", "format": "standard"}]):
            with self.assertRaisesRegex(ValueError, "64 KiB"):
                transform("é" * 32769, op)
        with self.assertRaisesRegex(ValueError, "128 KiB"):
            transform("x" * 65536, [{"op": "replace_literal", "old": "x", "new": "xxx"}, {"op": "utf8_sha256"}])

    def test_unknown_code_path_url_and_invalid_finite_variants_are_rejected(self):
        for recipe in ([{"op": "proposal_draft", "format": "python"}], [{"op": "proposal_draft"}],
                       [{"op": "utf8_sha256", "path": "/etc/passwd"}],
                       [{"op": "organize_citations", "url": "https://example.invalid"}],
                       [{"op": "eval", "value": "1+1"}], [{"op": []}], [{"op": "trim_lines"}] * 17):
            with self.subTest(recipe=recipe):
                with self.assertRaises(PackageError):
                    validate_recipe(recipe)
                with self.assertRaises(ValueError):
                    transform("input", recipe)

    def test_isolated_worker_rejects_untrusted_request_envelope_and_finishes_dense_input(self):
        worker = ROOT / "src/blackberryrock/recipe_worker.py"
        for request in ({"text": "abc", "recipe": [{"op": "utf8_sha256"}], "path": "/etc/passwd"},
                        {"text": "abc", "recipe": [{"op": "shell"}]}):
            run = subprocess.run([sys.executable, "-I", str(worker)], input=canonical(request), capture_output=True, timeout=3)
            self.assertEqual(run.returncode, 1)
            self.assertIn("error", json.loads(run.stdout))
        text = "`x` " * 13000
        run = subprocess.run([sys.executable, "-I", str(worker)],
                             input=canonical({"text": text, "recipe": [{"op": "organize_citations"}]}),
                             capture_output=True, timeout=3)
        self.assertEqual(run.returncode, 0)
        self.assertEqual(json.loads(run.stdout)["text"], text)


class SignedToolPackageTest(unittest.TestCase):
    def test_signed_development_artifacts_reproduce_and_reference_fixed_sources(self):
        references = json.loads((TOOLS / "PROVENANCE.json").read_text())["references"]
        self.assertEqual({r["tool_id"] for r in references}, set(IDS))
        self.assertTrue(all(r["commit"] == "935a63d2daf33ba4af3733545c3a692c6aafd850" and r["license"] == "MIT" for r in references))
        for path in (TOOLS / "packages").glob("*.recipe.json"):
            source = json.loads(path.read_text())
            m = source["manifest"]
            signed = package(m["id"], m["version"])
            self.assertEqual(sign_development(source), signed)
            verified, package_hash = verify_package(signed, TRUST)
            self.assertEqual(package_hash, digest(signed))
            self.assertEqual(verified["permissions"], ["text.input", "text.output"])
            self.assertEqual(verified["source"]["repository"], "local-development")
            self.assertEqual(verified["price"]["amount_minor"], 0)

    def test_each_package_rejects_tampering_untrusted_and_revoked_publishers(self):
        for tool_id in IDS:
            original = package(tool_id)
            changed = copy.deepcopy(original)
            changed["manifest"]["name"] += "!"
            for candidate, trust, revoked in ((changed, TRUST, set()), (original, {}, set()),
                                                (original, TRUST, {TEST_PUBLISHER})):
                with self.subTest(tool_id=tool_id), self.assertRaises(PackageError):
                    verify_package(candidate, trust, revoked)

    def test_all_three_run_as_signed_packages_and_retry_without_duplicate_jobs(self):
        inputs = (json.dumps(PROPOSAL), "文（出典: [A](https://example.test/a)）", "abc")
        receipts = []
        with tempfile.TemporaryDirectory() as temp:
            hub = Hub(Path(temp) / "hub.db", TRUST)
            for tool_id, text in zip(IDS, inputs):
                installed = hub.install(package(tool_id))
                with self.assertRaises(PackageError):
                    hub.run(tool_id, text, "not-enabled-" + tool_id)
                hub.enable(tool_id, installed["hash"])
                job = self.finish(hub, hub.run(tool_id, text, tool_id))
                self.assertEqual(job["status"], "succeeded", job)
                self.assertEqual(job["package_hash"], installed["hash"])
                self.assertEqual(hub.run(tool_id, text, tool_id), job)
                with self.assertRaisesRegex(PackageError, "idempotency conflict"):
                    hub.run(tool_id, text + "changed", tool_id)
                receipts.append({"tool_id": tool_id, "status": job["status"], "package_hash": job["package_hash"],
                                 "job_id": job["id"], "output_sha256": hashlib.sha256(job["output"].encode()).hexdigest(),
                                 "retry_reused_same_job": True})
            self.assertEqual(len(hub.state()["jobs"]), 3)
        self.evidence = {"actual_environment": "host subprocess, not Linux guest", "receipts": receipts}

    def test_package_update_changes_behavior_without_runtime_changes_and_rolls_back(self):
        runtime = ROOT / "src/blackberryrock/recipe_worker.py"
        runtime_hash = hashlib.sha256(runtime.read_bytes()).hexdigest()
        with tempfile.TemporaryDirectory() as temp:
            database = Path(temp) / "hub.db"
            hub = Hub(database, TRUST)
            tool_id, text = IDS[0], json.dumps(PROPOSAL)
            first = hub.install(package(tool_id))
            hub.enable(tool_id, first["hash"])
            before = self.finish(hub, hub.run(tool_id, text, "before"))
            updated = hub.install(package(tool_id, "1.1.0"))
            with self.assertRaises(PackageError):
                hub.enable(tool_id, first["hash"])
            hub.enable(tool_id, updated["hash"])
            after = self.finish(hub, hub.run(tool_id, text, "after"))
            self.assertNotEqual(before["output"], after["output"])
            self.assertEqual(json.loads(after["output"])["format"], "concise")
            hub.lifecycle(tool_id, "rollback", "1.0.0")
            hub.enable(tool_id, first["hash"])
            restored = self.finish(hub, hub.run(tool_id, text, "restored"))
            self.assertEqual(restored["output"], before["output"])
            hub.lifecycle(tool_id, "uninstall")
            reopened = Hub(database, TRUST)
            self.assertEqual(reopened.state()["installed"], [])
            self.assertEqual(reopened.job(after["id"]), after)
        self.assertEqual(hashlib.sha256(runtime.read_bytes()).hexdigest(), runtime_hash)
        self.evidence = {"actual_environment": "host subprocess, not Linux guest",
                         "runtime_component": "src/blackberryrock/recipe_worker.py",
                         "runtime_before_sha256": runtime_hash,
                         "runtime_after_sha256": hashlib.sha256(runtime.read_bytes()).hexdigest(),
                         "version_before": before["version"], "package_before_sha256": before["package_hash"],
                         "version_after": after["version"], "package_after_sha256": after["package_hash"],
                         "output_before_sha256": hashlib.sha256(before["output"].encode()).hexdigest(),
                         "output_after_sha256": hashlib.sha256(after["output"].encode()).hexdigest(),
                         "rollback_restored_output": restored["output"] == before["output"],
                         "completed_receipt_survived_uninstall_and_reopen": True}

    @staticmethod
    def finish(hub, job):
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            result = hub.job(job["id"])
            if result["status"] != "running" and job["id"] not in hub.processes:
                return result
            time.sleep(0.01)
        raise AssertionError("bounded host worker did not finish")


if __name__ == "__main__":
    unittest.main()

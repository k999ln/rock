"""Exercise the reviewed fixture policy with the real, pinned Gitleaks binary.

Set GITLEAKS_BINARY to the verified binary path. Tests never print matches or keys.
"""

import ast
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import tomllib
import unittest


ROOT = Path(__file__).resolve().parents[1]
POLICY = ROOT / ".github/spider/gitleaks.toml"
PEM_PATH = "systems/rock-star-os/os/registry/fixtures/PUBLIC-FIXTURE-KEY.pem"
STRIPE_PATH = "tests/sky-commerce.test.mjs"
BINARY = os.environ.get("GITLEAKS_BINARY")


def reviewed_stripe_values():
    # The commerce fixtures may assemble a synthetic value with array.join.
    # Parse only string literals; never execute test source to recover fixtures.
    source = (ROOT / STRIPE_PATH).read_text()
    literal = r"""(?:"[^"\r\n]*"|'[^'\r\n]*')"""
    joined = rf"(\[[^\]\r\n]*\])\.join\(({literal})\)"
    expressions = re.findall(rf"SKY_STRIPE_SECRET_KEY:\s*({joined}|{literal})", source)
    if len(expressions) != source.count("SKY_STRIPE_SECRET_KEY:"):
        raise ValueError("Unrecognized Stripe fixture declaration; explicit review required")
    values = []
    for expression, parts, separator in expressions:
        if parts:
            items, delimiter = ast.literal_eval(parts), ast.literal_eval(separator)
            if not isinstance(items, list) or not all(isinstance(item, str) for item in items):
                raise ValueError("Stripe fixture must contain only string literals")
            values.append(delimiter.join(items))
        else:
            values.append(ast.literal_eval(expression))
    return values


def reviewed_public_entries():
    policy = tomllib.loads(POLICY.read_text())
    rule = next(r for r in policy["rules"] if r["id"] == "generic-api-key")
    entries = []
    def literal(expression):
        value = re.sub(r"\\(.)", r"\1", expression)
        if re.escape(value) != expression:
            raise ValueError("Only exact escaped literals are permitted")
        return value
    for allowed in rule["allowlists"]:
        [expression] = allowed["regexes"]
        if not (expression.startswith(r"\A") and expression.endswith(r"\z")):
            raise ValueError("Full value anchors required")
        value = literal(expression[2:-2])
        [path_expression] = allowed["paths"]
        if not (path_expression.startswith(r"\A(?:") and path_expression.endswith(r")\z")):
            raise ValueError("Full path anchors required")
        paths = [literal(p) for p in path_expression[5:-3].split("|")]
        entries.append((value, paths))
    return entries


class PolicyStructureTests(unittest.TestCase):
    def test_only_exact_rule_scoped_allowlists_inherit_defaults(self):
        policy = tomllib.loads(POLICY.read_text())
        self.assertEqual(policy["extend"], {"useDefault": True})
        self.assertNotIn("allowlists", policy)
        self.assertNotIn("allowlist", policy)
        self.assertEqual({r["id"] for r in policy["rules"]},
                         {"private-key", "stripe-access-token", "generic-api-key"})
        for rule in policy["rules"]:
            self.assertEqual(set(rule), {"id", "allowlists"})
            if rule["id"] != "generic-api-key":
                self.assertEqual(len(rule["allowlists"]), 1)
            for allowed in rule["allowlists"]:
                self.assertEqual(set(allowed), {"description", "condition", "regexTarget", "paths", "regexes"})
                self.assertEqual(allowed["condition"], "AND")
                self.assertEqual(allowed["regexTarget"], "secret")
                self.assertEqual(len(allowed["paths"]), 1)
                self.assertTrue(allowed["paths"][0].startswith(r"\A"))
                self.assertTrue(allowed["paths"][0].endswith(r"\z"))
                self.assertNotIn("commits", allowed)
                self.assertNotIn("stopwords", allowed)

    def test_public_value_provenance_matches_exact_literal_exceptions(self):
        provenance = json.loads((POLICY.parent / "public-value-provenance.json").read_text())
        entries = reviewed_public_entries()
        self.assertEqual(len(entries), provenance["distinctValues"])
        records = {v["candidateSha256"]: v for v in provenance["values"]}
        self.assertEqual(len(records), len(entries))
        for value, paths in entries:
            record = records[hashlib.sha256(value.encode()).hexdigest()]
            self.assertEqual(len(paths), record["exactPathCount"])
            self.assertIn(record["source"]["path"], paths)
            self.assertTrue(record["classification"])
            self.assertTrue(record["evidence"])

    def test_reviewed_public_fixture_bytes_have_not_changed(self):
        self.assertEqual(hashlib.sha256((ROOT / PEM_PATH).read_bytes()).hexdigest(),
                         "c4932a9b6b97423b249a53e58d706f820185467464699038ed7ca5b29815ba03")
        values = reviewed_stripe_values()
        # Only hashes are emitted if a review is required for fixture changes.
        self.assertEqual([hashlib.sha256(v.encode()).hexdigest() for v in values], [
            "4c0b56d3c9710c8288f04846b4aecd8cabaaa61b1a3e2f951ef8f8d5a5f63393",
            "25c5d906b425ebe012fef82d2e4300610456203315da82f192f573ee6c811e67",
        ])


@unittest.skipUnless(BINARY, "GITLEAKS_BINARY must point to the verified scanner")
class RealScannerPolicyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.binary = str(Path(BINARY).resolve())

    def scan(self, path, content, *, policy=True, return_locations=False):
        with tempfile.TemporaryDirectory(prefix="spider-policy-") as directory:
            base = Path(directory)
            source = base / "source"
            files = path if isinstance(path, dict) else {path: content}
            for relative, body in files.items():
                target = source / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text(body)
            report = base / "report.json"
            empty_ignore = base / "empty.ignore"
            empty_ignore.write_text("")
            config = POLICY
            if not policy:
                config = base / "defaults.toml"
                config.write_text("[extend]\nuseDefault = true\n")
            process = subprocess.run([
                self.binary, "dir", ".", "--config", str(config),
                "--report-format", "json", "--report-path", str(report),
                "--redact=100", "--exit-code", "23", "--no-banner",
                "--log-level", "fatal", "--ignore-gitleaks-allow",
                "--gitleaks-ignore-path", str(empty_ignore), "--timeout", "30",
            ], cwd=source, capture_output=True, text=True, timeout=40)
            self.assertIn(process.returncode, (0, 23), "Scanner failed before a complete result")
            self.assertTrue(report.is_file(), "Scanner report missing")
            findings = json.loads(report.read_text())
            self.assertEqual(process.returncode, 23 if findings else 0)
            self.assertTrue(all(f.get("Secret") == "REDACTED" for f in findings))
            if return_locations:
                return {(f["File"].removeprefix("./"), f["StartLine"]) for f in findings}
            return {f["RuleID"] for f in findings}

    def test_every_reviewed_value_is_detected_by_defaults_and_only_exact_pairs_pass(self):
        files = {}
        for value, paths in reviewed_public_entries():
            for path in paths:
                files[path] = files.get(path, "") + "api_key = " + json.dumps(value) + "\n"
        self.assertIn("generic-api-key", self.scan(files, "", policy=False))
        self.assertEqual(self.scan(files, ""), set())

    def test_every_reviewed_value_mutation_and_path_copy_is_still_detected(self):
        # Batch scans retain per-file assertions, so a finding cannot mask another bypass.
        copies = {}
        mutations = {}
        expected_mutations = set()
        for index, (value, paths) in enumerate(reviewed_public_entries()):
            # Replace the public value with a new high-entropy synthetic credential.
            # A one-character edit can fall below the upstream entropy detector.
            changed = "spider-canary-" + hashlib.sha256(("replacement:" + value).encode()).hexdigest()
            copies[f"unreviewed/{index}.txt"] = "api_key = " + json.dumps(value)
            body = mutations.get(paths[0], "")
            expected_mutations.add((paths[0], body.count("\n") + 1))
            mutations[paths[0]] = body + "api_key = " + json.dumps(changed) + "\n"
        self.assertEqual(self.scan(copies, "", return_locations=True), {(p, 1) for p in copies})
        self.assertEqual(self.scan(mutations, "", return_locations=True), expected_mutations)


    def test_relocated_zema_storage_name_is_exact_and_new_paths_reject_credentials(self):
        expected_paths = {
            "lib/sky-zema-handoff.ts",
            "lib/zema-private-storage.ts",
            "tests/zema-chat-session.test.mjs",
        }
        entries = [(value, paths) for value, paths in reviewed_public_entries()
                   if "lib/sky-zema-handoff.ts" in paths]
        self.assertEqual(len(entries), 1, "One reviewed public storage name is required")
        value, paths = entries[0]
        self.assertEqual(set(paths), expected_paths)
        source = "const SKY_ZEMA_HANDOFF_KEY = " + json.dumps(value) + ";\n"
        files = {path: source for path in expected_paths}
        locations = {(path, 1) for path in files}
        self.assertEqual(self.scan(files, "", policy=False, return_locations=True), locations)
        self.assertEqual(self.scan(files, "", return_locations=True), set())

        # Every added path must still reject replacement credentials. A hit in
        # the original path must not hide a bypass in either relocated path.
        replacements = {
            path: "api_key = " + json.dumps(
                "spider-canary-" + hashlib.sha256(("relocation:" + path).encode()).hexdigest())
            for path in expected_paths
        }
        self.assertEqual(self.scan(replacements, "", return_locations=True), locations)
        copies = {path + ".unreviewed": source for path in expected_paths}
        self.assertEqual(self.scan(copies, "", return_locations=True),
                         {(path, 1) for path in copies})

    def test_public_pem_is_detected_by_defaults_and_only_exact_path_is_allowed(self):
        source = (ROOT / PEM_PATH).read_text()
        self.assertIn("private-key", self.scan(PEM_PATH, source, policy=False))
        self.assertEqual(self.scan(PEM_PATH, source), set())
        self.assertIn("private-key", self.scan("new-fixtures/key.pem", source))

    def test_altered_pem_in_same_path_remains_reported(self):
        lines = (ROOT / PEM_PATH).read_text().splitlines()
        lines[1] = ("A" if lines[1][0] != "A" else "B") + lines[1][1:]
        self.assertIn("private-key", self.scan(PEM_PATH, "\n".join(lines) + "\n"))

    def test_stripe_constants_are_allowed_only_at_exact_reviewed_path(self):
        values = reviewed_stripe_values()
        for value in values:
            source = "const providerCredential = " + json.dumps(value) + ";\n"
            self.assertIn("stripe-access-token", self.scan(STRIPE_PATH, source, policy=False))
            self.assertEqual(self.scan(STRIPE_PATH, source), set())
            self.assertIn("stripe-access-token", self.scan("new-test.mjs", source))
            changed = value[:-1] + ("Z" if value[-1] != "Z" else "Y")
            self.assertIn("stripe-access-token", self.scan(
                STRIPE_PATH, "const providerCredential = " + json.dumps(changed) + ";\n"))

    def test_new_provider_token_in_reviewed_path_and_inline_bypass_still_fail(self):
        # Deterministic synthetic canary is assembled to avoid a literal test secret.
        canary = "gh" + "p_" + hashlib.sha256(b"spider policy canary").hexdigest()[:36]
        source = "const providerCredential = " + json.dumps(canary) + "; // gitleaks:allow\n"
        self.assertIn("github-pat", self.scan(STRIPE_PATH, source))


if __name__ == "__main__":
    unittest.main()

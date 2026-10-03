"""Exercise the reviewed fixture policy with the real, pinned Gitleaks binary.

Set GITLEAKS_BINARY to the verified binary path. Tests never print matches or keys.
"""

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


class PolicyStructureTests(unittest.TestCase):
    def test_only_exact_rule_scoped_allowlists_inherit_defaults(self):
        policy = tomllib.loads(POLICY.read_text())
        self.assertEqual(policy["extend"], {"useDefault": True})
        self.assertNotIn("allowlists", policy)
        self.assertNotIn("allowlist", policy)
        self.assertEqual({r["id"] for r in policy["rules"]},
                         {"private-key", "stripe-access-token"})
        for rule in policy["rules"]:
            self.assertEqual(set(rule), {"id", "allowlists"})
            self.assertEqual(len(rule["allowlists"]), 1)
            allowed = rule["allowlists"][0]
            self.assertEqual(allowed["condition"], "AND")
            self.assertEqual(allowed["regexTarget"], "secret")
            self.assertEqual(len(allowed["paths"]), 1)
            self.assertTrue(allowed["paths"][0].startswith(r"\A"))
            self.assertTrue(allowed["paths"][0].endswith(r"\z"))
            self.assertNotIn("commits", allowed)
            self.assertNotIn("stopwords", allowed)

    def test_reviewed_public_fixture_bytes_have_not_changed(self):
        self.assertEqual(hashlib.sha256((ROOT / PEM_PATH).read_bytes()).hexdigest(),
                         "c4932a9b6b97423b249a53e58d706f820185467464699038ed7ca5b29815ba03")
        values = re.findall(r"SKY_STRIPE_SECRET_KEY:\s*[\"']([^\"']+)",
                            (ROOT / STRIPE_PATH).read_text())
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

    def scan(self, path, content, *, policy=True):
        with tempfile.TemporaryDirectory(prefix="spider-policy-") as directory:
            base = Path(directory)
            source = base / "source"
            target = source / path
            target.parent.mkdir(parents=True)
            target.write_text(content)
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
            return {f["RuleID"] for f in findings}

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
        values = re.findall(r"SKY_STRIPE_SECRET_KEY:\s*[\"']([^\"']+)",
                            (ROOT / STRIPE_PATH).read_text())
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

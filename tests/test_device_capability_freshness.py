"""Host-only test of the Shell consumer's actual time guard and production Java seam.

OS02_JAVA_HOME may select an already installed JDK. OS02_CONSUMER_SOURCE may point
at a preserved MainActivity.java to reproduce the old consumer's failure. No SDK,
Android doubles, dependencies, device, or network are used by this test.
"""
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
CONSUMER = ROOT / "android/shell/src/main/java/dev/rock/shell/MainActivity.java"
HELPER = CONSUMER.with_name("CapabilitySnapshotFreshness.java")
FIXTURE = ROOT / "tests/fixtures/DeviceCapabilityFreshnessTest.java"


def consumer_time_guard(source):
    method = source.split("private void applyDeviceCapabilities(JSONObject capabilities) {", 1)[1]
    method = method.split("\n    private ", 1)[0]
    # Compile the real guard, rather than maintaining a second time predicate here.
    match = re.search(r"!validLocalInferenceObservation\(localInference\)\s*\|\|\s*(.*?)\)\s*\{", method, re.S)
    if not match:
        raise AssertionError("actual consumer time guard not found")
    return match.group(1).strip(), method


class DeviceCapabilityFreshnessTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        home = os.environ.get("OS02_JAVA_HOME") or os.environ.get("JAVA_HOME")
        cls.javac = str(Path(home) / "bin/javac") if home else shutil.which("javac")
        cls.java = str(Path(home) / "bin/java") if home else shutil.which("java")
        if not cls.javac or not cls.java:
            raise unittest.SkipTest("existing JDK required; no tools are downloaded")
        cls.source = Path(os.environ.get("OS02_CONSUMER_SOURCE", str(CONSUMER))).read_text()
        cls.guard, cls.method = consumer_time_guard(cls.source)
        cls.temp = tempfile.TemporaryDirectory(prefix="os02-freshness-")
        cls.addClassCleanup(cls.temp.cleanup)
        cls.output = Path(cls.temp.name)
        probe = cls.output / "ConsumerFreshnessProbe.java"
        probe.write_text("package dev.rock.shell;\nfinal class ConsumerFreshnessProbe {\n"
                         "static boolean isFresh(long now, long observedAt, long expiresAt) {\n"
                         "return !(" + cls.guard + ");\n}\n}\n")
        subprocess.run([cls.javac, "--release", "11", "-d", str(cls.output),
                        str(HELPER), str(probe), str(FIXTURE)],
                       check=True, capture_output=True, text=True, timeout=30)

    def test_time_boundaries(self):
        result = subprocess.run([self.java, "-cp", str(self.output),
                                 "dev.rock.shell.DeviceCapabilityFreshnessTest"],
                                capture_output=True, text=True, timeout=15)
        self.assertEqual(0, result.returncode, result.stdout + result.stderr)
        self.assertIn("PASS 23 freshness boundaries", result.stdout)

    def test_consumer_uses_production_helper(self):
        self.assertEqual("!CapabilitySnapshotFreshness.isFresh(now, observedAt, expiresAt)", self.guard)
        self.assertIn("long now = SystemClock.elapsedRealtime();", self.method)
        for field in ("observedAtElapsedMs", "expiresAtElapsedMs"):
            self.assertIn('optLong("' + field + '", -1)', self.method)
        # Invalid/missing times retain the existing unknown display and clear its expiry.
        tail = self.method.split(self.guard, 1)[1]
        self.assertRegex(tail, r"\)\s*\{\s*clearDeviceCapabilityExpiry\(\);")
        self.assertIn("Brokerから新しい情報を取得できません", tail)
        self.assertIn("RockstarOS全体の端末適合: 未評価。", tail)
        self.assertIn("mainHandler.postDelayed(deviceCapabilityExpiry, expiresAt - now);", self.method)


if __name__ == "__main__":
    unittest.main()

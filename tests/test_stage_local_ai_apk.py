"""Exercise APK staging with a synthetic ZIP and deterministic aapt2 fixture."""
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
import zipfile

SPEC = importlib.util.spec_from_file_location(
    "local_ai_apk", Path(__file__).resolve().parents[1] / "scripts/stage-local-ai-apk.py")
stager = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(stager)


class LocalAiApkStagingTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        self.tree = self.root / "os-tree"
        self.tree.mkdir()
        self.apk = self.root / "assistant.apk"
        with zipfile.ZipFile(self.apk, "w") as archive:
            archive.writestr("AndroidManifest.xml", b"binary manifest fixture")
            archive.writestr("classes.dex", b"dex fixture")
            archive.writestr("lib/arm64-v8a/libllama.so", b"native fixture")
        self.aapt2 = self.root / "aapt2"
        self.write_aapt2(False)
        self.source_lock = self.root / "source.json"
        self.source_lock.write_text(json.dumps({
            "commit": "1" * 40,
        }))
        self.artifact_lock = self.root / "artifact.json"
        self.write_lock("APK_REVIEWED_NOT_IN_IMAGE")
        old_source, old_artifact = stager.SOURCE_LOCK, stager.ARTIFACT_LOCK
        stager.SOURCE_LOCK, stager.ARTIFACT_LOCK = self.source_lock, self.artifact_lock
        self.addCleanup(setattr, stager, "SOURCE_LOCK", old_source)
        self.addCleanup(setattr, stager, "ARTIFACT_LOCK", old_artifact)

    def write_aapt2(self, internet, permission_kind="uses-permission"):
        permission = f"{permission_kind}: name='android.permission.INTERNET'\n" if internet else ""
        self.aapt2.write_text("#!/bin/sh\nprintf \"package: name='com.localactionassistant' versionCode='1' versionName='1.0'\\n"
                              + permission + "\"\n")
        self.aapt2.chmod(0o755)

    def write_lock(self, stage):
        digest = hashlib.sha256(self.apk.read_bytes()).hexdigest()
        self.artifact_lock.write_text(json.dumps({
            "schema": "rock-local-ai-apk/1", "stage": stage,
            "sourceCommit": "1" * 40, "moduleName": "RockLocalActionAssistant",
            "packageName": "com.localactionassistant", "versionCode": 1,
            "requiredAbis": ["arm64-v8a"], "internetPermission": False,
            "aospCertificate": "testkey",
            "apkSha256": digest if stage != "APK_NOT_BUILT" else None,
            "apkSizeBytes": self.apk.stat().st_size if stage != "APK_NOT_BUILT" else None,
            "imageIntegrated": False,
        }))

    def test_reviewed_apk_is_staged_idempotently_for_aosp_signing(self):
        first = stager.stage_apk(self.tree, self.apk, self.aapt2)
        second = stager.stage_apk(self.tree, self.apk, self.aapt2)
        self.assertEqual(first, second)
        stage = self.tree / stager.STAGE_PATH
        self.assertEqual({path.name for path in stage.iterdir()},
                         {"Android.bp", "product.mk", "artifact.json", stager.APK_NAME})
        self.assertIn('certificate: "testkey"', (stage / "Android.bp").read_text())
        self.assertEqual(stager.verify_stage(self.tree)["sha256"], first["sha256"])

    def test_unbuilt_lock_fails_before_staging(self):
        self.write_lock("APK_NOT_BUILT")
        with self.assertRaisesRegex(ValueError, "not built and reviewed"):
            stager.stage_apk(self.tree, self.apk, self.aapt2)

    def test_internet_permission_is_rejected(self):
        self.write_aapt2(True)
        with self.assertRaisesRegex(ValueError, "must not request INTERNET"):
            stager.stage_apk(self.tree, self.apk, self.aapt2)

    def test_version_scoped_internet_permission_is_rejected(self):
        self.write_aapt2(True, "uses-permission-sdk-23")
        with self.assertRaisesRegex(ValueError, "must not request INTERNET"):
            stager.stage_apk(self.tree, self.apk, self.aapt2)

    def test_extra_native_abi_is_rejected(self):
        with zipfile.ZipFile(self.apk, "a") as archive:
            archive.writestr("lib/x86_64/libllama.so", b"unexpected native fixture")
        self.write_lock("APK_REVIEWED_NOT_IN_IMAGE")
        with self.assertRaisesRegex(ValueError, "arm64-v8a only"):
            stager.stage_apk(self.tree, self.apk, self.aapt2)

    def test_apk_symlink_is_rejected(self):
        link = self.root / "assistant-link.apk"
        link.symlink_to(self.apk)
        with self.assertRaisesRegex(ValueError, "must not be a symlink"):
            stager.stage_apk(self.tree, link, self.aapt2)

    def test_hash_mismatch_is_rejected(self):
        lock = json.loads(self.artifact_lock.read_text())
        lock["apkSha256"] = "0" * 64
        self.artifact_lock.write_text(json.dumps(lock))
        with self.assertRaisesRegex(ValueError, "differs from the reviewed"):
            stager.stage_apk(self.tree, self.apk, self.aapt2)


if __name__ == "__main__":
    unittest.main()

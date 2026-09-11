"""Exercise a real signed Git tag and filesystem updates, not an OS boot."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

SPEC = importlib.util.spec_from_file_location(
    "phone_build", Path(__file__).resolve().parents[1] / "scripts/prepare-phone-build.py")
phone = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(phone)
PROJECT_CHECK = Path(__file__).resolve().parents[1] / "scripts/check-phone-project.sh"


class PhonePreparationTest(unittest.TestCase):
    def command(self, cwd, *args):
        return subprocess.check_output(args, cwd=cwd, stderr=subprocess.PIPE).decode().strip()

    def repository(self, path):
        path.mkdir(parents=True, exist_ok=True)
        self.command(path, "git", "init", "-q")
        self.command(path, "git", "config", "user.name", "Fixture")
        self.command(path, "git", "config", "user.email", "fixture@example.invalid")
        self.command(path, "git", "add", ".")
        self.command(path, "git", "commit", "--allow-empty", "-qm", "fixture")
        return self.command(path, "git", "rev-parse", "HEAD")

    def setUp(self):
        if not shutil.which("ssh-keygen"):
            self.fail("ssh-keygen is required to exercise real upstream tag verification")
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.tree = Path(self.temp.name).resolve()
        self.root = self.tree / "external/rockstaros"
        self.repository(self.root)
        self.manifest = self.tree / ".repo/manifests"
        self.manifest.mkdir(parents=True)
        (self.manifest / "default.xml").write_text('<manifest/>')
        manifest_commit = self.repository(self.manifest)
        (self.tree / ".repo/manifest.xml").write_text('<manifest><include name="default.xml" /></manifest>')
        kernel_commit = self.repository(self.tree / "device/google/laguna-kernels/6.6")
        self.key = self.tree / "ephemeral-test-key"
        self.command(self.tree, "ssh-keygen", "-q", "-t", "ed25519", "-N", "", "-f", str(self.key))
        self.command(self.manifest, "git", "-c", "gpg.format=ssh", "-c",
                     f"user.signingkey={self.key}", "tag", "-sm", "fixture tag", "fixture-stable")
        self.signers = self.tree / "allowed_signers"
        self.signers.write_text("fixture@example.invalid " + self.key.with_suffix(".pub").read_text())
        self.adevtool = self.tree / "vendor/adevtool"
        self.hook = self.adevtool / "device.mk"
        self.hook.parent.mkdir(parents=True)
        self.original = b"# locally authored upstream stand-in\nPRODUCT_PACKAGES += ExistingDeviceDriver\n"
        self.hook.write_bytes(self.original)
        adevtool_commit = self.repository(self.adevtool)
        for filename in ["build/envsetup.sh", "vendor/google_devices/frankel/frankel.mk",
                         "vendor/google_devices/frankel/BoardConfig.mk"]:
            path = self.tree / filename
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text("# fixture input\n")
        self.lock = self.root / "lock.json"
        self.lock.write_text(json.dumps({"rockCheckoutPath": "external/rockstaros",
            "manifestCommit": manifest_commit, "manifestTag": "fixture-stable",
            "adevtoolCommit": adevtool_commit, "hook": "vendor/adevtool/device.mk",
            "kernel": {"prebuiltCommit": kernel_commit},
            "hookSha256": hashlib.sha256(self.original).hexdigest(),
            "device": "frankel", "lunch": "frankel-cur-userdebug"}))
        self.command(self.root, "git", "add", ".")
        self.command(self.root, "git", "commit", "-qm", "lock")
        old_root, old_lock = phone.ROOT, phone.LOCK
        phone.ROOT, phone.LOCK = self.root, self.lock
        self.addCleanup(setattr, phone, "ROOT", old_root)
        self.addCleanup(setattr, phone, "LOCK", old_lock)
        self.local_manifest = self.tree / ".repo/local_manifests/rock-phone.xml"
        self.local_manifest.parent.mkdir()
        self.local_manifest.write_text(phone.render_manifest())

    def test_verified_source_can_be_prepared_twice_without_duplicate_or_loss(self):
        first = phone.prepare(self.tree, self.signers)
        second = phone.prepare(self.tree, self.signers)
        self.assertEqual(first["hookSha256"], second["hookSha256"])
        self.assertEqual(self.hook.read_bytes(), self.original + phone.ADDITION)
        self.assertFalse(second["flashReady"])

    def test_local_device_changes_are_preserved_instead_of_overwritten(self):
        changed = self.original + b"PRODUCT_PACKAGES += LocallyRequiredDriver\n"
        self.hook.write_bytes(changed)
        with self.assertRaisesRegex(ValueError, "differs from the pinned"):
            phone.prepare(self.tree, self.signers)
        self.assertEqual(self.hook.read_bytes(), changed)

    def test_untrusted_upstream_tag_cannot_modify_device_source(self):
        self.signers.write_text("")
        with self.assertRaises(subprocess.CalledProcessError):
            phone.prepare(self.tree, self.signers)
        self.assertEqual(self.hook.read_bytes(), self.original)

    def test_local_manifest_cannot_override_a_signed_upstream_project(self):
        original = self.local_manifest.read_text()
        self.local_manifest.write_text(original.replace("</manifest>",
            '<extend-project name="platform_build_soong" revision="' + "a" * 40 + '" /></manifest>'))
        with self.assertRaisesRegex(ValueError, "without upstream overrides"):
            phone.prepare(self.tree, self.signers)
        self.assertEqual(self.hook.read_bytes(), self.original)

    def test_project_build_gate_rejects_wrong_revision_and_unrecorded_changes(self):
        env = dict(os.environ, REPO_PATH="vendor/adevtool",
                   REPO_RREV=self.command(self.adevtool, "git", "rev-parse", "HEAD"))
        def check():
            return subprocess.run(["bash", str(PROJECT_CHECK)], cwd=self.adevtool,
                                  env=env, capture_output=True).returncode
        self.assertEqual(check(), 0)
        env["REPO_RREV"] = "0" * 40
        self.assertNotEqual(check(), 0)
        env["REPO_RREV"] = self.command(self.adevtool, "git", "rev-parse", "HEAD")
        self.hook.write_bytes(self.original + b"# unrecorded device edit\n")
        self.assertNotEqual(check(), 0)
        self.hook.write_bytes(self.original)
        (self.adevtool / "unexpected.bp").write_text("// untracked build input\n")
        self.assertNotEqual(check(), 0)


if __name__ == "__main__":
    unittest.main()

"""Exercise Pixel build-input freezing with synthetic, non-Google fixtures."""
import importlib.util
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
import zipfile


SPEC = importlib.util.spec_from_file_location(
    "phone_inputs",
    Path(__file__).resolve().parents[1] / "scripts/freeze-phone-build-inputs.py")
freeze = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(freeze)


class PhoneBuildInputFreezeTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        self.factory = self.root / "frankel-bp1a.260901.001-factory-fixture.zip"
        self.ota = self.root / "frankel-ota-bp1a.260901.001-fixture.zip"
        self.terms = self.root / "terms.json"
        self.write_factory("BP1A.260901.001")
        self.write_ota("BP1A.260901.001")
        self.write_terms()

    def write_factory(self, build_id):
        image = f"image-frankel-{build_id.lower()}.zip"
        with zipfile.ZipFile(self.factory, "w") as archive:
            archive.writestr(image, b"synthetic nested image")
            archive.writestr("flash-all.sh", f"fastboot update {image}\n")

    def write_ota(self, build_id):
        metadata = (
            "ota-type=AB\n"
            "post-device=frankel\n"
            f"post-build=google/frankel/frankel:17/{build_id}/123456:user/release-keys\n"
        )
        with zipfile.ZipFile(self.ota, "w") as archive:
            archive.writestr("META-INF/com/android/metadata", metadata)
            archive.writestr("payload.bin", b"synthetic payload")

    def write_terms(self, **updates):
        factory_sha = hashlib.sha256(self.factory.read_bytes()).hexdigest()
        ota_sha = hashlib.sha256(self.ota.read_bytes()).hexdigest()
        value = {
            "schema": "avocadoos-google-recovery-terms/1",
            "target": freeze.TARGET,
            "acceptedByOwner": True,
            "acceptedAt": "2026-09-16T12:00:00Z",
            "factoryPage": freeze.FACTORY_PAGE,
            "fullOtaPage": freeze.OTA_PAGE,
            "scope": "personal_owned_pixel_10_recovery_download",
            "artifactRedistributionAllowed": False,
            "flashOrWipeAuthorized": False,
            "officialSelection": {
                "buildId": "BP1A.260901.001",
                "factoryImage": {
                    "downloadUrl": f"https://dl.google.com/dl/android/aosp/{self.factory.name}",
                    "fileName": self.factory.name,
                    "sha256": factory_sha,
                },
                "fullOta": {
                    "downloadUrl": f"https://dl.google.com/dl/android/aosp/{self.ota.name}",
                    "fileName": self.ota.name,
                    "sha256": ota_sha,
                },
            },
        }
        value.update(updates)
        self.terms.write_text(json.dumps(value), encoding="utf-8")

    def test_matching_recovery_pair_freezes_actual_bytes_without_paths(self):
        result = freeze.recovery_record(self.factory, self.ota, self.terms)
        self.assertEqual(result["buildId"], "BP1A.260901.001")
        self.assertEqual(result["factoryImage"]["fileName"], self.factory.name)
        self.assertEqual(result["fullOta"]["fileName"], self.ota.name)
        self.assertEqual(len(result["factoryImage"]["sha256"]), 64)
        self.assertNotIn(str(self.root), json.dumps(result))
        self.assertFalse(result["terms"]["flashOrWipeAuthorized"])

    def test_terms_must_be_owner_accepted_download_only(self):
        for updates in (
            {"acceptedByOwner": False},
            {"flashOrWipeAuthorized": True},
            {"artifactRedistributionAllowed": True},
            {"scope": "redistribute"},
        ):
            with self.subTest(updates=updates):
                self.write_terms(**updates)
                with self.assertRaisesRegex(ValueError, "explicit and download-only"):
                    freeze.recovery_record(self.factory, self.ota, self.terms)

    def test_factory_and_ota_must_be_the_same_frankel_build(self):
        self.write_ota("BP1A.260902.001")
        self.write_terms(officialSelection={
            "buildId": "BP1A.260902.001",
            "factoryImage": {
                "downloadUrl": f"https://dl.google.com/dl/android/aosp/{self.factory.name}",
                "fileName": self.factory.name,
                "sha256": hashlib.sha256(self.factory.read_bytes()).hexdigest(),
            },
            "fullOta": {
                "downloadUrl": f"https://dl.google.com/dl/android/aosp/{self.ota.name}",
                "fileName": self.ota.name,
                "sha256": hashlib.sha256(self.ota.read_bytes()).hexdigest(),
            },
        })
        with self.assertRaisesRegex(ValueError, "build IDs do not match"):
            freeze.recovery_record(self.factory, self.ota, self.terms)

    def test_official_url_and_local_bytes_must_match_the_owner_recorded_identity(self):
        value = json.loads(self.terms.read_text())
        value["officialSelection"]["fullOta"]["downloadUrl"] = (
            f"https://example.invalid/{self.ota.name}")
        self.terms.write_text(json.dumps(value))
        with self.assertRaisesRegex(ValueError, "exact official download URL"):
            freeze.recovery_record(self.factory, self.ota, self.terms)

        self.write_terms()
        value = json.loads(self.terms.read_text())
        value["officialSelection"]["fullOta"]["sha256"] = "0" * 64
        self.terms.write_text(json.dumps(value))
        with self.assertRaisesRegex(ValueError, "differ from the Google official"):
            freeze.recovery_record(self.factory, self.ota, self.terms)

    def test_recovery_symlinks_and_unsafe_zip_entries_are_rejected(self):
        link = self.root / "factory-link.zip"
        link.symlink_to(self.factory)
        with self.assertRaisesRegex(ValueError, "must not be a symlink"):
            freeze.recovery_record(link, self.ota, self.terms)
        with zipfile.ZipFile(self.factory, "w") as archive:
            archive.writestr("../escape", b"bad")
            archive.writestr("flash-all.sh", b"bad")
        with self.assertRaisesRegex(ValueError, "unsafe ZIP entry"):
            freeze.recovery_record(self.factory, self.ota, self.terms)

    def make_vendor_tree(self):
        tree = self.root / "os"
        adevtool = tree / "vendor/adevtool"
        adevtool.mkdir(parents=True)
        subprocess.run(["git", "init", "-q", str(adevtool)], check=True)
        subprocess.run(["git", "-C", str(adevtool), "config", "user.name", "Fixture"], check=True)
        subprocess.run(["git", "-C", str(adevtool), "config", "user.email",
                        "fixture@example.invalid"], check=True)
        (adevtool / "README").write_text("fixture\n")
        subprocess.run(["git", "-C", str(adevtool), "add", "README"], check=True)
        subprocess.run(["git", "-C", str(adevtool), "commit", "-qm", "fixture"], check=True)
        commit = subprocess.check_output(
            ["git", "-C", str(adevtool), "rev-parse", "HEAD"]).decode().strip()
        vendor = tree / "vendor/google_devices/frankel"
        vendor.mkdir(parents=True)
        (vendor / "frankel.mk").write_text("PRODUCT_NAME := frankel\n")
        (vendor / "BoardConfig.mk").write_text("BOARD := frankel\n")
        (vendor / "firmware.bin").write_bytes(b"synthetic vendor bytes")
        lock = self.root / "source-lock.json"
        lock.write_text(json.dumps({
            "schema": "rock-phone-source/2",
            "device": "frankel",
            "model": "Google Pixel 10",
            "confirmedSku": "GL066",
            "targetConfirmedByOwner": True,
            "manifestTag": "fixture-tag",
            "adevtoolCommit": commit,
            "vendor": {"generationCommand": "adevtool generate-all -d frankel"},
        }))
        old = freeze.SOURCE_LOCK
        freeze.SOURCE_LOCK = lock
        self.addCleanup(setattr, freeze, "SOURCE_LOCK", old)
        return tree

    def test_vendor_inventory_is_deterministic_and_detects_change(self):
        tree = self.make_vendor_tree()
        first = freeze.vendor_inventory(tree)
        second = freeze.vendor_inventory(tree)
        self.assertEqual(first, second)
        self.assertEqual(first["fileCount"], 3)
        record = self.root / "vendor-inventory.json"
        record.write_text(json.dumps(first))
        self.assertEqual(freeze.verify_vendor(tree, record), first)
        (tree / "vendor/google_devices/frankel/firmware.bin").write_bytes(b"changed")
        with self.assertRaisesRegex(ValueError, "changed after inventory"):
            freeze.verify_vendor(tree, record)

    def test_vendor_inventory_rejects_escaped_symlink(self):
        tree = self.make_vendor_tree()
        outside = self.root / "outside.bin"
        outside.write_bytes(b"outside")
        (tree / "vendor/google_devices/frankel/escape.bin").symlink_to(outside)
        with self.assertRaisesRegex(ValueError, "symlink escapes"):
            freeze.vendor_inventory(tree)

    def test_vendor_inventory_requires_exact_adevtool_revision(self):
        tree = self.make_vendor_tree()
        lock = json.loads(freeze.SOURCE_LOCK.read_text())
        lock["adevtoolCommit"] = "0" * 40
        freeze.SOURCE_LOCK.write_text(json.dumps(lock))
        with self.assertRaisesRegex(ValueError, "wrong adevtool revision"):
            freeze.vendor_inventory(tree)

    def test_signing_plan_freezes_public_procedure_without_claiming_keys(self):
        policy = self.root / "signing.json"
        document = self.root / "signing.md"
        policy.write_text(json.dumps({
            "schema": "avocadoos-android-signing-custody/1",
            "status": "architecture_approved_provisioning_and_end_to_end_signing_pending",
            "architecture": {
                "hsmModel": "YubiHSM 2", "hsmQuantity": 2,
                "rawPrivateKeyExportAllowed": False,
            },
            "keySeparation": {"requiredRoleClasses": [
                "avb", "ota", "system-applications", "apex-system-components"]},
        }))
        document.write_text("Synthetic procedure; no keys.\n")
        old_policy, old_document = freeze.SIGNING_POLICY, freeze.SIGNING_DOCUMENT
        freeze.SIGNING_POLICY, freeze.SIGNING_DOCUMENT = policy, document
        self.addCleanup(setattr, freeze, "SIGNING_POLICY", old_policy)
        self.addCleanup(setattr, freeze, "SIGNING_DOCUMENT", old_document)
        result = freeze.signing_plan()
        self.assertFalse(result["hsmProvisioned"])
        self.assertFalse(result["productionSigningReady"])
        self.assertTrue(result["exactKeyInventoryPendingTargetFiles"])
        altered = json.loads(policy.read_text())
        altered["architecture"]["rawPrivateKeyExportAllowed"] = True
        policy.write_text(json.dumps(altered))
        with self.assertRaisesRegex(ValueError, "approved pending plan"):
            freeze.signing_plan()


if __name__ == "__main__":
    unittest.main()

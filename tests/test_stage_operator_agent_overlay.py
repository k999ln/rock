"""Exercise production Operator Agent RRO staging without production values."""
import base64
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest


SPEC = importlib.util.spec_from_file_location(
    "operator_overlay",
    Path(__file__).resolve().parents[1] / "scripts/stage-operator-agent-overlay.py")
stager = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(stager)


def encoded(value):
    return base64.urlsafe_b64encode(value).decode().rstrip("=")


def p256_generator_spki():
    x = bytes.fromhex("6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296")
    y = bytes.fromhex("4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5")
    algorithm = bytes.fromhex("301306072a8648ce3d020106082a8648ce3d030107")
    point = b"\x03\x42\x00\x04" + x + y
    return b"\x30\x59" + algorithm + point


class OperatorAgentOverlayStagingTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        self.tree = self.root / "os-tree"
        self.tree.mkdir()
        self.input = self.root / "operator-public.json"
        self.value = {
            "schema": "avocadoos-operator-agent-overlay-input/1",
            "scope": stager.SCOPE,
            "targetPackage": stager.TARGET_PACKAGE,
            "dockOrigin": "https://operator.avocado.test",
            "operatorCredentialId": encoded(b"credential-id-001"),
            "operatorPublicKeySpki": encoded(p256_generator_spki()),
            "rpId": "operator.avocado.test",
            "webAuthnOrigin": "https://operator.avocado.test",
            "quarantinePackages": ["com.example.connector"],
            "deviceAttestationChallenge": encoded(bytes(range(32))),
            "hardwareIdentityRequired": True,
            "factoryResetEnabled": False,
        }
        self.write()

    def write(self):
        self.input.write_text(json.dumps(self.value), encoding="utf-8")

    def test_public_values_stage_idempotently_as_exact_static_rro(self):
        first = stager.stage_overlay(self.tree, self.input)
        second = stager.stage_overlay(self.tree, self.input)
        self.assertEqual(first, second)
        stage = self.tree / stager.STAGE_PATH
        self.assertEqual(stager.stage_files(stage), {
            Path("Android.bp"), Path("AndroidManifest.xml"),
            Path("res/values/config.xml"), Path("product.mk"), Path("artifact.json"),
        })
        self.assertIn("runtime_resource_overlay", (stage / "Android.bp").read_text())
        self.assertIn('android:targetName="OperatorAgentConfig"',
                      (stage / "AndroidManifest.xml").read_text())
        self.assertEqual(stager.verify_stage(self.tree)["canonicalConfigSha256"],
                         first["canonicalConfigSha256"])

    def test_unknown_secret_like_field_is_rejected(self):
        self.value["privateKey"] = "must-not-be-accepted"
        self.write()
        with self.assertRaisesRegex(ValueError, "unknown or missing"):
            stager.stage_overlay(self.tree, self.input)

    def test_non_https_or_mismatched_origins_are_rejected(self):
        for dock, webauthn in [
            ("http://operator.avocado.test", "http://operator.avocado.test"),
            ("https://operator.avocado.test/path", "https://operator.avocado.test/path"),
            ("https://operator.avocado.test", "https://auth.avocado.test"),
        ]:
            with self.subTest(dock=dock, webauthn=webauthn):
                self.value["dockOrigin"], self.value["webAuthnOrigin"] = dock, webauthn
                self.write()
                with self.assertRaisesRegex(ValueError, "HTTPS origin|origins must match"):
                    stager.stage_overlay(self.tree, self.input)

    def test_wrong_rp_or_non_p256_key_is_rejected(self):
        self.value["rpId"] = "avocado.test"
        self.write()
        with self.assertRaisesRegex(ValueError, "rpId"):
            stager.stage_overlay(self.tree, self.input)
        self.value["rpId"] = "operator.avocado.test"
        self.value["operatorPublicKeySpki"] = encoded(b"not-a-key" * 10)
        self.write()
        with self.assertRaisesRegex(ValueError, "DER|P-256"):
            stager.stage_overlay(self.tree, self.input)

    def test_attestation_challenge_must_be_fresh_sized_nonzero(self):
        for challenge in [b"short", bytes(32)]:
            with self.subTest(length=len(challenge)):
                self.value["deviceAttestationChallenge"] = encoded(challenge)
                self.write()
                with self.assertRaisesRegex(ValueError, "length|all zero"):
                    stager.stage_overlay(self.tree, self.input)

    def test_strongbox_and_factory_reset_boundaries_fail_closed(self):
        self.value["hardwareIdentityRequired"] = False
        self.write()
        with self.assertRaisesRegex(ValueError, "StrongBox"):
            stager.stage_overlay(self.tree, self.input)
        self.value["hardwareIdentityRequired"] = True
        self.value["factoryResetEnabled"] = True
        self.write()
        with self.assertRaisesRegex(ValueError, "factory reset"):
            stager.stage_overlay(self.tree, self.input)

    def test_quarantine_allowlist_excludes_product_packages(self):
        for packages in [["dev.rock.shell"], ["com.localactionassistant"],
                         ["com.z.connector", "com.a.connector"],
                         ["com.example.connector", "com.example.connector"]]:
            with self.subTest(packages=packages):
                self.value["quarantinePackages"] = packages
                self.write()
                with self.assertRaisesRegex(ValueError, "external connector|sorted unique"):
                    stager.stage_overlay(self.tree, self.input)

    def test_input_and_stage_symlinks_are_rejected(self):
        link = self.root / "operator-link.json"
        link.symlink_to(self.input)
        with self.assertRaisesRegex(ValueError, "must not be a symlink"):
            stager.stage_overlay(self.tree, link)
        stage = self.tree / stager.STAGE_PATH
        stage.parent.mkdir()
        stage.symlink_to(self.root / "escaped")
        with self.assertRaisesRegex(ValueError, "escapes"):
            stager.stage_overlay(self.tree, self.input)

    def test_tampered_or_extra_staged_file_is_rejected(self):
        stager.stage_overlay(self.tree, self.input)
        stage = self.tree / stager.STAGE_PATH
        (stage / "product.mk").write_text("changed")
        with self.assertRaisesRegex(ValueError, "changed"):
            stager.verify_stage(self.tree)
        (stage / "product.mk").write_text("PRODUCT_PACKAGES += AvocadoOperatorAgentConfig\n")
        (stage / "unexpected").write_text("extra")
        with self.assertRaisesRegex(ValueError, "differs"):
            stager.verify_stage(self.tree)


if __name__ == "__main__":
    unittest.main()

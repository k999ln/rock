"""Small synthetic JAR fixtures exercise staging; real crypto is tested in Android/JVM."""
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
import zipfile

spec = importlib.util.spec_from_file_location("model_crypto", Path(__file__).resolve().parents[1] / "scripts/stage-model-crypto.py")
stager = importlib.util.module_from_spec(spec)
spec.loader.exec_module(stager)


class ModelCryptoStageTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.tree = self.root / "tree"
        self.tree.mkdir()
        self.jar = self.root / "crypto.jar"
        with zipfile.ZipFile(self.jar, "w") as jar:
            for name in ["signers/Ed25519Signer", "params/Ed25519PublicKeyParameters"]:
                jar.writestr("org/bouncycastle/crypto/" + name + ".class", b"synthetic-not-executable")
        self.notice = self.root / "NOTICE"
        self.notice.write_text("Synthetic license fixture")
        self.lock = self.root / "lock.json"
        self.lock.write_text(json.dumps({"schema": "rock-model-crypto-artifact/1", "moduleName": "rock-model-crypto",
            "stagingPath": str(stager.STAGE), "bytes": self.jar.stat().st_size,
            "sha256": hashlib.sha256(self.jar.read_bytes()).hexdigest(), "coordinate": "synthetic:fixture:1", "licenseNoticeSha256": hashlib.sha256(self.notice.read_bytes()).hexdigest()}))
        old, old_notice = stager.LOCK, stager.NOTICE
        stager.LOCK, stager.NOTICE = self.lock, self.notice
        self.addCleanup(setattr, stager, "LOCK", old)
        self.addCleanup(setattr, stager, "NOTICE", old_notice)

    def test_stage_is_idempotent_and_verifies_exact_module_bytes(self):
        first = stager.stage(self.tree, self.jar)
        self.assertEqual(first, stager.stage(self.tree, self.jar))
        self.assertEqual(first, stager.verify(self.tree))
        self.assertIn('name: "rock-model-crypto"', (self.tree / stager.STAGE / "Android.bp").read_text())

    def test_changed_input_cannot_create_a_stage(self):
        data = bytearray(self.jar.read_bytes())
        data[-1] ^= 1
        self.jar.write_bytes(data)
        with self.assertRaisesRegex(ValueError, "SHA-256"):
            stager.stage(self.tree, self.jar)
        self.assertFalse((self.tree / stager.STAGE).exists())

    def test_symlink_and_unknown_files_are_rejected(self):
        (self.tree / "vendor").symlink_to(self.root, target_is_directory=True)
        with self.assertRaisesRegex(ValueError, "real directory"):
            stager.stage(self.tree, self.jar)
        (self.tree / "vendor").unlink()
        stager.stage(self.tree, self.jar)
        (self.tree / stager.STAGE / "unmanaged.txt").write_text("do not overwrite")
        with self.assertRaisesRegex(ValueError, "Unexpected"):
            stager.stage(self.tree, self.jar)

    def test_changed_staged_jar_or_metadata_never_verifies(self):
        stager.stage(self.tree, self.jar)
        (self.tree / stager.STAGE / "Android.bp").write_text("untrusted module")
        with self.assertRaisesRegex(ValueError, "metadata"):
            stager.verify(self.tree)

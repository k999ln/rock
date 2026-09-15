"""Verify deterministic overlay application without requiring Android tooling."""
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest

SPEC = importlib.util.spec_from_file_location(
    "local_ai_runtime", Path(__file__).resolve().parents[1] / "scripts/prepare-local-ai-runtime.py")
runtime = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(runtime)


class LocalAiRuntimePreparationTest(unittest.TestCase):
    def command(self, cwd, *args):
        return subprocess.check_output(args, cwd=cwd, stderr=subprocess.PIPE).decode().strip()

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name).resolve()
        self.root = self.base / "rock"
        overlay = self.root / "os/physical/local-ai-overlay.patch"
        overlay.parent.mkdir(parents=True)
        overlay.write_text("""diff --git a/source.txt b/source.txt
index df967b9..6310cd2 100644
--- a/source.txt
+++ b/source.txt
@@ -1 +1 @@
-base
+integrated
""")
        self.tree = self.base / "phone"
        source = self.tree / "external/local-action-assistant"
        source.mkdir(parents=True)
        (source / "source.txt").write_text("base\n")
        self.command(source, "git", "init", "-q")
        self.command(source, "git", "config", "user.name", "Fixture")
        self.command(source, "git", "config", "user.email", "fixture@example.invalid")
        self.command(source, "git", "add", ".")
        self.command(source, "git", "commit", "-qm", "source")
        commit = self.command(source, "git", "rev-parse", "HEAD")
        self.lock = self.root / "source-lock.json"
        self.lock.write_text(json.dumps({
            "commit": commit, "checkoutPath": "external/local-action-assistant",
            "overlay": {"status": "SERVER_SOURCE_IMPLEMENTED_NOT_NATIVE_BUILT",
                        "path": "os/physical/local-ai-overlay.patch",
                        "sha256": hashlib.sha256(overlay.read_bytes()).hexdigest()},
        }))
        (self.tree / "out").mkdir()
        self.old_root, self.old_lock = runtime.ROOT, runtime.SOURCE_LOCK
        runtime.ROOT, runtime.SOURCE_LOCK = self.root, self.lock
        self.addCleanup(setattr, runtime, "ROOT", self.old_root)
        self.addCleanup(setattr, runtime, "SOURCE_LOCK", self.old_lock)

    def test_clean_pinned_source_gets_overlay_in_new_output(self):
        output = self.tree / "out/runtime"
        evidence = runtime.prepare(self.tree, output)
        self.assertEqual((output / "source.txt").read_text(), "integrated\n")
        self.assertEqual(evidence["sourceCommit"], json.loads(self.lock.read_text())["commit"])
        self.assertEqual(json.loads((output / "rockstaros-overlay.json").read_text()), evidence)

    def test_existing_output_is_never_overwritten(self):
        output = self.tree / "out/runtime"
        output.mkdir()
        (output / "owned.txt").write_text("preserve\n")
        with self.assertRaisesRegex(ValueError, "new directory"):
            runtime.prepare(self.tree, output)
        self.assertEqual((output / "owned.txt").read_text(), "preserve\n")

    def test_dirty_or_wrong_source_is_rejected(self):
        source = self.tree / "external/local-action-assistant"
        (source / "source.txt").write_text("dirty\n")
        with self.assertRaisesRegex(ValueError, "local changes"):
            runtime.prepare(self.tree, self.tree / "out/runtime")

    def test_output_cannot_escape_os_out(self):
        with self.assertRaisesRegex(ValueError, "below the OS tree out"):
            runtime.prepare(self.tree, self.root / "runtime")


if __name__ == "__main__":
    unittest.main()

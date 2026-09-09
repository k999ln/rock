import json
import tempfile
import unittest
from pathlib import Path

from blackberryrock.manifests import ManifestError, load_and_validate


ROOT = Path(__file__).resolve().parents[1]


class ManifestTest(unittest.TestCase):
    def test_example_is_valid(self) -> None:
        manifest = load_and_validate(ROOT / "examples/tools/hello/tool.json")
        self.assertEqual(manifest["id"], "org.blackberryrock.hello")

    def test_github_source_requires_fixed_commit(self) -> None:
        data = json.loads((ROOT / "examples/tools/hello/tool.json").read_text(encoding="utf-8"))
        data["source"] = {
            "type": "github",
            "url": "https://github.com/example/tool",
            "commit": "main",
            "license": "MIT",
        }
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "tool.json"
            path.write_text(json.dumps(data), encoding="utf-8")
            with self.assertRaisesRegex(ManifestError, "40-character"):
                load_and_validate(path)

    def test_unknown_permission_is_rejected(self) -> None:
        data = json.loads((ROOT / "examples/tools/hello/tool.json").read_text(encoding="utf-8"))
        data["permissions"] = ["shell:root"]
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "tool.json"
            path.write_text(json.dumps(data), encoding="utf-8")
            with self.assertRaisesRegex(ManifestError, "unknown permission"):
                load_and_validate(path)

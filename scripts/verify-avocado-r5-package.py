"""Read-only verification of the delivered R5 package and its original ZIP."""
from pathlib import Path
import hashlib
import json
import zipfile

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / "docs/avocado-mini-r5"
PACKAGE = BASE / "package"
MANIFEST = json.loads((PACKAGE / "package_manifest.json").read_text())
EXPECTED = {entry["path"]: entry for entry in MANIFEST["files"]}
assert len(EXPECTED) == len(MANIFEST["files"]) == 26
assert MANIFEST["physical_tests_completed"] == 0
assert MANIFEST["classification"] == "統合基本設計・製造承認保留"
assert MANIFEST["pdf_pages"] == 51
for name, entry in EXPECTED.items():
    path = PACKAGE / name
    assert path.resolve().is_relative_to(PACKAGE.resolve()), name
    data = path.read_bytes()
    assert len(data) == entry["bytes"], name
    assert hashlib.sha256(data).hexdigest() == entry["sha256"], name

expected_files = set(EXPECTED) | {"package_manifest.json"}
actual_files = {
    str(path.relative_to(PACKAGE))
    for path in PACKAGE.rglob("*")
    if path.is_file() and "__pycache__" not in path.parts
}
assert actual_files == expected_files, actual_files ^ expected_files
svg = {p.stem for p in (PACKAGE / "drawings").glob("*.svg")}
png = {p.stem for p in (PACKAGE / "drawings").glob("*.png")}
assert len(svg) == 8 and svg == png
references = json.loads((PACKAGE / "reference_index.json").read_text())
assert len(references) == len({r["id"] for r in references}) == 36
assert all(r["url"].startswith("https://") for r in references)

archive = BASE / "avocadoMini_R5_Integrated_Design_Package.zip"
assert hashlib.sha256(archive.read_bytes()).hexdigest() == (
    "cf8256ceebe40f796d2f324cfc519a291d53b81867be043e8844fb9d6bc3a1f5"
)
with zipfile.ZipFile(archive) as bundle:
    prefix = "avocadoMini_R5_Integrated_Design/"
    names = bundle.namelist()
    assert len(names) == len(set(names)) == 27
    assert set(names) == {prefix + name for name in expected_files}
    assert bundle.testzip() is None
    for name in expected_files:
        assert bundle.read(prefix + name) == (PACKAGE / name).read_bytes(), name

for name in ("README.md", "RESEARCH_AUDIT.md"):
    assert (BASE / "research" / name).is_file(), name
assert len(list((BASE / "research/references").glob("*.md"))) == 3
print("R5 package PASS: 26 hashes; 27 ZIP members; 8 drawing pairs; 36 reference entries.")
print("Manufacturing HOLD; physical tests: 0. This is an archive-integrity check.")

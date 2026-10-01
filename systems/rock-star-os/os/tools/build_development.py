"""Build only local recipes with the existing PUBLIC RFC 8032 development fixture."""
import argparse
import hashlib
import json
from pathlib import Path

from blackberryrock.packages import canonical, digest
from blackberryrock.sdk import sign_development

ROOT = Path(__file__).resolve().parent
PROJECT = ROOT.parents[1]


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def build(check=False, registry=None):
    files, records = {}, []
    for path in sorted((ROOT / "packages").glob("*.recipe.json")):
        source = json.loads(path.read_text())
        package = sign_development(source)
        manifest = package["manifest"]
        filename = f"{manifest['id']}--{manifest['version']}.rock.json"
        content = canonical(package)
        files[ROOT / "dist" / filename] = content
        if registry is not None:
            destination = Path(registry) / filename
            if destination.exists() and destination.read_bytes() != content:
                raise ValueError(f"immutable registry version differs: {filename}")
            files[destination] = content
        records.append({"id": manifest["id"], "version": manifest["version"], "file": filename,
                        "source_file": str(path.relative_to(ROOT)), "source_sha256": sha(path),
                        "package_sha256": digest(package), "recipe_sha256": manifest["recipe_sha256"]})
    report = {"schema_version": 1, "signing": "public RFC 8032 section 7.1 fixture; NOT production trust",
              "new_signing_key_generated": False, "packages": records,
              "reference_provenance_sha256": sha(ROOT / "PROVENANCE.json"),
              "runtime_source_sha256": {str(path.relative_to(PROJECT)): sha(path) for path in
                                        (PROJECT / "src/blackberryrock/recipe_worker.py",
                                         PROJECT / "src/blackberryrock/packages.py")}}
    files[ROOT / "dist/BUILD-MANIFEST.json"] = canonical(report) + b"\n"
    for path, content in files.items():
        if check:
            if not path.is_file() or path.read_bytes() != content:
                raise ValueError(f"reproducibility mismatch: {path}")
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(content)
    print(json.dumps({"result": "PASS", "mode": "check" if check else "build",
                      "packages": len(records), "production_trust": False}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--registry", type=Path)
    arguments = parser.parse_args()
    build(arguments.check, arguments.registry)

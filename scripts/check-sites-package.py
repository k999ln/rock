"""Read-only inspection of a locally prepared Sites Worker archive."""
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import sys
import tarfile


def digest(stream):
    value = hashlib.sha256()
    while chunk := stream.read(1024 * 1024):
        value.update(chunk)
    return value.hexdigest()


def audit(archive, root):
    root = root.resolve()
    dist = root / "dist"
    config = json.loads((dist / "server/wrangler.json").read_text())
    hosting = json.loads((root / ".openai/hosting.json").read_text())
    if config.get("main") != "index.js" or config.get("assets") != {
        "directory": "../client", "binding": "ASSETS", "run_worker_first": True
    }:
        raise ValueError("Source asset routing is not the accepted Worker-first configuration")
    db = [x for x in config.get("d1_databases", []) if x.get("binding") == hosting.get("d1")]
    if len(db) != 1 or not db[0].get("migrations_dir"):
        raise ValueError("Source must select one D1 migration owner")
    migrations = (dist / "server" / db[0]["migrations_dir"]).resolve()
    if not migrations.is_relative_to(root) or not migrations.is_dir():
        raise ValueError("Source migration directory is outside this checkout or absent")
    expected_sql = {p.name: p for p in migrations.glob("*.sql") if not p.name.startswith("._")}
    names, file_names, observed_sql, files, total = set(), set(), set(), 0, 0
    with tarfile.open(archive, "r:gz") as package:
        for member in package:
            name = PurePosixPath(member.name)
            if (name.is_absolute() or ".." in name.parts or not name.parts or name.parts[0] != "dist"
                    or "\\" in member.name or any(ord(c) < 32 for c in member.name)):
                raise ValueError("Archive contains an unsafe or unrelated path")
            if any(p.startswith("._") or p == "__MACOSX" for p in name.parts):
                raise ValueError("Archive contains AppleDouble metadata")
            if member.name in names:
                raise ValueError("Archive contains duplicate entries")
            names.add(member.name)
            if len(names) > 10000 or member.size > 128 * 1024 * 1024:
                raise ValueError("Archive exceeds the inspection budget")
            total += member.size
            if total > 512 * 1024 * 1024 or not (member.isfile() or member.isdir()):
                raise ValueError("Archive contains a link, special file or exceeds the inspection budget")
            if member.isdir():
                continue
            files += 1
            file_names.add(member.name)
            source = root.joinpath(*name.parts)
            if source.is_symlink() or not source.is_file() or not source.resolve().is_relative_to(dist.resolve()):
                raise ValueError("Archive contains a file absent from the accepted build")
            stream = package.extractfile(member)
            if member.name == "dist/.openai/hosting.json":
                actual = json.load(stream)
                built = json.loads(source.read_text())
                if actual != built or actual.get("project_id") != hosting.get("project_id"):
                    raise ValueError("Archive hosting identity or metadata differs from the selected Site")
            else:
                with source.open("rb") as original:
                    if digest(stream) != digest(original):
                        raise ValueError("Archive bytes differ from the accepted build: " + member.name)
            if name.parts[:3] == ("dist", ".openai", "drizzle") and name.suffix == ".sql":
                if name.name not in expected_sql:
                    raise ValueError("Archive mixes migration lineages")
                with expected_sql[name.name].open("rb") as original, source.open("rb") as staged:
                    if digest(original) != digest(staged):
                        raise ValueError("Packaged migration differs from the selected Source lineage")
                observed_sql.add(name.name)
    required = {"dist/server/index.js", "dist/server/vinext.js", "dist/server/domain-router.mjs",
                "dist/server/wrangler.json", "dist/.openai/hosting.json"}
    expected_files = {p.relative_to(root).as_posix() for p in dist.rglob("*") if p.is_file()}
    if file_names != expected_files:
        raise ValueError("Archive file set differs from the accepted build")
    if not required.issubset(names) or observed_sql != set(expected_sql):
        raise ValueError("Archive is incomplete or lacks the exact migration lineage")
    with archive.open("rb") as stream:
        checksum = digest(stream)
    return {"schema": "rockstaros.sites-package-inspection/1", "status": "PASS",
            "archiveSha256": checksum, "filesCompared": files, "sqlFiles": len(observed_sql),
            "workerFirstPreserved": True, "projectId": hosting["project_id"], "publicAcceptance": False}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("archive", type=Path)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parent.parent)
    args = parser.parse_args()
    try:
        print(json.dumps(audit(args.archive, args.root)))
    except (ValueError, OSError, tarfile.TarError, KeyError, TypeError) as error:
        print("Sites package check failed: " + str(error), file=sys.stderr)
        sys.exit(1)

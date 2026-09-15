#!/usr/bin/env python3
"""Create a disposable local-AI build tree by applying the reviewed OS overlay."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tarfile
import tempfile

ROOT = Path(__file__).resolve().parents[1]
SOURCE_LOCK = ROOT / "os/physical/local-action-assistant-source-lock.json"


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def git(directory, *args):
    return subprocess.check_output(["git", "-C", str(directory), *args],
                                   stderr=subprocess.PIPE, timeout=30).decode().strip()


def safe_archive(source, revision, destination):
    process = subprocess.Popen(["git", "-C", str(source), "archive", "--format=tar", revision],
                               stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    try:
        if process.stdout is None:
            raise ValueError("git archive did not provide output")
        with tarfile.open(fileobj=process.stdout, mode="r|") as archive:
            for member in archive:
                name = Path(member.name)
                if name.is_absolute() or ".." in name.parts or not (member.isdir() or member.isfile()):
                    raise ValueError("source archive contains an unsafe entry")
                target = destination / name
                if member.isdir():
                    target.mkdir(parents=True, exist_ok=True)
                    continue
                target.parent.mkdir(parents=True, exist_ok=True)
                extracted = archive.extractfile(member)
                if extracted is None:
                    raise ValueError("source archive entry is unreadable")
                with target.open("xb") as output:
                    shutil.copyfileobj(extracted, output, 1024 * 1024)
                os.chmod(target, member.mode & 0o777)
        stderr = process.stderr.read().decode("utf-8", "replace") if process.stderr else ""
        if process.wait(timeout=30) != 0:
            raise ValueError(f"git archive failed: {stderr[:200]}")
    finally:
        if process.poll() is None:
            process.kill(); process.wait()
        if process.stdout is not None:
            process.stdout.close()
        if process.stderr is not None:
            process.stderr.close()


def config():
    lock = json.loads(SOURCE_LOCK.read_text())
    overlay = lock.get("overlay")
    if (lock.get("commit") is None or not isinstance(overlay, dict)
            or overlay.get("status") != "SERVER_SOURCE_IMPLEMENTED_NOT_NATIVE_BUILT"
            or overlay.get("path") != "os/physical/local-ai-overlay.patch"
            or not isinstance(overlay.get("sha256"), str)):
        raise ValueError("invalid local-AI overlay lock")
    patch = ROOT / overlay["path"]
    if sha256(patch) != overlay["sha256"]:
        raise ValueError("local-AI overlay differs from the source lock")
    return lock, patch


def prepare(os_tree, output):
    lock, patch = config()
    os_tree = os_tree.resolve(strict=True)
    source = os_tree / lock["checkoutPath"]
    if source.is_symlink() or not source.resolve(strict=True).is_relative_to(os_tree):
        raise ValueError("local-AI source must be inside the OS tree")
    if git(source, "rev-parse", "HEAD") != lock["commit"]:
        raise ValueError("wrong local-AI source revision")
    if git(source, "status", "--porcelain", "--untracked-files=normal"):
        raise ValueError("local-AI source contains local changes")
    output = output.absolute()
    out_root = os_tree / "out"
    if out_root.is_symlink():
        raise ValueError("OS output directory must not be a symlink")
    out_root.mkdir(exist_ok=True)
    if output.exists() or not output.parent.resolve(strict=True).is_relative_to(out_root.resolve()):
        raise ValueError("output must be a new directory below the OS tree out directory")
    temporary = Path(tempfile.mkdtemp(prefix=".rock-local-ai-source-", dir=output.parent))
    try:
        safe_archive(source, lock["commit"], temporary)
        subprocess.check_call(["git", "apply", "--check", str(patch)], cwd=temporary,
                              stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, timeout=30)
        subprocess.check_call(["git", "apply", str(patch)], cwd=temporary,
                              stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, timeout=30)
        evidence = {"schema": "rock-local-ai-overlay/1", "sourceCommit": lock["commit"],
                    "overlaySha256": sha256(patch),
                    "status": "SERVER_SOURCE_IMPLEMENTED_NOT_NATIVE_BUILT"}
        (temporary / "rockstaros-overlay.json").write_text(json.dumps(evidence, indent=2) + "\n")
        os.replace(temporary, output)
    finally:
        if temporary.exists():
            shutil.rmtree(temporary)
    return evidence


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("os_tree", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    try:
        print(json.dumps(prepare(args.os_tree, args.output), indent=2)); return 0
    except (ValueError, OSError, subprocess.SubprocessError, json.JSONDecodeError) as error:
        print(f"Local-AI runtime preparation failed: {error}", file=sys.stderr); return 1


if __name__ == "__main__":
    sys.exit(main())

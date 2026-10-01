#!/usr/bin/env python3
"""Verify and stage one lock-pinned local-AI APK for a physical AOSP build."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parents[1]
SOURCE_LOCK = ROOT / "os/physical/local-action-assistant-source-lock.json"
ARTIFACT_LOCK = ROOT / "os/physical/local-action-assistant-artifact-lock.json"
STAGE_PATH = Path("vendor/rockstaros-local-ai")
APK_NAME = "LocalActionAssistant-unsigned.apk"


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def artifact_config(lock, source_lock):
    if (not isinstance(lock, dict) or lock.get("schema") != "rock-local-ai-apk/1"
            or lock.get("stage") not in ("APK_NOT_BUILT", "APK_REVIEWED_NOT_IN_IMAGE")
            or lock.get("sourceCommit") != source_lock.get("commit")
            or lock.get("moduleName") != "RockLocalActionAssistant"
            or lock.get("packageName") != "com.localactionassistant"
            or lock.get("versionCode") != 1
            or lock.get("requiredAbis") != ["arm64-v8a"]
            or lock.get("internetPermission") is not False
            or lock.get("wakeLockPermission") is not True
            or lock.get("binderPermission") != "dev.rock.permission.USE_LOCAL_AI"
            or lock.get("aospCertificate") != "testkey"
            or lock.get("imageIntegrated") is not False):
        raise ValueError("invalid local-AI APK lock")
    digest, size = lock.get("apkSha256"), lock.get("apkSizeBytes")
    if lock["stage"] == "APK_NOT_BUILT":
        if digest is not None or size is not None:
            raise ValueError("unbuilt local-AI APK lock must not contain artifact identity")
    elif (not isinstance(digest, str) or re.fullmatch(r"[0-9a-f]{64}", digest) is None
          or not isinstance(size, int) or size <= 0 or size > 2 * 1024 ** 3):
        raise ValueError("reviewed local-AI APK lock requires a bounded hash and size")
    return lock


def inspect_apk(apk, aapt2):
    if apk.is_symlink():
        raise ValueError("APK must not be a symlink")
    apk = apk.resolve(strict=True)
    if not apk.is_file() or apk.stat().st_size <= 0 or apk.stat().st_size > 2 * 1024 ** 3:
        raise ValueError("APK must be a regular file")
    try:
        with zipfile.ZipFile(apk) as archive:
            infos = archive.infolist()
            names = [entry.filename for entry in infos]
            if len(names) > 100000 or len(names) != len(set(names)):
                raise ValueError("APK contains duplicate ZIP entries")
            if any(name.startswith("/") or "\\" in name or ".." in Path(name).parts
                   or entry.file_size > 1024 ** 3
                   for name, entry in zip(names, infos)):
                raise ValueError("APK contains an unsafe ZIP entry")
            for required in ("AndroidManifest.xml", "classes.dex"):
                if required not in names:
                    raise ValueError(f"APK is missing {required}")
            native_abis = {Path(name).parts[1] for name in names
                           if len(Path(name).parts) >= 3 and Path(name).parts[0] == "lib"
                           and name.endswith(".so")}
            if native_abis != {"arm64-v8a"}:
                raise ValueError("APK native libraries must be arm64-v8a only")
            if sum(entry.file_size for entry in infos) > 4 * 1024 ** 3:
                raise ValueError("APK expanded content exceeds the review limit")
            if archive.testzip() is not None:
                raise ValueError("APK ZIP integrity check failed")
    except zipfile.BadZipFile as error:
        raise ValueError("invalid APK ZIP") from error
    output = subprocess.check_output(
        [str(aapt2.resolve(strict=True)), "dump", "badging", str(apk)],
        stderr=subprocess.PIPE, timeout=30).decode("utf-8", "strict")
    package = re.search(r"^package: name='([^']+)' versionCode='([^']+)'", output, re.MULTILINE)
    if package is None or package.group(1) != "com.localactionassistant" or package.group(2) != "1":
        raise ValueError("APK package/version differs from the integration contract")
    if re.search(r"^uses-permission(?:-[^:]+)?: name='android\.permission\.INTERNET'", output,
                 re.MULTILINE):
        raise ValueError("release APK must not request INTERNET permission")
    if re.search(r"^uses-permission(?:-[^:]+)?: name='android\.permission\.WAKE_LOCK'", output,
                 re.MULTILINE) is None:
        raise ValueError("release APK must request WAKE_LOCK for Headless JS")
    if re.search(r"^uses-permission(?:-[^:]+)?: name='dev\.rock\.permission\.USE_LOCAL_AI'", output,
                 re.MULTILINE) is None:
        raise ValueError("release APK must request the signed Binder permission")
    return {"packageName": package.group(1), "versionCode": 1,
            "sha256": sha256(apk), "sizeBytes": apk.stat().st_size,
            "requiredAbis": ["arm64-v8a"], "internetPermission": False,
            "wakeLockPermission": True,
            "binderPermission": "dev.rock.permission.USE_LOCAL_AI"}


def generated_files(metadata):
    blueprint = '''android_app_import {
    name: "RockLocalActionAssistant",
    apk: "LocalActionAssistant-unsigned.apk",
    certificate: "testkey",
    product_specific: true,
    dex_preopt: { enabled: false },
}
'''
    product = 'PRODUCT_PACKAGES += RockLocalActionAssistant\n'
    return {"Android.bp": blueprint.encode(), "product.mk": product.encode(),
            "artifact.json": (json.dumps(metadata, indent=2) + "\n").encode()}


def safe_stage_directory(tree):
    tree = tree.resolve(strict=True)
    stage = tree / STAGE_PATH
    if stage.is_symlink():
        raise ValueError("local-AI stage directory must not be a symlink")
    stage.parent.mkdir(parents=True, exist_ok=True)
    if not stage.parent.resolve().is_relative_to(tree):
        raise ValueError("local-AI stage directory escapes the OS tree")
    stage.mkdir(exist_ok=True)
    if not stage.resolve().is_relative_to(tree):
        raise ValueError("local-AI stage directory escapes the OS tree")
    return stage


def stage_apk(tree, apk, aapt2):
    source_lock = json.loads(SOURCE_LOCK.read_text())
    lock = artifact_config(json.loads(ARTIFACT_LOCK.read_text()), source_lock)
    if lock["stage"] != "APK_REVIEWED_NOT_IN_IMAGE":
        raise ValueError("local-AI APK is not built and reviewed in the artifact lock")
    metadata = inspect_apk(apk, aapt2)
    if metadata["sha256"] != lock["apkSha256"] or metadata["sizeBytes"] != lock["apkSizeBytes"]:
        raise ValueError("local-AI APK differs from the reviewed artifact lock")
    metadata.update({"schema": "rock-local-ai-staged-apk/1", "sourceCommit": lock["sourceCommit"],
                     "moduleName": lock["moduleName"], "aospCertificate": lock["aospCertificate"]})
    stage = safe_stage_directory(tree)
    expected = generated_files(metadata)
    existing = {path.name for path in stage.iterdir()}
    if existing and existing != set(expected) | {APK_NAME}:
        raise ValueError("local-AI stage directory contains unexpected files")
    for name, content in expected.items():
        target = stage / name
        if target.is_symlink():
            raise ValueError("local-AI staged file must not be a symlink")
        if target.exists() and target.read_bytes() == content:
            continue
        fd, temporary = tempfile.mkstemp(prefix=".rock-local-ai-", dir=stage)
        try:
            with os.fdopen(fd, "wb") as output:
                output.write(content); output.flush(); os.fsync(output.fileno())
            os.replace(temporary, target)
        finally:
            Path(temporary).unlink(missing_ok=True)
    target_apk = stage / APK_NAME
    if not target_apk.exists() or sha256(target_apk) != metadata["sha256"]:
        fd, temporary = tempfile.mkstemp(prefix=".rock-local-ai-apk-", dir=stage)
        os.close(fd)
        try:
            shutil.copyfile(apk, temporary)
            if sha256(Path(temporary)) != metadata["sha256"]:
                raise ValueError("APK changed while staging")
            os.replace(temporary, target_apk)
        finally:
            Path(temporary).unlink(missing_ok=True)
    return metadata


def verify_stage(tree):
    source_lock = json.loads(SOURCE_LOCK.read_text())
    lock = artifact_config(json.loads(ARTIFACT_LOCK.read_text()), source_lock)
    if lock["stage"] != "APK_REVIEWED_NOT_IN_IMAGE":
        raise ValueError("local-AI APK is not reviewed")
    stage = safe_stage_directory(tree)
    metadata = json.loads((stage / "artifact.json").read_text())
    expected = generated_files(metadata)
    if {path.name for path in stage.iterdir()} != set(expected) | {APK_NAME}:
        raise ValueError("local-AI stage directory differs from the generated contract")
    for name, content in expected.items():
        if (stage / name).read_bytes() != content:
            raise ValueError(f"staged local-AI metadata changed: {name}")
    apk = stage / APK_NAME
    if sha256(apk) != lock["apkSha256"] or apk.stat().st_size != lock["apkSizeBytes"]:
        raise ValueError("staged local-AI APK changed")
    return metadata


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    inspect = commands.add_parser("inspect")
    inspect.add_argument("apk", type=Path); inspect.add_argument("--aapt2", required=True, type=Path)
    stage = commands.add_parser("stage")
    stage.add_argument("os_tree", type=Path); stage.add_argument("apk", type=Path)
    stage.add_argument("--aapt2", required=True, type=Path)
    verify = commands.add_parser("verify")
    verify.add_argument("os_tree", type=Path)
    args = parser.parse_args()
    try:
        if args.command == "inspect": result = inspect_apk(args.apk, args.aapt2)
        elif args.command == "stage": result = stage_apk(args.os_tree, args.apk, args.aapt2)
        else: result = verify_stage(args.os_tree)
        print(json.dumps(result, indent=2)); return 0
    except (ValueError, OSError, subprocess.SubprocessError, json.JSONDecodeError) as error:
        print(f"Local-AI APK staging failed: {error}", file=sys.stderr); return 1


if __name__ == "__main__":
    sys.exit(main())

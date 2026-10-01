#!/usr/bin/env python3
"""Freeze and verify the non-secret inputs required before a Pixel OS build.

This tool does not accept Google terms, download artifacts, create keys, sign,
build, flash or access a device. Google recovery bytes and the owner's detached
terms record must be supplied from outside the Rock repository.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import stat
import subprocess
import sys
import tempfile
from urllib.parse import urlsplit
import zipfile


ROOT = Path(__file__).resolve().parents[1]
SOURCE_LOCK = ROOT / "os/physical/frankel-source-lock.json"
SIGNING_POLICY = ROOT / "data/android-signing-custody-policy.json"
SIGNING_DOCUMENT = ROOT / "docs/android-production-signing-custody.md"
TARGET = {
    "manufacturer": "Google",
    "model": "Pixel 10",
    "codename": "frankel",
    "sku": "GL066",
}
FACTORY_PAGE = "https://developers.google.com/android/images"
OTA_PAGE = "https://developers.google.com/android/ota"
MAX_RECOVERY_BYTES = 32 * 1024 ** 3
MAX_ZIP_ENTRIES = 100000
MAX_ZIP_EXPANDED_BYTES = 96 * 1024 ** 3
MAX_VENDOR_FILES = 200000
MAX_VENDOR_BYTES = 64 * 1024 ** 3


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True,
                      separators=(",", ":")).encode()


def sha256_path(path):
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def exact_external_file(path, label, maximum=MAX_RECOVERY_BYTES):
    if path.is_symlink():
        raise ValueError(f"{label} must not be a symlink")
    resolved = path.resolve(strict=True)
    size = resolved.stat().st_size
    if not resolved.is_file() or size <= 0 or size > maximum:
        raise ValueError(f"{label} must be a bounded regular file")
    if resolved.is_relative_to(ROOT):
        raise ValueError(f"{label} must remain outside the Rock repository")
    return resolved


def safe_zip(path, label):
    try:
        archive = zipfile.ZipFile(path)
    except zipfile.BadZipFile as error:
        raise ValueError(f"{label} is not a valid ZIP") from error
    infos = archive.infolist()
    names = [info.filename for info in infos]
    if not infos or len(infos) > MAX_ZIP_ENTRIES or len(names) != len(set(names)):
        archive.close()
        raise ValueError(f"{label} has duplicate or excessive ZIP entries")
    expanded = 0
    for info in infos:
        mode = info.external_attr >> 16
        raw_parts = info.filename.split("/")
        if info.is_dir() and raw_parts[-1] == "":
            raw_parts = raw_parts[:-1]
        if (info.filename.startswith("/") or "\\" in info.filename
                or not raw_parts or any(part in ("", ".", "..") for part in raw_parts)
                or info.flag_bits & 0x1 or stat.S_ISLNK(mode)):
            archive.close()
            raise ValueError(f"{label} has an unsafe ZIP entry")
        expanded += info.file_size
        if expanded > MAX_ZIP_EXPANDED_BYTES:
            archive.close()
            raise ValueError(f"{label} expanded content exceeds the review limit")
    return archive


def bounded_member(archive, name, maximum=1024 * 1024):
    try:
        info = archive.getinfo(name)
    except KeyError as error:
        raise ValueError(f"recovery ZIP is missing {name}") from error
    if info.file_size <= 0 or info.file_size > maximum:
        raise ValueError(f"recovery ZIP member {name} has an unsafe size")
    value = archive.read(info)
    if len(value) != info.file_size:
        raise ValueError(f"recovery ZIP member {name} changed while reading")
    return value


def parse_ota(ota):
    with safe_zip(ota, "full OTA") as archive:
        raw = bounded_member(archive, "META-INF/com/android/metadata")
        try:
            lines = raw.decode("utf-8", "strict").splitlines()
        except UnicodeDecodeError as error:
            raise ValueError("full OTA metadata is not UTF-8") from error
        metadata = {}
        for line in lines:
            if not line or "=" not in line:
                continue
            key, value = line.split("=", 1)
            if key in metadata:
                raise ValueError("full OTA metadata has duplicate keys")
            metadata[key] = value
        devices = set(metadata.get("post-device", "").split(","))
        if TARGET["codename"] not in devices or metadata.get("ota-type") != "AB":
            raise ValueError("full OTA is not an A/B package for frankel")
        fingerprint = metadata.get("post-build", "")
        try:
            build_id = fingerprint.split(":", 1)[1].split("/", 3)[1]
        except (IndexError, AttributeError) as error:
            raise ValueError("full OTA does not expose an exact build ID") from error
        if re.fullmatch(r"[A-Za-z0-9._-]{3,96}", build_id) is None:
            raise ValueError("full OTA build ID is invalid")
        bad = archive.testzip()
        if bad is not None:
            raise ValueError(f"full OTA ZIP integrity failed at {bad}")
    return build_id


def parse_factory(factory, build_id):
    with safe_zip(factory, "factory image") as archive:
        image_entries = [info.filename for info in archive.infolist()
                         if PurePosixPath(info.filename).name.startswith("image-frankel-")
                         and info.filename.endswith(".zip")]
        if len(image_entries) != 1:
            raise ValueError("factory image must contain one frankel image ZIP")
        image_name = PurePosixPath(image_entries[0]).name
        if build_id.lower() not in image_name.lower() or build_id.lower() not in factory.name.lower():
            raise ValueError("factory image and full OTA build IDs do not match")
        scripts = [name for name in ("flash-all.sh", "flash-all.bat")
                   if name in archive.namelist()]
        if not scripts:
            raise ValueError("factory image is missing the official flash script")
        for name in scripts:
            script = bounded_member(archive, name).decode("utf-8", "strict")
            if image_name not in script:
                raise ValueError("factory flash script does not reference the matching image ZIP")
        bad = archive.testzip()
        if bad is not None:
            raise ValueError(f"factory image ZIP integrity failed at {bad}")


def terms_record(path):
    path = exact_external_file(path, "Google terms record", 64 * 1024)
    value = json.loads(path.read_text(encoding="utf-8"))
    expected = {
        "schema", "target", "acceptedByOwner", "acceptedAt", "factoryPage",
        "fullOtaPage", "scope", "artifactRedistributionAllowed",
        "flashOrWipeAuthorized", "officialSelection",
    }
    if not isinstance(value, dict) or set(value) != expected:
        raise ValueError("Google terms record has unknown or missing fields")
    if (value["schema"] != "avocadoos-google-recovery-terms/1"
            or value["target"] != TARGET
            or value["acceptedByOwner"] is not True
            or re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z",
                            value["acceptedAt"] or "") is None
            or value["factoryPage"] != FACTORY_PAGE
            or value["fullOtaPage"] != OTA_PAGE
            or value["scope"] != "personal_owned_pixel_10_recovery_download"
            or value["artifactRedistributionAllowed"] is not False
            or value["flashOrWipeAuthorized"] is not False):
        raise ValueError("Google terms acceptance must be explicit and download-only")
    selection = value["officialSelection"]
    if (not isinstance(selection, dict)
            or set(selection) != {"buildId", "factoryImage", "fullOta"}
            or re.fullmatch(r"[A-Za-z0-9._-]{3,96}", selection.get("buildId") or "") is None):
        raise ValueError("Google official selection record is incomplete")
    for label in ("factoryImage", "fullOta"):
        artifact = selection.get(label)
        if (not isinstance(artifact, dict)
                or set(artifact) != {"downloadUrl", "fileName", "sha256"}
                or re.fullmatch(r"[A-Za-z0-9._-]+\.zip", artifact.get("fileName") or "") is None
                or re.fullmatch(r"[0-9a-f]{64}", artifact.get("sha256") or "") is None):
            raise ValueError("Google official artifact identity is incomplete")
        parsed = urlsplit(artifact["downloadUrl"])
        if (parsed.scheme != "https" or parsed.hostname != "dl.google.com"
                or parsed.username is not None or parsed.password is not None
                or parsed.port not in (None, 443) or parsed.query or parsed.fragment
                or not parsed.path.startswith("/dl/android/aosp/")
                or PurePosixPath(parsed.path).name != artifact["fileName"]):
            raise ValueError("Google artifact URL must be the exact official download URL")
    return value


def recovery_record(factory_path, ota_path, terms_path):
    factory = exact_external_file(factory_path, "factory image")
    ota = exact_external_file(ota_path, "full OTA")
    terms = terms_record(terms_path)
    build_id = parse_ota(ota)
    parse_factory(factory, build_id)
    selection = terms["officialSelection"]
    factory_sha = sha256_path(factory)
    ota_sha = sha256_path(ota)
    if (selection["buildId"] != build_id
            or selection["factoryImage"]["fileName"] != factory.name
            or selection["fullOta"]["fileName"] != ota.name
            or selection["factoryImage"]["sha256"] != factory_sha
            or selection["fullOta"]["sha256"] != ota_sha):
        raise ValueError("local recovery bytes differ from the Google official selection record")
    return {
        "schema": "avocadoos-google-stock-recovery-artifacts/1",
        "target": TARGET,
        "buildId": build_id,
        "selection": "same_latest_stable_factory_and_full_ota_at_firmware_freeze",
        "terms": {
            "acceptedByOwner": True,
            "acceptedAt": terms["acceptedAt"],
            "scope": terms["scope"],
            "flashOrWipeAuthorized": False,
        },
        "factoryImage": {
            "fileName": factory.name,
            "bytes": factory.stat().st_size,
            "sha256": factory_sha,
            "downloadUrl": selection["factoryImage"]["downloadUrl"],
            "purpose": "last_resort_wipe_recovery",
        },
        "fullOta": {
            "fileName": ota.name,
            "bytes": ota.stat().st_size,
            "sha256": ota_sha,
            "downloadUrl": selection["fullOta"]["downloadUrl"],
            "purpose": "non_wipe_recovery_and_both_slot_bootability",
        },
        "artifactBytesStoredInGit": False,
        "downloadDoesNotAuthorizeFlashOrWipe": True,
    }


def source_lock():
    value = json.loads(SOURCE_LOCK.read_text(encoding="utf-8"))
    if (value.get("schema") != "rock-phone-source/2"
            or value.get("device") != "frankel"
            or value.get("model") != "Google Pixel 10"
            or value.get("confirmedSku") != "GL066"
            or value.get("targetConfirmedByOwner") is not True
            or value.get("vendor", {}).get("generationCommand") !=
            "adevtool generate-all -d frankel"
            or re.fullmatch(r"[0-9a-f]{40}", value.get("adevtoolCommit", "")) is None):
        raise ValueError("Pixel 10 source lock is invalid")
    return value


def git(directory, *args):
    return subprocess.check_output(
        ["git", "-C", str(directory), *args], stderr=subprocess.PIPE, timeout=30
    ).decode().strip()


def vendor_entries(os_tree):
    lock = source_lock()
    tree = os_tree.resolve(strict=True)
    adevtool = tree / "vendor/adevtool"
    if git(adevtool, "rev-parse", "HEAD") != lock["adevtoolCommit"]:
        raise ValueError("vendor inventory uses the wrong adevtool revision")
    vendor = tree / "vendor/google_devices"
    if vendor.is_symlink() or not vendor.resolve(strict=True).is_relative_to(tree):
        raise ValueError("generated vendor root is unsafe")
    for required in ("frankel/frankel.mk", "frankel/BoardConfig.mk"):
        if not (vendor / required).is_file():
            raise ValueError(f"generated vendor input is missing {required}")
    result = []
    total = 0
    for base, directories, files in os.walk(vendor, topdown=True, followlinks=False):
        base_path = Path(base)
        kept = []
        for name in sorted(directories):
            path = base_path / name
            if path.is_symlink():
                resolved = path.resolve(strict=True)
                if not resolved.is_relative_to(vendor.resolve()):
                    raise ValueError("generated vendor symlink escapes the inventory root")
                result.append({"path": path.relative_to(vendor).as_posix(),
                               "type": "symlink", "target": os.readlink(path)})
            else:
                kept.append(name)
        directories[:] = kept
        for name in sorted(files):
            path = base_path / name
            relative = path.relative_to(vendor).as_posix()
            if ".git" in PurePosixPath(relative).parts:
                raise ValueError("generated vendor inventory must not contain Git metadata")
            if path.is_symlink():
                resolved = path.resolve(strict=True)
                if not resolved.is_relative_to(vendor.resolve()):
                    raise ValueError("generated vendor symlink escapes the inventory root")
                result.append({"path": relative, "type": "symlink",
                               "target": os.readlink(path)})
            elif path.is_file():
                size = path.stat().st_size
                total += size
                if total > MAX_VENDOR_BYTES:
                    raise ValueError("generated vendor bytes exceed the inventory limit")
                result.append({"path": relative, "type": "file", "bytes": size,
                               "sha256": sha256_path(path)})
            else:
                raise ValueError("generated vendor inventory contains a special file")
            if len(result) > MAX_VENDOR_FILES:
                raise ValueError("generated vendor inventory contains too many files")
    result.sort(key=lambda item: item["path"])
    return lock, result, total


def vendor_inventory(os_tree):
    lock, files, total = vendor_entries(os_tree)
    return {
        "schema": "avocadoos-frankel-vendor-inventory/1",
        "target": TARGET,
        "manifestTag": lock["manifestTag"],
        "adevtoolCommit": lock["adevtoolCommit"],
        "generationCommand": lock["vendor"]["generationCommand"],
        "vendorRoot": "vendor/google_devices",
        "fileCount": len(files),
        "totalRegularFileBytes": total,
        "filesSha256": hashlib.sha256(canonical(files)).hexdigest(),
        "files": files,
        "redistributionReviewCompleted": False,
        "fullBuildCompleted": False,
    }


def verify_vendor(os_tree, inventory_path):
    if inventory_path.is_symlink():
        raise ValueError("vendor inventory must not be a symlink")
    recorded = json.loads(inventory_path.resolve(strict=True).read_text(encoding="utf-8"))
    actual = vendor_inventory(os_tree)
    if recorded != actual:
        raise ValueError("generated vendor tree changed after inventory freeze")
    return actual


def signing_plan():
    policy = json.loads(SIGNING_POLICY.read_text(encoding="utf-8"))
    if (policy.get("schema") != "avocadoos-android-signing-custody/1"
            or policy.get("status") !=
            "architecture_approved_provisioning_and_end_to_end_signing_pending"
            or policy.get("architecture", {}).get("hsmModel") != "YubiHSM 2"
            or policy.get("architecture", {}).get("hsmQuantity") != 2
            or policy.get("architecture", {}).get("rawPrivateKeyExportAllowed") is not False
            or policy.get("keySeparation", {}).get("requiredRoleClasses") !=
            ["avb", "ota", "system-applications", "apex-system-components"]):
        raise ValueError("production signing custody policy is not the approved pending plan")
    document = SIGNING_DOCUMENT.read_bytes()
    return {
        "schema": "avocadoos-android-signing-plan-freeze/1",
        "target": TARGET,
        "policyPath": "data/android-signing-custody-policy.json",
        "policySha256": hashlib.sha256(SIGNING_POLICY.read_bytes()).hexdigest(),
        "procedurePath": "docs/android-production-signing-custody.md",
        "procedureSha256": hashlib.sha256(document).hexdigest(),
        "roleClasses": policy["keySeparation"]["requiredRoleClasses"],
        "rawPrivateKeyExportAllowed": False,
        "hsmProvisioned": False,
        "signingBridgesVerified": False,
        "exactKeyInventoryPendingTargetFiles": True,
        "productionSigningReady": False,
    }


def write_result(value, output):
    content = (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode()
    if output is None:
        sys.stdout.buffer.write(content)
        return
    if output.is_symlink():
        raise ValueError("output must not be a symlink")
    output.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix=".phone-inputs-", dir=output.parent)
    try:
        with os.fdopen(fd, "wb") as destination:
            destination.write(content)
            destination.flush()
            os.fsync(destination.fileno())
        os.replace(temporary, output)
    finally:
        Path(temporary).unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    recovery = commands.add_parser("recovery")
    recovery.add_argument("factory", type=Path)
    recovery.add_argument("ota", type=Path)
    recovery.add_argument("terms", type=Path)
    recovery.add_argument("--output", type=Path)
    vendor = commands.add_parser("vendor")
    vendor.add_argument("os_tree", type=Path)
    vendor.add_argument("--output", type=Path)
    verify = commands.add_parser("verify-vendor")
    verify.add_argument("os_tree", type=Path)
    verify.add_argument("inventory", type=Path)
    signing = commands.add_parser("signing-plan")
    signing.add_argument("--output", type=Path)
    args = parser.parse_args()
    try:
        if args.command == "recovery":
            result, output = recovery_record(args.factory, args.ota, args.terms), args.output
        elif args.command == "vendor":
            result, output = vendor_inventory(args.os_tree), args.output
        elif args.command == "verify-vendor":
            result, output = verify_vendor(args.os_tree, args.inventory), None
        else:
            result, output = signing_plan(), args.output
        write_result(result, output)
        return 0
    except (ValueError, OSError, subprocess.SubprocessError, json.JSONDecodeError,
            UnicodeDecodeError) as error:
        print(f"Phone build input freeze failed: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())

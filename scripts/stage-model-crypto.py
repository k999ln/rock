#!/usr/bin/env python3
"""Stage the same lock-pinned Ed25519 verifier used by Gradle into an AOSP tree."""
import argparse
import hashlib
import io
import json
import os
from pathlib import Path
import sys
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parents[1]
LOCK = ROOT / "os/physical/model-crypto-artifact-lock.json"
NOTICE = ROOT / "os/physical/model-crypto-NOTICE.txt"
STAGE = Path("vendor/rockstaros-model-crypto")
BP = '''// Generated from the reviewed model-crypto artifact lock. No platform signing keys.
package { default_applicable_licenses: ["rock-model-crypto-license"] }
license {
    name: "rock-model-crypto-license",
    visibility: ["//visibility:public"],
    license_kinds: ["SPDX-license-identifier-MIT"],
    license_text: ["NOTICE"],
}
java_import {
    name: "rock-model-crypto",
    jars: ["bcprov.jar"],
    sdk_version: "current",
    min_sdk_version: "35",
    host_supported: true,
    visibility: ["//visibility:public"],
}
'''
NAMES = {"bcprov.jar", "Android.bp", "artifact.json", "NOTICE"}


def sha(data):
    return hashlib.sha256(data).hexdigest()


def lock():
    value = json.loads(LOCK.read_text())
    if (value.get("schema") != "rock-model-crypto-artifact/1"
            or value.get("moduleName") != "rock-model-crypto"
            or value.get("stagingPath") != str(STAGE)
            or not isinstance(value.get("bytes"), int)
            or not 0 < value["bytes"] <= 16 * 1024 * 1024):
        raise ValueError("Invalid model crypto artifact lock")
    if sha(NOTICE.read_bytes()) != value.get("licenseNoticeSha256"):
        raise ValueError("Model crypto license notice changed")
    return value


def directory(tree, *, create):
    tree = Path(tree).resolve(strict=True)
    for current in [tree / "vendor", tree / STAGE]:
        if current.is_symlink() or (current.exists() and not current.is_dir()):
            raise ValueError("Model crypto stage must be a real directory")
        if create:
            current.mkdir(exist_ok=True)
    target = tree / STAGE
    if not target.is_dir():
        raise ValueError("Model crypto stage missing")
    if any(p.name not in NAMES or p.is_symlink() or not p.is_file() for p in target.iterdir()):
        raise ValueError("Unexpected or unsafe model crypto stage content")
    return target


def artifact(data, expected):
    if len(data) != expected["bytes"] or sha(data) != expected["sha256"]:
        raise ValueError("Model crypto byte length or SHA-256 mismatch")
    with zipfile.ZipFile(io.BytesIO(data)) as jar:
        required = {"org/bouncycastle/crypto/signers/Ed25519Signer.class",
                    "org/bouncycastle/crypto/params/Ed25519PublicKeyParameters.class"}
        if not required.issubset(jar.namelist()):
            raise ValueError("Model crypto verifier classes missing")
    return {"schema": "rock-model-crypto-stage/1", "sha256": sha(data),
            "bytes": len(data), "lockSha256": sha(LOCK.read_bytes()),
            "coordinate": expected["coordinate"], "moduleName": expected["moduleName"]}


def write_atomic(target, data):
    if target.is_symlink():
        raise ValueError("Model crypto stage file must not be a symlink")
    fd, temporary = tempfile.mkstemp(prefix=".model-crypto-", dir=target.parent)
    try:
        with os.fdopen(fd, "wb") as output:
            output.write(data)
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, target)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def stage(tree, jar):
    expected = lock()
    jar = Path(jar)
    if jar.is_symlink() or not jar.is_file() or jar.stat().st_size != expected["bytes"]:
        raise ValueError("A regular lock-sized model crypto JAR is required")
    with jar.open("rb") as source:
        data = source.read(expected["bytes"] + 1)
    receipt = artifact(data, expected)
    target = directory(tree, create=True)
    for name, payload in {"bcprov.jar": data, "Android.bp": BP.encode(), "NOTICE": NOTICE.read_bytes(),
                          "artifact.json": (json.dumps(receipt, indent=2) + "\n").encode()}.items():
        write_atomic(target / name, payload)
    return verify(tree)


def verify(tree):
    expected = lock()
    target = directory(tree, create=False)
    if {p.name for p in target.iterdir()} != NAMES:
        raise ValueError("Incomplete model crypto stage")
    if (target / "bcprov.jar").stat().st_size != expected["bytes"]:
        raise ValueError("Model crypto staged length mismatch")
    receipt = artifact((target / "bcprov.jar").read_bytes(), expected)
    if ((target / "NOTICE").read_bytes() != NOTICE.read_bytes()
            or (target / "Android.bp").read_text() != BP or json.loads((target / "artifact.json").read_text()) != receipt):
        raise ValueError("Model crypto stage metadata changed")
    return receipt


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("operation", choices=["stage", "verify"])
    parser.add_argument("tree", type=Path)
    parser.add_argument("jar", type=Path, nargs="?")
    args = parser.parse_args()
    if args.operation == "stage" and args.jar is None:
        parser.error("stage requires the reviewed JAR")
    try:
        print(json.dumps(stage(args.tree, args.jar) if args.operation == "stage" else verify(args.tree)))
    except (OSError, ValueError, zipfile.BadZipFile) as error:
        sys.exit(str(error))

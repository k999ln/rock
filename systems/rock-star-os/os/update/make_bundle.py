#!/usr/bin/env python3
"""Build explicit DEVELOPMENT bundles using the already-public RFC 8032 fixture.

No key generation. No upload, device write, or production-signing interface.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import stat
import struct
import subprocess
import tempfile

from rock_update import (MAGIC, MAX_HEADER, LAYOUT, DATA_ABI, canonical, manifest_ok,
                         verify_envelope, require, stable_file_identity, clean_ext4)

# Identical public fixture already used in src/blackberryrock/sdk.py.
RFC8032_PUBLIC_TEST_SEED = "9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60"


def sign_development(manifest):
    manifest_ok(manifest)
    with tempfile.TemporaryDirectory(prefix="rock-ab-public-fixture-") as temporary:
        directory = Path(temporary)
        (directory / "public-test-seed.der").write_bytes(bytes.fromhex(
            "302e020100300506032b657004220420" + RFC8032_PUBLIC_TEST_SEED))
        (directory / "manifest").write_bytes(canonical(manifest))
        result = subprocess.run(["openssl", "pkeyutl", "-sign", "-keyform", "DER", "-inkey",
                                 str(directory / "public-test-seed.der"), "-rawin", "-in",
                                 str(directory / "manifest")], check=True, capture_output=True, timeout=15)
    envelope = {"manifest": manifest, "signature": result.stdout.hex()}
    verify_envelope(envelope)
    return envelope


def envelope_for(image, sequence, version):
    with image.open("rb") as stream:
        before = os.fstat(stream.fileno())
        require(stat.S_ISREG(before.st_mode), "development input must be a regular image file")
        clean_ext4(stream)
        digest = hashlib.file_digest(stream, "sha256").hexdigest()
        require(stable_file_identity(os.fstat(stream.fileno())) == stable_file_identity(before),
                "rootfs changed while building its signed manifest")
    return sign_development({"schema": "rock-os-rootfs-v2", "architecture": "aarch64", "layout": LAYOUT, "data_abi": DATA_ABI,
                             "sequence": sequence, "version": version, "size": before.st_size,
                             "sha256": digest})


def check_filesystem(image):
    """Read-only full filesystem check; never repair a candidate or source."""
    result = subprocess.run(['e2fsck', '-f', '-n', str(image)], capture_output=True, text=True, timeout=120)
    require(result.returncode == 0, 'rootfs fails read-only e2fsck; prepare a clean image before signing: ' +
            (result.stdout + result.stderr)[-3000:])


def bundle(image, output, sequence, version):
    envelope = envelope_for(image, sequence, version)
    header = canonical(envelope)
    assert len(header) <= MAX_HEADER
    with output.open("xb") as destination, image.open("rb") as source:
        destination.write(MAGIC + struct.pack(">I", len(header)) + header)
        written = 0
        digest = hashlib.sha256()
        while block := source.read(1024 * 1024):
            destination.write(block)
            digest.update(block)
            written += len(block)
        require(written == envelope["manifest"]["size"] and
                digest.hexdigest() == envelope["manifest"]["sha256"],
                "input changed between signing and bundle copying; partial output is invalid")
        destination.flush()
        os.fsync(destination.fileno())
    return envelope


def main():
    parser = argparse.ArgumentParser(description="PUBLIC FIXTURE development rootfs bundle builder")
    parser.add_argument("--image", required=True, type=Path)
    parser.add_argument("--sequence", required=True, type=int)
    parser.add_argument("--version", required=True)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--manifest-output", type=Path)
    args = parser.parse_args()
    if not args.output and not args.manifest_output:
        parser.error("an output is required")
    check_filesystem(args.image)
    envelope = (bundle(args.image, args.output, args.sequence, args.version) if args.output else
                envelope_for(args.image, args.sequence, args.version))
    if args.manifest_output:
        with args.manifest_output.open("xb") as stream:
            stream.write(canonical(envelope) + b"\n")
    print(json.dumps({"development_trust": "PUBLIC RFC 8032 fixture; not production trust", **envelope["manifest"]}))


if __name__ == "__main__":
    main()

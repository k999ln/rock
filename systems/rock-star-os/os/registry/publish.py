"""SDK publish CLI. Token is read from a file, never passed in process arguments."""
import argparse
import json
from pathlib import Path
import re

from blackberryrock.packages import MAX_PACKAGE_BYTES, canonical, verify_package
from .common import RegistryError, TRUST, decode, read_regular
from .transport import HTTPSOrigin


def author_headers(token_file, key):
    token = read_regular(token_file, 1024).decode("utf-8").strip()
    if not 16 <= len(token) <= 256 or any(ord(char) < 33 or ord(char) > 126 for char in token):
        raise RegistryError("invalid author token file")
    if not isinstance(key, str) or not re.fullmatch(r"[a-zA-Z0-9_.:-]{1,128}", key):
        raise RegistryError("valid stable idempotency key required")
    return {"Content-Type": "application/json", "Authorization": "Bearer " + token, "Idempotency-Key": key}


def publish(origin, ca_file, token_file, package_file, key, timeout=5):
    package = decode(read_regular(package_file, MAX_PACKAGE_BYTES))
    manifest, package_hash = verify_package(package, TRUST)
    transport = HTTPSOrigin(origin, ca_file, timeout=timeout)
    receipt = decode(transport.request("POST", "/v1/publish", 4096,
                                     body=canonical({"package": package}),
                                     headers=author_headers(token_file, key)))
    if (not isinstance(receipt, dict) or receipt.get("hash") != package_hash
            or receipt.get("id") != manifest["id"] or receipt.get("version") != manifest["version"]):
        raise RegistryError("publish receipt does not match submitted package")
    return receipt


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("package", type=Path)
    parser.add_argument("--origin", required=True)
    parser.add_argument("--ca", type=Path, required=True)
    parser.add_argument("--token-file", type=Path, required=True)
    parser.add_argument("--key", required=True, help="stable idempotency key; reuse after a disconnect")
    args = parser.parse_args()
    print(json.dumps(publish(args.origin, args.ca, args.token_file, args.package, args.key), indent=2))


if __name__ == "__main__":
    main()

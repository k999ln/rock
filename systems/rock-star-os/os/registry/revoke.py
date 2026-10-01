"""Authorized developer revocation CLI; signed revocations cannot be removed."""
import argparse
import json
from pathlib import Path

from blackberryrock.packages import canonical
from .common import RegistryError, decode
from .publish import author_headers
from .transport import HTTPSOrigin


def revoke(origin, ca_file, token_file, subject, key, timeout=5):
    if not isinstance(subject, str) or not 1 <= len(subject) <= 230:
        raise RegistryError("invalid revocation subject")
    transport = HTTPSOrigin(origin, ca_file, timeout=timeout)
    receipt = decode(transport.request("POST", "/v1/revoke", 4096, canonical({"subject": subject}),
                                       author_headers(token_file, key)))
    if not isinstance(receipt, dict) or receipt.get("subject") != subject or receipt.get("status") not in ("revoked", "already_revoked"):
        raise RegistryError("revocation receipt does not match request")
    return receipt


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("subject", help="approved publisher or its existing tool-id@version")
    parser.add_argument("--origin", required=True)
    parser.add_argument("--ca", type=Path, required=True)
    parser.add_argument("--token-file", type=Path, required=True)
    parser.add_argument("--key", required=True)
    args = parser.parse_args()
    print(json.dumps(revoke(args.origin, args.ca, args.token_file, args.subject, args.key), indent=2))


if __name__ == "__main__":
    main()

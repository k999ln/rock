"""Create a development TLS certificate from an EXISTING PUBLIC RFC test key.

No new signing/private key is generated. Everyone knows this fixture key/token.
"""
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile

from blackberryrock.packages import PUBLIC_TEST_KEY, TEST_PUBLISHER
from blackberryrock.sdk import RFC8032_PUBLIC_TEST_SEED

ROOT = Path(__file__).resolve().parent / "fixtures"
PUBLIC_TOKEN = "PUBLIC-DEVELOPMENT-REGISTRY-TOKEN-NOT-SECRET-2026"


def main():
    ROOT.mkdir(parents=True, exist_ok=True)
    key, certificate = ROOT / "PUBLIC-FIXTURE-KEY.pem", ROOT / "development-ca.pem"
    with tempfile.TemporaryDirectory(prefix="registry-existing-public-key-") as temporary:
        der = Path(temporary) / "fixture.der"
        der.write_bytes(bytes.fromhex("302e020100300506032b657004220420" + RFC8032_PUBLIC_TEST_SEED))
        subprocess.run(["openssl", "pkey", "-inform", "DER", "-in", str(der), "-out", str(key)], check=True, capture_output=True)
    subprocess.run(["openssl", "req", "-new", "-x509", "-key", str(key), "-out", str(certificate),
                    "-days", "3650", "-set_serial", "8032", "-subj", "/CN=Rock Registry PUBLIC Development Fixture",
                    "-addext", "subjectAltName=DNS:localhost,IP:127.0.0.1,IP:10.0.2.2",
                    "-addext", "basicConstraints=critical,CA:TRUE,pathlen:0",
                    "-addext", "keyUsage=critical,digitalSignature,keyCertSign",
                    "-addext", "extendedKeyUsage=serverAuth", "-addext", "subjectKeyIdentifier=hash",
                    "-addext", "authorityKeyIdentifier=keyid:always"], check=True, capture_output=True)
    authors = {"authors": {"development-author": {"token_sha256": hashlib.sha256(PUBLIC_TOKEN.encode()).hexdigest(),
                                                  "publishers": [TEST_PUBLISHER]}},
               "publishers": {TEST_PUBLISHER: PUBLIC_TEST_KEY}}
    (ROOT / "approved-authors.json").write_text(json.dumps(authors, indent=2) + "\n")
    (ROOT / "PUBLIC-AUTHOR-TOKEN.txt").write_text(PUBLIC_TOKEN + "\n")
    (ROOT / "NOTICE.txt").write_text("DEVELOPMENT ONLY.\nThe TLS key and Ed25519 signing fixture are PUBLIC RFC 8032 section 7.1 data.\nThe author token is also public synthetic test data. None provides production identity, secrecy, or publisher trust.\nDo not regenerate this certificate during a running test; copy the checked-in explicit CA to the guest.\nNo new private key was generated.\n")
    print(json.dumps({"fixture": "PUBLIC RFC 8032 existing test key", "new_private_key_generated": False,
                      "certificate_sha256": hashlib.sha256(certificate.read_bytes()).hexdigest(),
                      "san": ["localhost", "127.0.0.1", "10.0.2.2"]}))


if __name__ == "__main__":
    main()

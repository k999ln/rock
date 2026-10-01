"""Submit the four already signed Tool packages through the authenticated SDK."""
import argparse
import hashlib
import json
from pathlib import Path

from .publish import publish

ROOT = Path(__file__).resolve().parent
PACKAGES = ("org.rockstar.proposal-draft--1.0.0.rock.json", "org.rockstar.proposal-draft--1.1.0.rock.json",
            "org.rockstar.citation-organizer--1.0.0.rock.json", "org.rockstar.utf8-sha256--1.0.0.rock.json")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--origin", default="https://127.0.0.1:9443")
    parser.add_argument("--ca", type=Path, default=ROOT / "fixtures/development-ca.pem")
    parser.add_argument("--token-file", type=Path, default=ROOT / "fixtures/PUBLIC-AUTHOR-TOKEN.txt")
    parser.add_argument("--packages", type=Path, default=ROOT.parents[1] / "examples/registry")
    args = parser.parse_args()
    receipts = []
    for filename in PACKAGES:
        path = args.packages / filename
        key = "seed-" + hashlib.sha256(path.read_bytes()).hexdigest()
        receipts.append(publish(args.origin, args.ca, args.token_file, path, key))
    print(json.dumps({"development_only": True, "receipts": receipts}, indent=2))


if __name__ == "__main__":
    main()

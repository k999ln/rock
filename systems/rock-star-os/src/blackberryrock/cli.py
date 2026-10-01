from __future__ import annotations

import argparse
import ipaddress
import os
import secrets
from pathlib import Path

from .manifests import ManifestError, load_and_validate
from .server import create_server
from .storage import Store


def _is_loopback(bind: str) -> bool:
    if bind == "localhost":
        return True
    try:
        return ipaddress.ip_address(bind).is_loopback
    except ValueError:
        return False


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="blackberryrock PC receiver prototype")
    subparsers = parser.add_subparsers(dest="command", required=True)

    subparsers.add_parser("token", help="generate a temporary bearer token")

    serve = subparsers.add_parser("serve", help="run the local PC receiver")
    serve.add_argument("--bind", default="127.0.0.1")
    serve.add_argument("--port", type=int, default=8765)
    serve.add_argument("--db", type=Path, default=Path(".state/blackberryrock.db"))
    serve.add_argument("--token-env", default="BLACKBERRYROCK_TOKEN")
    serve.add_argument(
        "--allow-non-loopback",
        action="store_true",
        help="explicitly allow a non-loopback bind; TLS and stronger auth are still your responsibility",
    )

    validate = subparsers.add_parser("validate-tool", help="validate a tool manifest")
    validate.add_argument("manifest", type=Path)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if args.command == "token":
        print(secrets.token_urlsafe(32))
        return 0
    if args.command == "validate-tool":
        try:
            manifest = load_and_validate(args.manifest)
        except ManifestError as error:
            print(f"invalid: {error}")
            return 1
        print(f"valid: {manifest['id']}@{manifest['version']}")
        return 0
    if args.command == "serve":
        if not _is_loopback(args.bind) and not args.allow_non_loopback:
            print("refusing non-loopback bind without --allow-non-loopback")
            return 2
        token = os.environ.get(args.token_env, "")
        if len(token) < 24:
            print(f"set {args.token_env} to a secret of at least 24 characters")
            return 2
        store = Store(args.db)
        server = create_server(args.bind, args.port, store, token)
        print(f"blackberryrock receiver listening on http://{args.bind}:{args.port}")
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            print("\nstopping receiver")
        finally:
            server.server_close()
        return 0
    return 2

"""SDK for reviewable text recipes. Development signing uses PUBLIC RFC 8032 data."""
import argparse
import json
import subprocess
import tempfile
from pathlib import Path

from .packages import (CURRENT_PROFILE, TEST_PUBLISHER, PUBLIC_TEST_KEY, canonical, digest,
                       require_compatible, validate_manifest, validate_recipe, verify_package)

# Public RFC 8032 section 7.1 test vector. NOT A SECRET; NOT PRODUCTION TRUST.
RFC8032_PUBLIC_TEST_SEED = "9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60"


def starter(tool_id="org.rockstar.text-tidy", name="文章を整える", version="1.0.0", recipe=None,
            *, schema_version=4, min_os_version=None, min_runtime_version=None):
    if type(schema_version) is not int or schema_version not in (2, 4):
        raise ValueError('starter supports schema 4 or explicit legacy schema 2')
    if schema_version == 2 and (min_os_version is not None or min_runtime_version is not None):
        raise ValueError('legacy schema 2 cannot declare compatibility requirements')
    recipe = recipe or [{"op": "trim_lines"}, {"op": "collapse_blank_lines"}]
    source = {"manifest": {
        "schema_version": schema_version, "id": tool_id, "name": name, "description": "行の余分な空白や空行を整え、読みやすい文章にします。",
        "publisher": TEST_PUBLISHER, "version": version, "kind": "Tool", "runtime": "rock-recipe/1",
        "execution_targets": ["device_local"], "permissions": ["text.input", "text.output"],
        "data": {"input": "user_supplied_text", "destinations": []},
        "resources": {"input_bytes": 65536, "output_bytes": 131072, "timeout_seconds": 3, "max_steps": 16},
        "price": {"currency": "USD", "amount_minor": 0, "unit": "run"},
        "source": {"repository": "local-development", "commit": "local-development", "license": "LicenseRef-Development-Only"},
        "recipe_sha256": digest(recipe),
        "lifecycle": {"updates": "explicit_approval", "rollback": "cached_signed_version", "uninstall": "retain_receipts"}
    }, "recipe": recipe}
    if schema_version == 4:
        source['manifest']['compatibility'] = {
            'os': CURRENT_PROFILE['os'],
            'min_os_version': CURRENT_PROFILE['os_version'] if min_os_version is None else min_os_version,
            'min_runtime_version': CURRENT_PROFILE['runtime_version'] if min_runtime_version is None else min_runtime_version,
        }
        validate_manifest(source['manifest'])
    return source


def sign_development(source):
    source = json.loads(canonical(source))
    source.pop("signature", None)
    source['manifest']['recipe_sha256'] = digest(source['recipe'])
    validate_recipe(source['recipe'])
    validate_manifest(source['manifest'])
    if source['manifest']['publisher'] != TEST_PUBLISHER:
        raise ValueError("public fixture can only identify the development publisher")
    with tempfile.TemporaryDirectory(prefix="rock-public-fixture-") as temp:
        root = Path(temp)
        # Decode the published test fixture; no fresh signing key is generated.
        (root / "rfc8032.der").write_bytes(bytes.fromhex("302e020100300506032b657004220420" + RFC8032_PUBLIC_TEST_SEED))
        (root / "payload").write_bytes(canonical(source))
        completed = subprocess.run(["openssl", "pkeyutl", "-sign", "-inkey", str(root / "rfc8032.der"), "-keyform", "DER", "-rawin", "-in", str(root / "payload")], capture_output=True, timeout=5, check=True)
    source['signature'] = completed.stdout.hex()
    verify_package(source, {TEST_PUBLISHER: PUBLIC_TEST_KEY})
    return source


def main(argv=None):
    parser = argparse.ArgumentParser(description="Rock star os recipe SDK — development only")
    sub = parser.add_subparsers(dest='command', required=True)
    new = sub.add_parser('new')
    new.add_argument('output', type=Path)
    new.add_argument('--id', default='org.example.my-tool')
    new.add_argument('--name', default='My text tool')
    new.add_argument('--schema-version', type=int, choices=(2, 4), default=4)
    new.add_argument('--min-os-version')
    new.add_argument('--min-runtime-version')
    build = sub.add_parser('build-dev')
    build.add_argument('source', type=Path)
    build.add_argument('output', type=Path)
    check = sub.add_parser('check')
    check.add_argument('package', type=Path)
    check.add_argument('--compatible', action='store_true', help='also require compatibility with this SDK/OS release profile')
    publish = sub.add_parser('publish-local')
    publish.add_argument('package', type=Path)
    publish.add_argument('registry', type=Path)
    args = parser.parse_args(argv)
    if args.command == 'new':
        args.output.write_bytes(canonical(starter(tool_id=args.id, name=args.name,
            schema_version=args.schema_version, min_os_version=args.min_os_version,
            min_runtime_version=args.min_runtime_version)))
        return 0
    if args.command == 'build-dev':
        result = sign_development(json.loads(args.source.read_text()))
        args.output.write_bytes(canonical(result))
        print('DEVELOPMENT ONLY: signed with a publicly known RFC test fixture')
        return 0
    package = json.loads(args.package.read_text())
    manifest, sha = verify_package(package, {TEST_PUBLISHER: PUBLIC_TEST_KEY})
    if args.command == 'check' and args.compatible:
        require_compatible(manifest)
    if args.command == 'publish-local':
        args.registry.mkdir(parents=True, exist_ok=True)
        output = args.registry / f"{manifest['id']}--{manifest['version']}.rock.json"
        content = canonical(package)
        # Exclusive create: immutable versions, even across concurrent publishers.
        with output.open('xb') as file:
            file.write(content)
    print(f"valid {manifest['id']}@{manifest['version']} {sha}")
    return 0


if __name__ == '__main__':
    raise SystemExit(main())

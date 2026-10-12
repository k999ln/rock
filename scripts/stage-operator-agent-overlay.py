#!/usr/bin/env python3
"""Validate public Operator Agent trust input and stage an exact AOSP RRO.

The input is intentionally kept outside this repository. It contains public
trust material only; private keys, Access tokens and operator identity are not
accepted by the schema. This command never creates credentials or contacts the
Operator Dock.
"""
import argparse
import base64
import binascii
import hashlib
import json
import os
from pathlib import Path
import re
import sys
import tempfile
from urllib.parse import urlsplit
from xml.sax.saxutils import escape


ROOT = Path(__file__).resolve().parents[1]
STAGE_PATH = Path("vendor/avocado-operator-agent")
MODULE_NAME = "AvocadoOperatorAgentConfig"
TARGET_PACKAGE = "dev.rock.operator.agent"
SCOPE = "pixel-10-frankel-gl066-single-device-preview"
EXPECTED_KEYS = {
    "schema", "scope", "targetPackage", "dockOrigin", "operatorCredentialId",
    "operatorPublicKeySpki", "rpId", "webAuthnOrigin", "quarantinePackages",
    "deviceAttestationChallenge", "hardwareIdentityRequired", "factoryResetEnabled",
}
EC_PUBLIC_KEY_OID = bytes.fromhex("2a8648ce3d0201")
P256_OID = bytes.fromhex("2a8648ce3d030107")
P256_P = 0xFFFFFFFF00000001000000000000000000000000FFFFFFFFFFFFFFFFFFFFFFFF
P256_B = 0x5AC635D8AA3A93E7B3EBBD55769886BC651D06B0CC53B0F63BCE3C3E27D2604B


def sha256_bytes(value):
    return hashlib.sha256(value).hexdigest()


def decode_base64url(value, label, minimum, maximum):
    if (not isinstance(value, str) or not re.fullmatch(r"[A-Za-z0-9_-]+", value)
            or "=" in value):
        raise ValueError(f"{label} must be unpadded base64url")
    try:
        decoded = base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))
    except (ValueError, binascii.Error) as error:
        raise ValueError(f"{label} is not valid base64url") from error
    if not minimum <= len(decoded) <= maximum:
        raise ValueError(f"{label} length is outside the allowed range")
    return decoded


def der_tlv(value, offset=0):
    if offset + 2 > len(value):
        raise ValueError("truncated DER")
    tag = value[offset]
    length = value[offset + 1]
    cursor = offset + 2
    if length & 0x80:
        count = length & 0x7F
        if count == 0 or count > 4 or cursor + count > len(value):
            raise ValueError("invalid DER length")
        if value[cursor] == 0:
            raise ValueError("non-canonical DER length")
        length = int.from_bytes(value[cursor:cursor + count], "big")
        cursor += count
        if length < 128:
            raise ValueError("non-canonical DER length")
    end = cursor + length
    if end > len(value):
        raise ValueError("truncated DER value")
    return tag, value[cursor:end], end


def validate_p256_spki(value):
    tag, sequence, end = der_tlv(value)
    if tag != 0x30 or end != len(value):
        raise ValueError("operatorPublicKeySpki must be one DER sequence")
    tag, algorithm, cursor = der_tlv(sequence)
    if tag != 0x30:
        raise ValueError("operatorPublicKeySpki algorithm is invalid")
    oid_tag, algorithm_oid, algorithm_end = der_tlv(algorithm)
    curve_tag, curve_oid, curve_end = der_tlv(algorithm, algorithm_end)
    if (oid_tag != 0x06 or algorithm_oid != EC_PUBLIC_KEY_OID or curve_tag != 0x06
            or curve_oid != P256_OID or curve_end != len(algorithm)):
        raise ValueError("operatorPublicKeySpki must use P-256")
    point_tag, bit_string, point_end = der_tlv(sequence, cursor)
    if point_tag != 0x03 or point_end != len(sequence) or len(bit_string) != 66:
        raise ValueError("operatorPublicKeySpki P-256 point is invalid")
    if bit_string[0] != 0 or bit_string[1] != 0x04:
        raise ValueError("operatorPublicKeySpki must use an uncompressed P-256 point")
    x = int.from_bytes(bit_string[2:34], "big")
    y = int.from_bytes(bit_string[34:66], "big")
    if x >= P256_P or y >= P256_P or (y * y - (x * x * x - 3 * x + P256_B)) % P256_P:
        raise ValueError("operatorPublicKeySpki point is not on P-256")


def exact_https_origin(value, label):
    if not isinstance(value, str) or len(value) > 253:
        raise ValueError(f"{label} must be an exact HTTPS origin")
    try:
        parsed = urlsplit(value)
        port = parsed.port
    except ValueError as error:
        raise ValueError(f"{label} must be an exact HTTPS origin") from error
    host = parsed.hostname
    if (parsed.scheme != "https" or parsed.username is not None or parsed.password is not None
            or host is None or parsed.path or parsed.query or parsed.fragment
            or port not in (None, 443) or host != host.lower()
            or not re.fullmatch(r"[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?", host)
            or ".." in host or "." not in host):
        raise ValueError(f"{label} must be an exact HTTPS origin")
    canonical = f"https://{host}" + (":443" if port == 443 else "")
    if value != canonical:
        raise ValueError(f"{label} must be canonical")
    return host


def validate_config(value):
    if not isinstance(value, dict) or set(value) != EXPECTED_KEYS:
        raise ValueError("Operator overlay input has unknown or missing fields")
    if (value["schema"] != "avocadoos-operator-agent-overlay-input/1"
            or value["scope"] != SCOPE or value["targetPackage"] != TARGET_PACKAGE):
        raise ValueError("Operator overlay input identity is invalid")
    dock_host = exact_https_origin(value["dockOrigin"], "dockOrigin")
    webauthn_host = exact_https_origin(value["webAuthnOrigin"], "webAuthnOrigin")
    if value["dockOrigin"] != value["webAuthnOrigin"] or dock_host != webauthn_host:
        raise ValueError("Dock and WebAuthn origins must match exactly")
    if value["rpId"] != dock_host:
        raise ValueError("rpId must equal the exact Operator Dock host")
    decode_base64url(value["operatorCredentialId"], "operatorCredentialId", 16, 1024)
    spki = decode_base64url(value["operatorPublicKeySpki"], "operatorPublicKeySpki", 64, 256)
    validate_p256_spki(spki)
    challenge = decode_base64url(
        value["deviceAttestationChallenge"], "deviceAttestationChallenge", 32, 32)
    if challenge == bytes(32):
        raise ValueError("deviceAttestationChallenge cannot be all zero")
    packages = value["quarantinePackages"]
    if (not isinstance(packages, list) or len(packages) > 32
            or packages != sorted(set(packages))):
        raise ValueError("quarantinePackages must be a sorted unique list")
    for package in packages:
        if (not isinstance(package, str)
                or re.fullmatch(r"[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+)+", package) is None
                or package.startswith("dev.rock.") or package == "com.localactionassistant"):
            raise ValueError("quarantinePackages may contain external connector packages only")
    if value["hardwareIdentityRequired"] is not True:
        raise ValueError("production Operator identity must require StrongBox")
    if value["factoryResetEnabled"] is not False:
        raise ValueError("factory reset must stay disabled until the physical cancellation drill")
    return dict(value)


def canonical_config(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()


def generated_files(config):
    public_config = dict(config)
    metadata = {
        "schema": "avocadoos-operator-agent-staged-overlay/1",
        "scope": config["scope"],
        "moduleName": MODULE_NAME,
        "targetPackage": TARGET_PACKAGE,
        "canonicalConfigSha256": sha256_bytes(canonical_config(config)),
        "publicConfig": public_config,
        "containsPrivateKeyOrAccessToken": False,
        "productionCredentialProvisioned": False,
        "deviceAttestationVerified": False,
        "factoryResetEnabled": False,
    }
    package_list = ",".join(config["quarantinePackages"])
    xml_values = {
        "operator_dock_origin": config["dockOrigin"],
        "operator_credential_id": config["operatorCredentialId"],
        "operator_public_key_spki": config["operatorPublicKeySpki"],
        "operator_rp_id": config["rpId"],
        "operator_webauthn_origin": config["webAuthnOrigin"],
        "operator_quarantine_packages": package_list,
        "operator_device_attestation_challenge": config["deviceAttestationChallenge"],
    }
    values = ["<?xml version=\"1.0\" encoding=\"utf-8\"?>", "<resources>"]
    for name, content in xml_values.items():
        values.append(
            f'    <string name="{name}" translatable="false">{escape(content)}</string>')
    values.extend([
        "    <bool name=\"operator_factory_reset_enabled\">false</bool>",
        "    <bool name=\"operator_hardware_identity_required\">true</bool>",
        "</resources>", "",
    ])
    return {
        Path("Android.bp"): (
            'runtime_resource_overlay {\n'
            f'    name: "{MODULE_NAME}",\n'
            '    product_specific: true,\n'
            '    sdk_version: "current",\n'
            '}\n').encode(),
        Path("AndroidManifest.xml"): (
            '<?xml version="1.0" encoding="utf-8"?>\n'
            '<manifest xmlns:android="http://schemas.android.com/apk/res/android" '
            'package="dev.rock.operator.agent.overlay">\n'
            '    <overlay android:targetPackage="dev.rock.operator.agent" '
            'android:targetName="OperatorAgentConfig" android:isStatic="true" '
            'android:priority="999" />\n'
            '</manifest>\n').encode(),
        Path("res/values/config.xml"): "\n".join(values).encode(),
        Path("product.mk"): f"PRODUCT_PACKAGES += {MODULE_NAME}\n".encode(),
        Path("artifact.json"): (json.dumps(metadata, ensure_ascii=False, indent=2) + "\n").encode(),
    }


def safe_external_config(path):
    if path.is_symlink():
        raise ValueError("Operator overlay input must not be a symlink")
    resolved = path.resolve(strict=True)
    if not resolved.is_file() or resolved.stat().st_size > 64 * 1024:
        raise ValueError("Operator overlay input must be a bounded regular file")
    if resolved.is_relative_to(ROOT):
        raise ValueError("Production Operator input must stay outside the Rock repository")
    return resolved


def safe_stage_directory(tree):
    tree = tree.resolve(strict=True)
    stage = tree / STAGE_PATH
    stage.parent.mkdir(parents=True, exist_ok=True)
    if stage.is_symlink() or not stage.parent.resolve().is_relative_to(tree):
        raise ValueError("Operator overlay stage directory escapes the OS tree")
    stage.mkdir(exist_ok=True)
    if not stage.resolve().is_relative_to(tree):
        raise ValueError("Operator overlay stage directory escapes the OS tree")
    return stage


def stage_files(stage):
    files = set()
    for path in stage.rglob("*"):
        if path.is_symlink():
            raise ValueError("Operator overlay staged paths must not be symlinks")
        if path.is_file():
            files.add(path.relative_to(stage))
    return files


def write_atomic(stage, target, content):
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.is_symlink() or not target.parent.resolve().is_relative_to(stage.resolve()):
        raise ValueError("Operator overlay staged file is unsafe")
    if target.exists() and target.read_bytes() == content:
        return
    fd, temporary = tempfile.mkstemp(prefix=".operator-overlay-", dir=target.parent)
    try:
        with os.fdopen(fd, "wb") as output:
            output.write(content)
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, target)
    finally:
        Path(temporary).unlink(missing_ok=True)


def stage_overlay(tree, input_path):
    source = safe_external_config(input_path)
    config = validate_config(json.loads(source.read_text(encoding="utf-8")))
    expected = generated_files(config)
    stage = safe_stage_directory(tree)
    existing = stage_files(stage)
    if existing and existing != set(expected):
        raise ValueError("Operator overlay stage directory contains unexpected files")
    for name, content in expected.items():
        write_atomic(stage, stage / name, content)
    return json.loads(expected[Path("artifact.json")])


def verify_stage(tree):
    stage = safe_stage_directory(tree)
    artifact_path = stage / "artifact.json"
    if artifact_path.is_symlink() or not artifact_path.is_file():
        raise ValueError("Operator overlay artifact is missing")
    metadata = json.loads(artifact_path.read_text(encoding="utf-8"))
    if (not isinstance(metadata, dict)
            or metadata.get("schema") != "avocadoos-operator-agent-staged-overlay/1"
            or set(metadata) != {"schema", "scope", "moduleName", "targetPackage",
                                 "canonicalConfigSha256", "publicConfig",
                                 "containsPrivateKeyOrAccessToken",
                                 "productionCredentialProvisioned",
                                 "deviceAttestationVerified", "factoryResetEnabled"}
            or metadata.get("containsPrivateKeyOrAccessToken") is not False
            or metadata.get("productionCredentialProvisioned") is not False
            or metadata.get("deviceAttestationVerified") is not False
            or metadata.get("factoryResetEnabled") is not False):
        raise ValueError("Operator overlay artifact boundary is invalid")
    config = validate_config(metadata.get("publicConfig"))
    if metadata.get("canonicalConfigSha256") != sha256_bytes(canonical_config(config)):
        raise ValueError("Operator overlay public configuration hash changed")
    expected = generated_files(config)
    if stage_files(stage) != set(expected):
        raise ValueError("Operator overlay stage directory differs from the generated contract")
    for name, content in expected.items():
        if (stage / name).read_bytes() != content:
            raise ValueError(f"staged Operator overlay changed: {name}")
    return metadata


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    inspect = commands.add_parser("inspect")
    inspect.add_argument("input", type=Path)
    stage = commands.add_parser("stage")
    stage.add_argument("os_tree", type=Path)
    stage.add_argument("input", type=Path)
    verify = commands.add_parser("verify")
    verify.add_argument("os_tree", type=Path)
    args = parser.parse_args()
    try:
        if args.command == "inspect":
            source = safe_external_config(args.input)
            config = validate_config(json.loads(source.read_text(encoding="utf-8")))
            result = json.loads(generated_files(config)[Path("artifact.json")])
        elif args.command == "stage":
            result = stage_overlay(args.os_tree, args.input)
        else:
            result = verify_stage(args.os_tree)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0
    except (ValueError, OSError, json.JSONDecodeError) as error:
        print(f"Operator Agent overlay staging failed: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())

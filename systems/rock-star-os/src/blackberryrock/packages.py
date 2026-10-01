"""Versioned, signed declarative packages for the local development Hub.

OpenSSL supplies Ed25519; this module never generates or stores signing keys.
No Python, shell, URLs or file paths are executable recipe operations.
"""
from __future__ import annotations

import hashlib
import json
import re
import subprocess
import tempfile
from collections.abc import Mapping
from pathlib import Path
from types import MappingProxyType
from typing import Any
from . import __version__
from .recipe_worker import OPS, validate_recipe as _validate_recipe

MAX_PACKAGE_BYTES = 128 * 1024
PUBLIC_TEST_KEY = "d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a"
TEST_PUBLISHER = "org.rockstar.development"
REMOTE_CONTRACT = {"consent": "per_job_input_sha256", "retention": "job_receipts", "protocol": "rock-runner/1"}
CURRENT_PROFILE = MappingProxyType({
    "os": "rock-star-os", "os_version": __version__,
    "runtime": "rock-recipe/1", "runtime_version": "1.0.0",
})
NUMERIC_SEMVER = r"(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)"


class PackageError(ValueError):
    pass


class PackageCompatibilityError(PackageError):
    """A structurally valid package cannot run on the selected OS profile."""

    def __init__(self, status):
        self.status = status
        required, current = status['required'], status['current']
        messages = []
        if 'os_too_old' in status['reasons']:
            messages.append(f"Tool requires Rock star os {required['min_os_version']} or newer; this OS is {current['os_version']}")
        if 'runtime_too_old' in status['reasons']:
            messages.append(f"Tool requires {current['runtime']} version {required['min_runtime_version']} or newer; this runtime is {current['runtime_version']}")
        super().__init__('; '.join(messages))


def numeric_semver(value: Any) -> tuple[int, int, int]:
    """Bounded, numeric X.Y.Z only; never compare release strings lexically."""
    if type(value) is not str or len(value) > 64 or re.fullmatch(NUMERIC_SEMVER, value) is None:
        raise PackageError('compatibility versions must be numeric semver strings of at most 64 characters')
    return tuple(int(part) for part in value.split('.'))


def _validate_compatibility(value):
    if (not isinstance(value, dict) or set(value) != {'os', 'min_os_version', 'min_runtime_version'}
            or value['os'] != CURRENT_PROFILE['os']):
        raise PackageError('unknown or malformed OS compatibility requirements')
    numeric_semver(value['min_os_version'])
    numeric_semver(value['min_runtime_version'])


def compatibility_status(manifest: Any, profile: Mapping | None = None) -> dict:
    """Inspect compatibility only; callers still have to verify package trust.

    Registry structure/signature verification deliberately does not call this:
    a correctly signed future-minimum Tool must not invalidate its whole index.
    The optional profile supports explicit conformance tests; production callers
    use the immutable source-defined CURRENT_PROFILE.
    """
    m = validate_manifest(manifest)
    selected = CURRENT_PROFILE if profile is None else profile
    if (not isinstance(selected, Mapping) or set(selected) != set(CURRENT_PROFILE)
            or selected['os'] != CURRENT_PROFILE['os'] or selected['runtime'] != CURRENT_PROFILE['runtime']):
        raise PackageError('unknown or malformed current compatibility profile')
    os_version = numeric_semver(selected['os_version'])
    runtime_version = numeric_semver(selected['runtime_version'])
    declared = m['schema_version'] == 4
    required = dict(m['compatibility']) if declared else {
        'os': CURRENT_PROFILE['os'], 'min_os_version': None, 'min_runtime_version': '1.0.0',
    }
    reasons = []
    if declared and os_version < numeric_semver(required['min_os_version']):
        reasons.append('os_too_old')
    if runtime_version < numeric_semver(required['min_runtime_version']):
        reasons.append('runtime_too_old')
    return {'compatible': not reasons, 'reasons': reasons, 'declared': declared,
            'required': required, 'current': dict(selected)}


def require_compatible(manifest: Any, profile: Mapping | None = None) -> dict:
    """Admission guard for install, approval, rollback and every execution path."""
    status = compatibility_status(manifest, profile)
    if not status['compatible']:
        raise PackageCompatibilityError(status)
    return manifest


def canonical(value: Any) -> bytes:
    return json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(",", ":"), allow_nan=False).encode()


def digest(value: Any) -> str:
    return hashlib.sha256(canonical(value)).hexdigest()


def validate_manifest(m: Any) -> dict:
    if not isinstance(m, dict) or type(m.get("schema_version")) is not int or m.get("schema_version") not in (2, 3, 4):
        raise PackageError("schema_version must be 2, 3 or 4")
    fields = {"schema_version", "id", "name", "description", "publisher", "version", "kind", "runtime", "execution_targets", "permissions", "data", "resources", "price", "source", "recipe_sha256", "lifecycle"}
    if m['schema_version'] == 3 or m['schema_version'] == 4 and 'remote' in m:
        fields.add('remote')
    if m['schema_version'] == 4:
        fields.add('compatibility')
    if set(m) != fields:
        raise PackageError("missing or unknown manifest field")
    if m['schema_version'] == 4:
        _validate_compatibility(m['compatibility'])
    for field, maximum in (("name", 80), ("description", 1000), ("publisher", 100)):
        if not isinstance(m[field], str) or not 0 < len(m[field].strip()) <= maximum:
            raise PackageError(f"invalid {field}")
    if not isinstance(m["id"], str) or len(m["id"]) > 100 or not re.fullmatch(r"[a-z][a-z0-9]*(?:[.-][a-z0-9]+)+", m["id"]):
        raise PackageError("invalid tool id")
    if not isinstance(m["version"], str) or not re.fullmatch(NUMERIC_SEMVER, m["version"]):
        raise PackageError("version must be numeric semver")
    if m["kind"] not in ("Tool", "Workflow") or m["runtime"] != CURRENT_PROFILE['runtime']:
        raise PackageError("unsupported kind or runtime")
    if m['schema_version'] == 2 or m['schema_version'] == 4 and m['execution_targets'] == ['device_local']:
        if m["execution_targets"] != ["device_local"]:
            raise PackageError("schema 2 permits device_local only")
        if 'remote' in m:
            raise PackageError('local-only schema 4 must not declare a remote contract')
        expected_permissions, destinations = ["text.input", "text.output"], []
    else:
        targets = m['execution_targets']
        if (not isinstance(targets, list) or not 1 <= len(targets) <= 3 or
                any(type(t) is not str or t not in ('device_local','cloud','pc_usb') for t in targets) or
                len(set(targets)) != len(targets)):
            raise PackageError('invalid explicit execution targets')
        destinations = [t for t in targets if t != 'device_local']
        if not destinations or m.get('remote') != REMOTE_CONTRACT:
            raise PackageError('remote schema 3/4 requires explicit per-job remote consent and bounded receipt protocol')
        expected_permissions = ["text.input", "text.output", "execution.remote"]
    if m['permissions'] != expected_permissions:
        raise PackageError('unknown or unsupported permission')
    if m['data'] != {'input':'user_supplied_text', 'destinations':destinations}:
        raise PackageError('data destinations must exactly match the signed execution targets; arbitrary addresses are forbidden')
    if m["price"] != {"currency": "USD", "amount_minor": 0, "unit": "run"}:
        raise PackageError("only free development tools are supported")
    if type(m["price"]["amount_minor"]) is not int:
        raise PackageError("price must use integer cents")
    if m["resources"] != {"input_bytes": 65536, "output_bytes": 131072, "timeout_seconds": 3, "max_steps": 16}:
        raise PackageError("unsupported resource limits")
    if any(type(value) is not int for value in m['resources'].values()):
        raise PackageError('resource limits must use exact integers')
    if m["lifecycle"] != {"updates": "explicit_approval", "rollback": "cached_signed_version", "uninstall": "retain_receipts"}:
        raise PackageError("unsupported lifecycle policy")
    s = m["source"]
    if not isinstance(s, dict) or set(s) != {"repository", "commit", "license"}:
        raise PackageError("source provenance required")
    if not all(isinstance(s[k], str) and 0 < len(s[k]) <= 300 for k in s):
        raise PackageError("invalid provenance")
    if s["commit"] != "local-development" and not re.fullmatch("[0-9a-f]{40}", s["commit"]):
        raise PackageError("source commit must be fixed")
    if not isinstance(m["recipe_sha256"], str) or not re.fullmatch("[0-9a-f]{64}", m["recipe_sha256"]):
        raise PackageError("invalid recipe hash")
    return m


def validate_recipe(recipe: Any) -> list:
    try:
        return _validate_recipe(recipe)
    except (ValueError, TypeError) as error:
        raise PackageError(str(error)) from error


def verify_package(package: Any, trust: dict[str, str], revoked: set[str] | None = None) -> tuple[dict, str]:
    try:
        if len(canonical(package)) > MAX_PACKAGE_BYTES:
            raise PackageError("package too large")
        if not isinstance(package, dict) or set(package) != {"manifest", "recipe", "signature"}:
            raise PackageError("invalid package envelope")
        m = validate_manifest(package["manifest"])
        validate_recipe(package["recipe"])
        if digest(package["recipe"]) != m["recipe_sha256"]:
            raise PackageError("recipe hash mismatch")
        rev = revoked or set()
        if m["publisher"] in rev or f"{m['id']}@{m['version']}" in rev:
            raise PackageError("publisher or version revoked")
        public = trust.get(m["publisher"])
        if not public:
            raise PackageError("publisher is not trusted")
        sig = package["signature"]
        if not isinstance(sig, str) or not re.fullmatch("[0-9a-f]{128}", sig):
            raise PackageError("invalid Ed25519 signature")
        payload = canonical({"manifest": m, "recipe": package["recipe"]})
        with tempfile.TemporaryDirectory(prefix="rock-verify-") as temp:
            root = Path(temp)
            (root / "key.der").write_bytes(bytes.fromhex("302a300506032b6570032100" + public))
            (root / "signature").write_bytes(bytes.fromhex(sig))
            (root / "payload").write_bytes(payload)
            result = subprocess.run(["openssl", "pkeyutl", "-verify", "-pubin", "-inkey", str(root / "key.der"), "-keyform", "DER", "-rawin", "-in", str(root / "payload"), "-sigfile", str(root / "signature")], capture_output=True, timeout=5)
        if result.returncode:
            raise PackageError("signature verification failed")
        return m, digest(package)
    except PackageError:
        raise
    except (ValueError, TypeError, KeyError, OSError, subprocess.TimeoutExpired) as e:
        raise PackageError("malformed package or unavailable OpenSSL verifier") from e

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any


TOOL_ID = re.compile(r"^[a-z0-9]+(?:[.-][a-z0-9]+)+$")
SEMVER = re.compile(r"^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:[-+][0-9A-Za-z.-]+)?$")
COMMIT = re.compile(r"^[0-9a-f]{40}$")
HASH = re.compile(r"^[0-9a-f]{64}$")
NETWORK_PERMISSION = re.compile(r"^network:https:[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$")
KNOWN_PERMISSIONS = {
    "files.read:selected",
    "files.write:workspace",
    "clipboard.write",
    "notifications.create",
}


class ManifestError(ValueError):
    pass


def _required_object(value: Any, name: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ManifestError(f"{name} must be an object")
    return value


def _required_string(data: dict[str, Any], name: str) -> str:
    value = data.get(name)
    if not isinstance(value, str) or not value.strip():
        raise ManifestError(f"{name} must be a non-empty string")
    return value


def load_and_validate(path: str | Path) -> dict[str, Any]:
    manifest_path = Path(path)
    try:
        data = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise ManifestError(f"cannot read manifest: {error}") from error

    data = _required_object(data, "manifest")
    if data.get("schema_version") != 1:
        raise ManifestError("schema_version must be 1")

    tool_id = _required_string(data, "id")
    if not TOOL_ID.fullmatch(tool_id):
        raise ManifestError("id must be a reverse-domain style lowercase identifier")
    if not SEMVER.fullmatch(_required_string(data, "version")):
        raise ManifestError("version must be semantic versioning")
    _required_string(data, "name")
    _required_string(data, "description")

    source = _required_object(data.get("source"), "source")
    source_type = _required_string(source, "type")
    if source_type not in {"local", "github"}:
        raise ManifestError("source.type must be local or github")
    _required_string(source, "license")
    if source_type == "github":
        url = _required_string(source, "url")
        if not url.startswith("https://github.com/"):
            raise ManifestError("GitHub source URL must use https://github.com/")
        if not COMMIT.fullmatch(_required_string(source, "commit")):
            raise ManifestError("GitHub source commit must be a 40-character lowercase SHA")

    runtime = _required_object(data.get("runtime"), "runtime")
    if _required_string(runtime, "kind") not in {"python", "wasm", "android", "container"}:
        raise ManifestError("runtime.kind is not supported")
    _required_string(data, "entrypoint")

    permissions = data.get("permissions")
    if not isinstance(permissions, list) or not all(isinstance(item, str) for item in permissions):
        raise ManifestError("permissions must be a string array")
    if len(permissions) != len(set(permissions)):
        raise ManifestError("permissions must not contain duplicates")
    for permission in permissions:
        if permission not in KNOWN_PERMISSIONS and not NETWORK_PERMISSION.fullmatch(permission):
            raise ManifestError(f"unknown permission: {permission}")

    resources = _required_object(data.get("resources"), "resources")
    resource_limits = {"timeout_seconds": 86400, "memory_mb": 32768, "disk_mb": 102400}
    for field, maximum in resource_limits.items():
        value = resources.get(field)
        if not isinstance(value, int) or isinstance(value, bool) or value <= 0 or value > maximum:
            raise ManifestError(f"resources.{field} must be an integer from 1 to {maximum}")

    confirmation = _required_object(data.get("confirmation"), "confirmation")
    if confirmation.get("external_side_effects") not in {"always", "never"}:
        raise ManifestError("confirmation.external_side_effects must be always or never")

    artifact = data.get("artifact")
    if artifact is not None:
        artifact = _required_object(artifact, "artifact")
        if not HASH.fullmatch(_required_string(artifact, "sha256")):
            raise ManifestError("artifact.sha256 must be 64 lowercase hexadecimal characters")

    return data

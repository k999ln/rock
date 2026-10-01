"""Small shared registry protocol; no production keys or executable downloads."""
from contextlib import contextmanager
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import tempfile
import time

from blackberryrock.packages import MAX_PACKAGE_BYTES, PUBLIC_TEST_KEY, TEST_PUBLISHER, canonical, validate_manifest

MAX_INDEX_BYTES = 512 * 1024
MAX_ENTRIES = 100
MAX_REVOCATIONS = 512
MIN_VALIDITY_SECONDS = 30
MAX_VALIDITY_SECONDS = 86400
INDEX_DOMAIN = b"RockRegistryIndex-v1\0"
REGISTRY_ID = "rock-development-registry"
TRUST = {TEST_PUBLISHER: PUBLIC_TEST_KEY}


class RegistryError(ValueError):
    pass


class TransportError(RegistryError):
    pass


class Conflict(RegistryError):
    pass


class Capacity(RegistryError):
    pass


def decode(raw):
    def unique(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise RegistryError("duplicate JSON field")
            result[key] = value
        return result
    def constant(_):
        raise RegistryError("non-finite JSON number")
    try:
        return json.loads(raw, object_pairs_hook=unique, parse_constant=constant)
    except (ValueError, TypeError, RecursionError, UnicodeError) as error:
        raise RegistryError("invalid registry JSON") from error


def sha256(raw):
    return hashlib.sha256(raw).hexdigest()


def fsync_directory(directory):
    descriptor = os.open(directory, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def safe_directory(path):
    path = Path(path)
    path.mkdir(parents=True, exist_ok=True, mode=0o700)
    info = path.lstat()
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.geteuid() or info.st_mode & 0o022:
        raise RegistryError("registry directory must be owned by this service and not group/world writable")
    return path


def read_regular(path, limit):
    descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(descriptor, "rb") as stream:
        info = os.fstat(stream.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_size > limit:
            raise RegistryError("invalid or oversized registry file")
        content = stream.read(limit + 1)
        if len(content) > limit:
            raise RegistryError("registry file exceeds limit")
        return content


def atomic_write(path, content):
    path = Path(path)
    descriptor, temporary = tempfile.mkstemp(prefix=".registry-part-", dir=path.parent)
    try:
        with os.fdopen(descriptor, "wb") as stream:
            stream.write(content)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
        fsync_directory(path.parent)
    finally:
        try:
            os.unlink(temporary)
        except FileNotFoundError:
            pass


@contextmanager
def locked(path):
    descriptor = os.open(path, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    try:
        if not stat.S_ISREG(os.fstat(descriptor).st_mode):
            raise RegistryError("invalid registry lock")
        fcntl.flock(descriptor, fcntl.LOCK_EX)
        yield
    finally:
        os.close(descriptor)


def sign_index(payload):
    # Server/build side only. Client imports do not require the SDK or test seed.
    from blackberryrock.sdk import RFC8032_PUBLIC_TEST_SEED
    with tempfile.TemporaryDirectory(prefix="registry-public-fixture-") as temporary:
        root = Path(temporary)
        (root / "fixture.der").write_bytes(bytes.fromhex("302e020100300506032b657004220420" + RFC8032_PUBLIC_TEST_SEED))
        (root / "payload").write_bytes(INDEX_DOMAIN + canonical(payload))
        run = subprocess.run(["openssl", "pkeyutl", "-sign", "-inkey", str(root / "fixture.der"),
                              "-keyform", "DER", "-rawin", "-in", str(root / "payload")],
                             capture_output=True, timeout=5, check=True)
    return {**payload, "signature": run.stdout.hex()}


def is_revoked(manifest, revocations):
    return manifest["publisher"] in revocations or f"{manifest['id']}@{manifest['version']}" in revocations


def check_index_time(index, now=None, clock_skew_seconds=30):
    now = int(time.time()) if now is None else now
    if (type(clock_skew_seconds) is not int or not 0 <= clock_skew_seconds <= 300
            or not isinstance(now, (int, float)) or not 0 <= now < 2 ** 63):
        raise RegistryError("invalid registry clock policy")
    if index["issued_at"] > now + clock_skew_seconds:
        raise RegistryError("index issued_at is ahead of the allowed clock skew")
    # No expiry grace: a cache hit must not authorize a new install after expiry.
    if now >= index["expires_at"]:
        raise RegistryError("registry index expired; refresh before fetching or installing")


def verify_index(index, public_key=PUBLIC_TEST_KEY, publishers=None, *, require_fresh=True,
                 now=None, clock_skew_seconds=30):
    publishers = TRUST if publishers is None else publishers
    try:
        if not isinstance(index, dict) or set(index) != {"schema_version", "registry_id", "revision", "issued_at", "expires_at", "packages", "revocations", "signature"}:
            raise RegistryError("invalid index envelope")
        if (type(index["schema_version"]) is not int or index["schema_version"] != 1
                or index["registry_id"] != REGISTRY_ID or type(index["revision"]) is not int
                or not 0 <= index["revision"] < 2 ** 63):
            raise RegistryError("unsupported index identity or revision")
        if (type(index["issued_at"]) is not int or type(index["expires_at"]) is not int
                or not 0 <= index["issued_at"] < index["expires_at"] < 2 ** 63
                or not MIN_VALIDITY_SECONDS <= index["expires_at"] - index["issued_at"] <= MAX_VALIDITY_SECONDS):
            raise RegistryError("invalid signed index validity interval")
        revocations = index["revocations"]
        if (not isinstance(revocations, list) or len(revocations) > MAX_REVOCATIONS
                or any(not isinstance(subject, str) or not 1 <= len(subject) <= 230 for subject in revocations)
                or len(set(revocations)) != len(revocations)):
            raise RegistryError("invalid signed revocation list")
        for subject in revocations:
            if subject not in publishers and not re.fullmatch(r"[a-z][a-z0-9]*(?:[.-][a-z0-9]+)+@(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)", subject):
                raise RegistryError("invalid revoked publisher or version subject")
        if not isinstance(index["packages"], list) or len(index["packages"]) > MAX_ENTRIES:
            raise RegistryError("index entry limit exceeded")
        if len(canonical(index)) > MAX_INDEX_BYTES:
            raise RegistryError("index exceeds byte limit")
        if not isinstance(public_key, str) or not re.fullmatch("[0-9a-f]{64}", public_key):
            raise RegistryError("invalid pinned index key")
        if not isinstance(index["signature"], str) or not re.fullmatch("[0-9a-f]{128}", index["signature"]):
            raise RegistryError("invalid index signature")
        identifiers = set()
        for entry in index["packages"]:
            if not isinstance(entry, dict) or set(entry) != {"manifest", "hash", "size", "filename", "source"}:
                raise RegistryError("invalid catalog metadata")
            manifest = validate_manifest(entry["manifest"])
            identity = (manifest["id"], manifest["version"])
            if identity in identifiers or manifest["publisher"] not in publishers:
                raise RegistryError("duplicate catalog version or untrusted publisher")
            identifiers.add(identity)
            if (not isinstance(entry["hash"], str) or not re.fullmatch("[0-9a-f]{64}", entry["hash"])
                    or type(entry["size"]) is not int or not 1 <= entry["size"] <= MAX_PACKAGE_BYTES
                    or entry["filename"] != f"{manifest['id']}--{manifest['version']}.rock.json"
                    or entry["source"] != "registry"):
                raise RegistryError("invalid package identity, size or path")
        payload = {key: value for key, value in index.items() if key != "signature"}
        with tempfile.TemporaryDirectory(prefix="registry-index-verify-") as temporary:
            root = Path(temporary)
            (root / "key.der").write_bytes(bytes.fromhex("302a300506032b6570032100" + public_key))
            (root / "payload").write_bytes(INDEX_DOMAIN + canonical(payload))
            (root / "signature").write_bytes(bytes.fromhex(index["signature"]))
            run = subprocess.run(["openssl", "pkeyutl", "-verify", "-pubin", "-inkey", str(root / "key.der"),
                                  "-keyform", "DER", "-rawin", "-in", str(root / "payload"),
                                  "-sigfile", str(root / "signature")], capture_output=True, timeout=5)
        if run.returncode:
            raise RegistryError("index signature verification failed")
        if require_fresh:
            check_index_time(index, now, clock_skew_seconds)
        return index
    except RegistryError:
        raise
    except (ValueError, TypeError, KeyError, OSError, subprocess.SubprocessError) as error:
        raise RegistryError("malformed index or unavailable signature verifier") from error

"""Target RegistryClient. Only verified complete packages leave download()."""
from contextlib import nullcontext
from copy import deepcopy
from pathlib import Path
import threading
import time
import re

from blackberryrock.packages import MAX_PACKAGE_BYTES, PUBLIC_TEST_KEY, canonical, require_compatible, verify_package
from .common import (MAX_INDEX_BYTES, RegistryError, TRUST, atomic_write, check_index_time, decode, is_revoked,
                    locked, read_regular, safe_directory, sha256, verify_index)
from .transport import HTTPSOrigin


class RegistryClient:
    def __init__(self, origin, ca_file, cache_dir, index_public_key=PUBLIC_TEST_KEY,
                 publisher_trust=None, timeout=5, attempts=2, minimum_revision=0,
                 clock_skew_seconds=30, clock=None, consumer=None, consumer_token=None, authority_id=None):
        if len({consumer is None, consumer_token is None, authority_id is None}) != 1:
            raise RegistryError('service consumer, credential and authority must be configured together')
        if consumer is not None and (not isinstance(consumer, str) or not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}', consumer)
                or not isinstance(consumer_token, str) or not 16 <= len(consumer_token) <= 256
                or any(ord(c) < 33 or ord(c) > 126 for c in consumer_token)):
            raise RegistryError('invalid bounded service consumer credential')
        self._consumer_headers = None if consumer is None else {
            'Authorization': 'Bearer '+consumer_token, 'X-Rock-Service-Consumer': consumer,
            'X-Rock-Service-Authority': authority_id}
        self._service_binding = None if consumer is None else {'authority_id': authority_id, 'consumer': consumer}
        self.transport = HTTPSOrigin(origin, ca_file, timeout, attempts, authority_id=authority_id)
        self.origin = self.transport.origin
        self.cache_dir = safe_directory(cache_dir)
        self.package_dir = safe_directory(self.cache_dir / "packages")
        self.index_public_key = index_public_key
        self.publisher_trust = TRUST.copy() if publisher_trust is None else dict(publisher_trust)
        if type(minimum_revision) is not int or not 0 <= minimum_revision < 2 ** 63:
            raise RegistryError("invalid provisioned minimum index revision")
        self.minimum_revision = minimum_revision
        if type(clock_skew_seconds) is not int or not 0 <= clock_skew_seconds <= 300:
            raise RegistryError("invalid registry clock skew allowance")
        self.clock_skew_seconds = clock_skew_seconds
        self.clock = time.time if clock is None else clock
        self.state_file = self.cache_dir / "verified-index.json"
        self.lock_file = self.cache_dir / "cache.lock"
        self.mutex = threading.RLock()
        self.last_download = None
        # Re-read the bounded file on every use. Only identical bytes under the
        # identical trust policy may reuse cryptographic verification; neither
        # a pathname nor mtime is a trust decision. Returned data is copied.
        self._verified_bytes = None
        self._verified_policy = None
        self._verified_cache = None

    def _state(self, require_fresh=False):
        try:
            raw = read_regular(self.state_file, MAX_INDEX_BYTES + 4096)
        except FileNotFoundError:
            return None
        policy = (self.origin, self.index_public_key, canonical(self.publisher_trust), self.minimum_revision,
                  canonical(self._service_binding))
        if raw == self._verified_bytes and policy == self._verified_policy:
            state = deepcopy(self._verified_cache)
            if require_fresh:
                check_index_time(state["index"], self.clock(), self.clock_skew_seconds)
            return state
        state = decode(raw)
        fields = {'origin', 'high_watermark', 'index'} | ({'service_binding'} if self._service_binding is not None else set())
        if not isinstance(state, dict) or set(state) != fields or state['origin'] != self.origin or state.get('service_binding') != self._service_binding:
            raise RegistryError("registry cache is not bound to this origin and consumer authority")
        index = verify_index(state["index"], self.index_public_key, self.publisher_trust,
                             require_fresh=False, now=self.clock(), clock_skew_seconds=self.clock_skew_seconds)
        if type(state["high_watermark"]) is not int or state["high_watermark"] != index["revision"] or index["revision"] < self.minimum_revision:
            raise RegistryError("registry cached revision is invalid")
        self._verified_bytes, self._verified_policy = raw, policy
        self._verified_cache = deepcopy(state)
        if require_fresh:
            check_index_time(index, self.clock(), self.clock_skew_seconds)
        return state

    def catalog(self):
        with self.mutex, locked(self.lock_file):
            state = self._state()
            return [] if state is None else self._catalog(state["index"])

    @staticmethod
    def _catalog(index):
        return [entry for entry in index["packages"] if not is_revoked(entry["manifest"], index["revocations"])]

    def revocations(self):
        """Persistent signed revocations remain effective even after index expiry."""
        with self.mutex, locked(self.lock_file):
            state = self._state()
            return [] if state is None else list(state["index"]["revocations"])

    def verified_state(self):
        with self.mutex, locked(self.lock_file):
            state = self._state()
            if state is None:
                return None
            index = state["index"]
            try:
                check_index_time(index, self.clock(), self.clock_skew_seconds)
                fresh = True
            except RegistryError:
                fresh = False
            return {key: index[key] for key in ("revision", "issued_at", "expires_at", "revocations")} | {"fresh": fresh}

    def refresh(self, *, commit_guard=None):
        """Fetch/verify without admission locks, then commit under optional guard.

        The guard factory is entered BEFORE either client lock. Its exit runs
        AFTER those locks are released, including rename-success/fsync-failure.
        A platform can therefore synchronize revocations while holding its Hub
        admission lock without lock inversion or holding that lock over network.
        """
        raw = self.transport.request("GET", "/index.json", MAX_INDEX_BYTES, headers=self._consumer_headers)
        index = verify_index(decode(raw), self.index_public_key, self.publisher_trust,
                             now=self.clock(), clock_skew_seconds=self.clock_skew_seconds)
        guard = nullcontext if commit_guard is None else commit_guard
        with guard(), self.mutex, locked(self.lock_file):
            previous = self._state()
            minimum = max(self.minimum_revision, previous["high_watermark"] if previous else 0)
            if index["revision"] < minimum:
                raise RegistryError("older registry index rollback rejected")
            if previous:
                old = previous["index"]
                if index["revision"] == old["revision"] and canonical(index) != canonical(old):
                    raise RegistryError("same-revision index equivocation rejected")
                if not set(old["revocations"]) <= set(index["revocations"]):
                    raise RegistryError("known revocations cannot be removed from later indexes")
                entries = {(e["manifest"]["id"], e["manifest"]["version"]): e for e in index["packages"]}
                for entry in old["packages"]:
                    identity = (entry["manifest"]["id"], entry["manifest"]["version"])
                    if identity not in entries or entries[identity] != entry:
                        raise RegistryError("append-only catalog version was removed or changed")
            state = {"origin": self.origin, "high_watermark": index["revision"], "index": index}
            if self._service_binding is not None:
                state['service_binding'] = dict(self._service_binding)
            check_index_time(index, self.clock(), self.clock_skew_seconds)
            atomic_write(self.state_file, canonical(state))
        return {"revision": index["revision"], "catalog": self._catalog(index), "offline": False,
                "issued_at": index["issued_at"], "expires_at": index["expires_at"], "revocations": index["revocations"]}

    def _verify_download(self, raw, entry):
        if len(raw) != entry["size"] or sha256(raw) != entry["hash"]:
            raise RegistryError("package size or SHA-256 mismatch")
        package = decode(raw)
        manifest, package_hash = verify_package(package, self.publisher_trust)
        if manifest != entry["manifest"] or package_hash != entry["hash"]:
            raise RegistryError("package manifest or publisher does not match signed index")
        return package

    def _entry(self, tool_id, version):
        state = self._state(require_fresh=True)
        if state is None:
            raise RegistryError("refresh the registry before downloading")
        index = state["index"]
        entry = next((e for e in index["packages"] if e["manifest"]["id"] == tool_id and e["manifest"]["version"] == version), None)
        if entry is None:
            raise RegistryError("Tool version is not in the verified registry catalog; refresh first")
        if is_revoked(entry["manifest"], index["revocations"]):
            raise RegistryError("Tool publisher or version revoked")
        return entry

    def download(self, tool_id, version):
        with self.mutex, locked(self.lock_file):
            entry = self._entry(tool_id, version)
        require_compatible(entry['manifest'])
        path = self.package_dir / f"{entry['hash']}.rock.json"
        try:
            cached = read_regular(path, MAX_PACKAGE_BYTES)
        except FileNotFoundError:
            cached = None
        if cached is not None:
            package = self._verify_download(cached, entry)
            with self.mutex, locked(self.lock_file):
                if self._entry(tool_id, version) != entry:
                    raise RegistryError("catalog changed while verifying cached package")
            self.last_download = {"hash": entry["hash"], "cache_hit": True}
            return package
        raw = self.transport.request("GET", f"/packages/{entry['hash']}.rock.json", MAX_PACKAGE_BYTES, headers=self._consumer_headers)
        package = self._verify_download(raw, entry)
        with self.mutex, locked(self.lock_file):
            # Recheck the current signed catalog before committing downloaded data.
            if self._entry(tool_id, version) != entry:
                raise RegistryError("catalog changed before package commit")
            atomic_write(path, raw)
        self.last_download = {"hash": entry["hash"], "cache_hit": False}
        return package

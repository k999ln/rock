#!/usr/bin/env python3
"""Rock virtual-board rootfs A/B updater and initramfs boot selector.

Trusted OS code, run as root. The embedded key is PUBLIC RFC 8032 test data.
This is a development rootfs updater, NOT production secure boot or a kernel
updater. Hardware-backed rollback protection is not provided.
"""
from __future__ import annotations

import argparse
from contextlib import contextmanager
import errno
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import struct
import subprocess
import sys
import tempfile

MAGIC = b"ROCKAB1\n"
MAX_HEADER = 16 * 1024
MAX_STATE = 64 * 1024
MAX_IMAGE = 2 * 1024**3
CHUNK = 1024 * 1024
ATTEMPTS = 2
PUBLIC_TEST_KEY = "d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a"
LAYOUT = "rock-virt-ab1"
DATA_ABI = "rock-data-v1"


class UpdateError(RuntimeError):
    pass


def require(condition, message):
    if not condition:
        raise UpdateError(message)


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"),
                      ensure_ascii=True, allow_nan=False).encode("ascii")


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        require(key not in result, "duplicate JSON field")
        result[key] = value
    return result


def decode(raw, limit):
    require(0 < len(raw) <= limit, "JSON input exceeds its limit")
    try:
        return json.loads(raw, object_pairs_hook=unique_object)
    except (ValueError, UnicodeError, RecursionError) as error:
        raise UpdateError("malformed JSON") from error


def read_limited(path, limit):
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(fd, "rb") as stream:
        require(stat.S_ISREG(os.fstat(stream.fileno()).st_mode), "expected regular metadata file")
        return decode(stream.read(limit + 1), limit)


def manifest_ok(manifest):
    fields = {"schema", "architecture", "layout", "data_abi", "sequence", "version", "size", "sha256"}
    require(type(manifest) is dict and set(manifest) == fields, "unknown manifest fields")
    require(manifest["schema"] == "rock-os-rootfs-v2", "wrong update schema")
    require(manifest["data_abi"] == DATA_ABI, "incompatible persistent data ABI")
    require(manifest["architecture"] == "aarch64" and manifest["layout"] == LAYOUT,
            "update targets another board/architecture")
    require(type(manifest["sequence"]) is int and 1 <= manifest["sequence"] < 2**53,
            "invalid sequence")
    require(type(manifest["size"]) is int and 4096 <= manifest["size"] <= MAX_IMAGE,
            "invalid rootfs size")
    require(isinstance(manifest["version"], str) and
            re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._+-]{0,63}", manifest["version"]),
            "invalid version")
    require(isinstance(manifest["sha256"], str) and
            re.fullmatch(r"[0-9a-f]{64}", manifest["sha256"]), "invalid rootfs digest")
    return manifest


def verify_envelope(envelope):
    require(type(envelope) is dict and set(envelope) == {"manifest", "signature"},
            "invalid signed envelope")
    manifest = manifest_ok(envelope["manifest"])
    signature = envelope["signature"]
    require(isinstance(signature, str) and re.fullmatch(r"[0-9a-f]{128}", signature),
            "invalid signature encoding")
    with tempfile.TemporaryDirectory(prefix="rock-ab-signature-") as temporary:
        directory = Path(temporary)
        (directory / "public.der").write_bytes(bytes.fromhex(
            "302a300506032b6570032100" + PUBLIC_TEST_KEY))
        (directory / "manifest").write_bytes(canonical(manifest))
        (directory / "signature").write_bytes(bytes.fromhex(signature))
        result = subprocess.run([
            "openssl", "pkeyutl", "-verify", "-pubin", "-keyform", "DER",
            "-inkey", str(directory / "public.der"), "-rawin", "-in",
            str(directory / "manifest"), "-sigfile", str(directory / "signature")
        ], capture_output=True, timeout=15)
    require(result.returncode == 0, "update signature rejected")
    return manifest


def digest_stream(stream, size):
    digest = hashlib.sha256()
    remaining = size
    while remaining:
        block = stream.read(min(CHUNK, remaining))
        require(bool(block), "truncated rootfs payload")
        digest.update(block)
        remaining -= len(block)
    return digest.hexdigest()


def stable_file_identity(info):
    # Reading may update atime; that is not a payload mutation.
    return (info.st_dev, info.st_ino, info.st_size, info.st_mtime_ns, info.st_ctime_ns)


def clean_ext4(stream, offset=0):
    """Require clean ext4 metadata before a no-journal-replay mount.

    This bounded on-device check is additional to the signed full-image hash;
    the build host separately runs e2fsck -fn before signing real images.
    Field definitions: docs.kernel.org/filesystems/ext4/super.html.
    """
    position = stream.tell()
    try:
        stream.seek(offset + 1024)
        superblock = stream.read(1024)
        require(len(superblock) == 1024 and struct.unpack_from('<H', superblock, 0x38)[0] == 0xef53,
                "rootfs must contain an ext4 superblock")
        require(struct.unpack_from('<H', superblock, 0x3a)[0] == 1,
                "rootfs is not cleanly unmounted")
        require(not (struct.unpack_from('<I', superblock, 0x60)[0] & 0x4),
                "rootfs requires journal recovery")
        require(not (struct.unpack_from('<I', superblock, 0x64)[0] & 0x10000) and
                struct.unpack_from('<I', superblock, 0xe8)[0] == 0,
                "rootfs requires orphan recovery")
    finally:
        stream.seek(position)


def fsync_directory(directory):
    fd = os.open(directory, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def atomic_json(path, value):
    raw = canonical(value) + b"\n"
    require(len(raw) <= MAX_STATE, "metadata exceeds state limit")
    fd, temporary = tempfile.mkstemp(prefix=".state-", dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as stream:
            stream.write(raw)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
        fsync_directory(path.parent)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


class Updater:
    def __init__(self, data="/data/rock-update", devices=None,
                 boot_record="/run/rock-boot.json", factory="/etc/rock-update/factory.json",
                 *, test_regular_files=False, fault_hook=None):
        self.data = Path(data)
        self.devices = {k: Path(v) for k, v in (devices or {"A": "/dev/vda", "B": "/dev/vdc"}).items()}
        require(set(self.devices) == {"A", "B"}, "A/B devices required")
        require(self.devices["A"] != self.devices["B"], "slots must use distinct devices")
        self.boot_record = Path(boot_record)
        self.factory = Path(factory)
        self.test_regular_files = test_regular_files
        # Python-only injection seam; no production CLI or environment option.
        self.fault_hook = fault_hook
        self.state_path = self.data / "state.json"

    def fault(self, point):
        if self.fault_hook is not None:
            self.fault_hook(point)

    @contextmanager
    def lock(self, *, allow_readonly=False):
        if not self.test_regular_files:
            require(os.geteuid() == 0, "root is required to update OS slots")
        self.data.mkdir(mode=0o700, parents=True, exist_ok=True)
        info = self.data.lstat()
        require(stat.S_ISDIR(info.st_mode) and not (info.st_mode & 0o022),
                "update state directory must be private to its owner")
        if not self.test_regular_files:
            require(info.st_uid == 0, "update state must be owned by root")
        try:
            fd = os.open(self.data / "lock", os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
        except OSError as error:
            if not allow_readonly or error.errno not in (errno.EROFS, errno.EACCES):
                raise
            # Existing local ext4 lock files support flock through a read-only
            # descriptor. Never invent a lock or bootstrap metadata on failure.
            fd = os.open(self.data / "lock", os.O_RDONLY | os.O_NOFOLLOW)
        try:
            require(stat.S_ISREG(os.fstat(fd).st_mode), "invalid update lock")
            fcntl.flock(fd, fcntl.LOCK_EX)
            yield
        finally:
            os.close(fd)

    def read_state(self):
        state = read_limited(self.state_path, MAX_STATE)
        require(type(state) is dict and set(state) == {
            "schema", "generation", "committed", "pending", "attempts_left", "floor", "slots"
        }, "invalid boot state fields")
        require(state["schema"] == 1 and type(state["schema"]) is int, "unsupported state schema")
        require(type(state["generation"]) is int and 0 <= state["generation"] < 2**53,
                "invalid state generation")
        require(state["committed"] in ("A", "B"), "invalid committed slot")
        require(state["pending"] in (None, "A", "B") and
                state["pending"] != state["committed"], "invalid pending slot")
        require(type(state["attempts_left"]) is int and 0 <= state["attempts_left"] <= ATTEMPTS,
                "invalid attempt counter")
        require(state["pending"] is not None or state["attempts_left"] == 0,
                "attempts without pending slot")
        require(type(state["floor"]) is int and 1 <= state["floor"] < 2**53,
                "invalid sequence floor")
        require(type(state["slots"]) is dict and set(state["slots"]) == {"A", "B"},
                "invalid slot metadata")
        committed = verify_envelope(state["slots"][state["committed"]])
        require(committed["sequence"] == state["floor"], "committed sequence does not match floor")
        for slot in ("A", "B"):
            if state["slots"][slot] is not None:
                verify_envelope(state["slots"][slot])
        if state["pending"]:
            require(state["slots"][state["pending"]] is not None and
                    state["slots"][state["pending"]]["manifest"]["sequence"] > state["floor"],
                    "pending slot must advance sequence")
        return state

    def save_state(self, state):
        state["generation"] += 1
        atomic_json(self.state_path, state)

    def save_selection(self, state):
        """A failed trial-state write may only fall back to the known committed OS.

        Callers must already have read and authenticated the complete state.
        Invalid metadata/signatures and bootstrap errors are never caught here.
        """
        try:
            self.save_state(state)
            return True
        except OSError as error:
            if error.errno not in (errno.ENOSPC, errno.EDQUOT, errno.EROFS, errno.EIO, errno.EACCES):
                raise
            print(f"ROCK_AB_STATE_WRITE_FALLBACK errno={error.errno}", file=sys.stderr, flush=True)
            return False

    @contextmanager
    def slot_stream(self, slot, *, writable=False):
        fd = os.open(self.devices[slot], (os.O_RDWR if writable else os.O_RDONLY) | os.O_NOFOLLOW)
        try:
            info = os.fstat(fd)
            if self.test_regular_files:
                require(stat.S_ISREG(info.st_mode), "test slot must be a regular file")
                size = info.st_size
            else:
                require(stat.S_ISBLK(info.st_mode), "OS slots must be block devices")
                size = struct.unpack("Q", fcntl.ioctl(fd, 0x80081272, b"\0" * 8))[0]
                # The inactive target must never be mounted, even at another path.
                if writable:
                    numbers = f"{os.major(info.st_rdev)}:{os.minor(info.st_rdev)}"
                    require(all(line.split()[2] != numbers for line in Path("/proc/self/mountinfo").read_text().splitlines()),
                            "refusing to write a mounted rootfs device")
            with os.fdopen(fd, "r+b" if writable else "rb", closefd=False) as stream:
                yield stream, size
        finally:
            os.close(fd)

    def verify_slot(self, slot, envelope):
        manifest = verify_envelope(envelope)
        with self.slot_stream(slot) as (stream, size):
            require(size == manifest["size"], "rootfs slot capacity differs from signed image size")
            require(digest_stream(stream, size) == manifest["sha256"], "rootfs slot digest mismatch")
            clean_ext4(stream)
        return manifest

    def bootstrap(self):
        # Called only by initramfs with its immutable factory envelope.
        envelope = read_limited(self.factory, MAX_HEADER)
        manifest = self.verify_slot("A", envelope)
        state = {"schema": 1, "generation": 0, "committed": "A", "pending": None,
                 "attempts_left": 0, "floor": manifest["sequence"], "slots": {"A": envelope, "B": None}}
        self.save_state(state)
        return state

    def boot_select(self):
        with self.lock(allow_readonly=True):
            state = self.read_state() if os.path.lexists(self.state_path) else self.bootstrap()
            chosen = state["committed"]
            reason = "committed"
            if state["pending"] and state["attempts_left"]:
                chosen = state["pending"]
                state["attempts_left"] -= 1
                if not self.save_selection(state):
                    chosen = state["committed"]
                    reason = "state-write-failed"
                else:
                    self.fault("boot.attempts_saved")
                    try:
                        self.verify_slot(chosen, state["slots"][chosen])
                        reason = "trial"
                    except (UpdateError, OSError):
                        chosen = state["committed"]
                        state["pending"] = None
                        state["attempts_left"] = 0
                        reason = "rejected-trial" if self.save_selection(state) else "state-write-failed"
            elif state["pending"]:
                state["pending"] = None
                state["attempts_left"] = 0
                reason = "attempts-exhausted" if self.save_selection(state) else "state-write-failed"
            manifest = self.verify_slot(chosen, state["slots"][chosen])
            record = {"slot": chosen, "sequence": manifest["sequence"], "version": manifest["version"],
                      "sha256": manifest["sha256"], "reason": reason, "generation": state["generation"]}
            self.boot_record.parent.mkdir(mode=0o755, parents=True, exist_ok=True)
            atomic_json(self.boot_record, record)
            print(f"ROCK_AB_SELECTED slot={chosen} sequence={record['sequence']} reason={reason}",
                  file=sys.stderr, flush=True)
            return self.devices[chosen]

    def running_slot(self, state):
        record = read_limited(self.boot_record, MAX_HEADER)
        require(type(record) is dict and record.get("slot") in ("A", "B"), "no initramfs boot record")
        slot = record["slot"]
        envelope = state["slots"][slot]
        require(envelope is not None and record.get("sha256") == envelope["manifest"]["sha256"]
                and record.get("sequence") == envelope["manifest"]["sequence"], "boot identity differs from state")
        if not self.test_regular_files:
            device = self.devices[slot].stat()
            require(os.stat("/").st_dev == device.st_rdev, "boot record does not identify the mounted root")
            root = [line.split() for line in Path("/proc/self/mountinfo").read_text().splitlines()
                    if line.split()[4] == "/"]
            require(len(root) == 1 and "ro" in root[0][5].split(","), "OS root must be mounted read-only")
        return slot

    def mark_good(self):
        with self.lock(allow_readonly=True):
            state = self.read_state()
            slot = self.running_slot(state)
            if state["pending"] is None:
                require(slot == state["committed"], "only the committed slot can be acknowledged")
                atomic_json(self.boot_record.with_name("rock-boot-good.json"),
                            {"slot": slot, "sequence": state["floor"]})
                return {"result": "already-good", "slot": slot, "sequence": state["floor"]}
            if slot == state["committed"] and read_limited(self.boot_record, MAX_HEADER).get("reason") == "state-write-failed":
                # A full/read-only data volume must not make the healthy old OS
                # loop in its health hook. No trial, floor, or persistent state
                # is acknowledged or changed by this runtime-only readiness.
                atomic_json(self.boot_record.with_name("rock-boot-good.json"),
                            {"slot": slot, "sequence": state["floor"]})
                return {"result": "committed-fallback", "slot": slot, "sequence": state["floor"]}
            require(slot == state["pending"], "cannot confirm a slot that is not running")
            self.verify_slot(slot, state["slots"][slot])
            state["committed"] = slot
            state["pending"] = None
            state["attempts_left"] = 0
            state["floor"] = state["slots"][slot]["manifest"]["sequence"]
            self.save_state(state)
            self.fault("confirm.committed_saved")
            atomic_json(self.boot_record.with_name("rock-boot-good.json"),
                        {"slot": slot, "sequence": state["floor"]})
            return {"result": "committed", "slot": slot, "sequence": state["floor"]}

    def install(self, bundle, *, write_observer=None):
        """Verify the ENTIRE signed bundle before touching an inactive block.

        write_observer is a Python-only test seam used by the guest power-loss
        test. It is not exposed through the installed command line or an env var.
        """
        with self.lock():
            state = self.read_state()
            active = self.running_slot(state)
            require(active == state["committed"], "confirm or roll back the running trial before updating")
            fd = os.open(bundle, os.O_RDONLY | os.O_NOFOLLOW)
            with os.fdopen(fd, "rb") as source:
                before = os.fstat(source.fileno())
                require(stat.S_ISREG(before.st_mode), "bundle must be a regular local file")
                require(source.read(len(MAGIC)) == MAGIC, "invalid bundle magic")
                raw_size = source.read(4)
                require(len(raw_size) == 4, "missing bundle header length")
                header_size = struct.unpack(">I", raw_size)[0]
                require(0 < header_size <= MAX_HEADER, "bundle header exceeds limit")
                envelope = decode(source.read(header_size), MAX_HEADER)
                manifest = verify_envelope(envelope)
                payload_offset = source.tell()
                require(before.st_size == payload_offset + manifest["size"], "bundle payload length mismatch")
                require(digest_stream(source, manifest["size"]) == manifest["sha256"],
                        "bundle payload digest rejected")
                clean_ext4(source, payload_offset)
                require(stable_file_identity(os.fstat(source.fileno())) == stable_file_identity(before),
                        "bundle changed during preflight verification")
                if state["pending"]:
                    require(state["slots"][state["pending"]] == envelope,
                            "another update is pending; reboot before installing another")
                    self.verify_slot(state["pending"], envelope)
                    return {"result": "already-staged", "slot": state["pending"], "sequence": manifest["sequence"]}
                require(manifest["sequence"] > state["floor"], "update sequence is not newer than committed OS")
                target = "B" if active == "A" else "A"
                with self.slot_stream(target, writable=True) as (destination, size):
                    require(size == manifest["size"], "inactive slot does not fit the signed image exactly")
                    source.seek(payload_offset)
                    digest = hashlib.sha256()
                    written = 0
                    while written < size:
                        block = source.read(min(CHUNK, size - written))
                        require(bool(block), "bundle became truncated during copying")
                        destination.write(block)
                        digest.update(block)
                        written += len(block)
                        if write_observer is not None:
                            destination.flush()
                            # Test faults occur after an acknowledged block
                            # write, rather than only a userspace buffer copy.
                            os.fsync(destination.fileno())
                            write_observer(written)
                    destination.flush()
                    os.fsync(destination.fileno())
                    require(digest.hexdigest() == manifest["sha256"] and
                            stable_file_identity(os.fstat(source.fileno())) == stable_file_identity(before),
                            "bundle changed while writing; trial NOT armed")
                self.verify_slot(target, envelope)
                self.fault("install.payload_synced")
                # An interrupted write leaves the old committed state intact.
                state["slots"][target] = envelope
                state["pending"] = target
                state["attempts_left"] = ATTEMPTS
                self.save_state(state)
                self.fault("install.pending_saved")
                return {"result": "staged", "slot": target, "sequence": manifest["sequence"]}


def main(argv=None, *, updater=None):
    parser = argparse.ArgumentParser(description="Rock virtual-board A/B updater (PUBLIC development trust)")
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("boot-select")
    commands.add_parser("mark-good")
    commands.add_parser("status")
    install = commands.add_parser("install")
    install.add_argument("bundle", type=Path)
    arguments = parser.parse_args(argv)
    updater = updater if updater is not None else Updater()
    try:
        if arguments.command == "boot-select":
            print(updater.boot_select())
        elif arguments.command == "install":
            print(json.dumps(updater.install(arguments.bundle), sort_keys=True))
        elif arguments.command == "mark-good":
            print(json.dumps(updater.mark_good(), sort_keys=True))
        else:
            with updater.lock(allow_readonly=True):
                print(json.dumps(updater.read_state(), sort_keys=True))
        return 0
    except (UpdateError, OSError, subprocess.SubprocessError) as error:
        print(f"ROCK_AB_ERROR {error}", file=sys.stderr, flush=True)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

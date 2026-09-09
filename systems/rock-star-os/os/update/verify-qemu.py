#!/usr/bin/env python3
"""Eight real ARM64 boots exercise guest-controlled A/B update and recovery.

No physical device access. No host edits to state/slot selection between boots.
One deliberately interrupted update kills only the spawned disposable QEMU.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import selectors
import shutil
import signal
import struct
import subprocess
import sys
import tempfile
import time

from make_bundle import bundle, check_filesystem
from rock_update import MAGIC, canonical


def sha256(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def sparse_copy(source, target):
    subprocess.run(["cp", "--sparse=always", "--reflink=auto", str(source), str(target)], check=True)


def span_digest(path, start, size):
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        stream.seek(start)
        while size:
            block = stream.read(min(size, 1024 * 1024))
            if not block:
                raise RuntimeError('truncated disk while checking acknowledged partial write')
            digest.update(block)
            size -= len(block)
    return digest.hexdigest()


def check_partial_write(slot, old_image, new_image):
    # Read-only host evidence, with the QEMU process already killed. No boot
    # state or disk bytes are edited here; the next selector remains guest code.
    prefix = 1024 * 1024
    size = slot.stat().st_size
    old_prefix = span_digest(old_image, 0, prefix)
    new_prefix = span_digest(new_image, 0, prefix)
    old_suffix = span_digest(old_image, prefix, size - prefix)
    new_suffix = span_digest(new_image, prefix, size - prefix)
    result = {'acknowledged_prefix_bytes': prefix,
              'prefix_is_new_and_changed': span_digest(slot, 0, prefix) == new_prefix != old_prefix,
              'suffix_is_previous_and_incomplete': span_digest(slot, prefix, size - prefix) == old_suffix != new_suffix}
    if not all((result['prefix_is_new_and_changed'], result['suffix_is_previous_and_incomplete'])):
        raise RuntimeError('power-cut image does not prove a durable, incomplete inactive-slot write: ' + str(result))
    return result


def boot(command, log, timeout, *, power_cut=False, cut_marker=b"ROCK_AB_POWER_CUT_READY written="):
    process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    selector = selectors.DefaultSelector()
    selector.register(process.stdout, selectors.EVENT_READ)
    deadline = time.monotonic() + timeout
    tail = b""
    cut = False
    try:
        with log.open("xb") as output:
            while selector.get_map():
                if time.monotonic() >= deadline:
                    raise TimeoutError(f"QEMU guest timed out; inspect {log}")
                for key, _ in selector.select(timeout=0.5):
                    block = os.read(key.fileobj.fileno(), 65536)
                    if not block:
                        selector.unregister(key.fileobj)
                        continue
                    output.write(block)
                    output.flush()
                    tail = (tail + block)[-8192:]
                    if power_cut and not cut and cut_marker in tail:
                        process.kill()
                        cut = True
            code = process.wait(timeout=10)
        if power_cut:
            if not cut or code != -signal.SIGKILL:
                raise RuntimeError("deliberate power-cut point was not reached")
        elif code != 0:
            raise RuntimeError(f"QEMU returned {code}; inspect {log}")
        return {"exit_code": code, "deliberate_power_cut": cut}
    finally:
        selector.close()
        if process.poll() is None:
            process.kill()
            process.wait(timeout=10)
        process.stdout.close()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--artifacts", type=Path,
                        default=Path(__file__).resolve().parents[2] / "artifacts/os")
    parser.add_argument("--timeout", type=int, default=300)
    parser.add_argument("--qemu", default="qemu-system-aarch64")
    args = parser.parse_args()
    if sys.platform != "linux":
        raise SystemExit("Run inside the Linux build VM, after root-ready and image build")
    for name in (args.qemu, "mkfs.ext4", "debugfs", "e2fsck", "cp", "openssl"):
        if not shutil.which(name):
            raise SystemExit(f"Missing test dependency: {name}")
    artifacts = args.artifacts.resolve()
    kernel, rootfs, initrd = (artifacts / name for name in ("Image", "rootfs.ext4", "stage0.cpio.gz"))
    for path in (kernel, rootfs, initrd):
        if not path.is_file():
            raise SystemExit(f"Missing {path}; build final rootfs and matching initramfs first")
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    evidence = Path(tempfile.mkdtemp(prefix=f"verify-ab-{stamp}-", dir=artifacts))
    fixture = evidence / "fixtures"
    fixture.mkdir()
    input_hashes = {path.name: sha256(path) for path in (kernel, rootfs, initrd)}
    report = {"status": "RUNNING", "started_utc": stamp, "target": "QEMU virt-10.0 ARM64",
              "physical_blackberry": "NOT TESTED", "production_secure_boot": False,
              "native_ui_checked": False, "ui_health_mode": "explicit-development-headless",
              "hardware_antirollback": False, "trust": "PUBLIC RFC 8032 development fixture",
              "input_sha256": input_hashes, "boots": [], "network_adapter": "none",
              "selector": "same guest stage0 initramfs on every boot; no host slot/state patches"}
    report_path = evidence / "report.json"
    try:
        slot_a, slot_b, data, payloads = (evidence / name for name in
                                         ("slot-a.ext4", "slot-b.ext4", "userdata.ext4", "payloads.ext4"))
        sparse_copy(rootfs, slot_a)
        with slot_b.open("xb") as stream:
            stream.truncate(rootfs.stat().st_size)
        with data.open("xb") as stream:
            stream.truncate(128 * 1024 * 1024)
        subprocess.run(["mkfs.ext4", "-q", "-F", "-L", "rock-data", str(data)], check=True)
        check_filesystem(rootfs)
        bundle(rootfs, fixture / "release-1.rock", 1, "factory-1")
        for sequence in (2, 3, 4):
            image = evidence / f"release-{sequence}.ext4"
            sparse_copy(rootfs, image)
            # A per-release volume name makes the first written MiB differ;
            # later file contents independently distinguish the unwritten tail.
            subprocess.run(["debugfs", "-w", "-R", f"set_super_value volume_name rock-release-{sequence}", image.name],
                           cwd=evidence, check=True, capture_output=True)
            marker = evidence / f"marker-{sequence}"
            marker.write_text(f"release-{sequence}\n")
            result = subprocess.run(["debugfs", "-w", "-R",
                                     f"write marker-{sequence} /etc/rock-update/build-marker", image.name],
                                    cwd=evidence, check=True, capture_output=True, text=True)
            if "Allocated inode" not in result.stdout:
                raise RuntimeError(f"Cannot set signed image release marker: {result.stdout} {result.stderr}")
            if sequence == 3:
                result = subprocess.run(["debugfs", "-w", "-R",
                                         "write marker-3 /etc/rock-update/health-fail", image.name],
                                        cwd=evidence, check=True, capture_output=True, text=True)
                if "Allocated inode" not in result.stdout:
                    raise RuntimeError("Cannot prepare the intentionally unhealthy signed image")
                # First trial reaches the failed health check. Second trial hangs
                # before it and must be rescued by the independent boot watchdog.
                (evidence / "hang-second-boot").write_text(
                    '#!/bin/sh\n[ "${1:-start}" = start ] || exit 0\n'
                    'if [ -e /data/rock-update/ab-test-first-failure ]; then\n'
                    '  echo ROCK_AB_TEST_BOOT_HANG\n'
                    '  while :; do sleep 1; done\n'
                    'fi\n'
                    'echo first > /data/rock-update/ab-test-first-failure\n'
                )
                result = subprocess.run(["debugfs", "-w", "-R",
                                         "write hang-second-boot /etc/init.d/S96rock-ab-hang", image.name],
                                        cwd=evidence, check=True, capture_output=True, text=True)
                if "Allocated inode" not in result.stdout:
                    raise RuntimeError("Cannot prepare signed hung-init test image")
                subprocess.run(["debugfs", "-w", "-R",
                                "set_inode_field /etc/init.d/S96rock-ab-hang mode 0100755", image.name],
                               cwd=evidence, check=True, capture_output=True)
            check_filesystem(image)
            bundle(image, fixture / (f"release-{sequence}" + ("-unhealthy" if sequence == 3 else "") + ".rock"),
                   sequence, f"release-{sequence}")
        valid = fixture / "release-2.rock"
        with valid.open("rb") as stream:
            assert stream.read(len(MAGIC)) == MAGIC
            length = struct.unpack(">I", stream.read(4))[0]
            header = json.loads(stream.read(length))
        header["signature"] = "00" * 64
        raw = canonical(header)
        (fixture / "bad-signature.rock").write_bytes(MAGIC + struct.pack(">I", len(raw)) + raw)
        sparse_copy(valid, fixture / "bad-payload.rock")
        with (fixture / "bad-payload.rock").open("r+b") as stream:
            stream.seek(-1, os.SEEK_END)
            old = stream.read(1)
            stream.seek(-1, os.SEEK_END)
            stream.write(bytes([old[0] ^ 0xff]))
        volume_size = sum(path.stat().st_size for path in fixture.iterdir()) * 12 // 10 + 64 * 1024 * 1024
        with payloads.open("xb") as stream:
            stream.truncate(volume_size)
        subprocess.run(["mkfs.ext4", "-q", "-F", "-L", "rock-ab-fixtures", "-d", str(fixture), str(payloads)], check=True)
        base = [args.qemu, "-machine", "virt-10.0,gic-version=3", "-cpu", "cortex-a53", "-accel", "tcg",
                "-m", "1024", "-smp", "2", "-nographic", "-monitor", "none", "-no-reboot", "-nic", "none",
                "-kernel", str(kernel), "-initrd", str(initrd),
                "-drive", f"if=none,file={slot_a},format=raw,id=slota", "-device", "virtio-blk-pci,drive=slota,addr=0x1",
                "-drive", f"if=none,file={data},format=raw,id=userdata", "-device", "virtio-blk-pci,drive=userdata,addr=0x2",
                "-object", "rng-random,filename=/dev/urandom,id=rockrng", "-device", "virtio-rng-pci,rng=rockrng,addr=0x3",
                "-drive", f"if=none,file={slot_b},format=raw,id=slotb", "-device", "virtio-blk-pci,drive=slotb,addr=0x4",
                "-drive", f"if=none,file={payloads},format=raw,id=fixtures,readonly=on", "-device", "virtio-blk-pci,drive=fixtures,addr=0x5"]
        report["base_command"] = base
        report["qemu_version"] = subprocess.check_output([args.qemu, "--version"], text=True)
        phases = [
            ("tamper", "slot=A sequence=1", ["ROCK_AB_TAMPER_REJECTED_BEFORE_WRITE", "ROCK_AB_INSTALLED_SLOT_TAMPER_INJECTED"]),
            ("restage", "slot=A sequence=1 reason=rejected-trial", ["ROCK_AB_BOOT_TAMPER_ROLLBACK_PASS"]),
            ("stage-failed", "slot=B sequence=2 reason=trial", ["ROCK_AB_HEALTHY_UPDATE_CONFIRMED"]),
            ("health-fail", "slot=A sequence=3 reason=trial", ["ROCK_AB_HEALTH_FAILED_REBOOT"]),
            ("health-fail", "slot=A sequence=3 reason=trial", ["ROCK_AB_TEST_BOOT_HANG", "ROCK_AB_WATCHDOG_REBOOT"]),
            ("interrupt", "slot=B sequence=2 reason=attempts-exhausted", ["ROCK_AB_FAILED_BOOT_ROLLBACK_PASS", "ROCK_AB_POWER_CUT_READY written="]),
            ("recover", "slot=B sequence=2 reason=committed", ["ROCK_AB_INTERRUPTED_UPDATE_RECOVERY_PASS", "ROCK_AB_SOFTWARE_DOWNGRADE_REJECTED"]),
            ("final", "slot=A sequence=4 reason=trial", ["ROCK_AB_END_TO_END_PASS"]),
        ]
        for number, (phase, selection, markers) in enumerate(phases, 1):
            log = evidence / f"boot-{number}-{phase}.log"
            command = base + ["-append", f"console=ttyAMA0 ro rootwait panic=1 rock.ui=headless rock.abtest={phase}"]
            print(f"A/B guest boot {number}/8 phase={phase}; {log}", flush=True)
            result = boot(command, log, args.timeout, power_cut=phase == "interrupt")
            if phase == 'interrupt':
                result['partial_write'] = check_partial_write(slot_a, evidence / 'release-3.ext4', evidence / 'release-4.ext4')
            output = log.read_text(errors="replace")
            required = ["ROCK_AB_SELECTED " + selection, "ROCK_AB_SWITCH_ROOT", *markers]
            if phase not in ("health-fail", "interrupt"):
                required += ["ROCK_AB_HEALTH_CONFIRMED", f"ROCK_AB_PHASE_PASS phase={phase}"]
            missing = [marker for marker in required if marker not in output]
            forbidden = [marker for marker in ("ROCK_AB_RECOVERY", "ROCK_AB_TEST_FAIL", "Kernel panic") if marker in output]
            report["boots"].append({"number": number, "phase": phase, "log": log.name, **result,
                                    "missing": missing, "forbidden": forbidden, "passed": not missing and not forbidden})
            report_path.write_text(json.dumps(report, indent=2) + "\n")
            if missing or forbidden:
                raise RuntimeError(f"Guest phase {phase} failed: missing={missing}, forbidden={forbidden}")
        if {path.name: sha256(path) for path in (kernel, rootfs, initrd)} != input_hashes:
            raise RuntimeError("input Image/rootfs/initramfs changed during A/B verification")
        report["status"] = "PASS"
        report["verified"] = ["guest stage0 selects actual root block before switch_root",
                              "signature and full payload verification precede inactive slot write",
                              "tampered installed slot rejected on real boot",
                              "healthy B root confirmed only after OS health check",
                              "failed A health check and a watchdog-rescued init hang persist attempts and roll back to B",
                              "QEMU power loss during actual inactive write retains B boot",
                              "subsequent A update succeeds; duplicate install/confirmation are idempotent",
                              "software sequence floor rejects downgrade (not hardware antirollback)"]
        print(f"PASS: eight real A/B guest boots; evidence={evidence}", flush=True)
    except BaseException as error:
        report["status"] = "FAIL"
        report["error"] = f"{type(error).__name__}: {error}"
        raise
    finally:
        report["finished_utc"] = datetime.now(timezone.utc).isoformat()
        report_path.write_text(json.dumps(report, indent=2) + "\n")


if __name__ == "__main__":
    main()

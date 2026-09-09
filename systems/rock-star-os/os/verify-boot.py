#!/usr/bin/env python3
"""Boot the generated OS twice with no NIC; retain genuine guest evidence."""
import hashlib
import json
import os
import pathlib
import shutil
import subprocess
import tempfile
from datetime import datetime, timezone


def sha256(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def main():
    repo = pathlib.Path(__file__).resolve().parent.parent
    artifacts = pathlib.Path(os.environ.get("ROCK_OS_ARTIFACTS", str(repo / "artifacts" / "os"))).resolve()
    kernel = artifacts / "Image"
    rootfs = artifacts / "rootfs.ext4"
    for path in (kernel, rootfs):
        if not path.is_file():
            raise SystemExit(f"Missing OS build output: {path}")
    qemu = shutil.which("qemu-system-aarch64")
    mkfs = shutil.which("mkfs.ext4")
    if not qemu or not mkfs:
        raise SystemExit("Linux requires qemu-system-aarch64 and mkfs.ext4")
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    evidence = pathlib.Path(tempfile.mkdtemp(prefix=f"verify-{stamp}-", dir=artifacts))
    data = evidence / "userdata.ext4"
    with data.open("xb") as stream:
        stream.truncate(64 * 1024 * 1024)
    subprocess.run([mkfs, "-q", "-F", "-L", "rock-data", str(data)], check=True)
    command = [qemu, "-machine", "virt-10.0,gic-version=3", "-cpu", "cortex-a53",
               "-accel", "tcg", "-m", "512", "-smp", "2", "-nographic",
               "-monitor", "none", "-no-reboot", "-nic", "none",
               "-kernel", str(kernel), "-append",
               "console=ttyAMA0 root=/dev/vda ro rootwait panic=-1 rock.verify=1",
               "-drive", f"if=none,file={rootfs},format=raw,id=osdisk,readonly=on",
               "-device", "virtio-blk-pci,drive=osdisk,addr=0x1",
               "-drive", f"if=none,file={data},format=raw,id=userdata",
               "-device", "virtio-blk-pci,drive=userdata,addr=0x2",
               "-object", "rng-random,filename=/dev/urandom,id=rockrng",
               "-device", "virtio-rng-pci,rng=rockrng,addr=0x3"]
    hashes = {p.name: sha256(p) for p in (kernel, rootfs)}
    report = {"status": "running", "started_utc": stamp,
              "target": "QEMU virt-10.0 ARM64 (not BlackBerry)",
              "qemu_version": subprocess.check_output([qemu, "--version"], text=True),
              "command": command, "network_adapter": "none", "image_sha256": hashes,
              "boots": [], "blackberry": "NOT TESTED", "os_update_recovery": "NOT IMPLEMENTED"}
    report_path = evidence / "report.json"
    try:
        for number in (1, 2):
            log = evidence / f"boot-{number}.log"
            print(f"Booting Rock star os: attempt {number}; log={log}", flush=True)
            with log.open("wb") as stream:
                result = subprocess.run(command, stdout=stream, stderr=subprocess.STDOUT,
                                        timeout=180, check=False)
            output = log.read_text(errors="replace")
            required = ["ROCK_OS_VERIFY_PASS", "ROCK_ROOT_READONLY_PASS",
                        "ROCK_DATA_MOUNT_PASS", "ROCK_RNG_INIT_PASS", "architecture=aarch64", "uid=1000 no_new_privs=1"]
            required.append("ROCK_FIRST_BOOT_PASS" if number == 1 else
                            "ROCK_REBOOT_PERSISTENCE_PASS completed=1")
            missing = [marker for marker in required if marker not in output]
            passed = (result.returncode == 0 and not missing and
                      "ROCK_OS_VERIFY_FAIL" not in output and "seedrng: can't" not in output)
            report["boots"].append({"number": number, "exit_code": result.returncode,
                                    "log": log.name, "passed": passed, "missing": missing})
            if not passed:
                raise RuntimeError(f"Guest boot {number} failed; missing={missing}; inspect {log}")
        if {p.name: sha256(p) for p in (kernel, rootfs)} != hashes:
            raise RuntimeError("OS image changed during read-only boot verification")
        report["status"] = "PASS"
        report["verified"] = ["actual ARM64 kernel/init/rootfs boot", "read-only OS",
                              "separate persistent data", "unprivileged boot service",
                              "peer credentials and malformed/oversized/timeout rejection",
                              "service crash/restart/corrupt-state tests inside guest",
                              "counter survives complete guest power-off and second boot"]
        print(f"PASS: two real guest boots; evidence={evidence}", flush=True)
    except Exception as error:
        report["status"] = "FAIL"
        report["error"] = str(error)
        raise
    finally:
        report["finished_utc"] = datetime.now(timezone.utc).isoformat()
        report_path.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    main()

"""Real guest-only A/B test actions; never selects the root from the host.

Installed only by install-target.sh --include-tests. Fixtures contain public
development-signed images. This is not a production update service interface.
"""
import json
import os
from pathlib import Path
import sys
import time

sys.path.insert(0, str(Path(__file__).resolve().parent))
from rock_update import Updater, UpdateError, require, digest_stream


def main():
    phases = [word.split("=", 1)[1] for word in Path("/proc/cmdline").read_text().split()
              if word.startswith("rock.abtest=")]
    require(len(phases) == 1, "exactly one guest test phase is required")
    phase = phases[0]
    if phase.startswith('fault-'):
        from fault_guest import main as fault_main
        fault_main(phase)
        return
    fixture = Path("/run/rock-ab-fixtures")
    updater = Updater()
    boot = json.loads(Path("/run/rock-boot.json").read_text())
    state = updater.read_state()
    expected = {"tamper": ("A", 1), "restage": ("A", 1), "stage-failed": ("B", 2),
                "interrupt": ("B", 2), "recover": ("B", 2), "final": ("A", 4)}
    require(phase in expected, "unknown guest test phase")
    require((boot["slot"], boot["sequence"]) == expected[phase], "wrong root selected by real initramfs")
    require(state["committed"] == boot["slot"] and state["pending"] is None,
            "health service did not confirm running root")
    require(updater.running_slot(state) == boot["slot"], "running ext4 root does not match selected slot")
    if boot["sequence"] in (2, 4):
        marker = Path("/etc/rock-update/build-marker").read_text().strip()
        require(marker == f"release-{boot['sequence']}", "running payload does not contain the expected release marker")

    def reject(name, expected_error):
        before = updater.state_path.read_bytes()
        try:
            updater.install(fixture / name)
        except UpdateError as error:
            require(expected_error in str(error), f"unexpected rejection: {error}")
        else:
            raise UpdateError(f"negative test unexpectedly accepted {name}")
        require(before == updater.state_path.read_bytes(), "rejected bundle mutated boot metadata")

    if phase == "tamper":
        with updater.slot_stream("B") as (stream, size):
            before = digest_stream(stream, size)
        reject("bad-signature.rock", "signature rejected")
        reject("bad-payload.rock", "payload digest rejected")
        with updater.slot_stream("B") as (stream, size):
            require(digest_stream(stream, size) == before, "invalid bundle wrote inactive slot")
        print("ROCK_AB_TAMPER_REJECTED_BEFORE_WRITE", flush=True)
        require(updater.install(fixture / "release-2.rock")["slot"] == "B", "wrong inactive slot")
        # Deliberate privileged test fault AFTER a correctly verified installation.
        # The next actual boot must authenticate the slot and reject this change.
        with updater.slot_stream("B", writable=True) as (stream, size):
            stream.seek(size - 1)
            original = stream.read(1)
            stream.seek(size - 1)
            stream.write(bytes([original[0] ^ 0xff]))
            stream.flush()
            os.fsync(stream.fileno())
        print("ROCK_AB_INSTALLED_SLOT_TAMPER_INJECTED", flush=True)
    elif phase == "restage":
        require(boot["reason"] == "rejected-trial", "tampered pending root was not rejected")
        print("ROCK_AB_BOOT_TAMPER_ROLLBACK_PASS", flush=True)
        updater.install(fixture / "release-2.rock")
        require(updater.install(fixture / "release-2.rock")["result"] == "already-staged",
                "retry is not idempotent")
    elif phase == "stage-failed":
        require(state["floor"] == 2, "healthy update did not advance sequence")
        require(updater.install(fixture / "release-3-unhealthy.rock")["slot"] == "A", "wrong inactive slot")
        print("ROCK_AB_HEALTHY_UPDATE_CONFIRMED", flush=True)
    elif phase == "interrupt":
        require(boot["reason"] == "attempts-exhausted", "failed boots did not roll back")
        print("ROCK_AB_FAILED_BOOT_ROLLBACK_PASS", flush=True)

        def power_cut_after_first_write(written):
            require(written > 0, "no inactive bytes written")
            print(f"ROCK_AB_POWER_CUT_READY written={written}", flush=True)
            # Host test kills ONLY this disposable QEMU process at this marker.
            # No metadata is patched and the guest never arms this partial slot.
            while True:
                time.sleep(1)

        updater.install(fixture / "release-4.rock", write_observer=power_cut_after_first_write)
        raise UpdateError("power-cut test unexpectedly returned")
    elif phase == "recover":
        require(state["floor"] == 2 and boot["reason"] == "committed", "interrupted update damaged committed boot")
        print("ROCK_AB_INTERRUPTED_UPDATE_RECOVERY_PASS", flush=True)
        reject("release-1.rock", "not newer")
        print("ROCK_AB_SOFTWARE_DOWNGRADE_REJECTED", flush=True)
        updater.install(fixture / "release-4.rock")
    elif phase == "final":
        require(state["floor"] == 4, "final update not committed")
        require(updater.mark_good()["result"] == "already-good", "confirmation is not idempotent")
        reject("release-4.rock", "not newer")
        print("ROCK_AB_END_TO_END_PASS", flush=True)
    print(f"ROCK_AB_PHASE_PASS phase={phase}", flush=True)


if __name__ == "__main__":
    main()

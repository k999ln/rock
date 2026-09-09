# Native GUI startup and rollback verification

`verify-ui-startup.py` is a host-only acceptance entrypoint for an isolated Linux
build host. `ui_startup_fixture.py` is a test-only guest injector. Neither is
installed into the product rootfs by `install-target.sh`; adding these files
does not require changing an already-built candidate image.

```sh
python3 -B -W error::ResourceWarning -m unittest tests.test_ui_startup_verifier -v
python3 -B os/update/verify-ui-startup.py \
  --artifacts /absolute/frozen-image-directory \
  --evidence /absolute/new-evidence-directory --timeout 180
```

The evidence parent must already exist and have at least 12 GiB free. Evidence
must be outside the immutable input image directory and must not already exist.
Symlink and `..` aliases are resolved before creating evidence, so a destination
inside frozen artifacts is rejected without writing there.
Commas and control characters in artifact/evidence paths are rejected because
QEMU drive arguments use commas as option separators.
The checked input set is `Image`, `rootfs.ext4`, and `stage0.cpio.gz`. The stage0
factory envelope must authenticate that exact rootfs; installed updater, UI
checker and startup scripts must match the source checkout. Source checks and
hashes are recorded. A freeze-manifest file is not required or invented.

The fixed matrix has 14 boots, one QEMU process at a time, two CPUs and 1 GiB RAM,
no NIC, and real virtio GPU, keyboard and tablet devices. Each boot has a fixed
120–240 second deadline (180 default), 16 MiB serial-log ceiling and no automatic
retry. Each rootfs is at most 512 MiB. Four cases are created in fresh directories:

| Case | Actual boot sequence | Required evidence |
| --- | --- | --- |
| ready | original A; signed test B | Real native health before both confirmations; B durably committed; actual framebuffer capture |
| absent | original A; B trial 1; B trial 2; original A | Test B never launches UI; installed checker rejects both trials; no mark-good; original A selected with attempts exhausted |
| freeze | original A; B trial 1; B trial 2; original A | Real health and framebuffer before a pidfd SIGSTOP; actual stopped state; installed checker rejects both trials; original A recovered |
| crash | original A; B trial 1; B trial 2; original A | Real health and framebuffer before a pidfd SIGKILL; pidfd reports exit; installed checker rejects both trials; original A recovered |

Every case begins from a separate copy of the same original rootfs A and a new
128 MiB data file. The existing unchanged `fault-stage` guest phase installs a
new public-fixture-signed B bundle. B differs only by a release marker and
test-specific S60/S96 fault hooks. The real UI executable, UI checker, S97 and
updater remain byte-identical. The host never edits persistent state or selects
a root between boots. The existing stage0 selector consumes both trial attempts
and chooses the original A itself. After each stopped QEMU, a read-only `debugfs`
read verifies committed slot, pending slot, attempts, sequence floor and signed
envelopes; the full A and B hashes must remain as expected.

For freeze/crash, the temporary S96 hook performs two genuine installed checker
calls, pins the same process by pidfd, publishes its real proof, allows three
seconds for a QMP screenshot, then sends the signal. The same frozen checker
must reject the stopped/dead UI when S97 runs. The absence case suppresses only
the temporary B image's launch script and requires no PID/socket to exist. No
fake READY response or replacement health checker is supplied.

The report begins as `NOT_RUN` and each unattempted case remains `NOT_RUN` after
an earlier failure. Any missing, contradictory, headless or late proof is
`FAIL`; only all 14 verified boots produce `PASS`. Original image identity and
SHA-256 are checked again even after failure. A/B/data image files remain
private disposable test artifacts; the report, original serial logs, source
hashes and genuine PPM screenshots are the review material.

This is software framebuffer/event-loop evidence and boot rollback, not
physical display scanout, actual human input, post-confirmation supervision,
BlackBerry support, real funds or production signing. S99 uses its existing
sync-and-reboot test exit; the report does not claim clean shutdown of every
application database. Existing headless A/B suites are separate. Screenshots
are genuine QMP captures but still require visual review, recorded separately.

Local validation before root execution: thirteen verifier guard tests, including
failure-before-VM at invalid limits, pass on macOS. These tests validate evidence
rejection and CLI limits; they are not QEMU acceptance. The actual matrix must
be run on the new Linux host and its result retained before claiming completion.

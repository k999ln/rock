# Rock star os: virtual-board A/B rootfs update

This directory implements a guest boot selector and inactive rootfs writer.
The kernel starts the same `stage0.cpio.gz` at every boot. Stage0 authenticates
the selected ext4 image, mounts it read-only, and executes `switch_root` into
that image's `/sbin/init`. The host test never patches a slot-selection variable
or boot-state file between boots.

Latest integrated validation: the final `rock-os-final-1327` image passed all
**eight normal boots at 13:42:09 UTC and thirteen fault boots at 13:51:38 UTC** on
2026-09-08. Both suites used the same immutable kernel, rootfs and stage0.
See normal evidence（元snapshot内の参照。履歴資料は今回のGit対象外） and
fault/ENOSPC evidence（元snapshot内の参照。履歴資料は今回のGit対象外）. The latter filled
55,644,160 logical bytes, observed a real 886-byte atomic state-save ENOSPC with
unchanged old state bytes, then booted committed A with pending B preserved.
Only the fixed test filler was reclaimed before normal health and later B
confirmation. All source image hashes and complete original logs are retained.

Prior validation: 36 state-machine/security tests, four test-helper safety
tests, three full-volume proof guard tests and seven target-shell guard tests
pass on macOS and the expanded Linux build VM. Eight real ARM64 stage0 boots
using the Linux 6.18.50 `rock-os-dash-1040` image passed at 10:50:54 UTC on
2026-09-08; the additional thirteen fault boots passed at 10:58:35 UTC.
See `evidence/20260908T104153Z/report.json` and
`evidence/20260908T105128Z/report.json`. These use the same frozen kernel,
rootfs and Dash-based initramfs, including the clean-image guard,
required platform health hook, signed data ABI format and synchronized partial
write proof: the first MiB matches the new image while the remaining bytes still
match the previous image. All four power-loss boundaries passed. In the final
64 MiB full-volume case, real data allocation and the 886-byte atomic state
write both failed with ENOSPC. The old state SHA remained unchanged. The
filesystem retained 1,310 metadata-reserved clusters of 1,024 bytes each but
zero user-available blocks. The next actual boot selected authenticated
committed A, without consuming the pending trial; the fixed test filler was
then reclaimed. Free blocks rose from 1,310 to 55,671, ordinary service health
passed, and the final boot successfully adopted pending B. Only test-owned
filler is reclaimed, not arbitrary user files or production recovery data.

Earlier eight-boot evidence remains in `evidence/20260908T095508Z/`,
`evidence/20260908T085618Z/` and `evidence/20260908T080252Z/`.
The two earlier full-volume fixture failures remain retained separately.
The first full-data fixture failed to force state-write ENOSPC:
1,568 blocks of 1,024 bytes remained after failure, enough for root's state
write but below the unprivileged services' reserved-space threshold. The actual
selector correctly started a durably recorded trial; services then failed for
lack of space. This FAIL is retained in
`evidence/20260908T090509Z-first-full-observation/`.
A second full-volume attempt at 10:10:12 UTC passed the first ten boundary
boots but rejected its own incorrect `f_bfree == 0` requirement. ext4 reserves
metadata clusters even from root data allocation; the 64 MiB test filesystem
retained 1,310 such clusters. That FAIL, raw disk observation and the exact
Linux 6.18.50 source explaining the reservation are retained in
`evidence/20260908T100417Z-reserved-clusters-observation/`.
The corrected fixture's complete thirteen-boot PASS is the later
`evidence/20260908T105128Z/` run; earlier failures were not relabeled or removed.
Filesystem reservation settings were never changed.

This is a development rootfs update system for QEMU virt-10.0/aarch64. It is not
a BlackBerry firmware image. The trust key is the already-public RFC 8032 test
fixture used in `src/blackberryrock/sdk.py`. Anyone can sign a development
image. No signing key is generated. There is no authenticated hardware chain
for Image/initramfs, dm-verity runtime checking, hardware rollback counter,
remote update transport, kernel update, or production key-enrollment system.

## Disk and build interface

| Device | Meaning | OS mount |
| --- | --- | --- |
| `/dev/vda` | Rootfs slot A, fixed capacity | `/` read-only when selected |
| `/dev/vdb` | Persistent ext4 data | `/data`, rw,nosuid,nodev,noexec |
| `/dev/vdc` | Rootfs slot B, same capacity as A | `/` read-only when selected |
| `/dev/vdd` | Read-only test fixture disk, tests only | `/run/rock-ab-fixtures` |

The QEMU backends for A and B must permit writes because the running OS writes
the inactive block device. A mounted target device is rejected by the writer.
The rootfs sizes must equal the signed image's size, at most 2 GiB. For normal
use, `/data` needs room for downloaded bundles as well as application data;
the test uses a separate read-only fixture disk and 128 MiB data disk.

Target requirements: BusyBox with `mount` (including `--move`), `switch_root`,
`poweroff`, `reboot`, `chroot` and basic applets; Dash as `/bin/sh`, retaining
`set -eu`; the OS mount-check helper; Python 3.11 or newer with
its standard library; OpenSSL's Ed25519-capable `pkeyutl` command. Kernel
requirements include initramfs/gzip, devtmpfs, proc, sysfs, tmpfs, ext4 and the
existing virtio PCI block devices. Host helpers use Python 3.11+, `readelf`,
OpenSSL, and the existing Linux QEMU/ext4 utilities.

Root's Buildroot post-build integration calls:

```sh
sh os/update/install-target.sh "$TARGET_DIR" --include-tests
```

The optional `--include-tests` is for the developmental image tested here.
Omit it for an image that should not contain the guest fault-injection driver.
`S00rockdata` must preserve an existing `/data` mount made by stage0. The health
hook checks read-only root, data mount flags, `rockctl status`, and the required
`/usr/libexec/rock-platform-health`. A missing platform health program fails
the health check. It confirms a trial only after
these pass. It does not require an unfinished native UI to be ready. The hook
does nothing in the existing single-root boot with no stage0 boot record.

After the final Buildroot rootfs is generated, build the matching initramfs:

```sh
python3 os/update/build-initramfs.py \
  --target "$BUILD_OUTPUT/target" \
  --rootfs "$BUILD_OUTPUT/images/rootfs.ext4" \
  --output artifacts/os/stage0.cpio.gz
```

The helper copies target ARM64 BusyBox, the exact target `/bin/sh` symlink chain
to Dash, Python, OpenSSL, their ELF dependencies,
and Python's standard library. It emits root-owned newc entries, including
`/dev/console`, without root privileges or host device-node creation. Its
immutable factory envelope authenticates the exact final rootfs as sequence 1.
The shell guard resolves leaf absolute links inside the target root and refuses a
missing, cyclic, non-ELF or stale BusyBox/Hush shell; it never substitutes the
host shell or fabricates `sh -> busybox`. Every copied dependency also rejects
parent-directory links that resolve outside the target tree before reading the
file; safe internal relative directory aliases remain supported.
This Dash integration passed the actual stage0 runs retained in
`evidence/20260908T104153Z/` and `evidence/20260908T105128Z/`.
Changing that rootfs requires rebuilding this initramfs before initial boot.
Kernel and initramfs remain identical throughout an update/recovery test run.

The Linux build host needs `e2fsck`. The initramfs builder, bundle CLI and QEMU
fixture builder run `e2fsck -f -n` before signing, accepting only exit code 0 and
never repairing an input image. The guest also refuses a signed image with an
unclean superblock, journal recovery flag, or pending orphan recovery. Stage0
mounts the selected root with `ro,noload`, since ext4 may replay its journal even
on a plain `ro` mount. See the [kernel ext4 mount documentation](https://docs.kernel.org/admin-guide/ext4.html)
and [superblock definitions](https://docs.kernel.org/filesystems/ext4/super.html).

## Transaction and recovery

The `.rock` format is `ROCKAB1\n`, a 4-byte big-endian header length, a bounded
JSON envelope, and the raw ext4 image. The Ed25519 signature authenticates a
canonical manifest containing schema, architecture, board layout, sequence,
version, persistent-data ABI, exact size, and SHA-256. There is no archive extraction or bundle
script execution.

Current signed schema is `rock-os-rootfs-v2`, with fixed `data_abi=rock-data-v1`.
Both pre-write verification and boot-state verification reject another ABI.
This intentionally rejects older schema-v1 development metadata; use freshly
provisioned test disks. An ABI is a signed publisher compatibility contract,
not an automatic proof about every database query. This version has no data
migration engine or userdata rollback. A future incompatible schema needs a
separately designed migration, compatible readers and a safe backup policy;
restoring old Wallet receipts blindly would be unsafe for future real payments.

`rock-update install /path/to/update.rock` verifies the signature, full input
length and full payload hash before opening an inactive device for writing.
It rejects symlink inputs, incompatible metadata, oversized headers/images,
non-root callers, mounted write targets, and sequences at or below the
confirmed version. Input identity is rechecked during copying. The complete
slot is read back and authenticated after `fsync`. Only then does an atomic
rename plus directory `fsync` arm the trial in `/data/rock-update/state.json`.
An interrupted write can damage the inactive slot, but leaves the committed
slot and selection state intact. Concurrent update/selection operations use
an exclusive file lock. A repeated identical pending installation is a no-op.

Stage0 durably decrements the pending slot's two-attempt budget **before**
executing that root. It verifies the signed metadata and actual block bytes
on each boot. A tampered trial is rejected immediately. An unconfirmed trial
that exhausts its attempts rolls back to the committed slot. The health init
hook reboots failed trials and confirms a healthy trial, advancing the
software sequence floor. Stage0 also starts a separate child in the selected
root before switching into init. This software watchdog reboots if no health
confirmation arrives within 120 seconds, including a service/init hang that
prevents the health hook from running. It is not a hardware watchdog and does
not guarantee recovery from a frozen kernel. Damaged committed state or an unauthenticatable
committed root fails closed into a logged recovery shutdown; it is not silently
reset to an unsigned root or an unrestricted shell.

If authenticated existing boot state cannot be saved because of ENOSPC, quota,
read-only storage, I/O error or permission denial, stage0 never starts the trial.
It verifies and selects only the already committed root, recording
`reason=state-write-failed` in runtime memory. The health hook can acknowledge
that old root's runtime readiness without advancing the floor or changing
pending state. Boot, status and this readiness path can lock an existing lock
file read-only; installation still requires a writable lock. Corrupt metadata,
invalid signatures, unknown ABI, missing bootstrap metadata or an unreadable
committed root do not justify this fallback. An unusable data filesystem can
still prevent application services from becoming healthy.

The fixed recovery action here is diagnostic logging followed by shutdown.
There is no independent recovery OS, repair shell, data restore or automatic
factory reset. Those remain separate work, including the all-slots-failed case.

The state file and software sequence floor are not protected against a
privileged attacker or physical rollback. Boot-time hashing does not prevent
later privileged raw-device writes. These are explicit limits of this
development boot chain.

## Verification

Local focused tests:

```sh
python3 -m unittest discover -s os/update -p 'test_*.py' -v
```

`verify-faults.py` adds thirteen real boots after the normal eight-boot suite.
It cuts the disposable guest after full payload sync but before trial arm,
after pending state commit, after durable attempt consumption in stage0, and
after a healthy confirmation's state commit. A fifth fresh-disk case fills the
actual 64 MiB userdata filesystem until ENOSPC, verifies committed-root fallback,
removes only that guest test's filler, then allows the pending trial to boot.
The corrected fixture uses actual block allocation in 1 MiB then filesystem-block
steps and synchronizes the file. ext4 can return ENOSPC while metadata-reserved
clusters remain in `f_bfree`, so the fixture does not demand a physically zero
free count. It requires zero user-available blocks and tests the real updater's
atomic state writer: only an actual ENOSPC error with unchanged persistent state
bytes establishes that the updater cannot save. The allocation and state-probe
errors, state hashes, logical/allocated bytes, block size, reserved clusters and
both free/available block counts are recorded. Filesystem reservation settings
are never changed. Only the explicit
`fault-full-recover` test boot contains an early S01 action: after the real selector
has already chosen authenticated committed A because state saving failed, it
reclaims the fixed owned test filler and records before/after block counts in
`/run`. Normal service startup and the required health confirmation then run
unchanged. This models reclaiming test data, not production autonomous deletion
or a claim that services work with no capacity.
These tests do not patch state or select a root on the host.

Fault hooks are Python-only injection points. Their kernel-command-line test
adapter is included only by `install-target.sh --include-tests` and
`build-initramfs.py --include-tests`; normal target installation removes this
package's test adapter/files. There is no production CLI or environment switch
for triggering faults. The explicit development flags in the test images must
never be represented as production recovery controls.

```sh
python3 os/update/verify-qemu.py --artifacts /path/to/fresh-artifacts
python3 os/update/verify-faults.py --artifacts /path/to/fresh-artifacts \
  --ab-evidence /path/to/fresh-artifacts/verify-ab-TIMESTAMP-ID
```

The second command requires a PASS report whose Image/rootfs/stage0 hashes
exactly match its inputs. The complete eight-plus-thirteen run on the Dash
1040 image is retained above; a future image must establish its own matching
reports before inheriting those claims.

After the root agent declares the migrated build VM ready and builds the
target with both update/test hooks, run inside that Linux VM:

```sh
python3 os/update/verify-qemu.py --artifacts artifacts/os
```

The harness prepares disposable image files once, then performs these actual
boots through the same guest selector:

1. A rejects bad signature and damaged payload without writing B; a valid B
   image is installed, then deliberately corrupted by the privileged guest test.
2. Stage0 rejects corrupted B and boots A; A installs a valid B image and checks
   an idempotent retry.
3. B boots its distinct signed release marker, passes health checks, and installs
   an intentionally unhealthy A image.
4. A fails health; the guest reboots after consuming the first durable attempt.
5. A deliberately hangs before the health hook; the independent 120-second
   watchdog reboots it after the second durable attempt is consumed.
6. Stage0 rolls back to B. The guest starts writing a later A image; the harness
   kills only that disposable QEMU process after the first write to simulate
   abrupt power loss.
7. B still boots and its confirmed sequence remains intact. It rejects a
   downgrade and successfully writes the later A image.
8. A boots its later release marker, passes health, and is confirmed.

Serial logs, image hashes, commands, missing/forbidden markers, deliberate
power-cut exit status and results are retained under
`artifacts/os/verify-ab-TIMESTAMP-*/report.json`. Image, original rootfs and
initramfs inputs are hashed before and after. The host never opens a real
device, edits boot metadata, changes the selected root in the kernel command
line, or changes its kernel/initramfs between these boots.

## Scope of the boot manager choice

The current board uses direct QEMU kernel boot, so a small initramfs provides
the needed root-selection point without introducing a second bootloader into
this first integration. U-Boot/RAUC integration is a separate board/platform
decision once the actual boot chain, storage layout, recovery path and trust
requirements are known; this prototype does not claim equivalent production
maturity or certification.

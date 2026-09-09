# Explicit local A/B development device

`rock-desktop-device/6` adds a local, offline A/B development profile. It is
separate from purchaser profiles 4/5: it has no service or authority binding,
never provisions a host endpoint, and retains all six local business databases.
Schema 5 still requires its existing signed purchaser profile and external
authority/runner restoration evidence. No existing device marker is migrated.

The exact configuration fields are `schema`, `name`, `images`, `sha256`,
`network`, `viewer`, and `boot`. `network` must be `none`, `viewer` must be
`browser`, and `sha256` must contain exactly `Image`, `rootfs.ext4`, and
`stage0.cpio.gz`. The exact boot fields are:

```json
{
  "mode": "signed-stage0",
  "profile": "local-development",
  "factory_sha256": "SHA256_OF_THE_EXACT_FACTORY_JSON_BYTES_INSIDE_STAGE0"
}
```

`stage0.verified_local_profile(config)` reads the immutable, canonical,
single-link image triple. It uses the existing bounded newc archive parser and
actual update signature verifier to check the factory envelope, sequence,
rootfs size and rootfs SHA-256. It also reuses the complete unconfigured-base
preflight: protected guest directories, exact embedded service/CA sources,
public software authenticator and absent purchaser, Wallet backend and MCP
configuration. Dropping `services` from a purchaser configuration cannot make
its rootfs a local image. The helper writes no profile, key, image or device.
Read-only image preflight is not a boot or hardware acceptance result.

The same existing stage0 boot command, A/B/data creation, native UI and normal
shutdown path are used. The factory copy starts in A, B starts empty, and the
data disk is 256 MiB. Restarts never overwrite saved slots or format saved data.
The `services` action returns `NOT_APPLICABLE` for this profile, including when
only a stopped device marker remains. The desktop GUI launcher has not gained
a new profile-creation UI; configuration is explicit through the host tools.

Backup creation requires the source stopped and holds its existing device lock
through clean-data, signed-slot/state, full A/B/data copies and hash checks.
The result is the existing `rock-desktop-backup/2`, whose embedded configuration
distinguishes local 6 from purchaser 5. Restore requires a new empty destination,
checks all three images before activation, preserves the source and starts
offline. The backup verifier inventories every local business table, including
additional tables; local profile 6 does not become a remote Wallet cache scope.

Data-only backup/1 is refused for both A/B profiles. A backup retaining any
A/B members or `disks`/`update` metadata cannot be relabelled as legacy format.
Metadata is bounded to 64 KiB and rejects duplicate JSON keys. Update summaries
use type-preserving JSON equality, so boolean `true` or floating-point `1.0`
cannot alias the signed integer sequence floor `1`. Valid old data-only and
purchaser A/B backups remain supported. These owned development manifests are
not cryptographically authenticated against arbitrary host-owner rewriting.

The separate business verifier supports `--boot-profile local-ab`; all three
image hashes are frozen before launch. `--preflight-only` verifies actual image
and signed-package admission without starting QEMU. `--prepare-backup` performs
real UI deletion/history review followed by reinstall, approval and another
business job, so the completed lifecycle also leaves a populated backup source.
Use the actual device name from its `plan.json` (`config.name`) or successful
`report.json` (`source_device`) with:

```sh
python3 os/desktop/verify-backup.py --source ACTUAL_BUSINESS_DEVICE --restored NEW_UNUSED_DEVICE
```

That restored-boot verifier is a separate execution gate. Linux host image
preflight fixtures, QEMU restore execution, external authority restore, and
hardware/provider/real-money acceptance must be reported independently.

```sh
python3 -m unittest discover -s tests -p 'test_desktop_local_ab.py' -v
python3 -m unittest discover -s tests -p 'test_desktop_stage0.py' -v
python3 -m unittest discover -s tests -p 'test_os_desktop_backup*.py' -v
```

The first suite includes two real small-ext4 image-preflight tests. They are
`NOT_RUN`/skipped on a host without Linux image tools, never counted as a passed
image preflight. They use a public development signature and do not boot QEMU.

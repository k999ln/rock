# Actual Hub launcher failure and recovery verifier

This host-only entrypoint adds three fixed files to a new disposable rootfs
copy. It does not install anything into the normal image or change the Hub,
dispatcher, sandbox launcher, recipe, runtime limits, service identities or
socket authentication. It must be scheduled in the root coordinator's QEMU slot.

```sh
PATH=/usr/sbin:/usr/bin:/sbin:/bin python3 -B os/verify-hub-faults.py \
  --images /absolute/frozen/images \
  --output /absolute/private-evidence
```

The evidence parent must already exist, be owned by the invoking user and have
mode 0700. Both paths must use the documented safe ASCII pathname characters.
The Linux host needs QEMU ARM64 10.x, Python 3, OpenSSL, bubblewrap, debugfs, e2fsck and
mkfs.ext4, working unprivileged user namespaces, and at least 4 GiB free space.
There is no timeout/command/threshold override. `--preflight-only` performs the
read-only source checks and creates/verifies the derived fixture, but reports
`PREFLIGHT_ONLY` and QEMU `NOT_RUN`; it never creates userdata or boots a VM.

The frozen plan allows three headless legacy-root boots, each limited to 240
seconds, with 1 GiB RAM, two virtual CPUs and no hardware network adapter. It
uses the original kernel, its own read-only derived rootfs and a new 128 MiB
userdata file. Stage0 is included in the before/after source triple hashes but
is **not booted** by this entrypoint. This is neither GUI nor A/B evidence.

Before launch, read-only debugfs exports inventory every existing regular file,
directory mode and symlink target below `/usr`, `/lib`, `/bin`, `/sbin` and
`/etc`. A short-lived user namespace permits preservation of root-owned export
metadata without changing host file ownership or requiring host sudo. All
existing runtime entries must match after injection; only these additions are
allowed:

- `/usr/libexec/rock-hub-fault-fixture.py`
- `/usr/libexec/rock-hub-fault-runtime.json`
- `/etc/init.d/S98rock-hub-fault-verify`

The comparison covers content, file/directory modes and symlink targets; it
does not attest source UID/GID. Unmapped ownership that prevents a faithful
export is an explicit failure. Frozen 0444 input images stay unchanged; only
the newly created derived copy is made owner-writable before adding the hooks.

The actual Hub/service/recipe/package/init source files must also match the
verifier checkout. The guest rechecks these installed bytes and the launcher
binary. Original artifact inode/content identities are checked again even on
failure. The derived image has its own distinct recorded hash. No claim is made
that an injected rootfs has the original rootfs hash.

The first two boots authenticate through the existing owner UID 1000 Unix
socket API, install and approve the existing signed text-tidy 1.0.0 Tool, and
submit exactly one faulted job per case. A root test tracer observes actual
fork/exec events of the validated non-dumpable UID 1002 platform daemon. It
accepts only a new child whose PID/start time, parent, UID/GID, executable and
entire argv identify `/usr/libexec/rock-sandbox-exec recipe`. It does not read or
write process memory/registers and has no configurable target or signal.

The crash case sends SIGKILL through a revalidated pidfd. The deadline case
hands off a genuine SIGSTOP delivery-stop and detaches every traced platform
thread so the original Hub's `communicate(timeout=3)` can expire and kill its
own child. The signal is applied at the launcher's exec boundary **before the
sandbox workload starts**. This establishes Hub handling of a launcher failure;
it does not duplicate the independent in-sandbox CPU/RAM/file-limit probes.
Capture failure or inability to detach is a failure; no replacement job is
silently submitted to obtain a passing observation.

Each case requires its exact expected failed job, byte-identical replay of the
original durable acceptance receipt, rejection of a conflicting same-key
payload, and a new explicit key that actually runs the unchanged worker to its
expected successful output. The original acceptance may still say `running`:
it is an idempotency receipt, and `job.result` must independently report the
actual failed final state. The platform identity must remain unchanged during
each worker-only fault. A third boot requires every prior job, receipt and
audit row to remain unchanged. It exercises persistence across OS restart;
platform-service crash recovery of an in-flight job remains `NOT_RUN`.

Both Wallet databases are read with SQLite `mode=ro` and `query_only`, including
all tables and schema. Their baseline must remain unchanged through faults,
retries and reboots. After each actual API-requested normal poweroff, the host
requires clean ext4, absence of pending SQLite journals, and independently
extracts the Hub and Wallet databases. Closed rows must match the guest proof.
No Wallet mutation, network fallback or arbitrary RPC is available to the hook.
Both failed and successful retry jobs must match the exact original signed
package, input hash, native receipt identity and ordered `run_approved` audit
record, including the actual namespace host, no cloud transfer and zero charge.

Success is `PASS_SCOPED`, only after all three real boots. Any failure is `FAIL`;
the host may kill only its own newly spawned QEMU to enforce its finite bound,
which is never counted as a successful shutdown. Whole D3, GUI, hardware,
stage0/A-B, platform-service crash interruption and real funds are not attested.

Host negative guards are run without a VM:

```sh
python3 -B -m unittest discover -s tests -p test_os_hub_fault_evidence.py -v
```

The standalone Linux process fixture additionally validated five crashes and
five stopped-child three-second deadlines under a non-dumpable UID1002 parent.
It discovered and fixed the requirement to consume a killed tracee's exit
status before its real parent can reap it. A separate new 16 MiB ext4 fixture
validated root-owned export, exact new-hook injection and unchanged runtime
manifest comparison, including an unchanged 0444 source and a separate writable
derived copy. These are observer-mechanism tests, not Rock OS acceptance;
the three-boot built-image matrix must still run separately.

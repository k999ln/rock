# Actual OS workflow experiment

This extends the earlier host experiment into one real ARM64 Rock star os
guest using its UID1000 API client and Linux namespace/seccomp sandbox.
The public canonical preregistration is
`os/benchmark/prepared/20260908-v1/preregistration.md`, recorded at
2026-09-08 09:22:48 UTC before measurements. The actual run completed at
2026-09-08 10:12:31 UTC using the frozen Linux 6.18.50 `rock-os-wallet-0952`
image. Evidence is retained in `evidence/20260908T101124Z/`.

All 30 measured pairs and 3 warmup pairs completed: 132 real sandbox jobs,
full outputs, independent database/audit verification, package/runtime/image
hashes and unchanged simulator Wallet passed. The median was 998.351 ms for
three Tools and 348.527 ms for one Workflow, a 65.090% median reduction within
this QEMU comparison. No outliers, retries, extra trials or early stopping were
used. All 66 raw samples and original logs are retained. These figures include
the full API/IPC/persistence/sandbox/result path, not transformation CPU time.

The fixed workload is 1,200 lines / 11,011 bytes. Three warmup pairs precede
30 measured pairs, alternating AB/BA. A runs three separately signed Tools;
B runs one signed Workflow. All 132 actual jobs, full outputs, all samples,
unchanged runtime hashes and unchanged simulator Wallet must match the
independent observations. Completion and a faster Workflow are separate
outcomes; a slower Workflow does not invalidate a completed experiment.

Root integration copies `common.py`, `guest.py`, and the exact public
preregistration bytes to `/usr/lib/rock-benchmark/preregistration.md`.
The installer and preparation command require no private design document.
An init hook runs
`python3 -I -B /usr/lib/rock-benchmark/guest.py` only for the exact kernel flag
`rock.benchmark.verify=1`. The root helper persists read-only database evidence
under its fresh `/data/benchmark/` directory; it forks a persistent UID/GID1000
client for all API operations. It uses the normal existing services and SDK
packages. It never changes Hub, worker, sandbox, Wallet or UI implementation.

Prepare fixtures without executing the experiment:

```sh
python3 os/benchmark/verify.py prepare --output os/benchmark/prepared/NEW-ID
```

Run only after the parent declares the new image ready and no other build or
guest is running in the Linux build VM:

```sh
python3 os/benchmark/verify.py verify \
  --prepared os/benchmark/prepared/NEW-ID \
  --artifacts /path/to/frozen-new-images
```

The harness owns one loopback TLS registry child on port 9443 and one QEMU
child. It stops only these children and never reuses another server. The source
Image/rootfs remain read-only; userdata is a new disposable file. A fresh evidence
directory retains the preparation, publish receipts, command, whole boot log,
all samples, durable/serial proof comparison and image hashes. Failed runs are
retained. Preparing a new directory is required if guest measurement code changes.
The `20260908-v1` preparation metadata, source hashes, packages and protocol are
historical fixed inputs: never rewrite them for a new build. The public protocol
path correction changes `guest.py`, so the current checkout requires a new
preparation ID even though the protocol bytes remain exactly the same.

Five focused tests cover fixed workload/order, nearest-rank statistics, complete
and slower synthetic outcomes, missing/duplicate/changed evidence, wrong peer
identity and partial responses. Synthetic test durations are not OS measurements.
No host/other-OS speed claim, human time saving, physical BlackBerry performance,
battery benefit, production signing identity or real Wallet funds are evaluated.

`tests/test_os_platform_install.py` additionally runs the real platform installer
against a disposable copy of the public Buildroot overlay, imports the installed
guest to resolve its protocol file, and prepares fresh fixtures. It catches
missing source inputs without building or booting an OS and checks that the
historical preparation bytes remain unchanged.

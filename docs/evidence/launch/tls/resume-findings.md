# LCH01 resumed investigation

Historical TLS cause remains **undetermined**. No runtime, production deadline,
root checkout, or GitHub workflow was changed by this investigation.

The new concrete result is a fixture isolation defect at
`systems/rock-star-os/tests/test_contract_runtime_lifetime.py:221`.
`patch('wallet_backend.contract_runtime.time.monotonic', ...)` changes the
shared Python `time` module. Releasing an unrelated real thread to read its
clock while that patch is active consumes the first finite fixture value.
The unchanged expiry test then fails because admission verification is never
reached. Replacing only the target module's `time` reference with a wrapping
proxy fixes the interference. No sleep, deadline change, retry, or production
code change is needed.

The regression fails before the correction. With the correction, the regression
and all twelve existing fixture tests pass: **13 tests, zero skipped**.
`clock-fixture-isolation.patch` passes `git apply --check` and changes only the
fixture and its new regression test. The original fixture is retained from
commit `e430648c8ba799d004a5ecd0da8166ca811d3ae5` for reproduction.

This is **not attribution of the earlier TLS failure**. The original e430 log
shows the clock test passing at ordinal 39 and the Game TLS error at ordinal
157: 117 intervening cases. The clock patch was no longer active.

A cleanup census across 70 related runtime, settlement, Game TLS, race, and
restore cases passed in 33.175 seconds with zero skipped tests. No background
thread survived any test cleanup, and the observed shared functions were
restored at every boundary. The exact historical 158-case prefix also showed
no persistent threads, but two existing ext4 cases skipped on macOS; that
prefix is explicitly **incomplete host-scope evidence**, not canonical PASS.

The original e430 GitHub artifact was downloaded again and its GitHub SHA256
verified. It contains fifteen files and **no stack, timing, or profiler
sidecars**. Its client read-timeout stack cannot distinguish header parsing,
admission/SQLite waiting, signature work, response sending, or CPU scheduling.
Required missing evidence is a simultaneous server worker stage/stack and
elapsed/CPU/wait-state measurements at the original one-second failure. The
already integrated failure diagnostics can collect this on recurrence but
cannot reconstruct old state from empty successful-run sidecars.

Reproduce from this directory:

```sh
python3 -B -W error::ResourceWarning check_fixture_patch.py original
python3 -B -W error::ResourceWarning check_fixture_patch.py fixed
```

The first command is expected to fail. Detailed outcomes, immutable source and
artifact hashes, host limitations, and excluded initial research-harness errors
are recorded in `resume-evidence.json`.

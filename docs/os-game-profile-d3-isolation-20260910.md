# Same-image Game profile isolation acceptance

RQ06/09/10/12/13/16/17; principle: 明確な楽観主義; inconvenience: the old integrated guest suite assumes a local Wallet authority; reuse: unchanged peer/DAC/namespace/seccomp/resource/Tool assertions; smallest change: explicit partial observer scope; measure: actual Game image with no NIC and normal stopped-data proof; acceptance: `PASS_SCOPED` only after serial and stopped ext4 proof match and e2fsck succeeds.

`python3 os/verify-platform.py --artifacts "$GAME_IMAGES" --scope game-isolation`
uses the complete verified Game profile image without changing it. It selects
the guest observer with `rock.platform.verify_scope=game-isolation`, while the
default `local-full` path preserves the original full local Wallet assertions.

The Game scope verifies actual ARM64/runtime inventory, Platform health,
signed catalog, UID authorization even with permissive socket DAC, namespaces,
seccomp, real memory/CPU/file-size/crash denial, and Platform inability to read
the existing private remote Wallet cache. It executes install/approval/retry,
conflicting retry rejection, the 64 KiB boundary, silent-cloud rejection,
signed Tool version change/rollback/uninstall and retained receipts, then the
three independent SDK Tools. Wallet is explicitly unknown without a NIC and
no local financial authority database may appear.

The guest emits `ROCK_PLATFORM_ISOLATION_GUEST_PASS`, status `PASS_SCOPED`,
and an explicit financial `NOT_RUN`. The host rejects a legacy/full-PASS
marker, duplicate proof, invented financial PASS or mismatch between serial
and the stopped disk. This is partial D3 evidence, not a replacement for the
complete local suite or same-image online financial acceptance.

The original local financial assertions still require explicit mapping to
the same Game image and authoritative external state:

- Unregistered state and no extra personal fields; new activity denied before registration.
- Registration exact retry, inherited identity, credential requirement, real authenticator enrollment, Wallet terms separate from recurring consent.
- Pending sale excluded from available money, settlement, no automatic recurring consent.
- Monthly USD 8.88 durable acceptance versus actual payment, once per period, exact retry, cancellation and subsequent rejection; balanced ledger.
- ATM quote without reservation, exact authenticated hold, identical assertion retry, cancel/release without dispense; balanced ledger.
- Tool completion cannot silently earn money: covered only by an authoritative stopped before/after comparison, not an offline display value.

The separate existing two-boot ATM verifier additionally requires durable
credential identity, machine/actor authorization, consumption/replay rules,
dispense/release totals and restart recovery; no PASS for those is inferred
from this scope. Physical USB/ATM and real funds remain outside this fixture.

Four host contract tests check the scope/marker and stopped-data boundaries.
Actual Game guest execution remains `NOT_RUN` until the report is collected
from the final image with this observer embedded.

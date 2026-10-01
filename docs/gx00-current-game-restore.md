# GX00 current-copy game handover (host runtime only)

This is an explicit internal management operation for the existing stopped,
current contract copy supported by C. It retains the original independent game
index. It adds no HTTP restore route, backup import, SDK, ordinary automatic
retag, OS proxy replay, OS game UI, or frozen b8287bc image change. Arbitrary
historical Wallet/index/C/B copies and another-host recovery remain unsupported.

All owners, schedulers, listeners and game operations sharing this index must
stop for maintenance. The initial C proof requires no outstanding runtime/open
permits. An index PREPARED row temporarily prevents normal binding for every
contract using that index, including other owners and games. This is deliberate
maintenance downtime; it is not an owner-to-owner transaction effect.
These entry points are a manual maintenance fixture, not a generally offered
operator API. If an author is revoked after PREPARED, that revocation is
retained and the fixed original-row snapshot no longer matches. The same
restore ID cannot automatically recover this change: PREPARED and the global
maintenance stop remain, requiring explicit management investigation. No
rollback, plan rebase or reversal of the revocation is provided. The successful
current-copy tests do not claim recovery from arbitrary concurrent changes.

## Management sequence

Use the existing C `stage_restore` and `promote_restore` with an explicit restore
UUID and a new canonical destination. Then reopen the same original index
path/UUID, with the same fixture authorities and protected owner registry.

```python
from game_exchange.current_restore import (
    prepare_current_game_restore, resume_current_game_restore,
)
from wallet_backend.contract_runtime import ContractRuntime

plan = prepare_current_game_restore(gateway.index, coordinator, restore_id)
managed = ContractRuntime.open_current_game_restore(
    restore_id, index=gateway.index, coordinator=coordinator,
    provisioning_file=existing_provisioning_file, verifier=owner_router,
)
try:
    receipt = resume_current_game_restore(
        managed, gateway.index, coordinator, restore_id,
    )
finally:
    managed.close()
```

The management lifetime cannot serve Wallet/game requests, start a scheduler,
or be attached to a listener. After its successful close, open the current
contracts normally and pass the exact current gateway to the ordinary managed
server. Normal opening checks local epoch continuity and the protected index's
DONE evidence before constructors. An existing game contract then remains
unavailable until the real index lifetime and all bindings are checked again.
Even an already bound game runtime cannot be served with the gateway omitted.

A boolean option or caller-created proof cannot disable these guards. The
management opening obtains a real C permit and checks the current C record and
protected index plan inside `opening.initialize`, before Wallet/Store/Auth
constructors. The C lease and actual source/destination locks cover this check
and initialization. Each resume must match the same retained index object,
coordinator, restore UUID and plan digest; it reacquires C's real admission and
current-generation proof.

## Durable evidence and retry

1. Under C's initial `verified_completed_current_restore` lease, verify the
   exact old/new descriptors, account, copy hashes and inodes, original game
   mode and prior epoch chain. Record a typed digest of every original table
   and schema object in both contract databases and the independent index.
   Preserve revoked authors, proof nonces, requests, RESERVED-only rows,
   pending intents, current heads and other contracts. Commit the immutable
   plan and PREPARED row in `game_restore_transitions` before releasing C's
   lease.
2. Under the new epoch's actual C admission, current-generation proof and the
   index's shared author gate, recheck the protected plan and retained data.
   Append one immutable `wallet_game_epoch_transitions` row in the same Wallet
   database. The original `wallet_game_mode`, signed consent and receipt bytes,
   credential counters and original financial rows remain unchanged.
3. Recheck the exact intermediate state, compare-and-swap just this contract's
   index descriptor from old to new, and commit the immutable DONE receipt in
   the same index transaction. The descriptor cannot advance separately from
   this receipt through the supported operation.

A lost completion after PREPARED, after the Wallet append, or after index DONE
is recovered only through the same explicit management opening and restore ID.
The Wallet append is the durable intermediate fact; no invented placeholder
receipt is treated as successful. A different ID, changed plan, stale epoch or
incompatible intermediate state is refused. A DONE retry returns the same
stored receipt only after rechecking every original row and schema in both
management opening and resume. This retry is supported before normal activity
resumes. Later legitimate Wallet, scheduler or index changes also cause this
management replay to fail closed; this is not a historical receipt lookup API.

The first proof requires every copied file to match the recorded source bytes.
After the append, a whole-database hash cannot remain equal. The resume audit
therefore retains every original row/schema digest and projects away only the
exact current migration row/schema and the exact descriptor CAS. Existing
migration rows, all other contracts, sequence data, BLOB values and author
revocations remain covered. Intrinsic row IDs are included for rowid tables;
tables shadowing all three SQLite rowid aliases are rejected before PREPARED.
WITHOUT ROWID tables are compared by their full typed rows. Unknown extra
migration rows are refused. A
nonempty, safely owned destination WAL is read as current committed state;
the retired source remains closed and byte-identical.

The original C and owner credential registry are never copied or replaced.
Current source/destination identity and the protected C record are rechecked
on every management action. Constructing or keeping C's frozen proof dataclass
is not authorization. A restored Wallet with an old index, and an old Wallet
with the current index, are both refused; no automatic rollback reconciliation
is provided.

## Validation scope

`tests/test_game_current_restore.py` uses the same nonempty legacy foundation
as `tests/game_legacy_basis.py`: real legacy enrollment/authorization, an 888
monthly debit with CLAIMED acknowledgement, a 1000 hold, 237 pending proceeds,
a revoked credential/counter, retained API receipts and an unknown BLOB table.
It uses actual A/B/C runtimes and loopback TLS for three devices, two owners,
and the four author/game/owner connections. No fake coordinator or permit is
used. Normal post-handover operations and scheduler acknowledgement are checked
as authorized new activity, separately from the pre-operation equality.

Tests cover three actual durable commit cuts and process-object restart,
including a live reader retaining the Wallet's nonempty WAL; two consecutive
current copies through epoch 3; original author revocation and RESERVED-only
intent retention; mixed old/current copies; refusal of Wallet-only listeners;
strict intermediate snapshot projections; and DONE retry refusal after an
unknown BLOB change, author revocation or legitimate resumed activity. The old source databases remain
byte-identical. These are host runtime results, not native OS or production
financial acceptance.

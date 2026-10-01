# Managed host Wallet identity and same-host recovery

This profile is a host backend implementation with synthetic Wallet funds. It
does not change the frozen `b8287bc` OS images or authorize an OS local ledger
migration. The ordinary legacy server/profile remains separate from managed
`ContractRuntime` and `/v3/wallet`.

## Ownership and opening

`AuthorityFenceCoordinator(registry_dir)` owns one protected mode-0700 directory
and its exclusive process lock for its lifetime. Every contract directory and
the independent owner credential registry must be canonical, private and
separate. The supported managed runtime presents
`verifier.registry_identity()` to `bind_owner_registry(path, uuid)` before
every open. A different credential registry path or UUID is rejected. The
credential registry is not copied by Wallet recovery.

`prepare_fresh(FreshContractSpec)` is for an empty new directory only. It fsyncs
a `managed-wallet-authority/2` PREPARED marker before creating either database.
The opening permit holds the original `authority.lock`; `initialize()` supplies
the only constructor/DDL admission. After that context exits, `activate()`
checks the actual owner, account, authentication authority, stable database
identity and registered file identities before admitting work.

`open_active(ledger_ref)` uses the coordinator's current path and epoch. It
does not accept a caller-supplied copied directory. `wallet_storage_identity`
and `wallet_bindings_v2` retain one ledger UUID, account and migration ID. The
original `wallet_bindings` inode receipt is retained as history; managed
WalletBridge verifies the stable identity and retained receipt. Registration
can bind account_id once from NULL. If the Wallet identity commits before the
Entitlement binding, the same account and original registration receipt must
complete that binding before another managed mutation; this is not a two-DB
atomic transaction.

Every outer `admit_write(expected_epoch)` holds the contract gate through the
whole actual operation and its nested DB commits. The ticket is local to the
same thread and permit. Another thread serializes behind it; another contract
cannot nest. Wallet/Store constructors and transactions reject managed access
without the matching held ticket. Auth, ATM and WalletBridge use these same
existing transaction paths. No new monetary or authentication algorithm is
introduced.

`quiesce()` stops new admissions while an already admitted operation can
finish its nested work. `release()` requires quiescence and zero unfinished
admissions. The runtime must also verify that its actual HTTP workers and
scheduler ended. A response timeout does not release ownership. The shared
coordinator closes only after every opening/writer permit has ended.

## Stopped legacy backend adoption

The caller first invokes
`inspect_legacy(coordinator, spec, migration_id=uuid)` to obtain an immutable
`LegacyAdoptionPlan`, then passes that plan to `ContractRuntime.open_adopted`.
The first supported input is an existing stopped Alice host backend, keeping
its original owner, primary device, registered account and authority UUID.
There is no owner relabeling or OS-local-to-backend import.

Inspection holds the actual legacy authority lock. It verifies both original
inodes, the original WalletBridge inode binding, DB integrity and foreign keys,
the real Auth/ATM account identities, and every original table and schema
object, including unknown additional business tables. It fixes input hashes,
all table row hashes, original authority metadata and any legacy transport
credential marker. Non-checkpointed WAL/journal data is refused. Immutable
read-only SQLite inspection does not recover or mutate the source databases.

`prepare_legacy(plan)` fsyncs the new PREPARED marker before the first DB DDL,
then records `WALLET_IDENTITY_COMMITTED`, `ENTITLEMENT_BINDING_COMMITTED`,
`ROUTER_REGISTERED` and `ACTIVE`. The new marker carries the same migration ID
and inspected inputs even if interruption precedes creation of the journal or
coordinator row. Retry requires that same plan, original inodes and all original
rows/schema. Completed identity tables must match exactly. An ACTIVE
re-adoption is rejected before changing any marker or database; ordinary
restart uses `open_active`.

These stages add identity only. Existing 888 bills, CLAIMED authorizations,
hold amounts, unresolved quotes, credentials, counters, revocations, request
receipts and extra tables are never deleted or replayed by adoption. The
ordinary runtime may subsequently reconcile an existing CLAIMED operation
under its existing rules and same idempotency key.

## Current same-host recovery copy

The first recovery API is deliberately narrower than historical backup import:

1. Close the real source runtime and all its workers, retaining the current
   independent coordinator and owner credential registry.
2. Call `coordinator.stage_restore(ledger_ref, destination, restore_id=uuid)`.
   Under the source and destination locks, it hashes the current closed two DBs
   and copies them to new, unaliased files. A RESTORE_PENDING marker is durable
   before any copy. Interrupted copies resume only with the same ID and exact
   original hashes. Unknown source/destination files need explicit coverage
   and are rejected. Source locks are not copied. The legacy credential marker,
   when present, is retained as audit data, not as the live owner registry.
3. `promote_restore(restore_id)` rechecks that no old runtime owns the contract,
   the source has not advanced or changed files, and the copy has exact matching
   bytes and stable identities. It durably closes ordinary opens with HANDOVER,
   marks the original RETIRED, then promotes the copy at `writer_epoch + 1`.
   It changes source authority metadata only; the original DB bytes stay intact.
4. Open the returned current descriptor through `open_active`. The original
   path, released writer ticket and older epoch cannot obtain new admissions.
   A same-ID retry after an interrupted promotion completes the same generation
   and final restore receipt. It never creates another epoch for that retry.

This API does **not** ingest an arbitrary historical backup, recover a missing
source disk, permit rolling back newer committed transactions, import a copied
legacy inode binding, move to another host, or restore a credential/coordinator
registry. A staged copy becomes ineligible if the source subsequently advances.
The prior source and coordinator records retain its lineage; a completed Wallet
copy is not a backup of those independent authorities.

## Compatibility and limits

The actual frozen `b8287bc` legacy **server** rejects the new PREPARED/ACTIVE
marker before invoking Wallet/Store constructors. Its old direct Wallet/Store
libraries do not understand the new marker and can still open and write copied
managed files. The new library's unmanaged mode rejects them, but that is not
retroactive protection for old binaries. Therefore this is a protected host
backend profile, not safe rollback of a new local ledger to the frozen OS slot.
OS local adoption requires a separately signed data ABI/old-slot refusal policy
and actual D4/D5 verification. QEMU and hardware acceptance are separate gates.

This is not protection against a host administrator using direct SQLite, editing
protected files, replacing trusted Python hooks or copying the whole authority
onto another host. Same-path/same-UUID rollback of the independent credential
registry is **NOT_IMPLEMENTED**; no registry restore/export API is provided.
Historical distributed fencing requires a separate external authority design.

## Validation scope

`tests/test_authority_fence.py` exercises real private files, process locks,
cross-thread serialization, interrupted registration binding, current epochs
and replaced database rejection. `test_adopt_legacy.py` creates a disposable
real backend with 5000 synthetic credit, one committed 888 bill whose reply was
lost leaving CLAIMED, a 1000 hold, an unresolved quote, a revoked credential
and an extra BLOB business table. It compares every original table across the
adoption interruption boundaries. `test_managed_restore.py` reuses that actual
fixture for pending copy, in-flight/unfinished writer refusal, source advancement,
retirement interruption, final-receipt recovery and an unaliased promoted copy.
No empty ledger is substituted for this retention evidence.

These are host tests; the A/B managed TLS suite separately covers authenticated
two-owner/three-device routing. Neither is an actual OS boot or real-funds test.

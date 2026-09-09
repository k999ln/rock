# Completed current-copy evidence

These internal coordinator APIs join an explicit management operation to an
already completed `stage_restore` / `promote_restore`. They do not import a
backup, restore the external game or owner registry, or change a game epoch.

```python
with coordinator.verified_completed_current_restore(restore_id) as proof:
    # Commit the protected external PREPARED plan here, before leaving the
    # coordinator mutex and both source/destination authority file locks.
    index.prepare(proof)
```

The initial context requires no runtime/opening permits and no unfinished
restore. It rereads the owned C registry, exact DONE receipt, current ACTIVE
destination, exact RETIRED source, stable owner/account/authority/ledger and
next epoch. Every declared copy member must match its original bytes; both DB
inodes must match the C record, source and destination must not alias, and
unexpected files or nonempty WAL/journals are refused. No lock is created by
inspection. The same conditions are rechecked before successful context exit.

`CompletedCurrentRestoreProof` is a frozen inspection result, not authority.
It contains `restore_id`, `coordinator_id`, the canonical protected
`record_sha256`, `old_descriptor`, `new_descriptor`, `account_id`, and a sorted
tuple of `CurrentCopyFile(name, sha256, source_identity, destination_identity)`.
Constructing a matching object cannot acquire admission.

```python
with runtime.admit_write(epoch):
    with coordinator.current_restore_generation(
        restore_id, record_sha256=protected_plan.c_record_sha256
    ) as current:
        # Rejoin the protected index plan and verify its permitted Wallet
        # table delta, then commit the explicit transition inside this scope.
        resume_joined_transition(current)
```

The resume context obtains the real permit from the current thread. That exact
object must remain registered in this coordinator, unreleased, and currently
admitted for the DONE destination. An `open_active` permit is also allowed
inside its real `initialize()` scope while its marker is ACTIVE, so management
bootstrap can reject a wrong plan before constructing Wallet components. A
fresh PREPARED marker, idle opening, foreign thread, forged permit, and stale
record digest are rejected.

Resume retains the C mutex and original source file lock throughout the caller's
mutation; the actual permit already owns the destination lock. Its record,
current identity/inodes and exact original source bytes are rechecked on exit.
Destination DB bytes may include a committed transition append: **this API does
not validate that append or claim the destination still matches whole-copy
hashes**. The protected index/Wallet transition layer must verify its own exact
allowed delta and retain the initial copy proof. Non-DB copied members still
must match their original bytes.

Current ACTIVE identity reads consult SQLite's actual committed WAL using a
read-only snapshot. Main DB and present WAL/SHM/journal files must be owned,
private, regular, single-link files. Closed adoption/source/initial-copy checks
retain immutable reads and the checkpointed-data requirement. The API never
repairs or checkpoints the retired source.

The ordinary-open guard and management-only runtime lifetime must prevent a
normal Wallet request or scheduler from using the new copy before the external
handover finishes. These two contexts alone do not implement that higher-level
guard, an index journal, epoch transitions, or game recovery. External mutable
authority restore, arbitrary past copies, another host/coordinator, and direct
administrator SQL protection remain outside this profile.

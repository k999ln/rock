# Game current-copy recovery and real process interruption

This management path applies only to the exact stopped current public sandbox on the same host. Retained C, owner registry, connection index and both independent Game journals are required. Exported files preserve the full evidence but are not an arbitrary historical or cross-host restore interface. No authority can run during the handover.

## CLI contract

- `sandbox.py snapshot-current --config FILE --backup DIR --intent UUID` creates an owned mode0700 directory outside the authority state and outside its ancestors. It retains `plan.json`, then copies every observed Wallet/Entitlement/Game/index DB and retained JSON into `files/<relative-path>`, and commits `manifest.json` only after complete byte verification. Interrupted owned partial copies resume only under the same plan and unchanged current source. The response is `rock-game-sandbox-backup-receipt/1` with `backup_id`, `manifest_sha256`, `authority_id`, `config_sha256`, `simulation_only:true`. It is an observation/archive, so normal service may resume afterward; any subsequent authority change prevents use as a current-copy restore.
- `sandbox.py restore-current --config FILE --backup DIR --intent UUID --new-device NAME` validates the full archive and exact current source, persists PREPARED, then uses existing C stage/promote to retire the source and activate a distinct Wallet path at epoch+1. The original connection index completes its existing two-commit handover. Each independent Game atomically compares its old issuer epoch, appends a permanent receipt, and advances exactly one epoch under actual C/current-copy proof. Its original typed rows/schema/unknown tables remain identical except that exact epoch cell and receipt row. Its pre-handover digest must equal the stopped archive.
- The response is `rock-game-sandbox-current-restore-receipt/1`, `status:DONE`, the exact intent/backup/name/config binding, current descriptor, original connection receipt, two Game epoch receipts and `post_snapshot_sha256`. `source_retired` and `same_host_current_copy_only` are true. Same intent/backup hash/name recovers only this completion after verifying the entire post snapshot, including the retired original Wallet DBs. A changed target, missing authority, unknown unfenced DB, changed archived bytes or unrelated existing target is rejected.

Normal sandbox start and Runtime construction reject an unfinished local restore journal. An installer can also retain `/var/tmp/rockstaros-preview-authority/desktop-restore.json`, schema `rock-game-desktop-restore/1`: `intent`, `state:PENDING|DONE`, `source_device`, `new_device`, `os_backup_sha256`, `authority_manifest_sha256`, `retired_devices`. It must be a protected mode0600 file. B first commits PENDING, completes the external current-copy, restores the three OS disks and verifies both receipts/hashes, then commits DONE. Both sandbox and schema7 guest starts refuse pending or malformed records. Guest start also refuses every retired source name; the list is cumulative, unique and bounded64. The control record is excluded from business snapshots.

Old apply commands are never re-signed for a new epoch. The restored worker uses a current-epoch signed status or conditional rejection around the exact original apply bytes. An existing APPLIED receipt completes the old held purchase once; an unapplied request obtains a permanent REJECTED tombstone before releasing its hold. An expired quote, NOT_FOUND, timeout or lost response alone never releases funds. Delayed old-epoch apply is rejected even if the old command signature is valid.

## Actual failure evidence

The Linux subprocess suite sends SIGKILL to the process at observed actual SQLite boundaries, then constructs new C/router/runtime/TLS/SDK instances. It covers migration before/after commit; approval before/after commit; durable claim before network; Game asset commit before response; Wallet settlement before/after commit; Wallet epoch commit; first Game epoch commit; and final restore receipt commit. The approval counter, hold and outbox roll back or commit together. Original nonempty postings, pending settlement and opaque BLOB rows remain unchanged, and SDK retry uses original bytes/keys. All recovery purchases grant10units once and consume principal100+fee3 once. These are synthetic fixtures and measured software failure cases, not real money or power-loss certification.

The earlier same-process exceptions remain useful regression coverage. They are not relabeled as SIGKILL evidence. OS disk/image, stage0, D4/D5 and installer aggregate evidence are separate acceptance records on the exact final image.

## First dispatch and revocation

The first UNSENT claim holds C, the author gate and the existing Wallet
transaction while checking the original signed quote/approval, current
connection/generation/lifetime, current owner assertion credential and terms,
current OwnerRouter device revision, and current Game author registration.
If a valid retained approval has become inactive before this claim, the worker
sends the current-epoch conditional rejection around the original apply bytes.
It releases the hold only after a verified permanent REJECTED receipt.
After a durable DISPATCH_POSSIBLE claim, an in-flight original apply can still
complete; later revocation cannot rewrite that financial outcome. Fresh status
or conditional rejection resolves it once. Both paths leave C/Wallet/author locks
before TLS. A backward clock refuses the new claim and retains its whole hold.

A barrier test starts ATM3000, monthly888 and Game A/B principal2000 approvals
against AVAILABLE5000 plus an untouched pending200. All actual accepted holds,
fees and remaining AVAILABLE total exactly5000; pending stays200, AVAILABLE
stays nonnegative, month888 occurs once even on A2, and the other owner's entire
Wallet typed snapshot remains unchanged. Authentication counter order can reject
a concurrent stale assertion; such rejection does not create an extra hold.

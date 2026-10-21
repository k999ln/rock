# Canonical avoado.si D1 migration lineage

`vite.config.ts` selects this directory only for the canonical main Sites project. Columbia keeps the separate `drizzle/` lineage because the two Sites projects have separate D1 databases.

- The live database has already recorded its historical `0000`-`0019` migrations; those files intentionally remain in its migration ledger instead of being replayed from this directory.
- `0020_main_legacy_columns.sql` adds only columns confirmed missing from the live main D1, with defaults for every new non-null value.
- `0021_sites_schema_convergence.sql` is the idempotent full-schema snapshot, `0022` restores the recurring send guard after its prerequisite table exists, and `0023` idempotently guarantees Jennifer execution/passkey tables even after a partially applied failed deployment.
- `0024_remote_ai_send_claims_recovery.sql` uses a fresh migration number to restore the exactly-once external-AI send ledger and its immutable/binding guards when an earlier failed Sites deployment recorded a partial migration.
- `0025_remote_ai_send_claims_watermark.sql` repeats that idempotent recovery at the reserved 2100 watermark because Sites can retain a deployment-time mark newer than the original midnight entries. Every later entry in this lineage must use a strictly greater `when` value.

This directory is append-only and is not an empty-database bootstrap. Restore an empty main database from backup before continuing this lineage. Do not reuse it for Columbia or another database.

The Sites packager always reads root `drizzle/` after the application build. The publish workflow therefore runs `npm run site:prepare-package` in the main Site checkout before saving source and packaging; that creates a Site-specific source commit whose root `drizzle/` is an exact copy of this directory. Columbia is a no-op because its selected lineage already is root `drizzle/`.

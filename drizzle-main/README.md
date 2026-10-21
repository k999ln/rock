# Canonical avoado.si D1 migration lineage

`vite.config.ts` selects this directory only for the canonical main Sites project. Columbia keeps the separate `drizzle/` lineage because the two Sites projects have separate D1 databases.

- The live database has already recorded its historical `0000`-`0019` migrations; those files intentionally remain in its migration ledger instead of being replayed from this directory.
- `0020_main_legacy_columns.sql` adds only columns confirmed missing from the live main D1, with defaults for every new non-null value.
- `0021_sites_schema_convergence.sql` is the idempotent full-schema snapshot, and `0022` restores the recurring send guard after its prerequisite table exists.

This directory is append-only and is not an empty-database bootstrap. Restore an empty main database from backup before continuing this lineage. Do not reuse it for Columbia or another database.

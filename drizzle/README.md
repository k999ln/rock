# Sites D1 migration lineage

Sites production discovers this repository-root directory and applies its SQL files before publishing the Worker.

- `0013_sky_provider_connections.sql` is the generated, resumable full-schema bridge. It uses idempotent object creation so it works for both an empty database and the existing database.
- `0020_sites_schema_convergence.sql` is the immutable append-only snapshot that replays that bridge for databases which had already recorded an older `0013` before later objects were added. `0021` restores the recurring send guard only after its prerequisite table exists.
- The preceding and following development histories are retained under `drizzle-legacy/` as evidence, but they are intentionally outside the deployable directory because their non-idempotent statements describe objects already present in production.
- Run `npm run db:site-bridge` after an intentional schema migration change, and commit the regenerated bridge. CI runs `npm run db:site-bridge:check` to prevent drift.
- New production schema changes must be appended here with the next ordinal and must be safe for the production state they target.
- Never rely on changing the bytes of an already-recorded migration to update a deployed database; append a new convergence migration instead.

Do not point another Worker at a second migration directory for the shared database.

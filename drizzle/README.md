# Sites D1 migration lineage

Sites production discovers this repository-root directory and applies its SQL files before publishing the Worker.

- `0013_sky_provider_connections.sql` is the generated, resumable full-schema bridge. It uses idempotent object creation so it works for both an empty database and the existing database.
- The preceding and following development histories are retained under `drizzle-legacy/` as evidence, but they are intentionally outside the deployable directory because their non-idempotent statements describe objects already present in production.
- Run `npm run db:site-bridge` after an intentional schema migration change, and commit the regenerated bridge. CI runs `npm run db:site-bridge:check` to prevent drift.
- New production schema changes must be appended here with the next ordinal and must be safe for the production state they target.
- `0020_sky_private_agents.sql` creates private Agent/Add tables after the existing Sites migration lineage. It is idempotent because a fresh database may also receive these objects from the full-schema bridge.

Do not point another Worker at a second migration directory for the shared database.

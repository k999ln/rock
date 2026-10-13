# Sky Web D1 migrations

This directory preserves the pre-Sites Sky Web migration lineage and the generated full-schema compatibility bridge used by migration tests. Sites production discovers the repository-root `drizzle/` directory, so the deployable compatibility bridge is mirrored there as `0013_sky_provider_connections.sql`.

The Web/Sites deployment is the only migration owner for the shared production `site-creator-d1` database. The separate Sky Agent Runtime binds the same database at runtime but deliberately has no `migrations_dir`; deploying that Worker must never apply a second migration lineage.

Rules:

- Never rename, reorder, delete, or edit a migration recorded by production.
- Append schema changes to this source lineage, then run `npm run db:site-bridge` to regenerate the deployable repository-root bridge.
- Keep this directory as source/test evidence; do not configure it as a second production deployment lineage.
- Keep `vite.config.ts` and `wrangler.local.jsonc` pointed at repository-root `drizzle/`.
- Keep `services/sky-agent-runtime/wrangler.jsonc` without a `migrations_dir` while it shares the production Web database.
- Run `npm run verify` before publication; migration regression tests verify both lineages and the compatibility bridge.

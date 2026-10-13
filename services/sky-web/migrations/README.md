# Sky Web D1 migrations

This directory is the published migration lineage for the RockstarOS Web/Sites D1 database. Its SQL filenames and bytes match the history from the last successful Site source commit before the Jennifer publication (`b10c56688b9e38045685246c718d2de7c6f92f2c`).

Sky Web/Sites is the only migration owner for the shared production `site-creator-d1` database. The separate Sky Agent Runtime binds the same database at runtime but deliberately has no `migrations_dir`; deploying that Worker must never apply a second migration lineage. Repository-root `drizzle/` remains the source and regression-test history for the application schema and isolated Agent Runtime fixtures.

Rules:

- Never rename, reorder, delete, or edit a published SQL file here.
- Add only a forward migration with a new ordinal for a Sky Web schema change.
- `0018_sky_feed_personalization.sql` adds the opt-in Sky Phoenix history and settings tables without changing existing rows.
- Keep `vite.config.ts` pointed at this directory.
- Keep `wrangler.local.jsonc` pointed at this directory.
- Keep `services/sky-agent-runtime/wrangler.jsonc` without a `migrations_dir` while it shares the production Web database.
- Run `npm run verify` before publication; the migration regression test checks the frozen file list and SHA-256 digests.

# Sky Web D1 migrations

This directory is the published migration lineage for the RockstarOS Web/Sites D1 database. Its SQL filenames and bytes match the history already applied to the existing Site.

The separate Sky Agent Runtime uses the repository-root `drizzle/` lineage. Keep the two histories separate: they have different published filenames after `0011` and combining them can replay an already-created table or trigger against production data.

Rules:

- Never rename, reorder, delete, or edit a published SQL file here.
- Add only a forward migration with a new ordinal for a Sky Web schema change.
- Keep `vite.config.ts` pointed at this directory.
- Keep `services/sky-agent-runtime/wrangler.jsonc` pointed at the repository-root `drizzle/` directory.
- Run `npm run verify` before publication; the migration regression test checks the frozen file list and SHA-256 digests.

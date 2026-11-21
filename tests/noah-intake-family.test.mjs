import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { groupNoahFamilies, NOAH_REGROUP_SQL, noahRepositoryKey } from '../lib/noah-intake-family.ts';
import { fixture, entry, page } from './fixtures/noah/intake.mjs';
void test('regroup keeps contract SQL verbatim and matches the pure grouping/representative rules', async t => {
  assert.deepEqual(NOAH_REGROUP_SQL, readFileSync(new URL('../docs/contracts/noah-regroup-v1.sql', import.meta.url), 'utf8').split('--> statement-breakpoint'));
  const entries = Array.from({ length: 22 }, (_, i) => entry(i, { remotes: [{ type: 'streamable-http', url: 'https://shared.example.com/mcp' }] }));
  const f = fixture(t, async () => page(entries)); assert.equal((await f.store.sync()).seen, 22);
  const expected = groupNoahFamilies(entries.map(e => ({ id: `mcp-registry:${e.server.name}`, source: 'mcp-registry', name: e.server.name, host: 'shared.example.com', running: true, level: 0 })));
  for (const row of f.sql.prepare('SELECT id,family_id FROM noah_intake_candidates').all()) assert.equal(row.family_id, expected.familyOf.get(row.id));
  const family = f.sql.prepare("SELECT * FROM noah_intake_families WHERE id LIKE 'bulk:%'").get(); assert.equal(family.members, 22); assert.equal(family.representative_id, expected.representative.get(family.id)); assert.equal(family.listed, 0);
  assert.equal(noahRepositoryKey('https://github.com/Owner/Repo.git'), 'github.com/owner/repo'); assert.equal(noahRepositoryKey('http://127.0.0.1/repo'), null);
});

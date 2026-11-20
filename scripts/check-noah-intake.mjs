// Local D1 only. --live reads the fixed public registry, never any Agent endpoint.
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { createIntakeTick } from '../lib/noah-intake-api.ts';
import { createIntakeStore } from '../lib/noah-intake-store.ts';
import { parseNoahFlags } from '../lib/noah-flags.ts';
import { noahWakeSignature } from '../lib/noah-intake-wake.ts';
const live = process.argv.includes('--live');
if (process.argv.slice(2).some(arg => arg !== '--live')) throw Error('Only --live is supported; database is always local and ephemeral');
const mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script: 'export default { fetch() { return new Response("local intake acceptance"); } };', compatibilityDate: '2026-10-01', d1Databases: { DB: 'noah-intake-local-acceptance' } }));
try {
  const db = await mf.getD1Database('DB');
  for (const sql of readFileSync(new URL('../drizzle/0044_noah_intake.sql', import.meta.url), 'utf8').split('--> statement-breakpoint').filter(s => /CREATE/.test(s))) await db.prepare(sql).run();
  const key = 'local-acceptance-wake-'.repeat(3), started = Date.now(), urls = [];
  let logical = started, turnStart = started;
  const deps = { db, now: () => logical + Date.now() - turnStart, authenticate: async () => 'local-reviewer', reviewers: ['local-reviewer'], wakeKey: key, flags: parseNoahFlags({ NOAH_PATROL_ENABLED: 'true' }),
    fetcher: async (input, init) => {
      const url = new URL(input); assert.equal(url.origin, 'https://registry.modelcontextprotocol.io'); assert.equal(url.pathname, '/v0.1/servers'); urls.push({ cursor: !!url.searchParams.get('cursor'), updated: url.searchParams.get('updated_since') });
      if (live) return fetch(input, init);
      if (url.searchParams.has('updated_since')) return Response.json({ servers: [], metadata: {} });
      const offset = Number(url.searchParams.get('cursor') ?? 0), count = 65000;
      return Response.json({ servers: Array.from({ length: Math.min(100, count - offset) }, (_, i) => {
        const n = offset + i; return { server: { name: `fixture.provider/agent-${n}`, version: '1.0.0', remotes: [{ type: 'streamable-http', url: `https://agent-${n}.example.com/mcp` }] }, _meta: { 'io.modelcontextprotocol.registry/official': { status: 'active', updatedAt: new Date(started).toISOString() } } };
      }), metadata: { nextCursor: offset + 100 < count ? String(offset + 100) : null } });
    } };
  const tick = createIntakeTick(deps);
  for (let wake = 1; wake <= 71; wake++) {
    turnStart = Date.now(); logical = started + (wake - 1) * 60000;
    const timestamp = String(deps.now());
    const response = await tick(new Request('https://noah.test/api/noah/intake/tick', { method: 'POST', body: '{}', headers: { 'x-noah-time': timestamp, 'x-noah-signature': await noahWakeSignature(key, timestamp) } }));
    const result = await response.json(); assert.equal(response.status, 200); assert.equal(result.error, undefined, JSON.stringify(result));
    console.log(JSON.stringify({ wake, ...result, elapsedMs: Date.now() - turnStart }));
  }
  const total = await db.prepare('SELECT COUNT(*) AS n FROM noah_intake_candidates').first();
  const status = await createIntakeStore(deps).status();
  const source = await db.prepare('SELECT checkpoint_at,last_full_at,sweep_started_at,observed FROM noah_intake_sources').first();
  const last = urls.at(-1);
  console.log(JSON.stringify({ mode: live ? 'public-registry/local-D1' : 'synthetic/local-D1', candidates: total.n, source, mouths: status.mouths, unsupported: status.unsupported, pages: urls.length, incrementalPages: urls.filter(u => u.updated).length, lastUpdatedSince: last?.updated, durationMs: Date.now() - started }));
  assert.ok(total.n >= 60000, `Only ${Number(total.n)} candidates`); assert.equal(source.sweep_started_at, null); assert.ok(last?.updated);
} finally { await mf.dispose(); }

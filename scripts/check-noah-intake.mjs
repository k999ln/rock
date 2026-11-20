// Local D1 only. --live reads the fixed public registry, never any Agent endpoint.
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { createIntakeTick } from '../lib/noah-intake-api.ts';
import { createIntakeStore } from '../lib/noah-intake-store.ts';
import { parseNoahFlags } from '../lib/noah-flags.ts';
import { NOAH_PATROL_BUDGET, noahWakeSignature } from '../lib/noah-intake-wake.ts';
export async function assertIntakeDistribution(db, live = true) {
  const rows = (await db.prepare("SELECT c.state,k.mouth,k.setup,COUNT(*) AS n FROM noah_intake_candidates c LEFT JOIN noah_intake_checks k ON k.candidate_id=c.id WHERE c.state<>'withdrawn' GROUP BY c.state,k.mouth,k.setup").all()).results;
  const actual = { remoteReady: 0, remoteSetup: 0, terminalReady: 0, terminalSetup: 0, unsupported: 0 };
  for (const row of rows) {
    if (row.state === 'unsupported') actual.unsupported += row.n;
    else if (row.mouth === 'mcp-remote') actual[row.setup ? 'remoteSetup' : 'remoteReady'] += row.n;
    else if (row.mouth === 'mcp-package') actual[row.setup ? 'terminalSetup' : 'terminalReady'] += row.n;
    else assert.fail('Unexpected active registry mouth');
  }
  const total = Object.values(actual).reduce((sum, value) => sum + value, 0);
  const expected = { remoteReady: 40503, remoteSetup: 4137, terminalReady: 14132, terminalSetup: 4026, unsupported: 3810 };
  const differences = Object.fromEntries(Object.keys(expected).map(key => [key, (actual[key] / total - expected[key] / 66608) * 100]));
  if (live) for (const [key, points] of Object.entries(differences)) assert.ok(Math.abs(points) <= 1, `${key}: ${points.toFixed(3)} percentage points from spec-85 §8`);
  return { activeAndUnsupported: total, counts: actual, differencePercentagePoints: differences };
}
export async function checkNoahIntake(live = false) {
const mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script: 'export default { fetch() { return new Response("local intake acceptance"); } };', compatibilityDate: '2026-10-01', d1Databases: { DB: 'noah-intake-local-acceptance' } }));
try {
  const db = await mf.getD1Database('DB');
  for (const file of ['0043_noah_runner', '0044_noah_intake', '0046_noah_connections']) for (const sql of readFileSync(new URL(`../drizzle/${file}.sql`, import.meta.url), 'utf8').split('--> statement-breakpoint').filter((s) => /CREATE/.test(s))) await db.prepare(sql).run();
  const key = 'local-acceptance-wake-'.repeat(3), started = Date.now(), urls = [];
  let logical = started, turnStart = started;
  // This acceptance covers the registry intake only: zero handshakes per wake, so no Agent endpoint is contacted (handshakes: scripts/check-noah-probe.mjs).
  const deps = { db, now: () => logical + Date.now() - turnStart, authenticate: async () => 'local-reviewer', reviewers: ['local-reviewer'], wakeKey: key, flags: parseNoahFlags({ NOAH_PATROL_ENABLED: 'true' }), budget: { ...NOAH_PATROL_BUDGET, probes: 0 },
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
  const distribution = await assertIntakeDistribution(db, live);
  console.log(JSON.stringify({ distribution, mode: live ? 'public-registry/local-D1' : 'synthetic/local-D1', candidates: total.n, source, mouths: status.mouths, unsupported: status.unsupported, pages: urls.length, incrementalPages: urls.filter(u => u.updated).length, lastUpdatedSince: last?.updated, durationMs: Date.now() - started }));
  assert.ok(total.n >= 60000, `Only ${Number(total.n)} candidates`); assert.equal(source.sweep_started_at, null); assert.ok(last?.updated);
} finally { await mf.dispose(); }

}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.slice(2).some(arg => arg !== '--live')) throw Error('Only --live is supported; database is always local and ephemeral');
  await checkNoahIntake(process.argv.includes('--live'));
}

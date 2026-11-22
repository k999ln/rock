import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

void test('cloud metering, probe and reviewer permissions stay separate in workerd', async (t) => {
  const meter = 'usage-test-token-'.repeat(3);
  const probe = 'probe-test-token-'.repeat(3);
  const { outputFiles } = await build({
    stdin: {
      contents: `
        import { GET, POST } from './app/api/internal/cloud-operations/route.ts';
        import { GET as review } from './app/api/noah/cloud-operations/route.ts';
        export default { fetch(request) {
          if (new URL(request.url).pathname.startsWith('/api/noah/')) return review(request);
          return request.method === 'GET' ? GET(request) : POST(request);
        }};`,
      resolveDir: process.cwd(),
      loader: 'ts',
    },
    bundle: true,
    format: 'esm',
    platform: 'browser',
    external: ['cloudflare:*', 'node:*'],
    write: false,
  });
  const worker = new Miniflare(convertV4MiniflareOptions({
    modules: true,
    compatibilityDate: '2026-09-01',
    compatibilityFlags: ['nodejs_compat'],
    d1Databases: ['DB'],
    script: outputFiles[0].text,
    bindings: {
      CLOUD_USAGE_INGEST_TOKEN: meter,
      CLOUD_PROBE_TOKEN: probe,
      NOAH_REVIEWER_USER_IDS: 'operator-a',
    },
  }));
  t.after(() => worker.dispose());
  const db = await worker.getD1Database('DB');
  const migration = readFileSync(new URL('../drizzle/0058_cloud_operations.sql', import.meta.url), 'utf8');
  for (const statement of migration.split('--> statement-breakpoint')) {
    if (statement.trim().startsWith('CREATE TRIGGER')) break;
    await db.prepare(statement).run();
  }

  const internal = 'https://fixture.test/api/internal/cloud-operations';
  const review = 'https://fixture.test/api/noah/cloud-operations';
  const usage = {
    id: 'meter-event', userId: 'fixture-owner',
    usage: { kind: 'container', at: Date.now(), vcpuSeconds: 1_500_001, gibSeconds: 0, gbSeconds: 0 },
  };
  const post = (source, token, body) => worker.dispatchFetch(`${internal}?source=${source}`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(body),
  });
  assert.equal((await post('usage', probe, usage)).status, 404);
  assert.equal((await post('usage', meter, { ...usage, costUsd: 0 })).status, 400);
  assert.equal((await post('usage', meter, usage)).status, 201);
  assert.equal((await post('usage', meter, usage)).status, 200);
  assert.equal((await worker.dispatchFetch(internal, { headers: { Authorization: `Bearer ${meter}` } })).status, 404);
  assert.deepEqual(await (await worker.dispatchFetch(internal, {
    headers: { Authorization: `Bearer ${probe}` },
  })).json(), { cloudAdmissionReady: true, acceptsNewWork: false });
  assert.equal((await post('probe', probe, { observedAt: Date.now(), statusCode: 200, latencyMs: 42, ok: true })).status, 201);

  assert.equal((await worker.dispatchFetch(review)).status, 404);
  assert.equal((await worker.dispatchFetch(review, { headers: { 'oai-authenticated-user-id': 'ordinary-user' } })).status, 404);
  const response = await worker.dispatchFetch(review, { headers: { 'oai-authenticated-user-id': 'operator-a' } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'no-store, private');
  const body = await response.json();
  assert.equal(body.report.totalUsd, 30.00002);
  assert.equal(body.report.days.at(-1).successes, 1);
  assert.doesNotMatch(JSON.stringify(body), /fixture-owner|meter-event/u);
});

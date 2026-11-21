import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { noahCloudUsageReport } from '../lib/noah-usage.ts';
import { launchFixture, buyer, credential, outcome } from './helpers/noah-launch-fixture.mjs';

async function cloudFixture(t) {
  const bundled = await build({
    stdin: {
      contents: `
        import { ingestCloudUsage } from './lib/cloud-operations-store.ts';
        export default { async fetch(request, env) {
          const { id, owner, requestDigest, at } = await request.json();
          const claim = await env.DB.prepare(
            'INSERT INTO rehearsal_requests VALUES (?, ?, ?, ?) ON CONFLICT(id) DO NOTHING'
          ).bind(id, owner, requestDigest, at).run();
          const saved = await env.DB.prepare('SELECT * FROM rehearsal_requests WHERE id = ?').bind(id).first();
          if (saved.owner !== owner || saved.request_digest !== requestDigest) return new Response(null, { status: 409 });
          const executed = claim.meta.changes === 1;
          // The synthetic compute contract admits one execution before recording one usage receipt.
          await ingestCloudUsage(env.DB, { id: 'rehearsal:' + id, userId: owner,
            usage: { kind: 'container', at: saved.admitted_at, vcpuSeconds: 300, gibSeconds: 600, gbSeconds: 1200 } }, at);
          return Response.json({ id, location: 'cloudflare', result: 'synthetic Cloudflare result', executed });
        }};`,
      resolveDir: process.cwd(),
      loader: 'ts',
    },
    bundle: true, format: 'esm', platform: 'browser', write: false,
  });
  const worker = new Miniflare(convertV4MiniflareOptions({
    modules: true, compatibilityDate: '2026-09-01', d1Databases: ['DB'], script: bundled.outputFiles[0].text,
  }));
  t.after(() => worker.dispose());
  const db = await worker.getD1Database('DB');
  const migration = readFileSync(new URL('../drizzle/0054_cloud_operations.sql', import.meta.url), 'utf8');
  for (const statement of migration.split('--> statement-breakpoint').slice(0, 2)) await db.prepare(statement).run();
  await db.prepare(`CREATE TABLE rehearsal_requests
    (id TEXT PRIMARY KEY, owner TEXT NOT NULL, request_digest TEXT NOT NULL, admitted_at INTEGER NOT NULL)`).run();
  return { worker, db };
}

void test('runner loss retains the existing unknown request and sends only new work to the metered Worker', async (t) => {
  const f = await launchFixture(t);
  const { worker, db } = await cloudFixture(t);
  assert.equal((await f.approved()).status, 200);
  const connection = await f.connect();
  const request = {
    id: randomUUID(), deviceId: f.base.deviceId, action: 'run', connectionId: connection.id, prompt: 'Synthetic runner input',
  };
  assert.equal(await f.service.computePlacement(buyer, request), 'runner');
  await f.service.enqueue(buyer, request);
  const first = (await f.poll()).command;
  assert.equal(first.id, request.id);
  await f.service.start(buyer, credential, { ...f.base, id: request.id, lease: first.lease });

  // The original runner stops without a result or any more heartbeats.
  f.advance(31_000);
  const newId = randomUUID();
  const at = Date.now();
  const sentToCloud = [];
  async function submit(input) {
    const placement = await f.service.computePlacement(buyer, input);
    if (placement === 'existing' || placement === 'runner') return f.service.enqueue(buyer, input);
    assert.equal(placement, 'cloud');
    sentToCloud.push(input.id);
    const response = await worker.dispatchFetch('https://fixture.test/compute', {
      method: 'POST', body: JSON.stringify({
        id: input.id, owner: buyer, at,
        requestDigest: createHash('sha256').update(JSON.stringify(input)).digest('hex'),
      }),
    });
    assert.equal(response.status, 200);
    return response.json();
  }

  assert.equal((await submit(request)).state, 'unknown');
  assert.equal((await f.jobs.get(buyer, request.id)).noahExecution.state, 'unknown');
  assert.deepEqual(sentToCloud, []);
  await assert.rejects(submit({ ...request, prompt: 'changed input' }), { status: 409 });

  assert.deepEqual(await submit({ ...request, id: newId, prompt: 'New synthetic input' }), {
    id: newId, location: 'cloudflare', result: 'synthetic Cloudflare result', executed: true,
  });
  assert.equal((await submit({ ...request, id: newId, prompt: 'New synthetic input' })).executed, false);
  assert.equal((await submit(request)).state, 'unknown');
  assert.deepEqual(sentToCloud, [newId, newId]);
  const stored = await db.prepare('SELECT id FROM cloud_usage_records').all();
  assert.deepEqual(stored.results, [{ id: `rehearsal:${newId}` }]);
  assert.deepEqual((await db.prepare('SELECT id FROM rehearsal_requests').all()).results, [{ id: newId }]);
  assert.equal((await noahCloudUsageReport(db, undefined, at)).current.totalUsd, 0.007584);

  // A reconnect advances last_seen_at. Check it only after the offline placement.
  assert.equal((await f.poll()).command, null);
  await assert.rejects(f.finish(first, { state: 'succeeded', result: outcome, calls: 0 }), { status: 409 });
  assert.equal((await f.poll()).command, null);
});

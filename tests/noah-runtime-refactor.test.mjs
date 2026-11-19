import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogLoader } from '../scripts/noah-managed-installations.mjs';
import { RECIPES, modelFor } from '../lib/noah-execution-contract.mjs';
import { createNoahWork, executionInputDigest } from '../lib/noah-execution.ts';
import { secureWebResponse } from '../lib/web-security-response.mjs';

void test('every reviewed recipe creates the same version/model Work binding used by the host and UI', async () => {
  for (const [agentId, r] of Object.entries(RECIPES)) {
    const prompt = 'Create a test file';
    const work = await createNoahWork(crypto.randomUUID(), { agentId, recipe: r.key, version: r.version, model: modelFor(r), prompt,
      ...(r.provider ? { provider: { name: 'openai-codex', model: 'test-model', version: 'codex-cli 0.1.0', sha256: 'c'.repeat(64), consent: 'codex-account/1', metric: 'provider_turns' } } : {}),
      image: `sha256:${'a'.repeat(64)}`, inputSha256: await executionInputDigest(agentId, prompt), claimSha256: 'b'.repeat(64) });
    assert.equal(work.noahExecution.recipe, r.key); assert.equal(work.status, 'active');
  }
});

void test('catalog loader deduplicates concurrent loads and evicts least recently used shards', async () => {
  const calls = [], ids = Array.from({ length: 7 }, (_, i) => `research-${i.toString(16).padStart(2, '0')}${'a'.repeat(18)}`);
  const read = async path => {
    calls.push(path);
    if (path.endsWith('receipt.json')) return JSON.stringify({ revision: 'a'.repeat(16) });
    const bucket = parseInt(path.split('/').at(-1), 16);
    return JSON.stringify({ [ids[bucket]]: { id: ids[bucket] } });
  };
  const load = catalogLoader('/synthetic', { read, maxShards: 4 });
  await Promise.all(Array.from({ length: 10 }, () => load(ids[0])));
  assert.equal(calls.length, 2);
  for (const id of ids.slice(1)) assert.equal((await load(id)).id, id);
  await load(ids[6]); assert.equal(calls.length, 8);
  await load(ids[0]); assert.equal(calls.length, 9);
  assert.ok(!calls.some(p => p.endsWith('noah-research-index.json')));
  await assert.rejects(load('../../secret'));
});

void test('production response policy covers redirects/errors and preserves response contents', async () => {
  for (const status of [200, 307, 404]) {
    const r = secureWebResponse(new Response('body', { status, headers: { Location: '/chat', 'Set-Cookie': 'a=b; HttpOnly' } }), 'http://127.0.0.1/');
    assert.equal(r.status, status); assert.equal(r.headers.get('location'), '/chat');
    assert.equal(r.headers.get('set-cookie'), 'a=b; HttpOnly'); assert.equal(await r.text(), 'body');
    assert.equal(r.headers.get('x-frame-options'), 'DENY'); assert.match(r.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  }
  const sw = secureWebResponse(new Response('worker'), 'http://127.0.0.1/sw.js');
  assert.equal(sw.headers.get('cache-control'), 'no-cache, no-store, must-revalidate');
});

void test('catalog read failures can recover and invalid cache bounds cannot loop', async () => {
  for (const maxShards of [0, -1, 1.5, 65]) assert.throws(() => catalogLoader('/synthetic', { maxShards }));
  let receipts = 0, shards = 0;
  const id = `research-${'a'.repeat(20)}`;
  const load = catalogLoader('/synthetic', { read: async path => {
    if (path.endsWith('receipt.json')) {
      if (++receipts === 1) throw new Error('temporary receipt failure');
      return JSON.stringify({ revision: 'a'.repeat(16) });
    }
    if (++shards === 1) throw new Error('temporary shard failure');
    return JSON.stringify({ [id]: { id } });
  } });
  await assert.rejects(load(id), /receipt failure/);
  await assert.rejects(load(id), /shard failure/);
  assert.equal((await load(id)).id, id);
  assert.equal(receipts, 2); assert.equal(shards, 2);
});

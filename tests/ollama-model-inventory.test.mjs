import test from 'node:test';
import assert from 'node:assert/strict';
import { readOllamaModelInventory } from '../lib/ollama-model-inventory.ts';
const runtime = { SKY_OLLAMA_BASE_URL: 'http://127.0.0.1:11434' };
void test('local inventory bounds data and rejects ambiguous aliases instead of choosing a digest', async () => {
  const model = { name: 'installed:latest', digest: 'a'.repeat(64), size: 42 };
  const rows = await readOllamaModelInventory(runtime, async (url, init) => {
    assert.equal(url instanceof URL ? url.href : '', 'http://127.0.0.1:11434/api/tags'); assert.equal(init.redirect, 'manual');
    return Response.json({ models: [model, { name: 'bad', digest: 'not-a-digest' }] });
  });
  assert.deepEqual(rows, [{ name: model.name, digest: model.digest, bytes: 42 }]);
  await assert.rejects(readOllamaModelInventory(runtime, async () => Response.json({ models: [model, { ...model, digest: 'b'.repeat(64) }] })), /AMBIGUOUS/);
  await assert.rejects(readOllamaModelInventory(runtime, async () => Response.json({ models: Array(51).fill(model) })), /INVALID_MODEL/);
});
void test('oversized streamed bodies, redirects and malformed responses cannot supply model identity', async () => {
  for (const response of [new Response('x'.repeat(128001)), new Response(null, { status: 302, headers: { location: 'https://external.invalid/tags' } }), new Response('{'), Response.json({ models: null })])
    await assert.rejects(readOllamaModelInventory(runtime, async () => response));
});
void test('remote or credential-bearing inventory URLs are rejected before any network call', async () => {
  let calls = 0;
  for (const url of ['https://external.invalid', 'http://user:secret@localhost:11434', 'http://localhost:11434?key=secret', 'http://localhost:11434#fragment'])
    await assert.rejects(readOllamaModelInventory({ SKY_OLLAMA_BASE_URL: url }, async () => { calls++; return Response.json({ models: [] }); }), /INVALID_LOCAL/);
  assert.equal(calls, 0);
});

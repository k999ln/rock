import assert from 'node:assert/strict';
import test from 'node:test';
import { createSkyZemaHandoff, createZemaSession, normalizeSkyZemaHandoff } from '../public-release/rockstaros/packages/sky-zema-core/src/index.js';
import { consumeSkyZemaHandoff, queueSkyZemaHandoff, SKY_ZEMA_HANDOFF_KEY, SKY_ZEMA_HANDOFF_TTL_MS } from '../lib/sky-zema-handoff.ts';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  };
}
const id = 'b55ad88a-5b84-4ac2-ac0d-c5441c832be1';
const sample = () => createSkyZemaHandoff({ id, toolId: 'mr-citations', request: '引用を整理', at: 1_000 });

void test('public and Web hosts exchange the shared handoff without granting execution', () => {
  const storage = memoryStorage();
  const publicHandoff = sample();
  assert.equal(publicHandoff.executionProvider, 'local');
  storage.setItem(SKY_ZEMA_HANDOFF_KEY, JSON.stringify(publicHandoff));
  const handoff = consumeSkyZemaHandoff('mr-citations', storage, 1_001);
  assert.deepEqual(handoff, normalizeSkyZemaHandoff(publicHandoff));
  assert.equal(handoff.executionProvider, 'local-model');
  assert.equal(consumeSkyZemaHandoff('mr-citations', storage, 1_002), null);
  const webHandoff = queueSkyZemaHandoff('mr-citations', '確認', storage, 1_003);
  assert.equal(createZemaSession(webHandoff).status, 'ready');
  assert.equal(createZemaSession(webHandoff).outcome, null);
});

void test('legacy local aliases remain local, while remote providers and invalid envelopes fail closed', () => {
  const { executionProvider: _, ...legacy } = sample();
  assert.equal(normalizeSkyZemaHandoff(legacy).executionProvider, 'local-model');
  for (const patch of [
    { executionProvider: 'openai' }, { source: 'external' }, { version: 2 },
    { createdAt: NaN }, { request: 'x'.repeat(2_001) }, { toolId: '../unsafe' },
  ]) {
    assert.throws(() => createZemaSession({ ...sample(), ...patch }), /valid local Sky handoff/);
  }
  assert.throws(() => createSkyZemaHandoff({ ...sample(), at: 'not-a-date' }), /valid date/);
});

void test('Web storage keeps its stricter identity, expiry, tool binding and single-use boundaries', () => {
  const storage = memoryStorage();
  for (const handoff of [{ ...sample(), id: 'public-demo-id' }, { ...sample(), executionProvider: 'remote' }]) {
    storage.setItem(SKY_ZEMA_HANDOFF_KEY, JSON.stringify(handoff));
    assert.equal(consumeSkyZemaHandoff('mr-citations', storage, 1_001), null);
    assert.equal(storage.getItem(SKY_ZEMA_HANDOFF_KEY), null);
  }
  storage.setItem(SKY_ZEMA_HANDOFF_KEY, JSON.stringify(sample()));
  assert.equal(consumeSkyZemaHandoff('another-tool', storage, 1_001), null);
  assert.ok(storage.getItem(SKY_ZEMA_HANDOFF_KEY));
  assert.equal(consumeSkyZemaHandoff('mr-citations', storage, 1_001 + SKY_ZEMA_HANDOFF_TTL_MS), null);
  assert.equal(storage.getItem(SKY_ZEMA_HANDOFF_KEY), null);
});

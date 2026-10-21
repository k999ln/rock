import assert from 'node:assert/strict';
import test from 'node:test';
import { createLocalChannelStore, CHANNEL_TTL_MS } from '../lib/sky-app-local-channel.ts';
import { plannerSkyRequest } from '../lib/sky-app-foundation.ts';

const request = () => plannerSkyRequest({ taskId: 'm1t1', revision: 'test-1', brief: '担当作業：合成メモを確認する。' });
const key = 'a'.repeat(64), origin = 'http://localhost:5197';
void test('channel create is bounded, immutable, idempotent and expires without durable storage', () => {
  const store = createLocalChannelStore(1), a = store.create(key, origin, request(), 1000);
  assert.equal(a.expiresAt, 1000 + CHANNEL_TTL_MS);
  assert.deepEqual(store.create(key, origin, request(), 1000), a);
  a.job.title = 'mutated'; assert.notEqual(store.get(key, 1000).job.title, 'mutated');
  assert.throws(() => store.create(key, origin, { ...request(), sourceRevision: 'other' }, 1000), /使用/);
  assert.throws(() => store.create('b'.repeat(64), origin, request(), 1000), /上限/);
  assert.throws(() => store.get('b'.repeat(64), 1000), /見つかり/);
  assert.throws(() => store.get(key, a.expiresAt), /期限/);
  assert.equal(store.create('b'.repeat(64), origin, request(), a.expiresAt).job.status, 'active');
  assert.throws(() => store.create('invalid', origin, request()), /ID/);
});
void test('channel result can only be delivered after common Sky review and same revision', async () => {
  const store = createLocalChannelStore(); store.create(key, origin, request());
  await assert.rejects(store.command(key, 'deliver', 0, crypto.randomUUID(), new AbortController().signal), /確認済み/);
  const run = await store.command(key, 'run', 0, crypto.randomUUID(), new AbortController().signal);
  assert.equal(run.job.status, 'review'); assert.equal(run.delivered, false);
  await assert.rejects(store.command(key, 'confirm', 0, crypto.randomUUID(), new AbortController().signal), /版/);
  const confirmed = await store.command(key, 'confirm', 2, crypto.randomUUID(), new AbortController().signal);
  assert.equal(confirmed.job.status, 'completed');
  const delivered = await store.command(key, 'deliver', 3, crypto.randomUUID(), new AbortController().signal);
  assert.equal(delivered.delivered, true); assert.equal(delivered.job.skyApp.result.sourceId, 'm1t1');
  await assert.rejects(store.command(key, 'deliver', 3, crypto.randomUUID(), new AbortController().signal), /状態/);
});
void test('a concurrent stop wins and late computation never overwrites it', async () => {
  const store = createLocalChannelStore(); store.create(key, origin, request());
  const pending = store.command(key, 'run', 0, crypto.randomUUID(), new AbortController().signal);
  const stopped = await store.command(key, 'stop', 0, crypto.randomUUID(), new AbortController().signal);
  assert.equal(stopped.job.status, 'cancelled');
  await assert.rejects(pending, /停止|別の操作/);
  assert.equal(store.get(key).job.skyApp.result, null);
});

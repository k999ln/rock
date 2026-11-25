import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { createCollectionApi } from '../lib/noah-collection-api.ts';
import { collectionSignature, NOAH_COLLECTION_PATH, parseCollectionSnapshot } from '../lib/noah-collection.ts';
import { noahIntakeExport, noahIntakeImport } from '../lib/noah-intake-import.ts';
import { world, familyId, hostOf } from './fixtures/noah/connect-world.mjs';
import { fixture } from './fixtures/noah/intake.mjs';
import { mcpServer, tool } from './fixtures/noah/mcp-server.mjs';

const pin = { title: '天気を調べる', give: '都市名', get: '天気予報', scene: { template: 'concentric', labels: ['都市', '天気予報'], parts: [], variant: null } };
const migration = readFileSync(new URL('../docs/noah/migrations/0061_noah_intake_pins.sql', import.meta.url), 'utf8');

void test('migration preserves old rows and limits pin JSON by UTF-8 bytes', () => {
  const sql = new DatabaseSync(':memory:');
  try {
    sql.exec("CREATE TABLE noah_intake_candidates(id TEXT PRIMARY KEY); INSERT INTO noah_intake_candidates VALUES ('existing');");
    sql.exec(migration);
    const row = sql.prepare('SELECT * FROM noah_intake_candidates').get();
    assert.deepEqual({ ...row }, { id: 'existing', pin_json: null, pin_source_sha256: null, pin_model: null, pin_at: null, pin_skip: null });
    const update = sql.prepare('UPDATE noah_intake_candidates SET pin_json = ?');
    const json = JSON.stringify(pin);
    const within = json + ' '.repeat(2048 - Buffer.byteLength(json));
    assert.equal(Buffer.byteLength(within), 2048);
    assert.equal(update.run(within).changes, 1);
    assert.throws(() => update.run(JSON.stringify('画'.repeat(683))), /CHECK constraint/u);
    assert.throws(() => update.run('{'), /CHECK constraint/u);
  } finally {
    sql.close();
  }
});

void test('signed collection snapshots store valid pins, omit malformed pins, and keep pins private', async () => {
  const now = 1795302000000, key = 'collection-test-key'.repeat(3);
  const github = 'https://github.com/maker/';
  const item = { source: 'github', name: 'Weather', summary: 'Weather forecasts', author: 'maker', observedAt: now, expiresAt: now + 1000 };
  const snapshot = { schema: 'noah-collection/1', source: 'github', collectedAt: now, items: [
    { ...item, id: 'good', url: github + 'good', sourceUrl: github + 'good', pin },
    { ...item, id: 'bad', url: github + 'bad', sourceUrl: github + 'bad', pin: { ...pin, title: '長'.repeat(21) } },
  ] };
  const clean = parseCollectionSnapshot(snapshot, now);
  assert.deepEqual(clean.items[0].pin, pin);
  assert.equal(clean.items[1].pin, undefined);
  let stored;
  const bucket = {
    async get() { return stored ? { json: async () => JSON.parse(stored) } : null; },
    async put(_path, value) { stored = value; return {}; },
  };
  const api = createCollectionApi({ bucket, key, now: () => now });
  const body = JSON.stringify(snapshot), timestamp = String(now);
  const endpoint = 'https://avoado.si' + NOAH_COLLECTION_PATH;
  const post = await api(new Request(endpoint, { method: 'POST', body, headers: {
    'content-type': 'application/json', 'x-noah-collector-time': timestamp,
    'x-noah-collector-signature': await collectionSignature(key, timestamp, body),
  } }));
  assert.equal(post.status, 200);
  assert.deepEqual(JSON.parse(stored), clean);
  const publicList = await (await api(new Request(endpoint))).json();
  assert.equal(publicList.items.length, 2);
  assert.ok(publicList.items.every((row) => !Object.hasOwn(row, 'pin')));
});

void test('a candidate pin imports and exports in place, ignores replay and stale input, and can be skipped', async (t) => {
  const source = await world(t, { [hostOf(1)]: mcpServer({ tools: [tool('weather')] }) });
  const now = source.f.time();
  const exported = await noahIntakeExport(source.f.db, now);
  assert.equal(exported.candidates.length, 1);
  const original = exported.candidates[0];
  const prod = fixture(t, source.net.fetch);
  await noahIntakeImport(prod.db, exported, now);
  prod.sql.exec(migration);
  const generated = { pin_json: JSON.stringify(pin), pin_source_sha256: 'b'.repeat(64), pin_model: 'gpt-example', pin_at: now, pin_skip: null };
  const send = (candidate, exportedAt = now) => noahIntakeImport(prod.db, { ...exported, exportedAt, candidates: [candidate] }, exportedAt);
  const current = () => prod.sql.prepare('SELECT pin_json, pin_at, pin_skip FROM noah_intake_candidates WHERE id=?').get(familyId(1));
  await assert.rejects(send({ ...original, ...generated, pin_json: JSON.stringify({ ...pin, scene: {} }) }), /ピンの記録/u);
  await assert.rejects(send({ ...original, ...generated, pin_json: generated.pin_json.padEnd(3000) }), /ピンの記録/u);
  assert.ok((await send({ ...original, ...generated })).rowsWritten > 0);
  assert.equal(current().pin_json, generated.pin_json);
  assert.equal((await send({ ...original, ...generated })).rowsWritten, 0);
  assert.equal((await send(original)).rowsWritten, 0);
  assert.equal((await noahIntakeExport(prod.db, now)).candidates[0].pin_json, generated.pin_json);
  await send({ ...original, summary: 'stale text', ...generated, pin_at: now + 1 }, now + 1);
  assert.equal(current().pin_at, now);
  await send({ ...original, ...generated, pin_at: now + 2, pin_json: null, pin_skip: 'unclear' }, now + 2);
  assert.deepEqual({ ...current() }, { pin_at: now + 2, pin_json: null, pin_skip: 'unclear' });
  await send({ ...original, ...generated });
  assert.equal(current().pin_skip, 'unclear');
});

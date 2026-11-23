import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { createCollectorCheckpointApi, NOAH_CHECKPOINT_PATH, NOAH_CHECKPOINT_BYTES, NOAH_CHECKPOINT_CHUNK_CHARS, checkpointChunkHash } from '../lib/noah-collector-checkpoint.ts';
import { collectionSignature } from '../lib/noah-collection.ts';
import { createCollectionApi } from '../lib/noah-collection-api.ts';
import { openCollectorStore, writeCollectorJson } from '../scripts/noah-collector-store.mjs';
import { checkpointClient, encodeCheckpoint, restoreCheckpoint, runCloudCollector } from '../scripts/noah-cloud-collector.mjs';

const key = randomBytes(32).toString('hex'), NOW = Date.UTC(2026, 10, 22);
function bucket() {
  const rows = new Map(); let generation = 0;
  return { rows, conflict: false,
    async head(path) { const row = rows.get(path); return row && { etag: row.etag }; },
    async get(path) { const row = rows.get(path); return row && { etag: row.etag, async json() { return JSON.parse(row.body); } }; },
    async put(path, body, options) {
      const old = rows.get(path);
      if (this.conflict || options.onlyIf.etagMatches && options.onlyIf.etagMatches !== old?.etag || options.onlyIf.etagDoesNotMatch === '*' && old) return null;
      const etag = `etag-${++generation}`; rows.set(path, { body, etag }); return { etag };
    },
  };
}
function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'noah-cloud-')); t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}
async function post(api, value, { time = NOW, path = NOAH_CHECKPOINT_PATH, extra = {} } = {}) {
  const body = JSON.stringify(value), timestamp = String(time);
  return api(new Request(`https://avoado.si${NOAH_CHECKPOINT_PATH}`, { method: 'POST', body,
    headers: { 'content-type': 'application/json', 'x-noah-collector-time': timestamp, 'x-noah-collector-signature': await collectionSignature(key, timestamp, body, path), ...extra } }));
}
const sample = at => ({ schema: 'noah-collector-checkpoint/1', updatedAt: at, runId: '123', sqliteGzip: gzipSync('data').toString('base64') });

void test('checkpoints are private, path-bound, time-bound and require an operator signature even for reads', async () => {
  const store = bucket(), api = createCollectorCheckpointApi({ bucket: store, key, now: () => NOW });
  assert.equal((await api(new Request(`https://avoado.si${NOAH_CHECKPOINT_PATH}`))).status, 405);
  assert.equal((await api(new Request(`https://avoado.si${NOAH_CHECKPOINT_PATH}`, { method: 'POST', body: '{"action":"read"}', headers: { 'content-type': 'application/json' } }))).status, 401);
  assert.equal((await post(api, { action: 'read' }, { path: '/api/noah/collection' })).status, 401);
  assert.equal((await post(api, { action: 'read' }, { time: NOW - 120001 })).status, 401);
  assert.equal((await post(api, { action: 'read' }, { extra: { origin: 'https://avoado.si' } })).status, 403);
  assert.equal((await post(api, { action: 'read' })).status, 404);
  assert.equal(store.rows.size, 0);
});
void test('checkpoint writes reject stale owners, replay, oversized payloads and concurrent replacement', async () => {
  const store = bucket(), api = createCollectorCheckpointApi({ bucket: store, key, now: () => NOW + 10 });
  const first = await post(api, { action: 'write', etag: null, checkpoint: sample(NOW) });
  assert.equal(first.status, 200);
  const { etag } = await first.json(), read = await post(api, { action: 'read' });
  assert.equal(read.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await read.json(), { etag, checkpoint: sample(NOW) });
  assert.equal((await post(api, { action: 'write', etag: null, checkpoint: sample(NOW + 1) })).status, 409);
  assert.equal((await post(api, { action: 'write', etag, checkpoint: sample(NOW) })).status, 409);
  store.conflict = true;
  assert.equal((await post(api, { action: 'write', etag, checkpoint: sample(NOW + 1) })).status, 409);
  assert.equal((await post(api, { action: 'read' }, { extra: { 'content-length': String(NOAH_CHECKPOINT_BYTES + 1) } })).status, 413);
  assert.equal((await post(api, { action: 'write', etag, checkpoint: { ...sample(NOW), sqliteGzip: 'not-gzip' } })).status, 400);
});
void test('stopped SQLite survives compression; a live lease or existing local database cannot be overwritten', t => {
  const directory = fixture(t), source = join(directory, 'source'), restored = join(directory, 'restored');
  const db = openCollectorStore(source, { now: () => NOW });
  assert.throws(() => encodeCheckpoint(source, 'bootstrap', NOW), /cloud_checkpoint_active/);
  db.sql.exec('CREATE TABLE progress(value INTEGER); INSERT INTO progress VALUES(7)'); db.close();
  const checkpoint = encodeCheckpoint(source, 'bootstrap', NOW);
  restoreCheckpoint(restored, checkpoint, NOW);
  const reopened = openCollectorStore(restored, { now: () => NOW });
  assert.equal(reopened.sql.prepare('SELECT value FROM progress').get().value, 7); reopened.close();
  assert.throws(() => restoreCheckpoint(restored, checkpoint, NOW), /cloud_directory_not_empty/);
  assert.throws(() => restoreCheckpoint(join(directory, 'invalid'), sample(NOW), NOW), /cloud_checkpoint_database/);
});
void test('two independent cloud runners resume progress and publish refreshed HF ratings after checkpoint commits', async t => {
  const directory = fixture(t), seed = join(directory, 'seed');
  const local = openCollectorStore(seed); local.sql.exec('CREATE TABLE progress(value INTEGER); INSERT INTO progress VALUES(0)'); local.close();
  const store = bucket(); let clock = NOW;
  const stateApi = createCollectorCheckpointApi({ bucket: store, key, now: () => clock });
  const publicApi = createCollectionApi({ bucket: store, key, now: () => clock });
  const events = [];
  const fetcher = (url, init) => {
    const request = new Request(url, init), checkpoint = request.url.endsWith('/checkpoint');
    if (init.method === 'POST') events.push(checkpoint ? JSON.parse(init.body).action : 'publish');
    return checkpoint ? stateApi(request) : publicApi(request);
  };
  const options = { origin: 'https://avoado.si', key, fetcher, now: () => clock };
  assert.equal((await runCloudCollector({ ...options, runId: 'bootstrap', bootstrap: seed })).seeded, true);
  const collect = async ({ directory }) => {
    const db = openCollectorStore(directory, { now: () => clock });
    db.sql.exec('UPDATE progress SET value=value+1');
    const count = db.sql.prepare('SELECT value FROM progress').get().value; db.close();
    writeCollectorJson(join(directory, 'collection.json'), { snapshots: [{ schema: 'noah-collection/1', source: 'huggingface', collectedAt: clock,
      items: [{ id: 'hf:1', source: 'huggingface', name: 'Agent', summary: '', author: 'creator', url: 'https://huggingface.co/spaces/creator/agent', sourceUrl: 'https://huggingface.co/spaces/creator/agent', observedAt: clock, expiresAt: clock + 86400000, metrics: { likes: 12 - count } }] }] });
    return { counts: { count }, errors: [], steps: { x: { status: 'needs_credentials' } } };
  };
  clock++;
  const first = await runCloudCollector({ ...options, directory: join(directory, 'one'), runId: '101', collect });
  clock++;
  const second = await runCloudCollector({ ...options, directory: join(directory, 'two'), runId: '102', collect });
  assert.deepEqual([first.counts.count, second.counts.count, second.previousRunId], [1, 2, '101']);
  assert.deepEqual(events, ['read', 'write', 'read', 'write', 'publish', 'read', 'write', 'publish']);
  const publicData = await (await publicApi(new Request('https://avoado.si/api/noah/collection'))).json();
  assert.equal(publicData.items[0].metrics.likes, 10); assert.equal(publicData.items[0].observedAt, clock);
  assert.equal(publicData.items[0].status, 'discovered');
  store.conflict = true; clock++;
  await assert.rejects(() => runCloudCollector({ ...options, directory: join(directory, 'stale'), runId: '103', collect }), /cloud_checkpoint_http_409/);
  assert.equal(events.at(-1), 'write'); // Nothing was published after the rejected checkpoint.
});
void test('missing or unavailable cloud state aborts before collection or publication', async t => {
  for (const status of [404, 503]) {
    let collected = false, calls = 0;
    await assert.rejects(() => runCloudCollector({ directory: fixture(t), origin: 'https://avoado.si', key, runId: '123',
      fetcher: async () => { calls++; return new Response('{}', { status }); }, collect: async () => { collected = true; } }), new RegExp(`cloud_checkpoint_http_${status}`));
    assert.equal(collected, false); assert.equal(calls, 1);
  }
  assert.throws(() => checkpointClient({ origin: 'http://avoado.si', key, fetcher: fetch }), /cloud_configuration/);
});
void test('cloud workflow uses hosted runners, only the canonical branch, read-only Git and one publisher', () => {
  const workflow = readFileSync(new URL('../.github/workflows/noah-agent-collection.yml', import.meta.url), 'utf8');
  assert.match(workflow, /if: github\.repository == 'iceiceice999\/rock' && github\.ref == 'refs\/heads\/main' && vars\.NOAH_COLLECTION_ACTIVE == 'true'/);
  assert.match(workflow, /runs-on: ubuntu-latest/);
  assert.match(workflow, /contents: read/); assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /group: noah-agent-collection-production/); assert.match(workflow, /cancel-in-progress: false/);
  assert.doesNotMatch(workflow, /self-hosted|upload-artifact|actions\/cache|pull_request_target/);
});

void test('large checkpoints use bounded immutable chunks and a failed upload never replaces committed progress', async () => {
  const store = bucket(); let clock = NOW;
  const api = createCollectorCheckpointApi({ bucket: store, key, now: () => clock });
  const calls = [];
  const request = checkpointClient({ origin: 'https://avoado.si', key, now: () => clock, fetcher: (url, init) => {
    assert.ok(Buffer.byteLength(init.body) < NOAH_CHECKPOINT_CHUNK_CHARS + 1024);
    calls.push(JSON.parse(init.body).action); return api(new Request(url, init));
  } });
  const checkpoint = { ...sample(NOW), sqliteGzip: gzipSync(randomBytes(13 * 1024 * 1024)).toString('base64') };
  assert.ok(checkpoint.sqliteGzip.length > NOAH_CHECKPOINT_BYTES);
  const saved = await request({ action: 'write', etag: null, checkpoint });
  assert.deepEqual((await request({ action: 'read' })).checkpoint, checkpoint);
  const manifest = await (await post(api, { action: 'read' })).json();
  assert.equal(manifest.checkpoint.schema, 'noah-collector-checkpoint/2');
  assert.equal('sqliteGzip' in manifest.checkpoint, false);
  assert.ok(calls.filter(action => action === 'write_chunk').length > 5);
  const changed = { ...manifest.checkpoint, updatedAt: ++clock, chunks: ['a'.repeat(64)] };
  assert.equal((await post(api, { action: 'write', etag: saved.etag, checkpoint: changed }, { time: clock })).status, 409);
  assert.deepEqual((await request({ action: 'read' })).checkpoint, checkpoint);
  assert.equal((await post(api, { action: 'write_chunk', hash: 'a'.repeat(64), data: 'aaaa' }, { time: clock })).status, 400);
  const firstPath = 'noah/collector/v2/chunks/' + manifest.checkpoint.chunks[0];
  store.rows.get(firstPath).body = JSON.stringify({ data: 'aaaa' });
  await assert.rejects(() => request({ action: 'read' }), /cloud_checkpoint_invalid/);
});

void test('checkpoint cleanup retains committed chunks and recent uploads, and cleanup errors do not undo a commit', async () => {
  const store = bucket(), data = 'aaaa', hash = await checkpointChunkHash(data);
  const prefix = 'noah/collector/v2/chunks/', removed = [];
  store.list = async () => ({ objects: [
    { key: prefix + hash, uploaded: new Date(NOW - 8_000_000) },
    { key: prefix + 'old', uploaded: new Date(NOW - 8_000_000) },
    { key: prefix + 'recent', uploaded: new Date(NOW - 1000) },
  ] });
  store.delete = async paths => { removed.push(...paths); };
  const api = createCollectorCheckpointApi({ bucket: store, key, now: () => NOW });
  await post(api, { action: 'write_chunk', hash, data });
  const value = { schema: 'noah-collector-checkpoint/2', updatedAt: NOW - 1, runId: '123', chunks: [hash] };
  const saved = await (await post(api, { action: 'write', etag: null, checkpoint: value })).json();
  assert.deepEqual(removed, [prefix + 'old']);
  store.list = async () => { throw Error('unavailable'); };
  assert.equal((await post(api, { action: 'write', etag: saved.etag, checkpoint: { ...value, updatedAt: NOW } })).status, 200);
});

void test('chunked manifest commits without opening chunk bodies or waiting for cleanup', { timeout: 3000 }, async () => {
  const store = bucket(), prefix = 'noah/collector/v2/chunks/', removed = [];
  const list = Promise.withResolvers(), background = [];
  const get = store.get.bind(store);
  store.get = async path => {
    assert.ok(!path.startsWith(prefix), 'manifest validation should only need chunk metadata');
    return get(path);
  };
  store.list = () => list.promise;
  store.delete = async paths => { removed.push(...paths); };
  const api = createCollectorCheckpointApi({ bucket: store, key, now: () => NOW, waitUntil: work => background.push(work) });
  const hash = await checkpointChunkHash('aaaa');
  await post(api, { action: 'write_chunk', hash, data: 'aaaa' });
  const checkpoint = { schema: 'noah-collector-checkpoint/2', updatedAt: NOW - 1, runId: '123', chunks: [hash] };
  const first = await post(api, { action: 'write', etag: null, checkpoint });
  assert.equal(first.status, 200);
  const { etag } = await first.json();
  assert.deepEqual(await (await post(api, { action: 'read' })).json(), { etag, checkpoint });
  assert.equal(background.length, 1);
  assert.deepEqual(removed, []);

  // A slower cleanup must not delete a chunk that a newer manifest now references.
  const nextHash = await checkpointChunkHash('bbbb');
  await post(api, { action: 'write_chunk', hash: nextHash, data: 'bbbb' });
  store.list = async () => ({ objects: [hash, nextHash, 'orphan'].map(key => ({ key: prefix + key, uploaded: new Date(NOW - 8_000_000) })) });
  const second = await post(api, { action: 'write', etag, checkpoint: { ...checkpoint, updatedAt: NOW, chunks: [nextHash] } });
  assert.equal(second.status, 200);
  await background[1];
  assert.deepEqual(removed, [prefix + 'orphan']);
  list.resolve({ objects: [{ key: prefix + nextHash, uploaded: new Date(NOW - 8_000_000) }] });
  await background[0];
  assert.deepEqual(removed, [prefix + 'orphan']);
});

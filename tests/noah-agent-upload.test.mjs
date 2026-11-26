import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createNoahAgentApi } from '../lib/noah-agent-api.ts';
import { noahAgentStore } from '../lib/noah-agent-store.ts';
import { noahAgentTemplate, parseNoahAgentManifest, aniccaAgent, NOAH_SOURCE_LIMIT, noahSha256 } from '../lib/noah-agent-upload.ts';
import { ownerScopeFor } from '../lib/owner-intent.ts';
import { noahTrainingPlugin, isNoahTrainingPlugin } from '../lib/noah-training-plugin.ts';

const manifest = () => ({ ...noahAgentTemplate, name: 'テストAgent' });

void test('training plugin saves a real owned MCP definition and cannot be substituted or read by another owner', async t => {
  const { api } = fixture(t), id = randomUUID();
  const payload = { id, manifest: noahTrainingPlugin, rightsConfirmed: true };
  assert.equal((await api.create(await request({ method: 'POST', payload }))).status, 201);
  assert.equal((await api.create(await request({ method: 'POST', payload }))).status, 200);
  const { agent } = await (await api.get(await request(), id)).json();
  assert.equal(agent.uploadState, 'ready');
  assert.equal(isNoahTrainingPlugin(agent.manifest), true);
  assert.equal((await api.get(await request({ owner: 'bob' }), id)).status, 404);
  assert.equal((await api.create(await request({ method: 'POST', payload, headers: { Origin: 'https://other.example' } }))).status, 403);
  assert.equal((await api.create(await request({ method: 'POST', payload, headers: { 'X-Rock-Owner-Scope': 'wrong' } }))).status, 409);
  for (const patch of [{ endpointUrl: 'https://other.example/mcp' }, { permissions: ['financial'] }, { id: 'copy-plugin' }, { version: '2.0.0' }])
    assert.equal(isNoahTrainingPlugin({ ...agent.manifest, ...patch }), false);
  assert.equal((await api.list(await request())).status, 200);
  assert.equal((await api.remove(await request({ method: 'DELETE' }), id)).status, 200);
  assert.equal((await api.get(await request(), id)).status, 404);
});
function fixture(t, overrides = {}) {
  const sqlite = new DatabaseSync(':memory:'); sqlite.exec(readFileSync(new URL('../drizzle/0033_noah_agent_uploads.sql', import.meta.url), 'utf8')); sqlite.exec(readFileSync(new URL('../drizzle/0034_noah_upload_refactor.sql', import.meta.url), 'utf8')); t.after(() => sqlite.close());
  const db = { prepare(sql) { return { bind(...args) { return {
    async first() { return sqlite.prepare(sql).get(...args) || null; },
    async all() { return { results: sqlite.prepare(sql).all(...args) }; },
  }; } }; } };
  const blobs = new Map(); let fail = false;
  const bucket = { async put(key, value) { if (fail === true || typeof fail === 'function' && fail(key, value)) throw new Error('storage offline'); blobs.set(key, new Uint8Array(value)); }, async get(key) { const bytes = blobs.get(key); return bytes ? { body: bytes } : null; } };
  const api = createNoahAgentApi({ db, bucket, authenticate: async req => { const owner = req.headers.get('test-owner'); if (!owner) throw new Error('UNAUTHORIZED'); return owner; }, ...overrides });
  return { api, db, blobs, sqlite, fail: value => { fail = value; } };
}
async function request({ owner = 'alice', method = 'GET', payload, form, headers = {}, original = false } = {}) {
  return new Request('https://noah.example.com/api/noah/agents' + (original ? '?variant=original' : ''), { method, headers: {
    ...(owner ? { 'test-owner': owner } : {}), ...(method !== 'GET' ? { Origin: 'https://noah.example.com', 'X-Rock-Owner-Scope': await ownerScopeFor(owner || '') } : {}),
    ...(payload ? { 'Content-Type': 'application/json' } : {}), ...headers,
  }, ...(payload ? { body: JSON.stringify(payload) } : form ? { body: form } : {}) });
}
function sourceForm(id, definition = manifest(), bytes = new Uint8Array([80, 75, 5, 6, ...Array.from({ length: 18 }, () => 0)]), name = 'source.zip') {
  const form = new FormData(); form.set('id', id); form.set('manifest', JSON.stringify(definition)); form.set('rightsConfirmed', 'true'); form.set('source', new File([bytes], name)); return form;
}
void test('manifest supports web, MCP, A2A and pinned local app; rejects executable fields and credential URLs', () => {
  for (const adapter of ['web', 'mcp_http', 'a2a']) assert.equal(parseNoahAgentManifest({ ...manifest(), adapter }).adapter, adapter);
  assert.equal(parseNoahAgentManifest(aniccaAgent).adapter, 'local_app');
  for (const patch of [{ command: 'curl | sh' }, { endpointUrl: 'https://example.com/?token=secret' }, { endpointUrl: 'https://a:b@example.com/' }, { endpointUrl: 'http://localhost:8000' }, { endpointUrl: 'https://127.1' }, { endpointUrl: 'https://host.internal/' }, { adapter: 'local_app' }, { permissions: ['root'] }, { adapter: 'a2a', endpointUrl: 'https://example.com/agent' }])
    assert.throws(() => parseNoahAgentManifest({ ...manifest(), ...patch }));
});
void test('authenticated upload persists and identical retries are idempotent; changed payload is 409', async t => {
  const { api } = fixture(t), id = randomUUID(), payload = { id, manifest: manifest(), rightsConfirmed: true };
  assert.equal((await api.create(await request({ method: 'POST', payload }))).status, 201);
  assert.equal((await api.create(await request({ method: 'POST', payload }))).status, 200);
  assert.equal((await api.create(await request({ method: 'POST', payload: { ...payload, manifest: { ...manifest(), name: 'changed' } } }))).status, 409);
  const list = await (await api.list(await request())).json(); assert.equal(list.agents.length, 1); assert.equal(list.agents[0].manifest.name, 'テストAgent');
  assert.equal(list.agents[0].uploadState, 'ready'); assert.equal(list.ownerScope, await ownerScopeFor('alice'));
});
void test('same slug from different authors cannot overwrite; all reads, delete and downloads are owner isolated', async t => {
  const { api } = fixture(t), id = randomUUID();
  assert.equal((await api.create(await request({ method: 'POST', form: sourceForm(id) }))).status, 201);
  assert.equal((await api.get(await request({ owner: 'bob' }), id)).status, 404);
  assert.equal((await api.download(await request({ owner: 'bob' }), id)).status, 404);
  assert.equal((await api.remove(await request({ owner: 'bob', method: 'DELETE' }), id)).status, 404);
  assert.equal((await (await api.list(await request({ owner: 'bob' }))).json()).agents.length, 0);
  assert.equal((await api.create(await request({ owner: 'bob', method: 'POST', payload: { id: randomUUID(), manifest: manifest(), rightsConfirmed: true } }))).status, 201);
});
void test('mutation rejects missing authentication, cross-origin and changed owner before body or storage', async t => {
  const { api, blobs } = fixture(t), payload = { id: randomUUID(), manifest: manifest(), rightsConfirmed: true };
  assert.equal((await api.create(await request({ owner: null, method: 'POST', payload }))).status, 401);
  assert.equal((await api.create(await request({ method: 'POST', payload, headers: { Origin: 'https://attacker.example.com' } }))).status, 403);
  assert.equal((await api.create(await request({ method: 'POST', payload, headers: { 'X-Rock-Owner-Scope': await ownerScopeFor('bob') } }))).status, 409);
  assert.equal(blobs.size, 0); assert.equal((await (await api.list(await request())).json()).agents.length, 0);
});
void test('private ZIP round trip preserves exact bytes and digest; delete denies future retrieval and resurrection', async t => {
  const { api, blobs } = fixture(t), id = randomUUID(), form = sourceForm(id);
  const saved = await (await api.create(await request({ method: 'POST', form }))).json();
  assert.ok(saved.agent.source.sha256.match(/^[a-f0-9]{64}$/)); assert.equal(JSON.stringify(saved).includes('noah/private'), false);
  const download = await api.download(await request(), id); assert.equal(download.status, 200);
  assert.deepEqual(new Uint8Array(await download.arrayBuffer()), [...blobs.values()][0]);
  assert.match(download.headers.get('content-disposition'), /^attachment/); assert.equal(download.headers.get('x-content-type-options'), 'nosniff');
  assert.equal((await api.remove(await request({ method: 'DELETE' }), id)).status, 200);
  assert.equal((await api.download(await request(), id)).status, 404);
  assert.equal((await api.create(await request({ method: 'POST', form: sourceForm(id) }))).status, 409);
});
void test('R2 failure leaves one owned reservation; identical retry completes it, never falsely ready', async t => {
  const { api, db, fail, blobs } = fixture(t), id = randomUUID(); fail(true);
  assert.equal((await api.create(await request({ method: 'POST', form: sourceForm(id) }))).status, 503);
  assert.equal((await noahAgentStore(db, 'alice').get(id)).uploadState, 'pending');
  assert.equal((await api.download(await request(), id)).status, 404); fail(false);
  assert.equal((await api.create(await request({ method: 'POST', form: sourceForm(id) }))).status, 200);
  assert.equal((await noahAgentStore(db, 'alice').get(id)).uploadState, 'ready'); assert.equal(blobs.size, 1);
});
void test('concurrent identical uploads converge; conflicting upload never overwrites an accepted definition', async t => {
  const { api } = fixture(t), id = randomUUID();
  const results = await Promise.all([api.create(await request({ method: 'POST', form: sourceForm(id) })), api.create(await request({ method: 'POST', form: sourceForm(id) }))]);
  assert.deepEqual(results.map(r => r.status).sort((a, b) => a - b), [200, 201]);
  assert.equal((await api.create(await request({ method: 'POST', form: sourceForm(id, { ...manifest(), version: '2.0.0' }) }))).status, 409);
});
void test('file limit, fake ZIP, malformed manifest and rights failures leave no blobs', async t => {
  const { api, blobs } = fixture(t);
  assert.equal((await api.create(await request({ method: 'POST', form: sourceForm(randomUUID(), manifest(), new Uint8Array(NOAH_SOURCE_LIMIT + 1)) }))).status, 413);
  assert.equal((await api.create(await request({ method: 'POST', form: sourceForm(randomUUID(), manifest(), new TextEncoder().encode('<html>script</html>')) }))).status, 400);
  assert.equal((await api.create(await request({ method: 'POST', payload: { id: randomUUID(), manifest: manifest(), rightsConfirmed: false } }))).status, 400);
  assert.equal((await api.create(await request({ method: 'POST', payload: [] }))).status, 400); assert.equal(blobs.size, 0);
});
void test('account quota includes pending and deleted entries, preventing unbounded private blob writes', async t => {
  const { api, sqlite, blobs } = fixture(t);
  const insert = sqlite.prepare("INSERT INTO noah_agent_uploads (id,owner_id,manifest,manifest_sha256,created_at,deleted_at) VALUES (?,'alice','{}','hash',0,1)");
  for (let n = 0; n < 100; n++) insert.run(randomUUID());
  assert.equal((await api.create(await request({ method: 'POST', form: sourceForm(randomUUID()) }))).status, 409); assert.equal(blobs.size, 0);
});

const sourceCode = 'export function accepts(x) { if (x) { return true; } else { return false; } }\n';
const codePayload = id => ({ id, manifest: manifest(), rightsConfirmed: true, code: { name: 'agent.js', content: sourceCode } });
void test('paste and file use the same refactor; preserve immutable original and same-id retry after result hash changes', async t => {
  const { api, blobs } = fixture(t), id = randomUUID(), fileId = randomUUID();
  const saved = await api.create(await request({ method: 'POST', payload: codePayload(id) })); assert.equal(saved.status, 201);
  const { agent } = await saved.json(); assert.equal(agent.processing.status, 'refactored'); assert.notEqual(agent.original.sha256, agent.source.sha256);
  assert.equal(JSON.stringify(agent).includes('noah/private'), false); assert.equal(agent.processing.validation, 'syntax');
  const original = await api.download(await request({ original: true }), id); assert.equal(await original.text(), sourceCode);
  const processed = await api.download(await request(), id); assert.match(await processed.text(), /return !!\(x\);/); assert.equal(processed.headers.get('x-content-sha256'), agent.source.sha256);
  assert.equal((await api.create(await request({ method: 'POST', payload: codePayload(id) }))).status, 200);
  const fileResult = await api.create(await request({ method: 'POST', form: sourceForm(fileId, manifest(), new TextEncoder().encode(sourceCode), 'agent.js') }));
  assert.equal(fileResult.status, 201); const fileAgent = (await fileResult.json()).agent;
  assert.equal(fileAgent.source.sha256, agent.source.sha256); assert.deepEqual(fileAgent.processing, agent.processing);
  assert.equal(blobs.size, 4);
  const changed = codePayload(id); changed.code.content += '// changed';
  assert.equal((await api.create(await request({ method: 'POST', payload: changed }))).status, 409);
});
void test('result storage failure preserves downloadable original; identical retry finishes without falsely ready state', async t => {
  const { api, fail, blobs } = fixture(t), id = randomUUID(); let writes = 0; fail(() => ++writes === 2);
  assert.equal((await api.create(await request({ method: 'POST', payload: codePayload(id) }))).status, 503);
  const pending = (await (await api.get(await request(), id)).json()).agent;
  assert.equal(pending.uploadState, 'pending'); assert.equal(pending.processing, null); assert.equal(blobs.size, 1);
  assert.equal((await api.download(await request(), id)).status, 404);
  assert.equal(await (await api.download(await request({ original: true }), id)).text(), sourceCode);
  fail(false); assert.equal((await api.create(await request({ method: 'POST', payload: codePayload(id) }))).status, 200);
  assert.equal((await (await api.get(await request(), id)).json()).agent.processing.status, 'refactored'); assert.equal(blobs.size, 2);
});
void test('original, processed code and reports stay owner isolated, and delete blocks both downloads and replay', async t => {
  const { api } = fixture(t), id = randomUUID(); await api.create(await request({ method: 'POST', payload: codePayload(id) }));
  assert.equal((await api.get(await request({ owner: 'bob' }), id)).status, 404);
  for (const original of [true, false]) assert.equal((await api.download(await request({ owner: 'bob', original }), id)).status, 404);
  assert.equal((await api.remove(await request({ method: 'DELETE' }), id)).status, 200);
  for (const original of [true, false]) assert.equal((await api.download(await request({ original }), id)).status, 404);
  assert.equal((await api.create(await request({ method: 'POST', payload: codePayload(id) }))).status, 409);
});
void test('invalid or unsupported code is preserved with truthful status; client cannot assert validation', async t => {
  const { api } = fixture(t);
  for (const [name, content, status] of [['agent.js', 'function broken(', 'failed'], ['agent.py', 'print(42)', 'unsupported'], ['agent.js', 'export const x = 42;', 'unchanged']]) {
    const id = randomUUID(), payload = { ...codePayload(id), code: { name, content } };
    const response = await api.create(await request({ method: 'POST', payload })); assert.equal(response.status, 201);
    const agent = (await response.json()).agent; assert.equal(agent.processing.status, status); assert.equal(agent.original.sha256, agent.source.sha256);
    assert.equal(await (await api.download(await request(), id)).text(), content);
  }
  for (const patch of [{ processing: { status: 'refactored' } }, { code: { name: '../agent.js', content: sourceCode } }, { code: { name: '.env', content: 'KEY=value' } }, { code: { name: 'agent.js', content: sourceCode, validated: true } }])
    assert.equal((await api.create(await request({ method: 'POST', payload: { ...codePayload(randomUUID()), ...patch } }))).status, 400);
  assert.equal((await api.create(await request({ method: 'POST', payload: { ...codePayload(randomUUID()), code: { name: 'agent.js', content: 'あ'.repeat(22000) } } }))).status, 413);
});
void test('concurrent refactor requests converge to one immutable input and one output', async t => {
  const { api, blobs } = fixture(t), id = randomUUID();
  const responses = await Promise.all([api.create(await request({ method: 'POST', payload: codePayload(id) })), api.create(await request({ method: 'POST', payload: codePayload(id) }))]);
  assert.deepEqual(responses.map(r => r.status).sort((a,b) => a-b), [200,201]);
  const [a,b] = await Promise.all(responses.map(r => r.json())); assert.deepEqual(a.agent, b.agent); assert.equal(blobs.size, 2);
});

void test('verified upload resolves host receipt against immutable original; keeps both variants and exact retry', async t => {
  const original = new TextEncoder().encode('def add(a,b): return a+b\n'), revised = new TextEncoder().encode('def add(a, b):\n    return a + b\n');
  let calls = 0;
  const { api } = fixture(t, { resolveProcessing: async (_request, receipt, expected) => {
    calls++; assert.equal(receipt.id, expected.id); assert.equal(expected.name, 'agent.py'); assert.equal(expected.user, 'alice');
    assert.equal(expected.sha256, await noahSha256(original));
    return { bytes: revised, report: { engine: 'noah-project-refactor/1', status: 'refactored', validation: 'fixed_tests', message: 'fixture host receipt', changes: [], originalSha256: expected.sha256, sourceSha256: await noahSha256(revised) } };
  } });
  const id = randomUUID(), form = sourceForm(id, { ...manifest(), adapter: 'source', endpointUrl: null }, original, 'agent.py');
  form.set('processingReceipt', JSON.stringify({ id, token: 'a'.repeat(64) }));
  const response = await api.create(await request({ method: 'POST', form })); assert.equal(response.status, 201);
  const saved = (await response.json()).agent; assert.equal(saved.processing.validation, 'fixed_tests'); assert.equal(saved.source.sha256, await noahSha256(revised));
  assert.deepEqual(new Uint8Array(await (await api.download(await request({ original: true }), id)).arrayBuffer()), original);
  assert.deepEqual(new Uint8Array(await (await api.download(await request(), id)).arrayBuffer()), revised);
  assert.equal((await api.create(await request({ method: 'POST', form }))).status, 200); assert.equal(calls, 1);
});

void test('browser cannot supply test results; absent resolver, wrong receipt identity and tampered original fail', async t => {
  const id = randomUUID(); const { api } = fixture(t);
  for (const reference of [{ id: randomUUID(), token: 'a'.repeat(64) }, { id, token: 'a'.repeat(64), passed: true }]) {
    const form = sourceForm(id); form.set('processingReceipt', JSON.stringify(reference));
    assert.equal((await api.create(await request({ method: 'POST', form }))).status, 400);
  }
  const form = sourceForm(id); form.set('processingReceipt', JSON.stringify({ id, token: 'a'.repeat(64) }));
  assert.equal((await api.create(await request({ method: 'POST', form }))).status, 503);
  assert.equal((await (await api.list(await request())).json()).agents.length, 0);
});

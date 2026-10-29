import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { catalog } from '../lib/catalog.ts';
import { skyAgentLibraryStore, bindSkyAgentLlmInput } from '../lib/sky-agent-library-store.ts';
import { defaultSkyAgentSettings, parseSkyAgentSettings, skyAgentEvePath, skyAgentSystem } from '../lib/sky-agent-library.ts';
import { readZemaChatSessions, saveZemaChatSession } from '../lib/zema-chat-session.ts';

function fixture(t) {
  const sqlite = new DatabaseSync(':memory:'); t.after(() => sqlite.close());
  for (const file of readdirSync(new URL('../drizzle/', import.meta.url)).filter(f => f.endsWith('.sql')).sort())
    sqlite.exec(readFileSync(new URL(`../drizzle/${file}`, import.meta.url), 'utf8'));
  const db = { prepare(sql) { return { bind(...args) { return {
    async first() { return sqlite.prepare(sql).get(...args) ?? null; },
    async all() { return { results: sqlite.prepare(sql).all(...args) }; },
    async run() { return { meta: { changes: Number(sqlite.prepare(sql).run(...args).changes) } }; },
  }; } }; } };
  return { sqlite, db, store: skyAgentLibraryStore(db, 'fixture-owner') };
}
const settings = () => defaultSkyAgentSettings('文章担当', '読者に伝わる短い文章へ整える');

void test('settings validate complete fields, bounded Unicode text, provider and model identifiers', () => {
  assert.equal(parseSkyAgentSettings({ ...settings(), instructions: '文'.repeat(1200) }).instructions.length, 1200);
  for (const patch of [{ instructions: '文'.repeat(1201) }, { provider: 'unknown' }, { model: 'model?api_key=secret' }, { name: '\0' }, { owner: 'another' }])
    assert.throws(() => parseSkyAgentSettings({ ...settings(), ...patch }));
});
void test('own library persists across store readers and is isolated by owner', async t => {
  const { db, store } = fixture(t); const id = randomUUID();
  const saved = await store.save(id, 0, settings(), true);
  assert.equal(saved.revision, 1);
  assert.deepEqual(await skyAgentLibraryStore(db, 'fixture-owner').get(id), saved);
  assert.equal(await skyAgentLibraryStore(db, 'another-owner').get(id), null);
  await assert.rejects(skyAgentLibraryStore(db, 'another-owner').save(id, 1, settings()), { status: 404 });
});
void test('concurrent edits permit exactly one revision and preserve winner on retry', async t => {
  const { store } = fixture(t); const a = await store.save(randomUUID(), 0, settings(), true);
  const edits = await Promise.allSettled([store.save(a.id, 1, { ...settings(), name: 'first' }), store.save(a.id, 1, { ...settings(), name: 'second' })]);
  assert.equal(edits.filter(e => e.status === 'fulfilled').length, 1);
  assert.equal((await store.get(a.id)).revision, 2);
});
void test('connected catalog Tools appear without fake imports and disappear when disconnected', async t => {
  const { store, sqlite } = fixture(t); const tool = catalog[0];
  sqlite.prepare('INSERT INTO sky_connections(user_id,tool,scope,consent_version,connected_at) VALUES(?,?,?,?,?)').run('fixture-owner', tool.id, 'fixture', 'fixture', 1000);
  const agent = await store.get(`tool:${tool.id}`); assert.equal(agent.sourceTool, tool.id); assert.equal(agent.revision, 0);
  await store.save(agent.id, 0, { ...settings(), name: '自分の担当' });
  const path = new URL(skyAgentEvePath(await store.get(agent.id)), 'https://fixture.invalid');
  assert.equal(path.searchParams.get('tool'), tool.id); assert.equal(path.searchParams.get('agentRevision'), '1');
  assert.equal(path.searchParams.has('instructions'), false);
  sqlite.prepare('DELETE FROM sky_connections WHERE user_id=?').run('fixture-owner');
  assert.equal(await store.get(agent.id), null);
});
void test('inference binding rejects stale, disabled, other-owner and mismatched model requests', async t => {
  const { store, db } = fixture(t); const a = await store.save(randomUUID(), 0, settings(), true);
  const input = { agentId: a.id, agentRevision: a.revision, provider: a.provider, model: a.model, prompt: 'fixture', system: 'client-forged', baseUrl: 'http://localhost:9999' };
  const bound = await bindSkyAgentLlmInput(db, 'fixture-owner', input);
  assert.equal(bound.system, skyAgentSystem(a)); assert.equal(bound.baseUrl, undefined);
  for (const patch of [{ agentRevision: 0 }, { model: 'other' }, { provider: 'openai' }])
    await assert.rejects(bindSkyAgentLlmInput(db, 'fixture-owner', { ...input, ...patch }), { status: 409 });
  await assert.rejects(bindSkyAgentLlmInput(db, 'another-owner', input), { status: 404 });
  await store.save(a.id, 1, { ...settings(), enabled: false });
  await assert.rejects(bindSkyAgentLlmInput(db, 'fixture-owner', { ...input, agentRevision: 2 }), { status: 409 });
});
void test('normal Eve requests remain unchanged; agent metadata survives existing bounded chat history', async t => {
  const { db } = fixture(t); const input = { provider: 'local-model', prompt: 'fixture' };
  assert.equal(await bindSkyAgentLlmInput(db, 'fixture-owner', input), input);
  let raw = null; const storage = { getItem: () => raw, setItem: (_, v) => { raw = v; }, removeItem: () => { raw = null; } };
  const session = { version: 1, id: randomUUID(), toolId: 'mr-citations', agent: { id: randomUUID(), revision: 1 }, createdAt: 1000, messages: [], activeRequest: null, workflowStatus: 'ready', outcome: null };
  saveZemaChatSession(session, storage, 1001); assert.deepEqual(readZemaChatSessions(storage, 1002)[0], session);
  assert.throws(() => saveZemaChatSession({ ...session, agent: { id: 'invalid?', revision: -1 } }, storage, 1003));
});

void test('Wallet and Market are optional per owner and removal preserves other records', async t => {
  const { db, sqlite, store } = fixture(t);
  const { skyFeatureStore } = await import('../lib/sky-feature-additions.ts');
  const features = skyFeatureStore(db, 'fixture-owner');
  assert.equal((await features.list()).some(f => f.enabled), false);
  const agent = await store.save(randomUUID(), 0, settings(), true);
  await features.save({ id: 'wallet', purpose: 'records', enabled: true, revision: 0 });
  assert.equal((await features.list()).find(f => f.id === 'wallet').enabled, true);
  assert.equal((await skyFeatureStore(db, 'another-owner').list()).some(f => f.enabled), false);
  const otherRecords = () => Number(sqlite.prepare('SELECT COUNT(*) AS n FROM sky_agent_settings').get().n);
  assert.equal(otherRecords(), 1);
  await features.save({ id: 'wallet', purpose: 'earnings', enabled: false, revision: 1 });
  assert.equal((await features.list()).find(f => f.id === 'wallet').enabled, false);
  assert.equal((await store.get(agent.id)).revision, 1); assert.equal(otherRecords(), 1);
  assert.equal((await features.list()).find(f => f.id === 'market').revision, 0);
});
void test('optional feature settings reject unknown grants and concurrent stale revisions', async t => {
  const { db } = fixture(t); const { skyFeatureStore } = await import('../lib/sky-feature-additions.ts');
  const features = skyFeatureStore(db, 'fixture-owner');
  const input = { id: 'market', purpose: 'explore', enabled: true, revision: 0 };
  for (const patch of [{ id: 'root' }, { purpose: 'LIVE' }, { revision: -1 }, { approved: true }])
    await assert.rejects(features.save({ ...input, ...patch }), { status: 400 });
  const results = await Promise.allSettled([features.save(input), features.save(input)]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal((await features.list()).find(f => f.id === 'market').revision, 1);
});

void test('legacy object attachment coexists with requirements and survives old editor, owner and revision boundaries', async t => {
  const { sqlite, db, store } = fixture(t), id = randomUUID();
  const attachment = { schema: 'sky.object-attachment/1', objectName: '合成の対象', input: 'sensor', output: 'signal' };
  const requirements = { inputFields: ['value'], outputFields: ['summary'], packageKey: 'dev.fixture.tool@1.0.0', executionTarget: 'pc',
    contract: { schema: 'rockstaros.agent-tool-expectation/1', capabilityIds: ['fixture:read'], allowedPermissions: [] } };
  const old = { ...settings(), provider: 'openai', model: 'fixture-model-v2', attachment };
  // Historical local records were written before main understood attachment.
  sqlite.prepare('INSERT INTO sky_agent_settings(owner_user_id,id,source_tool,settings,revision,created_at,updated_at) VALUES(?,?,?,?,?,?,?)')
    .run('fixture-owner', id, null, JSON.stringify(old), 1, 1, 1);
  assert.deepEqual((await store.list())[0].attachment, attachment);
  assert.equal(await skyAgentLibraryStore(db, 'another-owner').get(id), null);
  const adopted = await store.save(id, 1, { ...old, requirements });
  assert.equal(adopted.revision, 2); assert.deepEqual(adopted.attachment, attachment); assert.deepEqual(adopted.requirements, requirements);
  const legacy = { name: '編集後', instructions: '編集した指示', provider: old.provider, model: old.model, enabled: true };
  const saved = await store.save(id, 2, legacy);
  assert.equal(saved.id, id); assert.equal(saved.revision, 3); assert.equal(saved.provider, old.provider); assert.equal(saved.model, old.model);
  assert.deepEqual(saved.attachment, attachment); assert.deepEqual(saved.requirements, requirements);
  await assert.rejects(store.save(id, 2, legacy), { status: 409 });
  await assert.rejects(skyAgentLibraryStore(db, 'another-owner').save(id, 3, legacy), { status: 404 });
  assert.deepEqual(await store.get(id), saved);
  for (const bad of [{ ...attachment, executionAuthorized: true }, { ...attachment, grant: true },
    { ...attachment, schema: 'sky.object-attachment/2' }, { ...attachment, input: 'root' }]) {
    await assert.rejects(store.save(id, 3, { ...legacy, attachment: bad }), { status: 400 });
  }
  assert.equal((await store.get(id)).revision, 3);
});

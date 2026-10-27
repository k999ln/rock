import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { catalog } from '../lib/catalog.ts';
import { skyAgentLibraryStore, bindSkyAgentLlmInput } from '../lib/sky-agent-library-store.ts';
import { skyAgentEvePath } from '../lib/sky-agent-library.ts';
import { saveZemaChatSession, readZemaChatSessions, ZEMA_CHAT_SESSION_KEY, ZEMA_CHAT_SESSION_TTL_MS } from '../lib/zema-chat-session.ts';

const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
function storage() {
  const values = new Map();
  return { getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, v), removeItem: k => values.delete(k) };
}
const row = agent => ({ version: 1, id, toolId: 'mr-citations', createdAt: 1000, messages: [], activeRequest: null, workflowStatus: 'ready', outcome: null, ...(agent ? { agent } : {}) });
function database(t) {
  const sql = new DatabaseSync(':memory:'); t.after(() => sql.close());
  for (const file of readdirSync(new URL('../drizzle/', import.meta.url)).filter(f => f.endsWith('.sql')).sort())
    sql.exec(readFileSync(new URL(`../drizzle/${file}`, import.meta.url), 'utf8'));
  const db = { prepare(query) { return { bind(...args) { return {
    async all() { return { results: sql.prepare(query).all(...args) }; },
    async run() { return { meta: { changes: Number(sql.prepare(query).run(...args).changes) } }; },
  }; } }; } };
  return { sql, db };
}

void test('connected built-in Agent producer references survive session save and restore at revisions zero and one', async t => {
  const { sql, db } = database(t), owner = 'fixture-owner', store = skyAgentLibraryStore(db, owner);
  sql.prepare('INSERT INTO sky_connections(user_id,tool,scope,consent_version,connected_at) VALUES(?,?,?,?,?)').run(owner, 'mr-citations', 'fixture', 'fixture', 1000);
  let agent = await store.get('tool:mr-citations');
  assert.equal(agent.revision, 0);
  for (const revision of [0, 1]) {
    if (revision) agent = await store.save(agent.id, 0, { name: agent.name, instructions: agent.instructions, provider: agent.provider, model: agent.model, enabled: true });
    const link = new URL(skyAgentEvePath(agent), 'https://fixture.invalid');
    const reference = { id: link.searchParams.get('agent'), revision: Number(link.searchParams.get('agentRevision')) };
    assert.deepEqual(reference, { id: agent.id, revision });
    const s = storage(), saved = row(reference);
    saveZemaChatSession(saved, s, 1001);
    assert.deepEqual(readZemaChatSessions(s, 1002), [saved]);
  }
});

void test('only exact current catalog Tool references extend the unchanged UUID session grammar', () => {
  for (const tool of catalog) {
    const s = storage(), saved = row({ id: `tool:${tool.id}`, revision: 0 });
    saveZemaChatSession(saved, s, 1001);
    assert.deepEqual(readZemaChatSessions(s, 1002)[0].agent, saved.agent);
  }
  for (const agent of [undefined, { id, revision: 0 }, { id, revision: 7 }]) {
    const s = storage(), saved = row(agent);
    saveZemaChatSession(saved, s, 1001);
    assert.deepEqual(readZemaChatSessions(s, 1002), [saved]);
  }
});

void test('unknown, malformed, overlong and cross-kind Agent references cannot replace valid saved state', () => {
  const badIds = ['tool:not-a-real-catalog-tool', 'tool:', 'mr-citations', `tool:${id}`, `agent:${id}`, 'Tool:mr-citations', 'tool:MR-CITATIONS', 'tool:mr-citations ', ' tool:mr-citations', 'tool:mr-citations/other', 'tool:mr-citations?x=1', 'tool:mr-citations\u0000', 'tool:' + 'x'.repeat(120), '', null, 1];
  const invalid = badIds.map(id => ({ id, revision: 0 }));
  for (const revision of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '0', null, undefined]) invalid.push({ id: 'tool:mr-citations', revision });
  invalid.push(null, [], 'tool:mr-citations');
  for (const agent of invalid) {
    const s = storage(), good = row({ id, revision: 1 });
    saveZemaChatSession(good, s, 1001); const before = s.getItem(ZEMA_CHAT_SESSION_KEY);
    const bad = { ...row(), agent };
    assert.throws(() => saveZemaChatSession(bad, s, 1002), /状態を確認/);
    assert.equal(s.getItem(ZEMA_CHAT_SESSION_KEY), before);
    s.setItem(ZEMA_CHAT_SESSION_KEY, JSON.stringify([good, { ...bad, id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' }]));
    assert.deepEqual(readZemaChatSessions(s, 1003), [good]);
  }
  const s = storage();
  assert.throws(() => saveZemaChatSession({ ...row({ id: 'tool:mr-citations', revision: 0 }), id: 'tool:mr-citations' }, s, 1001));
});

void test('Tool Agent reference preserves expiry and never grants another owner, disabled, stale or disconnected execution', async t => {
  const { sql, db } = database(t), owner = 'fixture-owner', store = skyAgentLibraryStore(db, owner);
  sql.prepare('INSERT INTO sky_connections(user_id,tool,scope,consent_version,connected_at) VALUES(?,?,?,?,?)').run(owner, 'mr-citations', 'fixture', 'fixture', 1000);
  const a = await store.get('tool:mr-citations');
  const input = { agentId: a.id, agentRevision: a.revision, provider: a.provider, model: a.model };
  const s = storage(), saved = row({ id: a.id, revision: a.revision });
  saveZemaChatSession(saved, s, 1001);
  await assert.rejects(bindSkyAgentLlmInput(db, 'other-owner', input), { status: 404 });
  const settings = { name: a.name, instructions: a.instructions, provider: a.provider, model: a.model, enabled: true };
  await store.save(a.id, 0, settings);
  await assert.rejects(bindSkyAgentLlmInput(db, owner, input), { status: 409 });
  await store.save(a.id, 1, { ...settings, enabled: false });
  await assert.rejects(bindSkyAgentLlmInput(db, owner, { ...input, agentRevision: 2 }), { status: 409 });
  sql.prepare('DELETE FROM sky_connections WHERE user_id=?').run(owner);
  await assert.rejects(bindSkyAgentLlmInput(db, owner, input), { status: 404 });
  assert.deepEqual(readZemaChatSessions(s, 1002), [saved], 'history is passive metadata, not a current grant');
  assert.deepEqual(readZemaChatSessions(s, 1000 + ZEMA_CHAT_SESSION_TTL_MS + 1), []);
});

void test('legacy UUID effective grammar and revision boundaries remain unchanged', () => {
  const cases = [
    [id, true], ['a'.repeat(36), true],
    ['-' + 'a'.repeat(35), false], ['-'.repeat(36), false],
    ['a'.repeat(35), false], ['a'.repeat(37), false],
    [id.toUpperCase(), false], ['g' + 'a'.repeat(35), false],
    ['a' + '-'.repeat(35), true], ['a'.repeat(35) + '.', false],
  ];
  for (const [agentId, accepted] of cases) {
    for (const revision of [0, 1, Number.MAX_SAFE_INTEGER, -1, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
      const shouldAccept = accepted && [0, 1, Number.MAX_SAFE_INTEGER].includes(revision);
      const s = storage(), saved = row({ id: agentId, revision });
      if (shouldAccept) {
        saveZemaChatSession(saved, s, 1001);
        assert.deepEqual(readZemaChatSessions(s, 1002), [saved]);
      } else {
        assert.throws(() => saveZemaChatSession(saved, s, 1001), undefined, `${agentId}/${revision}`);
        s.setItem(ZEMA_CHAT_SESSION_KEY, JSON.stringify([saved]));
        assert.deepEqual(readZemaChatSessions(s, 1002), [], `${agentId}/${revision}`);
      }
    }
  }
});

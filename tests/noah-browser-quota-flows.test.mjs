import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { createNoahBrowserSessions } from '../lib/noah-browser-session.ts';
import { ownerScopeFor } from '../lib/owner-intent.ts';
import { NOAH_BROWSER_DAILY, NOAH_BROWSER_QUOTA_MESSAGE, noahQuotaWindow } from '../lib/noah-browser-quota.ts';

// task 129 の D1・抜け道 S1 の、本物の入口での確かめ: ブラウザだけの本人を全員まとめた 1 日の上限に達したら、
// 新しい接続・依頼・コードの取り込み・下書きのファイルは 429 で断り、相手へも R2 へも送らない。サインインした本人は数えない。
const ORIGIN = 'https://noah.test';
const keyset = () => ({ active: 'a', keys: { a: randomBytes(32).toString('hex') } });
// 本番と同じ表（アカウントの回数表）を、0028 の文のまま作る。
const accountTable = /CREATE TABLE IF NOT EXISTS `rockstar_account_rate_limits` \([^;]+\);/.exec(readFileSync(new URL('../drizzle/0028_rockstar_accounts.sql', import.meta.url), 'utf8'))[0];
const fill = (sql, kind, used, now) => sql.prepare('INSERT INTO rockstar_account_rate_limits(request_key,window,attempts) VALUES(?,?,?)').run(`noah-quota:${kind}`, noahQuotaWindow(now), used);

void test('上限に達した日は、ブラウザだけの本人の新しい接続と依頼を 429 で断り、相手へ送らない', async t => {
  const { world, familyId, hostOf, uuid, NOW } = await (async () => ({ ...(await import('./fixtures/noah/connect-world.mjs')), NOW: (await import('./fixtures/noah/intake.mjs')).NOW }))();
  const { mcpServer, tool } = await import('./fixtures/noah/mcp-server.mjs');
  const { createNoahConnectApi } = await import('../lib/noah-connect.ts');
  const { createNoahConnectPlanApi } = await import('../lib/noah-connect-plan-api.ts');
  const { createNoahAskApi } = await import('../lib/noah-ask.ts');
  const { noahToolSha256 } = await import('../lib/noah-form.ts');
  const definition = tool('lookup', true, { description: 'Find a result', inputSchema: { type: 'object', properties: {}, required: [] } });
  const server = mcpServer({ tools: [definition], call: () => ({ content: [{ type: 'text', text: 'Quota fixture' }] }) });
  const w = await world(t, { [hostOf(1)]: server, [hostOf(2)]: mcpServer({ tools: [definition], call: () => ({ content: [{ type: 'text', text: 'Quota fixture' }] }) }) });
  w.f.sql.exec(accountTable);
  const sessions = createNoahBrowserSessions(keyset()), seed = new Request(`${ORIGIN}/api/noah/session`);
  const cookie = (await sessions.issue(seed)).split(';')[0];
  const owner = await sessions.authenticate(new Request(seed, { headers: { Cookie: cookie } })), scope = await ownerScopeFor(owner);
  const deps = { ...w.as(null).deps, authenticate: sessions.authenticate, waitUntil: () => {} };
  const connect = createNoahConnectApi(deps), plan = createNoahConnectPlanApi(deps), ask = createNoahAskApi(deps);
  const send = async (fn, path, body) => {
    const r = await fn(new Request(`${ORIGIN}${path}`, { method: body ? 'POST' : 'GET', headers: { Cookie: cookie, Origin: ORIGIN, 'Content-Type': 'application/json', 'X-Rock-Owner-Scope': scope }, ...(body ? { body: JSON.stringify(body) } : {}) }));
    return { status: r.status, body: await r.json() };
  };
  // 1 本目の接続は通る（上限の 1 手前）。
  const now = deps.now?.() ?? NOW;
  fill(w.f.sql, 'connections', NOAH_BROWSER_DAILY.connections - 1, now);
  const planned = await send(plan, `/api/noah/connect-plan?agent=${encodeURIComponent(familyId(1))}`);
  const first = await send(connect.collection, '/api/noah/connect', { id: uuid(1), agentId: familyId(1), planSha256: planned.body.planSha256 });
  assert.equal(first.status, 200);
  assert.equal(first.body.state, 'connected');
  // 2 本目は、上限に達しているので断る。行も作らず、相手へも握手しない。
  const before = server.log.length + w.servers[hostOf(2)].log.length;
  const planned2 = await send(plan, `/api/noah/connect-plan?agent=${encodeURIComponent(familyId(2))}`);
  const second = await send(connect.collection, '/api/noah/connect', { id: uuid(3), agentId: familyId(2), planSha256: planned2.body.planSha256 });
  assert.equal(second.status, 429);
  assert.equal(second.body.error, NOAH_BROWSER_QUOTA_MESSAGE);
  assert.equal(w.rows('id=?', uuid(3)).length, 0);
  assert.equal(w.servers[hostOf(2)].log.length + server.log.length, before, '相手へ送らない');
  // 依頼も、上限に達した日は断る。Work も依頼の行も作らない。
  fill(w.f.sql, 'asks', NOAH_BROWSER_DAILY.asks, now);
  const toolSha256 = await noahToolSha256({ name: definition.name, description: definition.description, inputSchema: definition.inputSchema, readOnly: true });
  const refused = await send(ask.collection, '/api/noah/ask', { id: uuid(2), connectionId: uuid(1), form: { tool: definition.name, toolSha256, input: {} }, screen: 'narrow' });
  assert.equal(refused.status, 429);
  assert.equal(refused.body.error, NOAH_BROWSER_QUOTA_MESSAGE);
  assert.equal(w.asked().length, 0);
});

void test('上限に達した日は、ブラウザだけの本人のコードの取り込みと下書きのファイルを 429 で断る。サインインした本人は通す', async t => {
  const { createNoahAgentApi } = await import('../lib/noah-agent-api.ts');
  const { createNoahDraftStorage } = await import('../lib/noah-draft-storage.ts');
  const sql = new DatabaseSync(':memory:');
  t.after(() => sql.close());
  const { applySourceSandboxSchema } = await import('../scripts/sky-monthly-sandbox-db.mjs');
  applySourceSandboxSchema(sql);
  const db = { prepare(query) { return { bind(...args) { return {
    async first() { return sql.prepare(query).get(...args) ?? null; },
    async all() { return { results: sql.prepare(query).all(...args) }; },
    async run() { return { meta: { changes: Number(sql.prepare(query).run(...args).changes) } }; },
  }; } }; } };
  const browser = 'noah-browser:' + 'c'.repeat(64);
  const now = Date.now();
  fill(sql, 'imports', NOAH_BROWSER_DAILY.imports, now);
  fill(sql, 'draftObjects', NOAH_BROWSER_DAILY.draftObjects, now);
  const fetched = [];
  const api = createNoahAgentApi({ db, fetcher: async (url) => { fetched.push(url); return new Response('not found', { status: 404 }); }, authenticate: async r => r.headers.get('test-owner') ?? (() => { throw Error('UNAUTHORIZED'); })() });
  const importAs = async user => api.importSource(new Request(`${ORIGIN}/api/noah/import`, { method: 'POST', headers: { 'test-owner': user, Origin: ORIGIN, 'X-Rock-Owner-Scope': await ownerScopeFor(user), 'Content-Type': 'application/json' }, body: JSON.stringify({ url: 'https://github.com/example/agent', rightsConfirmed: true }) }));
  const refused = await importAs(browser);
  assert.equal(refused.status, 429);
  assert.equal((await refused.json()).error, NOAH_BROWSER_QUOTA_MESSAGE);
  assert.deepEqual(fetched, [], 'GitHub へ取りに行かない');
  await importAs('chatgpt-user-1');
  assert.ok(fetched.length > 0, 'サインインした本人は、上限に数えずに取りに行く');
  const puts = [];
  const bucket = { async get() { return null; }, async put(key) { puts.push(key); return {}; } };
  const storage = createNoahDraftStorage(db, bucket, () => now);
  const bytes = new TextEncoder().encode('export const agent = true;\n');
  const draft = '7cb31446-8023-4ee4-92fd-e88760e55970';
  await assert.rejects(() => storage.write(browser, draft, 'source', 'd'.repeat(64), bytes), e => e.status === 429 && e.message === NOAH_BROWSER_QUOTA_MESSAGE);
  assert.deepEqual(puts, [], 'R2 へ置かない');
  assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM noah_draft_objects").get().n, 0);
  await storage.write('chatgpt-user-1', draft, 'source', 'd'.repeat(64), bytes);
  assert.equal(puts.length, 1, 'サインインした本人は置ける');
});

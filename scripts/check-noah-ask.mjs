// 頼む（MVP L6）の受入。つなぐ → 道具の一覧 → 入力欄から頼む → 成果を読む → 止める → 切る を、入口（API の関数）から通す。
// 表は、手元の D1（Miniflare の中だけ。終わると消える）。本番の D1・配備・切り替えには触らない。
// 台帳も接続先も、この script の中の合成の物。外へは通信しない。
// 実在の相手へ頼む受入は、この script では行わない（実在の道具を、機械に選ばせて呼ばない）。
// 実在の相手での確かめは、手元の app から、人が道具を選んで行う（docs/noah/spec-87-tool-agent.md の 11.8）。
// --trace: 最初の依頼（成果が出た物）で、D1 へ送った文を、受け付けと実行に分けて、順に出す（往復を減らす時の、元の数字）。
// 仕様: docs/noah/spec-87-tool-agent.md の 11.3・11.4・11.6。
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { createNoahAskApi, createNoahAskService, NOAH_ASK_MESSAGES } from '../lib/noah-ask.ts';
import { NOAH_ASK_STOP_MESSAGES } from '../lib/noah-ask-store.ts';
import { createNoahConnectApi } from '../lib/noah-connect.ts';
import { createNoahConnectPlanApi } from '../lib/noah-connect-plan-api.ts';
import { createIntakeTick } from '../lib/noah-intake-api.ts';
import { createIntakeStore } from '../lib/noah-intake-store.ts';
import { parseNoahFlags } from '../lib/noah-flags.ts';
import { NOAH_HOST_BUSY } from '../lib/noah-form.ts';
import { noahWakeSignature } from '../lib/noah-intake-wake.ts';
import { NOAH_REMOTE_TEMPLATE } from '../lib/noah-remote-work.ts';
import { ownerScopeFor } from '../lib/owner-intent.ts';
import { normalizeWorkJob } from '../lib/workflow.ts';
import { mcpServer, tool } from '../tests/fixtures/noah/mcp-server.mjs';
import { official } from './check-noah-probe.mjs';

const REGISTRY = 'registry.modelcontextprotocol.io';
const ORIGIN = 'https://noah.test';
const ELSEWHERE = 'elsewhere.example.org';
const OPEN = { NOAH_PATROL_ENABLED: 'true', NOAH_INTAKE_PUBLIC: 'true', NOAH_ASK_FORM: 'true' };
const familyOf = (name) => `mcp-registry:${name}`;
const callsOf = (server) => server.log.filter((request) => request.rpc === 'tools/call');

/** 読み取りだけで、入力が 1 つ要る道具／入力の要らない道具／読み取りだけと宣言していない道具／入力欄にできない道具。 */
const lookup = (extra = {}) => tool('lookup', true, { description: 'Looks up a player.', inputSchema: { type: 'object', required: ['query'], properties: { query: { type: 'string', maxLength: 200 }, limit: { type: 'integer' } } }, ...extra });
const stats = () => tool('stats');
const publish = () => tool('publish', null, { description: 'Publishes a note.', inputSchema: { type: 'object', required: ['text'], properties: { text: { type: 'string' } } } });
const nested = () => tool('configure', true, { inputSchema: { type: 'object', required: ['o'], properties: { o: { type: 'object' } } } });
const echo = (params) => ({ content: [{ type: 'text', text: `${params.name}: ${JSON.stringify(params.arguments)}` }] });
const onCall = (status) => (body) => (body?.method === 'tools/call' ? status : undefined);

/**
 * 合成の台帳と接続先。握手は、どれも通る（一覧に載る）。道具を呼んだ時の答えが、相手ごとに決まっている。
 * wrap は、道具の呼び出しにだけ、合成のサーバーが返せない形（決まった形のエラー・読めない応答）で答える。
 */
function synthetic(started) {
  const answer = (make) => (server) => async (url, init) => {
    const body = init?.body ? JSON.parse(init.body) : null;
    if (body?.method !== 'tools/call') return server.fetch(url, init);
    server.log.push({ url: String(url), method: init.method, rpc: body.method, headers: Object.fromEntries(new Headers(init.headers)), body });
    return make(body);
  };
  const kinds = {
    main: { server: mcpServer({ tools: [lookup(), stats(), publish(), nested()], call: echo }) },
    sse: { server: mcpServer({ tools: [lookup()], call: echo, sse: true, noise: true }) },
    session: { server: mcpServer({ tools: [lookup()], call: echo, session: 'synthetic-session' }) },
    toolError: { server: mcpServer({ tools: [lookup()], call: () => ({ isError: true, content: [{ type: 'text', text: `Player not found. ${'x'.repeat(400)}` }] }) }) },
    structured: { server: mcpServer({ tools: [lookup()], call: () => ({ structuredContent: { players: [{ id: 1, name: 'A' }] }, content: [] }) }) },
    large: { server: mcpServer({ tools: [lookup()], call: () => ({ content: [{ type: 'text', text: 'y'.repeat(140_000) }] }) }) },
    rpcError: { server: mcpServer({ tools: [lookup()] }), wrap: answer((body) => Response.json({ jsonrpc: '2.0', id: body.id, error: { code: -32602, message: `query must be a UUID ${'z'.repeat(300)}` } })) },
    unreadable: { server: mcpServer({ tools: [lookup()] }), wrap: answer(() => new Response('<html>not an answer</html>', { status: 200, headers: { 'content-type': 'application/json' } })) },
    forbidden: { server: mcpServer({ tools: [lookup()], status: onCall(403) }) },
    down: { server: mcpServer({ tools: [lookup()], status: onCall(503) }) },
    redirect: { server: mcpServer({ tools: [lookup()], status: onCall(307), statusHeaders: { location: `https://${ELSEWHERE}/mcp` } }) },
    crowded: { server: mcpServer({ tools: [lookup()], call: echo, status: onCall(429), statusHeaders: { 'retry-after': '120' } }) },
    auth: { server: mcpServer({ tools: [lookup()], status: onCall(401) }) },
    payment: { server: mcpServer({ tools: [lookup()], status: onCall(402) }) },
    gone: { server: mcpServer({ tools: [lookup()], call: echo }) },
    limits: { server: mcpServer({ tools: [lookup()], call: echo }) },
    slots: { server: mcpServer({ tools: [lookup()], call: echo }) },
  };
  const routes = {}, hosts = [], records = [];
  for (const [index, [key, kind]] of Object.entries(kinds).entries()) {
    const host = `agent-${index}.example.com`, name = `fixture.provider/agent-${index}`;
    Object.assign(kind, { key, host, family: familyOf(name) });
    routes[host] = kind.wrap ? kind.wrap(kind.server) : kind.server.fetch;
    records.push({ server: { name, version: '1.0.0', remotes: [{ type: 'streamable-http', url: `https://${host}/mcp` }] }, _meta: official(started) });
  }
  const agents = async (url, init) => {
    const { hostname } = new URL(String(url));
    hosts.push(hostname);
    if (!routes[hostname]) throw new TypeError('fetch failed');
    return routes[hostname](url, init);
  };
  return { kinds, records, agents, hosts };
}

export async function checkNoahAsk(options = { trace: false }) {
  const mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script: 'export default { fetch() { return new Response("local ask acceptance"); } };', compatibilityDate: '2026-10-01', d1Databases: { DB: 'noah-ask-local-acceptance' } }));
  try {
    const d1 = await mf.getD1Database('DB');
    for (const file of ['0043_noah_runner', '0044_noah_intake', '0047_noah_connections', '0048_noah_asks', '0049_noah_connections_connecting']) for (const sql of readFileSync(new URL(`../drizzle/${file}.sql`, import.meta.url), 'utf8').split('--> statement-breakpoint').filter((part) => /CREATE/.test(part))) await d1.prepare(sql).run();
    // 成果の正本（Work）の表。大きな migration（0021）から、その表を作る文だけを、そのまま取り出して流す。
    await d1.prepare(/CREATE TABLE IF NOT EXISTS `work_jobs` \([^;]+\);/.exec(readFileSync(new URL('../drizzle/0021_sites_schema_convergence.sql', import.meta.url), 'utf8'))[0]).run();
    // D1 への往復（1 文の実行か、1 回の batch）を、文と一緒に、順に残す。
    const trips = [];
    const counted = (statement, sql) => new Proxy(statement, { get: (target, name) => {
      if (name === 'bind') return (...args) => counted(target.bind(...args), sql);
      if (['first', 'all', 'run', 'raw'].includes(name)) return (...args) => { trips.push(sql); return target[name](...args); };
      if (name === '__statement') return target;
      return Reflect.get(target, name);
    } });
    const db = { prepare: (sql) => counted(d1.prepare(sql), sql), batch: (statements) => { trips.push('BATCH'); return d1.batch(statements.map((statement) => statement.__statement)); } };
    const one = (sql, ...args) => d1.prepare(sql).bind(...args).first();
    const many = async (sql, ...args) => (await d1.prepare(sql).bind(...args).all()).results;

    const started = Date.now(), key = 'local-acceptance-wake-'.repeat(3);
    const world = synthetic(started), { kinds } = world;
    // 時計。巡回の間は、実際に流れた時間を足す。その後は、止めて、手で進める。
    let logical = started, turnStart = started, frozen = false, user = 'acceptance-owner-a';
    const advance = (ms) => { logical += ms; };
    const pending = [];
    const drain = async () => { while (pending.length) await Promise.allSettled(pending.splice(0)); };
    const base = {
      db, now: () => (frozen ? logical : logical + Date.now() - turnStart), authenticate: async () => user, reviewers: [], wakeKey: key,
      // 応答の後に続ける仕事（道具の呼び出し・セッションを閉じる要求）を、預かる。
      waitUntil: (work) => { pending.push(work); },
      fetcher: async (input, init) => {
        const url = new URL(String(input));
        if (url.hostname !== REGISTRY) return world.agents(input, init);
        if (url.searchParams.has('updated_since')) return Response.json({ servers: [], metadata: {} });
        const offset = Number(url.searchParams.get('cursor') ?? 0);
        return Response.json({ servers: world.records.slice(offset, offset + 100), metadata: { nextCursor: offset + 100 < world.records.length ? String(offset + 100) : null } });
      },
    };
    const deps = { ...base, flags: parseNoahFlags(OPEN) };

    // 1. 台帳を読み、巡回の握手で、載せる。
    const tick = createIntakeTick(deps), quiet = console.info;
    console.info = () => {};
    let wakes = 0;
    try {
      for (let idle = 0; wakes < 30 && idle < 2;) {
        turnStart = Date.now(); logical = started + wakes * 60_000; wakes++;
        const timestamp = String(deps.now());
        const response = await tick(new Request(`${ORIGIN}/api/noah/intake/tick`, { method: 'POST', body: '{}', headers: { 'x-noah-time': timestamp, 'x-noah-signature': await noahWakeSignature(key, timestamp) } }));
        const result = await response.json();
        assert.equal(response.status, 200, JSON.stringify(result));
        idle = result.probe?.probes ? 0 : idle + 1;
      }
    } finally { console.info = quiet; }
    logical = started + wakes * 60_000; frozen = true;
    const store = createIntakeStore(deps);
    const listedNow = async () => {
      const ids = [];
      for (let cursor = ''; ;) {
        const page = await store.list(null, new URLSearchParams(cursor ? { cursor } : {}));
        ids.push(...page.items.map((item) => item.id));
        if (!page.nextCursor) return ids;
        cursor = page.nextCursor;
      }
    };
    const listedBefore = await listedNow();
    assert.equal(listedBefore.length, Object.keys(kinds).length, '合成の相手は、どれも握手が通って、一覧に載る');

    // 入口。apis は、切り替えの違う入口を作る（同じ表・同じ相手）。
    const apis = (flags) => { const d = { ...base, flags }; return { connect: createNoahConnectApi(d), plan: createNoahConnectPlanApi(d), ask: createNoahAskApi(d), service: createNoahAskService(d) }; };
    const open = apis(deps.flags);
    const send = async (handler, method, path, body) => {
      const before = trips.length;
      const response = await handler(new Request(ORIGIN + path, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }), headers: method === 'GET' ? {} : { Origin: ORIGIN, 'Content-Type': 'application/json', 'X-Rock-Owner-Scope': await ownerScopeFor(user) } }));
      return { status: response.status, body: await response.json(), spent: trips.slice(before) };
    };
    const brief = ({ status, body }) => [status, body.state ?? body.ask?.state ?? null, body.error ?? null];
    const counts = { accept: [], run: [], runConfirm: [], get: [], list: [], stop: [] };
    const told = { asks: [], connections: [], owners: new Set([user]) };

    /** 計画を読んで、つなぎ、道具の一覧を開く。1 人が続けてつなげるのは 60 秒に 10 件までなので、1 件ごとに時計を 7 秒進める。 */
    const connect = async (kind, api = open) => {
      advance(7_000);
      const plan = await send(api.plan, 'GET', `/api/noah/connect-plan?agent=${encodeURIComponent(kind.family)}`);
      assert.equal(plan.status, 200, JSON.stringify(plan.body));
      const id = randomUUID();
      const made = await send(api.connect.collection, 'POST', '/api/noah/connect', { id, agentId: kind.family, planSha256: plan.body.planSha256 });
      await drain();
      assert.deepEqual([made.status, made.body.state], [200, 'connected'], `${kind.key}: ${JSON.stringify(made.body)}`);
      told.connections.push(id);
      return { id, kind, revision: made.body.revision, tools: new Map() };
    };
    const openTools = async (connection, api = open) => {
      advance(7_000);
      const tools = await send((request) => api.connect.tools(request, connection.id), 'GET', `/api/noah/connect/${connection.id}/tools`);
      await drain();
      if (tools.status === 200) connection.tools = new Map(tools.body.tools.map((item) => [item.name, item]));
      return tools;
    };
    /** 入力欄を開いた時に画面が受け取る値（道具の名前と、その定義の hash）で、頼む本文を作る。 */
    const form = (connection, name, input, extra = {}) => ({ tool: name, toolSha256: connection.tools.get(name).sha256, input, ...extra });
    /** 頼む。応答の後に続く仕事（道具の呼び出し）が終わるのを待ってから、返す。1 人が続けて頼めるのは 60 秒に 10 回までなので、既定では、1 件ごとに時計を 7 秒進める。 */
    const ask = async (connection, body, { api = open, id = randomUUID(), step = 7_000, screen = 'narrow' } = {}) => {
      advance(step);
      const response = await send(api.ask.collection, 'POST', '/api/noah/ask', { id, connectionId: connection.id, form: body, screen });
      await drain();
      return { ...response, id };
    };
    const rowOf = (id) => one('SELECT * FROM noah_asks WHERE id=?', id);
    const workOf = async (workId) => { const row = await one('SELECT payload FROM work_jobs WHERE id=?', workId); return row ? normalizeWorkJob(JSON.parse(row.payload)) : null; };
    /** 頼んで、終わった行と Work を読む。D1 への往復を、受け付け（応答まで）と、実行（応答の後。行を取る文から）に分けて数える。 */
    const asked = async (connection, body, options) => {
      const before = trips.length;
      const response = await ask(connection, body, options);
      const spent = trips.slice(before), split = spent.findIndex((sql) => sql.startsWith("UPDATE noah_asks SET state='running'"));
      const row = await rowOf(response.id);
      if (row) told.asks.push(row.id);
      return { ...response, row, job: row ? await workOf(row.work_id) : null, accept: split < 0 ? spent.length : split, run: split < 0 ? 0 : spent.length - split, spent, split };
    };

    // 2. つなぐ・道具の一覧（合成の相手ごとに 1 つ。接続先の枠と上限の所で使う相手は、後でつなぐ）。
    const connections = {};
    for (const kind of Object.values(kinds)) {
      if (['limits', 'slots'].includes(kind.key)) continue;
      connections[kind.key] = await connect(kind);
      assert.equal((await openTools(connections[kind.key])).status, 200, kind.key);
    }
    const main = connections.main, server = kinds.main.server;
    assert.deepEqual([...main.tools.values()].map((item) => [item.name, item.usable, item.readOnly, item.required, item.needsConfirm]),
      [['lookup', true, true, 1, false], ['stats', true, true, 0, false], ['publish', true, false, 1, true], ['configure', false, true, 0, false]]);
    for (const kind of Object.values(kinds)) assert.equal(callsOf(kind.server).length, 0, 'つなぐ・道具の一覧では、道具を呼ばない');

    // 3. 一周: 202 がすぐ返る → 誰も読まなくても、Work に成果が入る → 読む。
    const first = await asked(main, form(main, 'lookup', { query: 'cobalt', limit: '3' }));
    assert.deepEqual([first.status, first.body.state, first.body.mode, first.body.revision], [202, 'queued', 'form', 1]);
    assert.deepEqual([first.row.state, first.row.mode, first.row.host, first.row.tool, first.row.screen, first.row.tool_calls, first.row.error, first.row.stop_requested, first.row.lease_until, first.row.finished_at !== null],
      ['succeeded', 'form', kinds.main.host, 'lookup', 'narrow', 1, null, 0, 0, true]);
    assert.deepEqual(callsOf(server).map((request) => request.body.params), [{ name: 'lookup', arguments: { query: 'cobalt', limit: 3 } }]);
    assert.deepEqual([first.job.templateId, first.job.status, first.job.steps.map((item) => item.passed), first.job.noahRemote.state, first.job.noahRemote.verification, first.job.noahRemote.chargeMinor, first.job.noahRemote.toolCalls],
      [NOAH_REMOTE_TEMPLATE, 'review', [false], 'returned', 'relay_observed_unverified', 0, 1]);
    assert.deepEqual(first.job.noahRemote.result, { text: 'lookup: {"query":"cobalt","limit":3}', truncated: false, attachments: 0 });
    counts.accept.push(first.accept); counts.run.push(first.run);
    const brief80 = (sql) => sql.replace(/\s+/g, ' ').slice(0, 80);
    const trace = options.trace ? { accept: first.spent.slice(0, first.split).map(brief80), run: first.spent.slice(first.split).map(brief80) } : null;
    const read = await send((request) => open.ask.item(request, first.id), 'GET', `/api/noah/ask/${first.id}`);
    assert.deepEqual([read.status, read.body.state, read.body.result, read.body.note], [200, 'succeeded', first.job.noahRemote.result, `${kinds.main.host} の lookup が返した内容です。費用 0。`]);
    counts.get.push(read.spent.length);
    const listed = await send(open.ask.collection, 'GET', `/api/noah/ask?connection=${main.id}`);
    assert.deepEqual([listed.status, listed.body.asks.map((item) => [item.id, item.state, 'result' in item])], [200, [[first.id, 'succeeded', false]]]);
    counts.list.push(listed.spent.length);
    // 動かした系列は「動いた」になる。接続の版は、変わらない（画面が持っている版で、切れる）。
    const family = (kind) => one('SELECT listed,level,badge_hint FROM noah_intake_families WHERE id=?', kind.family);
    assert.deepEqual(await family(kinds.main), { listed: 1, level: 2, badge_hint: 'one_click' });
    assert.equal((await one('SELECT revision FROM noah_connections WHERE id=?', main.id)).revision, main.revision);

    // 4. 同じ操作 ID の再送は、今の状態を返す（もう 1 回は呼ばない）。中身が違えば、断る。
    const again = await ask(main, form(main, 'lookup', { query: 'cobalt', limit: '3' }), { id: first.id });
    assert.deepEqual([again.status, again.body.state, again.body.workId, again.body.result], [200, 'succeeded', first.body.workId, first.job.noahRemote.result]);
    assert.deepEqual(brief(await ask(main, form(main, 'lookup', { query: 'other' }), { id: first.id })), [409, null, NOAH_ASK_MESSAGES.changedRequest]);
    assert.equal(callsOf(server).length, 1);

    // 5. 押すだけの道具。入力の検査（どれも、相手へ道具を呼ばない）。入力欄にできない道具。
    const tap = await asked(main, form(main, 'stats', {}));
    assert.deepEqual([tap.row.state, tap.job.noahRemote.result.text], ['succeeded', 'stats: {}']);
    counts.accept.push(tap.accept); counts.run.push(tap.run);
    for (const [input, message] of [[{}, 'query を入れてください。'], [{ query: 'x', admin: true }, '入力欄に無い項目です。'], [{ query: 'x'.repeat(201) }, 'query は 200 文字までです。']]) {
      const refused = await asked(main, form(main, 'lookup', input));
      assert.deepEqual([refused.status, refused.row.state, refused.row.error, refused.row.tool_calls, refused.job.noahRemote.state], [202, 'failed', message, 0, 'failed']);
    }
    const unusable = await asked(main, form(main, 'configure', { o: {} }));
    assert.deepEqual([unusable.row.state, unusable.row.error], ['failed', NOAH_ASK_MESSAGES.toolUnusable]);
    assert.equal(callsOf(server).length, 2);

    // 6. 読み取りだけと宣言されていない道具: 最初の 1 回は、画面で確かめてから。確かめた記録は、名前と定義の hash の組。
    const unconfirmed = await asked(main, form(main, 'publish', { text: 'hello' }));
    assert.deepEqual([unconfirmed.row.state, unconfirmed.row.error, callsOf(server).length], ['failed', NOAH_ASK_MESSAGES.needsConfirm, 2]);
    const confirmed = await asked(main, form(main, 'publish', { text: 'hello' }, { confirm: true }));
    assert.deepEqual([confirmed.row.state, callsOf(server).length], ['succeeded', 3]);
    counts.runConfirm.push(confirmed.run);
    const remembered = await asked(main, form(main, 'publish', { text: 'again' }));
    assert.deepEqual([remembered.row.state, callsOf(server).length], ['succeeded', 4]);
    const kept = await one('SELECT confirmed_tools_json,revision FROM noah_connections WHERE id=?', main.id);
    assert.deepEqual([JSON.parse(kept.confirmed_tools_json), kept.revision], [[{ name: 'publish', sha256: main.tools.get('publish').sha256 }], main.revision]);
    assert.equal((await openTools(main)).body.tools.find((item) => item.name === 'publish').needsConfirm, false);

    // 7. 入力欄を開いた後に、その道具の定義が変わったら、呼ばない。
    const seen = form(main, 'lookup', { query: 'x' });
    server.state.tools = [lookup({ description: 'Looks up a player. Also deletes it.' }), stats(), publish(), nested()];
    const changed = await asked(main, seen);
    assert.deepEqual([changed.row.state, changed.row.error, callsOf(server).length], ['failed', NOAH_ASK_MESSAGES.toolChanged, 4]);
    server.state.tools = [lookup(), stats(), publish(), nested()];

    // 8. 相手の答えが、依頼の結果を決める。どの相手にも、道具を呼ぶのは 1 回だけ（失敗しても、呼び直さない）。
    const outcomes = [
      ['sse', 'succeeded', (row, job) => row.error === null && job.noahRemote.result.text === 'lookup: {"query":"q"}'],
      ['session', 'succeeded', (row) => row.error === null],
      ['toolError', 'failed', (row) => Array.from(row.error).length === 240 && row.error.startsWith('Player not found. x')],
      ['structured', 'succeeded', (row, job) => JSON.stringify(JSON.parse(job.noahRemote.result.text)) === '{"players":[{"id":1,"name":"A"}]}'],
      ['large', 'succeeded', (row, job) => job.noahRemote.result.truncated === true && job.noahRemote.result.text.endsWith('（長いので切りました）') && new TextEncoder().encode(job.noahRemote.result.text).byteLength <= 131_072],
      ['rpcError', 'failed', (row) => row.error.startsWith(`${NOAH_ASK_MESSAGES.rejectedInput} query must be a UUID z`) && Array.from(row.error).length <= NOAH_ASK_MESSAGES.rejectedInput.length + 201],
      ['unreadable', 'unknown', (row) => row.error === NOAH_ASK_MESSAGES.unknown],
      ['forbidden', 'failed', (row) => row.error === NOAH_ASK_MESSAGES.refusedCall],
      ['down', 'unknown', (row) => row.error === NOAH_ASK_MESSAGES.unknown],
      ['redirect', 'failed', (row) => row.error === 'この接続先にはつなげません。'],
      ['crowded', 'failed', (row) => row.error === '相手のサーバーが混んでいます。少し待ってから試してください。'],
      ['auth', 'failed', (row) => row.error === 'この Agent は、相手の許可が要るようになりました。まだ対応していません。'],
      ['payment', 'failed', (row) => row.error === 'この Agent は、呼ぶたびの支払いが要るようになりました。まだ対応していません。'],
    ];
    for (const [name, state, check] of outcomes) {
      const connection = connections[name], result = await asked(connection, form(connection, 'lookup', { query: 'q' }));
      assert.deepEqual([result.status, result.row.state, check(result.row, result.job)], [202, state, true], `${String(name)}: ${String(result.row.error)}`);
      assert.deepEqual([callsOf(kinds[name].server).length, result.row.tool_calls], [1, 1], name);
      assert.deepEqual([result.job.status, result.job.noahRemote.state, result.job.noahRemote.result !== undefined], ['review', state === 'succeeded' ? 'returned' : state, state === 'succeeded'], name);
      // 成果が出た時だけ、「動いた」になる。相手の許可・支払いが要るようになった物は、握手が通った物でもなくなる。
      assert.equal((await family(kinds[name])).level, state === 'succeeded' ? 2 : ['auth', 'payment'].includes(name) ? 0 : 1, name);
      if (state === 'succeeded') counts.run.push(result.run);
    }
    // セッションを使う相手には、終わった後に、閉じる要求を 1 回送る。
    assert.equal(kinds.session.server.log.at(-1).method, 'DELETE');
    // 相手の許可・支払いが要るようになった 2 件だけが、一覧から外れる。
    const unlisted = listedBefore.filter((id) => !new Set([kinds.auth.family, kinds.payment.family]).has(id));
    assert.deepEqual((await listedNow()).sort((a, b) => a.localeCompare(b)), unlisted.sort((a, b) => a.localeCompare(b)));
    // 「混んでいる」と返した相手へは、言われた時刻（120 秒）まで、送らずに断る。行も Work も増えない。
    const rowsBefore = (await one('SELECT COUNT(*) AS n FROM noah_asks')).n, crowdedLog = kinds.crowded.server.log.length;
    kinds.crowded.server.options.status = undefined;
    assert.deepEqual(brief(await ask(connections.crowded, form(connections.crowded, 'lookup', { query: 'q' }), { step: 60_000 })), [429, null, NOAH_HOST_BUSY]);
    assert.deepEqual([(await one('SELECT COUNT(*) AS n FROM noah_asks')).n, (await one('SELECT COUNT(*) AS n FROM work_jobs')).n, kinds.crowded.server.log.length], [rowsBefore, rowsBefore, crowdedLog]);
    const recovered = await asked(connections.crowded, form(connections.crowded, 'lookup', { query: 'q' }), { step: 61_000 });
    assert.equal(recovered.row.state, 'succeeded');
    // つないだ後に、相手が握手に答えなくなった: 道具を呼ばずに、失敗で終わる。
    kinds.gone.server.options.status = (body) => (body?.method === 'initialize' ? 503 : undefined);
    const silent = await asked(connections.gone, form(connections.gone, 'lookup', { query: 'q' }));
    assert.deepEqual([silent.row.state, silent.row.error, silent.row.tool_calls, callsOf(kinds.gone.server).length], ['failed', '相手のサーバーが応答しません。時間をおいて試してください。', 0, 0]);

    // 9. 止める。まだ始まっていない依頼は、その場で止まる（相手へは、何も送らない）。
    /** 受け付けるだけで、実行の場を動かさない（入口は、受け付けと同時に実行を始めるので、「まだ始まっていない依頼」は、ここからしか作れない）。 */
    const queue = async (connection, body, { service = open.service, step = 7_000 } = {}) => {
      advance(step);
      const id = randomUUID();
      const accepted = await service.ask(user, false, { id, connectionId: connection.id, ...body, confirm: false, screen: null });
      told.asks.push(id);
      return { ...accepted, id };
    };
    const stop = (id, revision) => send((request) => open.ask.item(request, id), 'POST', `/api/noah/ask/${id}`, { action: 'stop', revision });
    const waiting = await queue(main, form(main, 'lookup', { query: 'q' }));
    assert.equal(waiting.status, 202);
    const mainLog = server.log.length;
    assert.deepEqual(brief(await stop(waiting.id, 2)), [409, 'queued', NOAH_ASK_MESSAGES.stale]);
    const stopped = await stop(waiting.id, 1);
    assert.deepEqual([stopped.status, stopped.body.state, stopped.body.error, stopped.body.stopRequested], [200, 'stopped', undefined, false]);
    counts.stop.push(stopped.spent.length);
    const stoppedJob = await workOf(waiting.body.workId);
    assert.deepEqual([stoppedJob.status, stoppedJob.noahRemote.state, stoppedJob.noahRemote.error], ['cancelled', 'cancelled', NOAH_ASK_STOP_MESSAGES.stopped]);
    await waiting.run();
    await drain();
    assert.deepEqual([server.log.length, (await rowOf(waiting.id)).state], [mainLog, 'stopped']);
    assert.deepEqual(brief(await stop(waiting.id, stopped.body.revision)), [409, 'stopped', NOAH_ASK_MESSAGES.finished]);
    // 相手へ送った後に止める: 止める事を頼む（まだ「止めました」ではない）。届いた成果は、採らない。
    let during = null;
    const lateId = randomUUID();
    server.options.before = async (body) => { if (body?.method === 'tools/call') during = await stop(lateId, (await rowOf(lateId)).revision); };
    const late = await asked(main, form(main, 'lookup', { query: 'q' }), { id: lateId });
    server.options.before = undefined;
    assert.deepEqual([during.status, during.body.state, during.body.stopRequested], [200, 'running', true]);
    assert.deepEqual([late.row.state, late.row.error, late.row.tool_calls, late.job.status, late.job.noahRemote.state, late.job.noahRemote.result], ['stopped', NOAH_ASK_STOP_MESSAGES.stoppedAfterCall, 1, 'cancelled', 'cancelled', undefined]);
    // 握手の間に止めた時は、道具を呼ばない。
    const callsBefore = callsOf(server).length, earlyId = randomUUID();
    server.options.before = async (body) => { if (body?.method === 'tools/list') await stop(earlyId, (await rowOf(earlyId)).revision); };
    const early = await asked(main, form(main, 'lookup', { query: 'q' }), { id: earlyId });
    server.options.before = undefined;
    assert.deepEqual([early.row.state, early.row.error, early.row.tool_calls, callsOf(server).length], ['stopped', null, 0, callsBefore]);

    // 10. 切る: その接続の、終わっていない依頼が止まる。切った接続では、頼めない。
    const held = await queue(main, form(main, 'lookup', { query: 'q' }));
    const cut = async () => {
      const current = await one('SELECT state,revision FROM noah_connections WHERE id=?', main.id);
      if (current.state !== 'connected') return null;
      const gone = await send((request) => open.connect.item(request, main.id), 'POST', `/api/noah/connect/${main.id}`, { action: 'disconnect', revision: current.revision });
      assert.deepEqual([gone.status, gone.body.state], [200, 'disconnected']);
      return gone;
    };
    let cutTrips = null;
    server.options.before = async (body) => { if (body?.method === 'tools/list') { const gone = await cut(); if (gone) cutTrips = gone.spent.length; } };
    const interrupted = await asked(main, form(main, 'lookup', { query: 'q' }));
    server.options.before = undefined;
    assert.deepEqual([(await rowOf(held.id)).state, (await rowOf(held.id)).error, interrupted.row.state, interrupted.row.error, callsOf(server).length], ['stopped', NOAH_ASK_STOP_MESSAGES.cut, 'stopped', null, callsBefore]);
    assert.equal((await workOf(held.body.workId)).status, 'cancelled');
    await held.run();
    await drain();
    assert.equal(callsOf(server).length, callsBefore);
    const hostsBefore = world.hosts.length;
    assert.deepEqual(brief(await ask(main, form(main, 'lookup', { query: 'q' }))), [409, null, '接続を確かめてください。']);
    assert.equal(world.hosts.length, hostsBefore);

    // 11. 頼む前の上限。越えた時は、Work も行も作らず、相手へも送らない。
    advance(120_000);
    const limits = await connect(kinds.limits);
    assert.equal((await openTools(limits)).status, 200);
    const lookupForm = (connection) => form(connection, 'lookup', { query: 'q' });
    const fast = { step: 100 };
    // 終わっていない依頼は、8 件まで。
    const open8 = [];
    for (let n = 0; n < 8; n++) { open8.push(await queue(limits, lookupForm(limits), fast)); assert.equal(open8[n].status, 202); }
    const before9 = [(await one('SELECT COUNT(*) AS n FROM noah_asks')).n, kinds.limits.server.log.length];
    assert.deepEqual(brief(await ask(limits, lookupForm(limits), fast)), [409, null, NOAH_ASK_MESSAGES.full]);
    assert.deepEqual([(await one('SELECT COUNT(*) AS n FROM noah_asks')).n, (await one('SELECT COUNT(*) AS n FROM work_jobs')).n, kinds.limits.server.log.length], [before9[0], before9[0], before9[1]]);
    for (const accepted of open8) { await accepted.run(); await drain(); }
    assert.deepEqual((await many("SELECT DISTINCT state FROM noah_asks WHERE connection_id=?", limits.id)).map((row) => row.state), ['succeeded']);
    // 1 人は、直近 60 秒に 10 回まで。
    for (let n = 0; n < 2; n++) assert.equal((await asked(limits, lookupForm(limits), fast)).row.state, 'succeeded');
    assert.deepEqual(brief(await ask(limits, lookupForm(limits), fast)), [429, null, '続けて頼みすぎています。少し待ってから試してください。']);
    // 1 つの接続先へは、全員合わせて、直近 60 秒に 30 回まで（別の本人が、同じ相手へ頼む）。
    const others = {};
    for (const name of ['acceptance-owner-b', 'acceptance-owner-c', 'acceptance-owner-d']) {
      user = name; told.owners.add(name);
      others[name] = await connect(kinds.limits);
      others[name].tools = limits.tools;
      if (name === 'acceptance-owner-d') break;
      for (let n = 0; n < 10; n++) assert.equal((await asked(others[name], lookupForm(limits), fast)).row.state, 'succeeded');
    }
    const before31 = [(await one('SELECT COUNT(*) AS n FROM noah_asks')).n, kinds.limits.server.log.length];
    assert.deepEqual(brief(await ask(others['acceptance-owner-d'], lookupForm(limits), fast)), [429, null, NOAH_HOST_BUSY]);
    assert.deepEqual([(await one('SELECT COUNT(*) AS n FROM noah_asks')).n, (await one('SELECT COUNT(*) AS n FROM work_jobs')).n, kinds.limits.server.log.length], [before31[0], before31[0], before31[1]]);
    // 60 秒たてば、また頼める。
    assert.equal((await asked(others['acceptance-owner-d'], lookupForm(limits), { step: 61_000 })).row.state, 'succeeded');

    // 他人の依頼は、読めない・止められない・一覧に出ない。他人の接続では、頼めない。
    assert.deepEqual(brief(await send((request) => open.ask.item(request, first.id), 'GET', `/api/noah/ask/${first.id}`)), [404, null, NOAH_ASK_MESSAGES.missing]);
    assert.deepEqual(brief(await stop(first.id, first.row.revision)), [404, null, NOAH_ASK_MESSAGES.missing]);
    assert.deepEqual((await send(open.ask.collection, 'GET', `/api/noah/ask?connection=${limits.id}`)).body.asks, []);
    assert.deepEqual(brief(await ask(limits, lookupForm(limits))), [404, null, '接続が見つかりません。']);
    user = 'acceptance-owner-a';

    // 接続先の枠（接続・道具の一覧・依頼の握手を合わせて数える。ここでは 4 に絞る）。枠が無い時は、行も Work も増えず、相手へも送らない。
    advance(120_000);
    const tight = apis(parseNoahFlags({ ...OPEN, NOAH_ASK_LIMITS: JSON.stringify({ hostHandshakes: 4 }) }));
    const slots = await connect(kinds.slots, tight);
    assert.equal((await openTools(slots, tight)).status, 200);
    for (let n = 0; n < 2; n++) assert.equal((await asked(slots, lookupForm(slots), { api: tight, step: 100 })).row.state, 'succeeded');
    const shakes = kinds.slots.server.log.filter((request) => request.rpc === 'initialize').length, rowsNow = (await one('SELECT COUNT(*) AS n FROM noah_asks')).n;
    assert.deepEqual(brief(await ask(slots, lookupForm(slots), { api: tight, step: 100 })), [429, null, NOAH_HOST_BUSY]);
    assert.deepEqual([kinds.slots.server.log.filter((request) => request.rpc === 'initialize').length, (await one('SELECT COUNT(*) AS n FROM noah_asks')).n], [shakes, rowsNow]);

    // 12. 切り替えが閉じている間: 新しい依頼は 503（相手へ送らない）。読む事は、できる。
    advance(120_000);
    const closed = apis(parseNoahFlags({ NOAH_PATROL_ENABLED: 'true', NOAH_INTAKE_PUBLIC: 'true' }));
    const sentBefore = world.hosts.length;
    assert.deepEqual(brief(await ask(limits, lookupForm(limits), { api: closed })), [503, null, NOAH_ASK_MESSAGES.closed]);
    assert.equal(world.hosts.length, sentBefore);
    assert.equal((await send((request) => closed.ask.item(request, first.id), 'GET', `/api/noah/ask/${first.id}`)).body.state, 'succeeded');

    // 13. 終わった後の表: 依頼と Work が 1 対 1。終わっていない物が無い。状態が、Work と合っている。呼んだ回数が、相手の受けた回数と合っている。
    await drain();
    const rows = await many('SELECT a.id,a.owner_id,a.work_id,a.state,a.tool_calls,a.finished_at,a.lease_until,w.payload FROM noah_asks a LEFT JOIN work_jobs w ON w.id=a.work_id AND w.user_id=a.owner_id');
    const works = (await one('SELECT COUNT(*) AS n FROM work_jobs')).n;
    assert.equal(rows.length, works, '依頼と Work は、1 対 1');
    const pairs = { succeeded: ['review', 'returned'], failed: ['review', 'failed'], unknown: ['review', 'unknown'], stopped: ['cancelled', 'cancelled'] };
    for (const row of rows) {
      assert.ok(row.payload, 'Work の無い依頼が無い');
      const job = normalizeWorkJob(JSON.parse(row.payload));
      assert.deepEqual([job.templateId, job.status, job.noahRemote.state, job.noahRemote.chargeMinor, job.noahRemote.verification, job.noahRemote.toolCalls, row.finished_at !== null, row.lease_until],
        [NOAH_REMOTE_TEMPLATE, ...pairs[row.state], 0, 'relay_observed_unverified', row.tool_calls, true, 0], row.id);
      assert.equal(job.noahRemote.result !== undefined, row.state === 'succeeded', row.id);
    }
    const tally = Object.fromEntries((await many('SELECT state, COUNT(*) AS n FROM noah_asks GROUP BY state ORDER BY state')).map((row) => [row.state, row.n]));
    const received = Object.values(kinds).reduce((total, kind) => total + callsOf(kind.server).length, 0);
    assert.equal(received, rows.reduce((total, row) => total + row.tool_calls, 0), '道具を呼んだ回数は、相手が受けた回数と同じ（呼び直していない）');
    // 相手へ送った物: 本人・依頼・接続・Work を指す値が、header にも本文にも無い。別の host へは、1 回も送っていない。
    const sent = JSON.stringify(Object.values(kinds).map((kind) => kind.server.log));
    const scopes = await Promise.all([...told.owners].map((name) => ownerScopeFor(name)));
    const secrets = [...told.owners, ...scopes, ...scopes.map((scope) => scope.split(':')[1]), ...told.connections, ...rows.map((row) => row.id), ...rows.map((row) => row.work_id), 'cookie', 'x-rock-owner-scope', 'authorization', 'narrow'];
    for (const leak of secrets) assert.equal(sent.includes(leak), false, `相手へ送った物に、${String(leak)} が入っている`);
    assert.equal(world.hosts.filter((name) => name === ELSEWHERE).length, 0, '別の接続先への転送に従わない');
    // 人の操作から始めた要求は Noah/1、巡回は NoahBot/1 と名乗る。
    assert.deepEqual([...new Set(Object.values(kinds).flatMap((kind) => kind.server.log.map((request) => String(request.headers['user-agent']).split(' ')[0])))].sort((a, b) => a.localeCompare(b)), ['Noah/1', 'NoahBot/1']);
    assert.equal((await one('SELECT COUNT(*) AS n FROM noah_runner_commands')).n, 0, '家の端末への命令は、1 件も増えない');

    const range = (values) => (values.length ? { min: Math.min(...values), max: Math.max(...values) } : null);
    const summary = {
      mode: 'synthetic/local-D1', wakes, providers: Object.keys(kinds).length, listedBefore: listedBefore.length, listedAfter: (await listedNow()).length,
      asks: tally, works, toolCalls: received, ran: (await one('SELECT COUNT(*) AS n FROM noah_intake_families WHERE level=2')).n,
      d1RoundTrips: { accept: range(counts.accept), run: range(counts.run), runWithConfirm: range(counts.runConfirm), get: range(counts.get), list: range(counts.list), stop: range(counts.stop), disconnectWithOpenAsks: cutTrips },
      ...(trace ? { trace } : {}), durationMs: Date.now() - started,
    };
    console.log(JSON.stringify(summary, null, 2));
    return summary;
  } finally { await mf.dispose(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== '--trace')) throw Error('使い方: check-noah-ask.mjs [--trace]。表は、いつも手元の、終わると消える物。相手は、いつも合成の物');
  await checkNoahAsk({ trace: args.includes('--trace') });
}

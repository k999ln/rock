// つなぐ（MVP L5）の受入。計画を読む → 接続 → 道具の一覧 → 切る を、入口（API の関数）から通す。
// 表は、手元の D1（Miniflare の中だけ。終わると消える）。本番の D1・配備・切り替えには触らない。
// 既定: 台帳も接続先も、この script の中の合成の物。外へは通信しない。
// --live: 接続先は実在の物。握手（initialize・通知・tools/list）だけを送る。道具は 1 回も呼ばない。
//         1 つの接続先へ送る握手は 3 回（巡回の握手・接続・道具の一覧）。数を小さく保つ（--limit の既定は 5）。
//         台帳の記録は --records=<file.jsonl>（台帳の API が返す 1 件を 1 行）から読む（台帳へは通信しない）。
// 仕様: docs/noah/spec-74-one-click-connect.md の 11.6・11.8。
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { createNoahConnectApi } from '../lib/noah-connect.ts';
import { createNoahConnectPlanApi } from '../lib/noah-connect-plan-api.ts';
import { createIntakeTick } from '../lib/noah-intake-api.ts';
import { createIntakeStore } from '../lib/noah-intake-store.ts';
import { parseNoahFlags } from '../lib/noah-flags.ts';
import { noahWakeSignature } from '../lib/noah-intake-wake.ts';
import { ownerScopeFor } from '../lib/owner-intent.ts';
import { mcpServer, tool } from '../tests/fixtures/noah/mcp-server.mjs';
import { SAMPLE_AGENT, checkPublicAddress, official, pickLiveRecords } from './check-noah-probe.mjs';

const REGISTRY = 'registry.modelcontextprotocol.io';
const ORIGIN = 'https://noah.test';
const OWNER = 'local-owner';
const familyOf = (name) => `mcp-registry:${name}`;

/** 合成の台帳と接続先。つないだ時の結果が、相手ごとに決まっている。after は、載せた後（巡回の握手の後）に、相手の振る舞いを変える。 */
function synthetic(started) {
  const nested = tool('configure', false, { inputSchema: { type: 'object', required: ['o'], properties: { o: { type: 'object' } } } });
  const lookup = tool('lookup', true, { inputSchema: { type: 'object', required: ['query'], properties: { query: { type: 'string' } } } });
  const kinds = [
    ...Array.from({ length: 4 }, () => ({ expect: 'connected', server: () => mcpServer({ tools: [lookup, tool('stats'), tool('publish', false), nested] }) })),
    { expect: 'connected', server: () => mcpServer({ sse: true, noise: true }) },
    { expect: 'connected', server: () => mcpServer({ session: 'synthetic-session' }) },
    { expect: 'connected', server: () => mcpServer({ rejects: ['2025-11-25'] }) },
    { expect: 'connected', server: () => mcpServer({ tools: Array.from({ length: 130 }, (_, i) => tool(`tool_${i}`)), pageSize: 50 }) },
    { expect: 'auth_required', server: () => mcpServer(), after: (server) => { server.options.status = 401; } },
    { expect: 'payment_required', server: () => mcpServer(), after: (server) => { server.options.status = 402; } },
    { expect: 'unreachable', server: () => mcpServer(), after: (server) => { server.options.status = 503; } },
    { expect: 'rate_limited', server: () => mcpServer(), after: (server) => { Object.assign(server.options, { status: 429, statusHeaders: { 'retry-after': '90' } }); } },
    { expect: 'no_tools', server: () => mcpServer(), after: (server) => { server.state.tools = []; } },
    { expect: 'blocked', server: () => mcpServer(), after: (server) => { server.options.redirect = true; } },
  ];
  const routes = {}, servers = [], hosts = [];
  const records = kinds.map((kind, i) => {
    const host = `agent-${i}.example.com`, server = kind.server();
    servers.push(server);
    routes[host] = (url, init) => (server.options.redirect ? new Response('', { status: 307, headers: { location: 'https://elsewhere.example.org/mcp' } }) : server.fetch(url, init));
    return { server: { name: `fixture.provider/agent-${i}`, version: '1.0.0', remotes: [{ type: 'streamable-http', url: `https://${host}/mcp` }] }, _meta: official(started) };
  });
  // 載らない物: 鍵の要る候補。
  const never = mcpServer();
  routes['keyed.example.com'] = never.fetch;
  records.push({ server: { name: 'fixture.provider/keyed', version: '1.0.0', remotes: [{ type: 'streamable-http', url: 'https://keyed.example.com/mcp', headers: [{ name: 'X-Api-Key', isRequired: true, isSecret: true }] }] }, _meta: official(started) });
  const agents = async (url, init) => {
    const { hostname } = new URL(String(url));
    hosts.push(hostname);
    if (!routes[hostname]) throw new TypeError('fetch failed');
    return routes[hostname](url, init);
  };
  return {
    records, agents, check: undefined,
    expected: Object.fromEntries(kinds.map((kind, i) => [familyOf(`fixture.provider/agent-${i}`), kind.expect])),
    change: () => { for (const [i, kind] of kinds.entries()) kind.after?.(servers[i]); },
    after: () => {
      assert.equal(never.log.length, 0, '鍵の要る候補へは送らない');
      assert.deepEqual(hosts.filter((name) => name === 'elsewhere.example.org'), [], '別の接続先への転送に従わない');
      assert.deepEqual([...new Set(servers.flatMap((server) => server.log.map((request) => request.rpc ?? request.method)))].sort((a, b) => a.localeCompare(b)), ['DELETE', 'initialize', 'notifications/initialized', 'tools/list'], '道具を呼ばない');
      // 人の操作から始めた握手は Noah/1、巡回は NoahBot/1 と名乗る。
      assert.deepEqual([...new Set(servers.flatMap((server) => server.log.map((request) => String(request.headers['user-agent']).split(' ')[0])))].sort((a, b) => a.localeCompare(b)), ['Noah/1', 'NoahBot/1']);
    },
  };
}

/** 実在の接続先。記録は手元のファイルから選ぶ。 */
async function live(started, options) {
  const picked = await pickLiveRecords(options, started);
  const seen = new Map(), methods = new Set();
  const agents = async (url, init) => {
    const { hostname } = new URL(String(url)), method = init?.body ? JSON.parse(init.body).method : init?.method;
    methods.add(method);
    seen.set(hostname, (seen.get(hostname) ?? 0) + Number(method === 'initialize'));
    // 受入の標本である事を、相手に分かるように名乗る（本番の名乗りは Noah/1 と NoahBot/1）。
    return fetch(url, { ...init, headers: { ...Object.fromEntries(new Headers(init?.headers ?? {})), 'user-agent': SAMPLE_AGENT } });
  };
  return {
    records: [...picked.values()], agents, check: checkPublicAddress, expected: null, change: () => {},
    after: () => {
      // 1 つの接続先へ: 巡回の握手・接続・道具の一覧で 3 回。版の名乗り直しで、初期化が 2 回になる相手が居る。
      assert.ok([...seen.values()].every((count) => count <= 6), '同じ接続先へ、握手は 3 回まで');
      assert.deepEqual([...methods].filter((method) => !['initialize', 'notifications/initialized', 'tools/list', 'DELETE'].includes(method)), [], '道具を呼ばない');
    },
  };
}

export async function checkNoahConnect(options = { live: false }) {
  const mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script: 'export default { fetch() { return new Response("local connect acceptance"); } };', compatibilityDate: '2026-10-01', d1Databases: { DB: 'noah-connect-local-acceptance' } }));
  try {
    const d1 = await mf.getD1Database('DB');
    for (const file of ['0043_noah_runner', '0044_noah_intake', '0047_noah_connections', '0048_noah_asks', '0049_noah_connections_connecting']) for (const sql of readFileSync(new URL(`../drizzle/${file}.sql`, import.meta.url), 'utf8').split('--> statement-breakpoint').filter((part) => /CREATE/.test(part))) await d1.prepare(sql).run();
    // D1 への往復（1 文の実行か、1 回の batch）を数える。
    const trips = { n: 0 };
    const counted = (statement) => new Proxy(statement, { get: (target, name) => {
      if (name === 'bind') return (...args) => counted(target.bind(...args));
      if (['first', 'all', 'run', 'raw'].includes(name)) return (...args) => { trips.n++; return target[name](...args); };
      if (name === '__statement') return target;
      return Reflect.get(target, name);
    } });
    const db = { prepare: (sql) => counted(d1.prepare(sql)), batch: (statements) => { trips.n++; return d1.batch(statements.map((statement) => statement.__statement)); } };

    const started = Date.now(), key = 'local-acceptance-wake-'.repeat(3);
    const world = options.live ? await live(started, options) : synthetic(started);
    let logical = started, turnStart = started;
    const deps = {
      db, now: () => logical + Date.now() - turnStart, authenticate: async () => OWNER, reviewers: [], wakeKey: key,
      flags: parseNoahFlags({ NOAH_PATROL_ENABLED: 'true', NOAH_INTAKE_PUBLIC: 'true', NOAH_ASK_FORM: 'true' }), ...(world.check ? { probeCheck: world.check } : {}),
      fetcher: async (input, init) => {
        const url = new URL(String(input));
        if (url.hostname !== REGISTRY) return world.agents(input, init);
        if (url.searchParams.has('updated_since')) return Response.json({ servers: [], metadata: {} });
        const offset = Number(url.searchParams.get('cursor') ?? 0);
        return Response.json({ servers: world.records.slice(offset, offset + 100), metadata: { nextCursor: offset + 100 < world.records.length ? String(offset + 100) : null } });
      },
    };

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
    world.change();
    turnStart = Date.now(); logical = started + wakes * 60_000;

    // 2. 載っている系列を、1 件ずつ: 計画を読む → 接続 → 道具の一覧 → 切る。
    const store = createIntakeStore(deps), listed = [];
    for (let cursor = ''; ;) {
      const page = await store.list(OWNER, new URLSearchParams(cursor ? { cursor } : {}));
      listed.push(...page.items.map((item) => item.id));
      if (!page.nextCursor) break;
      cursor = page.nextCursor;
    }
    const api = createNoahConnectApi(deps), planApi = createNoahConnectPlanApi(deps), scope = await ownerScopeFor(OWNER);
    const send = async (handler, method, path, body) => {
      const before = trips.n, at = Date.now();
      const response = await handler(new Request(ORIGIN + path, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }), headers: method === 'GET' ? {} : { Origin: ORIGIN, 'Content-Type': 'application/json', 'X-Rock-Owner-Scope': scope } }));
      return { status: response.status, body: await response.json(), trips: trips.n - before, ms: Date.now() - at };
    };
    const outcomes = {}, counts = { plan: [], connect: [], tools: [], disconnect: [] }, connectMs = [], toolStats = [];
    const outcome = (error) => (error.includes('許可') ? 'auth_required' : error.includes('支払い') ? 'payment_required' : error.includes('混んでいます') ? 'rate_limited' : error.includes('道具がありません') ? 'no_tools' : error.includes('つなげません') ? 'blocked' : error.includes('応答しません') ? 'unreachable' : error.includes('読めません') ? 'incompatible' : error.includes('断りました') ? 'forbidden' : 'other');
    for (const agent of listed) {
      // 1 人が続けてつなげるのは、60 秒に 10 件まで（つなぐ前の上限）。受入では、1 件ごとに時計を 7 秒進める。
      logical += 7_000;
      const plan = await send(planApi, 'GET', `/api/noah/connect-plan?agent=${encodeURIComponent(agent)}`);
      assert.equal(plan.status, 200, JSON.stringify(plan.body));
      assert.deepEqual([plan.body.cost, plan.body.place], [{ taps: 0, typed: 0 }, 'provider']);
      counts.plan.push(plan.trips);
      const id = randomUUID();
      const connected = await send(api.collection, 'POST', '/api/noah/connect', { id, agentId: agent, planSha256: plan.body.planSha256 });
      assert.equal(connected.status, 200, JSON.stringify(connected.body));
      counts.connect.push(connected.trips);
      if (connected.body.state !== 'connected') { outcomes[agent] = outcome(connected.body.error ?? ''); continue; }
      outcomes[agent] = 'connected';
      connectMs.push(connected.ms);
      // 同じ操作の再送は、握手をやり直さずに、同じ答えを返す。
      const again = await send(api.collection, 'POST', '/api/noah/connect', { id, agentId: agent, planSha256: plan.body.planSha256 });
      assert.deepEqual(again.body, connected.body);
      const tools = await send((request) => api.tools(request, id), 'GET', `/api/noah/connect/${id}/tools`);
      counts.tools.push(tools.trips);
      if (tools.status === 200) {
        const usable = tools.body.tools.filter((item) => item.usable);
        toolStats.push({ tools: tools.body.tools.length, usable: usable.length, forms: tools.body.tools.filter((item) => item.form).length, oneTap: usable.filter((item) => item.readOnly && item.required === 0).length, needsConfirm: usable.filter((item) => item.needsConfirm).length });
        assert.ok(tools.body.tools.filter((item) => item.form).length <= 100);
      } else if (!options.live) assert.fail(`道具の一覧: ${tools.status} ${JSON.stringify(tools.body)}`);
      const gone = await send((request) => api.item(request, id), 'POST', `/api/noah/connect/${id}`, { action: 'disconnect', revision: connected.body.revision });
      assert.deepEqual([gone.status, gone.body.state], [200, 'disconnected']);
      counts.disconnect.push(gone.trips);
    }

    // 3. 載せていない物は、つなげない。
    if (!options.live) {
      const refused = await send(api.collection, 'POST', '/api/noah/connect', { id: randomUUID(), agentId: familyOf('fixture.provider/keyed'), planSha256: 'a'.repeat(64) });
      assert.deepEqual([refused.status, refused.body.error], [422, 'この Agent は、今はつなげません。']);
    }

    const rows = (await d1.prepare('SELECT state, COUNT(*) AS n FROM noah_connections GROUP BY state ORDER BY state').all()).results;
    const after = (await d1.prepare('SELECT COUNT(*) AS n FROM noah_intake_families WHERE listed=1 AND level>=1 AND withdrawn_at IS NULL AND hidden_at IS NULL').first()).n;
    const hosts = await d1.prepare('SELECT COUNT(*) AS n, MAX(user_count) AS user, SUM(not_before > 0) AS waiting FROM noah_probe_hosts').first();
    const commands = (await d1.prepare('SELECT COUNT(*) AS n FROM noah_runner_commands').first()).n;
    const tally = Object.values(outcomes).reduce((map, name) => ({ ...map, [name]: (map[name] ?? 0) + 1 }), {});
    const sorted = [...connectMs].sort((a, b) => a - b), at = (p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] : null);
    const range = (values) => (values.length ? { min: Math.min(...values), max: Math.max(...values) } : null);
    const sum = (name) => toolStats.reduce((total, item) => total + item[name], 0);
    const summary = {
      mode: options.live ? 'real endpoints/local-D1' : 'synthetic/local-D1', wakes, listedBefore: listed.length, listedAfter: after, outcomes: tally,
      connections: Object.fromEntries(rows.map((row) => [row.state, row.n])),
      toolLists: { opened: toolStats.length, tools: sum('tools'), usableInForm: sum('usable'), withForm: sum('forms'), oneTap: sum('oneTap'), needsConfirm: sum('needsConfirm') },
      d1RoundTrips: { plan: range(counts.plan), connect: range(counts.connect), tools: range(counts.tools), disconnect: range(counts.disconnect) },
      connectMs: { median: at(0.5), p90: at(0.9), max: sorted.at(-1) ?? null }, hostsWaiting: hosts.waiting ?? 0, durationMs: Date.now() - started,
    };
    console.log(JSON.stringify(summary, null, 2));
    world.after();
    assert.equal(commands, 0, '家の端末への命令は、1 件も増えない');
    assert.ok((hosts.user ?? 0) <= 2, '1 つの接続先へ、利用者の操作から始めた握手は、接続と道具の一覧の 2 回');
    if (world.expected) {
      assert.deepEqual(outcomes, world.expected);
      // 相手の許可・支払いが要るようになった 2 件だけが、一覧から外れる。
      assert.equal(after, listed.length - 2);
      assert.equal(hosts.waiting, 1, '「混んでいる」と返した接続先は、待つ');
      assert.deepEqual(summary.connections, { disconnected: 8, failed: 6 });
    } else assert.ok(listed.length > 0, '握手が通った物が、1 件も無い');
    return summary;
  } finally { await mf.dispose(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2), value = (name) => args.find((arg) => arg.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
  if (args.some((arg) => arg !== '--live' && !/^--(records|limit|seed)=/.test(arg))) throw Error('使い方: check-noah-connect.mjs [--live --records=<file.jsonl> [--limit=5] [--seed=3]]。表は、いつも手元の、終わると消える物');
  await checkNoahConnect({ live: args.includes('--live'), records: value('records'), limit: Number(value('limit') ?? 5), seed: Number(value('seed') ?? 3) });
}

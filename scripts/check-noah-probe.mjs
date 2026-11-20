// 巡回での握手（MVP L4）の受入。表は、手元の D1（Miniflare の中だけ。終わると消える）。本番の D1・配備・切り替えには触らない。
// 既定: 台帳も接続先も、この script の中の合成の物。外へは通信しない。
// --live: 接続先は実在の物。握手（initialize・通知・tools/list）だけを送る。道具は 1 回も呼ばない。同じ接続先へは 1 回だけ。名乗りは NoahBot/1。
//         台帳の記録は --records=<file.jsonl>（台帳の API が返す 1 件を 1 行）から読む（台帳へは通信しない）。鍵の宣言が無い・相手のサーバーで動く
//         記録のうち、接続先が別々の物を --limit 件（既定 100）選ぶ（--seed で選び方を固定）。
//         握手の前に、名前を引いた先のアドレスが内部向けでない事を確かめる（引き直しで別のアドレスへ行く隙は残る。本番の Workers からは、内部のアドレスへ届かない）。
// 仕様: docs/noah/spec-86-remote-mouth.md の 10.5。
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { lookup } from 'node:dns/promises';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { createIntakeTick } from '../lib/noah-intake-api.ts';
import { draftFromRegistry } from '../lib/noah-intake-draft.ts';
import { parseNoahFlags } from '../lib/noah-flags.ts';
import { noahWakeSignature } from '../lib/noah-intake-wake.ts';
import { NoahMouthError, isNoahPrivateAddress } from '../lib/noah-mouth-mcp-remote.ts';
import { NOAH_PROBE } from '../lib/noah-probe.ts';
import { mcpServer, tool } from '../tests/fixtures/noah/mcp-server.mjs';

const REGISTRY = 'registry.modelcontextprotocol.io';
const SAMPLE_AGENT = 'noah-acceptance/1 (read-only sample: initialize + tools/list only, no tool calls; +https://github.com/k999ln/rock)';
const official = (at) => ({ 'io.modelcontextprotocol.registry/official': { status: 'active', updatedAt: new Date(at).toISOString() } });
/** 決まった並びの乱数（選び方を、seed で再現できるようにする）。 */
function random(seed) {
  let state = seed >>> 0;
  return () => { state = (state + 0x6d2b79f5) >>> 0; let t = Math.imul(state ^ (state >>> 15), 1 | state); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** 合成の台帳と接続先。握手の結果ごとの数が決まっている。 */
function synthetic(started) {
  const nested = tool('configure', false, { inputSchema: { type: 'object', required: ['o'], properties: { o: { type: 'object' } } } });
  const kinds = [
    ...Array.from({ length: 20 }, () => ({ expect: 'ok', server: () => mcpServer() })),
    ...Array.from({ length: 2 }, () => ({ expect: 'ok', server: () => mcpServer({ sse: true, noise: true }) })),
    ...Array.from({ length: 2 }, () => ({ expect: 'ok', server: () => mcpServer({ session: 'synthetic-session' }) })),
    { expect: 'ok', server: () => mcpServer({ rejects: ['2025-11-25'] }) },
    { expect: 'ok', noForm: true, server: () => mcpServer({ tools: [nested] }) },
    ...Array.from({ length: 9 }, () => ({ expect: 'auth_required', server: () => mcpServer({ status: 401 }) })),
    { expect: 'payment_required', server: () => mcpServer({ status: 402 }) },
    ...Array.from({ length: 2 }, () => ({ expect: 'unreachable', server: () => mcpServer({ status: 404 }) })),
    { expect: 'unreachable', server: () => mcpServer({ status: 503 }) },
    { expect: 'unreachable', server: null },
    { expect: 'incompatible', server: () => mcpServer({ status: 405 }) },
    { expect: 'incompatible', server: () => mcpServer({ tools: [] }) },
    { expect: 'blocked', redirect: true, server: null },
  ];
  const routes = {}, servers = [], expected = {};
  const records = kinds.map((kind, i) => {
    const host = `agent-${i}.example.com`;
    const server = kind.server?.();
    if (server) { routes[host] = server.fetch; servers.push(server); }
    if (kind.redirect) routes[host] = async () => new Response('', { status: 307, headers: { location: 'https://elsewhere.example.org/mcp' } });
    expected[kind.expect] = (expected[kind.expect] ?? 0) + 1;
    return { server: { name: `fixture.provider/agent-${i}`, version: '1.0.0', remotes: [{ type: 'streamable-http', url: `https://${host}/mcp` }] }, _meta: official(started) };
  });
  // 握手しない物: 鍵の要る候補 1 件、同じ提供者・同じ接続先の量産 20 件。同じ接続先を分け合う 3 件は、1 時間に 1 件ずつ。
  const never = mcpServer(), shared = mcpServer();
  routes['keyed.example.com'] = never.fetch; routes['bulk.example.com'] = never.fetch; routes['shared.example.com'] = shared.fetch;
  records.push({ server: { name: 'fixture.provider/keyed', version: '1.0.0', remotes: [{ type: 'streamable-http', url: 'https://keyed.example.com/mcp', headers: [{ name: 'X-Api-Key', isRequired: true, isSecret: true }] }] }, _meta: official(started) });
  for (let i = 0; i < 20; i++) records.push({ server: { name: `fixture.bulk/tool-${i}`, version: '1.0.0', remotes: [{ type: 'streamable-http', url: `https://bulk.example.com/mcp/${i}` }] }, _meta: official(started) });
  for (let i = 0; i < 3; i++) records.push({ server: { name: `fixture.shared${i}/agent`, version: '1.0.0', remotes: [{ type: 'streamable-http', url: `https://shared.example.com/mcp/${i}` }] }, _meta: official(started) });
  expected.ok += 1;   // 同じ接続先の 3 件のうち、この受入の時間（1 時間未満）で握手するのは 1 件
  const hosts = [];
  const agents = async (url, init) => {
    const { hostname } = new URL(String(url));
    hosts.push(hostname);
    if (!routes[hostname]) throw new TypeError('fetch failed');
    return routes[hostname](url, init);
  };
  return { records, agents, expected, eligible: kinds.length + 3, check: undefined, after: () => {
    assert.equal(never.log.length, 0, '鍵の要る候補と、量産の系列へは送らない');
    assert.deepEqual(hosts.filter((name) => name === 'elsewhere.example.org'), [], '別の接続先への転送に従わない');
    assert.equal(shared.log.filter((request) => request.rpc === 'initialize').length, 1, '同じ接続先へは 1 時間に 1 回');
    assert.deepEqual([...new Set([...servers, shared].flatMap((server) => server.log.map((request) => request.rpc ?? request.method)))].sort((a, b) => a.localeCompare(b)), ['DELETE', 'initialize', 'notifications/initialized', 'tools/list'], '道具を呼ばない');
  } };
}

/** 実在の接続先。記録は手元のファイルから選ぶ。 */
async function live(started, options) {
  assert.ok(options.records, '--live には --records=<file.jsonl> が要ります（台帳の API が返す 1 件を 1 行）');
  const draw = random(options.seed), picked = new Map();
  const lines = readFileSync(options.records, 'utf8').split('\n').filter(Boolean);
  // 無作為の順に見て、鍵の宣言が無い・相手のサーバーで動く・有効な記録を、接続先ごとに 1 件ずつ取る。
  const order = lines.map((_, index) => index);
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(draw() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  for (const index of order) {
    if (picked.size >= options.limit) break;
    const record = JSON.parse(lines[index]);
    if (record?._meta?.['io.modelcontextprotocol.registry/official']?.status !== 'active') continue;
    const draft = await draftFromRegistry(record.server).catch(() => null);
    if (!draft?.ok || draft.connect.mouth !== 'mcp-remote' || draft.connect.secrets.length) continue;
    const host = draft.connect.egress[0];
    if (!picked.has(host)) picked.set(host, { server: record.server, _meta: official(started) });
  }
  const seen = new Map(), methods = new Set();
  const agents = async (url, init) => {
    const { hostname } = new URL(String(url)), method = init?.body ? JSON.parse(init.body).method : init?.method;
    methods.add(method);
    seen.set(hostname, (seen.get(hostname) ?? 0) + Number(method === 'initialize'));
    // 受入の標本である事を、相手に分かるように名乗る（本番の巡回の名乗りは NoahBot/1。lib/noah-intake-probe.ts）。
    return fetch(url, { ...init, headers: { ...Object.fromEntries(new Headers(init?.headers ?? {})), 'user-agent': SAMPLE_AGENT } });
  };
  const check = async (url) => {
    let addresses;
    try { addresses = await lookup(url.hostname, { all: true }); } catch { throw new NoahMouthError('unreachable', '名前を引けません。'); }
    if (!addresses.length || addresses.some((entry) => isNoahPrivateAddress(entry.address))) throw new NoahMouthError('blocked', '内部向けのアドレスです。');
  };
  return { records: [...picked.values()], agents, expected: null, eligible: picked.size, check, after: () => {
    // 版の名乗り直しで、初期化が 2 回になる相手が居る（実測で 0.7%）。3 回以上は送らない。
    assert.ok([...seen.values()].every((count) => count <= 2), '同じ接続先へ、握手は 1 回だけ');
    assert.deepEqual([...methods].filter((method) => !['initialize', 'notifications/initialized', 'tools/list', 'DELETE'].includes(method)), [], '道具を呼ばない');
  } };
}

export async function checkNoahProbe(options = { live: false }) {
  const mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script: 'export default { fetch() { return new Response("local probe acceptance"); } };', compatibilityDate: '2026-10-01', d1Databases: { DB: 'noah-probe-local-acceptance' } }));
  try {
    const db = await mf.getD1Database('DB');
    for (const sql of readFileSync(new URL('../drizzle/0044_noah_intake.sql', import.meta.url), 'utf8').split('--> statement-breakpoint').filter((part) => /CREATE/.test(part))) await db.prepare(sql).run();
    const started = Date.now(), key = 'local-acceptance-wake-'.repeat(3);
    const world = options.live ? await live(started, options) : synthetic(started);
    let logical = started, turnStart = started;
    const deps = {
      db, now: () => logical + Date.now() - turnStart, authenticate: async () => 'local-reviewer', reviewers: ['local-reviewer'], wakeKey: key,
      flags: parseNoahFlags({ NOAH_PATROL_ENABLED: 'true' }), ...(world.check ? { probeCheck: world.check } : {}),
      fetcher: async (input, init) => {
        const url = new URL(String(input));
        if (url.hostname !== REGISTRY) return world.agents(input, init);
        // 台帳は、選んだ記録を 100 件ずつ返す（外の台帳へは通信しない）。更新された物だけの巡回には、空を返す。
        if (url.searchParams.has('updated_since')) return Response.json({ servers: [], metadata: {} });
        const offset = Number(url.searchParams.get('cursor') ?? 0);
        return Response.json({ servers: world.records.slice(offset, offset + 100), metadata: { nextCursor: offset + 100 < world.records.length ? String(offset + 100) : null } });
      },
    };
    const tick = createIntakeTick(deps), totals = { probes: 0, ok: 0, authRequired: 0, unreachable: 0, rateLimited: 0, skippedHost: 0, toolsChanged: 0 };
    const quiet = console.info;
    console.info = () => {};   // 合図の 1 行は、ここでは集計だけを出す
    let wakes = 0;
    try {
      for (let idle = 0; wakes < 60 && idle < 2;) {
        turnStart = Date.now(); logical = started + wakes * 60_000; wakes++;
        const timestamp = String(deps.now());
        const response = await tick(new Request('https://noah.test/api/noah/intake/tick', { method: 'POST', body: '{}', headers: { 'x-noah-time': timestamp, 'x-noah-signature': await noahWakeSignature(key, timestamp) } }));
        const result = await response.json();
        assert.equal(response.status, 200, JSON.stringify(result));
        for (const name of Object.keys(totals)) totals[name] += result.probe?.[name] ?? 0;
        idle = result.probe?.probes ? 0 : idle + 1;
      }
    } finally { console.info = quiet; }
    const rows = (await db.prepare("SELECT k.result, k.level, COUNT(*) AS n, SUM(COALESCE(k.form_tools,0) >= 1) AS form, SUM(COALESCE(k.one_tap_tools,0) >= 1) AS one_tap FROM noah_intake_checks k WHERE k.checked_at IS NOT NULL GROUP BY k.result, k.level ORDER BY n DESC").all()).results;
    const checked = rows.reduce((sum, row) => sum + row.n, 0), passed = rows.filter((row) => row.result === 'ok').reduce((sum, row) => sum + row.n, 0);
    const latency = (await db.prepare("SELECT latency_ms FROM noah_intake_checks WHERE result='ok' ORDER BY latency_ms").all()).results.map((row) => row.latency_ms);
    const at = (p) => (latency.length ? latency[Math.min(latency.length - 1, Math.floor(latency.length * p))] : null);
    const hosts = await db.prepare('SELECT COUNT(*) AS n, MAX(user_count) AS user FROM noah_probe_hosts').first();
    const listed = await db.prepare('SELECT COUNT(*) AS n FROM noah_intake_families WHERE listed=1 AND level>=1 AND withdrawn_at IS NULL AND hidden_at IS NULL').first();
    // 「つなげない」の内訳: 別の接続先へ回す相手（30 日後に確かめ直す）と、接続先の検査を通らない物（確かめ直さない）。
    const blocked = await db.prepare("SELECT COALESCE(SUM(next_check_at < ?), 0) AS redirected, COALESCE(SUM(next_check_at >= ?), 0) AS inspection FROM noah_intake_checks WHERE result='blocked'").bind(NOAH_PROBE.never, NOAH_PROBE.never).first();
    const share = (n) => (checked ? Math.round((n / checked) * 1000) / 10 : 0);
    const summary = {
      mode: options.live ? 'real endpoints/local-D1' : 'synthetic/local-D1', wakes, eligible: world.eligible, checked,
      results: Object.fromEntries(rows.map((row) => [String(row.result) + (row.level ? '/level' + String(Number(row.level)) : ''), { count: row.n, percent: share(row.n) }])),
      passedWithFormTool: { count: rows.filter((row) => row.result === 'ok').reduce((sum, row) => sum + row.form, 0), ofPassed: passed },
      passedWithOneTapTool: rows.filter((row) => row.result === 'ok').reduce((sum, row) => sum + row.one_tap, 0),
      blocked: { redirectedToAnotherHost: blocked.redirected, failedInspection: blocked.inspection },
      listedFamilies: listed.n, handshakeMs: { median: at(0.5), p90: at(0.9), max: latency.at(-1) ?? null }, hostsContacted: hosts.n, wakeTotals: totals, durationMs: Date.now() - started,
    };
    console.log(JSON.stringify(summary, null, 2));
    world.after();
    assert.equal(hosts.user ?? 0, 0, '巡回の握手は、利用者の枠を使わない');
    assert.equal(totals.probes, checked, '握手した数と、結果が付いた数が同じ');
    if (world.expected) {
      const actual = Object.fromEntries(rows.reduce((map, row) => map.set(row.result, (map.get(row.result) ?? 0) + row.n), new Map()));
      assert.deepEqual(actual, world.expected);
      // 載るのは、握手が通って、入力欄で使える道具がある物（入力欄にできる道具が無い 1 件は載らない）。
      assert.equal(listed.n, world.expected.ok - 1);
    } else assert.ok(checked >= Math.min(world.eligible, options.limit) * 0.9, `握手の結果が付いたのは ${checked} 件`);
    return summary;
  } finally { await mf.dispose(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2), value = (name) => args.find((arg) => arg.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
  if (args.some((arg) => arg !== '--live' && !/^--(records|limit|seed)=/.test(arg))) throw Error('使い方: check-noah-probe.mjs [--live --records=<file.jsonl> [--limit=100] [--seed=1]]。表は、いつも手元の、終わると消える物');
  await checkNoahProbe({ live: args.includes('--live'), records: value('records'), limit: Number(value('limit') ?? 100), seed: Number(value('seed') ?? 1) });
}

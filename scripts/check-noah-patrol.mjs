// 見回りを保つ（MVP L7）の受入。巡回の合図（入口の関数）を回して、
//   1. 握手が通った 50 件のうち、相手を止めた 1 件が、2 回の握手の後に一覧から消え、相手が戻ると、また載る。
//   2. 同じ接続先への握手が、1 時間に 1 回を越えない（握手の表の記録と、相手が受けた要求の時刻の、両方で）。
//   3. 実行の途中で落ちた依頼・始まらなかった依頼・つなぐ途中で止まった接続を、合図の終わりの後始末が片付ける（相手へは、何も送らない）。
// 表は、手元の D1（Miniflare の中だけ。終わると消える）。本番の D1・配備・切り替えには触らない。
// 台帳も接続先も、この script の中の合成の物。外へは通信しない。時計は、手で進める（7 日・14 日を、待たずに通す）。
// 仕様: docs/noah/spec-88-mass-probe.md の 9.3・9.5・9.10。
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { createNoahAskApi, createNoahAskService, NOAH_ASK_RUN_LIMITS } from '../lib/noah-ask.ts';
import { NOAH_ASK_END_MESSAGES, NOAH_ASK_LEASE_GRACE_MS } from '../lib/noah-ask-store.ts';
import { createNoahConnectApi } from '../lib/noah-connect.ts';
import { createNoahConnectPlanApi } from '../lib/noah-connect-plan-api.ts';
import { parseNoahFlags } from '../lib/noah-flags.ts';
import { createIntakeTick } from '../lib/noah-intake-api.ts';
import { noahWakeSignature } from '../lib/noah-intake-wake.ts';
import { ownerScopeFor } from '../lib/owner-intent.ts';
import { createNoahSweep, noSweep, NOAH_SWEEP_CONNECTING_MESSAGE, NOAH_SWEEP_LIMITS } from '../lib/noah-sweep.ts';
import { normalizeWorkJob } from '../lib/workflow.ts';
import { mcpServer, tool } from '../tests/fixtures/noah/mcp-server.mjs';
import { official } from './check-noah-probe.mjs';

const REGISTRY = 'registry.modelcontextprotocol.io';
const ORIGIN = 'https://noah.test';
const OWNER = 'acceptance-owner';
const HOUR = 3_600_000, DAY = 24 * HOUR;
/** 握手が通る相手の数（9.10 の「握手が通った 50 件」）。 */
const PROVIDERS = 50;
const familyOf = (name) => `mcp-registry:${name}`;
const lookup = () => tool('lookup', true, { description: 'Looks up a player.', inputSchema: { type: 'object', required: ['query'], properties: { query: { type: 'string' } } } });

/** 相手が、ある要求の所で、返事をしないまま止まる（実行の場が落ちた時と、同じ状態になる）。open() で、返事をする。 */
function gate() {
  let open, reached;
  const opened = new Promise((resolve) => { open = resolve; }), arrived = new Promise((resolve) => { reached = resolve; });
  return { opened, arrived, open, reached };
}

/**
 * 合成の台帳と接続先。握手が通る相手が 50（接続先は別々）。それとは別に、同じ接続先を分け合う 3 件（1 時間に 1 件ずつ握手する）。
 * 相手は、hold[要求の名前] に gate を置くと、その要求で止まる。受けた巡回の握手（initialize）の時刻を、接続先ごとに残す。
 */
function synthetic(started, now) {
  const routes = {}, servers = [], holds = [], records = [], patrolAt = new Map();
  const add = (name, host, path, server) => {
    routes[host] = server.fetch;
    records.push({ server: { name, version: '1.0.0', remotes: [{ type: 'streamable-http', url: `https://${host}${path}` }] }, _meta: official(started) });
  };
  for (let i = 0; i < PROVIDERS; i++) {
    const hold = {};
    const server = mcpServer({ tools: [lookup(), tool('stats')], before: async (body) => { const stop = hold[body?.method]; if (stop) { stop.reached(); await stop.opened; } } });
    servers.push(server); holds.push(hold);
    add(`fixture.provider/agent-${i}`, `agent-${i}.example.com`, '/mcp', server);
  }
  // 同じ接続先を分け合う 3 件は、道具が別々の、別の物（道具の定義まで同じなら、名寄せが「同じ物のコピー」として 1 系列にまとめる）。
  const shared = Array.from({ length: 3 }, (_, i) => mcpServer({ tools: [tool(`shared_tool_${i}`)] }));
  for (let i = 0; i < 3; i++) add(`fixture.shared${i}/agent`, 'shared.example.com', `/mcp/${i}`, shared[i]);
  routes['shared.example.com'] = (url, init) => shared[Number(new URL(String(url)).pathname.split('/')[2])].fetch(url, init);
  const agents = async (url, init) => {
    const { hostname } = new URL(String(url)), body = init?.body ? JSON.parse(init.body) : null;
    if (!routes[hostname]) throw new TypeError('fetch failed');
    // 巡回の握手の時刻（名乗りが NoahBot の、接続の開始）。
    if (body?.method === 'initialize' && String(new Headers(init.headers).get('user-agent')).startsWith('NoahBot/')) patrolAt.set(hostname, [...(patrolAt.get(hostname) ?? []), now()]);
    return routes[hostname](url, init);
  };
  return { records, agents, servers, holds, shared, patrolAt, family: (i) => familyOf(`fixture.provider/agent-${i}`) };
}

export async function checkNoahPatrol() {
  const mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script: 'export default { fetch() { return new Response("local patrol acceptance"); } };', compatibilityDate: '2026-10-01', d1Databases: { DB: 'noah-patrol-local-acceptance' } }));
  try {
    const d1 = await mf.getD1Database('DB');
    for (const file of ['0043_noah_runner', '0044_noah_intake', '0047_noah_connections', '0048_noah_asks', '0049_noah_connections_connecting']) for (const sql of readFileSync(new URL(`../drizzle/${file}.sql`, import.meta.url), 'utf8').split('--> statement-breakpoint').filter((part) => /CREATE/.test(part))) await d1.prepare(sql).run();
    // 成果の正本（Work）の表。大きな migration（0021）から、その表を作る文だけを、そのまま取り出して流す。
    await d1.prepare(/CREATE TABLE IF NOT EXISTS `work_jobs` \([^;]+\);/.exec(readFileSync(new URL('../drizzle/0021_sites_schema_convergence.sql', import.meta.url), 'utf8'))[0]).run();
    // D1 への往復（1 文の実行か、1 回の batch）を数える。
    const trips = { n: 0 };
    const counted = (statement) => new Proxy(statement, { get: (target, name) => {
      if (name === 'bind') return (...args) => counted(target.bind(...args));
      if (['first', 'all', 'run', 'raw'].includes(name)) return (...args) => { trips.n++; return target[name](...args); };
      if (name === '__statement') return target;
      return Reflect.get(target, name);
    } });
    const db = { prepare: (sql) => counted(d1.prepare(sql)), batch: (statements) => { trips.n++; return d1.batch(statements.map((statement) => statement.__statement)); } };
    const one = (sql, ...args) => d1.prepare(sql).bind(...args).first();
    const many = async (sql, ...args) => (await d1.prepare(sql).bind(...args).all()).results;

    const started = Date.now(), key = 'local-acceptance-wake-'.repeat(3);
    // 時計は、手で進める。
    let clock = started;
    const now = () => clock, advance = (ms) => { clock += ms; };
    const world = synthetic(started, now), pending = [];
    const drain = async () => { while (pending.length) await Promise.allSettled(pending.splice(0)); };
    const deps = {
      db, now, authenticate: async () => OWNER, reviewers: [], wakeKey: key, waitUntil: (work) => { pending.push(work); },
      flags: parseNoahFlags({ NOAH_PATROL_ENABLED: 'true', NOAH_INTAKE_PUBLIC: 'true', NOAH_ASK_FORM: 'true' }),
      fetcher: async (input, init) => {
        const url = new URL(String(input));
        if (url.hostname !== REGISTRY) return world.agents(input, init);
        // 台帳は、記録を 100 件ずつ返す（外の台帳へは通信しない）。更新された物だけの巡回には、空を返す。
        if (url.searchParams.has('updated_since')) return Response.json({ servers: [], metadata: {} });
        const offset = Number(url.searchParams.get('cursor') ?? 0);
        return Response.json({ servers: world.records.slice(offset, offset + 100), metadata: { nextCursor: offset + 100 < world.records.length ? String(offset + 100) : null } });
      },
    };
    const tick = createIntakeTick(deps), quiet = console.info;
    const lines = [];
    console.info = (line) => { lines.push(JSON.parse(line)); };   // 合図の 1 行は、ここでは集めるだけ
    let wakes = 0;
    // 接続先の表（noah_probe_hosts）の、最後に巡回が握手した時刻。合図のたびに読み、進んだ時は、前の時刻から 1 時間以上あいている事を確かめる。
    const lastProbe = new Map(), spacing = { closest: Infinity, moves: 0 };
    /** 合図を 1 回送る。 */
    const wake = async () => {
      wakes++;
      const timestamp = String(now());
      const response = await tick(new Request(`${ORIGIN}/api/noah/intake/tick`, { method: 'POST', body: '{}', headers: { 'x-noah-time': timestamp, 'x-noah-signature': await noahWakeSignature(key, timestamp) } }));
      const result = await response.json();
      assert.equal(response.status, 200, JSON.stringify(result));
      for (const row of await many('SELECT host,last_probe_at FROM noah_probe_hosts WHERE last_probe_at > 0')) {
        const before = lastProbe.get(row.host);
        if (before !== undefined && row.last_probe_at !== before) {
          spacing.moves++; spacing.closest = Math.min(spacing.closest, row.last_probe_at - before);
          assert.ok(row.last_probe_at - before >= HOUR, `同じ接続先への握手が、${row.last_probe_at - before} ミリ秒で続いた`);
        }
        lastProbe.set(row.host, row.last_probe_at);
      }
      return result;
    };
    /** 握手する物が無くなるまで、1 分おきに合図を送る。握手の数を返す。 */
    const settle = async () => {
      let probes = 0;
      for (let idle = 0, guard = 0; idle < 2 && guard < 60; guard++) { advance(60_000); const result = await wake(); probes += result.probe?.probes ?? 0; idle = result.probe?.probes ? 0 : idle + 1; }
      return probes;
    };
    const listed = async () => (await one('SELECT COUNT(*) AS n FROM noah_intake_families WHERE listed=1 AND level>=1 AND withdrawn_at IS NULL AND hidden_at IS NULL')).n;
    const check = (i) => one('SELECT level,result,failures,next_check_at,checked_at FROM noah_intake_checks WHERE candidate_id=?', world.family(i));
    const family = (i) => one('SELECT listed,level FROM noah_intake_families WHERE id=?', world.family(i));
    /** 同じ接続先への握手が、直近 1 時間に 2 回以上あった接続先の数（spec-97 の 6 章の問い合わせ）。 */
    const crowded = async () => (await one('SELECT COUNT(*) AS n FROM (SELECT c.host FROM noah_intake_checks k JOIN noah_intake_candidates c ON c.id = k.candidate_id WHERE k.checked_at > ? AND c.host IS NOT NULL GROUP BY c.host HAVING COUNT(*) > 1)', now() - HOUR)).n;

    try {
      // 1. 台帳を読み、握手で載せる。接続先が別々の 50 件は、最初の数分で載る。同じ接続先を分け合う 3 件は、1 時間に 1 件ずつ。
      await settle();
      assert.equal(await listed(), PROVIDERS + 1, '握手が通った 50 件と、同じ接続先の 3 件のうちの 1 件が載る');
      assert.equal(await crowded(), 0);
      for (let hour = 0; hour < 3; hour++) { advance(HOUR); await settle(); assert.equal(await crowded(), 0); }
      const listedAll = await listed();
      assert.equal(listedAll, PROVIDERS + 3, '同じ接続先の 3 件も、1 時間に 1 件ずつ握手して、載る');

      // 2. 相手を 1 件止める。次の見回り（7 日後）で 1 回目の失敗: 一覧に残り、6 時間後に確かめ直す。2 回続けて失敗で、一覧から消える。
      const STOPPED = 7;
      world.servers[STOPPED].options.status = 503;
      advance(7 * DAY);
      await settle();
      const once = await check(STOPPED);
      assert.deepEqual([once.level, once.failures, once.next_check_at - once.checked_at, (await family(STOPPED)).listed], [1, 1, 6 * HOUR, 1], '1 回目の失敗では、外さない');
      assert.equal(await listed(), listedAll);
      advance(6 * HOUR);
      await settle();
      const twice = await check(STOPPED);
      assert.deepEqual([twice.level, twice.failures, twice.result, (await family(STOPPED)).listed], [0, 2, 'unreachable', 0], '2 回続けて失敗で、外す');
      const listedAfterStop = await listed();
      assert.equal(listedAfterStop, listedAll - 1, '止めた 1 件だけが、一覧から消える');
      // 相手が戻る。次の見回り（14 日後）で握手が通ると、「まだ誰も動かしていない」に戻る。
      world.servers[STOPPED].options.status = undefined;
      advance(14 * DAY);
      await settle();
      assert.deepEqual([(await check(STOPPED)).level, (await check(STOPPED)).failures, (await family(STOPPED)).listed, (await family(STOPPED)).level], [1, 0, 1, 1], '握手が通ると、戻る');
      const listedAfterReturn = await listed();
      assert.equal(listedAfterReturn, listedAll);

      // 3. 後始末。止まった依頼と接続を作ってから、合図を 1 回送る。
      const connectApi = createNoahConnectApi(deps), planApi = createNoahConnectPlanApi(deps), askApi = createNoahAskApi(deps), service = createNoahAskService(deps);
      const send = async (handler, method, path, body) => {
        const response = await handler(new Request(ORIGIN + path, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }), headers: method === 'GET' ? {} : { Origin: ORIGIN, 'Content-Type': 'application/json', 'X-Rock-Owner-Scope': await ownerScopeFor(OWNER) } }));
        return { status: response.status, body: await response.json() };
      };
      const connect = async (i, id = randomUUID()) => {
        advance(7_000);
        const plan = await send(planApi, 'GET', `/api/noah/connect-plan?agent=${encodeURIComponent(world.family(i))}`);
        assert.equal(plan.status, 200, JSON.stringify(plan.body));
        return { id, reply: send(connectApi.collection, 'POST', '/api/noah/connect', { id, agentId: world.family(i), planSha256: plan.body.planSha256 }) };
      };
      const main = await connect(0);
      assert.equal((await main.reply).body.state, 'connected');
      await drain();
      advance(7_000);
      const tools = await send((request) => connectApi.tools(request, main.id), 'GET', `/api/noah/connect/${main.id}/tools`);
      await drain();
      const form = { tool: 'lookup', toolSha256: tools.body.tools.find((item) => item.name === 'lookup').sha256, input: { query: 'q' } };
      const ask = async () => {
        advance(7_000);
        const id = randomUUID(), reply = await send(askApi.collection, 'POST', '/api/noah/ask', { id, connectionId: main.id, form, screen: 'narrow' });
        assert.equal(reply.status, 202, JSON.stringify(reply.body));
        return id;
      };
      const hold = world.holds[0], server = world.servers[0];
      // (a) 相手へ送った後に、実行の場が落ちた依頼。
      hold['tools/call'] = gate();
      const sentAsk = await ask();
      await hold['tools/call'].arrived;
      // (b) 握手の途中で、実行の場が落ちた依頼（相手へは、送っていない）。
      hold['tools/list'] = gate();
      const unsentAsk = await ask();
      await hold['tools/list'].arrived;
      // (c) 受け付けた後、実行が始まらなかった依頼。
      advance(7_000);
      const idleAsk = randomUUID();
      const accepted = await service.ask(OWNER, false, { id: idleAsk, connectionId: main.id, ...form, confirm: false, screen: null });
      assert.equal(accepted.status, 202);
      // (d) 握手の途中で止まった接続（別の相手）。
      world.holds[1].initialize = gate();
      const half = await connect(1);
      await world.holds[1].initialize.arrived;
      // 止めていた要求は、そのまま。後から来る要求（巡回の握手）は、止めない。
      const gates = [hold['tools/call'], hold['tools/list'], world.holds[1].initialize];
      delete hold['tools/call']; delete hold['tools/list']; delete world.holds[1].initialize;
      assert.deepEqual((await many('SELECT state,tool_calls FROM noah_asks ORDER BY created_at')).map((row) => [row.state, row.tool_calls]), [['running', 1], ['running', 0], ['queued', 0]]);
      assert.equal((await one('SELECT state FROM noah_connections WHERE id=?', half.id)).state, 'probing');

      // まだ早い合図（lease の中・60 秒の前・30 秒の前）では、片付けない。
      advance(5_000);
      assert.equal('swept' in (await wake()), false);
      // 時間がたった後の合図で、片付ける。相手へは、何も送らない。
      advance(Math.max(NOAH_ASK_RUN_LIMITS.leaseMs + NOAH_ASK_LEASE_GRACE_MS, NOAH_SWEEP_LIMITS.queuedMs, NOAH_SWEEP_LIMITS.connectingMs) + 1_000);
      const received = [server.log.length, world.servers[1].log.length];
      lines.length = 0;
      const swept = (await wake()).swept;
      assert.deepEqual(swept, { asksUnknown: 1, asksFailed: 2, asksStopped: 0, connections: 1 });
      assert.deepEqual([server.log.length, world.servers[1].log.length], received, '後始末は、相手へ何も送らない');
      assert.deepEqual([lines.at(-1).event, lines.at(-1).swept], ['noah-patrol', 4]);
      const rowOf = (id) => one('SELECT state,error,tool_calls,lease_until,finished_at,work_id FROM noah_asks WHERE id=?', id);
      const workOf = async (id) => normalizeWorkJob(JSON.parse((await one('SELECT payload FROM work_jobs WHERE id=?', (await rowOf(id)).work_id)).payload));
      assert.deepEqual([(await rowOf(sentAsk)).state, (await rowOf(sentAsk)).error, (await rowOf(sentAsk)).tool_calls], ['unknown', NOAH_ASK_END_MESSAGES.unknown, 1]);
      assert.deepEqual([(await rowOf(unsentAsk)).state, (await rowOf(unsentAsk)).error, (await rowOf(unsentAsk)).tool_calls], ['failed', NOAH_ASK_END_MESSAGES.interrupted, 0]);
      assert.deepEqual([(await rowOf(idleAsk)).state, (await rowOf(idleAsk)).error], ['failed', NOAH_ASK_END_MESSAGES.notStarted]);
      for (const [id, state] of [[sentAsk, 'unknown'], [unsentAsk, 'failed'], [idleAsk, 'failed']]) {
        const job = await workOf(id);
        assert.deepEqual([job.status, job.noahRemote.state, job.noahRemote.result, (await rowOf(id)).lease_until, (await rowOf(id)).finished_at !== null], ['review', state, undefined, 0, true], id);
      }
      const cut = await one('SELECT state,error,disconnected_at FROM noah_connections WHERE id=?', half.id);
      assert.deepEqual([cut.state, cut.error, cut.disconnected_at !== null], ['disconnected', NOAH_SWEEP_CONNECTING_MESSAGE, true]);
      assert.equal((await one('SELECT state FROM noah_connections WHERE id=?', main.id)).state, 'connected', 'つながっている接続は、変えない');
      // 片付ける物が無い時の後始末は、D1 へ 3 往復（終わっていない物だけを持つ、小さな索引を読む）。
      const before = trips.n;
      assert.deepEqual(await createNoahSweep(deps)(), noSweep());
      const idleTrips = trips.n - before;

      // 止まっていた要求が、後から動いても、何も変わらない: 道具を呼ばない・届いた成果を採らない・切った接続を戻さない。
      const callsBefore = server.log.filter((request) => request.rpc === 'tools/call').length;
      for (const stuck of gates) stuck.open();
      assert.equal((await half.reply).body.state, 'disconnected');
      await accepted.run();
      await drain();
      assert.deepEqual([(await rowOf(sentAsk)).state, (await rowOf(unsentAsk)).state, (await rowOf(idleAsk)).state, (await workOf(sentAsk)).noahRemote.result], ['unknown', 'failed', 'failed', undefined]);
      assert.equal(server.log.filter((request) => request.rpc === 'tools/call').length, callsBefore);
      assert.equal((await one('SELECT state FROM noah_connections WHERE id=?', half.id)).state, 'disconnected');
      assert.equal((await one('SELECT COUNT(*) AS n FROM noah_asks WHERE finished_at IS NULL')).n, 0, '終わっていない依頼が、残らない');

      // 4. 礼儀: 同じ接続先への巡回の握手は、1 時間に 1 回まで（接続先の表の記録と、相手が受けた時刻の、両方で）。巡回は、道具を呼ばない。
      assert.ok(spacing.moves > 0 && spacing.closest >= HOUR, `接続先の表の記録で、握手の間隔が ${spacing.closest} ミリ秒`);
      let closest = Infinity;
      for (const times of world.patrolAt.values()) for (let i = 1; i < times.length; i++) closest = Math.min(closest, times[i] - times[i - 1]);
      assert.ok(closest >= HOUR, `同じ接続先への握手の間隔が ${closest} ミリ秒`);
      assert.equal(await crowded(), 0);
      const sharedShakes = world.patrolAt.get('shared.example.com').length;
      const toolCalls = [...world.servers, ...world.shared].reduce((total, item) => total + item.log.filter((request) => request.rpc === 'tools/call').length, 0);
      assert.equal(toolCalls, 1, '道具を呼んだのは、本人が頼んだ 1 回だけ（巡回と後始末は、呼ばない）');
      assert.equal((await one('SELECT COUNT(*) AS n FROM noah_runner_commands')).n, 0, '家の端末への命令は、1 件も増えない');
      const hosts = await one('SELECT COUNT(*) AS n FROM noah_probe_hosts');

      const summary = {
        mode: 'synthetic/local-D1', wakes, providers: PROVIDERS, sharedHostCandidates: 3,
        listed: { afterFirstRound: listedAll, afterStoppingOne: listedAfterStop, afterItCameBack: listedAfterReturn },
        stoppedProvider: { firstFailure: { level: once.level, failures: once.failures, retryInHours: (once.next_check_at - once.checked_at) / HOUR }, secondFailure: { level: twice.level, failures: twice.failures } },
        sameHost: { hostsContacted: hosts.n, closestByHostTableMs: spacing.closest, closestAsReceivedMs: closest, repeatHandshakes: spacing.moves, sharedHostHandshakes: sharedShakes },
        swept, sweepIdleD1RoundTrips: idleTrips, toolCalls, durationMs: Date.now() - started,
      };
      console.log(JSON.stringify(summary, null, 2));
      return summary;
    } finally { console.info = quiet; }
  } finally { await mf.dispose(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length > 2) throw Error('使い方: check-noah-patrol.mjs（引数なし）。表は、いつも手元の、終わると消える物。相手は、いつも合成の物');
  await checkNoahPatrol();
}

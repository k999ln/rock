// 巡回での握手（L1）。握手の結果を握手の表に書く・系列へ写す・対象から外す物・同じ接続先の間隔・同時の数と時間。
// 通信はしない。台帳も接続先も、この試験の中の関数（合成のサーバー）。道具は 1 回も呼ばない事を、受けた要求の記録で確かめる。
// 仕様: docs/noah/spec-86-remote-mouth.md の 4.2・6 章・10.3・10.4、spec-88-mass-probe.md の 9.3・9.4・9.7・9.8。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createIntakeTick } from '../lib/noah-intake-api.ts';
import { NOAH_LISTING_SQL } from '../lib/noah-intake-listing.ts';
import { parseNoahFlags } from '../lib/noah-flags.ts';
import { noahWakeSignature } from '../lib/noah-intake-wake.ts';
import { NoahMouthError } from '../lib/noah-mouth-mcp-remote.ts';
import { NOAH_CHECK_INTERVALS, NOAH_FAILURES_TO_UNLIST, NOAH_PROBE, nextNoahCheck, planNoahProbeWrite, probeL1 } from '../lib/noah-probe.ts';
import { fixture, entry, page, NOW } from './fixtures/noah/intake.mjs';
import { mcpServer, network, tool } from './fixtures/noah/mcp-server.mjs';

const HOUR = 3_600_000, DAY = 24 * HOUR;
const REGISTRY = 'registry.modelcontextprotocol.io';
const id = (i) => `mcp-registry:test.provider/agent-${i}`;
const host = (i) => `agent-${i}.example.com`;
const remote = (url) => ({ remotes: [{ type: 'streamable-http', url }] });
const NONE = { probes: 0, ok: 0, authRequired: 0, unreachable: 0, rateLimited: 0, skippedHost: 0, toolsChanged: 0 };
/** 入力欄にできない道具（必須の入力が入れ子）。 */
const nested = (name) => tool(name, false, { inputSchema: { type: 'object', required: ['o'], properties: { o: { type: 'object' } } } });
const family = (f, key) => f.sql.prepare('SELECT * FROM noah_intake_families WHERE id=?').get(key);
const listed = async (f) => (await f.store.list(null, new URLSearchParams())).items.map((item) => [item.id, item.section]).sort((a, b) => a[0].localeCompare(b[0]));
const rpcs = (server) => server.log.map((request) => request.rpc ?? request.method);
/**
 * 台帳と、接続先ごとの合成のサーバーを持つ世界。servers は { host: mcpServer(...) | (url, init) => Response }。
 * records は、台帳が返す記録の並び（関数なら、呼ぶたびに読む）。
 */
function world(t, records, servers, extra = {}) {
  const net = network({ [REGISTRY]: async () => page(typeof records === 'function' ? records() : records), ...Object.fromEntries(Object.entries(servers).map(([name, server]) => [name, typeof server === 'function' ? server : server.fetch])) });
  const f = fixture(t, net.fetch, extra);
  return { f, net, patrol: (ms = 25_000) => f.store.probeDue(f.time() + ms) };
}
const state = (change = {}) => ({
  level: 0, result: 'unchecked', auth: 'unknown', toolsSha256: null, toolCount: null, readOnly: null, formTools: null, oneTapTools: null,
  latencyMs: null, checkedAt: null, l1At: null, l2At: null, nextCheckAt: 0, failures: 0, firstFailureAt: null, ...change,
});
const passed = (change = {}) => ({ ok: true, toolsSha256: 'b'.repeat(64), toolCount: 3, readOnly: false, formTools: 2, oneTapTools: 1, latencyMs: 800, ...change });

void test('the check interval: a first failure is retried in six hours, later ones double up to thirty days', () => {
  const at = (input) => nextNoahCheck({ now: 0, connected: false, level: 1, failures: 0, firstFailureAt: null, ...input });
  assert.deepEqual([at({}).at, at({ level: 2 }).at, at({ connected: true }).at], [7 * DAY, 3 * DAY, DAY]);
  assert.deepEqual([1, 2, 3, 4, 9].map((failures) => at({ level: 0, failures, firstFailureAt: 0 }).at), [6 * HOUR, 14 * DAY, 28 * DAY, 30 * DAY, 30 * DAY]);
  assert.deepEqual([at({ failures: 3, firstFailureAt: 0, now: 30 * DAY - 1 }).hide, at({ failures: 3, firstFailureAt: 0, now: 30 * DAY }).hide, at({ now: 99 * DAY }).hide], [false, true, false]);
  assert.deepEqual([NOAH_FAILURES_TO_UNLIST, NOAH_CHECK_INTERVALS.retry, NOAH_PROBE.timeoutMs, NOAH_PROBE.hostEveryMs], [2, 6 * HOUR, 12_000, HOUR]);
});

void test('what a handshake writes, answer by answer', () => {
  const plan = (previous, outcome, connected = false) => planNoahProbeWrite(state(previous), outcome, { now: NOW, connected });
  const pick = (write, keys) => Object.fromEntries(keys.map((key) => [key, write.state[key]]));
  // 通った: 握手まで（1）。道具の定義の hash と数を持つ。定義の本文は持たない。
  const first = plan({}, passed());
  assert.deepEqual(first.state, state({ level: 1, result: 'ok', auth: 'none', toolsSha256: 'b'.repeat(64), toolCount: 3, readOnly: false, formTools: 2, oneTapTools: 1, latencyMs: 800, checkedAt: NOW, l1At: NOW, nextCheckAt: NOW + 7 * DAY }));
  assert.deepEqual([first.toolsChanged, first.hide, first.unhide, first.hostWaitUntil], [false, false, true, null]);
  // 「動いた」の物は、握手が通っても 2 のまま。その段になった時刻も、そのまま。
  const ran = state({ level: 2, result: 'ok', auth: 'none', toolsSha256: 'a'.repeat(64), l1At: 5, l2At: 9 });
  assert.deepEqual(pick(plan(ran, passed()), ['level', 'l1At', 'l2At', 'nextCheckAt']), { level: 2, l1At: 5, l2At: 9, nextCheckAt: NOW + 3 * DAY });
  assert.equal(plan(ran, passed(), true).state.nextCheckAt, NOW + DAY, 'つないでいる人が居る系列は、24 時間ごと');
  // 道具の定義が変わっても、level は変えない。hash と数を新しくするだけ。
  const changed = plan(ran, passed({ toolCount: 4 }));
  assert.deepEqual([changed.toolsChanged, changed.state.level, changed.state.toolsSha256, changed.state.toolCount], [true, 2, 'b'.repeat(64), 4]);
  assert.equal(plan(ran, passed({ toolsSha256: 'a'.repeat(64) })).toolsChanged, false);
  // 道具が 0 個: 頼める事が無い。
  assert.deepEqual(pick(plan(ran, passed({ toolCount: 0, formTools: 0, oneTapTools: 0 })), ['level', 'result', 'auth', 'l1At', 'l2At', 'nextCheckAt']), { level: 0, result: 'incompatible', auth: 'none', l1At: null, l2At: null, nextCheckAt: NOW + 7 * DAY });
  // 相手が応答したが、使えない: その場で 0。失敗の数は 0 に戻す。
  const failing = { ...ran, failures: 1, firstFailureAt: 3 };
  const unusable = {
    auth_required: { result: 'auth_required', auth: 'unknown', nextCheckAt: NOW + 30 * DAY },
    payment_required: { result: 'payment_required', auth: 'payment', nextCheckAt: NOW + 30 * DAY },
    forbidden: { result: 'forbidden', auth: 'unknown', nextCheckAt: NOW + 7 * DAY },
    incompatible: { result: 'incompatible', auth: 'none', nextCheckAt: NOW + 7 * DAY },
    too_large: { result: 'too_large', auth: 'none', nextCheckAt: NOW + 30 * DAY },
    blocked: { result: 'blocked', auth: 'none', nextCheckAt: NOAH_PROBE.never },
  };
  for (const code of Object.keys(unusable)) {
    const write = plan(failing, { ok: false, code });
    assert.deepEqual(pick(write, ['level', 'result', 'auth', 'nextCheckAt', 'l1At', 'l2At', 'failures', 'firstFailureAt', 'checkedAt']), { level: 0, l1At: null, l2At: null, failures: 0, firstFailureAt: null, checkedAt: NOW, ...unusable[code] }, code);
    assert.deepEqual([write.unhide, write.hide, write.state.toolsSha256], [true, false, 'a'.repeat(64)], `${code}: 前に見た道具の hash は残す`);
  }
  assert.equal(plan(ran, { ok: false, code: 'blocked', redirected: true }).state.nextCheckAt, NOW + 30 * DAY, '別の接続先へ回す相手は、30 日後に確かめ直す');
  // 応答しない: 1 回目は、そのまま（一覧に残る）。6 時間後に確かめ直す。
  const once = plan(ran, { ok: false, code: 'unreachable' });
  assert.deepEqual(pick(once, ['level', 'result', 'failures', 'firstFailureAt', 'nextCheckAt', 'l2At', 'auth']), { level: 2, result: 'unreachable', failures: 1, firstFailureAt: NOW, nextCheckAt: NOW + 6 * HOUR, l2At: 9, auth: 'none' });
  assert.deepEqual([once.unhide, once.hide], [false, false]);
  // 2 回続いたら 0。「動いた」も消える。
  const twice = plan({ ...ran, failures: 1, firstFailureAt: NOW - 6 * HOUR }, { ok: false, code: 'unreachable' });
  assert.deepEqual(pick(twice, ['level', 'failures', 'firstFailureAt', 'nextCheckAt', 'l1At', 'l2At']), { level: 0, failures: 2, firstFailureAt: NOW - 6 * HOUR, nextCheckAt: NOW + 14 * DAY, l1At: null, l2At: null });
  // 最初の失敗から 30 日: 隠す。
  const month = plan({ ...ran, level: 0, failures: 3, firstFailureAt: NOW - 30 * DAY }, { ok: false, code: 'unreachable' });
  assert.deepEqual([month.hide, month.unhide, month.state.nextCheckAt], [true, false, NOW + 30 * DAY]);
  // 握手が通ると、握手まで（1）に戻る。「動いた」は、人が動かすまで戻らない。
  const back = plan({ ...ran, level: 0, l1At: null, l2At: null, failures: 3, firstFailureAt: 3 }, passed());
  assert.deepEqual(pick(back, ['level', 'failures', 'firstFailureAt', 'l1At', 'l2At']), { level: 1, failures: 0, firstFailureAt: null, l1At: NOW, l2At: null });
  assert.equal(back.unhide, true);
  // 混んでいる: 失敗に数えない。level も変えない。相手が言った時刻まで待つ。
  const limited = plan(failing, { ok: false, code: 'rate_limited', retryAfterSeconds: 120 });
  assert.deepEqual(pick(limited, ['level', 'result', 'failures', 'firstFailureAt', 'nextCheckAt', 'auth']), { level: 2, result: 'rate_limited', failures: 1, firstFailureAt: 3, nextCheckAt: NOW + 120_000, auth: 'none' });
  assert.deepEqual([limited.hostWaitUntil, limited.unhide], [NOW + 120_000, false]);
  assert.equal(plan(ran, { ok: false, code: 'rate_limited' }).hostWaitUntil, NOW + 60_000, '相手が時刻を言わない時は 60 秒');
});

void test('one handshake: tools are listed, never called; a 401 ends after the first request', async () => {
  const open = mcpServer({ session: 'sess-9', tools: [tool('search', true, { inputSchema: { type: 'object', required: ['q'], properties: { q: { type: 'string' } } } }), tool('ping'), nested('configure')] });
  const outcome = await probeL1('https://api.example.com/mcp', { fetch: open.fetch }, () => NOW);
  assert.deepEqual({ ...outcome, toolsSha256: outcome.toolsSha256.length }, { ok: true, toolsSha256: 64, toolCount: 3, readOnly: false, formTools: 2, oneTapTools: 1, latencyMs: 0 });
  assert.deepEqual(rpcs(open), ['initialize', 'notifications/initialized', 'tools/list', 'DELETE'], 'セッションは閉じる。道具は呼ばない');
  const closed = mcpServer({ needsToken: 'x' });
  assert.deepEqual(await probeL1('https://api.example.com/mcp', { fetch: closed.fetch }), { ok: false, code: 'auth_required' });
  assert.deepEqual(rpcs(closed), ['initialize'], '相手の許可の公開情報を、探しに行かない');
  assert.deepEqual(await probeL1('https://api.example.com/mcp', { fetch: mcpServer({ status: 429, statusHeaders: { 'retry-after': '90' } }).fetch }), { ok: false, code: 'rate_limited', retryAfterSeconds: 90 });
  // 応答の本文を読む途中で切れた時も、「応答しない」に数える（投げない）。
  const broken = async () => new Response(new ReadableStream({ pull(controller) { controller.error(new TypeError('terminated')); } }), { headers: { 'content-type': 'application/json' } });
  assert.deepEqual(await probeL1('https://api.example.com/mcp', { fetch: broken }), { ok: false, code: 'unreachable' });
});

void test('a handshake that passes is written to the checks row and copied to the family without waiting for a regroup', async (t) => {
  const servers = { [host(1)]: mcpServer(), [host(2)]: mcpServer({ tools: [nested('configure')] }), [host(3)]: mcpServer({ tools: [] }) };
  const { f, net, patrol } = world(t, [entry(1), entry(2), entry(3)], servers);
  await f.store.sync();
  const regroups = f.batches.length;
  assert.deepEqual(await patrol(), { ...NONE, probes: 3, ok: 2 });
  const check = f.check(1);
  assert.deepEqual({ ...check, connect_json: '', connect_sha256: '', tools_sha256: check.tools_sha256.length }, {
    candidate_id: id(1), mouth: 'mcp-remote', surface: 'none', auth: 'none', connect_json: '', connect_sha256: '', setup: 0, oauth_json: null,
    tools_sha256: 64, tool_count: 2, read_only: 0, form_tools: 2, one_tap_tools: 1, level: 1, result: 'ok', latency_ms: 0, sample_json: null,
    checked_at: NOW, l1_at: NOW, l2_at: null, next_check_at: NOW + 7 * DAY, failures: 0, first_failure_at: null, lease_until: 0,
  });
  // 入力欄で使える道具が無い接続先は、握手が通っても載せない。道具が 0 個の接続先も。
  assert.deepEqual([f.check(2).level, f.check(2).result, f.check(2).form_tools, family(f, id(2)).listed], [1, 'ok', 0, 0]);
  assert.deepEqual([f.check(3).level, f.check(3).result, f.check(3).auth, f.check(3).tool_count], [0, 'incompatible', 'none', 0]);
  assert.deepEqual(await listed(f), [[id(1), 'new']]);
  assert.deepEqual([family(f, id(1)).listed, family(f, id(1)).level, family(f, id(1)).one_tap, family(f, id(1)).badge_hint], [1, 1, 1, 'unverified']);
  assert.equal(f.batches.slice(regroups).flat().some((query) => query.includes('noah_intake_candidates SET family_id')), false, '名寄せを呼ばない');
  // 相手が受けた要求: 初期化・通知・道具の一覧だけ。名乗りは NoahBot/1。
  assert.deepEqual(rpcs(servers[host(1)]), ['initialize', 'notifications/initialized', 'tools/list']);
  assert.ok(servers[host(1)].log.every((request) => request.headers['user-agent'] === 'NoahBot/1 (+https://avoado.si/noah/help#bot)'));
  assert.deepEqual(net.hosts.filter((name) => name !== REGISTRY).sort((a, b) => a.localeCompare(b)), [host(1), host(1), host(1), host(2), host(2), host(2), host(3), host(3), host(3)]);
  // 期限が来るまで、もう握手しない。
  assert.deepEqual(await patrol(), NONE);
});

void test('every kind of answer lands in the checks row as the table says', async (t) => {
  const answers = {
    1: mcpServer({ needsToken: 'x' }), 2: mcpServer({ status: 402 }), 3: mcpServer({ status: 403 }), 4: mcpServer({ status: 404 }), 5: mcpServer({ status: 410 }),
    6: mcpServer({ status: 503 }), 7: mcpServer({ status: 405 }), 8: async () => new Response('<html>', { headers: { 'content-type': 'text/html' } }),
    9: mcpServer({ tools: Array.from({ length: 501 }, (_, i) => tool(`t${i}`)) }), 10: mcpServer({ status: 429, statusHeaders: { 'retry-after': '120' } }),
  };
  // 11 は、つながらない（合成の網に、その host が無い）。
  const { f, net, patrol } = world(t, Array.from({ length: 11 }, (_, i) => entry(i + 1)), Object.fromEntries(Object.entries(answers).map(([i, server]) => [host(i), server])), { budget: { pages: 10, probes: 12, concurrent: 4, seconds: 60 } });
  await f.store.sync();
  assert.deepEqual(await patrol(60_000), { ...NONE, probes: 11, authRequired: 1, unreachable: 4, rateLimited: 1 });
  const row = (i) => { const k = f.check(i); return [k.result, k.level, k.auth, k.next_check_at - NOW, k.failures, k.first_failure_at, k.checked_at, k.lease_until]; };
  assert.deepEqual(row(1), ['auth_required', 0, 'unknown', 30 * DAY, 0, null, NOW, 0]);
  assert.deepEqual(row(2), ['payment_required', 0, 'payment', 30 * DAY, 0, null, NOW, 0]);
  assert.deepEqual(row(3), ['forbidden', 0, 'unknown', 7 * DAY, 0, null, NOW, 0]);
  for (const i of [4, 5, 6, 11]) assert.deepEqual(row(i), ['unreachable', 0, 'unknown', 6 * HOUR, 1, NOW, NOW, 0], `${i}: 404・410・5xx・つながらない は「応答しない」`);
  assert.deepEqual(row(7), ['incompatible', 0, 'unknown', 7 * DAY, 0, null, NOW, 0]);
  assert.deepEqual(row(8), ['incompatible', 0, 'unknown', 7 * DAY, 0, null, NOW, 0]);
  assert.deepEqual(row(9), ['too_large', 0, 'unknown', 30 * DAY, 0, null, NOW, 0]);
  assert.deepEqual(row(10), ['rate_limited', 0, 'unknown', 120_000, 0, null, NOW, 0], '「混んでいる」は、失敗に数えない');
  // 401 の相手が受けたのは、初期化の 1 回だけ。認可サーバーの host へは 0 回（知らない host へ送ると、合成の網に記録が残る）。
  assert.deepEqual(rpcs(answers[1]), ['initialize']);
  assert.deepEqual([...new Set(net.hosts)].sort((a, b) => a.localeCompare(b)), [...Array.from({ length: 11 }, (_, i) => host(i + 1)), REGISTRY].sort((a, b) => a.localeCompare(b)));
  assert.deepEqual(await listed(f), []);
  // 「混んでいる」と返した接続先へは、その時刻まで送らない。
  assert.equal(f.sql.prepare('SELECT not_before FROM noah_probe_hosts WHERE host=?').get(host(10)).not_before, NOW + 120_000);
  const sent = answers[10].log.length;
  f.advance(119_000);
  f.sql.prepare('UPDATE noah_intake_checks SET next_check_at=0 WHERE candidate_id=?').run(id(10));
  assert.deepEqual(await patrol(60_000), { ...NONE, skippedHost: 1 });
  assert.equal(answers[10].log.length, sent);
});

void test('one failure keeps the listing and retries in six hours; two in a row unlist; a passing handshake brings it back as not yet run', async (t) => {
  const server = mcpServer({ status: () => (down ? 503 : 0) });
  let down = false;
  const { f, patrol } = world(t, [entry(1)], { [host(1)]: server });
  await f.store.sync();
  await patrol();
  // 人が動かして「動いた」になった形にする（付けるのは L6・L7）。
  f.sql.prepare('UPDATE noah_intake_checks SET level=2,l2_at=? WHERE candidate_id=?').run(NOW + 5, id(1));
  f.sql.prepare("UPDATE noah_intake_families SET level=2,l2_at=?,badge_hint='one_click' WHERE id=?").run(NOW + 5, id(1));
  assert.deepEqual(await listed(f), [[id(1), 'ran']]);
  down = true;
  // 次の握手は、握手が通った時に決めた 7 日後（「動いた」を付ける時は、巡回の予定を書き換えない）。
  f.advance(7 * DAY);
  assert.deepEqual(await patrol(), { ...NONE, probes: 1, unreachable: 1 });
  assert.deepEqual([f.check(1).level, f.check(1).failures, f.check(1).next_check_at - f.time(), f.check(1).first_failure_at], [2, 1, 6 * HOUR, f.time()]);
  assert.deepEqual(await listed(f), [[id(1), 'ran']], '1 回の失敗では外さない');
  const firstFailure = f.time();
  f.advance(6 * HOUR);
  assert.deepEqual(await patrol(), { ...NONE, probes: 1, unreachable: 1 });
  assert.deepEqual([f.check(1).level, f.check(1).failures, f.check(1).first_failure_at, f.check(1).next_check_at - f.time(), f.check(1).l1_at, f.check(1).l2_at], [0, 2, firstFailure, 14 * DAY, null, null]);
  assert.deepEqual(await listed(f), [], '2 回続けて失敗したら、一覧と検索から外す');
  assert.deepEqual([family(f, id(1)).listed, family(f, id(1)).level, family(f, id(1)).l2_at], [0, 0, null]);
  down = false;
  f.advance(14 * DAY);
  assert.deepEqual(await patrol(), { ...NONE, probes: 1, ok: 1 });
  assert.deepEqual([f.check(1).level, f.check(1).failures, f.check(1).first_failure_at, f.check(1).l1_at], [1, 0, null, f.time()]);
  assert.deepEqual(await listed(f), [[id(1), 'new']], '「動いた」は、人が動かすまで戻らない');
});

void test('thirty days of failures hide the family; the handshake that passes brings it back', async (t) => {
  const server = mcpServer({ status: () => (down ? 503 : 0) });
  let down = true;
  const { f, patrol } = world(t, [entry(1)], { [host(1)]: server });
  await f.store.sync();
  // 1 回目（今）・6 時間後・14 日後・28 日後（最初の失敗から 42 日）。
  const steps = [0, 6 * HOUR, 14 * DAY, 28 * DAY], hidden = [];
  for (const step of steps) {
    f.advance(step);
    assert.equal((await patrol()).unreachable, 1);
    hidden.push(family(f, id(1)).hidden_at !== null);
  }
  assert.deepEqual(hidden, [false, false, false, true], '最初の失敗から 30 日たった握手で隠す');
  assert.equal(f.check(1).next_check_at - f.time(), 30 * DAY);
  down = false;
  f.advance(30 * DAY);
  assert.equal((await patrol()).ok, 1);
  assert.equal(family(f, id(1)).hidden_at, null);
  assert.deepEqual(await listed(f), [[id(1), 'new']]);
});

void test('tool definitions that changed update the hash and the count; the level and the family row stay', async (t) => {
  const server = mcpServer();
  const { f, patrol } = world(t, [entry(1)], { [host(1)]: server });
  await f.store.sync();
  await patrol();
  const before = { check: f.check(1), family: family(f, id(1)) };
  server.state.tools = [...server.state.tools, tool('extra', false, { inputSchema: { type: 'object', required: ['q'], properties: { q: { type: 'string' } } } })];
  f.advance(7 * DAY);
  assert.deepEqual(await patrol(), { ...NONE, probes: 1, ok: 1, toolsChanged: 1 });
  const after = f.check(1);
  assert.notEqual(after.tools_sha256, before.check.tools_sha256);
  assert.deepEqual([after.level, after.tool_count, after.form_tools, after.l1_at], [1, 3, 3, before.check.l1_at]);
  assert.deepEqual(family(f, id(1)), before.family, '載せる条件が変わらない時は、系列の行を書かない');
  f.advance(7 * DAY);
  assert.deepEqual(await patrol(), { ...NONE, probes: 1, ok: 1 }, '同じ定義なら、変わった数に数えない');
});

void test('candidates that need a key, bulk families, withdrawn families and withdrawn records are never contacted', async (t) => {
  const keyed = entry(2, { remotes: [{ type: 'streamable-http', url: `https://${host(2)}/mcp`, headers: [{ name: 'X-Api-Key', isRequired: true, isSecret: true }] }] });
  const bulk = Array.from({ length: 20 }, (_, i) => entry(100 + i, remote(`https://shared.example.com/mcp/${i}`)));
  const servers = Object.fromEntries([host(1), host(2), host(40), host(41), 'shared.example.com'].map((name) => [name, mcpServer()]));
  const { f, net, patrol } = world(t, [entry(1), keyed, ...bulk, entry(40), entry(41, {}, 'deleted')], servers, { budget: { pages: 10, probes: 8, concurrent: 4, seconds: 25 } });
  await f.store.sync();
  // 運営が、系列を取り下げる。
  const withdrawn = await f.store.detail(id(40), null, true);
  await f.store.moderate('withdraw', id(40), withdrawn.revision);
  // 量産の系列の候補は、名寄せの直後に 30 日後へ送ってある（握手の期限の列に、並ばない）。
  assert.deepEqual(f.sql.prepare("SELECT DISTINCT k.next_check_at AS at FROM noah_intake_checks k JOIN noah_intake_candidates c ON c.id=k.candidate_id WHERE c.family_id LIKE 'bulk:%'").all().map((r) => r.at), [NOW + 30 * DAY]);
  assert.deepEqual(await patrol(), { ...NONE, probes: 1, ok: 1 });
  for (let hour = 0; hour < 3; hour++) { f.advance(HOUR); assert.deepEqual(await patrol(), NONE); }
  assert.deepEqual([...new Set(net.hosts)].sort((a, b) => a.localeCompare(b)), [host(1), REGISTRY].sort((a, b) => a.localeCompare(b)), '握手したのは、鍵の要らない、量産でない、取り下げていない 1 件だけ');
  // 取り下げた系列と、台帳で取り下げになった記録は、取った時に 30 日後へ送る。鍵の要る候補は、取りもしない。
  assert.deepEqual([f.check(40).next_check_at, f.check(41).next_check_at, f.check(40).result, f.check(40).lease_until], [NOW + 30 * DAY, NOW + 30 * DAY, 'unchecked', 0]);
  assert.deepEqual([f.check(2).setup, f.check(2).checked_at, f.check(2).lease_until], [1, null, 0]);
  // 戻すと、次の名寄せ（1 日 1 回）で期限が今に戻り、握手する。
  await f.store.moderate('restore', id(40), withdrawn.revision + 1);
  f.advance(DAY);
  await f.store.sync();
  assert.equal(f.check(40).next_check_at, f.time());
  assert.deepEqual(await patrol(), { ...NONE, probes: 1, ok: 1 });
  assert.equal(f.check(40).level, 1);
});

void test('a bulk family that dissolves is handshaken after the next regroup', async (t) => {
  let records = Array.from({ length: 20 }, (_, i) => entry(i, remote(`https://shared.example.com/mcp/${i}`)));
  const server = mcpServer();
  const { f, patrol } = world(t, () => records, { 'shared.example.com': server });
  await f.store.sync();
  assert.deepEqual(await patrol(), NONE);
  records = [entry(0, remote('https://shared.example.com/mcp/0'), 'deleted')];
  f.advance(HOUR);
  await f.store.sync();
  records = [];
  f.advance(DAY);
  await f.store.sync();
  assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM noah_intake_checks WHERE next_check_at=?').get(f.time()).n, 19);
  // 同じ接続先なので、1 時間に 1 件ずつ。残りの 18 件は、1 時間後へ送る。
  assert.deepEqual(await patrol(), { ...NONE, probes: 1, ok: 1, skippedHost: 18 });
  assert.equal(server.log.filter((request) => request.rpc === 'initialize').length, 1);
});

void test('the same host is contacted at most once an hour; the others wait without being counted as failures', async (t) => {
  const server = mcpServer();
  const { f, patrol } = world(t, Array.from({ length: 5 }, (_, i) => entry(i + 1, remote(`https://same.example.com/mcp/${i + 1}`))), { 'same.example.com': server });
  await f.store.sync();
  const handshakes = () => server.log.filter((request) => request.rpc === 'initialize').length;
  assert.deepEqual(await patrol(), { ...NONE, probes: 1, ok: 1, skippedHost: 4 });
  assert.deepEqual(f.sql.prepare("SELECT result, failures, next_check_at - ? AS wait, lease_until FROM noah_intake_checks WHERE result='unchecked'").all(NOW).map((row) => ({ ...row })), Array.from({ length: 4 }, () => ({ result: 'unchecked', failures: 0, wait: HOUR, lease_until: 0 })));
  // 59 分後に期限が来ても、握手しない。
  f.advance(59 * 60_000);
  f.sql.prepare("UPDATE noah_intake_checks SET next_check_at=0 WHERE result='unchecked'").run();
  assert.deepEqual(await patrol(), { ...NONE, skippedHost: 4 });
  assert.equal(handshakes(), 1);
  for (let done = 2; done <= 5; done++) {
    f.advance(HOUR);
    assert.equal((await patrol()).ok, 1);
    assert.equal(handshakes(), done);
  }
  assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM noah_intake_checks WHERE level=1').get().n, 5);
});

void test('a server that sends the handshake to another host is blocked, and nothing is sent there', async (t) => {
  const elsewhere = mcpServer();
  const servers = {
    [host(1)]: async () => new Response('', { status: 307, headers: { location: 'https://elsewhere.example.org/mcp' } }),
    'elsewhere.example.org': elsewhere,
    // 同じ host の中の転送には従う。
    [host(2)]: async (url, init) => (new URL(String(url)).pathname === '/mcp' ? new Response('', { status: 308, headers: { location: `https://${host(2)}/v2/mcp` } }) : inner.fetch(url, init)),
  };
  const inner = mcpServer();
  const { f, net, patrol } = world(t, [entry(1), entry(2)], servers);
  await f.store.sync();
  assert.deepEqual(await patrol(), { ...NONE, probes: 2, ok: 1 });
  assert.deepEqual([f.check(1).result, f.check(1).level, f.check(1).next_check_at - NOW, f.check(1).failures], ['blocked', 0, 30 * DAY, 0]);
  assert.deepEqual(net.hosts.filter((name) => name === 'elsewhere.example.org'), [], '転送先へ 1 回も送らない');
  assert.equal(elsewhere.log.length, 0);
  assert.deepEqual(await listed(f), [[id(2), 'new']]);
});

void test('the address check of a Node patrol blocks before anything is sent, and the candidate is not checked again', async (t) => {
  const server = mcpServer();
  const probeCheck = async (url) => { if (url.hostname === host(1)) throw new NoahMouthError('blocked', '内部のアドレスです。'); };
  const { f, patrol } = world(t, [entry(1)], { [host(1)]: server }, { probeCheck });
  await f.store.sync();
  assert.deepEqual(await patrol(), { ...NONE, probes: 1 });
  assert.equal(server.log.length, 0);
  assert.deepEqual([f.check(1).result, f.check(1).level, f.check(1).next_check_at], ['blocked', 0, NOAH_PROBE.never]);
});

void test('the version is announced again once, never a third time', async (t) => {
  const older = mcpServer({ rejects: ['2025-11-25'] }), none = mcpServer({ rejects: ['2025-11-25', '2025-06-18'] });
  const { f, patrol } = world(t, [entry(1), entry(2)], { [host(1)]: older, [host(2)]: none });
  await f.store.sync();
  assert.deepEqual(await patrol(), { ...NONE, probes: 2, ok: 1 });
  assert.deepEqual([f.check(1).result, f.check(2).result], ['ok', 'incompatible']);
  for (const server of [older, none]) assert.deepEqual(server.log.filter((request) => request.rpc === 'initialize').map((request) => request.body.params.protocolVersion), ['2025-11-25', '2025-06-18']);
});

void test('four handshakes at a time, and a wake never starts one it cannot finish inside its 25 seconds', async (t) => {
  let active = 0, most = 0;
  // 握手 1 件が 12 秒（上限）掛かる相手。同時の 4 件で、時計は 12 秒進む。
  const slow = () => mcpServer({
    before: async (body) => {
      if (body?.method === 'initialize') { active++; most = Math.max(most, active); f.advance(3_000); await new Promise((resolve) => setImmediate(resolve)); }
      if (body?.method === 'tools/list') active--;
    },
  });
  const { f, patrol } = world(t, Array.from({ length: 8 }, (_, i) => entry(i + 1)), Object.fromEntries(Array.from({ length: 8 }, (_, i) => [host(i + 1), slow()])));
  await f.store.sync();
  const started = f.time();
  // 台帳の巡回に 2 秒使った後の形: 残りは 23 秒。1 組目（12 秒）の後は、もう 1 組を始めない。
  assert.deepEqual(await f.store.probeDue(started + 23_000), { ...NONE, probes: 4, ok: 4 });
  assert.deepEqual([most, f.time() - started], [4, 12_000]);
  assert.deepEqual(f.sql.prepare('SELECT level, COUNT(*) AS n, MAX(lease_until) AS lease, MAX(next_check_at) > ? AS later FROM noah_intake_checks GROUP BY level ORDER BY level').all(f.time()).map((row) => ({ ...row })),
    [{ level: 0, n: 4, lease: 0, later: 0 }, { level: 1, n: 4, lease: 0, later: 1 }], '握手しなかった 4 件は、期限をそのままにして放す');
  // 握手 1 件の待ち（12 秒）が残っていない合図は、1 件も取らない。
  assert.deepEqual(await f.store.probeDue(f.time() + 11_999), NONE);
  assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM noah_intake_checks WHERE lease_until<>0').get().n, 0);
  // 次の合図で、残りの 4 件。丸ごと 25 秒あれば、2 組（8 件）まで。
  const next = f.time();
  assert.deepEqual(await patrol(), { ...NONE, probes: 4, ok: 4 });
  assert.ok(f.time() - next <= 25_000);
  assert.equal(most, 4);
});

void test('a result is dropped when the intake reset the row while the handshake was in flight', async (t) => {
  const server = mcpServer({ before: (body) => { if (body?.method === 'tools/list') f.sql.prepare('UPDATE noah_intake_checks SET lease_until=0,next_check_at=? WHERE candidate_id=?').run(NOW, id(1)); } });
  const { f, patrol } = world(t, [entry(1)], { [host(1)]: server });
  await f.store.sync();
  const before = family(f, id(1));
  assert.deepEqual(await patrol(), { ...NONE, probes: 1 }, '書けなかった結果は、通った数に数えない');
  assert.deepEqual([f.check(1).level, f.check(1).result, f.check(1).tools_sha256, f.check(1).checked_at], [0, 'unchecked', null, null]);
  assert.deepEqual(family(f, id(1)), before, '系列にも写さない');
});

void test('the wake reads the registry, then handshakes: counts in the answer and in the one log line, the budget from the environment', async (t) => {
  const key = 'synthetic-wake-test-only-'.repeat(2);
  const servers = Object.fromEntries(Array.from({ length: 5 }, (_, i) => [host(i + 1), mcpServer()]));
  let registryDown = false;
  const net = network({ [REGISTRY]: async () => (registryDown ? new Response('', { status: 503 }) : page(Array.from({ length: 5 }, (_, i) => entry(i + 1)))), ...Object.fromEntries(Object.entries(servers).map(([name, server]) => [name, server.fetch])) });
  const f = fixture(t, net.fetch);
  const lines = [];
  t.mock.method(console, 'info', (line) => lines.push(JSON.parse(line)));
  const tick = (env) => createIntakeTick({ ...f.deps, authenticate: async () => { throw Error('UNAUTHORIZED'); }, reviewers: [], flags: parseNoahFlags(env), wakeKey: key });
  const wake = async (env) => {
    const timestamp = String(f.time());
    const response = await tick(env)(new Request('https://noah.test/api/noah/intake/tick', { method: 'POST', body: '{}', headers: { 'x-noah-time': timestamp, 'x-noah-signature': await noahWakeSignature(key, timestamp) } }));
    return [response.status, await response.json()];
  };
  // 巡回を閉じている間は、台帳も読まず、握手もしない。
  assert.deepEqual(await wake({}), [200, { disabled: true }]);
  assert.deepEqual([net.hosts.length, lines.length], [0, 0]);
  // 1 回の合図の握手の数は、環境変数で変えられる（既定は 8）。
  const open = { NOAH_PATROL_ENABLED: 'true', NOAH_PATROL_BUDGET: '{"probes":2}' };
  assert.deepEqual(await wake(open), [200, { pages: 1, seen: 5, changed: 5, more: false, probe: { ...NONE, probes: 2, ok: 2 } }]);
  assert.deepEqual(lines.pop(), { event: 'noah-patrol', pages: 1, seen: 5, changed: 5, skipped: 0, probes: 2, ok: 2, authRequired: 0, unreachable: 0, rateLimited: 0, skippedHost: 0, toolsChanged: 0, swept: 0, error: null, ms: 0 });
  // 台帳を読めない合図でも、握手は進める。応答は 500 のまま。
  registryDown = true;
  f.advance(HOUR);
  assert.deepEqual(await wake(open), [500, { pages: 0, seen: 0, changed: 0, more: true, error: 'unavailable', probe: { ...NONE, probes: 2, ok: 2 } }]);
  const line = lines.pop();
  assert.deepEqual([line.probes, line.ok, line.error], [2, 2, 'unavailable']);
  assert.equal(/example\.com|test\.provider|agent-/.test(JSON.stringify(line)), false, '接続先の名前・URL を出さない');
  // 失敗の後の待ち時間の間の合図は、台帳を読まない。握手は進める。
  registryDown = false;
  f.advance(60_000);
  assert.deepEqual(await wake({ NOAH_PATROL_ENABLED: 'true' }), [200, { pages: 0, seen: 0, changed: 0, more: false, probe: { ...NONE, probes: 1, ok: 1 } }]);
  // 握手する物が無い合図の応答は、台帳の件数だけ。
  f.advance(60_000);
  assert.deepEqual(await wake({ NOAH_PATROL_ENABLED: 'true' }), [200, { pages: 1, seen: 5, changed: 0, more: false }]);
  // 道具は、1 回も呼んでいない。
  assert.deepEqual([...new Set(Object.values(servers).flatMap((server) => rpcs(server)))].sort((a, b) => a.localeCompare(b)), ['initialize', 'notifications/initialized', 'tools/list']);
});

void test('the listing statements in the library are the contract statements, character for character', () => {
  const contract = Object.fromEntries(readFileSync(new URL('../docs/contracts/noah-listing-v1.sql', import.meta.url), 'utf8').split('--> statement-breakpoint').map((part) => [/-- name: (\w+)/.exec(part)[1], part]));
  assert.deepEqual(Object.keys(NOAH_LISTING_SQL).sort((a, b) => a.localeCompare(b)), ['connect_gate', 'counts', 'host_take', 'host_wait', 'new', 'ran', 'reshuffle', 'search', 'touch']);
  for (const [name, statement] of Object.entries(NOAH_LISTING_SQL)) assert.equal(statement, contract[name], name);
});

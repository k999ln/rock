// 取り込みの巡回（公式台帳。最初は全件、その後は更新された物だけ）と、一覧・検索・詳細・集計・取り下げ。
// 台帳は試験用の fetcher。外の接続先・鍵・本番のデータには触らない。仕様: docs/noah/spec-85-intake.md 7 章・11.6。
import test from 'node:test';
import assert from 'node:assert/strict';
import { NOAH_INTAKE, createIntakeStore, noahIntakeText, noahRegistryRecord } from '../lib/noah-intake-store.ts';
import { NOAH_REGISTRY } from '../lib/noah-intake-draft.ts';
import { NOAH_LISTING_REASONS } from '../lib/noah-intake-family.ts';
import { NOAH_LISTING_SQL, noahStatement } from '../lib/noah-intake-sql.ts';
import { H, fixture, intakeDatabase, registry, registryEntry, seedFamily } from './helpers/noah-intake-fixture.mjs';

const HOUR = 3_600_000;
const T0 = Date.UTC(2026, 10, 20, 3, 0, 0);
const UA = 'NoahBot/1 (+https://noah.example.com/noah/help#bot)';
const REGROUP_FIRST = "UPDATE noah_intake_candidates SET family_id = id WHERE state = 'active' AND family_id <> id;";
const names = (n, prefix = 'io.example/agent') => Array.from({ length: n }, (_, i) => `${prefix}-${String(i).padStart(2, '0')}`);

function setup(t, { entries = [], size = 2, budget } = {}) {
  const base = intakeDatabase(t);
  const reg = registry({ entries, size });
  const time = { value: T0 };
  const store = createIntakeStore({ db: base.db, fetcher: reg.fetcher, now: () => time.value, userAgent: UA, ...(budget ? { budget } : {}) });
  const source = () => base.sql.prepare("SELECT * FROM noah_intake_sources WHERE id='mcp-registry'").get();
  const candidate = (name) => base.sql.prepare('SELECT * FROM noah_intake_candidates WHERE id=?').get(`mcp-registry:${name}`);
  const check = (name) => base.sql.prepare('SELECT * FROM noah_intake_checks WHERE candidate_id=?').get(`mcp-registry:${name}`);
  const family = (name) => base.sql.prepare('SELECT * FROM noah_intake_families WHERE id=?').get(`mcp-registry:${name}`);
  const count = (table, where = '1=1') => base.sql.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`).get().n;
  /** 握手が通った後の形にする（握手そのものは L4）。 */
  const handshaken = async (name) => {
    const id = `mcp-registry:${name}`;
    base.sql.prepare("UPDATE noah_intake_checks SET level=1, result='ok', auth='none', tools_sha256=?, tool_count=2, read_only=1, form_tools=2, one_tap_tools=1, l1_at=5, checked_at=5 WHERE candidate_id=?").run(H, id);
    await noahStatement(base.db, NOAH_LISTING_SQL.touch, { candidate_id: id, level: 1, l2_at: null, badge_hint: 'unverified', listed: 1, one_tap: 1, now: 5 }).run();
  };
  return { ...base, reg, time, store, source, candidate, check, family, count, handshaken };
}
const urls = (reg) => reg.state.calls.map((call) => new URL(call.url));
const anonymous = { signedIn: false, reviewer: false };
const member = { signedIn: true, reviewer: false };
const reviewer = { signedIn: true, reviewer: true };
const list = (store, query = '', viewer = member) => store.list(new URLSearchParams(query), viewer);

void test('最初の全件: 3 頁を読み、候補・握手の記録・系列の 3 行が入る。台帳へは、読むだけの要求を送る', async (t) => {
  const f = setup(t, { entries: names(5).map((name) => registryEntry(name)) });
  const result = await f.store.sync();
  assert.deepEqual(result, { outcomes: [{ source: 'mcp-registry', mode: 'full', pages: 3, seen: 5, changed: 5, more: false, error: null }] });
  assert.deepEqual(urls(f.reg).map((url) => [url.origin + url.pathname, url.searchParams.get('limit'), url.searchParams.get('version'), url.searchParams.get('updated_since'), url.searchParams.get('cursor')]), [
    ['https://registry.modelcontextprotocol.io/v0.1/servers', '100', 'latest', null, null],
    ['https://registry.modelcontextprotocol.io/v0.1/servers', '100', 'latest', null, '2'],
    ['https://registry.modelcontextprotocol.io/v0.1/servers', '100', 'latest', null, '4'],
  ]);
  for (const { init } of f.reg.state.calls) {
    assert.equal(init.method, 'GET');
    assert.equal(init.redirect, 'manual', '転送は追わない');
    assert.equal(init.body, undefined, '本文を送らない');
    assert.deepEqual(init.headers, { Accept: 'application/json', 'User-Agent': UA }, '名乗る。鍵や本人の情報を付けない');
  }
  const source = f.source();
  assert.deepEqual([source.cursor, source.sweep_started_at, source.updated_since, source.checkpoint_at, source.last_full_at, source.last_success_at, source.next_run_at, source.observed, source.error_code, source.lease_until],
    [null, null, null, T0, T0, T0, T0 + NOAH_REGISTRY.everyMs, 5, null, 0]);
  assert.equal(f.count('noah_intake_candidates', "state='active'"), 5);
  const candidate = f.candidate('io.example/agent-00');
  assert.deepEqual([candidate.source, candidate.external_key, candidate.family_id, candidate.group_key, candidate.name, candidate.summary, candidate.host, candidate.state, candidate.reason, candidate.revision, candidate.seen_at, candidate.source_updated_at],
    ['mcp-registry', 'io.example/agent-00', 'mcp-registry:io.example/agent-00', 'io.example', 'io.example/agent-00', 'io.example/agent-00 の説明', 'io-example-agent-00.example.com', 'active', null, 1, T0, Date.UTC(2026, 10, 20)]);
  assert.match(candidate.record_sha256, /^[a-f0-9]{64}$/);
  const check = f.check('io.example/agent-00');
  assert.deepEqual([check.mouth, check.surface, check.auth, check.setup, check.level, check.result, check.next_check_at, check.tools_sha256], ['mcp-remote', 'none', 'unknown', 0, 0, 'unchecked', T0, null]);
  assert.equal(JSON.parse(check.connect_json).candidateDigest, candidate.record_sha256, '接続要件が、記録の hash を指す');
  const family = f.family('io.example/agent-00');
  assert.deepEqual([family.representative_id, family.members, family.level, family.badge_hint, family.listed, family.one_tap, family.revision], ['mcp-registry:io.example/agent-00', 1, 0, 'unverified', 0, 0, 1], '握手の前は、載せない');
  assert.ok(family.shuffle >= 0 && family.shuffle < 1_000_000_000);

  // 次の時刻まで、もう一度呼んでも何も読まない。
  assert.deepEqual(await f.store.sync(), { outcomes: [] });
  assert.equal(f.reg.state.calls.length, 3);
});

void test('更新された物だけ: 印の 10 分前から読む。2 頁目も同じ値。変わった・新しい・外された記録', async (t) => {
  const all = names(4);
  const f = setup(t, { entries: all.map((name) => registryEntry(name)) });
  await f.store.sync();
  for (const name of all) await f.handshaken(name);
  f.time.value = T0 + HOUR;
  f.reg.state.calls.length = 0;
  f.reg.state.updated = [
    registryEntry(all[0], { server: { version: '2.0.0', remotes: [{ type: 'streamable-http', url: 'https://moved.example.com/mcp' }] } }),   // 接続先が変わった
    registryEntry(all[1], { server: { description: '説明だけを直した', version: '1.0.1' } }),                                                   // 説明と版だけ
    registryEntry(all[2], { meta: { status: 'deleted' } }),                                                                                    // 台帳が外した
    registryEntry('io.example/brand-new'),                                                                                                     // 初めて見る名前
  ];
  const before = Object.fromEntries(all.map((name) => [name, f.candidate(name)]));
  const result = await f.store.sync();
  assert.deepEqual(result.outcomes, [{ source: 'mcp-registry', mode: 'updated', pages: 2, seen: 4, changed: 4, more: false, error: null }]);
  const since = new Date(T0 - NOAH_REGISTRY.overlapMs).toISOString();
  assert.deepEqual(urls(f.reg).map((url) => [url.searchParams.get('updated_since'), url.searchParams.get('cursor')]), [[since, null], [since, '2']]);
  assert.deepEqual([f.source().checkpoint_at, f.source().last_full_at, f.source().next_run_at], [T0 + HOUR, T0, T0 + 2 * HOUR], '印は、巡回を始めた時刻。全件の印は進まない');

  // 接続先が変わった: 確かめ直すまで、印を出さない。
  assert.equal(f.candidate(all[0]).revision, 2);
  assert.equal(f.candidate(all[0]).host, 'moved.example.com');
  assert.deepEqual([f.check(all[0]).level, f.check(all[0]).result, f.check(all[0]).tools_sha256, f.check(all[0]).form_tools, f.check(all[0]).next_check_at, f.check(all[0]).l1_at], [0, 'unchecked', null, null, T0 + HOUR, null]);
  assert.deepEqual([f.family(all[0]).level, f.family(all[0]).listed, f.family(all[0]).one_tap], [0, 0, 0]);
  // 説明と版だけが変わった: 記録は新しくなるが、握手の記録は消さない（一覧に残る）。
  assert.equal(f.candidate(all[1]).revision, 2);
  assert.equal(f.candidate(all[1]).summary, '説明だけを直した');
  assert.deepEqual([f.check(all[1]).level, f.check(all[1]).result, f.check(all[1]).tools_sha256, f.family(all[1]).listed], [1, 'ok', H, 1]);
  assert.equal(JSON.parse(f.check(all[1]).connect_json).candidateDigest, f.candidate(all[1]).record_sha256);
  assert.notEqual(f.candidate(all[1]).record_sha256, before[all[1]].record_sha256);
  // 外された記録: 名寄せを待たずに、一覧から消える。
  assert.deepEqual([f.candidate(all[2]).state, f.candidate(all[2]).reason, f.candidate(all[2]).revision], ['withdrawn', null, 2]);
  assert.deepEqual([f.family(all[2]).listed, f.family(all[2]).level], [0, 0]);
  assert.deepEqual((await list(f.store)).items.map((item) => item.id).sort(), [`mcp-registry:${all[1]}`, `mcp-registry:${all[3]}`]);
  // 変わっていない記録は、触らない。
  assert.deepEqual([f.candidate(all[3]).revision, f.candidate(all[3]).seen_at, f.family(all[3]).listed], [1, T0, 1]);
  // 新しい記録: 候補・握手の記録・系列の 3 行。握手の前は載せない。
  assert.deepEqual([f.candidate('io.example/brand-new').state, f.check('io.example/brand-new').result, f.family('io.example/brand-new').listed], ['active', 'unchecked', 0]);

  // 外された記録が、有効に戻った時: 握手し直すまで載せない。
  f.time.value = T0 + 2 * HOUR;
  f.reg.state.updated = [registryEntry(all[2])];
  await f.store.sync();
  assert.deepEqual([f.candidate(all[2]).state, f.candidate(all[2]).revision, f.check(all[2]).level, f.check(all[2]).result, f.family(all[2]).listed], ['active', 3, 0, 'unchecked', 0]);
});

void test('変わらない記録: 7 日後の全件で、revision は増えず、seen_at だけが進む', async (t) => {
  const all = names(5);
  const f = setup(t, { entries: all.map((name) => registryEntry(name)) });
  await f.store.sync();
  f.time.value = T0 + NOAH_REGISTRY.fullEveryMs;
  f.reg.state.calls.length = 0;
  f.hooks.queries.length = 0;
  const result = await f.store.sync();
  assert.deepEqual(result.outcomes, [{ source: 'mcp-registry', mode: 'full', pages: 3, seen: 5, changed: 0, more: false, error: null }]);
  assert.ok(urls(f.reg).every((url) => !url.searchParams.has('updated_since')), '7 日たったら、全件を読む');
  for (const name of all) assert.deepEqual([f.candidate(name).revision, f.candidate(name).seen_at, f.candidate(name).changed_at], [1, T0 + NOAH_REGISTRY.fullEveryMs, T0]);
  // 変わらない頁は、1 頁につき seen_at を書く文が 1 つだけ。候補・握手の記録・系列の行を、1 件ずつ書き直さない。
  assert.deepEqual(f.hooks.queries.filter((query) => /SET seen_at=\?/.test(query)).map((query) => query.replace(/\(\?(,\?)*\)/, '(…)')), Array(3).fill('UPDATE noah_intake_candidates SET seen_at=? WHERE id IN (…)'));
  assert.deepEqual(f.hooks.queries.filter((query) => /^\s*INSERT/i.test(query) && !query.startsWith('INSERT INTO noah_intake_families(id, representative_id, members, level, l2_at')), [], '名寄せの文のほかに、行を足す文が無い');
  assert.deepEqual([f.source().last_full_at, f.source().withdrawn], [T0 + NOAH_REGISTRY.fullEveryMs, 0]);
});

void test('途中で止まる: 読めた頁は残る。印は進まない。次の呼び出しが、同じ updated_since と保存した続きから読む', async (t) => {
  const f = setup(t, { entries: names(5).map((name) => registryEntry(name)) });
  f.reg.state.respond = (_url, _init, call) => { if (call === 2) throw Error('network down'); };
  const first = await f.store.sync();
  assert.deepEqual(first.outcomes, [{ source: 'mcp-registry', mode: 'full', pages: 1, seen: 2, changed: 2, more: true, error: 'unavailable' }]);
  assert.deepEqual([f.source().cursor, f.source().sweep_started_at, f.source().checkpoint_at, f.source().last_full_at, f.source().error_code, f.source().failure_count, f.source().next_run_at, f.source().lease_until],
    ['2', T0, null, null, 'unavailable', 1, T0 + 120_000, 0]);
  assert.equal(f.count('noah_intake_candidates'), 2, '1 頁目の行は残る');
  assert.deepEqual(await f.store.sync(), { outcomes: [] }, '待つ時刻までは読まない');

  f.reg.state.respond = null;
  f.time.value = T0 + 120_000;
  f.reg.state.calls.length = 0;
  const second = await f.store.sync();
  assert.deepEqual(second.outcomes, [{ source: 'mcp-registry', mode: 'full', pages: 2, seen: 3, changed: 3, more: false, error: null }]);
  assert.deepEqual(urls(f.reg).map((url) => url.searchParams.get('cursor')), ['2', '4'], '続きから読む');
  assert.deepEqual([f.source().checkpoint_at, f.source().last_full_at, f.source().error_code, f.source().failure_count, f.source().next_run_at], [T0, T0, null, 0, T0 + HOUR], '印は、巡回を始めた時刻');
  assert.equal(f.count('noah_intake_candidates'), 5);

  // 更新された物だけの巡回でも、途中で止まったら、同じ updated_since で続ける。
  f.time.value = T0 + HOUR;
  f.reg.state.updated = names(4, 'io.example/later').map((name) => registryEntry(name));
  f.reg.state.calls.length = 0;
  f.reg.state.respond = (_url, _init, call) => (call === 2 ? new Response('busy', { status: 503 }) : null);
  assert.equal((await f.store.sync()).outcomes[0].error, 'unavailable');
  f.reg.state.respond = null;
  f.time.value = T0 + HOUR + 120_000;
  assert.equal((await f.store.sync()).outcomes[0].more, false);
  const since = new Date(T0 - NOAH_REGISTRY.overlapMs).toISOString();
  assert.deepEqual(urls(f.reg).map((url) => [url.searchParams.get('updated_since'), url.searchParams.get('cursor')]), [[since, null], [since, '2'], [since, '2']]);
  assert.equal(f.source().checkpoint_at, T0 + HOUR, '止まった時刻ではなく、その巡回を始めた時刻');
});

void test('取り下げ: 全件の巡回で見えなかった候補。前の 9 割未満しか見えなかった巡回では行わない', async (t) => {
  const all = names(10);
  const f = setup(t, { entries: all.map((name) => registryEntry(name)), size: 4 });
  await f.store.sync();
  // 2 巡目: 1 件が消える。
  f.time.value = T0 + NOAH_REGISTRY.fullEveryMs;
  f.reg.state.entries = all.slice(1).map((name) => registryEntry(name));
  await f.store.sync();
  assert.deepEqual([f.candidate(all[0]).state, f.candidate(all[0]).revision, f.source().withdrawn, f.source().observed], ['withdrawn', 2, 1, 9]);
  assert.equal(f.family(all[0]).hidden_at, T0 + NOAH_REGISTRY.fullEveryMs, '候補の無くなった系列は隠す（行は消さない）');
  assert.equal(f.count('noah_intake_candidates', "state='active'"), 9);
  // 3 巡目: 相手の障害で、半分も返らない。
  f.time.value = T0 + 2 * NOAH_REGISTRY.fullEveryMs;
  f.reg.state.entries = all.slice(1, 5).map((name) => registryEntry(name));
  const result = await f.store.sync();
  assert.equal(result.outcomes[0].error, null);
  assert.equal(f.count('noah_intake_candidates', "state='active'"), 9, '取り下げを行わない');
  assert.deepEqual([f.source().error_code, f.source().withdrawn, f.source().observed, f.source().last_full_at], [null, 0, 4, T0 + 2 * NOAH_REGISTRY.fullEveryMs]);
  // 4 巡目: 障害の後の最初の全件。前の全件より後に見えていた 9 件のうち、見えたのは 8 件（9 割に届かない）なので、まだ行わない。
  f.time.value = T0 + 3 * NOAH_REGISTRY.fullEveryMs;
  f.reg.state.entries = all.slice(2).map((name) => registryEntry(name));
  await f.store.sync();
  assert.deepEqual([f.candidate(all[1]).state, f.count('noah_intake_candidates', "state='active'"), f.source().withdrawn], ['active', 9, 0]);
  // 5 巡目: 見えない状態が続いた候補は、ここで取り下げる（前の全件で見えなかった物は、分母から外れる）。
  f.time.value = T0 + 4 * NOAH_REGISTRY.fullEveryMs;
  await f.store.sync();
  assert.deepEqual([f.candidate(all[1]).state, f.count('noah_intake_candidates', "state='active'"), f.source().withdrawn], ['withdrawn', 8, 1]);
});

void test('取り合い: 同時に 2 回呼んでも、頁を読むのは 1 つ', async (t) => {
  const f = setup(t, { entries: names(3).map((name) => registryEntry(name)) });
  const results = await Promise.all([f.store.sync(), f.store.sync()]);
  assert.deepEqual(results.map((result) => result.outcomes.length).sort((a, b) => a - b), [0, 1]);
  assert.equal(f.reg.state.calls.length, 2);
  assert.equal(f.count('noah_intake_candidates'), 3);
});

void test('上限: 1 回の呼び出しは、決めた頁数と時間まで。続きは、次の呼び出しがすぐ読む', async (t) => {
  const f = setup(t, { entries: names(60).map((name) => registryEntry(name)), budget: { pages: 10, seconds: 25 } });
  const first = await f.store.sync();
  assert.deepEqual([first.outcomes[0].pages, first.outcomes[0].seen, first.outcomes[0].more, first.outcomes[0].error], [10, 20, true, null]);
  assert.deepEqual([f.source().cursor, f.source().lease_until, f.source().next_run_at, f.source().request_count], ['20', 0, 0, 10]);
  assert.deepEqual((await f.store.sync({ deadline: T0 })).outcomes, [{ source: 'mcp-registry', mode: 'full', pages: 0, seen: 0, changed: 0, more: true, error: null }], '時間が残っていなければ読まない');
  await f.store.sync();
  const last = await f.store.sync();
  assert.deepEqual([last.outcomes[0].pages, last.outcomes[0].more, f.count('noah_intake_candidates'), f.source().request_count], [10, false, 60, 30]);
});

void test('保存の途中で失敗しても、候補だけが新しくなって握手の記録や系列が無い、という状態を残さない', async (t) => {
  const f = setup(t, { size: 40, entries: names(40).map((name) => registryEntry(name)) });
  f.hooks.failBatch = () => f.hooks.batches === 2;   // 1 頁 40 件 × 3 文を、2 回の batch で書く。2 回目を失敗させる
  const first = await f.store.sync();
  assert.deepEqual([first.outcomes[0].pages, first.outcomes[0].error], [0, 'unavailable']);
  const saved = f.count('noah_intake_candidates');
  assert.ok(saved > 0 && saved < 40, '1 回目の batch の分だけが残る');
  assert.deepEqual([f.count('noah_intake_checks'), f.count('noah_intake_families')], [saved, saved], '候補・握手の記録・系列の 3 行は、いつも一緒に入る');
  assert.deepEqual([f.source().cursor, f.source().error_code], [null, 'unavailable'], '続きの位置は進めない');
  f.hooks.failBatch = null;
  f.time.value = f.source().next_run_at;
  const second = await f.store.sync();
  assert.deepEqual([second.outcomes[0].seen, second.outcomes[0].changed, second.outcomes[0].error], [40, 40 - saved, null], '読み直して、残りだけを書く');
  assert.deepEqual([f.count('noah_intake_candidates'), f.count('noah_intake_checks'), f.count('noah_intake_families'), f.count('noah_intake_candidates', 'revision > 1')], [40, 40, 40, 0]);
});

void test('名寄せと並びの引き直しは、全件の後と、UTC の日付が変わって最初の巡回の後だけ', async (t) => {
  const f = setup(t, { entries: names(3).map((name) => registryEntry(name)) });
  const regroups = () => f.hooks.queries.filter((query) => query === REGROUP_FIRST).length;
  const reshuffles = () => f.hooks.queries.filter((query) => query === NOAH_LISTING_SQL.reshuffle).length;
  await f.store.sync();                                   // 03:00 全件
  assert.deepEqual([regroups(), reshuffles()], [1, 1]);
  for (const hours of [1, 2, 3]) {                        // 同じ日の 04:00・05:00・06:00
    f.time.value = T0 + hours * HOUR;
    await f.store.sync();
  }
  assert.deepEqual([regroups(), reshuffles()], [1, 1], '毎時は流さない');
  f.time.value = T0 + 22 * HOUR;                          // 次の日の 01:00
  await f.store.sync();
  assert.deepEqual([regroups(), reshuffles()], [2, 2]);
  f.time.value = T0 + 23 * HOUR;
  await f.store.sync();
  assert.deepEqual([regroups(), reshuffles()], [2, 2]);
});

void test('失敗: 混んでいる・転送・壊れた応答・大きすぎる応答。続けて失敗したら、巡回を始め直す', async (t) => {
  const f = setup(t, { entries: names(4).map((name) => registryEntry(name)) });
  const attempt = async (response, at) => {
    f.time.value = at;
    f.reg.state.respond = () => response();
    return (await f.store.sync()).outcomes[0]?.error;
  };
  assert.equal(await attempt(() => new Response('slow down', { status: 429, headers: { 'Retry-After': '300' } }), T0), 'rate_limited');
  assert.deepEqual([f.source().error_code, f.source().next_run_at, f.source().failure_count], ['rate_limited', T0 + 300_000, 1], 'Retry-After を守る');
  let at = T0 + 300_000;
  assert.equal(await attempt(() => new Response(null, { status: 302, headers: { Location: 'https://elsewhere.example.com/' } }), at), 'unavailable', '転送に従わない');
  assert.equal(f.reg.state.calls.every((call) => new URL(call.url).hostname === 'registry.modelcontextprotocol.io'), true);
  at = f.source().next_run_at;
  assert.equal(await attempt(() => new Response('<html>', { status: 200 }), at), 'invalid_response');
  at = f.source().next_run_at;
  assert.equal(await attempt(() => Response.json({ items: [] }), at), 'invalid_response', 'servers が無い');
  at = f.source().next_run_at;
  assert.equal(await attempt(() => new Response(`{"servers":[],"pad":"${'x'.repeat(NOAH_INTAKE.pageBytes)}"}`, { status: 200 }), at), 'invalid_response', '4MB を越える応答は読まない');
  assert.deepEqual([f.source().failure_count, f.source().sweep_started_at], [5, T0], '進行中の巡回は残す');
  // 同じ頁を指し続ける応答では進まない（1 頁目は読めるが、2 頁目で止まる）。6 回続けて失敗したので、巡回を始め直す。
  f.time.value = f.source().next_run_at;
  f.reg.state.respond = () => Response.json({ servers: [registryEntry('io.example/loop')], metadata: { nextCursor: 'same' } });
  const looped = (await f.store.sync()).outcomes[0];
  assert.deepEqual([looped.pages, looped.error], [1, 'invalid_response']);
  assert.deepEqual([f.source().failure_count, f.source().sweep_started_at, f.source().cursor, f.source().updated_since, f.source().checkpoint_at], [6, null, null, null, null], '6 回続けて失敗したら、始め直す');
  assert.ok(f.source().next_run_at - f.time.value <= NOAH_INTAKE.maxBackoffMs);
  // 直れば、最初の頁から読み直して終わる。
  f.reg.state.respond = null;
  f.time.value = f.source().next_run_at;
  f.reg.state.calls.length = 0;
  const done = (await f.store.sync()).outcomes[0];
  assert.deepEqual([done.mode, done.more, done.error, f.source().failure_count, f.source().error_code, new URL(f.reg.state.calls[0].url).searchParams.get('cursor')], ['full', false, null, 0, null, null]);
});

void test('記録の形: 保存する項目だけを取り出す。提供者の文は、制御文字を除いて切る。形の違う記録は読み飛ばす', async (t) => {
  assert.equal(noahRegistryRecord({ name: 'a b/c' }), null);
  assert.equal(noahRegistryRecord({ name: 'x'.repeat(281) }), null);
  assert.equal(noahRegistryRecord({ title: 'no name' }), null);
  assert.deepEqual(noahRegistryRecord({ name: 'io.example/x', $schema: 'ignored', icons: [1], repository: { url: 'https://github.com/a/b', source: 'github' }, remotes: [null, { type: 'sse', url: 'https://a.example.com', extra: 1, headers: [{ name: 'X', isRequired: true, description: 'no' }] }],
    packages: [{ registryType: 'npm', identifier: 'x', version: '1.0.0', fileSha256: 'no', transport: { type: 'stdio', url: 'no' }, environmentVariables: [{ name: 'K', isSecret: true, choices: ['no'] }] }] }), {
    name: 'io.example/x', repository: { url: 'https://github.com/a/b' }, remotes: [{}, { type: 'sse', url: 'https://a.example.com', headers: [{ name: 'X', isRequired: true }] }],
    packages: [{ registryType: 'npm', identifier: 'x', version: '1.0.0', transport: { type: 'stdio' }, environmentVariables: [{ name: 'K', isSecret: true }] }],
  });
  assert.equal(noahIntakeText('a\u0000\n\tb\u0085c', 10), 'a b c');
  assert.equal(noahIntakeText('😀'.repeat(5), 3), '😀😀😀', '文字の途中で切らない');
  assert.equal(noahIntakeText(42, 10), '');

  const big = registryEntry('io.example/big', { server: { description: `${'長い説明'.repeat(200)}`, title: 'T\u0007itle', packages: Array.from({ length: 400 }, (_, i) => ({ registryType: 'mcpb', identifier: `https://downloads.example.com/${'p'.repeat(150)}-${i}.mcpb`, transport: { type: 'stdio' } })) } });
  const f = setup(t, { size: 10, entries: [null, 7, { server: { name: 'bad name' } }, { server: {} }, registryEntry('io.example/dup', { server: { version: '1.0.0' } }), registryEntry('io.example/dup', { server: { version: '9.9.9' } }), big,
    registryEntry('io.example/no-meta', { meta: { status: undefined, updatedAt: 'not a date' } })] });
  const result = await f.store.sync();
  assert.deepEqual([result.outcomes[0].seen, result.outcomes[0].changed, f.count('noah_intake_candidates')], [3, 3, 3]);
  assert.equal(JSON.parse(f.candidate('io.example/dup').record_json).version, '9.9.9', '同じ名前が 2 回あれば、後の物');
  const stored = f.candidate('io.example/big');
  assert.deepEqual([stored.name, Array.from(stored.summary).length, stored.state], ['T itle', 500, 'active']);
  assert.deepEqual([JSON.parse(stored.record_json).oversize, 'packages' in JSON.parse(stored.record_json), 'remotes' in JSON.parse(stored.record_json)], [true, false, false], '65,536 bytes を越える記録は、接続先と配布を外して保存する');
  assert.equal(f.check('io.example/big').mouth, 'mcp-remote', '下書きは、外す前の記録から作る');
  assert.deepEqual([f.candidate('io.example/no-meta').state, f.candidate('io.example/no-meta').source_updated_at], ['withdrawn', null], '状態の分からない記録は、有効にしない');
});

void test('集計: 口ごと・理由ごとの件数が、fixture の期待から数えた値と同じ。台帳に公開された鍵は保存しない', async (t) => {
  const { rows } = fixture('registry-records.json');
  const f = setup(t, { size: 100, entries: rows.map(({ record }) => ({ server: record, _meta: { 'io.modelcontextprotocol.registry/official': { status: 'active', updatedAt: '2026-11-20T00:00:00Z' } } })) });
  await f.store.sync();
  const status = await f.store.status();
  const expected = (mouth, setup) => rows.filter(({ expect }) => expect.ok && expect.mouth === mouth && (setup === undefined || expect.secrets.length > 0 === setup)).length;
  assert.deepEqual(status.table, [
    { mouth: 'mcp-remote', label: '相手のサーバー', candidates: expected('mcp-remote'), noInput: expected('mcp-remote', false), setup: expected('mcp-remote', true) },
    { mouth: 'mcp-package', label: '端末で動かす', candidates: expected('mcp-package'), noInput: expected('mcp-package', false), setup: expected('mcp-package', true) },
  ]);
  assert.ok(status.table[0].candidates > 0 && status.table[1].setup > 0);
  const reasons = {};
  for (const { expect } of rows.filter((row) => !row.expect.ok)) reasons[expect.reason] = (reasons[expect.reason] ?? 0) + 1;
  assert.deepEqual(Object.fromEntries(status.unsupported.map((row) => [row.reason, row.count])), reasons);
  assert.ok(status.unsupported.every((row) => row.label && row.label !== row.reason), '理由に、表示名がある');
  // 握手の前なので、載せている物は無い。載せていない理由の合計は、候補の数と同じ。
  assert.deepEqual([status.listing.listed, status.listing.families], [0, { ran: 0, new: 0 }]);
  assert.equal(status.listing.reasons.reduce((total, row) => total + row.count, 0), rows.length);
  assert.ok(status.listing.reasons.every((row) => NOAH_LISTING_REASONS.includes(row.reason)));
  assert.equal(status.listing.reasons.find((row) => row.reason === 'not_checked').count, expected('mcp-remote', false));
  assert.equal(status.listing.reasons.find((row) => row.reason === 'unsupported').count, rows.filter((row) => !row.expect.ok).length);
  assert.deepEqual(status.sources.map((source) => [source.id, source.label, source.lastSuccessAt, source.nextRunAt, source.observed, source.sweepMode]), [['mcp-registry', 'Official MCP Registry', T0, T0 + HOUR, rows.length, null]]);

  // 台帳に公開された鍵: 下書きを作らず、値を保存しない。鍵の入力が要る物は、握手の予定を先へ送る。
  const published = rows.find((row) => row.expect.reason === 'published_secret').record;
  const leaked = published.remotes[0].headers[0].value;
  assert.ok(leaked.length > 20);
  const stored = f.candidate(published.name);
  assert.deepEqual([stored.state, stored.reason, f.check(published.name) ?? null, f.family(published.name) ?? null], ['unsupported', 'published_secret', null, null]);
  assert.equal(stored.record_json.includes(leaked), false);
  assert.equal(JSON.parse(stored.record_json).remotes[0].headers[0].value, '[redacted]');
  assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM noah_intake_candidates WHERE instr(record_json, ?) > 0').get(leaked).n, 0);
  const keyed = rows.find((row) => row.expect.ok && row.expect.mouth === 'mcp-remote' && row.expect.secrets.length).record.name;
  assert.deepEqual([f.check(keyed).auth, f.check(keyed).setup, f.check(keyed).next_check_at, f.family(keyed).badge_hint], ['key', 1, T0 + NOAH_INTAKE.keyCheckDelayMs, 'setup']);
  const local = rows.find((row) => row.expect.ok && row.expect.mouth === 'mcp-package' && !row.expect.secrets.length).record.name;
  assert.deepEqual([f.check(local).auth, f.check(local).surface, f.candidate(local).host], ['none', 'terminal', null]);
  // 何も実行しない。握手もしない: 外へ出たのは、台帳の頁を読む要求だけ。
  assert.deepEqual(f.reg.state.calls.map((call) => [new URL(call.url).hostname, call.init.method]), [['registry.modelcontextprotocol.io', 'GET']]);
});

void test('一覧: 先に「動いた」を最後まで、続けて「まだ誰も動かしていない」。重ならず、抜けない', async (t) => {
  const f = setup(t);
  const fresh = names(25, 'io.list/new').map((key, i) => seedFamily(f.sql, key, { shuffle: 900 - i, oneTap: i % 2 }));
  const ran = names(3, 'io.list/ran').map((key, i) => seedFamily(f.sql, key, { level: 2, l2At: 100 + i }));
  seedFamily(f.sql, 'io.list/unchecked', { level: 0 });
  const first = await list(f.store);
  assert.deepEqual(first.items.map((item) => item.id), [...ran.toReversed(), ...fresh.slice(0, 17)], '1 頁目は「動いた」3（新しい順）と「まだ」17');
  assert.deepEqual(first.items.map((item) => item.section), [...Array(3).fill('ran'), ...Array(17).fill('new')]);
  assert.deepEqual([first.counts, first.source], [{ ran: 3, new: 25 }, 'Official MCP Registry']);
  assert.match(first.nextCursor, /^n:\d+:mcp-registry:io\.list\/new-16$/);
  const second = await list(f.store, `cursor=${encodeURIComponent(first.nextCursor)}`);
  assert.deepEqual(second.items.map((item) => item.id), fresh.slice(17));
  assert.equal(second.nextCursor, null);

  const item = first.items[3];
  assert.deepEqual(item, {
    id: 'mcp-registry:io.list/new-00', name: 'io.list/new-00', provider: 'io.list', summary: '', host: 'io-list-new-00.example.com', section: 'new', tools: 3, oneTap: false, checkedAt: 90,
    connect: { badge: 'unverified', taps: 0, typed: 0, place: 'provider', placeLabel: '相手のサーバー（io-list-new-00.example.com）', need: null, level: 1, price: { model: 'free' }, note: null },
  });
  assert.deepEqual(first.items[0].connect, { badge: 'one_click', taps: 0, typed: 0, place: 'provider', placeLabel: '相手のサーバー（io-list-ran-02.example.com）', need: null, level: 2, price: { model: 'free' }, note: null });
  // 未サインイン: サインインの 1 タップが足りない。
  const guest = await list(f.store, '', anonymous);
  assert.deepEqual([guest.items[0].connect.badge, guest.items[0].connect.taps, guest.items[0].connect.need, guest.items[3].connect.badge, guest.items[3].connect.taps], ['taps', 1, 'サインイン', 'unverified', 1]);

  // 押すだけで試せる物だけ（「まだ誰も動かしていない」の絞り込み）。
  const quick = await list(f.store, 'oneTap=1');
  assert.deepEqual(quick.items.map((entry) => entry.id), [...ran.toReversed(), ...fresh.filter((_, i) => i % 2 === 1)]);
  assert.equal(quick.nextCursor, null);
  // 件数だけ。
  assert.deepEqual(await list(f.store, 'limit=0'), { items: [], nextCursor: null, counts: { ran: 3, new: 25 }, source: 'Official MCP Registry' });
  // 「動いた」だけで 1 頁が埋まる時は、次の頁が「まだ」の先頭から始まる。
  names(17, 'io.list/more').forEach((key, i) => seedFamily(f.sql, key, { level: 2, l2At: 500 + i }));
  const pageOne = await list(f.store, '', reviewer);
  assert.deepEqual([pageOne.items.length, pageOne.items.every((entry) => entry.section === 'ran'), pageOne.nextCursor], [20, true, 'n:1000000000:']);
  assert.deepEqual((await list(f.store, `cursor=${encodeURIComponent(pageOne.nextCursor)}`)).items.map((entry) => entry.id), fresh.slice(0, 20));
  // 形の違う続きの位置は 400。
  for (const cursor of ['x', 'r:abc:id', 'n:-1:id', 's:20', 'n:99999999999:x', `n:1:${'x'.repeat(600)}`])
    await assert.rejects(list(f.store, `cursor=${encodeURIComponent(cursor)}`), (error) => error.status === 400, cursor);
});

void test('サインインしていない人への一覧は、同じ問い合わせについて 60 秒持つ。件数は 5 分持つ', async (t) => {
  const f = setup(t);
  seedFamily(f.sql, 'io.cache/one');
  await list(f.store, '', anonymous);
  const queries = f.hooks.queries.length;
  f.time.value = T0 + 59_000;
  seedFamily(f.sql, 'io.cache/two');
  assert.equal((await list(f.store, '', anonymous)).items.length, 1);
  assert.equal(f.hooks.queries.length, queries, 'D1 を読み直さない');
  assert.equal((await list(f.store, '', member)).items.length, 2, 'サインインした人へは、持った物を返さない');
  f.time.value = T0 + 61_000;
  const later = await list(f.store, '', anonymous);
  assert.deepEqual([later.items.length, later.counts], [2, { ran: 0, new: 1 }], '件数は、まだ前の値');
  f.time.value = T0 + 301_000;
  assert.deepEqual((await list(f.store, '', anonymous)).counts, { ran: 0, new: 2 });
});

void test('検索: 名前と説明の部分一致。載せている系列だけ。% と _ を文字として探す', async (t) => {
  const f = setup(t);
  const weather = seedFamily(f.sql, 'io.find/weather', { summary: '天気を 100% 調べる' });
  const done = seedFamily(f.sql, 'io.find/weather-ran', { level: 2, summary: 'weather archive' });
  seedFamily(f.sql, 'io.find/hidden-weather', { level: 0, summary: '天気（まだ握手していない）' });
  names(45, 'io.find/tool').forEach((key, i) => seedFamily(f.sql, key, { shuffle: 800 - i }));
  assert.deepEqual((await list(f.store, 'q=weather')).items.map((item) => [item.id, item.section]), [[done, 'ran'], [weather, 'new']], '「動いた」を先に');
  assert.deepEqual((await list(f.store, `q=${encodeURIComponent('100%')}`)).items.map((item) => item.id), [weather]);
  assert.deepEqual((await list(f.store, `q=${encodeURIComponent('%%')}`)).items, []);
  assert.deepEqual((await list(f.store, `q=${encodeURIComponent('ｗｅａｔｈｅｒ　')}`)).items.length, 2, '全角は、半角にそろえて探す');
  const one = await list(f.store, 'q=tool');
  assert.deepEqual([one.items.length, one.nextCursor], [20, 's:20']);
  const two = await list(f.store, 'q=tool&cursor=s:20');
  const three = await list(f.store, 'q=tool&cursor=s:40');
  assert.deepEqual([two.items.length, two.nextCursor, three.items.length, three.nextCursor], [20, 's:40', 5, null]);
  assert.equal(new Set([...one.items, ...two.items, ...three.items].map((item) => item.id)).size, 45);
  await assert.rejects(list(f.store, 'q=a'), (error) => error.status === 400, '2 文字以上');
  await assert.rejects(list(f.store, `q=${'a'.repeat(81)}`), (error) => error.status === 400, '80 文字まで');
  await assert.rejects(list(f.store, 'q=tool&cursor=s:7'), (error) => error.status === 400);
  await assert.rejects(list(f.store, 'q=tool&cursor=s:200'), (error) => error.status === 400, '200 件まで');
  await assert.rejects(list(f.store, 'q=tool&cursor=n:1:x'), (error) => error.status === 400);
});

void test('詳細と取り下げ: 載せていない系列は、審査者にだけ見える。取り下げると一覧・検索・詳細から消え、戻すと戻る', async (t) => {
  const f = setup(t);
  const id = seedFamily(f.sql, 'io.detail/agent', { summary: 'detail me' });
  const unchecked = seedFamily(f.sql, 'io.detail/unchecked', { level: 0 });
  f.sql.prepare("UPDATE noah_intake_candidates SET repository='github.com/io/detail' WHERE id=?").run(id);
  const detail = await f.store.detail(id, anonymous);
  assert.deepEqual([detail.id, detail.section, detail.members, detail.website, detail.repository, detail.sourceUpdatedAt, detail.connection, 'review' in detail],
    [id, 'new', 1, 'https://io-detail-agent.example.com/about', 'github.com/io/detail', 5, null, false]);
  await assert.rejects(f.store.detail(unchecked, member), (error) => error.status === 404, '握手の前の系列は、見せない');
  await assert.rejects(f.store.detail('mcp-registry:io.detail/missing', reviewer), (error) => error.status === 404);
  await assert.rejects(f.store.detail('x', reviewer), (error) => error.status === 404);
  const seenByReviewer = await f.store.detail(unchecked, reviewer);
  assert.deepEqual([seenByReviewer.section, seenByReviewer.review.listing, seenByReviewer.review.revision], [null, { listed: false, reason: 'not_checked', label: 'まだ握手していない' }, 1]);
  // 提供者が書いた link は、https の物だけを返す。
  f.sql.prepare(`UPDATE noah_intake_candidates SET record_json=? WHERE id=?`).run(JSON.stringify({ name: 'x', websiteUrl: 'javascript:alert(1)' }), id);
  assert.equal((await f.store.detail(id, anonymous)).website, null);

  await list(f.store, '', anonymous);   // 持った一覧も、取り下げで捨てる
  await assert.rejects(f.store.withdraw(id, 7), (error) => error.status === 409, 'revision が違う');
  await assert.rejects(f.store.withdraw('mcp-registry:io.detail/missing', 1), (error) => error.status === 404);
  await assert.rejects(f.store.withdraw(id, 0), (error) => error.status === 400);
  f.time.value = T0 + 5_000;
  assert.deepEqual(await f.store.withdraw(id, 1), { id, revision: 2, withdrawnAt: T0 + 5_000 });
  assert.deepEqual(await f.store.withdraw(id, 1), { id, revision: 2, withdrawnAt: T0 + 5_000 }, '同じ操作の送り直しは、同じ結果');
  assert.deepEqual((await list(f.store, '', anonymous)).items, []);
  assert.deepEqual((await list(f.store, 'q=detail')).items, []);
  await assert.rejects(f.store.detail(id, member), (error) => error.status === 404);
  assert.deepEqual((await f.store.detail(id, reviewer)).review.listing, { listed: false, reason: 'withdrawn', label: '取り下げ' });
  assert.deepEqual((await f.store.status()).withdrawn, [{ id, name: 'io.detail/agent', revision: 2, withdrawnAt: T0 + 5_000 }]);
  assert.equal(f.count('noah_intake_families'), 2, '行は消さない');
  await assert.rejects(f.store.restore(id, 1), (error) => error.status === 409);
  assert.deepEqual(await f.store.restore(id, 2), { id, revision: 3, withdrawnAt: null });
  assert.deepEqual((await list(f.store, '', anonymous)).items.map((item) => item.id), [id]);
  assert.deepEqual((await f.store.status()).withdrawn, []);
});

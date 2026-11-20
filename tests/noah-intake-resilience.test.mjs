// 取り込みの巡回が、台帳の側の更新・不調・形の変化で、確かめた記録・一覧・巡回そのものを失わないこと。
// 仕様: docs/noah/spec-85-intake.md の 5.1（3〜5）・11.2・11.8。#332 の点検で見つけた所を、ここで固定する。
import test from 'node:test';
import assert from 'node:assert/strict';
import { noahConnectSha256 } from '../lib/noah-connect-requirements.ts';
import { createIntakeTick } from '../lib/noah-intake-api.ts';
import { intakeStatement } from '../lib/noah-intake-db.ts';
import { NOAH_REGROUP_SQL } from '../lib/noah-intake-family.ts';
import { parseNoahFlags } from '../lib/noah-flags.ts';
import { noahWakeSignature } from '../lib/noah-intake-wake.ts';
import { fixture, entry, page, NOW, markListed } from './fixtures/noah/intake.mjs';

const HOUR = 3_600_000, DAY = 86_400_000, WEEK = 7 * DAY;
const id = (i) => `mcp-registry:test.provider/agent-${i}`;
const official = (status = 'active') => ({ 'io.modelcontextprotocol.registry/official': { status, updatedAt: new Date(NOW).toISOString() } });
const remote = (url) => ({ remotes: [{ type: 'streamable-http', url }] });
const listed = async (f) => (await f.store.list(null, new URLSearchParams())).items.map((item) => item.id).sort((a, b) => a.localeCompare(b));
const family = (f, key) => f.sql.prepare('SELECT * FROM noah_intake_families WHERE id=?').get(key);
const states = (f) => Object.fromEntries(f.sql.prepare('SELECT state, COUNT(*) AS n FROM noah_intake_candidates GROUP BY state').all().map((row) => [row.state, row.n]));
/** 失敗の後の待ち時間が過ぎた所まで、時計を進める。 */
const waitOut = (f) => f.advance(f.source().next_run_at - f.time() + 1);
/** 形が違って読めない記録。1 件ずつ、別の理由で読めない。 */
const unreadable = () => [
  null,
  'text',
  [],
  { _meta: official() },
  { server: { name: 'test.provider/no-meta', ...remote('https://no-meta.example.com/mcp') } },
  { server: { name: 'test.provider/no-status', ...remote('https://no-status.example.com/mcp') }, _meta: { 'io.modelcontextprotocol.registry/official': { updatedAt: new Date(NOW).toISOString() } } },
  entry(90, { title: 123 }),
  entry(91, { remotes: [null] }),
  entry(92, { name: `test.provider/${'x'.repeat(300)}` }),
];

void test('a version or description update keeps the handshake record and the listing; only a connection change resets them', async (t) => {
  const terminal = (version) => entry(4, { remotes: undefined, packages: [{ registryType: 'npm', identifier: 'example-tool', version, transport: { type: 'stdio' } }] });
  let records = [entry(1), entry(2), entry(3), terminal('1.0.0')];
  const f = fixture(t, async () => page(records));
  await f.store.sync();
  markListed(f, 1, 2);
  markListed(f, 2, 1);
  markListed(f, 3, 1);
  const before = { 1: f.check(1), 2: f.check(2), families: { 1: family(f, id(1)), 2: family(f, id(2)) } };
  // 台帳の記録は、1 時間に 100 件ほど更新される。その大半は、版や説明だけの更新。
  records = [entry(1, { version: '2.0.0' }), entry(2, { description: 'Reworded by its provider' }), entry(3, remote('https://moved.example.com/mcp')), terminal('1.0.1')];
  f.advance(HOUR);
  assert.deepEqual(await f.store.sync(), { pages: 1, seen: 4, changed: 4, more: false });
  for (const i of [1, 2]) {
    const now = f.check(i), old = before[i];
    assert.deepEqual({ ...now, connect_json: '', connect_sha256: '' }, { ...old, connect_json: '', connect_sha256: '' }, '握手で確かめた値（深さ・結果・道具の hash・時刻）は、そのまま');
    assert.notEqual(now.connect_sha256, old.connect_sha256, '接続要件は、新しい記録の物に変わる');
    assert.equal(now.connect_sha256, await noahConnectSha256(JSON.parse(now.connect_json)));
    assert.equal(f.candidate(i).revision, 2);
    assert.deepEqual(family(f, id(i)), before.families[i], '系列の行は、書き直さない');
  }
  assert.equal(JSON.parse(f.check(4).connect_json).target.version, '1.0.1');
  // 接続先が変わった物は、握手の記録を消して、確かめ直すまで載せない。
  assert.deepEqual({ level: f.check(3).level, result: f.check(3).result, tools: f.check(3).tools_sha256, l1: f.check(3).l1_at }, { level: 0, result: 'unchecked', tools: null, l1: null });
  assert.equal(JSON.parse(f.check(3).connect_json).target.url, 'https://moved.example.com/mcp');
  assert.deepEqual(await listed(f), [id(1), id(2)]);
  assert.equal((await f.store.list(null, new URLSearchParams())).counts.ran, 1, '「動いた」も残る');
});

void test('an unreadable record is skipped and counted; the rest of the page is saved and the sweep completes', async (t) => {
  const f = fixture(t, async () => page([entry(1), ...unreadable(), entry(2, {}, 'deleted'), entry(3)]));
  assert.deepEqual(await f.store.sync(), { pages: 1, seen: 3, changed: 3, more: false, skipped: 9 });
  assert.deepEqual(f.sql.prepare('SELECT external_key, state FROM noah_intake_candidates ORDER BY external_key').all().map((row) => [row.external_key, row.state]), [
    ['test.provider/agent-1', 'active'],
    ['test.provider/agent-2', 'withdrawn'],
    ['test.provider/agent-3', 'active'],
  ]);
  const source = f.source();
  assert.deepEqual([source.checkpoint_at, source.error_code, source.failure_count, source.observed, source.sweep_started_at], [NOW, null, 0, 3, null]);
});

void test('a known candidate whose record turns unreadable keeps what was verified; it is neither rewritten nor withdrawn by an hourly sweep', async (t) => {
  let records = [entry(1), entry(2)];
  const f = fixture(t, async () => page(records));
  await f.store.sync();
  markListed(f, 1, 2);
  const before = { candidate: f.candidate(1), check: f.check(1), family: family(f, id(1)) };
  // 台帳での状態（status）を読めない記録を「有効ではない」と読むと、ここで取り下げになる。
  records = [{ server: entry(1).server }];
  f.advance(HOUR);
  assert.deepEqual(await f.store.sync(), { pages: 1, seen: 0, changed: 0, more: false, skipped: 1 });
  assert.deepEqual([f.candidate(1), f.check(1), family(f, id(1))], [before.candidate, before.check, before.family]);
  assert.deepEqual(await listed(f), [id(1)]);
});

void test('more than ten unreadable records on one page fail the page, so a registry that changed shape is not passed over silently', async (t) => {
  const broken = Array.from({ length: 11 }, (_, i) => ({ server: entry(100 + i).server }));
  let records = [entry(1), ...broken];
  const f = fixture(t, async () => page(records));
  const first = await f.store.sync();
  assert.deepEqual(first, { pages: 0, seen: 0, changed: 0, more: true, error: 'invalid_response' });
  assert.equal(f.candidate(1), undefined, 'その頁の記録は、1 件も保存しない');
  assert.deepEqual([f.source().checkpoint_at, f.source().error_code, f.source().failure_count], [null, 'invalid_response', 1]);
  // 10 件までは読み飛ばして進む。
  records = [entry(1), ...broken.slice(0, 10)];
  waitOut(f);
  assert.deepEqual(await f.store.sync(), { pages: 1, seen: 1, changed: 1, more: false, skipped: 10 });
});

void test('the withdrawal valve compares with the candidates we hold: repeated half or empty listings never withdraw, a small loss does', async (t) => {
  let count = 10;
  const f = fixture(t, async () => page(Array.from({ length: count }, (_, i) => entry(i))));
  await f.store.sync();
  // 台帳が、半分だけの一覧を 2 週続けて返す。前の巡回の件数と比べると、2 週目で残りを全部取り下げてしまう。
  for (const partial of [5, 5, 0, 0]) {
    count = partial;
    f.advance(WEEK);
    const result = await f.store.sync();
    assert.deepEqual([result.seen, result.error], [partial, undefined]);
    assert.deepEqual(states(f), { active: 10 }, `${partial} 件だけの一覧では、取り下げない`);
    assert.deepEqual([f.source().last_full_at, f.source().withdrawn, f.source().error_code], [f.time(), 0, null]);
  }
  // 見えなくなった物が 1 割以下なら、取り下げる。
  count = 9;
  f.advance(WEEK);
  await f.store.sync();
  assert.deepEqual(states(f), { active: 9, withdrawn: 1 });
  assert.equal(f.candidate(9).state, 'withdrawn');
  assert.equal(f.source().withdrawn, 1);
});

void test('a weekly sweep that could read only part of each page does not withdraw the records it skipped', async (t) => {
  let records = Array.from({ length: 12 }, (_, i) => entry(i));
  const f = fixture(t, async () => page(records));
  await f.store.sync();
  // 12 件のうち 10 件が読めない（1 頁で読み飛ばしてよい上限）。2 週続いても、読めなかった 10 件は有効のまま。
  records = records.map((record, i) => (i < 2 ? record : { server: record.server }));
  for (let week = 0; week < 2; week++) {
    f.advance(WEEK);
    assert.deepEqual(await f.store.sync(), { pages: 1, seen: 2, changed: 0, more: false, skipped: 10 });
    assert.deepEqual(states(f), { active: 12 });
  }
});

void test('a stuck sweep restarts from the same checkpoint after six failures in a row; a page that was saved resets the count', async (t) => {
  const urls = [];
  let broken = new Set(['two']);
  const f = fixture(t, async (url) => {
    const cursor = new URL(url).searchParams.get('cursor');
    urls.push(cursor);
    if (broken.has(cursor)) return new Response('', { status: 500 });
    return cursor === null ? page([entry(1)], 'two') : cursor === 'two' ? page([entry(2)], 'three') : page([entry(3)]);
  });
  // 1 頁目は書けて、続き（cursor=two）が読めない。5 回目までは、同じ続きから読み直す。
  for (let failures = 1; failures <= 5; failures++) {
    assert.equal((await f.store.sync()).error, 'unavailable');
    const source = f.source();
    assert.deepEqual([source.failure_count, source.cursor, source.sweep_started_at, source.next_run_at - f.time()], [failures, 'two', NOW, 2 ** failures * 60_000]);
    waitOut(f);
  }
  // 続きが読めて 1 頁進むと、続けて失敗した回数は 0 に戻る。次の頁でまた失敗しても、始め直さない。
  broken = new Set(['three']);
  assert.equal((await f.store.sync()).error, 'unavailable');
  assert.deepEqual([f.source().failure_count, f.source().cursor, f.source().sweep_started_at], [1, 'three', NOW]);
  // 6 回続けて失敗したら、進行中の巡回を捨てる。印（checkpoint_at）は進めない。
  for (let failures = 2; failures <= 6; failures++) {
    waitOut(f);
    assert.equal((await f.store.sync()).error, 'unavailable');
  }
  const stuck = f.source();
  assert.deepEqual([stuck.failure_count, stuck.cursor, stuck.sweep_started_at, stuck.updated_since, stuck.checkpoint_at, stuck.error_code], [6, null, null, null, null, 'unavailable']);
  assert.equal(stuck.next_run_at - f.time(), 64 * 60_000, '始め直す前も、失敗の後の待ち時間を守る');
  // 待ち時間の後、最初の頁から読み直して、終わる。
  broken = new Set();
  assert.equal((await f.store.sync()).pages, 0);
  waitOut(f);
  const restarted = urls.length;
  assert.deepEqual(await f.store.sync(), { pages: 3, seen: 3, changed: 1, more: false }, '前に書けた 2 件は変わらず、3 件目だけが新しい');
  assert.deepEqual(urls.slice(restarted), [null, 'two', 'three']);
  assert.deepEqual([f.source().failure_count, f.source().error_code, f.source().checkpoint_at], [0, null, f.time()]);
});

void test('rate limiting never restarts a sweep', async (t) => {
  const f = fixture(t, async (url) => (new URL(url).searchParams.get('cursor') === null ? page([entry(1)], 'two') : new Response('', { status: 429 })));
  for (let failures = 1; failures <= 8; failures++) {
    assert.equal((await f.store.sync()).error, 'rate_limited');
    assert.deepEqual([f.source().failure_count, f.source().cursor, f.source().sweep_started_at], [failures, 'two', NOW], '読み直すと、相手への通信が増える');
    waitOut(f);
  }
});

void test('the wake answers 500 when the sweep failed, and writes one line of counts without names', async (t) => {
  const key = 'synthetic-wake-test-only-'.repeat(2);
  let reply = () => new Response('', { status: 503 });
  const f = fixture(t, async () => reply());
  const lines = [];
  t.mock.method(console, 'info', (line) => lines.push(JSON.parse(line)));
  const deps = (config = {}) => ({ ...f.deps, authenticate: async () => { throw Error('UNAUTHORIZED'); }, reviewers: [], flags: parseNoahFlags({ NOAH_PATROL_ENABLED: 'true' }), wakeKey: key, ...config });
  const wake = async (tick = createIntakeTick(deps())) => {
    const timestamp = String(f.time());
    return tick(new Request('https://noah.test/api/noah/intake/tick', { method: 'POST', body: '{}', headers: { 'x-noah-time': timestamp, 'x-noah-signature': await noahWakeSignature(key, timestamp) } }));
  };
  const zero = { probes: 0, ok: 0, authRequired: 0, unreachable: 0, rateLimited: 0, skippedHost: 0, toolsChanged: 0, swept: 0 };
  // 台帳を読めない: 500。合図を送る専用の Worker は、2xx でない応答で実行を失敗にする（services/noah-patrol-wake/worker.ts）。
  const failed = await wake();
  assert.equal(failed.status, 500);
  assert.deepEqual(await failed.json(), { pages: 0, seen: 0, changed: 0, more: true, error: 'unavailable' });
  assert.deepEqual(lines.pop(), { event: 'noah-patrol', pages: 0, seen: 0, changed: 0, skipped: 0, ...zero, error: 'unavailable', ms: 0 });
  // 失敗の後の待ち時間の間の合図は、何もしない。失敗ではない。
  const waiting = await wake();
  assert.deepEqual([waiting.status, await waiting.json()], [200, { pages: 0, seen: 0, changed: 0, more: false }]);
  assert.equal(lines.pop().error, null);
  // 読めた巡回: 200。読み飛ばした数も 1 行に入る。
  reply = () => page([entry(1), entry(2), null]);
  waitOut(f);
  const done = await wake();
  assert.deepEqual([done.status, await done.json()], [200, { pages: 1, seen: 2, changed: 2, more: false, skipped: 1 }]);
  const line = lines.pop();
  assert.deepEqual(line, { event: 'noah-patrol', pages: 1, seen: 2, changed: 2, skipped: 1, ...zero, error: null, ms: 0 });
  assert.equal(/example\.com|test\.provider|agent-/.test(JSON.stringify(line)), false, '接続先の名前・URL を出さない');
  // 表を読み書きできない: 2xx にしない。1 行は出す。
  const down = await wake(createIntakeTick(deps({ db: { prepare() { throw Error('D1 unavailable'); } } })));
  assert.equal(down.status, 503);
  assert.equal(lines.pop().error, 'unavailable');
  // 巡回を閉じている間は、何もしない。記録も出さない。
  const closed = await wake(createIntakeTick(deps({ flags: parseNoahFlags({}) })));
  assert.deepEqual([closed.status, await closed.json(), lines.length], [200, { disabled: true }, 0]);
});

void test('regroup hides a family that lost its candidates once, and brings it back when the candidate returns', async (t) => {
  let records = [entry(1), entry(2)];
  const f = fixture(t, async () => page(records));
  await f.store.sync();
  markListed(f, 1);
  markListed(f, 2);
  // 台帳で取り下げになる → 次の日の名寄せで、その系列を隠す。
  records = [entry(1, {}, 'deleted')];
  f.advance(HOUR);
  await f.store.sync();
  assert.deepEqual([f.candidate(1).state, family(f, id(1)).hidden_at], ['withdrawn', null]);
  records = [];
  f.advance(DAY);
  await f.store.sync();
  const hiddenAt = f.time();
  assert.equal(family(f, id(1)).hidden_at, hiddenAt);
  // 台帳に戻る → 握手が通った形にする（握手そのものは L4）。隠したままだと、名寄せをやり直しても、一覧に出ない。
  records = [entry(1)];
  f.advance(HOUR);
  await f.store.sync();
  assert.deepEqual([f.candidate(1).state, f.check(1).level], ['active', 0]);
  markListed(f, 1);
  records = [];
  f.advance(DAY);
  await f.store.sync();
  assert.equal(family(f, id(1)).hidden_at, null);
  assert.deepEqual(await listed(f), [id(1), id(2)]);
});

void test('regroup brings back the single families when a bulk family dissolves, and writes no row when nothing changed', async (t) => {
  // 同じ提供者・同じ接続先の 20 件は、量産の系列 1 つにまとまる。元の「1 件で 1 系列」の行は隠れる。
  let records = Array.from({ length: 20 }, (_, i) => entry(i, remote(`https://shared.example.com/mcp/${i}`)));
  const f = fixture(t, async () => page(records));
  await f.store.sync();
  const bulk = 'bulk:test.provider@shared.example.com';
  assert.deepEqual([family(f, bulk).members, family(f, bulk).hidden_at], [20, null]);
  assert.equal(f.sql.prepare("SELECT COUNT(*) AS n FROM noah_intake_families WHERE hidden_at IS NOT NULL AND id LIKE 'mcp-registry:%'").get().n, 20);
  // 何も変わっていない名寄せは、系列の表を 1 行も書かない（D1 は、書いた行の数で数える。隠した行を毎回書き直さない）。
  let written = 0;
  for (const sql of NOAH_REGROUP_SQL) {
    const changes = (await intakeStatement(f.db, sql, { threshold: 20, now: f.time() + 1 }).run()).meta.changes;
    if (/(?:UPDATE|INSERT INTO) noah_intake_families/.test(sql.replace(/--[^\n]*/g, ''))) written += changes;
  }
  assert.equal(written, 0);
  // 1 件が台帳で取り下げになり、19 件になる → 量産ではなくなる。握手が通っている物は、一覧に出る。
  records = [entry(0, remote('https://shared.example.com/mcp/0'), 'deleted')];
  f.advance(HOUR);
  await f.store.sync();
  f.sql.prepare("UPDATE noah_intake_checks SET auth='none',level=1,result='ok',tools_sha256=?,l1_at=?,form_tools=1,one_tap_tools=1,tool_count=2,checked_at=? WHERE candidate_id=?").run('a'.repeat(64), NOW, NOW, id(1));
  records = [];
  f.advance(DAY);
  await f.store.sync();
  assert.notEqual(family(f, bulk).hidden_at, null, '候補の無くなった量産の系列は隠す');
  assert.deepEqual(f.sql.prepare('SELECT id FROM noah_intake_families WHERE hidden_at IS NOT NULL ORDER BY id').all().map((row) => row.id), [bulk, id(0)].sort((a, b) => a.localeCompare(b)));
  assert.deepEqual(await listed(f), [id(1)]);
});

void test('regroup leaves a family hidden while its representative keeps failing the handshake', async (t) => {
  const f = fixture(t, async () => page([entry(1)]));
  await f.store.sync();
  markListed(f, 1);
  // 握手の失敗が続いて隠した系列（L7 が書く）。候補は有効のまま。握手が通るまで、名寄せでは戻さない。
  f.sql.prepare('UPDATE noah_intake_checks SET failures=3, first_failure_at=? WHERE candidate_id=?').run(NOW, id(1));
  f.sql.prepare('UPDATE noah_intake_families SET hidden_at=? WHERE id=?').run(NOW + 30 * DAY, id(1));
  f.advance(31 * DAY);
  await f.store.sync();
  assert.equal(family(f, id(1)).hidden_at, NOW + 30 * DAY);
  f.sql.prepare('UPDATE noah_intake_checks SET failures=0, first_failure_at=NULL WHERE candidate_id=?').run(id(1));
  f.advance(DAY);
  await f.store.sync();
  assert.equal(family(f, id(1)).hidden_at, null);
});

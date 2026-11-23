import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { applySourceSandboxSchema } from '../scripts/sky-monthly-sandbox-db.mjs';
import { createNoahBrowserQuota, NOAH_BROWSER_DAILY, noahQuotaWindow } from '../lib/noah-browser-quota.ts';

// task 129 の D1・抜け道 S1: ブラウザだけの本人は Cookie を捨てるだけで何人でも作れるので、
// 本人ごとの上限だけでは全体が増え続ける。ブラウザだけの本人を全員まとめた 1 日の上限を掛ける。
// 新しい表は作らず、アカウントの回数表（本番に既にある）を使う。

function database(t) {
  const sqlite = new DatabaseSync(':memory:');
  t.after(() => sqlite.close());
  applySourceSandboxSchema(sqlite);
  const db = { prepare(sql) { return { bind(...values) { return {
    async first() { return sqlite.prepare(sql).get(...values) ?? null; },
    async run() { const r = sqlite.prepare(sql).run(...values); return { meta: { changes: Number(r.changes) } }; },
  }; } }; } };
  return { sqlite, db };
}
const browser = (n) => `noah-browser:${String(n).padStart(64, '0')}`;
const DAY = 86_400_000;
const NOON = Date.UTC(2026, 10, 23, 12, 0, 0);

void test('ブラウザだけの本人は、何人に分かれても、全員まとめて 1 日の上限までしか書けない', async (t) => {
  const { db } = database(t);
  const quota = createNoahBrowserQuota(db, () => NOON, { ...NOAH_BROWSER_DAILY, asks: 5 });
  const results = [];
  for (let i = 0; i < 8; i++) results.push(await quota.take(browser(i), 'asks'));
  assert.deepEqual(results, [true, true, true, true, true, false, false, false]);
});

void test('量（バイト）は足して数え、越える 1 回は丸ごと断って、1 も足さない', async (t) => {
  const { db, sqlite } = database(t);
  const quota = createNoahBrowserQuota(db, () => NOON, { ...NOAH_BROWSER_DAILY, uploadBytes: 1000 });
  assert.equal(await quota.take(browser(1), 'uploadBytes', 600), true);
  assert.equal(await quota.take(browser(2), 'uploadBytes', 500), false, '600 + 500 は 1000 を越える');
  assert.equal(await quota.take(browser(3), 'uploadBytes', 400), true, '断った分は数えていない');
  assert.equal(await quota.take(browser(4), 'uploadBytes', 1), false);
  assert.equal(await quota.take(browser(5), 'uploadBytes', 1001), false, '1 回で上限を越える物は、最初の 1 回でも断る');
  assert.equal(await quota.take(browser(6), 'uploadBytes', 0), false);
  assert.equal(sqlite.prepare("SELECT attempts FROM rockstar_account_rate_limits WHERE request_key='noah-quota:uploadBytes'").get().attempts, 1000);
});

void test('サインインした本人は数えず、種類ごとに別に数える', async (t) => {
  const { db, sqlite } = database(t);
  const quota = createNoahBrowserQuota(db, () => NOON, { ...NOAH_BROWSER_DAILY, asks: 1, imports: 1 });
  assert.equal(await quota.take(browser(1), 'asks'), true);
  assert.equal(await quota.take(browser(2), 'asks'), false);
  for (let i = 0; i < 3; i++) assert.equal(await quota.take('chatgpt-user-1', 'asks'), true, 'サインインした本人は上限に数えない');
  assert.equal(await quota.take(browser(3), 'imports'), true, '別の種類は別に数える');
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM rockstar_account_rate_limits WHERE request_key LIKE 'noah-quota:%'").get().n, 2);
});

void test('次の日（UTC）には数え直し、アカウントの回数表の掃除は、日が終わって 10 分たってから行を消す', async (t) => {
  const { db, sqlite } = database(t);
  let now = NOON;
  const quota = createNoahBrowserQuota(db, () => now, { ...NOAH_BROWSER_DAILY, asks: 1 });
  assert.equal(await quota.take(browser(1), 'asks'), true);
  assert.equal(await quota.take(browser(2), 'asks'), false);
  // アカウントの側の掃除と同じ文（lib/rockstar-account.ts）。日の途中では消さない。
  const sweep = (at) => sqlite.prepare('DELETE FROM rockstar_account_rate_limits WHERE window < ?').run(Math.floor(at / 60_000) - 10);
  sweep(NOON + 11 * 3_600_000);
  assert.equal(await quota.take(browser(3), 'asks'), false, '同じ日のうちは、掃除の後も数えたまま');
  now = NOON + DAY;
  assert.equal(await quota.take(browser(4), 'asks'), true, '次の日は数え直す');
  const endOfFirstDay = Date.UTC(2026, 10, 24, 0, 0, 0);
  assert.equal(noahQuotaWindow(NOON), endOfFirstDay / 60_000);
  sweep(endOfFirstDay + 9 * 60_000);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM rockstar_account_rate_limits WHERE window = ?').get(noahQuotaWindow(NOON)).n, 1, '日が終わって 10 分までは残る');
  sweep(endOfFirstDay + 11 * 60_000);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM rockstar_account_rate_limits WHERE window = ?').get(noahQuotaWindow(NOON)).n, 0, 'その後は消える');
});

void test('同時に来ても、上限を越えて数えない（1 つの文で数えて書く）', async (t) => {
  const { db } = database(t);
  const quota = createNoahBrowserQuota(db, () => NOON, { ...NOAH_BROWSER_DAILY, connections: 10 });
  const results = await Promise.all(Array.from({ length: 25 }, (_, i) => quota.take(browser(i), 'connections')));
  assert.equal(results.filter(Boolean).length, 10);
});

void test('アカウントの表が無い D1 では上限を掛けずに通し、ほかの失敗はそのまま投げる', async (t) => {
  const sqlite = new DatabaseSync(':memory:');
  t.after(() => sqlite.close());
  const bare = { prepare(sql) { return { bind(...values) { return { async first() { return sqlite.prepare(sql).get(...values) ?? null; } }; } }; } };
  assert.equal(await createNoahBrowserQuota(bare, () => NOON).take(browser(1), 'asks'), true, 'Noah の本体を止めない');
  const down = { prepare() { return { bind() { return { async first() { throw Error('D1_ERROR: network connection lost'); } }; } }; } };
  await assert.rejects(() => createNoahBrowserQuota(down, () => NOON).take(browser(1), 'asks'), /network connection lost/);
  assert.equal(await createNoahBrowserQuota(down, () => NOON).take('chatgpt-user-1', 'asks'), true, 'サインインした本人は D1 に聞かない');
});

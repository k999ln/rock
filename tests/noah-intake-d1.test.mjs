// 取り込みの保存と読み出しを、実物の D1（workerd）に通す。手元の SQLite を包んだ試験（noah-intake-store.test.mjs）では確かめられない所:
// 番号つきの引数（?1）、1 文に結べる値の数、db.batch、RETURNING、窓関数つきの名寄せの文が、D1 でそのまま動くこと。本番の D1 ではない。
import test from 'node:test';
import assert from 'node:assert/strict';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { createIntakeStore } from '../lib/noah-intake-store.ts';
import { NOAH_LISTING_SQL, noahStatement } from '../lib/noah-intake-sql.ts';
import { H, readRepo, registry, registryEntry, split } from './helpers/noah-intake-fixture.mjs';

const T0 = Date.UTC(2026, 10, 20, 3, 0, 0);

void test('巡回・名寄せ・一覧・検索・集計・取り下げ・接続先の枠が、実物の D1 で動く', async (t) => {
  const worker = new Miniflare(
    convertV4MiniflareOptions({ modules: true, script: 'export default {fetch(){return new Response("noah intake fixture")}}', compatibilityDate: '2026-08-18', d1Databases: ['DB'], host: '127.0.0.1', port: 0 }),
  );
  t.after(() => worker.dispose());
  const db = await worker.getD1Database('DB');
  for (const statement of split(readRepo('drizzle/0044_noah_intake.sql'))) await db.prepare(statement).run();
  const one = async (query, ...args) => db.prepare(query).bind(...args).first();

  // 台帳 3 頁（100 件ずつ）: 同じ提供者・同じ host の量産 25 件、鍵の要る 1 件、端末で動かす 1 件、下書きを作れない 1 件、非推奨 1 件、残りは 1 件ずつ。
  const bulk = Array.from({ length: 25 }, (_, i) => registryEntry(`io.maker/tool-${String(i).padStart(2, '0')}`, { server: { remotes: [{ type: 'streamable-http', url: `https://gateway.maker-example.com/mcp/${i}` }] } }));
  const keyed = registryEntry('io.example/keyed', { server: { remotes: [{ type: 'streamable-http', url: 'https://keyed.example.com/mcp', headers: [{ name: 'X-Api-Key', isRequired: true, isSecret: true }] }] } });
  const local = registryEntry('io.example/local', { server: { remotes: undefined, packages: [{ registryType: 'npm', identifier: 'example-local-tool', version: '1.2.3', transport: { type: 'stdio' } }] } });
  const broken = registryEntry('io.example/broken', { server: { remotes: [{ type: 'sse', url: 'https://old.example.com/sse' }] } });
  const retired = registryEntry('io.example/retired', { meta: { status: 'deprecated' } });
  const plain = Array.from({ length: 221 }, (_, i) => registryEntry(`io.plain/agent-${String(i).padStart(3, '0')}`));
  const reg = registry({ entries: [...bulk, keyed, local, broken, retired, ...plain], size: 100 });
  const time = { value: T0 };
  const store = createIntakeStore({ db, fetcher: reg.fetcher, now: () => time.value, userAgent: 'NoahBot/1 (+https://noah.example.com/noah/help#bot)' });

  const first = await store.sync();
  assert.deepEqual(first.outcomes, [{ source: 'mcp-registry', mode: 'full', pages: 3, seen: 250, changed: 250, more: false, error: null }]);
  assert.deepEqual(await db.prepare('SELECT state, COUNT(*) AS n FROM noah_intake_candidates GROUP BY 1 ORDER BY 1').all().then((r) => r.results), [{ state: 'active', n: 248 }, { state: 'unsupported', n: 1 }, { state: 'withdrawn', n: 1 }]);
  assert.equal((await one('SELECT COUNT(*) AS n FROM noah_intake_checks')).n, 248);
  // 全件の後の名寄せ: 量産は 1 系列（25 件）。元の「1 件で 1 系列」の行は隠れる。
  assert.deepEqual(await one("SELECT members, representative_id, hidden_at FROM noah_intake_families WHERE id='bulk:io.maker@gateway.maker-example.com'"), { members: 25, representative_id: 'mcp-registry:io.maker/tool-00', hidden_at: null });
  assert.equal((await one("SELECT COUNT(*) AS n FROM noah_intake_families WHERE hidden_at IS NOT NULL AND id LIKE 'mcp-registry:io.maker/%'")).n, 25);
  assert.deepEqual(await one("SELECT checkpoint_at, last_full_at, cursor, sweep_started_at, observed, error_code FROM noah_intake_sources WHERE id='mcp-registry'"), { checkpoint_at: T0, last_full_at: T0, cursor: null, sweep_started_at: null, observed: 250, error_code: null });

  // 握手が通った後の形にする（握手そのものは L4）。3 件。うち 1 件は「動いた」。
  const ids = ['io.plain/agent-000', 'io.plain/agent-001', 'io.plain/agent-002'].map((name) => `mcp-registry:${name}`);
  for (const [i, id] of ids.entries()) {
    const level = i === 0 ? 2 : 1;
    await db.prepare("UPDATE noah_intake_checks SET level=?, result='ok', auth='none', tools_sha256=?, tool_count=4, read_only=1, form_tools=3, one_tap_tools=?, l1_at=?, l2_at=?, checked_at=? WHERE candidate_id=?").bind(level, H, i === 1 ? 0 : 1, T0, level === 2 ? T0 + 5 : null, T0, id).run();
    await noahStatement(db, NOAH_LISTING_SQL.touch, { candidate_id: id, level, l2_at: level === 2 ? T0 + 5 : null, badge_hint: level === 2 ? 'one_click' : 'unverified', listed: 1, one_tap: i === 1 ? 0 : 1, now: T0 }).run();
  }
  const member = { signedIn: true, reviewer: false };
  const reviewer = { signedIn: true, reviewer: true };
  const page = await store.list(new URLSearchParams(), member);
  assert.deepEqual(page.items.map((item) => [item.id, item.section, item.connect.badge]).sort((a, b) => (a[0] < b[0] ? -1 : 1)), [[ids[0], 'ran', 'one_click'], [ids[1], 'new', 'unverified'], [ids[2], 'new', 'unverified']]);
  assert.equal(page.items[0].id, ids[0], '「動いた」が先');
  assert.deepEqual([page.counts, page.nextCursor], [{ ran: 1, new: 2 }, null]);
  assert.deepEqual((await store.list(new URLSearchParams('oneTap=1'), member)).items.map((item) => item.id).sort(), [ids[0], ids[2]]);
  assert.deepEqual((await store.list(new URLSearchParams('q=agent-00'), member)).items.map((item) => item.id).sort(), ids);
  assert.deepEqual((await store.list(new URLSearchParams(`q=${encodeURIComponent('%%')}`), member)).items, [], '% を文字として探す');
  const detail = await store.detail(ids[1], member);
  assert.deepEqual([detail.members, detail.section, detail.connect.placeLabel, detail.connection], [1, 'new', '相手のサーバー（io-plain-agent-001.example.com）', null]);
  assert.equal((await store.detail('bulk:io.maker@gateway.maker-example.com', reviewer)).review.listing.reason, 'bulk');

  const status = await store.status();
  assert.deepEqual(status.table.map((row) => [row.mouth, row.candidates, row.noInput, row.setup]), [['mcp-remote', 247, 246, 1], ['mcp-package', 1, 1, 0]]);
  assert.deepEqual(status.unsupported.map((row) => [row.reason, row.count]), [['legacy_sse_only', 1]]);
  assert.deepEqual(Object.fromEntries(status.listing.reasons.map((row) => [row.reason, row.count])), { withdrawn: 1, unsupported: 1, later_mouth: 1, bulk: 25, needs_key: 1, not_checked: 218 });
  assert.equal(status.listing.listed, 3);

  // 取り下げと戻し。
  const revision = (await store.detail(ids[1], reviewer)).review.revision;
  time.value = T0 + 1_000;
  assert.deepEqual(await store.withdraw(ids[1], revision), { id: ids[1], revision: revision + 1, withdrawnAt: T0 + 1_000 });
  assert.deepEqual((await store.list(new URLSearchParams(), member)).items.map((item) => item.id).sort(), [ids[0], ids[2]]);
  assert.deepEqual(await store.withdraw(ids[1], revision), { id: ids[1], revision: revision + 1, withdrawnAt: T0 + 1_000 }, '同じ操作の送り直しは、同じ結果');
  await assert.rejects(store.restore(ids[1], revision), (error) => error.status === 409, 'revision が違う');
  assert.deepEqual(await store.restore(ids[1], revision + 1), { id: ids[1], revision: revision + 2, withdrawnAt: null });

  // 1 時間後: 更新された物だけ。版だけが変わった記録は、握手の記録を保つ。接続先が変わった記録は、確かめ直すまで載せない。
  time.value = T0 + 3_600_000;
  reg.state.updated = [registryEntry('io.plain/agent-000', { server: { version: '2.0.0' } }), registryEntry('io.plain/agent-002', { server: { remotes: [{ type: 'streamable-http', url: 'https://moved.example.com/mcp' }] } })];
  const second = await store.sync();
  assert.deepEqual(second.outcomes, [{ source: 'mcp-registry', mode: 'updated', pages: 1, seen: 2, changed: 2, more: false, error: null }]);
  assert.deepEqual(await one('SELECT level, result FROM noah_intake_checks WHERE candidate_id=?', ids[0]), { level: 2, result: 'ok' });
  assert.deepEqual(await one('SELECT level, result, tools_sha256 FROM noah_intake_checks WHERE candidate_id=?', ids[2]), { level: 0, result: 'unchecked', tools_sha256: null });
  assert.deepEqual((await store.list(new URLSearchParams(), member)).items.map((item) => item.id).sort(), [ids[0], ids[1]]);

  // 接続先の枠（RETURNING が行を返す）と、「混んでいる」の待ち。
  const take = async (at, limit = 2) => (await noahStatement(db, NOAH_LISTING_SQL.host_take, { host: 'busy.example.com', now: at, limit }).all()).results.map((row) => row.user_count);
  assert.deepEqual([await take(T0), await take(T0 + 1), await take(T0 + 2), await take(T0 + 60_000)], [[1], [2], [], [1]]);
  await noahStatement(db, NOAH_LISTING_SQL.host_wait, { host: 'busy.example.com', until: T0 + 500_000 }).run();
  assert.deepEqual([await take(T0 + 499_999), await take(T0 + 500_000)], [[], [1]]);
});

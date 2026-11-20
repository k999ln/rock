// 取り込みの表の定義と、一覧・検索・接続先の枠の問い合わせ。設計の文（docs/contracts/）と同じである事、D1 の形の引数で同じ結果になる事。
import test from 'node:test';
import assert from 'node:assert/strict';
import { NOAH_LISTING_SQL, noahNamedSql, noahStatement } from '../lib/noah-intake-sql.ts';
import { intakeDatabase, readRepo, seedFamily, split, stripSql } from './helpers/noah-intake-fixture.mjs';

void test('migration は、設計の DDL（docs/contracts/noah-v1.sql）の取り込みの 5 表と同じ文。今ある表を変えない', () => {
  const contract = split(readRepo('docs/contracts/noah-v1.sql')).map(stripSql).filter(Boolean);
  const last = contract.findIndex((statement) => statement.startsWith('CREATE TABLE IF NOT EXISTS noah_probe_hosts'));
  const migration = split(readRepo('drizzle/0044_noah_intake.sql'));
  assert.deepEqual(migration, contract.slice(0, last + 1));
  assert.equal(migration.length, 16);
  assert.equal(readRepo('drizzle-main/0044_noah_intake.sql'), readRepo('drizzle/0044_noah_intake.sql'), 'main の配備が読む系譜も同じ');
  const names = migration.map((statement) => /^CREATE (?:UNIQUE )?(?:TABLE|INDEX) IF NOT EXISTS ([a-z_]+)/.exec(statement)?.[1]);
  assert.ok(names.every(Boolean), '新しい表と索引を作る文だけ（IF NOT EXISTS）');
  assert.deepEqual(names.filter((name) => migration.some((statement) => statement.startsWith(`CREATE TABLE IF NOT EXISTS ${name} `))), ['noah_intake_sources', 'noah_intake_candidates', 'noah_intake_checks', 'noah_intake_families', 'noah_probe_hosts']);
  assert.doesNotMatch(migration.join('\n'), /\b(?:INSERT|UPDATE|DELETE|DROP|ALTER)\b/i, '今ある行と表に触らない');
  for (const dir of ['drizzle', 'drizzle-main']) {
    const journal = JSON.parse(readRepo(`${dir}/meta/_journal.json`)).entries;
    assert.equal(journal.at(-1).tag, '0044_noah_intake');
    assert.ok(journal.at(-1).when > Math.max(...journal.slice(0, -1).map((entry) => entry.when)), 'when は、今の最大より大きい');
  }
});

void test('問い合わせの文は、設計の文（docs/contracts/noah-listing-v1.sql）と同じ。注釈だけを外している', () => {
  const contract = {};
  for (const part of split(readRepo('docs/contracts/noah-listing-v1.sql'))) {
    const name = /^-- name: ([a-z_]+)\s*$/m.exec(part)?.[1];
    if (name) contract[name] = stripSql(part);
  }
  assert.deepEqual(Object.keys(NOAH_LISTING_SQL).sort(), ['connect_gate', 'counts', 'gate', 'host_take', 'host_wait', 'new', 'ran', 'reshuffle', 'search', 'touch']);
  assert.deepEqual({ ...NOAH_LISTING_SQL }, contract);
});

void test('名前つきの引数を、D1 が受ける番号つきの引数に直す。文字列と注釈の中は読まない', () => {
  assert.deepEqual(noahNamedSql("SELECT 'bulk:repo:' || id, ':x' FROM t WHERE a = :now AND b = :limit AND c > :now -- :ignored\n AND d = ':it''s:here'"), {
    sql: "SELECT 'bulk:repo:' || id, ':x' FROM t WHERE a = ?1 AND b = ?2 AND c > ?1 -- :ignored\n AND d = ':it''s:here'",
    names: ['now', 'limit'],
  });
  assert.deepEqual(noahNamedSql('SELECT 1'), { sql: 'SELECT 1', names: [] });
  assert.deepEqual(noahNamedSql(NOAH_LISTING_SQL.search).names, ['like', 'limit', 'offset'], "ESCAPE '\\' の中を、引数として読まない");
  assert.equal(noahNamedSql(NOAH_LISTING_SQL.host_take).names.join(), 'host,now,limit');
  const prepared = [];
  const db = { prepare: (sql) => ({ sql, bind: (...args) => (prepared.push([sql, args]), { sql, args }) }) };
  noahStatement(db, 'UPDATE t SET a = :a, b = :b WHERE a <> :a', { b: 2, a: null });
  assert.deepEqual(prepared, [['UPDATE t SET a = ?1, b = ?2 WHERE a <> ?1', [null, 2]]]);
  assert.throws(() => noahStatement(db, 'SELECT :missing', {}), /missing/, '足りない引数を、黙って NULL にしない');
});

void test('頁の継ぎ目: 同じ並びの値が続いても、重ならず、抜けない。並びの引き直しは、載せている L1 だけ', async (t) => {
  const { sql, db } = intakeDatabase(t);
  const ids = Array.from({ length: 30 }, (_, i) => seedFamily(sql, `io.page/agent-${String(i).padStart(2, '0')}`, { shuffle: 500 + Math.floor(i / 3), oneTap: i % 2 }));
  const ranId = seedFamily(sql, 'io.page/ran', { level: 2, l2At: 77, shuffle: 5 });
  const expected = sql.prepare('SELECT id FROM noah_intake_families WHERE listed=1 AND level=1 ORDER BY shuffle DESC, id').all().map((row) => row.id);
  assert.equal(expected.length, 30);
  const seen = [];
  let cursor = { before: 1_000_000_000, after_id: '' };
  for (let page = 0; page < 20; page++) {
    const rows = (await noahStatement(db, NOAH_LISTING_SQL.new, { ...cursor, one_tap: 0, limit: 7 }).all()).results;
    seen.push(...rows.map((row) => row.id));
    if (rows.length < 7) break;
    cursor = { before: rows.at(-1).shuffle, after_id: rows.at(-1).id };
  }
  assert.deepEqual(seen, expected);
  const quick = (await noahStatement(db, NOAH_LISTING_SQL.new, { before: 1_000_000_000, after_id: '', one_tap: 1, limit: 100 }).all()).results;
  assert.equal(quick.length, 15);

  const before = Object.fromEntries(sql.prepare('SELECT id, shuffle FROM noah_intake_families').all().map((row) => [row.id, row.shuffle]));
  await noahStatement(db, NOAH_LISTING_SQL.reshuffle).run();
  const after = Object.fromEntries(sql.prepare('SELECT id, shuffle FROM noah_intake_families').all().map((row) => [row.id, row.shuffle]));
  assert.ok(ids.filter((id) => after[id] !== before[id]).length >= 25);
  assert.ok(Object.values(after).every((value) => value >= 0 && value < 1_000_000_000));
  assert.equal(after[ranId], 5, '「動いた」の並びは引き直さない');
});

void test('写し（touch）: 握手・実行の直後に、名寄せを待たずに段が変わる。検索は % と _ を文字として探す', async (t) => {
  const { sql, db } = intakeDatabase(t);
  const one = seedFamily(sql, 'io.find/weather', { summary: '天気を 100% 調べる' });
  seedFamily(sql, 'io.find/agent_0', { summary: 'under_score' });
  seedFamily(sql, 'io.find/agentx0');
  seedFamily(sql, 'io.find/hidden-weather', { level: 0, summary: '天気（まだ握手していない）' });
  const ids = async (name, params) => (await noahStatement(db, NOAH_LISTING_SQL[name], params).all()).results.map((row) => row.id);
  const firstRan = { before_at: Number.MAX_SAFE_INTEGER, after_id: '', limit: 50 };
  const firstNew = { before: 1_000_000_000, after_id: '', one_tap: 0, limit: 50 };
  await noahStatement(db, NOAH_LISTING_SQL.touch, { candidate_id: one, level: 2, l2_at: 400, badge_hint: 'one_click', listed: 1, one_tap: 0, now: 400 }).run();
  assert.deepEqual(await ids('ran', firstRan), [one]);
  assert.ok(!(await ids('new', firstNew)).includes(one));
  await noahStatement(db, NOAH_LISTING_SQL.touch, { candidate_id: one, level: 0, l2_at: null, badge_hint: 'unverified', listed: 0, one_tap: 0, now: 500 }).run();
  assert.ok(![...(await ids('ran', firstRan)), ...(await ids('new', firstNew))].includes(one));
  assert.equal(sql.prepare('SELECT l2_at FROM noah_intake_families WHERE id=?').get(one).l2_at, null);
  await noahStatement(db, NOAH_LISTING_SQL.touch, { candidate_id: one, level: 1, l2_at: null, badge_hint: 'unverified', listed: 1, one_tap: 1, now: 600 }).run();

  const like = (word) => `%${word.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
  const find = (word) => ids('search', { like: like(word), limit: 50, offset: 0 });
  assert.deepEqual(await find('weather'), [one], '載せていない物は出さない');
  assert.deepEqual(await find('天気'), [one]);
  assert.deepEqual(await find('100%'), [one]);
  assert.deepEqual(await find('%'), [one], '% を、何にでも合う記号として扱わない');
  assert.deepEqual(await find('agent_0'), ['mcp-registry:io.find/agent_0'], '_ を、1 文字に合う記号として扱わない');
  assert.deepEqual(await find('\\'), []);
});

void test('接続先の枠: 60 秒の枠に決まった回数まで。「混んでいる」と返されたら、その時刻まで待つ。巡回の間隔には触らない', async (t) => {
  const { sql, db } = intakeDatabase(t);
  const now = 10_000_000;
  const take = async (at, limit = 3, host = 'busy.example.com') => (await noahStatement(db, NOAH_LISTING_SQL.host_take, { host, now: at, limit }).all()).results.map((row) => row.user_count);
  assert.deepEqual([await take(now), await take(now + 1), await take(now + 2), await take(now + 3)], [[1], [2], [3], []], '4 回目は取れない');
  assert.deepEqual([await take(now + 59_999), await take(now + 60_000), await take(now + 60_001)], [[], [1], [2]], '最初に取った時刻から 60 秒で、枠が明ける');
  assert.deepEqual(await take(now + 60_002, 2), [], '上限を下げると、その場で効く');
  assert.deepEqual(await take(now, 3, 'other.example.com'), [1], '別の接続先の枠は別');
  assert.equal(sql.prepare("SELECT last_probe_at FROM noah_probe_hosts WHERE host='busy.example.com'").get().last_probe_at, 0, '巡回の握手を妨げない');
  await noahStatement(db, NOAH_LISTING_SQL.host_wait, { host: 'busy.example.com', until: now + 300_000 }).run();
  await noahStatement(db, NOAH_LISTING_SQL.host_wait, { host: 'busy.example.com', until: now + 200_000 }).run();
  assert.equal(sql.prepare("SELECT not_before FROM noah_probe_hosts WHERE host='busy.example.com'").get().not_before, now + 300_000, '待つ時刻は、短くはならない');
  assert.deepEqual([await take(now + 299_999), await take(now + 300_000)], [[], [1]]);
  await noahStatement(db, NOAH_LISTING_SQL.host_wait, { host: 'new-busy.example.com', until: now + 50_000 }).run();
  assert.deepEqual([await take(now, 3, 'new-busy.example.com'), await take(now + 50_000, 3, 'new-busy.example.com')], [[], [1]], '初めての host でも待つ');
});

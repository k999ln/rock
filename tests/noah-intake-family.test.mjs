// 名寄せ（系列）と、ローンチの一覧に載せる条件。純関数の試験は docs/design-validation/noah/noah-intake.test.mjs から移した（L3）。
// SQL（NOAH_REGROUP_SQL）が純関数と同じ結果になる事を、D1 と同じ形（番号つきの引数）で確かめる。
import test from 'node:test';
import assert from 'node:assert/strict';
import { NOAH_BULK_THRESHOLD, NOAH_LISTING_REASONS, NOAH_REGROUP_SQL, groupNoahFamilies, noahListing, noahRepositoryKey } from '../lib/noah-intake-family.ts';
import { NOAH_LISTING_SQL, noahStatement } from '../lib/noah-intake-sql.ts';
import { H, fixture, intakeDatabase, readRepo, split, stripSql } from './helpers/noah-intake-fixture.mjs';

void test('名寄せ: 規則ごと', () => {
  const reg = (name, host, extra = {}) => ({ id: `mcp-registry:${name}`, source: 'mcp-registry', name, host, ...extra });
  const bulk = Array.from({ length: NOAH_BULK_THRESHOLD }, (_, i) => reg(`io.github.maker/tool-${i}`, 'gateway.maker.example'));
  const almost = Array.from({ length: NOAH_BULK_THRESHOLD - 1 }, (_, i) => reg(`io.github.small/tool-${i}`, 'api.small.example'));
  const sameRepo = Array.from({ length: NOAH_BULK_THRESHOLD }, (_, i) => reg(`io.github.mono/pkg-${i}`, undefined, { repository: 'https://github.com/Mono/Servers' }));
  const twoInRepo = [reg('io.github.duo/alpha', undefined, { repository: 'https://github.com/duo/tools' }), reg('io.github.duo/beta', undefined, { repository: 'https://github.com/duo/tools' })];
  const mirror = [reg('ai.smithery/owner-thing', 'server.smithery.example', { repository: 'https://github.com/owner/thing', toolsSha256: 'f'.repeat(64) }), reg('io.github.owner/thing', 'thing.example', { repository: 'https://github.com/owner/thing.git', toolsSha256: 'f'.repeat(64) })];
  const cross = [reg('io.github.solo/agent', undefined, { repository: 'https://github.com/solo/agent' }), { id: 'discovery-1', source: 'discovery', name: 'solo/agent', repository: 'https://github.com/solo/agent' }];
  const copies = Array.from({ length: NOAH_BULK_THRESHOLD }, (_, i) => ({ id: `hf-mcp-space:user${i}/mcp-sentiment`, source: 'hf-mcp-space', name: `user${i}/MCP-Sentiment`, running: i === 7, likes: i }));
  const fewCopies = [{ id: 'hf-mcp-space:a/demo', source: 'hf-mcp-space', name: 'a/demo' }, { id: 'hf-mcp-space:b/demo', source: 'hf-mcp-space', name: 'b/demo' }];
  const sameTools = [{ id: 'hf-mcp-space:c/calc', source: 'hf-mcp-space', name: 'c/calc', toolsSha256: 'e'.repeat(64) }, { id: 'hf-mcp-space:d/calc', source: 'hf-mcp-space', name: 'd/Calc', toolsSha256: 'e'.repeat(64), level: 2 }];
  const { familyOf, representative } = groupNoahFamilies([...bulk, ...almost, ...sameRepo, ...twoInRepo, ...mirror, ...cross, ...copies, ...fewCopies, ...sameTools]);
  const families = (items) => new Set(items.map((i) => familyOf.get(i.id)));

  assert.deepEqual([...families(bulk)], ['bulk:io.github.maker@gateway.maker.example'], '1) 同じ名前空間・同じ host が 20 件 → 1 系列');
  assert.equal(families(almost).size, NOAH_BULK_THRESHOLD - 1, '19 件はまとめない');
  assert.deepEqual([...families(sameRepo)], ['bulk:repo:github.com/mono/servers'], '2) 同じリポジトリが 20 件 → 1 系列（大文字小文字を区別しない）');
  assert.equal(families(twoInRepo).size, 2, '同じリポジトリの 2 件は、握手の前はまとめない');
  assert.equal(families(mirror).size, 1, '3) 道具の定義の hash とリポジトリが同じ → 同じ物');
  assert.match([...families(mirror)][0], /^same:f{16}:github\.com\/owner\/thing$/);
  assert.deepEqual([...families(cross)], ['repo:github.com/solo/agent'], '4) 出どころが違い、リポジトリが同じ');
  assert.deepEqual([...families(copies)], ['space:mcp-sentiment'], '5) 同じ名前の Space が 20 件');
  assert.equal(representative.get('space:mcp-sentiment'), 'hf-mcp-space:user7/mcp-sentiment', '代表は、動いている物');
  assert.equal(families(fewCopies).size, 2, '同じ名前の Space 2 件は、握手の前はまとめない');
  assert.equal(families(sameTools).size, 1, '握手の後、道具の定義が同じなら 1 系列');
  assert.equal(representative.get([...families(sameTools)][0]), 'hf-mcp-space:d/calc', '代表は、接続試験が深い物');
  assert.equal(noahRepositoryKey('https://github.com/A/B.git'), 'github.com/a/b');
  assert.equal(noahRepositoryKey('https://example.com/a/b'), null);
});

void test('ローンチの一覧に載せる条件: 表の全行', () => {
  const { cases } = fixture('listing-cases.json');
  assert.equal(cases.length, 24);
  const seen = new Set();
  for (const c of cases) {
    const k = c.check;
    const got = noahListing({
      source: c.source, familyId: c.bulk ? 'bulk:io.maker@gateway.example' : `${c.source}:io.case/agent`, candidateState: c.state, withdrawn: c.withdrawn === true, hidden: c.hidden === true,
      check: k && { mouth: k.mouth, setup: k.setup === 1, auth: k.auth, result: k.result, level: k.level, formTools: k.formTools, oneTapTools: k.oneTapTools },
    });
    assert.deepEqual(got, c.expect, c.name);
    if (!got.listed) seen.add(got.reason);
  }
  assert.deepEqual(NOAH_LISTING_REASONS.filter((reason) => !seen.has(reason)), [], '載せない理由の全部に、表の行がある');
  assert.equal(seen.size, NOAH_LISTING_REASONS.length);
});

void test('名寄せの文は、設計の文（docs/contracts/noah-regroup-v1.sql）と同じ。注釈だけを外している', () => {
  const contract = split(readRepo('docs/contracts/noah-regroup-v1.sql')).map(stripSql).filter(Boolean);
  assert.equal(contract.length, 8);
  assert.deepEqual([...NOAH_REGROUP_SQL], contract);
});

// 一時 DB に、候補と握手の記録を直に置く（握手そのものは L4）。
function seeder(sql) {
  for (const source of ['mcp-registry', 'hf-mcp-space', 'acp-registry']) sql.prepare('INSERT INTO noah_intake_sources(id) VALUES(?)').run(source);
  return function add(source, key, groupKey, { host = null, repository = null, state = 'active', running = 1, likes = 0, summary = '', check = null } = {}) {
    const id = `${source}:${key}`;
    sql
      .prepare(
        `INSERT INTO noah_intake_candidates(id, source, external_key, family_id, group_key, name, summary, repository, host, record_sha256, record_json, state, reason, running, likes, source_updated_at, first_seen_at, changed_at, seen_at, revision)
         VALUES(?,?,?,?,?,?,?,?,?,?,'{}',?,?,?,?,5,1,1,1,1)`,
      )
      .run(id, source, key, id, groupKey, key, summary, repository, host, H, state, state === 'unsupported' ? 'bad_url' : null, running, likes);
    if (check) {
      const level = check.level ?? 0;
      const failures = check.failures ?? 0;
      sql
        .prepare(
          `INSERT INTO noah_intake_checks(candidate_id, mouth, surface, auth, connect_json, connect_sha256, setup, tools_sha256, form_tools, one_tap_tools, level, result, l1_at, l2_at, next_check_at, failures, first_failure_at)
           VALUES(?,?,?,?,'{}',?,?,?,?,?,?,?,?,?,0,?,?)`,
        )
        .run(id, check.mouth ?? 'mcp-remote', check.surface ?? 'none', check.auth ?? 'none', H, check.setup ?? 0, check.tools ?? (level ? H : null), check.formTools ?? null, check.oneTapTools ?? null,
          level, check.result ?? (level ? 'ok' : 'unchecked'), level ? 10 : null, level === 2 ? 20 : null, failures, failures ? 9 : null);
    }
    return id;
  };
}
const regroup = (db, stamp) =>
  db.batch(NOAH_REGROUP_SQL.map((sql) => noahStatement(db, sql, { ...(sql.includes(':threshold') ? { threshold: NOAH_BULK_THRESHOLD } : {}), ...(sql.includes(':now') ? { now: stamp } : {}) })));
const column = (sql, query, ...args) => Object.fromEntries(sql.prepare(query).all(...args).map((row) => Object.values(row)));

void test('名寄せの SQL が、純関数と同じ系列と代表を作る。変わらなければ 1 行も書かない', async (t) => {
  const { sql, db } = intakeDatabase(t);
  const add = seeder(sql);
  const T = NOAH_BULK_THRESHOLD;
  const tools = (hash, level = 1) => ({ check: { tools: hash.repeat(64), level } });
  const bulk = Array.from({ length: T }, (_, i) => add('mcp-registry', `io.github.maker/tool-${i}`, 'io.github.maker', { host: 'gateway.maker.example' }));
  const almost = Array.from({ length: T - 1 }, (_, i) => add('mcp-registry', `io.github.small/tool-${i}`, 'io.github.small', { host: 'api.small.example' }));
  const sameRepo = Array.from({ length: T }, (_, i) => add('mcp-registry', `io.github.mono/pkg-${i}`, 'io.github.mono', { repository: 'github.com/mono/servers' }));
  const two = ['alpha', 'beta'].map((n) => add('mcp-registry', `io.github.duo/${n}`, 'io.github.duo', { repository: 'github.com/duo/tools' }));
  const mirror = [
    add('mcp-registry', 'ai.smithery/owner-thing', 'ai.smithery', { host: 'server.smithery.example', repository: 'github.com/owner/thing', ...tools('f') }),
    add('mcp-registry', 'io.github.owner/thing', 'io.github.owner', { host: 'thing.example', repository: 'github.com/owner/thing', ...tools('f') }),
  ];
  const cross = [add('mcp-registry', 'io.github.solo/agent', 'io.github.solo', { repository: 'github.com/solo/agent' }), add('acp-registry', 'solo-agent', 'solo-agent', { repository: 'github.com/solo/agent' })];
  const copies = Array.from({ length: T }, (_, i) => add('hf-mcp-space', `user${i}/mcp-sentiment`, 'mcp-sentiment', { running: i === 7 ? 1 : 0, likes: i }));
  const few = [add('hf-mcp-space', 'a/demo', 'demo'), add('hf-mcp-space', 'b/demo', 'demo')];
  const sameTools = [add('hf-mcp-space', 'c/calc', 'calc', tools('e')), add('hf-mcp-space', 'd/calc', 'calc', tools('e', 2))];

  await regroup(db, 100);
  const family = column(sql, 'SELECT id, family_id FROM noah_intake_candidates');
  const fam = (ids) => [...new Set(ids.map((id) => family[id]))].sort((a, b) => (a < b ? -1 : 1));
  assert.deepEqual(fam(bulk), ['bulk:io.github.maker@gateway.maker.example']);
  assert.equal(fam(almost).length, T - 1);
  assert.deepEqual(fam(sameRepo), ['bulk:repo:github.com/mono/servers']);
  assert.equal(fam(two).length, 2);
  assert.deepEqual(fam(mirror), ['same:ffffffffffffffff:github.com/owner/thing']);
  assert.deepEqual(fam(cross), ['repo:github.com/solo/agent']);
  assert.deepEqual(fam(copies), ['space:mcp-sentiment']);
  assert.equal(fam(few).length, 2);
  assert.deepEqual(fam(sameTools), ['same:eeeeeeeeeeeeeeee:space/calc']);

  // 純関数に同じ入力を渡して、同じ系列と代表になる事を確かめる。
  const rows = sql.prepare('SELECT c.id, c.source, c.external_key, c.host, c.repository, c.running, c.likes, k.tools_sha256, k.level FROM noah_intake_candidates c LEFT JOIN noah_intake_checks k ON k.candidate_id = c.id').all();
  const pure = groupNoahFamilies(rows.map((row) => ({
    id: row.id, source: row.source, name: row.external_key, host: row.host ?? undefined, repository: row.repository ? `https://${String(row.repository)}` : undefined,
    toolsSha256: row.tools_sha256 ?? undefined, running: row.running === 1, level: row.level ?? 0, likes: row.likes, updatedAt: 5,
  })));
  // 4) の「出どころが違う」は、純関数では台帳と発見、SQL では取り込みの表の中の出どころ（どちらも「出どころごとに 1 件」）。
  assert.deepEqual(family, Object.fromEntries(pure.familyOf));
  const representative = column(sql, 'SELECT id, representative_id FROM noah_intake_families');
  assert.deepEqual(representative, Object.fromEntries(pure.representative));
  assert.equal(representative['space:mcp-sentiment'], 'hf-mcp-space:user7/mcp-sentiment', '代表は、動いている物');
  assert.equal(representative['same:eeeeeeeeeeeeeeee:space/calc'], 'hf-mcp-space:d/calc', '代表は、接続試験が深い物');
  const members = column(sql, 'SELECT id, members FROM noah_intake_families');
  assert.equal(members['bulk:io.github.maker@gateway.maker.example'], T);
  assert.equal(members['space:mcp-sentiment'], T);
  assert.equal(Object.keys(members).length, new Set(Object.values(family)).size);

  // もう一度流しても、同じ系列。変わらない系列の行は書かない（D1 は、書いた行の数で数える）。
  const revisions = column(sql, 'SELECT id, revision FROM noah_intake_families');
  await regroup(db, 150);
  assert.deepEqual(column(sql, 'SELECT id, family_id FROM noah_intake_candidates'), family);
  assert.deepEqual(column(sql, 'SELECT id, revision FROM noah_intake_families'), revisions);
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM noah_intake_families WHERE updated_at = 150').get().n, 0);

  // 候補が無くなった系列は隠す（行は消さない）。
  sql.prepare("UPDATE noah_intake_candidates SET state='withdrawn' WHERE id='hf-mcp-space:a/demo'").run();
  await regroup(db, 200);
  assert.equal(sql.prepare("SELECT hidden_at FROM noah_intake_families WHERE id='hf-mcp-space:a/demo'").get().hidden_at, 200);
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM noah_intake_families WHERE hidden_at IS NOT NULL').get().n, 1);
});

void test('一覧の SQL が、表（listing-cases.json）と同じ物を、同じ段に出す', async (t) => {
  const { sql, db } = intakeDatabase(t);
  const add = seeder(sql);
  const { cases } = fixture('listing-cases.json');
  const ids = {};
  cases.forEach((c, n) => {
    const ns = `io.case${n}`;
    const check = c.check && { mouth: c.check.mouth, surface: c.check.surface, auth: c.check.auth, setup: c.check.setup, level: c.check.level, result: c.check.result, failures: c.check.failures, formTools: c.check.formTools, oneTapTools: c.check.oneTapTools };
    if (c.bulk) {
      for (let i = 0; i < NOAH_BULK_THRESHOLD; i++) add(c.source, `${ns}/tool-${i}`, ns, { host: 'gateway.example', state: c.state, check });
      ids[c.name] = `bulk:${ns}@gateway.example`;
    } else {
      const host = c.check && ['mcp-remote', 'space-mcp'].includes(c.check.mouth) ? `h${n}.example` : null;
      ids[c.name] = add(c.source, `${ns}/agent`, c.source === 'mcp-registry' ? ns : `agent${n}`, { host, state: c.state, check });
    }
  });
  await regroup(db, 100);
  for (const c of cases) {
    if (c.withdrawn) sql.prepare('UPDATE noah_intake_families SET withdrawn_at=150 WHERE id=?').run(ids[c.name]);
    if (c.hidden) sql.prepare('UPDATE noah_intake_families SET hidden_at=150 WHERE id=?').run(ids[c.name]);
  }
  const all = async (name, params) => (await noahStatement(db, NOAH_LISTING_SQL[name], params).all()).results.map((row) => row.id);
  const ran = await all('ran', { before_at: Number.MAX_SAFE_INTEGER, after_id: '', limit: 500 });
  const fresh = await all('new', { before: 1_000_000_000, after_id: '', one_tap: 0, limit: 500 });
  const quick = await all('new', { before: 1_000_000_000, after_id: '', one_tap: 1, limit: 500 });
  for (const c of cases) {
    const id = ids[c.name];
    const section = ran.includes(id) ? 'ran' : fresh.includes(id) ? 'new' : null;
    assert.equal(section, c.expect.listed ? c.expect.section : null, c.name);
    if (c.expect.listed && c.expect.section === 'new') assert.equal(quick.includes(id), c.expect.oneTap, `${c.name}: 押すだけの絞り込み`);
  }
  assert.deepEqual(ran.filter((id) => fresh.includes(id)), []);
  // 集計は、全部の候補を 1 回ずつ数える。
  const counted = (await noahStatement(db, NOAH_LISTING_SQL.counts).all()).results.reduce((total, row) => total + row.n, 0);
  assert.equal(counted, sql.prepare('SELECT COUNT(*) AS n FROM noah_intake_candidates').get().n);
});

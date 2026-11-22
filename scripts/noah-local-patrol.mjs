#!/usr/bin/env node
// Noah の取り込みと握手を、本番の外（手元・作業用の計算機）で行う。本番と同じコード（lib/noah-intake-store.ts）と、本番と同じ migration の表を使う。
// 重い所（台帳 約 7 万件の読み取りと、相手のサーバーへの握手）をここで済ませ、本番へは、一覧に載せる系列の行だけを送る（運営の画面の「取り込みの結果を入れる」）。
// 本番の巡回（NOAH_PATROL_ENABLED）を開けなくても、一覧が使える。本番の D1 の書き込みは、載せる系列の数 × 約 3 行で済む。
//
// 使い方:
//   node --experimental-strip-types scripts/noah-local-patrol.mjs [--db work/noah-local/intake.sqlite] [--minutes 60] [--out work/noah-local/import.json]
//     [--export-only] [--limit 2000] [--first data/noah-shelf-first-cards.json]
// --limit: 書き出す系列の数を絞る（本番の D1 の書き込みは、新しい系列 1 つで約 13 行。日ごとの枠がある時は、日を分けて増やす）。
// --first: 先に入れる系列。棚のカードのファイル（カードの工程が使う系列）か、系列の ID の配列の JSON。残りは、1 回で頼める道具を持つ物・読むだけの物・応答の速い物の順。
// 何度でも続きから動く（台帳の頁の位置と、握手の予定は、DB に残る）。同じ接続先へは 1 時間に 1 回しか握手しない（本番と同じ決まり）。
// 名乗りは本番と同じ NoahBot/1。相手へ送るのは握手（initialize・tools/list）だけで、道具は呼ばない。
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createIntakeStore } from '../lib/noah-intake-store.ts';
import { noahIntakeExport } from '../lib/noah-intake-import.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : fallback; };
const dbPath = resolve(root, arg('--db', 'work/noah-local/intake.sqlite'));
const outPath = resolve(root, arg('--out', 'work/noah-local/import.json'));
const minutes = Number(arg('--minutes', '60'));
const exportOnly = process.argv.includes('--export-only');
const limitArg = arg('--limit', null), firstArg = arg('--first', null);
const limit = limitArg === null ? undefined : Number(limitArg);
if (limit !== undefined && (!Number.isSafeInteger(limit) || limit < 0)) throw Error('--limit は 0 以上の整数です。');
/** --first のファイルから、系列の ID を読む（カードの配列なら、工程が使う系列。文字の配列なら、そのまま）。 */
const first = firstArg === null ? [] : (() => {
  const value = JSON.parse(readFileSync(resolve(root, firstArg), 'utf8'));
  if (!Array.isArray(value)) throw Error('--first は、配列の JSON です。');
  return [...new Set(value.flatMap((item) => (typeof item === 'string' ? [item] : (item?.steps ?? []).flatMap((step) => (step?.ref?.kind === 'family' ? [step.ref.familyId] : [])))))];
})();
mkdirSync(dirname(dbPath), { recursive: true });

const fresh = !existsSync(dbPath);
const sql = new DatabaseSync(dbPath);
sql.exec('PRAGMA journal_mode = WAL');
if (fresh) {
  // 取り込みの表と、それが指す表（家の端末・接続・依頼）。本番と同じ migration を、順に流す。
  for (const name of ['0043_noah_runner', '0044_noah_intake', '0047_noah_connections', '0048_noah_asks', '0049_noah_connections_connecting']) {
    sql.exec(readFileSync(resolve(root, 'drizzle', `${name}.sql`), 'utf8'));
  }
}
/** D1 と同じ形の、手元の DB（prepare・bind・first・all・run・batch）。batch は 1 つの transaction。 */
const db = {
  prepare(query) {
    const statement = {
      query, args: [],
      bind(...args) { return { ...statement, args }; },
      async first() { return sql.prepare(query).get(...this.args) ?? null; },
      async all() { return { results: sql.prepare(query).all(...this.args) }; },
      async run() { return { meta: { changes: Number(sql.prepare(query).run(...this.args).changes) } }; },
    };
    return statement;
  },
  async batch(statements) {
    const reads = (query) => /^\s*SELECT\b/iu.test(query) || (/^\s*WITH\b/iu.test(query) && !/\b(?:INSERT|UPDATE|DELETE|REPLACE)\b/iu.test(query));
    sql.exec('BEGIN');
    try {
      const results = [];
      for (const statement of statements) results.push(reads(statement.query) ? { ...(await statement.all()), meta: { changes: 0 } } : await statement.run());
      sql.exec('COMMIT');
      return results;
    } catch (error) { sql.exec('ROLLBACK'); throw error; }
  },
};

const log = (event) => console.log(JSON.stringify({ at: new Date().toISOString(), ...event }));
if (!exportOnly) {
  // 手元では、本番の合図 1 回より多く進める（CPU の上限が無い）。同じ接続先へ 1 時間に 1 回の決まりは、そのまま。
  const budget = { pages: 1000, probes: 96, concurrent: 24, seconds: 55 };
  const store = createIntakeStore({ db, now: Date.now, fetcher: fetch, origin: 'https://avoado.si', budget });
  const end = Date.now() + minutes * 60_000;
  // 1. 台帳を最後まで読む。
  for (let round = 0; Date.now() < end; round++) {
    const outcome = await store.sync();
    log({ step: 'sync', round, ...outcome });
    if (!outcome.more) break;
  }
  // 2. 期限の来た候補へ握手する。握手できる物が無くなるか、時間が来たら止める。
  let idle = 0;
  while (Date.now() < end && idle < 3) {
    const counts = await store.probeDue(Date.now() + 50_000);
    log({ step: 'probe', ...counts });
    idle = counts.probes === 0 ? idle + 1 : 0;
  }
}
// 3. 本番へ送る分（一覧に載せる系列と、その候補・握手の行）を書き出す。
const exported = await noahIntakeExport(db, Date.now(), { limit, first });
const missing = first.filter((id) => !exported.families.some((family) => family.id === id));
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(exported));
const totals = sql.prepare("SELECT (SELECT COUNT(*) FROM noah_intake_candidates) AS registry, (SELECT COUNT(*) FROM noah_intake_checks WHERE result='unchecked') AS unchecked, (SELECT COUNT(*) FROM noah_intake_checks WHERE level>=1) AS passed, (SELECT COUNT(*) FROM noah_intake_families WHERE listed=1) AS listed").get();
// 本番の D1 に書く行の目安（新しく入れる時。候補 6・握手 3・系列 4 の、表と索引）。入れ直しで変わっていない物は 0。
log({ step: 'export', out: outPath, families: exported.families.length, candidates: exported.candidates.length, bytes: Buffer.byteLength(JSON.stringify(exported)), rowsIfNew: exported.candidates.length * 9 + exported.families.length * 4, firstMissing: missing, ...totals });
sql.close();

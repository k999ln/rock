// 収集機が握手まで済ませた系列を、本番の一覧（グリッド）へ自動で入れる（task 121。本人の指示 2026-11-22「常に新しく使いやすいものが上に」）。
// 入れる口は、審査者が手で入れる時と同じ POST /api/noah/intake/import と同じ決まり（noahIntakeImport）。認証は、収集機の鍵（NOAH_COLLECTION_KEY）の
// 時刻・path・本文 hash の HMAC（紹介の掲載と同じ鍵。path が違うので、掲載の署名をここへ使い回せない）。
// 送るのは、前に送った時から変わった系列だけ（行の hash を手元に残す）。手元で載らなくなった系列も、今の行を送って、本番で載せない側へ直す。
// 本番の D1 の書き込みを守るため、1 日（UTC）に入れる系列の数と、1 回に入れる数に上限を置く。押すだけで試せる物・新しく握手が通った物から先に入れる。
import { createHash } from 'node:crypto';
import { collectionSignature, noahCollectionBlocked } from '../lib/noah-collection.ts';
import { NOAH_INTAKE_IMPORT_PATH, noahIntakeExport, noahIntakeImportParts } from '../lib/noah-intake-import.ts';
export const NOAH_COLLECTOR_IMPORT = { familiesPerDay: 400, familiesPerRun: 120 };
const DAY = 86_400_000;

function tables(sql) {
  sql.exec(`CREATE TABLE IF NOT EXISTS _noah_collector_sent(family_id TEXT PRIMARY KEY, sha256 TEXT NOT NULL, listed INTEGER NOT NULL, sent_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS _noah_collector_import_days(day INTEGER PRIMARY KEY, families INTEGER NOT NULL, rows_written INTEGER NOT NULL);`);
}
/** 本番へ入れ終えて、載っている系列（紹介のカードを「スマホで今すぐ」にして、詳細へつなぐのは、これだけ）。 */
export function importedFamilies(sql) {
  tables(sql);
  return new Set(sql.prepare('SELECT family_id FROM _noah_collector_sent WHERE listed=1').all().map(row => row.family_id));
}
// 握手の時刻・次の予定・応答の速さだけの変化では送り直さない（本番も、それだけでは書き換えない）。
const VOLATILE = new Set(['seen_at', 'changed_at', 'revision', 'checked_at', 'next_check_at', 'latency_ms', 'updated_at', 'shuffle', 'failures', 'first_failure_at', 'lease_until']);
const stable = row => Object.fromEntries(Object.entries(row).filter(([key]) => !VOLATILE.has(key)).sort(([a], [b]) => a.localeCompare(b)));
function familyHashes(part) {
  const byFamily = new Map(part.families.map(family => [family.id, { family: stable(family), candidates: [], checks: [] }]));
  const familyOf = new Map();
  for (const candidate of part.candidates) { familyOf.set(candidate.id, candidate.family_id); byFamily.get(candidate.family_id)?.candidates.push(stable(candidate)); }
  for (const check of part.checks) byFamily.get(familyOf.get(check.candidate_id))?.checks.push(stable(check));
  return new Map([...byFamily].map(([id, value]) => [id, createHash('sha256').update(JSON.stringify(value)).digest('hex')]));
}
function pick(part, ids) {
  const keep = new Set(ids), candidates = part.candidates.filter(row => keep.has(row.family_id)), candidateIds = new Set(candidates.map(row => row.id));
  return { ...part, families: part.families.filter(row => keep.has(row.id)), candidates, checks: part.checks.filter(row => candidateIds.has(row.candidate_id)) };
}

/** 変わった系列を、上限の中で送る。失敗した回は、そこで止めて、次の巡回で続きから（送り終えた分の印だけを残す）。 */
export async function importFamilies({ local, origin, key, fetcher, now = Date.now, limits = NOAH_COLLECTOR_IMPORT, includePins = true, includePinFor }) {
  tables(local.sql);
  const target = new URL(origin);
  if (target.protocol !== 'https:' || target.pathname !== '/' || target.search || target.hash || target.username || target.password || !key || key.length < 32) throw Error('collector_import_configuration');
  const at = now(), day = Math.floor(at / DAY);
  const used = local.sql.prepare('SELECT families FROM _noah_collector_import_days WHERE day=?').get(day)?.families ?? 0;
  const room = Math.max(0, Math.min(limits.familiesPerRun, limits.familiesPerDay - used));
  if (!room) return { status: 'daily_limit', sent: 0, rowsWritten: 0 };
  // 押すだけで試せる物、読むだけの物、応答の速い物の順（noahIntakeExport の並び）。その中で、新しく握手が通った物を先に。
  const listed = await noahIntakeExport(local.db, at, { limit: Number.MAX_SAFE_INTEGER, includePins, includePinFor });
  const l1 = new Map(listed.checks.map(row => [row.candidate_id, Number(row.l1_at) || 0]));
  const order = new Map(listed.families.map((row, index) => [row.id, index]));
  const sentRows = new Map(local.sql.prepare('SELECT family_id,sha256,listed FROM _noah_collector_sent').all().map(row => [row.family_id, row]));
  const hashes = familyHashes(listed);
  // 成人向けの語に当たる系列は、一覧へ自動では入れない（紹介と同じ決まり。lib/noah-collection.ts）。
  const representative = new Map(listed.candidates.map(row => [row.id, row]));
  const blocked = row => { const c = representative.get(row.representative_id); return !!c && noahCollectionBlocked({ name: String(c.name ?? ''), summary: String(c.summary ?? ''), url: String(c.repository ?? '') }); };
  const changed = listed.families.filter(row => !blocked(row) && sentRows.get(row.id)?.sha256 !== hashes.get(row.id))
    .sort((a, b) => (Number(b.one_tap) - Number(a.one_tap)) || (l1.get(b.representative_id) - l1.get(a.representative_id)) || (order.get(a.id) - order.get(b.id)));
  // 手元で載らなくなった系列（握手が通らなくなった・取り下げ）。本番で載せない側へ直すため、今の行を送る。
  const gone = [...sentRows.values()].filter(row => row.listed === 1 && !order.has(row.family_id)).map(row => row.family_id);
  const delisted = gone.length ? await noahIntakeExport(local.db, at, { ids: gone.slice(0, room), includePins, includePinFor }) : null;
  // 手元から消えた系列（名寄せで ID が変わった物）は、送る行が無い。印だけを「載っていない」にする（本番の行は、次の名寄せの結果が上書きする）。
  for (const id of gone.slice(0, room)) if (!delisted.families.some(row => row.id === id)) local.sql.prepare('UPDATE _noah_collector_sent SET listed=0,sent_at=? WHERE family_id=?').run(at, id);
  const plan = [
    ...(delisted ? noahIntakeImportParts(delisted).map(part => ({ part, listed: 0, hashes: familyHashes(part) })) : []),
    ...(changed.length ? noahIntakeImportParts(pick(listed, changed.slice(0, room).map(row => row.id))).map(part => ({ part, listed: 1, hashes })) : []),
  ];
  let sent = 0, rowsWritten = 0;
  for (const { part, listed: isListed, hashes: partHashes } of plan) {
    if (sent + part.families.length > room) break;
    const body = JSON.stringify(part), time = String(now());
    const response = await fetcher(new URL(NOAH_INTAKE_IMPORT_PATH, target), { method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(30_000), body,
      headers: { 'Content-Type': 'application/json', 'x-noah-collector-time': time, 'x-noah-collector-signature': await collectionSignature(key, time, body, NOAH_INTAKE_IMPORT_PATH) } });
    // 本番が、まだ収集機からの取り込みを受け付けない版（配備の前）なら、失敗ではなく「準備中」。次の巡回で、もう一度。
    if ([401, 403, 404, 405, 503].includes(response.status)) { await response.body?.cancel(); return { status: 'not_ready', code: response.status, sent, rowsWritten }; }
    if (!response.ok) { await response.body?.cancel(); return { status: `http_${response.status}`, sent, rowsWritten }; }
    const result = await response.json().catch(() => ({}));
    rowsWritten += Number(result.rowsWritten) || 0; sent += part.families.length;
    local.assertLease();
    local.sql.exec('BEGIN');
    try {
      const mark = local.sql.prepare('INSERT INTO _noah_collector_sent(family_id,sha256,listed,sent_at) VALUES(?,?,?,?) ON CONFLICT(family_id) DO UPDATE SET sha256=excluded.sha256,listed=excluded.listed,sent_at=excluded.sent_at');
      for (const family of part.families) mark.run(family.id, partHashes.get(family.id) ?? '', isListed, at);
      local.sql.prepare('INSERT INTO _noah_collector_import_days(day,families,rows_written) VALUES(?,?,?) ON CONFLICT(day) DO UPDATE SET families=families+excluded.families,rows_written=rows_written+excluded.rows_written')
        .run(day, part.families.length, Number(result.rowsWritten) || 0);
      local.sql.exec('COMMIT');
    } catch (error) { local.sql.exec('ROLLBACK'); throw error; }
  }
  return { status: changed.length + gone.length > sent ? 'more' : 'updated', sent, rowsWritten, waiting: Math.max(0, changed.length + gone.length - sent) };
}

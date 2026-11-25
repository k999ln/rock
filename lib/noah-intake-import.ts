/**
 * 手元で計算した取り込みの結果を、本番へ入れる（2026-11-21。本人の問い「ローカルで計算できないの？」への答え）。
 *
 * 重い所（台帳 約 7 万件の読み取りと、相手のサーバーへの握手）は、本番の外で、本番と同じコードで行う（scripts/noah-local-patrol.mjs）。
 * 本番へ送るのは、一覧に載せる系列と、その候補・握手の行だけ。本番の巡回（NOAH_PATROL_ENABLED）を開けなくても、一覧が使える。
 *
 * 入れる側の決まり:
 * - 審査者だけ（POST /api/noah/intake/import）。同じ Origin・account の印・JSON・本文 1 MB まで。
 * - 行の形は、表の制約（CHECK）に加えて、ここでも確かめる。載せるか（listed・one_tap）は、本番の決まり（noahListing）で計算し直す。
 * - 手元の「動いた」（L2）は、本番の「人が動かした」ではないので、1 に落として入れる。本番で人が動かした（L2）系列は、道具の一覧が同じ間、L2 のまま。
 * - 取り下げ・隠した印・つないでいる人の数は、本番の値を残す（上書きしない）。
 */
import { splitNoahIntakeImport, NOAH_INTAKE_IMPORT_LIMITS } from './noah-intake-import-parts.ts';
export { NOAH_INTAKE_IMPORT_LIMITS } from './noah-intake-import-parts.ts';
import type { IntakeDb } from './noah-intake-db.ts';
import { NoahAgentError } from './noah-agent-upload.ts';
import { boundedNoahBody } from './noah-agent-api.ts';
import { noahListing } from './noah-intake-listing.ts';
import { ownerScopeFor, OWNER_SCOPE_HEADER } from './owner-intent.ts';
import { verifyCollectionSignature } from './noah-collection.ts';
import { NOAH_PIN_COLUMNS, NOAH_PIN_SKIP_REASONS, parseStoredNoahPin } from './noah-pin-storage.ts';

export const NOAH_INTAKE_IMPORT_SCHEMA = 'noah-intake-import/1';
/** 1 回の要求で入れる系列の数と、本文の大きさ。 */

const CANDIDATE_COLUMNS = ['id', 'source', 'external_key', 'family_id', 'group_key', 'name', 'summary', 'summary_ja', 'repository', 'host', 'record_sha256', 'record_json', 'state', 'reason', 'running', 'likes', 'source_updated_at', 'first_seen_at', 'changed_at', 'seen_at', 'revision'] as const;
const CHECK_COLUMNS = ['candidate_id', 'mouth', 'surface', 'auth', 'connect_json', 'connect_sha256', 'setup', 'oauth_json', 'tools_sha256', 'tool_count', 'read_only', 'form_tools', 'one_tap_tools', 'level', 'result', 'latency_ms', 'sample_json', 'checked_at', 'l1_at', 'l2_at', 'next_check_at', 'failures', 'first_failure_at'] as const;
const FAMILY_COLUMNS = ['id', 'representative_id', 'members', 'level', 'l2_at', 'badge_hint', 'listed', 'one_tap', 'shuffle', 'updated_at'] as const;
type Row = Record<string, string | number | null>;
export type NoahIntakeImportPart = { schema: typeof NOAH_INTAKE_IMPORT_SCHEMA; exportedAt: number; families: Row[]; candidates: Row[]; checks: Row[] };

const columns = (list: readonly string[]) => list.join(',');
const marks = (n: number) => Array.from({ length: n }, () => '?').join(',');

/**
 * 書き出す系列の数を絞る時の、並びと数。first（棚のカードが使う系列など）を先に、残りは、1 回で頼める道具を持つ物・読むだけの物・応答の速い物の順。
 * 本番の D1 の書き込みは、新しく入れる系列 1 つで、表と索引を合わせて約 13 行（候補 6・握手 3・系列 4）。書き込みの枠が日ごとに決まっている時は、数を絞って、日を分けて入れる。
 */
export type NoahIntakeExportOptions = {
  limit?: number; first?: readonly string[];
  /** この系列だけを、載っているかに関わらず書き出す（収集機が、載らなくなった系列を本番で載せない側へ直す時。scripts/noah-collector-import.mjs）。 */
  ids?: readonly string[];
};

/**
 * 手元の DB から、本番へ送る分を書き出す。載せている系列（取り下げ・隠していない物）と、その系列の候補全部と、その握手の行。
 * 手元の L2 は 1 に落とす（本番の「動いた」は、本番で人が動かした物だけ）。
 */
export async function noahIntakeExport(db: Pick<IntakeDb, 'prepare'>, now: number, options: NoahIntakeExportOptions = {}): Promise<NoahIntakeImportPart> {
  const first = new Map((options.first ?? []).map((id, index) => [id, index]));
  const only = options.ids ? [...new Set(options.ids)] : null;
  if (only && !only.length) return { schema: NOAH_INTAKE_IMPORT_SCHEMA, exportedAt: now, families: [], candidates: [], checks: [] };
  // 指定の系列は、90 件ずつ読む（D1 の 1 文の値の数の上限の内）。
  const scope = (alias: string) => (only ? '1 = 1' : `${alias}.listed = 1 AND ${alias}.level >= 1 AND ${alias}.withdrawn_at IS NULL AND ${alias}.hidden_at IS NULL`);
  const chunks = only ? Array.from({ length: Math.ceil(only.length / 90) }, (_, i) => only.slice(i * 90, i * 90 + 90)) : [null];
  const readAll = async (sql: (filter: string) => string) => (await Promise.all(chunks.map(async (chunk) => (await db.prepare(sql(chunk ? `f.id IN (${marks(chunk.length)})` : '1 = 1')).bind(...(chunk ?? [])).all<Row>()).results))).flat();
  const ranked = (await readAll((filter) => `SELECT ${columns(FAMILY_COLUMNS.map((c) => `f.${c}`))}, k.read_only AS rank_read_only, k.latency_ms AS rank_latency FROM noah_intake_families f
    LEFT JOIN noah_intake_checks k ON k.candidate_id = f.representative_id
    WHERE ${scope('f')} AND ${filter} ORDER BY f.id`)).sort((a, b) => (String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0));
  const order = (row: Row) => [first.get(String(row.id)) ?? Number.MAX_SAFE_INTEGER, row.one_tap === 1 ? 0 : 1, row.rank_read_only === 1 ? 0 : 1, Number(row.rank_latency ?? Number.MAX_SAFE_INTEGER)];
  const sorted = options.limit === undefined && !first.size ? ranked : [...ranked].sort((a, b) => {
    const x = order(a), y = order(b);
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] - y[i];
    return String(a.id) < String(b.id) ? -1 : 1;
  });
  const chosen = options.limit === undefined ? sorted : sorted.slice(0, Math.max(0, options.limit));
  const families = chosen.map((row): Row => {
    const out: Row = {};
    for (const key of FAMILY_COLUMNS) out[key] = row[key];
    return { ...out, level: 1, l2_at: null, badge_hint: 'unverified' };
  });
  const ids = new Set(families.map((row) => String(row.id)));
  const candidates = (await readAll((filter) => `SELECT c.* FROM noah_intake_candidates c JOIN noah_intake_families f ON f.id = c.family_id
    WHERE ${scope('f')} AND ${filter} ORDER BY c.family_id, c.id`))
    .filter((row) => ids.has(String(row.family_id)))
    .map((row) => Object.fromEntries([
      ...CANDIDATE_COLUMNS.map((key) => [key, row[key]]),
      ...NOAH_PIN_COLUMNS.filter((key) => row[key] != null).map((key) => [key, row[key]]),
    ]) as Row);
  const candidateIds = new Set(candidates.map((row) => String(row.id)));
  const checks = (await readAll((filter) => `SELECT ${columns(CHECK_COLUMNS.map((c) => `k.${c}`))} FROM noah_intake_checks k JOIN noah_intake_candidates c ON c.id = k.candidate_id JOIN noah_intake_families f ON f.id = c.family_id
    WHERE ${scope('f')} AND ${filter} ORDER BY k.candidate_id`))
    .filter((row) => candidateIds.has(String(row.candidate_id)))
    .map((row) => (Number(row.level) === 2 ? { ...row, level: 1, l2_at: null } : row));
  return { schema: NOAH_INTAKE_IMPORT_SCHEMA, exportedAt: now, families, candidates, checks };
}

/** 書き出した物を、要求 1 回ずつの大きさに分ける（系列ごとに、その候補と握手の行を一緒に）。 */
export function noahIntakeImportParts(all: NoahIntakeImportPart): NoahIntakeImportPart[] {
  return splitNoahIntakeImport(all);
}

const fail = (message: string): never => { throw new NoahAgentError(`取り込みの結果: ${message}`); };
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
/** 行を、決まった列だけの形にする（余計な列・形の違う値は拒む）。 */
function shape(value: unknown, list: readonly string[], label: string): Row {
  if (!object(value)) return fail(`${label}の行の形が違います。`);
  const keys = Object.keys(value);
  if (keys.some((key) => !list.includes(key))) fail(`${label}に、知らない列があります。`);
  const out: Row = {};
  for (const key of list) {
    const cell = value[key] ?? null;
    if (cell !== null && typeof cell !== 'string' && !(typeof cell === 'number' && Number.isSafeInteger(cell))) fail(`${label}の ${key} の値が違います。`);
    if (typeof cell === 'string' && cell.length > 70_000) fail(`${label}の ${key} が長すぎます。`);
    out[key] = cell as string | number | null;
  }
  return out;
}

/** 1 回分を確かめて、本番の形にする。系列・候補・握手の行が、互いに合っている事も確かめる。 */
export function parseNoahIntakeImportPart(value: unknown): NoahIntakeImportPart {
  if (!object(value) || value.schema !== NOAH_INTAKE_IMPORT_SCHEMA) return fail('形（schema）が違います。');
  const { families, candidates, checks, exportedAt } = value;
  if (!Array.isArray(families) || !Array.isArray(candidates) || !Array.isArray(checks)) return fail('系列・候補・握手の行の並びが要ります。');
  if (!families.length || families.length > NOAH_INTAKE_IMPORT_LIMITS.families || candidates.length > NOAH_INTAKE_IMPORT_LIMITS.candidates || checks.length > candidates.length) fail('1 回に入れられる数を越えています。');
  if (typeof exportedAt !== 'number' || !Number.isSafeInteger(exportedAt) || exportedAt < 1) fail('書き出した時刻が違います。');
  const part: NoahIntakeImportPart = {
    schema: NOAH_INTAKE_IMPORT_SCHEMA, exportedAt: exportedAt as number,
    families: families.map((row) => shape(row, FAMILY_COLUMNS, '系列')),
    candidates: candidates.map((row) => shape(row, [...CANDIDATE_COLUMNS, ...NOAH_PIN_COLUMNS], '候補')),
    checks: checks.map((row) => shape(row, CHECK_COLUMNS, '握手')),
  };
  const candidateIds = new Set(part.candidates.map((row) => row.id));
  for (const row of part.candidates) {
    if (row.source !== 'mcp-registry') fail('入れられるのは、公式台帳の候補だけです。');
    try { JSON.parse(String(row.record_json)); } catch { fail('候補の記録が JSON ではありません。'); }
    if (NOAH_PIN_COLUMNS.every((key) => row[key] === null)) continue;
    const { pin_json: json, pin_source_sha256: source, pin_model: model, pin_at: at, pin_skip: skip } = row;
    const validPin = json !== null && skip === null && parseStoredNoahPin(json);
    const validSkip = json === null && NOAH_PIN_SKIP_REASONS.some((reason) => reason === skip);
    if ((!validPin && !validSkip) || typeof source !== 'string' || !/^[0-9a-f]{64}$/u.test(source)
      || typeof model !== 'string' || !/^[a-z0-9][a-z0-9._:/-]{0,127}$/iu.test(model)
      || typeof at !== 'number' || at < 1 || at > part.exportedAt) fail('ピンの記録の形が違います。');
    if (validPin) row.pin_json = JSON.stringify(validPin);
  }
  for (const row of part.checks) {
    if (!candidateIds.has(row.candidate_id)) fail('握手の行の候補が、この回にありません。');
    try { JSON.parse(String(row.connect_json)); } catch { fail('接続要件が JSON ではありません。'); }
  }
  for (const row of part.families) {
    if (!candidateIds.has(row.representative_id)) fail('系列の代表の候補が、この回にありません。');
    if (!part.candidates.some((c) => c.id === row.representative_id && c.family_id === row.id)) fail('系列の代表が、その系列の候補ではありません。');
  }
  return part;
}

/** 本番の決まり（noahListing）で、その系列を載せるかを、計算し直す。 */
function listingOf(family: Row, candidates: Row[], checks: Map<unknown, Row>) {
  const representative = candidates.find((row) => row.id === family.representative_id);
  const check = representative ? checks.get(representative.id) : undefined;
  if (!representative || !check) return { listed: 0, oneTap: 0 };
  const listing = noahListing({
    source: 'mcp-registry', familyId: String(family.id), candidateState: representative.state as 'active' | 'unsupported' | 'withdrawn', withdrawn: false, hidden: false,
    check: { mouth: check.mouth as 'mcp-remote', setup: check.setup === 1, auth: check.auth as 'none', result: String(check.result), level: Math.min(1, Number(check.level)) as 0 | 1, formTools: check.form_tools as number | null, oneTapTools: check.one_tap_tools as number | null },
  });
  return { listed: listing.listed ? 1 : 0, oneTap: listing.listed && listing.oneTap ? 1 : 0 };
}

/**
 * 1 回分を入れる。候補は、新しく見た物（seen_at が新しい）で、記録の中身が変わった物だけを書き換える。握手の行は、新しく握手した物で、
 * 接続の仕方・道具の一覧・結果・段のどれかが変わった物だけ（応答の速さや確かめた時刻だけが変わった物は書かない）。系列も、変わった物だけ。
 * 同じファイルを入れ直しても、本番の D1 の書き込みは増えない。返す rowsWritten は、この回に書いた行の数（D1 は索引を含む）。
 * 本番で人が動かした（L2）物は、道具の一覧が同じ間、L2 のまま。系列の取り下げ・隠した印・つないでいる人の数は、本番の値を残す。
 */
export async function noahIntakeImport(db: IntakeDb, value: unknown, now: number) {
  const part = parseNoahIntakeImportPart(value);
  const checks = new Map(part.checks.map((row) => [row.candidate_id, row]));
  const prepare = (sql: string, ...args: (string | number | null)[]) => db.prepare(sql).bind(...args);
  const statements: D1PreparedStatement[] = [prepare("INSERT OR IGNORE INTO noah_intake_sources(id) VALUES('mcp-registry')")];
  for (const row of part.candidates) {
    const values = CANDIDATE_COLUMNS.map((c) => row[c]);
    statements.push(prepare(`INSERT INTO noah_intake_candidates(${columns(CANDIDATE_COLUMNS)}) VALUES(${marks(CANDIDATE_COLUMNS.length)})
      ON CONFLICT(id) DO UPDATE SET family_id=excluded.family_id, group_key=excluded.group_key, name=excluded.name, summary=excluded.summary, summary_ja=excluded.summary_ja,
        repository=excluded.repository, host=excluded.host, record_sha256=excluded.record_sha256, record_json=excluded.record_json, state=excluded.state, reason=excluded.reason,
        running=excluded.running, likes=excluded.likes, source_updated_at=excluded.source_updated_at, changed_at=excluded.changed_at, seen_at=excluded.seen_at,
        revision=noah_intake_candidates.revision+1
      WHERE excluded.seen_at > noah_intake_candidates.seen_at AND (excluded.record_sha256 IS NOT noah_intake_candidates.record_sha256 OR excluded.family_id IS NOT noah_intake_candidates.family_id
        OR excluded.group_key IS NOT noah_intake_candidates.group_key OR excluded.summary_ja IS NOT noah_intake_candidates.summary_ja OR excluded.state IS NOT noah_intake_candidates.state
        OR excluded.reason IS NOT noah_intake_candidates.reason OR excluded.running IS NOT noah_intake_candidates.running)`, ...values));
  }
  for (const row of part.checks) {
    // 手元の L2 は入れない。
    const local: Row = { ...row, level: Math.min(1, Number(row.level)), l2_at: null, next_check_at: Number(row.next_check_at ?? now) };
    const values = CHECK_COLUMNS.map((c) => local[c]);
    statements.push(prepare(`INSERT INTO noah_intake_checks(${columns(CHECK_COLUMNS)}, lease_until) VALUES(${marks(CHECK_COLUMNS.length)}, 0)
      ON CONFLICT(candidate_id) DO UPDATE SET mouth=excluded.mouth, surface=excluded.surface, auth=excluded.auth, connect_json=excluded.connect_json, connect_sha256=excluded.connect_sha256,
        setup=excluded.setup, oauth_json=excluded.oauth_json, tools_sha256=excluded.tools_sha256, tool_count=excluded.tool_count, read_only=excluded.read_only,
        form_tools=excluded.form_tools, one_tap_tools=excluded.one_tap_tools,
        level=CASE WHEN noah_intake_checks.level = 2 AND noah_intake_checks.tools_sha256 IS excluded.tools_sha256 AND excluded.level >= 1 THEN 2 ELSE excluded.level END,
        l2_at=CASE WHEN noah_intake_checks.level = 2 AND noah_intake_checks.tools_sha256 IS excluded.tools_sha256 AND excluded.level >= 1 THEN noah_intake_checks.l2_at ELSE NULL END,
        result=excluded.result, latency_ms=excluded.latency_ms, sample_json=excluded.sample_json, checked_at=excluded.checked_at, l1_at=COALESCE(noah_intake_checks.l1_at, excluded.l1_at),
        next_check_at=excluded.next_check_at, failures=excluded.failures, first_failure_at=excluded.first_failure_at, lease_until=0
      WHERE COALESCE(excluded.checked_at, 0) > COALESCE(noah_intake_checks.checked_at, 0) AND (excluded.mouth IS NOT noah_intake_checks.mouth OR excluded.surface IS NOT noah_intake_checks.surface
        OR excluded.auth IS NOT noah_intake_checks.auth OR excluded.connect_sha256 IS NOT noah_intake_checks.connect_sha256 OR excluded.setup IS NOT noah_intake_checks.setup
        OR excluded.oauth_json IS NOT noah_intake_checks.oauth_json OR excluded.tools_sha256 IS NOT noah_intake_checks.tools_sha256 OR excluded.tool_count IS NOT noah_intake_checks.tool_count
        OR excluded.read_only IS NOT noah_intake_checks.read_only OR excluded.form_tools IS NOT noah_intake_checks.form_tools OR excluded.one_tap_tools IS NOT noah_intake_checks.one_tap_tools
        OR excluded.result IS NOT noah_intake_checks.result OR excluded.level IS NOT MIN(noah_intake_checks.level, 1))`, ...values));
  }
  // 取り込んだ元の文と道具の一覧がそろった後で、ピンを保存します。
  for (const row of part.candidates) {
    if (row.pin_at === null) continue;
    statements.push(prepare(`UPDATE noah_intake_candidates SET ${NOAH_PIN_COLUMNS.map((key) => `${key}=?`).join(',')}
      WHERE id=? AND name IS ? AND summary IS ? AND summary_ja IS ?
        AND (SELECT tools_sha256 FROM noah_intake_checks WHERE candidate_id=noah_intake_candidates.id) IS ?
        AND COALESCE(pin_at, 0) < ?`,
    ...NOAH_PIN_COLUMNS.map((key) => row[key]), row.id, row.name, row.summary, row.summary_ja, checks.get(row.id)?.tools_sha256 ?? null, row.pin_at));
  }
  // 本番で人が動かした（L2）握手の行を、系列の代表が持っているか（握手の行を書いた後に読む）。
  const ranL2 = 'EXISTS (SELECT 1 FROM noah_intake_checks k WHERE k.candidate_id = excluded.representative_id AND k.level = 2)';
  for (const family of part.families) {
    const { listed, oneTap } = listingOf(family, part.candidates.filter((row) => row.family_id === family.id), checks);
    // 変わった所が無い系列は、書かない（同じファイルを入れ直しても、本番の書き込みが増えない）。
    statements.push(prepare(`INSERT INTO noah_intake_families(id, representative_id, members, level, l2_at, badge_hint, listed, one_tap, shuffle, updated_at, revision)
      VALUES(?, ?, ?, 1, NULL, 'unverified', ?, ?, ?, ?, 1)
      ON CONFLICT(id) DO UPDATE SET representative_id=excluded.representative_id, members=excluded.members,
        level=CASE WHEN ${ranL2} THEN 2 ELSE 1 END,
        l2_at=CASE WHEN ${ranL2} THEN (SELECT k.l2_at FROM noah_intake_checks k WHERE k.candidate_id = excluded.representative_id) ELSE NULL END,
        badge_hint=CASE WHEN ${ranL2} THEN 'one_click' ELSE 'unverified' END,
        listed=excluded.listed, one_tap=excluded.one_tap, updated_at=excluded.updated_at, revision=noah_intake_families.revision+1
      WHERE excluded.representative_id IS NOT noah_intake_families.representative_id OR excluded.members IS NOT noah_intake_families.members
        OR excluded.listed IS NOT noah_intake_families.listed OR excluded.one_tap IS NOT noah_intake_families.one_tap
        OR noah_intake_families.level IS NOT (CASE WHEN ${ranL2} THEN 2 ELSE 1 END)`,
    family.id, family.representative_id, Math.max(1, Number(family.members)), listed, oneTap, Math.abs(Number(family.shuffle ?? 0)) % 1_000_000_000, now));
  }
  // 系列は、候補と握手の行の後に書く（代表の候補を指すため）。1 回の書き込みは 40 文まで。
  // 書いた行の数（D1 は表と索引を合わせた rows_written。無ければ、変えた行の数）を数えて返す。運営が、書き込みの枠を見ながら入れられるように。
  let rowsWritten = 0;
  const count = (results: unknown[]) => { for (const result of results) { const meta = (result as { meta?: { rows_written?: number; changes?: number } } | null)?.meta; rowsWritten += Number(meta?.rows_written ?? meta?.changes ?? 0) || 0; } };
  for (let index = 0; index < statements.length; index += 40) count(await db.batch(statements.slice(index, index + 40)));
  // 本番で人が動かした系列は、握手の行が L2 のまま残る（道具の一覧が同じ間）。系列の段を、その握手の行に合わせる。
  const ids = part.families.map((row) => String(row.id));
  count(await db.batch([prepare(`UPDATE noah_intake_families SET level = 2, l2_at = (SELECT k.l2_at FROM noah_intake_checks k WHERE k.candidate_id = noah_intake_families.representative_id), badge_hint = 'one_click'
    WHERE id IN (${marks(ids.length)}) AND level < 2 AND EXISTS (SELECT 1 FROM noah_intake_checks k WHERE k.candidate_id = noah_intake_families.representative_id AND k.level = 2)`, ...ids)]));
  return { families: part.families.length, candidates: part.candidates.length, checks: part.checks.length, listed: part.families.filter((family) => listingOf(family, part.candidates.filter((row) => row.family_id === family.id), checks).listed).length, rowsWritten };
}

const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store, private', 'X-Content-Type-Options': 'nosniff' } });

export const NOAH_INTAKE_IMPORT_PATH = '/api/noah/intake/import';
/**
 * POST /api/noah/intake/import。審査者（同じ Origin・account の印）か、収集機（task 121）。
 * 収集機は Origin を付けず、NOAH_COLLECTION_KEY の HMAC（時刻・POST・この path・本文の hash）で名乗る。紹介の掲載と同じ鍵だが、path が違うので、掲載の署名は使い回せない。
 * どちらも、入れる決まり（noahIntakeImport）は同じ。載せるかは、本番の決まりで計算し直す。
 */
export function createIntakeImportApi(deps: { db: IntakeDb; now?: () => number; authenticate: (request: Request) => Promise<string>; reviewers: string[]; collectorKey?: string }) {
  return async (request: Request) => {
    try {
      if (request.method !== 'POST') return json({ error: '対応しない操作です。' }, 405);
      if (!request.headers.has('origin') && request.headers.has('x-noah-collector-signature')) {
        const now = (deps.now ?? Date.now)();
        if (!deps.collectorKey || deps.collectorKey.length < 32) return json({ error: '収集機からの取り込みは、設定されていません。' }, 503);
        if (!request.headers.get('content-type')?.startsWith('application/json')) return json({ error: 'JSONで操作してください。' }, 415);
        const body = new TextDecoder('utf-8', { fatal: true }).decode(await boundedNoahBody(request, NOAH_INTAKE_IMPORT_LIMITS.bytes));
        if (!await verifyCollectionSignature(deps.collectorKey, request.headers.get('x-noah-collector-time'), request.headers.get('x-noah-collector-signature'), body, now, NOAH_INTAKE_IMPORT_PATH)) return json({ error: '収集機の署名が違います。' }, 401);
        return json(await noahIntakeImport(deps.db, JSON.parse(body), now));
      }
      const owner = await deps.authenticate(request), url = new URL(request.url), ownerScope = await ownerScopeFor(owner);
      if (!deps.reviewers.includes(owner) || request.headers.get('origin') !== url.origin) return json({ error: '同じNoahから操作してください。' }, 403);
      if (request.headers.get(OWNER_SCOPE_HEADER) !== ownerScope) return json({ error: 'アカウントが変わりました。再読込してください。' }, 409);
      if (!request.headers.get('content-type')?.startsWith('application/json')) return json({ error: 'JSONで操作してください。' }, 415);
      const input: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await boundedNoahBody(request, NOAH_INTAKE_IMPORT_LIMITS.bytes)));
      return json({ ...await noahIntakeImport(deps.db, input, (deps.now ?? Date.now)()), ownerScope });
    } catch (error) {
      if (error instanceof NoahAgentError) return json({ error: error.message }, error.status);
      if (error instanceof SyntaxError) return json({ error: '入力形式を確認してください。' }, 400);
      if (error instanceof Error && error.message === 'UNAUTHORIZED') return json({ error: 'サインインしてください。' }, 401);
      if (error instanceof Error && /CHECK constraint|FOREIGN KEY|NOT NULL/u.test(error.message)) return json({ error: '取り込みの結果: 行が表の決まりに合いません。' }, 400);
      return json({ error: '取り込みの結果を入れられません。少し待ってから再試行してください。' }, 503);
    }
  };
}

import { noahAgentStore } from './noah-agent-store.ts';
import { createIntakeSync, type IntakeDependencies, type IntakeSource } from './noah-intake-sync.ts';
import { createIntakeProbe } from './noah-intake-probe.ts';
import { intakeStatement } from './noah-intake-db.ts';
import { noahListing, NOAH_LISTING_SQL, type NoahListingInput } from './noah-intake-listing.ts';
import { parseNoahConnect, noahPublicHttpsUrl } from './noah-connect-requirements.ts';
import { planNoahConnection } from './noah-connect-plan.ts';
import { noahLaunchPlanState, noahPlaceLabel } from './noah-connect-source.ts';
import { NoahAgentError, noahUploadId } from './noah-agent-upload.ts';
import { RECIPES } from './noah-execution-contract.mjs';

type Row = {
  id: string; representative_id: string; members: number; level: 0 | 1 | 2; l2_at: number | null; shuffle: number;
  revision: number; withdrawn_at: number | null; hidden_at: number | null; listed: number;
  name: string; external_key: string; summary: string; host: string | null; record_json: string;
  repository: string | null; source_updated_at: number | null; source: NoahListingInput['source']; state: NoahListingInput['candidateState'];
  mouth: NonNullable<NoahListingInput['check']>['mouth'] | null; setup: number | null;
  auth: NonNullable<NoahListingInput['check']>['auth']; result: string; check_level: 0 | 1 | 2;
  form_tools: number | null; one_tap_tools: number | null; tool_count: number | null; checked_at: number | null;
  connect_json: string | null; connect_sha256: string | null;
};
const ROW = `SELECT f.*,c.name,c.external_key,c.summary,c.host,c.record_json,c.repository,c.source_updated_at,c.source,c.state,
 k.mouth,k.setup,k.auth,k.result,k.level AS check_level,k.form_tools,k.one_tap_tools,k.tool_count,k.checked_at,k.connect_json,k.connect_sha256
 FROM noah_intake_families f JOIN noah_intake_candidates c ON c.id=f.representative_id LEFT JOIN noah_intake_checks k ON k.candidate_id=c.id`;
function listing(row: Row, restore = false) {
  return noahListing({ source: row.source, familyId: row.id, candidateState: row.state, withdrawn: !restore && row.withdrawn_at !== null, hidden: row.hidden_at !== null,
    check: row.mouth ? { mouth: row.mouth, setup: !!row.setup, auth: row.auth, result: row.result, level: row.check_level, formTools: row.form_tools, oneTapTools: row.one_tap_tools } : null });
}
/**
 * 利用人数: その系列へ、スマホから接続して頼み、成果が出た人の数（1 人 1 回。切った接続の分も数える）。
 * 本人の決め（2026-11-21。docs/structure/07）。Codex の「利用人数」（Mac で動かした人）とは、別の Agent の集まり。
 * 依頼の表を、接続の持ち主ごとの索引（noah_asks_owner）で引くので、読む行は、その系列を使った人の依頼の数まで。
 */
const USERS = (families: number) => `SELECT c.family_key AS family,COUNT(DISTINCT c.owner_id) AS users FROM noah_connections c
 WHERE c.family_key IN (${Array.from({ length: families }, () => '?').join(',')})
 AND EXISTS (SELECT 1 FROM noah_asks a WHERE a.owner_id=c.owner_id AND a.connection_id=c.id AND a.state='succeeded') GROUP BY c.family_key`;
function item(row: Row, signedIn: boolean, users = 0) {
  const req = row.connect_json ? parseNoahConnect(JSON.parse(row.connect_json)) : null;
  // 計画の API（lib/noah-connect-plan-api.ts）と同じ関数で計算する（一覧の印と、詳細の印が、ずれない）。
  const plan = req ? planNoahConnection(req, noahLaunchPlanState({ signedIn, connectSha256: row.connect_sha256!, level: row.check_level, consentedSha256: null })) : null;
  return { id: row.id, name: row.name, provider: row.external_key.split('/')[0], summary: row.summary, host: row.host,
    section: row.level === 2 ? 'ran' : 'new', tools: row.tool_count ?? 0, oneTap: (row.one_tap_tools ?? 0) > 0, checkedAt: row.checked_at, users,
    connect: { badge: plan?.badge ?? 'blocked', taps: plan?.cost.taps ?? 0, typed: plan?.cost.typed ?? 0, place: plan?.place ?? null,
      placeLabel: noahPlaceLabel(plan?.place ?? null, row.host),
      need: plan?.need ?? (req ? null : '接続先を確認できません。'), level: row.check_level ?? 0, price: { model: 'free' }, note: null } };
}
/**
 * 系列の ID の並びから、一覧のカード（NoahReadyItem の形）を作る。並びはそのまま、載せていない物は落とす。
 * 一覧（list）と、ピンタレスト風の一覧（lib/noah-boards-store.ts）が同じ関数を使う（カードの中身と、印がずれない）。D1 の 1 文の引数の上限（100）を越えないよう、90 件ずつ読む。
 */
export async function noahReadyItems(db: IntakeDependencies['db'], ids: readonly string[], signedIn: boolean) {
  const keys = [...new Set(ids)], byId = new Map<string, Row>(), users = new Map<string, number>();
  for (let index = 0; index < keys.length; index += 90) {
    const part = keys.slice(index, index + 90), marks = part.map(() => '?').join(',');
    const [rows, used] = (await db.batch([db.prepare(`${ROW} WHERE f.id IN (${marks})`).bind(...part), db.prepare(USERS(part.length)).bind(...part)])).map((result) => result.results) as [Row[], { family: string; users: number }[]];
    for (const row of rows) byId.set(row.id, row);
    for (const row of used) users.set(row.family, row.users);
  }
  return ids.flatMap((id) => { const row = byId.get(id); return row && listing(row).listed ? [item(row, signedIn, users.get(id) ?? 0)] : []; });
}
export type NoahReadyListItem = ReturnType<typeof item>;
export type IntakeStatus = {
  sources: Pick<IntakeSource, 'id' | 'next_run_at' | 'last_success_at' | 'error_code' | 'failure_count' | 'observed' | 'withdrawn' | 'request_count' | 'sweep_started_at'>[];
  mouths: { remote: number; terminal: number; remoteReady: number; terminalReady: number }; families: { id: string; name: string; members: number; mouth: string | null; level: number; revision: number; withdrawn: boolean }[]; nextOffset: number | null; reasons: Record<string, number>; unsupported: Record<string, number>; listed: number;
  /**
   * つながると確かめた数（spec-88 の 9.6）。台帳の件数とは別に出す。
   * ran: 人が動かして、成果が出た系列。handshake: 握手まで確かめた系列（まだ誰も動かしていない）。どちらも、一覧に載せている物だけ。
   * fixed: 本人の Mac で動かす、固定の型紙の数（取り込んだ台帳とは別の物）。
   */
  confirmed: { ran: number; handshake: number; fixed: number };
};
export function createIntakeStore(deps: IntakeDependencies) {
  const { db } = deps, now = deps.now ?? Date.now, sync = createIntakeSync(deps), probe = createIntakeProbe(deps);
  async function counts() {
    const rows = (await db.prepare("SELECT level,COUNT(*) AS n FROM noah_intake_families WHERE listed=1 AND level>=1 AND withdrawn_at IS NULL AND hidden_at IS NULL GROUP BY level").all<{ level: number; n: number }>()).results;
    return { ran: rows.find(r => r.level === 2)?.n ?? 0, new: rows.find(r => r.level === 1)?.n ?? 0 };
  }
  async function list(owner: string | null, params: URLSearchParams) {
    const cursor = params.get('cursor') ?? '', q = (params.get('q') ?? '').trim(), oneTap = params.get('oneTap') === '1';
    if (q && (Array.from(q).length < 2 || Array.from(q).length > 80)) throw new NoahAgentError('検索は2〜80文字で入力してください。');
    if (params.has('limit') && params.get('limit') !== '0') throw new NoahAgentError('一覧は20件ずつ表示します。');
    let ids: { id: string; l2_at?: number; shuffle?: number; kind: 'r' | 'n' | 's' }[] = [], nextCursor: string | null = null;
    if (q) {
      if (cursor && !/^s:(?:0|[1-9]\d{0,2})$/.test(cursor)) throw new NoahAgentError('ページの指定を確認してください。');
      const offset = cursor ? Number(cursor.slice(2)) : 0;
      if (offset >= 200) throw new NoahAgentError('検索は200件までです。');
      const limit = Math.min(21, 200 - offset);
      const rows = (await intakeStatement(db, NOAH_LISTING_SQL.search, { like: `%${q.replace(/[\\%_]/g, '\\$&')}%`, limit, offset }).all<{ id: string }>()).results;
      ids = rows.slice(0, 20).map(r => ({ ...r, kind: 's' }));
      if (rows.length > 20) nextCursor = `s:${offset + 20}`;
    } else {
      const match = cursor ? /^([rn]):(0|[1-9]\d{0,15}):(.{3,400})$/.exec(cursor) : null;
      if (cursor && (!match || !Number.isSafeInteger(Number(match[2])) || Array.from(match[3]).some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127))) throw new NoahAgentError('ページの指定を確認してください。');
      if (match?.[1] !== 'n') {
        ids = (await intakeStatement(db, NOAH_LISTING_SQL.ran, { before_at: match ? Number(match[2]) : Number.MAX_SAFE_INTEGER, after_id: match?.[3] ?? '', limit: 21 }).all<{ id: string; l2_at: number }>()).results.map(r => ({ ...r, kind: 'r' }));
      }
      if (ids.length < 21) ids.push(...(await intakeStatement(db, NOAH_LISTING_SQL.new, { before: match?.[1] === 'n' ? Number(match[2]) : 1_000_000_000, after_id: match?.[1] === 'n' ? match[3] : '', one_tap: Number(oneTap), limit: 21 - ids.length }).all<{ id: string; shuffle: number }>()).results.map(r => ({ ...r, kind: 'n' as const })));
      if (ids.length > 20) { const last = ids[19]; nextCursor = `${last.kind}:${last.kind === 'r' ? last.l2_at : last.shuffle}:${last.id}`; }
      ids = ids.slice(0, 20);
    }
    if (params.get('limit') === '0') ids = [];
    // 行と利用人数を、1 回の batch で読む（D1 への往復を増やさない）。
    return { items: ids.length ? await noahReadyItems(db, ids.map(r => r.id), !!owner) : [], nextCursor: params.get('limit') === '0' ? null : nextCursor, counts: await counts(), source: 'Official MCP Registry' };
  }
  async function detail(id: string, owner: string | null, reviewer: boolean) {
    const row = await db.prepare(`${ROW} WHERE f.id=?`).bind(id).first<Row>();
    const listed = !!row && listing(row).listed;
    // その本人の、この系列の切っていない接続（1 件まで）。L5 で接続の表が入った（drizzle/0047_noah_connections.sql）。
    const connection = row && owner ? await db.prepare('SELECT id,state,revision,error FROM noah_connections WHERE owner_id=? AND family_key=? AND disconnected_at IS NULL').bind(owner, id).first<{ id: string; state: string; revision: number; error: string | null }>() : null;
    // 載せていない系列は、無い物として答える。ただし、その本人がつないでいる物は読める（一覧から外れた理由を見て、切れるように）。
    if (!row || (!reviewer && !listed && !connection)) throw new NoahAgentError('Agentが見つかりません。', 404);
    let website: string | null = null;
    try { const record = JSON.parse(row.record_json) as { websiteUrl?: string }; if (record.websiteUrl) website = noahPublicHttpsUrl(record.websiteUrl, 'website').href; } catch { /* Untrusted informational link. */ }
    const used = await db.prepare(USERS(1)).bind(id).first<{ users: number }>();
    return { ...item(row, !!owner, used?.users ?? 0), listed, members: row.members, revision: row.revision, website, repository: row.repository, sourceUpdatedAt: row.source_updated_at, connection: connection ? { ...connection } : null };
  }
  async function status(params = new URLSearchParams()): Promise<IntakeStatus> {
    const mouth = params.get('mouth') ?? '', level = params.get('level') ?? '', q = (params.get('q') ?? '').trim(), offsetText = params.get('offset') ?? '0';
    if (!['', 'mcp-remote', 'mcp-package'].includes(mouth) || !['', '0', '1', '2'].includes(level) || q.length > 80 || !/^(?:0|[1-9]\d{0,5})$/.test(offsetText)) throw new NoahAgentError('絞り込みを確認してください。');
    const offset = Number(offsetText);
    const families = (await db.prepare(`${ROW} WHERE (?='' OR k.mouth=?) AND (?='' OR f.level=?) AND (?='' OR c.name LIKE ? ESCAPE '\\' OR c.summary LIKE ? ESCAPE '\\') ORDER BY f.id LIMIT 21 OFFSET ?`).bind(mouth, mouth, level, Number(level), q, `%${q.replace(/[\\%_]/g, '\\$&')}%`, `%${q.replace(/[\\%_]/g, '\\$&')}%`, offset).all<Row>()).results;

    const sources = (await db.prepare('SELECT id,next_run_at,last_success_at,error_code,failure_count,observed,withdrawn,request_count,sweep_started_at FROM noah_intake_sources ORDER BY id').all<IntakeStatus['sources'][number]>()).results;
    type Group = { source: Row['source']; state: Row['state']; bulk: number; mouth: Row['mouth']; setup: number; auth: Row['auth']; result: string; level: 0 | 1 | 2; has_form: number; has_one_tap: number; n: number };
    const groups = (await intakeStatement(db, NOAH_LISTING_SQL.counts).all<Group>()).results;
    const mouths = { remote: 0, terminal: 0, remoteReady: 0, terminalReady: 0 }, reasons: Record<string, number> = {};
    for (const group of groups) {
      if (group.state === 'active' && group.mouth === 'mcp-remote') { mouths.remote += group.n; if (!group.setup) mouths.remoteReady += group.n; }
      if (group.state === 'active' && group.mouth === 'mcp-package') { mouths.terminal += group.n; if (!group.setup) mouths.terminalReady += group.n; }
      const result = noahListing({ source: group.source, familyId: group.bulk ? 'bulk:group' : 'single', candidateState: group.state, withdrawn: false, hidden: false,
        check: group.mouth ? { mouth: group.mouth, setup: !!group.setup, auth: group.auth, result: group.result, level: group.level, formTools: group.has_form, oneTapTools: group.has_one_tap } : null });
      if (!result.listed) reasons[result.reason] = (reasons[result.reason] ?? 0) + group.n;
    }
    const unsupported = Object.fromEntries((await db.prepare("SELECT reason,COUNT(*) AS n FROM noah_intake_candidates WHERE state='unsupported' GROUP BY reason").all<{ reason: string; n: number }>()).results.map(r => [r.reason, r.n]));
    const visible = await counts();
    return { sources, mouths, reasons, unsupported, listed: visible.ran + visible.new, confirmed: { ran: visible.ran, handshake: visible.new, fixed: Object.keys(RECIPES).length }, families: families.slice(0, 20).map(r => ({ id: r.id, name: r.name, members: r.members, mouth: r.mouth, level: r.level, revision: r.revision, withdrawn: r.withdrawn_at !== null })), nextOffset: families.length > 20 ? offset + 20 : null };
  }
  async function moderate(action: 'withdraw' | 'restore', id: string, revision: number) {
    const row = await db.prepare(`${ROW} WHERE f.id=?`).bind(id).first<Row>();
    if (!row) throw new NoahAgentError('Agentが見つかりません。', 404);
    const eligible = listing(row, true);
    const result = await db.prepare('UPDATE noah_intake_families SET withdrawn_at=?,listed=?,one_tap=?,updated_at=?,revision=revision+1 WHERE id=? AND revision=?').bind(action === 'withdraw' ? now() : null, action === 'restore' && eligible.listed ? 1 : 0, eligible.listed && eligible.oneTap ? 1 : 0, now(), id, revision).run();
    if (result.meta.changes !== 1) throw new NoahAgentError('内容が更新されました。再読込してください。', 409);
    return { id, revision: revision + 1 };
  }
  async function engineeringTrial(owner: string, uploadId: string) {
    const upload = await noahAgentStore(db, owner).get(noahUploadId(uploadId));
    if (!upload || upload.uploadState !== 'ready') throw new NoahAgentError('Agentが見つかりません。', 404);
    const { adapter, endpointUrl } = upload.manifest;
    if (adapter !== 'mcp_http' || !endpointUrl) return null;
    // Bind trials to an existing listed MCP contract, including its full path. A private URL is never an execution grant.
    const match = await db.prepare(`SELECT f.id FROM noah_intake_families f
      JOIN noah_intake_candidates c ON c.id=f.representative_id
      JOIN noah_intake_checks k ON k.candidate_id=c.id
      LEFT JOIN noah_connections n ON n.owner_id=? AND n.family_key=f.id AND n.disconnected_at IS NULL
      WHERE f.listed=1 AND f.withdrawn_at IS NULL AND f.hidden_at IS NULL AND c.state='active'
        AND k.mouth='mcp-remote' AND k.level>=1 AND json_extract(k.connect_json,'$.target.url')=?
        AND (n.id IS NULL OR json_extract(n.connect_json,'$.target.url')=?)
      ORDER BY (n.state='connected') DESC, f.level DESC, f.id LIMIT 1`)
      .bind(owner, endpointUrl, endpointUrl).first<{ id: string }>();
    if (!match) return null;
    const candidate = await detail(match.id, owner, false);
    return candidate.listed ? { id: candidate.id, name: candidate.name, connection: candidate.connection } : null;
  }
  return { ...sync, ...probe, list, detail, status, moderate, engineeringTrial };
}

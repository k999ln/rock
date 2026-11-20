import { createIntakeSync, type IntakeDependencies, type IntakeSource } from './noah-intake-sync.ts';
import { intakeStatement } from './noah-intake-db.ts';
import { noahListing, NOAH_LISTING_SQL, type NoahListingInput } from './noah-intake-listing.ts';
import { parseNoahConnect, noahPublicHttpsUrl } from './noah-connect-requirements.ts';
import { planNoahConnection } from './noah-connect-plan.ts';
import { NoahAgentError } from './noah-agent-upload.ts';

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
function item(row: Row, signedIn: boolean) {
  const req = row.connect_json ? parseNoahConnect(JSON.parse(row.connect_json)) : null;
  const plan = req ? planNoahConnection(req, { signedIn, entitlement: 'free', price: { model: 'free' }, hasPaymentMethod: false, devices: [], cloudEnabled: false, ownAccountReady: false, grantedServices: [], serviceRegistration: {}, consentedSha256: null, connectSha256: row.connect_sha256!, permissions: ['read_user_input', 'write_results'], preference: 'auto', intakeLevel: row.check_level }) : null;
  return { id: row.id, name: row.name, provider: row.external_key.split('/')[0], summary: row.summary, host: row.host,
    section: row.level === 2 ? 'ran' : 'new', tools: row.tool_count ?? 0, oneTap: (row.one_tap_tools ?? 0) > 0, checkedAt: row.checked_at,
    connect: { badge: plan?.badge ?? 'blocked', taps: plan?.cost.taps ?? 0, typed: plan?.cost.typed ?? 0, place: plan?.place ?? null,
      placeLabel: plan?.place === 'provider' ? `相手のサーバー${row.host ? `（${row.host}）` : ''}` : plan?.place === 'home' ? '自分の端末' : null,
      need: plan?.need ?? (req ? null : '接続先を確認できません。'), level: row.check_level ?? 0, price: { model: 'free' }, note: null } };
}
export type IntakeStatus = {
  sources: Pick<IntakeSource, 'id' | 'next_run_at' | 'last_success_at' | 'error_code' | 'failure_count' | 'observed' | 'withdrawn' | 'request_count' | 'sweep_started_at'>[];
  mouths: { remote: number; terminal: number; remoteReady: number; terminalReady: number }; families: { id: string; name: string; members: number; mouth: string | null; level: number; revision: number; withdrawn: boolean }[]; nextOffset: number | null; reasons: Record<string, number>; unsupported: Record<string, number>; listed: number;
};
export function createIntakeStore(deps: IntakeDependencies) {
  const { db } = deps, now = deps.now ?? Date.now, sync = createIntakeSync(deps);
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
    const rows = ids.length ? (await db.prepare(`${ROW} WHERE f.id IN (${ids.map(() => '?').join(',')})`).bind(...ids.map(r => r.id)).all<Row>()).results : [];
    const byId = new Map(rows.map(r => [r.id, r]));
    return { items: ids.flatMap(({ id }) => { const row = byId.get(id); return row && listing(row).listed ? [item(row, !!owner)] : []; }), nextCursor: params.get('limit') === '0' ? null : nextCursor, counts: await counts(), source: 'Official MCP Registry' };
  }
  async function detail(id: string, owner: string | null, reviewer: boolean) {
    const row = await db.prepare(`${ROW} WHERE f.id=?`).bind(id).first<Row>();
    if (!row || (!reviewer && !listing(row).listed)) throw new NoahAgentError('Agentが見つかりません。', 404);
    let website: string | null = null;
    try { const record = JSON.parse(row.record_json) as { websiteUrl?: string }; if (record.websiteUrl) website = noahPublicHttpsUrl(record.websiteUrl, 'website').href; } catch { /* Untrusted informational link. */ }
    let connection: { id: string; state: string } | null = null;
    // L3 installs no connection tables. A later launch step can supply owner-scoped live connections.
    if (owner && await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='noah_connections'").first()) connection = await db.prepare('SELECT id,state FROM noah_connections WHERE owner_id=? AND family_key=? AND disconnected_at IS NULL ORDER BY updated_at DESC LIMIT 1').bind(owner, id).first<{ id: string; state: string }>();
    return { ...item(row, !!owner), members: row.members, revision: row.revision, website, repository: row.repository, sourceUpdatedAt: row.source_updated_at, connection };
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
    return { sources, mouths, reasons, unsupported, listed: visible.ran + visible.new, families: families.slice(0, 20).map(r => ({ id: r.id, name: r.name, members: r.members, mouth: r.mouth, level: r.level, revision: r.revision, withdrawn: r.withdrawn_at !== null })), nextOffset: families.length > 20 ? offset + 20 : null };
  }
  async function moderate(action: 'withdraw' | 'restore', id: string, revision: number) {
    const row = await db.prepare(`${ROW} WHERE f.id=?`).bind(id).first<Row>();
    if (!row) throw new NoahAgentError('Agentが見つかりません。', 404);
    const eligible = listing(row, true);
    const result = await db.prepare('UPDATE noah_intake_families SET withdrawn_at=?,listed=?,one_tap=?,updated_at=?,revision=revision+1 WHERE id=? AND revision=?').bind(action === 'withdraw' ? now() : null, action === 'restore' && eligible.listed ? 1 : 0, eligible.listed && eligible.oneTap ? 1 : 0, now(), id, revision).run();
    if (result.meta.changes !== 1) throw new NoahAgentError('内容が更新されました。再読込してください。', 409);
    return { id, revision: revision + 1 };
  }
  return { ...sync, list, detail, status, moderate };
}

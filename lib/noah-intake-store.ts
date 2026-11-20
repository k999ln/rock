/**
 * Noah 取り込みの保存と読み出し: 公式台帳の巡回（最初は全件、その後は更新された物だけ）→ 候補・握手の記録・系列、名寄せ、一覧・検索・詳細・集計・取り下げ。
 *
 * ここは台帳の記録を読んで保存するだけで、候補を実行しない。握手もしない（握手は lib/noah-probe.ts。L4）。
 * 台帳の説明文から命令を作らない。台帳に公開された鍵を運ばない（下書きを作れない候補として持つ）。
 * 仕様: docs/noah/spec-85-intake.md 11 章（L3）。規則の正本は lib/noah-intake-draft.ts・lib/noah-intake-family.ts の純関数。
 */
import { NoahAgentError } from './noah-agent-upload.ts';
import { canonicalJson, diffNoahConnect, looksLikeNoahSecret, noahConnectSha256, parseNoahConnect, sha256Hex, type NoahConnect, type NoahPlace } from './noah-connect-requirements.ts';
import { planNoahConnection, type NoahPlanBadge, type NoahPlanState } from './noah-connect-plan.ts';
import {
  draftFromRegistry, noahCandidateId, noahRegistryPageUrl, noahRegistryState, noahRegistrySyncPlan, NOAH_INTAKE_REASONS, NOAH_REGISTRY,
  type NoahIntakeReason, type RegistryInput, type RegistryPackage, type RegistryRemote, type RegistryServer,
} from './noah-intake-draft.ts';
import { NOAH_BULK_THRESHOLD, NOAH_LISTING_REASONS, NOAH_REGROUP_SQL, noahListing, noahRepositoryKey, type NoahListing, type NoahListingReason } from './noah-intake-family.ts';
import { NOAH_LISTING_SQL, noahStatement } from './noah-intake-sql.ts';
import { NOAH_PATROL_BUDGET } from './noah-intake-wake.ts';

type Database = Pick<D1Database, 'prepare' | 'batch'>;
type Statement = D1PreparedStatement;

/** 取り込みの決まった数。数値は候補（本人が変える）。 */
export const NOAH_INTAKE = {
  source: 'mcp-registry' as const,
  /** 画面に出す出どころの名前。台帳の利用条件のとおり、提携・公認と読める書き方をしない。 */
  sourceLabel: 'Official MCP Registry',
  /** 巡回の取り合いを防ぐ lease。1 回の合図（25 秒まで）より長くする。 */
  leaseMs: 60_000,
  /** 台帳の 1 頁を待つ時間と、読む大きさの上限。 */
  pageTimeoutMs: 10_000,
  pageBytes: 4 * 1024 * 1024,
  /** 保存する記録の上限（noah_intake_candidates.record_json）。 */
  recordBytes: 65_536,
  /** 1 回の db.batch に入れる文の数。 */
  batchStatements: 100,
  /** 鍵の入力が要る候補は握手できないので、確かめる時刻を先へ送る。 */
  keyCheckDelayMs: 30 * 24 * 3_600_000,
  /** 失敗の後に待つ時間の上限。 */
  maxBackoffMs: 6 * 3_600_000,
  /** 続けてこの回数失敗したら、進行中の巡回を捨てて、同じ印から始め直す（保存した頁の続きが、もう読めない時のため）。 */
  restartAfterFailures: 6,
  /** 全件の巡回で、前の全件より後に見えていた候補のうち、この割合より少なくしか見えなかった時は、取り下げを行わない。 */
  safetyRatio: 0.9,
  /** 一覧の 1 頁の件数、検索で返す件数の上限、検索の語の長さ。 */
  pageSize: 20,
  searchMax: 200,
  queryChars: 80,
  queryMinChars: 2,
  /** 件数と集計を、同じ値で返してよい時間。サインインしていない人への一覧を、同じ問い合わせについて持つ時間と数。 */
  countsTtlMs: 300_000,
  anonymousTtlMs: 60_000,
  anonymousEntries: 256,
  /** 詳細に出す、取り下げ中の系列の数。 */
  withdrawnShown: 50,
};

/** 下書きを作れなかった理由の表示名（運営の画面）。 */
export const NOAH_INTAKE_REASON_LABELS: Record<NoahIntakeReason, string> = {
  unsupported_registry: '型紙の無い配布',
  no_endpoint: '接続先が無い',
  legacy_sse_only: '旧い接続先だけ',
  bad_url: '接続先の URL が通らない',
  needs_host_file: '本人の端末のファイルが要る',
  needs_runtime_arguments: '起動の引数が型紙の外',
  bad_argument: '引数の形',
  published_secret: '鍵が公開されている',
  bad_identifier: '版が 1 つに決まらない',
  bad_env: '環境変数の名前の形',
  bad_header: 'header の名前の形',
};

/** 一覧に載せていない理由の表示名（運営の画面）。 */
export const NOAH_LISTING_REASON_LABELS: Record<NoahListingReason, string> = {
  withdrawn: '取り下げ',
  hidden: '30 日つながらない',
  unsupported: '下書きを作れない',
  later_source: '公式台帳の外',
  later_mouth: '端末で動かす配布',
  bulk: '量産の系列',
  needs_key: '本人の鍵が要る',
  not_checked: 'まだ握手していない',
  needs_permission: '相手の許可が要る',
  needs_payment: '支払いが要る',
  not_responding: '握手が通らない',
  no_form_tool: '入力欄で使える道具が無い',
};

type SourceRow = {
  id: string; lease_id: string | null; lease_until: number; next_run_at: number; last_attempt_at: number | null; last_success_at: number | null;
  cursor: string | null; updated_since: string | null; sweep_started_at: number | null; checkpoint_at: number | null; last_full_at: number | null;
  error_code: string | null; failure_count: number; observed: number; withdrawn: number; request_count: number;
};
type KnownRow = { id: string; record_sha256: string; state: 'active' | 'unsupported' | 'withdrawn'; reason: string | null; connect_json: string | null; connect_sha256: string | null };
type FamilyRow = {
  id: string; members: number; level: 0 | 1 | 2; l2_at: number | null; listed: number; one_tap: number; withdrawn_at: number | null; hidden_at: number | null; revision: number;
  candidate_id: string; source: 'mcp-registry' | 'hf-mcp-space' | 'acp-registry'; name: string; summary: string; host: string | null; group_key: string;
  state: 'active' | 'unsupported' | 'withdrawn'; reason: string | null; record_sha256: string; repository: string | null; source_updated_at: number | null;
  mouth: NoahConnect['mouth'] | null; setup: number | null; auth: 'none' | 'oauth' | 'key' | 'payment' | 'unknown' | null; result: string | null; check_level: 0 | 1 | 2 | null;
  tool_count: number | null; form_tools: number | null; one_tap_tools: number | null; checked_at: number | null; connect_json: string | null; connect_sha256: string | null;
};

export type NoahIntakeFailureCode = 'rate_limited' | 'unavailable' | 'invalid_response' | 'lease_lost';
class IntakeFailure extends Error {
  code: NoahIntakeFailureCode;
  retryAt: number | null;
  constructor(code: NoahIntakeFailureCode, retryAt: number | null = null) {
    super(code);
    this.code = code;
    this.retryAt = retryAt;
  }
}

export type NoahIntakeOutcome = { source: string; mode: 'full' | 'updated'; pages: number; seen: number; changed: number; more: boolean; error: NoahIntakeFailureCode | null };
export type NoahIntakeSync = { outcomes: NoahIntakeOutcome[] };

export type NoahIntakeConnectView = {
  badge: NoahPlanBadge; taps: number; typed: number; place: NoahPlace | null; placeLabel: string; need: string | null;
  level: 0 | 1 | 2; price: { model: 'free' }; note: string | null;
};
export type NoahIntakeItem = {
  id: string; name: string; provider: string; summary: string; host: string | null; section: 'ran' | 'new' | null;
  tools: number | null; oneTap: boolean; checkedAt: number | null; connect: NoahIntakeConnectView | null;
};
export type NoahIntakeViewer = { signedIn: boolean; reviewer: boolean };
export type NoahIntakeList = { items: NoahIntakeItem[]; nextCursor: string | null; counts: { ran: number; new: number }; source: string };

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const bytes = (text: string) => new TextEncoder().encode(text).byteLength;
const utcDay = (ms: number) => Math.floor(ms / 86_400_000);

/** 提供者の文から制御文字を除き（続く制御文字は空白 1 つにする）、文字数で切る。文字の途中では切らない。 */
export function noahIntakeText(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  let out = '';
  let gap = false;
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0;
    if (code < 32 || (code >= 127 && code < 160)) gap = true;
    else {
      if (gap && out) out += ' ';
      gap = false;
      out += ch;
    }
  }
  return Array.from(out.trim()).slice(0, max).join('');
}

const INPUT_KEYS = ['type', 'name', 'value', 'default', 'format', 'valueHint', 'isRequired', 'isSecret'] as const;
function pick<K extends string>(value: unknown, keys: readonly K[]): Partial<Record<K, unknown>> {
  const out: Partial<Record<K, unknown>> = {};
  if (isRecord(value)) for (const key of keys) if (value[key] !== undefined) out[key] = value[key];
  return out;
}
const inputs = (value: unknown): RegistryInput[] | undefined => (Array.isArray(value) ? value.map((item) => pick(item, INPUT_KEYS) as RegistryInput) : undefined);

/**
 * 台帳の記録から、保存する項目だけを取り出す（型契約の RegistryServer が持つ項目）。値は変えない。
 * 下書きは、この形から作る（draftFromRegistry は、ここに無い項目を読まない）。記録の hash も、この形から作る。
 */
export function noahRegistryRecord(raw: unknown): RegistryServer | null {
  if (!isRecord(raw) || typeof raw.name !== 'string') return null;
  const name = raw.name;
  // 候補の ID（'mcp-registry:' + 名前）は 300 文字まで。制御文字や空白を含む名前は、台帳の形ではない。
  if (!name || name.length > 280 || /\s/.test(name) || noahIntakeText(name, 400) !== name) return null;
  const remotes = Array.isArray(raw.remotes)
    ? raw.remotes.map((remote): RegistryRemote => {
        const headers = inputs(isRecord(remote) ? remote.headers : undefined);
        return { ...(pick(remote, ['type', 'url']) as RegistryRemote), ...(headers ? { headers } : {}) };
      })
    : undefined;
  const packages = Array.isArray(raw.packages)
    ? raw.packages.map((pkg): RegistryPackage => {
        const p = isRecord(pkg) ? pkg : {};
        const runtimeArguments = inputs(p.runtimeArguments);
        const packageArguments = inputs(p.packageArguments);
        const environmentVariables = inputs(p.environmentVariables);
        return {
          ...(pick(p, ['registryType', 'identifier', 'version', 'runtimeHint']) as RegistryPackage),
          ...(isRecord(p.transport) ? { transport: pick(p.transport, ['type']) as { type?: string } } : {}),
          ...(runtimeArguments ? { runtimeArguments } : {}),
          ...(packageArguments ? { packageArguments } : {}),
          ...(environmentVariables ? { environmentVariables } : {}),
        };
      })
    : undefined;
  return {
    name,
    ...(pick(raw, ['title', 'description', 'version', 'websiteUrl']) as Partial<RegistryServer>),
    ...(isRecord(raw.repository) ? { repository: pick(raw.repository, ['url']) as { url?: string } } : {}),
    ...(remotes ? { remotes } : {}),
    ...(packages ? { packages } : {}),
  };
}

/** 台帳に公開された鍵らしい値。Noah は運ばないので、保存もしない（下書きと hash は、消す前の記録から作る）。 */
const REDACTED = '[redacted]';
function redactInputs(list: RegistryInput[] | undefined): RegistryInput[] | undefined {
  return list?.map((input) => {
    const out: RegistryInput & { redacted?: boolean } = { ...input };
    for (const key of ['value', 'default'] as const) {
      const text = out[key];
      if (typeof text === 'string' && (out.isSecret === true || looksLikeNoahSecret(text))) {
        out[key] = REDACTED;
        out.redacted = true;
      }
    }
    return out;
  });
}
function redactRecord(record: RegistryServer): RegistryServer {
  return {
    ...record,
    ...(record.remotes
      ? { remotes: record.remotes.map((remote) => ({ ...remote, ...(typeof remote.url === 'string' && looksLikeNoahSecret(remote.url) ? { url: REDACTED } : {}), ...(remote.headers ? { headers: redactInputs(remote.headers) } : {}) })) }
      : {}),
    ...(record.packages
      ? {
          packages: record.packages.map((pkg) => ({
            ...pkg,
            ...(pkg.runtimeArguments ? { runtimeArguments: redactInputs(pkg.runtimeArguments) } : {}),
            ...(pkg.packageArguments ? { packageArguments: redactInputs(pkg.packageArguments) } : {}),
            ...(pkg.environmentVariables ? { environmentVariables: redactInputs(pkg.environmentVariables) } : {}),
          })),
        }
      : {}),
  };
}

/** 保存する形（record_json）。鍵らしい値を消す。上限を越える記録は、接続先と配布を外して oversize の印を足す。下書きと hash は、変える前の記録から作る。 */
function recordJson(record: RegistryServer): string {
  const stored = redactRecord(record);
  const full = canonicalJson(stored);
  if (bytes(full) <= NOAH_INTAKE.recordBytes) return full;
  const rest: Record<string, unknown> = { ...stored, oversize: true };
  delete rest.remotes;
  delete rest.packages;
  const small = canonicalJson(rest);
  return bytes(small) <= NOAH_INTAKE.recordBytes ? small : canonicalJson({ name: record.name, oversize: true });
}

/** 取り込んだ系列を、本人の今の状態で計画する時の状態（ローンチ版。docs/noah/spec-96-connect-plan.md 9.3）。 */
export function noahIntakePlanState(input: { signedIn: boolean; connectSha256: string; level: 0 | 1 | 2; consentedSha256?: string | null }): NoahPlanState {
  return {
    signedIn: input.signedIn, entitlement: 'free', price: { model: 'free' }, hasPaymentMethod: false, devices: [], cloudEnabled: false, ownAccountReady: false,
    grantedServices: [], serviceRegistration: {}, consentedSha256: input.consentedSha256 ?? null, connectSha256: input.connectSha256,
    permissions: ['read_user_input', 'write_results'], preference: 'auto', intakeLevel: input.level,
  };
}

/** 動く所の文。カードにそのまま出す。 */
export function noahPlaceLabel(place: NoahPlace | null, host: string | null): string {
  if (place === 'provider') return host ? `相手のサーバー（${host}）` : '相手のサーバー';
  if (place === 'home') return 'あなたの端末';
  if (place === 'cloud') return 'Noah の雲の端末';
  if (place === 'pocket') return 'この端末';
  return '';
}

function listingOf(row: FamilyRow): NoahListing {
  return noahListing({
    source: row.source, familyId: row.id, candidateState: row.state, withdrawn: row.withdrawn_at !== null, hidden: row.hidden_at !== null,
    check: row.mouth === null || row.auth === null
      ? null
      : { mouth: row.mouth, setup: row.setup === 1, auth: row.auth, result: row.result ?? 'unchecked', level: row.check_level ?? 0, formTools: row.form_tools, oneTapTools: row.one_tap_tools },
  });
}

function connectView(row: FamilyRow, viewer: { signedIn: boolean; consentedSha256?: string | null }): NoahIntakeConnectView | null {
  if (!row.connect_json || !row.connect_sha256) return null;
  let connect: NoahConnect;
  try {
    connect = parseNoahConnect(JSON.parse(row.connect_json));
  } catch {
    return null;
  }
  const level = row.check_level ?? 0;
  const plan = planNoahConnection(connect, noahIntakePlanState({ signedIn: viewer.signedIn, connectSha256: row.connect_sha256, level, consentedSha256: viewer.consentedSha256 }));
  return {
    badge: plan.badge, taps: plan.cost.taps, typed: plan.cost.typed, place: plan.place, placeLabel: noahPlaceLabel(plan.place, row.host),
    need: plan.need, level, price: { model: 'free' }, note: plan.reason ?? null,
  };
}

function itemOf(row: FamilyRow, viewer: { signedIn: boolean; consentedSha256?: string | null }): NoahIntakeItem {
  const listing = listingOf(row);
  return {
    id: row.id, name: row.name, provider: row.group_key, summary: row.summary, host: row.host,
    section: listing.listed ? listing.section : null, tools: row.tool_count, oneTap: listing.listed ? listing.oneTap : false, checkedAt: row.checked_at,
    connect: connectView(row, viewer),
  };
}

const FAMILY_SELECT = `SELECT f.id, f.members, f.level, f.l2_at, f.listed, f.one_tap, f.withdrawn_at, f.hidden_at, f.revision,
       c.id AS candidate_id, c.source, c.name, c.summary, c.host, c.group_key, c.state, c.reason, c.record_sha256, c.repository, c.source_updated_at,
       k.mouth, k.setup, k.auth, k.result, k.level AS check_level, k.tool_count, k.form_tools, k.one_tap_tools, k.checked_at, k.connect_json, k.connect_sha256
  FROM noah_intake_families f JOIN noah_intake_candidates c ON c.id = f.representative_id LEFT JOIN noah_intake_checks k ON k.candidate_id = c.id`;

type Cached<T> = { at: number; value: T };
type Caches = { counts?: Cached<{ ran: number; new: number }>; status?: Cached<unknown>; anonymous: Map<string, Cached<NoahIntakeList>> };
const cachesByDatabase = new WeakMap<object, Caches>();

function retryAfter(header: string | null, now: number): number | null {
  if (!header) return null;
  const seconds = /^\d{1,9}$/.test(header.trim()) ? Number(header.trim()) : NaN;
  const at = Number.isFinite(seconds) ? now + seconds * 1000 : Date.parse(header);
  return Number.isFinite(at) && at > now ? at : null;
}

async function boundedText(response: Response, limit: number): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new IntakeFailure('invalid_response');
    }
    chunks.push(part.value);
  }
  const all = new Uint8Array(size);
  let offset = 0;
  for (const part of chunks) {
    all.set(part, offset);
    offset += part.byteLength;
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(all);
}

export function createIntakeStore({
  db,
  now = Date.now,
  fetcher = fetch,
  budget = NOAH_PATROL_BUDGET,
  userAgent = 'NoahBot/1',
}: {
  db: Database;
  now?: () => number;
  fetcher?: typeof fetch;
  budget?: Pick<typeof NOAH_PATROL_BUDGET, 'pages' | 'seconds'>;
  /** 台帳へ名乗る文字列。`NoahBot/1 (+https://<Noah の origin>/noah/help#bot)`。 */
  userAgent?: string;
}) {
  const SOURCE = NOAH_INTAKE.source;
  const caches = (() => {
    let found = cachesByDatabase.get(db);
    if (!found) cachesByDatabase.set(db, (found = { anonymous: new Map() }));
    return found;
  })();
  const forget = () => {
    caches.counts = undefined;
    caches.status = undefined;
    caches.anonymous.clear();
  };

  const sourceRow = () => db.prepare('SELECT * FROM noah_intake_sources WHERE id=?').bind(SOURCE).first<SourceRow>();

  /**
   * 文の組（1 件の候補の、候補・握手の記録・系列の文）を、組の途中で切らずに、決めた数ずつの db.batch で流す。
   * db.batch は 1 回がまとめて通るか、まとめて戻る。組を分けなければ、候補だけが新しくなって握手の記録や系列が古いまま、という状態が残らない。
   */
  async function runBatches(groups: Statement[][]) {
    let batch: Statement[] = [];
    for (const group of groups) {
      if (batch.length && batch.length + group.length > NOAH_INTAKE.batchStatements) {
        await db.batch(batch);
        batch = [];
      }
      batch.push(...group);
    }
    if (batch.length) await db.batch(batch);
  }

  // -------------------------------------------------------------------------
  // 台帳の 1 頁を読む
  // -------------------------------------------------------------------------
  async function readPage(url: string, timeoutMs: number, previousCursor: string | null): Promise<{ records: unknown[]; nextCursor: string | null }> {
    let response: Response;
    try {
      // 転送は追わない。名乗りを付ける。本文は送らない。
      response = await fetcher(url, { method: 'GET', redirect: 'manual', headers: { Accept: 'application/json', 'User-Agent': userAgent }, signal: AbortSignal.timeout(timeoutMs) });
    } catch {
      throw new IntakeFailure('unavailable');
    }
    if (response.status === 429) {
      await response.body?.cancel().catch(() => {});
      throw new IntakeFailure('rate_limited', retryAfter(response.headers.get('retry-after'), now()));
    }
    if (response.status !== 200) {
      await response.body?.cancel().catch(() => {});
      throw new IntakeFailure('unavailable');
    }
    let data: unknown;
    try {
      data = JSON.parse(await boundedText(response, NOAH_INTAKE.pageBytes));
    } catch (error) {
      if (error instanceof IntakeFailure) throw error;
      throw new IntakeFailure(error instanceof SyntaxError || error instanceof TypeError ? 'invalid_response' : 'unavailable');
    }
    if (!isRecord(data) || !Array.isArray(data.servers)) throw new IntakeFailure('invalid_response');
    const next = isRecord(data.metadata) ? data.metadata.nextCursor : undefined;
    if (next !== undefined && next !== null && (typeof next !== 'string' || next.length > 1000)) throw new IntakeFailure('invalid_response');
    const nextCursor = typeof next === 'string' && next ? next : null;
    // 同じ頁を指し続ける応答では、進まない。
    if (nextCursor !== null && nextCursor === previousCursor) throw new IntakeFailure('invalid_response');
    return { records: data.servers, nextCursor };
  }

  // -------------------------------------------------------------------------
  // 1 頁を保存する。変わらない記録は seen_at だけ。変わった記録だけ、下書きを作り直して書く
  // -------------------------------------------------------------------------
  async function writePage(entries: unknown[]): Promise<{ seen: number; changed: number }> {
    const stamp = now();
    const incoming = new Map<string, { record: RegistryServer; status: unknown; updatedAt: number | null }>();
    for (const entry of entries) {
      if (!isRecord(entry)) continue;
      const record = noahRegistryRecord(entry.server);
      if (!record) continue;
      const official = isRecord(entry._meta) ? entry._meta['io.modelcontextprotocol.registry/official'] : undefined;
      const meta = isRecord(official) ? official : {};
      const parsed = typeof meta.updatedAt === 'string' ? Date.parse(meta.updatedAt) : NaN;
      incoming.set(noahCandidateId(SOURCE, record.name), { record, status: meta.status, updatedAt: Number.isFinite(parsed) ? Math.trunc(parsed) : null });
    }
    if (!incoming.size) return { seen: 0, changed: 0 };

    const ids = [...incoming.keys()];
    const known = new Map<string, KnownRow>();
    for (let i = 0; i < ids.length; i += 90) {
      const part = ids.slice(i, i + 90);
      const rows = await db
        .prepare(`SELECT c.id, c.record_sha256, c.state, c.reason, k.connect_json, k.connect_sha256 FROM noah_intake_candidates c LEFT JOIN noah_intake_checks k ON k.candidate_id = c.id WHERE c.id IN (${part.map(() => '?').join(',')})`)
        .bind(...part)
        .all<KnownRow>();
      for (const row of rows.results) known.set(row.id, row);
    }

    const groups: Statement[][] = [];
    const unchanged: string[] = [];
    let changed = 0;
    for (const [id, { record, status, updatedAt }] of incoming) {
      const statements: Statement[] = [];
      const sha = await sha256Hex(canonicalJson(record));
      const before = known.get(id);
      const withdrawn = noahRegistryState(status) === 'withdrawn';
      // 台帳が外した・非推奨にした記録は、下書きを作らない。
      const draft = withdrawn ? null : await draftFromRegistry(record);
      const state: KnownRow['state'] = withdrawn ? 'withdrawn' : draft?.ok ? 'active' : 'unsupported';
      const reason = draft && !draft.ok ? draft.reason : null;
      const connect = draft?.ok ? draft.connect : null;
      const connectSha = connect ? await noahConnectSha256(connect) : null;
      if (before && before.record_sha256 === sha && before.state === state && before.reason === reason && (withdrawn || before.connect_sha256 === connectSha)) {
        unchanged.push(id);
        continue;
      }
      changed += 1;
      groups.push(statements);
      const becameActive = state === 'active' && before?.state !== 'active';
      const namespace = record.name.includes('/') ? record.name.slice(0, record.name.indexOf('/')) : record.name;
      const host = connect?.mouth === 'mcp-remote' ? (connect.egress[0] ?? null) : null;
      statements.push(
        db
          .prepare(
            `INSERT INTO noah_intake_candidates(id, source, external_key, family_id, group_key, name, summary, repository, host, record_sha256, record_json, state, reason, source_updated_at, first_seen_at, changed_at, seen_at, revision)
             VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)
             ON CONFLICT(id) DO UPDATE SET group_key=excluded.group_key, name=excluded.name, summary=excluded.summary, repository=excluded.repository, host=excluded.host,
               record_sha256=excluded.record_sha256, record_json=excluded.record_json, state=excluded.state, reason=excluded.reason, source_updated_at=excluded.source_updated_at,
               changed_at=excluded.changed_at, seen_at=excluded.seen_at, revision=noah_intake_candidates.revision+1,
               family_id=CASE WHEN ?=1 THEN excluded.family_id ELSE noah_intake_candidates.family_id END`,
          )
          .bind(
            id, SOURCE, record.name, id, namespace, noahIntakeText(record.title, 200) || noahIntakeText(record.name, 200), noahIntakeText(record.description, 500),
            noahRepositoryKey(typeof record.repository?.url === 'string' ? record.repository.url : undefined), host, sha, recordJson(record), state, reason, updatedAt, stamp, stamp, stamp,
            becameActive ? 1 : 0,
          ),
      );
      if (connect && connectSha) {
        const setup = connect.secrets.length > 0;
        const auth = setup ? 'key' : connect.mouth === 'mcp-remote' ? 'unknown' : 'none';
        // 接続先に関わる項目が変わった時と、有効に戻った時だけ、握手の記録を消して確かめ直す。説明や版だけの更新では消さない。
        const previous = (() => {
          if (!before?.connect_json || becameActive) return null;
          try {
            return parseNoahConnect(JSON.parse(before.connect_json));
          } catch {
            return null;
          }
        })();
        if (previous && !diffNoahConnect(previous, connect).reconsent) {
          statements.push(db.prepare('UPDATE noah_intake_checks SET connect_json=?, connect_sha256=? WHERE candidate_id=?').bind(canonicalJson(connect), connectSha, id));
        } else {
          statements.push(
            db
              .prepare(
                `INSERT INTO noah_intake_checks(candidate_id, mouth, surface, auth, connect_json, connect_sha256, setup, level, result, next_check_at)
                 VALUES(?,?,?,?,?,?,?,0,'unchecked',?)
                 ON CONFLICT(candidate_id) DO UPDATE SET mouth=excluded.mouth, surface=excluded.surface, auth=excluded.auth, connect_json=excluded.connect_json,
                   connect_sha256=excluded.connect_sha256, setup=excluded.setup, oauth_json=NULL, tools_sha256=NULL, tool_count=NULL, read_only=NULL, form_tools=NULL,
                   one_tap_tools=NULL, level=0, result='unchecked', latency_ms=NULL, sample_json=NULL, l1_at=NULL, l2_at=NULL,
                   next_check_at=excluded.next_check_at, failures=0, first_failure_at=NULL, lease_until=0`,
              )
              .bind(id, connect.mouth, connect.surface, auth, canonicalJson(connect), connectSha, setup ? 1 : 0, setup ? stamp + NOAH_INTAKE.keyCheckDelayMs : stamp),
          );
          // 新しく入った有効な候補には、その場で「1 件で 1 系列」の行を作る。次の名寄せが、まとめる物だけを付け替える。
          if (becameActive)
            statements.push(
              db
                .prepare(
                  `INSERT OR IGNORE INTO noah_intake_families(id, representative_id, members, level, badge_hint, listed, one_tap, shuffle, updated_at, revision)
                   VALUES(?, ?, 1, 0, ?, 0, 0, abs(random()) % 1000000000, ?, 1)`,
                )
                .bind(id, id, setup ? 'setup' : 'unverified', stamp),
            );
          // この候補が代表の系列は、確かめ直すまで載せない（名寄せを待たない）。
          if (before)
            statements.push(noahStatement(db, NOAH_LISTING_SQL.touch, { level: 0, l2_at: null, badge_hint: setup ? 'setup' : 'unverified', listed: 0, one_tap: 0, now: stamp, candidate_id: id }));
        }
      } else if (before) {
        // 取り下げ・下書きを作れなくなった候補が代表の系列は、その場で外す。下書きの無い候補は、握手の記録を持たない。
        if (state === 'unsupported') statements.push(db.prepare('DELETE FROM noah_intake_checks WHERE candidate_id=?').bind(id));
        statements.push(noahStatement(db, NOAH_LISTING_SQL.touch, { level: 0, l2_at: null, badge_hint: 'unverified', listed: 0, one_tap: 0, now: stamp, candidate_id: id }));
      }
    }
    for (let i = 0; i < unchanged.length; i += 90) {
      const part = unchanged.slice(i, i + 90);
      groups.push([db.prepare(`UPDATE noah_intake_candidates SET seen_at=? WHERE id IN (${part.map(() => '?').join(',')})`).bind(stamp, ...part)]);
    }
    await runBatches(groups);
    if (changed) forget();
    return { seen: incoming.size, changed };
  }

  // -------------------------------------------------------------------------
  // 名寄せ（1 日 1 回と、全件の巡回の後）。並びの引き直しも、同じ時に行う
  // -------------------------------------------------------------------------
  async function regroup(stamp = now()) {
    await db.batch([
      ...NOAH_REGROUP_SQL.map((sql) => {
        const params: Record<string, number> = {};
        if (sql.includes(':threshold')) params.threshold = NOAH_BULK_THRESHOLD;
        if (sql.includes(':now')) params.now = stamp;
        return noahStatement(db, sql, params);
      }),
      noahStatement(db, NOAH_LISTING_SQL.reshuffle),
    ]);
    forget();
  }

  // -------------------------------------------------------------------------
  // 巡回。1 回の呼び出しで、期限の来た分を上限つきで進める。呼ぶ側は、出どころも時刻も指定できない
  // -------------------------------------------------------------------------
  async function sync(options: { deadline?: number } = {}): Promise<NoahIntakeSync> {
    const started = now();
    const deadline = options.deadline ?? started + budget.seconds * 1000;
    let source = await sourceRow();
    if (!source) {
      await db.prepare('INSERT OR IGNORE INTO noah_intake_sources(id) VALUES(?)').bind(SOURCE).run();
      source = await sourceRow();
    }
    if (!source) throw new Error('noah intake: migration required');
    if (source.next_run_at > started || source.lease_until >= started) return { outcomes: [] };
    const lease = crypto.randomUUID();
    const claim = await db
      .prepare('UPDATE noah_intake_sources SET lease_id=?, lease_until=?, last_attempt_at=? WHERE id=? AND next_run_at<=? AND lease_until<?')
      .bind(lease, started + NOAH_INTAKE.leaseMs, started, SOURCE, started, started)
      .run();
    if (claim.meta.changes !== 1) return { outcomes: [] };

    let sweepStartedAt = source.sweep_started_at;
    let updatedSince = source.updated_since ? Date.parse(source.updated_since) : null;
    let cursor = source.cursor;
    const outcome: NoahIntakeOutcome = { source: SOURCE, mode: source.updated_since ? 'updated' : 'full', pages: 0, seen: 0, changed: 0, more: true, error: null };
    try {
      if (sweepStartedAt === null) {
        // 新しい巡回。updated_since は、1 巡の間ずっと同じ値を使う。印は、全部の頁を書き終えた後にだけ進める。
        const plan = noahRegistrySyncPlan({ now: started, checkpoint: source.checkpoint_at, lastFullAt: source.last_full_at });
        sweepStartedAt = plan.nextCheckpoint;
        updatedSince = plan.updatedSince;
        cursor = null;
        outcome.mode = plan.mode;
        const begun = await db
          .prepare('UPDATE noah_intake_sources SET sweep_started_at=?, updated_since=?, cursor=NULL, request_count=0 WHERE id=? AND lease_id=?')
          .bind(sweepStartedAt, updatedSince === null ? null : new Date(updatedSince).toISOString(), SOURCE, lease)
          .run();
        if (begun.meta.changes !== 1) throw new IntakeFailure('lease_lost');
      }
      while (outcome.pages < budget.pages && now() < deadline) {
        const page = await readPage(noahRegistryPageUrl({ cursor, updatedSince }), Math.max(1_000, Math.min(NOAH_INTAKE.pageTimeoutMs, deadline - now())), cursor);
        const written = await writePage(page.records);
        outcome.pages += 1;
        outcome.seen += written.seen;
        outcome.changed += written.changed;
        if (page.nextCursor === null) {
          await finishSweep({ lease, source, sweepStartedAt, full: outcome.mode === 'full' });
          outcome.more = false;
          return { outcomes: [outcome] };
        }
        cursor = page.nextCursor;
        // 途中で止まっても、次の呼び出しが続きから読む。
        const saved = await db
          .prepare('UPDATE noah_intake_sources SET cursor=?, request_count=request_count+1, lease_until=? WHERE id=? AND lease_id=?')
          .bind(cursor, now() + NOAH_INTAKE.leaseMs, SOURCE, lease)
          .run();
        if (saved.meta.changes !== 1) throw new IntakeFailure('lease_lost');
      }
      await db.prepare('UPDATE noah_intake_sources SET lease_id=NULL, lease_until=0, error_code=NULL, failure_count=0 WHERE id=? AND lease_id=?').bind(SOURCE, lease).run();
      return { outcomes: [outcome] };
    } catch (error) {
      const failure = error instanceof IntakeFailure ? error : new IntakeFailure('unavailable');
      outcome.error = failure.code;
      if (failure.code !== 'lease_lost') {
        const failures = source.failure_count + 1;
        const backoff = Math.min(2 ** Math.min(failures, 16) * 60_000, NOAH_INTAKE.maxBackoffMs);
        const next = failure.retryAt !== null ? Math.min(Math.max(failure.retryAt, now() + 60_000), now() + NOAH_INTAKE.maxBackoffMs) : now() + backoff;
        // 進行中の巡回の列は消さない（次の呼び出しが、同じ updated_since と cursor から続ける）。失敗が続いた時だけ、始め直す。
        const restart = failures >= NOAH_INTAKE.restartAfterFailures;
        await db
          .prepare(
            `UPDATE noah_intake_sources SET lease_id=NULL, lease_until=0, next_run_at=?, error_code=?, failure_count=failure_count+1,
               sweep_started_at=CASE WHEN ?=1 THEN NULL ELSE sweep_started_at END, updated_since=CASE WHEN ?=1 THEN NULL ELSE updated_since END,
               cursor=CASE WHEN ?=1 THEN NULL ELSE cursor END
             WHERE id=? AND lease_id=?`,
          )
          .bind(next, failure.code, restart ? 1 : 0, restart ? 1 : 0, restart ? 1 : 0, SOURCE, lease)
          .run();
      }
      forget();
      return { outcomes: [outcome] };
    }
  }

  async function finishSweep(input: { lease: string; source: SourceRow; sweepStartedAt: number; full: boolean }) {
    const stamp = now();
    const seen = Number((await db.prepare('SELECT COUNT(*) AS n FROM noah_intake_candidates WHERE source=? AND seen_at>=?').bind(SOURCE, input.sweepStartedAt).first<{ n: number }>())?.n ?? 0);
    let withdrawn = 0;
    if (input.full) {
      // 取り下げ: この全件の巡回で見えなかった候補。ただし、相手の障害で全部を取り下げにしないための安全弁を通った時だけ。
      // 安全弁: この巡回の前から知っていて、前の全件の巡回より後に見えていた候補のうち、この巡回でも見えた物が 9 割以上。
      // 9 割に届かない巡回では行わない。見えない状態が次の全件の巡回でも続いた候補は、その時に取り下げる（分母から外れるため）。
      const known = await db
        .prepare('SELECT COUNT(*) AS known, COALESCE(SUM(CASE WHEN seen_at>=?1 THEN 1 ELSE 0 END), 0) AS seen FROM noah_intake_candidates WHERE source=?2 AND first_seen_at<?1 AND seen_at>=?3')
        .bind(input.sweepStartedAt, SOURCE, input.source.last_full_at ?? 0)
        .first<{ known: number; seen: number }>();
      if (Number(known?.seen ?? 0) >= Number(known?.known ?? 0) * NOAH_INTAKE.safetyRatio) {
        const result = await db
          .prepare("UPDATE noah_intake_candidates SET state='withdrawn', reason=NULL, revision=revision+1, changed_at=? WHERE source=? AND state IN ('active','unsupported') AND seen_at<?")
          .bind(stamp, SOURCE, input.sweepStartedAt)
          .run();
        withdrawn = Number(result.meta.changes ?? 0);
      }
    }
    // 名寄せを流すのは、全件の巡回の後と、UTC の日付が変わって最初に終わった巡回の後だけ（毎時は流さない）。
    if (input.full || input.source.last_success_at === null || utcDay(input.source.last_success_at) !== utcDay(stamp)) await regroup(stamp);
    const done = await db
      .prepare(
        `UPDATE noah_intake_sources SET lease_id=NULL, lease_until=0, cursor=NULL, updated_since=NULL, sweep_started_at=NULL, checkpoint_at=?,
           last_full_at=CASE WHEN ?=1 THEN ? ELSE last_full_at END, last_success_at=?, next_run_at=?, error_code=NULL, failure_count=0,
           observed=?, withdrawn=?, request_count=request_count+1
         WHERE id=? AND lease_id=?`,
      )
      .bind(input.sweepStartedAt, input.full ? 1 : 0, input.sweepStartedAt, stamp, input.sweepStartedAt + NOAH_REGISTRY.everyMs, seen, withdrawn, SOURCE, input.lease)
      .run();
    if (done.meta.changes !== 1) throw new IntakeFailure('lease_lost');
    forget();
  }

  // -------------------------------------------------------------------------
  // 一覧・検索・詳細
  // -------------------------------------------------------------------------
  async function familyRows(ids: string[]): Promise<FamilyRow[]> {
    if (!ids.length) return [];
    const rows = await db.prepare(`${FAMILY_SELECT} WHERE f.id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all<FamilyRow>();
    const byId = new Map(rows.results.map((row) => [row.id, row]));
    return ids.flatMap((id) => byId.get(id) ?? []);
  }

  async function counts(): Promise<{ ran: number; new: number }> {
    const cached = caches.counts;
    if (cached && now() - cached.at < NOAH_INTAKE.countsTtlMs && now() >= cached.at) return cached.value;
    const row = await db
      .prepare(
        `SELECT (SELECT COUNT(*) FROM noah_intake_families WHERE level = 2 AND listed = 1 AND withdrawn_at IS NULL AND hidden_at IS NULL) AS ran,
                (SELECT COUNT(*) FROM noah_intake_families WHERE level = 1 AND listed = 1 AND withdrawn_at IS NULL AND hidden_at IS NULL) AS fresh`,
      )
      .first<{ ran: number; fresh: number }>();
    const value = { ran: Number(row?.ran ?? 0), new: Number(row?.fresh ?? 0) };
    caches.counts = { at: now(), value };
    return value;
  }

  const badCursor = () => new NoahAgentError('続きの位置を読めません。先頭から読み直してください。', 400);

  async function list(params: URLSearchParams, viewer: NoahIntakeViewer): Promise<NoahIntakeList> {
    const cursor = params.get('cursor') ?? '';
    const query = (params.get('q') ?? '').normalize('NFKC').trim();
    const oneTap = params.get('oneTap') === '1';
    const countsOnly = params.get('limit') === '0';
    if (Array.from(query).length > NOAH_INTAKE.queryChars) throw new NoahAgentError(`探す語は ${NOAH_INTAKE.queryChars} 文字までです。`, 400);
    if (query && Array.from(query).length < NOAH_INTAKE.queryMinChars) throw new NoahAgentError(`探す語は ${NOAH_INTAKE.queryMinChars} 文字以上で入れてください。`, 400);
    if (cursor.length > 500) throw badCursor();

    const key = JSON.stringify([cursor, query, oneTap, countsOnly]);
    if (!viewer.signedIn) {
      const cached = caches.anonymous.get(key);
      if (cached && now() - cached.at < NOAH_INTAKE.anonymousTtlMs && now() >= cached.at) return cached.value;
    }

    const size = NOAH_INTAKE.pageSize;
    let ids: string[] = [];
    let nextCursor: string | null = null;
    if (countsOnly) {
      // 件数だけ（navigation が、見せてよいかを確かめるのに使う）。
    } else if (query) {
      const match = /^s:(\d{1,3})$/.exec(cursor);
      if (cursor && !match) throw badCursor();
      const offset = match ? Number(match[1]) : 0;
      if (offset % size !== 0 || offset >= NOAH_INTAKE.searchMax) throw badCursor();
      // % と _ と \ を文字として探す。
      const like = `%${query.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
      const rows = await noahStatement(db, NOAH_LISTING_SQL.search, { like, limit: size + 1, offset }).all<{ id: string }>();
      ids = rows.results.slice(0, size).map((row) => row.id);
      if (rows.results.length > size && offset + size < NOAH_INTAKE.searchMax) nextCursor = `s:${offset + size}`;
    } else {
      const ran = /^r:(\d{1,16}):([\s\S]*)$/.exec(cursor);
      const fresh = /^n:(\d{1,10}):([\s\S]*)$/.exec(cursor);
      if (cursor && !ran && !fresh) throw badCursor();
      const takeNew = async (before: number, afterId: string, limit: number) => {
        const rows = await noahStatement(db, NOAH_LISTING_SQL.new, { one_tap: oneTap ? 1 : 0, before, after_id: afterId, limit: limit + 1 }).all<{ id: string; shuffle: number }>();
        const page = rows.results.slice(0, limit);
        ids.push(...page.map((row) => row.id));
        const last = page.at(-1);
        // limit が 0 の時は、続きがあるかだけを見る。
        if (rows.results.length > limit) nextCursor = last ? `n:${last.shuffle}:${last.id}` : `n:${before}:${afterId}`;
      };
      if (fresh) await takeNew(Number(fresh[1]), fresh[2], size);
      else {
        // 先に「動いた」を最後まで、続けて「まだ誰も動かしていない」。
        const rows = await noahStatement(db, NOAH_LISTING_SQL.ran, { before_at: ran ? Number(ran[1]) : Number.MAX_SAFE_INTEGER, after_id: ran ? ran[2] : '', limit: size + 1 }).all<{ id: string; l2_at: number }>();
        const page = rows.results.slice(0, size);
        ids.push(...page.map((row) => row.id));
        const last = page.at(-1);
        if (rows.results.length > size && last) nextCursor = `r:${last.l2_at}:${last.id}`;
        else await takeNew(1_000_000_000, '', size - page.length);
      }
    }
    const rows = await familyRows(ids);
    const value: NoahIntakeList = { items: rows.map((row) => itemOf(row, viewer)), nextCursor, counts: await counts(), source: NOAH_INTAKE.sourceLabel };
    if (!viewer.signedIn) {
      if (caches.anonymous.size >= NOAH_INTAKE.anonymousEntries) {
        const oldest = caches.anonymous.keys().next();
        if (!oldest.done) caches.anonymous.delete(oldest.value);
      }
      caches.anonymous.set(key, { at: now(), value });
    }
    return value;
  }

  async function detail(id: string, viewer: NoahIntakeViewer) {
    if (id.length < 3 || id.length > 400) throw new NoahAgentError('見つかりません。', 404);
    const [row] = await familyRows([id]);
    if (!row) throw new NoahAgentError('見つかりません。', 404);
    const listing = listingOf(row);
    // 載せていない系列は、審査者にだけ見せる。
    if (!listing.listed && !viewer.reviewer) throw new NoahAgentError('見つかりません。', 404);
    const extra = await db.prepare("SELECT json_extract(record_json, '$.websiteUrl') AS website FROM noah_intake_candidates WHERE id=?").bind(row.candidate_id).first<{ website: unknown }>();
    let website: string | null = null;
    if (typeof extra?.website === 'string' && extra.website.length <= 500) {
      try {
        const url = new URL(extra.website);
        if (url.protocol === 'https:' && !url.username && !url.password) website = url.toString();
      } catch {
        website = null;
      }
    }
    return {
      ...itemOf(row, viewer), members: row.members, website, repository: row.repository, sourceUpdatedAt: row.source_updated_at,
      // 接続（Passport）は L5 で足す。
      connection: null as { id: string; state: string } | null,
      ...(viewer.reviewer
        ? { review: { revision: row.revision, withdrawnAt: row.withdrawn_at, hiddenAt: row.hidden_at, mouth: row.mouth, level: row.check_level, result: row.result,
            listing: listing.listed ? { listed: true as const } : { listed: false as const, reason: listing.reason, label: NOAH_LISTING_REASON_LABELS[listing.reason] } } }
        : {}),
    };
  }

  // -------------------------------------------------------------------------
  // 運営の画面: 出どころの状態と集計（審査者だけ）
  // -------------------------------------------------------------------------
  async function status() {
    const cached = caches.status as Cached<Awaited<ReturnType<typeof compute>>> | undefined;
    if (cached && now() - cached.at < NOAH_INTAKE.countsTtlMs && now() >= cached.at) return cached.value;
    const value = await compute();
    caches.status = { at: now(), value };
    return value;
  }
  async function compute() {
    const sources = (
      await db
        .prepare('SELECT id, lease_until, next_run_at, last_attempt_at, last_success_at, sweep_started_at, updated_since, checkpoint_at, last_full_at, error_code, failure_count, observed, withdrawn, request_count FROM noah_intake_sources ORDER BY id')
        .all<Omit<SourceRow, 'lease_id' | 'cursor'>>()
    ).results.map((row) => ({
      id: row.id, label: NOAH_INTAKE.sourceLabel, lastAttemptAt: row.last_attempt_at, lastSuccessAt: row.last_success_at, nextRunAt: row.next_run_at,
      sweepStartedAt: row.sweep_started_at, sweepMode: row.sweep_started_at === null ? null : row.updated_since ? 'updated' : 'full',
      checkpointAt: row.checkpoint_at, lastFullAt: row.last_full_at, errorCode: row.error_code, failureCount: row.failure_count,
      observed: row.observed, withdrawn: row.withdrawn, requestCount: row.request_count,
    }));
    // 件数の表: 口ごとの、候補・入力なし・準備が要る。
    const byMouth = (
      await db
        .prepare("SELECT k.mouth, k.level, k.setup, COUNT(*) AS n FROM noah_intake_candidates c JOIN noah_intake_checks k ON k.candidate_id=c.id WHERE c.state='active' GROUP BY 1,2,3")
        .all<{ mouth: string; level: number; setup: number; n: number }>()
    ).results;
    const table = (['mcp-remote', 'mcp-package'] as const).map((mouth) => {
      const mine = byMouth.filter((row) => row.mouth === mouth);
      const sum = (rows: typeof mine) => rows.reduce((total, row) => total + Number(row.n), 0);
      return { mouth, label: mouth === 'mcp-remote' ? '相手のサーバー' : '端末で動かす', candidates: sum(mine), noInput: sum(mine.filter((row) => row.setup === 0)), setup: sum(mine.filter((row) => row.setup === 1)) };
    });
    const unsupported = (await db.prepare("SELECT reason, COUNT(*) AS n FROM noah_intake_candidates WHERE state='unsupported' GROUP BY 1").all<{ reason: string; n: number }>()).results
      .map((row) => ({ reason: row.reason, label: (NOAH_INTAKE_REASONS as readonly string[]).includes(row.reason) ? NOAH_INTAKE_REASON_LABELS[row.reason as NoahIntakeReason] : row.reason, count: Number(row.n) }))
      .sort((a, b) => b.count - a.count || (a.reason < b.reason ? -1 : 1));
    // 載せている数と、載せていない理由。理由は、行ごとに noahListing が決める（候補の数。系列の取り下げ・隠した印は、ここでは数えない）。
    const tally = new Map<NoahListingReason, number>();
    let listed = 0;
    const grouped = (
      await noahStatement(db, NOAH_LISTING_SQL.counts).all<{
        source: 'mcp-registry' | 'hf-mcp-space' | 'acp-registry'; state: 'active' | 'unsupported' | 'withdrawn'; bulk: number; mouth: NoahConnect['mouth'] | null; setup: number | null;
        auth: 'none' | 'oauth' | 'key' | 'payment' | 'unknown' | null; result: string | null; level: 0 | 1 | 2 | null; has_form: number; has_one_tap: number; n: number;
      }>()
    ).results;
    for (const row of grouped) {
      const verdict = noahListing({
        source: row.source, familyId: row.bulk ? 'bulk:counted' : `${row.source}:counted`, candidateState: row.state, withdrawn: false, hidden: false,
        check: row.mouth === null || row.auth === null ? null : { mouth: row.mouth, setup: row.setup === 1, auth: row.auth, result: row.result ?? 'unchecked', level: row.level ?? 0, formTools: row.has_form, oneTapTools: row.has_one_tap },
      });
      if (verdict.listed) listed += Number(row.n);
      else tally.set(verdict.reason, (tally.get(verdict.reason) ?? 0) + Number(row.n));
    }
    const reasons = NOAH_LISTING_REASONS.flatMap((reason) => (tally.has(reason) ? [{ reason, label: NOAH_LISTING_REASON_LABELS[reason], count: tally.get(reason)! }] : []));
    const withdrawnFamilies = (
      await db
        .prepare(
          `SELECT f.id, f.revision, f.withdrawn_at, c.name FROM noah_intake_families f JOIN noah_intake_candidates c ON c.id = f.representative_id
            WHERE f.withdrawn_at IS NOT NULL ORDER BY f.withdrawn_at DESC, f.id LIMIT ?`,
        )
        .bind(NOAH_INTAKE.withdrawnShown)
        .all<{ id: string; revision: number; withdrawn_at: number; name: string }>()
    ).results.map((row) => ({ id: row.id, name: row.name, revision: row.revision, withdrawnAt: row.withdrawn_at }));
    return { sources, table, unsupported, listing: { listed, families: await counts(), reasons }, withdrawn: withdrawnFamilies };
  }

  // -------------------------------------------------------------------------
  // 取り下げと戻し（審査者だけ。行は消さない）
  // -------------------------------------------------------------------------
  async function setWithdrawn(id: string, revision: number, withdraw: boolean) {
    if (typeof id !== 'string' || id.length < 3 || id.length > 400 || !Number.isSafeInteger(revision) || revision < 1) throw new NoahAgentError('入力を確かめてください。', 400);
    const stamp = now();
    const result = await db
      .prepare('UPDATE noah_intake_families SET withdrawn_at=?, updated_at=?, revision=revision+1 WHERE id=? AND revision=? AND (withdrawn_at IS NULL)=?')
      .bind(withdraw ? stamp : null, stamp, id, revision, withdraw ? 1 : 0)
      .run();
    forget();
    const row = await db.prepare('SELECT id, revision, withdrawn_at FROM noah_intake_families WHERE id=?').bind(id).first<{ id: string; revision: number; withdrawn_at: number | null }>();
    if (!row) throw new NoahAgentError('見つかりません。', 404);
    if (result.meta.changes !== 1) {
      // 同じ操作の送り直しは、今の状態を返す。それ以外は、他の人が先に変えている。
      if ((row.withdrawn_at !== null) === withdraw && row.revision === revision + 1) return { id: row.id, revision: row.revision, withdrawnAt: row.withdrawn_at };
      throw new NoahAgentError('他の操作で変わっています。読み直してください。', 409);
    }
    return { id: row.id, revision: row.revision, withdrawnAt: row.withdrawn_at };
  }

  return { sync, regroup, list, detail, status, counts, withdraw: (id: string, revision: number) => setWithdrawn(id, revision, true), restore: (id: string, revision: number) => setWithdrawn(id, revision, false) };
}

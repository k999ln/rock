import { canonicalJson, diffNoahConnect, sha256Hex, noahConnectSha256, looksLikeNoahSecret, parseNoahConnect, type NoahConnect } from './noah-connect-requirements.ts';
import { draftFromRegistry, noahRegistryPageUrl, noahRegistrySyncPlan, noahRegistryState, NOAH_REGISTRY, type RegistryServer } from './noah-intake-draft.ts';
import { NOAH_BULK_THRESHOLD, NOAH_REGROUP_SQL, noahRepositoryKey } from './noah-intake-family.ts';
import { NOAH_LISTING_SQL } from './noah-intake-listing.ts';
import { NOAH_PATROL_BUDGET } from './noah-intake-wake.ts';
import { intakeStatement, type IntakeDb } from './noah-intake-db.ts';
import { NOAH_PROBE } from './noah-probe.ts';

export type IntakeSource = {
  id: string; lease_id: string | null; lease_until: number; next_run_at: number;
  cursor: string | null; updated_since: string | null; sweep_started_at: number | null;
  checkpoint_at: number | null; last_full_at: number | null; last_success_at: number | null;
  failure_count: number; error_code: string | null; observed: number; withdrawn: number; request_count: number;
};
export type IntakeDependencies = {
  db: IntakeDb; now?: () => number; fetcher?: typeof fetch; origin?: string;
  budget?: typeof NOAH_PATROL_BUDGET;
  /** 握手の前に、名前を引いた先のアドレスを確かめる差し込み口。Node で動かす時だけ渡す（Workers からは、内部のアドレスへ届かない。spec-86 の 4.4）。 */
  probeCheck?: (url: URL) => Promise<void>;
};
/** 1 回の巡回の結果。skipped は、形が違って読み飛ばした記録の数（ある時だけ）。error は、台帳を読めなかった・書けなかった時の理由。 */
export type IntakeOutcome = { pages: number; seen: number; changed: number; more: boolean; skipped?: number; error?: 'unavailable' | 'rate_limited' | 'invalid_response' };
class IntakeBudgetExhausted extends Error {}
class IntakeFailure extends Error {
  readonly code: NonNullable<IntakeOutcome['error']>;
  readonly retryAt: number;
  constructor(code: IntakeFailure['code'], retryAt = 0) { super(code); this.code = code; this.retryAt = retryAt; }
}
const bytes = (text: string) => new TextEncoder().encode(text).byteLength;
const clean = (value: string, max: number) => Array.from((looksLikeNoahSecret(value) ? '[redacted]' : value).split('').filter(char => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127).join('')).slice(0, max).join('');
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
function registryRecord(value: unknown): RegistryServer {
  if (!object(value) || typeof value.name !== 'string' || !value.name || value.name.length > 287) throw new IntakeFailure('invalid_response');
  const out: Record<string, unknown> = {};
  for (const key of ['name', 'title', 'description', 'version', 'websiteUrl']) {
    if (value[key] !== undefined) {
      if (typeof value[key] !== 'string') throw new IntakeFailure('invalid_response');
      out[key] = value[key];
    }
  }
  for (const key of ['remotes', 'packages']) if (value[key] !== undefined) {
    if (!Array.isArray(value[key]) || !value[key].every(object)) throw new IntakeFailure('invalid_response');
    out[key] = value[key];
  }
  if (value.repository !== undefined) {
    if (!object(value.repository)) throw new IntakeFailure('invalid_response');
    if (typeof value.repository.url === 'string') out.repository = { url: value.repository.url };
  }
  return out as RegistryServer;
}
// Public registry entries are untrusted. Published credentials never become saved transport data.
function storedRecord(server: RegistryServer, hash: string) {
  let saved: Record<string, unknown> = { ...server };
  function redact(value: unknown): unknown {
    if (typeof value === 'string') return looksLikeNoahSecret(value) ? '[redacted]' : value;
    if (Array.isArray(value)) return value.map(redact);
    if (!object(value)) return value;
    const secret = value.isSecret === true || (typeof value.name === 'string' && /authorization|token|secret|password|api[-_]?key/i.test(value.name));
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, secret && ['value', 'default'].includes(key) ? '[redacted]' : redact(item)]));
  }
  saved = redact(saved) as Record<string, unknown>;
  if (bytes(JSON.stringify(saved)) > 65_536) {
    delete saved.remotes; delete saved.packages; saved.oversize = true;
  }
  // A pathological title/description may itself exceed the row budget.
  if (bytes(JSON.stringify(saved)) > 65_536) saved = { name: clean(server.name, 200), title: clean(server.title ?? server.name, 200), description: clean(server.description ?? '', 500), oversize: true, sha256: hash };
  return JSON.stringify(saved);
}
/**
 * 接続先に関わる項目（口・面・置き場所・接続先・通信先・サービス・鍵・モデル）が変わったか。前の接続要件を読めない時は、変わった物として扱う。
 * 接続要件は記録の hash を含むので、説明や版だけの更新でも hash は変わる。握手の記録を消すかどうかは、hash ではなく、ここで決める。
 */
function connectionChanged(previous: string | null | undefined, next: NoahConnect) {
  if (!previous) return true;
  try { return diffNoahConnect(parseNoahConnect(JSON.parse(previous)), next).reconsent; } catch { return true; }
}
/** 続けてこの回数失敗したら、進行中の巡回を捨てて、同じ印から始め直す（保存した頁の続きが、もう読めない時のため）。 */
const RESTART_AFTER_FAILURES = 6;
/** 1 頁（100 件まで）で読み飛ばしてよい記録の数。これを越えたら、台帳の形が変わった物として、その頁を失敗にする（黙って先へ進まない）。 */
const SKIP_LIMIT_PER_PAGE = 10;
/** 全件の巡回で見えなくなった候補を取り下げてよいのは、持っている有効な候補のうち、この割合（%）以上が見えた時だけ。 */
const WITHDRAW_COVERAGE_PERCENT = 90;
async function boundedPage(response: Response) {
  if (Number(response.headers.get('content-length')) > 4 * 1024 * 1024 || !response.body) { await response.body?.cancel(); throw new IntakeFailure('invalid_response'); }
  const reader = response.body.getReader(), chunks: Uint8Array[] = []; let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      length += value.byteLength; if (length > 4 * 1024 * 1024) throw new IntakeFailure('invalid_response'); chunks.push(value);
    }
    const all = new Uint8Array(length); let offset = 0; for (const chunk of chunks) { all.set(chunk, offset); offset += chunk.length; }
    const parsed: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(all));
    if (!object(parsed) || !Array.isArray(parsed.servers) || parsed.servers.length > 100 || !object(parsed.metadata)) throw new IntakeFailure('invalid_response');
    const cursor = parsed.metadata.nextCursor;
    if (cursor !== undefined && cursor !== null && (typeof cursor !== 'string' || cursor.length > 8192)) throw new IntakeFailure('invalid_response');
    return { entries: parsed.servers as unknown[], cursor: typeof cursor === 'string' && cursor ? cursor : null };
  } catch (error) {
    if (error instanceof IntakeFailure) throw error;
    throw new IntakeFailure('invalid_response');
  } finally { await reader.cancel().catch(() => {}); }
}
export function createIntakeSync(deps: IntakeDependencies) {
  const { db } = deps, now = deps.now ?? Date.now, fetcher = deps.fetcher ?? fetch, budget = deps.budget ?? NOAH_PATROL_BUDGET;
  const origin = new URL(deps.origin ?? 'https://avoado.si').origin;
  const prepare = (sql: string, ...args: (string | number | null)[]) => db.prepare(sql).bind(...args);
  function guard(lease: string) {
    // D1 batch is transactional. Deliberately invalid JSON aborts the whole batch after a lost lease.
    return prepare("SELECT CASE WHEN EXISTS(SELECT 1 FROM noah_intake_sources WHERE id='mcp-registry' AND lease_id=? AND lease_until>?) THEN 1 ELSE json('lease_lost') END", lease, now());
  }
  async function batch(statements: D1PreparedStatement[], lease: string, deadline = Infinity) {
    for (let i = 0; i < statements.length; i += 49) {
      if (now() >= deadline) throw new IntakeBudgetExhausted();
      await db.batch([guard(lease), ...statements.slice(i, i + 49)]);
    }
  }
  const regroupStatements = () => [
    ...NOAH_REGROUP_SQL.map(sql => intakeStatement(db, sql, { threshold: NOAH_BULK_THRESHOLD, now: now() })), intakeStatement(db, NOAH_LISTING_SQL.reshuffle),
    // 量産の系列は、ローンチでは載せないので、握手もしない（spec-88 の 9.7）。期限が 1 日以内の物だけを、30 日後へ送る（毎日は書き直さない）。
    prepare("UPDATE noah_intake_checks SET next_check_at=? WHERE level=0 AND next_check_at<? AND candidate_id IN (SELECT id FROM noah_intake_candidates WHERE family_id LIKE 'bulk:%')", now() + NOAH_PROBE.laterMs, now() + 86_400_000),
    // 先へ送ってあった候補が、握手の対象になった（量産の系列がほどけた・取り下げを戻した）時は、期限を今に戻す。まだ 1 回も握手していない物だけ。
    prepare(`UPDATE noah_intake_checks SET next_check_at=? WHERE result='unchecked' AND setup=0 AND mouth='mcp-remote' AND next_check_at>?
      AND candidate_id IN (SELECT c.id FROM noah_intake_candidates c JOIN noah_intake_families f ON f.id=c.family_id WHERE c.state='active' AND c.family_id NOT LIKE 'bulk:%' AND f.withdrawn_at IS NULL)`, now(), now() + 86_400_000),
  ];
  async function regroup(lease: string, deadline = Infinity) { await batch(regroupStatements(), lease, deadline); }
  const touch = (id: string) => intakeStatement(db, NOAH_LISTING_SQL.touch, { level: 0, l2_at: null, listed: 0, one_tap: 0, badge_hint: 'unverified', now: now(), candidate_id: id });
  async function savePage(entries: unknown[], lease: string, deadline: number) {
    // 形の違う記録は、その 1 件だけを読み飛ばす（1 件のために、その頁から先を読めなくしない）。読み飛ばした記録は、保存も更新もしない。
    // 台帳での状態（status）を読めない記録も読み飛ばす。「有効ではない」と読むと、台帳の形が変わった時に、読めた記録を全部取り下げてしまう。
    const parsed = await Promise.all(entries.map(async entry => {
      try {
        if (!object(entry)) return null;
        const meta = object(entry._meta) ? entry._meta['io.modelcontextprotocol.registry/official'] : undefined;
        if (!object(meta) || typeof meta.status !== 'string') return null;
        const server = registryRecord(entry.server);
        const draft = await draftFromRegistry(server);
        const hash = await sha256Hex(canonicalJson(server)), id = `mcp-registry:${server.name}`;
        const state = noahRegistryState(meta.status) === 'withdrawn' ? 'withdrawn' : draft.ok ? 'active' : 'unsupported';
        const timestamp = typeof meta.updatedAt === 'string' ? Date.parse(meta.updatedAt) : NaN;
        return { server, draft, id, hash, state, updatedAt: Number.isFinite(timestamp) ? timestamp : null, connectHash: draft.ok ? await noahConnectSha256(draft.connect) : null };
      } catch { return null; }
    }));
    const normalized = parsed.filter(row => row !== null), skipped = parsed.length - normalized.length;
    if (skipped > SKIP_LIMIT_PER_PAGE) throw new IntakeFailure('invalid_response');
    const prior = normalized.length ? (await prepare(`SELECT c.id,c.record_sha256,c.state,k.connect_sha256,k.connect_json,k.level AS check_level,f.id AS singleton,EXISTS(SELECT 1 FROM noah_intake_families p WHERE p.representative_id=c.id AND (p.listed=1 OR p.level>0)) AS published FROM noah_intake_candidates c LEFT JOIN noah_intake_checks k ON k.candidate_id=c.id LEFT JOIN noah_intake_families f ON f.id=c.id WHERE c.id IN (${normalized.map(() => '?').join(',')})`, ...normalized.map(r => r.id)).all<{ id: string; record_sha256: string; state: string; connect_sha256: string | null; connect_json: string | null; singleton: string | null; check_level: number | null; published: number }>()).results : [];
    const previous = new Map(prior.map(row => [row.id, row])), statements: D1PreparedStatement[] = []; let changed = 0;
    for (const row of normalized) {
      const { id, server, hash, draft, state, updatedAt, connectHash } = row, old = previous.get(id), time = now();
      const different = !old || old.record_sha256 !== hash || old.state !== state;
      if (different) {
        changed++;
        statements.push(prepare(`INSERT INTO noah_intake_candidates(id,source,external_key,family_id,group_key,name,summary,repository,host,record_sha256,record_json,state,reason,source_updated_at,first_seen_at,changed_at,seen_at,revision)
          VALUES(?,'mcp-registry',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)
          ON CONFLICT(id) DO UPDATE SET name=excluded.name,summary=excluded.summary,repository=excluded.repository,host=excluded.host,record_sha256=excluded.record_sha256,record_json=excluded.record_json,state=excluded.state,reason=excluded.reason,source_updated_at=excluded.source_updated_at,changed_at=excluded.changed_at,seen_at=excluded.seen_at,revision=noah_intake_candidates.revision+1`,
          id, server.name, id, server.name.split('/')[0], clean(server.title || server.name, 200), clean(server.description ?? '', 500), noahRepositoryKey(server.repository?.url), draft.ok && draft.connect.mouth === 'mcp-remote' ? draft.connect.egress[0] ?? null : null, hash, storedRecord(server, hash), state, state === 'unsupported' && !draft.ok ? draft.reason : null, updatedAt, time, time, time));
      } else statements.push(prepare('UPDATE noah_intake_candidates SET seen_at=? WHERE id=?', time, id));
      // 握手の記録を消して確かめ直すのは、接続先に関わる項目が変わった時と、有効に戻った時だけ。説明や版だけの更新では消さない（「動いた」も残る）。
      const reset = draft.ok && (!old?.connect_sha256 || (state === 'active' && old.state !== 'active') || (old.connect_sha256 !== connectHash && connectionChanged(old.connect_json, draft.connect)));
      if (draft.ok && !reset && old?.connect_sha256 !== connectHash) statements.push(prepare('UPDATE noah_intake_checks SET connect_json=?,connect_sha256=? WHERE candidate_id=?', JSON.stringify(draft.connect), connectHash, id));
      if (draft.ok && reset) {
        const c = draft.connect, setup = Number(c.secrets.length > 0);
        statements.push(prepare(`INSERT INTO noah_intake_checks(candidate_id,mouth,surface,auth,connect_json,connect_sha256,setup,level,result,next_check_at) VALUES(?,?,?,?,?,?,?,0,'unchecked',?)
          ON CONFLICT(candidate_id) DO UPDATE SET mouth=excluded.mouth,surface=excluded.surface,auth=excluded.auth,connect_json=excluded.connect_json,connect_sha256=excluded.connect_sha256,setup=excluded.setup,level=0,result='unchecked',next_check_at=excluded.next_check_at,oauth_json=NULL,tools_sha256=NULL,tool_count=NULL,read_only=NULL,form_tools=NULL,one_tap_tools=NULL,latency_ms=NULL,sample_json=NULL,checked_at=NULL,l1_at=NULL,l2_at=NULL,failures=0,first_failure_at=NULL,lease_until=0`, id, c.mouth, c.surface, setup ? 'key' : c.mouth === 'mcp-package' ? 'none' : 'unknown', JSON.stringify(c), connectHash, setup, time + (setup ? 30 * 86400000 : 0)));
      }
      if (!draft.ok && old?.connect_sha256) statements.push(prepare('DELETE FROM noah_intake_checks WHERE candidate_id=?', id));
      if (state === 'active' && !old?.singleton) statements.push(prepare("INSERT OR IGNORE INTO noah_intake_families(id,representative_id,members,level,badge_hint,listed,one_tap,shuffle,updated_at,revision) VALUES(?,?,1,0,?,0,0,abs(random()) % 1000000000,?,1)", id, id, draft.ok && draft.connect.secrets.length ? 'setup' : 'unverified', time));
      if (old?.published && (state !== 'active' || !draft.ok || old.check_level === 0 || reset)) statements.push(touch(id));
    }
    await batch(statements, lease, deadline); return { changed, seen: normalized.length, skipped };
  }
  async function sync(): Promise<IntakeOutcome> {
    const start = now(), lease = crypto.randomUUID();
    await prepare("INSERT OR IGNORE INTO noah_intake_sources(id) VALUES('mcp-registry')").run();
    let source = await prepare(`UPDATE noah_intake_sources SET lease_id=?,lease_until=?,last_attempt_at=? WHERE id='mcp-registry' AND lease_until<? AND ((sweep_started_at IS NOT NULL AND error_code IS NULL) OR next_run_at<=?) RETURNING *`, lease, start + 60000, start, start, start).first<IntakeSource>();
    if (!source) return { pages: 0, seen: 0, changed: 0, more: false };
    let pages = 0, seen = 0, changed = 0, skipped = 0;
    // 読み飛ばした記録がある時だけ、数を返す。
    const done = (more: boolean): IntakeOutcome => ({ pages, seen, changed, more, ...(skipped ? { skipped } : {}) });
    try {
      if (source.sweep_started_at === null) {
        const plan = noahRegistrySyncPlan({ now: start, checkpoint: source.checkpoint_at, lastFullAt: source.last_full_at });
        await batch([prepare("UPDATE noah_intake_sources SET sweep_started_at=?,updated_since=?,cursor=NULL,observed=0,withdrawn=0,error_code=NULL,next_run_at=? WHERE id='mcp-registry'", start, plan.updatedSince === null ? null : new Date(plan.updatedSince).toISOString(), start + NOAH_REGISTRY.everyMs)], lease);
        source = { ...source, sweep_started_at: start, updated_since: plan.updatedSince === null ? null : new Date(plan.updatedSince).toISOString(), cursor: null, observed: 0 };
      }
      const end = Math.min(start + budget.seconds * 1000, start + 55_000);
      while (pages < budget.pages && now() < end) {
        const url = noahRegistryPageUrl({ cursor: source.cursor, updatedSince: source.updated_since === null ? null : Date.parse(source.updated_since) });
        await batch([prepare("UPDATE noah_intake_sources SET request_count=request_count+1 WHERE id='mcp-registry'")], lease);
        const response = await fetcher(url, { redirect: 'manual', headers: { 'User-Agent': `NoahBot/1 (+${origin}/noah/help#bot)`, Accept: 'application/json' }, signal: AbortSignal.timeout(Math.max(1, Math.min(20_000, end - now()))) });
        if (!response.ok) {
          const retry = response.headers.get('retry-after'), delay = retry && /^\d+$/.test(retry) ? now() + Number(retry) * 1000 : Date.parse(retry ?? '');
          await response.body?.cancel(); throw new IntakeFailure(response.status === 429 ? 'rate_limited' : 'unavailable', Number.isFinite(delay) ? delay : 0);
        }
        const page = await boundedPage(response);
        if (page.cursor && page.cursor === source.cursor) throw new IntakeFailure('invalid_response');
        const saved = await savePage(page.entries, lease, end); pages++; seen += saved.seen; changed += saved.changed; skipped += saved.skipped;
        // This checkpoint follows every successful page write. A partial batch failure replays the page safely.
        // 頁を書けたら、続けて失敗した回数を戻す（失敗の後の待ち時間と、始め直しは、続けて失敗した回数で決める）。
        if (page.cursor) {
          await batch([prepare("UPDATE noah_intake_sources SET cursor=?,observed=observed+?,error_code=NULL,failure_count=0 WHERE id='mcp-registry'", page.cursor, saved.seen)], lease);
          source.failure_count = 0;
        }
        source.cursor = page.cursor; source.observed += saved.seen;
        if (!page.cursor) {
          const full = source.updated_since === null, sweep = source.sweep_started_at!;
          if (full) {
            // 取り下げるのは、全件の巡回で見えなくなった候補。ただし、持っている有効な候補（この巡回より前から知っている物）の 9 割以上が見えた時だけ。
            // 比べる相手は、表にある候補。前の巡回の件数とは比べない（台帳が、半分だけ・空の一覧を続けて返しても、次の巡回で全部を取り下げない）。
            const held = (await prepare("SELECT COUNT(*) AS known,COALESCE(SUM(CASE WHEN seen_at>=? THEN 1 ELSE 0 END),0) AS seen FROM noah_intake_candidates WHERE source='mcp-registry' AND state='active' AND first_seen_at<?", sweep, sweep).first<{ known: number; seen: number }>())!;
            if (held.seen * 100 >= held.known * WITHDRAW_COVERAGE_PERCENT) await batch([
              prepare("UPDATE noah_intake_candidates SET state='withdrawn',reason=NULL,revision=revision+1,changed_at=? WHERE source='mcp-registry' AND state='active' AND seen_at<?", now(), sweep),
              prepare("UPDATE noah_intake_families SET listed=0,one_tap=0,level=0,l2_at=NULL,badge_hint='unverified',updated_at=?,revision=revision+1 WHERE representative_id IN (SELECT id FROM noah_intake_candidates WHERE state='withdrawn') AND (listed<>0 OR level<>0)", now()),
              prepare("UPDATE noah_intake_sources SET withdrawn=(SELECT COUNT(*) FROM noah_intake_candidates WHERE source='mcp-registry' AND state='withdrawn' AND seen_at<?) WHERE id='mcp-registry'", sweep),
            ], lease);
          }
          if (full || source.last_success_at === null || Math.floor(source.last_success_at / 86400000) !== Math.floor(now() / 86400000)) await regroup(lease, end);
          await batch([prepare("UPDATE noah_intake_sources SET observed=?,checkpoint_at=?,last_full_at=CASE WHEN ?=1 THEN ? ELSE last_full_at END,sweep_started_at=NULL,updated_since=NULL,cursor=NULL,last_success_at=?,next_run_at=?,failure_count=0,error_code=NULL,lease_id=NULL,lease_until=0 WHERE id='mcp-registry'", source.observed, sweep, Number(full), sweep, now(), sweep + NOAH_REGISTRY.everyMs)], lease);
          return done(false);
        }
      }
      await batch([prepare("UPDATE noah_intake_sources SET lease_id=NULL,lease_until=0,error_code=NULL WHERE id='mcp-registry'")], lease);
      return done(true);
    } catch (error) {
      if (error instanceof IntakeBudgetExhausted) {
        await prepare("UPDATE noah_intake_sources SET lease_id=NULL,lease_until=0,error_code=NULL WHERE id='mcp-registry' AND lease_id=?", lease).run();
        return done(true);
      }
      const failure = error instanceof IntakeFailure ? error : new IntakeFailure('unavailable');
      const failures = source.failure_count + 1, delay = Math.min(2 ** Math.min(failures, 20) * 60000, 6 * 3600000);
      // 進行中の巡回の列は消さない（次の合図が、同じ updated_since と cursor から続ける）。続けて失敗した時だけ、始め直す。
      // 「混んでいる」（429）では始め直さない（読み直す分だけ、相手への通信が増える）。
      const restart = Number(failure.code !== 'rate_limited' && failures >= RESTART_AFTER_FAILURES);
      await prepare("UPDATE noah_intake_sources SET error_code=?,failure_count=?,next_run_at=?,lease_id=NULL,lease_until=0,sweep_started_at=CASE WHEN ?=1 THEN NULL ELSE sweep_started_at END,updated_since=CASE WHEN ?=1 THEN NULL ELSE updated_since END,cursor=CASE WHEN ?=1 THEN NULL ELSE cursor END WHERE id='mcp-registry' AND lease_id=?", failure.code, failures, Math.max(now() + delay, failure.retryAt), restart, restart, restart, lease).run();
      return { ...done(true), error: failure.code };
    }
  }
  return { sync, regroup };
}

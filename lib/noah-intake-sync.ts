import { canonicalJson, sha256Hex, noahConnectSha256, looksLikeNoahSecret } from './noah-connect-requirements.ts';
import { draftFromRegistry, noahRegistryPageUrl, noahRegistrySyncPlan, noahRegistryState, NOAH_REGISTRY, type RegistryServer } from './noah-intake-draft.ts';
import { NOAH_BULK_THRESHOLD, NOAH_REGROUP_SQL, noahRepositoryKey } from './noah-intake-family.ts';
import { NOAH_LISTING_SQL } from './noah-intake-listing.ts';
import { NOAH_PATROL_BUDGET } from './noah-intake-wake.ts';
import { intakeStatement, type IntakeDb } from './noah-intake-db.ts';

export type IntakeSource = {
  id: string; lease_id: string | null; lease_until: number; next_run_at: number;
  cursor: string | null; updated_since: string | null; sweep_started_at: number | null;
  checkpoint_at: number | null; last_full_at: number | null; last_success_at: number | null;
  failure_count: number; error_code: string | null; observed: number; withdrawn: number; request_count: number;
};
export type IntakeDependencies = {
  db: IntakeDb; now?: () => number; fetcher?: typeof fetch; origin?: string;
  budget?: typeof NOAH_PATROL_BUDGET;
};
class IntakeFailure extends Error {
  readonly code: 'unavailable' | 'rate_limited' | 'invalid_response';
  readonly retryAt: number;
  constructor(code: IntakeFailure['code'], retryAt = 0) { super(code); this.code = code; this.retryAt = retryAt; }
}
const bytes = (text: string) => new TextEncoder().encode(text).byteLength;
const clean = (value: string, max: number) => Array.from((looksLikeNoahSecret(value) ? '[redacted]' : value).replace(/[\u0000-\u001f\u007f]/g, '')).slice(0, max).join('');
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
  if (looksLikeNoahSecret(canonicalJson(saved))) {
    saved = JSON.parse(JSON.stringify(saved, (_key, value: unknown) => typeof value === 'string' && looksLikeNoahSecret(value) ? '[redacted]' : value)) as Record<string, unknown>;
  }
  if (bytes(JSON.stringify(saved)) > 65_536) {
    delete saved.remotes; delete saved.packages; saved.oversize = true;
  }
  // A pathological title/description may itself exceed the row budget.
  if (bytes(JSON.stringify(saved)) > 65_536) saved = { name: clean(server.name, 200), title: clean(server.title ?? server.name, 200), description: clean(server.description ?? '', 500), oversize: true, sha256: hash };
  return JSON.stringify(saved);
}
async function boundedPage(response: Response) {
  if (Number(response.headers.get('content-length')) > 4 * 1024 * 1024 || !response.body) throw new IntakeFailure('invalid_response');
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
  async function batch(statements: D1PreparedStatement[], lease: string) {
    for (let i = 0; i < statements.length; i += 49) await db.batch([guard(lease), ...statements.slice(i, i + 49)]);
  }
  const regroupStatements = () => [...NOAH_REGROUP_SQL.map(sql => intakeStatement(db, sql, { threshold: NOAH_BULK_THRESHOLD, now: now() })), intakeStatement(db, NOAH_LISTING_SQL.reshuffle)];
  async function regroup(lease: string) { await batch(regroupStatements(), lease); }
  const touch = (id: string) => intakeStatement(db, NOAH_LISTING_SQL.touch, { level: 0, l2_at: null, listed: 0, one_tap: 0, badge_hint: 'unverified', now: now(), candidate_id: id });
  async function savePage(entries: unknown[], lease: string) {
    const normalized = await Promise.all(entries.map(async entry => {
      if (!object(entry) || !object(entry._meta) || !object(entry._meta['io.modelcontextprotocol.registry/official'])) throw new IntakeFailure('invalid_response');
      const meta = entry._meta['io.modelcontextprotocol.registry/official'], server = registryRecord(entry.server);
      let draft; try { draft = await draftFromRegistry(server); } catch { throw new IntakeFailure('invalid_response'); }
      const hash = await sha256Hex(canonicalJson(server)), id = `mcp-registry:${server.name}`;
      const state = noahRegistryState(meta.status) === 'withdrawn' ? 'withdrawn' : draft.ok ? 'active' : 'unsupported';
      const timestamp = typeof meta.updatedAt === 'string' ? Date.parse(meta.updatedAt) : NaN;
      return { server, draft, id, hash, state, updatedAt: Number.isFinite(timestamp) ? timestamp : null, connectHash: draft.ok ? await noahConnectSha256(draft.connect) : null };
    }));
    const prior = normalized.length ? (await prepare(`SELECT c.id,c.record_sha256,c.state,k.connect_sha256,f.id AS singleton FROM noah_intake_candidates c LEFT JOIN noah_intake_checks k ON k.candidate_id=c.id LEFT JOIN noah_intake_families f ON f.id=c.id WHERE c.id IN (${normalized.map(() => '?').join(',')})`, ...normalized.map(r => r.id)).all<{ id: string; record_sha256: string; state: string; connect_sha256: string | null; singleton: string | null }>()).results : [];
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
      if (draft.ok && (old?.connect_sha256 !== connectHash || (state === 'active' && old?.state !== 'active'))) {
        const c = draft.connect, setup = Number(c.secrets.length > 0);
        statements.push(prepare(`INSERT INTO noah_intake_checks(candidate_id,mouth,surface,auth,connect_json,connect_sha256,setup,level,result,next_check_at) VALUES(?,?,?,?,?,?,?,0,'unchecked',?)
          ON CONFLICT(candidate_id) DO UPDATE SET mouth=excluded.mouth,surface=excluded.surface,auth=excluded.auth,connect_json=excluded.connect_json,connect_sha256=excluded.connect_sha256,setup=excluded.setup,level=0,result='unchecked',next_check_at=excluded.next_check_at,oauth_json=NULL,tools_sha256=NULL,tool_count=NULL,read_only=NULL,form_tools=NULL,one_tap_tools=NULL,latency_ms=NULL,sample_json=NULL,checked_at=NULL,l1_at=NULL,l2_at=NULL,failures=0,first_failure_at=NULL,lease_until=0`, id, c.mouth, c.surface, setup ? 'key' : c.mouth === 'mcp-package' ? 'none' : 'unknown', JSON.stringify(c), connectHash, setup, time + (setup ? 30 * 86400000 : 0)));
        if (old) statements.push(touch(id));
      }
      if (!draft.ok && old?.connect_sha256) statements.push(prepare('DELETE FROM noah_intake_checks WHERE candidate_id=?', id));
      if (state === 'active' && !old?.singleton) statements.push(prepare("INSERT OR IGNORE INTO noah_intake_families(id,representative_id,members,level,badge_hint,listed,one_tap,shuffle,updated_at,revision) VALUES(?,?,1,0,?,0,0,abs(random()) % 1000000000,?,1)", id, id, draft.ok && draft.connect.secrets.length ? 'setup' : 'unverified', time));
      if (state !== 'active' && different) statements.push(touch(id));
    }
    await batch(statements, lease); return { changed, seen: normalized.length };
  }
  async function sync() {
    const start = now(), lease = crypto.randomUUID();
    await prepare("INSERT OR IGNORE INTO noah_intake_sources(id) VALUES('mcp-registry')").run();
    let source = await prepare(`UPDATE noah_intake_sources SET lease_id=?,lease_until=?,last_attempt_at=? WHERE id='mcp-registry' AND lease_until<? AND ((sweep_started_at IS NOT NULL AND error_code IS NULL) OR next_run_at<=?) RETURNING *`, lease, start + 60000, start, start, start).first<IntakeSource>();
    if (!source) return { pages: 0, seen: 0, changed: 0, more: false };
    let pages = 0, seen = 0, changed = 0;
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
        const saved = await savePage(page.entries, lease); pages++; seen += saved.seen; changed += saved.changed;
        // This checkpoint follows every successful page write. A partial batch failure replays the page safely.
        if (page.cursor) await batch([prepare("UPDATE noah_intake_sources SET cursor=?,observed=observed+?,error_code=NULL WHERE id='mcp-registry'", page.cursor, saved.seen)], lease);
        source.cursor = page.cursor; source.observed += saved.seen;
        if (!page.cursor) {
          const full = source.updated_since === null, sweep = source.sweep_started_at!;
          if (full) {
            // Durable comparison with the previous successful full sweep, including across wake resumptions.
            const previous = source.last_full_at === null ? 0 : (await prepare("SELECT COUNT(*) AS n FROM noah_intake_candidates WHERE source='mcp-registry' AND seen_at>=?", source.last_full_at).first<{ n: number }>())!.n;
            if (source.observed >= previous * 0.9) await batch([
              prepare("UPDATE noah_intake_candidates SET state='withdrawn',reason=NULL,revision=revision+1,changed_at=? WHERE source='mcp-registry' AND state='active' AND seen_at<?", now(), sweep),
              prepare("UPDATE noah_intake_families SET listed=0,one_tap=0,level=0,l2_at=NULL,badge_hint='unverified',updated_at=?,revision=revision+1 WHERE representative_id IN (SELECT id FROM noah_intake_candidates WHERE state='withdrawn') AND (listed<>0 OR level<>0)", now()),
              prepare("UPDATE noah_intake_sources SET withdrawn=(SELECT COUNT(*) FROM noah_intake_candidates WHERE source='mcp-registry' AND state='withdrawn' AND seen_at<?) WHERE id='mcp-registry'", sweep),
            ], lease);
          }
          if (full || source.last_success_at === null || Math.floor(source.last_success_at / 86400000) !== Math.floor(now() / 86400000)) await regroup(lease);
          await batch([prepare("UPDATE noah_intake_sources SET observed=?,checkpoint_at=?,last_full_at=CASE WHEN ?=1 THEN ? ELSE last_full_at END,sweep_started_at=NULL,updated_since=NULL,cursor=NULL,last_success_at=?,next_run_at=?,failure_count=0,error_code=NULL,lease_id=NULL,lease_until=0 WHERE id='mcp-registry'", source.observed, sweep, Number(full), sweep, now(), sweep + NOAH_REGISTRY.everyMs)], lease);
          return { pages, seen, changed, more: false };
        }
      }
      await batch([prepare("UPDATE noah_intake_sources SET lease_id=NULL,lease_until=0,error_code=NULL WHERE id='mcp-registry'")], lease);
      return { pages, seen, changed, more: true };
    } catch (error) {
      const failure = error instanceof IntakeFailure ? error : new IntakeFailure('unavailable');
      const delay = Math.min(2 ** Math.min(source.failure_count + 1, 20) * 60000, 6 * 3600000);
      await prepare("UPDATE noah_intake_sources SET error_code=?,failure_count=failure_count+1,next_run_at=?,lease_id=NULL,lease_until=0 WHERE id='mcp-registry' AND lease_id=?", failure.code, Math.max(now() + delay, failure.retryAt), lease).run();
      return { pages, seen, changed, more: true, error: failure.code };
    }
  }
  return { sync, regroup };
}

/**
 * 巡回での握手（probeDue）。期限の来た候補を取り、同じ接続先へは 1 時間に 1 回までにして握手し、結果を握手の表へ書いて、系列へ写す。
 *
 * 握手するのは、相手のサーバーで動き、本人の鍵の入力が要らない、有効な候補だけ。量産の系列と、取り下げた系列は握手しない。
 * 道具は呼ばない。道具の定義の本文は保存しない（hash と数だけ）。401 を受けても、相手の許可の公開情報は探さない。
 * 別の接続先への転送には従わない（createNoahGuardedFetch の sameHost）。名乗りは NoahBot/1。
 * 仕様: docs/noah/spec-86-remote-mouth.md の 6 章・10.3、spec-88-mass-probe.md の 9.3・9.4・9.7・9.8。
 */
import { intakeStatement } from './noah-intake-db.ts';
import { noahListing, NOAH_LISTING_SQL, type NoahListingInput } from './noah-intake-listing.ts';
import type { IntakeDependencies } from './noah-intake-sync.ts';
import { NOAH_PATROL_BUDGET } from './noah-intake-wake.ts';
import { createNoahGuardedFetch, type NoahHandshakeSnapshot, type NoahMouthContext } from './noah-mouth-mcp-remote.ts';
import { NOAH_PROBE, planNoahProbeWrite, probeL1, type NoahCheckState, type NoahProbeOutcome, type NoahProbeWrite } from './noah-probe.ts';

/** 合図 1 回の握手の数（合図の 1 行に出す。接続先の名前は持たない）。 */
export type IntakeProbeCounts = { probes: number; ok: number; authRequired: number; unreachable: number; rateLimited: number; skippedHost: number; toolsChanged: number };
export const noProbes = (): IntakeProbeCounts => ({ probes: 0, ok: 0, authRequired: 0, unreachable: 0, rateLimited: 0, skippedHost: 0, toolsChanged: 0 });

/** 1 回の合図で取る候補は、握手の数の何倍までか（握手の対象でない物・同じ接続先の物を、その場で先へ送るため）。 */
const CLAIM_FACTOR = 4;
/** 1 回に取る候補の上限（D1 は、1 文に結べる値が 100 個まで。取った候補の ID を、1 文に並べる）。 */
const CLAIM_MAX = 90;
/** 接続先の枠を取り直す回数（同じ接続先の候補が続いた時に、握手の数が減りすぎないように）。 */
const MAX_ROUNDS = 4;

/** 握手の表（noah_intake_checks）の行のうち、握手が読む列。 */
export type NoahCheckRow = {
  candidate_id: string; mouth: string; connect_json: string; auth: NoahCheckState['auth']; level: 0 | 1 | 2; result: NoahCheckState['result'];
  tools_sha256: string | null; tool_count: number | null; read_only: number | null; form_tools: number | null; one_tap_tools: number | null;
  latency_ms: number | null; checked_at: number | null; l1_at: number | null; l2_at: number | null; next_check_at: number; failures: number; first_failure_at: number | null;
};
export const NOAH_CHECK_COLUMNS = 'candidate_id,mouth,connect_json,auth,level,result,tools_sha256,tool_count,read_only,form_tools,one_tap_tools,latency_ms,checked_at,l1_at,l2_at,next_check_at,failures,first_failure_at';
/** 握手の表の行を、握手の結果を当てる前の状態（planNoahProbeWrite の previous）へ直す。 */
export const noahCheckState = (row: NoahCheckRow): NoahCheckState => ({
  level: row.level, result: row.result, auth: row.auth, toolsSha256: row.tools_sha256, toolCount: row.tool_count,
  readOnly: row.read_only === null ? null : row.read_only === 1, formTools: row.form_tools, oneTapTools: row.one_tap_tools,
  latencyMs: row.latency_ms, checkedAt: row.checked_at, l1At: row.l1_at, l2At: row.l2_at, nextCheckAt: row.next_check_at, failures: row.failures, firstFailureAt: row.first_failure_at,
});
/** 候補と、その候補が今いる系列。connected は、その系列へつないでいる人が居るか（居れば、24 時間ごとに確かめ直す。spec-88 の 9.3）。 */
export type NoahProbeFamily = {
  id: string; source: NoahListingInput['source']; state: string; family_id: string; host: string | null;
  representative_id: string | null; withdrawn_at: number | null; hidden_at: number | null; connected: number;
  family_level: number | null; family_l2_at: number | null; family_badge: string | null; family_listed: number | null; family_one_tap: number | null;
};
type Claimed = NoahCheckRow;
type Family = NoahProbeFamily;
type Target = { row: Claimed; family: Family; url: string; host: string };

// 取る条件は、索引 noah_intake_checks_due の条件と同じ形で書く（索引で、期限の早い順に読む）。
const CLAIM = `UPDATE noah_intake_checks SET lease_until=?
 WHERE candidate_id IN (SELECT candidate_id FROM noah_intake_checks WHERE setup = 0 AND mouth IN ('mcp-remote','space-mcp','a2a') AND next_check_at <= ? AND lease_until < ? ORDER BY next_check_at LIMIT ?)
 RETURNING ${NOAH_CHECK_COLUMNS}`;
// つないでいる人が居るかは、接続の表を、その時に見る（系列の行に数を別に持つと、ずれる。索引 noah_connections_family）。
export const NOAH_PROBE_FAMILY = `SELECT c.id,c.source,c.state,c.family_id,c.host,f.representative_id,f.withdrawn_at,f.hidden_at,
 EXISTS(SELECT 1 FROM noah_connections n WHERE n.family_key=c.family_id AND n.state='connected') AS connected,
 f.level AS family_level,f.l2_at AS family_l2_at,f.badge_hint AS family_badge,f.listed AS family_listed,f.one_tap AS family_one_tap
 FROM noah_intake_candidates c LEFT JOIN noah_intake_families f ON f.id=c.family_id WHERE c.id IN `;
const FAMILY = NOAH_PROBE_FAMILY;
// 同じ接続先へ、巡回が握手するのは 1 時間に 1 回まで。相手が「混んでいる」と返した後は、その時刻（not_before）まで送らない。書けた行が 1 なら、握手してよい。
const HOST_TAKE = `INSERT INTO noah_probe_hosts(host,last_probe_at) VALUES(?,?)
 ON CONFLICT(host) DO UPDATE SET last_probe_at=excluded.last_probe_at WHERE noah_probe_hosts.last_probe_at <= ? AND noah_probe_hosts.not_before <= ?`;
const WRITE = `UPDATE noah_intake_checks SET level=?,result=?,auth=?,tools_sha256=?,tool_count=?,read_only=?,form_tools=?,one_tap_tools=?,latency_ms=?,
 checked_at=?,l1_at=?,l2_at=?,next_check_at=?,failures=?,first_failure_at=?,lease_until=0 WHERE candidate_id=? AND lease_until=?`;

/** 握手の対象か。対象なら、接続先の URL と、間隔を数える host を返す。 */
function target(row: Claimed, family: Family | undefined): { url: string; host: string } | null {
  if (!family || family.state !== 'active' || row.mouth !== 'mcp-remote' || family.family_id.startsWith('bulk:') || family.withdrawn_at !== null) return null;
  try {
    const connect = JSON.parse(row.connect_json) as { target?: { url?: unknown } };
    if (typeof connect.target?.url !== 'string') return null;
    return { url: connect.target.url, host: new URL(connect.target.url).hostname.toLowerCase() };
  } catch {
    return null;
  }
}

/**
 * 握手の表に書いた値を、その候補が代表の系列へ写す文（次の名寄せを待たない）。書く事が無ければ空。
 * 巡回の握手（下の save）と、利用者の操作から始めた握手が 401・402 を受けた時（lib/noah-user-handshake.ts）が、同じ決まりで写す。
 */
export function noahFamilyWrites(db: IntakeDependencies['db'], family: NoahProbeFamily, candidateId: string, write: NoahProbeWrite, at: number): D1PreparedStatement[] {
  // 系列の行を書くのは、その候補が、今の系列の代表の時だけ。
  if (family.representative_id !== candidateId) return [];
  const prepare = (sql: string, ...args: (string | number | null)[]) => db.prepare(sql).bind(...args);
  const statements: D1PreparedStatement[] = [], s = write.state, hidden = family.hidden_at !== null;
  if (write.hide && !hidden) statements.push(prepare('UPDATE noah_intake_families SET hidden_at=?,updated_at=?,revision=revision+1 WHERE id=? AND representative_id=? AND hidden_at IS NULL', at, at, family.family_id, candidateId));
  if (write.unhide && hidden) statements.push(prepare('UPDATE noah_intake_families SET hidden_at=NULL,updated_at=?,revision=revision+1 WHERE id=? AND representative_id=? AND hidden_at IS NOT NULL', at, family.family_id, candidateId));
  // 系列の行の値は、名寄せの SQL と同じ決まりで出す（隠した印・取り下げの印は、別の列。ここでは見ない）。
  const listing = noahListing({ source: family.source, familyId: family.family_id, candidateState: 'active', withdrawn: false, hidden: false,
    check: { mouth: 'mcp-remote', setup: false, auth: s.auth, result: s.result, level: s.level, formTools: s.formTools, oneTapTools: s.oneTapTools } });
  const want = { level: s.level, l2_at: s.level === 2 ? s.l2At : null, badge_hint: s.level < 2 ? 'unverified' : s.auth === 'oauth' ? 'taps' : 'one_click', listed: Number(listing.listed), one_tap: Number((s.oneTapTools ?? 0) >= 1) };
  const same = family.family_level === want.level && family.family_l2_at === want.l2_at && family.family_badge === want.badge_hint && family.family_listed === want.listed && family.family_one_tap === want.one_tap;
  if (!same) statements.push(intakeStatement(db, NOAH_LISTING_SQL.touch, { ...want, now: at, candidate_id: candidateId }));
  return statements;
}

export function createIntakeProbe(deps: IntakeDependencies) {
  const { db } = deps, now = deps.now ?? Date.now, budget = deps.budget ?? NOAH_PATROL_BUDGET;
  const origin = new URL(deps.origin ?? 'https://avoado.si').origin;
  const prepare = (sql: string, ...args: (string | number | null)[]) => db.prepare(sql).bind(...args);
  const ctx: NoahMouthContext = {
    // 接続先の検査を通した fetch。別の接続先への転送には従わない。
    fetch: createNoahGuardedFetch(deps.fetcher ?? fetch, { sameHost: true, ...(deps.probeCheck ? { check: deps.probeCheck } : {}) }),
    // 定期の確かめである事を、相手が見分けられるように名乗る。
    headers: async () => ({ 'user-agent': `NoahBot/1 (+${origin}/noah/help#bot)` }),
  };
  const marks = (ids: string[]) => `(${ids.map(() => '?').join(',')})`;

  /**
   * 握手を、budget.probes 件まで行う（同時に budget.concurrent 件まで）。deadline は、合図 1 回の終わりの時刻。
   * 握手 1 件の待ち（NOAH_PROBE.timeoutMs）が残っていない時は、新しい握手を始めない（残りは次の合図）。
   */
  async function probeDue(deadline: number): Promise<IntakeProbeCounts> {
    const counts = noProbes();
    const room = () => now() + NOAH_PROBE.timeoutMs <= deadline;
    if (budget.probes < 1 || budget.concurrent < 1 || !room()) return counts;
    // 取り置きの値は、この合図だけの物にする（結果を書く時に、同じ値である事を確かめる）。
    const lease = now() + NOAH_PROBE.leaseMs + Math.floor(Math.random() * 1000);
    const claimed = (await prepare(CLAIM, lease, now(), now(), Math.min(budget.probes * CLAIM_FACTOR, CLAIM_MAX)).all<Claimed>()).results;
    if (!claimed.length) return counts;
    // RETURNING の順は決まっていない。期限の早い順に並べ直す。
    claimed.sort((a, b) => a.next_check_at - b.next_check_at || (a.candidate_id < b.candidate_id ? -1 : 1));
    const ids = claimed.map(row => row.candidate_id);
    const families = new Map((await prepare(FAMILY + marks(ids), ...ids).all<Family>()).results.map(row => [row.id, row]));

    const later: string[] = [], busy: string[] = [], queue: Target[] = [];
    for (const row of claimed) {
      const family = families.get(row.candidate_id), found = target(row, family);
      if (found && family) queue.push({ row, family, ...found }); else later.push(row.candidate_id);
    }
    const tried = new Set<string>();
    for (let round = 0; round < MAX_ROUNDS && counts.probes < budget.probes && queue.length && room(); round++) {
      const group: Target[] = [];
      while (queue.length && group.length < Math.min(budget.concurrent, budget.probes - counts.probes)) {
        const next = queue.shift()!;
        // 同じ接続先の候補が、この合図の中で続いた時は、枠を取りに行かない。
        if (tried.has(next.host)) { busy.push(next.row.candidate_id); counts.skippedHost++; continue; }
        tried.add(next.host); group.push(next);
      }
      if (!group.length) break;
      const at = now();
      const taken = await db.batch(group.map(item => prepare(HOST_TAKE, item.host, at, at - NOAH_PROBE.hostEveryMs, at)));
      const going = group.filter((item, index) => {
        if (taken[index]?.meta.changes === 1) return true;
        busy.push(item.row.candidate_id); counts.skippedHost++; return false;
      });
      if (!going.length) continue;
      const outcomes = await Promise.all(going.map(async item => {
        let handshake: NoahHandshakeSnapshot | undefined;
        const outcome = await probeL1(item.url, ctx, now, (snapshot) => { handshake = snapshot; });
        return { outcome, handshake };
      }));
      counts.probes += going.length;
      await save(going, outcomes, lease, counts);
    }
    // 握手しなかった物の取り置きを放す。対象でない物は 30 日後、同じ接続先を握手したばかりの物は 1 時間後へ送る。残りは、期限をそのままにする。
    const rest = queue.map(item => item.row.candidate_id), at = now(), release: D1PreparedStatement[] = [];
    if (later.length) release.push(prepare(`UPDATE noah_intake_checks SET next_check_at=?,lease_until=0 WHERE lease_until=? AND candidate_id IN ${marks(later)}`, at + NOAH_PROBE.laterMs, lease, ...later));
    if (busy.length) release.push(prepare(`UPDATE noah_intake_checks SET next_check_at=?,lease_until=0 WHERE lease_until=? AND candidate_id IN ${marks(busy)}`, at + NOAH_PROBE.hostEveryMs, lease, ...busy));
    if (rest.length) release.push(prepare(`UPDATE noah_intake_checks SET lease_until=0 WHERE lease_until=? AND candidate_id IN ${marks(rest)}`, lease, ...rest));
    if (release.length) await db.batch(release);
    return counts;
  }

  /** 握手の結果を握手の表へ書き、書けた物だけを、その候補が代表の系列へ写す（次の名寄せを待たない）。 */
  async function save(going: Target[], outcomes: { outcome: NoahProbeOutcome; handshake?: NoahHandshakeSnapshot }[], lease: number, counts: IntakeProbeCounts) {
    const at = now();
    const writes = going.map((item, index) => planNoahProbeWrite(noahCheckState(item.row), outcomes[index].outcome, { now: at, connected: item.family.connected === 1 }));
    const first: D1PreparedStatement[] = [];
    for (const [index, write] of writes.entries()) {
      const s = write.state, item = going[index];
      first.push(prepare(WRITE, s.level, s.result, s.auth, s.toolsSha256, s.toolCount, s.readOnly === null ? null : Number(s.readOnly), s.formTools, s.oneTapTools, s.latencyMs,
        s.checkedAt, s.l1At, s.l2At, s.nextCheckAt, s.failures, s.firstFailureAt, item.row.candidate_id, lease));
    }
    // 相手が「混んでいる」と返した接続先は、その時刻まで、巡回も、利用者の操作から始める握手も待つ。
    for (const [index, write] of writes.entries()) if (write.hostWaitUntil !== null) first.push(intakeStatement(db, NOAH_LISTING_SQL.host_wait, { host: going[index].host, until: write.hostWaitUntil }));
    const written = await db.batch(first);

    const second: D1PreparedStatement[] = [];
    const captures: { familyId: string; candidateId: string; toolsSha256: string; tools: NoahHandshakeSnapshot['tools'] }[] = [];
    for (const [index, write] of writes.entries()) {
      // 取り置きが変わっていた（取り込みが握手の記録を消した・別の合図が取り直した）結果は、書かれていない。系列にも写さない。
      if (written[index]?.meta.changes !== 1) continue;
      const s = write.state, { family, row } = going[index];
      if (s.result === 'ok') counts.ok++;
      else if (s.result === 'auth_required') counts.authRequired++;
      else if (s.result === 'unreachable') counts.unreachable++;
      else if (s.result === 'rate_limited') counts.rateLimited++;
      if (write.toolsChanged) counts.toolsChanged++;
      second.push(...noahFamilyWrites(db, family, row.candidate_id, write, at));
      const snapshot = outcomes[index].handshake;
      // Keep raw provider metadata out of D1.  Capture only a successful,
      // committed representative handshake, and only when the summary hash
      // matches the definitions that were observed in that handshake.
      if (s.result === 'ok' && family.representative_id === row.candidate_id && snapshot && snapshot.toolsSha256 === s.toolsSha256) {
        captures.push({ familyId: family.family_id, candidateId: row.candidate_id, toolsSha256: snapshot.toolsSha256, tools: snapshot.tools });
      }
    }
    if (second.length) await db.batch(second);
    // This callback is deliberately after both DB batches.  A local writer
    // failure must not make an already committed patrol result roll back or
    // make the next patrol repeat a network request.
    if (captures.length && deps.onCommittedRepresentativeHandshake) {
      await Promise.all(captures.map(async (capture) => {
        try { await deps.onCommittedRepresentativeHandshake!(capture); } catch { /* optional local capture */ }
      }));
    }
  }

  return { probeDue };
}

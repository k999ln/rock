/**
 * 見張る数（運営の画面の「取り込み」の節に出す）。出してよいか（docs/noah/mvp-launch.md の G2・G4）と、出した後の調子を、決まった数で見る。
 *
 * - 審査者だけが読む（入口は GET /api/noah/intake?state=1 の `launch`）。
 * - 出すのは、数だけ。本人の ID・依頼の中身・接続先の URL は出さない。接続先の名前（host）を出すのは、「失敗の多い接続先」の行だけで、
 *   依頼が 5 件以上ある接続先に限る（少ない数から、誰の依頼かが分からないように）。
 * - 問い合わせは、1 回の batch で送る（D1 への往復は 1）。結果は 5 分間、同じ値を返す（数えた時刻を、一緒に返す）。
 * 仕様: docs/noah/spec-97-launch-ops.md の 6 章。
 */
import type { NoahFlags } from './noah-flags.ts';
import type { IntakeDependencies } from './noah-intake-sync.ts';
import { NOAH_PROBE } from './noah-probe.ts';

/** 数値は候補。 */
export const NOAH_LAUNCH_STATUS = {
  /** 同じ値を返してよい時間。 */
  cacheMs: 5 * 60_000,
  /** 台帳の巡回が、これより長く、成功も・読み取りの開始もしていなければ、「止まっています」と出す（台帳は 1 時間ごとに読む。全件の読み直しは約 70 分）。 */
  stalledMs: 2 * 3_600_000,
  /**
   * 「同じ接続先へ、1 時間に 2 回以上握手した数」を数える窓を、巡回の間隔（1 時間）より、これだけ短くする。
   * 握手の時刻（checked_at）は、握手が終わった時に書く。前の握手が遅く、次の握手が早いと、間隔を守っていても、時刻の差が 1 時間より短く見える（最長で、握手 1 件の待ちの分）。
   */
  probeSkewMs: 60_000,
  /** 失敗の多い接続先の行に出すのは、依頼がこの数以上ある接続先だけ。 */
  minAsksPerHost: 5,
  /** その行に出す接続先の数。 */
  hosts: 20,
};

/** 期間ごとの数（直近 24 時間と、直近 7 日）。 */
export type NoahLaunchWindow = {
  /** 接続（相手のサーバー）。今の状態ごとの数と、握手に掛かった時間の平均（ミリ秒）。 */
  connections: Record<string, { count: number; probeMs: number | null }>;
  /** 握手に掛かった時間の平均（ミリ秒）。その期間に作った接続のうち、握手が通った物の全部（今は切ってある物も入る）。1 件も無ければ null。 */
  probeMs: number | null;
  /** 依頼。状態ごとの数。 */
  asks: Record<string, number>;
  /** 頼んだ画面の幅。 */
  screens: { narrow: number; wide: number; unknown: number };
  /** 最初の成果: つないだ人の数と、成果が出た人の数。 */
  people: { connected: number; succeeded: number };
};
export type NoahLaunchStatus = {
  /** 数えた時刻。 */
  at: number;
  /** 切り替えの状態。 */
  flags: { patrol: boolean; intakePublic: boolean; askForm: boolean; probeL2: boolean };
  /** 台帳の巡回。まだ 1 回も動いていなければ null。 */
  registry: {
    lastSuccessAt: number | null; nextRunAt: number; checkpointAt: number | null; lastFullAt: number | null;
    sweeping: boolean; errorCode: string | null; failureCount: number; observed: number;
    /** この 2 時間、成功も、読み取りの開始も無い（1 回も成功していず、読み取りも進んでいない時を含む）。 */
    stalled: boolean;
  } | null;
  /**
   * まだ握手していない数。巡回が握手する物（鍵の要らない、相手のサーバーの候補）のうち、まだ 1 回も握手していない物。
   * 握手しない物（量産の系列・取り下げた系列・台帳から消えた候補）は数えない。0 になったら、最初の 1 巡が終わっている。
   */
  unchecked: number;
  /** 握手の結果ごとの数（鍵の要らない、相手のサーバーの候補の全部。`unchecked` には、握手しない物も入る）。 */
  handshakes: Record<string, number>;
  /** 直近 1 時間（正しくは、それより 1 分短い窓。NOAH_LAUNCH_STATUS.probeSkewMs）に、巡回が 2 回以上握手した接続先の数（0 である事）。 */
  hostsProbedTwice: number;
  /** 混んでいる接続先: 直近 60 秒の枠を使い切った数と、待つ時刻（not_before）が先の数（相手が「混んでいる」と返した時と、運営が、その接続先だけを止めた時）。 */
  hosts: { full: number; waiting: number };
  day: NoahLaunchWindow;
  week: NoahLaunchWindow;
  /** 戻ってきた人: 成果が出た依頼が、2 日以上にある人の数。 */
  returned: number;
  /** 失敗の多い接続先（直近 7 日。依頼が 5 件以上あり、失敗か結果不明が 1 件以上ある接続先だけ。失敗と結果不明の割合が高い順。20 件まで）。 */
  failingHosts: { host: string; failed: number; unknown: number; total: number }[];
};

type Dependencies = Pick<IntakeDependencies, 'db' | 'now'>;
type Counted = { n: number };
const DAY = 86_400_000;
const cache = new WeakMap<object, { at: number; value: NoahLaunchStatus }>();

const WINDOW_SQL = [
  // probe_ms は、握手が通った時にだけ書く（lib/noah-connect.ts）。timed は、その時間を持つ行の数。
  "SELECT state, COUNT(*) AS n, AVG(probe_ms) AS ms, COUNT(probe_ms) AS timed FROM noah_connections WHERE place = 'provider' AND created_at >= ? GROUP BY 1",
  'SELECT state, COUNT(*) AS n FROM noah_asks WHERE created_at >= ? GROUP BY 1',
  'SELECT screen, COUNT(*) AS n FROM noah_asks WHERE created_at >= ? GROUP BY 1',
  "SELECT (SELECT COUNT(DISTINCT owner_id) FROM noah_connections WHERE place = 'provider' AND connected_at >= ?) AS connected, (SELECT COUNT(DISTINCT owner_id) FROM noah_asks WHERE state = 'succeeded' AND created_at >= ?) AS succeeded",
];

export function createNoahLaunchStatus(deps: Dependencies) {
  const { db } = deps, now = deps.now ?? Date.now;
  const prepare = (sql: string, ...args: (string | number | null)[]) => db.prepare(sql).bind(...args);

  return async function launch(flags: NoahFlags): Promise<NoahLaunchStatus> {
    const at = now(), kept = cache.get(db);
    // 切り替えの状態は、数え直さなくても、今の値を返す（開け間違いに、すぐ気づけるように）。
    const shown = { patrol: flags.patrol, intakePublic: flags.intakePublic, askForm: flags.askForm, probeL2: flags.probeL2 };
    if (kept && at >= kept.at && at - kept.at < NOAH_LAUNCH_STATUS.cacheMs) return { ...kept.value, flags: shown };

    const windows = [at - DAY, at - 7 * DAY];
    const results = await db.batch([
      prepare("SELECT last_success_at, next_run_at, checkpoint_at, last_full_at, sweep_started_at, error_code, failure_count, observed FROM noah_intake_sources WHERE id = 'mcp-registry'"),
      // 巡回が握手する物と、同じ条件（lib/noah-intake-probe.ts の target）: 有効な候補・相手のサーバー・鍵が要らない・量産でない・取り下げていない。
      prepare("SELECT COUNT(*) AS n FROM noah_intake_checks k JOIN noah_intake_candidates c ON c.id = k.candidate_id LEFT JOIN noah_intake_families f ON f.id = c.family_id WHERE c.state = 'active' AND k.mouth = 'mcp-remote' AND k.setup = 0 AND k.result = 'unchecked' AND c.family_id NOT LIKE 'bulk:%' AND f.withdrawn_at IS NULL"),
      prepare("SELECT result, COUNT(*) AS n FROM noah_intake_checks WHERE mouth = 'mcp-remote' AND setup = 0 GROUP BY 1"),
      prepare('SELECT COUNT(*) AS n FROM (SELECT c.host FROM noah_intake_checks k JOIN noah_intake_candidates c ON c.id = k.candidate_id WHERE k.checked_at > ? AND c.host IS NOT NULL GROUP BY c.host HAVING COUNT(*) > 1)', at - (NOAH_PROBE.hostEveryMs - NOAH_LAUNCH_STATUS.probeSkewMs)),
      prepare('SELECT COUNT(*) AS n FROM noah_probe_hosts WHERE user_window_at > ? AND user_count >= ?', at - 60_000, flags.askLimits.hostHandshakes),
      prepare('SELECT COUNT(*) AS n FROM noah_probe_hosts WHERE not_before > ?', at),
      prepare("SELECT COUNT(*) AS n FROM (SELECT owner_id FROM noah_asks WHERE state = 'succeeded' GROUP BY owner_id HAVING COUNT(DISTINCT created_at / 86400000) >= 2)"),
      prepare("SELECT host, SUM(state = 'failed') AS failed, SUM(state = 'unknown') AS unknown, COUNT(*) AS n FROM noah_asks WHERE created_at >= ? AND host IS NOT NULL GROUP BY host HAVING COUNT(*) >= ? AND SUM(state IN ('failed','unknown')) > 0 ORDER BY SUM(state IN ('failed','unknown')) * 1.0 / COUNT(*) DESC, COUNT(*) DESC, host LIMIT ?",
        windows[1], NOAH_LAUNCH_STATUS.minAsksPerHost, NOAH_LAUNCH_STATUS.hosts),
      ...windows.flatMap((since) => [prepare(WINDOW_SQL[0], since), prepare(WINDOW_SQL[1], since), prepare(WINDOW_SQL[2], since), prepare(WINDOW_SQL[3], since, since)]),
    ]);
    const rows = <T>(index: number) => (results[index]?.results ?? []) as T[];
    const count = (index: number) => rows<Counted>(index)[0]?.n ?? 0;
    const window = (from: number): NoahLaunchWindow => {
      const screens = { narrow: 0, wide: 0, unknown: 0 };
      for (const row of rows<{ screen: string | null; n: number }>(from + 2)) screens[row.screen === 'narrow' || row.screen === 'wide' ? row.screen : 'unknown'] += row.n;
      const people = rows<{ connected: number; succeeded: number }>(from + 3)[0];
      const states = rows<{ state: string; n: number; ms: number | null; timed: number }>(from);
      // 全体の平均は、状態ごとの平均を、時間を持つ行の数で重み付けして出す（状態ごとの平均の、ただの平均にしない）。
      const timed = states.reduce((sum, row) => sum + row.timed, 0);
      return {
        connections: Object.fromEntries(states.map((row) => [row.state, { count: row.n, probeMs: row.ms === null ? null : Math.round(row.ms) }])),
        probeMs: timed ? Math.round(states.reduce((sum, row) => sum + (row.ms ?? 0) * row.timed, 0) / timed) : null,
        asks: Object.fromEntries(rows<{ state: string; n: number }>(from + 1).map((row) => [row.state, row.n])),
        screens, people: { connected: people?.connected ?? 0, succeeded: people?.succeeded ?? 0 },
      };
    };
    const recent = (time: number | null) => time !== null && at - time <= NOAH_LAUNCH_STATUS.stalledMs;
    const source = rows<{ last_success_at: number | null; next_run_at: number; checkpoint_at: number | null; last_full_at: number | null; sweep_started_at: number | null; error_code: string | null; failure_count: number; observed: number }>(0)[0];
    const value: NoahLaunchStatus = {
      at, flags: shown,
      registry: source ? {
        lastSuccessAt: source.last_success_at, nextRunAt: source.next_run_at, checkpointAt: source.checkpoint_at, lastFullAt: source.last_full_at,
        sweeping: source.sweep_started_at !== null, errorCode: source.error_code, failureCount: source.failure_count, observed: source.observed,
        // 成功が新しいか、読み取りを始めたのが新しければ、動いている（最初の全件と、7 日ごとの全件の読み直しは、約 70 分掛かる。その間、成功の時刻は古いまま）。
        stalled: !recent(source.last_success_at) && !recent(source.sweep_started_at),
      } : null,
      unchecked: count(1),
      handshakes: Object.fromEntries(rows<{ result: string; n: number }>(2).map((row) => [row.result, row.n])),
      hostsProbedTwice: count(3),
      hosts: { full: count(4), waiting: count(5) },
      returned: count(6),
      failingHosts: rows<{ host: string; failed: number; unknown: number; n: number }>(7).map((row) => ({ host: row.host, failed: row.failed, unknown: row.unknown, total: row.n })),
      day: window(8), week: window(12),
    };
    cache.set(db, { at, value });
    return value;
  };
}

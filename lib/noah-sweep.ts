/**
 * 後始末。実行の途中で落ちた依頼と、つなぐ途中で止まった接続を、放っておかない。
 * 巡回の合図（lib/noah-intake-api.ts の createIntakeTick）が、毎回の終わりに呼ぶ。**相手へは、何も送らない。**
 *
 * | 対象 | 結果 |
 * | --- | --- |
 * | `running` のまま、実行の場が持つ時間（lease）を過ぎて、さらに 5 秒たった依頼 | 相手へ送る印（`tool_calls`）が付いていれば「結果不明」。付いていなければ、送っていないので「失敗」（もう一度頼める）。**取り直して呼び直さない** |
 * | `queued` のまま 60 秒たった依頼（応答の後の実行が、始まらなかった） | 相手へは送っていないので「失敗」 |
 * | つなぐ途中（`planned`〜`probing`）のまま 30 秒たった、置き場所が相手のサーバーの接続 | 切る。本人には「接続」が、もう一度出る |
 *
 * - 終わりは、頼む側と同じ関数（finishNoahAsk）で書く: Work と依頼の行を、1 回の書き込みで一緒に終える。もう終わっていた物は、変えない。
 * - 「送っていない」と言えるのは、印が付いていない時だけ。印は、道具を呼ぶ直前に、終わっていない依頼にだけ付く（lib/noah-ask.ts）。
 *   だから、ここで終わらせた後に、遅れて動いた実行の場が、道具を呼ぶ事は無い。
 * - 止める事が頼まれていた依頼は、「止めた」で終える。
 * - 巡回を止めている間（`NOAH_PATROL_ENABLED` が閉）は、合図が何もしないので、後始末もしない。その間も、本人は「止める」で、止まった依頼を終えられる（lib/noah-ask.ts の stop）。
 * - 1 回の合図で、それぞれ 50 件まで。使う時間にも上限がある（残りは、次の合図で）。
 * 仕様: docs/noah/spec-88-mass-probe.md の 9.5。
 */
import { finishGoneNoahAsk, finishNoahAsk, NOAH_ASK_COLUMNS, NOAH_ASK_END_MESSAGES, NOAH_ASK_LEASE_GRACE_MS, NOAH_ASK_STOP_MESSAGES, type NoahAskRow } from './noah-ask-store.ts';
import { nextNoahConnectionState, type NoahConnectionState } from './noah-connect-plan.ts';
import type { IntakeDependencies } from './noah-intake-sync.ts';

/** 数値は候補。 */
export const NOAH_SWEEP_LIMITS = {
  /** 1 回の合図で、種類ごとに片付ける数。 */
  each: 50,
  /** 受け付けた後、実行が始まらないまま、これだけたった依頼を「失敗」にする。 */
  queuedMs: 60_000,
  /** つなぐ途中のまま、これだけたった接続を切る（握手は 8 秒まで）。 */
  connectingMs: 30_000,
  /** 1 回の合図で、後始末に使う時間。越えたら、残りは次の合図で。 */
  ms: 10_000,
};

/** つなぐ途中で止まった接続に残す理由。 */
export const NOAH_SWEEP_CONNECTING_MESSAGE = 'つなぐ途中で止まりました。もう一度試してください。';

/**
 * 拾う文。どれも、終わっていない物だけを持つ小さな索引を使う（表を端から読まない）。
 * `connecting` の WHERE は、索引 noah_connections_connecting（drizzle/0049）の式と、同じに書く（IN の並びも。違うと、索引が使われない）。
 */
export const NOAH_SWEEP_SQL = {
  expired: `SELECT ${NOAH_ASK_COLUMNS} FROM noah_asks WHERE finished_at IS NULL AND state='running' AND lease_until > 0 AND lease_until < ? ORDER BY lease_until LIMIT ?`,
  notStarted: `SELECT ${NOAH_ASK_COLUMNS} FROM noah_asks WHERE finished_at IS NULL AND state='queued' AND created_at < ? ORDER BY created_at LIMIT ?`,
  connecting: "SELECT id,owner_id,state,revision FROM noah_connections WHERE disconnected_at IS NULL AND state IN ('planned','entitling','preparing','probing') AND place='provider' AND updated_at < ? ORDER BY updated_at LIMIT ?",
};

/** 片付けた数（数だけ。誰の物か・どの接続先かは、持たない）。 */
export type NoahSweepCounts = {
  /** 相手へ送った後に止まっていた依頼（結果不明にした）。 */
  asksUnknown: number;
  /** 相手へ送る前に止まっていた依頼・始まらなかった依頼（失敗にした）。 */
  asksFailed: number;
  /** 止める事が頼まれていた依頼（止めた）。 */
  asksStopped: number;
  /** つなぐ途中で止まっていた接続（切った）。 */
  connections: number;
};
export const noSweep = (): NoahSweepCounts => ({ asksUnknown: 0, asksFailed: 0, asksStopped: 0, connections: 0 });
export const noahSweepTotal = (counts: NoahSweepCounts) => counts.asksUnknown + counts.asksFailed + counts.asksStopped + counts.connections;

type Dependencies = Pick<IntakeDependencies, 'db' | 'now'>;

export function createNoahSweep(deps: Dependencies) {
  const { db } = deps, now = deps.now ?? Date.now;

  return async function sweep(): Promise<NoahSweepCounts> {
    const counts = noSweep(), started = now(), { each } = NOAH_SWEEP_LIMITS;
    const within = () => now() - started < NOAH_SWEEP_LIMITS.ms;

    // 1. running のまま、lease を過ぎた依頼。
    // lease を過ぎてから少し待つ（NOAH_ASK_LEASE_GRACE_MS）。相手へ送る印が付いていなければ「失敗」、付いていれば「結果不明」、止める事が頼まれていれば「止めた」。
    const expired = (await db.prepare(NOAH_SWEEP_SQL.expired).bind(started - NOAH_ASK_LEASE_GRACE_MS, each).all<NoahAskRow>()).results;
    for (const row of expired) {
      if (!within()) return counts;
      const done = await finishGoneNoahAsk(deps, row);
      if (done === 'unknown') counts.asksUnknown++; else if (done === 'failed') counts.asksFailed++; else if (done === 'stopped') counts.asksStopped++;
    }

    // 2. queued のまま、実行が始まらなかった依頼。実行の場が、同時に取った時は、変えない（only: 'queued'）。
    const waiting = (await db.prepare(NOAH_SWEEP_SQL.notStarted).bind(started - NOAH_SWEEP_LIMITS.queuedMs, each).all<NoahAskRow>()).results;
    for (const row of waiting) {
      if (!within()) return counts;
      const done = await finishNoahAsk(deps, row, 'failed', { state: 'failed', error: NOAH_ASK_END_MESSAGES.notStarted }, { only: 'queued' });
      if (done === 'written') counts.asksFailed++;
      else if (done === 'stop_requested' && (await finishNoahAsk(deps, row, 'stopped', { state: 'cancelled', error: NOAH_ASK_STOP_MESSAGES.stopped }, { only: 'queued' })) === 'written') counts.asksStopped++;
    }

    // 3. つなぐ途中で止まった接続。読んだ時の版と状態のままの時だけ、切る（同時に進んだ接続は、変えない）。
    const stuck = (await db.prepare(NOAH_SWEEP_SQL.connecting).bind(started - NOAH_SWEEP_LIMITS.connectingMs, each).all<{ id: string; owner_id: string; state: NoahConnectionState; revision: number }>()).results;
    for (const row of stuck) {
      if (!within()) return counts;
      const next = nextNoahConnectionState(row.state, 'disconnect');
      if (!next) continue;
      const at = now();
      const written = await db.prepare('UPDATE noah_connections SET state=?,error=?,disconnected_at=?,revision=revision+1,updated_at=? WHERE id=? AND owner_id=? AND revision=? AND state=?')
        .bind(next, NOAH_SWEEP_CONNECTING_MESSAGE, at, at, row.id, row.owner_id, row.revision, row.state).run();
      if (written.meta.changes === 1) counts.connections++;
    }
    return counts;
  };
}

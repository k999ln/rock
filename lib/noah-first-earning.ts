import { NoahAgentError } from './noah-agent-upload.ts';
import { noahCloudDigest, NOAH_CLOUD_LIMITS } from './noah-cloud-contract.ts';

export const FIRST_EARNING_LIMIT_MS = 150 * 60_000;
const PREPARATION_MS = 30 * 60_000;
const RUN_MS = NOAH_CLOUD_LIMITS.seconds * 1000;

type Db = Pick<D1Database, 'prepare'>;
type Stage = 'preparing' | 'contracted' | 'delivered' | 'payout_pending' | 'bank_reported' | 'bank_confirmed' | 'cancelled';
type Case = { stage: Stage; revision: number; amount_yen: number | null; bank_date: string | null };
type Run = { runtime: 'free' | 'managed'; reserved_ms: number; expires_at: number; charged_ms: number | null };
export type FirstEarningBudget = { ms: number; expiresAt: number };

export function noahFirstEarningStore(db: Db) {
  function firstEarning(scope: string) {
    return db.prepare('SELECT stage, revision, amount_yen, bank_date FROM noah_first_earnings WHERE owner_scope = ?')
      .bind(scope).first<Case>();
  }

  async function status(scope: string) {
    const row = await firstEarning(scope);
    if (!row) return null;
    const usage = await db.prepare('SELECT COALESCE(SUM(COALESCE(charged_ms, reserved_ms)), 0) AS used FROM noah_first_earning_runs WHERE owner_scope = ?').bind(scope).first<{ used: number }>();
    const used = usage?.used ?? 0;
    const limit = row.stage === 'preparing' ? PREPARATION_MS : FIRST_EARNING_LIMIT_MS;
    const stopped = row.stage === 'cancelled' || row.stage === 'bank_confirmed';
    return {
      stage: row.stage, revision: row.revision, usedMs: used, limitMs: FIRST_EARNING_LIMIT_MS,
      availableMs: stopped ? 0 : Math.max(0, limit - used),
      amountYen: row.amount_yen, bankDate: row.bank_date,
      offerPaidPlan: row.stage === 'bank_confirmed' && row.amount_yen !== null,
    };
  }

  async function enroll(scope: string, reviewer: string, now: number) {
    await db.prepare("INSERT OR IGNORE INTO noah_first_earnings (owner_scope, stage, updated_at, reviewed_by) VALUES (?, 'preparing', ?, ?)")
      .bind(scope, now, reviewer).run();
  }

  async function transition(scope: string, actor: string, review: boolean, action: string, value: Record<string, unknown>, now: number) {
    const revision = value.revision;
    if (typeof revision !== 'number' || !Number.isSafeInteger(revision) || revision < 1) throw new NoahAgentError('画面を読み直してください。', 409);
    let change: string, before: string, args: Array<string | number>;
    const proof = async (kind: string) => {
      const ref = value.reference;
      if (typeof ref !== 'string' || !/^[A-Za-z0-9_-]{6,100}$/.test(ref)) throw new NoahAgentError('取引または照合の識別番号を確認してください。');
      return noahCloudDigest(`noah-first-earning:${kind}:${ref.toLowerCase()}`);
    };
    if (review && action === 'contract') {
      change = "stage = 'contracted', order_digest = ?, reviewed_by = ?";
      before = "stage = 'preparing'";
      args = [await proof('coconala-order'), actor];
    } else if (!review && action === 'deliver') {
      change = "stage = 'delivered'";
      before = "stage = 'contracted'";
      args = [];
    } else if (review && action === 'payoutPending') {
      change = "stage = 'payout_pending', reviewed_by = ?";
      before = "stage = 'delivered'";
      args = [actor];
    } else if (!review && action === 'reportBank') {
      const { amountYen: amount, bankDate: date } = value;
      const today = new Date(now + 9 * 3_600_000).toISOString().slice(0, 10);
      const parsed = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) ? Date.parse(date) : NaN;
      if (typeof amount !== 'number' || !Number.isSafeInteger(amount) || amount < 1 || amount > 1_000_000_000
        || typeof date !== 'string' || !Number.isFinite(parsed) || new Date(parsed).toISOString().slice(0, 10) !== date
        || parsed < 0 || date > today) throw new NoahAgentError('口座に入った金額と日付を確認してください。');
      change = "stage = 'bank_reported', amount_yen = ?, bank_date = ?";
      before = "stage = 'payout_pending'";
      args = [amount, date];
    } else if (review && action === 'verifyBank') {
      if (actor === scope || value.checked !== true) throw new NoahAgentError('別の担当者が取引と銀行着金を照合してください。', 403);
      change = "stage = 'bank_confirmed', payout_digest = ?, reviewed_by = ?";
      before = "stage = 'bank_reported'";
      args = [await proof('coconala-payout'), actor];
    } else if (action === 'returnBank') {
      change = "stage = 'payout_pending', amount_yen = NULL, bank_date = NULL, payout_digest = NULL";
      before = review ? "stage IN ('bank_reported','bank_confirmed')" : "stage = 'bank_reported'";
      args = [];
    } else if (review && action === 'cancel') {
      change = "stage = 'cancelled', amount_yen = NULL, bank_date = NULL, reviewed_by = ?";
      before = "stage NOT IN ('bank_confirmed','cancelled')";
      args = [actor];
    } else if (review && action === 'restart') {
      change = "stage = 'preparing', order_digest = NULL, reviewed_by = ?";
      before = "stage = 'cancelled'";
      args = [actor];
    } else {
      throw new NoahAgentError('この操作は利用できません。', 403);
    }
    try {
      const result = await db.prepare(`UPDATE noah_first_earnings SET ${change}, revision = revision + 1, updated_at = ? WHERE owner_scope = ? AND revision = ? AND ${before}`)
        .bind(...args, now, scope, revision).run();
      if (result.meta.changes !== 1) throw new NoahAgentError('進捗が変わりました。画面を読み直してください。', 409);
    } catch (error) {
      if (error instanceof Error && /UNIQUE constraint failed/.test(error.message)) throw new NoahAgentError('この識別番号は記録済みです。', 409);
      throw error;
    }
  }

  async function reserve(scope: string, jobId: string, runtime: Run['runtime'], now: number): Promise<FirstEarningBudget | null> {
    const row = await firstEarning(scope);
    if (!row) return null;
    // A single SQLite write checks used plus reserved time and allocates the
    // remaining tail even when it is shorter than the usual per-run deadline.
    await db.prepare(`WITH remaining AS (
      SELECT (CASE f.stage WHEN 'preparing' THEN ? ELSE ? END)
        - COALESCE((SELECT SUM(COALESCE(charged_ms, reserved_ms)) FROM noah_first_earning_runs WHERE owner_scope = f.owner_scope), 0) AS ms
      FROM noah_first_earnings f WHERE f.owner_scope = ? AND f.stage NOT IN ('cancelled','bank_confirmed')
    )
    INSERT OR IGNORE INTO noah_first_earning_runs (owner_scope, job_id, runtime, reserved_ms, expires_at)
      SELECT ?, ?, ?, MIN(ms, ?), ? FROM remaining WHERE ms > 0`)
      .bind(PREPARATION_MS, FIRST_EARNING_LIMIT_MS, scope, scope, jobId, runtime, RUN_MS, now + RUN_MS).run();
    const run = await db.prepare('SELECT runtime, reserved_ms, expires_at, charged_ms FROM noah_first_earning_runs WHERE owner_scope = ? AND job_id = ?')
      .bind(scope, jobId).first<Run>();
    if (run?.runtime === runtime && run.charged_ms === null && run.expires_at > now) {
      return { ms: run.reserved_ms, expiresAt: run.expires_at };
    }
    if (!run && row.stage === 'bank_confirmed') throw new NoahAgentError('初回利用を完了しました。着金と次のプランは「初回の売上」で確認できます。', 429);
    if (!run && row.stage === 'preparing') throw new NoahAgentError('準備に使えるAI枠の上限です。契約確認後は、制作・修正用の枠を使えます。', 429);
    if (!run && row.stage === 'cancelled') throw new NoahAgentError('この案件は停止中です。', 429);
    if (!run) throw new NoahAgentError('無料AI枠の上限です。成果の閲覧、納品、振込確認は引き続きできます。', 429);
    throw new NoahAgentError('この実行枠は再利用できません。既存の依頼の状況を確認してください。', 409);
  }

  async function settle(scope: string, jobId: string, activeMs: unknown) {
    if (typeof activeMs !== 'number' || !Number.isSafeInteger(activeMs) || activeMs < 0) return;
    await db.prepare('UPDATE noah_first_earning_runs SET charged_ms = ? WHERE owner_scope = ? AND job_id = ? AND charged_ms IS NULL AND reserved_ms >= ?')
      .bind(activeMs, scope, jobId, activeMs).run();
  }

  return { status, enrolled: async (scope: string) => !!await firstEarning(scope), enroll, transition, reserve, settle };
}

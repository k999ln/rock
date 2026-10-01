import { env } from 'cloudflare:workers';
import { defaultFund, type FundPlan } from './fund';
export { requestUser } from './request-auth';
export function database(): D1Database {
  const db = (env as unknown as { DB?: D1Database }).DB;
  if (!db) throw new Error('データ保存の準備ができていません。');
  return db;
}
export async function snapshot(user: string) {
  const db = database();
  const [row, runs, count] = await Promise.all([
    db
      .prepare('SELECT plan, updated_at FROM fund_plans WHERE user_id = ?')
      .bind(user)
      .first<{ plan: string; updated_at: string }>(),
    db
      .prepare(
        'SELECT id, tool, transport, status, sample, duration_ms AS durationMs, created_at AS createdAt FROM tool_runs WHERE user_id = ? ORDER BY created_at DESC LIMIT 20',
      )
      .bind(user)
      .all(),
    db
      .prepare('SELECT count(*) AS total FROM tool_runs WHERE user_id = ?')
      .bind(user)
      .first<{ total: number }>(),
  ]);
  return {
    plan: row ? (JSON.parse(row.plan) as FundPlan) : defaultFund,
    updatedAt: row?.updated_at ?? null,
    runs: runs.results,
    totalRuns: count?.total ?? 0,
  };
}
export function apiError(error: unknown) {
  const msg = error instanceof Error ? error.message : '処理に失敗しました。';
  const status = msg === 'UNAUTHORIZED' ? 401 : msg === 'ORIGIN' ? 403 : 400;
  return Response.json(
    {
      error:
        status === 401
          ? 'サインインすると参加設定を保存できます。'
          : status === 403
            ? 'このサイトから操作してください。'
            : '保存できませんでした。入力を確認して再試行してください。',
    },
    { status, headers: { 'Cache-Control': 'no-store' } },
  );
}

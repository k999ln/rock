/**
 * 続けて使う割合（task 103）: eSIM を入れて始めた人と、入れずに始めた人を、同じ機能で比べる。
 * 集計は lib/churn-cohort.ts（実装済み・試験済み）をそのまま使う。ここでは、その入力（1 人 1 行）を、Noah の仕事の記録から作る。
 *
 * 数え方（codex/tasks/103-esim-churn-measure.md の「決めてある事」と「実装で決めた事」）:
 * - 1 人 ＝ 1 つの owner（会員登録の廃止の後の、ブラウザの保存権限の本人も、同じく 1 人）。同じ人が 2 回数えられない。
 * - 仕事を頼んだ記録: Noah の依頼（noah_asks）・外の Agent への委任（agent_delegations。承認待ち・準備・期限切れを除く）・
 *   手元の Mac で動かした Agent（work_jobs の noah-agent-local）。lib/noah-usage.ts と同じ所を読む。
 * - 月は UTC の暦月（churn-cohort の addUtcMonths と同じ）。始めた月 ＝ 初めて頼んだ月。1 か月に 1 回でも頼めば、その月は「続けた」。
 * - 頼まなかった月が終わったら、その前の月で「やめた」。今の月に、まだ頼んでいない人は、結果が出ていないので「続いている」。
 * - やめた後に戻って来た人は、最初の続きだけを数える（後から戻った分で、やめた事を消さない）。
 * - 組: 最初に頼んだ時に、eSIM の利用権が有効だったら esim、そうでなければ card（名前は churn-cohort のまま）。
 *   後から eSIM を入れた人は card のまま（始めた時の条件で分ける。後の事を前に使わない）。
 */
import { NoahAgentError } from './noah-agent-upload.ts';
import { cohortChurn, type ChurnArm, type ChurnReport, type ChurnSubscription } from './churn-cohort.ts';

/** 1 人・1 か月の、最初に頼んだ時刻。month は UTC の 'YYYY-MM'。 */
export type RetentionActivity = { owner: string; month: string; firstAt: number };
/** eSIM の利用権が有効だった間。until が null なら、今も有効。 */
export type EsimWindow = { owner: string; from: number; until: number | null };

/** D1 から読む行の上限。越えたら集計しない（途中までの数で言い切らない）。 */
export const NOAH_RETENTION_ROW_LIMIT = 200_000;

const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;

/** UTC の暦月の番号（年 × 12 ＋ 月）。 */
export function utcMonthIndex(at: number): number {
  const date = new Date(at);
  return date.getUTCFullYear() * 12 + date.getUTCMonth();
}
const monthIndex = (month: string) => {
  const match = MONTH.exec(month);
  return match ? Number(match[1]) * 12 + Number(match[2]) - 1 : null;
};
const monthStart = (index: number) => Date.UTC(Math.floor(index / 12), index % 12, 1);

/** 仕事の記録と eSIM の利用権から、1 人 1 行（churn-cohort の入力）を作る。asOf より後の記録は読まない。 */
export function noahRetentionSubscriptions(activity: readonly RetentionActivity[], windows: readonly EsimWindow[], asOf: number): ChurnSubscription[] {
  if (!Number.isFinite(asOf)) throw new RangeError('asOf を確かめてください。');
  const current = utcMonthIndex(asOf);
  const people = new Map<string, Map<number, number>>();
  for (const row of activity) {
    if (typeof row.owner !== 'string' || !row.owner || !Number.isFinite(row.firstAt) || row.firstAt > asOf) continue;
    const index = monthIndex(row.month);
    if (index === null || index > current || utcMonthIndex(row.firstAt) !== index) continue;
    const months = people.get(row.owner) ?? new Map<number, number>();
    people.set(row.owner, months);
    const seen = months.get(index);
    if (seen === undefined || row.firstAt < seen) months.set(index, row.firstAt);
  }
  const esim = new Map<string, EsimWindow[]>();
  for (const window of windows) {
    if (typeof window.owner !== 'string' || !window.owner || !Number.isFinite(window.from)) continue;
    if (window.until !== null && !(Number.isFinite(window.until) && window.until > window.from)) continue;
    const list = esim.get(window.owner) ?? [];
    list.push(window);
    esim.set(window.owner, list);
  }
  const rows: ChurnSubscription[] = [];
  for (const [owner, months] of people) {
    const first = Math.min(...months.keys());
    const startedAt = months.get(first)!;
    let next = first;
    while (months.has(next)) next += 1;
    // next は、最初に頼まなかった月。もう終わった月なら、その前の月の終わりで「やめた」。今の月なら、まだ結果が出ていない。
    const ended = next < current;
    const arm: ChurnArm = (esim.get(owner) ?? []).some((window) => window.from <= startedAt && (window.until === null || window.until > startedAt)) ? 'esim' : 'card';
    rows.push({ arm, startedAt, periodsPaid: next - first, endedAt: ended ? monthStart(next) : null });
  }
  return rows;
}

const ACTIVITY = `WITH acts(owner, at) AS (
  SELECT owner_id, created_at FROM noah_asks
  UNION ALL
  SELECT owner_user_id, created_at FROM agent_delegations WHERE state NOT IN ('awaiting_approval','prepared','expired')
  UNION ALL
  SELECT user_id, CAST(unixepoch(json_extract(payload, '$.createdAt'), 'subsec') * 1000 AS INTEGER) FROM work_jobs
    WHERE json_valid(payload) AND json_extract(payload, '$.templateId') = 'noah-agent-local'
      AND json_extract(payload, '$.noahExecution.agentId') IS NOT NULL
)
SELECT owner, strftime('%Y-%m', at / 1000, 'unixepoch') AS month, MIN(at) AS firstAt
FROM acts WHERE owner IS NOT NULL AND owner <> '' AND at IS NOT NULL AND at <= ?
GROUP BY owner, month ORDER BY owner, month LIMIT ?`;

// 端末の eSIM の利用権（有効にした時から）と、eSIM の購入の利用権（取り消し・期限まで。返金した物は数えない）。
const ESIM = `SELECT owner_user_id AS owner, activated_at AS "from", NULL AS until FROM esim_device_entitlements
UNION ALL
SELECT owner_user_id, claimed_at,
  CASE WHEN revoked_at IS NULL THEN expires_at WHEN expires_at IS NULL THEN revoked_at ELSE MIN(revoked_at, expires_at) END
FROM rockstar_service_entitlements WHERE form_factor = 'esim' AND status <> 'refunded'
LIMIT ?`;

// 全体の人数は返さない（片方の組が 5 人未満の時、全体から引けば、出さない数が分かってしまうため）。
export type NoahRetentionReport = ChurnReport & { armRule: 'started_with_esim'; month: 'utc' };

/** 運営の画面に出す数（1 人ずつの行は返さない）。 */
export async function noahRetentionReport(db: Pick<D1Database, 'prepare'>, now = Date.now()): Promise<NoahRetentionReport> {
  const activity = await db.prepare(ACTIVITY).bind(now, NOAH_RETENTION_ROW_LIMIT + 1).all<RetentionActivity>();
  const windows = await db.prepare(ESIM).bind(NOAH_RETENTION_ROW_LIMIT + 1).all<EsimWindow>();
  if (activity.results.length > NOAH_RETENTION_ROW_LIMIT || windows.results.length > NOAH_RETENTION_ROW_LIMIT)
    throw new NoahAgentError('記録が多すぎるため、まだ集計できません。', 503);
  const rows = noahRetentionSubscriptions(
    activity.results.map((row) => ({ owner: String(row.owner), month: String(row.month), firstAt: Number(row.firstAt) })),
    windows.results.map((row) => ({ owner: String(row.owner), from: Number(row.from), until: row.until === null ? null : Number(row.until) })),
    now,
  );
  return { ...cohortChurn(rows, now), armRule: 'started_with_esim', month: 'utc' };
}

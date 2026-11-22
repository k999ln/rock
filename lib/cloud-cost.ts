/**
 * 自社クラウドの従量の実費（定価で換算）と、黒殿へ移す引き金の判定（task 101 の 1、task 105 の 1）。
 * 設計: docs/compute-placement.md の 3 章（数字）・4 章（引き金）。
 *
 * - 値段は 2026-11-21 に取得した定価（USD、税・地域差・ログ・通信量を除く）。版の名前で固定する。契約の前に取り直す。
 * - Workers Paid（月 $5）に含まれる量は引かない。出す額は「請求の上限の見積り」で、実際の請求はこれ以下になる。
 * - 値段の無いモデルの使用は 0 円にしない。数えずに `unpriced` に数え、その月の額を「下限」として扱う。
 * - 月は UTC の暦月で数える。
 */

/** 2026-11-21 の定価。Containers: https://developers.cloudflare.com/containers/platform/pricing/ ・ Workers AI: https://developers.cloudflare.com/workers-ai/platform/pricing/ */
export const CLOUD_PRICES_2026_11_21 = {
  version: 'cloud-prices/2026-11-21',
  containers: { vcpuSecondUsd: 0.000020, gibSecondUsd: 0.0000025, gbSecondUsd: 0.00000007 },
  /** 100 万トークンあたり（入力・出力）。名前は Workers AI の料金表の表記のまま。 */
  models: {
    'qwen3-30b-a3b-fp8': { inputPerMillionUsd: 0.051, outputPerMillionUsd: 0.335 },
    'gpt-oss-20b': { inputPerMillionUsd: 0.2, outputPerMillionUsd: 0.3 },
    'gpt-oss-120b': { inputPerMillionUsd: 0.35, outputPerMillionUsd: 0.75 },
    'glm-4.7-flash': { inputPerMillionUsd: 0.06, outputPerMillionUsd: 0.4 },
    'llama-3.3-70b-instruct-fp8-fast': { inputPerMillionUsd: 0.293, outputPerMillionUsd: 2.253 },
    'kimi-k2.6': { inputPerMillionUsd: 0.95, outputPerMillionUsd: 4.0 },
  },
} as const;

export type CloudPrices = {
  version: string;
  containers: { vcpuSecondUsd: number; gibSecondUsd: number; gbSecondUsd: number };
  models: Readonly<Record<string, { inputPerMillionUsd: number; outputPerMillionUsd: number }>>;
};

/** Cloudflare Containers の型（vCPU・メモリ GiB・ディスク GB）。https://developers.cloudflare.com/containers/platform/pricing/ */
export const CONTAINER_INSTANCES = {
  lite: { vcpu: 1 / 16, memoryGiB: 0.25, diskGB: 2 },
  basic: { vcpu: 1 / 4, memoryGiB: 1, diskGB: 4 },
  'standard-1': { vcpu: 1 / 2, memoryGiB: 4, diskGB: 8 },
  'standard-2': { vcpu: 1, memoryGiB: 6, diskGB: 12 },
  'standard-3': { vcpu: 2, memoryGiB: 8, diskGB: 16 },
  'standard-4': { vcpu: 4, memoryGiB: 12, diskGB: 20 },
} as const;
export type ContainerInstance = keyof typeof CONTAINER_INSTANCES;

/** 使った量の 1 行。Containers は資源の秒（CPU は動いた分、メモリとディスクは起きていた間）。モデルはトークン。 */
export type CloudUsage =
  | { kind: 'container'; at: number; vcpuSeconds: number; gibSeconds: number; gbSeconds: number }
  | { kind: 'model'; at: number; model: string; inputTokens: number; outputTokens: number };

export type CloudMonth = { month: string; containersUsd: number; modelsUsd: number; totalUsd: number; unpriced: number; records: number };

export type CloudTriggerState = {
  triggered: boolean;
  /** 上限を確かに超えた月が、直近から何か月続いているか。 */
  streak: number;
  thresholdUsd: number;
  consecutive: number;
  /** 判定に使った最後の月（今の月は、終わっていないので使わない）。 */
  lastCompleteMonth: string;
  /** 続きが切れた理由。 */
  reason: 'triggered' | 'below_threshold' | 'unpriced_below_threshold' | 'no_complete_month';
};

const finiteNonNegative = (value: number, name: string) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new RangeError(`${name} は 0 以上の有限の数にしてください。`);
};
const round6 = (value: number) => Math.round(value * 1e6) / 1e6;

/** UTC の暦月（"2026-11"）。 */
export function utcMonth(at: number): string {
  finiteNonNegative(at, 'at');
  const d = new Date(at);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function previousMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

/** 型と秒から、Containers の使った量を作る。cpuShare は、起きていた間に CPU が動いていた割合（0〜1）。 */
export function containerUsage(instance: ContainerInstance, awakeSeconds: number, at: number, cpuShare = 1): CloudUsage {
  const spec = CONTAINER_INSTANCES[instance];
  if (!spec) throw new RangeError(`知らない型です: ${String(instance)}`);
  finiteNonNegative(awakeSeconds, 'awakeSeconds');
  if (typeof cpuShare !== 'number' || !Number.isFinite(cpuShare) || cpuShare < 0 || cpuShare > 1) throw new RangeError('cpuShare は 0〜1 にしてください。');
  return { kind: 'container', at, vcpuSeconds: spec.vcpu * awakeSeconds * cpuShare, gibSeconds: spec.memoryGiB * awakeSeconds, gbSeconds: spec.diskGB * awakeSeconds };
}

/** 1 行の実費（USD）。値段の無いモデルは null（0 にしない）。 */
export function cloudUsageCostUsd(usage: CloudUsage, prices: CloudPrices = CLOUD_PRICES_2026_11_21): number | null {
  finiteNonNegative(usage.at, 'at');
  if (usage.kind === 'container') {
    finiteNonNegative(usage.vcpuSeconds, 'vcpuSeconds');
    finiteNonNegative(usage.gibSeconds, 'gibSeconds');
    finiteNonNegative(usage.gbSeconds, 'gbSeconds');
    const c = prices.containers;
    return usage.vcpuSeconds * c.vcpuSecondUsd + usage.gibSeconds * c.gibSecondUsd + usage.gbSeconds * c.gbSecondUsd;
  }
  if (usage.kind === 'model') {
    finiteNonNegative(usage.inputTokens, 'inputTokens');
    finiteNonNegative(usage.outputTokens, 'outputTokens');
    const price = Object.hasOwn(prices.models, usage.model) ? prices.models[usage.model] : undefined;
    if (!price) return null;
    return (usage.inputTokens * price.inputPerMillionUsd + usage.outputTokens * price.outputPerMillionUsd) / 1e6;
  }
  throw new RangeError('使った量の種類は container か model にしてください。');
}

/** 月ごとの実費。月の昇順。 */
export function cloudMonthlyCost(usages: readonly CloudUsage[], prices: CloudPrices = CLOUD_PRICES_2026_11_21): CloudMonth[] {
  const months = new Map<string, { containers: number; models: number; unpriced: number; records: number }>();
  for (const usage of usages) {
    const month = utcMonth(usage.at);
    const row = months.get(month) ?? { containers: 0, models: 0, unpriced: 0, records: 0 };
    const cost = cloudUsageCostUsd(usage, prices);
    row.records += 1;
    if (cost === null) row.unpriced += 1;
    else if (usage.kind === 'container') row.containers += cost;
    else row.models += cost;
    months.set(month, row);
  }
  return [...months.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([month, r]) => ({
    month, containersUsd: round6(r.containers), modelsUsd: round6(r.models), totalUsd: round6(r.containers + r.models), unpriced: r.unpriced, records: r.records,
  }));
}

/**
 * 引き金（docs/compute-placement.md 4 章）: 従量の実費が、しきい値（既定 月 $190 ≒ 黒殿 1 ノードの電気代）を、終わった月で続けて超えたら移し始める。
 * - 今の月は終わっていないので数えない。記録の無い月は 0 として数え、続きを切る。
 * - 値段の無い使用がある月は、額が下限。下限でもしきい値を超えていれば数える。超えていなければ確かめられないので、続きを切る。
 */
export function cloudTrigger(months: readonly CloudMonth[], now: number, options: { thresholdUsd?: number; consecutive?: number } = {}): CloudTriggerState {
  const thresholdUsd = options.thresholdUsd ?? 190;
  const consecutive = options.consecutive ?? 2;
  finiteNonNegative(thresholdUsd, 'thresholdUsd');
  if (!Number.isInteger(consecutive) || consecutive < 1) throw new RangeError('consecutive は 1 以上の整数にしてください。');
  const byMonth = new Map(months.map(m => [m.month, m]));
  const lastCompleteMonth = previousMonth(utcMonth(now));
  const earliest = months.length ? months.reduce((a, m) => (m.month < a ? m.month : a), months[0].month) : null;
  let streak = 0;
  let reason: CloudTriggerState['reason'] = 'no_complete_month';
  for (let month = lastCompleteMonth; earliest !== null && month >= earliest && streak < consecutive; month = previousMonth(month)) {
    const row = byMonth.get(month);
    const total = row?.totalUsd ?? 0;
    if (total > thresholdUsd) { streak += 1; continue; }
    reason = row && row.unpriced > 0 ? 'unpriced_below_threshold' : 'below_threshold';
    break;
  }
  if (streak >= consecutive) reason = 'triggered';
  else if (streak > 0 && reason === 'no_complete_month') reason = 'below_threshold';
  return { triggered: streak >= consecutive, streak, thresholdUsd, consecutive, lastCompleteMonth, reason };
}

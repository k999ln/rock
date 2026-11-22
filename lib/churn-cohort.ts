/**
 * 続けて使う割合を測る（task 103）: eSIM を入れた人（esim）と入れていない人（card）を、同じ機能で比べる。
 * 本人の仮説（2026-11-21 22:31）: データでも eSIM は、アプリに比べて離脱率が低いはず。測り方は docs/structure/03-esim.md の 0.3.3。
 * 2026-11-22 に利用者から月額は取らない形へ変わったので、「1 か月」は支払いの月ではなく、1 回でも使った月として数える。
 *
 * - 1 か月を 1 回の試行と数える。やめた人は、続けた月の数が試行の数で、最後の 1 回が「やめた」。
 *   続いている人は、今の月の結果がまだ出ていないので、続けた月の数 − 1 が試行の数（全部「続けた」）。
 *   月ごとのやめた割合 ＝ やめた数 ÷ 試行の数。
 * - 3 か月の継続 ＝ 始めてから 3 暦月以上たった人のうち、3 か月以上続けた人の割合。
 * - どちらにも Wilson の 95% の幅を付ける。判定は幅が重ならない時だけ出す（数が少ない時に言い切らない）。
 * - 5 人未満の組は、数を返さない（task 114 と同じ決まり）。
 */

export type ChurnArm = 'esim' | 'card';
export const CHURN_ARMS: readonly ChurnArm[] = ['esim', 'card'];

/** 1 人分。startedAt は始めた時刻、periodsPaid は続けた月の数（月額があった時の名前のまま）、endedAt はやめた時刻（続いていれば null）。 */
export type ChurnSubscription = { arm: ChurnArm; startedAt: number; periodsPaid: number; endedAt: number | null };

export type Interval = { low: number; high: number };
export type ChurnArmStats = {
  arm: ChurnArm;
  /** 5 人以上の時だけ true。false の時、下の数は全部 null。 */
  shown: boolean;
  people: number | null;
  trials: number | null;
  cancels: number | null;
  monthlyChurn: number | null;
  monthlyChurnCi: Interval | null;
  eligibleFor3Months: number | null;
  retained3Months: number | null;
  retention3Months: number | null;
  retention3MonthsCi: Interval | null;
};
export type ChurnVerdict = 'insufficient' | 'esim_lower' | 'card_lower' | 'unclear';
export type ChurnReport = { asOf: number; arms: Record<ChurnArm, ChurnArmStats>; verdict: ChurnVerdict; minTrialsPerArm: number; minPeople: number };

/** 95% の両側の z。 */
const Z = 1.959963984540054;

/** Wilson の幅（x 回 / n 回）。n が 0 なら null。 */
export function wilsonInterval(successes: number, trials: number, z = Z): Interval | null {
  if (!Number.isInteger(successes) || !Number.isInteger(trials) || successes < 0 || trials < 0 || successes > trials) throw new RangeError('回数は 0 以上の整数で、成功は試行以下にしてください。');
  if (trials === 0) return null;
  const p = successes / trials, z2 = z * z;
  const denominator = 1 + z2 / trials;
  const center = (p + z2 / (2 * trials)) / denominator;
  const half = (z * Math.sqrt((p * (1 - p)) / trials + z2 / (4 * trials * trials))) / denominator;
  return { low: Math.max(0, center - half), high: Math.min(1, center + half) };
}

/** UTC で months 暦月あと（月末は、その月の最後の日にそろえる）。 */
export function addUtcMonths(at: number, months: number): number {
  const d = new Date(at);
  const targetMonth = d.getUTCMonth() + months;
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), targetMonth + 1, 0)).getUTCDate();
  return Date.UTC(d.getUTCFullYear(), targetMonth, Math.min(d.getUTCDate(), lastDay), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds());
}

function check(row: ChurnSubscription, index: number) {
  if (!CHURN_ARMS.includes(row.arm)) throw new RangeError(`${index} 行目: 組は esim か card にしてください。`);
  if (!Number.isFinite(row.startedAt) || row.startedAt < 0) throw new RangeError(`${index} 行目: startedAt を確かめてください。`);
  if (!Number.isInteger(row.periodsPaid) || row.periodsPaid < 1) throw new RangeError(`${index} 行目: periodsPaid は 1 以上の整数にしてください。`);
  if (row.endedAt !== null && (!Number.isFinite(row.endedAt) || row.endedAt < row.startedAt)) throw new RangeError(`${index} 行目: endedAt は startedAt 以降にしてください。`);
}

const hidden = (arm: ChurnArm): ChurnArmStats => ({ arm, shown: false, people: null, trials: null, cancels: null, monthlyChurn: null, monthlyChurnCi: null, eligibleFor3Months: null, retained3Months: null, retention3Months: null, retention3MonthsCi: null });

/** 2 つの組の解約率と 3 か月の継続、判定。asOf より後に始まった契約は数えない。 */
export function cohortChurn(rows: readonly ChurnSubscription[], asOf: number, options: { minTrialsPerArm?: number; minPeople?: number } = {}): ChurnReport {
  const minTrialsPerArm = options.minTrialsPerArm ?? 100;
  const minPeople = options.minPeople ?? 5;
  if (!Number.isFinite(asOf)) throw new RangeError('asOf を確かめてください。');
  const raw = new Map<ChurnArm, { people: number; trials: number; cancels: number; eligible: number; retained: number }>(CHURN_ARMS.map(arm => [arm, { people: 0, trials: 0, cancels: 0, eligible: 0, retained: 0 }]));
  rows.forEach((row, index) => {
    check(row, index);
    if (row.startedAt > asOf) return;
    const r = raw.get(row.arm)!;
    r.people += 1;
    if (row.endedAt !== null) { r.trials += row.periodsPaid; r.cancels += 1; }
    else r.trials += row.periodsPaid - 1;
    if (addUtcMonths(row.startedAt, 3) <= asOf) { r.eligible += 1; if (row.periodsPaid >= 3) r.retained += 1; }
  });
  const arms = {} as Record<ChurnArm, ChurnArmStats>;
  for (const arm of CHURN_ARMS) {
    const r = raw.get(arm)!;
    if (r.people < minPeople) { arms[arm] = hidden(arm); continue; }
    arms[arm] = {
      arm, shown: true, people: r.people, trials: r.trials, cancels: r.cancels,
      monthlyChurn: r.trials ? r.cancels / r.trials : null, monthlyChurnCi: wilsonInterval(r.cancels, r.trials),
      eligibleFor3Months: r.eligible, retained3Months: r.retained,
      retention3Months: r.eligible ? r.retained / r.eligible : null, retention3MonthsCi: wilsonInterval(r.retained, r.eligible),
    };
  }
  const e = arms.esim, c = arms.card;
  let verdict: ChurnVerdict = 'unclear';
  if (!e.shown || !c.shown || (e.trials ?? 0) < minTrialsPerArm || (c.trials ?? 0) < minTrialsPerArm || !e.monthlyChurnCi || !c.monthlyChurnCi) verdict = 'insufficient';
  else if (e.monthlyChurnCi.high < c.monthlyChurnCi.low) verdict = 'esim_lower';
  else if (c.monthlyChurnCi.high < e.monthlyChurnCi.low) verdict = 'card_lower';
  return { asOf, arms, verdict, minTrialsPerArm, minPeople };
}

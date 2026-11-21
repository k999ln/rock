'use client';

import { useEffect, useState } from 'react';
import type { ChurnReport, ChurnVerdict, Interval } from '@/lib/churn-cohort';
import type { NoahChurnResult } from '@/lib/noah-churn-api';
import styles from './noah-intake-review.module.css';

const percentage = new Intl.NumberFormat('ja-JP', { style: 'percent', maximumFractionDigits: 2 });
const verdicts: Record<ChurnVerdict, string> = {
  insufficient: '判定に必要な試行数が足りません',
  esim_lower: 'eSIM つきの月ごとの解約率が低い',
  card_lower: 'カードだけの月ごとの解約率が低い',
  unclear: '95% 信頼区間が重なり、差は判定できません',
};

function rate(value: number | null, interval: Interval | null) {
  if (value === null || interval === null) return '対象なし';
  return `${percentage.format(value)}（95% 信頼区間 ${percentage.format(interval.low)}〜${percentage.format(interval.high)}）`;
}

export default function NoahChurnReview({ ownerScope }: { ownerScope: string }) {
  const [result, setResult] = useState<NoahChurnResult | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/noah/churn', { signal: controller.signal, cache: 'no-store' })
      .then(async (response) => {
        if (response.status === 404) return;
        if (!response.ok) throw new Error('離脱率を確認できません。');
        const data = await response.json() as NoahChurnResult;
        if (data.ownerScope !== ownerScope) throw new Error('アカウントが変わりました。再読込してください。');
        if (!controller.signal.aborted) setResult(data);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setError(error instanceof Error ? error.message : '離脱率を確認できません。');
      });
    return () => controller.abort();
  }, [ownerScope]);

  if (!result && !error) return null;
  return (
    <section className={styles.intake} aria-labelledby="noah-churn-heading">
      <h2 id="noah-churn-heading">eSIM の離脱率</h2>
      {error && <p role="alert">{error}</p>}
      {result && (result.report
        ? <ChurnSummary report={result.report} />
        : <p>離脱率の計測は準備中です。</p>)}
    </section>
  );
}

export function ChurnSummary({ report }: { report: ChurnReport }) {
  return (
    <>
      <p>判定：{verdicts[report.verdict]}。</p>
      {Object.values(report.arms).map((arm) => (
        <div key={arm.arm}>
          <h3>{arm.arm === 'esim' ? 'eSIM つき' : 'カードだけ（PWA）'}</h3>
          {arm.shown ? (
            <dl>
              <dt>支払い済みの契約</dt><dd>{arm.people} 件</dd>
              <dt>月ごとの解約率</dt>
              <dd>{rate(arm.monthlyChurn, arm.monthlyChurnCi)} ／ 解約 {arm.cancels} 件・試行 {arm.trials} 回</dd>
              <dt>3 か月の継続率</dt>
              <dd>{rate(arm.retention3Months, arm.retention3MonthsCi)} ／ 継続 {arm.retained3Months} 件・対象 {arm.eligibleFor3Months} 件</dd>
            </dl>
          ) : <p>{report.minPeople} 人に達するまで非表示です。</p>}
        </div>
      ))}
    </>
  );
}

'use client';

import { useEffect, useState } from 'react';
import type { CloudOperationsReport } from '@/lib/cloud-operations-store';
import styles from './noah-intake-review.module.css';

const usd = new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'USD', maximumFractionDigits: 6 });
const percent = new Intl.NumberFormat('ja-JP', { style: 'percent', maximumFractionDigits: 2 });
const seconds = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 2 });

function formatRate(good: number, total: number) {
  return total ? percent.format(good / total) : '未計測';
}

export function CloudOperationsSummary({ report }: { report: CloudOperationsReport }) {
  const month = report.days.reduce((total, day) => ({
    observed: total.observed + day.observed,
    successes: total.successes + day.successes,
    expected: total.expected + day.expected,
  }), { observed: 0, successes: 0, expected: 0 });
  return (
    <>
      <p>{report.month}（UTC）の記録済み実費 {usd.format(report.totalUsd)} ／ 全体上限 {usd.format(report.budget.totalUsd)} ／ 1 人の上限 {usd.format(report.budget.userUsd)}</p>
      {report.unpriced > 0 && <output>単価未確定 {report.unpriced} 件。表示の実費は下限です。</output>}
      <p>月の受付成功率 {formatRate(month.successes, month.observed)}（目標 99.5%）。成功 {month.successes} ／ 観測 {month.observed} ／ 予定 {month.expected}。</p>
      <div style={{ overflowX: 'auto' }}>
        <table>
          <caption>日別の受付と最初の成果（UTC）</caption>
          <thead><tr>
            <th scope="col">日付</th>
            <th scope="col">受付成功率</th>
            <th scope="col">成功 ／ 観測 ／ 予定</th>
            <th scope="col">成果まで 30 秒以内（目標 95%）</th>
            <th scope="col">観測した最初の成果までの 95 パーセンタイル</th>
          </tr></thead>
          <tbody>{report.days.slice().reverse().map((day) => (
            <tr key={day.day}>
              <th scope="row">{day.day}</th>
              <td>{formatRate(day.successes, day.observed)}</td>
              <td>{day.successes} ／ {day.observed} ／ {day.expected}</td>
              <td>{formatRate(day.within30s, day.eligible)}（{day.within30s} ／ {day.eligible}）</td>
              <td>{day.p95Ms === null ? '未計測' : `${seconds.format(day.p95Ms / 1000)} 秒`}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </>
  );
}

export default function NoahCloudOperations({ ownerScope }: { ownerScope: string }) {
  const [report, setReport] = useState<CloudOperationsReport | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/noah/cloud-operations', { cache: 'no-store', signal: controller.signal }).then(async (response) => {
      if (response.status === 404) return;
      if (!response.ok) throw new Error('クラウドの運営データを確認できません。');
      const data = await response.json() as { ownerScope: string; report: CloudOperationsReport };
      if (data.ownerScope !== ownerScope) throw new Error('アカウントが変わりました。再読込してください。');
      if (!controller.signal.aborted) setReport(data.report);
    }).catch((reason: unknown) => {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'クラウドの運営データを確認できません。');
    });
    return () => controller.abort();
  }, [ownerScope]);

  if (!report && !error) return null;
  return <section className={styles.intake} aria-labelledby="noah-cloud-operations-title">
    <h2 id="noah-cloud-operations-title">クラウド運営</h2>
    {error && <p role="alert">{error}</p>}
    {report && <CloudOperationsSummary report={report} />}
  </section>;
}

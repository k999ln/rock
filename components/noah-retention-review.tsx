'use client';
/**
 * 運営の画面（/noah/review）の「続けて使う割合」の節（task 103）。「試行」の節の隣。
 * eSIM を入れて始めた人と、入れずに始めた人の、月ごとのやめた割合と 3 か月の継続を、95% の幅と一緒に出す。
 * 1 人ずつの行は出さない。5 人未満の組は、数を出さない。審査者でなければ、入口が 404 を返すので、何も出さない。
 */
import { useEffect, useState } from 'react';
import styles from './noah-intake-review.module.css';

type Interval = { low: number; high: number };
type Arm = {
  arm: 'esim' | 'card';
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
type Report = {
  asOf: number;
  arms: Record<'esim' | 'card', Arm>;
  verdict: 'insufficient' | 'esim_lower' | 'card_lower' | 'unclear';
  minTrialsPerArm: number;
  minPeople: number;
  ownerScope: string;
  error?: string;
};

const LABELS = { esim: 'eSIM を入れて始めた人', card: 'eSIM なしで始めた人' } as const;
const percent = (value: number | null) => (value === null ? '—' : `${(value * 100).toFixed(1)}%`);
const range = (value: Interval | null) => (value ? `（95% の幅 ${percent(value.low)}〜${percent(value.high)}）` : '');

function verdictText(report: Report): string {
  if (report.verdict === 'esim_lower') return 'eSIM を入れて始めた人の方が、やめる割合が低い（幅が重なっていない）。';
  if (report.verdict === 'card_lower') return 'eSIM なしで始めた人の方が、やめる割合が低い（幅が重なっていない）。';
  if (report.verdict === 'unclear') return '差があるとは、まだ言えない（幅が重なっている）。';
  return `まだ言えない（どちらかの組が ${report.minPeople} 人未満か、結果の出た月が ${report.minTrialsPerArm} 未満）。`;
}

export default function NoahRetentionReview({ ownerScope }: { ownerScope: string }) {
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/noah/retention', { signal: controller.signal, cache: 'no-store' })
      .then(async (response) => {
        if (response.status === 404) return;
        const data = (await response.json()) as Report;
        if (!response.ok) throw Error(data.error ?? '続けて使う割合を読み込めません。');
        if (data.ownerScope !== ownerScope) throw Error('アカウントが変わりました。再読込してください。');
        if (!controller.signal.aborted) {
          setReport(data);
          setError('');
        }
      })
      .catch((e: unknown) => {
        if (!controller.signal.aborted) setError(e instanceof Error ? e.message : '続けて使う割合を読み込めません。');
      });
    return () => controller.abort();
  }, [ownerScope, refresh]);

  if (!report && !error) return null;
  return (
    <section className={styles.intake} aria-labelledby="noah-retention-heading">
      <h2 id="noah-retention-heading">続けて使う割合（eSIM あり・なし）</h2>
      {error && <p role="alert">{error}</p>}
      <button type="button" onClick={() => setRefresh((n) => n + 1)}>更新する</button>
      {report && (
        <>
          <p>{verdictText(report)}</p>
          {(['esim', 'card'] as const).map((key) => {
            const arm = report.arms[key];
            return (
              <div key={key}>
                <h3>{LABELS[key]}</h3>
                {arm.shown ? (
                  <>
                    <p>人数 {arm.people} 人 ／ 結果の出た月 {arm.trials} ／ やめた人 {arm.cancels} 人</p>
                    <p>月ごとのやめた割合 {percent(arm.monthlyChurn)}{range(arm.monthlyChurnCi)}</p>
                    <p>
                      3 か月続いた割合 {percent(arm.retention3Months)}{range(arm.retention3MonthsCi)}（始めてから 3 か月たった {arm.eligibleFor3Months} 人のうち {arm.retained3Months} 人）
                    </p>
                  </>
                ) : (
                  <p>{report.minPeople} 人未満なので、数を出しません。</p>
                )}
              </div>
            );
          })}
          <p>
            数え方: 1 か月（UTC）に 1 回でも Noah で頼めば、その月は続けた。頼まなかった月が終わったら、その前の月でやめた。今の月は、まだ数えない。組は、最初に頼んだ時に eSIM
            の利用権があったかで決める。集計の時刻: {new Date(report.asOf).toLocaleString('ja-JP')}
          </p>
        </>
      )}
    </section>
  );
}

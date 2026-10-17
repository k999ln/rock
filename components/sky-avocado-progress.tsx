'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import styles from './sky-avocado-progress.module.css';

type Month = {
  id: string;
  completedChecks: number;
  nextAction: string;
  skyStatus: string;
  skyEvidence: string;
};
type Progress = { startMonth: string; revision: number; updatedAt: string | null; months: Month[] };
const planner = 'https://avocado-princeton-progress.noellesugar1.chatgpt.site/planner';
const statusNames: Record<string, string> = {
  not_started: 'Sky未着手', prepared: '依頼準備済み', tried: 'Skyで試行', evidence: '証拠あり',
};

function dateFor(startMonth: string, index: number) {
  const [year, month] = startMonth.split('-').map(Number);
  return new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: 'long', timeZone: 'UTC' })
    .format(new Date(Date.UTC(year, month - 1 + index, 1)));
}

export default function AvocadoProgress() {
  const [data, setData] = useState<Progress | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState(1);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/sky/avocado-progress', { cache: 'no-store' });
      const result = await response.json() as Progress & { error?: string };
      if (!response.ok) throw new Error(result.error || '同期できませんでした。');
      if (!Array.isArray(result.months) || !/^20\d\d-(0[1-9]|1[0-2])$/.test(result.startMonth)) throw new Error('進捗の形式が正しくありません。');
      setData(result);
      setError('');
      setLastChecked(new Date());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '同期できませんでした。');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => { void refresh(); }, 0);
    const timer = window.setInterval(() => { void refresh(); }, 60_000);
    return () => { window.clearTimeout(initial); window.clearInterval(timer); };
  }, [refresh]);

  const months = useMemo(() => {
    const byId = new Map(data?.months.map((month) => [month.id, month]) ?? []);
    return Array.from({ length: 48 }, (_, index) => {
      const id = `y${Math.floor(index / 12) + 1}m${index % 12 + 1}`;
      return { index, id, state: byId.get(id) };
    });
  }, [data]);
  const completedChecks = months.reduce((sum, month) => sum + (month.state?.completedChecks ?? 0), 0);
  const completedMonths = months.filter((month) => month.state?.completedChecks === 3).length;
  const evidenceMonths = months.filter((month) => month.state?.skyStatus === 'evidence').length;
  const next = months.find((month) => (month.state?.completedChecks ?? 0) < 3);
  const visible = months.filter((month) => Math.floor(month.index / 12) + 1 === year);
  const pitch = `avocado × Sky｜建築・インテリアの4年間\n48か月中 ${completedMonths}か月達成、Skyの証拠を記録した月 ${evidenceMonths}件。\n次にすること：${next?.state?.nextAction || '個人プランで次の一歩を決める'}\n学業と生活を軸に、空間の課題を観察し、SkyのAgent・Toolを必要な場面で試す。仲間の声と試作の根拠を残し、使う人が安心できる作品へつなげる。\n※進捗は本人の記録であり、Skyの実行成功・第三者検証を自動認定しない。`;

  return <main className={styles.page}>
    <header className={styles.header}>
      <Link href="/sky" className={styles.back}>← Sky</Link>
      <span className={styles.private}>OWNER-ONLY · LIVE SYNC</span>
    </header>
    <section className={styles.hero}>
      <div><p className={styles.eyebrow}>AVOCADO × ARCHITECTURE × SKY</p><h1>4年間を、作品につなぐ。</h1>
        <p>Princetonで学び、avocadoを建築とインテリアに組み込む。月ごとの行動とSkyでの試行を、ここで一緒に確認できます。</p></div>
      <div className={styles.actions}><a href={planner} target="_blank" rel="noopener noreferrer" className={styles.primary}>個人プランを編集 ↗</a><button type="button" onClick={() => void refresh()}>今すぐ同期</button></div>
    </section>
    {loading && !data ? <output>個人プランと同期しています…</output> : null}
    {error ? <div className={styles.error} role="alert">{error} <button type="button" onClick={() => void refresh()}>再試行</button></div> : null}
    {data ? <>
      <div className={styles.sync}>個人プランが原本 · 60秒ごとに再取得 · 最終確認 {lastChecked?.toLocaleTimeString('ja-JP') ?? '—'} · 保存 {data.updatedAt ? new Date(data.updatedAt).toLocaleString('ja-JP') : '未保存'}</div>
      <section className={styles.metrics} aria-label="進捗の概要">
        <div><strong>{Math.round(completedChecks / 144 * 100)}%</strong><span>144項目の達成率</span></div>
        <div><strong>{completedMonths}<small> / 48</small></strong><span>達成した月</span></div>
        <div><strong>{evidenceMonths}</strong><span>Skyの証拠を記録した月</span></div>
      </section>
      <section className={styles.next}>
        <p className={styles.eyebrow}>NEXT ACTION</p><h2>次にすること</h2>
        <p>{next ? `${dateFor(data.startMonth, next.index)} · ${next.state?.nextAction || '個人プランで具体的な一歩を決める'}` : '48か月のチェック項目がすべて完了しました。'}</p>
        <a href={planner} target="_blank" rel="noopener noreferrer">行動を記録する ↗</a>
      </section>
      <section className={styles.roadmap}>
        <div className={styles.sectionTitle}><div><p className={styles.eyebrow}>FOUR-YEAR ROADMAP</p><h2>月ごとの到達点</h2></div><div className={styles.tabs}>{[1,2,3,4].map((item) => <button key={item} type="button" aria-pressed={year === item} onClick={() => setYear(item)}>{item}年目</button>)}</div></div>
        <div className={styles.months}>{visible.map(({ id, index, state }) => <article key={id} className={styles.month}>
          <div><span>{dateFor(data.startMonth, index)}</span><strong>{state?.completedChecks ?? 0} / 3</strong></div>
          <div className={styles.bar}><i style={{ width: `${Math.min(3, Math.max(0, state?.completedChecks ?? 0)) / 3 * 100}%` }} /></div>
          <p>{state?.nextAction || '次の一歩は未記入'}</p>
          <small>{statusNames[state?.skyStatus ?? 'not_started'] || 'Sky未着手'}</small>
          {state?.skyEvidence ? <a href={state.skyEvidence} target="_blank" rel="noopener noreferrer">登録した証拠 ↗</a> : null}
        </article>)}</div>
      </section>
      <section className={styles.pitch}><div><p className={styles.eyebrow}>A CASE FOR SKY</p><h2>Skyに示せる現在地</h2><p>実績と未検証を分けた短い説明。本人が確認してから使ってください。</p></div><pre>{pitch}</pre><button type="button" onClick={() => void navigator.clipboard.writeText(pitch)}>説明をコピー</button></section>
      <p className={styles.footer}>制作メモや回復の記録はSkyには複製していません。Sky上の証拠は本人の登録内容であり、実行receiptとは別です。</p>
    </> : null}
  </main>;
}

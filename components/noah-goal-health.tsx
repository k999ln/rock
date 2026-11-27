'use client';

import Link from 'next/link';
import { useMemo, useState, useSyncExternalStore } from 'react';
import {
  NOAH_GOAL_HEALTH_ITEMS, NOAH_GOAL_HEALTH_NOTE_MAX, NOAH_GOAL_HEALTH_NOTICE,
  noahGoalHealthParse, noahGoalHealthProgress, noahGoalHealthRecord, noahGoalHealthReview, noahGoalHealthToday,
  type NoahGoalHealthItem,
} from '@/lib/noah-goal-health';
import { noahGoalHealthSaved, noahGoalHealthSubscribe, noahGoalHealthWrite as write } from '@/lib/noah-goal-health-store';
import styles from './noah-unified.module.css';
import own from './noah-goal-health.module.css';

const ITEM_LABEL: Record<NoahGoalHealthItem, string> = { sleep: '睡眠', body: '体', mood: '気分' };
const CHANGE: Record<'up' | 'down' | 'same', string> = { up: '先週より高い', down: '先週より低い', same: '先週と同じ' };
const dayLabel = (date: string) => { const [, m, d] = date.split('-'); return `${Number(m)}月${Number(d)}日`; };
// 記録は、この端末のブラウザの保存先にだけ置く（lib/noah-goal-health-store.ts）。サーバーで描く時は、まだ読まない。
const SERVER = '\u0000server';
const never = () => () => undefined;

/** 目的型の Agent「体調ノート」（docs/noah/spec-goal-health.md）。 */
export default function NoahGoalHealth() {
  const raw = useSyncExternalStore(noahGoalHealthSubscribe, noahGoalHealthSaved, () => SERVER);
  const today = useSyncExternalStore(never, () => noahGoalHealthToday(), () => '');
  const log = useMemo(() => (raw === SERVER || !today ? null : noahGoalHealthParse(raw, today)), [raw, today]);
  const saved = log && today ? log.entries[today] : undefined;
  const [edits, setEdits] = useState<Partial<Record<NoahGoalHealthItem, number>>>({});
  const [noteEdit, setNoteEdit] = useState<string | null>(null);
  // 知らせは、押したボタンのすぐ下に出す（スマホでは、ページの上に出すと画面の外になって見えない。2026-11-28）。
  const [notice, setNotice] = useState<{ where: 'save' | 'data'; text: string; error: boolean } | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const value = (key: NoahGoalHealthItem) => edits[key] ?? saved?.[key] ?? null;
  const note = noteEdit ?? saved?.note ?? '';
  const ready = NOAH_GOAL_HEALTH_ITEMS.every((item) => value(item.key) !== null);
  const review = useMemo(() => (log && today ? noahGoalHealthReview(log, today) : null), [log, today]);
  const progress = log ? noahGoalHealthProgress(log) : null;
  const unstored = '端末には保存できませんでした（ブラウザの設定で、サイトの保存が止まっています）。この画面を閉じると消えます。';

  function save() {
    if (!log || !ready) return;
    try {
      const next = noahGoalHealthRecord(log, today, { sleep: value('sleep')!, body: value('body')!, mood: value('mood')!, note });
      const stored = write(JSON.stringify(next));
      setNotice({ where: 'save', text: stored ? `${dayLabel(today)}の記録を、この端末に保存しました。` : unstored, error: !stored });
      setEdits({}); setNoteEdit(null);
    } catch (failure) {
      setNotice({ where: 'save', text: failure instanceof Error ? failure.message : '保存できませんでした。', error: true });
    }
  }
  function download() {
    if (!log) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(log, null, 1)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url; link.download = `noah-health-note-${today}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }
  function erase() {
    if (!confirmingDelete) { setConfirmingDelete(true); return; }
    setConfirmingDelete(false); setEdits({}); setNoteEdit(null);
    const stored = write(null);
    setNotice({ where: 'data', text: stored ? 'この端末の記録を、全部消しました。' : unstored, error: !stored });
  }

  const history = log ? Object.keys(log.entries).sort((a, b) => b.localeCompare(a)).slice(0, 14) : [];
  const shown = (where: 'save' | 'data') => notice?.where !== where ? null
    : notice.error ? <p role="alert" className={styles.error}>{notice.text}</p> : <output className={own.saved}>{notice.text}</output>;
  return <main className={styles.page}>
    <Link className={styles.back} href="/noah">Noahに戻る</Link>
    <header className={styles.heading}><h1>体調ノート</h1></header>
    <p className={own.lead}>目的型のAgent（無料）。毎朝の体調を3つ記録して、週ごとに振り返ります。4週間（28日分）そろったら完成です。</p>
    <div className={styles.groups}>
      <p className={own.notice}>{NOAH_GOAL_HEALTH_NOTICE}</p>
      {!log && <output>記録を読んでいます…</output>}
      {log && progress && <>
        <section className={styles.task} aria-labelledby="health-today">
          <h2 id="health-today">今朝の記録（{dayLabel(today)}）</h2>
          {NOAH_GOAL_HEALTH_ITEMS.map((item) => <fieldset key={item.key} className={own.question}>
            <legend>{item.question}</legend>
            <div className={own.scale}>{[1, 2, 3, 4, 5].map((step) => <button key={step} type="button" aria-pressed={value(item.key) === step}
              aria-label={`${item.question}: ${step}（1 は${item.low}、5 は${item.high}）`} onClick={() => setEdits((current) => ({ ...current, [item.key]: step }))}>{step}</button>)}</div>
            <div className={own.ends}><span>1 {item.low}</span><span>5 {item.high}</span></div>
          </fieldset>)}
          <label className={own.note}>メモ（なくてもよい。{NOAH_GOAL_HEALTH_NOTE_MAX}字まで）
            <textarea value={note} maxLength={NOAH_GOAL_HEALTH_NOTE_MAX} onChange={(event) => setNoteEdit(event.target.value)} />
          </label>
          <div className={styles.actions}><button type="button" className={styles.primary} disabled={!ready} onClick={save}>この端末に保存する</button></div>
          {shown('save')}
        </section>

        <section className={styles.task} aria-labelledby="health-goal">
          <h2 id="health-goal">目的まで</h2>
          <div className={own.progress}>
            <span>{progress.days} / {progress.target} 日分</span>
            <progress className={own.bar} max={progress.target} value={Math.min(progress.days, progress.target)} aria-label="記録した日の数" />
          </div>
          {progress.done && <p className={own.done}>完成しました。28日分の体調の波を、自分で見られるようになりました。続けても、ここで終えても大丈夫です。</p>}
        </section>

        {review && <section className={styles.task} aria-labelledby="health-review">
          <h2 id="health-review">今週の振り返り（{dayLabel(review.week)}から）</h2>
          {review.days === 0 ? <p className={own.lead}>今週の記録は、まだありません。</p> : <>
            <p className={own.lead}>今週は{review.days}日分の記録があります。</p>
            <dl className={own.numbers}>{NOAH_GOAL_HEALTH_ITEMS.map((item) => <div key={item.key}>
              <dt>{ITEM_LABEL[item.key]}の平均</dt>
              <dd>{review.averages?.[item.key]}{review.change && <small className={own.change}>{CHANGE[review.change[item.key]]}（先週 {review.previous?.[item.key]}）</small>}</dd>
            </div>)}</dl>
            {review.best && <p className={own.lead}>3つの合計がいちばん高かった日: {dayLabel(review.best)}{review.hardest ? `／いちばん低かった日: ${dayLabel(review.hardest)}` : ''}</p>}
            {review.notes.length > 0 && <ul className={own.history}>{review.notes.map((item) => <li key={item.date}><strong>{dayLabel(item.date)}</strong><span>{item.note}</span></li>)}</ul>}
          </>}
        </section>}

        {history.length > 0 && <section className={styles.task} aria-labelledby="health-history">
          <h2 id="health-history">これまでの記録（新しい順・14日分まで）</h2>
          <ul className={own.history}>{history.map((date) => <li key={date}>
            <strong>{dayLabel(date)}</strong>
            <span>睡眠 {log.entries[date].sleep}・体 {log.entries[date].body}・気分 {log.entries[date].mood}</span>
            {log.entries[date].note && <span>{log.entries[date].note}</span>}
          </li>)}</ul>
        </section>}

        <section className={styles.task} aria-labelledby="health-data">
          <h2 id="health-data">記録の持ち出しと削除</h2>
          <p className={own.lead}>記録はこの端末のブラウザにだけあります。別の端末では見えません。ブラウザのデータを消すと、記録も消えます。</p>
          <div className={styles.actions}>
            <button type="button" className={styles.secondary} disabled={!history.length} onClick={download}>記録を書き出す（JSON）</button>
            <button type="button" className={styles.secondary} disabled={!history.length} onClick={erase}>{confirmingDelete ? 'もう一度押すと、全部消します' : 'この端末の記録を全部消す'}</button>
          </div>
          {shown('data')}
        </section>
      </>}
    </div>
  </main>;
}

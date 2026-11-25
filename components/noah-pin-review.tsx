'use client';

import { useEffect, useState } from 'react';
import { NOAH_PIN_REVIEW_API, NOAH_PIN_REVIEW_REASONS, NOAH_PIN_REVIEW_SIZE, noahPinReviewCounts, type NoahPinReviewBatch, type NoahPinReviewReason } from '@/lib/noah-pin-review-model';
import { OWNER_SCOPE_HEADER } from '@/lib/owner-intent';
import NoahPinSceneArt from './noah-pin-scene';
import styles from './noah-pin-review.module.css';

const PAGE_SIZE = 20;
type ReviewResponse = {
  error?: string; available?: number; batch?: NoahPinReviewBatch | null; id?: string; votes?: NoahPinReviewBatch['votes'];
};

async function requestReview(ownerScope: string, body?: Record<string, string>) {
  const response = await fetch(NOAH_PIN_REVIEW_API, body ? { method: 'POST', cache: 'no-store',
    headers: { 'Content-Type': 'application/json', [OWNER_SCOPE_HEADER]: ownerScope }, body: JSON.stringify(body) } : { cache: 'no-store' });
  const result = await response.json() as ReviewResponse;
  if (!response.ok) {
    const count = Number.isInteger(result.available) ? ` 現在は ${result.available} 件です。` : '';
    throw Error((result.error ?? '審査画面を読み込めません。') + count);
  }
  return result;
}
const errorMessage = (error: unknown) => error instanceof Error ? error.message : '審査画面を読み込めません。';

export default function NoahPinReview({ ownerScope }: { ownerScope: string }) {
  const [batch, setBatch] = useState<NoahPinReviewBatch | null>(null);
  const [page, setPage] = useState(0);
  const [pending, setPending] = useState(true);
  const [message, setMessage] = useState('');
  const [reason, setReason] = useState<Record<string, NoahPinReviewReason>>({});

  useEffect(() => {
    let active = true;
    void requestReview(ownerScope).then(
      (result) => { if (active) setBatch(result.batch ?? null); },
      (error: unknown) => { if (active) setMessage(errorMessage(error)); },
    ).finally(() => { if (active) setPending(false); });
    return () => { active = false; };
  }, [ownerScope]);

  async function submit(body?: Record<string, string>) {
    setPending(true);
    setMessage('');
    try {
      const result = await requestReview(ownerScope, body);
      if (body?.action === 'vote') {
        const { id, votes } = result;
        if (votes) setBatch((current) => current && current.id === id ? { ...current, votes } : current);
      } else setBatch(result.batch ?? null);
      if (body?.action === 'sample') {
        setPage(0);
        setReason({});
      }
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setPending(false);
    }
  }
  const counts = batch ? noahPinReviewCounts(batch) : null;
  const offset = page * PAGE_SIZE;
  return <section className={styles.review} aria-busy={pending}>
    {counts && <div className={styles.score}>
      <strong>合う {counts.matches} 件</strong>
      <span>審査済み {counts.reviewed} / {NOAH_PIN_REVIEW_SIZE} 件</span>
      <span>{counts.reviewed === NOAH_PIN_REVIEW_SIZE ? `一致率 ${(counts.matches / NOAH_PIN_REVIEW_SIZE * 100).toFixed(1)}%` : '全件の審査後に一致率を表示します。'}</span>
      {Object.entries(NOAH_PIN_REVIEW_REASONS).map(([key, label]) => <span key={key}>{label} {counts.reasons[key as NoahPinReviewReason]} 件</span>)}
    </div>}
    <div className={styles.actions}>
      <button type="button" onClick={() => submit()} disabled={pending}>読み直す</button>
      {(!batch || counts?.reviewed === NOAH_PIN_REVIEW_SIZE) && <button type="button" disabled={pending}
        onClick={() => submit({ action: 'sample', ...(batch ? { batchId: batch.id } : {}) })}>{batch ? '新しい 200 件を抽出する' : '無作為に 200 件を抽出する'}</button>}
    </div>
    {message && <p role="alert">{message}</p>}
    {!batch && !pending && !message && <p>審査する 200 件をまだ抽出していません。</p>}
    {batch && batch.entries.slice(offset, offset + PAGE_SIZE).map((entry, index) => {
      const vote = Object.hasOwn(batch.votes, entry.id) ? batch.votes[entry.id] : undefined;
      const number = offset + index + 1;
      return <article className={styles.entry} key={entry.id}>
        <div className={styles.comparison}>
          <div>
            <h2>{entry.name}</h2>
            <small>提供者の説明</small>
            <p className={styles.original}>{entry.original || '提供者の説明はありません。'}</p>
          </div>
          <div className={styles.result}>
            <NoahPinSceneArt scene={entry.pin.scene} tone={offset + index} />
            <h3>{entry.pin.title}</h3>
            <p>{entry.pin.give} → {entry.pin.get}</p>
          </div>
        </div>
        <div className={styles.actions}>
          <button type="button" aria-label={`${number} 件目は合う`} aria-pressed={vote === 'match'} disabled={pending}
            onClick={() => submit({ action: 'vote', batchId: batch.id, id: entry.id, vote: 'match' })}>合う</button>
          <select aria-label={`${number} 件目が合わない理由`} value={reason[entry.id] ?? (vote !== 'match' ? vote : undefined) ?? ''}
            onChange={(event) => setReason({ ...reason, [entry.id]: event.target.value as NoahPinReviewReason })}>
            <option value="">理由を選ぶ</option>
            {Object.entries(NOAH_PIN_REVIEW_REASONS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
          <button type="button" aria-label={`${number} 件目は合わない`} aria-pressed={!!vote && vote !== 'match'} disabled={pending || !reason[entry.id]}
            onClick={() => submit({ action: 'vote', batchId: batch.id, id: entry.id, vote: reason[entry.id] })}>合わない</button>
        </div>
      </article>;
    })}
    {batch && <nav className={styles.actions} aria-label="審査のページ">
      <button type="button" disabled={page === 0} onClick={() => setPage(page - 1)}>前の 20 件</button>
      <span>{offset + 1}〜{Math.min(offset + PAGE_SIZE, batch.entries.length)} 件</span>
      <button type="button" disabled={offset + PAGE_SIZE >= batch.entries.length} onClick={() => setPage(page + 1)}>次の 20 件</button>
    </nav>}
  </section>;
}

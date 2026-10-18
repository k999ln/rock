'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, RefreshCw } from 'lucide-react';
import type { WorkJob } from '@/lib/workflow';
import styles from './sky-work-ledger.module.css';

type LedgerState =
  | { kind: 'loading' }
  | { kind: 'signin' }
  | { kind: 'error' }
  | { kind: 'ready'; jobs: WorkJob[] };

function statusFor(job: WorkJob) {
  if (job.freeCloud?.state === 'unconfirmed') return '外部結果を確認中';
  if (job.freeCloud?.state === 'sending') return '外部へ送信中';
  if (job.status === 'review') return '本人の確認待ち';
  if (job.status === 'completed') return '完了を記録';
  if (job.status === 'cancelled') return '中止を記録';
  if (job.freeCloud?.state === 'waiting' || job.freeCloud?.state === 'queued') return '実行待ち';
  return '作業中';
}

export default function SkyWorkLedger() {
  const [state, setState] = useState<LedgerState>({ kind: 'loading' });
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch('/api/work-jobs', {
          cache: 'no-store',
          credentials: 'same-origin',
          signal: controller.signal,
        });
        if (response.status === 401) {
          setState({ kind: 'signin' });
          return;
        }
        if (!response.ok) throw new Error('仕事を取得できませんでした');
        const result = (await response.json()) as { jobs?: WorkJob[] };
        if (!Array.isArray(result.jobs)) throw new Error('仕事の形式が不正です');
        setState({ kind: 'ready', jobs: result.jobs.slice(0, 3) });
      } catch {
        if (!controller.signal.aborted) setState({ kind: 'error' });
      }
    })();
    return () => controller.abort();
  }, [refresh]);

  function retry() {
    setState({ kind: 'loading' });
    setRefresh((value) => value + 1);
  }

  return (
    <section className={styles.panel} aria-labelledby="sky-work-ledger-title">
      <div className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>WORK / SAVED STATE</p>
          <h2 id="sky-work-ledger-title">仕事の現在地</h2>
        </div>
        <button type="button" onClick={retry} aria-label="仕事の状態を再読み込み" disabled={state.kind === 'loading'}>
          <RefreshCw size={15} aria-hidden="true" /> 更新
        </button>
      </div>
      {state.kind === 'loading' && <output className={styles.message}>保存された仕事を確認中…</output>}
      {state.kind === 'signin' && <p className={styles.message}>自分の仕事を見るにはサインインが必要です。<Link href="/work">仕事の画面へ <ArrowRight size={14} /></Link></p>}
      {state.kind === 'error' && <p className={styles.message} role="alert">状態を取得できません。未取得を「仕事なし」とは表示しません。<button type="button" onClick={retry}>再試行</button></p>}
      {state.kind === 'ready' && state.jobs.length === 0 && <p className={styles.message}>Skyに保存された仕事はまだありません。<Link href="/work">仕事を作る <ArrowRight size={14} /></Link></p>}
      {state.kind === 'ready' && state.jobs.length > 0 && (
        <ul className={styles.jobs}>
          {state.jobs.map((job) => (
            <li key={job.id} className={styles.job}>
              <Link className={styles.title} href={`/work?workJob=${encodeURIComponent(job.id)}`} aria-label={`${job.title}の詳細を見る`}>
                <span>{job.title}</span> <ArrowRight size={14} aria-hidden="true" />
              </Link>
              <span className={styles.state}>{statusFor(job)}</span>
              <small>手順の記録 {job.steps.filter((step) => step.passed).length}/{job.steps.length}</small>
            </li>
          ))}
        </ul>
      )}
      <div className={styles.foot}>
        <p>完了記録は成果の検証済みを意味しません。承認・外部送信・成果の根拠は仕事の詳細で確認してください。</p>
        <Link href="/work">仕事の詳細を見る <ArrowRight size={15} /></Link>
      </div>
    </section>
  );
}

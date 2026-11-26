'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState, type SubmitEvent } from 'react';
import type { noahFirstEarningStore } from '@/lib/noah-first-earning';
import { OWNER_SCOPE_HEADER, readOwnerScope } from '@/lib/owner-intent';
import styles from './noah-unified.module.css';
import formStyle from './noah-first-earning.module.css';

type Progress = NonNullable<Awaited<ReturnType<ReturnType<typeof noahFirstEarningStore>['status']>>>;
type State = { ownerScope: string; reviewer: boolean; firstEarning: Progress | null };
const endpoint = '/api/noah/first-earning';
const stages: Record<Progress['stage'], string> = {
  preparing: '契約確認待ち', contracted: '制作・納品', delivered: '検収・売上確定待ち',
  payout_pending: '銀行振込待ち', bank_reported: '着金の照合中', bank_confirmed: '着金確認済み', cancelled: '案件を停止中',
};

function timeLabel(ms: number) {
  const seconds = Math.floor(ms / 1000);
  return seconds < 60 ? `${seconds}秒` : `${Math.floor(seconds / 60)}分${seconds % 60 ? `${seconds % 60}秒` : ''}`;
}

export default function NoahFirstEarning() {
  const [state, setState] = useState<State | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [signedOut, setSignedOut] = useState(false);
  const [target, setTarget] = useState('');
  const [reviewing, setReviewing] = useState('');

  const read = useCallback(async (scope = '', signal?: AbortSignal) => {
    try {
      const path = scope ? `${endpoint}?${new URLSearchParams({ scope })}` : endpoint;
      const response = await fetch(path, { cache: 'no-store', signal });
      const body = await response.json() as State & { error?: string };
      if (!response.ok) {
        setSignedOut(response.status === 401);
        if (response.status === 401) setState(null);
        throw Error(body.error);
      }
      setState(body);
      setReviewing(scope);
      setSignedOut(false);
    } catch (err) {
      if (!signal?.aborted) setError(err instanceof Error ? err.message : '進捗を読み込めませんでした。');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => void read('', controller.signal), 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [read]);

  function refresh(scope = '') {
    setLoading(true);
    setError('');
    void read(scope);
  }

  const progress = state?.firstEarning;
  async function update(action: string, values: Record<string, unknown> = {}) {
    if (!state || loading) return;
    setLoading(true);
    setError('');
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', [OWNER_SCOPE_HEADER]: state.ownerScope },
        body: JSON.stringify({ action, revision: progress?.revision, ...(reviewing ? { scope: reviewing } : {}), ...values }),
      });
      const body = await response.json() as State & { error?: string };
      if (!response.ok) throw Error(body.error);
      setState(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : '進捗を保存できませんでした。');
    } finally {
      setLoading(false);
    }
  }

  function report(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    void update('reportBank', { amountYen: Number(values.get('amount')), bankDate: values.get('date') });
  }
  function submitProof(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    void update(progress?.stage === 'preparing' ? 'contract' : 'verifyBank', {
      reference: values.get('reference'), checked: values.get('checked') === 'on',
    });
  }

  return <main className={styles.page}>
    <Link className={styles.back} href="/noah">Noahに戻る</Link>
    <header className={styles.heading}><h1>初回の売上</h1></header>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {signedOut && <Link className={styles.primary} href="/noah/account?mode=login&returnTo=%2Fnoah%2Ffirst-earning">サインイン</Link>}
    {loading && <output>進捗を確認中…</output>}
    {state && <div className={styles.groups}>
      {state.reviewer && <section className={styles.task}>
        <h2>試行の運営</h2>
        <form className={formStyle.form} onSubmit={event => { event.preventDefault(); const scope = readOwnerScope(target.trim()); if (scope) refresh(scope); }}>
          <label>利用者の確認コード<input value={target} onChange={event => setTarget(event.target.value)} required autoComplete="off" /></label>
          <div className={styles.actions}>
            <button className={styles.secondary} disabled={loading || !readOwnerScope(target.trim())}>進捗を開く</button>
            {reviewing && <button className={styles.secondary} type="button" disabled={loading} onClick={() => refresh()}>自分の進捗に戻る</button>}
          </div>
        </form>
      </section>}
      {!progress && <section className={styles.task}>
        {reviewing
          ? <button className={styles.primary} disabled={loading} onClick={() => void update('enroll')}>この利用者を登録する</button>
          : <><p>担当者に確認コードを伝えると、初回の仕事を始められます。</p><label className={formStyle.form}>利用者の確認コード<input value={state.ownerScope} readOnly onFocus={event => event.currentTarget.select()} /></label></>}
      </section>}
      {progress && <section className={styles.task}>
        {!reviewing && progress.offerPaidPlan && progress.amountYen !== null
          ? <div className={formStyle.offer} aria-live="polite">
            <h2>初めての売上 ¥{progress.amountYen.toLocaleString('ja-JP')} が口座に入りました</h2>
            <p>次の案件に使う有料クラウドプランは、契約受付を準備中です。</p>
          </div>
          : <>
            <h2>{stages[progress.stage]}</h2>
            <p>使えるAI実行時間 <strong>{timeLabel(progress.availableMs)}</strong></p>
            <p className={styles.meta}>無料枠は累計150分です。実行中は時間を取り置き、終了後に未使用分を戻します。</p>
          </>}
        {progress.stage === 'preparing' && <p>準備には30分まで使えます。契約の確認後に、制作・修正用の枠が開きます。</p>}
        {!reviewing && <>
          <div className={styles.actions}>
            <Link className={styles.secondary} href="/noah/saved?tab=files">成果を開く</Link>
            <a className={styles.secondary} href="https://coconala.com/mypage" target="_blank" rel="noreferrer">ココナラの取引を開く</a>
            <button className={styles.secondary} disabled={loading} onClick={() => refresh()}>進捗を再確認</button>
          </div>
          {progress.stage === 'contracted' && <div className={styles.actions}>
            <button className={styles.primary} disabled={loading} onClick={() => void update('deliver')}>ココナラで正式に納品した</button>
          </div>}
          {progress.stage === 'payout_pending' && <form className={formStyle.form} onSubmit={report}>
            <p>取引と振込予定はココナラで確認できます。口座への着金を確認したら、今回の案件の手取りを記録してください。</p>
            <label>受け取った金額（円）<input name="amount" type="number" min="1" max="1000000000" required /></label>
            <label>口座に入った日<input name="date" type="date" required /></label>
            <div className={styles.actions}><button className={styles.primary} disabled={loading}>口座に入ったことを報告する</button></div>
          </form>}
          {progress.stage === 'bank_reported' && <div className={styles.actions}>
            <button className={styles.secondary} disabled={loading} onClick={() => void update('returnBank')}>報告を訂正する</button>
          </div>}
        </>}
        {reviewing && <>
          {progress.amountYen !== null && <p>着金報告 ¥{progress.amountYen.toLocaleString('ja-JP')} · {progress.bankDate}</p>}
          {(progress.stage === 'preparing' || progress.stage === 'bank_reported') && <form className={formStyle.form} onSubmit={submitProof}>
            <label>{progress.stage === 'preparing' ? 'ココナラの取引識別番号' : '今回の振込を照合した証拠の管理番号'}
              <input name="reference" autoComplete="off" required minLength={6} maxLength={100} pattern="[A-Za-z0-9_\x2D]+" />
            </label>
            {progress.stage === 'bank_reported' && <label className={formStyle.check}>
              <input name="checked" type="checkbox" required />
              実際の買い手との取引、検収、今回の手取りと本人の銀行着金を照合しました。
            </label>}
            <div className={styles.actions}><button className={styles.primary} disabled={loading}>
              {progress.stage === 'preparing' ? '取引を確認した' : '銀行着金を確認した'}
            </button></div>
          </form>}
          <div className={styles.actions}>
            {progress.stage === 'delivered' && <button className={styles.primary} disabled={loading} onClick={() => void update('payoutPending')}>検収・売上確定を確認した</button>}
            {['bank_reported', 'bank_confirmed'].includes(progress.stage) && <button className={styles.secondary} disabled={loading} onClick={() => void update('returnBank')}>振込待ちに戻す</button>}
            {progress.stage === 'cancelled'
              ? <button className={styles.secondary} disabled={loading} onClick={() => void update('restart')}>別の案件で再開</button>
              : progress.stage !== 'bank_confirmed' && <button className={styles.secondary} disabled={loading} onClick={() => void update('cancel')}>この案件を停止する</button>}
          </div>
        </>}
      </section>}
    </div>}
  </main>;
}

'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { operationRequest, OperationRequestError } from '@/lib/operations-client';
import type { SkyConnection } from '@/lib/operations';
import styles from './sky-free-article-order.module.css';

const toolId = 'mr-free-article';
const launchPath = '/zema/tools/mr-free-article';
type OrderState = 'checking' | 'ready' | 'connecting' | 'connected' | 'signin' | 'unavailable';

export default function SkyFreeArticleOrder() {
  const [state, setState] = useState<OrderState>('checking');
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  const requestGeneration = useRef(0);

  async function checkConnection() {
    const generation = ++requestGeneration.current;
    setState('checking');
    setError('');
    try {
      const connections = await operationRequest<SkyConnection[]>('/api/sky/connections');
      if (generation !== requestGeneration.current) return;
      setState(connections.some((connection) => connection.tool === toolId && connection.scope === 'execute') ? 'connected' : 'ready');
    } catch (cause) {
      if (generation !== requestGeneration.current) return;
      if (cause instanceof OperationRequestError && cause.status === 401) setState('signin');
      else {
        setError('接続状態を確認できません。通信を確認して、もう一度お試しください。');
        setState('unavailable');
      }
    }
  }

  useEffect(() => {
    const generation = ++requestGeneration.current;
    void operationRequest<SkyConnection[]>('/api/sky/connections').then((connections) => {
      if (generation !== requestGeneration.current) return;
      setState(connections.some((connection) => connection.tool === toolId && connection.scope === 'execute') ? 'connected' : 'ready');
    }).catch((cause: unknown) => {
      if (generation !== requestGeneration.current) return;
      if (cause instanceof OperationRequestError && cause.status === 401) setState('signin');
      else {
        setError('接続状態を確認できません。通信を確認して、もう一度お試しください。');
        setState('unavailable');
      }
    });
    return () => { requestGeneration.current += 1; };
  }, []);

  async function confirmOrder() {
    if (state !== 'ready' || inFlight.current) return;
    inFlight.current = true;
    const generation = requestGeneration.current;
    setState('connecting');
    setError('');
    try {
      const connection = await operationRequest<SkyConnection>('/api/sky/connections', 'PUT', { tool: toolId });
      if (generation !== requestGeneration.current) return;
      if (connection.tool !== toolId || connection.scope !== 'execute') throw new Error('接続の応答を確認できません。');
      setState('connected');
    } catch (cause) {
      if (generation !== requestGeneration.current) return;
      if (cause instanceof OperationRequestError && cause.status === 401) {
        setState('signin');
      } else {
        // A timed-out PUT might have committed. Read before offering another confirmation.
        try {
          const connections = await operationRequest<SkyConnection[]>('/api/sky/connections');
          if (generation !== requestGeneration.current) return;
          if (connections.some((connection) => connection.tool === toolId && connection.scope === 'execute')) {
            setState('connected');
            return;
          }
          setError('接続を確認できませんでした。注文内容を確認してから再試行してください。');
          setState('ready');
        } catch (readCause) {
          if (generation !== requestGeneration.current) return;
          setState(readCause instanceof OperationRequestError && readCause.status === 401 ? 'signin' : 'unavailable');
          setError('接続結果が不明です。接続状態を再確認してください。自動で注文を再送しません。');
        }
      }
    } finally {
      inFlight.current = false;
    }
  }

  return (
    <section className={styles.order} aria-labelledby="free-article-order-title">
      <h3 id="free-article-order-title">無料の利用申込み・内容確認</h3>
      <dl>
        <div><dt>Tool</dt><dd>記事の無料版メーカー</dd></div>
        <div><dt>今回の料金</dt><dd>0円 · 決済なし</dd></div>
        <div><dt>接続先</dt><dd>本人のSky接続記録 → Zemaの入力画面</dd></div>
      </dl>
      <p>確定すると、このToolの利用に必要なSky接続を本人のアカウントに記録します。原稿の処理はブラウザ内で行い、外部si・有料APIは使いません。noteへの投稿や販売は自動で行いません。</p>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {state === 'checking' || state === 'connecting' ? <output className={styles.status}>{state === 'checking' ? '接続状態を確認中…' : '利用申込みを確定し、Skyへ接続しています…'}</output> : null}
      {state === 'ready' && <button type="button" className={styles.action} onClick={() => void confirmOrder()}>無料で確定して接続 <ArrowRight size={17} /></button>}
      {state === 'connected' && <>
        <output className={styles.success}>Skyへの接続が完了しました。Toolの実行はまだ始まっていません。</output>
        <Link className={styles.action} href={launchPath}>Zemaで使う <ArrowRight size={17} /></Link>
      </>}
      {state === 'signin' && <>
        <p className={styles.status}>確定にはRockへのサインインが必要です。別タブでサインイン後、このカードで接続状態を再確認してください。</p>
        <Link className={styles.action} href="/signin-with-chatgpt?return_to=%2Fsky%2Fmarketplace" target="_blank" rel="noopener noreferrer">別タブでサインイン <ArrowRight size={17} /></Link>
        <button type="button" className={styles.retry} onClick={() => void checkConnection()}>サインイン状態を再確認</button>
      </>}
      {state === 'unavailable' && <button type="button" className={styles.retry} onClick={() => void checkConnection()}>接続状態を再確認</button>}
    </section>
  );
}

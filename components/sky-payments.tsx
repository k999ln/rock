'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import WorkspaceShell from '@/components/workspace-shell';
import styles from '@/components/sky-commerce.module.css';

type Row = { id: string; sourceId?: string; name?: string; currency: string; amountMinor?: number | null;
  quoteHundredthsOfYen?: number; status?: string; state?: string; refundedMinor?: number };
type Summary = { mode: string; purchases: Row[]; csv: Row[]; cloud: Row[]; agentUsage: Row[];
  collections: Row[]; cloudCheckoutEnabled: boolean; notice: string };
type Statement = { sourceId: string; digest: string; amountMinor: number; currency: string };
const labels: Record<string, string> = { paid: '支払済み', pending: '支払い確認待ち', expired: '期限切れ',
  refunded: '返金済み', partially_refunded: '一部返金', disputed: '支払い確認が必要', completed: '利用量計算済み',
  quoted: '見積', reserved: '予算予約済み', sending: '実行中', unreconciled: '利用量確認中',
  cancelled: '取消', sample: '無料サンプル', unpaid: '未払い', stripe_verified: '支払確認済み' };
const amount = (row: Row) => {
  const value = row.amountMinor ?? (row.quoteHundredthsOfYen === undefined ? null : row.quoteHundredthsOfYen / 100);
  if (value === null) return '金額未確定';
  const currency = row.currency.toUpperCase();
  if (!['JPY','USD'].includes(currency)) return `${value} ${currency}（最小通貨単位）`;
  return new Intl.NumberFormat('ja-JP', { style: 'currency', currency }).format(value / (currency === 'JPY' ? 1 : 100));
};
async function api<T>(action: string, input?: unknown): Promise<T> {
  const response = await fetch(`/api/sky/payments/${action}`, { method: input ? 'POST' : 'GET', cache: 'no-store',
    headers: input ? { 'Content-Type': 'application/json' } : undefined, body: input ? JSON.stringify(input) : undefined });
  const value = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(value.error ?? '支払い情報を読み込めませんでした。');
  return value;
}
export default function SkyPayments() {
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const [statement, setStatement] = useState<Statement | null>(null);
  const requestSequence = useRef(0);
  const refresh = useCallback(async () => { setError(''); setStatement(null); setData(null);
    const sequence = ++requestSequence.current;
    try { const next = await api<Summary>('summary'); if (sequence === requestSequence.current) setData(next); }
    catch (cause) { if (sequence === requestSequence.current) setError((cause as Error).message); }
  }, []);
  useEffect(() => {
    let active = true;
    const sequence = ++requestSequence.current;
    void api<Summary>('summary').then(next => {
      if (active && sequence === requestSequence.current) setData(next);
    }).catch((cause: Error) => {
      if (active && sequence === requestSequence.current) setError(cause.message);
    });
    return () => { active = false; };
  }, []);
  const act = async (action: string, input: unknown) => {
    setBusy(true); setError('');
    try {
      if (action === 'statement') setStatement(await api<Statement>(action, input));
      else if (action === 'checkout') {
        const result = await api<{ url: string | null }>(action, input);
        if (result.url) {
          const target = new URL(result.url);
          if (target.protocol !== 'https:' || target.hostname !== 'checkout.stripe.com' || target.username || target.password || target.port)
            throw new Error('決済画面のURLを確認できません。');
          window.location.assign(target.href);
        } else await refresh();
      } else { await api(action, input); await refresh(); }
    } catch (cause) { setData(null); setStatement(null); setError((cause as Error).message); } finally { setBusy(false); }
  };
  return <WorkspaceShell title="支払いと利用明細">
    <p>商品代とクラウド使用料を、同じアカウントで確認できます。</p>
    <div className={styles.actions}><Link href="/sky/purchases">Tool・eSIM購入と返金状況</Link><Link href="/sky/tools/rockstar-csv-cleanup">CSVの受付と成果物</Link>
      <button disabled={busy} onClick={() => void refresh()}>最新の状態を確認</button></div>
    {error && <p role="alert">{error} <Link href="/sky/marketplace">Skyへ戻る</Link></p>}
    {!data && !error && <output>読み込んでいます…</output>}
    {data && <>
      <p>{data.notice}</p><p>各項目の直近100件を表示します。</p>{data.mode === 'test' && <output>テスト決済です。実際の請求は発生しません。</output>}
      <h2>Tool・eSIM購入</h2>{data.purchases.length ? data.purchases.map(row => <p key={row.id}>{row.name} — {amount(row)} · {labels[row.status ?? ''] ?? '状態確認が必要'} <Link href={`/sky/purchases?order=${encodeURIComponent(row.id)}`}>購入内容</Link></p>) : <p>購入記録はありません。</p>}
      <h2>CSV</h2>{data.csv.length ? data.csv.map(row => <p key={row.id}>受付 {row.id.slice(0, 8)} — {amount(row)} · {labels[row.status ?? ''] ?? '状態確認が必要'}</p>) : <p>受付はありません。</p>}
      <h2>クラウド利用</h2>
      {!data.cloudCheckoutEnabled && <p>クラウド利用料の支払いは準備中です。見積や利用額の表示だけでは請求されません。</p>}
      {data.cloud.length ? data.cloud.map(row => {
        const payment = data.collections.find(item => item.sourceId === row.id);
        return <div key={row.id}><p>利用 {row.id.slice(0, 8)} — {amount(row)} · {labels[row.state ?? ''] ?? '状態確認が必要'}
          {payment && <> / 支払い：{labels[payment.status ?? ''] ?? '確認が必要'}</>}</p>
          {payment && <button disabled={busy} onClick={() => void act('confirm', { id: payment.id })}>支払いを照合</button>}
          {(!payment || payment.status === 'pending') && data.cloudCheckoutEnabled && row.state === 'completed' &&
            <button disabled={busy} onClick={() => void act('statement', { sourceId: row.id })}>{payment ? '同じ支払いを再開' : '支払明細を確認'}</button>}</div>;
      }) : <p>利用記録はありません。</p>}
      {statement && <section aria-label="支払いの確認"><p>{amount({ ...statement, id: statement.sourceId })} のテスト支払いへ進みます。</p>
        <button disabled={busy} onClick={() => void act('checkout', { sourceId: statement.sourceId, digest: statement.digest, amountMinor: statement.amountMinor, currency: statement.currency })}>金額を承認してStripeへ進む</button>
        <button disabled={busy} onClick={() => setStatement(null)}>戻る</button></section>}
      <h2>外部Agentの利用明細</h2><p>外部Agentは既存Walletの予約・精算を使います。同じ利用をカードへ重ねて請求しません。</p>
      {data.agentUsage.map(row => <p key={row.id}>{row.id.slice(0, 8)} — {amount(row)}（利用額。カード入金の証明ではありません）</p>)}
    </>}
  </WorkspaceShell>;
}

'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { SkyNotice } from './sky-feedback';
import type { AgentMonthlyStatement } from '@/lib/sky-agent-monthly-statement';
import styles from './sky-commerce.module.css';
type Saved = { id: string; period: string; currency: string; amountMinor: number; itemCount: number; revision: number };
type Document = { revision: number; statement: AgentMonthlyStatement };
const money = (minor: number, currency: string) => new Intl.NumberFormat('ja-JP', { style: 'currency', currency }).format(minor / (currency === 'JPY' ? 1 : 100));
async function request<T>(action: string, input?: unknown) {
  const response = await fetch('/api/sky/payments/' + action, { method: input ? 'POST' : 'GET', cache: 'no-store', headers: input ? { 'content-type': 'application/json' } : undefined, body: input ? JSON.stringify(input) : undefined });
  const result = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(result.error ?? '月次明細を確認できません。');
  return result;
}
export default function SkyAgentMonthlyStatements({ enabled }: { enabled: boolean }) {
  const [period, setPeriod] = useState(() => new Date().toISOString().slice(0, 7));
  const [currency, setCurrency] = useState('USD');
  const [saved, setSaved] = useState<Saved[]>([]);
  const [document, setDocument] = useState<Document | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const sequence = useRef(0);
  const invalidate=useCallback(()=>{++sequence.current;},[]);
  useEffect(() => {
    const current = ++sequence.current;
    void request<{ statements: Saved[] }>('monthly-list').then(value => { if (current === sequence.current) setSaved(value.statements); }).catch(cause => { if (current === sequence.current) setError((cause as Error).message); });
    return invalidate;
  }, [invalidate]);
  async function act(action: 'monthly-save' | 'monthly-read', input: unknown) {
    const current = ++sequence.current; setBusy(true); setError(''); setDocument(null);
    try {
      const value = await request<Document>(action, input);
      const list = await request<{ statements: Saved[] }>('monthly-list');
      if (current === sequence.current) { setDocument(value); setSaved(list.statements); }
    } catch (cause) { if (current === sequence.current) setError((cause as Error).message); }
    finally { if (current === sequence.current) setBusy(false); }
  }
  return <section aria-label="Agentの月次請求準備">
    <h3>月ごとの請求準備</h3>
    <p className={styles.subtle}>アカウント全体の保存済み準備を、元の利用明細のUTC月・通貨ごとにまとめます。基本料金は含みません。請求書発行・引き落とし・送金は行いません。</p>
    {enabled && <div className={styles.offerForm}>
      <label>利用月（UTC）<input type="month" value={period} disabled={busy} onChange={event => setPeriod(event.target.value)} /></label>
      <label className={styles.selectLabel}>元の通貨<select value={currency} disabled={busy} onChange={event => setCurrency(event.target.value)}><option value="USD">USD</option><option value="JPY">JPY</option></select></label>
      <button disabled={busy || !period} onClick={() => void act('monthly-save', { period, currency })}>検証用の月次明細を保存</button>
    </div>}
    {error && <SkyNotice message={error} />}
    {saved.length === 0 && <p>保存済みの月次明細はありません。</p>}
    {saved.length === 100 && <p className={styles.subtle}>新しい月から100件を表示しています。</p>}
    {saved.map(row => <div className={styles.usageRow} key={row.id}><span>{row.period} · {money(row.amountMinor, row.currency)} · {row.itemCount}件 · 未照合</span><button disabled={busy} onClick={() => void act('monthly-read', { id: row.id })}>保存した月次明細を開く</button></div>)}
    {document && <section className={styles.panel} aria-label="保存した月次明細">
      <h3>{document.statement.period} の請求準備</h3>
      <p className={styles.usageAmount}>{money(document.statement.amountMinor, document.statement.currency)}</p>
      <p>{document.statement.items.length}件 · 未照合の下書き · 請求書未作成・入金未確認</p>
      <p className={styles.subtle}>元の利用記録合計は {money(document.statement.observedMinor, document.statement.currency)} です。BYOK実費など請求候補に含まれない利用とは分けています。</p>
      <details className={styles.purchaseConditions}><summary>作者への配分候補と元の利用</summary>
        <p>作者料 {money(document.statement.authorGrossMinor, document.statement.currency)} · 手数料 {money(document.statement.commissionMinor, document.statement.currency)} · 作者受取候補 {money(document.statement.authorPayableMinor, document.statement.currency)}</p>
        <ul>{document.statement.items.map(item => <li key={item.paymentId}><Link href={'/os/eve?thread=' + encodeURIComponent(item.threadId) + '&workJob=' + encodeURIComponent(item.parentJobId)}>元のEve仕事を開く</Link> · {money(item.amountMinor, document.statement.currency)}</li>)}</ul>
      </details>
    </section>}
  </section>;
}

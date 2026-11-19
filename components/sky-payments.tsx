'use client';
import SkyAgentMonthlyStatements from '@/components/sky-agent-monthly-statements';
import type { WorkJob } from '@/lib/workflow';
import type { AgentUsageStatement } from '@/lib/sky-agent-usage-statement';

import { SkyNotice } from '@/components/sky-feedback';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import WorkspaceShell from '@/components/workspace-shell';
import styles from '@/components/sky-commerce.module.css';

type Row = { source?:'cloud_llm'|'sky_agent'; id: string; sourceId?: string; name?: string; currency: string; amountMinor?: number | null;
  quoteHundredthsOfYen?: number; status?: string; state?: string; refundedMinor?: number };
type Summary = { mode: string; purchases: Row[]; csv: Row[]; cloud: Row[]; agentUsage: Row[];
  collections: Row[]; agentInvoicePreparationEnabled?:boolean; cloudCheckoutEnabled: boolean; notice: string };
type Statement = { sourceId: string; digest: string; amountMinor: number; currency: string };
type PaymentGuidance = { heading: string; detail: string; target: string };
const labels: Record<string, string> = { prepared:'請求準備を保存済み・未照合', paid: '支払済み', pending: '支払い確認待ち', expired: '期限切れ',
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
function paymentGuidance(data: Summary): PaymentGuidance {
  if (data.purchases.some(row => ['disputed', 'refund_pending'].includes(row.status ?? ''))) return {
    heading: '購入の異議・返金状況を確認',
    detail: '対象注文と返金・異議の状態を確認してください。同じ購入を自動でやり直しません。',
    target: '/sky/purchases',
  };
  if (data.collections.some(row => row.status === 'disputed')) return {
    heading: '異議のある支払いを確認',
    detail: '確認が終わるまで同じ利用を再請求しません。対象の明細と返金状況を確認してください。',
    target: '#cloud-usage',
  };
  if (data.collections.some(row => row.status === 'pending')) return {
    heading: '同じ支払いを照合',
    detail: '支払い結果はまだ確定していません。対象の明細から既存の支払いを確認してください。',
    target: '#cloud-usage',
  };
  if (data.purchases.some(row => row.status === 'pending')) return {
    heading: '購入の支払い状況を確認',
    detail: '申込を重ねる前に、同じ注文の決済結果を確認してください。',
    target: '/sky/purchases',
  };
  if (data.csv.some(row => row.status === 'unpaid')) return {
    heading: 'CSV受付の見積と支払いを確認',
    detail: '受付済みの見積と期限を確認してから、支払いへ進んでください。',
    target: '/sky/tools/rockstar-csv-cleanup',
  };
  if (data.cloud.some(row => row.state === 'unreconciled')) return {
    heading: '利用量の確認を待つ',
    detail: '実行の結果が未照合です。表示額を確定請求として扱わず、同じ利用記録を確認してください。',
    target: '#cloud-usage',
  };
  if (data.purchases.some(row => ['expired', 'failed'].includes(row.status ?? ''))) return {
    heading: '購入の期限・失敗を確認',
    detail: '注文の状態と提供状況を読んでから、必要な場合だけ新しい購入を始めてください。',
    target: '/sky/purchases',
  };
  if (data.collections.some(row => row.status === 'expired')) return {
    heading: '期限切れの支払いを確認',
    detail: '以前の支払い結果を確かめるまで、新しい支払いを自動で作りません。',
    target: '#cloud-usage',
  };
  return {
    heading: '直近の記録に次の決済操作はありません',
    detail: 'この画面は各項目の直近100件です。Smith Linuxの月次請求などは個別の明細でも確認してください。',
    target: '/sky/linux',
  };
}
async function api<T>(action: string, input?: unknown): Promise<T> {
  const response = await fetch(`/api/sky/payments/${action}`, { method: input ? 'POST' : 'GET', cache: 'no-store',
    headers: input ? { 'Content-Type': 'application/json' } : undefined, body: input ? JSON.stringify(input) : undefined });
  const value = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(value.error ?? '支払い情報を読み込めませんでした。');
  return value;
}
/** An explicit job ID embeds only this saved Eve job's Agent usage. Owner checks remain server-side. */
export default function SkyPayments({ agentJobId, onJobChange }: { agentJobId?: string; onJobChange?: (job: WorkJob) => void } = {}) {
  const embedded = agentJobId !== undefined;
  const summaryAction = agentJobId ? `agent-summary?job=${encodeURIComponent(agentJobId)}` : 'summary';
  const [monthlyOpen,setMonthlyOpen]=useState(false);
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const [statement, setStatement] = useState<Statement | null>(null);
  const [agentStatement,setAgentStatement]=useState<AgentUsageStatement|null>(null);
  const requestSequence = useRef(0);
  const invalidateRequests=useCallback(()=>{++requestSequence.current;},[]);
  const refresh = useCallback(async () => { setError(''); setStatement(null); setAgentStatement(null); setData(null);
    const sequence = ++requestSequence.current;
    try { const next = await api<Summary>(summaryAction); if (sequence === requestSequence.current) setData(next); }
    catch (cause) { if (sequence === requestSequence.current) setError((cause as Error).message); }
  }, [summaryAction]);
  useEffect(() => {
    let active = true;
    const sequence = ++requestSequence.current;
    void api<Summary>(summaryAction).then(next => {
      if (active && sequence === requestSequence.current) setData(next);
    }).catch((cause: Error) => {
      if (active && sequence === requestSequence.current) setError(cause.message);
    });
    return () => { active = false; invalidateRequests(); };
  }, [invalidateRequests, summaryAction]);
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
  const readAgentStatement=async(id:string)=>{
    const sequence=++requestSequence.current;setBusy(true);setError('');setAgentStatement(null);setStatement(null);
    try{const value=await api<AgentUsageStatement>('statement',{source:'sky_agent',sourceId:id});if(sequence===requestSequence.current)setAgentStatement(value);}
    catch(cause){if(sequence===requestSequence.current)setError((cause as Error).message);}
    finally{if(sequence===requestSequence.current)setBusy(false);}
  };
  const recordAgentCollectionConfirmation=async()=>{
    const current=agentStatement;
    if(!current?.collectionPlan || current.collectionPlan.mode!=='platform_invoice' || current.collectionPlan.platformInvoiceCandidateMinor===null)return;
    const sequence=++requestSequence.current;setBusy(true);setError('');
    try{
      const response=await fetch('/api/eve/agent-work',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({jobId:current.parentJobId,revision:current.jobRevision,sourceDelegationId:current.sourceId,action:'record-agent-collection-consent',statementDigest:current.digest,amountMinor:current.collectionPlan.platformInvoiceCandidateMinor,currency:current.currency,confirmed:true})});
      const value=await response.json() as {error?:string;job?:WorkJob};if(!response.ok)throw new Error(value.error??'表示した条件を再確認してください。');
      if(sequence!==requestSequence.current)return;
      if(value.job && value.job.id===agentJobId)onJobChange?.(value.job);
      const updated=await api<AgentUsageStatement>('statement',{source:'sky_agent',sourceId:current.sourceId});
      if(sequence===requestSequence.current)setAgentStatement(updated);
    }catch(cause){if(sequence===requestSequence.current){setAgentStatement(null);setError((cause as Error).message);}}
    finally{if(sequence===requestSequence.current)setBusy(false);}
  };
  const guidance = data ? paymentGuidance(data) : null;
  const unmatchedCollections = data?.collections.filter(item =>
    item.source!=='sky_agent' && !data.cloud.some(row => row.id === item.sourceId)) ?? [];
  const content = <div className={`${embedded ? styles.embeddedPayments : styles.page} ${styles.paymentPage}`}>
    {!embedded && <>
    <header className={styles.header}><div><p className={styles.eyebrow}>利用と支払い</p><h1>支払いと利用明細</h1><p>商品代とクラウド使用料を、同じアカウントで確認できます。</p></div></header>
    <p><Link href="/sky/linux">Smith Linux 16の月次請求・専用Linux・作者収益を確認</Link></p>
    <div className={styles.actions}><Link href="/sky/purchases">ツール・eSIM購入と返金状況</Link><Link href="/sky/tools/rockstar-csv-cleanup">CSVの受付と成果物</Link>
      <button disabled={busy} onClick={() => void refresh()}>最新の状態を確認</button></div>
    </>}
    {embedded && <div className={styles.actions}><Link href="/sky/payments">アカウント全体の明細</Link><button disabled={busy} onClick={() => void refresh()}>最新の状態を確認</button></div>}
    {error && <div><SkyNotice message={error} /><Link href="/sky/marketplace">Smithへ戻る</Link></div>}
    {!data && !error && <output>読み込んでいます…</output>}
    {data && <>
      {data.mode === 'test' && <output className={styles.notice}>検証環境です。実際の請求は発生しません。</output>}
      {!embedded && <>
      <p>{data.notice}</p><p>各項目の直近100件を表示します。</p>
      {guidance && <section aria-label="次の支払い操作">
        <h2>いま必要なこと</h2>
        <p><strong>{guidance.heading}</strong></p>
        <p>{guidance.detail}</p>
        <p><Link href={guidance.target}>該当する明細を見る</Link></p>
        <p>支払い方法の登録、利用額の計算、引き落とし、入金確認はそれぞれ別の状態です。</p>
      </section>}
      <h2>ツール・eSIM購入</h2>{data.purchases.length ? data.purchases.map(row => <p key={row.id}>{row.name} — {amount(row)} · {labels[row.status ?? ''] ?? '状態確認が必要'} <Link href={`/sky/purchases?order=${encodeURIComponent(row.id)}`}>購入内容</Link></p>) : <p>購入記録はありません。</p>}
      <h2>CSV</h2>{data.csv.length ? data.csv.map(row => <p key={row.id}>受付 {row.id.slice(0, 8)} — {amount(row)} · {labels[row.status ?? ''] ?? '状態確認が必要'}</p>) : <p>受付はありません。</p>}
      <h2 id="cloud-usage">クラウド利用</h2>
      {!data.cloudCheckoutEnabled && <p>クラウド利用料の支払いは準備中です。見積や利用額の表示だけでは請求されません。</p>}
      {data.cloud.length ? data.cloud.map(row => {
        const payment = data.collections.find(item => item.source!=='sky_agent' && item.sourceId === row.id);
        return <div key={row.id}><p>利用 {row.id.slice(0, 8)} — {amount(row)} · {labels[row.state ?? ''] ?? '状態確認が必要'}
          {payment && <> / 支払い：{labels[payment.status ?? ''] ?? '確認が必要'}</>}</p>
          {payment && <button disabled={busy} onClick={() => void act('confirm', { id: payment.id })}>支払いを照合</button>}
          {(!payment || payment.status === 'pending') && data.cloudCheckoutEnabled && row.state === 'completed' &&
            <button disabled={busy} onClick={() => void act('statement', { sourceId: row.id })}>{payment ? '同じ支払いを再開' : '支払明細を確認'}</button>}</div>;
      }) : <p>利用記録はありません。</p>}
      {unmatchedCollections.length > 0 && <section aria-label="別期間の支払い記録">
        <h3>別期間の支払い記録</h3>
        <p>利用明細の直近100件にはない支払いです。新しい支払いを作る前に、この記録を照合してください。</p>
        {unmatchedCollections.map(item => <p key={item.id}>支払い {item.id.slice(0, 8)} — {amount(item)} · {labels[item.status ?? ''] ?? '確認が必要'}{' '}
          <button disabled={busy} onClick={() => void act('confirm', { id: item.id })}>同じ支払いを照合</button></p>)}
      </section>}
      {statement && <section aria-label="支払いの確認"><p>{amount({ ...statement, id: statement.sourceId })} のテスト支払いへ進みます。</p>
        <button disabled={busy} onClick={() => void act('checkout', { sourceId: statement.sourceId, digest: statement.digest, amountMinor: statement.amountMinor, currency: statement.currency })}>金額を承認してStripeへ進む</button>
        <button disabled={busy} onClick={() => setStatement(null)}>戻る</button></section>}
      </>}
      {!embedded && <details className={styles.purchaseConditions} onToggle={event=>setMonthlyOpen(event.currentTarget.open)}><summary>月ごとの請求準備を開く</summary>{monthlyOpen&&<SkyAgentMonthlyStatements enabled={data.agentInvoicePreparationEnabled??false} />}</details>}
      {!embedded && <h2>エージェントの利用明細</h2>}
      <p className={styles.subtle}>{embedded ? 'この仕事の利用記録を表示します。' : '直近100件の利用記録を表示します。'}利用額と請求・入金の確定は別です。</p>
      {data.agentUsage.map(row => <article className={styles.usageRow} key={row.id}>
        <div><h3>エージェント利用 <span className={styles.subtle}>{row.id.slice(0, 8)}</span></h3>
          <strong className={styles.usageAmount}>{amount(row)}</strong><span className={styles.status}>請求・入金未照合</span>
          {data.collections.filter(item=>item.source==='sky_agent' && item.sourceId===row.id && item.status==='prepared').map(item=><p className={styles.subtle} key={item.id}>請求準備 {amount(item)} を保存済み</p>)}
        </div>
        <button disabled={busy} onClick={()=>void readAgentStatement(row.id)}>明細を確認</button>
      </article>)}
      {data.agentUsage.length === 0 && <p>表示できる利用記録はありません。実行中や未照合の利用は確定額に含めません。</p>}
      {agentStatement&&<section className={styles.panel} aria-label="Agentの契約と利用明細">
        <div className={styles.panelHeading}><div><h3>この利用の明細</h3><p>契約と元明細を照合済み。請求・入金は未照合です。</p></div><button disabled={busy} onClick={()=>setAgentStatement(null)}>閉じる</button></div>
        <p className={styles.usageAmount}>{amount({id:agentStatement.sourceId,currency:agentStatement.currency,amountMinor:agentStatement.observedAmountMinor})}<span className={styles.subtle}> 利用記録</span></p>
        <details className={styles.purchaseConditions}><summary>料金の内訳と作者への配分候補</summary>
          <dl className={styles.usageBreakdown}>
            <div><dt>作者料</dt><dd>{amount({id:'author',currency:agentStatement.currency,amountMinor:agentStatement.authorGrossMinor})}</dd></div>
            <div><dt>手数料</dt><dd>{amount({id:'fee',currency:agentStatement.currency,amountMinor:agentStatement.commissionMinor})}</dd></div>
            <div><dt>作者受取候補</dt><dd>{amount({id:'payable',currency:agentStatement.currency,amountMinor:agentStatement.authorPayableCandidateMinor})}</dd></div>
            <div><dt>その他の利用料</dt><dd>{amount({id:'other',currency:agentStatement.currency,amountMinor:agentStatement.otherUsageMinor})}</dd></div>
          </dl><p className={styles.subtle}>作者への入金・送金は未確認です。</p>
        </details>
        {agentStatement.collectionPlan&&<div className={styles.notice}>
          <p>{agentStatement.collectionPlan.mode==='external_provider'?'請求経路: Providerへ直接支払い。Rockstarの請求候補は作成しません。':`請求候補: ${agentStatement.collectionPlan.chargeScope==='author_fee'?'作者料のみ':'利用総額'} ${amount({id:'candidate',currency:agentStatement.currency,amountMinor:agentStatement.collectionPlan.platformInvoiceCandidateMinor})}`}</p>
          {agentStatement.collectionPlan.usageFunding==='byok'&&<p>BYOKの実費は別契約です。Rockstarの請求候補に加算しません。</p>}
          <p>{agentStatement.customerConsent==='recorded_pending_invoice_reconciliation'?'この金額・条件の確認を記録済み。Provider請求との照合待ち。':'利用者による条件確認・Provider請求との照合待ち。'}請求書は未作成です。</p>
          {agentStatement.collectionPlan.mode==='platform_invoice'&&agentStatement.customerConsent==='missing'&&<>
            <p>これは表示した金額・条件の請求準備用の確認です。引き落とし・送金の許可ではありません。</p>
            <button disabled={busy} onClick={()=>void recordAgentCollectionConfirmation()}>この金額・条件の確認を記録</button>
          </>}
        </div>}
        {data.agentInvoicePreparationEnabled && agentStatement.customerConsent==='recorded_pending_invoice_reconciliation' && agentStatement.collectionPlan?.mode==='platform_invoice' && (agentStatement.collectionPlan.platformInvoiceCandidateMinor??0)>0 && !data.collections.some(item=>item.source==='sky_agent' && item.sourceId===agentStatement.sourceId) && <>
          <p>確認した候補を検証環境の請求準備として保存できます。請求書発行・引き落とし・送金は始まりません。</p>
          <button disabled={busy} onClick={()=>void act('prepare-agent-invoice',{sourceId:agentStatement.sourceId,digest:agentStatement.digest,amountMinor:agentStatement.collectionPlan!.platformInvoiceCandidateMinor,currency:agentStatement.currency})}>検証用の請求準備を保存</button>
        </>}
        <Link href={`/os/eve?thread=${encodeURIComponent(agentStatement.threadId)}&workJob=${encodeURIComponent(agentStatement.parentJobId)}`}>同じEveの仕事を開く</Link>
        <details className={styles.purchaseConditions}><summary>明細の保存参照</summary><p style={{overflowWrap:'anywhere'}}>照合ID {agentStatement.digest}</p><p style={{overflowWrap:'anywhere'}}>receipt SHA256 {agentStatement.receiptSha256}</p></details>
      </section>}
    </>}
    </div>;
  return embedded ? content : <WorkspaceShell title="支払いと利用明細" hideTopActions>{content}</WorkspaceShell>;
}

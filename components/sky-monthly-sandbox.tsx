'use client';
import { useEffect, useState } from 'react';

type Invoice = { id: string; period: string; total_minor: number; status: string; provider_receipt: string | null };
type Quote = { id: string; amount_minor: number; quantity: number; rate_version: string };
type Usage = { output: string | null; quote_id: string; amount_minor: number; quantity: number; rate_version: string };
export default function SkyMonthlySandbox() {
  const [markdown, setMarkdown] = useState('空間に埋め込む端末の調査。 (Source: [資料](https://example.org/source))');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [usage, setUsage] = useState<Usage[]>([]);
  const [output, setOutput] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  async function request(body?: unknown) {
    const response = await fetch('/api/sky/monthly-sandbox', body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { cache: 'no-store' });
    const data = await response.json() as { error?: string; quote?: Quote; invoices?: Invoice[]; usage?: Usage[]; job?: { standaloneAgent: { text: string } }; replayed?: boolean; simulatedMonthEnd?: boolean; simulatedPayment?: boolean };
    if (!response.ok) throw new Error(data.error ?? '利用できません。');
    return data;
  }
  async function refresh() {
    const data = await request(); setInvoices(data.invoices ?? []); setUsage(data.usage ?? []);
  }
  useEffect(() => {
    let active = true;
    void request().then(data => { if (active) { setInvoices(data.invoices ?? []); setUsage(data.usage ?? []); } }).catch(error => { if (active) setMessage(String(error)); });
    return () => { active = false; };
  }, []);
  async function act(body: unknown) {
    setBusy(true); setMessage('');
    try {
      const data = await request(body);
      if (data.quote) setQuote(data.quote);
      if (data.job) { setOutput(data.job.standaloneAgent.text); setMessage(data.replayed ? '保存済みの成果を再取得しました。追加計上なし。' : '成果とテスト使用量を保存しました。'); }
      if (data.simulatedMonthEnd) setMessage('月末を模擬し、テスト請求を確定しました。');
      if (data.simulatedPayment) setMessage('模擬入金を照合しました。実際のお支払いはありません。');
      await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : '確認できませんでした。'); }
    finally { setBusy(false); }
  }
  const button = { padding: '10px 16px', margin: '8px 8px 8px 0', cursor: 'pointer', borderRadius: 8, border: '1px solid #64748b' };
  return <main style={{ maxWidth: 900, margin: '40px auto', padding: 24, fontFamily: 'system-ui', color: '#172033', background: '#f8fafc' }}>
    <p>Sky / Agentと月次請求</p><h1>Skyだけで、依頼から明細まで</h1>
    <p role="note"><strong>ローカルのテスト環境</strong> · 出典整理Agentは動作します。金額と収納は模擬です。外部LLM・実決済は利用しません。</p>
    <section><h2>1. Agentに依頼する</h2><p>出典整理Agent · テスト単価：1,000文字ごとに10円。テスト月上限：1,000円。見積有効期限：5分。</p>
      <label htmlFor="monthly-input">整理する本文</label><textarea id="monthly-input" disabled={busy} value={markdown} maxLength={20000} rows={5} style={{ display: 'block', width: '100%', marginTop: 8 }} onChange={e => { setMarkdown(e.target.value); setQuote(null); }} />
      <button style={button} disabled={busy || !markdown.trim()} onClick={() => void act({ action: 'quote', id: crypto.randomUUID(), input: { markdown, language: 'ja' } })}>見積を作る</button>
      {quote && <div><p>見積：{quote.amount_minor}円（{quote.quantity}単位）· 月次後払いのテスト</p><button style={button} disabled={busy} onClick={() => void act({ action: 'run', id: quote.id, approvedAmountMinor: quote.amount_minor, approvedRateVersion: quote.rate_version })}>金額を承認して実行</button></div>}
    </section>
    <output>{busy ? '処理中…' : message}</output>
    {output && <section><h2>成果</h2><pre style={{ whiteSpace: 'pre-wrap' }}>{output}</pre></section>}
    <section><h2>2. 使用明細と月次請求</h2><button style={button} disabled={busy} onClick={() => void refresh().catch(error => setMessage(String(error)))}>保存済み明細を再取得</button>
      {invoices.map(invoice => <article key={invoice.id} style={{ border: '1px solid #cbd5e1', padding: 16, marginTop: 12 }}>
        <h3>{invoice.period} · {invoice.total_minor}円</h3><p>状態：{({ draft: '集計中', issued: 'テスト請求済み', paid: '模擬入金照合済み' } as Record<string,string>)[invoice.status]}</p>
        {invoice.status === 'draft' && <button style={button} disabled={busy} onClick={() => void act({ action: 'close', id: invoice.id })}>月末を模擬して請求確定</button>}
        {invoice.status === 'issued' && <button style={button} disabled={busy} onClick={() => void act({ action: 'reconcile', id: invoice.id })}>模擬入金を照合</button>}
        {invoice.provider_receipt && <p>テスト照合ID：{invoice.provider_receipt}</p>}
      </article>)}
      <ul>{usage.map(line => <li key={line.quote_id}>出典整理Agent：{line.quantity}単位 / {line.amount_minor}円 / 見積ID {line.quote_id}<details><summary>保存した成果を開く</summary><pre style={{ whiteSpace: 'pre-wrap' }}>{line.output ?? '成果は削除済みです。使用明細は保持しています。'}</pre></details></li>)}</ul>
    </section>
    <p>Jennifer・Zema・Mini・SIMの導入は不要です。テスト請求は実際の残高や信用情報へ反映されません。</p>
  </main>;
}

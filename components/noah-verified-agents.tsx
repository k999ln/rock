'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import type { VerifiedRegistry } from '@/lib/noah-verified-registry';
import styles from './noah-timeline.module.css';

const labels: Record<string, string> = { agent: '本体を確認', unverifiable: '確認不能・公開根拠不足', merged: '同一系列・関連配布', historical: '旧系統', announced: '提供開始前', template: 'テンプレート', framework: '開発基盤', tool: '道具・画面', model: 'モデル', resource: '教材・評価資料', other: 'その他・本体条件未充足' };

export default function NoahVerifiedAgents() {
  const [data, setData] = useState<VerifiedRegistry | null>(null), [error, setError] = useState('');
  const [query, setQuery] = useState(''), [category, setCategory] = useState('all');
  const [view, setView] = useState('products'), [decision, setDecision] = useState('all'), [page, setPage] = useState(0);
  const revision = useRef('');
  useEffect(() => {
    let alive = true, busy = false;
    const controller = new AbortController();
    async function refresh() {
      if (busy || document.hidden || !alive) return;
      busy = true;
      try {
        const response = await fetch('/api/noah/agent-registry', { cache: 'no-store', signal: controller.signal,
          headers: revision.current ? { 'If-None-Match': '"' + revision.current + '"' } : {} });
        if (response.status === 304) { if (alive) setError(''); return; }
        if (!response.ok) throw new Error('一覧を更新できませんでした。');
        const next = await response.json() as VerifiedRegistry;
        if (next.schema !== 'noah.verified-agent-catalog/1' || !Array.isArray(next.products) || !Array.isArray(next.reviews)) throw new Error('一覧の形式を確認できませんでした。');
        if (alive) { revision.current = next.revision; setData(next); setError(''); }
      } catch (e) { if (alive && !controller.signal.aborted) setError(e instanceof Error ? e.message : '更新に失敗しました。'); }
      finally { busy = false; }
    }
    void refresh();
    const timer = setInterval(() => void refresh(), 60_000);
    document.addEventListener('visibilitychange', refresh);
    return () => { alive = false; controller.abort(); clearInterval(timer); document.removeEventListener('visibilitychange', refresh); };
  }, []);
  const products = useMemo(() => data?.products.filter(p => (category === 'all' || p.category === category) &&
    (p.name + ' ' + p.publisher + ' ' + p.summary).toLocaleLowerCase().includes(query.toLocaleLowerCase())) ?? [], [data, category, query]);
  const reviews = useMemo(() => data?.reviews.filter(r => (decision === 'all' || r.decision === decision) &&
    (r.name + ' ' + r.reason + ' ' + r.key).toLocaleLowerCase().includes(query.toLocaleLowerCase())) ?? [], [data, decision, query]);
  const total = view === 'products' ? products.length : reviews.length, pages = Math.max(1, Math.ceil(total / 25)), current = Math.min(page, pages - 1);
  const start = current * 25;
  return <main className={styles.feed} style={{ maxWidth: 1000, margin: '0 auto', padding: 24 }}>
    <Link href="/noah/agents">Agentの調査カタログへ</Link>
    <header className={styles.feedHeader}><h1>本体を確認したAgent</h1>
      {data && <p>{data.summary.families.toLocaleString('ja-JP')}系列 · {data.summary.categories}分類 · 今回 {data.summary.added}系列追加</p>}
    </header>
    <p className={styles.researchNote}>公開資料から本体として確認した製品・実装です。研究試作を含みます。掲載はNoahでの接続・実行の合格を意味しません。</p>
    {data && <p className={styles.researchNote}>調査日 {data.asOf} · 候補 {data.summary.reviewed.toLocaleString('ja-JP')}件を再点検 · 確認不能 {data.summary.unresolved.toLocaleString('ja-JP')}件（非公開実装・実行入口・同一性の根拠不足等）。世界総数ではありません。配信された台帳の変更を60秒ごと・画面復帰時に確認します。</p>}
    {data && <p className={styles.researchNote}>個別精査 {data.summary.individuallyReviewed.toLocaleString('ja-JP')}件 · 自動一次選別 {data.summary.automatedTriage.toLocaleString('ja-JP')}件。全候補の全ソースを個別に精査した結果ではありません。</p>}
    <div className={styles.filters}>
      <button aria-pressed={view === 'products'} onClick={() => { setView('products'); setPage(0); }}>本体一覧</button>
      <button aria-pressed={view === 'reviews'} onClick={() => { setView('reviews'); setPage(0); }}>候補の判定理由</button>
    </div>
    <div className={styles.searchRow}><input aria-label="本体・候補を検索" value={query} maxLength={200} placeholder="名前・作者・用途を検索" onChange={e => { setQuery(e.target.value); setPage(0); }} /></div>
    {view === 'products' ? <select aria-label="用途で絞り込む" value={category} onChange={e => { setCategory(e.target.value); setPage(0); }}><option value="all">用途：すべて</option>{Array.from(new Set(data?.products.map(p => p.category))).sort().map(c => <option key={c}>{c}</option>)}</select>
      : <select aria-label="判定で絞り込む" value={decision} onChange={e => { setDecision(e.target.value); setPage(0); }}><option value="all">判定：すべて</option>{Object.entries(labels).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select>}
    {!data && !error && <output>一覧を読み込んでいます…</output>}
    {error && <p role="alert">{error} {data ? '直前に取得できた一覧を表示しています。' : ''}</p>}
    {view === 'products' ? products.slice(start, start + 25).map(p => <article className={styles.post} key={p.familyId}>
      <div className={styles.postContent}><h2 className={styles.postTitle}>{p.name}</h2><p>{p.publisher} · {p.category}{p.added ? ' · 今回追加' : ''}</p>
        <p className={styles.postText}>{p.summary}</p><p className={styles.researchNote}>{p.status}</p>
        <details><summary>確認資料・接続条件</summary><p>Noah接続：未試験</p><ul>{p.requirements.map(r => <li key={r}>{r}</li>)}</ul>
          {p.protocol && <p>提供元の文書に接続方式の案内があります。Noahでの接続試験はまだです。</p>}
          <ul>{p.sources.map(url => <li key={url}><a href={url} target="_blank" rel="noreferrer">{url}</a></li>)}</ul>
        </details>
      </div></article>) : reviews.slice(start, start + 25).map(r => <article className={styles.post} key={r.key}>
        <div className={styles.postContent}><h2 className={styles.postTitle}><a href={r.url} target="_blank" rel="noreferrer">{r.name}</a></h2><p>{r.key} · {r.source} · {labels[r.decision] || r.decision}</p><p>{r.reason}</p><p className={styles.researchNote}>{r.method.startsWith('individual') ? '個別資料の精査' : '取得資料の自動一次選別'}</p></div>
      </article>)}
    {data && <div className={styles.feedEnd}><p>{total.toLocaleString('ja-JP')}件 · {current + 1} / {pages}ページ</p><button disabled={current === 0} onClick={() => setPage(current - 1)}>前へ</button> <button disabled={current + 1 >= pages} onClick={() => setPage(current + 1)}>次へ</button></div>}
    <p className={styles.researchNote}>Noahの <Link href="/noah/ready">接続候補の一覧</Link> で、接続の状態と条件を確認できます。</p>
  </main>;
}

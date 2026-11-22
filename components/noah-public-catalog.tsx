'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, Bot, House, Laptop, Search, X } from 'lucide-react';
import { researchKindLabels, type ResearchPage } from '@/lib/noah-research-types';
import { noahActionHref } from '@/lib/noah-surface';
import { webBrandIcon } from '@/lib/web-brand';
import styles from './noah-timeline.module.css';

export default function NoahPublicCatalog({ basePath = '/noah', embedded = false }: { basePath?: string; embedded?: boolean }) {
  const [query, setQuery] = useState(''), [kind, setKind] = useState('all');
  const [result, setResult] = useState<{ key: string; page: ResearchPage | null; error: string } | null>(null);
  const [moreKey, setMoreKey] = useState(''), [attempt, setAttempt] = useState(0);
  const search = useRef<HTMLInputElement>(null), sentinel = useRef<HTMLDivElement>(null);
  const generation = useRef(0), pending = useRef<AbortController | null>(null), locked = useRef(false);
  const params = new URLSearchParams({ q: query.trim(), kind, limit: '20' }).toString();
  const key = `${params}:${attempt}`, current = result?.key === key ? result : null;
  const page = current?.page ?? null, error = current?.error ?? '', loading = !current, more = moreKey === key;
  useEffect(() => {
    const version = ++generation.current, controller = new AbortController();
    pending.current?.abort(); locked.current = false;
    const timer = setTimeout(() => {
      void fetch(`/api/noah/public-catalog?${params}`, { signal: controller.signal }).then(async response => {
        const data = await response.json() as ResearchPage & { error?: string };
        if (!response.ok || !Array.isArray(data.entries)) throw new Error(data.error || '読み込めませんでした。');
        if (version === generation.current && !controller.signal.aborted) setResult({ key, page: data, error: '' });
      }).catch(e => { if (!controller.signal.aborted && version === generation.current) setResult({ key, page: null, error: e.message }); });
    }, 180);
    return () => { clearTimeout(timer); controller.abort(); pending.current?.abort(); };
  }, [params, key]);
  const loadMore = useCallback(async () => {
    if (!page?.nextCursor || locked.current) return;
    locked.current = true; setMoreKey(key); setResult(previous => previous ? { ...previous, error: '' } : null);
    const version = generation.current, controller = new AbortController(); pending.current = controller;
    try {
      const response = await fetch(`/api/noah/public-catalog?${params}&cursor=${encodeURIComponent(page.nextCursor)}`, { signal: controller.signal });
      const data = await response.json() as ResearchPage & { error?: string };
      if (!response.ok || !Array.isArray(data.entries)) throw new Error(data.error || '続きを読み込めませんでした。');
      if (!controller.signal.aborted && version === generation.current) setResult(previous => ({ key, error: '', page: previous?.page ? { ...data, entries: [...previous.page.entries, ...data.entries.filter(entry => !previous.page!.entries.some(old => old.id === entry.id))] } : data }));
    } catch (e) { if (!controller.signal.aborted && version === generation.current) setResult(previous => ({ key, page: previous?.page ?? null, error: e instanceof Error ? e.message : '読み込めませんでした。' })); }
    finally { if (version === generation.current) { locked.current = false; setMoreKey(''); } }
  }, [page, params, key]);
  useEffect(() => {
    if (!sentinel.current || !page?.nextCursor || error || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(entries => { if (entries.some(e => e.isIntersecting)) void loadMore(); }, { rootMargin: '250px' });
    observer.observe(sentinel.current); return () => observer.disconnect();
  }, [page?.nextCursor, error, loadMore]);
  function reset() { setQuery(''); setKind('all'); }
  return <div className={styles.surface} data-noah-catalog={embedded ? 'embedded' : undefined}>
    <div className={styles.layout}>
      <aside className={styles.leftRail}><div className={styles.leftInner}>
        <Link href={basePath} className={styles.brand} aria-label="Noah ホーム"><Image src={webBrandIcon} width={42} height={42} alt="" unoptimized /><span className={styles.brandWord}>Noah</span></Link>
        <nav className={styles.navigation} aria-label="Noahのメニュー">
          <button onClick={reset} className={styles.activeNav}><House size={25} /><span>ホーム</span></button>
          <button onClick={() => search.current?.focus()}><Search size={25} /><span>検索</span></button>
          <a href={noahActionHref('public', basePath, 'library')}><Laptop size={25} /><span>自分のAgent</span></a>
        </nav>
        <a className={styles.addButton} href={noahActionHref('public', basePath, 'register')}>MacでAgentを追加</a>
        <p className={styles.researchNote}>追加・接続・仕事の実行は、Noahを起動したMacで利用できます。</p>
      </div></aside>
      <main className={styles.feed}>
        <header className={styles.feedHeader}><div className={styles.titleRow}><h1>Noah</h1><span>Agentが集まる場所</span></div></header>
        <section className={styles.discovery} aria-label="Agentを探す">
          <div className={styles.searchRow}><Search size={22} /><input ref={search} aria-label="Agentを検索" placeholder="どんな仕事を任せたい？" maxLength={200} value={query} onChange={e => setQuery(e.target.value)} />{query && <button aria-label="検索をクリア" onClick={() => setQuery('')}><X size={18} /></button>}</div>
          <div className={styles.filters} aria-label="分類で絞り込む">{[['all', 'すべて'], ['agent', 'Agent本体候補'], ['candidate', '分類確認待ち'], ['related', 'Tool・モデル等']].map(([value, label]) => <button key={value} aria-pressed={kind === value} className={kind === value ? styles.selectedFilter : ''} onClick={() => setKind(value)}>{label}</button>)}</div>
        </section>
        <div className={styles.feedLabel}><span>世界のAgentを見つける</span>{page && <span className={styles.resultCount}>{page.total.toLocaleString('ja-JP')}件</span>}</div>
        <p className={styles.researchNote}><Link href={`${basePath}/agents/verified`}>重複を除いた本体一覧・候補の判定理由を見る</Link></p>
        {page && <p className={styles.researchNote}>調査日 {page.asOf} · Agent候補と関連資産を含みます。掲載数は実行対応数ではありません。</p>}
        {loading && <output className={styles.loading}>カタログを読み込んでいます…</output>}
        <section aria-label="Agentのタイムライン">{page?.entries.map(entry => <article className={styles.post} key={entry.id}>
          <Link className={styles.avatar} href={`${basePath}/agents/${entry.id}`} aria-label={`${entry.name}の詳細`}><Bot size={23} /></Link>
          <div className={styles.postContent}>
            <div className={styles.postHeader}><span className={styles.author}>{entry.author || '公開資料からの紹介'}</span><span className={styles.postMeta}>· 調査カタログ</span></div>
            <h2 className={styles.postTitle}><Link href={`${basePath}/agents/${entry.id}`}>{entry.name}</Link></h2>
            <p className={styles.postText}>{entry.summary}</p>
            <div className={styles.researchBadges}><span>{researchKindLabels[entry.kind]}</span><span>{entry.level === 'primary' ? '一次資料を確認' : '資料確認待ち'}</span></div>
            <div className={styles.postActions}><span>接続条件を確認</span><Link href={`${basePath}/agents/${entry.id}`} className={styles.detailsLink}>詳細を見る <ArrowRight size={15} /></Link></div>
          </div>
        </article>)}</section>
        {error && <div role="alert" className={styles.notice}><p>{error}</p><button onClick={() => page?.nextCursor ? void loadMore() : setAttempt(v => v + 1)}>再試行</button></div>}
        {!loading && page?.total === 0 && <div className={styles.empty}><h2>条件に合うAgentがありません</h2><button onClick={reset}>検索条件をクリア</button></div>}
        {page?.nextCursor && <div ref={sentinel} className={styles.feedEnd}><button disabled={more} onClick={() => void loadMore()}>{more ? '読み込んでいます…' : '続きを読み込む'}</button></div>}
      </main>
      <aside className={styles.rightRail}><div className={styles.rightInner}>
        <section className={styles.sidePanel}><h2>探す、選ぶ、使う。</h2><p>できることや配布元を見て、自分に合ったAgentを見つけよう。</p><Link className={styles.moreLink} href={`${basePath}/agents/anicca`}>Aniccaを見る <ArrowRight size={15} /></Link></section>
        <section className={styles.sidePanel}><h2>MacのNoahへ</h2><p>接続・実行・停止は、起動中のMacのNoahで。スマホからMacを操作する接続は準備中です。</p><a className={styles.libraryLink} href={noahActionHref('public', basePath, 'library')}><Laptop size={20} />このMacのNoahを開く</a></section>
        <div className={styles.sideFooter}>Noah · avokado</div>
      </div></aside>
    </div>
  </div>;
}

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, ArrowUpRight, Bot, ChevronRight, CircleHelp, Code2, Compass, FilePlus2, House, Laptop, ListChecks, LockKeyhole, MoreHorizontal, Plus, Search, Store, X } from 'lucide-react';
import { aniccaAgent, type NoahAgentManifest } from '@/lib/noah-agent-upload';
import type { NoahUpload } from '@/lib/noah-agent-store';
import { webBrandIcon } from '@/lib/web-brand';
import { researchKindLabels, type ResearchPage, type ResearchSummary } from '@/lib/noah-research-types';
import NoahPublishedFeed from './noah-published-feed';
import NoahDiscoveryFeed from './noah-discovery-feed';
import { recipeFor } from '@/lib/noah-execution-contract.mjs';
import styles from './noah-timeline.module.css';

export const adapterLabels = { web: '専用Web画面', mcp_http: 'MCP', a2a: '外部Agent連携', local_app: 'このMac', source: '実行先の準備待ち' };
type FeedTab = 'recommended' | 'latest' | 'following' | 'mine';
type FeedItem = { id: string; manifest: NoahAgentManifest; own: boolean; createdAt?: number };
const tabs: { id: FeedTab; label: string }[] = [
  { id: 'recommended', label: 'おすすめ' }, { id: 'latest', label: '新着' }, { id: 'following', label: 'フォロー中' }, { id: 'mine', label: '自分の登録' },
];
const filters = [
  { id: 'all', label: 'すべて' }, { id: 'agent', label: 'Agent本体候補' }, { id: 'candidate', label: '分類確認待ち' },
  { id: 'related', label: 'Tool・モデル等' }, { id: 'local_app', label: 'このMac' }, { id: 'web', label: 'Web' },
  { id: 'mcp_http', label: 'MCP' }, { id: 'a2a', label: 'A2A' },
] as const;

function ResearchPost({ entry }: { entry: ResearchSummary }) {
  if (entry.id === 'anicca') return <AgentPost item={{ id: 'anicca', manifest: aniccaAgent, own: false }} reason={entry.reason} />;
  const href = `/noah/agents/${entry.id}`;
  return <article className={styles.post} aria-labelledby={`agent-${entry.id}`}>
    <Link className={styles.avatar} href={href} aria-label={`${entry.name}の詳細`}><Bot size={23} strokeWidth={1.5} /></Link>
    <div className={styles.postContent}>
      <div className={styles.postHeader}><span className={styles.author}>{entry.author || '公開資料からの紹介'}</span><span className={styles.postMeta}>· 調査カタログ</span></div>
      <h2 id={`agent-${entry.id}`} className={styles.postTitle}><Link href={href}>{entry.name}</Link></h2>
      <p className={styles.postText}>{entry.summary}</p>
      {entry.reason && <p className={styles.researchNote}>{entry.reason}</p>}
      <div className={styles.researchBadges}><span>{researchKindLabels[entry.kind]}</span><span>{entry.level === 'primary' ? '一次資料を確認' : '資料確認待ち'}</span></div>
      <div className={styles.postActions}><span>{recipeFor(entry.id) ? 'バックグラウンド実行に対応' : entry.kind === 'agent' || entry.kind === 'candidate' ? '接続は準備中' : '関連資産'}</span><Link href={href} className={styles.detailsLink}>詳細を見る <ArrowRight size={15} /></Link></div>
    </div>
  </article>;
}

function AgentPost({ item,reason }: { item: FeedItem; reason?:string }) {
  const m = item.manifest, href = `/noah/agents/${item.id}`;
  const featured = item.id === 'anicca';
  const date = item.createdAt ? new Intl.DateTimeFormat('ja-JP', { month: 'short', day: 'numeric', timeZone: 'Asia/Tokyo' }).format(item.createdAt) : null;
  return <article className={styles.post} aria-labelledby={`agent-${item.id}`}>
    <Link className={`${styles.avatar} ${featured ? styles.aniccaAvatar : ''}`} href={href} aria-label={`${m.name}の詳細`}>
      {featured ? 'a' : <Bot size={23} strokeWidth={1.5} />}
    </Link>
    <div className={styles.postContent}>
      <div className={styles.postHeader}>
        <span className={styles.author}>{m.author}</span>
        <span className={styles.postMeta}>{item.own ? '· 自分の登録' : '· Agent紹介'}</span>
        {date && <time className={styles.postDate} dateTime={new Date(item.createdAt!).toISOString()}>· {date}</time>}
        <details className={styles.postMenu}>
          <summary aria-label={`${m.name}のメニュー`}><MoreHorizontal size={19} /></summary>
          <div><Link href={href}>詳細を見る</Link>{m.sourceUrl && <a href={m.sourceUrl} target="_blank" rel="noopener noreferrer">ソースを見る <ArrowUpRight size={14} /></a>}</div>
        </details>
      </div>
      {item.own && <span className={styles.private}><LockKeyhole size={11} />自分だけに表示</span>}
      <h2 id={`agent-${item.id}`} className={styles.postTitle}><Link href={href}>{m.name}</Link></h2>
      <p className={styles.postText}>{m.summary}</p>
      {reason && <p className={styles.researchNote}>{reason}</p>}
      <Link href={href} className={styles.preview} aria-label={`${m.name}の紹介と接続条件を見る`}>
        {featured ? <div className={styles.aniccaArt}>
          <div className={styles.artGrid} aria-hidden="true" />
          <span className={styles.artOverline}><span />OPEN SOURCE · ON YOUR MAC</span>
          <span className={styles.artName}>Anicca<span>↗</span></span>
          <span className={styles.artCaption}>あなたのMacから、はじめよう。</span>
          <div className={styles.artBottom}><span><Laptop size={15} /> Life Manager</span><span>MIT LICENSE</span></div>
        </div> : <div className={styles.uploadPreview}>
          <span className={styles.uploadIcon}><Code2 size={26} strokeWidth={1.4} /></span>
          <div><small>YOUR AGENT</small><strong>{m.name}</strong><span>{adapterLabels[m.adapter]} · v{m.version}</span></div>
          <ChevronRight size={19} />
        </div>}
        <div className={styles.previewCaption}><span>{featured ? 'このMacで初期設定をはじめる' : 'Agentの内容と接続先を確認する'}</span><ArrowUpRight size={15} /></div>
      </Link>
      <div className={styles.postActions}>
        <span><span className={styles.statusDot} />{adapterLabels[m.adapter]}</span>
        <Link href={href} className={styles.detailsLink}>詳細を見る <ArrowRight size={15} /></Link>
      </div>
    </div>
  </article>;
}

export default function NoahAgentCatalog({ embedded = false }: { embedded?: boolean }) {
  const [agents, setAgents] = useState<NoahUpload[]>([]), [error, setError] = useState('');
  const [query, setQuery] = useState(''), [loading, setLoading] = useState(true), [attempt, setAttempt] = useState(0);
  const [tab, setTab] = useState<FeedTab>('recommended');
  const [filter, setFilter] = useState<(typeof filters)[number]['id']>('all');
  const [catalogResult, setCatalogResult] = useState<{ key: string; page: ResearchPage | null; error: string } | null>(null);
  const [moreLoadingKey, setMoreLoadingKey] = useState(''), [catalogAttempt, setCatalogAttempt] = useState(0);
  const generation = useRef(0), moreRequest = useRef<AbortController | null>(null), moreLock = useRef(false), sentinel = useRef<HTMLDivElement>(null);
  const catalogEnabled = !['mine','following'].includes(tab) && ['all', 'agent', 'candidate', 'related'].includes(filter);
  const catalogParams = new URLSearchParams({ q: query.trim().slice(0, 200), kind: filter, order: tab === 'latest' ? 'latest' : 'recommended', limit: '20' }).toString();
  const catalogKey = `${catalogEnabled}:${catalogParams}:${catalogAttempt}`;
  const currentCatalog = catalogResult?.key === catalogKey ? catalogResult : null;
  const catalog = currentCatalog?.page || null, catalogError = currentCatalog?.error || '';
  const catalogLoading = catalogEnabled && !currentCatalog, moreLoading = moreLoadingKey === catalogKey;
  useEffect(() => {
    const version = ++generation.current, controller = new AbortController();
    moreRequest.current?.abort(); moreLock.current = false;
    if (!catalogEnabled) return () => controller.abort();
    const timer = setTimeout(() => {
      fetch(`/api/noah/catalog?${catalogParams}`, { signal: controller.signal, cache: 'no-store' }).then(async r => {
        const data = await r.json() as ResearchPage & { error?: string };
        if (!r.ok || !Array.isArray(data.entries)) throw new Error(data.error || '調査カタログを読み込めませんでした。');
        if (generation.current === version && !controller.signal.aborted) setCatalogResult({ key: catalogKey, page: data, error: '' });
      }).catch(e => { if (generation.current === version && !controller.signal.aborted) setCatalogResult({ key: catalogKey, page: null, error: e.message }); });
    }, 180);
    return () => { clearTimeout(timer); controller.abort(); moreRequest.current?.abort(); };
  }, [catalogEnabled, catalogParams, catalogKey]);
  const loadMore = useCallback(async () => {
    if (!catalog?.nextCursor || moreLock.current || !catalogEnabled) return;
    const version = generation.current, controller = new AbortController();
    moreRequest.current = controller; moreLock.current = true; setMoreLoadingKey(catalogKey); setCatalogResult(previous => previous ? { ...previous, error: '' } : previous);
    try {
      const r = await fetch(`/api/noah/catalog?${catalogParams}&cursor=${encodeURIComponent(catalog.nextCursor)}`, { signal: controller.signal, cache: 'no-store' });
      const data = await r.json() as ResearchPage & { error?: string };
      if (r.status === 400 && generation.current === version && !controller.signal.aborted) { setCatalogAttempt(n => n + 1); return; }
      if (!r.ok || !Array.isArray(data.entries)) throw new Error(data.error || '続きを読み込めませんでした。');
      if(data.ownerScope!==catalog.ownerScope){setCatalogResult(null);throw new Error('アカウントが変わりました。先頭から読み直してください。');}
      if (generation.current === version && !controller.signal.aborted) setCatalogResult(previous => ({ key: catalogKey, error: '', page: previous?.page ? { ...data, entries: [...previous.page.entries, ...data.entries.filter(e => !previous.page!.entries.some(p => p.id === e.id))] } : data }));
    } catch (e) { if (generation.current === version && !controller.signal.aborted) setCatalogResult(previous => ({ key: catalogKey, page: previous?.page || null, error: e instanceof Error ? e.message : '読込に失敗しました。' })); }
    finally { if (generation.current === version) { moreLock.current = false; setMoreLoadingKey(''); } }
  }, [catalog, catalogEnabled, catalogParams, catalogKey]);
  useEffect(() => {
    if (!sentinel.current || !catalog?.nextCursor || catalogError || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(items => { if (items.some(i => i.isIntersecting)) void loadMore(); }, { rootMargin: '400px' });
    observer.observe(sentinel.current); return () => observer.disconnect();
  }, [catalog?.nextCursor, catalogError, loadMore]);
  const searchInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/noah/agents', { cache: 'no-store', signal: controller.signal }).then(async response => {
      const data = await response.json() as { agents?: NoahUpload[]; error?: string };
      if (!response.ok || !Array.isArray(data.agents)) throw new Error(data.error || '登録したAgentを読み込めませんでした。');
      if (!controller.signal.aborted) setAgents(data.agents);
    }).catch(e => { if (!controller.signal.aborted) { setAgents([]); setError(e instanceof Error ? e.message : '接続を確認してください。'); } }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [attempt]);
  const owned: FeedItem[] = agents.map(a => ({ id: a.id, manifest: a.manifest, own: true, createdAt: a.createdAt }));
  const items: FeedItem[] = tab === 'following' ? [] : tab === 'mine' || catalogEnabled ? owned : [{ id: 'anicca', manifest: aniccaAgent, own: false }, ...owned];
  if (tab !== 'recommended') items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0) || a.id.localeCompare(b.id));
  const results = items.filter(({ manifest: m }) => (filter === 'all' || filter === 'agent' || m.adapter === filter) && `${m.name} ${m.summary} ${m.author}`.toLowerCase().includes(query.trim().toLowerCase()));
  const total = results.length + (catalog?.total || 0);
  function focusSearch() { searchInput.current?.focus(); searchInput.current?.scrollIntoView({ block: 'center' }); }
  function resetFeed() { setQuery(''); setFilter('all'); setTab('recommended'); document.getElementById('noah-feed')?.scrollIntoView({ block: 'start' }); }

  return <div className={styles.surface} data-noah-catalog={embedded ? 'embedded' : undefined}>
    <a className={styles.skip} href="#noah-feed">タイムラインへ</a>
    <div className={styles.layout}>
      <aside className={styles.leftRail}>
        <div className={styles.leftInner}>
          <Link href="/noah/explore" className={styles.brand} aria-label="Noah ホーム"><Image src={webBrandIcon} width={42} height={42} alt="" unoptimized className={styles.brandMark} /><span className={styles.brandWord}>Noah</span></Link>
          <nav className={styles.navigation} aria-label="Noahのメニュー">
            <button type="button" className={styles.activeNav} onClick={resetFeed} aria-label="ホーム"><House size={25} strokeWidth={2.2} /><span>ホーム</span></button>
            <button type="button" onClick={focusSearch} aria-label="検索"><Search size={26} strokeWidth={1.7} /><span>検索</span></button>
            <Link href="/noah/saved?tab=agents" aria-label="自分のAgent"><Bot size={26} strokeWidth={1.7} /><span>自分のAgent</span></Link>
            <Link href="/noah" aria-label="マーケット"><Store size={25} strokeWidth={1.7} /><span>マーケット</span></Link>
            <Link href="/noah/work" aria-label="仕事"><ListChecks size={25} strokeWidth={1.7} /><span>仕事</span></Link>
          </nav>
          <Link href="/noah/agents/new" className={styles.addButton} aria-label="Agentを追加"><Plus size={22} /><span>Agentを追加</span></Link>
          <Link href="/noah/saved?tab=agents" className={styles.account} aria-label="自分のAgentを管理"><span className={styles.accountAvatar}><Bot size={21} /></span><span><strong>自分のNoah</strong><small>Agentを管理する</small></span><MoreHorizontal size={20} /></Link>
        </div>
      </aside>

      <main id="noah-feed" className={styles.feed} tabIndex={-1}>
        <header className={styles.feedHeader}>
          <div className={styles.titleRow}><h1>Noah</h1><span>Agentが集まる場所</span><Link href="/noah/agents/new" aria-label="自分のAgentを追加"><Plus size={22} /></Link></div>
          <nav className={styles.tabs} aria-label="タイムラインの表示">
            {tabs.map(t => <button key={t.id} type="button" aria-pressed={tab === t.id} onClick={() => { setTab(t.id); if (t.id === 'following') setFilter('all'); }} className={tab === t.id ? styles.selectedTab : ''}><span>{t.label}</span></button>)}
          </nav>
        </header>
        <section className={styles.discovery} aria-label="Agentを探す">
          <div className={styles.searchRow}><span className={styles.searchAvatar}><Search size={21} strokeWidth={1.6} /></span><input ref={searchInput} aria-label="Agentを検索" placeholder="どんな仕事を任せたい？" value={query} onChange={e => setQuery(e.target.value)} />{query && <button type="button" aria-label="検索をクリア" onClick={() => setQuery('')}><X size={18} /></button>}</div>
          <div hidden={tab === 'following'} className={styles.filters} aria-label="分類・接続方式で絞り込む">{filters.map(f => <button key={f.id} type="button" aria-pressed={filter === f.id} className={filter === f.id ? styles.selectedFilter : ''} onClick={() => setFilter(f.id)}>{f.label}</button>)}</div>
        </section>
        <div className={styles.feedLabel}><Compass size={14} /><span>{tab === 'mine' ? 'あなたが登録したAgent' : tab === 'latest' ? '調査で見つかったAgentと関連資産' : '世界のAgentを見つける'}</span><span className={styles.resultCount}>{total.toLocaleString('ja-JP')}件</span></div>
        {catalog && <p className={styles.researchNote}>調査日 {catalog.asOf} · Agent候補と関連資産を掲載。資料確認と接続試験は別です。</p>}
        <div aria-live="polite" aria-atomic="true" className={styles.srOnly}>{loading || catalogLoading ? 'Agentを読み込み中' : `${tabs.find(t => t.id === tab)?.label}、${total}件`}</div>
        <section aria-label="Agentのタイムライン">
          {tab !== 'mine' && ['all','agent','candidate'].includes(filter) && <NoahDiscoveryFeed query={query} order={tab} />}
          {tab !== 'mine' && filter === 'all' && <NoahPublishedFeed query={query} order={tab} />}
          {results.map(item => <AgentPost key={item.id} item={item} />)}
          {catalog?.entries.map(entry => <ResearchPost key={entry.id} entry={entry} />)}
          {catalogLoading && <output className={styles.loading}><span />世界のAgentを読み込んでいます</output>}
          {catalogError && <div className={styles.notice} role="alert"><strong>調査カタログを読み込めませんでした</strong><p>{catalogError}</p><button type="button" onClick={() => catalog?.nextCursor ? void loadMore() : setCatalogAttempt(n => n + 1)}>もう一度読み込む</button></div>}
          {loading && <output className={styles.loading}><span />登録したAgentを読み込んでいます</output>}
          {error && <div className={styles.notice} role="alert"><strong>自分のAgentを読み込めませんでした</strong><p>{error}</p><button type="button" onClick={() => { setLoading(true); setError(''); setAttempt(n => n + 1); }}>もう一度読み込む</button></div>}
          {tab !== 'following' && !loading && !catalogLoading && !error && !catalogError && !total && <div className={styles.empty}><Search size={29} strokeWidth={1.4} /><h2>{query || filter !== 'all' ? '条件に合うAgentがありません' : '最初のAgentを追加しよう'}</h2><p>{query || filter !== 'all' ? '名前やできる仕事で検索してみてください。' : '自分で作ったAgentも、外部のAgentも。'}</p>{query || filter !== 'all' ? <button type="button" onClick={() => { setQuery(''); setFilter('all'); }}>検索条件をクリア</button> : <Link href="/noah/agents/new">Agentを追加 <ArrowUpRight size={15} /></Link>}</div>}
        </section>
        {catalog?.nextCursor && <div ref={sentinel} className={styles.feedEnd}><button type="button" disabled={moreLoading} onClick={() => void loadMore()}>{moreLoading ? '読み込んでいます…' : '続きを読み込む'}</button></div>}
        {!loading && !catalogLoading && total > 0 && !catalog?.nextCursor && <div className={styles.feedEnd}><span /><p>ここまでのAgentを表示しました</p><Link href="/noah/discover">ほかのToolも探す <ArrowRight size={14} /></Link></div>}
        <section className={styles.createPrompt}><span className={styles.createIcon}><FilePlus2 size={22} /></span><div><h2>あなたのAgentも、Noahへ。</h2><p>URLや定義ファイルから追加できます。</p><Link href="/noah/agents/new">Agentを追加する <ArrowRight size={14} /></Link></div></section>
      </main>

      <aside className={styles.rightRail} aria-label="Agentの発見と管理">
        <div className={styles.rightInner}>
          <div className={styles.sideSearch}><Search size={18} /><input aria-label="サイドバーからAgentを検索" placeholder="Agentを検索" value={query} onChange={e => setQuery(e.target.value)} /></div>
          <section className={styles.sidePanel}><h2>気になるAgentから。</h2><p>できることを見て、<br />自分に合ったAgentを見つけよう。</p><Link href="/noah/agents/anicca" className={styles.suggestion}><span className={`${styles.avatar} ${styles.aniccaAvatar}`}>a</span><span><strong>Anicca</strong><small>このMac · Life Manager</small></span><span className={styles.smallButton}>見る</span></Link><Link href="/noah/discover" className={styles.moreLink}>もっと探す <ArrowRight size={14} /></Link></section>
          <section className={styles.sidePanel}><span className={styles.sideEyebrow}>YOUR SPACE</span><h2>自分のAgent</h2><p>追加したAgentの設定や接続を、<br />ひとつの場所で。</p><Link className={styles.libraryLink} href="/noah/saved?tab=agents"><Bot size={20} /><span>ライブラリを開く</span><ChevronRight size={17} /></Link></section>
          <div className={styles.sideFooter}><Link href="/sky/help"><CircleHelp size={13} />使い方</Link><Link href="/noah">マーケット</Link><span>Noah · avokado</span></div>
        </div>
      </aside>
    </div>
    <Link href="/noah/agents/new" className={styles.mobileAdd} aria-label="Agentを追加"><Plus size={27} /></Link>
    <nav className={styles.mobileNav} aria-label="Noahのモバイルメニュー"><button type="button" aria-label="ホーム" onClick={resetFeed}><House size={24} /></button><button type="button" aria-label="検索" onClick={focusSearch}><Search size={24} /></button><Link href="/noah/saved?tab=agents" aria-label="自分のAgent"><Bot size={24} /></Link><Link href="/noah/work" aria-label="仕事"><ListChecks size={24} /></Link></nav>
  </div>;
}

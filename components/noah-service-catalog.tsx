'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Bot, Laptop, Search, ArrowRight } from 'lucide-react';
import styles from './noah-service.module.css';
type Agent = { id: string; name: string; summary: string; kind: string; model: string };
export default function NoahServiceCatalog({ compact = false, initialQuery = '' }: { compact?: boolean; initialQuery?: string }) {
  const [agents, setAgents] = useState<Agent[] | null>(null), [error, setError] = useState(''), [query, setQuery] = useState(initialQuery), [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/noah/launch?public=1', { signal: controller.signal, cache: 'no-store' }).then(async response => {
      const data = await response.json() as { agents?: Agent[] };
      if (!response.ok || !Array.isArray(data.agents) || data.agents.some(a => !a || typeof a.id !== 'string' || typeof a.name !== 'string' || typeof a.summary !== 'string')) throw Error('Agentの一覧を取得できませんでした。接続を確認して、もう一度お試しください。');
      if (!controller.signal.aborted) { setAgents(data.agents); setError(''); }
    }).catch((e: unknown) => { if (!controller.signal.aborted) { setAgents(null); setError(e instanceof Error ? e.message : 'Agentを読み込めませんでした。もう一度お試しください。'); } });
    return () => controller.abort();
  }, [retry]);
  const search = query.trim().toLocaleLowerCase('ja-JP');
  const filtered = agents?.filter(a => `${a.name} ${a.summary}`.toLocaleLowerCase('ja-JP').includes(search));
  const shown = compact ? filtered?.slice(0, 3) : filtered;
  if (compact) return <div className={styles.suggestions} aria-label="使えるAgentの一覧">
    {error ? <div role="alert"><p>一覧を取得できませんでした。</p><button onClick={() => { setError(''); setAgents(null); setRetry(n => n + 1); }}>再読み込み</button></div> : agents === null ? <output>読み込み中…</output> : shown?.length === 0 ? <p>公開中のAgentはまだありません。</p> : shown?.map(a => <Link key={a.id} href={`/noah/mac/activity?${new URLSearchParams({ agent: a.id })}#library`} className={styles.suggestion}><span className={styles.suggestionAvatar}><Bot size={21} /></span><span><strong>{a.name}</strong><small>Macで使う · 接続条件を確認</small></span><ArrowUpRight size={16} /></Link>)}
    <Link className={styles.suggestionMore} href="/noah/explore">さらに表示</Link>
  </div>;
  return <section aria-label="実行対応Agent" className={styles.catalog}>
    <div className={styles.sectionHeading}><div><span className={styles.eyebrow}>FIND YOUR AGENT</span><h2>{compact ? 'まずは、ひとつ選んでみよう。' : 'あなたに合うAgentを。'}</h2></div>{compact && <Link href="/noah/explore">すべて見る <ArrowRight size={16} /></Link>}</div>
    <p className={styles.sectionNote}>現在は、接続したMacで動くAgentを掲載しています。使う前に、できることと接続条件を確認できます。</p>
    {!compact && <label className={styles.search}><Search size={19} /><span className={styles.srOnly}>Agentを検索</span><input type="search" value={query} maxLength={120} placeholder="名前や、頼みたい仕事で探す" onChange={e => setQuery(e.target.value)} /></label>}
    {error ? <div className={styles.empty} role="alert"><p>{error}</p><button onClick={() => { setError(''); setAgents(null); setRetry(n => n + 1); }}>再読み込み</button></div> : agents === null ? <div className={styles.loading}><output>Agentを読み込んでいます…</output></div> : <>
      {!compact && <p className={styles.count}>{filtered?.length}件のAgent{search && ` · 「${query.trim()}」の検索結果`}</p>}
      {shown?.length === 0 && <div className={styles.empty}><Bot size={28} /><p>{search ? '条件に合うAgentが見つかりませんでした。別の言葉で探してみてください。' : '実行対応Agentはまだありません。時間をおいてご確認ください。'}</p>{search && <button onClick={() => setQuery('')}>検索をクリア</button>}</div>}
      <div className={styles.agentGrid}>{shown?.map((a, i) => <article key={a.id} className={styles.agentCard}>
        <div className={styles.cardTop}><span className={styles.agentIcon} data-tone={i % 3}><Bot size={24} strokeWidth={1.6} /></span><span className={styles.badge}>{a.kind === 'release' ? '審査済み公開版' : '対応済みAgent'}</span></div>
        <h3>{a.name}</h3><p>{a.summary}</p>
        <div className={styles.cardBottom}><span><Laptop size={14} />Macで使う</span><Link href={`/noah/mac/activity?${new URLSearchParams({ agent: a.id })}#library`} aria-label={`${a.name}の接続条件を見る`}>接続条件を見る <ArrowUpRight size={16} /></Link></div>
        {a.model === 'codex-account' && <p className={styles.registrationLink}><Link href={`/noah/registration?${new URLSearchParams({ agent: a.id })}`}>外部アカウントの登録を依頼する <ArrowUpRight size={13} /></Link></p>}
      </article>)}</div>
    </>}
    {!compact && <div className={styles.researchNote}><CompassNote /><p>もっと広く探したい方へ。<Link href="/noah/agents">調査カタログ</Link>では、接続準備中のAgentや関連するToolも確認できます。</p></div>}
  </section>;
}
function CompassNote() { return <Search size={19} aria-hidden="true" />; }

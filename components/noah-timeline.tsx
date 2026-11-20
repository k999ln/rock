'use client';
/* oxlint-disable next/no-html-link-for-pages -- Filters intentionally use the same timeline's hash. */
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Bot, MessageCircle, Share2, ArrowUpRight, ArrowLeft, RefreshCw, Search, PenLine } from 'lucide-react';
import { researchKindLabels } from '@/lib/noah-research-types';
import { selectNoahTimeline, timelineFilter, type NoahTimelineItem } from '@/lib/noah-timeline-feed';
import type { NoahSurfaceMode } from '@/lib/noah-surface';
import { useNoahHash } from './use-noah-hash';
import { useNoahTimeline } from './use-noah-timeline';
import styles from './noah-shell.module.css';

export default function NoahTimeline({ mode, base }: { mode: NoahSurfaceMode; base: string }) {
  const filter = timelineFilter(useNoahHash());
  const [query, setQuery] = useState(''), [kind, setKind] = useState('all'), [notice, setNotice] = useState('');
  const feed = useNoahTimeline(mode, query, filter === 'agent' ? kind : 'all', filter);
  const { hasMore, loadMore } = feed, hasErrors = Boolean(feed.data?.errors.length);
  const sentinel = useRef<HTMLDivElement>(null);
  const items = selectNoahTimeline(feed.data?.items ?? [], filter, query);
  useEffect(() => {
    if (!sentinel.current || !hasMore || hasErrors || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) void loadMore(); }, { rootMargin: '200px' });
    observer.observe(sentinel.current); return () => observer.disconnect();
  }, [hasMore, loadMore, hasErrors]);
  async function share(item: NoahTimelineItem) {
    const href = item.kind === 'agent' ? `${base}/agents/${item.agent.id}` : `${base}/social?post=${item.post.id}`;
    const url = new URL(href, window.location.origin).href;
    try {
      if (navigator.share) await navigator.share({ url });
      else { await navigator.clipboard.writeText(url); setNotice('リンクをコピーしました。限定投稿は閲覧できる人だけが開けます。'); }
    } catch (e) { if (!(e instanceof Error && e.name === 'AbortError')) setNotice('共有できませんでした。詳細画面のURLを確認してください。'); }
  }
  return <main className={styles.home}>
    <div className={styles.feedTop}>
      <header className={styles.timelineHeading}><h2>{filter === 'agent' ? 'Agent' : 'タイムライン'}</h2><a className={styles.filterButton} href={`${base}${filter === 'agent' ? '#timeline' : '#agents'}`}>{filter === 'agent' ? <><ArrowLeft size={16} />すべてに戻る</> : <><Bot size={17} />Agent</>}</a><button aria-label="タイムラインを更新" disabled={feed.loading} onClick={feed.refresh}><RefreshCw size={19} /></button></header>
    </div>
    <Link href={`${base}/social#compose`} className={styles.composeEntry}><span className={styles.mixedAvatar}><PenLine size={22} /></span><span>いま、何をシェアする？<small>アイデアやAgentの成果をポスト</small></span><strong>ポストする</strong></Link>
    <div className={styles.timelineSearch}><Search size={18} /><input aria-label="タイムラインを検索" placeholder="Agent、話題、投稿を検索" maxLength={200} value={query} onChange={e => setQuery(e.target.value)} />{query && <button onClick={() => setQuery('')}>クリア</button>}</div>
    {filter === 'agent' && <div className={styles.topics} aria-label="Agentの分類">{[['all','すべて'],['agent','Agent本体候補'],['candidate','分類確認待ち'],['related','Tool・モデル等']].map(([id,label]) => <button key={id} aria-pressed={kind===id} onClick={() => setKind(id)}>{label}</button>)}<Link href={`${base}/agents`}>詳しく探す</Link></div>}
    <div className={styles.guestAccess}><span>閲覧・検索は登録なしで。</span><Link href={`${base}/registration`}>外部Agentの登録を依頼 <ArrowUpRight size={14} /></Link></div>
    <p className={styles.feedMeta}>カードのラベルで種類を確認できます。Agentの掲載は実行対応を意味しません。</p>
    {notice && <output className={styles.status}>{notice}</output>}
    {feed.loading && <output className={styles.status}>タイムラインを読み込んでいます…</output>}
    {feed.data && !feed.data.social?.profile && <div className={styles.joinPrompt}><span>投稿やフォローを保存したい場合は、アカウントと公開名を設定できます。</span><Link href={`${base}/social`}>投稿・参加の準備 <ArrowUpRight size={14} /></Link></div>}
    {!!feed.data?.errors.length && <details className={styles.feedError}><summary>一部の情報を取得できませんでした</summary>{feed.data.errors.map(error => <p key={error}>{error}</p>)}<button onClick={feed.refresh}>再試行</button></details>}
    <section aria-label="Noahの統合タイムライン">{items.map(item => {
      const social = item.kind === 'post' ? item.post : null;
      const Icon = item.kind === 'agent' ? Bot : MessageCircle;
      const label = item.kind === 'agent' ? (item.agent.kind === 'agent' || item.agent.kind === 'candidate' ? 'Agent' : 'Tool・モデル等') : '投稿';
      return <article key={item.key} className={styles.mixedPost} data-feed-kind={item.kind}>
        <div className={styles.cardType}><span data-kind={item.kind}><Icon size={13} />{label}</span></div>
        <div className={styles.cardBody}><div className={styles.mixedAvatar} data-kind={item.kind}><Icon size={22} /></div><div>
          {item.kind === 'agent' ? <><p className={styles.publisher}>{item.agent.author || '公開資料からの紹介'} · 調査カタログ</p><h3><Link href={`${base}/agents/${item.agent.id}`}>{item.agent.name}</Link></h3><p className={styles.description}>{item.agent.summary}</p><p className={styles.publisher}>{researchKindLabels[item.agent.kind]} · {item.agent.level === 'primary' ? '一次資料を確認' : '資料確認待ち'}</p></> : social && <><p className={styles.publisher}>{social.author.name} · {new Date(social.createdAt).toLocaleDateString('ja-JP')}{social.following ? ' · フォロー中' : ''}</p><Link className={styles.socialText} href={`${base}/social?post=${social.id}`}>{social.content}</Link>{social.attachment && <p className={styles.attachment}>共有：{social.attachment.kind} · {social.attachment.resource}</p>}</>}
          <footer>{item.kind === 'agent' ? <Link href={`${base}/agents/${item.agent.id}`}>詳細・接続条件 <ArrowUpRight size={14} /></Link> : <Link href={`${base}/social?post=${social!.id}`}>返信・詳細{social!.replies ? ` (${social!.replies})` : ''} <ArrowUpRight size={14} /></Link>}<button onClick={() => void share(item)}><Share2 size={14} />共有</button></footer>
        </div></div>
      </article>;
    })}</section>
    {!feed.loading && !items.length && <p className={styles.status}>{'条件に合う情報はまだありません。'}</p>}
    {feed.hasMore && <div ref={sentinel} className={styles.moreRow}><button disabled={feed.moreLoading} onClick={() => void feed.loadMore()}>{feed.moreLoading ? '読み込み中…' : '続きを読み込む'}</button></div>}
  </main>;
}

'use client';
/* oxlint-disable next/no-html-link-for-pages -- Filters intentionally use the same timeline's hash. */
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Bot, Users, Newspaper, MessageCircle, Share2, ArrowUpRight, RefreshCw, Search, PenLine } from 'lucide-react';
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
    const href = item.kind === 'news' ? item.article.url : item.kind === 'agent' ? `${base}/agents/${item.agent.id}` : `${base}/social?post=${item.post.id}`;
    const url = new URL(href, window.location.origin).href;
    try {
      if (navigator.share) await navigator.share({ url });
      else { await navigator.clipboard.writeText(url); setNotice('リンクをコピーしました。限定投稿は閲覧できる人だけが開けます。'); }
    } catch (e) { if (!(e instanceof Error && e.name === 'AbortError')) setNotice('共有できませんでした。詳細画面のURLを確認してください。'); }
  }
  return <main className={styles.home}>
    <header className={styles.timelineHeading}><div><h2>タイムライン</h2><p>ニュースも、Agentも、みんなの投稿も。</p></div><Link href={`${base}/social#compose`}><PenLine size={18} />投稿する</Link><button aria-label="タイムラインを更新" disabled={feed.loading} onClick={feed.refresh}><RefreshCw size={18} /></button></header>
    <nav className={styles.topics} aria-label="タイムラインの種類">{[['all','#timeline','すべて'],['following','#following','フォロー中'],['agent','#agents','Agent'],['news','#news','ニュース'],['community','#communities','コミュニティー']].map(([id, hash, label]) => <a key={id} href={`${base}${hash}`} aria-current={filter === id ? 'page' : undefined}>{label}</a>)}</nav>
    <div className={styles.timelineSearch}><Search size={18} /><input aria-label="タイムラインを検索" placeholder="Agent、話題、投稿を検索" maxLength={200} value={query} onChange={e => setQuery(e.target.value)} />{query && <button onClick={() => setQuery('')}>クリア</button>}</div>
    {filter === 'agent' && <div className={styles.topics} aria-label="Agentの分類">{[['all','すべて'],['agent','Agent本体候補'],['candidate','分類確認待ち'],['related','Tool・モデル等']].map(([id,label]) => <button key={id} aria-pressed={kind===id} onClick={() => setKind(id)}>{label}</button>)}<Link href={`${base}/agents`}>詳しく探す</Link></div>}
    <p className={styles.feedMeta}>カードのラベルで種類を確認できます。Agentの掲載は実行対応を意味しません。</p>
    {notice && <output className={styles.status}>{notice}</output>}
    {feed.loading && <output className={styles.status}>タイムラインを読み込んでいます…</output>}
    {feed.data && !feed.data.social?.profile && <div className={styles.joinPrompt}><span>フォロー・投稿・コミュニティーを使うには、アカウントと公開名を設定してください。</span><Link href={`${base}/social`}>投稿・参加の準備 <ArrowUpRight size={14} /></Link></div>}
    {!!feed.data?.errors.length && <details className={styles.feedError}><summary>一部の情報を取得できませんでした</summary>{feed.data.errors.map(error => <p key={error}>{error}</p>)}<button onClick={feed.refresh}>再試行</button></details>}
    <section aria-label="Noahの統合タイムライン">{items.map(item => {
      const social = item.kind === 'post' || item.kind === 'community' ? item.post : null;
      const Icon = item.kind === 'news' ? Newspaper : item.kind === 'agent' ? Bot : item.kind === 'community' ? Users : MessageCircle;
      const label = item.kind === 'news' ? 'ニュース' : item.kind === 'agent' ? (item.agent.kind === 'agent' || item.agent.kind === 'candidate' ? 'Agent' : 'Tool・モデル等') : item.kind === 'community' ? 'コミュニティー' : '投稿';
      return <article key={item.key} className={styles.mixedPost} data-feed-kind={item.kind}>
        <div className={styles.cardType}><span data-kind={item.kind}><Icon size={13} />{label}</span>{social?.community && <Link href={`${base}/social#community=${social.community.id}`}>{social.community.name}</Link>}</div>
        <div className={styles.cardBody}><div className={styles.mixedAvatar} data-kind={item.kind}><Icon size={22} /></div><div>
          {item.kind === 'news' ? <><p className={styles.publisher}>{item.article.publisher} · {new Date(item.article.seenAt).toLocaleDateString('ja-JP')}{item.stale ? ' · 保存済み' : ''}</p><h3><a href={item.article.url} target="_blank" rel="noopener noreferrer">{item.article.title}</a></h3><p className={styles.description}>配信元の記事</p></> : item.kind === 'agent' ? <><p className={styles.publisher}>{item.agent.author || '公開資料からの紹介'} · 調査カタログ</p><h3><Link href={`${base}/agents/${item.agent.id}`}>{item.agent.name}</Link></h3><p className={styles.description}>{item.agent.summary}</p><p className={styles.publisher}>{researchKindLabels[item.agent.kind]} · {item.agent.level === 'primary' ? '一次資料を確認' : '資料確認待ち'}</p></> : social && <><p className={styles.publisher}>{social.author.name} · {new Date(social.createdAt).toLocaleDateString('ja-JP')}{social.following ? ' · フォロー中' : ''}</p><Link className={styles.socialText} href={`${base}/social?post=${social.id}`}>{social.content}</Link>{social.attachment && <p className={styles.attachment}>共有：{social.attachment.kind} · {social.attachment.resource}</p>}</>}
          <footer>{item.kind === 'news' ? <a href={item.article.url} target="_blank" rel="noopener noreferrer">原文を読む <ArrowUpRight size={14} /></a> : item.kind === 'agent' ? <Link href={`${base}/agents/${item.agent.id}`}>詳細・接続条件 <ArrowUpRight size={14} /></Link> : <Link href={`${base}/social?post=${social!.id}`}>返信・詳細{social!.replies ? ` (${social!.replies})` : ''} <ArrowUpRight size={14} /></Link>}<button onClick={() => void share(item)}><Share2 size={14} />共有</button></footer>
        </div></div>
      </article>;
    })}</section>
    {!feed.loading && !items.length && <p className={styles.status}>{filter === 'community' ? '閲覧できるコミュニティーの投稿はまだありません。' : filter === 'following' ? 'フォローしている人の投稿はまだありません。' : '条件に合う情報はまだありません。'}</p>}
    {filter === 'community' && <p className={styles.status}><Link href={`${base}/social#communities`}>コミュニティーを探す・参加する →</Link></p>}
    {feed.hasMore && <div ref={sentinel} className={styles.moreRow}><button disabled={feed.moreLoading} onClick={() => void feed.loadMore()}>{feed.moreLoading ? '読み込み中…' : '続きを読み込む'}</button></div>}
  </main>;
}

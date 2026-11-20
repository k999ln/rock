'use client';
/* oxlint-disable next/no-html-link-for-pages -- Filters intentionally use the same timeline's hash. */
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Bot,
  MessageCircle,
  Share2,
  ArrowUpRight,
  ArrowLeft,
  RefreshCw,
  Search,
  Heart,
  Repeat2,
  Plus,
} from 'lucide-react';
import { researchKindLabels } from '@/lib/noah-research-types';
import {
  selectNoahTimeline,
  timelineFilter,
  type NoahTimelineItem,
} from '@/lib/noah-timeline-feed';
import type { NoahSurfaceMode } from '@/lib/noah-surface';
import { useNoahHash } from './use-noah-hash';
import { useNoahTimeline } from './use-noah-timeline';
import styles from './noah-shell.module.css';
import { useNoahFeedback } from './use-noah-feedback';
import { NoahAgentSignals } from './noah-agent-feedback';

export default function NoahTimeline({
  mode,
  base,
}: {
  mode: NoahSurfaceMode;
  base: string;
}) {
  const filter = timelineFilter(useNoahHash());
  const [query, setQuery] = useState(''),
    [kind, setKind] = useState('all'),
    [notice, setNotice] = useState('');
  const feed = useNoahTimeline(
    mode,
    query,
    filter === 'agent' ? kind : 'all',
    filter,
  );
  const { hasMore, loadMore } = feed,
    hasErrors = Boolean(feed.data?.errors.length);
  const sentinel = useRef<HTMLDivElement>(null);
  const items = selectNoahTimeline(feed.data?.items ?? [], filter, query);
  const feedback = useNoahFeedback(
    items.flatMap((item) =>
      item.kind === 'agent' &&
      (item.agent.kind === 'agent' || item.agent.kind === 'candidate')
        ? [item.agent.id]
        : [],
    ),
  );
  const hasPersonalPosts = items.some(
    (item) => item.kind === 'post' || item.kind === 'feedback',
  );
  useEffect(() => {
    if (
      !sentinel.current ||
      !hasMore ||
      hasErrors ||
      typeof IntersectionObserver === 'undefined'
    )
      return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void loadMore();
      },
      { rootMargin: '200px' },
    );
    observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, [hasMore, loadMore, hasErrors]);
  async function share(item: NoahTimelineItem) {
    const href =
      item.kind === 'agent'
        ? `${base}/agents/${item.agent.id}`
        : item.kind === 'feedback'
          ? `${base}/feedback/${item.opinion.agentId}#comment-${item.opinion.id}`
          : `${base}/social?post=${item.post.id}`;
    const url = new URL(href, window.location.origin).href;
    try {
      if (navigator.share) await navigator.share({ url });
      else {
        await navigator.clipboard.writeText(url);
        setNotice(
          'リンクをコピーしました。限定投稿は閲覧できる人だけが開けます。',
        );
      }
    } catch (e) {
      if (!(e instanceof Error && e.name === 'AbortError'))
        setNotice('共有できませんでした。詳細画面のURLを確認してください。');
    }
  }
  return (
    <main className={styles.home}>
      <div className={styles.feedTop}>
        <header className={styles.timelineHeading}>
          <h2>{filter === 'agent' ? 'Agent' : 'タイムライン'}</h2>
          <a
            className={styles.filterButton}
            href={`${base}${filter === 'agent' ? '#timeline' : '#agents'}`}
          >
            {filter === 'agent' ? (
              <>
                <ArrowLeft size={16} />
                すべてに戻る
              </>
            ) : (
              <>
                <Bot size={17} />
                Agent
              </>
            )}
          </a>
          <button
            aria-label="タイムラインを更新"
            disabled={feed.loading}
            onClick={feed.refresh}
          >
            <RefreshCw size={19} />
          </button>
        </header>
      </div>
      {filter === 'all' && (
        <div className={styles.composeBlock}>
          <Link href={`${base}/social#compose`} className={styles.composeEntry}>
            <span>
              <span className={styles.composeEyebrow}>YOUR TAKE</span>
              <strong>使ってみて、どうだった？</strong>
              <small>感想も、発見も、ちょっとした本音も。</small>
            </span>
            <span className={styles.composeAction}>
              <Plus size={24} />
              <span>ポスト</span>
            </span>
          </Link>
          <div className={styles.conversationHints}>
            <span>使ってよかった</span>
            <span>ここが惜しい</span>
            <span>こんな使い方</span>
          </div>
        </div>
      )}
      <div className={styles.timelineSearch}>
        <Search size={18} />
        <input
          aria-label="タイムラインを検索"
          placeholder="気になるAgentや、みんなの声を検索"
          maxLength={200}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && <button onClick={() => setQuery('')}>クリア</button>}
      </div>
      {filter === 'agent' && (
        <div className={styles.topics} aria-label="Agentの分類">
          {[
            ['all', 'すべて'],
            ['agent', 'Agent本体候補'],
            ['candidate', '分類確認待ち'],
            ['related', 'Tool・モデル等'],
          ].map(([id, label]) => (
            <button
              key={id}
              aria-pressed={kind === id}
              onClick={() => setKind(id)}
            >
              {label}
            </button>
          ))}
          <Link href={`${base}/agents`}>詳しく探す</Link>
        </div>
      )}
      {feedback.error && (
        <p className={styles.feedError}>
          評価を読み込めませんでした。
          <button onClick={feedback.reload}>再読み込み</button>
        </p>
      )}
      {notice && <output className={styles.status}>{notice}</output>}
      {feed.loading && (
        <output className={styles.loading}>
          タイムラインを読み込んでいます…
          <span aria-hidden="true" />
          <span aria-hidden="true" />
        </output>
      )}
      {filter === 'all' &&
        feed.data?.social &&
        !hasPersonalPosts &&
        !query.trim() && (
          <div className={styles.voiceInvitation}>
            <MessageCircle size={21} />
            <div>
              <strong>あなたのひとことから。</strong>
              <p>
                {feed.data.social.profile
                  ? '表示できる投稿はまだありません。使って感じたことをシェアしてみよう。'
                  : '感想や発見をシェアするには、公開名を設定できます。'}
              </p>
              <Link href={`${base}/social#compose`}>
                自分の感想を書く <ArrowUpRight size={15} />
              </Link>
            </div>
          </div>
        )}
      {!!feed.data?.errors.length && (
        <details className={styles.feedError}>
          <summary>一部の情報を取得できませんでした</summary>
          {feed.data.errors.map((error) => (
            <p key={error}>{error}</p>
          ))}
          <button onClick={feed.refresh}>再試行</button>
        </details>
      )}
      <section aria-label="Noahの統合タイムライン">
        {items.map((item) => {
          if (item.kind === 'post' || item.kind === 'feedback') {
            const post =
              item.kind === 'post'
                ? item.post
                : {
                    id: item.opinion.id,
                    author: { name: item.opinion.author },
                    content: item.opinion.content,
                    createdAt: item.opinion.createdAt,
                    following: false,
                    attachment: null,
                    replies: item.opinion.replies,
                    likes: 0,
                    reposts: 0,
                  };
            const href =
              item.kind === 'post'
                ? `${base}/social?post=${post.id}`
                : `${base}/feedback/${item.opinion.agentId}#comment-${post.id}`;
            return (
              <article
                key={item.key}
                className={styles.personalPost}
                data-feed-kind={item.kind}
              >
                <span className={styles.personAvatar} aria-hidden="true">
                  {post.author.name.slice(0, 1)}
                </span>
                <div className={styles.personalBody}>
                  <div className={styles.byline}>
                    <strong>{post.author.name}</strong>
                    {post.following && (
                      <span className={styles.following}>フォロー中</span>
                    )}
                    <time dateTime={new Date(post.createdAt).toISOString()}>
                      {new Date(post.createdAt).toLocaleDateString('ja-JP')}
                    </time>
                  </div>
                  <Link className={styles.socialText} href={href}>
                    {post.content}
                  </Link>
                  {item.kind === 'feedback' && (
                    <Link
                      href={`${base}/agents/${item.opinion.agentId}`}
                      className={styles.opinionAgent}
                    >
                      <Bot size={14} />
                      {item.opinion.agentName} への感想{' '}
                      <ArrowUpRight size={13} />
                    </Link>
                  )}
                  {post.attachment && (
                    <p className={styles.attachment}>
                      <span>
                        {post.attachment.kind === 'agent'
                          ? '使ったAgent'
                          : '共有'}
                      </span>
                      {post.attachment.resource}
                    </p>
                  )}
                  <footer className={styles.postActions}>
                    <Link href={href} aria-label="返信を見る">
                      <MessageCircle size={17} />
                      {post.replies > 0 ? post.replies : '返信'}
                    </Link>
                    {item.kind === 'post' && (
                      <>
                        <Link href={href} aria-label="いいね・詳細">
                          <Heart size={17} />
                          {post.likes > 0 ? post.likes : 'いいね'}
                        </Link>
                        <Link href={href} aria-label="リポスト・詳細">
                          <Repeat2 size={17} />
                          {post.reposts > 0 ? post.reposts : 'リポスト'}
                        </Link>
                      </>
                    )}
                    <button
                      aria-label="投稿を共有"
                      onClick={() => void share(item)}
                    >
                      <Share2 size={16} />
                    </button>
                  </footer>
                </div>
              </article>
            );
          }
          const agent = item.agent;
          return (
            <article
              key={item.key}
              className={styles.agentPost}
              data-feed-kind="agent"
            >
              <div className={styles.agentLabel}>
                <Bot size={14} />
                <span>Agent紹介</span>
                <span>{researchKindLabels[agent.kind]}</span>
              </div>
              <Link
                href={`${base}/agents/${agent.id}`}
                className={styles.agentPreview}
              >
                <span className={styles.agentMonogram} aria-hidden="true">
                  {agent.name.slice(0, 1).toUpperCase()}
                </span>
                <div>
                  <span className={styles.publisher}>
                    {agent.author || '公開資料からの紹介'}
                  </span>
                  <h3>{agent.name}</h3>
                  <p>{agent.summary}</p>
                </div>
                <ArrowUpRight size={20} />
              </Link>
              {(agent.kind === 'agent' || agent.kind === 'candidate') && (
                <NoahAgentSignals
                  id={agent.id}
                  summary={feedback.rows.find(
                    (row) => row.agentId === agent.id,
                  )}
                  onChange={feedback.update}
                  onRetry={feedback.reload}
                  detailHref={`${base}/feedback/${agent.id}#feedback`}
                />
              )}
              <footer className={styles.agentFooter}>
                <span>紹介情報 · 利用条件は詳細で確認</span>
                <button
                  aria-label="Agentを共有"
                  onClick={() => void share(item)}
                >
                  <Share2 size={15} />
                </button>
              </footer>
            </article>
          );
        })}
      </section>
      <div className={styles.guestAccess}>
        <span>閲覧・検索は登録なしで。</span>
        <Link href={`${base}/registration`}>
          外部Agentの登録を依頼 <ArrowUpRight size={14} />
        </Link>
      </div>
      {!feed.loading && !items.length && (
        <p className={styles.status}>{'条件に合う情報はまだありません。'}</p>
      )}
      {feed.hasMore && (
        <div ref={sentinel} className={styles.moreRow}>
          <button
            disabled={feed.moreLoading}
            onClick={() => void feed.loadMore()}
          >
            {feed.moreLoading ? '読み込み中…' : '続きを読み込む'}
          </button>
        </div>
      )}
    </main>
  );
}

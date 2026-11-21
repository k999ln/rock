'use client';
/* oxlint-disable next/no-html-link-for-pages -- Filters intentionally use the same timeline's hash. */
import { useEffect, useRef, useState } from 'react';
import { useNoahLocale } from './noah-locale';
import NoahAgentVisual from './noah-agent-visual';
import NoahLoading from './noah-loading';
import Link from 'next/link';
import {
  Bot,
  MessageCircle,
  Share2,
  ArrowUpRight,
  Search,
  Heart,
  Repeat2,
} from 'lucide-react';
import { noahReadyDetailHref } from '@/lib/noah-ready-view';
import { researchKindLabels } from '@/lib/noah-research-types';
import {
  noahTimelineCardFacts,
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
  const {t,locale}=useNoahLocale();
  const hash=useNoahHash();
  const following=hash==='#following';
  const filter = timelineFilter(hash);
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
  const sentinel = useRef<HTMLDivElement>(null), masonry=useRef<HTMLElement>(null);
  const items = selectNoahTimeline(feed.data?.items ?? [], filter, query).filter(item=>!following||(item.kind==='post'&&item.post.following));
  const feedback = useNoahFeedback(
    items.flatMap((item) =>
      item.kind === 'agent' &&
      (item.agent.kind === 'agent' || item.agent.kind === 'candidate')
        ? [item.agent.id]
        : [],
    ),
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
  const layoutKey=items.map(item=>item.key).join('|');
  useEffect(()=>{
    const grid=masonry.current;if(!grid||typeof ResizeObserver==='undefined')return;
    const cards=Array.from(grid.children) as HTMLElement[];
    const size=(card:HTMLElement)=>{card.style.gridRowEnd=`span ${Math.ceil((card.getBoundingClientRect().height+12)/20)}`;};
    grid.dataset.measured='true';cards.forEach(size);
    const observer=new ResizeObserver(entries=>{for(const entry of entries)size(entry.target as HTMLElement);});cards.forEach(card=>observer.observe(card));
    return()=>observer.disconnect();
  },[layoutKey]);
  async function share(item: NoahTimelineItem) {
    const href =
      item.kind==='remote'?noahReadyDetailHref(item.agent.id):item.kind === 'card'
        ? item.card.target
        : item.kind === 'agent'
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
      <div className={styles.timelineSearch}>
        <Search size={18} />
        <input
          aria-label={t("タイムラインを検索")}
          placeholder={t('投稿やAgentを探す')}
          maxLength={200}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && <button onClick={() => setQuery('')}>{t("クリア")}</button>}
      </div>
      <nav className={styles.feedTabs} aria-label={t('タイムライン')}>
        <a href={`${base}#timeline`} aria-current={!following&&filter==='all'?'page':undefined}>{t('おすすめ')}</a>
        <a href={`${base}#following`} aria-current={following?'page':undefined}>{t('フォロー中')}</a>
        <a href={`${base}${filter==='agent'?'#timeline':'#agents'}`} aria-current={filter==='agent'?'page':undefined} className={styles.agentOnly}>{t('Agentのみ')}</a>
      </nav>
      {filter === 'agent' && (
        <div className={styles.topics} aria-label={t("Agentの分類")}>
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
              {t(label)}
            </button>
          ))}
          <Link href={`${base}/agents`}>{t("詳しく探す")}</Link>
        </div>
      )}
      {feedback.error && (
        <p className={styles.feedError}>
          {t("評価を読み込めませんでした。")}<button onClick={feedback.reload}>{t("再読み込み")}</button>
        </p>
      )}
      {notice && <output className={styles.status}>{t(notice)}</output>}
      {feed.loading && (
        <NoahLoading label={t("タイムラインを読み込んでいます…")} />
      )}
      {!!feed.data?.errors.length && (
        <details className={styles.feedError}>
          <summary>{t("一部の情報を取得できませんでした")}</summary>
          {feed.data.errors.map((error) => (
            <p key={error}>{t(error)}</p>
          ))}
          <button onClick={feed.refresh}>{t("再試行")}</button>
        </details>
      )}
      <section ref={masonry} className={styles.masonry} aria-label={t("Noahの統合タイムライン")}>
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
                      <span className={styles.following}>{t("フォロー中")}</span>
                    )}
                    <time dateTime={new Date(post.createdAt).toISOString()}>
                      {new Date(post.createdAt).toLocaleDateString(locale)}
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
                      {item.opinion.agentName} {t("への感想")}{' '}
                      <ArrowUpRight size={13} />
                    </Link>
                  )}
                  {post.attachment && (
                    <p className={styles.attachment}>
                      <span>
                        {post.attachment.kind === 'agent'
                          ? t("使ったAgent")
                          : t("共有")}
                      </span>
                      {post.attachment.resource}
                    </p>
                  )}
                  <footer className={styles.postActions}>
                    <Link href={href} aria-label={t("返信を見る")}>
                      <MessageCircle size={17} />
                      {post.replies > 0 ? post.replies : t("返信")}
                    </Link>
                    {item.kind === 'post' && (
                      <>
                        <Link href={href} aria-label={t("いいね・詳細")}>
                          <Heart size={17} />
                          {post.likes > 0 ? post.likes : t("いいね")}
                        </Link>
                        <Link href={href} aria-label={t("リポスト・詳細")}>
                          <Repeat2 size={17} />
                          {post.reposts > 0 ? post.reposts : t("リポスト")}
                        </Link>
                      </>
                    )}
                    <button
                      aria-label={t("投稿を共有")}
                      onClick={() => void share(item)}
                    >
                      <Share2 size={16} />
                    </button>
                  </footer>
                </div>
              </article>
            );
          }
          if(item.kind==='remote'){
            const a=item.agent;
            return <article key={item.key} className={styles.agentPost} data-feed-kind="remote"><div className={styles.agentLabel}><Bot size={14}/><span>{t("スマホで使える")}</span><span>{a.section==='ran'?t("成果の受取実績あり"):t("接続確認済み")}</span></div>
              <Link href={noahReadyDetailHref(a.id)} className={styles.agentPreview}><NoahAgentVisual name={a.name} summary={a.summary}/><div><span className={styles.publisher}>{a.provider}</span><h3>{a.name}</h3><p>{a.summary}</p></div><ArrowUpRight size={20}/></Link>
              <footer className={styles.agentFooter}><span>{a.users}{t("人が利用 ·")}{a.tools}{t("個の道具")}</span><Link className={styles.tryAgent} href={noahReadyDetailHref(a.id)}>{t("使う ↗")}</Link></footer>
            </article>;
          }
          if (item.kind === 'card') {
            const card = item.card;
            return (
              <article
                key={item.key}
                className={styles.agentPost}
                data-feed-kind="card"
              >
                <div className={styles.agentLabel}>
                  <Bot size={14} />
                  <span>{t("仕事のカード")}</span>
                  <span>{t("Noah の棚")}</span>
                </div>
                <Link href={card.target} className={styles.agentPreview}>
                  <NoahAgentVisual name={card.title} summary={card.promise}/>
                  <div>
                    <span className={styles.publisher}>
                      {card.topicLabel} {t("· Noah の説明")}</span>
                    <h3>{card.title}</h3>
                    <p>{card.promise}</p>
                  </div>
                  <ArrowUpRight size={20} />
                </Link>
                <footer className={styles.agentFooter}>
                  <span>{noahTimelineCardFacts(card)}</span>
                  <button
                    aria-label={t("カードを共有")}
                    onClick={() => void share(item)}
                  >
                    <Share2 size={15} />
                  </button>
                </footer>
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
                <span>{t("Agent紹介")}</span>
                <span>{t(researchKindLabels[agent.kind])}</span>
              </div>
              <Link
                href={`${base}/agents/${agent.id}`}
                className={styles.agentPreview}
              >
                <NoahAgentVisual name={agent.name} summary={agent.summary}/>
                <div>
                  <span className={styles.publisher}>
                    {agent.author || t('公開資料からの紹介')}
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
                <span>{t("紹介情報 · 利用条件は詳細で確認")}</span>
                <button
                  aria-label={t("Agentを共有")}
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
        <span>{t("閲覧・検索は登録なしで。")}</span>
        <Link href={`${base}/registration`}>
          {t("外部Agentの登録を依頼")}<ArrowUpRight size={14} />
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
            {feed.moreLoading ? <NoahLoading compact label={t("読み込み中…")} /> : t("続きを読み込む")}
          </button>
        </div>
      )}
    </main>
  );
}

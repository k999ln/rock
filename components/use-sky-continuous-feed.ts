'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { EveNewsLink } from '@/lib/eve-news-feed';
import type { SkySocialPost } from '@/lib/sky-social';
import {
  appendFeed,
  feedPollDelay,
  feedTerms,
  FEED_WINDOW,
  rankFeed,
  type FeedCandidate,
} from '@/lib/sky-continuous-ranking';

export type ContinuousItem = FeedCandidate &
  (
    | { kind: 'post'; post: SkySocialPost }
    | { kind: 'news'; article: EveNewsLink; stale: boolean }
  );
type NewsFeed = { articles: EveNewsLink[]; fetchedAt: string; stale: boolean };
export function useSkyContinuousFeed(
  posts: SkySocialPost[],
  scope: string,
  enabled: boolean,
  live: boolean,
) {
  const [topic, setTopic] = useState('all');
  const [news, setNews] = useState<NewsFeed | null>(null);
  const [newsError, setNewsError] = useState('');
  const [newsLoading, setNewsLoading] = useState(false);
  const [retry, setRetry] = useState(0);
  const hasNews = useRef(false);
  const [picked, setPicked] = useState<{ scope: string; terms: string[] }>({
    scope: '',
    terms: [],
  });
  const [windowState, setWindowState] = useState<{
    scope: string;
    keys: string[];
    startedAt: number;
  }>({ scope: '', keys: [], startedAt: 0 });
  const currentScope = `${scope}:${topic}`;
  const active = windowState.scope === currentScope;
  const keys = useMemo(
    () => (active ? windowState.keys : []),
    [active, windowState.keys],
  );
  const startedAt = windowState.startedAt;
  const interests = useMemo(
    () =>
      [
        ...new Set([
          ...(picked.scope === scope ? picked.terms : []),
          ...posts
            .filter((p) => p.liked || p.bookmarked)
            .flatMap((p) =>
              feedTerms(p.content + ' ' + (p.attachment?.resource ?? '')),
            ),
        ]),
      ].slice(0, 48),
    [picked, scope, posts],
  );
  const candidates = useMemo<ContinuousItem[]>(
    () => [
      ...posts.slice(0, FEED_WINDOW).map(
        (post): ContinuousItem => ({
          key: `post:${post.id}`,
          source: `author:${post.author.id}`,
          text: `${post.content} ${post.attachment?.resource ?? ''}`,
          createdAt: post.createdAt,
          following: post.following,
          community: Boolean(post.community),
          kind: 'post',
          post,
        }),
      ),
      ...(enabled ? (news?.articles ?? []) : []).map(
        (article): ContinuousItem => ({
          key: `news:${article.id}`,
          source: article.publisher,
          text: article.title,
          createdAt: Date.parse(article.seenAt),
          kind: 'news',
          article,
          stale: news!.stale,
        }),
      ),
    ],
    [posts, news, enabled],
  );
  const lookup = useMemo(
    () => new Map(candidates.map((item) => [item.key, item])),
    [candidates],
  );
  const head = useMemo(
    () =>
      candidates.filter(
        (item) =>
          active && item.createdAt > startedAt && !keys.includes(item.key),
      ),
    [active, candidates, startedAt, keys],
  );
  const available = useMemo(
    () => candidates.filter((item) => !head.some((h) => h.key === item.key)),
    [candidates, head],
  );
  const latest = useRef({
    keys,
    available,
    interests,
    scope: currentScope,
    startedAt,
  });
  useEffect(() => {
    latest.current = {
      keys,
      available,
      interests,
      scope: currentScope,
      startedAt,
    };
  }, [keys, available, interests, currentScope, startedAt]);
  const append = useCallback(() => {
    const v = latest.current;
    const next = appendFeed(v.keys, v.available, v.interests, Date.now());
    if (next.keys.join('|') === v.keys.join('|')) return false;
    setWindowState({
      scope: v.scope,
      keys: next.keys,
      startedAt: v.keys.length ? v.startedAt : Date.now(),
    });
    return true;
  }, []);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (
        enabled &&
        !latest.current.keys.length &&
        latest.current.available.length
      )
        append();
    });
    return () => cancelAnimationFrame(frame);
  }, [enabled, candidates, currentScope, keys.length, append]);
  useEffect(() => {
    if (!enabled) return;
    if (!live && hasNews.current) {
      const frame = requestAnimationFrame(() => setNewsLoading(false));
      return () => cancelAnimationFrame(frame);
    }
    let stopped = false,
      timer: ReturnType<typeof setTimeout>,
      failures = 0,
      inFlight = false;
    let controller: AbortController | undefined;
    async function refresh() {
      if (stopped || inFlight) return;
      if (document.visibilityState !== 'visible' || !navigator.onLine) {
        timer = setTimeout(() => void refresh(), 25_000);
        return;
      }
      inFlight = true;
      controller = new AbortController();
      const timeout = setTimeout(() => controller?.abort(), 22_000);
      setNewsLoading(true);
      try {
        const response = await fetch(
          `/api/news/feed?topic=${encodeURIComponent(topic)}`,
          { cache: 'no-cache', signal: controller.signal },
        );
        const value = (await response.json()) as NewsFeed & { error?: string };
        if (!response.ok || !Array.isArray(value.articles))
          throw Error(value.error || 'ニュースを取得できませんでした。');
        if (!stopped) {
          hasNews.current = true;
          setNews((old) => ({
            ...value,
            articles: [
              ...new Map(
                [...(old?.articles ?? []), ...value.articles].map((a) => [
                  a.id,
                  a,
                ]),
              ).values(),
            ].slice(0, 200),
          }));
          setNewsError('');
        }
        failures = 0;
      } catch (error) {
        if (!stopped)
          setNewsError(
            controller?.signal.aborted
              ? 'ニュースの受信に時間がかかっています。自動更新で再試行します。'
              : error instanceof Error
                ? error.message
                : '配信元への接続を確認してください。',
          );
        failures++;
      } finally {
        clearTimeout(timeout);
        inFlight = false;
        if (!stopped) {
          setNewsLoading(false);
          if (live)
            timer = setTimeout(
              () => void refresh(),
              Math.max(60_000, feedPollDelay(failures)),
            );
        }
      }
    }
    const wake = () => {
      if (live && !stopped && document.visibilityState === 'visible') {
        if (!inFlight) {
          clearTimeout(timer);
          void refresh();
        }
      }
    };
    const frame = requestAnimationFrame(() => void refresh());
    window.addEventListener('online', wake);
    document.addEventListener('visibilitychange', wake);
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      clearTimeout(timer);
      controller?.abort();
      window.removeEventListener('online', wake);
      document.removeEventListener('visibilitychange', wake);
    };
  }, [enabled, live, topic, retry]);
  return {
    enabled,
    items: keys.flatMap((key) => (lookup.has(key) ? [lookup.get(key)!] : [])),
    append,
    hasMore:
      keys.length < FEED_WINDOW &&
      available.some((item) => !keys.includes(item.key)),
    atLimit: keys.length >= FEED_WINDOW,
    pending: head.length,
    acceptUpdates: () => {
      const incoming = rankFeed(head, { now: Date.now(), interests }, 24).map(
        ({ item }) => item.key,
      );
      setWindowState({
        scope: currentScope,
        keys: [...incoming, ...keys].slice(0, FEED_WINDOW),
        startedAt: Date.now(),
      });
    },
    restart: () => {
      setWindowState({ scope: currentScope, keys: [], startedAt: Date.now() });
      setRetry((v) => v + 1);
    },
    topic,
    chooseTopic: (value: string) => {
      setTopic(value);
      hasNews.current = false;
      setNews(null);
      setPicked({ scope, terms: [] });
    },
    remember: (text: string) =>
      setPicked((old) => ({
        scope,
        terms: [
          ...new Set([
            ...feedTerms(text),
            ...(old.scope === scope ? old.terms : []),
          ]),
        ].slice(0, 24),
      })),
    newsLoading,
    newsError,
    fetchedAt: news?.fetchedAt,
    stale: news?.stale,
    retry: () => setRetry((v) => v + 1),
  };
}

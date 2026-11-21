'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { FeedbackFeedPage } from '@/lib/noah-feedback';
import type { ResearchPage } from '@/lib/noah-research-types';
import type { SkySocialState } from '@/lib/sky-social';
import {
  communityFetch,
  setCommunityKeyProfile,
} from '@/lib/community-key-client';
import {
  appendNoahTimeline,
  mixNoahTimeline,
  noahShelfTimelineCards,
  type NoahTimelineItem,
  type NoahTimelineFilter,
} from '@/lib/noah-timeline-feed';
import type { NoahShelfCard } from '@/lib/noah-shelf-view';
import type { NoahSurfaceMode } from '@/lib/noah-surface';

type Snapshot = {
  key: string;
  items: NoahTimelineItem[];
  agents?: ResearchPage;
  social?: SkySocialState;
  opinions?: FeedbackFeedPage;
  errors: string[];
};
const failure = (error: unknown) =>
  error instanceof Error ? error.message : '取得できませんでした。';
async function json<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal, cache: 'no-store' });
  if (!response.headers.get('content-type')?.includes('application/json'))
    throw new Error('配信元へ接続できませんでした。再試行してください。');
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(data.error || '取得できませんでした。');
  return data;
}
async function socialPage(
  cursor = '',
  following = false,
  signal?: AbortSignal,
) {
  const path = `/api/sky/social?${new URLSearchParams({ mode: following ? 'following' : 'recommended', cursor })}`;
  let result = await communityFetch<SkySocialState>(path, undefined, signal);
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  if (result.profile && setCommunityKeyProfile(result.profile.id))
    result = await communityFetch<SkySocialState>(path, undefined, signal);
  return result;
}

/** 棚のカード（最初の頁だけ）。閉じている（404）・読めない時は、何も足さない（タイムラインの誤りにしない）。 */
async function shelfCards(signal: AbortSignal): Promise<NoahShelfCard[]> {
  try {
    const response = await fetch('/api/noah/shelf', { signal, cache: 'no-store' });
    if (response.status !== 200 || !response.headers.get('content-type')?.includes('application/json')) return [];
    const body = (await response.json()) as { shelves?: { cards?: NoahShelfCard[] }[] };
    return Array.isArray(body.shelves) ? noahShelfTimelineCards(body.shelves) : [];
  } catch {
    return [];
  }
}

export function useNoahTimeline(
  mode: NoahSurfaceMode,
  query: string,
  kind: string,
  filter: NoahTimelineFilter,
) {
  const includeSocial = filter === 'all';
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null),
    [attempt, setAttempt] = useState(0),
    [moreKey, setMoreKey] = useState('');
  const generation = useRef(0),
    paging = useRef(false),
    pending = useRef<AbortController | null>(null);
  const params = new URLSearchParams({
    q: query.trim().slice(0, 200),
    kind,
    limit: '20',
  }).toString();
  const endpoint =
    mode === 'public' ? '/api/noah/public-catalog' : '/api/noah/catalog';
  const key = `${mode}:${params}:${filter}:${attempt}`,
    data = snapshot?.key === key ? snapshot : null;
  useEffect(() => {
    const invalidate = () => {
      generation.current++;
      pending.current?.abort();
      setSnapshot(null);
      setAttempt((n) => n + 1);
    };
    const storage = (event: StorageEvent) => {
      if (!event.key || event.key.startsWith('rockstar.community.'))
        invalidate();
    };
    window.addEventListener('rockstar-community-changed', invalidate);
    window.addEventListener('storage', storage);
    return () => {
      window.removeEventListener('rockstar-community-changed', invalidate);
      window.removeEventListener('storage', storage);
    };
  }, []);
  useEffect(() => {
    const version = ++generation.current,
      controller = new AbortController();
    pending.current?.abort();
    paging.current = false;
    const timer = setTimeout(() => {
      void Promise.allSettled([
        json<ResearchPage>(`${endpoint}?${params}`, controller.signal),
        includeSocial
          ? socialPage('', false, controller.signal)
          : Promise.resolve(undefined),
        includeSocial
          ? json<FeedbackFeedPage>(
              '/api/noah/feedback?feed=1',
              controller.signal,
            )
          : Promise.resolve(undefined),
        includeSocial ? shelfCards(controller.signal) : Promise.resolve([]),
      ]).then(([agents, social, opinions, shelf]) => {
        if (controller.signal.aborted || version !== generation.current) return;
        const errors: string[] = [];
        if (agents.status === 'rejected')
          errors.push(`Agent：${failure(agents.reason)}`);
        if (social.status === 'rejected')
          errors.push(`投稿：${failure(social.reason)}`);
        if (opinions.status === 'rejected')
          errors.push(`コメント：${failure(opinions.reason)}`);
        const a = agents.status === 'fulfilled' ? agents.value : undefined,
          s = social.status === 'fulfilled' ? social.value : undefined;
        const o = opinions.status === 'fulfilled' ? opinions.value : undefined;
        setSnapshot({
          key,
          agents: a,
          social: s,
          opinions: o,
          errors,
          items: mixNoahTimeline(
            a?.entries ?? [],
            s?.posts ?? [],
            o?.entries ?? [],
            shelf.status === 'fulfilled' ? shelf.value : [],
          ),
        });
      });
    }, 180);
    return () => {
      clearTimeout(timer);
      controller.abort();
      pending.current?.abort();
    };
  }, [key, endpoint, params, includeSocial]);

  const loadMore = useCallback(async () => {
    if (
      !data ||
      paging.current ||
      (!data.agents?.nextCursor &&
        !(includeSocial && data.social?.cursor) &&
        !(includeSocial && data.opinions?.cursor))
    )
      return;
    paging.current = true;
    setMoreKey(key);
    const version = generation.current,
      controller = new AbortController();
    pending.current = controller;
    const results = await Promise.allSettled([
      data.agents?.nextCursor
        ? json<ResearchPage>(
            `${endpoint}?${params}&cursor=${encodeURIComponent(data.agents.nextCursor)}`,
            controller.signal,
          )
        : Promise.resolve(undefined),
      includeSocial && data.social?.cursor
        ? socialPage(data.social.cursor, false, controller.signal)
        : Promise.resolve(undefined),
      includeSocial && data.opinions?.cursor
        ? json<FeedbackFeedPage>(
            `/api/noah/feedback?feed=1&cursor=${encodeURIComponent(data.opinions.cursor)}`,
            controller.signal,
          )
        : Promise.resolve(undefined),
    ]);
    if (version !== generation.current || controller.signal.aborted) return;
    const [a, s, o] = results,
      opinions = o.status === 'fulfilled' ? o.value : undefined,
      agents = a.status === 'fulfilled' ? a.value : undefined,
      social = s.status === 'fulfilled' ? s.value : undefined;
    // Never append a different account's page to the visible previous account.
    if (
      (agents && agents.ownerScope !== data.agents?.ownerScope) ||
      (social && social.profile?.id !== data.social?.profile?.id)
    ) {
      setSnapshot(null);
      setAttempt((n) => n + 1);
    } else {
      const errors = data.errors.filter(
        (error) => !error.startsWith('追加読込：'),
      );
      if (a.status === 'rejected')
        errors.push(`追加読込：Agent — ${failure(a.reason)}`);
      if (s.status === 'rejected')
        errors.push(`追加読込：投稿 — ${failure(s.reason)}`);
      if (o.status === 'rejected')
        errors.push(`追加読込：コメント — ${failure(o.reason)}`);
      setSnapshot((current) =>
        current?.key === key
          ? {
              ...current,
              agents: agents ?? current.agents,
              social: social ?? current.social,
              opinions: opinions ?? current.opinions,
              errors,
              items: appendNoahTimeline(
                current.items,
                mixNoahTimeline(
                  agents?.entries ?? [],
                  social?.posts ?? [],
                  opinions?.entries ?? [],
                ),
              ),
            }
          : current,
      );
    }
    paging.current = false;
    setMoreKey('');
  }, [data, endpoint, params, key, includeSocial]);
  return {
    data,
    loading: !data,
    moreLoading: moreKey === key,
    hasMore: Boolean(
      data?.agents?.nextCursor ||
      (includeSocial && data?.social?.cursor) ||
      (includeSocial && data?.opinions?.cursor),
    ),
    loadMore,
    refresh: () => setAttempt((n) => n + 1),
  };
}

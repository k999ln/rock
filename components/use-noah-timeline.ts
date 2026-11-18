'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { EveNewsLink } from '@/lib/eve-news-feed';
import type { ResearchPage } from '@/lib/noah-research-types';
import type { SkySocialState } from '@/lib/sky-social';
import { communityFetch, setCommunityKeyProfile } from '@/lib/community-key-client';
import { appendNoahTimeline, mixNoahTimeline, type NoahTimelineItem, type NoahTimelineFilter } from '@/lib/noah-timeline-feed';
import type { NoahSurfaceMode } from '@/lib/noah-surface';

type News = { articles: EveNewsLink[]; stale: boolean };
type Snapshot = { key: string; items: NoahTimelineItem[]; agents?: ResearchPage; social?: SkySocialState; errors: string[] };
const failure = (error: unknown) => error instanceof Error ? error.message : '取得できませんでした。';
async function json<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal, cache: 'no-store' });
  if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('配信元へ接続できませんでした。再試行してください。');
  const data = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(data.error || '取得できませんでした。');
  return data;
}
async function socialPage(cursor = '', following = false, signal?: AbortSignal) {
  const path = `/api/sky/social?${new URLSearchParams({ mode: following ? 'following' : 'recommended', cursor })}`;
  let result = await communityFetch<SkySocialState>(path, undefined, signal);
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  if (result.profile && setCommunityKeyProfile(result.profile.id)) result = await communityFetch<SkySocialState>(path, undefined, signal);
  return result;
}

export function useNoahTimeline(mode: NoahSurfaceMode, query: string, kind: string, filter: NoahTimelineFilter) {
  const following = filter === 'following', includeAgents = filter === 'all' || filter === 'agent', includeSocial = filter !== 'agent' && filter !== 'news';
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null), [attempt, setAttempt] = useState(0), [moreKey, setMoreKey] = useState('');
  const generation = useRef(0), paging = useRef(false), pending = useRef<AbortController | null>(null);
  const params = new URLSearchParams({ q: query.trim().slice(0, 200), kind, limit: '20' }).toString();
  const endpoint = mode === 'public' ? '/api/noah/public-catalog' : '/api/noah/catalog';
  const key = `${mode}:${params}:${following}:${attempt}`, data = snapshot?.key === key ? snapshot : null;
  useEffect(() => {
    const invalidate = () => { generation.current++; pending.current?.abort(); setSnapshot(null); setAttempt(n => n + 1); };
    const storage = (event: StorageEvent) => { if (!event.key || event.key.startsWith('rockstar.community.')) invalidate(); };
    window.addEventListener('rockstar-community-changed', invalidate);
    window.addEventListener('storage', storage);
    return () => { window.removeEventListener('rockstar-community-changed', invalidate); window.removeEventListener('storage', storage); };
  }, []);
  useEffect(() => {
    const version = ++generation.current, controller = new AbortController();
    pending.current?.abort(); paging.current = false;
    const timer = setTimeout(() => {
      void Promise.allSettled([
        json<News>('/api/news/feed?topic=all', controller.signal),
        json<ResearchPage>(`${endpoint}?${params}`, controller.signal),
        socialPage('', following, controller.signal),
      ]).then(([news, agents, social]) => {
        if (controller.signal.aborted || version !== generation.current) return;
        const errors: string[] = [];
        if (news.status === 'rejected') errors.push(`ニュース：${failure(news.reason)}`);
        if (agents.status === 'rejected') errors.push(`Agent：${failure(agents.reason)}`);
        if (social.status === 'rejected') errors.push(`投稿・コミュニティー：${failure(social.reason)}`);
        const n = news.status === 'fulfilled' ? news.value : undefined, a = agents.status === 'fulfilled' ? agents.value : undefined, s = social.status === 'fulfilled' ? social.value : undefined;
        setSnapshot({ key, agents: a, social: s, errors, items: mixNoahTimeline(n?.articles ?? [], a?.entries ?? [], s?.posts ?? [], n?.stale) });
      });
    }, 180);
    return () => { clearTimeout(timer); controller.abort(); pending.current?.abort(); };
  }, [key, endpoint, params, following]);

  const loadMore = useCallback(async () => {
    if (!data || paging.current || (!(includeAgents && data.agents?.nextCursor) && !(includeSocial && data.social?.cursor))) return;
    paging.current = true; setMoreKey(key);
    const version = generation.current, controller = new AbortController(); pending.current = controller;
    const results = await Promise.allSettled([
      includeAgents && data.agents?.nextCursor ? json<ResearchPage>(`${endpoint}?${params}&cursor=${encodeURIComponent(data.agents.nextCursor)}`, controller.signal) : Promise.resolve(undefined),
      includeSocial && data.social?.cursor ? socialPage(data.social.cursor, following, controller.signal) : Promise.resolve(undefined),
    ]);
    if (version !== generation.current || controller.signal.aborted) return;
    const [a, s] = results, agents = a.status === 'fulfilled' ? a.value : undefined, social = s.status === 'fulfilled' ? s.value : undefined;
    // Never append a different account's page to the visible previous account.
    if ((agents && agents.ownerScope !== data.agents?.ownerScope) || (social && social.profile?.id !== data.social?.profile?.id)) {
      setSnapshot(null); setAttempt(n => n + 1);
    } else {
      const errors = data.errors.filter(error => !error.startsWith('追加読込：'));
      if (a.status === 'rejected') errors.push(`追加読込：Agent — ${failure(a.reason)}`);
      if (s.status === 'rejected') errors.push(`追加読込：投稿 — ${failure(s.reason)}`);
      setSnapshot(current => current?.key === key ? { ...current, agents: agents ?? current.agents, social: social ?? current.social, errors,
        items: appendNoahTimeline(current.items, mixNoahTimeline([], agents?.entries ?? [], social?.posts ?? [])) } : current);
    }
    paging.current = false; setMoreKey('');
  }, [data, endpoint, params, following, key, includeAgents, includeSocial]);
  return { data, loading: !data, moreLoading: moreKey === key, hasMore: Boolean((includeAgents && data?.agents?.nextCursor) || (includeSocial && data?.social?.cursor)), loadMore, refresh: () => setAttempt(n => n + 1) };
}

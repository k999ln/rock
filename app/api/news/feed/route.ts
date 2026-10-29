import { NextResponse } from 'next/server';
import {
  EVE_NEWS_QUERY,
  EVE_NEWS_TOPICS,
  cachedNewsForTopic,
  type EveNewsLink,
} from '@/lib/eve-news-feed';
import { fetchPublicNews } from '@/lib/public-news-provider';
import seed from '@/data/eve-news-seed-20261021.json';
import liveSeed from '@/data/sky-live-news-seed.json';

export const dynamic = 'force-dynamic';

type CachedFeed = {
  source: string;
  selection?: string;
  fetchedAt: string;
  articles: EveNewsLink[];
  expiresAt: number;
};
const cache = new Map<string, CachedFeed>();
const pending = new Map<string, Promise<CachedFeed>>();

export async function GET(request?: Request) {
  const topic = request
    ? (new URL(request.url).searchParams.get('topic') ?? '')
    : '';
  if (topic && !Object.hasOwn(EVE_NEWS_TOPICS, topic))
    return NextResponse.json(
      { error: '話題を確認してください。' },
      { status: 400 },
    );
  const query = EVE_NEWS_TOPICS[topic] ?? EVE_NEWS_QUERY;
  const now = Date.now();
  const lastGood = cache.get(topic);
  if (lastGood && lastGood.expiresAt > now) {
    return NextResponse.json(
      {
        source: lastGood.source,
        selection: lastGood.selection,
        query,
        fetchedAt: lastGood.fetchedAt,
        articles: lastGood.articles,
        stale: false,
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=3600',
        },
      },
    );
  }
  try {
    let task = pending.get(topic);
    if (!task) {
      task = (async () => {
        const { source, articles, selection } = await fetchPublicNews(topic);
        const value = {
          source,
          selection,
          fetchedAt: new Date().toISOString(),
          articles,
          expiresAt: Date.now() + 15 * 60_000,
        };
        cache.set(topic, value);
        return value;
      })().finally(() => pending.delete(topic));
      pending.set(topic, task);
    }
    const value = await task;
    return NextResponse.json(
      {
        source: value.source,
        selection: value.selection,
        query,
        fetchedAt: value.fetchedAt,
        articles: value.articles,
        stale: false,
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=3600',
        },
      },
    );
  } catch {
    if (lastGood && now - Date.parse(lastGood.fetchedAt) < 60 * 60_000) {
      return NextResponse.json(
        {
          source: lastGood.source,
          selection: lastGood.selection,
          query,
          fetchedAt: lastGood.fetchedAt,
          articles: lastGood.articles,
          stale: true,
        },
        { headers: { 'Cache-Control': 'public, s-maxage=60' } },
      );
    }
    const fallback = !topic || topic === 'world' ? seed : liveSeed;
    const articles = !topic
      ? fallback.articles
      : cachedNewsForTopic(fallback.articles, topic);
    if (
      articles.length &&
      now - Date.parse(fallback.fetchedAt) < 24 * 60 * 60_000
    ) {
      return NextResponse.json(
        {
          ...fallback,
          articles,
          stale: true,
          selection: topic && topic !== 'all' ? 'headline-keywords' : 'all',
        },
        { headers: { 'Cache-Control': 'public, s-maxage=60' } },
      );
    }
    return NextResponse.json(
      { error: 'ニュース配信元から取得できません。後で再試行してください。' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}

import { NextResponse } from 'next/server';
import {
  EVE_NEWS_PROVIDER,
  EVE_NEWS_QUERY,
  EVE_NEWS_TOPICS,
  gdeltNewsUrl,
  parseGdeltArticles,
  type EveNewsLink,
} from '@/lib/eve-news-feed';
import seed from '@/data/eve-news-seed-20261021.json';
import liveSeed from '@/data/sky-live-news-seed.json';

export const dynamic = 'force-dynamic';

type CachedFeed = {
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
        source: EVE_NEWS_PROVIDER,
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
        const response = await fetch(gdeltNewsUrl(topic), {
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(10000),
        });
        if (!response.ok) throw Error(`provider HTTP ${response.status}`);
        const articles = parseGdeltArticles(await response.json());
        if (articles.length === 0)
          throw Error('provider returned no usable articles');
        const value = {
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
        source: EVE_NEWS_PROVIDER,
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
          source: EVE_NEWS_PROVIDER,
          query,
          fetchedAt: lastGood.fetchedAt,
          articles: lastGood.articles,
          stale: true,
        },
        { headers: { 'Cache-Control': 'public, s-maxage=60' } },
      );
    }
    const fallback = topic === 'all' ? liveSeed : seed;
    if (
      (!topic || topic === 'world' || topic === 'all') &&
      now - Date.parse(fallback.fetchedAt) < 24 * 60 * 60_000
    ) {
      return NextResponse.json(
        { ...fallback, stale: true },
        { headers: { 'Cache-Control': 'public, s-maxage=60' } },
      );
    }
    return NextResponse.json(
      { error: 'ニュース配信元から取得できません。後で再試行してください。' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}

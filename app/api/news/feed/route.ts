import { NextResponse } from 'next/server';
import { EVE_NEWS_PROVIDER, EVE_NEWS_QUERY, gdeltNewsUrl, parseGdeltArticles, type EveNewsLink } from '@/lib/eve-news-feed';
import seed from '@/data/eve-news-seed-20261021.json';

export const dynamic = 'force-dynamic';

let lastGood: { fetchedAt: string; articles: EveNewsLink[]; expiresAt: number } | null = null;

export async function GET() {
  const now = Date.now();
  if (lastGood && lastGood.expiresAt > now) {
    return NextResponse.json({ source: EVE_NEWS_PROVIDER, query: EVE_NEWS_QUERY, fetchedAt: lastGood.fetchedAt, articles: lastGood.articles, stale: false }, { headers: { 'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=3600' } });
  }
  try {
    const response = await fetch(gdeltNewsUrl(), { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw Error(`provider HTTP ${response.status}`);
    const articles = parseGdeltArticles(await response.json());
    if (articles.length === 0) throw Error('provider returned no usable articles');
    const fetchedAt = new Date().toISOString();
    lastGood = { fetchedAt, articles, expiresAt: now + 15 * 60_000 };
    return NextResponse.json({ source: EVE_NEWS_PROVIDER, query: EVE_NEWS_QUERY, fetchedAt, articles, stale: false }, { headers: { 'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=3600' } });
  } catch {
    if (lastGood && now - Date.parse(lastGood.fetchedAt) < 60 * 60_000) {
      return NextResponse.json({ source: EVE_NEWS_PROVIDER, query: EVE_NEWS_QUERY, fetchedAt: lastGood.fetchedAt, articles: lastGood.articles, stale: true }, { headers: { 'Cache-Control': 'public, s-maxage=60' } });
    }
    if (now - Date.parse(seed.fetchedAt) < 24 * 60 * 60_000) {
      return NextResponse.json({ ...seed, stale: true }, { headers: { 'Cache-Control': 'public, s-maxage=60' } });
    }
    return NextResponse.json({ error: 'ニュース配信元から取得できません。後で再試行してください。' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}

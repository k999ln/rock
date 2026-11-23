import type { DirectoryEntry } from './noah-agent-directory.ts';

/** 同じ一覧を返す間隔。1 回の読み出しは、取り込んだ一覧の全件の読み出しと、自社レーンへの外向きの取得を伴う。 */
export const NOAH_REVENUE_CATALOG_CACHE_MS = 5 * 60_000;

/**
 * 紹介案件の照合に使う、公開カードの一覧（id・名前・説明だけ）。誰でも読める。
 * 読むたびに全件を作り直すと、外から何度も呼ぶだけで、DB の全件読みと外向きの取得を起こせる。
 * だから、作った一覧を同じ実行環境の中で 5 分だけ使い回す（失敗は使い回さない）。
 */
export function createNoahRevenueCatalog(
  directory: () => Promise<DirectoryEntry[]>,
  options: { cacheMs?: number; now?: () => number } = {},
) {
  const cacheMs = options.cacheMs ?? NOAH_REVENUE_CATALOG_CACHE_MS;
  const now = options.now ?? Date.now;
  let cached: { at: number; body: string } | null = null;
  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': `public, max-age=${Math.floor(cacheMs / 1000)}`,
    'X-Content-Type-Options': 'nosniff',
  };
  return async () => {
    const time = now();
    if (cached && time - cached.at >= 0 && time - cached.at < cacheMs)
      return new Response(cached.body, { headers });
    try {
      const entries = await directory();
      if (entries.length > 10000) throw Error('catalog_limit');
      const items = entries.map(({ card }) => ({
        id: card.feedbackId || card.id,
        name: card.name.slice(0, 200),
        summary: card.summary.slice(0, 500),
      }));
      if (new Set(items.map((x) => x.id)).size !== items.length)
        throw Error('catalog_duplicate');
      const body = JSON.stringify({
        schema: 'noah-revenue-catalog/1',
        checkedAt: new Date(time).toISOString(),
        total: items.length,
        items,
      });
      cached = { at: time, body };
      return new Response(body, { headers });
    } catch {
      return Response.json(
        { error: 'catalog_unavailable' },
        { status: 503, headers: { 'Cache-Control': 'no-store' } },
      );
    }
  };
}

import type { DirectoryEntry } from './noah-agent-directory.ts';
export function createNoahRevenueCatalog(
  directory: () => Promise<DirectoryEntry[]>,
) {
  return async () => {
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
      return Response.json(
        {
          schema: 'noah-revenue-catalog/1',
          checkedAt: new Date().toISOString(),
          total: items.length,
          items,
        },
        {
          headers: {
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff',
          },
        },
      );
    } catch {
      return Response.json({ error: 'catalog_unavailable' }, { status: 503 });
    }
  };
}

import { ResearchQueryError, type createResearchCatalog } from './noah-research-query.ts';

// Public, read-only metadata only. Never consult an owner, private uploads, D1,
// Work records or the Mac runtime while serving this catalog.
export function createNoahPublicCatalogApi(catalog: ReturnType<typeof createResearchCatalog>) {
  const json = (value: unknown, status = 200) => Response.json(value, {
    status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });
  return (request: Request, id?: string) => {
    if (request.method !== 'GET') return json({ error: '閲覧専用のAPIです。' }, 405);
    try {
      if (id !== undefined) {
        const result = catalog.get(id);
        return result ? json(result) : json({ error: 'カタログに見つかりません。' }, 404);
      }
      return json({ ...catalog.list(new URL(request.url).searchParams), ownerScope: null });
    } catch (e) {
      if (e instanceof ResearchQueryError) return json({ error: e.message }, e.status);
      throw e;
    }
  };
}

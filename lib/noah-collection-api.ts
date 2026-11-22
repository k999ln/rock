import { boundedNoahBody } from './noah-agent-api.ts';
import { NOAH_COLLECTION_LIMITS, NOAH_COLLECTION_PATH, NOAH_COLLECTION_SOURCES, noahCollectionBlocked, noahCollectionCards, parseCollectionSnapshot, verifyCollectionSignature, type NoahCollectionSnapshot } from './noah-collection.ts';

type Bucket = Pick<R2Bucket, 'get' | 'put'>;
const keyFor = (source: string) => `noah/collection/v1/${source}.json`;
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
export function createCollectionApi({ bucket, key, now = Date.now }: { bucket?: Bucket; key?: string; now?: () => number }) {
  return async (request: Request) => {
    try {
      const url = new URL(request.url);
      if (url.pathname !== NOAH_COLLECTION_PATH) return json({ error: 'not_found' }, 404);
      if (request.method === 'GET') {
        const selected = url.searchParams.get('source') ?? '', q = (url.searchParams.get('q') ?? '').trim().toLowerCase();
        const cursor = url.searchParams.get('cursor') ?? '0', order = url.searchParams.get('order') ?? 'hot';
        if (selected && !NOAH_COLLECTION_SOURCES.includes(selected as never) || q.length > 200 || !/^(0|[1-9]\d{0,4})$/.test(cursor) || !['hot', 'new'].includes(order)) return json({ error: 'collection_invalid' }, 400);
        if (!bucket) return json({ items: [], total: 0, nextCursor: null, configured: false });
        const sources = selected ? [selected] : NOAH_COLLECTION_SOURCES;
        const snapshots = await Promise.all(sources.map(async source => {
          const value = await bucket.get(keyFor(source));
          if (!value) return null;
          // A malformed or older-schema snapshot of one source must not hide the others.
          try { return parseCollectionSnapshot(await value.json(), now()); } catch { return null; }
        }));
        // 公開する側でも、成人向けの語に当たる紹介は出さない（古い収集機の掲載や、Codex の受け取りの漏れに備える）。
        const records = snapshots.flatMap(snapshot => snapshot?.items ?? []).filter(item => item.expiresAt > now() && !noahCollectionBlocked(item) && (!q || `${item.name} ${item.summary} ${item.author}`.toLowerCase().includes(q)));
        // Several sources may point at the same project; show one card with all its provenance. New and easy first (lib/noah-collection.ts).
        let all = noahCollectionCards(records, order as 'hot' | 'new').map(card => ({ ...card, status: 'discovered' }));
        if (url.searchParams.get('view') === 'home' && !selected) {
          // The home preview includes each available source instead of being filled by a registry sweep.
          // Each round takes one card per source; the source whose best card ranks higher goes first.
          const queues = NOAH_COLLECTION_SOURCES.map(source => all.filter(item => item.source === source)).filter(queue => queue.length).sort((a, b) => (order === 'new' ? b[0].createdAt - a[0].createdAt : b[0].hot - a[0].hot));
          const balanced: typeof all = [];
          for (let index = 0; balanced.length < all.length; index++) for (const queue of queues) if (queue[index]) balanced.push(queue[index]);
          all = balanced;
        }
        const offset = Number(cursor), items = all.slice(offset, offset + 20);
        return json({ items, total: all.length, nextCursor: offset + 20 < all.length ? String(offset + 20) : null, configured: true });
      }
      if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
      if (request.headers.has('origin')) return json({ error: 'collector_only' }, 403);
      if (!key || key.length < 32 || !bucket) return json({ error: 'collection_not_configured' }, 503);
      if (!request.headers.get('content-type')?.startsWith('application/json')) return json({ error: 'json_required' }, 415);
      const body = new TextDecoder('utf-8', { fatal: true }).decode(await boundedNoahBody(request, NOAH_COLLECTION_LIMITS.bytes));
      if (!await verifyCollectionSignature(key, request.headers.get('x-noah-collector-time'), request.headers.get('x-noah-collector-signature'), body, now())) return json({ error: 'unauthorized' }, 401);
      const snapshot = parseCollectionSnapshot(JSON.parse(body), now());
      const path = keyFor(snapshot.source), old = await bucket.get(path);
      if (old) {
        const previous = await old.json<NoahCollectionSnapshot>();
        if (previous.collectedAt > snapshot.collectedAt) return json({ error: 'collection_stale' }, 409);
        if (previous.collectedAt === snapshot.collectedAt) return json({ unchanged: true });
      }
      const saved = await bucket.put(path, JSON.stringify(snapshot), { onlyIf: old ? { etagMatches: old.etag } : { etagDoesNotMatch: '*' }, httpMetadata: { contentType: 'application/json' } });
      if (!saved) return json({ error: 'collection_conflict' }, 409);
      return json({ source: snapshot.source, published: snapshot.items.length, collectedAt: snapshot.collectedAt });
    } catch (error) {
      const invalid = error instanceof SyntaxError || error instanceof Error && /collection_invalid|MCP|URL|上限|大き/.test(error.message);
      return json({ error: invalid ? 'collection_invalid' : 'collection_unavailable' }, invalid ? 400 : 503);
    }
  };
}

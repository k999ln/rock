import { boundedNoahBody } from './noah-agent-api.ts';
import { verifyCollectionSignature } from './noah-collection.ts';

export const NOAH_CHECKPOINT_PATH = '/api/noah/collection/checkpoint';
export const NOAH_CHECKPOINT_BYTES = 16 * 1024 * 1024;
const objectKey = 'noah/collector/v1/checkpoint.json';
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
type Bucket = Pick<R2Bucket, 'get' | 'put'>;
export function createCollectorCheckpointApi({ bucket, key, now = Date.now }: { bucket?: Bucket; key?: string; now?: () => number }) {
  return async (request: Request) => {
    try {
      if (new URL(request.url).pathname !== NOAH_CHECKPOINT_PATH) return json({ error: 'not_found' }, 404);
      if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
      if (request.headers.has('origin')) return json({ error: 'collector_only' }, 403);
      if (!key || key.length < 32 || !bucket) return json({ error: 'checkpoint_not_configured' }, 503);
      if (!request.headers.get('content-type')?.startsWith('application/json')) return json({ error: 'json_required' }, 415);
      if (Number(request.headers.get('content-length')) > NOAH_CHECKPOINT_BYTES) return json({ error: 'checkpoint_too_large' }, 413);
      const body = new TextDecoder('utf-8', { fatal: true }).decode(await boundedNoahBody(request, NOAH_CHECKPOINT_BYTES));
      if (!await verifyCollectionSignature(key, request.headers.get('x-noah-collector-time'), request.headers.get('x-noah-collector-signature'), body, now(), NOAH_CHECKPOINT_PATH)) return json({ error: 'unauthorized' }, 401);
      const input = JSON.parse(body);
      if (!input || !['read', 'write'].includes(input.action)) return json({ error: 'checkpoint_invalid' }, 400);
      const old = await bucket.get(objectKey);
      if (input.action === 'read') return old ? json({ etag: old.etag, checkpoint: await old.json() }) : json({ error: 'checkpoint_missing' }, 404);
      const value = input.checkpoint;
      if (!value || value.schema !== 'noah-collector-checkpoint/1' || !Number.isSafeInteger(value.updatedAt) || value.updatedAt < 1 || value.updatedAt > now() + 120_000 ||
          typeof value.runId !== 'string' || !/^(bootstrap|[0-9]{1,25})$/.test(value.runId) || typeof value.sqliteGzip !== 'string' ||
          !/^H4sI[A-Za-z0-9+/]*={0,2}$/.test(value.sqliteGzip) || value.sqliteGzip.length % 4 !== 0 ||
          !(input.etag === null || typeof input.etag === 'string' && /^[A-Za-z0-9-]{1,80}$/.test(input.etag))) return json({ error: 'checkpoint_invalid' }, 400);
      if ((old?.etag ?? null) !== input.etag) return json({ error: 'checkpoint_conflict' }, 409);
      if (old && (await old.json<{ updatedAt: number }>()).updatedAt >= value.updatedAt) return json({ error: 'checkpoint_stale' }, 409);
      // Persist only the declared fields; callers cannot choose another R2 path.
      const checkpoint = { schema: value.schema, updatedAt: value.updatedAt, runId: value.runId, sqliteGzip: value.sqliteGzip };
      const saved = await bucket.put(objectKey, JSON.stringify(checkpoint), { onlyIf: old ? { etagMatches: old.etag } : { etagDoesNotMatch: '*' }, httpMetadata: { contentType: 'application/json' } });
      return saved ? json({ etag: saved.etag, updatedAt: value.updatedAt }) : json({ error: 'checkpoint_conflict' }, 409);
    } catch (error) {
      if (error && typeof error === 'object' && 'status' in error && error.status === 413) return json({ error: 'checkpoint_too_large' }, 413);
      return json({ error: error instanceof SyntaxError ? 'checkpoint_invalid' : 'checkpoint_unavailable' }, error instanceof SyntaxError ? 400 : 503);
    }
  };
}

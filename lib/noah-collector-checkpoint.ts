import { boundedNoahBody } from './noah-agent-api.ts';
import { verifyCollectionSignature } from './noah-collection.ts';

export const NOAH_CHECKPOINT_PATH = '/api/noah/collection/checkpoint';
export const NOAH_CHECKPOINT_BYTES = 16 * 1024 * 1024;
export const NOAH_CHECKPOINT_CHUNK_CHARS = 3 * 1024 * 1024;
const chunkPrefix = 'noah/collector/v2/chunks/';
export async function checkpointChunkHash(data: string) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data))), byte => byte.toString(16).padStart(2, '0')).join('');
}
const objectKey = 'noah/collector/v1/checkpoint.json';
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
type Bucket = Pick<R2Bucket, 'get' | 'head' | 'put'> & Partial<Pick<R2Bucket, 'list' | 'delete'>>;

async function pruneCheckpointChunks(bucket: Bucket, active: Set<string>, etag: string, cutoff: number) {
  if (!bucket.list || !bucket.delete) return;
  const page = await bucket.list({ prefix: chunkPrefix, limit: 1000 });
  const expired = page.objects.filter(part => part.uploaded.getTime() < cutoff && !active.has(part.key.slice(chunkPrefix.length))).map(part => part.key);
  if (expired.length && (await bucket.head(objectKey))?.etag === etag) await bucket.delete(expired);
}

export function createCollectorCheckpointApi({ bucket, key, now = Date.now, waitUntil }: {
  bucket?: Bucket; key?: string; now?: () => number; waitUntil?: (work: Promise<void>) => void;
}) {
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
      if (!input || !['read', 'write', 'read_chunk', 'write_chunk'].includes(input.action)) return json({ error: 'checkpoint_invalid' }, 400);
      if (input.action === 'read_chunk' || input.action === 'write_chunk') {
        if (typeof input.hash !== 'string' || !/^[a-f0-9]{64}$/.test(input.hash)) return json({ error: 'checkpoint_invalid' }, 400);
        const path = chunkPrefix + input.hash;
        if (input.action === 'read_chunk') {
          const part = await bucket.get(path);
          return part ? json(await part.json()) : json({ error: 'checkpoint_chunk_missing' }, 404);
        }
        const data = input.data;
        if (typeof data !== 'string' || !data.length || data.length > NOAH_CHECKPOINT_CHUNK_CHARS || data.length % 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data) || await checkpointChunkHash(data) !== input.hash) return json({ error: 'checkpoint_invalid' }, 400);
        // Content-addressed immutable chunks let a failed upload leave the committed state untouched.
        await bucket.put(path, JSON.stringify({ data }), { onlyIf: { etagDoesNotMatch: '*' }, httpMetadata: { contentType: 'application/json' } });
        return json({ stored: true });
      }
      const old = await bucket.get(objectKey);
      if (input.action === 'read') return old ? json({ etag: old.etag, checkpoint: await old.json() }) : json({ error: 'checkpoint_missing' }, 404);
      const value = input.checkpoint;
      if (!value || !['noah-collector-checkpoint/1', 'noah-collector-checkpoint/2'].includes(value.schema) || !Number.isSafeInteger(value.updatedAt) || value.updatedAt < 1 || value.updatedAt > now() + 120_000 ||
          typeof value.runId !== 'string' || !/^(bootstrap|[0-9]{1,25})$/.test(value.runId) ||
          !(input.etag === null || typeof input.etag === 'string' && /^[A-Za-z0-9-]{1,80}$/.test(input.etag))) return json({ error: 'checkpoint_invalid' }, 400);
      if (value.schema === 'noah-collector-checkpoint/1') {
        if (typeof value.sqliteGzip !== 'string' || !/^H4sI[A-Za-z0-9+/]*={0,2}$/.test(value.sqliteGzip) || value.sqliteGzip.length % 4) return json({ error: 'checkpoint_invalid' }, 400);
      } else {
        if (!Array.isArray(value.chunks) || !value.chunks.length || value.chunks.length > 128 || value.chunks.some((hash: unknown) => typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash))) return json({ error: 'checkpoint_invalid' }, 400);
        // Existence checks must not leave R2 object bodies open while committing the manifest.
        for (const hash of new Set<string>(value.chunks)) if (!await bucket.head(chunkPrefix + hash)) return json({ error: 'checkpoint_chunk_missing' }, 409);
      }
      if ((old?.etag ?? null) !== input.etag) return json({ error: 'checkpoint_conflict' }, 409);
      const previous = old ? await old.json<{ updatedAt: number; chunks?: string[] }>() : null;
      if (previous && previous.updatedAt >= value.updatedAt) return json({ error: 'checkpoint_stale' }, 409);
      // Persist only the declared fields; callers cannot choose another R2 path.
      const checkpoint = { schema: value.schema, updatedAt: value.updatedAt, runId: value.runId, ...(value.schema === 'noah-collector-checkpoint/1' ? { sqliteGzip: value.sqliteGzip } : { chunks: value.chunks }) };
      const saved = await bucket.put(objectKey, JSON.stringify(checkpoint), { onlyIf: old ? { etagMatches: old.etag } : { etagDoesNotMatch: '*' }, httpMetadata: { contentType: 'application/json' } });
      if (saved && bucket.list && bucket.delete) {
        // Preserve the previous manifest for readers that started before this commit.
        const active = new Set<string>([...(previous?.chunks ?? []), ...('chunks' in checkpoint ? checkpoint.chunks : [])]);
        const cleanup = pruneCheckpointChunks(bucket, active, saved.etag, now() - 7_200_000).catch(() => undefined);
        if (waitUntil) waitUntil(cleanup);
        else await cleanup;
      }
      return saved ? json({ etag: saved.etag, updatedAt: value.updatedAt }) : json({ error: 'checkpoint_conflict' }, 409);
    } catch (error) {
      if (error && typeof error === 'object' && 'status' in error && error.status === 413) return json({ error: 'checkpoint_too_large' }, 413);
      return json({ error: error instanceof SyntaxError ? 'checkpoint_invalid' : 'checkpoint_unavailable' }, error instanceof SyntaxError ? 400 : 503);
    }
  };
}

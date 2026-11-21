import { remoteMcpUrl } from './mcp-inspection.ts';
import { sha256Hex, looksLikeNoahSecret } from './noah-connect-requirements.ts';

export const NOAH_COLLECTION_SOURCES = ['mcp-registry', 'github', 'huggingface', 'x'] as const;
export type NoahCollectionSource = typeof NOAH_COLLECTION_SOURCES[number];
export const NOAH_COLLECTION_LABELS: Record<NoahCollectionSource, string> = { 'mcp-registry': 'MCP公式台帳', github: 'GitHub', huggingface: 'Hugging Face', x: 'X' };
export const NOAH_COLLECTION_PATH = '/api/noah/collection';
export const NOAH_COLLECTION_LIMITS = { items: 500, bytes: 1_048_576, maxAgeMs: 7 * 86_400_000, xAgeMs: 86_400_000 };
export type NoahCollectionItem = {
  id: string; source: NoahCollectionSource; name: string; summary: string; author: string;
  url: string; sourceUrl: string; observedAt: number; expiresAt: number;
  metrics?: { stars?: number; likes?: number; reposts?: number };
  // Collection cards are discoveries, never an execution entitlement.
};
export type NoahCollectionSnapshot = { schema: 'noah-collection/1'; source: NoahCollectionSource; collectedAt: number; items: NoahCollectionItem[] };
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const fail = (): never => { throw Error('collection_invalid'); };
function clean(v: unknown, max: number) {
  if (typeof v !== 'string' || v.length > max || Array.from(v).some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127) || looksLikeNoahSecret(v)) return fail();
  return v;
}
export function collectionUrl(value: unknown): string {
  if (typeof value !== 'string' || value.length > 2000 || looksLikeNoahSecret(value)) return fail();
  const url = remoteMcpUrl(value);
  if (url.search || url.hash) return fail();
  return url.href;
}
export function parseCollectionSnapshot(value: unknown, now: number): NoahCollectionSnapshot {
  if (!object(value) || value.schema !== 'noah-collection/1' || !NOAH_COLLECTION_SOURCES.includes(value.source as NoahCollectionSource) || !Array.isArray(value.items) || value.items.length > NOAH_COLLECTION_LIMITS.items) return fail();
  const source = value.source as NoahCollectionSource, at = value.collectedAt;
  if (typeof at !== 'number' || !Number.isSafeInteger(at) || at < 1 || at > now + 120_000) return fail();
  const ids = new Set<string>();
  const items = value.items.map(raw => {
    if (!object(raw) || raw.source !== source) return fail();
    const id = clean(raw.id, 320), name = clean(raw.name, 200), summary = clean(raw.summary, 500), author = clean(raw.author, 200);
    if (!id || !name || ids.has(id)) return fail(); ids.add(id);
    const url = collectionUrl(raw.url), sourceUrl = collectionUrl(raw.sourceUrl), origin = new URL(sourceUrl);
    const allowed = source === 'github' ? origin.hostname === 'github.com' : source === 'huggingface' ? origin.hostname === 'huggingface.co' : source === 'x' ? origin.hostname === 'x.com' && /^\/[A-Za-z0-9_]{1,15}\/status\/\d{1,25}$/.test(origin.pathname) : origin.hostname === 'registry.modelcontextprotocol.io';
    if (!allowed) return fail();
    const observedAt = raw.observedAt, expiresAt = raw.expiresAt, maxAge = source === 'x' ? NOAH_COLLECTION_LIMITS.xAgeMs : NOAH_COLLECTION_LIMITS.maxAgeMs;
    if (typeof observedAt !== 'number' || typeof expiresAt !== 'number' || !Number.isSafeInteger(observedAt) || !Number.isSafeInteger(expiresAt) || observedAt < 1 || observedAt > at || expiresAt <= observedAt || expiresAt > observedAt + maxAge) return fail();
    // Posts are referenced by URL; their text is not republished as an Agent description.
    if (source === 'x' && (summary !== 'Xで紹介されたAgentのリンクです。内容と利用条件は配布元で確認できます。' || !author.startsWith('@'))) return fail();
    const metrics: NonNullable<NoahCollectionItem['metrics']> = {};
    if (raw.metrics !== undefined) {
      if (!object(raw.metrics)) return fail();
      const allowedMetrics = source === 'github' ? ['stars'] : source === 'huggingface' ? ['likes'] : source === 'x' ? ['likes', 'reposts'] : [];
      for (const [metric, count] of Object.entries(raw.metrics)) {
        if (!allowedMetrics.includes(metric) || typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0) return fail();
        metrics[metric as keyof typeof metrics] = count;
      }
    }
    return { id, source, name, summary, author, url, sourceUrl, observedAt, expiresAt, ...(Object.keys(metrics).length ? { metrics } : {}) };
  });
  return { schema: 'noah-collection/1', source, collectedAt: at, items };
}

export async function collectionSignature(key: string, timestamp: string, body: string) {
  const imported = await crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const hash = await sha256Hex(body);
  const signature = await crypto.subtle.sign('HMAC', imported, new TextEncoder().encode(`${timestamp}\nPOST\n${NOAH_COLLECTION_PATH}\n${hash}`));
  return [...new Uint8Array(signature)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
export async function verifyCollectionSignature(key: string | undefined, timestamp: string | null, signature: string | null, body: string, now: number) {
  if (!key || key.length < 32 || !timestamp || !/^\d{13}$/.test(timestamp) || Math.abs(now - Number(timestamp)) > 120_000 || !signature || !/^[a-f0-9]{64}$/.test(signature)) return false;
  const expected = await collectionSignature(key, timestamp, body);
  let diff = 0; for (let i = 0; i < 64; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}

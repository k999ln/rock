import type { LlmRuntimeEnv } from './llm-providers.ts';

/** Bounded, read-only loopback inventory. Observed digests are not attestations
 * of weights used during inference; aliases can change between observations. */
export async function readOllamaModelInventory(runtime: LlmRuntimeEnv, fetchImpl: typeof fetch = fetch) {
  const base = new URL(runtime.SKY_OLLAMA_BASE_URL || 'http://127.0.0.1:11434');
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname) || !['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash)
    throw new Error('INVALID_LOCAL_ENDPOINT');
  const response = await fetchImpl(new URL('/api/tags', base), { redirect: 'manual', signal: AbortSignal.timeout(4000) });
  if (!response.ok || Number(response.headers.get('content-length') ?? 0) > 128000) throw new Error('MODEL_INVENTORY_UNAVAILABLE');
  const reader = response.body?.getReader();
  if (!reader) throw new Error('MODEL_INVENTORY_UNAVAILABLE');
  const chunks: Uint8Array[] = []; let bytes = 0;
  try {
    while (true) {
      const part = await reader.read(); if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > 128000) { await reader.cancel(); throw new Error('MODEL_INVENTORY_TOO_LARGE'); }
      chunks.push(part.value);
    }
  } finally { reader.releaseLock(); }
  const body = new Uint8Array(bytes); let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  const value = JSON.parse(new TextDecoder().decode(body)) as { models?: unknown };
  if (!Array.isArray(value.models) || value.models.length > 50) throw new Error('INVALID_MODEL_INVENTORY');
  const models = value.models.filter((m): m is { name: string; digest: string; size?: number } =>
    m && typeof m === 'object' && typeof m.name === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:/@+-]{0,119}$/.test(m.name) && typeof m.digest === 'string' && /^[a-f0-9]{64}$/.test(m.digest));
  if (new Set(models.map(m => m.name)).size !== models.length) throw new Error('AMBIGUOUS_MODEL_INVENTORY');
  return models.map(m => ({ name: m.name, digest: m.digest, bytes: typeof m.size === 'number' && Number.isSafeInteger(m.size) && m.size >= 0 ? m.size : null }));
}

export async function readOllamaModelDigest(model: string, runtime: LlmRuntimeEnv) {
  return (await readOllamaModelInventory(runtime)).find(m => m.name === model)?.digest ?? null;
}

import { NOAH_COLLECTION_LIMITS, NOAH_COLLECTION_PATH, collectionSignature, collectionUrl, parseCollectionSnapshot } from '../lib/noah-collection.ts';
import { looksLikeNoahSecret } from '../lib/noah-connect-requirements.ts';
import { xAgentProject } from './noah-collector-x.mjs';

const text = (value, max) => Array.from(String(value ?? '')).map(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127 ? ' ' : char).join('').slice(0, max);
export function collectionSnapshots({ exported, discoveries, x, now }) {
  const snapshots = ['github', 'huggingface', 'mcp-registry', 'x'].map(source => ({ schema: 'noah-collection/1', source, collectedAt: now, items: [] }));
  const bySource = new Map(snapshots.map(value => [value.source, value]));
  const add = item => {
    const snapshot = bySource.get(item.source);
    if (snapshot.items.length >= NOAH_COLLECTION_LIMITS.items) return;
    try {
      if (looksLikeNoahSecret(item.name) || looksLikeNoahSecret(item.summary)) return;
      const valid = parseCollectionSnapshot({ ...snapshot, items: [item] }, now);
      snapshot.items.push(valid.items[0]);
    } catch { /* Public metadata that violates the publication contract stays local. */ }
  };
  for (const row of discoveries) {
    const metadata = row.metadata, observedAt = row.checked_at;
    if (observedAt + NOAH_COLLECTION_LIMITS.maxAgeMs <= now) continue;
    const url = xAgentProject(metadata.url) ?? metadata.url;
    add({ id: row.id, source: row.provider, name: text(metadata.name, 200), summary: text(metadata.summary, 500), author: text(metadata.author, 200), url, sourceUrl: metadata.url, observedAt, expiresAt: observedAt + NOAH_COLLECTION_LIMITS.maxAgeMs, ...(metadata.metrics ? { metrics: metadata.metrics } : {}) });
  }
  const candidates = new Map(exported.candidates.map(row => [row.id, row]));
  const checks = new Map(exported.checks.map(row => [row.candidate_id, row]));
  for (const family of exported.families) {
    const row = candidates.get(family.representative_id), check = checks.get(family.representative_id);
    if (!row || !check?.checked_at) continue;
    try {
      const record = JSON.parse(row.record_json), target = JSON.parse(check.connect_json).target?.url;
      const candidateUrl = record.repository?.url || record.websiteUrl || target;
      const url = xAgentProject(candidateUrl) ?? collectionUrl(candidateUrl), observedAt = check.checked_at;
      if (observedAt + NOAH_COLLECTION_LIMITS.maxAgeMs <= now) continue;
      add({ id: row.id, source: 'mcp-registry', name: text(row.name, 200), summary: text(row.summary, 500), author: text(row.group_key, 200), url,
        sourceUrl: `https://registry.modelcontextprotocol.io/v0.1/servers/${encodeURIComponent(row.external_key)}/versions/latest`, observedAt, expiresAt: observedAt + NOAH_COLLECTION_LIMITS.maxAgeMs });
    } catch { /* Keep malformed or private URLs out of the public cards. */ }
  }
  for (const item of x.items) add(item);
  return snapshots;
}

export async function publishCollection({ snapshots, origin, key, fetcher, now = Date.now }) {
  const target = new URL(origin);
  if (target.protocol !== 'https:' || target.username || target.password || target.pathname !== '/' || target.search || target.hash || !key || key.length < 32) throw Error('collector_publish_configuration');
  const results = [];
  for (const snapshot of snapshots) {
    const body = JSON.stringify(snapshot);
    if (Buffer.byteLength(body) > NOAH_COLLECTION_LIMITS.bytes) throw Error('collector_publish_too_large');
    const timestamp = String(now());
    const response = await fetcher(new URL(NOAH_COLLECTION_PATH, target), { method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(20_000), body,
      headers: { 'Content-Type': 'application/json', 'x-noah-collector-time': timestamp, 'x-noah-collector-signature': await collectionSignature(key, timestamp, body) } });
    await response.body?.cancel();
    if (!response.ok) throw Error(`collector_publish_http_${response.status}`);
    results.push({ source: snapshot.source, items: snapshot.items.length });
  }
  return results;
}

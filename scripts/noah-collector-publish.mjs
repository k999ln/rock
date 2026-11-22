import { NOAH_COLLECTION_LIMITS, NOAH_COLLECTION_PATH, collectionSignature, collectionUrl, noahCollectionBlocked, noahCollectionHot, parseCollectionSnapshot } from '../lib/noah-collection.ts';
import { looksLikeNoahSecret } from '../lib/noah-connect-requirements.ts';
import { xAgentProject } from './noah-collector-x.mjs';

const text = (value, max) => Array.from(String(value ?? '')).map(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127 ? ' ' : char).join('').slice(0, max);
/**
 * 出所ごとの紹介のスナップショット。各出所の中で「新しく使いやすい順」（lib/noah-collection.ts の noahCollectionHot）に並べ、同じ配布 URL は 1 件にして、500 件まで。
 * leads: 足した出所（scripts/noah-collector-feeds.mjs）。sent: 本番の一覧へ入れ終えた系列（スマホで今すぐ・詳細へのリンクは、入れ終えた物だけ）。
 * X は、公式 API の鍵が有る時だけ出す（鍵の無い収集機が、運営の Codex が送った X の紹介を、空で上書きしないため）。Reddit・Bluesky は、ここでは出さない。
 */
export function collectionSnapshots({ exported, discoveries, x, now, leads = [], sent = new Set(), xConfigured = x?.status !== 'needs_credentials' }) {
  const sources = ['github', 'huggingface', 'mcp-registry', 'hackernews', 'npm', 'docker', 'smithery', 'awesome', ...(xConfigured ? ['x'] : [])];
  const pending = new Map(sources.map(source => [source, []]));
  const add = item => {
    const list = pending.get(item.source);
    if (!list) return;
    try {
      if (looksLikeNoahSecret(item.name) || looksLikeNoahSecret(item.summary) || noahCollectionBlocked(item)) return;
      const clean = Object.fromEntries(Object.entries(item).filter(([, value]) => value !== undefined));
      list.push(parseCollectionSnapshot({ schema: 'noah-collection/1', source: item.source, collectedAt: now, items: [clean] }, now).items[0]);
    } catch { /* Public metadata that violates the publication contract stays local. */ }
  };
  for (const row of discoveries) {
    const metadata = row.metadata, observedAt = row.checked_at;
    if (observedAt + NOAH_COLLECTION_LIMITS.maxAgeMs <= now) continue;
    const url = xAgentProject(metadata.url) ?? metadata.url;
    add({ id: row.id, source: row.provider, name: text(metadata.name, 200), summary: text(metadata.summary, 500), author: text(metadata.author, 200), url, sourceUrl: metadata.url, observedAt, expiresAt: observedAt + NOAH_COLLECTION_LIMITS.maxAgeMs,
      ...(row.first_seen_at ? { createdAt: Math.min(row.first_seen_at, observedAt) } : {}), ...(row.provider === 'huggingface' ? { run: 'space' } : {}), ...(metadata.metrics ? { metrics: metadata.metrics } : {}) });
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
      // 鍵・サインインが要る物は「鍵が要る」。鍵なしで握手が通った物は、本番の一覧へ入れ終えていれば「スマホで今すぐ」（詳細へつなぐ）。
      const keyed = Number(check.setup) === 1 || ['oauth', 'key', 'payment'].includes(check.auth);
      const run = keyed ? { run: 'key' } : sent.has(family.id) ? { run: 'phone', familyId: family.id } : {};
      const createdAt = Math.min(Number(row.first_seen_at) || observedAt, Number(row.source_updated_at) || Number(row.first_seen_at) || observedAt);
      add({ id: row.id, source: 'mcp-registry', name: text(row.name, 200), summary: text(row.summary, 500), author: text(row.group_key, 200), url,
        sourceUrl: `https://registry.modelcontextprotocol.io/v0.1/servers/${encodeURIComponent(row.external_key)}/versions/latest`, observedAt, expiresAt: observedAt + NOAH_COLLECTION_LIMITS.maxAgeMs, createdAt, ...run });
    } catch { /* Keep malformed or private URLs out of the public cards. */ }
  }
  for (const item of leads) add(item);
  if (xConfigured) for (const item of x.items) add(item);
  return sources.map(source => {
    // 同じ配布 URL は、並びの上の 1 件だけ（別の出所の紹介は、公開の API が 1 枚にまとめる）。
    const ranked = pending.get(source).map(item => ({ item, hot: noahCollectionHot({ sources: [item], run: item.run, name: item.name, summary: item.summary }) }))
      .sort((a, b) => b.hot - a.hot || a.item.id.localeCompare(b.item.id));
    // 同じ名前の写し（Hugging Face の複製の Space など）も、上の 1 件だけ。
    const urls = new Set(), ids = new Set(), names = new Set(), items = [];
    for (const { item } of ranked) {
      const name = item.name.normalize('NFKC').toLowerCase().replace(/\s+/gu, ' ').trim();
      if (items.length >= NOAH_COLLECTION_LIMITS.items || urls.has(item.url) || ids.has(item.id) || (source !== 'x' && names.has(name))) continue;
      urls.add(item.url); ids.add(item.id); names.add(name); items.push(item);
    }
    return { schema: 'noah-collection/1', source, collectedAt: now, items };
  });
}

export async function publishCollection({ snapshots, origin, key, fetcher, now = Date.now }) {
  const target = new URL(origin);
  if (target.protocol !== 'https:' || target.username || target.password || target.pathname !== '/' || target.search || target.hash || !key || key.length < 32) throw Error('collector_publish_configuration');
  const results = [];
  let failure = null;
  // 1 つの出所の失敗で、他の出所の掲載を止めない（失敗は、全部を送った後で知らせる）。
  for (const snapshot of snapshots) {
    const body = JSON.stringify(snapshot);
    if (Buffer.byteLength(body) > NOAH_COLLECTION_LIMITS.bytes) { failure ??= 'collector_publish_too_large'; continue; }
    const timestamp = String(now());
    const response = await fetcher(new URL(NOAH_COLLECTION_PATH, target), { method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(20_000), body,
      headers: { 'Content-Type': 'application/json', 'x-noah-collector-time': timestamp, 'x-noah-collector-signature': await collectionSignature(key, timestamp, body) } });
    await response.body?.cancel();
    if (!response.ok) { failure ??= `collector_publish_http_${response.status}`; continue; }
    results.push({ source: snapshot.source, items: snapshot.items.length });
  }
  if (failure) throw Error(failure);
  return results;
}

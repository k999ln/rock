import { NOAH_COLLECTION_LIMITS, collectionUrl } from '../lib/noah-collection.ts';

export const X_AGENT_QUERY = '("AI agent" OR "AI agents" OR MCP OR エージェント) has:links -is:retweet';
const EMPTY = { sinceId: null, newestId: null, cursor: null, nextAt: 0, lastSuccessAt: null, error: null, items: [] };
export function xAgentProject(value) {
  try {
    const url = new URL(value), parts = url.pathname.split('/').filter(Boolean);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
    if (url.hostname === 'github.com' && parts.length >= 2 && parts.slice(0, 2).every(p => /^[A-Za-z0-9_.-]+$/.test(p)) && !['search', 'topics', 'orgs', 'users', 'settings'].includes(parts[0])) return `https://github.com/${parts[0].toLowerCase()}/${parts[1].replace(/\.git$/, '').toLowerCase()}`;
    if (url.hostname === 'huggingface.co' && parts[0] === 'spaces' && parts.length >= 3 && parts.slice(1, 3).every(p => /^[A-Za-z0-9_.-]+$/.test(p))) return `https://huggingface.co/spaces/${parts[1]}/${parts[2]}`;
  } catch { /* not a supported project URL */ }
  return null;
}
async function readPage(response) {
  if (!response.body || Number(response.headers.get('content-length')) > NOAH_COLLECTION_LIMITS.bytes) { await response.body?.cancel(); throw Error('invalid_response'); }
  const reader = response.body.getReader(), chunks = []; let bytes = 0;
  try {
    for (;;) { const { value, done } = await reader.read(); if (done) break; bytes += value.byteLength; if (bytes > NOAH_COLLECTION_LIMITS.bytes) throw Error('invalid_response'); chunks.push(value); }
    const joined = new Uint8Array(bytes); let offset = 0; for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.length; }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(joined));
  } finally { await reader.cancel().catch(() => {}); }
}
export function xCollectionState(local) {
  local.assertLease();
  local.sql.exec('CREATE TABLE IF NOT EXISTS _noah_collector_x(id INTEGER PRIMARY KEY CHECK(id=1),state_json TEXT NOT NULL)');
  const row = local.sql.prepare('SELECT state_json FROM _noah_collector_x WHERE id=1').get();
  return row ? JSON.parse(row.state_json) : { ...EMPTY, items: [] };
}
export async function collectXAgents({ local, fetcher, token, now = Date.now }) {
  const state = xCollectionState(local), at = now();
  if (!token) return { status: 'needs_credentials', items: state.items.filter(item => item.expiresAt > at), nextAt: null };
  if (state.nextAt > at) return { status: state.error ?? 'not_due', items: state.items.filter(item => item.expiresAt > at), nextAt: state.nextAt };
  const url = new URL('https://api.x.com/2/tweets/search/recent');
  url.search = new URLSearchParams({ query: X_AGENT_QUERY, max_results: '100', 'tweet.fields': 'entities,author_id,created_at,public_metrics', expansions: 'author_id', 'user.fields': 'username' }).toString();
  // Recent search only covers seven days. A stale cursor starts a new recent window.
  if (state.lastSuccessAt && at - state.lastSuccessAt > 6 * 86_400_000) { state.sinceId = null; state.cursor = null; state.newestId = null; }
  if (state.sinceId) url.searchParams.set('since_id', state.sinceId);
  if (state.cursor) url.searchParams.set('next_token', state.cursor);
  let result = 'updated';
  try {
    const response = await fetcher(url, { redirect: 'manual', signal: AbortSignal.timeout(20_000), headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'User-Agent': 'NoahBot/1 (+https://avoado.si/noah/help#bot)' } });
    if (!response.ok) {
      const retry = response.headers.get('retry-after'), reset = Number(response.headers.get('x-rate-limit-reset')) * 1000;
      const seconds = retry && /^\d+$/.test(retry) ? Number(retry) * 1000 : 0;
      state.nextAt = Math.min(at + 86_400_000, Math.max(at + 2 * 3_600_000, at + seconds, Number.isFinite(reset) ? reset : 0));
      await response.body?.cancel();
      throw Error(response.status === 429 ? 'rate_limited' : [401, 403].includes(response.status) ? 'needs_credentials' : response.status === 402 ? 'quota_required' : 'unavailable');
    }
    const page = await readPage(response);
    if (!page || page.errors?.length || !page.meta || (page.data !== undefined && !Array.isArray(page.data)) || (page.data?.length ?? 0) > 100) throw Error('invalid_response');
    const next = page.meta.next_token;
    if (next !== undefined && (typeof next !== 'string' || !next || next.length > 2048 || next === state.cursor)) throw Error('invalid_response');
    const users = new Map((Array.isArray(page.includes?.users) ? page.includes.users : []).map(user => [user.id, user.username]));
    const items = new Map(state.items.filter(item => item.expiresAt > at).map(item => [item.id, item]));
    for (const post of page.data ?? []) {
      if (!post || !/^\d{1,25}$/.test(post.id)) throw Error('invalid_response');
      if (!state.newestId || BigInt(post.id) > BigInt(state.newestId)) state.newestId = post.id;
      const username = users.get(post.author_id);
      if (typeof username !== 'string' || !/^[A-Za-z0-9_]{1,15}$/.test(username)) continue;
      for (const link of Array.isArray(post.entities?.urls) ? post.entities.urls : []) {
        const project = xAgentProject(link.expanded_url);
        if (!project) continue;
        const id = `x:${post.id}:${project}`;
        const metrics = {};
        for (const [api, field] of [['like_count', 'likes'], ['retweet_count', 'reposts']]) {
          const count = post.public_metrics?.[api];
          if (Number.isSafeInteger(count) && count >= 0) metrics[field] = count;
        }
        items.set(id, { id, source: 'x', name: project.split('/').slice(-2).join('/'), author: `@${username}`,
          summary: 'Xで紹介されたAgentのリンクです。内容と利用条件は配布元で確認できます。',
          url: project, sourceUrl: collectionUrl(`https://x.com/${username}/status/${post.id}`), observedAt: at, expiresAt: at + NOAH_COLLECTION_LIMITS.xAgeMs, ...(Object.keys(metrics).length ? { metrics } : {}) });
      }
    }
    state.items = [...items.values()].sort((a, b) => b.observedAt - a.observedAt || a.id.localeCompare(b.id)).slice(0, NOAH_COLLECTION_LIMITS.items);
    state.cursor = next ?? null;
    if (!next) { state.sinceId = state.newestId ?? state.sinceId; state.newestId = null; }
    state.lastSuccessAt = at; state.nextAt = next ? at + 60_000 : at + 2 * 3_600_000; state.error = null;
  } catch (error) {
    result = ['rate_limited', 'needs_credentials', 'quota_required', 'invalid_response'].includes(error.message) ? error.message : 'unavailable';
    state.error = result; state.nextAt = Math.max(state.nextAt, at + 2 * 3_600_000);
  }
  local.assertLease();
  local.sql.prepare('INSERT INTO _noah_collector_x VALUES(1,?) ON CONFLICT(id) DO UPDATE SET state_json=excluded.state_json').run(JSON.stringify(state));
  return { status: result, items: state.items.filter(item => item.expiresAt > at), nextAt: state.nextAt };
}

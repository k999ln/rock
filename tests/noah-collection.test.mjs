import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCollectionApi } from '../lib/noah-collection-api.ts';
import { collectionSignature, parseCollectionSnapshot, NOAH_COLLECTION_PATH } from '../lib/noah-collection.ts';
import { openCollectorStore } from '../scripts/noah-collector-store.mjs';
import { collectXAgents } from '../scripts/noah-collector-x.mjs';
import { normalizeDiscovery } from '../lib/noah-discovery-provider.ts';
import { publishCollection } from '../scripts/noah-collector-publish.mjs';
import * as collection from '../lib/noah-collection.ts';
import { screen } from './fixtures/noah/screen.mjs';

const NOW = Date.UTC(2026, 10, 22), KEY = randomBytes(32).toString('hex');
const item = (source = 'github', extra = {}) => ({ id: `${source}:1`, source, name: 'Useful agent', summary: 'A public Agent repository', author: 'maker', url: 'https://github.com/maker/agent', sourceUrl: 'https://github.com/maker/agent', observedAt: NOW, expiresAt: NOW + 86_400_000, ...extra });
const snapshot = (source = 'github', items = [item(source)], at = NOW) => ({ schema: 'noah-collection/1', source, collectedAt: at, items });

void test('home includes GitHub and HF ratings even while the registry has many newer records', async () => {
  const api = createCollectionApi({ bucket: bucket(), key: KEY, now: () => NOW + 10 });
  const registry = Array.from({ length: 30 }, (_, i) => item('mcp-registry', { id: `mcp:${i}`, url: `https://github.com/maker/mcp-${i}`, sourceUrl: `https://registry.modelcontextprotocol.io/v0.1/servers/agent-${i}`, observedAt: NOW + 1 }));
  assert.equal((await post(api, snapshot('mcp-registry', registry, NOW + 1))).status, 200);
  await post(api, snapshot('github', [item('github', { metrics: { stars: 100 } })]));
  await post(api, snapshot('huggingface', [item('huggingface', { id: 'hf:1', url: 'https://huggingface.co/spaces/maker/agent', sourceUrl: 'https://huggingface.co/spaces/maker/agent', metrics: { likes: 9 } })]));
  const home = await (await api(new Request('https://avoado.si/api/noah/collection?view=home'))).json();
  assert.deepEqual(home.items.slice(0, 3).map(row => row.source), ['mcp-registry', 'github', 'huggingface']);
  assert.equal(home.items[2].metrics.likes, 9); assert.equal(home.total, 32);
});

void test('Noah home renders collected cards and refreshes external ratings while the page is visible', async () => {
  let likes = 7;
  const visibility = { hidden: false };
  const ui = screen({ document: visibility, modules: {
    '@/lib/noah-collection': collection,
    './noah-surface-context': { useNoahSurface: () => undefined },
    './noah-timeline': { default: () => 'Timeline' }, './noah-pin-home': { default: () => 'Pins' },
  }, fetch: async request => {
    assert.match(request.url, /\/api\/noah\/collection\?.*view=home/);
    const row = item('huggingface', { sourceUrl: 'https://huggingface.co/spaces/maker/agent', metrics: { likes } });
    return { body: { items: [{ ...row, sources: [row] }], total: 1, nextCursor: null, configured: true } };
  } });
  const home = ui.mount('components/noah-home.tsx', { mode: 'public' });
  await home.tick(200);
  assert.match(home.text(), /新しく見つかったAgent/); assert.match(home.text(), /Hugging Face.*いいね 7/);
  assert.ok(home.find('a').some(node => node.props.href === '/noah/agents'));
  likes = 3; await home.tick(60000); await home.tick(200);
  assert.match(home.text(), /いいね 3/);
  const requests = ui.calls.length; visibility.hidden = true; await home.tick(60000); await home.tick(200);
  assert.equal(ui.calls.length, requests);
});
function bucket() {
  const rows = new Map(); let generation = 0;
  return { rows, async get(key) { const row = rows.get(key); return row ? { etag: row.etag, async json() { return JSON.parse(row.text); } } : null; },
    async put(key, value, options) {
      const old = rows.get(key);
      if (options.onlyIf.etagMatches && options.onlyIf.etagMatches !== old?.etag || options.onlyIf.etagDoesNotMatch === '*' && old) return null;
      const etag = String(++generation); rows.set(key, { etag, text: value }); return { etag };
    },
  };
}
async function post(api, value, options = {}) {
  const body = JSON.stringify(value), time = String(options.time ?? NOW);
  const signature = await collectionSignature(options.key ?? KEY, time, options.signedBody ?? body);
  return api(new Request(`https://avoado.si${NOAH_COLLECTION_PATH}`, { method: 'POST', body, headers: { 'content-type': 'application/json', 'x-noah-collector-time': time, 'x-noah-collector-signature': signature, ...options.headers } }));
}

void test('signed publication appears in public cards, merges duplicate projects with provenance, and searches by source', async () => {
  const store = bucket(), api = createCollectionApi({ bucket: store, key: KEY, now: () => NOW });
  const xItem = item('x', { sourceUrl: 'https://x.com/maker/status/1234', author: '@maker', summary: 'Xで紹介されたAgentのリンクです。内容と利用条件は配布元で確認できます。' });
  const published = await publishCollection({ snapshots: [snapshot(), snapshot('x', [xItem])], origin: 'https://avoado.si', key: KEY, now: () => NOW, fetcher: (url, init) => api(new Request(url, init)) });
  assert.equal(published.length, 2);
  const all = await (await api(new Request(`https://avoado.si${NOAH_COLLECTION_PATH}`))).json();
  assert.equal(all.total, 1); assert.equal(all.items[0].sources.length, 2); assert.equal(all.items[0].status, 'discovered');
  const filtered = await (await api(new Request(`https://avoado.si${NOAH_COLLECTION_PATH}?source=x&q=useful`))).json();
  assert.equal(filtered.total, 1); assert.equal(filtered.items[0].sources.length, 1);
  assert.equal(JSON.stringify(all).includes(KEY), false);
});

void test('publication rejects forged bodies, old signatures, browser posts, stale snapshots and unexpected source URLs', async () => {
  const store = bucket(), api = createCollectionApi({ bucket: store, key: KEY, now: () => NOW });
  assert.equal((await post(api, snapshot(), { signedBody: '{}' })).status, 401);
  assert.equal((await post(api, snapshot(), { time: NOW - 120_001 })).status, 401);
  assert.equal((await post(api, snapshot(), { headers: { origin: 'https://avoado.si' } })).status, 403);
  assert.equal((await post(api, snapshot('github', [item('github', { sourceUrl: 'https://elsewhere.example.com' })]))).status, 400);
  assert.equal((await post(api, snapshot())).status, 200);
  assert.equal((await post(api, snapshot('github', [], NOW - 1))).status, 409);
  assert.deepEqual(await (await post(api, snapshot())).json(), { unchanged: true });
  assert.throws(() => parseCollectionSnapshot(snapshot('github', [item('github', { url: 'https://127.0.0.1/private' })]), NOW));
});

void test('expired entries disappear and later empty snapshots remove previously published items', async () => {
  const store = bucket(); let clock = NOW;
  const api = createCollectionApi({ bucket: store, key: KEY, now: () => clock });
  await post(api, snapshot()); clock += 86_400_001;
  assert.equal((await (await api(new Request(`https://avoado.si${NOAH_COLLECTION_PATH}`))).json()).total, 0);
  assert.equal((await post(api, snapshot('github', [], clock), { time: clock })).status, 200);
  assert.equal((await (await api(new Request(`https://avoado.si${NOAH_COLLECTION_PATH}`))).json()).total, 0);
});

void test('X uses the official search, resumes pagination, and stores links without tweet bodies or tokens', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'noah-x-test-')); let clock = NOW;
  const local = openCollectorStore(directory, { now: () => clock }); t.after(() => { local.close(); rmSync(directory, { recursive: true, force: true }); });
  const calls = [], token = 'x-test-only-credential';
  const fetcher = async (raw, init) => {
    const url = new URL(raw); calls.push(url);
    assert.equal(url.origin, 'https://api.x.com'); assert.equal(init.redirect, 'manual'); assert.equal(init.headers.Authorization, `Bearer ${token}`);
    return Response.json({ data: [{ id: calls.length === 1 ? '999' : '998', author_id: '111', text: 'This post body must not be stored', entities: { urls: [{ expanded_url: 'https://github.com/Maker/Agent?tracking=unused' }] } }], includes: { users: [{ id: '111', username: 'maker' }] }, meta: calls.length === 1 ? { next_token: 'page2' } : {} });
  };
  const absent = await collectXAgents({ local, fetcher, now: () => clock }); assert.equal(absent.status, 'needs_credentials'); assert.equal(calls.length, 0);
  const first = await collectXAgents({ local, fetcher, token, now: () => clock }); assert.equal(first.items.length, 1);
  clock += 60_000;
  const second = await collectXAgents({ local, fetcher, token, now: () => clock });
  assert.equal(calls[1].searchParams.get('next_token'), 'page2');
  assert.equal(second.items[0].url, 'https://github.com/maker/agent');
  const saved = local.sql.prepare('SELECT state_json FROM _noah_collector_x').get().state_json;
  assert.equal(JSON.parse(saved).sinceId, '999');
  assert.ok(!saved.includes(token)); assert.ok(!saved.includes('post body'));
  await collectXAgents({ local, fetcher, token, now: () => clock }); assert.equal(calls.length, 2);
});

void test('X 429 and partial-error pages preserve their checkpoint and expose a fixed status', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'noah-x-fail-')); let clock = NOW;
  const local = openCollectorStore(directory, { now: () => clock }); t.after(() => { local.close(); rmSync(directory, { recursive: true, force: true }); });
  let calls = 0;
  const fetcher = async () => { calls++; return new Response(null, { status: 429, headers: { 'retry-after': '9000' } }); };
  const failed = await collectXAgents({ local, fetcher, token: 'test', now: () => clock });
  assert.equal(failed.status, 'rate_limited'); assert.equal(failed.nextAt, NOW + 9_000_000);
  await collectXAgents({ local, fetcher, token: 'test', now: () => clock }); assert.equal(calls, 1);
  clock = failed.nextAt; local.sql.prepare('UPDATE _noah_collector_lock SET expires_at=?').run(clock + 180_000);
  const partial = await collectXAgents({ local, fetcher: async () => Response.json({ data: [], meta: {}, errors: [{ detail: 'secret' }] }), token: 'test', now: () => clock });
  assert.equal(partial.status, 'invalid_response');
  assert.equal(JSON.parse(local.sql.prepare('SELECT state_json FROM _noah_collector_x').get().state_json).sinceId, null);
});

void test('external ratings retain their source, refresh downwards, and never create Noah ratings', async () => {
  const hf = { _id: 'a'.repeat(24), id: 'maker/agent', private: false, sha: 'b'.repeat(40), sdk: 'gradio', likes: 84 };
  assert.deepEqual(normalizeDiscovery('huggingface', hf).metrics, { likes: 84 });
  assert.equal(normalizeDiscovery('huggingface', { ...hf, likes: undefined }).metrics, undefined);
  assert.equal(normalizeDiscovery('huggingface', { ...hf, likes: -1 }).metrics, undefined);
  const store = bucket(); let clock = NOW;
  const api = createCollectionApi({ bucket: store, key: KEY, now: () => clock });
  const card = item('huggingface', { url: 'https://huggingface.co/spaces/maker/agent', sourceUrl: 'https://huggingface.co/spaces/maker/agent', metrics: { likes: 84 } });
  assert.equal((await post(api, snapshot('huggingface', [card]))).status, 200);
  clock += 1000;
  assert.equal((await post(api, snapshot('huggingface', [{ ...card, metrics: { likes: 81 }, observedAt: clock }], clock), { time: clock })).status, 200);
  const view = await (await api(new Request(`https://avoado.si${NOAH_COLLECTION_PATH}`))).json();
  assert.deepEqual(view.items[0].sources[0].metrics, { likes: 81 });
  assert.equal(view.items[0].sources[0].observedAt, clock);
  assert.equal('crowns' in view.items[0], false); assert.equal('users' in view.items[0], false);
  assert.throws(() => parseCollectionSnapshot(snapshot('huggingface', [{ ...card, metrics: { stars: 3 } }]), clock));
});

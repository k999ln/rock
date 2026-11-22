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
import * as researchTypes from '../lib/noah-research-types.ts';
import * as surface from '../lib/noah-surface.ts';
import * as brand from '../lib/web-brand.ts';
import * as publicGuide from '../lib/noah-public-guide.ts';
import { screen } from './fixtures/noah/screen.mjs';

void test('source ratings are visible with provenance, keep zero and omit unavailable counts', () => {
  const ui = screen({ modules: { '@/lib/noah-collection': collection } });
  const view = ui.mount('components/noah-agent-source-ratings.tsx', { detailHref: '/noah/discover/agent?id=project-test#ratings', sources: [
    { source: 'github', sourceUrl: 'https://github.com/maker/agent', observedAt: 1795302000000, metrics: { stars: 1234 } },
    { source: 'huggingface', sourceUrl: 'https://huggingface.co/spaces/maker/agent', observedAt: 1795302000000, metrics: { likes: 0 } },
    { source: 'mcp-registry', sourceUrl: 'https://registry.modelcontextprotocol.io/v0.1/servers/agent', observedAt: 1795302000000 },
    { source: 'x', sourceUrl: 'https://x.com/maker/status/1234', observedAt: 1795302000000, metrics: { likes: 8, reposts: 2 } },
  ] });
  assert.equal(view.find('details').length, 0);
  assert.equal(view.find('a').length, 4);
  assert.match(view.text(), /GitHub/); assert.match(view.text(), /1,234/);
  assert.deepEqual(view.find('span').map(n=>n.props['aria-label']).filter(Boolean), ['スター 1,234', 'いいね 0', 'いいね 8', 'リポスト 2']);
  assert.ok(view.find('a').every(n=>n.props.href === '/noah/discover/agent?id=project-test#ratings' && !n.props.target));
  assert.ok(view.find('a').every(n=>n.props.title.includes('確認')));
});

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
  // Each source still appears in the first round; within it, the better-rated source goes first (task 121: new and easy first).
  assert.deepEqual(home.items.slice(0, 3).map(row => row.source), ['github', 'huggingface', 'mcp-registry']);
  assert.equal(home.items[1].metrics.likes, 9); assert.equal(home.total, 32);
});

void test('Noah home renders collected cards and refreshes external ratings while the page is visible', async () => {
  let likes = 7;
  const visibility = { hidden: false };
  const ui = screen({ document: visibility, modules: {
    '@/lib/noah-collection': collection,
    './noah-surface-context': { useNoahSurface: () => undefined },
    './noah-timeline': { default: () => 'Timeline' }, './noah-pin-grid': { default: ({items})=>JSON.stringify(items) },
  }, fetch: async request => {
    assert.match(request.url, /\/api\/noah\/discover\?/);
    const row = item('huggingface', { sourceUrl: 'https://huggingface.co/spaces/maker/agent', metrics: { likes } });
    return { body: { items: [{ ...row, sources: [row] }], total: 1, nextCursor: null, configured: true } };
  } });
  const home = ui.mount('components/noah-home.tsx', { mode: 'public' });
  await home.tick(200);
  assert.match(home.text(), /Agentを見つける/); assert.match(home.text(), /"likes":7/);
  assert.equal(home.find('section').filter(node=>node.props['aria-label']==='Agent一覧').length,1);
  likes = 3; await home.tick(60000); await home.tick(200);
  assert.match(home.text(), /"likes":3/);
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


void test('collection source and query use the unified grid and clear restores all results', async () => {
  const ui=screen({search:'?collectionSource=huggingface&collectionQuery=日本語',modules:{'./noah-pin-grid':{default:()=>null}},fetch:async()=>({body:{items:[],total:0,nextCursor:null,ownerScope:null}})});
  const page=ui.mount('components/noah-collection-feed.tsx');await page.tick(200);
  assert.equal(page.find('input')[0].props.value,'日本語');
  let request=new URL(ui.calls.at(-1).url,'https://avoado.si');assert.equal(request.pathname,'/api/noah/discover');assert.equal(request.searchParams.get('source'),'huggingface');assert.equal(request.searchParams.get('q'),'日本語');
  await page.click('検索条件をクリア');await page.tick(200);
  request=new URL(ui.calls.at(-1).url,'https://avoado.si');assert.equal(request.searchParams.get('source'),'');assert.equal(request.searchParams.get('q'),'');
});
void test('collection retry immediately recovers from an error without losing source or query', async () => {
  let unavailable = true;
  const ui = screen({ search: '?collectionSource=huggingface&collectionQuery=agent', modules: { './noah-pin-grid': { default: ({items})=>JSON.stringify(items) }, '@/lib/noah-collection': collection }, fetch: async () => unavailable ? { status: 503 } : { body: { items: [], total: 0, nextCursor: null, configured: true } } });
  const page = ui.mount('components/noah-collection-feed.tsx'); await page.tick(200);
  assert.ok(page.nodes().some(node => node.props.role === 'alert'));
  unavailable = false; await page.click('再試行'); await page.tick(200);
  assert.equal(page.nodes().some(node => node.props.role === 'alert'), false);
  const request = new URL(ui.calls.at(-1).url, 'https://avoado.si');
  assert.equal(request.searchParams.get('source'), 'huggingface'); assert.equal(request.searchParams.get('q'), 'agent');
  assert.equal(ui.calls.length, 2);
});

void test('shared catalog search keeps the chosen source, resets pagination and delegates clear', async () => {
  const props = { searchQuery: 'first', onClearQuery() { props.searchQuery = ''; } };
  const ui = screen({ modules: { './noah-pin-grid': { default: ({items})=>JSON.stringify(items) }, '@/lib/noah-collection': collection }, fetch: async () => ({ body: { items: [], total: 40, nextCursor: '20', configured: true } }) });
  const page = ui.mount('components/noah-collection-feed.tsx', props); await page.tick(200);
  assert.equal(page.find('input').length, 0);
  await page.click('Hugging Face'); await page.tick(200); await page.click('もっと見る'); await page.tick(200);
  props.searchQuery = 'second'; page.render(); await page.tick(200);
  const updated = new URL(ui.calls.at(-1).url, 'https://avoado.si');
  assert.equal(updated.searchParams.get('source'), 'huggingface'); assert.equal(updated.searchParams.get('q'), 'second'); assert.equal(updated.searchParams.get('cursor'), '0');
  await page.click('検索条件をクリア'); await page.tick(200);
  const cleared = new URL(ui.calls.at(-1).url, 'https://avoado.si'); assert.equal(cleared.searchParams.get('q'), ''); assert.equal(cleared.searchParams.get('source'), '');
});

void test('the actual catalog uses one search for collected and researched Agents without losing source selection', async () => {
  const ui = screen({ search: '?collectionSource=huggingface&collectionQuery=physics', modules: { './noah-pin-grid': { default: ({items})=>JSON.stringify(items) }, '@/lib/noah-collection': collection, '@/lib/noah-research-types': researchTypes, '@/lib/noah-surface': surface, '@/lib/web-brand': brand, '@/lib/noah-public-guide': publicGuide }, fetch: async request => ({ body: request.url.includes('/discover?') ? { items: [], total: 0, nextCursor: null, configured: true } : { entries: [], total: 0, nextCursor: null, asOf: '2026-11-22' } }) });
  const page = ui.mount('components/noah-public-catalog.tsx', { embedded: true }); await page.tick(200);
  assert.equal(page.find('input').length, 1); assert.equal(page.find('input')[0].props.value, 'physics');
  await page.type('translation'); await page.tick(200);
  const collectionRequest = new URL(ui.calls.filter(c => c.url.includes('/discover?')).at(-1).url, 'https://avoado.si');
  assert.equal(collectionRequest.searchParams.get('q'), 'translation'); assert.equal(collectionRequest.searchParams.get('source'), 'huggingface');
  const catalogRequest = new URL(ui.calls.filter(c => c.url.includes('/public-catalog?')).at(-1).url, 'https://avoado.si'); assert.equal(catalogRequest.searchParams.get('q'), 'translation');
  await page.click('検索条件をクリア'); await page.tick(200); assert.equal(page.find('input')[0].props.value, '');
  const cleared = new URL(ui.calls.filter(c => c.url.includes('/discover?')).at(-1).url, 'https://avoado.si');assert.equal(cleared.searchParams.get('source'), '');assert.equal(cleared.searchParams.get('q'), '');
});

void test('unified source badges preserve additional collection metrics and zero counts',()=>{
  const ui=screen();
  const page=ui.mount('components/noah-agent-source-ratings.tsx',{sources:[
    {source:'hackernews',sourceUrl:'https://news.ycombinator.com/item?id=1',observedAt:NOW,metrics:{points:12,comments:0}},
    {source:'npm',sourceUrl:'https://www.npmjs.com/package/test',observedAt:NOW,metrics:{downloads:200}},
  ]});
  const labels=page.nodes().map(node=>node.props['aria-label']);
  assert.ok(labels.includes('点 12'));assert.ok(labels.includes('コメント 0'));assert.ok(labels.includes('週の取得 200'));
});

void test('changing discovery order keeps query and source but starts pagination again',async()=>{
  const ui=screen({modules:{'./noah-pin-grid':{default:()=>null}},fetch:async()=>({body:{items:[],total:40,nextCursor:'20',ownerScope:null}})});
  const page=ui.mount('components/noah-pin-home.tsx',{searchQuery:'agent',initialSource:'npm'});await page.flush();
  await page.click('もっと見る');await page.flush();
  await page.click('出た順');await page.flush();
  const params=new URL(ui.calls.at(-1).url,'https://avoado.si').searchParams;
  assert.equal(params.get('order'),'new');assert.equal(params.get('q'),'agent');assert.equal(params.get('source'),'npm');assert.equal(params.get('cursor'),'0');
});

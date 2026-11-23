// task 121: 集める場所を増やし、「新しく使いやすい物が上」に並べ、握手の済んだ系列を一覧へ自動で入れる。
// 出所の読み取り（Hacker News・GitHub の MCP・HF の MCP Space・npm・Docker・awesome 一覧・Smithery）、並びの式、出所ごとのスナップショット、
// 収集機からの取り込み（署名・変わった物だけ・日の上限・載らなくなった物）、Codex が読んだ X・Reddit・Bluesky の受け取り、グリッドのお試しの並びを確かめる。
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NOAH_COLLECTION_RANK, noahCollectionCards, noahCollectionHot, parseCollectionSnapshot, NOAH_COLLECTION_SOCIAL_SUMMARY } from '../lib/noah-collection.ts';
import { createCollectionApi } from '../lib/noah-collection-api.ts';
import { createIntakeImportApi, noahIntakeExport } from '../lib/noah-intake-import.ts';
import { openCollectorStore } from '../scripts/noah-collector-store.mjs';
import { collectFeeds, feedLeads, parseAwesome, projectUrl } from '../scripts/noah-collector-feeds.mjs';
import { collectionSnapshots } from '../scripts/noah-collector-publish.mjs';
import { importFamilies, importedFamilies } from '../scripts/noah-collector-import.mjs';
import { socialLead, runSocial } from '../scripts/noah-collector-social.mjs';
import { fixture } from './fixtures/noah/intake.mjs';
import { mcpServer, tool } from './fixtures/noah/mcp-server.mjs';
import { world, familyId, hostOf, ORIGIN } from './fixtures/noah/connect-world.mjs';

const NOW = Date.UTC(2026, 10, 22, 3), DAY = 86_400_000, KEY = randomBytes(32).toString('hex');
const card = (fields) => ({ id: 'x', source: 'github', name: 'Agent', summary: 'An agent', author: 'maker', url: 'https://github.com/maker/agent', sourceUrl: 'https://github.com/maker/agent', observedAt: NOW, expiresAt: NOW + DAY, ...fields });

void test('rank: new and easy come first; buzz counts in tens, a day of age costs about two tenfolds; no randomness', () => {
  const fresh = card({ id: 'fresh', url: 'https://github.com/a/fresh', createdAt: NOW, run: 'phone', familyId: 'mcp-registry:a/fresh' });
  const famousOld = card({ id: 'old', url: 'https://github.com/a/old', createdAt: NOW - 30 * DAY, metrics: { stars: 50_000 } });
  const sameDayMac = card({ id: 'mac', url: 'https://github.com/a/mac', createdAt: NOW, run: 'mac' });
  const sameDayKey = card({ id: 'key', url: 'https://github.com/a/key', createdAt: NOW, run: 'key' });
  const order = noahCollectionCards([famousOld, sameDayKey, sameDayMac, fresh]).map((c) => c.id);
  assert.deepEqual(order, ['fresh', 'mac', 'key', 'old']);
  // 票が 10 倍 = 12.5 時間新しいのと同じ。
  const a = noahCollectionHot({ sources: [{ source: 'github', createdAt: NOW, observedAt: NOW, metrics: { stars: 1000 } }], name: 'a', summary: '' });
  const b = noahCollectionHot({ sources: [{ source: 'github', createdAt: NOW + NOAH_COLLECTION_RANK.perTenfoldMs, observedAt: NOW, metrics: { stars: 100 } }], name: 'a', summary: '' });
  assert.ok(Math.abs(a - b) < 1e-9);
  // 日本語の説明と、別々の出所での話題は加点。
  const ja = noahCollectionCards([card({ id: 'ja', summary: '請求書を読む', createdAt: NOW })])[0].hot;
  const en = noahCollectionCards([card({ id: 'en', summary: 'reads invoices', createdAt: NOW })])[0].hot;
  assert.ok(ja > en);
  const two = noahCollectionCards([card({ id: 'g', createdAt: NOW }), card({ id: 'hn', source: 'hackernews', sourceUrl: 'https://news.ycombinator.com/item?id=1', createdAt: NOW })]);
  assert.equal(two.length, 1); assert.equal(two[0].sources.length, 2); assert.ok(two[0].hot > en);
  // 出た順は、出た時だけで並ぶ。
  assert.deepEqual(noahCollectionCards([famousOld, fresh], 'new').map((c) => c.id), ['fresh', 'old']);
});

void test('contract: new sources keep their own post and package URLs; posts carry no text; Noah links only for phone-runnable cards', () => {
  const snap = (source, item) => parseCollectionSnapshot({ schema: 'noah-collection/1', source, collectedAt: NOW, items: [card({ source, ...item })] }, NOW);
  assert.equal(snap('hackernews', { sourceUrl: 'https://news.ycombinator.com/item?id=42', metrics: { points: 120, comments: 30 } }).items[0].metrics.points, 120);
  assert.throws(() => snap('hackernews', { sourceUrl: 'https://news.ycombinator.com/item?id=42&x=1' }));
  assert.ok(snap('npm', { sourceUrl: 'https://www.npmjs.com/package/@scope/mcp-thing', run: 'mac', metrics: { downloads: 9 } }));
  assert.throws(() => snap('npm', { sourceUrl: 'https://www.npmjs.com/~someone' }));
  assert.ok(snap('docker', { sourceUrl: 'https://hub.docker.com/r/mcp/github', metrics: { pulls: 1, stars: 2 } }));
  assert.ok(snap('smithery', { sourceUrl: 'https://smithery.ai/servers/@acme/search', metrics: { uses: 10 } }));
  assert.ok(snap('reddit', { sourceUrl: 'https://www.reddit.com/r/mcp/comments/abc123/new_server/', author: 'r/mcp', summary: NOAH_COLLECTION_SOCIAL_SUMMARY.reddit }));
  assert.throws(() => snap('reddit', { sourceUrl: 'https://www.reddit.com/r/mcp/comments/abc123/', author: 'u/someone', summary: NOAH_COLLECTION_SOCIAL_SUMMARY.reddit }));
  assert.throws(() => snap('bluesky', { sourceUrl: 'https://bsky.app/profile/a.bsky.social/post/3kabcdefghij', author: '@a.bsky.social', summary: 'the post text' }));
  assert.throws(() => snap('github', { metrics: { downloads: 3 } }));
  assert.throws(() => snap('github', { familyId: 'mcp-registry:a/b' }), 'familyId only with run=phone');
  assert.ok(snap('mcp-registry', { sourceUrl: 'https://registry.modelcontextprotocol.io/v0.1/servers/a/versions/latest', run: 'phone', familyId: 'mcp-registry:a/b' }));
  assert.throws(() => snap('github', { run: 'anywhere' }));
});

/** 出所の合成の応答。URL の host と path で返す。 */
function sources({ readme = '- [acme/old-tool](https://github.com/acme/old-tool) 🐍 - Reads things.\n', etag = '"v1"' } = {}) {
  const calls = [];
  const state = { readme, etag };
  const fetcher = async (raw, init = {}) => {
    const url = new URL(raw); calls.push(url);
    assert.equal(init.redirect, 'manual');
    if (url.hostname === 'hn.algolia.com') return Response.json({ hits: url.searchParams.get('query') === 'MCP' ? [
      { objectID: '101', title: 'Show HN: Inbox MCP – read your mail', url: 'https://inbox.example.com/launch?ref=hn', points: 80, num_comments: 12, created_at_i: Math.floor((NOW - 3_600_000) / 1000) },
      { objectID: '102', title: 'Why MCP matters (essay)', url: 'https://blog.example.com/mcp', points: 300, num_comments: 99, created_at_i: Math.floor(NOW / 1000) },
      { objectID: '103', title: 'Acme agent', url: 'https://github.com/Acme/Agent', points: 5, num_comments: 0, created_at_i: Math.floor(NOW / 1000) },
    ] : [] });
    if (url.hostname === 'api.github.com') {
      // task 125 の「急に伸びた物」の検索（pushed:>=）は、tests/noah-scout.test.mjs で確かめる。ここでは空で返す。
      if (/pushed:>=/.test(url.searchParams.get('q'))) return Response.json({ items: [] });
      if (url.pathname === '/repos/sandbox-quantum/switch/releases/latest') {
        assert.equal(init.headers.Authorization, undefined);
        return Response.json({ name: 'Switch Console 0.41.1', tag_name: 'switch-console-v0.41.1',
          published_at: new Date(NOW - 4 * DAY).toISOString(), draft: false, prerelease: false,
          html_url: 'https://github.com/sandbox-quantum/switch/releases/tag/switch-console-v0.41.1',
          body: 'release body should not be republished' });
      }
      assert.match(url.searchParams.get('q'), /created:>=2026-11-08/);
      return Response.json({ items: [{ full_name: 'New/Server', name: 'server', description: 'A new MCP server', stargazers_count: 40, created_at: new Date(NOW - DAY).toISOString(), owner: { login: 'New' } }] });
    }
    if (url.hostname === 'www.producthunt.com') return new Response('<feed xmlns="http://www.w3.org/2005/Atom"></feed>');
    if (url.hostname === 'huggingface.co') return Response.json([{ id: 'maker/mcp-space', author: 'maker', likes: 3, createdAt: new Date(NOW - 2 * DAY).toISOString(), cardData: { title: 'MCP Space', short_description: '画像を作る' } }]);
    if (url.hostname === 'registry.npmjs.org') return Response.json({ objects: url.searchParams.get('from') === '0' && url.searchParams.get('text') === 'keywords:mcp-server' ? [{ package: { name: '@acme/mcp', description: 'Acme MCP', date: new Date(NOW - 5 * DAY).toISOString(), links: { repository: 'git+https://github.com/acme/mcp.git' }, publisher: { username: 'acme' } }, downloads: { weekly: 5000 } }] : [] });
    if (url.hostname === 'hub.docker.com') return Response.json({ results: [{ name: 'github', description: 'GitHub MCP', pull_count: 100000, star_count: 3, date_registered: new Date(NOW - 90 * DAY).toISOString() }, { name: 'signatures', pull_count: 9 }], next: 'https://hub.docker.com/v2/namespaces/mcp/repositories?page=2' });
    if (url.hostname === 'raw.githubusercontent.com') {
      if (url.pathname.startsWith('/jaw9c/')) return new Response('| Name | Category | URL | Authentication | Maintainer |\n|---|---|---|---|---|\n| Acme | Search | `https://mcp.acme.com/mcp` | OAuth2.1 | [Acme](https://acme.com) |\n', { headers: { etag: '"t1"' } });
      if (init.headers?.['If-None-Match'] === state.etag) return new Response(null, { status: 304 });
      return new Response(state.readme, { headers: { etag: state.etag } });
    }
    return new Response(null, { status: 404 });
  };
  return { fetcher, calls, state };
}

void test('feeds: each source is read on its own schedule, keeps no post text, and new lines in awesome lists are new while the first read is old', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'noah-feeds-')); let clock = NOW;
  const local = openCollectorStore(directory, { now: () => clock }); t.after(() => { local.close(); rmSync(directory, { recursive: true, force: true }); });
  const net = sources();
  const first = await collectFeeds({ local, fetcher: net.fetcher, now: () => clock });
  assert.equal(first.smithery.status, 'needs_credentials');
  for (const id of ['hackernews', 'github-mcp', 'github-releases', 'huggingface-mcp', 'npm', 'docker', 'awesome']) assert.equal(first[id].status, 'updated', id);
  const leads = feedLeads(local, clock), by = (id) => leads.find((lead) => lead.id === id);
  // Hacker News: Show HN と配布元のリンクだけ。題名は載せ、投稿の本文は無い。追跡の ?ref は落とす。
  assert.equal(by('hackernews:101').url, 'https://inbox.example.com/launch');
  assert.equal(by('hackernews:101').name, 'Inbox MCP – read your mail');
  assert.equal(by('hackernews:102'), undefined, 'an essay is not an agent');
  assert.equal(by('hackernews:103').url, 'https://github.com/acme/agent');
  assert.equal(by('github-mcp:new/server').createdAt, NOW - DAY);
  const release = by('github-release:sandbox-quantum/switch:switch-console-v0.41.1');
  assert.equal(release.url, 'https://github.com/sandbox-quantum/switch');
  assert.equal(release.run, 'mac');
  assert.equal(release.createdAt, NOW - 4 * DAY);
  assert.equal(release.expiresAt, NOW + 3 * DAY);
  assert.doesNotMatch(JSON.stringify(release), /release body should not/);
  const published = collectionSnapshots({ exported: { candidates: [], checks: [], families: [] }, discoveries: [],
    x: { status: 'needs_credentials', items: [] }, now: NOW,
    leads: [...leads, card({ id: 'github-rising:sandbox-quantum/switch', url: release.url, sourceUrl: release.url, createdAt: NOW, metrics: { stars: 4700 } })],
  }).find(snapshot => snapshot.source === 'github');
  const switchItems = published.items.filter(item => item.url === release.url);
  assert.equal(switchItems.length, 1);
  assert.equal(switchItems[0].sourceUrl, release.sourceUrl);
  assert.equal(switchItems[0].metrics.stars, 4700);
  assert.equal(by('huggingface-mcp:maker/mcp-space').run, 'space');
  assert.equal(by('npm:@acme/mcp').url, 'https://github.com/acme/mcp'); assert.equal(by('npm:@acme/mcp').metrics.downloads, 5000);
  assert.equal(by('npm:@acme/mcp').createdAt, NOW - 30 * DAY, 'the first npm search is not news either (its date is the last publish)');
  assert.equal(by('docker:mcp/github').run, 'mac'); assert.equal(by('docker:mcp/signatures'), undefined);
  assert.ok(!net.calls.some((url) => url.hostname === 'hub.docker.com' && url.searchParams.has('page')), 'anonymous Docker Hub reads only the first page');
  const old = leads.find((lead) => lead.url === 'https://github.com/acme/old-tool');
  assert.equal(old.createdAt, NOW - 30 * DAY, 'the first read of a list is not news');
  assert.equal(leads.find((lead) => lead.url === 'https://acme.com/').run, 'key');
  // 期限の来ていない出所は読まない。awesome 一覧は ETag が同じなら 304 で済む。
  const before = net.calls.length;
  const extend = () => local.sql.prepare('UPDATE _noah_collector_lock SET expires_at=?').run(clock + 180_000);
  clock += 31 * 60_000; extend();
  const second = await collectFeeds({ local, fetcher: net.fetcher, now: () => clock });
  assert.equal(second.hackernews.status, 'updated'); assert.equal(second.npm.status, 'not_due');
  assert.ok(net.calls.slice(before).every((url) => url.hostname === 'hn.algolia.com'));
  clock += 6 * 3_600_000; extend();
  net.state.readme += '- [fresh/tool](https://github.com/fresh/tool) - Brand new.\n'; net.state.etag = '"v2"';
  await collectFeeds({ local, fetcher: net.fetcher, now: () => clock });
  const added = feedLeads(local, clock).find((lead) => lead.url === 'https://github.com/fresh/tool');
  assert.equal(added.createdAt, clock, 'a line added later is new');
  assert.equal(feedLeads(local, clock).find((lead) => lead.url === 'https://github.com/acme/old-tool').createdAt, NOW - 30 * DAY);
});

void test('feeds: a failing source waits on its own, honours Retry-After, and does not stop the others', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'noah-feeds-fail-')); const clock = NOW;
  const local = openCollectorStore(directory, { now: () => clock }); t.after(() => { local.close(); rmSync(directory, { recursive: true, force: true }); });
  const net = sources();
  const fetcher = async (raw, init) => (new URL(raw).hostname === 'hn.algolia.com' ? new Response(null, { status: 429, headers: { 'retry-after': '7200' } }) : net.fetcher(raw, init));
  const result = await collectFeeds({ local, fetcher, now: () => clock });
  assert.equal(result.hackernews.status, 'rate_limited'); assert.equal(result.hackernews.nextAt, NOW + 7_200_000);
  assert.equal(result.docker.status, 'updated');
  const broken = await collectFeeds({ local: { ...local, sql: local.sql }, fetcher: async () => Response.json({ nope: true }), now: () => clock + 7_200_001 });
  assert.equal(broken.hackernews.status, 'invalid_response');
});

void test('parseAwesome: list lines lose badges and markup; anchors, awesome lists and glama links are skipped; remote tables keep their auth', () => {
  const lines = [
    '* [Remote Servers](#remote-servers)',
    '- [owner/tool](https://github.com/Owner/Tool) [![badge](https://glama.ai/b.svg)](https://glama.ai/x) 📇 ☁️ - Does **one** thing with [docs](https://x.example.com).',
    '- <img src="https://cdn.example.com/i.svg" height="14"/> [DuckDB](https://github.com/k/mcp-server-duckdb) - DuckDB database integration',
    '- **[Context 7](https://github.com/upstash/context7-mcp)** - Up-to-date docs',
    '- [Another list](https://github.com/someone/awesome-mcp)',
  ].join('\n');
  assert.deepEqual(parseAwesome(lines, 'list'), [
    { name: 'owner/tool', url: 'https://github.com/owner/tool', summary: 'Does one thing with docs.' },
    { name: 'DuckDB', url: 'https://github.com/k/mcp-server-duckdb', summary: 'DuckDB database integration' },
    { name: 'Context 7', url: 'https://github.com/upstash/context7-mcp', summary: 'Up-to-date docs' },
  ]);
  assert.equal(projectUrl('http://insecure.example.com'), null);
});

void test('snapshots: ranked inside each source, one card per project, X only with its own key, and Noah links only after the family is in the grid', () => {
  const exported = { families: [], candidates: [], checks: [] };
  const leads = [
    { ...card({ id: 'gh-1', name: 'One', url: 'https://github.com/a/one', createdAt: NOW - 10 * DAY, metrics: { stars: 5 } }) },
    { ...card({ id: 'gh-2', name: 'Two', url: 'https://github.com/a/two', createdAt: NOW, metrics: { stars: 5 } }) },
    { ...card({ id: 'gh-3', name: 'Two again', url: 'https://github.com/a/two', createdAt: NOW - DAY }) },
    { ...card({ id: 'gh-4', name: 'two', url: 'https://github.com/b/two-copy', createdAt: NOW - 2 * DAY }) },
    { ...card({ id: 'gh-5', name: 'Face Swap Studio', url: 'https://github.com/a/swap', createdAt: NOW }) },
    { ...card({ id: 'hn-1', source: 'hackernews', sourceUrl: 'https://news.ycombinator.com/item?id=9', createdAt: NOW, metrics: { points: 10 } }) },
  ];
  const x = { status: 'needs_credentials', items: [] };
  const snapshots = collectionSnapshots({ exported, discoveries: [], x, now: NOW, leads });
  assert.equal(snapshots.some((s) => s.source === 'x'), false, 'no key: the X snapshot is left as the Codex lane published it');
  const github = snapshots.find((s) => s.source === 'github');
  // 同じ配布元（gh-3）と、同じ名前の写し（gh-4）は 1 件に。成人向けの語に当たる物（gh-5）は載せない。
  assert.deepEqual(github.items.map((i) => i.id), ['gh-2', 'gh-1']);
  assert.equal(snapshots.find((s) => s.source === 'hackernews').items.length, 1);
  assert.ok(collectionSnapshots({ exported, discoveries: [], x: { status: 'updated', items: [] }, now: NOW, leads }).some((s) => s.source === 'x'));
});

void test('import: the collector signs, sends only changed families under a daily cap, delists failures, and the cards link to Noah only after that', async (t) => {
  const lookup = tool('lookup', true, { inputSchema: { type: 'object', required: ['q'], properties: { q: { type: 'string' } } } });
  const w = await world(t, { [hostOf(1)]: mcpServer({ tools: [lookup] }), [hostOf(2)]: mcpServer({ tools: [tool('read_thing')] }), [hostOf(3)]: mcpServer({ tools: [tool('other')] }) });
  const prod = fixture(t, w.net.fetch);
  // 「本番」の時計は、収集機が送った時刻に合わせる（翌日の取り込みも、署名の時刻の幅の中で受け付ける）。
  let clock = w.f.time();
  const api = createIntakeImportApi({ db: prod.db, now: () => clock, reviewers: [], authenticate: async () => { throw Error('UNAUTHORIZED'); }, collectorKey: KEY });
  let posts = 0;
  const fetcher = async (url, init) => { posts++; clock = Number(init.headers['x-noah-collector-time']); assert.equal(new URL(url).href, `${ORIGIN}/api/noah/intake/import`); return api(new Request(url, init)); };
  const local = { sql: w.f.sql, db: w.f.db, assertLease() {} };
  const listed = async () => (await prod.store.list(null, new URLSearchParams())).items.map((item) => item.id).sort();
  // 日の上限が 2 の時は、2 つだけ入れて、残りは次の日。
  const first = await importFamilies({ local, origin: ORIGIN, key: KEY, fetcher, now: w.f.time, limits: { familiesPerDay: 2, familiesPerRun: 5 } });
  assert.equal(first.sent, 2); assert.equal(first.status, 'more'); assert.ok(first.rowsWritten > 0);
  assert.equal((await importFamilies({ local, origin: ORIGIN, key: KEY, fetcher, now: w.f.time, limits: { familiesPerDay: 2, familiesPerRun: 5 } })).status, 'daily_limit');
  const tomorrow = () => w.f.time() + 86_400_000;
  const rest = await importFamilies({ local, origin: ORIGIN, key: KEY, fetcher, now: tomorrow });
  assert.equal(rest.sent, 1);
  assert.deepEqual(await listed(), [familyId(1), familyId(2), familyId(3)]);
  assert.deepEqual([...importedFamilies(w.f.sql)].sort((a, b) => a.localeCompare(b)), [familyId(1), familyId(2), familyId(3)]);
  // 変わっていなければ送らない。
  const count = posts;
  assert.equal((await importFamilies({ local, origin: ORIGIN, key: KEY, fetcher, now: tomorrow })).sent, 0); assert.equal(posts, count);
  // 手元で握手が通らなくなった系列は、今の行を送って、本番でも載せない。
  w.f.sql.prepare("UPDATE noah_intake_checks SET level=0,result='unreachable',checked_at=? WHERE candidate_id=?").run(tomorrow() + 1000, familyId(3));
  w.f.sql.prepare('UPDATE noah_intake_families SET listed=0,level=0 WHERE id=?').run(familyId(3));
  const delisted = await importFamilies({ local, origin: ORIGIN, key: KEY, fetcher, now: () => tomorrow() + 2000 });
  assert.equal(delisted.sent, 1);
  assert.deepEqual(await listed(), [familyId(1), familyId(2)]);
  assert.equal(importedFamilies(w.f.sql).has(familyId(3)), false);
  // 紹介のカードは、入れ終えた系列だけ「スマホで今すぐ」で、詳細へつなぐ。
  const exported = await noahIntakeExport(w.f.db, w.f.time());
  const snapshots = collectionSnapshots({ exported, discoveries: [], x: { status: 'needs_credentials', items: [] }, now: tomorrow() + 3000, sent: importedFamilies(w.f.sql) });
  const registry = snapshots.find((s) => s.source === 'mcp-registry').items;
  assert.ok(registry.length >= 2 && registry.every((item) => item.run === 'phone' && item.familyId));
});

void test('import endpoint: a forged or replayed collection signature is refused; a browser post with a signature stays on the reviewer path', async (t) => {
  const prod = fixture(t, async () => new Response(null, { status: 404 }));
  const api = createIntakeImportApi({ db: prod.db, now: () => NOW, reviewers: ['reviewer'], authenticate: async () => { throw Error('UNAUTHORIZED'); }, collectorKey: KEY });
  const { collectionSignature, NOAH_COLLECTION_PATH } = await import('../lib/noah-collection.ts');
  const body = JSON.stringify({ schema: 'noah-intake-import/1', exportedAt: NOW, families: [], candidates: [], checks: [] });
  const send = async (signature, headers = {}) => (await api(new Request(`${ORIGIN}/api/noah/intake/import`, { method: 'POST', body, headers: { 'Content-Type': 'application/json', 'x-noah-collector-time': String(NOW), 'x-noah-collector-signature': signature, ...headers } }))).status;
  assert.equal(await send(await collectionSignature(KEY, String(NOW), body, NOAH_COLLECTION_PATH)), 401, 'a publication signature is bound to its own path');
  assert.equal(await send('0'.repeat(64)), 401);
  assert.equal(await send(await collectionSignature(KEY, String(NOW), body, '/api/noah/intake/import')), 400, 'signed but empty: the import rules still apply');
  assert.equal(await send(await collectionSignature(KEY, String(NOW), body, '/api/noah/intake/import'), { Origin: ORIGIN }), 401, 'with an Origin it is a browser: sign in as a reviewer');
  const closed = createIntakeImportApi({ db: prod.db, now: () => NOW, reviewers: [], authenticate: async () => 'x' });
  assert.equal((await closed(new Request(`${ORIGIN}/api/noah/intake/import`, { method: 'POST', body, headers: { 'Content-Type': 'application/json', 'x-noah-collector-time': String(NOW), 'x-noah-collector-signature': 'a'.repeat(64) } }))).status, 503);
});

void test('social lane: Codex hands over links only; post text, user names and stale posts are refused; X keeps one day, Reddit three', async (t) => {
  const ok = socialLead({ source: 'reddit', post: 'https://old.reddit.com/r/mcp/comments/abc123/my_new_server/?utm=1', project: 'https://github.com/Maker/Server', author: 'u/someone', postedAt: new Date(NOW - DAY).toISOString(), metrics: { upvotes: 40, comments: 3 } }, NOW);
  assert.equal(ok.item.sourceUrl, 'https://www.reddit.com/r/mcp/comments/abc123/my_new_server/');
  assert.equal(ok.item.author, 'r/mcp'); assert.equal(ok.item.url, 'https://github.com/maker/server'); assert.equal(ok.item.summary, NOAH_COLLECTION_SOCIAL_SUMMARY.reddit);
  assert.equal(socialLead({ source: 'x', post: 'https://x.com/maker/status/1', project: 'https://github.com/a/b', postedAt: new Date(NOW - 2 * DAY).toISOString() }, NOW).error, 'too_old');
  assert.equal(socialLead({ source: 'x', post: 'https://x.com/maker/status/1', project: 'https://x.com/maker', postedAt: new Date(NOW).toISOString() }, NOW).error, 'project');
  assert.equal(socialLead({ source: 'bluesky', post: 'https://bsky.app/profile/a.bsky.social/post/3kabcdefghij', project: 'https://github.com/a/b', postedAt: new Date(NOW).toISOString(), text: 'ignored' }, NOW).item.author, '@a.bsky.social');
  assert.equal(socialLead({ source: 'x', post: 'https://x.com/maker/status/1', project: 'https://github.com/a/b', postedAt: new Date(NOW).toISOString(), metrics: { views: 9 } }, NOW).error, 'metrics');
  const directory = mkdtempSync(join(tmpdir(), 'noah-social-')); t.after(() => rmSync(directory, { recursive: true, force: true }));
  const file = join(directory, 'leads.json');
  writeFileSync(file, JSON.stringify({ leads: [
    { source: 'reddit', post: 'https://www.reddit.com/r/LocalLLaMA/comments/xyz789/', project: 'https://github.com/a/b', postedAt: new Date(NOW - 3_600_000).toISOString(), metrics: { upvotes: 12 } },
    { source: 'x', post: 'https://twitter.com/maker/status/123456', project: 'https://huggingface.co/spaces/maker/demo', postedAt: new Date(NOW - 60_000).toISOString(), metrics: { likes: 3, reposts: 1 } },
    { source: 'x', post: 'not a url', project: 'https://github.com/a/b', postedAt: new Date(NOW).toISOString() },
  ] }));
  const dry = await runSocial({ file, directory, dryRun: true, now: () => NOW });
  assert.deepEqual([dry.accepted, dry.rejected, dry.counts], [2, { post: 1 }, { x: 1, reddit: 1 }]);
  const store = new Map();
  const bucket = { async get(key) { const row = store.get(key); return row ? { etag: row.etag, json: async () => JSON.parse(row.text) } : null; }, async put(key, text) { store.set(key, { etag: String(store.size + 1), text }); return {}; } };
  const api = createCollectionApi({ bucket, key: KEY, now: () => NOW });
  const published = await runSocial({ file, directory, publish: 'https://avoado.si', key: KEY, now: () => NOW, fetcher: (url, init) => api(new Request(url, init)) });
  assert.deepEqual(published.published.map((p) => p.source).sort((a, b) => a.localeCompare(b)), ['reddit', 'x']);
  const view = await (await api(new Request('https://avoado.si/api/noah/collection?source=reddit'))).json();
  assert.equal(view.items[0].author, 'r/LocalLLaMA'); assert.equal(view.items[0].sources[0].metrics.upvotes, 12);
});

void test('grid: among agents without a record yet, newly handshaken and one-tap ones come first', async (t) => {
  const { createNoahPinsApi } = await import('../lib/noah-pins-api.ts');
  const { parseNoahFlags } = await import('../lib/noah-flags.ts');
  const servers = Object.fromEntries([1, 2, 3].map((i) => [hostOf(i), mcpServer({ tools: [tool('lookup')] })]));
  const w = await world(t, servers);
  const base = w.f.time();
  // 1: 古い・押すだけで頼める。2: 新しい・押すだけでない。3: 2 日前・押すだけ（3 日分の加点で、2 より上）。
  for (const [i, l1, oneTap] of [[1, base - 10 * DAY, 1], [2, base, 0], [3, base - 2 * DAY, 1]]) {
    w.f.sql.prepare('UPDATE noah_intake_checks SET l1_at=? WHERE candidate_id=?').run(l1, familyId(i));
    w.f.sql.prepare('UPDATE noah_intake_families SET one_tap=?, shuffle=? WHERE id=?').run(oneTap, 999 - i, familyId(i));
  }
  const api = createNoahPinsApi({ db: w.f.db, now: w.f.time, reviewers: [], flags: parseNoahFlags({ NOAH_INTAKE_PUBLIC: 'true' }), authenticate: async () => { throw Error('UNAUTHORIZED'); } });
  const page = await (await api(new Request(`${ORIGIN}/api/noah/pins`))).json();
  const order = page.items.map((item) => item.id).filter((id) => [1, 2, 3].map(familyId).includes(id));
  assert.deepEqual(order, [familyId(3), familyId(2), familyId(1)]);
});

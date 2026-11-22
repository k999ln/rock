// task 125: Noah が自分で拾えなかった Switch（sandbox-quantum/switch）への直し。
// 1) GitHub は Agent の道具（複数の Agent の連携・Claude Code・Codex）も読み、作られたのが前でも急に伸びた物を拾う。
// 2) Product Hunt の公開フィードから、Agent・AI の道具だけを拾う（作った人の名前は載せない）。
// 3) Codex の Luna Max が X の投稿から配布元まで読んで日本語で書いた理解を、「Noahが読んだ」として受け取り、カードの説明の先頭に出す。
// 4) 本番がまだ知らない新しい出所の 400 は、失敗にしない（配備より先に収集機が動いても、他の出所の掲載は止まらない）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { noahCollectionCards, parseCollectionSnapshot } from '../lib/noah-collection.ts';
import { createCollectionApi } from '../lib/noah-collection-api.ts';
import { openCollectorStore } from '../scripts/noah-collector-store.mjs';
import { GITHUB_AGENT_TOPICS, GITHUB_RISING, collectFeeds, feedLeads, githubRisingRate, parseProductHunt } from '../scripts/noah-collector-feeds.mjs';
import { collectionSnapshots, publishCollection } from '../scripts/noah-collector-publish.mjs';
import { runSocial, socialLead } from '../scripts/noah-collector-social.mjs';

const NOW = Date.UTC(2026, 10, 22, 12), HOUR = 3_600_000, DAY = 24 * HOUR, KEY = randomBytes(32).toString('hex');

const PH_FEED = `<?xml version="1.0" encoding="UTF-8"?>
<feed xml:lang="en-US" xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <id>tag:www.producthunt.com,2005:Post/1001</id>
    <published>2026-11-21T09:00:00-08:00</published>
    <link rel="alternate" type="text/html" href="https://www.producthunt.com/products/switch-agents"/>
    <title>Switch Buddy &amp; Rooms</title>
    <content type="html">&lt;p&gt;
            Claude Code writes, Codex reviews: multi-agent rooms in Slack
          &lt;/p&gt;
          &lt;p&gt;&lt;a href="https://www.producthunt.com/r/p/1001?app_id=339"&gt;Link&lt;/a&gt;&lt;/p&gt;</content>
    <author><name>A Maker Person</name></author>
  </entry>
  <entry>
    <id>tag:www.producthunt.com,2005:Post/1002</id>
    <published>2026-11-21T10:00:00-08:00</published>
    <link rel="alternate" type="text/html" href="https://www.producthunt.com/products/copy-haste"/>
    <title>Copy Haste</title>
    <content type="html">&lt;p&gt;Your clipboard, sorted into Text, Code, Links&lt;/p&gt;</content>
  </entry>
  <entry>
    <id>tag:www.producthunt.com,2005:Post/1003</id>
    <link rel="alternate" type="text/html" href="https://evil.example.com/products/x"/>
    <title>Agent from elsewhere</title>
  </entry>
</feed>`;

/** 合成の GitHub（急に伸びた物の検索）と Product Hunt。stars は repo ごとの今のスターの数。 */
function network(stars) {
  const calls = [];
  const fetcher = async (raw, init = {}) => {
    const url = new URL(raw); calls.push(url);
    assert.equal(init.redirect, 'manual');
    if (url.hostname === 'api.github.com') {
      const q = url.searchParams.get('q');
      if (!/pushed:>=/.test(q)) return Response.json({ items: [] });
      assert.match(q, /stars:>=300/);
      if (!q.startsWith('topic:multi-agent')) return Response.json({ items: [] });
      return Response.json({ items: Object.entries(stars).map(([full, count]) => ({ full_name: full, name: full.split('/')[1], description: `${full} description`, stargazers_count: count, created_at: '2025-06-01T00:00:00Z', owner: { login: full.split('/')[0] } })) });
    }
    if (url.hostname === 'www.producthunt.com') return new Response(PH_FEED, { headers: { 'content-type': 'application/atom+xml' } });
    return Response.json([], { status: 200 });
  };
  return { fetcher, calls };
}

void test('rising rate: needs a count at least 6 hours old, 50 a day and 2% of the total; steady giants and first sightings are not rising', () => {
  assert.equal(githubRisingRate([], 5000, NOW), null, 'first sighting: nothing to compare with');
  assert.equal(githubRisingRate([[NOW - HOUR, 4000]], 5000, NOW), null, 'a count from an hour ago is too close');
  assert.equal(githubRisingRate([[NOW - 3 * DAY, 1000]], 5000, NOW), null, 'a count older than two days is not used');
  assert.equal(githubRisingRate([[NOW - DAY, 4500]], 4700, NOW), 200, 'Switch-like: +200 a day on 4,700');
  assert.equal(githubRisingRate([[NOW - DAY, 100_000]], 100_300, NOW), null, 'a giant gaining 0.3% a day is steady, not rising');
  assert.equal(githubRisingRate([[NOW - DAY, 900]], 940, NOW), null, 'under 50 a day');
  assert.ok(GITHUB_AGENT_TOPICS.includes('topic:multi-agent') && GITHUB_AGENT_TOPICS.includes('topic:claude-code') && GITHUB_AGENT_TOPICS.includes('topic:codex'));
});

void test('feeds: an older repo that suddenly grows is picked up on the next read, dated when Noah first saw it rising; Product Hunt keeps agent tools only', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'noah-scout-')); let clock = NOW;
  const local = openCollectorStore(directory, { now: () => clock }); t.after(() => { local.close(); rmSync(directory, { recursive: true, force: true }); });
  const extend = () => local.sql.prepare('UPDATE _noah_collector_lock SET expires_at=?').run(clock + 180_000);
  const stars = { 'sandbox-quantum/switch': 4500, 'big/framework': 100_000 };
  const net = network(stars);
  const first = await collectFeeds({ local, fetcher: net.fetcher, now: () => clock });
  assert.equal(first['github-rising'].status, 'updated'); assert.equal(first['github-rising'].collected, 0, 'first read only records the counts');
  assert.equal(first.producthunt.status, 'updated');
  const ph = feedLeads(local, clock).filter((lead) => lead.source === 'producthunt');
  assert.deepEqual(ph.map((lead) => lead.id), ['producthunt:1001'], 'the clipboard app is not an agent tool; a link outside Product Hunt is dropped');
  assert.equal(ph[0].name, 'Switch Buddy & Rooms'); assert.equal(ph[0].author, 'Product Hunt', 'the maker\'s personal name is not kept');
  assert.equal(ph[0].summary, 'Claude Code writes, Codex reviews: multi-agent rooms in Slack');
  assert.equal(ph[0].url, 'https://www.producthunt.com/products/switch-agents');
  assert.equal(ph[0].createdAt, Date.parse('2026-11-21T09:00:00-08:00'));
  // 6 時間後: Switch は +60（1 日あたり 240・全体の 5%）、定番は +75（1 日あたり 300・0.3%）。
  clock += 6 * HOUR; extend(); stars['sandbox-quantum/switch'] = 4560; stars['big/framework'] = 100_075;
  const second = await collectFeeds({ local, fetcher: net.fetcher, now: () => clock });
  assert.equal(second['github-rising'].collected, 1);
  const rising = feedLeads(local, clock).filter((lead) => lead.id.startsWith('github-rising:'));
  assert.deepEqual(rising.map((lead) => lead.id), ['github-rising:sandbox-quantum/switch']);
  assert.equal(rising[0].url, 'https://github.com/sandbox-quantum/switch'); assert.equal(rising[0].createdAt, clock, 'dated when Noah first saw it rising, not when the repo was made');
  assert.equal(rising[0].metrics.stars, 4560);
  // 次の回も伸びていれば、出た時は最初に確かめた時のまま（毎回「今」にならない）。
  const seenAt = clock;
  clock += 6 * HOUR; extend(); stars['sandbox-quantum/switch'] = 4700;
  await collectFeeds({ local, fetcher: net.fetcher, now: () => clock });
  assert.equal(feedLeads(local, clock).find((lead) => lead.id === 'github-rising:sandbox-quantum/switch').createdAt, seenAt);
  // 載せる時は GitHub の出所の中で、作られた時より新しい「伸びた時」の紹介が上に来る。
  const snapshots = collectionSnapshots({ exported: { families: [], candidates: [], checks: [] }, discoveries: [], x: { status: 'needs_credentials', items: [] }, now: clock, leads: feedLeads(local, clock) });
  assert.equal(snapshots.find((s) => s.source === 'github').items[0].id, 'github-rising:sandbox-quantum/switch');
  assert.equal(snapshots.find((s) => s.source === 'producthunt').items.length, 1);
  // 状態は際限なく育たない（検索に出ず、2 日より古い記録は忘れる）。
  const state = JSON.parse(local.sql.prepare("SELECT state_json FROM _noah_collector_feeds WHERE id='github-rising'").get().state_json);
  assert.ok(state.stars['sandbox-quantum/switch'].length <= GITHUB_RISING.points);
});

void test('parseProductHunt: entities decoded, only the first paragraph, no redirect links', () => {
  const [first] = parseProductHunt(PH_FEED);
  assert.equal(first.name, 'Switch Buddy & Rooms');
  assert.ok(!first.summary.includes('Link') && !first.summary.includes('<'));
  assert.equal(parseProductHunt(PH_FEED).length, 2);
});

void test('contract: Product Hunt sources must be Product Hunt pages; Noah-read sources may be any public page but no query or fragment', () => {
  const item = (source, fields) => ({ id: `${source}:1`, source, name: 'Switch', summary: '説明', author: 'Product Hunt', url: 'https://github.com/sandbox-quantum/switch', sourceUrl: 'https://www.producthunt.com/products/switch-agents', observedAt: NOW, expiresAt: NOW + DAY, ...fields });
  const snap = (source, fields) => parseCollectionSnapshot({ schema: 'noah-collection/1', source, collectedAt: NOW, items: [item(source, fields)] }, NOW);
  assert.equal(snap('producthunt', {}).items.length, 1);
  assert.throws(() => snap('producthunt', { sourceUrl: 'https://example.com/products/switch' }));
  assert.equal(snap('noah-read', { sourceUrl: 'https://docs.switchagents.ai/switch-rooms/getting-started' }).items.length, 1);
  assert.throws(() => snap('noah-read', { sourceUrl: 'https://docs.switchagents.ai/a?utm_source=x' }));
});

void test('social lane: what Codex understood from the maker\'s own page becomes a Japanese Noah-read card that leads the merged card', async (t) => {
  const lead = {
    source: 'x', post: 'https://x.com/Claude_Digest/status/1991234567890', project: 'https://github.com/sandbox-quantum/switch', postedAt: new Date(NOW - 2 * HOUR).toISOString(), metrics: { likes: 120, reposts: 30 },
    understanding: { name: 'Switch', maker: 'SandboxAQ', page: 'https://github.com/sandbox-quantum/switch', run: 'mac',
      summary: 'Slack や Telegram のチャンネルを「部屋」にして、Claude Code や Codex など複数の AI と人が同じ会話で働けるようにする無料公開のソフト。Mac のアプリと自分のサーバーで動く。使用許諾に Commons Clause が付き、Switch を動かす事自体を有料で売る事はできない。' },
  };
  const ok = socialLead(lead, NOW);
  assert.equal(ok.item.source, 'x'); assert.equal(ok.read.source, 'noah-read');
  assert.equal(ok.read.author, 'SandboxAQ'); assert.equal(ok.read.run, 'mac'); assert.equal(ok.read.createdAt, NOW - 2 * HOUR);
  assert.equal(ok.read.expiresAt, NOW + 7 * DAY, 'the understanding outlives the one-day X link');
  assert.equal(socialLead({ ...lead, understanding: { ...lead.understanding, summary: 'An English copy of the post' } }, NOW).error, 'understanding', 'the understanding must be written in Japanese');
  assert.equal(socialLead({ ...lead, understanding: { ...lead.understanding, run: 'phone' } }, NOW).error, 'understanding_run', 'only Noah\'s own grid can say "on your phone now"');
  assert.equal(socialLead({ ...lead, understanding: { ...lead.understanding, page: 'http://insecure.example.com' } }, NOW).error, 'understanding_page');
  // 同じ配布元の GitHub の紹介（英語の説明）と 1 枚にまとまり、説明は「Noahが読んだ」の日本語が先に出る。
  const github = { id: 'github-rising:sandbox-quantum/switch', source: 'github', name: 'switch', summary: 'Open-source AI teammates', author: 'sandbox-quantum', url: 'https://github.com/sandbox-quantum/switch', sourceUrl: 'https://github.com/sandbox-quantum/switch', observedAt: NOW, expiresAt: NOW + DAY, createdAt: NOW - HOUR, metrics: { stars: 4700 } };
  const [merged] = noahCollectionCards([github, ok.item, ok.read]);
  assert.equal(merged.summary, lead.understanding.summary); assert.equal(merged.run, 'mac');
  assert.deepEqual(merged.sources.map((s) => s.source), ['noah-read', 'github', 'x']);
  // 掲載: 「Noahが読んだ」も出所ごとのスナップショットで送る。
  const directory = mkdtempSync(join(tmpdir(), 'noah-scout-social-')); t.after(() => rmSync(directory, { recursive: true, force: true }));
  const file = join(directory, 'leads.json'); writeFileSync(file, JSON.stringify({ leads: [lead] }));
  const store = new Map();
  const bucket = { async get(key) { const row = store.get(key); return row ? { etag: row.etag, json: async () => JSON.parse(row.text) } : null; }, async put(key, text) { store.set(key, { etag: String(store.size + 1), text }); return {}; } };
  const api = createCollectionApi({ bucket, key: KEY, now: () => NOW });
  const published = await runSocial({ file, directory, publish: 'https://avoado.si', key: KEY, now: () => NOW, fetcher: (url, init) => api(new Request(url, init)) });
  assert.deepEqual(published.published.map((p) => p.source).sort((a, b) => a.localeCompare(b)), ['noah-read', 'x']);
  const view = await (await api(new Request('https://avoado.si/api/noah/collection?source=noah-read'))).json();
  assert.equal(view.items[0].summary, lead.understanding.summary);
});

void test('publish: a 400 for a source production does not know yet is "not ready", not a failure; a 400 for an old source still fails', async () => {
  const snapshot = (source) => ({ schema: 'noah-collection/1', source, collectedAt: NOW, items: [] });
  const fetcher = async (url, init) => (JSON.parse(init.body).source === 'github' ? new Response('{}', { status: 200 }) : new Response('{"error":"collection_invalid"}', { status: 400 }));
  const results = await publishCollection({ snapshots: [snapshot('producthunt'), snapshot('github'), snapshot('noah-read')], origin: 'https://avoado.si', key: KEY, fetcher, now: () => NOW });
  assert.deepEqual(results, [{ source: 'producthunt', status: 'not_ready' }, { source: 'github', items: 0 }, { source: 'noah-read', status: 'not_ready' }]);
  await assert.rejects(publishCollection({ snapshots: [snapshot('hackernews')], origin: 'https://avoado.si', key: KEY, fetcher, now: () => NOW }), /collector_publish_http_400/);
});

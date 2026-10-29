import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parsePublicRss,
  fetchPublicNews,
  publicNewsFeeds,
} from '../lib/public-news-provider.ts';
import { newsTimestampLabel } from '../lib/eve-news-feed.ts';
const now = Date.parse('2026-10-29T12:00:00Z');
const item = (
  link = 'https://www.bbc.com/news/articles/test',
  date = 'Thu, 29 Oct 2026 11:00:00 GMT',
) =>
  `<item><title><![CDATA[Research &amp; discovery]]></title><link>${link}</link><pubDate>${date}</pubDate></item>`;
const rss = (body) => `<rss version="2.0"><channel>${body}</channel></rss>`;
void test('RSS preserves original headline, source and publication time; discards unsafe, duplicate and stale links', () => {
  const articles = parsePublicRss(
    rss(
      item() +
        item() +
        item('https://evil.example/story') +
        item('javascript:alert(1)') +
        item('https://www.bbc.com/old', 'Thu, 01 Oct 2026 11:00:00 GMT') +
        item('https://www.bbc.com/future', 'Fri, 30 Oct 2026 11:00:00 GMT'),
    ),
    publicNewsFeeds('world')[0],
    now,
  );
  assert.equal(articles.length, 1);
  assert.equal(articles[0].title, 'Research & discovery');
  assert.equal(articles[0].seenAt, '2026-10-29T11:00:00.000Z');
  assert.equal(newsTimestampLabel(articles[0]), '配信日時');
  assert.equal(newsTimestampLabel({}), 'GDELT検出');
});
void test('RSS refuses external entities, oversized bodies and unapproved feed origins', () => {
  assert.throws(() =>
    parsePublicRss(
      '<!DOCTYPE rss [<!ENTITY x SYSTEM "file:///secret">]>' + rss(item()),
      publicNewsFeeds()[0],
      now,
    ),
  );
  assert.throws(() =>
    parsePublicRss('x'.repeat(512001), publicNewsFeeds()[0], now),
  );
  assert.throws(() =>
    parsePublicRss(rss(item()), 'https://evil.example/rss', now),
  );
  assert.throws(() => publicNewsFeeds('constructor'));
});
void test('independent RSS recovers a provider outage without calling GDELT or inventing stories', async () => {
  const calls = [];
  const result = await fetchPublicNews(
    'world',
    async (url) => {
      calls.push(url);
      if (url.includes('bbci')) throw Error('offline');
      return new Response(rss(item('https://www.theguardian.com/world/test')));
    },
    now,
  );
  assert.equal(result.articles.length, 1);
  assert.equal(result.source, 'Publisher RSS');
  assert.equal(calls.length, 2);
});
void test('when RSS is unavailable GDELT remains a real secondary source', async () => {
  const result = await fetchPublicNews(
    'science',
    async (url) =>
      url.includes('gdelt')
        ? Response.json({
            articles: [
              {
                url: 'https://science.example/story',
                title: 'Discovery',
                seendate: '20261029T110000Z',
              },
            ],
          })
        : new Response('unavailable', { status: 503 }),
    now,
  );
  assert.equal(result.source, 'GDELT DOC 2.0');
  assert.equal(result.articles.length, 1);
  assert.equal(newsTimestampLabel(result.articles[0]), 'GDELT検出');
});
void test('all-source failure stays a failure, with no fabricated successful empty feed', async () => {
  await assert.rejects(
    fetchPublicNews(
      'all',
      async () => new Response('no', { status: 503 }),
      now,
    ),
    /unavailable/,
  );
});
void test('a very large streamed RSS is bounded before parsing', async () => {
  await assert.rejects(
    fetchPublicNews(
      'all',
      async (url) =>
        url.includes('gdelt')
          ? new Response('no', { status: 503 })
          : new Response('x'.repeat(512001)),
      now,
    ),
  );
});

void test('edge-compatible requests reject redirects without following a new origin', async () => {
  await assert.rejects(
    fetchPublicNews(
      'all',
      async (url, init) => {
        if (!url.includes('gdelt')) {
          assert.equal(init.redirect, 'manual');
          return new Response('', {
            status: 302,
            headers: { Location: 'https://evil.example/rss' },
          });
        }
        return new Response('', { status: 503 });
      },
      now,
    ),
  );
});

void test('a valid feed with no matching game headlines is distinct from an outage', async () => {
  const result = await fetchPublicNews(
    'games',
    async (url) =>
      url.includes('bbci')
        ? new Response(rss(item()))
        : new Response('no', { status: 503 }),
    now,
  );
  assert.deepEqual(result.articles, []);
  assert.equal(result.selection, 'headline-keywords');
});

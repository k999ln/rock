import test from 'node:test';
import assert from 'node:assert/strict';
import {
  gdeltNewsUrl,
  parseGdeltArticles,
  cachedNewsForTopic,
} from '../lib/eve-news-feed.ts';

void test('uses a fixed public metadata query with date ordering', () => {
  const url = new URL(gdeltNewsUrl());
  assert.equal(url.hostname, 'api.gdeltproject.org');
  assert.equal(url.searchParams.get('sort'), 'datedesc');
  assert.equal(url.searchParams.get('mode'), 'artlist');
});

void test('keeps valid source titles and timestamps, drops duplicates and unsafe URLs', () => {
  const article = {
    url: 'https://publisher.example/story',
    title: '議会の採決を延期',
    seendate: '20261021T104500Z',
    language: 'Japanese',
    sourcecountry: 'Japan',
  };
  const result = parseGdeltArticles({
    articles: [
      article,
      article,
      { ...article, url: 'javascript:alert(1)' },
      { ...article, url: 'http://publisher.example/other' },
    ],
  });
  assert.equal(result.length, 1);
  assert.equal(result[0].seenAt, '2026-10-21T10:45:00Z');
  assert.equal(result[0].publisher, 'publisher.example');
});

void test('drops obvious profile pages and dated archives outside the recent window', () => {
  const year = new Date().getUTCFullYear();
  const base = { title: 'Story', seendate: '20261021T104500Z' };
  const result = parseGdeltArticles({
    articles: [
      { ...base, url: 'https://publisher.example/by/writer' },
      { ...base, url: 'https://publisher.example/2012/04/15/old-story' },
      { ...base, url: `https://publisher.example/${year}/10/21/story` },
    ],
  });
  assert.equal(result.length, 1);
});

void test('rejects a malformed provider response instead of inventing news', () => {
  assert.throws(
    () => parseGdeltArticles({ error: 'rate limit' }),
    /invalid article list/,
  );
});

void test('offline topic recovery selects actual article titles without inventing replacements', () => {
  const articles = [
    { id: 'tech', title: 'AI hardware research', url: 'https://a.example/t' },
    { id: 'game', title: 'Next Mass Effect game', url: 'https://b.example/g' },
  ];
  assert.deepEqual(
    cachedNewsForTopic(articles, 'technology').map((a) => a.id),
    ['tech'],
  );
  assert.deepEqual(
    cachedNewsForTopic(articles, 'games').map((a) => a.id),
    ['game'],
  );
  assert.deepEqual(cachedNewsForTopic(articles, 'all'), articles);
  assert.deepEqual(cachedNewsForTopic(articles, 'constructor'), []);
  assert.deepEqual(cachedNewsForTopic([], 'games'), []);
});

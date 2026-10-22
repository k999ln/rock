import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  rankFeed,
  appendFeed,
  feedTerms,
  feedPollDelay,
  mergeFeedBuffer,
  shouldRevealFeedUpdates,
} from '../lib/sky-continuous-ranking.ts';
import { mergeNewsCandidates } from '../lib/sky-continuous-news.ts';
const now = 1_800_000_000_000;
const candidate = (key, extra = {}) => ({
  key,
  source: key,
  text: 'robotics science',
  createdAt: now - 60_000,
  ...extra,
});
void test('Japanese related terms match across sentences rather than requiring an entire identical sentence', () => {
  const interests = feedTerms('ローカルモデルでゲームを作る');
  assert.ok(interests.includes('ゲーム'));
  const result = rankFeed(
    [
      candidate('unrelated', { text: '今日の天気' }),
      candidate('related', { text: 'ゲーム制作の新しいツールを公開しました' }),
    ],
    { now, interests },
  );
  assert.equal(result[0].item.key, 'related');
});
void test('full receive buffer admits fresh rows and pins the reading window, with bounded memory', () => {
  const previous = Array.from({ length: 200 }, (_, n) =>
    candidate('old-' + n, { createdAt: now - n }),
  );
  const incoming = Array.from({ length: 200 }, (_, n) =>
    candidate('new-' + n, { createdAt: now + 1000 + n }),
  );
  const result = mergeFeedBuffer(
    previous,
    incoming,
    previous.map((item) => item.key),
  );
  assert.equal(result.length, 400);
  assert.equal(result[0].key, 'new-199');
  assert.equal(
    result.filter((item) => item.key.startsWith('new-')).length,
    200,
  );
  assert.equal(new Set(result.map((item) => item.key)).size, 400);
  const released = mergeFeedBuffer(
    result,
    [],
    incoming.map((item) => item.key),
  );
  assert.equal(released.length, 200);
});
void test('existing news updates replace metadata, and late arrivals remain discoverable without fabricated dates', () => {
  const article = (id, delta = 0) => ({
    id,
    title: id,
    url: 'https://fixtures.invalid/' + id,
    publisher: 'fixtures.invalid',
    seenAt: new Date(now + delta).toISOString(),
    language: 'English',
    sourceCountry: 'unknown',
  });
  const first = mergeNewsCandidates(
    null,
    {
      articles: [article('old')],
      fetchedAt: new Date(now).toISOString(),
      stale: true,
    },
    [],
  );
  assert.deepEqual(first.arrivedKeys, []);
  const next = mergeNewsCandidates(
    first,
    {
      articles: [article('late', -60_000)],
      fetchedAt: new Date(now + 1000).toISOString(),
      stale: false,
    },
    ['news:old'],
  );
  assert.deepEqual(next.arrivedKeys, ['news:late']);
  assert.deepEqual(next.staleKeys, ['old']);
  assert.equal(
    next.articles.find((item) => item.id === 'late').seenAt,
    article('late', -60_000).seenAt,
  );
  const repeated = mergeNewsCandidates(
    next,
    {
      ...next,
      articles: [{ ...article('late', -60_000), title: 'Corrected title' }],
    },
    ['news:old'],
  );
  assert.equal(repeated.articles.length, 2);
  assert.equal(
    repeated.articles.find((item) => item.id === 'late').title,
    'Corrected title',
  );
  assert.deepEqual(repeated.arrivedKeys, ['news:late']);
});
void test('news can continue receiving through repeated full windows without growing memory', () => {
  let state = null;
  for (let batch = 0; batch < 30; batch++) {
    const articles = Array.from({ length: 80 }, (_, i) => ({
      id: `article-${batch}-${i}`,
      title: 'Real source fixture',
      url: `https://fixtures.invalid/${batch}/${i}`,
      publisher: 'fixtures.invalid',
      seenAt: new Date(now + (batch * 80 + i) * 1000).toISOString(),
      language: 'English',
      sourceCountry: 'unknown',
    }));
    state = mergeNewsCandidates(
      state,
      { articles, fetchedAt: new Date(now).toISOString(), stale: false },
      (state?.articles ?? []).slice(0, 200).map((a) => 'news:' + a.id),
    );
    assert.ok(state.articles.length <= 400);
    assert.ok(state.articles.some((a) => a.id === `article-${batch}-79`));
    assert.equal(
      new Set(state.articles.map((a) => a.id)).size,
      state.articles.length,
    );
  }
});
void test('automatic head reveal waits during reading, composition, selection, pause, or hidden state', () => {
  const atHead = {
    enabled: true,
    live: true,
    pending: 1,
    scrollY: 0,
    visible: true,
    composing: false,
    selecting: false,
  };
  assert.equal(shouldRevealFeedUpdates(atHead), true);
  for (const patch of [
    { scrollY: 121 },
    { composing: true },
    { selecting: true },
    { live: false },
    { enabled: false },
    { visible: false },
    { pending: 0 },
    { scrollY: NaN },
  ])
    assert.equal(shouldRevealFeedUpdates({ ...atHead, ...patch }), false);
});
void test('related words and follows rank actual candidates; no synthetic rows or duplicate IDs', () => {
  const list = [
    candidate('other', { text: 'weather' }),
    candidate('related'),
    candidate('follow', { following: true }),
    candidate('related'),
  ];
  const result = rankFeed(list, { now, interests: feedTerms('robotics') });
  assert.equal(result[0].item.key, 'follow');
  assert.equal(result[1].item.key, 'related');
  assert.equal(new Set(result.map((r) => r.item.key)).size, 3);
  assert.deepEqual(rankFeed([], { now }), []);
  assert.equal(
    rankFeed(list, { now, seen: ['related'] }).some(
      (r) => r.item.key === 'related',
    ),
    false,
  );
});
void test('source diversity interrupts repeated publishers and every fifth slot explores', () => {
  const list = Array.from({ length: 12 }, (_, n) =>
    candidate(String(n), {
      source: n < 7 ? 'one' : 'other-' + n,
      text: n < 7 ? 'robotics' : 'weather',
    }),
  );
  const result = rankFeed(list, { now, interests: ['robotics'] });
  assert.notEqual(result[0].item.source, result[1].item.source);
  assert.equal(result[4].reason, '新しい話題を発見');
});
void test('fresh candidates can outrank stale follow rows and future timestamps do not gain unlimited score', () => {
  const list = [
    candidate('old', { following: true, createdAt: now - 30 * 86_400_000 }),
    candidate('new'),
    candidate('future', { createdAt: now + 999_999_999 }),
  ];
  assert.notEqual(rankFeed(list, { now })[0].item.key, 'old');
  assert.equal(rankFeed(list, { now }).length, 3);
});
void test('append keeps existing order, stops at 200 and drops revoked/deleted rows', () => {
  const first = Array.from({ length: 210 }, (_, n) => candidate(String(n)));
  const keys = ['5', '1', '9'];
  const next = appendFeed(keys, first, ['robotics'], now);
  assert.deepEqual(next.keys.slice(0, 3), keys);
  assert.equal(new Set(next.keys).size, next.keys.length);
  assert.equal(
    appendFeed(
      Array.from({ length: 198 }, (_, n) => String(n)),
      first,
      [],
      now,
    ).keys.length,
    200,
  );
  assert.equal(
    appendFeed(
      ['5'],
      first.filter((i) => i.key !== '5'),
      [],
      now,
    ).keys.includes('5'),
    false,
  );
});
void test('live polling backs off with errors and has a finite ceiling', () => {
  assert.equal(feedPollDelay(0), 25_000);
  assert.equal(feedPollDelay(1), 50_000);
  assert.equal(feedPollDelay(2), 100_000);
  assert.equal(feedPollDelay(100), 120_000);
});
void test('UI pauses hidden/offline refresh, supports reduced motion and labels real news origin', () => {
  const hook = readFileSync(
    new URL('../components/use-sky-continuous-feed.ts', import.meta.url),
    'utf8',
  );
  const ui = readFileSync(
    new URL('../components/sky-social-timeline.tsx', import.meta.url),
    'utf8',
  );
  for (const term of [
    'visibilityState',
    'navigator.onLine',
    'AbortController',
    'feedPollDelay',
  ])
    assert.ok(hook.includes(term));
  for (const term of [
    'prefers-reduced-motion',
    'GDELT検出',
    '新着',
    '一時停止',
    'visibleIds',
  ])
    assert.ok(ui.includes(term));
  assert.doesNotMatch(hook, /localStorage|Math.random|\/api\/llm/);
});

void test('stale fallback articles do not masquerade as a live new-head arrival', () => {
  const article = (id) => ({
    id,
    title: id,
    url: 'https://fixtures.invalid/' + id,
    publisher: 'fixtures.invalid',
    seenAt: new Date(now - 1000).toISOString(),
    language: 'English',
    sourceCountry: 'unknown',
  });
  const first = mergeNewsCandidates(
    null,
    {
      articles: [article('first')],
      fetchedAt: new Date(now).toISOString(),
      stale: false,
    },
    [],
  );
  const next = mergeNewsCandidates(
    first,
    {
      articles: [article('fallback')],
      fetchedAt: new Date(now - 1000).toISOString(),
      stale: true,
    },
    [],
  );
  assert.deepEqual(next.arrivedKeys, []);
  assert.ok(next.staleKeys.includes('fallback'));
});

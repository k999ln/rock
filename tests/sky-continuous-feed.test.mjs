import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  rankFeed,
  appendFeed,
  feedTerms,
  feedPollDelay,
} from '../lib/sky-continuous-ranking.ts';
const now = 1_800_000_000_000;
const candidate = (key, extra = {}) => ({
  key,
  source: key,
  text: 'robotics science',
  createdAt: now - 60_000,
  ...extra,
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

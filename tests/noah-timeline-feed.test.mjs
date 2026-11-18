import test from 'node:test';
import assert from 'node:assert/strict';
import { mixNoahTimeline, appendNoahTimeline, selectNoahTimeline, timelineFilter } from '../lib/noah-timeline-feed.ts';
const news = [{ id: 'same-id', title: 'News about code', publisher: 'publisher.example' }];
const agents = [{ id: 'same-id', name: 'Code helper', summary: 'Create files', author: 'Author', kind: 'agent' }];
const posts = [
  { id: 'post', content: 'Hello', author: { name: 'Alice' }, community: null, following: true },
  { id: 'community', content: 'Members talk', author: { name: 'Bob' }, community: { id: 'group', name: 'Development club' }, following: false },
];
void test('a single timeline interleaves sources with explicit kinds and retains the community name', () => {
  const items = mixNoahTimeline(news, agents, posts);
  assert.deepEqual(items.map(item => item.kind), ['news', 'agent', 'post', 'community']);
  assert.equal(items[3].post.community.name, 'Development club');
  assert.equal(items[1].agent.createdAt, undefined, 'catalog dates are not fabricated publication dates');
  assert.equal(new Set(items.map(item => item.key)).size, 4, 'source IDs cannot collide');
});
void test('pagination does not reorder existing cards or repeat overlapping pages', () => {
  const first = mixNoahTimeline(news, agents, posts);
  const next = appendNoahTimeline(first, mixNoahTimeline(news, [{ ...agents[0], id: 'new-agent' }], posts));
  assert.deepEqual(next.slice(0, 4), first); assert.equal(next.length, 5);
  assert.equal(next[4].agent.id, 'new-agent');
});
void test('community and follow filters select real posts, not inferred memberships or catalog authors', () => {
  const items = mixNoahTimeline(news, agents, posts);
  assert.deepEqual(selectNoahTimeline(items, 'community').map(i => i.key), ['post:community']);
  assert.deepEqual(selectNoahTimeline(items, 'following').map(i => i.key), ['post:post']);
  assert.equal(selectNoahTimeline(items, 'all', 'Development club').length, 1);
  assert.equal(selectNoahTimeline(items, 'agent', 'code').length, 1);
  assert.equal(timelineFilter('#timeline'), 'all'); assert.equal(timelineFilter('#news'), 'news');
});
void test('failure or absence of one source does not produce fake rows or remove the other sources', () => {
  assert.deepEqual(mixNoahTimeline([], agents, []).map(i => i.kind), ['agent']);
  assert.deepEqual(mixNoahTimeline([], [], []), []);
  assert.equal(mixNoahTimeline(news, [], [], true)[0].stale, true);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { mixNoahTimeline, appendNoahTimeline, selectNoahTimeline, timelineFilter } from '../lib/noah-timeline-feed.ts';
const agents = [{ id: 'same-id', name: 'Code helper', summary: 'Create files', author: 'Author', kind: 'agent' }];
const posts = [
  { id: 'post', content: 'Hello', author: { name: 'Alice' }, community: null, following: true },
  { id: 'community', content: 'Members talk', author: { name: 'Bob' }, community: { id: 'group', name: 'Development club' }, following: false },
];
void test('timeline interleaves followed posts and Agents while excluding community posts', () => {
  const items = mixNoahTimeline(agents, posts);
  assert.deepEqual(items.map(item => item.kind), ['post', 'agent']);
  assert.equal(items[0].post.id, 'post');
  assert.equal(items[1].agent.createdAt, undefined, 'catalog dates are not fabricated publication dates');
  assert.equal(new Set(items.map(item => item.key)).size, 2, 'source IDs cannot collide');
});
void test('pagination does not reorder existing cards or repeat overlapping pages', () => {
  const first = mixNoahTimeline(agents, posts);
  const next = appendNoahTimeline(first, mixNoahTimeline([{ ...agents[0], id: 'new-agent' }], posts));
  assert.deepEqual(next.slice(0, 2), first); assert.equal(next.length, 3);
  assert.equal(next[2].agent.id, 'new-agent');
});
void test('only all and Agent filters remain; retired hashes return to the main timeline', () => {
  const items = mixNoahTimeline(agents, posts);
  assert.equal(selectNoahTimeline(items, 'all', 'Development club').length, 0);
  assert.equal(selectNoahTimeline(items, 'agent', 'code').length, 1);
  for (const hash of ['#timeline','#news','#communities','#following']) assert.equal(timelineFilter(hash), 'all');
  assert.equal(timelineFilter('#agents'), 'agent');
  assert.deepEqual(selectNoahTimeline([{kind:'news',article:{}},{kind:'community',post:posts[1]},{kind:'post',post:posts[1]}], 'all'), []);
});
void test('followed posts appear twice per round without removing ordinary posts or duplicating entries', () => {
  const followed = [1,2,3].map(id => ({...posts[0],id:`follow-${id}`}));
  const ordinary = {...posts[0],id:'ordinary',following:false};
  const items = mixNoahTimeline(agents,[ordinary,...followed,posts[1],followed[0]]);
  assert.deepEqual(items.map(i=>i.key), ['post:follow-1','post:follow-2','post:ordinary','agent:same-id','post:follow-3']);
  assert.deepEqual(mixNoahTimeline(agents,[ordinary]).map(i=>i.kind), ['post','agent']);
  assert.deepEqual(mixNoahTimeline(agents,[]).map(i=>i.kind), ['agent']);
  assert.deepEqual(mixNoahTimeline([],[]), []);
});

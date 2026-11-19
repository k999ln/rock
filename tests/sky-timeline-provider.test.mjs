import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseTimelineEnvelope,
  TIMELINE_TTL,
} from '../lib/sky-timeline-provider.ts';
const now = Date.now();
const envelope = () => ({
  schema: 'sky.timeline.v1',
  source: 'x',
  audience: 'owner',
  feed: 'following',
  fetchedAt: now,
  posts: [
    {
      id: '5678',
      author: 'fixture_author',
      name: '合成の作者',
      text: 'Synthetic fixture only.',
      protected: true,
      createdAt: new Date(now).toISOString(),
      url: 'https://x.com/fixture_author/status/5678',
    },
  ],
});
void test('API/MCP envelope, structured result and text content use one native post contract', () => {
  const data = envelope();
  for (const value of [
    data,
    { structuredContent: data },
    { content: [{ type: 'text', text: JSON.stringify(data) }] },
  ])
    assert.deepEqual(parseTimelineEnvelope(value, 'following', now), data);
  assert.equal(
    parseTimelineEnvelope(data, 'following', now).posts[0].protected,
    true,
  );
});
void test('provider recommendations are explicitly distinct from following and X official For You proof', () => {
  const data = { ...envelope(), feed: 'recommended' };
  assert.equal(
    parseTimelineEnvelope(data, 'recommended', now).feed,
    'recommended',
  );
  assert.throws(() => parseTimelineEnvelope(data, 'following', now));
});
void test('fails closed on provider errors, wrong scope, stale data and malformed responses', () => {
  for (const value of [
    { isError: true, structuredContent: envelope() },
    null,
    {},
    'not json',
    { ...envelope(), audience: 'public' },
    { ...envelope(), schema: 'different' },
    { ...envelope(), fetchedAt: now - TIMELINE_TTL - 1 },
    { ...envelope(), fetchedAt: now + 60_001 },
    { content: [{ type: 'image', text: '{}' }] },
  ])
    assert.throws(() => parseTimelineEnvelope(value, 'following', now));
  assert.deepEqual(
    parseTimelineEnvelope({ ...envelope(), posts: [] }, 'following', now).posts,
    [],
  );
});
void test('rejects unknown privacy, forged URLs, missing text/author, duplicate and oversized posts', () => {
  for (const patch of [
    { protected: undefined },
    { protected: 'false' },
    { author: '../admin' },
    { id: 'x' },
    { name: '' },
    { url: 'javascript:alert(1)' },
    { url: 'https://evil.example/post' },
    { text: '' },
    { text: 'a'.repeat(10001) },
    { createdAt: 'bad' },
  ]) {
    const value = envelope();
    value.posts[0] = { ...value.posts[0], ...patch };
    assert.throws(() => parseTimelineEnvelope(value, 'following', now));
  }
  const value = envelope();
  value.posts.push(value.posts[0]);
  assert.throws(() => parseTimelineEnvelope(value, 'following', now));
  assert.throws(() =>
    parseTimelineEnvelope('a'.repeat(128001), 'following', now),
  );
});
void test('untrusted extra fields cannot become instructions, permissions or executable rendering', () => {
  const value = envelope();
  value.posts[0].html = '<script>bad()</script>';
  value.approval = true;
  value.posts[0].text = '<script>not executed</script>';
  const output = parseTimelineEnvelope(value, 'following', now);
  assert.equal(output.posts[0].html, undefined);
  assert.equal(output.approval, undefined);
  assert.equal(output.posts[0].text, '<script>not executed</script>');
});

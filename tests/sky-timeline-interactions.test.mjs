import test from 'node:test';
import assert from 'node:assert/strict';
import { communityFixture, post } from './helpers/community-fixture.mjs';
const reaction = (id, kind, enabled = true) => ({
  action: 'reaction',
  id,
  reaction: kind,
  enabled,
});
void test('Timeline reactions persist idempotently; bookmarks are private to the viewer', async (t) => {
  const f = communityFixture(t);
  await f.accounts();
  const item = post('実在する試験投稿');
  await f.store('bob').mutate(item);
  for (let n = 0; n < 2; n++) await f.store().mutate(reaction(item.id, 'like'));
  const state = await f.store().state();
  assert.equal(state.posts[0].likes, 1);
  assert.equal(state.posts[0].liked, true);
  await f.store().mutate(reaction(item.id, 'bookmark'));
  assert.equal((await f.store().state('bookmarks')).posts[0].id, item.id);
  assert.equal((await f.store('bob').state('bookmarks')).posts.length, 0);
  assert.equal((await f.store('bob').state()).posts[0].bookmarked, false);
  await f.store().mutate(reaction(item.id, 'like', false));
  await f.store().mutate(reaction(item.id, 'like', false));
  assert.equal((await f.store().state()).posts[0].likes, 0);
  await assert.rejects(f.store().mutate(reaction(item.id, 'mint-money')));
});
void test('Reposts make a real original post visible to followers without copying its body', async (t) => {
  const f = communityFixture(t);
  await f.accounts();
  const item = post('Carol の原文');
  await f.store('carol').mutate(item);
  const bob = (await f.store('bob').state()).profile;
  await f.store().mutate({ action: 'follow', targetId: bob.id, enabled: true });
  assert.equal((await f.store().state('following')).posts.length, 0);
  await f.store('bob').mutate(reaction(item.id, 'repost'));
  const shared = (await f.store().state('following')).posts;
  assert.equal(shared.length, 1);
  assert.equal(shared[0].id, item.id);
  assert.equal(shared[0].reposts, 1);
  assert.equal(
    f.sql.prepare('SELECT COUNT(*) AS n FROM sky_social_posts').get().n,
    1,
  );
  await f.store('bob').mutate(reaction(item.id, 'repost', false));
  assert.equal((await f.store().state('following')).posts.length, 0);
});
void test('Replies inherit their parent privacy and remain in the thread rather than the root feed', async (t) => {
  const f = communityFixture(t);
  await f.accounts();
  const id = await f.create();
  await f.join(id);
  const root = post('限定の親投稿', id);
  await f.store().mutate(root);
  const reply = post('限定の返信', null, { replyTo: root.id });
  await f.store('bob').mutate(reply);
  await f.store('bob').mutate(reply);
  const view = await f.store('bob').state();
  assert.equal(view.posts.length, 1);
  assert.equal(view.posts[0].replies, 1);
  const detail = await f.store('bob').state('recommended', '', '', root.id);
  assert.equal(detail.thread.id, root.id);
  assert.equal(detail.posts[0].community.id, id);
  assert.equal(detail.posts[0].replyTo, root.id);
  assert.equal((await f.store('carol').state()).posts.length, 0);
  for (const action of [
    () => f.store('carol').state('recommended', '', '', root.id),
    () => f.store('carol').mutate(post('盗み見', null, { replyTo: root.id })),
    () => f.store('carol').mutate(reaction(root.id, 'like')),
  ])
    await assert.rejects(action(), (e) => e.status === 404);
  await assert.rejects(
    f
      .store('bob')
      .mutate(post('不正な移動', crypto.randomUUID(), { replyTo: root.id })),
  );
  await assert.rejects(
    f.store('bob').mutate(post('孫返信', null, { replyTo: reply.id })),
  );
});
void test('Key revocation denies thread/reaction/bookmark reads and new replies', async (t) => {
  const f = communityFixture(t);
  await f.accounts();
  const id = await f.create();
  await f.join(id);
  const root = post('失効試験', id);
  await f.store().mutate(root);
  await f.store('bob').mutate(reaction(root.id, 'bookmark'));
  const bob = (await f.store('bob').state()).profile;
  await f.store().mutate({ action: 'removeMember', id, targetId: bob.id });
  assert.equal((await f.store('bob').state('bookmarks')).posts.length, 0);
  await assert.rejects(
    f.store('bob').state('recommended', '', '', root.id),
    (e) => e.status === 404,
  );
  await assert.rejects(
    f.store('bob').mutate(reaction(root.id, 'repost')),
    (e) => e.status === 404,
  );
  await assert.rejects(
    f.store('bob').mutate(post('失効後の返信', null, { replyTo: root.id })),
    (e) => e.status === 404,
  );
});
void test('Deleting a root removes its replies and reactions without affecting another post', async (t) => {
  const f = communityFixture(t);
  await f.accounts();
  const root = post('削除する親'),
    other = post('残す親');
  await f.store().mutate(root);
  await f.store().mutate(other);
  const reply = post('削除する返信', null, { replyTo: root.id });
  await f.store('bob').mutate(reply);
  await f.store('bob').mutate(reaction(root.id, 'like'));
  await f.store().mutate(reaction(reply.id, 'bookmark'));
  await assert.rejects(
    f.store('bob').mutate({ action: 'deletePost', id: root.id }),
    (e) => e.status === 404,
  );
  await f.store().mutate({ action: 'deletePost', id: root.id });
  assert.equal((await f.store().state()).posts[0].id, other.id);
  assert.equal(
    f.sql.prepare('SELECT COUNT(*) AS n FROM sky_social_reactions').get().n,
    0,
  );
  await assert.rejects(
    f.store().state('recommended', '', '', root.id),
    (e) => e.status === 404,
  );
});
void test('Thread pagination is bounded and adding a reply cannot reuse a root post ID', async (t) => {
  const f = communityFixture(t);
  await f.accounts();
  const root = post('親');
  await f.store().mutate(root);
  for (let n = 0; n < 23; n++)
    await f.store('bob').mutate(post(`返信${n}`, null, { replyTo: root.id }));
  const first = await f.store().state('recommended', '', '', root.id),
    next = await f.store().state('recommended', '', first.cursor, root.id);
  assert.equal(first.posts.length, 20);
  assert.equal(next.posts.length, 3);
  assert.equal(
    new Set([...first.posts, ...next.posts].map((p) => p.id)).size,
    23,
  );
  await assert.rejects(
    f.store().mutate({ ...root, replyTo: root.id }),
    (e) => e.status === 409,
  );
});

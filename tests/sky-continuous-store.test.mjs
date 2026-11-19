import test from 'node:test';
import assert from 'node:assert/strict';
import { communityFixture, post } from './helpers/community-fixture.mjs';
void test('live visibility readback never authorizes keyed posts after revocation', async (t) => {
  const f = communityFixture(t);
  await f.accounts();
  const community = await f.create();
  await f.join(community);
  const item = post('保存済みの限定投稿', community);
  await f.store().mutate(item);
  assert.deepEqual(
    (await f.store('bob').state('recommended', '', '', '', item.id)).visibleIds,
    [item.id],
  );
  const bob = (await f.store('bob').state()).profile;
  await f
    .store()
    .mutate({ action: 'removeMember', id: community, targetId: bob.id });
  const checked = await f
    .store('bob')
    .state('recommended', '', '', '', item.id);
  assert.deepEqual(checked.checkedIds, [item.id]);
  assert.deepEqual(checked.visibleIds, []);
  await assert.rejects(
    f
      .store()
      .state('recommended', '', '', '', Array(201).fill(item.id).join(',')),
  );
  await assert.rejects(f.store().state('recommended', '', '', '', 'invalid'));
});
void test('server pages freeze recency reference and new arrivals do not duplicate the next page', async (t) => {
  const f = communityFixture(t);
  await f.accounts();
  for (let n = 0; n < 30; n++) await f.store('bob').mutate(post('ページ ' + n));
  const first = await f.store().state();
  assert.equal(JSON.parse(first.cursor).length, 4);
  await f.store('carol').mutate(post('新着'));
  const second = await f.store().state('recommended', '', first.cursor);
  assert.equal(
    new Set([...first.posts, ...second.posts].map((p) => p.id)).size,
    30,
  );
});

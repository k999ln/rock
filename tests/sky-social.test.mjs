import test from 'node:test';
import assert from 'node:assert/strict';
import { socialAttachment } from '../lib/sky-social.ts';
import {
  communityFixture,
  post,
  secret,
} from './helpers/community-fixture.mjs';
void test('Sky requires an account and never accepts unknown authority fields', async (t) => {
  const f = communityFixture(t);
  await assert.rejects(f.create(), (e) => e.status === 409);
  assert.equal((await f.store().state()).profile, null);
  await f.accounts();
  assert.notEqual((await f.store().state()).profile.id, 'alice');
  await assert.rejects(
    f.store().mutate({ action: 'profile', name: 'x', credential: 'secret' }),
  );
});
void test('Sky community creation is idempotent; account and dedicated key are both required', async (t) => {
  const f = communityFixture(t);
  await f.accounts();
  const id = await f.create();
  await f.create('alice', id);
  assert.equal(
    f.sql.prepare('SELECT COUNT(*) AS n FROM sky_communities').get().n,
    1,
  );
  await f.store().mutate(post('限定投稿', id));
  assert.equal((await f.store().state()).posts.length, 1);
  assert.equal((await f.store('alice', {}).state()).posts.length, 0);
  await assert.rejects(
    f.store('alice', {}).state('recommended', id),
    (e) => e.status === 403,
  );
  assert.equal(
    (await f.store('bob', { [id]: f.keys.alice[id] }).state()).posts.length,
    0,
  );
  assert.equal((await f.store('bob').state()).communities.length, 0);
  assert.ok(
    !JSON.stringify(
      f.sql.prepare('SELECT * FROM sky_community_keys').all(),
    ).includes(f.keys.alice[id]),
  );
});
void test('Sky validates invitation and current rules; key loss and leave deny access', async (t) => {
  const f = communityFixture(t);
  await f.accounts();
  const id = await f.create();
  await f.store().mutate(post('限定作品', id));
  await assert.rejects(
    f
      .store('bob')
      .mutate({
        action: 'join',
        id,
        confirmRules: true,
        accessKey: secret(),
        rulesVersion: 0,
      }),
    (e) => e.status === 403,
  );
  const invite = (await f.store().mutate({ action: 'invite', id })).invite;
  await assert.rejects(
    f
      .store('bob')
      .mutate({
        action: 'join',
        ...invite,
        confirmRules: true,
        accessKey: secret(),
        rulesVersion: 99,
      }),
    (e) => e.status === 409,
  );
  await f.join(id, 'bob', invite);
  assert.equal((await f.store('bob').state()).posts.length, 1);
  assert.equal((await f.store('bob', {}).state()).posts.length, 0);
  await f.store('bob').mutate({ action: 'leave', id });
  assert.equal((await f.store('bob').state()).posts.length, 0);
  await assert.rejects(
    f.store('bob').mutate(post('退出後', id)),
    (e) => e.status === 403,
  );
});
void test('Sky invitation rotation, revocation and explicit re-admission cannot be bypassed', async (t) => {
  const f = communityFixture(t);
  await f.accounts();
  const id = await f.create(),
    old = (await f.store().mutate({ action: 'invite', id })).invite,
    next = (await f.store().mutate({ action: 'invite', id })).invite;
  await assert.rejects(
    f.store('bob').mutate({ action: 'previewInvite', ...old }),
    (e) => e.status === 403,
  );
  await f.join(id, 'bob', next);
  const bob = (await f.store('bob').state()).profile;
  await f.store().mutate({ action: 'removeMember', id, targetId: bob.id });
  await assert.rejects(f.join(id, 'bob', next), (e) => e.status === 403);
  await f.store().mutate({ action: 'allowMember', id, targetId: bob.id });
  await f.join(id, 'bob', next);
  assert.equal((await f.store('bob').state()).communities[0].unlocked, true);
});
void test('Sky follow/recommend feed paginates visible actual posts with reasons', async (t) => {
  const f = communityFixture(t);
  await f.accounts();
  const bob = (await f.store('bob').state()).profile;
  for (let n = 0; n < 25; n++) await f.store('bob').mutate(post(`実投稿 ${n}`));
  await f.store('carol').mutate(post('別の人'));
  assert.equal((await f.store().state('following')).posts.length, 0);
  await f.store().mutate({ action: 'follow', targetId: bob.id, enabled: true });
  const page = await f.store().state(),
    next = await f.store().state('recommended', '', page.cursor);
  assert.equal(page.posts[0].reason, 'フォロー中の人');
  assert.equal(
    new Set([...page.posts, ...next.posts].map((p) => p.id)).size,
    26,
  );
  await f
    .store()
    .mutate({ action: 'follow', targetId: bob.id, enabled: false });
  assert.equal((await f.store().state('following')).posts.length, 0);
});
void test('Sky validates shares and only keyed author/creator can moderate', async (t) => {
  const f = communityFixture(t);
  await f.accounts();
  const id = await f.create();
  await f.join(id);
  const item = post('モデル', id, {
    attachment: { kind: 'model', resource: 'Qwen/Qwen3-0.6B' },
  });
  await f.store('bob').mutate(item);
  await f.store('bob').mutate(item);
  await assert.rejects(
    f.store('carol').mutate({ action: 'deletePost', id: item.id }),
    (e) => e.status === 404,
  );
  await f.store().mutate({ action: 'deletePost', id: item.id });
  for (const url of [
    'javascript:alert(1)',
    'http://example.test/',
    'https://secret:pw@example.test/',
  ])
    assert.throws(() => socialAttachment({ kind: 'edition', resource: url }));
  await assert.rejects(
    f
      .store()
      .mutate(
        post('bad', null, {
          attachment: { kind: 'agent', resource: 'arbitrary-shell' },
        }),
      ),
  );
  await f.store().mutate({ action: 'archiveCommunity', id });
  assert.equal((await f.store().state()).communities.length, 0);
  await assert.rejects(
    f.store().mutate(post('終了後', id)),
    (e) => e.status === 403,
  );
});

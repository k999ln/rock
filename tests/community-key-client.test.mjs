import test from 'node:test';
import assert from 'node:assert/strict';
import {
  setCommunityKeyProfile,
  prepareCommunityKey,
  communityRequestHeaders,
  exportCommunityKey,
  importCommunityKey,
  forgetCommunityKey,
  communityFetch,
} from '../lib/community-key-client.ts';
import { communityKeysHeader } from '../lib/community-access.ts';
const id = '11111111-1111-4111-8111-111111111111';
function environment(t) {
  const prior = globalThis.window,
    values = new Map();
  globalThis.window = {
    localStorage: {
      getItem: (k) => values.get(k) ?? null,
      setItem: (k, v) => values.set(k, v),
    },
    dispatchEvent: () => {},
  };
  t.after(() => {
    globalThis.window = prior;
  });
}
void test('Community key files stay account scoped and exclude OS/conversation data', (t) => {
  environment(t);
  setCommunityKeyProfile('alice-profile');
  const first = prepareCommunityKey(id, true),
    backup = exportCommunityKey(id);
  assert.equal(first.accessKey.length, 64);
  assert.notEqual(first.accessKey, first.recoveryKey);
  assert.equal(
    communityRequestHeaders()['x-rock-community-keys'],
    JSON.stringify({ [id]: first.accessKey }),
  );
  setCommunityKeyProfile('bob-profile');
  assert.equal(communityRequestHeaders()['x-rock-community-keys'], '{}');
  assert.throws(() => importCommunityKey(backup), /同じアカウント/);
  setCommunityKeyProfile('alice-profile');
  forgetCommunityKey(id);
  assert.equal(communityRequestHeaders()['x-rock-community-keys'], '{}');
  importCommunityKey(backup);
  assert.equal(prepareCommunityKey(id).accessKey, first.accessKey);
  assert.equal(JSON.parse(backup).manifest, undefined);
});
void test('Community key transport refuses external URLs and malformed headers', async (t) => {
  environment(t);
  for (const url of [
    'https://evil.test/api/sky/social',
    '//evil.test/api/sky/social',
    '/api/wallet',
  ])
    await assert.rejects(communityFetch(url), /だけ送信/);
  assert.throws(() =>
    communityKeysHeader(
      new Request('https://example.test', {
        headers: { 'x-rock-community-keys': '[]' },
      }),
    ),
  );
  assert.throws(() =>
    communityKeysHeader(
      new Request('https://example.test', {
        headers: { 'x-rock-community-keys': JSON.stringify({ [id]: 'short' }) },
      }),
    ),
  );
});

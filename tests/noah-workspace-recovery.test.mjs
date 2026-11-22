import test from 'node:test';
import assert from 'node:assert/strict';
import { recoverNoahWorkspace, noahDevCommand } from '../scripts/noah-workspace-recovery.mjs';

void test('missing SSD fails without creating an empty replacement workspace', async () => {
  let called = 0;
  await assert.rejects(recoverNoahWorkspace({ exists: async () => false, platform: 'darwin', execute: async () => { called++; } }), /イメージが見つかりません/);
  assert.equal(called, 0);
});
void test('existing image is mounted at the original path, once, then validated', async () => {
  let attached = false; const calls = [];
  const state = await recoverNoahWorkspace({ workspace: '/Volumes/avokado', image: '/disk/image.sparsebundle', platform: 'darwin',
    exists: async p => p === '/disk/image.sparsebundle' || attached,
    resolve: async p => p, execute: async (...args) => { calls.push(args); attached = true; } });
  assert.equal(state.mounted, true); assert.equal(calls.length, 1);
  assert.deepEqual(calls[0][1], ['attach', '/disk/image.sparsebundle', '-nobrowse', '-mountpoint', '/Volumes/avokado']);
});
void test('unrelated mountpoint is not overwritten or populated', async () => {
  let called = false;
  await assert.rejects(recoverNoahWorkspace({ platform: 'darwin', exists: async p => !p.endsWith('package.json'), execute: async () => { called = true; } }), /別の内容/);
  assert.equal(called, false);
});
void test('mounted workspace is reused and dev keeps the old IPv4 URL without LAN access', async () => {
  const state = await recoverNoahWorkspace({ exists: async () => true, resolve: async p => p, execute: async () => { assert.fail('already mounted'); } });
  assert.equal(state.mounted, false);
  const spec = noahDevCommand(state.root, { PATH: '/test' });
  assert.equal(spec.options.env.SKY_LINUX_PRIVATE_PREVIEW, '1');
  assert.deepEqual(spec.args, ['run', 'dev', '--', '--port', '3107']);
});

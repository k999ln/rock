import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, chmod, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pixelUpdateGuard } from '../toolkits/sky-linux-local/pixel-update-guard.mjs';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'rock-update-guard-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const id = 'a'.repeat(64) + '-' + 'b'.repeat(32), directory = join(root, 'updates', id);
  await mkdir(directory, { mode: 0o700, recursive: true });
  await chmod(join(root, 'updates'), 0o700);
  const pointer = join(root, 'update-transaction.json'), receipt = join(directory, 'receipt.json');
  const write = async state => {
    await writeFile(pointer, JSON.stringify({ id }), { mode: 0o600 });
    await writeFile(receipt, JSON.stringify({ schema: 'sky.pixel-guest-update/1', id, state }), { mode: 0o600 });
  };
  return { root, id, directory, pointer, receipt, write, guard: pixelUpdateGuard(root) };
}
const pending = error => error.code === 'PIXEL_UPDATE_PENDING';

void test('no update or verified terminal receipt allows dispatch; every intermediate stage is fenced', async t => {
  const f = await fixture(t);
  await f.guard();
  for (const stage of ['staged', 'services_stopped', 'old_moved', 'installed', 'rollback_failed', 'unknown']) {
    await f.write(stage);
    await assert.rejects(f.guard(), pending);
  }
  for (const stage of ['committed', 'rolled_back']) { await f.write(stage); await f.guard(); }
});
void test('corrupt, mismatched, public, symlink or missing receipt never becomes an execution grant', async t => {
  const f = await fixture(t);
  await f.write('committed'); await writeFile(f.receipt, '{broken'); await assert.rejects(f.guard(), pending);
  await f.write('committed'); await chmod(f.receipt, 0o644); await assert.rejects(f.guard(), pending); await chmod(f.receipt, 0o600);
  await f.write('committed'); await writeFile(f.receipt, JSON.stringify({ schema: 'sky.pixel-guest-update/1', id: 'different', state: 'committed' })); await assert.rejects(f.guard(), pending);
  await f.write('committed'); await rm(f.receipt); await assert.rejects(f.guard(), pending);
  const other = join(f.root, 'other.json'); await writeFile(other, JSON.stringify({ schema: 'sky.pixel-guest-update/1', id: f.id, state: 'committed' }), { mode: 0o600 });
  await symlink(other, f.receipt); await assert.rejects(f.guard(), pending);
  await rm(f.receipt); await f.write('committed'); await writeFile(f.pointer, JSON.stringify({ id: '../outside' })); await assert.rejects(f.guard(), pending);
});

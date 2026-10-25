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

// Serial deterministic barriers on real temporary files, no product test hook.
const fs = (await import('node:fs/promises')).default;
const { syncBuiltinESMExports } = await import('node:module');
const { constants } = await import('node:fs');
async function intercept(t, { beforeRead, afterRead, afterStat, afterLstat } = {}) {
  const originalOpen = fs.open, originalLstat = fs.lstat;
  let opened = 0, closed = 0;
  fs.open = async (...args) => {
    const handle = await originalOpen(...args); opened++;
    const stat = handle.stat.bind(handle), read = handle.read.bind(handle), close = handle.close.bind(handle);
    handle.stat = async () => { const info = await stat(); await afterStat?.(args[0], info); return info; };
    handle.read = async (...values) => {
      assert.ok(args[1] & constants.O_NOFOLLOW); assert.ok(args[1] & constants.O_NONBLOCK);
      assert.ok(values[0].length <= 262145); assert.ok(values[2] <= 262145);
      await beforeRead?.(args[0]); const result = await read(...values); await afterRead?.(args[0]); return result;
    };
    handle.close = async () => { closed++; return close(); };
    return handle;
  };
  fs.lstat = async path => { const info = await originalLstat(path); await afterLstat?.(path, info); return info; };
  syncBuiltinESMExports();
  t.after(() => { fs.open = originalOpen; fs.lstat = originalLstat; syncBuiltinESMExports(); assert.equal(closed, opened); });
}
void test('receipt replacement after metadata check cannot read an unchecked terminal symlink (original CodeQL race)', async t => {
  const f = await fixture(t); await f.write('staged');
  const target = join(f.root, 'synthetic-terminal.json');
  await writeFile(target, JSON.stringify({ schema: 'sky.pixel-guest-update/1', id: f.id, state: 'committed' }), { mode: 0o600 });
  let replaced = false;
  const replace = async path => { if (path === f.receipt && !replaced) { replaced = true; await rm(path); await symlink(target, path); } };
  // afterLstat exercises the vulnerable implementation; afterStat exercises
  // the same boundary on the fixed descriptor implementation.
  await intercept(t, { afterLstat: replace, afterStat: replace });
  await assert.rejects(f.guard(), pending); assert.equal(replaced, true);
});
void test('regular receipt replacement after descriptor read is fenced even when both contents are terminal', async t => {
  const f = await fixture(t); await f.write('committed'); let replaced = false;
  await intercept(t, { afterRead: async path => { if (path === f.receipt && !replaced) {
    replaced = true; await rm(path); await writeFile(path, JSON.stringify({ schema: 'sky.pixel-guest-update/1', id: f.id, state: 'committed' }), { mode: 0o600 });
  } } });
  await assert.rejects(f.guard(), pending); assert.equal(replaced, true);
});
void test('new update pointer published while receipt is read cannot reuse an old terminal receipt', async t => {
  const f = await fixture(t); await f.write('committed'); let replaced = false;
  await intercept(t, { afterRead: async path => { if (path === f.receipt && !replaced) {
    replaced = true; const temp = join(f.root, 'new-pointer');
    await writeFile(temp, JSON.stringify({ id: 'c'.repeat(64) + '-' + 'd'.repeat(32) }), { mode: 0o600 }); await fs.rename(temp, f.pointer);
  } } });
  await assert.rejects(f.guard(), pending); assert.equal(replaced, true);
});
void test('replaced parent directory is fenced even if it still resolves to the opened receipt', async t => {
  const f = await fixture(t); await f.write('committed'); let replaced = false;
  await intercept(t, { afterRead: async path => { if (path === f.receipt && !replaced) {
    replaced = true; const moved = f.directory + '-moved'; await fs.rename(f.directory, moved); await symlink(moved, f.directory);
  } } });
  await assert.rejects(f.guard(), pending); assert.equal(replaced, true);
});
void test('growth after fstat stays bounded and closes all acquired descriptors', async t => {
  const f = await fixture(t); await f.write('committed'); let grew = false;
  await intercept(t, { beforeRead: async path => { if (path === f.receipt && !grew) { grew = true; await fs.appendFile(path, Buffer.alloc(1048576)); } } });
  await assert.rejects(f.guard(), pending); assert.equal(grew, true);
});
void test('in-place same-length content mutation and read errors fail closed without descriptor leaks', async t => {
  const f = await fixture(t); await f.write('committed'); let changed = false;
  await intercept(t, { afterRead: async path => { if (path === f.receipt && !changed) {
    changed = true; await writeFile(path, JSON.stringify({ schema: 'sky.pixel-guest-update/1', id: f.id, state: 'installed' }));
  } } });
  await assert.rejects(f.guard(), pending); assert.equal(changed, true);
});
void test('descriptor read failure closes all acquired handles', async t => {
  const f = await fixture(t); await f.write('committed');
  await intercept(t, { beforeRead: async path => { if (path === f.receipt) throw Error('synthetic read failure'); } });
  await assert.rejects(f.guard(), pending);
});

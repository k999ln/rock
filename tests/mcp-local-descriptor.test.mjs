import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { constants } from 'node:fs';
import { appendFile, chmod, mkdtemp, open, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';
import { readPrivateLocalDescriptor } from '../toolkits/sky-mcp-connector/local-descriptor.mjs';

const exec = promisify(execFile);
const supported = Number.isInteger(constants.O_NOFOLLOW) && constants.O_NOFOLLOW !== 0 &&
  Number.isInteger(constants.O_NONBLOCK) && constants.O_NONBLOCK !== 0;
const posix = { skip: !supported && 'Secure descriptor open flags are unavailable' };

async function fixture(t, value = '{"name":"original"}') {
  const directory = await mkdtemp(join(tmpdir(), 'sky-descriptor-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, 'descriptor.json');
  await writeFile(path, value, { mode: 0o600 });
  return { directory, path };
}

function trackedOpen(onOpen = async () => {}, overrides = {}) {
  const state = { closed: 0, bytesRead: 0, readCalls: 0, flags: undefined };
  state.openFile = async (path, flags) => {
    state.flags = flags;
    const handle = await open(path, flags);
    state.handle = handle;
    await onOpen(handle, path);
    return {
      stat: () => overrides.stat ? overrides.stat(handle) : handle.stat(),
      read: async (...args) => {
        state.readCalls++;
        assert.ok(args[2] <= 4_097, 'individual reads must be bounded');
        const result = overrides.read ? await overrides.read(handle, ...args) : await handle.read(...args);
        state.bytesRead += result.bytesRead;
        return result;
      },
      close: async () => { state.closed++; await handle.close(); },
    };
  };
  return state;
}

void test('a private descriptor is read from one no-follow, nonblocking handle and closed', posix, async (t) => {
  const { path } = await fixture(t);
  const tracked = trackedOpen();
  assert.deepEqual(await readPrivateLocalDescriptor(path, tracked), { name: 'original' });
  assert.equal(tracked.flags & constants.O_NOFOLLOW, constants.O_NOFOLLOW);
  assert.equal(tracked.flags & constants.O_NONBLOCK, constants.O_NONBLOCK);
  assert.equal(tracked.closed, 1);
  await assert.rejects(() => tracked.handle.stat(), { code: 'EBADF' });
});

void test('unsupported platforms refuse discovery instead of opening with zero-valued safety flags', { skip: supported }, async () => {
  let opened = false;
  await assert.rejects(() => readPrivateLocalDescriptor('unused', {
    openFile: () => { opened = true; throw new Error('unexpected_open'); },
  }), /local_descriptor_platform_unsupported/);
  assert.equal(opened, false);
});

void test('pathname replacement after open reads only the original inode, then refuses the symlink', posix, async (t) => {
  const { directory, path } = await fixture(t);
  const replacement = join(directory, 'replacement.json');
  await writeFile(replacement, '{"name":"replacement"}', { mode: 0o600 });
  const tracked = trackedOpen(async () => {
    await rename(path, path + '.original');
    await symlink(replacement, path);
  });
  assert.deepEqual(await readPrivateLocalDescriptor(path, tracked), { name: 'original' });
  assert.equal(tracked.closed, 1);
  await assert.rejects(() => readPrivateLocalDescriptor(path));
});

void test('permissions are checked on the opened file after a concurrent mode change', posix, async (t) => {
  const { path } = await fixture(t);
  const tracked = trackedOpen(async () => chmod(path, 0o644));
  await assert.rejects(() => readPrivateLocalDescriptor(path, tracked), /invalid_local_descriptor/);
  assert.equal(tracked.readCalls, 0);
  assert.equal(tracked.closed, 1);
});

void test('opened-file ownership must match the effective user on POSIX', {
  skip: !supported || typeof process.geteuid !== 'function',
}, async (t) => {
  const { path } = await fixture(t);
  const tracked = trackedOpen(undefined, {
    stat: async (handle) => {
      const info = await handle.stat();
      info.uid = process.geteuid() + 1;
      return info;
    },
  });
  await assert.rejects(() => readPrivateLocalDescriptor(path, tracked), /invalid_local_descriptor/);
  assert.equal(tracked.readCalls, 0);
  assert.equal(tracked.closed, 1);
});

void test('exactly 4096 bytes are accepted and initially oversized files are rejected before reading', posix, async (t) => {
  const { path } = await fixture(t, '{}'.padEnd(4_096));
  assert.deepEqual(await readPrivateLocalDescriptor(path), {});
  await appendFile(path, ' ');
  const tracked = trackedOpen();
  await assert.rejects(() => readPrivateLocalDescriptor(path, tracked), /invalid_local_descriptor/);
  assert.equal(tracked.readCalls, 0);
  assert.equal(tracked.closed, 1);
});

void test('growth after fstat cannot exceed the 4097-byte read sentinel', posix, async (t) => {
  const { path } = await fixture(t, '{}');
  const tracked = trackedOpen(undefined, {
    stat: async (handle) => {
      const before = await handle.stat();
      await appendFile(path, ' '.repeat(4_097));
      return before;
    },
  });
  await assert.rejects(() => readPrivateLocalDescriptor(path, tracked), /invalid_local_descriptor/);
  assert.equal(tracked.bytesRead, 4_097);
  assert.equal(tracked.closed, 1);
});

void test('short reads are completed through the same handle', posix, async (t) => {
  const { path } = await fixture(t);
  const tracked = trackedOpen(undefined, {
    read: (handle, buffer, offset, length, position) =>
      handle.read(buffer, offset, Math.min(length, 3), position),
  });
  assert.deepEqual(await readPrivateLocalDescriptor(path, tracked), { name: 'original' });
  assert.ok(tracked.readCalls > 2);
  assert.equal(tracked.closed, 1);
});

void test('stat, read and JSON errors all close the opened handle', posix, async (t) => {
  const { path } = await fixture(t, '{invalid-json');
  for (const overrides of [
    { stat: async () => { throw new Error('fixture_stat_failure'); } },
    { read: async () => { throw new Error('fixture_read_failure'); } },
    {},
  ]) {
    const tracked = trackedOpen(undefined, overrides);
    await assert.rejects(() => readPrivateLocalDescriptor(path, tracked));
    assert.equal(tracked.closed, 1);
    await assert.rejects(() => tracked.handle.stat(), { code: 'EBADF' });
  }
});

void test('nonregular directory and FIFO descriptors are rejected without a blocking read', posix, async (t) => {
  const { directory } = await fixture(t);
  const tracked = trackedOpen();
  await assert.rejects(() => readPrivateLocalDescriptor(directory, tracked), /invalid_local_descriptor/);
  assert.equal(tracked.readCalls, 0);
  assert.equal(tracked.closed, 1);

  const fifo = join(directory, 'descriptor.fifo');
  await exec('mkfifo', ['-m', '600', fifo]);
  // A separate process makes a missing NONBLOCK regression fail with a bounded
  // timeout, rather than leave the test runner stuck in a filesystem open.
  const module = new URL('../toolkits/sky-mcp-connector/local-descriptor.mjs', import.meta.url).href;
  const result = await exec(process.execPath, ['--input-type=module', '-e', `
    const { readPrivateLocalDescriptor } = await import(process.argv[1]);
    try { await readPrivateLocalDescriptor(process.argv[2]); process.exitCode = 1; }
    catch (error) {
      if (error.message !== 'invalid_local_descriptor') process.exitCode = 2;
    }
  `, module, fifo], { timeout: 5_000 });
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, '');
});

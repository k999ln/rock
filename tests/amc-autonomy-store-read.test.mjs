import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { constants, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const supported = Number.isInteger(constants.O_NOFOLLOW) && constants.O_NOFOLLOW !== 0 &&
  Number.isInteger(constants.O_NONBLOCK) && constants.O_NONBLOCK !== 0;
const posix = { skip: !supported && 'Secure autonomy read flags are unavailable' };

// Filesystem hooks live only in an isolated child, never in production APIs or
// another test. Both stat forms expose the same deterministic race to old/new code.
function scenario(t, body) {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'amc-state-read-')));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const source = `
    import assert from 'node:assert/strict';
    import fs from 'node:fs';
    import { execFileSync } from 'node:child_process';
    import { syncBuiltinESMExports } from 'node:module';
    import { join } from 'node:path';
    const directory = process.argv[2];
    const file = join(directory, 'state.json');
    const state = { schema: 'amc-autonomy/1', mode: 'fixture', revision: 0, label: 'original' };
    const maximum = 5_000_000;
    fs.writeFileSync(file, JSON.stringify(state), { mode: 0o600 });
    const original = Object.fromEntries(['openSync', 'closeSync', 'lstatSync', 'fstatSync', 'readSync']
      .map((name) => [name, fs[name].bind(fs)]));
    let openedFd;
    let openFlags;
    let closed = 0;
    let readBytes = 0;
    let readCalls = 0;
    fs.openSync = (path, ...args) => {
      const fd = original.openSync(path, ...args);
      if (path === file) { openedFd = fd; openFlags = args[0]; }
      return fd;
    };
    fs.closeSync = (fd) => {
      if (fd === openedFd) closed++;
      return original.closeSync(fd);
    };
    fs.readSync = (...args) => {
      const bytes = original.readSync(...args);
      if (args[0] === openedFd) { readBytes += bytes; readCalls++; }
      return bytes;
    };
    const load = async () => {
      syncBuiltinESMExports();
      return import(process.argv[1]);
    };
    const assertClosed = () => {
      assert.equal(closed, 1);
      assert.throws(() => original.fstatSync(openedFd), { code: 'EBADF' });
    };
    ${body}
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', source,
    new URL('../scripts/amc-autonomy-store.mjs', import.meta.url).href, directory], {
    encoding: 'utf8', timeout: 5000, maxBuffer: 64 * 1024,
  });
  assert.equal(result.signal, null, result.stderr || result.error?.message);
  assert.equal(result.status, 0, result.stderr || result.error?.message);
}

void test('pathname replacement after validation reads the original inode and rejects the next symlink read', posix, (t) => {
  scenario(t, `
    const replacement = join(directory, 'replacement.json');
    fs.writeFileSync(replacement, JSON.stringify({ ...state, label: 'replacement' }));
    let replaced = false;
    const replace = () => {
      if (replaced) return;
      replaced = true;
      fs.renameSync(file, file + '.original');
      fs.symlinkSync(replacement, file);
    };
    fs.lstatSync = (path, ...args) => {
      const info = original.lstatSync(path, ...args);
      if (path === file) replace();
      return info;
    };
    fs.fstatSync = (fd, ...args) => {
      const info = original.fstatSync(fd, ...args);
      if (fd === openedFd) replace();
      return info;
    };
    const { readAutonomyRun } = await load();
    assert.deepEqual(readAutonomyRun(directory), state);
    assert.equal(replaced, true);
    assert.equal(openFlags & fs.constants.O_NOFOLLOW, fs.constants.O_NOFOLLOW);
    assertClosed();
    assert.throws(() => readAutonomyRun(directory));
    assert.equal(closed, 1);
  `);
});

void test('valid JSON growing after validation is rejected after at most the size-limit sentinel', posix, (t) => {
  scenario(t, `
    let grown = false;
    const grow = () => {
      if (grown) return;
      grown = true;
      // Appended whitespace preserves valid JSON, exposing an unbounded read.
      fs.appendFileSync(file, ' '.repeat(maximum + 1));
    };
    fs.lstatSync = (path, ...args) => {
      const info = original.lstatSync(path, ...args);
      if (path === file) grow();
      return info;
    };
    fs.fstatSync = (fd, ...args) => {
      const info = original.fstatSync(fd, ...args);
      if (fd === openedFd) grow();
      return info;
    };
    const { readAutonomyRun } = await load();
    assert.throws(() => readAutonomyRun(directory), /Unsafe or oversized autonomy state file/);
    assert.equal(grown, true);
    assert.equal(readBytes, maximum + 1);
    assertClosed();
  `);
});

void test('the exact byte limit is accepted and an initially oversized file is rejected before reading', posix, (t) => {
  scenario(t, `
    fs.writeFileSync(file, JSON.stringify(state).padEnd(maximum));
    const { readAutonomyRun } = await load();
    assert.deepEqual(readAutonomyRun(directory), state);
    assert.equal(readBytes, maximum);
    assertClosed();
    fs.appendFileSync(file, ' ');
    readBytes = 0;
    closed = 0;
    assert.throws(() => readAutonomyRun(directory), /Unsafe or oversized autonomy state file/);
    assert.equal(readBytes, 0);
    assertClosed();
  `);
});

void test('short descriptor reads complete without changing the validated file', posix, (t) => {
  scenario(t, `
    fs.readSync = (fd, buffer, offset, length, position) => {
      const bytes = original.readSync(fd, buffer, offset, Math.min(length, 3), position);
      if (fd === openedFd) { readBytes += bytes; readCalls++; }
      return bytes;
    };
    const { readAutonomyRun } = await load();
    assert.deepEqual(readAutonomyRun(directory), state);
    assert.ok(readCalls > 2);
    assertClosed();
  `);
});

void test('nonregular directories and FIFOs are rejected without a blocking open or read', posix, (t) => {
  for (const kind of ['directory', 'fifo']) scenario(t, `
    fs.unlinkSync(file);
    if (${JSON.stringify(kind)} === 'directory') fs.mkdirSync(file);
    else execFileSync('mkfifo', ['-m', '600', file], { timeout: 2000 });
    const { readAutonomyRun } = await load();
    assert.throws(() => readAutonomyRun(directory), /Unsafe or oversized autonomy state file/);
    assert.equal(openFlags & fs.constants.O_NONBLOCK, fs.constants.O_NONBLOCK);
    assert.equal(readBytes, 0);
    assertClosed();
  `);
});

void test('stat, read and JSON failures close the descriptor and JSON diagnostics contain no file data', posix, (t) => {
  for (const stage of ['stat', 'read', 'parse']) scenario(t, `
    const stage = ${JSON.stringify(stage)};
    const marker = 'synthetic-private-value-not-for-errors';
    const failure = new Error('synthetic filesystem failure');
    if (stage === 'stat') fs.fstatSync = (fd, ...args) => {
      if (fd === openedFd) throw failure;
      return original.fstatSync(fd, ...args);
    };
    if (stage === 'read') fs.readSync = (fd, ...args) => {
      if (fd === openedFd) throw failure;
      return original.readSync(fd, ...args);
    };
    if (stage === 'parse') fs.writeFileSync(file, '{' + marker);
    const { readAutonomyRun } = await load();
    assert.throws(() => readAutonomyRun(directory), (error) => {
      if (stage === 'parse') {
        assert.equal(error.message, 'Invalid autonomy state JSON');
        assert.equal(String(error.stack).includes(marker), false);
      } else assert.equal(error, failure);
      return true;
    });
    assertClosed();
  `);
});

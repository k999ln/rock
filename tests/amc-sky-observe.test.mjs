import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { runInNewContext } from 'node:vm';

const moduleSource = fs.readFileSync(new URL('../scripts/amc-sky-observe.mjs', import.meta.url), 'utf8');
const digest = (value) => createHash('sha256').update(value).digest('hex');
const canonical = (value) => JSON.stringify(value, (_, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.keys(item).sort().map((key) => [key, item[key]])) : item);

// Evaluate the exact observation module, replacing only import/export syntax.
// Its directives dependency currently imports the unavailable revalidationImpact
// export from amc-goal-engine. Do not mask that separate integration failure.
// This is a filesystem regression suite, not evidence that the full AMC import
// graph, directive authorization, or Git integration works. The canonical adapter
// has the production serialization contract; dependency acceptance rejects calls
// unless a test explicitly provides its empty-dependency fixture adapter.
function loadObserve(fileSystem, dependencies = {}) {
  const boundaries = {
    'node:fs': fileSystem,
    'node:path': path,
    'node:crypto': { createHash },
    'node:child_process': { execFileSync: dependencies.execFileSync ?? (() => { throw new Error('Unexpected Git observation'); }) },
    './amc-sky-directives.mjs': {
      canonical,
      dependencyAcceptances: dependencies.dependencyAcceptances ?? (() => { throw new Error('Unexpected dependency acceptance'); }),
    },
  };
  const source = moduleSource.replace(/import\s+\{([^}]+)\}\s+from\s+(['"])([^'"]+)\2;/g, (_match, names, _quote, name) => {
    assert.ok(Object.hasOwn(boundaries, name), `Unexpected module boundary: ${name}`);
    return `const {${names}} = boundaries[${JSON.stringify(name)}];`;
  }).replace(/\bexport\s+(?=(?:async\s+)?function\b)/g, '');
  return runInNewContext(`${source}\n({ sourceFile, sourceSnapshot, observeSkyTask });`, { boundaries }, { timeout: 1000 });
}

function fixture(t) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(tmpdir(), 'amc-observe-')));
  const root = path.join(dir, 'repository'), outside = path.join(dir, 'outside');
  fs.mkdirSync(root); fs.mkdirSync(outside);
  const binary = Buffer.from([0, 255, 128, 10, 65]);
  const file = path.join(root, 'source.bin'), external = path.join(outside, 'source.bin');
  fs.writeFileSync(file, binary);
  fs.writeFileSync(external, Buffer.from([7, 8, 9]));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return { dir, root, outside, file, external, binary };
}

function instrument(t, hooks = {}) {
  const active = new Set(), opened = [], closed = [], reads = [], stats = [];
  const api = { ...fs,
    openSync(file, flags, ...args) {
      hooks.beforeOpen?.(file, flags);
      const fd = fs.openSync(file, flags, ...args);
      active.add(fd); opened.push(fd);
      hooks.afterOpen?.(fd, file);
      return fd;
    },
    lstatSync(file, options) {
      const stat = fs.lstatSync(file, options);
      stats.push({ kind: 'path', stat, options });
      hooks.afterLstat?.(file, stat, options);
      return stat;
    },
    fstatSync(fd, options) {
      hooks.beforeFstat?.(fd, options);
      const stat = fs.fstatSync(fd, options);
      stats.push({ kind: 'fd', stat, options });
      return stat;
    },
    readFileSync(file, ...args) {
      reads.push(file);
      hooks.beforeRead?.(file);
      return fs.readFileSync(file, ...args);
    },
    closeSync(fd) {
      fs.closeSync(fd);
      active.delete(fd); closed.push(fd);
    },
  };
  t.after(() => { for (const fd of active) fs.closeSync(fd); });
  return { api, active, opened, closed, reads, stats };
}

function rejectedWithoutRead(observe, io, root, name = 'source.bin') {
  assert.throws(() => observe.sourceFile(root, name));
  assert.equal(io.reads.length, 0, 'rejected source must not be read');
  assert.equal(io.active.size, 0, 'rejected source must not leave a descriptor open');
  assert.deepEqual(io.closed, io.opened);
}

void test('sourceFile preserves binary bytes, reports initial absence, and closes the one descriptor', (t) => {
  const f = fixture(t), io = instrument(t), observe = loadObserve(io.api);
  assert.deepEqual(observe.sourceFile(f.root, 'source.bin'), f.binary);
  assert.equal(observe.sourceFile(f.root, 'missing.bin'), null);
  assert.equal(io.opened.length, 1);
  assert.deepEqual(io.reads, io.opened, 'read the same descriptor opened for validation');
  assert.deepEqual(io.closed, io.opened);
  assert.equal(io.active.size, 0);
  for (const fd of io.opened) assert.throws(() => fs.fstatSync(fd), { code: 'EBADF' });
  assert.ok(io.stats.some((item) => item.kind === 'fd'));
  for (const { stat, options } of io.stats) {
    assert.equal(options.bigint, true);
    assert.equal(typeof stat.dev, 'bigint');
    assert.equal(typeof stat.ino, 'bigint');
  }
});

void test('sourceFile permits an inside symlink but refuses outside links, traversal and env paths', (t) => {
  const f = fixture(t), io = instrument(t), observe = loadObserve(io.api);
  fs.symlinkSync(f.file, path.join(f.root, 'inside.bin'));
  assert.deepEqual(observe.sourceFile(f.root, 'inside.bin'), f.binary);
  fs.mkdirSync(path.join(f.root, 'real-directory'));
  fs.writeFileSync(path.join(f.root, 'real-directory', 'source.bin'), f.binary);
  fs.symlinkSync(path.join(f.root, 'real-directory'), path.join(f.root, 'inside-directory'));
  assert.deepEqual(observe.sourceFile(f.root, 'inside-directory/source.bin'), f.binary);
  fs.symlinkSync(path.join(f.root, 'not-created.bin'), path.join(f.root, 'dangling.bin'));
  assert.equal(observe.sourceFile(f.root, 'dangling.bin'), null);
  fs.symlinkSync(f.external, path.join(f.root, 'outside.bin'));
  const before = io.reads.length;
  for (const name of ['outside.bin', '../outside/source.bin', '.env', '.env.local', 'nested/.env.production', './source.bin', 'a//b', 'a\\b', '/absolute'])
    assert.throws(() => observe.sourceFile(f.root, name));
  assert.equal(io.reads.length, before);
});

void test('sourceFile rejects a leaf changed into an outside symlink after canonical validation', (t) => {
  const f = fixture(t);
  let changed = false;
  const swap = (file) => {
    assert.equal(file, f.file);
    if (changed) return;
    changed = true;
    fs.renameSync(f.file, `${f.file}.held`);
    fs.symlinkSync(f.external, f.file);
  };
  const io = instrument(t, {
    beforeOpen: swap,
    // The old pathname reader validated with lstat before reading. This hook
    // also reproduces that race, while the fixed reader has already opened.
    afterLstat(file) { if (io.opened.length === 0) swap(file); },
  });
  rejectedWithoutRead(loadObserve(io.api), io, f.root);
  assert.equal(changed, true);
});

void test('sourceFile rejects a regular leaf replaced after open and closes the original descriptor', (t) => {
  const f = fixture(t);
  const io = instrument(t, { afterOpen() {
    fs.renameSync(f.file, `${f.file}.held`);
    fs.writeFileSync(f.file, Buffer.from([3, 2, 1]));
  } });
  rejectedWithoutRead(loadObserve(io.api), io, f.root);
  assert.equal(io.opened.length, 1);
});

void test('sourceFile revalidates the original inside symlink after opening its target', (t) => {
  const f = fixture(t), alias = path.join(f.root, 'alias.bin');
  fs.symlinkSync(f.file, alias);
  const io = instrument(t, { afterOpen() {
    fs.unlinkSync(alias);
    fs.symlinkSync(f.external, alias);
  } });
  rejectedWithoutRead(loadObserve(io.api), io, f.root, 'alias.bin');
  assert.equal(io.opened.length, 1);
});

void test('sourceFile validates the current regular file when its inode changes before open', (t) => {
  const f = fixture(t);
  const replacement = Buffer.from([4, 5, 6]);
  const original = fs.lstatSync(f.file, { bigint: true });
  const io = instrument(t, { beforeOpen() {
    fs.renameSync(f.file, `${f.file}.held`);
    fs.writeFileSync(f.file, replacement);
    assert.notEqual(fs.lstatSync(f.file, { bigint: true }).ino, original.ino);
  } });
  assert.deepEqual(loadObserve(io.api).sourceFile(f.root, 'source.bin'), replacement);
  assert.equal(io.opened.length, 1);
  assert.deepEqual(io.reads, io.opened);
  assert.deepEqual(io.closed, io.opened);
});

for (const restoreAfterOpen of [false, true]) {
  void test(`sourceFile rejects a parent symlink swap${restoreAfterOpen ? ' even after an ABA restoration' : ''}`, (t) => {
    const f = fixture(t), parent = path.join(f.root, 'nested'), held = `${parent}.held`;
    fs.mkdirSync(parent);
    fs.writeFileSync(path.join(parent, 'source.bin'), f.binary);
    const io = instrument(t, {
      beforeOpen() { fs.renameSync(parent, held); fs.symlinkSync(f.outside, parent); },
      afterOpen() {
        if (restoreAfterOpen) { fs.unlinkSync(parent); fs.renameSync(held, parent); }
      },
    });
    rejectedWithoutRead(loadObserve(io.api), io, f.root, 'nested/source.bin');
    assert.equal(io.opened.length, 1);
    assert.ok(io.stats.some(({ kind, stat }) => kind === 'fd' && typeof stat.ino === 'bigint'));
  });
}

void test('sourceFile rejects initial nonregular files and a raced FIFO without a blocking open', (t) => {
  const f = fixture(t), fifo = path.join(f.root, 'pipe');
  execFileSync('mkfifo', [fifo]);
  fs.mkdirSync(path.join(f.root, 'directory'));
  const initial = instrument(t, { beforeOpen(_file, flags) {
    assert.ok(flags & fs.constants.O_NONBLOCK, 'prevent a blocking FIFO open even if safe flags regress');
  } });
  rejectedWithoutRead(loadObserve(initial.api), initial, f.root, 'pipe');
  rejectedWithoutRead(loadObserve(initial.api), initial, f.root, 'directory');
  let checkedFlags = false;
  const io = instrument(t, { beforeOpen(_file, flags) {
    // Check before opening so a missing NONBLOCK regression cannot hang CI.
    assert.ok(flags & fs.constants.O_NONBLOCK);
    assert.ok(flags & fs.constants.O_NOFOLLOW);
    checkedFlags = true;
    fs.renameSync(f.file, `${f.file}.held`);
    execFileSync('mkfifo', [f.file]);
  } });
  rejectedWithoutRead(loadObserve(io.api), io, f.root);
  assert.equal(checkedFlags, true);
  assert.equal(io.opened.length, 1, 'the real FIFO descriptor must reach regular-file validation');
});

void test('sourceFile refuses unavailable safe-open flags before opening or reading', (t) => {
  const f = fixture(t);
  for (const name of ['O_NOFOLLOW', 'O_NONBLOCK']) for (const value of [undefined, 0, NaN]) {
    const io = instrument(t);
    io.api.constants = { ...fs.constants, [name]: value };
    rejectedWithoutRead(loadObserve(io.api), io, f.root);
    assert.equal(io.opened.length, 0);
  }
});

void test('sourceFile closes its descriptor when fstat, named lstat or reading fails', async (t) => {
  for (const operation of ['fstat', 'lstat', 'read']) await t.test(operation, (t) => {
    const f = fixture(t), failure = new Error('Synthetic I/O failure');
    const io = instrument(t, (operation === 'fstat' ? { beforeFstat() { throw failure; } }
        : operation === 'lstat' ? { afterLstat() { throw failure; } }
          : { beforeRead() { throw failure; } }));
    assert.throws(() => loadObserve(io.api).sourceFile(f.root, 'source.bin'), (error) => error === failure);
    assert.equal(io.opened.length, 1);
    assert.deepEqual(io.closed, io.opened);
    assert.equal(io.active.size, 0);
  });
});

void test('sourceFile treats disappearance after open as an error, not initial absence', (t) => {
  const f = fixture(t);
  const io = instrument(t, { afterOpen() { fs.renameSync(f.file, `${f.file}.held`); } });
  assert.throws(() => loadObserve(io.api).sourceFile(f.root, 'source.bin'), { code: 'ENOENT' });
  assert.equal(io.opened.length, 1);
  assert.equal(io.reads.length, 0);
  assert.deepEqual(io.closed, io.opened);
});

void test('sourceFile reads the validated descriptor when the pathname changes just before reading', (t) => {
  const f = fixture(t);
  const io = instrument(t, { beforeRead() {
    fs.renameSync(f.file, `${f.file}.held`);
    fs.symlinkSync(f.external, f.file);
  } });
  assert.equal(digest(loadObserve(io.api).sourceFile(f.root, 'source.bin')), digest(f.binary),
    'the returned buffer must be the validated file, not the replacement target');
  assert.deepEqual(io.reads, io.opened);
  assert.deepEqual(io.closed, io.opened);
});

void test('sourceSnapshot hashes each unique file buffer once and keeps initial absence null', (t) => {
  const f = fixture(t), io = instrument(t), commands = [];
  const observe = loadObserve(io.api, { execFileSync(command, args, options) {
    assert.equal(command, 'git'); assert.equal(options.cwd, f.root);
    commands.push(Array.from(args));
    if (JSON.stringify(args) === JSON.stringify(['rev-parse', 'HEAD'])) return `${'a'.repeat(40)}\n`;
    assert.deepEqual(Array.from(args), ['status', '--porcelain=v1', '-z']);
    return '';
  } });
  const result = observe.sourceSnapshot(f.root, ['source.bin', 'missing.bin', 'source.bin']);
  assert.deepEqual(JSON.parse(JSON.stringify(result.scopedFiles)), [
    { path: 'missing.bin', sha256: null }, { path: 'source.bin', sha256: digest(f.binary) },
  ]);
  assert.equal(result.scopedFingerprint, digest(canonical(result.scopedFiles)));
  assert.equal(io.reads.length, 1);
  assert.equal(commands.length, 2);
});

void test('observeSkyTask hashes one captured buffer per source input and preserves absent output markers', async (t) => {
  const f = fixture(t);
  fs.mkdirSync(path.join(f.root, 'data', 'amc'), { recursive: true });
  fs.writeFileSync(path.join(f.root, 'data', 'amc', 'sky-directives-v2.json'), JSON.stringify({ tasks: {
    fixture: { readPaths: [], writePaths: ['source.bin', 'missing.bin'] },
  } }));
  fs.writeFileSync(path.join(f.root, 'data', 'amc', 'sky-contracts-v1.json'), JSON.stringify({ contracts: [] }));
  const io = instrument(t);
  let dependencyCalls = 0;
  const observe = loadObserve(io.api, { dependencyAcceptances(goal) {
    assert.equal(goal.tasks.length, 0, 'this adapter only accepts the explicit no-dependency fixture');
    dependencyCalls++;
    return [];
  } });
  const result = await observe.observeSkyTask({ root: f.root, taskId: 'fixture', owner: 'fixture-owner',
    assignee: 'fixture-worker', reviewers: ['fixture-reviewer'],
    goal: { id: 'fixture-goal', tasks: [{ id: 'fixture', dependsOn: [], requirementIds: [] }] },
  });
  assert.deepEqual(JSON.parse(JSON.stringify(result.observation.sourceInputs)), [
    { path: 'missing.bin', hash: 'absent' }, { path: 'source.bin', hash: digest(f.binary) },
  ]);
  assert.equal(io.reads.length, 3, 'two registries and one source buffer, with no duplicate source read');
  assert.equal(dependencyCalls, 1);
  assert.deepEqual(io.closed, io.opened);
});

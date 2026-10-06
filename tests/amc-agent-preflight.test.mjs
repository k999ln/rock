import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';

const sourceUrl = new URL('../scripts/amc-agent.mjs', import.meta.url).href;
const moduleSource = fs.readFileSync(new URL(sourceUrl), 'utf8');
const registry = fileURLToPath(new URL('../data/amc/agent-definitions.json', import.meta.url));
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

// Run the actual installer with instrumented real filesystem calls. Only module
// boundaries and import.meta are adapted; definitions() reads the real registry.
// These tests cover existing-file reads, not the later parent-path write race or
// transaction-wide atomicity. The ordinary amc-agent suite imports it directly.
function loadAgent(fileSystem) {
  const boundaries = {
    'node:fs': fileSystem,
    'node:path': path,
    'node:url': { fileURLToPath },
    'node:child_process': { spawn() { throw new Error('Unexpected agent launch'); } },
  };
  const source = moduleSource.replace(/import\s+\{([^}]+)\}\s+from\s+(['"])([^'"]+)\2;/g, (_match, names, _quote, name) => {
    assert.ok(Object.hasOwn(boundaries, name), `Unexpected module import: ${name}`);
    return `const {${names}} = boundaries[${JSON.stringify(name)}];`;
  }).replace(/\bexport\s+(?=(?:async\s+)?function\b)/g, '').replaceAll('import.meta.url', 'sourceUrl');
  return runInNewContext(`${source}\n({ definitions, renderAgent, installAgents });`, {
    boundaries, sourceUrl, Buffer, process: { argv: [] },
  }, { timeout: 1000 });
}

function fixture(t, seed = true) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(tmpdir(), 'amc-preflight-')));
  const project = path.join(dir, 'project'), outside = path.join(dir, 'outside');
  const config = path.join(project, '.codex'), directory = path.join(config, 'agents');
  fs.mkdirSync(directory, { recursive: true }); fs.mkdirSync(outside);
  const agent = loadAgent(fs);
  const entries = agent.definitions().map((definition) => {
    const name = `${definition.name}.toml`, text = agent.renderAgent(definition);
    const entry = { name, path: path.join(directory, name), text, bytes: Buffer.from(text, 'utf8') };
    if (seed) fs.writeFileSync(entry.path, entry.bytes);
    // Match byte length so size checks cannot conceal an identity/routing flaw.
    fs.writeFileSync(path.join(outside, name), Buffer.alloc(entry.bytes.length, 0x7a));
    return entry;
  });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return { dir, project, config, directory, outside, entries, first: entries[0] };
}

function instrument(t, hooks = {}) {
  const active = new Map(), opened = [], closed = [], reads = [], writes = [], mkdirs = [], stats = [];
  const api = { ...fs,
    openSync(file, flags, ...args) {
      hooks.beforeOpen?.(file, flags);
      const fd = fs.openSync(file, flags, ...args);
      active.set(fd, file); opened.push(fd);
      hooks.afterOpen?.(fd, file);
      return fd;
    },
    fstatSync(fd, options) {
      hooks.beforeFstat?.(fd, options);
      const result = fs.fstatSync(fd, options);
      stats.push({ kind: 'fd', options, result });
      return result;
    },
    lstatSync(file, options) {
      hooks.beforeLstat?.(file, options);
      const result = fs.lstatSync(file, options);
      if (options?.bigint) stats.push({ kind: 'named', options, result });
      return result;
    },
    readSync(fd, buffer, offset, length, position) {
      const file = active.get(fd);
      hooks.beforeRead?.(file, fd);
      const count = fs.readSync(fd, buffer, offset, hooks.maxChunk ? Math.min(length, hooks.maxChunk) : length, position);
      reads.push({ file, fd, requested: length, bytes: Buffer.from(buffer.subarray(offset, offset + count)) });
      return count;
    },
    readFileSync(file, ...args) {
      if (file === registry) return fs.readFileSync(file, ...args);
      hooks.beforeRead?.(file, null);
      const result = fs.readFileSync(file, ...args);
      reads.push({ file, fd: null, requested: null, bytes: Buffer.from(result) });
      return result;
    },
    closeSync(fd) { fs.closeSync(fd); active.delete(fd); closed.push(fd); },
    mkdirSync(...args) { mkdirs.push(args); return fs.mkdirSync(...args); },
    writeFileSync(...args) { writes.push(args); return fs.writeFileSync(...args); },
  };
  t.after(() => { for (const fd of active.keys()) fs.closeSync(fd); });
  return { api, active, opened, closed, reads, writes, mkdirs, stats };
}

function noWrites(io) {
  assert.equal(io.writes.length, 0, 'all existing entries must pass before any file write');
  assert.equal(io.mkdirs.length, 0, 'failed preflight must precede directory creation');
}
function closed(io) {
  assert.equal(io.active.size, 0);
  assert.deepEqual(io.closed, io.opened);
}
function rejectBeforeRead(f, io) {
  assert.throws(() => loadAgent(io.api).installAgents(f.project));
  assert.equal(io.reads.length, 0, 'unsafe existing files must not be read');
  noWrites(io); closed(io);
}
function bytesRead(io, file) { return Buffer.concat(io.reads.filter((read) => read.file === file).map((read) => read.bytes)); }

void test('generated definitions remain idempotent with exact UTF-8 descriptor reads and no file writes', (t) => {
  const f = fixture(t), io = instrument(t), agent = loadAgent(io.api);
  const expected = f.entries.map((entry) => entry.path);
  assert.deepEqual(Array.from(agent.installAgents(f.project)), Array.from(expected));
  assert.equal(io.writes.length, 0);
  assert.equal(io.opened.length, 3);
  for (const entry of f.entries) {
    assert.equal(digest(bytesRead(io, entry.path)), digest(entry.bytes));
    assert.ok(io.reads.filter((read) => read.file === entry.path).every((read) => typeof read.fd === 'number'));
  }
  for (const { result, options } of io.stats) {
    assert.equal(options.bigint, true);
    assert.equal(typeof result.dev, 'bigint'); assert.equal(typeof result.ino, 'bigint');
  }
  assert.ok(io.stats.some((stat) => stat.kind === 'named'));
  closed(io);
});

void test('an initially absent destination is created with wx after every existing entry passes', (t) => {
  const f = fixture(t, false), io = instrument(t);
  loadAgent(io.api).installAgents(f.project);
  assert.equal(io.writes.length, 3);
  for (const [file, text, options] of io.writes) {
    assert.equal(options.flag, 'wx'); assert.equal(options.mode, 0o600);
    assert.equal(digest(fs.readFileSync(file)), digest(Buffer.from(text, 'utf8')));
  }
  loadAgent(io.api).installAgents(f.project);
  assert.equal(io.writes.length, 3, 'the second installation must not rewrite definitions');
  closed(io);
});

void test('one custom definition prevents every write, including earlier missing entries', (t) => {
  const f = fixture(t, false), last = f.entries.at(-1);
  fs.writeFileSync(last.path, Buffer.alloc(last.bytes.length, 0x78));
  const io = instrument(t);
  assert.throws(() => loadAgent(io.api).installAgents(f.project));
  noWrites(io); closed(io);
  for (const entry of f.entries.slice(0, -1)) assert.equal(fs.existsSync(entry.path), false);
  assert.equal(digest(fs.readFileSync(last.path)), digest(Buffer.alloc(last.bytes.length, 0x78)));
});

void test('a leaf changed to a same-size outside symlink immediately before open is rejected without reading', (t) => {
  const f = fixture(t);
  const io = instrument(t, { beforeOpen(file) {
    assert.equal(file, f.first.path);
    fs.renameSync(file, `${file}.held`);
    fs.symlinkSync(path.join(f.outside, f.first.name), file);
  } });
  rejectBeforeRead(f, io);
});

for (const restore of [false, true]) {
  void test(`outside parent replacement${restore ? ' with ABA restoration after open' : ''} is rejected before bytes are read`, (t) => {
    const f = fixture(t), held = `${f.directory}.held`;
    const io = instrument(t, {
      beforeOpen() { fs.renameSync(f.directory, held); fs.symlinkSync(f.outside, f.directory); },
      afterOpen() { if (restore) { fs.unlinkSync(f.directory); fs.renameSync(held, f.directory); } },
    });
    rejectBeforeRead(f, io);
    assert.equal(io.opened.length, 1);
  });
}

void test('initial and raced FIFO entries are rejected through a nonblocking descriptor', async (t) => {
  for (const raced of [false, true]) await t.test(raced ? 'raced FIFO' : 'initial FIFO', (t) => {
    const f = fixture(t);
    const replace = () => { fs.renameSync(f.first.path, `${f.first.path}.held`); execFileSync('mkfifo', [f.first.path]); };
    if (!raced) replace();
    let checked = false;
    const io = instrument(t, { beforeOpen(_file, flags) {
      // Assert before the real FIFO open so a flag regression cannot hang CI.
      assert.ok(flags & fs.constants.O_NONBLOCK); assert.ok(flags & fs.constants.O_NOFOLLOW);
      checked = true;
      if (raced) replace();
    } });
    rejectBeforeRead(f, io);
    assert.equal(checked, true);
    assert.equal(io.opened.length, 1);
  });
});

void test('post-open disappearance is an error instead of an absent destination', (t) => {
  const f = fixture(t);
  const io = instrument(t, { afterOpen(_fd, file) { fs.renameSync(file, `${file}.held`); } });
  assert.throws(() => loadAgent(io.api).installAgents(f.project), { code: 'ENOENT' });
  assert.equal(io.opened.length, 1); assert.equal(io.reads.length, 0);
  noWrites(io); closed(io);
});

void test('post-open inode replacement is rejected even when the replacement has identical content', (t) => {
  const f = fixture(t);
  const io = instrument(t, { afterOpen(_fd, file) {
    fs.renameSync(file, `${file}.held`); fs.writeFileSync(file, f.first.bytes);
  } });
  rejectBeforeRead(f, io);
  assert.equal(io.opened.length, 1);
});

void test('a pathname replacement just before reading never supplies outside bytes to preflight', (t) => {
  const f = fixture(t);
  let swapped = false;
  const io = instrument(t, { beforeRead(file) {
    if (swapped || file !== f.first.path) return;
    swapped = true;
    fs.renameSync(file, `${file}.held`);
    fs.symlinkSync(path.join(f.outside, f.first.name), file);
  } });
  // The old pathname reader is allowed to finish its real read for negative
  // reproduction. Assert its captured bytes before propagating its error.
  let error;
  try { loadAgent(io.api).installAgents(f.project); } catch (caught) { error = caught; }
  assert.equal(swapped, true);
  assert.equal(digest(bytesRead(io, f.first.path)), digest(f.first.bytes), 'preflight consumed a replacement target instead of the validated file');
  assert.equal(error, undefined);
  assert.ok(io.reads.every((read) => typeof read.fd === 'number'));
  assert.equal(io.writes.length, 0); closed(io);
});

void test('oversized existing definitions are refused without reading or writing', (t) => {
  const f = fixture(t);
  fs.appendFileSync(f.first.path, Buffer.alloc(4096, 0x78));
  const io = instrument(t);
  rejectBeforeRead(f, io);
  assert.equal(io.opened.length, 1);
});

void test('growth after size validation is detected with at most expected byte length plus one read', (t) => {
  const f = fixture(t);
  let grew = false;
  const io = instrument(t, { beforeRead(file) {
    if (grew) return;
    grew = true; fs.appendFileSync(file, Buffer.alloc(8192, 0x78));
  } });
  assert.throws(() => loadAgent(io.api).installAgents(f.project));
  assert.equal(grew, true);
  assert.equal(bytesRead(io, f.first.path).length, f.first.bytes.length + 1);
  assert.ok(io.reads.every((read) => read.requested <= f.first.bytes.length + 1));
  noWrites(io); closed(io);
});

void test('bounded descriptor reads handle short chunks and compare UTF-8 bytes exactly', (t) => {
  const f = fixture(t), io = instrument(t, { maxChunk: 37 });
  loadAgent(io.api).installAgents(f.project);
  for (const entry of f.entries) assert.equal(digest(bytesRead(io, entry.path)), digest(entry.bytes));
  assert.ok(io.reads.length > 6, 'exercise the read loop rather than one full-file read');
  assert.equal(io.writes.length, 0); closed(io);
});

void test('fstat, named lstat and read failures all close the opened descriptor without writes', async (t) => {
  for (const operation of ['fstat', 'lstat', 'read']) await t.test(operation, (t) => {
    const f = fixture(t), failure = new Error('Synthetic preflight I/O failure');
    const io = instrument(t, {
      ...(operation === 'fstat' ? { beforeFstat() { throw failure; } }
        : operation === 'lstat' ? { beforeLstat(file) { if (file === f.first.path) throw failure; } }
          : { beforeRead() { throw failure; } }),
    });
    assert.throws(() => loadAgent(io.api).installAgents(f.project), (error) => error === failure);
    assert.equal(io.opened.length, 1);
    noWrites(io); closed(io);
  });
});

void test('missing, zero and noninteger safe-open flags fail before any destination open', (t) => {
  const f = fixture(t);
  for (const name of ['O_NOFOLLOW', 'O_NONBLOCK']) for (const value of [undefined, 0, NaN]) {
    const io = instrument(t);
    io.api.constants = { ...fs.constants, [name]: value };
    rejectBeforeRead(f, io);
    assert.equal(io.opened.length, 0);
  }
});

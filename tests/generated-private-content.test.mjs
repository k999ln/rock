import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, readFileSync, readdirSync, writeFileSync, symlinkSync, linkSync, statSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { writeGeneratedContent } from '../scripts/generate-private-modules.mjs';

function fixture(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'rock-generated-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return { root, target: join(root, 'private-content.ts') };
}

void test('generation rejects an output symlink without reading or overwriting its target', (t) => {
  const { root, target } = fixture(t);
  const canary = join(root, 'canary');
  writeFileSync(canary, 'preserve this independent file');
  symlinkSync(canary, target);
  assert.throws(() => writeGeneratedContent(target, 'generated content'));
  assert.equal(readFileSync(canary, 'utf8'), 'preserve this independent file');
  assert.deepEqual(readdirSync(root).sort(), ['canary', 'private-content.ts']);
});

void test('generation rejects linked files and non-regular destinations', (t) => {
  const { root, target } = fixture(t);
  const canary = join(root, 'canary');
  writeFileSync(canary, 'preserve');
  linkSync(canary, target);
  assert.throws(() => writeGeneratedContent(target, 'replacement'), /regular/);
  assert.equal(readFileSync(canary, 'utf8'), 'preserve');
  rmSync(target);
  mkdirSync(target);
  assert.throws(() => writeGeneratedContent(target, 'replacement'), /regular/);
});

void test('generation refuses a symlinked parent and leaves both directories untouched', (t) => {
  const { root } = fixture(t);
  const real = join(root, 'real');
  const alias = join(root, 'alias');
  mkdirSync(real);
  symlinkSync(real, alias);
  assert.throws(() => writeGeneratedContent(join(alias, 'output'), 'replacement'), /real directory/);
  assert.deepEqual(readdirSync(real), []);
});

void test('a destination swapped during unchanged read is refused and does not certify a symlink', (t) => {
  const { root, target } = fixture(t);
  const canary = join(root, 'canary');
  writeFileSync(target, 'same output');
  writeFileSync(canary, 'keep');
  const read = fs.readFileSync;
  const replacement = t.mock.method(fs, 'readFileSync', (path, ...args) => {
    const bytes = read(path, ...args);
    if (typeof path === 'number') {
      rmSync(target);
      symlinkSync(canary, target);
    }
    return bytes;
  });
  syncBuiltinESMExports();
  try {
    assert.throws(() => writeGeneratedContent(target, 'same output'), /changed during/);
  } finally {
    replacement.mock.restore();
    syncBuiltinESMExports();
  }
  assert.equal(readFileSync(canary, 'utf8'), 'keep');
});

void test('generation atomically replaces complete content, keeps restrictive mode and skips unchanged output', (t) => {
  const { target } = fixture(t);
  assert.equal(writeGeneratedContent(target, 'first complete version'), true);
  const original = statSync(target);
  assert.equal(writeGeneratedContent(target, 'first complete version'), false);
  assert.equal(statSync(target).ino, original.ino);
  assert.equal(writeGeneratedContent(target, 'second complete version'), true);
  assert.equal(readFileSync(target, 'utf8'), 'second complete version');
  assert.equal(statSync(target).mode & 0o777, 0o600);
});

void test('independent concurrent generators publish whole files and clean temporary outputs', async (t) => {
  const { root, target } = fixture(t);
  const moduleUrl = new URL('../scripts/generate-private-modules.mjs', import.meta.url).href;
  const versions = ['A'.repeat(100_000), 'B'.repeat(100_000)];
  const run = (content) => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e',
      `import {writeGeneratedContent} from ${JSON.stringify(moduleUrl)};writeGeneratedContent(${JSON.stringify(target)},${JSON.stringify(content)});`], { stdio: 'ignore' });
    child.on('error', reject);
    child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`generator exited ${code}`)));
  });
  await Promise.all(versions.map(run));
  assert.ok(versions.includes(readFileSync(target, 'utf8')));
  assert.deepEqual(readdirSync(root), ['private-content.ts']);
});

void test('a failed publish removes temporary output without deleting the existing destination', (t) => {
  const { root, target } = fixture(t);
  writeFileSync(target, 'existing content');
  const replacement = t.mock.method(fs, 'renameSync', () => {
    throw Object.assign(new Error('simulated storage failure'), { code: 'EIO' });
  });
  syncBuiltinESMExports();
  try {
    assert.throws(() => writeGeneratedContent(target, 'new content'), /storage failure/);
  } finally {
    replacement.mock.restore();
    syncBuiltinESMExports();
  }
  assert.equal(readFileSync(target, 'utf8'), 'existing content');
  assert.deepEqual(readdirSync(root), ['private-content.ts']);
});

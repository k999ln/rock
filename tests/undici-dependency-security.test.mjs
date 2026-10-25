import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const lock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'));
const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const semver = require('semver');
const fixedRange = '>=7.30.1 <8';

void test('undici override permits patched 7.x updates and every locked copy is patched', () => {
  assert.ok(semver.satisfies('7.30.1', manifest.overrides.undici));
  assert.ok(semver.satisfies('7.30.2', manifest.overrides.undici));
  assert.equal(semver.satisfies('7.29.1', manifest.overrides.undici), false);
  assert.equal(semver.satisfies('8.0.0', manifest.overrides.undici), false);
  const copies = Object.entries(lock.packages).filter(([path]) => path.endsWith('/node_modules/undici') || path === 'node_modules/undici');
  assert.ok(copies.length > 0);
  for (const [path, item] of copies) {
    assert.ok(semver.satisfies(item.version, fixedRange), `${path}: ${item.version}`);
    assert.ok(item.integrity?.startsWith('sha512-'));
  }
});

void test('all installed undici consumers resolve the patched locked package', () => {
  const consumers = Object.entries(lock.packages).filter(([, item]) => item.dependencies?.undici);
  assert.ok(consumers.some(([path]) => path === 'node_modules/@ai-sdk/provider-utils'));
  assert.ok(consumers.some(([path]) => path === 'node_modules/miniflare'));
  for (const [path] of consumers) {
    const consumer = createRequire(new URL(`../${path}/package.json`, import.meta.url));
    const installed = consumer('undici/package.json');
    assert.ok(semver.satisfies(installed.version, fixedRange), `${path}: ${installed.version}`);
    assert.equal(installed.version, require('undici/package.json').version);
  }
});

void test('Mini undici override and lock stay on patched 8.x', () => {
  const miniManifest = JSON.parse(readFileSync(new URL('../sites/avocado-mini/package.json', import.meta.url), 'utf8'));
  const miniLock = JSON.parse(readFileSync(new URL('../sites/avocado-mini/package-lock.json', import.meta.url), 'utf8'));
  assert.ok(semver.satisfies('8.12.2', miniManifest.overrides.undici));
  assert.ok(semver.satisfies('8.12.3', miniManifest.overrides.undici));
  assert.equal(semver.satisfies('8.11.2', miniManifest.overrides.undici), false);
  assert.equal(semver.satisfies('9.0.0', miniManifest.overrides.undici), false);
  const copies = Object.entries(miniLock.packages).filter(([path]) => path.endsWith('/node_modules/undici') || path === 'node_modules/undici');
  assert.ok(copies.length > 0);
  for (const [path, item] of copies) {
    assert.ok(semver.satisfies(item.version, '>=8.12.2 <9'), `${path}: ${item.version}`);
    assert.ok(item.integrity?.startsWith('sha512-'));
  }
});

void test('Mini unifont actually resolves the patched 8.x package', () => {
  const miniLock = JSON.parse(readFileSync(new URL('../sites/avocado-mini/package-lock.json', import.meta.url), 'utf8'));
  const unifont = createRequire(new URL('../sites/avocado-mini/node_modules/unifont/package.json', import.meta.url));
  const installed = unifont('undici/package.json');
  assert.ok(semver.satisfies(installed.version, '>=8.12.2 <9'));
  assert.equal(installed.version, miniLock.packages['node_modules/undici'].version);
});

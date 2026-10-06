import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const braces = require(process.env.BRACES_SECURITY_TEST_MODULE || '../vendor/braces');
const CachePolicy = require(process.env.CACHE_SECURITY_TEST_MODULE || '../sites/avocado-mini/vendor/http-cache-semantics');

void test('brace patterns reject excessive nesting before recursive walkers', () => {
  for (const method of [braces, braces.parse, braces.compile, braces.expand, braces.stringify]) {
    for (const [open, close] of [['{', '}'], ['(', ')']]) {
      const pattern = open.repeat(4000) + 'a,b' + close.repeat(4000);
      assert.throws(() => method(pattern), error => error instanceof SyntaxError && /maximum nesting depth/.test(error.message));
    }
  }
});
void test('direct AST walkers also reject deep and cyclic children', () => {
  for (const method of [braces.compile, braces.expand, braces.stringify]) {
    let ast = { type: 'text', value: 'a' };
    for (let i = 0; i < 4000; i++) ast = { type: 'root', nodes: [ast] };
    assert.throws(() => method(ast), SyntaxError);
    const cycle = { type: 'root', nodes: [] }; cycle.nodes.push(cycle);
    assert.throws(() => method(cycle), SyntaxError);
  }
});
void test('normal glob semantics, escaped braces, ranges and invalid braces remain compatible', () => {
  assert.deepEqual(braces('src/{a,b}/*.{ts,tsx}', { expand: true }), ['src/a/*.ts', 'src/a/*.tsx', 'src/b/*.ts', 'src/b/*.tsx']);
  assert.deepEqual(braces.expand('{01..03}'), ['01', '02', '03']);
  assert.equal(braces.compile('{a,b}'), '(a|b)');
  assert.equal(braces.stringify(braces.parse('a/{b,c}/d')), 'a/{b,c}/d');
  assert.deepEqual(braces.expand('a/{b,c'), ['a/{b,c']);
  assert.equal(braces.compile('\\{'.repeat(150) + 'a' + '\\}'.repeat(150)), '{'.repeat(150) + 'a' + '}'.repeat(150));
  assert.doesNotThrow(() => braces.compile('{'.repeat(90) + 'a,b' + '}'.repeat(90)));
});
void test('all micromatch consumers resolve the reviewed braces implementation', () => {
  const micromatchRequire = createRequire(require.resolve('micromatch'));
  assert.equal(micromatchRequire.resolve('braces'), require.resolve('../vendor/braces'));
  assert.deepEqual(require('micromatch')(['a.js', 'b.ts', 'c.txt'], '*.{js,ts}'), ['a.js', 'b.ts']);
});
const request = { url: 'https://fixture.invalid/private', method: 'GET', headers: {} };
function policy(headers, options) { return new CachePolicy(request, { status: 200, headers }, options); }
void test('client max-stale cannot revive security-zeroed cached responses', () => {
  for (const headers of [
    { 'set-cookie': 'session=synthetic-user-a', 'cache-control': 'max-age=3600' },
    { 'cache-control': 'proxy-revalidate, max-age=3600' },
    { 'cache-control': 'no-cache, max-age=3600' },
    { 'cache-control': 'no-store, max-age=3600' },
    { 'cache-control': 'private, max-age=3600' },
  ]) {
    for (const directive of ['max-stale', 'max-stale=999999']) {
      const cache = policy(headers);
      const incoming = { ...request, headers: { 'cache-control': directive } };
      assert.equal(cache.satisfiesWithoutRevalidation(incoming), false);
      const result = cache.evaluateRequest(incoming);
      assert.equal(result.response, undefined);
      assert.equal(result.revalidation.synchronous, true);
      // Persistence must retain the same prohibition after reload.
      assert.equal(CachePolicy.fromObject(cache.toObject()).satisfiesWithoutRevalidation(incoming), false);
    }
  }
});
void test('stale-while-revalidate cannot bypass security prohibitions', () => {
  const cache = policy({ 'set-cookie': 'session=synthetic-user-a', 'cache-control': 'max-age=0, stale-while-revalidate=3600' });
  assert.equal(cache.evaluateRequest(request).response, undefined);
});
void test('public, private-cache and ordinary stale reuse preserve intended behavior', () => {
  assert.equal(policy({ 'cache-control': 'public, max-age=3600' }).satisfiesWithoutRevalidation(request), true);
  assert.equal(policy({ 'set-cookie': 'session=synthetic', 'cache-control': 'public, max-age=3600' }).satisfiesWithoutRevalidation(request), true);
  assert.equal(policy({ 'cache-control': 'private, max-age=3600' }, { shared: false }).satisfiesWithoutRevalidation(request), true);
  assert.equal(policy({ 'cache-control': 'public, max-age=0' }).satisfiesWithoutRevalidation({ ...request, headers: { 'cache-control': 'max-stale=3600' } }), true);
});
void test('lockfiles retain explicit local fork identities without vulnerable registry copies', () => {
  for (const [lockPath, name, fork] of [
    ['../package-lock.json', 'braces', '@rockstar/braces'],
    ['../sites/avocado-mini/package-lock.json', 'http-cache-semantics', '@rockstar/http-cache-semantics'],
  ]) {
    const lock = JSON.parse(readFileSync(new URL(lockPath, import.meta.url)));
    assert.equal(lock.packages['vendor/' + name].name, fork);
    for (const [path, item] of Object.entries(lock.packages)) {
      if (path.endsWith('node_modules/' + name)) {
        assert.equal(item.link, true);
        assert.equal(item.resolved, 'vendor/' + name);
      }
    }
  }
});

void test('connection header tokenization is linear and preserves hop-by-hop removal', () => {
  const cache = policy({ 'cache-control': 'public, max-age=3600' });
  const headers = cache._copyWithoutHopByHopHeaders({
    connection: ' \tx-remove' + ' '.repeat(1_000_000) + ',\t x-remove-too  ',
    'x-remove': 'private', 'x-remove-too': 'private', 'x-keep': 'public',
  });
  assert.equal(headers['x-remove'], undefined);
  assert.equal(headers['x-remove-too'], undefined);
  assert.equal(headers['x-keep'], 'public');
});

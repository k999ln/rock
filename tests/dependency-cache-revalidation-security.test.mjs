import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const CachePolicy = require('../sites/avocado-mini/vendor/http-cache-semantics');

// Only time is controlled; every policy decision runs the actual local fork.
class FixedClockPolicy extends CachePolicy {
  now() { return this.clock ?? 1_800_000_000_000; }
}

const request = {
  url: 'https://fixture.invalid/cache-entry',
  method: 'GET',
  headers: { host: 'fixture.invalid', 'accept-language': 'en' },
};
const errorStatuses = [500, 502, 503, 504];
const unsafeSharedHeaders = [
  ['shared-cookie', { 'set-cookie': 'fixture=synthetic', 'cache-control': 'max-age=0, stale-if-error=3600' }],
  ['no-cache', { 'cache-control': 'no-cache, max-age=0, stale-if-error=3600' }],
  ['proxy-revalidate', { 'cache-control': 'proxy-revalidate, max-age=0, stale-if-error=3600' }],
  ['must-revalidate', { 'cache-control': 'must-revalidate, max-age=0, stale-if-error=3600' }],
  ['expired-s-maxage', { 'cache-control': 'public, s-maxage=0, stale-if-error=3600' }],
];
function makePolicy(headers, options, originalRequest = request) {
  return new FixedClockPolicy(originalRequest, { status: 200, headers }, options);
}
function versions(cache) {
  return [
    ['original', cache],
    ['serialized', FixedClockPolicy.fromObject(cache.toObject())],
  ];
}
function assertNoFallback(cache, incoming, status, context) {
  const result = cache.revalidatedPolicy(incoming, { status, headers: {} });
  assert.notEqual(result.policy, cache, context);
  assert.equal(result.policy.status(), status, context);
  assert.equal(result.matches, false, context);
  assert.equal(result.modified, true, context);
}

for (const [name, headers] of unsafeSharedHeaders) {
  void test(`stale-if-error cannot revive ${name} responses`, () => {
    for (const [version, cache] of versions(makePolicy(headers))) {
      assert.equal(cache.storable(), true, name);
      for (const status of errorStatuses) {
        assertNoFallback(cache, request, status, `${name}/${version}/${status}`);
      }
    }
  });
}

void test('non-storable responses cannot reappear through origin-error fallback', () => {
  const cases = [
    ['no-store', { 'cache-control': 'no-store, max-age=0, stale-if-error=3600' }, request],
    ['shared-private', { 'cache-control': 'private, max-age=0, stale-if-error=3600' }, request],
    ['request-no-store', { 'cache-control': 'max-age=0, stale-if-error=3600' },
      { ...request, headers: { ...request.headers, 'cache-control': 'no-store' } }],
    ['authenticated-without-shared-opt-in', { 'cache-control': 'max-age=0, stale-if-error=3600' },
      { ...request, headers: { ...request.headers, authorization: 'Bearer synthetic-fixture' } }],
  ];
  for (const [name, headers, originalRequest] of cases) {
    for (const [version, cache] of versions(makePolicy(headers, undefined, originalRequest))) {
      assert.equal(cache.storable(), false, name);
      for (const status of errorStatuses) {
        assertNoFallback(cache, originalRequest, status, `${name}/${version}/${status}`);
      }
    }
  }
});

void test('missing origin responses cannot revive prohibited cache entries', () => {
  const cases = [
    ...unsafeSharedHeaders,
    ['no-store', { 'cache-control': 'no-store, max-age=0, stale-if-error=3600' }],
    ['shared-private', { 'cache-control': 'private, max-age=0, stale-if-error=3600' }],
  ];
  for (const [name, headers] of cases) {
    for (const [version, cache] of versions(makePolicy(headers))) {
      for (const response of [undefined, null]) {
        assert.throws(() => cache.revalidatedPolicy(request, response),
          /Response headers missing/, `${name}/${version}/missing-response`);
      }
    }
  }
});

void test('origin-error fallback cannot bypass URI, host, method or Vary matching', () => {
  const headers = {
    'cache-control': 'public, max-age=0, stale-if-error=3600',
    vary: 'accept-language',
  };
  const incomingRequests = [
    ['uri', { ...request, url: 'https://fixture.invalid/different-entry' }],
    ['host', { ...request, headers: { ...request.headers, host: 'other.invalid' } }],
    ['method', { ...request, method: 'POST' }],
    ['vary', { ...request, headers: { ...request.headers, 'accept-language': 'ja' } }],
  ];
  for (const [name, incoming] of incomingRequests) {
    for (const [version, cache] of versions(makePolicy(headers))) {
      assert.equal(cache.evaluateRequest(incoming).response, undefined, name);
      for (const status of errorStatuses) {
        assertNoFallback(cache, incoming, status, `${name}/${version}/${status}`);
      }
      for (const response of [undefined, null]) {
        assert.throws(() => cache.revalidatedPolicy(incoming, response),
          /Response headers missing/, `${name}/${version}/missing-response`);
      }
    }
  }
});

void test('matching public, private-cache and fresh s-maxage error reuse remains available', () => {
  const cases = [
    ['public', { 'cache-control': 'public, max-age=0, stale-if-error=3600' }],
    ['ordinary-stale', { 'cache-control': 'max-age=0, stale-if-error=3600' }],
    ['public-cookie', { 'set-cookie': 'fixture=synthetic', 'cache-control': 'public, max-age=0, stale-if-error=3600' }],
    ['immutable-cookie', { 'set-cookie': 'fixture=synthetic', 'cache-control': 'immutable, max-age=0, stale-if-error=3600' }],
    ['private-cache', { 'cache-control': 'private, max-age=0, stale-if-error=3600' }, { shared: false }],
    ['private-cookie', { 'set-cookie': 'fixture=synthetic', 'cache-control': 'max-age=0, stale-if-error=3600' }, { shared: false }],
    ['private-proxy-directive', { 'cache-control': 'proxy-revalidate, max-age=0, stale-if-error=3600' }, { shared: false }],
    ['private-s-maxage-directive', { 'cache-control': 's-maxage=0, max-age=0, stale-if-error=3600' }, { shared: false }],
    ['fresh-shared-s-maxage', { 'cache-control': 'public, s-maxage=60, stale-if-error=3600' }],
  ];
  for (const [name, headers, options] of cases) {
    for (const [version, cache] of versions(makePolicy(headers, options))) {
      for (const incoming of [request, { ...request, method: 'HEAD' }]) {
        for (const response of [...errorStatuses.map(status => ({ status, headers: {} })), undefined, null]) {
          const result = cache.revalidatedPolicy(incoming, response);
          assert.equal(result.policy, cache, `${name}/${version}/${incoming.method}`);
          assert.equal(result.matches, true, `${name}/${version}/${incoming.method}`);
          assert.equal(result.modified, false, `${name}/${version}/${incoming.method}`);
        }
      }
    }
  }
});

void test('expired stale-if-error window no longer reuses the cached body', () => {
  for (const [version, cache] of versions(makePolicy({
    'cache-control': 'public, max-age=0, stale-if-error=1',
  }))) {
    cache.clock = cache.now() + 2000;
    for (const status of errorStatuses) {
      assertNoFallback(cache, request, status, `${version}/${status}`);
    }
    assert.throws(() => cache.revalidatedPolicy(request, undefined), /Response headers missing/);
  }
});

void test('successful matching 304 revalidation retains and refreshes the body', () => {
  for (const [version, cache] of versions(makePolicy({
    'cache-control': 'public, max-age=0, stale-if-error=3600',
    etag: '"synthetic-version"',
  }))) {
    const result = cache.revalidatedPolicy(request, {
      status: 304,
      headers: { etag: '"synthetic-version"', 'cache-control': 'public, max-age=60' },
    });
    assert.equal(result.matches, true, version);
    assert.equal(result.modified, false, version);
    assert.notEqual(result.policy, cache, version);
    assert.equal(result.policy.status(), 200, version);
    assert.equal(result.policy.satisfiesWithoutRevalidation(request), true, version);
  }
});

void test('client no-cache directives require successful validation even during origin errors', () => {
  const cases = [
    ['cache-control', { ...request, headers: { ...request.headers, 'cache-control': 'no-cache' } }],
    ['pragma', { ...request, headers: { ...request.headers, pragma: 'no-cache' } }],
  ];
  for (const [name, incoming] of cases) {
    for (const [version, cache] of versions(makePolicy({
      'cache-control': 'public, max-age=0, stale-if-error=3600',
    }))) {
      assert.equal(cache.evaluateRequest(incoming).response, undefined, name);
      for (const status of errorStatuses) {
        assertNoFallback(cache, incoming, status, `${name}/${version}/${status}`);
      }
      assert.throws(() => cache.revalidatedPolicy(incoming, undefined), /Response headers missing/);
    }
  }
});

void test('direct stale-while-revalidate queries honor response prohibitions and Vary wildcard', () => {
  const cases = [
    ...unsafeSharedHeaders,
    ['no-store', { 'cache-control': 'no-store, max-age=0, stale-if-error=3600' }],
    ['shared-private', { 'cache-control': 'private, max-age=0, stale-if-error=3600' }],
    ['vary-wildcard', { 'cache-control': 'public, max-age=0, stale-if-error=3600', vary: '*' }],
    ['vary-list-wildcard', { 'cache-control': 'public, max-age=0, stale-if-error=3600', vary: 'accept-language, *' }],
  ];
  for (const [name, input] of cases) {
    const headers = { ...input, 'cache-control': input['cache-control'].replace('stale-if-error', 'stale-while-revalidate') };
    for (const [version, cache] of versions(makePolicy(headers))) {
      assert.equal(cache.useStaleWhileRevalidate(), false, `${name}/${version}`);
      assert.equal(cache.evaluateRequest(request).response, undefined, `${name}/${version}`);
    }
  }
  for (const [name, headers, options] of [
    ['public', { 'cache-control': 'public, max-age=0, stale-while-revalidate=3600' }],
    ['immutable-cookie', { 'set-cookie': 'fixture=synthetic', 'cache-control': 'immutable, max-age=0, stale-while-revalidate=3600' }],
    ['private-cache', { 'cache-control': 'private, max-age=0, stale-while-revalidate=3600' }, { shared: false }],
    ['fresh-s-maxage', { 'cache-control': 'public, s-maxage=60, stale-while-revalidate=3600' }],
  ]) {
    for (const [version, cache] of versions(makePolicy(headers, options))) {
      assert.equal(cache.useStaleWhileRevalidate(), true, `${name}/${version}`);
    }
  }
});

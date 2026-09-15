import test from 'node:test';
import assert from 'node:assert/strict';
import nextConfig, { WEB_SECURITY_RESPONSE_HEADERS } from '../next.config.ts';

const expected = new Map([
  [
    'Content-Security-Policy',
    "base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'",
  ],
  ['Cross-Origin-Opener-Policy', 'same-origin'],
  ['Cross-Origin-Resource-Policy', 'same-origin'],
  ['Referrer-Policy', 'no-referrer'],
  ['Strict-Transport-Security', 'max-age=31536000; includeSubDomains'],
  ['X-Content-Type-Options', 'nosniff'],
  ['X-Frame-Options', 'DENY'],
  [
    'Permissions-Policy',
    'bluetooth=(), camera=(), geolocation=(), hid=(), microphone=(), payment=(), serial=(), usb=()',
  ],
]);

void test('every application response receives the fixed browser security baseline', async () => {
  assert.equal(typeof nextConfig.headers, 'function');
  const rules = await nextConfig.headers();
  const root = rules.find((rule) => rule.source === '/');
  const global = rules.find((rule) => rule.source === '/:path*');
  assert.ok(root);
  assert.ok(global);
  assert.equal(WEB_SECURITY_RESPONSE_HEADERS.length, expected.size);
  assert.deepEqual(new Map(root.headers.map((header) => [header.key, header.value])), expected);
  assert.deepEqual(new Map(global.headers.map((header) => [header.key, header.value])), expected);
});

void test('the policy refuses framing, plugin objects, foreign form targets and sensitive browser capabilities', () => {
  const policy = expected.get('Content-Security-Policy');
  for (const directive of [
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
  ]) {
    assert.match(policy, new RegExp(directive.replaceAll("'", "\\'")));
  }
  assert.equal(expected.get('X-Frame-Options'), 'DENY');
  assert.equal(expected.get('X-Content-Type-Options'), 'nosniff');
  assert.match(expected.get('Permissions-Policy'), /camera=\(\)/);
  assert.match(expected.get('Permissions-Policy'), /payment=\(\)/);
  assert.match(expected.get('Permissions-Policy'), /usb=\(\)/);
});

void test('service worker and manifest updates are never held behind a stale immutable cache', async () => {
  const rules = await nextConfig.headers();
  const worker = rules.find((rule) => rule.source === '/sw.js');
  const manifest = rules.find((rule) => rule.source === '/manifest.webmanifest');
  assert.deepEqual(worker?.headers, [
    { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
    { key: 'Service-Worker-Allowed', value: '/' },
  ]);
  assert.deepEqual(manifest?.headers, [
    { key: 'Cache-Control', value: 'no-cache, must-revalidate' },
  ]);
  const staticAssets = rules.find((rule) => rule.source === '/_next/static/:path*');
  assert.deepEqual(staticAssets?.headers, [
    { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
  ]);
});

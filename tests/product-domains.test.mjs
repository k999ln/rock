import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { productDomains, privateZoomLabPath } from '../lib/product-domains.ts';
import { redirect } from 'vinext/shims/navigation';
import { loadRouteFixture } from './route-fixture.mjs';

void test('user-confirmed domains have fixed roles and never use the unrelated avocado.si', () => {
  assert.deepEqual(productDomains.map((item) => item.hostname), ['avoado.si', 'avocadomini.si', 'avocadopro.si']);
  for (const domain of productDomains) {
    const url = new URL(domain.url);
    assert.equal(url.protocol, 'https:'); assert.equal(url.hostname, domain.hostname);
    assert.equal(url.pathname, '/'); assert.equal(url.search, ''); assert.equal(url.hash, '');
  }
  assert.equal(privateZoomLabPath, '/sky/add/zoom/lab');
  assert.equal(privateZoomLabPath.startsWith('/'), true);
  const navigation = readFileSync(new URL('../components/product-domain-navigation.tsx', import.meta.url), 'utf8');
  assert.match(navigation, /rel="noopener noreferrer" referrerPolicy="no-referrer"/);
  assert.equal(navigation.includes(privateZoomLabPath), false);
});

void test('legacy install links enter the existing service guide without forwarding URL authority', () => {
  const route = loadRouteFixture(new URL('../app/install/page.tsx', import.meta.url), new Map([
    ['next/navigation', { redirect }],
  ]));
  for (const query of [
    '',
    'returnTo=https%3A%2F%2Foutside.invalid%2Fcollect',
    'next=%2F%2Foutside.invalid&redirect=%2Fapi%2Fbilling',
    'token=private-fixture&claim=fixture-claim&download=1',
    'returnTo=%2Fconnect%3Ftoken%3Dprivate-fixture&returnTo=javascript%3Avoid(0)',
  ]) {
    const params = new URLSearchParams(query);
    const searchParams = Promise.resolve(Object.fromEntries(params));
    assert.throws(() => route.default({ searchParams }), error => {
      // Execute the actual page with Vinext's real next/navigation redirect.
      assert.equal(error.message, 'NEXT_REDIRECT:/connect#');
      const target = decodeURIComponent(error.digest.split(';').at(-1));
      assert.equal(target, '/connect#');
      const url = new URL(target, 'https://avoado.si/install/?' + query);
      assert.equal(url.origin, 'https://avoado.si');
      assert.equal(url.pathname, '/connect');
      assert.equal(url.search, '');
      assert.equal(url.hash, '');
      return true;
    });
  }
  const unexpectedRead = new Proxy({}, { get() { throw new Error('legacy URL props must not be read'); } });
  assert.throws(() => route.default(unexpectedRead), { message: 'NEXT_REDIRECT:/connect#' });
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { productDomains, privateZoomLabPath } from '../lib/product-domains.ts';

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

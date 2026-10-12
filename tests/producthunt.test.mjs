import test from 'node:test';
import assert from 'node:assert/strict';
import { isProductHuntUrl, parseProductHuntUrl } from '../lib/producthunt.ts';

void test('Product Hunt import accepts only public post and product URLs', () => {
  assert.equal(
    parseProductHuntUrl('https://www.producthunt.com/posts/my-tool/?ref=home'),
    'https://www.producthunt.com/posts/my-tool',
  );
  assert.equal(
    parseProductHuntUrl('https://producthunt.com/products/my-tool'),
    'https://producthunt.com/products/my-tool',
  );
  assert.equal(isProductHuntUrl('https://www.producthunt.com/posts/my-tool'), true);
});

void test('Product Hunt import rejects credentials, fragments, and non-Product Hunt URLs', () => {
  for (const value of [
    'http://www.producthunt.com/posts/my-tool',
    'https://producthunt.com/posts/my-tool#token',
    'https://user:secret@producthunt.com/posts/my-tool',
    'https://example.com/posts/my-tool',
    'https://www.producthunt.com/topics/ai',
  ])
    assert.equal(parseProductHuntUrl(value), null);
});

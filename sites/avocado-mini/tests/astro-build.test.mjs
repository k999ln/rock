import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const outputRoot = new URL('../dist/', import.meta.url);
const routes = [
  'client/index.html',
  'client/crowdfunding/index.html',
  'client/guide/index.html',
  'client/install/index.html',
  'client/legal/index.html',
  'client/preorder/index.html',
  'client/preorder/confirm/index.html',
  'client/preorder/complete/index.html',
  'client/privacy/index.html',
  'client/rocket-star/index.html',
  'client/rockstaros/index.html',
];

function built(relativePath) {
  return readFileSync(new URL(relativePath, outputRoot), 'utf8');
}

test('Astro emits every public route and the Worker deployment contract', () => {
  for (const route of routes) {
    assert.equal(existsSync(new URL(route, outputRoot)), true, `${route} must exist`);
  }

  for (const artifact of ['server/index.js', 'server/wrangler.json', '.openai/hosting.json']) {
    assert.equal(existsSync(new URL(artifact, outputRoot)), true, `${artifact} must exist`);
  }
});

test('Astro output preserves the approved product, Rocket Star, and preorder pages', () => {
  const home = built('client/index.html');
  assert.match(home, /avokado mini R5/);
  assert.match(home, /\/images\/r5\/avocado-mini-r5-black-studio\.png/);
  assert.doesNotMatch(home, /\/images\/avocado-mini-tower20-e3-kit\.png/);
  assert.doesNotMatch(home, /\/images\/tower20-e3-highlight-/);
  assert.match(home, /aria-label="Choose a highlight"/);
  assert.equal((home.match(/data-highlight=/g) || []).length, 4);
  assert.match(built('client/rocket-star/index.html'), /Complete product design/);
  assert.match(built('client/preorder/index.html'), /RESERVATIONS AND CHECKOUT CLOSED/);
});

test('all public Astro pages are English-first', () => {
  for (const route of routes) {
    const html = built(route);
    assert.match(html, /<html lang="en">/, `${route} must declare English`);
    assert.doesNotMatch(html, /[ぁ-んァ-ヶ一-龠]/, `${route} must not contain Japanese interface copy`);
  }
});

test('built pages use bundled assets instead of retired source paths', () => {
  for (const route of routes) {
    const html = built(route);
    assert.doesNotMatch(html, /(?:href|src)=["']\/src\//, `${route} must not load /src directly`);
    assert.doesNotMatch(html, /(?:href|src)=["']\/rocket-star\/(?:main\.js|design\.css)/, `${route} must use Astro assets`);
  }
});

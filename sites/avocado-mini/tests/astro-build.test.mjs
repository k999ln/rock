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
  assert.match(built('client/index.html'), /avocadoMini R5/);
  assert.match(built('client/rocket-star/index.html'), /Complete product design/);
  assert.match(built('client/preorder/index.html'), /予約・決済停止中/);
});

test('built pages use bundled assets instead of retired source paths', () => {
  for (const route of routes) {
    const html = built(route);
    assert.doesNotMatch(html, /(?:href|src)=["']\/src\//, `${route} must not load /src directly`);
    assert.doesNotMatch(html, /(?:href|src)=["']\/rocket-star\/(?:main\.js|design\.css)/, `${route} must use Astro assets`);
  }
});

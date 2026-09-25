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
  assert.match(home, /avocadoMini R5/);
  for (const image of [
    'avocado-mini-tower20-e3-kit.png',
    'tower20-e3-highlight-sensor-v2.png',
    'tower20-e3-highlight-200mm-v1.png',
    'tower20-e3-highlight-footprint-v1.png',
    'tower20-e3-highlight-edge-hub-v1.png',
    'tower20-e3-front-cutout-v1.png',
    'tower20-e3-side-cutout-v1.png',
    'tower20-e3-rear-cutout-v1.png',
    'tower20-e3-sensor-macro.png',
  ]) assert.match(home, new RegExp(`/images/${image.replaceAll('.', '\\.')}`));
  assert.match(home, /aria-label="ハイライトを選択"/);
  assert.equal((home.match(/data-highlight=/g) || []).length, 4);
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

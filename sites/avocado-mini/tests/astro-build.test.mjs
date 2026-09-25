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
  assert.match(home, /avocadoMini Tower20 E3/);
  assert.match(home, /Intelligence,<br>built into space\./);
  assert.match(home, /\/images\/avocado-mini-tower20-e3-kit\.png/);
  assert.equal((home.match(/\/images\/tower20-e3-highlight-/g) || []).length, 4);
  assert.match(home, /One camera<br>in each direction\./);
  assert.match(home, /Everything,<br>for the space\./);
  assert.equal((home.match(/class="turn-frame"/g) || []).length, 3);
  assert.match(home, /id="angle"/);
  assert.match(home, /data-view="side"/);
  assert.match(home, /data-view="rear"/);
  assert.match(home, /Open installer/);
  assert.match(built('client/rocket-star/index.html'), /Complete product design/);
  assert.match(built('client/preorder/index.html'), /RESERVATIONS AND CHECKOUT CLOSED/);
});

test('home fragment navigation, carousel controls, and metadata remain valid', () => {
  const home = built('client/index.html');
  const ids = new Set([...home.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]));
  for (const match of home.matchAll(/href="#([^"]+)"/g)) {
    assert.equal(ids.has(match[1]), true, `#${match[1]} must identify a section`);
  }
  assert.equal((home.match(/class="highlight-card /g) || []).length, 4);
  assert.match(home, /rel="canonical" href="https:\/\/avocado-mini\.kirin-999\.chatgpt\.site\/"/);
  assert.match(home, /property="og:title"/);
  assert.doesNotMatch(home, /fonts\.googleapis\.com|fonts\.gstatic\.com/);
  assert.equal(existsSync(new URL('client/robots.txt', outputRoot)), true);
  assert.equal(existsSync(new URL('client/sitemap.xml', outputRoot)), true);
});

test('the 180-degree story opens and closes with the requested prices and transparent product art', () => {
  const home = built('client/index.html');
  assert.match(home, /0° \/ SINGLE TOWER/);
  assert.match(home, /¥160,000/);
  assert.match(home, /180° \/ FOUR-TOWER SYSTEM/);
  assert.match(home, /¥410,000/);
  assert.match(home, /data-price-usd="US\$1,050"/);
  assert.match(home, /data-price-usd="US\$2,700"/);
  assert.equal((home.match(/aria-label="Display currency"/g) || []).length, 2);
  assert.match(home, /avocado-mini-tower20-e3-kit-transparent-v2\.png/);
  for (const view of ['front', 'side', 'rear']) {
    assert.match(home, new RegExp(`tower20-e3-${view}-transparent-v2\\.png`));
  }
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
    assert.doesNotMatch(html, /fonts\.googleapis\.com|fonts\.gstatic\.com/, `${route} must not request third-party fonts`);
  }
});

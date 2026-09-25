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
  'client/mini/index.html',
  'client/preorder/index.html',
  'client/preorder/confirm/index.html',
  'client/preorder/complete/index.html',
  'client/privacy/index.html',
  'client/pro/index.html',
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

test('Astro output separates the ecosystem, Mini, Pro, Rocket Star, and preorder pages', () => {
  const home = built('client/index.html');
  const mini = built('client/mini/index.html');
  const pro = built('client/pro/index.html');
  assert.match(home, /AVOCADOMINI × AVOKADOPRO/);
  assert.match(home, /Two products\.<br\s*\/?>One bigger world\./);
  assert.match(home, /href="\/mini\/"/);
  assert.match(home, /href="\/pro\/"/);
  assert.match(home, /When Mini meets Pro/i);
  assert.match(mini, /Start with one\.<br\s*\/?>Expand the space\./);
  assert.match(mini, /\/images\/avocado-mini-tower20-e3-kit\.png/);
  assert.equal((mini.match(/class="highlight-card /g) || []).length, 4);
  assert.match(mini, /One camera<br\s*\/?>in each direction\./);
  assert.match(mini, /Everything,<br\s*\/?>for the space\./);
  assert.equal((mini.match(/class="turn-frame"/g) || []).length, 3);
  assert.match(mini, /id="angle"/);
  assert.match(mini, /data-view="side"/);
  assert.match(mini, /data-view="rear"/);
  assert.match(mini, /Open installer/);
  assert.match(pro, /Games on its own\.<br\s*\/?>A bigger world with Mini\./);
  assert.match(pro, /From ¥880,000/);
  assert.match(pro, /GAME \+ SERVICES HUB/);
  assert.match(built('client/rocket-star/index.html'), /Complete product design/);
  assert.match(built('client/preorder/index.html'), /RESERVATIONS AND CHECKOUT CLOSED/);
});

test('home fragment navigation, carousel controls, and metadata remain valid', () => {
  const home = built('client/index.html');
  const ids = new Set([...home.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]));
  for (const match of home.matchAll(/href="#([^"]+)"/g)) {
    assert.equal(ids.has(match[1]), true, `#${match[1]} must identify a section`);
  }
  assert.equal((home.match(/class="ecosystem-product-card /g) || []).length, 2);
  assert.match(home, /rel="canonical" href="https:\/\/avocado-mini\.kirin-999\.chatgpt\.site\/"/);
  assert.match(home, /property="og:title"/);
  assert.doesNotMatch(home, /fonts\.googleapis\.com|fonts\.gstatic\.com/);
  assert.equal(existsSync(new URL('client/robots.txt', outputRoot)), true);
  assert.equal(existsSync(new URL('client/sitemap.xml', outputRoot)), true);
});

test('the Mini 180-degree story contains Mini-only pricing while Pro owns its separate price', () => {
  const mini = built('client/mini/index.html');
  const pro = built('client/pro/index.html');
  assert.match(mini, /0° \/ SINGLE MINI/);
  assert.match(mini, /¥160,000/);
  assert.match(mini, /180° \/ FOUR-MINI SYSTEM/);
  assert.match(mini, /¥410,000/);
  assert.match(mini, /data-price-usd="US\$1,050"/);
  assert.match(mini, /data-price-usd="US\$2,700"/);
  assert.doesNotMatch(mini, /class="pro-addon"/);
  assert.equal((mini.match(/aria-label="Display currency"/g) || []).length, 2);
  assert.match(mini, /avocado-mini-tower20-e3-kit-transparent-v2\.png/);
  assert.match(pro, /From ¥880,000/);
  assert.match(pro, /data-price-usd="From US\$5,800"/);
  assert.equal((pro.match(/aria-label="Display currency"/g) || []).length, 1);
  for (const view of ['front', 'side', 'rear']) {
    assert.match(mini, new RegExp(`tower20-e3-${view}-transparent-v2\\.png`));
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

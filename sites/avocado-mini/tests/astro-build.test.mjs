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
  assert.match(home, /AVOKADO \/ SPATIAL EXPERIENCES/);
  assert.match(home, /Make the room part<br\s*\/?>of the experience\./);
  assert.match(home, /id="choose-setup"/);
  assert.match(home, /href="\/mini\/"/);
  assert.match(home, /href="\/pro\/"/);
  assert.match(home, /home-promo-mini/);
  assert.match(home, /home-promo-pro/);
  assert.match(mini, /Give the space<br\s*\/?>another sense\./);
  assert.match(mini, /\/images\/avocado-mini-tower20-e3-kit\.png/);
  assert.equal((mini.match(/class="highlight-card /g) || []).length, 4);
  assert.match(mini, /The space can<br\s*\/?>respond to you\./);
  assert.match(mini, /Everything,<br\s*\/?>for the space\./);
  assert.equal((mini.match(/class="turn-frame"/g) || []).length, 3);
  assert.match(mini, /id="angle"/);
  assert.match(mini, /data-view="side"/);
  assert.match(mini, /data-view="rear"/);
  assert.match(mini, /Check release status/);
  assert.match(pro, /Bring the game closer\.<br\s*\/?>Let the room join in\./);
  assert.match(pro, /From ¥880,000/);
  assert.match(pro, /GAME \+ SERVICES HUB/);
  assert.match(built('client/rocket-star/index.html'), /Complete product design/);
  assert.match(built('client/preorder/index.html'), /NOT YET FOR SALE/);
});

test('home fragment navigation, carousel controls, and metadata remain valid', () => {
  const home = built('client/index.html');
  const ids = new Set([...home.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]));
  for (const match of home.matchAll(/href="#([^"]+)"/g)) {
    assert.equal(ids.has(match[1]), true, `#${match[1]} must identify a section`);
  }
  assert.equal((home.match(/class="home-promo /g) || []).length, 3);
  assert.equal((home.match(/class="home-tile /g) || []).length, 4);
  assert.match(home, /rel="canonical" href="https:\/\/avocado-mini\.kirin-999\.chatgpt\.site\/"/);
  assert.match(home, /property="og:title"/);
  assert.doesNotMatch(home, /fonts\.googleapis\.com|fonts\.gstatic\.com/);
  assert.equal(existsSync(new URL('client/robots.txt', outputRoot)), true);
  assert.equal(existsSync(new URL('client/sitemap.xml', outputRoot)), true);
});

test('shared visual and interaction enhancements ship on every primary experience', () => {
  assert.equal(existsSync(new URL('client/site-enhancements.js', outputRoot)), true);
  for (const route of ['client/index.html', 'client/mini/index.html', 'client/pro/index.html', 'client/install/index.html', 'client/preorder/index.html', 'client/rocket-star/index.html']) {
    assert.match(built(route), /src="\/site-enhancements\.js"/, `${route} must load the shared enhancement layer`);
  }
  const enhancement = built('client/site-enhancements.js');
  assert.match(enhancement, /Page scroll progress/);
  assert.match(enhancement, /aria-current/);
  assert.match(enhancement, /currency-toggle-button/);
  assert.match(enhancement, /prefers-reduced-motion/);
});

test('reference-led product navigation and Pro highlights remain interactive', () => {
  const home = built('client/index.html');
  const mini = built('client/mini/index.html');
  const pro = built('client/pro/index.html');
  for (const page of [home, mini, pro]) {
    assert.match(page, /class="[^"]*site-menu/);
    assert.match(page, />Menu</);
    assert.match(page, /Price & status/);
  }
  assert.match(pro, /id="pro-highlights"/);
  assert.match(pro, /data-carousel/);
  assert.equal((pro.match(/class="pro-highlight-card"/g) || []).length, 4);
  for (const image of [
    'avokado-pro-play-e3-v3.png',
    'avocado-mini-tower20-e3-kit.png',
    'tower20-e3-highlight-sensor-v2.png',
    'tower20-e3-highlight-200mm-v1.png',
  ]) {
    assert.match(pro, new RegExp(image.replace('.', '\\.')));
  }
  assert.equal((pro.match(/tower20-e3-highlight-edge-hub-v1\.png/g) || []).length, 1);
  assert.equal((pro.match(/avocado-mini-tower20-e3-kit\.png/g) || []).length, 1);
  assert.doesNotMatch(pro, /motion-tower-satin-four-point\.png/);
  assert.match(pro, /avocado-mini-tower20-e3-kit-transparent-v2\.png/);
  assert.match(pro, /id="pro-os"/);
  const enhancement = built('client/site-enhancements.js');
  assert.match(enhancement, /\[data-carousel\]/);
  assert.match(enhancement, /details\.site-menu/);
});

test('benefit-first journey ends in a truthful price and support path', () => {
  const home = built('client/index.html');
  const mini = built('client/mini/index.html');
  const pro = built('client/pro/index.html');
  const status = built('client/preorder/index.html');
  const install = built('client/install/index.html');
  assert.match(home, /Start with the benefit/);
  assert.match(home, /Want to see this become real/);
  assert.match(mini, /See the price\. Follow the build\./);
  assert.match(pro, /See the price\. Follow the build\./);
  assert.match(status, /One avocadoMini/);
  assert.match(status, /Four-Mini package/);
  assert.match(status, /avokadoPro/);
  assert.match(status, /¥160,000/);
  assert.match(status, /¥410,000/);
  assert.match(status, /¥880,000/);
  assert.doesNotMatch(status, /R5|Old E3 pricing/);
  assert.doesNotMatch(install, /R5/);
  assert.match(install, /PUBLIC INSTALLER NOT YET AVAILABLE/);
});

test('the restored Mini 180-degree story and dedicated Pro page preserve their pricing', () => {
  const mini = built('client/mini/index.html');
  const pro = built('client/pro/index.html');
  assert.match(mini, /0° \/ SINGLE MINI/);
  assert.match(mini, /¥160,000/);
  assert.match(mini, /180° \/ FOUR-MINI SYSTEM/);
  assert.match(mini, /¥410,000/);
  assert.match(mini, /data-price-usd="US\$1,050"/);
  assert.match(mini, /data-price-usd="US\$2,700"/);
  assert.match(mini, /class="pro-addon"/);
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

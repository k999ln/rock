import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { lockedSkip } from '../../../tests/private-locked.mjs';

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

  for (const artifact of ['server/index.js', 'server/shared/stripe.mjs', 'server/wrangler.json', '.openai/hosting.json']) {
    assert.equal(existsSync(new URL(artifact, outputRoot)), true, `${artifact} must exist`);
  }
});

test('Astro output separates the ecosystem, Mini, Pro, Rocket Star, and preorder pages', () => {
  const home = built('client/index.html');
  const mini = built('client/mini/index.html');
  const pro = built('client/pro/index.html');
  assert.match(home, /AVOKADO \/ SPATIAL EXPERIENCES/);
  assert.match(home, /Make the room part<br\b[^>]*>of the experience\./);
  assert.match(home, /id="choose-setup"/);
  assert.match(home, /id="possibilities"/);
  const experiences = home.match(/<section id="possibilities"[\s\S]*?<\/section>/)?.[0] || '';
  assert.equal((experiences.match(/<article /g) || []).length, 4);
  assert.doesNotMatch(experiences, /possibility-flow|system-role-strip|<dl/);
  for (const image of ['usecase-care-motion-v4.jpg', 'usecase-research-development-v4.jpg', 'usecase-everyday-space-v4.jpg', 'usecase-spatial-game-v4.jpg']) assert.ok(experiences.includes(image));
  for (const href of ['https://avocadomini.si/#mini-use-cases', 'https://avocadopro.si/#pro-use-cases', 'https://avocadopro.si/#pro-pairing', '#choose-setup']) assert.ok(experiences.includes('href="' + href + '"'));
  assert.match(home, /href="https:\/\/avocadomini\.si\/"/);
  assert.match(home, /href="https:\/\/avocadopro\.si\/"/);
  assert.match(home, /home-promo-mini/);
  assert.match(home, /home-promo-pro/);
  assert.match(mini, /Give the space<br\b[^>]*>another sense\./);
  assert.match(mini, /id="mini-use-cases"/);
  assert.match(mini, /You move\./);
  assert.match(mini, /\/images\/avocado-mini-tower20-e3-kit\.png/);
  assert.equal((mini.match(/class="highlight-card /g) || []).length, 4);
  assert.match(mini, /The space can<br\b[^>]*>respond to you\./);
  assert.match(mini, /Everything,<br\b[^>]*>for the space\./);
  assert.equal((mini.match(/class="turn-frame"/g) || []).length, 3);
  assert.match(mini, /id="angle"/);
  assert.match(mini, /data-view="side"/);
  assert.match(mini, /data-view="rear"/);
  assert.match(mini, /Check release status/);
  assert.match(pro, /si\. PC games\.<br\b[^>]*>A place on your desk\./);
  assert.match(pro, /¥800,000 design target/);
  assert.match(pro, /COMPACT NVIDIA PC \/ DESIGN P0/);
  assert.match(pro, /id="pro-use-cases"/);
  assert.match(pro, /si and games\./);
  assert.match(built('client/install/index.html'), /id="os-use-cases"/);
  assert.match(built('client/install/index.html'), /Input in\./);
  // 2026-10-10: design documents are no longer distributed from the public site.
  assert.match(built('client/rocket-star/index.html'), /kept private while the program is in development/);
  for (const route of ['client/rocket-star/index.html', 'client/crowdfunding/index.html'])
    assert.doesNotMatch(built(route), /href="\/(?:rocket-star\/design\/|downloads\/)/, `${route} must not link to design downloads`);
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
  assert.match(home, /rel="canonical" href="https:\/\/avocadomini\.si\/"/);
  assert.match(home, /property="og:title"/);
  for (const host of ['fonts.googleapis.com', 'fonts.gstatic.com']) {
    assert.equal(home.toLowerCase().includes(host), false);
  }
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
  assert.match(pro, /avokado-pro-pc-concept\.svg/);
  assert.match(pro, /Archived E3 pairing illustration/);
  assert.doesNotMatch(pro, /tower20-e3-highlight-edge-hub-v1\.png|avokado-pro-play-e3-v3\.png/);
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
  assert.match(status, /¥800,000 design target/);
  assert.match(status, /earlier Pro product page used/);
  assert.match(status, /do not settle the current R5 price/);
  assert.doesNotMatch(install, /R5/);
  assert.match(install, /PUBLIC INSTALLER NOT YET AVAILABLE/);
});

test('Mini references stay separate from the unconfirmed Pro design target', () => {
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
  assert.match(pro, /¥800,000 design target/);
  assert.doesNotMatch(pro, /data-price-usd|Display currency|From ¥880,000/);
  assert.match(pro, /Tax, shipping, warranty, and final sale price are undecided/);
  assert.match(pro, /Reservations and payments are closed/);
  for (const view of ['front', 'side', 'rear']) {
    assert.match(mini, new RegExp(`tower20-e3-${view}-transparent-v2\\.png`));
  }
});

test('all public Astro pages are English-first', () => {
  for (const route of routes) {
    const html = built(route);
    assert.match(html, /<html lang="en"(?:\s[^>]*)?>/, `${route} must declare English`);
    assert.doesNotMatch(html, /[ぁ-んァ-ヶ一-龠]/, `${route} must not contain Japanese interface copy`);
  }
});

test('built pages use bundled assets instead of retired source paths', () => {
  for (const route of routes) {
    const html = built(route);
    assert.doesNotMatch(html, /(?:href|src)=["']\/src\//, `${route} must not load /src directly`);
    assert.doesNotMatch(html, /(?:href|src)=["']\/rocket-star\/(?:main\.js|design\.css)/, `${route} must use Astro assets`);
    for (const host of ['fonts.googleapis.com', 'fonts.gstatic.com']) {
      assert.equal(html.toLowerCase().includes(host), false, `${route} must not request third-party fonts`);
    }
  }
});


test('current Pro summaries match the canonical intent without opening an order path', {
  skip: lockedSkip('data/product-baseline.json', 'docs/assets/avokado-pro-pc-concept.svg'),
}, async () => {
  const { proDesign } = await import('../src/pro-design.js');
  const canonical = JSON.parse(readFileSync(new URL('../../../data/product-baseline.json', outputRoot), 'utf8')).avokadoProPcIntent;
  assert.equal(proDesign.targetJpy, canonical.salesPriceTargetJpy);
  assert.equal(canonical.miniDependency, false);
  assert.equal(canonical.candidateOnly, true);
  assert.equal(built('client/images/avokado-pro-pc-concept.svg'), readFileSync(new URL('../../../docs/assets/avokado-pro-pc-concept.svg', outputRoot), 'utf8'));
  for (const route of ['client/index.html', 'client/mini/index.html', 'client/pro/index.html', 'client/preorder/index.html']) {
    const html = built(route);
    assert.match(html, /¥800,000 design target/);
    assert.doesNotMatch(html, /data-price-(?:jpy|usd)="From/);
    assert.doesNotMatch(html, /<form|action="[^"]*checkout|href="https:\/\/checkout\.stripe/);
  }
});

test('local product links and fragment targets resolve across built routes', () => {
  const pages = new Map(routes.map(route => [route.replace('client', '').replace('index.html', ''), built(route)]));
  for (const [path, html] of pages) {
    for (const match of html.matchAll(/href="([^"]+)"/g)) {
      const href = match[1];
      if (!href.startsWith('/') && !href.startsWith('#')) continue;
      const url = new URL(href, `https://site.invalid${path}`);
      const target = pages.get(url.pathname);
      if (target === undefined) {
        assert.ok(existsSync(new URL(`client${url.pathname}`, outputRoot)), `${path} links to missing local resource ${href}`);
        continue;
      }
      if (url.hash) assert.ok(target.includes(`id="${url.hash.slice(1)}"`), `${path} links to missing ${href}`);
    }
  }
});

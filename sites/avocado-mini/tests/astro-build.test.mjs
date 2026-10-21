import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const outputRoot = new URL('../dist/', import.meta.url);
const routes = [
  'client/_site-pages/home/index.html',
  'client/crowdfunding/index.html',
  'client/create/index.html',
  'client/guide/index.html',
  'client/install/index.html',
  'client/legal/index.html',
  'client/_site-pages/mini/index.html',
  'client/preorder/index.html',
  'client/preorder/confirm/index.html',
  'client/preorder/complete/index.html',
  'client/privacy/index.html',
  'client/_site-pages/pro/index.html',
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
  const home = built('client/_site-pages/home/index.html');
  const mini = built('client/_site-pages/mini/index.html');
  const pro = built('client/_site-pages/pro/index.html');
  assert.match(home, /AVOKADO \/ SPATIAL EXPERIENCES/);
  assert.match(home, /Make the room part<br\b[^>]*>of the experience\./);
  assert.match(home, /id="choose-setup"/);
  assert.match(home, /id="possibilities"/);
  const experiences = home.match(/<section id="possibilities"[\s\S]*?<\/section>/)?.[0] || '';
  assert.equal((experiences.match(/<article /g) || []).length, 4);
  assert.doesNotMatch(experiences, /possibility-flow|system-role-strip|<dl/);
  for (const image of ['usecase-care-motion-v4.jpg', 'usecase-research-development-v4.jpg', 'usecase-everyday-space-v4.jpg', 'usecase-spatial-game-v4.jpg']) assert.ok(experiences.includes(image));
  for (const href of ['https://avocadomini.si/#experience', 'https://avocadopro.si/#pro-build', 'https://avocadopro.si/#pro-build', '#choose-setup']) assert.ok(experiences.includes('href="' + href + '"'));
  assert.match(home, /href="https:\/\/avocadomini\.si\/"/);
  assert.match(home, /href="https:\/\/avocadopro\.si\/"/);
  assert.match(home, /home-promo-mini/);
  assert.match(home, /home-promo-pro/);
  assert.match(mini, /AVOCADOMINI R5 \/ PRODUCT VISION/);
  assert.match(mini, /One device\./);
  assert.match(mini, /id="experience"/);
  assert.match(mini, /href="\/create\/"/);
  assert.match(mini, /id="status"/);
  assert.match(mini, /avocadomini-r5-slim-home-concept\.png/);
  assert.match(mini, /avocadomini-r5-slim-form-reference\.png/);
  assert.match(mini, /avocadomini-r5-removable-dock-concept\.png/);
  assert.equal((mini.match(/class="r5-experience-grid"/g) || []).length, 1);
  assert.match(mini, /No physical R5 accepted/);
  assert.match(mini, /No signed, recoverable Mini OS image/);
  assert.match(pro, /Meet avocadoPro\./);
  assert.match(pro, /id="pro-build"/);
  assert.match(pro, /No final price or checkout yet/);
  assert.match(pro, /data-assembly-drop/);
  assert.match(pro, /data-pro-interest-form/);
  assert.match(pro, /Request to buy this build/);
  assert.doesNotMatch(pro, /¥880,000|GAME \+ SERVICES HUB/);
  assert.match(built('client/install/index.html'), /id="os-use-cases"/);
  assert.match(built('client/install/index.html'), /Input in\./);
  assert.match(built('client/rocket-star/index.html'), /rocketstar/);
  assert.match(built('client/preorder/index.html'), /NO RESERVATION/);
  const creator = built('client/create/index.html');
  assert.match(creator, /avocadomini-r5-game-creator-hero-v1\.jpg/);
  assert.match(creator, /avocadomini-r5-slim-form-reference\.png/);
  assert.match(creator, /avocadomini-r5-removable-dock-concept\.png/);
  assert.equal(existsSync(new URL('client/images/avocadomini-r5-game-creator-hero-v1.jpg', outputRoot)), true);
  assert.match(creator, /PLAYABLE BROWSER STARTER/);
  assert.match(creator, /PRIVATE REVIEW QUEUE/);
  assert.match(creator, /mini-browser-game-starter\.zip/);
  assert.match(creator, /Submitted games are not published automatically/);
  assert.equal(existsSync(new URL('client/create.js', outputRoot)), true);
  assert.equal(existsSync(new URL('client/downloads/mini-browser-game-starter.zip', outputRoot)), true);
});

test('home fragment navigation, carousel controls, and metadata remain valid', () => {
  const home = built('client/_site-pages/home/index.html');
  const ids = new Set([...home.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]));
  for (const match of home.matchAll(/href="#([^"]+)"/g)) {
    assert.equal(ids.has(match[1]), true, `#${match[1]} must identify a section`);
  }
  assert.equal((home.match(/class="home-promo /g) || []).length, 3);
  assert.equal((home.match(/class="home-tile /g) || []).length, 4);
  assert.match(home, /rel="canonical" href="https:\/\/avoado\.si\/"/);
  assert.match(home, /property="og:title"/);
  assert.doesNotMatch(home, /fonts\.googleapis\.com|fonts\.gstatic\.com/);
  assert.equal(existsSync(new URL('client/_site-pages/robots.txt', outputRoot)), true);
  assert.equal(existsSync(new URL('client/_site-pages/sitemap.xml', outputRoot)), true);
});

test('shared visual and interaction enhancements ship on every primary experience', () => {
  assert.equal(existsSync(new URL('client/site-enhancements.js', outputRoot)), true);
  for (const route of ['client/_site-pages/home/index.html', 'client/_site-pages/mini/index.html', 'client/_site-pages/pro/index.html', 'client/install/index.html', 'client/preorder/index.html', 'client/rocket-star/index.html']) {
    assert.match(built(route), /src="\/site-enhancements\.js"/, `${route} must load the shared enhancement layer`);
  }
  const enhancement = built('client/site-enhancements.js');
  assert.match(enhancement, /Page scroll progress/);
  assert.match(enhancement, /aria-current/);
  assert.match(enhancement, /currency-toggle-button/);
  assert.match(enhancement, /prefers-reduced-motion/);
});

test('reference-led product navigation and focused Pro builder remain interactive', () => {
  const home = built('client/_site-pages/home/index.html');
  const mini = built('client/_site-pages/mini/index.html');
  const pro = built('client/_site-pages/pro/index.html');
  for (const page of [home, mini, pro]) {
    assert.match(page, /class="[^"]*site-menu/);
    assert.match(page, />Menu</);
  }
  assert.match(mini, /Price & status/);
  assert.ok(pro.indexOf('Meet avocadoPro.') < pro.indexOf('id="pro-customize"'), 'product introduction precedes configuration');
  assert.match(pro, /Choose a model/);
  assert.match(pro, /Tap a numbered part on the PC/);
  assert.match(pro, /id="pro-configuration"/);
  assert.match(pro, /id="pro-interest"/);
  assert.doesNotMatch(pro, /id="pro-explore"|id="pro-foundation"|data-pro-explore/);
  assert.match(pro, /href="#pro-configuration"/);
  assert.match(pro, /href="#pro-interest"/);
  assert.match(pro, /data-kit="value"/);
  assert.match(pro, /data-kit="performance"/);
  assert.match(pro, /data-kit="compact"/);
  assert.equal((pro.match(/data-assembly-step="\d"/g) || []).length, 6);
  assert.equal((pro.match(/data-assembly-part="\d"/g) || []).length, 6);
  assert.equal((pro.match(/data-machine-layer="\d"/g) || []).length, 6);
  assert.match(pro, /data-watch-build/);
  assert.match(pro, /data-machine-flash/);
  assert.match(pro, /data-machine-view="outside"/);
  assert.match(pro, /data-machine-view="inside"/);
  assert.match(pro, /avocado-pro-shell-top-v1\.webp/);
  assert.match(pro, /class="pro-machine-inside" src="\/images\/avocado-pro-open-top-v1\.webp"/);
  assert.match(pro, /avocado-pro-empty-chassis-v2\.webp/);
  assert.match(pro, /data-assembly-fit/);
  assert.match(pro, /data-quick-fit/);
  assert.match(pro, /data-quick-details/);
  assert.doesNotMatch(pro, /data-assembly-drag/);
  assert.match(pro, /data-assembly-complete/);
  assert.match(pro, /ASUS Dual RTX 5060 Ti/);
  assert.match(pro, /physical compatibility unverified/i);
  assert.equal(existsSync(new URL('client/images/avocado-pro-shell-top-v1.webp', outputRoot)), true);
  assert.equal(existsSync(new URL('client/images/avocado-pro-open-top-v1.webp', outputRoot)), true);
  assert.equal(existsSync(new URL('client/images/avocado-pro-empty-chassis-v2.webp', outputRoot)), true);
  for (const name of ['value', 'performance', 'compact']) {
    assert.equal(existsSync(new URL(`client/images/avocado-pro-${name}-study.webp`, outputRoot)), true);
  }
  const enhancement = built('client/site-enhancements.js');
  assert.match(enhancement, /\[data-carousel\]/);
  assert.match(enhancement, /details\.site-menu/);
});

test('benefit-first journey ends in a truthful price and support path', () => {
  const home = built('client/_site-pages/home/index.html');
  const mini = built('client/_site-pages/mini/index.html');
  const pro = built('client/_site-pages/pro/index.html');
  const status = built('client/preorder/index.html');
  const install = built('client/install/index.html');
  assert.match(home, /Start with the benefit/);
  assert.match(home, /Want to see this become real/);
  assert.match(mini, /See what is real today/);
  assert.match(pro, /No final price or checkout yet/);
  assert.match(status, /AVOCADOMINI R5 \/ STATUS/);
  assert.match(status, /NO RESERVATION/);
  assert.match(status, /PRICE NOT SET/);
  assert.match(status, /Older Tower20 E3 images and prices are historical/);
  assert.doesNotMatch(status, /¥160,000|¥410,000|¥880,000/);
  assert.doesNotMatch(install, /R5/);
  assert.match(install, /PUBLIC INSTALLER NOT YET AVAILABLE/);
});

test('current Mini pages present the R5 concept and unaccepted product gates', () => {
  const mini = built('client/_site-pages/mini/index.html');
  const status = built('client/preorder/index.html');
  assert.match(mini, /Design and feasibility stage/);
  assert.match(mini, /Not accepted/);
  assert.match(mini, /Sales/);
  assert.match(mini, /avocadoPro is a separate AI-dedicated PC/);
  assert.doesNotMatch(mini, /Tower20 E3|¥160,000|¥410,000|¥880,000|game Hub/);
  assert.match(status, /physical, software, and connectivity tests/);
  assert.match(status, /Checkout and reservations stay closed/);
  assert.doesNotMatch(status, /From ¥|Approx\. US\$/);
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
    assert.doesNotMatch(html, /fonts\.googleapis\.com|fonts\.gstatic\.com/, `${route} must not request third-party fonts`);
  }
});


test('Pro keeps its canonical design target without opening orders', async () => {
  const { proDesign } = await import('../src/pro-design.js');
  const pro = built('client/_site-pages/pro/index.html');
  assert.equal(proDesign.targetJpy, 800000);
  assert.ok(pro.includes(proDesign.targetLabel));
  assert.ok(pro.includes(proDesign.priceNote));
  assert.match(pro, /Mini is optional/);
  const forms = [...pro.matchAll(/<form\b([^>]*)>/g)];
  assert.equal(forms.length, 1);
  assert.match(forms[0][1], /data-pro-interest-form/);
  assert.doesNotMatch(forms[0][1], /action=/);
  assert.doesNotMatch(pro, /href="https:\/\/checkout\.stripe/);
});

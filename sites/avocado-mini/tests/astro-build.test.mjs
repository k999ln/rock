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

test('SIM service and hardware pages remain distinct', () => {
 const home=built('client/_site-pages/home/index.html'), mini=built('client/_site-pages/mini/index.html'), pro=built('client/pro/build/index.html');
 assert.match(home,/SIM \+ eSIM SERVICE ACCESS/); assert.match(home,/A whole team of AI\./);
 assert.match(mini,/One device\./); assert.match(pro,/Meet avocadoPro\./); assert.match(pro,/data-pro-interest-form/);
});

test('Pro root is an OS workspace preview, with the hardware builder kept separately', () => {
  const os = built('client/_site-pages/pro/index.html');
  const build = built('client/pro/build/index.html');
  assert.match(os, /avocadoPro OS — Your work starts here/);
  assert.match(os, /data-panel="home"/);
  assert.match(os, /data-panel="eve"/);
  assert.match(os, /data-panel="work"/);
  assert.match(os, /data-panel="system"/);
  assert.match(os, /data-draft-input/);
  assert.match(os, /data-task-form/);
  assert.match(os, /https:\/\/avoado\.si\/os\/eve/);
  assert.match(os, /href="\/build\/"/);
  assert.match(os, /Browser preview/);
  assert.match(os, /Nothing typed in this preview starts an agent or creates a charge/);
  assert.match(build, /data-pro-interest-form/);
  assert.doesNotMatch(os, /data-pro-interest-form|checkout\.stripe\.com/);
  const js = readFileSync(new URL('../src/pro-os.js', import.meta.url), 'utf8');
  assert.match(js, /localStorage/);
  assert.match(js, /textContent = item\.text/);
  assert.doesNotMatch(js, /innerHTML/);
});

test('home fragments and metadata remain valid', () => {
 const home=built('client/_site-pages/home/index.html'); const ids=new Set([...home.matchAll(/\sid="([^"]+)"/g)].map(x=>x[1]));
 for(const x of home.matchAll(/href="#([^"]+)"/g)) assert.equal(ids.has(x[1]),true);
 assert.match(home,/rel="canonical" href="https:\/\/avocadomini\.si\/"/);
 assert.equal(existsSync(new URL('client/_site-pages/robots.txt',outputRoot)),true);
});

test('shared enhancements stay on product pages', () => {
 for(const route of ['client/_site-pages/home/index.html','client/_site-pages/mini/index.html','client/pro/build/index.html']) assert.match(built(route),/site-enhancements\.js/);
 assert.match(built('client/site-enhancements.js'),/prefers-reduced-motion/);
});

test('Pro builder keeps staged parts and interest gate', () => {
 const pro=built('client/pro/build/index.html'); assert.match(pro,/id="pro-configuration"/); assert.match(pro,/id="pro-interest"/);
 assert.equal((pro.match(/data-assembly-step="\d"/g)||[]).length,6); assert.match(pro,/data-machine-view="inside"/);
 assert.match(pro,/data-pro-interest-form/); assert.match(pro,/physical compatibility unverified/i);
});

test('unaccepted hardware does not show checkout', () => {
 const pro=built('client/pro/build/index.html'),mini=built('client/_site-pages/mini/index.html');
 assert.match(pro,/No final price or checkout yet/); assert.match(mini,/No complete Mini prototype accepted/);
 assert.doesNotMatch(pro,/data-price-/);
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

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import worker from '../worker/index.js';

const assets = { fetch: async request => new Response(request.url, { headers: { 'x-method': request.method } }) };
const fetchSite = (url, options) => worker.fetch(new Request(url, options), { ASSETS: assets });

test('each approved domain serves its own landing page, with query strings preserved', async () => {
  for (const [host, page] of [['avoado.si', '/_site-pages/home/'], ['avocadomini.si', '/_site-pages/mini/'], ['avocadopro.si', '/_site-pages/pro/']]) {
    const result = await fetchSite(`https://${host}/?campaign=launch`);
    assert.equal(result.status, 200);
    assert.equal(await result.text(), `https://${host}${page}?campaign=launch`);
  }
});

test('old product URLs resolve to the product domain in one redirect without looping', async () => {
  for (const host of ['avoado.si', 'avocadomini.si', 'avocadopro.si']) {
    for (const [path, destination] of [['/mini/', 'avocadomini.si'], ['/pro/', 'avocadopro.si'], ['/mini/index.html', 'avocadomini.si']]) {
      const result = await fetchSite(`https://${host}${path}?ref=old`);
      assert.equal(result.status, 308);
      assert.equal(result.headers.get('location'), `https://${destination}/?ref=old`);
      assert.equal((await fetchSite(result.headers.get('location'))).status, 200);
    }
  }
});

test('assets, shared pages, HEAD requests and API behavior survive the domain split', async () => {
  for (const path of ['/images/device.png', '/assets/style.css', '/preorder/complete/?session_id=demo']) {
    const url = `https://avocadopro.si${path}`;
    assert.equal(await (await fetchSite(url)).text(), url);
  }
  assert.equal((await fetchSite('https://avocadomini.si/', {method:'HEAD'})).headers.get('x-method'), 'HEAD');
  const offer = await fetchSite('https://avocadomini.si/api/preorders/offer');
  assert.equal(offer.status, 200);
  assert.equal((await offer.json()).ready, false);
  assert.equal((await fetchSite('https://avoado.si/api/missing')).status, 404);
});

test('each product advertises its own canonical sitemap and root URL', async () => {
  for (const host of ['avocadomini.si', 'avocadopro.si']) {
    assert.match(await (await fetchSite(`https://${host}/robots.txt`)).text(), new RegExp(`Sitemap: https://${host}/sitemap.xml`));
    const xml = await (await fetchSite(`https://${host}/sitemap.xml`)).text();
    assert.ok(xml.includes(`<loc>https://${host}/</loc>`));
    assert.equal((xml.match(/<loc>/g) || []).length, 1);
  }
});

test('asset-first hosting still serves the correct root and redirects old product paths', async () => {
  const assetRoot = new URL('../dist/client/', import.meta.url);
  const diskAssets = { fetch: async request => {
    const path = new URL(request.url).pathname;
    const file = new URL(`.${path}${path.endsWith('/') ? 'index.html' : ''}`, assetRoot);
    if (!existsSync(file)) return new Response(null, { status: 404 });
    return new Response(request.method === 'HEAD' ? null : readFileSync(file), {headers:{'content-type':'text/html'}});
  }};
  const hostedFetch = async url => {
    const request = new Request(url);
    const asset = await diskAssets.fetch(request);
    return asset.status === 404 ? worker.fetch(request, {ASSETS:diskAssets}) : asset;
  };
  for (const [host, heading] of [['avoado.si', 'Make the room part'], ['avocadomini.si', 'One device.'], ['avocadopro.si', 'Meet avocadoPro.']]) {
    const page = await hostedFetch(`https://${host}/`);
    assert.equal(page.status, 200);
    assert.ok((await page.text()).includes(heading));
    assert.equal((await hostedFetch(`https://${host}/mini/`)).status, 308);
    assert.ok((await (await hostedFetch(`https://${host}/robots.txt`)).text()).includes(`https://${host}/sitemap.xml`));
  }
});

test('built product pages have product canonicals and a working brand-home link', () => {
  for (const [path, host] of [['mini', 'avocadomini.si'], ['pro', 'avocadopro.si']]) {
    const html = readFileSync(new URL(`../dist/client/_site-pages/${path}/index.html`, import.meta.url), 'utf8');
    assert.ok(html.includes(`rel="canonical" href="https://${host}/"`));
    assert.ok(html.includes('href="https://avoado.si/"'));
  }
});

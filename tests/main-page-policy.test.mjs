import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MAIN_PAGE_PATHS, MAIN_DISCOVERY_PATHS, RETIRED_MAIN_PAGE_ROOTS, mainPageStatus } from '../services/sky-web/main-page-policy.mjs';
import { withMiniSite } from '../services/sky-web/domain-router.mjs';

void test('retired documents and aliases cannot dispatch to either application, for any document method', async () => {
  const app = withMiniSite({ fetch() { assert.fail('retired page reached native worker'); } }, () => assert.fail('retired page reached Mini'));
  const aliases = ['/sky/billing', '/os/sky/billing/provider-test', '/sky/compute-grid', '/os/sky/agents/citations', '/sky/visual-scribe'];
  for (const host of ['avoado.si', 'fixture.chatgpt.site']) {
    for (const path of [...RETIRED_MAIN_PAGE_ROOTS, ...aliases, '/%66itness', '/noah/%62illing']) {
      for (const method of ['GET', 'HEAD', 'POST']) {
        const response = await app.fetch(new Request(`https://${host}${path}/?preview=1`, { method }));
        assert.equal(response.status, 410, `${host} ${method} ${path}`);
        assert.equal(response.headers.get('x-robots-tag'), 'noindex');
        assert.equal(response.headers.get('location'), null);
        if (method === 'HEAD') assert.equal(await response.text(), '');
      }
    }
  }
});

void test('current workflows, retained detail records, API writes and shared assets still dispatch', async () => {
  const seen = [];
  const app = withMiniSite({ fetch(request) { seen.push(request); return new Response('native'); } }, request => { seen.push(request); return new Response('product'); });
  for (const path of [...MAIN_PAGE_PATHS, '/noah/agents/fixture', '/noah/tasks/fixture', '/noah/releases/fixture', '/noah/engineering/combinations/fixture', '/connect/status']) {
    const response = await app.fetch(new Request(`https://avoado.si${path}`));
    if (path === '/noah/profile') {
      assert.equal(response.status, 308);
      assert.equal(response.headers.get('location'), 'https://avoado.si/aries');
    } else {
      assert.equal(response.status, 200, path);
    }
  }
  for (const path of ['/api/noah/jobs', '/api/sky/settle', '/api/eve/history']) {
    const request = new Request(`https://avoado.si${path}`, { method: 'POST', body: 'unchanged', headers: { cookie: 'owner-fixture' } });
    assert.equal((await app.fetch(request)).status, 200);
    assert.equal(seen.at(-1), request);
    assert.equal(await seen.at(-1).text(), 'unchanged');
  }
  let assetPath;
  const response = await app.fetch(new Request('https://avoado.si/_next/static/fixture.js'), { ASSETS: { fetch(request) { assetPath = new URL(request.url).pathname; return new Response('asset'); } } });
  assert.equal(await response.text(), 'asset');
  assert.equal(assetPath, '/_next/static/fixture.js');
});

void test('unknown documents are not silently proxied; other product and campus hosts keep their routing', async () => {
  const app = withMiniSite({ fetch: () => new Response('native') }, () => new Response('product'));
  for (const path of ['/unknown-page', '/orphan.html', '/fitness-extra', '/noah/new-unreviewed-page', '/noah/agents/fixture/extra', '/bad%zz']) {
    assert.equal((await app.fetch(new Request('https://avoado.si' + path))).status, 404, path);
  }
  for (const host of ['columbia.avoado.si', 'localhost:8787']) {
    assert.equal(await (await app.fetch(new Request(`http://${host}/fitness`))).text(), 'native');
  }
  for (const path of ['/pro/', '/MATOU/api/session']) assert.equal(await (await app.fetch(new Request('https://avoado.si' + path))).text(), 'product');
});

void test('sitemaps describe only current discoverable pages; management and retired pages stay out', async () => {
  const app = withMiniSite({ fetch() { assert.fail('sitemap should not reach old app'); } }, () => assert.fail('sitemap should not reach product site'));
  for (const path of ['/sitemap.xml', '/noah/sitemap.xml']) {
    const response = await app.fetch(new Request('https://avoado.si' + path));
    assert.equal(response.status, 200);
    const xml = await response.text();
    for (const page of MAIN_DISCOVERY_PATHS) assert.ok(xml.includes(`<loc>https://avoado.si${page}</loc>`));
    assert.doesNotMatch(xml, /preorder|rocket-star|billing|review|account|tasks|wallet/);
    assert.equal(await (await app.fetch(new Request('https://avoado.si' + path, { method: 'HEAD' }))).text(), '');
  }
});

void test('navigation does not send current users to retired pages; the policy ships with the router', () => {
  for (const file of ['components/sky-navigation.tsx', 'components/noah-navigation.tsx', 'components/noah-shell.tsx']) {
    const source = readFileSync(new URL('../' + file, import.meta.url), 'utf8');
    for (const [, path] of source.matchAll(/href:\s*['"]([^'"]+)['"]/g)) {
      assert.notEqual(mainPageStatus(path.split(/[?#]/)[0]), 410, `${file}: ${path}`);
    }
  }
  assert.match(readFileSync(new URL('../scripts/stage-sky-domain-router.mjs', import.meta.url), 'utf8'), /copyFile\([^\n]+main-page-policy\.mjs/);
});

void test('Noah Runner approval handoff preserves its one-time code through the public router', async () => {
  const runner = readFileSync(new URL('../scripts/noah-mac-runner.mjs', import.meta.url), 'utf8');
  assert.ok(runner.includes('/noah/mac/connect?user_code='));
  const url = 'https://avoado.si/noah/mac/connect?user_code=TEST1234';
  let forwarded;
  const app = withMiniSite({ fetch(request) { forwarded = request; return new Response('approval'); } }, () => assert.fail('approval reached Mini'));
  for (const method of ['GET', 'HEAD']) {
    const request = new Request(url, { method });
    assert.equal((await app.fetch(request)).status, 200);
    assert.equal(forwarded, request);
    assert.equal(new URL(forwarded.url).searchParams.get('user_code'), 'TEST1234');
  }
  assert.equal(mainPageStatus('/noah/mac/connect/unknown'), 404);
  assert.equal(mainPageStatus('/noah/mac/activity'), 404);
});

void test('the CowAgent campaign guide is public without exposing unknown guide routes', async () => {
  assert.equal(mainPageStatus('/noah/guides/cowagent-mac'), 200);
  assert.equal(mainPageStatus('/noah/guides/cowagent-mac/captions.vtt'), null, 'caption assets pass through to the application');
  assert.equal(mainPageStatus('/noah/guides/cowagent-mac/unknown'), 404);
  assert.ok(MAIN_DISCOVERY_PATHS.includes('/noah/guides/cowagent-mac'));
  let forwarded;
  const app = withMiniSite({ fetch(request) { forwarded = request; return new Response('guide'); } }, () => assert.fail('guide reached Mini'));
  for (const method of ['GET', 'HEAD']) {
    const request = new Request('https://avoado.si/noah/guides/cowagent-mac?utm_source=youtube', { method });
    assert.equal((await app.fetch(request)).status, 200);
    assert.equal(forwarded, request);
    assert.equal(new URL(forwarded.url).searchParams.get('utm_source'), 'youtube');
  }
});

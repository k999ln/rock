import test from 'node:test';
import assert from 'node:assert/strict';
import { screen } from './fixtures/noah/screen.mjs';
import * as surface from '../lib/noah-surface.ts';
import { withMiniSite } from '../services/sky-web/domain-router.mjs';
import { MAIN_DISCOVERY_PATHS } from '../services/sky-web/main-page-policy.mjs';
import { noahReturnPath } from '../lib/noah-navigation.ts';
import { NOAH_SHORT_PAGES } from '../services/sky-web/noah-page-routes.mjs';

void test('short URLs reach the Noah app with the original URL and stay out of the public sitemap', async () => {
  const seen = [];
  const app = withMiniSite({fetch: request => {
    seen.push(request.url);
    return new Response();
  }}, () => assert.fail('unexpected Mini proxy'));
  assert.equal(new Set(NOAH_SHORT_PAGES.map(([short]) => short)).size, 12);
  for (const [short] of NOAH_SHORT_PAGES) {
    const target = `${short}?source=fixture&tag=a&tag=b#section`;
    assert.equal(noahReturnPath(target), target);
    assert.ok(!MAIN_DISCOVERY_PATHS.includes(short));
    for (const method of ['GET', 'HEAD']) {
      const url = `https://avoado.si${target}`;
      const response = await app.fetch(new Request(url, {method}));
      assert.equal(response.status, 200, `${method} ${short}`);
      assert.equal(response.headers.get('location'), null, short);
      assert.equal(seen.at(-1), url);
    }
  }
  for (const path of ['/aries/more', '/Aries', '/aries-extra']) {
    assert.equal(noahReturnPath(path), '/noah');
    assert.equal((await app.fetch(new Request(`https://avoado.si${path}`))).status, 404);
  }
  assert.equal(noahReturnPath('//elsewhere.test/aries'), '/noah');
  for (const host of ['avoado.si', 'localhost:8787']) {
    const response = await app.fetch(new Request(`https://${host}/noah/profile?from=menu#permissions`));
    assert.equal(response.status, 308);
    assert.equal(response.headers.get('location'), `https://${host}/aries?from=menu#permissions`);
  }
});

void test('old discovery URLs keep queries, repeated filters, category and anchors on the home without a loop', async () => {
  const app = withMiniSite({fetch: () => new Response('home')}, () => assert.fail('unexpected proxy'));
  for (const host of ['avoado.si', 'localhost:8787']) for (const method of ['GET', 'HEAD']) {
    const suffix = '?q=%E8%B3%87%E6%96%99+%26+image&tab=catalog&collectionSource=&collectionTopic=work&tag=a&tag=b&via=trial-300#noah-collection';
    const response = await app.fetch(new Request('https://' + host + '/noah/explore' + suffix, {method}));
    assert.equal(response.status, 308);
    const target = new URL(response.headers.get('location'));
    assert.equal(target.pathname, '/noah');
    assert.equal(target.search, new URL('https://' + host + '/noah/explore' + suffix).search);
    assert.equal(target.hash, '#noah-collection');
    assert.equal((await app.fetch(new Request(target))).status, 200);
  }
  assert.ok(!MAIN_DISCOVERY_PATHS.includes('/noah/explore'));
});

void test('home searches its existing collection with the selected category and clears only the query', async () => {
  for (const [query, expectedSource] of [['?q=資料&tab=catalog&collectionTopic=work', ''], ['?q=資料&collectionSource=github&collectionTopic=work','github']]) {
    const ui = screen({search:query, modules:{'./noah-pin-grid':{default:()=>null},'./noah-timeline':{default:()=>({type:'p',props:{children:'TIMELINE'}})}}, fetch:async()=>({body:{items:[],total:0,nextCursor:null,ownerScope:null}})});
    const home = ui.mount('components/noah-home.tsx',{mode:'public'}); await home.flush();
    const requests = ui.calls.map(call => new URL(call.url,'https://avoado.si'));
    assert.ok(requests.length > 0);
    for (const url of requests) {
      assert.equal(url.pathname, '/api/noah/discover');
      assert.equal(url.searchParams.get('q'), '資料');
      assert.equal(url.searchParams.get('source'), expectedSource);
      assert.equal(url.searchParams.get('topic'), 'work');
    }
    assert.match(home.text(), /検索結果/); assert.doesNotMatch(home.text(), /TIMELINE/);
    await home.click('検索条件をクリア');
    const cleared = new URL(ui.visits.at(-1),'https://avoado.si');
    assert.equal(cleared.searchParams.has('q'), false);
    assert.equal(cleared.searchParams.get('collectionTopic'), 'work');
  }
});

void test('public menu has one home entry and no separate discovery or timeline destinations', () => {
  const ui = screen({search:'?q=資料&collectionSource=',modules:{'next/navigation':{usePathname:()=>'/noah'},'@/lib/noah-surface':surface}});
  const shell = ui.mount('components/noah-shell.tsx',{mode:'public',children:null});
  const menu = shell.find('nav').find(node=>node.props['aria-label']==='メインメニュー');
  const links = shell.nodes(menu).filter(node=>node.type==='a');
  assert.equal(links.filter(node=>shell.text(node)==='ホーム').length,1);
  assert.ok(links.every(node=>!['Agentを探す','タイムライン','登録情報','任せる範囲','ココナラの仕事'].includes(shell.text(node))));
  assert.ok(links.every(node=>!node.props.href.includes('/explore') && !node.props.href.includes('#timeline')));
  assert.equal(shell.find('a').filter(node=>node.props.href === '/aries').length, 1);
  assert.ok(shell.find('form').every(node=>node.props.action==='/noah'));
  assert.ok(shell.find('input').every(node=>node.props.defaultValue==='資料'));
});

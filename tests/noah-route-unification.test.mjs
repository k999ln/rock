import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { NOAH_PAGES, NOAH_REDIRECTS, NOAH_LOCAL_LABS, noahPageRedirect } from '../services/sky-web/noah-page-routes.mjs';
import { withMiniSite } from '../services/sky-web/domain-router.mjs';
const app = withMiniSite({fetch:request=>new Response(new URL(request.url).pathname)},()=>new Response('mini'));

void test('each known old page moves once to its canonical page, retaining selections and fragments', async()=>{
  for(const [from,destination] of NOAH_REDIRECTS){
    const path=from.replace(/:\w+/g,'fixture');
    const response=await app.fetch(new Request('https://avoado.si'+path+'?tag=a&tag=b&source=shared#result'));
    assert.equal(response.status,308,path);
    const target=new URL(response.headers.get('location'));
    assert.equal(target.origin,'https://avoado.si');
    assert.equal(target.pathname,destination.split(/[?#]/)[0].replace(/:\w+/g,'fixture'));
    assert.deepEqual(target.searchParams.getAll('tag'),['a','b']);
    assert.equal(target.hash,new URL(destination,'https://avoado.si').hash||'#result');
    assert.equal(noahPageRedirect(target.pathname),null,'destination cannot redirect back');
  }
});
void test('Noah pages reuse the original features, including dynamic Tool/code pages',()=>{
  for(const [source,destination] of NOAH_PAGES){
    const file=new URL('../app/noah/'+destination.replace(/:(\w+)/g,'[$1]')+'/page.tsx',import.meta.url);
    assert.equal(existsSync(file),true,destination);
    assert.ok(readFileSync(file,'utf8').includes('@/app/sky/'+source.replace(/:(\w+)/g,'[$1]')+'/page'),destination);
  }
});
void test('retired AMC cannot form a cycle or change the fixed work view',async()=>{
  for(const path of ['/amc','/zema/amc']){
    const response=await app.fetch(new Request('https://avoado.si'+path+'?mode=invalid&view=invalid&job=fixture'));
    const target=new URL(response.headers.get('location'));
    assert.equal(target.pathname,'/os/eve');assert.equal(target.searchParams.get('mode'),'tools');assert.equal(target.searchParams.get('view'),'work');assert.equal(target.searchParams.get('job'),'fixture');
  }
});
void test('local labs get public guidance while local runtime and its permission checks remain reachable',async()=>{
  for(const lab of NOAH_LOCAL_LABS){
    const publicResponse=await app.fetch(new Request('https://avoado.si/os/sky/'+lab));
    assert.equal(publicResponse.status,307);assert.equal(new URL(publicResponse.headers.get('location')).pathname,'/noah/explore');
    const localResponse=await app.fetch(new Request('http://127.0.0.1:8787/os/sky/'+lab));
    assert.equal(localResponse.status,200);assert.equal(await localResponse.text(),'/sky/'+lab);
    assert.match(readFileSync(new URL('../app/sky/'+lab+'/page.tsx',import.meta.url),'utf8'),/notFound\(/);
  }
});
void test('API routes, authentication, mutations and unknown URLs are not aliased',async()=>{
  for(const path of ['/api/sky/agents','/sky/unknown','/sky/tools/x/extra','/sky/marketplace-extra','/sky/code','//evil.invalid','/sky%2Fmarketplace']) assert.equal(noahPageRedirect(path),null);
  assert.equal(await(await app.fetch(new Request('https://avoado.si/api/sky/agents',{method:'POST',body:'fixture'}))).text(),'/api/sky/agents');
  assert.equal(await(await app.fetch(new Request('https://avoado.si/noah/unknown'))).text(),'/noah/unknown');
  const encoded=await app.fetch(new Request('https://avoado.si/sky/tools/%2F%2Fevil.invalid?returnTo=https%3A%2F%2Fevil.invalid'));
  assert.equal(new URL(encoded.headers.get('location')).origin,'https://avoado.si');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { createNoahProjectApi, noahProjectDetail, withNoahCloudAvailability } from '../lib/noah-project-api.ts';
import { selectNoahDirectory } from '../lib/noah-agent-directory.ts';
import { NOAH_FREE_CLOUD_PROFILES, NOAH_CLOUD_PROFILES } from '../lib/noah-cloud-contract.ts';
import { noahCardHref } from '../lib/noah-project-view.ts';
const id=`project-${'a'.repeat(64)}`;
const entry=(href='https://github.com/maker/agent')=>({card:{id,feedbackId:id,name:'Agent',summary:'Works',provider:'maker',host:new URL(href).hostname,external:true,href,sources:[{source:'github',sourceUrl:href,observedAt:123,author:'maker',metrics:{stars:5}}]},families:[],observedAt:123});
const request=(query='')=>new Request(`https://noah.test/api/noah/discover/project?id=${id}${query}`);
const space=()=>entry('https://huggingface.co/spaces/maker/agent');
const info={id:'maker/agent',private:false,host:'https://maker-agent.hf.space',runtime:{stage:'RUNNING'}};
void test('deployed official CLI profiles appear in connectable search without inventing listed families',()=>{
  const rows=['memory','filesystem','sequentialthinking'].map(name=>({...entry(`https://hub.docker.com/r/mcp/${name}`),card:{...entry(`https://hub.docker.com/r/mcp/${name}`).card,name}}));
  rows.push(...['hermes','boss','time'].map(profile=>entry(NOAH_CLOUD_PROFILES[profile].repository)));
  const before=structuredClone(rows), available=withNoahCloudAvailability(rows,true,NOAH_FREE_CLOUD_PROFILES);
  assert.equal(selectNoahDirectory(available,'noah','').length,6);
  const memory=selectNoahDirectory(available,'noah','Memory')[0];
  assert.equal(noahProjectDetail(memory,true,NOAH_FREE_CLOUD_PROFILES).connection.profile,'memory');
  assert.equal(memory.card.run,'phone');assert.deepEqual(memory.families,[]);
  assert.equal(memory.card.feedbackId,rows[0].card.feedbackId);assert.equal(noahCardHref(memory.card),noahCardHref(rows[0].card));
  assert.deepEqual(rows,before,'availability must not mutate the source cards or their saved identities');
});
void test('disabled, unsupported and lookalike CLI entries stay out of connectable search',()=>{
  const rows=[entry('https://hub.docker.com/r/mcp/memory'),entry('https://github.com/NousResearch/hermes-agent'),entry('https://hub.docker.com/r/other/memory'),entry('https://github.com/modelcontextprotocol/servers')];
  const available=withNoahCloudAvailability(rows,true,['memory']);
  assert.equal(selectNoahDirectory(available,'noah','').length,1);
  assert.equal(selectNoahDirectory(withNoahCloudAvailability(available,false,NOAH_FREE_CLOUD_PROFILES),'noah','').length,0);
  assert.equal(selectNoahDirectory(withNoahCloudAvailability(rows,true,[]),'noah','').length,0);
  assert.equal(selectNoahDirectory(available,'','').length,4,'all entries remain discoverable');
});
void test('collected cards and ready families resolve internally without treating provenance as execution',async()=>{
  const row=entry(); assert.match(noahCardHref(row.card),/^\/noah\/discover\/agent\?id=project-/);
  const setup=noahProjectDetail(row).connection;assert.equal(setup.kind,'setup');assert.equal(new URL(setup.importHref,'https://noah.test').searchParams.get('sourceUrl'),row.card.href);
  const ready={...row,card:{...row.card,id:'verified-family',external:false,href:undefined},families:['verified-family']};
  assert.deepEqual(noahProjectDetail(ready).connection,{kind:'ready',familyId:'verified-family'});
  const wrong={...row,families:['different-family']};assert.equal(noahProjectDetail(wrong).connection.kind,'setup');
  assert.equal(noahProjectDetail(entry('https://x.com/maker/status/123')).connection.importHref,null);
});
void test('project GET is read-only and opening a public Space checks the exact repository',async()=>{
  const calls=[];const api=createNoahProjectApi({directory:async()=>[space()],fetcher:async(url,options)=>{calls.push([url,options]);return url.includes('/api/spaces/')?Response.json(info):new Response('<html></html>',{headers:{'content-type':'text/html; charset=utf-8'}});}});
  const detail=await (await api(request())).json();assert.equal(detail.connection.kind,'space');assert.equal(calls.length,0,'viewing a card must not start a provider request');
  assert.deepEqual(await (await api(request('&open=space'))).json(),{url:'https://maker-agent.hf.space/'});
  assert.equal(calls[0][0],'https://huggingface.co/api/spaces/maker/agent');assert.equal(calls[0][1].redirect,'manual');
  assert.ok(calls[0][1].signal);assert.equal((await api(new Request(request(),{method:'POST'}))).status,405);
  assert.equal(calls[1][0],'https://maker-agent.hf.space/');assert.equal(calls[1][1].redirect,'manual');
});
void test('API-only responses and providers refusing embedding stay inside Noah with an actionable error',async()=>{
  for(const headers of [{'content-type':'application/json'},{'content-type':'text/html','x-frame-options':'SAMEORIGIN'},{'content-type':'text/html','content-security-policy':"default-src *; frame-ancestors 'self'"}]){
    const api=createNoahProjectApi({directory:async()=>[space()],fetcher:async url=>url.includes('/api/spaces/')?Response.json(info):new Response('body',{headers})});
    const response=await api(request('&open=space'));assert.equal(response.status,503);const body=await response.json();assert.match(body.error,/接続設定/);assert.equal(body.url,undefined);
  }
});
void test('withdrawn, expired, malformed and stale targets never open a provider',async()=>{
  let calls=0;const api=createNoahProjectApi({directory:async()=>[],fetcher:async()=>{calls++;throw Error();}});
  assert.equal((await api(request('&open=space'))).status,404);
  assert.equal((await api(new Request('https://noah.test/api/noah/discover/project?id=https://127.0.0.1/'))).status,400);
  assert.equal((await api(request('&open=https://evil.test/'))).status,400);assert.equal(calls,0);
  const changed=createNoahProjectApi({directory:async()=>[entry()]});assert.equal((await changed(request('&open=space'))).status,409);
});
void test('Space validation rejects private, gated, stopped, wrong-identity and unsafe hosts',async()=>{
  for(const patch of [{private:true},{gated:true},{disabled:true},{id:'other/agent'},{host:'https://evil.test/'},{host:'https://maker-agent.hf.space.evil.test/'},{host:'https://user@maker-agent.hf.space/'},{host:'http://maker-agent.hf.space/'},{host:'https://maker-agent.hf.space/?token=abc'},{host:'https://maker-agent.hf.space/path'},{runtime:{stage:'RUNTIME_ERROR'}}]){
    const api=createNoahProjectApi({directory:async()=>[space()],fetcher:async()=>Response.json({...info,...patch})});
    const response=await api(request('&open=space'));assert.equal(response.status,503,JSON.stringify(patch));assert.equal((await response.json()).url,undefined);
  }
  for(const fetcher of [async()=>new Response('x'.repeat(262145)),async()=>new Response(null,{status:429}),async()=>{throw Error('timeout');}]){
    assert.equal((await createNoahProjectApi({directory:async()=>[space()],fetcher})(request('&open=space'))).status,503);
  }
});

void test('Cloudflare runtime validates provider requests and rejects redirects before embedding',async()=>{
  const {build}=await import('esbuild'),{Miniflare,convertV4MiniflareOptions}=await import('miniflare');
  const bundle=await build({stdin:{contents:`import {createNoahProjectApi} from './lib/noah-project-api.ts';export default {fetch(request,env){return createNoahProjectApi({directory:async()=>[${JSON.stringify(space())}],fetcher:(url,options)=>env.PROVIDER.fetch(new Request(url,options))})(request)}}`,resolveDir:process.cwd()},bundle:true,write:false,format:'esm',platform:'neutral',external:['node:*'],logLevel:'silent'});
  const calls=[];let redirect=false;
  const worker=new Miniflare(convertV4MiniflareOptions({modules:true,compatibilityDate:'2026-08-18',compatibilityFlags:['nodejs_compat'],script:bundle.outputFiles[0].text,serviceBindings:{PROVIDER:request=>{
    calls.push({url:request.url,redirect:request.redirect});
    if(redirect)return new Response(null,{status:302,headers:{location:'https://other.test/'}});
    return request.url.includes('/api/spaces/')?Response.json(info):new Response('<html></html>',{headers:{'content-type':'text/html'}});
  }}}));
  try{
    const response=await worker.dispatchFetch(request('&open=space').url);assert.equal(response.status,200);assert.deepEqual(await response.json(),{url:'https://maker-agent.hf.space/'});assert.equal(calls.length,2);
    redirect=true;assert.equal((await worker.dispatchFetch(request('&open=space').url)).status,503);assert.equal(calls.length,3,'redirect destination must not be fetched');
  }finally{await worker.dispose()}
});

void test('ready family feedback resolves only a listed identity without opening providers',async()=>{
  const family='mcp-registry:ac.mizan/registry';
  const row={...entry(),families:[family],card:{...entry().card,id:family}};
  let calls=0;const api=createNoahProjectApi({directory:async()=>[row],fetcher:async()=>{calls++;throw Error();}});
  const url='https://noah.test/api/noah/discover/project?'+new URLSearchParams({family});
  const response=await api(new Request(url));assert.equal(response.status,200);assert.equal((await response.json()).card.feedbackId,id);
  assert.equal((await api(new Request(url+'&open=space'))).status,400);
  assert.equal((await api(new Request(url+'&id='+id))).status,400);
  assert.equal((await api(new Request('https://noah.test/api/noah/discover/project?family=unlisted-family'))).status,404);
  assert.equal((await api(new Request('https://noah.test/api/noah/discover/project?family=%0A'))).status,400);
  assert.equal(calls,0);
});

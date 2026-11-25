import test from 'node:test';
import assert from 'node:assert/strict';
import { revenuePackProxy } from '../lib/noah-revenue-pack-proxy.ts';
const origin='https://avoado.si', service='https://avokado-noah-revenue-runtime.mr-kirin999.workers.dev';
const secret='a'.repeat(64), cookie=`__Host-noah-revenue=${secret}`;
const request=(action,{method='GET',source=origin,credentials=cookie,body,headers={}}={})=>new Request(`${origin}/api/noah/revenue-pack/${action}`,{method,headers:{Origin:source,Cookie:credentials,...(body!==undefined?{'Content-Type':'application/json'}:{}),...headers},...(body!==undefined?{body:typeof body==='string'?body:JSON.stringify(body)}:{})});
void test('private proxy rejects anonymous requests, cross-site writes and non-allowlisted admin routes before fetching',async()=>{
  let calls=0;const fetcher=async()=>{calls++;return Response.json({});};
  for(const [action,options,status] of [['status',{credentials:''},401],['stop',{method:'POST',body:{},source:'https://evil.test'},403],['run',{method:'POST',body:{},headers:{'sec-fetch-site':'cross-site'}},403],['admin/pair',{method:'POST',body:{}},404],['status',{method:'POST',body:{}},405],['constructor',{},404]])
    assert.equal((await revenuePackProxy(request(action,options),action,fetcher)).status,status);
  assert.equal(calls,0);
});
void test('proxy sends only the dedicated session to its fixed service, never Noah account or authorization credentials',async()=>{
  const response=await revenuePackProxy(request('status',{credentials:`noah_browser=private; ${cookie}; account=private`,headers:{Authorization:'Bearer private'}}),'status',async(url,options)=>{
    assert.equal(url,`${service}/api/status`);assert.equal(options.redirect,'manual');
    const headers=new Headers(options.headers);assert.equal(headers.get('Cookie'),cookie);assert.equal(headers.get('Origin'),service);assert.equal(headers.get('Authorization'),null);
    return Response.json({jobs:[]},{headers:{'Set-Cookie':'account=untrusted'}});
  });
  assert.equal(response.status,200);assert.equal(response.headers.get('set-cookie'),null);assert.match(response.headers.get('cache-control'),/no-store/);
});
void test('pairing and logout preserve only correctly scoped secure session cookies',async()=>{
  for(const action of ['pair','logout']){
    const set=`__Host-noah-revenue=${action==='pair'?secret:''}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${action==='pair'?2592000:0}`;
    const response=await revenuePackProxy(request(action,{method:'POST',body:{token:'b'.repeat(64)}}),action,async()=>Response.json({connected:true},{headers:{'Set-Cookie':set}}));
    assert.equal(response.headers.get('set-cookie'),set);
  }
  for(const set of [`${cookie}; Domain=.avoado.si; Path=/`,`${cookie}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=2592000`]){
    const response=await revenuePackProxy(request('pair',{method:'POST',body:{}}),'pair',async()=>Response.json({},{headers:{'Set-Cookie':set}}));
    assert.equal(response.headers.get('set-cookie'),null);
  }
});
void test('proxy bounds input and refuses redirects and non-JSON upstream responses',async()=>{
  let calls=0;
  const large=await revenuePackProxy(request('run',{method:'POST',body:'x'.repeat(16385)}),'run',async()=>{calls++;return Response.json({});});
  assert.equal(large.status,413);assert.equal(calls,0);
  assert.equal((await revenuePackProxy(request('status'),'status',async()=>new Response(null,{status:302,headers:{Location:'https://evil.test'}}))).status,502);
  assert.equal((await revenuePackProxy(request('status'),'status',async()=>new Response('html'))).status,502);
  assert.equal((await revenuePackProxy(request('status'),'status',async()=>{throw Error('network');})).status,503);
});

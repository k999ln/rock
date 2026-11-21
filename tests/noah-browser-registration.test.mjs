import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {createNoahBrowserRegistration} from '../lib/noah-browser-registration.ts';
import {createNoahExternalAccountStore} from '../lib/noah-external-account-store.ts';
import {ownerScopeFor} from '../lib/owner-intent.ts';
import {authenticate,signature,recipes,validInput,validValues} from '../services/noah-registration-browser/protocol.mjs';
const endpoint='https://browser.example.test/v1/session';
const provider={id:'example',execution:'browser',executorUrl:endpoint,mcpUrl:'https://provider.test/mcp',revision:1,fields:[{key:'email'}]};
function fixture(){
 const records=new Map(),calls=[];let etag=0;const credential=randomBytes(32).toString('hex'),key=randomBytes(32).toString('hex');
 const bucket={get:async k=>{const o=records.get(k);return o?{...o,size:o.data.length,text:async()=>o.data}:null;},put:async(k,data,options)=>{const old=records.get(k);if(options.onlyIf.etagMatches&&old?.etag!==options.onlyIf.etagMatches||options.onlyIf.etagDoesNotMatch&&old)return null;const obj={data,etag:String(++etag)};records.set(k,obj);return obj;}};
 const store=createNoahExternalAccountStore(bucket,{active:'v1',keys:{v1:randomBytes(32).toString('hex')}});
 let verified=false,lost=false;
 const fetcher=async(url,init)=>{calls.push({url:String(url),init});assert.equal(init.redirect,'error');if(String(url)===provider.mcpUrl){assert.equal(new Headers(init.headers).get('Authorization'),`Bearer ${credential}`);return Response.json({echo:credential});}
  assert.equal(String(url),endpoint);const b=JSON.parse(init.body);assert.equal(await authenticate(key,new Request(endpoint,{method:'POST',headers:init.headers}),init.body),true);
  if(lost)throw Error('lost response');return Response.json({id:b.id,state:b.action==='cancel'?'failed':'needs_user',sequence:b.input?.sequence??0,...(b.action==='frame'?{image:'YWJj'}:{}),...(b.action==='resume'&&verified?{verified:{credential,externalId:'example-user'}}:{})});};
 const deps={url:endpoint,key,store,providers:[provider],authenticate:async r=>{const u=r.headers.get('x-user');if(!u)throw Error('auth');return u;},fetcher};
 const runtime=createNoahBrowserRegistration(deps);
 const request=async(user='alice',method='POST',body,id=randomUUID())=>new Request(`https://avoado.si/api/noah/registration/browser?job=${id}&provider=example`,{method,headers:{'x-user':user,'origin':'https://avoado.si','Content-Type':'application/json','X-Rock-Owner-Scope':await ownerScopeFor(user)},...(body?{body:JSON.stringify(body)}:{})});
 return {runtime,store,records,calls,credential,request,deps,verify:()=>{verified=true;},lose:()=>{lost=true;}};
}
void test('signed requests bind body and expiry; recipes and screen input stay constrained',async()=>{
 const key=randomBytes(32).toString('hex'),time=String(Date.now()),body='{"a":1}',sig=await signature(key,time,body),req=new Request(endpoint,{headers:{'X-Noah-Time':time,'X-Noah-Signature':sig}});
 assert.equal(await authenticate(key,req,body),true);assert.equal(await authenticate(key,req,'{}'),false);assert.equal(await authenticate(key,req,body,Date.now()+40000),false);
 assert.equal(validInput({kind:'click',x:400,y:2,sequence:1}),false);assert.equal(validInput({kind:'key',key:'F12',sequence:1}),false);assert.equal(validInput({kind:'text',text:'hello',sequence:1}),true);
 const r={id:'example',revision:1,domains:['provider.test'],startUrl:'https://provider.test/join',verifyUrl:'https://provider.test/me',identityField:'id',credentialSelector:'#key',submit:'#submit',fields:[{key:'email',selector:'#email',required:true}]};
 assert.equal(recipes(JSON.stringify([r])).length,1);assert.deepEqual(recipes(JSON.stringify([{...r,startUrl:'http://127.0.0.1'}])),[]);assert.deepEqual(recipes(JSON.stringify([{...r,domains:['*']} ])),[]);assert.equal(validValues(r,{email:'x',password:'unexpected'}),false);
});
void test('browser registration claims once, persists no fields and completes only after verified credentials',async()=>{
 const f=fixture(),execute=await f.runtime.executor(await f.request(),provider),id=randomUUID();
 assert.equal(await execute(id,{email:'private@provider.test'}),'needs_user');
 assert.equal(await execute(randomUUID(),{email:'again'}),'unknown');assert.equal(f.calls.length,1);
 assert.doesNotMatch(JSON.stringify([...f.records.values()]),/private@|registering/);
 assert.equal(await execute(id),'needs_user');f.verify();assert.equal(await execute(id),'completed');
 assert.equal((await f.store.load('alice','example')).account.credential,f.credential);assert.equal((await f.store.load('bob','example')).account,null);
 assert.doesNotMatch(JSON.stringify([...f.records.values()]),new RegExp(f.credential));
 const count=f.calls.length;assert.equal(await execute(randomUUID(),{email:'again'}),'completed');assert.equal(f.calls.length,count);
});
void test('lost response cannot resubmit a registration or create one for a different account',async()=>{
 const f=fixture(),execute=await f.runtime.executor(await f.request(),provider),id=randomUUID();f.lose();
 await assert.rejects(()=>execute(id,{email:'a@provider.test'}));assert.equal(await execute(randomUUID(),{email:'other'}),'unknown');assert.equal(f.calls.length,1);
 assert.equal((await f.runtime.control(await f.request('bob','GET',null,id))).status,404);
 assert.equal((await f.runtime.control(new Request(`https://avoado.si/api/noah/registration/browser?job=${id}&provider=example`))).status,401);
});
void test('handoff rejects cross-origin and account changes and never returns verified keys',async()=>{
 const f=fixture(),id=randomUUID();await(await f.runtime.executor(await f.request(),provider))(id,{email:'a@provider.test'});
 const frame=await f.runtime.control(await f.request('alice','GET',null,id));assert.equal((await frame.json()).image,'YWJj');
 const wrong=await f.request('alice','POST',{action:'resume'},id);wrong.headers.set('origin','https://evil.test');assert.equal((await f.runtime.control(wrong)).status,403);
 const changed=await f.request('alice','POST',{action:'resume'},id);changed.headers.set('X-Rock-Owner-Scope',await ownerScopeFor('bob'));assert.equal((await f.runtime.control(changed)).status,409);
 const invalid=await f.request('alice','POST',{action:'input',input:{kind:'navigate',url:'https://evil.test',sequence:1}},id);assert.equal((await f.runtime.control(invalid)).status,400);
 f.verify();const reply=await(await f.runtime.control(await f.request('alice','POST',{action:'resume'},id))).text();assert.match(reply,/completed/);assert.doesNotMatch(reply,new RegExp(`${f.credential}|verified|externalId`));
});
void test('saved browser credential is sent only to its MCP and stripped from results',async()=>{
 const f=fixture(),id=randomUUID(),execute=await f.runtime.executor(await f.request(),provider);await execute(id,{email:'a'});f.verify();await execute(id);
 const run=f.runtime.ownerFetch('alice',provider.mcpUrl);assert.ok(run);const result=await run(provider.mcpUrl,{method:'POST',body:'{}'});assert.doesNotMatch(await result.text(),new RegExp(f.credential));
 await assert.rejects(()=>run('https://evil.test'));await assert.rejects(()=>f.runtime.ownerFetch('bob',provider.mcpUrl)(provider.mcpUrl));assert.equal(f.runtime.ownerFetch('alice','https://other.test'),undefined);
});

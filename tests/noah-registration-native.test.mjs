import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes,randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { createNoahExternalAccountStore } from '../lib/noah-external-account-store.ts';
import { AGENTBOARD_PROVIDER,AGENTBOARD_MCP,createNoahNativeRegistration } from '../lib/noah-registration-native.ts';
import { createNoahRegisteredMcpFetch } from '../lib/noah-registered-mcp.ts';
import { createNoahRegistrationApi } from '../lib/noah-registration.ts';
import { noahMcpHandshake,noahMcpCall } from '../lib/noah-mouth-mcp-remote.ts';
import { createRegistrationAccountStates } from '../lib/noah-registration-availability.ts';
import { ownerScopeFor } from '../lib/owner-intent.ts';
import { sha256Hex } from '../lib/noah-connect-requirements.ts';
function fixture(){
 const objects=new Map();let sequence=0,registrations=0,verifications=0;const credential=`agb_${randomBytes(32).toString('hex')}`;
 const bucket={async get(k){const o=objects.get(k);return o?{size:o.text.length,etag:o.etag,text:async()=>o.text}:null;},async put(k,text,opts){const old=objects.get(k);if(opts?.onlyIf?.etagMatches&&old?.etag!==opts.onlyIf.etagMatches)return null;if(opts?.onlyIf?.etagDoesNotMatch==='*'&&old)return null;const v={text,etag:String(++sequence)};objects.set(k,v);return v;},async delete(k){objects.delete(k);}};
 const keys={active:'v1',keys:{v1:randomBytes(32).toString('hex')}},store=createNoahExternalAccountStore(bucket,keys);
 const calls=[],fetcher=async(url,init)=>{calls.push({url:String(url),init});assert.equal(init.redirect,'manual');if(String(url).endsWith('/api/agents/register')){registrations++;assert.deepEqual(Object.keys(JSON.parse(init.body)),['name']);return Response.json({credential,agent:{id:'external-alice',status:'active'},untrusted:'ignore me'});}verifications++;assert.equal(init.headers.Authorization,`Bearer ${credential}`);return Response.json({agent:{id:'external-alice',status:'active'}});};
 const authenticate=async r=>{const user=r.headers.get('x-user');if(!user)throw Error('UNAUTHORIZED');return user;};
 const request=async(user='alice',method='POST')=>new Request('https://avoado.si/api/noah/registration',{method,headers:{'x-user':user,'X-Rock-Owner-Scope':await ownerScopeFor(user)}});
 const executor=createNoahNativeRegistration({store,authenticate,fetcher});
 return {objects,store,keys,bucket,fetcher,calls,credential,authenticate,request,executor,counts:()=>({registrations,verifications})};
}
void test('official registration executes once, encrypts its key and verifies identity before completion',async()=>{
 const f=fixture(),execute=await f.executor(await f.request(),AGENTBOARD_PROVIDER),id=randomUUID();
 assert.equal(await execute(id,{name:'Synthetic agent'}),'completed');assert.deepEqual(f.counts(),{registrations:1,verifications:1});
 assert.equal(await execute(randomUUID(),{name:'Another click'}),'completed');assert.equal(f.counts().registrations,1);
 const stored=(await f.store.load('alice','agentboard')).account;assert.equal(stored.state,'ready');assert.equal(stored.credential,f.credential);
 assert.equal((await f.store.load('bob','agentboard')).account,null);assert.doesNotMatch(JSON.stringify([...f.objects.values()]),new RegExp(`${f.credential}|Synthetic|external-alice`));
 const bobPath=[...f.objects.keys()][0].replace(/\/[a-f0-9]{64}\//,`/${await sha256Hex('bob')}/`);
 f.objects.set(bobPath,[...f.objects.values()][0]);await assert.rejects(()=>f.store.load('bob','agentboard'));
});
void test('registration requires the account and owner scope; no arbitrary destinations or fields',async()=>{
 const f=fixture();await assert.rejects(()=>f.executor(new Request('https://avoado.si'),AGENTBOARD_PROVIDER),{status:401});
 const wrong=await f.request();wrong.headers.set('X-Rock-Owner-Scope',await ownerScopeFor('bob'));await assert.rejects(()=>f.executor(wrong,AGENTBOARD_PROVIDER),{status:409});
 const execute=await f.executor(await f.request(),AGENTBOARD_PROVIDER);await assert.rejects(()=>execute(randomUUID(),{name:'test',password:'never'}));await assert.rejects(()=>execute(randomUUID(),{name:'test'},{file:{}}));assert.equal(f.counts().registrations,0);
 assert.equal(await f.executor(await f.request(),{...AGENTBOARD_PROVIDER,executorUrl:'https://evil.test'}),undefined);
});
void test('uncertain dispatch and concurrent starts cannot create a second external account',async()=>{
 const f=fixture();let calls=0;const factory=createNoahNativeRegistration({store:f.store,authenticate:f.authenticate,fetcher:async()=>{calls++;throw Error('lost response');}}),execute=await factory(await f.request(),AGENTBOARD_PROVIDER);
 const results=await Promise.allSettled([execute(randomUUID(),{name:'Synthetic'}),execute(randomUUID(),{name:'Synthetic'})]);assert.equal(calls,1);assert.ok(results.some(r=>r.status==='fulfilled'&&r.value==='unknown'));
 assert.equal(await execute(randomUUID(),{name:'new click'}),'unknown');assert.equal(calls,1);
});
void test('a saved credential can finish verification by polling without repeating registration',async()=>{
 const f=fixture();let verify=false;const execute=await createNoahNativeRegistration({store:f.store,authenticate:f.authenticate,fetcher:async(url,init)=>url==='https://www.agentboard.ai/api/me'&&!verify?new Response(null,{status:503}):f.fetcher(url,init)})(await f.request(),AGENTBOARD_PROVIDER),id=randomUUID();
 assert.equal(await execute(id,{name:'Synthetic'}),'unknown');assert.equal((await f.store.load('alice','agentboard')).account.state,'registered');verify=true;assert.equal(await execute(id),'completed');assert.equal(f.counts().registrations,1);
});
void test('registered MCP hides credential input, injects only for this owner and never returns keys',async()=>{
 const f=fixture();await (await f.executor(await f.request(),AGENTBOARD_PROVIDER))(randomUUID(),{name:'Synthetic'});
 const calls=[],upstream=async(url,init)=>{const r=JSON.parse(init.body);calls.push(r);if(r.method==='initialize')return Response.json({jsonrpc:'2.0',id:r.id,result:{protocolVersion:r.params.protocolVersion,serverInfo:{name:'fixture'}}});if(r.method==='notifications/initialized')return new Response(null,{status:202});if(r.method==='tools/list')return Response.json({jsonrpc:'2.0',id:r.id,result:{tools:[{name:'whoami',inputSchema:{type:'object',properties:{credential:{type:'string'}},required:['credential']},annotations:{readOnlyHint:true}},{name:'get_rules',inputSchema:{type:'object'}},{name:'register_agent',inputSchema:{type:'object'}},{name:'rotate_credential',inputSchema:{type:'object'}},{name:'delete_account',inputSchema:{type:'object'}}]}});return Response.json({jsonrpc:'2.0',id:r.id,result:{content:[{type:'text',text:JSON.stringify({name:'Synthetic',echo:r.params.arguments.credential})}]}});};
 const wrapped=await createNoahRegisteredMcpFetch({owner:'alice',url:AGENTBOARD_MCP,store:f.store,fetcher:upstream}),ctx={fetch:wrapped};
 const hello=await noahMcpHandshake(AGENTBOARD_MCP,ctx);assert.deepEqual(hello.tools.map(t=>t.name),['whoami','get_rules']);assert.deepEqual(hello.tools[0].inputSchema,{type:'object',properties:{},required:[]});
 const result=await noahMcpCall(hello.session,'whoami',{},ctx);assert.equal(result.ok,true);assert.doesNotMatch(JSON.stringify(result),/agb_/);assert.equal(calls.at(-1).params.arguments.credential,f.credential);
 const before=calls.length;await assert.rejects(()=>noahMcpCall(hello.session,'whoami',{credential:'forged'},ctx));await assert.rejects(()=>noahMcpCall(hello.session,'register_agent',{},ctx));assert.equal(calls.length,before);
 await assert.rejects(()=>wrapped('https://attacker.test/mcp',{method:'POST',body:'{}'}));
 const other={fetch:await createNoahRegisteredMcpFetch({owner:'bob',url:AGENTBOARD_MCP,store:f.store,fetcher:upstream})};const bh=await noahMcpHandshake(AGENTBOARD_MCP,other);const end=calls.length;const denied=await noahMcpCall(bh.session,'whoami',{},other);assert.equal(denied.ok,false);assert.match(JSON.stringify(denied),/登録して使う/);assert.equal(calls.length,end);
 assert.equal(await createNoahRegisteredMcpFetch({owner:'alice',url:'https://other.test/mcp',store:f.store,fetcher:upstream}),upstream);
});
void test('real registration HTTP handler stores metadata only and returns to the same Agent',async t=>{
 const f=fixture(),sql=new DatabaseSync(':memory:');t.after(()=>sql.close());sql.exec('CREATE TABLE work_jobs(id TEXT PRIMARY KEY,user_id TEXT,payload TEXT,revision INTEGER,updated_at TEXT)');
 const db={prepare(query){const s={args:[],bind(...args){return {...s,args};},async first(){return sql.prepare(query).get(...this.args)??null;},async run(){return {meta:{changes:Number(sql.prepare(query).run(...this.args).changes)}};}};return s;}};
 const api=createNoahRegistrationApi({db,providers:[AGENTBOARD_PROVIDER],token:randomBytes(32).toString('hex'),executor:f.executor});
 const response=await api(new Request('https://avoado.si/api/noah/registration',{method:'POST',headers:{Origin:'https://avoado.si','Content-Type':'application/json','x-user':'alice','X-Rock-Owner-Scope':await ownerScopeFor('alice'),'X-Noah-Registration-Key':randomBytes(32).toString('hex')},body:JSON.stringify({action:'start',id:randomUUID(),providerId:'agentboard',agentId:AGENTBOARD_PROVIDER.agentIds[0],revision:1,termsVersion:AGENTBOARD_PROVIDER.termsVersion,values:{name:'Synthetic'},consent:true,termsAccepted:true})}));
 assert.equal(response.status,202);const body=await response.json();assert.equal(body.job.state,'completed');assert.match(body.job.returnTo,/noah\/ready\/agent/);assert.doesNotMatch(JSON.stringify(body),/agb_/);assert.doesNotMatch(JSON.stringify(sql.prepare('SELECT * FROM work_jobs').all()),/Synthetic|agb_/);
});

void test('operational diagnostics contain fixed phases and status only, never registration inputs or credentials',async()=>{
 const f=fixture(),events=[];
 const run=await createNoahNativeRegistration({store:f.store,authenticate:f.authenticate,fetcher:f.fetcher,observe:event=>events.push(event)})(await f.request(),AGENTBOARD_PROVIDER);
 assert.equal(await run(randomUUID(),{name:'Private input'}),'completed');
 assert.deepEqual(events,[{stage:'store_loaded',state:'empty'},{stage:'register_response',status:200},{stage:'verify_response',status:200}]);
 assert.doesNotMatch(JSON.stringify(events),new RegExp(`${f.credential}|Private input|alice|external-alice`));
 const broken=await createNoahNativeRegistration({store:{available:true,load:async()=>{throw Error('secret-in-storage-error');}},authenticate:f.authenticate,observe:event=>events.push(event)})(await f.request(),AGENTBOARD_PROVIDER);
 await assert.rejects(()=>broken(randomUUID()));assert.deepEqual(events.at(-1),{stage:'store_load_failed'});
 assert.doesNotMatch(JSON.stringify(events),/secret-in-storage-error/);
});

void test('only the known legacy pre-dispatch claim can return to the form; uncertain new dispatch stays fenced',async()=>{
 const f=fixture(),id=randomUUID();
 await f.store.save('alice','agentboard',await f.store.load('alice','agentboard'),{version:1,job:id,state:'registering',updatedAt:1});
 const execute=await createNoahNativeRegistration({store:f.store,authenticate:f.authenticate,fetcher:f.fetcher,recoverUnsentLegacy:true})(await f.request(),AGENTBOARD_PROVIDER);
 assert.equal(await execute(id),'failed');assert.equal(f.counts().registrations,0);
 assert.equal(await execute(randomUUID(),{name:'Synthetic'}),'completed');assert.equal(f.counts().registrations,1);
 const g=fixture();let count=0;
 const uncertain=await createNoahNativeRegistration({store:g.store,authenticate:g.authenticate,fetcher:async()=>{count++;throw Error('lost response');},recoverUnsentLegacy:true})(await g.request(),AGENTBOARD_PROVIDER);
 assert.equal(await uncertain(randomUUID(),{name:'Synthetic'}),'unknown');
 assert.equal(await uncertain(randomUUID(),{name:'Synthetic'}),'unknown');assert.equal(count,1);
});

void test('actual Workers fetch can register and refuses a redirect before any second destination', {timeout:30000},async t=>{
 const {build}=await import('esbuild'),{Miniflare,convertV4MiniflareOptions}=await import('miniflare');
 const {outputFiles}=await build({stdin:{contents:`import {createNoahNativeRegistration,AGENTBOARD_PROVIDER} from './lib/noah-registration-native.ts';let account=null;const store={available:true,load:async()=>({account,etag:null}),save:async(_owner,_provider,_slot,value)=>{account=value;return {account,etag:null}}};export default {async fetch(request){const factory=createNoahNativeRegistration({store,authenticate:async()=> 'synthetic'});const run=await factory(request,AGENTBOARD_PROVIDER);return Response.json({state:await run(crypto.randomUUID(),{name:'Synthetic'})});}}`,resolveDir:process.cwd()},bundle:true,write:false,format:'esm',platform:'browser',target:'es2022'});
 const calls=[];let redirected=false;
 const outboundService=async request=>{calls.push(request.url);if(request.url.endsWith('/api/agents/register'))return redirected?new Response(null,{status:307,headers:{Location:'https://unapproved.example/register'}}):Response.json({credential:`agb_${'a'.repeat(64)}`,agent:{id:'synthetic',status:'active'}});assert.equal(request.url,'https://www.agentboard.ai/api/me');return Response.json({agent:{id:'synthetic',status:'active'}});};
 const options={modules:true,compatibilityDate:'2026-04-01',script:outputFiles[0].text,outboundService};
 let mf=new Miniflare(convertV4MiniflareOptions(options));t.after(()=>mf.dispose());
 assert.equal((await(await mf.dispatchFetch('https://noah.test')).json()).state,'completed');assert.equal(calls.length,2);
 await mf.dispose();redirected=true;calls.length=0;mf=new Miniflare(convertV4MiniflareOptions(options));
 assert.equal((await(await mf.dispatchFetch('https://noah.test')).json()).state,'unknown');assert.deepEqual(calls,['https://www.agentboard.ai/api/agents/register']);
});

void test('provider 429 preserves a retry deadline across reload and new tickets without repeating registration', async()=>{
 const f=fixture();let at=Date.now(), sent=0, limited=true;
 const execute=await createNoahNativeRegistration({store:f.store,authenticate:f.authenticate,now:()=>at,fetcher:async(url,init)=>{
  if((typeof url==='string'?url:url instanceof URL?url.href:url.url).endsWith('/api/agents/register')){sent++;if(limited)return new Response(null,{status:429,headers:{'Retry-After':'120'}});}
  return f.fetcher(url,init);
 }})(await f.request(),AGENTBOARD_PROVIDER);
 const id=randomUUID(),until=at+120000;
 assert.deepEqual(await execute(id,{name:'Synthetic'}),{state:'failed',retryAt:until});
 const states=createRegistrationAccountStates({store:f.store,authenticate:f.authenticate,now:()=>at});
 assert.deepEqual(await states(await f.request(),[AGENTBOARD_PROVIDER]),{agentboard:{accountState:'cooldown',retryAt:until}});
 assert.deepEqual(await states(await f.request('bob'),[AGENTBOARD_PROVIDER]),{});
 assert.deepEqual(await execute(randomUUID(),{name:'Double tap'}),{state:'failed',retryAt:until});
 assert.deepEqual(await execute(id),{state:'failed',retryAt:until});
 assert.equal(sent,1);
 at=until+1;limited=false;
 assert.deepEqual(await states(await f.request(),[AGENTBOARD_PROVIDER]),{});
 assert.equal(await execute(randomUUID(),{name:'Synthetic'}),'completed');assert.equal(sent,2);
 assert.equal((await f.store.load('alice','agentboard')).account.retryAt,undefined);
});

void test('registration rate-limit headers use a bounded deadline and never retain upstream bodies', async()=>{
 const at=Date.now();
 for(const [header,expected] of [[null,at+3600000],['invalid',at+3600000],[new Date(Math.floor(at/1000)*1000+180000).toUTCString(),Math.floor(at/1000)*1000+180000],['999999',at+86400000]]){
  const f=fixture(),execute=await createNoahNativeRegistration({store:f.store,authenticate:f.authenticate,now:()=>at,fetcher:async()=>new Response('untrusted provider body',{status:429,headers:header?{'Retry-After':header}:{}})})(await f.request(),AGENTBOARD_PROVIDER);
  assert.deepEqual(await execute(randomUUID(),{name:'Synthetic'}),{state:'failed',retryAt:expected});
  assert.doesNotMatch(JSON.stringify((await f.store.load('alice','agentboard')).account),/untrusted|Synthetic/);
 }
});

void test('registration HTTP response preserves the rate-limit receipt and returns only availability on reload',async t=>{
 const sql=new DatabaseSync(':memory:'),retryAt=Date.now()+120000;t.after(()=>sql.close());sql.exec('CREATE TABLE work_jobs(id TEXT PRIMARY KEY,user_id TEXT,payload TEXT,revision INTEGER,updated_at TEXT)');
 const db={prepare(query){const s={args:[],bind(...args){return {...s,args};},async first(){return sql.prepare(query).get(...this.args)??null;},async run(){return {meta:{changes:Number(sql.prepare(query).run(...this.args).changes)}};}};return s;}};
 const api=createNoahRegistrationApi({db,providers:[AGENTBOARD_PROVIDER],token:randomBytes(32).toString('hex'),executor:async()=>async()=>({state:'failed',retryAt}),accountStates:async()=>({agentboard:{accountState:'cooldown',retryAt}})});
 const id=randomUUID(),key=randomBytes(32).toString('hex');
 const response=await api(new Request('https://avoado.si/api/noah/registration',{method:'POST',headers:{Origin:'https://avoado.si','Content-Type':'application/json','X-Noah-Registration-Key':key},body:JSON.stringify({action:'start',id,providerId:'agentboard',agentId:AGENTBOARD_PROVIDER.agentIds[0],revision:1,termsVersion:AGENTBOARD_PROVIDER.termsVersion,values:{name:'Synthetic'},consent:true,termsAccepted:true})}));
 assert.equal(response.status,202);assert.deepEqual(Object.fromEntries(Object.entries((await response.json()).job).filter(([k])=>['state','retryAt'].includes(k))),{state:'failed',retryAt});
 const get=await api(new Request(`https://avoado.si/api/noah/registration?job=${id}`,{headers:{'X-Noah-Registration-Key':key}}));assert.equal((await get.json()).job.retryAt,retryAt);
 const available=(await (await api(new Request('https://avoado.si/api/noah/registration'))).json()).providers[0];assert.equal(available.accountState,'cooldown');assert.equal(available.retryAt,retryAt);assert.equal(available.executorUrl,undefined);
 assert.doesNotMatch(sql.prepare('SELECT payload FROM work_jobs').get().payload,/Synthetic|untrusted/);
});

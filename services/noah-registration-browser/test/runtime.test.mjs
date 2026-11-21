import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import puppeteer from '@cloudflare/puppeteer';
import {RegistrationSession,BrowserBudget} from '../worker.mjs';
function context(){const items=new Map();let alarm;let queue=Promise.resolve();const storage={get:async k=>structuredClone(items.get(k)),put:async(k,v)=>{items.set(k,structuredClone(v));},setAlarm:async v=>{alarm=v;},deleteAlarm:async()=>{alarm=null;},transaction:fn=>{const next=queue.then(()=>fn(storage));queue=next.catch(()=>{});return next;}};return {storage,items,get alarm(){return alarm;}};}
void test('durable browser claim, handoff, duplicate input, completion and cleanup preserve privacy',async()=>{
 const ctx=context(),budgetCtx=context(),budget=new BrowserBudget(budgetCtx);let submits=0,launches=0,closed=0,done=false,viewport;
 const page={setViewport:async v=>{viewport=v;},setContent:async()=>{},waitForSelector:async()=>{},$eval:async()=>{},click:async()=>{submits++;},$:async()=>done?{}:null,close:async()=>{},screenshot:async()=>{assert.deepEqual(viewport,{width:390,height:640,deviceScaleFactor:1});return 'base64';},mouse:{click:async()=>{done=true;},wheel:async()=>{}},keyboard:{press:async()=>{},sendCharacter:async()=>{}}};
 const browser={newPage:async()=>page,pages:async()=>[page],sessionId:()=> 'isolated-session',disconnect:async()=>{},close:async()=>{closed++;}};
 const oldLaunch=puppeteer.launch,oldConnect=puppeteer.connect;puppeteer.launch=async(_env,options)=>{launches++;assert.deepEqual(options.guardrails,{allowedDomains:[]});return browser;};puppeteer.connect=async()=>browser;
 try{
  const runtime=new RegistrationSession(ctx,{BROWSER:{},BUDGET:{idFromName:v=>v,get:()=>({fetch:r=>budget.fetch(r)})}});
  const id=randomUUID(),base={id,owner:'a'.repeat(64),providerId:'fixture',recipe:{id:'fixture',revision:1,domains:[],fields:[{key:'name',selector:'#name'}],submit:'#start'}};
  const request=(action,extra={})=>new Request('https://session.invalid',{method:'POST',body:JSON.stringify({...base,action,...extra})});
  const starts=await Promise.all([runtime.fetch(request('register',{values:{name:'must-never-persist'}})),runtime.fetch(request('register',{values:{name:'must-never-persist'}}))]);
  assert.equal(launches,1);assert.equal(submits,1);assert.equal((await starts[0].json()).state,'needs_user');assert.doesNotMatch(JSON.stringify([...ctx.items.values()]),/must-never-persist/);
  assert.equal((await(await runtime.fetch(request('resume'))).json()).state,'needs_user');assert.ok((await(await runtime.fetch(request('frame'))).json()).image);
  const input={kind:'click',x:120,y:280,sequence:1};assert.equal((await runtime.fetch(request('input',{input}))).status,200);assert.equal((await runtime.fetch(request('input',{input}))).status,409);
  assert.equal((await(await runtime.fetch(request('resume'))).json()).state,'completed');assert.ok(closed);assert.equal(ctx.alarm,null);
  assert.equal((await(await runtime.fetch(request('cancel'))).json()).state,'completed');assert.equal(launches,1);
  const other={...base,owner:'b'.repeat(64),action:'frame'};assert.equal((await runtime.fetch(new Request('https://session.invalid',{method:'POST',body:JSON.stringify(other)}))).status,409);
 }finally{puppeteer.launch=oldLaunch;puppeteer.connect=oldConnect;}
});
void test('budget serializes reservations and expiry closes the browser without re-registering',async()=>{
 const ctx=context(),budget=new BrowserBudget(ctx),req=id=>new Request('https://budget.invalid',{method:'POST',body:JSON.stringify({id})});
 const initial=await Promise.all([budget.fetch(req('one')),budget.fetch(req('two'))]);assert.deepEqual(initial.map(r=>r.status),[200,429]);
 ctx.items.get('budget').last=0;assert.equal((await budget.fetch(req('one'))).status,409);assert.equal((await(await budget.fetch(req('two'))).json()).duration,240000);
 ctx.items.get('budget').last=0;assert.equal((await(await budget.fetch(req('three'))).json()).duration,120000);ctx.items.get('budget').last=0;assert.equal((await budget.fetch(req('four'))).status,429);
 const sessionCtx=context();sessionCtx.items.set('record',{session:'existing',state:'needs_user',expiresAt:0});let closed=0;const original=puppeteer.connect;puppeteer.connect=async()=>({close:async()=>{closed++;}});
 try{await new RegistrationSession(sessionCtx,{BROWSER:{}}).alarm();assert.equal(closed,1);assert.equal(sessionCtx.items.get('record').session,null);assert.equal(sessionCtx.items.get('record').state,'unknown');}finally{puppeteer.connect=original;}
});

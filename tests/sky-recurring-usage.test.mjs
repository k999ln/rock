import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign,randomUUID} from 'node:crypto';
import {openMonthlySandboxDatabase} from '../scripts/sky-monthly-sandbox-db.mjs';
import {skyRecurringUsage,executeSkyPlanCloudText} from '../lib/sky-recurring-usage.ts';
import {RemoteAiTextStore} from '../lib/remote-ai-text-store.ts';
import {REMOTE_AI_TEXT_RATE_CARD_SCHEMA,remoteAiRateCardSigningBytes,verifyRemoteAiRateCard} from '../lib/remote-ai-rate-card.ts';
import {RemoteAiRateCardStore} from '../lib/remote-ai-rate-card-store.ts';
import {prepareRemoteAiTextQuote} from '../lib/remote-ai-text-pricing.ts';
import {workStore} from '../lib/work-store.ts';
import {createWorkJob} from '../lib/workflow.ts';
const env={SKY_CLOUD_MONTHLY_MODE:'stripe-test',SKY_MONTHLY_STRIPE_KEY:'sk_test_fixture',SKY_MONTHLY_STRIPE_ACCOUNT:'acct_fixture',SKY_MONTHLY_STRIPE_WEBHOOK_SECRET:'whsec_fixture'};
function setup(t){const db=openMonthlySandboxDatabase();t.after(()=>db.close());const now=Date.now();
 db.sqlite.prepare(`INSERT INTO sky_recurring_contracts(id,owner_id,stripe_account_id,customer_id,payment_method_id,consent_version,credit_minor,period_start,period_end,status,access_until,created_at,updated_at) VALUES('fixture','owner','acct_fixture','cus_fixture','pm_fixture','synthetic',14000,?,?,'active',?,?,?)`).run(now-1000,now+3600000,now+300000,now,now);return db;}
// Synthetic rates make boundary amounts exact; never used as live model prices or free credits.
async function quote(db,chargeMinor){
 const now=Date.now(),pair=generateKeyPairSync('ed25519'),id=randomUUID();
 const publicBytes=Uint8Array.from(pair.publicKey.export({format:'der',type:'spki'}).subarray(-32));
 const card={schema:REMOTE_AI_TEXT_RATE_CARD_SCHEMA,providerId:'openai',keyId:'synthetic',cardId:id,modelId:'fixture-model',pricingVersion:'synthetic-boundary',currency:'USD',inputMinorMicrosPerMillionTokens:0,outputMinorMicrosPerMillionTokens:chargeMinor*10000000000,cachedInputMinorMicrosPerMillionTokens:0,cacheWriteMinorMicrosPerMillionTokens:0,executionScope:'text-only',serviceTier:'default',effectiveAt:now-1000,expiresAt:now+600000,sourceUrl:'https://developers.openai.com/api/docs/pricing',signature:''};
 card.signature=sign(null,remoteAiRateCardSigningBytes(card),pair.privateKey).toString('base64url');
 const verified=await verifyRemoteAiRateCard(card,{providerId:'openai',modelId:card.modelId,currency:'USD'},async()=>publicBytes);assert.ok(verified);
 await new RemoteAiRateCardStore(db).register(verified,'synthetic-operator');
 const parent=createWorkJob({id:randomUUID(),templateId:'article',title:'Synthetic boundary execution'});await workStore(db).create('owner',parent);
 const intent={ownerId:'owner',requestId:randomUUID(),model:card.modelId,prompt:'Return a synthetic boundary result.',maxOutputTokens:100,maximumBudgetMinor:chargeMinor};
 const q=await prepareRemoteAiTextQuote(verified,intent);assert.ok(q);
 const store=new RemoteAiTextStore(db),record=(await store.create(q,verified,parent.id,chargeMinor,false)).record;
 return {store,record,intent,verified,request:async fetchImpl=>{
  return executeSkyPlanCloudText({db,sandboxEnv:env,inputEncryptionKey:'a'.repeat(64),ownerId:'owner',id:record.id,approvalDigest:record.approvalDigest,intent,verified,runtimeEnv:{OPENAI_API_KEY:'synthetic-not-a-key'},fetchImpl});
 }};
}
function response(usage=true){return Response.json({id:'resp_'+randomUUID().replaceAll('-',''),model:'fixture-model',status:'completed',service_tier:'default',output:[{type:'message',content:[{type:'output_text',text:'Synthetic result'}]}],...(usage?{usage:{input_tokens:1,output_tokens:100,total_tokens:101,input_tokens_details:{cached_tokens:0,cache_write_tokens:0}}}:{})});}
void test('provider usage settles into plan, exactly $100 stops next request before network',async t=>{
 const db=setup(t);let calls=0;const fetch=async()=>{calls++;return response();};
 const first=await quote(db,9900),a=await first.request(fetch);assert.equal(a.usage.amount,9900);assert.equal(a.plan.remainingMinor,100);
 const last=await quote(db,100),b=await last.request(fetch);assert.equal(b.usage.amount,100);assert.equal(b.plan.settledMinor,10000);assert.equal(b.plan.reservedMinor,0);assert.equal(b.plan.reason,'quota_exhausted');
 const extra=await quote(db,1);await assert.rejects(extra.request(fetch));assert.equal(calls,2);
 assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM sky_recurring_charges').get().n,0);
 assert.equal((await skyRecurringUsage(db,'owner')).monthlyFeeMinor,14000);
});
void test('concurrent last-dollar jobs cannot double-spend the shared allowance',async t=>{
 const db=setup(t);await (await quote(db,9900)).request(async()=>response());
 const a=await quote(db,100),b=await quote(db,100);let calls=0;
 const results=await Promise.allSettled([a.request(async()=>{calls++;return response();}),b.request(async()=>{calls++;return response();})]);
 assert.equal(calls,1);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal((await skyRecurringUsage(db,'owner')).settledMinor,10000);
});
void test('missing final usage retains the entire reservation and cannot manufacture remaining credit',async t=>{
 const db=setup(t),q=await quote(db,10000);const r=await q.request(async()=>response(false));
 assert.equal(r.execution.record.state,'unreconciled');assert.equal(r.usage,null);assert.equal(r.plan.settledMinor,0);assert.equal(r.plan.reservedMinor,10000);assert.equal(r.plan.remainingMinor,0);
 let calls=0;const extra=await quote(db,1);await assert.rejects(extra.request(async()=>{calls++;return response();}));assert.equal(calls,0);
});
void test('replay reads the same settled receipt; wrong owner/account/live key cannot execute',async t=>{
 const db=setup(t),q=await quote(db,100);let calls=0;
 const invoke=extra=>executeSkyPlanCloudText({db,sandboxEnv:env,inputEncryptionKey:'a'.repeat(64),ownerId:'owner',id:q.record.id,approvalDigest:q.record.approvalDigest,intent:q.intent,verified:q.verified,runtimeEnv:{OPENAI_API_KEY:'synthetic'},fetchImpl:async()=>{calls++;return response();},...extra});
 const a=await invoke(),b=await invoke();assert.equal(calls,1);assert.equal(a.usage.digest,b.usage.digest);assert.equal(b.plan.settledMinor,100);
 await assert.rejects(invoke({ownerId:'other'}));await assert.rejects(invoke({sandboxEnv:{...env,SKY_MONTHLY_STRIPE_ACCOUNT:'acct_other'}}));await assert.rejects(invoke({sandboxEnv:{...env,SKY_MONTHLY_STRIPE_KEY:'sk_live_forbidden'}}));await assert.rejects(skyRecurringUsage(db,'other'));assert.equal(calls,1);
});
void test('pre-send cancellation releases reservation but unresolved sends remain held',async t=>{
 const db=setup(t),q=await quote(db,10000);await q.store.reserve('owner',q.record.id,q.record.approvalDigest);assert.equal((await skyRecurringUsage(db,'owner')).remainingMinor,0);
 await q.store.cancelBeforeSend('owner',q.record.id,q.record.approvalDigest);assert.equal((await skyRecurringUsage(db,'owner')).remainingMinor,10000);
});
void test('A2A reservations and LLM usage share one plan allowance',async t=>{
 const db=setup(t),now=Date.now();const {a2aDelegationStore}=await import('../lib/a2a-delegation-store.ts');
 const parent=createWorkJob({id:randomUUID(),title:'Synthetic A2A quota',templateId:'article'});await workStore(db).create('owner',parent);
 const store=a2aDelegationStore(db),input={id:randomUUID(),parentJobId:parent.id,idempotencyKey:'usage-a2a',messageId:'usage-msg',targetOrigin:'https://agent.example.test',targetAgentName:'Synthetic agent',targetAgentVersion:'1',protocolVersion:'1.0',inputSha256:'a'.repeat(64),authorizationSha256:'b'.repeat(64),budgetCurrency:'USD',budgetLimitMinor:500,parentBudgetLimitMinor:500,continueWhileDeviceOffline:true,deadlineAt:now+60000};
 await store.prepare('owner',input,now);await store.approve('owner',input.id,input.authorizationSha256,{ciphertext:'fixture',nonce:'fixture',inputSha256:input.inputSha256,keyVersion:'aes-256-gcm-v1'},now);
 const held=await skyRecurringUsage(db,'owner');assert.equal(held.reservedMinor,500);assert.equal(held.remainingMinor,9500);assert.equal(held.items[0].kind,'a2a');
 const over=await quote(db,9501);let calls=0;await assert.rejects(over.request(async()=>{calls++;return response();}));assert.equal(calls,0);
 await (await quote(db,9500)).request(async()=>response());const full=await skyRecurringUsage(db,'owner');assert.equal(full.settledMinor,9500);assert.equal(full.reservedMinor,500);assert.equal(full.remainingMinor,0);
});

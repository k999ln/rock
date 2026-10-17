import test from 'node:test';
import assert from 'node:assert/strict';
import {openMonthlySandboxDatabase} from '../scripts/sky-monthly-sandbox-db.mjs';
import {runFreeCloudText} from '../lib/sky-free-cloud.ts';
import {workStore} from '../lib/work-store.ts';
function setup(t){const db=openMonthlySandboxDatabase();t.after(()=>db.close());const now=Date.now();db.sqlite.prepare(`INSERT INTO sky_recurring_contracts(id,owner_id,stripe_account_id,customer_id,payment_method_id,consent_version,credit_minor,period_start,period_end,status,access_until,created_at,updated_at) VALUES('fixture','owner','acct_fixture','cus_fixture','pm_fixture','synthetic',14000,?,?,'active',?,?,?)`).run(now-1000,now+3600000,now+300000,now,now);return db;}
function request(db,fetcher){return {db,owner:'owner',id:crypto.randomUUID(),prompt:'Synthetic test',model:'openai-fast',consent:true,runtime:{SKY_FREE_CLOUD_ENABLED:'true',SKY_FREE_CLOUD_OWNER_ID:'owner'},fetcher};}
const catalog=()=>Response.json([{name:'openai-fast',tier:'anonymous',input_modalities:['text'],output_modalities:['text']}]);
void test('confirmed free result records zero usage cost and does not resend a replay',async t=>{
 const db=setup(t);let sends=0;
 const input=request(db,async(url,init)=>{if(url.endsWith('/models'))return catalog();sends++;assert.equal(init.redirect,'error');assert.equal(init.headers.Authorization,undefined);return Response.json({id:'synthetic',model:'fixture',choices:[{finish_reason:'stop',message:{content:'Test'}}],usage:{prompt_tokens:2,completion_tokens:3,total_tokens:5}});});
 const result=await runFreeCloudText(input);assert.equal(result.status,'review');assert.equal(result.freeCloud.chargeMinor,0);assert.equal(result.freeCloud.outputTokens,3);
 await runFreeCloudText(input);assert.equal(sends,1);
});
void test('missing usage and 402 remain unconfirmed with no payment or automatic retry',async t=>{
 for(const status of [200,402]) {const db=setup(t);let sends=0;const input=request(db,async url=>{if(url.endsWith('/models'))return catalog();sends++;return Response.json({choices:[{message:{content:'unverified'}}]}, {status});});
 await assert.rejects(runFreeCloudText(input));assert.equal((await workStore(db).get('owner',input.id)).freeCloud.state,'unconfirmed');await runFreeCloudText(input);assert.equal(sends,1);}
});
void test('unpaid and disabled owners cannot reach external provider',async t=>{
 const db=setup(t);let calls=0;const input=request(db,async()=>{calls++;return catalog();});
 await assert.rejects(runFreeCloudText({...input,consent:false}));
 db.sqlite.prepare("UPDATE sky_recurring_contracts SET status='past_due'").run();await assert.rejects(runFreeCloudText(input));assert.equal(calls,0);
});

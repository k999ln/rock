import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { generateKeyPairSync, sign, randomUUID } from 'node:crypto';
import { REMOTE_AI_TEXT_RATE_CARD_SCHEMA, remoteAiRateCardSigningBytes, verifyRemoteAiRateCard } from '../lib/remote-ai-rate-card.ts';
import { RemoteAiRateCardStore } from '../lib/remote-ai-rate-card-store.ts';
import { prepareRemoteAiTextQuote } from '../lib/remote-ai-text-pricing.ts';
import { RemoteAiTextStore } from '../lib/remote-ai-text-store.ts';
import { executeReservedRemoteAiText } from '../lib/remote-ai-text-execution.ts';
import { encryptRemoteAiTextInput } from '../lib/remote-ai-text-input.ts';
import { workStore } from '../lib/work-store.ts';
import { createWorkJob, applyWorkCommand } from '../lib/workflow.ts';

const owner = 'synthetic-owner';
function client(sqlite) {
  return {
    prepare(sql) { return {
      bind(...values) { return {
        async first() { return sqlite.prepare(sql).get(...values) ?? null; },
        async all() { return { results: sqlite.prepare(sql).all(...values) }; },
        runSync() {
          // Include trigger writes, as D1 may do, rather than only the target row.
          const before = sqlite.prepare('SELECT total_changes() AS n').get().n;
          sqlite.prepare(sql).run(...values);
          return { meta: { changes: Number(sqlite.prepare('SELECT total_changes() AS n').get().n - before) } };
        },
        async run() { return this.runSync(); },
      }; },
    }; },
    async batch(statements) {
      sqlite.exec('BEGIN IMMEDIATE');
      try { const rows = statements.map(statement => statement.runSync()); sqlite.exec('COMMIT'); return rows; }
      catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
  };
}
function database(t) {
  const directory = mkdtempSync(join(tmpdir(), 'rock-atomic-send-'));
  const file = join(directory, 'fixture.sqlite');
  const sqlite = new DatabaseSync(file), second = new DatabaseSync(file);
  for (const c of [sqlite, second]) c.exec('PRAGMA busy_timeout=5000');
  t.after(() => { second.close(); sqlite.close(); rmSync(directory, {recursive:true, force:true}); });
  for (const name of readdirSync(new URL('../drizzle/', import.meta.url)).filter(name => name.endsWith('.sql')).sort())
    sqlite.exec(readFileSync(new URL('../drizzle/' + name, import.meta.url), 'utf8'));
  return { db:client(sqlite), sqlite, second, file };
}

async function fixture(t, budget = 1, saveResult = false) {
  const { db, sqlite, second, file } = database(t);
  const parent = createWorkJob({ id: randomUUID(), templateId: 'article', title: 'Synthetic cloud test' });
  await workStore(db).create(owner, parent);
  const now = Date.now();
  const pair = generateKeyPairSync('ed25519');
  const publicBytes = Uint8Array.from(pair.publicKey.export({ format: 'der', type: 'spki' }).subarray(-32));
  const card = {
    schema: REMOTE_AI_TEXT_RATE_CARD_SCHEMA, providerId: 'openai', keyId: 'fixture-key',
    cardId: 'fixture-card', modelId: 'fixture-model', pricingVersion: 'fixture-prices', currency: 'USD',
    inputMinorMicrosPerMillionTokens: 1_000_000_000, outputMinorMicrosPerMillionTokens: 1_000_000_000,
    cachedInputMinorMicrosPerMillionTokens: 100_000_000, cacheWriteMinorMicrosPerMillionTokens: 2_000_000_000,
    executionScope: 'text-only', serviceTier: 'default', effectiveAt: now - 1_000,
    expiresAt: now + 600_000, sourceUrl: 'https://developers.openai.com/api/docs/pricing', signature: '',
  };
  card.signature = sign(null, remoteAiRateCardSigningBytes(card), pair.privateKey).toString('base64url');
  const verified = await verifyRemoteAiRateCard(card, { providerId: 'openai', modelId: 'fixture-model', currency: 'USD' },
    async () => publicBytes, now);
  await new RemoteAiRateCardStore(db).register(verified, 'synthetic-operator', now);
  const intent = { ownerId: owner, requestId: randomUUID(), model: 'fixture-model',
    prompt: 'Synthetic private input', maxOutputTokens: 100, maximumBudgetMinor: 1 };
  const store = new RemoteAiTextStore(db);
  const quote = await prepareRemoteAiTextQuote(verified, intent, now);
  const record = (await store.create(quote, verified, parent.id, budget, saveResult)).record;
  const pool = () => sqlite.prepare('SELECT reserved_minor, settled_minor, budget_limit_minor FROM agent_delegation_budget_pools WHERE owner_user_id = ? AND parent_job_id = ?').get(owner, parent.id);
  const reserve = () => store.reserve(owner, record.id, record.approvalDigest);
  const queueInput = async (id = record.id, approvedIntent = intent) => {
    const encrypted = await encryptRemoteAiTextInput(approvedIntent, 'a'.repeat(64), owner, id);
    return store.saveInput(owner, id, record.approvalDigest, encrypted);
  };
  const request = async (fetchImpl, onOutputProgress) => {
    const current = await store.get(owner, record.id);
    if (current?.state === 'reserved' && !await store.getInput(owner, record.id)) await queueInput();
    return executeReservedRemoteAiText({ store, ownerId: owner, id: record.id,
      approvalDigest: record.approvalDigest, intent, verified, runtimeEnv: { OPENAI_API_KEY: 'fixture-only' },
      fetchImpl, onOutputProgress });
  };
  return { db, sqlite, second, file, secondStore:new RemoteAiTextStore(client(second)), parent, verified, intent, quote, store, record, pool, reserve, queueInput, request };
}
function response(id = 'resp_fixture', usage = { input_tokens: 10, output_tokens: 5, total_tokens: 15,
  input_tokens_details: { cached_tokens: 4, cache_write_tokens: 3 } }) {
  return Response.json({ id, model: 'fixture-model', status: 'completed', service_tier: 'default', usage,
    output: [{ type: 'message', content: [{ type: 'output_text', text: 'Synthetic private result' }] }] });
}




// Only existing standalone recurring contract fields are pinned. These fixture
// prices/caps are not new sale terms or a generic RockstarOS contract.
async function boundFixture(t, budget=2) {
  const f=await fixture(t,budget), now=Date.now();
  f.second.prepare(`INSERT INTO sky_recurring_contracts
    (id,owner_id,stripe_account_id,customer_id,payment_method_id,consent_version,credit_minor,
     period_start,period_end,status,access_until,created_at,updated_at)
    VALUES ('contract-fixture',?,'acct_fixture','cus_fixture','pm_fixture','fixture-consent-v1',14000,?,?,'active',?,?,?)`)
    .run(owner,now-1000,now+3600000,now+600000,now,now);
  const intent={...f.intent,requestId:randomUUID()};
  const quote=await prepareRemoteAiTextQuote(f.verified,intent);
  const record=(await f.store.create(quote,f.verified,f.parent.id,budget)).record;
  const reserve=()=>f.store.reserve(owner,record.id,record.approvalDigest);
  const request=async fetchImpl=>{
    const row=await f.store.get(owner,record.id);
    if(row.state==='reserved' && !await f.store.getInput(owner,record.id))
      await f.store.saveInput(owner,record.id,record.approvalDigest,await encryptRemoteAiTextInput(intent,'a'.repeat(64),owner,record.id));
    return executeReservedRemoteAiText({store:f.store,ownerId:owner,id:record.id,approvalDigest:record.approvalDigest,
      intent,verified:f.verified,runtimeEnv:{OPENAI_API_KEY:'fixture-only'},fetchImpl});
  };
  return {...f,intent,quote,record,reserve,request,queueInput:async()=>f.store.saveInput(owner,record.id,record.approvalDigest,
    await encryptRemoteAiTextInput(intent,'a'.repeat(64),owner,record.id))};
}
const claims=f=>f.sqlite.prepare('SELECT count(*) n FROM remote_ai_text_send_claims WHERE execution_id=?').get(f.record.id).n;
void test('quote pins server contract identity/account/consent, freezes it and preserves same-request retry',async t=>{
  const f=await boundFixture(t);
  assert.deepEqual(f.record.quote.recurringContractBinding,{schema:'sky.recurring-quote-binding/1',kind:'recurring',contractId:'contract-fixture',
    stripeAccountId:'acct_fixture',consentVersion:'fixture-consent-v1'});
  assert.equal((await f.store.create(f.quote,f.verified,f.parent.id,2)).record.approvalDigest,f.record.approvalDigest);
  assert.throws(()=>f.sqlite.prepare("UPDATE remote_ai_text_executions SET quote_json=json_set(quote_json,'$.recurringContractBinding.contractId','other') WHERE id=?")
    .run(f.record.id),/TERMS_IMMUTABLE/);
  const forged={...await prepareRemoteAiTextQuote(f.verified,{...f.intent,requestId:randomUUID()}),
    recurringContractBinding:{schema:'forged',contractId:'client-contract'}};
  const saved=(await f.store.create(forged,f.verified,f.parent.id,2)).record;
  assert.equal(saved.quote.recurringContractBinding.contractId,'contract-fixture');
  assert.equal(saved.quote.ceiling.maximumChargeMinor,f.record.quote.ceiling.maximumChargeMinor);
});
for(const field of ['id','stripe_account_id','consent_version','delete']) {
  void test('contract '+field+' replaced after dispatch cannot acquire final send or change original hold',async t=>{
    const f=await boundFixture(t);await f.reserve();const claim=f.store.claimProviderSend.bind(f.store);
    t.mock.method(f.store,'claimProviderSend',async(...args)=>{
      if(field==='delete')f.second.prepare('DELETE FROM sky_recurring_contracts WHERE owner_id=?').run(owner);
      else if(field==='id')f.second.prepare('UPDATE sky_recurring_contracts SET id=? WHERE owner_id=?').run('replacement-contract',owner);
      else if(field==='stripe_account_id')f.second.prepare('UPDATE sky_recurring_contracts SET stripe_account_id=? WHERE owner_id=?').run('acct_replacement',owner);
      else f.second.prepare('UPDATE sky_recurring_contracts SET consent_version=? WHERE owner_id=?').run('new-consent',owner);
      return claim(...args);
    });
    let sends=0;const result=await f.request(async()=>{sends++;return response();});
    assert.equal(sends,0);assert.equal(result.record.state,'unreconciled');assert.equal(result.record.errorCode,'PROVIDER_SEND_CLAIM_REJECTED');
    assert.equal(claims(f),0);assert.deepEqual({...f.pool()},{reserved_minor:1,settled_minor:0,budget_limit_minor:2});
  });
}
void test('changed binding before reserve or dispatch creates no new reservation or send',async t=>{
  const f=await boundFixture(t);
  f.second.prepare("UPDATE sky_recurring_contracts SET consent_version='new-consent'").run();
  await assert.rejects(f.reserve(),e=>e.code==='BUDGET_UNAVAILABLE');
  assert.equal(f.pool(),undefined);assert.equal((await f.store.get(owner,f.record.id)).state,'quoted');
  f.second.prepare("UPDATE sky_recurring_contracts SET consent_version='fixture-consent-v1'").run();
  await f.reserve();await f.queueInput();
  f.second.prepare("UPDATE sky_recurring_contracts SET stripe_account_id='acct_other'").run();
  assert.equal(await f.store.claimDispatch(owner,f.record.id,f.record.approvalDigest),false);
  assert.equal((await f.store.get(owner,f.record.id)).state,'reserved');assert.equal(f.pool().reserved_minor,1);
});
void test('contract read/create race refuses the stale binding in the committing INSERT',async t=>{
  const f=await boundFixture(t), intent={...f.intent,requestId:randomUUID()};
  const quote=await prepareRemoteAiTextQuote(f.verified,intent), prepare=f.db.prepare.bind(f.db);
  t.mock.method(f.db,'prepare',sql=>{
    const statement=prepare(sql);
    if(!sql.includes('SELECT id, stripe_account_id AS stripeAccountId'))return statement;
    return {bind(...values){const bound=statement.bind(...values);return {...bound,async first(){
      const row=await bound.first();f.second.prepare("UPDATE sky_recurring_contracts SET consent_version='raced-consent'").run();return row;
    }};}};
  });
  await assert.rejects(f.store.create(quote,f.verified,f.parent.id,2),e=>e.code==='QUOTE_CONFLICT');
  assert.equal(f.sqlite.prepare('SELECT count(*) n FROM remote_ai_text_executions WHERE request_id=?').get(intent.requestId).n,0);
});
void test('same contract renewal and payment-method revision do not silently reprice or duplicate a job',async t=>{
  const f=await boundFixture(t);await f.reserve();
  const now=Date.now();f.second.prepare('UPDATE sky_recurring_contracts SET period_start=?,period_end=?,access_until=?,payment_revision=payment_revision+1').run(now-500,now+3600000,now+600000);
  let sends=0;const result=await f.request(async()=>{sends++;return response();});
  assert.equal(result.record.state,'completed');assert.equal(sends,1);assert.equal(f.pool().settled_minor,1);
  await f.request(async()=>{sends++;return response();});assert.equal(sends,1);
});
void test('replacement requires a new approved request, never rebinds old unknown or inflates its parent cap',async t=>{
  const f=await boundFixture(t);await f.reserve();
  f.second.prepare("UPDATE sky_recurring_contracts SET consent_version='v2'").run();
  await f.queueInput();await f.store.claimDispatch(owner,f.record.id,f.record.approvalDigest);
  // Dispatch is correctly denied; force no state transition. Retained reserved hold
  // is an old approved request, not permission to send under the replacement.
  assert.equal((await f.store.get(owner,f.record.id)).state,'reserved');
  const retry=(await f.store.create(f.quote,f.verified,f.parent.id,2)).record;
  assert.equal(retry.approvalDigest,f.record.approvalDigest);
  assert.equal(retry.quote.recurringContractBinding.consentVersion,'fixture-consent-v1');
  const intent={...f.intent,requestId:randomUUID()}, next=(await f.store.create(await prepareRemoteAiTextQuote(f.verified,intent),f.verified,f.parent.id,2)).record;
  assert.notEqual(next.approvalDigest,f.record.approvalDigest);assert.equal(next.quote.recurringContractBinding.consentVersion,'v2');
  await f.store.reserve(owner,next.id,next.approvalDigest);await f.store.saveInput(owner,next.id,next.approvalDigest,await encryptRemoteAiTextInput(intent,'a'.repeat(64),owner,next.id));
  let sends=0;const result=await executeReservedRemoteAiText({store:f.store,ownerId:owner,id:next.id,approvalDigest:next.approvalDigest,
    intent,verified:f.verified,runtimeEnv:{OPENAI_API_KEY:'fixture-only'},fetchImpl:async()=>{sends++;return response();}});
  assert.equal(result.record.state,'completed');assert.equal(sends,1);
  assert.deepEqual({...f.pool()},{reserved_minor:1,settled_minor:1,budget_limit_minor:2});
});
void test('already-authorized late genuine usage settles once after contract replacement and parent stop',async t=>{
  const f=await boundFixture(t);await f.reserve();let sends=0;
  const result=await f.request(async()=>{
    sends++;f.second.prepare("UPDATE sky_recurring_contracts SET consent_version='replacement'").run();
    const stopped=applyWorkCommand(f.parent,{id:randomUUID(),action:'cancel'},0);
    await workStore(client(f.second)).update(owner,stopped,0);
    await f.secondStore.markUnreconciled(owner,f.record.id,'DISPATCH_RESULT_UNKNOWN');return response();
  });
  assert.equal(result.record.state,'completed');assert.equal(f.pool().settled_minor,1);assert.equal(f.pool().reserved_minor,0);
  assert.equal((await workStore(f.db).get(owner,f.parent.id)).status,'cancelled');
  await f.request(async()=>{sends++;return response();});assert.equal(sends,1);assert.equal(claims(f),1);
});
void test('new no-contract quote cannot adopt a later recurring contract at reserve or final claim',async t=>{
  for(const stage of ['reserve','final']) {
    const f=await fixture(t);assert.equal(f.record.quote.recurringContractBinding.kind,'none');
    if(stage==='final'){await f.reserve();await f.queueInput();await f.store.claimDispatch(owner,f.record.id,f.record.approvalDigest);}
    const now=Date.now();f.second.prepare(`INSERT INTO sky_recurring_contracts
      (id,owner_id,stripe_account_id,customer_id,payment_method_id,consent_version,credit_minor,
       period_start,period_end,status,access_until,created_at,updated_at)
      VALUES ('later-contract',?,'acct_fixture','cus_fixture','pm_fixture','fixture-consent',14000,?,?,'active',?,?,?)`)
      .run(owner,now-1000,now+600000,now+600000,now,now);
    if(stage==='reserve'){
      await assert.rejects(f.reserve(),e=>e.code==='BUDGET_UNAVAILABLE');assert.equal(f.pool(),undefined);
    } else {
      assert.equal(await f.store.claimProviderSend(owner,f.record.id),false);
      assert.equal(await f.store.claimProviderSend(owner,f.record.id,Date.now(),'required'),false);
      assert.equal(f.pool().reserved_minor,1);assert.equal(claims(f),0);
    }
  }
});
void test('new no-contract marker and genuine legacy-missing quote remain distinct without rebinding',async t=>{
  const f=await fixture(t);assert.deepEqual(f.record.quote.recurringContractBinding,{schema:'sky.recurring-quote-binding/1',kind:'none'});
  const intent={...f.intent,requestId:randomUUID()},q=await prepareRemoteAiTextQuote(f.verified,intent),id=randomUUID();
  // Original pre-change approval formula and INSERT fixture. No frozen stored
  // quote is edited or backfilled to synthesize an accepted contract.
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify({domain:'rockstar-remote-ai-text-approval/1',
    quoteDigest:q.quoteDigest,parentJobId:f.parent.id,parentBudgetLimitMinor:1,saveResult:false})));
  const approval=Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
  f.sqlite.prepare(`INSERT INTO remote_ai_text_executions
    (id,owner_user_id,request_id,parent_job_id,model_id,card_id,rate_card_digest,quote_digest,approval_digest,
     quote_json,rate_card_json,currency,maximum_charge_minor,approved_cap_minor,parent_budget_limit_minor,save_result,state,created_at,updated_at,expires_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,'quoted',?,?,?)`)
    .run(id,owner,intent.requestId,f.parent.id,f.verified.card.modelId,f.verified.card.cardId,f.verified.digest,q.quoteDigest,
      approval,JSON.stringify(q),JSON.stringify(f.verified.card),q.ceiling.currency,q.ceiling.maximumChargeMinor,q.approvedCapMinor,
      1,q.createdAt,q.createdAt,q.expiresAt);
  const legacy=await f.store.get(owner,id);assert.equal(legacy.quote.recurringContractBinding,undefined);
  const retried=(await f.store.create(q,f.verified,f.parent.id,1)).record;
  assert.equal(retried.approvalDigest,approval);assert.equal(retried.quote.recurringContractBinding,undefined);
  await f.store.reserve(owner,id,approval);await f.store.saveInput(owner,id,approval,await encryptRemoteAiTextInput(intent,'a'.repeat(64),owner,id));
  let sends=0;await executeReservedRemoteAiText({store:f.store,ownerId:owner,id,approvalDigest:approval,intent,verified:f.verified,
    runtimeEnv:{OPENAI_API_KEY:'fixture-only'},fetchImpl:async()=>{sends++;return response();}});
  assert.equal(sends,1);assert.equal((await f.store.get(owner,id)).quote.recurringContractBinding,undefined);
});

void test('new no-contract approval cannot adopt a later contract under either server policy',async t=>{
  for(const required of ['false','true']) {
    const f=await fixture(t);await f.reserve();await f.queueInput();const now=Date.now();
    f.second.prepare(`INSERT INTO rockstar_service_entitlements
      (issuer_id,claim_id,owner_user_id,offer_id,purchase_reference_sha256,claim_code_sha256,form_factor,scopes_json,
       issuer_key_id,claim_signature,status,claimed_at,expires_at)
      VALUES ('fixture','fixture',?,'fixture',?,?,'service_only','["rockstaros_access"]','fixture','fixture','active',?,?)`)
      .run(owner,'a'.repeat(64),'b'.repeat(64),now,now+600000);
    const claim=f.store.claimProviderSend.bind(f.store);
    t.mock.method(f.store,'claimProviderSend',async(...args)=>{
      f.second.prepare(`INSERT INTO sky_recurring_contracts
        (id,owner_id,stripe_account_id,customer_id,payment_method_id,consent_version,credit_minor,
         period_start,period_end,status,access_until,created_at,updated_at)
        VALUES ('late-contract',?,'acct_fixture','cus_fixture','pm_fixture','fixture-consent',14000,?,?,'active',?,?,?)`)
        .run(owner,now-1000,now+600000,now+600000,now,now);
      return claim(...args);
    });
    let sends=0;const result=await executeReservedRemoteAiText({store:f.store,ownerId:owner,id:f.record.id,
      approvalDigest:f.record.approvalDigest,intent:f.intent,verified:f.verified,
      runtimeEnv:{OPENAI_API_KEY:'fixture-only',ROCKSTAR_SERVICE_ENTITLEMENTS_REQUIRED:required},
      fetchImpl:async()=>{sends++;return response();}});
    assert.equal(result.record.state,'unreconciled');assert.equal(sends,0);assert.equal(claims(f),0);
    assert.equal(f.pool().reserved_minor,1);assert.equal(f.pool().settled_minor,0);
  }
});
void test('local D1 rejects replaced recurring authority at final claim and allows a new exact approval',async t=>{
  const {Miniflare,convertV4MiniflareOptions}=await import('miniflare');
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("fixture")}}',
    compatibilityDate:'2026-08-18',d1Databases:['DB'],host:'127.0.0.1',port:0}));
  t.after(()=>mf.dispose());const db=await mf.getD1Database('DB'),f=await boundFixture(t,2);
  const tables=['work_jobs','remote_ai_rate_cards','remote_ai_text_executions','remote_ai_text_inputs',
    'remote_ai_text_send_claims','agent_delegation_budget_pools','agent_delegation_budget_reservations',
    'sky_recurring_contracts','rockstar_service_entitlements'];
  const objects=f.sqlite.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 ELSE 2 END,name").all();
  for(const o of objects.filter(o=>tables.includes(o.tbl_name) && (o.type!=='trigger' || /^(remote_ai_text_|sky_recurring_llm_)/.test(o.name))))
    await db.prepare(o.sql).run();
  await workStore(db).create(owner,f.parent);await new RemoteAiRateCardStore(db).register(f.verified,'fixture-operator');
  const c=f.sqlite.prepare('SELECT * FROM sky_recurring_contracts').get();
  await db.prepare(`INSERT INTO sky_recurring_contracts (${Object.keys(c).join(',')}) VALUES (${Object.keys(c).map(()=>'?').join(',')})`).bind(...Object.values(c)).run();
  const store=new RemoteAiTextStore(db),record=(await store.create(f.quote,f.verified,f.parent.id,2)).record;
  assert.equal(record.quote.recurringContractBinding.consentVersion,'fixture-consent-v1');
  await store.reserve(owner,record.id,record.approvalDigest);await store.saveInput(owner,record.id,record.approvalDigest,
    await encryptRemoteAiTextInput(f.intent,'a'.repeat(64),owner,record.id));
  const claim=store.claimProviderSend.bind(store);let replace=true;
  t.mock.method(store,'claimProviderSend',async(...args)=>{
    if(replace)await db.prepare("UPDATE sky_recurring_contracts SET consent_version='d1-consent-v2'").run();
    return claim(...args);
  });
  let sends=0;const fetchImpl=async()=>{sends++;return response('resp_local_d1');};
  const denied=await executeReservedRemoteAiText({store,ownerId:owner,id:record.id,approvalDigest:record.approvalDigest,
    intent:f.intent,verified:f.verified,runtimeEnv:{OPENAI_API_KEY:'fixture-only'},fetchImpl});
  assert.equal(denied.record.state,'unreconciled');assert.equal(sends,0);
  assert.equal((await db.prepare('SELECT count(*) n FROM remote_ai_text_send_claims').first()).n,0);
  replace=false;
  const intent={...f.intent,requestId:randomUUID()},next=(await store.create(await prepareRemoteAiTextQuote(f.verified,intent),f.verified,f.parent.id,2)).record;
  assert.equal(next.quote.recurringContractBinding.consentVersion,'d1-consent-v2');
  await store.reserve(owner,next.id,next.approvalDigest);await store.saveInput(owner,next.id,next.approvalDigest,
    await encryptRemoteAiTextInput(intent,'a'.repeat(64),owner,next.id));
  const complete=await executeReservedRemoteAiText({store,ownerId:owner,id:next.id,approvalDigest:next.approvalDigest,
    intent,verified:f.verified,runtimeEnv:{OPENAI_API_KEY:'fixture-only'},fetchImpl});
  assert.equal(complete.record.state,'completed');assert.equal(sends,1);
  const pool=await db.prepare('SELECT reserved_minor,settled_minor FROM agent_delegation_budget_pools').first();
  assert.equal(pool.reserved_minor,1);assert.equal(pool.settled_minor,1);
});

void test('no-contract read/create race cannot insert a new quote as if the later contract were absent',async t=>{
  const f=await fixture(t), intent={...f.intent,requestId:randomUUID()},quote=await prepareRemoteAiTextQuote(f.verified,intent);
  const prepare=f.db.prepare.bind(f.db),now=Date.now();
  t.mock.method(f.db,'prepare',sql=>{
    const statement=prepare(sql);if(!sql.includes('SELECT id, stripe_account_id AS stripeAccountId'))return statement;
    return {bind(...values){const bound=statement.bind(...values);return {...bound,async first(){
      const row=await bound.first();assert.equal(row,null);
      f.second.prepare(`INSERT INTO sky_recurring_contracts
        (id,owner_id,stripe_account_id,customer_id,payment_method_id,consent_version,credit_minor,
         period_start,period_end,status,access_until,created_at,updated_at)
        VALUES ('raced-contract',?,'acct_fixture','cus_fixture','pm_fixture','fixture-consent',14000,?,?,'active',?,?,?)`)
        .run(owner,now-1000,now+600000,now+600000,now,now);return row;
    }};}};
  });
  await assert.rejects(f.store.create(quote,f.verified,f.parent.id,1),e=>e.code==='QUOTE_CONFLICT');
  assert.equal(f.sqlite.prepare('SELECT count(*) n FROM remote_ai_text_executions WHERE request_id=?').get(intent.requestId).n,0);
});

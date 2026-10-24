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
  const request = async (fetchImpl, onOutputProgress, setting = 'true') => {
    const current = await store.get(owner, record.id);
    if (current?.state === 'reserved' && !await store.getInput(owner, record.id)) await queueInput();
    return executeReservedRemoteAiText({ store, ownerId: owner, id: record.id,
      approvalDigest: record.approvalDigest, intent, verified, runtimeEnv: { OPENAI_API_KEY: 'fixture-only', ROCKSTAR_SERVICE_ENTITLEMENTS_REQUIRED: setting },
      fetchImpl, onOutputProgress });
  };
  return { db, sqlite, second, file, secondStore:new RemoteAiTextStore(client(second)), parent, verified, intent, quote, store, record, pool, reserve, queueInput, request };
}
function response(id = 'resp_fixture', usage = { input_tokens: 10, output_tokens: 5, total_tokens: 15,
  input_tokens_details: { cached_tokens: 4, cache_write_tokens: 3 } }) {
  return Response.json({ id, model: 'fixture-model', status: 'completed', service_tier: 'default', usage,
    output: [{ type: 'message', content: [{ type: 'output_text', text: 'Synthetic private result' }] }] });
}




import { rockstarEntitlementStore } from '../lib/rockstar-entitlement-claim.ts';
function entitlement(sqlite, options = {}) {
  const id=randomUUID(), hash=randomUUID().replaceAll('-','').repeat(2);
  sqlite.prepare(`INSERT INTO rockstar_service_entitlements
    (issuer_id,claim_id,owner_user_id,offer_id,purchase_reference_sha256,claim_code_sha256,form_factor,
     scopes_json,issuer_key_id,claim_signature,status,claimed_at,expires_at)
    VALUES ('synthetic',?,?,'synthetic',?,?,'service_only',?,'synthetic','synthetic',?,?,?)`)
    .run(id,options.owner ?? owner,hash,hash,options.scopes ?? '["rockstaros_access"]',options.status ?? 'active',
      Date.now(),options.expiresAt === undefined ? Date.now()+600000 : options.expiresAt);
  return id;
}
const claimCount = f => f.sqlite.prepare('SELECT count(*) AS n FROM remote_ai_text_send_claims').get().n;
for (const mutation of ['revoked','expired']) {
  void test('service '+mutation+' after precheck before final claim sends zero and preserves its hold', async t => {
    const f=await fixture(t);entitlement(f.sqlite);await f.reserve();
    assert.equal(await rockstarEntitlementStore(f.db).hasActiveScope(owner,'rockstaros_access'),true);
    const claim=f.store.claimProviderSend.bind(f.store);
    t.mock.method(f.store,'claimProviderSend',async(...args)=>{
      assert.equal(args[3],'required','actual coordinator forwards trusted policy into final SQL');
      if(mutation==='revoked') f.second.prepare("UPDATE rockstar_service_entitlements SET status='revoked',revoked_at=?").run(Date.now());
      else f.second.prepare('UPDATE rockstar_service_entitlements SET expires_at=?').run(Date.now()-1);
      return claim(...args);
    });
    let sends=0;const result=await f.request(async()=>{sends++;return response();});
    assert.equal(sends,0);assert.equal(result.record.state,'unreconciled');
    assert.equal(result.record.errorCode,'PROVIDER_SEND_CLAIM_REJECTED');
    assert.equal(claimCount(f),0);assert.equal(f.pool().reserved_minor,1);assert.equal(f.pool().settled_minor,0);
    await f.request(async()=>{sends++;return response();});assert.equal(sends,0);
  });
}
void test('any current matching grant suffices, without authorizing unrelated or revoked history', async t => {
  const f=await fixture(t);entitlement(f.sqlite,{status:'revoked'});entitlement(f.sqlite,{scopes:'["sky"]'});
  entitlement(f.sqlite,{owner:'foreign'});entitlement(f.sqlite,{expiresAt:null});await f.reserve();
  let sends=0;const result=await f.request(async()=>{sends++;return response();});
  assert.equal(result.record.state,'completed');assert.equal(sends,1);assert.equal(claimCount(f),1);
  assert.deepEqual({...f.pool()},{reserved_minor:0,settled_minor:1,budget_limit_minor:1});
});
void test('missing, revoked, expired, foreign, unrelated and malformed scope rows cannot authorize final send', async t => {
  for(const options of [null,{status:'revoked'},{status:'refunded'},{expiresAt:Date.now()-1000},{expiresAt:'malformed'},{expiresAt:Date.now()+600000.5},{owner:'foreign'},
    {scopes:'["sky"]'},{scopes:'{"rockstaros_access":true}'},{scopes:'"rockstaros_access"'},{scopes:'broken'},
    {scopes:'[true,1,null,{"scope":"rockstaros_access"}]'}]) {
    const f=await fixture(t);if(options)entitlement(f.sqlite,options);await f.reserve();let sends=0;
    const result=await f.request(async()=>{sends++;return response();});
    assert.equal(sends,0);assert.equal(result.record.state,'unreconciled');assert.equal(claimCount(f),0);
    assert.equal(f.pool().reserved_minor,1);
  }
});
void test('server omission and explicit false retain preview; unknown and boolean settings cannot select preview', async t => {
  for(const setting of [undefined,'false']) {
    const f=await fixture(t);await f.reserve();let sends=0;
    // Pass the server runtime object directly so undefined is not a JS default-argument replacement.
    await f.queueInput();
    const result=await executeReservedRemoteAiText({store:f.store,ownerId:owner,id:f.record.id,approvalDigest:f.record.approvalDigest,
      intent:{...f.intent,ROCKSTAR_SERVICE_ENTITLEMENTS_REQUIRED:'true'},verified:f.verified,
      runtimeEnv:{OPENAI_API_KEY:'fixture-only',ROCKSTAR_SERVICE_ENTITLEMENTS_REQUIRED:setting},
      fetchImpl:async()=>{sends++;return response();}});
    assert.equal(result.record.state,'completed');assert.equal(sends,1);
  }
  for(const setting of [null,true,false,'TRUE','unknown','']) {
    const f=await fixture(t);await f.reserve();let sends=0;
    await assert.rejects(f.request(async()=>{sends++;return response();},undefined,setting),e=>e.code==='INVALID_STATE');
    assert.equal(sends,0);assert.equal(claimCount(f),0);assert.equal(f.pool().reserved_minor,1);
  }
});
void test('client intent cannot downgrade required server scope policy', async t => {
  const f=await fixture(t);await f.reserve();await f.queueInput();let sends=0;
  const result=await executeReservedRemoteAiText({store:f.store,ownerId:owner,id:f.record.id,approvalDigest:f.record.approvalDigest,
    intent:{...f.intent,ROCKSTAR_SERVICE_ENTITLEMENTS_REQUIRED:'false',serviceAuthority:'preview'},verified:f.verified,
    runtimeEnv:{OPENAI_API_KEY:'fixture-only',ROCKSTAR_SERVICE_ENTITLEMENTS_REQUIRED:'true'},
    fetchImpl:async()=>{sends++;return response();}});
  assert.equal(result.record.state,'unreconciled');assert.equal(sends,0);assert.equal(f.pool().reserved_minor,1);
});
void test('DB committing clock rejects scope expiry even when server time is stale', async t => {
  const f=await fixture(t), stale=Date.now()-60000;
  entitlement(f.sqlite,{expiresAt:Date.now()-1000});await f.reserve();await f.queueInput();
  await f.store.claimDispatch(owner,f.record.id,f.record.approvalDigest);
  assert.equal(await f.store.claimProviderSend(owner,f.record.id,stale,'required'),false);
  assert.equal(claimCount(f),0);assert.equal(f.pool().reserved_minor,1);
});
void test('missing authority table is an unknown DB result, never a free cancellation or preview', async t => {
  const f=await fixture(t);await f.reserve();
  f.second.exec('DROP TABLE rockstar_service_entitlements');let sends=0;
  await assert.rejects(f.request(async()=>{sends++;return response();}),/no such table/);
  const current=await f.store.get(owner,f.record.id);
  assert.equal(current.state,'unreconciled');assert.equal(current.errorCode,'PROVIDER_SEND_CLAIM_UNCONFIRMED');
  assert.equal(sends,0);assert.equal(f.pool().reserved_minor,1);assert.equal(claimCount(f),0);
});
void test('restored service permits a new approved job within cap, never resends old unknown request', async t => {
  const f=await fixture(t,2);entitlement(f.sqlite,{status:'revoked'});await f.reserve();let sends=0;
  const fetcher=async()=>{sends++;return response('resp_restore');};
  const old=await f.request(fetcher);assert.equal(old.record.state,'unreconciled');
  entitlement(f.second);assert.equal((await f.request(fetcher)).providerSubmission,'not_repeated');assert.equal(sends,0);
  const intent={...f.intent,requestId:randomUUID()};
  const created=(await f.store.create(await prepareRemoteAiTextQuote(f.verified,intent),f.verified,f.parent.id,2)).record;
  await f.store.reserve(owner,created.id,created.approvalDigest);
  await f.store.saveInput(owner,created.id,created.approvalDigest,await encryptRemoteAiTextInput(intent,'a'.repeat(64),owner,created.id));
  const result=await executeReservedRemoteAiText({store:f.store,ownerId:owner,id:created.id,approvalDigest:created.approvalDigest,
    intent,verified:f.verified,runtimeEnv:{OPENAI_API_KEY:'fixture-only',ROCKSTAR_SERVICE_ENTITLEMENTS_REQUIRED:'true'},fetchImpl:fetcher});
  assert.equal(result.record.state,'completed');assert.equal(sends,1);
  assert.deepEqual({...f.pool()},{reserved_minor:1,settled_minor:1,budget_limit_minor:2});
});
void test('service revoke after authorized claim preserves genuine late usage once and never restarts parent', async t => {
  const f=await fixture(t);entitlement(f.sqlite);await f.reserve();let sends=0;
  const result=await f.request(async()=>{
    sends++;f.second.prepare("UPDATE rockstar_service_entitlements SET status='revoked'").run();
    const stopped=applyWorkCommand(f.parent,{id:randomUUID(),action:'cancel'},0);
    await workStore(client(f.second)).update(owner,stopped,0);
    await f.secondStore.markUnreconciled(owner,f.record.id,'DISPATCH_RESULT_UNKNOWN');
    return response();
  });
  assert.equal(result.record.state,'completed');assert.equal(f.pool().settled_minor,1);
  assert.equal((await workStore(f.db).get(owner,f.parent.id)).status,'cancelled');
  await f.request(async()=>{sends++;return response();});assert.equal(sends,1);assert.equal(claimCount(f),1);
});
void test('real Worker forwards its full server environment into the central send coordinator', () => {
  const source=readFileSync(new URL('../services/sky-agent-runtime/src/worker.ts',import.meta.url),'utf8');
  assert.match(source,/ROCKSTAR_SERVICE_ENTITLEMENTS_REQUIRED\?: string/);
  assert.match(source,/executeReservedRemoteAiText\(\{[\s\S]*?runtimeEnv: this\.env/);
  // This is a source wiring guard; behavioral policy propagation is asserted at final claim above.
});

void test('local D1 executes actual final-claim SQL: revoked scope sends zero, new authorized job settles once', async t => {
  const {Miniflare,convertV4MiniflareOptions}=await import('miniflare');
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("fixture")}}',
    compatibilityDate:'2026-08-18',d1Databases:['DB'],host:'127.0.0.1',port:0}));
  t.after(()=>mf.dispose());const db=await mf.getD1Database('DB');
  const f=await fixture(t,2);
  // Exact existing DDL restored for this execution path, not a replacement production schema.
  const tables=['work_jobs','remote_ai_rate_cards','remote_ai_text_executions','remote_ai_text_inputs',
    'remote_ai_text_send_claims','agent_delegation_budget_pools','agent_delegation_budget_reservations',
    'sky_recurring_contracts','rockstar_service_entitlements'];
  const objects=f.sqlite.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 ELSE 2 END,name").all();
  const ddl=objects.filter(o=>tables.includes(o.tbl_name) && (o.type!=='trigger' || /^(remote_ai_text_|sky_recurring_llm_)/.test(o.name)));
  for(const o of ddl)await db.prepare(o.sql).run();
  await workStore(db).create(owner,f.parent);await new RemoteAiRateCardStore(db).register(f.verified,'synthetic-operator');
  entitlement(f.sqlite);const row=f.sqlite.prepare('SELECT * FROM rockstar_service_entitlements').get();
  await db.prepare(`INSERT INTO rockstar_service_entitlements (${Object.keys(row).join(',')}) VALUES (${Object.keys(row).map(()=>'?').join(',')})`)
    .bind(...Object.values(row)).run();
  const store=new RemoteAiTextStore(db), first=(await store.create(f.quote,f.verified,f.parent.id,2)).record;
  await store.reserve(owner,first.id,first.approvalDigest);
  await store.saveInput(owner,first.id,first.approvalDigest,await encryptRemoteAiTextInput(f.intent,'a'.repeat(64),owner,first.id));
  const claim=store.claimProviderSend.bind(store);let revoke=true;
  t.mock.method(store,'claimProviderSend',async(...args)=>{
    if(revoke)await db.prepare("UPDATE rockstar_service_entitlements SET status='revoked'").run();
    return claim(...args);
  });
  let sends=0;const fetchImpl=async()=>{sends++;return response('resp_local_d1');};
  const requiredEnv={OPENAI_API_KEY:'fixture-only',ROCKSTAR_SERVICE_ENTITLEMENTS_REQUIRED:'true'};
  const denied=await executeReservedRemoteAiText({store,ownerId:owner,id:first.id,approvalDigest:first.approvalDigest,intent:f.intent,
    verified:f.verified,runtimeEnv:requiredEnv,fetchImpl});
  assert.equal(denied.record.state,'unreconciled');assert.equal(sends,0);
  assert.equal((await db.prepare('SELECT count(*) n FROM remote_ai_text_send_claims').first()).n,0);
  assert.equal((await db.prepare('SELECT reserved_minor n FROM agent_delegation_budget_pools').first()).n,1);
  revoke=false;await db.prepare("UPDATE rockstar_service_entitlements SET status='active'").run();
  const intent={...f.intent,requestId:randomUUID()};
  const next=(await store.create(await prepareRemoteAiTextQuote(f.verified,intent),f.verified,f.parent.id,2)).record;
  await store.reserve(owner,next.id,next.approvalDigest);
  await store.saveInput(owner,next.id,next.approvalDigest,await encryptRemoteAiTextInput(intent,'a'.repeat(64),owner,next.id));
  const complete=await executeReservedRemoteAiText({store,ownerId:owner,id:next.id,approvalDigest:next.approvalDigest,intent,
    verified:f.verified,runtimeEnv:requiredEnv,fetchImpl});
  assert.equal(complete.record.state,'completed');assert.equal(sends,1);
  const pool=await db.prepare('SELECT reserved_minor,settled_minor FROM agent_delegation_budget_pools').first();
  assert.equal(pool.reserved_minor,1);assert.equal(pool.settled_minor,1);
  await executeReservedRemoteAiText({store,ownerId:owner,id:first.id,approvalDigest:first.approvalDigest,intent:f.intent,
    verified:f.verified,runtimeEnv:requiredEnv,fetchImpl});
  assert.equal(sends,1);
});

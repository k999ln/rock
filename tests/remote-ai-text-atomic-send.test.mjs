import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';
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



// Separate Worker threads each open their own SQLite connection to the same file.
// A barrier aligns their attempts; SQLite's committing statement/transaction is the arbiter.
async function workerMain(adapterFactory) {
  const {workerData, parentPort} = await import('node:worker_threads');
  const {DatabaseSync} = await import('node:sqlite');
  const {RemoteAiTextStore} = await import(workerData.storeUrl);
  const connection = new DatabaseSync(workerData.file); connection.exec('PRAGMA busy_timeout=5000');
  const db = adapterFactory(connection);
  const store = new RemoteAiTextStore(db), barrier = new Int32Array(workerData.barrier);
  Atomics.add(barrier, 0, 1); Atomics.notify(barrier, 0);
  Atomics.wait(barrier, 1, 0);
  try {
    const result = workerData.operation === 'reserve'
      ? (await store.reserve(workerData.owner, workerData.id, workerData.approval)).state
      : await store.claimProviderSend(workerData.owner, workerData.id, Date.now(), workerData.serviceAuthority);
    parentPort.postMessage({ok:true,result});
  } catch (error) { parentPort.postMessage({ok:false,code:error.code ?? error.message}); }
  finally { connection.close(); }
}
async function race(f, requests) {
  const barrier = new SharedArrayBuffer(8), view = new Int32Array(barrier);
  const tasks = requests.map(request => new Promise((resolve, reject) => {
    const worker = new Worker('(' + workerMain.toString() + ')(' + client.toString() + ')', {
      eval:true, workerData:{file:f.file, owner, storeUrl:new URL('../lib/remote-ai-text-store.ts',import.meta.url).href, barrier, ...request},
    });
    worker.once('message', resolve); worker.once('error', reject);
    worker.once('exit', code => { if(code) reject(new Error('Worker exit ' + code)); });
  }));
  const deadline=Date.now()+10000;
  while (Atomics.load(view,0) < requests.length) {
    if (Date.now()>deadline) { Atomics.store(view,1,1); Atomics.notify(view,1); throw new Error('Worker barrier deadline'); }
    await new Promise(resolve => setTimeout(resolve,5));
  }
  Atomics.store(view,1,1); Atomics.notify(view,1);
  return Promise.all(tasks);
}
void test('two independent Worker connections compete for exact cap without increasing it', async t => {
  const f=await fixture(t);
  const other=(await f.store.create(await prepareRemoteAiTextQuote(f.verified,{...f.intent,requestId:randomUUID()}),f.verified,f.parent.id,1)).record;
  const results=await race(f,[{operation:'reserve',id:f.record.id,approval:f.record.approvalDigest},{operation:'reserve',id:other.id,approval:other.approvalDigest}]);
  assert.equal(results.filter(r=>r.ok).length,1);
  assert.equal(results.find(r=>!r.ok).code,'BUDGET_UNAVAILABLE');
  assert.deepEqual({...f.pool()},{reserved_minor:1,settled_minor:0,budget_limit_minor:1});
});
void test('two independent Worker connections acquire only one immutable send claim', async t => {
  const f=await fixture(t);await f.reserve();await f.queueInput();
  assert.equal(await f.store.claimDispatch(owner,f.record.id,f.record.approvalDigest),true);
  const results=await race(f,[{id:f.record.id},{id:f.record.id}]);
  assert.equal(results.filter(r=>r.ok && r.result).length,1);
  assert.equal(results.filter(r=>r.ok && !r.result).length,1);
  assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM remote_ai_text_send_claims').get().n,1);
  assert.equal(f.pool().reserved_minor,1);
});
void test('stop committed on another connection denies final claim; explicit restore works only before a claim', async t => {
  const f=await fixture(t);await f.reserve();await f.queueInput();await f.store.claimDispatch(owner,f.record.id,f.record.approvalDigest);
  const stopped=applyWorkCommand(f.parent,{id:randomUUID(),action:'cancel'},0);
  assert.equal(await workStore(client(f.second)).update(owner,stopped,0),true);
  assert.equal(await f.store.claimProviderSend(owner,f.record.id),false);
  // Synthetic authority writer restores the existing parent, with a new revision.
  const restored={...f.parent,revision:stopped.revision+1,updatedAt:Date.now()};
  assert.equal(await workStore(client(f.second)).update(owner,restored,stopped.revision),true);
  assert.equal(await f.store.claimProviderSend(owner,f.record.id),true);
  assert.equal(await f.secondStore.claimProviderSend(owner,f.record.id),false);
  assert.equal(f.pool().reserved_minor,1);
});
void test('rate revoke on another connection denies final claim and leaves its original hold', async t => {
  const f=await fixture(t);await f.reserve();await f.queueInput();await f.store.claimDispatch(owner,f.record.id,f.record.approvalDigest);
  await new RemoteAiRateCardStore(client(f.second)).revoke('openai',f.verified.card.cardId,'synthetic-operator');
  assert.equal(await f.store.claimProviderSend(owner,f.record.id),false);
  assert.equal(f.pool().reserved_minor,1);
});
void test('unknown outcome retains hold; late genuine usage after stop settles once across connections', async t => {
  const f=await fixture(t);await f.reserve();let sends=0;
  const result=await f.request(async()=>{
    sends++;
    const stopped=applyWorkCommand(f.parent,{id:randomUUID(),action:'cancel'},0);
    await workStore(client(f.second)).update(owner,stopped,0);
    await f.secondStore.markUnreconciled(owner,f.record.id,'DISPATCH_RESULT_UNKNOWN');
    assert.equal(f.pool().reserved_minor,1);
    return response();
  });
  assert.equal(result.record.state,'completed');assert.equal(result.record.settledMinor,1);
  assert.deepEqual({...f.pool()},{reserved_minor:0,settled_minor:1,budget_limit_minor:1});
  assert.equal((await workStore(client(f.second)).get(owner,f.parent.id)).status,'cancelled');
  await f.request(async()=>{sends++;return response();});assert.equal(sends,1);
});

void test('recurring access revoked on another connection is rechecked at final claim', async t => {
  const f=await fixture(t), now=Date.now();
  f.second.prepare(`INSERT INTO sky_recurring_contracts
    (id,owner_id,stripe_account_id,customer_id,payment_method_id,consent_version,credit_minor,
      period_start,period_end,status,access_until,created_at,updated_at)
    VALUES ('fixture-recurring',?,'test-account','test-customer','test-method','fixture-consent',14000,?,?,'active',?,?,?)`)
    .run(owner,now-1000,now+600000,now+600000,now,now);
  await f.reserve();await f.queueInput();await f.store.claimDispatch(owner,f.record.id,f.record.approvalDigest);
  f.second.prepare("UPDATE sky_recurring_contracts SET status='past_due' WHERE owner_id=?").run(owner);
  await assert.rejects(f.store.claimProviderSend(owner,f.record.id), /SKY_RECURRING_ACCESS_BLOCKED/);
  assert.equal(f.pool().reserved_minor,1);
  assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM remote_ai_text_send_claims').get().n,0);
});
void test('current pool currency or cap changes cannot reuse a previous dispatch approval', async t => {
  for (const [column,value] of [['currency','JPY'],['budget_limit_minor',2]]) {
    const f=await fixture(t);await f.reserve();await f.queueInput();await f.store.claimDispatch(owner,f.record.id,f.record.approvalDigest);
    // Synthetic authoritative row change from the independent connection.
    if (column==='currency') f.second.prepare('UPDATE agent_delegation_budget_pools SET currency=?').run(value);
    else f.second.prepare('UPDATE agent_delegation_budget_pools SET budget_limit_minor=?').run(value);
    assert.equal(await f.store.claimProviderSend(owner,f.record.id),false);
    assert.equal(f.pool().reserved_minor,1);
  }
});
void test('stale request time cannot bypass the DB clock or expired rate and durable input', async t => {
  const stale=Date.now()-25*60*60*1000;
  t.mock.method(Date,'now',()=>stale);
  const f=await fixture(t);await f.reserve();await f.queueInput();
  assert.equal(await f.store.claimDispatch(owner,f.record.id,f.record.approvalDigest),true);
  assert.equal(await f.store.claimProviderSend(owner,f.record.id,stale),false);
  assert.equal(f.pool().reserved_minor,1);
});

void test('known recurring denial before final claim keeps the hold, reports rejection and never retries', async t => {
  const f=await fixture(t), now=Date.now();
  f.second.prepare(`INSERT INTO sky_recurring_contracts
    (id,owner_id,stripe_account_id,customer_id,payment_method_id,consent_version,credit_minor,
      period_start,period_end,status,access_until,created_at,updated_at)
    VALUES ('fixture-recurring',?,'test-account','test-customer','test-method','fixture-consent',14000,?,?,'active',?,?,?)`)
    .run(owner,now-1000,now+600000,now+600000,now,now);
  await f.reserve();
  const claim=f.store.claimProviderSend.bind(f.store);
  t.mock.method(f.store,'claimProviderSend',async (...args)=>{
    f.second.prepare("UPDATE sky_recurring_contracts SET status='past_due' WHERE owner_id=?").run(owner);
    return claim(...args);
  });
  let sends=0;
  const fetchImpl=async()=>{sends++;return response();};
  await assert.rejects(f.request(fetchImpl), /SKY_RECURRING_ACCESS_BLOCKED/);
  const record=await f.store.get(owner,f.record.id);
  assert.equal(record.state,'unreconciled');
  assert.equal(record.errorCode,'PROVIDER_SEND_CLAIM_REJECTED');
  assert.equal(f.pool().reserved_minor,1);
  assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM remote_ai_text_send_claims').get().n,0);
  assert.equal((await f.request(fetchImpl)).providerSubmission,'not_repeated');
  assert.equal(sends,0);
});


void test('required service policy reaches independent Worker final claims and current revoke from another connection', async t => {
  const f=await fixture(t), now=Date.now();
  f.second.prepare(`INSERT INTO rockstar_service_entitlements
    (issuer_id,claim_id,owner_user_id,offer_id,purchase_reference_sha256,claim_code_sha256,form_factor,
     scopes_json,issuer_key_id,claim_signature,status,claimed_at,expires_at)
    VALUES ('fixture','fixture',?,'fixture',?,?,'service_only','["rockstaros_access"]','fixture','fixture','active',?,?)`)
    .run(owner,'a'.repeat(64),'b'.repeat(64),now,now+600000);
  await f.reserve();await f.queueInput();await f.store.claimDispatch(owner,f.record.id,f.record.approvalDigest);
  f.second.prepare("UPDATE rockstar_service_entitlements SET status='revoked'").run();
  const denied=await race(f,[{id:f.record.id,serviceAuthority:'required'},{id:f.record.id,serviceAuthority:'required'}]);
  assert.equal(denied.filter(r=>r.ok && !r.result).length,2);
  assert.equal(f.pool().reserved_minor,1);
  // Explicit synthetic authority restoration before any successful send claim.
  f.second.prepare("UPDATE rockstar_service_entitlements SET status='active'").run();
  const allowed=await race(f,[{id:f.record.id,serviceAuthority:'required'},{id:f.record.id,serviceAuthority:'required'}]);
  assert.equal(allowed.filter(r=>r.ok && r.result).length,1);
  assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM remote_ai_text_send_claims').get().n,1);
});

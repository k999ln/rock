import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { generateKeyPairSync, sign, randomUUID, createHmac } from 'node:crypto';
import { REMOTE_AI_TEXT_RATE_CARD_SCHEMA, remoteAiRateCardSigningBytes, verifyRemoteAiRateCard } from '../lib/remote-ai-rate-card.ts';
import { RemoteAiRateCardStore } from '../lib/remote-ai-rate-card-store.ts';
import { prepareRemoteAiTextQuote } from '../lib/remote-ai-text-pricing.ts';
import { RemoteAiTextStore } from '../lib/remote-ai-text-store.ts';
import { executeReservedRemoteAiText } from '../lib/remote-ai-text-execution.ts';
import { encryptRemoteAiTextInput } from '../lib/remote-ai-text-input.ts';
import { workStore } from '../lib/work-store.ts';
import { createWorkJob } from '../lib/workflow.ts';

const owner = 'synthetic-owner';
function database(t) {
  const sqlite = new DatabaseSync(':memory:');
  t.after(() => sqlite.close());
  for (const file of readdirSync(new URL('../drizzle/', import.meta.url)).filter(file => file.endsWith('.sql')).sort())
    sqlite.exec(readFileSync(new URL(`../drizzle/${file}`, import.meta.url), 'utf8'));
  const db = {
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
  return { db, sqlite };
}
async function fixture(t, budget = 100_000, saveResult = false) {
  const { db, sqlite } = database(t);
  const parent = createWorkJob({ id: randomUUID(), templateId: 'article', title: 'Synthetic cloud test' });
  await workStore(db).create(owner, parent);
  const now = Date.now();
  const pair = generateKeyPairSync('ed25519');
  const publicBytes = Uint8Array.from(pair.publicKey.export({ format: 'der', type: 'spki' }).subarray(-32));
  const card = {
    schema: REMOTE_AI_TEXT_RATE_CARD_SCHEMA, providerId: 'openai', keyId: 'fixture-key',
    cardId: 'fixture-card', modelId: 'fixture-model', pricingVersion: 'fixture-prices', currency: 'USD',
    inputMinorMicrosPerMillionTokens: 10_000_000_000_000, outputMinorMicrosPerMillionTokens: 10_000_000_000_000,
    cachedInputMinorMicrosPerMillionTokens: 1_000_000_000_000, cacheWriteMinorMicrosPerMillionTokens: 20_000_000_000_000,
    executionScope: 'text-only', serviceTier: 'default', effectiveAt: now - 1_000,
    expiresAt: now + 600_000, sourceUrl: 'https://developers.openai.com/api/docs/pricing', signature: '',
  };
  card.signature = sign(null, remoteAiRateCardSigningBytes(card), pair.privateKey).toString('base64url');
  const verified = await verifyRemoteAiRateCard(card, { providerId: 'openai', modelId: 'fixture-model', currency: 'USD' },
    async () => publicBytes, now);
  await new RemoteAiRateCardStore(db).register(verified, 'synthetic-operator', now);
  const intent = { ownerId: owner, requestId: randomUUID(), model: 'fixture-model',
    prompt: 'Synthetic private input', maxOutputTokens: 100, maximumBudgetMinor: 100_000 };
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
  return { db, sqlite, parent, verified, intent, quote, store, record, pool, reserve, queueInput, request };
}
function response(id = 'resp_fixture', usage = { input_tokens: 10, output_tokens: 5, total_tokens: 15,
  input_tokens_details: { cached_tokens: 4, cache_write_tokens: 3 } }) {
  return Response.json({ id, model: 'fixture-model', status: 'completed', service_tier: 'default', usage,
    output: [{ type: 'message', content: [{ type: 'output_text', text: 'Synthetic private result' }] }] });
}

import { cloudUsageStatement, skyUsagePayments } from '../lib/sky-usage-payment.ts';
import { handleSkyPayments } from '../lib/sky-payments.ts';
const origin = 'https://sky.fixture.chatgpt.site';
const runtime = { SKY_PAYMENTS_MODE: 'test', SKY_STRIPE_SECRET_KEY: 'sk_test_fixture',
  SKY_STRIPE_WEBHOOK_SECRET: 'whsec_fixture', SKY_USAGE_STRIPE_WEBHOOK_SECRET: 'whsec_usage',
  SKY_PAYMENT_ORIGIN: origin, SKY_USAGE_PAYMENTS_TEST_ENABLED: 'true' };
function stripeFixture() {
  const sessions = new Map(), intents = new Map(), keys = new Map(), calls = [];
  let loseResponse = false;
  const fetcher = async (url, init) => {
    const path = new URL(url).pathname, fields = new URLSearchParams(init.body);
    calls.push({path, method:init.method, fields});
    assert.equal(init.redirect,'manual');
    if (path === '/v1/checkout/sessions' && init.method === 'POST') {
      const key = init.headers['Idempotency-Key'];
      if (!keys.has(key)) {
        const id = `cs_${sessions.size + 1}`;
        keys.set(key,id);
        sessions.set(id, { id, mode:'payment', livemode:false, status:'open', payment_status:'unpaid',
          client_reference_id:fields.get('client_reference_id'), amount_total:Number(fields.get('line_items[0][price_data][unit_amount]')),
          currency:fields.get('line_items[0][price_data][currency]'), url:`https://checkout.stripe.com/c/pay/${id}`,
          metadata:{purpose:'sky_cloud_usage',usage_payment_id:fields.get('metadata[usage_payment_id]'),source_digest:fields.get('metadata[source_digest]')} });
        assert.equal(fields.has('payment_intent_data[application_fee_amount]'),false);
        assert.equal(fields.has('payment_intent_data[transfer_data][destination]'),false);
        assert.equal(fields.get('adaptive_pricing[enabled]'),'false');
      }
      if (loseResponse) { loseResponse=false; throw new Error('fixture network loss'); }
      return Response.json(sessions.get(keys.get(key)));
    }
    if (path.startsWith('/v1/checkout/sessions/')) return Response.json(sessions.get(path.split('/').at(-1)));
    if (path.startsWith('/v1/payment_intents/')) return Response.json(intents.get(path.split('/').at(-1)));
    assert.fail('unexpected Stripe request '+path);
  };
  function pay(session = [...sessions.values()][0]) {
    const id = `pi_${sessions.size}`;
    const intent = {id, livemode:false, amount:session.amount_total, amount_received:session.amount_total,
      currency:session.currency,status:'succeeded',metadata:session.metadata,
      latest_charge:{id:'ch_fixture',livemode:false,paid:true,payment_intent:id,amount:session.amount_total,
        currency:session.currency,amount_refunded:0,refunded:false,disputed:false}};
    intents.set(id,intent); Object.assign(session,{payment_intent:id,status:'complete',payment_status:'paid',url:null});
    return intent;
  }
  return {fetcher,sessions,intents,calls,pay,loseNext(){loseResponse=true;}};
}
async function ready(t) {
  const f = await fixture(t); await f.reserve(); await f.request(async () => response());
  const statement = await cloudUsageStatement(f.db,owner,f.record.id);
  const input = {sourceId:statement.sourceId,digest:statement.digest,amountMinor:statement.amountMinor,currency:statement.currency};
  const stripe = stripeFixture(), service=skyUsagePayments(f.db,runtime,stripe.fetcher);
  return {...f,statement,input,stripe,service};
}
function signed(event) {
  const raw = JSON.stringify(event), now=Math.floor(Date.now()/1000);
  return [raw,`t=${now},v1=${createHmac('sha256',runtime.SKY_USAGE_STRIPE_WEBHOOK_SECRET).update(`${now}.${raw}`).digest('hex')}`];
}
function request(action, body, user=owner) {
  return new Request(`${origin}/api/sky/payments/${action}`,{method:body?'POST':'GET',
    headers:{origin,'oai-authenticated-user-id':user,'content-type':'application/json'},body:body?JSON.stringify(body):undefined});
}
void test('one verified usage creates one checkout across channels and concurrent retries; settlement is not double-counted',async t=>{
  const f=await ready(t); const settled=f.pool().settled_minor;
  assert.ok(f.input.amountMinor>=50);
  const results=await Promise.all(Array.from({length:8},()=>f.service.start(owner,f.input)));
  assert.equal(new Set(results.map(r=>r.payment.id)).size,1); assert.equal(f.stripe.sessions.size,1);
  assert.equal(f.sqlite.prepare('SELECT count(*) n FROM sky_usage_payments').get().n,1);
  f.stripe.pay(); const payment=await f.service.confirm(owner,results[0].payment.id);
  assert.equal(payment.status,'paid'); assert.equal(payment.amountMinor,f.input.amountMinor);
  assert.equal(f.pool().settled_minor,settled,'collection must not settle the usage budget a second time');
  await assert.rejects(f.service.start(owner,f.input),{status:409});
  assert.equal((await f.service.list('other-owner')).length,0);
  await assert.rejects(f.service.confirm('other-owner',payment.id),{status:404});
});
void test('saved source, displayed amount and approval digest are required before any Stripe request',async t=>{
  const f=await ready(t);
  for(const input of [{...f.input,amountMinor:1},{...f.input,currency:'jpy'},{...f.input,digest:'0'.repeat(64)}])
    await assert.rejects(f.service.start(owner,input),{status:409});
  await assert.rejects(f.service.start('other-owner',f.input),{status:404});
  assert.equal(f.stripe.calls.length,0);
  const pending=await fixture(t); await assert.rejects(cloudUsageStatement(pending.db,owner,pending.record.id),{status:409});
});
void test('lost checkout response recovers through signed webhook; duplicates and refunds cannot revive paid access',async t=>{
  const f=await ready(t); f.stripe.loseNext();
  await assert.rejects(f.service.start(owner,f.input),{status:502});
  const session=[...f.stripe.sessions.values()][0], intent=f.stripe.pay(session);
  const event={id:'evt_fixture',livemode:false,type:'checkout.session.completed',data:{object:session}};
  await assert.rejects(f.service.webhook(JSON.stringify(event),'wrong'),/STRIPE_SIGNATURE_INVALID/);
  await f.service.webhook(...signed(event)); await f.service.webhook(...signed(event));
  const id=(await f.service.list(owner))[0].id;
  assert.equal((await f.service.confirm(owner,id)).status,'paid');
  intent.latest_charge.amount_refunded=10;
  await f.service.webhook(...signed({id:'evt_refund',livemode:false,type:'charge.refunded',data:{object:{payment_intent:intent.id}}}));
  intent.latest_charge.amount_refunded=0;
  await f.service.webhook(...signed(event));
  assert.equal((await f.service.confirm(owner,id)).status,'partially_refunded');
  assert.equal((await f.service.list(owner))[0].refundedMinor,10);
  intent.latest_charge.amount_refunded=intent.amount;
  assert.equal((await f.service.confirm(owner,id)).status,'refunded');
  intent.latest_charge.disputed=true;
  assert.equal((await f.service.confirm(owner,id)).status,'disputed');
  assert.equal(f.stripe.sessions.size,1);
});
void test('wrong provider amount, environment, metadata, recipient and charge cannot confirm payment',async t=>{
  const f=await ready(t), started=await f.service.start(owner,f.input), intent=f.stripe.pay();
  const session=[...f.stripe.sessions.values()][0];
  for(const [object,key,value] of [[session,'amount_total',1],[session,'livemode',true],[intent,'amount_received',0],
    [intent,'transfer_data',{destination:'acct_other'}],[intent,'application_fee_amount',10],
    [intent.latest_charge,'payment_intent','pi_other'],[intent.latest_charge,'amount_refunded',-1]]) {
    const before=object[key];object[key]=value;
    await assert.rejects(f.service.confirm(owner,started.payment.id),{status:409});object[key]=before;
  }
  assert.equal((await f.service.list(owner))[0].status,'pending');
});
void test('past retry horizon requires reconciliation and frozen source terms cannot be rewritten',async t=>{
  const f=await ready(t), clock=Date.now;
  t.mock.method(Date,'now',()=>clock()-21*3600*1000);f.stripe.loseNext();
  await assert.rejects(f.service.start(owner,f.input),{status:502});t.mock.restoreAll();
  const before=f.stripe.calls.length;
  await assert.rejects(f.service.start(owner,f.input),{status:409});assert.equal(f.stripe.calls.length,before);
  assert.throws(()=>f.sqlite.prepare('UPDATE sky_usage_payments SET amount_minor=51').run(),/IMMUTABLE/);
  assert.throws(()=>f.sqlite.prepare('DELETE FROM sky_usage_payments').run(),/IMMUTABLE/);
});
void test('live cloud collection remains closed even with credentials and enabling variables',async t=>{
  const f=await ready(t);
  const service=skyUsagePayments(f.db,{...runtime,SKY_PAYMENTS_MODE:'live',SKY_STRIPE_SECRET_KEY:'sk_live_fixture'},f.stripe.fetcher);
  await assert.rejects(service.start(owner,f.input),{status:503});assert.equal(f.stripe.calls.length,0);
});
void test('common payment HTTP path uses owner-scoped summaries and explicit approval; no amount or owner injection',async t=>{
  const f=await ready(t);
  let response=await handleSkyPayments(request('summary'), 'summary', f.db,runtime,f.stripe.fetcher);
  assert.equal(response.status,200);const summary=await response.json();assert.equal(summary.cloud.length,1);
  response=await handleSkyPayments(request('summary',undefined,'another'), 'summary', f.db,runtime,f.stripe.fetcher);
  assert.equal((await response.json()).cloud.length,0);
  for(const extra of [{ownerUserId:'another'},{source:'cloud_agent'},{esimOrderId:'order'}]) {
    response=await handleSkyPayments(request('checkout',{...f.input,...extra}),'checkout',f.db,runtime,f.stripe.fetcher);
    assert.equal(response.status,400);
  }
  response=await handleSkyPayments(request('checkout',f.input),'checkout',f.db,runtime,f.stripe.fetcher);
  assert.equal(response.status,200);
  response=await handleSkyPayments(new Request(`${origin}/api/sky/payments/summary`),'summary',f.db,runtime,f.stripe.fetcher);
  assert.equal(response.status,401);
  response=await handleSkyPayments(new Request(`${origin}/api/sky/payments/checkout`,{method:'POST',headers:{origin:'https://other.test','oai-authenticated-user-id':owner},body:JSON.stringify(f.input)}),'checkout',f.db,runtime,f.stripe.fetcher);
  assert.equal(response.status,403);
});

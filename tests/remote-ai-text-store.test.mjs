import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
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
async function fixture(t, budget = 1, saveResult = false) {
  const { db, sqlite } = database(t);
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
  return { db, sqlite, parent, verified, intent, quote, store, record, pool, reserve, queueInput, request };
}
function response(id = 'resp_fixture', usage = { input_tokens: 10, output_tokens: 5, total_tokens: 15,
  input_tokens_details: { cached_tokens: 4, cache_write_tokens: 3 } }) {
  return Response.json({ id, model: 'fixture-model', status: 'completed', service_tier: 'default', usage,
    output: [{ type: 'message', content: [{ type: 'output_text', text: 'Synthetic private result' }] }] });
}
const code = expected => error => error.code === expected;

void test('saved quotes are private, immutable and idempotent without retaining input', async t => {
  const f = await fixture(t);
  assert.equal(await f.store.get('another-owner', f.record.id), null);
  assert.deepEqual(await f.store.list('another-owner'), []);
  assert.doesNotMatch(JSON.stringify(f.record), /Synthetic private input|fixture-only/);
  const duplicate = await f.store.create(f.quote, f.verified, f.parent.id, 1);
  assert.equal(duplicate.inserted, false);
  assert.equal(duplicate.record.id, f.record.id);
  const changed = await prepareRemoteAiTextQuote(f.verified, { ...f.intent, prompt: 'Changed' });
  await assert.rejects(f.store.create(changed, f.verified, f.parent.id, 1), code('QUOTE_CONFLICT'));
  assert.throws(() => f.sqlite.prepare('UPDATE remote_ai_text_executions SET approved_cap_minor = 100 WHERE id = ?').run(f.record.id),
    /CHECK|IMMUTABLE|TRANSITION/);
  assert.equal((await f.store.get(owner, f.record.id)).quote.approvedCapMinor, 1);
  assert.throws(() => f.sqlite.prepare('DELETE FROM remote_ai_text_executions WHERE id = ?').run(f.record.id),
    /REMOTE_AI_TEXT_AUDIT_RECORD_IMMUTABLE/);
});

void test('concurrent approval and execution send once and consume the budget once', async t => {
  const f = await fixture(t);
  await Promise.all([f.reserve(), f.reserve(), f.reserve()]);
  assert.equal(f.pool().reserved_minor, 1);
  let submissions = 0;
  const fetcher = async (_url, init) => {
    assert.equal(init.headers['X-Client-Request-Id'], f.record.id);
    submissions++; await new Promise(resolve => setTimeout(resolve, 5)); return response();
  };
  await Promise.all([f.request(fetcher), f.request(fetcher), f.request(fetcher)]);
  assert.equal(submissions, 1);
  const saved = await f.store.get(owner, f.record.id);
  assert.equal(saved.state, 'completed');
  assert.equal(saved.settledMinor, 1);
  assert.equal(saved.resultText, null, 'saving output is opt-in');
  assert.equal(saved.observation.serviceTier, 'default');
  assert.equal(saved.price.items.length, 4);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS count FROM remote_ai_text_send_claims WHERE execution_id = ?').get(f.record.id).count, 1,
    'an immutable one-time claim precedes the Provider send');
  await f.store.deleteInputAfterTerminal(owner, f.record.id);
  assert.equal(await f.store.getInput(owner, f.record.id), null, 'terminal jobs remove encrypted prompt material');
  assert.deepEqual({ ...f.pool() }, { reserved_minor: 0, settled_minor: 1, budget_limit_minor: 1 });
  const retry = await f.request(fetcher);
  assert.equal(retry.providerSubmission, 'not_repeated');
  assert.equal(submissions, 1);
});

void test('direct executions and A2A reservations compete for the same parent budget', async t => {
  const f = await fixture(t);
  await f.db.prepare(`INSERT INTO agent_delegation_budget_pools
    (owner_user_id,parent_job_id,currency,budget_limit_minor,reserved_minor,settled_minor,revision,created_at,updated_at)
    VALUES (?,?,'USD',1,0,0,0,?,?)`).bind(owner, f.parent.id, Date.now(), Date.now()).run();
  await f.db.prepare(`INSERT INTO agent_delegation_budget_reservations
    (delegation_id,owner_user_id,parent_job_id,currency,reserved_minor,state,created_at,updated_at)
    VALUES ('synthetic-a2a',?,?,'USD',1,'held',?,?)`).bind(owner, f.parent.id, Date.now(), Date.now()).run();
  await assert.rejects(f.reserve(), code('BUDGET_UNAVAILABLE'));
  assert.equal(f.pool().reserved_minor, 1);
  assert.equal((await f.store.get(owner, f.record.id)).state, 'quoted');
  await f.db.prepare("UPDATE agent_delegation_budget_reservations SET state = 'released' WHERE delegation_id = ?")
    .bind('synthetic-a2a').run();
  await f.reserve();
  await assert.rejects(f.db.prepare(`INSERT INTO agent_delegation_budget_reservations
    (delegation_id,owner_user_id,parent_job_id,currency,reserved_minor,state,created_at,updated_at)
    VALUES ('synthetic-other',?,?,'USD',1,'held',?,?)`).bind(owner, f.parent.id, Date.now(), Date.now()).run(),
    /EXCEEDED/);
  assert.equal(f.pool().reserved_minor, 1);
});

void test('two direct quotes cannot oversubscribe a parent or silently increase its cap', async t => {
  const f = await fixture(t);
  const second = await prepareRemoteAiTextQuote(f.verified, { ...f.intent, requestId: randomUUID() });
  const row = (await f.store.create(second, f.verified, f.parent.id, 1)).record;
  const results = await Promise.allSettled([f.reserve(), f.store.reserve(owner, row.id, row.approvalDigest)]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(f.pool().reserved_minor, 1);
  const third = (await f.store.create(await prepareRemoteAiTextQuote(f.verified, { ...f.intent, requestId: randomUUID() }),
    f.verified, f.parent.id, 2)).record;
  await assert.rejects(f.store.reserve(owner, third.id, third.approvalDigest), code('BUDGET_UNAVAILABLE'));
  assert.equal(f.pool().budget_limit_minor, 1);
});

void test('timeouts remain held and cannot be cancelled, expired or automatically resent', async t => {
  const f = await fixture(t);
  await f.reserve();
  let calls = 0;
  const fetcher = async () => { calls++; throw new DOMException('Private network details', 'AbortError'); };
  await assert.rejects(f.request(fetcher), code('UPSTREAM_TIMEOUT'));
  const row = await f.store.get(owner, f.record.id);
  assert.equal(row.state, 'unreconciled');
  assert.equal(row.errorCode, 'UPSTREAM_TIMEOUT');
  assert.ok(row.observation.durationMs >= 0);
  assert.equal(row.observation.clientRequestId, f.record.id);
  await assert.rejects(f.store.cancelBeforeSend(owner, row.id, row.approvalDigest), code('INVALID_STATE'));
  await f.store.expireBeforeSend(owner, row.id, row.quote.expiresAt + 1);
  await f.request(fetcher);
  assert.equal(calls, 1);
  assert.equal(f.pool().reserved_minor, 1);
  assert.equal(f.pool().settled_minor, 0);
});

void test('stream estimates stay owner-scoped, monotonic, non-final and visible after uncertain completion', async t => {
  const f = await fixture(t);
  await f.reserve();
  await f.queueInput();
  assert.equal(await f.store.claimDispatch(owner, f.record.id, f.record.approvalDigest), true);
  assert.equal(await f.store.claimProviderSend(owner, f.record.id), true);
  assert.equal(await f.store.updateLiveEstimate(owner, f.record.id, 700), true);
  assert.equal(await f.store.updateLiveEstimate(owner, f.record.id, 600), false);
  assert.equal(await f.store.updateLiveEstimate('another-owner', f.record.id, 900), false);
  const current = await f.store.get(owner, f.record.id);
  assert.equal(current.observation.liveMeter.finalProviderUsage, false);
  assert.equal(current.observation.liveMeter.observedOutputBytes, 700);
  assert.ok(current.observation.liveMeter.estimatedChargeMinor <= f.quote.ceiling.maximumChargeMinor);
  assert.equal(current.resultText, null);
  assert.equal(f.pool().reserved_minor, 1);
  const overCap = { ...current.observation,
    liveMeter: { ...current.observation.liveMeter,
      observedOutputBytes: 701,
      estimatedChargeMinor: f.quote.ceiling.maximumChargeMinor + 1,
      observedAt: Date.now() + 1,
    } };
  assert.throws(() => f.sqlite.prepare(`UPDATE remote_ai_text_executions SET observation_json = ?,
      revision = revision + 1, updated_at = ? WHERE owner_user_id = ? AND id = ?`)
    .run(JSON.stringify(overCap), Date.now() + 1, owner, f.record.id), /REMOTE_AI_TEXT_STATE_TRANSITION/);
  await f.store.markUnreconciled(owner, f.record.id, 'UPSTREAM_TIMEOUT');
  const uncertain = await f.store.get(owner, f.record.id);
  assert.equal(uncertain.state, 'unreconciled');
  assert.equal(uncertain.observation.liveMeter.observedOutputBytes, 700);
  assert.equal(f.pool().reserved_minor, 1);
  assert.equal(f.pool().settled_minor, 0);
});

void test('OpenAI stream progress persists only a provisional amount before final provider usage settles', async t => {
  const f = await fixture(t);
  await f.reserve();
  const output = 'Visible synthetic response '.repeat(24);
  const events = [
    { type: 'response.output_text.delta', delta: output },
    { type: 'response.completed', response: {
      id: 'resp_live_fixture', model: 'fixture-model', status: 'completed', service_tier: 'default',
      output: [{ type: 'message', content: [{ type: 'output_text', text: output }] }],
      usage: { input_tokens: 20, output_tokens: 10, total_tokens: 30,
        input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 } },
    } },
  ];
  const body = events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('');
  const observed = [];
  const completed = await f.request(async (_url, init) => {
    assert.equal(JSON.parse(init.body).stream, true);
    return new Response(body, { headers: { 'content-type': 'text/event-stream' } });
  }, async ({ outputBytes, observedAt }) => {
    await f.store.updateLiveEstimate(owner, f.record.id, outputBytes, observedAt);
    const row = await f.store.get(owner, f.record.id);
    observed.push({ state: row.state, meter: row.observation.liveMeter,
      settledMinor: row.settledMinor, resultText: row.resultText });
  });
  assert.equal(observed.length, 1);
  assert.equal(observed[0].state, 'sending');
  assert.equal(observed[0].meter.finalProviderUsage, false);
  assert.equal(observed[0].meter.observedOutputBytes, new TextEncoder().encode(output).byteLength);
  assert.equal(observed[0].settledMinor, null);
  assert.equal(observed[0].resultText, null);
  assert.equal(completed.record.state, 'completed');
  assert.equal(completed.record.observation.liveMeter, undefined);
  assert.equal(completed.record.usage.inputTokens, 20);
  assert.equal(completed.record.usage.outputTokens, 10);
  assert.equal(completed.providerSubmission, 'performed');
  assert.equal(f.pool().reserved_minor, 0);
  assert.equal(f.pool().settled_minor, completed.record.settledMinor);
});

void test('missing usage keeps observed metadata and reservation without storing output content', async t => {
  const f = await fixture(t, 1, true);
  await f.reserve();
  await f.request(async () => response('resp_unknown', { input_tokens: 10, output_tokens: 5, total_tokens: 15 }));
  const row = await f.store.get(owner, f.record.id);
  assert.equal(row.state, 'unreconciled');
  assert.equal(row.errorCode, 'MISSING_USAGE');
  assert.equal(row.observation.providerResponseId, 'resp_unknown');
  assert.equal(row.observation.usage.cacheWriteInputTokens, null);
  assert.equal(row.resultText, null);
  assert.equal(f.pool().reserved_minor, 1);
});

void test('credential, approval, expired quote, revoked pricing and stopped parent prevent sending', async t => {
  const f = await fixture(t);
  await assert.rejects(f.store.reserve(owner, f.record.id, '0'.repeat(64)), code('APPROVAL_MISMATCH'));
  await f.reserve();
  let calls = 0;
  await assert.rejects(executeReservedRemoteAiText({ store: f.store, ownerId: owner, id: f.record.id,
    approvalDigest: f.record.approvalDigest, intent: f.intent, verified: f.verified, runtimeEnv: {},
    fetchImpl: async () => { calls++; return response(); } }), code('MISSING_PROVIDER_CREDENTIAL'));
  assert.equal((await f.store.get(owner, f.record.id)).state, 'reserved');
  await new RemoteAiRateCardStore(f.db).revoke('openai', f.verified.card.cardId, 'synthetic-operator');
  await assert.rejects(f.request(async () => { calls++; return response(); }), code('BUDGET_UNAVAILABLE'));
  assert.equal(calls, 0);
  const stopped = applyWorkCommand(f.parent, { id: randomUUID(), action: 'cancel' }, 0);
  await workStore(f.db).update(owner, stopped, 0);
  assert.equal(await f.store.claimDispatch(owner, f.record.id, f.record.approvalDigest).catch(() => false), false);
  await f.store.expireBeforeSend(owner, f.record.id, f.quote.expiresAt + 24 * 60 * 60 * 1000 + 1);
  assert.equal((await f.store.get(owner, f.record.id)).state, 'expired');
  assert.equal(f.pool().reserved_minor, 0);
});

void test('opted-in result survives retrieval and can be deleted without changing cost records', async t => {
  const f = await fixture(t, 1, true);
  await f.reserve();
  await f.request(async () => response());
  assert.equal((await f.store.get(owner, f.record.id)).resultText, 'Synthetic private result');
  const row = await f.store.deleteSavedResult(owner, f.record.id);
  assert.equal(row.resultText, null);
  assert.equal(row.price.chargeMinor, 1);
  assert.equal(row.state, 'completed');
  assert.equal(f.pool().settled_minor, 1);
  assert.throws(() => f.sqlite.prepare("UPDATE remote_ai_text_executions SET state='reserved', revision=revision+1 WHERE id=?").run(row.id),
    /TRANSITION/);
});

void test('a repeated provider response ID cannot settle a second request', async t => {
  const f = await fixture(t, 2);
  await f.reserve();
  await f.request(async () => response());
  const secondIntent = { ...f.intent, requestId: randomUUID() };
  const row = (await f.store.create(await prepareRemoteAiTextQuote(f.verified, secondIntent),
    f.verified, f.parent.id, 2)).record;
  await f.store.reserve(owner, row.id, row.approvalDigest);
  await f.store.saveInput(owner, row.id, row.approvalDigest,
    await encryptRemoteAiTextInput(secondIntent, 'a'.repeat(64), owner, row.id));
  await assert.rejects(executeReservedRemoteAiText({ store: f.store, ownerId: owner, id: row.id,
    approvalDigest: row.approvalDigest, intent: secondIntent, verified: f.verified,
    runtimeEnv: { OPENAI_API_KEY: 'fixture-only' }, fetchImpl: async () => response() }), code('USAGE_CONFLICT'));
  assert.equal((await f.store.get(owner, row.id)).state, 'unreconciled');
  assert.deepEqual({ ...f.pool() }, { reserved_minor: 1, settled_minor: 1, budget_limit_minor: 2 });
});

void test('concurrent pre-send cancellation releases its reservation once with trigger-inclusive change counts', async t => {
  const f = await fixture(t);
  await f.reserve();
  const heldRevision = f.sqlite.prepare('SELECT revision FROM agent_delegation_budget_pools').get().revision;
  const cancelled = await Promise.all([
    f.store.cancelBeforeSend(owner, f.record.id, f.record.approvalDigest),
    f.store.cancelBeforeSend(owner, f.record.id, f.record.approvalDigest),
  ]);
  assert.ok(cancelled.every(row => row.state === 'cancelled'));
  assert.equal(f.pool().reserved_minor, 0);
  assert.equal(f.pool().settled_minor, 0);
  assert.equal(f.sqlite.prepare('SELECT revision FROM agent_delegation_budget_pools').get().revision, heldRevision + 1);
  await assert.rejects(f.reserve(), code('INVALID_STATE'));
});

void test('cancelling a durably queued request immediately deletes its encrypted prompt', async t => {
  const f = await fixture(t);
  await f.reserve();
  await f.queueInput();
  assert.ok(await f.store.getInput(owner, f.record.id));

  const cancelled = await f.store.cancelBeforeSend(owner, f.record.id, f.record.approvalDigest);
  assert.equal(cancelled.state, 'cancelled');
  assert.equal(await f.store.getInput(owner, f.record.id), null);
  assert.equal(f.pool().reserved_minor, 0);
  assert.equal((await f.store.cancelBeforeSend(owner, f.record.id, f.record.approvalDigest)).state, 'cancelled');
  assert.equal(await f.store.getInput(owner, f.record.id), null);
});

void test('durably queued work outlives quote approval expiry but stops at its fixed execution deadline', async t => {
  const f = await fixture(t);
  await f.reserve();
  await f.queueInput();
  const afterApprovalWindow = f.quote.expiresAt + 1;
  assert.equal((await f.store.expireBeforeSend(owner, f.record.id, afterApprovalWindow)).state, 'reserved');
  assert.equal((await f.store.listPrepared(10, afterApprovalWindow)).length, 1);
  const afterExecutionDeadline = f.quote.expiresAt + 24 * 60 * 60 * 1000 + 1;
  assert.equal((await f.store.expireBeforeSend(owner, f.record.id, afterExecutionDeadline)).state, 'expired');
  assert.equal(await f.store.getInput(owner, f.record.id), null);
  assert.equal(f.pool().reserved_minor, 0);
});

void test('history filters by owned parent before limiting rows and expires only unsubmitted reservations', async t => {
  const f = await fixture(t);
  const another = createWorkJob({ id: randomUUID(), templateId: 'article', title: 'Another synthetic parent' });
  await workStore(f.db).create(owner, another);
  for (let i = 0; i < 51; i++) {
    const quote = await prepareRemoteAiTextQuote(f.verified, { ...f.intent, requestId: randomUUID() }, f.quote.createdAt + 10 + i);
    await f.store.create(quote, f.verified, another.id, 1);
  }
  assert.equal((await f.store.list(owner)).length, 50);
  assert.equal((await f.store.list(owner, f.parent.id))[0].id, f.record.id);
  assert.deepEqual(await f.store.list('another-owner', f.parent.id), []);
  await f.reserve();
  assert.equal((await f.store.list(owner, f.parent.id, f.quote.expiresAt + 1))[0].state, 'expired');
  assert.equal(f.pool().reserved_minor, 0);
  const unknown = await fixture(t);
  await unknown.reserve();
  await assert.rejects(unknown.request(async () => { throw new DOMException('synthetic timeout', 'AbortError'); }), code('UPSTREAM_TIMEOUT'));
  assert.equal((await unknown.store.list(owner, unknown.parent.id, unknown.quote.expiresAt + 1))[0].state, 'unreconciled');
  assert.equal(unknown.pool().reserved_minor, 1);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { a2aDelegationStore } from '../lib/a2a-delegation-store.ts';
import { cloudUsageCostUsd } from '../lib/cloud-cost.ts';
import { assertCloudBudget, cloudBudget, readCloudSpend, routeCloudIncident } from '../lib/cloud-operations.ts';
import { ingestCloudProbe, ingestCloudUsage, readCloudOperations } from '../lib/cloud-operations-store.ts';
import { freeCloudTextHttp } from '../lib/sky-free-cloud-http.ts';
import { RemoteAiTextClientError } from '../lib/remote-ai-text-client.ts';
import { workStore } from '../lib/work-store.ts';
import { createWorkJob } from '../lib/workflow.ts';
import { openMonthlySandboxDatabase } from '../scripts/sky-monthly-sandbox-db.mjs';

function database(t) {
  const db = openMonthlySandboxDatabase();
  t.after(() => db.close());
  return db;
}

function container(id, userId, at, vcpuSeconds) {
  return { id, userId, usage: { kind: 'container', at, vcpuSeconds, gibSeconds: 0, gbSeconds: 0 } };
}

void test('UTC usage is priced once by cloud-cost, with separate global and owner caps', async (t) => {
  const db = database(t);
  const now = Date.UTC(2026, 10, 2, 0, 15);
  assert.deepEqual(cloudBudget({}), { totalUsd: 30, userUsd: 30 });
  const budget = cloudBudget({ CLOUD_MONTHLY_CAP_USD: '30', CLOUD_USER_MONTHLY_CAP_USD: '10' });
  const alice = container('container:alice', 'alice', now, 500_000);
  const bob = {
    id: 'workers-ai:bob', userId: 'bob',
    usage: { kind: 'model', at: now, model: 'qwen3-30b-a3b-fp8', inputTokens: 1_000_000, outputTokens: 0 },
  };
  assert.equal(await ingestCloudUsage(db, alice, now), true);
  assert.equal(await ingestCloudUsage(db, alice, now), false);
  await assert.rejects(ingestCloudUsage(db, { ...alice, userId: 'bob' }, now), { status: 409 });
  await ingestCloudUsage(db, bob, now);
  await ingestCloudUsage(db, container('prior-month', null, Date.UTC(2026, 9, 31, 23, 59), 5_000_000), now);
  assert.deepEqual({ ...await readCloudSpend(db, 'bob', now) }, {
    totalUsd: 10.051, userUsd: cloudUsageCostUsd(bob.usage), unpriced: 0,
  });
  await assert.rejects(assertCloudBudget(db, 'alice', now, budget), { code: 'CLOUD_USER_MONTHLY_CAP_REACHED' });
  assert.match(new RemoteAiTextClientError(429, 'CLOUD_USER_MONTHLY_CAP_REACHED').message, /あなたのクラウド月間費用/u);
  await assertCloudBudget(db, 'bob', now, budget);
  await ingestCloudUsage(db, container('shared-overhead', null, now, 1_000_000), now);
  await assert.rejects(assertCloudBudget(db, 'bob', now, budget), { code: 'CLOUD_MONTHLY_CAP_REACHED' });

  const unknown = { ...bob, id: 'unknown', usage: { ...bob.usage, model: 'unknown-model' } };
  await assert.rejects(ingestCloudUsage(db, { ...unknown, userId: null }, now), { status: 400 });
  await ingestCloudUsage(db, unknown, now);
  assert.equal((await readCloudSpend(db, 'bob', now)).unpriced, 1);
  await assert.rejects(assertCloudBudget(db, 'bob', now, { totalUsd: 100, userUsd: 100 }),
    { code: 'CLOUD_CAP_UNAVAILABLE' });
});

void test('Free Cloud returns a visible budget rejection while an earlier execution finishes and replays', async (t) => {
  const db = database(t);
  const now = Date.now();
  db.sqlite.prepare(`INSERT INTO sky_recurring_contracts
    (id,owner_id,stripe_account_id,customer_id,payment_method_id,consent_version,credit_minor,period_start,period_end,status,access_until,created_at,updated_at)
    VALUES ('fixture','owner','acct_fixture','cus_fixture','pm_fixture','synthetic',14000,?,?,'active',?,?,?)`)
    .run(now - 1000, now + 3_600_000, now + 300_000, now, now);
  const runtime = { SKY_FREE_CLOUD_ENABLED: 'true', SKY_FREE_CLOUD_OWNER_ID: 'owner' };
  const request = (id) => new Request('https://fixture.test', {
    method: 'POST',
    body: JSON.stringify({ id, prompt: 'Synthetic input', model: 'openai-fast', consent: true }),
  });
  let sends = 0;
  const dispatched = Promise.withResolvers();
  const reply = Promise.withResolvers();
  const fetcher = async (url) => {
    if (String(url).endsWith('/models')) return Response.json([{
      name: 'openai-fast', tier: 'anonymous', input_modalities: ['text'], output_modalities: ['text'],
    }]);
    sends += 1;
    dispatched.resolve();
    return reply.promise;
  };
  const run = (id) => freeCloudTextHttp(request(id), db, 'owner', runtime, fetcher, () => now, {});
  const runningId = crypto.randomUUID();
  const deniedId = crypto.randomUUID();
  const first = run(runningId);
  await Promise.race([dispatched.promise, first.then(async (response) => assert.fail(await response.text()))]);
  try {
    await ingestCloudUsage(db, container('global-cap', null, now, 1_500_001), now);
    const denied = await run(deniedId);
    assert.equal(denied.status, 429);
    const error = await denied.json();
    assert.equal(error.code, 'CLOUD_MONTHLY_CAP_REACHED');
    assert.match(error.error, /新しい実行を受付できません/u);
    assert.equal(await workStore(db).get('owner', deniedId), null);
  } finally {
    reply.resolve(Response.json({
      id: 'synthetic', model: 'fixture', user_tier: 'anonymous',
      choices: [{ finish_reason: 'stop', message: { content: 'Synthetic result' } }],
      usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 },
    }));
  }
  assert.equal((await first).status, 200);
  assert.equal((await run(runningId)).status, 200);
  assert.equal(sends, 1);
  const timing = db.sqlite.prepare("SELECT first_result_at AS finished FROM cloud_execution_timings WHERE source='free_cloud'").get();
  assert.ok(timing.finished >= now);
});

void test('A2A approval rejects over-cap drafts without sweeping already accepted work', async (t) => {
  const db = database(t);
  const now = Date.now();
  const owner = 'alice';
  const jobs = workStore(db);
  const store = a2aDelegationStore(db, cloudBudget({ CLOUD_USER_MONTHLY_CAP_USD: '10' }));
  const draft = async () => {
    const parent = createWorkJob({ id: crypto.randomUUID(), title: 'Test job', templateId: 'article' });
    await jobs.create(owner, parent);
    const id = crypto.randomUUID();
    const input = {
      id, parentJobId: parent.id, idempotencyKey: id, messageId: id, targetOrigin: 'https://agent.example.test',
      targetAgentName: 'Fixture agent', targetAgentVersion: '1', protocolVersion: '1.0',
      inputSha256: 'a'.repeat(64), authorizationSha256: 'b'.repeat(64), budgetCurrency: 'USD',
      budgetLimitMinor: 5, parentBudgetLimitMinor: 10, continueWhileDeviceOffline: true, deadlineAt: now + 60_000,
    };
    await store.prepare(owner, input, now);
    return input;
  };
  const approve = (input) => store.approve(owner, input.id, input.authorizationSha256, {
    ciphertext: 'synthetic', nonce: 'synthetic', inputSha256: input.inputSha256, keyVersion: 'aes-256-gcm-v1',
  }, now);
  const accepted = await draft();
  assert.equal((await approve(accepted)).state, 'prepared');
  await ingestCloudUsage(db, container('alice-reached-cap', owner, now, 500_000), now);
  const blocked = await draft();
  await assert.rejects(approve(blocked), { code: 'CLOUD_USER_MONTHLY_CAP_REACHED' });
  assert.equal(await store.getBudget(owner, blocked.parentJobId), null);
  assert.equal((await store.get(owner, blocked.id)).state, 'awaiting_approval');
  assert.equal((await store.claimDispatch(owner, accepted.id, now + 1)).state, 'dispatching');
});

void test('daily SLO reports missing observations and treats mature jobs without a result as misses', async (t) => {
  const db = database(t);
  const day = Date.UTC(2026, 10, 2);
  const now = day + 15 * 60_000;
  const success = { observedAt: day, latencyMs: 42, statusCode: 200, ok: true };
  assert.equal(await ingestCloudProbe(db, success, now), true);
  assert.equal(await ingestCloudProbe(db, success, now), false);
  await assert.rejects(ingestCloudProbe(db, { ...success, ok: false }, now), { status: 409 });
  await ingestCloudProbe(db, { observedAt: day + 600_000, latencyMs: 10_000, statusCode: null, ok: false }, now);
  const add = db.sqlite.prepare(`INSERT INTO cloud_execution_timings
    (execution_id, source, admitted_at, first_result_at) VALUES (?, 'a2a', ?, ?)`);
  add.run('early', day, day + 30_000);
  add.run('late', day, day + 70_000);
  add.run('missing', day, null);
  add.run('too-young', now - 10_000, null);
  const report = await readCloudOperations(db, cloudBudget({}), now);
  assert.equal(report.days[0].observed, 0);
  assert.deepEqual(report.days[1], {
    day: '2026-11-02', expected: 4, observed: 2, successes: 1,
    admitted: 4, eligible: 3, within30s: 1, p95Ms: 70_000,
  });
});

void test('loss, money and safety wake the operator; other events wait until morning', () => {
  assert.deepEqual(['data_loss', 'money', 'safety', 'other'].map(routeCloudIncident),
    ['wake_now', 'wake_now', 'wake_now', 'morning_digest']);
});

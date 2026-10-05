import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { a2aDelegationStore } from '../lib/a2a-delegation-store.ts';
import { workStore } from '../lib/work-store.ts';
import { applyWorkCommand, createWorkJob } from '../lib/workflow.ts';

const routeSource = readFileSync(new URL('../app/api/work-jobs/route.ts', import.meta.url), 'utf8');
const migrations = readdirSync(new URL('../drizzle/', import.meta.url))
  .filter((name) => name.endsWith('.sql') && !name.startsWith('._')).sort();
const dataModule = (source) => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;

function makeDb(t) {
  const sqlite = new DatabaseSync(':memory:');
  t.after(() => sqlite.close());
  for (const name of migrations)
    sqlite.exec(readFileSync(new URL(`../drizzle/${name}`, import.meta.url), 'utf8'));
  const db = {
    sqlite, beforeRun: null,
    prepare(sql) {
      return { bind(...values) {
        return {
          async first() { return sqlite.prepare(sql).get(...values) ?? null; },
          async all() { return { results: sqlite.prepare(sql).all(...values) }; },
          runSync() {
            db.beforeRun?.(sql, values);
            return { meta: { changes: Number(sqlite.prepare(sql).run(...values).changes) } };
          },
          async run() { return this.runSync(); },
        };
      } };
    },
    async batch(statements) {
      sqlite.exec('BEGIN IMMEDIATE');
      try {
        const result = statements.map((statement) => statement.runSync());
        sqlite.exec('COMMIT');
        return result;
      } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
  };
  return db;
}

async function setup(t, enforcement = 'false') {
  const db = makeDb(t);
  const key = `work-plan-route-fixture-${randomUUID()}`;
  // Synthetic authentication boundary only: these headers are NOT production auth.
  // The handler, workflow, owner-scoped stores, entitlement policy and SQL are real.
  globalThis[key] = { db, env: { ROCKSTAR_SERVICE_ENTITLEMENTS_REQUIRED: enforcement } };
  t.after(() => { delete globalThis[key]; });
  const fixture = `globalThis[${JSON.stringify(key)}]`;
  const imports = new Map([
    ['cloudflare:workers', dataModule(`export const env = ${fixture}.env;`)],
    ['@/lib/fund-store', dataModule(`
      export function database() { return ${fixture}.db; }
      export async function requestUser(request) {
        const user = request.headers.get('x-fixture-user');
        if (!user) throw new Error('UNAUTHORIZED');
        return user;
      }
    `)],
    ...['a2a-delegation-store', 'work-store', 'workflow', 'rockstar-service-access']
      .map((name) => [`@/lib/${name}`, new URL(`../lib/${name}.ts`, import.meta.url).href]),
  ]);
  const source = stripTypeScriptTypes(routeSource, { mode: 'strip' })
    .replace(/\bfrom\s+(['"])([^'"]+)\1/g, (_match, _quote, name) => {
      assert.ok(imports.has(name), `unmapped route import: ${name}`);
      return `from ${JSON.stringify(imports.get(name))}`;
    });
  const route = await import(dataModule(source));
  const jobs = workStore(db), delegations = a2aDelegationStore(db);
  const call = async (method, value, user = 'alice') => {
    const response = await route[method](new Request('https://fixture.invalid/api/work-jobs', {
      method, headers: { 'content-type': 'application/json', 'x-fixture-user': user },
      ...(method === 'GET' ? {} : { body: JSON.stringify(value) }),
    }));
    assert.equal(response.headers.get('cache-control'), 'no-store');
    return { status: response.status, body: await response.json() };
  };
  const create = async (owner = 'alice', templateId = 'cloud-agent') => {
    const job = createWorkJob({ id: randomUUID(), title: 'Route fixture', templateId });
    await jobs.create(owner, job);
    return job;
  };
  return { db, jobs, delegations, call, create, route };
}

function record(job, delegationId, extra = {}) {
  const step = job.steps.find((item) => !item.passed);
  return { id: randomUUID(), action: 'record', stepId: step.id, tool: step.tool,
    transport: 'browser', outcome: 'passed', sample: false, durationMs: 1,
    ...(delegationId ? { delegationId } : {}), ...extra };
}
const edit = (objective = 'Updated objective') => ({ id: randomUUID(), action: 'edit_plan', schemaVersion: 1, objective });
const patch = (job, command, revision = job.revision) => ({ jobId: job.id, revision, command });
const snapshot = (db, id) => db.sqlite.prepare('SELECT payload, revision, updated_at FROM work_jobs WHERE id = ?').get(id);
async function denied(fixture, job, command, status = 409, user = 'alice', revision = job.revision) {
  const before = snapshot(fixture.db, job.id);
  const response = await fixture.call('PATCH', patch(job, command, revision), user);
  assert.equal(response.status, status, JSON.stringify(response.body));
  assert.deepEqual(snapshot(fixture.db, job.id), before, 'denial must not write payload/revision/timestamp');
}

async function delegation(fixture, job, owner = 'alice', { quote = true, complete = false, artifact = true, receipt = true } = {}) {
  const id = randomUUID();
  // Database fixtures model evidence already checked by the provider ingress.
  // Signature verification and transport authentication have separate suites.
  const priceQuote = { schema: 'rock-a2a-provider-price-quote/1', providerId: 'fixture-provider',
    keyId: 'fixture-key', quoteId: id, agentOrigin: 'https://agent.example.test',
    agentName: 'Fixture agent', agentVersion: '1.0', requestSha256: 'a'.repeat(64),
    pricingVersion: 'fixture-1', pricingSha256: 'c'.repeat(64), currency: 'USD',
    estimateMinor: 20, maxAmountMinor: 100, issuedAt: 1000, expiresAt: 9000,
    usage: [{ meter: 'request', quantity: 1, unit: 'request', unitPriceMinor: 20, amountMinor: 20 }],
    signature: 's'.repeat(86) };
  const input = { id, parentJobId: job.id, idempotencyKey: `fixture:${id}`, messageId: `message:${id}`,
    targetOrigin: 'https://agent.example.test', targetAgentName: 'Fixture agent', targetAgentVersion: '1.0',
    protocolVersion: '1.0', inputSha256: 'a'.repeat(64), authorizationSha256: 'b'.repeat(64),
    budgetCurrency: 'USD', budgetLimitMinor: 100, parentBudgetLimitMinor: 900,
    continueWhileDeviceOffline: true, deadlineAt: 9000,
    ...(quote ? { priceQuote, priceQuoteDigest: id.replaceAll('-', '').repeat(2) } : {}) };
  const { delegations } = fixture;
  await delegations.prepare(owner, input, 1000);
  if (!complete) return delegations.get(owner, id);
  await delegations.approve(owner, id, input.authorizationSha256, {
    ciphertext: 'fixture-ciphertext', nonce: 'fixture-nonce', inputSha256: input.inputSha256, keyVersion: 'aes-256-gcm-v1',
  }, 1050);
  const claimed = await delegations.claimDispatch(owner, id, 1100);
  const sending = await delegations.beginRemoteSend(owner, id, claimed.revision, 1110);
  const completed = await delegations.recordTaskReceipt(owner, id, sending.revision, {
    id: `task:${id}`, state: 'TASK_STATE_COMPLETED',
  }, 1120);
  if (artifact) {
    await delegations.saveArtifact(owner, id, completed.remoteTaskId, {
      ciphertext: 'fixture-artifact', nonce: 'fixture-nonce', artifactSha256: 'e'.repeat(64), keyVersion: 'aes-256-gcm-v1',
    }, 24, 1130);
    await delegations.markArtifactsCaptured(owner, id, completed.remoteTaskId, completed.revision, 1140);
  }
  if (receipt) await delegations.settleUsageReceipt(owner, id, {
    schema: 'rock-a2a-provider-usage-receipt/1', providerId: 'fixture-provider', keyId: 'fixture-key',
    receiptId: `receipt:${id}`, ownerUserId: owner, parentJobId: job.id, delegationId: id,
    taskId: completed.remoteTaskId, agentOrigin: input.targetOrigin, agentName: input.targetAgentName,
    agentVersion: input.targetAgentVersion, currency: 'USD', amountMinor: 20, pricingVersion: 'fixture-1',
    issuedAt: 1120, usage: [{ meter: 'request', quantity: 1, unit: 'request', amountMinor: 20 }], signature: 's'.repeat(86),
  }, 1150);
  return delegations.get(owner, id);
}

async function advance(fixture, job, command) {
  const response = await fixture.call('PATCH', patch(job, command));
  assert.equal(response.status, 200, JSON.stringify(response.body));
  return response.body.job;
}

void test('work route creates and edits objectives without accepting caller-controlled approval gates', async (t) => {
  const f = await setup(t), id = randomUUID();
  const created = await f.call('POST', { id, title: 'Planned cloud task', templateId: 'cloud-agent',
    plan: { schemaVersion: 1, objective: 'Explicit objective' } });
  assert.equal(created.status, 201);
  let job = created.body.job;
  assert.equal(job.plan.objective, 'Explicit objective');
  assert.deepEqual(job.plan.approvalGates, [
    { stepId: 'agent-brief', requirement: 'provider_quote_wallet_reservation_and_explicit_cloud_approval' },
    { stepId: 'agent-result', requirement: 'terminal_result_captured_with_usage_receipt' },
  ]);
  job = await advance(f, job, edit());
  assert.equal(job.plan.objective, 'Updated objective');
  assert.deepEqual(job.plan.approvalGates, created.body.job.plan.approvalGates);
  await denied(f, job, { ...edit(), approvalGates: [] }, 400);
  await denied(f, job, { ...edit(), schemaVersion: 2 }, 400);
  const rejectedId = randomUUID();
  assert.equal((await f.call('POST', { id: rejectedId, title: 'Forged gates', templateId: 'cloud-agent',
    plan: { schemaVersion: 1, objective: 'Objective', approvalGates: [] } })).status, 400);
  assert.equal(await f.jobs.get('alice', rejectedId), null);
});

void test('work route enforces the configured Zema entitlement before creating a job', async (t) => {
  const f = await setup(t, 'true'), id = randomUUID();
  const deniedCreate = await f.call('POST', { id, title: 'Unentitled', templateId: 'article' });
  assert.equal(deniedCreate.status, 403);
  assert.equal(deniedCreate.body.code, 'SERVICE_ENTITLEMENT_REQUIRED');
  assert.equal(await f.jobs.get('alice', id), null);
  let bodyCancelled = false;
  const unreadBody = new ReadableStream({ cancel() { bodyCancelled = true; } }, { highWaterMark: 0 });
  const unread = await f.route.POST(new Request('https://fixture.invalid/api/work-jobs', {
    method: 'POST', headers: { 'x-fixture-user': 'alice' }, body: unreadBody, duplex: 'half',
  }));
  assert.equal(unread.status, 403);
  assert.equal(bodyCancelled, true, 'early entitlement denial must release an unread body');
  f.db.sqlite.prepare(`INSERT INTO rockstar_service_entitlements
    (issuer_id, claim_id, owner_user_id, offer_id, purchase_reference_sha256, claim_code_sha256,
     form_factor, scopes_json, issuer_key_id, claim_signature, status, claimed_at)
    VALUES ('fixture','claim','alice','offer',?,?,'service_only','["zema"]','key',?,'active',?)`)
    .run('a'.repeat(64), 'b'.repeat(64), 's'.repeat(86), Date.now());
  assert.equal((await f.call('POST', { id, title: 'Entitled', templateId: 'article' })).status, 201);
  assert.equal((await f.call('POST', { id: randomUUID(), title: 'Other owner', templateId: 'article' }, 'bob')).status, 403);
});

void test('cloud records require a saved delegation owned by the same user and parent job', async (t) => {
  for (const kind of ['missing ID', 'missing delegation', 'other owner', 'other parent']) {
    await t.test(kind, async (t) => {
      const f = await setup(t), job = await f.create();
      let id = kind === 'missing ID' ? undefined : randomUUID();
      if (kind.startsWith('other')) {
        const owner = kind === 'other owner' ? 'bob' : 'alice';
        const other = await f.create(owner);
        id = (await delegation(f, other, owner)).id;
      }
      await denied(f, job, record(job, id));
    });
  }
});

void test('cloud brief requires the persisted quote and a valid saved digest', async (t) => {
  for (const kind of ['missing quote', 'bad digest']) {
    await t.test(kind, async (t) => {
      const f = await setup(t), job = await f.create();
      const child = await delegation(f, job, 'alice', { quote: kind !== 'missing quote' });
      if (kind === 'bad digest') f.db.sqlite.prepare('UPDATE agent_delegations SET price_quote_digest = ? WHERE id = ?').run('invalid', child.id);
      await denied(f, job, record(job, child.id));
    });
  }
});

void test('cloud result requires completion, capture marker, artifacts and owner/parent-bound receipt together', async (t) => {
  for (const kind of ['incomplete', 'capture marker absent', 'no artifact rows', 'missing receipt', 'foreign owner receipt', 'foreign parent receipt']) {
    await t.test(kind, async (t) => {
      const f = await setup(t);
      let job = await f.create();
      const child = await delegation(f, job, 'alice', { complete: true,
        artifact: kind !== 'no artifact rows', receipt: !kind.includes('receipt') });
      job = await advance(f, job, record(job, child.id));
      if (kind === 'incomplete') f.db.sqlite.prepare("UPDATE agent_delegations SET state = 'working' WHERE id = ?").run(child.id);
      if (kind === 'capture marker absent') f.db.sqlite.prepare('UPDATE agent_delegations SET artifacts_captured = 0 WHERE id = ?').run(child.id);
      if (kind === 'no artifact rows') f.db.sqlite.prepare('UPDATE agent_delegations SET artifacts_captured = 1 WHERE id = ?').run(child.id);
      if (kind.startsWith('foreign')) {
        // Deliberately corrupt stored evidence, without weakening immutable-receipt triggers.
        f.db.sqlite.prepare(`INSERT INTO a2a_usage_receipts
          (delegation_id, owner_user_id, parent_job_id, provider_id, provider_reference, receipt_json,
           currency, amount_minor, issued_at, received_at) VALUES (?,?,?,?,?,?,'USD',20,1120,1150)`)
          .run(child.id, kind === 'foreign owner receipt' ? 'bob' : 'alice',
            kind === 'foreign parent receipt' ? randomUUID() : job.id, 'fixture-provider', `foreign:${child.id}`, '{}');
      }
      await denied(f, job, record(job, child.id));
    });
  }
});

void test('cloud result with saved receipt reaches review and only explicit completion finishes it', async (t) => {
  const f = await setup(t);
  let job = await f.create();
  const child = await delegation(f, job, 'alice', { complete: true });
  job = await advance(f, job, record(job, child.id));
  await denied(f, job, edit());
  job = await advance(f, job, record(job, child.id));
  assert.equal(job.status, 'review');
  assert.equal((await f.delegations.getUsageReceipt('alice', child.id)).parentJobId, job.id);
  const command = { id: randomUUID(), action: 'complete', note: 'Reviewed saved artifact and receipt.' };
  const previousRevision = job.revision;
  job = await advance(f, job, command);
  assert.equal(job.status, 'completed');
  const before = snapshot(f.db, job.id);
  assert.equal((await f.call('PATCH', patch(job, command, previousRevision))).status, 200);
  assert.deepEqual(snapshot(f.db, job.id), before, 'exact replay must not add another completion');
});

void test('historical cloud evidence is rechecked for completion and exact record replay', async (t) => {
  const f = await setup(t);
  let job = await f.create();
  const child = await delegation(f, job, 'alice', { complete: true });
  const brief = record(job, child.id);
  job = await advance(f, job, brief);
  job = await advance(f, job, record(job, child.id));
  f.db.sqlite.prepare('UPDATE agent_delegations SET price_quote_json = NULL WHERE id = ?').run(child.id);
  await denied(f, job, { id: randomUUID(), action: 'complete', note: 'Claimed complete.' });
  await denied(f, job, brief, 409, 'alice', 0);
});

void test('local cancellation survives invalid historical evidence while retaining ownership and revision checks', async (t) => {
  const f = await setup(t);
  let job = await f.create();
  const child = await delegation(f, job);
  job = await advance(f, job, record(job, child.id));
  f.db.sqlite.prepare('UPDATE agent_delegations SET price_quote_json = NULL WHERE id = ?').run(child.id);
  const command = { id: randomUUID(), action: 'cancel' };
  await denied(f, job, command, 404, 'bob');
  await denied(f, job, command, 409, 'alice', job.revision - 1);
  const remoteBefore = await f.delegations.get('alice', child.id);
  job = await advance(f, job, command);
  assert.equal(job.status, 'cancelled');
  assert.deepEqual(await f.delegations.get('alice', child.id), remoteBefore, 'local cancel must not dispatch or cancel remote work');
});

void test('work route isolates owners and rejects stale or interleaved updates without overwriting the winner', async (t) => {
  const f = await setup(t), job = await f.create('alice', 'article');
  await denied(f, job, edit(), 404, 'bob');
  assert.equal((await f.call('GET', undefined, 'bob')).body.jobs.length, 0);
  const first = await advance(f, job, edit('First objective'));
  await denied(f, first, edit('Stale objective'), 409, 'alice', 0);
  const winner = applyWorkCommand(first, edit('Concurrent winner'), first.revision);
  f.db.beforeRun = (sql) => {
    if (!sql.startsWith('UPDATE work_jobs SET')) return;
    f.db.beforeRun = null;
    f.db.sqlite.prepare('UPDATE work_jobs SET payload = ?, revision = ?, updated_at = ? WHERE id = ?')
      .run(JSON.stringify(winner), winner.revision, winner.updatedAt, winner.id);
  };
  const conflict = await f.call('PATCH', patch(first, edit('Concurrent loser')));
  assert.equal(conflict.status, 409);
  assert.deepEqual(await f.jobs.get('alice', job.id), winner);
});

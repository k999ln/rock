import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSharedComputeApi } from '../lib/noah-shared-compute-api.ts';
import { sharedDelegationStop } from '../lib/noah-shared-delegation.ts';
import { createNoahProfileApi } from '../lib/noah-profile-api.ts';
import { requestUser } from '../lib/request-auth.ts';
import { createNoahProfileStore } from '../lib/noah-profile-store.ts';
import {
  encodePublicTopicTerms,
  isSharedSampleId,
  evaluateSharedSample,
  SHARED_WORKLOAD_VERSION,
  SHARED_WORKLOAD_SHA256,
} from '../lib/noah-shared-workload.ts';
import { ownerScopeFor, OWNER_SCOPE_HEADER } from '../lib/owner-intent.ts';
import { fixture } from './fixtures/noah/intake.mjs';
import { computeBillingFixture } from './fixtures/noah/compute-billing.mjs';
import { readComputeBillingScope } from '../lib/noah-shared-compute-plan.ts';
import {
  makeApi,
  loadModel,
  loadEveAgents,
  runEveRecipe,
  processLease,
} from '../public/noah-shared-compute/runner.mjs';

import {
  readComputePilot,
  PILOT_JOB_LIMIT,
} from '../lib/noah-compute-pilot.ts';
import { EVE_AGENT_SHA256, EVE_WORKLOAD } from '../lib/noah-eve-participant.ts';

const path = 'https://noah.test/api/noah/shared-compute';
const consent = { consentVersion: 'shared-compute-v2', acceptThirdParty: true };
async function setup(t, limit = 1, billing, pilot = null) {
  const f = billing?.f ?? fixture(t);
  for (const name of [
    '0062_noah_shared_compute',
    '0063_noah_compute_subscriptions',
    '0064_noah_eve_participant',
  ]) {
    const sql = readFileSync(
      new URL(`../drizzle/${name}.sql`, import.meta.url),
      'utf8',
    );
    assert.equal(
      sql,
      readFileSync(
        new URL(`../drizzle-main/${name}.sql`, import.meta.url),
        'utf8',
      ),
    );
    f.sql.exec(sql);
    f.sql.exec(sql);
  }
  const gates = [],
    objects = new Map();
  const bucket = {
    async get(key) {
      return objects.get(key) ?? null;
    },
    async put(key, value) {
      if (f.hooks.failProfileSave) return null;
      const stored = {
        size: value.length,
        etag: crypto.randomUUID(),
        text: async () => value,
      };
      objects.set(key, stored);
      return stored;
    },
  };
  const profiles = createNoahProfileStore(
    bucket,
    {
      active: 'test',
      keys: { test: 'ab'.repeat(32) },
    },
    f.time,
    sharedDelegationStop(f.db),
  );
  const pause = (who) =>
    profiles.change(who, 0, (profile) => ({ ...profile, paused: true }));
  const scope = billing
    ? readComputeBillingScope(billing.env)
    : { mode: 'test', accountId: 'acct_test' };
  const deps = {
    db: f.db,
    pilot,
    now: billing ? Date.now : f.time,
    scope,
    authenticate: (req) =>
      requestUser(req, {
        allowEsimCloudIdentity: false,
        allowDeviceSession: false,
      }),
    authorize: async (user, target, action, digest, confirmed) => {
      gates.push({ user, target, action, digest, confirmed });
      const revision = await profiles.authorizeRevision(
        user,
        target,
        action,
        digest,
        confirmed,
      );
      await f.hooks.afterSharedAuthorization?.(user, action);
      return revision;
    },
  };
  async function purchase(who, attempt = crypto.randomUUID(), billing = scope) {
    const owner = await ownerScopeFor(who);
    f.sql
      .prepare(`INSERT INTO noah_compute_subscriptions(attempt,owner_scope,mode,stripe_account,created_at,price_id,
      terms_version,merchant,amount_minor,currency,monthly_jobs,subscription_id,charge_id,status,period_start,period_end)
      VALUES(?,?,?,?,?,'price_test','test-terms','Test merchant',100,'jpy',?,?,?,'active',?,?)`)
      .run(
        attempt,
        owner,
        billing.mode,
        billing.accountId,
        f.time(),
        limit,
        'sub_' + attempt,
        'ch_' + attempt,
        f.time() - 1000,
        f.time() + 1000 * 60 * 60,
      );
    return attempt;
  }
  async function call(who, input, extra = {}, Active = scope, requestId) {
    const method = input ? 'POST' : 'GET';
    const accountHeaders = who
      ? {
          'oai-authenticated-user-id': who,
          origin: new URL(path).origin,
          [OWNER_SCOPE_HEADER]: await ownerScopeFor(who),
        }
      : {};
    const response = await createSharedComputeApi({ ...deps, scope: Active })(
      new Request(requestId ? path + '?requestId=' + requestId : path, {
        method,
        headers: {
          'content-type': 'application/json',
          ...accountHeaders,
          ...extra,
        },
        ...(input ? { body: JSON.stringify(input) } : {}),
      }),
    );
    const body = await response.json();
    return { status: response.status, body };
  }
  async function host(who) {
    const deviceId = crypto.randomUUID();
    const response = await call(who, {
      action: 'enroll',
      deviceId,
      ...consent,
    });
    assert.equal(response.status, 200, JSON.stringify(response.body));
    return { deviceId, ...response.body };
  }
  function submit(
    who,
    requestId = crypto.randomUUID(),
    sampleId = 'meeting-notes',
  ) {
    return call(who, { action: 'submit', requestId, sampleId, ...consent });
  }
  async function claim(device) {
    const response = await call(null, { action: 'claim', ...device });
    assert.equal(response.status, 200, JSON.stringify(response.body));
    return response.body.lease;
  }
  const work = (action, d, lease, extra = {}) =>
    call(null, {
      action,
      ...d,
      jobId: lease.jobId,
      leaseId: lease.leaseId,
      ...extra,
    });
  return {
    f,
    gates,
    pause,
    profiles,
    async editPolicy(who, body) {
      const api = createNoahProfileApi({
        store: profiles,
        authenticate: deps.authenticate,
      });
      const revision = (await profiles.load(who)).profile.revision;
      return api.collection(
        new Request('https://noah.test/api/noah/profile', {
          method: 'POST',
          headers: {
            Origin: 'https://noah.test',
            'oai-authenticated-user-id': who,
            'content-type': 'application/json',
            [OWNER_SCOPE_HEADER]: await ownerScopeFor(who),
          },
          body: JSON.stringify({ ...body, revision }),
        }),
      );
    },
    scope,
    call,
    purchase,
    host,
    submit,
    claim,
    work,
    handle: createSharedComputeApi(deps),
  };
}

void test('two owners explicitly reserve, run and independently verify a fixed public task with one receipt', async (t) => {
  const w = await setup(t),
    alice = 'alice',
    bob = 'bob';
  await w.purchase(alice);
  const requestId = crypto.randomUUID();
  const [one, retry] = await Promise.all([
    w.submit(alice, requestId),
    w.submit(alice, requestId),
  ]);
  assert.equal(one.status, 200, JSON.stringify(one));
  assert.deepEqual(one, retry);
  assert.equal(
    (await w.submit(alice, requestId, 'research-summary')).status,
    409,
  );
  assert.equal((await w.submit(alice)).status, 429);
  const ownDevice = await w.host(alice),
    d = await w.host(bob);
  assert.equal(await w.claim(ownDevice), null);
  const [a, b] = await Promise.all([w.claim(d), w.claim(d)]);
  assert.equal([a, b].filter(Boolean).length, 1);
  const lease = a ?? b;
  assert.deepEqual(
    Object.keys(lease).sort(),
    [
      'jobId',
      'leaseId',
      'sampleId',
      'workload',
      'artifactSha256',
      'expiresAt',
    ].sort(),
  );
  assert.equal(lease.workload, SHARED_WORKLOAD_VERSION);
  assert.equal(lease.artifactSha256, SHARED_WORKLOAD_SHA256);
  assert.equal(lease.jobId, one.body.jobId);
  assert.notEqual(lease.jobId, requestId);
  assert.equal((await w.work('heartbeat', ownDevice, lease)).status, 409);
  assert.equal((await w.work('heartbeat', d, lease)).status, 200);
  assert.equal(
    (
      await w.work('complete', d, lease, {
        result: { label: 'invalid', score: 4 },
        elapsedMs: 1,
      })
    ).status,
    422,
  );
  const result = evaluateSharedSample(lease.sampleId);
  assert.equal(
    (await w.work('complete', d, lease, { result, elapsedMs: 751 })).status,
    400,
  );
  assert.equal(
    (await w.work('complete', d, lease, { result, elapsedMs: 700 })).status,
    409,
  );
  w.f.advance(4);
  const [first, duplicate] = await Promise.all([
    w.work('complete', d, lease, { result, elapsedMs: 3 }),
    w.work('complete', d, lease, { result, elapsedMs: 3 }),
  ]);
  assert.equal(first.status, 200);
  assert.deepEqual(first, duplicate);
  assert.match(first.body.receiptId, /^[a-f0-9-]{36}$/);
  const mine = (await w.call(alice)).body.jobs[0];
  assert.deepEqual(mine.result, result);
  assert.equal(mine.status, 'completed');
  assert.equal(mine.receiptId, first.body.receiptId);
  assert.deepEqual((await w.call(bob)).body.jobs, []);
  assert.equal((await w.submit(alice)).status, 429);
  const logged = w.f.sql.prepare('SELECT * FROM noah_compute_jobs').get();
  assert.equal(logged.artifact_hash, SHARED_WORKLOAD_SHA256);
  assert.equal(logged.lease_id, lease.leaseId);
  assert.equal(logged.consent_version, consent.consentVersion);
  assert.equal(logged.elapsed_ms, 3);
  assert.ok(
    w.gates.some(
      (g) =>
        g.user === alice &&
        g.action === 'run' &&
        g.confirmed &&
        g.digest === SHARED_WORKLOAD_SHA256,
    ),
  );
});

void test('authentication, intent, host and sender consent, private payload and account denial fail closed', async (t) => {
  const w = await setup(t),
    deviceId = crypto.randomUUID();
  assert.equal((await w.call(null)).status, 401);
  assert.equal((await w.call('noah-browser:guest')).status, 401);
  const body = { action: 'enroll', deviceId, ...consent };
  assert.equal(
    (await w.call('host', body, { origin: 'https://another.test' })).status,
    403,
  );
  assert.equal(
    (await w.call('host', body, { [OWNER_SCOPE_HEADER]: 'wrong' })).status,
    409,
  );
  assert.equal(
    (await w.call('host', { ...body, acceptThirdParty: false })).status,
    403,
  );
  assert.equal(
    (await w.call('host', { ...body, consentVersion: 'previous' })).status,
    403,
  );
  assert.equal((await w.call('host', body, {}, null)).status, 503);
  await w.pause('host');
  assert.equal((await w.call('host', body)).status, 403);
  const d = await w.host('other');
  assert.equal(
    (await w.call('host', { action: 'revoke', deviceId: d.deviceId })).status,
    404,
  );
  assert.equal((await w.submit('sender')).status, 403);
  await w.purchase('sender');
  const input = {
    action: 'submit',
    requestId: crypto.randomUUID(),
    sampleId: 'inventory-update',
    ...consent,
  };
  assert.equal(
    (await w.call('sender', { ...input, acceptThirdParty: false })).status,
    403,
  );
  assert.equal(
    (await w.call('sender', { ...input, prompt: 'private text' })).status,
    400,
  );
  assert.equal(
    (await w.call('sender', { ...input, sampleId: 'https://example.test/' }))
      .status,
    400,
  );
  assert.equal(
    (
      await w.call(null, {
        action: 'claim',
        ...d,
        deviceToken: crypto.randomUUID(),
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await w.call(
        null,
        { action: 'claim', ...d },
        {},
        { ...w.scope, mode: 'live' },
      )
    ).status,
    403,
  );
  assert.equal(
    (await w.call('sender', input, {}, { ...w.scope, accountId: 'acct_other' }))
      .status,
    403,
  );
  await w.pause('sender');
  assert.equal((await w.call('sender', input)).status, 403);
  assert.equal((await w.call('sender')).body.jobs.length, 0);
});

void test('revocation cancels a live lease even during retries and rotating a device identity cannot revive it', async (t) => {
  const w = await setup(t),
    d = await w.host('host');
  await w.purchase('buyer');
  await w.submit('buyer');
  const lease = await w.claim(d),
    other = await w.host('host2');
  assert.equal(
    (await w.call('host', { action: 'revoke', deviceId: d.deviceId })).status,
    200,
  );
  assert.equal((await w.work('heartbeat', d, lease)).status, 403);
  const renewed = await w.call('host', {
    action: 'enroll',
    deviceId: d.deviceId,
    ...consent,
  });
  assert.notEqual(renewed.body.deviceToken, d.deviceToken);
  assert.equal(
    (
      await w.work(
        'heartbeat',
        { deviceId: d.deviceId, ...renewed.body },
        lease,
      )
    ).status,
    409,
  );
  const reassigned = await w.claim(other);
  assert.equal(reassigned.jobId, lease.jobId);
  assert.notEqual(reassigned.leaseId, lease.leaseId);
  assert.equal(
    (await w.call('unrelated', { action: 'cancel', jobId: lease.jobId }))
      .status,
    404,
  );
  assert.equal(
    (await w.call('buyer', { action: 'cancel', jobId: lease.jobId })).status,
    200,
  );
  assert.equal((await w.work('heartbeat', other, reassigned)).status, 409);
  assert.equal(
    (
      await w.work('complete', other, reassigned, {
        result: evaluateSharedSample(lease.sampleId),
        elapsedMs: 100,
      })
    ).status,
    409,
  );
  assert.equal((await w.submit('buyer')).status, 200);
});

void test('lease loss, overall deadline and three attempts return unused allowance without settlement', async (t) => {
  const w = await setup(t),
    d = await w.host('host');
  await w.purchase('buyer');
  await w.submit('buyer');
  const first = await w.claim(d);
  w.f.advance(4000);
  assert.equal(
    (
      await w.work('complete', d, first, {
        result: evaluateSharedSample(first.sampleId),
        elapsedMs: 10,
      })
    ).status,
    409,
  );
  const second = await w.claim(d);
  assert.equal((await w.work('release', d, first)).status, 200);
  assert.equal((await w.work('heartbeat', d, second)).status, 200);
  await w.work('release', d, second);
  const third = await w.claim(d);
  for (let n = 0; n < 9; n++) {
    w.f.advance(2000);
    const heartbeat = await w.work('heartbeat', d, third);
    assert.ok(heartbeat.body.expiresAt <= third.expiresAt + 16000);
  }
  w.f.advance(2000);
  assert.equal((await w.work('heartbeat', d, third)).status, 409);
  assert.equal(await w.claim(d), null);
  assert.equal((await w.call('buyer')).body.jobs[0].status, 'expired');
  assert.equal((await w.submit('buyer')).status, 200);
  w.f.advance(15 * 60000);
  assert.equal(await w.claim(d), null);
  assert.equal((await w.submit('buyer')).status, 200);
});

void test('an expired/refunded subscription cannot dispatch, renew, or commit, including under a replacement contract', async (t) => {
  const w = await setup(t),
    d = await w.host('host');
  const attempt = await w.purchase('buyer');
  await w.submit('buyer');
  const lease = await w.claim(d);
  w.f.sql
    .prepare(
      "UPDATE noah_compute_subscriptions SET closed=1,status='inactive' WHERE attempt=?",
    )
    .run(attempt);
  await w.purchase('buyer');
  assert.equal((await w.call('buyer')).body.jobs[0].status, 'expired');
  assert.equal((await w.work('heartbeat', d, lease)).status, 409);
  assert.equal(
    (
      await w.work('complete', d, lease, {
        result: evaluateSharedSample(lease.sampleId),
        elapsedMs: 3,
      })
    ).status,
    409,
  );
  w.f.advance(5000);
  assert.equal(await w.claim(d), null);
  assert.equal((await w.submit('buyer')).status, 200);
  assert.ok(await w.claim(d));
});

void test('monthly checkout, signed event, two owners and real downloaded WASM runner deliver and cancel through the service APIs', async (t) => {
  const billing = computeBillingFixture(t);
  const w = await setup(t, 1, billing);
  const payer = 'requester',
    host = 'provider';
  const start = await billing.start(payer);
  assert.equal(start.status, 200);
  assert.equal(
    new URL((await start.json()).url).hostname,
    'checkout.stripe.com',
  );
  assert.equal((await w.submit(payer)).status, 403);
  billing.complete();
  assert.equal(
    (await billing.event('checkout.session.completed', billing.session()))
      .status,
    200,
  );
  assert.equal((await w.call(payer)).body.devices.length, 0);
  const d = await w.host(host);
  assert.equal((await billing.get(host)).subscription.entitled, false);
  const article =
    'The Marine Weekly explains the STOCK order, the new inventory shipment and the morning inventory report.';
  const features = encodePublicTopicTerms(article);
  assert.equal(features, 'terms-0.5.0.1');
  const requestId = crypto.randomUUID();
  assert.equal(
    (
      await w.call(payer, {
        action: 'submit',
        requestId,
        sampleId: features,
        ...consent,
        text: article,
      })
    ).status,
    400,
  );
  assert.equal((await w.submit(payer, requestId, article)).status, 400);
  assert.deepEqual((await w.call(payer)).body.jobs, []);
  const requested = await w.submit(payer, requestId, features);
  assert.equal(requested.status, 200);
  assert.equal(
    (await w.call(host, { action: 'cancel', jobId: requested.body.jobId }))
      .status,
    404,
  );

  const api = makeApi({
    deviceId: d.deviceId,
    token: d.deviceToken,
    maxBytes: 64 * 1024,
    request: (url, init) => {
      assert.equal(url, 'https://avoado.si/api/noah/shared-compute');
      return w.handle(new Request(url, init));
    },
  });
  const signal = AbortSignal.timeout(5000);
  const { lease } = await api('claim', {}, signal);
  assert.equal(lease.jobId, requested.body.jobId);
  assert.equal(lease.sampleId, features);
  assert.doesNotMatch(JSON.stringify(lease), /Marine Weekly/);
  // Hardware policy is qualified separately. Exercise the actual pinned model,
  // downloaded WASM worker, lease protocol, verifier and receipt storage here.
  assert.equal(
    await processLease({
      lease,
      model: await loadModel(),
      api,
      eligible: async () => true,
      signal,
    }),
    true,
  );
  const [job] = (await w.call(payer)).body.jobs;
  assert.equal(job.status, 'completed');
  assert.deepEqual(job.result, { label: 'inventory', score: 21 });
  assert.equal(job.title, '公開文章の分類');
  assert.equal(job.inputKind, 'term-counts');
  const records = w.f.sql.prepare('SELECT * FROM noah_compute_jobs').all();
  assert.equal(records.length, 1);
  assert.equal(records[0].sample_id, features);
  assert.doesNotMatch(
    JSON.stringify(records),
    /Marine Weekly|morning inventory/,
  );
  assert.ok(job.receiptId);
  assert.equal((await w.call(host)).body.jobs.length, 0);

  assert.equal((await billing.api(host, { action: 'cancel' })).status, 409);
  const cancelled = await billing.api(payer, { action: 'cancel' });
  assert.equal(cancelled.status, 200);
  assert.equal((await cancelled.json()).subscription.status, 'ending');
  const next = await w.submit(payer);
  assert.equal(next.status, 200);
  const pending = await w.claim(d);
  assert.equal(pending.jobId, next.body.jobId);
  billing.sub.status = 'canceled';
  assert.equal(
    (await billing.event('customer.subscription.deleted', billing.sub)).status,
    200,
  );
  assert.equal((await w.work('heartbeat', d, pending)).status, 409);
  assert.equal((await w.submit(payer)).status, 403);
  assert.equal((await w.call(host)).body.devices[0].active, true);
  assert.equal(
    (await w.call(host, { action: 'revoke', deviceId: d.deviceId })).status,
    200,
  );
});

void test('profile run deny cancels outstanding jobs and profile pause requeues other users’ work and invalidates the participant credential', async (t) => {
  const w = await setup(t, 3);
  const provider = await w.host('provider');
  const spare = await w.host('spare');
  await w.purchase('buyer');
  await w.submit('buyer');
  await w.submit('buyer');
  const first = await w.claim(provider);
  const grant = {
    target: SHARED_WORKLOAD_VERSION,
    action: 'run',
    digest: SHARED_WORKLOAD_SHA256,
    name: '共有計算',
    label: '依頼',
    mode: 'deny',
  };
  assert.equal(
    (await w.editPolicy('buyer', { action: 'grant', grant })).status,
    200,
  );
  assert.deepEqual(
    (await w.call('buyer')).body.jobs.map((j) => j.status),
    ['cancelled', 'cancelled'],
  );
  assert.equal((await w.work('heartbeat', provider, first)).status, 409);
  assert.equal(
    (
      await w.work('complete', provider, first, {
        result: evaluateSharedSample(first.sampleId),
        elapsedMs: 0,
      })
    ).status,
    409,
  );
  assert.equal(await w.claim(spare), null);
  assert.equal((await w.submit('buyer')).status, 403);
  assert.equal(
    (
      await w.editPolicy('buyer', {
        action: 'grant',
        grant: { ...grant, mode: 'allow' },
      })
    ).status,
    200,
  );
  assert.equal(await w.claim(spare), null);
  await w.submit('buyer');
  const next = await w.claim(provider);
  assert.equal(
    (await w.editPolicy('provider', { action: 'pause', paused: true })).status,
    200,
  );
  assert.equal((await w.work('heartbeat', provider, next)).status, 403);
  const replacement = await w.claim(spare);
  assert.equal(replacement.jobId, next.jobId);
  assert.notEqual(replacement.leaseId, next.leaseId);
  assert.equal(
    (await w.editPolicy('provider', { action: 'pause', paused: false })).status,
    200,
  );
  assert.equal(
    (await w.call(null, { action: 'claim', ...provider })).status,
    403,
  );
  assert.equal(
    (
      await w.call('provider', {
        action: 'enroll',
        deviceId: provider.deviceId,
        ...consent,
      })
    ).status,
    200,
  );
});

void test('admission is fenced even when global stop races after authorization or the profile save must retry', async (t) => {
  const w = await setup(t);
  await w.purchase('buyer');
  const pauseAfterRead = async (owner) => {
    assert.equal(
      (await w.editPolicy(owner, { action: 'pause', paused: true })).status,
      200,
    );
  };
  w.f.hooks.afterSharedAuthorization = pauseAfterRead;
  assert.equal((await w.submit('buyer')).status, 409);
  assert.equal(
    (
      await w.call('host', {
        action: 'enroll',
        deviceId: crypto.randomUUID(),
        ...consent,
      })
    ).status,
    409,
  );
  delete w.f.hooks.afterSharedAuthorization;
  assert.deepEqual((await w.call('buyer')).body.jobs, []);
  assert.deepEqual((await w.call('host')).body.devices, []);
  await w.editPolicy('buyer', { action: 'pause', paused: false });
  await w.submit('buyer');
  w.f.hooks.failProfileSave = true;
  assert.equal(
    (await w.editPolicy('buyer', { action: 'pause', paused: true })).status,
    409,
  );
  assert.equal((await w.call('buyer')).body.jobs[0].status, 'cancelled');
  assert.equal((await w.submit('buyer')).status, 409);
  w.f.hooks.failProfileSave = false;
  assert.equal(
    (await w.editPolicy('buyer', { action: 'pause', paused: true })).status,
    200,
  );
  assert.equal((await w.submit('buyer')).status, 403);
  assert.equal(
    (await w.editPolicy('buyer', { action: 'pause', paused: false })).status,
    200,
  );
  assert.equal((await w.submit('buyer')).status, 200);
});

void test('current billing environment filters jobs; host can identify and revoke its device even after settings are removed', async (t) => {
  const w = await setup(t);
  await w.purchase('owner');
  await w.submit('owner');
  const host = await w.host('owner');
  const testView = (await w.call('owner')).body;
  assert.equal(testView.devices[0].mode, 'test');
  assert.equal(testView.devices[0].currentEnvironment, true);
  for (const other of [
    { mode: 'live', accountId: w.scope.accountId },
    { mode: 'test', accountId: 'acct_other' },
    null,
  ]) {
    const view = (await w.call('owner', undefined, {}, other)).body;
    assert.deepEqual(view.jobs, []);
    assert.equal(view.devices[0].id, host.deviceId);
    assert.equal(view.devices[0].currentEnvironment, false);
    assert.equal(view.devices[0].mode, 'test');
  }
  assert.equal(
    (
      await w.call(
        'owner',
        { action: 'revoke', deviceId: host.deviceId },
        {},
        null,
      )
    ).status,
    200,
  );
  assert.equal((await w.call(null, { action: 'claim', ...host })).status, 403);
});

void test('public topic input has four canonical bounded integers and both parties must accept the expanded consent', async (t) => {
  const w = await setup(t);
  const sampleId = encodePublicTopicTerms(
    'REVIEW ' + 'ORDER, '.repeat(30) + 'stocker rearrange experiments',
  );
  assert.equal(sampleId, 'terms-0.15.0.1');
  assert.deepEqual(evaluateSharedSample(sampleId), {
    label: 'inventory',
    score: 61,
  });
  assert.equal(encodePublicTopicTerms('unrelated words and stockroom'), null);
  assert.equal(encodePublicTopicTerms(''), null);
  assert.equal(
    (await w.call('buyer')).body.consentVersion,
    'shared-compute-v2',
  );
  await w.purchase('buyer');
  assert.equal(
    (
      await w.call('buyer', {
        action: 'submit',
        requestId: crypto.randomUUID(),
        sampleId,
        ...consent,
        consentVersion: 'shared-compute-v1',
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await w.call('host', {
        action: 'enroll',
        deviceId: crypto.randomUUID(),
        ...consent,
        consentVersion: 'shared-compute-v1',
      })
    ).status,
    403,
  );
  for (const id of [
    'terms-0.0.0.0',
    'terms-0.0.1',
    'terms-0.1.0.2.1',
    'terms-16.0.0.0',
    'terms-01.0.0.0',
    'terms--1.0.0.0',
    'terms-0.0.0.1\n',
    'terms-1e0.0.0.0',
    'terms-1.0.0.0?text=hello',
    {},
    [1, 0, 0, 0],
  ]) {
    assert.equal(isSharedSampleId(id), false);
    assert.equal(
      (await w.submit('buyer', crypto.randomUUID(), id)).status,
      400,
    );
  }
  assert.deepEqual((await w.call('buyer')).body.jobs, []);
  assert.equal(
    (await w.submit('buyer', crypto.randomUUID(), sampleId)).status,
    200,
  );
});

const eveConsent = {
  consentVersion: 'eve-participant-v1',
  acceptThirdParty: true,
};
const specimen = {
  agents: ['market:tool:mr-citations', 'market:tool:mr-citations'],
  source: 'Public article [1]\n\n[1] https://example.org/reference',
};
async function pilotSetup(t) {
  const owners = await Promise.all(['sender', 'host'].map(ownerScopeFor));
  const until = '2026-11-20T12:00:00Z';
  const pilot = await readComputePilot({
    NOAH_COMPUTE_PILOT_OWNER_SCOPES: owners.join(','),
    NOAH_COMPUTE_PILOT_UNTIL: until,
  });
  assert.ok(pilot);
  const w = await setup(t, 1, undefined, pilot);
  const api = (who, body) => w.call(who, body, {}, null);
  const submit = (
    who = 'sender',
    requestId = crypto.randomUUID(),
    recipe = specimen,
  ) => api(who, { action: 'submitChain', requestId, recipe, ...eveConsent });
  const enroll = async (who) => {
    const deviceId = crypto.randomUUID();
    const res = await api(who, {
      action: 'enroll',
      deviceId,
      workloads: [EVE_WORKLOAD],
      ...eveConsent,
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    return { deviceId, deviceToken: res.body.deviceToken };
  };
  const claim = (d) =>
    api(null, { action: 'claim', workloads: [EVE_WORKLOAD], ...d });
  const work = (action, d, lease, data = {}) =>
    api(null, {
      action,
      ...d,
      leaseId: lease.leaseId,
      jobId: lease.jobId,
      ...data,
    });
  return { w, api, submit, enroll, claim, work, pilot };
}

void test('Eve grants a free bounded pilot to two accounts, verifies the published participant program, and exposes only the owner receipt', async (t) => {
  const { w, api, enroll, submit, claim, work } = await pilotSetup(t);
  const dashboard = (await api('sender')).body;
  assert.equal(dashboard.canSubmitChain, true);
  assert.equal(dashboard.canHostChain, true);
  assert.equal(dashboard.acceptingDevices, false);
  assert.equal(dashboard.pilot.jobLimit, PILOT_JOB_LIMIT);
  const outsider = (await api('stranger')).body;
  assert.equal(outsider.canSubmitChain, false);
  assert.equal(outsider.canHostChain, false);
  assert.equal((await submit('stranger')).status, 403);
  assert.equal(
    (
      await api('stranger', {
        action: 'enroll',
        deviceId: crypto.randomUUID(),
        workloads: [EVE_WORKLOAD],
        ...eveConsent,
      })
    ).status,
    403,
  );
  const requestId = crypto.randomUUID();
  const requested = await submit('sender', requestId);
  assert.equal(requested.status, 200, JSON.stringify(requested.body));
  assert.deepEqual((await submit('sender', requestId)).body, requested.body);
  assert.equal(
    (
      await submit('sender', requestId, {
        ...specimen,
        source: 'another public text',
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await submit('sender', crypto.randomUUID(), {
        ...specimen,
        agents: ['custom:unspecified'],
      })
    ).status,
    400,
  );
  const self = await enroll('sender'),
    device = await enroll('host');
  assert.equal((await claim(self)).body.lease, null);
  assert.equal(
    (await api(null, { action: 'claim', ...device })).body.lease,
    null,
  );
  assert.equal(
    (
      await api('sender', {
        action: 'submitChain',
        requestId: crypto.randomUUID(),
        recipe: specimen,
        ...consent,
      })
    ).status,
    403,
  );
  const { lease } = (await claim(device)).body;
  assert.equal(lease.jobId, requested.body.jobId);
  assert.deepEqual(lease.recipe, specimen);
  assert.equal(lease.artifactSha256, EVE_AGENT_SHA256);
  assert.doesNotMatch(
    JSON.stringify(lease),
    /owner_scope|owner-v1|deviceToken/,
  );
  const result = await runEveRecipe(
    await loadEveAgents(),
    lease.recipe,
    AbortSignal.timeout(3000),
  );
  w.f.advance(500);
  assert.equal(
    (
      await work('complete', device, lease, {
        result: { ...result, text: 'forged' },
        elapsedMs: 30,
      })
    ).status,
    422,
  );
  const receipt = await work('complete', device, lease, {
    result,
    elapsedMs: 30,
  });
  assert.equal(receipt.status, 200, JSON.stringify(receipt.body));
  assert.deepEqual(
    (await work('complete', device, lease, { result, elapsedMs: 30 })).body,
    receipt.body,
  );
  assert.equal(
    (
      await work('complete', device, lease, {
        result: { ...result, steps: [] },
        elapsedMs: 30,
      })
    ).status,
    422,
  );
  const [job] = (await w.call('sender', undefined, {}, null, requestId)).body
    .jobs;
  assert.equal(job.requestId, requestId);
  assert.equal(job.receiptId, receipt.body.receiptId);
  assert.deepEqual(job.result, result);
  assert.equal(
    (await w.call('host', undefined, {}, null, requestId)).body.jobs.length,
    0,
  );
  assert.equal(
    w.f.sql.prepare('SELECT recipe_json FROM noah_compute_chain_payloads').get()
      .recipe_json,
    null,
  );
  assert.equal(
    w.f.sql.prepare('SELECT COUNT(*) n FROM noah_compute_subscriptions').get()
      .n,
    0,
  );
});

void test('pilot caps, expiry, revocation and manuscript erasure cannot be overridden by a runner or request body', async (t) => {
  const { w, api, enroll, submit, claim, work, pilot } = await pilotSetup(t);
  const device = await enroll('host');
  assert.equal((await submit()).status, 200);
  const { lease } = (await claim(device)).body;
  assert.equal(
    (
      await w.editPolicy('sender', {
        action: 'grant',
        grant: {
          target: EVE_WORKLOAD,
          action: 'run',
          mode: 'deny',
          name: 'Eve',
          label: '依頼',
          digest: EVE_AGENT_SHA256,
        },
      })
    ).status,
    200,
  );
  assert.equal((await work('heartbeat', device, lease)).status, 409);
  assert.equal(
    w.f.sql
      .prepare(
        'SELECT recipe_json FROM noah_compute_chain_payloads WHERE job_id=?',
      )
      .get(lease.jobId).recipe_json,
    null,
  );
  assert.equal((await submit()).status, 403);
  for (let i = 0; i < PILOT_JOB_LIMIT; i++)
    assert.equal((await submit('host')).status, 200);
  assert.equal((await submit('host')).status, 429);
  assert.ok(
    w.f.sql
      .prepare(
        'SELECT count(*) n FROM noah_compute_chain_payloads WHERE recipe_json IS NOT NULL',
      )
      .get().n,
  );
  w.f.advance(pilot.expiresAt - w.f.time() + 1);
  assert.equal((await claim(device)).status, 403);
  const ended = (await api('host')).body;
  assert.equal(ended.canSubmitChain, false);
  assert.ok(ended.jobs.every((job) => job.status === 'expired'));
  assert.equal(
    w.f.sql
      .prepare(
        'SELECT count(*) n FROM noah_compute_chain_payloads WHERE recipe_json IS NOT NULL',
      )
      .get().n,
    0,
  );
  assert.equal(
    w.f.sql.prepare('SELECT count(*) n FROM noah_compute_subscriptions').get()
      .n,
    0,
  );
  assert.equal(
    await readComputePilot({
      NOAH_COMPUTE_PILOT_OWNER_SCOPES: pilot.owners[0],
      NOAH_COMPUTE_PILOT_UNTIL: '2026-11-20T12:00:00Z',
    }),
    null,
  );
  assert.equal(
    await readComputePilot({
      NOAH_COMPUTE_PILOT_OWNER_SCOPES: pilot.owners.join(','),
      NOAH_COMPUTE_PILOT_UNTIL: 'forever',
    }),
    null,
  );
});

void test('paid Eve work and classifier requests consume the same real period, with a separate opt-in for the new workload', async (t) => {
  const w = await setup(t, 1);
  const send = (funding = 'monthly') =>
    w.call('payer', {
      action: 'submitChain',
      funding,
      requestId: crypto.randomUUID(),
      recipe: specimen,
      ...eveConsent,
    });
  assert.equal((await send()).status, 403);
  await w.purchase('payer');
  assert.equal((await send('pilot')).status, 409);
  assert.equal((await send()).status, 200);
  assert.equal((await w.submit('payer')).status, 429);
  const old = await w.host('provider');
  assert.equal(
    (await w.call(null, { action: 'claim', workloads: [EVE_WORKLOAD], ...old }))
      .body.lease,
    null,
  );
  assert.equal(await w.claim(old), null);
  const deviceId = crypto.randomUUID();
  const enrolled = await w.call('provider', {
    action: 'enroll',
    workloads: [EVE_WORKLOAD],
    deviceId,
    ...eveConsent,
  });
  assert.equal(enrolled.status, 200);
  const fresh = { deviceId, deviceToken: enrolled.body.deviceToken };
  const { lease } = (
    await w.call(null, { action: 'claim', workloads: [EVE_WORKLOAD], ...fresh })
  ).body;
  assert.deepEqual(lease.recipe, specimen);
  await w.editPolicy('provider', {
    action: 'grant',
    grant: {
      target: EVE_WORKLOAD,
      action: 'connect',
      mode: 'deny',
      name: 'Eve',
      label: '参加',
      digest: EVE_AGENT_SHA256,
    },
  });
  assert.equal((await w.work('heartbeat', fresh, lease)).status, 403);
  assert.equal((await w.call(null, { action: 'claim', ...old })).status, 200);
});

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
  processLease,
} from '../public/noah-shared-compute/runner.mjs';

const path = 'https://noah.test/api/noah/shared-compute';
const consent = { consentVersion: 'shared-compute-v2', acceptThirdParty: true };
async function setup(t, limit = 1, billing) {
  const f = billing?.f ?? fixture(t);
  for (const name of [
    '0062_noah_shared_compute',
    '0063_noah_compute_subscriptions',
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
  async function call(who, input, extra = {}, Active = scope) {
    const method = input ? 'POST' : 'GET';
    const accountHeaders = who
      ? {
          'oai-authenticated-user-id': who,
          origin: new URL(path).origin,
          [OWNER_SCOPE_HEADER]: await ownerScopeFor(who),
        }
      : {};
    const response = await createSharedComputeApi({ ...deps, scope: Active })(
      new Request(path, {
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

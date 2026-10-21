import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import {
  createServiceSetup,
  acceptServiceSetup,
  serviceSetupReadiness,
  serviceSetupView,
} from '../lib/rockstar-service-setup.ts';
import { serviceSetupStore } from '../lib/rockstar-service-setup-store.ts';
import { serviceSetupBilling } from '../lib/rockstar-service-setup-billing.ts';
import {
  createLinuxWorkspace,
  applyLinuxEvent,
  linuxAccess,
  linuxCommand,
} from '../lib/sky-linux-service.ts';

const now = Date.UTC(2026, 9, 20),
  sha = 'a'.repeat(64);
const terms = {
  schema: 'sky.linux-terms/1',
  version: 'fixture-only',
  currency: 'USD',
  baseMinor: 1600,
  cpuUnitMs: 1000,
  cpuUnitMinor: 1,
  includedCpuMs: 1000,
  monthlyCapMinor: 2000,
  graceDays: 3,
  leaseSeconds: 30,
  retentionDays: 90,
  termsUrl: 'https://example.com/fixture-only-terms',
};
const acceptance = {
  schema: 'rockstar.os-service-acceptance/1',
  model: 'Pixel 10',
  sku: 'GL066',
  codename: 'frankel',
  status: 'accepted',
  buildId: 'fixture-only',
  evidenceSha256: sha,
  capabilities: [
    'owner_auth',
    'entitlement',
    'permissions_budget',
    'private_storage_recovery',
    'sky_eve_entry',
  ],
};
const config = {
  ROCKSTAR_SERVICE_SETUP_ENABLED: 'true',
  ROCKSTAR_OS_SERVICE_ACCEPTANCE_JSON: JSON.stringify(acceptance),
  SKY_LINUX_SERVICE_ENABLED: 'true',
  SKY_LINUX_SERVICE_TERMS_JSON: JSON.stringify(terms),
  SKY_PAYMENTS_MODE: 'test',
  SKY_STRIPE_SECRET_KEY: 'rk_test_Fixture',
  SKY_STRIPE_WEBHOOK_SECRET: 'whsec_Fixture',
  SKY_PAYMENT_ORIGIN: 'https://example.com',
  SKY_LINUX_CUSTOMERS_JSON: '{"owner":"cus_Fixture"}',
};

void test('environment preparation cannot open a billable window or create an empty month invoice', async () => {
  let w = await createLinuxWorkspace(
    'owner',
    'pixel-fixture',
    'order',
    terms,
    'sandbox',
    now,
  );
  w.serviceStartAt = null;
  w = await applyLinuxEvent(
    w,
    {
      schema: 'sky.linux-event/1',
      id: 'issuer-before-ready',
      workspaceId: w.id,
      issuedAt: now,
      kind: 'issuer',
      payload: {
        sequence: 1,
        orderId: 'order',
        deviceRef: 'pixel-fixture',
        state: 'active',
        validUntil: now + 86400000,
      },
    },
    now,
  );
  assert.equal(linuxAccess(w, now).canExecute, false);
  assert.equal(linuxAccess(w, now).reason, 'environment_required');
  assert.equal(w.serviceWindows.length, 0);
  const closed = await linuxCommand(
    w,
    { action: 'close-month', period: '2026-10' },
    [],
    Date.UTC(2026, 10, 1),
  );
  assert.equal(closed.invoices.length, 0);
  // Existing workspaces with no new field retain their original behavior.
  const legacy = structuredClone(w);
  delete legacy.serviceStartAt;
  assert.equal(linuxAccess(legacy, now).canExecute, true);
});

function database(t) {
  const sqlite = new DatabaseSync(':memory:');
  t.after(() => sqlite.close());
  for (const name of readdirSync(new URL('../drizzle/', import.meta.url))
    .filter((x) => /^\d.*\.sql$/.test(x))
    .sort())
    sqlite.exec(
      readFileSync(new URL('../drizzle/' + name, import.meta.url), 'utf8'),
    );
  function statement(sql, values = []) {
    return {
      bind: (...v) => statement(sql, v),
      first: async () => sqlite.prepare(sql).get(...values) ?? null,
      all: async () => ({ results: sqlite.prepare(sql).all(...values) }),
      run: async () => ({
        meta: { changes: Number(sqlite.prepare(sql).run(...values).changes) },
      }),
    };
  }
  return {
    prepare: (sql) => statement(sql),
    sqlite,
    batch: async () => {
      throw new Error('Unexpected batch');
    },
  };
}
function fixture(t, overrides = {}) {
  const db = database(t);
  let permitted = true,
    workspace = null,
    accepts = 0;
  const deps = {
    grant: async (_db, _config, owner, order) =>
      permitted && owner === 'owner' && order === 'order'
        ? {
            ownerUserId: owner,
            orderId: order,
            deviceRef: 'pixel-fixture',
            expiresAt: now + 86400000,
            scopes: ['rockstaros_access', 'sky', 'zema', 'agents'],
          }
        : null,
    linux: {
      get: async () => workspace,
      eligibleOrders: async () => [
        {
          orderId: 'order',
          deviceRef: 'pixel-fixture',
          expiresAt: now + 86400000,
        },
      ],
      accept: async () => {
        if (!workspace) {
          accepts++;
          let payload = await createLinuxWorkspace(
            'owner',
            'pixel-fixture',
            'order',
            terms,
            'sandbox',
            now,
          );
          payload.serviceStartAt = null;
          payload = await applyLinuxEvent(
            payload,
            {
              schema: 'sky.linux-event/1',
              id: 'fixture-issuer',
              workspaceId: payload.id,
              issuedAt: now,
              kind: 'issuer',
              payload: {
                sequence: 1,
                orderId: 'order',
                deviceRef: 'pixel-fixture',
                state: 'active',
                validUntil: now + 86400000,
              },
            },
            now,
          );
          workspace = {
            id: 'fixture-workspace-document',
            ownerId: 'owner',
            revision: 0,
            payload,
          };
        }
        return workspace;
      },
      activateSetup: async () => {
        workspace.payload.serviceStartAt ??= now;
        if (!workspace.payload.serviceWindows.length)
          workspace.payload.serviceWindows.push({ start: now, end: null });
        return workspace;
      },
    },
    billing: () => ({
      start: async () => ({
        sessionId: 'cs_test_Fixture',
        url: 'https://checkout.stripe.com/c/pay/fixture',
      }),
      reconcile: async () => ({
        setupIntentId: 'seti_Fixture',
        paymentMethodId: 'pm_Fixture',
      }),
    }),
    ...overrides,
  };
  return {
    db,
    store: serviceSetupStore(db, config, deps),
    revoke: () => {
      permitted = false;
    },
    restore: () => {
      permitted = true;
    },
    workspace: () => workspace,
    accepts: () => accepts,
  };
}
void test('post-OS module defaults off and cannot query storage or start billing before OS acceptance', async () => {
  assert.equal(serviceSetupReadiness({}).osReady, false);
  for (const p of [
    {},
    { ...acceptance, status: 'planned' },
    { ...acceptance, sku: 'other' },
    { ...acceptance, capabilities: [] },
  ])
    assert.equal(
      serviceSetupReadiness({
        ...config,
        ROCKSTAR_OS_SERVICE_ACCEPTANCE_JSON: JSON.stringify(p),
      }).osReady,
      false,
    );
  const store = serviceSetupStore(
    {
      prepare() {
        throw new Error('Must not query unmigrated DB');
      },
    },
    {},
  );
  assert.equal(
    (await store.view('owner', now)).access.state,
    'deferred_until_os_ready',
  );
  await assert.rejects(store.draft('owner', 'order', now), /OSの受入/);
});
void test('quote freezes $16, included allowance, monthly arrears and two explicit consents', async () => {
  const q = await createServiceSetup(
    'owner',
    'order',
    'pixel-fixture',
    terms,
    now,
  );
  assert.equal(q.terms.baseMinor, 1600);
  for (const [digest, accepted, recurring] of [
    [q.quoteDigest, true, false],
    ['b'.repeat(64), true, true],
    [q.quoteDigest, 'true', true],
  ])
    await assert.rejects(
      acceptServiceSetup(q, digest, accepted, recurring, now),
    );
  await assert.rejects(
    acceptServiceSetup(q, q.quoteDigest, true, true, q.expiresAt),
  );
  const accepted = await acceptServiceSetup(q, q.quoteDigest, true, true, now);
  assert.equal(
    (await acceptServiceSetup(accepted, q.quoteDigest, true, true, now + 10))
      .agreementDigest,
    accepted.agreementDigest,
  );
});
void test('profile→quote→contract→payment setup→canonical workspace→worker readiness→Sky/Eve; revoke/restore retains identity and data', async (t) => {
  const f = fixture(t),
    s = f.store;
  let d = await s.draft('owner', 'order', now);
  assert.equal((await s.view('owner', now)).access.state, 'contract_required');
  await assert.rejects(s.startBilling('owner', d.revision, now), /同意/);
  d = await s.accept(
    'owner',
    d.revision,
    {
      quoteDigest: d.payload.quoteDigest,
      accepted: true,
      recurringAccepted: true,
    },
    now,
  );
  await assert.rejects(
    s.accept(
      'owner',
      0,
      {
        quoteDigest: d.payload.quoteDigest,
        accepted: true,
        recurringAccepted: true,
      },
      now,
    ),
  );
  const started = await s.startBilling('owner', d.revision, now);
  d = started.setup;
  assert.equal(
    (await s.view('owner', now)).access.state,
    'billing_verification_required',
  );
  d = await s.reconcileBilling('owner', d.revision, now);
  assert.equal(
    (await s.view('owner', now)).access.state,
    'environment_required',
  );
  d = await s.provision('owner', d.revision, now);
  assert.equal((await s.view('owner', now)).access.canOpenSkyEve, false);
  const w = f.workspace();
  const request = {
    schema: 'sky.linux-worker-request/1',
    action: 'setup-ready',
    workspaceId: w.payload.id,
    issuedAt: now,
    contractDigest: w.payload.contractDigest,
    setupChallenge: d.payload.runtime.challenge,
    probeSha256: sha,
  };
  await assert.rejects(
    s.runtimeReady('owner', { ...request, setupChallenge: 'wrong' }, {}, now),
  );
  d = await s.runtimeReady('owner', request, { keyId: 'fixture-only' }, now);
  const active = await s.view('owner', now);
  assert.equal(active.access.canOpenSkyEve, true);
  assert.equal(active.access.paymentCollected, false);
  assert.equal(active.access.evePath, '/chat');
  assert.equal(active.access.skyPath, '/sky');
  assert.equal(
    (await s.provision('owner', d.revision, now)).payload.workspaceId,
    w.payload.id,
  );
  assert.equal(f.accepts(), 1);
  f.revoke();
  assert.equal(
    (await s.view('owner', now)).access.state,
    'profile_verification_required',
  );
  await assert.rejects(s.provision('owner', d.revision, now), /利用権/);
  f.restore();
  assert.equal((await s.view('owner', now)).access.canOpenSkyEve, true);
  assert.equal((await s.get('owner')).payload.id, d.payload.id);
  assert.equal(await s.get('another-owner'), null);
});
void test('payment pending and unpaid Linux invoices never become usable; read/export stay retained', async (t) => {
  const f = fixture(t);
  let d = await f.store.draft('owner', 'order', now);
  d = await f.store.accept(
    'owner',
    d.revision,
    {
      quoteDigest: d.payload.quoteDigest,
      accepted: true,
      recurringAccepted: true,
    },
    now,
  );
  d = (await f.store.startBilling('owner', d.revision, now)).setup;
  d = await f.store.reconcileBilling('owner', d.revision, now);
  d = await f.store.provision('owner', d.revision, now);
  const w = f.workspace();
  d = await f.store.runtimeReady(
    'owner',
    {
      schema: 'sky.linux-worker-request/1',
      action: 'setup-ready',
      issuedAt: now,
      workspaceId: w.payload.id,
      contractDigest: w.payload.contractDigest,
      setupChallenge: d.payload.runtime.challenge,
      probeSha256: sha,
    },
    {},
    now,
  );
  w.payload.invoices.push({ state: 'open', dueAt: now - 1 });
  assert.equal(
    (await f.store.view('owner', now)).access.state,
    'service_restricted',
  );
  assert.equal((await f.store.view('owner', now)).access.dataRetained, true);
  w.payload.invoices[0].state = 'paid';
  assert.equal((await f.store.view('owner', now)).access.state, 'active');
});
void test('lost billing response keeps a durable intent; retry and revision conflict cannot create a second contract', async (t) => {
  let attempts = 0;
  const f = fixture(t, {
    billing: () => ({
      start: async (setup) => {
        attempts++;
        assert.equal(setup.billing.requestedAt, now);
        throw new Error('response lost');
      },
    }),
  });
  let d = await f.store.draft('owner', 'order', now);
  d = await f.store.accept(
    'owner',
    d.revision,
    {
      quoteDigest: d.payload.quoteDigest,
      accepted: true,
      recurringAccepted: true,
    },
    now,
  );
  await assert.rejects(f.store.startBilling('owner', d.revision, now));
  const pending = await f.store.get('owner');
  assert.equal(pending.payload.billing.requestedAt, now);
  await assert.rejects(f.store.startBilling('owner', d.revision, now));
  assert.equal(attempts, 1);
  assert.equal(
    (await f.store.draft('owner', 'order', now)).payload.id,
    d.payload.id,
  );
});
function stripeFixture(setup) {
  const calls = [],
    metadata = {
      rockstar_service_setup: setup.id,
      agreement_digest: setup.agreementDigest,
    };
  let completed = false,
    mismatch = false,
    defaultMethod = null;
  const fetcher = async (url, init) => {
    const path = new URL(url).pathname,
      p = new URLSearchParams(init.body);
    calls.push({
      path,
      method: init.method,
      parameters: p,
      headers: new Headers(init.headers),
    });
    assert.equal(new URL(url).origin, 'https://api.stripe.com');
    assert.equal(init.redirect, 'error');
    let out;
    if (
      path === '/v1/checkout/sessions' ||
      path === '/v1/checkout/sessions/cs_test_Fixture'
    )
      out = {
        id: 'cs_test_Fixture',
        mode: 'setup',
        status: completed ? 'complete' : 'open',
        customer: mismatch ? 'cus_Other' : 'cus_Fixture',
        livemode: false,
        client_reference_id: setup.id,
        metadata,
        setup_intent: 'seti_Fixture',
        url: 'https://checkout.stripe.com/c/pay/fixture',
      };
    else if (path === '/v1/setup_intents/seti_Fixture')
      out = {
        id: 'seti_Fixture',
        status: 'succeeded',
        usage: 'off_session',
        customer: 'cus_Fixture',
        livemode: false,
        metadata,
        payment_method: 'pm_Fixture',
      };
    else if (path === '/v1/payment_methods/pm_Fixture')
      out = { id: 'pm_Fixture', customer: 'cus_Fixture', livemode: false };
    else if (path === '/v1/customers/cus_Fixture') {
      if (init.method === 'POST')
        defaultMethod = p.get('invoice_settings[default_payment_method]');
      out = {
        id: 'cus_Fixture',
        invoice_settings: { default_payment_method: defaultMethod },
      };
    } else throw new Error('Unexpected Stripe operation: ' + path);
    return Response.json(out);
  };
  return {
    calls,
    fetcher,
    complete: () => {
      completed = true;
    },
    mismatch: () => {
      mismatch = true;
    },
  };
}
void test('Stripe setup creates no charge, verifies exact customer/agreement/SetupIntent and reads back invoice default', async () => {
  let s = await createServiceSetup(
    'owner',
    'order',
    'pixel-fixture',
    terms,
    now,
  );
  s = await acceptServiceSetup(s, s.quoteDigest, true, true, now);
  s.billing.requestedAt = now;
  const f = stripeFixture(s),
    b = serviceSetupBilling(config, 'owner', f.fetcher);
  const result = await b.start(s, now);
  s.billing.sessionId = result.sessionId;
  assert.equal(f.calls[0].parameters.get('mode'), 'setup');
  assert.equal(f.calls[0].parameters.has('payment_method_types[0]'), false);
  assert.equal(f.calls[0].parameters.has('amount'), false);
  assert.equal(await b.reconcile(s), null);
  f.complete();
  assert.deepEqual(await b.reconcile(s), {
    setupIntentId: 'seti_Fixture',
    paymentMethodId: 'pm_Fixture',
  });
  assert.ok(
    f.calls.every(
      (c) =>
        !c.path.includes('/payment_intents') && !c.path.includes('/invoices'),
    ),
  );
  f.mismatch();
  await assert.rejects(b.reconcile(s), /一致/);
});
void test('uncertain old Stripe requests and missing account configuration fail before a new external request', async () => {
  let s = await createServiceSetup(
    'owner',
    'order',
    'pixel-fixture',
    terms,
    now,
  );
  s = await acceptServiceSetup(s, s.quoteDigest, true, true, now);
  s.billing.requestedAt = now;
  const f = stripeFixture(s),
    b = serviceSetupBilling(config, 'owner', f.fetcher);
  await assert.rejects(b.start(s, now + 20 * 3600000), /照合/);
  assert.equal(f.calls.length, 0);
  assert.throws(
    () => serviceSetupBilling(config, 'another-owner', f.fetcher),
    /設定/,
  );
});
void test('new client gate never infers readiness from a payment method, interface display or a runtime request', () => {
  const readiness = serviceSetupReadiness(config);
  assert.equal(
    serviceSetupView(null, {
      readiness,
      currentGrant: true,
      workspaceMatches: true,
      linuxCanExecute: true,
      linuxReason: null,
    }).canOpenSkyEve,
    false,
  );
  const android = readFileSync(
    new URL('../android/shell/src/main/AndroidManifest.xml', import.meta.url),
    'utf8',
  );
  assert.match(
    android,
    /android:enabled="@bool\/rockstar_service_setup_enabled"/,
  );
  assert.match(android, /START_SERVICE_SETUP/);
  const native = readFileSync(
    new URL(
      '../android/shell/src/main/java/dev/rock/shell/ServiceSetupActivity.java',
      import.meta.url,
    ),
    'utf8',
  );
  assert.ok(native.includes('startResolutionActivity'));
  assert.ok(native.includes('getResultCode()'));
  assert.doesNotMatch(android, /<uses-permission[^>]+(?:WRITE_EMBEDDED_SUBSCRIPTIONS|MANAGE_DEVICE_POLICY_MANAGED_SUBSCRIPTIONS)/);
  assert.match(native, /if \(!systemAuthority && !carrierAuthority\)/);
  assert.match(native, /telephony\.hasCarrierPrivileges\(\)/);
});

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TestD1 } from './fixtures/billing-test-d1.mjs';
import { linuxServiceStore } from '../lib/sky-linux-service-store.ts';
import {
  createServiceSetup,
  acceptServiceSetup,
  serviceSetupReadiness,
  serviceSetupView,
  serviceAccessEvaluator,
} from '../lib/rockstar-service-setup.ts';
import { serviceSetupStore } from '../lib/rockstar-service-setup-store.ts';
import { serviceSetupBilling } from '../lib/rockstar-service-setup-billing.ts';
import {
  createLinuxWorkspace,
  applyLinuxEvent,
  linuxAccess,
  linuxCommand,
  linuxOwnerAccess,
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
void test('provision resumes one persisted canonical workspace after interrupted setup save and SQLite reopen', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'rock-esim-provision-recovery-'));
  const path = join(directory, 'recovery.sqlite');
  const handles = [];
  let permitted = true;
  let failNextSetupSave = false;
  let injectedFailures = 0;
  let networkAttempts = 0;
  const billingCalls = { start: 0, reconcile: 0 };
  t.mock.method(globalThis, 'fetch', () => {
    networkAttempts++;
    throw new Error('External network is forbidden in provision recovery');
  });
  t.after(() => {
    for (const handle of handles) handle.close();
    rmSync(directory, { recursive: true, force: true });
    for (const suffix of ['', '-wal', '-shm', '-journal'])
      assert.equal(existsSync(path + suffix), false);
    assert.equal(existsSync(directory), false);
  });
  function open(migrate) {
    // Reuse the shared file-backed D1 adapter; its billing migrations are not
    // this application's schema, so apply the existing drizzle set only once.
    const handle = new TestD1(path, { migrate: false });
    handles.push(handle);
    if (migrate)
      for (const name of readdirSync(new URL('../drizzle/', import.meta.url))
        .filter((name) => /^\d.*\.sql$/.test(name))
        .sort())
        handle.database.exec(
          readFileSync(new URL('../drizzle/' + name, import.meta.url), 'utf8'),
        );
    const db = {
      prepare(sql) {
        const statement = handle.prepare(sql);
        const wrapped = {
          bind(...values) {
            statement.bind(...values);
            return wrapped;
          },
          first: () => statement.first(),
          all: () => statement.all(),
          async run() {
            if (failNextSetupSave && sql.startsWith('UPDATE rockstar_service_setups SET')) {
              assert.equal(handle.database.prepare(
                "SELECT count(*) AS count FROM sky_linux_service_documents WHERE kind='workspace'",
              ).get().count, 1);
              failNextSetupSave = false;
              injectedFailures++;
              throw new Error('Injected setup save failure after workspace commit');
            }
            return statement.run();
          },
        };
        return wrapped;
      },
      batch: (statements) => handle.batch(statements),
    };
    const grant = async (_db, _config, owner, order) =>
      permitted && owner === 'owner' && order === 'order'
        ? {
            ownerUserId: owner,
            orderId: order,
            deviceRef: 'pixel-fixture',
            expiresAt: now + 86400000,
            scopes: ['rockstaros_access', 'sky', 'zema', 'agents'],
          }
        : null;
    const linux = linuxServiceStore(db, config, { grant });
    const store = serviceSetupStore(db, config, {
      grant,
      linux,
      billing: () => ({
        start: async () => {
          billingCalls.start++;
          return { sessionId: 'cs_test_Fixture', url: 'https://example.com/fixture-only' };
        },
        reconcile: async () => {
          billingCalls.reconcile++;
          return { setupIntentId: 'seti_Fixture', paymentMethodId: 'pm_Fixture' };
        },
      }),
    });
    const snapshot = () => JSON.stringify([
      'rockstar_service_setups', 'sky_linux_service_documents',
      'sky_linux_service_receipts', 'work_jobs',
    ].map((table) => handle.database.prepare(`SELECT * FROM ${table} ORDER BY id`).all()));
    const assertUnstarted = async () => {
      const workspace = await linux.get('owner');
      assert.equal(workspace.payload.serviceStartAt, null);
      assert.equal(workspace.payload.serviceWindows.length, 0);
      assert.equal(workspace.payload.jobs.length, 0);
      assert.equal(workspace.payload.invoices.length, 0);
      assert.equal(handle.database.prepare('SELECT count(*) AS count FROM work_jobs').get().count, 0);
      assert.equal(handle.database.prepare('SELECT count(*) AS count FROM sky_linux_service_receipts').get().count, 0);
      const view = await store.view('owner', now + 1000);
      assert.equal(view.access.canOpenSkyEve, false);
      assert.equal(view.access.paymentCollected, false);
      assert.equal(view.access.initialChargeMinor, 0);
      return workspace;
    };
    return { handle, store, linux, snapshot, assertUnstarted };
  }

  let opened = open(true);
  let setup = await opened.store.draft('owner', 'order', now);
  setup = await opened.store.accept('owner', setup.revision, {
    quoteDigest: setup.payload.quoteDigest, accepted: true, recurringAccepted: true,
  }, now);
  setup = (await opened.store.startBilling('owner', setup.revision, now)).setup;
  setup = await opened.store.reconcileBilling('owner', setup.revision, now);
  const acceptedSetup = structuredClone(setup);
  assert.deepEqual(billingCalls, { start: 1, reconcile: 1 });
  failNextSetupSave = true;
  await assert.rejects(
    opened.store.provision('owner', setup.revision, now),
    /Injected setup save failure after workspace commit/,
  );
  assert.equal(injectedFailures, 1);
  assert.deepEqual(await opened.store.get('owner'), acceptedSetup);
  const originalWorkspace = await opened.assertUnstarted();
  const interruptedSnapshot = opened.snapshot();

  // Discard both product store instances and the actual SQLite connection.
  // The second connection must discover the durable row, not a Linux mock.
  opened.handle.close();
  assert.equal(opened.handle.closed, true);
  opened = open(false);
  assert.equal(opened.snapshot(), interruptedSnapshot);
  assert.deepEqual(await opened.linux.get('owner'), originalWorkspace);
  const resumed = await opened.store.provision('owner', setup.revision, now + 1000);
  assert.equal(resumed.id, acceptedSetup.id);
  assert.equal(resumed.payload.id, acceptedSetup.payload.id);
  assert.equal(resumed.payload.runtime.challenge, acceptedSetup.payload.runtime.challenge);
  assert.equal(resumed.payload.agreementDigest, acceptedSetup.payload.agreementDigest);
  assert.equal(resumed.revision, acceptedSetup.revision + 1);
  assert.equal(resumed.payload.workspaceId, originalWorkspace.payload.id);
  assert.equal(resumed.payload.runtime.requestedAt, now + 1000);
  assert.deepEqual(await opened.assertUnstarted(), originalWorkspace);
  assert.equal(opened.handle.database.prepare(
    "SELECT count(*) AS count FROM sky_linux_service_documents WHERE kind='workspace'",
  ).get().count, 1);
  assert.equal(opened.handle.database.prepare('SELECT count(*) AS count FROM rockstar_service_setups').get().count, 1);
  const recoveredSnapshot = opened.snapshot();
  assert.deepEqual(await opened.store.provision('owner', resumed.revision, now + 2000), resumed);
  assert.equal(opened.snapshot(), recoveredSnapshot);

  await assert.rejects(opened.store.provision('owner', acceptedSetup.revision, now + 2000), /再読み込み/);
  await assert.rejects(opened.store.provision('another-owner', resumed.revision, now + 2000), /再読み込み/);
  assert.equal(await opened.store.get('another-owner'), null);
  assert.equal(await opened.linux.get('another-owner'), null);
  assert.equal(opened.snapshot(), recoveredSnapshot);
  permitted = false;
  await assert.rejects(opened.store.provision('owner', resumed.revision, now + 2000), /利用権/);
  await assert.rejects(opened.store.runtimeReady('owner', {
    schema: 'sky.linux-worker-request/1', action: 'setup-ready',
    workspaceId: originalWorkspace.payload.id, issuedAt: now + 2000,
    contractDigest: originalWorkspace.payload.contractDigest,
    setupChallenge: resumed.payload.runtime.challenge, probeSha256: sha,
  }, { keyId: 'fixture-only' }, now + 2000), /利用権/);
  assert.equal(opened.snapshot(), recoveredSnapshot);
  assert.deepEqual(await opened.assertUnstarted(), originalWorkspace);
  assert.deepEqual(billingCalls, { start: 1, reconcile: 1 });
  assert.equal(networkAttempts, 0);
  assert.equal(injectedFailures, 1);
});

void test('ready activation resumes once after its receipt is saved and SQLite is reopened', async (t) => {
  const now = Date.now();
  const directory = mkdtempSync(join(tmpdir(), 'rock-esim-ready-recovery-'));
  const path = join(directory, 'ready.sqlite');
  const handles = [];
  const readyAt = now + 1000;
  const recoveredAt = now + 4000;
  const grantExpiresAt = now + 20000;
  let permitted = true;
  let failNextActivation = false;
  let faultCount = 0;
  let activationCommits = 0;
  let expectedReceiptDigest = null;
  let networkAttempts = 0;
  const billingCalls = { start: 0, reconcile: 0 };
  t.mock.method(globalThis, 'fetch', () => {
    networkAttempts++;
    throw new Error('External network is forbidden in ready recovery');
  });
  t.after(() => {
    for (const handle of handles) handle.close();
    rmSync(directory, { recursive: true, force: true });
    for (const suffix of ['', '-wal', '-shm', '-journal'])
      assert.equal(existsSync(path + suffix), false);
    assert.equal(existsSync(directory), false);
  });
  function open(migrate) {
    const db = new TestD1(path, { migrate: false });
    handles.push(db);
    if (migrate)
      for (const name of readdirSync(new URL('../drizzle/', import.meta.url))
        .filter((name) => /^\d.*\.sql$/.test(name)).sort())
        db.database.exec(readFileSync(new URL('../drizzle/' + name, import.meta.url), 'utf8'));
    const workspaceRow = () => db.database.prepare(
      "SELECT * FROM sky_linux_service_documents WHERE owner_user_id='owner' AND kind='workspace'",
    ).get();
    db.hooks.beforeBatch = () => {
      if (!failNextActivation) return;
      const saved = JSON.parse(db.database.prepare(
        "SELECT payload FROM rockstar_service_setups WHERE owner_user_id='owner'",
      ).get().payload);
      assert.equal(saved.runtime.verifiedAt, readyAt);
      assert.equal(saved.runtime.receiptDigest, expectedReceiptDigest);
      const workspace = JSON.parse(workspaceRow().payload);
      assert.equal(workspace.serviceStartAt, null);
      assert.equal(workspace.serviceWindows.length, 0);
      failNextActivation = false;
      faultCount++;
      throw new Error('Injected activation failure after ready receipt commit');
    };
    db.hooks.afterCommit = () => {
      if (JSON.parse(workspaceRow().payload).serviceStartAt !== null)
        activationCommits++;
    };
    const grant = async (_db, _config, owner, order, at) =>
      permitted && at < grantExpiresAt && owner === 'owner' && order === 'order'
        ? {
            ownerUserId: owner, orderId: order, deviceRef: 'pixel-fixture',
            expiresAt: grantExpiresAt, scopes: ['rockstaros_access', 'sky', 'zema', 'agents'],
          }
        : null;
    const linux = linuxServiceStore(db, config, { grant });
    const store = serviceSetupStore(db, config, {
      grant, linux,
      billing: () => ({
        start: async () => {
          billingCalls.start++;
          return { sessionId: 'cs_test_Fixture', url: 'https://example.com/fixture-only' };
        },
        reconcile: async () => {
          billingCalls.reconcile++;
          return { setupIntentId: 'seti_Fixture', paymentMethodId: 'pm_Fixture' };
        },
      }),
    });
    const snapshot = () => JSON.stringify([
      'rockstar_service_setups', 'sky_linux_service_documents',
      'sky_linux_service_receipts', 'work_jobs',
    ].map((table) => db.database.prepare(`SELECT * FROM ${table} ORDER BY id`).all()));
    return { db, linux, store, workspaceRow, snapshot };
  }

  let opened = open(true);
  let setup = await opened.store.draft('owner', 'order', now);
  setup = await opened.store.accept('owner', setup.revision, {
    quoteDigest: setup.payload.quoteDigest, accepted: true, recurringAccepted: true,
  }, now);
  setup = (await opened.store.startBilling('owner', setup.revision, now)).setup;
  setup = await opened.store.reconcileBilling('owner', setup.revision, now);
  setup = await opened.store.provision('owner', setup.revision, now);
  const workspace = await opened.linux.get('owner');
  // Controlled issuer fixture, not a real signed issuer or worker HTTP receipt.
  await opened.linux.event({
    schema: 'sky.linux-event/1', id: 'fixture-ready-issuer',
    workspaceId: workspace.payload.id, issuedAt: now, kind: 'issuer',
    payload: {
      sequence: 1, orderId: 'order', deviceRef: 'pixel-fixture',
      state: 'active', validUntil: now + 86400000,
    },
  }, now, { keyId: 'fixture-only' });
  const unstartedWorkspace = await opened.linux.get('owner');
  const request = {
    schema: 'sky.linux-worker-request/1', action: 'setup-ready',
    workspaceId: workspace.payload.id, issuedAt: readyAt,
    contractDigest: workspace.payload.contractDigest,
    setupChallenge: setup.payload.runtime.challenge, probeSha256: sha,
  };
  const proof = { keyId: 'fixture-only' };
  expectedReceiptDigest = createHash('sha256').update(JSON.stringify({ request, proof })).digest('hex');
  failNextActivation = true;
  await assert.rejects(opened.store.runtimeReady('owner', request, proof, readyAt),
    /Injected activation failure after ready receipt commit/);
  assert.equal(faultCount, 1);
  assert.equal(activationCommits, 0);
  const savedReady = await opened.store.get('owner');
  assert.equal(savedReady.revision, setup.revision + 1);
  assert.equal(savedReady.payload.runtime.verifiedAt, readyAt);
  assert.equal(savedReady.payload.runtime.receiptDigest, expectedReceiptDigest);
  assert.deepEqual(await opened.linux.get('owner'), unstartedWorkspace);
  assert.equal((await opened.store.view('owner', readyAt)).access.canOpenSkyEve, false);
  const interruptedSnapshot = opened.snapshot();
  opened.db.close();
  assert.equal(opened.db.closed, true);
  opened = open(false);
  assert.equal(opened.snapshot(), interruptedSnapshot);
  assert.deepEqual(await opened.store.get('owner'), savedReady);

  await assert.rejects(opened.store.runtimeReady('owner', {
    ...request, setupChallenge: 'wrong-challenge',
  }, proof, recoveredAt), /準備証拠/);
  assert.equal(opened.snapshot(), interruptedSnapshot);
  assert.equal(activationCommits, 0);
  await assert.rejects(opened.store.runtimeReady('owner', {
    ...request, workspaceId: 'another-workspace',
  }, proof, recoveredAt), /準備証拠/);
  assert.equal(opened.snapshot(), interruptedSnapshot);
  assert.equal(activationCommits, 0);
  await assert.rejects(opened.store.runtimeReady('another-owner', request, proof, recoveredAt), /準備証拠/);
  assert.equal(opened.snapshot(), interruptedSnapshot);
  assert.equal(activationCommits, 0);
  permitted = false;
  await assert.rejects(opened.store.runtimeReady('owner', request, proof, recoveredAt), /利用権/);
  assert.equal(opened.snapshot(), interruptedSnapshot);
  assert.equal(activationCommits, 0);
  permitted = true;
  assert.deepEqual(await opened.store.runtimeReady('owner', request, proof, recoveredAt), savedReady);
  const activated = await opened.linux.get('owner');
  assert.equal(activated.id, unstartedWorkspace.id);
  assert.equal(activated.payload.id, unstartedWorkspace.payload.id);
  assert.equal(activated.revision, unstartedWorkspace.revision + 1);
  assert.equal(activated.payload.serviceStartAt, recoveredAt);
  assert.deepEqual(activated.payload.serviceWindows, [{ start: recoveredAt, end: null }]);
  assert.equal(activationCommits, 1);
  const view = await opened.store.view('owner', recoveredAt);
  assert.equal(view.access.canOpenSkyEve, true);
  assert.equal(view.access.paymentCollected, false);
  assert.equal(view.access.initialChargeMinor, 0);
  assert.equal(activated.payload.jobs.length, 0);
  assert.equal(activated.payload.invoices.length, 0);
  const activatedSnapshot = opened.snapshot();
  assert.deepEqual(await opened.store.runtimeReady('owner', request, proof, now + 5000), savedReady);
  assert.equal(opened.snapshot(), activatedSnapshot);
  // Advance past expiry rather than freezing or weakening the grant's clock.
  await assert.rejects(opened.store.runtimeReady('owner', request, proof, grantExpiresAt + 1), /利用権/);
  assert.equal(opened.snapshot(), activatedSnapshot);
  assert.equal(activationCommits, 1);
  assert.equal(faultCount, 1);
  assert.equal(opened.db.database.prepare('SELECT count(*) AS count FROM work_jobs').get().count, 0);
  assert.equal(opened.db.database.prepare('SELECT count(*) AS count FROM rockstar_service_setups').get().count, 1);
  assert.equal(opened.db.database.prepare(
    "SELECT count(*) AS count FROM sky_linux_service_documents WHERE kind='workspace'",
  ).get().count, 1);
  assert.equal(opened.db.database.prepare('SELECT count(*) AS count FROM sky_linux_service_receipts').get().count, 1);
  assert.deepEqual(billingCalls, { start: 1, reconcile: 1 });
  assert.equal(networkAttempts, 0);
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

// ESIM-01: real synthetic signatures; mutable server readback, no client facts.
async function accessFixture() {
  const keys = await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']);
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', keys.publicKey));
  const { serviceAttachmentSigningBytes } = await import('../lib/rockstar-service-attachment.ts');
  const request = { ownerId: 'owner', workspaceId: 'workspace',
    deviceKeyThumbprint: sha, requiredScope: 'sky', requestDigest: 'b'.repeat(64) };
  const facts = { ownerAuthenticated: true, deviceApproved: true, deviceProofVerified: true,
    deviceRevoked: false, contractStatus: 'active', issuerProfileActive: true,
    ownerRef: 'owner', contractId: 'contract', contractVersion: terms.version,
    workspaceId: 'workspace', deviceKeyThumbprint: sha, parentEntitlementId: 'entitlement',
    parentEntitlementEpoch: 7, audience: 'broker', allowedScopes: ['sky'], requiredScope: 'sky',
    capabilityProfileHash: sha, manifestHash: sha };
  const unsigned = { schema: 'rockstar.service-attachment/1', issuerId: 'issuer', keyId: 'key',
    attachmentId: 'child', ownerRef: 'owner', contractId: 'contract', contractVersion: terms.version,
    workspaceId: 'workspace', deviceKeyThumbprint: sha, parentEntitlementId: 'entitlement',
    parentEntitlementEpoch: 7, scope: ['sky'], capabilityProfileHash: sha, manifestHash: sha,
    audience: 'broker', issuedAt: now, expiresAt: now + 60_000, nonce: 'nonce' };
  const signature = Buffer.from(await crypto.subtle.sign(
    'Ed25519', keys.privateKey, serviceAttachmentSigningBytes(unsigned),
  )).toString('base64url');
  let setup = await createServiceSetup('owner', 'order', 'parent-device', terms, now);
  setup = await acceptServiceSetup(setup, setup.quoteDigest, true, true, now);
  setup.workspaceId = 'workspace';
  setup.billing.verifiedAt = now;
  setup.runtime.verifiedAt = now;
  setup.runtime.receiptDigest = sha;
  const snapshot = { schema: 'rockstar.service-access-authorities/1', revision: 1,
    observedAt: now, validUntil: now + 30_000, ownerId: 'owner', workspaceId: 'workspace',
    telecom: 'offline', profile: 'not_required', client: 'supported', setup,
    setupFacts: { readiness: serviceSetupReadiness(config), currentGrant: true,
      workspaceMatches: true, linuxCanExecute: true, linuxReason: null },
    attachment: { ...unsigned, signature }, attachmentFacts: facts,
    agreementDigest: setup.agreementDigest, payment: 'current', pricePolicy: 'resolved',
    budget: { state: 'reserved', requestDigest: request.requestDigest },
    retained: { ownerId: 'owner', workspaceId: 'workspace', read: true, export: true } };
  return { request, snapshot, resolveKey: async () => raw };
}

void test('ESIM-01 state product: independent retained access and dispatch eligibility', async (t) => {
  const f = await accessFixture();
  const cases = [
    ['offline eSIM-free child', () => {}, true],
    ['telecom online alone', (s) => { s.telecom = 'online'; s.setup = null; }, false],
    ['purchase or URL only', (s) => { s.attachment = null; }, false],
    ['unverified profile', (s) => { s.profile = 'unknown'; }, false],
    ['paid but runtime unready', (s) => { s.setup.runtime.verifiedAt = null; }, false],
    ['unverified runtime receipt', (s) => { s.setup.runtime.receiptDigest = null; }, false],
    ['Core pending', (s) => { s.setupFacts.readiness.osReady = false; }, false],
    ['module disabled', (s) => { s.setupFacts.readiness.enabled = false; }, false],
    ['old client', (s) => { s.client = 'unsupported'; }, false],
    ['unknown client', (s) => { s.client = 'new_unrecognized_state'; }, false],
    ['unknown payment', (s) => { s.payment = 'paid'; }, false],
    ['unpaid restriction', (s) => { s.payment = 'restricted'; }, false],
    ['unresolved 140 vs 16 policy', (s) => { s.pricePolicy = 'unresolved'; }, false],
    ['old issuer active after revoke', (s) => { s.attachmentFacts.issuerProfileActive = false; }, false],
    ['old signed epoch after restore', (s) => { s.attachmentFacts.parentEntitlementEpoch++; }, false],
    ['child revoked', (s) => { s.attachmentFacts.deviceRevoked = true; }, false],
    ['contract ended', (s) => { s.attachmentFacts.contractStatus = 'ended'; }, false],
    ['changed contract version', (s) => { s.attachmentFacts.contractVersion = 'new'; }, false],
    ['changed consent', (s) => { s.agreementDigest = sha; }, false],
    ['changed manifest', (s) => { s.attachmentFacts.manifestHash = 'c'.repeat(64); }, false],
    ['truthy client-shaped proof', (s) => { s.attachmentFacts.deviceProofVerified = 'true'; }, false],
    ['missing device possession', (s) => { s.attachmentFacts.deviceProofVerified = false; }, false],
    ['attachment without budget', (s) => { s.budget.state = 'unavailable'; }, false],
    ['reservation for another request', (s) => { s.budget.requestDigest = sha; }, false],
    ['no current service grant', (s) => { s.setupFacts.currentGrant = false; }, false],
    ['workspace unready', (s) => { s.setupFacts.workspaceMatches = false; }, false],
    ['Linux restricted', (s) => { s.setupFacts.linuxCanExecute = false; }, false],
    ['future readiness', (s) => { s.setup.runtime.verifiedAt = now + 1; }, false],
  ];
  for (const [name, change, canDispatch] of cases) {
    await t.test(name, async () => {
      const s = structuredClone(f.snapshot); change(s);
      const evaluate = serviceAccessEvaluator({ readCurrent: async () => s, resolveKey: f.resolveKey });
      assert.deepEqual(await evaluate(f.request, now), {
        canDispatch, canRead: true, canExport: true, revision: 1,
      });
    });
  }
});

void test('ESIM-01 absent, stale, foreign and client-supplied authorities fail closed', async () => {
  const f = await accessFixture();
  const denied = { canDispatch: false, canRead: false, canExport: false, revision: null };
  for (const mutate of [
    (s) => { s.schema = 'old-client/0'; },
    (s) => { s.ownerId = 'other'; },
    (s) => { s.workspaceId = 'other'; },
    (s) => { s.attachmentFacts.ownerAuthenticated = false; },
    (s) => { s.validUntil = now; },
    (s) => { s.observedAt = now + 1; },
    (s) => { s.revision = -1; },
  ]) {
    const s = structuredClone(f.snapshot); mutate(s);
    assert.deepEqual(await serviceAccessEvaluator({ readCurrent: async () => s,
      resolveKey: f.resolveKey })(f.request, now), denied);
  }
  for (const readCurrent of [async () => null, async () => { throw Error('unavailable'); }]) {
    const evaluate = serviceAccessEvaluator({ readCurrent, resolveKey: f.resolveKey });
    assert.deepEqual(await evaluate({ ...f.request, currentGrant: true,
      setupFacts: f.snapshot.setupFacts, snapshot: f.snapshot }, now), denied);
  }
  const evaluate = serviceAccessEvaluator({ readCurrent: async () => f.snapshot, resolveKey: f.resolveKey });
  assert.equal((await evaluate({ ...f.request, deviceKeyThumbprint: 'c'.repeat(64) }, now)).canDispatch, false);
  assert.equal((await evaluate({ ...f.request, requiredScope: 'agents' }, now)).canDispatch, false);
  assert.deepEqual(await evaluate({ ...f.request, requestDigest: 'invalid' }, now), denied);
  assert.deepEqual(await evaluate(null, now), denied);
  f.snapshot.retained.read = false;
  f.snapshot.retained.export = false;
  assert.deepEqual(await evaluate(f.request, now), {
    canDispatch: true, canRead: false, canExport: false, revision: 1,
  });
});

void test('ESIM-01 retry and restart re-read current epoch; no cached dispatch permission', async () => {
  const f = await accessFixture();
  let reads = 0;
  const authorities = { readCurrent: async () => { reads++; return structuredClone(f.snapshot); },
    resolveKey: f.resolveKey };
  const evaluate = serviceAccessEvaluator(authorities);
  assert.equal((await evaluate(f.request, now)).canDispatch, true);
  f.snapshot.attachmentFacts.parentEntitlementEpoch++;
  f.snapshot.revision++;
  assert.equal((await evaluate(f.request, now)).canDispatch, false);
  assert.equal((await serviceAccessEvaluator(authorities)(f.request, now)).canDispatch, false);
  assert.equal(reads, 3);
  f.snapshot.validUntil = now + 120_000;
  assert.equal((await evaluate(f.request, now + 60_000)).canDispatch, false);
});

void test('ESIM-01 review regressions: invalid saved setup never dispatches or erases retained access', async (t) => {
  const f = await accessFixture();
  const cases = [
    ['unknown setup schema', (s) => { s.setup.schema = 'rockstar.service-setup/999'; }],
    ['missing setup schema', (s) => { delete s.setup.schema; }],
    ['null setup schema', (s) => { s.setup.schema = null; }],
    ['nonstring setup schema', (s) => { s.setup.schema = 1; }],
    ['legacy setup schema', (s) => { s.setup.schema = 'rockstar.service-setup/0'; }],
    ['missing runtime reviewer counterexample', (s) => { delete s.setup.runtime; }],
    ['null runtime', (s) => { s.setup.runtime = null; }],
    ['malformed runtime', (s) => { s.setup.runtime = 'corrupt'; }],
    ['missing billing', (s) => { delete s.setup.billing; }],
    ['malformed billing', (s) => { s.setup.billing = []; }],
    ['missing terms', (s) => { delete s.setup.terms; }],
    ['malformed terms', (s) => { s.setup.terms = 42; }],
    ['invalid terms schema', (s) => { s.setup.terms.schema = 'unknown/99'; }],
    ['incomplete terms', (s) => { delete s.setup.terms.monthlyCapMinor; }],
    ['missing dispatch facts', (s) => { delete s.setupFacts; }],
    ['missing budget', (s) => { delete s.budget; }],
  ];
  for (const [name, mutate] of cases) {
    await t.test(name, async () => {
      const s = structuredClone(f.snapshot); mutate(s);
      const evaluate = serviceAccessEvaluator({ readCurrent: async () => s, resolveKey: f.resolveKey });
      assert.deepEqual(await evaluate(f.request, now), {
        canDispatch: false, canRead: true, canExport: true, revision: 1,
      });
      s.retained.export = false;
      assert.deepEqual(await evaluate(f.request, now), {
        canDispatch: false, canRead: true, canExport: false, revision: 1,
      });
      s.retained.read = false;
      assert.deepEqual(await evaluate(f.request, now), {
        canDispatch: false, canRead: false, canExport: false, revision: 1,
      });
    });
  }
});

void test('ESIM-01 review regressions: corrupt dispatch cannot grant unknown or foreign retention ACL', async () => {
  const f = await accessFixture();
  const denied = { canDispatch: false, canRead: false, canExport: false, revision: null };
  for (const mutate of [
    (s) => { delete s.retained; },
    (s) => { s.retained = null; },
    (s) => { delete s.attachmentFacts; },
    (s) => { s.attachmentFacts.ownerAuthenticated = false; },
    (s) => { s.ownerId = 'other'; },
    (s) => { s.validUntil = now; },
  ]) {
    const s = structuredClone(f.snapshot); delete s.setup.runtime; mutate(s);
    const evaluate = serviceAccessEvaluator({ readCurrent: async () => s, resolveKey: f.resolveKey });
    assert.deepEqual(await evaluate(f.request, now), denied);
  }
  for (const retained of [
    { ownerId: 'other', workspaceId: 'workspace', read: true, export: true },
    { ownerId: 'owner', workspaceId: 'other', read: true, export: true },
    { ownerId: 'owner', workspaceId: 'workspace', read: 'true', export: 'true' },
    { ownerId: 'owner', workspaceId: 'workspace' },
  ]) {
    const s = structuredClone(f.snapshot); delete s.setup.runtime; s.retained = retained;
    const evaluate = serviceAccessEvaluator({ readCurrent: async () => s, resolveKey: f.resolveKey });
    assert.deepEqual(await evaluate(f.request, now), { ...denied, revision: 1 });
  }
});

void test('runtime owner retention remains independent from unknown dispatch schema and corrupt billing', async () => {
  const workspace = await createLinuxWorkspace('owner', 'device', 'order', terms, 'sandbox', now);
  for (const change of [
    w => { w.schema = 'sky.linux-workspace/999'; },
    w => { delete w.schema; },
    w => { w.invoices = null; },
    w => { w.issuer = null; },
    w => { w.terms = null; },
  ]) {
    const w = structuredClone(workspace); change(w);
    assert.deepEqual(linuxOwnerAccess(w, 'owner', 'owner', now), {
      canRead: true, canExport: true, canExecute: false,
      reason: 'dispatch_schema_unsupported', dataRetained: true,
    });
    await assert.rejects(linuxCommand(w, { action: 'run' }, [], now));
    for (const [owner, recordOwner] of [['', 'owner'], ['other', 'owner'], ['owner', 'other']]) {
      const access = linuxOwnerAccess(w, owner, recordOwner, now);
      assert.equal(access.canRead, false); assert.equal(access.canExport, false); assert.equal(access.canExecute, false);
    }
  }
});

// Shared ESIM-01/04 composition: attachment crypto must not hide other authority changes.
void test('service access rechecks all authority fields after asynchronous signature verification', async (t) => {
  for (const [name, mutate, read, exp] of [
    ['payment restriction', s => { s.payment = 'restricted'; }, true, true],
    ['budget revoked', s => { s.budget.state = 'unavailable'; }, true, true],
    ['setup readiness revoked', s => { s.setupFacts.currentGrant = false; }, true, true],
    ['parent facts replaced', s => { s.attachmentFacts = { ...s.attachmentFacts, parentEntitlementEpoch: 8 }; }, true, true],
    ['retention revoked', s => { s.retained.read = false; s.retained.export = false; }, false, false],
    ['identity revoked', s => { s.attachmentFacts = { ...s.attachmentFacts, ownerAuthenticated: false }; }, false, false],
    ['authority revision changed', s => { s.revision++; }, true, true],
  ]) await t.test(name, async () => {
    const f = await accessFixture();
    const evaluate = serviceAccessEvaluator({ readCurrent: async () => f.snapshot,
      resolveKey: async (...args) => { mutate(f.snapshot); return f.resolveKey(...args); } });
    const result = await evaluate(f.request, now);
    assert.equal(result.canDispatch, false);
    assert.equal(result.canRead, read);
    assert.equal(result.canExport, exp);
  });
});

void test('service access binds the request before the authority read awaits', async () => {
  const f = await accessFixture();
  let release;
  const waiting = new Promise(resolve => { release = resolve; });
  let seen;
  const evaluate = serviceAccessEvaluator({ readCurrent: async request => {
    seen = request; await waiting; return f.snapshot;
  }, resolveKey: f.resolveKey });
  const result = evaluate(f.request, now);
  f.request.requiredScope = 'agents';
  release();
  assert.equal((await result).canDispatch, true);
  assert.equal(seen.requiredScope, 'sky');
  assert.notEqual(seen, f.request);
});

void test('service access keeps its private request separate from adapter-owned arguments', async (t) => {
  await t.test('adapter cannot retarget the entry budget digest', async () => {
    const f = await accessFixture();
    const evaluate = serviceAccessEvaluator({ readCurrent: async request => {
      request.requestDigest = 'f'.repeat(64);
      f.snapshot.budget.requestDigest = request.requestDigest;
      return f.snapshot;
    }, resolveKey: f.resolveKey });
    assert.equal((await evaluate(f.request, now)).canDispatch, false);
    assert.equal(f.request.requestDigest, 'b'.repeat(64));
  });
  await t.test('adapter argument edits during crypto cannot change the private owner', async () => {
    const f = await accessFixture(); let adapterRequest;
    const evaluate = serviceAccessEvaluator({ readCurrent: async request => {
      adapterRequest = request; return f.snapshot;
    }, resolveKey: async (...args) => {
      adapterRequest.ownerId = 'different-owner'; return f.resolveKey(...args);
    } });
    assert.deepEqual(await evaluate(f.request, now), {
      canDispatch: true, canRead: true, canExport: true, revision: 1,
    });
  });
});

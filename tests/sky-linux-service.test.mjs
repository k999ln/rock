import assert from 'node:assert/strict';
import { randomUUID, generateKeyPairSync, sign } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import {
  createLinuxWorkspace,
  makeLinuxListing,
  linuxAccess,
  linuxCommand,
  applyLinuxEvent,
  verifyLinuxEnvelope,
  verifyLinuxWorker,
  linuxMonthTotal,
  linuxPeriod,
  parseLinuxTerms,
  linuxText,
} from '../lib/sky-linux-service.ts';
import { linuxServiceStore } from '../lib/sky-linux-service-store.ts';
import { captureEsimAuthorityReads } from '../lib/esim-cloud-grant.ts';
import { createServiceSetup, acceptServiceSetup } from '../lib/rockstar-service-setup.ts';
import { sha256Hex } from '../lib/rockstar-entitlement-claim.ts';
import { workStore } from '../lib/work-store.ts';
const now = Date.UTC(2026, 9, 1),
  end = Date.UTC(2026, 10, 1),
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
  termsUrl: 'https://example.com/test-only-terms',
};
const model = {
  schema: 'sky.local-model/1',
  id: 'test.model',
  name: 'Fixture model',
  repository: 'test/model',
  revision: 'b'.repeat(40),
  file: 'model.gguf',
  sha256: sha,
  bytes: 1024,
  license: 'MIT',
  promptFormat: 'chatml',
  memoryMiB: 2048,
};
const event = (w, kind, payload, time = now) => ({
  schema: 'sky.linux-event/1',
  id: randomUUID(),
  workspaceId: w.id,
  issuedAt: time,
  kind,
  payload,
});
async function setup() {
  let w = await createLinuxWorkspace(
    'buyer',
    'device',
    'esim-order',
    terms,
    'sandbox',
    now,
  );
  w = await applyLinuxEvent(
    w,
    event(w, 'issuer', {
      sequence: 1,
      orderId: w.orderId,
      deviceRef: w.deviceRef,
      state: 'active',
      validUntil: now + 86400000,
    }),
    now,
  );
  const listing = await makeLinuxListing({
    id: 'creator.agent.v1',
    packageKey: 'test.package@1',
    packageSha256: sha,
    creatorId: 'creator',
    model,
    agent: {
      name: 'Planning',
      instructions: 'Write a plan',
      modelId: model.id,
    },
    authorFeeMinor: 100,
  });
  w = await linuxCommand(
    w,
    { action: 'add', listingId: listing.id },
    [listing],
    now,
  );
  return { w, listing };
}
async function run(w, listing, id = randomUUID()) {
  w = await linuxCommand(
    w,
    {
      action: 'run',
      listingId: listing.id,
      requestId: id,
      input: 'A short plan',
      maximumMinor: 270,
      cpuLimitMs: 170000,
      accepted: true,
    },
    [listing],
    now,
  );
  w = await linuxCommand(
    w,
    { action: 'claim', jobId: id, claimId: 'worker-claim' },
    [listing],
    now,
  );
  const j = w.jobs[0];
  const result = event(w, 'result', {
    jobId: id,
    claimId: j.claimId,
    contractDigest: w.contractDigest,
    listingDigest: listing.digest,
    inputSha256: j.inputSha256,
    outcome: 'succeeded',
    meter: 'linux-wait4-child-cpu/1',
    cpuMs: 2000,
    durationMs: 2500,
    text: 'A real result supplied only by a trusted worker',
  });
  return { w, result, id };
}
void test('registration → Add → job → measured usage → monthly invoice → paid → creator transfer → restriction/recovery preserves all data', async () => {
  const { w: base, listing } = await setup();
  const execution = await run(base, listing);
  let w = execution.w;
  const result = execution.result;
  w = await applyLinuxEvent(w, result, now);
  assert.equal(w.jobs[0].state, 'review');
  assert.equal(w.jobs[0].computeMinor, 1);
  assert.equal(w.jobs[0].authorMinor, 100);
  assert.equal(w.jobs[0].run.job.status, 'review');
  for (let day = 1; day < 31; day++) {
    const time = now + day * 86400000;
    w = await applyLinuxEvent(
      w,
      event(
        w,
        'issuer',
        {
          sequence: day + 1,
          orderId: w.orderId,
          deviceRef: w.deviceRef,
          state: 'active',
          validUntil: time + 86400000,
        },
        time,
      ),
      time,
    );
  }
  w = await linuxCommand(
    w,
    { action: 'close-month', period: '2026-10' },
    [listing],
    end,
  );
  const invoice = w.invoices[0];
  assert.equal(invoice.amountMinor, 1701);
  assert.equal(invoice.allocations[0].payableMinor, 90);
  await assert.rejects(
    applyLinuxEvent(
      w,
      event(
        w,
        'transfer',
        {
          invoiceId: invoice.id,
          creatorId: 'creator',
          amountMinor: 90,
          currency: 'USD',
          paymentRef: 'p',
          transferRef: 't',
        },
        end,
      ),
      end,
    ),
  );
  assert.equal(linuxAccess(w, end + 3 * 86400000).canExecute, false);
  const saved = JSON.stringify(w.jobs);
  w = await applyLinuxEvent(
    w,
    event(
      w,
      'payment',
      {
        invoiceId: invoice.id,
        sequence: 1,
        amountMinor: 1701,
        currency: 'USD',
        state: 'paid',
        paymentRef: 'stripe-paid-reference',
      },
      end,
    ),
    end,
  );
  // Payment does not repair an expired or revoked eSIM entitlement.
  assert.equal(linuxAccess(w, end).canExecute, false);
  w = await applyLinuxEvent(
    w,
    event(
      w,
      'issuer',
      {
        sequence: 32,
        orderId: w.orderId,
        deviceRef: w.deviceRef,
        state: 'active',
        validUntil: end + 86400000,
      },
      end,
    ),
    end,
  );
  assert.equal(linuxAccess(w, end).canExecute, true);
  assert.equal(JSON.stringify(w.jobs), saved);
  w = await applyLinuxEvent(
    w,
    event(
      w,
      'transfer',
      {
        state: 'requested',
        invoiceId: invoice.id,
        creatorId: 'creator',
        amountMinor: 90,
        currency: 'USD',
        paymentRef: 'stripe-paid-reference',
      },
      end,
    ),
    end,
  );
  w = await applyLinuxEvent(
    w,
    event(
      w,
      'transfer',
      {
        invoiceId: invoice.id,
        creatorId: 'creator',
        amountMinor: 90,
        currency: 'USD',
        paymentRef: 'stripe-paid-reference',
        transferRef: 'stripe-transfer-reference',
      },
      end,
    ),
    end,
  );
  assert.equal(
    w.invoices[0].allocations[0].transferRef,
    'stripe-transfer-reference',
  );
  w = await applyLinuxEvent(
    w,
    event(
      w,
      'payment',
      {
        invoiceId: invoice.id,
        sequence: 2,
        amountMinor: 1701,
        currency: 'USD',
        state: 'reversed',
        paymentRef: 'stripe-paid-reference',
      },
      end,
    ),
    end,
  );
  assert.equal(linuxAccess(w, end).canExecute, false);
  assert.equal(w.invoices[0].allocations[0].recoveryRequired, true);
  assert.equal(JSON.stringify(w.jobs), saved);
});
void test('registration cannot smuggle executable commands, unsupported formats or mismatching model ids', async () => {
  const { listing } = await setup();
  await assert.rejects(
    makeLinuxListing({
      ...listing,
      model: { ...model, command: 'curl attacker' },
    }),
  );
  await assert.rejects(
    makeLinuxListing({
      ...listing,
      agent: { ...listing.agent, modelId: 'other' },
    }),
  );
  assert.throws(() => parseLinuxTerms({ ...terms, baseMinor: 1500 }));
  assert.throws(() => parseLinuxTerms({ ...terms, includedCpuMs: 0 }));
  assert.throws(() => parseLinuxTerms({ ...terms, monthlyCapMinor: 1599 }));
});
void test('parallel jobs reserve their worst cost without spending included units twice; same request id cannot change', async () => {
  const { w, listing } = await setup(),
    id = randomUUID(),
    command = {
      action: 'run',
      listingId: listing.id,
      requestId: id,
      input: 'x',
      maximumMinor: 270,
      cpuLimitMs: 170000,
      accepted: true,
    };
  const first = await linuxCommand(w, command, [listing], now);
  assert.equal(linuxMonthTotal(first, '2026-10'), 1870);
  assert.equal(
    (await linuxCommand(first, command, [listing], now)).jobs.length,
    1,
  );
  await assert.rejects(
    linuxCommand(first, { ...command, input: 'changed' }, [listing], now),
  );
  await assert.rejects(
    linuxCommand(
      first,
      { ...command, requestId: randomUUID() },
      [listing],
      now,
    ),
  );
});
void test('cancel then late success accepts only incurred CPU cost and discards the late draft', async () => {
  const { w: base, listing } = await setup();
  const execution = await run(base, listing);
  let w = execution.w;
  const { result, id } = execution;
  w = await linuxCommand(w, { action: 'cancel', jobId: id }, [listing], now);
  w = await applyLinuxEvent(w, result, now);
  assert.equal(w.jobs[0].state, 'cancelled');
  assert.equal(w.jobs[0].authorMinor, 0);
  assert.equal(w.jobs[0].run.text, null);
  assert.equal(w.jobs[0].run.stop, 'confirmed');
});
void test('issuer order/device/sequence and worker leases prevent revoked or replayed execution', async () => {
  const { w, listing } = await setup();
  await assert.rejects(
    applyLinuxEvent(
      w,
      event(w, 'issuer', {
        sequence: 1,
        orderId: 'other',
        deviceRef: 'device',
        state: 'active',
        validUntil: now + 1000,
      }),
      now,
    ),
  );
  const execution = await run(w, listing);
  await assert.rejects(
    linuxCommand(
      execution.w,
      { action: 'heartbeat', jobId: execution.id, claimId: 'worker-claim' },
      [listing],
      now + 31000,
    ),
  );
  const stopped = await applyLinuxEvent(
    execution.w,
    event(w, 'issuer', {
      sequence: 2,
      orderId: w.orderId,
      deviceRef: w.deviceRef,
      state: 'suspended',
      validUntil: now + 1000,
    }),
    now,
  );
  assert.equal(linuxAccess(stopped, now).canExecute, false);
  assert.equal(linuxAccess(stopped, now).canExport, true);
  await assert.rejects(
    linuxCommand(
      stopped,
      { action: 'heartbeat', jobId: execution.id, claimId: 'worker-claim' },
      [listing],
      now,
    ),
  );
  await assert.rejects(
    linuxCommand(
      execution.w,
      { action: 'close-month', period: '2026-10' },
      [listing],
      end,
    ),
  );
});
void test('Ed25519 receipts are mode/role/workspace bound and tampering does not verify', async () => {
  const { w } = await setup(),
    pair = generateKeyPairSync('ed25519');
  const key = {
    id: 'meter',
    role: 'worker',
    mode: 'sandbox',
    workspaceId: w.id,
    publicKey: pair.publicKey
      .export({ format: 'der', type: 'spki' })
      .toString('base64url'),
  };
  const e = event(w, 'result', {}),
    signature = sign(
      null,
      Buffer.from(`sky.linux-event-signature/1:sandbox:${JSON.stringify(e)}`),
      pair.privateKey,
    ).toString('base64url');
  assert.deepEqual(
    await verifyLinuxEnvelope(
      { keyId: key.id, event: e, signature },
      [key],
      'sandbox',
      now,
    ),
    e,
  );
  await assert.rejects(
    verifyLinuxEnvelope(
      { keyId: key.id, event: { ...e, payload: { cpuMs: 0 } }, signature },
      [key],
      'sandbox',
      now,
    ),
  );
  await assert.rejects(
    verifyLinuxEnvelope(
      { keyId: key.id, event: e, signature },
      [key],
      'live',
      now,
    ),
  );
  await assert.rejects(
    verifyLinuxEnvelope(
      { keyId: key.id, event: e, signature },
      [{ ...key, workspaceId: 'another' }],
      'sandbox',
      now,
    ),
  );
  await assert.rejects(
    verifyLinuxEnvelope(
      { keyId: key.id, event: { ...e, kind: 'payment' }, signature },
      [key],
      'sandbox',
      now,
    ),
  );
  const req = {
    schema: 'sky.linux-worker-request/1',
    workspaceId: w.id,
    issuedAt: now,
    action: 'status',
  };
  const sig = sign(
    null,
    Buffer.from(`sky.linux-worker-request/1:live:${JSON.stringify(req)}`),
    pair.privateKey,
  ).toString('base64url');
  assert.equal(
    (
      await verifyLinuxWorker(
        { keyId: 'meter', request: req, signature: sig },
        [{ ...key, mode: 'live', ownerId: 'buyer' }],
        now,
      )
    ).ownerId,
    'buyer',
  );
});
function database(t) {
  const sqlite = new DatabaseSync(':memory:');
  t.after(() => sqlite.close());
  for (const name of readdirSync(new URL('../drizzle/', import.meta.url))
    .filter((n) => n.endsWith('.sql') && !n.startsWith('._'))
    .sort())
    sqlite.exec(
      readFileSync(new URL('../drizzle/' + name, import.meta.url), 'utf8'),
    );
  class Statement {
    constructor(sql, values = []) {
      this.sql = sql;
      this.values = values;
    }
    bind(...v) {
      return new Statement(this.sql, v);
    }
    first() {
      return sqlite.prepare(this.sql).get(...this.values) ?? null;
    }
    all() {
      return { results: sqlite.prepare(this.sql).all(...this.values) };
    }
    run() {
      const s = sqlite.prepare(this.sql);
      if (s.columns().length) {
        const rows = s.all(...this.values);
        return { results: rows, meta: { changes: 0 } };
      }
      const r = s.run(...this.values);
      return { meta: { changes: Number(r.changes) } };
    }
  }
  return {
    sqlite,
    prepare(sql) {
      return new Statement(sql);
    },
    beforeBatch: null,
    async batch(statements) {
      if (this.beforeBatch) { const callback = this.beforeBatch; this.beforeBatch = null; await callback(); }
      sqlite.exec('BEGIN IMMEDIATE');
      try {
        const out = statements.map((s) => s.run());
        sqlite.exec('COMMIT');
        return out;
      } catch (e) {
        sqlite.exec('ROLLBACK');
        throw e;
      }
    },
  };
}
void test('D1 persistence and existing Eve job write are atomic; owner read and evidence IDs cannot cross accounts', async (t) => {
  const db = database(t),
    store = linuxServiceStore(db, {}),
    { w: base, listing } = await setup(),
    execution = await run(base, listing),
    w = execution.w;
  const key = 'workspace:fixture';
  db.sqlite
    .prepare(
      `INSERT INTO sky_linux_service_documents VALUES(?,?,'workspace',0,?,?)`,
    )
    .run(key, w.ownerId, JSON.stringify(w), now);
  const j = w.jobs[0];
  await workStore(db).create(w.ownerId, j.run.job);
  const saved = await store.event(execution.result, now);
  assert.equal(saved.revision, 1);
  assert.equal((await workStore(db).get('buyer', j.id)).status, 'review');
  assert.equal(await workStore(db).get('other-buyer', j.id), null);
  assert.equal((await store.event(execution.result, now)).revision, 1);
  await assert.rejects(
    store.event(
      {
        ...execution.result,
        payload: { ...execution.result.payload, text: 'tampered' },
      },
      now,
    ),
  );
  const execution2 = await run(base, listing);
  const w2 = { ...execution2.w, id: w.id };
  db.sqlite
    .prepare('UPDATE sky_linux_service_documents SET payload=? WHERE id=?')
    .run(JSON.stringify(w2), key);
  await workStore(db).create('other-owner', w2.jobs[0].run.job);
  await assert.rejects(
    store.event({ ...execution2.result, workspaceId: w.id }, now),
  );
  assert.equal(
    db.sqlite
      .prepare('SELECT revision FROM sky_linux_service_documents WHERE id=?')
      .get(key).revision,
    1,
  );
  assert.equal(
    db.sqlite
      .prepare('SELECT count(*) AS n FROM sky_linux_service_receipts')
      .get().n,
    1,
  );
});

void test('text validation rejects the original control range and retains ordinary Japanese whitespace', () => {
  for (let code = 0; code < 32; code++) {
    const value = '依頼' + String.fromCharCode(code) + '本文';
    if ([9, 10, 13].includes(code)) assert.equal(linuxText(value), value);
    else assert.throws(() => linuxText(value), /入力の形式/);
  }
  assert.equal(linuxText('日本語の依頼 😀'), '日本語の依頼 😀');
});


// A trusted synthetic issuer adapter reads existing main documents through the
// same read-set DB as the real resolver. No provider or browser facts are used.
async function runtimeAuthorityFixture(t) {
  const db = database(t), { w, listing } = await setup(), stamp = Date.now();
  w.issuer.validUntil = stamp + 60_000;
  w.serviceStartAt = stamp - 1;
  const key = `workspace:${await sha256Hex(w.ownerId)}`;
  const insert = (id, kind, payload, owner = w.ownerId) => db.sqlite.prepare(
    'INSERT INTO sky_linux_service_documents VALUES(?,?,?,0,?,?)',
  ).run(id, owner, kind, JSON.stringify(payload), stamp);
  insert(key, 'workspace', w);
  insert('listing:' + listing.id, 'listing', listing);
  insert('review:' + listing.id, 'review', { listingId: listing.id, digest: listing.digest,
    decision: 'approved', expiresAt: stamp + 60_000, reviewerId: 'buyer', reviewedAt: stamp });
  insert('fixture-authority', 'review', { state: 'active', profile: 'installed', key: 'current',
    deviceRef: w.deviceRef, receiptSha256: sha, scopes: ['agents'], expiresAt: stamp + 60_000 });
  db.sqlite.prepare(`INSERT INTO sky_tool_packages
    (package_key,tool_id,version,user_id,manifest,manifest_sha256,status,created_at,updated_at,published_at)
    VALUES(?, 'fixture', '1', 'creator', '{}', ?, 'verified', ?, ?, ?)`)
    .run(listing.packageKey, listing.packageSha256, stamp, stamp, stamp);
  db.sqlite.prepare(`INSERT INTO sky_tool_package_reviews
    (id,package_key,manifest_sha256,reviewer_id,decision,checks_json,evidence_json,notes,reviewed_at,expires_at)
    VALUES('package-review',?,?,'reviewer','verified','{}','{}','fixture',?,?)`)
    .run(listing.packageKey, listing.packageSha256, stamp, stamp + 60_000);
  let setupDoc = await createServiceSetup(w.ownerId, w.orderId, w.deviceRef, terms, stamp);
  setupDoc = await acceptServiceSetup(setupDoc, setupDoc.quoteDigest, true, true, stamp);
  setupDoc.workspaceId = w.id;
  setupDoc.billing.verifiedAt = stamp;
  setupDoc.runtime.verifiedAt = stamp;
  setupDoc.runtime.receiptDigest = sha;
  db.sqlite.prepare('INSERT INTO rockstar_service_setups VALUES(?,?,0,?,?)')
    .run('setup', w.ownerId, JSON.stringify(setupDoc), stamp);
  const config = { SKY_LINUX_SERVICE_ENABLED: 'true', ROCKSTAR_SERVICE_SETUP_ENABLED: 'true',
    ROCKSTAR_OS_SERVICE_ACCEPTANCE_JSON: JSON.stringify({ schema: 'rockstar.os-service-acceptance/1',
      model: 'Pixel 10', sku: 'GL066', codename: 'frankel', status: 'accepted', buildId: 'fixture',
      evidenceSha256: sha, capabilities: ['owner_auth', 'entitlement', 'permissions_budget',
        'private_storage_recovery', 'sky_eve_entry'] }) };
  const dependencies = { grant: async (readDb, _config, owner, order, at) => {
    const row = await readDb.prepare(`SELECT payload FROM sky_linux_service_documents
      WHERE id='fixture-authority' AND owner_user_id=? AND kind='review'`).bind(owner).first();
    const g = row ? JSON.parse(row.payload) : null;
    if (!g || g.state !== 'active' || g.profile !== 'installed' || g.key !== 'current' || g.expiresAt <= at) return null;
    return { ...g, ownerUserId: owner, orderId: order, starterAgentPack: { packages: [] } };
  } };
  const store = linuxServiceStore(db, config, dependencies);
  const command = { action: 'run', requestId: randomUUID(), listingId: listing.id,
    input: 'fixture request', maximumMinor: 120, cpuLimitMs: 1000, accepted: true };
  const edit = (table, id, mutate) => {
    const row = db.sqlite.prepare(`SELECT payload FROM ${table} WHERE id=?`).get(id);
    const payload = JSON.parse(row.payload); mutate(payload);
    db.sqlite.prepare(`UPDATE ${table} SET payload=? WHERE id=?`).run(JSON.stringify(payload), id);
  };
  return { db, store, config, w, listing, key, stamp, command, edit };
}

async function activationAuthorityFixture(t) {
  const f = await runtimeAuthorityFixture(t);
  f.edit('sky_linux_service_documents', f.key, w => {
    w.serviceStartAt = null;
    w.serviceWindows = [];
  });
  const setup = JSON.parse(f.db.sqlite.prepare(
    "SELECT payload FROM rockstar_service_setups WHERE id='setup'",
  ).get().payload);
  const snapshot = () => JSON.stringify([
    'rockstar_service_setups', 'sky_linux_service_documents',
    'sky_linux_service_receipts', 'work_jobs',
  ].map(table => f.db.sqlite.prepare(`SELECT * FROM ${table} ORDER BY id`).all()));
  return { ...f, setupId: setup.id, snapshot };
}

void test('setup activation commit denies authority changes after its current read', async t => {
  const cases = [
    ['grant revoked', f => f.edit('sky_linux_service_documents', 'fixture-authority', g => { g.state = 'revoked'; })],
    ['billing readiness revoked', f => f.edit('rockstar_service_setups', 'setup', s => { s.billing.verifiedAt = null; })],
    ['ready receipt revoked', f => f.edit('rockstar_service_setups', 'setup', s => { s.runtime.verifiedAt = null; })],
    ['grant expires during commit delay', null, 'grant'],
    ['issuer window expires during commit delay', null, 'issuer'],
  ];
  for (const [name, mutate, expiryKind] of cases) await t.test(name, async child => {
    const f = await activationAuthorityFixture(child);
    let expiresAt;
    if (expiryKind) {
      expiresAt = Date.now() + 100;
      if (expiryKind === 'grant')
        f.edit('sky_linux_service_documents', 'fixture-authority', g => { g.expiresAt = expiresAt; });
      else
        f.edit('sky_linux_service_documents', f.key, w => { w.issuer.validUntil = expiresAt; });
    }
    const before = f.db.sqlite.prepare('SELECT * FROM sky_linux_service_documents WHERE id=?').get(f.key);
    let attackedSnapshot;
    let interleavings = 0;
    f.db.beforeBatch = async () => {
      interleavings++;
      if (mutate) mutate(f);
      if (expiryKind) {
        await new Promise(resolve => setTimeout(resolve, Math.max(0, expiresAt - Date.now() + 15)));
        assert.ok(Date.now() > expiresAt);
      }
      attackedSnapshot = f.snapshot();
    };
    let rejected;
    try {
      await f.store.activateSetup('buyer', f.setupId, f.w.id, f.stamp);
    } catch (error) {
      rejected = error;
    }
    const after = f.db.sqlite.prepare('SELECT * FROM sky_linux_service_documents WHERE id=?').get(f.key);
    const payload = JSON.parse(after.payload);
    child.diagnostic(JSON.stringify({
      case: name, rejected: rejected instanceof Error, interleavings,
      serviceStartAt: payload.serviceStartAt, serviceWindowCount: payload.serviceWindows.length,
    }));
    assert.equal(interleavings, 1);
    assert.ok(rejected instanceof Error, 'activation must reject a stale commit authority');
    assert.deepEqual(after, before);
    assert.equal(f.snapshot(), attackedSnapshot);
    assert.equal(payload.serviceStartAt, null);
    assert.equal(payload.serviceWindows.length, 0);
    assert.equal(f.db.sqlite.prepare('SELECT count(*) AS count FROM work_jobs').get().count, 0);
    assert.equal(f.db.sqlite.prepare('SELECT count(*) AS count FROM sky_linux_service_receipts').get().count, 0);
    // Recovery is a fresh authoritative repair, never a bypass of the fence.
    f.edit('sky_linux_service_documents', 'fixture-authority', g => {
      g.state = 'active';
      g.expiresAt = Date.now() + 60000;
    });
    f.edit('rockstar_service_setups', 'setup', s => {
      s.billing.verifiedAt = f.stamp;
      s.runtime.verifiedAt = f.stamp;
    });
    f.edit('sky_linux_service_documents', f.key, w => { w.issuer.validUntil = Date.now() + 60000; });
    const recoveredAt = Date.now();
    const recovered = await f.store.activateSetup('buyer', f.setupId, f.w.id, recoveredAt);
    assert.equal(recovered.id, before.id);
    assert.equal(recovered.payload.id, f.w.id);
    assert.equal(recovered.payload.serviceStartAt, recoveredAt);
    assert.deepEqual(recovered.payload.serviceWindows, [{ start: recoveredAt, end: null }]);
    const recoveredSnapshot = f.snapshot();
    await f.store.activateSetup('buyer', f.setupId, f.w.id, Date.now());
    assert.equal(f.snapshot(), recoveredSnapshot);
  });
});

void test('setup activation with current authority starts once and exact retry preserves its window', async t => {
  const f = await activationAuthorityFixture(t);
  const started = await f.store.activateSetup('buyer', f.setupId, f.w.id, f.stamp);
  assert.equal(started.payload.serviceStartAt, f.stamp);
  assert.deepEqual(started.payload.serviceWindows, [{ start: f.stamp, end: null }]);
  const snapshot = f.snapshot();
  const retry = await f.store.activateSetup('buyer', f.setupId, f.w.id, f.stamp + 1);
  assert.deepEqual(retry, started);
  assert.equal(f.snapshot(), snapshot);
  assert.equal(started.payload.jobs.length, 0);
  assert.equal(started.payload.invoices.length, 0);
});

void test('atomic runtime authority: normal reserve, exact retry, metered settle, cancel and revoke preserve existing ledger', async t => {
  const f = await runtimeAuthorityFixture(t);
  const saved = await f.store.command('buyer', 0, f.command, f.stamp);
  assert.equal(saved.payload.jobs.length, 1);
  assert.equal(saved.payload.jobs[0].reservedMinor, 120);
  assert.equal(linuxMonthTotal(saved.payload, linuxPeriod(f.stamp)), terms.baseMinor + 120);
  const retry = await f.store.command('buyer', saved.revision, f.command, f.stamp);
  assert.equal(retry.revision, saved.revision);
  assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM work_jobs').get().n, 1);
  await assert.rejects(f.store.command('buyer', saved.revision, { ...f.command, input: 'changed' }, f.stamp));
  const claimed = await f.store.command('buyer', saved.revision,
    { action: 'claim', jobId: f.command.requestId, claimId: 'claim' }, f.stamp, true);
  const revoked = await f.store.event(event(claimed.payload, 'issuer', {
    sequence: 2, orderId: f.w.orderId, deviceRef: f.w.deviceRef,
    state: 'suspended', validUntil: f.stamp,
  }, f.stamp), f.stamp);
  await assert.rejects(f.store.command('buyer', revoked.revision,
    { action: 'heartbeat', jobId: f.command.requestId, claimId: 'claim' }, f.stamp, true));
  const cancelled = await f.store.command('buyer', revoked.revision,
    { action: 'cancel', jobId: f.command.requestId }, f.stamp);
  assert.equal(linuxMonthTotal(cancelled.payload, linuxPeriod(f.stamp)), terms.baseMinor + 120);
  const job = cancelled.payload.jobs[0];
  const result = event(cancelled.payload, 'result', { jobId: job.id, claimId: job.claimId,
    contractDigest: f.w.contractDigest, listingDigest: f.listing.digest, inputSha256: job.inputSha256,
    outcome: 'succeeded', meter: 'linux-wait4-child-cpu/1', cpuMs: 1000, durationMs: 1000, text: 'late' }, f.stamp);
  const settled = await f.store.event(result, f.stamp);
  assert.equal(settled.payload.jobs[0].authorMinor, 0);
  assert.equal(settled.payload.jobs[0].state, 'cancelled');
  assert.ok(linuxMonthTotal(settled.payload, linuxPeriod(f.stamp)) < terms.baseMinor + 120);
  assert.equal((await f.store.event(result, f.stamp)).revision, settled.revision);
  await assert.rejects(f.store.event({ ...result, payload: { ...result.payload, cpuMs: 999 } }, f.stamp));
  assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM sky_linux_service_receipts').get().n, 2);
});

void test('atomic runtime authority: interleavings rollback all job, reservation, lease and receipt writes', async t => {
  const cases = [
    ['issuer epoch without revision', f => f.edit('sky_linux_service_documents', f.key, w => { w.epoch++; })],
    ['contract digest', f => f.edit('sky_linux_service_documents', f.key, w => { w.contractDigest = 'b'.repeat(64); })],
    ['revision', f => f.db.sqlite.prepare('UPDATE sky_linux_service_documents SET revision=revision+1 WHERE id=?').run(f.key)],
    ['foreign workspace row', f => f.db.sqlite.prepare("UPDATE sky_linux_service_documents SET owner_user_id='other' WHERE id=?").run(f.key)],
    ['grant refunded/revoked', f => f.edit('sky_linux_service_documents', 'fixture-authority', g => { g.state = 'revoked'; })],
    ['profile replaced', f => f.edit('sky_linux_service_documents', 'fixture-authority', g => { g.profile = 'unknown'; })],
    ['device key revoked', f => f.edit('sky_linux_service_documents', 'fixture-authority', g => { g.key = 'revoked'; })],
    ['scope removed', f => f.edit('sky_linux_service_documents', 'fixture-authority', g => { g.scopes = []; })],
    ['setup current version', f => f.edit('rockstar_service_setups', 'setup', s => { s.schema = 'unknown'; })],
    ['setup agreement', f => f.edit('rockstar_service_setups', 'setup', s => { s.agreementDigest = 'b'.repeat(64); })],
    ['payment readiness', f => f.edit('rockstar_service_setups', 'setup', s => { s.billing.verifiedAt = null; })],
    ['runtime readiness', f => f.edit('rockstar_service_setups', 'setup', s => { s.runtime = null; })],
    ['listing replaced', f => f.edit('sky_linux_service_documents', 'listing:' + f.listing.id, l => { l.active = false; })],
    ['listing review revoked', f => f.edit('sky_linux_service_documents', 'review:' + f.listing.id, r => { r.decision = 'revoked'; })],
    ['package revoked', f => f.db.sqlite.prepare("UPDATE sky_tool_packages SET status='revoked' WHERE package_key=?").run(f.listing.packageKey)],
    ['new negative review row', f => f.db.sqlite.prepare(`INSERT INTO sky_linux_service_documents VALUES('new-review','buyer','review',0,?,?)`)
      .run(JSON.stringify({ listingId: f.listing.id, digest: f.listing.digest, decision: 'revoked', expiresAt: f.stamp + 60_000 }), f.stamp)],
  ];
  for (const [name, mutate] of cases) await t.test(name, async child => {
    const f = await runtimeAuthorityFixture(child); let attacked;
    f.db.beforeBatch = () => { mutate(f); attacked = f.db.sqlite.prepare('SELECT * FROM sky_linux_service_documents WHERE id=?').get(f.key); };
    await assert.rejects(f.store.command('buyer', 0, f.command, f.stamp));
    assert.deepEqual(f.db.sqlite.prepare('SELECT * FROM sky_linux_service_documents WHERE id=?').get(f.key), attacked);
    assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM work_jobs').get().n, 0);
    assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM sky_linux_service_receipts').get().n, 0);
  });
});

void test('atomic runtime authority: two same-revision writers, foreign job IDs and rollback preserve history', async t => {
  const f = await runtimeAuthorityFixture(t);
  const results = await Promise.allSettled([
    f.store.command('buyer', 0, f.command, f.stamp),
    f.store.command('buyer', 0, f.command, f.stamp),
  ]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM work_jobs').get().n, 1);
  const fresh = await f.store.get('buyer');
  assert.equal(fresh.payload.jobs.length, 1);
  assert.equal(await f.store.get('other'), null);
  const prior = JSON.stringify(fresh);
  f.db.sqlite.exec(`CREATE TRIGGER fixture_fail_save BEFORE UPDATE ON sky_linux_service_documents
    WHEN NEW.kind='workspace' BEGIN SELECT RAISE(ABORT,'fixture save failure'); END;`);
  await assert.rejects(f.store.command('buyer', fresh.revision,
    { ...f.command, requestId: randomUUID() }, f.stamp));
  assert.equal(JSON.stringify(await f.store.get('buyer')), prior);
  assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM work_jobs').get().n, 1);
});

void test('captured SQL read sets guard empty selections, expiry, duplicate rows and escaped SQL-like values', async t => {
  const db = database(t);
  const read = captureEsimAuthorityReads(db);
  await read.database.prepare('SELECT id,payload FROM sky_linux_service_documents WHERE owner_user_id=?').bind('owner').all();
  db.sqlite.prepare("INSERT INTO sky_linux_service_documents VALUES('row','owner','review',0,?,0)").run(JSON.stringify({ text: "😀 é '\n SQL --" }));
  await assert.rejects(db.batch(read.assertions()));
  const stable = captureEsimAuthorityReads(db);
  await stable.database.prepare('SELECT id,payload FROM sky_linux_service_documents WHERE owner_user_id=?').bind('owner').all();
  await db.batch(stable.assertions());
  const dup = captureEsimAuthorityReads(db);
  await dup.database.prepare('SELECT payload FROM sky_linux_service_documents UNION ALL SELECT payload FROM sky_linux_service_documents').all();
  await db.batch(dup.assertions());
  db.sqlite.prepare(`INSERT INTO sky_tool_package_reviews
    (id,package_key,manifest_sha256,reviewer_id,decision,checks_json,evidence_json,notes,reviewed_at,expires_at)
    VALUES('expired','fixture',?,'reviewer','verified','{}','{}','fixture',0,1)`).run(sha);
  const expires = captureEsimAuthorityReads(db);
  await expires.database.prepare('SELECT id FROM sky_tool_package_reviews WHERE expires_at > ?').bind(0).all();
  await assert.rejects(db.batch(expires.assertions()));
});


void test('claim and heartbeat guards do not renew revoked or raced jobs; clean current authority recovers same job', async t => {
  const f = await runtimeAuthorityFixture(t);
  const queued = await f.store.command('buyer', 0, f.command, f.stamp);
  const claim = { action: 'claim', jobId: f.command.requestId, claimId: 'claim' };
  f.db.beforeBatch = () => f.edit('sky_linux_service_documents', 'fixture-authority', g => { g.key = 'revoked'; });
  await assert.rejects(f.store.command('buyer', queued.revision, claim, f.stamp, true));
  assert.equal((await f.store.get('buyer')).payload.jobs[0].state, 'queued');
  assert.equal((await f.store.get('buyer')).payload.jobs[0].leaseUntil, 0);
  f.edit('sky_linux_service_documents', 'fixture-authority', g => { g.key = 'current'; });
  const running = await f.store.command('buyer', queued.revision, claim, f.stamp, true);
  const lease = running.payload.jobs[0].leaseUntil;
  f.db.beforeBatch = () => f.edit('sky_linux_service_documents', f.key, w => { w.epoch++; });
  await assert.rejects(f.store.command('buyer', running.revision,
    { action: 'heartbeat', jobId: f.command.requestId, claimId: 'claim' }, f.stamp + 1, true));
  const after = await f.store.get('buyer');
  assert.equal(after.payload.jobs[0].leaseUntil, lease);
  assert.equal(after.payload.jobs.length, 1);
  assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM work_jobs').get().n, 1);
  assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM sky_linux_service_receipts').get().n, 0);
});

void test('current grant and malformed setup restrict display/dispatch without erasing owner recovery ACL', async t => {
  const f = await runtimeAuthorityFixture(t);
  assert.equal((await f.store.access('buyer', f.stamp)).canExecute, true);
  f.edit('rockstar_service_setups', 'setup', s => { delete s.runtime; });
  const restricted = await f.store.access('buyer', f.stamp);
  assert.equal(restricted.canExecute, false);
  assert.equal(restricted.canRead, true); assert.equal(restricted.canExport, true);
  await assert.rejects(f.store.command('buyer', 0, f.command, f.stamp));
  f.edit('sky_linux_service_documents', f.key, w => { w.schema = 'unknown/9'; });
  const unknown = await f.store.access('buyer', f.stamp);
  assert.equal(unknown.canExecute, false); assert.equal(unknown.canRead, true); assert.equal(unknown.canExport, true);
  assert.equal(await f.store.access('other', f.stamp), null);
  assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM work_jobs').get().n, 0);
});

void test('run never overwrites a foreign owner job even when its request ID is reused', async t => {
  const f = await runtimeAuthorityFixture(t);
  const other = await run(f.w, f.listing, f.command.requestId);
  await workStore(f.db).create('foreign', other.w.jobs[0].run.job);
  const prior = f.db.sqlite.prepare('SELECT * FROM work_jobs').get();
  await assert.rejects(f.store.command('buyer', 0, f.command, f.stamp));
  assert.deepEqual(f.db.sqlite.prepare('SELECT * FROM work_jobs').get(), prior);
  assert.equal((await f.store.get('buyer')).payload.jobs.length, 0);
});

void test('Linux HTTP actions use server identity and never forward client trust flags', async () => {
  const { default: ts } = await import('typescript');
  const { default: vm } = await import('node:vm');
  const actual = await import('../lib/sky-linux-service.ts');
  const text = readFileSync(new URL('../app/api/sky/linux/route.ts', import.meta.url), 'utf8');
  const js = ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  let writes = 0;
  const store = { command: async (owner, revision, command) => {
    assert.equal(owner, 'server-owner'); assert.equal(revision, 0); writes++;
    return { ownerId: owner, command };
  } };
  const exports = {};
  vm.runInNewContext(js, { exports, Response, Date, Error, SyntaxError, require(name) {
    if (name === 'cloudflare:workers') return { env: {} };
    if (name === '@/lib/fund-store') return { database: () => ({}), requestUser: async request => {
      if (!request.headers.has('authorization')) throw Error('UNAUTHORIZED');
      if (request.headers.get('origin') !== new URL(request.url).origin) throw Error('ORIGIN');
      return 'server-owner';
    } };
    if (name === '@/lib/sky-developer-auth') return { requestDeveloperUser: async () => 'server-owner' };
    if (name === '@/lib/sky-linux-service-store') return { linuxServiceStore: () => store };
    if (name === '@/lib/sky-linux-service') return actual;
    if (name === '@/lib/rockstar-entitlement-claim') return { sha256Hex };
    throw Error('Unexpected dependency');
  } });
  const request = (body, auth = true, origin = 'https://fixture.invalid') => new Request('https://fixture.invalid/api/sky/linux', {
    method: 'POST', headers: { origin, ...(auth ? { authorization: 'fixture' } : {}) }, body: JSON.stringify(body),
  });
  const good = { action: 'add', revision: 0, listingId: 'fixture' };
  for (const body of [null, [], { ...good, owner: 'victim' }, { ...good, currentGrant: true },
    { ...good, worker: true }, { ...good, revision: -1 }, { ...good, action: 'claim' }]) {
    const result = await exports.POST(request(body)); assert.equal(result.status, 400);
  }
  assert.equal((await exports.POST(request(good, false))).status, 401);
  assert.equal((await exports.POST(request(good, true, 'https://foreign.invalid'))).status, 403);
  assert.equal(writes, 0);
  assert.equal((await exports.POST(request(good))).status, 200);
  assert.equal(writes, 1);
});

function insertNegativeAuthority(f, target, at = f.stamp) {
  if (target === 'listing') {
    // Exact independent counterexample: a second row owned by a reviewer,
    // rather than by the workspace buyer; no canonical fields are fabricated.
    f.db.sqlite.prepare("INSERT INTO sky_linux_service_documents VALUES('negative','reviewer','review',0,?,?)")
      .run(JSON.stringify({ listingId: f.listing.id, digest: f.listing.digest,
        decision: 'revoked', expiresAt: at + 60000 }), at);
  } else {
    f.db.sqlite.prepare(`INSERT INTO sky_tool_package_reviews
      (id,package_key,manifest_sha256,reviewer_id,decision,checks_json,evidence_json,notes,reviewed_at,expires_at)
      VALUES('negative-package',?,?,'reviewer','revoked','{}','{}','fixture',?,?)`)
      .run(f.listing.packageKey, f.listing.packageSha256, at, at + 60000);
  }
}

void test('attempt2: negative listing/package authority denies first attempt and every fresh retry for all dispatch actions', async t => {
  for (const target of ['listing', 'package']) for (const action of ['add', 'run', 'claim', 'heartbeat']) {
    for (const boundary of ['before-read', 'before-commit']) await t.test(`${target}/${action}/${boundary}`, async child => {
      const f = await runtimeAuthorityFixture(child);
      let revision = 0;
      let command = f.command;
      if (action === 'add') command = { action, listingId: f.listing.id };
      if (action === 'claim' || action === 'heartbeat') {
        revision = (await f.store.command('buyer', 0, f.command, f.stamp)).revision;
        command = { action, jobId: f.command.requestId, claimId: 'claim' };
        if (action === 'heartbeat') revision = (await f.store.command('buyer', revision,
          { ...command, action: 'claim' }, f.stamp, true)).revision;
      }
      const before = JSON.stringify(await f.store.get('buyer'));
      const work = f.db.sqlite.prepare('SELECT * FROM work_jobs').all();
      if (boundary === 'before-read') insertNegativeAuthority(f, target);
      else f.db.beforeBatch = () => insertNegativeAuthority(f, target);
      for (let retry = 0; retry < 3; retry++) {
        await assert.rejects(f.store.command('buyer', revision, command, f.stamp + retry, action === 'claim' || action === 'heartbeat'));
        assert.equal(JSON.stringify(await f.store.get('buyer')), before);
        assert.deepEqual(f.db.sqlite.prepare('SELECT * FROM work_jobs').all(), work);
        assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM sky_linux_service_receipts').get().n, 0);
        const access = await f.store.access('buyer', f.stamp + retry);
        assert.equal(access.canRead, true); assert.equal(access.canExport, true);
      }
    });
  }
});

void test('attempt2: canonical listing upsert revokes, repeated retries deny, explicit review restores same-request idempotency', async t => {
  const f = await runtimeAuthorityFixture(t);
  const saved = await f.store.command('buyer', 0, f.command, f.stamp);
  await f.store.review('reviewer', { listingId: f.listing.id, digest: f.listing.digest,
    decision: 'revoked', expiresAt: f.stamp + 60000 }, f.stamp + 1);
  for (let i = 0; i < 3; i++) await assert.rejects(f.store.command('buyer', saved.revision, f.command, f.stamp + 2));
  assert.equal((await f.store.get('buyer')).payload.jobs.length, 1);
  assert.equal((await f.store.get('buyer')).payload.jobs[0].reservedMinor, 120);
  await f.store.review('reviewer', { listingId: f.listing.id, digest: f.listing.digest,
    decision: 'approved', expiresAt: f.stamp + 60000 }, f.stamp + 3);
  const restored = await f.store.command('buyer', saved.revision, f.command, f.stamp + 4);
  assert.equal(restored.revision, saved.revision);
  assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM work_jobs').get().n, 1);
});

void test('attempt2: inconsistent listing row deletion/update is fenced, unknown/ties/expiry stay denied, explicit canonical repair restores', async t => {
  const f = await runtimeAuthorityFixture(t), id = 'review:' + f.listing.id;
  insertNegativeAuthority(f, 'listing');
  for (let i = 0; i < 3; i++) await assert.rejects(f.store.command('buyer', 0, f.command, f.stamp));
  // Remove the inconsistent secondary row as an explicit fixture repair, then
  // use the existing reviewer writer; never treat expiry as implicit recovery.
  f.db.sqlite.prepare("DELETE FROM sky_linux_service_documents WHERE id='negative'").run();
  await f.store.review('reviewer', { listingId: f.listing.id, digest: f.listing.digest,
    decision: 'approved', expiresAt: f.stamp + 60000 }, f.stamp + 1);
  f.db.beforeBatch = () => f.db.sqlite.prepare('DELETE FROM sky_linux_service_documents WHERE id=?').run(id);
  await assert.rejects(f.store.command('buyer', 0, f.command, f.stamp + 2));
  for (let i = 0; i < 2; i++) await assert.rejects(f.store.command('buyer', 0, f.command, f.stamp + 2));
  await f.store.review('reviewer', { listingId: f.listing.id, digest: f.listing.digest,
    decision: 'approved', expiresAt: f.stamp + 60000 }, f.stamp + 3);
  f.db.beforeBatch = () => f.edit('sky_linux_service_documents', id, r => { r.decision = 'unknown'; });
  await assert.rejects(f.store.command('buyer', 0, f.command, f.stamp + 4));
  for (let i = 0; i < 2; i++) await assert.rejects(f.store.command('buyer', 0, f.command, f.stamp + 4));
  await f.store.review('reviewer', { listingId: f.listing.id, digest: f.listing.digest,
    decision: 'approved', expiresAt: f.stamp + 60000 }, f.stamp + 5);
  assert.equal((await f.store.command('buyer', 0, f.command, f.stamp + 6)).payload.jobs.length, 1);
});

void test('attempt2: package latest generation uses deny ties, no old-positive expiry fallback and explicit new verified generation', async t => {
  const f = await runtimeAuthorityFixture(t);
  insertNegativeAuthority(f, 'package');
  for (let i = 0; i < 3; i++) await assert.rejects(f.store.command('buyer', 0, f.command, f.stamp + i));
  assert.throws(() => f.db.sqlite.prepare("DELETE FROM sky_tool_package_reviews WHERE id='negative-package'").run(), /immutable/);
  assert.throws(() => f.db.sqlite.prepare("UPDATE sky_tool_package_reviews SET decision='verified' WHERE id='negative-package'").run(), /immutable/);
  // The existing package publisher/reviewer flow requires resubmission before
  // verification. This is synthetic host state only, never a provider action.
  const { skyToolReviewStore } = await import('../lib/sky-tool-review.ts');
  f.db.sqlite.prepare("UPDATE sky_tool_packages SET status='submitted' WHERE package_key=?").run(f.listing.packageKey);
  await skyToolReviewStore(f.db).review('reviewer', { packageKey: f.listing.packageKey,
    manifestSha256: f.listing.packageSha256, decision: 'verified', sourceRevision: null,
    sourceSha256: null, checks: {}, evidenceUrls: [], notes: 'fixture explicit review', expiresAt: f.stamp + 60000 }, f.stamp + 5);
  const saved = await f.store.command('buyer', 0, f.command, f.stamp + 6);
  assert.equal(saved.payload.jobs.length, 1);
  assert.equal((await f.store.command('buyer', saved.revision, f.command, f.stamp + 6)).revision, saved.revision);
  // A newer expired positive is not allowed to fall back to the old positive.
  f.db.sqlite.prepare(`INSERT INTO sky_tool_package_reviews
    (id,package_key,manifest_sha256,reviewer_id,decision,checks_json,evidence_json,notes,reviewed_at,expires_at)
    VALUES('expired-latest',?,?,'reviewer','verified','{}','{}','fixture',?,?)`)
    .run(f.listing.packageKey, f.listing.packageSha256, f.stamp + 7, f.stamp + 8);
  for (let i = 0; i < 3; i++) await assert.rejects(f.store.command('buyer', saved.revision, f.command, f.stamp + 9 + i));
  assert.equal((await f.store.get('buyer')).payload.jobs.length, 1);
});

void test('attempt2: negative reviews do not prevent stop, late CPU-once or owner-session recovery reads', async t => {
  for (const target of ['listing', 'package']) await t.test(target, async child => {
    const f = await runtimeAuthorityFixture(child);
    const queued = await f.store.command('buyer', 0, f.command, f.stamp);
    const running = await f.store.command('buyer', queued.revision,
      { action: 'claim', jobId: f.command.requestId, claimId: 'claim' }, f.stamp, true);
    insertNegativeAuthority(f, target);
    const cancelled = await f.store.command('buyer', running.revision,
      { action: 'cancel', jobId: f.command.requestId }, f.stamp);
    const job = cancelled.payload.jobs[0];
    const receipt = event(cancelled.payload, 'result', { jobId: job.id, claimId: job.claimId,
      contractDigest: f.w.contractDigest, listingDigest: f.listing.digest, inputSha256: job.inputSha256,
      outcome: 'succeeded', meter: 'linux-wait4-child-cpu/1', cpuMs: 1000, durationMs: 1000, text: 'late' }, f.stamp);
    const settled = await f.store.event(receipt, f.stamp);
    assert.equal(settled.payload.jobs[0].state, 'cancelled');
    assert.equal(settled.payload.jobs[0].authorMinor, 0);
    assert.equal((await f.store.event(receipt, f.stamp)).revision, settled.revision);
    assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM sky_linux_service_receipts').get().n, 1);
    const access = await f.store.access('buyer', f.stamp);
    assert.equal(access.canRead, true); assert.equal(access.canExport, true);
    assert.equal(await f.store.access('foreign', f.stamp), null);
  });
});

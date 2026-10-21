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
  parseLinuxTerms,
  linuxText,
} from '../lib/sky-linux-service.ts';
import { linuxServiceStore } from '../lib/sky-linux-service-store.ts';
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
    async batch(statements) {
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

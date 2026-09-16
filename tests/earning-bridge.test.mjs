import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import {
  EarningBridgeError,
  forwardProviderEarningReceipt,
  PROVIDER_SIGNATURE_HEADER,
} from '../lib/earning-bridge.ts';
import { operations } from '../lib/operations.ts';
import { createReceiptSignature } from '../lib/receipt-signature.ts';
import billingWorker from '../services/sky-billing/src/worker.ts';

class Statement {
  #database;
  #sql;
  #values = [];
  constructor(database, sql) {
    this.#database = database;
    this.#sql = sql;
  }
  bind(...values) {
    this.#values = values;
    return this;
  }
  run() {
    const result = this.#database.prepare(this.#sql).run(...this.#values);
    return Promise.resolve({
      success: true,
      results: [],
      meta: { changes: Number(result.changes) },
    });
  }
  first() {
    return Promise.resolve(
      this.#database.prepare(this.#sql).get(...this.#values) ?? null,
    );
  }
  all() {
    return Promise.resolve({
      success: true,
      results: this.#database.prepare(this.#sql).all(...this.#values),
    });
  }
}

class TestD1 {
  constructor(migrations, batchReturnsRows = false) {
    this.database = new DatabaseSync(':memory:');
    this.batchReturnsRows = batchReturnsRows;
    for (const migration of migrations) this.database.exec(migration);
  }
  prepare(sql) {
    return new Statement(this.database, sql);
  }
  async batch(statements) {
    this.database.exec('BEGIN IMMEDIATE');
    try {
      const results = [];
      for (const statement of statements)
        results.push(
          this.batchReturnsRows ? await statement.all() : await statement.run(),
        );
      this.database.exec('COMMIT');
      return results;
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }
  close() {
    this.database.close();
  }
}

const webMigrations = readdirSync(new URL('../drizzle', import.meta.url))
  .filter((name) => name.endsWith('.sql'))
  .sort()
  .map((name) =>
    readFileSync(new URL(`../drizzle/${name}`, import.meta.url), 'utf8'),
  );
const billingMigrations = [
  '0001_billing.sql',
  '0002_earnings_settlement.sql',
  '0003_automation_funds.sql',
  '0004_rock_settlement_wallet.sql',
].map((name) =>
  readFileSync(
    new URL(`../services/sky-billing/migrations/${name}`, import.meta.url),
    'utf8',
  ),
);

const providerSecret = 'provider-receipt-secret-that-is-long-enough';
const settlementSecret = 'settlement-ingest-secret-that-is-long-enough';
const billingSecret = 'billing-shared-secret-that-is-long-enough';
const payoutSecret = 'payout-adapter-secret-that-is-long-enough';
const bridgeEnv = {
  BILLING_SERVICE_URL: 'https://billing.example',
  SETTLEMENT_INGEST_SECRET: settlementSecret,
  EARNING_PROVIDER_ID: 'provider-fixture',
  EARNING_PROVIDER_SECRET: providerSecret,
};

function receipt(executionReceiptId, occurredAt, changes = {}) {
  return {
    receiptId: `earn_${crypto.randomUUID()}`,
    executionReceiptId,
    userId: 'alice',
    beneficiaryRole: 'toc',
    sourceProvider: 'provider-fixture',
    providerReference: `pay_${crypto.randomUUID()}`,
    payoutAccountId: 'acct_alice',
    evidenceSha256: 'a'.repeat(64),
    currency: 'usd',
    grossAmountMinor: 1500,
    operatingCostMinor: 100,
    occurredAt,
    ...changes,
  };
}

async function signedRequest(value, secret = providerSecret) {
  const raw = JSON.stringify(value);
  return new Request('https://sky.example/api/earnings/receipts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      [PROVIDER_SIGNATURE_HEADER]: await createReceiptSignature(raw, secret),
    },
    body: raw,
  });
}

void test('completed real Tool -> provider receipt -> Wallet is exact and idempotent', async () => {
  const web = new TestD1(webMigrations, true);
  const billing = new TestD1(billingMigrations);
  const now = Date.now();
  const store = operations(web, 'alice', () => now);
  const jobId = crypto.randomUUID();
  await store.createJob({
    id: jobId,
    tool: 'mr-citations',
    transport: 'browser',
    sample: false,
    inputBytes: 100,
  });
  await store.changeJob(jobId, { action: 'start' });
  await store.changeJob(jobId, {
    action: 'finish',
    status: 'completed',
    durationMs: 30,
    outputBytes: 200,
  });
  const earning = receipt(jobId, Math.floor(now / 1000), {
    fundId: 'fund:citations',
    automationToolId: 'mr-citations',
  });
  const billingEnv = {
    DB: billing,
    BILLING_SHARED_SECRET: billingSecret,
    SETTLEMENT_INGEST_SECRET: settlementSecret,
    PAYOUT_ADAPTER_SECRET: payoutSecret,
    SKY_ORIGIN: 'https://sky.example',
  };
  const send = (input, init) =>
    billingWorker.fetch(new Request(input, init), billingEnv);

  try {
    const first = await forwardProviderEarningReceipt(
      await signedRequest(earning),
      web,
      bridgeEnv,
      send,
    );
    assert.equal(first.status, 201);
    const firstBody = await first.json();
    assert.equal(firstBody.replay, false);
    assert.equal(firstBody.receipt.executionReceiptId, jobId);
    assert.equal(firstBody.receipt.grossMinor, 1500);
    assert.equal(firstBody.receipt.skyFeeMinor, 888);
    assert.equal(firstBody.receipt.distributableMinor, 512);

    const replay = await forwardProviderEarningReceipt(
      await signedRequest(earning),
      web,
      bridgeEnv,
      send,
    );
    assert.equal(replay.status, 200);
    assert.equal((await replay.json()).replay, true);
    assert.equal(
      billing.database
        .prepare('SELECT COUNT(*) AS count FROM earning_receipts')
        .get().count,
      1,
    );
    assert.equal(
      billing.database
        .prepare('SELECT COUNT(*) AS count FROM earning_ledger_entries')
        .get().count,
      4,
    );

    const secondReceiptForSameExecution = receipt(
      jobId,
      Math.floor(now / 1000),
    );
    const conflict = await forwardProviderEarningReceipt(
      await signedRequest(secondReceiptForSameExecution),
      web,
      bridgeEnv,
      send,
    );
    assert.equal(conflict.status, 409);
    assert.equal(
      billing.database
        .prepare('SELECT COUNT(*) AS count FROM earning_receipts')
        .get().count,
      1,
    );
  } finally {
    web.close();
    billing.close();
  }
});

void test('bridge rejects unsigned, sample, unfinished and mismatched receipts', async () => {
  const web = new TestD1(webMigrations, true);
  const now = Date.now();
  const store = operations(web, 'alice', () => now);
  let sent = 0;
  const send = async () => {
    sent += 1;
    return Response.json({ unexpected: true });
  };
  const expectBridgeError = async (request, status) =>
    assert.rejects(
      () => forwardProviderEarningReceipt(request, web, bridgeEnv, send),
      (error) => error instanceof EarningBridgeError && error.status === status,
    );

  try {
    const runningId = crypto.randomUUID();
    await store.createJob({
      id: runningId,
      tool: 'mr-citations',
      transport: 'browser',
      sample: false,
      inputBytes: 100,
    });
    await store.changeJob(runningId, { action: 'start' });
    const runningReceipt = receipt(runningId, Math.floor(now / 1000));
    await expectBridgeError(await signedRequest(runningReceipt), 409);

    const unsignedRaw = JSON.stringify(runningReceipt);
    await expectBridgeError(
      new Request('https://sky.example/api/earnings/receipts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: unsignedRaw,
      }),
      401,
    );

    await store.changeJob(runningId, {
      action: 'finish',
      status: 'completed',
      durationMs: 30,
      outputBytes: 200,
    });
    await expectBridgeError(
      await signedRequest({ ...runningReceipt, userId: 'mallory' }),
      409,
    );
    await expectBridgeError(
      await signedRequest({
        ...runningReceipt,
        fundId: 'fund:wrong',
        automationToolId: 'coconala',
      }),
      409,
    );
    await expectBridgeError(
      await signedRequest({
        ...runningReceipt,
        sourceProvider: 'another-provider',
      }),
      403,
    );

    const sampleId = crypto.randomUUID();
    await store.createJob({
      id: sampleId,
      tool: 'mr-citations',
      transport: 'browser',
      sample: true,
      inputBytes: 100,
    });
    await store.changeJob(sampleId, { action: 'start' });
    await store.changeJob(sampleId, {
      action: 'finish',
      status: 'completed',
      durationMs: 30,
      outputBytes: 200,
    });
    await expectBridgeError(
      await signedRequest(receipt(sampleId, Math.floor(now / 1000))),
      409,
    );
    assert.equal(sent, 0);
  } finally {
    web.close();
  }
});

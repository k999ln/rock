import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { privateKeyToAccount } from 'viem/accounts';
import { createBillingToken } from '../lib/billing-token.ts';
import billingWorker, {
  legacyFixtureBillingWorker,
} from '../services/sky-billing/src/worker.ts';

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
  constructor() {
    this.database = new DatabaseSync(':memory:');
    for (const migration of [
      '0001_billing.sql',
      '0002_earnings_settlement.sql',
      '0003_automation_funds.sql',
      '0004_rock_settlement_wallet.sql',
    ])
      this.database.exec(
        readFileSync(
          new URL(
            `../services/sky-billing/migrations/${migration}`,
            import.meta.url,
          ),
          'utf8',
        ),
      );
  }
  prepare(sql) {
    return new Statement(this.database, sql);
  }
  async batch(statements) {
    this.database.exec('BEGIN IMMEDIATE');
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
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

const origin = 'https://sky.example';
const sharedSecret = 'test-billing-shared-secret-that-is-long-enough';
const ingestSecret = 'test-receipt-ingest-secret-that-is-long-enough';
const payoutSecret = 'test-payout-adapter-secret-that-is-long-enough';

void test('current policy rejects a signed ToC receipt without writing a fee', async () => {
  const DB = new TestD1();
  const env = {
    DB,
    BILLING_SHARED_SECRET: sharedSecret,
    SETTLEMENT_INGEST_SECRET: ingestSecret,
    PAYOUT_ADAPTER_SECRET: payoutSecret,
    SKY_ORIGIN: origin,
  };
  try {
    const health = await billingWorker.fetch(
      new Request('https://settlement.example/health'),
      env,
    );
    assert.equal((await health.json()).mode, 'fee_policy_on_hold');
    const status = await billingWorker.fetch(
      new Request('https://settlement.example/v1/status', {
        headers: {
          Origin: origin,
          Authorization: `Bearer ${await createBillingToken('alice', sharedSecret)}`,
        },
      }),
      env,
    );
    assert.equal(status.status, 200);
    const statusBody = await status.json();
    assert.equal(statusBody.policy.mode, 'fee_policy_on_hold');
    assert.equal(statusBody.policy.monthlyFeeCapMinor, null);
    assert.equal(statusBody.settlement.remainingFeeCapMinor, null);
    const walletChallenge = await billingWorker.fetch(
      new Request('https://settlement.example/v1/rock-wallet/challenge', {
        method: 'POST',
        headers: { Origin: origin },
      }),
      env,
    );
    assert.equal(walletChallenge.status, 409);
    assert.equal(
      (await walletChallenge.json()).code,
      'SKY_FEE_POLICY_ON_HOLD',
    );
    const walletReconcile = await billingWorker.fetch(
      new Request('https://settlement.example/v1/rock-wallet/reconcile', {
        method: 'POST',
        headers: { Origin: origin },
      }),
      env,
    );
    assert.equal(walletReconcile.status, 409);
    const receipt = {
      receiptId: 'hold_1',
      executionReceiptId: 'exec_hold_1',
      userId: 'alice',
      beneficiaryRole: 'toc',
      sourceProvider: 'stripe-connect',
      providerReference: 'pi_hold_1',
      payoutAccountId: 'acct_alice',
      evidenceSha256: 'a'.repeat(64),
      currency: 'usd',
      grossAmountMinor: 1000,
      operatingCostMinor: 100,
      occurredAt: Math.floor(Date.now() / 1000),
    };
    const raw = JSON.stringify(receipt);
    const blocked = await billingWorker.fetch(
      new Request('https://settlement.example/v1/earnings', {
        method: 'POST',
        headers: { 'Sky-Receipt-Signature': signature(raw) },
        body: raw,
      }),
      env,
    );
    assert.equal(blocked.status, 409);
    assert.equal((await blocked.json()).code, 'SKY_FEE_POLICY_ON_HOLD');
    assert.equal(
      DB.database.prepare('SELECT COUNT(*) AS total FROM earning_receipts').get()
        .total,
      0,
    );
  } finally {
    DB.close();
  }
});

function signature(
  raw,
  timestamp = Math.floor(Date.now() / 1000),
  secret = ingestSecret,
) {
  return `t=${timestamp},v1=${createHmac('sha256', secret)
    .update(`${timestamp}.${raw}`)
    .digest('hex')}`;
}

void test('legacy settlement fixture applies verified earnings once', async () => {
  const DB = new TestD1();
  const env = {
    DB,
    BILLING_SHARED_SECRET: sharedSecret,
    SETTLEMENT_INGEST_SECRET: ingestSecret,
    PAYOUT_ADAPTER_SECRET: payoutSecret,
    SKY_ORIGIN: origin,
  };
  const request = async (path, options = {}) => {
    const response = await legacyFixtureBillingWorker.fetch(
      new Request(`https://settlement.example${path}`, {
        method: options.method ?? 'GET',
        headers: {
          ...(options.origin === false
            ? {}
            : { Origin: options.origin ?? origin }),
          ...(options.token
            ? { Authorization: `Bearer ${options.token}` }
            : {}),
          ...(options.signature
            ? { 'Sky-Receipt-Signature': options.signature }
            : {}),
        },
        body: options.body,
      }),
      env,
    );
    return { response, body: await response.json() };
  };
  const token = (user) => createBillingToken(user, sharedSecret);
  const earning = async (receipt, suppliedSignature) => {
    const raw = JSON.stringify(receipt);
    return request('/v1/earnings', {
      method: 'POST',
      origin: false,
      body: raw,
      signature: suppliedSignature ?? signature(raw),
    });
  };
  const base = {
    receiptId: 'earn_1',
    executionReceiptId: 'exec_1',
    userId: 'alice',
    beneficiaryRole: 'toc',
    fundId: 'fund:test-one',
    automationToolId: 'tool:test-one',
    sourceProvider: 'stripe-connect',
    providerReference: 'pi_1',
    payoutAccountId: 'acct_alice',
    evidenceSha256: 'a'.repeat(64),
    currency: 'usd',
    grossAmountMinor: 500,
    operatingCostMinor: 100,
    occurredAt: Math.floor(Date.now() / 1000),
  };

  try {
    const health = await request('/health', { origin: false });
    assert.equal(health.response.status, 200);
    assert.equal(health.body.mode, 'verified_earnings_only');
    const retired = await request('/v1/checkout', { method: 'POST' });
    assert.equal(retired.response.status, 410);
    assert.equal(retired.body.code, 'UPFRONT_BILLING_RETIRED');
    assert.equal(
      (
        await request('/v1/status', {
          token: await token('alice'),
          origin: 'https://evil.example',
        })
      ).response.status,
      403,
    );

    const first = await earning(base);
    assert.equal(first.response.status, 201);
    assert.equal(first.body.receipt.skyFeeMinor, 400);
    assert.equal(first.body.receipt.distributableMinor, 0);
    assert.equal(first.body.receipt.payoutStatus, 'not_required');
    assert.equal(
      DB.database
        .prepare(
          "SELECT status FROM rock_fee_collection_instructions WHERE receipt_id='earn_1'",
        )
        .get().status,
      'awaiting_wallet',
    );

    const rockAccount = privateKeyToAccount(
      '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    );
    const challenge = await request('/v1/rock-wallet/challenge', {
      method: 'POST',
      token: await token('alice'),
      body: JSON.stringify({ address: rockAccount.address, chainId: 8453 }),
    });
    assert.equal(challenge.response.status, 201);
    assert.match(challenge.body.message, /Rock Settlement Wallet/u);
    const walletSignature = await rockAccount.signMessage({
      message: challenge.body.message,
    });
    const connected = await request('/v1/rock-wallet/verify', {
      method: 'POST',
      token: await token('alice'),
      body: JSON.stringify({
        challengeId: challenge.body.challengeId,
        address: rockAccount.address,
        signature: walletSignature,
      }),
    });
    assert.equal(connected.response.status, 200);
    assert.equal(connected.body.address, rockAccount.address);
    assert.equal(connected.body.custody, false);
    assert.equal(
      DB.database
        .prepare(
          "SELECT status FROM rock_fee_collection_instructions WHERE receipt_id='earn_1'",
        )
        .get().status,
      'ready',
    );
    const challengeReplay = await request('/v1/rock-wallet/verify', {
      method: 'POST',
      token: await token('alice'),
      body: JSON.stringify({
        challengeId: challenge.body.challengeId,
        address: rockAccount.address,
        signature: walletSignature,
      }),
    });
    assert.equal(challengeReplay.response.status, 409);
    const operatorConflict = await request('/v1/rock-wallet/challenge', {
      method: 'POST',
      token: await token('mallory'),
      body: JSON.stringify({ address: rockAccount.address, chainId: 8453 }),
    });
    assert.equal(operatorConflict.response.status, 403);

    const replay = await earning(base);
    assert.equal(replay.response.status, 200);
    assert.equal(replay.body.replay, true);
    assert.equal(
      DB.database
        .prepare('SELECT COUNT(*) AS total FROM earning_receipts')
        .get().total,
      1,
    );

    const second = await earning({
      ...base,
      receiptId: 'earn_2',
      executionReceiptId: 'exec_2',
      providerReference: 'pi_2',
      evidenceSha256: 'b'.repeat(64),
      grossAmountMinor: 1000,
    });
    assert.equal(second.response.status, 201);
    assert.equal(second.body.receipt.skyFeeMinor, 488);
    assert.equal(second.body.receipt.distributableMinor, 412);
    assert.equal(second.body.receipt.payoutStatus, 'ready');

    const third = await earning({
      ...base,
      receiptId: 'earn_3',
      executionReceiptId: 'exec_3',
      providerReference: 'pi_3',
      evidenceSha256: 'c'.repeat(64),
      grossAmountMinor: 500,
      operatingCostMinor: 0,
    });
    assert.equal(third.body.receipt.skyFeeMinor, 0);
    assert.equal(third.body.receipt.distributableMinor, 500);

    const tob = await earning({
      ...base,
      receiptId: 'earn_tob',
      executionReceiptId: 'exec_tob',
      userId: 'provider-one',
      beneficiaryRole: 'tob',
      providerReference: 'pi_tob',
      payoutAccountId: 'acct_provider',
      evidenceSha256: 'd'.repeat(64),
      grossAmountMinor: 1000,
    });
    assert.equal(tob.body.receipt.skyFeeMinor, 0);
    assert.equal(tob.body.receipt.distributableMinor, 900);

    const status = await request('/v1/status', {
      token: await token('alice'),
    });
    assert.equal(status.response.status, 200);
    assert.equal(status.body.policy.upfrontCharge, false);
    assert.equal(status.body.policy.debtCarry, false);
    assert.equal(status.body.policy.performanceCommissionBps, 0);
    assert.equal(status.body.policy.userOwnsRemainder, true);
    assert.equal(status.body.policy.fundCountLimit, null);
    assert.equal(status.body.settlement.grossMinor, 2000);
    assert.equal(status.body.settlement.operatingCostMinor, 200);
    assert.equal(status.body.settlement.skyFeeMinor, 888);
    assert.equal(status.body.settlement.distributableMinor, 912);
    assert.equal(status.body.settlement.remainingFeeCapMinor, 0);
    assert.equal(status.body.receipts.length, 3);
    assert.equal(status.body.funds.length, 1);
    assert.deepEqual(status.body.tools, [
      {
        automationToolId: 'tool:test-one',
        grossMinor: 2000,
        operatingCostMinor: 200,
        receiptCount: 3,
      },
    ]);
    assert.equal(status.body.funds[0].fundId, 'fund:test-one');
    assert.equal(status.body.funds[0].grossMinor, 2000);
    assert.equal(status.body.funds[0].userPayableMinor, 912);
    const rockWallet = await request('/v1/rock-wallet', {
      token: await token('alice'),
    });
    assert.equal(rockWallet.response.status, 200);
    assert.equal(rockWallet.body.operator, true);
    assert.equal(rockWallet.body.account.address, rockAccount.address);
    assert.equal(rockWallet.body.totals.pendingMinor, 888);
    assert.equal(
      rockWallet.body.collections.filter((item) => item.amountMinor > 0).length,
      2,
    );
    assert.equal(
      DB.database
        .prepare(
          "SELECT COUNT(*) AS total FROM earning_ledger_entries WHERE user_id='alice'",
        )
        .get().total,
      9,
    );

    const claimBody = JSON.stringify({ adapterId: 'stripe-connect' });
    const wrongPayoutKey = await request('/v1/payouts/claim', {
      method: 'POST',
      origin: false,
      body: claimBody,
      signature: signature(claimBody),
    });
    assert.equal(wrongPayoutKey.response.status, 401);
    const claim = await request('/v1/payouts/claim', {
      method: 'POST',
      origin: false,
      body: claimBody,
      signature: signature(claimBody, undefined, payoutSecret),
    });
    assert.equal(claim.response.status, 200);
    assert.equal(claim.body.instruction.status, 'processing');
    assert.equal(claim.body.instruction.amountMinor, 412);
    assert.match(claim.body.instruction.idempotencyKey, /^sky-payout-/u);
    const resultBody = JSON.stringify({
      instructionId: claim.body.instruction.instructionId,
      leaseId: claim.body.instruction.leaseId,
      status: 'paid',
      providerTransferReference: 'tr_verified_1',
    });
    const paid = await request('/v1/payouts/result', {
      method: 'POST',
      origin: false,
      body: resultBody,
      signature: signature(resultBody, undefined, payoutSecret),
    });
    assert.equal(paid.body.instruction.status, 'paid');
    assert.equal(
      paid.body.instruction.providerTransferReference,
      'tr_verified_1',
    );
    const paidReplay = await request('/v1/payouts/result', {
      method: 'POST',
      origin: false,
      body: resultBody,
      signature: signature(resultBody, undefined, payoutSecret),
    });
    assert.equal(paidReplay.body.replay, true);

    const conflict = await earning({ ...base, receiptId: 'changed_receipt' });
    assert.equal(conflict.response.status, 409);
    const raw = JSON.stringify({ ...base, receiptId: 'forged' });
    const forged = await request('/v1/earnings', {
      method: 'POST',
      origin: false,
      body: raw,
      signature: signature(`${raw}changed`),
    });
    assert.equal(forged.response.status, 401);
    const payoutKeyCannotCreateEarnings = await request('/v1/earnings', {
      method: 'POST',
      origin: false,
      body: raw,
      signature: signature(raw, undefined, payoutSecret),
    });
    assert.equal(payoutKeyCannotCreateEarnings.response.status, 401);
  } finally {
    DB.close();
  }
});

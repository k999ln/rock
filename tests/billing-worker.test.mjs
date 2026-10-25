import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { privateKeyToAccount } from 'viem/accounts';
import { createBillingToken } from '../lib/billing-token.ts';
import billingWorker, {
  legacyFixtureBillingWorker,
} from '../services/sky-billing/src/worker.ts';

import { TestD1 } from './fixtures/billing-test-d1.mjs';

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
    const envWithoutPayout = { ...env, PAYOUT_ADAPTER_SECRET: undefined };
    const healthWithoutPayout = await billingWorker.fetch(
      new Request('https://settlement.example/health'),
      envWithoutPayout,
    );
    assert.equal(healthWithoutPayout.status, 200);
    const payoutWithoutSecret = await billingWorker.fetch(
      new Request('https://settlement.example/v1/payouts/claim', {
        method: 'POST',
        body: '{}',
      }),
      envWithoutPayout,
    );
    assert.equal(payoutWithoutSecret.status, 503);
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

void test('a concurrent consumed Wallet challenge cannot reactivate a revoked operator after returning conflict', async (t) => {
  const DB = new TestD1();
  t.after(() => DB.close());
  const env = {
    DB,
    BILLING_SHARED_SECRET: sharedSecret,
    SETTLEMENT_INGEST_SECRET: ingestSecret,
    PAYOUT_ADAPTER_SECRET: payoutSecret,
    SKY_ORIGIN: origin,
  };
  const token = await createBillingToken('alice', sharedSecret);
  const account = privateKeyToAccount(
    '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  );
  const request = async (path, method, input) => {
    const response = await legacyFixtureBillingWorker.fetch(
      new Request(`https://settlement.example${path}`, {
        method,
        headers: { Origin: origin, Authorization: `Bearer ${token}` },
        ...(input === undefined ? {} : { body: JSON.stringify(input) }),
      }),
      env,
    );
    return { status: response.status, body: await response.json() };
  };
  const challenge = await request('/v1/rock-wallet/challenge', 'POST', {
    address: account.address,
    chainId: 8453,
  });
  assert.equal(challenge.status, 201);
  const input = {
    challengeId: challenge.body.challengeId,
    address: account.address,
    signature: await account.signMessage({ message: challenge.body.message }),
  };
  const reached = Promise.withResolvers();
  const resume = Promise.withResolvers();
  const originalBatch = DB.batch.bind(DB);
  let pauseNextVerify = true;
  DB.batch = async (statements) => {
    if (pauseNextVerify && statements.length === 3) {
      pauseNextVerify = false;
      reached.resolve();
      await resume.promise;
    }
    return originalBatch(statements);
  };
  const delayedReplay = request('/v1/rock-wallet/verify', 'POST', input);
  try {
    await reached.promise;
    assert.equal(
      (await request('/v1/rock-wallet/verify', 'POST', input)).status,
      200,
    );
    assert.equal((await request('/v1/rock-wallet', 'DELETE')).status, 200);
    assert.equal(
      DB.database.prepare('SELECT status FROM rock_wallet_operators').get()
        .status,
      'revoked',
    );
    const receipt = JSON.stringify({
      receiptId: 'earn_after_revoke',
      executionReceiptId: 'exec_after_revoke',
      userId: 'alice',
      beneficiaryRole: 'toc',
      fundId: 'fund:test-one',
      automationToolId: 'tool:test-one',
      sourceProvider: 'stripe-connect',
      providerReference: 'pi_after_revoke',
      payoutAccountId: 'acct_alice',
      evidenceSha256: 'a'.repeat(64),
      currency: 'usd',
      grossAmountMinor: 500,
      operatingCostMinor: 100,
      occurredAt: Math.floor(Date.now() / 1000),
    });
    const earned = await legacyFixtureBillingWorker.fetch(
      new Request('https://settlement.example/v1/earnings', {
        method: 'POST',
        headers: { 'Sky-Receipt-Signature': signature(receipt) },
        body: receipt,
      }),
      env,
    );
    assert.equal(earned.status, 201);
  } finally {
    resume.resolve();
  }
  assert.equal((await delayedReplay).status, 409);
  assert.equal(
    DB.database.prepare('SELECT status FROM rock_wallet_operators').get()
      .status,
    'revoked',
  );
  const collection = DB.database
    .prepare(
      "SELECT status,recipient_address FROM rock_fee_collection_instructions WHERE receipt_id='earn_after_revoke'",
    )
    .get();
  assert.equal(collection.status, 'awaiting_wallet');
  assert.equal(collection.recipient_address, null);
});

// WALLET-DB-RECOVERY-01: local SQLite fault/reopen fixtures only. Test signatures
// and legacy internal accounting do not establish real revenue or available cash.
const accountingTables = [
  'earning_receipts', 'monthly_earning_settlements',
  'monthly_fund_earning_settlements', 'earning_ledger_entries',
  'payout_instructions', 'rock_fee_collection_instructions',
];
function accountingSnapshot(DB) {
  return Object.fromEntries(accountingTables.map((table) => [table,
    DB.database.prepare(`SELECT * FROM ${table} ORDER BY 1, 2`).all(),
  ]));
}
function fileBillingFixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'wallet-db-recovery-'));
  const path = join(directory, 'billing.sqlite');
  const handles = [];
  let initialized = false;
  t.after(() => {
    try { for (const DB of handles) DB.close(); }
    finally { rmSync(directory, { recursive: true, force: true }); }
    // Covers DB, WAL and SHM sidecars even if an assertion/fault aborted a test.
    assert.equal(existsSync(directory), false);
  });
  return (hooks = {}) => {
    const DB = new TestD1(path, { migrate: !initialized, hooks });
    initialized = true;
    handles.push(DB);
    DB.database.exec('PRAGMA journal_mode=WAL');
    return DB;
  };
}
function recoveryReceipt(suffix = 'one', patch = {}) {
  return {
    receiptId: `recovery_${suffix}`, executionReceiptId: `execution_${suffix}`,
    userId: 'alice', beneficiaryRole: 'toc', fundId: 'fund:fixture',
    automationToolId: 'tool:fixture', sourceProvider: 'synthetic-provider',
    providerReference: `external_${suffix}`, payoutAccountId: 'fixture_alice',
    evidenceSha256: 'e'.repeat(64), currency: 'usd', grossAmountMinor: 500,
    operatingCostMinor: 100, occurredAt: Math.floor(Date.now() / 1000), ...patch,
  };
}
async function deliverReceipt(DB, receipt, worker = legacyFixtureBillingWorker) {
  const raw = JSON.stringify(receipt);
  const response = await worker.fetch(new Request('https://settlement.example/v1/earnings', {
    method: 'POST', headers: { 'Sky-Receipt-Signature': signature(raw) }, body: raw,
  }), { DB, BILLING_SHARED_SECRET: sharedSecret, SETTLEMENT_INGEST_SECRET: ingestSecret,
    PAYOUT_ADAPTER_SECRET: payoutSecret, SKY_ORIGIN: origin });
  return { status: response.status, body: await response.json() };
}
function assertUnappliedOnly(DB, receiptId) {
  const state = accountingSnapshot(DB);
  assert.equal(state.earning_receipts.length, 1);
  assert.equal(state.earning_receipts[0].receipt_id, receiptId);
  assert.equal(state.earning_receipts[0].applied_at, null);
  assert.equal(state.earning_receipts[0].sky_fee_minor, 0);
  assert.equal(state.earning_receipts[0].distributable_minor, 0);
  for (const table of accountingTables.slice(1)) assert.deepEqual(state[table], []);
}
function assertOneAllocation(DB, receipt) {
  const state = accountingSnapshot(DB);
  assert.equal(state.earning_receipts.length, 1);
  const row = state.earning_receipts[0];
  assert.equal(row.receipt_id, receipt.receiptId);
  assert.equal(row.execution_receipt_id, receipt.executionReceiptId);
  assert.equal(row.provider_reference, receipt.providerReference);
  assert.equal(row.user_id, receipt.userId);
  assert.equal(row.currency, 'usd');
  assert.equal(row.gross_minor, 500);
  assert.equal(row.operating_cost_minor, 100);
  assert.ok(Number.isSafeInteger(row.applied_at));
  assert.equal(row.sky_fee_minor, 400);
  assert.equal(row.distributable_minor, 0);
  assert.equal(state.monthly_earning_settlements.length, 1);
  assert.equal(state.monthly_earning_settlements[0].receipt_count, 1);
  assert.equal(state.monthly_earning_settlements[0].sky_fee_minor, 400);
  assert.equal(state.monthly_fund_earning_settlements.length, 1);
  assert.equal(state.earning_ledger_entries.length, 3);
  assert.equal(new Set(state.earning_ledger_entries.map((r) => r.entry_id)).size, 3);
  assert.equal(state.payout_instructions.length, 1);
  assert.equal(state.payout_instructions[0].receipt_id, receipt.receiptId);
  assert.equal(state.payout_instructions[0].status, 'not_required');
  assert.equal(state.payout_instructions[0].amount_minor, 0);
  assert.equal(state.rock_fee_collection_instructions.length, 1);
  assert.equal(state.rock_fee_collection_instructions[0].instruction_id, `rock-fee:${receipt.receiptId}`);
  assert.equal(state.rock_fee_collection_instructions[0].status, 'awaiting_wallet');
  assert.equal(state.rock_fee_collection_instructions[0].amount_minor, 400);
  return state;
}

void test('file DB: INSERT survives interruption before batch and same receipt recovers exactly once after reopen', async (t) => {
  const open = fileBillingFixture(t), receipt = recoveryReceipt();
  let faults = 0;
  let DB = open({ beforeBatch() { faults++; throw new Error('fixture_before_batch'); } });
  assert.equal((await deliverReceipt(DB, receipt)).status, 500);
  assert.equal(faults, 1);
  assertUnappliedOnly(DB, receipt.receiptId);
  DB.close();
  DB = open();
  assertUnappliedOnly(DB, receipt.receiptId);
  const recovered = await deliverReceipt(DB, receipt);
  assert.equal(recovered.status, 200);
  assert.equal(recovered.body.replay, true);
  const committed = assertOneAllocation(DB, receipt);
  assert.equal(recovered.body.receipt.payoutInstructionId, committed.payout_instructions[0].instruction_id);
  DB.close();
  DB = open();
  assert.deepEqual(accountingSnapshot(DB), committed);
  const replay = await deliverReceipt(DB, receipt);
  assert.equal(replay.status, 200);
  assert.equal(replay.body.replay, true);
  assert.deepEqual(replay.body.receipt, recovered.body.receipt);
  assert.deepEqual(accountingSnapshot(DB), committed);
});

void test('file DB: committed batch with lost acknowledgement returns original instructions after reopen', async (t) => {
  const open = fileBillingFixture(t), receipt = recoveryReceipt();
  let faults = 0;
  let DB = open({ afterCommit() { faults++; throw new Error('fixture_ack_lost'); } });
  assert.equal((await deliverReceipt(DB, receipt)).status, 500);
  assert.equal(faults, 1);
  const committed = assertOneAllocation(DB, receipt);
  DB.close();
  DB = open();
  assert.deepEqual(accountingSnapshot(DB), committed);
  const replay = await deliverReceipt(DB, receipt);
  assert.equal(replay.status, 200);
  assert.equal(replay.body.replay, true);
  assert.equal(replay.body.receipt.payoutInstructionId, committed.payout_instructions[0].instruction_id);
  assert.deepEqual(accountingSnapshot(DB), committed);
  DB.close();
  DB = open();
  assert.equal((await deliverReceipt(DB, receipt)).body.replay, true);
  assert.deepEqual(accountingSnapshot(DB), committed);
});

void test('file DB: failure after partial batch statements rolls back allocation before same-key reopen recovery', async (t) => {
  const open = fileBillingFixture(t), receipt = recoveryReceipt();
  let faults = 0;
  let DB = open({ afterStatement(index) {
    if (index !== 3) return;
    // Both owner and fund aggregates exist inside the uncommitted transaction.
    assert.equal(DB.database.prepare('SELECT sky_fee_minor FROM monthly_earning_settlements').get().sky_fee_minor, 400);
    assert.equal(DB.database.prepare('SELECT COUNT(*) AS n FROM monthly_fund_earning_settlements').get().n, 1);
    faults++;
    throw new Error('fixture_partial_batch');
  } });
  assert.equal((await deliverReceipt(DB, receipt)).status, 500);
  assert.equal(faults, 1);
  assertUnappliedOnly(DB, receipt.receiptId);
  DB.close();
  DB = open();
  assertUnappliedOnly(DB, receipt.receiptId);
  assert.equal((await deliverReceipt(DB, receipt)).status, 200);
  const committed = assertOneAllocation(DB, receipt);
  assert.equal((await deliverReceipt(DB, receipt)).body.replay, true);
  assert.deepEqual(accountingSnapshot(DB), committed);
});

void test('file DB: two delivery contexts interleave before explicitly serialized 400+488-cent batches', { timeout: 10000 }, async (t) => {
  const open = fileBillingFixture(t);
  const reachedA = Promise.withResolvers(), reachedB = Promise.withResolvers();
  const releaseA = Promise.withResolvers(), releaseB = Promise.withResolvers();
  const A = open({ async beforeBatch() { reachedA.resolve(); await releaseA.promise; } });
  const B = open({ async beforeBatch() { reachedB.resolve(); await releaseB.promise; } });
  const first = recoveryReceipt('first');
  const second = recoveryReceipt('second', { occurredAt: first.occurredAt, grossAmountMinor: 1000 });
  // Same normalized owner, not two authenticated devices or a contract resolver.
  const requestA = deliverReceipt(A, first);
  await reachedA.promise;
  const requestB = deliverReceipt(B, second);
  try {
    await reachedB.promise;
    assert.equal(accountingSnapshot(A).earning_receipts.length, 2);
    assert.equal(accountingSnapshot(A).monthly_earning_settlements.length, 0);
    releaseA.resolve();
    const resultA = await requestA;
    assert.equal(resultA.status, 201);
    assert.equal(resultA.body.receipt.skyFeeMinor, 400);
    releaseB.resolve();
    const resultB = await requestB;
    assert.equal(resultB.status, 201);
    assert.equal(resultB.body.receipt.skyFeeMinor, 488);
  } finally {
    releaseA.resolve(); releaseB.resolve();
    await Promise.allSettled([requestA, requestB]);
  }
  const committed = accountingSnapshot(A);
  const month = committed.monthly_earning_settlements[0];
  assert.equal(committed.monthly_earning_settlements.length, 1);
  assert.equal(month.receipt_count, 2);
  assert.equal(month.sky_fee_minor, 888);
  assert.equal(month.gross_minor, 1500);
  assert.equal(month.operating_cost_minor, 200);
  assert.equal(month.distributable_minor, 412);
  assert.equal(month.gross_minor, month.operating_cost_minor + month.sky_fee_minor + month.distributable_minor);
  assert.equal(committed.payout_instructions.length, 2);
  assert.equal(committed.rock_fee_collection_instructions.length, 2);
  A.close(); B.close();
  const reopened = open();
  assert.deepEqual(accountingSnapshot(reopened), committed);
  for (const receipt of [first, second]) assert.equal((await deliverReceipt(reopened, receipt)).body.replay, true);
  assert.deepEqual(accountingSnapshot(reopened), committed);
  const afterCap = await deliverReceipt(reopened, recoveryReceipt('after_cap', { occurredAt: first.occurredAt, operatingCostMinor: 0 }));
  assert.equal(afterCap.body.receipt.skyFeeMinor, 0);
  assert.equal(afterCap.body.receipt.distributableMinor, 500);
  assert.equal(accountingSnapshot(reopened).monthly_earning_settlements[0].sky_fee_minor, 888);
});

void test('file DB: provider-reference aliases and changed owner/amount/currency cannot change persisted accounting', async (t) => {
  const open = fileBillingFixture(t), receipt = recoveryReceipt();
  let DB = open();
  assert.equal((await deliverReceipt(DB, receipt)).status, 201);
  const committed = assertOneAllocation(DB, receipt);
  DB.close(); DB = open();
  const alias = { receiptId: 'alias_receipt', executionReceiptId: 'alias_execution' };
  for (const patch of [alias, { ...alias, userId: 'mallory' },
    { ...alias, grossAmountMinor: 600 }, { grossAmountMinor: 600 }]) {
    assert.equal((await deliverReceipt(DB, { ...receipt, ...patch })).status, 409);
    assert.deepEqual(accountingSnapshot(DB), committed);
  }
  assert.equal((await deliverReceipt(DB, { ...receipt, ...alias, currency: 'eur' })).status, 400);
  assert.deepEqual(accountingSnapshot(DB), committed);
  assert.equal((await deliverReceipt(DB, receipt)).body.replay, true);
  assert.deepEqual(accountingSnapshot(DB), committed);
});

void test('file DB: deployed default policy stays on hold with zero mutation before and after legacy recovery', async (t) => {
  const open = fileBillingFixture(t), receipt = recoveryReceipt();
  let DB = open();
  const empty = accountingSnapshot(DB);
  let rejected = await deliverReceipt(DB, receipt, billingWorker);
  assert.equal(rejected.status, 409);
  assert.equal(rejected.body.code, 'SKY_FEE_POLICY_ON_HOLD');
  assert.deepEqual(accountingSnapshot(DB), empty);
  assert.equal((await deliverReceipt(DB, receipt)).status, 201);
  const committed = assertOneAllocation(DB, receipt);
  DB.close(); DB = open();
  for (const value of [receipt, recoveryReceipt('new')]) {
    rejected = await deliverReceipt(DB, value, billingWorker);
    assert.equal(rejected.status, 409);
    assert.equal(rejected.body.code, 'SKY_FEE_POLICY_ON_HOLD');
    assert.deepEqual(accountingSnapshot(DB), committed);
  }
});

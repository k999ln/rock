import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { TestD1 } from './fixtures/billing-test-d1.mjs';
import { accountingTables, deliver, snapshot } from './fixtures/billing-process-crash-child.mjs';

const points = ['before-batch', ...Array.from({ length: 11 }, (_, i) => `statement-${i}`), 'after-commit'];
function receipt(suffix, occurredAt, grossAmountMinor = 500) {
  return {
    receiptId: `crash_${suffix}`, executionReceiptId: `execution_${suffix}`,
    userId: 'fixture-owner', beneficiaryRole: 'toc', fundId: 'fund:fixture',
    automationToolId: 'tool:fixture', sourceProvider: 'synthetic-provider',
    providerReference: `external_${suffix}`, payoutAccountId: 'fixture_account',
    evidenceSha256: 'e'.repeat(64), currency: 'usd', grossAmountMinor,
    operatingCostMinor: 100, occurredAt,
  };
}
function assertApplied(state, input) {
  const row = state.earning_receipts[0];
  assert.equal(state.earning_receipts.length, 1);
  assert.equal(row.receipt_id, input.receiptId);
  assert.equal(row.execution_receipt_id, input.executionReceiptId);
  assert.equal(row.provider_reference, input.providerReference);
  assert.equal(row.user_id, input.userId);
  assert.ok(Number.isSafeInteger(row.applied_at));
  assert.equal(row.sky_fee_minor, 400);
  assert.equal(row.distributable_minor, 0);
  for (const table of ['monthly_earning_settlements', 'monthly_fund_earning_settlements']) {
    assert.equal(state[table].length, 1);
    assert.equal(state[table][0].receipt_count, 1);
    assert.equal(state[table][0].sky_fee_minor, 400);
  }
  assert.equal(state.earning_ledger_entries.length, 3);
  assert.equal(new Set(state.earning_ledger_entries.map(r => r.entry_id)).size, 3);
  assert.equal(state.payout_instructions.length, 1);
  assert.equal(state.payout_instructions[0].instruction_id, `pay:${input.receiptId}`);
  assert.equal(state.payout_instructions[0].status, 'not_required');
  assert.equal(state.payout_instructions[0].amount_minor, 0);
  assert.equal(state.rock_fee_collection_instructions.length, 1);
  assert.equal(state.rock_fee_collection_instructions[0].instruction_id, `rock-fee:${input.receiptId}`);
  assert.equal(state.rock_fee_collection_instructions[0].status, 'awaiting_wallet');
  assert.equal(state.rock_fee_collection_instructions[0].amount_minor, 400);
}

for (const point of points) {
  void test(`SIGKILL at ${point}: fresh SQLite connection recovers one allocation and the same instructions`, {
    timeout: 20000,
    skip: process.platform === 'win32' ? 'Requires POSIX SIGKILL; Windows is not process-crash acceptance.' : false,
  }, async t => {
    const directory = mkdtempSync(join(tmpdir(), 'wallet-process-recovery-'));
    const databasePath = join(directory, 'billing.sqlite');
    const handles = [];
    let child = null;
    let exited = Promise.resolve();
    t.after(async () => {
      try {
        if (child) {
          if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
          await exited;
        }
        for (const DB of handles) DB.close();
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
      assert.equal(existsSync(directory), false, 'DB/WAL/SHM and temp directory removed');
    });
    const open = migrate => {
      const DB = new TestD1(databasePath, { migrate }); handles.push(DB); return DB;
    };
    const initial = open(true);
    initial.database.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL');
    initial.close();
    const input = receipt('one', Math.floor(Date.now() / 1000));
    child = fork(new URL('./fixtures/billing-process-crash-child.mjs', import.meta.url), [], {
      execArgv: ['--experimental-strip-types'], env: {}, stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
    });
    let errors = '';
    child.stderr.on('data', chunk => { errors = (errors + chunk).slice(-4000); });
    exited = new Promise(resolve => {
      child.once('exit', (code, signal) => resolve({ code, signal }));
      child.once('error', error => resolve({ error: String(error) }));
    });
    const reached = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`checkpoint timeout: ${errors}`)), 10000);
      const finish = (error, value) => {
        clearTimeout(timer);
        if (error) reject(error); else resolve(value);
      };
      child.once('message', message => finish(null, message));
      child.once('error', error => finish(error));
      child.once('exit', (code, signal) => finish(new Error(`early exit ${code}/${signal}: ${errors}`)));
      child.send({ databasePath, point, receipt: input }, error => { if (error) finish(error); });
    });
    assert.equal(reached.kind, 'checkpoint', JSON.stringify(reached));
    assert.equal(reached.point, point);
    assert.equal(reached.pid, child.pid);
    assert.notEqual(child.pid, process.pid);
    assert.equal(reached.journal, 'wal');
    assert.equal(reached.state.earning_receipts.length, 1);
    assert.equal(reached.state.earning_receipts[0].receipt_id, input.receiptId);
    if (point.startsWith('statement-')) {
      const index = Number(point.slice('statement-'.length));
      assert.equal(reached.state.earning_receipts[0].sky_fee_minor, 400);
      assert.equal(reached.state.monthly_earning_settlements.length, index >= 2 ? 1 : 0);
      assert.equal(reached.state.earning_receipts[0].applied_at !== null, index === 10);
    }
    assert.equal(child.kill('SIGKILL'), true);
    assert.deepEqual(await exited, { code: null, signal: 'SIGKILL' });

    let DB = open(false);
    assert.equal(DB.database.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
    const afterCrash = snapshot(DB);
    if (point === 'after-commit') {
      assertApplied(afterCrash, input);
      assert.deepEqual(afterCrash, reached.state, 'commit survives process death before acknowledgement');
    } else {
      assert.equal(afterCrash.earning_receipts.length, 1);
      assert.equal(afterCrash.earning_receipts[0].applied_at, null);
      assert.equal(afterCrash.earning_receipts[0].sky_fee_minor, 0);
      assert.equal(afterCrash.earning_receipts[0].distributable_minor, 0);
      for (const table of accountingTables.slice(1)) assert.deepEqual(afterCrash[table], []);
    }
    // The deployed Worker cannot resume the internal legacy fixture or charge.
    const held = await deliver(DB, input, { currentPolicy: true });
    assert.equal(held.status, 409);
    assert.equal(held.body.code, 'SKY_FEE_POLICY_ON_HOLD');
    assert.deepEqual(snapshot(DB), afterCrash);
    const recovered = await deliver(DB, input);
    assert.equal(recovered.status, 200);
    assert.equal(recovered.body.replay, true);
    const committed = snapshot(DB);
    assertApplied(committed, input);
    assert.equal(recovered.body.receipt.payoutInstructionId, `pay:${input.receiptId}`);
    if (point === 'after-commit') assert.deepEqual(committed, afterCrash);
    DB.close(); DB = open(false);
    assert.deepEqual(snapshot(DB), committed);
    const replay = await deliver(DB, input);
    assert.deepEqual(replay, recovered);
    assert.deepEqual(snapshot(DB), committed);

    // A replay cannot consume the monthly cap again, even after a process crash.
    const second = receipt('two', input.occurredAt, 1000);
    assert.equal((await deliver(DB, second)).body.receipt.skyFeeMinor, 488);
    const third = receipt('three', input.occurredAt);
    assert.equal((await deliver(DB, third)).body.receipt.skyFeeMinor, 0);
    const final = snapshot(DB);
    const month = final.monthly_earning_settlements[0];
    assert.equal(month.sky_fee_minor, 888);
    assert.equal(month.receipt_count, 3);
    assert.equal(month.gross_minor, month.operating_cost_minor + month.sky_fee_minor + month.distributable_minor);
    for (const item of [input, second, third]) assert.equal((await deliver(DB, item)).body.replay, true);
    assert.deepEqual(snapshot(DB), final);
    const rejected = await deliver(DB, receipt('held', input.occurredAt), { currentPolicy: true });
    assert.equal(rejected.status, 409);
    assert.deepEqual(snapshot(DB), final);
  });
}

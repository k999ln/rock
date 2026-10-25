// Synthetic local SQLite fixture only: no Provider, real account or cash access.
import { createHmac } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import billingWorker, { legacyFixtureBillingWorker } from '../../services/sky-billing/src/worker.ts';
import { TestD1 } from './billing-test-d1.mjs';

export const accountingTables = [
  'earning_receipts', 'monthly_earning_settlements',
  'monthly_fund_earning_settlements', 'earning_ledger_entries',
  'payout_instructions', 'rock_fee_collection_instructions',
];
export function snapshot(DB) {
  // Normalize SQLite's null-prototype rows to the IPC JSON representation.
  return JSON.parse(JSON.stringify(Object.fromEntries(accountingTables.map(table => [
    table, DB.database.prepare(`SELECT * FROM ${table} ORDER BY 1, 2`).all(),
  ]))));
}
export async function deliver(DB, receipt, { currentPolicy = false } = {}) {
  const raw = JSON.stringify(receipt);
  const timestamp = Math.floor(Date.now() / 1000);
  const syntheticSecret = 'wallet-process-fixture-only'.repeat(2);
  const signature = createHmac('sha256', syntheticSecret)
    .update(`${timestamp}.${raw}`).digest('hex');
  const response = await (currentPolicy ? billingWorker : legacyFixtureBillingWorker).fetch(
    new Request('https://settlement.example/v1/earnings', {
      method: 'POST', body: raw,
      headers: { 'Sky-Receipt-Signature': `t=${timestamp},v1=${signature}` },
    }), {
      DB, BILLING_SHARED_SECRET: syntheticSecret, SETTLEMENT_INGEST_SECRET: syntheticSecret,
      PAYOUT_ADAPTER_SECRET: syntheticSecret, SKY_ORIGIN: 'https://sky.example',
    },
  );
  return { status: response.status, body: await response.json() };
}

// Importing the helpers never starts a process or registers an IPC handler.
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  process.once('message', async ({ databasePath, point, receipt }) => {
    let DB;
    const pause = async reached => {
      if (reached !== point) return;
      process.send({ kind: 'checkpoint', point: reached, pid: process.pid,
        journal: DB.database.prepare('PRAGMA journal_mode').get().journal_mode,
        state: snapshot(DB) });
      // The parent, not this hook, kills us. No exception, rollback or close runs.
      await new Promise(() => { setInterval(() => {}, 1000); });
    };
    try {
      DB = new TestD1(databasePath, { migrate: false, hooks: {
        beforeBatch: () => pause('before-batch'),
        afterStatement: index => pause(`statement-${index}`),
        afterCommit: () => pause('after-commit'),
      } });
      DB.database.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL');
      const result = await deliver(DB, receipt);
      process.send({ kind: 'unexpected-completion', status: result.status });
    } catch (error) {
      process.send({ kind: 'fixture-error', error: String(error) });
    } finally {
      // Reaching here before the checkpoint kill is always a failed test.
      DB?.close();
      process.exitCode = 1;
      process.disconnect();
    }
  });
}

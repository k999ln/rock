import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createTeamCase, applyTeamAction, teamMoney } from '../lib/coconala-team.ts';
import { coconalaTeamStore } from '../lib/coconala-team-store.ts';

const terms = {
  title: '商品紹介記事', orderReference: 'coconala-123', clientLabel: '依頼者A',
  workerName: '担当者B', scope: '記事の構成と本文を作る', deliveryDate: '2026-10-10',
  deliveryPlace: '本人へ非公開ファイルで納品', inspectionDate: '2026-10-12',
  revisionScope: '誤字と事実誤認を1回修正', rights: '顧客への利用許諾範囲を別途確認',
  grossYen: 10000, estimatedPlatformFeePercent: 22, workerFeeYen: 7566,
  workerPaymentDate: '2026-11-10', platformRulesReference: '規約を2026-09-26に確認',
  customerDisclosureReference: 'ココナラ内メッセージ 2026-09-26',
  workerTermsReference: '発注条件を本人が送付 2026-09-26',
};
const command = (action, extra = {}) => ({ id: randomUUID(), action, ...extra });

void test('fixes the contractor fee before assignment and keeps estimates separate from real money', () => {
  let file = createTeamCase({ id: randomUUID(), terms });
  assert.deepEqual(teamMoney(file), {
    estimatedFee: 2200, estimatedNet: 7800, estimatedOperatorMargin: 234,
    manuallyRecordedCustomerNet: 0, workerPaid: 0, workerRemaining: 7566,
  });
  assert.throws(() => applyTeamAction(file, command('deliver', { note: '完了' }), 0));
  file = applyTeamAction(file, command('assign'), 0);
  assert.equal(file.status, 'assigned');
  assert.throws(() => applyTeamAction(file, command('update_terms', { terms: { ...terms, workerFeeYen: 1 } }), 1), /担当開始後/);
  assert.throws(() => applyTeamAction(file, command('accept', { note: '確認' }), 1));
  file = applyTeamAction(file, command('deliver', { note: '成果物を受領し検査' }), 1);
  file = applyTeamAction(file, command('accept', { note: '顧客が検収' }), 2);
  assert.equal(file.status, 'accepted');
});

void test('allows worker payout before customer receipt, tracks partials and rejects overpayment', () => {
  let file = applyTeamAction(createTeamCase({ id: randomUUID(), terms }), command('assign'), 0);
  file = applyTeamAction(file, command('record_worker_payment', { amountYen: 3000, reference: 'bank-01' }), 1);
  assert.equal(teamMoney(file).workerRemaining, 4566);
  file = applyTeamAction(file, command('record_customer_receipt', { amountYen: 7800, reference: 'coconala-sale-01' }), 2);
  file = applyTeamAction(file, command('record_refund', { amountYen: 800, reference: 'coconala-refund-01' }), 3);
  assert.equal(teamMoney(file).manuallyRecordedCustomerNet, 7000);
  assert.throws(() => applyTeamAction(file, command('record_worker_payment', { amountYen: 5000, reference: 'bank-02' }), 4), /超え/);
  assert.throws(() => applyTeamAction(file, command('record_refund', { amountYen: 7100, reference: 'refund-02' }), 4), /超え/);
  assert.throws(() => applyTeamAction(file, command('assign'), 0), /別の操作/);
});

void test('rejects unsupported payout conditions and malformed terms', () => {
  for (const change of [
    { workerFeeYen: 9000 }, { workerFeeYen: -1 },
    { workerPaymentDate: '2027-01-01' }, { workerPaymentDate: '入金後' },
    { workerTermsReference: '' }, { estimatedPlatformFeePercent: 200 },
  ]) assert.throws(() => createTeamCase({ id: randomUUID(), terms: { ...terms, ...change } }));
});

void test('persists owner-isolated cases and enforces revision compare-and-swap', async (t) => {
  const sqlite = new DatabaseSync(':memory:');
  t.after(() => sqlite.close());
  const hostedSchema = new URL('../sky-schema-bootstrap.json', import.meta.url);
  if (existsSync(hostedSchema)) {
    // Native Sky initializes from this exact idempotent schema in the Worker.
    for (const statement of JSON.parse(readFileSync(hostedSchema, 'utf8'))) sqlite.exec(statement);
  } else {
    for (const file of readdirSync(new URL('../drizzle/', import.meta.url))
      .filter((name) => name.endsWith('.sql') && !name.startsWith('._')).sort())
      for (const statement of readFileSync(new URL(`../drizzle/${file}`, import.meta.url), 'utf8')
        .split('--> statement-breakpoint').filter((sql) => sql.trim())) sqlite.exec(statement);
  }
  const db = {
    prepare(sql) {
      const statement = sqlite.prepare(sql);
      return { bind(...args) {
        return {
          async first() { return statement.get(...args) ?? null; },
          async all() { return { results: statement.all(...args) }; },
          async run() { const meta = statement.run(...args); return { meta: { changes: meta.changes } }; },
        };
      } };
    },
  };
  const store = coconalaTeamStore(db);
  const file = createTeamCase({ id: randomUUID(), terms });
  assert.equal((await store.create('owner-a', file))?.id, file.id);
  assert.equal((await store.list('owner-b')).length, 0);
  assert.equal(await store.get('owner-b', file.id), null);
  const next = applyTeamAction(file, command('assign'), 0);
  assert.equal(await store.update('owner-a', next, 0), true);
  assert.equal(await store.update('owner-a', next, 0), false);
  assert.equal((await store.get('owner-a', file.id))?.status, 'assigned');
  assert.equal(await store.removeDraft('owner-a', file.id, 1), false);
  assert.equal((await store.get('owner-a', file.id))?.status, 'assigned');

  const draft = createTeamCase({ id: randomUUID(), terms });
  await store.create('owner-a', draft);
  assert.equal(await store.removeDraft('owner-b', draft.id, 0), false);
  assert.equal((await store.get('owner-a', draft.id))?.revision, 0);
  const edited = applyTeamAction(draft, command('update_terms', {
    terms: { ...terms, title: '修正した下書き' },
  }), 0);
  assert.equal(await store.update('owner-a', edited, 0), true);
  assert.equal(await store.removeDraft('owner-a', draft.id, 0), false);
  assert.equal((await store.get('owner-a', draft.id))?.terms.title, '修正した下書き');
  assert.equal(await store.removeDraft('owner-a', draft.id, 1), true);
  assert.equal(await store.get('owner-a', draft.id), null);
  assert.equal((await store.list('owner-a')).some((item) => item.id === draft.id), false);
  assert.equal(await store.removeDraft('owner-a', draft.id, 1), false);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { loadRouteFixture } from './route-fixture.mjs';
import { requestUser } from '../lib/request-auth.ts';
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

function setup(t) {
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
  return { sqlite, db, store };
}

void test('persists owner-isolated cases and enforces revision compare-and-swap', async (t) => {
  const { store } = setup(t);
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


void test('exact saved commands replay without duplicating manual money, even after later operations', () => {
  let file = applyTeamAction(createTeamCase({ id: randomUUID(), terms }), command('assign'), 0);
  const receipt = command('record_customer_receipt', { amountYen: 7800, reference: 'bank-01' });
  file = applyTeamAction(file, receipt, 1);
  const afterReceipt = file;
  assert.equal(applyTeamAction(file, receipt, 1), file);
  file = applyTeamAction(file, command('deliver', { note: '受領' }), 2);
  assert.equal(applyTeamAction(file, { reference: ' bank-01 ', amountYen: 7800,
    action: receipt.action, id: receipt.id.toUpperCase() }, 1), file);
  assert.equal(file.customerReceipts.length, 1);
  assert.equal(teamMoney(file).manuallyRecordedCustomerNet, 7800);
  for (const changed of [{ amountYen: 7801 }, { reference: 'bank-02' }, { action: 'record_refund' }])
    assert.throws(() => applyTeamAction(file, { ...receipt, ...changed }, file.revision), { status: 409 });
  assert.throws(() => applyTeamAction(file, { ...receipt, note: 'ignored field' }, file.revision), { status: 400 });
  const legacy = structuredClone(afterReceipt);
  delete legacy.events.find((event) => event.id === receipt.id).command;
  assert.throws(() => applyTeamAction(legacy, receipt, legacy.revision), { status: 409 });
  const maxed = { ...file, revision: Number.MAX_SAFE_INTEGER };
  assert.throws(() => applyTeamAction(maxed, command('accept', { note: '確認' }), maxed.revision), { status: 409 });
  assert.equal(applyTeamAction(maxed, receipt, 1), maxed);
});

void test('real API and SQLite recover lost create/action responses and retain owner isolation', async (t) => {
  const { sqlite, db } = setup(t);
  const refs = new Map([
    ['@/lib/fund-store', { database: () => db, requestUser }],
    ...await Promise.all(['coconala-team', 'coconala-team-store'].map(async (name) =>
      [`@/lib/${name}`, await import(new URL(`../lib/${name}.ts`, import.meta.url).href)])),
  ]);
  const route = loadRouteFixture(new URL('../app/api/coconala-team/route.ts', import.meta.url), refs);
  async function call(method, body, owner = 'fixture-alice', origin = 'https://local.test') {
    const response = await route[method](new Request('https://local.test/api/coconala-team', {
      method, headers: { 'content-type': 'application/json', origin,
        ...(owner ? { 'oai-authenticated-user-id': owner } : {}) },
      ...(method === 'GET' ? {} : { body: JSON.stringify(body) }),
    }));
    assert.equal(response.headers.get('cache-control'), 'no-store');
    return { status: response.status, data: await response.json() };
  }
  const create = { id: randomUUID(), terms };
  assert.equal((await call('POST', create, null)).status, 401);
  assert.equal((await call('POST', create, 'fixture-alice', 'https://other.test')).status, 403);
  const first = await call('POST', create);
  assert.equal(first.status, 201);
  assert.deepEqual(await call('POST', create), first, 'lost creation response reuses the same case');
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM coconala_team_cases').get().n, 1);
  const edit = { caseId: create.id, revision: 0,
    command: command('update_terms', { terms: { ...terms, title: '別画面で条件更新' } }) };
  const edited = await call('PATCH', edit);
  assert.equal(edited.status, 200);
  const recoveredCreate = await call('POST', create);
  assert.deepEqual(recoveredCreate.data, edited.data, 'original create proof survives later edits');
  assert.equal((await call('POST', { ...create, terms: { ...terms, title: '別の依頼' } })).status, 409);
  assert.equal((await call('POST', create, 'fixture-bob')).status, 409);
  assert.deepEqual((await call('GET', undefined, 'fixture-bob')).data.cases, []);
  assert.equal((await call('PATCH', edit, 'fixture-bob')).status, 404);
  const assign = { caseId: create.id, revision: 1, command: command('assign') };
  assert.equal((await call('PATCH', assign)).status, 200);
  const money = { caseId: create.id, revision: 2,
    command: command('record_worker_payment', { amountYen: 3000, reference: 'manual-bank-01' }) };
  const saved = await call('PATCH', money);
  assert.equal(saved.status, 200);
  assert.deepEqual(await call('PATCH', money), saved, 'lost PATCH response does not pay or record twice');
  assert.equal(saved.data.caseFile.workerPayments.length, 1);
  assert.equal(saved.data.caseFile.revision, 3);
  assert.equal((await call('PATCH', { ...money, command: { ...money.command, amountYen: 3001 } })).status, 409);
  assert.equal((await call('PATCH', { ...money, command: command('deliver', { note: 'stale' }) })).status, 409);
  const readback = await call('GET');
  assert.equal(readback.data.cases.length, 1);
  assert.deepEqual(readback.data.cases[0], saved.data.caseFile);
});

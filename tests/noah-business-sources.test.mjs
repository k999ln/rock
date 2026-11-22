import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRentracksCapture } from '../toolkits/noah-affiliate-agents/business-rentracks.mjs';
import {
  applySourceObservation,
  sourceStatus,
  matchBankEntries,
} from '../toolkits/noah-affiliate-agents/business-sources.mjs';
import { emptyBusinessLedger } from '../toolkits/noah-affiliate-agents/business-core.mjs';

const now = Date.parse('2026-11-22T04:00:00.000Z');
const target = {
  offerId: 'synthetic-offer',
  productName: '合成の研修案件',
  siteId: '999999',
};
const fields = [
  'No',
  'クリック日時',
  '売上日時',
  '売上番号',
  '広告主',
  'プロダクト',
  '売上額',
  '報酬額',
  '状況',
  '期限',
  '承認日',
  '備考',
  'サイトID',
  'サイト名',
  'デバイス',
  'リファラー',
  '拒否理由',
];
const row = [
  '1',
  '2026/11/20（金） 10:00:00',
  '2026/11/20（金） 10:01:00',
  '000000001',
  '合成広告主',
  target.productName,
  '¥0',
  '¥1,000',
  '拒否',
  '',
  '2026/11/21',
  'nb.' + 'a'.repeat(32),
  '999999',
  '合成媒体',
  'PC',
  'PRIVATE_REFERRER',
  '条件不一致',
];
const footer = [
  '',
  '',
  '',
  '',
  '',
  '小計',
  '¥0',
  '¥1,000',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
];
function capture() {
  const filters = {
    idDropdownlist1: [],
    idDropdownlist2: ['0'],
    idDropdownlist3: ['----'],
    idTermType: ['0'],
    idTermSelect: ['0'],
    idPageSize: ['2000'],
    idGogoYear: ['2026'],
    idGogoMonth: ['11'],
    idGogoDay: ['1'],
    idDoneYear: ['2026'],
    idDoneMonth: ['11'],
    idDoneDay: ['22'],
  };
  return {
    capturedAt: new Date(now).toISOString(),
    sourceUrl: 'https://manage.rentracks.jp/manage/detail_sales',
    headers: fields,
    rows: [structuredClone(row), structuredClone(footer)],
    filters: Object.entries(filters).map(([id, selected]) => ({
      id,
      selected,
    })),
    states: [1, 2, 3, 4].map((i) => ({ id: 'idFilter' + i, checked: true })),
  };
}
await test('real UI format: reject/reward are separate, identifiers preserve zeros, private columns stay local', () => {
  const b = normalizeRentracksCapture(capture(), target);
  assert.equal(b.rows[0].id, '000000001');
  assert.equal(b.rows[0].status, 'rejected');
  assert.equal(b.rows[0].rewardYen, 1000);
  assert.doesNotMatch(
    JSON.stringify(b),
    /PRIVATE_REFERRER|合成広告主|合成媒体/,
  );
  const c = capture();
  c.rows[0][12] = '111111';
  assert.equal(normalizeRentracksCapture(c, target).rows.length, 0);
});
await test('other offers are counted but not attributed; zero is an observed result', () => {
  const c = capture();
  c.rows[0][5] = '別案件';
  const b = normalizeRentracksCapture(c, target);
  assert.equal(b.summary.totalRows, 1);
  assert.equal(b.summary.targetRows, 0);
  const r = applySourceObservation(emptyBusinessLedger(), {}, b, target, now);
  assert.equal(r.ledger.revision, 0);
  assert.equal(r.receipt.summary.rejected, 1);
  assert.equal(r.receipt.recurringConnectionVerified, false);
  assert.equal(r.receipt.bankReceiptVerified, false);
});
await test('filter loss, subtotal mismatch, truncation, new statuses and header changes fail closed', () => {
  for (const mutate of [
    (c) => {
      c.states[2].checked = false;
    },
    (c) => {
      c.rows[1][7] = '¥999';
    },
    (c) => {
      c.filters.find((f) => f.id === 'idPageSize').selected = ['1'];
    },
    (c) => {
      c.rows[0][8] = '請求済';
    },
    (c) => {
      c.rows[0][0] = '2001';
    },
    (c) => {
      c.filters.find((f) => f.id === 'idPageSize').selected = ['Infinity'];
    },
    (c) => {
      c.headers = fields.slice(1);
    },
    (c) => {
      c.rows.push(c.rows[0]);
    },
    (c) => {
      c.filters.find((f) => f.id === 'idDropdownlist1').selected = ['999999'];
    },
  ]) {
    const c = capture();
    mutate(c);
    assert.throws(() => normalizeRentracksCapture(c, target));
  }
});
await test('observation is atomic, retry is idempotent, stale/future/conflicting inputs rejected', () => {
  const b = normalizeRentracksCapture(capture(), target),
    initial = emptyBusinessLedger();
  const first = applySourceObservation(initial, {}, b, target, now);
  assert.equal(first.ledger.revision, 1);
  assert.equal(initial.revision, 0);
  const retry = applySourceObservation(
    first.ledger,
    first.sources,
    b,
    target,
    now,
  );
  assert.equal(retry.duplicate, true);
  assert.equal(retry.ledger.revision, 1);
  assert.equal(sourceStatus(first.sources, now)[0].state, 'observed');
  assert.equal(sourceStatus(first.sources, now + 86400001)[0].state, 'stale');
  for (const patch of [
    { sourceUrl: 'https://evil.example/' },
    { observedAt: new Date(now + 120000).toISOString() },
    { observedAt: new Date(now - 86400001).toISOString() },
    { rows: [{ ...b.rows[0], rewardYen: -1 }] },
    { summary: { ...b.summary, totalRows: 0 } },
    { scope: { ...b.scope, allStates: false } },
  ])
    assert.throws(() =>
      applySourceObservation(
        first.ledger,
        first.sources,
        { ...b, ...patch },
        target,
        now,
      ),
    );
  assert.throws(() =>
    applySourceObservation(
      first.ledger,
      first.sources,
      { ...b, rows: [{ ...b.rows[0], reason: '変更' }] },
      target,
      now,
    ),
  );
});
await test('zero payout observation is not a payment; nonempty page cannot become a payout from scheduled date', () => {
  const c = {
    sourceUrl: 'https://manage.rentracks.jp/manage/detail_pay',
    capturedAt: new Date(now).toISOString(),
    headers: [
      '対象月度',
      '獲得報酬額(税込)',
      '支払報酬累計額(税込)',
      '早期支払指示額(税込)',
      '手数料(税込)',
      '早期支払額(税込)',
      '早期支払日',
      '差額報酬支払額(税込)',
      '支払予定日',
      '支払報酬額(税込)',
      '支払通知書',
    ],
    rows: [['小計', '¥0']],
  };
  const b = normalizeRentracksCapture(c, target),
    r = applySourceObservation(emptyBusinessLedger(), {}, b, target, now);
  assert.deepEqual(r.ledger.payouts, {});
  assert.deepEqual(r.ledger.deposits, {});
  c.rows.unshift(['2026/11', '¥1000']);
  assert.throws(() => normalizeRentracksCapture(c, target));
});
await test('bank reconciliation requires account, exact payer, actual credit and unique bidirectional match', () => {
  const payout = { id: 'synthetic-pay', amountYen: 1000, paidOn: '2026-11-20' };
  const entry = {
    id: 'synthetic-bank',
    direction: 'credit',
    payer: 'SYNTHETIC ASP',
    amountYen: 1000,
    receivedOn: '2026-11-20',
    sourceRef: 'synthetic-bank-proof',
  };
  const options = { accountMatched: true, payer: 'SYNTHETIC ASP' };
  assert.throws(() =>
    matchBankEntries([payout], [entry], { ...options, accountMatched: false }),
  );
  assert.equal(matchBankEntries([payout], [entry], options).rows.length, 1);
  for (const patch of [
    { payer: 'OTHER' },
    { amountYen: 1001 },
    { direction: 'debit' },
    { receivedOn: '2026-11-19' },
    { receivedOn: '2026-11-26' },
  ])
    assert.equal(
      matchBankEntries([payout], [{ ...entry, ...patch }], options).rows.length,
      0,
    );
  assert.equal(
    matchBankEntries([payout], [entry, { ...entry, id: 'second' }], options)
      .rows.length,
    0,
  );
  assert.equal(
    matchBankEntries(
      [payout, { ...payout, id: 'second-pay' }],
      [entry],
      options,
    ).rows.length,
    0,
  );
  assert.throws(() => matchBankEntries([payout], [entry, entry], options));
});

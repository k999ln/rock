// 離脱率を測る（task 103）: eSIM つきとカードだけを、同じ値段・同じ機能で比べる。
// 仕様: docs/structure/03-esim.md の 0.3.3、codex/tasks/103-esim-churn-measure.md。
import test from 'node:test';
import assert from 'node:assert/strict';
import { addUtcMonths, cohortChurn, wilsonInterval } from '../lib/churn-cohort.ts';

const at = (iso) => Date.parse(iso);
const close = (actual, expected, label) => assert.ok(Math.abs(actual - expected) < 1e-9, `${label}: ${actual} ≠ ${expected}`);
const sub = (arm, startIso, periodsPaid, endIso = null) => ({ arm, startedAt: at(startIso), periodsPaid, endedAt: endIso === null ? null : at(endIso) });
const many = (n, make) => Array.from({ length: n }, (_, i) => make(i));

void test('Wilson の幅は既知の値と合う', () => {
  const zero = wilsonInterval(0, 10);
  close(zero.low, 0, '0/10 の下');
  close(zero.high, 0.2775327998628892, '0/10 の上');
  const half = wilsonInterval(5, 10);
  close(half.low, 0.236593090512564, '5/10 の下');
  close(half.high, 0.7634069094874361, '5/10 の上');
  assert.equal(wilsonInterval(0, 0), null);
  assert.throws(() => wilsonInterval(3, 2), RangeError);
});

void test('暦月の足し算は、月末をその月の最後の日にそろえる', () => {
  assert.equal(new Date(addUtcMonths(at('2026-11-30T12:00:00Z'), 3)).toISOString(), '2027-02-28T12:00:00.000Z');
  assert.equal(new Date(addUtcMonths(at('2026-01-15T00:00:00Z'), 12)).toISOString(), '2027-01-15T00:00:00.000Z');
});

void test('試行の数え方: 解約した人は払った回数、続いている人は払った回数 − 1', () => {
  const asOf = at('2027-06-01T00:00:00Z');
  const rows = [
    ...many(5, () => sub('esim', '2027-01-01T00:00:00Z', 4, '2027-05-01T00:00:00Z')), // 4 回の試行・やめた 1
    ...many(5, () => sub('esim', '2027-01-01T00:00:00Z', 6)), // 5 回の試行・やめた 0
    ...many(5, () => sub('card', '2027-01-01T00:00:00Z', 1, '2027-02-01T00:00:00Z')),
  ];
  const report = cohortChurn(rows, asOf, { minTrialsPerArm: 1 });
  assert.equal(report.arms.esim.people, 10);
  assert.equal(report.arms.esim.trials, 5 * 4 + 5 * 5);
  assert.equal(report.arms.esim.cancels, 5);
  close(report.arms.esim.monthlyChurn, 5 / 45, 'eSIM の月ごとの解約率');
  assert.equal(report.arms.card.trials, 5);
  close(report.arms.card.monthlyChurn, 1, 'カードの月ごとの解約率');
});

void test('3 か月の継続: 3 暦月以上たった人だけを分母にし、3 回以上払った人を数える', () => {
  const asOf = at('2027-04-01T00:00:00Z');
  const rows = [
    ...many(3, () => sub('card', '2027-01-01T00:00:00Z', 3, '2027-04-01T00:00:00Z')), // 3 回払ってやめた → 続いた側
    ...many(2, () => sub('card', '2027-01-01T00:00:00Z', 2, '2027-03-01T00:00:00Z')), // 2 回でやめた
    ...many(4, () => sub('card', '2027-02-15T00:00:00Z', 2)), // まだ 3 か月たっていない → 分母に入らない
  ];
  const card = cohortChurn(rows, asOf).arms.card;
  assert.equal(card.eligibleFor3Months, 5);
  assert.equal(card.retained3Months, 3);
  close(card.retention3Months, 0.6, '3 か月の継続');
});

void test('5 人未満の組は、数を返さず、判定もしない', () => {
  const rows = [...many(4, () => sub('esim', '2027-01-01T00:00:00Z', 5)), ...many(200, () => sub('card', '2026-01-01T00:00:00Z', 12))];
  const report = cohortChurn(rows, at('2027-06-01T00:00:00Z'));
  assert.equal(report.arms.esim.shown, false);
  assert.equal(report.arms.esim.people, null);
  assert.equal(report.arms.esim.monthlyChurn, null);
  assert.equal(report.arms.card.shown, true);
  assert.equal(report.verdict, 'insufficient');
});

void test('試行が 100 未満の組がある間は insufficient', () => {
  const rows = [...many(20, () => sub('esim', '2027-01-01T00:00:00Z', 3)), ...many(20, () => sub('card', '2027-01-01T00:00:00Z', 3, '2027-04-01T00:00:00Z'))];
  assert.equal(cohortChurn(rows, at('2027-06-01T00:00:00Z')).verdict, 'insufficient');
});

// 400 回の試行のうち、eSIM は 8 回・カードは 30 回やめた（幅は重ならない）。
const arm = (name, cancels, trials) => [
  ...many(cancels, () => sub(name, '2026-01-01T00:00:00Z', 1, '2026-02-01T00:00:00Z')),
  ...many(1, () => sub(name, '2026-01-01T00:00:00Z', trials - cancels + 1)),
];

void test('幅が重ならない時だけ、低い方を言う', () => {
  const asOf = at('2027-12-01T00:00:00Z');
  const lower = cohortChurn([...arm('esim', 8, 400), ...arm('card', 30, 400)], asOf);
  assert.equal(lower.arms.esim.trials, 400);
  assert.equal(lower.arms.card.trials, 400);
  assert.equal(lower.verdict, 'esim_lower');
  assert.equal(cohortChurn([...arm('esim', 30, 400), ...arm('card', 8, 400)], asOf).verdict, 'card_lower');
});

void test('幅が重なる時は unclear（言い切らない）', () => {
  const report = cohortChurn([...arm('esim', 20, 400), ...arm('card', 26, 400)], at('2027-12-01T00:00:00Z'));
  assert.ok(report.arms.esim.monthlyChurnCi.high >= report.arms.card.monthlyChurnCi.low);
  assert.equal(report.verdict, 'unclear');
});

void test('asOf より後に始まった契約は数えない', () => {
  const rows = [...many(5, () => sub('esim', '2027-01-01T00:00:00Z', 2)), sub('esim', '2027-09-01T00:00:00Z', 1)];
  assert.equal(cohortChurn(rows, at('2027-06-01T00:00:00Z')).arms.esim.people, 5);
});

void test('おかしな行は受けない', () => {
  const asOf = at('2027-06-01T00:00:00Z');
  assert.throws(() => cohortChurn([sub('app', '2027-01-01T00:00:00Z', 1)], asOf), RangeError);
  assert.throws(() => cohortChurn([sub('esim', '2027-01-01T00:00:00Z', 0)], asOf), RangeError);
  assert.throws(() => cohortChurn([sub('esim', '2027-01-01T00:00:00Z', 1.5)], asOf), RangeError);
  assert.throws(() => cohortChurn([sub('esim', '2027-03-01T00:00:00Z', 1, '2027-02-01T00:00:00Z')], asOf), RangeError);
});

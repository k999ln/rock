// 自社クラウドの従量の実費と、黒殿へ移す引き金（task 101 の 1・task 105 の 1）。
// 仕様: docs/compute-placement.md の 3 章（数字と ±1% で合うこと）・4 章（引き金）。
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CLOUD_PRICES_2026_11_21, cloudMonthlyCost, cloudTrigger, cloudUsageCostUsd, containerUsage, utcMonth,
} from '../lib/cloud-cost.ts';

const at = (iso) => Date.parse(iso);
const near = (actual, expected, label) => assert.ok(Math.abs(actual - expected) <= Math.abs(expected) * 0.01, `${label}: ${actual} は ${expected} の ±1% に入らない`);
const model = (iso, name, inputTokens, outputTokens) => ({ kind: 'model', at: at(iso), model: name, inputTokens, outputTokens });

test('3.1 の 1 回あたりの数字と ±1% で合う', () => {
  const t = at('2026-11-21T00:00:00Z');
  near(cloudUsageCostUsd(containerUsage('basic', 60, t)), 0.00047, 'basic を 60 秒');
  near(cloudUsageCostUsd(model('2026-11-21T00:00:00Z', 'qwen3-30b-a3b-fp8', 3000, 1000)), 0.00049, 'qwen3 3,000/1,000');
  near(cloudUsageCostUsd(model('2026-11-21T00:00:00Z', 'kimi-k2.6', 32000, 2048)), 0.0386, 'kimi-k2.6 32,000/2,048');
  near(cloudUsageCostUsd(containerUsage('basic', 30 * 86400, t, 0.05)), 7.85, '常駐 basic 30 日・CPU 5%');
});

test('3.2 の人数ごとの月額（300 人・1 日 10 回・ふつうの仕事）と ±1% で合う', () => {
  const runs = 300 * 10 * 30, t = at('2026-11-10T00:00:00Z');
  const one = cloudUsageCostUsd(containerUsage('basic', 60, t)) + cloudUsageCostUsd(model('2026-11-10T00:00:00Z', 'qwen3-30b-a3b-fp8', 3000, 1000));
  near(one * runs, 86, '300 人の月額');
});

test('値段の無いモデルは 0 円にせず、数えない（unpriced）', () => {
  assert.equal(cloudUsageCostUsd(model('2026-11-01T00:00:00Z', 'unknown-model', 1000, 1000)), null);
  const [month] = cloudMonthlyCost([model('2026-11-01T00:00:00Z', 'unknown-model', 1e6, 1e6), model('2026-11-02T00:00:00Z', 'gpt-oss-20b', 1e6, 0)]);
  assert.equal(month.unpriced, 1);
  assert.equal(month.records, 2);
  assert.equal(month.modelsUsd, 0.2);
});

test('料金表の版は名前で固定されている', () => {
  assert.equal(CLOUD_PRICES_2026_11_21.version, 'cloud-prices/2026-11-21');
  assert.equal(cloudUsageCostUsd(model('2026-11-01T00:00:00Z', 'toString', 1, 1)), null, 'Object の持ち物の名前を、値段として読まない');
});

test('月は UTC の暦月で分け、昇順に並ぶ', () => {
  assert.equal(utcMonth(at('2026-11-30T23:59:59Z')), '2026-11');
  assert.equal(utcMonth(at('2026-12-01T00:00:00Z')), '2026-12');
  const months = cloudMonthlyCost([
    containerUsage('standard-2', 100, at('2026-12-01T00:00:00Z')),
    containerUsage('standard-2', 100, at('2026-11-15T00:00:00Z')),
  ]);
  assert.deepEqual(months.map(m => m.month), ['2026-11', '2026-12']);
  assert.equal(months[0].containersUsd, months[1].containersUsd);
});

const month = (name, totalUsd, unpriced = 0) => ({ month: name, containersUsd: totalUsd, modelsUsd: 0, totalUsd, unpriced, records: 1 });

test('引き金: 終わった月で 2 か月続けて $190 を超えたら、移し始める', () => {
  const now = at('2027-03-05T00:00:00Z');
  const state = cloudTrigger([month('2027-01', 200), month('2027-02', 250), month('2027-03', 999)], now);
  assert.equal(state.triggered, true);
  assert.equal(state.reason, 'triggered');
  assert.equal(state.lastCompleteMonth, '2027-02');
});

test('引き金: 今の月は、超えていても数えない', () => {
  const state = cloudTrigger([month('2027-02', 250), month('2027-03', 999)], at('2027-03-05T00:00:00Z'));
  assert.equal(state.triggered, false);
  assert.equal(state.streak, 1);
});

test('引き金: 記録の無い月は 0 として数え、続きを切る', () => {
  const state = cloudTrigger([month('2026-12', 300), month('2027-02', 300)], at('2027-03-05T00:00:00Z'));
  assert.equal(state.triggered, false);
  assert.equal(state.streak, 1);
  assert.equal(state.reason, 'below_threshold');
});

test('引き金: ちょうど $190 は「超えた」にしない', () => {
  assert.equal(cloudTrigger([month('2027-01', 190), month('2027-02', 190)], at('2027-03-05T00:00:00Z')).triggered, false);
});

test('引き金: 値段の無い使用がある月は、下限で超えていれば数え、超えていなければ切る', () => {
  const now = at('2027-03-05T00:00:00Z');
  assert.equal(cloudTrigger([month('2027-01', 200, 3), month('2027-02', 201, 1)], now).triggered, true);
  const unsure = cloudTrigger([month('2027-01', 200), month('2027-02', 150, 2)], now);
  assert.equal(unsure.triggered, false);
  assert.equal(unsure.reason, 'unpriced_below_threshold');
});

test('引き金: 記録が無い・今の月だけの時は、判定しない', () => {
  assert.equal(cloudTrigger([], at('2027-03-05T00:00:00Z')).reason, 'no_complete_month');
  assert.equal(cloudTrigger([month('2027-03', 999)], at('2027-03-05T00:00:00Z')).reason, 'no_complete_month');
});

test('引き金: しきい値と月の数は変えられる', () => {
  const now = at('2027-03-05T00:00:00Z');
  assert.equal(cloudTrigger([month('2027-02', 60)], now, { thresholdUsd: 50, consecutive: 1 }).triggered, true);
  assert.throws(() => cloudTrigger([], now, { consecutive: 0 }), RangeError);
});

test('負の数・有限でない数・知らない型は受けない', () => {
  const t = at('2026-11-01T00:00:00Z');
  assert.throws(() => containerUsage('basic', -1, t), RangeError);
  assert.throws(() => containerUsage('basic', 10, t, 1.5), RangeError);
  assert.throws(() => containerUsage('huge', 10, t), RangeError);
  assert.throws(() => cloudUsageCostUsd({ kind: 'container', at: t, vcpuSeconds: Number.NaN, gibSeconds: 0, gbSeconds: 0 }), RangeError);
  assert.throws(() => cloudUsageCostUsd({ kind: 'model', at: t, model: 'gpt-oss-20b', inputTokens: -5, outputTokens: 0 }), RangeError);
  assert.throws(() => cloudUsageCostUsd({ kind: 'gpu', at: t }), RangeError);
});
